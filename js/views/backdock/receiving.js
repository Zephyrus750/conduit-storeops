// Receiving: the dock board. Desktop is the facilitator's overview (trucks,
// the pallet grid, who is decanting, what landed) with land, goal, team and
// finalise; the phone is the receiver's hands-on flow (land a pallet, run
// the decant: start, pause, done, halts). Ported from Vector's
// backdock-receiving and backdock-decant over the backdock reducers.

import { $, $$, ic, esc, vh, sub, toast, mhead, mbig, fmtDate, camButton } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { PTYPES, PT_LETTER, PT_NAME, PT_COLOUR, HALT_NAME, KIND_NAME, TRANS_NAME, ROLE_NAME, holdName, PALLET_STATE, TRUCK_STATE, LINK_BASIS, STD_MINS_PER_CARTON, todayKey, truckNo, fmtHM, openTrucks, nextTruckId, pallets, progress, openHalt, running, onBreak, openSegs, startOf, workedMin, pace, fmtMins, fmtClock, forecast, goalPace, who, dnumId, unfinished, grid, startable, manifestIndex, attachManifest } from './common.js';
import { previewManifest } from './mpreview.js';
import { printAudit } from './audit.js';
import { searchSheet, infoSheet, palletContents, onSearchAct, onSearchInput, verifyContents, ss } from './phonesearch.js';
import { linkSheet, linkPick, applyLinks, unlinked } from './late.js';
import { liveAudit } from '../../../shared/reducers/backdock.js';
import { planCard, take5Card, needsTake5, queuePicker, onPlanAct, onPlanChange, ratesFor, guard, decantBoard } from './plan.js';

