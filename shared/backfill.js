// Backfill review helpers shared by the desk and the phone, ported from
// K2B's review screen: parse a pasted SIM report into per-location system
// lists, and compare a submission's scanned codes against them.
//
//   Add    = scanned by the phones but not in the system report → add to system
//   Delete = in the system report but not scanned → remove from system
//   Match  = in both

export function parseKeycodes(text) {
  const out = [], seen = new Set();
  for (const tok of String(text || '').split(/[^0-9]+/)) if (/^\d{6,13}$/.test(tok) && !seen.has(tok)) { seen.add(tok); out.push(tok); }
  return out;
}

// A code scanned or typed on the backfill phone, as K2B checked it: a
// keycode is 7 or 8 digits; 13 digits is an item barcode (APN), which must
// pass its EAN check digit (a misread digit is refused outright). Anything
// else is neither. → { code } or { why }
export function phoneCode(raw) {
  const code = String(raw ?? '').replace(/\D/g, '');
  if (!code) return { why: 'That is not a keycode' };
  if (code.length === 7 || code.length === 8) return { code };
  if (code.length === 13) return ean13Ok(code) ? { code } : { why: `${code} fails its check digit: scan it again` };
  return { why: `${code} is ${code.length} digits: a keycode is 7 or 8, an item barcode 13` };
}
const ean13Ok = c => { let sum = 0; for (let i = 0; i < 12; i++) sum += Number(c[i]) * (i % 2 ? 3 : 1); return (10 - (sum % 10)) % 10 === Number(c[12]); };

// K2B's disputes: two 8-digit keycodes on one bay that differ in a single
// digit are probably one product misread or mistyped. → { code: [partners] }
export function disputes(codes) {
  const out = {}, eight = [...new Set(codes)].filter(c => /^\d{8}$/.test(c));
  for (let i = 0; i < eight.length; i++) for (let j = i + 1; j < eight.length; j++) {
    const a = eight[i], b = eight[j]; let d = 0;
    for (let k = 0; k < 8 && d < 2; k++) if (a[k] !== b[k]) d++;
    if (d === 1) { (out[a] ||= []).push(b); (out[b] ||= []).push(a); }
  }
  return out;
}

// Whole-report paste: split into per-location lists. Field order is
// LOCATION · KEYCODE · APN · …: the first 6–8-digit token is the keycode
// (12–13-digit APNs are skipped) and the location is a leading 2–5-digit
// token or a "Location:" header line.
export function parseReportByLocation(text) {
  const out = {}; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const lh = line.match(/^Location\s*:?\s*(\d{2,5})\b/i);
    if (lh) { cur = lh[1]; continue; }
    if (/^(STORE\b|LOCATION\s+KEYCODE|ITEM\b|BRAND\b|PAGE\b|[-=_]{4,})/i.test(line)) continue;
    const toks = line.split(/\s+/);
    let kcIdx = -1, kc = null;
    for (let i = 0; i < toks.length; i++) if (/^\d{6,8}$/.test(toks[i])) { kcIdx = i; kc = toks[i]; break; }
    if (kcIdx < 0) continue;
    const loc = kcIdx > 0 && /^\d{2,5}$/.test(toks[kcIdx - 1]) ? toks[kcIdx - 1] : cur;
    if (!loc) continue;
    (out[loc] ||= []);
    if (!out[loc].includes(kc)) out[loc].push(kc);
  }
  return out;
}

