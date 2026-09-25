import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { settingsOf, SETTINGS_DEFAULTS } from '../../shared/reducers/store.js';
import { validateEvent } from '../../shared/validate.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role: 'manager', device: 'PC1', owner: false }, at: '2026-09-07T08:00:00+08:00', v: 1,
});
const set = payload => ev('store.settings.set', {}, payload);

test('a store with no settings follows the defaults', () => {
  const s = initialState();
  assert.deepEqual(settingsOf(s), SETTINGS_DEFAULTS);
  assert.deepEqual(settingsOf(undefined), SETTINGS_DEFAULTS, 'a snapshot from before settings existed');
  assert.equal(validateEvent(set({ tz: 'Australia/Adelaide' })), null);
});

test('store.settings.set validates the whole payload before changing anything', () => {
  const s = initialState();
  for (const bad of [{}, { colour: 'red' }, { tz: 'Mars/Olympus' }, { tz: 'x' }, { dockGrid: { rows: 9, cols: 7 } }, { dockGrid: { rows: 4 } }, { minsPerCarton: 0 }, { minsPerCarton: '1' }, { autoLockMins: 7 }, { tz: 'Australia/Sydney', autoLockMins: -1 }]) {
    assert.equal(apply(s, set(bad))?.code, 'invalid_event', JSON.stringify(bad));
  }
  assert.equal(s.settings.tz, null, 'a rejected set leaves the zone untouched');
  assert.equal(apply(s, set({ tz: 'Australia/Adelaide', dockGrid: { rows: 5, cols: 8, extra: 1 }, minsPerCarton: 0.333, autoLockMins: 15 })), null);
  assert.deepEqual(settingsOf(s), { tz: 'Australia/Adelaide', dockGrid: { rows: 5, cols: 8 }, minsPerCarton: 0.33, autoLockMins: 15 });
  assert.equal(s.settings.by, 'PC1');
});

test('a set that changes nothing is refused; null and the default value both mean default', () => {
  const s = initialState();
  assert.equal(apply(s, set({ tz: 'Australia/Perth' }))?.code, 'invalid_event', 'the default is already in force');
  apply(s, set({ autoLockMins: 30 }));
  assert.equal(apply(s, set({ autoLockMins: 30 }))?.code, 'invalid_event');
  assert.equal(apply(s, set({ autoLockMins: null })), null);
  assert.equal(s.settings.autoLockMins, null);
  apply(s, set({ minsPerCarton: 0.8 }));
  assert.equal(apply(s, set({ minsPerCarton: 0.5 })), null);
  assert.equal(s.settings.minsPerCarton, null, 'setting the default value stores "default"');
});

test('a new truck takes the store grid and carton rate; a finalised truck keeps its own', () => {
  const s = initialState();
  apply(s, ev('truck.create', { truck: '2026-09-07-T1' })); apply(s, ev('truck.setLive', { truck: '2026-09-07-T1' }));
  assert.equal(apply(s, ev('pallet.land', { truck: '2026-09-07-T1', bay: 'D7' }, { ptype: 'chep', cartons: 10 })), null);
  const t1 = s.dock.trucks['2026-09-07-T1'];
  assert.equal(t1.pallets.D7.expectedMins, 5, '10 cartons at the standard 0.5');
  apply(s, ev('truck.finalise', { truck: '2026-09-07-T1' }));
  apply(s, set({ dockGrid: { rows: 2, cols: 3 }, minsPerCarton: 1 }));
  apply(s, ev('truck.create', { truck: '2026-09-07-T2' })); apply(s, ev('truck.setLive', { truck: '2026-09-07-T2' }));
  const t2 = s.dock.trucks['2026-09-07-T2'];
  assert.deepEqual([t1.grid.rows, t1.grid.cols, t1.minsPerCarton], [4, 7, 0.5]);
  assert.deepEqual(t2.grid, { rows: 2, cols: 3, rowLabels: 'AB' });
  assert.equal(apply(s, ev('pallet.land', { truck: '2026-09-07-T2', bay: 'C1' }, { ptype: 'chep', cartons: 10 }))?.code, 'invalid_event', 'C is off a two-row grid');
  assert.equal(apply(s, ev('pallet.land', { truck: '2026-09-07-T2', bay: 'B3' }, { ptype: 'chep', cartons: 10 })), null);
  assert.equal(t2.pallets.B3.expectedMins, 10, '10 cartons at 1 min');
  apply(s, ev('pallet.update', { truck: '2026-09-07-T2', bay: 'B3' }, { cartons: 24 }));
  assert.equal(t2.pallets.B3.expectedMins, 24);
});

test('a truck from before settings (no rate stored) keeps the standard rate', () => {
  const s = initialState();
  apply(s, ev('truck.create', { truck: '2026-09-07-T1' })); apply(s, ev('truck.setLive', { truck: '2026-09-07-T1' }));
  delete s.dock.trucks['2026-09-07-T1'].minsPerCarton;
  apply(s, ev('pallet.land', { truck: '2026-09-07-T1', bay: 'A1' }, { ptype: 'chep', cartons: 30 }));
  assert.equal(s.dock.trucks['2026-09-07-T1'].pallets.A1.expectedMins, 15);
});
