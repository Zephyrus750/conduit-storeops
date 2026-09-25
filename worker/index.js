// Conduit worker entry. Routes /v1/*, verifies tokens, and hands store
// traffic to the store's Durable Object. Everything not yet built returns
// 501 not_implemented with the route named, never a silent 404.

import { Router } from './router.js';
import { json, fail, preflight, readJson, HttpError } from './http.js';
import { signToken, verifyToken, verifySecret, makeClaims, hasRole } from './auth.js';
export { StoreObject } from './store.js';
export { RegistryObject } from './registry.js';
export { CatalogueObject } from './catalogue-object.js';
import { VERSION } from './version.js';
import { parseCodes, lookup, catalogueStub } from './catalogue.js';
import { importK2B } from './import.js';
import { importDV } from './import-dv.js';

const r = new Router();

// ── health ────────────────────────────────────────────────────────────────
r.get('/v1/health', (_req, env) => json({ ok: true, version: VERSION, env: env.ENVIRONMENT || 'dev' }));

// ── auth ──────────────────────────────────────────────────────────────────
r.post('/v1/auth/signin', async (req, env) => {
  const b = await readJson(req);
  // The device id keys the devices projection and lockouts: letters, digits,
  // dot, dash and underscore only, never a prototype name.
  const device = String(b.device || '').slice(0, 64) || null;
  if (device && (!/^[\w.-]+$/.test(device) || ['__proto__', 'prototype', 'constructor'].includes(device))) throw new HttpError(400, 'invalid_request', 'device id must be letters, digits, dot, dash or underscore');
  if (b.ownerKey !== undefined) {
    if (!env.OWNER_KEY_HASH) throw new HttpError(503, 'not_configured', 'OWNER_KEY_HASH is not set');
    // Per device (cleared on success), per network and one owner-wide key
    // that a success never clears: a new device id buys no fresh attempts.
    const ip = clientIp(req), keys = [`owner:dev:${device || 'nodevice'}`, `owner:store:all`, ...(ip ? [`owner:ip:${ip}`] : [])];
    await registry(env, 'POST', '/lockout/check', { keys });
    if (!(await verifySecret(String(b.ownerKey).trim(), env.OWNER_KEY_HASH))) {
      await registry(env, 'POST', '/lockout/fail', { keys });
      throw new HttpError(403, 'unauthorised', 'wrong owner key');
    }
    await registry(env, 'POST', '/lockout/clear', { key: keys[0] });
    const claims = makeClaims({ store: null, roles: ['owner'], caps: [], device, owner: true, ttl: ttl(env) });
    const { refresh } = await registry(env, 'POST', '/refresh/issue', { store: null, device, roles: ['owner'], owner: true });
    return json({ token: await signToken(claims, env.TOKEN_SECRET), refresh, expires: claims.exp, owner: true });
  }
  const res = await registry(env, 'POST', '/signin', { store: String(b.store || ''), pin: b.pin, device, ip: clientIp(req) });
  const claims = makeClaims({ store: res.store, roles: res.roles, caps: res.caps, device, epoch: res.epoch, ttl: ttl(env) });
  const { refresh } = await registry(env, 'POST', '/refresh/issue', { store: res.store, device, roles: res.roles, owner: false });
  return json({ token: await signToken(claims, env.TOKEN_SECRET), refresh, expires: claims.exp, store: res.store, name: res.name, roles: res.roles, caps: res.caps, status: res.status });
});

r.post('/v1/auth/unlock', async (req, env, ctx) => {
  const c = await requireClaims(req, env);
  if (!c.store) throw new HttpError(400, 'invalid_request', 'owner tokens do not unlock areas');
  const b = await readJson(req);
  const { role, epoch } = await registry(env, 'POST', '/unlock', { store: c.store, code: b.code, device: c.device, ip: clientIp(req), epoch: c.epoch || 0 });
  const roles = c.roles.includes(role) ? c.roles : [...c.roles, role];
  const { refresh, roleExpires } = await registry(env, 'POST', '/refresh/issue', { store: c.store, device: c.device, roles, owner: false, elevated: Date.now() });
  const claims = makeClaims({ store: c.store, roles, caps: c.caps, device: c.device, epoch, ttl: roleTtl(env, roleExpires) });
  return json({ token: await signToken(claims, env.TOKEN_SECRET), refresh, expires: claims.exp, roles });
});

r.post('/v1/auth/refresh', async (req, env) => {
  const b = await readJson(req);
  const res = await registry(env, 'POST', '/refresh/use', { refresh: b.refresh });
  const claims = makeClaims({ store: res.store, roles: res.roles, caps: res.caps, device: res.device, owner: res.owner, epoch: res.epoch, ttl: roleTtl(env, res.roleExpires) });
  return json({ token: await signToken(claims, env.TOKEN_SECRET), refresh: res.refresh, expires: claims.exp, roles: res.roles, caps: res.caps, owner: res.owner });
});

