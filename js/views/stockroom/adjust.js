// Adjustments: the below-zero SOH evidence list, per day, most negative
// first; the office works it top-down. Items arrive from the morning's
// report (Stock intelligence: sent once it is read, or when it is saved), flagged
// from Backfill review (confirmed at a bay) or the phone, or typed here;
// kept per day in the log. Each is ticked off (scanned or tapped) once it
// is adjusted in the system; the list filters by department.

import { $, ic, esc, vh, sub, fmtTime, toast, mhead, mscan, mbig, mghost, mfoot } from '../../ui.js';
import { openScreenScan } from '../../screenscan.js';
import { parseKeycodes } from '../../../shared/backfill.js';
import { csvLines } from '../../../shared/records.js';
import { printSheet, code, tick, table, section } from '../../print.js';
import { settingsOf, deptForBay } from '../../../shared/reducers/store.js';
import { todayKey, ensureNames, productHtml, kcCopy, nameOf, priceOf, send, loadProfiles, depthChip, ghostChip, cartonOf, profilesReady, SR_GROUPS, deptGroup, deptLabel, deptBadge } from './common.js';
import { shrinkValue, cartonShrink, cartonUnits } from '../../../shared/stockintel.js';
import { gs1Parse } from '../../../shared/gs1.js';
import { recallFor, recallFlag } from '../../recallflag.js';
import { haptic } from '../../device.js';
import { tx, txn } from '../../i18n.js';

