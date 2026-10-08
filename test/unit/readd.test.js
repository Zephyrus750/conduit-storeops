import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, device = 'PH1') => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role: 'stockroom', device, owner: false }, at: new Date().toISOString(), v: 1 });
const B = { bay: '7012', date: '2026-10-04' };

test('a bay records which devices scanned it', () => {
  const s = initialState();
  apply(s, ev('submission.update', B, { codes: { 43166022: true } }, 'PH1'));
  apply(s, ev('submission.update', B, { codes: { 43199310: true } }, 'PH2'));
  apply(s, ev('submission.update', B, { incorrect: ['43199310'] }, 'DESK'));
  assert.deepEqual(s.backfill.subs['7012:2026-10-04'].devices, ['PH1', 'PH2'], 'a desk edit is not a scan');
});

test('Re-add: tag a found item to the bay, then tick it scanned back in', () => {
  const s = initialState();
  assert.equal(apply(s, ev('submission.readd', B, { code: '43166022' }))?.code, 'not_found', 'the bay must be on the board');
  apply(s, ev('submission.open', B));
  assert.equal(apply(s, ev('submission.readd', B, { code: 'abc' }))?.code, 'invalid_event');
  assert.equal(apply(s, ev('submission.readd', B, { code: '43166022' })), null);
  assert.equal(apply(s, ev('submission.readd', B, { code: '43166022' }))?.code, 'invalid_event', 'already tagged');
  assert.equal(apply(s, ev('submission.readd', B, { code: '43199310', done: true }))?.code, 'not_found');
  assert.equal(apply(s, ev('submission.readd', B, { code: '43166022', done: true })), null);
  const r = s.backfill.subs['7012:2026-10-04'].readd['43166022'];
  assert.equal(r.by, 'PH1'); assert.ok(r.doneAt);
  assert.equal(apply(s, ev('submission.readd', B, { code: '43166022', done: true }))?.code, 'invalid_event', 'already done');
});

test('a submitted bay can be moved back to Ready (unfinalise) or to review (reopen)', () => {
  const s = initialState();
  apply(s, ev('submission.update', B, { codes: { 43166022: true } }));
  apply(s, ev('submission.ready', B)); apply(s, ev('submission.submit', B));
  const sub = s.backfill.subs['7012:2026-10-04'];
  assert.equal(sub.status, 'submitted');
  apply(s, ev('submission.ready', B)); assert.equal(sub.status, 'corrected', 'unfinalise: back to Ready');
  apply(s, ev('submission.submit', B)); apply(s, ev('submission.reopen', B));
  assert.equal(sub.status, 'pending', 'reopen: back in review');
});
