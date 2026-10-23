// Day list: the posted walk for the stockroom (K2B / Vector's stockroom
// intelligence day plan). The locations come from today's requested and
// pending bays, or from the latest SOH snapshot; each carries the counts its
// flagged stock needs (COUNT · STUCK, COUNT · SOH 0, COUNT, SPOT-CHECK).
// They are split into contiguous runs for 1 to 4 walkers, balanced by one
// for the visit plus one per count. A count ticked on the walk is a
// soh.verify event against that snapshot. The desk prints the triage sheet,
// with an SOH adjustment page for the stock that reads zero.

import { $, ic, esc, vh, sub, toast, mhead, fmtDate } from '../../ui.js';
import { todayKey, send, nameOf, ensureNames, profileOf } from './common.js';
import { sohData, clsBadge, bandSoh } from './intel.js';
import { splitWalkers, TASK, sohBand, byLoc } from '../../../shared/stockintel.js';
import { printSheet, code, tick, table, section } from '../../print.js';
import { tx, txn } from '../../i18n.js';

const locKey = b => /^\d+$/.test(String(b)) ? String(Number(b)) : String(b).toUpperCase();
function model(ctx, repaint) {
  const date = todayKey(), bf = ctx.store.get('backfill'), dl = ctx.store.get('daylist')[date] || { walkers: 2, excluded: [], source: '' };
  const data = sohData(ctx, repaint), checks = data?.checks || {}, snap = data?.latest || null;
  const why = {};
  for (const s of Object.values(bf.subs)) if (s.date === date && s.status === 'pending') { const n = Object.values(s.codes).filter(c => c.scanned).length; why[locKey(s.bay)] = { bay: s.bay, kind: tx('Backfill'), sub: txn(n, '{n} code scanned', '{n} codes scanned'), hot: false }; }
  // A requested bay already reviewed or submitted today says so (it is not waiting).
  for (const b of bf.requested[date] || []) if (!why[locKey(b)]) { const s = bf.subs[`${String(b).toUpperCase()}:${date}`] || bf.subs[`${b}:${date}`]; why[locKey(b)] = { bay: b, kind: tx('Requested'), sub: !s ? tx('not scanned yet') : s.status === 'submitted' ? tx('submitted ✓') : tx('reviewed, to submit'), hot: !s }; }
  const source = dl.source === 'snapshot' && snap ? 'snapshot' : Object.keys(why).length || !snap ? 'requested' : 'snapshot';
  if (source === 'snapshot') for (const r of snap.rows) if (!why[r.loc]) why[r.loc] = { bay: r.loc, kind: tx('Snapshot'), sub: '', hot: false };
  const all = Object.keys(why).sort(byLoc).map(l => ({ ...why[l], loc: l, checks: checks[l] || [] }));
  const excluded = new Set(dl.excluded.map(locKey)), active = all.filter(x => !excluded.has(x.loc));
  const groups = splitWalkers(active.map(x => x.loc), checks, dl.walkers), byL = Object.fromEntries(active.map(x => [x.loc, x]));
  const verify = snap ? ctx.store.get('soh')?.verify?.[snap.date] || {} : {};
  const done = c => !!verify[`${c.kc}|${c.loc}`];
  const nChecks = active.reduce((n, x) => n + x.checks.length, 0), nDone = active.reduce((n, x) => n + x.checks.filter(done).length, 0);
  return { date, dl, all, active, walkers: groups.map(g => g.map(l => byL[l])), source, snap, done, nChecks, nDone, excluded };
}
const letter = i => String.fromCharCode(65 + i);
const status = (x, done) => !x.checks.length ? `<span class="sri-st visit">${tx('VISIT ONLY')}</span>` : x.checks.every(done) ? `<span class="sri-st ok">${tx('✓ VERIFIED')}</span>` : `<span class="sri-st todo">${tx('{n} TO VERIFY', { n: x.checks.filter(c => !done(c)).length })}</span>`;
const taskRow = (c, done) => `<div class="sri-task${done(c) ? ' done' : ''}"><span class="sri-task-l ${c.cls}">${tx(TASK[c.cls])}</span><span class="mono">${esc(c.kc)}</span><span class="nm">${esc(nameOf(c.kc) || c.name || '')}</span>${c.recount ? '<span class="sri-badge recount">RECOUNT</span>' : ''}${bandSoh(c.latest, c.ctn)}<button class="sri-tick${done(c) ? ' on' : ''}" data-act="verify" data-kc="${esc(c.kc)}" data-loc="${esc(c.loc)}" title="${done(c) ? tx('Counted: tap to undo') : tx('Mark counted')}" aria-pressed="${done(c)}">✓</button></div>`;

