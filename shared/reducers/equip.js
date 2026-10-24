// Equipment checks (24 Oct 2026): the store's mechanical equipment, not its
// emergency gear: ladders, MHE (pallet jacks, walkie stackers, forklifts),
// trolleys and anything else a store adds. Each item has its own code (the
// number on its tag, or LAD-01 style), a home on the map, how often it is
// checked, and its checks. A failed check puts it out of service until a
// check passes. Every store device holds the list (a Floor projection);
// only a manager removes an item, and a removed one keeps its history.
//
//   equipment.items id → {
//     id, code, kind, name, every (months; 0 = a set date), last (day), due (day),
//     out: null | { since (day), note, issue }, x, y, floor, loc,
//     added, by, updated, removed: null | { at, by, why, note },
//     log[ { t, a, by, day?, n?, pts? } ]   (a: the reducer's words, shown translated)
//   }
//
// Conflict rules: a code belongs to one item that has not been removed; a
// check dated before the last one is logged but never moves the last check
// back; removing a removed item, or restoring a live one, is a no-op.

import { reject } from './util.js';
import { addMonths } from './floor.js';

export const EQUIP_KINDS = ['step', 'ladder', 'pj', 'epj', 'stacker', 'forklift', 'trolley', 'other'];
// Each kind's group: its code's prefix and the filter it shows under.
export const EQUIP_GROUP = { step: 'lad', ladder: 'lad', pj: 'mhe', epj: 'mhe', stacker: 'mhe', forklift: 'mhe', trolley: 'trl', other: 'eqp' };
export const EQUIP_WHY = ['retired', 'broken', 'lost', 'moved', 'mistake'];
export const EQUIP_CAP = 300, EVERY_MAX = 60, SOON_DAYS = 14;
const LOG_CAP = 120, POINTS_MAX = 12;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,15}$/, DAY_RE = /^\d{4}-\d{2}-\d{2}$/, KEY_RE = /^[a-z0-9_]{1,24}$/;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const who = e => String(e.actor?.device || 'unknown');
const isDay = v => typeof v === 'string' && DAY_RE.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function equipState() {
  return { equipment: { items: {} } };
}

// Days from `today` to `day` (both YYYY-MM-DD): negative once it has passed.
export const daysUntil = (day, today) => Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
// Where an item stands today: out of service, overdue, due within SOON_DAYS,
// in date, or with no date at all.
export function equipStatus(it, today) {
  if (it.out) return 'out';
  if (!it.due) return 'none';
  const d = daysUntil(it.due, today);
  return d < 0 ? 'late' : d <= SOON_DAYS ? 'soon' : 'ok';
}
// The items still on the map (removed ones keep their history, off the list).
export const liveEquipment = s => Object.values(s?.items || {}).filter(it => !it.removed);

// A code: letters, digits and dashes, upper case, and not another live item's.
function codeOf(s, v, self) {
  const code = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!CODE_RE.test(code)) return reject('invalid_event', 'code is 1 to 16 letters, digits or dashes (LAD-01)');
  if (liveEquipment(s.equipment).some(it => it.code === code && it.id !== self)) return reject('exists', `${code} is already on the list`);
  return code;
}
function every(v) {
  return Number.isInteger(v) && v >= 0 && v <= EVERY_MAX ? v : reject('invalid_event', `every is 0 (a set date) to ${EVERY_MAX} months`);
}
// The next due date: worked out from the last check, or the one given.
function nextDue(it, given) {
  if (given !== undefined) return given;
  return it.every > 0 && it.last ? addMonths(it.last + 'T00:00:00Z', it.every) : it.every > 0 ? it.due : null;
}
function place(it, p) {
  const x = num(p.x), y = num(p.y);
  if ((x == null) !== (y == null)) return reject('invalid_event', 'a place needs both x and y');
  if (x != null) { it.x = x; it.y = y; it.floor = p.floor ? clean(p.floor, 32) : null; }
  if (p.loc !== undefined) it.loc = clean(p.loc, 60);
  return null;
}
function logLine(it, e, a, extra = {}) {
  it.log.push({ t: e.at, a, by: who(e), ...extra });
  if (it.log.length > LOG_CAP) it.log.splice(0, it.log.length - LOG_CAP);
  it.updated = e.at;
}
function item(s, e) {
  const it = s.equipment.items[e.entity.equip];
  return it ? it : reject('not_found', 'no such equipment');
}
function liveItem(s, e) {
  const it = item(s, e);
  if (!it.id) return it;   // a rejection
  return it.removed ? reject('removed', `${it.code} has been removed`) : it;
}
// A day a person gave: a real date, or null to clear it.
function dayOrNull(v, name) {
  if (v === null) return null;
  return isDay(v) ? v : reject('invalid_event', `${name} is a date (YYYY-MM-DD) or null`);
}

