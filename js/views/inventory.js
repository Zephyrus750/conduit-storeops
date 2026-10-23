// Inventory and pallet hub (ShelfSearcher's Inventory mode, Floor P2):
//   Register   the off-site pallets, returns by callback date, received
//   Loads      loads read from a spreadsheet (a DC manifest, or any CSV with
//              its columns mapped), each consolidated by department and
//              painted on the map: one department, or the whole load as heat
//   Trends     what arrived each week, by department
//   Clearance  the catalogue's prices for every keycode held here, checked
//              once a day on this device: what went on clearance or dropped
// The register and loads are store events (inventory.*), so every desk sees
// them; prices are this device's cache, as ShelfSearcher kept them.

import { $, $$, ic, esc, vh, sub, toast, fmtDate, today, dep, DEPT_COLOUR } from '../ui.js';
import { mountMap, bindMapChrome, hasMap } from '../map.js';
import { MICRO, SUBS } from '../data/micros.js';
import { loadXLSX } from './backdock/common.js';
import { parseManifestSheets } from '../../shared/manifest.js';
import { readOffsiteSheets, guessColumns, readGeneric, registerSummary, consolidate, heatBands, HEAT, loadTrends, clearanceDiff, isFixture, COLUMN_NAMES, LOAD_STATUS } from '../../shared/inventory.js';
import { ulid } from '../../shared/ulid.js';
import { addDays } from '../../shared/time.js';
import { hasArea } from '../unlock.js';
import { tx, txn } from '../i18n.js';

// 3-digit department code → { sub, name } from the label-integrity table.
const CODE = new Map(); for (const [subId, list] of Object.entries(MICRO)) for (const entry of list) if (!CODE.has(entry.slice(0, 3))) CODE.set(entry.slice(0, 3), { sub: subId, name: entry.slice(4) });
const SUBNAME = Object.fromEntries(SUBS.map(s => [s[0], s[2]]));
const codeName = c => CODE.get(c)?.name || (c === '???' ? tx('No department') : tx('Department {code}', { code: c }));
const STATUS = { incoming: [tx('Incoming'), '#B45309'], received: [tx('Received'), '#15803D'], offsite: [tx('Off-site'), '#C2410C'] };
const TABS = [['register', tx('Off-site register')], ['loads', tx('Loads')], ['trends', tx('Trends')], ['clearance', tx('Clearance')]];
// A pallet back on site with no date ("Back" alone is the navigation button).
const BACK = tx('returned::Back');
const PERIODS = [[4, tx('4 weeks')], [12, tx('12 weeks')], [26, tx('26 weeks')], ['all', tx('All')]];
let usedArg = null;   // a view's argument stays on re-renders: apply it once
const st = { tab: 'register', sel: null, paint: null, filter: 'live', period: 12, stage: null, adding: false, ephemeral: null };

const dockReadable = ctx => (ctx.session.current?.caps || []).includes('backdock') && hasArea(ctx.session, 'backdock');
const inv = ctx => ctx.store.get('inventory') || { offsite: {}, loads: {} };
const send = (ctx, type, entity, payload = {}) => ctx.store.dispatch({ type, entity, payload });
const pill = (cls, text) => `<span class="inv-pill ${cls}">${text}</span>`;
const statusPill = s => `<span class="inv-st" style="--c:${STATUS[s]?.[1] || '#64748B'}">${STATUS[s]?.[0] || esc(s)}</span>`;
const units = n => Number(n || 0).toLocaleString('en-AU');
const loadUnits = l => (l.pallets || []).reduce((n, p) => n + p.items.reduce((k, i) => k + (Number(i.q) || 0), 0), 0);
const loadLines = l => (l.pallets || []).reduce((n, p) => n + p.items.length, 0);
const loadsOf = ctx => Object.values(inv(ctx).loads || {}).sort((a, b) => (b.recvDate || b.date || '').localeCompare(a.recvDate || a.date || '') || (b.at || '').localeCompare(a.at || ''));

