// Every published manifest's day and truck, and what came in over a
// period. Pure and shared: the worker answers GET /manifests/stats with it,
// and the Manifests view places its list and its suggestions the same way.
//
//   manSummary(doc)                 a report's counts for the stats: consols, cartons, units, keycodes,
//                                   { dept: [cartons, units] } and { keycode: [units, cartons, dept] }
//   placeIndex(state)               manNo → { day, truck, via } for every report the dock has placed.
//                                   via: truck (on the dock), history (finalised), index (the library
//                                   points at a truck), label (manifest.day), plan (staged on a slot)
//   despatchDay('05/09/2026')       '2026-09-05' | null
//   usualGap(state)                 days from despatch to the truck, by the store's own trucks (1 until known)
//   suggestPlace(state, m, taken, { today })   where a report nothing places most likely came: a truck or planner
//                                   slot with no manifest within two days of despatch + the usual gap,
//                                   else despatch + the gap on the first free truck number. taken: 'YYYY-MM-DD-Tn'
//                                   keys already given out (a batch of uploads). → { day, truck, via } | null
//   manifestStats(sums, state, { from, to })   what came in from `from` to `to` (all of it without them)

import { addDays } from './time.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const r1 = x => Math.round(x * 10) / 10;
const truckOf = id => Number(String(id).replace(/^\d{4}-\d{2}-\d{2}-T/, '')) || null;
const placed = (id, via) => ({ day: String(id).slice(0, 10), truck: truckOf(id), via });
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

export function despatchDay(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return DAY_RE.test(String(s || '').slice(0, 10)) ? String(s).slice(0, 10) : null;
}

// A line's cartons: logged on the line, else its share of the consol's
// cartons by units (the Manifests explorer's itemCartons).
export function manSummary(doc) {
  const depts = {}, kc = {}; let cartons = 0, units = 0;
  for (const c of doc.consols || []) {
    const cc = Number(c.cartons) || 0, items = c.items || [], u = items.reduce((n, i) => n + (Number(i.q) || 0), 0);
    cartons += cc;
    if (!items.length) { (depts[String(c.dept || '???')] ||= [0, 0])[0] += cc; continue; }
    for (const it of items) {
      const q = Number(it.q) || 0, ct = Number(it.c) > 0 ? Number(it.c) : u ? cc * q / u : cc / items.length, dk = String(it.dept || '???');
      units += q;
      const d = (depts[dk] ||= [0, 0]); d[0] += ct; d[1] += q;
      const k = String(it.k || ''); if (!k) continue;
      const r = (kc[k] ||= [0, 0, dk]); r[0] += q; r[1] += ct;
    }
  }
  for (const d of Object.values(depts)) d[0] = r1(d[0]);
  for (const r of Object.values(kc)) r[1] = r1(r[1]);
  return { manNo: String(doc.manNo || ''), dcNo: String(doc.dcNo || ''), despatch: String(doc.despatch || ''), filename: String(doc.filename || ''), at: String(doc.at || doc.publishedAt || ''), consols: (doc.consols || []).length, cartons, units, keycodes: Object.keys(kc).length, depts, kc };
}

// The dock's own record first: a truck says when a report came; then a
// day set by hand; then the planner slot it is staged on.
export function placeIndex(state) {
  const dock = state?.dock || {}, out = new Map(), put = (no, p) => { if (no && !out.has(String(no))) out.set(String(no), p); };
  for (const [id, t] of Object.entries(dock.trucks || {})) { put(t.manifest?.manNo, placed(id, 'truck')); put(t.plannedManifest, placed(id, 'truck')); }
  for (let i = (dock.history || []).length - 1; i >= 0; i--) { const h = dock.history[i]; put(h.manifest?.manNo, placed(h.id, 'history')); }
  for (const m of Object.values(dock.manifests || {})) if (m.truck && /^\d{4}-\d{2}-\d{2}-T\d+$/.test(m.truck)) put(m.manNo, placed(m.truck, 'index'));
  for (const [no, l] of Object.entries(dock.manifestDays || {})) put(no, { day: l.day, truck: l.truck ?? null, via: 'label' });
  for (const [date, d] of Object.entries(state?.plan?.days || {})) for (const [n, sl] of Object.entries(d.slots || {})) put(sl.manifest?.manNo, { day: date, truck: Number(n), via: 'plan' });
  return out;
}

