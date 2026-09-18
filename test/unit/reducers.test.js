import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply, replay, hasReducer } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, extra = {}) => {
  const area = CATALOGUE[type].area;
  return { id: ulid(), store: '1241', area, type, entity, payload, actor: { role: 'dock', device: 'D1', owner: false }, at: '2026-09-07T08:00:00+08:00', v: 1, ...extra };
};

test('second pallet.land on an occupied bay is rejected with bay_occupied', () => {
  const s = initialState();
  assert.equal(apply(s, ev('truck.create', { truck: 'T1' })), null);
  assert.equal(apply(s, ev('pallet.land', { truck: 'T1', bay: 'A6' }, { kind: 'load', cartons: 20 })), null);
  const r = apply(s, ev('pallet.land', { truck: 'T1', bay: 'A6' }, { kind: 'chep', cartons: 5 }));
  assert.equal(r.code, 'bay_occupied');
  assert.equal(s.dock.pallets['T1:A6'].kind, 'load');
  assert.equal(s.dock.trucks.T1.landed, 1);
});

test('second pallet.done is an acknowledged no-op; credit stays with the first crew', () => {
  const s = initialState();
  apply(s, ev('truck.create', { truck: 'T1' }));
  apply(s, ev('pallet.land', { truck: 'T1', bay: 'A6' }, { kind: 'load', cartons: 20 }));
  assert.equal(apply(s, ev('pallet.done', { truck: 'T1', bay: 'A6' }, { crew: 'D1' })), null);
  assert.equal(apply(s, ev('pallet.done', { truck: 'T1', bay: 'A6' }, { crew: 'D2' })), null);
  assert.equal(s.dock.pallets['T1:A6'].crew, 'D1');
  assert.equal(s.dock.trucks.T1.done, 1);
});

test('two devices mark the same shelf: both recorded, first at wins', () => {
  const s = initialState();
  const a = ev('refresh.mark', { shelf: 'K12S1', week: '2026-W37' }, {}, { actor: { role: 'floor', device: 'P1' }, at: '2026-09-07T09:05:00+08:00' });
  const b = ev('refresh.mark', { shelf: 'K12S1', week: '2026-W37' }, {}, { actor: { role: 'floor', device: 'P2' }, at: '2026-09-07T09:02:00+08:00' });
  assert.equal(apply(s, a), null);
  assert.equal(apply(s, b), null);
  const m = s.refresh['2026-W37'].K12S1;
  assert.equal(m.at, '2026-09-07T09:02:00+08:00');
  assert.deepEqual(m.devices, ['P1', 'P2']);
});

test('reopen rule: a stale submit after a reopen does not close the bay', () => {
  const s = initialState();
  const k = { bay: '7023', date: '2026-09-07' };
  apply(s, ev('submission.open', k, {}, { at: '2026-09-07T08:00:00+08:00' }));
  apply(s, ev('submission.reopen', k, {}, { at: '2026-09-07T10:00:00+08:00' }));
  assert.equal(apply(s, ev('submission.submit', k, {}, { at: '2026-09-07T09:30:00+08:00' })), null);
  assert.equal(s.backfill['7023:2026-09-07'].status, 'pending');
  assert.equal(apply(s, ev('submission.submit', k, {}, { at: '2026-09-07T10:30:00+08:00' })), null);
  assert.equal(s.backfill['7023:2026-09-07'].status, 'submitted');
});

test('cages carry a ring colour and reject an unknown one', () => {
  const s = initialState();
  assert.equal(apply(s, ev('cage.create', { cage: 'BSN1240417' }, { ring: 'overstock' })), null);
  assert.equal(s.cages.BSN1240417.ring, 'overstock');
  assert.equal(apply(s, ev('cage.create', { cage: 'BSN1240418' }, { ring: 'pink' })).code, 'invalid_event');
  assert.equal(apply(s, ev('cage.scan', { cage: 'BSN1240417' }, { keycode: '42977636', qty: 12 })), null);
  assert.equal(s.cages.BSN1240417.items['42977636'], 12);
});

test('types without a reducer are rejected as not_implemented, never silently logged', () => {
  const s = initialState();
  const r = apply(s, ev('stocktake.start', { session: 'S1' }));
  assert.equal(r.code, 'not_implemented');
  const missing = Object.keys(CATALOGUE).filter(t => !hasReducer(t));
  assert.ok(missing.length > 0, 'the skeleton still has types to implement');
});

test('replay rebuilds the same state from the log', () => {
  const log = [ev('truck.create', { truck: 'T1' }), ev('pallet.land', { truck: 'T1', bay: 'A1' }, { kind: 'load', cartons: 9 }), ev('pallet.done', { truck: 'T1', bay: 'A1' }, { crew: 'D1' })];
  const a = initialState(); replay(a, log);
  const b = initialState(); replay(b, log);
  assert.deepEqual(a, b);
  assert.equal(a.dock.trucks.T1.done, 1);
});
