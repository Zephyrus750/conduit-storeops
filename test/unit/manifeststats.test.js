import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';
import { manSummary, placeIndex, despatchDay, usualGap, suggestPlace, manifestStats } from '../../shared/manifeststats.js';

const ev = (type, entity, payload = {}, when = '2026-10-20T08:00', role = 'dock') => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role, device: 'DK1', owner: false }, at: when + ':00+08:00', v: 1 });
const ok = (s, ...a) => assert.equal(apply(s, ev(...a)), null, a[0]);
const code = (s, ...a) => apply(s, ev(...a))?.code;
const consol = (n, cartons, items) => ({ id: String(n).padStart(9, '0'), cons: '0000000000' + String(n).padStart(9, '0'), cartons, dept: items[0]?.dept || '021', mix: [], items });
const doc = (manNo, despatch, consols) => ({ manNo, despatch, dcNo: '4101533', consols });

test('manSummary: cartons, units and keycodes, by department and by keycode; a line without cartons takes its share by units', () => {
  const s = manSummary(doc('M1', '05/10/2026', [consol(1, 4, [{ k: '43307685', q: 12, dept: '024', c: 1 }, { k: '42977636', q: 6, dept: '070' }]), consol(2, 2, [])]));
  assert.equal(s.consols, 2); assert.equal(s.cartons, 6); assert.equal(s.units, 18); assert.equal(s.keycodes, 2);
  assert.deepEqual(s.kc['43307685'], [12, 1, '024'], 'logged cartons win');
  assert.deepEqual(s.kc['42977636'], [6, 1.3, '070'], 'a third of the consol’s four cartons by units');
  assert.deepEqual(s.depts['021'], [2, 0], 'a consol with no lines counts its cartons on its own department');
  assert.equal(despatchDay('05/10/2026'), '2026-10-05'); assert.equal(despatchDay('soon'), null);
});

test('manifest.day: sets, clears and caps a report’s day and truck; a report on a truck is the truck’s', () => {
  const s = initialState();
  ok(s, 'manifest.day', { manNo: 'M1' }, { day: '2026-10-14', truck: 2 });
  assert.deepEqual({ ...s.dock.manifestDays.M1, at: null }, { day: '2026-10-14', truck: 2, at: null, by: 'DK1' });
  assert.equal(code(s, 'manifest.day', { manNo: 'M1' }, { day: '2026-02-30' }), 'invalid_event', 'not a date');
  assert.equal(code(s, 'manifest.day', { manNo: 'M1' }, { day: '2026-13-45' }), 'invalid_event', 'no month 13');
  assert.equal(code(s, 'manifest.day', { manNo: 'M1' }, { day: '2026-12-01' }), 'invalid_event', 'more than two weeks ahead');
  assert.equal(code(s, 'manifest.day', { manNo: 'M1' }, { day: '2026-10-14', truck: 12 }), 'invalid_event');
  assert.equal(code(s, 'manifest.day', { manNo: 'bad no!' }, { day: '2026-10-14' }), 'invalid_event');
  assert.equal(s.dock.manifestDays.M1.truck, 2, 'a refused event leaves the day as it was');
  ok(s, 'manifest.day', { manNo: 'M1' }, { day: null });
  assert.equal(s.dock.manifestDays.M1, undefined);
  // On a truck: the truck says when it came, and attaching drops a day set by hand.
  ok(s, 'manifest.day', { manNo: 'M2' }, { day: '2026-10-19', truck: 1 });
  ok(s, 'truck.create', { truck: '2026-10-20-T1' }, {}); ok(s, 'truck.setLive', { truck: '2026-10-20-T1' }, {});
  ok(s, 'manifest.attach', { truck: '2026-10-20-T1' }, { manNo: 'M2', consols: [consol(5, 3, [{ k: '43307685', q: 3, dept: '024' }])] });
  assert.equal(s.dock.manifestDays.M2, undefined);
  assert.equal(code(s, 'manifest.day', { manNo: 'M2' }, { day: '2026-10-19' }), 'on_truck');
  // Removing the report removes its day.
  ok(s, 'manifest.day', { manNo: 'M3' }, { day: '2026-10-18' });
  apply(s, ev('manifest.remove', { manNo: 'M3' }));
  assert.equal(s.dock.manifestDays.M3, undefined);
});