// The middle of the last 40 gaps of 0 to 7 days between a report's
// despatch and its truck: how long the DC takes to reach this store.
export function usualGap(state) {
  const dock = state?.dock || {}, gaps = [];
  const add = (id, despatch) => { const d = despatchDay(despatch); if (!d) return; const g = daysBetween(d, String(id).slice(0, 10)); if (g >= 0 && g <= 7) gaps.push(g); };
  for (const h of (dock.history || []).slice(-40)) if (h.manifest) add(h.id, h.manifest.despatch);
  for (const [id, t] of Object.entries(dock.trucks || {})) if (t.manifest) add(id, t.manifest.despatch);
  if (!gaps.length) return 1;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

export function suggestPlace(state, m, taken = new Set(), opts = {}) {
  const base = despatchDay(m?.despatch); if (!base) return null;
  const places = opts.places || placeIndex(state), gap = opts.gap ?? usualGap(state), want = addDays(base, gap);
  const held = new Set([...taken, ...[...places.values()].filter(p => p.day && p.truck).map(p => `${p.day}-T${p.truck}`)]);
  const dock = state?.dock || {}, plan = state?.plan?.days || {}, today = opts.today || null;
  let open = [];
  // Trucks the dock ran or planned with no manifest, from the despatch day
  // on and within two days of when the report should have come. A truck
  // finalised without one is 'gone'; one still to come (today on, not
  // closed) is 'ahead'.
  for (let i = 0; i <= 7; i++) {
    const day = addDays(base, i), ns = new Map(), mark = (n, gone) => { if (n && !(ns.get(n) === false)) ns.set(n, gone); };
    for (const [id, t] of Object.entries(dock.trucks || {})) if (id.startsWith(day + '-T') && !t.manifest && !t.plannedManifest) mark(truckOf(id), t.status === 'closed');
    for (const h of dock.history || []) if (h.id.startsWith(day + '-T') && !h.manifest) mark(truckOf(h.id), true);
    for (const [n, sl] of Object.entries(plan[day]?.slots || {})) if (!sl.manifest) mark(Number(n), !!today && day < today);
    if (Math.abs(daysBetween(want, day)) <= 2) for (const [n, gone] of ns) if (!held.has(`${day}-T${n}`)) open.push({ day, truck: n, gone });
  }
  // A report despatched yesterday or today is on its way: a truck still to
  // come takes it before one already finalised without a manifest (a usual
  // gap of 0 days would otherwise file it on yesterday's closed truck).
  if (today && base >= addDays(today, -1) && open.some(o => !o.gone && o.day >= today)) open = open.filter(o => !o.gone);
  open.sort((a, b) => Math.abs(daysBetween(want, a.day)) - Math.abs(daysBetween(want, b.day)) || b.day.localeCompare(a.day) || a.truck - b.truck);
  open = open.map(({ gone, ...o }) => o);
  if (open.length) return { ...open[0], via: 'plan' };
  for (let n = 1; n <= 4; n++) if (!held.has(`${want}-T${n}`)) return { day: want, truck: n, via: 'despatch' };
  return { day: want, truck: null, via: 'despatch' };
}

// What came in. A report the dock never placed counts on its despatch day
// plus the usual gap ('despatch'), else the day it was published.
export function manifestStats(sums, state, { from = null, to = null } = {}) {
  const places = placeIndex(state), gap = usualGap(state);
  const dated = sums.map(s => {
    const p = places.get(s.manNo), est = !p && despatchDay(s.despatch);
    return { s, day: p?.day || (est ? addDays(est, gap) : String(s.at || '').slice(0, 10)), truck: p?.truck ?? null, via: p?.via || (est ? 'despatch' : 'published') };
  }).filter(x => DAY_RE.test(x.day)).sort((a, b) => a.day.localeCompare(b.day) || (a.truck || 9) - (b.truck || 9));
  const all = !from && !to, lo = from || dated[0]?.day || null, hi = to || dated.at(-1)?.day || null;
  const cur = lo ? dated.filter(x => x.day >= lo && x.day <= hi) : [];
  const totals = xs => {
    const kcs = new Set(); for (const x of xs) for (const k of Object.keys(x.s.kc || {})) kcs.add(k);
    return { manifests: xs.length, trucks: new Set(xs.map(x => `${x.day}-${x.truck || x.s.manNo}`)).size, days: new Set(xs.map(x => x.day)).size, consols: xs.reduce((n, x) => n + x.s.consols, 0), cartons: xs.reduce((n, x) => n + x.s.cartons, 0), units: xs.reduce((n, x) => n + x.s.units, 0), keycodes: kcs.size };
  };
  const out = { from: lo, to: hi, all, gap, totals: totals(cur), prev: null, newKeycodes: null, byDay: {}, depts: [], top: [], regular: [], fresh: [], list: [] };
  if (!all && lo) { const span = daysBetween(lo, hi) + 1, pf = addDays(lo, -span), pt = addDays(lo, -1); out.prev = { from: pf, to: pt, totals: totals(dated.filter(x => x.day >= pf && x.day <= pt)) }; }
  const seen = all ? null : new Set(); if (seen) for (const x of dated) if (x.day < lo) for (const k of Object.keys(x.s.kc || {})) seen.add(k);
  const depts = {}, kc = {};
  for (const x of cur) {
    const b = (out.byDay[x.day] ||= { manifests: 0, cartons: 0, units: 0, consols: 0 }); b.manifests++; b.cartons += x.s.cartons; b.units += x.s.units; b.consols += x.s.consols;
    for (const [d, [c, u]] of Object.entries(x.s.depts || {})) { const a = (depts[d] ||= { dept: d, cartons: 0, units: 0, keycodes: 0 }); a.cartons += c; a.units += u; }
    for (const [k, [u, c, d]] of Object.entries(x.s.kc || {})) { const a = (kc[k] ||= { k, units: 0, cartons: 0, dept: d, manifests: 0 }); a.units += u; a.cartons += c; a.manifests++; }
    out.list.push({ manNo: x.s.manNo, day: x.day, truck: x.truck, via: x.via, despatch: x.s.despatch, consols: x.s.consols, cartons: x.s.cartons, units: x.s.units, keycodes: x.s.keycodes });
  }
  for (const r of Object.values(kc)) { r.cartons = r1(r.cartons); if (depts[r.dept]) depts[r.dept].keycodes++; }
  out.depts = Object.values(depts).map(d => ({ ...d, cartons: r1(d.cartons) })).sort((a, b) => b.cartons - a.cartons);
  const rows = Object.values(kc);
  out.top = rows.slice().sort((a, b) => b.units - a.units).slice(0, 15);
  out.regular = rows.filter(r => r.manifests > 1).sort((a, b) => b.manifests - a.manifests || b.units - a.units).slice(0, 10);
  if (seen) { const fresh = rows.filter(r => !seen.has(r.k)); out.newKeycodes = fresh.length; out.fresh = fresh.sort((a, b) => b.units - a.units).slice(0, 10); }
  return out;
}
