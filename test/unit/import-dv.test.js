// The Decant Visualiser mapper: DV documents in, Conduit events out, and
// the reducer accepting them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDV, importDV } from '../../worker/import-dv.js';
import { DV, DV_TRUCK } from '../fixtures/dv.js';
import { initialState, apply } from '../../shared/reducers.js';

const data = { active: DV.active, config: DV.config, history: DV.history, trucks: { [DV_TRUCK]: DV.truck }, planner: DV.planner, rollover: DV.rollover };

test('mapDV: the archive becomes truck.import rows with devices in place of people', () => {
  const m = mapDV(data, { no: '1241' });
  const hist = m.events.filter(e => e.type === 'truck.import');
  assert.equal(hist.length, 1); assert.equal(m.counts.history, 1);
  const p = hist[0].payload;
  assert.equal(hist[0].entity.truck, '2026-09-16-T1'); assert.equal(p.source, 'dv'); assert.equal(p.cartons, 470); assert.equal(p.teamRate, 173);
  assert.deepEqual(p.perPerson.map(x => [x.pid, x.cartons, x.pallets, x.mins, x.rate]), [['D1', 251, 7.5, 96, 157], ['D2', 219, 6.5, 88, 149]], 'a shared pallet stays a fraction');
  assert.deepEqual(p.byDept, [{ dept: '024', cartons: 200, pallets: 6 }, { dept: '070', cartons: 270, pallets: 8 }]);
  assert.deepEqual(p.manifest, { manNo: '7031486', despatch: '15/09/2026', dcNo: '4101533' });
  assert.deepEqual(p.pauses, { huddle: 5, transition: 0, break: 0 }); assert.deepEqual(p.downtime[1], { kind: 'transition', reason: 'cages', mins: 4, count: 1 }, 'a hold-up keeps its kind');
  assert.ok(m.warnings.some(w => /history row weird skipped/.test(w)));
  assert.equal(m.store.name, 'Busselton back dock'); assert.equal(m.store.storeNumber, '1241');
});

test('mapDV: the live truck replays as the events that built it, in time order', () => {
  const m = mapDV(data, { no: '1241' });
  const ev = m.events.filter(e => e.entity.truck === DV_TRUCK);
  assert.deepEqual(ev.slice(0, 5).map(e => e.type), ['truck.create', 'truck.setLive', 'manifest.attach', 'truck.team.set', 'truck.setGoal']);
  const man = ev.find(e => e.type === 'manifest.attach').payload;
  assert.equal(man.manNo, '7031490'); assert.deepEqual(man.consols.map(c => [c.id, c.cartons, c.dept]), [['601804401', 12, '024'], ['601804402', 18, '070']], 'the bad consol is dropped, the mixed dept keeps its first');
  assert.deepEqual(ev.find(e => e.type === 'truck.team.set').payload.team, [{ pid: 'D1', role: 'cutter', start: '06:00' }, { pid: 'D2', role: 'cutter' }], 'D-numbers, roles and rostered times, no names');
  const lands = ev.filter(e => e.type === 'pallet.land');
  assert.deepEqual(lands.map(e => [e.entity.bay, e.payload.ptype, e.payload.cartons, e.payload.expectedMins, e.payload.consolIds, e.payload.scanIds]), [['A1', 'chep', 12, undefined, ['601804401'], []], ['A2', 'chep', 18, 14, ['601804402'], []], ['B1', 'bulk', null, undefined, [], ['601804499']]]);
  assert.ok(m.warnings.some(w => /P4 on ZZ skipped/.test(w))); assert.ok(m.warnings.some(w => /1 pallet had no type/.test(w)));
  const a2 = ev.filter(e => e.entity.bay === 'A2' && e.type !== 'pallet.land');
  assert.deepEqual(a2.map(e => [e.type, e.payload.pid || '', new Date(e.ms).toISOString()]), [['pallet.start', 'D1', '2026-09-18T22:25:00.000Z'], ['pallet.pause', '', '2026-09-18T22:30:00.000Z'], ['pallet.start', 'D2', '2026-09-18T22:31:00.000Z']]);
  const a1 = ev.filter(e => e.entity.bay === 'A1' && e.type !== 'pallet.land');
  assert.deepEqual(a1.map(e => e.type), ['pallet.start', 'pallet.done'], 'the last segment of a done pallet closes with done, not pause');
  const halts = ev.filter(e => e.type.startsWith('halt.'));
  assert.deepEqual(halts.map(e => [e.type, e.payload.kind || '', e.payload.reason || '']), [['halt.start', 'halt', 'nostock']], 'hold-ups keep their kind');
  assert.equal(ev.filter(e => e.type === 'huddle.plan').length, 1, 'the planned opening huddle stays a booked huddle');
  assert.ok(!m.warnings.some(w => /planned pause/.test(w)));
  assert.equal(Date.parse(ev[0].payload.decantStartAt), Date.parse('2026-09-18T22:12:00.000Z'), 'the decant clock keeps its own start');
  assert.ok(lands.every(l => l.ms < ev.find(e => e.type === 'pallet.start').ms), 'every pallet lands before the first start');
  assert.ok(ev[0].ms < lands[0].ms);
  assert.equal(m.counts.trucks, 1); assert.equal(m.counts.pallets, 3);
});

