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
export function compareCounts(sub, system) {
  const c = { match: 0, add: 0, delete: 0, scanned: 0, incorrect: 0 };
  for (const r of reviewRows(sub, system)) { c[r.status] += 1; if (r.incorrect) c.incorrect += 1; }
  const expected = system ? system.length : c.scanned;
  const scannedN = c.match + c.add + c.scanned;
  c.pct = !system ? null : expected ? Math.round(Math.max(0, c.match - c.incorrect) / expected * 100) : 100;
  c.expected = expected; c.scannedCount = scannedN;
  return c;
}
// What "Ready" writes so the worker's metrics match the desk's compare:
// every system code the phone did not scan is merged as scanned:false.
export function readyPayload(sub, system) {
  const codes = {};
  for (const code of system || []) if (!sub.codes[code]) codes[code] = false;
  return { codes, incorrect: sub.incorrect || [] };
}
