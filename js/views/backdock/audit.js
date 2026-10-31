// The printable receiving audit (Decant Visualiser's): one A4 record of a
// truck, live or finalised, for the facilitator to check and sign. What
// landed where, who decanted it and how long it took, the manifest
// reconciliation (missing and off-manifest consols), the hold-ups and the
// crew credit by D-number. A finalised truck's record comes from its
// history row; its pallets are still on the truck in the dock projection.

import { esc, fmtDate } from '../../ui.js';
import { tx, locale } from '../../i18n.js';
import { printSheet, table, signoff, section, tick } from '../../print.js';
import { historyRow, consolsOf, workedMs } from '../../../shared/reducers/backdock.js';
import { PT_NAME, truckNo, fmtHM, fmtMins, holdName, pallets, PALLET_STATE, LINK_BASIS } from './common.js';

// The date in the device's language (en-AU in English, as before).
const day = iso => iso ? new Date(iso).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function printAudit(t, dock) {
  const closed = t.status === 'closed';
  const row = (closed && dock?.history?.find(r => r.id === t.id)) || historyRow(t.id, { ...t, clearedAt: t.clearedAt || new Date().toISOString() });
  const now = Date.now(), ps = pallets(t).sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  const all = consolsOf(t), byId = new Map(all.map(c => [c.id, c]));
  const facts = [[tx('Truck'), `T${esc(truckNo(t.id))} · ${esc(day(t.landedAt || t.id.slice(0, 10)))}`], [tx('Status'), closed ? tx('Finalised') : tx('Live')], [tx('Landed'), fmtHM(t.landedAt)], [tx('Decant start'), fmtHM(t.decantStartAt || t.landedAt)], [tx('Last pallet done'), row.pallets ? fmtHM(pallets(t).filter(p => p.doneAt).map(p => p.doneAt).sort().at(-1)) : '—'], [tx('Clear time'), fmtMins(row.clearMins)], [tx('Cartons decanted'), tx('{c} on {p} of {n} pallets', { c: row.cartons, p: row.pallets, n: row.palletsLanded })], [tx('Team rate'), row.teamRate ? tx('{n} cartons an hour', { n: row.teamRate }) : '—'], [tx('Manifest'), t.manifest ? `${esc(t.manifest.manNo)}${t.manifest.despatch ? ' · ' + tx('despatch {d}', { d: esc(t.manifest.despatch) }) : ''}` : tx('none attached')], [tx('Handed over'), t.receivingConfirmed ? fmtHM(t.receivedAt) : tx('no')]];
  const head = `<div class="ps-facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

  const palletRows = ps.map(p => {
    const crew = [...new Set(p.segments.map(x => x.pid))].join(', '), w = p.segments.length ? workedMs(t, p, p.status === 'done' ? Date.parse(p.doneAt) || now : now) / 60000 : 0;
    const cons = p.consolIds.map(id => byId.get(id)).filter(Boolean);
    const state = p.status === 'done' ? tx('done {time}', { time: fmtHM(p.doneAt) }) : PALLET_STATE[p.status] || p.status;
    return [`<b>${esc(p.ref)}</b>`, esc(PT_NAME[p.ptype] || p.ptype), p.cartons ?? '–', esc(cons.map(c => c.id).join(' ') || (p.scanIds.length ? tx('{n} off-manifest', { n: p.scanIds.length }) : '—')), esc(crew || '—'), p.segments.length ? fmtHM(p.segments[0].start) : '—', esc(state) + (p.suspect ? ' ⚠' : '') + (p.carryover ? ' · ' + tx('carried') : '') + (p.lateFrom ? ' · ' + tx('LATE — manifested {date}', { date: esc(fmtDate(p.lateFrom.d)) }) : '') + (p.seenBefore ? ' · ' + tx('SEEN {date}', { date: esc(fmtDate(p.seenBefore.d)) }) : '') + (p.linkedLateAt ? ' · ' + tx('linked late ({basis})', { basis: esc(LINK_BASIS[p.linkBasis || 'manual'] || p.linkBasis) }) : ''), p.segments.length ? `${fmtMins(w)}${p.expectedMins ? ' / ' + tx('{m}m', { m: p.expectedMins }) : ''}` : '—', tick];
  });
  const pal = section(tx('Pallets'), table([tx('dock bay::Bay'), tx('Type'), tx('Ctn'), tx('Consols'), tx('Crew'), tx('Started'), tx('Status'), tx('Worked / est'), '✓'], palletRows, ['', '', 'n', 'mono', '', '', '', 'n', 'tk']) + (ps.some(p => p.suspect) ? `<p class="ps-note">${tx('⚠ Done very fast for its size: its time credits nobody until the times are fixed or it is confirmed.')}</p>` : ''));

  const a = row.audit;
  const recon = a ? section(tx('Manifest reconciliation'), `<div class="ps-facts"><div><span>${tx('Consols on the manifest')}</span><b>${a.total + (a.carriedOut || 0)}</b></div>${a.carriedOut ? `<div><span>${tx('Carried on with their pallets')}</span><b>${a.carriedOut}</b></div>` : ''}<div><span>${tx('Matched on the dock')}</span><b>${a.matched}</b></div><div><span>${tx('Missing')}</span><b>${a.missing}</b></div><div><span>${tx('Off-manifest, held for review')}</span><b>${a.extra}</b></div></div>` +
    (a.missingIds?.length ? table([tx('Missing consol'), tx('Cartons'), tx('Dept'), tx('Found?')], a.missingIds.map(m => [`<span class="mono">${esc(m.id)}</span>`, m.cartons ?? '', esc(m.dept || ''), tick]), ['', 'n', '', 'tk']) : '') +
    (a.extraIds?.length ? table([tx('Off-manifest label'), tx('On bay'), tx('Checked')], a.extraIds.map(x => [`<span class="mono">${esc(x.id)}</span>`, esc(x.bay), tick]), ['', '', 'tk']) : '')) : '';

  const holds = (t.halts || []).filter(h => h.start);
  const hold = holds.length ? section(tx('Hold-ups'), table([tx('What'), tx('From'), tx('To'), tx('Minutes'), tx('Note')], holds.map(h => [esc(holdName(h)) + (h.planned ? ' ' + tx('(booked)') : ''), fmtHM(h.start), h.end ? fmtHM(h.end) : tx('hold-up::open'), h.end ? Math.round((Date.parse(h.end) - Date.parse(h.start)) / 60000) : '', esc(h.note || '')]), ['', '', '', 'n', '']) +
    `<p class="ps-note">${tx('Downtime (halts) {halts} min · huddles {huddles} · transitions {transitions} · team breaks {team} · personal breaks {personal}', { halts: row.haltMins, huddles: row.huddleMins ?? 0, transitions: row.transitionMins ?? 0, team: row.teamBreakMins ?? 0, personal: row.breakMins ?? 0 })}</p>`) : '';

  const crew = row.perPerson?.length ? section(tx('Crew credit'), table([tx('D-number'), tx('Cartons'), tx('Pallets'), tx('Worked'), tx('Rate'), tx('vs estimate')], row.perPerson.slice().sort((x, y) => y.cartons - x.cartons).map(c => [`<b>${esc(c.pid)}</b>`, c.cartons, c.pallets, fmtMins(c.mins), c.rate ? tx('{n}/h', { n: c.rate }) : '—', c.deltaPct == null ? '—' : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}%`]), ['', 'n', 'n', 'n', 'n', 'n']) + `<p class="ps-note">${tx('Cartons on a shared pallet are split by time worked. D-numbers only.')}</p>`) : '';

  printSheet({
    title: tx('Receiving audit · Truck {n}', { n: truckNo(t.id) }),
    subtitle: `${esc(day(t.landedAt || t.id.slice(0, 10)))} · ${closed ? tx('finalised') : tx('live, as at {time}', { time: fmtHM(new Date().toISOString()) })}`,
    body: head + pal + recon + hold + crew + signoff(tx('Checked by')),
  });
}