export default {
  id: 'daylist', title: tx('Day list'), icon: 'm-daylist', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx, () => ctx.rerender());
    ensureNames(ctx, m.active.flatMap(x => x.checks.map(c => c.kc)), () => ctx.rerender());
    const srcSeg = `<div class="seg">${[['requested', tx('Requested')], ['snapshot', tx('Snapshot')]].map(([k, l]) => `<button class="${m.source === k ? 'on' : ''}" data-act="source" data-s="${k}"${k === 'snapshot' && !m.snap ? ` disabled title="${tx('Save an SOH snapshot first')}"` : ''}>${l}</button>`).join('')}</div>`;
    const head = vh(tx('Day list'), sub(tx('Posted walk'), esc(m.date), txn(m.dl.walkers, '{locs} locations · {checks} checks · {n} walker', '{locs} locations · {checks} checks · {n} walkers', { locs: m.active.length, checks: m.nChecks })), `${srcSeg}<div class="pills">${[1, 2, 3, 4].map(n => `<button class="${m.dl.walkers === n ? 'on' : ''}" data-act="walkers" data-n="${n}">${n}</button>`).join('')}</div><button class="btn primary" data-act="print">${ic('print')}${tx('Print triage sheet')}</button>`, 'm-daylist');
    const chips = `<div class="card"><div class="ch"><h3>${tx('Locations')}</h3><span class="cs-dim">${tx('tap to leave one out today')}${m.snap ? ` · ${tx('checks from the {date} snapshot', { date: esc(fmtDate(m.snap.date)) })}` : ''}</span></div><div class="sri-chips">${m.all.map(x => `<button class="sri-loc-chip${m.excluded.has(x.loc) ? ' off' : ''}" data-act="${m.excluded.has(x.loc) ? 'include' : 'exclude'}" data-bay="${esc(x.loc)}" title="${esc(x.kind)}${x.sub ? ' · ' + esc(x.sub) : ''}">${esc(x.loc)}${x.checks.length ? `<i>${x.checks.length}</i>` : ''}</button>`).join('') || `<span class="cs-dim">${tx('Request bays from Backfill review, or save an SOH snapshot, to build the walk.')}</span>`}</div>` +
      `<p class="lbl sri-line">${txn(m.walkers.length, '{locs} locations · {checks} checks · {n} walker: lines balanced, bays contiguous.', '{locs} locations · {checks} checks · {n} walkers: lines balanced, bays contiguous.', { locs: m.active.length, checks: m.nChecks })}${m.snap ? ` ${tx('Verified {done}/{checks} · ticks write back to {week}.', { done: m.nDone, checks: m.nChecks, week: esc(m.snap.week || m.snap.date) })}` : ''}</p></div>`;
    const cards = m.walkers.map((w, i) => { const lines = w.reduce((n, x) => n + 1 + x.checks.length, 0); return `<div class="card"><div class="ch"><h3>${tx('Walker {w}', { w: letter(i) })}</h3><span class="go">${w.length ? tx('{from} – {to} · {lines} lines · one sheet', { from: esc(w[0].loc), to: esc(w[w.length - 1].loc), lines }) : tx('nothing yet')}</span></div>${w.map(x => `<div class="sri-stop"><div class="sri-stop-h"><b class="mono">${esc(x.loc)}</b><span class="status${x.hot ? ' warn' : ''}">${esc(x.kind)}</span>${status(x, m.done)}</div>${x.checks.length ? x.checks.map(c => taskRow(c, m.done)).join('') : `<p class="lbl">${tx('No flagged stock here: visit / pull only.')}</p>`}</div>`).join('')}</div>`; }).join('');
    return head + chips + `<div class="sri-walkers" style="--n:${Math.min(2, m.walkers.length || 1)}">${cards}</div>`;
  },
  mobile(ctx) { return `<div id="dlmob">${mobile(ctx)}</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const m = model(ctx, () => {}), act = a.dataset.act;
      const set = patch => send(ctx, 'daylist.set', { date: m.date }, { walkers: m.dl.walkers, excluded: m.dl.excluded, source: m.dl.source || 'requested', ...patch });
      if (act === 'walkers') await set({ walkers: Number(a.dataset.n) });
      else if (act === 'source') await set({ source: a.dataset.s });
      else if (act === 'exclude') await set({ excluded: [...new Set([...m.dl.excluded, a.dataset.bay])] });
      else if (act === 'include') await set({ excluded: m.dl.excluded.filter(b => locKey(b) !== locKey(a.dataset.bay)) });
      else if (act === 'verify') { if (!m.snap) return; const on = !!m.done({ kc: a.dataset.kc, loc: a.dataset.loc }); await send(ctx, 'soh.verify', { date: m.snap.date, keycode: a.dataset.kc }, { loc: a.dataset.loc, done: !on }); }
      else if (act === 'print') printWalkSheets(m);
    });
    const repaint = () => { if (ctx.isMobile) { const h = $('#dlmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    return [ctx.store.on('daylist', repaint), ctx.store.on('backfill', repaint), ctx.store.on('soh', repaint)];
  },
};
function mobile(ctx) {
  const repaint = () => { const h = document.querySelector('#dlmob'); if (h) h.innerHTML = mobile(ctx); };
  const m = model(ctx, repaint);
  ensureNames(ctx, m.active.flatMap(x => x.checks.map(c => c.kc)), repaint);
  return mhead(tx('Day list'), `${tx('{locs} locations · {checks} checks', { locs: m.active.length, checks: m.nChecks })}${m.snap ? ` · ${tx('{n} verified', { n: m.nDone })}` : ''}`) +
    (m.active.length ? m.walkers.map((w, i) => `<div class="mv-sec">${tx('Walker {w}', { w: letter(i) })} · ${w.length ? `${esc(w[0].loc)} – ${esc(w[w.length - 1].loc)}` : ''}</div>${w.map(x => `<div class="sri-stop m"><div class="sri-stop-h"><b class="mono">${esc(x.loc)}</b>${status(x, m.done)}<span class="btn sm" data-go="bfreview" data-bay="${esc(x.bay)}">${tx('Start')}</span></div>${x.checks.map(c => taskRow(c, m.done)).join('')}</div>`).join('')}`).join('') : `<div class="mv-note">${ic('layers')}${tx('Nothing posted yet. Scanning a bay that is not here still works.')}</div>`) +
    `<div class="mv-note">${ic('layers')}${tx('In today’s day list order. Tick a count once it is done.')}</div>`;
}

// The triage sheets: one page per walker, each stop with its counts (bay,
// barcode, name and last arrival, SOH in its band, cartons, weeks flat, a
// count box and a rack tick); then the SOH adjustment page for stock that
// reads zero or less, with the evidence.
function printWalkSheets(m) {
  const flat = c => `${tx('{n}w', { n: c.flat })}${c.latest <= 0 ? ' @0' : ''}${c.recount ? ' · RECOUNT' : ''}`;
  const page = (stops, i) => `<div class="${i ? 'ps-page' : ''}">` + section(txn(stops.length, 'Walker {w} · {n} stop · {checks} checks', 'Walker {w} · {n} stops · {checks} checks', { w: letter(i), checks: stops.reduce((n, x) => n + x.checks.length, 0) }),
    table(['#', tx('Bay'), tx('Item'), tx('Product'), 'SOH', tx('Ctn'), tx('Flat'), tx('Count'), tx('Rack')], stops.flatMap((x, n) => x.checks.length ? x.checks.map((c, j) => [j ? '' : String(n + 1), j ? '' : `<b>${esc(x.loc)}</b><br><small>${esc(x.kind)}</small>`, code(c.kc, { height: 30 }), `${esc(nameOf(c.kc) || c.name || '')}<br><small>${esc(tx(TASK[c.cls]))}${c.lastArrival?.date ? ` · ${tx('landed {date}', { date: esc(c.lastArrival.date) })}` : ''}</small>`, `<b class="ps-band ${sohBand(c.latest, c.ctn)}">${c.latest}</b>`, c.ctn ? tx('{n}/CTN', { n: c.ctn }) : '', flat(c), '<span class="ps-box"></span>', tick]) : [[String(n + 1), `<b>${esc(x.loc)}</b>`, '', `<small>${tx('Visit / pull only')}</small>`, '', '', '', '', tick]]), ['n', '', 'bc', '', 'n', 'n', '', 'w', 't'])) + '</div>';
  const red = m.active.flatMap(x => x.checks.filter(c => sohBand(c.latest, c.ctn) === 'r'));
  const evidence = c => [txn(c.flat, 'SOH {soh} unchanged across {n} snapshot', 'SOH {soh} unchanged across {n} snapshots', { soh: c.latest }), c.lastArrival?.date ? (c.lastArrival.units ? tx('last landed {date} ×{units}', { date: c.lastArrival.date, units: c.lastArrival.units }) : tx('last landed {date}', { date: c.lastArrival.date })) : '', c.arrivalSince ? tx('stock arrived since') : '', c.ctn ? tx('profile {ctn}/ctn', { ctn: c.ctn }) : '', c.recount ? tx('re-cartoned recently') : ''].filter(Boolean).join(' · ');
  const adj = red.length ? `<div class="ps-page">${section(txn(red.length, 'SOH adjustment · {n} line reading zero or less', 'SOH adjustment · {n} lines reading zero or less'), table([tx('Bay'), tx('Item'), tx('Product'), tx('Evidence'), tx('Counted'), tx('Adjusted')], red.map(c => [esc(c.loc), code(c.kc, { height: 30 }), esc(nameOf(c.kc) || c.name || ''), `<small>${esc(evidence(c))}</small>`, '<span class="ps-box"></span>', tick]), ['', 'bc', '', '', 'w', 't']))}</div>` : '';
  printSheet({ title: tx('Day list · {date}', { date: m.date }), subtitle: [txn(m.walkers.length, '{locs} locations · {checks} checks across {n} walker', '{locs} locations · {checks} checks across {n} walkers', { locs: m.active.length, checks: m.nChecks }), m.snap ? tx('from the {date} snapshot', { date: m.snap.date }) : '', m.dl.excluded.length ? tx('{n} left out', { n: m.dl.excluded.length }) : ''].filter(Boolean).join(' · '), body: m.walkers.map(page).join('') + adj });
}
