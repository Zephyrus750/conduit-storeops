// Off-site pallets: the register of pallets sent off-site (the Inventory
// hub's register and clearance watch, moved to the Back dock on 23 Oct 2026).
//   Register   By manifest (the 6 Nov off-site design): each manifest in
//              storage (a whole truck, or pallets sent from the dock), each
//              off-site load and the other pallets, with Call back; or By
//              callback date: the pallets, returns, received, added by
//              hand or read from the off-site master list (.xlsx)
//   Clearance  the catalogue's prices for every keycode held off-site or on
//              an open load, checked once a day on this device: what went on
//              clearance or dropped, and which pallets are worth calling back
// On a phone: the same two lists (Call back for managers), mark one
// received, change its callback, add one; a pallet on clearance says so when this device has
// checked prices. The register is store events (inventory.offsite.*).

import { $, ic, esc, vh, sub, toast, fmtDate, fmtDay, today, mhead } from '../../ui.js';
import { registerSummary, clearanceDiff, isFixture } from '../../../shared/inventory.js';
import { addDays } from '../../../shared/time.js';
import { inv, send, statusPill, stageFile, stagePanel, saveStage, stageChange } from './loads.js';
import { tx, txn } from '../../i18n.js';
import { routeManifest, broughtBy } from '../../../shared/dockroutes.js';
import { routeTag, isMgr } from './routes.js';
import { offsiteGroups } from '../../../shared/offsite.js';
import { groupTag, groupSub, groupName, deptLine, callbackSheet, callText } from './callback.js';

const TABS = [['register', tx('Off-site register')], ['clearance', tx('Clearance')]];
// A pallet back on site with no date ("Back" alone is the navigation button).
const BACK = tx('returned::Back');
let usedArg = null;   // a view's argument stays on re-renders: apply it once
const st = { tab: 'register', view: 'man', filter: 'live', stage: null, adding: false, hl: null, open: new Set(), showBack: false };
const pill = (cls, text) => `<span class="inv-pill ${cls}">${text}</span>`;

