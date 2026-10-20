import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeycodes, parseReportByLocation, parseReportSoh, reviewRows, compareCounts, readyPayload, phoneCode, disputes } from '../../shared/backfill.js';

test('the report’s SOH column: the last number on each item’s line, by keycode', () => {
  const text = `STORE : 1241 Busselton                Page 1
LOCATION KEYCODE APN DESCRIPTION COLOUR STATUS PRICE SOH
7012 43166022 9300633001234 BATH TOWEL 5PK WHITE 0 12.00 -3
7012 43199310 9300633001241 PAPER PLATES 20 PK 0 5.00 14
Location : 7014
42345501 9300633001258 BATH MAT GREY 0 9.00 0
43006311 KETTLE 0 29.00`;
  assert.deepEqual(parseReportSoh(text), { 43166022: -3, 43199310: 14, 42345501: 0 }, 'a number in the description is not the SOH; a line with no SOH gives none');
  assert.deepEqual(Object.keys(parseReportByLocation(text)).sort(), ['7012', '7014'], 'the bays read as before');
});

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

test('phone codes as K2B checked them: 7–8 digit keycodes, 13-digit barcodes with a good check digit; disputes one digit apart', () => {
  assert.deepEqual(phoneCode('4297763'), { code: '4297763' });
  assert.deepEqual(phoneCode(' 42977636 '), { code: '42977636' });
  assert.deepEqual(phoneCode('9341107137079'), { code: '9341107137079' });
  assert.match(phoneCode('9341107137078').why, /check digit/);
  assert.match(phoneCode('123456').why, /6 digits/);
  assert.match(phoneCode('1234567890').why, /10 digits/);
  assert.match(phoneCode('').why, /not a keycode/);
  assert.deepEqual(disputes(['42977636', '42977686', '12345678', '1234567', '42977636']), { 42977636: ['42977686'], 42977686: ['42977636'] });
  assert.deepEqual(disputes(['1234567', '1234568']), {}, 'only 8-digit keycodes, as K2B');
});
