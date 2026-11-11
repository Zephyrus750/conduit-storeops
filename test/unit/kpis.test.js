import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeKpis } from '../../shared/kpis.js';
import { initialState } from '../../shared/reducers.js';

test('store numbers: backfill today and week with accuracy and auto-closed, the dock week, issues, devices, alerts', () => {
  const s = initialState(), now = Date.parse('2026-10-08T04:00:00Z');
  const sub = (bay, date, acc, extra = {}) => ({ bay, date, status: 'submitted', metrics: { accuracy: acc }, ...extra });
  s.backfill.subs = { a: sub('7001', '2026-10-08', 90), b: sub('7002', '2026-10-07', 80, { autoSubmitted: true }), c: sub('7003', '2026-09-20', 50), d: { bay: '7004', date: '2026-10-08', status: 'pending' } };
  s.backfill.requested['2026-10-08'] = ['7001', '7005'];
  s.dock.history = [{ date: '2026-10-06', cartons: 300, clearMins: 60 }, { date: '2026-10-07', cartons: 200, clearMins: 40 }, { date: '2026-09-01', cartons: 999, clearMins: 1 }];
  s.issues = { i1: { status: 'open', sev: 3 }, i2: { status: 'completed', sev: 3 }, i3: { status: 'open', sev: 0 } };
  s.devices = { p1: { app: 'v0.2.0', last: '2026-10-08T03:00:00Z', lastError: 'boom' }, p2: { app: 'v0.1.9', last: '2026-10-08T02:00:00Z', outbox: 2 }, old: { app: 'v0.1.0', last: '2026-09-01T00:00:00Z' } };
  const k = storeKpis(s, { today: '2026-10-08', caps: ['floor', 'stockroom', 'backdock'], now });
  assert.deepEqual(k.backfill, { today: 1, pending: 1, requested: 2, week: 2, accuracy: 85, autoClosed: 1 });
  assert.deepEqual(k.dock, { trucks: 2, cartons: 500, clearMins: 50, open: 0, manifests: 0, clear7: { mins: 50, trucks: 2 }, clear28: { mins: 50, trucks: 2 } });
  assert.deepEqual(k.floor, { openIssues: 2, urgent: 1 });
  assert.deepEqual([k.devices.seen24h, k.devices.total, k.devices.versions, k.devices.outbox], [2, 3, { 'v0.2.0': 1, 'v0.1.9': 1 }, 2]);
  const t = k.alerts.map(a => a.text).join(' | ');
  for (const re of [/No map published/, /No stockroom bay ranges/, /No manifest published/, /1 device reporting an error/, /2 changes waiting/, /1 bay auto-closed/]) assert.match(t, re);
  const floorOnly = storeKpis(s, { today: '2026-10-08', caps: ['floor'], now });
  assert.equal(floorOnly.backfill, null); assert.equal(floorOnly.dock, null);
  assert.doesNotMatch(floorOnly.alerts.map(a => a.text).join(' '), /manifest|bay ranges/);
});

