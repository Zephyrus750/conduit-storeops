// Live reading of the PDT's list (K2B's Live Scanner, brought into Conduit):
// the parts with no camera and no screen, shared with the tests. The camera,
// Tesseract and the overlay are js/livescan.js.
//
//   codesIn(words, text)   8-digit keycodes in one OCR pass, each with its box
//   preprocess(px, w, h, banded)   K2B's adaptive contrast; returns the mean luma
//   decide({ code, reads, verdict, have, expected })   'already' | 'add' | 'wait' | 'hold'
//   misreadFix(code, { have, expected })   { use, at } | null: the code a held one probably is
//
// The acceptance rules, from K2B and the October showcase:
//  - a code already on today's list for the bay goes in on the first read
//    (the list is the strongest evidence there is);
//  - any other code needs two reads, three when the catalogue says it is
//    not a product; a catalogue that cannot be reached (offline) never makes
//    it slower: two reads;
//  - a code one digit from one already in, or from one on today's list, is
//    held (not added) unless the catalogue knows it: real keycodes on one
//    list can differ by a digit, a misread is never a product.

// Words from Tesseract (text, bbox {x0,y0,x1,y1}, confidence) and the page
// text; 8-digit codes found three ways, as K2B: a word that is the code, two
// or three words on one line that split it, and a run of 8 in a line.
export function codesIn(words = [], text = '') {
  const found = new Map();
  for (const w of words) {
    const d = String(w.text || '').replace(/\D/g, '');
    if (d.length === 8 && (w.confidence ?? 100) > 60 && d.length === String(w.text || '').replace(/\s/g, '').length && !found.has(d)) found.set(d, w.bbox || null);
  }
  for (let i = 0; i < words.length; i++) {
    let joined = String(words[i].text || '').replace(/\D/g, ''), last = i;
    for (let j = i + 1; j < Math.min(i + 3, words.length); j++) {
      if (!adjacent(words[j - 1], words[j])) break;
      joined += String(words[j].text || '').replace(/\D/g, ''); last = j;
      if (joined.length === 8) { if (!found.has(joined)) found.set(joined, span(words[i].bbox, words[last].bbox)); break; }
      if (joined.length > 8) break;
    }
  }
  for (const line of String(text || '').split('\n')) {
    for (const run of line.match(/\d+/g) || []) {
      if (run.length !== 8 || found.has(run)) continue;
      let box = null;
      for (const w of words) { const d = String(w.text || '').replace(/\D/g, ''); if (d && run.includes(d) && w.bbox) box = span(box, w.bbox); }
      found.set(run, box);
    }
  }
  return [...found].map(([code, bbox]) => ({ code, bbox }));
}
// Two words that could be halves of one split code: the same line and a gap
// under two digit widths. The PDT's Take column sits a gutter away from each
// keycode, so it never joins one (K2B's phantom codes).
export function adjacent(a, b) {
  const p = a?.bbox, q = b?.bbox; if (!p || !q) return false;
  const h = Math.max(p.y1 - p.y0, q.y1 - q.y0, 1);
  if (Math.abs((p.y0 + p.y1) / 2 - (q.y0 + q.y1) / 2) > h * 0.6) return false;
  const digits = String(a.text || '').replace(/\D/g, '').length, dw = (p.x1 - p.x0) / Math.max(1, digits), gap = q.x0 - p.x1;
  return gap >= -dw && gap <= dw * 2;
}
const span = (a, b) => !a ? (b ? { ...b } : null) : !b ? { ...a } : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };

// K2B's contrast: grey, then stretched 1.5× around the frame's own mean
// (clamped 80–176) so a dim aisle keeps its digits; banded passes take the
// mean per sixth of the frame, blended between bands, so a glare stripe
// does not wash a row out. Passes alternate global and banded: a misread
// under one rarely repeats under the other, so the reads stay independent.
export function preprocess(px, w, h, banded = false) {
  const BANDS = banded ? 6 : 1, bandH = Math.ceil(h / BANDS), sums = new Array(BANDS).fill(0), counts = new Array(BANDS).fill(0);
  for (let y = 0; y < h; y++) {
    const band = Math.min(BANDS - 1, (y / bandH) | 0);
    for (let x = 0, i = y * w * 4; x < w; x++, i += 4) { const g = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; px[i] = g; sums[band] += g; counts[band]++; }
  }
  const mean = sums.reduce((a, b) => a + b, 0) / Math.max(1, w * h);
  const pivots = sums.map((s, b) => Math.max(80, Math.min(176, s / Math.max(1, counts[b]))));
  for (let y = 0; y < h; y++) {
    let pivot = pivots[0];
    if (BANDS > 1) { const fb = y / bandH - 0.5, lo = Math.max(0, Math.min(BANDS - 1, Math.floor(fb))), hi = Math.min(BANDS - 1, lo + 1), t = Math.max(0, Math.min(1, fb - lo)); pivot = pivots[lo] + (pivots[hi] - pivots[lo]) * t; }
    for (let x = 0, i = y * w * 4; x < w; x++, i += 4) { const v = Math.max(0, Math.min(255, (px[i] - pivot) * 1.5 + 128)); px[i] = px[i + 1] = px[i + 2] = v; }
  }
  return mean;
}

// Where two codes of one length differ, when it is in exactly one digit; else -1.
export function diffAt(a, b) {
  a = String(a); b = String(b); if (a.length !== b.length) return -1;
  let at = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (at >= 0) return -1; at = i; }
  return at;
}
export const twinOf = (code, codes) => { for (const c of codes) if (c !== code && diffAt(code, c) >= 0) return c; return null; };

// The reads a code needs: 2, or 3 when the catalogue says it is no product.
export const readsNeeded = verdict => (verdict === 'unknown' ? 3 : 2);
export function decide({ code, reads = 0, verdict = 'checking', have = new Set(), expected = new Set() }) {
  if (have.has(code)) return 'already';
  if (expected.has(code)) return 'add';
  if (verdict === 'checking') return 'wait';
  if (reads < readsNeeded(verdict)) return 'wait';
  if (verdict !== 'ok' && twinOf(code, [...expected, ...have])) return 'hold';
  return 'add';
}
// What a held code probably is: the code one digit away on today's list
// that is not in yet, else one already in. at is the differing digit.
export function misreadFix(code, { have = new Set(), expected = new Set() } = {}) {
  const pick = c => ({ use: c, at: diffAt(code, c) });
  for (const c of expected) if (!have.has(c) && diffAt(code, c) >= 0) return pick(c);
  for (const c of [...expected, ...have]) if (diffAt(code, c) >= 0) return pick(c);
  return null;
}
