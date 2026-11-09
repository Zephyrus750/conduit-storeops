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

test('a planner slot stages a published manifest by reference; the truck made from it names the report to attach', () => {
  const s = initialState();
  const ids = Array.from({ length: 500 }, (_, i) => String(601804000 + i));
  const ref = { ref: true, manNo: '7031482', dcNo: '4101533', despatch: '14/10/2026', n: 500, cartons: 1468, keycodes: 900, units: 8820, ids };
  // A whole 500-consol report never fits a planner event; the reference does.
  assert.ok(JSON.stringify(ref).length < 32_000);
  ok(s, 'plan.set', { date: '2026-09-07', slot: 1 }, { eta: '06:30', manifest: ref });
  const sl = s.plan.days['2026-09-07'].slots[1].manifest;
  assert.deepEqual([sl.ref, sl.manNo, sl.n, sl.cartons, sl.consols.length], [true, '7031482', 500, 1468, 0]);
  assert.equal(s.dock.ledger['601804000'][0].k, 'plan', 'the staged consols are in the ledger');
  assert.equal(code(s, 'plan.set', { date: '2026-09-07', slot: 2 }, { manifest: { ...ref, ids: ['12'] } }), 'invalid_event');
  ok(s, 'truck.create', { truck: T1 }, {});
  assert.equal(s.dock.trucks[T1].manifest, null, 'the report is attached by the device, not copied from the slot');
  assert.equal(s.dock.trucks[T1].plannedManifest, '7031482');
  ok(s, 'manifest.attach', { truck: T1 }, { manNo: '7031482', consols: [{ cons: '093008012601804000', cartons: 30, dept: '021' }] });
  assert.equal(s.dock.trucks[T1].manifest.manNo, '7031482');
  assert.equal(s.dock.trucks[T1].plannedManifest, undefined);
});

test('plan.noTrucks: a day confirmed without trucks; planning a truck or a truck arriving clears it; a day with trucks refuses it', () => {
  const s = initialState(), D = '2026-09-07';
  ok(s, 'plan.noTrucks', { date: D }, {});
  assert.equal(s.plan.days[D].noTrucks.by, 'DK1');
  ok(s, 'plan.noTrucks', { date: D }, { on: false });
  assert.equal(s.plan.days[D].noTrucks, undefined);
  ok(s, 'plan.noTrucks', { date: D }, {});
  ok(s, 'plan.set', { date: D, slot: 1 }, { eta: '06:30' });
  assert.equal(s.plan.days[D].noTrucks, undefined, 'a truck planned clears it');
  const before = JSON.stringify(s);
  assert.equal(code(s, 'plan.noTrucks', { date: D }, {}), 'day_has_trucks');
  assert.equal(JSON.stringify(s), before, 'refused: nothing changed');
  ok(s, 'plan.noTrucks', { date: '2026-09-08' }, {});
  ok(s, 'truck.create', { truck: '2026-09-08-T1' }, {});
  assert.equal(s.plan.days['2026-09-08'].noTrucks, undefined, 'a truck that came anyway clears it');
  assert.equal(code(s, 'plan.noTrucks', { date: '8/9/2026' }, {}), 'invalid_event');
});

test('plan.route: a planned truck goes off-site or is diverted, leaves the day’s slots, and comes back to them as Receive here', () => {
  const s = initialState(), D = '2026-09-07';
  ok(s, 'plan.set', { date: D, slot: 1 }, { eta: '06:30', note: 'Xmas', manifest: { ref: true, manNo: '7040201', n: 1, cartons: 52, ids: ['601900021'] } });
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: 'offsite', lands: '2026-09-14', note: 'no room', reason: 'room' });
  const r = s.plan.days[D].routes[1];
  assert.equal(s.plan.days[D].slots[1], undefined, 'nothing expects it at the dock');
  assert.equal(r.route, 'offsite'); assert.equal(r.lands, '2026-09-14'); assert.equal(r.manNo, '7040201', 'the staged manifest is named');
  assert.equal(r.slot.eta, '06:30', 'the slot it left is kept');
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: 'diverted', to: '1187 Bunbury\u0007', lands: null });
  assert.equal(s.plan.days[D].routes[1].to, '1187 Bunbury', 'control characters go');
  assert.equal(s.plan.days[D].routes[1].slot.manifest.manNo, '7040201', 'a change keeps the slot');
  assert.equal(code(s, 'plan.set', { date: D, slot: 1 }, { eta: '07:00' }), 'routed', 'set it back first');
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: null });
  assert.equal(s.plan.days[D].routes, undefined); assert.equal(s.plan.days[D].slots[1].eta, '06:30', 'Receive here puts the slot back');
  assert.equal(code(s, 'plan.route', { date: D, slot: 1 }, { route: null }), 'not_routed', 'nothing to undo is refused');
});