// ── Register ────────────────────────────────────────────────────────────
function regRow(r, t) {
  const late = r.cb && !r.rec && r.cb < t, soon = r.cb && !r.rec && r.cb >= t && r.cb <= addDays(t, 7);
  return `<div class="inv-row${r.rec ? ' rec' : ''}${st.hl === r.pid ? ' hl' : ''}"><span class="pid">${esc(r.pid)}</span>` +
    `<span class="what"><b>${esc(r.title || r.desc || tx('Pallet {pid}', { pid: r.pid }))}</b>${r.products.length ? `<span class="prods">${r.products.slice(0, 6).map(p => `<i>${esc(p.kc)}${p.q ? ` ×${p.q}` : ''}</i>`).join('')}${r.products.length > 6 ? `<i>+${r.products.length - 6}</i>` : ''}</span>` : ''}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>` +
    `<span class="tags">${isFixture(r) ? pill('fx', tx('Fixtures')) : r.req ? pill('', esc(r.req)) : ''}${r.sent ? `<small>${tx('Sent {date}', { date: esc(fmtDate(r.sent)) })}</small>` : ''}</span>` +
    `<span class="cb${late ? ' late' : soon ? ' soon' : ''}">${r.rec ? `<small>${r.rec === 'yes' ? BACK : tx('Back {date}', { date: esc(fmtDate(r.rec)) })}</small>` : `<label>${tx('Callback')}<input type="date" value="${esc(r.cb)}" data-act="cb" data-pid="${esc(r.pid)}"></label>`}${late ? `<small>${tx('overdue')}</small>` : ''}</span>` +
    `<span class="acts">${r.rec ? `<button class="btn sm" data-act="unrec" data-pid="${esc(r.pid)}">${tx('Still off-site')}</button>` : `<button class="btn sm primary" data-act="rec" data-pid="${esc(r.pid)}">${ic('check')}${tx('Received')}</button>`}</span></div>`;
}
function register(ctx) {
  const I = inv(ctx), t = today(), sum = registerSummary(I.offsite, t), all = Object.values(I.offsite);
  const tiles = `<div class="wb-kpis inv-kpis"><div class="wb-kpi"><span>${tx('Off-site')}</span><b>${sum.live}</b><small>${txn(sum.fixtures, '{n} fixture pallet', '{n} fixture pallets')}</small></div><div class="wb-kpi${sum.overdue.length ? ' bad' : ''}"><span>${tx('Overdue returns')}</span><b>${sum.overdue.length}</b><small>${tx('callback date passed')}</small></div><div class="wb-kpi"><span>${tx('Due in 14 days')}</span><b>${sum.dueSoon.length}</b><small>${tx('next {date}', { date: sum.nextCallback ? esc(fmtDate(sum.nextCallback)) : '—' })}</small></div><div class="wb-kpi"><span>${tx('Received')}</span><b>${sum.received}</b><small>${I.offsiteAt ? (I.offsiteSrc ? tx('list from {src}', { src: esc(I.offsiteSrc) }) : tx('list from a file')) : tx('no list read yet')}</small></div></div>`;
  const F = [['live', tx('Off-site · {n}', { n: sum.live })], ['overdue', tx('Overdue · {n}', { n: sum.overdue.length })], ['fixtures', tx('Fixtures · {n}', { n: sum.fixtures })], ['rec', tx('Received · {n}', { n: sum.received })]];
  const pills = `<div class="pills inv-filter">${F.map(([k, l]) => `<button class="${st.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}</div>`;
  const rows = st.filter === 'overdue' ? sum.overdue : st.filter === 'fixtures' ? sum.byCallback.filter(isFixture) : st.filter === 'rec' ? all.filter(r => r.rec).sort((a, b) => (b.rec || '').localeCompare(a.rec || '')) : sum.byCallback;
  const add = st.adding ? `<form class="inv-add" data-form="add"><input name="pid" placeholder="${tx('Pallet no')}" required maxlength="20"><input name="desc" placeholder="${tx('What is on it (43166022 x 12, …)')}" maxlength="200"><input name="req" placeholder="${tx('Requested by')}" maxlength="40"><label>${tx('Callback')}<input type="date" name="cb"></label><button class="btn primary sm" type="submit">${ic('plus')}${tx('Add')}</button><button class="btn sm" type="button" data-act="add-cancel">${tx('Cancel')}</button></form>` : '';
  const list = rows.length ? rows.map(r => regRow(r, t)).join('') : `<p class="lbl" style="padding:14px">${all.length ? tx('Nothing in this list.') : tx('No off-site pallets yet. Import the off-site master list (.xlsx), or add a pallet by hand.')}</p>`;
  return tiles + `<div class="card"><div class="ch"><h3>${tx('Returns by callback date')}</h3>${pills}<button class="btn sm" data-act="add">${ic('plus')}${tx('Add a pallet')}</button></div>${add}<div class="inv-list">${list}</div></div>`;
}

