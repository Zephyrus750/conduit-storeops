// Practice mode: a sandbox store for new starters. The real screens run
// against a store of their own, seeded with sample data, and nothing of it
// reaches the worker or the real store on this device. Kept apart by
// construction, not by checks in the views:
//
//   the store       createStore() as usual, with practiceTransport() in place
//                   of the worker: a local stand-in that judges each event the
//                   way the worker does (the area, the tool, the role, then the
//                   shared reducers) and keeps the log in this device's storage.
//                   It never calls fetch and opens no socket.
//   the storage     practiceStorage(): the same device storage under its own
//                   prefix (practice:), so the store's snapshot, outbox and the
//                   views' device data (a pasted report) never touch the real
//                   store's keys. wipePractice() clears the prefix when practice ends.
//   the worker      practiceRefusal() classifies every other call the app makes
//                   while practice is on (the client's transport gate): a write
//                   is refused, a read of the store's data is refused, and only
//                   the session's own calls, the map, the catalogue and the
//                   resource library go through.
//
// The sample data is a fixed script of real events (practiceEvents) folded
// through the shared validation and reducers (practiceSeed), so it is always
// a state the app can show; the store's own published map, as cached on this
// device, gives it real shelves.
//
// Shared reducers stay pure: nothing here is in shared/.

import { initialState, apply } from '../shared/reducers.js';
import { validateEvent } from '../shared/validate.js';
import { typeInfo } from '../shared/catalogue.js';
import { ulid } from '../shared/ulid.js';
import { primaryRole } from '../shared/roles.js';
import { toolForEvent, toolOff } from '../shared/tools.js';
import { settingsOf } from '../shared/reducers/store.js';
import { storeDay, storeIso, storeParts, addDays, DEFAULT_TZ } from '../shared/time.js';
import { createStore } from './store.js';
import { TransportError } from './transport.js';

export const PRACTICE_PREFIX = 'practice:';
const WORKER_KEY = 'worker';
const LOG_KEEP = 5000;

// ── storage ───────────────────────────────────────────────────────────
// The device's storage seen through the practice prefix: get('snap:1241')
// reads practice:snap:1241. list() answers with the keys as the caller wrote them.
export function practiceStorage(storage, prefix = PRACTICE_PREFIX) {
  const P = k => prefix + k;
  return {
    get: k => storage.get(P(k)),
    set: (k, v) => storage.set(P(k), v),
    del: k => storage.del(P(k)),
    has: k => (storage.has ? storage.has(P(k)) : storage.get(P(k)).then(v => v !== undefined)),
    count: p => (storage.count ? storage.count(P(p)) : storage.list(P(p)).then(r => r.length)),
    list: async p => (await storage.list(P(p))).map(r => ({ key: r.key.slice(prefix.length), value: r.value })),
    prefix,
  };
}
// Everything practice kept on this device goes; the real store's keys are
// never under the prefix, so they stay exactly as they were.
export async function wipePractice(storage, prefix = PRACTICE_PREFIX) {
  const rows = await storage.list(prefix);
  for (const r of rows) await storage.del(r.key);
  return rows.length;
}

// ── the worker's stand-in ─────────────────────────────────────────────
// What the session holds, as the worker reads it from the token.
const claimsOf = cur => ({ store: cur?.store ? String(cur.store) : null, roles: cur?.roles || [], caps: cur?.caps || [], owner: !!cur?.owner, actas: !!cur?.actas });
const hasRole = (c, roles) => c.roles.includes('manager') || c.actas || roles.some(r => c.roles.includes(r));

