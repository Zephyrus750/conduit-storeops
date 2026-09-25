// Receiving: the dock board. Desktop is the facilitator's overview (trucks,
// the pallet grid, who is decanting, what landed) with land, goal, team and
// finalise; the phone is the receiver's hands-on flow (land a pallet, run
// the decant: start, pause, done, halts). Ported from Vector's
// backdock-receiving and backdock-decant over the backdock reducers.

import { $, $$, ic, esc, vh, sub, toast, mhead, fmtDate, camButton } from '../../ui.js';
import { PTYPES, PT_LETTER, PT_NAME, PT_COLOUR, HALT_NAME, STD_MINS_PER_CARTON, todayKey, truckNo, fmtHM, openTrucks, nextTruckId, pallets, progress, openHalt, running, who, grid, startable, manifestIndex, publishManifestFile, attachManifest } from './common.js';

const st = { truck: null, land: { ref: '', ptype: 'chep', cartons: '' }, view: 'receive', arm: null, sel: null, halting: false, pending: [], manPick: false };
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
    const s = p.status || 'landed', tg = !desk && st.view === 'run' && st.arm && startable(p);
    return `<button class="bdk-sq marked t-${PT_LETTER[p.ptype] || 'c'} st-${s}${tg ? ' tg' : ''}${p.carryover ? ' co' : ''}${st.sel === ref ? ' hit' : ''}" data-act="cell" data-ref="${ref}" title="${ref} · ${esc(PT_NAME[p.ptype] || p.ptype)} · ${p.cartons ?? '–'} cartons · ${s}${p.carryover ? ' · carried over' : ''}"><span class="bdk-ref">${ref}</span><span class="bdk-ct">${p.cartons ?? '–'}</span>${s === 'active' ? '<span class="bdk-flag">▶</span>' : s === 'done' ? '<span class="bdk-flag">✓</span>' : s === 'paused' ? '<span class="bdk-flag">⏸</span>' : ''}</button>`;
  }).join('') + '</div>';
}
const legend = () => `<span class="bdr-legend">${PTYPES.map(p => `<span><i style="background:${p[2]}"></i>${p[1]}</span>`).join('')}<span><i style="background:#C9F0D8;border:1px solid #86D9A8"></i>Done</span><span><i style="background:#fff;border:2px solid var(--accent)"></i>Decanting</span><span><i style="background:#fff;border:2px solid #7C3AED"></i>Carryover</span></span>`;
function landForm() {
  return `<div class="bdr-land"><span class="lbl">Land a pallet</span><input class="bdr-in mono" data-field="ref" placeholder="Bay" maxlength="3" title="Grid ref, e.g. A1, or click an empty cell" value="${esc(st.land.ref)}"><span class="bdr-pts">${PTYPES.map(p => `<button class="bdr-pt${st.land.ptype === p[0] ? ' on' : ''}" data-act="ptype" data-pt="${p[0]}"><i style="background:${p[2]}"></i>${p[1]}</button>`).join('')}</span><input class="bdr-in mono" data-field="cartons" inputmode="numeric" placeholder="Cartons" maxlength="3" value="${esc(st.land.cartons)}"><button class="btn primary sm" data-act="land">${ic('plus')}Land</button></div>`;
}
function desktop(ctx) {
  const m = model(ctx), t = m.t, pr = m.pr, live = t?.status === 'live';
  const head = vh('Receiving', sub(fmtDate(todayKey()), `${m.open.length} truck${m.open.length === 1 ? '' : 's'} on the board`, t ? (live ? `T${truckNo(t.id)} live` : `T${truckNo(t.id)} staged`) : 'dock clear'),
    (t ? `<button class="btn" data-act="manpick">${ic('file')}${t.manifest ? 'Manifest ' + esc(t.manifest.manNo) : 'Manifest'}</button><button class="btn" data-act="goal">${ic('clock')}${t.goalAt ? 'Goal ' + fmtHM(t.goalAt) : 'Set goal'}</button>` + (live ? `<button class="btn" data-act="finalise">${ic('check')}Finalise</button>` : `<button class="btn primary" data-act="golive">${ic('truck')}Start receiving T${truckNo(t.id)}</button>`) : '') + `<button class="btn primary" data-act="newtruck">${ic('plus')}New truck</button>`, 'm-receiving');
  if (!t) return head + `<div class="card bdr-empty" style="padding:28px;text-align:center"><div style="font-size:34px;color:var(--faint)">${ic('truck')}</div><b style="display:block;font-size:18px;margin:8px 0 4px">No truck on the dock</b><p class="lbl">Start receiving the next truck here, or let a dock phone land it. The board wakes either way.</p><button class="btn primary" data-act="newtruck">${ic('plus')}Start receiving a truck</button></div>`;
  const strip = `<div class="trk-strip">${m.open.map(x => truckCard(x, x.id === t.id)).join('')}</div>`;
  const man = t.manifest;
  const headcard = `<div class="card bdr-headcard"><div class="bdr-head"><span class="bdr-tile">${ic('truck')}</span><div class="bdr-tt"><b>Truck ${esc(truckNo(t.id))}</b><span class="tst ${esc(t.status)}">${live ? 'Live' : 'Staged'}</span><small>${live ? `landed ${fmtHM(t.landedAt)} · ${pr.count} pallet${pr.count === 1 ? '' : 's'}${pallets(t).some(p => p.carryover) ? ` (${pallets(t).filter(p => p.carryover).length} carryover)` : ''} · ${pr.active} decanting` : 'staged · the first pallet landed makes it live'}${m.halt ? ` · <b style="color:#B91C1C">halted · ${esc(HALT_NAME[m.halt.reason] || m.halt.reason)}</b>` : ''}</small></div>` +
    `<div class="bdr-chips"><span class="bdr-chip"><span class="l">Manifest</span><span class="v">${man ? `${man.consols.length}<small> cons · ${man.consols.reduce((n, c) => n + c.cartons, 0)}c</small>` : '—'}</span></span><span class="bdr-chip"><span class="l">Goal</span><span class="v">${t.goalAt ? fmtHM(t.goalAt) : '—'}</span></span><span class="bdr-chip"><span class="l">Pallets</span><span class="v">${pr.count}<small> on dock</small></span></span></div></div>` +
    `<div class="bdr-prog"><b class="bdr-big">${pr.done}</b><span class="bdr-of">/ ${pr.total} cartons</span><span class="bdr-pct">${pr.pct}%</span></div><div class="bdr-bar"><i style="width:${pr.pct}%"></i></div></div>`;
  const dock = `<div class="card kpi dk rcv bdr-dock"><div class="kh">${ic('box')}<h3>The dock</h3>${legend()}</div>${live ? landForm() : ''}${dockGrid(t, true)}${m.halt ? `<div class="bdr-haltrow">${ic('alert')}<b>${esc(HALT_NAME[m.halt.reason] || 'Halted')}</b> since ${fmtHM(m.halt.start)} · decant paused<button class="btn sm" data-act="haltend">End halt</button></div>` : live ? `<div class="bdr-haltrow dim">${ic('clock')}Decant running<button class="btn sm" data-act="halt">${ic('alert')}Halt</button>${st.halting ? `<span class="bdr-reasons">${Object.entries(HALT_NAME).map(([k, v]) => `<button class="chip" data-act="haltgo" data-reason="${k}">${v}</button>`).join('')}</span>` : ''}</div>` : ''}</div>`;
  const team = t.team || [];
  const teamcard = `<div class="card"><div class="ch"><h3>${live ? 'Decanting now' : 'Team staged'}</h3><span class="cs-dim">${team.length ? `${team.length} on the dock` : 'no team yet'}</span></div>` +
    (team.length ? `<div class="bdr-team">${team.map(mm => `<div class="bdr-tc${m.run[mm.pid] ? ' on' : ''}"><b class="bdr-who">${esc(who(mm))}</b><span class="bdr-state">${m.run[mm.pid] ? `decanting <b>${esc(m.run[mm.pid])}</b>` : 'between pallets'}</span><button class="bdr-x" data-act="team-drop" data-pid="${esc(mm.pid)}" title="Remove from this truck">${ic('x')}</button></div>`).join('')}</div>` : '') +
    `<div class="bdr-teamadd"><input class="bdr-in" data-field="team" placeholder="Add a device or name, e.g. D4" maxlength="24"><button class="btn sm" data-act="team-add">${ic('plus')}Add</button></div><p class="lbl">Devices, not people: whoever signs in on D1 is D1 for the day.</p></div>`;
  const landed = pallets(t).slice().sort((a, b) => (a.landedAt || '').localeCompare(b.landedAt || ''));
  const landedcard = `<div class="card"><div class="ch"><h3>Landed today</h3><span class="cs-dim">${landed.length ? `${landed.length} pallets · newest last` : `Truck ${truckNo(t.id)}`}</span></div>${landed.length ? `<div class="list rcv-list bdr-landed">${landed.map(p => `<div class="li${st.sel === p.ref ? ' sel' : ''}" data-act="cell" data-ref="${esc(p.ref)}"><span class="loc">${esc(p.ref)}</span><span class="nm">${esc(PT_NAME[p.ptype] || p.ptype)}${p.carryover ? ' · carryover' : ''} · ${p.cartons ?? '–'} cartons${p.assignedTo ? ` · ${esc(p.assignedTo)}` : ''}</span><span class="rcv-st ${p.status}">${p.status === 'done' ? 'Done' : p.status === 'active' ? 'Decanting' : p.status === 'paused' ? 'Paused' : 'Waiting'}</span><span class="rt">${p.carryover ? 'Yesterday' : fmtHM(p.landedAt)}</span></div>`).join('')}</div>` : `<div class="pempty">Nothing landed yet</div>`}${st.sel && t.pallets[st.sel] ? palletPanel(t, t.pallets[st.sel], true) : ''}</div>`;
  const picker = !st.manPick ? '' : (() => {
    const idx = manifestIndex(m.dock).sort((a, b) => (a.truck ? 1 : 0) - (b.truck ? 1 : 0));
    return `<div class="card bdr-manpick"><div class="ch"><h3>${t.manifest ? `Manifest ${esc(t.manifest.manNo)} on Truck ${esc(truckNo(t.id))}` : `Attach a manifest to Truck ${esc(truckNo(t.id))}`}</h3><span class="go" data-act="manpick">Close</span></div>` +
      (t.manifest ? `<p class="lbl">${t.manifest.consols.length} consols · ${t.manifest.consols.reduce((n, c) => n + c.cartons, 0)} cartons · attached ${fmtHM(t.manifest.attachedAt)}. Attaching another replaces it.</p>` : '') +
      `<div class="list">${idx.map(x => `<div class="li"><span class="loc">${esc(x.manNo)}</span><span class="nm">${x.consols} consols · ${x.totalCartons} cartons${x.despatch ? ' · despatch ' + esc(x.despatch) : ''}${x.truck ? ` · on Truck ${esc(truckNo(x.truck))}` : ''}</span><button class="btn sm${x.truck === t.id ? '' : ' primary'}" data-act="manattach" data-man="${esc(x.manNo)}"${x.truck === t.id ? ' disabled' : ''}>${x.truck === t.id ? 'Attached' : 'Attach'}</button></div>`).join('') || '<div class="ohint">Nothing in the library yet.</div>'}</div>` +
      `<div class="bdr-manup"><label class="btn" style="cursor:pointer"><input type="file" accept=".xls,.xlsx,.csv" data-field="manfile" style="display:none">${ic('file')}Upload today's report and attach it</label><span class="cs-dim">The DC's Manifest Report .xls from the email. It is published to the library and attached to this truck.</span></div></div>`;
  })();
  return head + strip + picker + `<div class="bdr-stack">${headcard}${dock}${teamcard}${landedcard}</div>`;
}

