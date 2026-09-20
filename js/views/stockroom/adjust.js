// Adjustments: the below-zero SOH evidence list, per day, most negative
// first; the office works it top-down. Items arrive flagged from Backfill
// review (confirmed at a bay) or typed here; kept per day in the log.

import { $, ic, esc, vh, sub, fmtTime, toast, mhead, mscan, mbig, mghost, mfoot } from '../../ui.js';
import { parseKeycodes } from '../../../shared/backfill.js';
import { todayKey, ensureNames, nameHtml, nameOf, send } from './common.js';

const st = { filter: 'all', mQty: 1, mKc: '' };
function model(ctx) {
  const date = todayKey(), day = ctx.store.get('adjustments')[date] || {};
  const items = Object.entries(day).map(([kc, it]) => ({ kc, ...it })).sort((a, b) => (a.qty - b.qty) || a.kc.localeCompare(b.kc));
  const days = Object.entries(ctx.store.get('adjustments')).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  return { date, items, confirmed: items.filter(i => i.confirmed), unplaced: items.filter(i => !i.location), days };
}
export default {
  id: 'adjust', title: 'Adjustments', icon: 'm-adjust', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    const list = st.filter === 'confirmed' ? m.confirmed : st.filter === 'unplaced' ? m.unplaced : m.items;
    const max = Math.max(1, ...m.days.map(([, d]) => Object.keys(d).length));
    return vh('Adjustments', sub('Below-zero SOH evidence', esc(m.date), `${m.items.length} item${m.items.length === 1 ? '' : 's'} today`), `<button class="btn" data-act="export">${ic('file')}Copy for the office</button>`, 'm-adjust') +
      `<div class="grid2"><div class="card adj"><div class="ch"><h3>Today’s list</h3><span class="cs-dim">most negative first</span><span class="pills" style="margin-left:auto"><button class="${st.filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">All ${m.items.length}</button><button class="${st.filter === 'confirmed' ? 'on' : ''}" data-act="filter" data-v="confirmed">Confirmed ${m.confirmed.length}</button><button class="${st.filter === 'unplaced' ? 'on' : ''}" data-act="filter" data-v="unplaced">Unplaced ${m.unplaced.length}</button></span></div>` +
      `<div class="adj-hd"><span>SOH</span><span>Keycode</span><span>Where</span><span>Added</span><span>Source</span><span></span></div>` +
      (list.map(it => `<div class="adj-row"><span class="adj-qty${it.qty === 0 ? ' zero' : ''}">${it.qty}</span><span class="adj-main"><b>${esc(it.kc)}</b><small>${it.name ? esc(it.name) : nameHtml(it.kc)}</small></span><span class="adj-where">${it.location ? `<span class="adj-loc${it.confirmed ? ' ok' : ''}">${esc(it.location)}${it.confirmed ? ' ✓' : ''}</span>` : '<span class="cs-dim">no location</span>'}</span><span class="cs-dim">${fmtTime(it.addedAt)}</span><span class="cs-dim">${it.confirmed ? 'Backfill review' : 'Typed'}</span><span class="adj-x" title="Remove from today’s list" data-act="remove" data-kc="${esc(it.kc)}">${ic('x')}</span></div>`).join('') || '<div class="cs-dim" style="padding:14px 2px">Nothing recorded today. Flag a code from Backfill review, or add one on the right.</div>') +
      `<div class="cs-dim" style="padding:10px 2px 0">A ✓ location means the item was confirmed present when that bay was backfilled.</div></div>` +
      `<div class="sidecol"><div class="card"><div class="ch"><h3>Add an item</h3></div><div class="adj-form"><div class="search">${ic('barcode')}<input data-field="kc" placeholder="Keycode" inputmode="numeric" autocomplete="off"></div><div class="adj-form2"><input class="ad-in" data-field="qty" placeholder="SOH from the report" inputmode="numeric"><input class="ad-in mono" data-field="loc" placeholder="Location (optional)"></div><button class="btn primary" style="justify-content:center" data-act="add">${ic('plus')}Add to today</button><div class="cs-dim">Stored as below zero either way. The name fills in from the catalogue.</div></div></div>` +
      `<div class="card"><div class="ch"><h3>Last 14 days</h3></div><div class="bars" style="height:64px">${m.days.map(([d, x], i) => `<div class="${d === m.date ? 'hi' : ''}" style="height:${Object.keys(x).length ? Math.round(Object.keys(x).length / max * 100) : 3}%" title="${d}"></div>`).join('') || '<div style="height:3%"></div>'}</div><div class="cs-dim" style="margin-top:8px">${m.days.reduce((n, [, x]) => n + Object.keys(x).length, 0)} items recorded</div></div></div></div>`;
  },
  mobile(ctx) { return `<div id="adjmob">${mobile(ctx)}</div>`; },
  mount(ctx, root) {
    const repaint = () => { if (ctx.isMobile) { const h = $('#adjmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    ensureNames(ctx, model(ctx).items.map(i => i.kc), repaint);
    root.addEventListener('click', e => onClick(e, ctx, root, repaint));
    root.addEventListener('keydown', e => { if (e.key !== 'Enter') return; if (e.target.matches('[data-field="kc"],[data-field="qty"],[data-field="loc"]')) { e.preventDefault(); root.querySelector('[data-act="add"]')?.click(); } if (e.target.matches('[data-field="mkc"]')) { e.preventDefault(); st.mKc = parseKeycodes(e.target.value)[0] || ''; if (!st.mKc) toast('That is not a keycode', 'bad'); else ensureNames(ctx, [st.mKc], repaint); repaint(); } });
    return [ctx.store.on('adjustments', () => { ensureNames(ctx, model(ctx).items.map(i => i.kc), repaint); repaint(); })];
  },
};
async function onClick(e, ctx, root, repaint) {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, m = model(ctx);
  if (act === 'filter') { st.filter = a.dataset.v; ctx.rerender(); }
  else if (act === 'remove') await send(ctx, 'adjustment.remove', { keycode: a.dataset.kc, date: m.date });
  else if (act === 'add') { const kc = parseKeycodes(root.querySelector('[data-field="kc"]')?.value)[0]; const qty = Number(root.querySelector('[data-field="qty"]')?.value) || 0; const loc = root.querySelector('[data-field="loc"]')?.value.trim() || ''; if (!kc) return toast('Keycode needed', 'bad'); const r = await send(ctx, 'adjustment.set', { keycode: kc, date: m.date }, { qty, location: loc, confirmed: false, name: nameOf(kc) || '' }); if (r) { for (const f of ['kc', 'qty', 'loc']) { const i = root.querySelector(`[data-field="${f}"]`); if (i) i.value = ''; } root.querySelector('[data-field="kc"]')?.focus(); } }
  else if (act === 'export') { const text = ['keycode,name,soh,location,confirmed,added', ...m.items.map(i => [i.kc, JSON.stringify(i.name || nameOf(i.kc) || ''), i.qty, i.location, i.confirmed ? 'yes' : '', i.addedAt].join(','))].join('\n'); try { await navigator.clipboard.writeText(text); toast(`${m.items.length} rows copied as CSV`); } catch { toast('Copy failed', 'bad'); } }
  else if (act === 'm-qty') { st.mQty = Math.max(0, st.mQty + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-flag') { if (!st.mKc) return; const r = await send(ctx, 'adjustment.set', { keycode: st.mKc, date: m.date }, { qty: st.mQty, location: '', confirmed: false, name: nameOf(st.mKc) || '' }); if (r) { toast(`${st.mKc} flagged`); st.mKc = ''; st.mQty = 1; repaint(); } }
  else if (act === 'm-clear') { st.mKc = ''; repaint(); }
}
function mobile(ctx) {
  const m = model(ctx);
  return mhead('Adjust SOH', 'Stock is here but the system says no') +
    mscan('Scan the product', `<input data-field="mkc" inputmode="numeric" autocomplete="off" placeholder="Keycode or item barcode" value="${esc(st.mKc)}" enterkeyhint="done">`, 'Then count what is on the shelf') +
    (st.mKc ? `<div class="mv-last"><small>Scanned</small><b>${esc(st.mKc)}</b><span>${nameHtml(st.mKc)}</span></div><div class="mv-stepper"><button data-act="m-qty" data-d="-1">−</button><div><b>${st.mQty}</b><small>counted</small></div><button data-act="m-qty" data-d="1">+</button></div>` + mfoot(mbig('Flag for adjustment', '', 'sort', ' data-act="m-flag"') + mghost('Not this one', ' data-act="m-clear"')) : '') +
    (m.items.length ? `<div class="mv-sub">Today · ${m.items.length}</div><div class="mv-rows">${m.items.slice(0, 6).map(i => `<div class="mv-row"><span class="a">${i.qty}</span><span class="b">${esc(i.kc)} ${i.name ? esc(i.name) : ''}</span><span class="c">${i.location ? esc(i.location) : ''}</span></div>`).join('')}</div>` : '');
}
