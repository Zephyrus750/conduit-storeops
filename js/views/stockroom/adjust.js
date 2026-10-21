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

const st = { filter: 'all', group: 'all', dept: 'all', date: null, mSoh: 0, mQty: 1, mKc: '', mPair: null };
const NONE = '\u0000none', OTHER = '\u0000other';
const SOURCE = { report: 'Morning report', review: 'Backfill review', phone: 'Phone', desk: 'Typed', screen: 'Screen scan', import: 'K2B' };
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
  if (sh.total || sh.unpriced) lines.push(`<div class="adj-shrinkline">${ic('dollar')}<span><b>${money(sh.total)}</b> potential shrink if the items below zero are adjusted to zero${sh.open !== sh.total ? ` · <b>${money(sh.open)}</b> still to adjust` : ''}${sh.unpriced ? ` · ${sh.unpriced} without a price` : ''}</span></div>`);
  if (!sh.sizes && m.inDept.length) lines.push(`<div class="adj-shrinkline ctn">${ic('box')}<span>To one carton: reading the carton sizes from the manifests…</span></div>`);
  else if (sh.carton || sh.noSize) lines.push(`<div class="adj-shrinkline ctn">${ic('box')}<span><b>${money(sh.carton)}</b> to one carton if everything at zero or below is adjusted up to one carton${sh.cartonOpen !== sh.carton ? ` · <b>${money(sh.cartonOpen)}</b> still to adjust` : ''}${sh.noSize ? ` · ${sh.noSize} without a carton size` : ''}${sh.cartonUnpriced ? ` · ${sh.cartonUnpriced} without a price` : ''}</span></div>`);
  return lines.length ? `<div class="adj-shrinks">${lines.join('')}</div>` : '';
}
// An item's to-one-carton value, or null when its price or carton size is unknown.
const toCarton = it => { const pr = priceFor(it), c = cartonOf(it.kc); return pr && c && it.qty <= 0 ? cartonShrink(it.qty, c.ctn, pr.v) : null; };
// One item's to-one-carton cell, with the units it adds.
function cartonCell(it, pr) {
  if (it.qty > 0) return '<span class="cs-dim">—</span>';
  const c = cartonOf(it.kc);
  if (!c) return `<span class="cs-dim" title="No carton size yet: it has not been on a manifest">${profilesReady() ? 'no size' : '…'}</span>`;
  const units = cartonUnits(it.qty, c.ctn), how = `${it.qty < 0 ? `${-it.qty} to reach zero + ` : ''}${c.ctn} a carton (${c.basis === 'profile' ? 'the carton profile' : 'the latest delivery'})`;
  return pr ? `<b class="loss1" title="${esc(how)} × ${money(pr.v)}">${money(cartonShrink(it.qty, c.ctn, pr.v))}</b><small>+${units} units</small>` : `<span class="cs-dim" title="${esc(how)}; no price for this item yet">?</span><small>+${units} units</small>`;
}
const deptName = d => d === NONE ? 'No location' : d === OTHER ? 'Bays outside the ranges' : deptLabel(d);
const groupOf = d => d === NONE || d === OTHER ? 'none' : deptGroup(d);
const GROUPS = [...SR_GROUPS, ['none', 'No department']];
// The filter: main departments first, then the chosen one's sub-departments,
// each with how many items are still to adjust.
function deptFilter(m) {
  if (!m.items.length) return '';
  if (!m.ranges.length) return '<div class="cs-dim adj-depts">Set which bays belong to which department (<button type="button" class="lnk" data-go="srdepts">Departments</button>) to group this list by department.</div>';
  const open = list => list.filter(i => !i.done).length;
  const groups = GROUPS.filter(([g]) => m.items.some(i => groupOf(i.dept) === g));
  const subs = st.group === 'all' ? [] : m.depts.filter(d => groupOf(d) === st.group);
  return `<div class="pills adj-depts adj-groups"><button class="${st.group === 'all' ? 'on' : ''}" data-act="group" data-v="all">All departments <b>${open(m.items)}</b></button>${groups.map(([g, gl]) => `<button class="${st.group === g ? 'on' : ''}" data-act="group" data-v="${g}">${gl} <b>${open(m.items.filter(i => groupOf(i.dept) === g))}</b></button>`).join('')}</div>` +
    (subs.length > 1 || (subs.length === 1 && st.group === 'none') ? `<div class="pills adj-depts adj-subs"><button class="${st.dept === 'all' ? 'on' : ''}" data-act="dept" data-v="all">All of ${esc(GROUPS.find(x => x[0] === st.group)?.[1] || '')}</button>${subs.map(d => `<button class="${st.dept === d ? 'on' : ''}" data-act="dept" data-v="${esc(d)}">${esc(deptName(d))} <b>${open(m.items.filter(i => i.dept === d))}</b></button>`).join('')}</div>` : '');
}
export default {
  id: 'adjust', title: 'Adjustments', icon: 'm-adjust', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    const list = st.filter === 'confirmed' ? m.confirmed : st.filter === 'unplaced' ? m.unplaced : st.filter === 'open' ? m.inDept.filter(i => !i.done) : m.inDept;
    const deptPills = deptFilter(m);
    const dayPick = `<select class="ad-in" data-field="day" aria-label="Day">${[...new Set([todayKey(), ...m.past])].sort().reverse().map(d => `<option value="${esc(d)}"${d === m.date ? ' selected' : ''}>${d === todayKey() ? 'Today' : esc(d)} · ${Object.keys(ctx.store.get('adjustments')[d] || {}).length}</option>`).join('')}</select>`;
    const max = Math.max(1, ...m.days.map(([, d]) => Object.keys(d).length));
    return vh('Adjustments', sub('Below-zero SOH evidence', esc(m.date), `${m.items.length} item${m.items.length === 1 ? '' : 's'}${m.today ? ' today' : ''} · ${m.done.length} adjusted${m.shrink.total ? ` · ${money(m.shrink.total)} potential shrink` : ''}${m.shrink.carton ? ` · ${money(m.shrink.carton)} to one carton` : ''}`), `${dayPick}<button class="btn" data-act="screen" title="Read a below-zero SOH report off the screen">${ic('expand')}Screen scan</button><button class="btn" data-act="print">${ic('print')}Print list</button><button class="btn" data-act="export">${ic('file')}Copy for the office</button>`, 'm-adjust') +
      `<div class="grid2"><div class="card adj"><div class="ch"><h3>${m.today ? 'Today’s list' : `List for ${esc(m.date)}`}</h3><span class="cs-dim">most negative first</span><span class="pills" style="margin-left:auto"><button class="${st.filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">All ${m.inDept.length}</button><button class="${st.filter === 'open' ? 'on' : ''}" data-act="filter" data-v="open">To adjust ${m.inDept.filter(i => !i.done).length}</button><button class="${st.filter === 'confirmed' ? 'on' : ''}" data-act="filter" data-v="confirmed">Confirmed ${m.confirmed.length}</button><button class="${st.filter === 'unplaced' ? 'on' : ''}" data-act="filter" data-v="unplaced">Unplaced ${m.unplaced.length}</button></span></div>` +
      deptPills + shrinkLine(m) + `<div class="adj-hd adj-cols"><span>SOH</span><span>Keycode</span><span>Description</span><span class="adj-hdept"><span class="long">Department</span><span class="short">Dept</span></span><span class="n">Price</span><span class="n" title="Units below zero × price: written off when adjusted to zero">To zero</span><span class="n" title="(One carton − SOH) × price: written off when adjusted up to one carton. The carton size comes from the manifests.">To one carton</span><span>Where</span><span>Added</span><span>Source</span><span></span></div>` +
      (list.map(it => { const pr = priceFor(it), loss = pr ? shrinkValue(it.qty, pr.v) : 0; return `<div class="adj-row adj-cols${it.done ? ' done' : ''}"><span class="adj-qty${it.qty === 0 ? ' zero' : ''}">${it.qty}</span><span class="adj-kc">${kcCopy(it.kc)}</span><span class="adj-desc">${productHtml(it.kc, it.name)}<span class="adj-chips">${ghostChip(it.kc, it.qty)}${depthChip(it.kc)}</span></span><span class="adj-dept">${it.dept === NONE || it.dept === OTHER ? '<span class="cs-dim">—</span>' : deptBadge(it.dept)}</span><span class="adj-price n"${pr ? ` title="Price from ${pr.from}"` : ''}>${pr ? money(pr.v) : '<span class="cs-dim">—</span>'}</span><span class="adj-shrink n${loss ? ' loss' : ''}"${pr && loss ? ` title="${-it.qty} below zero × ${money(pr.v)}"` : ''}>${loss ? `${money(loss)}<small>${-it.qty} unit${it.qty === -1 ? '' : 's'}</small>` : it.qty < 0 && !pr ? '<span class="cs-dim" title="No price for this item yet">?</span>' : '<span class="cs-dim">—</span>'}</span><span class="adj-ctn n">${cartonCell(it, pr)}</span><span class="adj-where">${it.location ? `<span class="adj-loc${it.confirmed ? ' ok' : ''}">${esc(it.location)}${it.confirmed ? ' ✓' : ''}</span>` : '<span class="cs-dim">no location</span>'}</span><span class="cs-dim">${fmtTime(it.addedAt)}</span><span class="cs-dim">${it.done ? `<button class="adj-done on" data-act="undone" data-kc="${esc(it.kc)}" title="Adjusted ${esc(fmtTime(it.done.at))}: tap to put it back">✓ Adjusted</button>` : `<button class="adj-done" data-act="done" data-kc="${esc(it.kc)}" title="Adjusted in the system: tick it off">Mark adjusted</button>`}<br>${esc(SOURCE[it.source] || (it.confirmed ? 'Backfill review' : it.counted != null ? 'Phone' : 'Typed'))}${it.counted != null ? ` · ${it.counted} found` : ''}</span><span class="adj-x" title="Remove from today’s list" data-act="remove" data-kc="${esc(it.kc)}">${ic('x')}</span></div>`; }).join('') || '<div class="cs-dim" style="padding:14px 2px">Nothing recorded today. Flag a code from Backfill review, or add one on the right.</div>') +
      `<div class="cs-dim" style="padding:10px 2px 0">A ✓ location means the item was confirmed present when that bay was backfilled.</div></div>` +
      `<div class="sidecol"><div class="card"><div class="ch"><h3>Tick off by scanning</h3></div><div class="adj-form"><div class="search">${ic('barcode')}<input data-field="tick" placeholder="Scan a keycode once it is adjusted" inputmode="numeric" autocomplete="off"></div><div class="cs-dim">${m.done.length} of ${m.items.length} adjusted${m.today ? ' today' : ''}. A scanner's Enter ticks it off.</div></div></div>` +
      `<div class="card"><div class="ch"><h3>Add an item</h3></div><div class="adj-form"><div class="search">${ic('barcode')}<input data-field="kc" placeholder="Keycode" inputmode="numeric" autocomplete="off"></div><div class="adj-form2"><input class="ad-in" data-field="qty" placeholder="SOH (report)" aria-label="SOH from the report" inputmode="numeric"><input class="ad-in mono" data-field="loc" placeholder="Location (optional)"></div><button class="btn primary" style="justify-content:center" data-act="add">${ic('plus')}${m.today ? 'Add to today' : `Add to ${esc(m.date)}`}</button><div class="cs-dim">Stored as below zero either way. The name fills in from the catalogue.</div></div></div>` +
      `<div class="card"><div class="ch"><h3>Last 14 days</h3></div><div class="bars" style="height:64px">${m.days.map(([d, x], i) => `<div class="${d === m.date ? 'hi' : ''}" style="height:${Object.keys(x).length ? Math.round(Object.keys(x).length / max * 100) : 3}%" title="${esc(d)}"></div>`).join('') || '<div style="height:3%"></div>'}</div><div class="cs-dim" style="margin-top:8px">${m.days.reduce((n, [, x]) => n + Object.keys(x).length, 0)} items recorded</div></div></div></div>`;
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
  else if (act === 'add') { const raw = root.querySelector('[data-field="kc"]')?.value || '', g = barcodeOf(raw), kc = g ? ctx.store.get('apnPairs')?.[g]?.kc : keycodeOf(raw); if (g && !kc) return toast('That is an item barcode: type the keycode from the shelf label', 'bad'); const qty = Number(root.querySelector('[data-field="qty"]')?.value) || 0; const loc = root.querySelector('[data-field="loc"]')?.value.trim() || ''; if (!kc) return toast('Keycode needed', 'bad'); const r = await send(ctx, 'adjustment.set', { keycode: kc, date: m.date }, { qty, location: loc, confirmed: false, name: nameOf(kc) || '', source: 'desk' }); if (r) { for (const f of ['kc', 'qty', 'loc']) { const i = root.querySelector(`[data-field="${f}"]`); if (i) i.value = ''; } root.querySelector('[data-field="kc"]')?.focus(); } }
  else if (act === 'screen') openScreenScan(ctx, { mode: 'soh', onUse: async ({ codes, locs }) => {
    // Each code read off the report becomes a below-zero item (SOH 0: the report lists stock at zero or less), at the location it was read at.
    const have = new Set(model(ctx).items.map(i => i.kc)); let ok = 0, dup = 0;
    for (const kc of codes) { if (have.has(kc)) { dup++; continue; } if (await send(ctx, 'adjustment.set', { keycode: kc, date: m.date }, { qty: 0, location: locs[kc] || '', confirmed: false, name: nameOf(kc) || '', source: 'screen' })) ok++; }
    toast(`${ok} added to today's adjustments${dup ? ` · ${dup} already listed` : ''}`);
  } });
  else if (act === 'print') printAdjustments(ctx, { ...m, items: m.inDept.filter(i => !i.done) });   // what is still to adjust, in the department shown
  else if (act === 'export') { const text = csvLines(['keycode', 'description', 'department', 'soh', 'price', 'shrink', 'carton', 'shrink_to_one_carton', 'location', 'confirmed', 'added', 'adjusted'], m.inDept.map(i => { const pr = priceFor(i); return [i.kc, nameOf(i.kc) || i.name || '', i.dept === NONE || i.dept === OTHER ? '' : deptLabel(i.dept), i.qty, pr ? pr.v.toFixed(2) : '', pr ? shrinkValue(i.qty, pr.v).toFixed(2) : '', cartonOf(i.kc)?.ctn ?? '', toCarton(i)?.toFixed(2) ?? '', i.location, i.confirmed ? 'yes' : '', i.addedAt, i.done?.at || '']; })); try { await navigator.clipboard.writeText(text); toast(`${m.inDept.length} rows copied as CSV`); } catch { toast('Copy failed', 'bad'); } }
  else if (act === 'm-qty') { st.mQty = Math.max(0, st.mQty + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-soh') { st.mSoh = Math.min(0, st.mSoh + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-flag') { if (!st.mKc) return; const r = await send(ctx, 'adjustment.set', { keycode: st.mKc, date: m.date }, { qty: st.mSoh, counted: st.mQty, location: '', confirmed: false, name: nameOf(st.mKc) || '', source: 'phone' }); if (r) { toast(`${st.mKc} flagged`); st.mKc = ''; st.mSoh = 0; st.mQty = 1; repaint(); } }
  else if (act === 'm-clear') { st.mKc = ''; st.mPair = null; repaint(); }
}
// A scanned keycode is ticked off the list being shown.
async function tickOff(ctx, input) {
  const kc = parseKeycodes(input.value)[0], m = model(ctx); input.value = '';
  if (!kc) return toast('That is not a keycode', 'bad');
  const it = m.items.find(i => i.kc === kc);
  if (!it) return toast(`${kc} is not on this list`, 'bad');
  if (it.done) return toast(`${kc} is already ticked off`);
  if (await send(ctx, 'adjustment.done', { keycode: kc, date: m.date })) toast(`${kc} adjusted ✓`);
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
  else { st.mKc = keycodeOf(raw); st.mPair = null; if (!st.mKc) toast('That is not a keycode', 'bad'); }
  if (st.mKc) ensureNames(ctx, [st.mKc], repaint);
  repaint();
  if (st.mPair) setTimeout(() => document.querySelector('[data-field="mpairkc"]')?.focus(), 30);
}
async function pairCode(ctx, raw, repaint) {
  const kc = keycodeOf(raw); if (!kc) return toast('Scan or type the keycode on the shelf label or carton', 'bad');
  const apn = st.mPair; st.mPair = null; st.mKc = kc; ensureNames(ctx, [kc], repaint); repaint();
  if (apn && await send(ctx, 'cage.pair', { apn }, { keycode: kc })) toast(`${apn} paired with ${kc}: next time it needs no keycode`);
}
function mobile(ctx) {
  const m = model(ctx);
  return mhead('Adjust SOH', 'Stock is here but the system says no') + (m.shrink.total || m.shrink.carton ? `<div class="adj-shrinks mv">${m.shrink.total ? `<div class="adj-shrinkline">${ic('dollar')}<span><b>${money(m.shrink.total)}</b> potential shrink today${m.shrink.unpriced ? ` · ${m.shrink.unpriced} without a price` : ''}</span></div>` : ''}${m.shrink.carton ? `<div class="adj-shrinkline ctn">${ic('box')}<span><b>${money(m.shrink.carton)}</b> to one carton${m.shrink.noSize ? ` · ${m.shrink.noSize} without a carton size` : ''}</span></div>` : ''}</div>` : '') +
    mscan('Scan the product', `<input data-field="mkc" inputmode="numeric" autocomplete="off" placeholder="Keycode or item barcode" value="${esc(st.mKc)}" enterkeyhint="done">`, 'Then enter the SOH the PDT shows and count the shelf') +
    (st.mPair ? `<div class="mv-last"><small>Item barcode ${esc(st.mPair)}</small><b>Which keycode is it?</b><span>Scan or type the keycode on the shelf label or carton, once: the store remembers it.</span></div>` + mscan('Keycode', `<input data-field="mpairkc" inputmode="numeric" autocomplete="off" placeholder="Keycode" enterkeyhint="done">`, 'From the shelf label or the carton') + mfoot(mghost('Not this one', ' data-act="m-clear"')) : '') +
    (st.mKc ? `<div class="mv-last"><small>Scanned</small><b>${kcCopy(st.mKc)}</b><span>${productHtml(st.mKc)}</span></div><div class="mv-stepper"><button data-act="m-soh" data-d="-1" aria-label="Lower system SOH">−</button><div><b>${st.mSoh}</b><small>system SOH (PDT)</small></div><button data-act="m-soh" data-d="1" aria-label="Raise system SOH">+</button></div><div class="mv-stepper"><button data-act="m-qty" data-d="-1" aria-label="One fewer found">−</button><div><b>${st.mQty}</b><small>found on the shelf</small></div><button data-act="m-qty" data-d="1" aria-label="One more found">+</button></div>` + mfoot(mbig('Flag for adjustment', '', 'sort', ' data-act="m-flag"') + mghost('Not this one', ' data-act="m-clear"')) : '') +
    (m.items.length ? `<div class="mv-sub">Today · ${m.items.length}</div><div class="mv-rows">${m.items.slice(0, 6).map(i => `<div class="mv-row"><span class="a">${i.qty}</span><span class="b">${kcCopy(i.kc)} ${productHtml(i.kc, i.name)}</span><span class="c">${[i.location ? esc(i.location) : '', toCarton(i) != null ? `<b class="loss1">${money(toCarton(i))}</b>` : ''].filter(Boolean).join(' · ')}</span></div>`).join('')}</div>` : '');
}

// The SOH list for the office (K2B's printNegsoh): most negative first, each
// keycode as a barcode, the SOH, where it was confirmed, and a tick. One
// section per department (the stockroom's bay ranges, from Departments),
// so each department's lead takes their own; then any bay outside the
// ranges, then items with no location.
function printAdjustments(ctx, m) {
  const row = (it, i) => { const pr = priceFor(it), loss = pr ? shrinkValue(it.qty, pr.v) : 0; return [String(i + 1), code(it.kc), esc(nameOf(it.kc) || it.name || ''), `<b>${it.qty}</b>`, pr ? money(pr.v) : '—', loss ? money(loss) : '—', esc(it.location || '—') + (it.confirmed ? ' ✓' : ''), tick]; };
  const tbl = list => table(['#', 'Keycode', 'Description', 'SOH', 'Price', 'Shrink', 'Where', 'Done'], list.map(row), ['n', 'bc', '', 'n', 'n', 'n', '', 't']);
  const sh = shrinkOf(m.items);
  const ranges = settingsOf(ctx.store.get()).deptRanges || [], groups = new Map();
  for (const it of m.items) {
    const g = !it.location ? '\u0000none' : (ranges.length && deptForBay(ranges, it.location)) || '\u0000other';
    if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it);
  }
  const rank = g => g.startsWith('\u0000') ? 9 : SR_GROUPS.findIndex(([k]) => k === deptGroup(g));   // Home, Clothing, Kids, Other, then the rest
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }));
  const title = g => g === '\u0000none' ? 'No location' : g === '\u0000other' ? (ranges.length ? 'Bays outside the department ranges' : 'Confirmed at a bay') : deptLabel(g);
  printSheet({
    title: `SOH adjustments · ${m.date}`, subtitle: `${m.items.length} item${m.items.length === 1 ? '' : 's'} below zero${sh.open ? ` · ${money(sh.open)} potential shrink` : ''}${sh.cartonOpen ? ` · ${money(sh.cartonOpen)} to one carton` : ''} · ✓ confirmed at the bay${ranges.length ? ' · by department' : ''}`,
    body: order.map(g => section(`${esc(title(g))} (${groups.get(g).length})`, tbl(groups.get(g)))).join('') || section('Nothing below zero', ''),
  });
}