// ── Loads ───────────────────────────────────────────────────────────────
function loads(ctx) {
  const L = loadsOf(ctx), sel = st.ephemeral || (st.sel && inv(ctx).loads[st.sel]) || null;
  const dock = dockReadable(ctx) ? Object.values(ctx.store.get('dock')?.manifests || {}).sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 8) : [];
  const listHtml = (L.length ? L.map(l => `<button class="inv-load${sel?.id === l.id ? ' on' : ''}" data-act="sel" data-id="${esc(l.id)}"><b>${esc(l.label)}</b>${statusPill(l.status)}<small>${txn(l.pallets.length, '{date} · {n} pallet · {units} units', '{date} · {n} pallets · {units} units', { date: esc(fmtDate(l.recvDate || l.date)), units: units(loadUnits(l)) })}</small></button>`).join('') : `<p class="lbl">${tx('No loads yet. Import a DC manifest or any CSV of pallets and keycodes.')}</p>`) +
    (dock.length ? `<div class="inv-sub">${tx('Published at the back dock')}</div>${dock.map(m => `<button class="inv-load dock${st.ephemeral?.id === 'dock:' + m.manNo ? ' on' : ''}" data-act="dockman" data-no="${esc(m.manNo)}"><b>${tx('Manifest {no}', { no: esc(m.manNo) })}</b><small>${tx('{date} · {consols} consols · {cartons} cartons', { date: esc(fmtDate((m.publishedAt || '').slice(0, 10))), consols: m.consols, cartons: units(m.totalCartons) })}</small></button>`).join('')}` : '');
  const mapCard = `<div class="card inv-mapcard"><div class="ch"><h3>${tx('On the map')}</h3><span class="cs-dim" id="invPaint">${st.paint ? paintLabel() : tx('pick a department or Whole load')}</span>${st.paint ? `<button class="btn sm" data-act="unpaint">${tx('Clear')}</button>` : ''}</div>${hasMap() ? `<div class="mapbox"><div class="mapstage" id="mapstage"></div></div><div class="inv-heatkey">${st.paint?.mode === 'heat' ? `<span>${tx('light')}</span>${HEAT.map(c => `<i style="background:${c}"></i>`).join('')}<span>${tx('heavy')}</span>` : st.paint ? `<span><i class="hi"></i>${tx('assigned shelves')}</span><span><i class="sub"></i>${tx('the department’s sub-department (no shelves assigned)')}</span>` : ''}</div>` : `<p class="lbl">${tx('No map published.')}</p>`}</div>`;
  return `<div class="inv-loads"><div class="card inv-loadlist"><div class="ch"><h3>${tx('Loads')}</h3><span class="cs-dim">${L.length}</span></div>${listHtml}</div><div class="inv-detail">${sel ? loadDetail(ctx, sel) : `<div class="card"><p class="lbl">${tx('Choose a load to see its departments.')}</p></div>`}${mapCard}</div></div>`;
}
const paintLabel = () => st.paint.mode === 'heat' ? tx('Heat: {label}', { label: esc(st.paint.label) }) : `${esc(st.paint.code)} ${esc(codeName(st.paint.code))}`;
function loadDetail(ctx, l) {
  const cons = consolidate(l.pallets), total = cons.reduce((n, c) => n + c[1], 0) || 1, ro = !!l.readOnly;
  const statusSeg = ro ? '' : `<div class="seg inv-seg">${LOAD_STATUS.map(s => `<button class="${l.status === s ? 'on' : ''}" data-act="status" data-s="${s}">${STATUS[s][0]}</button>`).join('')}</div>`;
  const unassigned = cons.filter(([c]) => CODE.has(c) && !shelvesFor(ctx, c).exact.length).length, unknown = cons.filter(([c]) => !CODE.has(c)).length;
  return `<div class="card"><div class="ch"><h3>${esc(l.label)}</h3>${statusSeg}${ro ? '' : `<button class="btn sm ghost danger" data-act="remove" title="${tx('Remove this load')}">${ic('trash')}</button>`}</div>` +
    `<div class="inv-facts"><span>${txn(l.pallets.length, '<b>{n}</b> pallet', '<b>{n}</b> pallets')}</span><span>${txn(loadLines(l), '<b>{n}</b> line', '<b>{n}</b> lines', { n: units(loadLines(l)) })}</span><span>${txn(total, '<b>{n}</b> unit', '<b>{n}</b> units', { n: units(total) })}</span><span>${txn(cons.length, '<b>{n}</b> department', '<b>{n}</b> departments')}</span>${l.recvDate ? `<span>${tx('received {date}', { date: esc(fmtDate(l.recvDate)) })}</span>` : l.date ? `<span>${esc(fmtDate(l.date))}</span>` : ''}</div>` +
    `<div class="inv-consh"><b>${tx('By department')}</b><button class="btn sm${st.paint?.mode === 'heat' ? ' on' : ''}" data-act="heat">${ic('layers')}${tx('Whole load heat')}</button></div>` +
    `<div class="inv-cons">${cons.slice(0, 40).map(([c, u, n]) => { const info = CODE.get(c); return `<button class="inv-crow${st.paint?.code === c ? ' on' : ''}" data-act="paint" data-code="${esc(c)}"><span class="cd">${esc(c)}</span><span class="nm">${esc(codeName(c))}${info ? ` ${dep(info.sub)}` : ''}</span><span class="bar"><i style="width:${Math.max(2, Math.round(u / total * 100))}%"></i></span><b>${units(u)}</b><small>${txn(n, '{n} line', '{n} lines')}</small></button>`; }).join('')}</div>` +
    (unassigned ? `<p class="lbl">${txn(unassigned, '{n} department has no shelves assigned in Label integrity, so it spreads over the whole sub-department (dashed). Assign shelves there to paint them exactly.', '{n} departments have no shelves assigned in Label integrity, so they spread over the whole sub-department (dashed). Assign shelves there to paint them exactly.')}</p>` : '') +
    (unknown ? `<p class="lbl">${txn(unknown, '{n} department code is not in the micro-department list and is left off the map.', '{n} department codes are not in the micro-department list and are left off the map.')}</p>` : '') +
    `<details class="inv-pallets"><summary>${tx('Pallets ({n})', { n: l.pallets.length })}</summary>${l.pallets.slice(0, 80).map(p => `<div class="inv-prow"><span class="pid">${esc(p.pid)}</span><span>${txn(p.items.length, '{n} line · {units} units', '{n} lines · {units} units', { units: units(p.items.reduce((n, i) => n + i.q, 0)) })}</span><span class="cs-dim">${esc([...new Set(p.items.map(i => i.dept).filter(Boolean))].slice(0, 4).join(' · '))}</span></div>`).join('')}${l.pallets.length > 80 ? `<p class="lbl">${tx('and {n} more', { n: l.pallets.length - 80 })}</p>` : ''}</details></div>`;
}
// The shelves a department code paints: the ones Label integrity assigned
// to its micro-department, else every shelf of its sub-department (dashed).
function shelvesFor(ctx, code) {
  const info = CODE.get(code); if (!info) return { exact: [], sub: null };
  const assign = ctx.store.get('labels')?.assign || {};
  return { exact: assign[`${info.sub}-${code}`] || [], sub: info.sub };
}