const st = { filter: 'all', group: 'all', dept: 'all', date: null, mSoh: 0, mQty: 1, mKc: '', mPair: null };
const NONE = '\u0000none', OTHER = '\u0000other';
const SOURCE = { report: tx('Morning report'), review: tx('Backfill review'), phone: tx('Phone'), desk: tx('Typed'), screen: tx('Screen scan'), import: 'K2B' };
function model(ctx) {
  const all = ctx.store.get('adjustments'), date = st.date && all[st.date] ? st.date : todayKey(), day = all[date] || {};
  const ranges = settingsOf(ctx.store.get()).deptRanges || [], deptOf = it => !it.location ? NONE : (ranges.length && deptForBay(ranges, it.location)) || OTHER;
  const items = Object.entries(day).map(([kc, it]) => ({ kc, ...it, dept: deptOf(it) })).sort((a, b) => (!!a.done - !!b.done) || (a.qty - b.qty) || a.kc.localeCompare(b.kc));
  const days = Object.entries(all).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const depts = [...new Set(items.map(i => i.dept))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  // Main department (Home, Clothing, Kids, Other), then one of its
  // sub-departments; items with no department (no bay, or a bay outside the
  // ranges) are a group of their own.
  const inGroup = st.group === 'all' ? items : items.filter(i => groupOf(i.dept) === st.group);
  const inDept = st.dept === 'all' ? inGroup : inGroup.filter(i => i.dept === st.dept);
  return { date, today: date === todayKey(), items, inGroup, inDept, depts, ranges, confirmed: inDept.filter(i => i.confirmed), unplaced: inDept.filter(i => !i.location), done: items.filter(i => i.done), days, past: Object.keys(all).sort().reverse(), shrink: shrinkOf(inDept) };
}
// An item's price: the report's when it carried one, else kmart.com.au's
// from the catalogue; null when neither knows.
function priceFor(it) {
  if (Number.isFinite(it.price)) return { v: it.price, from: 'the report' };
  const p = priceOf(it.kc); return Number.isFinite(p) ? { v: p, from: 'kmart.com.au' } : null;
}
const money = v => v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
// Potential shrink to zero: what adjusting the items below zero to zero
// writes off (units below zero × price). To one carton: what adjusting
// everything at zero or below up to one carton writes off ((carton − SOH)
// × price, the carton size from the manifests). Each with what is still to
// adjust; items with no price, or no carton size yet, are counted apart.
function shrinkOf(items) {
  const r = { total: 0, open: 0, unpriced: 0, carton: 0, cartonOpen: 0, noSize: 0, cartonUnpriced: 0, sizes: profilesReady() };
  for (const it of items) {
    if (it.qty > 0) continue;
    const p = priceFor(it), ctn = cartonOf(it.kc)?.ctn;
    if (!p) { if (it.qty < 0) r.unpriced++; r.cartonUnpriced++; continue; }
    const v = shrinkValue(it.qty, p.v); r.total += v; if (!it.done) r.open += v;
    if (!ctn) { r.noSize++; continue; }
    const c = cartonShrink(it.qty, ctn, p.v); r.carton += c; if (!it.done) r.cartonOpen += c;
  }
  for (const k of ['total', 'open', 'carton', 'cartonOpen']) r[k] = Math.round(r[k] * 100) / 100;
  return r;
}
// The list's two shrink figures, over the department shown.
function shrinkLine(m) {
  const sh = m.shrink, lines = [];
  if (sh.total || sh.unpriced) lines.push(`<div class="adj-shrinkline">${ic('dollar')}<span>${tx('<b>{amount}</b> potential shrink if the items below zero are adjusted to zero', { amount: money(sh.total) })}${sh.open !== sh.total ? ` · ${tx('<b>{amount}</b> still to adjust', { amount: money(sh.open) })}` : ''}${sh.unpriced ? ` · ${tx('{n} without a price', { n: sh.unpriced })}` : ''}</span></div>`);
  if (!sh.sizes && m.inDept.length) lines.push(`<div class="adj-shrinkline ctn">${ic('box')}<span>${tx('To one carton: reading the carton sizes from the manifests…')}</span></div>`);
  else if (sh.carton || sh.noSize) lines.push(`<div class="adj-shrinkline ctn">${ic('box')}<span>${tx('<b>{amount}</b> to one carton if everything at zero or below is adjusted up to one carton', { amount: money(sh.carton) })}${sh.cartonOpen !== sh.carton ? ` · ${tx('<b>{amount}</b> still to adjust', { amount: money(sh.cartonOpen) })}` : ''}${sh.noSize ? ` · ${tx('{n} without a carton size', { n: sh.noSize })}` : ''}${sh.cartonUnpriced ? ` · ${tx('{n} without a price', { n: sh.cartonUnpriced })}` : ''}</span></div>`);
  return lines.length ? `<div class="adj-shrinks">${lines.join('')}</div>` : '';
}
// An item's to-one-carton value, or null when its price or carton size is unknown.
const toCarton = it => { const pr = priceFor(it), c = cartonOf(it.kc); return pr && c && it.qty <= 0 ? cartonShrink(it.qty, c.ctn, pr.v) : null; };
// One item's to-one-carton cell, with the units it adds.
function cartonCell(it, pr) {
  if (it.qty > 0) return '<span class="cs-dim">—</span>';
  const c = cartonOf(it.kc);
  if (!c) return `<span class="cs-dim" title="${tx('No carton size yet: it has not been on a manifest')}">${profilesReady() ? tx('no size') : '…'}</span>`;
  const units = cartonUnits(it.qty, c.ctn), how = `${it.qty < 0 ? `${tx('{n} to reach zero', { n: -it.qty })} + ` : ''}${c.basis === 'profile' ? tx('{n} a carton (the carton profile)', { n: c.ctn }) : tx('{n} a carton (the latest delivery)', { n: c.ctn })}`;
  return pr ? `<b class="loss1" title="${esc(how)} × ${money(pr.v)}">${money(cartonShrink(it.qty, c.ctn, pr.v))}</b><small>${txn(units, '+{n} unit', '+{n} units')}</small>` : `<span class="cs-dim" title="${tx('{how}; no price for this item yet', { how: esc(how) })}">?</span><small>${txn(units, '+{n} unit', '+{n} units')}</small>`;
}
const deptName = d => d === NONE ? tx('No location') : d === OTHER ? tx('Bays outside the ranges') : deptLabel(d);
const groupOf = d => d === NONE || d === OTHER ? 'none' : deptGroup(d);
const GROUPS = [...SR_GROUPS, ['none', tx('No department')]];
// The filter: main departments first, then the chosen one's sub-departments,
// each with how many items are still to adjust.
function deptFilter(m) {
  if (!m.items.length) return '';
  if (!m.ranges.length) return `<div class="cs-dim adj-depts">${tx('Set which bays belong to which department ({link}) to group this list by department.', { link: `<button type="button" class="lnk" data-go="srdepts">${tx('Departments')}</button>` })}</div>`;
  const open = list => list.filter(i => !i.done).length;
  const groups = GROUPS.filter(([g]) => m.items.some(i => groupOf(i.dept) === g));
  const subs = st.group === 'all' ? [] : m.depts.filter(d => groupOf(d) === st.group);
  return `<div class="pills adj-depts adj-groups"><button class="${st.group === 'all' ? 'on' : ''}" data-act="group" data-v="all">${tx('All departments')} <b>${open(m.items)}</b></button>${groups.map(([g, gl]) => `<button class="${st.group === g ? 'on' : ''}" data-act="group" data-v="${g}">${gl} <b>${open(m.items.filter(i => groupOf(i.dept) === g))}</b></button>`).join('')}</div>` +
    (subs.length > 1 || (subs.length === 1 && st.group === 'none') ? `<div class="pills adj-depts adj-subs"><button class="${st.dept === 'all' ? 'on' : ''}" data-act="dept" data-v="all">${tx('All of {group}', { group: esc(GROUPS.find(x => x[0] === st.group)?.[1] || '') })}</button>${subs.map(d => `<button class="${st.dept === d ? 'on' : ''}" data-act="dept" data-v="${esc(d)}">${esc(deptName(d))} <b>${open(m.items.filter(i => i.dept === d))}</b></button>`).join('')}</div>` : '');
}
export default {
  id: 'adjust', title: tx('Adjustments'), icon: 'm-adjust', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    const list = st.filter === 'confirmed' ? m.confirmed : st.filter === 'unplaced' ? m.unplaced : st.filter === 'open' ? m.inDept.filter(i => !i.done) : m.inDept;
    const deptPills = deptFilter(m);
    const dayPick = `<select class="ad-in" data-field="day" aria-label="${tx('Day')}">${[...new Set([todayKey(), ...m.past])].sort().reverse().map(d => `<option value="${esc(d)}"${d === m.date ? ' selected' : ''}>${d === todayKey() ? tx('Today') : esc(d)} · ${Object.keys(ctx.store.get('adjustments')[d] || {}).length}</option>`).join('')}</select>`;
    const max = Math.max(1, ...m.days.map(([, d]) => Object.keys(d).length)), recorded = m.days.reduce((n, [, x]) => n + Object.keys(x).length, 0);
    return vh(tx('Adjustments'), sub(tx('Below-zero SOH evidence'), esc(m.date), `${m.today ? txn(m.items.length, '{n} item today', '{n} items today') : txn(m.items.length, '{n} item', '{n} items')} · ${tx('{n} adjusted', { n: m.done.length })}${m.shrink.total ? ` · ${tx('{amount} potential shrink', { amount: money(m.shrink.total) })}` : ''}${m.shrink.carton ? ` · ${tx('{amount} to one carton', { amount: money(m.shrink.carton) })}` : ''}`), `${dayPick}<button class="btn" data-act="screen" title="${tx('Read a below-zero SOH report off the screen')}">${ic('expand')}${tx('Screen scan')}</button><button class="btn" data-act="print">${ic('print')}${tx('Print list')}</button><button class="btn" data-act="export">${ic('file')}${tx('Copy for the office')}</button>`, 'm-adjust') +
      `<div class="grid2"><div class="card adj"><div class="ch"><h3>${m.today ? tx('Today’s list') : tx('List for {date}', { date: esc(m.date) })}</h3><span class="cs-dim">${tx('most negative first')}</span><span class="pills" style="margin-left:auto"><button class="${st.filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">${tx('All')} ${m.inDept.length}</button><button class="${st.filter === 'open' ? 'on' : ''}" data-act="filter" data-v="open">${tx('To adjust')} ${m.inDept.filter(i => !i.done).length}</button><button class="${st.filter === 'confirmed' ? 'on' : ''}" data-act="filter" data-v="confirmed">${tx('Confirmed')} ${m.confirmed.length}</button><button class="${st.filter === 'unplaced' ? 'on' : ''}" data-act="filter" data-v="unplaced">${tx('Unplaced')} ${m.unplaced.length}</button></span></div>` +
      deptPills + shrinkLine(m) + `<div class="adj-hd adj-cols"><span>SOH</span><span>${tx('Keycode')}</span><span>${tx('Description')}</span><span class="adj-hdept"><span class="long">${tx('Department')}</span><span class="short">${tx('Dept')}</span></span><span class="n">${tx('Price')}</span><span class="n" title="${tx('Units below zero × price: written off when adjusted to zero')}">${tx('To zero')}</span><span class="n" title="${tx('(One carton − SOH) × price: written off when adjusted up to one carton. The carton size comes from the manifests.')}">${tx('To one carton')}</span><span>${tx('Where')}</span><span>${tx('Added')}</span><span>${tx('Source')}</span><span></span></div>` +
      (list.map(it => { const pr = priceFor(it), loss = pr ? shrinkValue(it.qty, pr.v) : 0; return `<div class="adj-row adj-cols${it.done ? ' done' : ''}"><span class="adj-qty${it.qty === 0 ? ' zero' : ''}">${it.qty}</span><span class="adj-kc">${kcCopy(it.kc)}</span><span class="adj-desc">${productHtml(it.kc, it.name)}<span class="adj-chips">${ghostChip(it.kc, it.qty)}${depthChip(it.kc)}</span></span><span class="adj-dept">${it.dept === NONE || it.dept === OTHER ? '<span class="cs-dim">—</span>' : deptBadge(it.dept)}</span><span class="adj-price n"${pr ? ` title="${pr.from === 'the report' ? tx('Price from the report') : tx('Price from {site}', { site: pr.from })}"` : ''}>${pr ? money(pr.v) : '<span class="cs-dim">—</span>'}</span><span class="adj-shrink n${loss ? ' loss' : ''}"${pr && loss ? ` title="${tx('{n} below zero × {price}', { n: -it.qty, price: money(pr.v) })}"` : ''}>${loss ? `${money(loss)}<small>${txn(-it.qty, '{n} unit', '{n} units')}</small>` : it.qty < 0 && !pr ? `<span class="cs-dim" title="${tx('No price for this item yet')}">?</span>` : '<span class="cs-dim">—</span>'}</span><span class="adj-ctn n">${cartonCell(it, pr)}</span><span class="adj-where">${it.location ? `<span class="adj-loc${it.confirmed ? ' ok' : ''}">${esc(it.location)}${it.confirmed ? ' ✓' : ''}</span>` : `<span class="cs-dim">${tx('no location')}</span>`}</span><span class="cs-dim">${fmtTime(it.addedAt)}</span><span class="cs-dim">${it.done ? `<button class="adj-done on" data-act="undone" data-kc="${esc(it.kc)}" title="${tx('Adjusted {time}: tap to put it back', { time: esc(fmtTime(it.done.at)) })}">✓ ${tx('Adjusted')}</button>` : `<button class="adj-done" data-act="done" data-kc="${esc(it.kc)}" title="${tx('Adjusted in the system: tick it off')}">${tx('Mark adjusted')}</button>`}<br>${esc(SOURCE[it.source] || (it.confirmed ? tx('Backfill review') : it.counted != null ? tx('Phone') : tx('Typed')))}${it.counted != null ? ` · ${tx('{n} found', { n: it.counted })}` : ''}</span><span class="adj-x" title="${tx('Remove from today’s list')}" data-act="remove" data-kc="${esc(it.kc)}">${ic('x')}</span></div>`; }).join('') || `<div class="cs-dim" style="padding:14px 2px">${tx('Nothing recorded today. Flag a code from Backfill review, or add one on the right.')}</div>`) +
      `<div class="cs-dim" style="padding:10px 2px 0">${tx('A ✓ location means the item was confirmed present when that bay was backfilled.')}</div></div>` +
      `<div class="sidecol"><div class="card"><div class="ch"><h3>${tx('Tick off by scanning')}</h3></div><div class="adj-form"><div class="search">${ic('barcode')}<input data-field="tick" placeholder="${tx('Scan a keycode once it is adjusted')}" inputmode="numeric" autocomplete="off"></div><div class="cs-dim">${m.today ? tx("{done} of {total} adjusted today. A scanner's Enter ticks it off.", { done: m.done.length, total: m.items.length }) : tx("{done} of {total} adjusted. A scanner's Enter ticks it off.", { done: m.done.length, total: m.items.length })}</div></div></div>` +
      `<div class="card"><div class="ch"><h3>${tx('Add an item')}</h3></div><div class="adj-form"><div class="search">${ic('barcode')}<input data-field="kc" placeholder="${tx('Keycode')}" inputmode="numeric" autocomplete="off"></div><div class="adj-form2"><input class="ad-in" data-field="qty" placeholder="${tx('SOH (report)')}" aria-label="${tx('SOH from the report')}" inputmode="numeric"><input class="ad-in mono" data-field="loc" placeholder="${tx('Location (optional)')}"></div><button class="btn primary" style="justify-content:center" data-act="add">${ic('plus')}${m.today ? tx('Add to today') : tx('Add to {date}', { date: esc(m.date) })}</button><div class="cs-dim">${tx('Stored as below zero either way. The name fills in from the catalogue.')}</div></div></div>` +
      `<div class="card"><div class="ch"><h3>${tx('Last 14 days')}</h3></div><div class="bars" style="height:64px">${m.days.map(([d, x], i) => `<div class="${d === m.date ? 'hi' : ''}" style="height:${Object.keys(x).length ? Math.round(Object.keys(x).length / max * 100) : 3}%" title="${esc(d)}"></div>`).join('') || '<div style="height:3%"></div>'}</div><div class="cs-dim" style="margin-top:8px">${txn(recorded, '{n} item recorded', '{n} items recorded')}</div></div></div></div>`;
  },
  mobile(ctx) { return `<div id="adjmob">${mobile(ctx)}</div>`; },
  mount(ctx, root) {
    const repaint = () => { if (ctx.isMobile) { const h = $('#adjmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    ensureNames(ctx, model(ctx).items.map(i => i.kc), repaint);
    loadProfiles(ctx, repaint);
    root.addEventListener('click', e => onClick(e, ctx, root, repaint));
    root.addEventListener('change', e => { if (e.target.matches('[data-field="day"]')) { st.date = e.target.value === todayKey() ? null : e.target.value; st.group = 'all'; st.dept = 'all'; ctx.rerender(); } });
    root.addEventListener('keydown', e => { if (e.key !== 'Enter') return; if (e.target.matches('[data-field="tick"]')) { e.preventDefault(); tickOff(ctx, e.target); return; } if (e.target.matches('[data-field="kc"],[data-field="qty"],[data-field="loc"]')) { e.preventDefault(); root.querySelector('[data-act="add"]')?.click(); } if (e.target.matches('[data-field="mkc"]')) { e.preventDefault(); takeCode(ctx, e.target.value, repaint); } if (e.target.matches('[data-field="mpairkc"]')) { e.preventDefault(); pairCode(ctx, e.target.value, repaint); } });
    return [ctx.store.on('adjustments', () => { ensureNames(ctx, model(ctx).items.map(i => i.kc), repaint); repaint(); })];
  },
};
async function onClick(e, ctx, root, repaint) {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, m = model(ctx);
  if (act === 'filter') { st.filter = a.dataset.v; ctx.rerender(); }
  else if (act === 'group') { st.group = a.dataset.v; st.dept = 'all'; ctx.rerender(); }
  else if (act === 'dept') { st.dept = a.dataset.v; ctx.rerender(); }
  else if (act === 'done' || act === 'undone') await send(ctx, 'adjustment.done', { keycode: a.dataset.kc, date: m.date }, act === 'undone' ? { undo: true } : {});
  else if (act === 'remove') await send(ctx, 'adjustment.remove', { keycode: a.dataset.kc, date: m.date });
  else if (act === 'add') { const raw = root.querySelector('[data-field="kc"]')?.value || '', g = barcodeOf(raw), kc = g ? ctx.store.get('apnPairs')?.[g]?.kc : keycodeOf(raw); if (g && !kc) return toast(tx('That is an item barcode: type the keycode from the shelf label'), 'bad'); const qty = Number(root.querySelector('[data-field="qty"]')?.value) || 0; const loc = root.querySelector('[data-field="loc"]')?.value.trim() || ''; if (!kc) return toast(tx('Keycode needed'), 'bad'); const r = await send(ctx, 'adjustment.set', { keycode: kc, date: m.date }, { qty, location: loc, confirmed: false, name: nameOf(kc) || '', source: 'desk' }); if (r) { for (const f of ['kc', 'qty', 'loc']) { const i = root.querySelector(`[data-field="${f}"]`); if (i) i.value = ''; } root.querySelector('[data-field="kc"]')?.focus(); } }
  else if (act === 'screen') openScreenScan(ctx, { mode: 'soh', onUse: async ({ codes, locs }) => {
    // Each code read off the report becomes a below-zero item (SOH 0: the report lists stock at zero or less), at the location it was read at.
    const have = new Set(model(ctx).items.map(i => i.kc)); let ok = 0, dup = 0;
    for (const kc of codes) { if (have.has(kc)) { dup++; continue; } if (await send(ctx, 'adjustment.set', { keycode: kc, date: m.date }, { qty: 0, location: locs[kc] || '', confirmed: false, name: nameOf(kc) || '', source: 'screen' })) ok++; }
    toast(`${tx("{n} added to today's adjustments", { n: ok })}${dup ? ` · ${tx('{n} already listed', { n: dup })}` : ''}`);
  } });
  else if (act === 'print') printAdjustments(ctx, { ...m, items: m.inDept.filter(i => !i.done) });   // what is still to adjust, in the department shown
  else if (act === 'export') { const text = csvLines(['keycode', 'description', 'department', 'soh', 'price', 'shrink', 'carton', 'shrink_to_one_carton', 'location', 'confirmed', 'added', 'adjusted'], m.inDept.map(i => { const pr = priceFor(i); return [i.kc, nameOf(i.kc) || i.name || '', i.dept === NONE || i.dept === OTHER ? '' : deptLabel(i.dept), i.qty, pr ? pr.v.toFixed(2) : '', pr ? shrinkValue(i.qty, pr.v).toFixed(2) : '', cartonOf(i.kc)?.ctn ?? '', toCarton(i)?.toFixed(2) ?? '', i.location, i.confirmed ? 'yes' : '', i.addedAt, i.done?.at || '']; })); try { await navigator.clipboard.writeText(text); toast(txn(m.inDept.length, '{n} row copied as CSV', '{n} rows copied as CSV')); } catch { toast(tx('Copy failed'), 'bad'); } }
  else if (act === 'm-qty') { st.mQty = Math.max(0, st.mQty + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-soh') { st.mSoh = Math.min(0, st.mSoh + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-flag') { if (!st.mKc) return; const r = await send(ctx, 'adjustment.set', { keycode: st.mKc, date: m.date }, { qty: st.mSoh, counted: st.mQty, location: '', confirmed: false, name: nameOf(st.mKc) || '', source: 'phone' }); if (r) { toast(tx('{kc} flagged', { kc: st.mKc })); st.mKc = ''; st.mSoh = 0; st.mQty = 1; repaint(); } }
  else if (act === 'm-clear') { st.mKc = ''; st.mPair = null; repaint(); }
}
// A scanned keycode is ticked off the list being shown.
async function tickOff(ctx, input) {
  const kc = parseKeycodes(input.value)[0], m = model(ctx); input.value = '';
  if (!kc) return toast(tx('That is not a keycode'), 'bad');
  const it = m.items.find(i => i.kc === kc);
  if (!it) return toast(tx('{kc} is not on this list', { kc }), 'bad');
  if (it.done) return toast(tx('{kc} is already ticked off', { kc }));
  if (await send(ctx, 'adjustment.done', { keycode: kc, date: m.date })) toast(tx('{kc} adjusted ✓', { kc }));
  document.querySelector('#content [data-field="tick"]')?.focus();
}
// A scanned item barcode is not a keycode: the store's pair for it (learned
// in Cages or here) gives the keycode, or the phone asks for it once and
// remembers the pair for everyone (cage.pair).
const barcodeOf = raw => { const v = String(raw || '').trim(); const g = v.replace(/\D/g, '').length >= 12 || v.startsWith('(') ? gs1Parse(v) : null; return g?.gtin || null; };
const keycodeOf = raw => parseKeycodes(raw).find(k => k.length <= 8) || '';
function takeCode(ctx, raw, repaint) {
  const g = barcodeOf(raw);
  if (g) { const kc = ctx.store.get('apnPairs')?.[g]?.kc; st.mKc = kc || ''; st.mPair = kc ? null : g; }
  else { st.mKc = keycodeOf(raw); st.mPair = null; if (!st.mKc) toast(tx('That is not a keycode'), 'bad'); }
  // A recalled product stops here, keycode or item barcode (paired or not).
  const rec = recallFor(ctx.store, st.mKc) || (g ? recallFor(ctx.store, g) : null);
  if (rec) { st.mKc = st.mKc || rec.kcs[0]; st.mPair = null; haptic('error'); }
  if (st.mKc) ensureNames(ctx, [st.mKc], repaint);
  repaint();
  if (st.mPair) setTimeout(() => document.querySelector('[data-field="mpairkc"]')?.focus(), 30);
}
async function pairCode(ctx, raw, repaint) {
  const kc = keycodeOf(raw); if (!kc) return toast(tx('Scan or type the keycode on the shelf label or carton'), 'bad');
  const apn = st.mPair; st.mPair = null; st.mKc = kc; ensureNames(ctx, [kc], repaint); repaint();
  if (apn && await send(ctx, 'cage.pair', { apn }, { keycode: kc })) toast(tx('{apn} paired with {kc}: next time it needs no keycode', { apn, kc }));
}
function mobile(ctx) {
  const m = model(ctx);
  return mhead(tx('Adjust SOH'), tx('Stock is here but the system says no')) + (m.shrink.total || m.shrink.carton ? `<div class="adj-shrinks mv">${m.shrink.total ? `<div class="adj-shrinkline">${ic('dollar')}<span>${tx('<b>{amount}</b> potential shrink today', { amount: money(m.shrink.total) })}${m.shrink.unpriced ? ` · ${tx('{n} without a price', { n: m.shrink.unpriced })}` : ''}</span></div>` : ''}${m.shrink.carton ? `<div class="adj-shrinkline ctn">${ic('box')}<span>${tx('<b>{amount}</b> to one carton', { amount: money(m.shrink.carton) })}${m.shrink.noSize ? ` · ${tx('{n} without a carton size', { n: m.shrink.noSize })}` : ''}</span></div>` : ''}</div>` : '') +
    mscan(tx('Scan the product'), `<input data-field="mkc" inputmode="numeric" autocomplete="off" placeholder="${tx('Keycode or item barcode')}" value="${esc(st.mKc)}" enterkeyhint="done">`, tx('Then enter the SOH the PDT shows and count the shelf')) +
    (st.mPair ? `<div class="mv-last"><small>${tx('Item barcode {code}', { code: esc(st.mPair) })}</small><b>${tx('Which keycode is it?')}</b><span>${tx('Scan or type the keycode on the shelf label or carton, once: the store remembers it.')}</span></div>` + mscan(tx('Keycode'), `<input data-field="mpairkc" inputmode="numeric" autocomplete="off" placeholder="${tx('Keycode')}" enterkeyhint="done">`, tx('From the shelf label or the carton')) + mfoot(mghost(tx('Not this one'), ' data-act="m-clear"')) : '') +
    (st.mKc && recallFor(ctx.store, st.mKc) ? `<div class="mv-last"><small>${tx('Scanned')}</small><b>${kcCopy(st.mKc)}</b><span>${productHtml(st.mKc)}</span></div>` + recallFlag(ctx.store, recallFor(ctx.store, st.mKc), st.mKc) + mfoot(mghost(tx('Scan another'), ' data-act="m-clear"')) :
     st.mKc ? `<div class="mv-last"><small>${tx('Scanned')}</small><b>${kcCopy(st.mKc)}</b><span>${productHtml(st.mKc)}</span></div><div class="mv-stepper"><button data-act="m-soh" data-d="-1" aria-label="${tx('Lower system SOH')}">−</button><div><b>${st.mSoh}</b><small>${tx('system SOH (PDT)')}</small></div><button data-act="m-soh" data-d="1" aria-label="${tx('Raise system SOH')}">+</button></div><div class="mv-stepper"><button data-act="m-qty" data-d="-1" aria-label="${tx('One fewer found')}">−</button><div><b>${st.mQty}</b><small>${tx('found on the shelf')}</small></div><button data-act="m-qty" data-d="1" aria-label="${tx('One more found')}">+</button></div>` + mfoot(mbig(tx('Flag for adjustment'), '', 'sort', ' data-act="m-flag"') + mghost(tx('Not this one'), ' data-act="m-clear"')) : '') +
    (m.items.length ? `<div class="mv-sub">${tx('Today')} · ${m.items.length}</div><div class="mv-rows">${m.items.slice(0, 6).map(i => `<div class="mv-row"><span class="a">${i.qty}</span><span class="b">${kcCopy(i.kc)} ${productHtml(i.kc, i.name)}</span><span class="c">${[i.location ? esc(i.location) : '', toCarton(i) != null ? `<b class="loss1">${money(toCarton(i))}</b>` : ''].filter(Boolean).join(' · ')}</span></div>`).join('')}</div>` : '');
}

// The SOH list for the office (K2B's printNegsoh): most negative first, each
// keycode as a barcode, the SOH, where it was confirmed, and a tick. One
// section per department (the stockroom's bay ranges, from Departments),
// so each department's lead takes their own; then any bay outside the
// ranges, then items with no location.
function printAdjustments(ctx, m) {
  const row = (it, i) => { const pr = priceFor(it), loss = pr ? shrinkValue(it.qty, pr.v) : 0; return [String(i + 1), code(it.kc), esc(nameOf(it.kc) || it.name || ''), `<b>${it.qty}</b>`, pr ? money(pr.v) : '—', loss ? money(loss) : '—', esc(it.location || '—') + (it.confirmed ? ' ✓' : ''), tick]; };
  const tbl = list => table(['#', tx('Keycode'), tx('Description'), 'SOH', tx('Price'), tx('Shrink'), tx('Where'), tx('Done')], list.map(row), ['n', 'bc', '', 'n', 'n', 'n', '', 't']);
  const sh = shrinkOf(m.items);
  const ranges = settingsOf(ctx.store.get()).deptRanges || [], groups = new Map();
  for (const it of m.items) {
    const g = !it.location ? '\u0000none' : (ranges.length && deptForBay(ranges, it.location)) || '\u0000other';
    if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it);
  }
  const rank = g => g.startsWith('\u0000') ? 9 : SR_GROUPS.findIndex(([k]) => k === deptGroup(g));   // Home, Clothing, Kids, Other, then the rest
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }));
  const title = g => g === '\u0000none' ? tx('No location') : g === '\u0000other' ? (ranges.length ? tx('Bays outside the department ranges') : tx('Confirmed at a bay')) : deptLabel(g);
  printSheet({
    title: tx('SOH adjustments · {date}', { date: m.date }), subtitle: `${txn(m.items.length, '{n} item below zero', '{n} items below zero')}${sh.open ? ` · ${tx('{amount} potential shrink', { amount: money(sh.open) })}` : ''}${sh.cartonOpen ? ` · ${tx('{amount} to one carton', { amount: money(sh.cartonOpen) })}` : ''} · ${tx('✓ confirmed at the bay')}${ranges.length ? ` · ${tx('by department')}` : ''}`,
    body: order.map(g => section(`${esc(title(g))} (${groups.get(g).length})`, tbl(groups.get(g)))).join('') || section(tx('Nothing below zero'), ''),
  });
}
