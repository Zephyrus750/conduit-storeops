// The truck's phase on every back-dock screen (shared/dockphase.js), with the
// next step as a button, as Decant Visualiser's receiver header, decant board
// and Take 5 did. Also the two sheets that move a truck between phases on the
// phone as well as the PC: New truck (which slot, which manifest, which
// times, what happens to held pallets) and Finish receiving (confirm the
// layout against the manifest).
//
//   phaseBar(t, { link })     the six phases, this one lit, its line, the next step
//                             (link: a plain link to Receiving, for screens without its actions)
//   phaseChip(t)              the phase as one chip (wall screens)
//   newTruckSheet(dock, plan, nt, now)   the New truck sheet; nt holds its choices
//   ntDefaults(dock, plan, now)          the choices it opens on
//   ntPayload(dock, plan, nt, now)       → { id, payload, slot } for truck.create
//   finishSheet(t)                       Finish receiving: what landed against the manifest

import { ic, esc } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { PHASES, truckPhase, phaseCounts } from '../../../shared/dockphase.js';
import { liveAudit } from '../../../shared/reducers/backdock.js';
import { truckNo, fmtHM, todayKey, unfinished, PT_NAME } from './common.js';

// A truck's phase names (context keys: "Cleared" is not the shell's "erased").
export const PHASE_NAME = { planned: tx('truck phase::Planned'), receiving: tx('truck phase::Receiving'), received: tx('truck phase::Received'), decanting: tx('truck phase::Decanting'), cleared: tx('truck phase::Cleared'), closed: tx('truck phase::Closed') };

// The line under the phase: where it stands, in one sentence.
function line(t, ph) {
  const c = phaseCounts(t), a = t ? liveAudit(t) : null;
  if (ph === 'planned') return tx('Not landed yet');
  if (ph === 'receiving') return txn(c.pallets, '{n} pallet landed', '{n} pallets landed') + (a ? ' · ' + tx('{m} of {n} consols matched', { m: a.matched, n: a.total }) : '');
  if (ph === 'received') return tx('Layout confirmed {time} · Take 5, then start', { time: fmtHM(t.receivedAt) });
  if (ph === 'decanting') return tx('{done} of {n} pallets done · {c} of {total} ctn', { done: c.done, n: c.pallets, c: c.decanted, total: c.cartons }) + (t.receivingConfirmed ? '' : ' · ' + tx('still receiving'));
  if (ph === 'cleared') return tx('Every pallet done: close the truck');
  return tx('Finalised {time}', { time: fmtHM(t.clearedAt) });
}
// The next step: what a person does to move the truck on.
export function nextStep(t) {
  const ph = truckPhase(t);
  if (!t || ph === 'planned') return t ? { act: 'golive', label: tx('Start receiving') } : { act: 'newtruck', label: tx('New truck') };
  if (ph === 'receiving') return { act: 'finish', label: tx('Finish receiving') };
  if (ph === 'received') return { act: 'begin', label: tx('Start decant') };
  if (ph === 'decanting') return t.receivingConfirmed ? null : { act: 'finish', label: tx('Finish receiving') };
  if (ph === 'cleared') return { act: 'finalise', label: tx('Close the truck') };
  return null;
}

export function phaseBar(t, { link = false } = {}) {
  const ph = truckPhase(t), at = PHASES.indexOf(ph), n = nextStep(t);
  const btn = !n ? '' : link ? `<button class="btn primary sm phb-go" data-view="receiving">${esc(n.label)}${ic('arrow')}</button>` : `<button class="btn primary sm phb-go" data-act="phase-${n.act}">${esc(n.label)}${ic('arrow')}</button>`;
  return `<div class="phb ph-${ph}" role="group" aria-label="${tx('Truck phase')}"><ol class="phb-s">${PHASES.map((p, i) => `<li class="${i < at ? 'dn' : i === at ? 'on' : ''}"${i === at ? ' aria-current="step"' : ''}><i></i><span>${PHASE_NAME[p]}</span></li>`).join('')}</ol>` +
    `<div class="phb-n"><span class="phb-t"><b>${t ? tx('Truck {n}', { n: esc(truckNo(t.id)) }) + ' · ' : ''}${PHASE_NAME[ph]}</b><small>${line(t, ph)}</small></span>${btn}</div></div>`;
}
export const phaseChip = t => { const ph = truckPhase(t); return `<span class="phb-chip ph-${ph}">${PHASE_NAME[ph]}</span>`; };

