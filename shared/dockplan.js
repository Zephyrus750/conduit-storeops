// Decant planning, ported from Decant Visualiser's facilitator (index.html
// fSchedule, fEstClear, autoBalance, finishGuard; action.mjs recomputeRates
// and the default goal). Pure: the device and the worker run it alike.
//
//   expOf(p, mpc)                    a pallet's expected minutes
//   schedule(t, now, opts)           each person's run: what they are on, then their queue
//   estClear(t, now, opts)           when the truck clears (null while a hold-up is open, or no crew)
//   balance(t, now, mode, opts)      fresh queues: longest first, or tubs first; within finish times
//   finishCheck(t, pid, ref, now, opts) how far a pallet would run past the person's finish
//   personalRates(history, now)      28- and 7-day cartons an hour per D-number from history
//   defaultGoal(history, startIso)   a goal from the recent clear times
//
// opts: { basis: 'x2' | 'personal', rates: personalRates(), mpc: minutes per carton }
// A person's rostered start and finish are HH:MM on the truck's day (team
// member .start / .finish); before the start they are not yet available.

import { segWorkedMs } from './reducers/backdock.js';

const MIN = 60000;
export const RATE_WINDOW_DAYS = 28, RATE_MIN_PALLETS = 10;

export const expOf = (p, mpc = 0.5) => p.expectedMins ?? (p.cartons ? p.cartons * mpc : null);
const live = p => !p.excluded;
const workedOn = (t, p, now, pid) => p.segments.filter(s => !pid || s.pid === pid).reduce((n, s) => n + segWorkedMs(t, s, now), 0) / MIN;
const openOn = p => p.segments.filter(s => !s.end);
// HH:MM on the truck's day, as local time.
export function atTime(t, hm) {
  if (!/^\d{2}:\d{2}$/.test(hm || '')) return null;
  const day = (t.id || '').slice(0, 10) || new Date().toISOString().slice(0, 10), [y, mo, d] = day.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi).getTime();
}
const startMs = (t, m, now) => Math.max(now, atTime(t, m.start) ?? now);
const finishMs = (t, m) => atTime(t, m.finish);
const cutters = t => (t.team || []).filter(m => !m.role || m.role === 'cutter');

// A pallet's minutes for one person: their own rate on the personal basis
// (when they have one), else the pallet's estimate (60 when it has none).
export function durFor(p, pid, opts = {}) {
  const r = opts.basis === 'personal' ? opts.rates?.[pid] : null;
  if (r?.eligible && r.rate28d > 0 && p.cartons) return p.cartons / r.rate28d * 60;
  return expOf(p, opts.mpc) ?? 60;
}

export function schedule(t, now = Date.now(), opts = {}) {
  const ps = Object.values(t.pallets || {}).filter(live), queues = t.plan?.queues || {}, queued = new Set(Object.values(queues).flat());
  const out = {};
  for (const m of t.team || []) {
    let cur = startMs(t, m, now); const items = [];
    const add = (p, tag, mins) => { if (mins <= 0) return; items.push({ ref: p.ref, tag, start: cur, end: cur + mins * MIN }); cur += mins * MIN; };
    // What they are on now (a shared pallet's remaining time is split).
    for (const p of ps) if (p.status !== 'done' && openOn(p).some(s => s.pid === m.pid)) add(p, 'now', Math.max(0, durFor(p, m.pid, opts) - workedOn(t, p, now)) / Math.max(1, openOn(p).length));
    // Paused pallets left with them and not queued for anyone.
    for (const p of ps) if (p.status === 'paused' && p.assignedTo === m.pid && !queued.has(p.ref)) add(p, 'paused', Math.max(0, durFor(p, m.pid, opts) - workedOn(t, p, now)));
    for (const ref of queues[m.pid] || []) { const p = t.pallets?.[ref]; if (!p || !live(p) || p.status === 'done' || openOn(p).length) continue; add(p, 'queued', Math.max(0, durFor(p, m.pid, opts) - workedOn(t, p, now))); }
    out[m.pid] = { items, finish: items.length ? cur : null, idleFrom: cur };
  }
  return out;
}

export function estClear(t, now = Date.now(), opts = {}) {
  if (!(t.team || []).length || (t.halts || []).some(h => !h.end)) return null;
  const sched = schedule(t, now, opts), cs = cutters(t); if (!cs.length) return null;
  const free = Object.fromEntries(cs.map(m => [m.pid, sched[m.pid]?.finish ?? startMs(t, m, now)]));
  const queued = new Set(Object.values(t.plan?.queues || {}).flat());
  const pool = Object.values(t.pallets || {}).filter(p => live(p) && p.status !== 'done' && !p.segments.length && !queued.has(p.ref)).sort((a, b) => (expOf(b, opts.mpc) ?? 60) - (expOf(a, opts.mpc) ?? 60));
  for (const p of pool) { let best = null; for (const pid of Object.keys(free)) { const end = free[pid] + durFor(p, pid, opts) * MIN; if (best === null || end < best[1]) best = [pid, end]; } free[best[0]] = best[1]; }
  let end = Math.max(...Object.values(free));
  for (const p of Object.values(t.pallets || {})) if (p.doneAt) end = Math.max(end, Date.parse(p.doneAt));
  return end;
}

