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
    },
    // Catalogue upstreams are stubbed: the lookup worker answers ?codes=,
    // the details worker answers the POST, and one code is unknown.
    outboundService(req) {
      const u = new URL(req.url);
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
      LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test', LEGACY_URL: 'https://legacy.test',
      TOKEN_SECRET: 'test-token-secret',
      OWNER_KEY_HASH: await hashSecret(OWNER_KEY, 1000),
      TOKEN_TTL_SECONDS: '3600', REFRESH_TTL_SECONDS: '86400', LOCKOUT_ATTEMPTS: '3', LOCKOUT_STORE_ATTEMPTS: '8', LOCKOUT_IP_ATTEMPTS: '40', LOCKOUT_SECONDS: '60', ROLE_TTL_SECONDS: '2', ENVIRONMENT: 'test',
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
  const pub = await api('POST', '/v1/store/1241/map', { version: '4.3', name: 'Busselton', departments: [{ id: 'h1', name: 'H1 Kitchen', color: '#FF8C00' }], floors: [{ id: 'ground', name: 'Ground', type: 'foh', svg, paths }] }, ownerToken);
  assert.equal(pub.status, 201); assert.equal(pub.body.floors[0].shelves, 1); assert.deepEqual(pub.body.floors[0].paths, { nodes: 2, edges: 1 });
  assert.equal((await api('POST', '/v1/store/1241/map', { version: '4.3', floors: [{ id: 'ground', svg }] }, ownerToken)).status, 409);

  const info = await api('GET', '/v1/store/1241/map', undefined, dev);
  assert.equal(info.body.version, '4.3'); assert.equal(info.body.floors[0].id, 'ground'); assert.equal(info.body.by.owner, true);
  const doc = await api('GET', '/v1/store/1241/map/latest', undefined, dev);
  assert.equal(doc.body.version, '4.3'); assert.equal(doc.body.floors[0].svg, svg); assert.equal(doc.body.departments[0].id, 'h1');
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
  const tail = await api('GET', '/v1/admin/stores/1241/tail?limit=1', undefined, ownerToken);
  assert.equal(tail.body.events[0].actor.owner, true, 'imported events carry the owner as actor');
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
  assert.equal(prof.body.profiles['43307685']?.ctn, 6, 'twelve units in two cartons on 7031482'); assert.equal(prof.body.profiles['43302210'], undefined, 'no carton count, no profile');
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