// Rows for one submission: sub.codes is { code: { scanned } }; system is the
// report's list for that bay (null when no report covers it).
export function reviewRows(sub, system) {
  const scanned = Object.entries(sub?.codes || {}).filter(([, c]) => c.scanned).map(([code]) => code);
  const incorrect = new Set(sub?.incorrect || []);
  if (!system) return scanned.map(code => ({ code, status: 'scanned', incorrect: incorrect.has(code) }));
  const sys = new Set(system), sc = new Set(scanned);
  const rows = scanned.map(code => ({ code, status: sys.has(code) ? 'match' : 'add', incorrect: incorrect.has(code) }));
  for (const code of system) if (!sc.has(code)) rows.push({ code, status: 'delete', incorrect: incorrect.has(code) });
  const order = { add: 0, delete: 1, match: 2, scanned: 3 };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || (a.code < b.code ? -1 : 1));
  return rows;
}
// Accuracy, ported from K2B's review (app.js ~8095): a code the reviewer
// marked incorrect drops out of whichever side it is extra on, then
// accuracy = matches / the larger of (real scanned, real system), so both
// over- and under-scanning pull it down. The desk, the reducer and imported
// K2B history all use this one formula.
export function backfillMetrics(scanned, system, incorrect) {
  const sc = new Set(scanned), sy = new Set(system), bad = new Set(incorrect || []);
  let match = 0, badScanned = 0, badSystem = 0;
  for (const c of sc) { if (sy.has(c)) match += 1; else if (bad.has(c)) badScanned += 1; }
  for (const c of sy) if (!sc.has(c) && bad.has(c)) badSystem += 1;
  const realScanned = Math.max(0, sc.size - badScanned), realSystem = Math.max(0, sy.size - badSystem);
  const denom = Math.max(realScanned, realSystem);
  return { expected: realSystem, scanned: realScanned, match, accuracy: denom ? Math.round(match / denom * 100) : 0, incorrect: badScanned + badSystem };
}
export const scannedCodes = sub => Object.entries(sub?.codes || {}).filter(([, c]) => c.scanned).map(([code]) => code);

export function compareCounts(sub, system) {
  const c = { match: 0, add: 0, delete: 0, scanned: 0, incorrect: 0 };
  for (const r of reviewRows(sub, system)) { c[r.status] += 1; if (r.incorrect) c.incorrect += 1; }
  if (!system) { c.pct = null; c.expected = c.scanned; c.scannedCount = c.scanned; return c; }
  const m = backfillMetrics(scannedCodes(sub), system, sub?.incorrect);
  c.pct = m.accuracy; c.expected = m.expected; c.scannedCount = m.scanned; c.incorrect = m.incorrect;
  return c;
}
// What "Ready" writes: every system code the phone did not scan is merged as
// scanned:false (History shows it as "system only"), and the ready event
// carries the report's list so the reducer computes the desk's metrics.
export function readyPayload(sub, system) {
  const codes = {};
  for (const code of system || []) if (!sub.codes[code]) codes[code] = false;
  return { codes, incorrect: sub.incorrect || [] };
}

