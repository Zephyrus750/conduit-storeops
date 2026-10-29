// Manifests › Stats: what came in over a week, a fortnight, a month or all
// time, read from every published report (GET /manifests/stats): the
// totals against the period before, cartons by day (by week or month over
// a long span), the busiest weekdays, the department groups and the top
// departments (painted on the map), the top products, what came for the
// first time and what keeps coming, and the reports in the period.
//
//   rangeOf(s)              { from, to } of the period s.per moved s.off periods back (null for all time)
//   statsPane(ctx, s, paint) the tab's page; s = { per, off, data, error }
//   loadStats(ctx, s, done) fetches the period when it, or what the dock holds, changed
//   statsHeat(s)            the period's cartons by department, as heat on the map

import { ic, esc, today, fmtDate } from '../../ui.js';
import { tx, txn, locale } from '../../i18n.js';
import { hasMap } from '../../map.js';
import { microDept, microChip, microName, STD_MINS_PER_CARTON } from './common.js';
import { mapCard } from './loads.js';
import { kcCopy, itemName, ensureNames } from '../stockroom/common.js';
import { settingsOf } from '../../../shared/reducers/store.js';
import { addDays, retailPeriod } from '../../../shared/time.js';

export const PERIODS = [['week', tx('Week')], ['fortnight', tx('Fortnight')], ['month', tx('Month')], ['all', tx('All time')]];
// Home, Clothing, Kids and Flex are department names: they stay as the store writes them.
const GROUPS = [['h', 'Home', '#2563EB'], ['c', 'Clothing', '#DB2777'], ['k', 'Kids', '#F59E0B'], ['flex', 'Flex', '#64748B'], ['?', tx('Unknown'), '#94A3B8']];
const groupOf = code => { const d = microDept(code); return !d ? '?' : d === 'flex' ? 'flex' : d[0]; };
const DOW = [tx('Mon'), tx('Tue'), tx('Wed'), tx('Thu'), tx('Fri'), tx('Sat'), tx('Sun')];
const dow = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
const monday = d => addDays(d, -dow(d));
const short = d => new Date(d + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const dayText = d => new Date(d + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
const n0 = x => Math.round(x || 0).toLocaleString();

export function rangeOf(s) {
  const t = today();
  if (s.per === 'week') { const from = addDays(monday(t), 7 * s.off); return { from, to: addDays(from, 6) }; }
  if (s.per === 'fortnight') { const to = addDays(monday(t), 6 + 14 * s.off); return { from: addDays(to, -13), to }; }
  if (s.per === 'month') { const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 + s.off, 1)), from = d.toISOString().slice(0, 10); d.setUTCMonth(d.getUTCMonth() + 1, 0); return { from, to: d.toISOString().slice(0, 10) }; }
  return { from: null, to: null };
}
function periodName(s, r) {
  if (s.per === 'all') return s.data?.from ? tx('All time · since {date}', { date: fmtDate(s.data.from) }) : tx('All time');
  const range = `${short(r.from)} – ${short(r.to)}`;
  if (s.per === 'month') return new Date(r.from + 'T00:00:00').toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  if (s.per === 'week') return s.off === 0 ? tx('This week · {range}', { range }) : s.off === -1 ? tx('Last week · {range}', { range }) : range;
  return s.off === 0 ? tx('These two weeks · {range}', { range }) : range;
}
const versus = s => s.per === 'week' ? tx('vs the week before') : s.per === 'fortnight' ? tx('vs the fortnight before') : tx('vs the same days before');

// What the dock holds that changes the numbers: reports, days set by hand, finalised trucks.
const holding = dock => [Object.values(dock.manifests || {}).map(m => m.manNo + m.publishedAt + (m.truck || '')).sort().join(), Object.values(dock.manifestDays || {}).map(x => x.at).sort().at(-1) || '', Object.keys(dock.manifestDays || {}).length, (dock.history || []).length].join('|');
export function loadStats(ctx, s, done) {
  const r = rangeOf(s), key = `${s.per}|${r.from}|${r.to}|${holding(ctx.store.get('dock'))}`;
  if (s.key === key) return;
  s.key = key; s.error = null; s.busy = true;
  ctx.api(`/v1/store/${ctx.storeNo}/manifests/stats${r.from ? `?from=${r.from}&to=${r.to}` : ''}`)
    .then(d => { if (s.key !== key) return; s.data = d; s.busy = false; ensureNames(ctx, [...d.top, ...d.fresh, ...d.regular].map(x => x.k), done); done(); })
    .catch(e => { if (s.key !== key) return; s.busy = false; s.error = e.message; done(); });
}
export const statsHeat = s => s.data ? { mode: 'heat', label: tx('Came in, {period}', { period: PERIODS.find(p => p[0] === s.per)?.[1] || '' }), units: s.data.depts.map(d => [d.dept, Math.round(d.cartons)]) } : null;

