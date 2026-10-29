// Manifests: the explorer (Decant Visualiser's manifest explorer over the
// worker's manifest store). Every manifest the dock knows, from the library,
// the planner's slots, the trucks on the board and the history, by week,
// each on the day and truck it came on, with where it stands (Planned,
// Receiving, Decanting, Done, Arrived). A report no truck here carried gets
// its day by hand or from the Planner (manifest.day); several publish at
// once with their days (mbatch.js). Stats: what came in over a week, a
// fortnight, a month or all time (mstats.js). Open one
// to see its size (consols, cartons, keycodes, units, estimated work), the
// department-group rollup, and its consols, products and departments, each
// searchable and sortable, with a square per consol showing whether it has
// landed. Publish a report here or at Receiving; attach one to a truck.
// Other loads (any sheet of pallets and keycodes, the old Inventory hub's
// loads) list below the manifests. A manifest's departments, or a load's,
// paint on the store map: one department, or the whole of it as heat.

import { $, ic, esc, vh, sub, toast, dep, mhead, ago, fmtDate, today } from '../../ui.js';
import { mountMap, bindMapChrome, hasMap } from '../../map.js';
import { ensureNames, nameOf, kcCopy, itemName } from '../stockroom/common.js';
import { settingsOf } from '../../../shared/reducers/store.js';
import { previewManifest } from './mpreview.js';
import { inv, loadsOf, send, statusPill, loadUnits, loadDetail, loadHeat, mapCard, paintMap, showPaint, paintNotes, stageFile, stagePanel, saveStage, stageChange } from './loads.js';
import { manifestIndex, microDept, microChip, microName, attachManifest, openTrucks, truckNo, STD_MINS_PER_CARTON } from './common.js';
import { retailPeriod, addDays } from '../../../shared/time.js';
import { placeIndex, suggestPlace, usualGap } from '../../../shared/manifeststats.js';
import { publishMany, dateMany } from './mbatch.js';
import { statsPane, loadStats, statsHeat } from './mstats.js';
import { toolOff } from '../../../shared/tools.js';
import { tx, txn, locale } from '../../i18n.js';

let usedArg = null;   // a view's argument stays on re-renders: apply it once
const st = { open: null, doc: null, docFor: null, error: null, q: '', tab: 'consols', sort: null, dir: -1, group: null, expanded: {}, load: null, paint: null, stage: null,
  view: 'list', all: null, allKey: null, allBusy: false, ms: { per: 'week', off: 0, data: null, key: null, error: null, busy: false } };
const chip = microChip;
// Home, Clothing, Kids and Flex are department names: they stay as the store writes them.
const GROUPS = [['h', 'Home', '#2563EB'], ['c', 'Clothing', '#DB2777'], ['k', 'Kids', '#F59E0B'], ['flex', 'Flex', '#64748B']];
const groupOf = code => { const d = microDept(code); return !d ? '?' : d === 'flex' ? 'flex' : d[0]; };
const STATUS = { done: [tx('Done'), 'good'], live: [tx('Decanting'), 'warn'], staged: [tx('Receiving'), ''], planned: [tx('Planned'), ''], arrived: [tx('Came in'), ''], library: [tx('Published'), ''] };
const TRUCK_ST = { staged: tx('staged'), live: tx('live'), closed: tx('closed') };
const units = c => (c.items || []).reduce((n, i) => n + (Number(i.q) || 0), 0);
// An item's cartons: logged on the line, else its share of the consol's cartons by units.
export const itemCartons = (c, it) => it.c || (units(c) ? c.cartons * (Number(it.q) || 0) / units(c) : 0);

// A manifest's cartons by department, as heat on the map.
const manifestHeat = doc => { const m = {}; for (const c of doc.consols) for (const it of c.items || []) { const k = String(it.dept || '???'); m[k] = (m[k] || 0) + itemCartons(c, it); } return { mode: 'heat', label: doc.manNo, units: Object.entries(m).map(([k, v]) => [k, Math.round(v)]) }; };

