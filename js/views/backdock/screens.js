// Shared dock screens (Decant Visualiser's dock tablet and Team Board):
// boards for a wall or a tablet on the dock, D-numbers only.
//
//   Dock screen  the big pallet grid with one-second clocks on every square
//                being decanted, a wall clock, the hold-up banner, the crew.
//                The crew runs the decant from it, as on DV's dock tablet:
//                tap a pallet, then Start (pick who), Pause, Done, Join or
//                Hand over. It cannot land, remove, edit or finalise; that
//                stays with Receiving.
//   Team Board   the goal, the forecast finish, progress with a goal-pace
//                marker, who is decanting what right now and who is next.
//
// Both keep the screen awake (Wake Lock, taken again when the page comes
// back) and can go fullscreen. They tick every second without re-rendering;
// a change on the dock re-renders them.

import { ic, esc, toast } from '../../ui.js';
import { PT_LETTER, PT_NAME, truckNo, fmtHM, openTrucks, pallets, progress, openHalt, running, onBreak, openSegs, workedMin, pace, fmtMins, fmtClock, forecast, goalPace, holdName, grid, ROLE_NAME } from './common.js';
import { ratesFor, guard } from './plan.js';
import { tx, txn } from '../../i18n.js';

// A person's role as a word in a line (lower case in English).
const ROLE_WORD = { cutter: tx('cutter'), runner: tx('runner'), cleaner: tx('cleaner') };
const roleWord = r => ROLE_WORD[r] || String(ROLE_NAME[r] || r).toLowerCase();
const PAL_ST = { landed: tx('landed'), assigned: tx('assigned'), active: tx('active'), paused: tx('paused'), done: tx('done') };

// The open pallet sheet on the dock tablet: { ref, pick: null | start | resume | join | handover }.
let sheet = null;

function current(ctx) {
  const dock = ctx.store.get('dock'), open = openTrucks(dock);
  const t = open.find(x => x.status === 'live') || open[0] || null;
  return { dock, t };
}
const clock = () => new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
// line: the screen's own "… wakes when the next truck starts." sentence.
const empty = (line, dock) => `<div class="scr-empty">${ic('truck')}<b>${tx('No truck on the dock')}</b><span>${line}${dock?.rollover ? ' ' + txn(Object.keys(dock.rollover.pallets).length, '{n} pallet is held for it.', '{n} pallets are held for it.') : ''}</span></div>`;
const tools = board => `<div class="scr-tools"><span class="scr-clock" data-clock>${clock()}</span><button class="btn sm" data-act="scr-full" title="${tx('Fullscreen')}">${ic('expand')}${tx('Fullscreen')}</button><button class="btn sm" data-view="${board === 'dock' ? 'teamboard' : 'dockscreen'}">${board === 'dock' ? `${ic('users')}${tx('Team Board')}` : `${ic('grid')}${tx('Dock screen')}`}</button></div>`;
const holdBanner = h => h ? `<div class="scr-hold${h.kind && h.kind !== 'halt' ? ' planned' : ''}">${ic('alert')}<b>${esc(holdName(h))}</b>${h.note ? ` · ${esc(h.note)}` : ''}<span>${tx('since {time} · the decant clock is stopped', { time: fmtHM(h.start) })}</span></div>` : '';
function progressBar(t, pr) {
  const gp = t.goalAt ? goalPace(t) : null;
  return `<div class="scr-prog"><div class="scr-bar">${gp !== null ? `<b class="scr-pace" style="left:${Math.round(gp * 100)}%" title="${tx('Goal pace: where the team should be by now')}"></b>` : ''}<i style="width:${pr.pct}%"></i></div><div class="scr-progt"><span>${tx('<b>{done}</b> of {total} cartons · {pct}%', { done: pr.done, total: pr.total, pct: pr.pct })}</span>${gp !== null ? `<span class="scr-legend"><i></i>${tx('goal pace {pct}%', { pct: Math.round(gp * 100) })}</span>` : ''}<span>${tx('{done} of {total} pallets', { done: pr.doneCount, total: pr.count })}</span></div></div>`;
}

