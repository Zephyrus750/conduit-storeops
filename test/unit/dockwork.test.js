import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const T1 = '2026-09-07-T1';
const at = hm => `2026-09-07T${hm}:00+08:00`;
const ev = (type, entity, payload = {}, when = '08:00') => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role: 'dock', device: 'DK1', owner: false }, at: at(when), v: 1 });
const ok = (s, ...a) => assert.equal(apply(s, ev(...a)), null, a[0]);
const code = (s, ...a) => apply(s, ev(...a))?.code;
const B = bay => ({ truck: T1, bay });
function dock(team = ['D1', 'D2', 'D3']) {
  const s = initialState();
  ok(s, 'truck.create', { truck: T1 }, { landedAt: at('06:00') }, '06:00'); ok(s, 'truck.setLive', { truck: T1 }, {}, '06:00');
  ok(s, 'truck.team.set', { truck: T1 }, { team: team.map((pid, i) => ({ pid, role: i === 1 ? 'runner' : 'cutter' })) }, '06:00');
  ok(s, 'pallet.land', B('A1'), { ptype: 'chep', cartons: 40 }, '06:05');   // 20 expected mins
  ok(s, 'pallet.land', B('A2'), { ptype: 'loscam', cartons: 10 }, '06:05');
  return s;
}
const T = s => s.dock.trucks[T1];

test('roles ride on the team; the decant clock can start later than landing', () => {
  const s = dock();
  assert.deepEqual(T(s).team.map(m => m.role), ['cutter', 'runner', 'cutter']);
  ok(s, 'truck.setStart', { truck: T1 }, { at: at('06:30') });
  assert.equal(T(s).decantStartAt, at('06:30'));
  assert.equal(code(s, 'truck.setStart', { truck: T1 }, { at: 'soon' }), 'invalid_event');
  ok(s, 'receiving.confirm', { truck: T1 }, {}, '06:40');
  assert.deepEqual([T(s).receivingConfirmed, T(s).receivedAt], [true, at('06:40')]);
  ok(s, 'receiving.confirm', { truck: T1 }, { confirmed: false }, '06:41');
  assert.equal(T(s).receivedAt, null);
});

test('join, leave, hand over and unstart follow DV', () => {
  const s = dock();
  assert.equal(code(s, 'pallet.join', B('A1'), { pid: 'D2' }), 'invalid_event', 'join needs a running pallet');
  ok(s, 'pallet.start', B('A1'), { pid: 'D1' }, '07:00');
  ok(s, 'pallet.join', B('A1'), { pid: 'd2' }, '07:10');
  assert.equal(code(s, 'pallet.join', B('A1'), { pid: 'D2' }), 'invalid_event', 'already on it');
  assert.equal(code(s, 'pallet.start', B('A2'), { pid: 'D2' }), 'person_busy', 'one pallet at a time, joined or not');
  ok(s, 'pallet.leave', B('A1'), { pid: 'D1' }, '07:20');
  assert.equal(T(s).pallets.A1.status, 'active', 'D2 is still cutting');
  ok(s, 'pallet.handover', B('A1'), { toPid: 'D3' }, '07:25');
  assert.deepEqual(T(s).pallets.A1.segments.map(x => [x.pid, x.end ? 'closed' : 'open']), [['D1', 'closed'], ['D2', 'closed'], ['D3', 'open']]);
  ok(s, 'pallet.leave', B('A1'), { pid: 'D3' }, '07:30');
  assert.deepEqual([T(s).pallets.A1.status, T(s).pallets.A1.assignedTo], ['paused', 'D3'], 'last one off leaves it paused');
  ok(s, 'pallet.start', B('A2'), { pid: 'D1' }, '07:31');
  ok(s, 'pallet.unstart', B('A2'));
  assert.deepEqual([T(s).pallets.A2.status, T(s).pallets.A2.segments.length], ['assigned', 0], 'as DV: still assigned to D1, no time recorded');
  assert.equal(code(s, 'pallet.unstart', B('A2')), 'invalid_event', 'nothing left to undo');
  assert.equal(code(s, 'pallet.done', B('A2')), 'invalid_event', 'done needs work recorded');
});

