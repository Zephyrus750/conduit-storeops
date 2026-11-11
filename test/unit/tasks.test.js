import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE, AREA_PROJECTIONS } from '../../shared/catalogue.js';
import { validateEvent } from '../../shared/validate.js';
import { retain } from '../../shared/retain.js';
import { dueOn, isoDow, walkCounts, walkPhotos, walkKey, LIST_CAP } from '../../shared/reducers/tasks.js';
import { ulid } from '../../shared/ulid.js';

const DAY = '2026-11-11';   // a Wednesday
const AT = '2026-11-11T09:58:00+08:00';
const ev = (type, entity, payload = {}, { device = 'M1', role = 'manager', at = AT } = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role, device, owner: false }, at, v: 1,
});
const ITEMS = [{ id: 'a1', t: 'Aisles clear of cartons and cages' }, { id: 'a2', t: 'Endcaps full and faced' }, { id: 'a3', t: 'Lights working, or already raised' }];
const LIST = { name: 'Department walk', area: 'dept', dept: 'h2', who: 'Homewares manager', days: [1, 2, 3, 4, 5], due: '10:00', items: ITEMS };
const set = (s, payload = {}, id = 'L1') => apply(s, ev('task.list.set', { list: id }, { ...LIST, ...payload }));
const W = { list: 'L1', day: DAY };
const item = (s, id, payload, opts) => apply(s, ev('task.walk.item', { ...W, item: id }, payload, opts));
const PHOTO = '01JCDE0000000000000000PH01', PHOTO2 = '01JCDE0000000000000000PH02';

test('tasks: Floor events, managers only, every store device holds them', () => {
  for (const t of ['task.list.set', 'task.list.remove', 'task.walk.start', 'task.walk.item', 'task.walk.done']) {
    assert.equal(CATALOGUE[t].area, 'floor', t); assert.deepEqual(CATALOGUE[t].roles, ['manager'], t);
  }
  assert.ok(AREA_PROJECTIONS.floor.includes('tasks'));
  assert.deepEqual(CATALOGUE['task.walk.item'].entity, ['list', 'day', 'item']);
  // The envelope: a walk names its checklist, its day and (for an answer) its item.
  const bad = { ...ev('task.walk.item', { list: 'L1', day: DAY }, { a: 'y' }) };
  assert.equal(validateEvent(bad).message, 'entity.item is required');
  assert.equal(validateEvent({ ...ev('task.walk.item', { ...W, item: 'a1' }, {}) }).message, 'payload.a is required');
});

test('tasks: a checklist is written whole and checked first; a bad one changes nothing', () => {
  const s = initialState();
  assert.equal(set(s, { name: '  ' }).code, 'invalid_event');
  assert.equal(set(s, { area: 'office' }).code, 'invalid_event');
  assert.equal(set(s, { area: 'dept', dept: '' }).code, 'invalid_event', 'a department checklist names its department');
  assert.equal(set(s, { days: [] }).code, 'invalid_event');
  assert.equal(set(s, { days: [0, 8] }).code, 'invalid_event');
  assert.equal(set(s, { due: '25:00' }).code, 'invalid_event');
  assert.equal(set(s, { items: [] }).code, 'invalid_event');
  assert.equal(set(s, { items: [{ id: 'a1', t: 'One' }, { id: 'a1', t: 'Two' }] }).code, 'invalid_event', 'each item has its own id');
  assert.equal(set(s, { items: [{ id: 'a1', t: ' ' }] }).code, 'invalid_event');
  assert.equal(set(s, { items: Array.from({ length: 41 }, (_, i) => ({ id: 'i' + i, t: 'Item ' + i })) }).code, 'invalid_event');
  assert.deepEqual(s.tasks.lists, {}, 'nothing was half-written');
  assert.equal(set(s, { days: [3, 1, 3], who: '  Homewares\tmanager ', area: 'dept', dept: 'H2' }), null);
  const l = s.tasks.lists.L1;
  assert.deepEqual([l.name, l.area, l.dept, l.who, l.days, l.due, l.items.length, l.added, l.by, l.removed], ['Department walk', 'dept', 'h2', 'Homewares manager', [1, 3], '10:00', 3, AT, 'M1', null]);
  assert.equal(set(s, { days: [1, 3], area: 'dept', dept: 'h2' }).code, 'unchanged', 'the same checklist again is not logged');
  assert.equal(set(s, { area: 'store', due: '' }), null);
  const l2 = s.tasks.lists.L1;
  assert.deepEqual([l2.area, l2.dept, l2.due, l2.added, l2.updated], ['store', '', '', AT, AT], 'the edit replaced it, its first time kept');
  // Removed: off the list; written again, it is back.
  assert.equal(apply(s, ev('task.list.remove', { list: 'L1' })), null);
  assert.equal(s.tasks.lists.L1.removed.at, AT);
  assert.equal(apply(s, ev('task.list.remove', { list: 'L1' })).code, 'not_found');
  assert.equal(set(s), null); assert.equal(s.tasks.lists.L1.removed, null);
  for (let i = 2; i <= LIST_CAP; i++) assert.equal(set(s, {}, 'L' + i), null);
  assert.equal(set(s, {}, 'L99').code, 'too_large');
});

