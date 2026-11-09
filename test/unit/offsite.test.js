// Off-site pallets by manifest (the 6 Nov 2026 off-site design, boards 5–7):
// a whole truck marked off-site lists its consols on the register; Send to
// off-site takes pallets off a truck's grid onto it; Call back plans the
// truck that brings them home; each is ticked off as it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { liveAudit } from '../../shared/reducers/backdock.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { validateEvent } from '../../shared/validate.js';
import { ulid } from '../../shared/ulid.js';
import { offsiteGroups, backOn, offsiteRow } from '../../shared/offsite.js';

let clock = Date.parse('2026-11-03T22:00:00Z');   // Wed 4 Nov, 06:00 in Perth
const ev = (type, entity, payload = {}, role = 'manager') => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role, device: 'MGR1', owner: false }, at: new Date(clock += 60_000).toISOString(), v: 1 });
const ok = (s, ...a) => assert.equal(apply(s, ev(...a)), null, a[0]);
const code = (s, ...a) => apply(s, ev(...a))?.code;
const id9 = n => String(601900020 + n);
const ref = (manNo, n) => ({ ref: true, manNo, n, cartons: n * 4, ids: Array.from({ length: n }, (_, i) => id9(i + 1)) });
const reg = s => s.inventory.offsite;

test('a whole truck marked off-site lists its consols under its manifest, sent that day, back on its lands day', () => {
  const s = initialState(), D = '2026-11-03';
  ok(s, 'plan.set', { date: D, slot: 1 }, { eta: '06:30', manifest: ref('7040201', 3) });
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: 'offsite', lands: '2026-11-09', pallets: [{ id: id9(1), ctn: 6, depts: ['047/085'] }, { id: id9(2), ctn: 4, depts: [['024', 4, 30]] }, { id: id9(3), ctn: 5 }] });
  assert.deepEqual(Object.keys(reg(s)).sort(), [id9(1), id9(2), id9(3)]);
  const r = reg(s)[id9(1)];
  assert.equal(r.man, '7040201'); assert.equal(r.via, 'route'); assert.deepEqual(r.from, { date: D, slot: 1 });
  assert.equal(r.sent, D); assert.equal(r.cb, '2026-11-09'); assert.equal(r.ctn, 6); assert.deepEqual(r.depts, ['047', '085']);
  assert.deepEqual(reg(s)[id9(2)].depts, ['024'], 'a report’s mix gives its departments');
  // A new lands day moves the callbacks that followed the old one.
  ok(s, 'inventory.offsite.update', { pid: id9(3) }, { cb: '2026-11-20' });
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: 'offsite', lands: '2026-11-12' });
  assert.equal(reg(s)[id9(1)].cb, '2026-11-12'); assert.equal(reg(s)[id9(3)].cb, '2026-11-20', 'a callback set by hand stays');
  assert.equal(reg(s)[id9(1)].ctn, 6, 'details already read are kept');
  // The master list replaces only its own rows.
  ok(s, 'inventory.offsite.set', {}, { rows: [{ pid: '51', sent: '2026-10-20', desc: 'Xmas overflow' }] });
  assert.equal(Object.keys(reg(s)).length, 4, 'the manifest’s pallets stay when the master list is read');
  // Received by hand, then Receive here: the rest come off, the received one stays.
  ok(s, 'inventory.offsite.update', { pid: id9(2) }, { rec: '2026-11-05' });
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: null });
  assert.deepEqual(Object.keys(reg(s)).sort(), ['51', id9(2)]);
  // Diverted lists nothing.
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: 'diverted', to: '1187 Bunbury' });
  assert.equal(Object.keys(reg(s)).length, 2);
});

test('plan.route refuses bad pallets and leaves the register untouched', () => {
  const s = initialState(), D = '2026-11-03';
  const before = JSON.stringify(s);
  assert.equal(code(s, 'plan.route', { date: D, slot: 1 }, { route: 'offsite', pallets: [{ id: '123' }] }), 'invalid_event');
  assert.equal(code(s, 'plan.route', { date: D, slot: 1 }, { route: 'offsite', pallets: 'all' }), 'invalid_event');
  assert.equal(JSON.stringify(s), before);
});

