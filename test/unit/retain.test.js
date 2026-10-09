// Retention (decision 29): full detail for 14 days, summaries for 60, older
// rows on the worker only (its archive table).
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { retain, retiring, rowKey } from '../../shared/retain.js';
import { historyRows } from '../../shared/records.js';
import { storeKpis } from '../../shared/kpis.js';

const DAY = '2026-10-08';
const sub = (bay, date, status = 'submitted', n = 3) => ({ bay, date, status, codes: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(43000000 + i), { scanned: i > 0 }])), incorrect: [], system: ['43000000'], metrics: { expected: n, scanned: n - 1, match: n - 1, accuracy: 67, incorrect: 0 }, readyAt: `${date}T02:00:00+08:00`, submittedDoneAt: `${date}T03:00:00+08:00` });
function aged() {
  const s = initialState();
  for (const x of [sub('7012', '2026-10-07'), sub('7014', '2026-09-20'), sub('7016', '2026-07-01'), sub('7018', '2026-07-01', 'pending')]) s.backfill.subs[`${x.bay}:${x.date}`] = x;
  s.backfill.requested = { '2026-10-07': ['7012'], '2026-09-01': ['7014'] };
  s.backfill.claims = { 7012: { device: 'D1', at: '2026-10-08T01:00:00+08:00' }, 7014: { device: 'D2', at: '2026-10-01T01:00:00+08:00' } };
  s.adjustments = { '2026-10-01': { 43000001: { qty: -2 } }, '2026-07-01': { 43000002: { qty: -1 } } };
  s.daylist = { '2026-10-07': {}, '2026-09-01': {} };
  s.dock.trucks = {
    '2026-10-07-T1': { status: 'closed', manifest: { consols: [{ cons: '1', items: [{ k: '1' }] }] } },
    '2026-09-20-T1': { status: 'closed', manifest: { consols: [{ cons: '1', items: [{ k: '1' }] }] } },
    '2026-07-01-T1': { status: 'closed' }, '2026-07-02-T1': { status: 'live' },
  };
  s.dock.history = Array.from({ length: 503 }, (_, i) => ({ id: `T${String(i).padStart(3, '0')}`, date: '2026-07-01', cartons: i }));
  s.plan.days = { '2026-10-09': {}, '2026-07-01': {} };
  s.refresh.weeks = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`2026-W${String(i + 20).padStart(2, '0')}`, {}]));
  s.stocktake.sessions = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`st${i}`, { ended: true, startedAt: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z` }]));
  s.stocktake.sessions.live = { startedAt: '2026-01-01T00:00:00Z' };
  s.issues = { old: { status: 'completed', updated: '2026-03-01T00:00:00Z' }, open: { status: 'open', updated: '2026-01-01T00:00:00Z' }, recent: { removed: true, updated: '2026-09-01T00:00:00Z' } };
  s.inventory.loads = { L1: { status: 'received', recvDate: '2026-09-01', pallets: [{ pid: 'p1', items: [{ k: '1', q: 4, dept: '021' }, { k: '2', q: 2, dept: '021' }] }, { pid: 'p2', items: [{ k: '3', q: 5, dept: '030' }] }] }, L2: { status: 'received', recvDate: '2026-10-05', pallets: [{ pid: 'p1', items: [] }] } };
  s.devices = { D1: { last: '2026-10-08T00:00:00Z' }, D9: { last: '2026-07-01T00:00:00Z' } };
  return s;
}

test('retain: 14 days in full, 60 days summarised, pending work and open issues never touched', () => {
  const s = aged(), done = retain(s, DAY);
  const subs = s.backfill.subs;
  assert.equal(Object.keys(subs['7012:2026-10-07'].codes).length, 3, 'yesterday keeps its codes');
  const t = subs['7014:2026-09-20'];
  assert.deepEqual([t.trimmed, t.codes, t.codeCount, t.scannedCount, t.system, t.metrics.accuracy], [true, {}, 3, 2, undefined, 67], 'older than 14 days: counts and metrics stay');
  assert.equal(subs['7016:2026-07-01'], undefined, 'older than 60 days: gone');
  assert.ok(subs['7018:2026-07-01'], 'a pending bay is never dropped');
  assert.deepEqual(Object.keys(s.backfill.requested), ['2026-10-07']);
  assert.deepEqual(Object.keys(s.backfill.claims), ['7012'], 'a claim from a week ago is released');
  assert.deepEqual(Object.keys(s.adjustments), ['2026-10-01']);
  assert.deepEqual(Object.keys(s.daylist), ['2026-10-07']);
  assert.equal(s.dock.trucks['2026-10-07-T1'].manifest.consols[0].items.length, 1);
  assert.equal(s.dock.trucks['2026-09-20-T1'].manifest.consols[0].items.length, 0, 'a two-week-old truck drops its item lines');
  assert.equal(s.dock.trucks['2026-07-01-T1'], undefined); assert.ok(s.dock.trucks['2026-07-02-T1'], 'a truck still live stays');
  assert.equal(s.dock.history.length, 500); assert.equal(s.dock.history[0].id, 'T003', 'the oldest rows go');
  assert.deepEqual(Object.keys(s.plan.days), ['2026-10-09']);
  assert.equal(Object.keys(s.refresh.weeks).length, 13); assert.ok(s.refresh.weeks['2026-W34'] && !s.refresh.weeks['2026-W21']);
  assert.equal(Object.keys(s.stocktake.sessions).length, 11, 'the 10 newest ended stocktakes and the running one');
  assert.ok(s.stocktake.sessions.live && s.stocktake.sessions.st11 && !s.stocktake.sessions.st0 && !s.stocktake.sessions.st1);
  assert.deepEqual(Object.keys(s.issues).sort(), ['open', 'recent']);
  const L1 = s.inventory.loads.L1;
  assert.deepEqual([L1.summary, L1.cartons, L1.pallets[0].items.map(i => [i.dept, i.q])], [true, 2, [['021', 6], ['030', 5]]]);
  assert.ok(!s.inventory.loads.L2.summary);
  assert.deepEqual(Object.keys(s.devices), ['D1']);
  assert.equal(done.backfill, 1); assert.equal(done.backfillTrimmed, 1); assert.equal(done.dockHistory, 3);
  assert.deepEqual(retain(s, DAY), { refreshWeeks: 0, labelCycles: 0 }, 'a second run the same day finds nothing to do');
});

test('retiring: the rows the next retain drops, so the worker can archive them first', () => {
  const s = aged(), out = retiring(s, DAY);
  assert.deepEqual(out.filter(a => a.kind === 'backfill').map(a => a.key), ['7016:2026-07-01']);
  assert.deepEqual(out.filter(a => a.kind === 'adjustments').map(a => a.key), ['2026-07-01:43000002']);
  assert.deepEqual(out.filter(a => a.kind === 'receiving').map(a => a.key).sort(), ['T000', 'T001', 'T002']);
  const before = historyRows(s, 'backfill').find(r => r.bay === '7016');
  assert.deepEqual(out[0].row, before, 'archived as History shows it');
  retain(s, DAY);
  for (const a of out) assert.ok(!historyRows(s, a.kind).some(r => rowKey(a.kind, r) === a.key), `${a.key} left the live state`);
  assert.equal(historyRows(s, 'backfill').find(r => r.bay === '7014').codes, 3, 'a trimmed bay still counts its codes');
});

test('store.retain: logged by the worker, applied the same way everywhere, refused without a day', () => {
  const s = aged();
  const e = { id: '01J0000000000000000000RETN', store: '1241', area: 'store', type: 'store.retain', entity: {}, payload: { day: DAY }, actor: { role: 'manager', device: 'system', owner: false }, at: '2026-10-08T00:00:05+08:00', v: 1 };
  assert.equal(apply(s, e), null);
  assert.equal(s.retention.day, DAY); assert.equal(s.retention.done.backfill, 1);
  assert.equal(s.backfill.subs['7016:2026-07-01'], undefined);
  assert.equal(apply(s, { ...e, id: '01J0000000000000000000RETX', payload: { day: 'today' } }).code, 'invalid_event');
});

test('a trimmed bay cannot go back into review', () => {
  const s = aged(); retain(s, DAY);
  const r = apply(s, { id: '01J0000000000000000000REOP', store: '1241', area: 'stockroom', type: 'submission.reopen', entity: { bay: '7014', date: '2026-09-20' }, payload: {}, actor: { role: 'manager', device: 'D1', owner: false }, at: '2026-10-08T09:00:00+08:00', v: 1 });
  assert.equal(r.code, 'record_trimmed'); assert.equal(s.backfill.subs['7014:2026-09-20'].status, 'submitted');
});

test('the console says when a store nears its 2 MB', () => {
  const k = b => storeKpis(initialState(), { today: DAY, bytes: b }).alerts.map(a => a.level + ':' + a.text).join('|');
  assert.doesNotMatch(k(400_000), /MB/);
  assert.match(k(1_300_000), /warn:.*1\.3 MB/);
  assert.match(k(1_800_000), /bad:.*1\.8 MB/);
});