const st = { truck: null, land: { ref: '', ptype: 'chep', cartons: '' }, view: 'receive', arm: null, sel: null, halting: false, holdKind: null, fix: null, pending: [], manPick: false, linking: false, finalising: false, more: false };
let usedArg = null;   // a view's argument stays on re-renders: apply it once
const dispatch = (ctx, type, entity, payload) => ctx.store.dispatch({ type, entity, payload });
// The hold-up buttons, a role inside a sentence (lower case in English), and
// a pallet's or truck's status as shown.
const START_KIND = { halt: tx('Start halt'), huddle: tx('Start huddle'), transition: tx('Start transition'), break: tx('Start team break') };
const END_KIND = { halt: tx('End halt'), huddle: tx('End huddle'), transition: tx('End transition'), break: tx('End team break') };
const ROLE_AS = { cutter: tx('cutter'), runner: tx('runner'), cleaner: tx('cleaner') };
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
function dockGrid(t, desk) {
  const g = grid(t), byRef = {}; for (const p of Object.values(t.pallets || {})) byRef[p.ref] = p;
  return `<div class="bdk-grid${desk ? ' desk' : ''}" style="grid-template-columns:repeat(${g.cols},1fr)">` + g.refs.map(ref => {
    const p = byRef[ref];
    if (!p) return `<button class="bdk-sq empty" data-act="cell" data-ref="${ref}" title="${tx('Land a pallet at {ref}', { ref })}"><span class="bdk-ref">${ref}</span><span class="bdk-plus">+</span></button>`;
    // Not in this session (DV's exclude): on its bay, out of every count.
    if (p.excluded) return `<button class="bdk-sq marked out${st.sel === ref ? ' hit' : ''}" data-act="cell" data-ref="${ref}" title="${ref} · ${tx('not in this session')}"><span class="bdk-ref">${ref}</span><span class="bdk-ct">${tx('OUT')}</span></button>`;
    const s = p.status || 'landed', tg = !desk && st.view === 'run' && st.arm && (startable(p) || (s === 'active' && !openSegs(p).some(x => x.pid === st.arm))), pc = pace(t, p), crew = openSegs(p).map(x => x.pid).join('+');
    return `<button class="bdk-sq marked t-${PT_LETTER[p.ptype] || 'c'} st-${s}${tg ? ' tg' : ''}${p.carryover ? ' co' : ''}${pc ? ' pc-' + pc : ''}${p.suspect ? ' sus' : ''}${st.sel === ref ? ' hit' : ''}" data-act="cell" data-ref="${ref}" title="${ref} · ${esc(PT_NAME[p.ptype] || p.ptype)} · ${tx('{n} cartons', { n: p.cartons ?? '–' })} · ${pstate(s)}${p.expectedMins ? ' · ' + tx('est {n} min', { n: p.expectedMins }) : ''}${p.carryover ? ' · ' + tx('carried over') : ''}${p.suspect ? ' · ' + tx('done very fast: check the times') : ''}"><span class="bdk-ref">${ref}</span><span class="bdk-ct">${p.cartons ?? '–'}</span>${s === 'active' || s === 'paused' ? `<span class="bdk-tm" data-tick="${ref}" data-tick-short="1"></span>` : ''}${crew ? `<span class="bdk-who">${esc(crew)}</span>` : ''}${p.suspect ? '<span class="bdk-flag">⚠</span>' : s === 'active' ? '<span class="bdk-flag">▶</span>' : s === 'done' ? '<span class="bdk-flag">✓</span>' : s === 'paused' ? '<span class="bdk-flag">⏸</span>' : ''}</button>`;
  }).join('') + '</div>';
}
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
  return `<div class="bdr-land"><span class="lbl">${tx('Land a pallet')}</span><input class="bdr-in mono" data-field="ref" placeholder="${tx('bay field::Bay')}" maxlength="3" title="${tx('Grid ref, e.g. A1, or click an empty cell')}" value="${esc(st.land.ref)}"><span class="bdr-pts">${PTYPES.map(p => `<button class="bdr-pt${st.land.ptype === p[0] ? ' on' : ''}" data-act="ptype" data-pt="${p[0]}"><i style="background:${p[2]}"></i>${p[1]}</button>`).join('')}</span><input class="bdr-in mono" data-field="cartons" inputmode="numeric" placeholder="${tx('Cartons')}" maxlength="3" value="${esc(st.land.cartons)}"><button class="btn primary sm" data-act="land">${ic('plus')}${tx('Land')}</button></div>`;
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
  if (!t) return head + decantBoard(m.dock, ctx.store.get('plan'), todayKey()) + `<div class="card bdr-empty" style="padding:28px;text-align:center"><div style="font-size:34px;color:var(--faint)">${ic('truck')}</div><b style="display:block;font-size:18px;margin:8px 0 4px">${tx('No truck on the dock')}</b><p class="lbl">${tx('Start receiving the next truck here, or let a dock phone land it. The board wakes either way.')}</p><button class="btn primary" data-act="newtruck">${ic('plus')}${tx('Start receiving a truck')}</button></div>` + heldCard(m.dock);
  const strip = `<div class="trk-strip">${m.open.map(x => truckCard(x, x.id === t.id)).join('')}</div>`;
  const rates = ratesFor(m.dock), man = t.manifest, fc = forecast(t, Date.now(), rates), gp = t.goalAt ? goalPace(t) : null;
  const headcard = `<div class="card bdr-headcard"><div class="bdr-head"><span class="bdr-tile">${ic('truck')}</span><div class="bdr-tt"><b>${tx('Truck {n}', { n: esc(truckNo(t.id)) })}</b><span class="tst ${esc(t.status)}">${live ? tx('Live') : tx('Staged')}</span><small>${live ? tx('landed {time}', { time: fmtHM(t.landedAt) }) + ' · ' + txn(pr.count, '{n} pallet', '{n} pallets') + (pallets(t).some(p => p.carryover) ? ' ' + tx('({n} carryover)', { n: pallets(t).filter(p => p.carryover).length }) : '') + ' · ' + tx('{n} decanting', { n: pr.active }) : tx('staged · the first pallet landed makes it live')}${m.halt ? ` · <b style="color:#B91C1C">${esc(holdName(m.halt))}</b>` : ''}</small></div><button class="btn sm" data-act="audit" title="${tx('Print the receiving audit')}">${ic('print')}${tx('Audit')}</button>` +
    `<div class="bdr-chips"><span class="bdr-chip"><span class="l">${tx('Manifest')}</span><span class="v">${man ? tx('{n}<small> cons · {c}c</small>', { n: man.consols.length, c: man.consols.reduce((n, c) => n + c.cartons, 0) }) : '—'}</span></span><button class="bdr-chip" data-act="setstart" title="${tx('When the decant clock started (clear time and rate run from here)')}"><span class="l">${tx('Decant start')}</span><span class="v">${fmtHM(startOf(t))}${t.decantStartAt ? '' : `<small> ${tx('landed')}</small>`}</span></button><span class="bdr-chip"><span class="l">${tx('Goal')}</span><span class="v">${t.goalAt ? fmtHM(t.goalAt) : '—'}</span></span><span class="bdr-chip"><span class="l">${tx('Forecast')}</span><span class="v">${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}${fc.at && t.goalAt ? `<small class="${fc.at > Date.parse(t.goalAt) ? 'c-red' : 'c-green'}"> ${fc.at > Date.parse(t.goalAt) ? tx('behind') : tx('ahead')}</small>` : ''}</span></span><button class="bdr-chip${t.receivingConfirmed ? ' ok' : ''}" data-act="received" title="${tx('The receiver hands the truck over: the layout is set')}"><span class="l">${tx('Receiving')}</span><span class="v">${t.receivingConfirmed ? `${ic('check')}${tx('Handed over {time}', { time: fmtHM(t.receivedAt) })}` : tx('Hand over')}</span></button></div></div>` +
    `<div class="bdr-prog"><b class="bdr-big">${pr.done}</b><span class="bdr-of">${tx('/ {n} cartons', { n: pr.total })}</span><span class="bdr-pct">${pr.pct}%</span></div><div class="bdr-bar">${gp !== null ? `<b class="bdr-pace" style="left:${Math.round(gp * 100)}%" title="${tx('Where the team should be by now to make the goal')}"></b>` : ''}<i style="width:${pr.pct}%"></i></div>${tallyRow(t)}</div>`;
  const dock = `<div class="card kpi dk rcv bdr-dock"><div class="kh">${ic('box')}<h3>${tx('The dock')}</h3>${legend()}</div>${live ? landForm() : ''}${dockGrid(t, true)}${holdRow(t, m.halt, live)}</div>`;
  const teamcard = teamCard(t, m.run, live);
  const landed = Object.values(t.pallets || {}).slice().sort((a, b) => (a.landedAt || '').localeCompare(b.landedAt || ''));
  const landedcard = `<div class="card"><div class="ch"><h3>${tx('Landed today')}</h3><span class="cs-dim">${landed.length ? txn(landed.length, '{n} pallet · newest last', '{n} pallets · newest last') : tx('Truck {n}', { n: truckNo(t.id) })}</span></div>${landed.length ? `<div class="list rcv-list bdr-landed">${landed.map(p => `<div class="li${st.sel === p.ref ? ' sel' : ''}" data-act="cell" data-ref="${esc(p.ref)}"><span class="loc">${esc(p.ref)}</span><span class="nm">${esc(PT_NAME[p.ptype] || p.ptype)}${p.carryover ? ' · ' + tx('carryover') : ''}${p.excluded ? ` · <b>${tx('not in this session')}</b>` : ''} · ${tx('{n} cartons', { n: p.cartons ?? '–' })}${p.assignedTo ? ` · ${esc(p.assignedTo)}` : ''}${sightBadge(p)}</span><span class="rcv-st ${p.status}">${p.status === 'done' ? tx('Done') : p.status === 'active' ? tx('Decanting') : p.status === 'paused' ? tx('Paused') : tx('Waiting')}</span><span class="rt">${p.carryover ? tx('Yesterday') : fmtHM(p.landedAt)}</span></div>`).join('')}</div>` : `<div class="pempty">${tx('Nothing landed yet')}</div>`}${st.sel && t.pallets[st.sel] ? palletPanel(t, t.pallets[st.sel], true) : ''}</div>`;
  const picker = !st.manPick ? '' : (() => {
    const idx = manifestIndex(m.dock).sort((a, b) => (a.truck ? 1 : 0) - (b.truck ? 1 : 0));
    return `<div class="card bdr-manpick"><div class="ch"><h3>${t.manifest ? tx('Manifest {no} on Truck {n}', { no: esc(t.manifest.manNo), n: esc(truckNo(t.id)) }) : tx('Attach a manifest to Truck {n}', { n: esc(truckNo(t.id)) })}</h3><span class="go" data-act="manpick">${tx('Close')}</span></div>` +
      (t.manifest ? `<p class="lbl">${tx('{n} consols · {c} cartons · attached {time}. Attaching another replaces it.', { n: t.manifest.consols.length, c: t.manifest.consols.reduce((n, c) => n + c.cartons, 0), time: fmtHM(t.manifest.attachedAt) })}</p>` : '') +
      `<div class="list">${idx.map(x => `<div class="li"><span class="loc">${esc(x.manNo)}</span><span class="nm">${tx('{n} consols · {c} cartons', { n: x.consols, c: x.totalCartons })}${x.despatch ? ' · ' + tx('despatch {d}', { d: esc(x.despatch) }) : ''}${x.truck ? ' · ' + tx('on Truck {n}', { n: esc(truckNo(x.truck)) }) : ''}</span><button class="btn sm${x.truck === t.id ? '' : ' primary'}" data-act="manattach" data-man="${esc(x.manNo)}"${x.truck === t.id ? ' disabled' : ''}>${x.truck === t.id ? tx('Attached') : tx('Attach')}</button></div>`).join('') || `<div class="ohint">${tx('Nothing in the library yet.')}</div>`}</div>` +
      `<div class="bdr-manup"><label class="btn" style="cursor:pointer"><input type="file" accept=".xls,.xlsx,.csv" data-field="manfile" style="display:none">${ic('file')}${tx("Upload today's report and attach it")}</label><span class="cs-dim">${tx("The DC's Manifest Report .xls from the email. It is published to the library and attached to this truck.")}</span></div></div>`;
  })();
  const nUn = man ? unlinked(t).length : 0;
  const late = !man ? '' : st.linking ? linkSheet(t, rates) : nUn && pr.count ? `<div class="card ll-warn"><div class="ch"><h3>${ic('alert')}${txn(nUn, '{n} pallet not linked to manifest {no}', '{n} pallets not linked to manifest {no}', { no: esc(man.manNo) })}</h3><button class="btn sm primary" data-act="ll-open">${tx('Link landed pallets →')}</button></div><p class="lbl">${tx("Landed before the manifest was attached, or without a readable label. Link them so the reconciliation and the clear forecast use the manifest's cartons.")}</p></div>` : '';
  return head + clockNote(ctx) + strip + (st.finalising ? finaliseCard(t, m.dock) : '') + picker + late + `<div class="bdr-stack">${needsTake5(t) && (t.team || []).length ? take5Card(t) : ''}${headcard}${dock}${teamcard}${planCard(t, rates)}${landedcard}</div>`;
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
    st.pending.filter(x => x.ref === p.ref).map((x, i) => `<div class="bdk-vrow warn"><span>⚠</span><b class="mono">${esc(x.id)}</b><span>${tx('not on this manifest')}</span><span class="bdk-vbtns"><button class="btn sm" data-act="pend-add" data-i="${i}">${tx('Add &amp; flag')}</button><button class="btn sm" data-act="pend-drop" data-i="${i}">${tx('Ignore')}</button></span></div>`).join('');
  return `<div class="bdk-pal${desk ? ' desk' : ''}"><div class="bdk-pal-h"><b>${tx('Pallet {ref}', { ref: esc(p.ref) })}</b><span class="tst ${s === 'done' ? 'done' : s === 'active' ? 'live' : 'staged'}">${esc(pstate(s))}</span>${p.carryover ? `<span class="status warn">${tx('carryover')}</span>` : ''}${sightBadge(p)}<button class="ibtn" data-act="closepal" title="${tx('Close')}">${ic('x')}</button></div>` +
    `<div class="bdk-pal-b"><div class="bdk-ptrow">${PTYPES.map(x => `<button class="bdr-pt${p.ptype === x[0] ? ' on' : ''}" data-act="pal-pt" data-pt="${x[0]}"><i style="background:${x[2]}"></i>${x[1]}</button>`).join('')}</div>` +
    `<div class="bdk-fields"><label>${tx('Cartons')}<input class="bdr-in mono" data-field="pcartons" inputmode="numeric" maxlength="3" value="${p.cartons ?? ''}"></label><label>${tx('Est. mins')}<input class="bdr-in mono${p.expectedBasis === 'manual' ? '' : ' auto'}" data-field="pexp" inputmode="numeric" maxlength="4" value="${p.expectedMins ?? ''}" title="${p.expectedBasis === 'manual' ? tx('set by hand') : tx('auto · {n} min per carton', { n: t.minsPerCarton ?? STD_MINS_PER_CARTON })}"></label><label>${tx('Note')}<input class="bdr-in" data-field="pnote" maxlength="120" placeholder="${tx('optional')}" value="${esc(p.note || '')}"></label></div>` +
    `<div class="bdk-scanrow"><input class="bdr-in mono" data-field="pscan" inputmode="numeric" enterkeyhint="done" placeholder="${tx('Scan or type a pallet label')}" autocomplete="off">${camButton('pscan')}<button class="btn sm" data-act="pscan">${ic('barcode')}${tx('Add')}</button></div>${scans ? `<div class="bdk-verified">${scans}</div>` : ''}` +
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
function mobile(ctx) {
  const m = model(ctx), t = m.t, pr = m.pr;
  const chips = `<div class="bdk-tchips">${m.open.map(x => `<button class="bdk-tchip${x.id === st.truck ? ' on' : ''}" data-act="pick" data-id="${esc(x.id)}">${tx('Truck {n}', { n: esc(truckNo(x.id)) })}<i>${esc(tstate(x.status))}</i></button>`).join('')}<button class="bdk-tchip add" data-act="newtruck">+ ${tx('New truck')}</button></div>`;
  if (!t) return mhead(tx('Receiving'), tx('No truck on the dock')) + chips + `<div class="mv-note">${ic('truck')}${tx('Tap <b>New truck</b> when the first pallet comes off.')}</div>` + heldCard(m.dock);
  const run = st.view === 'run';
  const head = mhead(tx('Truck {n}', { n: esc(truckNo(t.id)) }), t.status === 'live' ? tx('landed {time}', { time: fmtHM(t.landedAt) }) + (t.goalAt ? ' · ' + tx('goal {time}', { time: fmtHM(t.goalAt) }) : '') : tx('staged · Start receiving to land pallets'));
  const toggle = `<div class="bdk-vt"><button class="${run ? '' : 'on'}" data-act="view" data-mode="receive">${tx('Receive')}</button><button class="${run ? 'on' : ''}" data-act="view" data-mode="run">${tx('Run')}</button></div>`;
  const prog = `<div class="bdk-prog"><div class="nums"><b>${pr.done}</b><span>${tx('/ {n} ctn decanted', { n: pr.total })}</span></div><div class="bar"><i style="width:${pr.pct}%"></i></div><div class="sub">${txn(pr.count, '{n} pallet landed', '{n} pallets landed')} · ${tx('{n} decanting', { n: pr.active })}${t.status !== 'live' ? ` · <b>${esc(tstate(t.status))}</b>` : ''}</div></div>`;
  const runbar = run ? (m.halt ? `<div class="bdk-runbar"><div class="bdk-runtile warn" style="flex:1"><small>${esc(holdName(m.halt))}</small><b>${tx('since {time}', { time: fmtHM(m.halt.start) })}</b></div><button class="bdk-runtile" data-act="haltend"><small>${tx('Decant')}</small><b>▶ ${tx('Resume')}</b></button></div>`
      : `<div class="bdk-runbar"><button class="bdk-runtile" data-act="goal"><small>${tx('Goal')}</small><b>${t.goalAt ? fmtHM(t.goalAt) : tx('Set')}</b></button><button class="bdk-runtile warn" data-act="halt"><small>${tx('Decant')}</small><b>⏸ ${tx('Hold-up')}</b></button></div>${st.halting ? holdPicker() : ''}`) +
    `<div class="bdk-hint${st.arm ? ' on' : ''}">${st.arm ? tx('Armed: tap a lit square to start it (or join it), or the chip again to disarm.') : tx('Tap a crew member, then a square, to start decanting it.')}</div>` : '';
  const team = t.team || [];
  const strip = run ? (team.length ? `<div class="bdk-strip">${team.map(mm => { const br = onBreak(t, mm.pid); return `<button class="bdk-fchip${st.arm === mm.pid ? ' armed' : ''}${br ? ' brk' : ''}" data-act="${br || (mm.role || 'cutter') !== 'cutter' ? 'more' : 'arm'}" data-pid="${esc(mm.pid)}"${br ? ` title="${tx('On a break: open Team & plan to bring them back')}"` : ''}><i class="${m.run[mm.pid] ? 'a' : ''}"></i><b>${esc(who(mm))}</b><span>${br ? tx('on a break') : m.run[mm.pid] ? '▶ ' + esc(m.run[mm.pid]) : (mm.role || 'cutter') !== 'cutter' ? esc(ROLE_AS[mm.role] || mm.role) : tx('free')}</span></button>`; }).join('')}</div>` : `<div class="mv-note">${ic('users')}${tx('No crew on this truck yet. Add the team from <b>Team &amp; plan</b>.')}</div>`) : '';
  const sel = st.sel ? (t.pallets[st.sel] ? palletPanel(t, t.pallets[st.sel], false) : landPanel(st.sel)) : '';
  const tools = `<div class="ps-tools"><button class="btn sm${ss.open ? ' primary' : ''}" data-act="ps-open">${ic('search')}${tx('Search')}</button><button class="btn sm${ss.info ? ' primary' : ''}" data-act="ps-info">${ic('packages')}${t.manifest ? tx('Manifest {no}', { no: esc(t.manifest.manNo) }) : tx('Manifest')}</button><button class="btn sm${st.more ? ' primary' : ''}" data-act="more" aria-expanded="${st.more}">${ic('users')}${tx('Team &amp; plan')}</button></div>`;
  // A staged truck (imported from Decant Visualiser, or a planner slot) goes live here too.
  const golive = t.status === 'staged' ? `<div class="mv-foot">${mbig(tx('Start receiving T{n}', { n: truckNo(t.id) }), '', 'truck', ' data-act="golive"')}</div>` : '';
  return head + clockNote(ctx) + chips + golive + (needsTake5(t) && (t.team || []).length ? take5Card(t) : '') + toggle + tools + (st.more ? moreSheet(m, t) : '') + searchSheet(ctx, t) + infoSheet(t) + prog + runbar + `<div class="bdk">${dockGrid(t, false)}</div>` + strip + sel;
}
// The facilitator on the phone (DV's More and person sheets): the team with
// roles and breaks, the opening huddle, the plan with auto-balance and
// queues, and Complete decant.
function moreSheet(m, t) {
  const live = t.status === 'live';
  return `<div class="bdk-more">` + (st.finalising ? finaliseCard(t, m.dock) : '') + teamCard(t, m.run, live) +
    (live ? `<div class="card"><div class="ch"><h3>${tx('Huddle')}</h3><span class="cs-dim">${tx('hold-ups: the Hold-up tile in Run')}</span></div><div class="bdk-palacts"><button class="btn" data-act="huddleplan">${ic('users')}${tx('Book the opening huddle')}</button></div></div>` : '') +
    planCard(t, ratesFor(m.dock)) +
    (live && !st.finalising ? `<div class="bdk-palacts"><button class="btn primary" data-act="finalise">${ic('check')}${tx('Complete decant')}</button><button class="btn" data-act="more">${tx('Close')}</button></div>` : '') + `</div>`;
}
function landPanel(ref) {
  return `<div class="bdk-pal"><div class="bdk-pal-h"><b>${tx('Land pallet {ref}', { ref: esc(ref) })}</b><button class="ibtn" data-act="closepal" title="${tx('Close')}">${ic('x')}</button></div><div class="bdk-pal-b"><div class="bdk-ptrow">${PTYPES.map(x => `<button class="bdr-pt${st.land.ptype === x[0] ? ' on' : ''}" data-act="ptype" data-pt="${x[0]}"><i style="background:${x[2]}"></i>${x[1]}</button>`).join('')}</div>` +
    `<div class="bdk-fields"><label>${tx('Cartons')}<input class="bdr-in mono" data-field="cartons" inputmode="numeric" maxlength="3" placeholder="0" value="${esc(st.land.cartons)}"></label><label>${tx('Note')}<input class="bdr-in" data-field="note" maxlength="120" placeholder="${tx('optional')}"></label></div>` +
    `<div class="bdk-palacts"><button class="btn primary" data-act="land" data-ref="${esc(ref)}">${ic('plus')}${tx('Land at {ref}', { ref: esc(ref) })}</button></div></div></div>`;
}

