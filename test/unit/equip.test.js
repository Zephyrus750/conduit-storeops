import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE, AREA_PROJECTIONS } from '../../shared/catalogue.js';
import { toolForEvent } from '../../shared/tools.js';
import { equipStatus, daysUntil, liveEquipment } from '../../shared/reducers/equip.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, { device = 'D1', role = 'floor', at = '2026-10-24T09:00:00+08:00' } = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role, device, owner: false }, at, v: 1,
});
const add = (s, id, payload = {}, opts) => apply(s, ev('equip.add', { equip: id }, { code: 'LAD-01', kind: 'step', name: 'Step ladder, 3 step', every: 3, last: '2026-07-14', x: 1200, y: 800, floor: 'g', loc: 'near A8 S1', ...payload }, opts));
const check = (s, id, payload, opts) => apply(s, ev('equip.check', { equip: id }, payload, opts));
const MGR = { device: 'M1', role: 'manager' };

test('equipment: Floor events in their own tool; only a manager removes or restores', () => {
  for (const t of ['equip.add', 'equip.update', 'equip.check', 'equip.remove', 'equip.restore']) {
    assert.equal(CATALOGUE[t].area, 'floor', t); assert.equal(toolForEvent(t)?.id, 'equipment', t);
  }
  assert.deepEqual(CATALOGUE['equip.add'].roles, ['floor']); assert.deepEqual(CATALOGUE['equip.check'].roles, ['floor']);
  assert.deepEqual(CATALOGUE['equip.remove'].roles, ['manager']); assert.deepEqual(CATALOGUE['equip.restore'].roles, ['manager']);
  assert.ok(AREA_PROJECTIONS.floor.includes('equipment'), 'every store device holds the list');
});

test('equipment: an item has its own code, a home on the map, and a due date from its last check', () => {
  const s = initialState();
  assert.equal(add(s, 'Q1', { kind: 'crane' }).code, 'invalid_event');
  assert.equal(add(s, 'Q1', { code: 'LAD 01!' }).code, 'invalid_event');
  assert.equal(add(s, 'Q1', { every: 61 }).code, 'invalid_event');
  assert.equal(add(s, 'Q1', { last: '14/07/2026' }).code, 'invalid_event');
  assert.equal(add(s, 'Q1', { x: 5, y: null }).code, 'invalid_event', 'a place needs x and y');
  assert.equal(add(s, 'Q1', { code: ' lad 02 ' }), null);
  const it = s.equipment.items.Q1;
  assert.deepEqual([it.code, it.kind, it.every, it.last, it.due, it.out, it.x, it.y, it.floor, it.loc], ['LAD-02', 'step', 3, '2026-07-14', '2026-10-14', null, 1200, 800, 'g', 'near A8 S1']);
  assert.equal(it.log[0].a, 'Added');
  assert.equal(add(s, 'Q1').code, 'exists', 'the same id twice');
  assert.equal(add(s, 'Q2', { code: 'lad-02' }).code, 'exists', 'one code, one item');
  // A contractor's booked service: no interval, the date typed in.
  assert.equal(add(s, 'Q3', { code: 'MHE-01', kind: 'epj', every: 0, last: null, due: '2026-11-20' }), null);
  assert.equal(s.equipment.items.Q3.due, '2026-11-20');
  // Never checked yet: no due date until the first check.
  assert.equal(add(s, 'Q4', { code: 'TRL-01', kind: 'trolley', last: null, every: 12 }), null);
  assert.equal(s.equipment.items.Q4.due, null);
});

