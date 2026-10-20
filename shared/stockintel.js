// Stockroom intelligence, ported from K2B / Vector's stockroom scan (VS
// stockroom-scan.js 1582–2357): the SOH report paste, the snapshot history,
// the STUCK / GHOST / FROZEN / DEEP / NEW / MOVING classes and the
// weight-balanced walker split. Pure: the device, the worker and tests.
//
//   parseReport(text, into?)          report rows by keycode and location: { loc, kc, soh, price, apns, brand }
//   sohBand(soh, ctn)                 'r' (≤ 0), 'a' (under two cartons), 'g'
//   flagOf(soh, ctn), flagsOf(rows)   'adjust' (≤ 0 in a stockroom bay), 'pull' (under two cartons), or none
//   isoWeek(day)                      '2026-W41'
//   historyOf(snaps)                  keycode → { loc, locs, name, price, w: [soh…], dates: […] }, oldest first
//   keepDates(dates)                  the snapshot dates kept: the last 14 days, then the last of each week
//   weeklyDates(dates, n)             the last snapshot date of each of the newest n weeks
//   classify(item, profile)           { cls, flat, latest, ctn, arrivalSince, recount }
//   checksFor(items, profiles)        location → the flagged items to check there, by priority
//   splitWalkers(locs, checks, n)     contiguous groups of locations, balanced by 1 + checks

export const INTEL = { flatWindow: 3, deepMultiple: 2, packChangeYoungTrucks: 4 };
export const PRIORITY = { stuck: 0, ghost: 1, frozen: 2, deep: 3, new: 4, moving: 5 };
export const CHECKED = ['stuck', 'ghost', 'frozen', 'deep'];
export const BADGE = { stuck: 'STUCK · flat since arrival', ghost: 'GHOST · SOH 0 + arrivals', frozen: 'FROZEN', deep: 'DEEP · spot-check', new: 'NEW · first snapshot', moving: 'MOVING' };
export const TASK = { ghost: 'COUNT · SOH 0', deep: 'SPOT-CHECK', stuck: 'COUNT · STUCK', frozen: 'COUNT' };

const HEAD_RE = /STORE\s*:|^\s*Location\s*:|LOCATION\s+KEYCODE|ITEM\s+DESCRIPTION|BRAND\s+DESCRIPTION|Status\s+0|Page\s+\d|Start of style|End of style|^[-=_]{6,}/i;
const OCR = { O: '0', o: '0', I: '1', l: '1', L: '1', S: '5', B: '8' };
const fix = t => t.replace(/[OoIlLSB]/g, c => OCR[c]);
const KC_RE = /^[0-9OIlLSB]{6,8}$/, SOH_RE = /^-?[0-9OIlLSB]{1,5}$/;

// One item row, or null (no keycode, no SOH or no location).
function rowToRecord(line, ctxLoc) {
  const t = line.trim().split(/\s+/);
  let ki = -1;
  for (let i = 0; i < t.length; i++) { const x = t[i]; if (KC_RE.test(x) && (x.match(/\d/g) || []).length >= x.length - 2 && /^\d{6,8}$/.test(fix(x))) { ki = i; break; } }
  if (ki < 0) return null;
  const kc = fix(t[ki]), loc = ki > 0 && /^\d{2,5}$/.test(t[ki - 1]) ? t[ki - 1] : ctxLoc;
  let soh = null, price = null; const apns = [], words = [];
  for (const x of t.slice(ki + 1)) {
    if (/^\d{12,13}$/.test(x)) { if (!apns.includes(x)) apns.push(x); }
    else if (/^\d+[.,]\d{2}$/.test(x)) { price = Number(x.replace(',', '.')); soh = null; }   // SOH is the last column, after the price: a STATUS 0 before it is not the SOH
    else if (SOH_RE.test(x) && (price !== null || /\d/.test(x))) { soh = Number(fix(x)); if (price === null) words.push(x); }   // after the price an OCR'd O is a 0
    else if (price === null) words.push(x);
  }
  if (soh === null || !loc || !Number.isFinite(soh)) return null;
  // The description (with its colour): the words between the keycode and
  // the price, less the STATUS digit before the price (and, on a line with
  // no price, the SOH at the end).
  if (price === null) words.pop();
  while (words.length && /^\d$/.test(words.at(-1))) words.pop();
  return { loc: String(Number(loc)), kc, soh, price, apns, brand: '', desc: words.join(' ').slice(0, 80) };
}

