// Receiving: the dock board. Desktop is the facilitator's overview (trucks,
// the pallet grid, who is decanting, what landed) with land, goal, team and
// finalise; the phone is the receiver's hands-on flow (land a pallet, run
// the decant: start, pause, done, halts). Ported from Vector's
// backdock-receiving and backdock-decant over the backdock reducers.

import { $, $$, ic, esc, vh, sub, toast, mhead, mbig, fmtDate, camButton } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { PTYPES, PT_LETTER, PT_NAME, PT_ONE, PT_SHORT, PT_COLOUR, HALT_NAME, KIND_NAME, TRANS_NAME, ROLE_NAME, holdName, PALLET_STATE, TRUCK_STATE, LINK_BASIS, STD_MINS_PER_CARTON, todayKey, truckNo, fmtHM, openTrucks, nextTruckId, pallets, progress, openHalt, running, onBreak, openSegs, startOf, workedMin, pace, fmtMins, fmtClock, forecast, goalPace, who, dnumId, unfinished, grid, startable, manifestIndex, attachManifest } from './common.js';
import { haptic } from '../../device.js';
import { previewManifest } from './mpreview.js';
import { printAudit, canAudit } from './audit.js';
import { searchSheet, infoSheet, palletContents, onSearchAct, onSearchInput, verifyContents, ss } from './phonesearch.js';
import { linkSheet, linkPick, applyLinks, unlinked } from './late.js';
import { liveAudit } from '../../../shared/reducers/backdock.js';
import { planCard, take5Card, queuePicker, onPlanAct, onPlanChange, ratesFor, guard, decantBoard } from './plan.js';
import { phaseBar, phaseChip, nextStep, newTruckSheet, ntDefaults, ntPayload, finishSheet, PHASE_NAME } from './phase.js';
import { PHASES, begun, phaseCounts, truckPhase } from '../../../shared/dockphase.js';

const st = { truck: null, land: { ref: '', ptype: null, cartons: '', note: '', codes: [] }, sheet: null, moving: null, manConfirm: null, panel: false, trucks: false, typing: {}, view: 'receive', arm: null, sel: null, halting: false, holdKind: null, fix: null, manPick: false, linking: false, finalising: false, more: false, nt: null, finishing: false, roles: false, roleAsk: null, person: null };
let usedArg = null;   // a view's argument stays on re-renders: apply it once
const dispatch = (ctx, type, entity, payload) => ctx.store.dispatch({ type, entity, payload });
// The hold-up buttons, a role inside a sentence (lower case in English), and
// a pallet's or truck's status as shown.
const START_KIND = { halt: tx('Start halt'), huddle: tx('Start huddle'), transition: tx('Start transition'), break: tx('Start team break') };
const END_KIND = { halt: tx('End halt'), huddle: tx('End huddle'), transition: tx('End transition'), break: tx('End team break') };
const ROLE_AS = { cutter: tx('cutter'), runner: tx('runner'), cleaner: tx('cleaner') };
// Crew roles on the phone: each has its own solid icon and colour (r-cutter,
// r-runner, r-cleaner in app.css), on the name tiles, the crew line and the
// Roles and person popups.
const ROLES = ['cutter', 'runner', 'cleaner'];
const ROLE_IC = { cutter: 'knife', runner: 'runner', cleaner: 'broom' };
const ROLE_COUNT = { cutter: n => tx('{n} cutting', { n }), runner: n => tx('{n} running', { n }), cleaner: n => tx('{n} cleaning', { n }) };
const roleOf = mm => mm.role || 'cutter';
const pstate = s => PALLET_STATE[s] || s, tstate = s => TRUCK_STATE[s] || s;

function model(ctx) {
  const dock = ctx.store.get('dock'), open = openTrucks(dock);
  if (!open.some(t => t.id === st.truck)) st.truck = open.find(t => t.status === 'live')?.id || open[0]?.id || null;
  const t = st.truck ? { id: st.truck, ...dock.trucks[st.truck] } : null;
  return { dock, open, t, pr: t ? progress(t) : null, halt: t ? openHalt(t) : null, run: t ? running(t) : {} };
}

// ── desktop ────────────────────────────────────────────────────────────
function truckCard(t, on) {
  const pr = progress(t), team = t.team || [], run = running(t), man = t.manifest;
  const stl = t.status === 'live' ? tx('Live') : t.status === 'staged' ? tx('Staged') : t.status;
  return `<div class="trk${on ? ' on' : ''}" data-act="pick" data-id="${esc(t.id)}"><div class="trk-h"><b>${tx('Truck {n}', { n: esc(truckNo(t.id)) })}</b><span class="tst ${esc(t.status)}">${esc(stl)}</span><span class="cs-dim">${t.status === 'live' ? tx('landed {time}', { time: fmtHM(t.landedAt) }) + (t.goalAt ? ' · ' + tx('goal {time}', { time: fmtHM(t.goalAt) }) : '') : tx('staged · press Start receiving to land pallets')}</span></div><div class="trk-3">` +
    `<div class="trk-c${man ? '' : ' warn'}"><small>${ic('file')}${tx('Manifest')}</small><b>${man ? esc(man.manNo) : tx('Not attached')}</b><span>${man ? txn(man.consols.length, '{n} consol', '{n} consols') + ' · ' + tx('{n}c', { n: man.consols.reduce((n, c) => n + c.cartons, 0) }) : tx('lands with Manifests')}</span></div>` +
    `<div class="trk-c"><small>${ic('truck')}${tx('Truck')}</small><b>${t.status === 'live' ? txn(pr.count, '{n} pallet', '{n} pallets') : tx('Not landed')}</b><span>${t.status === 'live' ? tx('{n} to go', { n: pr.count - pr.doneCount }) : tx('from the planner')}</span></div>` +
    `<div class="trk-c"><small>${ic('users')}${tx('Decant')}</small><b>${t.status === 'live' && pr.total ? `${pr.done} / ${pr.total} · ${pr.pct}%` : team.length ? tx('Team staged') : tx('No team yet')}</b><div class="dk-team">${team.map(m => `<span class="dk-tc${run[m.pid] ? ' on' : ''}"><span class="av">${esc(who(m))}</span>${run[m.pid] ? `<b>${esc(run[m.pid])}</b>` : ''}</span>`).join('')}</div></div></div></div>`;
}
// A pallet is verified once a consol on it is matched on the manifest: a
// green tick on the Receive grid and in Last landed, an orange cross until then.
const verified = p => (p.consolIds || []).length > 0;
const vfMark = p => verified(p) ? `<span class="bdk-vf ok" title="${tx('Consol verified on the manifest')}">✓</span>` : `<span class="bdk-vf no" title="${tx('No consol verified yet')}">✕</span>`;
function dockGrid(t, desk) {
  const g = grid(t), byRef = {}; for (const p of Object.values(t.pallets || {})) byRef[p.ref] = p;
  return `<div class="bdk-grid${desk ? ' desk' : ''}" style="grid-template-columns:repeat(${g.cols},1fr)">` + g.refs.map(ref => {
    const p = byRef[ref];
    if (!p) return `<button class="bdk-sq empty${st.moving ? ' tg' : ''}" data-act="cell" data-ref="${ref}" title="${st.moving ? tx('Move {ref} here', { ref: st.moving }) : tx('Land a pallet at {ref}', { ref })}"><span class="bdk-ref">${ref}</span><span class="bdk-plus">${st.moving ? '⇲' : '+'}</span></button>`;
    // Not in this session (DV's exclude): on its bay, out of every count.
    if (p.excluded) return `<button class="bdk-sq marked out${st.sel === ref ? ' hit' : ''}" data-act="cell" data-ref="${ref}" title="${ref} · ${tx('not in this session')}"><span class="bdk-ref">${ref}</span><span class="bdk-ct">${tx('OUT')}</span></button>`;
    // On the phone's Receive tab each pallet says whether a consol on it is verified on the manifest.
    const rcv = !desk && st.view !== 'run', ver = verified(p);
    const s = p.status || 'landed', tg = !desk && st.view === 'run' && st.arm && (startable(p) || (s === 'active' && !openSegs(p).some(x => x.pid === st.arm))), pc = pace(t, p), crew = openSegs(p).map(x => x.pid).join('+');
    return `<button class="bdk-sq marked t-${PT_LETTER[p.ptype] || 'c'} st-${s}${tg ? ' tg' : ''}${p.carryover ? ' co' : ''}${pc ? ' pc-' + pc : ''}${p.suspect ? ' sus' : ''}${st.sel === ref || st.moving === ref ? ' hit' : ''}" data-act="cell" data-ref="${ref}" title="${ref} · ${esc(PT_NAME[p.ptype] || p.ptype)} · ${tx('{n} cartons', { n: p.cartons ?? '–' })} · ${pstate(s)}${p.expectedMins ? ' · ' + tx('est {n} min', { n: p.expectedMins }) : ''}${p.carryover ? ' · ' + tx('carried over') : ''}${p.suspect ? ' · ' + tx('done very fast: check the times') : ''}${flags(t, p).map(f => ' · ' + f[1]).join('')}${rcv ? ' · ' + (ver ? tx('Consol verified on the manifest') : tx('No consol verified yet')) : ''}"><span class="bdk-ref">${ref}</span><span class="bdk-ct">${p.cartons ?? '–'}</span>${flagTag(t, p)}${s === 'active' || s === 'paused' ? `<span class="bdk-tm" data-tick="${ref}" data-tick-short="1"></span>` : ''}${crew ? `<span class="bdk-who">${esc(crew)}</span>` : ''}${rcv ? vfMark(p) : p.suspect ? '<span class="bdk-flag">⚠</span>' : s === 'active' ? '<span class="bdk-flag">▶</span>' : s === 'done' ? '<span class="bdk-flag">✓</span>' : s === 'paused' ? '<span class="bdk-flag">⏸</span>' : ''}</button>`;
  }).join('') + '</div>';
}
// What a square needs from someone, most pressing first: labels off the
// manifest, a late arrival, a consol planned for another truck, a label seen
// before, no carton count. The square shows the first; its title lists all.
function flags(t, p) {
  const off = (p.held || []).length + (t.manifest ? p.scanIds.filter(id => !p.consolIds.includes(id)).length : 0), out = [];
  if (off) out.push(['off', txn(off, '{n} label not on the manifest', '{n} labels not on the manifest'), tx('OFF')]);
  if (p.lateFrom) out.push(['late', tx('late: manifested {date}', { date: fmtDate(p.lateFrom.d) }), tx('LATE')]);
  if (p.plannedFor) out.push(['plan', tx('on the manifest for Truck {n}', { n: truckNo(p.plannedFor.t) }), tx('T{n}', { n: truckNo(p.plannedFor.t) })]);
  if (p.seenBefore) out.push(['seen', tx('label seen before on Truck {n}', { n: truckNo(p.seenBefore.t) }), tx('SEEN')]);
  if (p.status !== 'done' && !(p.cartons > 0)) out.push(['ctn', tx('add the cartons'), tx('+CTN')]);
  return out;
}
const flagTag = (t, p) => { const f = flags(t, p)[0]; return f ? `<span class="bdk-fl ${f[0]}">${esc(f[2])}</span>` : ''; };
const movingBar = () => st.moving ? `<div class="bdk-hint on">${tx('Moving {ref}: tap an empty square.', { ref: esc(st.moving) })}<button class="btn sm" data-act="move-cancel">${tx('Cancel')}</button></div>` : '';
const legend = () => `<span class="bdr-legend">${PTYPES.map(p => `<span><i style="background:${p[2]}"></i>${p[1]}</span>`).join('')}<span><i style="background:#C9F0D8;border:1px solid #86D9A8"></i>${tx('Done')}</span><span><i style="background:#fff;border:2px solid var(--accent)"></i>${tx('Decanting')}</span><span><i style="background:#fff;border:2px solid #7C3AED"></i>${tx('Carryover')}</span><span><i style="background:#fff;border:2px solid #DC2626"></i>${tx('Over its estimate')}</span></span>`;
// Hold-ups: pick a kind, then a reason (halts and transitions) with an
// optional note. A huddle and a team break start straight away.
function holdPicker(t) {
  // The team break the planner booked shows its length (DV's booked break).
  const booked = t?.plannedBreakMins;
  const kinds = Object.entries(KIND_NAME).map(([k, v]) => `<button class="chip${st.holdKind === k ? ' on' : ''}" data-act="holdkind" data-kind="${k}">${v}${k === 'break' && booked ? ' · ' + tx('{n} min booked', { n: booked }) : ''}</button>`).join('');
  const reasons = st.holdKind === 'halt' ? HALT_NAME : st.holdKind === 'transition' ? TRANS_NAME : null;
  return `<div class="bdr-reasons">${kinds}</div>` + (st.holdKind ? `<div class="bdr-reasons">${reasons ? Object.entries(reasons).map(([k, v]) => `<button class="chip" data-act="haltgo" data-kind="${st.holdKind}" data-reason="${k}">${v}</button>`).join('') : `<button class="btn sm primary" data-act="haltgo" data-kind="${st.holdKind}" data-reason="${st.holdKind}">${START_KIND[st.holdKind] || esc(KIND_NAME[st.holdKind])}</button>`}<input class="bdr-in" data-field="haltnote" maxlength="120" placeholder="${tx('Note (optional)')}"></div>` : '');
}
function holdRow(t, h, live) {
  const back = h?.kind === 'break' && t?.plannedBreakMins ? ' · ' + tx('{n} min booked, back at {time}', { n: t.plannedBreakMins, time: fmtHM(new Date(Date.parse(h.start) + t.plannedBreakMins * 60000).toISOString()) }) : '';
  if (h) return `<div class="bdr-haltrow${h.kind && h.kind !== 'halt' ? ' planned' : ''}">${ic('alert')}<b>${esc(holdName(h))}</b>${h.note ? ` · ${esc(h.note)}` : ''} ${tx('since {time}', { time: fmtHM(h.start) })}${back} · ${tx('decant clock stopped')}<button class="btn sm" data-act="haltend">${esc(END_KIND[h.kind || 'halt'] || KIND_NAME[h.kind])}</button></div>`;
  if (!live) return '';
  return `<div class="bdr-haltrow dim">${ic('clock')}${tx('Decant running')}<button class="btn sm" data-act="halt">${ic('alert')}${tx('Hold-up')}</button><button class="btn sm" data-act="huddleplan">${ic('users')}${tx('Book huddle')}</button></div>${st.halting ? holdPicker(t) : ''}`;
}
function landForm() {
  return `<div class="bdr-land"><span class="lbl">${tx('Land a pallet')}</span><input class="bdr-in mono" data-field="ref" placeholder="${tx('bay field::Bay')}" maxlength="3" title="${tx('Grid ref, e.g. A1, or click an empty cell')}" value="${esc(st.land.ref)}"><span class="bdr-pts${st.land.ptype ? '' : ' ask'}" title="${tx('Choose the type for each pallet')}">${PTYPES.map(p => `<button class="bdr-pt${st.land.ptype === p[0] ? ' on' : ''}" data-act="ptype" data-pt="${p[0]}" aria-pressed="${st.land.ptype === p[0]}"><i style="background:${p[2]}"></i>${p[1]}</button>`).join('')}</span><input class="bdr-in mono" data-field="cartons" inputmode="numeric" placeholder="${tx('Cartons')}" maxlength="3" value="${esc(st.land.cartons)}"><button class="btn primary sm" data-act="land"${st.land.ptype ? '' : ` disabled title="${tx('Choose the pallet type first')}"`}>${ic('plus')}${tx('Land')}</button></div>`;
}
// Against the manifest as the truck lands (DV's board tally): consols
// matched, still to land, labels off the manifest, cartons short and pallets
// with no label matched. Short counts what has not landed yet, so it falls
// as the truck comes off.
function tallyRow(t) {
  const a = liveAudit(t); if (!a) return '';
  const c = (cls, v, l, title) => `<span class="bdr-tal${cls ? ' ' + cls : ''}" title="${title}"><b>${v}</b>${l}</span>`;
  return `<div class="bdr-tally">${c(a.matched === a.total ? 'ok' : '', `${a.matched}/${a.total}`, tx('consols matched'), tx('Consolidations on the manifest that have landed'))}${c(a.missing ? 'warn' : 'ok', a.missing, tx('not landed'), tx('On the manifest, not scanned on any pallet yet'))}${c(a.extra ? 'bad' : '', a.extra, tx('off-manifest'), tx('Labels scanned that are not on this manifest'))}${c(a.shortCartons ? 'warn' : '', a.shortCartons, tx('ctn short'), tx('Cartons the consols not landed yet carry'))}${a.unmatched ? c('bad', a.unmatched, tx('no label'), tx('Pallets landed with no label scanned')) : ''}</div>`;
}
function desktop(ctx) {
  const m = model(ctx), t = m.t, pr = m.pr, live = t?.status === 'live';
  const head = vh(tx('Receiving'), sub(fmtDate(todayKey()), txn(m.open.length, '{n} truck on the board', '{n} trucks on the board'), t ? (live ? tx('T{n} live', { n: truckNo(t.id) }) : tx('T{n} staged', { n: truckNo(t.id) })) : tx('dock clear')),
    (t ? `<button class="btn" data-act="manpick">${ic('file')}${t.manifest ? tx('Manifest {no}', { no: esc(t.manifest.manNo) }) : tx('Manifest')}</button><button class="btn" data-act="goal">${ic('clock')}${t.goalAt ? tx('Goal {time}', { time: fmtHM(t.goalAt) }) : tx('Set goal')}</button>` + (live ? `<button class="btn" data-act="finalise">${ic('check')}${tx('Finalise')}</button>` : `<button class="btn primary" data-act="golive">${ic('truck')}${tx('Start receiving T{n}', { n: truckNo(t.id) })}</button>`) : '') + `<button class="btn primary" data-act="newtruck">${ic('plus')}${tx('New truck')}</button>`, 'm-receiving');
  const ntCard = st.nt ? newTruckSheet(m.dock, ctx.store.get('plan'), st.nt, t) : '';
  if (!t) return head + phaseBar(null) + ntCard + decantBoard(m.dock, ctx.store.get('plan'), todayKey(), { act: true }) + `<div class="card bdr-empty" style="padding:28px;text-align:center"><div style="font-size:34px;color:var(--faint)">${ic('truck')}</div><b style="display:block;font-size:18px;margin:8px 0 4px">${tx('No truck on the dock')}</b><p class="lbl">${tx('Start receiving the next truck here, or let a dock phone land it. The board wakes either way.')}</p><button class="btn primary" data-act="newtruck">${ic('plus')}${tx('Start receiving a truck')}</button></div>` + heldCard(m.dock);
  const strip = `<div class="trk-strip">${m.open.map(x => truckCard(x, x.id === t.id)).join('')}</div>`;
  const rates = ratesFor(m.dock), man = t.manifest, fc = forecast(t, Date.now(), rates), gp = t.goalAt ? goalPace(t) : null;
  const headcard = `<div class="card bdr-headcard"><div class="bdr-head"><span class="bdr-tile">${ic('truck')}</span><div class="bdr-tt"><b>${tx('Truck {n}', { n: esc(truckNo(t.id)) })}</b><span class="tst ${esc(t.status)}">${live ? tx('Live') : tx('Staged')}</span><small>${live ? landedLine(t) + ' · ' + txn(pr.count, '{n} pallet', '{n} pallets') + (pallets(t).some(p => p.carryover) ? ' ' + tx('({n} carryover)', { n: pallets(t).filter(p => p.carryover).length }) : '') + ' · ' + tx('{n} decanting', { n: pr.active }) : tx('planned · Start receiving to land pallets')}${m.halt ? ` · <b style="color:#B91C1C">${esc(holdName(m.halt))}</b>` : ''}</small></div>${canAudit(ctx) ? `<button class="btn sm" data-act="audit" title="${tx('Print the receiving audit')}">${ic('print')}${tx('Audit')}</button>` : ''}` +
    `<div class="bdr-chips"><span class="bdr-chip"><span class="l">${tx('Manifest')}</span><span class="v">${man ? tx('{n}<small> cons · {c}c</small>', { n: man.consols.length, c: man.consols.reduce((n, c) => n + c.cartons, 0) }) : '—'}</span></span><button class="bdr-chip" data-act="setstart" title="${tx('When the decant clock started (clear time and rate run from here)')}"><span class="l">${tx('Decant start')}</span><span class="v">${fmtHM(startOf(t))}${t.decantStartAt ? '' : `<small> ${tx('landed')}</small>`}</span></button><span class="bdr-chip"><span class="l">${tx('Goal')}</span><span class="v">${t.goalAt ? fmtHM(t.goalAt) : '—'}</span></span><span class="bdr-chip"><span class="l">${tx('Forecast')}</span><span class="v">${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}${fc.at && t.goalAt ? `<small class="${fc.at > Date.parse(t.goalAt) ? 'c-red' : 'c-green'}"> ${fc.at > Date.parse(t.goalAt) ? tx('behind') : tx('ahead')}</small>` : ''}</span></span><button class="bdr-chip${t.receivingConfirmed ? ' ok' : ''}" data-act="${t.receivingConfirmed ? 'received' : 'phase-finish'}" title="${t.receivingConfirmed ? tx('Undo the hand-over: the layout is open again') : tx('Finish receiving: confirm the layout')}"><span class="l">${tx('Receiving')}</span><span class="v">${t.receivingConfirmed ? `${ic('check')}${tx('Confirmed {time}', { time: fmtHM(t.receivedAt) })}` : tx('Finish')}</span></button></div></div>` +
    `<div class="bdr-prog"><b class="bdr-big">${pr.done}</b><span class="bdr-of">${tx('/ {n} cartons', { n: pr.total })}</span><span class="bdr-pct">${pr.pct}%</span></div><div class="bdr-bar">${gp !== null ? `<b class="bdr-pace" style="left:${Math.round(gp * 100)}%" title="${tx('Where the team should be by now to make the goal')}"></b>` : ''}<i style="width:${pr.pct}%"></i></div>${tallyRow(t)}${noCartonNote(t)}</div>`;
  const dock = `<div class="card kpi dk rcv bdr-dock"><div class="kh">${ic('box')}<h3>${tx('The dock')}</h3>${legend()}</div>${live && !st.moving ? landForm() : ''}${movingBar()}${dockGrid(t, true)}${holdRow(t, m.halt, live)}</div>`;
  const teamcard = teamCard(t, m.run, live);
  const landed = Object.values(t.pallets || {}).slice().sort((a, b) => (a.landedAt || '').localeCompare(b.landedAt || ''));
  const landedcard = `<div class="card"><div class="ch"><h3>${tx('Landed today')}</h3><span class="cs-dim">${landed.length ? txn(landed.length, '{n} pallet · newest last', '{n} pallets · newest last') : tx('Truck {n}', { n: truckNo(t.id) })}</span></div>${landed.length ? `<div class="list rcv-list bdr-landed">${landed.map(p => `<div class="li${st.sel === p.ref ? ' sel' : ''}" data-act="cell" data-ref="${esc(p.ref)}"><span class="loc">${esc(p.ref)}</span><span class="nm">${esc(PT_ONE[p.ptype] || p.ptype)}${p.carryover ? ' · ' + tx('carryover') : ''}${p.excluded ? ` · <b>${tx('not in this session')}</b>` : ''} · ${tx('{n} cartons', { n: p.cartons ?? '–' })}${p.assignedTo ? ` · ${esc(p.assignedTo)}` : ''}${sightBadge(p)}</span><span class="rcv-st ${p.status}">${p.status === 'done' ? tx('Done') : p.status === 'active' ? tx('Decanting') : p.status === 'paused' ? tx('Paused') : tx('Waiting')}</span><span class="rt">${p.carryover ? tx('Yesterday') : fmtHM(p.landedAt)}</span></div>`).join('')}</div>` : `<div class="pempty">${tx('Nothing landed yet')}</div>`}${st.sel && t.pallets[st.sel] ? palletPanel(t, t.pallets[st.sel], true) : ''}</div>`;
  const picker = st.manPick ? manPicker(m, t) : '';
  const nUn = man ? unlinked(t).length : 0;
  const late = !man ? '' : st.linking ? linkSheet(t, rates) : nUn && pr.count ? `<div class="card ll-warn"><div class="ch"><h3>${ic('alert')}${txn(nUn, '{n} pallet not linked to manifest {no}', '{n} pallets not linked to manifest {no}', { no: esc(man.manNo) })}</h3><button class="btn sm primary" data-act="ll-open">${tx('Link landed pallets →')}</button></div><p class="lbl">${tx("Landed before the manifest was attached, or without a readable label. Link them so the reconciliation and the clear forecast use the manifest's cartons.")}</p></div>` : '';
  return head + clockNote(ctx) + strip + phaseBar(t) + ntCard + (st.finishing ? finishSheet(t, { audit: canAudit(ctx) }) : '') + (st.finalising ? finaliseCard(t, m.dock) : '') + sheetCard(t, m.dock) + picker + late + `<div class="bdr-stack">${live && !begun(t) && (t.team || []).length ? take5Card(t) : ''}${headcard}${dock}${teamcard}${planCard(t, rates)}${landedcard}</div>`;
}

