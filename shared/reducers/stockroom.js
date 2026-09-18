// Stockroom reducers: cages, backfill submissions, negative-SOH adjustments,
// day list. Shapes follow K2B's worker docs (stockroom-review, stockroom-adjust,
// stockroom-scan), ported faithfully; cages are new and come from the design doc.
//
//   cages        cage → { ring, location, items: keycode → qty, sweeps[], status, created, seen, closed }
//   backfill     subs: `${bay}:${date}` → { bay, date, status, codes: code → { scanned }, incorrect: [],
//                metrics, statusAt, reopenedAt, readyAt, submittedDoneAt, autoSubmitted }
//                requested: date → [bays]      claims: bay → { by, at }
//   adjustments  date → keycode → { qty (≤ 0), name, location, confirmed, addedAt }
//   daylist      date → { walkers, excluded: [bays], source }
//
// Status enum is exactly pending | corrected | submitted ("Needs review",
// "Ready", "Submitted"). Requested locations are a separate list, not a status.

import { reject } from './util.js';

export const RINGS = ['new-lines', 'overstock', 'cant-work', 'online-picks'];
export const SUBMISSION_STATUS = ['pending', 'corrected', 'submitted'];
export const DAYLIST_SOURCES = ['requested', 'snapshot', ''];

export function stockroomState() {
  return {
    cages: {},
    backfill: { subs: {}, requested: {}, claims: {} },
    adjustments: {},
    daylist: {},
  };
}

