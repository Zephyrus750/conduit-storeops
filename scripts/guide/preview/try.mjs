// Try it, done by a script: taps wherever the amber ring waits until the
// chapter (or a What if, by number) is done, at 1440×900 and on a 420×860 phone.
//   node scripts/guide/preview/try.mjs <chapter> [what-if number]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, OUT } from '../lib.mjs';
const ROOT = OUT + '/preview/', [id, story] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await launch(); let bad = 0;
for (const [w, h, name, mobile] of [[1440, 900, 'pc1440', false], [420, 860, 'phone', true]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) }), p = await c.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/#${id}`); await p.waitForTimeout(1500);
  const g = s => p.locator('#guide').locator(s);
  if (story) { await g(`.wcard[data-story="${Number(story) - 1}"]`).click(); await p.waitForTimeout(500); }
  await g('.modes button[data-mode="try"]').click(); await p.waitForTimeout(900);
  const total = Number((await g('.cap-n').textContent()).split(' / ')[1]); let taps = 0;
  for (let k = 0; k < 60; k++) {
    if (await g('.donecard').isVisible().catch(() => false)) break;
    const ring = g('.fg.try');
    if (await ring.count()) { await ring.first().scrollIntoViewIfNeeded(); const r = await ring.first().boundingBox(); if (r) { await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); taps++; } }
    await p.waitForTimeout(1200);
  }
  const done = await g('.donecard').isVisible().catch(() => false), n = await g('.cap-n').textContent();
  console.log(name, done ? 'done' : 'NOT DONE', n, `${taps} taps`, errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
  bad += !done + errs.length; await c.close();
}
await b.close(); srv.close(); process.exitCode = bad ? 1 : 0;
