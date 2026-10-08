// Shared dock screens (Decant Visualiser's dock tablet and Team Board):
// read-only boards for a wall or a tablet on the dock, D-numbers only.
//
//   Dock screen  the big pallet grid with one-second clocks on every square
//                being decanted, a wall clock, the hold-up banner, the crew.
//   Team Board   the goal, the forecast finish, progress with a goal-pace
//                marker, who is decanting what right now and who is next.
//
// Both keep the screen awake (Wake Lock, taken again when the page comes
// back) and can go fullscreen. They tick every second without re-rendering;
// a change on the dock re-renders them.

import { ic, esc } from '../../ui.js';
import { PT_LETTER, PT_NAME, truckNo, fmtHM, openTrucks, pallets, progress, openHalt, running, onBreak, openSegs, workedMin, pace, fmtMins, fmtClock, forecast, goalPace, holdName, grid, ROLE_NAME } from './common.js';
import { ratesFor } from './plan.js';

function current(ctx) {
  const dock = ctx.store.get('dock'), open = openTrucks(dock);
  const t = open.find(x => x.status === 'live') || open[0] || null;
  return { dock, t };
}
const clock = () => new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const empty = (title, dock) => `<div class="scr-empty">${ic('truck')}<b>No truck on the dock</b><span>${title} wakes when the next truck starts.${dock?.rollover ? ` ${Object.keys(dock.rollover.pallets).length} pallets are held for it.` : ''}</span></div>`;
const tools = board => `<div class="scr-tools"><span class="scr-clock" data-clock>${clock()}</span><button class="btn sm" data-act="scr-full" title="Fullscreen">${ic('expand')}Fullscreen</button><button class="btn sm" data-view="${board === 'dock' ? 'teamboard' : 'dockscreen'}">${board === 'dock' ? `${ic('users')}Team Board` : `${ic('grid')}Dock screen`}</button></div>`;
const holdBanner = h => h ? `<div class="scr-hold${h.kind && h.kind !== 'halt' ? ' planned' : ''}">${ic('alert')}<b>${esc(holdName(h))}</b>${h.note ? ` · ${esc(h.note)}` : ''}<span>since ${fmtHM(h.start)} · the decant clock is stopped</span></div>` : '';
function progressBar(t, pr) {
  const gp = t.goalAt ? goalPace(t) : null;
  return `<div class="scr-prog"><div class="scr-bar">${gp !== null ? `<b class="scr-pace" style="left:${Math.round(gp * 100)}%" title="Goal pace: where the team should be by now"></b>` : ''}<i style="width:${pr.pct}%"></i></div><div class="scr-progt"><span><b>${pr.done}</b> of ${pr.total} cartons · ${pr.pct}%</span>${gp !== null ? `<span class="scr-legend"><i></i>goal pace ${Math.round(gp * 100)}%</span>` : ''}<span>${pr.doneCount} of ${pr.count} pallets</span></div></div>`;
}

// ── Dock screen ────────────────────────────────────────────────────────
function dockScreen(ctx) {
  const { dock, t } = current(ctx);
  const head = `<div class="scr-head"><div><h2>${t ? `Truck ${esc(truckNo(t.id))}` : 'The dock'}</h2><span>${t ? `landed ${fmtHM(t.landedAt)}${t.goalAt ? ` · goal ${fmtHM(t.goalAt)}` : ''}` : ''}</span></div>${tools('dock')}</div>`;
  if (!t) return `<div class="scr">${head}${empty('The dock screen', dock)}</div>`;
  const g = grid(t), byRef = {}; for (const p of pallets(t)) byRef[p.ref] = p;
  const cells = g.refs.map(ref => {
    const p = byRef[ref];
    if (!p) return `<div class="scr-sq vac"><span class="r">${ref}</span></div>`;
    const s = p.status, pc = pace(t, p), crew = openSegs(p).map(x => x.pid).join(' + ');
    return `<div class="scr-sq t-${PT_LETTER[p.ptype] || 'c'} st-${s}${pc ? ' pc-' + pc : ''}${p.carryover ? ' co' : ''}"><span class="r">${ref}</span><b class="c">${p.cartons ?? '–'}</b>${s === 'active' || s === 'paused' ? `<span class="tm" data-tick="${ref}"></span>` : s === 'done' ? `<span class="tm">✓ ${fmtHM(p.doneAt)}</span>` : ''}${crew ? `<span class="w">${esc(crew)}</span>` : s === 'paused' ? '<span class="w">paused</span>' : ''}</div>`;
  }).join('');
  const run = running(t);
  const crew = (t.team || []).map(m => { const br = onBreak(t, m.pid); return `<span class="scr-crew${run[m.pid] ? ' on' : ''}${br ? ' brk' : ''}"><b>${esc(m.pid)}</b>${br ? 'break' : run[m.pid] ? esc(run[m.pid]) : 'free'}</span>`; }).join('');
  return `<div class="scr">${head}${holdBanner(openHalt(t))}${progressBar(t, progress(t))}<div class="scr-grid" style="grid-template-columns:repeat(${g.cols},1fr)">${cells}</div><div class="scr-crews">${crew || '<span class="cs-dim">No crew on this truck yet</span>'}</div></div>`;
}

