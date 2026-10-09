// StoreClient: what a mode screen talks to.
//
//   store.get('backfill')                       the projection, right now
//   store.dispatch({ type, entity, payload })   validate, apply locally, queue, submit
//   store.on('backfill', render)                re-render when that projection changes
//   store.on('status' | 'reject' | '*', fn)
//
// Local state = the last server snapshot (base) with the outbox replayed on
// top, so optimism is automatic and a rejection rolls back by rebuilding
// without that event. One WebSocket per device with backoff and jitter;
// long-polling /changes when sockets are unavailable. Heartbeat every three
// minutes or on change. Everything persists through the storage adapter:
//   snap:<store>          { seq, state }
//   outbox:<store>:<id>   the queued event

import { initialState, apply, replay } from '../shared/reducers.js';
import { validateEvent } from '../shared/validate.js';
import { typeInfo } from '../shared/catalogue.js';
import { ulid } from '../shared/ulid.js';
import { TransportError, Breaker, backoffMs } from './transport.js';

export const HEARTBEAT_MS = 180_000;
export const POLL_MS = 15_000;
export const PERSIST_MS = 2_000;
const APPLIED_KEEP = 2000;

export function createStore({ storeNo, session, transport, storage, WebSocketImpl = globalThis.WebSocket, timers = globalThis, online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false) }) {
  const no = String(storeNo);
  const listeners = new Map();                 // key → Set(fn)
  let base = initialState();                   // server-confirmed projections
  let state = base;                            // base + outbox
  let pending = [];                            // queued events in order
  const applied = new Set();                   // event ids already folded into base
  const appliedOrder = [];
  let ws = null, wsAttempt = 0, wsTimer = null, pollTimer = null, hbTimer = null, closed = false, opening = false;
  let status = { state: 'offline', queued: 0, lastError: null, seq: 0 };
  const breaker = new Breaker();
  let flushing = null;

  // ── the store's clock (decision 31) ─────────────────────────────────────
  // Events are stamped on the worker's clock, not this device's: the worker
  // reports its time with each heartbeat and submit, and the offset (the
  // middle of the last five readings, each taken at the midpoint of its
  // round trip) corrects every new event's time. It is kept, so a device
  // that goes offline still stamps on the store's clock.
  let clockOffset = 0; const clockSamples = [];
  function noteClock(now, sentAt) {
    if (!Number.isFinite(now)) return;
    const recv = Date.now(); if (sentAt && recv - sentAt > 10_000) return;   // a slow round trip says little
    clockSamples.push(now - (sentAt ? (sentAt + recv) / 2 : recv)); if (clockSamples.length > 5) clockSamples.shift();
    const sorted = clockSamples.slice().sort((a, b) => a - b), off = Math.round(sorted[sorted.length >> 1]);
    if (off !== clockOffset) { clockOffset = off; storage.set(`clock:${no}`, { offset: off, at: recv }).catch?.(() => {}); emit('clock', off); }
  }
  const stamp = () => localIso(new Date(Date.now() + (Math.abs(clockOffset) >= 2000 ? clockOffset : 0)));

  // ── events out ────────────────────────────────────────────────────────
  // Iterate a snapshot: a listener may unsubscribe and resubscribe (a view
  // re-rendering), and a live Set would visit the new entry too, forever.
  const emit = (k, v) => { for (const f of [...(listeners.get(k) || [])]) { try { f(v); } catch (e) { console.error(e); } } };
  function on(k, f) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(f); return () => listeners.get(k).delete(f); }
  function setStatus(patch) { status = { ...status, ...patch, queued: pending.length, seq: base.seq }; emit('status', status); }
  function changed(keys) { for (const k of keys) emit(k, state[k]); emit('*', { keys, state }); }

  // ── state ─────────────────────────────────────────────────────────────
  function get(key) { return key ? state[key] : state; }
  // Each part of the state is turned to text once per rebuild and compared
  // with the text it had last time (not the old and new both, every time).
  const lastJson = {};
  function rebuild() {
    state = structuredClone(base);
    replay(state, pending);
    changed(Object.keys(state).filter(k => { const j = JSON.stringify(state[k]); if (j === lastJson[k]) return false; lastJson[k] = j; return true; }));
  }
  function remember(id) { applied.add(id); appliedOrder.push(id); if (appliedOrder.length > APPLIED_KEEP) applied.delete(appliedOrder.shift()); }
  // base.seq means "every event this device may read, up to here, is in
  // base". Events from the socket and /changes arrive in log order, so they
  // move it on (gaps are events this device may not read). One of our own
  // events acknowledged over HTTP can be far ahead of what we have seen, so
  // it is folded in but moves base.seq only when it is the very next one;
  // otherwise the events other devices logged in between would be skipped.
  // An event at or below base.seq is already in base (a poll that returns
  // after a snapshot replaced it) and is never applied twice.
  function foldIntoBase(events, { own = false } = {}) {
    let n = 0;
    for (const e of events) {
      const seq = typeof e.seq === 'number' ? e.seq : null;
      if (!own && seq != null && seq <= base.seq) { remember(e.id); continue; }
      if (!applied.has(e.id)) { apply(base, { ...e, seq: undefined }); remember(e.id); n += 1; }   // apply() would set base.seq itself
      if (seq != null && (own ? seq === base.seq + 1 : seq > base.seq)) base.seq = seq;
    }
    return n;
  }
  // The saved copy is written at most every PERSIST_MS, not per event: it is
  // only a head start (the worker has everything after its seq) and the
  // outbox is saved on its own, so a write skipped by a closed tab loses nothing.
  let persistTimer = null;
  function persistSnapshot() {
    if (!persistTimer) persistTimer = timers.setTimeout(persistNow, PERSIST_MS);
    return Promise.resolve();
  }
  async function persistNow() { timers.clearTimeout(persistTimer); persistTimer = null; try { await storage.set(`snap:${no}`, { seq: base.seq, state: base }); } catch {} }
  function replaceBase(seq, projections) {
    base = { ...initialState(), ...projections, seq };
    applied.clear(); appliedOrder.length = 0;
  }

  // ── open ──────────────────────────────────────────────────────────────
  async function load() {
    const snap = await storage.get(`snap:${no}`);
    if (snap?.state) base = { ...initialState(), ...snap.state, seq: snap.seq || 0 };
    const clk = await storage.get(`clock:${no}`); if (Number.isFinite(clk?.offset)) { clockOffset = clk.offset; clockSamples.push(clk.offset); }
    pending = (await storage.list(`outbox:${no}:`)).map(r => r.value).sort((a, b) => (a.id < b.id ? -1 : 1));
    rebuild(); setStatus({});
    return state;
  }

  // ── dispatch ──────────────────────────────────────────────────────────
  async function dispatch({ type, entity = {}, payload = {}, at }) {
    const info = typeInfo(type);
    const ev = { id: ulid(), store: no, area: info?.area, type, entity, payload, at: at || stamp(), v: info?.v ?? 1 };
    const bad = validateEvent(ev);
    if (bad) throw new TransportError(400, bad.code, bad.message, { event: ev });
    const probe = structuredClone(state);
    const rej = apply(probe, { ...ev, actor: { role: session.current?.roles?.[0] || null, device: session.device, owner: !!session.current?.owner } });
    if (rej) throw new TransportError(409, rej.code, rej.message, { event: ev });
    pending.push(ev);
    await storage.set(`outbox:${no}:${ev.id}`, ev);
    rebuild(); setStatus({});
    heartbeatSoon();
    flush();
    return ev;
  }

  // ── submit ────────────────────────────────────────────────────────────
  function flush() {
    if (flushing || !pending.length || closed) return flushing;
    flushing = (async () => {
      try {
        while (pending.length && !closed) {
          if (breaker.open || !online()) { setStatus({ state: online() ? status.state : 'offline' }); return; }
          const batch = pending.slice(0, 100);
          let results;
          try {
            if (ws && ws.readyState === 1) results = await submitOverSocket(batch);
            else { const sent = Date.now(), r = await transport.request(`/v1/store/${no}/events`, { method: 'POST', body: { events: batch }, token: await needToken() }); noteClock(r.now, sent); results = r.results; }
            breaker.succeed(); setStatus({ lastError: null });
          } catch (e) {
            if (e instanceof TransportError && e.status === 401) { session.unauthorised(); return; }
            breaker.fail(); setStatus({ lastError: e.message }); return;
          }
          await handleResults(batch, results);
        }
      } finally { flushing = null; }
    })();
    return flushing;
  }
  async function handleResults(batch, results) {
    const byId = new Map(results.map(r => [r.id, r]));
    const rejected = [];
    for (const ev of batch) {
      const r = byId.get(ev.id);
      if (!r) continue;
      pending = pending.filter(p => p.id !== ev.id);
      await storage.del(`outbox:${no}:${ev.id}`);
      if (r.ok) {
        // If the broadcast frame has not folded it in yet (HTTP path, or our own frame delayed), fold now.
        if (!applied.has(ev.id)) foldIntoBase([{ ...ev, seq: r.seq, actor: { role: session.current?.roles?.[0] || null, device: session.device, owner: !!session.current?.owner } }], { own: true });
      } else rejected.push({ ...r, event: ev });
    }
    rebuild(); await persistSnapshot(); setStatus({});
    for (const r of rejected) emit('reject', r);
  }
  const socketWaiters = [];
  function submitOverSocket(batch) {
    return new Promise((resolve, reject) => {
      const ids = new Set(batch.map(e => e.id));
      const t = timers.setTimeout(() => { socketWaiters.splice(socketWaiters.indexOf(w), 1); reject(new TransportError(0, 'network', 'socket submit timed out')); }, 10_000);
      const sent = Date.now();
      const w = (results, now) => { if (!results.some(r => ids.has(r.id))) return false; noteClock(now, sent); timers.clearTimeout(t); socketWaiters.splice(socketWaiters.indexOf(w), 1); resolve(results); return true; };
      socketWaiters.push(w);
      ws.send(JSON.stringify({ t: 'submit', events: batch }));
    });
  }
  async function needToken() { const t = await session.token(); if (!t) { session.unauthorised(); throw new TransportError(401, 'unauthorised', 'not signed in'); } return t; }

  // ── subscribe ─────────────────────────────────────────────────────────
  async function connect() {
    closed = false;
    if (!WebSocketImpl) return startPolling();
    if (ws || opening) return;                 // one socket: a second call while the token is fetched waits its turn
    setStatus({ state: 'connecting' });
    opening = true;
    let token; try { token = await session.token(); } finally { opening = false; }
    if (ws || closed) return;
    if (!token) { session.unauthorised(); return; }
    let sock;
    // The token travels as the second subprotocol, not in the URL.
    try { sock = new WebSocketImpl(`${transport.wsBase}/v1/store/${no}/ws`, ['conduit', token]); }
    catch { return scheduleReconnect(); }
    ws = sock;
    sock.onopen = () => { wsAttempt = 0; stopPolling(); sock.send(JSON.stringify({ t: 'hello', since: fullNext ? 0 : base.seq })); fullNext = false; heartbeat(); };
    sock.onmessage = (m) => onFrame(JSON.parse(m.data));
    sock.onclose = () => { if (ws === sock) ws = null; if (!closed) scheduleReconnect(); };
    sock.onerror = () => { try { sock.close(); } catch {} };
  }
  function scheduleReconnect() {
    wsAttempt += 1;
    setStatus({ state: online() ? 'connecting' : 'offline' });
    if (wsAttempt >= 3) startPolling();                       // sockets blocked: poll meanwhile, keep trying
    timers.clearTimeout(wsTimer);
    wsTimer = timers.setTimeout(() => { if (!closed) connect(); }, backoffMs(wsAttempt));
  }
  async function onFrame(f) {
    switch (f.t) {
      case 'snapshot': replaceBase(f.seq, f.state); rebuild(); await persistSnapshot(); setStatus({ state: 'live' }); flush(); return;
      case 'delta': foldIntoBase(f.events); rebuild(); await persistSnapshot(); setStatus({ state: 'live' }); flush(); return;
      case 'event': if (foldIntoBase([f.event])) { rebuild(); await persistSnapshot(); setStatus({}); } return;
      case 'ack': for (const w of [...socketWaiters]) if (w(f.results, f.now)) break; return;
      case 'clock': noteClock(f.now, hbSent); return;
      // An expired token is renewed (the session change reconnects); a
      // revoked or refused one is the end of the session.
      case 'error':
        if (f.code === 'expired') { session.refresh().catch(() => {}); return; }
        if (f.code === 'unauthorised' || f.code === 'revoked') session.unauthorised(); else setStatus({ lastError: f.message });
        return;
      default: return;
    }
  }
  function startPolling() {
    if (pollTimer) return;
    setStatus({ state: 'polling' });
    heartbeat();                       // sockets are down: keep reporting presence over HTTP
    const tick = async () => {
      if (closed) return;
      try {
        const sent = Date.now(), r = await transport.request(`/v1/store/${no}/changes?since=${base.seq}`, { token: await needToken() }); noteClock(r.now, sent);
        if (foldIntoBase(r.events)) { rebuild(); await persistSnapshot(); }
        setStatus({ state: ws ? status.state : 'polling', lastError: null }); flush();
      } catch (e) { if (e instanceof TransportError && e.status === 401) return session.unauthorised(); setStatus({ lastError: e.message, state: online() ? 'polling' : 'offline' }); }
      pollTimer = timers.setTimeout(tick, POLL_MS);
    };
    pollTimer = timers.setTimeout(tick, 0);
  }
  function stopPolling() { timers.clearTimeout(pollTimer); pollTimer = null; }
  async function resync() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'hello', since: 0 })); else if (!pollTimer) startPolling(); }

  // ── heartbeat ─────────────────────────────────────────────────────────
  function heartbeat() {
    timers.clearTimeout(hbTimer);
    const hb = { app: session.app, online: online(), outbox: pending.length, lastError: status.lastError, area: session.current?.roles?.join(',') || null };
    // A device that only listens never asks for its token, so the
    // heartbeat does: it renews ahead of expiry and the socket follows.
    if (ws && ws.readyState === 1) { hbSent = Date.now(); ws.send(JSON.stringify({ t: 'hb', ...hb })); session.token().catch(() => {}); }
    else if (online() && !closed) sendHbHttp(hb);          // polling fallback still reports presence
    hbTimer = timers.setTimeout(heartbeat, HEARTBEAT_MS);
  }
  // Best-effort presence when the socket is down (long-polling). A failed
  // heartbeat must never surface an error or trip the auth path, so this
  // swallows everything and never calls unauthorised().
  async function sendHbHttp(hb) {
    try { const token = await session.token(); if (token) { const sent = Date.now(), r = await transport.request(`/v1/store/${no}/hb`, { method: 'POST', body: hb, token }); noteClock(r?.now, sent); } } catch {}
  }
  let hbSoon = null, hbSent = 0;
  function heartbeatSoon() { timers.clearTimeout(hbSoon); hbSoon = timers.setTimeout(heartbeat, 1000); }

  // The socket carries the claims it was opened with. When the session
  // changes (an area unlocked, a refresh), reconnect so the next submit is
  // judged on the current roles rather than refused as unauthorised.
  // What the device may read follows its roles (the Stockroom and Back dock
  // need their codes), so when the roles change the next hello asks for a
  // whole snapshot: a delta would miss the newly opened area's past, and a
  // lost role must take its area off the device.
  let lastToken = null, lastRoles = session.current ? [(session.current.roles || []).join(','), (session.current.caps || []).join(',')].join('|') : null, fullNext = false;
  const offSession = session.on('change', snap => {
    // The areas a device reads follow its roles and the store's areas
    // (decision 19): a change in either asks for a whole snapshot.
    const roles = snap ? [(snap.roles || []).join(','), (snap.caps || []).join(',')].join('|') : null;
    const t = snap ? session.current?.expires + ':' + roles : null;
    if (t === lastToken) return;
    lastToken = t;
    if (lastRoles !== null && roles !== lastRoles) fullNext = true;
    lastRoles = roles;
    if (ws && !closed) { const s = ws; ws = null; try { s.close(); } catch {} wsAttempt = 0; connect(); }
    else if (fullNext && pollTimer && !closed) snapshotNow();
  });
  async function snapshotNow() {
    try { const r = await transport.request(`/v1/store/${no}/snapshot`, { token: await needToken() }); replaceBase(r.seq, r.state); fullNext = false; rebuild(); await persistSnapshot(); }
    catch (e) { setStatus({ lastError: e.message }); }
  }

  function close() {
    closed = true; offSession(); timers.clearTimeout(wsTimer); timers.clearTimeout(hbTimer); timers.clearTimeout(hbSoon); stopPolling();
    timers.clearTimeout(persistTimer); persistTimer = null;   // never written after close: sign-out has just deleted it
    if (ws) { const s = ws; ws = null; try { s.close(); } catch {} }
    setStatus({ state: 'offline' });
  }

  return { load, connect, close, resync, get, dispatch, flush, on, get status() { return status; }, get pending() { return pending.slice(); }, get seq() { return base.seq; }, get clockOffset() { return clockOffset; } };
}

// A time as this device's wall clock writes it, with its zone: 08:00 in
// Perth is "…T08:00:00+08:00". (It used to write the UTC time with the local
// zone, eight hours early in Perth; a UTC test machine hid it.)
export function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = n => String(Math.abs(n)).padStart(2, '0');
  return new Date(d.getTime() + off * 60000).toISOString().slice(0, 19) + sign + p(Math.floor(Math.abs(off) / 60)) + ':' + p(Math.abs(off) % 60);
}
