import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSecret, verifySecret, signToken, verifyToken, makeClaims, hasRole, pinOk, cleanText } from '../../worker/auth.js';

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

test('store PINs: 6 to 8 digits by default, the floor configurable down to 4; names lose control characters', () => {
  assert.equal(pinOk('2468'), false); assert.equal(pinOk('246810'), true); assert.equal(pinOk('12345678'), true); assert.equal(pinOk('123456789'), false);
  assert.equal(pinOk('24681a'), false); assert.equal(pinOk('2468', '4'), true); assert.equal(pinOk('246', '4'), false);
  assert.equal(cleanText('  Busselton\u0000\n Store  ', 80), 'Busselton Store'); assert.equal(cleanText('x'.repeat(100), 80).length, 80);
});