// ── New truck ──────────────────────────────────────────────────────────
// Today's trucks by number: planned slots (not yet a truck), trucks on the
// dock, and trucks finalised today.
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function today(dock, plan) {
  const day = todayKey(), slots = plan?.days?.[day]?.slots || {}, taken = {};
  for (const id of Object.keys(dock.trucks || {})) if (id.startsWith(day + '-T')) taken[truckNo(id)] = dock.trucks[id].status === 'closed' ? 'done' : 'open';
  for (const h of dock.history || []) if (h.id.startsWith(day + '-T')) taken[truckNo(h.id)] = 'done';
  let free = 1; while (taken[free] || slots[free]) free++;
  return { day, slots, taken, free };
}
export function ntDefaults(dock, plan, now = new Date()) {
  const d = today(dock, plan), first = Object.keys(d.slots).map(Number).sort((a, b) => a - b).find(n => !d.taken[n]);
  return { slot: first ?? 'u', landed: hhmm(now), start: first ? d.slots[first].eta || '' : '', keep: true };
}
export function ntPayload(dock, plan, nt, now = new Date()) {
  const d = today(dock, plan), n = nt.slot === 'u' ? d.free : Number(nt.slot), at = hm => { if (!/^\d{1,2}:\d{2}$/.test(hm || '')) return null; const x = new Date(now); const [h, m] = hm.split(':').map(Number); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const payload = { landedAt: at(nt.landed) || now.toISOString() };
  if (nt.slot !== 'u') payload.slot = n;
  if (at(nt.start)) payload.decantStartAt = at(nt.start);
  return { id: `${d.day}-T${n}`, n, payload };
}
export function newTruckSheet(dock, plan, nt, open) {
  const d = today(dock, plan), nums = [...new Set([...Object.keys(d.slots), ...Object.keys(d.taken)].map(Number))].sort((a, b) => a - b);
  const card = n => {
    const sl = d.slots[n], tk = d.taken[n], on = String(nt.slot) === String(n);
    if (tk) return `<div class="nt-c off"><b>${tx('Truck {n}', { n })}</b><span class="status ${tk === 'done' ? 'good' : ''}">${tk === 'done' ? tx('Done ✓') : tx('On the dock')}</span></div>`;
    const man = sl.manifest, mtxt = man ? (man.ref ? tx('Manifest {no} · {c} ctn · {n} consols', { no: esc(man.manNo), c: man.cartons ?? '–', n: man.n }) : tx('Manifest {no}', { no: esc(man.manNo) })) : tx('no manifest yet');
    return `<button class="nt-c${on ? ' on' : ''}" data-act="nt-slot" data-n="${n}" aria-pressed="${on}"><b>${tx('Truck {n}', { n })}</b>${on ? `<span class="status good">${tx('selected')}</span>` : ''}<small class="${man ? 'ok' : 'warn'}">${ic('file')}${mtxt}</small><small>${sl.eta ? tx('start {time}', { time: esc(sl.eta) }) : tx('no start time')} · ${txn((sl.team || []).length, '{n} decanter', '{n} decanters')}${sl.huddleMins ? ' · ' + tx('huddle {n}m', { n: sl.huddleMins }) : ''}</small></button>`;
  };
  const un = `<button class="nt-c${nt.slot === 'u' ? ' on' : ''}" data-act="nt-slot" data-n="u" aria-pressed="${nt.slot === 'u'}"><b>${ic('plus')}${tx('Unplanned truck')}</b><small>${tx('not in the week plan · becomes Truck {n}', { n: d.free })}</small></button>`;
  const no = nt.slot === 'u' ? d.free : Number(nt.slot);
  // An open truck: the new one finalises it and its unfinished pallets come across on their bays.
  let gate = '', blocked = false;
  if (open) {
    const left = unfinished(open), active = left.filter(p => p.status === 'active');
    if (active.length) { blocked = true; gate = `<p class="nt-warn bad">${ic('alert')}${txn(active.length, 'Truck {t} still has {n} pallet being decanted ({refs}). Pause or finish it first.', 'Truck {t} still has {n} pallets being decanted ({refs}). Pause or finish them first.', { t: esc(truckNo(open.id)), refs: esc(active.map(p => p.ref).join(', ')) })}</p>`; }
    else gate = `<p class="nt-warn">${ic('alert')}${left.length ? txn(left.length, 'Truck {t} is still open. Creating Truck {b} finalises it, and its {n} unfinished pallet ({ctn} ctn) stays on its bay for Truck {b}: {refs}.', 'Truck {t} is still open. Creating Truck {b} finalises it, and its {n} unfinished pallets ({ctn} ctn) stay on their bays for Truck {b}: {refs}.', { t: esc(truckNo(open.id)), b: no, ctn: left.reduce((n, p) => n + (p.cartons || 0), 0), refs: esc(left.map(p => p.ref).join(', ')) }) : tx('Truck {t} is still open. Creating Truck {b} finalises it.', { t: esc(truckNo(open.id)), b: no })}</p>`;
  }
  const held = !open && dock.rollover ? (() => { const ps = Object.values(dock.rollover.pallets); return `<div class="nt-held"><b>${txn(ps.length, '{n} pallet held from Truck {t}', '{n} pallets held from Truck {t}', { t: esc(truckNo(dock.rollover.from)) })}</b><small>${esc(ps.map(p => `${p.ref} ${PT_NAME[p.ptype] || ''}`).join(' · '))}</small><div class="chips"><button class="chip${nt.keep ? ' on' : ''}" data-act="nt-keep" data-v="1">${tx('Keep them on Truck {n}', { n: no })}</button><button class="chip${nt.keep ? '' : ' on'}" data-act="nt-keep" data-v="0">${tx('Start fresh')}</button></div></div>`; })() : '';
  return `<div class="card nt"><div class="ch"><h3>${tx('New truck')}</h3><button class="ibtn" data-act="nt-cancel" aria-label="${tx('Close')}">${ic('x')}</button></div>` +
    `<p class="lbl">${tx('It starts in its planned slot: the manifest, team and start time come with it.')}</p>${gate}` +
    `<div class="nt-list">${nums.map(card).join('')}${un}</div>` +
    `<div class="nt-times"><label>${tx('Landed at')}<input type="time" class="bdr-in" data-field="nt-landed" value="${esc(nt.landed)}"></label><label>${tx('Decant start')}<input type="time" class="bdr-in" data-field="nt-start" value="${esc(nt.start)}"></label></div>` +
    `<p class="cs-dim nt-note">${tx('Landed is for the record. The decant start is when pace, goal and timeline are measured from; blank starts it at Take 5.')}</p>${held}` +
    `<div class="nt-acts"><button class="btn primary big" data-act="nt-go"${blocked ? ' disabled' : ''}>${ic('truck')}${tx('Create & go live · Truck {n}', { n: no })}</button><button class="btn" data-act="nt-cancel">${tx('Cancel')}</button></div></div>`;
}

// ── Finish receiving ───────────────────────────────────────────────────
// The layout against the manifest, then Confirm: the receiver's hand-over.
export function finishSheet(t) {
  const c = phaseCounts(t), a = liveAudit(t);
  const row = (cls, v, l) => `<div class="fs-r ${cls}"><b>${v}</b><span>${l}</span></div>`;
  const rows = row('', c.pallets, txn(c.pallets, 'pallet on the dock', 'pallets on the dock')) + row('', c.cartons, txn(c.cartons, 'carton counted', 'cartons counted')) +
    (a ? row(a.matched === a.total ? 'ok' : '', `${a.matched}/${a.total}`, tx('consols matched')) + row(a.missing ? 'warn' : 'ok', a.missing, tx('on the manifest, not landed')) + row(a.extra ? 'bad' : 'ok', a.extra, txn(a.extra, 'label not on the manifest', 'labels not on the manifest')) : row('warn', '—', tx('no manifest attached'))) +
    (c.noCartons ? row('warn', c.noCartons, txn(c.noCartons, 'pallet with no carton count', 'pallets with no carton count')) : '');
  const off = a && (a.missing || a.extra) || c.noCartons;
  return `<div class="card fs"><div class="ch"><h3>${tx('Finish receiving · Truck {n}', { n: esc(truckNo(t.id)) })}</h3><button class="ibtn" data-act="fs-cancel" aria-label="${tx('Close')}">${ic('x')}</button></div>` +
    `<p class="lbl">${tx('Confirm the layout once everything is off the truck. Pallets can still be changed afterwards.')}</p><div class="fs-g">${rows}</div>` +
    (off ? `<p class="nt-warn">${ic('alert')}${tx('Something is off. Check it now, or confirm and sort it out in the audit.')}</p>` : '') +
    `<div class="nt-acts"><button class="btn primary big" data-act="fs-go">${ic('check')}${tx('Confirm layout')}</button>${a ? `<button class="btn" data-act="audit">${ic('file')}${tx('Receiving audit')}</button>` : ''}<button class="btn" data-act="fs-cancel">${tx('Back')}</button></div></div>`;
}
