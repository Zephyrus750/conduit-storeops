// Today (the manager phone, planned 12 Oct 2026): the store at a glance on
// a manager's phone. What needs someone first (the alerts bell's list), then
// a card for each area with the day's numbers, each opening that area, and
// the store's devices. Its strip is Today · Floor · Stock · Dock · More
// (js/registry.js STRIP.today); a phone that drops back to the Floor after
// the store's idle re-lock leaves it.

import { ic, esc, mhead, today, weekId, fmtLong, timePassed, empty } from '../ui.js';
import { hasArea } from '../unlock.js';
import { currentAlerts } from '../alerts.js';
import { focusDone } from '../../shared/reducers/floor.js';
import { openTrucks, progress, truckNo, fmtHM } from './backdock/common.js';
import { dockNow } from './backdock/wallboard.js';
import { overdueIssues } from './maintenance.js';
import { tx, txn } from '../i18n.js';

const TARGET = 100;
const row = (k, v, tone = '') => `<div class="mt-r"><span>${k}</span><b class="${tone}">${v}</b></div>`;
const card = (icon, title, go, rows, locked) => `<button class="mt-card${locked ? ' locked' : ''}" data-go="${go}"><div class="mt-ch">${ic(icon)}<b>${title}</b>${ic(locked ? 'lock' : 'chev')}</div>${locked ? `<p class="mt-lock">${tx('Needs the {area} code', { area: title })}</p>` : rows}</button>`;

function floorCard(ctx) {
  const r = ctx.store.get('refresh') || { weeks: {}, focus: {} }, wk = weekId(), marks = r.weeks?.[wk] || {}, focus = r.focus?.[wk] || [];
  const counted = focusDone(marks, focus), day = today(), todayN = Object.values(marks).filter(m => String(m.at || '').slice(0, 10) === day).length;
  const issues = Object.values(ctx.store.get('issues') || {}).filter(i => !i.removed && i.status !== 'completed'), late = overdueIssues(ctx.store);
  return card('m-map', tx('Floor'), 'map',
    row(tx('Refresh this week'), `${counted} / ${TARGET}`, counted >= TARGET ? 'good' : '') +
    row(tx('Refreshed today'), String(todayN)) +
    row(tx('Maintenance open'), late ? tx('{n} · {late} overdue', { n: issues.length, late }) : String(issues.length), late ? 'warn' : ''));
}
function stockCard(ctx) {
  if (!hasArea(ctx.session, 'stockroom')) return card('box', tx('Stockroom'), 'srhome', '', true);
  const day = today(), subs = Object.values(ctx.store.get('backfill')?.subs || {}).filter(x => x.date === day);
  const by = st => subs.filter(x => x.status === st).length, adj = Object.values(ctx.store.get('adjustments')?.[day] || {}), open = adj.filter(i => !i.done).length;
  const pulls = Object.values(ctx.store.get('pulls')?.sessions || {}).filter(s => !s.ended).flatMap(s => Object.values(s.lines || {})).filter(l => l.st === 'todo').length;
  return card('box', tx('Stockroom'), 'srhome',
    row(tx('Backfill today'), tx('{pending} to review · {ready} ready · {sent} submitted', { pending: by('pending'), ready: by('ready') + by('corrected'), sent: by('submitted') })) +
    row(tx('Adjustments today'), open ? tx('{n} to adjust', { n: open }) : String(adj.length), open ? 'warn' : '') +
    (pulls ? row(tx('Live pull'), tx('{n} waiting', { n: pulls }), 'warn') : ''));
}
function dockCard(ctx) {
  if (!hasArea(ctx.session, 'backdock')) return card('truck', tx('Back dock'), 'bdhome', '', true);
  const dock = ctx.store.get('dock'), open = openTrucks(dock), t = open.find(x => x.status === 'live') || open[0], day = today();
  const done = (dock.history || []).filter(h => h.id.slice(0, 10) === day).length;
  const slots = Object.entries(ctx.store.get('plan')?.days?.[day]?.slots || {}).sort((a, b) => String(a[1].eta || '').localeCompare(String(b[1].eta || '')));
  let rows = '';
  if (t) {
    const pr = progress(t), n = dockNow(dock, t);
    rows += row(tx('Truck {n}', { n: truckNo(t.id) }), `${pr.done} / ${pr.total} · ${pr.pct}%`);
    if (n.ahead !== null) rows += row(tx('Against the goal'), n.ahead >= 0 ? tx('▲ {n} ahead of pace', { n: n.ahead }) : tx('▼ {n} behind pace', { n: -n.ahead }), n.ahead >= 0 ? 'good' : 'warn');
    if (n.fc.at) rows += row(tx('Forecast finish'), fmtHM(new Date(n.fc.at).toISOString()), n.goal ? (n.fc.at <= n.goal ? 'good' : 'bad') : '');
  } else rows += row(tx('On the dock'), tx('No truck'));
  if (slots.length) rows += row(tx('Still to come'), slots.map(([no, s]) => `T${esc(no)}${s.eta ? ' ' + esc(s.eta) : ''}`).join(' · '));
  rows += row(tx('Cleared today'), String(done));
  return card('truck', tx('Back dock'), 'bdhome', rows);
}
// The store's devices, from their heartbeats (the devices projection, which
// only managers' devices hold).
function devicesCard(ctx) {
  const devs = Object.values(ctx.store.get('devices') || {}), now = Date.now();
  if (!devs.length) return '';
  const on = devs.filter(d => d.online !== false && now - Date.parse(d.last) < 10 * 60000), waiting = devs.filter(d => d.outbox > 0), err = devs.filter(d => d.lastError && now - Date.parse(d.last) < 86400e3);
  return `<div class="mt-card static"><div class="mt-ch">${ic('phone')}<b>${tx('Devices')}</b></div>` +
    row(tx('Online now'), tx('{n} of {total}', { n: on.length, total: devs.length })) +
    (waiting.length ? row(tx('With changes not sent'), String(waiting.length), 'warn') : '') +
    (err.length ? row(tx('Reporting an error'), String(err.length), 'bad') : '') + '</div>';
}

