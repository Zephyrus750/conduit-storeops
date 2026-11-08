// The map for the Location refresh chapter: a real part of
// Busselton 1241's published map (maps/1241.svg), the Kitchen runs A8 to A23
// with the Women's Clothing runs behind them, drawn as the phone's Refresh
// view draws them (styles/app.css .map.real.rf, js/views/refresh.js marksFor
// and applyPlan). Each shelf is its own: "A16 S1" is a shelf, "A16" its run.
// Shelves are data (codes, departments, map units), not words.

// [shelf, department, x, y, w, h] in the map's units; '' is a shelf the map has no name for.
export const SHELVES = [
['03 S1','c1',270,-425,20,120], ['03 S2','c1',290,-425,20,120], ['Q17 S1','c1',200,-420,20,160], ['02 S2','c1',220,-420,20,160], ['Q9 S1','c1',-260,-360,20,80],
['Q9 S2','c1',-240,-360,20,80], ['Q13 S1','c1',-25,-360,20,80], ['Q13 S2','c1',-5,-360,20,80], ['Q14 E2','c1',45,-340,40,20], ['Q16 E2','c1',120,-340,40,20],
['03 E2','c1',270,-305,40,20], ['Q12 S1','c1',-180,-300,120,20], ['Q9 E2','c1',-260,-280,40,20], ['Q12 S2','c1',-180,-280,120,20], ['Q13 E2','c1',-25,-280,40,20],
['Q15','c1',60,-280,80,20], ['Q15','c1',60,-260,80,20], ['02 E2','c1',200,-260,40,20], ['Q4 S2','c1',-280,-200,280,20], ['','c1',60,-200,280,20],
['A2 S1','h1',-280,-180,280,20], ['A4 S1','h1',60,-180,280,20], ['A8 E2','h1',-240,-120,40,20], ['A10 E2','h1',-160,-120,40,20], ['A12 E2','h1',-80,-120,40,20],
['A14 E2','h1',0,-120,40,20], ['A16 E2','h1',80,-120,40,20], ['A18 E2','h1',160,-120,40,20], ['A20 E2','h1',260,-120,40,20], ['A8 S1','h1',-240,-100,20,120],
['A8 S2','h1',-220,-100,20,120], ['A10 S1','h1',-160,-100,20,120], ['A10 S2','h1',-140,-100,20,120], ['A12 S1','h1',-80,-100,20,120], ['A12 S2','h1',-60,-100,20,120],
['A14 S1','h1',0,-100,20,120], ['A14 S2','h1',20,-100,20,120], ['A16 S1','h1',80,-100,20,120], ['A16 S2','h1',100,-100,20,120], ['A18 S1','h1',160,-100,20,120],
['A18 S2','h1',180,-100,20,120], ['A20 S1','h1',260,-100,20,120], ['A20 S2','h1',280,-100,20,120], ['A8 E1','h1',-240,20,40,20], ['A10 E1','h1',-160,20,40,20],
['A12 E1','h1',-80,20,40,20], ['A14 E1','h1',0,20,40,20], ['A16 E1','h1',80,20,40,20], ['A18 E1','h1',160,20,40,20], ['A20 E1','h1',260,20,40,20],
['','h1',-260,80,20,80], ['','h1',-240,80,20,80], ['','h1',-180,80,20,80], ['','h1',-160,80,20,80], ['','h1',-100,80,20,80],
['','h1',-80,80,20,80], ['','h1',-20,80,20,80], ['','h1',0,80,20,80], ['','h1',60,80,20,80], ['','h1',80,80,20,80],
['A23 E1','h1',260,100,40,20], ['A23 S1','h1',260,120,20,200], ['B5 S2','h2',280,120,20,200], ['A21 E1','h1',180,160,40,20], ['A21 S1','h1',180,180,20,160],
['A21 S2','h1',200,180,20,160], ['A11 E1','h1',-230,205,40,20], ['A13 E1','h1',-150,205,40,20], ['A15 E1','h1',-70,205,40,20], ['A17 E1','h1',10,205,40,20],
['A19 E1','h1',90,205,40,20], ['A11 S1','h1',-230,225,20,120], ['A11 S2','h1',-210,225,20,120], ['A13 S1','h1',-150,225,20,120], ['A13 S2','h1',-130,225,20,120],
['A15 S1','h1',-70,225,20,120], ['A15 S2','h1',-50,225,20,120], ['A17 S1','h1',10,225,20,120], ['A17 S2','h1',30,225,20,120], ['A19 S1','h1',90,225,20,120],
['A19 S2','h1',110,225,20,120], ['A23 E2','h1',260,320,40,20], ['A21 E2','h1',180,340,40,20], ['A11 E2','h1',-230,345,40,20], ['A13 E2','h1',-150,345,40,20],
['A15 E2','h1',-70,345,40,20], ['A17 E2','h1',10,345,40,20], ['A19 E2','h1',90,345,40,20], ['','h1',-200,400,320,20], ['','h1',120,400,320,20],
];
// The departments in view: colour (the map's), chip ink (js/ui.js depInk) and name.
export const DEPT = { h1: ['#FF8C00', '#111827', 'Kitchen'], h2: ['#9B59B6', '#fff', 'Bed, Bath, Laundry'], c1: ['#FF69B4', '#111827', 'Women’s Clothing'], k2: ['#FF4500', '#111827', 'Toys'] };
export const dep = d => `<span class="rf-dep" style="background:${DEPT[d][0]};color:${DEPT[d][1]}">${d.toUpperCase()}</span>`;

