// Contract tests: the worker running in workerd via Miniflare, with real
// Durable Objects on SQLite. This is the "done when" of build step 2:
// a test device signs in, sends an event, and a second device sees it.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { hashSecret } from '../../worker/auth.js';
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
      if (u.hostname === 'legacy.test') return legacy(u, req);
      return new Response('unexpected upstream ' + req.url, { status: 502 });
    },
    bindings: {
      LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test', LEGACY_URL: 'https://legacy.test',
      TOKEN_SECRET: 'test-token-secret',
      OWNER_KEY_HASH: await hashSecret(OWNER_KEY, 1000),
      TOKEN_TTL_SECONDS: '3600', REFRESH_TTL_SECONDS: '86400', LOCKOUT_ATTEMPTS: '3', LOCKOUT_SECONDS: '60', ENVIRONMENT: 'test',
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

test('health and unbuilt routes are named', async () => {
  assert.equal((await api('GET', '/v1/health')).body.ok, true);
  const r = await api('GET', '/v1/store/1241/life/42977636');
  assert.equal(r.status, 501); assert.equal(r.body.code, 'not_implemented');
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

  // phone-2 opens its socket first and says hello.
  const wsRes = await mf.dispatchFetch('http://conduit.test/v1/store/1241/ws?token=' + p2.token, { headers: { Upgrade: 'websocket' } });
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
  assert.equal((await api('POST', '/v1/store/1241/map', { version: '4.3', floors: [{ id: 'ground', svg: '<svg onload="x()"></svg>' }] }, ownerToken)).status, 400);
  const pub = await api('POST', '/v1/store/1241/map', { version: '4.3', name: 'Busselton', departments: [{ id: 'h1', name: 'H1 Kitchen', color: '#FF8C00' }], floors: [{ id: 'ground', name: 'Ground', type: 'foh', svg }] }, ownerToken);
  assert.equal(pub.status, 201); assert.equal(pub.body.floors[0].shelves, 1);
  assert.equal((await api('POST', '/v1/store/1241/map', { version: '4.3', floors: [{ id: 'ground', svg }] }, ownerToken)).status, 409);

  const info = await api('GET', '/v1/store/1241/map', undefined, dev);
  assert.equal(info.body.version, '4.3'); assert.equal(info.body.floors[0].id, 'ground'); assert.equal(info.body.by.owner, true);
  const doc = await api('GET', '/v1/store/1241/map/latest', undefined, dev);
  assert.equal(doc.body.version, '4.3'); assert.equal(doc.body.floors[0].svg, svg); assert.equal(doc.body.departments[0].id, 'h1');
  const res = await mf.dispatchFetch('http://conduit.test/v1/store/1241/map/4.3', { headers: { Authorization: `Bearer ${dev}`, 'If-None-Match': '"map-4.3"' } });
  assert.equal(res.status, 304);
  assert.equal((await api('GET', '/v1/store/1241/map/9.9', undefined, dev)).status, 404);

  const snap = await api('GET', '/v1/store/1241/snapshot?areas=store', undefined, dev);
  assert.equal(snap.body.state.map.version, '4.3');
  const tail = await api('GET', '/v1/admin/stores/1241/tail?limit=1', undefined, ownerToken);
  assert.equal(tail.body.events[0].type, 'map.publish'); assert.equal(tail.body.events[0].actor.owner, true);
  assert.equal((await api('GET', '/v1/admin/stores/1241', undefined, ownerToken)).body.mapVersion, '4.3');
});

test('K2B importer: dry run counts, the import lands as events, a second run is all duplicates, flip sets the area', async () => {
  const bad = await api('POST', '/v1/admin/stores/1241/import', { code: 'NOPE99', pin: '2468', dry: true }, ownerToken);
  assert.equal(bad.status, 404); assert.equal(bad.body.code, 'legacy_store');
  const wrongPin = await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS247', pin: '0000', dry: true }, ownerToken);
  assert.equal(wrongPin.status, 403); assert.equal(wrongPin.body.code, 'legacy_pin');

  const dry = await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS247', pin: '2468', dry: true }, ownerToken);
  assert.equal(dry.status, 200); assert.equal(dry.body.dry, true); assert.equal(dry.body.legacy.name, 'Busselton');
  assert.deepEqual(dry.body.counts, { history: 2, today: 2, requested: 1, negsoh: 1, events: 13 });
  assert.ok(dry.body.warnings.some(w => /7012:2026-09-17: 1 codes were not keycodes/.test(w)), dry.body.warnings.join('|'));
  const dev = (await api('POST', '/v1/auth/signin', { store: '1241', pin: '2468', device: 'phone-imp' })).body.token;
  const before = (await api('GET', '/v1/store/1241/snapshot?areas=stockroom', undefined, dev)).body;
  assert.equal(before.state.backfill.subs['7012:2026-09-17'], undefined, 'a dry run writes nothing');

  const run = await api('POST', '/v1/admin/stores/1241/import', { code: 'BUS247', pin: '2468' }, ownerToken);
  assert.equal(run.status, 200); assert.equal(run.body.applied, 13); assert.equal(run.body.duplicates, 0); assert.deepEqual(run.body.rejected, []);
  const s = (await api('GET', '/v1/store/1241/snapshot?areas=stockroom', undefined, dev)).body.state;
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