export default {
  id: 'mtoday', title: tx('Today'), icon: 'm-dashboard',
  managers: true,
  // Phone only: on a PC the Dashboard is the store at a glance.
  desktopView: 'dashboard',
  desktop() { return ''; },
  mobile(ctx) {
    const needs = currentAlerts().filter(x => x.level !== 'info'), routine = currentAlerts().filter(x => x.level === 'info');
    const line = x => `<button class="al-row ${x.level}" data-al="${esc(x.go)}">${ic(x.icon)}<span>${esc(x.text)}</span>${ic('chev')}</button>`;
    return mhead(tx('Today'), `${esc(fmtLong())} · ${esc(ctx.storeName || ctx.storeNo)}`) +
      `<div class="mt">` +
      `<div class="mt-sec">${tx('Needs you')}</div>` + (needs.length ? `<div class="al-list">${needs.map(line).join('')}</div>` : empty(tx('Nothing needs you right now.'), { icon: 'check', sm: true })) +
      (routine.length ? `<div class="al-list mt-routine">${routine.map(line).join('')}</div>` : '') +
      `<div class="mt-sec">${tx('The store')}</div><div class="mt-grid">${floorCard(ctx)}${stockCard(ctx)}${dockCard(ctx)}${devicesCard(ctx)}</div></div>`;
  },
  mount(ctx, root) {
    root.addEventListener('click', e => { const b = e.target.closest('[data-al]'); if (!b) return; if (b.dataset.al === 'sync') document.querySelector('[data-shell-act="sync"]')?.click(); else ctx.go(b.dataset.al); });
    let t = 0; const soon = () => { clearTimeout(t); t = setTimeout(() => ctx.rerender(), 1200); };
    const tick = setInterval(() => ctx.rerender(), 60000);
    return [ctx.store.on('*', soon), () => clearTimeout(t), () => clearInterval(tick)];
  },
};