// ── Trends ──────────────────────────────────────────────────────────────
const PAL = ['#EA580C', '#0FA3A3', '#7C3AED', '#2563EB', '#15803D', '#DB2777'];
function trends(ctx) {
  const t = today(), r = loadTrends(inv(ctx).loads, { weeks: st.period, today: t }), c = r.callouts;
  const pills = `<div class="pills">${PERIODS.map(([p, l]) => `<button class="${st.period === p ? 'on' : ''}" data-act="period" data-p="${p}">${l}</button>`).join('')}</div>`;
  if (!c.loads) return `<div class="card"><div class="ch"><h3>${tx('What arrived')}</h3>${pills}</div><p class="lbl">${tx('No loads in this period. Trends fill in as loads are imported and received.')}</p></div>`;
  const dt = {}; for (const w of r.weeks) for (const [d, u] of Object.entries(w.depts)) dt[d] = (dt[d] || 0) + u;
  const top = Object.entries(dt).sort((a, b) => b[1] - a[1]), six = top.slice(0, 6).map(x => x[0]), sum = top.reduce((n, x) => n + x[1], 0) || 1;
  const W = 640, H = 180, P = 28, bw = (W - P * 2) / r.weeks.length, max = Math.max(1, ...r.weeks.map(w => w.units));
  const bars = r.weeks.map((w, i) => { let y = H - 22; const segs = [...six.map((d, k) => [w.depts[d] || 0, PAL[k]]), [w.units - six.reduce((n, d) => n + (w.depts[d] || 0), 0), '#C9D3D9']]; return segs.map(([u, col]) => { const h = u / max * (H - 40); y -= h; return h > 0 ? `<rect x="${(P + i * bw + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"><title>${tx('{week}: {n} units', { week: esc(w.wk), n: units(u) })}</title></rect>` : ''; }).join('') + (r.weeks.length <= 14 || i % 2 === 0 ? `<text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(w.wk.slice(5))}</text>` : ''); }).join('');
  const chart = `<svg class="inv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tx('Units arriving per week')}">${bars}</svg><div class="inv-legend">${six.map((d, k) => `<span><i style="background:${PAL[k]}"></i>${esc(d)} ${esc(codeName(d))}</span>`).join('')}<span><i style="background:#C9D3D9"></i>${tx('Other')}</span></div>`;
  const tiles = `<div class="wb-kpis inv-kpis"><div class="wb-kpi"><span>${tx('Pallets')}</span><b>${units(c.cartons)}</b><small>${txn(c.loads, '{n} load', '{n} loads')}</small></div><div class="wb-kpi"><span>${tx('Per load')}</span><b>${c.perLoad}</b><small>${tx('pallets')}</small></div><div class="wb-kpi"><span>${tx('Busiest week')}</span><b>${c.busiest ? esc(fmtDate(c.busiest)) : '—'}</b><small>${txn(c.busiestCartons, '{n} pallet', '{n} pallets')}</small></div><div class="wb-kpi${c.trend > 0 ? ' good' : c.trend < 0 ? ' bad' : ''}"><span>${tx('Trend')}</span><b>${c.trend == null ? '—' : (c.trend > 0 ? '▲ ' : c.trend < 0 ? '▼ ' : '') + Math.abs(c.trend) + '%'}</b><small>${c.trend == null ? tx('needs 4 active weeks') : tx('newer half against older')}</small></div></div>`;
  const depts = top.slice(0, 12).map(([d, u]) => `<button class="inv-crow" data-act="trend-paint" data-code="${esc(d)}"><span class="cd">${esc(d)}</span><span class="nm">${esc(codeName(d))}</span><span class="bar"><i style="width:${Math.max(2, Math.round(u / sum * 100))}%"></i></span><b>${units(u)}</b><small>${Math.round(u / sum * 100)}%</small></button>`).join('');
  return tiles + `<div class="inv-tgrid"><div class="card"><div class="ch"><h3>${tx('Units per week')}</h3>${pills}</div>${chart}</div><div class="card"><div class="ch"><h3>${tx('Top departments')}</h3><button class="btn sm" data-act="trend-heat">${ic('layers')}${tx('Show on map')}</button></div><div class="inv-cons">${depts}</div></div></div>`;
}