// Rows merge by keycode and location: an item stocked in two bays keeps
// both, and a page pasted twice changes nothing (its SOH and price update,
// its APNs add). The SOH is the item's whole-store figure, so every bay of
// an item reads the same number.
export const rowKey = r => `${r.kc}|${r.loc}`;
export function parseReport(text, into = {}) {
  const out = into; let ctxLoc = null, last = null, rows = 0, skipped = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (HEAD_RE.test(line)) { const m = line.match(/Location\s*:?\s*(\d{2,5})/i); if (m) ctxLoc = m[1]; last = null; continue; }
    const r = rowToRecord(line, ctxLoc);
    if (r) {
      rows++;
      const cur = out[rowKey(r)];
      if (cur) { cur.soh = r.soh; if (r.price != null) cur.price = r.price; if (r.desc && !cur.desc) cur.desc = r.desc; for (const a of r.apns) if (!cur.apns.includes(a)) cur.apns.push(a); last = cur; }
      else { out[rowKey(r)] = r; last = r; }
      continue;
    }
    // A continuation line: more APNs, and the brand.
    if (last) { for (const a of line.match(/\b\d{12,13}\b/g) || []) if (!last.apns.includes(a)) last.apns.push(a); const b = line.trim().split(/\s+/).find(x => /^[A-Z][A-Z/-]{2,}$/.test(x)); if (b && !last.brand) last.brand = b; }
    else skipped++;
  }
  return { items: out, rows, skipped };
}

export const sohBand = (soh, ctn) => soh <= 0 ? 'r' : ctn && soh < INTEL.deepMultiple * ctn ? 'a' : 'g';

// What a row in a stockroom bay asks for. The report's SOH is the whole
// store's (floor, stockroom and between), so an item sitting in a stockroom
// bay that the system puts at 0 or less is wrong: adjust it. One with stock
// but under two cartons' worth has most likely run out on the floor, the
// rest being the carton out the back: pull it.
export const PULL_CARTONS = 2;
// Potential shrink: an item the system puts below zero and that is
// adjusted to zero (or to what was counted) writes those units off at its
// price. 0 when the SOH is not below zero or there is no price.
export function shrinkValue(qty, price) {
  const q = Number(qty), p = Number(price);
  return q < 0 && p > 0 ? Math.round(-q * p * 100) / 100 : 0;
}
export function flagOf(soh, ctn) {
  if (!(Number.isFinite(soh))) return null;
  if (soh <= 0) return 'adjust';
  if (ctn && soh < PULL_CARTONS * ctn) return 'pull';
  return null;
}
// The rows of a snapshot (or a paste) that ask for something, by flag.
// cartonOf(kc) → units a carton or null.
export function flagsOf(rows, cartonOf = () => null) {
  const out = { adjust: [], pull: [] };
  for (const r of rows || []) { const ctn = cartonOf(r.kc), f = flagOf(Number(r.soh), ctn); if (f) out[f].push({ ...r, ctn }); }
  for (const l of Object.values(out)) l.sort((a, b) => byLoc(a.loc, b.loc) || a.kc.localeCompare(b.kc));
  return out;
}

