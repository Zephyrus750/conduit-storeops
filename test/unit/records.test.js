// A keycode's life, the history lists and CSV, from the projection shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { productLife, historyRows, toCsv, HISTORY_KINDS } from '../../shared/records.js';

const state = {
  backfill: { subs: {
    '7012:2026-09-17': { bay: '7012', date: '2026-09-17', status: 'submitted', codes: { 43166022: { scanned: true }, 43199310: { scanned: true } }, incorrect: [], metrics: { expected: 11, scanned: 10, match: 10, accuracy: 91, incorrect: 0 }, readyAt: '2026-09-17T02:00:00+00:00', submittedDoneAt: '2026-09-17T03:00:00+00:00' },
    '7014:2026-09-18': { bay: '7014', date: '2026-09-18', status: 'pending', codes: { 42345501: { scanned: true }, 43166022: { scanned: false } }, incorrect: ['43166022'] },
    '7016:2026-09-18': { bay: '7016', date: '2026-09-18', status: 'corrected', codes: { 43166022: { scanned: true } }, incorrect: [], metrics: { expected: 1, scanned: 1, match: 1, accuracy: 100, incorrect: 0 }, readyAt: '2026-09-18T01:00:00+00:00' },
  }, requested: {}, claims: {} },
  adjustments: { '2026-09-18': { 43302210: { qty: -6, name: 'Paper plates 20 pk', location: '7014', confirmed: true, addedAt: '2026-09-18T01:04:00+00:00' }, 43166022: { qty: -1, name: 'Mug, "blue"', location: '', confirmed: false, addedAt: '2026-09-18T01:05:00+00:00' } } },
  cages: { BSN1: { ring: 'overstock', location: 'D3', items: { 43166022: 4 }, sweeps: [], status: 'open', created: '2026-09-16T00:00:00+00:00', seen: '2026-09-19T00:00:00+00:00' }, BSN2: { ring: 'new-lines', location: null, items: { 99: 1 }, sweeps: [{}], status: 'closed', created: '', seen: '' } },
};

test('productLife: bays newest first with what happened there, adjustments, cages, the last date', () => {
  const L = productLife(state, '43166022');
  assert.deepEqual(L.visits.map(v => [v.bay, v.date, v.status, v.scanned, v.incorrect]), [['7014', '2026-09-18', 'pending', false, true], ['7016', '2026-09-18', 'corrected', true, false], ['7012', '2026-09-17', 'submitted', true, false]]);
  assert.equal(L.visits[2].accuracy, 91); assert.deepEqual(L.bays, ['7014', '7016', '7012']);
  assert.deepEqual(L.adjustments, [{ date: '2026-09-18', qty: -1, name: 'Mug, "blue"', location: '', confirmed: false, addedAt: '2026-09-18T01:05:00+00:00' }]);
  assert.deepEqual(L.cages, [{ cage: 'BSN1', ring: 'overstock', qty: 4, location: 'D3', status: 'open', seen: '2026-09-19T00:00:00+00:00' }]);
  assert.equal(L.name, 'Mug, "blue"'); assert.equal(L.last, '2026-09-19');
  const none = productLife(state, '99999999');
  assert.deepEqual([none.visits, none.adjustments, none.cages, none.last, none.name], [[], [], [], null, null]);
  assert.equal(productLife({}, '4316-6022').keycode, '43166022', 'non-digits are dropped, empty state is fine');
});

test('historyRows: backfill keeps the record (not pending), cages and adjustments flatten, unknown kind is null', () => {
  const b = historyRows(state, 'backfill');
  assert.deepEqual(b.map(r => r.bay), ['7016', '7012']); assert.equal(b[1].codes, 2); assert.equal(b[1].auto, false);
  const c = historyRows(state, 'cages');
  assert.deepEqual(c.map(r => [r.cage, r.keycodes, r.units, r.sweeps]), [['BSN1', 1, 4, 0], ['BSN2', 1, 1, 1]]);
  const a = historyRows(state, 'adjustments');
  assert.deepEqual(a.map(r => r.keycode), ['43166022', '43302210']);
  assert.equal(historyRows(state, 'manifests'), null); assert.deepEqual(HISTORY_KINDS, ['backfill', 'cages', 'adjustments']);
});

test('toCsv quotes commas and quotes, writes booleans as yes/no, empty gives a header when asked', () => {
  const csv = toCsv(historyRows(state, 'adjustments'));
  assert.equal(csv.split('\n')[0], 'date,keycode,qty,name,location,confirmed,addedAt');
  assert.match(csv, /2026-09-18,43166022,-1,"Mug, ""blue""",,no,/);
  assert.match(csv, /,yes,/);
  assert.equal(toCsv([], ['a', 'b']), 'a,b\n'); assert.equal(toCsv([]), '');
});
