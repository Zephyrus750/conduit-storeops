// Off-site pallets: the register of pallets sent off-site (the Inventory
// hub's register and clearance watch, moved to the Back dock on 23 Oct 2026).
//   Register   the pallets, returns by callback date, received, added by
//              hand or read from the off-site master list (.xlsx)
//   Clearance  the catalogue's prices for every keycode held off-site or on
//              an open load, checked once a day on this device: what went on
//              clearance or dropped, and which pallets are worth calling back
// On a phone: the list by callback date, mark one received, change its
// callback, add one; a pallet on clearance says so when this device has
// checked prices. The register is store events (inventory.offsite.*).

import { $, ic, esc, vh, sub, toast, fmtDate, today, mhead } from '../../ui.js';
import { registerSummary, clearanceDiff, isFixture } from '../../../shared/inventory.js';
import { addDays } from '../../../shared/time.js';
import { inv, send, statusPill, stageFile, stagePanel, saveStage, stageChange } from './loads.js';
import { tx, txn } from '../../i18n.js';

const TABS = [['register', tx('Off-site register')], ['clearance', tx('Clearance')]];
// A pallet back on site with no date ("Back" alone is the navigation button).
const BACK = tx('returned::Back');
let usedArg = null;   // a view's argument stays on re-renders: apply it once
const st = { tab: 'register', filter: 'live', stage: null, adding: false, hl: null };
const pill = (cls, text) => `<span class="inv-pill ${cls}">${text}</span>`;

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

function regRow(ctx, r, t) {
  const late = r.cb && !r.rec && r.cb < t, soon = r.cb && !r.rec && r.cb >= t && r.cb <= addDays(t, 7), clr = r.rec ? 0 : onClearance(ctx, r);
  return `<div class="inv-row${r.rec ? ' rec' : ''}${st.hl === r.pid ? ' hl' : ''}"><span class="pid">${esc(r.pid)}</span>` +
    `<span class="what"><b>${esc(r.title || r.desc || tx('Pallet {pid}', { pid: r.pid }))}</b>${prods(r)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>` +
    `<span class="tags">${isFixture(r) ? pill('fx', tx('Fixtures')) : r.req ? pill('', esc(r.req)) : ''}${clr ? pill('clr', tx('{n} on clearance', { n: clr })) : ''}${r.sent ? `<small>${tx('Sent {date}', { date: esc(fmtDate(r.sent)) })}</small>` : ''}</span>` +
    `<span class="cb${late ? ' late' : soon ? ' soon' : ''}">${r.rec ? `<small>${backOn(r)}</small>` : callback(r)}${late ? `<small>${tx('overdue')}</small>` : ''}</span>` +
    `<span class="acts">${recButton(r)}</span></div>`;
}
function register(ctx) {
  const { I, t, sum, all, rows } = model(ctx);
  const tiles = `<div class="wb-kpis inv-kpis"><div class="wb-kpi"><span>${tx('Off-site')}</span><b>${sum.live}</b><small>${txn(sum.fixtures, '{n} fixture pallet', '{n} fixture pallets')}</small></div><div class="wb-kpi${sum.overdue.length ? ' bad' : ''}"><span>${tx('Overdue returns')}</span><b>${sum.overdue.length}</b><small>${tx('callback date passed')}</small></div><div class="wb-kpi"><span>${tx('Due in 14 days')}</span><b>${sum.dueSoon.length}</b><small>${tx('next {date}', { date: sum.nextCallback ? esc(fmtDate(sum.nextCallback)) : '—' })}</small></div><div class="wb-kpi"><span>${tx('Received')}</span><b>${sum.received}</b><small>${I.offsiteAt ? (I.offsiteSrc ? tx('list from {src}', { src: esc(I.offsiteSrc) }) : tx('list from a file')) : tx('no list read yet')}</small></div></div>`;
  const list = rows.length ? rows.map(r => regRow(ctx, r, t)).join('') : `<p class="lbl" style="padding:14px">${all.length ? tx('Nothing in this list.') : tx('No off-site pallets yet. Import the off-site master list (.xlsx), or add a pallet by hand.')}</p>`;
  return tiles + `<div class="card"><div class="ch"><h3>${tx('Returns by callback date')}</h3>${filterPills(sum, 'inv-filter')}<button class="btn sm" data-act="add">${ic('plus')}${tx('Add a pallet')}</button></div>${addForm()}<div class="inv-list">${list}</div></div>`;
}

