// Auto-detect, the geometry: what the map editor makes of the boxes it found
// on a floor plan imported at 100%. Pure; the editor's detector (editor.js)
// finds the boxes, this decides the shelves.
//
// A store's plan draws every bay divider, so before runs are merged the
// boxes are single bays: their lengths are the store's module sizes (up to
// three), learned per plan rather than assumed. A run is then:
//   - its bays at the nearest learned size (a run with no dividers drawn is
//     fitted to whichever size divides it best);
//   - two faces, S1 (left or top) and S2 (right or bottom), when it is about
//     two shelves deep; one face otherwise;
//   - an end, E1 at the start and E2 at the end, when its first or last box
//     is much shorter than its bays and about a shelf deep (an end cap drawn
//     on the plan), drawn as
//     a one-module shelf across the run's full width, as the maps draw them.
// Detected shapes already covered by a drawn shelf are reported, so a second
// pass over a part-drawn floor shows only what is missing.
//
//   learnModuleSizes(lengths, { max, tol })           → [size…] most common first
//   parseSizes(text)                                  → [size…] from "40, 48, 60"
//   fitModules(len, sizes)                            → { modules, bayW }
//   runBays(box, parts, { shelfDepth, ends })         → { V, bays, capStart, capEnd, line } along the run
//   planRun(box, parts, opts)                         → [{ x, y, orientation, modules, bayW, depth, subname, kind }]
//   coveredBy(box, shelfBoxes)                        → fraction of box under drawn shelves (0..1)

const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(a, b);

// The bay lengths that recur: grouped within ±tol, a group needs at least
// three bays (or 4% of them) to count, the busiest groups first.
export function learnModuleSizes(lengths, { max = 3, tol = 0.08 } = {}) {
  const xs = lengths.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!xs.length) return [];
  const groups = [];
  for (const x of xs) {
    const g = groups[groups.length - 1];
    if (g && near(x, g.sum / g.n, tol)) { g.sum += x; g.n += 1; } else groups.push({ sum: x, n: 1 });
  }
  const need = Math.max(3, Math.ceil(xs.length * 0.04));
  return groups.filter(g => g.n >= need).sort((a, b) => b.n - a.n).slice(0, max).map(g => Math.round(g.sum / g.n));
}

export function parseSizes(text) {
  return [...new Set(String(text || '').split(/[\s,;]+/).map(Number).filter(n => Number.isFinite(n) && n >= 4 && n <= 2000).map(Math.round))].slice(0, 3);
}

// The size that divides a length best, and how many bays of it.
export function fitModules(len, sizes) {
  let best = null;
  for (const s of sizes.length ? sizes : [len]) {
    const modules = Math.max(1, Math.round(len / s)), err = Math.abs(len - modules * s) / len;
    if (!best || err < best.err - 1e-9) best = { modules, bayW: s, err };
  }
  return { modules: best.modules, bayW: best.bayW };
}
const snap = (x, sizes, tol = 0.12) => { let b = null; for (const s of sizes) if (near(x, s, tol) && (!b || Math.abs(x - s) < Math.abs(x - b))) b = s; return b ?? Math.round(x); };