test('tasks: due on its weekdays', () => {
  assert.equal(isoDow('2026-11-09'), 1); assert.equal(isoDow('2026-11-15'), 7);
  const l = { days: [1, 3, 5] };
  assert.equal(dueOn(l, '2026-11-11'), true); assert.equal(dueOn(l, '2026-11-12'), false);
  assert.equal(dueOn({ ...l, removed: { at: AT } }, '2026-11-11'), false);
});

test('tasks: a walk starts on its own day with the checklist as it is; ✓ and ✗ with a note, photo and where it went', () => {
  const s = initialState(); set(s);
  assert.equal(apply(s, ev('task.walk.start', { list: 'L9', day: DAY })).code, 'not_found');
  assert.equal(apply(s, ev('task.walk.start', { list: 'L1', day: '2026-11-10' })).code, 'invalid_event', 'yesterday’s walk is not started today');
  assert.equal(item(s, 'a1', { a: 'y' }).code, 'not_found', 'no walk yet');
  assert.equal(apply(s, ev('task.walk.start', W)), null);
  assert.equal(apply(s, ev('task.walk.start', W, {}, { device: 'M2' })).code, 'exists');
  const w = s.tasks.walks[walkKey('L1', DAY)];
  assert.deepEqual([w.name, w.who, w.due, w.items.length, w.started, w.by, w.done], ['Department walk', 'Homewares manager', '10:00', 3, AT, 'M1', null]);
  // The checklist edited mid-walk: the walk keeps what it started with.
  set(s, { items: [{ id: 'z9', t: 'Something new' }] });
  assert.deepEqual(w.items.map(i => i.id), ['a1', 'a2', 'a3']);
  assert.equal(item(s, 'z9', { a: 'y' }).code, 'not_found');
  assert.equal(item(s, 'a1', { a: 'maybe' }).code, 'invalid_event');
  assert.equal(item(s, 'a1', { a: 'y', photo: 'not-an-id' }).code, 'invalid_event');
  assert.equal(item(s, 'a1', { a: 'y', sent: { to: 'note' } }).code, 'invalid_event', 'only a ✗ is sent anywhere');
  assert.equal(item(s, 'a2', { a: 'n', sent: { to: 'backfill', bay: ' ' } }).code, 'invalid_event');
  assert.equal(item(s, 'a2', { a: 'n', sent: { to: 'issue', issue: 'm404' } }).code, 'not_found', 'the issue must be the store’s');
  assert.equal(item(s, 'a2', { a: 'n', sent: { to: 'backfill', bay: '7012', kc: '12' } }).code, 'invalid_event');
  assert.deepEqual(w.answers, {}, 'nothing was half-written');
  assert.equal(item(s, 'a1', { a: 'y' }), null);
  assert.equal(item(s, 'a1', { a: 'y' }).code, 'unchanged');
  assert.equal(item(s, 'a2', { a: 'n', note: 'Aisle 7 endcap, empty hooks. Bath towels.', photo: PHOTO, sent: { to: 'backfill', bay: ' 7012 ', kc: '43166022' } }), null);
  assert.deepEqual(w.answers.a2, { a: 'n', at: AT, by: 'M1', note: 'Aisle 7 endcap, empty hooks. Bath towels.', photo: PHOTO, sent: { to: 'backfill', bay: '7012', kc: '43166022' } });
  // A ✗ raised as a Maintenance issue names an issue the store has.
  apply(s, ev('issue.log', { issue: 'm1' }, { cat: 'light', title: 'Lights working, or already raised', sev: 1 }));
  assert.equal(item(s, 'a3', { a: 'n', photo: PHOTO2, sent: { to: 'issue', issue: 'm1' } }), null);
  assert.deepEqual(walkCounts(w), { of: 3, answered: 3, y: 1, n: 2, photos: 2 });
  assert.deepEqual(walkPhotos(w).sort(), [PHOTO, PHOTO2]);
  // Where it went stays with the item: a correction cannot send it again elsewhere, and a ✓ keeps the record.
  assert.equal(item(s, 'a2', { a: 'n', sent: { to: 'issue', issue: 'm1' } }).code, 'exists');
  assert.equal(item(s, 'a2', { a: 'n', note: 'Faced up, towels on the way', sent: { to: 'backfill', bay: '7012', kc: '43166022' } }), null);
  assert.equal(w.answers.a2.photo, undefined, 'the answer is written whole: a retake without a photo drops it');
  assert.equal(item(s, 'a2', { a: 'y' }), null);
  assert.deepEqual([w.answers.a2.a, w.answers.a2.sent.bay], ['y', '7012']);
});

