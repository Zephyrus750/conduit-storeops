// Stockroom trends, ported from K2B (app.js 8455–9046): when backfill work
// happens and how accurate it is, over the visits the backfill projection
// keeps (a bay marked ready or submitted, with its metrics). Pure.
//
//   visitsOf(subs, { today, days, tz, deptFor })   the visits in the window, on the store's clock
//   trendsOf(visits)                               tiles, heatmap, patterns, accuracy, by department, by location
//   delta(values)                                  newer half against older half (needs 4), or null
//   peakDay(counts)                                the weekday that stands out, 'sole', or null
//   avgGap(dates)                                  mean days between unique visit dates (needs 2), or null

import { storeParts, addDays } from './time.js';

export const BANDS = [['Before 9am', 0, 9], ['9am–12pm', 9, 12], ['12–5pm', 12, 17], ['After 5pm', 17, 24]];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const GOAL = 93;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const r1 = x => x == null ? null : Math.round(x * 10) / 10;

export function visitsOf(subs, { today, days = 14, tz, deptFor = () => '' } = {}) {
  const from = days ? addDays(today, -(days - 1)) : '0000';
  const out = [];
  for (const s of Object.values(subs || {})) {
    if (s.requestedOnly || s.status === 'pending' || !s.metrics || s.date < from || s.date > today) continue;
    const at = s.readyAt || s.submittedDoneAt || null, p = at ? storeParts(at, tz) : null;
    const wd = (new Date(s.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    out.push({ date: s.date, loc: s.bay, dept: deptFor(s.bay) || '', acc: Number.isFinite(s.metrics.accuracy) ? s.metrics.accuracy : null, wd, hour: p ? p.hh + p.mm / 60 : null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function delta(values) {
  const v = values.filter(x => x != null); if (v.length < 4) return null;
  const h = Math.floor(v.length / 2), d = mean(v.slice(h)) - mean(v.slice(0, h));
  return { d: r1(d), dir: d >= 2 ? 'up' : d <= -2 ? 'down' : 'steady' };
}
export function peakDay(counts) {
  const total = counts.reduce((a, b) => a + b, 0); if (total < 3) return null;
  const active = counts.filter(Boolean).length, max = Math.max(...counts), i = counts.indexOf(max);
  if (active === 1) return { day: i, sole: true };
  return max >= 1.6 * (total / active) ? { day: i, sole: false } : null;
}
export function avgGap(dates) {
  const u = [...new Set(dates)].sort(); if (u.length < 2) return null;
  let n = 0; for (let i = 1; i < u.length; i++) n += (Date.parse(u[i]) - Date.parse(u[i - 1])) / 86400000;
  return r1(n / (u.length - 1));
}
const band = h => BANDS.findIndex(([, a, b]) => h >= a && h < b);

export function trendsOf(visits, today) {
  const accs = visits.map(v => v.acc).filter(x => x != null), dates = [...new Set(visits.map(v => v.date))];
  const byWd = Array(7).fill(0), byBand = Array(4).fill(0), heat = Array.from({ length: 7 }, () => Array(4).fill(0)); let timed = 0;
  for (const v of visits) { byWd[v.wd]++; if (v.hour != null) { timed++; const b = band(v.hour); byBand[b]++; heat[v.wd][b]++; } }
  const daysPer = Array(7).fill(0); for (const d of dates) daysPer[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7]++;
  const perDay = {}; for (const v of visits) if (v.acc != null) (perDay[v.date] ||= []).push(v.acc);
  const accPerDay = Object.entries(perDay).sort((a, b) => a[0].localeCompare(b[0])).map(([date, xs]) => ({ date, acc: Math.round(mean(xs)) }));
  const group = key => { const m = new Map(); for (const v of visits) { const k = key(v); if (!m.has(k)) m.set(k, []); m.get(k).push(v); } return m; };
  const since = d => today ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : null;
  const deptWeek = [...group(v => v.dept || '').entries()].map(([dept, vs]) => { const c = Array(7).fill(0); for (const v of vs) c[v.wd]++; return { dept, counts: c, total: vs.length, peak: peakDay(c) }; }).sort((a, b) => b.total - a.total);
  const byDept = [...group(v => v.dept || '').entries()].map(([dept, vs]) => ({ dept, visits: vs.length, locs: new Set(vs.map(v => v.loc)).size, acc: r1(mean(vs.map(v => v.acc).filter(x => x != null))), gap: avgGap(vs.map(v => v.date)) })).sort((a, b) => b.visits - a.visits);
  const byLoc = [...group(v => v.loc).entries()].map(([loc, vs]) => { const c = Array(7).fill(0); for (const v of vs) c[v.wd]++; const a = vs.map(v => v.acc).filter(x => x != null); const last = vs.map(v => v.date).sort().at(-1); return { loc, dept: vs[0].dept, times: vs.length, week: c, peak: peakDay(c), accs: a.slice(-12), avg: r1(mean(a)), trend: delta(a), gap: avgGap(vs.map(v => v.date)), lastDays: since(last) }; })
    .sort((a, b) => b.times - a.times || String(a.loc).localeCompare(String(b.loc), 'en', { numeric: true }));
  const busiest = byWd.some(Boolean) ? byWd.indexOf(Math.max(...byWd)) : null;
  return {
    visits: visits.length, activeDays: dates.length, perDay: dates.length ? r1(visits.length / dates.length) : 0,
    avgAcc: r1(mean(accs)), trend: delta(accPerDay.map(x => x.acc)), busiest, timed,
    heat, byWd, daysPer, byBand, accPerDay, deptWeek, byDept, byLoc,
    repeat: byLoc.filter(l => l.times > 1).length, once: byLoc.filter(l => l.times === 1).length,
  };
}
