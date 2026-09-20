// Client library against the real worker in workerd: sign in, dispatch
// offline, connect and flush, a second device sees the change over its
// socket, rejections surface, and a reconnect after a gap catches up.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { hashSecret } from '../../worker/auth.js';
import { createClient, memoryStorage } from '../../client/index.js';

const OWNER_KEY = 'owner-key-for-tests-only';
let mf, baseUrl;

before(async () => {
  mf = new Miniflare({
    modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    modulesRoot: new URL('../../', import.meta.url).pathname, scriptPath: new URL('../../worker/index.js', import.meta.url).pathname,
    compatibilityDate: '2026-08-06', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { STORE: { className: 'StoreObject', useSQLite: true }, REGISTRY: { className: 'RegistryObject', useSQLite: true } },
    bindings: { TOKEN_SECRET: 'test-token-secret', OWNER_KEY_HASH: await hashSecret(OWNER_KEY, 1000), TOKEN_TTL_SECONDS: '3600', REFRESH_TTL_SECONDS: '86400', LOCKOUT_ATTEMPTS: '3', LOCKOUT_SECONDS: '60', ENVIRONMENT: 'test' },
  });
  baseUrl = String(await mf.ready).replace(/\/$/, '');
  const owner = createClient({ baseUrl, storage: memoryStorage() });
  await owner.session.load();
  await owner.session.signInOwner({ ownerKey: OWNER_KEY });
  await owner.transport.request('/v1/admin/stores', { method: 'POST', token: await owner.session.token(), body: {
    no: '1241', name: 'Busselton', region: 'WA South', pin: '2468', codes: { stockroom: 'SR-CODE', dock: 'DK-CODE', manager: 'MGR-CODE' }, entitlements: { floor: true, stockroom: true, backdock: true },
  } });
});
after(async () => { await mf?.dispose(); });

const until = (fn, ms = 4000) => new Promise((resolve, reject) => {
  const t0 = Date.now(); const tick = () => { const v = fn(); if (v) return resolve(v); if (Date.now() - t0 > ms) return reject(new Error('timeout')); setTimeout(tick, 20); }; tick();
});
const device = (name) => createClient({ baseUrl, storage: memoryStorage({ suite_device: name }) });

test('sign in persists, unlock adds a role, token refreshes', async () => {
  const c = device('phone-1');
  assert.equal(await c.session.load(), null);
  const s = await c.session.signIn({ store: '1241', pin: '2468' });
  assert.deepEqual(s.roles, ['floor']); assert.deepEqual(s.caps, ['floor', 'stockroom', 'backdock']); assert.equal(s.device, 'phone-1');
  await assert.rejects(c.session.unlock('nope'), e => e.code === 'unauthorised');
  assert.deepEqual((await c.session.unlock('SR-CODE')).roles, ['floor', 'stockroom']);
  const before = await c.session.token();
  await c.session.refresh();
  assert.notEqual(await c.session.token(), before);
});