// Sign-out: the refresh token is deleted on the worker, so a lost or shared
// device's session ends now. Holding the refresh token is the authority.
r.post('/v1/auth/signout', async (req, env) => {
  const b = await readJson(req);
  if (b.refresh) await registry(env, 'POST', '/refresh/revoke', { refresh: String(b.refresh) });
  return json({ ok: true });
});

// ── registry (public) ─────────────────────────────────────────────────────
r.get('/v1/stores', async (_req, env) => json(await registry(env, 'GET', '/stores')));

// ── store traffic ─────────────────────────────────────────────────────────
r.get('/v1/store/:no/snapshot', (req, env, _ctx, p) => storeCall(req, env, p.no, '/snapshot', new URL(req.url).search));
r.get('/v1/store/:no/changes', (req, env, _ctx, p) => storeCall(req, env, p.no, '/changes', new URL(req.url).search));
r.post('/v1/store/:no/events', (req, env, _ctx, p) => storeCall(req, env, p.no, '/events'));
r.get('/v1/store/:no/ws', (req, env, _ctx, p) => storeCall(req, env, p.no, '/ws'));

// ── admin (owner) ─────────────────────────────────────────────────────────
r.get('/v1/admin/stores', async (req, env) => { await requireOwner(req, env); return json(await registry(env, 'GET', '/stores/_all')); });
r.post('/v1/admin/stores', async (req, env) => { await requireOwner(req, env); return json(await registry(env, 'POST', '/stores', await readJson(req)), 201); });
r.get('/v1/admin/stores/:no', async (req, env, _c, p) => { await requireOwner(req, env); return json(await registry(env, 'GET', `/stores/${p.no}`)); });
r.patch('/v1/admin/stores/:no', async (req, env, _c, p) => {
  const c = await requireOwner(req, env);
  const rec = await registry(env, 'PATCH', `/stores/${p.no}`, await readJson(req));
  // The store object holds the epoch it enforces; tell it (it also closes
  // the sockets of devices that were signed out).
  const res = await forward(new Request('https://store/epoch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epoch: rec.epoch || 0 }) }), env, rec.no, '/epoch', '', { ...c, store: rec.no, caps: [], roles: ['manager'] });
  if (!res.ok) console.error('epoch push failed', rec.no, res.status);
  return json(rec);
});
r.get('/v1/admin/actions', async (req, env) => { await requireOwner(req, env); return json(await registry(env, 'GET', '/actions')); });
r.get('/v1/admin/stores/:no/devices', (req, env, _c, p) => ownerStoreCall(req, env, p.no, '/devices'));
r.get('/v1/admin/stores/:no/snapshot', (req, env, _c, p) => ownerStoreCall(req, env, p.no, '/snapshot', new URL(req.url).search));
r.get('/v1/admin/stores/:no/tail', (req, env, _c, p) => ownerStoreCall(req, env, p.no, '/tail', new URL(req.url).search));
r.post('/v1/admin/actas/:no', async (req, env, _c, p) => {
  const c = await requireOwner(req, env);
  const rec = await registry(env, 'GET', `/stores/${p.no}`);
  const caps = Object.entries(rec.entitlements).filter(([, on]) => on).map(([a]) => a);
  const claims = makeClaims({ store: rec.no, roles: ['manager'], caps, device: c.device, owner: true, actor: 'owner', ttl: Math.min(ttl(env), 3600) });
  return json({ token: await signToken(claims, env.TOKEN_SECRET), expires: claims.exp, store: rec.no, caps });
});

// ── maps ──────────────────────────────────────────────────────────────────
r.get('/v1/store/:no/map', (req, env, _c, p) => anyStoreCall(req, env, p.no, '/map'));
r.get('/v1/store/:no/map/:version', (req, env, _c, p) => anyStoreCall(req, env, p.no, `/map/${p.version}`));
r.post('/v1/store/:no/map', async (req, env, _c, p) => {
  const res = await ownerStoreCall(req, env, p.no, '/map');
  if (res.ok) { const { version } = await res.clone().json(); await registry(env, 'PATCH', `/stores/${p.no}`, { map_version: version }); }
  return res;
});

// ── catalogue (public) ────────────────────────────────────────────────────
r.get('/v1/catalogue', async (req, env, ctx) => {
  const url = new URL(req.url);
  const codes = parseCodes(url.searchParams.get('kc'));
  const items = await lookup(env, ctx, codes, { details: url.searchParams.get('fields') !== 'link' });
  return json({ items }, 200, { 'Cache-Control': 'public, max-age=300' });
});

// One-digit near-misses of a keycode (a mistyped or misread code): public,
// like the catalogue, and cached briefly at the edge.
r.get('/v1/catalogue/nearmiss', async (req, env) => {
  const stub = catalogueStub(env); if (!stub) throw new HttpError(503, 'not_configured', 'the catalogue object is not bound');
  const res = await stub.fetch('https://catalogue/nearmiss' + new URL(req.url).search);
  return json(await res.json(), res.status, res.ok ? { 'Cache-Control': 'public, max-age=3600' } : {});
});
// The owner's view of the catalogue build, and "rebuild now".
r.get('/v1/admin/catalogue', async (req, env) => {
  await requireOwner(req, env);
  const stub = catalogueStub(env); if (!stub) throw new HttpError(503, 'not_configured', 'the catalogue object is not bound');
  const status = await (await stub.fetch('https://catalogue/status')).json();
  return json({ ...status, details: { browserRendering: !!(env.CF_ACCOUNT_ID && env.BROWSER_TOKEN), legacy: !!env.DETAILS_URL }, legacyLookup: !!env.LOOKUP_URL });
});
r.post('/v1/admin/catalogue/rebuild', async (req, env) => {
  await requireOwner(req, env);
  const stub = catalogueStub(env); if (!stub) throw new HttpError(503, 'not_configured', 'the catalogue object is not bound');
  const b = await readJson(req).catch(() => ({}));
  const out = await (await stub.fetch('https://catalogue/rebuild', { method: 'POST', body: JSON.stringify({ trigger: 'owner', force: b.force !== false }) })).json();
  if (out.started) await registry(env, 'POST', '/log', { type: 'catalogue.rebuild', store: null, detail: {} });
  return json(out, out.started ? 202 : 200);
});

// ── migration (owner) ─────────────────────────────────────────────────────
// Import: pull the store's K2B data into its log; dry:true only counts.
// Flip: set an area's state (legacy | migrating | live) and log it.
r.post('/v1/admin/stores/:no/import', async (req, env, _c, p) => {
  const c = await requireOwner(req, env);
  const rec = await registry(env, 'GET', `/stores/${p.no}`);
  const b = await readJson(req);
  const source = b.source || 'k2b';
  if (!['k2b', 'dv'].includes(source)) throw new HttpError(400, 'invalid_request', 'source must be k2b or dv');
  const caps = Object.entries(rec.entitlements).filter(([, on]) => on).map(([a]) => a);
  if (source === 'k2b' && !caps.includes('stockroom')) throw new HttpError(409, 'not_entitled', 'turn the Stockroom on for this store before importing');
  if (source === 'dv' && !caps.includes('backdock')) throw new HttpError(409, 'not_entitled', 'turn the Back dock on for this store before importing');
  const claims = { ...c, store: rec.no, caps, roles: ['manager'], actor: 'owner' };
  const apply = async (events) => {
    const res = await forward(new Request(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) }), env, rec.no, '/events', '', claims);
    const j = await res.json();
    if (!res.ok) throw new HttpError(res.status, j.code || 'store_error', j.message || 'store object refused the batch');
    return j.results;
  };
  const summary = source === 'dv' ? await importDV(env, { no: rec.no, url: b.url, dry: !!b.dry, apply }) : await importK2B(env, { no: rec.no, code: b.code, pin: b.pin, dry: !!b.dry, apply });
  if (!b.dry) await registry(env, 'POST', '/log', { type: 'store.import', store: rec.no, detail: { source, code: summary.code || summary.url, applied: summary.applied, duplicates: summary.duplicates, rejected: summary.rejected.length, warnings: summary.warnings.length, counts: summary.counts } });
  return json(summary);
});
r.post('/v1/admin/stores/:no/flip', async (req, env, _c, p) => {
  await requireOwner(req, env);
  const b = await readJson(req);
  if (!['floor', 'stockroom', 'backdock'].includes(b.area)) throw new HttpError(400, 'invalid_request', 'area must be floor, stockroom or backdock');
  if (!['legacy', 'migrating', 'live'].includes(b.state)) throw new HttpError(400, 'invalid_request', 'state must be legacy, migrating or live');
  const rec = await registry(env, 'PATCH', `/stores/${p.no}`, { areas: { [b.area]: b.state } });
  return json({ ok: true, no: rec.no, areas: rec.areas });
});