// Fri 6 Nov: Truck 1 lands 7040203; four pallets nobody has started go off-site.
function dockDay() {
  const s = initialState(), T = '2026-11-06-T1';
  ok(s, 'truck.create', { truck: T }); ok(s, 'truck.setLive', { truck: T }); ok(s, 'truck.team.set', { truck: T }, { team: ['D4'] });
  const consols = [1, 2, 3, 4, 5, 6].map(n => ({ cons: id9(10 + n), cartons: n + 2, dept: n === 1 ? '001/090' : '085', mix: n === 1 ? [['001', 3, 20], ['090', 1, 5]] : [], items: [{ k: '43166022', q: 4 }] }));
  ok(s, 'manifest.attach', { truck: T }, { manNo: '7040203', consols });
  for (const [i, bay] of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].entries()) { ok(s, 'pallet.land', { truck: T, bay }, { ptype: 'chep', cartons: i + 3 }); ok(s, 'pallet.scan', { truck: T, bay }, { code: id9(11 + i) }); }
  ok(s, 'plan.queues', { truck: T }, { queues: { D4: ['A5', 'A1'] } });
  ok(s, 'pallet.start', { truck: T, bay: 'A1' }, { pid: 'D4' });
  return { s, T };
}

test('Send to off-site: the pallets leave the grid for the register under the manifest; managers only; started ones refused', () => {
  const { s, T } = dockDay();
  assert.equal(validateEvent(ev('pallet.offsite', { truck: T }, { bays: ['A5'] }, 'dock')), null, 'the envelope is fine');
  assert.deepEqual(CATALOGUE['pallet.offsite'].roles, ['manager'], 'managers only');
  const before = JSON.stringify(s);
  assert.equal(code(s, 'pallet.offsite', { truck: T }, { bays: ['A5', 'A1'] }), 'pallet_started', 'A1 is being decanted');
  assert.equal(code(s, 'pallet.offsite', { truck: T }, { bays: ['B9'] }), 'not_found');
  assert.equal(code(s, 'pallet.offsite', { truck: T }, { bays: [] }), 'invalid_event');
  assert.equal(code(s, 'pallet.offsite', { truck: T }, { bays: ['A5'], cb: '12/11/2026' }), 'invalid_event');
  assert.equal(JSON.stringify(s), before, 'a refused send changes nothing');
  const ctnA5 = s.dock.trucks[T].pallets.A5.cartons;
  ok(s, 'pallet.offsite', { truck: T }, { bays: ['A5', 'a6'], cb: '2026-11-12', req: 'Jess', note: 'no room' });
  const t = s.dock.trucks[T];
  assert.equal(t.pallets.A5, undefined); assert.equal(t.pallets.A6, undefined); assert.equal(Object.keys(t.pallets).length, 4);
  assert.deepEqual(t.offsite.map(o => o.ref), ['A5', 'A6']);
  assert.deepEqual(t.plan.queues.D4, ['A1'], 'its queue forgets the bay');
  const r = reg(s)[id9(15)];
  assert.equal(r.man, '7040203'); assert.equal(r.via, 'dock'); assert.equal(r.truck, T); assert.equal(r.bay, 'A5');
  assert.equal(r.ctn, ctnA5); assert.equal(r.cb, '2026-11-12'); assert.equal(r.req, 'Jess'); assert.equal(r.of, 6, 'six pallets were on the truck');
  assert.equal(r.sent, '2026-11-04', 'sent on the store’s day'); assert.deepEqual(r.products, [{ kc: '43166022', q: 4 }]);
  const a = liveAudit(t);
  assert.equal(a.total, 4, 'the truck no longer answers for the consols that went off-site'); assert.equal(a.missing, 0);
  // A pallet with no label goes under its truck and bay.
  ok(s, 'pallet.land', { truck: T, bay: 'B1' }, { ptype: 'bulk', cartons: 2 });
  ok(s, 'pallet.offsite', { truck: T }, { bays: ['B1'] });
  assert.ok(reg(s)[`${T}-B1`], 'no consol: its truck and bay name it');
  assert.equal(reg(s)[`${T}-B1`].of, 7);
  // Scanning it again on its own truck is not "back".
  assert.equal(r.rec, '');
});

