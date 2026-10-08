// Screen scan and the barcode list, ported from K2B / Vector's stockroom
// scan (VS stockroom-scan.js 621–1450, K2B app.js 7337): reading keycodes
// off a report shown on screen, frame after frame, and turning any pasted
// report into scannable codes. Pure: the image work happens in the browser
// (js/screenscan.js); these are the decisions on what was read.
//
//   otsu(hist, total)              the threshold that best splits text from background
//   wordsToRows(words, keepAll)    OCR words (with positions) → one line per visual row
//   parseRow(line)                 { codes, locs } from a "LOCATION KEYCODE [APN…]" row
//   ingest(tally, lines)           counts each code's sightings (and where it was read); returns new codes
//   filtered(tally, all)           the clean keycodes: APN fragments dropped
//   locVerdict(locs, expected)     whether the report on screen is the bay being reviewed
//   matchPreset(presets, w, h)     a store-wide region for this screen size (2% tolerance)
//   extractCodes(text)             keycodes picked out of any report

export function otsu(hist, total) {
  let sumAll = 0; for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = i; }
  }
  return threshold;
}

export function wordsToRows(words, keepAll = false) {
  const ws = (keepAll ? words.slice() : words.filter(w => /\d/.test(w.text))).sort((a, b) => a.y - b.y || a.x - b.x);
  if (!ws.length) return [];
  const hs = ws.map(w => w.h || 14).sort((a, b) => a - b), thresh = Math.max(6, (hs[Math.floor(hs.length / 2)] || 14) * 0.6);
  const rows = []; let cur = [ws[0]], y = ws[0].y;
  for (const w of ws.slice(1)) { if (Math.abs(w.y - y) > thresh) { rows.push(cur); cur = [w]; y = w.y; } else { cur.push(w); y = (y + w.y) / 2; } }
  rows.push(cur);
  return rows.map(r => r.sort((a, b) => a.x - b.x).map(w => w.text).join(' '));
}

// A 6–8 digit run is a keycode when it opens the row or follows a
// location-length run; straight after another code it is a clipped APN.
// Two 8-digit codes run together are split; one code broken by noise is
// glued back, never on a lettered (header) line.
export function parseRow(line) {
  const out = { codes: [], locs: [] }, runs = String(line).match(/\d+/g) || [];
  if (!runs.length) return out;
  const glued = runs.join(''), lettered = (String(line).match(/[A-Za-z]/g) || []).length >= 2;
  if (!lettered && runs.length >= 2 && glued.length === 8 && !(runs[0].length >= 2 && runs[0].length <= 5 && runs.at(-1).length >= 6)) { out.codes.push(glued); return out; }
  runs.forEach((r, i) => {
    if (r.length >= 6 && r.length <= 8) {
      const prev = i > 0 ? runs[i - 1] : null, prevIsLoc = !!prev && prev.length >= 2 && prev.length <= 5;
      if (i === 0 || prevIsLoc) { out.codes.push(r); if (prevIsLoc) out.locs.push(prev); }
    } else if (r.length === 16) out.codes.push(r.slice(0, 8), r.slice(8));
  });
  if (!out.codes.length && !lettered && runs.length >= 2 && glued.length === 8) out.codes.push(glued);
  return out;
}

// tally: { codes: code → { count, loc }, locs: loc → count }
export function ingest(tally, lines) {
  let added = 0;
  for (const line of lines || []) {
    const p = parseRow(line), loc = p.locs[0] || null;
    for (const c of p.codes) { const t = (tally.codes[c] ||= (added++, { count: 0, loc: null })); t.count++; if (loc && !t.loc) t.loc = loc; }
    for (const l of p.locs) tally.locs[l] = (tally.locs[l] || 0) + 1;
  }
  return added;
}

// The clean list: 6–8 digits; an 8-digit code (or a 6–7 digit one seen once)
// that shares the leading digit dominating the long (APN) reads is a
// clipped APN and is dropped.
export function filtered(tally, all = false) {
  const codes = Object.keys(tally.codes || {});
  if (all) return codes.sort();
  const votes = {}; let total = 0;
  for (const c of codes) if (c.length >= 9) { votes[c[0]] = (votes[c[0]] || 0) + tally.codes[c].count; total += tally.codes[c].count; }
  let apn = null, best = 0; for (const [d, n] of Object.entries(votes)) if (n > best) { best = n; apn = d; }
  const sure = apn && total > 0 && best / total >= 0.6;
  return codes.filter(c => {
    if (c.length < 6 || c.length > 8) return false;
    if (sure && c.length === 8 && c[0] === apn) return false;
    if (sure && c.length <= 7 && c[0] === apn && tally.codes[c].count < 2) return false;
    return true;
  }).sort();
}

export function locVerdict(locs, expected) {
  let best = null, n = 0; for (const [l, k] of Object.entries(locs || {})) if (k > n) { n = k; best = l; }
  if (!best) return { state: 'none' };
  const want = String(expected || '').replace(/\D/g, ''); if (!want) return { state: 'seen', seen: best };
  const norm = s => String(s).replace(/^0+/, '');
  if (norm(best) === norm(want)) return { state: 'match', seen: best, expected: want };
  return n < 2 ? { state: 'none' } : { state: 'mismatch', seen: best, expected: want };
}

export function matchPreset(presets, w, h) {
  if (!presets) return null;
  if (presets[`${w}x${h}`]) return presets[`${w}x${h}`];
  let best = null;
  for (const [k, v] of Object.entries(presets)) { const m = /^(\d+)x(\d+)$/.exec(k); if (m && Math.abs(m[1] - w) / w <= 0.02 && Math.abs(m[2] - h) / h <= 0.02) best = v; }
  return best;
}

// Any report: 8-digit runs are keycodes; 6–7 digit runs only on plain lines
// (eight digits or fewer in all), so prices, quantities and APNs stay out.
export function extractCodes(text) {
  const out = [];
  for (const line of String(text || '').split(/[\r\n]+/)) {
    const runs = line.match(/\d+/g) || [], digits = line.replace(/\D/g, '').length;
    for (const r of runs) if (r.length === 8 || ((r.length === 6 || r.length === 7) && digits <= 8)) out.push(r);
  }
  const codes = [...new Set(out)];
  return { codes, dups: out.length - codes.length };
}