// One pallet's controls: type, cartons, note, decant verbs, scanned
// consolidations. Desktop and phone share it.
function palletPanel(t, p, desk) {
  const team = t.team || [], s = p.status || 'landed', on = openSegs(p).map(x => x.pid), run = running(t);
  // The picker offers who can take it: on the team, not on a break, not on another pallet.
  const free = team.filter(m => !onBreak(t, m.pid) && (!run[m.pid] || run[m.pid] === p.ref) && !on.includes(m.pid));
  const picker = team.length ? (free.length ? `<select class="bdr-in" data-field="pid">${free.map(m => `<option value="${esc(m.pid)}"${p.assignedTo === m.pid ? ' selected' : ''}>${esc(who(m))}${m.role && m.role !== 'cutter' ? ' · ' + ROLE_NAME[m.role] : ''}</option>`).join('')}</select>` : `<span class="cs-dim">${tx('Everyone is busy or on a break.')}</span>`) : `<span class="cs-dim">${tx('No crew on this truck yet: add the team first.')}</span>`;
  const undo = p.segments.length ? `<button class="btn sm" data-act="dec" data-dec="unstart" title="${tx('Undo the last start')}">↶ ${tx('Undo start')}</button>` : '';
  const verbs = s === 'active' ? `<button class="btn sm" data-act="dec" data-dec="pause">⏸ ${tx('Pause')}</button><button class="btn primary sm" data-act="dec" data-dec="done">${ic('check')}${tx('Done')}</button>${free.length ? `<button class="btn sm" data-act="dec" data-dec="join">＋ ${tx('Join')}</button><button class="btn sm" data-act="dec" data-dec="handover">⇄ ${tx('Hand over')}</button>` : ''}${on.length > 1 ? on.map(pid => `<button class="btn sm" data-act="dec" data-dec="leave" data-pid="${esc(pid)}">${tx('{pid} steps off', { pid: esc(pid) })}</button>`).join('') : ''}${undo}`
    : s === 'paused' ? `<button class="btn primary sm" data-act="dec" data-dec="resume"${free.length ? '' : ' disabled'}>▶ ${tx('Resume')}</button><button class="btn sm" data-act="dec" data-dec="done">${ic('check')}${tx('Done')}</button>${undo}`
    : s === 'done' ? `<span class="status good">${tx('Decanted {time}', { time: fmtHM(p.doneAt) })}</span><button class="btn sm" data-act="dec" data-dec="reopen">↩ ${tx('Reopen')}</button>`
    : `<button class="btn primary sm" data-act="dec" data-dec="start"${free.length ? '' : ' disabled'}>▶ ${tx('Start')}</button>`;
  const worked = p.segments.length ? `<div class="bdk-clock pc-${pace(t, p) || 'none'}" data-tick="${esc(p.ref)}"></div>` : '';
  const sus = p.suspect ? `<div class="bdk-sus">${ic('alert')}<span>${tx('Done in {worked} against an estimate of {est} min. Probably a missed start: its time credits nobody until the times are fixed or it is confirmed.', { worked: fmtMins(workedMin(t, p, Date.parse(p.doneAt))), est: p.expectedMins })}</span><button class="btn sm" data-act="dec" data-dec="fix">${tx('Fix times')}</button><button class="btn sm" data-act="dec" data-dec="quick">${tx('It was quick')}</button></div>` : '';
  // Each scan can come off again: a wrong one blocks the right pallet (consol_taken).
  const unscan = id => `<button class="bdk-vx" data-act="unscan" data-id="${esc(id)}" title="${tx('Take {id} off this pallet', { id: esc(id) })}" aria-label="${tx('Take {id} off this pallet', { id: esc(id) })}">${ic('x')}</button>`;
  const scans = p.consolIds.map(id => { const c = (t.manifest?.consols || []).concat(t.carriedConsols || []).find(x => x.id === id); return `<div class="bdk-vrow ok"><span>✓</span><b class="mono">${esc(id)}</b><span>${c ? tx('{n} ctn', { n: c.cartons }) + (c.dept ? ' · ' + esc(c.dept) : '') : tx('on this pallet')}</span>${unscan(id)}</div>`; }).join('') +
    p.scanIds.filter(id => !p.consolIds.includes(id)).map(id => `<div class="bdk-vrow"><span>·</span><b class="mono">${esc(id)}</b><span>${t.manifest ? tx('not on this manifest · flagged in the receiving audit') : tx('saved · matches when a manifest is attached')}</span>${unscan(id)}</div>`).join('') +
    (p.held || []).map(id => `<div class="bdk-vrow warn"><span>⚠</span><b class="mono">${esc(id)}</b><span>${tx('not on this manifest')}</span><span class="bdk-vbtns"><button class="btn sm" data-act="pend-add" data-id="${esc(id)}">${tx('Add &amp; flag')}</button><button class="btn sm" data-act="pend-drop" data-id="${esc(id)}">${tx('Ignore')}</button></span></div>`).join('');
  return `<div class="bdk-pal${desk ? ' desk' : ''}"><div class="bdk-pal-h"><b>${tx('Pallet {ref}', { ref: esc(p.ref) })}</b><span class="tst ${s === 'done' ? 'done' : s === 'active' ? 'live' : 'staged'}">${esc(pstate(s))}</span>${p.carryover ? `<span class="status warn">${tx('carryover')}</span>` : ''}${sightBadge(p)}<button class="ibtn" data-act="closepal" title="${tx('Close')}">${ic('x')}</button></div>` +
    `<div class="bdk-pal-b">${desk ? `<div class="bdk-ptrow">${PTYPES.map(x => `<button class="bdr-pt${p.ptype === x[0] ? ' on' : ''}" data-act="pal-pt" data-pt="${x[0]}"><i style="background:${x[2]}"></i>${x[1]}</button>`).join('')}</div>` : typeButtons(p.ptype, 'pal-pt')}` +
    `<div class="bdk-fields"><label>${tx('Cartons')}<input class="bdr-in mono" data-field="pcartons" inputmode="numeric" maxlength="3" value="${p.cartons ?? ''}"></label><label>${tx('Est. mins')}<input class="bdr-in mono${p.expectedBasis === 'manual' ? '' : ' auto'}" data-field="pexp" inputmode="numeric" maxlength="4" value="${p.expectedMins ?? ''}" title="${p.expectedBasis === 'manual' ? tx('set by hand') : tx('auto · {n} min per carton', { n: t.minsPerCarton ?? STD_MINS_PER_CARTON })}"></label><label>${tx('Note')}<input class="bdr-in" data-field="pnote" maxlength="120" placeholder="${tx('optional')}" value="${esc(p.note || '')}"></label></div>` +
    (desk ? `<div class="bdk-scanrow"><input class="bdr-in mono" data-field="pscan" inputmode="numeric" enterkeyhint="done" placeholder="${tx('Scan or type a pallet label')}" autocomplete="off">${camButton('pscan')}<button class="btn sm" data-act="pscan">${ic('barcode')}${tx('Add')}</button></div>` : scanRow('pscan', 'pscan', tx('Scan a label'), st.typing.pscan)) + `${scans ? `<div class="bdk-verified">${scans}</div>` : ''}` +
    palletContents(t, p) + `<div class="bdk-decant"><div class="bdk-declab">${tx('Decant')}${on.length ? ` · ${esc(on.join(' + '))}` : p.assignedTo ? ` · ${esc(p.assignedTo)}` : ''}</div>${worked}${sus}${s !== 'done' ? picker : ''}${desk ? queuePicker(t, p) : ''}<div class="bdk-verbs">${verbs}</div>${st.fix === p.ref ? fixTimes(p) : ''}</div>` +
    `<div class="bdk-palacts"><button class="btn sm" data-act="pal-save">${ic('check')}${tx('Update')}</button>${p.segments.length && st.fix !== p.ref ? `<button class="btn sm" data-act="dec" data-dec="fix">${ic('clock')}${tx('Fix times')}</button>` : ''}${s !== 'done' ? `<button class="btn sm" data-act="dec" data-dec="move">⇲ ${tx('Move')}</button>` : ''}${s !== 'done' && !on.length ? `<button class="btn sm" data-act="${p.excluded ? 'pal-in' : 'pal-out'}" title="${p.excluded ? tx('Count it again') : tx('Leave it on its bay, out of this decant’s totals, plan and rollover')}">${p.excluded ? '↩ ' + tx('Include in this session') : '🚫 ' + tx('Not in this session')}</button>` : ''}<button class="btn sm" data-act="pal-remove">${ic('trash')}${tx('Remove')}</button></div></div></div>`;
}
// Fix times: each stretch of work (who, from, to) and the done time, as
// times of day on the day they happened.
const hmOf = iso => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function fixTimes(p) {
  return `<div class="bdk-fix"><div class="bdk-declab">${tx('Fix times')}</div>${p.segments.map((x, i) => `<div class="bdk-fixrow"><b class="mono">${esc(x.pid)}</b><label>${tx('from')}<input type="time" class="bdr-in" data-fix="start" data-i="${i}" value="${hmOf(x.start)}"></label><label>${tx('to')}<input type="time" class="bdr-in" data-fix="end" data-i="${i}" value="${hmOf(x.end)}"${x.end ? '' : ` placeholder="${tx('running')}"`}></label>${x.bf ? `<span class="cs-dim">${tx('estimated')}</span>` : ''}</div>`).join('')}` +
    (p.status === 'done' ? `<div class="bdk-fixrow"><b>${tx('Done')}</b><label>${tx('at')}<input type="time" class="bdr-in" data-fix="done" value="${hmOf(p.doneAt)}"></label></div>` : '') +
    `<div class="bdk-verbs"><button class="btn sm primary" data-act="dec" data-dec="fixsave">${ic('check')}${tx('Save times')}</button><button class="btn sm" data-act="dec" data-dec="fixcancel">${tx('Cancel')}</button></div></div>`;
}