export const stockroomReducers = {
  // ── Cages ────────────────────────────────────────────────────────────
  'cage.create'(s, e) {
    const id = e.entity.cage;
    if (s.cages[id] && s.cages[id].status !== 'closed') return reject('cage_exists', `${id} is already open`);
    if (!RINGS.includes(e.payload.ring)) return reject('invalid_event', `ring must be one of ${RINGS.join(', ')}`);
    s.cages[id] = { ring: e.payload.ring, location: null, items: {}, sweeps: [], status: 'open', created: e.at, seen: e.at };
    return null;
  },
  'cage.scan'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    const kc = e.payload.keycode;
    c.items[kc] = (c.items[kc] || 0) + e.payload.qty;
    if (c.items[kc] <= 0) delete c.items[kc];
    c.seen = e.at;
    return null;
  },
  'cage.park'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.location = String(e.payload.location).toUpperCase(); c.seen = e.at;
    return null;
  },
  'cage.sweep'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.sweeps.push({ at: e.at, device: e.actor?.device || null }); c.seen = e.at;
    return null;
  },
  'cage.close'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.status = 'closed'; c.closed = e.at;
    return null;
  },

  // ── Backfill submissions ─────────────────────────────────────────────
  'submission.open'(s, e) {
    const k = subKey(e);
    if (!s.backfill.subs[k]) s.backfill.subs[k] = newSub(bay(e), e.entity.date);
    return null;
  },
  // codes: { code: scanned }, merged per code; remove: [codes]; incorrect: [codes] (replaces the list)
  'submission.update'(s, e) {
    const sub = s.backfill.subs[subKey(e)] || (s.backfill.subs[subKey(e)] = newSub(bay(e), e.entity.date));
    const p = e.payload;
    if (p.codes && typeof p.codes === 'object') for (const [code, scanned] of Object.entries(p.codes)) sub.codes[code] = { scanned: !!scanned };
    if (Array.isArray(p.remove)) for (const code of p.remove) delete sub.codes[String(code)];
    if (Array.isArray(p.incorrect)) sub.incorrect = [...new Set(p.incorrect.map(String))];
    sub.updatedAt = e.at;
    return null;
  },
  'submission.ready'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    if (e.at < sub.statusAt) return null;
    sub.status = 'corrected'; sub.statusAt = e.at; sub.readyAt = sub.readyAt || e.at;
    sub.metrics = metrics(sub);
    return null;
  },
  'submission.submit'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    if (sub.reopenedAt && e.at < sub.reopenedAt) return null;    // stale submit after a reopen: ignored
    if (sub.status === 'submitted') return null;
    sub.status = 'submitted'; sub.statusAt = e.at; sub.submittedDoneAt = e.at;
    sub.autoSubmitted = !!e.payload.auto; sub.metrics = metrics(sub);
    delete s.backfill.claims[sub.bay];
    return null;
  },
  'submission.reopen'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    sub.status = 'pending'; sub.statusAt = e.at; sub.reopenedAt = e.at; sub.autoSubmitted = false;
    return null;
  },
  'submission.rename'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    const to = String(e.payload.newBay).toUpperCase();
    const toKey = `${to}:${e.entity.date}`;
    if (s.backfill.subs[toKey]) return reject('bay_taken', `bay ${to} already has a submission for ${e.entity.date}`);
    delete s.backfill.subs[subKey(e)];
    sub.bay = to; s.backfill.subs[toKey] = sub;
    if (s.backfill.claims[bay(e)]) { s.backfill.claims[to] = s.backfill.claims[bay(e)]; delete s.backfill.claims[bay(e)]; }
    return null;
  },
  'submission.delete'(s, e) {
    delete s.backfill.subs[subKey(e)];
    delete s.backfill.claims[bay(e)];
    return null;
  },
  'submission.request'(s, e) {
    const list = (s.backfill.requested[e.entity.date] ||= []);
    const b = bay(e);
    if (e.payload.remove) { const i = list.indexOf(b); if (i >= 0) list.splice(i, 1); }
    else if (!list.includes(b)) list.push(b);
    return null;
  },
  'submission.claim'(s, e) {
    const b = bay(e), by = e.actor?.device || 'unknown';
    if (e.payload.release) { if (s.backfill.claims[b]?.by === by) delete s.backfill.claims[b]; return null; }
    const cur = s.backfill.claims[b];
    if (cur && cur.by !== by) return reject('claimed', `bay ${b} is being reviewed by another device`);
    s.backfill.claims[b] = { by, at: e.at };
    return null;
  },

  // ── Negative SOH adjustments ─────────────────────────────────────────
  'adjustment.set'(s, e) {
    const kc = String(e.entity.keycode);
    if (!/^\d{6,13}$/.test(kc)) return reject('invalid_event', 'keycode must be 6 to 13 digits');
    const day = (s.adjustments[e.entity.date] ||= {});
    const p = e.payload;
    const loc = p.location ? String(p.location).toUpperCase() : '';
    day[kc] = { qty: -Math.abs(p.qty), name: p.name || day[kc]?.name || '', location: loc, confirmed: !!p.confirmed, addedAt: e.at };
    return null;
  },
  'adjustment.remove'(s, e) {
    const day = s.adjustments[e.entity.date];
    if (day) delete day[String(e.entity.keycode)];
    return null;
  },

  // ── Day list ─────────────────────────────────────────────────────────
  'daylist.set'(s, e) {
    const w = e.payload.walkers;
    if (!(Number.isInteger(w) && w >= 1 && w <= 4)) return reject('invalid_event', 'walkers must be 1..4');
    const src = e.payload.source ?? '';
    if (!DAYLIST_SOURCES.includes(src)) return reject('invalid_event', 'source must be requested, snapshot or empty');
    s.daylist[e.entity.date] = { walkers: w, excluded: Array.isArray(e.payload.excluded) ? e.payload.excluded.map(x => String(x).toUpperCase()) : [], source: src, at: e.at };
    return null;
  },
};

// ── helpers ────────────────────────────────────────────────────────────
function openCage(s, e) {
  const c = s.cages[e.entity.cage];
  if (!c || c.status === 'closed') return reject('not_found', `cage ${e.entity.cage} is not open`);
  return c;
}
function bay(e) { return String(e.entity.bay).toUpperCase(); }
function subKey(e) { return `${bay(e)}:${e.entity.date}`; }
function newSub(bayNo, date) {
  return { bay: bayNo, date, status: 'pending', codes: {}, incorrect: [], metrics: null, statusAt: '', reopenedAt: null, readyAt: null, submittedDoneAt: null, autoSubmitted: false, updatedAt: null };
}
function sub_(s, e) {
  const sub = s.backfill.subs[subKey(e)];
  if (!sub) return reject('not_found', 'submission is not open');
  return sub;
}
export function metrics(sub) {
  const expected = Object.keys(sub.codes).length;
  const scanned = Object.values(sub.codes).filter(c => c.scanned).length;
  const match = expected - sub.incorrect.length;
  return { expected, scanned, match, accuracy: expected ? Math.round(match / expected * 100) : 100, incorrect: sub.incorrect.length };
}