// The routes the store object uses (events, changes, hb, snapshot), answered
// on the device from the practice log. Anything else is not in practice.
export function practiceTransport({ storage, session, now = () => Date.now() }) {
  let w = null, saving = Promise.resolve();
  const ready = storage.get(WORKER_KEY).then(v => { w = v || null; });
  const save = () => (saving = saving.then(() => storage.set(WORKER_KEY, w)).catch(() => {}));
  function judge(raw, c) {
    const bad = validateEvent(raw); if (bad) return bad;
    if (String(raw.store) !== c.store) return { code: 'unauthorised', message: 'event is for another store' };
    const info = typeInfo(raw.type);
    if (info.area !== 'store' && !c.caps.includes(info.area)) return { code: 'not_entitled', message: `store is not entitled to ${info.area}` };
    const tool = toolForEvent(raw.type); if (tool && toolOff(w.state.tools?.off, tool)) return { code: 'tool_off', message: `${tool.name} is switched off for this store` };
    if (!hasRole(c, info.roles)) return { code: 'unauthorised', message: `${raw.type} needs ${info.roles.join(' or ')}` };
    return null;
  }
  async function request(path, { method = 'GET', body } = {}) {
    await ready;
    if (!w) throw new TransportError(423, 'practice', 'practice has ended on this device');
    const m = /^\/v1\/store\/([^/?]+)\/(events|changes|hb|snapshot)(?:\?(.*))?$/.exec(String(path));
    if (!m) throw new TransportError(423, 'practice', `${path} is not part of practice`);
    const route = m[2];
    if (route === 'hb') return { ok: true, now: now() };
    if (route === 'snapshot') return { seq: w.seq, state: structuredClone(w.state), now: now() };
    if (route === 'changes') {
      const since = Number(new URLSearchParams(m[3] || '').get('since') || 0);
      return { seq: w.seq, events: w.log.filter(e => e.seq > since).map(e => structuredClone(e)), now: now() };
    }
    if (method !== 'POST' || !Array.isArray(body?.events)) throw new TransportError(400, 'invalid_request', 'events is a list');
    const cur = session.current, c = claimsOf(cur), results = [];
    for (const raw of body.events) {
      const id = raw?.id, dup = w.log.find(e => e.id === id);
      if (dup) { results.push({ id, ok: true, seq: dup.seq, duplicate: true }); continue; }
      const no = judge(raw, c); if (no) { results.push({ id, ok: false, ...no }); continue; }
      const info = typeInfo(raw.type), seq = w.seq + 1;
      const event = { id, store: raw.store, area: info.area, type: raw.type, entity: raw.entity, payload: raw.payload ?? {}, actor: { role: primaryRole({ roles: c.roles, actor: c.actas ? 'owner' : null }, info.roles), device: session.device, owner: c.owner }, at: raw.at, v: info.v };
      const rej = apply(w.state, { ...event, seq });
      if (rej) { results.push({ id, ok: false, ...rej }); continue; }
      w.seq = seq; w.log.push({ ...event, seq }); if (w.log.length > LOG_KEEP) w.log.splice(0, w.log.length - LOG_KEEP);
      results.push({ id, ok: true, seq });
    }
    await save();
    return { results, now: now() };
  }
  return { request, base: 'practice:', wsBase: null };
}

// The session as the practice store sees it: the same person and roles, and
// a token that never needs the network to renew.
export function practiceSession(session) {
  return {
    get current() { return session.current; },
    get device() { return session.device; },
    app: session.app,
    token: async () => (session.current ? 'practice' : null),
    refresh: async () => session.current,
    unauthorised() {},
    on: (k, f) => session.on(k, f),
  };
}

// The practice store for a store number: the one this device already holds
// (a reload mid-practice resumes it), else a fresh one from seed(), which
// returns { seq, state, device } (practiceSeed). { store, fresh }.
export async function openPracticeStore({ storeNo, session, storage, seed, timers = globalThis }) {
  const no = String(storeNo), ps = practiceStorage(storage);
  let fresh = false;
  if (!(await ps.get(WORKER_KEY))) {
    const s = await seed();
    await ps.set(WORKER_KEY, { seq: s.seq, state: structuredClone(s.state), log: [] });
    await ps.set(`snap:${no}`, { seq: s.seq, state: structuredClone(s.state) });
    for (const [k, v] of Object.entries(s.device || {})) await ps.set(k, v);
    fresh = true;
  }
  const transport = practiceTransport({ storage: ps, session });
  const store = createStore({ storeNo: no, session: practiceSession(session), transport, storage: ps, WebSocketImpl: null, timers, online: () => true });
  await store.load();
  store.connect();
  return { store, fresh, storage: ps };
}