// The team: who is on what, roles, personal breaks, add and remove. A break
// or a move off cutting steps the person off their pallet first (DV).
function teamCard(t, run, live) {
  const team = t.team || [];
  return `<div class="card"><div class="ch"><h3>${live ? tx('Decanting now') : tx('Team staged')}</h3><span class="cs-dim">${team.length ? tx('{n} on the dock', { n: team.length }) : tx('no team yet')}</span></div>` +
    (team.length ? `<div class="bdr-team">${team.map(mm => { const br = onBreak(t, mm.pid); return `<div class="bdr-tc${run[mm.pid] ? ' on' : ''}${br ? ' brk' : ''}"><b class="bdr-who">${esc(who(mm))}</b><span class="bdr-state">${br ? tx('on a break since {time}', { time: fmtHM(br.start) }) : run[mm.pid] ? tx('decanting <b>{ref}</b>', { ref: esc(run[mm.pid]) }) : tx('between pallets')}</span><select class="bdr-role" data-act-change="role" data-pid="${esc(mm.pid)}" aria-label="${tx('Role for {pid}', { pid: esc(mm.pid) })}">${Object.entries(ROLE_NAME).map(([k, v]) => `<option value="${k}"${(mm.role || 'cutter') === k ? ' selected' : ''}>${v}</option>`).join('')}</select>${live ? `<button class="btn sm" data-act="${br ? 'break-end' : 'break-start'}" data-pid="${esc(mm.pid)}">${br ? tx('break::Back') : tx('Break')}</button>` : ''}<button class="bdr-x" data-act="team-drop" data-pid="${esc(mm.pid)}" title="${tx('Remove from this truck')}" aria-label="${tx('Remove {pid} from this truck', { pid: esc(mm.pid) })}">${ic('x')}</button></div>`; }).join('')}</div>` : '') +
    `<div class="bdr-teamadd"><input class="bdr-in mono" data-field="team" placeholder="${tx('Add a D-number, e.g. D4')}" maxlength="6" autocapitalize="characters"><button class="btn sm" data-act="team-add">${ic('plus')}${tx('Add')}</button></div><p class="lbl">${tx('D-numbers only: no names are kept on the dock.')}</p></div>`;
}

// Finalise (DV's Complete decant): with pallets left, keep them for the next
// truck or clear the dock (decision 30). Not while one is being cut; an open
// hold-up and anyone's break end with it, and it says so.
function finaliseCard(t, dock) {
  const pr = progress(t), left = unfinished(t), cut = pallets(t).filter(p => openSegs(p).length), h = openHalt(t), brk = (t.team || []).filter(m => onBreak(t, m.pid));
  const head = `<div class="card bdr-fin"><div class="ch"><h3>${tx('Complete decant · Truck {n}', { n: esc(truckNo(t.id)) })}</h3><span class="cs-dim">${tx('{done}/{n} pallets done', { done: pr.doneCount, n: pr.count })}</span></div>`;
  if (cut.length) return head + `<p class="bdr-fin-warn">${ic('alert')}${txn(cut.length, '{n} pallet is still being cut ({refs}). Pause or finish it, then close.', '{n} pallets are still being cut ({refs}). Pause or finish them, then close.', { refs: esc(cut.map(p => p.ref).join(', ')) })}</p><div class="bdr-fin-acts"><button class="btn" data-act="fin-cancel">${tx('Back')}</button></div></div>`;
  const ends = [h && tx('{hold}, running since {time}, ends now.', { hold: esc(holdName(h)), time: fmtHM(h.start) }), brk.length && txn(brk.length, '{who} comes off their break.', '{who} come off their break.', { who: esc(brk.map(m => m.pid).join(', ')) })].filter(Boolean);
  const note = ends.length ? `<p class="lbl">${ends.join(' ')}</p>` : '';
  if (!left.length) return head + `<p>${tx('The dock is clear: closing writes the decant to history and updates personal rates.')}</p>${note}<div class="bdr-fin-acts"><button class="btn primary" data-act="fin-clear">${ic('check')}${tx('Close truck')}</button><button class="btn" data-act="fin-cancel">${tx('Cancel')}</button></div></div>`;
  const ctn = left.reduce((n, p) => n + (p.cartons || 0), 0), held = dock.rollover;
  return head + `<p>${txn(left.length, 'Closing writes the decant to history and updates rates. <b>{n} pallet ({ctn} ctn)</b> is still on the dock, not decanted: {refs}.', 'Closing writes the decant to history and updates rates. <b>{n} pallets ({ctn} ctn)</b> are still on the dock, not decanted: {refs}.', { ctn, refs: esc(left.map(p => p.ref).join(', ')) })}</p>${note}` +
    `<div class="bdr-fin-acts"><button class="btn primary" data-act="fin-keep"${held ? ' disabled' : ''}>${tx('Keep {n} as rollover &amp; close', { n: left.length })}<small>${held ? tx('pallets from Truck {n} are already held', { n: esc(truckNo(held.from)) }) : tx('they stay on their bays for the next truck')}</small></button><button class="btn" data-act="fin-clear">${tx('Clear the dock &amp; close')}<small>${tx('nothing kept: they stay on this truck’s record, not decanted')}</small></button><button class="btn" data-act="fin-cancel">${tx('Cancel')}</button></div></div>`;
}
// Dock times are stamped on the store's clock (decision 31); a device whose
// own clock is a minute or more out is told, since its wall clock disagrees.
function clockNote(ctx) {
  const off = ctx.store?.clockOffset || 0; if (Math.abs(off) < 60000) return '';
  const mins = Math.round(Math.abs(off) / 60000);
  return `<div class="bdr-clock">${ic('clock')}${off > 0 ? tx('This device’s clock is {n} min slow. Dock times use the store’s clock, so they stay right; fix the device’s time when you can.', { n: mins }) : tx('This device’s clock is {n} min fast. Dock times use the store’s clock, so they stay right; fix the device’s time when you can.', { n: mins })}</div>`;
}

// Pallets held at the last finalise, between trucks: on the board until
// the next truck takes them.
function heldCard(dock) {
  const h = dock.rollover; if (!h) return '';
  const list = Object.values(h.pallets).sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  return `<div class="card bdr-held"><div class="ch"><h3>${tx('Held for the next truck')}</h3><span class="cs-dim">${tx('from Truck {n}', { n: esc(truckNo(h.from)) })} · ${txn(list.length, '{n} pallet', '{n} pallets')} · ${tx('{n} ctn', { n: list.reduce((n, p) => n + (p.cartons || 0), 0) })}</span></div>` +
    `<div class="list">${list.map(p => `<div class="li"><span class="loc">${esc(p.ref)}</span><span class="nm">${esc(PT_NAME[p.ptype] || p.ptype)} · ${tx('{n} cartons', { n: p.cartons ?? '–' })}${p.carriedFrom && p.carriedFrom !== h.from ? ' · ' + tx('first landed on Truck {n}', { n: esc(truckNo(p.carriedFrom)) }) : ''}</span><span class="rcv-st ${esc(p.status)}">${p.status === 'paused' ? tx('Paused') : tx('Waiting')}</span></div>`).join('')}</div><p class="lbl">${tx('They stay on their bays and join the next truck when it starts.')}</p></div>`;
}