// ── actions ────────────────────────────────────────────────────────────
async function onAct(ctx, a, root) {
  const act = a.dataset.act, m = model(ctx), t = m.t, id = t?.id;
  const field = n => root.querySelector(`[data-field="${n}"]`)?.value ?? '';
  const num = v => { const n = parseInt(String(v).replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : null; };
  const rates = ratesFor(m.dock);
  try {
    if (t && await onSearchAct(ctx, t, a, root)) return;
    if (t && await onPlanAct(ctx, t, a, rates)) return;
    if (act === 'pick') { st.truck = a.dataset.id; st.sel = null; st.arm = null; st.manPick = false; return ctx.rerender(); }
    if (act === 'manpick') { st.manPick = !st.manPick; return ctx.rerender(); }
    if (act === 'manattach') { a.disabled = true; await attachManifest(ctx, id, a.dataset.man); st.manPick = false; toast(tx('{no} attached to Truck {n}', { no: a.dataset.man, n: truckNo(id) })); return; }
    if (act === 'view') { st.view = a.dataset.mode; st.arm = null; st.sel = null; return ctx.rerender(); }
    // One truck at a time: an open truck is finalised by the new one, and its
    // unfinished pallets come with it on their bays. Pallets held at the last
    // finalise join the new truck unless the receiver starts it empty.
    if (act === 'newtruck') {
      const nid = nextTruckId(m.dock, ctx.store.get('plan')), cur = t || m.open[0], payload = { landedAt: new Date().toISOString() };
      if (cur) {
        const left = unfinished(cur);
        if (left.some(p => p.status === 'active')) return toast(tx('Pause or finish what is being decanted on Truck {n} first', { n: truckNo(cur.id) }), 'bad');
        const ctn = left.reduce((n, p) => n + (p.cartons || 0), 0);
        if (!confirm(left.length ? txn(left.length, 'Truck {a} is still open with {n} unfinished pallet ({ctn} cartons).\n\nFinalise it and carry that pallet onto Truck {b}? It stays on the same bays.', 'Truck {a} is still open with {n} unfinished pallets ({ctn} cartons).\n\nFinalise it and carry them onto Truck {b}? They stay on the same bays.', { a: truckNo(cur.id), b: truckNo(nid), ctn }) : tx('Finalise Truck {a} and start Truck {b}?', { a: truckNo(cur.id), b: truckNo(nid) }))) return;
        payload.carryFrom = cur.id;
      } else if (m.dock.rollover) {
        const n = Object.keys(m.dock.rollover.pallets).length;
        if (!confirm(txn(n, '{n} pallet held from Truck {a} joins Truck {b}.\n\nOK takes it on. Cancel starts the truck empty and lets it go.', '{n} pallets held from Truck {a} join Truck {b}.\n\nOK takes them on. Cancel starts the truck empty and lets them go.', { a: truckNo(m.dock.rollover.from), b: truckNo(nid) }))) payload.takeRollover = false;
      }
      await dispatch(ctx, 'truck.create', { truck: nid }, payload); await dispatch(ctx, 'truck.setLive', { truck: nid }, {});
      attachPlanned(ctx, nid);
      st.truck = nid; st.sel = null; toast(payload.carryFrom ? tx('Truck {a} finalised · Truck {b} is receiving', { a: truckNo(payload.carryFrom), b: truckNo(nid) }) : tx('Truck {n} is receiving', { n: truckNo(nid) })); return;
    }
    if (act === 'golive') { await dispatch(ctx, 'truck.setLive', { truck: id }, {}); return; }
    if (act === 'goal') { const cur = t.goalAt ? fmtHM(t.goalAt) : ''; const v = prompt(tx('Finish goal, time of day (HH:MM). Blank to clear:'), cur); if (v === null) return; let goal = null; if (v.trim()) { const mm = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!mm) return toast(tx('Enter a time like 14:30'), 'bad'); const d = new Date(); d.setHours(+mm[1], +mm[2], 0, 0); if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1); goal = d.toISOString(); } await dispatch(ctx, 'truck.setGoal', { truck: id }, { goal }); toast(goal ? tx('Goal {time}', { time: fmtHM(goal) }) : tx('Goal cleared')); return; }
    if (act === 'more') { st.more = !st.more; if (!st.more) st.finalising = false; return ctx.rerender(); }
    if (act === 'finalise') { st.finalising = true; if (ctx.isMobile) st.more = true; ctx.rerender(); root.querySelector('.bdr-fin')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
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
    if (act === 'huddleplan') { const v = prompt(tx('Book the opening huddle: minutes from decant start (0 clears it)'), '10'); if (v === null) return; const mins = Number(v); if (!(mins >= 0 && mins <= 120)) return toast(tx('Minutes from 0 to 120'), 'bad'); await dispatch(ctx, 'huddle.plan', { truck: id }, { mins }); toast(mins ? tx('Opening huddle booked · {n} min', { n: mins }) : tx('Opening huddle cleared')); return; }
    if (act === 'setstart') {
      const v = prompt(tx('When did the decant start? Time of day (HH:MM). Blank uses the landed time.'), t.decantStartAt ? fmtHM(t.decantStartAt) : ''); if (v === null) return;
      let at = null; if (v.trim()) { const mm = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!mm) return toast(tx('Enter a time like 06:30'), 'bad'); const d = new Date(t.landedAt || Date.now()); d.setHours(+mm[1], +mm[2], 0, 0); at = d.toISOString(); }
      await dispatch(ctx, 'truck.setStart', { truck: id }, { at }); toast(at ? tx('Decant start {time}', { time: fmtHM(at) }) : tx('Decant start follows the landed time')); return;
    }
    if (act === 'received') { await dispatch(ctx, 'receiving.confirm', { truck: id }, { confirmed: !t.receivingConfirmed }); toast(t.receivingConfirmed ? tx('Hand-over undone') : tx('Handed over: the layout is set')); return; }
    if (act === 'break-start' || act === 'break-end') { const pid = a.dataset.pid, was = m.run[pid]; await dispatch(ctx, act === 'break-start' ? 'break.start' : 'break.end', { truck: id }, { pid }); toast(act === 'break-start' ? (was ? tx('{pid} is on a break, off {ref}: their clock stops', { pid, ref: was }) : tx('{pid} is on a break: their clock stops', { pid })) : tx('{pid} is back', { pid })); return; }
    if (act === 'audit') return printAudit(t, m.dock);
    if (act === 'ptype') { st.land.ref = field('ref') || st.land.ref; st.land.cartons = field('cartons'); st.land.ptype = a.dataset.pt; return ctx.rerender(); }
    if (act === 'team-add') { const v = field('team').trim(); if (!v) return; const pid = dnumId(v); if (!pid) return toast(tx('Enter a D-number, like D4. Names are not kept.'), 'bad'); if ((t.team || []).some(x => x.pid === pid)) return toast(tx('{pid} is already on the truck', { pid })); await dispatch(ctx, 'truck.team.set', { truck: id }, { team: [...(t.team || []), { pid }] }); return; }
    if (act === 'team-drop') { if (m.run[a.dataset.pid] && !confirm(tx('{pid} is on {ref}. Take them off the truck? Their time on it is kept.', { pid: a.dataset.pid, ref: m.run[a.dataset.pid] }))) return; await dispatch(ctx, 'truck.team.set', { truck: id }, { team: (t.team || []).filter(x => x.pid !== a.dataset.pid) }); return; }
    if (act === 'cell') {
      const ref = a.dataset.ref, p = t.pallets[ref];
      if (!ctx.isMobile) { if (p) { st.sel = st.sel === ref ? null : ref; } else { st.land.ref = ref; st.land.cartons = field('cartons'); st.sel = null; } ctx.rerender(); if (!p) root.querySelector('[data-field="cartons"]')?.focus(); return; }
      if (st.view === 'run' && st.arm && p?.excluded) return toast(tx('{ref} is not in this session: include it first', { ref }), 'bad');
      if (st.view === 'run' && st.arm && p && (startable(p) || p.status === 'active')) {
        const pid = st.arm; st.arm = null;
        if (p.status === 'active') { await dispatch(ctx, 'pallet.join', { truck: id, bay: ref }, { pid }); toast(tx('{pid} joined {ref}', { pid, ref }), '', { label: tx('Undo'), run: () => dispatch(ctx, 'pallet.unstart', { truck: id, bay: ref }, {}).catch(e => toast(e.message, 'bad')) }); return; }
        if (p.status !== 'paused' && !guard(t, pid, ref, rates, true)) return;
        await dispatch(ctx, p.status === 'paused' ? 'pallet.resume' : 'pallet.start', { truck: id, bay: ref }, { pid });
        toast(tx('{pid} on {ref}', { pid, ref }), '', { label: tx('Undo'), run: () => dispatch(ctx, 'pallet.unstart', { truck: id, bay: ref }, {}).catch(e => toast(e.message, 'bad')) }); return;
      }
      if (!p && t.status !== 'live') return toast(tx('Land the first pallet after Start receiving, or tap New truck'), 'bad');
      st.sel = st.sel === ref ? null : ref; ctx.rerender(); if (!p) root.querySelector('[data-field="cartons"]')?.focus(); return;
    }
    if (act === 'closepal') { st.sel = null; return ctx.rerender(); }
    if (act === 'land') {
      const ref = (a.dataset.ref || field('ref') || st.land.ref).trim().toUpperCase();
      if (!/^[A-Z]\d{1,2}$/.test(ref)) return toast(tx('Pick a bay like A1, or click an empty cell'), 'bad');
      const cartons = num(field('cartons')), note = field('note');
      await dispatch(ctx, 'pallet.land', { truck: id, bay: ref }, { ptype: st.land.ptype, cartons, note });
      st.land = { ref: '', ptype: st.land.ptype, cartons: '' }; st.sel = ctx.isMobile ? ref : null; toast(tx('Pallet landed at {ref}', { ref })); return;
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
      if (kind === 'start' || kind === 'resume') { const pid = field('pid') || p.assignedTo; if (!pid) return toast(tx('Pick who is decanting first'), 'bad'); if (kind === 'start' && !guard(t, pid, ref, rates, true)) return; await dispatch(ctx, kind === 'start' ? 'pallet.start' : 'pallet.resume', B, { pid }); toast(tx('{pid} on {ref}', { pid, ref }), '', kind === 'start' ? undoStart : undo('pallet.pause')); return; }
      if (kind === 'join') { const pid = field('pid'); if (!pid) return toast(tx('Pick who joins'), 'bad'); await dispatch(ctx, 'pallet.join', B, { pid }); toast(tx('{pid} joined {ref}', { pid, ref }), '', undoStart); return; }
      if (kind === 'handover') { const pid = field('pid'); if (!pid) return toast(tx('Pick who takes it'), 'bad'); await dispatch(ctx, 'pallet.handover', B, { toPid: pid }); toast(tx('{ref} handed to {pid}', { ref, pid }), '', onNow.length === 1 ? undo('pallet.handover', { toPid: onNow[0] }) : null); return; }
      if (kind === 'leave') { await dispatch(ctx, 'pallet.leave', B, { pid: a.dataset.pid }); toast(tx('{pid} stepped off {ref}', { pid: a.dataset.pid, ref })); return; }
      if (kind === 'unstart') { await dispatch(ctx, 'pallet.unstart', B, {}); toast(tx('Last start undone')); return; }
      if (kind === 'pause') { await dispatch(ctx, 'pallet.pause', B, {}); toast(tx('{ref} paused', { ref }), '', onNow.length ? undo('pallet.resume', { pid: onNow[0] }) : null); return; }
      if (kind === 'done') {
        await dispatch(ctx, 'pallet.done', B, {}); if (ctx.isMobile) st.sel = null;
        const q = model(ctx).t?.pallets[ref];
        toast(q?.suspect ? tx('{ref} done very fast: check its times', { ref }) : tx('{ref} decanted', { ref }), q?.suspect ? 'bad' : '', { label: tx('Undo'), run: () => dispatch(ctx, 'pallet.reopen', B, {}).catch(e => toast(e.message, 'bad')) }); return;
      }
      if (kind === 'reopen') { await dispatch(ctx, 'pallet.reopen', B, {}); toast(tx('{ref} reopened', { ref }), '', undo('pallet.done')); return; }
      if (kind === 'quick') { await dispatch(ctx, 'pallet.update', B, { suspectOk: true }); toast(tx('{ref} confirmed: its time counts', { ref })); return; }
      if (kind === 'move') { const to = (prompt(tx('Move pallet {ref} to which empty square?', { ref }), '') || '').trim().toUpperCase(); if (!to) return; await dispatch(ctx, 'pallet.move', B, { to }); st.sel = to; toast(tx('{ref} moved to {to}', { ref, to })); return; }
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
      catch (e) { if (e.code === 'not_on_manifest') { st.pending.push({ ref: st.sel, id: id9 }); ctx.rerender(); toast(tx('{id} is not on this manifest. Old label from a reused tub?', { id: id9 }), 'bad'); } else throw e; }
      return;
    }
    if (act === 'pend-add') { const x = st.pending.filter(y => y.ref === st.sel)[+a.dataset.i]; st.pending = st.pending.filter(y => y !== x); const p = t.pallets[st.sel], was = sightOf(p); await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { scanIds: [...p.scanIds, x.id] }); sightToast(ctx, st.sel, was) || toast(tx('{id} flagged in the receiving audit', { id: x.id })); return; }
    if (act === 'll-open' || act === 'll-close') { st.linking = act === 'll-open'; return ctx.rerender(); }
    if (act === 'll-apply') { await applyLinks(ctx, t, ratesFor(ctx.store.get('dock'))); st.linking = false; return ctx.rerender(); }
    if (act === 'pend-drop') { const x = st.pending.filter(y => y.ref === st.sel)[+a.dataset.i]; st.pending = st.pending.filter(y => y !== x); return ctx.rerender(); }
  } catch (e) { toast(e.message, 'bad'); }
}

