// Contract tests: the worker running in workerd via Miniflare, with real
// Durable Objects on SQLite. This is the "done when" of build step 2:
// a test device signs in, sends an event, and a second device sees it.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { hashSecret } from '../../worker/auth.js';
import { dvAnswer, DV_TRUCK } from '../fixtures/dv.js';
import { ulid } from '../../shared/ulid.js';

const OWNER_KEY = 'owner-key-for-tests-only';
let sitemapReads = 0;
let mf, ownerToken;
const upstreamCalls = { lookup: 0, details: 0 };
// A stand-in for the legacy K2B worker: one store (BUS247, PIN 2468) with
// two history records, a live board of two bays, a requested bay and one
// negative-SOH item. Shapes follow k2b-coolwisp/cloudflare-worker.js.
const T = Date.parse('2026-09-18T01:00:00Z');
function legacy(u, req) {
  const store = u.searchParams.get('store'), pin = req.headers.get('X-K2B-Pin');
  if (store !== 'BUS247') return Response.json({ found: false, error: 'Unknown store code' }, { status: 404 });
  if (u.searchParams.get('storeop') === 'info') return Response.json({ found: true, code: 'BUS247', name: 'Busselton', storeNumber: '1241' });
  if (pin !== '2468') return Response.json({ error: 'Wrong PIN' }, { status: 403 });
  const sub = u.searchParams.get('sub');
  if (sub === 'history') return Response.json({ items: [
    { location: '7012', date: '2026-09-17', submittedAt: T - 86400000, readyAt: T - 86400000 + 3600000, submittedDoneAt: T - 86400000 + 7200000, metrics: { expected: 11, scanned: 10, match: 10, accuracy: 91, incorrect: 0 }, codes: ['43166022', '43199310', 'bad'] },
    { location: '7020', date: '2026-09-17', requestedOnly: true, codes: [] },
  ], total: 2, offset: 0, hasMore: false });
  if (sub === 'list') return Response.json({ today: '2026-09-18', requested: ['7037'], items: [{ location: '7014', date: '2026-09-18', status: 'pending' }, { location: '7016', date: '2026-09-18', status: 'submitted' }] });
  if (sub === 'get') { const loc = u.searchParams.get('location');
    if (loc === '7014') return Response.json({ found: true, submission: { location: '7014', date: '2026-09-18', submittedAt: T, updatedAt: T + 60000, status: 'pending', codes: [{ code: '42345501', scanned: true }, { code: '43006311', scanned: false }], incorrectCodes: ['43006311'] } });
    if (loc === '7016') return Response.json({ found: true, submission: { location: '7016', date: '2026-09-18', submittedAt: T, updatedAt: T + 120000, status: 'submitted', submittedDoneAt: T + 180000, metrics: { expected: 2, scanned: 2, match: 2, accuracy: 100, incorrect: 0 }, codes: [{ code: '42977636', scanned: true }, { code: '43307685', scanned: true }] } });
    return Response.json({ found: false }); }
  if (sub === 'negsohlist') return Response.json({ date: '2026-09-18', items: [{ keycode: '43302210', qty: -6, name: 'Paper plates 20 pk', location: '7014', confirmed: true, addedAt: T + 240000 }] });
  return Response.json({ error: 'unknown sub' }, { status: 400 });
}

before(async () => {
  mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    modulesRoot: new URL('../../', import.meta.url).pathname,
    scriptPath: new URL('../../worker/index.js', import.meta.url).pathname,
    compatibilityDate: '2026-08-06',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: {
      STORE: { className: 'StoreObject', useSQLite: true },
      REGISTRY: { className: 'RegistryObject', useSQLite: true },
      CATALOGUE: { className: 'CatalogueObject', useSQLite: true },
    },
    r2Buckets: ['PHOTOS'],
    // Catalogue upstreams are stubbed: the lookup worker answers ?codes=,
    // the details worker answers the POST, and one code is unknown.
    outboundService(req) {
      const u = new URL(req.url);
      // Stand-in Kmart sitemaps: an index naming two product files.
      if (u.hostname === 'sitemap.test') {
        const files = { '/sitemap/au/product-sitemap.xml': '<sitemapindex><sitemap><loc>https://sitemap.test/sitemap/au/product-sitemap-a.xml</loc></sitemap><sitemap><loc>https://sitemap.test/sitemap/au/product-sitemap-b.xml</loc></sitemap></sitemapindex>',
          '/sitemap/au/product-sitemap-a.xml': '<urlset><url><loc>https://www.kmart.com.au/product/12-pk-diecast-vehicles-42977636/</loc></url><url><loc>https://www.kmart.com.au/product/paper-plates-20-pk-43302210/</loc></url></urlset>',
          '/sitemap/au/product-sitemap-b.xml': '<urlset><url><loc>https://www.kmart.com.au/product/memory-foam-bath-mat-110012345/</loc></url></urlset>' };
        sitemapReads += 1;
        return files[u.pathname] ? new Response(files[u.pathname], { headers: { 'Content-Type': 'application/xml' } }) : new Response('not found', { status: 404 });
      }
      if (u.hostname === 'lookup.test') {
        const out = {}; for (const kc of (u.searchParams.get('codes') || '').split(',')) if (kc === '42977636') out[kc] = { found: true, url: 'https://www.kmart.com.au/product/12-pk-diecast-vehicles-42977636/', name: '12 pk diecast vehicles' }; else out[kc] = { found: false };
        upstreamCalls.lookup += 1; return Response.json(out);
      }
      if (u.hostname === 'details.test') { upstreamCalls.details += 1; return req.json().then(b => Response.json(Object.fromEntries(b.items.map(i => [i.kc, { found: true, price: 12, was: 15, img: 'https://img.test/42977636.jpg', clr: true }])))); }
      if (u.hostname === 'legacy.test') return new Response('legacy must go through the LEGACY binding', { status: 500 });
      if (u.hostname === 'dv.test') { if (u.pathname !== '/api/state') return new Response('<html>Not found</html>', { status: 404 }); const a = dvAnswer(u); return a.httpStatus ? Response.json(a.body, { status: a.httpStatus }) : Response.json(a); }
      if (u.hostname === 'notdv.test') return Response.json({ hello: 'world' });
      return new Response('unexpected upstream ' + req.url, { status: 502 });
    },
    // The legacy worker is reached through a service binding in production;
    // the lookup and details workers fall back to fetch (outboundService).
    serviceBindings: { LEGACY: (req) => legacy(new URL(req.url), req) },
    bindings: {
      LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test', LEGACY_URL: 'https://legacy.test', SITEMAP_BASE: 'https://sitemap.test/sitemap/au/product-sitemap',
      TOKEN_SECRET: 'test-token-secret',
      OWNER_KEY_HASH: await hashSecret(OWNER_KEY, 1000),
      TOKEN_TTL_SECONDS: '3600', REFRESH_TTL_SECONDS: '86400', LOCKOUT_ATTEMPTS: '3', LOCKOUT_STORE_ATTEMPTS: '8', LOCKOUT_IP_ATTEMPTS: '40', LOCKOUT_SECONDS: '60', ROLE_TTL_SECONDS: '2', PIN_MIN_DIGITS: '4', ENVIRONMENT: 'test',
    },
  });
  await mf.ready;
});
after(async () => { await mf?.dispose(); });

