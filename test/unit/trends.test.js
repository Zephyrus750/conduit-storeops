import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitsOf, trendsOf, delta, peakDay, avgGap } from '../../shared/trends.js';

test('delta, peak day and cadence follow K2B', () => {
  assert.equal(delta([90, 91, 92]), null, 'needs four');
  assert.deepEqual(delta([80, 82, 90, 92]), { d: 10, dir: 'up' });
  assert.deepEqual(delta([90, 90, 89, 89]), { d: -1, dir: 'steady' });
  assert.equal(peakDay([1, 1, 0, 0, 0, 0, 0]), null, 'under three');
  assert.deepEqual(peakDay([0, 0, 4, 0, 0, 0, 0]), { day: 2, sole: true });
  assert.deepEqual(peakDay([1, 1, 5, 1, 0, 0, 0]), { day: 2, sole: false }, '5 ≥ 1.6 × 8/4');
  assert.equal(peakDay([2, 2, 3, 2, 0, 0, 0]), null, 'no clear day');
  assert.equal(avgGap(['2026-10-01']), null); assert.equal(avgGap(['2026-10-01', '2026-10-01', '2026-10-04', '2026-10-08']), 3.5, 'unique dates only');
});

test('visits on the store clock, then the heatmap, patterns, accuracy and cadence', () => {
  const sub = (bay, date, readyAt, accuracy, status = 'corrected') => ({ bay, date, status, readyAt, metrics: { accuracy } });
  const subs = {
    a: sub('7001', '2026-09-28', '2026-09-28T00:30:00Z', 90),           // Mon 08:30 Perth
    b: sub('7001', '2026-10-01', '2026-10-01T03:00:00Z', 96),           // Thu 11:00
    c: sub('7002', '2026-10-01', '2026-10-01T06:00:00Z', 80),           // Thu 14:00
    d: sub('7003', '2026-10-05', null, 100),                              // Mon, no time
    e: { bay: '7004', date: '2026-10-05', status: 'pending' },             // not a visit
    f: sub('7001', '2026-08-01', '2026-08-01T03:00:00Z', 50),           // outside the window
  };
  const v = visitsOf(subs, { today: '2026-10-05', days: 14, tz: 'Australia/Perth', deptFor: b => (b === '7003' ? '' : 'h1') });
  assert.equal(v.length, 4);
  const t = trendsOf(v, '2026-10-05');
  assert.deepEqual([t.visits, t.activeDays, t.timed, t.avgAcc], [4, 3, 3, 91.5]);
  assert.deepEqual(t.heat[0], [1, 0, 0, 0], 'Monday before 9am'); assert.deepEqual(t.heat[3], [0, 1, 1, 0], 'Thursday morning and afternoon');
  assert.deepEqual(t.byWd, [2, 0, 0, 2, 0, 0, 0]);
  assert.deepEqual(t.accPerDay, [{ date: '2026-09-28', acc: 90 }, { date: '2026-10-01', acc: 88 }, { date: '2026-10-05', acc: 100 }]);
  const l = t.byLoc.find(x => x.loc === '7001'); assert.deepEqual([l.times, l.gap, l.lastDays, l.avg], [2, 3, 4, 93]);
  assert.deepEqual(t.byDept.map(d => [d.dept, d.visits, d.locs]), [['h1', 3, 2], ['', 1, 1]]);
  assert.deepEqual([t.repeat, t.once], [1, 2]);
});