test('Call back: the planned truck names what it brings back; a pallet ticks off as it lands; Remove truck puts them back off-site', () => {
  const { s, T } = dockDay();
  ok(s, 'pallet.offsite', { truck: T }, { bays: ['A5', 'A6'], cb: '2026-11-12' });
  ok(s, 'inventory.load.add', { load: 'L1' }, { label: 'Xmas overflow', date: '2026-10-20', status: 'offsite', pallets: [{ pid: '51', items: [{ k: '43166022', q: 10, dept: '085' }] }] });
  const D = '2026-11-09';
  const before = JSON.stringify(s);
  assert.equal(code(s, 'plan.set', { date: D, slot: 2 }, { pids: ['nope'] }), 'not_found');
  assert.equal(code(s, 'plan.set', { date: D, slot: 2 }, { load: 'L9' }), 'not_found');
  assert.equal(code(s, 'plan.set', { date: D, slot: 2 }, { pids: 'all' }), 'invalid_event');
  assert.equal(JSON.stringify(s), before, 'refused: nothing changed');
  ok(s, 'plan.set', { date: D, slot: 2 }, { eta: '10:00', from: { date: '2026-11-06', slot: 1 }, pids: [id9(15), id9(16)], load: 'L1' });
  assert.deepEqual(reg(s)[id9(15)].call, { date: D, slot: 2 });
  assert.deepEqual(s.inventory.loads.L1.call, { date: D, slot: 2 });
  ok(s, 'plan.remove', { date: D, slot: 2 });
  assert.equal(reg(s)[id9(15)].call, undefined, 'removing the truck puts them back off-site');
  assert.equal(s.inventory.loads.L1.call, undefined);
  ok(s, 'plan.set', { date: D, slot: 2 }, { eta: '10:00', pids: [id9(15), id9(16)] });
  // Truck 1 closes without them; Monday's Truck 2 lands them (no manifest).
  ok(s, 'pallet.done', { truck: T, bay: 'A1' });
  for (const b of ['A2', 'A3', 'A4']) { ok(s, 'pallet.start', { truck: T, bay: b }, { pid: 'D4' }); ok(s, 'pallet.done', { truck: T, bay: b }); }
  ok(s, 'truck.finalise', { truck: T });
  const T2 = `${D}-T2`;
  ok(s, 'truck.create', { truck: T2 }); ok(s, 'truck.setLive', { truck: T2 });
  assert.deepEqual(backOn(s.inventory, T2), { n: 2, back: 0, sent: '2026-11-04' });
  ok(s, 'pallet.land', { truck: T2, bay: 'A1' }, { ptype: 'chep', cartons: 7 });
  ok(s, 'pallet.update', { truck: T2, bay: 'A1' }, { scanIds: [id9(15)] });
  const r = reg(s)[id9(15)];
  assert.equal(r.rec, D, 'back on the day it landed'); assert.equal(r.recTruck, T2);
  assert.equal(s.dock.trucks[T2].pallets.A1.lateFrom, undefined, 'back from off-site is not a late arrival');
  assert.deepEqual(backOn(s.inventory, T2), { n: 2, back: 1, sent: '2026-11-04' });
  // A wrong scan comes off: the pallet is off-site again.
  ok(s, 'pallet.unscan', { truck: T2, bay: 'A1' }, { id: id9(15) });
  assert.equal(reg(s)[id9(15)].rec, ''); assert.equal(reg(s)[id9(15)].recTruck, undefined);
  assert.equal(code(s, 'plan.set', { date: D, slot: 2 }, { pids: [id9(16)] }), 'on_dock', 'a truck that came keeps what it brought');
});