test('plan.route: a day with no truck planned marks its truck; the checks; a truck that comes after all takes the slot back', () => {
  const s = initialState(), D = '2026-09-08';
  ok(s, 'plan.noTrucks', { date: D }, {});
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: 'offsite', lands: '2026-09-10', manNo: '7040300' });
  assert.equal(s.plan.days[D].noTrucks, undefined, 'it had a truck after all');
  assert.equal(s.plan.days[D].routes[1].slot, null); assert.equal(s.plan.days[D].routes[1].manNo, '7040300');
  assert.equal(code(s, 'plan.noTrucks', { date: D }, {}), 'day_has_trucks');
  const before = JSON.stringify(s);
  for (const [p, why] of [[{ route: 'storage' }, 'unknown route'], [{ route: 'offsite', lands: D }, 'lands on the same day'], [{ route: 'offsite', lands: '2026-09-31' }, 'not a date'], [{ route: 'offsite', lands: '2027-06-01' }, 'too far on'], [{ route: 'offsite', reason: 'rain' }, 'unknown reason'], [{ route: 'offsite', manNo: 'a b' }, 'bad manifest number']])
    assert.equal(code(s, 'plan.route', { date: D, slot: 2 }, p), 'invalid_event', why);
  assert.equal(code(s, 'plan.route', { date: D, slot: 5 }, { route: 'offsite' }), 'invalid_event', 'slots 1..4');
  assert.equal(JSON.stringify(s), before, 'refused: nothing changed');
  ok(s, 'plan.set', { date: '2026-09-09', slot: 1 }, { eta: '06:30' });
  ok(s, 'plan.route', { date: '2026-09-09', slot: 1 }, { route: 'offsite' });
  ok(s, 'truck.create', { truck: '2026-09-09-T1' }, {});
  assert.equal(s.plan.days['2026-09-09'].routes, undefined, 'it came after all'); assert.equal(s.plan.days['2026-09-09'].slots[1], undefined, 'the truck took its slot');
  assert.equal(code(s, 'plan.route', { date: '2026-09-09', slot: 1 }, { route: 'offsite' }), 'on_dock');
  ok(s, 'plan.route', { date: D, slot: 2 }, { route: 'diverted' });
  ok(s, 'plan.remove', { date: D, slot: 2 });
  assert.equal(s.plan.days[D].routes[2], undefined, 'Remove truck takes a routed one off too');
});

test('plan.set from: the truck that brings back an off-site one says so, and so does the truck it starts', () => {
  const s = initialState();
  ok(s, 'plan.route', { date: '2026-09-07', slot: 1 }, { route: 'offsite', lands: '2026-09-10' });
  assert.equal(code(s, 'plan.set', { date: '2026-09-10', slot: 2 }, { from: { date: '2026-09-10', slot: 1 } }), 'invalid_event', 'from an earlier day');
  ok(s, 'plan.set', { date: '2026-09-10', slot: 2 }, { eta: '09:30', from: { date: '2026-09-07', slot: 1 } });
  assert.deepEqual(s.plan.days['2026-09-10'].slots[2].from, { date: '2026-09-07', slot: 1 });
  ok(s, 'truck.create', { truck: '2026-09-10-T2' }, {});
  assert.deepEqual(s.dock.trucks['2026-09-10-T2'].from, { date: '2026-09-07', slot: 1 });
});