function tiles(ctx, s) {
  const t = s.data.totals, p = s.data.prev?.totals, mpc = settingsOf(ctx.store.get('settings')).minsPerCarton || STD_MINS_PER_CARTON, work = Math.round(t.cartons * mpc);
  const delta = (k) => { if (!p || !p[k]) return ''; const d = Math.round((t[k] - p[k]) / p[k] * 100); return `<small class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)}% ${esc(versus(s))}</small>`; };
  const tile = (k, v, note) => `<div class="wb-kpi"><span>${k}</span><b>${v}</b>${note || ''}</div>`;
  return `<div class="wb-kpis ms-kpis">${tile(tx('Manifests'), n0(t.manifests), `<small>${txn(t.trucks, '{n} truck', '{n} trucks')} · ${txn(t.days, '{n} day', '{n} days')}</small>`)}` +
    tile(tx('Cartons'), n0(t.cartons), delta('cartons') || `<small>${tx('{n} a delivery day', { n: n0(t.days ? t.cartons / t.days : 0) })}</small>`) +
    tile(tx('Units'), n0(t.units), delta('units') || `<small>${tx('{n} units a carton', { n: t.cartons ? (t.units / t.cartons).toFixed(1) : '–' })}</small>`) +
    tile(tx('Consols'), n0(t.consols), delta('consols')) +
    tile(tx('Keycodes'), n0(t.keycodes), s.data.newKeycodes != null ? `<small>${tx('{n} new', { n: n0(s.data.newKeycodes) })}</small>` : '') +
    tile(tx('Est. decant'), tx('{h}h {m}m', { h: Math.floor(work / 60), m: String(work % 60).padStart(2, '0') }), `<small>${tx('{mpc} min/ctn · one person', { mpc })}</small>`) + `</div>`;
}