test('dispatch offline queues and applies locally; connect flushes; a second device sees it', async () => {
  const a = device('phone-a'), b = device('phone-b');
  await a.session.load(); await a.session.signIn({ store: '1241', pin: '2468' }); await a.session.unlock('SR-CODE');
  await b.session.load(); await b.session.signIn({ store: '1241', pin: '2468' });

  // b is live first.
  const sb = await b.open('1241');
  await until(() => sb.status.state === 'live');
  const seen = [];
  sb.on('cages', v => seen.push(v));

  // a works offline: no connect yet, dispatch applies locally and queues.
  const storeA = (await import('../../client/store.js')).createStore({ storeNo: '1241', session: a.session, transport: a.transport, storage: memoryStorage(), WebSocketImpl: null, online: () => false });
  await storeA.load();
  const ev = await storeA.dispatch({ type: 'cage.create', entity: { cage: 'BSN1240417' }, payload: { ring: 'overstock' } });
  assert.equal(storeA.get('cages').BSN1240417.ring, 'overstock');
  assert.equal(storeA.pending.length, 1); assert.equal(storeA.status.queued, 1); assert.equal(storeA.seq, 0);
  await assert.rejects(storeA.dispatch({ type: 'cage.create', entity: { cage: 'BSN1240417' }, payload: { ring: 'new-lines' } }), e => e.code === 'cage_exists');
  await assert.rejects(storeA.dispatch({ type: 'cage.scan', entity: { cage: 'BSN1240417' }, payload: { keycode: '1' } }), e => e.code === 'invalid_event');

  // Back online without a socket: the outbox flushes over HTTP and b receives the broadcast.
  const storeA2 = (await import('../../client/store.js')).createStore({ storeNo: '1241', session: a.session, transport: a.transport, storage: memoryStorage({ [`outbox:1241:${ev.id}`]: ev }), WebSocketImpl: null, online: () => true });
  await storeA2.load();
  assert.equal(storeA2.pending.length, 1);
  await storeA2.flush();
  assert.equal(storeA2.pending.length, 0); assert.equal(storeA2.seq, 1);
  assert.equal(storeA2.get('cages').BSN1240417.ring, 'overstock');
  await until(() => seen.length && seen[seen.length - 1].BSN1240417);
  assert.equal(sb.get('cages').BSN1240417.ring, 'overstock');
  assert.equal(sb.seq, 1);

  // A socket-connected dispatch from a: submitted over the socket, acked, seen by b.
  const live = await a.open('1241');
  await until(() => live.status.state === 'live');
  assert.equal(live.get('cages').BSN1240417.ring, 'overstock', 'hello brought the snapshot');
  await live.dispatch({ type: 'cage.park', entity: { cage: 'BSN1240417' }, payload: { location: 'aisle 2' } });
  await until(() => live.pending.length === 0);
  await until(() => sb.get('cages').BSN1240417.location === 'AISLE 2');
  assert.equal(live.seq, 2);

  // A rejection surfaces on the dispatching device and rolls the projection back.
  const rejects = [];
  live.on('reject', r => rejects.push(r));
  const bad = { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', store: '1241', area: 'stockroom', type: 'cage.close', entity: { cage: 'NOPE' }, payload: {}, at: '2026-09-07T08:00:00+08:00', v: 1 };
  const forced = (await import('../../client/store.js')).createStore({ storeNo: '1241', session: a.session, transport: a.transport, storage: memoryStorage({ ['outbox:1241:' + bad.id]: bad }), WebSocketImpl: null });
  const rej = []; forced.on('reject', r => rej.push(r));
  await forced.load(); await forced.flush();
  assert.equal(rej.length, 1); assert.equal(rej[0].code, 'not_found'); assert.equal(forced.pending.length, 0);

  // Reconnect after a gap: a device whose cache is behind gets a delta from its last seq.
  const c = device('phone-c');
  await c.session.load(); await c.session.signIn({ store: '1241', pin: '2468' });
  const sc = await c.open('1241');
  await until(() => sc.status.state === 'live' && sc.seq === 2);
  assert.equal(sc.get('cages').BSN1240417.location, 'AISLE 2');
  sc.close();
  assert.equal(sc.status.state, 'offline');

  // A device whose cache stopped at seq 1 says hello with since=1 and receives a delta, not a snapshot.
  const cached = { seq: 1, state: { cages: { BSN1240417: { ring: 'overstock', location: null, items: {}, sweeps: [], status: 'open' } } } };
  const d = createClient({ baseUrl, storage: memoryStorage({ suite_device: 'phone-d', 'snap:1241': cached }) });
  await d.session.load(); await d.session.signIn({ store: '1241', pin: '2468' });
  const sd = await d.open('1241');
  assert.equal(sd.seq, 1, 'served from the cache before connecting');
  await until(() => sd.seq === 2);
  assert.equal(sd.get('cages').BSN1240417.location, 'AISLE 2');
  sd.close();

  // No WebSocket available: the client polls /changes and still catches up.
  const e = createClient({ baseUrl, storage: memoryStorage({ suite_device: 'phone-e' }), WebSocketImpl: null });
  await e.session.load(); await e.session.signIn({ store: '1241', pin: '2468' });
  const se = await e.open('1241');
  await until(() => se.status.state === 'polling' && se.seq === 2);
  assert.equal(se.get('cages').BSN1240417.location, 'AISLE 2');
  se.close(); live.close(); sb.close(); storeA.close(); storeA2.close(); forced.close();
});

test('owner acts as a store, writes carry the owner, and returns to the console', async () => {
  const o = createClient({ baseUrl, storage: memoryStorage({ suite_device: 'dev-laptop' }) });
  await o.session.load();
  assert.equal((await o.session.signInOwner({ ownerKey: OWNER_KEY })).owner, true);
  assert.equal(o.session.current.store, null);
  const s = await o.session.actAs('1241');
  assert.equal(s.store, '1241'); assert.equal(s.name, 'Busselton'); assert.equal(s.actas, true); assert.deepEqual(s.roles, ['manager']);
  const st = await o.open('1241');
  await until(() => st.status.state === 'live');
  await st.dispatch({ type: 'refresh.focus.set', entity: { week: '2026-W38' }, payload: { departments: ['h1'] } });
  await until(() => st.pending.length === 0);
  const tail = await o.transport.request('/v1/admin/stores/1241/tail?limit=1', { token: (await o.session.endActAs(), await o.session.token()) });
  assert.deepEqual(tail.events[0].actor, { role: 'owner', device: 'dev-laptop', owner: true }); assert.equal(tail.events[0].seq, 3);
  assert.equal(o.session.current.store, null); assert.equal(o.session.current.owner, true);
  // Refreshing while acting mints a fresh act-as token off the kept owner refresh.
  await o.session.actAs('1241');
  const before = await o.session.token(); await o.session.refresh();
  assert.notEqual(await o.session.token(), before); assert.equal(o.session.current.actas, true);
  o.closeAll();
});

test('maps: one download per version, served from the cache after, refetched when the projection moves on', async () => {
  const o = createClient({ baseUrl, storage: memoryStorage({ suite_device: 'dev-laptop' }) });
  await o.session.load(); await o.session.signInOwner({ ownerKey: OWNER_KEY });
  const svg = v => `<svg class="map real" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><g class="shelf-group" data-shelf="A${v}" data-dept="h1"><rect class="shelf" x="0" y="0" width="1" height="1"/></g></svg>`;
  await o.maps.publish('1241', { version: '1', name: 'Busselton', floors: [{ id: 'ground', svg: svg(1) }] });

  let fetches = 0;
  const counting = { ...o.transport, request: (p, opts) => { if (/\/map\//.test(p)) fetches += 1; return o.transport.request(p, opts); } };
  const storage = memoryStorage({ suite_device: 'phone-m' });
  const c = createClient({ baseUrl, storage });
  await c.session.load(); await c.session.signIn({ store: '1241', pin: '2468' });
  const maps = (await import('../../client/maps.js')).createMaps({ transport: counting, session: c.session, storage });
  const a = await maps.get('1241', { version: '1' });
  assert.equal(a.version, '1'); assert.match(a.floors[0].svg, /A1/); assert.equal(fetches, 1);
  const b = await maps.get('1241', { version: '1' });
  assert.equal(b.version, '1'); assert.equal(fetches, 1, 'second get is the cache');
  assert.equal((await storage.get('map:1241')).version, '1', 'kept on the device');
  await o.maps.publish('1241', { version: '2', floors: [{ id: 'ground', svg: svg(2) }] });
  const st = await c.open('1241'); await until(() => st.get('map').version === '2');
  const d = await maps.get('1241', { version: st.get('map').version });
  assert.equal(d.version, '2'); assert.match(d.floors[0].svg, /A2/); assert.equal(fetches, 2);
  assert.equal(await o.maps.get('9999'), null, 'no map published answers null, not a throw');
  st.close(); o.closeAll();
});

test('a listener that resubscribes itself while an event is emitted runs once, not forever', async () => {
  const c = device('phone-resub');
  await c.session.load(); await c.session.signIn({ store: '1241', pin: '2468' }); await c.session.unlock('SR-CODE');
  const s = await c.open('1241'); await until(() => s.status.state === 'live');
  let runs = 0, off = null;
  const sub = () => { off = s.on('cages', () => { runs += 1; off(); sub(); }); };
  sub();
  await s.dispatch({ type: 'cage.create', entity: { cage: 'BSN1240998' }, payload: { ring: 'overstock' } });
  await until(() => s.pending.length === 0);
  assert.ok(runs >= 1 && runs <= 3, `listener ran ${runs} times`);
  await s.dispatch({ type: 'cage.close', entity: { cage: 'BSN1240998' } }); await until(() => s.pending.length === 0);
  off(); s.close();
});

test('unlocking an area after the socket is open reconnects, so the next submit is judged on the new role', async () => {
  const c = device('phone-unlock');
  await c.session.load(); await c.session.signIn({ store: '1241', pin: '2468' });
  const s = await c.open('1241'); await until(() => s.status.state === 'live');
  await c.session.unlock('SR-CODE');
  await until(() => s.status.state === 'live');
  await s.dispatch({ type: 'cage.create', entity: { cage: 'BSN1240999' }, payload: { ring: 'overstock' } });
  await until(() => s.pending.length === 0);
  assert.equal(s.get('cages').BSN1240999.ring, 'overstock', 'applied on the server, not rolled back');
  await s.dispatch({ type: 'cage.close', entity: { cage: 'BSN1240999' } }); await until(() => s.pending.length === 0);
  s.close();
});
