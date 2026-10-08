import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeycodeText, parseRequested, reportRange, freshBand, freshLabel, reportGap, pasteDelta } from '../../shared/backfill.js';

test('a keycode list: one per line, 6 to 9 digits, report furniture and item barcodes ignored', () => {
  const r = parseKeycodeText('KEYCODE  DESCRIPTION\n43166022\n 431-99310 \n110012345\n9300633001230\n&110STORE: 1187\n43166022\n');
  assert.deepEqual(r.codes, ['43166022', '43199310', '110012345']);
  assert.equal(r.mode, 'lines'); assert.equal(r.duplicates, 1); assert.deepEqual(r.leftovers, []);
});

test('a glued blob is cut on 8-digit boundaries and the remainder reported', () => {
  const r = parseKeycodeText('431660224319931043307685123');
  assert.deepEqual(r.codes, ['43166022', '43199310', '43307685']);
  assert.equal(r.mode, 'glued'); assert.deepEqual(r.leftovers, ['123']);
});

test('a requested list takes bays by any separator, needs a digit, caps at 100', () => {
  assert.deepEqual(parseRequested('7012, 7014;7012\nA16S1  hello  7020'), ['7012', '7014', 'A16S1', '7020']);
  assert.equal(parseRequested(Array.from({ length: 150 }, (_, i) => 7000 + i).join(' ')).length, 100);
});

test('the range comes from the report header, else the locations', () => {
  assert.deepEqual(reportRange('STORE 1241\nLocations 7001 – 7090\n', { 7012: [] }), { from: '7001', to: '7090', n: 1 });
  assert.deepEqual(reportRange('no header', { 7031: [], 7004: [], 7012: [] }), { from: '7004', to: '7031', n: 3 });
  assert.equal(reportRange('', {}), null);
});

test('freshness has three tiers and the gap note warns when the report is behind the scans', () => {
  assert.deepEqual([freshBand(0), freshBand(9.9), freshBand(10), freshBand(29), freshBand(30)], ['g', 'g', 'a', 'a', 'r']);
  assert.deepEqual([freshLabel(0.4), freshLabel(12)], ['just now', '12m ago']);
  const at = Date.parse('2026-10-04T08:00:00Z');
  assert.equal(reportGap(at, '2026-10-04T08:02:00Z', at + 5 * 60000).warn, false, 'scanned 2 minutes after, 5 minutes old');
  assert.equal(reportGap(at, '2026-10-04T08:04:00Z', at + 5 * 60000).warn, true, 'scanned 4 minutes after the report');
  assert.equal(reportGap(at, '2026-10-04T07:50:00Z', at + 31 * 60000).warn, true, 'report 31 minutes old');
});

test('a re-paste shows what changed for each bay it shares with the last paste', () => {
  const d = pasteDelta({ 7012: ['1', '2', '3'], 7014: ['9'] }, { 7012: ['2', '3', '4'], 7014: ['9'], 7020: ['5'] });
  assert.deepEqual(d, { 7012: { added: ['4'], removed: ['1'] } });
});
