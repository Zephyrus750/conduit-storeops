// Receiving analytics (Decant Visualiser's analytics tab) over the history
// rows: worker performance by period against the period before (with the
// trend and a spreadsheet of the team), department speed, downtime by
// reason, the trucks over time, and for the truck in hand its manifest by
// micro-department (landed and cleared) and its top products.

import { ic, esc, vh, sub, toast, mhead, fmtDate, dep } from '../../ui.js';
import { truckNo, fmtMins, holdName, microDept, openTrucks, pallets } from './common.js';
import { consolsOf } from '../../../shared/reducers/backdock.js';
import { workerPerf, deptSpeed, downtimeBy, teamCsv, PERIODS, TREND_PCT } from '../../../shared/dockstats.js';
import { itemCartons } from './manifests.js';
import { ensureNames, nameOf } from '../stockroom/common.js';

const st = { period: '7', down: 7 };
const DOWN = [[7, 'Week'], [14, 'Fortnight'], [30, 'Month'], [0, 'All']];
const chip = d => { const dd = microDept(d); return dd ? dep(dd) : `<span class="dep" style="background:#64748B">${esc(d || '???')}</span>`; };
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

function page(ctx) {
  const dock = ctx.store.get('dock'), hist = dock.history || [], now = Date.now();
  const period = st.period === 'truck' ? 'truck' : Number(st.period);
  const perf = workerPerf(hist, now, period), speed = deptSpeed(hist, now, 30), dt = downtimeBy(hist, now, st.down || null);
  const head = vh('Receiving analytics', sub(`${hist.length} truck${hist.length === 1 ? '' : 's'} in history`, 'D-numbers only'), `<button class="btn" data-act="da-csv">${ic('file')}Team CSV</button>`, 'bars');
  const periods = `<div class="seg">${Object.entries(PERIODS).map(([k, l]) => `<button class="${String(st.period) === k ? 'on' : ''}" data-act="da-period" data-p="${k}">${l}</button>`).join('')}</div>`;
  const perfCard = `<div class="card"><div class="ch"><h3>Worker performance</h3>${periods}</div>${perf.length ? `<table class="wb-t da-t"><thead><tr><th>D-number</th><th class="n">Trucks</th><th class="n">Pallets</th><th class="n">Cartons</th><th class="n">Worked</th><th class="n">Rate</th><th class="n">vs before</th><th>Last 10 trucks</th></tr></thead><tbody>${perf.map(r => `<tr class="${r.trendingDown ? 'low' : ''}"><td><b>${esc(r.pid)}</b>${r.trendingDown ? ' <span class="status warn">Trending down</span>' : ''}</td><td class="n">${r.trucks}</td><td class="n">${r.pallets}</td><td class="n">${r.cartons}</td><td class="n">${fmtMins(r.mins)}</td><td class="n"><b>${r.rate}</b> ctn/h</td><td class="n">${r.delta === null ? '<span class="cs-dim">—</span>' : `<span class="${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '▲' : '▼'} ${Math.abs(r.delta)}%</span>`}</td><td>${spark(r.spark)}</td></tr>`).join('')}</tbody></table><p class="lbl">Rate is cartons over worked time (hold-ups and their own breaks out). "Trending down" is ${-TREND_PCT}% or more under the window before.</p>` : '<p class="lbl">No finalised truck in this window.</p>'}</div>`;
  const maxR = Math.max(1, ...speed.map(d => d.rate));
  const speedCard = `<div class="card"><div class="ch"><h3>Department speed</h3><span class="cs-dim">last 30 days · over 30 worked min</span></div>${speed.length ? speed.map(d => `<div class="da-bar">${chip(d.dept)}<div><i style="width:${Math.round(d.rate / maxR * 100)}%"></i></div><span><b>${d.rate}</b> ctn/h <small class="cs-dim">${d.cartons} ctn · ${fmtMins(d.workedMins)}</small></span></div>`).join('') : '<p class="lbl">Speeds appear once linked pallets have 30 minutes or more of work in a department.</p>'}</div>`;
  const downSeg = `<div class="seg">${DOWN.map(([k, l]) => `<button class="${st.down === k ? 'on' : ''}" data-act="da-down" data-d="${k}">${l}</button>`).join('')}</div>`;
  const downCard = `<div class="card"><div class="ch"><h3>Downtime by reason</h3>${downSeg}</div>${dt.rows.length ? `<div class="wb-sbar">${dt.rows.map((r, i) => `<i style="flex:${r.mins};background:hsl(${(i * 47) % 360} 60% 52%)" title="${esc(holdName(r))}: ${r.mins} min"></i>`).join('')}</div><table class="wb-t"><thead><tr><th>Reason</th><th class="n">Minutes</th><th class="n">Times</th><th class="n">Trucks</th><th class="n">Share</th></tr></thead><tbody>${dt.rows.map(r => `<tr><td>${esc(holdName(r))}</td><td class="n">${r.mins}</td><td class="n">${r.count}</td><td class="n">${r.trucks}</td><td class="n">${r.share}%</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="n">${dt.total}</td><td colspan="3"></td></tr></tfoot></table>` : '<p class="lbl">No downtime in this window.</p>'}</div>`;
  const last = hist.slice(-20), maxC = Math.max(1, ...last.map(r => r.clearMins || 0)), maxRate = Math.max(1, ...last.map(r => r.teamRate || 0));
  const trucksCard = `<div class="card"><div class="ch"><h3>Trucks over time</h3><span class="cs-dim">last ${last.length} · clear time and team rate</span></div>${last.length ? `<div class="da-trucks">${last.map(r => `<div title="${esc(fmtDate(r.date))} Truck ${esc(truckNo(r.id))}: ${fmtMins(r.clearMins)} · ${r.teamRate} ctn/h · ${r.cartons} ctn"><i class="c" style="height:${Math.round((r.clearMins || 0) / maxC * 100)}%"></i><i class="r" style="height:${Math.round((r.teamRate || 0) / maxRate * 100)}%"></i><small>${esc(fmtDate(r.date))}</small></div>`).join('')}</div><div class="wb-legend"><span><i class="l" style="background:#94A3B8"></i>clear time</span><span><i class="l" style="background:#2563EB"></i>team rate</span></div>` : '<p class="lbl">No finalised truck yet.</p>'}</div>`;
  const t = truckInHand(dock);
  let truckCards = '';
  if (t) {
    const mt = microTable(t), top = topProducts(t);
    truckCards = `<div class="card"><div class="ch"><h3>Manifest by micro-department</h3><span class="cs-dim">Truck ${esc(truckNo(t.id))} · ${esc(t.manifest.manNo)}</span></div><table class="wb-t"><thead><tr><th>Dept</th><th class="n">Cartons</th><th class="n">Share</th><th>Landed</th><th>Cleared</th></tr></thead><tbody>${mt.rows.map(r => { const l = r.ctn ? Math.round(r.landed / r.ctn * 100) : 0, d = r.ctn ? Math.round(r.done / r.ctn * 100) : 0; return `<tr><td>${chip(r.dept)} <small class="cs-dim">${esc(r.dept)}</small></td><td class="n">${Math.round(r.ctn)}</td><td class="n">${mt.total ? Math.round(r.ctn / mt.total * 100) : 0}%</td><td><span class="mfx-pct"><i style="width:${l}%;background:#3B82F6"></i></span> ${l}%</td><td><span class="mfx-pct"><i style="width:${d}%"></i></span> ${d}%</td></tr>`; }).join('')}</tbody></table></div>` +
      `<div class="card"><div class="ch"><h3>Top products</h3><span class="cs-dim">by units · Truck ${esc(truckNo(t.id))}</span></div>${top.map((r, i) => `<div class="da-top"><b>${i + 1}</b><span class="mono">${esc(r.k)}</span><span class="nm">${esc(nameOf(r.k) || r.d || '')}</span>${chip(r.dept)}<span class="n">${r.units} units</span></div>`).join('') || '<p class="lbl">The manifest carries no lines.</p>'}</div>`;
  }
  return head + `<div class="da-grid"><div>${perfCard}${trucksCard}${truckCards ? `<div class="wb-two">${truckCards}</div>` : ''}</div><div>${speedCard}${downCard}</div></div>`;
}

export default {
  id: 'danalytics', title: 'Analytics', icon: 'bars', area: 'backdock',
  desktop(ctx) { return page(ctx); },
  mobile() { return mhead('Analytics', 'Desktop only') + `<div class="mv-note">${ic('bars')}Receiving analytics are for the desktop.</div>`; },
  mount(ctx, root) {
    const t = truckInHand(ctx.store.get('dock')); if (t) ensureNames(ctx, topProducts(t).map(r => r.k), () => ctx.rerender());
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'da-period') { st.period = a.dataset.p; ctx.rerender(); }
      else if (a.dataset.act === 'da-down') { st.down = Number(a.dataset.d); ctx.rerender(); }
      else if (a.dataset.act === 'da-csv') {
        const csv = teamCsv(ctx.store.get('dock').history, Date.now(), st.period === 'truck' ? 'truck' : Number(st.period));
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), l = document.createElement('a'); l.href = url; l.download = `team-${ctx.storeNo}-${st.period === 'truck' ? 'last-truck' : st.period + 'd'}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Team CSV downloaded');
      }
    });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};
