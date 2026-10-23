// Receiving analytics (Decant Visualiser's analytics tab) over the history
// rows: worker performance by period against the period before (with the
// trend and a spreadsheet of the team), department speed, downtime by
// reason, the trucks over time, and for the truck in hand its manifest by
// micro-department (landed and cleared) and its top products. What
// arrived (the Inventory hub's Trends, read from the finished trucks since
// 23 Oct 2026): cartons a week by department, with the departments on the map.

import { $, ic, esc, vh, sub, toast, mhead, fmtDate, dep, today } from '../../ui.js';
import { mountMap, bindMapChrome, hasMap } from '../../map.js';
import { truckNo, fmtMins, holdName, microDept, microChip, microName, openTrucks, pallets } from './common.js';
import { consolsOf } from '../../../shared/reducers/backdock.js';
import { workerPerf, deptSpeed, downtimeBy, teamCsv, arrivalsByWeek, PERIODS, TREND_PCT } from '../../../shared/dockstats.js';
import { codeName, mapCard, paintMap, showPaint } from './loads.js';
import { itemCartons } from './manifests.js';
import { ensureNames, kcCopy, itemName } from '../stockroom/common.js';
import { tx, txn } from '../../i18n.js';

const st = { period: '7', down: 7, weeks: 12, paint: null };
const WEEKS = [[4, tx('4 weeks')], [12, tx('12 weeks')], [26, tx('26 weeks')], ['all', tx('All')]];
const PAL = ['#EA580C', '#0FA3A3', '#7C3AED', '#2563EB', '#15803D', '#DB2777'];
const DOWN = [[7, tx('Week')], [14, tx('Fortnight')], [30, tx('Month')], [0, tx('All')]];
const chip = microChip;
const spark = xs => { if (xs.length < 2) return ''; const max = Math.max(...xs), min = Math.min(...xs), W = 80, H = 22; return `<svg class="da-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${xs.map((v, i) => `${i ? 'L' : 'M'}${(i / (xs.length - 1) * W).toFixed(1)} ${(H - 2 - (max === min ? 0.5 : (v - min) / (max - min)) * (H - 4)).toFixed(1)}`).join('')}"/></svg>`; };

// The truck in hand: the one on the dock, else the latest still kept with its pallets.
function truckInHand(dock) {
  const open = openTrucks(dock)[0]; if (open?.manifest) return open;
  const kept = Object.entries(dock.trucks || {}).filter(([, t]) => t.manifest).sort((a, b) => b[0].localeCompare(a[0]))[0];
  return kept ? { id: kept[0], ...kept[1] } : null;
}
function microTable(t) {
  const on = {}; for (const p of pallets(t)) for (const id of p.consolIds || []) on[id] = p.status === 'done' ? 'done' : 'landed';
  const acc = {}; let total = 0;
  for (const c of consolsOf(t)) for (const it of c.items || []) {
    const d = String(it.dept || '???'), a = (acc[d] ||= { dept: d, ctn: 0, landed: 0, done: 0 }), n = itemCartons(c, it);
    a.ctn += n; total += n; if (on[c.id]) a.landed += n; if (on[c.id] === 'done') a.done += n;
  }
  // Consols with no lines still count, as "???".
  for (const c of consolsOf(t)) if (!(c.items || []).length) { const a = (acc['???'] ||= { dept: '???', ctn: 0, landed: 0, done: 0 }); a.ctn += c.cartons; total += c.cartons; if (on[c.id]) a.landed += c.cartons; if (on[c.id] === 'done') a.done += c.cartons; }
  return { total, rows: Object.values(acc).sort((a, b) => b.ctn - a.ctn) };
}
function topProducts(t) {
  const m = new Map();
  for (const c of consolsOf(t)) for (const it of c.items || []) { const r = m.get(it.k) || { k: it.k, d: it.d || '', dept: it.dept, units: 0 }; r.units += Number(it.q) || 0; m.set(it.k, r); }
  return [...m.values()].sort((a, b) => b.units - a.units).slice(0, 8);
}

