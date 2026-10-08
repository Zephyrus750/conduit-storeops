import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';
import { markerGlyph } from '../../shared/maprender.js';

// October audit §1: a refused event leaves the state exactly as it was, and
// a few event shapes are checked at the source.
let clock = Date.parse('2026-09-07T00:00:00Z');
const ev = (type, entity, payload = {}, role = 'dock') => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role, device: 'D1', owner: false }, at: new Date(clock += 60_000).toISOString(), v: 1,
});
const T1 = '2026-09-07-T1';
const cons = (n, cartons) => ({ cons: String(400000000 + n), cartons, dept: '021' });
function dock() {
  const s = initialState();
  for (const e of [ev('truck.create', { truck: T1 }), ev('truck.setLive', { truck: T1 }), ev('truck.team.set', { truck: T1 }, { team: ['D1', 'D2'] }),
    ev('pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 40 }), ev('pallet.land', { truck: T1, bay: 'A2' }, { ptype: 'chep', cartons: 30 }),
    ev('manifest.attach', { truck: T1 }, { manNo: 'M1', consols: [cons(1, 40), cons(2, 30)] })]) assert.equal(apply(s, e), null, e.type);
  return s;
}
const same = (s, f) => { const before = JSON.stringify(s); const r = f(); assert.ok(r && r.code, 'refused'); assert.equal(JSON.stringify(s), before, 'state unchanged'); return r; };

test('refused events change nothing: issue, pallet, planner slot, late links, photos, re-adds, presets', () => {
  const s = dock();
  apply(s, ev('issue.log', { issue: 'i1' }, { cat: 'leak', title: 'Drip', sev: 1 }, 'floor'));
  same(s, () => apply(s, ev('issue.update', { issue: 'i1' }, { title: 'Changed', note: 'x', sev: 9 }, 'floor')));
  same(s, () => apply(s, ev('issue.update', { issue: 'i1' }, { title: 'Changed', cat: 'nope' }, 'floor')));
  same(s, () => apply(s, ev('issue.photo', { issue: 'i1' }, { photo: 'bad' }, 'floor')));
  same(s, () => apply(s, ev('issue.photo', { issue: 'i1' }, { photo: '01J00000000000000000000000', remove: true }, 'floor')));
  same(s, () => apply(s, ev('pallet.update', { truck: T1, bay: 'A1' }, { ptype: 'loscam', cartons: -4 })));
  same(s, () => apply(s, ev('plan.set', { date: '2026-09-09', slot: '1' }, { eta: '05:00', note: 'x', huddleMins: 500 })));
  same(s, () => apply(s, ev('plan.set', { date: '2026-09-09', slot: '1' }, { eta: '05:00', manifest: { manNo: '<img src=x>' } })));
  assert.equal(s.plan.days['2026-09-09'], undefined);
  apply(s, ev('truck.finalise', { truck: T1 }, {}, 'manager'));
});

test('late links: a batch with one bad basis links nothing', () => {
  const s = initialState();
  for (const e of [ev('truck.create', { truck: T1 }), ev('truck.setLive', { truck: T1 }), ev('truck.team.set', { truck: T1 }, { team: ['D1'] }),
    ev('pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep' }), ev('pallet.land', { truck: T1, bay: 'A2' }, { ptype: 'chep' }),
    ev('manifest.attach', { truck: T1 }, { manNo: 'M1', consols: [cons(1, 40), cons(2, 30)] })]) apply(s, e);
  same(s, () => apply(s, ev('manifest.linkLate', { truck: T1 }, { links: [{ bay: 'A1', consolIds: ['400000001'], basis: 'scan' }, { bay: 'A2', consolIds: ['400000002'], basis: 'guess' }] }, 'manager')));
});

test('manifest numbers are checked where they enter: attach and planner slots', () => {
  const s = initialState(); apply(s, ev('truck.create', { truck: T1 }));
  assert.equal(apply(s, ev('manifest.attach', { truck: T1 }, { manNo: '"><b>x', consols: [cons(1, 4)] })).code, 'invalid_event');
  assert.equal(apply(s, ev('plan.set', { date: '2026-09-09', slot: '2' }, { manifest: { manNo: 'M-77' } })), null);
  assert.deepEqual(s.plan.days['2026-09-09'].slots[2].manifest.consols, [], 'a slot manifest always has a consolidation list');
  assert.equal(apply(s, ev('plan.set', { date: '2026-09-09', slot: '2' }, { manifest: null })), null);
});

test('starting a pallet someone is on is refused; the same person twice is a no-op; a done pallet says so', () => {
  const s = dock();
  assert.equal(apply(s, ev('pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D1' })), null);
  const before = JSON.stringify(s);
  assert.equal(apply(s, ev('pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D1' })), null);
  assert.equal(JSON.stringify(s), before);
  const r = same(s, () => apply(s, ev('pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D2' })));
  assert.equal(r.code, 'pallet_running'); assert.match(r.message, /D1/);
  apply(s, ev('pallet.done', { truck: T1, bay: 'A1' }));
  assert.equal(apply(s, ev('pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D2' })).code, 'pallet_done');
});

test('issue text is capped', () => {
  const s = initialState();
  apply(s, ev('issue.log', { issue: 'i2' }, { cat: 'other', title: 'x'.repeat(500), note: 'y'.repeat(5000), loc: 'z'.repeat(200) }, 'floor'));
  const i = s.issues.i2; assert.equal(i.title.length, 120); assert.equal(i.note.length, 1000); assert.equal(i.loc.length, 60);
  apply(s, ev('issue.update', { issue: 'i2' }, { note: 'n'.repeat(3000) }, 'floor')); assert.equal(s.issues.i2.note.length, 1000);
});

test('marker glyph colours from a published map are a hex or a name, nothing else', () => {
  assert.match(markerGlyph('aed', '#eab308'), /stroke="#eab308"/);
  assert.doesNotMatch(markerGlyph('aed', 'x" onload="alert(1)'), /onload/);
});

// October audit, wrong numbers: days are the store's days, not UTC's.
test('a late manifest on a truck finalised today counts today on the store clock', () => {
  const s = dock();
  apply(s, { ...ev('truck.finalise', { truck: T1 }, {}, 'manager'), at: '2026-09-07T11:00:00+08:00' });
  // 6:30am on the 7th in Perth is still the 6th in UTC.
  const early = { ...ev('manifest.linkLate', { truck: T1 }, { links: [{ bay: 'A1', consolIds: ['400000001'], basis: 'scan' }] }, 'manager'), at: '2026-09-06T22:30:00.000Z' };
  assert.notEqual(apply(s, early)?.code, 'truck_closed');
  const nextDay = { ...ev('manifest.linkLate', { truck: T1 }, { links: [{ bay: 'A2', consolIds: ['400000002'], basis: 'scan' }] }, 'manager'), at: '2026-09-07T16:30:00.000Z' };
  assert.equal(apply(s, nextDay).code, 'truck_closed', '00:30 on the 8th in Perth');
});

test('a service due date follows the store day', () => {
  const s = initialState();
  apply(s, { ...ev('asset.service', { asset: 'aed1' }, {}, 'floor'), at: '2026-09-30T17:00:00.000Z' });   // 1am on 1 October in Perth
  assert.equal(s.assets.aed1.due, '2027-10-01');
  apply(s, { ...ev('asset.schedule', { asset: 'aed1' }, { months: 6 }, 'manager'), at: '2026-10-02T00:00:00.000Z' });
  assert.equal(s.assets.aed1.due, '2027-04-01');
});
