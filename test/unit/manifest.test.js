// The DC Manifest Report parser: metadata, consolidations aggregated from
// carton rows and full-pallet rows, department mix, the numeric-column
// diagnosis, the generic fallback, and the documents built from a parse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifestSheets, manifestDoc, attachConsols } from '../../shared/manifest.js';

const C1 = '093008012601804381', C2 = '093008012601804382';
const report = [{ name: 'Manifest Report', rows: [
  ['Kmart Distribution Centre', null, null],
  ['Manifest No', null, '7031482', null, 'Store', null, '1241'],
  ['Despatch Date', null, 46271, null, 'DC No', null, '4101533'],
  [],
  ['Consolidation', 'Carton', 'Keycode', 'Description', 'Dept', 'Qty'],
  [C1, '000000000000000001', '43307685', 'Wooden forks', '24', 6],
  [C1, '000000000000000001', '42977636', '12 pk diecast vehicles', '70', 2],
  [C1, '000000000000000002', '43307685', 'Wooden forks', '24', 6],
  [C1, '000000000000000003', '42977641', 'Pk 8 balloons assorted', '84', 12],
  [null, C2, '43302210', 'Paper plates 20 pk', '84', 3],          // full-pallet line: no carton id, shifted right
  [C2, '000000000000000009', 'not a keycode', 'skip', '1', 1],
  ['Total', null, null],
] }];

test('a Manifest Report parses: metadata, consolidations by last 9 digits, cartons, mix, items', () => {
  const r = parseManifestSheets(report);
  assert.equal(r.kind, 'report'); assert.equal(r.manNo, '7031482'); assert.equal(r.storeNo, '1241'); assert.equal(r.dcNo, '4101533'); assert.equal(r.despatch, '06/09/2026', 'Excel serial 46271');
  assert.equal(r.consols.length, 2);
  const a = r.consols.find(c => c.id === '601804381');
  assert.equal(a.cons, C1); assert.equal(a.cartons, 3, 'three distinct cartons');
  assert.deepEqual(a.mix.map(m => m[0]), ['024', '084', '070'], 'mix by carton majority then units');
  assert.equal(a.dept, '024/084/070');
  assert.deepEqual(a.items.map(i => [i.k, i.q, i.c, i.dept]), [['43307685', 12, 2, '024'], ['42977636', 2, 1, '070'], ['42977641', 12, 1, '084']]);
  assert.deepEqual(a.items[0].cc, ['000000000000000001', '000000000000000002']);
  const b = r.consols.find(c => c.id === '601804382');
  assert.equal(b.cartons, 3, 'a full-pallet line counts its qty as cartons'); assert.deepEqual(b.items.map(i => i.k), ['43302210']);
});

test('a numeric consolidation column is diagnosed, not parsed into wrong ids', () => {
  const r = parseManifestSheets([{ name: 'S', rows: [['Consolidation', 'Carton', 'Keycode', 'Description', 'Dept', 'Qty'], [93008012601804381, 1, '43307685', 'x', '24', 6]] }]);
  assert.equal(r.consols.length, 0); assert.match(r.diag, /formatted as a number/);
  const none = parseManifestSheets([{ name: 'S', rows: [['a', 'b'], [1, 2]] }]);
  assert.match(none.diag, /no “Consolidation” column/);
});

test('a plain sheet with consol and carton columns still reads', () => {
  const r = parseManifestSheets([{ name: 'Sheet1', rows: [['Consol', 'Cartons', 'Dept'], ['601804390', 12, 'K2'], ['601804390', 3, 'K2'], ['601804391', 5, 'H1']] }]);
  assert.equal(r.kind, 'generic'); assert.deepEqual(r.consols.map(c => [c.id, c.cartons, c.dept]), [['601804390', 15, 'K2'], ['601804391', 5, 'H1']]);
});

test('manifestDoc and attachConsols: the stored document keeps carton ids, the truck copy drops them', () => {
  const doc = manifestDoc(parseManifestSheets(report), { filename: 'Manifest Report 06-09.xls', by: 'desk-1' });
  assert.equal(doc.v, 1); assert.equal(doc.kind, 'report'); assert.equal(doc.manNo, '7031482'); assert.equal(doc.totalCartons, 6); assert.equal(doc.keycodes, 4); assert.equal(doc.filename, 'Manifest Report 06-09.xls');
  assert.ok(doc.consols[0].items[0].cc);
  const att = attachConsols(doc);
  assert.deepEqual(Object.keys(att[0]), ['id', 'cons', 'cartons', 'dept', 'mix', 'items']); assert.deepEqual(att[0].items[0], { k: '43307685', q: 12, dept: '024', c: 2 });
  assert.equal(manifestDoc({ consols: [{ cons: '093008012601804399', cartons: 4 }] }, { manNo: 'M-1' }).consols[0].id, '601804399');
});