test('mapDV: planner slots, the rollover warning, and everything applies through the reducers', () => {
  const m = mapDV(data, { no: '1241' });
  const plan = m.events.filter(e => e.type === 'plan.set');
  assert.equal(plan.length, 2); assert.equal(m.counts.planner, 2);
  assert.equal(plan[0].payload.eta, '06:30'); assert.equal(plan[0].payload.note, 'Two loscam');
  assert.deepEqual(plan[0].payload.team, [{ pid: 'D1', start: '06:00' }, { pid: 'D2' }]);
  assert.equal(plan[0].payload.manifest.manNo, '7031495'); assert.equal(plan[0].payload.manifest.consols[0].cons, '601804510');
  assert.equal(plan[1].payload.eta, null); assert.equal(plan[1].payload.manifest, null);
  assert.ok(m.warnings.some(w => /1 pallet held over from 2026-09-16-T1/.test(w)));
  assert.equal(m.counts.events, m.events.length);

  const s = initialState();
  const results = m.events.map((e, i) => apply(s, { id: String(i), store: '1241', area: e.area, type: e.type, entity: e.entity, payload: e.payload, at: new Date(e.ms).toISOString(), v: 1, actor: { role: 'manager', device: 'OWNER' } }));
  assert.deepEqual(results.filter(Boolean), [], 'every mapped event is accepted');
  const t = s.dock.trucks[DV_TRUCK];
  assert.equal(t.status, 'live'); assert.equal(t.manifest.manNo, '7031490'); assert.equal(t.goalAt, '2026-09-19T01:30:00.000Z');
  assert.equal(t.pallets.A1.status, 'done'); assert.equal(t.pallets.A2.status, 'active'); assert.equal(t.pallets.A2.assignedTo, 'D2'); assert.equal(t.pallets.A2.expectedMins, 14); assert.equal(t.pallets.B1.status, 'landed');
  assert.equal(t.halts.length, 2); assert.equal(t.halts[1].end, null);
  assert.equal(s.dock.history.length, 1); assert.equal(s.dock.history[0].id, '2026-09-16-T1'); assert.equal(s.dock.history[0].imported.source, 'dv'); assert.deepEqual(s.dock.history[0].audit, { matched: 14, missing: 0, total: 14, extra: 0, missingIds: [], extraIds: [] });
  assert.equal(s.plan.days['2026-09-22'].slots[1].manifest.manNo, '7031495');
  assert.equal(s.dock.manifests['7031490'].truck, DV_TRUCK, 'the attached manifest is in the library index');
});

test('the DV address must be a public https site outside dev', async () => {
  const prod = { ENVIRONMENT: 'production' }, never = () => { throw new Error('must not fetch'); };
  for (const url of ['http://busselton-dock.netlify.app', 'https://10.0.0.5', 'https://localhost:8790', 'https://intranet']) {
    await assert.rejects(importDV(prod, { no: '1241', url, dry: true, fetchImpl: never }), e => e.code === 'invalid_request', url);
  }
});

