import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { gs1Parse, gtinCheck } from '../../shared/gs1.js';
import { inSweep, sweepCount } from '../../shared/reducers/stockroom.js';

let clock = Date.parse('2026-10-05T00:00:00Z');
const ev = (type, entity, payload = {}) => ({ type, entity, payload, at: new Date(clock += 60_000).toISOString(), actor: { device: 'phone-1' } });
const ok = (s, e) => assert.equal(apply(s, e), null, `${e.type} rejected`);

test('GS1: item barcodes and SSCCs with check digits; bracketed and raw element strings', () => {
  assert.equal(gtinCheck('9300633603120'), true); assert.equal(gtinCheck('9300633603123'), false); assert.equal(gtinCheck('4006381333931'), true);
  assert.deepEqual(gs1Parse('9300633603120'), { gtin: '9300633603120' });
  assert.deepEqual(gs1Parse('(01)09300633603120(10)LOT7'), { gtin: '9300633603120' }, 'GTIN-14 with a leading 0 is the EAN-13');
  assert.deepEqual(gs1Parse(']C10109300633603120'), { gtin: '9300633603120' });
  assert.deepEqual(gs1Parse('036000291452'), { gtin: '0036000291452' }, 'UPC-A kept as EAN-13');
  assert.deepEqual(gs1Parse('(00)093123450000000012'), { sscc: '093123450000000012' });
  assert.equal(gs1Parse('43307685'), null, 'eight digits is a keycode, never an EAN-8');
  assert.equal(gs1Parse('hello'), null);
});

test('cage log, parking on the map, moves and re-tagging', () => {
  const s = initialState();
  ok(s, ev('cage.create', { cage: 'CG1' }, { ring: 'overstock' }));
  ok(s, ev('cage.scan', { cage: 'CG1' }, { keycode: '43307685', qty: 4 }));
  ok(s, ev('cage.park', { cage: 'CG1' }, { location: 'boh a3', x: 120.44, y: 80, floor: 'boh' }));
  assert.deepEqual([s.cages.CG1.location, s.cages.CG1.x, s.cages.CG1.floor], ['BOH A3', 120.4, 'boh']);
  ok(s, ev('cage.park', { cage: 'CG1' }, { location: 'Aisle 2' }));
  assert.equal(s.cages.CG1.x, undefined, 'a typed move drops the old map point');
  assert.deepEqual(s.cages.CG1.log.map(l => l.k), ['open', 'in', 'park', 'move']);
  assert.equal(s.cages.CG1.log[3].d, 'BOH A3 → AISLE 2');
  ok(s, ev('cage.create', { cage: 'CG2' }, { ring: 'new-lines' }));
  assert.equal(apply(s, ev('cage.retag', { cage: 'CG1' }, { to: 'CG2' }))?.code, 'cage_exists');
  ok(s, ev('cage.retag', { cage: 'CG1' }, { to: 'cg9' }));
  assert.equal(s.cages.CG1, undefined); assert.equal(s.cages.CG9.items['43307685'], 4); assert.equal(s.cages.CG9.log.at(-1).k, 'retag');
});

test('sweeps: seen, moved where the sweeper stands, missing, then lost after two, found again', () => {
  const s = initialState();
  for (const [id, loc] of [['A', 'Z1'], ['B', 'Z1'], ['C', 'Z2']]) { ok(s, ev('cage.create', { cage: id }, { ring: 'overstock' })); ok(s, ev('cage.park', { cage: id }, { location: loc })); }
  ok(s, ev('cage.sweepStart', { sweep: 'S1' }));
  assert.equal(apply(s, ev('cage.sweepStart', { sweep: 'S2' }))?.code, 'sweep_open');
  ok(s, ev('cage.sweep', { cage: 'A' }, { session: 'S1', location: 'Z1' }));
  ok(s, ev('cage.sweep', { cage: 'B' }, { session: 'S1', location: 'z3' }));
  assert.equal(s.cages.B.location, 'Z3');
  ok(s, ev('cage.sweepEnd', { sweep: 'S1' }));
  const h = s.cageSweeps.history[0];
  assert.deepEqual([h.seen, h.total, h.missing, h.lost], [2, 3, ['C'], []]); assert.deepEqual(h.moved, [{ id: 'B', from: 'Z1', to: 'Z3' }]);
  assert.deepEqual(s.cages.C.missing.n, 1); assert.equal(s.cages.C.lost, undefined);
  assert.equal(apply(s, ev('cage.sweep', { cage: 'A' }, { session: 'S1' }))?.code, 'not_found', 'a finished sweep takes no more');
  ok(s, ev('cage.sweepStart', { sweep: 'S2' })); ok(s, ev('cage.sweep', { cage: 'A' }, { session: 'S2' })); ok(s, ev('cage.sweep', { cage: 'B' }, { session: 'S2' })); ok(s, ev('cage.sweepEnd', { sweep: 'S2' }));
  assert.equal(s.cages.C.lost, true); assert.deepEqual(s.cageSweeps.history[1].lost, ['C']);
  ok(s, ev('cage.sweepStart', { sweep: 'S3' })); ok(s, ev('cage.sweep', { cage: 'C' }, { session: 'S3', location: 'Z2' }));
  assert.deepEqual([s.cages.C.lost, s.cages.C.missing], [false, null]); assert.deepEqual(s.cageSweeps.current.found, ['C']);
  assert.equal(s.cages.C.log.filter(l => l.k === 'found').length, 1);
});

