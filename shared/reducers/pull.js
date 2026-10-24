// Live pull: the floor asks the stockroom for stock, item by item, and the
// stockroom pulls it straight away (24 Oct 2026). A session is one
// department's run: a requester scans on the floor, one or more pullers
// mark each request off in the stockroom, and a cage goes down when it is
// full. Every phone of the store holds the sessions (a Floor projection), so
// the requester and the pullers see one list live. What was pulled shows to
// anyone who scans the same item again that day.
//
//   pulls.sessions id → {
//     id, name, dept, at, by, shelves, closedAt, cage (the one being filled), cages n → { at, by, tag, lines },
//     people device → { part: req | pull, bays: [ '7000-7029' | '7036' | 'all' ], at },
//     lines id → { id, kc, name, bays[], qty (n | 'all'), carton, shelf, at, by,
//                  st: todo | pulled | short | gone | cancelled, got { bay: n } | null, doneAt, doneBy, cage }
//   }
//
// Conflict rules: the first mark wins (a second phone marking the same line
// is refused); a mark comes back (undo) only until its cage has gone down;
// sending a cage that has already gone is a no-op; a closed session takes
// no more requests. Sessions leave the live state after KEEP_PULL_DAYS
// (store.retain); the log keeps every event.

import { reject } from './util.js';

export const PULL_STATES = ['todo', 'pulled', 'short', 'gone', 'cancelled'];
export const KEEP_PULL_DAYS = 7, SESSION_CAP = 80, LINE_CAP = 600, BAYS_MAX = 12, QTY_MAX = 999;
const KC_RE = /^\d{6,13}$/, BAY_RE = /^[\w-]{1,12}$/, ZONE_RE = /^(all|\d{1,6}(-\d{1,6})?)$/, DEPT_RE = /^[a-z0-9]{1,12}$/, SHELF_RE = /^[\w .-]{1,16}$/, TAG_RE = /^[\w-]{1,20}$/;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const who = e => String(e.actor?.device || 'unknown');
const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function pullState() {
  return { pulls: { sessions: {} } };
}

// A session that takes changes: there, and not closed.
function openSession(s, e) {
  const ses = s.pulls.sessions[e.entity.session];
  if (!ses) return reject('not_found', 'no such session');
  if (ses.closedAt) return reject('closed', 'this session has ended');
  return ses;
}
// The bays a request names: 1 to BAYS_MAX distinct stockroom bays.
function bayList(v) {
  if (!Array.isArray(v) || !v.length) return reject('invalid_event', 'a request names at least one stockroom bay');
  const out = [...new Set(v.map(b => String(b).trim()))];
  if (out.length > BAYS_MAX || out.some(b => !BAY_RE.test(b))) return reject('invalid_event', `bays are up to ${BAYS_MAX} stockroom locations`);
  return out;
}
// A puller's part of the room: 'all', or bay ranges and single bays.
function zoneList(v) {
  if (!Array.isArray(v) || v.length > 20) return reject('invalid_event', 'bays: a list of up to 20 ranges');
  const out = [...new Set(v.map(z => String(z).trim()))];
  if (out.some(z => !ZONE_RE.test(z))) return reject('invalid_event', 'each range is a bay (7036), a range (7000-7029) or all');
  return out;
}
// How many: a whole number, or every one there is.
function quantity(p) {
  if (p.all === true) return 'all';
  return whole(p.qty, 1, QTY_MAX) ? p.qty : reject('invalid_event', `qty is 1 to ${QTY_MAX}, or all: true`);
}
function join(ses, e, part, bays) {
  ses.people[who(e)] = { part, ...(bays ? { bays } : {}), at: e.at };
}

