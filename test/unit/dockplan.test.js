import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';
import { schedule, estClear, balance, finishCheck, personalRates, durFor, atTime } from '../../shared/dockplan.js';

const T1 = '2026-09-07-T1';
const at = hm => `2026-09-07T${hm}:00+08:00`;
const ev = (type, entity, payload = {}, when = '08:00') => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role: 'dock', device: 'DK1', owner: false }, at: at(when), v: 1 });
const ok = (s, ...a) => assert.equal(apply(s, ev(...a)), null, a[0]);
const code = (s, ...a) => apply(s, ev(...a))?.code;
const B = bay => ({ truck: T1, bay });
const MIN = 60000;

// A truck object for the pure planner: pallets with expected minutes.
const pal = (ref, mins, extra = {}) => ({ ref, ptype: 'loscam', cartons: mins * 2, expectedMins: mins, status: 'landed', segments: [], consolIds: [], scanIds: [], ...extra });
const truckOf = (pallets, team, extra = {}) => ({ id: T1, team, halts: [], breaks: [], pallets: Object.fromEntries(pallets.map(p => [p.ref, p])), ...extra });
const now = new Date(2026, 8, 7, 7, 0).getTime();

test('estClear deals unstarted pallets, longest first, to whoever frees soonest', () => {
  const t = truckOf([pal('A1', 30), pal('A2', 20), pal('A3', 10)], [{ pid: 'D1' }, { pid: 'D2' }]);
  // D1 takes A1 (30), D2 A2 (20), then A3 goes to D2 (ends at 30): clear at +30.
  assert.equal(estClear(t, now), now + 30 * MIN);
  t.halts.push({ kind: 'halt', reason: 'equip', start: new Date(now).toISOString(), end: null });
  assert.equal(estClear(t, now), null, 'no forecast during a hold-up');
});

test('schedule starts a person at their rostered start and walks their queue', () => {
  const t = truckOf([pal('A1', 30), pal('A2', 20)], [{ pid: 'D1', start: '07:30' }, { pid: 'D2' }], { plan: { queues: { D1: ['A2'] } } });
  const s = schedule(t, now);
  assert.equal(s.D1.items[0].start, atTime(t, '07:30')); assert.equal(s.D1.finish, atTime(t, '07:30') + 20 * MIN);
  assert.equal(s.D2.finish, null);
});

test('balance: tubs first, finish guard keeps work within finish times', () => {
  const t = truckOf([pal('A1', 40), pal('A2', 10, { ptype: 'chep' }), pal('A3', 20)], [{ pid: 'D1', finish: '07:45' }, { pid: 'D2' }]);
  const b = balance(t, now, 'tubs');
  assert.equal(b.queues.D1[0], 'A2', 'chep tubs first');
  assert.ok(!b.queues.D1.includes('A1'), 'the 40-minute pallet would run past D1 07:45');
  assert.equal(b.overFinish, 0);
  assert.equal(balance(truckOf([pal('A1', 5)], [{ pid: 'D1', role: 'runner' }]), now).error, 'no cutters on the team: set roles first');
});

test('finishCheck: minutes past the rostered finish', () => {
  const t = truckOf([pal('A1', 50)], [{ pid: 'D1', finish: '07:30' }]);
  assert.equal(finishCheck(t, 'D1', 'A1', now, {}, true).overMins, 20);
  assert.equal(finishCheck(truckOf([pal('A1', 10)], [{ pid: 'D1', finish: '07:30' }]), 'D1', 'A1', now), null);
});

test('personal rates: 28-day cartons an hour, counting from ten pallets; personal basis uses them', () => {
  const day = d => ({ date: d, perPerson: [{ pid: 'D1', pallets: 6, cartons: 600, workedMins: 300 }, { pid: 'D2', pallets: 2, cartons: 100, workedMins: 60 }] });
  const r = personalRates([day('2026-09-01'), day('2026-09-05'), day('2026-07-01')], Date.parse('2026-09-07T12:00:00'));
  assert.deepEqual([r.D1.rate28d, r.D1.pallets28d, r.D1.eligible, r.D2.eligible], [120, 12, true, false]);
  assert.equal(durFor({ cartons: 60, expectedMins: 30 }, 'D1', { basis: 'personal', rates: r }), 30);
  assert.equal(durFor({ cartons: 60, expectedMins: 45 }, 'D2', { basis: 'personal', rates: r }), 45, 'no rate: the estimate');
});

test('planner slot: huddle and break minutes, per-person times from the ETA, roster, queues, Take 5', () => {
  const s = initialState();
  ok(s, 'dock.roster', {}, { pids: ['D7', 'd8'] });
  assert.deepEqual(s.dock.roster.pids, ['D7', 'D8']);
  assert.equal(code(s, 'dock.roster', {}, { pids: ['Sam'] }), 'invalid_event');
  ok(s, 'plan.set', { date: '2026-09-07', slot: 1 }, { eta: '06:30', team: [{ pid: 'D1' }, { pid: 'D2', start: '07:00', finish: '11:00' }], huddleMins: 10, breakMins: 15 });
  assert.equal(code(s, 'plan.set', { date: '2026-09-07', slot: 1 }, { huddleMins: 200 }), 'invalid_event');
  ok(s, 'truck.create', { truck: T1 }, { decantStartAt: at('06:30') }, '06:00');
  const t = s.dock.trucks[T1];
  assert.deepEqual(t.team.map(m => [m.pid, m.start, m.finish]), [['D1', '06:30', undefined], ['D2', '07:00', '11:00']]);
  assert.deepEqual([t.halts[0].kind, t.halts[0].planned, Date.parse(t.halts[0].end) - Date.parse(t.halts[0].start)], ['huddle', true, 10 * MIN]);
  assert.equal(t.plannedBreakMins, 15);
  ok(s, 'truck.setLive', { truck: T1 }, {}, '06:35');
  ok(s, 'pallet.land', B('A1'), { ptype: 'chep', cartons: 40 }, '06:40');
  ok(s, 'plan.queues', { truck: T1 }, { queues: { D1: ['a1'] }, basis: 'x2' });
  assert.deepEqual(t.plan.queues, { D1: ['A1'] });
  assert.equal(code(s, 'plan.queues', { truck: T1 }, { queues: { D9: ['A1'] } }), 'invalid_event');
  assert.equal(code(s, 'plan.queues', { truck: T1 }, { queues: { D1: ['B9'] } }), 'not_found');
  assert.equal(code(s, 'truck.take5', { truck: T1 }, { items: ['brief', 'safe'] }), 'invalid_event');
  ok(s, 'truck.take5', { truck: T1 }, { items: ['brief', 'safe', 'equip', 'area', 'goal'] }, '06:45');
  assert.equal(t.take5.by, 'DK1');
});

test('a new truck takes the roster when no slot names a team, and a goal from recent clear times', () => {
  const s = initialState();
  ok(s, 'dock.roster', {}, { pids: ['D3'] });
  s.dock.history.push(...[100, 110, 120].map((m, i) => ({ id: `2026-09-0${i + 1}-T1`, clearMins: m })));
  ok(s, 'truck.create', { truck: T1 }, { decantStartAt: at('06:00') }, '06:00');
  const t = s.dock.trucks[T1];
  assert.deepEqual(t.team.map(m => m.pid), ['D3']);
  assert.equal(Date.parse(t.goalAt) - Date.parse(at('06:00')), 110 * MIN);
});
