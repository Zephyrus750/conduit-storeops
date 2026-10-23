import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deptSpeed, workerPerf, downtimeBy, teamCsv, pacePoints, personNow, insights } from '../../shared/dockstats.js';

const now = Date.parse('2026-10-05T12:00:00Z');
const row = (date, n, pp, extra = {}) => ({ id: `${date}-T${n}`, date, perPerson: pp, perDept: [], downtime: [], ...extra });
const H = [
  row('2026-09-20', 1, [{ pid: 'D1', cartons: 100, workedMins: 60, pallets: 4 }]),
  row('2026-09-25', 1, [{ pid: 'D1', cartons: 120, workedMins: 60, pallets: 4 }], { downtime: [{ kind: 'halt', reason: 'nostock', mins: 20, count: 1 }] }),
  row('2026-10-02', 1, [{ pid: 'D1', cartons: 90, workedMins: 60, pallets: 3 }, { pid: 'D2', cartons: 60, workedMins: 30, pallets: 2 }], { perDept: [{ dept: '021', cartons: 80, workedMins: 40, pallets: 2 }], downtime: [{ kind: 'halt', reason: 'nostock', mins: 10, count: 1 }, { kind: 'halt', reason: 'equip', mins: 5, count: 1 }] }),
  row('2026-10-04', 1, [{ pid: 'D1', cartons: 80, workedMins: 60, pallets: 3 }], { perDept: [{ dept: '021', cartons: 50, workedMins: 30, pallets: 1 }] }),
];

test('worker performance: a window against the one before, with the trending-down flag', () => {
  const w = workerPerf(H, now, 7), d1 = w.find(x => x.pid === 'D1');
  assert.equal(d1.cartons, 170); assert.equal(d1.rate, 85); assert.equal(d1.prevRate, 120); assert.equal(d1.delta, -29); assert.ok(d1.trendingDown);
  assert.equal(w.find(x => x.pid === 'D2').delta, null, 'no window before: no delta');
  assert.equal(workerPerf(H, now, 'truck')[0].cartons, 80, 'the last truck alone');
  assert.deepEqual(d1.spark, [100, 120, 90, 80]);
});
test('department speed needs more than 30 worked minutes; downtime by reason over a window', () => {
  assert.deepEqual(deptSpeed(H, now, 30).map(d => [d.dept, d.rate]), [['021', 111.4]]);
  assert.equal(deptSpeed([H[3]], now, 30).length, 0);
  const dt = downtimeBy(H, now, null); assert.equal(dt.total, 35); assert.equal(dt.rows[0].reason, 'nostock'); assert.equal(dt.rows[0].mins, 30); assert.equal(dt.rows[0].trucks, 2);
  assert.equal(downtimeBy(H, now, 7).total, 15);
});
test('team CSV: BOM, header, rows', () => {
  const csv = teamCsv(H, now, 30);
  assert.ok(csv.startsWith('﻿decanter,trucks,pallets,cartons,worked mins,rate ctn/h\n'));
  assert.match(csv, /\nD1,4,14,390,240,97\.5\n/);
});
test('the live truck: pace points, rate per person against the norm, insights', () => {
  const t = { id: '2026-10-05-T1', landedAt: '2026-10-05T08:00:00Z', decantStartAt: '2026-10-05T08:00:00Z', halts: [], breaks: [], team: [{ pid: 'D1' }], goalAt: '2026-10-05T09:00:00Z', pallets: {
    A1: { ref: 'A1', status: 'done', cartons: 30, doneAt: '2026-10-05T08:30:00Z', segments: [{ pid: 'D1', start: '2026-10-05T08:00:00Z', end: '2026-10-05T08:30:00Z' }] },
    A2: { ref: 'A2', status: 'active', cartons: 20, expectedMins: 10, segments: [{ pid: 'D1', start: '2026-10-05T08:30:00Z' }] },
  } };
  const at = Date.parse('2026-10-05T08:50:00Z');
  assert.deepEqual(pacePoints(t, at).map(p => p.ctn), [0, 30, 30]);
  const p = personNow(t, at, { D1: { eligible: true, rate28d: 100 } })[0];
  assert.equal(p.rate, 36); assert.equal(p.delta, -64); assert.ok(p.low); assert.equal(p.onNow, 'A2');
  const text = insights(t, at, { rates: { D1: { eligible: true, rate28d: 100 } } }).map(x => x.text).join(' | ');
  assert.match(text, /D1 is 64% under/); assert.match(text, /A2 is 10 min over/);
});

test('arrivalsByWeek: cartons a week by department from finished trucks, gap weeks zero, a trend once four weeks are active', async () => {
  const { arrivalsByWeek } = await import('../../shared/dockstats.js');
  const row = (date, depts, cartons) => ({ id: `${date}-T1`, date, cartons, byDept: Object.entries(depts).map(([dept, c]) => ({ dept, cartons: c, pallets: 1 })) });
  const history = [
    row('2026-09-28', { 101: 100, 205: 50 }, 150), row('2026-10-01', { 101: 20 }, 40),   // the same week; the second truck's manifest named only 20 of 40
    row('2026-10-12', { '205/101': 120 }, 120), row('2026-10-19', { 101: 200 }, 200), row('2026-10-22', { 312: 10 }, 10),
    row('2026-06-01', { 101: 999 }, 999),   // before the window
  ];
  const r = arrivalsByWeek(history, { weeks: 4, today: '2026-10-22' });
  assert.deepEqual(r.weeks.map(w => w.wk), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepEqual(r.weeks.map(w => w.cartons), [190, 0, 120, 210], 'a truck counts its whole cartons even when the manifest named fewer');
  assert.deepEqual(r.weeks[0].depts, { 101: 120, 205: 50 });
  assert.deepEqual(r.weeks[2].depts, { 205: 120 }, 'a mixed consol counts to its biggest department');
  assert.deepEqual(r.depts[0], ['101', 320]);
  assert.equal(r.callouts.trucks, 5); assert.equal(r.callouts.busiest, '2026-10-19');
  assert.equal(r.callouts.trend, null, 'three active weeks: no trend yet');
  const all = arrivalsByWeek(history, { weeks: 'all', today: '2026-10-22' });
  assert.equal(all.weeks[0].wk, '2026-06-01'); assert.ok(all.callouts.trend != null);
  assert.deepEqual(arrivalsByWeek([], { weeks: 4, today: '2026-10-22' }).callouts.trucks, 0);
});
