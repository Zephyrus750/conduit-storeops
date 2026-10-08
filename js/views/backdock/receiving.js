// Receiving: the dock board. Desktop is the facilitator's overview (trucks,
// the pallet grid, who is decanting, what landed) with land, goal, team and
// finalise; the phone is the receiver's hands-on flow (land a pallet, run
// the decant: start, pause, done, halts). Ported from Vector's
// backdock-receiving and backdock-decant over the backdock reducers.

import { $, $$, ic, esc, vh, sub, toast, mhead, fmtDate, camButton } from '../../ui.js';
import { PTYPES, PT_LETTER, PT_NAME, PT_COLOUR, HALT_NAME, KIND_NAME, TRANS_NAME, ROLE_NAME, holdName, STD_MINS_PER_CARTON, todayKey, truckNo, fmtHM, openTrucks, nextTruckId, pallets, progress, openHalt, running, onBreak, openSegs, startOf, workedMin, pace, fmtMins, fmtClock, forecast, goalPace, who, dnumId, unfinished, grid, startable, manifestIndex, attachManifest } from './common.js';
import { previewManifest } from './mpreview.js';
import { printAudit } from './audit.js';
import { searchSheet, infoSheet, palletContents, onSearchAct, onSearchInput, ss } from './phonesearch.js';
import { linkSheet, linkPick, applyLinks, unlinked } from './late.js';
import { planCard, take5Card, needsTake5, queuePicker, onPlanAct, onPlanChange, ratesFor, guard, decantBoard } from './plan.js';

const st = { truck: null, land: { ref: '', ptype: 'chep', cartons: '' }, view: 'receive', arm: null, sel: null, halting: false, holdKind: null, fix: null, pending: [], manPick: false, linking: false };
const dispatch = (ctx, type, entity, payload) => ctx.store.dispatch({ type, entity, payload });

function model(ctx) {
  const dock = ctx.store.get('dock'), open = openTrucks(dock);
  if (!open.some(t => t.id === st.truck)) st.truck = open.find(t => t.status === 'live')?.id || open[0]?.id || null;
  const t = st.truck ? { id: st.truck, ...dock.trucks[st.truck] } : null;
  return { dock, open, t, pr: t ? progress(t) : null, halt: t ? openHalt(t) : null, run: t ? running(t) : {} };
}

