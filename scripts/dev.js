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

const mf = new Miniflare({
  modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], modulesRoot: root, scriptPath: path.join(root, 'worker/index.js'),
  compatibilityDate: '2026-08-06', compatibilityFlags: ['nodejs_compat'], port: API, host: '127.0.0.1',
  durableObjects: { STORE: { className: 'StoreObject', useSQLite: true }, REGISTRY: { className: 'RegistryObject', useSQLite: true } },
  bindings: { TOKEN_SECRET: 'dev-token-secret', OWNER_KEY_HASH: await hashSecret(OWNER_KEY, 1000), TOKEN_TTL_SECONDS: '43200', REFRESH_TTL_SECONDS: '2592000', LOCKOUT_ATTEMPTS: '5', LOCKOUT_SECONDS: '900', ENVIRONMENT: 'dev' },
  persist: process.env.PERSIST ? path.join(root, '.wrangler/dev') : undefined,
});
const api = await mf.ready;
const call = async (m, p, b, t) => { const r = await fetch(new URL(p, api), { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }); return r.json(); };
const owner = await call('POST', '/v1/auth/signin', { ownerKey: OWNER_KEY, device: 'dev' });
const reg = await call('POST', '/v1/admin/stores', { no: '1241', name: 'Busselton', region: 'WA South', pin: '2468', codes: { stockroom: 'SR-CODE', dock: 'DK-CODE', manager: 'MGR-CODE' }, entitlements: { floor: true, stockroom: true, backdock: true } }, owner.token);
console.log('worker  ', String(api), reg.no ? 'seeded store 1241 (PIN 2468)' : reg.code === 'exists' ? 'store 1241 already registered' : JSON.stringify(reg));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(WEB, '127.0.0.1', () => console.log('shell   ', `http://127.0.0.1:${WEB}/`));