export const pullReducers = {
  'pull.session.start'(s, e) {
    const id = String(e.entity.session), p = e.payload;
    if (s.pulls.sessions[id]) return reject('exists', 'that session has already started');
    const name = clean(p.name, 60), dept = String(p.dept || '').toLowerCase();
    if (!name) return reject('invalid_event', 'a session needs a name');
    if (dept && !DEPT_RE.test(dept)) return reject('invalid_event', 'dept is a department code (k2, h1…)');
    if (p.part !== undefined && p.part !== 'req' && p.part !== 'pull') return reject('invalid_event', 'part is req or pull');
    if (Object.keys(s.pulls.sessions).length >= SESSION_CAP) return reject('too_large', `at most ${SESSION_CAP} sessions are kept: end the old ones`);
    const ses = s.pulls.sessions[id] = { id, name, dept, at: e.at, by: who(e), shelves: p.shelves === true, closedAt: null, cage: 1, cages: {}, people: {}, lines: {} };
    if (p.part === 'req') join(ses, e, 'req');
    return null;
  },
  // A requester joins (a puller joins with their bays: pull.zone.set).
  'pull.join'(s, e) {
    const ses = openSession(s, e); if (ses.code) return ses;
    if (ses.people[who(e)]?.part === 'req') return reject('unchanged', 'already in this session');
    join(ses, e, 'req');
    return null;
  },
  // A puller joins, or changes the bays this phone pulls ([] or ['all'] = every bay).
  'pull.zone.set'(s, e) {
    const ses = openSession(s, e); if (ses.code) return ses;
    const bays = zoneList(e.payload.bays); if (bays.code) return bays;
    join(ses, e, 'pull', bays.length ? bays : ['all']);
    return null;
  },
  'pull.request'(s, e) {
    const ses = openSession(s, e); if (ses.code) return ses;
    const id = String(e.entity.line), p = e.payload;
    if (ses.lines[id]) return reject('exists', 'that request is already on the list');
    if (Object.keys(ses.lines).length >= LINE_CAP) return reject('too_large', `a session holds at most ${LINE_CAP} requests: start another`);
    const kc = String(p.kc); if (!KC_RE.test(kc)) return reject('invalid_event', 'kc is a keycode of 6 to 13 digits');
    const bays = bayList(p.bays); if (bays.code) return bays;
    const qty = quantity(p); if (qty?.code) return qty;
    if (p.carton !== undefined && !whole(p.carton, 1, QTY_MAX)) return reject('invalid_event', `carton is 1 to ${QTY_MAX}`);
    const shelf = p.shelf ? String(p.shelf).trim().toUpperCase() : '';
    if (shelf && !SHELF_RE.test(shelf)) return reject('invalid_event', 'shelf is a floor shelf (A16 S1)');
    ses.lines[id] = { id, kc, name: clean(p.name, 80), bays, qty, ...(p.carton ? { carton: p.carton } : {}), ...(shelf ? { shelf } : {}), at: e.at, by: who(e), st: 'todo', got: null, doneAt: null, doneBy: null, cage: null };
    if (!ses.people[who(e)]) join(ses, e, 'req');
    return null;
  },
  // The requester changes how many while it waits, or takes it back (cancel).
  'pull.update'(s, e) {
    const ses = openSession(s, e); if (ses.code) return ses;
    const line = ses.lines[e.entity.line], p = e.payload;
    if (!line) return reject('not_found', 'no such request');
    if (line.st !== 'todo') return reject('conflict', 'it has already been marked off in the stockroom');
    if (p.cancel === true) { line.st = 'cancelled'; line.doneAt = e.at; line.doneBy = who(e); return null; }
    const qty = quantity(p); if (qty?.code) return qty;
    if (qty === line.qty) return reject('unchanged', 'the same quantity');
    line.qty = qty;
    return null;
  },
  // A puller marks a request off: pulled (got: what came from each bay),
  // short (some), gone (not there), or todo again (undo, before its cage goes).
  'pull.mark'(s, e) {
    const ses = s.pulls.sessions[e.entity.session];
    if (!ses) return reject('not_found', 'no such session');
    const line = ses.lines[e.entity.line], st = e.payload.st;
    if (!line) return reject('not_found', 'no such request');
    if (!['pulled', 'short', 'gone', 'todo'].includes(st)) return reject('invalid_event', 'st is pulled, short, gone or todo');
    if (st === 'todo') {
      if (!['pulled', 'short', 'gone'].includes(line.st)) return reject('unchanged', 'it is not marked off');
      if (line.cage != null) return reject('conflict', `it went down in cage ${line.cage}`);
      Object.assign(line, { st: 'todo', got: null, doneAt: null, doneBy: null });
      return null;
    }
    if (line.st !== 'todo') return reject('conflict', line.st === 'cancelled' ? 'the requester took it back' : 'another phone has already marked it off');
    let got = null;
    if (st !== 'gone') {
      const g = e.payload.got;
      if (g !== undefined) {
        if (!g || typeof g !== 'object' || Array.isArray(g) || Object.keys(g).length > BAYS_MAX) return reject('invalid_event', 'got maps each bay to how many came from it');
        got = {};
        for (const [bay, n] of Object.entries(g)) { if (!BAY_RE.test(bay) || !whole(n, 0, 9999)) return reject('invalid_event', 'got maps each bay to how many came from it'); if (n) got[bay] = n; }
      } else if (st === 'pulled' && line.qty !== 'all') got = { [line.bays[0]]: line.qty };
      const total = got ? Object.values(got).reduce((a, b) => a + b, 0) : null;
      if (st === 'short' && (!total || (line.qty !== 'all' && total >= line.qty))) return reject('invalid_event', 'short: more than none and fewer than asked (none is gone)');
    }
    Object.assign(line, { st, got, doneAt: e.at, doneBy: who(e) });
    return null;
  },
  // The cage being filled goes down with every line marked off since the last.
  'pull.cage.send'(s, e) {
    const ses = s.pulls.sessions[e.entity.session];
    if (!ses) return reject('not_found', 'no such session');
    const n = e.payload.cage;
    if (n !== ses.cage) return reject('unchanged', `cage ${n} has already gone down`);
    const tag = e.payload.tag ? String(e.payload.tag).trim().toUpperCase() : '';
    if (tag && !TAG_RE.test(tag)) return reject('invalid_event', 'a cage tag is letters and digits');
    const lines = Object.values(ses.lines).filter(l => ['pulled', 'short', 'gone'].includes(l.st) && l.cage == null);
    if (!lines.length) return reject('invalid_event', 'nothing has been marked off for this cage');
    for (const l of lines) l.cage = n;
    ses.cages[n] = { at: e.at, by: who(e), ...(tag ? { tag } : {}), lines: lines.length };
    ses.cage = n + 1;
    return null;
  },
  'pull.session.end'(s, e) {
    const ses = s.pulls.sessions[e.entity.session];
    if (!ses) return reject('not_found', 'no such session');
    if (ses.closedAt) return reject('unchanged', 'already ended');
    ses.closedAt = e.at;
    return null;
  },
};

