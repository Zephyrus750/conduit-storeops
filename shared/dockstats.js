// Receiving analytics and the wallboard's reading of a live truck, ported
// from Decant Visualiser's analytics and live board (index.html
// renderAnalytics, workerPerf, downtimeSummary, insights). Pure: history
// rows from the reducer's historyRow, and a truck as the dock keeps it.
//
//   deptSpeed(history, now, days)        cartons an hour by micro-department (perDept, >30 worked minutes)
//   workerPerf(history, now, period)     per D-number over a window, against the window before it
//   downtimeBy(history, now, days)       downtime minutes by reason
//   teamCsv(history, now, period)        the team table as a spreadsheet (BOM, formula-guarded)
//   pacePoints(t, now)                   cumulative cartons decanted over the decant clock
//   personNow(t, now, rates)             this truck's rate per person against their 28-day rate
//   insights(t, now, opts)               the live board's plain-language flags

import { csvLines } from './records.js';
import { segWorkedMs, startOf } from './reducers/backdock.js';
import { estClear } from './dockplan.js';

const DAY = 86400000, MIN = 60000;
const ageDays = (row, now) => (now - Date.parse((row.date || String(row.id).slice(0, 10)) + 'T12:00:00')) / DAY;
const r1 = x => Math.round(x * 10) / 10;
export const PERIODS = { truck: 'Last truck', 7: '7 days', 14: '14 days', 30: '30 days' };
export const LOW_PCT = -8, TREND_PCT = -6;

export function deptSpeed(history, now = Date.now(), days = 30) {
  const acc = {};
  for (const row of history || []) {
    if (!(ageDays(row, now) <= days)) continue;
    for (const d of row.perDept || []) { const a = (acc[d.dept] ||= { dept: d.dept, cartons: 0, workedMins: 0, pallets: 0, trucks: 0 }); a.cartons += d.cartons || 0; a.workedMins += d.workedMins || 0; a.pallets += d.pallets || 0; a.trucks += 1; }
  }
  return Object.values(acc).filter(a => a.workedMins > 30).map(a => ({ ...a, workedMins: Math.round(a.workedMins), pallets: r1(a.pallets), rate: r1(a.cartons / (a.workedMins / 60)) })).sort((a, b) => b.rate - a.rate);
}

// The rows a period covers, and the same span before it (for the delta).
function windowRows(history, now, period) {
  const rows = (history || []).filter(r => !r.imported || r.perPerson?.length);
  if (period === 'truck') { const last = rows.at(-1); return { cur: last ? [last] : [], prev: rows.length > 1 ? [rows.at(-2)] : [] }; }
  const n = Number(period) || 7;
  return { cur: rows.filter(r => ageDays(r, now) <= n), prev: rows.filter(r => ageDays(r, now) > n && ageDays(r, now) <= 2 * n) };
}
function tally(rows) {
  const acc = {};
  for (const row of rows) for (const pp of row.perPerson || []) {
    const a = (acc[pp.pid] ||= { pid: pp.pid, trucks: 0, pallets: 0, cartons: 0, mins: 0, series: [] }), m = pp.workedMins ?? pp.mins ?? 0;
    a.trucks += 1; a.pallets += pp.pallets || 0; a.cartons += pp.cartons || 0; a.mins += m;
    if (m > 0) a.series.push(Math.round((pp.cartons || 0) / (m / 60)));
  }
  return acc;
}
export function workerPerf(history, now = Date.now(), period = 7) {
  const { cur, prev } = windowRows(history, now, period), a = tally(cur), b = tally(prev);
  const all = tally((history || []).slice(-10));
  return Object.values(a).map(x => {
    const rate = x.mins ? r1(x.cartons / (x.mins / 60)) : 0, p = b[x.pid], prevRate = p?.mins ? r1(p.cartons / (p.mins / 60)) : null;
    const delta = prevRate ? Math.round((rate - prevRate) / prevRate * 100) : null;
    return { pid: x.pid, trucks: x.trucks, pallets: r1(x.pallets), cartons: Math.round(x.cartons), mins: Math.round(x.mins), rate, prevRate, delta, trendingDown: delta !== null && delta <= TREND_PCT, spark: (all[x.pid]?.series || []).slice(-10) };
  }).sort((x, y) => y.cartons - x.cartons);
}