// ── phone ──────────────────────────────────────────────────────────────
// Two tabs, as Decant Visualiser had them: Receive (land pallets) and Decant
// (run the truck). Each is the grid first, under a one-line truck bar with
// a Scan button; the strip above the tabs carries the tally and the next
// step (or Halt) and opens into the panel with every tool. One sheet at a
// time (land, pallet, new truck, finish, search…) rises over the grid.
let lastMode = null;
function mobile(ctx, mode) {
  // A tab switch closes what the other tab had open (a pallet chosen for it stays).
  if (lastMode && lastMode !== mode) { st.more = st.panel = st.trucks = st.halting = st.finishing = st.finalising = st.manPick = st.roles = false; st.sheet = st.roleAsk = st.person = null; ss.open = ss.info = false; st.arm = null; st.moving = null; if (!st.keepSel) st.sel = null; }
  st.keepSel = false; lastMode = mode;
  st.view = mode; const run = mode === 'run';
  const m = model(ctx), t = m.t, plan = ctx.store.get('plan'), sheet = phoneSheet(ctx, m, t, plan, run);
  if (!t) return `<div class="dk-top"><div class="dk-tr"><b class="dk-tn">${tx('No truck on the dock')}</b>${phaseChip(null)}</div></div>` +
    `<div class="dk-body">${clockNote(ctx)}${decantBoard(m.dock, plan, todayKey(), { act: true })}${heldCard(m.dock)}</div>` + sheet +
    strip(`<div class="dk-st"><div class="dk-l1"><span>${tx('Tap New truck when it lands.')}</span></div></div><button class="dk-go" data-act="newtruck">${ic('plus')}${tx('New truck')}</button>`, '', false);
  const body = run ? (!begun(t) ? readyBlock(t) : movingBar() + `<div class="bdk">${dockGrid(t, false)}</div>` + runHint() + crewStrip(t, m) + noCartonNote(t) + upNext(t, m))
    : movingBar() + entryGrid(t) + legendHint(t) + lastLanded(t);
  return truckBar(t, run) + `<div class="dk-body">${clockNote(ctx)}${body}</div>` + sheet + (run ? runStrip(t, m) : receiveStrip(t));
}
// The truck bar: which truck (tap to switch or start another), its phase,
// the six steps, and Scan: a label lands or finds its pallet in Receive and
// opens its pallet in Decant.
function truckBar(t, run) {
  const ph = truckPhase(t), at = PHASES.indexOf(ph);
  return `<div class="dk-top"><div class="dk-tr"><button class="dk-tn" data-act="trucks" aria-expanded="${!!st.trucks}" aria-label="${tx('Truck {n}: switch truck or start a new one', { n: esc(truckNo(t.id)) })}">${tx('Truck {n}', { n: esc(truckNo(t.id)) })}${ic('chev')}</button>${phaseChip(t)}<span class="dk-sp"></span>` +
    manBox(t) + `</div>` +
    `<ol class="dk-steps" aria-label="${tx('Truck phase')}: ${PHASE_NAME[ph]}">${PHASES.map((p, i) => `<li class="${i < at ? 'dn' : i === at ? 'on' : ''}"${i === at ? ' aria-current="step"' : ''}><i></i><span>${PHASE_NAME[p]}</span></li>`).join('')}</ol></div>`;
}
// Beside the truck's name: its manifest and what it expects (tap for the
// manifest), or a way to attach one.
function manBox(t) {
  const man = t.manifest;
  if (!man) return `<button class="dk-man none" data-act="manpick"><b>${ic('file')}${tx('No manifest')}</b><small>${t.plannedManifest ? tx('{no} attaching', { no: esc(t.plannedManifest) }) : tx('Tap to attach one')}</small></button>`;
  const ctn = man.consols.reduce((n, c) => n + (Number(c.cartons) || 0), 0);
  return `<button class="dk-man" data-act="ps-info" aria-label="${tx('Manifest {no}', { no: esc(man.manNo) })}"><b>${ic('file')}${esc(man.manNo)}</b><small>${tx('{c} ctn · {n} consols expected', { c: ctn.toLocaleString(), n: man.consols.length })}</small></button>`;
}
const strip = (inner, cls = '', tog = true) => `<div class="dk-strip${cls}">${inner}${tog ? `<button class="dk-tog" data-act="panel" aria-expanded="${!!st.panel}" aria-label="${st.panel ? tx('Hide the details') : tx('Show the details')}">${ic('chev')}</button>` : ''}</div>`;
const nextBtn = t => { const n = nextStep(t); return n ? `<button class="dk-go" data-act="phase-${n.act}">${esc(n.label)}</button>` : ''; };
// Receive: consols matched (or pallets and cartons with no manifest), what
// is still to land and off the manifest, and the next step.
function receiveStrip(t) {
  const a = liveAudit(t), c = phaseCounts(t);
  const info = a ? `<div class="dk-l1"><b>${a.matched}/${a.total}</b><span>${tx('consols matched')}</span></div><div class="dk-bar"><i style="width:${Math.round(a.matched / Math.max(1, a.total) * 100)}%"></i></div><div class="dk-l2"><b class="w">${a.missing}</b> ${tx('to land')} · <b class="${a.extra ? 'r' : ''}">${a.extra}</b> ${tx('off-manifest')}</div>`
    : `<div class="dk-l1"><b>${c.pallets}</b><span>${txn(c.pallets, 'pallet landed', 'pallets landed')} · ${tx('{n} ctn', { n: c.cartons })}</span></div><div class="dk-l2">${t.status === 'live' ? tx('No manifest yet: open the panel to attach one.') : tx('Not landed yet')}</div>`;
  return strip(`<div class="dk-st">${info}</div>${nextBtn(t)}`);
}
// Decant: Ready to start until Take 5, then cartons done, the pace against
// the goal and a big Halt; a hold-up turns it red with Resume; cleared, it
// offers Close the truck.
function runStrip(t, m) {
  const ph = truckPhase(t), pr = m.pr;
  if (t.status !== 'live') return strip(`<div class="dk-st"><div class="dk-l1"><span>${tx('Start receiving first: the decant starts once the truck is on the dock.')}</span></div></div>${nextBtn(t)}`);
  if (!begun(t)) return strip(`<div class="dk-st"><div class="dk-l1"><b class="t">${PHASE_NAME[ph]}</b></div><div class="dk-l2">${tx('Take 5, then Start decant')}</div></div>`);
  if (m.halt) return strip(`<div class="dk-st"><div class="dk-l1"><b class="t">${esc(holdName(m.halt))}</b></div><div class="dk-l2">${tx('since {time}', { time: fmtHM(m.halt.start) })} · ${tx('decant clock stopped')}</div></div><button class="dk-go resume" data-act="haltend">▶ ${esc(END_KIND[m.halt.kind || 'halt'] || tx('Resume'))}</button>`, ' halted');
  if (ph === 'cleared') return strip(`<div class="dk-st"><div class="dk-l1"><b>${pr.done}/${pr.total}</b><span>${tx('Every pallet is done.')}</span></div></div><button class="dk-go" data-act="phase-finalise">${tx('Close the truck')}</button>`);
  const fc = forecast(t, Date.now(), ratesFor(m.dock)), gp = t.goalAt ? goalPace(t) : null, late = fc.at && t.goalAt && fc.at > Date.parse(t.goalAt);
  return strip(`<div class="dk-st"><div class="dk-l1"><b>${pr.done}/${pr.total}</b><span>${tx('ctn · {pct}% · {done} of {n} done', { pct: pr.pct, done: pr.doneCount, n: pr.count })}</span></div>` +
    `<div class="dk-bar"><i style="width:${pr.pct}%"></i>${gp !== null ? `<b style="left:${Math.round(gp * 100)}%"></b>` : ''}</div>` +
    `<div class="dk-l2">${tx('est')} <b class="${late ? 'r' : ''}">${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}</b> · ${t.goalAt ? tx('goal {time}', { time: fmtHM(t.goalAt) }) : tx('no goal set')}</div></div>` +
    `<button class="dk-go halt" data-act="halt" aria-expanded="${st.halting}">${tx('Halt')}</button>`);
}
// The panel (the strip opened): the phase with its steps named and the next
// step, the counts, and every tool.
const tool = (act, icon, label, cls = '', extra = '') => `<button class="dk-tool${cls}" data-act="${act}"${extra}>${ic(icon)}<span>${label}</span></button>`;
function receivePanel(t) {
  const a = liveAudit(t), c = phaseCounts(t);
  return `<div class="dk-pan rcv">${phaseBar(t)}<div class="dk-tiles"><span class="dk-tile"><b>${c.pallets}</b>${txn(c.pallets, 'pallet', 'pallets')}</span><span class="dk-tile"><b>${c.cartons}</b>${tx('ctn counted')}</span>` +
    (a ? `<span class="dk-tile w"><b>${a.missing}</b>${tx('to land')}</span><span class="dk-tile${a.extra ? ' r' : ''}"><b>${a.extra}</b>${tx('off-manifest')}</span>` : `<span class="dk-tile w"><b>—</b>${tx('no manifest')}</span>`) + `</div>` +
    `<div class="dk-tools">${tool('ps-open', 'search', tx('Search'))}${tool(t.manifest ? 'ps-info' : 'manpick', 'file', t.manifest ? tx('Manifest {no}', { no: esc(t.manifest.manNo) }) : tx('Attach a manifest'), t.manifest ? '' : ' lit')}${tool('more', 'users', tx('Team &amp; plan'))}` +
    `${tool('setstart', 'clock', tx('Decant start'))}${tool('newtruck', 'plus', tx('New truck'))}</div></div>`;
}
function runPanel(t, m) {
  const fc = forecast(t, Date.now(), ratesFor(m.dock)), late = fc.at && t.goalAt && fc.at > Date.parse(t.goalAt), pr = m.pr;
  return `<div class="dk-pan">${phaseBar(t)}<div class="dk-tiles"><span class="dk-tile${late ? ' r' : ''}"><b>${m.halt ? '—' : fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}</b>${tx('est. clear')}</span><button class="dk-tile" data-act="goal"><b>${t.goalAt ? fmtHM(t.goalAt) : tx('Set')}</b>${tx('goal')}</button><span class="dk-tile"><b>${pr.doneCount}/${pr.count}</b>${tx('pallets done')}</span><span class="dk-tile"><b>${fmtHM(startOf(t))}</b>${tx('decant start')}</span></div>` + noCartonNote(t) +
    `<div class="dk-tools">${tool('goal', 'clock', tx('Goal'))}${tool('huddleplan', 'users', tx('Book huddle'))}${tool('more', 'users', tx('Team &amp; plan'))}${tool('ps-open', 'search', tx('Search'))}${tool('halt', 'alert', tx('Hold-up'))}${tool('finalise', 'check', tx('Complete decant'))}</div></div>`;
}
// The truck menu: the trucks on the dock, and New truck.
function trucksSheet(m, t) {
  return `<div class="dk-sh-h"><h3>${tx('Trucks on the dock')}</h3><button class="ibtn" data-act="trucks" aria-label="${tx('Close')}">${ic('x')}</button></div><div class="dk-tlist">` +
    m.open.map(x => `<button class="dk-trow${x.id === t.id ? ' on' : ''}" data-act="pick" data-id="${esc(x.id)}" aria-pressed="${x.id === t.id}"><span><b>${tx('Truck {n}', { n: esc(truckNo(x.id)) })}</b>${phaseChip(x)}</span><small>${x.status === 'live' ? landedLine(x) : tx('planned · Start receiving to land pallets')}${x.manifest ? ' · ' + tx('Manifest {no}', { no: esc(x.manifest.manNo) }) : ''}</small></button>`).join('') +
    `</div><button class="btn primary big" style="width:100%;justify-content:center;margin-top:10px" data-act="newtruck">${ic('plus')}${tx('New truck')}</button>`;
}
// The one sheet over the grid, most pressing first; closing it shows the
// panel again if it was open (a step back).
function phoneSheet(ctx, m, t, plan, run) {
  const wrap = html => html ? `<div class="dk-sheet" role="dialog">${html}</div>` : '';
  if (st.nt) return wrap(newTruckSheet(m.dock, plan, st.nt, t));
  if (!t) return '';
  if (st.finishing) return wrap(finishSheet(t));
  if (st.finalising) return wrap(finaliseCard(t, m.dock));
  if (st.sheet) return wrap(sheetCard(t, m.dock));
  if (st.manPick) return wrap(manPicker(m, t));
  if (st.halting && !m.halt) return wrap(`<div class="dk-sh-h"><h3>${tx('Hold-up')}</h3><button class="ibtn" data-act="halt" aria-label="${tx('Close')}">${ic('x')}</button></div><p class="lbl">${tx('The decant clock stops until it ends.')}</p>${holdPicker(t)}`);
  if (ss.open) return wrap(searchSheet(ctx, t));
  if (ss.info) return wrap(infoSheet(t));
  if (st.more) return wrap(moreSheet(m, t));
  if (st.trucks) return wrap(trucksSheet(m, t));
  // A pallet, landed or about to be, opens as a popup in the middle of the screen.
  const modal = (label, html, close = 'closepal') => `<div class="dk-modal" role="dialog" aria-modal="true" aria-label="${label}"><button class="dk-scrim" data-act="${close}" aria-label="${tx('Close')}"></button><div class="dk-dlg">${html}</div></div>`;
  if (st.person && (t.team || []).some(x => x.pid === st.person)) return modal(esc(st.person), personPanel(t, m, st.person), 'person-close');
  if (st.roles && (t.team || []).length) return modal(tx('Crew roles'), rolesPanel(t, m), 'roles-close');
  if (st.sel && !(run && !begun(t))) return t.pallets[st.sel] ? modal(tx('Pallet {ref}', { ref: esc(st.sel) }), palletPanel(t, t.pallets[st.sel], false)) : modal(landTitle(t, st.sel), landPanel(t, st.sel));
  if (st.panel) return `<div class="dk-sheet pan" role="dialog">${run ? runPanel(t, m) : receivePanel(t)}</div>`;
  return '';
}
// Receive's grid under a slim header, with how many of its pallets carry a
// consol verified on the manifest (the ticks and crosses on the squares).
function entryGrid(t) {
  const ps = Object.values(t.pallets || {}).filter(p => !p.excluded), ok = ps.filter(verified).length;
  return `<div class="card dk-list dk-pe"><div class="dk-lh">${tx('Pallet entry')}${ps.length ? `<span>${tx('{n} of {total} verified', { n: ok, total: ps.length })}</span>` : ''}</div><div class="bdk">${dockGrid(t, false)}</div></div>`;
}
// Under the grid in Receive: the colours and what to do, then the last
// pallets landed (tap one to open it).
function legendHint(t) {
  return `<div class="dk-hint">${PTYPES.map(p => `<span class="lg"><i style="background:${p[2]}"></i>${PT_SHORT[p[0]]}</span>`).join('')}<span class="r">${t.status === 'live' ? tx('Tap an empty square to land') : tx('Start receiving to land pallets')}</span></div>`;
}
function lastLanded(t) {
  const ps = pallets(t).filter(p => !p.carryover && p.landedAt).sort((a, b) => b.landedAt.localeCompare(a.landedAt)), c = phaseCounts(t);
  if (!ps.length) return t.status === 'live' ? `<p class="dk-empty">${tx('Nothing landed yet. Tap an empty square, or Scan a label.')}</p>` : '';
  return `<div class="card dk-list"><div class="dk-lh">${tx('Last landed')}<span>${landedLine(t)} · ${tx('{n} ctn', { n: c.cartons })}</span></div>` +
    ps.slice(0, 4).map(p => { const n = p.consolIds.length + p.scanIds.length; return `<button class="dk-li" data-act="cell" data-ref="${esc(p.ref)}"><b class="dk-ref t-${PT_LETTER[p.ptype] || 'c'}">${esc(p.ref)}</b>${vfMark(p)}<span><em class="ty t-${PT_LETTER[p.ptype] || 'c'}">${esc(PT_ONE[p.ptype] || p.ptype)}</em> · ${tx('{n} ctn', { n: p.cartons ?? '–' })}${n ? ' · ' + txn(n, '{n} label', '{n} labels') : ''}</span><small>${fmtHM(p.landedAt)}</small></button>`; }).join('') + `</div>`;
}
// Under the crew in Decant: where each busy cutter goes next, from the plan
// (a free one has NEXT on their chip).
function upNext(t, m) {
  const rows = (t.team || []).filter(mm => (mm.role || 'cutter') === 'cutter' && !onBreak(t, mm.pid) && m.run[mm.pid]).map(mm => ({ mm, ref: nextFor(t, mm.pid) })).filter(x => x.ref);
  if (!rows.length) return '';
  return `<div class="card dk-list"><div class="dk-lh">${tx('Up next')}</div>` + rows.slice(0, 4).map(({ mm, ref }) => { const p = t.pallets[ref], on = m.run[mm.pid]; return `<button class="dk-li" data-act="cell" data-ref="${esc(ref)}"><b>${esc(who(mm))}</b><span><em class="ty t-${PT_LETTER[p.ptype] || 'c'}">${esc(ref)} · ${esc(PT_ONE[p.ptype] || p.ptype)}</em> · ${tx('{n} ctn', { n: p.cartons ?? '–' })}</span><small>${on ? tx('after {ref}', { ref: esc(on) }) : tx('now')}</small></button>`; }).join('') + `</div>`;
}
// The truck's landed time, and when its first pallet came off.
function landedLine(t) {
  const own = pallets(t).filter(p => !p.carryover && p.landedAt).map(p => p.landedAt).sort()[0];
  return tx('landed {time}', { time: fmtHM(t.landedAt) }) + (own && fmtHM(own) !== fmtHM(t.landedAt) ? ' · ' + tx('first pallet {time}', { time: fmtHM(own) }) : '');
}
// Decant, before it begins: Ready to start (the team, Take 5, then Start).
function readyBlock(t) {
  if (t.status !== 'live') return `<div class="mv-note">${ic('truck')}${tx('Start receiving first: the decant starts once the truck is on the dock.')}</div>`;
  if (!(t.team || []).length) return `<div class="mv-note">${ic('users')}${tx('No crew on this truck yet. Add the team from <b>Team &amp; plan</b>, then Take 5 starts the decant.')}</div>`;
  return take5Card(t);
}
// A pallet with no carton count is planned at 60 minutes: said, not silent.
const noCartonNote = t => { const n = phaseCounts(t).noCartons; return n ? `<div class="rvp-msg warn">${ic('alert')}<span>${txn(n, '{n} pallet has no carton count: it is planned at 60 minutes until it is counted.', '{n} pallets have no carton count: they are planned at 60 minutes until they are counted.')}</span></div>` : ''; };
const runHint = () => `<div class="bdk-hint${st.arm ? ' on' : ''}">${st.arm ? tx('Armed: tap a lit square to start it (or join it), or the chip again to disarm.') : tx('Tap a cutter, then a square, to start decanting it.') + ' ' + tx('Hold a name for more.')}</div>`;
// Each cutter's next pallet from their queue (the plan): ▶ starts it in one tap.
const nextFor = (t, pid) => (t.plan?.queues?.[pid] || []).find(r => t.pallets[r] && !t.pallets[r].excluded && startable(t.pallets[r]) && !openSegs(t.pallets[r]).length);
function crewStrip(t, m) {
  const team = t.team || [];
  if (!team.length) return `<div class="mv-note">${ic('users')}${tx('No crew on this truck yet. Add the team from <b>Team &amp; plan</b>.')}</div>`;
  // The crew line: how many on each role, and Roles to change them.
  const counts = ROLES.map(r => [r, team.filter(mm => roleOf(mm) === r).length]).filter(x => x[1]);
  const line = `<div class="dk-crew"><span class="lb">${tx('Crew')}</span>${counts.map(([r, n]) => `<span class="rc r-${r}">${ic(ROLE_IC[r])}${ROLE_COUNT[r](n)}</span>`).join('')}<button class="dk-rolesb" data-act="roles" aria-expanded="${!!st.roles}">${ic('users')}${tx('Roles')}</button></div>`;
  // A cutter's tap arms them (tap a square next); anyone else's opens Roles,
  // and someone on a break opens their own popup to bring them back. Holding
  // any name opens that person's popup.
  return line + `<div class="bdk-strip">${team.map(mm => {
    const pid = mm.pid, r = roleOf(mm), br = onBreak(t, pid), cut = r === 'cutter', on = m.run[pid], nx = cut && !br && !on && !m.halt ? nextFor(t, pid) : null;
    return `<span class="bdk-fw"><button class="bdk-fchip r-${r}${on ? ' on' : ''}${st.arm === pid ? ' armed' : ''}${br ? ' brk' : ''}" data-act="${br ? 'person' : cut ? 'arm' : 'roles'}" data-pid="${esc(pid)}" data-hold="${esc(pid)}" title="${tx('Hold for {pid}’s role, break and more', { pid: esc(pid) })}">${ic(ROLE_IC[r], 'ri')}<b>${esc(who(mm))}</b><span>${br ? tx('on a break') : on ? '▶ ' + esc(on) : !cut ? esc(ROLE_NAME[r] || r) : tx('free')}</span></button>` +
      (nx ? `<button class="bdk-next" data-act="next-go" data-pid="${esc(pid)}" data-ref="${esc(nx)}" aria-label="${tx('Start {ref} for {pid}', { ref: esc(nx), pid: esc(pid) })}">▶ ${tx('NEXT {ref}', { ref: esc(nx) })}</button>` : '') + `</span>`;
  }).join('')}</div>`;
}
// Minutes someone has been on the pallet they are decanting now.
const onFor = (t, pid, ref) => { const seg = openSegs(t.pallets[ref] || { segments: [] }).find(x => x.pid === pid); return seg ? Math.max(0, Math.round((Date.now() - Date.parse(seg.start)) / 60000)) : 0; };
// A cutter free to take a pallet over: not on one, not on a break.
const freeCutter = (t, m, not) => (t.team || []).find(mm => mm.pid !== not && roleOf(mm) === 'cutter' && !m.run[mm.pid] && !onBreak(t, mm.pid));
const roleButtons = (pid, cur, cls) => `<div class="${cls}" role="group" aria-label="${tx('Role for {pid}', { pid: esc(pid) })}">${ROLES.map(k => `<button class="r-${k}${cur === k ? ' on' : ''}" data-act="role-set" data-pid="${esc(pid)}" data-role="${k}" aria-pressed="${cur === k}">${ic(ROLE_IC[k])}<span>${ROLE_NAME[k]}</span></button>`).join('')}</div>`;
// Someone decanting asked to stop cutting: they step off their pallet (the
// reducer does it), so say what happens to it and offer a free cutter.
function roleAsk(t, m) {
  const a = st.roleAsk, ref = m.run[a.pid]; if (!ref) return '';
  const others = openSegs(t.pallets[ref]).filter(x => x.pid !== a.pid).length, free = others ? null : freeCutter(t, m, a.pid);
  const vars = { pid: esc(a.pid), ref: esc(ref), n: onFor(t, a.pid, ref), role: ROLE_NAME[a.role] };
  return `<div class="rl-ask" role="alert"><span>${tx('{pid} is decanting {ref} ({n} min).', vars)} ${others ? tx('Moving them to {role} steps them off {ref}; the others on it carry on.', vars) : tx('Moving them to {role} steps them off {ref}: it pauses with the time kept.', vars)}</span>` +
    `<div class="acts"><button class="btn rl-go r-${a.role}" data-act="role-go">${ic(ROLE_IC[a.role])}${tx('Move {pid} to {role}', vars)}</button>${free ? `<button class="btn rl-hand" data-act="role-hand" data-to="${esc(free.pid)}">${ic('swap')}${tx('Hand {ref} to {to}', { ref: esc(ref), to: esc(free.pid) })}</button>` : ''}<button class="btn" data-act="role-keep">${tx('Keep cutting')}</button></div></div>`;
}
// The Roles popup: everyone on the truck with Cutter, Runner and Cleaner.
function rolesPanel(t, m) {
  const team = t.team || [];
  const state = mm => { const br = onBreak(t, mm.pid), on = m.run[mm.pid], r = roleOf(mm); return br ? tx('on a break') : on ? `▶ ${esc(on)} · ${tx('{n}m', { n: onFor(t, mm.pid, on) })}` : r === 'cutter' ? tx('free') : ROLE_NAME[r]; };
  return `<div class="bdk-pal rl"><div class="bdk-pal-h">${ic('users')}<b>${tx('Crew roles')}</b><small class="cs-dim">${tx('Truck {n}', { n: esc(truckNo(t.id)) })} · ${tx('{n} on the dock', { n: team.length })}</small><button class="ibtn" data-act="roles-close" title="${tx('Close')}">${ic('x')}</button></div>` +
    `<div class="rl-rows">${team.map(mm => `<div class="rl-row"><button class="rl-who" data-act="person" data-pid="${esc(mm.pid)}" aria-label="${tx('{pid}: break and more', { pid: esc(mm.pid) })}"><b>${esc(who(mm))}</b><span class="${m.run[mm.pid] ? 'on' : ''}">${state(mm)}</span></button>${roleButtons(mm.pid, roleOf(mm), 'rl-seg')}</div>${st.roleAsk?.pid === mm.pid && !st.person ? roleAsk(t, m) : ''}`).join('')}</div>` +
    `<div class="rl-foot"><span>${tx('Tap a name, or hold it on the dock, for breaks and more.')}</span><button class="btn primary" data-act="roles-close">${tx('Done')}</button></div></div>`;
}
// One person (hold their name): role, break, step off, hand over, take off.
function personPanel(t, m, pid) {
  const mm = (t.team || []).find(x => x.pid === pid); if (!mm) return '';
  const r = roleOf(mm), br = onBreak(t, pid), on = m.run[pid], others = on ? openSegs(t.pallets[on]).filter(x => x.pid !== pid).length : 0, free = on && !others ? freeCutter(t, m, pid) : null;
  const line = br ? tx('on a break since {time}', { time: fmtHM(br.start) }) : on ? tx('decanting {ref} · {n} min', { ref: esc(on), n: onFor(t, pid, on) }) : r === 'cutter' ? tx('between pallets') : '';
  const row = (act, icon, title, note, extra = '', cls = '') => `<button class="pp-act${cls}" data-act="${act}" data-pid="${esc(pid)}"${extra}>${ic(icon)}<span><b>${title}</b>${note ? `<small>${note}</small>` : ''}</span></button>`;
  return `<div class="bdk-pal pp"><div class="bdk-pal-h"><span class="pp-av r-${r}">${ic(ROLE_IC[r])}</span><span class="pp-t"><b>${esc(who(mm))}</b><small>${ROLE_NAME[r]}${line ? ' · ' + line : ''}</small></span><button class="ibtn" data-act="person-close" title="${tx('Close')}">${ic('x')}</button></div>` +
    `<div class="bdk-pal-b"><div class="bdk-declab ic">${ic('users')}${tx('Role')}</div>${roleButtons(pid, r, 'pp-roles')}${st.roleAsk?.pid === pid ? roleAsk(t, m) : ''}</div>` +
    `<div class="pp-acts">` +
    (br ? row('break-end', 'coffee', tx('Back from the break'), on ? '' : tx('back on the crew')) : row('break-start', 'coffee', tx('Start a break'), on ? tx('{ref} pauses while they are away', { ref: esc(on) }) : '')) +
    (on ? row('pp-leave', 'pause', tx('Step off {ref}', { ref: esc(on) }), others ? tx('the others on it carry on') : tx('{ref} pauses, the time kept', { ref: esc(on) }), ` data-ref="${esc(on)}"`) : '') +
    (free ? row('pp-hand', 'swap', tx('Hand {ref} over', { ref: esc(on) }), tx('to {to}, free now', { to: esc(free.pid) }), ` data-ref="${esc(on)}" data-to="${esc(free.pid)}"`) : '') +
    row('team-drop', 'user-minus', tx('Take {pid} off the truck', { pid: esc(pid) }), on ? tx('their time on {ref} is kept', { ref: esc(on) }) : '', '', ' red') + `</div></div>`;
}
// The facilitator on the phone (DV's More and person sheets): the team with
// roles and breaks, the opening huddle, and the plan with auto-balance and
// queues. Complete decant lives in the run view.
function moreSheet(m, t) {
  const live = t.status === 'live';
  return `<div class="bdk-more">` + teamCard(t, m.run, live) +
    (live ? `<div class="card"><div class="ch"><h3>${tx('Huddle')}</h3><span class="cs-dim">${tx('hold-ups: Halt in Run')}</span></div><div class="bdk-palacts"><button class="btn" data-act="huddleplan">${ic('users')}${tx('Book the opening huddle')}</button></div></div>` : '') +
    planCard(t, ratesFor(m.dock)) + `<div class="bdk-palacts"><button class="btn" data-act="more">${tx('Close')}</button></div></div>`;
}
// The manifest on this truck: the library to pick from, or an upload.
// Replacing the one already attached asks first (every label is checked
// again against the new one).
function manPicker(m, t) {
  const idx = manifestIndex(m.dock).sort((a, b) => (a.truck ? 1 : 0) - (b.truck ? 1 : 0)), c = st.manConfirm;
  const ask = c && t.manifest ? `<div class="nt-warn mp-ask">${ic('alert')}<span>${tx('Replace manifest {old} with {new} on Truck {n}? Every label scanned on this truck is checked again against {new}.', { old: esc(t.manifest.manNo), new: esc(c.manNo || c.file), n: esc(truckNo(t.id)) })}</span><span class="mp-btns"><button class="btn primary sm" data-act="manreplace">${tx('Replace')}</button><button class="btn sm" data-act="mankeep">${tx('Keep {no}', { no: esc(t.manifest.manNo) })}</button></span></div>` : '';
  return `<div class="card bdr-manpick"><div class="ch"><h3>${t.manifest ? tx('Manifest {no} on Truck {n}', { no: esc(t.manifest.manNo), n: esc(truckNo(t.id)) }) : tx('Attach a manifest to Truck {n}', { n: esc(truckNo(t.id)) })}</h3><button class="ibtn" data-act="manpick" aria-label="${tx('Close')}">${ic('x')}</button></div>` +
    (t.manifest ? `<p class="lbl">${tx('{n} consols · {c} cartons · attached {time}.', { n: t.manifest.consols.length, c: t.manifest.consols.reduce((n, c) => n + c.cartons, 0), time: fmtHM(t.manifest.attachedAt) })}</p>` : '') + ask +
    `<div class="list">${idx.map(x => `<div class="li"><span class="loc">${esc(x.manNo)}</span><span class="nm">${tx('{n} consols · {c} cartons', { n: x.consols, c: x.totalCartons })}${x.despatch ? ' · ' + tx('despatch {d}', { d: esc(x.despatch) }) : ''}${x.truck ? ' · ' + tx('on Truck {n}', { n: esc(truckNo(x.truck)) }) : ''}</span><button class="btn sm${x.truck === t.id ? '' : ' primary'}" data-act="manattach" data-man="${esc(x.manNo)}"${x.truck === t.id ? ' disabled' : ''}>${x.truck === t.id ? tx('Attached') : t.manifest ? tx('Replace') : tx('Attach')}</button></div>`).join('') || `<div class="ohint">${tx('Nothing in the library yet.')}</div>`}</div>` +
    `<div class="bdr-manup"><label class="btn" style="cursor:pointer"><input type="file" accept=".xls,.xlsx,.csv" data-field="manfile" style="display:none">${ic('file')}${tx("Upload today's report and attach it")}</label><span class="cs-dim">${tx("The DC's Manifest Report .xls from the email. It is published to the library and attached to this truck.")}</span></div></div>`;
}
// Goal, opening huddle and decant start: small sheets in place of typed
// prompts. st.sheet = { kind, v } holds what is chosen until it is set.
const addMin = (hm, n) => { const [h, m] = (hm || '00:00').split(':').map(Number), x = (h * 60 + m + n + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
function sheetCard(t, dock) {
  const k = st.sheet?.kind; if (!k || !t) return '';
  const head = title => `<div class="card shx" data-sheet="${k}"><div class="ch"><h3>${title}</h3><button class="ibtn" data-act="sh-cancel" aria-label="${tx('Close')}">${ic('x')}</button></div>`;
  const cancel = `<button class="btn" data-act="sh-cancel">${tx('Cancel')}</button>`;
  if (k === 'goal') {
    const fc = forecast(t, Date.now(), ratesFor(dock)), v = st.sheet.v ?? (t.goalAt ? hmOf(t.goalAt) : fc.at ? addMin(hmOf(new Date(fc.at).toISOString()), (5 - new Date(fc.at).getMinutes() % 5) % 5) : '');
    return head(tx('Finish goal · Truck {n}', { n: esc(truckNo(t.id)) })) + `<p class="lbl">${tx('When the team aims to have the truck clear. The progress bar shows where they should be by now.')}</p>` +
      `<div class="shx-row"><button class="btn" data-act="sh-nudge" data-v="-15">−15</button><input type="time" class="bdr-in" data-field="sh-time" value="${esc(v)}" aria-label="${tx('Goal')}"><button class="btn" data-act="sh-nudge" data-v="15">+15</button></div>` +
      (fc.at ? `<p class="cs-dim">${tx('Forecast clear {time}', { time: fmtHM(new Date(fc.at).toISOString()) })}</p>` : '') +
      `<div class="nt-acts"><button class="btn primary" data-act="sh-goal">${ic('check')}${tx('Set goal')}</button>${t.goalAt ? `<button class="btn" data-act="sh-goal" data-clear="1">${tx('Clear goal')}</button>` : ''}${cancel}</div></div>`;
  }
  if (k === 'huddle') {
    const h = (t.halts || []).find(x => x.kind === 'huddle' && x.planned), cur = h ? Math.round((Date.parse(h.end) - Date.parse(h.start)) / 60000) : null, v = st.sheet.v ?? cur ?? 10;
    return head(tx('Opening huddle · Truck {n}', { n: esc(truckNo(t.id)) })) + `<p class="lbl">${tx('Booked from the decant start: the clock pauses for it, so pace and the goal allow for it.')}</p>` +
      `<div class="shx-row">${[5, 10, 15, 20].map(n => `<button class="chip${v === n ? ' on' : ''}" data-act="sh-mins" data-v="${n}">${tx('{n} min', { n })}</button>`).join('')}<label class="shx-own">${tx('Other')}<input class="bdr-in mono" data-field="sh-mins" inputmode="numeric" maxlength="3" value="${[5, 10, 15, 20].includes(v) ? '' : v}" placeholder="—"></label></div>` +
      `<div class="nt-acts"><button class="btn primary" data-act="sh-huddle">${ic('users')}${tx('Book {n} min', { n: v })}</button>${cur ? `<button class="btn" data-act="sh-huddle" data-clear="1">${tx('Clear the huddle')}</button>` : ''}${cancel}</div></div>`;
  }
  const v = st.sheet.v ?? (t.decantStartAt ? hmOf(t.decantStartAt) : hmOf(new Date().toISOString()));
  return head(tx('Decant start · Truck {n}', { n: esc(truckNo(t.id)) })) + `<p class="lbl">${tx('When the decant clock started: the clear time, the rate and the goal pace run from here.')}</p>` +
    `<div class="shx-row"><button class="btn" data-act="sh-nudge" data-v="-5">−5</button><input type="time" class="bdr-in" data-field="sh-time" value="${esc(v)}" aria-label="${tx('Decant start')}"><button class="btn" data-act="sh-nudge" data-v="5">+5</button></div>` +
    `<div class="nt-acts"><button class="btn primary" data-act="sh-start">${ic('check')}${tx('Set start')}</button>${t.decantStartAt ? `<button class="btn" data-act="sh-start" data-clear="1">${tx('Use the landed time')}</button>` : ''}${cancel}</div></div>`;
}
// Land a pallet, scan first (DV's land sheet): each label is checked
// against the manifest as it is scanned; matched consols fill the cartons
// (and so the minutes), several stack on one pallet, a label off the
// manifest is held on it for Add & flag. The type is chosen every time.
function codeCheck(t, raw) {
  const id9 = raw.slice(-9);
  if (!t.manifest) return { id9, kind: 'saved' };
  const c = t.manifest.consols.find(c => c.id === id9 || c.id === raw || c.cons.endsWith(raw) || c.cons.startsWith(raw));
  if (!c) return { id9, kind: 'off' };
  const on = Object.values(t.pallets || {}).find(p => p.consolIds.includes(c.id));
  return on ? { id9, c, kind: 'taken', on: on.ref } : { id9, c, kind: 'ok' };
}
// The camera first, as the dock works: a big Scan button; Type it shows
// the field (and the keyboard) only when a label will not scan. The hidden
// field and button take what the camera reads (js/scan.js presses Enter).
function scanRow(field, act, label, typing) {
  if (typing) return `<div class="bdk-scanrow"><input class="bdr-in mono" data-field="${field}" inputmode="numeric" enterkeyhint="done" placeholder="${tx('Type the label number')}" autocomplete="off">${camButton(field)}<button class="btn sm" data-act="${act}">${tx('Add')}</button></div>`;
  return `<div class="bdk-scanrow cam"><button type="button" class="btn primary bdk-cam" data-camera="${field}" data-camera-continuous title="${tx('Scan with the camera')}">${ic('camera')}${label}</button><button type="button" class="btn bdk-type" data-act="typing" data-f="${field}">${ic('keyboard')}${tx('Type it')}</button><input data-field="${field}" hidden><button data-act="${act}" hidden></button></div>`;
}
// "Land pallet 5 · A6": the truck's next pallet, and where it goes.
const landTitle = (t, ref) => tx('Land pallet {n} · {ref}', { n: pallets(t).filter(p => !p.carryover).length + 1, ref: esc(ref) });
// The type as three big buttons in their colours, the chosen one filled.
const typeButtons = (cur, act, extra = '') => `<div class="bdk-ptrow big${cur ? '' : ' ask'}"${extra}>${PTYPES.map(x => `<button class="bdr-pt t-${PT_LETTER[x[0]]}${cur === x[0] ? ' on' : ''}" data-act="${act}" data-pt="${x[0]}" aria-pressed="${cur === x[0]}">${cur === x[0] ? ic('check') : ''}${PT_ONE[x[0]]}</button>`).join('')}</div>`;
function landPanel(t, ref) {
  const L = st.land.ref === ref ? st.land : { ref, ptype: null, cartons: '', note: '', codes: [] };
  const checks = L.codes.map(raw => codeCheck(t, raw)), seen = new Set(), ok = checks.filter(k => k.kind === 'ok' && !seen.has(k.c.id) && seen.add(k.c.id));
  const rate = t.minsPerCarton ?? STD_MINS_PER_CARTON, fromLabels = ok.reduce((n, k) => n + k.c.cartons, 0), ctn = Number(L.cartons) || fromLabels, mins = L.minsManual ? L.mins : ctn ? Math.max(1, Math.round(ctn * rate)) : '';
  const lab = (icon, text) => `<div class="bdk-declab ic">${ic(icon)}${text}</div>`;
  const row = (k, i) => {
    const [cls, mark, what] = k.kind === 'ok' ? ['ok', '✓', tx('{n} ctn', { n: k.c.cartons }) + (k.c.dept ? ' · ' + esc(k.c.dept) : '')] : k.kind === 'taken' ? ['bad', '✕', tx('already on {ref}: it stays there', { ref: esc(k.on) })] : k.kind === 'off' ? ['warn', '⚠', tx('not on this manifest: held on the pallet to flag or ignore')] : ['', '·', tx('saved · matches when a manifest is attached')];
    return `<div class="bdk-vrow ${cls}"><span>${mark}</span><b class="mono">${esc(k.id9)}</b><span>${what}</span><button class="bdk-vx" data-act="l-drop" data-i="${i}" aria-label="${tx('Take {id} off this pallet', { id: esc(k.id9) })}">${ic('x')}</button></div>`;
  };
  return `<div class="bdk-pal bdk-land"><div class="bdk-pal-h">${ic('parking')}<b>${landTitle(t, ref)}</b><button class="ibtn" data-act="closepal" title="${tx('Close')}">${ic('x')}</button></div><div class="bdk-pal-b">` +
    lab('barcode', tx('Scan the labels')) + scanRow('lscan', 'lscan', tx('Scan labels'), st.typing.lscan) +
    (checks.length ? `<div class="bdk-verified">${checks.map(row).join('')}</div>` : `<p class="lbl">${t.manifest ? tx('Each consol label fills its cartons. Stack as many as are on the pallet.') : tx('No manifest yet: labels are saved and match when one is attached.')}</p>`) +
    lab('box', tx('Pallet type')) + typeButtons(L.ptype, 'ptype') +
    `<div class="bdk-fields"><label><span class="fl-h">${ic('packages')}${tx('Cartons')}</span><input class="bdr-in mono" data-field="cartons" inputmode="numeric" maxlength="3" placeholder="${fromLabels || '0'}" value="${esc(L.cartons)}"></label>` +
    `<label><span class="fl-h">${ic('clock')}${tx('Est. mins')}<small class="fl-t">${L.minsManual ? tx('by hand') : tx('auto')}</small></span><input class="bdr-in mono${L.minsManual ? '' : ' auto'}" data-field="lmins" inputmode="numeric" maxlength="4" placeholder="—" value="${esc(mins)}" data-rate="${rate}" data-from="${fromLabels}" title="${tx('Worked out from the cartons until you type a time; a new scan works it out again')}"></label>` +
    `<label><span class="fl-h">${ic('edit')}${tx('Note')}</span><input class="bdr-in" data-field="note" maxlength="120" placeholder="${tx('optional')}" value="${esc(L.note || '')}"></label></div>` +
    (fromLabels ? `<p class="cs-dim">${txn(ok.length, '{c} cartons from {n} label. Type a count only to correct it.', '{c} cartons from {n} labels. Type a count only to correct it.', { c: fromLabels })}</p>` : '') +
    `<div class="bdk-palacts"><button class="btn primary" data-act="land" data-ref="${esc(ref)}"${L.ptype ? '' : ' disabled'}>${ic('plus')}${L.ptype ? tx('Land at {ref}', { ref: esc(ref) }) : tx('Choose the type to land')}</button></div></div></div>`;
}

// ── actions ────────────────────────────────────────────────────────────
// What this device typed and then sent with an action: a redraw for
// another device's change must not bring it back (this device's own change
// can echo back a moment later).
const sent = new Map();
const spend = (n, v) => { if (!v) return; sent.set(n, v); setTimeout(() => { if (sent.get(n) === v) sent.delete(n); }, 8000); };
// After a redraw the shell has mounted a fresh #content: reach it, not the old root.
const fresh = sel => document.getElementById('content')?.querySelector(sel);
const show = sel => setTimeout(() => fresh(sel)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
// The decant starts with Take 5: until then nothing is started (rollover trucks too).
const notBegun = t => { if (begun(t)) return false; toast(tx('Take 5 first: tick the five checks and press Start decant.'), 'bad'); return true; };
async function onAct(ctx, a, root) {
  const act = a.dataset.act, m = model(ctx), t = m.t, id = t?.id;
  const field = n => { const v = root.querySelector(`[data-field="${n}"]`)?.value ?? ''; spend(n, v); return v; };
  const num = v => { const n = parseInt(String(v).replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : null; };
  const rates = ratesFor(m.dock);
  const keepLand = () => { if (!root.querySelector('[data-field="cartons"]')) return; st.land.cartons = field('cartons'); st.land.note = field('note'); if (st.land.minsManual) st.land.mins = field('lmins'); };
  try {
    if (t && await onSearchAct(ctx, t, a, root, { land: (ref, code) => { st.land = { ref, ptype: null, cartons: '', note: '', codes: [code] }; st.sel = ref; ss.open = false; st.panel = false; if (st.view === 'run') { st.keepSel = true; ctx.go('receiving'); } else ctx.rerender(); show('.bdk-land'); } })) return;
    if (act === 't5-start' && t && t.status !== 'live') return toast(tx('Start receiving first: the decant starts once the truck is on the dock.'), 'bad');
    if (t && await onPlanAct(ctx, t, a, rates)) return;
    if (act === 'pick') { st.truck = a.dataset.id; st.sel = null; st.arm = null; st.manPick = false; st.moving = null; st.sheet = null; st.finishing = false; st.trucks = false; return ctx.rerender(); }
    if (act === 'manpick') { st.manPick = !st.manPick; st.manConfirm = null; if (st.manPick) { ss.info = false; ss.open = false; } ctx.rerender(); return st.manPick && show('.bdr-manpick'); }
    if (act === 'manattach' || act === 'manreplace') {
      const no = act === 'manreplace' ? st.manConfirm?.manNo : a.dataset.man, file = act === 'manreplace' ? st.manConfirm?.f : null;
      if (act === 'manattach' && t.manifest && t.manifest.manNo !== no) { st.manConfirm = { manNo: no }; ctx.rerender(); return show('.mp-ask'); }
      st.manConfirm = null; a.disabled = true;
      if (file) return uploadManifest(ctx, file);
      await attachManifest(ctx, id, no); st.manPick = false; toast(tx('{no} attached to Truck {n}', { no, n: truckNo(id) })); return;
    }
    if (act === 'mankeep') { st.manConfirm = null; return ctx.rerender(); }
    // The phone's truck menu and panel.
    if (act === 'trucks') { st.trucks = !st.trucks; st.sel = null; return ctx.rerender(); }
    if (act === 'panel') { st.panel = !st.panel; st.sel = null; st.trucks = false; st.halting = false; return ctx.rerender(); }
    // New truck (DV's sheet): the planned slot with its manifest, or an
    // unplanned truck; landed and decant start times; held pallets kept or
    // let go. One truck at a time: an open truck is finalised by the new one
    // and its unfinished pallets come with it on their bays.
    if (act === 'newtruck' || act === 'phase-newtruck') {
      const plan = ctx.store.get('plan'), n = a.dataset.n ? Number(a.dataset.n) : null;
      st.nt = n ? { ...ntDefaults(m.dock, plan), slot: n, start: plan?.days?.[todayKey()]?.slots?.[n]?.eta || '' } : st.nt ? null : ntDefaults(m.dock, plan); st.finishing = false; st.finalising = false; st.trucks = false; ctx.rerender(); return st.nt && show('.nt');
    }
    if (act === 'nt-cancel') { st.nt = null; return ctx.rerender(); }
    if (act === 'nt-slot' || act === 'nt-keep') {
      st.nt.landed = field('nt-landed') || st.nt.landed;
      if (act === 'nt-keep') { st.nt.start = field('nt-start'); st.nt.keep = a.dataset.v === '1'; }
      else { const n = a.dataset.n === 'u' ? 'u' : Number(a.dataset.n); st.nt.slot = n; st.nt.start = n === 'u' ? field('nt-start') : ctx.store.get('plan')?.days?.[todayKey()]?.slots?.[n]?.eta || field('nt-start'); }
      return ctx.rerender();
    }
    if (act === 'nt-go') {
      st.nt.landed = field('nt-landed'); st.nt.start = field('nt-start');
      const { id: nid, payload } = ntPayload(m.dock, ctx.store.get('plan'), st.nt), cur = t || m.open[0];
      if (cur) {
        if (unfinished(cur).some(p => p.status === 'active')) return toast(tx('Pause or finish what is being decanted on Truck {n} first', { n: truckNo(cur.id) }), 'bad');
        payload.carryFrom = cur.id;
      } else if (m.dock.rollover && !st.nt.keep) payload.takeRollover = false;
      a.disabled = true;
      await dispatch(ctx, 'truck.create', { truck: nid }, payload); await dispatch(ctx, 'truck.setLive', { truck: nid }, {});
      attachPlanned(ctx, nid);
      st.truck = nid; st.sel = null; st.nt = null; st.panel = false; if (ctx.isMobile && st.view === 'run') ctx.go('receiving');
      toast(payload.carryFrom ? tx('Truck {a} finalised · Truck {b} is receiving', { a: truckNo(payload.carryFrom), b: truckNo(nid) }) : tx('Truck {n} is receiving', { n: truckNo(nid) })); return;
    }
    if (act === 'phase-golive') { await dispatch(ctx, 'truck.setLive', { truck: id }, {}); attachPlanned(ctx, id); toast(tx('Truck {n} is receiving', { n: truckNo(id) })); return; }
    // Finish receiving: the layout against the manifest, then Confirm.
    if (act === 'phase-finish') { st.finishing = !st.finishing; st.nt = null; ctx.rerender(); return st.finishing && show('.fs'); }
    if (act === 'fs-cancel') { st.finishing = false; return ctx.rerender(); }
    if (act === 'fs-go') { await dispatch(ctx, 'receiving.confirm', { truck: id }, { confirmed: true }); st.finishing = false; toast(begun(t) ? tx('Layout confirmed · Truck {n} received', { n: truckNo(id) }) : tx('Layout confirmed · Truck {n} received: Take 5, then start', { n: truckNo(id) })); return; }
    if (act === 'phase-begin') { st.sel = null; st.panel = false; if (ctx.isMobile) return st.view === 'run' ? ctx.rerender() : ctx.go('decant'); ctx.rerender(); return show('.t5'); }
    if (act === 'golive') { await dispatch(ctx, 'truck.setLive', { truck: id }, {}); return; }
    // Goal, opening huddle and decant start open their sheets.
    if (act === 'goal' || act === 'huddleplan' || act === 'setstart') { const kind = act === 'goal' ? 'goal' : act === 'huddleplan' ? 'huddle' : 'start'; st.sheet = st.sheet?.kind === kind ? null : { kind }; if (st.sheet && ctx.isMobile) st.more = false; ctx.rerender(); return st.sheet && show('.shx'); }
    if (act === 'sh-cancel') { st.sheet = null; return ctx.rerender(); }
    if (act === 'sh-nudge') { st.sheet.v = addMin(field('sh-time') || hmOf(new Date().toISOString()), Number(a.dataset.v)); return ctx.rerender(); }
    if (act === 'sh-mins') { st.sheet.v = Number(a.dataset.v); return ctx.rerender(); }
    if (act === 'sh-goal') {
      let goal = null;
      if (!a.dataset.clear) { const v = field('sh-time'), mm = /^(\d{1,2}):(\d{2})$/.exec(v); if (!mm) return toast(tx('Enter a time like 14:30'), 'bad'); const d = new Date(); d.setHours(+mm[1], +mm[2], 0, 0); if (d.getTime() < Date.now() - 6 * 3600000) d.setDate(d.getDate() + 1); goal = d.toISOString(); }
      await dispatch(ctx, 'truck.setGoal', { truck: id }, { goal }); st.sheet = null; toast(goal ? tx('Goal {time}', { time: fmtHM(goal) }) : tx('Goal cleared')); return;
    }
    if (act === 'sh-huddle') {
      const own = num(field('sh-mins')), mins = a.dataset.clear ? 0 : own ?? st.sheet.v ?? 10;
      if (!(mins >= 0 && mins <= 120)) return toast(tx('Minutes from 0 to 120'), 'bad');
      await dispatch(ctx, 'huddle.plan', { truck: id }, { mins }); st.sheet = null; toast(mins ? tx('Opening huddle booked · {n} min', { n: mins }) : tx('Opening huddle cleared')); return;
    }
    if (act === 'sh-start') {
      let at = null;
      if (!a.dataset.clear) { const mm = /^(\d{1,2}):(\d{2})$/.exec(field('sh-time')); if (!mm) return toast(tx('Enter a time like 06:30'), 'bad'); const d = new Date(t.landedAt || Date.now()); d.setHours(+mm[1], +mm[2], 0, 0); at = d.toISOString(); }
      await dispatch(ctx, 'truck.setStart', { truck: id }, { at }); st.sheet = null; toast(at ? tx('Decant start {time}', { time: fmtHM(at) }) : tx('Decant start follows the landed time')); return;
    }
    if (act === 'more') { st.more = !st.more; if (!st.more) st.finalising = false; return ctx.rerender(); }
    // Crew roles: the Roles popup, one person's popup, and a role change
    // (asked first when it takes someone off the pallet they are on).
    if (act === 'roles') { st.roles = !st.roles; st.roleAsk = null; st.person = null; st.arm = null; return ctx.rerender(); }
    if (act === 'roles-close') { st.roles = false; st.roleAsk = null; st.person = null; return ctx.rerender(); }
    if (act === 'person') { st.person = a.dataset.pid; st.roleAsk = null; st.arm = null; return ctx.rerender(); }
    if (act === 'person-close') { st.person = null; st.roleAsk = null; return ctx.rerender(); }
    if (act === 'role-keep') { st.roleAsk = null; return ctx.rerender(); }
    if (act === 'role-set' || act === 'role-go' || act === 'role-hand') {
      const pid = act === 'role-set' ? a.dataset.pid : st.roleAsk?.pid, role = act === 'role-set' ? a.dataset.role : st.roleAsk?.role, mm = (t.team || []).find(x => x.pid === pid);
      if (!mm || !ROLES.includes(role) || roleOf(mm) === role) { st.roleAsk = null; return ctx.rerender(); }
      const was = m.run[pid];
      if (act === 'role-set' && was && role !== 'cutter') { st.roleAsk = { pid, role }; return ctx.rerender(); }
      if (act === 'role-hand') await dispatch(ctx, 'pallet.handover', { truck: id, bay: was }, { toPid: a.dataset.to });
      await dispatch(ctx, 'truck.team.set', { truck: id }, { team: t.team.map(x => ({ ...x, role: x.pid === pid ? role : roleOf(x) })) });
      st.roleAsk = null;
      toast(act === 'role-hand' ? tx('{pid} is {role} · {to} took over {ref}', { pid, role: ROLE_AS[role], to: a.dataset.to, ref: was }) : was && role !== 'cutter' ? tx('{pid} is {role}, off {ref}', { pid, role: ROLE_AS[role], ref: was }) : tx('{pid} is {role}', { pid, role: ROLE_AS[role] }));
      return;
    }
    if (act === 'pp-leave') { const ref = a.dataset.ref; await dispatch(ctx, 'pallet.leave', { truck: id, bay: ref }, { pid: a.dataset.pid }); st.person = null; toast(tx('{pid} stepped off {ref}', { pid: a.dataset.pid, ref })); return; }
    if (act === 'pp-hand') { const ref = a.dataset.ref, to = a.dataset.to; await dispatch(ctx, 'pallet.handover', { truck: id, bay: ref }, { toPid: to }); st.person = null; toast(tx('{ref} handed to {pid}', { ref, pid: to })); return; }
    if (act === 'finalise' || act === 'phase-finalise') { st.finalising = true; st.more = false; st.nt = null; st.finishing = false; ctx.rerender(); return show('.bdr-fin'); }
    if (act === 'fin-cancel') { st.finalising = false; return ctx.rerender(); }
    if (act === 'fin-keep' || act === 'fin-clear') {
      const keep = act === 'fin-keep', left = unfinished(t);
      await dispatch(ctx, 'truck.finalise', { truck: id }, keep && left.length ? { rollover: true } : {}); st.truck = null; st.sel = null; st.finalising = false; st.more = false;
      toast(!left.length ? tx('Truck {t} finalised', { t: truckNo(id) }) : keep ? txn(left.length, 'Truck {t} finalised · {n} pallet held for the next truck', 'Truck {t} finalised · {n} pallets held for the next truck', { t: truckNo(id) }) : txn(left.length, 'Truck {t} finalised · dock cleared, {n} pallet not decanted', 'Truck {t} finalised · dock cleared, {n} pallets not decanted', { t: truckNo(id) })); return;
    }
    if (act === 'halt') { st.halting = !st.halting; st.holdKind = null; return ctx.rerender(); }
    if (act === 'holdkind') { st.holdKind = st.holdKind === a.dataset.kind ? null : a.dataset.kind; return ctx.rerender(); }
    if (act === 'haltgo') {
      const kind = a.dataset.kind || 'halt', note = field('haltnote').trim();
      await dispatch(ctx, 'halt.start', { truck: id }, { kind, reason: a.dataset.reason, ...(note ? { note } : {}) });
      st.halting = false; st.holdKind = null; toast(tx('Decant clock stopped · {hold}', { hold: holdName({ kind, reason: a.dataset.reason }) })); return;
    }
    if (act === 'haltend') { await dispatch(ctx, 'halt.end', { truck: id }, {}); toast(tx('Decant running')); return; }
    if (act === 'received') { await dispatch(ctx, 'receiving.confirm', { truck: id }, { confirmed: !t.receivingConfirmed }); toast(t.receivingConfirmed ? tx('Hand-over undone') : tx('Handed over: the layout is set')); return; }
    if (act === 'break-start' || act === 'break-end') { const pid = a.dataset.pid, was = m.run[pid]; if (a.closest('.pp')) st.person = null; await dispatch(ctx, act === 'break-start' ? 'break.start' : 'break.end', { truck: id }, { pid }); toast(act === 'break-start' ? (was ? tx('{pid} is on a break, off {ref}: their clock stops', { pid, ref: was }) : tx('{pid} is on a break: their clock stops', { pid })) : tx('{pid} is back', { pid })); return; }
    if (act === 'audit') return canAudit(ctx) ? printAudit(t, m.dock) : toast(tx('The receiving audit prints from a PC, for managers.'), 'bad');
    if (act === 'ptype') { keepLand(); st.land.ref = (ctx.isMobile ? st.sel : field('ref')) || st.land.ref; st.land.ptype = st.land.ptype === a.dataset.pt ? null : a.dataset.pt; return ctx.rerender(); }
    // The land sheet's scans: checked against the manifest on the sheet, sent with Land.
    if (act === 'lscan') {
      const raw = field('lscan').replace(/\D/g, ''); if (raw.length < 9) return toast(tx('A pallet label has at least 9 digits'), 'bad');
      keepLand(); if (st.land.ref !== st.sel) st.land = { ref: st.sel, ptype: null, cartons: '', note: '', codes: [] };
      if (st.land.codes.some(x => x.slice(-9) === raw.slice(-9))) { toast(tx('{id} is already on this pallet', { id: raw.slice(-9) })); return ctx.rerender(); }
      st.land.codes.push(raw); st.land.minsManual = false; st.land.mins = ''; const k = codeCheck(t, raw);
      if (k.kind === 'taken') toast(tx('{id} is already on {ref}', { id: k.id9, ref: k.on }), 'bad'); else if (k.kind === 'off') toast(tx('{id} is not on this manifest. Old label from a reused tub?', { id: k.id9 }), 'bad');
      return ctx.rerender();
    }
    if (act === 'l-drop') { keepLand(); st.land.codes.splice(+a.dataset.i, 1); st.land.minsManual = false; st.land.mins = ''; return ctx.rerender(); }
    if (act === 'move-cancel') { st.moving = null; return ctx.rerender(); }
    if (act === 'team-add') { const v = field('team').trim(); if (!v) return; const pid = dnumId(v); if (!pid) return toast(tx('Enter a D-number, like D4. Names are not kept.'), 'bad'); if ((t.team || []).some(x => x.pid === pid)) return toast(tx('{pid} is already on the truck', { pid })); await dispatch(ctx, 'truck.team.set', { truck: id }, { team: [...(t.team || []), { pid }] }); return; }
    if (act === 'team-drop') { if (a.closest('.pp') && !m.run[a.dataset.pid] && !confirm(tx('Take {pid} off the truck?', { pid: a.dataset.pid }))) return; if (m.run[a.dataset.pid] && !confirm(tx('{pid} is on {ref}. Take them off the truck? Their time on it is kept.', { pid: a.dataset.pid, ref: m.run[a.dataset.pid] }))) return; if (a.closest('.pp')) st.person = null; await dispatch(ctx, 'truck.team.set', { truck: id }, { team: (t.team || []).filter(x => x.pid !== a.dataset.pid) }); return; }
    if (act === 'cell') {
      const ref = a.dataset.ref, p = t.pallets[ref];
      // Move: the pallet goes to the empty square tapped.
      if (st.moving) {
        const from = st.moving; if (ref === from) { st.moving = null; return ctx.rerender(); }
        if (p) return toast(tx('{ref} holds a pallet: tap an empty square', { ref }), 'bad');
        st.moving = null; await dispatch(ctx, 'pallet.move', { truck: id, bay: from }, { to: ref }); st.sel = ref; toast(tx('{ref} moved to {to}', { ref: from, to: ref })); return;
      }
      if (!ctx.isMobile) { if (p) { st.sel = st.sel === ref ? null : ref; } else { st.land.ref = ref; st.land.cartons = field('cartons'); st.sel = null; } ctx.rerender(); if (!p) setTimeout(() => fresh('[data-field="cartons"]')?.focus(), 0); return; }
      if (st.view === 'run' && st.arm && p?.excluded) return toast(tx('{ref} is not in this session: include it first', { ref }), 'bad');
      if (st.view === 'run' && st.arm && p && (startable(p) || p.status === 'active')) {
        if (notBegun(t)) return;
        const pid = st.arm; st.arm = null;
        if (p.status === 'active') { await dispatch(ctx, 'pallet.join', { truck: id, bay: ref }, { pid }); toast(tx('{pid} joined {ref}', { pid, ref }), '', { label: tx('Undo'), run: () => dispatch(ctx, 'pallet.unstart', { truck: id, bay: ref }, {}).catch(e => toast(e.message, 'bad')) }); return; }
        if (p.status !== 'paused' && !guard(t, pid, ref, rates, true)) return;
        await dispatch(ctx, p.status === 'paused' ? 'pallet.resume' : 'pallet.start', { truck: id, bay: ref }, { pid });
        toast(tx('{pid} on {ref}', { pid, ref }), '', { label: tx('Undo'), run: () => dispatch(ctx, 'pallet.unstart', { truck: id, bay: ref }, {}).catch(e => toast(e.message, 'bad')) }); return;
      }
      if (!p && t.status !== 'live') return toast(tx('Land the first pallet after Start receiving, or tap New truck'), 'bad');
      if (!p && st.land.ref !== ref) st.land = { ref, ptype: null, cartons: '', note: '', codes: [] };
      st.panel = false; st.trucks = false;
      st.sel = st.sel === ref ? null : ref; st.typing = {}; return ctx.rerender();
    }
    if (act === 'closepal') { st.sel = null; st.moving = null; st.typing = {}; return ctx.rerender(); }
    // Type it: the field appears, and only now the keyboard.
    if (act === 'typing') { keepLand(); st.typing[a.dataset.f] = true; ctx.rerender(); return setTimeout(() => fresh(`[data-field="${a.dataset.f}"]`)?.focus(), 0); }
    if (act === 'land') {
      const ref = (a.dataset.ref || field('ref') || st.land.ref).trim().toUpperCase();
      if (!/^[A-Z]\d{1,2}$/.test(ref)) return toast(tx('Pick a bay like A1, or click an empty cell'), 'bad');
      if (!st.land.ptype) return toast(tx('Choose the pallet type first'), 'bad');
      const typed = num(field('cartons')), note = field('note'), codes = st.land.ref === ref ? st.land.codes.slice() : [], mins = st.land.minsManual ? num(field('lmins')) : null;
      const ok = codes.filter(c => codeCheck(t, c).kind === 'ok').length, B = { truck: id, bay: ref };
      // Labels fill the cartons: land with none, then each scan adds its consol's.
      await dispatch(ctx, 'pallet.land', B, { ptype: st.land.ptype, cartons: ok ? null : typed, note, ...(mins ? { expectedMins: mins } : {}) });
      st.land = { ref: '', ptype: null, cartons: '', note: '', codes: [] }; st.sel = null; st.typing = {};
      const held = [], taken = []; let was = sightOf(undefined);
      for (const code of codes) {
        try { await dispatch(ctx, 'pallet.scan', B, { code }); }
        catch (e) { if (e.code === 'not_on_manifest') held.push(code.slice(-9)); else if (e.code === 'consol_taken') taken.push(code.slice(-9)); else throw e; }
      }
      if (held.length) await dispatch(ctx, 'pallet.update', B, { held });
      const now = model(ctx).t?.pallets?.[ref];
      if (ok && typed !== null && now && now.cartons !== typed) await dispatch(ctx, 'pallet.update', B, { cartons: typed });
      // Back to the dock; Open brings the pallet up (labels held off the manifest wait there).
      const open = { label: tx('Open'), run: () => { st.sel = ref; ctx.rerender(); } };
      if (taken.length) toast(txn(taken.length, '{ids} is already on another pallet: left there.', '{ids} are already on other pallets: left there.', { ids: taken.join(', ') }), 'bad', open);
      else if (held.length) toast(txn(held.length, '{n} label is not on the manifest: open {ref} to flag or ignore it.', '{n} labels are not on the manifest: open {ref} to flag or ignore them.', { ref }), 'bad', open);
      else if (!sightToast(ctx, ref, was)) toast(codes.length ? txn(codes.length, 'Pallet landed at {ref} · {n} label', 'Pallet landed at {ref} · {n} labels', { ref }) : tx('Pallet landed at {ref}', { ref }), '', open);
      if (!ctx.isMobile) return; return ctx.rerender();
    }
    if (act === 'arm') { st.arm = st.arm === a.dataset.pid ? null : a.dataset.pid; return ctx.rerender(); }
    if (act === 'pal-pt') { await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { ptype: a.dataset.pt }); return; }
    if (act === 'pal-save') { const exp = root.querySelector('[data-field="pexp"]'), manual = exp && !exp.classList.contains('auto') || (exp && exp.value && Number(exp.value) !== t.pallets[st.sel].expectedMins); await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { cartons: num(field('pcartons')), note: field('pnote'), expectedMins: manual ? num(field('pexp')) : null }); toast(tx('Pallet updated')); return; }
    if (act === 'pal-out' || act === 'pal-in') {
      const ref = st.sel, out = act === 'pal-out';
      // Off every queue first, as DV did, so the plan never deals it out.
      if (out && Object.values(t.plan?.queues || {}).some(r => r.includes(ref))) { const q = {}; for (const [pid, refs] of Object.entries(t.plan.queues)) q[pid] = refs.filter(r => r !== ref); await dispatch(ctx, 'plan.queues', { truck: id }, { queues: q, basis: t.plan.basis || 'x2' }); }
      await dispatch(ctx, 'pallet.update', { truck: id, bay: ref }, { excluded: out });
      toast(out ? tx('{ref} skipped: not counted this session', { ref }) : tx('{ref} back in the session', { ref })); return;
    }
    if (act === 'unscan') { const ref = st.sel; await dispatch(ctx, 'pallet.unscan', { truck: id, bay: ref }, { id: a.dataset.id }); toast(tx('{id} taken off {ref}', { id: a.dataset.id, ref })); return; }
    if (act === 'pal-remove') { if (!confirm(tx('Remove pallet {ref}?', { ref: st.sel }))) return; await dispatch(ctx, 'pallet.remove', { truck: id, bay: st.sel }, {}); st.sel = null; toast(tx('Pallet removed')); return; }
    if (act === 'dec') {
      const kind = a.dataset.dec, p = t.pallets[st.sel];
      // Undo, one step deep as DV's: each action offers its opposite.
      const B = { truck: id, bay: st.sel }, ref = st.sel, undo = (type, payload = {}) => ({ label: tx('Undo'), run: () => dispatch(ctx, type, B, payload).catch(e => toast(e.message, 'bad')) }), undoStart = undo('pallet.unstart');
      const onNow = openSegs(p).map(x => x.pid);
      if ((kind === 'start' || kind === 'resume' || kind === 'join') && notBegun(t)) return;
      if (kind === 'start' || kind === 'resume') { const pid = field('pid') || p.assignedTo; if (!pid) return toast(tx('Pick who is decanting first'), 'bad'); if (kind === 'start' && !guard(t, pid, ref, rates, true)) return; await dispatch(ctx, kind === 'start' ? 'pallet.start' : 'pallet.resume', B, { pid }); toast(tx('{pid} on {ref}', { pid, ref }), '', kind === 'start' ? undoStart : undo('pallet.pause')); return; }
      if (kind === 'join') { const pid = field('pid'); if (!pid) return toast(tx('Pick who joins'), 'bad'); await dispatch(ctx, 'pallet.join', B, { pid }); toast(tx('{pid} joined {ref}', { pid, ref }), '', undoStart); return; }
      if (kind === 'handover') { const pid = field('pid'); if (!pid) return toast(tx('Pick who takes it'), 'bad'); await dispatch(ctx, 'pallet.handover', B, { toPid: pid }); toast(tx('{ref} handed to {pid}', { ref, pid }), '', onNow.length === 1 ? undo('pallet.handover', { toPid: onNow[0] }) : null); return; }
      if (kind === 'leave') { await dispatch(ctx, 'pallet.leave', B, { pid: a.dataset.pid }); toast(tx('{pid} stepped off {ref}', { pid: a.dataset.pid, ref })); return; }
      if (kind === 'unstart') { await dispatch(ctx, 'pallet.unstart', B, {}); toast(tx('Last start undone')); return; }
      if (kind === 'pause') { await dispatch(ctx, 'pallet.pause', B, {}); toast(tx('{ref} paused', { ref }), '', onNow.length ? undo('pallet.resume', { pid: onNow[0] }) : null); return; }
      if (kind === 'done') {
        await dispatch(ctx, 'pallet.done', B, {}); if (ctx.isMobile) st.sel = null;
        const nt = model(ctx).t, q = nt?.pallets[ref];
        // The last one: the truck is cleared, so the next step is to close it.
        if (nt && truckPhase(nt) === 'cleared') { toast(tx('{ref} decanted · every pallet is done: close the truck', { ref }), '', { label: tx('Close the truck'), run: () => { st.finalising = true; ctx.rerender(); show('.bdr-fin'); } }); return; }
        toast(q?.suspect ? tx('{ref} done very fast: check its times', { ref }) : tx('{ref} decanted', { ref }), q?.suspect ? 'bad' : '', { label: tx('Undo'), run: () => dispatch(ctx, 'pallet.reopen', B, {}).catch(e => toast(e.message, 'bad')) }); return;
      }
      if (kind === 'reopen') { await dispatch(ctx, 'pallet.reopen', B, {}); toast(tx('{ref} reopened', { ref }), '', undo('pallet.done')); return; }
      if (kind === 'quick') { await dispatch(ctx, 'pallet.update', B, { suspectOk: true }); toast(tx('{ref} confirmed: its time counts', { ref })); return; }
      if (kind === 'move') { st.moving = ref; ctx.rerender(); toast(tx('Tap an empty square for {ref}', { ref })); return show('.bdk-grid'); }
      if (kind === 'fix') { st.fix = ref; return ctx.rerender(); }
      if (kind === 'fixcancel') { st.fix = null; return ctx.rerender(); }
      if (kind === 'fixsave') {
        const at = (iso, hm) => { if (!hm) return null; const [h, mi] = hm.split(':').map(Number); const d = new Date(iso || Date.now()); d.setHours(h, mi, 0, 0); return d.toISOString(); };
        const segments = p.segments.map((x, i) => {
          const sIn = root.querySelector(`[data-fix="start"][data-i="${i}"]`)?.value, eIn = root.querySelector(`[data-fix="end"][data-i="${i}"]`)?.value;
          const start = at(x.start, sIn) || x.start, end = eIn ? at(x.end || x.start, eIn) : x.end;
          return { pid: x.pid, start, end, ...(x.bf || (sIn && sIn !== hmOf(x.start)) ? { bf: true } : {}) };
        });
        const dIn = root.querySelector('[data-fix="done"]')?.value;
        await dispatch(ctx, 'pallet.editTimes', B, { segments, ...(p.status === 'done' && dIn ? { doneAt: at(p.doneAt, dIn) } : {}) });
        st.fix = null; const q = model(ctx).t?.pallets[ref]; toast(q?.suspect ? tx('Times saved: still very fast for its size') : tx('Times saved')); return;
      }
    }
    if (act === 'pscan') {
      const raw = field('pscan').replace(/\D/g, ''); if (raw.length < 9) return toast(tx('A pallet label has at least 9 digits'), 'bad');
      const id9 = raw.slice(-9);
      try { const was = sightOf(t.pallets[st.sel]); await dispatch(ctx, 'pallet.scan', { truck: id, bay: st.sel }, { code: raw }); sightToast(ctx, st.sel, was) || toast(tx('{id} on {ref}', { id: id9, ref: st.sel })); }
      catch (e) { if (e.code === 'not_on_manifest') { const p = t.pallets[st.sel]; if (!(p.held || []).includes(id9)) await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { held: [...(p.held || []), id9] }); toast(tx('{id} is not on this manifest. Old label from a reused tub?', { id: id9 }), 'bad'); } else throw e; }
      return;
    }
    if (act === 'pend-add' || act === 'pend-drop') {
      const p = t.pallets[st.sel], x = a.dataset.id, held = (p.held || []).filter(y => y !== x), was = sightOf(p);
      await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, act === 'pend-add' ? { scanIds: [...p.scanIds, x], held } : { held });
      if (act === 'pend-add') sightToast(ctx, st.sel, was) || toast(tx('{id} flagged in the receiving audit', { id: x })); else toast(tx('{id} ignored', { id: x })); return;
    }
    // ▶ NEXT on a crew chip: their next pallet from the plan, started now.
    if (act === 'next-go') {
      if (notBegun(t)) return;
      const pid = a.dataset.pid, ref = a.dataset.ref, p = t.pallets[ref]; if (!p || !startable(p)) return toast(tx('{ref} cannot start now', { ref }), 'bad');
      if (p.status !== 'paused' && !guard(t, pid, ref, rates, true)) return;
      await dispatch(ctx, p.status === 'paused' ? 'pallet.resume' : 'pallet.start', { truck: id, bay: ref }, { pid });
      toast(tx('{pid} on {ref}', { pid, ref }), '', { label: tx('Undo'), run: () => dispatch(ctx, 'pallet.unstart', { truck: id, bay: ref }, {}).catch(e => toast(e.message, 'bad')) }); return;
    }
    if (act === 'll-open' || act === 'll-close') { st.linking = act === 'll-open'; return ctx.rerender(); }
    if (act === 'll-apply') { await applyLinks(ctx, t, ratesFor(ctx.store.get('dock'))); st.linking = false; return ctx.rerender(); }
  } catch (e) { toast(e.message, 'bad'); }
}

