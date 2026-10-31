import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';
import { truckPhase, begun, phaseCounts } from '../../shared/dockphase.js';
import { liveAudit } from '../../shared/reducers/backdock.js';

let clock = Date.parse('2026-10-31T00:00:00Z');
const ev = (type, entity, payload = {}) => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role: 'dock', device: 'D1', owner: false }, at: new Date(clock += 60_000).toISOString(), v: 1 });
const ok = (s, ...a) => { const r = apply(s, ev(...a)); assert.equal(r, null, JSON.stringify(r)); };
const T1 = '2026-10-31-T1', T2 = '2026-10-31-T2';

test('phases: planned, receiving, received, decanting, cleared, closed, from what the dock records', () => {
  const s = initialState(), t = () => s.dock.trucks[T1];
  assert.equal(truckPhase(undefined), 'planned');
  ok(s, 'truck.create', { truck: T1 }); assert.equal(truckPhase(t()), 'planned', 'created, not live');
  ok(s, 'truck.setLive', { truck: T1 }); assert.equal(truckPhase(t()), 'receiving');
  ok(s, 'truck.team.set', { truck: T1 }, { team: ['D4'] });
  ok(s, 'pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 30 });
  ok(s, 'pallet.land', { truck: T1, bay: 'A2' }, { ptype: 'bulk' });
  assert.deepEqual(phaseCounts(t()), { pallets: 2, done: 0, cartons: 30, decanted: 0, noCartons: 1 });
  ok(s, 'receiving.confirm', { truck: T1 }, {}); assert.equal(truckPhase(t()), 'received');
  ok(s, 'truck.take5', { truck: T1 }, { items: ['brief', 'safe', 'equip', 'area', 'goal'] }); assert.ok(begun(t())); assert.equal(truckPhase(t()), 'decanting');
  for (const b of ['A1', 'A2']) { ok(s, 'pallet.start', { truck: T1, bay: b }, { pid: 'D4' }); ok(s, 'pallet.done', { truck: T1, bay: b }); }
  assert.equal(truckPhase(t()), 'cleared', 'every pallet done and the layout confirmed');
  ok(s, 'receiving.confirm', { truck: T1 }, { confirmed: false }); assert.equal(truckPhase(t()), 'decanting', 'more may still land until receiving is finished');
  ok(s, 'receiving.confirm', { truck: T1 }, {}); ok(s, 'truck.finalise', { truck: T1 }, {}); assert.equal(truckPhase(t()), 'closed');
});

test('phases: a truck that takes over worked pallets still has to begin its own decant (Take 5)', () => {
  const s = initialState();
  ok(s, 'truck.create', { truck: T1 }); ok(s, 'truck.setLive', { truck: T1 }); ok(s, 'truck.team.set', { truck: T1 }, { team: ['D4'] });
  ok(s, 'pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 30 });
  ok(s, 'pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D4' }); ok(s, 'pallet.pause', { truck: T1, bay: 'A1' });
  ok(s, 'truck.finalise', { truck: T1 }, { rollover: true });
  ok(s, 'truck.create', { truck: T2 }); ok(s, 'truck.setLive', { truck: T2 });
  const t2 = s.dock.trucks[T2];
  assert.ok(t2.pallets.A1?.segments.length, 'the carried pallet keeps its work');
  assert.equal(begun(t2), false); assert.equal(truckPhase(t2), 'receiving');
});

test('pallet.update: labels held off the manifest stay until decided, and a bad list changes nothing', () => {
  const s = initialState();
  ok(s, 'truck.create', { truck: T1 }); ok(s, 'truck.setLive', { truck: T1 });
  ok(s, 'pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 30 });
  ok(s, 'pallet.update', { truck: T1, bay: 'A1' }, { held: ['207000999'] });
  assert.deepEqual(s.dock.trucks[T1].pallets.A1.held, ['207000999']);
  assert.equal(apply(s, ev('pallet.update', { truck: T1, bay: 'A1' }, { note: 'x', held: ['12'] }))?.code, 'invalid_event');
  assert.equal(s.dock.trucks[T1].pallets.A1.note, '', 'refused before anything changed');
  ok(s, 'pallet.update', { truck: T1, bay: 'A1' }, { scanIds: ['207000999'], held: [] });   // Add & flag
  assert.deepEqual(s.dock.trucks[T1].pallets.A1.scanIds, ['207000999']); assert.equal(s.dock.trucks[T1].pallets.A1.held, undefined);
});

test('audit: held labels count as off the manifest; consols carried on still count on the manifest in History', () => {
  const s = initialState(), consols = ['207000001', '207000002', '207000003'].map((id, i) => ({ id, cons: '9539399601' + id, cartons: 10 + i, dept: '074', items: [] }));
  ok(s, 'truck.create', { truck: T1 }); ok(s, 'truck.setLive', { truck: T1 }); ok(s, 'truck.team.set', { truck: T1 }, { team: ['D4'] });
  ok(s, 'manifest.attach', { truck: T1 }, { manNo: '9300418', consols });
  ok(s, 'pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep' }); ok(s, 'pallet.scan', { truck: T1, bay: 'A1' }, { code: '207000001' });
  ok(s, 'pallet.land', { truck: T1, bay: 'A2' }, { ptype: 'chep' }); ok(s, 'pallet.scan', { truck: T1, bay: 'A2' }, { code: '207000002' });
  ok(s, 'pallet.update', { truck: T1, bay: 'A1' }, { held: ['207000999'] });
  const live = liveAudit({ id: T1, ...s.dock.trucks[T1] });
  assert.equal(live.extra, 1, 'a held label is off the manifest until it is flagged or ignored');
  assert.deepEqual(live.extraIds, [{ id: '207000999', bay: 'A1' }]);
  // A1 done, A2 carried on to the next truck with its consol.
  ok(s, 'truck.take5', { truck: T1 }, { items: ['brief', 'safe', 'equip', 'area', 'goal'] });
  ok(s, 'pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D4' }); ok(s, 'pallet.done', { truck: T1, bay: 'A1' });
  ok(s, 'truck.finalise', { truck: T1 }, { rollover: true });
  const row = s.dock.history.find(r => r.id === T1);
  assert.equal(row.carriedOut.pallets, 1);
  assert.equal(row.audit.total + row.audit.carriedOut, 3, 'the manifest still reads three consols');
  assert.equal(row.audit.carriedOut, 1); assert.equal(row.audit.missing, 1, '207000003 never landed');
});