const api = async (method, path, body, token) => {
  const res = await mf.dispatchFetch('http://conduit.test' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const at = () => new Date().toISOString().replace('Z', '+00:00');
const event = (type, entity, payload, area) => ({ id: ulid(), store: '1241', area, type, entity, payload, at: at(), v: 1 });

test('health answers, every build-order route is built and wants a token, an unknown route is named', async () => {
  assert.equal((await api('GET', '/v1/health')).body.ok, true);
  for (const [m, p] of [['POST', '/v1/store/1241/manifest'], ['GET', '/v1/store/1241/manifest/7031482'], ['GET', '/v1/store/1241/life/42977636'], ['GET', '/v1/store/1241/history/backfill'], ['GET', '/v1/store/1241/export/cages']]) {
    const r = await api(m, p, m === 'POST' ? {} : undefined); assert.equal(r.status, 401, `${m} ${p}`); assert.equal(r.body.code, 'unauthorised');
  }
  const r = await api('GET', '/v1/store/1241/nothing-here');
  assert.equal(r.status, 404); assert.equal(r.body.code, 'not_found');
});

test('catalogue: links and details from the upstreams, cached per keycode, misses answered', async () => {
  assert.equal((await api('GET', '/v1/catalogue?kc=12')).status, 400);
  const r = await api('GET', '/v1/catalogue?kc=42977636,99999999');
  assert.equal(r.status, 200);
  const it = r.body.items['42977636'];
  assert.equal(it.name, '12 pk diecast vehicles'); assert.match(it.url, /42977636/); assert.equal(it.price, 12); assert.equal(it.was, 15); assert.equal(it.clr, true); assert.ok(it.at > 0);
  assert.equal(r.body.items['99999999'], null);
  const calls = { ...upstreamCalls };
  const again = await api('GET', '/v1/catalogue?kc=42977636,99999999');
  assert.equal(again.body.items['42977636'].name, '12 pk diecast vehicles');
  assert.deepEqual(upstreamCalls, calls, 'second lookup is served from the edge cache');
});

test('owner signs in with the owner key and registers a store', async () => {
  const bad = await api('POST', '/v1/auth/signin', { ownerKey: 'wrong', device: 'dev-laptop' });
  assert.equal(bad.status, 403);
  const ok = await api('POST', '/v1/auth/signin', { ownerKey: OWNER_KEY, device: 'dev-laptop' });
  assert.equal(ok.status, 200); assert.equal(ok.body.owner, true);
  ownerToken = ok.body.token;

  const reg = await api('POST', '/v1/admin/stores', {
    no: '1241', name: 'Busselton', region: 'WA South', pin: '2468',
    codes: { stockroom: 'SR-CODE', dock: 'DK-CODE', manager: 'MGR-CODE' },
    entitlements: { floor: true, stockroom: true, backdock: false },
  }, ownerToken);
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  assert.deepEqual(reg.body.entitlements, { floor: true, stockroom: true, backdock: false });
  assert.equal((await api('POST', '/v1/admin/stores', { no: '1241', name: 'x', pin: '1111' }, ownerToken)).status, 409);

  const list = await api('GET', '/v1/stores');
  assert.deepEqual(list.body.stores, [{ no: '1241', name: 'Busselton', region: 'WA South', status: 'registered' }]);
  const noauth = await api('POST', '/v1/admin/stores', { no: '1', name: 'x', pin: '1111' });
  assert.equal(noauth.status, 401);
});

test('store sign-in: wrong PIN, lockout, then in; unlock adds a role', async () => {
  assert.equal((await api('POST', '/v1/auth/signin', { store: '9999', pin: '0000', device: 'p1' })).status, 404);
  for (let i = 0; i < 3; i++) assert.equal((await api('POST', '/v1/auth/signin', { store: '1241', pin: '0000', device: 'p1' })).status, 403);
  const locked = await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'p1' });
  assert.equal(locked.status, 429); assert.equal(locked.body.code, 'locked_out');

  const ok = await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'p2' });
  assert.equal(ok.status, 200); assert.deepEqual(ok.body.roles, ['floor']); assert.deepEqual(ok.body.caps, ['floor', 'stockroom']);

  const wrong = await api('POST', '/v1/auth/unlock', { code: 'nope' }, ok.body.token);
  assert.equal(wrong.status, 403);
  const sr = await api('POST', '/v1/auth/unlock', { code: 'sr code' }, ok.body.token);   // spelling is forgiven
  assert.equal(sr.status, 200); assert.deepEqual(sr.body.roles, ['floor', 'stockroom']);

  const ref = await api('POST', '/v1/auth/refresh', { refresh: sr.body.refresh });
  assert.equal(ref.status, 200); assert.deepEqual(ref.body.roles, ['floor', 'stockroom']);
  assert.equal((await api('POST', '/v1/auth/refresh', { refresh: sr.body.refresh })).status, 401, 'a used refresh token is dead');
});

test('events: entitlement, role, validation, duplicate, conflict rule, and a second device sees it', async () => {
  const p1 = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'phone-1' })).body;
  const p2 = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'phone-2' })).body;
  const sr = (await api('POST', '/v1/auth/unlock', { code: 'SR-CODE' }, p1.token)).body;
  const p2floor = p2.token; p2.token = (await api('POST', '/v1/auth/unlock', { code: 'SR-CODE' }, p2.token)).body.token;

  // phone-2 opens its socket first and says hello.
  const wsRes = await mf.dispatchFetch('http://conduit.test/v1/store/1241/ws', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `conduit, ${p2.token}` } });
  assert.equal(wsRes.headers.get('Sec-WebSocket-Protocol'), 'conduit');
  assert.equal((await mf.dispatchFetch('http://conduit.test/v1/store/1241/snapshot?token=' + p2.token)).status, 401, '?token= is for the socket only');
  assert.equal(wsRes.status, 101);
  const ws = wsRes.webSocket; ws.accept();
  const inbox = []; const waiters = [];
  ws.addEventListener('message', m => { inbox.push(JSON.parse(m.data)); for (const w of [...waiters]) w(); });
  // Resolves with the first frame matching pred, keeping the waiter alive across frames that do not match.
  const next = (pred) => new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timeout waiting for frame')); }, 3000);
    const w = () => { const i = inbox.findIndex(pred); if (i < 0) return; clearTimeout(t); waiters.splice(waiters.indexOf(w), 1); resolve(inbox.splice(i, 1)[0]); };
    waiters.push(w); w();
  });
  ws.send(JSON.stringify({ t: 'hello', since: 0 }));
  const snap = await next(d => d.t === 'snapshot');
  assert.equal(snap.seq, 0); assert.deepEqual(snap.state.cages, {});

  // Not entitled to backdock, floor role cannot write stockroom, bad payload.
  const r1 = await api('POST', '/v1/store/1241/events', { events: [
    event('truck.create', { truck: '2026-09-07-T1' }, {}, 'backdock'),
    event('cage.create', { cage: 'BSN1240417' }, { ring: 'overstock' }, 'stockroom'),
    event('refresh.mark', { segment: 'K12S1' }, {}, 'floor'),
  ] }, p1.token);
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body.results.map(x => x.code), ['not_entitled', 'unauthorised', 'invalid_event']);

  // With the stockroom role the cage is created; phone-2 sees it; a resend is a duplicate ack.
  const create = event('cage.create', { cage: 'BSN1240417' }, { ring: 'overstock' }, 'stockroom');
  const r2 = await api('POST', '/v1/store/1241/events', { events: [create] }, sr.token);
  assert.equal(r2.body.results[0].ok, true); assert.equal(r2.body.results[0].seq, 1);
  const seen = await next(d => d.t === 'event');
  assert.equal(seen.event.type, 'cage.create'); assert.equal(seen.event.actor.device, 'phone-1'); assert.equal(seen.event.actor.role, 'stockroom');
  const r3 = await api('POST', '/v1/store/1241/events', { events: [create] }, sr.token);
  assert.deepEqual(r3.body.results[0], { id: create.id, ok: true, seq: 1, duplicate: true });

  // Reducer rule surfaces as a rejection with a code.
  const r4 = await api('POST', '/v1/store/1241/events', { events: [event('cage.create', { cage: 'BSN1240417' }, { ring: 'new-lines' }, 'stockroom')] }, sr.token);
  assert.equal(r4.body.results[0].code, 'cage_exists');

  // Snapshot and changes agree with the log; the socket can submit too.
  const snap2 = await api('GET', '/v1/store/1241/snapshot', undefined, p2.token);
  assert.equal(snap2.body.seq, 1); assert.equal(snap2.body.state.cages.BSN1240417.ring, 'overstock');
  ws.send(JSON.stringify({ t: 'submit', events: [event('refresh.mark', { segment: 'K12S1', week: '2026-W37' }, {}, 'floor')] }));
  const ack = await next(d => d.t === 'ack');
  assert.equal(ack.results[0].ok, true); assert.equal(ack.results[0].seq, 2);
  await next(d => d.t === 'event' && d.event.type === 'refresh.mark');
  const floorSnap = await api('GET', '/v1/store/1241/snapshot', undefined, p2floor);
  assert.equal(floorSnap.body.state.cages, undefined, 'the store PIN alone does not read the Stockroom');
  assert.deepEqual((await api('GET', '/v1/store/1241/changes?since=0', undefined, p2floor)).body.events.map(e => e.type), ['refresh.mark'], 'nor its events');
  const ch = await api('GET', '/v1/store/1241/changes?since=1', undefined, p1.token);
  assert.equal(ch.body.events.length, 1); assert.equal(ch.body.events[0].type, 'refresh.mark');

  // A token for another store is refused at the door.
  assert.equal((await api('GET', '/v1/store/1187/snapshot', undefined, p1.token)).status, 403);
  ws.close();
});

test('devices cannot send the events only the worker writes (map, manifest and SOH indexes, retention)', async () => {
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'mgr-phone' })).body.token;
  const mgr = (await api('POST', '/v1/auth/unlock', { code: 'MGR-CODE' }, dev)).body.token;
  const at = new Date().toISOString();
  const evs = [['map.publish', 'store', { version: 'ghost' }], ['manifest.remove', 'backdock', { manNo: 'M1' }], ['soh.publish', 'stockroom', { date: '2099-01-01' }], ['store.retain', 'store', {}]]
    .map(([type, area, entity], i) => ({ id: '01J9WORKERONLY' + String(i).padStart(13, '0'), store: '1241', area, type, entity, payload: {}, at, v: 1 }));
  const r = await api('POST', '/v1/store/1241/events', { events: evs }, mgr);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results.map(x => x.code), ['worker_only', 'worker_only', 'worker_only', 'worker_only']);
});

test('device presence: POST /hb records the device (the polling fallback for the socket hb frame)', async () => {
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'poll-phone' })).body.token;
  const hb = await api('POST', '/v1/store/1241/hb', { app: 'floor', online: true, outbox: 3, area: 'floor', lastError: 'x'.repeat(500) }, dev);
  assert.equal(hb.status, 200); assert.equal(hb.body.ok, true);
  const devs = await api('GET', '/v1/admin/stores/1241/devices', undefined, ownerToken);
  assert.equal(devs.status, 200);
  const rec = devs.body.devices['poll-phone'];
  assert.ok(rec, 'the heartbeat registered the device');
  assert.equal(rec.app, 'floor'); assert.equal(rec.online, true); assert.equal(rec.outbox, 3); assert.ok(rec.last);
  assert.equal(rec.lastError.length, 200, 'fields are capped as the socket frame caps them');
  // The token is scoped to its store: it cannot heartbeat another store.
  assert.equal((await api('POST', '/v1/store/1187/hb', {}, dev)).status, 403);
});