// What arrived each week, by department: the chart, four callouts and the
// top departments, each painted on the map (or all of them as heat).
const arrivals = ctx => arrivalsByWeek(ctx.store.get('dock').history, { weeks: st.weeks, today: today() });
const arrivalsHeat = r => ({ mode: 'heat', label: tx('Arrivals, {period}', { period: WEEKS.find(p => p[0] === st.weeks)?.[1] || '' }), units: r.depts });
function arrived(ctx) {
  const r = arrivals(ctx), c = r.callouts;
  const pills = `<div class="seg">${WEEKS.map(([p, l]) => `<button class="${st.weeks === p ? 'on' : ''}" data-act="da-weeks" data-p="${p}">${l}</button>`).join('')}</div>`;
  if (!c.trucks) return `<div class="card da-arrived"><div class="ch"><h3>${tx('What arrived')}</h3>${pills}</div><p class="lbl">${tx('No finished trucks in this period. This fills in as trucks are finalised at Receiving.')}</p></div>`;
  const six = r.depts.slice(0, 6).map(x => x[0]), sum = r.depts.reduce((n, x) => n + x[1], 0) || 1;
  const W = 640, H = 180, P = 28, bw = (W - P * 2) / r.weeks.length, max = Math.max(1, ...r.weeks.map(w => w.cartons));
  const bars = r.weeks.map((w, i) => { let y = H - 22; const segs = [...six.map((d, k) => [w.depts[d] || 0, PAL[k]]), [w.cartons - six.reduce((n, d) => n + (w.depts[d] || 0), 0), '#C9D3D9']]; return segs.map(([u, col]) => { const h = u / max * (H - 40); y -= h; return h > 0 ? `<rect x="${(P + i * bw + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"><title>${tx('{week}: {n} cartons', { week: esc(fmtDate(w.wk)), n: Math.round(u).toLocaleString() })}</title></rect>` : ''; }).join('') + (r.weeks.length <= 14 || i % 2 === 0 ? `<text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(w.wk.slice(5))}</text>` : ''); }).join('');
  const chart = `<svg class="inv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tx('Cartons arriving per week')}">${bars}</svg><div class="inv-legend">${six.map((d, k) => `<span><i style="background:${PAL[k]}"></i>${esc(d)} ${esc(codeName(d))}</span>`).join('')}<span><i style="background:#C9D3D9"></i>${tx('Other')}</span></div>`;
  const tiles = `<div class="wb-kpis inv-kpis"><div class="wb-kpi"><span>${tx('Cartons')}</span><b>${c.cartons.toLocaleString()}</b><small>${txn(c.trucks, '{n} truck', '{n} trucks')}</small></div><div class="wb-kpi"><span>${tx('Per truck')}</span><b>${c.perTruck.toLocaleString()}</b><small>${tx('cartons')}</small></div><div class="wb-kpi"><span>${tx('Busiest week')}</span><b>${c.busiest ? esc(fmtDate(c.busiest)) : '—'}</b><small>${tx('{n} cartons', { n: c.busiestCartons.toLocaleString() })}</small></div><div class="wb-kpi${c.trend > 0 ? ' good' : c.trend < 0 ? ' bad' : ''}"><span>${tx('Trend')}</span><b>${c.trend == null ? '—' : (c.trend > 0 ? '▲ ' : c.trend < 0 ? '▼ ' : '') + Math.abs(c.trend) + '%'}</b><small>${c.trend == null ? tx('needs 4 active weeks') : tx('newer half against older')}</small></div></div>`;
  const depts = r.depts.slice(0, 12).map(([d, u]) => `<button class="inv-crow${st.paint?.mode === 'dept' && st.paint.code === d ? ' on' : ''}" data-act="paint" data-code="${esc(d)}"><span class="cd">${esc(d)}</span><span class="nm">${esc(codeName(d))}</span><span class="bar"><i style="width:${Math.max(2, Math.round(u / sum * 100))}%"></i></span><b>${Math.round(u).toLocaleString()}</b><small>${Math.round(u / sum * 100)}%</small></button>`).join('');
  return `<div class="card da-arrived"><div class="ch"><h3>${tx('What arrived')}</h3><span class="cs-dim">${tx('finished trucks, by the manifest’s departments')}</span>${pills}</div>${tiles}<div class="inv-tgrid"><div>${chart}</div><div><div class="inv-consh"><b>${tx('Top departments')}</b><button class="btn sm${st.paint?.mode === 'heat' ? ' on' : ''}" data-act="heat">${ic('layers')}${tx('Show on map')}</button></div><div class="inv-cons">${depts}</div></div></div></div>` + mapCard(st.paint, hasMap());
}