test('placeIndex: a truck first, then a day set by hand, then the planner; usualGap reads the store’s own trucks', () => {
  const s = initialState();
  assert.equal(usualGap(s), 1, 'one day until the dock has trucks to learn from');
  ok(s, 'truck.create', { truck: '2026-10-20-T1' }, {}); ok(s, 'truck.setLive', { truck: '2026-10-20-T1' }, {});
  ok(s, 'manifest.attach', { truck: '2026-10-20-T1' }, { manNo: 'M1', despatch: '18/10/2026', consols: [consol(1, 3, [{ k: '1', q: 1, dept: '024' }])] });
  ok(s, 'manifest.day', { manNo: 'M2' }, { day: '2026-10-16', truck: 2 });
  ok(s, 'plan.set', { date: '2026-10-22', slot: 1 }, { manifest: { ref: true, manNo: 'M3', n: 1, cartons: 3, keycodes: 1, units: 1, ids: ['000000009'] } });
  ok(s, 'plan.set', { date: '2026-10-23', slot: 1 }, { manifest: { ref: true, manNo: 'M2', n: 1, cartons: 3, keycodes: 1, units: 1, ids: ['000000008'] } });
  const p = placeIndex(s);
  assert.deepEqual(p.get('M1'), { day: '2026-10-20', truck: 1, via: 'truck' });
  assert.deepEqual(p.get('M2'), { day: '2026-10-16', truck: 2, via: 'label' }, 'a day set by hand beats a slot');
  assert.deepEqual(p.get('M3'), { day: '2026-10-22', truck: 1, via: 'plan' });
  assert.equal(usualGap(s), 2, 'despatched the 18th, on the dock the 20th');
});

test('suggestPlace: a truck run without a manifest near the despatch day, else despatch plus the usual gap on a free number', () => {
  const s = initialState();
  ok(s, 'truck.create', { truck: '2026-10-14-T1' }, {}, '2026-10-14T06:00'); ok(s, 'truck.setLive', { truck: '2026-10-14-T1' }, {}, '2026-10-14T06:00');
  ok(s, 'plan.set', { date: '2026-10-15', slot: 2 }, { eta: '06:30' });
  // Despatched the 13th: the truck on the 14th had no manifest (one day on, the usual gap).
  assert.deepEqual(suggestPlace(s, { despatch: '13/10/2026' }), { day: '2026-10-14', truck: 1, via: 'plan' });
  // That truck given out in this batch: the next is the slot on the 15th.
  assert.deepEqual(suggestPlace(s, { despatch: '13/10/2026' }, new Set(['2026-10-14-T1'])), { day: '2026-10-15', truck: 2, via: 'plan' });
  // Both given out: a slot five days on is another report's, so despatch + 1 on the next free number.
  ok(s, 'plan.set', { date: '2026-10-19', slot: 1 }, { eta: '06:30' });
  assert.deepEqual(suggestPlace(s, { despatch: '13/10/2026' }, new Set(['2026-10-14-T1', '2026-10-15-T2'])), { day: '2026-10-14', truck: 2, via: 'despatch' });
  // Nothing planned near it: despatch + 1, truck 1, then truck 2 for a second report that day.
  assert.deepEqual(suggestPlace(s, { despatch: '01/09/2026' }), { day: '2026-09-02', truck: 1, via: 'despatch' });
  ok(s, 'manifest.day', { manNo: 'M9' }, { day: '2026-09-02', truck: 1 });
  assert.deepEqual(suggestPlace(s, { despatch: '01/09/2026' }), { day: '2026-09-02', truck: 2, via: 'despatch' });
  assert.equal(suggestPlace(s, { despatch: '' }), null, 'no despatch date: nothing to go on');
});