// ── desktop ────────────────────────────────────────────────────────────
function truckCard(t, on) {
  const pr = progress(t), team = t.team || [], run = running(t), man = t.manifest;
  const stl = t.status === 'live' ? 'Live' : t.status === 'staged' ? 'Staged' : t.status;
  return `<div class="trk${on ? ' on' : ''}" data-act="pick" data-id="${esc(t.id)}"><div class="trk-h"><b>Truck ${esc(truckNo(t.id))}</b><span class="tst ${esc(t.status)}">${esc(stl)}</span><span class="cs-dim">${t.status === 'live' ? `landed ${fmtHM(t.landedAt)}${t.goalAt ? ' · goal ' + fmtHM(t.goalAt) : ''}` : 'staged · goes live when a pallet lands'}</span></div><div class="trk-3">` +
    `<div class="trk-c${man ? '' : ' warn'}"><small>${ic('file')}Manifest</small><b>${man ? esc(man.manNo) : 'Not attached'}</b><span>${man ? `${man.consols.length} consols · ${man.consols.reduce((n, c) => n + c.cartons, 0)}c` : 'lands with Manifests'}</span></div>` +
    `<div class="trk-c"><small>${ic('truck')}Truck</small><b>${t.status === 'live' ? `${pr.count} pallet${pr.count === 1 ? '' : 's'}` : 'Not landed'}</b><span>${t.status === 'live' ? `${pr.count - pr.doneCount} to go` : 'from the planner'}</span></div>` +
    `<div class="trk-c"><small>${ic('users')}Decant</small><b>${t.status === 'live' && pr.total ? `${pr.done} / ${pr.total} · ${pr.pct}%` : team.length ? 'Team staged' : 'No team yet'}</b><div class="dk-team">${team.map(m => `<span class="dk-tc${run[m.pid] ? ' on' : ''}"><span class="av">${esc(who(m))}</span>${run[m.pid] ? `<b>${esc(run[m.pid])}</b>` : ''}</span>`).join('')}</div></div></div></div>`;
}
function dockGrid(t, desk) {
  const g = grid(t), byRef = {}; for (const p of pallets(t)) byRef[p.ref] = p;
  return `<div class="bdk-grid${desk ? ' desk' : ''}" style="grid-template-columns:repeat(${g.cols},1fr)">` + g.refs.map(ref => {
    const p = byRef[ref];
    if (!p) return `<button class="bdk-sq empty" data-act="cell" data-ref="${ref}" title="Land a pallet at ${ref}"><span class="bdk-ref">${ref}</span><span class="bdk-plus">+</span></button>`;
    const s = p.status || 'landed', tg = !desk && st.view === 'run' && st.arm && (startable(p) || (s === 'active' && !openSegs(p).some(x => x.pid === st.arm))), pc = pace(t, p), crew = openSegs(p).map(x => x.pid).join('+');
    return `<button class="bdk-sq marked t-${PT_LETTER[p.ptype] || 'c'} st-${s}${tg ? ' tg' : ''}${p.carryover ? ' co' : ''}${pc ? ' pc-' + pc : ''}${p.suspect ? ' sus' : ''}${st.sel === ref ? ' hit' : ''}" data-act="cell" data-ref="${ref}" title="${ref} · ${esc(PT_NAME[p.ptype] || p.ptype)} · ${p.cartons ?? '–'} cartons · ${s}${p.expectedMins ? ` · est ${p.expectedMins} min` : ''}${p.carryover ? ' · carried over' : ''}${p.suspect ? ' · done very fast: check the times' : ''}"><span class="bdk-ref">${ref}</span><span class="bdk-ct">${p.cartons ?? '–'}</span>${s === 'active' || s === 'paused' ? `<span class="bdk-tm" data-tick="${ref}" data-tick-short="1"></span>` : ''}${crew ? `<span class="bdk-who">${esc(crew)}</span>` : ''}${p.suspect ? '<span class="bdk-flag">⚠</span>' : s === 'active' ? '<span class="bdk-flag">▶</span>' : s === 'done' ? '<span class="bdk-flag">✓</span>' : s === 'paused' ? '<span class="bdk-flag">⏸</span>' : ''}</button>`;
  }).join('') + '</div>';
}
const legend = () => `<span class="bdr-legend">${PTYPES.map(p => `<span><i style="background:${p[2]}"></i>${p[1]}</span>`).join('')}<span><i style="background:#C9F0D8;border:1px solid #86D9A8"></i>Done</span><span><i style="background:#fff;border:2px solid var(--accent)"></i>Decanting</span><span><i style="background:#fff;border:2px solid #7C3AED"></i>Carryover</span><span><i style="background:#fff;border:2px solid #DC2626"></i>Over its estimate</span></span>`;
// Hold-ups: pick a kind, then a reason (halts and transitions) with an
// optional note. A huddle and a team break start straight away.
function holdPicker() {
  const kinds = Object.entries(KIND_NAME).map(([k, v]) => `<button class="chip${st.holdKind === k ? ' on' : ''}" data-act="holdkind" data-kind="${k}">${v}</button>`).join('');
  const reasons = st.holdKind === 'halt' ? HALT_NAME : st.holdKind === 'transition' ? TRANS_NAME : null;
  return `<div class="bdr-reasons">${kinds}</div>` + (st.holdKind ? `<div class="bdr-reasons">${reasons ? Object.entries(reasons).map(([k, v]) => `<button class="chip" data-act="haltgo" data-kind="${st.holdKind}" data-reason="${k}">${v}</button>`).join('') : `<button class="btn sm primary" data-act="haltgo" data-kind="${st.holdKind}" data-reason="${st.holdKind}">Start ${KIND_NAME[st.holdKind].toLowerCase()}</button>`}<input class="bdr-in" data-field="haltnote" maxlength="120" placeholder="Note (optional)"></div>` : '');
}
function holdRow(t, h, live) {
  if (h) return `<div class="bdr-haltrow${h.kind && h.kind !== 'halt' ? ' planned' : ''}">${ic('alert')}<b>${esc(holdName(h))}</b>${h.note ? ` · ${esc(h.note)}` : ''} since ${fmtHM(h.start)} · decant clock stopped<button class="btn sm" data-act="haltend">End ${esc(KIND_NAME[h.kind || 'halt'].toLowerCase())}</button></div>`;
  if (!live) return '';
  return `<div class="bdr-haltrow dim">${ic('clock')}Decant running<button class="btn sm" data-act="halt">${ic('alert')}Hold-up</button><button class="btn sm" data-act="huddleplan">${ic('users')}Book huddle</button></div>${st.halting ? holdPicker() : ''}`;
}
function landForm() {
  return `<div class="bdr-land"><span class="lbl">Land a pallet</span><input class="bdr-in mono" data-field="ref" placeholder="Bay" maxlength="3" title="Grid ref, e.g. A1, or click an empty cell" value="${esc(st.land.ref)}"><span class="bdr-pts">${PTYPES.map(p => `<button class="bdr-pt${st.land.ptype === p[0] ? ' on' : ''}" data-act="ptype" data-pt="${p[0]}"><i style="background:${p[2]}"></i>${p[1]}</button>`).join('')}</span><input class="bdr-in mono" data-field="cartons" inputmode="numeric" placeholder="Cartons" maxlength="3" value="${esc(st.land.cartons)}"><button class="btn primary sm" data-act="land">${ic('plus')}Land</button></div>`;
}
function desktop(ctx) {
  const m = model(ctx), t = m.t, pr = m.pr, live = t?.status === 'live';
  const head = vh('Receiving', sub(fmtDate(todayKey()), `${m.open.length} truck${m.open.length === 1 ? '' : 's'} on the board`, t ? (live ? `T${truckNo(t.id)} live` : `T${truckNo(t.id)} staged`) : 'dock clear'),
    (t ? `<button class="btn" data-act="manpick">${ic('file')}${t.manifest ? 'Manifest ' + esc(t.manifest.manNo) : 'Manifest'}</button><button class="btn" data-act="goal">${ic('clock')}${t.goalAt ? 'Goal ' + fmtHM(t.goalAt) : 'Set goal'}</button>` + (live ? `<button class="btn" data-act="finalise">${ic('check')}Finalise</button>` : `<button class="btn primary" data-act="golive">${ic('truck')}Start receiving T${truckNo(t.id)}</button>`) : '') + `<button class="btn primary" data-act="newtruck">${ic('plus')}New truck</button>`, 'm-receiving');
  if (!t) return head + decantBoard(m.dock, ctx.store.get('plan'), todayKey()) + `<div class="card bdr-empty" style="padding:28px;text-align:center"><div style="font-size:34px;color:var(--faint)">${ic('truck')}</div><b style="display:block;font-size:18px;margin:8px 0 4px">No truck on the dock</b><p class="lbl">Start receiving the next truck here, or let a dock phone land it. The board wakes either way.</p><button class="btn primary" data-act="newtruck">${ic('plus')}Start receiving a truck</button></div>` + heldCard(m.dock);
  const strip = `<div class="trk-strip">${m.open.map(x => truckCard(x, x.id === t.id)).join('')}</div>`;
  const rates = ratesFor(m.dock), man = t.manifest, fc = forecast(t, Date.now(), rates), gp = t.goalAt ? goalPace(t) : null;
  const headcard = `<div class="card bdr-headcard"><div class="bdr-head"><span class="bdr-tile">${ic('truck')}</span><div class="bdr-tt"><b>Truck ${esc(truckNo(t.id))}</b><span class="tst ${esc(t.status)}">${live ? 'Live' : 'Staged'}</span><small>${live ? `landed ${fmtHM(t.landedAt)} · ${pr.count} pallet${pr.count === 1 ? '' : 's'}${pallets(t).some(p => p.carryover) ? ` (${pallets(t).filter(p => p.carryover).length} carryover)` : ''} · ${pr.active} decanting` : 'staged · the first pallet landed makes it live'}${m.halt ? ` · <b style="color:#B91C1C">${esc(holdName(m.halt))}</b>` : ''}</small></div><button class="btn sm" data-act="audit" title="Print the receiving audit">${ic('print')}Audit</button>` +
    `<div class="bdr-chips"><span class="bdr-chip"><span class="l">Manifest</span><span class="v">${man ? `${man.consols.length}<small> cons · ${man.consols.reduce((n, c) => n + c.cartons, 0)}c</small>` : '—'}</span></span><button class="bdr-chip" data-act="setstart" title="When the decant clock started (clear time and rate run from here)"><span class="l">Decant start</span><span class="v">${fmtHM(startOf(t))}${t.decantStartAt ? '' : '<small> landed</small>'}</span></button><span class="bdr-chip"><span class="l">Goal</span><span class="v">${t.goalAt ? fmtHM(t.goalAt) : '—'}</span></span><span class="bdr-chip"><span class="l">Forecast</span><span class="v">${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}${fc.at && t.goalAt ? `<small class="${fc.at > Date.parse(t.goalAt) ? 'c-red' : 'c-green'}"> ${fc.at > Date.parse(t.goalAt) ? 'behind' : 'ahead'}</small>` : ''}</span></span><button class="bdr-chip${t.receivingConfirmed ? ' ok' : ''}" data-act="received" title="The receiver hands the truck over: the layout is set"><span class="l">Receiving</span><span class="v">${t.receivingConfirmed ? `${ic('check')}Handed over ${fmtHM(t.receivedAt)}` : 'Hand over'}</span></button></div></div>` +
    `<div class="bdr-prog"><b class="bdr-big">${pr.done}</b><span class="bdr-of">/ ${pr.total} cartons</span><span class="bdr-pct">${pr.pct}%</span></div><div class="bdr-bar">${gp !== null ? `<b class="bdr-pace" style="left:${Math.round(gp * 100)}%" title="Where the team should be by now to make the goal"></b>` : ''}<i style="width:${pr.pct}%"></i></div></div>`;
  const dock = `<div class="card kpi dk rcv bdr-dock"><div class="kh">${ic('box')}<h3>The dock</h3>${legend()}</div>${live ? landForm() : ''}${dockGrid(t, true)}${holdRow(t, m.halt, live)}</div>`;
  const team = t.team || [];
  const teamcard = `<div class="card"><div class="ch"><h3>${live ? 'Decanting now' : 'Team staged'}</h3><span class="cs-dim">${team.length ? `${team.length} on the dock` : 'no team yet'}</span></div>` +
    (team.length ? `<div class="bdr-team">${team.map(mm => { const br = onBreak(t, mm.pid); return `<div class="bdr-tc${m.run[mm.pid] ? ' on' : ''}${br ? ' brk' : ''}"><b class="bdr-who">${esc(who(mm))}</b><span class="bdr-state">${br ? `on a break since ${fmtHM(br.start)}` : m.run[mm.pid] ? `decanting <b>${esc(m.run[mm.pid])}</b>` : 'between pallets'}</span><select class="bdr-role" data-act-change="role" data-pid="${esc(mm.pid)}" aria-label="Role for ${esc(mm.pid)}">${Object.entries(ROLE_NAME).map(([k, v]) => `<option value="${k}"${(mm.role || 'cutter') === k ? ' selected' : ''}>${v}</option>`).join('')}</select>${live ? `<button class="btn sm" data-act="${br ? 'break-end' : 'break-start'}" data-pid="${esc(mm.pid)}">${br ? 'Back' : 'Break'}</button>` : ''}<button class="bdr-x" data-act="team-drop" data-pid="${esc(mm.pid)}" title="Remove from this truck">${ic('x')}</button></div>`; }).join('')}</div>` : '') +
    `<div class="bdr-teamadd"><input class="bdr-in mono" data-field="team" placeholder="Add a D-number, e.g. D4" maxlength="6" autocapitalize="characters"><button class="btn sm" data-act="team-add">${ic('plus')}Add</button></div><p class="lbl">D-numbers only: no names are kept on the dock.</p></div>`;
  const landed = pallets(t).slice().sort((a, b) => (a.landedAt || '').localeCompare(b.landedAt || ''));
  const landedcard = `<div class="card"><div class="ch"><h3>Landed today</h3><span class="cs-dim">${landed.length ? `${landed.length} pallets · newest last` : `Truck ${truckNo(t.id)}`}</span></div>${landed.length ? `<div class="list rcv-list bdr-landed">${landed.map(p => `<div class="li${st.sel === p.ref ? ' sel' : ''}" data-act="cell" data-ref="${esc(p.ref)}"><span class="loc">${esc(p.ref)}</span><span class="nm">${esc(PT_NAME[p.ptype] || p.ptype)}${p.carryover ? ' · carryover' : ''} · ${p.cartons ?? '–'} cartons${p.assignedTo ? ` · ${esc(p.assignedTo)}` : ''}${sightBadge(p)}</span><span class="rcv-st ${p.status}">${p.status === 'done' ? 'Done' : p.status === 'active' ? 'Decanting' : p.status === 'paused' ? 'Paused' : 'Waiting'}</span><span class="rt">${p.carryover ? 'Yesterday' : fmtHM(p.landedAt)}</span></div>`).join('')}</div>` : `<div class="pempty">Nothing landed yet</div>`}${st.sel && t.pallets[st.sel] ? palletPanel(t, t.pallets[st.sel], true) : ''}</div>`;
  const picker = !st.manPick ? '' : (() => {
    const idx = manifestIndex(m.dock).sort((a, b) => (a.truck ? 1 : 0) - (b.truck ? 1 : 0));
    return `<div class="card bdr-manpick"><div class="ch"><h3>${t.manifest ? `Manifest ${esc(t.manifest.manNo)} on Truck ${esc(truckNo(t.id))}` : `Attach a manifest to Truck ${esc(truckNo(t.id))}`}</h3><span class="go" data-act="manpick">Close</span></div>` +
      (t.manifest ? `<p class="lbl">${t.manifest.consols.length} consols · ${t.manifest.consols.reduce((n, c) => n + c.cartons, 0)} cartons · attached ${fmtHM(t.manifest.attachedAt)}. Attaching another replaces it.</p>` : '') +
      `<div class="list">${idx.map(x => `<div class="li"><span class="loc">${esc(x.manNo)}</span><span class="nm">${x.consols} consols · ${x.totalCartons} cartons${x.despatch ? ' · despatch ' + esc(x.despatch) : ''}${x.truck ? ` · on Truck ${esc(truckNo(x.truck))}` : ''}</span><button class="btn sm${x.truck === t.id ? '' : ' primary'}" data-act="manattach" data-man="${esc(x.manNo)}"${x.truck === t.id ? ' disabled' : ''}>${x.truck === t.id ? 'Attached' : 'Attach'}</button></div>`).join('') || '<div class="ohint">Nothing in the library yet.</div>'}</div>` +
      `<div class="bdr-manup"><label class="btn" style="cursor:pointer"><input type="file" accept=".xls,.xlsx,.csv" data-field="manfile" style="display:none">${ic('file')}Upload today's report and attach it</label><span class="cs-dim">The DC's Manifest Report .xls from the email. It is published to the library and attached to this truck.</span></div></div>`;
  })();
  const nUn = man ? unlinked(t).length : 0;
  const late = !man ? '' : st.linking ? linkSheet(t, rates) : nUn && pr.count ? `<div class="card ll-warn"><div class="ch"><h3>${ic('alert')}${nUn} pallet${nUn === 1 ? '' : 's'} not linked to manifest ${esc(man.manNo)}</h3><button class="btn sm primary" data-act="ll-open">Link landed pallets →</button></div><p class="lbl">Landed before the manifest was attached, or without a readable label. Link them so the reconciliation and the clear forecast use the manifest's cartons.</p></div>` : '';
  return head + strip + picker + late + `<div class="bdr-stack">${needsTake5(t) && (t.team || []).length ? take5Card(t) : ''}${headcard}${dock}${teamcard}${planCard(t, rates)}${landedcard}</div>`;
}