// ── Dock screen ────────────────────────────────────────────────────────
function dockScreen(ctx) {
  const { dock, t } = current(ctx);
  const head = `<div class="scr-head"><div><h2>${t ? tx('Truck {no}', { no: esc(truckNo(t.id)) }) : tx('The dock')}</h2><span>${t ? `${tx('landed {time}', { time: fmtHM(t.landedAt) })}${t.goalAt ? ` · ${tx('goal {time}', { time: fmtHM(t.goalAt) })}` : ''}` : ''}</span></div>${tools('dock')}</div>`;
  if (!t) return `<div class="scr">${head}${empty(tx('The dock screen wakes when the next truck starts.'), dock)}</div>`;
  const g = grid(t), byRef = {}; for (const p of pallets(t)) byRef[p.ref] = p;
  const cells = g.refs.map(ref => {
    const p = byRef[ref];
    if (!p) return `<div class="scr-sq vac"><span class="r">${ref}</span></div>`;
    const s = p.status, pc = pace(t, p), crew = openSegs(p).map(x => x.pid).join(' + ');
    return `<div role="button" tabindex="0" data-act="scr-pal" data-ref="${esc(ref)}" aria-label="${tx('Pallet {ref}, {status}', { ref: esc(ref), status: esc(PAL_ST[s] || s) })}" class="scr-sq tap t-${PT_LETTER[p.ptype] || 'c'} st-${s}${pc ? ' pc-' + pc : ''}${p.carryover ? ' co' : ''}"><span class="r">${ref}</span><b class="c">${p.cartons ?? '–'}</b>${s === 'active' || s === 'paused' ? `<span class="tm" data-tick="${ref}"></span>` : s === 'done' ? `<span class="tm">✓ ${fmtHM(p.doneAt)}</span>` : ''}${crew ? `<span class="w">${esc(crew)}</span>` : s === 'paused' ? `<span class="w">${tx('paused')}</span>` : ''}</div>`;
  }).join('');
  const run = running(t);
  const crew = (t.team || []).map(m => { const br = onBreak(t, m.pid); return `<span class="scr-crew${run[m.pid] ? ' on' : ''}${br ? ' brk' : ''}"><b>${esc(m.pid)}</b>${br ? tx('break') : run[m.pid] ? esc(run[m.pid]) : tx('free')}</span>`; }).join('');
  return `<div class="scr">${head}${holdBanner(openHalt(t))}${progressBar(t, progress(t))}<div class="scr-grid" style="grid-template-columns:repeat(${g.cols},1fr)">${cells}</div><div class="scr-crews">${crew || `<span class="cs-dim">${tx('No crew on this truck yet')}</span>`}</div>${palletSheet(t)}</div>`;
}