test('owner diagnostics and act-as', async () => {
  const tail = await api('GET', '/v1/admin/stores/1241/tail', undefined, ownerToken);
  assert.equal(tail.status, 200); assert.equal(tail.body.events[0].type, 'refresh.mark');
  const actions = await api('GET', '/v1/admin/actions', undefined, ownerToken);
  assert.equal(actions.body.actions[0].type, 'store.register');

  const actas = await api('POST', '/v1/admin/actas/1241', {}, ownerToken);
  assert.equal(actas.status, 200);
  const r = await api('POST', '/v1/store/1241/events', { events: [event('cage.park', { cage: 'BSN1240417' }, { location: 'Aisle 2, near 7023' }, 'stockroom')] }, actas.body.token);
  assert.equal(r.body.results[0].ok, true);
  const tail2 = await api('GET', '/v1/admin/stores/1241/tail?limit=1', undefined, ownerToken);
  assert.deepEqual(tail2.body.events[0].actor, { role: 'owner', device: 'dev-laptop', owner: true });

  const flip = await api('PATCH', '/v1/admin/stores/1241', { entitlements: { backdock: true }, status: 'migrating', areas: { stockroom: 'live' } }, ownerToken);
  assert.equal(flip.body.entitlements.backdock, true); assert.equal(flip.body.areas.stockroom, 'live'); assert.equal(flip.body.status, 'migrating');

  // The console's list: full records, owner only; and a read-only snapshot of any store.
  const all = await api('GET', '/v1/admin/stores', undefined, ownerToken);
  assert.equal(all.status, 200); assert.equal(all.body.stores[0].no, '1241'); assert.deepEqual(all.body.stores[0].codes.sort(), ['dock', 'manager', 'stockroom']); assert.equal(all.body.stores[0].status, 'migrating');
  assert.equal((await api('GET', '/v1/admin/stores', undefined, actas.body.token)).status, 403);
  const snap = await api('GET', '/v1/admin/stores/1241/snapshot?areas=stockroom,store', undefined, ownerToken);
  assert.equal(snap.status, 200); assert.equal(snap.body.state.cages.BSN1240417.location, 'AISLE 2, NEAR 7023'); assert.ok('devices' in snap.body.state);
});

test('maps: owner publishes, devices read by version or latest, the log and registry record it', async () => {
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'phone-map' })).body.token;
  assert.equal((await api('GET', '/v1/store/1241/map', undefined, dev)).status, 404);
  const svg = '<svg class="map real" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g class="shelf-group" data-shelf="A1" data-dept="h1"><rect class="shelf" x="1" y="1" width="10" height="10"/></g></svg>';
  assert.equal((await api('POST', '/v1/store/1241/map', { version: '4.3', floors: [{ id: 'ground', svg }] }, dev)).status, 403, 'a store token cannot publish');
  assert.equal((await api('POST', '/v1/store/1241/map', { version: '4.3', floors: [{ id: 'ground', svg, paths: { nodes: [{ id: 'a', x: 'no', y: 0 }, { id: 'b', x: 1, y: 1 }], edges: [{ a: 'a', b: 'b' }] } }] }, ownerToken)).status, 400, 'path nodes need numeric coordinates');
  const paths = { nodes: [{ id: 'pn1', x: 0, y: 0 }, { id: 'pn2', x: 100, y: 0, type: 'stairs' }], edges: [{ a: 'pn1', b: 'pn2' }, { a: 'pn2' }] };
  const pub = await api('POST', '/v1/store/1241/map', { version: '4.3', name: 'Busselton', departments: [{ id: 'h1', name: 'H1 Kitchen', color: '#FF8C00' }], floors: [{ id: 'ground', name: 'Ground', type: 'foh', svg, paths }], storeInfo: { assemblyNotes: 'Car park, row C', assemblyLat: -33.6448, assemblyLng: '115.3485', directionsApple: 'javascript:alert(1)', addressLines: ['', ''] }, metresPerUnit: 0.05 }, ownerToken);
  assert.equal(pub.status, 201); assert.equal(pub.body.floors[0].shelves, 1); assert.deepEqual(pub.body.floors[0].paths, { nodes: 2, edges: 1 });
  assert.equal((await api('POST', '/v1/store/1241/map', { version: '4.3', floors: [{ id: 'ground', svg }] }, ownerToken)).status, 409);

  const info = await api('GET', '/v1/store/1241/map', undefined, dev);
  assert.equal(info.body.version, '4.3'); assert.equal(info.body.floors[0].id, 'ground'); assert.equal(info.body.by.owner, true);
  const doc = await api('GET', '/v1/store/1241/map/latest', undefined, dev);
  assert.equal(doc.body.version, '4.3'); assert.equal(doc.body.floors[0].svg, svg); assert.equal(doc.body.departments[0].id, 'h1');
  assert.deepEqual(doc.body.storeInfo, { assemblyNotes: 'Car park, row C', assemblyLat: -33.6448, assemblyLng: 115.3485 }, 'store info is allow-listed on the worker too');
  assert.equal(doc.body.metresPerUnit, 0.05); assert.equal(info.body.storeInfo.assemblyNotes, 'Car park, row C');
  assert.deepEqual(doc.body.floors[0].paths, { nodes: [{ id: 'pn1', x: 0, y: 0 }, { id: 'pn2', x: 100, y: 0, type: 'stairs' }], edges: [{ a: 'pn1', b: 'pn2' }] }, 'the document carries the walk-path network'); assert.deepEqual(info.body.floors[0].paths, { nodes: 2, edges: 1 });
  const res = await mf.dispatchFetch('http://conduit.test/v1/store/1241/map/4.3', { headers: { Authorization: `Bearer ${dev}`, 'If-None-Match': '"map-4.3"' } });
  assert.equal(res.status, 304);
  assert.equal((await api('GET', '/v1/store/1241/map/9.9', undefined, dev)).status, 404);

  const snap = await api('GET', '/v1/store/1241/snapshot?areas=store', undefined, dev);
  assert.equal(snap.body.state.map.version, '4.3');
  const tail = await api('GET', '/v1/admin/stores/1241/tail?limit=1', undefined, ownerToken);
  assert.equal(tail.body.events[0].type, 'map.publish'); assert.equal(tail.body.events[0].actor.owner, true);
  assert.equal((await api('GET', '/v1/admin/stores/1241', undefined, ownerToken)).body.mapVersion, '4.3');

  // Markup outside the map allow-list is stripped at publish, never stored.
  const hostile = svg.replace('</g>', '</g><foreignObject><div onmouseover="x()">hi</div></foreignObject><a href="javascript:x()"><rect width="1" height="1"/></a><use href="https://evil.test/x.svg#a"/>').replace('<rect class="shelf"', '<rect onclick="x()" class="shelf"');
  const pub2 = await api('POST', '/v1/store/1241/map', { version: '4.3-clean', floors: [{ id: 'ground', svg: hostile }] }, ownerToken);
  assert.equal(pub2.status, 201); assert.ok(pub2.body.stripped >= 4, `stripped ${pub2.body.stripped}`);
  const stored = (await api('GET', '/v1/store/1241/map/4.3-clean', undefined, dev)).body.floors[0].svg;
  assert.doesNotMatch(stored, /foreignObject|onclick|onmouseover|javascript:|evil\.test/); assert.match(stored, /data-shelf="A1"/);
});

test('K2B importer: dry run counts, the import lands as events, a second run is all duplicates, flip sets the area', async () => {
  const bad = await api('POST', '/v1/admin/stores/1241/import', { code: 'NOPE99', pin: '2468', dry: true }, ownerToken);
  assert.equal(bad.status, 404); assert.equal(bad.body.code, 'legacy_store'); assert.match(bad.body.message, /Unknown store code/);
  assert.equal((await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS0147', pin: '2468', dry: true }, ownerToken)).status, 400, 'K2B codes never hold 0, O, 1 or I');
  const wrongPin = await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS247', pin: '0000', dry: true }, ownerToken);
  assert.equal(wrongPin.status, 403); assert.equal(wrongPin.body.code, 'legacy_pin');

  const dry = await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS247', pin: '2468', dry: true }, ownerToken);
  assert.equal(dry.status, 200); assert.equal(dry.body.dry, true); assert.equal(dry.body.legacy.name, 'Busselton');
  assert.deepEqual(dry.body.counts, { history: 2, today: 2, requested: 1, negsoh: 1, events: 13 });
  assert.ok(dry.body.warnings.some(w => /7012:2026-09-17: 1 codes were not keycodes/.test(w)), dry.body.warnings.join('|'));
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'phone-imp' })).body.token;
  const reader = (await api('POST', '/v1/auth/unlock', { code: 'SR-CODE' }, dev)).body.token;
  const before = (await api('GET', '/v1/store/1241/snapshot?areas=stockroom', undefined, reader)).body;
  assert.equal(before.state.backfill.subs['7012:2026-09-17'], undefined, 'a dry run writes nothing');

  const run = await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS247', pin: '2468' }, ownerToken);
  assert.equal(run.status, 200); assert.equal(run.body.applied, 13); assert.equal(run.body.duplicates, 0); assert.deepEqual(run.body.rejected, []);
  const s = (await api('GET', '/v1/store/1241/snapshot?areas=stockroom', undefined, reader)).body.state;
  const h = s.backfill.subs['7012:2026-09-17'];
  assert.equal(h.status, 'submitted'); assert.deepEqual(h.metrics, { expected: 11, scanned: 10, match: 10, accuracy: 91, incorrect: 0 }); assert.deepEqual(Object.keys(h.codes).sort(), ['43166022', '43199310']);
  assert.deepEqual(s.backfill.requested['2026-09-17'], ['7020']); assert.deepEqual(s.backfill.requested['2026-09-18'], ['7037']);
  const t = s.backfill.subs['7014:2026-09-18'];
  assert.equal(t.status, 'pending'); assert.equal(t.codes['42345501'].scanned, true); assert.equal(t.codes['43006311'].scanned, false); assert.deepEqual(t.incorrect, ['43006311']);
  assert.equal(s.backfill.subs['7016:2026-09-18'].status, 'submitted'); assert.equal(s.backfill.subs['7016:2026-09-18'].metrics.accuracy, 100);
  assert.deepEqual(s.adjustments['2026-09-18']['43302210'], { qty: -6, name: 'Paper plates 20 pk', location: '7014', confirmed: true, addedAt: new Date(T + 240000).toISOString().replace(/\.\d{3}Z$/, '+00:00') });

  const again = await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS247', pin: '2468' }, ownerToken);
  assert.equal(again.body.applied, 0); assert.equal(again.body.duplicates, 13, 'the import is idempotent');
  const acts = (await api('GET', '/v1/admin/actions', undefined, ownerToken)).body.actions;
  assert.equal(acts[0].type, 'store.import'); assert.equal(acts[0].detail.applied, 0); assert.equal(acts[1].detail.applied, 13);

  const flip = await api('POST', '/v1/admin/stores/1241/flip', { area: 'stockroom', state: 'live' }, ownerToken);
  assert.equal(flip.status, 200); assert.equal(flip.body.areas.stockroom, 'live');
  assert.equal((await api('POST', '/v1/admin/stores/1241/flip', { area: 'stockroom', state: 'gone' }, ownerToken)).status, 400);
  // The rollover alarm may auto-submit the imported pending bay at any point;
  // look past it for the newest imported event.
  const tail = await api('GET', '/v1/admin/stores/1241/tail?limit=5', undefined, ownerToken);
  assert.equal(tail.body.events.find(e => !e.payload?.auto).actor.owner, true, 'imported events carry the owner as actor');
});