// One pallet's controls: type, cartons, note, decant verbs, scanned
// consolidations. Desktop and phone share it.
function palletPanel(t, p, desk) {
  const team = t.team || [], s = p.status || 'landed', on = openSegs(p).map(x => x.pid), run = running(t);
  // The picker offers who can take it: on the team, not on a break, not on another pallet.
  const free = team.filter(m => !onBreak(t, m.pid) && (!run[m.pid] || run[m.pid] === p.ref) && !on.includes(m.pid));
  const picker = team.length ? (free.length ? `<select class="bdr-in" data-field="pid">${free.map(m => `<option value="${esc(m.pid)}"${p.assignedTo === m.pid ? ' selected' : ''}>${esc(who(m))}${m.role && m.role !== 'cutter' ? ' · ' + ROLE_NAME[m.role] : ''}</option>`).join('')}</select>` : '<span class="cs-dim">Everyone is busy or on a break.</span>') : `<span class="cs-dim">No crew on this truck yet: add the team first.</span>`;
  const undo = p.segments.length ? `<button class="btn sm" data-act="dec" data-dec="unstart" title="Undo the last start">↶ Undo start</button>` : '';
  const verbs = s === 'active' ? `<button class="btn sm" data-act="dec" data-dec="pause">⏸ Pause</button><button class="btn primary sm" data-act="dec" data-dec="done">${ic('check')}Done</button>${free.length ? `<button class="btn sm" data-act="dec" data-dec="join">＋ Join</button><button class="btn sm" data-act="dec" data-dec="handover">⇄ Hand over</button>` : ''}${on.length > 1 ? on.map(pid => `<button class="btn sm" data-act="dec" data-dec="leave" data-pid="${esc(pid)}">${esc(pid)} steps off</button>`).join('') : ''}${undo}`
    : s === 'paused' ? `<button class="btn primary sm" data-act="dec" data-dec="resume"${free.length ? '' : ' disabled'}>▶ Resume</button><button class="btn sm" data-act="dec" data-dec="done">${ic('check')}Done</button>${undo}`
    : s === 'done' ? `<span class="status good">Decanted ${fmtHM(p.doneAt)}</span><button class="btn sm" data-act="dec" data-dec="reopen">↩ Reopen</button>`
    : `<button class="btn primary sm" data-act="dec" data-dec="start"${free.length ? '' : ' disabled'}>▶ Start</button>`;
  const worked = p.segments.length ? `<div class="bdk-clock pc-${pace(t, p) || 'none'}" data-tick="${esc(p.ref)}"></div>` : '';
  const sus = p.suspect ? `<div class="bdk-sus">${ic('alert')}<span>Done in ${fmtMins(workedMin(t, p, Date.parse(p.doneAt)))} against an estimate of ${p.expectedMins} min. Probably a missed start: its time credits nobody until the times are fixed or it is confirmed.</span><button class="btn sm" data-act="dec" data-dec="fix">Fix times</button><button class="btn sm" data-act="dec" data-dec="quick">It was quick</button></div>` : '';
  const cons = t.manifest?.consols || [];
  const scans = p.consolIds.map(id => { const c = cons.find(x => x.id === id); return `<div class="bdk-vrow ok"><span>✓</span><b class="mono">${esc(id)}</b><span>${c ? `${c.cartons} ctn${c.dept ? ' · ' + esc(c.dept) : ''}` : 'on this pallet'}</span></div>`; }).join('') +
    p.scanIds.filter(id => !p.consolIds.includes(id)).map(id => `<div class="bdk-vrow"><span>·</span><b class="mono">${esc(id)}</b><span>saved · matches when a manifest is attached</span></div>`).join('') +
    st.pending.filter(x => x.ref === p.ref).map((x, i) => `<div class="bdk-vrow warn"><span>⚠</span><b class="mono">${esc(x.id)}</b><span>not on this manifest</span><span class="bdk-vbtns"><button class="btn sm" data-act="pend-add" data-i="${i}">Add &amp; flag</button><button class="btn sm" data-act="pend-drop" data-i="${i}">Ignore</button></span></div>`).join('');
  return `<div class="bdk-pal${desk ? ' desk' : ''}"><div class="bdk-pal-h"><b>Pallet ${esc(p.ref)}</b><span class="tst ${s === 'done' ? 'done' : s === 'active' ? 'live' : 'staged'}">${s}</span>${p.carryover ? '<span class="status warn">carryover</span>' : ''}${sightBadge(p)}<button class="ibtn" data-act="closepal" title="Close">${ic('x')}</button></div>` +
    `<div class="bdk-pal-b"><div class="bdk-ptrow">${PTYPES.map(x => `<button class="bdr-pt${p.ptype === x[0] ? ' on' : ''}" data-act="pal-pt" data-pt="${x[0]}"><i style="background:${x[2]}"></i>${x[1]}</button>`).join('')}</div>` +
    `<div class="bdk-fields"><label>Cartons<input class="bdr-in mono" data-field="pcartons" inputmode="numeric" maxlength="3" value="${p.cartons ?? ''}"></label><label>Est. mins<input class="bdr-in mono${p.expectedBasis === 'manual' ? '' : ' auto'}" data-field="pexp" inputmode="numeric" maxlength="4" value="${p.expectedMins ?? ''}" title="${p.expectedBasis === 'manual' ? 'set by hand' : `auto · ${t.minsPerCarton ?? STD_MINS_PER_CARTON} min per carton`}"></label><label>Note<input class="bdr-in" data-field="pnote" maxlength="120" placeholder="optional" value="${esc(p.note || '')}"></label></div>` +
    `<div class="bdk-scanrow"><input class="bdr-in mono" data-field="pscan" inputmode="numeric" enterkeyhint="done" placeholder="Scan or type a pallet label" autocomplete="off">${camButton('pscan')}<button class="btn sm" data-act="pscan">${ic('barcode')}Add</button></div>${scans ? `<div class="bdk-verified">${scans}</div>` : ''}` +
    palletContents(t, p) + `<div class="bdk-decant"><div class="bdk-declab">Decant${on.length ? ` · ${esc(on.join(' + '))}` : p.assignedTo ? ` · ${esc(p.assignedTo)}` : ''}</div>${worked}${sus}${s !== 'done' ? picker : ''}${desk ? queuePicker(t, p) : ''}<div class="bdk-verbs">${verbs}</div>${st.fix === p.ref ? fixTimes(p) : ''}</div>` +
    `<div class="bdk-palacts"><button class="btn sm" data-act="pal-save">${ic('check')}Update</button>${p.segments.length && st.fix !== p.ref ? `<button class="btn sm" data-act="dec" data-dec="fix">${ic('clock')}Fix times</button>` : ''}${s !== 'done' ? `<button class="btn sm" data-act="dec" data-dec="move">⇲ Move</button>` : ''}<button class="btn sm" data-act="pal-remove">${ic('trash')}Remove</button></div></div></div>`;
}
// Fix times: each stretch of work (who, from, to) and the done time, as
// times of day on the day they happened.
const hmOf = iso => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function fixTimes(p) {
  return `<div class="bdk-fix"><div class="bdk-declab">Fix times</div>${p.segments.map((x, i) => `<div class="bdk-fixrow"><b class="mono">${esc(x.pid)}</b><label>from<input type="time" class="bdr-in" data-fix="start" data-i="${i}" value="${hmOf(x.start)}"></label><label>to<input type="time" class="bdr-in" data-fix="end" data-i="${i}" value="${hmOf(x.end)}"${x.end ? '' : ' placeholder="running"'}></label>${x.bf ? '<span class="cs-dim">estimated</span>' : ''}</div>`).join('')}` +
    (p.status === 'done' ? `<div class="bdk-fixrow"><b>Done</b><label>at<input type="time" class="bdr-in" data-fix="done" value="${hmOf(p.doneAt)}"></label></div>` : '') +
    `<div class="bdk-verbs"><button class="btn sm primary" data-act="dec" data-dec="fixsave">${ic('check')}Save times</button><button class="btn sm" data-act="dec" data-dec="fixcancel">Cancel</button></div></div>`;
}

