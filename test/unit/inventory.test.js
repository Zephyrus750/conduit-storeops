import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOffsiteSheets, guessColumns, readGeneric, registerSummary, consolidate, heatBands, loadTrends, clearanceDiff, isFixture, OFFSITE_CAP } from '../../shared/inventory.js';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';

const AT = '2026-10-08T01:00:00.000Z';
const ev = (type, entity, payload, at = AT) => ({ type, entity, payload, at, actor: { device: 'd1', roles: ['floor'] } });

test('off-site master list: header found under a title, ranges expand, products read, the example sheet skipped', () => {
  const sheets = [
    { name: 'Example', rows: [['Sent Date', 'Pallet No'], ['1/1/2026', '1']] },
    { name: 'October', rows: [['Off-site storage register'], [], ['Sent Date', 'Time', 'Pallet No', 'Description', 'REQ', 'Call back date', 'Received', 'Comment'],
      ['01/10/2026', '08:30', '51', '43166022 x 12, 43199310 x 6 Christmas lights', 'Seasonal', '05/10/2026', '', ''],
      ['02/10/2026', '09:10', '52-54', 'FIXTURES gondola shelves', 'Fixture team', '20/10/2026', '', ''],
      [46297, '', '55', 'loose 42977636', 'Toys', '', 'yes', 'urgent']] },
    { name: 'Received', rows: [['Sent Date', 'Pallet No', 'Description'], ['20/09/2026', '40', '43006311 x 8']] },
  ];
  const { rows, diag } = readOffsiteSheets(sheets);
  assert.equal(diag, '');
  assert.deepEqual(rows.map(r => r.pid), ['51', '52', '53', '54', '55', '40']);
  const r51 = rows[0];
  assert.deepEqual([r51.sent, r51.time, r51.cb, r51.req, r51.title], ['2026-10-01', '08:30', '2026-10-05', 'Seasonal', 'Christmas lights']);
  assert.deepEqual(r51.products, [{ kc: '43166022', q: 12 }, { kc: '43199310', q: 6 }]);
  assert.ok(isFixture(rows[1]) && isFixture(rows[3]));
  assert.equal(rows[4].sent, '2026-10-02', 'a spreadsheet serial date reads as a day');
  assert.deepEqual(rows[4].products, [{ kc: '42977636', q: 0 }]);
  assert.equal(rows[4].rec, 'yes'); assert.equal(rows[5].rec, 'yes', 'a sheet named for received pallets marks them back');
  assert.match(readOffsiteSheets([{ name: 'S', rows: [['a', 'b']] }]).diag, /header row/);
});

test('generic load: columns guessed from the header, overridable, lines merged per pallet and keycode', () => {
  const header = ['LPN', 'Item Number', 'Item Description', 'Qty', 'Department'];
  const map = guessColumns(header);
  assert.deepEqual(map, { pallet: 0, key: 1, desc: 2, qty: 3, dept: 4 });
  const rows = [['P1', '43166022', 'Lights', '4', '38'], ['P1', '43166022', 'Lights', '2', '38'], ['P2', '42977636', 'Cars', '10', '056'], ['', '1', 'x', '1', '1'], ['P3', '', 'x', '1', '1']];
  const r = readGeneric(rows, map);
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.pallets, [{ pid: 'P1', items: [{ k: '43166022', d: 'Lights', q: 6, dept: '038' }] }, { pid: 'P2', items: [{ k: '42977636', d: 'Cars', q: 10, dept: '056' }] }]);
  assert.match(readGeneric(rows, { ...map, key: -1 }).diag, /Keycode/);
  assert.deepEqual(guessColumns(['SSCC', 'SKU', 'Name', 'Units', 'Class']), { pallet: 0, key: 1, desc: 2, qty: 3, dept: 4 });
});

test('register summary: returns by callback date, overdue first, fixtures counted, received apart', () => {
  const rows = { a: { pid: 'a', cb: '2026-10-01', rec: '' }, b: { pid: 'b', cb: '2026-10-12', rec: '' }, c: { pid: 'c', cb: '', rec: '', sent: '2026-09-01', req: 'Fixture team' }, d: { pid: 'd', cb: '2026-10-02', rec: '2026-10-03' }, e: { pid: 'e', cb: '2026-11-30', rec: '' } };
  const s = registerSummary(rows, '2026-10-08');
  assert.deepEqual([s.live, s.received, s.fixtures, s.nextCallback], [4, 1, 1, '2026-10-12']);
  assert.deepEqual(s.overdue.map(r => r.pid), ['a']); assert.deepEqual(s.dueSoon.map(r => r.pid), ['b']);
  assert.deepEqual(s.byCallback.map(r => r.pid), ['a', 'b', 'e', 'c']);
});

test('consolidation and heat: units per department, banded on the square root of units per shelf', () => {
  const cons = consolidate([{ items: [{ dept: '038', q: 10 }, { dept: '040', q: 1 }] }, { items: [{ dept: '038', q: 30 }, { q: 2 }] }]);
  assert.deepEqual(cons, [['038', 40, 2], ['???', 2, 1], ['040', 1, 1]]);
  const shelves = { '038': ['A1', 'A2'], '040': ['B1'], '???': [] };
  const bands = heatBands(cons, d => shelves[d]);
  assert.equal(bands.get('A1'), 5); assert.equal(bands.get('A2'), 5);
  assert.equal(bands.get('B1'), 2, 'sqrt(1/20) ≈ .22 lands in band 2');
  assert.equal(heatBands([['x', 0]], () => ['Z']).size, 0);
});