// ── Clearance watch (this device) ──────────────────────────────────────
const PKEY = no => `inventory_prices:${no}`, EKEY = no => `inventory_clearance:${no}`;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
function heldCodes(ctx) {
  const I = inv(ctx), where = new Map(), add = (kc, w) => { if (!/^\d{8}$/.test(kc)) return; if (!where.has(kc)) where.set(kc, new Set()); where.get(kc).add(w); };
  for (const r of Object.values(I.offsite)) if (!r.rec) for (const p of r.products) add(p.kc, 'pallet:' + r.pid);
  for (const l of Object.values(I.loads)) if (l.status !== 'received') for (const p of l.pallets) for (const it of p.items) add(it.k, 'load:' + l.id);
  return where;
}
async function checkPrices(ctx, force = false) {
  const no = ctx.storeNo, t = today(), cache = load(PKEY(no), { day: '', items: {} });
  if (!force && cache.day === t) return false;
  const codes = [...heldCodes(ctx).keys()].slice(0, 300); if (!codes.length) return false;
  const got = await ctx.catalogue.lookupMany(codes), cur = {};
  codes.forEach((kc, i) => { const it = got[i]; if (it) cur[kc] = { price: Number.isFinite(it.price) ? it.price : null, was: Number.isFinite(it.was) ? it.was : null, clr: !!it.clr, name: it.name || '', url: it.url || '', day: t }; });
  const ev = clearanceDiff(cache.items, cur, t);
  // Each code keeps the last day it was priced; the diff skips a code
  // already compared today, so a second check the same day reports nothing new.
  save(PKEY(no), { day: t, items: { ...cache.items, ...cur } });
  if (ev.length) { const old = load(EKEY(no), { seen: '', events: [] }); const keep = old.events.filter(x => !ev.some(n => n.kc === x.kc && n.day === x.day)); save(EKEY(no), { ...old, events: [...ev.map(x => ({ ...x, at: new Date().toISOString() })), ...keep].slice(0, 80) }); }
  return true;
}
function clearance(ctx) {
  const no = ctx.storeNo, cache = load(PKEY(no), { day: '', items: {} }), E = load(EKEY(no), { seen: '', events: [] }), where = heldCodes(ctx);
  const head = `<div class="ch"><h3>${tx('Clearance watch')}</h3><span class="cs-dim">${cache.day ? tx('prices checked {date} on this device', { date: esc(fmtDate(cache.day)) }) : tx('not checked yet')} · ${txn(where.size, '{n} keycode held', '{n} keycodes held')}</span><button class="btn sm" data-act="prices">${ic('refresh')}${tx('Check now')}</button></div>`;
  if (!where.size) return `<div class="card">${head}<p class="lbl">${tx('Nothing to watch: no keycodes on off-site pallets or open loads.')}</p></div>`;
  const priced = Object.entries(cache.items).filter(([kc, v]) => where.has(kc) && (v.price != null || v.clr));
  if (cache.day && !priced.length) return `<div class="card">${head}<p class="lbl">${tx('No prices came back. Prices need the product details switched on for the worker (the owner sets CF_ACCOUNT_ID and BROWSER_TOKEN); names and links still work.')}</p></div>`;
  const onClr = priced.filter(([, v]) => v.clr), fresh = E.events.filter(x => !E.seen || x.at > E.seen);
  const name = kc => esc(cache.items[kc]?.name || kc), money = v => v == null ? '—' : '$' + Number(v).toFixed(2);
  const I = inv(ctx), pal = Object.values(I.offsite).filter(r => !r.rec).map(r => ({ r, n: r.products.filter(p => cache.items[p.kc]?.clr).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const lds = Object.values(I.loads).filter(l => l.status !== 'received').map(l => ({ l, n: new Set(l.pallets.flatMap(p => p.items.filter(i => cache.items[i.k]?.clr).map(i => i.k))).size })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const evRow = x => `<div class="inv-ev ${x.kind}"><b>${x.kind === 'clr' ? tx('On clearance') : tx('Price dropped')}</b><span>${name(x.kc)} <small>${esc(x.kc)}</small></span><span>${money(x.prevPrice)} → <b>${money(x.price)}</b></span><small>${esc(fmtDate(x.day))}</small></div>`;
  return `<div class="card">${head}<div class="inv-sub">${tx('Since you last looked')}</div>${fresh.length ? fresh.map(evRow).join('') : `<p class="lbl">${tx('No new markdowns.')}</p>`}${fresh.length ? `<button class="btn sm" data-act="seen">${tx('Mark as seen')}</button>` : ''}</div>` +
    `<div class="inv-tgrid"><div class="card"><div class="ch"><h3>${tx('Off-site pallets worth calling back')}</h3><span class="cs-dim">${pal.length}</span></div>${pal.length ? pal.map(({ r, n }) => `<div class="inv-prow"><span class="pid">${esc(r.pid)}</span><span>${esc(r.title || r.desc || '')}</span><b>${tx('{n} on clearance', { n })}</b></div>`).join('') : `<p class="lbl">${tx('None of the off-site stock is on clearance.')}</p>`}${lds.length ? `<div class="inv-sub">${tx('Open loads')}</div>${lds.map(({ l, n }) => `<div class="inv-prow"><span class="pid">${esc(l.label)}</span>${statusPill(l.status)}<b>${tx('{n} on clearance', { n })}</b></div>`).join('')}` : ''}</div>` +
    `<div class="card"><div class="ch"><h3>${tx('On clearance now')}</h3><span class="cs-dim">${onClr.length}</span></div>${onClr.length ? `<table class="wb-t"><thead><tr><th>${tx('Item')}</th><th>${tx('Price')}</th><th>${tx('Was')}</th><th>${tx('Held on')}</th></tr></thead><tbody>${onClr.slice(0, 60).map(([kc, v]) => `<tr><td>${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${name(kc)}</a>` : name(kc)} <small class="cs-dim">${esc(kc)}</small></td><td>${money(v.price)}</td><td>${money(v.was)}</td><td>${[...where.get(kc)].slice(0, 3).map(w => esc(w.startsWith('pallet:') ? tx('pallet {pid}', { pid: w.slice(7) }) : I.loads[w.slice(5)]?.label || tx('a load'))).join(', ')}</td></tr>`).join('')}</tbody></table>` : `<p class="lbl">${tx('Nothing held is on clearance.')}</p>`}</div></div>`;
}

// ── Import ──────────────────────────────────────────────────────────────
async function readFile(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false, raw: true });
  return wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
}
async function stageFile(ctx, file) {
  let sheets; try { sheets = await readFile(file); } catch (e) { return toast(tx('Couldn’t read {file}: {error}', { file: file.name, error: e.message }), 'bad'); }
  const off = readOffsiteSheets(sheets);
  if (off.rows.length) { st.stage = { kind: 'offsite', filename: file.name, rows: off.rows, diag: off.diag }; return ctx.rerender(); }
  const man = parseManifestSheets(sheets);
  if (man.kind === 'report' && man.consols?.length) {
    const pallets = man.consols.map(c => ({ pid: String(c.id), items: (c.items || []).map(i => ({ k: i.k, d: i.d || '', q: i.q, dept: i.dept || '' })) })).filter(p => p.items.length);
    if (pallets.length) { st.stage = { kind: 'load', filename: file.name, label: `Manifest ${man.manNo || file.name.replace(/\.\w+$/, '')}`, date: /^\d{4}-\d{2}-\d{2}$/.test(man.despatch || '') ? man.despatch : today(), pallets, note: txn(man.consols.length, '{n} consolidation read as a DC manifest', '{n} consolidations read as a DC manifest') }; return ctx.rerender(); }
  }
  const sh = sheets.find(s => (s.rows || []).some(r => r && r.some(c => c != null && String(c).trim()))); if (!sh) return toast(tx('{file} is empty', { file: file.name }), 'bad');
  const hi = sh.rows.findIndex(r => r && r.filter(c => c != null && String(c).trim()).length >= 2);
  st.stage = { kind: 'generic', filename: file.name, header: sh.rows[hi].map(c => String(c ?? '').trim()), rows: sh.rows.slice(hi + 1).filter(r => r && r.some(c => c != null && String(c).trim())), map: guessColumns(sh.rows[hi]), label: file.name.replace(/\.\w+$/, ''), date: today() };
  ctx.rerender();
}
function stagePanel(ctx) {
  const s = st.stage; if (!s) return '';
  const cnt = Object.keys(inv(ctx).offsite).length;
  if (s.kind === 'offsite') {
    const rec = s.rows.filter(r => r.rec).length;
    const fx = s.rows.filter(isFixture).length;
    const head = fx ? txn(s.rows.length, '{n} pallet read ({rec} already back, {fx} fixtures).', '{n} pallets read ({rec} already back, {fx} fixtures).', { rec, fx }) : txn(s.rows.length, '{n} pallet read ({rec} already back).', '{n} pallets read ({rec} already back).', { rec });
    return `<div class="card inv-stage"><div class="ch"><h3>${tx('Off-site master list · {file}', { file: esc(s.filename) })}</h3></div><p>${head} ${cnt ? txn(cnt, 'This replaces the register’s {n} pallet.', 'This replaces the register’s {n} pallets.') : ''}${s.diag ? ' ' + esc(tx(s.diag)) + '.' : ''}</p><div class="inv-prev">${s.rows.slice(0, 6).map(r => `<span><b>${esc(r.pid)}</b> ${esc(r.title || r.desc).slice(0, 40)}${r.cb ? ' · ' + tx('callback {date}', { date: esc(fmtDate(r.cb)) }) : ''}</span>`).join('')}</div><div class="acts2"><button class="btn primary sm" data-act="stage-save">${ic('check')}${cnt ? tx('Replace the register') : tx('Save the register')}</button><button class="btn sm" data-act="stage-cancel">${tx('Cancel')}</button></div></div>`;
  }
  const pallets = s.kind === 'load' ? s.pallets : readGeneric(s.rows, s.map).pallets, read = s.kind === 'generic' ? readGeneric(s.rows, s.map) : null;
  const mapper = s.kind === 'generic' ? `<div class="inv-map-cols">${Object.entries(COLUMN_NAMES).map(([f, label]) => `<label>${tx(label)}${f === 'pallet' || f === 'key' ? ' *' : ''}<select data-col="${f}"><option value="-1">—</option>${s.header.map((h, i) => `<option value="${i}"${s.map[f] === i ? ' selected' : ''}>${esc(h || tx('Column {n}', { n: i + 1 }))}</option>`).join('')}</select></label>`).join('')}</div>` : '';
  return `<div class="card inv-stage"><div class="ch"><h3>${tx('New load · {file}', { file: esc(s.filename) })}</h3></div>${s.note ? `<p class="lbl">${esc(s.note)}</p>` : ''}${mapper}` +
    `<p>${txn(pallets.length, '{n} pallet · {lines} lines', '{n} pallets · {lines} lines', { lines: units(pallets.reduce((n, p) => n + p.items.length, 0)) })}${read?.skipped ? ' · ' + txn(read.skipped, '{n} row skipped', '{n} rows skipped') : ''}${read?.diag ? ` · ${esc(tx(read.diag))}` : ''}</p>` +
    `<div class="inv-form"><label>${tx('Name')}<input data-stage="label" value="${esc(s.label)}" maxlength="60"></label><label>${tx('Date')}<input type="date" data-stage="date" value="${esc(s.date)}"></label><label>${tx('Status')}<select data-stage="status">${LOAD_STATUS.map(x => `<option value="${x}"${(s.status || 'incoming') === x ? ' selected' : ''}>${STATUS[x][0]}</option>`).join('')}</select></label></div>` +
    `<div class="acts2"><button class="btn primary sm" data-act="stage-save"${pallets.length ? '' : ' disabled'}>${ic('check')}${tx('Add the load')}</button><button class="btn sm" data-act="stage-cancel">${tx('Cancel')}</button></div></div>`;
}
async function saveStage(ctx) {
  const s = st.stage; if (!s) return;
  try {
    if (s.kind === 'offsite') { await send(ctx, 'inventory.offsite.set', {}, { rows: s.rows, src: s.filename }); toast(txn(s.rows.length, 'Register saved: {n} pallet', 'Register saved: {n} pallets')); st.tab = 'register'; }
    else {
      const pallets = s.kind === 'load' ? s.pallets : readGeneric(s.rows, s.map).pallets, id = ulid();
      await send(ctx, 'inventory.load.add', { load: id }, { label: s.label || s.filename, date: s.date, status: s.status || 'incoming', src: s.filename, pallets });
      st.sel = id; st.tab = 'loads'; toast(txn(pallets.length, 'Load added: {n} pallet', 'Load added: {n} pallets'));
    }
    st.stage = null; ctx.rerender();
  } catch (e) { toast(tx('Couldn’t save: {error}', { error: e.message || e }), 'bad'); }
}

// ── Map paint ───────────────────────────────────────────────────────────
function paintMap(ctx, map) {
  if (!map) return;
  const svg = map.svg; svg.classList.remove('inv-heat', 'inv-paint');
  for (const g of $$('.shelf-group[data-heat], .shelf-group[data-paint]', svg)) { g.removeAttribute('data-heat'); g.removeAttribute('data-paint'); }
  const p = st.paint; if (!p) return;
  if (p.mode === 'heat') {
    const subShelves = d => [...new Set($$(`.shelf-group[data-dept="${d}"]`, svg).map(g => g.getAttribute('data-shelf')).filter(Boolean))];
    const bands = heatBands(p.units, c => { const f = shelvesFor(ctx, c); return f.exact.length ? f.exact : f.sub ? subShelves(f.sub) : []; });
    for (const [shelf, b] of bands) for (const g of map.groups(shelf)) g.setAttribute('data-heat', b);
    svg.classList.add('inv-heat');
    return;
  }
  const { exact, sub: s } = shelvesFor(ctx, p.code);
  if (exact.length) for (const shelf of exact) for (const g of map.groups(shelf)) g.setAttribute('data-paint', 'hi');
  else if (s) for (const g of $$(`.shelf-group[data-dept="${s}"]`, svg)) g.setAttribute('data-paint', 'sub');
  svg.classList.add('inv-paint');
}

export default {
  id: 'inventory', title: tx('Inventory'), icon: 'm-inventory',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) {
    const I = inv(ctx), sum = registerSummary(I.offsite, today());
    const head = vh(tx('Inventory'), sub(txn(sum.live, '{n} pallet off-site', '{n} pallets off-site'), txn(Object.keys(I.loads).length, '{n} load', '{n} loads'), sum.overdue.length ? `<b class="c-red">${tx('{n} overdue', { n: sum.overdue.length })}</b>` : ''), `<label class="btn primary">${ic('file')}${tx('Import')}<input type="file" accept=".xlsx,.xls,.csv" data-act="file" hidden></label>`, 'm-inventory');
    const tabs = `<div class="tabs inv-tabs">${TABS.map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>`;
    const body = st.tab === 'loads' ? loads(ctx) : st.tab === 'trends' ? trends(ctx) : st.tab === 'clearance' ? clearance(ctx) : register(ctx);
    return head + stagePanel(ctx) + tabs + `<div class="inv-body">${body}</div>`;
  },
  mount(ctx, root) {
    // From search: a load, or an off-site pallet (highlighted in the register), once.
    if (ctx.arg && ctx.arg !== usedArg && (ctx.arg.load || ctx.arg.pid)) {
      usedArg = ctx.arg; const I = inv(ctx);
      if (ctx.arg.load && I.loads[ctx.arg.load]) { st.tab = 'loads'; st.sel = ctx.arg.load; st.ephemeral = null; st.paint = null; }
      else if (ctx.arg.pid && I.offsite[ctx.arg.pid]) { st.tab = 'register'; st.filter = I.offsite[ctx.arg.pid].rec ? 'rec' : 'live'; st.hl = ctx.arg.pid; }
      setTimeout(() => { ctx.rerender(); setTimeout(() => document.querySelector('.inv-row.hl')?.scrollIntoView({ block: 'center' }), 50); }, 0);
    }
    let map = null;
    if (st.tab === 'loads' && $('#mapstage', root)) { map = mountMap($('#mapstage', root), { badges: true }); bindMapChrome(root, map); paintMap(ctx, map); }
    if (st.tab === 'clearance') checkPrices(ctx).then(changed => { if (changed && st.tab === 'clearance') ctx.rerender(); }).catch(() => {});
    const repaint = () => { paintMap(ctx, map); const lab = $('#invPaint', root); if (lab) lab.innerHTML = st.paint ? paintLabel() : tx('pick a department or Whole load'); };
    root.addEventListener('change', async e => {
      const f = e.target.closest('[data-act="file"]'); if (f?.files?.[0]) { await stageFile(ctx, f.files[0]); f.value = ''; return; }
      const col = e.target.closest('[data-col]'); if (col && st.stage) { st.stage.map[col.dataset.col] = Number(col.value); return ctx.rerender(); }
      const sf = e.target.closest('[data-stage]'); if (sf && st.stage) { st.stage[sf.dataset.stage] = sf.value; return; }
      const cb = e.target.closest('[data-act="cb"]'); if (cb) { try { await send(ctx, 'inventory.offsite.update', { pid: cb.dataset.pid }, { cb: cb.value || '' }); toast(cb.value ? tx('Callback set: {date}', { date: fmtDate(cb.value) }) : tx('Callback cleared')); } catch (er) { toast(er.message || tx('Couldn’t save'), 'bad'); } }
    });
    root.addEventListener('submit', async e => {
      const form = e.target.closest('[data-form="add"]'); if (!form) return; e.preventDefault();
      const fd = new FormData(form), desc = String(fd.get('desc') || ''), products = [...desc.matchAll(/(\d{8})\s*[x×*]\s*(\d+)/gi)].map(m => ({ kc: m[1], q: Number(m[2]) }));
      try { await send(ctx, 'inventory.offsite.add', { pid: String(fd.get('pid')).trim() }, { sent: today(), desc, title: desc.replace(/(\d{8})\s*[x×*]\s*\d+/gi, '').trim().slice(0, 80), req: String(fd.get('req') || ''), cb: String(fd.get('cb') || ''), products }); st.adding = false; toast(tx('Pallet added to the register')); ctx.rerender(); }
      catch (er) { toast(er.message || tx('Couldn’t add the pallet'), 'bad'); }
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a || a.tagName === 'INPUT' || a.tagName === 'SELECT') return;
      const act = a.dataset.act;
      if (act === 'tab') { st.tab = a.dataset.t; return ctx.rerender(); }
      if (act === 'filter') { st.filter = a.dataset.f; return ctx.rerender(); }
      if (act === 'period') { st.period = a.dataset.p === 'all' ? 'all' : Number(a.dataset.p); return ctx.rerender(); }
      if (act === 'add') { st.adding = true; return ctx.rerender(); }
      if (act === 'add-cancel') { st.adding = false; return ctx.rerender(); }
      if (act === 'stage-cancel') { st.stage = null; return ctx.rerender(); }
      if (act === 'stage-save') return saveStage(ctx);
      if (act === 'rec' || act === 'unrec') { try { await send(ctx, 'inventory.offsite.update', { pid: a.dataset.pid }, { rec: act === 'rec' ? today() : '' }); toast(act === 'rec' ? tx('Pallet {pid} received', { pid: a.dataset.pid }) : tx('Pallet {pid} is off-site again', { pid: a.dataset.pid })); } catch (er) { toast(er.message || tx('Couldn’t save'), 'bad'); } return; }
      if (act === 'sel') { st.sel = a.dataset.id; st.ephemeral = null; st.paint = null; return ctx.rerender(); }
      if (act === 'dockman') {
        try { const doc = await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(a.dataset.no)}`); st.ephemeral = { id: 'dock:' + a.dataset.no, label: tx('Manifest {no} (back dock)', { no: a.dataset.no }), readOnly: true, status: 'incoming', date: (doc.at || '').slice(0, 10), pallets: (doc.consols || []).map(c => ({ pid: String(c.id), items: (c.items || []).map(i => ({ k: i.k, d: '', q: i.q, dept: i.dept || '' })) })) }; st.paint = null; ctx.rerender(); }
        catch (er) { toast(er.message || tx('Couldn’t open that manifest'), 'bad'); }
        return;
      }
      const sel = st.ephemeral || (st.sel && inv(ctx).loads[st.sel]);
      if (act === 'status' && sel && !sel.readOnly) { try { await send(ctx, 'inventory.load.status', { load: sel.id }, { status: a.dataset.s, ...(a.dataset.s === 'received' ? { recvDate: today() } : {}) }); } catch (er) { toast(er.message || tx('Couldn’t save'), 'bad'); } return; }
      if (act === 'remove' && sel && !sel.readOnly) { if (!confirm(tx('Remove {load} from the hub? The event log keeps a record.', { load: sel.label }))) return; try { await send(ctx, 'inventory.load.remove', { load: sel.id }); st.sel = null; st.paint = null; toast(tx('Load removed')); ctx.rerender(); } catch (er) { toast(er.message || tx('Couldn’t remove'), 'bad'); } return; }
      if (act === 'paint' && sel) { st.paint = st.paint?.code === a.dataset.code ? null : { mode: 'dept', code: a.dataset.code }; for (const b of $$('.inv-crow', root)) b.classList.toggle('on', b.dataset.code === st.paint?.code); return repaint(); }
      if (act === 'heat' && sel) { st.paint = st.paint?.mode === 'heat' ? null : { mode: 'heat', label: sel.label, units: consolidate(sel.pallets).map(([c, u]) => [c, u]) }; return ctx.rerender(); }
      if (act === 'unpaint') { st.paint = null; return ctx.rerender(); }
      if (act === 'trend-heat' || act === 'trend-paint') {
        const r = loadTrends(inv(ctx).loads, { weeks: st.period, today: today() }), dt = {}; for (const w of r.weeks) for (const [d, u] of Object.entries(w.depts)) dt[d] = (dt[d] || 0) + u;
        st.tab = 'loads'; st.sel = null; st.ephemeral = { id: 'trend', label: tx('Arrivals, {period}', { period: PERIODS.find(p => p[0] === st.period)?.[1] || '' }), readOnly: true, status: 'received', pallets: [{ pid: 'all', items: Object.entries(dt).map(([d, u]) => ({ k: d, q: u, dept: d })) }] };
        st.paint = act === 'trend-heat' ? { mode: 'heat', label: st.ephemeral.label, units: Object.entries(dt) } : { mode: 'dept', code: a.dataset.code };
        return ctx.rerender();
      }
      if (act === 'prices') { a.disabled = true; try { await checkPrices(ctx, true); } catch {} return ctx.rerender(); }
      if (act === 'seen') { const E = load(EKEY(ctx.storeNo), { seen: '', events: [] }); save(EKEY(ctx.storeNo), { ...E, seen: new Date().toISOString() }); return ctx.rerender(); }
    });
    return [ctx.store.on('inventory', () => { if (!st.stage && !root.querySelector('input:focus, select:focus')) ctx.rerender(); })];
  },
};