// Every manifest the dock knows, one entry each: every report in the
// library (GET /manifests; the device's own index holds the latest 20),
// the planner's slots, the trucks and the history, placed on the day and
// truck it came on (shared/manifeststats.js) with where it stands.
function entries(ctx) {
  const dock = ctx.store.get('dock'), plan = ctx.store.get('plan') || { days: {} }, by = new Map(), d0 = today();
  const put = (manNo, x) => by.set(manNo, { ...(by.get(manNo) || { manNo }), ...x });
  for (const m of st.all || []) put(m.manNo, { dcNo: m.dcNo, despatch: m.despatch, publishedAt: m.at, consols: m.consols, totalCartons: m.cartons });
  for (const m of manifestIndex(dock)) put(m.manNo, { dcNo: m.dcNo, despatch: m.despatch, publishedAt: m.publishedAt, consols: m.consols, totalCartons: m.totalCartons });
  for (const [date, day] of Object.entries(plan.days || {})) for (const [slot, sl] of Object.entries(day.slots || {})) if (sl.manifest?.manNo) { const cur = by.get(sl.manifest.manNo); put(sl.manifest.manNo, { eta: sl.eta || '', despatch: cur?.despatch || sl.manifest.despatch || '', consols: cur?.consols ?? (sl.manifest.ref ? sl.manifest.n : sl.manifest.consols?.length || 0), totalCartons: cur?.totalCartons ?? sl.manifest.cartons }); }
  for (const r of dock.history || []) if (r.manifest?.manNo) { const cur = by.get(r.manifest.manNo); put(r.manifest.manNo, { despatch: cur?.despatch || r.manifest.despatch || '' }); }
  for (const t of Object.values(dock.trucks || {})) if (t.manifest?.manNo) put(t.manifest.manNo, { despatch: t.manifest.despatch || '', consols: t.manifest.consols.length, totalCartons: t.manifest.consols.reduce((n, c) => n + c.cartons, 0) });
  const places = placeIndex({ dock, plan });
  for (const x of by.values()) {
    const p = places.get(x.manNo);
    if (!p) { x.status = 'library'; continue; }
    Object.assign(x, { day: p.day, n: p.truck, via: p.via });
    const id = p.truck ? `${p.day}-T${p.truck}` : null;
    if (p.via === 'truck') { const t = dock.trucks[id]; x.truck = id; x.status = t?.status === 'closed' ? 'done' : t?.status === 'live' ? 'live' : 'staged'; }
    else if (p.via === 'history' || p.via === 'index') { x.truck = id; x.status = 'done'; }
    else if (p.via === 'plan') { x.slot = p.truck; x.status = 'planned'; }
    else x.status = p.day <= d0 ? 'arrived' : 'planned';
  }
  return [...by.values()];
}

