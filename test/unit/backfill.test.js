import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeycodes, parseReportByLocation, reviewRows, compareCounts, readyPayload } from '../../shared/backfill.js';

test('report paste splits by location and skips APNs and headers', () => {
  const text = `STORE 1241 STOCKROOM REPORT
LOCATION KEYCODE APN
7012 43166022 9300633001234 Bath towel 5pk
7012 43199310 9300633001241 Gift wrap
7014 42345501 9300633001258 Bath mat
Location: 7016
43006311 9300633001265 Kettle
43006311 dup line
----`;
  assert.deepEqual(parseReportByLocation(text), { 7012: ['43166022', '43199310'], 7014: ['42345501'], 7016: ['43006311'] });
  assert.deepEqual(parseKeycodes('43166022, 9300633001234 and 431993'), ['43166022', '9300633001234', '431993']);
});

test('compare: add, delete, match, incorrect and the ready payload', () => {
  const sub = { codes: { 43166022: { scanned: true }, 43199310: { scanned: true }, 43006311: { scanned: true } }, incorrect: ['43006311'] };
  const system = ['43166022', '43199310', '42345501'];
  assert.deepEqual(reviewRows(sub, system).map(r => [r.code, r.status]), [['43006311', 'add'], ['42345501', 'delete'], ['43166022', 'match'], ['43199310', 'match']]);
  const c = compareCounts(sub, system);
  assert.equal(c.match, 2); assert.equal(c.add, 1); assert.equal(c.delete, 1); assert.equal(c.incorrect, 1); assert.equal(c.expected, 3); assert.equal(c.scannedCount, 2); assert.equal(c.pct, 67, 'K2B: 2 matched of max(2 real scans, 3 system)');
  assert.deepEqual(readyPayload(sub, system), { codes: { 42345501: false }, incorrect: ['43006311'] });
  assert.equal(compareCounts(sub, null).pct, null, 'no report, no accuracy');
  assert.deepEqual(reviewRows(sub, null).map(r => r.status), ['scanned', 'scanned', 'scanned']);
});
