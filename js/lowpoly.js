// The sign-in background: four low-poly scenes that crossfade behind the
// card (the showcase's .si-bg.poly). Drawn here rather than shipped as
// artwork so the facets take the store's accent and the ground tone of the
// current theme: each facet is the accent at a low opacity over the ground,
// so light, dark and every accent choice come out right with no extra files.
// Deterministic: the same seed draws the same scene on every device.
//
//   polyBackground()  → '<div class="si-bg poly"><i>svg</i>…</div>'

const W = 1440, H = 900, COLS = 13, ROWS = 9;

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// One scene: a jittered grid split into triangles, shaded by a soft band
// that sweeps across the frame (its angle and bend change per seed), with a
// little per-facet noise so neighbours never match exactly.
function scene(seed) {
  const r = rng(seed), cw = W / (COLS - 1), rh = H / (ROWS - 1);
  const pts = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const edgeX = x === 0 || x === COLS - 1, edgeY = y === 0 || y === ROWS - 1;
    pts.push([Math.round(x * cw + (edgeX ? 0 : (r() - .5) * cw * .7)), Math.round(y * rh + (edgeY ? 0 : (r() - .5) * rh * .7))]);
  }
  const a = .25 + r() * .5, b = (r() - .5) * .5, k = 2 + r() * 3, ph = r() * 6.28, w = .17 + r() * .08;
  const band = (x, y) => { const u = x / W, v = y / H, mid = a + b * (u - .5) + .1 * Math.sin(u * k + ph); return Math.exp(-((v - mid) ** 2) / (w * w)); };
  let out = '';
  const tri = (p, q, s) => {
    const cx = (p[0] + q[0] + s[0]) / 3, cy = (p[1] + q[1] + s[1]) / 3;
    const o = Math.min(.42, .012 + band(cx, cy) * (.24 + r() * .2) + (cx / W) * .04);
    if (o < .03) return;
    out += `<polygon points="${p[0]},${p[1]} ${q[0]},${q[1]} ${s[0]},${s[1]}" fill-opacity="${o.toFixed(3)}"/>`;
  };
  for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLS - 1; x++) {
    const p00 = pts[y * COLS + x], p10 = pts[y * COLS + x + 1], p01 = pts[(y + 1) * COLS + x], p11 = pts[(y + 1) * COLS + x + 1];
    if ((x + y) % 2) { tri(p00, p10, p11); tri(p00, p11, p01); } else { tri(p00, p10, p01); tri(p10, p11, p01); }
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="var(--accent)" stroke="var(--accent)" stroke-opacity=".05" stroke-width="1">${out}</g></svg>`;
}

let cached = null;
export function polyBackground() {
  cached ||= [11, 23, 37, 51].map(scene);
  return `<div class="si-bg poly" aria-hidden="true">${cached.map((s, i) => `<i style="animation-delay:${i * 9}s">${s}</i>`).join('')}</div>`;
}