test('tasks: done once every item is answered; a second done is a no-op; answers can still be corrected', () => {
  const s = initialState(); set(s); apply(s, ev('task.walk.start', W));
  const w = s.tasks.walks[walkKey('L1', DAY)];
  item(s, 'a1', { a: 'y' }); item(s, 'a2', { a: 'n', note: 'Empty hooks', sent: { to: 'note' } });
  assert.equal(apply(s, ev('task.walk.done', W)).code, 'incomplete');
  assert.equal(w.done, null);
  item(s, 'a3', { a: 'y' });
  const later = '2026-11-11T10:18:00+08:00';
  assert.equal(apply(s, ev('task.walk.done', W, {}, { at: later })), null);
  assert.equal(w.done, later);
  assert.equal(apply(s, ev('task.walk.done', W, {}, { at: '2026-11-11T10:30:00+08:00' })), null);
  assert.equal(w.done, later, 'the first done stands');
  assert.equal(item(s, 'a3', { a: 'n', note: 'One tube out over aisle 7' }), null, 'a correction is a new event');
  assert.equal(walkCounts(w).n, 2);
  assert.equal(apply(s, ev('task.walk.done', { list: 'L1', day: '2026-11-12' })).code, 'not_found');
});

test('tasks: retention keeps a walk whole for 14 days, then its ✗ and photos, and drops it after 90', () => {
  const s = initialState(); set(s);
  const old = (day, at) => {
    apply(s, ev('task.walk.start', { list: 'L1', day }, {}, { at }));
    for (const [id, a, extra] of [['a1', 'y', {}], ['a2', 'n', { note: 'Gap' }], ['a3', 'y', { photo: PHOTO }]]) apply(s, ev('task.walk.item', { list: 'L1', day, item: id }, { a, ...extra }, { at }));
  };
  old('2026-11-01', '2026-11-01T09:00:00+08:00'); old('2026-10-20', '2026-10-20T09:00:00+08:00'); old('2026-08-01', '2026-08-01T09:00:00+08:00');
  apply(s, ev('task.list.remove', { list: 'L1' }, {}, { at: '2026-09-01T09:00:00+08:00' }));
  apply(s, ev('task.list.set', { list: 'L2' }, LIST));
  apply(s, ev('task.list.remove', { list: 'L2' }));
  const done = retain(s, DAY);
  assert.deepEqual([done.walks, done.walksTrimmed, done.lists], [1, 1, 1]);
  assert.deepEqual(Object.keys(s.tasks.walks).sort(), ['L1:2026-10-20', 'L1:2026-11-01']);
  const t = s.tasks.walks['L1:2026-10-20'];
  assert.deepEqual([t.trimmed, t.n, t.items.map(i => i.id), Object.keys(t.answers)], [true, { of: 3, y: 2, n: 1 }, ['a2', 'a3'], ['a2', 'a3']]);
  assert.deepEqual(walkCounts(t), { of: 3, answered: 3, y: 2, n: 1, photos: 1 });
  assert.deepEqual(walkPhotos(t), [PHOTO], 'its photo is still listed');
  assert.equal(apply(s, ev('task.walk.item', { list: 'L1', day: '2026-10-20', item: 'a2' }, { a: 'y' })).code, 'invalid_event', 'too old to change');
  assert.equal(s.tasks.walks['L1:2026-11-01'].trimmed, undefined);
  assert.deepEqual(Object.keys(s.tasks.lists), ['L2'], 'a list removed over 60 days ago leaves; its walks keep its name');
});
