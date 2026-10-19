import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../../shared/validate.js';
import { ulid, isUlid, ulidTime } from '../../shared/ulid.js';
import { Router } from '../../worker/router.js';

const good = () => ({ id: ulid(), store: '1241', area: 'backdock', type: 'pallet.land', entity: { truck: 'T1', bay: 'A6' }, payload: { ptype: 'loscam', cartons: 20 }, at: '2026-09-07T08:41:12+08:00', v: 1 });

test('a well-formed event validates', () => { assert.equal(validateEvent(good()), null); });

test('envelope faults are named', () => {
  assert.match(validateEvent({ ...good(), id: 'nope' }).message, /ULID/);
  assert.match(validateEvent({ ...good(), type: 'pallet.fly' }).message, /unknown type/);
  assert.match(validateEvent({ ...good(), area: 'floor' }).message, /area must be backdock/);
  assert.match(validateEvent({ ...good(), at: 'yesterday' }).message, /ISO 8601/);
  assert.match(validateEvent({ ...good(), entity: { truck: 'T1' } }).message, /entity.bay/);
  assert.match(validateEvent({ ...good(), payload: {} }).message, /payload.ptype/);
  assert.match(validateEvent({ ...good(), payload: { ptype: 7 } }).message, /must be string/);
  assert.match(validateEvent({ ...good(), v: 2 }).message, /schema v1/);
});

test('ids and names carry no HTML: < > quotes, backticks and control characters are refused in entity values (audit 19 Oct S3)', () => {
  for (const v of ['"><meta http-equiv=refresh content=0;url=//x>', "a'b", 'a<b', 'a`b', 'a\nb', 'a\u0000b']) {
    const r = validateEvent({ ...good(), entity: { truck: 'T1', bay: v } });
    assert.equal(r?.code, 'invalid_event', JSON.stringify(v)); assert.match(r.message, /not allowed/);
  }
  for (const v of ['A16 S1', '2026-09-07-T1', 'h4-024', 'BSN1240417', 'Aisle 3/4: Bay #2 & co.']) assert.equal(validateEvent({ ...good(), entity: { truck: 'T1', bay: v } }), null, v);
  assert.equal(validateEvent({ ...good(), type: 'pallet.fly' }).reason, 'unknown_type', 'a device can tell its app is ahead of the worker');
  assert.equal(validateEvent({ ...good(), v: 2 }).reason, 'schema_version');
});

test('a route parameter is one decoded path segment (audit 19 Oct S1)', () => {
  const r = new Router().get('/v1/store/:no/life/:keycode', () => 'life');
  assert.deepEqual(r.match('GET', '/v1/store/1241/life/43166022').params, { no: '1241', keycode: '43166022' });
  for (const p of ['/v1/store/1241/life/..%2Ftail', '/v1/store/1241/life/..%5Ctail', '/v1/store/1241/life/%2E%2E', '/v1/store/1241/life/%E0%A4%A', '/v1/store/1241/life/a%00b', '/v1/store/1241/life/50%25'])
    assert.ok(r.match('GET', p).bad, p);
});

test('ulid: shape, monotonic time, parse', () => {
  const a = ulid(1_700_000_000_000), b = ulid(1_700_000_000_001);
  assert.ok(isUlid(a)); assert.ok(a < b);
  assert.equal(ulidTime(a), 1_700_000_000_000);
  assert.equal(isUlid('01J9'), false);
});

test('router matches params and trailing slash', () => {
  const r = new Router().get('/v1/store/:no/snapshot', () => 'snap').post('/v1/store/:no/events', () => 'ev');
  assert.equal(r.match('GET', '/v1/store/1241/snapshot').params.no, '1241');
  assert.equal(r.match('GET', '/v1/store/1241/snapshot/').handler(), 'snap');
  assert.equal(r.match('POST', '/v1/store/1241/events').handler(), 'ev');
  assert.equal(r.match('GET', '/v1/store/1241/events'), null);
});
