// October audit 1.5 and 1.6: a bay with no report is unscored and left out
// of averages; a late scan puts a readied bay back in review; the phone says
// when it has finished a bay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';
import { storeKpis } from '../../shared/kpis.js';
import { visitsOf, trendsOf } from '../../shared/trends.js';
import { historyRows } from '../../shared/records.js';
import { retain } from '../../shared/retain.js';

let clock = Date.parse('2026-10-08T00:00:00Z');
const ev = (type, entity, payload = {}, device = 'P1') => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role: 'stockroom', device, owner: false }, at: new Date(clock += 60_000).toISOString(), v: 1,
});
const DAY = '2026-10-08';
const A = { bay: '7023', date: DAY }, B = { bay: '7024', date: DAY }, C = { bay: '7025', date: DAY };

test('a bay readied or auto-closed with no report is unscored; a reported bay still scores', () => {
  const s = initialState();
  apply(s, ev('submission.update', A, { codes: { 43000001: true, 43000002: true } }));
  apply(s, ev('submission.ready', A));
  assert.deepEqual(s.backfill.subs[`7023:${DAY}`].metrics, { expected: null, scanned: 2, match: null, accuracy: null, incorrect: 0 }, 'not 100%');
  apply(s, ev('submission.open', B)); apply(s, ev('submission.submit', B, { auto: true }));
  assert.equal(s.backfill.subs[`7024:${DAY}`].metrics.accuracy, null, 'an empty auto-closed bay is not 0%');
  apply(s, ev('submission.update', C, { codes: { 43000001: true, 43000003: false } }));
  apply(s, ev('submission.ready', C, { system: ['43000001', '43000003'] }));
  assert.equal(s.backfill.subs[`7025:${DAY}`].metrics.accuracy, 50);

  const k = storeKpis(s, { today: DAY, caps: ['stockroom'] }).backfill;
  assert.equal(k.accuracy, 50, 'the console averages scored bays only');
  const t = trendsOf(visitsOf(s.backfill.subs, { today: DAY, tz: 'Australia/Perth' }), DAY);
  assert.equal(t.avgAcc, 50, 'Trends too');
  const rows = historyRows(s, 'backfill');
  assert.equal(rows.length, 3); assert.equal(rows.find(r => r.bay === '7023').accuracy, null);
});

test('an imported bay keeps the null score K2B gave it', () => {
  const s = initialState();
  apply(s, ev('submission.update', A, { codes: { 43000001: true } }));
  apply(s, ev('submission.ready', A, { metrics: { expected: null, scanned: 1, match: null, accuracy: null, incorrect: 0 } }));
  assert.deepEqual(s.backfill.subs[`7023:${DAY}`].metrics, { expected: null, scanned: 1, match: null, accuracy: null, incorrect: 0 });
});

test('older bays that merged the report as system-only codes still score', () => {
  const s = initialState();
  apply(s, ev('submission.update', A, { codes: { 43000001: true, 43000002: false } }));
  apply(s, ev('submission.ready', A));
  assert.equal(s.backfill.subs[`7023:${DAY}`].metrics.accuracy, 50);
});

test('a late scan puts a Ready or Submitted bay back in review; a code it already had does not', () => {
  const s = initialState(), key = `7023:${DAY}`;
  apply(s, ev('submission.update', A, { codes: { 43000001: true }, sent: true }));
  apply(s, ev('submission.ready', A, { system: ['43000001', '43000002'] }));
  apply(s, ev('submission.update', A, { codes: { 43000001: true } }, 'P2'));
  assert.equal(s.backfill.subs[key].status, 'corrected', 'a repeat of a code it had changes nothing');
  apply(s, ev('submission.update', A, { incorrect: ['43000001'] }));
  assert.equal(s.backfill.subs[key].status, 'corrected', 'desk edits do not reopen');
  apply(s, ev('submission.update', A, { codes: { 43000002: true } }, 'P2'));
  const sub = s.backfill.subs[key];
  assert.deepEqual([sub.status, sub.metrics, sub.lateScans, sub.sentAt], ['pending', null, 1, null]);
  apply(s, ev('submission.ready', A, { system: sub.system }));
  assert.equal(s.backfill.subs[key].metrics.match, 2, 'readied again, the late code counts');
  apply(s, ev('submission.submit', A));
  apply(s, ev('submission.update', A, { codes: { 43000009: true } }, 'P2'));
  assert.equal(s.backfill.subs[key].status, 'pending', 'a submitted bay reopens too');
  assert.equal(s.backfill.subs[key].lateScans, 2);
});

test('a submit sent before a late scan reopened the bay is ignored', () => {
  const s = initialState(), key = `7023:${DAY}`;
  apply(s, ev('submission.update', A, { codes: { 43000001: true } }));
  apply(s, ev('submission.ready', A, { system: ['43000001'] }));
  const stale = ev('submission.submit', A);
  apply(s, ev('submission.update', A, { codes: { 43000002: true } }));
  assert.equal(apply(s, stale), null); assert.equal(s.backfill.subs[key].status, 'pending');
});

test('the phone marks a bay sent; a new scan clears it', () => {
  const s = initialState(), key = `7023:${DAY}`;
  apply(s, ev('submission.update', A, { codes: { 43000001: true } }));
  assert.equal(s.backfill.subs[key].sentAt ?? null, null);
  apply(s, ev('submission.update', A, { sent: true }));
  assert.ok(s.backfill.subs[key].sentAt);
  apply(s, ev('submission.update', A, { codes: { 43000002: true } }));
  assert.equal(s.backfill.subs[key].sentAt, null, 'still scanning');
});

test('a trimmed bay takes no more scans', () => {
  const s = initialState(), old = { bay: '7023', date: '2026-09-01' };
  apply(s, ev('submission.update', old, { codes: { 43000001: true } }));
  apply(s, ev('submission.ready', old, { system: ['43000001'] }));
  retain(s, DAY);
  assert.ok(s.backfill.subs['7023:2026-09-01'].trimmed);
  const before = JSON.stringify(s);
  assert.equal(apply(s, ev('submission.update', old, { codes: { 43000002: true } })).code, 'record_trimmed');
  assert.equal(JSON.stringify(s), before);
});
