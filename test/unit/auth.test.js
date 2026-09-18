import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSecret, verifySecret, signToken, verifyToken, makeClaims, hasRole } from '../../worker/auth.js';

test('hashSecret round-trips and rejects the wrong secret', async () => {
  const stored = await hashSecret('2468', 1000);
  assert.match(stored, /^pbkdf2\$1000\$/);
  assert.equal(await verifySecret('2468', stored), true);
  assert.equal(await verifySecret('2469', stored), false);
  assert.equal(await verifySecret('2468', 'garbage'), false);
});

test('tokens verify with the right secret only, and expire', async () => {
  const claims = makeClaims({ store: '1241', roles: ['floor'], caps: ['floor'], device: 'TC52x-01', ttl: 60 });
  const token = await signToken(claims, 'secret-a');
  const back = await verifyToken(token, 'secret-a');
  assert.equal(back.store, '1241');
  assert.deepEqual(back.roles, ['floor']);
  assert.equal(await verifyToken(token, 'secret-b'), null);
  assert.equal(await verifyToken(token + 'x', 'secret-a'), null);
  assert.equal(await verifyToken(token, 'secret-a', Date.now() + 61_000), null);
});

test('hasRole: manager implies every store role', () => {
  assert.equal(hasRole({ roles: ['floor'] }, ['dock']), false);
  assert.equal(hasRole({ roles: ['floor', 'dock'] }, ['dock']), true);
  assert.equal(hasRole({ roles: ['manager'] }, ['dock']), true);
});