// One pallet's controls: type, cartons, note, decant verbs, scanned
// consolidations. Desktop and phone share it.
function palletPanel(t, p, desk) {
  const team = t.team || [], s = p.status || 'landed';
  const picker = team.length ? `<select class="bdr-in" data-field="pid">${team.map(m => `<option value="${esc(m.pid)}"${p.assignedTo === m.pid ? ' selected' : ''}>${esc(who(m))}</option>`).join('')}</select>` : `<span class="cs-dim">No crew on this truck yet: add the team first.</span>`;
  const verbs = s === 'active' ? `<button class="btn sm" data-act="dec" data-dec="pause">⏸ Pause</button><button class="btn primary sm" data-act="dec" data-dec="done">${ic('check')}Done</button>`
    : s === 'paused' ? `<button class="btn primary sm" data-act="dec" data-dec="resume"${team.length ? '' : ' disabled'}>▶ Resume</button><button class="btn sm" data-act="dec" data-dec="done">${ic('check')}Done</button>`
    : s === 'done' ? `<span class="status good">Decanted ${fmtHM(p.doneAt)}</span><button class="btn sm" data-act="dec" data-dec="reopen">↩ Reopen</button>`
    : `<button class="btn primary sm" data-act="dec" data-dec="start"${team.length ? '' : ' disabled'}>▶ Start</button>`;
  const cons = t.manifest?.consols || [];
  const scans = p.consolIds.map(id => { const c = cons.find(x => x.id === id); return `<div class="bdk-vrow ok"><span>✓</span><b class="mono">${esc(id)}</b><span>${c ? `${c.cartons} ctn${c.dept ? ' · ' + esc(c.dept) : ''}` : 'on this pallet'}</span></div>`; }).join('') +
    p.scanIds.filter(id => !p.consolIds.includes(id)).map(id => `<div class="bdk-vrow"><span>·</span><b class="mono">${esc(id)}</b><span>saved · matches when a manifest is attached</span></div>`).join('') +
    st.pending.filter(x => x.ref === p.ref).map((x, i) => `<div class="bdk-vrow warn"><span>⚠</span><b class="mono">${esc(x.id)}</b><span>not on this manifest</span><span class="bdk-vbtns"><button class="btn sm" data-act="pend-add" data-i="${i}">Add &amp; flag</button><button class="btn sm" data-act="pend-drop" data-i="${i}">Ignore</button></span></div>`).join('');
  return `<div class="bdk-pal${desk ? ' desk' : ''}"><div class="bdk-pal-h"><b>Pallet ${esc(p.ref)}</b><span class="tst ${s === 'done' ? 'done' : s === 'active' ? 'live' : 'staged'}">${s}</span>${p.carryover ? '<span class="status warn">carryover</span>' : ''}<button class="ibtn" data-act="closepal" title="Close">${ic('x')}</button></div>` +
    `<div class="bdk-pal-b"><div class="bdk-ptrow">${PTYPES.map(x => `<button class="bdr-pt${p.ptype === x[0] ? ' on' : ''}" data-act="pal-pt" data-pt="${x[0]}"><i style="background:${x[2]}"></i>${x[1]}</button>`).join('')}</div>` +
    `<div class="bdk-fields"><label>Cartons<input class="bdr-in mono" data-field="pcartons" inputmode="numeric" maxlength="3" value="${p.cartons ?? ''}"></label><label>Est. mins<input class="bdr-in mono${p.expectedBasis === 'manual' ? '' : ' auto'}" data-field="pexp" inputmode="numeric" maxlength="4" value="${p.expectedMins ?? ''}" title="${p.expectedBasis === 'manual' ? 'set by hand' : `auto · ${STD_MINS_PER_CARTON} min per carton`}"></label><label>Note<input class="bdr-in" data-field="pnote" maxlength="120" placeholder="optional" value="${esc(p.note || '')}"></label></div>` +
    `<div class="bdk-scanrow"><input class="bdr-in mono" data-field="pscan" inputmode="numeric" enterkeyhint="done" placeholder="Scan or type a pallet label" autocomplete="off">${camButton('pscan')}<button class="btn sm" data-act="pscan">${ic('barcode')}Add</button></div>${scans ? `<div class="bdk-verified">${scans}</div>` : ''}` +
    `<div class="bdk-decant"><div class="bdk-declab">Decant${p.assignedTo ? ` · ${esc(who(team.find(m => m.pid === p.assignedTo) || { pid: p.assignedTo }))}` : ''}</div>${s !== 'done' ? picker : ''}<div class="bdk-verbs">${verbs}</div></div>` +
    `<div class="bdk-palacts"><button class="btn sm" data-act="pal-save">${ic('check')}Update</button><button class="btn sm" data-act="pal-remove">${ic('trash')}Remove</button></div></div></div>`;
}