// The views: the aisle the chapter works in, and the map moved to a shelf
// above the open sheet (zoomTo, 500 map units across).
export const VIEW = [-250, -310, 550, 942];
export const viewOn = (code, top = 0.16) => { const s = SHELVES.find(r => r[0] === code); const cx = s[2] + s[4] / 2, cy = s[3] + s[5] / 2, w = 500, h = w * 942 / 550; return [Math.round(cx - w / 2), Math.round(cy - h * top), w, Math.round(h)]; };

// The map in Refresh: done this week green (#16a34a, outline #4ade80); a
// focus department's shelf still to do grey with an orange outline
// (#D24E0E); the rest faint with their department's outline; a planned
// shelf in its colour (with a dot of it once refreshed); the shelf last
// tapped outlined dark. In Plan every shelf keeps its fill a little lighter.
export function mapSvg({ done = [], focus = ['h1', 'k2'], sel = '', plan = {}, planMode = false, view = VIEW } = {}) {
  const D = new Set(done);
  let s = `<svg class="rf-svg" viewBox="${view.join(' ')}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">`, labels = '';
  for (const [code, d, x, y, w, h] of SHELVES) {
    const isDone = !!code && D.has(code), pc = code ? plan[code] : '', foc = !!code && focus.includes(d) && !isDone;
    let fill = '#6b7280', fo = 1, stroke = DEPT[d][0], sw = 1.5, show = !!code;
    if (focus.length && !foc && !isDone && !pc) { fo = 0.09; show = false; }
    if (planMode && fo === 1) fo = 0.75;
    if (foc) { stroke = '#D24E0E'; sw = 5; }
    if (isDone) { fill = '#16a34a'; stroke = '#4ade80'; sw = 3; }
    if (pc && (planMode || !isDone)) { fill = pc; fo = 1; }
    if (code && code === sel) { stroke = '#111827'; sw = 3; fo = Math.max(fo, planMode ? 0.75 : 1); }
    s += `<rect class="rf-sh" data-s="${code}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" fill-opacity="${fo}" stroke="${stroke}" stroke-width="${sw}"/>`;
    if (pc && isDone && !planMode) s += `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.3}" fill="${pc}" stroke="#fff" stroke-width="2"/>`;
    if (show) { const [run, sub = ''] = code.split(' '); labels += `<text x="${x + w / 2}" y="${y + h / 2 - (sub ? 3 : 0)}" class="rf-lr">${run}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 6}" class="rf-ls">${sub}</text>` : ''}`; }
  }
  return s + `<g class="rf-lab${planMode ? ' pl' : ''}">${labels}</g></svg>`;
}

// ── Code 128 (code set B): a shelf label's barcode, drawn for real ──
const W = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
export function code128(text) {
  const v = [104, ...[...text].map(ch => ch.charCodeAt(0) - 32)];
  v.push(v.reduce((s, x, i) => s + x * (i || 1), 0) % 103); v.push(106);
  let x = 10, r = '';
  [...v.map(k => W[k]).join('')].forEach((w, i) => { if (i % 2 === 0) r += `<rect x="${x}" width="${w}" height="40"/>`; x += Number(w); });
  return `<svg viewBox="0 0 ${x + 10} 40" preserveAspectRatio="none" aria-hidden="true"><rect width="100%" height="40" fill="#fff"/><g fill="#111">${r}</g></svg>`;
}
