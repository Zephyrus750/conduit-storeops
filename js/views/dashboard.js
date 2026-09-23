// Dashboard: the Floor at a glance from live projections. Stockroom and
// The Back dock card reads the dock projection.

import { storeDay } from '../../shared/time.js';
import { focusDone } from '../../shared/reducers/floor.js';
import { ic, esc, vh, greeting, today, weekId, cycleId, daysLeftInCycle, fmtTime, ago, status } from '../ui.js';
import { microCount } from '../data/micros.js';
import { openTrucks, progress, truckNo, fmtHM, openHalt, HALT_NAME } from './backdock/common.js';

const TARGET = 100;
function kpi(cls, icon, title, go, n, d, hl, rows, pct) {
  return `<div class="card kpi${cls ? ' ' + cls : ''}"><div class="kh">${ic(icon)}<h3>${title}</h3><a class="open" data-go="${go}">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${n}</span><span class="d">${d}</span></div><div class="hl">${hl}</div><div class="rows">${rows.map(r => `<div class="row">${r[0]}<b${r[2] ? ` class="${r[2]}"` : ''}>${r[1]}</b></div>`).join('')}</div>${pct != null ? `<div class="prog"><div class="track"><i style="width:${Math.round(pct)}%"></i></div><b>${Math.round(pct)}%</b></div>` : ''}</div>`;
}
export function model(ctx) {
  const s = ctx.store.get();
  const week = weekId(), marks = s.refresh.weeks[week] || {}, focus = s.refresh.focus[week] || [];
  const cyc = cycleId(s.labels.cycleLen), checks = s.labels.checks[cyc] || {}, variances = s.labels.variances[cyc] || [];
  const issues = Object.values(s.issues), open = issues.filter(i => i.status !== 'completed');
  const sess = Object.entries(s.stocktake.sessions).filter(([, x]) => !x.ended)[0];
  const due = Object.values(s.assets).filter(a => a.due && (new Date(a.due) - Date.now()) / 86400000 <= 30).length;
  const todayMarks = Object.values(marks).filter(m => storeDay(m.at) === today()).length;
  return { week, marks, focus, done: focusDone(marks, focus), todayMarks, cyc, checked: Object.keys(checks).length, total: microCount(), variances: variances.length, daysLeft: daysLeftInCycle(s.labels.cycleLen), issues, open, recurring: open.filter(i => i.recur).length, sess, due, devices: Object.keys(s.devices).length };
}
export default {
  id: 'dashboard', title: 'Dashboard', icon: 'm-dashboard',
  desktop(ctx) {
    const m = model(ctx);
    const refresh = kpi('', 'pin', 'Location refresh', 'refresh', m.done, `/ ${TARGET}`, `Segments refreshed this week · ${m.week}`, [['Today', String(m.todayMarks)], ['Focus departments', m.focus.length ? m.focus.map(d => d.toUpperCase()).join(' ') : 'none set'], ['Segments left to go', String(Math.max(0, TARGET - m.done))]], m.done / TARGET * 100);
    const labels = kpi(m.checked === m.total ? 'done' : '', 'tag', 'Label integrity', 'labelint', m.checked, `/ ${m.total}`, `Micro-departments checked this cycle · ${m.daysLeft} days left`, [['Labels wrong this cycle', String(m.variances), m.variances ? 'c-red' : ''], ['Cycle', esc(m.cyc)], ['Still to check', String(m.total - m.checked)]], m.checked / m.total * 100);
    const maint = `<div class="card kpi mt"><div class="kh">${ic('tool')}<h3>Maintenance</h3><a class="open" data-go="maintenance">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${m.open.length}</span><span class="hs">open · ${m.recurring} recurring</span></div><div class="rows">${m.open.slice(0, 4).map(i => `<div class="row"><span class="l"><span class="pt" style="background:${i.status === 'open' ? '#DC2626' : '#2563EB'}"></span><span><b>${esc(i.title)}</b><span class="where">${esc(i.loc || '')} · ${ago(i.created)}</span></span></span>${status(i.status === 'open' ? 'warn' : 'info', i.status === 'open' ? 'Open' : 'To check')}</div>`).join('') || '<div class="row">Nothing open<b class="c-green">✓</b></div>'}</div></div>`;
    const st = `<div class="card kpi"><div class="kh">${ic('m-stocktake')}<h3>Stocktake</h3><a class="open" data-go="stocktake">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${m.sess ? Object.values(m.sess[1].shelves).filter(x => x.state !== 'pending').length : '—'}</span><span class="d">${m.sess ? 'counted' : ''}</span></div><div class="hl">${m.sess ? `Session ${esc(m.sess[0])} · ${m.sess[1].phase === 'final' ? 'final check' : 'counting'} · started ${fmtTime(m.sess[1].startedAt)}` : 'No session open'}</div></div>`;
    const em = `<div class="card kpi"><div class="kh">${ic('m-emergency')}<h3>Emergency</h3><a class="open" data-go="emergency">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${m.due}</span><span class="d">services due</span></div><div class="hl">Within 30 days · ${m.devices} device${m.devices === 1 ? '' : 's'} seen today</div></div>`;
    const caps = ctx.session.current?.caps || [];
    const sr = caps.includes('stockroom') ? stockroomCard(ctx) : '';
    const bd = caps.includes('backdock') ? backdockCard(ctx) : '';
    return vh(`<span class="greet">${greeting()}</span><span id="dashTitle">How we’re tracking</span>`, '', '', 'm-dashboard') +
      `<div class="dash"><div class="kpis">${refresh}${labels}${st}${sr}${bd}</div><div class="side2">${maint}${em}</div></div>`;
  },
  mount(ctx, root) { const re = () => { root.innerHTML = this.desktop(ctx); }; return ['refresh', 'labels', 'issues', 'stocktake', 'assets', 'backfill', 'cages', 'adjustments', 'dock'].map(k => ctx.store.on(k, re)); },
};
function stockroomCard(ctx) {
  const date = today(), bf = ctx.store.get('backfill');
  const subs = Object.values(bf.subs).filter(s => s.date === date);
  const pending = subs.filter(s => s.status === 'pending').length, ready = subs.filter(s => s.status === 'corrected').length, done = subs.filter(s => s.status === 'submitted').length;
  const req = (bf.requested[date] || []).filter(b => !subs.some(s => s.bay === b)).length;
  const cages = Object.values(ctx.store.get('cages')).filter(c => c.status === 'open');
  const stale = cages.filter(c => Date.now() - new Date(c.seen) > 7 * 86400000).length;
  const adj = Object.keys(ctx.store.get('adjustments')[date] || {}).length;
  return `<div class="card kpi"><div class="kh">${ic('m-bfreview')}<h3>Stockroom</h3><a class="open" data-go="bfreview">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${pending}</span><span class="d">to review</span></div><div class="hl">${req} requested · ${ready} ready · ${done} submitted today</div><div class="rows"><div class="row">Cages open<b>${cages.length}</b></div><div class="row">Not seen this week<b${stale ? ' class="c-red"' : ''}>${stale}</b></div><div class="row">SOH adjustments today<b>${adj}</b></div></div></div>`;
}
function backdockCard(ctx) {
  const open = openTrucks(ctx.store.get('dock')), live = open.filter(t => t.status === 'live'), t = live[0] || open[0];
  if (!t) return `<div class="card kpi"><div class="kh">${ic('m-receiving')}<h3>Back dock</h3><a class="open" data-go="receiving">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">0</span><span class="d">trucks on the dock</span></div><div class="hl">Nothing receiving. Start a truck from Receiving or a dock phone.</div></div>`;
  const pr = progress(t), halt = openHalt(t);
  return `<div class="card kpi"><div class="kh">${ic('m-receiving')}<h3>Back dock</h3><a class="open" data-go="receiving">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${pr.pct}%</span><span class="d">Truck ${esc(truckNo(t.id))} ${t.status === 'live' ? 'decanted' : 'staged'}</span></div><div class="hl">${pr.done} / ${pr.total} cartons · ${pr.count} pallets · ${pr.active} decanting${halt ? ` · <b class="c-red">halted · ${esc(HALT_NAME[halt.reason] || halt.reason)}</b>` : ''}</div><div class="rows"><div class="row">Landed<b>${t.landedAt ? fmtHM(t.landedAt) : '—'}</b></div><div class="row">Goal<b>${t.goalAt ? fmtHM(t.goalAt) : '—'}</b></div><div class="row">Trucks on the board<b>${open.length}</b></div></div><div class="prog"><div class="track"><i style="width:${pr.pct}%"></i></div><b>${pr.pct}%</b></div></div>`;
}
