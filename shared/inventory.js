// Inventory and pallet hub (ShelfSearcher's Inventory mode): the off-site
// pallet register, loads read from a spreadsheet, their consolidation by
// department, heat on the map, weekly trends and the clearance watch. Pure:
// the reducers keep what these produce, the view draws it.
//
//   readOffsiteSheets(sheets)          { rows, diag } from the off-site master list (.xlsx)
//   guessColumns(header)               { pallet, key, desc, qty, dept } column indexes (-1 = none)
//   readGeneric(rows, map)             { pallets: [{ pid, items: [{ k, d, q, dept }] }], skipped }
//   registerSummary(rows, today)       { live, received, fixtures, nextCallback, overdue, dueSoon, byCallback }
//   consolidate(pallets)               [[dept, units, lines]] largest first
//   heatBands(deptUnits, shelvesOf)    Map shelf → band 1..5 (sqrt of units per shelf)
//   loadTrends(loads, { weeks, today }) { weeks: [{ wk, cartons, units, loads, depts }], callouts }
//   clearanceDiff(prev, cur, day)      [{ kc, kind: 'clr' | 'drop', price, was, prevPrice }]

import { addDays } from './time.js';

export const OFFSITE_CAP = 400, LOAD_CAP = 24, LOAD_PALLET_CAP = 300, LOAD_LINE_CAP = 3000;
export const LOAD_STATUS = ['incoming', 'received', 'offsite'];
const cs = v => (v == null ? '' : String(v)).trim();
const isoDay = v => {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);   // a spreadsheet serial
  const s = cs(v); let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }   // d/m/y, as Australian sheets write it
  return '';
};

// The off-site master list: one sheet per month or status, a header row in
// the first six rows naming "pallet no" and "sent date". Products ride in the
// description as "43166022 x 12"; a pallet range "51-54" is four pallets. A
// sheet whose name says "rec" lists pallets already back.
export function readOffsiteSheets(sheets) {
  const rows = [], seen = new Set(); let headerless = 0;
  for (const sh of sheets || []) {
    if (/example/i.test(sh.name || '')) continue;
    const data = sh.rows || [];
    let h = -1;
    for (let i = 0; i < Math.min(6, data.length); i++) { const r = (data[i] || []).map(c => cs(c).toLowerCase()); if (r.some(c => /pallet\s*no/.test(c)) && r.some(c => /sent\s*date/.test(c))) { h = i; break; } }
    if (h < 0) { if (data.length) headerless++; continue; }
    const hdr = data[h].map(c => cs(c).toLowerCase()), col = re => hdr.findIndex(c => re.test(c));
    const C = { date: col(/sent\s*date/), time: col(/^time/), pid: col(/pallet\s*no/), desc: col(/desc/), req: col(/req/), cb: col(/call\s*back|callback/), rec: col(/received/), note: col(/comment|note/) };
    const recSheet = /rec/i.test(sh.name || '');
    for (const r of data.slice(h + 1)) {
      if (!r || !cs(r[C.pid])) continue;
      const raw = cs(r[C.pid]), desc = C.desc >= 0 ? cs(r[C.desc]).slice(0, 200) : '';
      const products = []; for (const m of desc.matchAll(/(\d{8})\s*[x×*]\s*(\d+)/gi)) products.push({ kc: m[1], q: Number(m[2]) });
      if (!products.length) for (const m of desc.matchAll(/\b(\d{8})\b/g)) products.push({ kc: m[1], q: 0 });
      const range = /^(\d+)\s*-\s*(\d+)$/.exec(raw), ids = range && +range[2] > +range[1] && +range[2] - +range[1] <= 20 ? Array.from({ length: +range[2] - +range[1] + 1 }, (_, k) => String(+range[1] + k)) : [raw];
      const recVal = C.rec >= 0 ? r[C.rec] : null, recDay = isoDay(recVal) || (recSheet || /^(y|yes|✓|x)$/i.test(cs(recVal)) ? 'yes' : '');   // 'yes': back, day not written
      for (const pid of ids) {
        const key = pid.slice(0, 20); if (seen.has(key)) continue; seen.add(key);
        rows.push({ pid: key, sent: isoDay(r[C.date]), time: C.time >= 0 ? cs(r[C.time]).slice(0, 8) : '', desc, title: desc.split(/[\n;]/)[0].replace(/(\d{8})\s*[x×*]\s*\d+/gi, '').replace(/^[\s,;·-]+|[\s,;·-]+$/g, '').trim().slice(0, 80), products: products.slice(0, 20), req: C.req >= 0 ? cs(r[C.req]).slice(0, 40) : '', cb: C.cb >= 0 ? isoDay(r[C.cb]) : '', rec: recDay, note: C.note >= 0 ? cs(r[C.note]).slice(0, 200) : '' });
        if (rows.length >= OFFSITE_CAP) return { rows, diag: `kept the first ${OFFSITE_CAP} pallets` };
      }
    }
  }
  return { rows, diag: rows.length ? '' : headerless ? 'no sheet has a header row naming "Pallet no" and "Sent date"' : 'the file is empty' };
}