test('a keycode’s life, the history lists and the CSV export read the stockroom record', async () => {
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'phone-life' })).body.token;
  assert.equal((await api('GET', '/v1/store/1241/history/backfill', undefined, dev)).status, 403, 'the store PIN alone does not read the Stockroom');
  assert.equal((await api('GET', '/v1/store/1241/snapshot?areas=stockroom', undefined, dev)).body.state.cages, undefined);
  const reader = (await api('POST', '/v1/auth/unlock', { code: 'SR-CODE' }, dev)).body.token;
  const life = await api('GET', '/v1/store/1241/life/43166022', undefined, reader);
  assert.equal(life.status, 200);
  assert.deepEqual(life.body.visits.map(v => [v.bay, v.date, v.status, v.scanned]), [['7012', '2026-09-17', 'submitted', true]]);
  assert.equal(life.body.visits[0].accuracy, 91); assert.deepEqual(life.body.bays, ['7012']);
  const adj = await api('GET', '/v1/store/1241/life/43302210', undefined, reader);
  assert.equal(adj.body.adjustments[0].qty, -6); assert.equal(adj.body.name, 'Paper plates 20 pk'); assert.equal(adj.body.last, '2026-09-18');
  assert.deepEqual((await api('GET', '/v1/store/1241/life/99999999', undefined, reader)).body.visits, []);
  assert.equal((await api('GET', '/v1/store/1241/life/12', undefined, reader)).status, 404, 'a keycode is 6 to 13 digits');
  const owner = await api('GET', '/v1/store/1241/life/43166022', undefined, ownerToken);
  assert.equal(owner.status, 200, 'the owner reads any entitled store');

  // The end-of-day rollover (an alarm) auto-submits the pending bay; run it
  // now so it cannot land between the two page reads.
  await (await mf.getDurableObjectNamespace('STORE').then(ns => ns.get(ns.idFromName('1241')))).rollover();
  const h = await api('GET', '/v1/store/1241/history/backfill?limit=1', undefined, reader);
  assert.equal(h.status, 200); assert.equal(h.body.kind, 'backfill'); assert.ok(h.body.total >= 2); assert.equal(h.body.rows.length, 1); assert.ok(h.body.rows[0].bay); assert.equal(typeof h.body.rows[0].accuracy, 'number');
  const page2 = await api('GET', '/v1/store/1241/history/backfill?limit=1&offset=1', undefined, reader);
  assert.notEqual(page2.body.rows[0].bay + page2.body.rows[0].date, h.body.rows[0].bay + h.body.rows[0].date);
  assert.equal((await api('GET', '/v1/store/1241/history/adjustments', undefined, reader)).body.rows[0].keycode, '43302210');
  assert.equal((await api('GET', '/v1/store/1241/history/manifests', undefined, reader)).status, 400);

  const csv = await mf.dispatchFetch('http://conduit.test/v1/store/1241/export/backfill', { headers: { Authorization: `Bearer ${reader}` } });
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(csv.headers.get('content-disposition'), /1241-backfill\.csv/);
  const text = await csv.text();
  assert.equal(text.split('\n')[0], 'date,bay,status,readyAt,submittedAt,expected,scanned,match,accuracy,incorrect,codes,auto');
  assert.match(text, /2026-09-17,7012,submitted,/);
});

test('tools: the owner switches one off, every device sees it in the projection, and the worker refuses its changes and routes', async () => {
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'tools-desk' })).body.token;
  const sr = (await api('POST', '/v1/auth/unlock', { code: 'SR-CODE' }, dev)).body.token;
  const ev = type => ({ id: ulid(), store: '1241', area: 'stockroom', type, entity: { cage: 'TL1' }, payload: { ring: 'overstock' }, at: new Date().toISOString(), v: 1 });
  assert.equal((await api('PATCH', '/v1/admin/stores/1241', { tools: { nope: false } }, ownerToken)).status, 400, 'an unknown tool is refused');
  const off = await api('PATCH', '/v1/admin/stores/1241', { tools: { cages: false, intel: false } }, ownerToken);
  assert.equal(off.status, 200); assert.deepEqual(off.body.toolsOff.sort(), ['cages', 'intel']);
  assert.deepEqual((await api('GET', '/v1/store/1241/snapshot', undefined, sr)).body.state.tools.off, ['cages', 'intel']);
  assert.equal((await api('POST', '/v1/store/1241/events', { events: [ev('cage.create')] }, sr)).body.results[0].code, 'tool_off');
  assert.equal((await api('GET', '/v1/store/1241/soh', undefined, sr)).status, 403, 'a switched-off tool’s route is refused too');
  const self = { id: ulid(), store: '1241', area: 'store', type: 'store.tools.set', entity: {}, payload: { off: [] }, at: new Date().toISOString(), v: 1 };
  const mgr = (await api('POST', '/v1/auth/unlock', { code: 'MGR-CODE' }, dev)).body.token;
  assert.equal((await api('POST', '/v1/store/1241/events', { events: [self] }, mgr)).body.results[0].code, 'unauthorised', 'a store manager cannot switch tools back on');
  const on = await api('PATCH', '/v1/admin/stores/1241', { tools: { cages: true, intel: true } }, ownerToken);
  assert.deepEqual(on.body.toolsOff, []);
  assert.equal((await api('POST', '/v1/store/1241/events', { events: [ev('cage.create')] }, sr)).body.results[0].ok, true);
});

test('SOH snapshots: save one a day, list through the projection, read the history, verify a count, remove', async () => {
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'sr-desk' })).body.token;
  const sr = (await api('POST', '/v1/auth/unlock', { code: 'SR-CODE' }, dev)).body.token;
  const rows = [{ kc: '43307685', loc: '7001', soh: 12, price: 8, name: 'Kids tee' }, { kc: '42977636', loc: '7002', soh: 0 }];
  assert.equal((await api('POST', '/v1/store/1241/soh', { date: '2026-09-28', rows }, dev)).status, 403, 'the store PIN alone cannot save one');
  assert.equal((await api('POST', '/v1/store/1241/soh', { date: '28/09/2026', rows }, sr)).status, 400);
  assert.equal((await api('POST', '/v1/store/1241/soh', { date: '2026-09-28', rows: [{ kc: 'x', loc: '7001', soh: 1 }] }, sr)).status, 400);
  const a = await api('POST', '/v1/store/1241/soh', { date: '2026-09-28', rows }, sr);
  assert.equal(a.status, 201); assert.deepEqual([a.body.rows, a.body.locs, a.body.week], [2, 2, '2026-W40']);
  assert.equal((await api('POST', '/v1/store/1241/soh', { date: '2026-10-05', rows: rows.map(r => ({ ...r, soh: r.soh - 1 })) }, sr)).status, 201);
  assert.equal((await api('POST', '/v1/store/1241/soh', { date: '2026-10-05', rows }, sr)).status, 201, 'a re-save the same day replaces it');
  const snap = await api('GET', '/v1/store/1241/snapshot', undefined, sr);
  assert.deepEqual(Object.keys(snap.body.state.soh.snaps).sort(), ['2026-09-28', '2026-10-05']);
  assert.equal((await api('GET', '/v1/store/1241/soh', undefined, dev)).status, 403, 'reading them takes the stockroom code too');
  const got = await api('GET', '/v1/store/1241/soh?n=5', undefined, sr);
  assert.equal(got.status, 200); assert.deepEqual(got.body.snaps.map(x => x.date), ['2026-09-28', '2026-10-05'], 'oldest first');
  assert.deepEqual(got.body.snaps[1].rows[0], { kc: '43307685', loc: '7001', soh: 12, price: 8, name: 'Kids tee' });
  const ev = (type, entity, payload) => ({ id: ulid(), store: '1241', area: 'stockroom', type, entity, payload, at: new Date().toISOString(), v: 1 });
  const v = await api('POST', '/v1/store/1241/events', { events: [ev('soh.verify', { date: '2026-10-05', keycode: '43307685' }, { loc: '7001' }), ev('soh.verify', { date: '2026-01-01', keycode: '43307685' }, { loc: '7001' })] }, sr);
  assert.deepEqual(v.body.results.map(x => x.ok || x.code), [true, 'not_found']);
  assert.equal((await api('DELETE', '/v1/store/1241/soh/2026-09-28', undefined, dev)).status, 403);
  assert.equal((await api('DELETE', '/v1/store/1241/soh/2026-09-28', undefined, sr)).status, 200);
  assert.equal((await api('DELETE', '/v1/store/1241/soh/2026-09-28', undefined, sr)).status, 404);
  assert.deepEqual((await api('GET', '/v1/store/1241/soh', undefined, sr)).body.snaps.map(x => x.date), ['2026-10-05']);
});

