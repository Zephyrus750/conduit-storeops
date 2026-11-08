// Two DC consolidation labels on a stretch-wrapped pallet, as a camera would see them,
// with real Code 128 barcodes of the consols' numbers: out/cam/scene.png, for cam/make.sh.
import { launch, dir, ROOT } from '../lib.mjs';
import fs from 'node:fs';
import { CONSOLS, MAN } from '../seed.mjs';
const P = dir('cam');
// Code 128: bar and space widths for values 0–106 (106 is the stop, with its final bar).
const W = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
function code128c(digits) {   // an even run of digits in code set C
  const vals = [105]; for (let i = 0; i < digits.length; i += 2) vals.push(Number(digits.slice(i, i + 2)));
  vals.push(vals.reduce((s, v, i) => s + v * (i || 1), 0) % 103); vals.push(106);
  return vals.map(v => W[v]).join('');
}
function barsSvg(digits, h = 170, unit = 5, quiet = 5) {   // 5 px modules: about 2 px each in the camera's 720 frame
  const w = code128c(digits); let x = quiet * unit, rects = '';
  [...w].forEach((c, i) => { const n = Number(c) * unit; if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${n}" height="${h}"/>`; x += n; });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x + quiet * unit}" height="${h}" viewBox="0 0 ${x + quiet * unit} ${h}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
}
const DEPT = { '022': 'TOYS', '038': 'PARTY', '047': 'BATH', '024': 'KIDSWEAR', '085': 'CARDS & COLLECT', '054': 'KITCHEN', '090': 'GIFT WRAP', '006': 'BEDDING' };
const label = (c, n) => `<div class="lab"><div class="r1"><b>CONSOLIDATION</b><span>STORE <b>1241</b></span></div>
  <div class="r2">DC 4101533 · DESPATCH ${MAN.despatch} · MANIFEST ${MAN.manNo}</div>
  <div class="bc">${barsSvg(c.cons)}</div><div class="hr">${c.cons.replace(/(\d{4})(?=\d)/g, '$1 ')}</div>
  <div class="r3"><span>DEPT <b>${c.dept}</b> ${DEPT[c.dept] || ''}</span><span>CTNS <b>${c.cartons}</b></span><span><b>${n}</b> OF 12</span></div></div>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0}.scene{position:relative;width:3300px;height:2600px;overflow:hidden;
 background:linear-gradient(rgba(235,240,245,.7),rgba(235,240,245,.7)),linear-gradient(115deg,rgba(255,255,255,.0) 0 18%,rgba(255,255,255,.22) 19% 21%,rgba(255,255,255,0) 22% 47%,rgba(255,255,255,.18) 48% 49.5%,rgba(255,255,255,0) 50.5% 76%,rgba(255,255,255,.2) 77% 78.5%,rgba(255,255,255,0) 79%),
 repeating-linear-gradient(90deg,#b98a55 0 430px,#a87a47 430px 436px,#b48552 436px 880px),#b88955}
.seam{position:absolute;left:0;right:0;height:10px;background:#9a6c3c;opacity:.6}
.pos{position:absolute;zoom:1}.lab{width:780px;background:#fbfbf7;border-radius:6px;padding:26px 30px 22px;font-family:'DejaVu Sans',Arial,sans-serif;color:#111;box-sizing:border-box;display:flex;flex-direction:column;gap:10px}
.r1{display:flex;justify-content:space-between;align-items:baseline;font-size:34px}.r1 b{letter-spacing:.04em}.r1 span{font-size:26px}
.r2{font-size:19px;color:#333;border-bottom:2px solid #111;padding-bottom:10px}
.bc{display:flex;justify-content:center;padding-top:6px}.hr{text-align:center;font:600 26px 'DejaVu Sans Mono',monospace;letter-spacing:.06em}
.r3{display:flex;justify-content:space-between;font-size:24px;border-top:2px solid #111;padding-top:10px}
</style><div class="scene"><div class="seam" style="top:420px"></div><div class="seam" style="top:1060px"></div><div class="seam" style="top:1840px"></div><div class="seam" style="top:2400px"></div>
<div class="pos" style="left:560px;top:1010px">${label(CONSOLS[3], 4)}</div>
<div class="pos" style="left:1900px;top:1024px">${label(CONSOLS[4], 5)}</div></div>`;
fs.writeFileSync(P + 'scene.html', html);
const b = await launch();
const p = await b.newPage({ viewport: { width: 3300, height: 2600 } });
await p.goto('file://' + P + 'scene.html'); await p.waitForTimeout(300);
await p.locator('.scene').screenshot({ path: P + 'scene.png' });
// The encoder's own check: each label's barcode, alone on white, reads as its consol with
// the app's ZXing. (cam/make.sh then checks frames of the finished video.)
await p.addScriptTag({ path: ROOT + '/vendor/zxing/zxing.min.js' });
for (const c of [CONSOLS[3], CONSOLS[4]]) {
  const got = await p.evaluate(async svg => { const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(svg); await img.decode(); const cv = document.createElement('canvas'); cv.width = img.width + 40; cv.height = img.height + 40; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 20, 20);
    const Z = window.ZXing, r = new Z.MultiFormatReader(), h = new Map(); h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128]); r.setHints(h); try { return r.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)))).getText(); } catch { return 'FAIL'; } }, barsSvg(c.cons));
  console.log('barcode', c.id, got === c.cons ? 'reads' : `FAIL (${got})`);
  if (got !== c.cons) process.exitCode = 1;
}
await b.close();
