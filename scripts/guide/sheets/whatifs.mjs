// One image of the What ifs: each one's frames and captions, and its What to know:
//   node scripts/guide/sheets/whatifs.mjs → out/sheets/what-ifs.png
import { launch, dir, OUT } from '../lib.mjs';
import fs from 'node:fs';
const P = dir('sheets');
const rows = ['offmanifest', 'taken', 'rollover'].map(id => {
  const d = JSON.parse(fs.readFileSync(`${OUT}/wi/${id}/steps.json`, 'utf8'));
  const uri = f => 'data:image/webp;base64,' + fs.readFileSync(`${OUT}/webp/${id}/${f.replace('.png', '.webp')}`).toString('base64');
  const cells = d.steps.map((s, i) => `<figure><img src="${uri(s.to)}"><figcaption><b>${i + 1}</b>${s.cap}</figcaption></figure>`).join('');
  return `<section><div class="h"><span>What if</span><h2>${d.title}</h2></div><div class="r"><div class="g">${cells}</div>
  <div class="k"><i>What to know</i><ul>${d.specifics.map(x => `<li>${x}</li>`).join('')}</ul></div></div></section>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#E9EEF2;font-family:Inter,system-ui,sans-serif;color:#111827}
.w{width:1900px;padding:36px;box-sizing:border-box;display:flex;flex-direction:column;gap:30px}
h1{margin:0;font-size:34px;letter-spacing:-.01em}p{margin:0;font-size:18px;color:#4B5563}
section{background:#fff;border-radius:22px;padding:24px;display:flex;flex-direction:column;gap:18px}
.h{display:flex;align-items:baseline;gap:14px}.h span{font:600 15px ui-monospace,Menlo,monospace;color:#0B6183;text-transform:uppercase;letter-spacing:.08em}
h2{margin:0;font-size:26px}.r{display:grid;grid-template-columns:1fr 420px;gap:26px;align-items:start}
.g{display:grid;grid-template-columns:repeat(7,1fr);gap:16px}figure{margin:0;display:flex;flex-direction:column;gap:8px}
img{width:100%;border-radius:16px;border:5px solid #0B0F14;box-sizing:border-box}figcaption{font-size:14.5px;line-height:1.35}
figcaption b{display:inline-block;min-width:20px;margin-right:4px;color:#0B6183;font-family:ui-monospace,Menlo,monospace}
.k{background:#F3F6F9;border-radius:16px;padding:18px 20px}.k i{font:600 13px ui-monospace,Menlo,monospace;font-style:normal;color:#0B6183;text-transform:uppercase;letter-spacing:.08em}
ul{margin:10px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:9px;font-size:16px;line-height:1.4}</style>
<div class="w"><h1>Receive a truck · What ifs, recorded from the real app</h1><p>Three things that can happen while a truck comes in. Each one is the real Conduit screen on a demo dock at 2× (390 × 844), with what to know about it.</p>${rows}</div>`;
fs.writeFileSync(P + 'whatifs.html', html);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1900, height: 1000 }, deviceScaleFactor: 1.4 });
await p.goto('file://' + P + 'whatifs.html'); await p.waitForTimeout(800);
await p.locator('.w').screenshot({ path: P + 'what-ifs.png' });
await b.close();