// ── phone ──────────────────────────────────────────────────────────────
function mobile(ctx) {
  const m = model(ctx), t = m.t, pr = m.pr;
  const chips = `<div class="bdk-tchips">${m.open.map(x => `<button class="bdk-tchip${x.id === st.truck ? ' on' : ''}" data-act="pick" data-id="${esc(x.id)}">Truck ${esc(truckNo(x.id))}<i>${esc(x.status)}</i></button>`).join('')}<button class="bdk-tchip add" data-act="newtruck">+ New truck</button></div>`;
  if (!t) return mhead('Receiving', 'No truck on the dock') + chips + `<div class="mv-note">${ic('truck')}Tap <b>New truck</b> when the first pallet comes off. The desktop board follows.</div>`;
  const run = st.view === 'run';
  const head = mhead(`Truck ${esc(truckNo(t.id))}`, t.status === 'live' ? `landed ${fmtHM(t.landedAt)}${t.goalAt ? ' · goal ' + fmtHM(t.goalAt) : ''}` : 'staged · land a pallet to go live');
  const toggle = `<div class="bdk-vt"><button class="${run ? '' : 'on'}" data-act="view" data-mode="receive">Receive</button><button class="${run ? 'on' : ''}" data-act="view" data-mode="run">Run</button></div>`;
  const prog = `<div class="bdk-prog"><div class="nums"><b>${pr.done}</b><span>/ ${pr.total} ctn decanted</span></div><div class="bar"><i style="width:${pr.pct}%"></i></div><div class="sub">${pr.count} pallet${pr.count === 1 ? '' : 's'} landed · ${pr.active} decanting${t.status !== 'live' ? ` · <b>${esc(t.status)}</b>` : ''}</div></div>`;
  const runbar = run ? (m.halt ? `<div class="bdk-runbar"><div class="bdk-runtile warn" style="flex:1"><small>${esc(HALT_NAME[m.halt.reason] || 'Halted')}</small><b>since ${fmtHM(m.halt.start)}</b></div><button class="bdk-runtile" data-act="haltend"><small>Decant</small><b>▶ Resume</b></button></div>`
      : `<div class="bdk-runbar"><button class="bdk-runtile" data-act="goal"><small>Goal</small><b>${t.goalAt ? fmtHM(t.goalAt) : 'Set'}</b></button><button class="bdk-runtile warn" data-act="halt"><small>Decant</small><b>⏸ Halt</b></button></div>${st.halting ? `<div class="bdr-reasons">${Object.entries(HALT_NAME).map(([k, v]) => `<button class="chip" data-act="haltgo" data-reason="${k}">${v}</button>`).join('')}</div>` : ''}`) +
    `<div class="bdk-hint${st.arm ? ' on' : ''}">${st.arm ? 'Armed: tap a lit square to start it, or the chip again to disarm.' : 'Tap a crew member, then a square, to start decanting it.'}</div>` : '';
  const team = t.team || [];
  const strip = run ? (team.length ? `<div class="bdk-strip">${team.map(mm => `<button class="bdk-fchip${st.arm === mm.pid ? ' armed' : ''}" data-act="arm" data-pid="${esc(mm.pid)}"><i class="${m.run[mm.pid] ? 'a' : ''}"></i><b>${esc(who(mm))}</b><span>${m.run[mm.pid] ? '▶ ' + esc(m.run[mm.pid]) : 'free'}</span></button>`).join('')}</div>` : `<div class="mv-note">${ic('users')}No crew on this truck yet. Add the team on the desktop board.</div>`) : '';
  const sel = st.sel ? (t.pallets[st.sel] ? palletPanel(t, t.pallets[st.sel], false) : landPanel(st.sel)) : '';
  return head + chips + toggle + prog + runbar + `<div class="bdk">${dockGrid(t, false)}</div>` + strip + sel;
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
  try {
    if (act === 'pick') { st.truck = a.dataset.id; st.sel = null; st.arm = null; st.manPick = false; return ctx.rerender(); }
    if (act === 'manpick') { st.manPick = !st.manPick; return ctx.rerender(); }
    if (act === 'manattach') { a.disabled = true; await attachManifest(ctx, id, a.dataset.man); st.manPick = false; toast(`${a.dataset.man} attached to Truck ${truckNo(id)}`); return; }
    if (act === 'view') { st.view = a.dataset.mode; st.arm = null; st.sel = null; return ctx.rerender(); }
    if (act === 'newtruck') { const nid = nextTruckId(m.dock); await dispatch(ctx, 'truck.create', { truck: nid }, { landedAt: new Date().toISOString() }); await dispatch(ctx, 'truck.setLive', { truck: nid }, {}); st.truck = nid; st.sel = null; toast(`Truck ${truckNo(nid)} is receiving`); return; }
    if (act === 'golive') { await dispatch(ctx, 'truck.setLive', { truck: id }, {}); return; }
    if (act === 'goal') { const cur = t.goalAt ? fmtHM(t.goalAt) : ''; const v = prompt('Finish goal, time of day (HH:MM). Blank to clear:', cur); if (v === null) return; let goal = null; if (v.trim()) { const mm = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!mm) return toast('Enter a time like 14:30', 'bad'); const d = new Date(); d.setHours(+mm[1], +mm[2], 0, 0); if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1); goal = d.toISOString(); } await dispatch(ctx, 'truck.setGoal', { truck: id }, { goal }); toast(goal ? `Goal ${fmtHM(goal)}` : 'Goal cleared'); return; }
    if (act === 'finalise') { const pr = m.pr; if (!confirm(`Finalise truck ${truckNo(id)}? ${pr.done} of ${pr.total} cartons decanted. It moves to history and leaves the board.`)) return; await dispatch(ctx, 'truck.finalise', { truck: id }, {}); st.truck = null; st.sel = null; toast(`Truck ${truckNo(id)} finalised`); return; }
    if (act === 'halt') { st.halting = !st.halting; return ctx.rerender(); }
    if (act === 'haltgo') { st.halting = false; await dispatch(ctx, 'halt.start', { truck: id }, { reason: a.dataset.reason }); toast(`Decant halted · ${HALT_NAME[a.dataset.reason]}`); return; }
    if (act === 'haltend') { await dispatch(ctx, 'halt.end', { truck: id }, {}); toast('Decant running'); return; }
    if (act === 'ptype') { st.land.ref = field('ref') || st.land.ref; st.land.cartons = field('cartons'); st.land.ptype = a.dataset.pt; return ctx.rerender(); }
    if (act === 'team-add') { const v = field('team').trim(); if (!v) return; const pid = v.toUpperCase().replace(/\s+/g, ''); if ((t.team || []).some(x => x.pid === pid)) return toast(`${pid} is already on the truck`); await dispatch(ctx, 'truck.team.set', { truck: id }, { team: [...(t.team || []), { pid, name: v, dnum: /^D\d+$/i.test(pid) ? pid : null }] }); return; }
    if (act === 'team-drop') { await dispatch(ctx, 'truck.team.set', { truck: id }, { team: (t.team || []).filter(x => x.pid !== a.dataset.pid) }); return; }
    if (act === 'cell') {
      const ref = a.dataset.ref, p = t.pallets[ref];
      if (!ctx.isMobile) { if (p) { st.sel = st.sel === ref ? null : ref; } else { st.land.ref = ref; st.land.cartons = field('cartons'); st.sel = null; } ctx.rerender(); if (!p) root.querySelector('[data-field="cartons"]')?.focus(); return; }
      if (st.view === 'run' && st.arm && startable(p)) { const pid = st.arm; st.arm = null; await dispatch(ctx, p.status === 'paused' ? 'pallet.resume' : 'pallet.start', { truck: id, bay: ref }, { pid }); return; }
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
      if (kind === 'start' || kind === 'resume') { const pid = field('pid') || p.assignedTo; if (!pid) return toast('Pick who is decanting first', 'bad'); await dispatch(ctx, kind === 'start' ? 'pallet.start' : 'pallet.resume', { truck: id, bay: st.sel }, { pid }); return; }
      if (kind === 'pause') return dispatch(ctx, 'pallet.pause', { truck: id, bay: st.sel }, {});
      if (kind === 'done') { await dispatch(ctx, 'pallet.done', { truck: id, bay: st.sel }, {}); if (ctx.isMobile) st.sel = null; return; }
      if (kind === 'reopen') return dispatch(ctx, 'pallet.reopen', { truck: id, bay: st.sel }, {});
    }
    if (act === 'pscan') {
      const raw = field('pscan').replace(/\D/g, ''); if (raw.length < 9) return toast('A pallet label has at least 9 digits', 'bad');
      const id9 = raw.slice(-9);
      try { await dispatch(ctx, 'pallet.scan', { truck: id, bay: st.sel }, { code: raw }); toast(`${id9} on ${st.sel}`); }
      catch (e) { if (e.code === 'not_on_manifest') { st.pending.push({ ref: st.sel, id: id9 }); ctx.rerender(); toast(`${id9} is not on this manifest. Old label from a reused tub?`, 'bad'); } else throw e; }
      return;
    }
    if (act === 'pend-add') { const x = st.pending.filter(y => y.ref === st.sel)[+a.dataset.i]; st.pending = st.pending.filter(y => y !== x); const p = t.pallets[st.sel]; await dispatch(ctx, 'pallet.update', { truck: id, bay: st.sel }, { scanIds: [...p.scanIds, x.id] }); toast(`${x.id} flagged in the receiving audit`); return; }
    if (act === 'pend-drop') { const x = st.pending.filter(y => y.ref === st.sel)[+a.dataset.i]; st.pending = st.pending.filter(y => y !== x); return ctx.rerender(); }
  } catch (e) { toast(e.message, 'bad'); }
}

export default {
  id: 'receiving', title: 'Receiving', icon: 'm-receiving', area: 'backdock',
  desktop(ctx) { return desktop(ctx); },
  mobile(ctx) { return mobile(ctx); },
  mount(ctx, root) {
    root.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a) onAct(ctx, a, root); });
    root.addEventListener('change', async e => {
      if (!e.target.matches('[data-field="manfile"]')) return;
      const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
      const t = model(ctx).t; if (!t) return;
      toast(`Reading ${f.name}…`);
      try { const r = await publishManifestFile(ctx, f); await attachManifest(ctx, t.id, r.manNo); st.manPick = false; toast(`Manifest ${r.manNo} attached · ${r.consols} consols, ${r.totalCartons} cartons`); }
      catch (err) { toast(`Could not use ${f.name}: ${err.message}`, 'bad'); }
    });
    root.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const f = e.target.dataset?.field; if (f === 'cartons' || f === 'ref') { e.preventDefault(); root.querySelector('[data-act="land"]')?.click(); } else if (f === 'pscan') { e.preventDefault(); root.querySelector('[data-act="pscan"]')?.click(); } else if (f === 'team') { e.preventDefault(); root.querySelector('[data-act="team-add"]')?.click(); } });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};
