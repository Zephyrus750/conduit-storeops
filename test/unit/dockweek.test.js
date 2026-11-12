import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';
import { validateEvent } from '../../shared/validate.js';
import { weekDays, dayHasPlan, dayTrucks, repeatWeek } from '../../shared/dockweek.js';

// Last week Mon 2 to Sun 8 Nov 2026; this week Mon 9 to Sun 15.
const LAST = weekDays('2026-11-02'), THIS = weekDays('2026-11-09');
const ev = (type, entity, payload = {}, at = '2026-11-02T05:00:00+08:00') => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role: 'dock', device: 'DK1', owner: false }, at, v: 1 });
const ok = (s, ...a) => assert.equal(apply(s, ev(...a)), null, a[0]);
const man = { ref: true, manNo: '9300419', dcNo: '', despatch: '', n: 2, cartons: 120, keycodes: 4, units: 300, ids: ['207000001', '207000002'], attachedAt: '2026-11-01T20:00:00Z' };

function lastWeek() {
  const s = initialState();
  // Mon: two slots, one staged with a manifest and a note, a late starter, a booked huddle and break.
  ok(s, 'plan.set', { date: LAST[0], slot: 1 }, { eta: '06:30', team: [{ pid: 'D1', start: '06:30' }, { pid: 'D7', start: '08:30' }], huddleMins: 10, breakMins: 15, note: 'Forklift booked 12:30', manifest: man });
  ok(s, 'plan.set', { date: LAST[0], slot: 2 }, { eta: '11:00' });
  // Tue: a truck that came from its slot and was finalised.
  ok(s, 'plan.set', { date: LAST[1], slot: 1 }, { eta: '06:00', team: [{ pid: 'D2' }, { pid: 'D3', finish: '10:00' }], huddleMins: 5 });
  ok(s, 'truck.create', { truck: `${LAST[1]}-T1` }, { decantStartAt: '2026-11-03T06:10:00+08:00' }, '2026-11-03T06:05:00+08:00');
  ok(s, 'truck.finalise', { truck: `${LAST[1]}-T1` }, {}, '2026-11-03T07:00:00+08:00');
  // Wed: confirmed with no trucks. Thu: a truck marked off-site keeps its planned slot.
  ok(s, 'plan.noTrucks', { date: LAST[2] }, {});
  ok(s, 'plan.set', { date: LAST[3], slot: 2 }, { eta: '13:00', team: [{ pid: 'D4' }] });
  assert.equal(apply(s, { ...ev('plan.route', { date: LAST[3], slot: 2 }, { route: 'offsite', reason: 'room' }), actor: { role: 'manager', device: 'M1', owner: false } }), null);
  return s;
}

test('a truck created from a planner slot keeps the slot\'s ETA', () => {
  const s = lastWeek(), t = s.dock.trucks[`${LAST[1]}-T1`];
  assert.equal(t.eta, '06:00');
  assert.equal(s.plan.days[LAST[1]].slots[1], undefined, 'the slot is consumed');
  assert.deepEqual(t.team.map(m => [m.pid, m.start]), [['D2', '06:00'], ['D3', '06:00']], 'starts follow the ETA');
});

test('dayTrucks reads a day as slots would plan it again; dayHasPlan sees every kind', () => {
  const s = lastWeek();
  assert.deepEqual(dayTrucks(s.plan, s.dock, LAST[0]), [
    { n: 1, eta: '06:30', team: [{ pid: 'D1' }, { pid: 'D7', start: '08:30' }], huddleMins: 10, breakMins: 15 },
    { n: 2, eta: '11:00', team: [], huddleMins: null, breakMins: null },
  ], 'a start equal to the ETA only followed it');
  assert.deepEqual(dayTrucks(s.plan, s.dock, LAST[1]), [{ n: 1, eta: '06:00', team: [{ pid: 'D2' }, { pid: 'D3', finish: '10:00' }], huddleMins: 5, breakMins: null }]);
  assert.deepEqual(dayTrucks(s.plan, s.dock, LAST[3]), [{ n: 2, eta: '13:00', team: [{ pid: 'D4' }], huddleMins: null, breakMins: null }], 'an off-site truck was still a truck that day');
  assert.deepEqual([0, 1, 2, 3, 4].map(i => dayHasPlan(s.plan, s.dock, LAST[i])), [true, true, true, true, false]);
});

test('Repeat last week: slots, ETAs, teams and no-truck days as plan events, never manifests or notes', () => {
  const s = lastWeek();
  // This week's Tuesday already has a truck: it is left alone.
  ok(s, 'plan.set', { date: THIS[1], slot: 3 }, { eta: '09:00' });
  const out = repeatWeek(s.plan, s.dock, LAST, THIS, THIS[0]);
  assert.deepEqual(out.map(e => [e.type, e.entity.date, e.entity.slot]), [
    ['plan.set', THIS[0], 1], ['plan.set', THIS[0], 2], ['plan.noTrucks', THIS[2], undefined], ['plan.set', THIS[3], 2],
  ]);
  assert.ok(out.every(e => !('manifest' in e.payload) && !('note' in e.payload) && !('from' in e.payload)), 'no manifest, note or callback is copied');
  // One write path: each is a valid event the reducers take.
  for (const e of out) { const x = ev(e.type, e.entity, e.payload); assert.equal(validateEvent(x), null); assert.equal(apply(s, x), null, e.type); }
  const mon = s.plan.days[THIS[0]].slots[1];
  assert.deepEqual([mon.eta, mon.team.map(m => [m.pid, m.start || '']), mon.huddleMins, mon.breakMins, mon.manifest, mon.note], ['06:30', [['D1', ''], ['D7', '08:30']], 10, 15, null, '']);
  assert.ok(s.plan.days[THIS[2]].noTrucks);
  assert.equal(s.plan.days[THIS[3]].routes, undefined, 'an off-site mark is not repeated');
  assert.equal(repeatWeek(s.plan, s.dock, LAST, THIS, THIS[0]).length, 0, 'a second press adds nothing');
});

test('Repeat last week leaves days already past alone', () => {
  const s = lastWeek();
  const out = repeatWeek(s.plan, s.dock, LAST, THIS, THIS[2]);
  assert.deepEqual(out.map(e => [e.type, e.entity.date]), [['plan.noTrucks', THIS[2]], ['plan.set', THIS[3]]]);
});
