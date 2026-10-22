// The dock phone's search (Decant Visualiser's "Search — Truck N" sheet):
// Scan a consol label and see where it stands, land it on a free bay or
// stack it on a pallet already down; browse the consols; find an item by
// keycode, description or department. A label not on this truck's manifest
// is looked up on the other manifests the dock holds. The manifest info
// sheet (donuts of what has landed and been decanted) and a pallet's
// contents (department subtotals and its items by consol) sit alongside.

import { ic, esc, toast, camButton, dep } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { truckNo, grid, pallets, microDept, microChip, fmtHM, PALLET_STATE } from './common.js';
import { consolsOf } from '../../../shared/reducers/backdock.js';
import { nameOf, kcCopy, itemName, ensureNames } from '../stockroom/common.js';
import { itemCartons } from './manifests.js';

export const ss = { open: false, tab: 'scan', q: '', hit: null, info: false };
const chip = microChip;
const id9 = raw => String(raw || '').replace(/\D/g, '').slice(-9);
const findConsol = (cons, raw) => { const k = id9(raw); return k.length < 6 ? null : cons.find(c => c.id === k || String(c.cons || '').endsWith(k)) || null; };
const units = c => (c.items || []).reduce((n, i) => n + (Number(i.q) || 0), 0);

function where(t) {
  const out = {};
  for (const p of pallets(t)) for (const id of p.consolIds || []) out[id] = p;
  return out;
}
const stateOf = (c, at) => { const p = at[c.id]; return p ? (p.carriedFrom ? 'carried' : p.status === 'done' ? 'done' : p.status === 'active' ? 'active' : 'landed') : c.carried ? 'carried' : null; };
const sq = s => `<i class="mfx-sq ${s || 'none'}"></i>`;
const nextFree = t => grid(t).refs.find(r => !t.pallets?.[r]);

// A consol, as a card with its next move.
function consolCard(t, c, at) {
  const p = at[c.id], open = pallets(t).filter(x => x.status !== 'done' && !x.carriedFrom), free = nextFree(t);
  const depts = {}; for (const it of c.items || []) depts[it.dept || '???'] = (depts[it.dept || '???'] || 0) + itemCartons(c, it);
  return `<div class="ps-card"><div class="ps-ch"><b class="mono">${esc(c.id)}</b>${sq(stateOf(c, at))}<span>${tx('{n} ctn · {u} units', { n: c.cartons, u: units(c) })}</span></div>` +
    `<div class="ps-depts">${Object.entries(depts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, n]) => `${chip(d)}<small>${Math.round(n)}</small>`).join(' ')}</div>` +
    (p ? `<p class="lbl">${tx('On <b>{ref}</b>', { ref: esc(p.ref) })} · ${esc(PALLET_STATE[p.status] || p.status)}${p.landedAt ? ' · ' + tx('landed {time}', { time: fmtHM(p.landedAt) }) : ''}</p>`
      : `<div class="ps-acts">${free ? `<button class="btn primary" data-act="ps-land" data-id="${esc(c.id)}" data-ref="${esc(free)}">${ic('plus')}${tx('Land at {ref}', { ref: esc(free) })}</button>` : `<span class="cs-dim">${tx('No free bay on the grid')}</span>`}${open.length ? `<select class="bdr-in" data-field="ps-onto">${open.map(x => `<option value="${esc(x.ref)}">${esc(x.ref)} · ${tx('{n} ctn', { n: x.cartons ?? '–' })}</option>`).join('')}</select><button class="btn" data-act="ps-stack" data-id="${esc(c.id)}">${tx('Stack on it')}</button>` : ''}</div>`) + '</div>';
}