export const equipReducers = {
  'equip.add'(s, e) {
    const id = String(e.entity.equip), p = e.payload;
    if (s.equipment.items[id]) return reject('exists', 'that equipment is already on the list');
    if (!EQUIP_KINDS.includes(p.kind)) return reject('invalid_event', `kind is one of ${EQUIP_KINDS.join(', ')}`);
    if (liveEquipment(s.equipment).length >= EQUIP_CAP) return reject('too_large', `at most ${EQUIP_CAP} pieces of equipment`);
    const code = codeOf(s, p.code); if (typeof code !== 'string') return code;
    const ev = every(p.every ?? 3); if (typeof ev !== 'number') return ev;
    const last = p.last == null ? null : dayOrNull(p.last, 'last'); if (last?.code) return last;
    const due = p.due === undefined ? undefined : dayOrNull(p.due, 'due'); if (due?.code) return due;
    const it = { id, code, kind: p.kind, name: clean(p.name, 80), every: ev, last, due: null, out: null, x: null, y: null, floor: null, loc: '', added: e.at, by: who(e), updated: e.at, removed: null, log: [] };
    const bad = place(it, p); if (bad) return bad;
    it.due = nextDue(it, due);
    s.equipment.items[id] = it;
    logLine(it, e, 'Added');
    return null;
  },
  // Edit (code, kind, name, how often, the due date) or move it on the map.
  'equip.update'(s, e) {
    const it = liveItem(s, e); if (!it.id) return it;
    const p = e.payload, was = JSON.stringify([it.code, it.kind, it.name, it.every, it.due, it.x, it.y, it.floor, it.loc]);
    const code = p.code !== undefined ? codeOf(s, p.code, it.id) : it.code; if (typeof code !== 'string') return code;
    if (p.kind !== undefined && !EQUIP_KINDS.includes(p.kind)) return reject('invalid_event', `kind is one of ${EQUIP_KINDS.join(', ')}`);
    const ev = p.every !== undefined ? every(p.every) : it.every; if (typeof ev !== 'number') return ev;
    const due = p.due === undefined ? undefined : dayOrNull(p.due, 'due'); if (due?.code) return due;
    const moved = num(p.x) != null;
    const next = { ...it, code, kind: p.kind ?? it.kind, name: p.name !== undefined ? clean(p.name, 80) : it.name, every: ev };
    const bad = place(next, p); if (bad) return bad;
    next.due = due !== undefined ? due : ev !== it.every ? nextDue(next) : it.due;
    if (JSON.stringify([next.code, next.kind, next.name, next.every, next.due, next.x, next.y, next.floor, next.loc]) === was) return reject('unchanged', 'nothing changed');
    const onlyMoved = moved && next.code === it.code && next.kind === it.kind && next.name === it.name && next.every === it.every && next.due === it.due;
    Object.assign(it, next);
    logLine(it, e, onlyMoved ? 'Moved' : 'Edited');
    return null;
  },
  // A check: OK brings it (back) into service and sets the next due date;
  // Fail puts it out of service. points: each point of the check, ok | fail.
  'equip.check'(s, e) {
    const it = liveItem(s, e); if (!it.id) return it;
    const p = e.payload;
    if (!isDay(p.day)) return reject('invalid_event', 'day is the date it was checked (YYYY-MM-DD)');
    if (p.result !== 'ok' && p.result !== 'fail') return reject('invalid_event', 'result is ok or fail');
    let pts;
    if (p.points !== undefined) {
      const list = p.points && typeof p.points === 'object' && !Array.isArray(p.points) ? Object.entries(p.points) : null;
      if (!list || list.length > POINTS_MAX || list.some(([k, v]) => !KEY_RE.test(k) || (v !== 'ok' && v !== 'fail'))) return reject('invalid_event', `points: up to ${POINTS_MAX} checks, each ok or fail`);
      if (p.result === 'ok' && list.some(([, v]) => v === 'fail')) return reject('invalid_event', 'a check with a failed point is a fail');
      pts = Object.fromEntries(list);
    }
    const due = p.due === undefined ? undefined : dayOrNull(p.due, 'due'); if (due?.code) return due;
    const note = clean(p.note, 300), issue = p.issue ? clean(p.issue, 40) : null;
    const wasOut = !!it.out;
    if (!it.last || it.last < p.day) it.last = p.day;
    if (p.result === 'ok') {
      it.out = null;
      it.due = it.every > 0 ? nextDue(it) : (due !== undefined ? due : null);
      logLine(it, e, wasOut ? 'Back in service' : 'Checked OK', { day: p.day, ...(note ? { n: note } : {}), ...(pts ? { pts } : {}) });
    } else {
      it.out = { since: p.day, note, issue };
      if (due !== undefined) it.due = due;
      logLine(it, e, 'Failed', { day: p.day, ...(note ? { n: note } : {}), ...(pts ? { pts } : {}) });
    }
    return null;
  },
  'equip.remove'(s, e) {
    const it = item(s, e); if (!it.id) return it;
    if (it.removed) return reject('unchanged', `${it.code} has already been removed`);
    if (!EQUIP_WHY.includes(e.payload.why)) return reject('invalid_event', `why is one of ${EQUIP_WHY.join(', ')}`);
    const note = clean(e.payload.note, 300);
    it.removed = { at: e.at, by: who(e), why: e.payload.why, note };
    logLine(it, e, 'Removed', note ? { n: note } : {});
    return null;
  },
  // Undo, or a manager bringing a removed item back.
  'equip.restore'(s, e) {
    const it = item(s, e); if (!it.id) return it;
    if (!it.removed) return reject('unchanged', `${it.code} is on the list`);
    const code = codeOf(s, it.code, it.id); if (typeof code !== 'string') return code;
    it.removed = null;
    logLine(it, e, 'Restored');
    return null;
  },
};
