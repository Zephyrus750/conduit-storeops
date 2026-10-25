// The search palette (the showcase's omni): one input that understands a
// keycode, a shelf, a department or a tool name, and the store's own
// records: manifests, consolidations, cages, other loads and off-site
// pallets (shared/finder.js). Keycodes go to the catalogue
// On a phone it is streamlined: shelves, departments and micro-departments
// only, no keyboard hints, no records, and no product codes for now.
// (client.catalogue.lookup); shelves come from the mounted map; tools from
// the view registry. Opens from the header search, the rail search, Ctrl K,
// and the phone's search bar (a compact list under the bar; see bar()).

import { recallTag } from './recallflag.js';
import { $, $$, ic, esc, dep, DEPT_NAME, DEPT_COLOUR, toast } from './ui.js';
import { mountMap, hasMap, canonCode, splitCanon, shelfForLocation, runText } from './map.js';
import { VIEWS } from './registry.js';
import { findRecords } from '../shared/finder.js';
import { RING } from './views/stockroom/common.js';
import { SUBS, MICRO, microId, microCode, microName } from './data/micros.js';
import { tx, txn, lang, locale } from './i18n.js';

const KIND = { prod: tx('Product code'), cons: tx('Consolidation'), shelf: tx('Shelf'), loc: tx('Shelf or bay'), name: tx('Name'), none: tx('Type to search') };
const KICON = { prod: 'm-product', cons: 'packages', shelf: 'pin', loc: 'pin', name: 'search', none: 'search' };
const KENTER = { prod: tx('open the product'), cons: tx('open the top match'), shelf: tx('show on the map'), loc: tx('show on the map'), name: tx('open the top match'), none: tx('open') };
export function classify(q) {
  q = (q || '').trim();
  if (!q) return 'none';
  if (/^\d{6,13}$/.test(q)) return 'prod';
  if (/^\d{14,22}$/.test(q)) return 'cons';
  if (/^[A-Za-z]\d+[-\s]?[SsEe]?\d+$/.test(q)) return 'shelf';
  if (/^[A-Za-z]?\d{1,4}$/.test(q)) return 'loc';
  return 'name';
}
const RECENT_KEY = 'search_recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const remember = (q, k) => { try { const r = recent().filter(x => x[0] !== q); r.unshift([q, k]); localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 6))); } catch {} };
const hi = (t, q) => { if (!q) return esc(t); const i = t.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<em>' + esc(t.slice(i, i + q.length)) + '</em>' + esc(t.slice(i + q.length)); };
const orow = (cls, icon, title, sub, act, attrs) => `<div class="orow" ${attrs}><span class="oi ${cls}">${ic(icon)}</span><span class="ot"><b>${title}</b><span>${sub}</span></span><span class="oa">${act} ${ic('arrow')}</span></div>`;
const grp = (t, n) => `<div class="ogrp">${t}${n != null ? `<span>${n}</span>` : ''}</div>`;
const money = v => v == null ? '' : '$' + Number(v).toFixed(2);

const tNo = id => String(id || '').replace(/^\d{4}-\d{2}-\d{2}-T/, '');
// Where a consolidation's pallet stands (shared/finder.js and the dock's
// pallet states), and another load's state, in words.
const WHERE = { landed: tx('landed'), assigned: tx('assigned'), active: tx('active'), paused: tx('paused'), done: tx('done'), 'not landed': tx('not landed'), 'scanned, not on the manifest': tx('scanned, not on the manifest'), 'scanned, no manifest yet': tx('scanned, no manifest yet'), 'held for the next truck': tx('held for the next truck'), incoming: tx('incoming'), received: tx('received'), offsite: tx('offsite') };
const where = v => WHERE[v] || v;
// A cage's ring colour by name (js/views/stockroom/common.js).
const ringName = r => (RING[r] ? RING[r][0] : r);
// The store's records that match, as palette groups.
function recordsHtml(r, Q) {
  let out = '';
  if (r.consols.length) out += grp(tx('Consolidations'), r.consols.length) + r.consols.map(c => c.seen
    ? orow('d', 'packages', tx('Consolidation <span class="mono">{id}</span>', { id: esc(c.id) }), c.seen.k === 'man' ? tx('Manifested on Truck {truck} · {day}', { truck: esc(tNo(c.seen.t)), day: esc(c.seen.d) }) : tx('Scanned on Truck {truck} · {day}', { truck: esc(tNo(c.seen.t)), day: esc(c.seen.d) }), tx('History'), `data-view="rhistory"`)
    : orow('d', 'packages', tx('Consolidation <span class="mono">{id}</span>', { id: esc(c.id) }) + (c.cartons ? ' · ' + tx('{n} ctn', { n: c.cartons }) : ''), [c.manNo ? tx('Manifest {no}', { no: esc(c.manNo) }) : '', c.closed ? tx('Truck {truck} (finalised)', { truck: esc(tNo(c.truck)) }) : tx('Truck {truck}', { truck: esc(tNo(c.truck)) }), c.bay ? tx('on <b>{bay}</b>, {status}', { bay: esc(c.bay), status: esc(where(c.status)) }) : esc(where(c.status)), c.dept ? tx('dept {dept}', { dept: esc(c.dept) }) : ''].filter(Boolean).join(' · '), tx('Open'), c.closed ? `data-view="rhistory"` : `data-view="receiving" data-truck="${esc(c.truck)}"${c.bay ? ` data-bay="${esc(c.bay)}"` : ''}`)).join('');
  if (r.manifests.length) out += grp(tx('Manifests'), r.manifests.length) + r.manifests.map(m => orow('d', 'file', tx('Manifest {no}', { no: hi(m.manNo, Q) }), [txn(m.consols, '{n} consol', '{n} consols'), txn(m.cartons, '{n} carton', '{n} cartons'), m.despatch ? tx('despatch {date}', { date: esc(m.despatch) }) : '', m.truck ? tx('on Truck {truck}', { truck: esc(tNo(m.truck)) }) : ''].filter(Boolean).join(' · '), tx('Open'), `data-view="manifests" data-man="${esc(m.manNo)}"`)).join('');
  if (r.cages.length) out += grp(tx('Cages'), r.cages.length) + r.cages.map(c => orow('s', 'm-cages', tx('Cage {id}', { id: hi(c.id, Q) }), [esc(ringName(c.ring)), c.location ? tx('at {place}', { place: esc(c.location) }) : tx('not parked'), txn(c.lines, '{n} line', '{n} lines'), c.has ? `<b>${tx('{n} of this keycode', { n: c.has })}</b>` : ''].filter(Boolean).join(' · '), tx('Open'), `data-view="cages" data-cage="${esc(c.id)}"`)).join('');
  if (r.loads.length) out += grp(tx('Other loads'), r.loads.length) + r.loads.map(l => orow('', 'box', tx('Load {label}', { label: hi(l.label, Q) }), [esc(where(l.status)), txn(l.pallets, '{n} pallet', '{n} pallets'), l.has.length ? tx('on pallet {pallets}', { pallets: esc(l.has.slice(0, 3).join(', ')) }) : ''].filter(Boolean).join(' · '), tx('Open'), `data-view="manifests" data-load="${esc(l.id)}"`)).join('');
  if (r.offsite.length) out += grp(tx('Off-site pallets'), r.offsite.length) + r.offsite.map(o => orow('', 'truck', tx('Off-site pallet {pid}', { pid: hi(String(o.pid), Q) }), [o.title ? esc(o.title) : tx('no description'), o.has ? `<b>${tx('{n} of this keycode', { n: o.has })}</b>` : '', o.rec ? tx('back') : o.cb ? tx('callback {date}', { date: esc(o.cb) }) : ''].filter(Boolean).join(' · '), tx('Open'), `data-view="offsite" data-pid="${esc(o.pid)}"`)).join('');
  if (r.recalls.length) out += grp(tx('Recalls'), r.recalls.length) + r.recalls.map(x => orow('', 'alert', `${x.status === 'closed' ? '' : recallTag(x) + ' '}${hi(x.title, Q)}`, [x.kind === 'withdrawal' ? tx('Withdrawal') : tx('Recall'), RC_STATUS[x.status], x.ref ? esc(x.ref) : '', x.kc ? tx('lists {kc}', { kc: esc(x.kc) }) : ''].filter(Boolean).join(' · '), tx('Open'), `data-view="recalls" data-recall="${esc(x.id)}"`)).join('');
  if (r.equipment.length) out += grp(tx('Equipment'), r.equipment.length) + r.equipment.map(e => orow('', 'm-equipment', `<span class="mono">${hi(e.code, Q)}</span>${e.name ? ' ' + esc(e.name) : ''}`, esc(e.loc), tx('Open'), `data-view="equipment" data-equip="${esc(e.id)}"`)).join('');
  return out;
}
const ARG_KEYS = ['select', 'dept', 'micro', 'q', 'man', 'cage', 'load', 'pid', 'truck', 'bay', 'equip', 'recall'];
const RC_STATUS = { open: tx('issue status::Open'), removing: tx('Removing'), removed: tx('All removed'), closed: tx('Closed') };

export function initSearch({ client, frame, go, tools = () => [], life = () => null, data = () => null, phone = () => false }) {
  // On a phone, the records that open desk-only views (manifests, other loads) are left out.
  const found = Q => { const r = findRecords(data(), Q); if (phone()) { r.manifests = []; r.loads = []; r.equipment = []; } return r; };
  const el = document.createElement('div'); el.className = 'omni'; el.id = 'omni';
  el.innerHTML = `<div class="pal" role="dialog" aria-label="${tx('Search')}"><div class="in">${ic('search')}<input id="oq" placeholder="${tx('Search a keycode, a shelf like A16 S2, a manifest, a consolidation, a cage, a load or a tool…')}" autocomplete="off" inputmode="search"><button class="voicebtn" type="button" data-voice hidden aria-label="${tx('Search by voice')}" title="${tx('Search by voice')}">${ic('mic')}</button><span class="okind" id="okind">${tx('Type to search')}</span><span class="esc">Esc</span><button class="ocancel" type="button" data-ocancel>${tx('Cancel')}</button></div><div class="cols"><div class="body" id="obody"></div><div class="prev" id="oprev" hidden></div></div><div class="ofoot"><span><kbd>↑</kbd> <kbd>↓</kbd> ${tx('move')}</span><span><kbd>Enter</kbd> <span id="oenter">${tx('open')}</span></span><span><kbd>Esc</kbd> ${tx('close')}</span></div></div>`;
  frame.appendChild(el);
  const input = $('#oq', el), body = $('#obody', el), prev = $('#oprev', el), pal = $('.pal', el);
  let shelves = null, seq = 0, sel = 0;

  // Shelf ids and departments from the mounted map, read once per map.
  function shelfIndex() {
    if (shelves) return shelves;
    shelves = [];
    const stage = document.createElement('div');
    try { const m = mountMap(stage, { mono: true, badges: false, tips: false, clone: true }); const by = new Map(); for (const g of m.segments()) { const info = m.shelfInfo(g); const e = by.get(info.id) || { id: info.id, c: canonCode(info.id), dept: info.dept, segments: info.segments, subs: [] }; if (info.sub) e.subs.push(canonCode(info.sub)); by.set(info.id, e); } shelves.push(...by.values()); } catch {}
    return shelves;
  }
  function invalidate() { shelves = null; }

  // Focus goes back to whatever opened the palette when it closes.
  let opener = null;
  const DESK_PH = input.placeholder, PHONE_PH = tx('Search');
  function open(q = '') { if (!el.classList.contains('open')) opener = document.activeElement; el.classList.add('open'); el.classList.toggle('phone', phone()); input.placeholder = phone() ? PHONE_PH : DESK_PH; input.value = q; render(q); try { input.focus(); } catch {} }
  function close() { el.classList.remove('open'); prev.hidden = true; prev.innerHTML = ''; pal.classList.remove('wide'); if (opener?.isConnected && opener !== document.body) { try { opener.focus(); } catch {} } opener = null; }
  const isOpen = () => el.classList.contains('open');

  // The shelves a typed shelf, run or stockroom bay names. "A16S1",
  // "A16 S1" and "A16-S1" name one shelf of the run A16: the row and the
  // map keep that shelf rather than widening to the run. A stockroom bay
  // number (7002) is found through the shelf that lists it.
  function shelfRows(U) {
    const bay = hasMap() && /^\d{3,6}[A-Z]?$/.test(canonCode(U)) ? shelfForLocation(canonCode(U)) : null;
    const C = bay || canonCode(U), { shelf: id, sub: suffix } = splitCanon(C);
    const hits = hasMap() ? shelfIndex().filter(s => s.c === C || s.c === id || (!suffix && !bay && s.c.startsWith(id))).slice(0, 8) : [];
    const modOf = s => suffix && s.c !== C && s.subs.includes(suffix) ? suffix : '';
    const sel = s => esc(s.id + modOf(s));
    const rows = hits.map(s => orow('s', 'pin', `${modOf(s) || s.segments === 1 ? tx('Shelf {code}', { code: hi(s.id, id) + (modOf(s) ? ' ' + esc(modOf(s)) : '') }) : tx('Run {code}', { code: hi(s.id, id) })}${!modOf(s) && suffix ? ` <small class="warn">${tx('no shelf {code}', { code: esc(s.id) + ' ' + esc(suffix) })}</small>` : ''} ${dep(s.dept)}`, `${DEPT_NAME[s.dept] || s.dept || tx('no department')} · ${esc(runText(s.id, modOf(s), s.subs, s.segments))}`, tx('Show on map'), `data-view="map" data-select="${sel(s)}"`));
    return { hits, rows, bay, modOf, sel, id, suffix };
  }

  // The phone's search: a shelf or run, a department by its code (H1) or
  // name (Kitchen), a micro-department by its number (038) or name. Product
  // codes, records and tools are not searched here yet.
  function renderPhone(q) {
    const Q = q.trim(), ql = Q.toLowerCase(), k = classify(Q);
    let out = '';
    if (!Q) {
      const r = recent().filter(x => x[1] !== 'prod' && x[1] !== 'cons');
      if (r.length) out += grp(tx('Recent')) + r.map(x => orow('s', 'history', esc(x[0]), '', tx('Search'), `data-q="${esc(x[0])}"`)).join('');
      out += `<div class="ophone-try"><b>${tx('Try')}</b>${['A16 S2', 'Kitchen', '038'].map(t => `<button type="button" data-q="${t}">${t}</button>`).join('')}</div>`;
    } else if (/^\d{6,}$/.test(Q)) {
      out += `<div class="onote">${ic('barcode')}<span><b>${tx('Product codes aren’t searchable yet')}</b>${tx('Search a shelf like A16 S2, a department like Kitchen or a micro-department like 038.')}</span></div>`;
    } else {
      const counts = {}; if (hasMap()) for (const sh of shelfIndex()) counts[sh.dept] = (counts[sh.dept] || 0) + sh.segments;
      const depts = Object.entries(DEPT_NAME).filter(([d, n]) => d === ql || (ql.length >= 2 && n.toLowerCase().includes(ql)));
      const assign = data()?.labels?.assign || {}, subName = Object.fromEntries(SUBS.map(x => [x[0], x]));
      const micros = SUBS.flatMap(([sd]) => (MICRO[sd] || []).map(e => ({ id: microId(sd, e), sd, code: microCode(e), name: microName(e) })))
        .filter(m => (/^\d+$/.test(Q) && m.code.startsWith(Q.padStart(Math.min(3, Q.length), '0'))) || (ql.length >= 2 && m.name.toLowerCase().includes(ql))).slice(0, 8);
      const sh = k === 'shelf' || k === 'loc' ? shelfRows(Q.toUpperCase()) : null;
      const deptRows = depts.map(([d, n]) => orow('s', 'map', `${dep(d)} ${hi(n, Q)}`, txn(counts[d] || 0, '{n} shelf', '{n} shelves'), tx('Show'), `data-view="map" data-dept="${d}"`));
      const microRows = micros.map(m => { const n = (assign[m.id] || []).length; return orow('s', 'tag', `<span class="mono">${hi(m.code, Q)}</span> ${hi(m.name, Q)} ${dep(m.sd)}`, `${esc(subName[m.sd]?.[2] || '')} · ${n ? txn(n, '{n} shelf', '{n} shelves') : tx('no shelves assigned yet')}`, tx('Show'), `data-view="map" data-micro="${esc(m.id)}"`); });
      const shelfBlock = sh && sh.rows.length ? (sh.bay ? `<div class="ohint">${tx('Bay {bay} is on {shelf}.', { bay: esc(Q.toUpperCase()), shelf: esc(sh.hits[0].id) })}</div>` : '') + grp(tx('Shelves'), sh.rows.length) + sh.rows.join('') : '';
      const deptBlock = deptRows.length ? grp(tx('Departments'), deptRows.length) + deptRows.join('') : '';
      const microBlock = microRows.length ? grp(tx('Micro-departments'), microRows.length) + microRows.join('') : '';
      // A department code (H1) or micro number (038) before shelves that merely start with it.
      out += k === 'shelf' ? shelfBlock + deptBlock + microBlock : deptBlock + microBlock + shelfBlock;
      if (!out) out = `<div class="ohint">${tx('Nothing matches “{q}”. Try a shelf like A16 S2, a department like Kitchen or a micro-department like 038.', { q: esc(Q) })}</div>`;
    }
    body.innerHTML = out; sel = 0; markSel(); prev.hidden = true; prev.innerHTML = ''; pal.classList.remove('wide');
  }

  async function render(q) {
    if (phone()) { ++seq; return renderPhone(q); }
    const my = ++seq, k = classify(q), Q = q.trim(), U = Q.toUpperCase();
    $('#okind', el).className = 'okind ' + k; $('#okind', el).textContent = KIND[k]; el.setAttribute('data-kind', k);
    const use = el.querySelector('.in > svg.i use'); if (use) use.setAttribute('href', `icons.svg#i-${KICON[k]}`);
    $('#oenter', el).textContent = KENTER[k];
    let out = '', preview = '';
    if (k === 'none') {
      const r = recent();
      if (r.length) out += grp(tx('Recent')) + r.map(x => orow(x[1] === 'prod' ? 'p' : x[1] === 'name' ? '' : 's', 'history', esc(x[0]), KIND[x[1]] || '', tx('Search again'), `data-q="${esc(x[0])}"`)).join('');
      out += grp(tx('Jump to')) + tools().slice(0, 6).map(t => orow('', t.icon, esc(t.title), tx('Open the view'), tx('Open'), `data-view="${t.id}"`)).join('');
      out += `<div class="ohint"><b>${tx('It understands')}</b><span>${tx('keycode 42977636')}</span><span>${tx('shelf A16 S2')}</span><span>${tx('bay A12')}</span><span>${tx('a manifest number')}</span><span>${tx('a consolidation label')}</span><span>${tx('a cage tag')}</span><span>${tx('an inventory load')}</span><span>${tx('a department like Toys')}</span><span>${tx('a tool like Refresh')}</span></div>`;
    } else if (k === 'prod') {
      out += grp(tx('Products')) + `<div class="ohint">${tx('Looking up {code}…', { code: esc(Q) })}</div>`;
      body.innerHTML = out; prev.hidden = true; pal.classList.remove('wide');
      const item = await client.catalogue.lookup(Q);
      if (my !== seq) return;
      const L = life(Q);
      out = grp(tx('Products'), item ? 1 : 0);
      if (item) {
        out += orow('p', 'barcode', `${hi(Q, Q)} · ${esc(item.name || tx('Product'))}`, [item.price != null ? money(item.price) : '', item.was != null && item.was !== item.price ? tx('was {price}', { price: money(item.was) }) : '', item.clr ? tx('clearance') : ''].filter(Boolean).join(' · ') || tx('On kmart.com.au'), tx('Open'), `data-url="${esc(item.url)}"`);
        preview = `<div class="pcardx">${item.img ? `<img src="${esc(item.img)}" alt="" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px;background:#fff;margin-bottom:8px">` : ''}<div class="kc">${esc(Q)}</div><div class="nm">${esc(item.name || '')}</div><div class="fx">${item.price != null ? `<span class="soh g">${money(item.price)}</span>` : ''}${item.was != null && item.was !== item.price ? `<span>${tx('was {price}', { price: money(item.was) })}</span>` : ''}${item.clr ? `<span class="status warn">${tx('Clearance')}</span>` : ''}</div></div><div class="pfacts"><span>${ic('clock')}${item.at ? tx('Price checked {date}', { date: new Date(item.at).toLocaleDateString(lang() === 'en' ? undefined : locale()) }) : tx('Price checked never')}</span><span>${ic('m-product')}${tx('From the public product page')}</span></div><a class="btn accent sm" href="${esc(item.url)}" target="_blank" rel="noopener">${ic('arrow')}${tx('Open on kmart.com.au')}</a>`;
      } else {
        // A code nobody knows is often one digit off: offer the catalogue's near-misses.
        const near = await client.catalogue.nearMiss?.(Q) || [];
        if (my !== seq) return;
        if (near.length) out += grp(tx('Did you mean'), near.length) + near.slice(0, 5).map(n => orow('p', 'barcode', `${esc(n.keycode)} · ${esc(n.name)}`, tx('digit {n} differs', { n: n.position + 1 }), tx('Search'), `data-q="${esc(n.keycode)}"`)).join('');
      }
      if (!item) out += `<div class="ohint">${L?.name ? tx('No product found for {code} (the stockroom knew it as “{name}”). Check the keycode, or search kmart.com.au.', { code: esc(Q), name: esc(L.name) }) : tx('No product found for {code}. Check the keycode, or search kmart.com.au.', { code: esc(Q) })}</div>` + orow('p', 'search', tx('Search kmart.com.au for {code}', { code: esc(Q) }), tx('Opens the site search in a new tab'), tx('Open'), `data-url="https://www.kmart.com.au/search/?searchTerm=${encodeURIComponent(Q)}"`);
      if (L && (L.visits.length || L.adjustments.length || L.cages.length)) {
        out += grp(tx('In the stockroom')) + orow('s', 'm-srhistory', [txn(L.bays.length, 'Backfilled at {n} bay', 'Backfilled at {n} bays'), L.adjustments.length ? txn(L.adjustments.length, '{n} SOH adjustment', '{n} SOH adjustments') : '', L.cages.length ? txn(L.cages.length, 'in {n} cage', 'in {n} cages') : ''].filter(Boolean).join(' · '), tx('Last seen {date}', { date: esc(L.last || '') }), tx('History'), `data-view="srhistory" data-q="${esc(Q)}"`);
        preview = (preview || `<div class="pcardx"><div class="kc">${esc(Q)}</div><div class="nm">${esc(L.name || tx('Not in the catalogue'))}</div></div>`) + lifeHtml(L);
      } else if (L) preview = (preview || '') + `<div class="plife"><div class="pt3">${ic('m-srhistory')}${tx('Where it’s been')}</div><div class="ohint">${tx('No backfill, adjustment or cage record for this code yet.')}</div></div>`;
      // A consolidation label first when it is one; cages, loads and off-site pallets holding a keycode after the product.
      const rr = recordsHtml(found(Q), Q); out = Q.length >= 9 ? rr + out : out + rr;
    } else if (k === 'cons') {
      const r = found(Q);
      out += recordsHtml(r, Q) || `<div class="ohint">${tx('No consolidation ending {code} on a manifest or truck this device holds. The Back dock code opens its records.', { code: esc(Q.slice(-9)) })}</div>`;
    } else if (k === 'shelf' || k === 'loc') {
      const { hits, rows, bay, modOf, sel, id, suffix } = shelfRows(U);
      if (bay && hits.length) out += `<div class="ohint">${tx('Bay {bay} is on {shelf}.', { bay: esc(U), shelf: esc(hits[0].id) + (modOf(hits[0]) ? ' ' + esc(modOf(hits[0])) : '') })}</div>`;
      out += grp(tx('Shelves'), hits.length) + (rows.join('') || `<div class="ohint">${hasMap() ? (suffix ? tx('No shelf called {code} on this map.', { code: esc(id) }) : tx('No shelf starts with {code} on this map.', { code: esc(id) })) : tx('No map is published for this store yet.')}</div>`);
      out += recordsHtml(found(Q), Q);
      if (hits.length) preview = `<div class="pt2">${ic('pin')}<b>${modOf(hits[0]) || hits[0].segments === 1 ? tx('Shelf {code}', { code: esc(hits[0].id) + (modOf(hits[0]) ? ' ' + esc(modOf(hits[0])) : '') }) : tx('Run {code}', { code: esc(hits[0].id) })}</b> · ${esc(DEPT_NAME[hits[0].dept] || hits[0].dept || '')}</div><div class="pmap" id="opmap"></div><a class="btn accent sm" data-view="map" data-select="${sel(hits[0])}">${ic('map')}${tx('Show on the store map')}</a>`;
    } else {
      const ql = Q.toLowerCase();
      const depts = Object.entries(DEPT_NAME).filter(([, n]) => n.toLowerCase().includes(ql));
      const ts = tools().filter(t => t.title.toLowerCase().includes(ql));
      if (depts.length) out += grp(tx('Departments'), depts.length) + depts.map(([d, n]) => orow('s', 'map', `${hi(n, Q)} ${dep(d)}`, tx('Show the department on the map'), tx('Show'), `data-view="map" data-dept="${d}"`)).join('');
      if (ts.length) out += grp(tx('Tools'), ts.length) + ts.map(t => orow('', t.icon, hi(t.title, Q), tx('Open the view'), tx('Open'), `data-view="${t.id}"`)).join('');
      const recs = recordsHtml(found(Q), Q); out += recs;
      if (!depts.length && !ts.length && !recs) out += `<div class="ohint">${tx('Nothing matches “{q}”. Try a keycode, a shelf like A16 S2, a manifest, a cage tag, a department or a tool.', { q: esc(Q) })}</div>`;
    }
    if (my !== seq) return;
    body.innerHTML = out; sel = 0; markSel();
    if (preview) { prev.hidden = false; pal.classList.add('wide'); prev.innerHTML = preview; const pm = $('#opmap', prev); if (pm) { try { const m = mountMap(pm, { mono: true, clone: 'preview' }); const first = prev.querySelector('[data-select]')?.getAttribute('data-select'); if (first) { m.select(first); m.zoomTo(first, 900); } } catch {} } }
    else { prev.hidden = true; prev.innerHTML = ''; pal.classList.remove('wide'); }
  }
  // A keycode's life in the store: bays it was backfilled at, SOH
  // adjustments, cages holding it (K2B's code lookup, with more detail).
  function lifeHtml(L) {
    const day = d => d ? new Date(d.length > 10 ? d : d + 'T00:00:00').toLocaleDateString(lang() === 'en' ? [] : locale(), { day: 'numeric', month: 'short' }) : '';
    const st = v => v.status === 'submitted' ? tx('Submitted') : v.status === 'corrected' ? tx('Ready') : tx('Needs review');
    const rows = [
      ...L.visits.slice(0, 8).map(v => `<div class="li"><span class="loc">${esc(v.bay)}</span><span class="nm">${st(v)}${v.expected != null ? ' · ' + txn(v.expected, '{n} code', '{n} codes') : ''}${v.accuracy != null ? ` · ${v.accuracy}%` : ''}${v.incorrect ? ` · <b class="bad">${tx('not on the report')}</b>` : v.scanned ? '' : ` · <b class="warn">${tx('not scanned')}</b>`}</span><span class="rt">${day(v.date)}</span></div>`),
      ...L.adjustments.slice(0, 4).map(a => `<div class="li"><span class="loc">SOH</span><span class="nm">${a.qty} · ${a.confirmed ? tx('confirmed') : tx('unconfirmed')}${a.location ? ` · ${esc(a.location)}` : ''}</span><span class="rt">${day(a.date)}</span></div>`),
      ...L.cages.slice(0, 4).map(c => `<div class="li"><span class="loc">${esc(c.cage)}</span><span class="nm">${[esc(ringName(c.ring)), txn(c.qty, '{n} unit', '{n} units'), c.location ? tx('at {place}', { place: esc(c.location) }) : '', c.status === 'closed' ? tx('closed') : ''].filter(Boolean).join(' · ')}</span><span class="rt">${day(c.seen)}</span></div>`),
    ];
    const more = L.visits.length - 8; 
    return `<div class="plife"><div class="pt3">${ic('m-srhistory')}${tx('Where it’s been')}<span>${txn(L.bays.length, '{n} bay', '{n} bays')}</span></div><div class="list">${rows.join('')}${more > 0 ? `<div class="li ohint">${tx('+ {n} earlier', { n: more })}</div>` : ''}</div></div>`;
  }
  function markSel() { const rows = $$('.orow', body); rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); rows[sel]?.scrollIntoView?.({ block: 'nearest' }); }
  function act(row) {
    if (!row) return;
    const q = input.value.trim(); if (q) remember(q, classify(q));
    if (row.dataset.view) { const arg = {}; for (const k of ARG_KEYS) if (row.dataset[k] != null) arg[k] = row.dataset[k]; close(); go(row.dataset.view, Object.keys(arg).length ? arg : undefined); return; }
    if (row.dataset.q != null) { open(row.dataset.q); return; }        // a recent search: run it again
    if (row.dataset.url) { try { window.open(row.dataset.url, '_blank', 'noopener'); } catch {} close(); return; }
  }

  // The phone's search bar: type straight into the app bar and a compact
  // list drops under it (ShelfSearcher's quick find). A run is listed shelf
  // by shelf, then as the whole run; one tap shows it on the map.
  const BAR_MAX = 6;
  const SUB_RANK = x => (x[0] === 'S' ? 0 : x[0] === 'E' ? 1 : x[0] === 'P' ? 2 : 3);
  const subWord = s => s[0] === 'S' ? tx('Side') : s[0] === 'E' ? tx('End') : s[0] === 'P' ? tx('Permanent end') : '';
  const brow = (d, code, note, attrs) => { const c = DEPT_COLOUR[String(d || '').toLowerCase()] || '#64748B'; return `<div class="sdd-r" role="option" ${attrs}><i style="background:${c}"></i><b>${code}</b><span>${note}</span>${d ? dep(d) : ''}</div>`; };
  function barHtml(q) {
    const Q = q.trim(), ql = Q.toLowerCase(), k = classify(Q);
    if (!Q) {
      const r = recent().filter(x => x[1] !== 'prod' && x[1] !== 'cons');
      return r.length ? `<div class="sdd-h">${tx('Recent')}<button type="button" data-clear>${tx('Clear')}</button></div>` + r.slice(0, BAR_MAX).map(x => `<div class="sdd-r rec" role="option" data-q="${esc(x[0])}">${ic('history')}<b>${esc(x[0])}</b></div>`).join('') : '';
    }
    if (/^\d{6,}$/.test(Q)) return `<div class="sdd-note">${tx('Product codes aren’t searchable yet. Try a shelf, a department or a micro-dept.')}</div>`;
    const rows = [];
    if (k === 'shelf' || k === 'loc') {
      const { hits, bay, id, suffix, modOf } = shelfRows(Q.toUpperCase());
      for (const s of hits) {
        const dn = esc(DEPT_NAME[s.dept] || s.dept || tx('No department'));
        const subs = [...new Set(s.subs)].sort((a, b) => SUB_RANK(a) - SUB_RANK(b) || a.localeCompare(b, undefined, { numeric: true }));
        const own = suffix ? (modOf(s) ? [suffix] : []) : subs;
        for (const sub of own) rows.push(brow(s.dept, `${hi(s.id, id)} ${esc(sub)}`, `${dn}${subWord(sub) ? ' · ' + subWord(sub) : ''}${bay ? ' · ' + tx('bay {bay}', { bay: esc(Q.toUpperCase()) }) : ''}`, `data-view="map" data-select="${esc(s.id + sub)}"`));
        if (s.segments > 1 || !subs.length) rows.push(brow(s.dept, hi(s.id, id), `${dn} · ${s.segments > 1 ? tx('whole run · {n} shelves', { n: s.segments }) : tx('shelf')}`, `data-view="map" data-select="${esc(s.id)}"`));
      }
    }
    const counts = {}; if (hasMap()) for (const sh of shelfIndex()) counts[sh.dept] = (counts[sh.dept] || 0) + sh.segments;
    const depts = Object.entries(DEPT_NAME).filter(([d, n]) => d === ql || (ql.length >= 2 && n.toLowerCase().includes(ql)))
      .map(([d, n]) => brow(d, hi(n, Q), `${tx('Department')} · ${txn(counts[d] || 0, '{n} shelf', '{n} shelves')}`, `data-view="map" data-dept="${d}"`));
    const micros = SUBS.flatMap(([sd]) => (MICRO[sd] || []).map(e => ({ id: microId(sd, e), sd, code: microCode(e), name: microName(e) })))
      .filter(m => (/^\d+$/.test(Q) && m.code.startsWith(Q.padStart(Math.min(3, Q.length), '0'))) || (ql.length >= 2 && m.name.toLowerCase().includes(ql)))
      .map(m => brow(m.sd, hi(m.code, Q), hi(m.name, Q), `data-view="map" data-micro="${esc(m.id)}"`));
    // A department code (H1) or micro number (038) before shelves that merely start with it.
    const all = k === 'shelf' ? [...rows, ...depts, ...micros] : [...depts, ...micros, ...rows];
    return all.length ? all.slice(0, BAR_MAX).join('') : `<div class="sdd-note">${tx('Nothing matches “{q}”. Try a shelf like A16 S2, a department or a micro-dept like 038.', { q: esc(Q) })}</div>`;
  }
  function bar(wrap, ok = () => true) {
    const bi = $('input', wrap); if (!bi) return { show() {}, hide() {} };
    const dd = document.createElement('div'); dd.className = 'sdd'; dd.id = 'sdd'; dd.setAttribute('role', 'listbox'); dd.hidden = true;
    frame.appendChild(dd);
    let at = 0;
    const rowsOf = () => $$('.sdd-r', dd);
    const mark = () => rowsOf().forEach((r, i) => r.classList.toggle('sel', i === at));
    function draw() {
      const html = ok() ? barHtml(bi.value) : ''; dd.innerHTML = html; dd.hidden = !html; at = 0; mark();
      if (!html) return;
      const b = wrap.getBoundingClientRect(), f = frame.getBoundingClientRect();
      dd.style.top = (b.bottom - f.top + 6) + 'px'; dd.style.left = (b.left - f.left) + 'px'; dd.style.right = (f.right - b.right) + 'px';
    }
    const hide = () => { dd.hidden = true; dd.innerHTML = ''; };
    function pick(row) {
      if (!row) return;
      if (row.dataset.q != null) { bi.value = row.dataset.q; try { bi.focus(); } catch {} draw(); return; }   // a recent search: run it again
      const q = bi.value.trim(); if (q) remember(q, classify(q));
      const arg = {}; for (const kk of ARG_KEYS) if (row.dataset[kk] != null) arg[kk] = row.dataset[kk];
      bi.value = ''; bi.blur(); hide(); go(row.dataset.view, arg);
    }
    bi.placeholder = tx('Search');
    bi.addEventListener('focus', draw);
    bi.addEventListener('input', draw);
    let blurT = 0;   // a beat after blur, so a tap on a row still lands (iOS blurs before the click)
    bi.addEventListener('focus', () => clearTimeout(blurT));
    bi.addEventListener('blur', () => { clearTimeout(blurT); blurT = setTimeout(hide, 250); });
    bi.addEventListener('keydown', e => {
      const rows = rowsOf();
      if (e.key === 'Escape') { bi.blur(); return; }
      if (e.key === 'ArrowDown') { at = Math.min(rows.length - 1, at + 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { at = Math.max(0, at - 1); mark(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(rows[at]); }
    });
    // Pressing a row keeps the input focused, so the list is still there for the click.
    dd.addEventListener('pointerdown', e => e.preventDefault());
    dd.addEventListener('mousedown', e => e.preventDefault());
    dd.addEventListener('click', e => {
      if (e.target.closest('[data-clear]')) { try { localStorage.removeItem(RECENT_KEY); } catch {} draw(); return; }
      pick(e.target.closest('.sdd-r'));
    });
    return { show(q) { bi.value = q || ''; try { bi.focus(); } catch {} draw(); }, hide };
  }

  input.addEventListener('input', () => render(input.value));
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-ocancel]')) return close(); const t = e.target.closest('.ophone-try [data-q]'); if (t) { open(t.dataset.q); return; } const r = e.target.closest('.orow, .prev [data-view]'); if (r) { e.preventDefault(); act(r); } });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); return; }
    const rows = $$('.orow', body);
    if (e.key === 'ArrowDown') { sel = Math.min(rows.length - 1, sel + 1); markSel(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); markSel(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); act(rows[sel]); }
  });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (isOpen()) close(); else open(); } });
  return { open, close, isOpen, invalidate, bar };
}
