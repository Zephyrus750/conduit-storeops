// The owner console's numbers for one store, from its state (Vector's
// console KPIs): backfill today and over seven days with accuracy and the
// bays the rollover auto-closed yesterday, the dock's last week with its
// clear times, this week's location refresh against its target, the last
// seven days' shrink from the Adjustments lists, open issues, the devices
// it has seen with their app versions and errors, and set-up alerts: what
// is missing before the store can use what it is entitled to. Pure: the
// store object serves it, tests build state by hand.
//
//   storeKpis(state, { today, caps, now, bytes, cartons }) →
//     { backfill, dock, refresh, shrink, floor, devices, alerts: [{ level, text }], bytes }
//
// cartons is the store's carton profiles document (/profiles): the units a
// carton the "up to one carton" shrink needs, as Adjustments reads them.

import { addDays } from './time.js';
import { settingsOf } from './reducers/store.js';
import { focusDone, REFRESH_TARGET } from './reducers/floor.js';
import { isoWeek, shrinkParts } from './stockintel.js';
import { clearTime } from './dockstats.js';

const DAY = 86400000;
export function storeKpis(state, { today, caps = [], now = Date.now(), bytes = 0, cartons = null } = {}) {
  const has = a => caps.includes(a), alerts = [], warn = (level, text) => alerts.push({ level, text });
  const yesterday = addDays(today, -1), weekFrom = addDays(today, -6);
  const subs = Object.values(state.backfill?.subs || {});
  const done = subs.filter(s => s.status !== 'pending' && s.metrics);
  const week = done.filter(s => s.date >= weekFrom && s.date <= today), accs = week.map(s => s.metrics.accuracy).filter(Number.isFinite);
  const backfill = has('stockroom') ? {
    today: done.filter(s => s.date === today).length,
    pending: subs.filter(s => s.date === today && s.status === 'pending').length,
    requested: (state.backfill?.requested?.[today] || []).length,
    week: week.length,
    accuracy: accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null,
    autoClosed: done.filter(s => s.date === yesterday && s.autoSubmitted).length,
  } : null;
  const hist = (state.dock?.history || []).filter(r => (r.date || '') >= weekFrom);
  const open = Object.entries(state.dock?.trucks || {}).filter(([, t]) => t.status !== 'closed');
  const dock = has('backdock') ? {
    trucks: hist.length, cartons: hist.reduce((n, r) => n + (r.cartons || 0), 0),
    clearMins: hist.length ? Math.round(hist.reduce((n, r) => n + (r.clearMins || 0), 0) / hist.length) : null,
    open: open.length, manifests: Object.values(state.dock?.manifests || {}).filter(m => (m.publishedAt || '').slice(0, 10) >= weekFrom).length,
    // Average clear time of the trucks finished in the last 7 and 28 days (Receiving history's clock).
    clear7: clearTime(state.dock?.history, now, 7), clear28: clearTime(state.dock?.history, now, 28),
  } : null;
  // Location refresh this week: what the PC's "X / 100 this week" counts
  // (focus departments only, when the week has any), and every mark.
  const rweek = isoWeek(today), marks = state.refresh?.weeks?.[rweek] || {}, focus = state.refresh?.focus?.[rweek] || [];
  const refresh = has('floor') ? { week: rweek, counted: focusDone(marks, focus), done: Object.keys(marks).length, target: REFRESH_TARGET, focus: focus.length } : null;
  const shrink = has('stockroom') ? shrinkWeek(state.adjustments, weekFrom, today, cartonLookup(cartons)) : null;
  const issues = Object.values(state.issues || {}).filter(i => !i.removed && !['closed', 'completed'].includes(i.status));
  const floor = has('floor') ? { openIssues: issues.length, urgent: issues.filter(i => (i.sev || 0) >= 2).length } : null;
  const devs = Object.entries(state.devices || {}), recent = devs.filter(([, d]) => now - Date.parse(d.last) < DAY);
  const versions = {}; for (const [, d] of recent) if (d.app) versions[d.app] = (versions[d.app] || 0) + 1;
  const devices = { seen24h: recent.length, total: devs.length, versions, errors: recent.filter(([, d]) => d.lastError).map(([id, d]) => ({ id, error: d.lastError, at: d.last })), outbox: recent.reduce((n, [, d]) => n + (d.outbox || 0), 0) };

  // Set-up: what the store still needs.
  if (has('floor') && !state.map?.version) warn('bad', 'No map published: the Floor tools have nothing to show.');
  if (has('stockroom') && !(settingsOf(state).deptRanges || []).length) warn('warn', 'No stockroom bay ranges: History and Trends cannot group by department (Backfill review › Departments).');
  if (has('backdock') && !Object.keys(state.dock?.manifests || {}).length) warn('warn', 'No manifest published yet.');
  if (has('backdock') && dock && open.length > 1) warn('warn', `${open.length} trucks open at once.`);
  if (!devs.length) warn('warn', 'No device has signed in yet.');
  else if (!recent.length) warn('warn', 'No device seen in the last 24 hours.');
  if (devices.errors.length) warn('warn', `${devices.errors.length} device${devices.errors.length === 1 ? '' : 's'} reporting an error.`);
  if (devices.outbox > 0) warn('warn', `${devices.outbox} change${devices.outbox === 1 ? '' : 's'} waiting in device outboxes.`);
  // The live state is one 2 MB row; retention keeps it small. Over 1.2 MB, say so.
  if (bytes > 1_200_000) warn(bytes > 1_700_000 ? 'bad' : 'warn', `The store's live data is ${(bytes / 1e6).toFixed(1)} MB of the 2 MB a store can hold.`);
  if (backfill?.autoClosed) warn('info', `${backfill.autoClosed} bay${backfill.autoClosed === 1 ? '' : 's'} auto-closed at yesterday's rollover.`);
  return { backfill, dock, refresh, shrink, floor, devices, alerts, bytes };
}

