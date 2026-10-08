import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { validateEvent } from '../../shared/validate.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, actor = { role: 'floor', device: 'PHONE-1', owner: false }) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor, at: new Date().toISOString(), v: 1,
});

test('anyone in the store suggests a rename or a flag; each needs its detail', () => {
  const s = initialState();
  assert.equal(validateEvent(ev('map.edit.suggest', { edit: 'e1abc' }, { shelf: 'a16 s1', kind: 'rename', to: 'Kitchen' })), null);
  assert.deepEqual(CATALOGUE['map.edit.suggest'].roles.sort(), ['dock', 'floor', 'manager', 'stockroom']);
  assert.deepEqual(CATALOGUE['map.edit.resolve'].roles, ['manager']);
  for (const [p, why] of [[{ shelf: 'A1', kind: 'move' }, 'kind'], [{ shelf: ' ', kind: 'flag', note: 'x' }, 'shelf'], [{ shelf: 'A1', kind: 'rename' }, 'rename needs to'], [{ shelf: 'A1', kind: 'flag', note: '  ' }, 'flag needs a note']]) {
    assert.equal(apply(s, ev('map.edit.suggest', { edit: 'e-' + why.replace(/\W/g, '') }, p))?.code, 'invalid_event', why);
  }
  assert.equal(apply(s, ev('map.edit.suggest', { edit: 'e1abc' }, { shelf: 'a16 s1', kind: 'rename', to: '  Kitchen   gadgets ', floor: 'ground' })), null);
  assert.deepEqual(s.mapedits.e1abc, { shelf: 'A16 S1', kind: 'rename', to: 'Kitchen gadgets', note: '', floor: 'ground', at: s.mapedits.e1abc.at, by: 'PHONE-1', status: 'open', resolvedAt: null, resolvedBy: null, reply: '' });
  assert.equal(apply(s, ev('map.edit.suggest', { edit: 'e1abc' }, { shelf: 'B2', kind: 'flag', note: 'x' }))?.code, 'exists');
  assert.equal(Object.keys(s.mapedits).length, 1, 'refused suggestions leave nothing behind');
});

test('the owner or a manager accepts or declines once', () => {
  const s = initialState();
  apply(s, ev('map.edit.suggest', { edit: 'e2abc' }, { shelf: 'K12', kind: 'flag', note: 'Bay is now on the other side' }));
  assert.equal(apply(s, ev('map.edit.resolve', { edit: 'nope' }, { status: 'accepted' }))?.code, 'not_found');
  assert.equal(apply(s, ev('map.edit.resolve', { edit: 'e2abc' }, { status: 'done' }))?.code, 'invalid_event');
  assert.equal(apply(s, ev('map.edit.resolve', { edit: 'e2abc' }, { status: 'accepted', note: 'in 4.5' }, { role: 'manager', device: 'x', owner: true })), null);
  assert.deepEqual([s.mapedits.e2abc.status, s.mapedits.e2abc.resolvedBy, s.mapedits.e2abc.reply], ['accepted', 'owner', 'in 4.5']);
  assert.equal(apply(s, ev('map.edit.resolve', { edit: 'e2abc' }, { status: 'declined' }))?.code, 'invalid_event', 'already accepted');
});