// ── Reading a session (the phones and the desk) ──────────────────────────
// How many a line asked for, as units (all: null).
export const unitsOf = l => (l.qty === 'all' ? null : l.qty);
export const gotOf = l => (l.got ? Object.values(l.got).reduce((a, b) => a + b, 0) : l.st === 'pulled' && l.qty !== 'all' ? l.qty : 0);
// A session's counts: asked (requests not taken back), waiting, pulled, short, gone.
export function sessionCounts(ses) {
  const c = { asked: 0, todo: 0, pulled: 0, short: 0, gone: 0 };
  for (const l of Object.values(ses?.lines || {})) { if (l.st === 'cancelled') continue; c.asked++; c[l.st]++; }
  return c;
}
export function sessionPeople(ses) {
  const p = Object.values(ses?.people || {});
  return { req: p.filter(x => x.part === 'req').length, pull: p.filter(x => x.part === 'pull').length };
}
// Does a bay fall in a puller's ranges? ('all' or none: every bay.)
export function inZone(bay, zone) {
  if (!zone || !zone.length || zone.includes('all')) return true;
  const n = Number(bay);
  return zone.some(z => { const [a, b] = z.split('-'); return b === undefined ? z === String(bay) : Number.isFinite(n) && n >= Number(a) && n <= Number(b); });
}
// The bays a line is for on one phone: the first of its bays inside the zone.
export const lineInZone = (l, zone) => l.bays.some(b => inZone(b, zone));
// Bays no puller covers: shown on every puller's phone so nothing is missed.
export function uncovered(ses, bay) {
  const zones = Object.values(ses?.people || {}).filter(p => p.part === 'pull').map(p => p.bays || ['all']);
  return !zones.some(z => inZone(bay, z));
}
// What was pulled of a keycode today, in any session: [{ session, name, bay, n, at }].
export function pulledToday(state, kc, day) {
  const out = [];
  for (const ses of Object.values(state?.pulls?.sessions || {})) for (const l of Object.values(ses.lines)) {
    if (l.kc !== kc || !['pulled', 'short'].includes(l.st) || String(l.doneAt || '').slice(0, 10) !== day) continue;
    const got = l.got || {};
    for (const [bay, n] of Object.entries(got)) out.push({ session: ses.id, name: ses.name, bay, n, at: l.doneAt });
    if (!Object.keys(got).length) out.push({ session: ses.id, name: ses.name, bay: l.bays[0], n: null, at: l.doneAt });
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
// Sessions leave the live state after KEEP_PULL_DAYS (store.retain).
export function retainPulls(s, cutoff) {
  let n = 0;
  for (const [id, ses] of Object.entries(s.pulls?.sessions || {})) if (String(ses.at).slice(0, 10) < cutoff) { delete s.pulls.sessions[id]; n++; }
  return n;
}