// The pallet sheet (DV's palletSheet and personPicker): what the crew can
// do with this pallet now, and who does it.
const PICK_TITLE = { start: tx('Who’s decanting'), resume: tx('Who’s resuming'), join: tx('Who’s joining'), handover: tx('Hand over to') };
function palletSheet(t) {
  if (!sheet) return '';
  const p = t.pallets[sheet.ref]; if (!p || p.excluded) { sheet = null; return ''; }
  const s = p.status, on = openSegs(p).map(x => x.pid), w = workedMin(t, p);
  const head = `<div class="scr-sh-h"><div><b>${tx('Pallet {ref}', { ref: esc(p.ref) })}</b><span>${esc(PT_NAME[p.ptype] || p.ptype)} · ${tx('{n} ctn', { n: p.cartons ?? '–' })} · ${esc(s === 'active' ? tx('decanting') : s === 'done' ? tx('done') : s === 'paused' ? tx('paused') : tx('waiting'))}${p.segments.length ? ` · ${tx('{time} worked', { time: fmtMins(w) })}` : ''}${p.expectedMins ? ` · ${tx('est {n}m', { n: p.expectedMins })}` : ''}</span></div><button class="ibtn" data-act="scr-close" aria-label="${tx('Close')}">${ic('x')}</button></div>`;
  let body;
  if (t.status !== 'live') body = `<p class="lbl">${tx('The truck isn’t live yet. Receiving starts it.')}</p>`;
  else if (sheet.pick) {
    const run = running(t), team = t.team || [];
    const card = m => {
      const br = onBreak(t, m.pid), cutter = (m.role || 'cutter') === 'cutter', busy = run[m.pid] && !(sheet.pick === 'resume' && run[m.pid] === p.ref);
      const why = busy ? tx('busy · {ref}', { ref: run[m.pid] }) : br ? tx('on break') : !cutter ? roleWord(m.role) : m.start || m.finish ? tx('on {from}–{to}', { from: esc(m.start || '?'), to: esc(m.finish || '?') }) : tx('free');
      const ok = !busy && !br && cutter && !on.includes(m.pid);
      return `<button class="scr-pp${ok ? '' : ' off'}"${ok ? ` data-act="scr-pick" data-pid="${esc(m.pid)}"` : ' disabled'}><b>${esc(m.pid)}</b><span>${why}</span></button>`;
    };
    body = `<div class="scr-sh-t">${PICK_TITLE[sheet.pick]} · ${esc(p.ref)}</div>` + (team.length ? `<div class="scr-pps">${team.map(card).join('')}</div><p class="lbl">${tx('Tap a person.')}</p>` : `<p class="lbl">${tx('No team set: Receiving adds people under Team.')}</p>`) + `<button class="btn" data-act="scr-back">${tx('Back')}</button>`;
  } else if (s === 'active') body = `<p class="scr-sh-on">${tx('Decanting: <b>{who}</b>', { who: esc(on.join(' + ')) })}</p><div class="scr-sh-acts"><button class="btn primary big" data-act="scr-do" data-do="done">${ic('check')}${tx('Done')}</button><button class="btn big" data-act="scr-do" data-do="pause">⏸ ${tx('Pause')}</button><button class="btn" data-act="scr-pickfor" data-kind="join">＋ ${tx('Join')}</button><button class="btn" data-act="scr-pickfor" data-kind="handover">⇄ ${tx('Hand over')}</button></div>`;
  else if (s === 'paused') body = `<div class="scr-sh-acts"><button class="btn primary big" data-act="scr-pickfor" data-kind="resume">▶ ${tx('Resume')}</button><button class="btn big" data-act="scr-do" data-do="done">${ic('check')}${tx('Done')}</button></div>`;
  else if (s === 'done') { const pc = pace(t, p); body = `<p class="scr-sh-on">${tx('Clear at {time}', { time: fmtHM(p.doneAt) })}${p.expectedMins ? ` · ${tx('{n} min vs expected', { n: `${Math.round(w - p.expectedMins) >= 0 ? '+' : ''}${Math.round(w - p.expectedMins)}` })}` : ''}${pc === 'over' ? ` · ${tx('over its estimate')}` : ''}</p><p class="lbl">${tx('Done by mistake? Receiving can reopen it.')}</p>`; }
  else body = `<div class="scr-sh-acts"><button class="btn primary big" data-act="scr-pickfor" data-kind="start">▶ ${tx('Start decanting')}</button></div>`;
  return `<div class="scr-sheet" data-act="scr-close-bg"><div class="scr-sh" role="dialog" aria-label="${tx('Pallet {ref}', { ref: esc(p.ref) })}">${head}${body}<button class="btn scr-sh-close" data-act="scr-close">${tx('Close')}</button></div></div>`;
}
async function onScreenAct(ctx, a) {
  const act = a.dataset.act, { t } = current(ctx); if (!t) return;
  const at = sheet?.ref, dispatch = (type, payload = {}) => ctx.store.dispatch({ type, entity: { truck: t.id, bay: at }, payload });
  try {
    if (act === 'scr-pal') { sheet = { ref: a.dataset.ref, pick: null }; return ctx.rerender(); }
    if (act === 'scr-close' || act === 'scr-close-bg') { sheet = null; return ctx.rerender(); }
    if (!sheet) return;
    if (act === 'scr-back') { sheet.pick = null; return ctx.rerender(); }
    if (act === 'scr-pickfor') { sheet.pick = a.dataset.kind; return ctx.rerender(); }
    const ref = sheet.ref;
    // Undo, one step deep as DV's: each action offers its opposite.
    const undo = (type, payload = {}) => ({ label: tx('Undo'), run: () => ctx.store.dispatch({ type, entity: { truck: t.id, bay: ref }, payload }).catch(e => toast(e.message, 'bad')) });
    const onNow = openSegs(t.pallets[ref]).map(x => x.pid);
    if (act === 'scr-do') {
      const kind = a.dataset.do; sheet = null;
      await dispatch(kind === 'done' ? 'pallet.done' : 'pallet.pause');
      const q = ctx.store.get('dock').trucks[t.id]?.pallets[ref];
      if (kind === 'done') toast(q?.suspect ? tx('{ref} done very fast: Receiving will check its times', { ref }) : tx('{ref} done', { ref }), q?.suspect ? 'bad' : '', { label: tx('Undo'), run: () => ctx.store.dispatch({ type: 'pallet.reopen', entity: { truck: t.id, bay: ref }, payload: {} }).catch(e => toast(e.message, 'bad')) });
      else toast(tx('{ref} paused', { ref }), '', onNow.length ? undo('pallet.resume', { pid: onNow[0] }) : null);
      return;
    }
    if (act === 'scr-pick') {
      const pid = a.dataset.pid, kind = sheet.pick;
      if (kind !== 'join' && !guard(t, pid, ref, ratesFor(ctx.store.get('dock')), true)) return;
      sheet = null;
      if (kind === 'handover') await dispatch('pallet.handover', { toPid: pid }); else await dispatch(kind === 'start' ? 'pallet.start' : kind === 'resume' ? 'pallet.resume' : 'pallet.join', { pid });
      toast(kind === 'join' ? tx('{pid} joined {ref}', { pid, ref }) : kind === 'handover' ? tx('{ref} handed to {pid}', { ref, pid }) : tx('{pid} on {ref}', { pid, ref }), '', kind === 'handover' ? (onNow.length === 1 ? undo('pallet.handover', { toPid: onNow[0] }) : null) : kind === 'resume' ? undo('pallet.pause') : undo('pallet.unstart'));
    }
  } catch (e) { sheet = null; ctx.rerender(); toast(e.message, 'bad'); }
}

