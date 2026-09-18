import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs, Breaker, createTransport, TransportError } from '../../client/transport.js';
import { memoryStorage } from '../../client/storage.js';

test('backoff doubles from 1s, caps at 60s, jitters within ±25%', () => {
  const fixed = () => 0.5;
  assert.equal(backoffMs(1, 60_000, fixed), 1000);
  assert.equal(backoffMs(4, 60_000, fixed), 8000);
  assert.equal(backoffMs(20, 60_000, fixed), 60_000);
  assert.equal(backoffMs(3, 60_000, () => 0), 3000);
  assert.equal(backoffMs(3, 60_000, () => 1), 5000);
});

test('breaker opens after three consecutive failures and resets on success', () => {
  const b = new Breaker();
  b.fail(); b.fail();
  assert.equal(b.open, false);
  b.fail();
  assert.equal(b.open, true);
  b.succeed();
  assert.equal(b.open, false); assert.equal(b.failures, 0);
});

test('transport turns HTTP errors into typed errors and times out', async () => {
  const t = createTransport({ baseUrl: 'http://x/', fetchImpl: async () => new Response(JSON.stringify({ code: 'locked_out', message: 'wait' }), { status: 429 }) });
  await assert.rejects(t.request('/v1/auth/signin', { method: 'POST', body: {} }), e => e instanceof TransportError && e.status === 429 && e.code === 'locked_out');
  const slow = createTransport({ baseUrl: 'http://x', timeoutMs: 20, fetchImpl: (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  await assert.rejects(slow.request('/v1/health'), e => e.network && /timed out/.test(e.message));
  assert.equal(t.wsBase, 'ws://x');
});

test('memory storage lists by prefix in key order', async () => {
  const s = memoryStorage();
  await s.set('outbox:1241:B', 2); await s.set('outbox:1241:A', 1); await s.set('snap:1241', 0);
  assert.deepEqual((await s.list('outbox:1241:')).map(r => r.value), [1, 2]);
  await s.del('outbox:1241:A');
  assert.equal((await s.list('outbox:')).length, 1);
});