// Pallets held at the last finalise, between trucks: on the board until
// the next truck takes them.
function heldCard(dock) {
  const h = dock.rollover; if (!h) return '';
  const list = Object.values(h.pallets).sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
  return `<div class="card bdr-held"><div class="ch"><h3>Held for the next truck</h3><span class="cs-dim">from Truck ${esc(truckNo(h.from))} · ${list.length} pallet${list.length === 1 ? '' : 's'} · ${list.reduce((n, p) => n + (p.cartons || 0), 0)} ctn</span></div>` +
    `<div class="list">${list.map(p => `<div class="li"><span class="loc">${esc(p.ref)}</span><span class="nm">${esc(PT_NAME[p.ptype] || p.ptype)} · ${p.cartons ?? '–'} cartons${p.carriedFrom && p.carriedFrom !== h.from ? ` · first landed on Truck ${esc(truckNo(p.carriedFrom))}` : ''}</span><span class="rcv-st ${esc(p.status)}">${p.status === 'paused' ? 'Paused' : 'Waiting'}</span></div>`).join('')}</div><p class="lbl">They stay on their bays and join the next truck when it starts.</p></div>`;
}

// ── phone ──────────────────────────────────────────────────────────────
function mobile(ctx) {
  const m = model(ctx), t = m.t, pr = m.pr;
  const chips = `<div class="bdk-tchips">${m.open.map(x => `<button class="bdk-tchip${x.id === st.truck ? ' on' : ''}" data-act="pick" data-id="${esc(x.id)}">Truck ${esc(truckNo(x.id))}<i>${esc(x.status)}</i></button>`).join('')}<button class="bdk-tchip add" data-act="newtruck">+ New truck</button></div>`;
  if (!t) return mhead('Receiving', 'No truck on the dock') + chips + `<div class="mv-note">${ic('truck')}Tap <b>New truck</b> when the first pallet comes off. The desktop board follows.</div>` + heldCard(m.dock);
  const run = st.view === 'run';
  const head = mhead(`Truck ${esc(truckNo(t.id))}`, t.status === 'live' ? `landed ${fmtHM(t.landedAt)}${t.goalAt ? ' · goal ' + fmtHM(t.goalAt) : ''}` : 'staged · land a pallet to go live');
  const toggle = `<div class="bdk-vt"><button class="${run ? '' : 'on'}" data-act="view" data-mode="receive">Receive</button><button class="${run ? 'on' : ''}" data-act="view" data-mode="run">Run</button></div>`;
  const prog = `<div class="bdk-prog"><div class="nums"><b>${pr.done}</b><span>/ ${pr.total} ctn decanted</span></div><div class="bar"><i style="width:${pr.pct}%"></i></div><div class="sub">${pr.count} pallet${pr.count === 1 ? '' : 's'} landed · ${pr.active} decanting${t.status !== 'live' ? ` · <b>${esc(t.status)}</b>` : ''}</div></div>`;
  const runbar = run ? (m.halt ? `<div class="bdk-runbar"><div class="bdk-runtile warn" style="flex:1"><small>${esc(holdName(m.halt))}</small><b>since ${fmtHM(m.halt.start)}</b></div><button class="bdk-runtile" data-act="haltend"><small>Decant</small><b>▶ Resume</b></button></div>`
      : `<div class="bdk-runbar"><button class="bdk-runtile" data-act="goal"><small>Goal</small><b>${t.goalAt ? fmtHM(t.goalAt) : 'Set'}</b></button><button class="bdk-runtile warn" data-act="halt"><small>Decant</small><b>⏸ Hold-up</b></button></div>${st.halting ? holdPicker() : ''}`) +
    `<div class="bdk-hint${st.arm ? ' on' : ''}">${st.arm ? 'Armed: tap a lit square to start it (or join it), or the chip again to disarm.' : 'Tap a crew member, then a square, to start decanting it.'}</div>` : '';
  const team = t.team || [];
  const strip = run ? (team.length ? `<div class="bdk-strip">${team.map(mm => { const br = onBreak(t, mm.pid); return `<button class="bdk-fchip${st.arm === mm.pid ? ' armed' : ''}${br ? ' brk' : ''}" data-act="arm" data-pid="${esc(mm.pid)}"${br ? ' disabled' : ''}><i class="${m.run[mm.pid] ? 'a' : ''}"></i><b>${esc(who(mm))}</b><span>${br ? 'on a break' : m.run[mm.pid] ? '▶ ' + esc(m.run[mm.pid]) : 'free'}</span></button>`; }).join('')}</div>` : `<div class="mv-note">${ic('users')}No crew on this truck yet. Add the team on the desktop board.</div>`) : '';
  const sel = st.sel ? (t.pallets[st.sel] ? palletPanel(t, t.pallets[st.sel], false) : landPanel(st.sel)) : '';
  const tools = `<div class="ps-tools"><button class="btn sm${ss.open ? ' primary' : ''}" data-act="ps-open">${ic('search')}Search</button><button class="btn sm${ss.info ? ' primary' : ''}" data-act="ps-info">${ic('packages')}Manifest${t.manifest ? ' ' + esc(t.manifest.manNo) : ''}</button></div>`;
  return head + chips + (needsTake5(t) && (t.team || []).length ? take5Card(t) : '') + toggle + tools + searchSheet(ctx, t) + infoSheet(t) + prog + runbar + `<div class="bdk">${dockGrid(t, false)}</div>` + strip + sel;
}
function landPanel(ref) {
  return `<div class="bdk-pal"><div class="bdk-pal-h"><b>Land pallet ${esc(ref)}</b><button class="ibtn" data-act="closepal" title="Close">${ic('x')}</button></div><div class="bdk-pal-b"><div class="bdk-ptrow">${PTYPES.map(x => `<button class="bdr-pt${st.land.ptype === x[0] ? ' on' : ''}" data-act="ptype" data-pt="${x[0]}"><i style="background:${x[2]}"></i>${x[1]}</button>`).join('')}</div>` +
    `<div class="bdk-fields"><label>Cartons<input class="bdr-in mono" data-field="cartons" inputmode="numeric" maxlength="3" placeholder="0" value="${esc(st.land.cartons)}"></label><label>Note<input class="bdr-in" data-field="note" maxlength="120" placeholder="optional"></label></div>` +
    `<div class="bdk-palacts"><button class="btn primary" data-act="land" data-ref="${esc(ref)}">${ic('plus')}Land at ${esc(ref)}</button></div></div></div>`;
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
    if (act === 'manattach') { a.disabled = true; await attachManifest(ctx, id, a.dataset.man); st.manPick = false; toast(`${a.dataset.man} attached to Truck ${truckNo(id)}`); return; }
    if (act === 'view') { st.view = a.dataset.mode; st.arm = null; st.sel = null; return ctx.rerender(); }
    // One truck at a time: an open truck is finalised by the new one, and its
    // unfinished pallets come with it on their bays. Pallets held at the last
    // finalise join the new truck unless the receiver starts it empty.
    if (act === 'newtruck') {
      const nid = nextTruckId(m.dock), cur = t || m.open[0], payload = { landedAt: new Date().toISOString() };
      if (cur) {
        const left = unfinished(cur);
        if (left.some(p => p.status === 'active')) return toast(`Pause or finish what is being decanted on Truck ${truckNo(cur.id)} first`, 'bad');
        const ctn = left.reduce((n, p) => n + (p.cartons || 0), 0);
        if (!confirm(left.length ? `Truck ${truckNo(cur.id)} is still open with ${left.length} unfinished pallet${left.length === 1 ? '' : 's'} (${ctn} cartons).\n\nFinalise it and carry ${left.length === 1 ? 'that pallet' : 'them'} onto Truck ${truckNo(nid)}? ${left.length === 1 ? 'It stays' : 'They stay'} on the same bays.` : `Finalise Truck ${truckNo(cur.id)} and start Truck ${truckNo(nid)}?`)) return;
        payload.carryFrom = cur.id;
      } else if (m.dock.rollover) {
        const n = Object.keys(m.dock.rollover.pallets).length;
        if (!confirm(`${n} pallet${n === 1 ? '' : 's'} held from Truck ${truckNo(m.dock.rollover.from)} join${n === 1 ? 's' : ''} Truck ${truckNo(nid)}.\n\nOK takes ${n === 1 ? 'it' : 'them'} on. Cancel starts the truck empty and lets ${n === 1 ? 'it' : 'them'} go.`)) payload.takeRollover = false;
      }
      await dispatch(ctx, 'truck.create', { truck: nid }, payload); await dispatch(ctx, 'truck.setLive', { truck: nid }, {});
      st.truck = nid; st.sel = null; toast(payload.carryFrom ? `Truck ${truckNo(payload.carryFrom)} finalised · Truck ${truckNo(nid)} is receiving` : `Truck ${truckNo(nid)} is receiving`); return;
    }
    if (act === 'golive') { await dispatch(ctx, 'truck.setLive', { truck: id }, {}); return; }
    if (act === 'goal') { const cur = t.goalAt ? fmtHM(t.goalAt) : ''; const v = prompt('Finish goal, time of day (HH:MM). Blank to clear:', cur); if (v === null) return; let goal = null; if (v.trim()) { const mm = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!mm) return toast('Enter a time like 14:30', 'bad'); const d = new Date(); d.setHours(+mm[1], +mm[2], 0, 0); if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1); goal = d.toISOString(); } await dispatch(ctx, 'truck.setGoal', { truck: id }, { goal }); toast(goal ? `Goal ${fmtHM(goal)}` : 'Goal cleared'); return; }
    if (act === 'finalise') {
      const pr = m.pr, left = unfinished(t);
      if (left.some(p => p.status === 'active')) return toast('Pause or finish what is being decanted first', 'bad');
      if (!confirm(`Finalise truck ${truckNo(id)}? ${pr.done} of ${pr.total} cartons decanted. It moves to history and leaves the board.` + (left.length ? `\n\n${left.length} unfinished pallet${left.length === 1 ? ' is' : 's are'} held for the next truck and stay${left.length === 1 ? 's' : ''} on ${left.length === 1 ? 'its bay' : 'their bays'}.` : ''))) return;
      await dispatch(ctx, 'truck.finalise', { truck: id }, left.length ? { rollover: true } : {}); st.truck = null; st.sel = null;
      toast(left.length ? `Truck ${truckNo(id)} finalised · ${left.length} pallet${left.length === 1 ? '' : 's'} held for the next truck` : `Truck ${truckNo(id)} finalised`); return;
    }
    if (act === 'halt') { st.halting = !st.halting; st.holdKind = null; return ctx.rerender(); }
    if (act === 'holdkind') { st.holdKind = st.holdKind === a.dataset.kind ? null : a.dataset.kind; return ctx.rerender(); }
    if (act === 'haltgo') {
      const kind = a.dataset.kind || 'halt', note = field('haltnote').trim();
      await dispatch(ctx, 'halt.start', { truck: id }, { kind, reason: a.dataset.reason, ...(note ? { note } : {}) });
      st.halting = false; st.holdKind = null; toast(`Decant clock stopped · ${holdName({ kind, reason: a.dataset.reason })}`); return;
    }
    if (act === 'haltend') { await dispatch(ctx, 'halt.end', { truck: id }, {}); toast('Decant running'); return; }
    if (act === 'huddleplan') { const v = prompt('Book the opening huddle: minutes from decant start (0 clears it)', '10'); if (v === null) return; const mins = Number(v); if (!(mins >= 0 && mins <= 120)) return toast('Minutes from 0 to 120', 'bad'); await dispatch(ctx, 'huddle.plan', { truck: id }, { mins }); toast(mins ? `Opening huddle booked · ${mins} min` : 'Opening huddle cleared'); return; }
    if (act === 'setstart') {
      const v = prompt('When did the decant start? Time of day (HH:MM). Blank uses the landed time.', t.decantStartAt ? fmtHM(t.decantStartAt) : ''); if (v === null) return;
      let at = null; if (v.trim()) { const mm = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!mm) return toast('Enter a time like 06:30', 'bad'); const d = new Date(t.landedAt || Date.now()); d.setHours(+mm[1], +mm[2], 0, 0); at = d.toISOString(); }
      await dispatch(ctx, 'truck.setStart', { truck: id }, { at }); toast(at ? `Decant start ${fmtHM(at)}` : 'Decant start follows the landed time'); return;
    }
    if (act === 'received') { await dispatch(ctx, 'receiving.confirm', { truck: id }, { confirmed: !t.receivingConfirmed }); toast(t.receivingConfirmed ? 'Hand-over undone' : 'Handed over: the layout is set'); return; }
    if (act === 'break-start' || act === 'break-end') { const pid = a.dataset.pid; if (act === 'break-start' && m.run[pid]) return toast(`${pid} is on ${m.run[pid]}: take them off it first (steps off, or pause)`, 'bad'); await dispatch(ctx, act === 'break-start' ? 'break.start' : 'break.end', { truck: id }, { pid }); toast(act === 'break-start' ? `${pid} is on a break: their clock stops` : `${pid} is back`); return; }
    if (act === 'audit') return printAudit(t, m.dock);
    if (act === 'ptype') { st.land.ref = field('ref') || st.land.ref; st.land.cartons = field('cartons'); st.land.ptype = a.dataset.pt; return ctx.rerender(); }
    if (act === 'team-add') { const v = field('team').trim(); if (!v) return; const pid = dnumId(v); if (!pid) return toast('Enter a D-number, like D4. Names are not kept.', 'bad'); if ((t.team || []).some(x => x.pid === pid)) return toast(`${pid} is already on the truck`); await dispatch(ctx, 'truck.team.set', { truck: id }, { team: [...(t.team || []), { pid }] }); return; }
    if (act === 'team-drop') { await dispatch(ctx, 'truck.team.set', { truck: id }, { team: (t.team || []).filter(x => x.pid !== a.dataset.pid) }); return; }
    if (act === 'cell') {
      const ref = a.dataset.ref, p = t.pallets[ref];
      if (!ctx.isMobile) { if (p) { st.sel = st.sel === ref ? null : ref; } else { st.land.ref = ref; st.land.cartons = field('cartons'); st.sel = null; } ctx.rerender(); if (!p) root.querySelector('[data-field="cartons"]')?.focus(); return; }
      if (st.view === 'run' && st.arm && p && (startable(p) || p.status === 'active')) {
        const pid = st.arm; st.arm = null;
        if (p.status === 'active') { await dispatch(ctx, 'pallet.join', { truck: id, bay: ref }, { pid }); toast(`${pid} joined ${ref}`, '', { label: 'Undo', run: () => dispatch(ctx, 'pallet.unstart', { truck: id, bay: ref }, {}).catch(e => toast(e.message, 'bad')) }); return; }
        if (p.status !== 'paused' && !guard(t, pid, ref, rates, true)) return;
        await dispatch(ctx, p.status === 'paused' ? 'pallet.resume' : 'pallet.start', { truck: id, bay: ref }, { pid });
        toast(`${pid} on ${ref}`, '', { label: 'Undo', run: () => dispatch(ctx, 'pallet.unstart', { truck: id, bay: ref }, {}).catch(e => toast(e.message, 'bad')) }); return;
      }
      if (!p && t.status !== 'live') return toast('Land the first pallet after Start receiving, or tap New truck', 'bad');
      st.sel = st.sel === ref ? null : ref; ctx.rerender(); if (!p) root.querySelector('[data-field="cartons"]')?.focus(); return;
    }
    if (act === 'closepal') { st.sel = null; return ctx.rerender(); }
    if (act === 'land') {
      const ref = (a.dataset.ref || field('ref') || st.land.ref).trim().toUpperCase();
      if (!/^[A-Z]\d{1,2}$/.test(ref)) return toast('Pick a bay like A1, or click an empty cell', 'bad');
      const cartons = num(field('cartons')), note = field('note');
      await dispatch(ctx, 'pallet.land', { truck: id, bay: ref }, { ptype: st.land.ptype, cartons, note });
      st.land = { ref: '', ptype: st.land.ptype, cartons: '' }; st.sel = ctx.isMobile ? ref : null; toast(`Pallet landed at ${ref}`); return;
    }
    if (act === 'arm') { st.arm = st.arm === a.dataset.pid ? null : a.dataset.pid; return ctx.rerender(); }
    if (act === 'pal-pt') { await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { ptype: a.dataset.pt }); return; }
    if (act === 'pal-save') { const exp = root.querySelector('[data-field="pexp"]'), manual = exp && !exp.classList.contains('auto') || (exp && exp.value && Number(exp.value) !== t.pallets[st.sel].expectedMins); await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { cartons: num(field('pcartons')), note: field('pnote'), expectedMins: manual ? num(field('pexp')) : null }); toast('Pallet updated'); return; }
    if (act === 'pal-remove') { if (!confirm(`Remove pallet ${st.sel}?`)) return; await dispatch(ctx, 'pallet.remove', { truck: id, bay: st.sel }, {}); st.sel = null; toast('Pallet removed'); return; }
    if (act === 'dec') {
      const kind = a.dataset.dec, p = t.pallets[st.sel];
      const B = { truck: id, bay: st.sel }, ref = st.sel, undoStart = { label: 'Undo', run: () => dispatch(ctx, 'pallet.unstart', B, {}).catch(e => toast(e.message, 'bad')) };
      if (kind === 'start' || kind === 'resume') { const pid = field('pid') || p.assignedTo; if (!pid) return toast('Pick who is decanting first', 'bad'); if (kind === 'start' && !guard(t, pid, ref, rates, true)) return; await dispatch(ctx, kind === 'start' ? 'pallet.start' : 'pallet.resume', B, { pid }); toast(`${pid} on ${ref}`, '', undoStart); return; }
      if (kind === 'join') { const pid = field('pid'); if (!pid) return toast('Pick who joins', 'bad'); await dispatch(ctx, 'pallet.join', B, { pid }); toast(`${pid} joined ${ref}`, '', undoStart); return; }
      if (kind === 'handover') { const pid = field('pid'); if (!pid) return toast('Pick who takes it', 'bad'); await dispatch(ctx, 'pallet.handover', B, { toPid: pid }); toast(`${ref} handed to ${pid}`); return; }
      if (kind === 'leave') { await dispatch(ctx, 'pallet.leave', B, { pid: a.dataset.pid }); toast(`${a.dataset.pid} stepped off ${ref}`); return; }
      if (kind === 'unstart') { await dispatch(ctx, 'pallet.unstart', B, {}); toast('Last start undone'); return; }
      if (kind === 'pause') return dispatch(ctx, 'pallet.pause', B, {});
      if (kind === 'done') {
        await dispatch(ctx, 'pallet.done', B, {}); if (ctx.isMobile) st.sel = null;
        const q = model(ctx).t?.pallets[ref];
        toast(q?.suspect ? `${ref} done very fast: check its times` : `${ref} decanted`, q?.suspect ? 'bad' : '', { label: 'Undo', run: () => dispatch(ctx, 'pallet.reopen', B, {}).catch(e => toast(e.message, 'bad')) }); return;
      }
      if (kind === 'reopen') return dispatch(ctx, 'pallet.reopen', B, {});
      if (kind === 'quick') { await dispatch(ctx, 'pallet.update', B, { suspectOk: true }); toast(`${ref} confirmed: its time counts`); return; }
      if (kind === 'move') { const to = (prompt(`Move pallet ${ref} to which empty square?`, '') || '').trim().toUpperCase(); if (!to) return; await dispatch(ctx, 'pallet.move', B, { to }); st.sel = to; toast(`${ref} moved to ${to}`); return; }
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
        st.fix = null; const q = model(ctx).t?.pallets[ref]; toast(q?.suspect ? 'Times saved: still very fast for its size' : 'Times saved'); return;
      }
    }
    if (act === 'pscan') {
      const raw = field('pscan').replace(/\D/g, ''); if (raw.length < 9) return toast('A pallet label has at least 9 digits', 'bad');
      const id9 = raw.slice(-9);
      try { const was = sightOf(t.pallets[st.sel]); await dispatch(ctx, 'pallet.scan', { truck: id, bay: st.sel }, { code: raw }); sightToast(ctx, st.sel, was) || toast(`${id9} on ${st.sel}`); }
      catch (e) { if (e.code === 'not_on_manifest') { st.pending.push({ ref: st.sel, id: id9 }); ctx.rerender(); toast(`${id9} is not on this manifest. Old label from a reused tub?`, 'bad'); } else throw e; }
      return;
    }
    if (act === 'pend-add') { const x = st.pending.filter(y => y.ref === st.sel)[+a.dataset.i]; st.pending = st.pending.filter(y => y !== x); const p = t.pallets[st.sel], was = sightOf(p); await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { scanIds: [...p.scanIds, x.id] }); sightToast(ctx, st.sel, was) || toast(`${x.id} flagged in the receiving audit`); return; }
    if (act === 'll-open' || act === 'll-close') { st.linking = act === 'll-open'; return ctx.rerender(); }
    if (act === 'll-apply') { await applyLinks(ctx, t, ratesFor(ctx.store.get('dock'))); st.linking = false; return ctx.rerender(); }
    if (act === 'pend-drop') { const x = st.pending.filter(y => y.ref === st.sel)[+a.dataset.i]; st.pending = st.pending.filter(y => y !== x); return ctx.rerender(); }
  } catch (e) { toast(e.message, 'bad'); }
}

