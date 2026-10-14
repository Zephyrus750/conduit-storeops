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

test('Field Mode names an unnamed shelf by its floor and position, and says it came from Field Mode', () => {
  const s = initialState();
  const base = { kind: 'name', shelf: '', to: 'H28', floor: 'ground', pos: { x: 120, y: 40 }, near: 'h27', src: 'field' };
  for (const [p, why] of [[{ ...base, to: '' }, 'name needs to'], [{ ...base, pos: null }, 'needs a position'], [{ ...base, floor: '' }, 'needs a floor'], [{ ...base, pos: { x: 'a', y: 1 } }, 'position is numbers']]) {
    assert.equal(apply(s, ev('map.edit.suggest', { edit: 'e-' + why.replace(/\W/g, '') }, p))?.code, 'invalid_event', why);
  }
  assert.equal(apply(s, ev('map.edit.suggest', { edit: 'f1abc' }, base, { role: 'manager', device: 'PHONE-2', owner: false })), null);
  const x = s.mapedits.f1abc;
  assert.deepEqual([x.kind, x.shelf, x.to, x.floor, x.pos, x.near, x.src], ['name', '', 'H28', 'ground', { x: 120, y: 40 }, 'H27', 'field']);
  apply(s, ev('map.edit.suggest', { edit: 'f2abc' }, { shelf: 'A16 S2', kind: 'rename', to: 'A17 S2', src: 'elsewhere' }));
  assert.equal(s.mapedits.f2abc.src, undefined, 'only Field Mode is named as a source');
});

test('applyEdit renames a shelf or names an unnamed one in the published source; a flag changes nothing', async () => {
  const { applyEdit, parseCode } = await import('../../shared/mapedits.js');
  const doc = () => ({ floors: [
    { id: 'ground', shelves: [{ name: 'A16', subname: 'S2', x: 0, y: 0 }, { name: 'A16', subname: 'S1', x: 0, y: 30 }, { name: '', x: 120, y: 40 }] },
    { id: 'mezz', shelves: [{ name: 'A16', subname: 'S2', x: 5, y: 5 }, { name: '', x: 120, y: 40 }] },
  ] });
  assert.deepEqual(parseCode('a17-s2'), { name: 'A17', subname: 'S2' }); assert.equal(parseCode('Kitchen gadgets'), null);
  let d = doc(); assert.equal(applyEdit(d, { kind: 'rename', shelf: 'A16 S2', to: 'A17 S2', floor: 'ground' }), 1);
  assert.deepEqual([d.floors[0].shelves[0].name, d.floors[0].shelves[0].subname, d.floors[1].shelves[0].name], ['A17', 'S2', 'A16'], 'only that floor');
  assert.equal(d.floors[0].shelves[1].name + d.floors[0].shelves[1].subname, 'A16S1', 'a shelf, never its run');
  d = doc(); assert.equal(applyEdit(d, { kind: 'rename', shelf: 'A16 S2', to: 'Kitchen gadgets', floor: 'ground' }), 0, 'a free-text name is made by hand');
  d = doc(); assert.equal(applyEdit(d, { kind: 'name', to: 'H28', floor: 'ground', pos: { x: 120, y: 40 } }), 1);
  assert.deepEqual([d.floors[0].shelves[2].name, d.floors[0].shelves[2].subname, d.floors[1].shelves[1].name], ['H28', '', '']);
  d = doc(); assert.equal(applyEdit(d, { kind: 'name', to: 'H28', floor: 'ground', pos: { x: 60, y: 40 } }), 0, 'nothing unnamed there');
  d = doc(); assert.equal(applyEdit(d, { kind: 'flag', shelf: 'A16 S2', note: 'gone' }), 0);
});
