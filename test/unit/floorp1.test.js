import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, extra = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role: 'floor', device: 'P1', owner: false }, at: '2026-09-07T08:00:00+08:00', v: 1, ...extra,
});
const W = { week: '2026-W37' };

test('refresh.clearDept: clears one department only, listed segments too, and holds them unmarked', () => {
  const s = initialState();
  apply(s, ev('refresh.mark', { segment: 'A1 S1', ...W }, { dept: 'h1' }));
  apply(s, ev('refresh.mark', { segment: 'A2 S1', ...W }));                       // older mark, no dept
  apply(s, ev('refresh.mark', { segment: 'K9 S1', ...W }, { dept: 'k2' }));
  assert.equal(apply(s, ev('refresh.clearDept', W, { dept: 'H1', segments: ['A2 S1'] }, { at: '2026-09-07T09:00:00+08:00' })), null);
  assert.deepEqual(Object.keys(s.refresh.weeks['2026-W37']), ['K9 S1']);
  // A phone's queued mark from before the reset lands late: ignored.
  apply(s, ev('refresh.mark', { segment: 'A1 S1', ...W }, { dept: 'h1' }, { at: '2026-09-07T08:30:00+08:00' }));
  assert.equal(s.refresh.weeks['2026-W37']['A1 S1'], undefined);
  // A new mark after the reset counts.
  apply(s, ev('refresh.mark', { segment: 'A1 S1', ...W }, { dept: 'h1' }, { at: '2026-09-07T10:00:00+08:00' }));
  assert.ok(s.refresh.weeks['2026-W37']['A1 S1']);
});

test('issue.remove: a tombstone that hides the issue and blocks later changes', () => {
  const s = initialState();
  apply(s, ev('issue.log', { issue: 'm1' }, { cat: 'leak', title: 'Drip', sev: 1 }));
  assert.equal(apply(s, ev('issue.remove', { issue: 'm1' }, { note: 'duplicate' })), null);
  assert.equal(s.issues.m1.removed.by, 'P1');
  assert.equal(s.issues.m1.log.at(-1).a, 'Removed');
  assert.equal(apply(s, ev('issue.close', { issue: 'm1' })).code, 'not_found');
  assert.equal(apply(s, ev('issue.remove', { issue: 'm1' })).code, 'invalid_event');
  assert.equal(apply(s, ev('issue.remove', { issue: 'nope' })).code, 'not_found');
});