// Auto-balance (cutters only): what each is on now plus paused pallets left
// with them is their base; every unstarted pallet is dealt out, longest
// first (or chep tubs first, then the rest), to whoever would finish it
// soonest, keeping within each person's finish time where anyone can.
export function balance(t, now = Date.now(), mode = 'longest', opts = {}) {
  const cs = cutters(t); if (!cs.length) return { queues: {}, overFinish: 0, error: 'no cutters on the team: set roles first' };
  const ps = Object.values(t.pallets || {}).filter(live), free = {}, fin = {};
  for (const m of cs) {
    let at = startMs(t, m, now);
    for (const p of ps) if (p.status !== 'done' && (openOn(p).some(s => s.pid === m.pid) || (p.status === 'paused' && p.assignedTo === m.pid))) at += Math.max(0, durFor(p, m.pid, opts) - workedOn(t, p, now)) * MIN / Math.max(1, openOn(p).length || 1);
    free[m.pid] = at; fin[m.pid] = finishMs(t, m);
  }
  const pot = ps.filter(p => p.status !== 'done' && !p.segments.length);
  const size = p => expOf(p, opts.mpc) ?? 60;
  pot.sort((a, b) => mode === 'tubs' ? ((a.ptype === 'chep' ? 0 : 1) - (b.ptype === 'chep' ? 0 : 1)) || size(b) - size(a) : size(b) - size(a));
  const queues = Object.fromEntries(cs.map(m => [m.pid, []])); let overFinish = 0;
  for (const p of pot) {
    const ends = cs.map(m => [m.pid, free[m.pid] + durFor(p, m.pid, opts) * MIN]);
    const within = ends.filter(([pid, end]) => !fin[pid] || end <= fin[pid]);
    const pick = (within.length ? within : ends).sort((a, b) => a[1] - b[1])[0];
    if (!within.length) overFinish += 1;
    queues[pick[0]].push(p.ref); free[pick[0]] = pick[1];
  }
  return { queues, overFinish };
}

// The finish guard: minutes a pallet would run past the person's rostered
// finish, queued after their run (or started now), or 0.
export function finishCheck(t, pid, ref, now = Date.now(), opts = {}, startNow = false) {
  const m = (t.team || []).find(x => x.pid === pid), p = t.pallets?.[ref]; if (!m || !p) return null;
  const fin = finishMs(t, m); if (!fin) return null;
  const from = startNow ? now : (schedule(t, now, opts)[pid]?.finish ?? startMs(t, m, now));
  const end = from + Math.max(0, durFor(p, pid, opts) - workedOn(t, p, now)) * MIN;
  return end > fin ? { overMins: Math.round((end - fin) / MIN), end, finish: fin } : null;
}

// Personal rates from history: cartons over worked hours in the last 28
// days (and 7), a rate counting once a person has 10 or more pallets.
export function personalRates(history, now = Date.now()) {
  const acc = {};
  for (const row of history || []) {
    const age = (now - Date.parse((row.date || row.id?.slice(0, 10)) + 'T12:00:00')) / 86400000; if (!(age <= RATE_WINDOW_DAYS)) continue;
    for (const pp of row.perPerson || []) {
      const a = (acc[pp.pid] ||= { pallets28d: 0, c28: 0, m28: 0, c7: 0, m7: 0 }), mins = pp.workedMins ?? pp.mins ?? 0;
      a.pallets28d += pp.pallets || 0; a.c28 += pp.cartons || 0; a.m28 += mins;
      if (age <= 7) { a.c7 += pp.cartons || 0; a.m7 += mins; }
    }
  }
  const r1 = x => Math.round(x * 10) / 10;
  return Object.fromEntries(Object.entries(acc).map(([pid, a]) => [pid, { rate28d: a.m28 ? r1(a.c28 / (a.m28 / 60)) : 0, rate7d: a.m7 ? r1(a.c7 / (a.m7 / 60)) : 0, pallets28d: r1(a.pallets28d), eligible: a.pallets28d >= RATE_MIN_PALLETS && a.m28 > 0 }]));
}

// A default goal: the decant start plus the mean clear time of the last ten
// trucks (at least three), rounded up to five minutes.
export function defaultGoal(history, startIso) {
  const rows = (history || []).filter(r => r.clearMins > 0).slice(-10), from = Date.parse(startIso);
  if (rows.length < 3 || !(from > 0)) return null;
  const avg = rows.reduce((n, r) => n + r.clearMins, 0) / rows.length;
  return avg > 10 ? new Date(from + Math.ceil(avg / 5) * 5 * MIN).toISOString() : null;
}

// Take 5 before the decant (Decant Visualiser's pre-start checklist).
export const TAKE5 = [
  ['brief', 'Team briefed', 'Everyone knows the plan, their role and their start time.'],
  ['safe', 'Team safety', 'Fit for work, PPE on, anything to flag is raised.'],
  ['equip', 'Equipment safe', 'Box cutters, cages and work tables checked and ready.'],
  ['area', 'Area clear', 'Dock clear of spills, obstructions and trip hazards.'],
  ['goal', 'Goal agreed', 'Target finish set and shared with the team.'],
];
