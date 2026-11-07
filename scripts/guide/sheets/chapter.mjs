// One image of the whole chapter, every step's last frame and its caption:
//   node scripts/guide/sheets/chapter.mjs → out/sheets/sample-chapter.png
import { launch, dir, OUT } from '../lib.mjs';
import fs from 'node:fs';
const P = dir('sheets'), M = OUT + '/main/', WP = OUT + '/webp/main/';
const S = JSON.parse(fs.readFileSync(M + 'steps.json', 'utf8')).steps;
const uri = f => 'data:image/webp;base64,' + fs.readFileSync(WP + f.replace('.png', '.webp')).toString('base64');
const KB = Math.round(fs.readdirSync(WP).reduce((n, f) => n + fs.statSync(WP + f).size, 0) / 1024);
const cells = S.map((s, i) => `<figure><img src="${uri(s.to)}"><figcaption><b>${i + 1}</b>${s.cap}</figcaption></figure>`).join('');
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#E9EEF2;font-family:Inter,system-ui,sans-serif;color:#111827}
.w{width:1900px;padding:36px;box-sizing:border-box;display:flex;flex-direction:column;gap:22px}
h1{margin:0;font-size:34px;letter-spacing:-.01em}p{margin:0;font-size:18px;color:#4B5563}
.g{display:grid;grid-template-columns:repeat(6,1fr);gap:22px}figure{margin:0;display:flex;flex-direction:column;gap:10px}
img{width:100%;border-radius:22px;border:6px solid #0B0F14;box-sizing:border-box}figcaption{font-size:17px;line-height:1.35}
figcaption b{display:inline-block;min-width:26px;margin-right:6px;color:#0B6183;font-family:ui-monospace,Menlo,monospace}</style>
<div class="w"><h1>Receive a truck on the phone · rebuilt from the real app</h1><p>Every frame is the real Conduit screen, captured on a demo dock at 2× (390 × 844). ${S.length} steps, camera scanning included, ${KB} KB in all.</p><div class="g">${cells}</div></div>`;
fs.writeFileSync(P + 'chapter.html', html);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1900, height: 1000 }, deviceScaleFactor: 1.4 });
await p.goto('file://' + P + 'chapter.html'); await p.waitForTimeout(800);
await p.locator('.w').screenshot({ path: P + 'sample-chapter.png' });
await b.close();
