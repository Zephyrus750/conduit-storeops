// A stand-in Decant Visualiser site: what its /api/state answers for one
// store with a live truck, one closed truck in the archive and a planned
// slot. Shapes follow decant/netlify/functions/{state,action}.mjs. Used by
// the unit and contract tests and by scripts/dev.js (port 8790).
export const DV_TRUCK = '2026-09-19-T1';
export const DV = {
  active: { schemaVersion: 1, trucks: [DV_TRUCK], configRev: 3 },
  config: { schemaVersion: 1, storeName: 'Busselton back dock', grid: { rows: 4, cols: 7, rowLabels: 'ABCD' }, people: [{ pid: 'p_a1b2c3d4', dnum: 'D1', name: 'Sam', active: true }, { pid: 'p_e5f6a7b8', dnum: 'D2', name: 'Jo', active: true }, { pid: 'p_c9d0e1f2', dnum: 'D3', name: 'Alex', active: false }], pins: { receiverSet: true, facilitatorSet: true, managerSet: true, namesSet: false }, settings: { stdMinsPerCarton: 0.5, rateWindowDays: 28, rateMinPallets: 10, storeNo: '1241' } },
  truck: {
    schemaVersion: 1, id: DV_TRUCK, rev: 14, status: 'live', date: '2026-09-19', landedAt: '2026-09-18T22:05:00.000Z', decantStartAt: '2026-09-18T22:12:00.000Z', closedAt: null, goalAt: '2026-09-19T01:30:00.000Z',
    grid: { rows: 4, cols: 7, rowLabels: 'ABCD' },
    manifest: { filename: 'Manifest Report 18-09.xls', parsedAt: '2026-09-18T22:06:00.000Z', totalCartons: 30, manNo: '7031490', storeNo: '1241', despatch: '17/09/2026', dcNo: '4101533', consols: [
      { id: '601804401', cons: '093008012601804401', cartons: 12, dept: '024', mix: [['024', 12, 96]], items: [{ k: '43307685', q: 96, dept: '024', c: 12 }] },
      { id: '601804402', cons: '093008012601804402', cartons: 18, dept: '070/084', mix: [['070', 10, 60], ['084', 8, 24]] },
      { id: 'bad', cartons: 3 },
    ] },
    team: [{ pid: 'p_a1b2c3d4', dnum: 'D1', role: 'cutter', rosteredStart: '06:00' }, { pid: 'p_e5f6a7b8', dnum: 'D2', role: 'cutter', rosteredStart: null }],
    pallets: {
      P1: { n: 1, ref: 'A1', cartons: 12, expectedMins: 6, expectedBasis: 'x2', ptype: 'chep', consolId: '601804401', consolIds: ['601804401'], scanId: null, dept: '024', assignedTo: null, status: 'done', segments: [{ pid: 'p_a1b2c3d4', start: '2026-09-18T22:15:00.000Z', end: '2026-09-18T22:24:00.000Z' }], doneAt: '2026-09-18T22:24:00.000Z', note: '' },
      P2: { n: 2, ref: 'A2', cartons: 18, expectedMins: 14, expectedBasis: 'manual', ptype: null, consolId: '601804402', consolIds: ['601804402'], scanId: null, dept: '070', assignedTo: 'p_e5f6a7b8', status: 'active', segments: [{ pid: 'p_a1b2c3d4', start: '2026-09-18T22:25:00.000Z', end: '2026-09-18T22:30:00.000Z' }, { pid: 'p_e5f6a7b8', start: '2026-09-18T22:31:00.000Z', end: null }], doneAt: null, note: 'heavy' },
      P3: { n: 3, ref: 'B1', cartons: null, expectedMins: null, expectedBasis: 'x2', ptype: 'bulk', consolId: null, consolIds: [], scanId: '093008012601804499', status: 'landed', segments: [], doneAt: null, note: '' },
      P4: { n: 4, ref: 'ZZ', cartons: 2, ptype: 'loscam', consolIds: [], status: 'landed', segments: [] },
    },
    plan: { basis: 'x2', updatedAt: '2026-09-18T22:12:00.000Z', queues: {} },
    halts: [{ start: '2026-09-18T22:12:00.000Z', end: '2026-09-18T22:14:00.000Z', kind: 'huddle', reason: 'huddle', by: null, planned: true }, { start: '2026-09-18T22:40:00.000Z', end: null, kind: 'halt', reason: 'nostock', by: 'p_a1b2c3d4' }],
    breaks: [], roleLog: [], log: [],
  },
  history: { schemaVersion: 1, rows: [
    { id: '2026-09-16-T1', date: '2026-09-16', landedAt: '2026-09-15T22:10:00.000Z', decantStartAt: '2026-09-15T22:10:00.000Z', manifest: { manNo: '7031486', despatch: '15/09/2026', dcNo: '4101533', storeNo: '1241', consols: 14, cartons: 470 },
      cartons: 470, pallets: 14, palletsLanded: 14, clearedAt: '2026-09-16T01:02:00.000Z', clearMins: 172, haltMins: 9, haltCount: 1, huddleMins: 5, downtime: [{ kind: 'halt', reason: 'hcage', mins: 9, count: 1 }, { kind: 'transition', reason: 'cages', mins: 4, count: 1 }], teamRate: 173.0,
      perPerson: [{ pid: 'p_a1b2c3d4', pallets: 7.5, cartons: 251, workedMins: 96, rate: 156.9, deltaPct: -3 }, { pid: 'p_e5f6a7b8', pallets: 6.5, cartons: 219, workedMins: 88, rate: 149.3, deltaPct: 2 }],
      perDept: [{ dept: '024', pallets: 6, cartons: 200, workedMins: 80 }, { dept: '070', pallets: 8, cartons: 270, workedMins: 104 }], audit: { total: 14, matched: 14, missing: 0, extra: 0 }, plan: { basis: 'x2' } },
    { id: 'weird', date: '2026-09-10', cartons: 1, pallets: 1 },
  ] },
  planner: { schemaVersion: 1, days: { '2026-09-22': { slots: { 1: { eta: '6:30', note: 'Two loscam', team: [{ pid: 'p_a1b2c3d4', start: '06:00', finish: null }, 'p_e5f6a7b8'], manifest: { filename: 'Manifest Report 21-09.xls', manNo: '7031495', dcNo: '4101533', despatch: '21/09/2026', consols: [{ id: '601804510', cartons: 9, dept: '024' }] } }, 2: { eta: null, note: '', team: [], manifest: null } } } } },
  rollover: { schemaVersion: 1, fromId: '2026-09-16-T1', date: '2026-09-16', savedAt: '2026-09-16T01:05:00.000Z', pallets: [{ ref: 'C4', cartons: 6 }], consols: [] },
};
// Answer a DV /api/state request the way the site would.
export function dvAnswer(u) {
  const q = u.searchParams;
  if (q.has('truck')) return q.get('truck') === DV_TRUCK ? DV.truck : { httpStatus: 404, body: { error: 'truck not found' } };
  if (q.has('config')) return DV.config;
  if (q.has('history')) return DV.history;
  if (q.has('planner')) return DV.planner;
  if (q.has('rates')) return { schemaVersion: 1, people: {} };
  if (q.has('rollover')) return DV.rollover;
  return DV.active;
}
