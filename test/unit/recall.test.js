import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE, AREA_PROJECTIONS } from '../../shared/catalogue.js';
import { toolForEvent } from '../../shared/tools.js';
import { retain } from '../../shared/retain.js';
import { recallOf, liveRecalls, RECALL_CAP } from '../../shared/reducers/recall.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, { device = 'M1', role = 'manager', at = '2026-10-25T09:00:00+08:00' } = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role, device, owner: false }, at, v: 1,
});
const R = 'RC1';
const add = (s, payload = {}, id = R) => apply(s, ev('recall.add', { recall: id }, { kind: 'recall', title: 'Bath toy set', kcs: ['43648803', '43648804'], apns: ['9341234567893'], ref: 'PR-2026-118', action: 'Return to the DC', ...payload }));

test('recalls: Floor events every device holds; managers keep the list, anyone records stock found', () => {
  for (const t of ['recall.add', 'recall.update', 'recall.status', 'recall.found', 'recall.bay.set']) { assert.equal(CATALOGUE[t].area, 'floor', t); assert.equal(toolForEvent(t)?.id, 'recalls', t); }
  for (const t of ['recall.add', 'recall.update', 'recall.status', 'recall.bay.set']) assert.deepEqual(CATALOGUE[t].roles, ['manager'], t);
  assert.deepEqual(CATALOGUE['recall.found'].roles, ['floor']);
  assert.ok(AREA_PROJECTIONS.floor.includes('recalls'));
});

test('recalls: a recall names its keycodes and barcodes; a bad one changes nothing', () => {
  const s = initialState();
  assert.equal(add(s, { kind: 'pulled' }).code, 'invalid_event');
  assert.equal(add(s, { title: '  ' }).code, 'invalid_event');
  assert.equal(add(s, { kcs: [] }).code, 'invalid_event');
  assert.equal(add(s, { kcs: ['4364880'.padEnd(9, '1')] }).code, 'invalid_event', 'nine digits is not a keycode');
  assert.equal(add(s, { apns: ['9341234567890'] }).code, 'invalid_event', 'a barcode must pass its check digit');
  assert.deepEqual(s.recalls.items, {}, 'nothing was half-written');
  assert.equal(add(s, { kcs: ['43648803', ' 43648803', '43648804'], apns: ['036000291452'] }), null);
  const r = s.recalls.items[R];
  assert.deepEqual([r.kind, r.status, r.kcs, r.apns, r.units, r.log.map(l => l.a)], ['recall', 'open', ['43648803', '43648804'], ['0036000291452'], 0, ['Added']]);
  assert.equal(add(s).code, 'exists');
  assert.equal(apply(s, ev('recall.update', { recall: R }, { title: 'Bath toy set' })).code, 'unchanged');
  assert.equal(apply(s, ev('recall.update', { recall: R }, { kcs: ['43648803'], reason: 'Small parts' })), null);
  assert.deepEqual([r.kcs, r.reason, r.title], [['43648803'], 'Small parts', 'Bath toy set'], 'a missing field keeps what is there');
});

test('recalls: statuses, stock found, and the recall bay', () => {
  const s = initialState(); add(s);
  const r = s.recalls.items[R];
  const found = (payload, opts = { device: 'T1', role: 'floor' }) => apply(s, ev('recall.found', { recall: R }, payload, opts));
  assert.equal(found({ kc: '42977636', n: 1 }).code, 'invalid_event', 'only this recall’s keycodes');
  assert.equal(found({ kc: '43648803', n: 0 }).code, 'invalid_event');
  assert.equal(found({ kc: '43648803', n: 3, where: 'Bay 7036' }), null);
  assert.deepEqual([r.status, r.units, r.found[0]], ['removing', 3, { t: '2026-10-25T09:00:00+08:00', by: 'T1', kc: '43648803', n: 3, where: 'Bay 7036' }], 'the first find starts the removal');
  assert.equal(apply(s, ev('recall.status', { recall: R }, { status: 'removed' })), null);
  assert.equal(found({ kc: '43648804', n: 1, where: 'A16 S2' }), null);
  assert.deepEqual([r.status, r.units], ['removing', 4], 'stock found after “all removed” puts it back to removing');
  assert.equal(apply(s, ev('recall.status', { recall: R }, { status: 'removing' })).code, 'unchanged');
  assert.equal(apply(s, ev('recall.status', { recall: R }, { status: 'gone' })).code, 'invalid_event');
  assert.equal(apply(s, ev('recall.status', { recall: R }, { status: 'closed' })), null);
  assert.equal(r.closedAt, '2026-10-25T09:00:00+08:00');
  assert.equal(found({ kc: '43648803', n: 1 }).code, 'closed');
  assert.deepEqual(r.log.map(l => l.a), ['Added', 'Found', 'All removed', 'Found', 'Closed']);
  assert.equal(apply(s, ev('recall.status', { recall: R }, { status: 'open' })), null);
  assert.deepEqual([r.status, r.closedAt, r.log.at(-1).a], ['open', null, 'Reopened']);
  assert.equal(apply(s, ev('recall.bay.set', {}, { bay: ' Returns cage, back dock ' })), null);
  assert.equal(s.recalls.bay, 'Returns cage, back dock');
  assert.equal(apply(s, ev('recall.bay.set', {}, { bay: 'Returns cage, back dock' })).code, 'unchanged');
});

test('recalls: a keycode or barcode finds the recall in force; a recall wins over a withdrawal; closed ones flag nothing', () => {
  const s = initialState();
  add(s, { kind: 'withdrawal', title: 'Mug', kcs: ['43000001', '43648803'], apns: [] }, 'W1');
  add(s);
  assert.equal(recallOf(s.recalls, '43648803').id, R, 'the recall, not the withdrawal');
  assert.equal(recallOf(s.recalls, '43000001').id, 'W1');
  assert.equal(recallOf(s.recalls, '9341234567893').id, R, 'by its item barcode');
  assert.equal(recallOf(s.recalls, '(01)09341234567893').id, R, 'inside a GS1 string');
  assert.equal(recallOf(s.recalls, '42977636'), null);
  apply(s, ev('recall.status', { recall: R }, { status: 'closed' }));
  assert.equal(recallOf(s.recalls, '9341234567893'), null, 'a closed recall flags nothing');
  assert.equal(recallOf(s.recalls, '43648803').id, 'W1');
  assert.deepEqual(liveRecalls(s.recalls).map(r => r.id), ['W1']);
});

test('recalls: closed ones leave the live state 180 days after closing; at most RECALL_CAP', () => {
  const s = initialState(); add(s);
  apply(s, ev('recall.status', { recall: R }, { status: 'closed' }, { at: '2026-03-01T09:00:00+08:00' }));
  add(s, { title: 'Still open' }, 'R2');
  retain(s, '2026-08-27');
  assert.ok(s.recalls.items[R], 'kept until 180 days have passed');
  retain(s, '2026-08-29');
  assert.deepEqual(Object.keys(s.recalls.items), ['R2']);
  for (let i = Object.keys(s.recalls.items).length; i < RECALL_CAP; i++) s.recalls.items[`F${i}`] = { id: `F${i}`, status: 'open', kcs: [], apns: [] };
  assert.equal(add(s, {}, 'R3').code, 'too_large');
});