test('manifests: publish the report, list it through the projection, read it, attach it to a truck, scan against it, remove it', async () => {
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'dock-1' })).body.token;
  const unlocked = (await api('POST', '/v1/auth/unlock', { code: 'DK-CODE' }, dev)).body.token || dev;
  assert.equal((await api('GET', '/v1/store/1241/profiles', undefined, dev)).status, 403, 'the store PIN alone does not read the Back dock');
  const doc = { v: 1, kind: 'report', manNo: '7031482', storeNo: '1241', despatch: '05/09/2026', dcNo: '4101533', filename: 'Manifest Report 06-09.xls', consols: [
    { id: '601804381', cons: '093008012601804381', cartons: 3, dept: '024', mix: [['024', 2, 12]], items: [{ k: '43307685', q: 12, dept: '024', c: 2, cc: ['000000000000000001'] }, { k: '42977636', q: 2, dept: '070', c: 1 }] },
    { id: '601804382', cons: '093008012601804382', cartons: 3, dept: '084', mix: [], items: [{ k: '43302210', q: 3, dept: '084' }] },
  ] };
  assert.equal((await api('POST', '/v1/store/1241/manifest', doc, dev)).status, 403, 'the dock code is needed to publish');
  const pub = await api('POST', '/v1/store/1241/manifest', doc, unlocked);
  assert.equal(pub.status, 201, JSON.stringify(pub.body)); assert.equal(pub.body.consols, 2); assert.equal(pub.body.totalCartons, 6); assert.equal(pub.body.keycodes, 3);
  assert.equal((await api('POST', '/v1/store/1241/manifest', { ...doc, storeNo: '1187' }, unlocked)).status, 409, 'another store’s report is refused');
  assert.equal((await api('POST', '/v1/store/1241/manifest', { ...doc, manNo: 'bad manifest number!' }, unlocked)).status, 400);
  const snap = (await api('GET', '/v1/store/1241/snapshot?areas=backdock', undefined, unlocked)).body.state;
  assert.equal(snap.dock.manifests['7031482'].totalCartons, 6); assert.equal(snap.dock.manifests['7031482'].truck, null); assert.equal(snap.dock.manifests['7031482'].filename, 'Manifest Report 06-09.xls');
  const got = await api('GET', '/v1/store/1241/manifest/7031482', undefined, unlocked);
  assert.equal(got.status, 200); assert.deepEqual(got.body.consols[0].items[0].cc, ['000000000000000001'], 'the stored document keeps carton ids');
  assert.equal((await api('GET', '/v1/store/1241/manifest/9999999', undefined, unlocked)).status, 404);

  const truck = '2026-09-21-T1';
  const ev = (type, entity, payload) => ({ id: ulid(), store: '1241', area: 'backdock', type, entity, payload, at: at(), v: 1 });
  const consols = got.body.consols.map(c => ({ id: c.id, cons: c.cons, cartons: c.cartons, dept: c.dept, mix: c.mix, items: c.items.map(({ k, q, dept, c: cc }) => ({ k, q, dept, c: cc })) }));
  const r = await api('POST', '/v1/store/1241/events', { events: [ev('truck.create', { truck }, { landedAt: at() }), ev('truck.setLive', { truck }, {}), ev('manifest.attach', { truck }, { manNo: '7031482', dcNo: '4101533', despatch: '05/09/2026', consols }), ev('pallet.land', { truck, bay: 'A1' }, { ptype: 'chep', cartons: null }), ev('pallet.scan', { truck, bay: 'A1' }, { code: '093008012601804381' }), ev('pallet.scan', { truck, bay: 'A1' }, { code: '601804399' })] }, unlocked);
  assert.deepEqual(r.body.results.map(x => x.ok), [true, true, true, true, true, false]);
  assert.equal(r.body.results[5].code, 'not_on_manifest');
  const s2 = (await api('GET', '/v1/store/1241/snapshot?areas=backdock', undefined, unlocked)).body.state;
  assert.equal(s2.dock.trucks[truck].manifest.manNo, '7031482'); assert.equal(s2.dock.trucks[truck].pallets.A1.cartons, 3, 'the scan pulled the consol’s cartons onto the pallet'); assert.deepEqual(s2.dock.trucks[truck].pallets.A1.consolIds, ['601804381']);
  assert.equal(s2.dock.manifests['7031482'].truck, truck); assert.equal(s2.dock.manifests['7031482'].keycodes, 3);

  // Profiles come from the published documents; finalising the truck
  // writes the receiving record the history and export routes read.
  const prof = await api('GET', '/v1/store/1241/profiles', undefined, unlocked);
  assert.equal(prof.status, 200); assert.equal(prof.body.schema, 'dv-profiles/1'); assert.equal(prof.body.trucks_sampled, 1);
  assert.deepEqual(prof.body.gates, { min_trucks: 3, min_consistency: 0.7, min_units_per_ctn: 3 });
  assert.deepEqual(prof.body.profiles, {}, 'one manifest is under the three-truck gate');
  assert.equal((await api('POST', '/v1/store/1241/events', { events: [ev('truck.finalise', { truck }, {})] }, dev)).body.results[0].code, 'unauthorised', 'finalising a truck takes the dock code');
  const running = await api('POST', '/v1/store/1241/events', { events: [ev('pallet.start', { truck, bay: 'A1' }, { pid: 'D1' }), ev('truck.finalise', { truck }, {})] }, unlocked);
  assert.equal(running.body.results[1].code, 'pallets_running', 'a running pallet holds the truck open');
  const fin = await api('POST', '/v1/store/1241/events', { events: [ev('pallet.done', { truck, bay: 'A1' }, {}), ev('truck.finalise', { truck }, {})] }, unlocked);
  assert.deepEqual(fin.body.results.map(x => x.ok), [true, true]);
  const rh = await api('GET', '/v1/store/1241/history/receiving', undefined, unlocked);
  assert.equal(rh.status, 200); assert.equal(rh.body.rows.length, 1);
  assert.equal(rh.body.rows[0].truck, truck); assert.equal(rh.body.rows[0].manifest, '7031482'); assert.equal(rh.body.rows[0].cartons, 3); assert.equal(rh.body.rows[0].matched, 1); assert.equal(rh.body.rows[0].crew, 1);
  const csv = await mf.dispatchFetch('http://conduit.test/v1/store/1241/export/receiving', { headers: { Authorization: `Bearer ${unlocked}` } });
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(await csv.text(), /^date,truck,manifest,/);
  assert.equal((await api('GET', '/v1/store/1241/history/receiving', undefined, ownerToken)).status, 200, 'the owner reads any area');

  const del = await api('DELETE', '/v1/store/1241/manifest/7031482', undefined, unlocked);
  assert.equal(del.status, 200);
  assert.equal((await api('GET', '/v1/store/1241/manifest/7031482', undefined, unlocked)).status, 404);
  const s3 = (await api('GET', '/v1/store/1241/snapshot?areas=backdock', undefined, unlocked)).body.state;
  assert.equal(s3.dock.manifests['7031482'], undefined); assert.equal(s3.dock.trucks[truck].manifest.manNo, '7031482', 'the truck keeps its copy');
});