// ── Team Board ─────────────────────────────────────────────────────────
// Up next: each free person (not on a break, not on a pallet) against the
// first waiting pallet on their own queue in the decant plan; anyone with
// no queued pallet left takes the next unqueued one: a paused one first,
// then tubs, then by landing.
function upNext(t) {
  const run = running(t), free = (t.team || []).filter(m => !run[m.pid] && !onBreak(t, m.pid) && (m.role || 'cutter') === 'cutter');
  const waiting = pallets(t).filter(p => (p.status === 'landed' || p.status === 'assigned' || p.status === 'paused') && !p.excluded)
    .sort((a, b) => (a.status === 'paused' ? 0 : 1) - (b.status === 'paused' ? 0 : 1) || (a.ptype === 'chep' ? 0 : 1) - (b.ptype === 'chep' ? 0 : 1) || String(a.landedAt).localeCompare(String(b.landedAt)));
  const queues = t.plan?.queues || {}, byRef = new Map(waiting.map(p => [p.ref, p])), taken = new Set();
  const queued = new Set(Object.values(queues).flat());
  const pairs = free.map(m => { const p = (queues[m.pid] || []).map(r => byRef.get(r)).find(p => p && !taken.has(p.ref)); if (p) taken.add(p.ref); return { pid: m.pid, p: p || null, planned: !!p }; });
  const loose = waiting.filter(p => !queued.has(p.ref));
  for (const x of pairs) if (!x.p) { const p = loose.find(p => !taken.has(p.ref)); if (p) { taken.add(p.ref); x.p = p; } }
  return { pairs, waiting };
}
function teamBoard(ctx) {
  const { dock, t } = current(ctx);
  const head = `<div class="scr-head"><div><h2>${tx('Team Board')}</h2><span>${t ? tx('Truck {no} · landed {time}', { no: esc(truckNo(t.id)), time: fmtHM(t.landedAt) }) : ''}</span></div>${tools('team')}</div>`;
  if (!t) return `<div class="scr">${head}${empty(tx('The Team Board wakes when the next truck starts.'), dock)}</div>`;
  const pr = progress(t), fc = forecast(t, Date.now(), ratesFor(ctx.store.get('dock'))), late = fc.at && t.goalAt && fc.at > Date.parse(t.goalAt);
  const kpis = `<div class="scr-kpis"><div><span>${tx('Goal')}</span><b>${t.goalAt ? fmtHM(t.goalAt) : '—'}</b></div><div class="${late ? 'bad' : fc.at && t.goalAt ? 'good' : ''}"><span>${tx('Forecast finish')}</span><b data-forecast>${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}</b><small>${fc.at && t.goalAt ? (late ? tx('{time} behind', { time: fmtMins((fc.at - Date.parse(t.goalAt)) / 60000) }) : tx('{time} ahead', { time: fmtMins((Date.parse(t.goalAt) - fc.at) / 60000) })) : fc.remain ? tx('{time} of work left · {n} on', { time: fmtMins(fc.remain), n: fc.crew }) : ''}</small></div><div><span>${tx('Cartons')}</span><b>${pr.done}<small> / ${pr.total}</small></b></div><div><span>${tx('Pallets')}</span><b>${pr.doneCount}<small> / ${pr.count}</small></b></div></div>`;
  const now = [];
  for (const p of pallets(t)) for (const seg of openSegs(p)) now.push({ pid: seg.pid, p });
  now.sort((a, b) => a.pid.localeCompare(b.pid, 'en', { numeric: true }));
  const nowCard = `<div class="card scr-card"><div class="ch"><h3>${tx('Decanting now')}</h3><span class="cs-dim">${tx('{n} on pallets', { n: now.length })}</span></div>${now.length ? `<div class="scr-rows">${now.map(({ pid, p }) => { const pc = pace(t, p); return `<div class="scr-row pc-${pc || 'none'}"><b class="who">${esc(pid)}</b><span class="bay">${esc(p.ref)}</span><span class="what">${esc(PT_NAME[p.ptype] || p.ptype)} · ${tx('{n} ctn', { n: p.cartons ?? '–' })}${openSegs(p).length > 1 ? ` · ${tx('with {who}', { who: esc(openSegs(p).filter(x => x.pid !== pid).map(x => x.pid).join(', ')) })}` : ''}</span><span class="tm" data-tick="${esc(p.ref)}"></span><span class="est">${p.expectedMins ? tx('est {n}m', { n: p.expectedMins }) : ''}</span></div>`; }).join('')}</div>` : `<p class="lbl">${tx('Nobody is on a pallet right now.')}</p>`}</div>`;
  const nx = upNext(t);
  const others = (t.team || []).filter(m => (m.role || 'cutter') !== 'cutter' || onBreak(t, m.pid));
  const nextCard = `<div class="card scr-card"><div class="ch"><h3>${tx('Up next')}</h3><span class="cs-dim">${txn(nx.waiting.length, '{n} pallet waiting', '{n} pallets waiting')}</span></div>${nx.pairs.length ? `<div class="scr-rows">${nx.pairs.map(x => `<div class="scr-row"><b class="who">${esc(x.pid)}</b>${x.p ? `<span class="bay">${esc(x.p.ref)}</span><span class="what">${esc(PT_NAME[x.p.ptype] || x.p.ptype)} · ${tx('{n} ctn', { n: x.p.cartons ?? '–' })}${x.p.status === 'paused' ? ` · ${tx('resume')}` : ''}</span>` : `<span class="what cs-dim">${tx('nothing waiting')}</span>`}</div>`).join('')}</div>` : `<p class="lbl">${tx('Every cutter is on a pallet.')}</p>`}` +
    (others.length ? `<div class="scr-others">${others.map(m => { const br = onBreak(t, m.pid); return `<span><b>${esc(m.pid)}</b> ${br ? tx('on a break since {time}', { time: fmtHM(br.start) }) : esc(roleWord(m.role))}</span>`; }).join('')}</div>` : '') + '</div>';
  return `<div class="scr">${head}${holdBanner(openHalt(t))}${kpis}${progressBar(t, pr)}<div class="scr-two">${nowCard}${nextCard}</div></div>`;
}