// A label not on this truck: the other manifests the dock holds, then the ledger.
function elsewhere(dock, t, raw) {
  for (const [id, x] of Object.entries(dock.trucks || {})) if (id !== t.id && x.manifest) { const c = findConsol(x.manifest.consols, raw); if (c) return tx("On Truck {n}'s manifest {no} ({date}), {c} ctn. Landing it here records a late arrival.", { n: esc(truckNo(id)), no: esc(x.manifest.manNo), date: esc(id.slice(0, 10)), c: c.cartons }); }
  const seen = (dock.ledger?.[id9(raw)] || []).filter(x => x.t !== t.id).sort((a, b) => b.d.localeCompare(a.d))[0];
  if (seen) return seen.k === 'man' ? tx('Manifested on Truck {n} ({date}). A late arrival.', { n: esc(truckNo(seen.t)), date: esc(seen.d) }) : tx('Scanned on Truck {n} ({date}). A duplicate or a reused tub?', { n: esc(truckNo(seen.t)), date: esc(seen.d) });
  return tx('Not on any manifest the dock holds. An old label from a reused tub, or a report not published yet.');
}

export function searchSheet(ctx, t) {
  if (!ss.open) return '';
  const dock = ctx.store.get('dock'), cons = consolsOf(t), at = where(t), q = ss.q.trim().toLowerCase();
  const tabs = `<div class="bdk-vt">${[['scan', tx('Scan')], ['consols', tx('Consols')], ['products', tx('Products')]].map(([k, l]) => `<button class="${ss.tab === k ? 'on' : ''}" data-act="ps-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (!t.manifest && ss.tab !== 'scan') body = `<div class="mv-note">${ic('packages')}${tx('No manifest on Truck {n} yet.', { n: esc(truckNo(t.id)) })}</div>`;
  else if (ss.tab === 'scan') {
    const c = ss.hit ? findConsol(cons, ss.hit) : null;
    body = `<div class="bdk-scanrow"><input class="bdr-in mono" data-field="ps-code" inputmode="numeric" enterkeyhint="search" placeholder="${tx('Scan a consol label')}" autocomplete="off" value="${esc(ss.hit || '')}">${camButton('ps-code')}<button class="btn sm" data-act="ps-find">${ic('search')}${tx('Find')}</button></div>` +
      (!ss.hit ? `<p class="lbl">${tx('The last 9 digits of the pallet label name the consol.')}</p>` : c ? consolCard(t, c, at) : `<div class="ps-card miss"><b class="mono">${esc(id9(ss.hit))}</b><p class="lbl">${t.manifest ? tx('Not on manifest {no}.', { no: esc(t.manifest.manNo) }) + ' ' : ''}${elsewhere(dock, t, ss.hit)}</p></div>`);
  } else if (ss.tab === 'consols') {
    const list = cons.filter(c => !q || c.id.includes(q) || String(c.dept || '').includes(q));
    body = `<div class="search">${ic('search')}<input data-field="ps-q" value="${esc(ss.q)}" placeholder="${tx('Consol or dept')}" inputmode="numeric"></div><div class="list ps-list">${list.slice(0, 120).map(c => `<div class="li" data-act="ps-open" data-id="${esc(c.id)}">${sq(stateOf(c, at))}<span class="loc mono">${esc(c.id)}</span><span class="nm">${(c.mix || []).slice(0, 3).map(x => chip(x[0])).join('')}</span><span class="rt">${tx('{n} ctn', { n: c.cartons })}</span></div>`).join('') || `<p class="lbl">${tx('Nothing matches.')}</p>`}</div>`;
  } else {
    // Find an item: every line indexed as "description keycode dept".
    const rows = []; if (q.length >= 2) for (const c of cons) for (const it of c.items || []) { const name = nameOf(it.k) || it.d || ''; if (`${name} ${it.k} ${it.dept || ''} ${microDept(it.dept)}`.toLowerCase().includes(q)) { rows.push({ c, it, name }); if (rows.length >= 200) break; } }
    body = `<div class="search">${ic('search')}<input data-field="ps-q" value="${esc(ss.q)}" placeholder="${tx('Find an item: keycode, description or dept')}"></div>` +
      (q.length < 2 ? `<p class="lbl">${tx('Type two or more characters.')}</p>` : `<div class="list ps-list">${rows.map(({ c, it, name }) => `<div class="li" data-act="ps-open" data-id="${esc(c.id)}">${sq(stateOf(c, at))}<span class="loc mono">${esc(it.k)}</span><span class="nm">${esc(name)} <small class="cs-dim">· ${esc(c.id)}${at[c.id] ? ' ' + tx('on {ref}', { ref: esc(at[c.id].ref) }) : ''}</small></span><span class="rt">${tx('{n}u', { n: it.q })}</span></div>`).join('') || `<p class="lbl">${tx('Nothing matches.')}</p>`}${rows.length >= 200 ? `<p class="lbl">${tx('First 200 shown: narrow the search.')}</p>` : ''}</div>`);
  }
  return `<div class="ps-sheet"><div class="bdk-pal-h"><b>${tx('Search — Truck {n}', { n: esc(truckNo(t.id)) })}</b><button class="ibtn" data-act="ps-close" title="${tx('Close')}">${ic('x')}</button></div>${tabs}${body}</div>`;
}