// ── the gate on the worker ────────────────────────────────────────────
// While practice is on, what may still go to the worker: the session's own
// calls that keep this sign-in working (renewal, the opening check, the idle
// re-lock, a crew code, and the owner's act-as token renewed), and reads that
// hold none of the store's data: the published map and its plans, the product
// catalogue, the resource library, the list of stores. Returns null (it
// goes), 'write' or 'read' (refused).
const SESSION_CALLS = /^\/v1\/(auth\/(refresh|check|lock|unlock)|admin\/actas\/[^/?]+)$/;
const OPEN_READS = [/^\/v1\/catalogue(\/|\?|$)/, /^\/v1\/store\/[^/?]+\/(map|plan)(\/|\?|$)/, /^\/v1\/resources(\/|\?|$)/, /^\/v1\/stores$/];
export function practiceRefusal(path, { method = 'GET' } = {}) {
  const p = String(path || ''), verb = String(method || 'GET').toUpperCase();
  if (SESSION_CALLS.test(p) && verb === 'POST') return null;
  if (verb !== 'GET' && verb !== 'HEAD') return 'write';
  return OPEN_READS.some(re => re.test(p)) ? null : 'read';
}

// ── the sample store ──────────────────────────────────────────────────
// The shelves of a published map document, read from its SVG text:
// [{ full: 'A11 S1', shelf: 'A11', dept: 'h1', floor, x, y }] (x, y the
// shelf's centre, null when it is not a plain rectangle or circle).
export function shelvesOf(doc) {
  const out = [], seen = new Set();
  for (const f of doc?.floors || []) {
    const svg = String(f?.svg || '');
    for (const m of svg.matchAll(/<g\b([^>]*\bclass="shelf-group\b[^"]*"[^>]*)>\s*(?:<(rect|circle)\b([^>]*)>)?/g)) {
      const a = attrs(m[1]); if ('data-inactive' in a) continue;
      const shelf = (a['data-shelf'] || '').trim(); if (!shelf || shelf.startsWith('_u')) continue;
      const full = (a['data-full'] || `${shelf} ${a['data-subname'] || ''}`).trim().toUpperCase().replace(/\s+/g, ' ');
      if (seen.has(full)) continue; seen.add(full);
      const r = m[2] ? attrs(m[3]) : {}, n = k => Number(r[k]);
      const [x, y] = m[2] === 'circle' ? [n('cx'), n('cy')] : [n('x') + n('width') / 2, n('y') + n('height') / 2];
      out.push({ full, shelf: shelf.toUpperCase(), dept: (a['data-dept'] || '').toLowerCase(), floor: f.id || null, x: Number.isFinite(x) ? Math.round(x * 10) / 10 : null, y: Number.isFinite(y) ? Math.round(y * 10) / 10 : null });
    }
  }
  return out.sort((p, q) => p.full.localeCompare(q.full, 'en', { numeric: true }));
}
function attrs(s) { const o = {}; for (const m of String(s).matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) o[m[1]] = m[2] ?? ''; return o; }
// A shelf's code as the views key a refresh mark (js/map.js canonCode): "A16 S1" → "A16S1".
const canon = code => String(code || '').toUpperCase().replace(/[\s\-_.]+/g, '').replace(/([A-Z])0+(?=\d)/g, '$1');

// The store week a moment falls in, Monday first, as the views name it (2026-W46).
export function practiceWeek(now, tz = DEFAULT_TZ) {
  const { y, m, d } = storeParts(now, tz), x = new Date(Date.UTC(y, m - 1, d));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

// Keycodes the store sells, for the sample bays, cages, pulls and adjustments.
const KC = ['42977636', '43302210', '43166022', '43307685', '43199310', '110148905', '43702208', '43402871', '43350142', '43815540', '43702215', '42977686', '43198853', '43648803', '43615502', '43521177', '43339981', '43226605'];
// The other devices of the sample store (their changes are already in its log).
const DEV = { floor: 'floor-phone', stockroom: 'stockroom-phone', dock: 'dock-tablet', office: 'office-pc' };
const SKIP_DEPTS = new Set(['stockroom', 'checkouts', 'flex', '']);

// The script: the store's own set-up first (its settings, tools, areas and
// map version, as this device last saw them), then a morning's work in the
// areas this device can open. Times run back from `now` on the store's clock.
//   storeNo  the store       now   ms          areas  the session's caps
//   real     the real store's last snapshot on this device (or null)
//   map      the published map document cached on this device (or null)
export function practiceEvents({ storeNo, now = Date.now(), areas = ['floor'], real = null, map = null } = {}) {
  const no = String(storeNo), cfg = settingsOf(real), tz = cfg.tz || DEFAULT_TZ;
  const day = storeDay(now, tz), week = practiceWeek(now, tz), on = new Set(areas);
  const out = [];
  let tick = 0;
  // Each event a little after the last, in order, ending a minute before now.
  const ev = (type, entity, payload, { minsAgo, role, device, owner = false }) => {
    const info = typeInfo(type);
    out.push({ id: ulid(), store: no, area: info.area, type, entity, payload, at: storeIso(new Date(now - minsAgo * 60_000 + (tick++) * 1000), tz), v: info.v, actor: { role, device, owner } });
  };
  const office = { role: 'manager', device: DEV.office };

  // ── the store's set-up ──
  const rs = real?.settings || {}, set = {};
  for (const k of ['tz', 'dockGrid', 'minsPerCarton', 'autoLockMins', 'deptRanges']) if (rs[k] != null) set[k] = rs[k];
  if (Object.keys(set).length) ev('store.settings.set', {}, set, { minsAgo: 600, ...office });
  const off = real?.tools?.off || [];
  if (off.length) ev('store.tools.set', {}, { off: [...off] }, { minsAgo: 600, ...office, owner: true });
  if (Array.isArray(real?.areas?.on)) ev('store.areas.set', {}, { on: [...real.areas.on] }, { minsAgo: 600, ...office, owner: true });
  const version = map?.version || real?.map?.version || null;
  if (version) ev('map.publish', { version: String(version) }, {}, { minsAgo: 600, ...office });
  ev('team.message.set', {}, { text: 'Truck 1 is on the dock. Toys and party backfill first, then the requested bays.', until: day }, { minsAgo: 300, ...office });

  // ── the floor ──
  const shelves = shelvesOf(map), floor = { role: 'floor', device: DEV.floor };
  const byDept = {};
  for (const s of shelves) if (!SKIP_DEPTS.has(s.dept)) (byDept[s.dept] ||= []).push(s);
  const focus = Object.keys(byDept).sort((a, b) => byDept[b].length - byDept[a].length || a.localeCompare(b)).slice(0, 2);
  if (focus.length) ev('refresh.focus.set', { week }, { departments: focus }, { minsAgo: 290, ...office });
  // About a third of the focus departments refreshed, and a few shelves outside them.
  const marked = [...focus.flatMap(d => byDept[d].filter((_, i) => i % 3 === 0).slice(0, 24)), ...Object.keys(byDept).filter(d => !focus.includes(d)).slice(0, 6).map(d => byDept[d][0])];
  marked.forEach((s, i) => ev('refresh.mark', { segment: canon(s.full), week }, { dept: s.dept }, { minsAgo: 240 - i * 3, ...floor }));
  // Four faults on the map: two open, one waiting for a check, one done.
  const placed = shelves.filter(s => s.x != null && !SKIP_DEPTS.has(s.dept)), at = f => placed[Math.floor(placed.length * f)];
  const issues = [
    [0.12, 'light', 2, 'Flickering light over the aisle', 'Two tubes flicker; worse in the afternoon.', 'open'],
    [0.38, 'fixture', 1, 'Shelf strip loose on the bottom shelf', 'Ticket strip comes away when stock is pulled forward.', 'open'],
    [0.63, 'leak', 3, 'Water dripping from a ceiling tile', 'Bucket placed. Stock moved to the next shelf.', 'progress'],
    [0.86, 'door', 1, 'Fitting room door sticks', '', 'completed'],
  ];
  issues.forEach(([f, cat, sev, title, note, status], i) => {
    const s = at(f), id = ulid(), when = 280 - i * 40;
    ev('issue.log', { issue: id }, { cat, title, note, sev, loc: s ? s.full : '', dept: s?.dept || null, x: s ? s.x : null, y: s ? s.y : null, floor: s?.floor || null }, { minsAgo: when, ...floor });
    if (status !== 'open') ev('issue.progress', { issue: id }, { note: 'Contractor attended.' }, { minsAgo: when - 20, ...office });
    if (status === 'completed') ev('issue.close', { issue: id }, {}, { minsAgo: when - 25, ...office });
  });
  ev('equip.add', { equip: ulid() }, { code: 'LAD-01', kind: 'ladder', name: 'Platform ladder, 3 step', every: 3, last: addDays(day, -100) }, { minsAgo: 500, ...office });
  ev('equip.add', { equip: ulid() }, { code: 'TRL-04', kind: 'trolley', name: 'Cage trolley', every: 3, last: addDays(day, -20) }, { minsAgo: 500, ...office });

  // ── the stockroom ──
  const subs = [];
  if (on.has('stockroom')) {
    const sr = { role: 'stockroom', device: DEV.stockroom };
    // The morning report (each bay's list) and what the phones scanned against it.
    const report = { 7004: KC.slice(0, 4), 7012: [...KC.slice(4, 8), KC[9]], 7014: KC.slice(10, 13), 7031: KC.slice(13, 16), 7037: KC.slice(16, 18), 7040: [KC[2], KC[6]] };
    const scans = [['7004', KC.slice(0, 4), 'submitted'], ['7012', [...KC.slice(4, 8), KC[8]], 'pending'], ['7014', KC.slice(10, 13), 'pending'], ['7031', KC.slice(13, 15), 'corrected']];
    ev('backfill.report.publish', { date: day }, { at: now - 150 * 60_000, bays: Object.keys(report).length, codes: Object.values(report).flat().length }, { minsAgo: 150, ...office, role: 'stockroom' });
    for (const bay of ['7037', '7040']) ev('submission.request', { bay, date: day }, {}, { minsAgo: 148, ...office, role: 'stockroom' });
    scans.forEach(([bay, codes, status], i) => {
      const when = 140 - i * 25;
      codes.forEach((kc, k) => ev('submission.update', { bay, date: day }, { codes: { [kc]: true }, ...(k === codes.length - 1 ? { sent: true } : {}) }, { minsAgo: when - k, ...sr }));
      if (status !== 'pending') ev('submission.ready', { bay, date: day }, { system: report[bay] }, { minsAgo: when - 10, ...office, role: 'stockroom' });
      if (status === 'submitted') ev('submission.submit', { bay, date: day }, {}, { minsAgo: when - 12, ...office, role: 'stockroom' });
    });
    subs.push(report);
    ev('adjustment.set', { keycode: KC[8], date: day }, { qty: -3, location: '7012', confirmed: false, source: 'report' }, { minsAgo: 149, ...office, role: 'stockroom' });
    ev('adjustment.set', { keycode: KC[14], date: day }, { qty: -1, location: '7031', confirmed: false, source: 'report' }, { minsAgo: 149, ...office, role: 'stockroom' });
    // Two cages: overstock parked by the dock doors, new lines still filling.
    ev('cage.create', { cage: 'CG104' }, { ring: 'overstock' }, { minsAgo: 200, ...sr });
    [[KC[1], 6], [KC[4], 4], [KC[11], 12]].forEach(([kc, qty], i) => ev('cage.scan', { cage: 'CG104' }, { keycode: kc, qty }, { minsAgo: 198 - i, ...sr }));
    ev('cage.park', { cage: 'CG104' }, { location: 'BOH A3' }, { minsAgo: 190, ...sr });
    ev('cage.create', { cage: 'CG117' }, { ring: 'new-lines' }, { minsAgo: 60, ...sr });
    [[KC[6], 8], [KC[7], 3]].forEach(([kc, qty], i) => ev('cage.scan', { cage: 'CG117' }, { keycode: kc, qty }, { minsAgo: 58 - i, ...sr }));
  }

  // ── a live pull: the floor asks, the stockroom pulls ──
  const pullDept = focus[0] || 'k1', session = ulid(), lines = [[KC[1], '7012', 2], [KC[4], '7012', 4], [KC[12], '7014', 1]];
  ev('pull.session.start', { session }, { name: 'Morning top-up', dept: pullDept, part: 'req' }, { minsAgo: 45, ...floor });
  const lineIds = lines.map(([kc, bay, qty], i) => { const line = ulid(); ev('pull.request', { session, line }, { kc, bays: [bay], qty, ...(marked[i] ? { shelf: marked[i].full } : {}) }, { minsAgo: 43 - i * 2, ...floor }); return line; });
  if (on.has('stockroom')) {
    const sr = { role: 'stockroom', device: DEV.stockroom };
    ev('pull.zone.set', { session }, { bays: ['7000-7059'] }, { minsAgo: 38, ...sr });
    ev('pull.mark', { session, line: lineIds[0] }, { st: 'pulled', got: { 7012: 2 } }, { minsAgo: 35, ...sr });
  }

  // ── the back dock: truck 1 live, pallets down, two being decanted ──
  if (on.has('backdock')) {
    const dk = { role: 'dock', device: DEV.dock }, truck = `${day}-T1`, team = [{ pid: 'D4' }, { pid: 'D7' }, { pid: 'D9' }];
    const consols = Array.from({ length: 10 }, (_, i) => { const id = String(601930100 + i * 7), items = [0, 1, 2].slice(0, 1 + (i % 3)).map(k => ({ k: KC[(i + k) % KC.length], q: 6 + ((i * 5 + k * 3) % 24), c: 2 + ((i + k) % 3) })); return { id, cons: '093008012' + id, cartons: items.reduce((n, x) => n + x.c, 0), items }; });
    const t0 = 95, grid = cfg.dockGrid || { rows: 4, cols: 7 }, rows = 'ABCDEFGH'.slice(0, grid.rows);
    const bays = [...rows].flatMap(r => Array.from({ length: grid.cols }, (_, c) => r + (c + 1))).slice(0, 5);
    ev('plan.set', { date: day, slot: 1 }, { eta: '06:00', team }, { minsAgo: 400, ...dk });
    ev('truck.create', { truck }, { landedAt: storeIso(new Date(now - t0 * 60_000), tz) }, { minsAgo: t0, ...dk });
    ev('truck.setLive', { truck }, {}, { minsAgo: t0, ...dk });
    ev('manifest.attach', { truck }, { manNo: '7040301', dcNo: '4101533', despatch: addDays(day, -1).split('-').reverse().join('/'), consols }, { minsAgo: t0 - 1, ...dk });
    ev('truck.team.set', { truck }, { team }, { minsAgo: t0 - 2, ...dk });
    bays.forEach((bay, i) => { const cs = consols.slice(i * 2, i * 2 + 2); ev('pallet.land', { truck, bay }, { ptype: i === 3 ? 'loscam' : i === 4 ? 'bulk' : 'chep', cartons: cs.reduce((n, c) => n + c.cartons, 0), consolIds: cs.map(c => c.id) }, { minsAgo: t0 - 5 - i * 4, ...dk }); });
    if (bays[0]) { ev('pallet.start', { truck, bay: bays[0] }, { pid: 'D4' }, { minsAgo: 70, ...dk }); ev('pallet.done', { truck, bay: bays[0] }, {}, { minsAgo: 52, ...dk }); }
    if (bays[1]) ev('pallet.start', { truck, bay: bays[1] }, { pid: 'D7' }, { minsAgo: 30, ...dk });
    if (bays[2]) ev('pallet.start', { truck, bay: bays[2] }, { pid: 'D4' }, { minsAgo: 50, ...dk });
  }

  // This device's copy of the morning report (Backfill review reads it from
  // device storage), the same revision the store's state names.
  const device = {};
  if (subs.length) {
    const byLoc = subs[0], soh = {};
    Object.values(byLoc).flat().forEach((kc, i) => { soh[kc] = [4, 0, 12, 2, -3, 7][i % 6]; });
    device[`simreport:${no}:${day}`] = { at: now - 150 * 60_000, byLoc, range: { from: '7000', to: '7059', n: Object.keys(byLoc).length }, delta: {}, bayAt: {}, soh, apn: {}, rev: 1 };
  }
  return { events: out, device, day, week, tz };
}

// The sample store's state: every scripted event validated and folded in
// order, as the worker would. { seq, state, device, events, rejected }:
// rejected lists any event the reducers refused (the tests keep it empty).
export function practiceSeed(opts) {
  const { events, device } = practiceEvents(opts);
  const state = initialState(), rejected = [];
  let seq = 0;
  for (const e of events) {
    const bad = validateEvent(e) || apply(state, { ...e, seq: seq + 1 });
    if (bad) { rejected.push({ type: e.type, entity: e.entity, ...bad }); continue; }
    seq += 1;
  }
  state.seq = seq;
  return { seq, state, device, events, rejected };
}