// The list by week, Monday to Sunday as the Planner: reports with no day
// yet first (newest first), then each week, newest first, its reports by
// day and truck.
const monday = d => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
const short = d => new Date(d + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
function grouped(list) {
  const out = [], free = list.filter(x => !x.day).sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')), wk = new Map();
  if (free.length) out.push({ key: 'free', title: tx('No day yet'), xs: free });
  for (const x of list) if (x.day) { const w = monday(x.day); if (!wk.has(w)) wk.set(w, []); wk.get(w).push(x); }
  for (const w of [...wk.keys()].sort().reverse()) out.push({ key: w, title: weekName(w), xs: wk.get(w).sort((a, b) => a.day.localeCompare(b.day) || (a.n || 9) - (b.n || 9)) });
  return out;
}
function weekName(w) {
  const t = monday(today()), range = `${short(w)} – ${short(addDays(w, 6))}`;
  return w === t ? tx('This week · {range}', { range }) : w === addDays(t, -7) ? tx('Last week · {range}', { range }) : w === addDays(t, 7) ? tx('Next week · {range}', { range }) : range;
}
// "Today · Sat 24 Oct", "Tomorrow · …", "Yesterday · …", else the day.
function dayName(d) {
  const t = today(), w = new Date(d + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  return d === t ? tx('Today · {date}', { date: w }) : d === addDays(t, 1) ? tx('Tomorrow · {date}', { date: w }) : d === addDays(t, -1) ? tx('Yesterday · {date}', { date: w }) : w;
}
// Each row: its weekday and date, its truck, where it stands.
function listRow(x) {
  const [label, cls] = STATUS[x.status];
  const facts = [tx('<b>{cartons}</b> ctn · <b>{consols}</b> consols', { cartons: x.totalCartons ?? '–', consols: x.consols ?? '–' }), x.status === 'planned' && x.eta ? tx('due {time}', { time: esc(x.eta) }) : '', !x.day && x.publishedAt ? tx('published {date}', { date: esc(fmtDate(x.publishedAt.slice(0, 10))) }) : '', x.despatch ? tx('despatch {date}', { date: esc(x.despatch) }) : ''].filter(Boolean).join(' · ');
  const dd = x.day ? `<span class="mfl-dd${x.day === today() ? ' now' : ''}" title="${esc(dayName(x.day))}"><small>${esc(new Date(x.day + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'short' }))}</small><b>${Number(x.day.slice(8))}</b></span>` : `<span class="mfl-dd none" title="${tx('No day yet')}">${ic('cal')}</span>`;
  return `<div class="mfl-row tk${x.manNo === st.open ? ' on' : ''}" data-act="open" data-man="${esc(x.manNo)}">${dd}` +
    `<span class="mfl-main"><span class="mfl-top"><b>${esc(x.manNo)}</b>${x.n ? `<span class="mfl-tn">${ic('truck')}${tx('Truck {no}', { no: x.n })}</span>` : ''}<span class="status ${cls}">${label}</span></span><small>${facts}</small></span>${ic('chev')}</div>`;
}

// Consol id → how far it has got on the truck that carries the manifest.
// Consols this truck's manifest found already landed on an earlier truck.
function earlyMap(ctx, e) {
  const t = e?.truck && ctx.store.get('dock').trucks?.[e.truck];
  return Object.fromEntries((t?.manifest?.consols || []).filter(c => c.landedEarlier).map(c => [c.id, c.landedEarlier]));
}
function landedMap(ctx, e) {
  const t = e?.truck && ctx.store.get('dock').trucks?.[e.truck], out = {};
  if (!t) return out;
  for (const id of t.carriedConsols || []) out[id] = 'carried';
  for (const p of Object.values(t.pallets || {})) for (const id of p.consolIds || []) out[id] = p.carriedFrom ? 'carried' : p.status === 'done' ? 'done' : p.status === 'active' ? 'active' : 'landed';
  return out;
}
const SQ_NAME = { landed: tx('landed'), active: tx('decanting'), done: tx('decanted'), carried: tx('carried over'), none: tx('not landed') };
const sq = s => `<i class="mfx-sq ${s || 'none'}" title="${SQ_NAME[s || 'none']}"></i>`;

function rows(doc, landed) {
  const q = st.q.trim().toLowerCase(), inGroup = c => !st.group || (c.mix?.length ? c.mix.some(x => groupOf(x[0]) === st.group) : groupOf(c.dept) === st.group);
  const consols = doc.consols.filter(inGroup);
  if (st.tab === 'products') {
    const m = new Map();
    for (const c of consols) for (const it of c.items || []) {
      if (st.group && groupOf(it.dept) !== st.group) continue;
      const r = m.get(it.k) || { k: it.k, name: nameOf(it.k) || it.d || '', d: it.d || '', dept: it.dept, units: 0, cartons: 0, consols: [] };
      r.units += Number(it.q) || 0; r.cartons += itemCartons(c, it); r.consols.push(c.id); m.set(it.k, r);
    }
    let list = [...m.values()].map(r => ({ ...r, cartons: Math.round(r.cartons * 10) / 10, landed: r.consols.filter(id => landed[id]).length }));
    if (q) list = list.filter(r => String(r.k).includes(q) || r.name.toLowerCase().includes(q) || String(r.dept || '').includes(q) || (microDept(r.dept) || '').includes(q) || r.consols.some(id => id.includes(q)));
    return list;
  }
  if (st.tab === 'depts') {
    const m = new Map();
    for (const c of consols) for (const it of c.items || []) {
      if (st.group && groupOf(it.dept) !== st.group) continue;
      const k = String(it.dept || '???'), r = m.get(k) || { dept: k, units: 0, cartons: 0, landedCtn: 0, keycodes: new Set(), consols: new Set() };
      const ct = itemCartons(c, it); r.units += Number(it.q) || 0; r.cartons += ct; if (landed[c.id]) r.landedCtn += ct; r.keycodes.add(it.k); r.consols.add(c.id); m.set(k, r);
    }
    let list = [...m.values()].map(r => ({ dept: r.dept, name: microName(r.dept), units: r.units, cartons: Math.round(r.cartons), keycodes: r.keycodes.size, consols: r.consols.size, pct: r.cartons ? Math.round(r.landedCtn / r.cartons * 100) : 0 }));
    if (q) list = list.filter(r => r.dept.includes(q) || (microDept(r.dept) || '').includes(q) || r.name.toLowerCase().includes(q));
    return list;
  }
  let list = consols.map(c => ({ ...c, units: units(c), keycodes: new Set((c.items || []).map(i => i.k)).size, state: landed[c.id] || (c.carried ? 'carried' : null) }));
  if (q) list = list.filter(c => c.id.includes(q) || String(c.cons || '').includes(q) || String(c.dept || '').includes(q) || (c.items || []).some(i => String(i.k).startsWith(q) || (nameOf(i.k) || i.d || '').toLowerCase().includes(q) || String(i.dept || '').includes(q)));
  return list;
}
const COLS = {
  consols: [['', null], [tx('Consol'), 'id'], [tx('Departments'), null], [tx('Cartons'), 'cartons'], [tx('Units'), 'units'], [tx('Keycodes'), 'keycodes']],
  products: [[tx('Keycode'), 'k'], [tx('Product'), 'name'], [tx('Dept'), 'dept'], [tx('Units'), 'units'], [tx('Cartons'), 'cartons'], [tx('Consols'), 'n'], [tx('Landed'), 'landed']],
  depts: [[tx('Department'), 'dept'], [tx('Cartons'), 'cartons'], [tx('Units'), 'units'], [tx('Keycodes'), 'keycodes'], [tx('Consols'), 'consols'], [tx('Landed'), 'pct']],
};
function sorted(list) {
  const k = st.sort; if (!k) return list;
  const v = r => k === 'n' ? r.consols.length : r[k];
  return list.slice().sort((a, b) => { const x = v(a), y = v(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true })) * st.dir; });
}

