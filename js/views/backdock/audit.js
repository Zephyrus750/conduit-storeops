// The printable receiving audit (Decant Visualiser's): one A4 record of a
// truck, live or finalised, for the facilitator to check and sign. What
// landed where, who decanted it and how long it took, the manifest
// reconciliation (missing and off-manifest consols), the hold-ups and the
// crew credit by D-number. A finalised truck's record comes from its
// history row; its pallets are still on the truck in the dock projection.

import { esc, fmtDate } from '../../ui.js';
import { printSheet, table, signoff, section, tick } from '../../print.js';
import { historyRow, consolsOf, workedMs } from '../../../shared/reducers/backdock.js';
import { PT_NAME, truckNo, fmtHM, fmtMins, holdName, pallets } from './common.js';

const day = iso => iso ? new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function printAudit(t, dock) {
  const closed = t.status === 'closed';
  const row = (closed && dock?.history?.find(r => r.id === t.id)) || historyRow(t.id, { ...t, clearedAt: t.clearedAt || new Date().toISOString() });
  const now = Date.now(), ps = pallets(t).sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  const all = consolsOf(t), byId = new Map(all.map(c => [c.id, c]));
  const facts = [['Truck', `T${esc(truckNo(t.id))} · ${esc(day(t.landedAt || t.id.slice(0, 10)))}`], ['Status', closed ? 'Finalised' : 'Live'], ['Landed', fmtHM(t.landedAt)], ['Decant start', fmtHM(t.decantStartAt || t.landedAt)], ['Last pallet done', row.pallets ? fmtHM(pallets(t).filter(p => p.doneAt).map(p => p.doneAt).sort().at(-1)) : '—'], ['Clear time', fmtMins(row.clearMins)], ['Cartons decanted', `${row.cartons} on ${row.pallets} of ${row.palletsLanded} pallets`], ['Team rate', row.teamRate ? `${row.teamRate} cartons an hour` : '—'], ['Manifest', t.manifest ? `${esc(t.manifest.manNo)}${t.manifest.despatch ? ' · despatch ' + esc(t.manifest.despatch) : ''}` : 'none attached'], ['Handed over', t.receivingConfirmed ? fmtHM(t.receivedAt) : 'no']];
  const head = `<div class="ps-facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

  const palletRows = ps.map(p => {
    const crew = [...new Set(p.segments.map(x => x.pid))].join(', '), w = p.segments.length ? workedMs(t, p, p.status === 'done' ? Date.parse(p.doneAt) || now : now) / 60000 : 0;
    const cons = p.consolIds.map(id => byId.get(id)).filter(Boolean);
    const state = p.status === 'done' ? `done ${fmtHM(p.doneAt)}` : p.status;
    return [`<b>${esc(p.ref)}</b>`, esc(PT_NAME[p.ptype] || p.ptype), p.cartons ?? '–', esc(cons.map(c => c.id).join(' ') || (p.scanIds.length ? `${p.scanIds.length} off-manifest` : '—')), esc(crew || '—'), p.segments.length ? fmtHM(p.segments[0].start) : '—', esc(state) + (p.suspect ? ' ⚠' : '') + (p.carryover ? ' · carried' : '') + (p.lateFrom ? ` · LATE — manifested ${esc(fmtDate(p.lateFrom.d))}` : '') + (p.seenBefore ? ` · SEEN ${esc(fmtDate(p.seenBefore.d))}` : '') + (p.linkedLateAt ? ` · linked late (${esc(p.linkBasis || 'manual')})` : ''), p.segments.length ? `${fmtMins(w)}${p.expectedMins ? ` / ${p.expectedMins}m` : ''}` : '—', tick];
  });
  const pal = section('Pallets', table(['Bay', 'Type', 'Ctn', 'Consols', 'Crew', 'Started', 'Status', 'Worked / est', '✓'], palletRows, ['', '', 'n', 'mono', '', '', '', 'n', 'tk']) + (ps.some(p => p.suspect) ? '<p class="ps-note">⚠ Done very fast for its size: its time credits nobody until the times are fixed or it is confirmed.</p>' : ''));

  const a = row.audit;
  const recon = a ? section('Manifest reconciliation', `<div class="ps-facts"><div><span>Consols on the manifest</span><b>${a.total}</b></div><div><span>Matched on the dock</span><b>${a.matched}</b></div><div><span>Missing</span><b>${a.missing}</b></div><div><span>Off-manifest, held for review</span><b>${a.extra}</b></div></div>` +
    (a.missingIds?.length ? table(['Missing consol', 'Cartons', 'Dept', 'Found?'], a.missingIds.map(m => [`<span class="mono">${esc(m.id)}</span>`, m.cartons ?? '', esc(m.dept || ''), tick]), ['', 'n', '', 'tk']) : '') +
    (a.extraIds?.length ? table(['Off-manifest label', 'On bay', 'Checked'], a.extraIds.map(x => [`<span class="mono">${esc(x.id)}</span>`, esc(x.bay), tick]), ['', '', 'tk']) : '')) : '';

  const holds = (t.halts || []).filter(h => h.start);
  const hold = holds.length ? section('Hold-ups', table(['What', 'From', 'To', 'Minutes', 'Note'], holds.map(h => [esc(holdName(h)) + (h.planned ? ' (booked)' : ''), fmtHM(h.start), h.end ? fmtHM(h.end) : 'open', h.end ? Math.round((Date.parse(h.end) - Date.parse(h.start)) / 60000) : '', esc(h.note || '')]), ['', '', '', 'n', '']) +
    `<p class="ps-note">Downtime (halts) ${row.haltMins} min · huddles ${row.huddleMins ?? 0} · transitions ${row.transitionMins ?? 0} · team breaks ${row.teamBreakMins ?? 0} · personal breaks ${row.breakMins ?? 0}</p>`) : '';

  const crew = row.perPerson?.length ? section('Crew credit', table(['D-number', 'Cartons', 'Pallets', 'Worked', 'Rate', 'vs estimate'], row.perPerson.slice().sort((x, y) => y.cartons - x.cartons).map(c => [`<b>${esc(c.pid)}</b>`, c.cartons, c.pallets, fmtMins(c.mins), c.rate ? `${c.rate}/h` : '—', c.deltaPct == null ? '—' : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}%`]), ['', 'n', 'n', 'n', 'n', 'n']) + '<p class="ps-note">Cartons on a shared pallet are split by time worked. D-numbers only.</p>') : '';

  printSheet({
    title: `Receiving audit · Truck ${truckNo(t.id)}`,
    subtitle: `${esc(day(t.landedAt || t.id.slice(0, 10)))} · ${closed ? 'finalised' : 'live, as at ' + fmtHM(new Date().toISOString())}`,
    body: head + pal + recon + hold + crew + signoff('Checked by'),
  });
}
