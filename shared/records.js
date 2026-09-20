// Records read from the projections: a keycode's life in the store, the
// per-area history lists, and CSV. Pure functions over the state shape the
// reducers keep, so the worker's /life, /history and /export routes and
// the shell (search palette, History) compute the same thing from the
// same data, online or off.
//
// K2B's ?sub=codelookup returned a code's visits as { location, date }
// from a day-bucketed index; here the log is the index, so a visit also
// says whether the code scanned, whether it was flagged incorrect, and
// the bay's status and metrics. Adjustments and cages holding the code
// ride along.

export const HISTORY_KINDS = ['backfill', 'cages', 'adjustments', 'receiving'];
export const HISTORY_AREA = { backfill: 'stockroom', cages: 'stockroom', adjustments: 'stockroom', receiving: 'backdock' };
const desc = k => (a, b) => String(b[k] || '').localeCompare(String(a[k] || ''));

export function productLife(state, keycode) {
  const kc = String(keycode || '').replace(/\D/g, '');
  const visits = [];
  for (const s of Object.values(state.backfill?.subs || {})) {
    const c = s.codes?.[kc]; if (!c) continue;
    visits.push({ bay: s.bay, date: s.date, status: s.status, scanned: !!c.scanned, incorrect: (s.incorrect || []).includes(kc), readyAt: s.readyAt || null, submittedAt: s.submittedDoneAt || null, expected: s.metrics?.expected ?? null, accuracy: s.metrics?.accuracy ?? null });
  }
  visits.sort((a, b) => b.date.localeCompare(a.date) || a.bay.localeCompare(b.bay));
  const adjustments = [];
  for (const [date, day] of Object.entries(state.adjustments || {})) { const a = day?.[kc]; if (a) adjustments.push({ date, qty: a.qty, name: a.name || '', location: a.location || '', confirmed: !!a.confirmed, addedAt: a.addedAt || null }); }
  adjustments.sort(desc('date'));
  const cages = [];
  for (const [cage, c] of Object.entries(state.cages || {})) { const qty = c.items?.[kc]; if (qty) cages.push({ cage, ring: c.ring, qty, location: c.location || null, status: c.status, seen: c.seen || null }); }
  cages.sort(desc('seen'));
  return {
    keycode: kc, name: adjustments.find(a => a.name)?.name || null,
    visits, adjustments, cages,
    bays: [...new Set(visits.map(v => v.bay))],
    last: [visits[0]?.date, adjustments[0]?.date, cages[0]?.seen?.slice(0, 10)].filter(Boolean).sort().pop() || null,
  };
}

export function historyRows(state, kind) {
  if (kind === 'backfill') return Object.values(state.backfill?.subs || {}).filter(s => s.status !== 'pending' && s.metrics)
    .map(s => ({ date: s.date, bay: s.bay, status: s.status, readyAt: s.readyAt || '', submittedAt: s.submittedDoneAt || '', expected: s.metrics.expected, scanned: s.metrics.scanned, match: s.metrics.match, accuracy: s.metrics.accuracy, incorrect: s.metrics.incorrect, codes: Object.keys(s.codes || {}).length, auto: !!s.autoSubmitted }))
    .sort((a, b) => (b.submittedAt || b.readyAt || b.date).localeCompare(a.submittedAt || a.readyAt || a.date));
  if (kind === 'cages') return Object.entries(state.cages || {})
    .map(([cage, c]) => ({ cage, ring: c.ring, status: c.status, location: c.location || '', keycodes: Object.keys(c.items || {}).length, units: Object.values(c.items || {}).reduce((a, b) => a + b, 0), sweeps: (c.sweeps || []).length, created: c.created || '', seen: c.seen || '', closed: c.closed || '' }))
    .sort(desc('seen'));
  if (kind === 'receiving') return (state.dock?.history || []).slice().reverse()
    .map(r => ({ date: r.date, truck: r.id, manifest: r.manifest?.manNo || '', dcNo: r.manifest?.dcNo || '', despatch: r.manifest?.despatch || '', landedAt: r.landedAt || '', clearedAt: r.clearedAt || '', cartons: r.cartons, pallets: r.pallets, palletsLanded: r.palletsLanded, clearMins: r.clearMins, haltMins: r.haltMins, halts: r.haltCount, teamRate: r.teamRate, matched: r.audit?.matched ?? '', missing: r.audit?.missing ?? '', offManifest: r.audit?.extra ?? '', crew: (r.perPerson || []).length }));
  if (kind === 'adjustments') return Object.entries(state.adjustments || {})
    .flatMap(([date, day]) => Object.entries(day || {}).map(([keycode, a]) => ({ date, keycode, qty: a.qty, name: a.name || '', location: a.location || '', confirmed: !!a.confirmed, addedAt: a.addedAt || '' })))
    .sort((a, b) => b.date.localeCompare(a.date) || a.keycode.localeCompare(b.keycode));
  return null;
}

export function toCsv(rows, columns) {
  if (!rows?.length) return columns ? columns.join(',') + '\n' : '';
  const cols = columns || Object.keys(rows[0]);
  const cell = v => { const s = v == null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}