test('equipment: a failed check puts it out of service until a check passes', () => {
  const s = initialState(); add(s, 'Q1');
  assert.equal(check(s, 'Q1', { day: '2026-10-24', result: 'maybe' }).code, 'invalid_event');
  assert.equal(check(s, 'Q1', { day: 'today', result: 'ok' }).code, 'invalid_event');
  assert.equal(check(s, 'Q1', { day: '2026-10-24', result: 'ok', points: { feet: 'fail' } }).code, 'invalid_event', 'a failed point is a fail');
  assert.equal(check(s, 'Q1', { day: '2026-10-24', result: 'fail', points: { feet: 'fail', rungs: 'ok' }, note: 'rubber foot missing', issue: 'm123' }), null);
  const it = s.equipment.items.Q1;
  assert.deepEqual(it.out, { since: '2026-10-24', note: 'rubber foot missing', issue: 'm123' });
  assert.equal(it.due, '2026-10-14', 'the due date stays until it passes');
  assert.equal(equipStatus(it, '2026-10-24'), 'out');
  assert.equal(check(s, 'Q1', { day: '2026-10-27', result: 'ok', points: { feet: 'ok', rungs: 'ok' } }), null);
  assert.deepEqual([it.out, it.last, it.due, it.log.at(-1).a], [null, '2026-10-27', '2027-01-27', 'Back in service']);
  // A check written up late never moves the last check back.
  assert.equal(check(s, 'Q1', { day: '2026-10-01', result: 'ok' }), null);
  assert.deepEqual([it.last, it.due, it.log.at(-1).a, it.log.at(-1).day], ['2026-10-27', '2027-01-27', 'Checked OK', '2026-10-01']);
  // A set-date item takes its next date with the check.
  add(s, 'Q2', { code: 'MHE-01', kind: 'epj', every: 0, last: null, due: '2026-10-20' });
  assert.equal(check(s, 'Q2', { day: '2026-10-20', result: 'ok', due: '2027-04-20' }), null);
  assert.equal(s.equipment.items.Q2.due, '2027-04-20');
});

test('equipment: edit and move; a new interval moves the due date', () => {
  const s = initialState(); add(s, 'Q1'); add(s, 'Q2', { code: 'LAD-03' });
  const up = (payload, id = 'Q1') => apply(s, ev('equip.update', { equip: id }, payload));
  const it = s.equipment.items.Q1;
  assert.equal(up({ name: 'Step ladder, 3 step' }).code, 'unchanged');
  assert.equal(up({ code: 'lad-03' }).code, 'exists');
  assert.equal(up({ x: 1500, y: 900, loc: 'near A9 S2' }), null);
  assert.deepEqual([it.x, it.y, it.loc, it.log.at(-1).a], [1500, 900, 'near A9 S2', 'Moved']);
  assert.equal(up({ every: 6 }), null);
  assert.deepEqual([it.due, it.log.at(-1).a], ['2027-01-14', 'Edited']);
  assert.equal(up({ due: '2026-12-01' }), null, 'a booked date overrides');
  assert.equal(it.due, '2026-12-01');
  assert.equal(up({ kind: 'forklift', code: 'MHE-09' }), null);
  assert.deepEqual([it.kind, it.code], ['forklift', 'MHE-09']);
});

test('equipment: a manager removes it with a reason; its history stays and it can come back', () => {
  const s = initialState(); add(s, 'Q1'); check(s, 'Q1', { day: '2026-10-24', result: 'ok' });
  const rm = (payload, id = 'Q1') => apply(s, ev('equip.remove', { equip: id }, payload, MGR));
  assert.equal(rm({ why: 'because' }).code, 'invalid_event');
  assert.equal(rm({ why: 'retired', note: 'replaced by LAD-04' }), null);
  const it = s.equipment.items.Q1;
  assert.deepEqual([it.removed.why, it.removed.note, it.log.length], ['retired', 'replaced by LAD-04', 3]);
  assert.equal(rm({ why: 'retired' }).code, 'unchanged');
  assert.equal(check(s, 'Q1', { day: '2026-10-25', result: 'ok' }).code, 'removed');
  assert.equal(liveEquipment(s.equipment).length, 0);
  // Its code is free again, so it can only come back once that is sorted.
  assert.equal(add(s, 'Q2', { code: 'LAD-01' }), null);
  assert.equal(apply(s, ev('equip.restore', { equip: 'Q1' }, {}, MGR)).code, 'exists');
  apply(s, ev('equip.update', { equip: 'Q2' }, { code: 'LAD-04' }));
  assert.equal(apply(s, ev('equip.restore', { equip: 'Q1' }, {}, MGR)), null);
  assert.deepEqual([it.removed, it.log.at(-1).a], [null, 'Restored']);
  assert.equal(apply(s, ev('equip.restore', { equip: 'Q1' }, {}, MGR)).code, 'unchanged');
});

test('equipment: where an item stands today', () => {
  const it = { out: null, due: '2026-11-07' };
  assert.equal(daysUntil('2026-11-07', '2026-10-24'), 14);
  assert.equal(equipStatus(it, '2026-10-24'), 'soon');
  assert.equal(equipStatus(it, '2026-10-23'), 'ok');
  assert.equal(equipStatus(it, '2026-11-08'), 'late');
  assert.equal(equipStatus({ out: null, due: null }, '2026-10-24'), 'none');
  assert.equal(equipStatus({ out: { since: '2026-10-01' }, due: '2027-01-01' }, '2026-10-24'), 'out');
});
