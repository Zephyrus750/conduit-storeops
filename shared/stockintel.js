// Stockroom intelligence, ported from K2B / Vector's stockroom scan (VS
// stockroom-scan.js 1582–2357): the SOH report paste, the snapshot history,
// the STUCK / GHOST / FROZEN / DEEP / NEW / MOVING classes and the
// weight-balanced walker split. Pure: the device, the worker and tests.
//
//   parseReport(text, into?)          report rows by keycode: { loc, kc, soh, price, apns, brand }
//   sohBand(soh, ctn)                 'r' (≤ 0), 'a' (under two cartons), 'g'
//   isoWeek(day)                      '2026-W41'
//   historyOf(snaps)                  keycode → { loc, name, price, w: [soh…], dates: […] }, oldest first
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
  let soh = null, price = null; const apns = [];
  for (const x of t.slice(ki + 1)) {
    if (/^\d{12,13}$/.test(x)) { if (!apns.includes(x)) apns.push(x); }
    else if (/^\d+[.,]\d{2}$/.test(x)) price = Number(x.replace(',', '.'));
    else if (SOH_RE.test(x) && /\d/.test(x)) soh = Number(fix(x));
  }
  if (soh === null || !loc || !Number.isFinite(soh)) return null;
  return { loc: String(Number(loc)), kc, soh, price, apns, brand: '' };
}

// Rows merge by keycode: a later paste of the same keycode updates its
// location, SOH and price and adds APNs, so pasting twice changes nothing.
export function parseReport(text, into = {}) {
  const out = into; let ctxLoc = null, last = null, rows = 0, skipped = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (HEAD_RE.test(line)) { const m = line.match(/Location\s*:?\s*(\d{2,5})/i); if (m) ctxLoc = m[1]; last = null; continue; }
    const r = rowToRecord(line, ctxLoc);
    if (r) {
      rows++;
      const cur = out[r.kc];
      if (cur) { cur.loc = r.loc; cur.soh = r.soh; if (r.price != null) cur.price = r.price; for (const a of r.apns) if (!cur.apns.includes(a)) cur.apns.push(a); last = cur; }
      else { out[r.kc] = r; last = r; }
      continue;
    }
    // A continuation line: more APNs, and the brand.
    if (last) { for (const a of line.match(/\b\d{12,13}\b/g) || []) if (!last.apns.includes(a)) last.apns.push(a); const b = line.trim().split(/\s+/).find(x => /^[A-Z][A-Z/-]{2,}$/.test(x)); if (b && !last.brand) last.brand = b; }
    else skipped++;
  }
  return { items: out, rows, skipped };
}

export const sohBand = (soh, ctn) => soh <= 0 ? 'r' : ctn && soh < INTEL.deepMultiple * ctn ? 'a' : 'g';

export function isoWeek(day) {
  const d = new Date(String(day).slice(0, 10) + 'T00:00:00Z'), dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  return `${y}-W${String(1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}

// snaps: [{ date, rows: [{ kc, loc, soh, price, name }] }] in any order.
export function historyOf(snaps) {
  const out = {};
  for (const s of [...(snaps || [])].sort((a, b) => a.date.localeCompare(b.date))) for (const r of s.rows || []) {
    const h = (out[r.kc] ||= { kc: r.kc, w: [], dates: [] });
    h.w.push(Number(r.soh)); h.dates.push(s.date); h.loc = r.loc; h.price = r.price ?? h.price ?? null; if (r.name) h.name = r.name;
  }
  return out;
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
    (out[h.loc] ||= []).push({ ...h, ...c });
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