test('suggestPlace: a report despatched yesterday goes on the truck still to come, not on yesterday’s truck finalised without one', () => {
  const s = initialState();
  ok(s, 'truck.create', { truck: '2026-10-30-T1' }, {}, '2026-10-30T06:00'); ok(s, 'truck.setLive', { truck: '2026-10-30-T1' }, {}, '2026-10-30T06:00');
  ok(s, 'truck.finalise', { truck: '2026-10-30-T1' }, {}, '2026-10-30T15:00');
  ok(s, 'plan.set', { date: '2026-10-31', slot: 1 }, { eta: '07:00' });
  // A store whose trucks come the day they leave the DC (a usual gap of 0):
  // without today, Friday’s closed truck is the nearest match.
  assert.deepEqual(suggestPlace(s, { despatch: '30/10/2026' }, undefined, { gap: 0 }), { day: '2026-10-30', truck: 1, via: 'plan' });
  assert.deepEqual(suggestPlace(s, { despatch: '30/10/2026' }, undefined, { gap: 0, today: '2026-10-31' }), { day: '2026-10-31', truck: 1, via: 'plan' });
  // A report despatched days ago is a missed one: the closed truck still takes it.
  assert.deepEqual(suggestPlace(s, { despatch: '30/10/2026' }, undefined, { gap: 0, today: '2026-11-03' }), { day: '2026-10-30', truck: 1, via: 'plan' });
});

test('manifestStats: a period against the one before, departments, top and new keycodes, and the reports in it', () => {
  const s = initialState();
  ok(s, 'manifest.day', { manNo: 'A' }, { day: '2026-10-06', truck: 1 });
  ok(s, 'manifest.day', { manNo: 'B' }, { day: '2026-10-13', truck: 1 });
  ok(s, 'manifest.day', { manNo: 'C' }, { day: '2026-10-15', truck: 2 });
  const sums = [
    manSummary({ ...doc('A', '05/10/2026', [consol(1, 10, [{ k: '111', q: 40, dept: '024' }])]), at: '2026-10-06T09:00:00Z' }),
    manSummary({ ...doc('B', '12/10/2026', [consol(2, 6, [{ k: '111', q: 12, dept: '024' }, { k: '222', q: 12, dept: '070' }])]), at: '2026-10-13T09:00:00Z' }),
    manSummary({ ...doc('C', '14/10/2026', [consol(3, 4, [{ k: '333', q: 30, dept: '070' }])]), at: '2026-10-15T09:00:00Z' }),
    // Nothing places D: despatched the 15th, it counts on the 16th (the usual gap of one day).
    manSummary({ ...doc('D', '15/10/2026', [consol(4, 2, [{ k: '222', q: 2, dept: '070' }])]), at: '2026-10-16T09:00:00Z' }),
  ];
  const w = manifestStats(sums, s, { from: '2026-10-12', to: '2026-10-18' });
  assert.deepEqual(w.totals, { manifests: 3, trucks: 3, days: 3, consols: 3, cartons: 12, units: 56, keycodes: 3 });
  assert.equal(w.prev.from, '2026-10-05'); assert.equal(w.prev.totals.cartons, 10);
  assert.deepEqual(w.list.map(x => [x.manNo, x.day, x.truck, x.via]), [['B', '2026-10-13', 1, 'label'], ['C', '2026-10-15', 2, 'label'], ['D', '2026-10-16', null, 'despatch']]);
  assert.equal(w.newKeycodes, 2, '222 and 333 had never come before; 111 had');
  assert.deepEqual(w.fresh.map(r => r.k), ['333', '222']);
  assert.deepEqual(w.top[0], { k: '333', units: 30, cartons: 4, dept: '070', manifests: 1 });
  assert.deepEqual(w.regular.map(r => [r.k, r.manifests]), [['222', 2]]);
  assert.deepEqual(w.depts.map(d => [d.dept, d.cartons, d.keycodes]), [['070', 9, 2], ['024', 3, 1]]);
  assert.equal(w.byDay['2026-10-15'].cartons, 4);
  const all = manifestStats(sums, s);
  assert.equal(all.all, true); assert.equal(all.from, '2026-10-06'); assert.equal(all.to, '2026-10-16');
  assert.equal(all.totals.manifests, 4); assert.equal(all.prev, null); assert.equal(all.newKeycodes, null, 'all time has nothing before it');
});