export default {
  id: 'receiving', title: 'Receiving', icon: 'm-receiving', area: 'backdock',
  desktop(ctx) { return desktop(ctx); },
  mobile(ctx) { return mobile(ctx); },
  mount(ctx, root) {
    root.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a) onAct(ctx, a, root); });
    root.addEventListener('input', e => onSearchInput(ctx, e, root));
    root.addEventListener('change', e => { if (e.target.dataset.ll != null) linkPick(e.target.dataset.ll, e.target.value); });
    root.addEventListener('change', async e => {
      if (!e.target.matches('[data-field="manfile"]')) return;
      const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
      const t = model(ctx).t; if (!t) return;
      try { const r = await previewManifest(ctx, f, { attachTo: t.id }); if (!r) return; st.manPick = false; ctx.rerender(); toast(`Manifest ${r.manNo} attached · ${r.consols} consols, ${r.totalCartons} cartons`); }
      catch (err) { toast(`Could not use ${f.name}: ${err.message}`, 'bad'); }
    });
    root.addEventListener('change', async e => {
      const t = model(ctx).t; if (!t) return;
      try { await onPlanChange(ctx, t, e.target, ratesFor(ctx.store.get('dock')), () => ctx.rerender()); } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    root.addEventListener('change', async e => {
      const sel = e.target.closest('[data-act-change="role"]'); if (!sel) return;
      const t = model(ctx).t; if (!t) return;
      try { await dispatch(ctx, 'truck.team.set', { truck: t.id }, { team: t.team.map(m => ({ ...m, role: m.pid === sel.dataset.pid ? sel.value : m.role || 'cutter' })) }); toast(`${sel.dataset.pid} is ${ROLE_NAME[sel.value].toLowerCase()}`); }
      catch (err) { toast(err.message, 'bad'); }
    });
    // The live clocks: worked time on each running pallet, every second,
    // without re-rendering the board.
    const tick = () => {
      const t = model(ctx).t; if (!t) return; const now = Date.now();
      for (const el of root.querySelectorAll('[data-tick]')) {
        const p = t.pallets[el.dataset.tick]; if (!p) continue;
        const w = workedMin(t, p, p.status === 'done' ? Date.parse(p.doneAt) || now : now) * 60000, pc = pace(t, p, now);
        el.textContent = el.dataset.tickShort ? fmtMins(w / 60000) : `${fmtClock(w)} worked${p.expectedMins ? ` · est ${p.expectedMins} min` : ''}${pc === 'over' ? ' · over' : ''}`;
        el.classList.remove('pc-over', 'pc-near', 'pc-on', 'pc-under', 'pc-none'); el.classList.add('pc-' + (pc || 'none'));
      }
    };
    tick(); const timer = setInterval(tick, 1000);
    root.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const f = e.target.dataset?.field; if (f === 'ps-code') { e.preventDefault(); root.querySelector('[data-act="ps-find"]')?.click(); return; } if (f === 'cartons' || f === 'ref') { e.preventDefault(); root.querySelector('[data-act="land"]')?.click(); } else if (f === 'pscan') { e.preventDefault(); root.querySelector('[data-act="pscan"]')?.click(); } else if (f === 'team') { e.preventDefault(); root.querySelector('[data-act="team-add"]')?.click(); } });
    return [ctx.store.on('dock', () => ctx.rerender()), () => clearInterval(timer)];
  },
};

