import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply, replay, hasReducer, reducerTypes } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, extra = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role: 'dock', device: 'D1', owner: false }, at: '2026-09-07T08:00:00+08:00', v: 1, ...extra,
});
const live = (s, id = '2026-09-07-T1') => { apply(s, ev('truck.create', { truck: id })); apply(s, ev('truck.setLive', { truck: id })); return id; };

test('every catalogued type has a reducer and every reducer is catalogued', () => {
  const missing = Object.keys(CATALOGUE).filter(t => !hasReducer(t));
  const orphan = reducerTypes().filter(t => !CATALOGUE[t]);
  assert.deepEqual(missing, []);
  assert.deepEqual(orphan, []);
});

test('an unknown type is rejected as not_implemented, never applied', () => {
  const s = initialState();
  assert.equal(apply(s, { type: 'ghost.event', entity: {}, payload: {} }).code, 'not_implemented');
});

test('second pallet.land on an occupied bay is rejected with bay_occupied', () => {
  const s = initialState(); const t = live(s);
  assert.equal(apply(s, ev('pallet.land', { truck: t, bay: 'a6' }, { ptype: 'loscam', cartons: 20 })), null);
  const r = apply(s, ev('pallet.land', { truck: t, bay: 'A6' }, { ptype: 'chep', cartons: 5 }));
  assert.equal(r.code, 'bay_occupied');
  assert.equal(s.dock.trucks[t].pallets.A6.ptype, 'loscam');
  assert.equal(s.dock.trucks[t].pallets.A6.expectedMins, 10);
});

test('pallets cannot land on a staged truck; ptype and bay are validated', () => {
  const s = initialState();
  apply(s, ev('truck.create', { truck: '2026-09-07-T2' }));
  assert.equal(apply(s, ev('pallet.land', { truck: '2026-09-07-T2', bay: 'A1' }, { ptype: 'chep' })).code, 'truck_not_live');
  const t = live(s);
  assert.equal(apply(s, ev('pallet.land', { truck: t, bay: 'A1' }, { ptype: 'load' })).code, 'invalid_event');
  assert.equal(apply(s, ev('pallet.land', { truck: t, bay: '7023' }, { ptype: 'chep' })).code, 'invalid_event');
});

test('second pallet.done is an acknowledged no-op; segments credit the crew who worked it', () => {
  const s = initialState(); const t = live(s);
  apply(s, ev('pallet.land', { truck: t, bay: 'A6' }, { ptype: 'loscam', cartons: 20 }));
  assert.equal(apply(s, ev('pallet.start', { truck: t, bay: 'A6' }, { pid: 'D1' }, { at: '2026-09-07T08:10:00+08:00' })), null);
  assert.equal(apply(s, ev('pallet.done', { truck: t, bay: 'A6' }, {}, { at: '2026-09-07T08:30:00+08:00' })), null);
  assert.equal(apply(s, ev('pallet.done', { truck: t, bay: 'A6' }, {}, { at: '2026-09-07T08:31:00+08:00' })), null);
  const p = s.dock.trucks[t].pallets.A6;
  assert.equal(p.status, 'done'); assert.equal(p.doneAt, '2026-09-07T08:30:00+08:00');
  assert.deepEqual(p.segments, [{ pid: 'D1', start: '2026-09-07T08:10:00+08:00', end: '2026-09-07T08:30:00+08:00' }]);
});

test('manifest attach, scan matches by last 9 digits, refuses a consol on another bay, rejects off-manifest', () => {
  const s = initialState(); const t = live(s);
  const consols = [{ cons: '093008012601804381', cartons: 18, dept: '027' }, { cons: '093008012601804382', cartons: 7 }];
  assert.equal(apply(s, ev('manifest.attach', { truck: t }, { manNo: '7031482', consols })), null);
  assert.equal(s.dock.trucks[t].manifest.consols[0].id, '601804381');
  assert.equal(s.dock.manifests['7031482'].totalCartons, 25);
  apply(s, ev('pallet.land', { truck: t, bay: 'A1' }, { ptype: 'loscam' }));
  apply(s, ev('pallet.land', { truck: t, bay: 'A2' }, { ptype: 'loscam' }));
  assert.equal(apply(s, ev('pallet.scan', { truck: t, bay: 'A1' }, { code: '(95)093008012601804381' })), null);
  assert.equal(s.dock.trucks[t].pallets.A1.cartons, 18);
  assert.equal(s.dock.trucks[t].pallets.A1.expectedMins, 9);
  assert.equal(apply(s, ev('pallet.scan', { truck: t, bay: 'A2' }, { code: '601804381' })).code, 'consol_taken');
  assert.equal(apply(s, ev('pallet.scan', { truck: t, bay: 'A2' }, { code: '601804399' })).code, 'not_on_manifest');
  assert.equal(apply(s, ev('pallet.update', { truck: t, bay: 'A2' }, { scanIds: ['601804399'], excluded: true })), null);
  assert.equal(s.dock.trucks[t].pallets.A2.excluded, true);
});

