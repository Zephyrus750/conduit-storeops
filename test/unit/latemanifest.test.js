import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const T1 = '2026-09-07-T1', T2 = '2026-09-08-T1';
const ev = (type, entity, payload = {}, when = '2026-09-07T08:00', role = 'dock') => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role, device: 'DK1', owner: false }, at: when + ':00+08:00', v: 1 });
const ok = (s, ...a) => assert.equal(apply(s, ev(...a)), null, a[0]);
const code = (s, ...a) => apply(s, ev(...a))?.code;
const consol = (n, cartons) => ({ cons: '0000000000' + String(n).padStart(9, '0'), cartons, dept: '021', mix: [['021', cartons, cartons * 4]] });
const man = (manNo, cs) => ({ manNo, consols: cs });

test('late manifest: pallets landed blind are linked by scan, then by a unique carton count; how is kept', () => {
  const s = initialState();
  ok(s, 'truck.create', { truck: T1 }, {}, '2026-09-07T06:00'); ok(s, 'truck.setLive', { truck: T1 }, {}, '2026-09-07T06:00');
  ok(s, 'pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 12 }, '2026-09-07T06:05');
  ok(s, 'pallet.scan', { truck: T1, bay: 'A1' }, { code: '000000111' }, '2026-09-07T06:05');        // no manifest yet: kept
  ok(s, 'pallet.land', { truck: T1, bay: 'A2' }, { ptype: 'loscam', cartons: 30 }, '2026-09-07T06:06');
  ok(s, 'manifest.attach', { truck: T1 }, man('M1', [consol(111, 12), consol(222, 30), consol(333, 5)]), '2026-09-07T07:00');
  const t = s.dock.trucks[T1];
  assert.deepEqual(t.pallets.A1.consolIds, ['000000111'], 'the saved scan matched on attach');
  ok(s, 'manifest.linkLate', { truck: T1 }, { links: [{ bay: 'A2', consolIds: ['000000222'], basis: 'cartons' }] }, '2026-09-07T07:05', 'manager');
  assert.deepEqual([t.pallets.A2.consolIds, t.pallets.A2.linkBasis], [['000000222'], 'cartons']);
  assert.equal(code(s, 'manifest.linkLate', { truck: T1 }, { links: [{ bay: 'A2', consolIds: ['000000222'], basis: 'guess' }] }, '2026-09-07T07:06', 'manager'), 'invalid_event');
  assert.equal(code(s, 'manifest.linkLate', { truck: T1 }, { links: [{ bay: 'A1', consolIds: ['000000222'], basis: 'manual' }] }, '2026-09-07T07:06', 'manager'), 'invalid_event', 'consol already on A2');
});

test('a finalised truck takes a manifest the same day, from a manager, and its history is rebuilt', () => {
  const s = initialState();
  ok(s, 'truck.create', { truck: T1 }, {}, '2026-09-07T06:00'); ok(s, 'truck.setLive', { truck: T1 }, {}, '2026-09-07T06:00');
  ok(s, 'pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 12 }, '2026-09-07T06:05');
  ok(s, 'truck.team.set', { truck: T1 }, { team: ['D1'] }, '2026-09-07T06:05');
  ok(s, 'pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D1' }, '2026-09-07T06:10'); ok(s, 'pallet.done', { truck: T1, bay: 'A1' }, {}, '2026-09-07T06:20');
  ok(s, 'truck.finalise', { truck: T1 }, {}, '2026-09-07T06:30');
  assert.equal(s.dock.history.at(-1).manifest, null);
  assert.equal(code(s, 'manifest.attach', { truck: T1 }, man('M1', [consol(111, 12)]), '2026-09-07T09:00', 'dock'), 'forbidden');
  assert.equal(code(s, 'manifest.attach', { truck: T1 }, man('M1', [consol(111, 12)]), '2026-09-08T09:00', 'manager'), 'truck_closed', 'next day');
  ok(s, 'manifest.attach', { truck: T1 }, man('M1', [consol(111, 12)]), '2026-09-07T09:00', 'manager');
  ok(s, 'manifest.linkLate', { truck: T1 }, { links: [{ bay: 'A1', consolIds: ['000000111'], basis: 'manual' }] }, '2026-09-07T09:01', 'manager');
  const row = s.dock.history.at(-1);
  assert.equal(row.manifest.manNo, 'M1'); assert.equal(row.audit.matched, 1);
  assert.deepEqual(row.perDept.map(d => d.dept), ['021'], 'per-department minutes by the consol mix');
});

test('the ledger: a consol scanned off-manifest that was manifested to an earlier truck is a late arrival', () => {
  const s = initialState();
  ok(s, 'truck.create', { truck: T1 }, {}, '2026-09-07T06:00'); ok(s, 'truck.setLive', { truck: T1 }, {}, '2026-09-07T06:00');
  ok(s, 'manifest.attach', { truck: T1 }, man('M1', [consol(444, 8)]), '2026-09-07T06:01');
  ok(s, 'truck.finalise', { truck: T1 }, {}, '2026-09-07T07:00');
  ok(s, 'truck.create', { truck: T2 }, {}, '2026-09-08T06:00'); ok(s, 'truck.setLive', { truck: T2 }, {}, '2026-09-08T06:00');
  ok(s, 'pallet.land', { truck: T2, bay: 'B1' }, { ptype: 'loscam', cartons: 8 }, '2026-09-08T06:05');
  ok(s, 'pallet.update', { truck: T2, bay: 'B1' }, { scanIds: ['000000444'] }, '2026-09-08T06:06');
  assert.deepEqual(s.dock.trucks[T2].pallets.B1.lateFrom, { t: T1, d: '2026-09-07' });
  assert.equal(s.dock.ledger['000000444'].length, 2);
});
