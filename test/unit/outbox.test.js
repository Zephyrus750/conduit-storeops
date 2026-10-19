// The device outbox on one store instance, against a stand-in worker: it
// keeps sending after a moment offline (audit 19 Oct D1), keeps a change
// the worker refused for a reason that can clear and sends it again later
// (D2), and judges its own changes with the worker's role (D7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, refusalWaits } from '../../client/store.js';
import { memoryStorage } from '../../client/storage.js';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { primaryRole } from '../../shared/roles.js';
import { storeDay, DEFAULT_TZ } from '../../shared/time.js';
import { ulid } from '../../shared/ulid.js';
import { localIso } from '../../client/store.js';

const timers = { setTimeout: () => 0, clearTimeout() {} };   // no background retries: each test sends when it says so

function fakeSession(roles) {
  const ls = new Set();
  return {
    current: { store: '1241', roles, caps: ['floor', 'stockroom', 'backdock'], expires: 1 },
    device: 'dev-1', token: async () => 'tok', unauthorised() {},
    on: (k, f) => { if (k === 'change') ls.add(f); return () => ls.delete(f); },
    renew(patch = {}) { Object.assign(this.current, { expires: this.current.expires + 1 }, patch); for (const f of [...ls]) f({ ...this.current }); },
  };
}
// A stand-in for POST /events: answer(event) returns a refusal or null.
function fakeWorker(answer = () => null) {
  const log = [];
  return {
    log, wsBase: 'ws://none',
    request: async (path, { body }) => {
      assert.match(path, /\/v1\/store\/1241\/events$/);
      return { now: Date.now(), results: body.events.map(e => { const r = answer(e); if (r) return { id: e.id, ok: false, ...r }; log.push(e); return { id: e.id, ok: true, seq: log.length }; }) };
    },
  };
}
const mark = (segment) => ({ type: 'refresh.mark', entity: { segment, week: '2026-W43' }, payload: {} });
const open = (o) => createStore({ storeNo: '1241', WebSocketImpl: null, timers, storage: memoryStorage(), ...o });

test('a moment offline does not stop the outbox: the same store sends once back online', async () => {
  let up = false;
  const worker = fakeWorker();
  const s = open({ session: fakeSession(['floor']), transport: worker, online: () => up });
  await s.load();
  await s.dispatch(mark('A16 S1'));
  await s.flush();
  assert.equal(worker.log.length, 0); assert.equal(s.pending.length, 1); assert.equal(s.status.state, 'offline');
  up = true;
  await s.flush();
  assert.equal(worker.log.length, 1, 'sent once online (it used to stay stuck until a reload)');
  assert.equal(s.pending.length, 0);
  await s.dispatch(mark('A16 S2')); await s.flush();
  assert.equal(worker.log.length, 2);
  s.close();
});

test('a change refused for a lapsed code waits, later changes in its area wait behind it, and it sends once the code is back', async () => {
  let lapsed = true;
  const worker = fakeWorker(e => (lapsed && e.area === 'stockroom' ? { code: 'unauthorised', message: `${e.type} needs stockroom or manager` } : null));
  const session = fakeSession(['floor', 'stockroom']);
  const s = open({ session, transport: worker, online: () => true });
  const holds = [], rejects = [];
  s.on('hold', l => holds.push(...l)); s.on('reject', r => rejects.push(r));
  await s.load();
  await s.dispatch({ type: 'cage.create', entity: { cage: 'BSN1240417' }, payload: { ring: 'overstock' } });
  await s.flush();
  assert.equal(rejects.length, 0, 'not dropped');
  assert.equal(holds.length, 1); assert.equal(holds[0].code, 'unauthorised');
  assert.deepEqual(s.held.map(h => [h.event.type, h.code]), [['cage.create', 'unauthorised']]);
  assert.equal(s.status.held, 1); assert.equal(s.status.queued, 1);
  assert.equal(s.get('cages').BSN1240417.ring, 'overstock', 'still shown on the device');

  await s.dispatch({ type: 'cage.park', entity: { cage: 'BSN1240417' }, payload: { location: 'aisle 2' } });
  await s.dispatch(mark('A16 S1'));
  await s.flush();
  assert.deepEqual(worker.log.map(e => e.type), ['refresh.mark'], 'the Floor goes on; the park waits behind its cage');
  assert.equal(s.pending.length, 2);

  // The code is entered again: the session changes and the waiting changes go, in order.
  lapsed = false;
  session.renew();
  await s.flush();
  assert.deepEqual(worker.log.map(e => e.type), ['refresh.mark', 'cage.create', 'cage.park']);
  assert.equal(s.pending.length, 0); assert.equal(s.status.held, 0);
  s.close();
});