test('Decant Visualiser importer: dry run reads the site, the import lands the archive, the live truck and the plan, a second run is duplicates', async () => {
  assert.equal((await api('POST', '/v1/admin/stores/1241/import', { source: 'dv', url: 'not a url', dry: true }, ownerToken)).status, 400);
  assert.equal((await api('POST', '/v1/admin/stores/1241/import', { source: 'nope' }, ownerToken)).status, 400);
  const notdv = await api('POST', '/v1/admin/stores/1241/import', { source: 'dv', url: 'https://notdv.test/', dry: true }, ownerToken);
  assert.equal(notdv.status, 404); assert.equal(notdv.body.code, 'dv_site');
  const dry = await api('POST', '/v1/admin/stores/1241/import', { source: 'dv', url: 'https://dv.test', dry: true }, ownerToken);
  assert.equal(dry.status, 200, JSON.stringify(dry.body)); assert.equal(dry.body.dry, true); assert.equal(dry.body.source, 'dv'); assert.equal(dry.body.legacy.name, 'Busselton back dock');
  assert.deepEqual(dry.body.counts, { history: 1, trucks: 1, pallets: 3, planner: 2, events: 19 });
  assert.ok(dry.body.warnings.some(w => /held over/.test(w)), dry.body.warnings.join('|'));
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'dock-imp' })).body.token;
  const reader = (await api('POST', '/v1/auth/unlock', { code: 'DK-CODE' }, dev)).body.token;
  assert.equal((await api('GET', '/v1/store/1241/snapshot?areas=backdock', undefined, reader)).body.state.dock.trucks[DV_TRUCK], undefined, 'a dry run writes nothing');

  const run = await api('POST', '/v1/admin/stores/1241/import', { source: 'dv', url: 'https://dv.test/' }, ownerToken);
  assert.equal(run.status, 200); assert.equal(run.body.applied, dry.body.counts.events); assert.deepEqual(run.body.rejected, []);
  const s = (await api('GET', '/v1/store/1241/snapshot?areas=backdock', undefined, reader)).body.state;
  const t = s.dock.trucks[DV_TRUCK];
  assert.equal(t.status, 'live'); assert.equal(t.manifest.manNo, '7031490'); assert.deepEqual(t.team.map(m => m.pid), ['D1', 'D2']);
  assert.equal(t.pallets.A1.status, 'done'); assert.equal(t.pallets.A2.status, 'active'); assert.equal(t.pallets.A2.assignedTo, 'D2'); assert.equal(t.halts[1].reason, 'nostock');
  assert.ok(s.dock.history.some(r => r.id === '2026-09-16-T1' && r.imported?.source === 'dv' && r.cartons === 470));
  assert.equal(s.plan.days['2026-09-22'].slots[1].manifest.manNo, '7031495');
  const rh = await api('GET', '/v1/store/1241/history/receiving', undefined, reader);
  assert.ok(rh.body.rows.some(r => r.truck === '2026-09-16-T1' && r.manifest === '7031486' && r.crew === 2));

  const again = await api('POST', '/v1/admin/stores/1241/import', { source: 'dv', url: 'https://dv.test' }, ownerToken);
  assert.equal(again.body.applied, 0); assert.equal(again.body.duplicates, dry.body.counts.events, 'the import is idempotent');
  const acts = (await api('GET', '/v1/admin/actions', undefined, ownerToken)).body.actions;
  assert.equal(acts[0].type, 'store.import'); assert.equal(acts[0].detail.source, 'dv'); assert.equal(acts[0].detail.code, 'https://dv.test');
  const flip = await api('POST', '/v1/admin/stores/1241/flip', { area: 'backdock', state: 'live' }, ownerToken);
  assert.equal(flip.body.areas.backdock, 'live');
});

// ── security fixes (audit §3 High 1–4) ─────────────────────────────────────
const raw = (path, body, headers = {}) => mf.dispatchFetch('http://conduit.test' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }).then(async r => ({ status: r.status, body: await r.json() }));
const reg2 = (no, extra = {}) => api('POST', '/v1/admin/stores', { no, name: `Store ${no}`, pin: '135790', codes: { dock: `DK-${no}`, manager: `MG-${no}` }, entitlements: { floor: true, stockroom: true, backdock: true }, ...extra }, ownerToken);

test('lockout: a new device id per guess still meets the store-wide and network lockouts', async () => {
  assert.equal((await reg2('2003')).status, 201);
  let r;
  for (let i = 0; i < 8; i++) { r = await api('POST', '/v1/auth/signin', { store: '2003', pin: String(200000 + i), device: `guess${i}` }); assert.equal(r.status, 403, `guess ${i}`); }
  r = await api('POST', '/v1/auth/signin', { store: '2003', pin: '135790', device: 'fresh-device' });
  assert.equal(r.status, 429, 'the right PIN from a fresh device is still locked out'); assert.equal(r.body.code, 'locked_out');

  assert.equal((await reg2('2004')).status, 201);
  const ip = { 'CF-Connecting-IP': '203.0.113.9' };
  // Spraying across stores (here, store numbers that do not exist) from one network.
  for (let i = 0; i < 40; i++) assert.equal((await raw('/v1/auth/signin', JSON.stringify({ store: String(3000 + i), pin: '000000', device: `ipguess${i}` }), ip)).status, 404);
  assert.equal((await raw('/v1/auth/signin', JSON.stringify({ store: '2004', pin: '135790', device: 'ipfresh' }), ip)).status, 429, 'that network is locked out');
  assert.equal((await raw('/v1/auth/signin', JSON.stringify({ store: '2004', pin: '135790', device: 'elsewhere' }), { 'CF-Connecting-IP': '198.51.100.7' })).status, 200, 'another network is not');
  assert.equal((await api('POST', '/v1/auth/signin', { store: '2004', pin: '135790', device: '__proto__' })).status, 400, 'device ids are plain');
});

test('validation: prototype names are refused as entity values and payload keys', async () => {
  assert.equal((await reg2('2005')).status, 201);
  const tok = (await api('POST', '/v1/auth/signin', { store: '2005', pin: '135790', device: 'pp1' })).body.token;
  const ev = (type, entity, payload, area) => ({ id: ulid(), store: '2005', area, type, entity, payload, at: at(), v: 1 });
  const send = body => raw('/v1/store/2005/events', body, { Authorization: `Bearer ${tok}` });
  const r1 = await send(JSON.stringify({ events: [ev('refresh.mark', { week: '__proto__', segment: 'A1 S1' }, {}, 'floor')] }));
  assert.equal(r1.body.results[0].code, 'invalid_event');
  const bad = JSON.stringify({ events: [ev('refresh.mark', { week: '2026-W39', segment: 'A1 S1' }, { dept: 'h1' }, 'floor')] }).replace('"dept":"h1"', '"dept":"h1","__proto__":{"polluted":true}');
  assert.equal((await send(bad)).body.results[0].code, 'invalid_event');
  const ok = await send(JSON.stringify({ events: [ev('refresh.mark', { week: '2026-W39', segment: 'A1 S1' }, { dept: 'h1' }, 'floor')] }));
  assert.equal(ok.body.results[0].ok, true, 'an ordinary mark still lands');
});

test('manifest delete needs the dock code, and a refused delete leaves the document', async () => {
  assert.equal((await reg2('2006')).status, 201);
  const floor = (await api('POST', '/v1/auth/signin', { store: '2006', pin: '135790', device: 'md1' })).body.token;
  const dock = (await api('POST', '/v1/auth/unlock', { code: 'DK-2006' }, floor)).body.token;
  const doc = { v: 1, kind: 'report', manNo: '7777001', storeNo: '2006', consols: [{ id: '601804381', cons: '00093000601804381', cartons: 3, items: [] }] };
  assert.equal((await api('POST', '/v1/store/2006/manifest', doc, dock)).status, 201);
  const no = await api('DELETE', '/v1/store/2006/manifest/7777001', undefined, floor);
  assert.equal(no.status, 403); assert.equal(no.body.code, 'unauthorised');
  assert.equal((await api('GET', '/v1/store/2006/manifest/7777001', undefined, dock)).status, 200, 'still there');
  assert.equal((await api('GET', '/v1/store/2006/manifest/7777001', undefined, floor)).status, 403, 'and the PIN alone cannot read it');
  assert.equal((await api('DELETE', '/v1/store/2006/manifest/7777001', undefined, dock)).status, 200);
  assert.equal((await api('GET', '/v1/store/2006/manifest/7777001', undefined, dock)).status, 404);
});

test('sessions: revoke, rotation and suspension sign devices out; sign-out ends the refresh token', async () => {
  assert.equal((await reg2('2007')).status, 201);
  const signin = device => api('POST', '/v1/auth/signin', { store: '2007', pin: '135790', device });
  const a = (await signin('ra1')).body;
  assert.equal((await api('GET', '/v1/store/2007/snapshot', undefined, a.token)).status, 200);
  const rev = await api('PATCH', '/v1/admin/stores/2007', { revoke: true }, ownerToken);
  assert.equal(rev.status, 200); assert.equal(rev.body.epoch, 1);
  const refused = await api('GET', '/v1/store/2007/snapshot', undefined, a.token);
  assert.equal(refused.status, 401); assert.equal(refused.body.code, 'revoked');
  assert.equal((await api('POST', '/v1/auth/refresh', { refresh: a.refresh })).status, 401, 'the refresh token went too');
  assert.equal((await api('POST', '/v1/auth/unlock', { code: 'DK-2007' }, a.token)).status, 401, 'an old token cannot unlock');

  const b = (await signin('rb1')).body;
  assert.equal((await api('GET', '/v1/store/2007/snapshot', undefined, b.token)).status, 200, 'signing in again works');
  assert.equal((await api('POST', '/v1/auth/signout', { refresh: b.refresh })).status, 200);
  assert.equal((await api('POST', '/v1/auth/refresh', { refresh: b.refresh })).status, 401, 'signed out on the worker');

  const c = (await signin('rc1')).body;
  assert.equal((await api('PATCH', '/v1/admin/stores/2007', { codes: { manager: 'MG-NEW' } }, ownerToken)).body.epoch, 2, 'a code rotation revokes');
  assert.equal((await api('GET', '/v1/store/2007/snapshot', undefined, c.token)).status, 401);

  assert.equal((await api('PATCH', '/v1/admin/stores/2007', { status: 'suspended' }, ownerToken)).status, 200);
  const sus = await signin('rd1');
  assert.equal(sus.status, 403); assert.equal(sus.body.code, 'suspended');
  assert.equal((await api('PATCH', '/v1/admin/stores/2007', { status: 'live' }, ownerToken)).status, 200);
  assert.equal((await signin('rd1')).status, 200);
  const log = await api('GET', '/v1/admin/actions', undefined, ownerToken);
  assert.ok(log.body.actions.some(x => x.type === 'sessions.revoke' && x.store === '2007'));
});

