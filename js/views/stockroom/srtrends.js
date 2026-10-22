// Trends (K2B's stockroom trends): when backfill work happens and how
// accurate it is, from the bays marked ready or submitted. Tiles, the
// weekday × time-of-day heatmap, each department's weekly pattern with its
// peak day, day and time bars, accuracy per day against the 93% goal, and
// every department and location with its accuracy and cadence. "All time"
// adds the bays retention archived after 60 days (decision 29).

import { ic, esc, vh, sub, mhead, DEPT_NAME, dep } from '../../ui.js';
import { todayKey, loadArchive, archivedRecs, archiveState } from './common.js';
import { visitsOf, trendsOf, BANDS, DAYS, GOAL } from '../../../shared/trends.js';
import { settingsOf, deptForBay } from '../../../shared/reducers/store.js';
import { tx, txn } from '../../i18n.js';

const WINDOWS = [[7, tx('7 days')], [14, tx('Fortnight')], [30, tx('Month')], [0, tx('All time')]];
const KEY = 'stockroom_trends_window';
const st = { days: (() => { try { const raw = localStorage.getItem(KEY), v = raw == null ? NaN : Number(raw); return WINDOWS.some(w => w[0] === v) ? v : 14; } catch { return 14; } })() };
const accCls = a => a == null ? '' : a >= 90 ? 'good' : a >= 75 ? 'mid' : 'bad';
const cell = (n, max) => `<td class="tr-c" style="background:rgba(20,184,166,${n ? (0.12 + 0.78 * n / max).toFixed(2) : 0})">${n || ''}</td>`;
const arrow = t => !t ? '<span class="cs-dim">—</span>' : t.dir === 'up' ? `<span class="up">▲ ${t.d}</span>` : t.dir === 'down' ? `<span class="down">▼ ${Math.abs(t.d)}</span>` : `<span class="cs-dim">● ${tx('steady')}</span>`;
const deptLabel = d => d ? `${dep(d)} <span class="cs-dim">${esc(DEPT_NAME[d] || '')}</span>` : `<span class="cs-dim">${tx('Unmapped locations')}</span>`;
const cadence = (gap, last) => gap == null ? '<span class="cs-dim">—</span>' : `${tx('every ~{n}d', { n: gap })} · ${last === 0 ? tx('today') : tx('{n}d ago', { n: last })}`;
function spark(accs) {
  if (accs.length < 2) return '';
  const W = 90, H = 24, y = a => H - 2 - (Math.max(50, Math.min(100, a)) - 50) / 50 * (H - 4);
  return `<svg class="tr-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><line x1="0" x2="${W}" y1="${y(GOAL)}" y2="${y(GOAL)}" class="goal"/><polyline points="${accs.map((a, i) => `${(i / (accs.length - 1) * (W - 2) + 1).toFixed(1)},${y(a).toFixed(1)}`).join(' ')}"/></svg>`;
}
function accChart(points) {
  if (points.length < 2) return `<p class="lbl">${tx('Accuracy per day needs two days with a ready bay.')}</p>`;
  const W = 660, H = 130, P = 26, x = i => P + i / (points.length - 1) * (W - P * 2), y = a => H - 18 - (Math.max(50, Math.min(100, a)) - 50) / 50 * (H - 30);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.acc).toFixed(1)}`).join('');
  const lab = i => `<text x="${x(i)}" y="${H - 3}" text-anchor="middle">${points[i].date.slice(5)}</text>`;
  return `<svg class="tr-acc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tx('Accuracy per day')}">${[50, 75, 93, 100].map(g => `<line x1="${P}" x2="${W - P}" y1="${y(g)}" y2="${y(g)}" class="${g === GOAL ? 'goal' : 'g'}"/><text x="${P - 4}" y="${y(g) + 3}" text-anchor="end">${g}</text>`).join('')}<path d="${line}L${x(points.length - 1)} ${y(50)}L${x(0)} ${y(50)}Z" class="area"/><path d="${line}" class="ln"/>${lab(0)}${points.length > 2 ? lab(Math.floor((points.length - 1) / 2)) : ''}${lab(points.length - 1)}</svg>`;
}
const bars = (rows, max) => rows.map(([label, n, note]) => `<div class="tr-bar"><span>${label}</span><div><i style="width:${max ? Math.round(n / max * 100) : 0}%"></i></div><b>${n}</b><small class="cs-dim">${note || ''}</small></div>`).join('');

function page(ctx) {
  const today = todayKey(), cfg = settingsOf(ctx.store.get('settings')), ranges = cfg.deptRanges;
  const live = ctx.store.get('backfill').subs, subs = st.days ? live : { ...live, ...Object.fromEntries(archivedRecs(live).map(r => [`${r.bay}:${r.date}`, r])) };
  const v = visitsOf(subs, { today, days: st.days, tz: cfg.tz, deptFor: b => deptForBay(ranges, b) }), t = trendsOf(v, today);
  const note = st.days ? '' : { ready: '', loading: ` · ${tx('reading the archive…')}`, failed: ` · ${tx('last 60 days only (archive offline)')}` }[archiveState()];
  const seg = `<div class="seg">${WINDOWS.map(([d, l]) => `<button class="${st.days === d ? 'on' : ''}" data-act="tr-win" data-d="${d}">${l}</button>`).join('')}</div>`;
  const head = vh(tx('Trends'), sub(tx('Backfill'), txn(t.visits, '{n} visit', '{n} visits'), WINDOWS.find(w => w[0] === st.days)[1] + note), seg, 'chart');
  if (!t.visits) return head + `<div class="card" style="padding:24px"><b>${tx('No ready bays in this window')}</b><p class="lbl">${tx('Trends fill in as bays are marked ready or submitted at Backfill review.')}</p></div>`;
  const tiles = `<div class="wb-kpis tr-tiles"><div class="wb-kpi"><span>${tx('Locations done')}</span><b>${t.visits}</b><small>${tx('{n} active days · {per}/day', { n: t.activeDays, per: t.perDay })}</small></div><div class="wb-kpi ${accCls(t.avgAcc) === 'good' ? 'good' : accCls(t.avgAcc) === 'bad' ? 'bad' : 'warn'}"><span>${tx('Average accuracy')}</span><b>${t.avgAcc ?? '—'}<small>%</small></b><small>${tx('goal {n}%', { n: GOAL })}</small></div><div class="wb-kpi"><span>${tx('Trend')}</span><b>${arrow(t.trend)}</b><small>${tx('newer half against older')}</small></div><div class="wb-kpi"><span>${tx('Busiest day')}</span><b>${t.busiest == null ? '—' : tx(DAYS[t.busiest])}</b><small>${t.busiest == null ? '' : txn(t.byWd[t.busiest], '{n} visit', '{n} visits')}</small></div></div>`;
  const hmax = Math.max(1, ...t.heat.flat());
  const heat = `<div class="card"><div class="ch"><h3>${tx('When work happens')}</h3><span class="cs-dim">${tx('{n} of {total} visits have a completion time', { n: t.timed, total: t.visits })}</span></div><table class="tr-heat"><thead><tr><th></th>${BANDS.map(b => `<th>${tx(b[0])}</th>`).join('')}<th>${tx('Total')}</th></tr></thead><tbody>${DAYS.map((d, i) => `<tr><th>${tx(d)}</th>${t.heat[i].map(n => cell(n, hmax)).join('')}<td class="n"><b>${t.heat[i].reduce((a, b) => a + b, 0)}</b></td></tr>`).join('')}</tbody></table></div>`;
  const dmax = Math.max(1, ...t.deptWeek.flatMap(d => d.counts));
  const week = `<div class="card"><div class="ch"><h3>${tx('Weekly pattern by department')}</h3></div><div class="mfx-scroll"><table class="tr-heat"><thead><tr><th></th>${DAYS.map(d => `<th>${tx(d)}</th>`).join('')}<th>${tx('Peak')}</th></tr></thead><tbody>${t.deptWeek.map(r => `<tr><th class="tr-dept">${deptLabel(r.dept)}</th>${r.counts.map(n => cell(n, dmax)).join('')}<td>${r.peak ? `${tx(DAYS[r.peak.day])}${r.peak.sole ? ` <small class="cs-dim">${tx('only day')}</small>` : ''}` : `<span class="cs-dim">${tx('no clear day')}</span>`}</td></tr>`).join('')}</tbody></table></div></div>`;
  const dayBars = `<div class="card"><div class="ch"><h3>${tx('By day of week')}</h3></div>${bars(DAYS.map((d, i) => [tx(d), t.byWd[i], t.daysPer[i] ? tx('{n} days · {avg} avg', { n: t.daysPer[i], avg: Math.round(t.byWd[i] / t.daysPer[i] * 10) / 10 }) : '']), Math.max(...t.byWd))}</div>`;
  const timeBars = `<div class="card"><div class="ch"><h3>${tx('By time of day')}</h3></div>${bars(BANDS.map((b, i) => [tx(b[0]), t.byBand[i], t.timed ? `${Math.round(t.byBand[i] / t.timed * 100)}%` : '']), Math.max(...t.byBand))}</div>`;
  const acc = `<div class="card"><div class="ch"><h3>${tx('Accuracy per day')}</h3><span class="cs-dim">${tx('goal {n}% dashed', { n: GOAL })}</span></div>${accChart(t.accPerDay)}</div>`;
  const vmax = Math.max(1, ...t.byDept.map(d => d.visits));
  const depts = `<div class="card"><div class="ch"><h3>${tx('By department')}</h3><span class="cs-dim">${tx('from the bay ranges in Departments')}</span></div>${t.byDept.map(d => `<div class="tr-dept-row"><span>${deptLabel(d.dept)}</span><div class="tr-bar1"><i style="width:${Math.round(d.visits / vmax * 100)}%"></i></div><b class="${accCls(d.acc)}">${d.acc ?? '—'}%</b><small class="cs-dim">${tx('{visits} visits · {locs} locations', { visits: d.visits, locs: d.locs })} · ${d.gap == null ? tx('once') : tx('every ~{n}d', { n: d.gap })}</small></div>`).join('')}</div>`;
  const lmax = Math.max(1, ...t.byLoc.map(l => l.times));
  const locs = `<div class="card"><div class="ch"><h3>${tx('By location')}</h3><span class="cs-dim">${tx('{repeat} repeat, {once} seen once', { repeat: t.repeat, once: t.once })}</span></div><div class="mfx-scroll"><table class="wb-t tr-loc"><thead><tr><th>${tx('Location')}</th><th>${tx('Times')}</th><th>${tx('Mon–Sun')}</th><th>${tx('Peak')}</th><th>${tx('Accuracy')}</th><th class="n">${tx('Avg')}</th><th>${tx('Trend')}</th><th>${tx('Cadence')}</th></tr></thead><tbody>${t.byLoc.slice(0, 200).map(l => `<tr><td class="mono"><b>${esc(l.loc)}</b>${l.dept ? ' ' + dep(l.dept) : ''}</td><td><span class="tr-times"><i style="width:${Math.round(l.times / lmax * 100)}%"></i></span> ×${l.times}</td><td><span class="tr-strip">${l.week.map((n, i) => `<i class="${n ? 'on' : ''}" title="${tx(DAYS[i])}: ${n}"></i>`).join('')}</span></td><td>${l.peak ? tx(DAYS[l.peak.day]) : '<span class="cs-dim">—</span>'}</td><td>${spark(l.accs)}</td><td class="n ${accCls(l.avg)}">${l.avg ?? '—'}%</td><td>${arrow(l.trend)}</td><td>${cadence(l.gap, l.lastDays)}</td></tr>`).join('')}</tbody></table></div></div>`;
  return head + tiles + `<div class="tr-grid">${heat}${week}</div><div class="tr-grid3">${dayBars}${timeBars}${acc}</div>${depts}${locs}`;
}

export default {
  id: 'srtrends', title: tx('Trends'), icon: 'chart', area: 'stockroom',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) { return page(ctx); },
  mount(ctx, root) {
    if (!st.days) loadArchive(ctx, () => ctx.rerender());
    root.addEventListener('click', e => { const a = e.target.closest('[data-act="tr-win"]'); if (!a) return; st.days = Number(a.dataset.d); try { localStorage.setItem(KEY, String(st.days)); } catch {} ctx.rerender(); });
    return [ctx.store.on('backfill', () => ctx.rerender()), ctx.store.on('settings', () => ctx.rerender())];
  },
};