// ── Clearance watch (this device) ──────────────────────────────────────
const PKEY = no => `inventory_prices:${no}`, EKEY = no => `inventory_clearance:${no}`;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
function heldCodes(ctx) {
  const I = inv(ctx), where = new Map(), add = (kc, w) => { if (!/^\d{8,9}$/.test(kc)) return; if (!where.has(kc)) where.set(kc, new Set()); where.get(kc).add(w); };
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
// Keycodes on a pallet that this device last saw on clearance.
const onClearance = (ctx, r) => { const items = load(PKEY(ctx.storeNo), { items: {} }).items || {}; return r.products.filter(p => items[p.kc]?.clr).length; };
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
    `<div class="inv-tgrid"><div class="card"><div class="ch"><h3>${tx('Off-site pallets worth calling back')}</h3><span class="cs-dim">${pal.length}</span></div>${pal.length ? pal.map(({ r, n }) => `<div class="inv-prow"><span class="pid">${esc(r.pid)}</span><span>${esc(r.title || r.desc || '')}</span><b>${tx('{n} on clearance', { n })}</b></div>`).join('') : `<p class="lbl">${tx('None of the off-site stock is on clearance.')}</p>`}${lds.length ? `<div class="inv-sub">${tx('Open loads')}</div>${lds.map(({ l, n }) => `<div class="inv-prow"><span class="pid go" data-go="manifests" data-load="${esc(l.id)}">${esc(l.label)}</span>${statusPill(l.status)}<b>${tx('{n} on clearance', { n })}</b></div>`).join('')}` : ''}</div>` +
    `<div class="card"><div class="ch"><h3>${tx('On clearance now')}</h3><span class="cs-dim">${onClr.length}</span></div>${onClr.length ? `<table class="wb-t"><thead><tr><th>${tx('Item')}</th><th>${tx('Price')}</th><th>${tx('Was')}</th><th>${tx('Held on')}</th></tr></thead><tbody>${onClr.slice(0, 60).map(([kc, v]) => `<tr><td>${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${name(kc)}</a>` : name(kc)} <small class="cs-dim">${esc(kc)}</small></td><td>${money(v.price)}</td><td>${money(v.was)}</td><td>${[...where.get(kc)].slice(0, 3).map(w => esc(w.startsWith('pallet:') ? tx('pallet {pid}', { pid: w.slice(7) }) : I.loads[w.slice(5)]?.label || tx('a load'))).join(', ')}</td></tr>`).join('')}</tbody></table>` : `<p class="lbl">${tx('Nothing held is on clearance.')}</p>`}</div></div>`;
}

// ── Register ────────────────────────────────────────────────────────────
// The pallets a filter shows: off-site by callback date (none last),
// overdue, fixtures, or received (latest first).
function model(ctx) {
  const I = inv(ctx), t = today(), sum = registerSummary(I.offsite, t), all = Object.values(I.offsite);
  // Everything off-site: the register's pallets and an off-site load's (By manifest lists both).
  sum.all = sum.live + Object.values(I.loads || {}).filter(l => l.status === 'offsite').reduce((n, l) => n + (l.pallets || []).length, 0);
  const rows = st.filter === 'overdue' ? sum.overdue : st.filter === 'fixtures' ? sum.byCallback.filter(isFixture) : st.filter === 'rec' ? all.filter(r => r.rec).sort((a, b) => (b.rec || '').localeCompare(a.rec || '')) : sum.byCallback;
  return { I, t, sum, all, rows };
}
const FILTERS = sum => [['live', tx('Off-site · {n}', { n: sum.live })], ['overdue', tx('Overdue · {n}', { n: sum.overdue.length })], ['fixtures', tx('Fixtures · {n}', { n: sum.fixtures })], ['rec', tx('Received · {n}', { n: sum.received })]];
const filterPills = (sum, cls = '') => `<div class="pills ${cls}">${FILTERS(sum).map(([k, l]) => `<button class="${st.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}</div>`;
const callback = r => `<label>${tx('Callback')}<input type="date" value="${esc(r.cb)}" data-act="cb" data-pid="${esc(r.pid)}"></label>`;
const recButton = r => r.rec ? `<button class="btn sm" data-act="unrec" data-pid="${esc(r.pid)}">${tx('Still off-site')}</button>` : `<button class="btn sm primary" data-act="rec" data-pid="${esc(r.pid)}">${ic('check')}${tx('Received')}</button>`;
const backOn = r => r.rec === 'yes' ? BACK : tx('Back {date}', { date: esc(fmtDate(r.rec)) });
const prods = r => r.products.length ? `<span class="prods">${r.products.slice(0, 6).map(p => `<i data-kccard="${esc(p.kc)}">${esc(p.kc)}${p.q ? ` ×${p.q}` : ''}</i>`).join('')}${r.products.length > 6 ? `<i>+${r.products.length - 6}</i>` : ''}</span>` : '';
const addForm = () => st.adding ? `<form class="inv-add" data-form="add"><input name="pid" placeholder="${tx('Pallet no')}" required maxlength="20"><input name="desc" placeholder="${tx('What is on it (43166022 x 12, …)')}" maxlength="200"><input name="req" placeholder="${tx('Requested by')}" maxlength="40"><label>${tx('Callback')}<input type="date" name="cb"></label><button class="btn primary sm" type="submit">${ic('plus')}${tx('Add')}</button><button class="btn sm" type="button" data-act="add-cancel">${tx('Cancel')}</button></form>` : '';

// A pallet's callback: back, called back on a truck, or the date to change.
const cbCell = r => r.rec ? `<small>${backOn(r)}</small>` : r.call ? `<small class="called">${ic('undo')}${tx('Called back · {when}', { when: callText(r.call) })}</small>` : callback(r);
function regRow(ctx, r, t) {
  const late = r.cb && !r.rec && !r.call && r.cb < t, soon = r.cb && !r.rec && r.cb >= t && r.cb <= addDays(t, 7), clr = r.rec ? 0 : onClearance(ctx, r);
  return `<div class="inv-row${r.rec ? ' rec' : ''}${st.hl === r.pid ? ' hl' : ''}"><span class="pid">${esc(r.pid)}</span>` +
    `<span class="what"><b>${esc(r.title || r.desc || tx('Pallet {pid}', { pid: r.pid }))}</b>${prods(r)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>` +
    `<span class="tags">${r.man ? pill('', esc(r.man)) : ''}${isFixture(r) ? pill('fx', tx('Fixtures')) : r.req ? pill('', esc(r.req)) : ''}${clr ? pill('clr', tx('{n} on clearance', { n: clr })) : ''}${r.sent ? `<small>${tx('Sent {date}', { date: esc(fmtDate(r.sent)) })}</small>` : ''}</span>` +
    `<span class="cb${late ? ' late' : soon ? ' soon' : ''}">${cbCell(r)}${late ? `<small>${tx('overdue')}</small>` : ''}</span>` +
    `<span class="acts">${recButton(r)}</span></div>`;
}
function register(ctx) {
  const { I, t, sum, all, rows } = model(ctx);
  const G = offsiteGroups(I, t), live = G.filter(g => g.state !== 'back');
  const mans = live.filter(g => g.kind === 'manifest').length, loads = live.filter(g => g.kind === 'load').length;
  const firstOver = live.find(g => g.state === 'overdue'), firstCall = live.find(g => g.calls.length);
  const from = [mans ? txn(mans, '{n} manifest', '{n} manifests') : '', loads ? txn(loads, '{n} load', '{n} loads') : ''].filter(Boolean);
  const tiles = `<div class="wb-kpis inv-kpis"><div class="wb-kpi"><span>${tx('Off-site')}</span><b>${sum.all}</b><small>${from.length ? tx('from {what}', { what: from.join(' · ') }) : txn(sum.fixtures, '{n} fixture pallet', '{n} fixture pallets')}</small></div>` +
    `<div class="wb-kpi${sum.overdue.length ? ' bad' : ''}"><span>${tx('Overdue returns')}</span><b>${sum.overdue.length}</b><small>${firstOver ? groupName(firstOver) : tx('callback date passed')}</small></div>` +
    `<div class="wb-kpi"><span>${tx('Due in 14 days')}</span><b>${sum.dueSoon.length}</b><small>${tx('next {date}', { date: sum.nextCallback ? esc(fmtDay(sum.nextCallback)) : '—' })}</small></div>` +
    `<div class="wb-kpi"><span>${tx('Called back')}</span><b>${sum.called}</b><small>${firstCall ? callText(firstCall.calls[0]) : tx('{n} received', { n: sum.received })}</small></div></div>`;
  const seg = `<div class="seg ofg-seg" role="tablist">${[['man', tx('By manifest')], ['date', tx('By callback date')]].map(([k, l]) => `<button role="tab" aria-selected="${st.view === k}" class="${st.view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}</button>`).join('')}</div>`;
  let body;
  if (st.view === 'man') {
    const shown = st.showBack ? G : live, back = G.length - live.length;
    body = (shown.length ? shown.map(g => groupHtml(ctx, g, t)).join('') : `<p class="lbl" style="padding:14px">${all.length ? tx('Nothing off-site now.') : tx('No off-site pallets yet. Import the off-site master list (.xlsx), or add a pallet by hand.')}</p>`) +
      (back ? `<button class="btn sm ofg-backs" data-act="backs">${st.showBack ? tx('Hide the ones all back') : txn(back, 'Show {n} manifest all back', 'Show {n} manifests all back')}</button>` : '') + divertedNote(ctx, t);
  } else body = `<div class="ofg-fil">${filterPills(sum, 'inv-filter')}</div><div class="inv-list">${rows.length ? rows.map(r => regRow(ctx, r, t)).join('') : `<p class="lbl" style="padding:14px">${all.length ? tx('Nothing in this list.') : tx('No off-site pallets yet. Import the off-site master list (.xlsx), or add a pallet by hand.')}</p>`}</div>`;
  return tiles + trucksAway(ctx, t) + `<div class="card ofg-card"><div class="ch"><h3>${tx('Off-site register')}</h3>${seg}<button class="btn sm" data-act="add">${ic('plus')}${tx('Add a pallet')}</button></div>${addForm()}${body}</div>`;
}

// One manifest (or load, or the other pallets) in storage: its tag and Call
// back, then its pallets, three at a time until opened.
const SHOW = 3;
function groupHtml(ctx, g, t) {
  const opened = st.open.has(g.key) || g.rows.length <= SHOW + 1, rows = opened ? g.rows : g.rows.slice(0, SHOW), mgr = isMgr(ctx);
  const act = g.state === 'back' ? '' : g.state === 'called' ? `<button class="btn sm" data-view="planner">${ic('m-planner')}${tx('Open the Planner')}</button>`
    : mgr ? `<button class="btn sm primary" data-act="callback" data-g="${esc(g.key)}">${ic('undo')}${tx('Call back')}</button>` : '';
  const loadRec = g.kind === 'load' ? `<button class="btn sm" data-act="load-rec" data-load="${esc(g.load)}">${ic('check')}${tx('Received')}</button>` : '';
  return `<div class="ofg ${g.state}"><div class="ofg-h"><div class="ofg-t"><b${g.kind === 'manifest' ? ' class="mono"' : ''}>${groupName(g)}</b><small>${groupSub(g)}</small></div><div class="ofg-tag">${groupTag(g)}</div><div class="ofg-a">${loadRec}${act}</div></div>` +
    `<div class="ofg-rows">${rows.map(r => g.kind === 'load' ? loadRow(r) : groupRow(r, t, g)).join('')}` +
    (opened ? (st.open.has(g.key) && g.rows.length > SHOW + 1 ? `<button class="ofg-more" data-act="more" data-g="${esc(g.key)}">${tx('Show fewer')}</button>` : '') : `<button class="ofg-more" data-act="more" data-g="${esc(g.key)}">${txn(g.rows.length - SHOW, '{n} more pallet', '{n} more pallets')}</button>`) + `</div></div>`;
}
// A pallet in its group. Called back with the rest of the group, the
// group's tag says so; called on its own, the row names its truck.
function groupRow(r, t, g) {
  const late = r.cb && !r.rec && !r.call && r.cb < t, same = r.call && !r.rec && g.state === 'called' && g.calls.length === 1;
  const cell = r.call && !r.rec ? (same ? '' : `<small class="called">${ic('undo')}${callText(r.call)}</small>`) : cbCell(r);
  return `<div class="ofg-r${r.rec ? ' rec' : ''}${st.hl === r.pid ? ' hl' : ''}"><span class="pid">${r.bay ? `<b>${esc(r.bay)}</b>` : ''}${esc(r.pid)}</span><span class="dl">${deptLine(r) || esc(r.title || r.desc || '')}</span><span class="ctn">${r.ctn ? tx('{n} ctn', { n: r.ctn }) : ''}</span><span class="cb${late ? ' late' : ''}">${cell}</span><span class="acts">${r.call && !r.rec ? '' : recButton(r)}</span></div>`;
}
const loadRow = r => `<div class="ofg-r"><span class="pid">${esc(r.pid)}</span><span class="dl">${deptLine(r)}</span><span class="ctn">${r.units ? txn(r.units, '{n} unit', '{n} units') : ''}</span><span class="cb"></span><span class="acts"></span></div>`;
// Diverted manifests went elsewhere for good: not on the register.
function divertedNote(ctx, t) {
  const xs = []; for (const [date, d] of Object.entries(ctx.store.get('plan')?.days || {})) for (const r of Object.values(d.routes || {})) if (r.route === 'diverted' && date >= addDays(t, -14)) xs.push({ date, r });
  if (!xs.length) return '';
  xs.sort((a, b) => b.date.localeCompare(a.date));
  return `<p class="ofg-note">${ic('route')}<span>${tx('Diverted manifests aren’t on the register: they aren’t ours to call back.')} ${xs.slice(0, 3).map(({ date, r }) => routeManifest(r) ? (r.to ? tx('{man} went to {to} on {day}.', { man: esc(routeManifest(r)), to: esc(r.to), day: esc(fmtDay(date)) }) : tx('{man} was diverted on {day}.', { man: esc(routeManifest(r)), day: esc(fmtDay(date)) })) : '').filter(Boolean).join(' ')}</span></p>`;
}

// Whole trucks marked off-site in the Planner (plan.route), not yet back,
// whose consols are not on the register (no manifest was staged when it
// was marked): the day each was due, its manifest and the day it lands here.
function trucksAway(ctx, t) {
  const xs = [];
  const listed = new Set(Object.values(inv(ctx).offsite).filter(r => r.from).map(r => `${r.from.date}-${r.from.slot}`));
  for (const [date, d] of Object.entries(ctx.store.get('plan')?.days || {})) for (const [n, r] of Object.entries(d.routes || {})) if (r.route === 'offsite' && (!r.lands || r.lands >= t) && !listed.has(`${date}-${n}`)) xs.push({ date, n, r });
  if (!xs.length) return '';
  xs.sort((a, b) => (a.r.lands || '9').localeCompare(b.r.lands || '9') || a.date.localeCompare(b.date));
  return `<div class="card rt-away"><div class="ch"><h3>${tx('Whole trucks off-site')}</h3><span class="cs-dim">${xs.length}</span><button class="btn sm" data-view="planner">${ic('m-planner')}${tx('Open the Planner')}</button></div>` +
    xs.map(({ date, n, r }) => { const back = broughtBy(ctx.store.get('plan'), ctx.store.get('dock'), { date, slot: n }); return `<div class="rt-away-r"><b>${tx('Truck {no} of {day}', { no: n, day: esc(fmtDate(date)) })}</b><span class="mono">${esc(routeManifest(r) || '—')}</span>${routeTag(r)}${back ? `<span class="rt-tag back">${ic('undo')}${tx('Called back: Truck {no} · {day}', { no: back.slice(12), day: esc(fmtDate(back.slice(0, 10))) })}</span>` : ''}${r.note ? `<small class="cs-dim">${esc(r.note)}</small>` : ''}</div>`; }).join('') + `</div>`;
}

// ── Phone ───────────────────────────────────────────────────────────────
function phone(ctx) {
  const { I, t, sum, all, rows } = model(ctx);
  const card = (r, inGroup = false) => {
    const late = r.cb && !r.rec && !r.call && r.cb < t, clr = r.rec ? 0 : onClearance(ctx, r);
    return `<div class="ofp-m${r.rec ? ' rec' : ''}${late ? ' late' : ''}${st.hl === r.pid ? ' hl' : ''}"><div class="t"><b class="pid">${r.bay ? esc(r.bay) + ' ' : ''}${esc(r.pid)}</b><span>${deptLine(r) || esc(r.title || r.desc || tx('Pallet {pid}', { pid: r.pid }))}</span></div>` +
      `${prods(r)}<div class="tags">${r.man && !inGroup ? pill('', esc(r.man)) : ''}${r.ctn ? pill('', tx('{n} ctn', { n: r.ctn })) : ''}${isFixture(r) ? pill('fx', tx('Fixtures')) : r.req ? pill('', esc(r.req)) : ''}${clr ? pill('clr', tx('{n} on clearance', { n: clr })) : ''}${late ? pill('late', tx('overdue')) : ''}</div>` +
      `<div class="f">${cbCell(r)}${r.call && !r.rec ? '' : recButton(r)}</div></div>`;
  };
  const G = offsiteGroups(I, t), live = G.filter(g => g.state !== 'back'), mgr = isMgr(ctx);
  const head = [tx('{n} off-site', { n: sum.all }), sum.overdue.length ? `<b class="c-red">${tx('{n} overdue', { n: sum.overdue.length })}</b>` : '', sum.called ? tx('{n} called back', { n: sum.called }) : ''].filter(Boolean).join(' · ');
  const seg = `<div class="seg ofg-seg m" role="tablist">${[['man', tx('By manifest')], ['date', tx('By date')]].map(([k, l]) => `<button role="tab" aria-selected="${st.view === k}" class="${st.view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}</button>`).join('')}</div>`;
  const group = g => {
    const opened = st.open.has(g.key);
    const act = g.state === 'called' || g.state === 'back' || !mgr ? '' : `<button class="btn sm" data-act="callback" data-g="${esc(g.key)}">${ic('undo')}${tx('Call back')}</button>`;
    return `<div class="ofg-m ${g.state}"><button class="ofg-mh" data-act="more" data-g="${esc(g.key)}" aria-expanded="${opened}"><span class="t"><b${g.kind === 'manifest' ? ' class="mono"' : ''}>${groupName(g)}</b><small>${groupSub(g)}</small></span>${ic('chev')}</button>` +
      `<div class="ofg-mf">${groupTag(g)}${act}</div>` + (opened ? `<div class="ofg-mr">${g.kind === 'load' ? g.rows.map(r => `<div class="ofp-m"><div class="t"><b class="pid">${esc(r.pid)}</b><span>${deptLine(r)}</span></div></div>`).join('') : g.rows.map(r => card(r, true)).join('')}</div>` : '') + `</div>`;
  };
  const list = st.view === 'man'
    ? (live.length ? live.map(group).join('') : `<div class="mv-note">${ic('box')}${all.length ? tx('Nothing off-site now.') : tx('No off-site pallets yet. Add one as it goes off-site.')}</div>`)
    : filterPills(sum, 'ofp-pills') + (rows.length ? rows.map(r => card(r)).join('') : `<div class="mv-note">${ic('box')}${all.length ? tx('Nothing in this list.') : tx('No off-site pallets yet. Add one as it goes off-site.')}</div>`);
  return mhead(tx('Off-site pallets'), head, st.adding ? '' : `<button class="btn sm" data-act="add">${ic('plus')}${tx('Add a pallet')}</button>`) +
    `<div class="ofp-mob">${addForm()}${seg}${list}</div>`;
}

export default {
  id: 'offsite', title: tx('Off-site pallets'), icon: 'm-inventory', area: 'backdock',
  desktop(ctx) {
    const { I, sum } = model(ctx);
    const head = vh(tx('Off-site pallets'), sub(txn(sum.all, '{n} pallet off-site', '{n} pallets off-site'), sum.overdue.length ? `<b class="c-red">${tx('{n} overdue', { n: sum.overdue.length })}</b>` : '', txn(sum.received, '{n} received', '{n} received')), `<label class="btn primary" title="${tx('The off-site master list (.xlsx)')}">${ic('file')}${tx('Import the master list')}<input type="file" accept=".xlsx,.xls,.csv" data-act="file" hidden></label>`, 'm-inventory');
    const tabs = `<div class="tabs inv-tabs">${TABS.map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>`;
    return head + stagePanel(ctx, st.stage) + tabs + `<div class="inv-body">${st.tab === 'clearance' ? clearance(ctx) : register(ctx)}</div>`;
  },
  mobile(ctx) { return `<div id="ofpmob">${phone(ctx)}</div>`; },
  mount(ctx, root) {
    // From search or the dashboard: an off-site pallet, highlighted in the register, once.
    if (ctx.arg?.pid && ctx.arg !== usedArg) {
      usedArg = ctx.arg; const r = inv(ctx).offsite[ctx.arg.pid];
      if (r) { st.tab = 'register'; st.view = 'date'; st.filter = r.rec ? 'rec' : 'live'; st.hl = r.pid; setTimeout(() => { ctx.rerender(); setTimeout(() => document.querySelector('.inv-row.hl, .ofp-m.hl')?.scrollIntoView({ block: 'center' }), 50); }, 0); }
    }
    if (st.tab === 'clearance' && !ctx.isMobile) checkPrices(ctx).then(changed => { if (changed && st.tab === 'clearance') ctx.rerender(); }).catch(() => {});
    // The phone repaints its list in place, so a callback being typed elsewhere keeps its place.
    const repaint = () => { if (ctx.isMobile) { const h = $('#ofpmob', root); if (h) h.innerHTML = phone(ctx); } else ctx.rerender(); };
    root.addEventListener('change', async e => {
      const f = e.target.closest('[data-act="file"]'); if (f?.files?.[0]) { const s = await stageFile(f.files[0]); f.value = ''; if (s) { st.stage = s; ctx.rerender(); } return; }
      if (st.stage && (e.target.closest('[data-col]') || e.target.closest('[data-stage]'))) { if (stageChange(st.stage, e.target)) ctx.rerender(); return; }
      // A date picked is a date chosen: repaint so overdue and soon follow it.
      const cb = e.target.closest('[data-act="cb"]'); if (cb) { try { await send(ctx, 'inventory.offsite.update', { pid: cb.dataset.pid }, { cb: cb.value || '' }); toast(cb.value ? tx('Callback set: {date}', { date: fmtDate(cb.value) }) : tx('Callback cleared')); repaint(); } catch (er) { toast(er.message || tx('Couldn’t save'), 'bad'); } }
    });
    root.addEventListener('submit', async e => {
      const form = e.target.closest('[data-form="add"]'); if (!form) return; e.preventDefault();
      const fd = new FormData(form), desc = String(fd.get('desc') || ''), products = [...desc.matchAll(/(\d{8,9})\s*[x×*]\s*(\d+)/gi)].map(m => ({ kc: m[1], q: Number(m[2]) }));
      try { await send(ctx, 'inventory.offsite.add', { pid: String(fd.get('pid')).trim() }, { sent: today(), desc, title: desc.replace(/(\d{8,9})\s*[x×*]\s*\d+/gi, '').trim().slice(0, 80), req: String(fd.get('req') || ''), cb: String(fd.get('cb') || ''), products }); st.adding = false; toast(tx('Pallet added to the register')); ctx.rerender(); }
      catch (er) { toast(er.message || tx('Couldn’t add the pallet'), 'bad'); }
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a || a.tagName === 'INPUT' || a.tagName === 'SELECT') return;
      const act = a.dataset.act;
      if (act === 'tab') { st.tab = a.dataset.t; return ctx.rerender(); }
      if (act === 'view') { st.view = a.dataset.v; return repaint(); }
      if (act === 'more') { const k = a.dataset.g; if (st.open.has(k)) st.open.delete(k); else st.open.add(k); return repaint(); }
      if (act === 'backs') { st.showBack = !st.showBack; return repaint(); }
      if (act === 'callback') { const g = offsiteGroups(inv(ctx), today()).find(x => x.key === a.dataset.g); if (g) await callbackSheet(ctx, g); return; }
      if (act === 'load-rec') { try { await send(ctx, 'inventory.load.status', { load: a.dataset.load }, { status: 'received' }); toast(tx('Load received')); } catch (er) { toast(er.message || tx('Couldn’t save'), 'bad'); } return; }
      if (act === 'filter') { st.filter = a.dataset.f; return repaint(); }
      if (act === 'add') { st.adding = true; ctx.rerender(); return root.querySelector('[data-form="add"] [name="pid"]')?.focus(); }
      if (act === 'add-cancel') { st.adding = false; return ctx.rerender(); }
      if (act === 'stage-cancel') { st.stage = null; return ctx.rerender(); }
      if (act === 'stage-save') {
        const s = st.stage; if (!s) return; a.disabled = true;
        try { const r = await saveStage(ctx, s); st.stage = null; if (r.kind === 'load') return ctx.go('manifests', { load: r.id }); st.tab = 'register'; ctx.rerender(); }
        catch (er) { a.disabled = false; toast(tx('Couldn’t save: {error}', { error: er.message || er }), 'bad'); }
        return;
      }
      if (act === 'rec' || act === 'unrec') { try { await send(ctx, 'inventory.offsite.update', { pid: a.dataset.pid }, { rec: act === 'rec' ? today() : '' }); toast(act === 'rec' ? tx('Pallet {pid} received', { pid: a.dataset.pid }) : tx('Pallet {pid} is off-site again', { pid: a.dataset.pid })); } catch (er) { toast(er.message || tx('Couldn’t save'), 'bad'); } return; }
      if (act === 'prices') { a.disabled = true; try { await checkPrices(ctx, true); } catch {} return ctx.rerender(); }
      if (act === 'seen') { const E = load(EKEY(ctx.storeNo), { seen: '', events: [] }); save(EKEY(ctx.storeNo), { ...E, seen: new Date().toISOString() }); return ctx.rerender(); }
    });
    return [ctx.store.on('inventory', () => { if (!st.stage && !st.adding && !root.querySelector('input:focus, select:focus')) repaint(); })];
  },
};
