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
//   issues    id → { cat, title, note, sev, status, recur, loc, dept, floor, x, y, by, created, updated, log[], removed?, photos?[] }
//   assets    asset → { intMonths, due, log[], updated }
//   picklists device → { items: [ { code, completed } ], at }
//   inventory offsite pid → { pid, sent, time, desc, title, products[{kc,q}], req, cb, rec, note, at },
//             offsiteAt, offsiteSrc; loads id → { id, label, date, status, recvDate, src, pallets[{pid, items[{k,d,q,dept}]}], at, by }

import { reject, badList, earlier } from './util.js';
import { storeDay, DEFAULT_TZ } from '../time.js';
import { OFFSITE_CAP, LOAD_CAP, LOAD_PALLET_CAP, LOAD_LINE_CAP, LOAD_STATUS } from '../inventory.js';

export const ISSUE_CATS = ['leak', 'light', 'elec', 'ac', 'plumb', 'struct', 'fixture', 'door', 'safety', 'pest', 'other'];
export const ISSUE_STATUS = ['open', 'progress', 'completed'];
export const STOCKTAKE_PHASES = ['counting', 'final'];
export const STOCKTAKE_STATES = ['pending', 'counted', 'verified', 'cleared'];
export const CYCLE_LENGTHS = ['weekly', 'fortnightly', 'monthly'];
const MAX_INT_MONTHS = 120;
// Issue text is capped: every device downloads every issue.
const TEXT_MAX = { title: 120, note: 1000, loc: 60, dept: 16, floor: 32 };
const clipText = (v, n) => (v == null ? v : String(v).slice(0, n));
const LABEL_SHELVES_MAX = 400, VARIANCES_MAX = 2000;