async function uploadManifest(ctx, f) {
  const t = model(ctx).t; if (!t) return;
  try { const r = await previewManifest(ctx, f, { attachTo: t.id }); if (!r) return; st.manPick = false; ctx.rerender(); toast(tx('Manifest {no} attached · {n} consols, {c} cartons', { no: r.manNo, n: r.consols, c: r.totalCartons })); }
  catch (err) { toast(tx('Could not use {file}: {error}', { file: f.name, error: err.message }), 'bad'); }
}
// A truck started from a planner slot names the report the slot staged; this
// device puts it on the truck from the library (once per truck per session;
// a failure leaves the Manifest button on Receiving, phone and PC).
const attaching = new Set();
function attachPlanned(ctx, id) {
  const t = ctx.store.get('dock').trucks?.[id];
  if (!t?.plannedManifest || t.manifest || t.status === 'closed' || attaching.has(id)) return;
  attaching.add(id);
  attachManifest(ctx, id, t.plannedManifest).then(() => toast(tx('Manifest {no} attached to Truck {n}', { no: t.plannedManifest, n: truckNo(id) })))
    .catch(e => toast(tx('Could not attach the planned manifest {no}: {error}. Attach it with the Manifest button on Receiving.', { no: t.plannedManifest, error: e.message }), 'bad'));
}