// Cartons by day; over a long span by week, then by month.
function chart(s) {
  const d = s.data, days = Object.keys(d.byDay).sort();
  if (!d.from) return '';
  const span = Math.round((Date.parse(d.to) - Date.parse(d.from)) / 86400000) + 1;
  const by = span <= 62 ? 'day' : span <= 7 * 80 ? 'week' : 'month';
  const keyOf = x => by === 'day' ? x : by === 'week' ? monday(x) : x.slice(0, 7);
  const buckets = new Map();
  if (by === 'day') for (let x = d.from; x <= d.to; x = addDays(x, 1)) buckets.set(x, 0);
  else for (let x = keyOf(d.from); x <= d.to; x = by === 'week' ? addDays(x, 7) : (() => { const m = new Date(x + '-01T00:00:00Z'); m.setUTCMonth(m.getUTCMonth() + 1); return m.toISOString().slice(0, 7); })()) buckets.set(x, 0);
  for (const x of days) buckets.set(keyOf(x), (buckets.get(keyOf(x)) || 0) + d.byDay[x].cartons);
  const list = [...buckets.entries()], W = 760, H = 190, P = 24, bw = (W - P * 2) / Math.max(1, list.length), max = Math.max(1, ...list.map(b => b[1])), every = Math.ceil(list.length / 16);
  const label = k => by === 'day' ? (span <= 14 ? `${DOW[dow(k)]} ${Number(k.slice(8))}` : short(k)) : by === 'week' ? short(k) : new Date(k + '-01T00:00:00').toLocaleDateString(locale(), { month: 'short', year: '2-digit' });
  const tip = (k, v) => by === 'day' ? tx('{day}: {n} cartons', { day: dayText(k), n: n0(v) }) : by === 'week' ? tx('Week of {day}: {n} cartons', { day: short(k), n: n0(v) }) : tx('{month}: {n} cartons', { month: label(k), n: n0(v) });
  const bars = list.map(([k, v], i) => { const h = v / max * (H - 42); return `<rect x="${(P + i * bw + 2).toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${Math.max(v ? 1 : 0, h).toFixed(1)}" rx="2"><title>${esc(tip(k, v))}</title></rect>${v && list.length <= 31 ? `<text class="v" x="${(P + i * bw + bw / 2).toFixed(1)}" y="${(H - 26 - h).toFixed(1)}" text-anchor="middle">${n0(v)}</text>` : ''}${i % every === 0 ? `<text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle"${by === 'day' && k === today() ? ' class="now"' : ''}>${esc(label(k))}</text>` : ''}`; }).join('');
  const title = by === 'day' ? tx('Cartons by day') : by === 'week' ? tx('Cartons by week') : tx('Cartons by month');
  return `<div class="card"><div class="ch"><h3>${title}</h3><span class="cs-dim">${tx('the day each manifest came on')}</span></div><svg class="inv-chart ms-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${bars}</svg></div>`;
}

// Which weekdays carry the load: cartons and deliveries by weekday.
function weekdays(s) {
  const w = DOW.map(() => ({ cartons: 0, days: 0, manifests: 0 }));
  for (const [d, b] of Object.entries(s.data.byDay)) { const x = w[dow(d)]; x.cartons += b.cartons; x.days++; x.manifests += b.manifests; }
  const max = Math.max(1, ...w.map(x => x.cartons)), top = w.indexOf(w.reduce((a, b) => b.cartons > a.cartons ? b : a));
  return `<div class="card"><div class="ch"><h3>${tx('By weekday')}</h3><span class="cs-dim">${tx('cartons, and the days with a delivery')}</span></div>${w.map((x, i) => `<div class="da-bar ms-wd${i === top && x.cartons ? ' top' : ''}"><b>${DOW[i]}</b><div><i style="width:${Math.round(x.cartons / max * 100)}%"></i></div><span>${tx('<b>{n}</b> ctn', { n: n0(x.cartons) })} <small class="cs-dim">${x.days ? `${txn(x.days, '{n} day', '{n} days')} · ${tx('{n} a day', { n: n0(x.cartons / x.days) })}` : tx('none')}</small></span></div>`).join('')}</div>`;
}

function departments(s, paint) {
  const d = s.data.depts, total = d.reduce((n, x) => n + x.cartons, 0) || 1, gc = {};
  for (const x of d) { const g = groupOf(x.dept); gc[g] = (gc[g] || 0) + x.cartons; }
  const roll = `<div class="mfx-roll">${GROUPS.filter(g => gc[g[0]] > 0).map(g => `<span class="mfx-seg" style="flex:${gc[g[0]]};background:${g[2]}" title="${esc(g[1])}: ${tx('{n} cartons', { n: n0(gc[g[0]]) })}">${gc[g[0]] / total > 0.08 ? `${esc(g[1])} ${Math.round(gc[g[0]] / total * 100)}%` : ''}</span>`).join('')}</div>`;
  const rows = d.slice(0, 14).map(x => `<button class="inv-crow${paint?.mode === 'dept' && paint.code === x.dept ? ' on' : ''}" data-act="paint" data-code="${esc(x.dept)}" title="${tx('{n} keycodes · {units} units', { n: n0(x.keycodes), units: n0(x.units) })}"><span class="cd">${microChip(x.dept)}</span><span class="nm">${esc(microName(x.dept) || tx('Unknown department'))}</span><span class="bar"><i style="width:${Math.max(2, Math.round(x.cartons / total * 100))}%"></i></span><b>${n0(x.cartons)}</b><small>${Math.round(x.cartons / total * 100)}%</small></button>`).join('');
  return `<div class="card"><div class="ch"><h3>${tx('Departments')}</h3><span class="cs-dim">${tx('cartons by department')}</span><button class="btn sm${paint?.mode === 'heat' ? ' on' : ''}" data-act="heat" style="margin-left:auto">${ic('layers')}${tx('Show on map')}</button></div>${roll}<div class="inv-cons">${rows}</div>${d.length > 14 ? `<p class="lbl">${txn(d.length - 14, '{n} more department', '{n} more departments')}</p>` : ''}</div>`;
}

const prow = (r, i, tail) => `<div class="da-top"><b>${i + 1}</b><span class="mono">${kcCopy(r.k)}</span><span class="nm">${itemName(r.k, '')}</span>${microChip(r.dept)}<span class="n">${tail(r)}</span></div>`;
function products(s) {
  const d = s.data;
  const top = `<div class="card"><div class="ch"><h3>${tx('Top products')}</h3><span class="cs-dim">${tx('by units')}</span></div>${d.top.map((r, i) => prow(r, i, x => `${tx('{n} units', { n: n0(x.units) })} <small class="cs-dim">${tx('{n} ctn', { n: n0(x.cartons) })}</small>`)).join('') || `<p class="lbl">${tx('No lines in these reports.')}</p>`}</div>`;
  const fresh = d.newKeycodes == null ? '' : `<div class="card"><div class="ch"><h3>${tx('New this period')}</h3><span class="cs-dim">${txn(d.newKeycodes, '{n} keycode never on an earlier manifest', '{n} keycodes never on an earlier manifest', { n: n0(d.newKeycodes) })}</span></div>${d.fresh.map((r, i) => prow(r, i, x => tx('{n} units', { n: n0(x.units) }))).join('') || `<p class="lbl">${tx('Nothing new: every keycode has come before.')}</p>`}</div>`;
  const reg = `<div class="card"><div class="ch"><h3>${tx('Keeps coming')}</h3><span class="cs-dim">${tx('on the most manifests')}</span></div>${d.regular.map((r, i) => prow(r, i, x => `${txn(x.manifests, 'on {n} manifest', 'on {n} manifests')} <small class="cs-dim">${tx('{n} units', { n: n0(x.units) })}</small>`)).join('') || `<p class="lbl">${tx('No keycode came more than once.')}</p>`}</div>`;
  return top + fresh + reg;
}

function reports(s) {
  const d = s.data, est = d.list.filter(x => x.via === 'despatch' || x.via === 'published');
  const big = d.list.reduce((a, b) => b.cartons > (a?.cartons || 0) ? b : a, null), busy = Object.entries(d.byDay).sort((a, b) => b[1].cartons - a[1].cartons)[0];
  const facts = `<div class="ms-facts">${busy ? `<span>${tx('Busiest day <b>{day}</b> · {n} cartons', { day: esc(dayText(busy[0])), n: n0(busy[1].cartons) })}</span>` : ''}${big ? `<span>${tx('Biggest manifest <b>{man}</b> · {n} cartons', { man: esc(big.manNo), n: n0(big.cartons) })}</span>` : ''}</div>`;
  const rows = d.list.slice().reverse().map(x => `<tr data-act="open" data-man="${esc(x.manNo)}"><td>${esc(dayText(x.day))}</td><td>${x.truck ? tx('Truck {no}', { no: x.truck }) : '<span class="cs-dim">—</span>'}</td><td class="mono"><b>${esc(x.manNo)}</b>${x.via === 'despatch' || x.via === 'published' ? ` <span class="status" title="${esc(x.via === 'despatch' ? txn(d.gap, 'No day on file: counted on its despatch date plus {n} day.', 'No day on file: counted on its despatch date plus {n} days.') : tx('No day on file and no despatch date: counted on the day it was published.'))}">${tx('estimated')}</span>` : ''}</td><td class="n">${n0(x.consols)}</td><td class="n">${n0(x.cartons)}</td><td class="n">${n0(x.units)}</td><td class="n">${n0(x.keycodes)}</td></tr>`).join('');
  return `<div class="card"><div class="ch"><h3>${tx('Manifests in this period')}</h3><span class="cs-dim">${txn(d.list.length, '{n} manifest', '{n} manifests')}</span></div>${facts}${est.length ? `<p class="lbl">${txn(est.length, '{n} manifest has no day on file, so it counts on its despatch date. Give it its day under No day yet in the list.', '{n} manifests have no day on file, so they count on their despatch date. Give them their days under No day yet in the list.')}</p>` : ''}<div class="mfx-scroll"><table class="wb-t mfx-t ms-t"><thead><tr><th>${tx('Day')}</th><th>${tx('Truck')}</th><th>${tx('Manifest')}</th><th class="n">${tx('Consols')}</th><th class="n">${tx('Cartons')}</th><th class="n">${tx('Units')}</th><th class="n">${tx('Keycodes')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

export function statsPane(ctx, s, paint) {
  const r = rangeOf(s);
  const bar = `<div class="ms-bar"><div class="seg">${PERIODS.map(([k, l]) => `<button class="${s.per === k ? 'on' : ''}" data-act="ms-per" data-p="${k}">${l}</button>`).join('')}</div>${s.per !== 'all' ? `<span class="pills"><button data-act="ms-off" data-d="-1" aria-label="${tx('Previous period')}">‹</button><button class="${s.off === 0 ? 'on' : ''}" data-act="ms-off" data-d="0">${tx('Now')}</button><button data-act="ms-off" data-d="1" aria-label="${tx('Next period')}"${s.off >= 0 ? ' disabled' : ''}>›</button></span>` : ''}<b class="ms-name">${esc(periodName(s, r))}</b>${r.from ? `<span class="cs-dim">${esc(retailPeriod(r.from))}${retailPeriod(r.to) !== retailPeriod(r.from) ? ' – ' + esc(retailPeriod(r.to)) : ''}</span>` : ''}</div>`;
  if (s.error) return bar + `<div class="card"><p class="lbl">${tx('The stats did not load: {error}', { error: esc(s.error) })}</p><button class="btn" data-act="ms-retry">${ic('refresh')}${tx('Try again')}</button></div>`;
  if (!s.data) return bar + `<div class="card"><div class="ohint">${tx('Adding up the manifests…')}</div></div>`;
  if (!s.data.totals.manifests) return bar + `<div class="card"><p class="lbl">${s.per === 'all' ? tx('No manifests published yet.') : tx('No manifest came in this period. Pick another, or publish the reports for these days.')}</p></div>`;
  return bar + (s.busy ? `<div class="ohint ms-busy">${tx('Updating…')}</div>` : '') + tiles(ctx, s) +
    `<div class="ms-grid"><div>${chart(s)}${s.per !== 'week' ? weekdays(s) : ''}${departments(s, paint)}${mapCard(paint, hasMap())}</div><div>${products(s)}</div></div>` + reports(s);
}
