import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../client/session.js';
import { memoryStorage } from '../../client/storage.js';

// A fake worker: sign-in per store, lock drops codes, sign-out recorded.
function fakeTransport() {
  const calls = [];
  return { calls, async request(path, { body } = {}) {
    calls.push([path, body]);
    if (path === '/v1/auth/signin') return { token: 't' + body.store, refresh: 'r' + body.store, expires: 9e9, store: body.store, name: 'Store ' + body.store, roles: ['floor'], caps: [] };
    if (path === '/v1/auth/unlock') return { token: 'tu', refresh: 'ru', expires: 9e9, roles: ['floor', 'stockroom'] };
    if (path === '/v1/auth/lock') return { token: 'tl', refresh: 'rl', expires: 9e9, roles: ['floor'] };
    return {};
  } };
}

test('session: a second store parks the first; switching swaps; codes drop when parked; sign-out clears all', async () => {
  const transport = fakeTransport(), storage = memoryStorage(), s = createSession({ transport, storage });
  await s.load();
  await s.signIn({ store: '1241', pin: '111111' });
  await s.unlock('SR');
  assert.deepEqual(s.current.roles, ['floor', 'stockroom']);
  await s.signInAnother({ store: '2033', pin: '222222' });
  assert.equal(s.current.store, '2033');
  assert.ok(transport.calls.some(c => c[0] === '/v1/auth/lock'), 'the parked store gave up its codes');
  assert.deepEqual(await s.parked(), [{ store: '1241', name: 'Store 1241' }]);
  await assert.rejects(s.signInAnother({ store: '2033', pin: '222222' }), /already signed in/);
  await s.switchTo('1241');
  assert.equal(s.current.store, '1241'); assert.deepEqual(s.current.roles, ['floor']);
  assert.deepEqual((await s.parked()).map(p => p.store), ['2033']);
  await assert.rejects(s.switchTo('9999'), /not on this device/);
  await s.signOut();
  assert.equal(s.current, null); assert.deepEqual(await s.parked(), []);
  // 1241's refresh token is the one its lock minted; both stores sign out.
  assert.deepEqual(transport.calls.filter(c => c[0] === '/v1/auth/signout').map(c => c[1].refresh).sort(), ['r2033', 'rl']);
});