test('a big pallet done too fast is flagged; fixing the times or confirming it clears the flag', () => {
  const s = dock();
  ok(s, 'pallet.start', B('A1'), { pid: 'D1' }, '07:00'); ok(s, 'pallet.done', B('A1'), {}, '07:02');   // 2 of 20 expected mins
  assert.equal(T(s).pallets.A1.suspect, true);
  ok(s, 'pallet.editTimes', B('A1'), { segments: [{ pid: 'D1', start: at('06:45'), end: at('07:02'), bf: true }] });
  assert.equal(T(s).pallets.A1.suspect, undefined, '17 minutes is believable');
  assert.equal(T(s).pallets.A1.segments[0].bf, true);
  ok(s, 'pallet.start', B('A2'), { pid: 'D2' }, '07:10'); ok(s, 'pallet.done', B('A2'), {}, '07:11');
  assert.equal(T(s).pallets.A2.suspect, undefined, 'a 5-minute pallet can be quick');
  assert.equal(code(s, 'pallet.editTimes', B('A1'), { segments: [{ pid: 'Sam', start: at('07:00') }] }), 'invalid_event');
  assert.equal(code(s, 'pallet.editTimes', B('A1'), { segments: [{ pid: 'D1', start: at('07:00'), end: at('06:00') }] }), 'invalid_event');
  ok(s, 'pallet.editTimes', B('A1'), { segments: [{ pid: 'D1', start: at('07:00'), end: at('07:01') }], doneAt: at('07:01') });
  assert.equal(T(s).pallets.A1.suspect, true);
  ok(s, 'pallet.update', B('A1'), { suspectOk: true });
  assert.equal(T(s).pallets.A1.suspect, undefined);
});

test('a pallet moves to an empty square with its work', () => {
  const s = dock();
  ok(s, 'pallet.start', B('A1'), { pid: 'D1' }, '07:00');
  assert.equal(code(s, 'pallet.move', B('A1'), { to: 'A2' }), 'bay_occupied');
  assert.equal(code(s, 'pallet.move', B('A1'), { to: 'Z9' }), 'invalid_event');
  ok(s, 'pallet.move', B('A1'), { to: 'c4' });
  assert.equal(T(s).pallets.A1, undefined);
  assert.deepEqual([T(s).pallets.C4.ref, T(s).pallets.C4.segments.length, T(s).pallets.C4.status], ['C4', 1, 'active']);
});

test('hold-up kinds, the booked huddle and personal breaks', () => {
  const s = dock();
  ok(s, 'truck.setStart', { truck: T1 }, { at: at('07:00') });
  assert.equal(code(s, 'halt.start', { truck: T1 }, { kind: 'transition', reason: 'hcage' }), 'invalid_event', 'a transition has its own reasons');
  assert.equal(code(s, 'halt.start', { truck: T1 }, { kind: 'nap', reason: 'x' }), 'invalid_event');
  ok(s, 'huddle.plan', { truck: T1 }, { mins: 10 });
  ok(s, 'huddle.plan', { truck: T1 }, { mins: 5 });
  assert.deepEqual(T(s).halts.map(h => [h.kind, Date.parse(h.start), Date.parse(h.end), !!h.planned]), [['huddle', Date.parse(at('07:00')), Date.parse(at('07:05')), true]], 'a new booking replaces the old');
  ok(s, 'halt.start', { truck: T1 }, { kind: 'transition', reason: 'tables', note: 'new tables out' }, '07:30'); ok(s, 'halt.end', { truck: T1 }, {}, '07:40');
  ok(s, 'halt.start', { truck: T1 }, { kind: 'break', reason: 'break' }, '09:00'); ok(s, 'halt.end', { truck: T1 }, {}, '09:15');
  ok(s, 'halt.start', { truck: T1 }, { reason: 'hcage' }, '09:30'); ok(s, 'halt.end', { truck: T1 }, {}, '09:50');
  ok(s, 'break.start', { truck: T1 }, { pid: 'D1' }, '08:00');
  assert.equal(code(s, 'break.start', { truck: T1 }, { pid: 'D1' }), 'invalid_event');
  assert.equal(code(s, 'break.start', { truck: T1 }, { pid: 'D9' }), 'not_on_team');
  ok(s, 'break.end', { truck: T1 }, { pid: 'D1' }, '08:10');

  // D1 cuts A1 07:10–08:20: 70 min less the 7:30 transition (10) and their own break (10) = 50.
  // D2 cuts A2 07:10–07:25 = 15 min, less nothing (the transition starts at 7:30).
  ok(s, 'pallet.start', B('A1'), { pid: 'D1' }, '07:10'); ok(s, 'pallet.start', B('A2'), { pid: 'D2' }, '07:10');
  ok(s, 'pallet.done', B('A2'), {}, '07:25'); ok(s, 'pallet.done', B('A1'), {}, '08:20');
  ok(s, 'truck.finalise', { truck: T1 }, {}, '10:00');
  const row = s.dock.history.at(-1), by = Object.fromEntries(row.perPerson.map(r => [r.pid, r]));
  assert.equal(row.clearMins, 80, 'decant start 07:00 to the last pallet done 08:20, not the finalise at 10:00');
  assert.deepEqual([row.haltMins, row.haltCount, row.huddleMins, row.transitionMins, row.teamBreakMins, row.breakMins], [20, 1, 5, 10, 15, 10]);
  assert.deepEqual(row.downtime.map(d => [d.kind, d.reason, d.mins]), [['halt', 'hcage', 20], ['transition', 'tables', 10]], 'huddles and team breaks are not downtime');
  assert.deepEqual([by.D1.mins, by.D1.cartons, by.D2.mins, by.D2.cartons], [50, 40, 15, 10]);
});