test('halts need a known reason; finalise closes an open halt and writes a history row', () => {
  const s = initialState(); const t = live(s);
  assert.equal(apply(s, ev('halt.start', { truck: t }, { reason: 'lunch' })).code, 'invalid_event');
  assert.equal(apply(s, ev('halt.start', { truck: t }, { reason: 'equip' }, { at: '2026-09-07T09:00:00+08:00' })), null);
  apply(s, ev('pallet.land', { truck: t, bay: 'B1' }, { ptype: 'bulk', cartons: 10, carryover: true }));
  apply(s, ev('pallet.start', { truck: t, bay: 'B1' }, { pid: 'D2' }, { at: '2026-09-07T09:10:00+08:00' }));
  apply(s, ev('pallet.done', { truck: t, bay: 'B1' }, {}, { at: '2026-09-07T09:20:00+08:00' }));
  assert.equal(apply(s, ev('truck.finalise', { truck: t }, {}, { at: '2026-09-07T09:30:00+08:00', actor: { role: 'manager', device: 'DESK' } })), null);
  const row = s.dock.history[0];
  assert.equal(row.id, t); assert.equal(row.cartons, 10); assert.equal(row.pallets, 1); assert.equal(row.haltMins, 30); assert.equal(row.haltCount, 1);
  assert.deepEqual(row.carriedIn, { pallets: 1, cartons: 10 });
  assert.equal(row.perPerson[0].pid, 'D2'); assert.deepEqual(row.perPerson[0].bays, ['B1']); assert.equal(row.perPerson[0].mins, 10);
  assert.deepEqual(row.byDept, [], 'no manifest on this truck, so no department split');
  assert.equal(apply(s, ev('pallet.land', { truck: t, bay: 'B2' }, { ptype: 'bulk' })).code, 'truck_closed');
});

test('truck.import keeps a legacy record as-is, replaces itself on a re-run and sorts into the archive', () => {
  const s = initialState(); const t = live(s);
  apply(s, ev('pallet.land', { truck: t, bay: 'A1' }, { ptype: 'chep', cartons: 4 })); apply(s, ev('pallet.done', { truck: t, bay: 'A1' }, {}, { at: '2026-09-07T09:00:00+08:00' }));
  apply(s, ev('truck.finalise', { truck: t }, {}, { at: '2026-09-07T09:30:00+08:00', actor: { role: 'manager', device: 'DESK' } }));
  assert.equal(apply(s, ev('truck.import', { truck: 'nope' }, {})).code, 'invalid_event');
  const row = { source: 'dv', landedAt: '2026-09-01T22:00:00Z', clearedAt: '2026-09-02T01:00:00Z', cartons: '470', pallets: 14, clearMins: 180, haltMins: 9, haltCount: 1, downtime: [{ reason: 'hcage', mins: 9, count: 1 }, 'junk'], teamRate: 173.4, audit: { matched: 14, missing: 0, total: 14, extra: 0 }, perPerson: [{ pid: 'D1', cartons: 251, pallets: 7.5, mins: 96, rate: 157 }, { nope: 1 }], byDept: [{ dept: '024', cartons: 200, pallets: 6 }], manifest: { manNo: '7031486' }, pauses: { huddle: 5 } };
  assert.equal(apply(s, ev('truck.import', { truck: '2026-09-02-T1' }, row, { at: '2026-09-20T00:00:00Z' })), null);
  assert.deepEqual(s.dock.history.map(r => r.id), ['2026-09-02-T1', t], 'sorted by when it cleared');
  const r = s.dock.history[0];
  assert.equal(r.cartons, 470); assert.equal(r.palletsLanded, 14); assert.equal(r.teamRate, 173); assert.deepEqual(r.downtime, [{ reason: 'hcage', mins: 9, count: 1 }]);
  assert.deepEqual(r.perPerson, [{ pid: 'D1', cartons: 251, pallets: 8, bays: [], mins: 96, rate: 157 }]); assert.deepEqual(r.audit.missingIds, []);
  assert.deepEqual(r.manifest, { manNo: '7031486', despatch: '', dcNo: '' }); assert.deepEqual(r.imported, { source: 'dv', at: '2026-09-20T00:00:00Z', pauses: { huddle: 5, transition: 0, break: 0 } });
  assert.equal(apply(s, ev('truck.import', { truck: '2026-09-02-T1' }, { ...row, cartons: 480 })), null);
  assert.equal(s.dock.history.length, 2); assert.equal(s.dock.history[0].cartons, 480, 'a re-run replaces the row');
});

test('planner slots feed truck.create', () => {
  const s = initialState();
  assert.equal(apply(s, ev('plan.set', { date: '2026-09-08', slot: '5' }, { eta: '09:30' })).code, 'invalid_event');
  assert.equal(apply(s, ev('plan.set', { date: '2026-09-08', slot: '1' }, { eta: '9am' })).code, 'invalid_event');
  assert.equal(apply(s, ev('plan.set', { date: '2026-09-08', slot: '1' }, { eta: '09:30', team: [{ pid: 'D1', name: 'Crew 1' }] })), null);
  assert.equal(apply(s, ev('truck.create', { truck: '2026-09-08-T1' })), null);
  assert.equal(s.dock.trucks['2026-09-08-T1'].team[0].pid, 'D1');
  assert.equal(s.plan.days['2026-09-08'].slots[1], undefined);
});

test('replay rebuilds the same state from the log', () => {
  const log = [ev('truck.create', { truck: '2026-09-07-T1' }), ev('truck.setLive', { truck: '2026-09-07-T1' }), ev('pallet.land', { truck: '2026-09-07-T1', bay: 'A1' }, { ptype: 'chep', cartons: 9 }), ev('pallet.done', { truck: '2026-09-07-T1', bay: 'A1' })];
  const a = initialState(); replay(a, log);
  const b = initialState(); replay(b, log);
  assert.deepEqual(a, b);
  assert.equal(a.dock.trucks['2026-09-07-T1'].pallets.A1.status, 'done');
});