export default {
  id: 'receiving', title: tx('Receiving'), icon: 'm-receiving', area: 'backdock',
  desktop(ctx) { return desktop(ctx); },
  mobile(ctx) { return mobile(ctx, 'receive'); },
  mount(ctx, root) { return mount(ctx, root); },
};
// The phone's Decant tab: the same truck, run (a wider screen opens Receiving).
export const decant = {
  id: 'decant', title: tx('Decant'), icon: 'box', area: 'backdock', desktopView: 'receiving',
  desktop(ctx) { return desktop(ctx); },
  mobile(ctx) { return mobile(ctx, 'run'); },
  mount(ctx, root) { return mount(ctx, root); },
};
// Both tabs (and the PC) mount the same way.
function mount(ctx, root) {
    for (const id of Object.keys(ctx.store.get('dock').trucks || {})) attachPlanned(ctx, id);
    // From search: the truck and the pallet a consolidation is on.
    // From Back dock home: Land a pallet, Run the decant or Team open their part.
    if (ctx.arg?.mode && ctx.arg !== usedArg) { usedArg = ctx.arg; st.more = ctx.arg.mode === 'team'; st.sel = null; st.arm = null; st.panel = false; setTimeout(() => ctx.rerender(), 0); }
    if (ctx.arg?.truck && ctx.arg !== usedArg && ctx.store.get('dock').trucks?.[ctx.arg.truck]) { usedArg = ctx.arg; st.truck = ctx.arg.truck; st.sel = ctx.arg.bay && ctx.store.get('dock').trucks[ctx.arg.truck].pallets?.[ctx.arg.bay] ? ctx.arg.bay : null; setTimeout(() => ctx.rerender(), 0); }
    // Hold a name on the crew strip (half a second) for that person's popup.
    // The click that ends a hold is swallowed, so a held cutter is not armed
    // and the popup is not closed by its own scrim.
    let hold = null, held = false, hx = 0, hy = 0;
    const drop = () => { clearTimeout(hold); hold = null; };
    root.addEventListener('pointerdown', e => {
      held = false; const c = e.target.closest('[data-hold]'); if (!c) return;
      hx = e.clientX; hy = e.clientY; drop();
      hold = setTimeout(() => { hold = null; held = true; haptic('select'); st.person = c.dataset.hold; st.roleAsk = null; st.arm = null; ctx.rerender(); }, 500);
    });
    root.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hx, e.clientY - hy) > 10) drop(); });
    root.addEventListener('pointerup', drop); root.addEventListener('pointercancel', drop);
    root.addEventListener('contextmenu', e => { if (e.target.closest('[data-hold]')) e.preventDefault(); });
    root.addEventListener('click', e => { if (held) { held = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    root.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a) onAct(ctx, a, root); });
    root.addEventListener('input', e => onSearchInput(ctx, e, root));
    root.addEventListener('input', e => {
      const f = e.target.dataset?.field, box = e.target.closest('.bdk-land'); if (!box) return;
      if (f === 'lmins') { st.land.minsManual = e.target.value.trim() !== ''; st.land.mins = e.target.value; e.target.classList.toggle('auto', !st.land.minsManual); const tag = box.querySelector('.fl-t'); if (tag) tag.textContent = st.land.minsManual ? tx('by hand') : tx('auto'); return; }
      if (f === 'cartons' && !st.land.minsManual) { const m = box.querySelector('[data-field="lmins"]'); if (!m) return; const c = Number(e.target.value) || Number(m.dataset.from) || 0; m.value = c ? Math.max(1, Math.round(c * Number(m.dataset.rate))) : ''; }
    });
    verifyContents(ctx, root);
    root.addEventListener('change', e => { if (e.target.dataset.ll != null) linkPick(e.target.dataset.ll, e.target.value); });
    root.addEventListener('change', async e => {
      if (!e.target.matches('[data-field="manfile"]')) return;
      const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
      const t = model(ctx).t; if (!t) return;
      if (t.manifest) { st.manConfirm = { file: f.name, f }; ctx.rerender(); return show('.mp-ask'); }
      uploadManifest(ctx, f);
    });
    root.addEventListener('change', async e => {
      const t = model(ctx).t; if (!t) return;
      try { await onPlanChange(ctx, t, e.target, ratesFor(ctx.store.get('dock')), () => ctx.rerender()); } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    root.addEventListener('change', async e => {
      const sel = e.target.closest('[data-act-change="role"]'); if (!sel) return;
      const t = model(ctx).t; if (!t) return;
      try { const was = running(t)[sel.dataset.pid]; await dispatch(ctx, 'truck.team.set', { truck: t.id }, { team: t.team.map(m => ({ ...m, role: m.pid === sel.dataset.pid ? sel.value : m.role || 'cutter' })) }); toast(was && sel.value !== 'cutter' ? tx('{pid} is {role}, off {ref}', { pid: sel.dataset.pid, role: ROLE_AS[sel.value] || sel.value, ref: was }) : tx('{pid} is {role}', { pid: sel.dataset.pid, role: ROLE_AS[sel.value] || sel.value })); }
      catch (err) { toast(err.message, 'bad'); }
    });
    // The live clocks: worked time on each running pallet, every second,
    // without re-rendering the board.
    const tick = () => {
      const t = model(ctx).t; if (!t) return; const now = Date.now();
      for (const el of root.querySelectorAll('[data-tick]')) {
        const p = t.pallets[el.dataset.tick]; if (!p) continue;
        const w = workedMin(t, p, p.status === 'done' ? Date.parse(p.doneAt) || now : now) * 60000, pc = pace(t, p, now);
        el.textContent = el.dataset.tickShort ? fmtMins(w / 60000) : tx('{time} worked', { time: fmtClock(w) }) + (p.expectedMins ? ' · ' + tx('est {n} min', { n: p.expectedMins }) : '') + (pc === 'over' ? ' · ' + tx('over') : '');
        el.classList.remove('pc-over', 'pc-near', 'pc-on', 'pc-under', 'pc-none'); el.classList.add('pc-' + (pc || 'none'));
      }
    };
    tick(); const timer = setInterval(tick, 1000);
    // Another device's change redraws the board: what was half-typed here
    // (a pallet label, cartons, a note) stays, with the caret where it was.
    // The shell mounts a fresh #content on every redraw.
    const redraw = () => {
      const a = document.activeElement, typed = [];
      for (const el of root.querySelectorAll('input[data-field], textarea[data-field]')) {
        if (['file', 'checkbox', 'radio'].includes(el.type) || el.value === el.defaultValue || sent.get(el.dataset.field) === el.value) continue;
        let caret = null; if (el === a) try { caret = [el.selectionStart, el.selectionEnd]; } catch {}
        typed.push([el.dataset.field, el.value, caret]);
      }
      ctx.rerender();
      const fresh = document.getElementById('content');
      for (const [f, v, caret] of typed) {
        const el = fresh?.querySelector(`[data-field="${CSS.escape(f)}"]`); if (!el || el.value !== el.defaultValue) continue;
        el.value = v;
        if (caret) { el.focus({ preventScroll: true }); try { if (caret[0] != null) el.setSelectionRange(...caret); } catch {} }
      }
    };
    root.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const f = e.target.dataset?.field; if (f === 'ps-code') { e.preventDefault(); root.querySelector('[data-act="ps-find"]')?.click(); return; } if (f === 'cartons' || f === 'ref') { e.preventDefault(); root.querySelector('[data-act="land"]')?.click(); } else if (f === 'pscan' || f === 'lscan') { e.preventDefault(); root.querySelector(`[data-act="${f}"]`)?.click(); } else if (f === 'team') { e.preventDefault(); root.querySelector('[data-act="team-add"]')?.click(); } });
    return [ctx.store.on('dock', redraw), ctx.store.on('clock', redraw), () => clearInterval(timer)];
}

