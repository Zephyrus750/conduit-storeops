// Serves the built preview and opens it at the store PC's 1920×1080, 1440×900,
// half-screen 960×1040 and a 420×860 phone: page errors, horizontal scroll,
// and a screenshot of each (out/preview-shots/). With a chapter id, it opens
// that chapter; with "play", it also plays it in Watch to the end.
//   node scripts/guide/preview/check.mjs [chapter] [play]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, dir, OUT } from '../lib.mjs';

const ROOT = OUT + '/preview/', SHOTS = dir('preview-shots'), [chapter = '', play = ''] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port, b = await launch();
let bad = 0;
for (const [w, h, name, mobile] of [[1920, 1080, 'pc1080', false], [1440, 900, 'pc1440', false], [960, 1040, 'half', false], [420, 860, 'phone', true]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const p = await c.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errs.push(`${r.status()} ${r.url()}`); });
  await p.goto(`http://127.0.0.1:${port}/${chapter ? '#' + chapter : ''}`); await p.waitForTimeout(1800);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (play) {
    await p.evaluate(() => { const sr = document.querySelector('#guide').shadowRoot; sr.querySelector('[data-c="again"]')?.click(); });
    await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#guide').shadowRoot.querySelector('[data-c="play"]')?.click());
    const t0 = Date.now(); let n = '';
    while (Date.now() - t0 < 90000) { n = await p.evaluate(() => document.querySelector('#guide').shadowRoot.querySelector('.cap-n')?.textContent || ''); const [a, z] = n.split(' / ').map(Number); const playing = await p.evaluate(() => /Pause/.test(document.querySelector('#guide').shadowRoot.querySelector('[data-c="play"]')?.textContent || '')); if (a === z && !playing) break; await p.waitForTimeout(500); }
    console.log(name, 'played to', n);
  }
  await p.screenshot({ path: `${SHOTS}${chapter || 'page'}-${name}.png` });
  console.log(name, sw > 0 ? `SCROLLS ${sw}px` : 'no side scroll', errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
  bad += (sw > 0) + errs.length;
  await c.close();
}
await b.close(); srv.close();
process.exitCode = bad ? 1 : 0;
