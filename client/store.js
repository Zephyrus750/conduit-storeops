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
const APPLIED_KEEP = 2000;

export function createStore({ storeNo, session, transport, storage, WebSocketImpl = globalThis.WebSocket, timers = globalThis, online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false) }) {
  const no = String(storeNo);
  const listeners = new Map();                 // key → Set(fn)
  let base = initialState();                   // server-confirmed projections
  let state = base;                            // base + outbox
  let pending = [];                            // queued events in order
  const applied = new Set();                   // event ids already folded into base
  const appliedOrder = [];
  let ws = null, wsAttempt = 0, wsTimer = null, pollTimer = null, hbTimer = null, closed = false;
  let status = { state: 'offline', queued: 0, lastError: null, seq: 0 };
  const breaker = new Breaker();
  let flushing = null;

  // ── events out ────────────────────────────────────────────────────────
  const emit = (k, v) => { for (const f of listeners.get(k) || []) { try { f(v); } catch (e) { console.error(e); } } };
  function on(k, f) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(f); return () => listeners.get(k).delete(f); }
  function setStatus(patch) { status = { ...status, ...patch, queued: pending.length, seq: base.seq }; emit('status', status); }
  function changed(keys) { for (const k of keys) emit(k, state[k]); emit('*', { keys, state }); }

  // ── state ─────────────────────────────────────────────────────────────
  function get(key) { return key ? state[key] : state; }
  function rebuild() {
    const before = state;
    state = structuredClone(base);
    replay(state, pending);
    changed(Object.keys(state).filter(k => before[k] !== state[k] && JSON.stringify(before[k]) !== JSON.stringify(state[k])));
  }
  function remember(id) { applied.add(id); appliedOrder.push(id); if (appliedOrder.length > APPLIED_KEEP) applied.delete(appliedOrder.shift()); }
  function foldIntoBase(events) {
    let n = 0;
    for (const e of events) {
      if (applied.has(e.id)) continue;
      apply(base, e); remember(e.id);
      if (typeof e.seq === 'number' && e.seq > base.seq) base.seq = e.seq;
      n += 1;
    }
    return n;
  }
  async function persistSnapshot() { await storage.set(`snap:${no}`, { seq: base.seq, state: base }); }
  function replaceBase(seq, projections) {
    base = { ...initialState(), ...projections, seq };
    applied.clear(); appliedOrder.length = 0;
  }

  // ── open ──────────────────────────────────────────────────────────────
  async function load() {
    const snap = await storage.get(`snap:${no}`);
    if (snap?.state) base = { ...initialState(), ...snap.state, seq: snap.seq || 0 };
    pending = (await storage.list(`outbox:${no}:`)).map(r => r.value).sort((a, b) => (a.id < b.id ? -1 : 1));
    rebuild(); setStatus({});
    return state;
  }

  // ── dispatch ──────────────────────────────────────────────────────────
  async function dispatch({ type, entity = {}, payload = {}, at }) {
    const info = typeInfo(type);
    const ev = { id: ulid(), store: no, area: info?.area, type, entity, payload, at: at || localIso(), v: info?.v ?? 1 };
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
            else results = (await transport.request(`/v1/store/${no}/events`, { method: 'POST', body: { events: batch }, token: await needToken() })).results;
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
        if (!applied.has(ev.id)) foldIntoBase([{ ...ev, seq: r.seq, actor: { role: session.current?.roles?.[0] || null, device: session.device, owner: !!session.current?.owner } }]);
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
      const w = (results) => { if (!results.some(r => ids.has(r.id))) return false; timers.clearTimeout(t); socketWaiters.splice(socketWaiters.indexOf(w), 1); resolve(results); return true; };
      socketWaiters.push(w);
      ws.send(JSON.stringify({ t: 'submit', events: batch }));
    });
  }
  async function needToken() { const t = await session.token(); if (!t) { session.unauthorised(); throw new TransportError(401, 'unauthorised', 'not signed in'); } return t; }

  // ── subscribe ─────────────────────────────────────────────────────────
  async function connect() {
    closed = false;
    if (!WebSocketImpl) return startPolling();
    if (ws) return;
    setStatus({ state: 'connecting' });
    const token = await session.token();
    if (!token) { session.unauthorised(); return; }
    let sock;
    try { sock = new WebSocketImpl(`${transport.wsBase}/v1/store/${no}/ws?token=${encodeURIComponent(token)}`); }
    catch { return scheduleReconnect(); }
    ws = sock;
    sock.onopen = () => { wsAttempt = 0; stopPolling(); sock.send(JSON.stringify({ t: 'hello', since: base.seq })); heartbeat(); };
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
      case 'ack': for (const w of [...socketWaiters]) if (w(f.results)) break; return;
      case 'error': if (f.code === 'unauthorised') session.unauthorised(); else setStatus({ lastError: f.message }); return;
      default: return;
    }
  }
  function startPolling() {
    if (pollTimer) return;
    setStatus({ state: 'polling' });
    const tick = async () => {
      if (closed) return;
      try {
        const r = await transport.request(`/v1/store/${no}/changes?since=${base.seq}`, { token: await needToken() });
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
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'hb', app: session.app, online: online(), outbox: pending.length, lastError: status.lastError, area: session.current?.roles?.join(',') || null }));
    hbTimer = timers.setTimeout(heartbeat, HEARTBEAT_MS);
  }
  let hbSoon = null;
  function heartbeatSoon() { timers.clearTimeout(hbSoon); hbSoon = timers.setTimeout(heartbeat, 1000); }

  function close() {
    closed = true; timers.clearTimeout(wsTimer); timers.clearTimeout(hbTimer); timers.clearTimeout(hbSoon); stopPolling();
    if (ws) { const s = ws; ws = null; try { s.close(); } catch {} }
    setStatus({ state: 'offline' });
  }

  return { load, connect, close, resync, get, dispatch, flush, on, get status() { return status; }, get pending() { return pending.slice(); }, get seq() { return base.seq; } };
}

function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = n => String(Math.abs(n)).padStart(2, '0');
  return d.toISOString().slice(0, 19).replace(/Z$/, '') + sign + p(Math.floor(Math.abs(off) / 60)) + ':' + p(Math.abs(off) % 60);
}