export function isoWeek(day) {
  const d = new Date(String(day).slice(0, 10) + 'T00:00:00Z'), dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  return `${y}-W${String(1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}

// snaps: [{ date, rows: [{ kc, loc, soh, price, name }] }] in any order.
// One SOH a keycode a snapshot (the report's figure is store-wide); its
// locations are the bays the newest snapshot holding it lists.
export function historyOf(snaps) {
  const out = {};
  for (const s of [...(snaps || [])].sort((a, b) => a.date.localeCompare(b.date))) {
    const seen = new Set();
    for (const r of s.rows || []) {
      const h = (out[r.kc] ||= { kc: r.kc, w: [], dates: [], locs: [] });
      if (!seen.has(r.kc)) { seen.add(r.kc); h.w.push(Number(r.soh)); h.dates.push(s.date); h.locs = []; h.price = r.price ?? h.price ?? null; }
      if (!h.locs.includes(r.loc)) h.locs.push(r.loc);
      h.loc = h.locs[0]; if (r.name) h.name = r.name;
    }
  }
  return out;
}

// Snapshots can be pasted every day. The last 14 dates are kept as they
// are, and older ones only as the last of their week, for 26 weeks: the
// classes read one snapshot a week, as the K2B paste was weekly.
export const KEEP_DAYS = 14, KEEP_WEEKS = 26;
export function keepDates(dates) {
  const all = [...new Set(dates)].sort(), recent = all.slice(-KEEP_DAYS);
  return [...new Set([...recent, ...weeklyDates(all, KEEP_WEEKS)])].sort();
}
export function weeklyDates(dates, n) {
  const byWeek = new Map();
  for (const d of [...dates].sort()) byWeek.set(isoWeek(d), d);
  return [...byWeek.values()].slice(-n);
}

export function classify(item, profile = null) {
  const w = item.w || [], n = w.length, latest = n ? w[n - 1] : null, ctn = profile?.ctn || null;
  let flat = n ? 1 : 0; for (let i = n - 2; i >= 0 && w[i] === latest; i--) flat++;
  const windowStart = n >= INTEL.flatWindow ? item.dates[n - INTEL.flatWindow] : item.dates?.[0];
  const arrivals = [...(profile?.arrivals || []).map(a => a.date), profile?.last_arrival?.date].filter(Boolean);
  const arrivalSince = !!windowStart && arrivals.some(d => d >= windowStart);
  const recount = profile?.pack_change ? profile.pack_change.since_trucks < INTEL.packChangeYoungTrucks : false;
  let cls;
  if (n < 3) cls = 'new';
  else if (latest <= 0 && arrivalSince) cls = 'ghost';
  else if (flat >= INTEL.flatWindow) cls = arrivalSince ? 'stuck' : ctn && latest >= INTEL.deepMultiple * ctn ? 'deep' : 'frozen';
  else cls = 'moving';
  const lastArrival = profile?.last_arrival || null;
  return { cls, flat, latest, ctn, arrivalSince, recount, lastArrival };
}

// The checks at each location: the flagged items there, most urgent first.
export function checksFor(history, profiles = {}) {
  const out = {};
  for (const h of Object.values(history)) {
    const c = classify(h, profiles[h.kc]); if (!CHECKED.includes(c.cls)) continue;
    for (const loc of h.locs?.length ? h.locs : [h.loc]) (out[loc] ||= []).push({ ...h, ...c, loc });
  }
  for (const list of Object.values(out)) list.sort((a, b) => PRIORITY[a.cls] - PRIORITY[b.cls] || a.kc.localeCompare(b.kc));
  return out;
}

// Contiguous groups of locations (in walking order), each weighing 1 for
// the visit plus one per check, cut as close to an even share as they go.
export function splitWalkers(locs, checks = {}, walkers = 2) {
  if (!locs.length) return [];
  const n = Math.max(1, Math.min(walkers, locs.length)), weight = l => 1 + (checks[l]?.length || 0);
  const total = locs.reduce((t, l) => t + weight(l), 0), target = total / n, groups = [];
  let cur = [], acc = 0;
  for (let i = 0; i < locs.length; i++) {
    cur.push(locs[i]); acc += weight(locs[i]);
    if (groups.length === n - 1) continue;
    const locsAfter = locs.length - i - 1, groupsAfter = n - groups.length - 1;
    if (locsAfter < groupsAfter) continue;
    const next = i + 1 < locs.length ? weight(locs[i + 1]) : 0;
    if (locsAfter === groupsAfter || Math.abs(acc - target) <= Math.abs(acc + next - target)) { groups.push(cur); cur = []; acc = 0; }
  }
  if (cur.length) groups.push(cur);
  while (groups.length > n) groups[groups.length - 2].push(...groups.pop());
  return groups;
}
export const byLoc = (a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b));
