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

test('session: a refresh that fails for a passing reason keeps the session; only a dead session signs out; another tab\'s refresh is adopted', async () => {
  const { TransportError } = await import('../../client/transport.js');
  let answer = null; const now = () => 1_000_000;
  const transport = { async request(path, { body } = {}) {
    if (path === '/v1/auth/signin') return { token: 't1', refresh: 'r1', expires: now() / 1000 + 60, store: body.store, name: 'S', roles: ['floor'], caps: [] };
    if (path === '/v1/auth/refresh') { if (answer instanceof Error) throw answer; return answer; }
    return {};
  } };
  const storage = memoryStorage(), s = createSession({ transport, storage, now });
  await s.load(); await s.signIn({ store: '1241', pin: '111111' });
  let out = 0; s.on('signin-required', () => { out += 1; });
  // A 503 or a 429 from the registry: the device keeps its (still valid) token.
  answer = new TransportError(503, 'unavailable', 'registry busy');
  assert.equal(await s.token(), 't1'); assert.equal(out, 0); assert.ok(s.current);
  answer = new TransportError(429, 'rate_limited', 'slow down');
  assert.equal(await s.token(), 't1'); assert.equal(out, 0);
  // Another tab refreshed first and saved its new session: a 401 for the spent token adopts it.
  await storage.set('suite_session', { ...s.current, token: 't2', refresh: 'r2', expires: now() / 1000 + 3600 });
  answer = new TransportError(401, 'unauthorised', 'refresh token is not valid');
  assert.equal(await s.token(), 't2'); assert.equal(out, 0);
  // A revoked session with nothing newer stored signs out.
  await storage.set('suite_session', { ...s.current, expires: now() / 1000 + 60 });
  await assert.rejects(s.refresh(), /not valid/);
  assert.equal(s.current, null); assert.equal(out, 1);
});

test('session: a dock screen holds the Floor and Back dock roles only; a manager or Stockroom code signs it straight out', async () => {
  let role = 'dock'; const calls = [];
  const transport = { async request(path, { body } = {}) {
    calls.push(path);
    if (path === '/v1/auth/signin') return { token: 't', refresh: 'r', expires: 9e9, store: body.store, name: 'S', roles: ['floor'], caps: ['floor', 'backdock'] };
    if (path === '/v1/auth/unlock') return { token: 'tu', refresh: 'ru', expires: 9e9, roles: ['floor', role] };
    if (path === '/v1/auth/refresh') return { token: 'tr', refresh: 'rr', expires: 9e9, roles: ['floor', 'dock'], caps: [] };
    return {};
  } };
  const storage = memoryStorage(), s = createSession({ transport, storage });
  await s.load();
  await s.signInScreen({ store: '1241', pin: '111111', code: 'DK' });
  assert.deepEqual([s.current.roles, s.current.screen], [['floor', 'dock'], true]);
  await s.refresh();
  assert.equal(s.current.screen, true, 'a refresh keeps it a screen');
  assert.equal((await storage.get('suite_session')).screen, true, 'and so does the next start');
  for (role of ['manager', 'stockroom']) {
    calls.length = 0;
    await assert.rejects(s.signInScreen({ store: '1241', pin: '111111', code: 'X' }), /Back dock crew code/);
    assert.equal(s.current, null); assert.ok(calls.includes('/v1/auth/signout'), `a ${role} code leaves no session behind`);
  }
});

test('session: a manager sign-in remembers it; the role going at a refresh, the idle lock or a store switch says why; the code clears it', async () => {
  let refreshRoles = ['floor', 'manager'];
  const transport = { calls: [], async request(path, { body } = {}) {
    if (path === '/v1/auth/signin') return { token: 't', refresh: 'r' + body.store, expires: 9e9, store: body.store, name: 'S', roles: body.managerCode ? ['floor', 'manager'] : ['floor'], caps: [] };
    if (path === '/v1/auth/refresh') return { token: 't2', refresh: 'r2', expires: 9e9, roles: refreshRoles, caps: [] };
    if (path === '/v1/auth/unlock') return { token: 'tu', refresh: 'ru', expires: 9e9, roles: body.code === 'MGR' ? ['floor', 'manager'] : ['floor', 'stockroom'] };
    if (path === '/v1/auth/lock') return { token: 'tl', refresh: 'rl', expires: 9e9, roles: ['floor'] };
    return {};
  } };
  const s = createSession({ transport, storage: memoryStorage() });
  await s.load();
  await s.signIn({ store: '1241', managerCode: 'MGR' });
  assert.equal(s.current.asManager, true); assert.equal(s.current.lapsed, null);
  await s.refresh(); assert.equal(s.current.lapsed, null, 'a refresh inside the shift keeps the role');
  refreshRoles = ['floor'];
  await s.refresh();
  assert.deepEqual(s.current.roles, ['floor']); assert.equal(s.current.lapsed, 'shift'); assert.equal(s.current.asManager, true);
  await s.unlock('SR'); assert.equal(s.current.lapsed, 'shift', 'a crew code does not bring the manager back');
  await s.unlock('MGR'); assert.equal(s.current.lapsed, null); assert.ok(s.current.roles.includes('manager'));
  await s.lock(); assert.equal(s.current.lapsed, 'idle');
  await s.unlock('MGR'); await s.signInAnother({ store: '2033', pin: '222222' });
  await s.switchTo('1241'); assert.equal(s.current.lapsed, 'switch', 'the parked store gave up the manager role');
  await s.dropManager(); assert.equal(s.current.lapsed, null); assert.equal(s.current.asManager, false);
  // A PIN sign-in never counts as a manager's.
  await s.signOut(); await s.signIn({ store: '1241', pin: '111111' }); assert.equal(s.current.asManager, false);
});