test('an unlocked code lasts a shift: after ROLE_TTL_SECONDS the next refresh drops back to the Floor', async () => {
  assert.equal((await reg2('2008')).status, 201);
  const a = (await api('POST', '/v1/auth/signin', { store: '2008', pin: '135790', device: 'rt1' })).body;
  const u = (await api('POST', '/v1/auth/unlock', { code: 'MG-2008' }, a.token)).body;
  assert.deepEqual(u.roles, ['floor', 'manager']);
  assert.ok(u.expires - Math.floor(Date.now() / 1000) <= 60, 'the access token ends with the role (60 s floor)');
  const r1 = (await api('POST', '/v1/auth/refresh', { refresh: u.refresh })).body;
  assert.deepEqual(r1.roles, ['floor', 'manager'], 'still inside the shift');
  await new Promise(r => setTimeout(r, 2100));
  const r2 = (await api('POST', '/v1/auth/refresh', { refresh: r1.refresh })).body;
  assert.deepEqual(r2.roles, ['floor'], 'the code has to be entered again');
});

test('events: a device clock far from the worker is refused; an oversized payload is refused', async () => {
  const floor = (await api('POST', '/v1/auth/signin', { store: '2005', pin: '135790', device: 'clk1' })).body.token;
  const mk = (at, payload = { dept: 'h1' }) => ({ id: ulid(), store: '2005', area: 'floor', type: 'refresh.mark', entity: { week: '2026-W39', segment: 'B1 S1' }, payload, at, v: 1 });
  const future = new Date(Date.now() + 3600_000).toISOString(), past = new Date(Date.now() - 40 * 86_400_000).toISOString();
  const r = await api('POST', '/v1/store/2005/events', { events: [mk(future), mk(past), mk(new Date().toISOString())] }, floor);
  assert.deepEqual(r.body.results.map(x => x.code || 'ok'), ['clock_skew', 'clock_skew', 'ok']);
  const big = await api('POST', '/v1/store/2005/events', { events: [mk(new Date().toISOString(), { dept: 'h1', note: 'x'.repeat(2_100_000) })] }, floor);
  assert.equal(big.body.results[0].code, 'invalid_event');
});

test('catalogue: the owner builds it from the sitemaps; lookups and near-misses then come from Conduit, not the legacy worker', async () => {
  const before = await api('GET', '/v1/admin/catalogue', undefined, ownerToken);
  assert.equal(before.status, 200); assert.equal(before.body.total, 0); assert.equal(before.body.lastbuild, null);
  assert.equal((await api('GET', '/v1/admin/catalogue')).status, 401, 'owner only');
  const start = await api('POST', '/v1/admin/catalogue/rebuild', {}, ownerToken);
  assert.equal(start.status, 202); assert.equal(start.body.started, true);
  let st; for (let i = 0; i < 100; i++) { st = (await api('GET', '/v1/admin/catalogue', undefined, ownerToken)).body; if (st.lastbuild) break; await new Promise(r => setTimeout(r, 100)); }
  assert.equal(st.lastbuild?.status, 'ok', JSON.stringify(st.lastbuild)); assert.equal(st.total, 3); assert.equal(st.files, 2); assert.equal(st.lastbuild.discovery, 'index:2 files'); assert.equal(st.build, null);
  assert.ok(sitemapReads >= 3); assert.ok(st.next > Date.now(), 'the weekly read is scheduled');

  // 110012345 is unknown to the legacy lookup worker: the name proves it came from Conduit.
  const got = await api('GET', '/v1/catalogue?kc=110012345&fields=link');
  assert.equal(got.body.items['110012345'].name, 'Memory Foam Bath Mat'); assert.match(got.body.items['110012345'].url, /memory-foam-bath-mat-110012345/);
  const near = await api('GET', '/v1/catalogue/nearmiss?kc=110012346');
  assert.equal(near.status, 200); assert.deepEqual(near.body.matches.map(m => [m.keycode, m.position]), [['110012345', 8]]);
  assert.equal((await api('GET', '/v1/catalogue/nearmiss?kc=12')).status, 400);
  const log = await api('GET', '/v1/admin/actions', undefined, ownerToken);
  assert.ok(log.body.actions.some(a => a.type === 'catalogue.rebuild'));
});

test('store settings: a manager sets them, the floor cannot, trucks take the grid, and idle lock drops the codes', async () => {
  assert.equal((await reg2('2031')).status, 201);
  const dev = (await api('POST', '/v1/auth/signin', { store: '2031', pin: '135790', device: 'pc-31' })).body;
  const ev31 = (type, entity, payload, area) => ({ ...event(type, entity, payload, area), store: '2031' });
  const floor = await api('POST', '/v1/store/2031/events', { events: [ev31('store.settings.set', {}, { autoLockMins: 15 }, 'store')] }, dev.token);
  assert.equal(floor.body.results[0].code, 'unauthorised', 'the store PIN alone cannot change settings');

  const mg = (await api('POST', '/v1/auth/unlock', { code: 'MG-2031' }, dev.token)).body;
  assert.deepEqual(mg.roles, ['floor', 'manager']);
  const set = await api('POST', '/v1/store/2031/events', { events: [
    ev31('store.settings.set', {}, { tz: 'Australia/Adelaide', dockGrid: { rows: 5, cols: 9 }, autoLockMins: 15 }, 'store'),
    ev31('store.settings.set', {}, { tz: 'Nowhere/Land' }, 'store'),
    ev31('truck.create', { truck: '2026-09-07-T1' }, {}, 'backdock'),
  ] }, mg.token);
  assert.deepEqual(set.body.results.map(r => r.ok || r.code), [true, 'invalid_event', true]);

  // Every device reads the settings (store-wide), including a floor-only one.
  const snap = await api('GET', '/v1/store/2031/snapshot', undefined, dev.token);
  assert.equal(snap.body.state.settings.tz, 'Australia/Adelaide'); assert.equal(snap.body.state.settings.autoLockMins, 15);
  const full = await api('GET', '/v1/store/2031/snapshot', undefined, mg.token);
  assert.deepEqual(full.body.state.dock.trucks['2026-09-07-T1'].grid, { rows: 5, cols: 9, rowLabels: 'ABCDE' });

  // Idle lock: back to the floor session; the refresh token that carried the manager code is dead.
  const locked = await api('POST', '/v1/auth/lock', { refresh: mg.refresh }, mg.token);
  assert.equal(locked.status, 200); assert.deepEqual(locked.body.roles, ['floor']);
  assert.equal((await api('POST', '/v1/auth/refresh', { refresh: mg.refresh })).status, 401);
  const again = await api('POST', '/v1/auth/refresh', { refresh: locked.body.refresh });
  assert.equal(again.status, 200); assert.deepEqual(again.body.roles, ['floor']);
  const after = await api('POST', '/v1/store/2031/events', { events: [ev31('store.settings.set', {}, { autoLockMins: 30 }, 'store')] }, locked.body.token);
  assert.equal(after.body.results[0].code, 'unauthorised');
  assert.equal((await api('POST', '/v1/auth/lock', {}, ownerToken)).status, 400, 'the owner session does not lock');
});

test('suggested map edits: a floor device suggests, the owner resolves from the console; the dock takes one truck and D-numbers', async () => {
  assert.equal((await reg2('2032')).status, 201);
  const dev = (await api('POST', '/v1/auth/signin', { store: '2032', pin: '135790', device: 'ph-32' })).body;
  const ev32 = (type, entity, payload, area) => ({ ...event(type, entity, payload, area), store: '2032' });
  const sent = await api('POST', '/v1/store/2032/events', { events: [ev32('map.edit.suggest', { edit: 'e-32-1' }, { shelf: 'A16 S1', kind: 'rename', to: 'Kitchen gadgets' }, 'store')] }, dev.token);
  assert.equal(sent.body.results[0].ok, true, 'the store PIN alone can suggest');
  assert.equal((await api('POST', '/v1/store/2032/events', { events: [ev32('map.edit.resolve', { edit: 'e-32-1' }, { status: 'accepted' }, 'store')] }, dev.token)).body.results[0].code, 'unauthorised');

  assert.equal((await api('POST', '/v1/admin/stores/2032/mapedits/e-32-1', { status: 'accepted' })).status, 401, 'owner only');
  const ok = await api('POST', '/v1/admin/stores/2032/mapedits/e-32-1', { status: 'accepted', note: 'in 4.5' }, ownerToken);
  assert.equal(ok.status, 200); assert.equal(ok.body.status, 'accepted');
  assert.equal((await api('POST', '/v1/admin/stores/2032/mapedits/e-32-1', { status: 'declined' }, ownerToken)).status, 400, 'once only');
  assert.equal((await api('POST', '/v1/admin/stores/2032/mapedits/nope', { status: 'declined' }, ownerToken)).status, 404);
  const snap = await api('GET', '/v1/store/2032/snapshot', undefined, dev.token);
  assert.deepEqual([snap.body.state.mapedits['e-32-1'].status, snap.body.state.mapedits['e-32-1'].resolvedBy], ['accepted', 'owner']);
  assert.ok((await api('GET', '/v1/admin/actions', undefined, ownerToken)).body.actions.some(a => a.type === 'map.edit.resolve'));

  const dk = (await api('POST', '/v1/auth/unlock', { code: 'DK-2032' }, dev.token)).body;
  const r = await api('POST', '/v1/store/2032/events', { events: [
    ev32('truck.create', { truck: '2026-09-07-T1' }, {}, 'backdock'),
    ev32('truck.team.set', { truck: '2026-09-07-T1' }, { team: ['d4', 'Alex'] }, 'backdock'),
    ev32('truck.team.set', { truck: '2026-09-07-T1' }, { team: ['d4', '7'] }, 'backdock'),
    ev32('truck.create', { truck: '2026-09-07-T2' }, {}, 'backdock'),
    ev32('truck.create', { truck: '2026-09-07-T2' }, { carryFrom: '2026-09-07-T1' }, 'backdock'),
  ] }, dk.token);
  assert.deepEqual(r.body.results.map(x => x.ok || x.code), [true, 'invalid_event', true, 'truck_open', true]);
  const dock = (await api('GET', '/v1/store/2032/snapshot', undefined, dk.token)).body.state.dock;
  assert.deepEqual(dock.trucks['2026-09-07-T1'].team, [{ pid: 'D4', dnum: 4 }, { pid: 'D7', dnum: 7 }]);
  assert.equal(dock.trucks['2026-09-07-T1'].status, 'closed');
  assert.equal(dock.history.at(-1).carriedOut.to, '2026-09-07-T2');
});

