// Device storage: count and has answer without reading values (the Continue
// screen asks whether a store's snapshot and outbox are on the device).
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '../../client/storage.js';

test('count counts keys under a prefix; has checks one exact key', async () => {
  const s = memoryStorage({ 'snap:1241': { seq: 3 }, 'snap:12410': { seq: 1 }, 'outbox:1241:a': {}, 'outbox:1241:b': {}, 'outbox:1242:a': {} });
  assert.equal(await s.count('outbox:1241:'), 2);
  assert.equal(await s.count('outbox:1243:'), 0);
  assert.equal(await s.has('snap:1241'), true);
  assert.equal(await s.has('snap:124'), false);   // a prefix is not the key
  await s.del('snap:1241');
  assert.equal(await s.has('snap:1241'), false);
  assert.equal(await s.has('snap:12410'), true);
});