// A generic load: any CSV or sheet with one row per line. The header picks
// its columns (the first match wins); the person can change any of them.
const GUESS = {
  pallet: [/pallet/, /lpn/, /carton/, /sscc/, /consolidation/],
  key: [/key/, /sku/, /item.?(no|num|code)/, /^code$/, /article/],
  desc: [/desc/, /name/, /title/],
  qty: [/qty/, /quant/, /units?$/, /count/],
  dept: [/dept/, /department/, /class/],
};
export const COLUMN_NAMES = { pallet: 'Pallet ID', key: 'Keycode', desc: 'Description', qty: 'Quantity', dept: 'Department' };
export function guessColumns(header) {
  const h = (header || []).map(c => cs(c).toLowerCase()), out = {}, used = new Set();
  for (const [field, res] of Object.entries(GUESS)) {
    out[field] = -1;
    for (const re of res) { const i = h.findIndex((c, k) => c && !used.has(k) && re.test(c)); if (i >= 0) { out[field] = i; used.add(i); break; } }
  }
  return out;
}
// Rows after the header → pallets. Pallet and keycode are required; the
// department keeps its first three digits (the micro-department code).
export function readGeneric(rows, map) {
  if (!(map.pallet >= 0) || !(map.key >= 0)) return { pallets: [], skipped: rows.length, diag: 'choose the Pallet ID and Keycode columns' };
  const by = new Map(); let skipped = 0, lines = 0;
  for (const r of rows) {
    const pid = cs(r?.[map.pallet]).slice(-20), k = cs(r?.[map.key]).replace(/\s+/g, '');
    if (!pid || !k) { skipped++; continue; }
    if (lines >= LOAD_LINE_CAP) { skipped++; continue; }
    const q = map.qty >= 0 ? Number(String(r[map.qty]).replace(/[^\d.-]/g, '')) || 0 : 1;
    let dept = map.dept >= 0 ? cs(r[map.dept]).replace(/\D/g, '').slice(0, 3) : ''; if (dept && dept.length < 3) dept = dept.padStart(3, '0');
    if (!by.has(pid)) { if (by.size >= LOAD_PALLET_CAP) { skipped++; continue; } by.set(pid, { pid, items: new Map() }); }
    const p = by.get(pid), cur = p.items.get(k);
    if (cur) cur.q += q; else { p.items.set(k, { k: k.slice(0, 20), d: map.desc >= 0 ? cs(r[map.desc]).slice(0, 60) : '', q, dept }); lines++; }
  }
  return { pallets: [...by.values()].map(p => ({ pid: p.pid, items: [...p.items.values()] })), skipped, diag: by.size ? '' : 'no rows had both a pallet and a keycode' };
}

// The register at a glance: what is still off-site, what came back, the
// fixtures, and returns by callback date (overdue first, then the next
// fortnight).
export function registerSummary(rows, today) {
  const list = Object.values(rows || {}), live = list.filter(r => !r.rec), soon = addDays(today, 14);
  const withCb = live.filter(r => r.cb).sort((a, b) => a.cb.localeCompare(b.cb) || a.pid.localeCompare(b.pid, undefined, { numeric: true }));
  return {
    live: live.length, received: list.length - live.length,
    fixtures: live.filter(isFixture).length,
    nextCallback: withCb.find(r => r.cb >= today)?.cb || null,
    overdue: withCb.filter(r => r.cb < today),
    dueSoon: withCb.filter(r => r.cb >= today && r.cb <= soon),
    byCallback: [...withCb, ...live.filter(r => !r.cb).sort((a, b) => (a.sent || '').localeCompare(b.sent || ''))],
  };
}
export const isFixture = r => /fixture/i.test(r.req || '') || /^fixtures/i.test(r.title || '');