export function floorState() {
  return {
    refresh: { weeks: {}, focus: {}, plan: {}, unmarked: {} },
    labels: { cycleLen: 'monthly', assign: {}, checks: {}, variances: {} },
    stocktake: { sessions: {} },
    issues: {},
    assets: {},
    picklists: {},
    inventory: { offsite: {}, offsiteAt: null, offsiteSrc: '', loads: {} },
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
    if (gone && !earlier(gone, e.at)) return null;
    const dev = e.actor?.device || 'unknown';
    const cur = week[seg];
    const dept = typeof e.payload?.dept === 'string' && e.payload.dept ? e.payload.dept.toLowerCase().slice(0, 16) : null;
    if (!cur) { week[seg] = { at: e.at, devices: [dev], ...(dept ? { dept } : {}) }; return null; }
    if (dept && !cur.dept) cur.dept = dept;
    if (!cur.devices.includes(dev)) cur.devices.push(dev);
    if (earlier(e.at, cur.at)) cur.at = e.at;                       // first mark wins the time
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
  // Reset one department for the week (ShelfSearcher's per-department
  // Reset): clears marks carrying that department plus the segments the
  // device listed (marks made before marks carried a department), and holds
  // them unmarked like refresh.unmark so a late mark cannot bring one back.
  'refresh.clearDept'(s, e) {
    const dept = String(e.payload.dept).toLowerCase().slice(0, 16), listed = Array.isArray(e.payload.segments) ? e.payload.segments.filter(x => typeof x === 'string').slice(0, 5000) : [];
    const week = s.refresh.weeks[e.entity.week] || {}, gone = ((s.refresh.unmarked ||= {})[e.entity.week] ||= {});
    for (const seg of new Set([...Object.keys(week).filter(k => week[k].dept === dept), ...listed.filter(k => week[k])])) { delete week[seg]; gone[seg] = e.at; }
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
  // Reset planning, in one event (it was one erase per painted shelf).
  'refresh.plan.clear'(s) {
    if (!Object.keys(s.refresh.plan).length) return reject('invalid_event', 'nothing is planned');
    s.refresh.plan = {};
    return null;
  },

  // ── Label integrity ──────────────────────────────────────────────────
  'label.cycle.set'(s, e) {
    if (!CYCLE_LENGTHS.includes(e.payload.cycleLen)) return reject('invalid_event', `cycleLen must be one of ${CYCLE_LENGTHS.join(', ')}`);
    s.labels.cycleLen = e.payload.cycleLen;
    return null;
  },
  'label.assign'(s, e) {
    const no = badList(e.payload.shelves, 'shelves', LABEL_SHELVES_MAX, 24); if (no) return reject('invalid_event', no);
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
    if (!/^\d{6,13}$/.test(e.payload.keycode)) return reject('invalid_event', 'keycode must be 6 to 13 digits');
    const list = s.labels.variances[e.entity.cycle] || [];
    if (list.length >= VARIANCES_MAX) return reject('invalid_event', `a cycle holds at most ${VARIANCES_MAX} variances`);
    s.labels.variances[e.entity.cycle] = list;
    list.push({ micro: e.entity.micro, keycode: e.payload.keycode, note: clipText(e.payload.note || '', 200), at: e.at, device: e.actor?.device || null });
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
      cat: p.cat, title: clipText(p.title, TEXT_MAX.title), note: clipText(p.note || '', TEXT_MAX.note), sev, status: 'open', recur: 0,
      loc: clipText(p.loc || '', TEXT_MAX.loc), dept: clipText(p.dept || null, TEXT_MAX.dept), floor: clipText(p.floor || null, TEXT_MAX.floor), x: num(p.x), y: num(p.y),
      by: e.actor?.device || null, created: e.at, updated: e.at,
      log: [{ t: e.at, a: 'Logged', n: clipText(p.note || '', TEXT_MAX.note) }],
    };
    return null;
  },
  'issue.update'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    const p = e.payload, changed = [];
    // Validate the whole edit first: a refused edit must leave the issue as it was.
    if (p.cat !== undefined && !ISSUE_CATS.includes(p.cat)) return reject('invalid_event', 'bad cat');
    if (p.sev !== undefined && !(Number.isInteger(p.sev) && p.sev >= 0 && p.sev <= 3)) return reject('invalid_event', 'sev must be 0..3');
    for (const k of ['cat', 'title', 'note', 'sev', 'loc', 'dept', 'floor', 'x', 'y']) {
      if (p[k] === undefined) continue;
      i[k] = (k === 'x' || k === 'y') ? num(p[k]) : TEXT_MAX[k] ? clipText(p[k], TEXT_MAX[k]) : p[k]; changed.push(k);
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

  // A logged-in-error or duplicate issue leaves the lists. The issue and
  // its log stay in state (events are never deleted), marked removed, so a
  // device that missed the removal cannot bring it back.
  'issue.remove'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    if (i.removed) return reject('invalid_event', 'issue already removed');
    i.removed = { at: e.at, by: e.actor?.device || null }; i.updated = e.at;
    i.log.push({ t: e.at, a: 'Removed', n: e.payload.note || '' });
    return null;
  },

  // A contractor's visit, from the work order (who came, what they did): a
  // log line, and the issue keeps its status until someone moves it.
  'issue.visit'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    const who = String(e.payload.who || '').trim().slice(0, 80), note = String(e.payload.note || '').trim().slice(0, 500);
    if (!who) return reject('invalid_event', 'say who visited: a name or a company');
    i.updated = e.at; i.visits = (i.visits || 0) + 1;
    i.log.push({ t: e.at, a: 'Contractor visited', n: who + (note ? ' · ' + note : '') });
    return null;
  },

  // A photo (an id the worker issued for the uploaded JPEG) on an issue, up
  // to four; remove detaches it. The log records both.
  'issue.photo'(s, e) {
    const i = issue(s, e); if (i.code) return i;
    const id = String(e.payload.photo);
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return reject('invalid_event', 'photo must be a photo id');
    const list = i.photos || [], has = list.some(p => p.id === id);
    if (e.payload.remove) { if (!has) return reject('not_found', 'that photo is not on this issue'); i.photos = list.filter(p => p.id !== id); i.log.push({ t: e.at, a: 'Photo removed', n: '' }); }
    else { if (has) return reject('exists', 'that photo is already on this issue'); if (list.length >= 4) return reject('invalid_event', 'an issue holds up to four photos'); i.photos = list; list.push({ id, at: e.at, by: e.actor?.device || null }); i.log.push({ t: e.at, a: 'Photo added', n: '' }); }
    i.updated = e.at;
    return null;
  },

  // ── Emergency assets ─────────────────────────────────────────────────
  // payload.from: the marker's key on a map published before markers had
  // ids (type_x_y). Its record moves to the id the first time it is used.
  'asset.service'(s, e) {
    adoptAsset(s, e);
    const a = (s.assets[e.entity.asset] ||= { intMonths: 12, due: null, log: [], updated: null });
    a.log.push({ t: e.at, a: 'Serviced', n: e.payload.note || '' });
    a.due = addMonths(storeDayOf(s, e.at), a.intMonths); a.updated = e.at;   // the store's day, not UTC's
    return null;
  },
  'asset.schedule'(s, e) {
    const m = e.payload.months;
    if (!(Number.isInteger(m) && m >= 1 && m <= MAX_INT_MONTHS)) return reject('invalid_event', `months must be 1..${MAX_INT_MONTHS}`);
    adoptAsset(s, e);
    const a = (s.assets[e.entity.asset] ||= { intMonths: 12, due: null, log: [], updated: null });
    a.intMonths = m;
    const last = a.log.filter(l => l.a === 'Serviced').map(l => l.t).sort().pop() || e.at;
    a.due = addMonths(storeDayOf(s, last), m); a.updated = e.at;
    a.log.push({ t: e.at, a: 'Schedule set', n: `${m} months` });
    return null;
  },

  // ── Pick list ────────────────────────────────────────────────────────
  'picklist.set'(s, e) {
    const items = e.payload.items.filter(i => i && typeof i.code === 'string').map(i => ({ code: i.code, completed: !!i.completed })).slice(0, 200);
    s.picklists[e.entity.device] = { items, at: e.at };
    return null;
  },

  // ── Inventory hub ────────────────────────────────────────────────────
  // The off-site master list replaces the register whole, as ShelfSearcher's
  // upload did; single pallets are added, called back and received by hand.
  'inventory.offsite.set'(s, e) {
    const rows = e.payload.rows.map(r => offsiteRow(r, e.at)).filter(Boolean);
    if (e.payload.rows.length && !rows.length) return reject('invalid_payload', 'no row has a pallet number');
    if (rows.length > OFFSITE_CAP) return reject('too_large', `the register keeps at most ${OFFSITE_CAP} pallets`);
    inv(s).offsite = Object.fromEntries(rows.map(r => [r.pid, r]));
    inv(s).offsiteAt = e.at; inv(s).offsiteSrc = String(e.payload.src || '').slice(0, 80);
    return null;
  },
  'inventory.offsite.add'(s, e) {
    const r = offsiteRow({ ...e.payload, pid: e.entity.pid }, e.at); if (!r) return reject('invalid_payload', 'a pallet number is needed');
    if (inv(s).offsite[r.pid]) return reject('exists', `pallet ${r.pid} is already on the register`);
    if (Object.keys(inv(s).offsite).length >= OFFSITE_CAP) return reject('too_large', `the register keeps at most ${OFFSITE_CAP} pallets`);
    inv(s).offsite[r.pid] = r; return null;
  },
  // A callback date, a received day ('' brings it back to off-site), a note.
  'inventory.offsite.update'(s, e) {
    const r = inv(s).offsite[String(e.entity.pid)]; if (!r) return reject('not_found', 'no such pallet on the register');
    const p = e.payload || {};
    for (const k of ['cb', 'rec']) if (k in p && !(p[k] === '' || p[k] === 'yes' || DAY.test(p[k]))) return reject('invalid_payload', `${k} must be a date (YYYY-MM-DD) or empty`);
    if ('cb' in p) r.cb = p.cb; if ('rec' in p) r.rec = p.rec; if ('note' in p) r.note = String(p.note || '').slice(0, 200);
    r.at = e.at; return null;
  },
  'inventory.load.add'(s, e) {
    const p = e.payload, id = String(e.entity.load);
    if (inv(s).loads[id]) return reject('exists', 'that load is already in the hub');
    const pallets = p.pallets.filter(x => x && x.pid && Array.isArray(x.items)).slice(0, LOAD_PALLET_CAP + 1);
    if (!pallets.length) return reject('invalid_payload', 'a load needs at least one pallet');
    if (pallets.length > LOAD_PALLET_CAP) return reject('too_large', `a load keeps at most ${LOAD_PALLET_CAP} pallets`);
    let lines = 0; for (const x of pallets) lines += x.items.length;
    if (lines > LOAD_LINE_CAP) return reject('too_large', `a load keeps at most ${LOAD_LINE_CAP} lines`);
    const status = LOAD_STATUS.includes(p.status) ? p.status : 'incoming';
    inv(s).loads[id] = { id, label: String(p.label).slice(0, 60), date: DAY.test(p.date || '') ? p.date : storeDayOf(s, e.at), status, recvDate: status === 'received' ? (DAY.test(p.recvDate || '') ? p.recvDate : storeDayOf(s, e.at)) : '', src: String(p.src || '').slice(0, 80),
      pallets: pallets.map(x => ({ pid: String(x.pid).slice(0, 20), items: x.items.filter(i => i && i.k).map(i => ({ k: String(i.k).slice(0, 20), d: String(i.d || '').slice(0, 60), q: Number(i.q) || 0, dept: /^\d{3}$/.test(i.dept || '') ? i.dept : '' })) })), at: e.at, by: e.actor?.device || null };
    const ids = Object.keys(inv(s).loads);
    if (ids.length > LOAD_CAP) for (const k of ids.sort((a, b) => (earlier(inv(s).loads[a].at, inv(s).loads[b].at) ? -1 : 1)).slice(0, ids.length - LOAD_CAP)) delete inv(s).loads[k];
    return null;
  },
  'inventory.load.status'(s, e) {
    const l = inv(s).loads[String(e.entity.load)]; if (!l) return reject('not_found', 'no such load');
    if (!LOAD_STATUS.includes(e.payload.status)) return reject('invalid_payload', `status is one of ${LOAD_STATUS.join(', ')}`);
    const rd = e.payload.recvDate; if (rd && !DAY.test(rd)) return reject('invalid_payload', 'recvDate must be YYYY-MM-DD');
    l.status = e.payload.status; l.recvDate = l.status === 'received' ? (rd || l.recvDate || storeDayOf(s, e.at)) : '';
    return null;
  },
  'inventory.load.remove'(s, e) {
    if (!inv(s).loads[String(e.entity.load)]) return reject('not_found', 'no such load');
    delete inv(s).loads[String(e.entity.load)]; return null;
  },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const inv = s => (s.inventory ||= { offsite: {}, offsiteAt: null, offsiteSrc: '', loads: {} });
function offsiteRow(r, at) {
  const pid = String(r?.pid ?? '').trim().slice(0, 20); if (!pid) return null;
  const day = v => (typeof v === 'string' && (DAY.test(v) || v === 'yes') ? v : '');
  return { pid, sent: day(r.sent), time: String(r.time || '').slice(0, 8), desc: String(r.desc || '').slice(0, 200), title: String(r.title || '').slice(0, 80),
    products: (Array.isArray(r.products) ? r.products : []).filter(x => x && /^\d{6,10}$/.test(String(x.kc))).slice(0, 20).map(x => ({ kc: String(x.kc), q: Number(x.q) || 0 })),
    req: String(r.req || '').slice(0, 40), cb: day(r.cb), rec: day(r.rec), note: String(r.note || '').slice(0, 200), at };
}

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
  if (i.removed && e.type !== 'issue.remove') return reject('not_found', `issue ${e.entity.issue} was removed`);
  return i;
}
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

// Adds calendar months to an ISO timestamp and returns an ISO date (YYYY-MM-DD).
function adoptAsset(s, e) {
  const from = typeof e.payload?.from === 'string' ? e.payload.from : '', to = e.entity.asset;
  if (from && from !== to && !s.assets[to] && s.assets[from]) { s.assets[to] = s.assets[from]; delete s.assets[from]; }
}
const storeDayOf = (s, at) => storeDay(new Date(at), s.settings?.tz || DEFAULT_TZ);
export function addMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

// What the weekly X/100 counts, as ShelfSearcher did (refresh-mode.js:573):
// with focus departments set, only marks in them; with none, every mark.
// deptOf(segment, mark) names a mark's department; an unknown one counts.
export function focusDone(marks, focus, deptOf = (_, m) => m.dept) {
  if (!focus?.length) return Object.keys(marks || {}).length;
  let n = 0;
  for (const [seg, m] of Object.entries(marks || {})) { const d = deptOf(seg, m); if (!d || focus.includes(d)) n += 1; }
  return n;
}