test('two people on one pallet share its cartons by time worked', () => {
  const s = dock();
  ok(s, 'pallet.start', B('A1'), { pid: 'D1' }, '07:00');
  ok(s, 'pallet.join', B('A1'), { pid: 'D2' }, '07:30');
  ok(s, 'pallet.done', B('A1'), {}, '07:40');   // D1 40 min, D2 10 min: 32 and 8 of 40 cartons
  ok(s, 'truck.finalise', { truck: T1 }, {}, '08:00');
  const by = Object.fromEntries(s.dock.history.at(-1).perPerson.map(r => [r.pid, r]));
  assert.deepEqual([by.D1.cartons, by.D1.pallets, by.D2.cartons, by.D2.pallets], [32, 1, 8, 0.2]);
});

test('a suspect pallet credits nobody until fixed', () => {
  const s = dock();
  ok(s, 'pallet.start', B('A1'), { pid: 'D1' }, '07:00'); ok(s, 'pallet.done', B('A1'), {}, '07:01');
  ok(s, 'truck.finalise', { truck: T1 }, {}, '08:00');
  const row = s.dock.history.at(-1);
  assert.deepEqual([row.cartons, row.suspect, row.perPerson.length], [40, 1, 0], 'the truck still counts the cartons');
});

test('a break or a move off cutting steps the person off their pallet first (DV)', () => {
  const s = dock();
  ok(s, 'pallet.start', B('A1'), { pid: 'D1' }, '07:00'); ok(s, 'pallet.join', B('A1'), { pid: 'D3' }, '07:05');
  ok(s, 'break.start', { truck: T1 }, { pid: 'D3' }, '07:20');
  assert.deepEqual(T(s).pallets.A1.segments.map(x => [x.pid, x.end && x.end.slice(11, 16)]), [['D1', null], ['D3', '07:20']], 'D3 off, D1 still cutting');
  assert.equal(T(s).pallets.A1.status, 'active');
  // D1 becomes a runner: the last one off leaves the pallet paused, time banked.
  ok(s, 'truck.team.set', { truck: T1 }, { team: [{ pid: 'D1', role: 'runner' }, { pid: 'D2', role: 'runner' }, { pid: 'D3', role: 'cutter' }] }, '07:30');
  assert.deepEqual([T(s).pallets.A1.status, T(s).pallets.A1.segments[0].end.slice(11, 16)], ['paused', '07:30']);
  // Taken off the truck while cutting: the same.
  ok(s, 'break.end', { truck: T1 }, { pid: 'D3' }, '07:35'); ok(s, 'pallet.resume', B('A1'), { pid: 'D3' }, '07:40');
  ok(s, 'truck.team.set', { truck: T1 }, { team: [{ pid: 'D1', role: 'runner' }, { pid: 'D2', role: 'runner' }] }, '07:50');
  assert.equal(T(s).pallets.A1.status, 'paused');
  // A finalise ends a break left open.
  ok(s, 'truck.team.set', { truck: T1 }, { team: ['D1', 'D2'] }, '07:51'); ok(s, 'break.start', { truck: T1 }, { pid: 'D2' }, '08:00');
  ok(s, 'truck.finalise', { truck: T1 }, {}, '09:00');
  assert.ok(T(s).breaks.every(b => b.end), 'no break is left open on a closed truck');
});