// Units per department across pallets, largest first: [[dept, units, lines]].
export function consolidate(pallets) {
  const m = new Map();
  for (const p of pallets || []) for (const it of p.items || []) { const d = it.dept || '???'; const cur = m.get(d) || [d, 0, 0]; cur[1] += Number(it.q) || 0; cur[2] += 1; m.set(d, cur); }
  return [...m.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Heat on the map: each department's units spread over its shelves, then
// banded on the square root so a few huge departments do not wash out the
// rest (ShelfSearcher's paintHeat). shelvesOf(dept) → [shelf names].
export function heatBands(deptUnits, shelvesOf) {
  const w = new Map();
  for (const [d, units] of deptUnits) { const shelves = shelvesOf(d) || []; if (!shelves.length || !(units > 0)) continue; const per = units / shelves.length; for (const s of shelves) w.set(s, (w.get(s) || 0) + per); }
  const max = Math.max(0, ...w.values()), out = new Map();
  if (!max) return out;
  for (const [s, v] of w) { const t = Math.sqrt(v / max); out.set(s, t > .8 ? 5 : t > .6 ? 4 : t > .4 ? 3 : t > .2 ? 2 : 1); }
  return out;
}
export const HEAT = ['#FEF0E0', '#FDD9B5', '#FB923C', '#EA580C', '#B33A0B'];

// Weekly buckets (Monday start) of what arrived: loads by their received
// day, or the day they were read. Gap weeks are zero. The trend compares the
// newer half of the active weeks with the older half once there are four.
const monday = day => { const d = new Date(day + 'T00:00:00Z'), k = (d.getUTCDay() + 6) % 7; return addDays(day, -k); };
export function loadTrends(loads, { weeks = 12, today } = {}) {
  const end = monday(today), start = weeks === 'all' ? null : addDays(end, -7 * (weeks - 1)), by = new Map();
  for (const l of Object.values(loads || {})) {
    const day = l.recvDate || l.date || (l.at || '').slice(0, 10); if (!day) continue;
    const wk = monday(day); if (start && wk < start) continue; if (wk > end) continue;
    const b = by.get(wk) || { wk, cartons: 0, units: 0, loads: 0, depts: {} };
    b.loads++; b.cartons += Number(l.cartons) || (l.pallets || []).length; for (const p of l.pallets || []) for (const it of p.items || []) { b.units += Number(it.q) || 0; const d = it.dept || '???'; b.depts[d] = (b.depts[d] || 0) + (Number(it.q) || 0); }
    by.set(wk, b);
  }
  const first = start || [...by.keys()].sort()[0] || end, list = [];
  for (let wk = first; wk <= end; wk = addDays(wk, 7)) list.push(by.get(wk) || { wk, cartons: 0, units: 0, loads: 0, depts: {} });
  const active = list.filter(w => w.loads), total = list.reduce((n, w) => n + w.cartons, 0), n = list.reduce((k, w) => k + w.loads, 0);
  const busiest = active.reduce((m, w) => (!m || w.cartons > m.cartons ? w : m), null);
  let trend = null;
  if (active.length >= 4) { const h = Math.floor(active.length / 2), older = active.slice(0, h).reduce((a, w) => a + w.cartons, 0) / h, newer = active.slice(-h).reduce((a, w) => a + w.cartons, 0) / h; trend = older ? Math.round((newer - older) / older * 100) : null; }
  return { weeks: list, callouts: { cartons: total, loads: n, perLoad: n ? Math.round(total / n) : 0, busiest: busiest?.wk || null, busiestCartons: busiest?.cartons || 0, trend } };
}

// The clearance watch, against yesterday's prices: a keycode newly on
// clearance, or one whose price fell. Only codes with a previous price count,
// and each code reports at most once a day.
export function clearanceDiff(prev, cur, day) {
  const out = [];
  for (const [kc, c] of Object.entries(cur || {})) {
    const p = prev?.[kc]; if (!c || !p || p.day === day) continue;
    if (c.clr && !p.clr) out.push({ kc, kind: 'clr', price: c.price ?? null, was: c.was ?? null, prevPrice: p.price ?? null, day });
    else if (Number.isFinite(c.price) && Number.isFinite(p.price) && c.price < p.price) out.push({ kc, kind: 'drop', price: c.price, was: c.was ?? null, prevPrice: p.price, day });
  }
  return out;
}