// Manifest info: what has landed and been decanted, as two donuts.
const donut = (v, total, colour, label) => { const f = total ? Math.min(1, v / total) : 0, r = 34, C = 2 * Math.PI * r; return `<div class="ps-donut"><svg viewBox="0 0 84 84" width="96" height="96"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="10"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${colour}" stroke-width="10" stroke-dasharray="${(f * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">${Math.round(f * 100)}%</text></svg><b>${v}/${total}</b><small>${label}</small></div>`; };
export function infoSheet(t) {
  if (!ss.info) return '';
  const cons = consolsOf(t), at = where(t), m = t.manifest;
  if (!m) return `<div class="ps-sheet"><div class="bdk-pal-h"><b>${tx('Manifest')}</b><button class="ibtn" data-act="ps-info" title="${tx('Close')}">${ic('x')}</button></div><div class="mv-note">${ic('packages')}${tx('No manifest on this truck yet.')}</div></div>`;
  const total = cons.reduce((n, c) => n + c.cartons, 0), landed = cons.filter(c => at[c.id]), done = landed.filter(c => at[c.id].status === 'done');
  const sum = xs => xs.reduce((n, c) => n + c.cartons, 0);
  return `<div class="ps-sheet"><div class="bdk-pal-h"><b>${tx('Manifest {no}', { no: esc(m.manNo) })}</b><button class="ibtn" data-act="ps-info" title="${tx('Close')}">${ic('x')}</button></div><p class="lbl">${m.dcNo ? tx('DC {no}', { no: esc(m.dcNo) }) + ' · ' : ''}${m.despatch ? tx('despatch {d}', { d: esc(m.despatch) }) + ' · ' : ''}${tx('{n} consols · {c} cartons', { n: cons.length, c: total })}</p>` +
    `<div class="ps-donuts">${donut(landed.length, cons.length, '#3B82F6', tx('consols landed'))}${donut(sum(landed), total, '#F59E0B', tx('cartons landed'))}${donut(sum(done), total, '#16A34A', tx('cartons decanted'))}</div></div>`;
}

