#!/usr/bin/env node
// Local stack: the worker in workerd (Miniflare) on :8787 seeded with a
// store, and the shell served statically from the repo root on :8080.
//   node scripts/dev.js            → open http://127.0.0.1:8080/
// Sign in with store 1241, PIN 2468. Owner key: dev-owner-key.

import { Miniflare } from 'miniflare';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { hashSecret } from '../worker/auth.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const API = Number(process.env.API_PORT || 8787), WEB = Number(process.env.WEB_PORT || 8080);
const OWNER_KEY = process.env.OWNER_KEY || 'dev-owner-key';

// A stand-in legacy K2B worker on :8789 so the console's Migration tab can
// be tried locally: store code BUS247, PIN 2468, a little history and a board.
const T = Date.now() - 3600000;
const legacyDay = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const pin = req.headers['x-k2b-pin'];
  const send = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.searchParams.get('store') !== 'BUS247') return send({ found: false, error: 'Unknown store code' }, 404);
  if (u.searchParams.get('storeop') === 'info') return send({ found: true, code: 'BUS247', name: 'Busselton (K2B)', storeNumber: '1241' });
  if (pin !== '2468') return send({ error: 'Wrong PIN' }, 403);
  const sub = u.searchParams.get('sub');
  if (sub === 'history') return send({ items: [{ location: '7012', date: '2026-09-17', submittedAt: T - 86400000, readyAt: T - 86000000, submittedDoneAt: T - 85000000, metrics: { expected: 11, scanned: 10, match: 10, accuracy: 91, incorrect: 0 }, codes: ['43166022', '43199310'] }, { location: '7004', date: '2026-09-16', submittedAt: T - 2 * 86400000, readyAt: T - 2 * 86400000 + 3600000, submittedDoneAt: T - 2 * 86400000 + 7200000, metrics: { expected: 9, scanned: 9, match: 9, accuracy: 100, incorrect: 0 }, codes: ['42345501', '43006311'] }], total: 2, offset: 0, hasMore: false });
  if (sub === 'list') return send({ today: legacyDay, requested: ['7037'], items: [{ location: '7014', date: legacyDay, status: 'pending' }] });
  if (sub === 'get') return send({ found: true, submission: { location: '7014', date: legacyDay, submittedAt: T, updatedAt: T + 60000, status: 'pending', codes: [{ code: '42977636', scanned: true }, { code: '43307685', scanned: true }] } });
  if (sub === 'negsohlist') return send({ date: legacyDay, items: [{ keycode: '43302210', qty: -6, name: 'Paper plates 20 pk', location: '7014', confirmed: true, addedAt: T + 240000 }] });
  send({ error: 'unknown' }, 400);
}).listen(8789, '127.0.0.1');

const mf = new Miniflare({
  modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], modulesRoot: root, scriptPath: path.join(root, 'worker/index.js'),
  compatibilityDate: '2026-08-06', compatibilityFlags: ['nodejs_compat'], port: API, host: '127.0.0.1',
  durableObjects: { STORE: { className: 'StoreObject', useSQLite: true }, REGISTRY: { className: 'RegistryObject', useSQLite: true } },
  bindings: { LEGACY_URL: 'http://127.0.0.1:8789', LOOKUP_URL: 'https://shrill-voice-f46f.zephyrus-np750.workers.dev', DETAILS_URL: 'https://k2b-details.zephyrus-np750.workers.dev', TOKEN_SECRET: 'dev-token-secret', OWNER_KEY_HASH: await hashSecret(OWNER_KEY, 1000), TOKEN_TTL_SECONDS: '43200', REFRESH_TTL_SECONDS: '2592000', LOCKOUT_ATTEMPTS: '5', LOCKOUT_SECONDS: '900', ENVIRONMENT: 'dev' },
  persist: process.env.PERSIST ? path.join(root, '.wrangler/dev') : undefined,
});
const api = await mf.ready;
const call = async (m, p, b, t) => { const r = await fetch(new URL(p, api), { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }); return r.json(); };
const owner = await call('POST', '/v1/auth/signin', { ownerKey: OWNER_KEY, device: 'dev' });
const reg = await call('POST', '/v1/admin/stores', { no: '1241', name: 'Busselton', region: 'WA South', pin: '2468', codes: { stockroom: 'SR-CODE', dock: 'DK-CODE', manager: 'MGR-CODE' }, entitlements: { floor: true, stockroom: true, backdock: true } }, owner.token);
console.log('worker  ', String(api), reg.no ? 'seeded store 1241 (PIN 2468)' : reg.code === 'exists' ? 'store 1241 already registered' : JSON.stringify(reg));
// Publish the bundled Busselton map so the shell exercises the map route.
const svgFile = path.join(root, 'maps/1241.svg');
if (fs.existsSync(svgFile)) {
  const pub = await call('POST', '/v1/store/1241/map', { version: 'dev', name: 'Busselton', floors: [{ id: 'ground', name: 'Ground', type: 'foh', svg: fs.readFileSync(svgFile, 'utf8') }] }, owner.token);
  console.log('map     ', pub.version ? `published dev map (${pub.floors[0].shelves} shelves)` : pub.code === 'exists' ? 'dev map already published' : JSON.stringify(pub));
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(WEB, '127.0.0.1', () => console.log('shell   ', `http://127.0.0.1:${WEB}/`));