// ── records: a keycode's life, per-area history, CSV export ───────────────
r.get('/v1/store/:no/life/:keycode', (req, env, _c, p) => anyStoreCall(req, env, p.no, `/life/${p.keycode}`));
r.get('/v1/store/:no/history/:kind', (req, env, _c, p) => anyStoreCall(req, env, p.no, `/history/${p.kind}`, new URL(req.url).search));
r.get('/v1/store/:no/export/:kind', (req, env, _c, p) => anyStoreCall(req, env, p.no, `/export/${p.kind}`));

// ── manifests: the DC report published whole, read on demand ──────────────
r.post('/v1/store/:no/manifest', (req, env, _c, p) => anyStoreCall(req, env, p.no, '/manifest'));
r.get('/v1/store/:no/manifest/:manNo', (req, env, _c, p) => anyStoreCall(req, env, p.no, `/manifest/${p.manNo}`));
r.delete('/v1/store/:no/manifest/:manNo', (req, env, _c, p) => anyStoreCall(req, env, p.no, `/manifest/${p.manNo}`));
r.get('/v1/store/:no/profiles', (req, env, _c, p) => anyStoreCall(req, env, p.no, '/profiles'));

// ── plumbing ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflight();
    if (!env.TOKEN_SECRET) return fail(503, 'not_configured', 'TOKEN_SECRET is not set');
    const url = new URL(request.url);
    const m = r.match(request.method, url.pathname);
    if (!m) return fail(404, 'not_found', `no route for ${request.method} ${url.pathname}`);
    try {
      return await m.handler(request, env, ctx, m.params);
    } catch (e) {
      if (e instanceof HttpError) return e.toResponse();
      console.error('unhandled', e);
      return fail(500, 'internal', 'unexpected error');
    }
  },
};