test('compare stores: this week’s refresh against its target, the dock’s clear times over 7 and 28 days', () => {
  const s = initialState(), now = Date.parse('2026-10-08T04:00:00Z');   // Thursday of 2026-W41
  s.refresh.weeks['2026-W41'] = { 'A1 S1': { at: '2026-10-06T01:00:00Z', dept: 'h1' }, 'A2 S1': { at: '2026-10-06T02:00:00Z', dept: 'k2' }, 'A3 S1': { at: '2026-10-07T01:00:00Z' } };
  s.refresh.weeks['2026-W40'] = { 'B1 S1': { at: '2026-09-30T01:00:00Z' } };
  s.dock.history = [
    { id: '2026-10-07-T1', date: '2026-10-07', clearedAt: '2026-10-07T06:00:00Z', clearMins: 120 },
    { id: '2026-10-05-T1', date: '2026-10-05', clearedAt: '2026-10-05T06:00:00Z', clearMins: 60 },
    { id: '2026-09-20-T1', date: '2026-09-20', clearedAt: '2026-09-20T06:00:00Z', clearMins: 300 },
    { id: '2026-09-01-T1', date: '2026-09-01', clearedAt: '2026-09-01T06:00:00Z', clearMins: 999 },   // older than 28 days
    { id: '2026-10-06-T1', date: '2026-10-06', imported: true, clearMins: 0 },                       // no clock: left out
  ];
  const all = storeKpis(s, { today: '2026-10-08', caps: ['floor', 'stockroom', 'backdock'], now });
  assert.deepEqual(all.refresh, { week: '2026-W41', counted: 3, done: 3, target: 100, focus: 0 });
  assert.deepEqual(all.dock.clear7, { mins: 90, trucks: 2 });
  assert.deepEqual(all.dock.clear28, { mins: 160, trucks: 3 });
  // With focus departments the count is what the PC's X / 100 counts: marks in them, and marks with no department.
  s.refresh.focus['2026-W41'] = ['h1'];
  assert.deepEqual(storeKpis(s, { today: '2026-10-08', caps: ['floor'], now }).refresh, { week: '2026-W41', counted: 2, done: 3, target: 100, focus: 1 });
  // Monday of the next week starts from nothing.
  assert.equal(storeKpis(s, { today: '2026-10-12', caps: ['floor'], now }).refresh.counted, 0);
  const none = storeKpis(initialState(), { today: '2026-10-08', caps: ['backdock'], now });
  assert.equal(none.dock.clear7, null); assert.equal(none.dock.clear28, null); assert.equal(none.refresh, null); assert.equal(none.shrink, null);
});

test('compare stores: the last seven days of Adjustments in its three parts, over every item and the ones adjusted', () => {
  const s = initialState(), now = Date.parse('2026-10-08T04:00:00Z');
  s.adjustments = {
    '2026-10-08': {
      11111111: { qty: -5, price: 2, done: { at: '2026-10-08T03:00:00Z' } },   // carton 6 (profile): to zero 10, zero to carton 12, combined 22
      22222222: { qty: 0, price: 10 },                                          // carton 4 (latest delivery): to zero 0, carton 40, combined 40
      33333333: { qty: -2, price: 3 },                                          // no carton size: to zero 6, combined 6
      44444444: { qty: -9 },                                                    // no price: counted apart
      55555555: { qty: 4, price: 1 },                                           // above zero: not shrink
    },
    '2026-10-02': { 66666666: { qty: -1, price: 1, done: { at: '2026-10-02T03:00:00Z' } } },   // the first of the seven days: to zero 1
    '2026-10-01': { 77777777: { qty: -100, price: 100 } },                                       // eight days ago: out of the window
  };
  const cartons = { profiles: { 11111111: { ctn: 6 } }, last: { 22222222: { ctn: 4 }, 11111111: { ctn: 99 } } };
  const k = storeKpis(s, { today: '2026-10-08', caps: ['stockroom'], now, cartons });
  assert.deepEqual(k.shrink, {
    items: 5, adjustedItems: 2, priced: 4, unpriced: 1, noSize: 2,
    listed: { toZero: 17, zeroToCarton: 52, combined: 69 },
    adjusted: { toZero: 11, zeroToCarton: 12, combined: 23 },
  });
  // Without carton sizes every part is back to zero only.
  const bare = storeKpis(s, { today: '2026-10-08', caps: ['stockroom'], now }).shrink;
  assert.deepEqual([bare.listed, bare.noSize], [{ toZero: 17, zeroToCarton: 0, combined: 17 }, 4]);
  // No prices at all: counts only.
  const counts = storeKpis({ ...initialState(), adjustments: { '2026-10-08': { 1234567: { qty: -1 }, 2345678: { qty: 0, done: { at: 'x' } } } } }, { today: '2026-10-08', caps: ['stockroom'], now }).shrink;
  assert.deepEqual([counts.items, counts.adjustedItems, counts.priced, counts.unpriced, counts.listed.combined], [2, 1, 0, 2, 0]);
});
