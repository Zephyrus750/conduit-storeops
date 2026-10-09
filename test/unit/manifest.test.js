// The DC Manifest Report parser: metadata, consolidations aggregated from
// carton rows and full-pallet rows, department mix, the numeric-column
// diagnosis, the generic fallback, and the documents built from a parse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifestSheets, manifestDoc, attachConsols, manifestCheck } from '../../shared/manifest.js';

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

test('the upload preview: what was read, what was left out, and what blocks a publish', () => {
  const r = parseManifestSheets(report);
  assert.equal(r.rowsRead, 5); assert.deepEqual(r.skipped, { numericCons: 0, badKeycode: 1, other: 0 });
  const ok = manifestCheck(r, { storeNo: '1241', index: {}, today: '2026-09-08', mpc: 0.5 });
  assert.deepEqual(ok.stats, { consols: 2, cartons: 6, keycodes: 4, units: 29, lines: 4, workMins: 3, rowsRead: 5 });
  assert.equal(ok.blocking, false);
  assert.deepEqual(ok.checks.map(c => c.level), ['warn'], 'only the unreadable keycode row');
  assert.match(ok.checks[0].text, /1 row had no readable keycode/);
  assert.deepEqual(ok.depts[0], ['084', 4]);
  const other = manifestCheck(r, { storeNo: '2033', index: { 7031482: { publishedAt: '2026-09-07T01:00:00Z', truck: '2026-09-07-T2' } }, today: '2026-10-05' });
  assert.equal(other.blocking, true);
  const t = other.checks.map(c => c.text).join(' | ');
  assert.match(t, /for store 1241, not 2033/); assert.match(t, /already published \(2026-09-07\) and attached to Truck 2/); assert.match(t, /29 days ago/);
  const mixed = parseManifestSheets([{ name: 'S', rows: [['Manifest No', '', ''], ['Consolidation', 'Carton', 'Keycode', 'Description', 'Dept', 'Qty'], [C1, '000000000000000001', '43307685', 'x', '24', 6], [93008012601804382, 1, '43307686', 'x', '24', 6], ['x', '9341234567890123', '', '', '', '']] }]);
  assert.deepEqual(mixed.skipped, { numericCons: 1, badKeycode: 0, other: 1 });
  const m = manifestCheck(mixed, {}).checks.map(c => c.text).join(' | ');
  assert.match(m, /stored as a number/); assert.match(m, /matched no layout/); assert.match(m, /no manifest number/);
});

test('a plain sheet attaches: consolidation numbers lose spaces and dashes, anything else is skipped and said', async () => {
  const { initialState, apply } = await import('../../shared/reducers.js');
  const r = parseManifestSheets([{ name: 'Sheet1', rows: [['Consol No', 'Cartons'], ['6018 0439 0', 12], ['601-804-391', 5], ['ABC123', 3], [601804392, 7]] }]);
  assert.deepEqual(r.consols.map(c => [c.id, c.cartons]), [['601804390', 12], ['601804391', 5], ['601804392', 7]]);
  assert.equal(r.skipped, 1);
  assert.ok(manifestCheck(r, {}).checks.some(c => /1 row was skipped/.test(c.text)));
  const s = initialState(), ev = (type, entity, payload) => ({ id: '01J' + String(Math.random()).slice(2, 25).padEnd(23, '0').toUpperCase().replace(/[ILOU]/g, '0'), store: '1241', area: 'backdock', type, entity, payload, actor: { role: 'dock', device: 'x', owner: false }, at: '2026-09-07T08:00:00+08:00', v: 1 });
  assert.equal(apply(s, ev('truck.create', { truck: '2026-09-07-T1' }, {})), null);
  assert.equal(apply(s, ev('manifest.attach', { truck: '2026-09-07-T1' }, { manNo: 'G-1', consols: attachConsols(manifestDoc(r, { manNo: 'G-1' })) })), null);
});