// A run's bays along its length, as { at, len }: boxes side by side across
// the run (the two faces drawn as separate boxes) count once, and a short
// first or last box about one shelf deep is an end cap, not a bay. Outlined
// bays are found as their insides, so each is short by the divider line
// between them: that line (the usual gap between bays) is added back, half
// at each side, so bays are measured centre to centre of their dividers.
export function runBays(box, parts, { shelfDepth = 20, ends = true } = {}) {
  const V = box.h > box.w;
  const segs = (parts && parts.length ? parts : [box]).map(p => ({ at: V ? p.y : p.x, len: V ? p.h : p.w })).sort((a, b) => a.at - b.at);
  const bays = [];
  for (const s of segs) {
    const b = bays[bays.length - 1];
    const ov = b ? Math.min(b.at + b.len, s.at + s.len) - Math.max(b.at, s.at) : 0;
    if (b && ov >= 0.5 * Math.min(b.len, s.len)) { const end = Math.max(b.at + b.len, s.at + s.len); b.at = Math.min(b.at, s.at); b.len = end - b.at; }
    else bays.push({ ...s });
  }
  const gaps = bays.slice(1).map((b, i) => b.at - (bays[i].at + bays[i].len)).filter(g => g >= 0).sort((a, b) => a - b);
  const line = gaps.length ? Math.min(gaps[gaps.length >> 1], 0.25 * Math.min(...bays.map(b => b.len))) : 0;
  for (const b of bays) { b.at -= line / 2; b.len += line; }
  let capStart = null, capEnd = null;
  if (ends && bays.length >= 3) {
    const mid = bays.slice(1, -1).map(b => b.len).sort((a, b) => a - b), m = mid[mid.length >> 1];
    const isCap = b => b.len < 0.6 * m && b.len <= 1.5 * shelfDepth;
    if (isCap(bays[0])) capStart = bays.shift();
    if (bays.length >= 2 && isCap(bays[bays.length - 1])) capEnd = bays.pop();
  }
  return { V, bays, capStart, capEnd, line };
}

// One detected run → its shelves, in canvas units. box: { x, y, w, h };
// parts: the run's bays as found before merging (same units); opts:
// { shelfDepth, sizes, sides, ends }.
export function planRun(box, parts, { shelfDepth = 20, sizes = [], sides = true, ends = true } = {}) {
  const { V, bays: ps, capStart, capEnd, line } = runBays(box, parts, { shelfDepth, ends });
  const at = p => p.at, len = p => p.len;
  const across = (V ? box.w : box.h) + line;
  const capped = { start: capStart, end: capEnd };
  const bodyStart = at(ps[0]), bodyEnd = at(ps[ps.length - 1]) + len(ps[ps.length - 1]), bodyLen = bodyEnd - bodyStart;
  // Bays: the drawn dividers when they agree, else the best-fitting size.
  let modules, bayW;
  const ls = ps.map(len), mean = ls.reduce((a, b) => a + b, 0) / ls.length;
  if (ps.length >= 2 && ls.every(l => near(l, mean, 0.15))) { modules = ps.length; bayW = snap(mean, sizes); }
  else ({ modules, bayW } = fitModules(bodyLen, sizes.length ? sizes : [mean]));
  const runLen = modules * bayW, start = Math.round(bodyStart + (bodyLen - runLen) / 2);
  // Faces: two when the run is about two shelves deep.
  const two = sides && across >= 1.5 * shelfDepth, depth = two ? across / 2 : across;
  const crossStart = (V ? box.x : box.y) - line / 2, out = [];
  const face = (k, sub) => ({ kind: 'side', subname: sub, orientation: V ? 'V' : 'H', modules, bayW, depth: Math.round(depth),
    x: V ? Math.round(crossStart + k * depth) : start, y: V ? start : Math.round(crossStart + k * depth) });
  if (two) out.push(face(0, 'S1'), face(1, 'S2')); else out.push(face(0, ''));
  // Ends: one module across the run's width, outside its start and end.
  const cap = (c, sub) => { const d = Math.round(len(c)); return { kind: 'end', subname: sub, orientation: V ? 'H' : 'V', modules: 1, bayW: Math.round(across), depth: d,
    x: V ? Math.round(crossStart) : (sub === 'E1' ? start - d : start + runLen), y: V ? (sub === 'E1' ? start - d : start + runLen) : Math.round(crossStart) }; };
  if (capped.start) out.push(cap(capped.start, 'E1'));
  if (capped.end) out.push(cap(capped.end, 'E2'));
  return out;
}

// How much of a detected box is already under drawn shelves (their
// axis-aligned bounds), so a second detection pass skips what is drawn.
export function coveredBy(box, shelfBoxes) {
  const area = box.w * box.h; if (!(area > 0)) return 0;
  let hit = 0;
  for (const s of shelfBoxes) {
    const ox = Math.min(box.x + box.w, s.x + s.w) - Math.max(box.x, s.x), oy = Math.min(box.y + box.h, s.y + s.h) - Math.max(box.y, s.y);
    if (ox > 0 && oy > 0) hit += ox * oy;
  }
  return Math.min(1, hit / area);
}
