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
  assert.deepEqual(k.dock, { trucks: 2, cartons: 500, clearMins: 50, open: 0, manifests: 0 });
  assert.deepEqual(k.floor, { openIssues: 2, urgent: 1 });
  assert.deepEqual([k.devices.seen24h, k.devices.total, k.devices.versions, k.devices.outbox], [2, 3, { 'v0.2.0': 1, 'v0.1.9': 1 }, 2]);
  const t = k.alerts.map(a => a.text).join(' | ');
  for (const re of [/No map published/, /No stockroom bay ranges/, /No manifest published/, /1 device reporting an error/, /2 changes waiting/, /1 bay auto-closed/]) assert.match(t, re);
  const floorOnly = storeKpis(s, { today: '2026-10-08', caps: ['floor'], now });
  assert.equal(floorOnly.backfill, null); assert.equal(floorOnly.dock, null);
  assert.doesNotMatch(floorOnly.alerts.map(a => a.text).join(' '), /manifest|bay ranges/);
});