// A pallet's contents from its linked consols: department subtotals, then the items by consol.
export function palletContents(t, p) {
  const cons = consolsOf(t).filter(c => (p.consolIds || []).includes(c.id)); if (!cons.length) return '';
  const depts = {}; for (const c of cons) for (const it of c.items || []) { const d = it.dept || '???'; const r = (depts[d] ||= { ctn: 0, u: 0 }); r.ctn += itemCartons(c, it); r.u += Number(it.q) || 0; }
  return `<details class="ps-contents"><summary>${tx('Contents')} · ${txn(cons.length, '{n} consol', '{n} consols')}</summary><div class="ps-depts">${Object.entries(depts).sort((a, b) => b[1].ctn - a[1].ctn).map(([d, r]) => `<span>${chip(d)} <small>${tx('{n} ctn', { n: Math.round(r.ctn) })} · ${tx('{n}u', { n: r.u })}</small></span>`).join(' ')}</div>` +
    cons.map(c => `<div class="pt3">${esc(c.id)}<span class="cs-dim">${tx('{n} ctn', { n: c.cartons })}</span></div>${(c.items || []).slice(0, 30).map(it => `<div class="mfc-it" data-kc="${esc(it.k)}" data-d="${esc(it.d || '')}"><span class="kc mono">${kcCopy(it.k)}</span><span class="nm">${itemName(it.k, it.d || '')}</span>${chip(it.dept)}<span class="ct">${tx('{n}u', { n: it.q })}</span></div>`).join('')}${(c.items || []).length > 30 ? `<div class="cs-dim">${tx('{n} more lines', { n: c.items.length - 30 })}</div>` : ''}`).join('') + '</details>';
}

// A pallet's contents, opened: verify its lines against the catalogue and
// repaint them in place (a rerender would close the panel).
export function verifyContents(ctx, root) {
  root.addEventListener('toggle', e => {
    const d = e.target; if (!d.matches?.('details.ps-contents') || !d.open) return;
    const its = [...d.querySelectorAll('.mfc-it[data-kc]')];
    ensureNames(ctx, its.map(x => x.dataset.kc), () => { for (const x of its) if (x.isConnected) { x.querySelector('.kc').innerHTML = kcCopy(x.dataset.kc); x.querySelector('.nm').innerHTML = itemName(x.dataset.kc, x.dataset.d); } });
  }, true);
}

// Handles the sheet's taps; true when it did.
export async function onSearchAct(ctx, t, a, root) {
  const act = a.dataset.act; if (!act?.startsWith('ps-')) return false;
  const cons = consolsOf(t);
  if (act === 'ps-open') { if (a.dataset.id) { ss.tab = 'scan'; ss.hit = a.dataset.id; } else { ss.open = !ss.open; ss.info = false; } }
  else if (act === 'ps-close') ss.open = false;
  else if (act === 'ps-info') { ss.info = !ss.info; ss.open = false; }
  else if (act === 'ps-tab') { ss.tab = a.dataset.tab; ss.q = ''; }
  else if (act === 'ps-find') { const v = root.querySelector('[data-field="ps-code"]')?.value || ''; if (id9(v).length < 6) { toast(tx('A pallet label has at least 9 digits'), 'bad'); return true; } ss.hit = v.replace(/\D/g, ''); }
  else if (act === 'ps-land' || act === 'ps-stack') {
    const c = cons.find(x => x.id === a.dataset.id); if (!c) return true;
    const ref = act === 'ps-land' ? a.dataset.ref : root.querySelector('[data-field="ps-onto"]')?.value; if (!ref) return true;
    try {
      if (act === 'ps-land') await ctx.store.dispatch({ type: 'pallet.land', entity: { truck: t.id, bay: ref }, payload: { ptype: 'chep', cartons: null, note: '' } });   // the scan adds the consol's cartons
      await ctx.store.dispatch({ type: 'pallet.scan', entity: { truck: t.id, bay: ref }, payload: { code: c.cons || c.id } });
      toast(act === 'ps-land' ? tx('{id} landed at {ref}', { id: c.id, ref }) : tx('{id} stacked on {ref}', { id: c.id, ref }));
    } catch (e) { toast(e.message, 'bad'); }
  }
  ctx.rerender();
  return true;
}
let typing = null;
export function onSearchInput(ctx, e, root) {
  if (!e.target.matches('[data-field="ps-q"]')) return false;
  ss.q = e.target.value;
  // Repaint once typing pauses, so fast entry is not cut off by the redraw.
  clearTimeout(typing); typing = setTimeout(() => { const v = ss.q; ctx.rerender(); const i = document.querySelector('[data-field="ps-q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 180);
  return true;
}
