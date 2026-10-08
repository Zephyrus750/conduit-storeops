// The search palette (the showcase's omni): one input that understands a
// keycode, a shelf, a department or a tool name. Keycodes go to the
// catalogue (client.catalogue.lookup); shelves come from the mounted map;
// tools from the view registry. Opens from the header search, the rail
// search, Ctrl K, and the phone's search bar.

import { $, $$, ic, esc, dep, DEPT_NAME, DEPT_COLOUR, toast } from './ui.js';
import { mountMap, hasMap, canonCode, splitCanon } from './map.js';
import { VIEWS, RAIL } from './registry.js';

const KIND = { prod: 'Product code', shelf: 'Shelf', loc: 'Shelf or bay', name: 'Name', none: 'Type to search' };
const KICON = { prod: 'm-product', shelf: 'pin', loc: 'pin', name: 'search', none: 'search' };
const KENTER = { prod: 'open the product', shelf: 'show on the map', loc: 'show on the map', name: 'open the top match', none: 'open' };
export function classify(q) {
  q = (q || '').trim();
  if (!q) return 'none';
  if (/^\d{6,13}$/.test(q)) return 'prod';
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

export function initSearch({ client, frame, go, tools = () => [], life = () => null }) {
  const el = document.createElement('div'); el.className = 'omni'; el.id = 'omni';
  el.innerHTML = `<div class="pal" role="dialog" aria-label="Search"><div class="in">${ic('search')}<input id="oq" placeholder="Search a keycode, a shelf like H14-3, a department or a tool…" autocomplete="off" inputmode="search"><span class="okind" id="okind">Type to search</span><span class="esc">Esc</span></div><div class="cols"><div class="body" id="obody"></div><div class="prev" id="oprev" hidden></div></div><div class="ofoot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> <span id="oenter">open</span></span><span><kbd>Esc</kbd> close</span></div></div>`;
  frame.appendChild(el);
  const input = $('#oq', el), body = $('#obody', el), prev = $('#oprev', el), pal = $('.pal', el);
  let shelves = null, seq = 0, sel = 0;

  // Shelf ids and departments from the mounted map, read once per map.
  function shelfIndex() {
    if (shelves) return shelves;
    shelves = [];
    const stage = document.createElement('div');
    try { const m = mountMap(stage, { mono: true, badges: false, tips: false, clone: true }); const by = new Map(); for (const g of m.segments()) { const info = m.shelfInfo(g); const e = by.get(info.id) || { id: info.id, dept: info.dept, segments: info.segments, subs: [] }; if (info.sub) e.subs.push(info.sub.toUpperCase()); by.set(info.id, e); } shelves.push(...by.values()); } catch {}
    return shelves;
  }
  function invalidate() { shelves = null; }

  // Focus goes back to whatever opened the palette when it closes.
  let opener = null;
  function open(q = '') { if (!el.classList.contains('open')) opener = document.activeElement; el.classList.add('open'); input.value = q; render(q); try { input.focus(); } catch {} }
  function close() { el.classList.remove('open'); prev.hidden = true; prev.innerHTML = ''; pal.classList.remove('wide'); if (opener?.isConnected && opener !== document.body) { try { opener.focus(); } catch {} } opener = null; }
  const isOpen = () => el.classList.contains('open');

  async function render(q) {
    const my = ++seq, k = classify(q), Q = q.trim(), U = Q.toUpperCase();
    $('#okind', el).className = 'okind ' + k; $('#okind', el).textContent = KIND[k]; el.setAttribute('data-kind', k);
    const use = el.querySelector('.in > svg.i use'); if (use) use.setAttribute('href', `icons.svg#i-${KICON[k]}`);
    $('#oenter', el).textContent = KENTER[k];
    let out = '', preview = '';
    if (k === 'none') {
      const r = recent();
      if (r.length) out += grp('Recent') + r.map(x => orow(x[1] === 'prod' ? 'p' : x[1] === 'name' ? '' : 's', 'history', esc(x[0]), KIND[x[1]] || '', 'Search again', `data-q="${esc(x[0])}"`)).join('');
      out += grp('Jump to') + tools().slice(0, 6).map(t => orow('', t.icon, esc(t.title), 'Open the view', 'Open', `data-view="${t.id}"`)).join('');
      out += `<div class="ohint"><b>It understands</b><span>keycode 42977636</span><span>shelf H14-3</span><span>bay A12</span><span>a department like Toys</span><span>a tool like Refresh</span></div>`;
    } else if (k === 'prod') {
      out += grp('Products') + `<div class="ohint">Looking up ${esc(Q)}…</div>`;
      body.innerHTML = out; prev.hidden = true; pal.classList.remove('wide');
      const item = await client.catalogue.lookup(Q);
      if (my !== seq) return;
      const L = life(Q);
      out = grp('Products', item ? 1 : 0);
      if (item) {
        out += orow('p', 'barcode', `${hi(Q, Q)} · ${esc(item.name || 'Product')}`, [item.price != null ? money(item.price) : '', item.was != null && item.was !== item.price ? `was ${money(item.was)}` : '', item.clr ? 'clearance' : ''].filter(Boolean).join(' · ') || 'On kmart.com.au', 'Open', `data-url="${esc(item.url)}"`);
        preview = `<div class="pcardx">${item.img ? `<img src="${esc(item.img)}" alt="" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px;background:#fff;margin-bottom:8px">` : ''}<div class="kc">${esc(Q)}</div><div class="nm">${esc(item.name || '')}</div><div class="fx">${item.price != null ? `<span class="soh g">${money(item.price)}</span>` : ''}${item.was != null && item.was !== item.price ? `<span>was ${money(item.was)}</span>` : ''}${item.clr ? '<span class="status warn">Clearance</span>' : ''}</div></div><div class="pfacts"><span>${ic('clock')}Price checked ${item.at ? new Date(item.at).toLocaleDateString() : 'never'}</span><span>${ic('m-product')}From the public product page</span></div><a class="btn accent sm" href="${esc(item.url)}" target="_blank" rel="noopener">${ic('arrow')}Open on kmart.com.au</a>`;
      } else {
        // A code nobody knows is often one digit off: offer the catalogue's near-misses.
        const near = await client.catalogue.nearMiss?.(Q) || [];
        if (my !== seq) return;
        if (near.length) out += grp('Did you mean', near.length) + near.slice(0, 5).map(n => orow('p', 'barcode', `${esc(n.keycode)} · ${esc(n.name)}`, `digit ${n.position + 1} differs`, 'Search', `data-q="${esc(n.keycode)}"`)).join('');
      }
      if (!item) out += `<div class="ohint">No product found for ${esc(Q)}${L?.name ? ` (the stockroom knew it as “${esc(L.name)}”)` : ''}. Check the keycode, or search kmart.com.au.</div>` + orow('p', 'search', `Search kmart.com.au for ${esc(Q)}`, 'Opens the site search in a new tab', 'Open', `data-url="https://www.kmart.com.au/search/?searchTerm=${encodeURIComponent(Q)}"`);
      if (L && (L.visits.length || L.adjustments.length || L.cages.length)) {
        out += grp('In the stockroom') + orow('s', 'm-srhistory', `Backfilled at ${L.bays.length} bay${L.bays.length === 1 ? '' : 's'}${L.adjustments.length ? ` · ${L.adjustments.length} SOH adjustment${L.adjustments.length === 1 ? '' : 's'}` : ''}${L.cages.length ? ` · in ${L.cages.length} cage${L.cages.length === 1 ? '' : 's'}` : ''}`, `Last seen ${esc(L.last || '')}`, 'History', `data-view="srhistory" data-q="${esc(Q)}"`);
        preview = (preview || `<div class="pcardx"><div class="kc">${esc(Q)}</div><div class="nm">${esc(L.name || 'Not in the catalogue')}</div></div>`) + lifeHtml(L);
      } else if (L) preview = (preview || '') + `<div class="plife"><div class="pt3">${ic('m-srhistory')}Where it’s been</div><div class="ohint">No backfill, adjustment or cage record for this code yet.</div></div>`;
    } else if (k === 'shelf' || k === 'loc') {
      // "A16S1", "A16 S1" and "A16-S1" name one module of A16: the row and
      // the map keep that module rather than widening to the whole shelf.
      const C = canonCode(U), { shelf: id, sub: suffix } = splitCanon(C);
      const hits = hasMap() ? shelfIndex().filter(s => s.id === C || s.id === id || (!suffix && s.id.startsWith(id))).slice(0, 8) : [];
      const modOf = s => suffix && s.subs.includes(suffix) ? suffix : '';
      const sel = s => esc(s.id + modOf(s));
      out += grp('Shelves', hits.length) + (hits.map(s => orow('s', 'pin', `Shelf ${hi(s.id, id)}${modOf(s) ? ` <small>module ${esc(modOf(s))}</small>` : suffix ? ` <small class="warn">no module ${esc(suffix)}</small>` : ''} ${dep(s.dept)}`, `${DEPT_NAME[s.dept] || s.dept || 'no department'} · ${s.segments} module${s.segments === 1 ? '' : 's'}${s.subs.length ? ' · ' + esc(s.subs.join(' ')) : ''}`, 'Show on map', `data-view="map" data-select="${sel(s)}"`)).join('') || `<div class="ohint">${hasMap() ? `No shelf ${suffix ? 'called' : 'starts with'} ${esc(id)} on this map.` : 'No map is published for this store yet.'}</div>`);
      if (hits.length) preview = `<div class="pt2">${ic('pin')}<b>Shelf ${esc(hits[0].id)}${modOf(hits[0]) ? ' · ' + esc(modOf(hits[0])) : ''}</b> · ${esc(DEPT_NAME[hits[0].dept] || hits[0].dept || '')}</div><div class="pmap" id="opmap"></div><a class="btn accent sm" data-view="map" data-select="${sel(hits[0])}">${ic('map')}Show on the store map</a>`;
    } else {
      const ql = Q.toLowerCase();
      const depts = Object.entries(DEPT_NAME).filter(([, n]) => n.toLowerCase().includes(ql));
      const ts = tools().filter(t => t.title.toLowerCase().includes(ql));
      if (depts.length) out += grp('Departments', depts.length) + depts.map(([d, n]) => orow('s', 'map', `${hi(n, Q)} ${dep(d)}`, 'Show the department on the map', 'Show', `data-view="map" data-dept="${d}"`)).join('');
      if (ts.length) out += grp('Tools', ts.length) + ts.map(t => orow('', t.icon, hi(t.title, Q), 'Open the view', 'Open', `data-view="${t.id}"`)).join('');
      if (!depts.length && !ts.length) out += `<div class="ohint">Nothing matches “${esc(Q)}”. Try a keycode, a shelf like H14-3, a department or a tool.</div>`;
    }
    if (my !== seq) return;
    body.innerHTML = out; sel = 0; markSel();
    if (preview) { prev.hidden = false; pal.classList.add('wide'); prev.innerHTML = preview; const pm = $('#opmap', prev); if (pm) { try { const m = mountMap(pm, { mono: true, clone: 'preview' }); const first = prev.querySelector('[data-select]')?.getAttribute('data-select'); if (first) { m.select(first); m.zoomTo(first, 900); } } catch {} } }
    else { prev.hidden = true; prev.innerHTML = ''; pal.classList.remove('wide'); }
  }
  // A keycode's life in the store: bays it was backfilled at, SOH
  // adjustments, cages holding it (K2B's code lookup, with more detail).
  function lifeHtml(L) {
    const day = d => d ? new Date(d.length > 10 ? d : d + 'T00:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
    const st = v => v.status === 'submitted' ? 'Submitted' : v.status === 'corrected' ? 'Ready' : 'Needs review';
    const rows = [
      ...L.visits.slice(0, 8).map(v => `<div class="li"><span class="loc">${esc(v.bay)}</span><span class="nm">${st(v)}${v.expected != null ? ` · ${v.expected} codes` : ''}${v.accuracy != null ? ` · ${v.accuracy}%` : ''}${v.incorrect ? ' · <b class="bad">not on the report</b>' : v.scanned ? '' : ' · <b class="warn">not scanned</b>'}</span><span class="rt">${day(v.date)}</span></div>`),
      ...L.adjustments.slice(0, 4).map(a => `<div class="li"><span class="loc">SOH</span><span class="nm">${a.qty} · ${a.confirmed ? 'confirmed' : 'unconfirmed'}${a.location ? ` · ${esc(a.location)}` : ''}</span><span class="rt">${day(a.date)}</span></div>`),
      ...L.cages.slice(0, 4).map(c => `<div class="li"><span class="loc">${esc(c.cage)}</span><span class="nm">${esc(c.ring)} · ${c.qty} unit${c.qty === 1 ? '' : 's'}${c.location ? ` · at ${esc(c.location)}` : ''}${c.status === 'closed' ? ' · closed' : ''}</span><span class="rt">${day(c.seen)}</span></div>`),
    ];
    const more = L.visits.length - 8; 
    return `<div class="plife"><div class="pt3">${ic('m-srhistory')}Where it’s been<span>${L.bays.length} bay${L.bays.length === 1 ? '' : 's'}</span></div><div class="list">${rows.join('')}${more > 0 ? `<div class="li ohint">+ ${more} earlier</div>` : ''}</div></div>`;
  }
  function markSel() { const rows = $$('.orow', body); rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); rows[sel]?.scrollIntoView?.({ block: 'nearest' }); }
  function act(row) {
    if (!row) return;
    const q = input.value.trim(); if (q) remember(q, classify(q));
    if (row.dataset.view) { close(); go(row.dataset.view, row.dataset.select ? { select: row.dataset.select } : row.dataset.dept ? { dept: row.dataset.dept } : row.dataset.q != null ? { q: row.dataset.q } : undefined); return; }
    if (row.dataset.q != null) { open(row.dataset.q); return; }        // a recent search: run it again
    if (row.dataset.url) { try { window.open(row.dataset.url, '_blank', 'noopener'); } catch {} close(); return; }
  }

  input.addEventListener('input', () => render(input.value));
  el.addEventListener('click', e => { if (e.target === el) return close(); const r = e.target.closest('.orow, .prev [data-view]'); if (r) { e.preventDefault(); act(r); } });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); return; }
    const rows = $$('.orow', body);
    if (e.key === 'ArrowDown') { sel = Math.min(rows.length - 1, sel + 1); markSel(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); markSel(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); act(rows[sel]); }
  });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (isOpen()) close(); else open(); } });
  return { open, close, isOpen, invalidate };
}