test('mapDV keeps what it used to drop: kinds, per-department minutes, the roster, the carton rate, the booked huddle, pallet sightings', () => {
  const T = 'T-2026-10-09-1'.replace(/^T-/, '').replace(/-1$/, '-T1');
  const m = mapDV({
    active: { trucks: [T] },
    config: { people: [{ pid: 'p1', dnum: 4 }], roster: { pids: ['p1'], updatedAt: '2026-10-06T00:00:00Z' }, settings: { stdMinsPerCarton: 0.4 } },
    history: { rows: [{ id: '2026-10-08-T1', date: '2026-10-08', clearedAt: '2026-10-08T10:00:00Z', downtime: [{ kind: 'transition', reason: 'tables', mins: 10, count: 1 }], perDept: [{ dept: '024', cartons: 120, pallets: 2.5, workedMins: 61.4 }], perPerson: [] }] },
    trucks: { [T]: { status: 'live', landedAt: '2026-10-09T06:00:00Z', team: [{ pid: 'p1', role: 'cutter', rosteredStart: '06:00', rosteredFinish: '10:00' }], pallets: { P1: { n: 1, ref: 'A1', ptype: 'chep', cartons: 20, status: 'landed', lateFrom: { t: '2026-10-07-T1', d: '2026-10-07' } } }, halts: [{ kind: 'huddle', reason: 'huddle', planned: true, start: '2026-10-09T06:05:00Z', end: '2026-10-09T06:15:00Z' }] } },
    planner: { days: {} }, rollover: null,
  }, { no: '1241' });
  const ev = type => m.events.filter(e => e.type === type);
  const row = ev('truck.import')[0].payload;
  assert.deepEqual(row.downtime, [{ kind: 'transition', reason: 'tables', mins: 10, count: 1 }]);
  assert.deepEqual(row.perDept, [{ dept: '024', cartons: 120, pallets: 2.5, workedMins: 61.4 }]);
  assert.deepEqual(ev('dock.roster')[0].payload, { pids: ['D4'] });
  assert.deepEqual([ev('store.settings.set')[0].area, ev('store.settings.set')[0].payload], ['store', { minsPerCarton: 0.4 }]);
  assert.deepEqual(ev('huddle.plan')[0].payload, { mins: 10 }, 'the booked huddle stays booked');
  assert.equal(ev('halt.start').length, 0);
  assert.deepEqual(ev('truck.team.set')[0].payload.team, [{ pid: 'D4', role: 'cutter', start: '06:00', finish: '10:00' }]);
  assert.deepEqual(ev('pallet.land')[0].payload.lateFrom, { t: '2026-10-07-T1', d: '2026-10-07' });
  // The reducer keeps them.
  const s = initialState();
  const at = e => new Date(e.ms).toISOString();
  for (const e of m.events) { const r = apply(s, { id: e.seed, store: '1241', area: e.area, type: e.type, entity: e.entity, payload: e.payload, actor: { role: 'owner', device: 'import', owner: true }, at: at(e), v: 1 }); assert.equal(r, null, `${e.type} ${r?.message || ''}`); }
  assert.deepEqual(s.dock.history[0].perDept, [{ dept: '024', cartons: 120, pallets: 2.5, workedMins: 61.4 }]);
  assert.equal(s.dock.history[0].downtime[0].kind, 'transition');
  assert.deepEqual(s.dock.trucks[T].pallets.A1.lateFrom, { t: '2026-10-07-T1', d: '2026-10-07' });
  assert.deepEqual(s.dock.roster.pids, ['D4']);
  assert.equal(s.settings.minsPerCarton, 0.4);
  // The switch-over morning: a new truck cannot reuse an imported record's number.
  const s2 = initialState(); apply(s2, { id: 'x1', store: '1241', area: 'backdock', type: 'truck.import', entity: { truck: '2026-10-08-T1' }, payload: {}, actor: { owner: true }, at: '2026-10-08T10:00:00Z', v: 1 });
  assert.equal(apply(s2, { id: 'x2', store: '1241', area: 'backdock', type: 'truck.create', entity: { truck: '2026-10-08-T1' }, payload: {}, actor: { role: 'dock' }, at: '2026-10-08T11:00:00Z', v: 1 }).code, 'truck_exists');
});
