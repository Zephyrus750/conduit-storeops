import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';
import { rolloverDue } from '../../shared/backfill.js';

const ev = (type, entity, payload = {}, extra = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role: 'stockroom', device: 'P1', owner: false }, at: '2026-09-07T08:00:00+08:00', v: 1, ...extra,
});
const k = { bay: '7023', date: '2026-09-07' };

test('cages carry a ring colour and reject an unknown one; park uppercases', () => {
  const s = initialState();
  assert.equal(apply(s, ev('cage.create', { cage: 'BSN1240417' }, { ring: 'overstock' })), null);
  assert.equal(apply(s, ev('cage.create', { cage: 'BSN1240418' }, { ring: 'pink' })).code, 'invalid_event');
  assert.equal(apply(s, ev('cage.scan', { cage: 'BSN1240417' }, { keycode: '42977636', qty: 12 })), null);
  assert.equal(apply(s, ev('cage.park', { cage: 'BSN1240417' }, { location: 'aisle 2' })), null);
  assert.equal(s.cages.BSN1240417.location, 'AISLE 2');
  assert.equal(apply(s, ev('cage.close', { cage: 'BSN1240417' })), null);
  assert.equal(apply(s, ev('cage.sweep', { cage: 'BSN1240417' })).code, 'not_found');
});

test('submission: per-code merge, explicit remove, ready computes metrics, statuses are pending/corrected/submitted', () => {
  const s = initialState();
  assert.equal(apply(s, ev('submission.update', k, { codes: { 42977636: true, 43307685: false, 43307690: false } })), null);
  assert.equal(apply(s, ev('submission.update', k, { codes: { 43307685: true }, remove: ['43307690'], incorrect: ['43307685'] })), null);
  const sub = s.backfill.subs['7023:2026-09-07'];
  assert.deepEqual(Object.keys(sub.codes), ['42977636', '43307685']);
  assert.equal(sub.codes['43307685'].scanned, true);
  // Report for the bay: 42977636 and 43307699 (never scanned); 43307685 is an
  // extra scan the reviewer marked incorrect, so it drops out of the ratio.
  assert.equal(apply(s, ev('submission.update', k, { codes: { 43307699: false } })), null);
  assert.equal(apply(s, ev('submission.ready', k, { system: ['42977636', '43307699'] }, { at: '2026-09-07T09:00:00+08:00' })), null);
  assert.equal(sub.status, 'corrected');
  assert.deepEqual(sub.metrics, { expected: 2, scanned: 1, match: 1, accuracy: 50, incorrect: 1 });
  assert.equal(apply(s, ev('submission.submit', k, { auto: true }, { at: '2026-09-07T17:00:00+08:00' })), null);
  assert.equal(sub.status, 'submitted'); assert.equal(sub.autoSubmitted, true);
});

test('reopen rule: a stale submit after a reopen does not close the bay', () => {
  const s = initialState();
  apply(s, ev('submission.open', k));
  apply(s, ev('submission.reopen', k, {}, { at: '2026-09-07T10:00:00+08:00' }));
  assert.equal(apply(s, ev('submission.submit', k, {}, { at: '2026-09-07T09:30:00+08:00' })), null);
  assert.equal(s.backfill.subs['7023:2026-09-07'].status, 'pending');
  assert.equal(apply(s, ev('submission.submit', k, {}, { at: '2026-09-07T10:30:00+08:00' })), null);
  assert.equal(s.backfill.subs['7023:2026-09-07'].status, 'submitted');
});

test('rename refuses a taken bay; requested is a list; claims are a soft lock', () => {
  const s = initialState();
  apply(s, ev('submission.open', k));
  apply(s, ev('submission.open', { bay: '7024', date: k.date }));
  assert.equal(apply(s, ev('submission.rename', k, { newBay: '7024' })).code, 'bay_taken');
  assert.equal(apply(s, ev('submission.rename', k, { newBay: '7025' })), null);
  assert.ok(s.backfill.subs['7025:2026-09-07']); assert.equal(s.backfill.subs['7023:2026-09-07'], undefined);
  assert.equal(apply(s, ev('submission.request', { bay: '7030', date: k.date })), null);
  assert.deepEqual(s.backfill.requested[k.date], ['7030']);
  assert.equal(apply(s, ev('submission.request', { bay: '7030', date: k.date }, { remove: true })), null);
  assert.deepEqual(s.backfill.requested[k.date], []);
  assert.equal(apply(s, ev('submission.claim', { bay: '7025', date: k.date })), null);
  assert.equal(apply(s, ev('submission.claim', { bay: '7025', date: k.date }, {}, { actor: { role: 'stockroom', device: 'P2' } })).code, 'claimed');
  assert.equal(apply(s, ev('submission.claim', { bay: '7025', date: k.date }, { release: true })), null);
  assert.equal(s.backfill.claims['7025'], undefined);
});

test('adjustments are per day per keycode, qty stored negative, remove deletes', () => {
  const s = initialState();
  assert.equal(apply(s, ev('adjustment.set', { keycode: '12', date: '2026-09-07' }, { qty: 3 })).code, 'invalid_event');
  assert.equal(apply(s, ev('adjustment.set', { keycode: '42977636', date: '2026-09-07' }, { qty: 3, location: 'k12s1', confirmed: true })), null);
  assert.deepEqual(s.adjustments['2026-09-07']['42977636'], { qty: -3, name: '', location: 'K12S1', confirmed: true, addedAt: '2026-09-07T08:00:00+08:00' });
  assert.equal(apply(s, ev('adjustment.set', { keycode: '42977636', date: '2026-09-07' }, { qty: -5 })), null);
  assert.equal(s.adjustments['2026-09-07']['42977636'].qty, -5);
  assert.equal(apply(s, ev('adjustment.remove', { keycode: '42977636', date: '2026-09-07' })), null);
  assert.equal(s.adjustments['2026-09-07']['42977636'], undefined);
});

