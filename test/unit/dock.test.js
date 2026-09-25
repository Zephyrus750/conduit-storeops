import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { dnumId, consolsOf } from '../../shared/reducers/backdock.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

let clock = Date.parse('2026-09-07T00:00:00Z');
const ev = (type, entity, payload = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role: 'dock', device: 'D1', owner: false }, at: new Date(clock += 60_000).toISOString(), v: 1,
});
const T1 = '2026-09-07-T1', T2 = '2026-09-07-T2', T3 = '2026-09-08-T1';
const cons = (n, cartons, dept = '021') => ({ cons: String(400000000 + n), cartons, dept });
function truckOne(s) {
  apply(s, ev('truck.create', { truck: T1 })); apply(s, ev('truck.setLive', { truck: T1 }));
  apply(s, ev('truck.team.set', { truck: T1 }, { team: ['D1', 'd2'] }));
  apply(s, ev('manifest.attach', { truck: T1 }, { manNo: 'M1', consols: [cons(1, 40), cons(2, 30, '001'), cons(3, 20, '022')] }));
  apply(s, ev('pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 40, consolIds: ['400000001'] }));
  apply(s, ev('pallet.land', { truck: T1, bay: 'A2' }, { ptype: 'chep', cartons: 30, consolIds: ['400000002'] }));
  apply(s, ev('pallet.land', { truck: T1, bay: 'A3' }, { ptype: 'loscam', cartons: 20, consolIds: ['400000003'] }));
  apply(s, ev('pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D1' })); apply(s, ev('pallet.done', { truck: T1, bay: 'A1' }));
}

test('D-numbers: accepted in every spelling, names refused', () => {
  assert.deepEqual(['D4', 'd4', '4', 4, ' D 04 ', { dnum: 4 }, { pid: 'D4', name: 'Alex' }].map(dnumId), Array(7).fill('D4'));
  assert.deepEqual(['Alex', '', null, 'D0', 'D12345', 'P1'].map(dnumId), Array(6).fill(null));
  const s = initialState(); apply(s, ev('truck.create', { truck: T1 }));
  assert.equal(apply(s, ev('truck.team.set', { truck: T1 }, { team: ['D1', 'Alex'] }))?.code, 'invalid_event');
  assert.deepEqual(s.dock.trucks[T1].team, [], 'a refused team leaves the old one');
  assert.equal(apply(s, ev('truck.team.set', { truck: T1 }, { team: [{ pid: 'p_9', dnum: 3, name: 'Sam' }, 'd3', '7'] })), null);
  assert.deepEqual(s.dock.trucks[T1].team, [{ pid: 'D3', dnum: 3 }, { pid: 'D7', dnum: 7 }], 'no name is kept, duplicates fold');
  assert.equal(apply(s, ev('plan.set', { date: '2026-09-08', slot: '1' }, { team: ['Sam'], note: 'x' }))?.code, 'invalid_event');
  assert.equal(s.plan.days['2026-09-08'], undefined, 'refused before anything changed');
});

test('one truck at a time: a second is refused while the first is open', () => {
  const s = initialState(); truckOne(s);
  const r = apply(s, ev('truck.create', { truck: T2 }));
  assert.equal(r?.code, 'truck_open'); assert.match(r.message, /2026-09-07-T1/);
  assert.equal(apply(s, ev('truck.create', { truck: T2 }, { carryFrom: '2026-09-06-T9' }))?.code, 'not_found');
  apply(s, ev('pallet.start', { truck: T1, bay: 'A2' }, { pid: 'D2' }));
  assert.equal(apply(s, ev('truck.create', { truck: T2 }, { carryFrom: T1 }))?.code, 'pallets_running', 'a pallet mid-decant cannot move');
  assert.equal(s.dock.trucks[T2], undefined);
});

test('carryFrom finalises the open truck and brings its unfinished pallets, on their bays, with their consols', () => {
  const s = initialState(); truckOne(s);
  assert.equal(apply(s, ev('truck.create', { truck: T2 }, { carryFrom: T1 })), null);
  const t1 = s.dock.trucks[T1], t2 = s.dock.trucks[T2];
  assert.equal(t1.status, 'closed'); assert.deepEqual(Object.keys(t1.pallets), ['A1'], 'T1 keeps only what it cleared');
  assert.deepEqual(Object.keys(t2.pallets).sort(), ['A2', 'A3']);
  assert.ok(Object.values(t2.pallets).every(p => p.carryover && p.carriedFrom === T1 && p.status === 'landed'));
  assert.deepEqual(t2.team.map(m => m.pid), ['D1', 'D2'], 'the crew comes with the load');
  assert.deepEqual(consolsOf(t2).map(c => [c.id, c.carried]), [['400000002', true], ['400000003', true]]);
  const row = s.dock.history.find(r => r.id === T1);
  assert.deepEqual(row.carriedOut, { pallets: 2, cartons: 50, to: T2 });
  assert.equal(row.cartons, 40); assert.equal(row.pallets, 1);
  assert.deepEqual([row.audit.matched, row.audit.total], [1, 1], 'the carried consols audit on the truck that clears them');

  // A new manifest on T2 keeps the carried consols alongside its own.
  apply(s, ev('truck.setLive', { truck: T2 }));
  apply(s, ev('manifest.attach', { truck: T2 }, { manNo: 'M2', consols: [cons(9, 60, '015')] }));
  assert.deepEqual(consolsOf(t2).map(c => c.id).sort(), ['400000002', '400000003', '400000009']);
  apply(s, ev('pallet.start', { truck: T2, bay: 'A2' }, { pid: 'D1' })); apply(s, ev('pallet.done', { truck: T2, bay: 'A2' }));
  apply(s, ev('pallet.start', { truck: T2, bay: 'A3' }, { pid: 'D1' })); apply(s, ev('pallet.done', { truck: T2, bay: 'A3' }));
  apply(s, ev('truck.finalise', { truck: T2 }));
  const r2 = s.dock.history.find(r => r.id === T2);
  assert.deepEqual(r2.carriedIn, { pallets: 2, cartons: 50, from: T1 });
  assert.equal(r2.cartons, 50);
  assert.deepEqual([r2.audit.matched, r2.audit.total, r2.audit.missing], [2, 3, 1]);
});

test('a chained carry keeps the first truck of each pallet', () => {
  const s = initialState(); truckOne(s);
  apply(s, ev('truck.create', { truck: T2 }, { carryFrom: T1 })); apply(s, ev('truck.setLive', { truck: T2 }));
  apply(s, ev('truck.create', { truck: T3 }, { carryFrom: T2 }));
  assert.ok(Object.values(s.dock.trucks[T3].pallets).every(p => p.carriedFrom === T1));
});

test('finalise with rollover holds the leftovers; the next truck takes them, or declines', () => {
  const s = initialState(); truckOne(s);
  assert.equal(apply(s, ev('truck.finalise', { truck: T1 }, { rollover: true })), null);
  assert.deepEqual(Object.keys(s.dock.rollover.pallets).sort(), ['A2', 'A3']);
  assert.equal(s.dock.rollover.from, T1);
  assert.deepEqual(s.dock.history.at(-1).carriedOut, { pallets: 2, cartons: 50, to: null });
  apply(s, ev('truck.create', { truck: T3 }));
  assert.deepEqual(Object.keys(s.dock.trucks[T3].pallets).sort(), ['A2', 'A3']);
  assert.equal(s.dock.rollover, null, 'consumed');

  const s2 = initialState(); truckOne(s2);
  apply(s2, ev('truck.finalise', { truck: T1 }, { rollover: true }));
  apply(s2, ev('truck.create', { truck: T3 }, { takeRollover: false }));
  assert.deepEqual(s2.dock.trucks[T3].pallets, {}); assert.equal(s2.dock.rollover, null, 'declined is consumed too');
});

test('a plain finalise with leftovers still closes; the pallets stay on its record unfinished', () => {
  const s = initialState(); truckOne(s);
  assert.equal(apply(s, ev('truck.finalise', { truck: T1 })), null);
  assert.equal(s.dock.rollover, null);
  assert.equal(s.dock.history.at(-1).palletsLanded, 3);
  assert.equal(apply(s, ev('truck.create', { truck: T2 })), null, 'nothing open, so a plain create');
});