test('a change the worker does not know yet (a deploy in flight) waits; a real conflict is still dropped and reported', async () => {
  let behind = true;
  const worker = fakeWorker(e => (e.type === 'cage.close' ? { code: 'not_found', message: 'cage NOPE does not exist' } : behind ? { code: 'invalid_event', reason: 'unknown_type', message: `unknown type ${e.type}` } : null));
  const s = open({ session: fakeSession(['floor']), transport: worker, online: () => true });
  const rejects = []; s.on('reject', r => rejects.push(r));
  await s.load();
  await s.dispatch(mark('B2 S1')); await s.flush();
  assert.equal(s.held.length, 1); assert.equal(s.held[0].reason, 'unknown_type');
  behind = false;
  s.retry(); await s.flush();
  assert.equal(worker.log.length, 1); assert.equal(s.pending.length, 0);
  assert.equal(refusalWaits({ code: 'invalid_event', message: 'unknown type x.y' }), true, 'an older worker without reason still counts');
  assert.equal(refusalWaits({ code: 'invalid_event', message: 'payload.ring is required' }), false);
  assert.equal(refusalWaits({ code: 'not_found' }), false);
  assert.equal(rejects.length, 0);
  s.close();
});

test('discard drops one waiting change from the device and lets the rest of its area go', async () => {
  const worker = fakeWorker(e => (e.entity.cage === 'BAD1' ? { code: 'tool_off', message: 'Cages is switched off for this store' } : null));
  const s = open({ session: fakeSession(['floor', 'stockroom']), transport: worker, online: () => true });
  await s.load();
  await s.dispatch({ type: 'cage.create', entity: { cage: 'BAD1' }, payload: { ring: 'overstock' } });
  await s.dispatch({ type: 'cage.create', entity: { cage: 'GOOD1' }, payload: { ring: 'overstock' } });
  await s.flush();
  assert.equal(worker.log.length, 0); assert.equal(s.pending.length, 2);
  assert.equal(await s.discard(s.held[0].event.id), true);
  await s.flush();
  assert.deepEqual(worker.log.map(e => e.entity.cage), ['GOOD1']);
  assert.equal(s.get('cages').BAD1, undefined, 'gone from the device too');
  s.close();
});

test('a manager’s device judges a manager-only change as the worker does (roles floor + manager)', async () => {
  assert.equal(primaryRole({ roles: ['floor', 'manager'] }, ['dock']), 'manager');
  assert.equal(primaryRole({ roles: ['floor', 'dock'] }, ['dock']), 'dock');
  assert.equal(primaryRole({ roles: ['floor'], actor: 'owner' }, ['dock']), 'owner');
  // A truck finalised today, then a late manifest from the manager's device.
  const day = storeDay(new Date(), DEFAULT_TZ), truck = `${day}-T1`, at = localIso();
  const base = initialState();
  const ev = (type, entity, payload = {}) => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role: 'dock', device: 'DK1', owner: false }, at, v: 1 });
  for (const e of [ev('truck.create', { truck }), ev('truck.setLive', { truck }), ev('truck.finalise', { truck })]) assert.equal(apply(base, e), null, e.type);
  const worker = fakeWorker();
  const s = open({ session: fakeSession(['floor', 'manager']), transport: worker, online: () => true, storage: memoryStorage({ 'snap:1241': { seq: 3, state: base } }) });
  await s.load();
  const cons = { cons: '0000000000000000111', cartons: 4, dept: '021', mix: [['021', 4, 16]] };
  await s.dispatch({ type: 'manifest.attach', entity: { truck }, payload: { manNo: 'M1', consols: [cons] } });   // refused as `forbidden` before
  await s.flush();
  assert.equal(worker.log.length, 1);
  assert.equal(s.get('dock').trucks[truck].manifest.manNo, 'M1');
  s.close();
});