// Units a carton for a keycode, as the PC's Adjustments reads it: the
// profile when three or more trucks agree, else the latest delivery's.
const cartonLookup = doc => kc => doc?.profiles?.[kc]?.ctn || doc?.last?.[kc]?.ctn || null;

// The last seven days' Adjustments lists (the list days weekFrom to today)
// in the three parts the list adds up (shrinkParts): below zero back to
// zero, from zero up to one carton, and the two combined. Over every item
// at zero or below on the lists (listed) and over those ticked off as
// adjusted (adjusted). Valued at the report's price; an item without one
// is counted in unpriced, and one without a carton size in noSize.
export function shrinkWeek(adjustments, from, to, cartonOf = () => null) {
  const zero = () => ({ toZero: 0, zeroToCarton: 0, combined: 0 });
  const r = { items: 0, adjustedItems: 0, priced: 0, unpriced: 0, noSize: 0, listed: zero(), adjusted: zero() };
  for (const [date, day] of Object.entries(adjustments || {})) {
    if (date < from || date > to) continue;
    for (const [kc, it] of Object.entries(day || {})) {
      if (!(Number(it?.qty) <= 0)) continue;
      r.items++; if (it.done) r.adjustedItems++;
      if (!(Number(it.price) > 0)) { r.unpriced++; continue; }
      r.priced++;
      const ctn = cartonOf(kc); if (!ctn) r.noSize++;
      const p = shrinkParts(it.qty, ctn, it.price);
      for (const k of ['toZero', 'zeroToCarton', 'combined']) { r.listed[k] += p[k]; if (it.done) r.adjusted[k] += p[k]; }
    }
  }
  for (const part of [r.listed, r.adjusted]) for (const k of Object.keys(part)) part[k] = Math.round(part[k] * 100) / 100;
  return r;
}