test('day list walkers 1..4 with a known source', () => {
  const s = initialState();
  assert.equal(apply(s, ev('daylist.set', { date: '2026-09-07' }, { walkers: 5 })).code, 'invalid_event');
  assert.equal(apply(s, ev('daylist.set', { date: '2026-09-07' }, { walkers: 2, source: 'snapshot', excluded: ['7001'] })), null);
  assert.deepEqual(s.daylist['2026-09-07'].excluded, ['7001']);
});

test('accuracy: codes never found pull it down (K2B formula), with or without a report list', () => {
  const s = initialState();
  const codes = {}; for (let i = 0; i < 10; i++) codes[String(43000000 + i)] = i < 5;
  apply(s, ev('submission.update', k, { codes }));
  apply(s, ev('submission.ready', k));
  assert.deepEqual(s.backfill.subs['7023:2026-09-07'].metrics, { expected: 10, scanned: 5, match: 5, accuracy: 50, incorrect: 0 });
  const k2 = { bay: '7024', date: '2026-09-07' };
  apply(s, ev('submission.update', k2, { codes: { 43000001: true, 43000002: true, 43000009: true } }));
  apply(s, ev('submission.ready', k2, { system: ['43000001', '43000002'] }));
  assert.deepEqual(s.backfill.subs['7024:2026-09-07'].metrics, { expected: 2, scanned: 3, match: 2, accuracy: 67, incorrect: 0 }, 'an extra scan is over-scanning');
});

test('ready honours metrics carried by the importer', () => {
  const s = initialState();
  apply(s, ev('submission.update', k, { codes: { 42977636: true } }));
  apply(s, ev('submission.ready', k, { metrics: { expected: 11, scanned: 10, match: 10, accuracy: 91, incorrect: 0 } }));
  assert.deepEqual(s.backfill.subs['7023:2026-09-07'].metrics, { expected: 11, scanned: 10, match: 10, accuracy: 91, incorrect: 0 });
});

test('tombstones: a queued scan older than the reviewer’s removal is refused; a later scan brings the code back', () => {
  const s = initialState();
  apply(s, ev('submission.update', k, { codes: { 42977636: true, 43307685: true } }, { at: '2026-09-07T08:00:00+08:00' }));
  apply(s, ev('submission.update', k, { remove: ['43307685'] }, { at: '2026-09-07T09:00:00+08:00' }));
  const sub = s.backfill.subs['7023:2026-09-07'];
  assert.equal(apply(s, ev('submission.update', k, { codes: { 43307685: true } }, { at: '2026-09-07T00:30:00Z' })).code, 'removed_by_reviewer', '08:30 AWST is before the removal');
  assert.equal(sub.codes['43307685'], undefined);
  assert.equal(apply(s, ev('submission.update', k, { codes: { 43307685: true, 43307699: true } }, { at: '2026-09-07T08:45:00+08:00' })), null, 'a mixed update keeps its new codes');
  assert.equal(sub.codes['43307685'], undefined); assert.ok(sub.codes['43307699']);
  assert.equal(apply(s, ev('submission.update', k, { codes: { 43307685: true } }, { at: '2026-09-07T10:00:00+08:00' })), null);
  assert.ok(sub.codes['43307685']); assert.equal(sub.removed['43307685'], undefined);
});

test('rollover: earlier-day pending and ready bays are due, today and submitted ones are not', () => {
  const s = initialState();
  for (const [bay, date] of [['7001', '2026-09-06'], ['7002', '2026-09-06'], ['7003', '2026-09-06'], ['7004', '2026-09-07']]) apply(s, ev('submission.open', { bay, date }));
  apply(s, ev('submission.ready', { bay: '7002', date: '2026-09-06' }));
  apply(s, ev('submission.ready', { bay: '7003', date: '2026-09-06' })); apply(s, ev('submission.submit', { bay: '7003', date: '2026-09-06' }));
  const due = rolloverDue(s.backfill, '2026-09-07');
  assert.deepEqual(due, [{ bay: '7001', date: '2026-09-06' }, { bay: '7002', date: '2026-09-06' }]);
  for (const entity of due) assert.equal(apply(s, ev('submission.submit', entity, { auto: true }, { at: '2026-09-07T00:01:00+08:00' })), null);
  assert.equal(s.backfill.subs['7001:2026-09-06'].status, 'submitted'); assert.equal(s.backfill.subs['7001:2026-09-06'].autoSubmitted, true);
  assert.deepEqual(rolloverDue(s.backfill, '2026-09-07'), []);
});

test('phone adjustment keeps the system SOH as qty and the shelf count as evidence', () => {
  const s = initialState();
  apply(s, ev('adjustment.set', { keycode: '42977636', date: '2026-09-07' }, { qty: -4, counted: 3 }));
  assert.equal(s.adjustments['2026-09-07']['42977636'].qty, -4); assert.equal(s.adjustments['2026-09-07']['42977636'].counted, 3);
});