// End-of-day rollover, ported from K2B's runRollover (worker:1586-1690): a
// bay still pending or ready on an earlier store day is submitted as
// "auto" so it reaches History instead of dropping off the board. Requested
// bays that were never scanned stay on their day's requested list, which is
// the "requested, not verified" record (the K2B importer lands them the same
// way). Returns the entities to submit, oldest first.
export function rolloverDue(backfill, today) {
  return Object.values(backfill?.subs || {})
    .filter(s => s.date < today && (s.status === 'pending' || s.status === 'corrected'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.bay.localeCompare(b.bay))
    .map(s => ({ bay: s.bay, date: s.date }));
}

// ── Desk paste and freshness (ported from K2B's parseKeycodeText and
// parseReqInput, and Vector's review: freshBand, the range chip, the gap
// note). ──────────────────────────────────────────────────────────────────

// A pasted inventory list for one bay. Line mode: each digit line of 6–9
// digits is a code (Kmart's newer keycodes run to 9 digits; 13-digit item
// barcodes stay out); lines with two or more letters are report furniture.
// When fewer than 60% of the digit lines read that way, the paste is a
// glued blob: runs of 8+ digits cut into 8-digit codes, anything that does
// not fit an 8-digit boundary reported as a leftover.
//   → { codes, leftovers, duplicates, mode: 'lines' | 'glued' }
export function parseKeycodeText(raw) {
  const lines = String(raw || '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const lineCodes = []; let total = 0;
  for (const l of lines) {
    if (!/\d/.test(l) || (l.match(/[A-Za-z]/g) || []).length >= 2) continue;
    total += 1;
    const d = l.replace(/\D/g, '');
    if (d.length >= 6 && d.length <= 9) lineCodes.push(d);
  }
  let codes = [], leftovers = [], mode = 'lines';
  if (total > 0 && lineCodes.length >= Math.ceil(total * 0.6)) codes = lineCodes;
  else {
    mode = 'glued';
    for (const run of String(raw || '').split(/\D+/)) {
      if (!run || run.length < 8) continue;
      for (let i = 0; i + 8 <= run.length; i += 8) codes.push(run.slice(i, i + 8));
      if (run.length % 8) leftovers.push(run.slice(-(run.length % 8)));
    }
  }
  const unique = [...new Set(codes)];
  return { codes: unique, leftovers, duplicates: codes.length - unique.length, mode };
}

// A pasted requested list: bays separated by spaces, commas, semicolons or
// lines; each needs a digit; at most 100.
export function parseRequested(text) {
  const seen = new Set(), out = [];
  for (const t of String(text || '').toUpperCase().split(/[\s,;]+/)) {
    const b = t.replace(/[^A-Z0-9\-_.]/g, '').slice(0, 40);
    if (b && /\d/.test(b) && !seen.has(b)) { seen.add(b); out.push(b); }
    if (out.length >= 100) break;
  }
  return out;
}

// The range a whole-report paste covers: a "7001 – 7090" in its first eight
// lines, else the lowest to highest location parsed.
export function reportRange(text, byLoc) {
  const head = String(text || '').split(/\r?\n/).slice(0, 8).join('\n');
  const m = /\b(\d{3,5})\s*[–\-/]\s*(\d{3,5})\b/.exec(head);
  const locs = Object.keys(byLoc || {});
  if (m) return { from: m[1], to: m[2], n: locs.length };
  const nums = locs.filter(l => /^\d+$/.test(l)).map(Number).sort((a, b) => a - b);
  return nums.length ? { from: String(nums[0]), to: String(nums[nums.length - 1]), n: locs.length } : null;
}

// How fresh a report is: green under 10 minutes, amber under 30, red after.
export const freshBand = mins => mins < 10 ? 'g' : mins < 30 ? 'a' : 'r';
export const freshLabel = mins => mins < 1 ? 'just now' : `${Math.round(mins)}m ago`;

// The gap between the report and a bay's scans: a bay scanned 3+ minutes
// after the report, or a report 30+ minutes old, should be re-pasted.
//   → { ageMin, afterBy, warn } (minutes; afterBy < 0 when scanned before)
export function reportGap(reportAt, bayUpdatedAt, now = Date.now()) {
  const ageMin = (now - reportAt) / 60000, afterBy = bayUpdatedAt ? (Date.parse(bayUpdatedAt) - reportAt) / 60000 : -Infinity;
  return { ageMin, afterBy, warn: afterBy >= 3 || ageMin >= 30 };
}

// What changed for each bay between two report pastes (new to K2B and
// Vector, which overwrote the old list): codes now in the report that were
// not, and codes that left it. Only bays in both pastes are compared.
export function pasteDelta(prevByLoc, nextByLoc) {
  const out = {};
  for (const [loc, list] of Object.entries(nextByLoc || {})) {
    const prev = prevByLoc?.[loc]; if (!prev) continue;
    const a = new Set(prev), b = new Set(list);
    const added = list.filter(c => !a.has(c)), removed = prev.filter(c => !b.has(c));
    if (added.length || removed.length) out[loc] = { added, removed };
  }
  return out;
}