// ── shared mount: tick, wake lock, fullscreen ──────────────────────────
function mountScreen(ctx, root) {
  const tick = () => {
    const c = root.querySelector('[data-clock]'); if (c) c.textContent = clock();
    const { t } = current(ctx); if (!t) return;
    const now = Date.now();
    for (const el of root.querySelectorAll('[data-tick]')) { const p = t.pallets[el.dataset.tick]; if (p) el.textContent = fmtClock(workedMin(t, p, now) * 60000); }
  };
  tick(); const timer = setInterval(tick, 1000);
  // Refresh the forecast and the pace marker once a minute.
  const slow = setInterval(() => ctx.rerender(), 60000);
  let lock = null;
  const wake = async () => { try { if (document.visibilityState === 'visible' && navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } } catch { lock = null; } };
  const onVis = () => { if (document.visibilityState === 'visible') wake(); };
  wake(); document.addEventListener('visibilitychange', onVis);
  root.addEventListener('click', e => {
    const s = e.target.closest('[data-act^="scr-"]:not([data-act="scr-full"])');
    if (s && !(s.dataset.act === 'scr-close-bg' && e.target !== s)) { onScreenAct(ctx, s); return; }
    const a = e.target.closest('[data-act="scr-full"]'); if (!a) return;
    const el = root.querySelector('.scr') || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.().catch(() => {});
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheet) { sheet = null; ctx.rerender(); return; }
    const sq = e.target.closest?.('[data-act="scr-pal"]'); if (sq && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onScreenAct(ctx, sq); }
  });
  return [ctx.store.on('dock', () => ctx.rerender()), () => clearInterval(timer), () => clearInterval(slow), () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); lock = null; }];
}

export const dockscreen = {
  id: 'dockscreen', title: tx('Dock screen'), rail: tx('Dock screen'), icon: 'grid', area: 'backdock',
  desktop: ctx => dockScreen(ctx), mobile: ctx => dockScreen(ctx), mount: mountScreen,
};
export const teamboard = {
  id: 'teamboard', title: tx('Team Board'), rail: tx('Team Board'), icon: 'users', area: 'backdock',
  desktop: ctx => teamBoard(ctx), mobile: ctx => teamBoard(ctx), mount: mountScreen,
};
