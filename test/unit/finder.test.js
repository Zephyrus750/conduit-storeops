// Search beyond the map (shared/finder.js): manifests, consolidations, cages,
// inventory loads and off-site pallets, from the state a device holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecords, recordCount } from '../../shared/finder.js';

const state = {
  dock: {
    manifests: { 'M-4471': { manNo: 'M-4471', dcNo: '8123', despatch: '552019', consols: 2, totalCartons: 70, truck: '2026-10-09-T1' } },
    trucks: {
      '2026-10-09-T1': { status: 'live', manifest: { manNo: 'M-4471', consols: [{ id: '123456789', cons: '000000000123456789', cartons: 40, dept: '021' }, { id: '987654321', cons: '000000000987654321', cartons: 30, dept: '450' }] }, carriedConsols: [], pallets: { A3: { ref: 'A3', status: 'active', consolIds: ['123456789'] } } },
    },
    ledger: { 555000111: [{ t: '2026-10-01-T1', d: '2026-10-01', k: 'man' }] },
    rollover: null,
  },
  cages: { BSN1240421: { ring: 'overstock', location: '7012', items: { 42977636: 6, 11112222: 2 }, status: 'open' }, BSN1240422: { ring: 'new-lines', items: {}, status: 'closed' } },
  inventory: {
    loads: { L1: { id: 'L1', label: 'Christmas trees', status: 'incoming', date: '2026-10-08', pallets: [{ pid: '30017', items: [{ k: '42977636', q: 12 }] }] } },
    offsite: { 'P-88': { pid: 'P-88', title: 'Garden furniture', products: [{ kc: '42977636', q: 3 }], cb: '2026-10-20' } },
  },
};

test('a manifest by its number, DC number or despatch', () => {
  assert.equal(findRecords(state, 'm-44').manifests[0].manNo, 'M-4471');
  assert.equal(findRecords(state, '552019').manifests.length, 1);
});

test('a consolidation by its last nine digits: the truck, the bay and what is happening', () => {
  const r = findRecords(state, '000000000123456789');
  assert.deepEqual([r.consols[0].id, r.consols[0].bay, r.consols[0].status, r.consols[0].manNo], ['123456789', 'A3', 'active', 'M-4471']);
  assert.equal(findRecords(state, '987654321').consols[0].status, 'not landed');
  state.dock.trucks['2026-10-09-T1'].pallets.A4 = { ref: 'A4', status: 'landed', consolIds: [], scanIds: ['444555666'] };
  assert.deepEqual([findRecords(state, '444555666').consols[0].bay, findRecords(state, '444555666').consols[0].status], ['A4', 'scanned, not on the manifest']);
  assert.deepEqual(findRecords(state, '555000111').consols[0].seen, { t: '2026-10-01-T1', d: '2026-10-01', k: 'man' }, 'seen before, on the ledger');
});

test('a keycode finds the cages, loads and off-site pallets holding it', () => {
  const r = findRecords(state, '42977636');
  assert.deepEqual([r.cages.map(c => [c.id, c.has]), r.loads.map(l => l.has), r.offsite.map(o => [o.pid, o.has])], [[['BSN1240421', 6]], [['30017']], [['P-88', 3]]]);
  assert.equal(r.consols.length, 0, 'eight digits is a keycode, not a consolidation');
});

test('names: a cage tag, a load, an off-site pallet; closed cages stay out', () => {
  assert.deepEqual(findRecords(state, 'bsn12404').cages.map(c => c.id), ['BSN1240421']);
  assert.equal(findRecords(state, 'christmas').loads[0].id, 'L1');
  assert.equal(findRecords(state, 'garden').offsite[0].pid, 'P-88');
  assert.equal(findRecords(state, 'p-88').offsite[0].pid, 'P-88');
  assert.equal(recordCount(findRecords(state, 'x')), 0, 'one character finds nothing');
  assert.equal(recordCount(findRecords({}, 'M-4471')), 0, 'an area the device cannot read is empty');
});