// Sightings from the dock's ledger: a consol manifested on an earlier
// truck (a late arrival) or already scanned on another (a duplicate?).
const sightOf = p => JSON.stringify([p?.lateFrom || null, p?.seenBefore || null]);
function sightToast(ctx, ref, was) {
  const p = model(ctx).t?.pallets?.[ref]; if (!p || sightOf(p) === was) return false;
  const [lf] = JSON.parse(was);
  if (p.lateFrom && JSON.stringify(p.lateFrom) !== JSON.stringify(lf)) toast(`⚠ landed ${ref} — this consol was manifested ${fmtDate(p.lateFrom.d)} (Truck ${truckNo(p.lateFrom.t)}). Late arrival recorded.`, 'bad');
  else if (p.seenBefore) toast(`⚠ landed ${ref} — this consol was already scanned ${fmtDate(p.seenBefore.d)} on Truck ${truckNo(p.seenBefore.t)}. Duplicate?`, 'bad');
  else return false;
  return true;
}
export const sightBadge = p => (p.lateFrom ? ` <span class="status warn" title="Manifested on Truck ${esc(truckNo(p.lateFrom.t))}">LATE — manifested ${esc(fmtDate(p.lateFrom.d))}</span>` : '') + (p.seenBefore ? ` <span class="status warn" title="Scanned on Truck ${esc(truckNo(p.seenBefore.t))}${p.seenBefore.ref ? ' at ' + esc(p.seenBefore.ref) : ''}">SEEN ${esc(fmtDate(p.seenBefore.d))}</span>` : '') + (p.linkedLateAt ? ` <span class="status">linked late · ${esc(p.linkBasis || 'manual')}</span>` : '');
