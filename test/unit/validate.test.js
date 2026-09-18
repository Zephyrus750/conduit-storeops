import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../../shared/validate.js';
import { ulid, isUlid, ulidTime } from '../../shared/ulid.js';
import { Router } from '../../worker/router.js';

const good = () => ({ id: ulid(), store: '1241', area: 'backdock', type: 'pallet.land', entity: { truck: 'T1', bay: 'A6' }, payload: { kind: 'load', cartons: 20 }, at: '2026-09-07T08:41:12+08:00', v: 1 });

test('a well-formed event validates', () => { assert.equal(validateEvent(good()), null); });

test('envelope faults are named', () => {
  assert.match(validateEvent({ ...good(), id: 'nope' }).message, /ULID/);
  assert.match(validateEvent({ ...good(), type: 'pallet.fly' }).message, /unknown type/);
  assert.match(validateEvent({ ...good(), area: 'floor' }).message, /area must be backdock/);
  assert.match(validateEvent({ ...good(), at: 'yesterday' }).message, /ISO 8601/);
  assert.match(validateEvent({ ...good(), entity: { truck: 'T1' } }).message, /entity.bay/);
  assert.match(validateEvent({ ...good(), payload: { kind: 'load' } }).message, /payload.cartons/);
  assert.match(validateEvent({ ...good(), payload: { kind: 'load', cartons: '20' } }).message, /must be number/);
  assert.match(validateEvent({ ...good(), v: 2 }).message, /schema v1/);
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
