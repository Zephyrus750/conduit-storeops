// Every step of a redrawn chapter (and each of its What ifs) as Handbook lays
// it out, one tall screenshot each, at 1440 wide: out/preview-shots/book-*.png.
//   node scripts/guide/preview/book.mjs <chapter>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, dir, OUT } from '../lib.mjs';
const ROOT = OUT + '/preview/', SHOTS = dir('preview-shots'), id = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await launch(), p = await b.newPage({ viewport: { width: 1440, height: 900 } }), errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/#${id}`); await p.waitForTimeout(1500);
const sr = s => p.locator('#guide').locator(s);
await sr('.modes button[data-mode="read"]').click(); await p.waitForTimeout(2500);
await sr('.stagebox').screenshot({ path: `${SHOTS}book-${id}.png` });
const n = await sr('.wcard').count();
for (let i = 0; i < n; i++) {
  await sr(`.wcard[data-story="${i}"]`).click(); await p.waitForTimeout(400);
  if (await sr('.modes button[data-mode="read"]').getAttribute('aria-pressed') !== 'true') await sr('.modes button[data-mode="read"]').click();
  await p.waitForTimeout(2500);
  await sr('.stagebox').screenshot({ path: `${SHOTS}book-${id}-w${i + 1}.png` });
}
console.log(id, 'book', n, 'What ifs', errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await b.close(); srv.close();
