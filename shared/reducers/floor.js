// Floor reducers: location refresh, label integrity, stocktake, maintenance
// issues, emergency assets, pick lists. Shapes follow what the legacy
// ShelfSearcher modes persist (refresh-mode, label-integrity, stocktake-mode,
// maintenance-mode, em-service, app.js pick list), ported faithfully:
//
//   refresh   week → segment → { at, devices[] }; focus week → [dept codes];
//             plan segment → colour (erase deletes)
//   labels    cycleLen, assign micro → [shelves], checks cycle → micro → { at, device },
//             variances cycle → [ { micro, keycode, note, at, device } ]
//   stocktake sessions session → { phase, startedAt, startedBy, ended, shelves: shelf → { state, by, at, vby } }
//   issues    id → { cat, title, note, sev, status, recur, loc, dept, floor, x, y, by, created, updated, log[] }
//   assets    asset → { intMonths, due, log[], updated }
//   picklists device → { items: [ { code, completed } ], at }

import { reject } from './util.js';

export const ISSUE_CATS = ['leak', 'light', 'elec', 'ac', 'plumb', 'struct', 'fixture', 'door', 'safety', 'pest', 'other'];
export const ISSUE_STATUS = ['open', 'progress', 'completed'];
export const STOCKTAKE_PHASES = ['counting', 'final'];
export const STOCKTAKE_STATES = ['pending', 'counted', 'verified', 'cleared'];
export const CYCLE_LENGTHS = ['weekly', 'fortnightly', 'monthly'];
const MAX_INT_MONTHS = 120;

export function floorState() {
  return {
    refresh: { weeks: {}, focus: {}, plan: {}, unmarked: {} },
    labels: { cycleLen: 'monthly', assign: {}, checks: {}, variances: {} },
    stocktake: { sessions: {} },
    issues: {},
    assets: {},
    picklists: {},
  };
}

