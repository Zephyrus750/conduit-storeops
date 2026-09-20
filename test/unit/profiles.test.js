// Carton profiles from manifest documents: mode units per carton,
// consistency, last arrival, pack changes, and the depth chip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfiles, depthOf } from '../../shared/profiles.js';

const man = (manNo, despatch, lines) => ({ manNo, despatch, consols: [{ id: '1', cartons: 9, items: lines.map(([k, q, c]) => ({ k, q, c })) }] });

test('buildProfiles: units per carton by keycode, the mode wins, arrivals in date order', () => {
  const docs = [
    man('7031440', '01/09/2026', [['43307685', 48, 2], ['42977636', 12, 1]]),
    man('7031471', '03/09/2026', [['43307685', 72, 3], ['42977636', 24, 2], ['99', 5, 1]]),
    man('7031482', '05/09/2026', [['43307685', 24, 1], ['42977636', 6, 1]]),
  ];
  const doc = buildProfiles(docs, { store: '1241', now: new Date('2026-09-06T00:00:00Z') });
  assert.equal(doc.schema, 'dv-profiles/1'); assert.equal(doc.store, '1241'); assert.equal(doc.trucks_sampled, 3); assert.equal(doc.keycodes, 2, 'a two-digit code is not a keycode');
  const p = doc.profiles['43307685'];
  assert.equal(p.ctn, 24); assert.equal(p.trucks, 3); assert.equal(p.consistency, 1);
  assert.deepEqual(p.last_arrival, { date: '2026-09-05', units: 24, cartons: 1, manNo: '7031482' });
  assert.deepEqual(p.arrivals.map(a => a.date), ['2026-09-01', '2026-09-03', '2026-09-05']);
  const q = doc.profiles['42977636'];
  assert.equal(q.ctn, 12); assert.equal(q.consistency, 0.67, 'two of three manifests agreed on 12'); assert.equal(q.pack_change, undefined);
});

test('buildProfiles: a pack change when the latest manifests agree on a new value', () => {
  const docs = [man('a', '01/08/2026', [['43302210', 36, 1]]), man('b', '08/08/2026', [['43302210', 72, 2]]), man('c', '15/08/2026', [['43302210', 24, 1]]), man('d', '22/08/2026', [['43302210', 48, 2]])];
  const p = buildProfiles(docs).profiles['43302210'];
  assert.equal(p.ctn, 24); assert.deepEqual(p.pack_change, { prev_ctn: 36, since_trucks: 2, changed: '2026-08-15' });
  assert.deepEqual(buildProfiles([]).profiles, {});
  assert.equal(buildProfiles([man('x', 'no date', [['43302210', 36, 1]])]).keycodes, 0, 'a manifest with no usable date is skipped');
});

test('depthOf: the chip text and whether the arrival is recent', () => {
  const now = Date.parse('2026-09-06T00:00:00');
  assert.deepEqual(depthOf({ ctn: 24, last_arrival: { date: '2026-09-05' } }, now), { ctn: 24, days: 1, recent: true, text: '▤ 24/ctn · 1d ago' });
  assert.equal(depthOf({ ctn: 6, last_arrival: { date: '2026-08-01' } }, now).recent, false);
  assert.equal(depthOf({ ctn: 6 }, now).text, '▤ 6/ctn');
  assert.equal(depthOf(null), null);
});