// Sightings from the dock's ledger: a consol manifested on an earlier
// truck (a late arrival), on another planned truck's manifest (it may
// belong to that truck) or already scanned on another (a duplicate?).
const sightOf = p => JSON.stringify([p?.lateFrom || null, p?.seenBefore || null, p?.plannedFor || null]);
function sightToast(ctx, ref, was) {
  const p = model(ctx).t?.pallets?.[ref]; if (!p || sightOf(p) === was) return false;
  const [lf] = JSON.parse(was);
  if (p.lateFrom && JSON.stringify(p.lateFrom) !== JSON.stringify(lf)) toast(tx('⚠ landed {ref} — this consol was manifested {date} (Truck {n}). Late arrival recorded.', { ref, date: fmtDate(p.lateFrom.d), n: truckNo(p.lateFrom.t) }), 'bad');
  else if (p.plannedFor && JSON.stringify(p.plannedFor) !== JSON.stringify(JSON.parse(was)[2])) toast(tx('⚠ landed {ref} — this consol is on the manifest for Truck {n} on {date}. It may belong to that truck.', { ref, n: truckNo(p.plannedFor.t), date: fmtDate(p.plannedFor.d) }), 'bad');
  else if (p.seenBefore) toast(tx('⚠ landed {ref} — this consol was already scanned {date} on Truck {n}. Duplicate?', { ref, date: fmtDate(p.seenBefore.d), n: truckNo(p.seenBefore.t) }), 'bad');
  else return false;
  return true;
}
export const sightBadge = p => (p.plannedFor ? ` <span class="status warn" title="${tx('On the manifest staged for Truck {n} on {date}: it may belong to that truck', { n: esc(truckNo(p.plannedFor.t)), date: esc(fmtDate(p.plannedFor.d)) })}">${tx('ON T{n} {date}', { n: esc(truckNo(p.plannedFor.t)), date: esc(fmtDate(p.plannedFor.d)) })}</span>` : '') + (p.lateFrom ? ` <span class="status warn" title="${tx('Manifested on Truck {n}', { n: esc(truckNo(p.lateFrom.t)) })}">${tx('LATE — manifested {date}', { date: esc(fmtDate(p.lateFrom.d)) })}</span>` : '') + (p.seenBefore ? ` <span class="status warn" title="${p.seenBefore.ref ? tx('Scanned on Truck {n} at {ref}', { n: esc(truckNo(p.seenBefore.t)), ref: esc(p.seenBefore.ref) }) : tx('Scanned on Truck {n}', { n: esc(truckNo(p.seenBefore.t)) })}">${tx('SEEN {date}', { date: esc(fmtDate(p.seenBefore.d)) })}</span>` : '') + (p.linkedLateAt ? ` <span class="status">${tx('linked late · {basis}', { basis: esc(LINK_BASIS[p.linkBasis || 'manual'] || p.linkBasis) })}</span>` : '');
