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
import { todayKey, ensureNames, nameHtml, nameOf, send, loadProfiles, depthChip, ghostChip } from './common.js';

const st = { filter: 'all', dept: 'all', date: null, mSoh: 0, mQty: 1, mKc: '' };
const NONE = '\u0000none', OTHER = '\u0000other';
const SOURCE = { report: 'Morning report', review: 'Backfill review', phone: 'Phone', desk: 'Typed', screen: 'Screen scan', import: 'K2B' };
function model(ctx) {
  const all = ctx.store.get('adjustments'), date = st.date && all[st.date] ? st.date : todayKey(), day = all[date] || {};
  const ranges = settingsOf(ctx.store.get()).deptRanges || [], deptOf = it => !it.location ? NONE : (ranges.length && deptForBay(ranges, it.location)) || OTHER;
  const items = Object.entries(day).map(([kc, it]) => ({ kc, ...it, dept: deptOf(it) })).sort((a, b) => (!!a.done - !!b.done) || (a.qty - b.qty) || a.kc.localeCompare(b.kc));
  const days = Object.entries(all).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const depts = [...new Set(items.map(i => i.dept))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const inDept = st.dept === 'all' ? items : items.filter(i => i.dept === st.dept);
  return { date, today: date === todayKey(), items, inDept, depts, ranges, confirmed: inDept.filter(i => i.confirmed), unplaced: inDept.filter(i => !i.location), done: items.filter(i => i.done), days, past: Object.keys(all).sort().reverse() };
}
const deptName = d => d === NONE ? 'No location' : d === OTHER ? 'Other bays' : String(d).toUpperCase();
export default {
  id: 'adjust', title: 'Adjustments', icon: 'm-adjust', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    const list = st.filter === 'confirmed' ? m.confirmed : st.filter === 'unplaced' ? m.unplaced : st.filter === 'open' ? m.inDept.filter(i => !i.done) : m.inDept;
    const deptPills = m.depts.length > 1 ? `<div class="pills adj-depts"><button class="${st.dept === 'all' ? 'on' : ''}" data-act="dept" data-v="all">All departments</button>${m.depts.map(d => `<button class="${st.dept === d ? 'on' : ''}" data-act="dept" data-v="${esc(d)}">${esc(deptName(d))} ${m.items.filter(i => i.dept === d && !i.done).length}</button>`).join('')}</div>` : (m.items.length && !m.ranges.length ? '<div class="cs-dim adj-depts">Enter the stockroom bay ranges in Settings › Store to split this list by department.</div>' : '');
    const dayPick = `<select class="ad-in" data-field="day" aria-label="Day">${[...new Set([todayKey(), ...m.past])].sort().reverse().map(d => `<option value="${esc(d)}"${d === m.date ? ' selected' : ''}>${d === todayKey() ? 'Today' : esc(d)} · ${Object.keys(ctx.store.get('adjustments')[d] || {}).length}</option>`).join('')}</select>`;
    const max = Math.max(1, ...m.days.map(([, d]) => Object.keys(d).length));
    return vh('Adjustments', sub('Below-zero SOH evidence', esc(m.date), `${m.items.length} item${m.items.length === 1 ? '' : 's'}${m.today ? ' today' : ''} · ${m.done.length} adjusted`), `${dayPick}<button class="btn" data-act="screen" title="Read a below-zero SOH report off the screen">${ic('expand')}Screen scan</button><button class="btn" data-act="print">${ic('print')}Print list</button><button class="btn" data-act="export">${ic('file')}Copy for the office</button>`, 'm-adjust') +
      `<div class="grid2"><div class="card adj"><div class="ch"><h3>${m.today ? 'Today’s list' : `List for ${esc(m.date)}`}</h3><span class="cs-dim">most negative first</span><span class="pills" style="margin-left:auto"><button class="${st.filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">All ${m.inDept.length}</button><button class="${st.filter === 'open' ? 'on' : ''}" data-act="filter" data-v="open">To adjust ${m.inDept.filter(i => !i.done).length}</button><button class="${st.filter === 'confirmed' ? 'on' : ''}" data-act="filter" data-v="confirmed">Confirmed ${m.confirmed.length}</button><button class="${st.filter === 'unplaced' ? 'on' : ''}" data-act="filter" data-v="unplaced">Unplaced ${m.unplaced.length}</button></span></div>` +
      deptPills + `<div class="adj-hd"><span>SOH</span><span>Keycode</span><span>Where</span><span>Added</span><span>Source</span><span></span></div>` +
      (list.map(it => `<div class="adj-row${it.done ? ' done' : ''}"><span class="adj-qty${it.qty === 0 ? ' zero' : ''}">${it.qty}</span><span class="adj-main"><b>${esc(it.kc)}</b><small>${it.name ? esc(it.name) : nameHtml(it.kc)}</small><span class="adj-chips">${ghostChip(it.kc, it.qty)}${depthChip(it.kc)}</span></span><span class="adj-where">${it.location ? `<span class="adj-loc${it.confirmed ? ' ok' : ''}">${esc(it.location)}${it.confirmed ? ' ✓' : ''}</span>` : '<span class="cs-dim">no location</span>'}</span><span class="cs-dim">${fmtTime(it.addedAt)}</span><span class="cs-dim">${it.done ? `<button class="adj-done on" data-act="undone" data-kc="${esc(it.kc)}" title="Adjusted ${esc(fmtTime(it.done.at))}: tap to put it back">✓ Adjusted</button>` : `<button class="adj-done" data-act="done" data-kc="${esc(it.kc)}" title="Adjusted in the system: tick it off">Mark adjusted</button>`}<br>${esc(SOURCE[it.source] || (it.confirmed ? 'Backfill review' : it.counted != null ? 'Phone' : 'Typed'))}${it.counted != null ? ` · ${it.counted} found` : ''}</span><span class="adj-x" title="Remove from today’s list" data-act="remove" data-kc="${esc(it.kc)}">${ic('x')}</span></div>`).join('') || '<div class="cs-dim" style="padding:14px 2px">Nothing recorded today. Flag a code from Backfill review, or add one on the right.</div>') +
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
    root.addEventListener('change', e => { if (e.target.matches('[data-field="day"]')) { st.date = e.target.value === todayKey() ? null : e.target.value; st.dept = 'all'; ctx.rerender(); } });
    root.addEventListener('keydown', e => { if (e.key !== 'Enter') return; if (e.target.matches('[data-field="tick"]')) { e.preventDefault(); tickOff(ctx, e.target); return; } if (e.target.matches('[data-field="kc"],[data-field="qty"],[data-field="loc"]')) { e.preventDefault(); root.querySelector('[data-act="add"]')?.click(); } if (e.target.matches('[data-field="mkc"]')) { e.preventDefault(); st.mKc = parseKeycodes(e.target.value)[0] || ''; if (!st.mKc) toast('That is not a keycode', 'bad'); else ensureNames(ctx, [st.mKc], repaint); repaint(); } });
    return [ctx.store.on('adjustments', () => { ensureNames(ctx, model(ctx).items.map(i => i.kc), repaint); repaint(); })];
  },
};
async function onClick(e, ctx, root, repaint) {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, m = model(ctx);
  if (act === 'filter') { st.filter = a.dataset.v; ctx.rerender(); }
  else if (act === 'dept') { st.dept = a.dataset.v; ctx.rerender(); }
  else if (act === 'done' || act === 'undone') await send(ctx, 'adjustment.done', { keycode: a.dataset.kc, date: m.date }, act === 'undone' ? { undo: true } : {});
  else if (act === 'remove') await send(ctx, 'adjustment.remove', { keycode: a.dataset.kc, date: m.date });
  else if (act === 'add') { const kc = parseKeycodes(root.querySelector('[data-field="kc"]')?.value)[0]; const qty = Number(root.querySelector('[data-field="qty"]')?.value) || 0; const loc = root.querySelector('[data-field="loc"]')?.value.trim() || ''; if (!kc) return toast('Keycode needed', 'bad'); const r = await send(ctx, 'adjustment.set', { keycode: kc, date: m.date }, { qty, location: loc, confirmed: false, name: nameOf(kc) || '', source: 'desk' }); if (r) { for (const f of ['kc', 'qty', 'loc']) { const i = root.querySelector(`[data-field="${f}"]`); if (i) i.value = ''; } root.querySelector('[data-field="kc"]')?.focus(); } }
  else if (act === 'screen') openScreenScan(ctx, { mode: 'soh', onUse: async ({ codes, locs }) => {
    // Each code read off the report becomes a below-zero item (SOH 0: the report lists stock at zero or less), at the location it was read at.
    const have = new Set(model(ctx).items.map(i => i.kc)); let ok = 0, dup = 0;
    for (const kc of codes) { if (have.has(kc)) { dup++; continue; } if (await send(ctx, 'adjustment.set', { keycode: kc, date: m.date }, { qty: 0, location: locs[kc] || '', confirmed: false, name: nameOf(kc) || '', source: 'screen' })) ok++; }
    toast(`${ok} added to today's adjustments${dup ? ` · ${dup} already listed` : ''}`);
  } });
  else if (act === 'print') printAdjustments(ctx, { ...m, items: m.inDept.filter(i => !i.done) });   // what is still to adjust, in the department shown
  else if (act === 'export') { const text = csvLines(['keycode', 'name', 'soh', 'location', 'confirmed', 'added', 'adjusted'], m.inDept.map(i => [i.kc, i.name || nameOf(i.kc) || '', i.qty, i.location, i.confirmed ? 'yes' : '', i.addedAt, i.done?.at || ''])); try { await navigator.clipboard.writeText(text); toast(`${m.inDept.length} rows copied as CSV`); } catch { toast('Copy failed', 'bad'); } }
  else if (act === 'm-qty') { st.mQty = Math.max(0, st.mQty + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-soh') { st.mSoh = Math.min(0, st.mSoh + Number(a.dataset.d)); repaint(); }
  else if (act === 'm-flag') { if (!st.mKc) return; const r = await send(ctx, 'adjustment.set', { keycode: st.mKc, date: m.date }, { qty: st.mSoh, counted: st.mQty, location: '', confirmed: false, name: nameOf(st.mKc) || '', source: 'phone' }); if (r) { toast(`${st.mKc} flagged`); st.mKc = ''; st.mSoh = 0; st.mQty = 1; repaint(); } }
  else if (act === 'm-clear') { st.mKc = ''; repaint(); }
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
function mobile(ctx) {
  const m = model(ctx);
  return mhead('Adjust SOH', 'Stock is here but the system says no') +
    mscan('Scan the product', `<input data-field="mkc" inputmode="numeric" autocomplete="off" placeholder="Keycode or item barcode" value="${esc(st.mKc)}" enterkeyhint="done">`, 'Then enter the SOH the PDT shows and count the shelf') +
    (st.mKc ? `<div class="mv-last"><small>Scanned</small><b>${esc(st.mKc)}</b><span>${nameHtml(st.mKc)}</span></div><div class="mv-stepper"><button data-act="m-soh" data-d="-1" aria-label="Lower system SOH">−</button><div><b>${st.mSoh}</b><small>system SOH (PDT)</small></div><button data-act="m-soh" data-d="1" aria-label="Raise system SOH">+</button></div><div class="mv-stepper"><button data-act="m-qty" data-d="-1" aria-label="One fewer found">−</button><div><b>${st.mQty}</b><small>found on the shelf</small></div><button data-act="m-qty" data-d="1" aria-label="One more found">+</button></div>` + mfoot(mbig('Flag for adjustment', '', 'sort', ' data-act="m-flag"') + mghost('Not this one', ' data-act="m-clear"')) : '') +
    (m.items.length ? `<div class="mv-sub">Today · ${m.items.length}</div><div class="mv-rows">${m.items.slice(0, 6).map(i => `<div class="mv-row"><span class="a">${i.qty}</span><span class="b">${esc(i.kc)} ${i.name ? esc(i.name) : ''}</span><span class="c">${i.location ? esc(i.location) : ''}</span></div>`).join('')}</div>` : '');
}

// The SOH list for the office (K2B's printNegsoh): most negative first, each
// keycode as a barcode, the SOH, where it was confirmed, and a tick. One
// section per department (the stockroom's bay ranges, Settings › Store),
// so each department's lead takes their own; then any bay outside the
// ranges, then items with no location.
function printAdjustments(ctx, m) {
  const row = (it, i) => [String(i + 1), code(it.kc), esc(it.name || nameOf(it.kc) || ''), `<b>${it.qty}</b>`, esc(it.location || '—') + (it.confirmed ? ' ✓' : ''), tick];
  const tbl = list => table(['#', 'Keycode', 'Product', 'SOH', 'Where', 'Done'], list.map(row), ['n', 'bc', '', 'n', '', 't']);
  const ranges = settingsOf(ctx.store.get()).deptRanges || [], groups = new Map();
  for (const it of m.items) {
    const g = !it.location ? '\u0000none' : (ranges.length && deptForBay(ranges, it.location)) || '\u0000other';
    if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it);
  }
  const order = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const title = g => g === '\u0000none' ? 'No location' : g === '\u0000other' ? (ranges.length ? 'Bays outside the department ranges' : 'Confirmed at a bay') : `Department ${g}`;
  printSheet({
    title: `SOH adjustments · ${m.date}`, subtitle: `${m.items.length} item${m.items.length === 1 ? '' : 's'} below zero · ✓ confirmed at the bay${ranges.length ? ' · by department' : ''}`,
    body: order.map(g => section(`${esc(title(g))} (${groups.get(g).length})`, tbl(groups.get(g)))).join('') || section('Nothing below zero', ''),
  });
}
