import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

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
  assert.equal(apply(s, ev('submission.ready', k, {}, { at: '2026-09-07T09:00:00+08:00' })), null);
  assert.equal(sub.status, 'corrected');
  assert.deepEqual(sub.metrics, { expected: 2, scanned: 2, match: 1, accuracy: 50, incorrect: 1 });
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
