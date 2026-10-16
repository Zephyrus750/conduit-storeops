import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (date, payload, at = '2026-10-16T08:30:00Z') => ({ id: ulid(), store: '1241', area: CATALOGUE['backfill.report.publish'].area, type: 'backfill.report.publish', entity: { date }, payload, actor: { role: 'stockroom', device: 'D1', owner: false }, at, v: 1 });

test('backfill.report.publish: the state says which report the store holds; a re-paste the same day bumps its revision', () => {
  const s = initialState();
  assert.equal(apply(s, ev('2026-10-16', { at: 1000, bays: 2, codes: 3 })), null);
  assert.deepEqual(s.backfill.report, { date: '2026-10-16', at: 1000, bays: 2, codes: 3, by: 'D1', rev: 1 });
  assert.equal(apply(s, ev('2026-10-16', { at: 2000, bays: 5, codes: 9 })), null);
  assert.equal(s.backfill.report.rev, 2);
  assert.equal(apply(s, ev('2026-10-17', { at: 3000, bays: 1, codes: 1 })), null);
  assert.deepEqual([s.backfill.report.date, s.backfill.report.rev], ['2026-10-17', 1], 'a new day starts again');
  const before = JSON.stringify(s);
  assert.equal(apply(s, ev('17/10/2026', {}))?.code, 'invalid_event');
  assert.equal(JSON.stringify(s), before, 'a refused event changes nothing');
});