function explorer(ctx, e, doc) {
  const landed = landedMap(ctx, e), early = earlyMap(ctx, e), allUnits = doc.consols.reduce((n, c) => n + units(c), 0), cartons = doc.totalCartons ?? doc.consols.reduce((n, c) => n + c.cartons, 0);
  const keycodes = new Set(doc.consols.flatMap(c => (c.items || []).map(i => i.k))).size, mpc = ctx.store.get('dock').trucks?.[e?.truck]?.minsPerCarton || settingsOf(ctx.store.get('settings')).minsPerCarton || STD_MINS_PER_CARTON, work = Math.round(cartons * mpc);
  const trucks = openTrucks(ctx.store.get('dock')), attachedTo = e?.truck, nLanded = doc.consols.filter(c => landed[c.id]).length;
  // The department-group rollup: cartons by Home / Clothing / Kids / Flex.
  const gc = {}; for (const c of doc.consols) for (const it of c.items || []) { const g = groupOf(it.dept); gc[g] = (gc[g] || 0) + itemCartons(c, it); }
  const gs = [...GROUPS, ['?', tx('Unknown'), '#94A3B8']].filter(g => gc[g[0]] > 0), gt = Object.values(gc).reduce((a, b) => a + b, 0) || 1;
  const roll = `<div class="mfx-roll">${gs.map(g => `<button class="mfx-seg${st.group === g[0] ? ' on' : ''}${st.group && st.group !== g[0] ? ' dim' : ''}" data-act="group" data-g="${g[0]}" style="flex:${gc[g[0]]};background:${g[2]}" title="${g[1]}: ${tx('{n} cartons', { n: Math.round(gc[g[0]]) })}">${gc[g[0]] / gt > 0.08 ? `${g[1]} ${Math.round(gc[g[0]] / gt * 100)}%` : ''}</button>`).join('')}</div>${st.group ? `<div class="cs-dim" style="margin:-4px 0 8px">${tx('Showing {group} only', { group: esc(GROUPS.find(g => g[0] === st.group)?.[1] || tx('Unknown')) })} · <span class="go" data-act="group" data-g="${esc(st.group)}">${tx('show all')}</span></div>` : ''}`;
  const list = sorted(rows(doc, landed)), cols = COLS[st.tab];
  const th = cols.map(([label, key]) => key ? `<th data-act="sort" data-k="${key}" class="${st.sort === key ? 'on' : ''}">${label}${st.sort === key ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>` : `<th>${label}</th>`).join('');
    const body = st.tab === 'products' ? list.slice(0, 200).map(r => `<tr><td class="mono">${kcCopy(r.k)}</td><td>${itemName(r.k, r.d)}</td><td>${chip(r.dept)}</td><td class="n">${r.units}</td><td class="n">${r.cartons}</td><td class="n">${r.consols.length}</td><td>${r.consols.slice(0, 6).map(id => sq(landed[id])).join('')}</td></tr>`).join('')
    : st.tab === 'depts' ? list.map(r => `<tr class="mfx-paint${st.paint?.mode === 'dept' && st.paint.code === r.dept ? ' on' : ''}" data-act="paint" data-code="${esc(r.dept)}"><td>${chip(r.dept)} <span class="mfx-dn"><small class="cs-dim mono">${esc(r.dept)}</small> ${esc(r.name || tx('Unknown department'))}</span></td><td class="n">${r.cartons}</td><td class="n">${r.units}</td><td class="n">${r.keycodes}</td><td class="n">${r.consols}</td><td><span class="mfx-pct"><i style="width:${r.pct}%"></i></span> ${r.pct}%</td></tr>`).join('')
    : list.slice(0, 120).map(c => {
      const open = !!st.expanded[c.id] || (st.q && list.length <= 3), items = c.items || [];
      return `<tr class="mfx-c" data-act="toggle" data-id="${esc(c.id)}"><td>${sq(c.state)}</td><td class="mono" title="${tx('Consolidation {no}', { no: esc(c.cons || '') })}">${esc(c.id)}${early[c.id] ? ` <span class="status warn" title="${tx('Landed on Truck {no} before this manifest arrived', { no: esc(truckNo(early[c.id].t)) })}">${tx('LANDED {date}', { date: esc(fmtDate(early[c.id].d)) })}</span>` : ''}</td><td>${(c.mix || []).slice(0, 4).map(x => chip(x[0])).join('')}</td><td class="n">${c.cartons}</td><td class="n">${c.units}</td><td class="n">${c.keycodes}</td></tr>` +
        (open ? `<tr class="mfx-items"><td></td><td colspan="5">${items.slice(0, 40).map(it => `<div class="mfc-it${st.q && String(it.k).startsWith(st.q.trim()) ? ' hit' : ''}"><span class="kc">${kcCopy(it.k)}</span><span class="nm">${itemName(it.k, it.d || '')}</span>${it.dept ? chip(it.dept) : ''}<span class="ct">${tx('~{cartons} ctn · {units} units', { cartons: Math.round(itemCartons(c, it) * 10) / 10, units: it.q })}</span></div>`).join('')}${items.length > 40 ? `<div class="cs-dim">${tx('{n} more lines', { n: items.length - 40 })}</div>` : ''}</td></tr>` : '');
    }).join('');
  const more = st.tab === 'products' && list.length > 200 ? tx('{n} more products: search to narrow', { n: list.length - 200 }) : st.tab === 'consols' && list.length > 120 ? tx('{n} more consols: search to narrow', { n: list.length - 120 }) : '';
  const stat = (k, v, tip, note) => `<div${tip ? ` title="${esc(tip)}"` : ''}><span>${k}</span><b>${v}</b>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  const share = tx('{h}h {m}m', { h: Math.floor(work / 4 / 60), m: String(Math.round(work / 4) % 60).padStart(2, '0') });
  const tip = e?.truck
    ? tx('{cartons} cartons × {mpc} min a carton = {work} minutes of decanting for one person (Minutes per carton in Settings › Store settings, as this truck took it). Split it across the team: four people ≈ {share}.', { cartons: cartons.toLocaleString(), mpc, work: work.toLocaleString(), share })
    : tx('{cartons} cartons × {mpc} min a carton = {work} minutes of decanting for one person (Minutes per carton in Settings › Store settings). Split it across the team: four people ≈ {share}.', { cartons: cartons.toLocaleString(), mpc, work: work.toLocaleString(), share });
  return `<div class="card mfd mfx"><div class="mfd-h"><span class="mfd-t">${ic('packages')}<b>${esc(doc.manNo)}</b>${e ? `<span class="status ${STATUS[e.status][1]}">${STATUS[e.status][0]}</span>` : ''}</span><span class="mfd-facts"><span>${tx('despatch <b>{date}</b>', { date: esc(doc.despatch || '—') })}</span><span>${tx('DC <b>{no}</b>', { no: esc(doc.dcNo || '—') })}</span>${attachedTo ? `<span>${esc(dayName(e.day))}</span><span>${tx('Truck <b>{no}</b> · {n}/{total} landed', { no: esc(truckNo(attachedTo)), n: nLanded, total: doc.consols.length })}</span>` : e?.slot ? `<span>${tx('Planned for Truck <b>{no}</b> · {day}', { no: esc(String(e.slot)), day: esc(dayName(e.day)) })}${e.eta ? ' · ' + tx('due {time}', { time: esc(e.eta) }) : ''}</span>` : e?.via === 'label' ? `<span>${e.n ? tx('Came on Truck <b>{no}</b> · {day}', { no: e.n, day: esc(dayName(e.day)) }) : tx('Came on {day}', { day: esc(dayName(e.day)) })}</span>` : ''}</span></div>` + (attachedTo ? '' : cameOn(ctx, e)) +
    `<div class="ps-facts mfx-stats">${stat(tx('Consols'), doc.consols.length)}${stat(tx('Cartons'), cartons.toLocaleString())}${stat(tx('Keycodes'), keycodes.toLocaleString())}${stat(tx('Units'), allUnits.toLocaleString())}${stat(tx('Est. work'), tx('{h}h {m}m', { h: Math.floor(work / 60), m: String(work % 60).padStart(2, '0') }), tip, tx('{mpc} min/ctn · one person', { mpc }))}</div>` + roll +
    `<div class="mfd-acts">${attachedTo ? `<span class="status good">${tx('On Truck {no}', { no: esc(truckNo(attachedTo)) })}</span>` : trucks.length ? `<select class="ad-in" data-field="truck">${trucks.map(t => `<option value="${esc(t.id)}">${tx('Truck {no} · {status}', { no: esc(truckNo(t.id)), status: esc(TRUCK_ST[t.status] || t.status) })}</option>`).join('')}</select><button class="btn primary sm" data-act="attach">${ic('truck')}${tx('Attach to truck')}</button>` : `<span class="cs-dim">${tx('No truck on the board to attach to')}</span>`}<button class="btn sm" data-act="remove" style="margin-left:auto">${ic('trash')}${tx('Remove')}</button></div>` +
    `<div class="mfx-bar"><div class="seg">${[['consols', tx('Consols')], ['products', tx('Products')], ['depts', tx('Departments')]].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div><div class="search">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="${tx('find consol, keycode, product, dept…')}" aria-label="${tx('Search this manifest')}"></div>${st.tab === 'depts' ? `<button class="btn sm${st.paint?.mode === 'heat' ? ' on' : ''}" data-act="heat">${ic('layers')}${tx('Whole load heat')}</button>` : ''}<span class="mfd-hit">${st.tab === 'depts' ? txn(list.length, '{n} department', '{n} departments') : st.tab === 'products' ? txn(list.length, '{n} product', '{n} products') : txn(list.length, '{n} consol', '{n} consols')}</span></div>` +
    `<div class="mfx-legend">${['landed', 'active', 'done', 'carried', 'none'].map(s => `${sq(s)}${SQ_NAME[s]}`).join('')}</div>` +
    `<div class="mfx-scroll"><table class="mfx-t"><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="cs-dim">${tx('Nothing matches.')}</td></tr>`}</tbody></table></div>${more ? `<div class="cs-dim" style="margin-top:8px">${more}</div>` : ''}${st.tab === 'depts' ? paintNotes(ctx, list.map(r => r.dept)) : ''}</div>`;
}

// The day and truck a report came on, for one no truck here carried: set
// by hand, or taken from the suggestion (a truck the Planner or Receiving
// had with no manifest, else the despatch date plus the usual gap). A
// suggestion only reaches back: a report for today or later goes on its
// truck through the Planner or Receiving.
function cameOn(ctx, e) {
  if (!e) return '';
  const s = { dock: ctx.store.get('dock'), plan: ctx.store.get('plan') || { days: {} } }, cur = e.via === 'label' ? e : null;
  const sg0 = !e.day ? suggestPlace(s, { despatch: e.despatch }) : null, sg = sg0 && sg0.day < today() ? sg0 : null;
  const day = cur?.day || sg?.day || '', n = cur?.n ?? sg?.truck ?? null;
  const why = cur ? tx('Set by hand: the list and the stats place it here.') : sg ? (sg.via === 'plan' ? tx('Suggested from the Planner: a truck that had no manifest. Save to keep it.') : txn(usualGap(s), 'Suggested from the despatch date plus {n} day. Save to keep it.', 'Suggested from the despatch date plus {n} days. Save to keep it.'))
    : e.via === 'plan' ? tx('Staged on the Planner. If it came another day, set that here.') : tx('Pick the day it came and its truck.');
  return `<div class="mfd-came"><span class="mfd-cl">${ic('cal')}${tx('Came on')}</span><input type="date" class="ad-in" data-field="came-day" value="${esc(day)}" max="${esc(today())}" aria-label="${tx('Day it came')}"><select class="ad-in" data-field="came-tn" aria-label="${tx('Truck')}"><option value="">${tx('Truck —')}</option>${[1, 2, 3, 4].map(k => `<option value="${k}"${n === k ? ' selected' : ''}>${tx('Truck {no}', { no: k })}</option>`).join('')}</select><button class="btn sm${cur ? '' : ' primary'}" data-act="came-save">${ic('check')}${tx('Save')}</button>${cur ? `<button class="btn sm" data-act="came-clear">${tx('Clear')}</button>` : ''}<small class="cs-dim">${why}</small></div>`;
}

function detail(ctx, list) {
  if (!st.open) return `<div class="card mfd"><div class="ch"><h3>${tx('Pick a manifest')}</h3></div><p class="lbl">${tx("Open one from the list to explore its consols, products and departments, or publish today's report.")}</p></div>`;
  if (st.error) return `<div class="card mfd"><div class="ch"><h3>${esc(st.open)}</h3></div><p class="lbl">${esc(st.error)}</p></div>`;
  const doc = st.docFor === st.open ? st.doc : null;
  if (!doc) return `<div class="card mfd"><div class="ch"><h3>${esc(st.open)}</h3></div><div class="ohint">${tx('Loading the report…')}</div></div>`;
  return `<div class="mfx-col">${explorer(ctx, list.find(x => x.manNo === st.open), doc)}${st.tab === 'depts' ? mapCard(st.paint, hasMap()) : ''}</div>`;
}
// Another load: its status, departments and pallets, and the map.
const loadPane = (ctx, l) => `<div class="mfx-col">${loadDetail(ctx, l, st.paint)}${mapCard(st.paint, hasMap())}</div>`;

export default {
  id: 'manifests', title: tx('Manifests'), icon: 'm-manifests', area: 'backdock',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) {
    // Other loads belong to the off-site tool: switched off, they leave Manifests too.
    const loadsOn = !toolOff(ctx.store.get('tools')?.off, 'inventory');
    const list = entries(ctx), groups = grouped(list), loads = loadsOn ? loadsOf(ctx) : [], open = loadsOn && st.load && inv(ctx).loads[st.load];
    if (st.load && !open) st.load = null;
    if (st.open && st.all && !list.some(x => x.manNo === st.open)) st.open = null;
    if (!st.open && !st.load && groups.length) st.open = groups[0].xs[0].manNo;
    const views = `<div class="seg mf-views">${[['list', tx('List'), 'm-manifests'], ['stats', tx('Stats'), 'chart']].map(([k, l, i]) => `<button class="${st.view === k ? 'on' : ''}" data-act="view" data-v="${k}">${ic(i)}${l}</button>`).join('')}</div>`;
    const head = vh(tx('Manifests'), sub(tx('Manifest explorer'), txn(list.length, '{n} manifest', '{n} manifests'), loads.length ? txn(loads.length, '{n} other load', '{n} other loads') : '', tx('by week, day and truck')), views + (loadsOn ? `<label class="btn" style="cursor:pointer" title="${tx('A sheet of pallets and keycodes that is not a DC manifest')}"><input type="file" accept=".xls,.xlsx,.csv" data-field="loadfile" style="display:none">${ic('plus')}${tx('Add a load')}</label>` : '') + `<label class="btn primary" style="cursor:pointer" title="${tx('Pick one report, or several at once: a missed day or two each get the day and truck they came on.')}"><input type="file" accept=".xls,.xlsx,.csv" data-field="file" multiple style="display:none">${ic('file')}${tx('Publish manifests')}</label>`, 'm-manifests');
    if (st.view === 'stats') return head + statsPane(ctx, st.ms, st.paint);
    const rowsHtml = groups.map(g => {
      const ctn = g.xs.reduce((n, x) => n + (Number(x.totalCartons) || 0), 0), dateable = g.key === 'free' && g.xs.some(x => x.despatch);
      return `<div class="pt3 mfx-wk">${esc(g.title)}${g.key === 'free' ? '' : `<small class="mfx-rp">${esc(retailPeriod(g.key))}</small>`}<span class="cs-dim">${txn(g.xs.length, '{n} manifest', '{n} manifests')}${g.key === 'free' ? '' : ` · ${tx('{n} ctn', { n: ctn.toLocaleString() })}`}</span>${dateable ? `<button class="btn sm" data-act="date-all" title="${tx('Suggest each one’s day and truck from the Planner and the despatch dates, to check and save')}">${ic('cal')}${tx('Give them days')}</button>` : ''}</div>` + g.xs.map(listRow).join('');
    }).join('');
    const loadRows = loads.length ? `<div class="pt3 mfx-wk">${tx('Other loads')}</div>` + loads.map(l => `<div class="mfl-row${l.id === st.load ? ' on' : ''}" data-act="open-load" data-id="${esc(l.id)}"><span class="mfl-main"><span class="mfl-top"><b>${esc(l.label)}</b>${statusPill(l.status)}</span><small>${esc(fmtDate(l.recvDate || l.date))}</small></span><span class="mfl-facts"><span>${txn(l.pallets.length, '<b>{n}</b> pallet', '<b>{n}</b> pallets')}</span><span class="cs-dim">${txn(loadUnits(l), '<b>{n}</b> unit', '<b>{n}</b> units', { n: loadUnits(l).toLocaleString('en-AU') })}</span></span>${ic('chev')}</div>`).join('') : '';
    const side = `<div class="card mfl">${list.length ? rowsHtml : `<div class="ohint">${tx("Nothing published yet. Publish today's DC Manifest Report (the .xls from the email) and the dock can verify pallets against it.")}</div>`}${loadRows}</div>`;
    return head + stagePanel(ctx, st.stage) + `<div class="mgrid">${side}${open ? loadPane(ctx, open) : detail(ctx, list)}</div>`;
  },
  mount(ctx, root) {
    // From search: open that manifest (and filter to a consolidation).
    if (ctx.arg?.man && ctx.arg !== usedArg && ctx.store.get('dock').manifests?.[ctx.arg.man]) { usedArg = ctx.arg; st.open = ctx.arg.man; st.load = null; st.paint = null; if (ctx.arg.q) st.q = ctx.arg.q; setTimeout(() => ctx.rerender(), 0); }
    // From search, the dashboard or Off-site pallets: another load.
    if (ctx.arg?.load && ctx.arg !== usedArg && inv(ctx).loads[ctx.arg.load]) { usedArg = ctx.arg; st.load = ctx.arg.load; st.open = null; st.paint = null; setTimeout(() => ctx.rerender(), 0); }
    let map = null; const stage = $('#mapstage', root);
    if (stage) { map = mountMap(stage, { badges: true }); bindMapChrome(root, map); paintMap(ctx, map, st.paint); }
    // The whole library from the worker (the device's index keeps the latest
    // 20), again whenever a report comes or goes. Offline, the index stands in.
    const lib = Object.values(ctx.store.get('dock').manifests || {}).map(m => m.manNo + m.publishedAt).sort().join();
    if (st.allKey !== lib && !st.allBusy) { st.allBusy = true; ctx.api(`/v1/store/${ctx.storeNo}/manifests`).then(r => { st.all = r.manifests || []; st.allKey = lib; st.allBusy = false; ctx.rerender(); }).catch(() => { st.allKey = lib; st.allBusy = false; }); }
    if (st.view === 'stats') loadStats(ctx, st.ms, () => ctx.rerender());
    const load = () => {
      if (st.view !== 'list' || !st.open || st.docFor === st.open) return;
      st.docFor = st.open; st.doc = null; st.error = null; st.q = ''; st.expanded = {}; st.group = null;
      ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(st.open)}`).then(doc => { st.doc = doc; ctx.rerender(); }).catch(e => { st.error = e.status === 404 ? tx('This report has left the library; only its history row remains.') : e.message; ctx.rerender(); });
    };
    load();
    const doc = st.docFor === st.open ? st.doc : null;
    // Names and product pages for what is on screen: the products tab's rows
    // as sorted, or the opened consols' lines (the catalogue batches them).
    if (doc && st.view === 'list' && st.tab !== 'depts') {
      const want = st.tab === 'products' ? sorted(rows(doc, landedMap(ctx, entries(ctx).find(x => x.manNo === st.open)))).slice(0, 200).map(r => r.k)
        : doc.consols.filter(c => st.expanded[c.id] || (st.q && rows(doc, {}).length <= 3)).flatMap(c => (c.items || []).slice(0, 40).map(i => i.k));
      if (want.length) ensureNames(ctx, want, () => ctx.rerender());
    }
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'open') { st.open = a.dataset.man; st.view = 'list'; st.load = null; st.paint = null; ctx.rerender(); }
        else if (act === 'ms-per') { st.ms.per = a.dataset.p; st.ms.off = 0; st.paint = null; ctx.rerender(); }
        else if (act === 'ms-off') { const d = Number(a.dataset.d); st.ms.off = d === 0 ? 0 : Math.min(0, st.ms.off + d); st.paint = null; ctx.rerender(); }
        else if (act === 'ms-retry') { st.ms.key = null; ctx.rerender(); }
        else if (act === 'view') { st.view = a.dataset.v; st.paint = null; ctx.rerender(); }
        else if (act === 'date-all') { const free = entries(ctx).filter(x => !x.day); const n = await dateMany(ctx, free); if (n) toast(txn(n, '{n} manifest has its day', '{n} manifests have their days')); ctx.rerender(); }
        else if (act === 'came-save' || act === 'came-clear') {
          const day = act === 'came-clear' ? null : root.querySelector('[data-field="came-day"]')?.value || null, tn = root.querySelector('[data-field="came-tn"]')?.value;
          if (act === 'came-save' && !day) return toast(tx('Pick the day it came first'), 'bad');
          a.disabled = true;
          await ctx.store.dispatch({ type: 'manifest.day', entity: { manNo: st.open }, payload: { day, truck: day && tn ? Number(tn) : null } });
          toast(day ? tx('{man}: came on {day}', { man: st.open, day: dayName(day) + (tn ? ' · ' + tx('Truck {no}', { no: tn }) : '') }) : tx('{man}: day cleared', { man: st.open }));
        }
        else if (act === 'open-load') { st.load = a.dataset.id; st.paint = null; ctx.rerender(); }
        else if (act === 'toggle') { st.expanded[a.dataset.id] = !st.expanded[a.dataset.id]; ctx.rerender(); }
        else if (act === 'tab') { st.tab = a.dataset.tab; st.sort = null; st.paint = null; ctx.rerender(); }
        else if (act === 'paint') { st.paint = st.paint?.mode === 'dept' && st.paint.code === a.dataset.code ? null : { mode: 'dept', code: a.dataset.code }; showPaint(ctx, root, map, st.paint); }
        else if (act === 'heat') { const l = st.load && inv(ctx).loads[st.load], doc = st.docFor === st.open ? st.doc : null; st.paint = st.paint?.mode === 'heat' ? null : st.view === 'stats' ? statsHeat(st.ms) : l ? loadHeat(l) : doc ? manifestHeat(doc) : null; showPaint(ctx, root, map, st.paint); }
        else if (act === 'unpaint') { st.paint = null; showPaint(ctx, root, map, null); }
        else if (act === 'load-status') { await send(ctx, 'inventory.load.status', { load: st.load }, { status: a.dataset.s, ...(a.dataset.s === 'received' ? { recvDate: today() } : {}) }); }
        else if (act === 'load-remove') { const l = inv(ctx).loads[st.load]; if (!l || !confirm(tx('Remove {load}? The event log keeps a record.', { load: l.label }))) return; await send(ctx, 'inventory.load.remove', { load: l.id }); st.load = null; st.paint = null; toast(tx('Load removed')); ctx.rerender(); }
        else if (act === 'stage-cancel') { st.stage = null; ctx.rerender(); }
        else if (act === 'stage-save') { const s = st.stage; if (!s) return; a.disabled = true; const r = await saveStage(ctx, s); st.stage = null; if (r.kind === 'offsite') return ctx.go('offsite'); st.load = r.id; st.open = null; st.paint = null; ctx.rerender(); }
        else if (act === 'sort') { if (st.sort === a.dataset.k) st.dir = -st.dir; else { st.sort = a.dataset.k; st.dir = -1; } ctx.rerender(); }
        else if (act === 'group') { st.group = st.group === a.dataset.g ? null : a.dataset.g; ctx.rerender(); }
        else if (act === 'attach') { const truck = root.querySelector('[data-field="truck"]')?.value; if (!truck) return; a.disabled = true; await attachManifest(ctx, truck, st.open); toast(tx('{man} attached to Truck {no}', { man: st.open, no: truckNo(truck) })); }
        else if (act === 'remove') { if (!confirm(tx('Remove manifest {man} from the library? Trucks it is attached to keep their copy.', { man: st.open }))) return; await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(st.open)}`, { method: 'DELETE' }); st.open = null; st.docFor = null; st.allKey = null; toast(tx('Manifest removed')); ctx.rerender(); }
      } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    const publish = async f => {
      try { const r = await previewManifest(ctx, f, { dating: true }); if (!r) return; st.open = r.manNo; st.docFor = null; st.load = null; st.paint = null; toast(tx('Manifest {man} published · {consols} consols, {cartons} cartons', { man: r.manNo, consols: r.consols, cartons: r.totalCartons })); ctx.rerender(); }
      catch (err) { toast(tx('Could not publish {file}: {error}', { file: f.name, error: err.message }), 'bad'); }
    };
    root.addEventListener('change', async e => {
      if (st.stage && (e.target.closest('[data-col]') || e.target.closest('[data-stage]'))) { if (stageChange(st.stage, e.target)) ctx.rerender(); return; }
      const field = e.target.dataset.field; if (field !== 'file' && field !== 'loadfile') return;
      const files = [...(e.target.files || [])], f = files[0]; e.target.value = ''; if (!f) return;
      if (field === 'file' && files.length > 1) {
        const dock = ctx.store.get('dock'), known = Object.fromEntries([...(st.all || []).map(m => [m.manNo, { publishedAt: m.at }]), ...manifestIndex(dock).map(m => [m.manNo, m])]);
        const out = await publishMany(ctx, files, known);
        if (out?.length) { st.open = out[0]; st.docFor = null; st.load = null; st.paint = null; st.allKey = null; ctx.rerender(); }
        return;
      }
      if (field === 'file') return publish(f);
      // Add a load: a DC manifest goes to the library like any other; the
      // off-site master list or any other sheet waits for a look first.
      const s = await stageFile(f); if (!s) return;
      if (s.kind === 'load') return publish(f);
      st.stage = s; ctx.rerender();
    });
    let typing = null;
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; clearTimeout(typing); typing = setTimeout(() => { const v = st.q; ctx.rerender(); const i = document.querySelector('#content [data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 180); } });
    return [ctx.store.on('dock', () => ctx.rerender()), ctx.store.on('plan', () => ctx.rerender()), ctx.store.on('inventory', () => { if (!st.stage && !root.querySelector('input:focus, select:focus')) ctx.rerender(); })];
  },
};
