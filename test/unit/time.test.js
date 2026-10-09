import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeDay, storeIso, addDays, msToStoreMidnight } from '../../shared/time.js';

test('store day follows the store clock, not UTC', () => {
  assert.equal(storeDay(new Date('2026-09-23T23:30:00Z')), '2026-09-24', '07:30 AWST is already the 24th');
  assert.equal(storeDay(new Date('2026-09-23T15:59:00Z')), '2026-09-23');
  assert.equal(storeIso(new Date('2026-09-23T16:01:05Z')), '2026-09-24T00:01:05+08:00');
  assert.equal(storeIso(new Date('2026-01-10T12:00:00Z'), 'Australia/Sydney'), '2026-01-10T23:00:00+11:00');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(msToStoreMidnight(new Date('2026-09-23T15:00:00Z')), 3600000);
});

test('retailPeriod: Vector’s cycle, P1W1 from Mon 29 Jun 2026, four weeks a period, twelve periods', async () => {
  const { retailPeriod } = await import('../../shared/time.js');
  assert.equal(retailPeriod('2026-06-29'), 'P1W1');
  assert.equal(retailPeriod('2026-07-05'), 'P1W1');            // Sunday, same week
  assert.equal(retailPeriod('2026-09-07'), 'P3W3');            // the showcase's date
  assert.equal(retailPeriod('2026-06-15'), 'P12W3');           // Vector's anchor
  assert.equal(retailPeriod('2027-05-31'), 'P1W1');            // 48 weeks on
});

test('a device writes its own wall-clock time with its zone, never UTC labelled local', async () => {
  const { localIso } = await import('../../client/store.js');
  for (const ms of [Date.UTC(2026, 9, 9, 0, 0), Date.UTC(2026, 9, 9, 15, 59), Date.UTC(2026, 0, 1, 12, 30)]) {
    const s = localIso(new Date(ms));
    assert.equal(Date.parse(s), ms, `${s} names the same instant`);
    assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  }
});