export function downtimeBy(history, now = Date.now(), days = null) {
  const acc = {}; let total = 0;
  for (const row of history || []) {
    if (days && !(ageDays(row, now) <= days)) continue;
    for (const d of row.downtime || []) { const k = (d.kind && d.kind !== 'halt' ? d.kind + ':' : '') + d.reason, a = (acc[k] ||= { key: k, kind: d.kind || 'halt', reason: d.reason, mins: 0, count: 0, trucks: new Set() }); a.mins += d.mins || 0; a.count += d.count || 0; a.trucks.add(row.id); total += d.mins || 0; }
  }
  return { total, rows: Object.values(acc).map(a => ({ ...a, trucks: a.trucks.size, share: total ? Math.round(a.mins / total * 100) : 0 })).sort((x, y) => y.mins - x.mins) };
}

export function teamCsv(history, now = Date.now(), period = 7) {
  const rows = workerPerf(history, now, period).map(r => [r.pid, r.trucks, r.pallets, r.cartons, r.mins, r.rate]);
  return '﻿' + csvLines(['decanter', 'trucks', 'pallets', 'cartons', 'worked mins', 'rate ctn/h'], rows);
}

// Cumulative cartons decanted against the decant clock: [{ t, ctn }].
export function pacePoints(t, now = Date.now()) {
  const from = Date.parse(startOf(t)); if (!(from > 0)) return [];
  const done = Object.values(t.pallets || {}).filter(p => !p.excluded && p.status === 'done' && p.doneAt).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  const pts = [{ t: from, ctn: 0 }]; let n = 0;
  for (const p of done) { n += p.cartons || 0; pts.push({ t: Date.parse(p.doneAt), ctn: n }); }
  pts.push({ t: Math.max(now, pts.at(-1).t), ctn: n });
  return pts;
}

// This truck per person: cartons credited on done pallets (shared by worked
// time), worked minutes so far, and the rate against their 28-day rate.
export function personNow(t, now = Date.now(), rates = {}) {
  const acc = {};
  for (const m of t.team || []) acc[m.pid] = { pid: m.pid, cartons: 0, mins: 0, onNow: null };
  for (const p of Object.values(t.pallets || {})) {
    if (p.excluded) continue;
    const by = {}; let total = 0;
    for (const s of p.segments || []) { const w = segWorkedMs(t, s, now); by[s.pid] = (by[s.pid] || 0) + w; total += w; if (!s.end && acc[s.pid]) acc[s.pid].onNow = p.ref; }
    for (const [pid, w] of Object.entries(by)) { const a = (acc[pid] ||= { pid, cartons: 0, mins: 0, onNow: null }); a.mins += w / MIN; if (p.status === 'done' && !p.suspect) a.cartons += (p.cartons || 0) * (total ? w / total : 0); }
  }
  return Object.values(acc).map(a => {
    const rate = a.mins >= 5 ? Math.round(a.cartons / (a.mins / 60)) : null, norm = rates?.[a.pid]?.eligible ? rates[a.pid].rate28d : null;
    const delta = rate !== null && norm ? Math.round((rate - norm) / norm * 100) : null;
    return { ...a, cartons: Math.round(a.cartons), mins: Math.round(a.mins), rate, norm, delta, low: delta !== null && delta <= LOW_PCT };
  });
}

// Plain-language flags for the board (DV's insights): people under their
// norm with real time in, suspect pallets, pallets running long, the
// forecast against the goal; "All steady" when nothing needs a word.
export function insights(t, now = Date.now(), opts = {}) {
  const out = [];
  for (const p of personNow(t, now, opts.rates)) if (p.low && p.mins >= 20) out.push({ tone: 'warn', text: `${p.pid} is ${-p.delta}% under their 28-day rate (${p.rate} against ${p.norm} ctn/h).` });
  const sus = Object.values(t.pallets || {}).filter(p => p.suspect && !p.excluded);
  if (sus.length) out.push({ tone: 'warn', text: `${sus.length} pallet${sus.length === 1 ? '' : 's'} finished suspiciously fast (${sus.map(p => p.ref).join(', ')}): check for a missed start.` });
  for (const p of Object.values(t.pallets || {})) {
    if (p.excluded || p.status !== 'active' || !p.expectedMins) continue;
    const w = (p.segments || []).reduce((n, s) => n + segWorkedMs(t, s, now), 0) / MIN;
    if (w > p.expectedMins + 5) out.push({ tone: 'warn', text: `${p.ref} is ${Math.round(w - p.expectedMins)} min over its ${p.expectedMins}-minute estimate.` });
  }
  const at = estClear(t, now, opts), goal = Date.parse(t.goalAt);
  if (at && goal) { const d = Math.round((at - goal) / MIN); out.push(d > 0 ? { tone: 'bad', text: `Forecast finish is ${d} min past the goal.` } : { tone: 'good', text: `On track: forecast finish ${-d} min ahead of the goal.` }); }
  if (!out.length) out.push({ tone: 'good', text: 'All steady.' });
  return out;
}