test('carton profiles: the stockroom code reads them too (a stockroom-only store gets an empty set)', async () => {
  assert.equal((await reg2('2033', { entitlements: { floor: true, stockroom: true, backdock: false }, codes: { stockroom: 'SR-2033', manager: 'MG-2033' } })).status, 201);
  const dev = (await api('POST', '/v1/auth/signin', { store: '2033', pin: '135790', device: 'ph-33' })).body;
  assert.equal((await api('GET', '/v1/store/2033/profiles', undefined, dev.token)).status, 403, 'the store PIN alone does not');
  const sr = (await api('POST', '/v1/auth/unlock', { code: 'SR-2033' }, dev.token)).body;
  const r = await api('GET', '/v1/store/2033/profiles', undefined, sr.token);
  assert.equal(r.status, 200); assert.equal(r.body.schema, 'dv-profiles/1'); assert.deepEqual(r.body.profiles, {});
});

test('issue photos: a store device adds a JPEG, the store and owner read it, others cannot, delete drops it', async () => {
  assert.equal((await reg2('2044')).status, 201);
  const dev = (await api('POST', '/v1/auth/signin', { store: '2044', pin: '135790', device: 'ph-44' })).body;
  const other = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'ph-other' })).body;
  const raw = (method, path, token, body, type = 'image/jpeg') => mf.dispatchFetch('http://conduit.test' + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': type } : {}) }, body });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(7), 0xff, 0xd9]);
  assert.equal((await raw('POST', '/v1/store/2044/photo', null, jpeg)).status, 401);
  assert.equal((await raw('POST', '/v1/store/2044/photo', dev.token, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).status, 415, 'not a JPEG');
  assert.equal((await raw('POST', '/v1/store/2044/photo', dev.token, new Uint8Array(900_000).fill(0xff))).status, 413, 'too big');
  const up = await raw('POST', '/v1/store/2044/photo', dev.token, jpeg); assert.equal(up.status, 201);
  const { id } = await up.json(); assert.match(id, /^[0-9A-Z]{26}$/);
  const got = await raw('GET', `/v1/store/2044/photo/${id}`, dev.token); assert.equal(got.status, 200); assert.equal(got.headers.get('Content-Type'), 'image/jpeg'); assert.equal((await got.arrayBuffer()).byteLength, jpeg.length);
  assert.equal((await raw('GET', `/v1/store/2044/photo/${id}`, other.token)).status, 403, 'another store');
  assert.equal((await raw('GET', `/v1/store/2044/photo/${id}`, ownerToken)).status, 200, 'the owner');
  // The issue.photo event attaches it.
  const log = { id: ulid(), store: '2044', area: 'floor', type: 'issue.log', entity: { issue: 'mp1' }, payload: { cat: 'leak', title: 'Drip', sev: 1 }, at: at(), v: 1 };
  const att = { id: ulid(), store: '2044', area: 'floor', type: 'issue.photo', entity: { issue: 'mp1' }, payload: { photo: id }, at: at(), v: 1 };
  const r = await api('POST', '/v1/store/2044/events', { events: [log, att] }, dev.token);
  assert.deepEqual(r.body.results.map(x => x.ok), [true, true]);
  assert.equal((await raw('DELETE', `/v1/store/2044/photo/${id}`, dev.token)).status, 200);
  assert.equal((await raw('GET', `/v1/store/2044/photo/${id}`, dev.token)).status, 404);
});

test('retention: a bay older than 60 days leaves the live state at the nightly run and stays in History from the archive', async () => {
  assert.equal((await reg2('2066', { codes: { stockroom: 'SR-2066', manager: 'MG-2066' } })).status, 201);
  const dev = (await api('POST', '/v1/auth/signin', { store: '2066', pin: '135790', device: 'ph-66' })).body;
  const sr = (await api('POST', '/v1/auth/unlock', { code: 'SR-2066' }, dev.token)).body.token;
  const old = { bay: '7012', date: '2026-07-01' }, recent = { bay: '7014', date: new Date().toISOString().slice(0, 10) };
  const evs = [old, recent].flatMap(entity => [
    { id: ulid(), store: '2066', area: 'stockroom', type: 'submission.update', entity, payload: { codes: { 43166022: true, 43199310: true } }, at: at(), v: 1 },
    { id: ulid(), store: '2066', area: 'stockroom', type: 'submission.ready', entity, payload: { system: ['43166022'] }, at: at(), v: 1 }]);
  assert.deepEqual((await api('POST', '/v1/store/2066/events', { events: evs }, sr)).body.results.map(x => x.ok), [true, true, true, true]);
  const stub = mf.getDurableObjectNamespace('STORE').then(ns => ns.get(ns.idFromName('2066')));
  const r = await (await stub).retainNow();
  assert.equal(r.ok, true, 'store.retain logged');
  assert.equal(await (await stub).retainNow(), null, 'once a day');
  const snap = (await api('GET', '/v1/store/2066/snapshot?areas=stockroom', undefined, sr)).body.state;
  assert.deepEqual(Object.keys(snap.backfill.subs), [`7014:${recent.date}`], 'the old bay left the live state');
  const h = (await api('GET', '/v1/store/2066/history/backfill', undefined, sr)).body;
  assert.deepEqual(h.rows.map(x => x.bay), ['7014', '7012'], 'live first, then the archive');
  assert.equal(h.rows[1].codes, 2); assert.equal(h.rows[1].accuracy, h.rows[0].accuracy, 'the archived row is the row History showed');
  const csv = await (await mf.dispatchFetch('http://conduit.test/v1/store/2066/export/backfill', { headers: { Authorization: `Bearer ${sr}` } })).text();
  assert.match(csv, /2026-07-01,7012/);
  const k = (await api('GET', '/v1/admin/stores/2066/kpis', undefined, ownerToken)).body;
  assert.ok(k.bytes > 0 && k.bytes < 1_200_000);
});

test('the map editor publishes with its source: the owner reopens it, devices never see it; levels and stairs links are kept', async () => {
  assert.equal((await reg2('2077')).status, 201);
  const dev = (await api('POST', '/v1/auth/signin', { store: '2077', pin: '135790', device: 'ph-77' })).body.token;
  const svg = '<svg class="map real" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><g class="shelf-group" data-shelf="A1" data-full="A1"><rect class="shelf" x="0" y="0" width="1" height="1"/></g><g class="shelf-group" data-shelf="A2" data-full="A2" data-inactive="1"><rect class="shelf" x="2" y="0" width="1" height="1"/></g></svg>';
  const source = { storeNumber: '2077', version: '4.3', floors: [{ id: 'ground', level: 0, shelves: [{ id: 'shelf_1', name: 'A1', x: 0, y: 0 }] }] };
  const paths = { nodes: [{ id: 'p1', x: 0, y: 0 }, { id: 's1', x: 5, y: 0, type: 'stairs', links: [{ floorId: 'mezz', nodeId: 'm1' }, { floorId: '', nodeId: 'x' }] }], edges: [{ a: 'p1', b: 's1' }] };
  assert.equal((await api('POST', '/v1/store/2077/map', { version: 'e1', floors: [{ id: 'ground', svg }], source: 'nope' }, ownerToken)).status, 400);
  const pub = await api('POST', '/v1/store/2077/map', { version: 'e1', floors: [{ id: 'ground', level: 0, svg, paths }, { id: 'mezz', level: 1, svg }], source }, ownerToken);
  assert.equal(pub.status, 201); assert.equal(pub.body.source, true); assert.equal(pub.body.floors[0].shelves, 1, 'the inactive shelf is not counted');
  const back = await api('GET', '/v1/store/2077/map/latest/source', undefined, ownerToken);
  assert.equal(back.status, 200); assert.deepEqual(back.body, source);
  assert.equal((await api('GET', '/v1/store/2077/map/e1/source', undefined, dev)).status, 403, 'a store device cannot read the source');
  const doc = (await api('GET', '/v1/store/2077/map/latest', undefined, dev)).body;
  assert.equal(doc.source, undefined); assert.deepEqual(doc.floors.map(f => f.level), [0, 1]);
  assert.deepEqual(doc.floors[0].paths.nodes[1].links, [{ floorId: 'mezz', nodeId: 'm1' }], 'links kept, the empty one dropped');
  const info = (await api('GET', '/v1/store/2077/map', undefined, ownerToken)).body;
  assert.equal(info.source, true); assert.equal(info.versions[0].source, true);
  assert.equal((await api('POST', '/v1/store/2077/map', { version: 'e2', floors: [{ id: 'ground', svg }] }, ownerToken)).status, 201);
  const none = await api('GET', '/v1/store/2077/map/latest/source', undefined, ownerToken);
  assert.equal(none.status, 404, 'a version published from a file has no source'); assert.match(none.body.message, /no editor source/);
});