export const floorReducers = {
  // ── Location refresh ─────────────────────────────────────────────────
  // A mark that arrives after the desk already unmarked that segment (a
  // phone's queued tap landing late) is ignored, so an unmark holds.
  'refresh.mark'(s, e) {
    const week = (s.refresh.weeks[e.entity.week] ||= {});
    const seg = e.entity.segment;
    const gone = s.refresh.unmarked?.[e.entity.week]?.[seg];
    if (gone && e.at <= gone) return null;
    const dev = e.actor?.device || 'unknown';
    const cur = week[seg];
    if (!cur) { week[seg] = { at: e.at, devices: [dev] }; return null; }
    if (!cur.devices.includes(dev)) cur.devices.push(dev);
    if (e.at < cur.at) cur.at = e.at;                       // first mark wins the time
    return null;
  },
  'refresh.unmark'(s, e) {
    const week = s.refresh.weeks[e.entity.week];
    if (week) delete week[e.entity.segment];
    ((s.refresh.unmarked ||= {})[e.entity.week] ||= {})[e.entity.segment] = e.at;
    return null;
  },
  'refresh.clearWeek'(s, e) {
    s.refresh.weeks[e.entity.week] = {};
    return null;
  },
  'refresh.focus.set'(s, e) {
    const depts = e.payload.departments.map(d => String(d).toLowerCase());
    if (depts.length) s.refresh.focus[e.entity.week] = depts; else delete s.refresh.focus[e.entity.week];
    return null;
  },
  'refresh.plan.paint'(s, e) {
    const c = e.payload.colour;
    if (c === 'erase' || c === null) delete s.refresh.plan[e.entity.segment];
    else if (/^#[0-9a-fA-F]{6}$/.test(c)) s.refresh.plan[e.entity.segment] = c;
    else return reject('invalid_event', 'colour must be #rrggbb or erase');
    return null;
  },

  // ── Label integrity ──────────────────────────────────────────────────
  'label.cycle.set'(s, e) {
    if (!CYCLE_LENGTHS.includes(e.payload.cycleLen)) return reject('invalid_event', `cycleLen must be one of ${CYCLE_LENGTHS.join(', ')}`);
    s.labels.cycleLen = e.payload.cycleLen;
    return null;
  },
  'label.assign'(s, e) {
    const shelves = e.payload.shelves.map(String);
    if (shelves.length) s.labels.assign[e.entity.micro] = shelves; else delete s.labels.assign[e.entity.micro];
    return null;
  },
  'label.check'(s, e) {
    const cycle = (s.labels.checks[e.entity.cycle] ||= {});
    cycle[e.entity.micro] = { at: e.at, device: e.actor?.device || null };
    return null;
  },
  'label.uncheck'(s, e) {
    const cycle = s.labels.checks[e.entity.cycle];
    if (cycle) delete cycle[e.entity.micro];
    return null;
  },
  'label.variance'(s, e) {
    const list = (s.labels.variances[e.entity.cycle] ||= []);
    list.push({ micro: e.entity.micro, keycode: e.payload.keycode, note: e.payload.note || '', at: e.at, device: e.actor?.device || null });
    return null;
  },

  // ── Stocktake ────────────────────────────────────────────────────────
  'stocktake.start'(s, e) {
    const id = e.entity.session;
    const cur = s.stocktake.sessions[id];
    if (cur && !cur.ended) return null;                     // already running: idempotent
    s.stocktake.sessions[id] = { phase: 'counting', startedAt: e.at, startedBy: e.actor?.device || null, ended: null, shelves: cur ? cur.shelves : {} };
    return null;
  },
  'stocktake.phase'(s, e) {
    const sess = openSession(s, e); if (sess.code) return sess;
    if (!STOCKTAKE_PHASES.includes(e.payload.phase)) return reject('invalid_event', 'phase must be counting or final');
    sess.phase = e.payload.phase;
    return null;
  },
  'stocktake.end'(s, e) {
    const sess = s.stocktake.sessions[e.entity.session];
    if (!sess) return reject('not_found', 'no such stocktake session');
    sess.ended = sess.ended || e.at;
    return null;
  },
  // A scan advances a shelf's state; there is no quantity in a stocktake.
  'stocktake.scan'(s, e) {
    const sess = openSession(s, e); if (sess.code) return sess;
    const state = e.payload.state;
    if (!['pending', 'counted', 'cleared'].includes(state)) return reject('invalid_event', 'state must be pending, counted or cleared');
    const shelf = e.entity.shelf;
    const cur = sess.shelves[shelf];
    if (state === 'cleared') { delete sess.shelves[shelf]; return null; }
    if (state === 'counted' && sess.phase === 'final') return reject('phase_final', 'counting is closed; final phase only verifies');
    if (cur && cur.state === 'verified' && state !== 'pending') return null;
    sess.shelves[shelf] = { state, by: e.actor?.device || null, at: e.at };
    return null;
  },
  'stocktake.verify'(s, e) {
    const sess = openSession(s, e); if (sess.code) return sess;
    const cur = sess.shelves[e.entity.shelf];
    if (!cur) return reject('not_found', 'shelf has not been counted');
    const on = e.payload.verified !== false;
    if (on && cur.state === 'counted') { cur.state = 'verified'; cur.vby = e.actor?.device || null; cur.at = e.at; }
    else if (!on && cur.state === 'verified') { cur.state = 'counted'; delete cur.vby; cur.at = e.at; }
    return null;
  },
  'stocktake.verifyAll'(s, e) {
    const sess = openSession(s, e); if (sess.code) return sess;
    for (const r of Object.values(sess.shelves)) if (r.state === 'counted') { r.state = 'verified'; r.vby = e.actor?.device || null; r.at = e.at; }
    return null;
  },

  // ── Maintenance issues ───────────────────────────────────────────────
  'issue.log'(s, e) {
    const id = e.entity.issue;
    if (s.issues[id]) return reject('exists', `issue ${id} already exists`);
    const p = e.payload;
    if (!ISSUE_CATS.includes(p.cat)) return reject('invalid_event', `cat must be one of ${ISSUE_CATS.join(', ')}`);
    const sev = Number.isInteger(p.sev) && p.sev >= 0 && p.sev <= 3 ? p.sev : 0;
    s.issues[id] = {
      cat: p.cat, title: p.title, note: p.note || '', sev, status: 'open', recur: 0,
      loc: p.loc || '', dept: p.dept || null, floor: p.floor || null, x: num(p.x), y: num(p.y),
      by: e.actor?.device || null, created: e.at, updated: e.at,
      log: [{ t: e.at, a: 'Logged', n: p.note || '' }],
    };
    return null;
  },
  'issue.update'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    const p = e.payload, changed = [];
    for (const k of ['cat', 'title', 'note', 'sev', 'loc', 'dept', 'floor', 'x', 'y']) {
      if (p[k] === undefined) continue;
      if (k === 'cat' && !ISSUE_CATS.includes(p.cat)) return reject('invalid_event', 'bad cat');
      if (k === 'sev' && !(Number.isInteger(p.sev) && p.sev >= 0 && p.sev <= 3)) return reject('invalid_event', 'sev must be 0..3');
      i[k] = (k === 'x' || k === 'y') ? num(p[k]) : p[k]; changed.push(k);
    }
    if (!changed.length) return null;
    i.updated = e.at; i.log.push({ t: e.at, a: 'Edited', n: changed.join(', ') });
    return null;
  },
  'issue.progress'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    if (i.status !== 'open') return null;
    i.status = 'progress'; i.updated = e.at; i.log.push({ t: e.at, a: 'Maintenance done', n: e.payload.note || '' });
    return null;
  },
  'issue.close'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    if (i.status === 'completed') return null;
    i.status = 'completed'; i.updated = e.at; i.log.push({ t: e.at, a: 'Completed', n: e.payload.note || '' });
    return null;
  },
  'issue.reopen'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    if (i.status === 'open') return null;
    i.status = 'open'; i.recur = (i.recur || 0) + 1; i.updated = e.at;
    i.log.push({ t: e.at, a: 'Reopened (recurring)', n: e.payload.note || '' });
    return null;
  },

  // ── Emergency assets ─────────────────────────────────────────────────
  'asset.service'(s, e) {
    const a = (s.assets[e.entity.asset] ||= { intMonths: 12, due: null, log: [], updated: null });
    a.log.push({ t: e.at, a: 'Serviced', n: e.payload.note || '' });
    a.due = addMonths(e.at, a.intMonths); a.updated = e.at;
    return null;
  },
  'asset.schedule'(s, e) {
    const m = e.payload.months;
    if (!(Number.isInteger(m) && m >= 1 && m <= MAX_INT_MONTHS)) return reject('invalid_event', `months must be 1..${MAX_INT_MONTHS}`);
    const a = (s.assets[e.entity.asset] ||= { intMonths: 12, due: null, log: [], updated: null });
    a.intMonths = m;
    const last = a.log.filter(l => l.a === 'Serviced').map(l => l.t).sort().pop() || e.at;
    a.due = addMonths(last, m); a.updated = e.at;
    a.log.push({ t: e.at, a: 'Schedule set', n: `${m} months` });
    return null;
  },

  // ── Pick list ────────────────────────────────────────────────────────
  'picklist.set'(s, e) {
    const items = e.payload.items.filter(i => i && typeof i.code === 'string').map(i => ({ code: i.code, completed: !!i.completed })).slice(0, 200);
    s.picklists[e.entity.device] = { items, at: e.at };
    return null;
  },
};

// ── helpers ────────────────────────────────────────────────────────────
function openSession(s, e) {
  const sess = s.stocktake.sessions[e.entity.session];
  if (!sess) return reject('not_found', 'no such stocktake session');
  if (sess.ended) return reject('session_ended', 'stocktake session has ended');
  return sess;
}
function issue(s, e) {
  const i = s.issues[e.entity.issue];
  if (!i) return reject('not_found', `issue ${e.entity.issue} does not exist`);
  return i;
}
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

// Adds calendar months to an ISO timestamp and returns an ISO date (YYYY-MM-DD).
export function addMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