test('a whole off-site truck called back with its manifest: each consol ticks off as it is scanned', () => {
  const s = initialState(), D = '2026-11-03', L = '2026-11-09';
  ok(s, 'plan.set', { date: D, slot: 1 }, { manifest: ref('7040201', 2) });
  ok(s, 'plan.route', { date: D, slot: 1 }, { route: 'offsite', lands: L });
  ok(s, 'plan.set', { date: L, slot: 2 }, { from: { date: D, slot: 1 }, manifest: ref('7040201', 2), pids: [id9(1), id9(2)] });
  const T = `${L}-T2`;
  ok(s, 'truck.create', { truck: T }); ok(s, 'truck.setLive', { truck: T });
  ok(s, 'manifest.attach', { truck: T }, { manNo: '7040201', consols: [{ cons: id9(1), cartons: 6 }, { cons: id9(2), cartons: 4 }] });
  ok(s, 'pallet.land', { truck: T, bay: 'A1' }, { ptype: 'chep', cartons: 6 });
  ok(s, 'pallet.scan', { truck: T, bay: 'A1' }, { code: id9(1) });
  assert.equal(reg(s)[id9(1)].rec, L); assert.equal(reg(s)[id9(2)].rec, '');
  // A routed truck that comes on its own day after all: its consols come off the register.
  const s2 = initialState();
  ok(s2, 'plan.set', { date: '2026-11-10', slot: 1 }, { manifest: { ...ref('7040299', 1), ids: ['601900099'] } });
  ok(s2, 'plan.route', { date: '2026-11-10', slot: 1 }, { route: 'offsite' });
  assert.ok(reg(s2)['601900099']);
  ok(s2, 'truck.create', { truck: '2026-11-10-T1' });
  assert.equal(reg(s2)['601900099'], undefined, 'it came after all');
});

test('offsiteGroups: by manifest, with each group’s state and tag', () => {
  const today = '2026-11-06';
  const row = (pid, x) => offsiteRow({ pid, ...x }, '2026-11-01T00:00:00Z', true);
  const inv = { offsite: {}, loads: { L1: { id: 'L1', label: 'Xmas overflow', date: '2026-10-20', status: 'offsite', pallets: [{ pid: '51', items: [{ k: '1', q: 3, dept: '085' }] }, { pid: '52', items: [] }] }, L2: { id: 'L2', label: 'old', status: 'received', pallets: [] } } };
  const put = r => { inv.offsite[r.pid] = r; };
  for (const n of [1, 2, 3]) put(row(id9(n), { man: '7040201', via: 'route', from: { date: '2026-11-03', slot: 1 }, sent: '2026-11-03', cb: '2026-11-09', ctn: 4 }));
  for (const n of [5, 6]) put(row(id9(n), { man: '7040203', via: 'dock', truck: '2026-11-06-T1', bay: 'A' + n, sent: '2026-11-06', cb: '2026-11-12', of: 12, ctn: 3 }));
  for (const n of [7, 8]) put(row(id9(n), { man: '7040188', via: 'route', sent: '2026-10-28', call: { date: '2026-11-07', slot: 2 } }));
  put(row('99', { sent: '2026-10-01', cb: '2026-11-02' }));
  put(row(id9(9), { man: '7040100', via: 'route', sent: '2026-10-01', rec: '2026-10-09' }));
  const g = offsiteGroups(inv, today), by = Object.fromEntries(g.map(x => [x.key, x]));
  assert.deepEqual(g.map(x => x.key), ['man:7040201', 'man:7040203', 'man:7040188', 'load:L1', 'other', 'man:7040100']);
  assert.equal(by['man:7040201'].state, 'off'); assert.equal(by['man:7040201'].cb, '2026-11-09'); assert.equal(by['man:7040201'].ctn, 12);
  assert.equal(by['man:7040203'].state, 'part'); assert.equal(by['man:7040203'].of, 12); assert.equal(by['man:7040203'].live.length, 2);
  assert.equal(by['man:7040188'].state, 'called'); assert.deepEqual(by['man:7040188'].calls, [{ date: '2026-11-07', slot: 2, n: 2 }]);
  assert.equal(by.other.state, 'overdue');
  assert.equal(by['load:L1'].kind, 'load'); assert.equal(by['load:L1'].live.length, 2); assert.deepEqual(by['load:L1'].live[0].depts, ['085']);
  assert.equal(by['man:7040100'].state, 'back', 'all back: last');
});