test('a wrong consolidation scan comes off the pallet, so the right pallet can take it', () => {
  const s = dock();
  const cons = (n, cartons) => ({ cons: '0000000000' + String(100000000 + n), cartons, dept: '001' });
  ok(s, 'manifest.attach', { truck: T1 }, { manNo: 'M1', consols: [cons(1, 12), cons(2, 30)] });
  ok(s, 'pallet.land', B('A3'), { ptype: 'chep' }, '06:10');
  ok(s, 'pallet.scan', B('A3'), { code: '100000001' }); ok(s, 'pallet.scan', B('A3'), { code: '100000002' });
  assert.equal(T(s).pallets.A3.cartons, 42);
  assert.equal(code(s, 'pallet.scan', B('A1'), { code: '100000002' }), 'consol_taken');
  ok(s, 'pallet.unscan', B('A3'), { id: '100000002' });
  assert.deepEqual([T(s).pallets.A3.consolIds, T(s).pallets.A3.cartons, T(s).pallets.A3.expectedMins], [['100000001'], 12, 6], 'its cartons and estimate go with it');
  assert.ok(!(s.dock.ledger['100000002'] || []).some(x => x.k === 'land'), 'the ledger forgets the landing');
  ok(s, 'pallet.scan', B('A1'), { code: '100000002' });
  assert.equal(code(s, 'pallet.unscan', B('A3'), { id: '100000002' }), 'not_found');
  // An off-manifest label saved on a pallet is dropped the same way.
  ok(s, 'pallet.update', B('A2'), { scanIds: ['555555555'] });
  ok(s, 'pallet.unscan', B('A2'), { id: '555555555' });
  assert.deepEqual(T(s).pallets.A2.scanIds, []);
});

test('moving a pallet keeps its place in the decant plan', () => {
  const s = dock();
  ok(s, 'plan.queues', { truck: T1 }, { queues: { D1: ['A2', 'A1'] } }, '06:10');
  ok(s, 'pallet.move', B('A2'), { to: 'B3' }, '06:12');
  assert.deepEqual(T(s).plan.queues.D1, ['B3', 'A1']);
  assert.equal(T(s).pallets.B3.ref, 'B3');
});

test('a truck made from a planner slot files its manifest: the ledger knows it and the planner no longer offers it', () => {
  const s = initialState();
  const cons = n => ({ cons: String(400000000 + n), cartons: 12, dept: '021' });
  ok(s, 'plan.set', { date: '2026-09-08', slot: '1' }, { eta: '05:30', manifest: { manNo: 'M-88', consols: [cons(1), cons(2)] } }, '06:00');
  ok(s, 'truck.create', { truck: '2026-09-08-T1' }, {}, '06:00');
  const t = s.dock.trucks['2026-09-08-T1'];
  assert.equal(t.manifest.manNo, 'M-88'); assert.equal(t.manifest.consols[0].id, '400000001');
  assert.deepEqual(s.dock.ledger['400000002'].map(x => [x.t, x.k]), [['2026-09-08-T1', 'man']]);
  assert.equal(s.dock.manifests['M-88'].truck, '2026-09-08-T1');
  assert.equal(s.plan.days['2026-09-08'].slots[1], undefined, 'the slot is used up');
  // A slot whose manifest is not valid refuses the truck and changes nothing.
  ok(s, 'plan.set', { date: '2026-09-09', slot: '1' }, { manifest: { manNo: 'M-89', consols: [{ cons: '12' }] } }, '06:00');
  const before = JSON.stringify(s);
  assert.equal(code(s, 'truck.create', { truck: '2026-09-09-T1' }, { carryFrom: '2026-09-08-T1' }, '06:00'), 'invalid_event');
  assert.equal(JSON.stringify(s), before);
});