// A truck started from a planner slot names the report the slot staged; this
// device puts it on the truck from the library (once per truck per session;
// a failure leaves the Attach list on Receiving).
const attaching = new Set();
function attachPlanned(ctx, id) {
  const t = ctx.store.get('dock').trucks?.[id];
  if (!t?.plannedManifest || t.manifest || t.status === 'closed' || attaching.has(id)) return;
  attaching.add(id);
  attachManifest(ctx, id, t.plannedManifest).then(() => toast(tx('Manifest {no} attached to Truck {n}', { no: t.plannedManifest, n: truckNo(id) })))
    .catch(e => toast(tx('Could not attach the planned manifest {no}: {error}. Attach it from the manifest list.', { no: t.plannedManifest, error: e.message }), 'bad'));
}

export default {
  id: 'receiving', title: tx('Receiving'), icon: 'm-receiving', area: 'backdock',
  desktop(ctx) { return desktop(ctx); },
  mobile(ctx) { return mobile(ctx); },
  mount(ctx, root) {
    for (const id of Object.keys(ctx.store.get('dock').trucks || {})) attachPlanned(ctx, id);
    // From search: the truck and the pallet a consolidation is on.
    if (ctx.arg?.truck && ctx.arg !== usedArg && ctx.store.get('dock').trucks?.[ctx.arg.truck]) { usedArg = ctx.arg; st.truck = ctx.arg.truck; st.sel = ctx.arg.bay && ctx.store.get('dock').trucks[ctx.arg.truck].pallets?.[ctx.arg.bay] ? ctx.arg.bay : null; setTimeout(() => ctx.rerender(), 0); }
    root.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a) onAct(ctx, a, root); });
    root.addEventListener('input', e => onSearchInput(ctx, e, root));
    verifyContents(ctx, root);
    root.addEventListener('change', e => { if (e.target.dataset.ll != null) linkPick(e.target.dataset.ll, e.target.value); });
    root.addEventListener('change', async e => {
      if (!e.target.matches('[data-field="manfile"]')) return;
      const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
      const t = model(ctx).t; if (!t) return;
      try { const r = await previewManifest(ctx, f, { attachTo: t.id }); if (!r) return; st.manPick = false; ctx.rerender(); toast(tx('Manifest {no} attached · {n} consols, {c} cartons', { no: r.manNo, n: r.consols, c: r.totalCartons })); }
      catch (err) { toast(tx('Could not use {file}: {error}', { file: f.name, error: err.message }), 'bad'); }
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
    root.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const f = e.target.dataset?.field; if (f === 'ps-code') { e.preventDefault(); root.querySelector('[data-act="ps-find"]')?.click(); return; } if (f === 'cartons' || f === 'ref') { e.preventDefault(); root.querySelector('[data-act="land"]')?.click(); } else if (f === 'pscan') { e.preventDefault(); root.querySelector('[data-act="pscan"]')?.click(); } else if (f === 'team') { e.preventDefault(); root.querySelector('[data-act="team-add"]')?.click(); } });
    return [ctx.store.on('dock', () => ctx.rerender()), ctx.store.on('clock', () => ctx.rerender()), () => clearInterval(timer)];
  },
};

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