test('trends: Monday weeks, gaps filled, callouts and a trend once four weeks are active', () => {
  const load = (day, n, dept = '038') => ({ recvDate: day, pallets: Array.from({ length: n }, (_, i) => ({ pid: 'p' + i, items: [{ dept, q: 5 }] })) });
  const loads = { a: load('2026-09-14', 2), b: load('2026-09-21', 2), c: load('2026-09-30', 6), d: load('2026-10-07', 6, '040') };
  const t = loadTrends(loads, { weeks: 6, today: '2026-10-08' });
  assert.equal(t.weeks.length, 6); assert.equal(t.weeks[0].wk, '2026-08-31'); assert.equal(t.weeks.at(-1).wk, '2026-10-05');
  assert.equal(t.weeks[2].cartons, 2, 'the week of 14 Sep');
  assert.deepEqual([t.callouts.cartons, t.callouts.loads, t.callouts.perLoad, t.callouts.busiest], [16, 4, 4, '2026-09-28']);
  assert.equal(t.callouts.trend, 200);
  assert.equal(t.weeks.at(-1).depts['040'], 30);
  assert.equal(loadTrends({ a: load('2026-10-01', 1) }, { weeks: 4, today: '2026-10-08' }).callouts.trend, null);
});

test('clearance: newly on clearance or a lower price, against a previous day only', () => {
  const prev = { a: { price: 10, clr: false, day: '2026-10-07' }, b: { price: 10, clr: false, day: '2026-10-07' }, c: { price: 5, clr: false, day: '2026-10-08' } };
  const cur = { a: { price: 6, was: 10, clr: true }, b: { price: 8, clr: false }, c: { price: 2, clr: true }, d: { price: 1, clr: true } };
  const out = clearanceDiff(prev, cur, '2026-10-08');
  assert.deepEqual(out.map(x => [x.kc, x.kind, x.prevPrice, x.price]), [['a', 'clr', 10, 6], ['b', 'drop', 10, 8]]);
});

test('inventory events: catalogued for the floor, validated, and rejected without touching state', () => {
  for (const t of ['inventory.offsite.set', 'inventory.offsite.add', 'inventory.offsite.update', 'inventory.load.add', 'inventory.load.status', 'inventory.load.remove']) assert.equal(CATALOGUE[t].area, 'floor', t);
  const s = initialState();
  assert.equal(apply(s, ev('inventory.offsite.set', {}, { rows: [{ pid: '51', cb: '2026-10-20', products: [{ kc: '43166022', q: 12 }, { kc: 'bad', q: 1 }] }, { pid: '' }], src: 'list.xlsx' })), null);
  assert.deepEqual(Object.keys(s.inventory.offsite), ['51']); assert.equal(s.inventory.offsite['51'].products.length, 1); assert.equal(s.inventory.offsiteSrc, 'list.xlsx');
  const before = JSON.stringify(s.inventory);
  assert.equal(apply(s, ev('inventory.offsite.update', { pid: '51' }, { rec: '8 Oct' })).code, 'invalid_payload');
  assert.equal(apply(s, ev('inventory.offsite.update', { pid: '99' }, { rec: '' })).code, 'not_found');
  assert.equal(apply(s, ev('inventory.offsite.add', { pid: '51' }, {})).code, 'exists');
  assert.equal(apply(s, ev('inventory.offsite.set', {}, { rows: Array.from({ length: OFFSITE_CAP + 1 }, (_, i) => ({ pid: String(i) })) })).code, 'too_large');
  assert.equal(JSON.stringify(s.inventory), before, 'rejected events leave the register as it was');
  assert.equal(apply(s, ev('inventory.offsite.update', { pid: '51' }, { rec: '2026-10-08', note: 'back early' })), null);
  assert.equal(s.inventory.offsite['51'].rec, '2026-10-08');
  assert.equal(apply(s, ev('inventory.offsite.add', { pid: '60' }, { desc: 'spare', cb: '2026-10-30' })), null);

  const pallets = [{ pid: 'P1', items: [{ k: '43166022', d: 'Lights', q: 6, dept: '038' }, { k: '1', q: 1, dept: 'x' }] }];
  assert.equal(apply(s, ev('inventory.load.add', { load: 'L1' }, { label: 'DC load', pallets, status: 'nope' })), null);
  assert.equal(s.inventory.loads.L1.status, 'incoming'); assert.equal(s.inventory.loads.L1.pallets[0].items[1].dept, '');
  assert.equal(apply(s, ev('inventory.load.add', { load: 'L2' }, { label: 'empty', pallets: [] })).code, 'invalid_payload');
  assert.equal(apply(s, ev('inventory.load.status', { load: 'L1' }, { status: 'gone' })).code, 'invalid_payload');
  assert.equal(apply(s, ev('inventory.load.status', { load: 'L1' }, { status: 'received' })), null);
  assert.equal(s.inventory.loads.L1.recvDate, '2026-10-08');
  assert.equal(apply(s, ev('inventory.load.remove', { load: 'L1' }, {})), null);
  assert.equal(apply(s, ev('inventory.load.remove', { load: 'L1' }, {})).code, 'not_found');
});

test('a load beyond the cap pushes out the oldest', () => {
  const s = initialState();
  for (let i = 0; i < 26; i++) apply(s, ev('inventory.load.add', { load: 'L' + i }, { label: 'L' + i, pallets: [{ pid: 'p', items: [{ k: '1', q: 1 }] }] }, `2026-10-0${1 + Math.floor(i / 10)}T0${i % 10}:00:00.000Z`));
  assert.equal(Object.keys(s.inventory.loads).length, 24); assert.ok(!s.inventory.loads.L0 && !s.inventory.loads.L1 && s.inventory.loads.L25);
});