function page(ctx) {
  const dock = ctx.store.get('dock'), hist = dock.history || [], now = Date.now();
  const period = st.period === 'truck' ? 'truck' : Number(st.period);
  const perf = workerPerf(hist, now, period), speed = deptSpeed(hist, now, 30), dt = downtimeBy(hist, now, st.down || null);
  const head = vh(tx('Receiving analytics'), sub(txn(hist.length, '{n} truck in history', '{n} trucks in history'), tx('D-numbers only')), `<button class="btn" data-act="da-csv">${ic('file')}${tx('Team CSV')}</button>`, 'bars');
  const periods = `<div class="seg">${Object.entries(PERIODS).map(([k, l]) => `<button class="${String(st.period) === k ? 'on' : ''}" data-act="da-period" data-p="${k}">${tx(l)}</button>`).join('')}</div>`;
  const perfCard = `<div class="card"><div class="ch"><h3>${tx('Worker performance')}</h3>${periods}</div>${perf.length ? `<table class="wb-t da-t"><thead><tr><th>${tx('D-number')}</th><th class="n">${tx('Trucks')}</th><th class="n">${tx('Pallets')}</th><th class="n">${tx('Cartons')}</th><th class="n">${tx('Worked')}</th><th class="n">${tx('Rate')}</th><th class="n">${tx('vs before')}</th><th>${tx('Last 10 trucks')}</th></tr></thead><tbody>${perf.map(r => `<tr class="${r.trendingDown ? 'low' : ''}"><td><b>${esc(r.pid)}</b>${r.trendingDown ? ` <span class="status warn">${tx('Trending down')}</span>` : ''}</td><td class="n">${r.trucks}</td><td class="n">${r.pallets}</td><td class="n">${r.cartons}</td><td class="n">${fmtMins(r.mins)}</td><td class="n">${tx('<b>{n}</b> ctn/h', { n: r.rate })}</td><td class="n">${r.delta === null ? '<span class="cs-dim">—</span>' : `<span class="${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '▲' : '▼'} ${Math.abs(r.delta)}%</span>`}</td><td>${spark(r.spark)}</td></tr>`).join('')}</tbody></table><p class="lbl">${tx('Rate is cartons over worked time (hold-ups and their own breaks out). "Trending down" is {pct}% or more under the window before.', { pct: -TREND_PCT })}</p>` : `<p class="lbl">${tx('No finalised truck in this window.')}</p>`}</div>`;
  const maxR = Math.max(1, ...speed.map(d => d.rate));
  const speedCard = `<div class="card"><div class="ch"><h3>${tx('Department speed')}</h3><span class="cs-dim">${tx('last 30 days · over 30 worked min')}</span></div>${speed.length ? speed.map(d => `<div class="da-bar">${chip(d.dept)}<div><i style="width:${Math.round(d.rate / maxR * 100)}%"></i></div><span>${tx('<b>{n}</b> ctn/h', { n: d.rate })} <small class="cs-dim">${tx('{n} ctn', { n: d.cartons })} · ${fmtMins(d.workedMins)}</small></span></div>`).join('') : `<p class="lbl">${tx('Speeds appear once linked pallets have 30 minutes or more of work in a department.')}</p>`}</div>`;
  const downSeg = `<div class="seg">${DOWN.map(([k, l]) => `<button class="${st.down === k ? 'on' : ''}" data-act="da-down" data-d="${k}">${l}</button>`).join('')}</div>`;
  const downCard = `<div class="card"><div class="ch"><h3>${tx('Downtime by reason')}</h3>${downSeg}</div>${dt.rows.length ? `<div class="wb-sbar">${dt.rows.map((r, i) => `<i style="flex:${r.mins};background:hsl(${(i * 47) % 360} 60% 52%)" title="${esc(holdName(r))}: ${tx('{n} min', { n: r.mins })}"></i>`).join('')}</div><table class="wb-t"><thead><tr><th>${tx('Reason')}</th><th class="n">${tx('Minutes')}</th><th class="n">${tx('Times')}</th><th class="n">${tx('Trucks')}</th><th class="n">${tx('portion::Share')}</th></tr></thead><tbody>${dt.rows.map(r => `<tr><td>${esc(holdName(r))}</td><td class="n">${r.mins}</td><td class="n">${r.count}</td><td class="n">${r.trucks}</td><td class="n">${r.share}%</td></tr>`).join('')}</tbody><tfoot><tr><td>${tx('Total')}</td><td class="n">${dt.total}</td><td colspan="3"></td></tr></tfoot></table>` : `<p class="lbl">${tx('No downtime in this window.')}</p>`}</div>`;
  const last = hist.slice(-20), maxC = Math.max(1, ...last.map(r => r.clearMins || 0)), maxRate = Math.max(1, ...last.map(r => r.teamRate || 0));
  const trucksCard = `<div class="card"><div class="ch"><h3>${tx('Trucks over time')}</h3><span class="cs-dim">${tx('last {n} · clear time and team rate', { n: last.length })}</span></div>${last.length ? `<div class="da-trucks">${last.map(r => `<div title="${esc(fmtDate(r.date))} ${tx('Truck {no}', { no: esc(truckNo(r.id)) })}: ${fmtMins(r.clearMins)} · ${tx('{n} ctn/h', { n: r.teamRate })} · ${tx('{n} ctn', { n: r.cartons })}"><i class="c" style="height:${Math.round((r.clearMins || 0) / maxC * 100)}%"></i><i class="r" style="height:${Math.round((r.teamRate || 0) / maxRate * 100)}%"></i><small>${esc(fmtDate(r.date))}</small></div>`).join('')}</div><div class="wb-legend"><span><i class="l" style="background:#94A3B8"></i>${tx('clear time')}</span><span><i class="l" style="background:#2563EB"></i>${tx('team rate')}</span></div>` : `<p class="lbl">${tx('No finalised truck yet.')}</p>`}</div>`;
  const t = truckInHand(dock);
  let truckCards = '';
  if (t) {
    const mt = microTable(t), top = topProducts(t);
    truckCards = `<div class="card"><div class="ch"><h3>${tx('Manifest by micro-department')}</h3><span class="cs-dim">${tx('Truck {no}', { no: esc(truckNo(t.id)) })} · ${esc(t.manifest.manNo)}</span></div><table class="wb-t"><thead><tr><th>${tx('Dept')}</th><th class="n">${tx('Cartons')}</th><th class="n">${tx('portion::Share')}</th><th>${tx('Landed')}</th><th>${tx('decanted::Cleared')}</th></tr></thead><tbody>${mt.rows.map(r => { const l = r.ctn ? Math.round(r.landed / r.ctn * 100) : 0, d = r.ctn ? Math.round(r.done / r.ctn * 100) : 0; return `<tr><td>${chip(r.dept)} <span class="mfx-dn"><small class="cs-dim mono">${esc(r.dept)}</small> ${esc(microName(r.dept) || tx('Unknown department'))}</span></td><td class="n">${Math.round(r.ctn)}</td><td class="n">${mt.total ? Math.round(r.ctn / mt.total * 100) : 0}%</td><td><span class="mfx-pct"><i style="width:${l}%;background:#3B82F6"></i></span> ${l}%</td><td><span class="mfx-pct"><i style="width:${d}%"></i></span> ${d}%</td></tr>`; }).join('')}</tbody></table></div>` +
      `<div class="card"><div class="ch"><h3>${tx('Top products')}</h3><span class="cs-dim">${tx('by units · Truck {no}', { no: esc(truckNo(t.id)) })}</span></div>${top.map((r, i) => `<div class="da-top"><b>${i + 1}</b><span class="mono">${kcCopy(r.k)}</span><span class="nm">${itemName(r.k, r.d || '')}</span>${chip(r.dept)}<span class="n">${tx('{n} units', { n: r.units })}</span></div>`).join('') || `<p class="lbl">${tx('The manifest carries no lines.')}</p>`}</div>`;
  }
  return head + `<div class="da-grid"><div>${perfCard}${trucksCard}${truckCards ? `<div class="wb-two">${truckCards}</div>` : ''}</div><div>${speedCard}${downCard}</div></div><div class="da-more">${arrived(ctx)}</div>`;
}

export default {
  id: 'danalytics', title: tx('Analytics'), icon: 'bars', area: 'backdock',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) { return page(ctx); },
  mount(ctx, root) {
    const t = truckInHand(ctx.store.get('dock')); if (t) ensureNames(ctx, topProducts(t).map(r => r.k), () => ctx.rerender());
    let map = null; const stage = $('#mapstage', root);
    if (stage) { map = mountMap(stage, { badges: true }); bindMapChrome(root, map); paintMap(ctx, map, st.paint); }
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'da-period') { st.period = a.dataset.p; ctx.rerender(); }
      else if (a.dataset.act === 'da-weeks') { st.weeks = a.dataset.p === 'all' ? 'all' : Number(a.dataset.p); st.paint = null; ctx.rerender(); }
      else if (a.dataset.act === 'paint') { st.paint = st.paint?.mode === 'dept' && st.paint.code === a.dataset.code ? null : { mode: 'dept', code: a.dataset.code }; showPaint(ctx, root, map, st.paint); }
      else if (a.dataset.act === 'heat') { st.paint = st.paint?.mode === 'heat' ? null : arrivalsHeat(arrivals(ctx)); showPaint(ctx, root, map, st.paint); }
      else if (a.dataset.act === 'unpaint') { st.paint = null; showPaint(ctx, root, map, null); }
      else if (a.dataset.act === 'da-down') { st.down = Number(a.dataset.d); ctx.rerender(); }
      else if (a.dataset.act === 'da-csv') {
        const csv = teamCsv(ctx.store.get('dock').history, Date.now(), st.period === 'truck' ? 'truck' : Number(st.period));
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), l = document.createElement('a'); l.href = url; l.download = `team-${ctx.storeNo}-${st.period === 'truck' ? 'last-truck' : st.period + 'd'}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast(tx('Team CSV downloaded'));
      }
    });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};