// ── Team Board ─────────────────────────────────────────────────────────
// Up next: each free person (not on a break, not on a pallet) against the
// next pallet waiting: a paused one first, then tubs, then by landing.
function upNext(t) {
  const run = running(t), free = (t.team || []).filter(m => !run[m.pid] && !onBreak(t, m.pid) && (m.role || 'cutter') === 'cutter');
  const waiting = pallets(t).filter(p => p.status === 'landed' || p.status === 'assigned' || p.status === 'paused')
    .sort((a, b) => (a.status === 'paused' ? 0 : 1) - (b.status === 'paused' ? 0 : 1) || (a.ptype === 'chep' ? 0 : 1) - (b.ptype === 'chep' ? 0 : 1) || String(a.landedAt).localeCompare(String(b.landedAt)));
  return { pairs: free.map((m, i) => ({ pid: m.pid, p: waiting[i] || null })), waiting };
}
function teamBoard(ctx) {
  const { dock, t } = current(ctx);
  const head = `<div class="scr-head"><div><h2>Team Board</h2><span>${t ? `Truck ${esc(truckNo(t.id))} · landed ${fmtHM(t.landedAt)}` : ''}</span></div>${tools('team')}</div>`;
  if (!t) return `<div class="scr">${head}${empty('The Team Board', dock)}</div>`;
  const pr = progress(t), fc = forecast(t, Date.now(), ratesFor(ctx.store.get('dock'))), late = fc.at && t.goalAt && fc.at > Date.parse(t.goalAt);
  const kpis = `<div class="scr-kpis"><div><span>Goal</span><b>${t.goalAt ? fmtHM(t.goalAt) : '—'}</b></div><div class="${late ? 'bad' : fc.at && t.goalAt ? 'good' : ''}"><span>Forecast finish</span><b data-forecast>${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}</b><small>${fc.at && t.goalAt ? (late ? `${fmtMins((fc.at - Date.parse(t.goalAt)) / 60000)} behind` : `${fmtMins((Date.parse(t.goalAt) - fc.at) / 60000)} ahead`) : fc.remain ? `${fmtMins(fc.remain)} of work left · ${fc.crew} on` : ''}</small></div><div><span>Cartons</span><b>${pr.done}<small> / ${pr.total}</small></b></div><div><span>Pallets</span><b>${pr.doneCount}<small> / ${pr.count}</small></b></div></div>`;
  const now = [];
  for (const p of pallets(t)) for (const seg of openSegs(p)) now.push({ pid: seg.pid, p });
  now.sort((a, b) => a.pid.localeCompare(b.pid, 'en', { numeric: true }));
  const nowCard = `<div class="card scr-card"><div class="ch"><h3>Decanting now</h3><span class="cs-dim">${now.length} on pallets</span></div>${now.length ? `<div class="scr-rows">${now.map(({ pid, p }) => { const pc = pace(t, p); return `<div class="scr-row pc-${pc || 'none'}"><b class="who">${esc(pid)}</b><span class="bay">${esc(p.ref)}</span><span class="what">${esc(PT_NAME[p.ptype] || p.ptype)} · ${p.cartons ?? '–'} ctn${openSegs(p).length > 1 ? ` · with ${esc(openSegs(p).filter(x => x.pid !== pid).map(x => x.pid).join(', '))}` : ''}</span><span class="tm" data-tick="${esc(p.ref)}"></span><span class="est">${p.expectedMins ? `est ${p.expectedMins}m` : ''}</span></div>`; }).join('')}</div>` : '<p class="lbl">Nobody is on a pallet right now.</p>'}</div>`;
  const nx = upNext(t);
  const others = (t.team || []).filter(m => (m.role || 'cutter') !== 'cutter' || onBreak(t, m.pid));
  const nextCard = `<div class="card scr-card"><div class="ch"><h3>Up next</h3><span class="cs-dim">${nx.waiting.length} pallet${nx.waiting.length === 1 ? '' : 's'} waiting</span></div>${nx.pairs.length ? `<div class="scr-rows">${nx.pairs.map(x => `<div class="scr-row"><b class="who">${esc(x.pid)}</b>${x.p ? `<span class="bay">${esc(x.p.ref)}</span><span class="what">${esc(PT_NAME[x.p.ptype] || x.p.ptype)} · ${x.p.cartons ?? '–'} ctn${x.p.status === 'paused' ? ' · resume' : ''}</span>` : '<span class="what cs-dim">nothing waiting</span>'}</div>`).join('')}</div>` : '<p class="lbl">Every cutter is on a pallet.</p>'}` +
    (others.length ? `<div class="scr-others">${others.map(m => { const br = onBreak(t, m.pid); return `<span><b>${esc(m.pid)}</b> ${br ? `on a break since ${fmtHM(br.start)}` : esc(ROLE_NAME[m.role] || m.role).toLowerCase()}</span>`; }).join('')}</div>` : '') + '</div>';
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
    const a = e.target.closest('[data-act="scr-full"]'); if (!a) return;
    const el = root.querySelector('.scr') || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.().catch(() => {});
  });
  return [ctx.store.on('dock', () => ctx.rerender()), () => clearInterval(timer), () => clearInterval(slow), () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); lock = null; }];
}

export const dockscreen = {
  id: 'dockscreen', title: 'Dock screen', rail: 'Dock screen', icon: 'grid', area: 'backdock',
  desktop: ctx => dockScreen(ctx), mobile: ctx => dockScreen(ctx), mount: mountScreen,
};
export const teamboard = {
  id: 'teamboard', title: 'Team Board', rail: 'Team Board', icon: 'users', area: 'backdock',
  desktop: ctx => teamBoard(ctx), mobile: ctx => teamBoard(ctx), mount: mountScreen,
};
