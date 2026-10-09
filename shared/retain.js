// Retention (decision 29): what stays in a store's live state. The whole
// state is saved as one row (a Durable Object row holds at most 2 MB) and
// sent to every device, so finished records are trimmed to a summary after
// KEEP_DETAIL_DAYS and leave the live state after KEEP_DAYS. Nothing leaves
// the event log, and the worker copies every history row it is about to
// drop into its archive table first, so History and the CSV exports keep
// them. Pure: the store.retain reducer runs it on the worker and on every
// device, from the store day the worker logged.
//
//   retiring(state, day)  history rows the next retain(state, day) drops: [{ kind, key, date, row }]
//   rowKey(kind, row)     the archive key of a history row (the worker drops archived rows still live)
//   retain(state, day)    trims and drops in place; returns what it did, per slice

import { addDays } from './time.js';
import { historyRows } from './records.js';

export const KEEP_DETAIL_DAYS = 14, KEEP_DAYS = 60, KEEP_ISSUE_DAYS = 180;
const KEEP_WEEKS = 13, KEEP_CYCLES = 13, KEEP_STOCKTAKES = 10, KEEP_DOCK_HISTORY = 500;
const keepNewest = (obj, n) => { const keys = Object.keys(obj || {}).sort(); for (const k of keys.slice(0, Math.max(0, keys.length - n))) delete obj[k]; return Math.max(0, keys.length - n); };

export const rowKey = (kind, r) => kind === 'backfill' ? `${r.bay}:${r.date}` : kind === 'adjustments' ? `${r.date}:${r.keycode}` : kind === 'receiving' ? r.truck : kind === 'cages' ? r.cage : '';

// The backfill, adjustment and receiving history rows that fall out of the
// live state at the next retain: the worker archives these before it logs
// store.retain.
export function retiring(state, day) {
  const d60 = addDays(day, -KEEP_DAYS), out = [];
  const add = (kind, r) => out.push({ kind, key: rowKey(kind, r), date: r.date, row: r });
  const subs = new Set(Object.values(state.backfill?.subs || {}).filter(s => s.status !== 'pending' && s.date < d60).map(s => `${s.bay}:${s.date}`));
  if (subs.size) for (const r of historyRows(state, 'backfill')) if (subs.has(rowKey('backfill', r))) add('backfill', r);
  for (const r of historyRows(state, 'adjustments')) if (r.date < d60) add('adjustments', r);
  const over = (state.dock?.history || []).length - KEEP_DOCK_HISTORY;
  if (over > 0) for (const r of historyRows(state, 'receiving').slice(-over)) add('receiving', r);   // newest first, so the oldest are last
  return out;
}

export function retain(s, day) {
  const d14 = addDays(day, -KEEP_DETAIL_DAYS), d60 = addDays(day, -KEEP_DAYS), d180 = addDays(day, -KEEP_ISSUE_DAYS), done = {};
  const n = k => { done[k] = (done[k] || 0) + 1; };

  // Stockroom: finished bays lose their code lists after 14 days (counts and
  // metrics stay) and leave after 60; stale claims (a desk closed mid-review)
  // are released after a day; requested lists and day lists go after 14.
  const subs = s.backfill?.subs || {};
  for (const [key, sub] of Object.entries(subs)) {
    if (sub.status === 'pending') continue;
    if (sub.date < d60) { delete subs[key]; n('backfill'); continue; }
    if (sub.date < d14 && !sub.trimmed) {
      const codes = Object.values(sub.codes || {});
      sub.codeCount = codes.length; sub.scannedCount = codes.filter(c => c.scanned).length;
      sub.codes = {}; delete sub.removed; delete sub.system; delete sub.devices; sub.trimmed = true; n('backfillTrimmed');
    }
  }
  for (const d of Object.keys(s.backfill?.requested || {})) if (d < d14) { delete s.backfill.requested[d]; n('requested'); }
  const dayAgo = addDays(day, -1);
  for (const [b, c] of Object.entries(s.backfill?.claims || {})) if (!c?.at || String(c.at).slice(0, 10) < dayAgo) { delete s.backfill.claims[b]; n('claims'); }
  for (const d of Object.keys(s.adjustments || {})) if (d < d60) { delete s.adjustments[d]; n('adjustments'); }
  for (const d of Object.keys(s.daylist || {})) if (d < d14) { delete s.daylist[d]; n('daylist'); }

  // Back dock: a closed truck keeps its pallets but drops its manifest's
  // item lines after 14 days, and leaves after 60 (its history row stays).
  for (const [id, t] of Object.entries(s.dock?.trucks || {})) {
    if (t.status !== 'closed') continue;
    const d = id.slice(0, 10);
    if (d < d60) { delete s.dock.trucks[id]; n('trucks'); continue; }
    if (d < d14 && !t.trimmed && t.manifest?.consols) { for (const c of t.manifest.consols) c.items = []; t.trimmed = true; n('trucksTrimmed'); }
  }
  if ((s.dock?.history || []).length > KEEP_DOCK_HISTORY) { done.dockHistory = s.dock.history.length - KEEP_DOCK_HISTORY; s.dock.history.splice(0, done.dockHistory); }
  for (const d of Object.keys(s.plan?.days || {})) if (d < d60) { delete s.plan.days[d]; n('planDays'); }

  // Floor: the last 13 refresh weeks and label cycles, the 10 newest ended
  // stocktakes, closed or removed issues for 180 days.
  if (s.refresh) { done.refreshWeeks = keepNewest(s.refresh.weeks, KEEP_WEEKS); keepNewest(s.refresh.unmarked, KEEP_WEEKS); }
  if (s.labels) { done.labelCycles = keepNewest(s.labels.checks, KEEP_CYCLES); keepNewest(s.labels.variances, KEEP_CYCLES); }
  const ended = Object.entries(s.stocktake?.sessions || {}).filter(([, x]) => x.ended).sort((a, b) => String(b[1].startedAt || '').localeCompare(String(a[1].startedAt || '')));
  for (const [id] of ended.slice(KEEP_STOCKTAKES)) { delete s.stocktake.sessions[id]; n('stocktakes'); }
  for (const [id, i] of Object.entries(s.issues || {})) if ((i.removed || i.status === 'completed') && String(i.updated || '').slice(0, 10) < d180) { delete s.issues[id]; n('issues'); }

  // Inventory: a received load keeps one summary line per department after
  // 14 days (its pallet count and units stay for Trends).
  for (const l of Object.values(s.inventory?.loads || {})) {
    if (l.summary || l.status !== 'received' || !(l.recvDate && l.recvDate < d14)) continue;
    const by = {}; for (const p of l.pallets || []) for (const it of p.items || []) by[it.dept || ''] = (by[it.dept || ''] || 0) + (Number(it.q) || 0);
    l.cartons = (l.pallets || []).length; l.pallets = [{ pid: 'summary', items: Object.entries(by).map(([dept, q]) => ({ k: dept || '-', d: '', q, dept })) }]; l.summary = true; n('loadsSummarised');
  }

  // Devices not seen for 60 days.
  for (const [id, d] of Object.entries(s.devices || {})) if (String(d?.last || '').slice(0, 10) < d60) { delete s.devices[id]; n('devices'); }
  return done;
}