// The caller's address as Cloudflare saw it; absent in local tests.
function clientIp(req) { return (req.headers.get('CF-Connecting-IP') || '').slice(0, 64) || null; }
function ttl(env) { return Number(env.TOKEN_TTL_SECONDS || 43200); }
// An access token carrying an unlocked role ends when the role does, so the
// next refresh (which drops the role) comes due on time.
function roleTtl(env, roleExpires) { return roleExpires ? Math.max(60, Math.min(ttl(env), Math.floor((roleExpires - Date.now()) / 1000))) : ttl(env); }

async function requireClaims(req, env) {
  // The token rides in the Authorization header. A browser WebSocket cannot
  // set headers, so the socket offers it as its second subprotocol
  // ("conduit, <token>"); ?token= is honoured on /ws only, for shells from
  // before that, and never elsewhere, so tokens stay out of URLs and logs.
  const h = req.headers.get('Authorization') || '';
  const url = new URL(req.url), proto = (req.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(x => x.trim());
  const token = h.startsWith('Bearer ') ? h.slice(7) : proto[0] === 'conduit' && proto[1] ? proto[1] : url.pathname.endsWith('/ws') ? url.searchParams.get('token') : null;
  const claims = await verifyToken(token, env.TOKEN_SECRET);
  if (!claims) throw new HttpError(401, 'unauthorised', 'token missing, invalid or expired');
  return claims;
}
async function requireOwner(req, env) {
  const c = await requireClaims(req, env);
  if (!c.owner || c.store) throw new HttpError(403, 'unauthorised', 'owner token required');
  return c;
}

// Internal call to the registry object.
async function registry(env, method, path, body) {
  const stub = env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
  const res = await stub.fetch('https://registry' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new HttpError(res.status, data.code || 'registry_error', data.message || 'registry error', data);
  return data;
}

// Forward a store request to its object with the verified claims attached.
async function storeCall(req, env, no, path, search = '') {
  const c = await requireClaims(req, env);
  if (c.store !== no) throw new HttpError(403, 'unauthorised', `token is for store ${c.store || '(owner)'}, not ${no}`);
  return forward(req, env, no, path, search, c);
}
// A store token for that store, or the owner: reads any device may make.
async function anyStoreCall(req, env, no, path, search = '') {
  const c = await requireClaims(req, env);
  if (c.owner && !c.store) return ownerStoreCall(req, env, no, path, search);
  return storeCall(req, env, no, path, search);
}
async function ownerStoreCall(req, env, no, path, search = '') {
  const c = await requireOwner(req, env);
  const rec = await registry(env, 'GET', `/stores/${no}`);
  const caps = Object.entries(rec.entitlements).filter(([, on]) => on).map(([a]) => a);
  return forward(req, env, no, path, search, { ...c, store: no, caps, roles: ['manager'] });
}
function forward(req, env, no, path, search, claims) {
  const stub = env.STORE.get(env.STORE.idFromName(String(no)));
  const headers = new Headers(req.headers);
  headers.set('X-Conduit-Claims', JSON.stringify(claims));
  headers.delete('Authorization');
  return stub.fetch(new Request('https://store' + path + search, { method: req.method, headers, body: req.method === 'GET' ? undefined : req.body }));
}