test('pairing an item barcode with its keycode', () => {
  const s = initialState();
  ok(s, ev('cage.pair', { apn: '(01)09300633603120' }, { keycode: '43307685' }));
  assert.equal(s.apnPairs['9300633603120'].kc, '43307685');
  assert.equal(apply(s, ev('cage.pair', { apn: '9300633603123' }, { keycode: '43307685' }))?.code, 'invalid_event', 'bad check digit');
  assert.equal(apply(s, ev('cage.pair', { apn: '9300633603120' }, { keycode: 'x' }))?.code, 'invalid_event');
});

test('cage keycodes are 6 to 9 digits; each log line keeps the role that wrote it (decision 41, 10 Nov 2026)', () => {
  const s = initialState();
  const as = (e, actor) => ({ ...e, actor });
  ok(s, as(ev('cage.create', { cage: 'CG7' }, { ring: 'overstock' }), { device: 'phone-1', role: 'stockroom' }));
  ok(s, as(ev('cage.scan', { cage: 'CG7' }, { keycode: '110148905', qty: 1 }), { device: 'phone-1', role: 'stockroom' }));
  for (const kc of ['12345', '1234567890', '9300633603120', '43307685x']) {
    const before = JSON.stringify(s);
    assert.equal(apply(s, ev('cage.scan', { cage: 'CG7' }, { keycode: kc, qty: 1 }))?.code, 'invalid_event', kc);
    assert.equal(JSON.stringify(s), before, `${kc}: refused, nothing changed`);
  }
  ok(s, as(ev('cage.park', { cage: 'CG7' }, { location: 'BOH A1' }), { device: 'desk-1', role: 'manager' }));
  ok(s, as(ev('cage.close', { cage: 'CG7' }), { device: 'owner-pc', role: null, owner: true }));
  assert.deepEqual(s.cages.CG7.log.map(l => l.role), ['stockroom', 'stockroom', 'manager', 'owner']);
});

test('a sweep counts only its own sightings, and Finish misses only cages open when it began', () => {
  const s = initialState();
  ok(s, ev('cage.create', { cage: 'A1' }, { ring: 'overstock' }));
  ok(s, ev('cage.create', { cage: 'A2' }, { ring: 'overstock' }));
  ok(s, ev('cage.sweepStart', { sweep: 'sw1' }));
  ok(s, ev('cage.sweep', { cage: 'A1' }, { session: 'sw1' }));
  ok(s, ev('cage.sweepEnd', { sweep: 'sw1' }));
  ok(s, ev('cage.sweepStart', { sweep: 'sw2' }));
  ok(s, ev('cage.create', { cage: 'A3' }, { ring: 'overstock' }));
  ok(s, ev('cage.sweepEnd', { sweep: 'sw2' }));
  const h = s.cageSweeps.history.at(-1);
  assert.equal(h.seen, 0, 'the second sweep saw nothing itself');
  assert.equal(h.total, 2, 'A3 is not on a sweep that began before it opened');
  assert.deepEqual(h.missing.sort(), ['A1', 'A2'], 'A3 opened after the sweep began');
});

test('one count for a running sweep: a cage opened since it began counts only once seen', () => {
  const s = initialState();
  ok(s, ev('cage.create', { cage: 'B1' }, { ring: 'overstock' }));
  ok(s, ev('cage.create', { cage: 'B2' }, { ring: 'overstock' }));
  ok(s, ev('cage.sweepStart', { sweep: 'sw1' }));
  ok(s, ev('cage.create', { cage: 'B3' }, { ring: 'overstock' }));
  ok(s, ev('cage.create', { cage: 'B4' }, { ring: 'overstock' }));
  const cur = () => s.cageSweeps.current;
  assert.deepEqual(sweepCount(s.cages, cur()), { n: 0, total: 2 }, 'B3 and B4 are not on it');
  assert.equal(inSweep(cur(), 'B3', s.cages.B3), false);
  ok(s, ev('cage.sweep', { cage: 'B3' }, { session: 'sw1' }));
  ok(s, ev('cage.sweep', { cage: 'B1' }, { session: 'sw1' }));
  assert.deepEqual(sweepCount(s.cages, cur()), { n: 2, total: 3 }, 'B3 counts once seen');
  ok(s, ev('cage.sweepEnd', { sweep: 'sw1' }));
  const h = s.cageSweeps.history.at(-1);
  assert.deepEqual([h.seen, h.total, h.missing], [2, 3, ['B2']], 'the summary counts as the phone did; B4 is not missed');
});