// ── Phone ───────────────────────────────────────────────────────────────
function phone(ctx) {
  const { t, sum, all, rows } = model(ctx);
  const card = r => {
    const late = r.cb && !r.rec && r.cb < t, clr = r.rec ? 0 : onClearance(ctx, r);
    return `<div class="ofp-m${r.rec ? ' rec' : ''}${late ? ' late' : ''}${st.hl === r.pid ? ' hl' : ''}"><div class="t"><b class="pid">${esc(r.pid)}</b><span>${esc(r.title || r.desc || tx('Pallet {pid}', { pid: r.pid }))}</span></div>` +
      `${prods(r)}<div class="tags">${isFixture(r) ? pill('fx', tx('Fixtures')) : r.req ? pill('', esc(r.req)) : ''}${clr ? pill('clr', tx('{n} on clearance', { n: clr })) : ''}${late ? pill('late', tx('overdue')) : ''}</div>` +
      `<div class="f">${r.rec ? `<small>${backOn(r)}</small>` : callback(r)}${recButton(r)}</div></div>`;
  };
  return mhead(tx('Off-site pallets'), sum.overdue.length ? `${txn(sum.live, '{n} pallet off-site', '{n} pallets off-site')} · <b class="c-red">${tx('{n} overdue', { n: sum.overdue.length })}</b>` : txn(sum.live, '{n} pallet off-site', '{n} pallets off-site'), st.adding ? '' : `<button class="btn sm" data-act="add">${ic('plus')}${tx('Add a pallet')}</button>`) +
    `<div class="ofp-mob">${addForm()}${filterPills(sum, 'ofp-pills')}` +
    (rows.length ? rows.map(card).join('') : `<div class="mv-note">${ic('box')}${all.length ? tx('Nothing in this list.') : tx('No off-site pallets yet. Add one as it goes off-site.')}</div>`) + `</div>`;
}

export default {
  id: 'offsite', title: tx('Off-site pallets'), icon: 'm-inventory', area: 'backdock',
  desktop(ctx) {
    const { I, sum } = model(ctx);
    const head = vh(tx('Off-site pallets'), sub(txn(sum.live, '{n} pallet off-site', '{n} pallets off-site'), sum.overdue.length ? `<b class="c-red">${tx('{n} overdue', { n: sum.overdue.length })}</b>` : '', txn(sum.received, '{n} received', '{n} received')), `<label class="btn primary" title="${tx('The off-site master list (.xlsx)')}">${ic('file')}${tx('Import the master list')}<input type="file" accept=".xlsx,.xls,.csv" data-act="file" hidden></label>`, 'm-inventory');
    const tabs = `<div class="tabs inv-tabs">${TABS.map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>`;
    return head + stagePanel(ctx, st.stage) + tabs + `<div class="inv-body">${st.tab === 'clearance' ? clearance(ctx) : register(ctx)}</div>`;
  },
  mobile(ctx) { return `<div id="ofpmob">${phone(ctx)}</div>`; },
  mount(ctx, root) {
    // From search or the dashboard: an off-site pallet, highlighted in the register, once.
    if (ctx.arg?.pid && ctx.arg !== usedArg) {
      usedArg = ctx.arg; const r = inv(ctx).offsite[ctx.arg.pid];
      if (r) { st.tab = 'register'; st.filter = r.rec ? 'rec' : 'live'; st.hl = r.pid; setTimeout(() => { ctx.rerender(); setTimeout(() => document.querySelector('.inv-row.hl, .ofp-m.hl')?.scrollIntoView({ block: 'center' }), 50); }, 0); }
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
      const fd = new FormData(form), desc = String(fd.get('desc') || ''), products = [...desc.matchAll(/(\d{8})\s*[x×*]\s*(\d+)/gi)].map(m => ({ kc: m[1], q: Number(m[2]) }));
      try { await send(ctx, 'inventory.offsite.add', { pid: String(fd.get('pid')).trim() }, { sent: today(), desc, title: desc.replace(/(\d{8})\s*[x×*]\s*\d+/gi, '').trim().slice(0, 80), req: String(fd.get('req') || ''), cb: String(fd.get('cb') || ''), products }); st.adding = false; toast(tx('Pallet added to the register')); ctx.rerender(); }
      catch (er) { toast(er.message || tx('Couldn’t add the pallet'), 'bad'); }
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a || a.tagName === 'INPUT' || a.tagName === 'SELECT') return;
      const act = a.dataset.act;
      if (act === 'tab') { st.tab = a.dataset.t; return ctx.rerender(); }
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
