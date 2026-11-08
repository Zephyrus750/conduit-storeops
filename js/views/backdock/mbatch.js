// Several manifests at once: the reports of a day or two that were missed,
// or a pile from before the dock used Conduit. One table to check them,
// each with the day and truck it came on, then every chosen one publishes
// to the library and its day goes on file (manifest.day). The same table
// dates reports already published with no day yet.
//
//   publishMany(ctx, files, known)  known: manNo → { publishedAt } (the library) → [manNo published] | null
//   dateMany(ctx, list)             list: [{ manNo, despatch, consols, totalCartons }] → number dated | null
//   checkText(text)                 one of shared/manifest.js's checks in this device's language
//
// A day is suggested from the Planner: a truck the dock ran or planned with
// no manifest near the despatch date, else the despatch date plus the gap
// this store's trucks usually show (shared/manifeststats.js). Any of them
// can be changed or cleared; a report already on a truck or staged on a
// slot keeps that, and says so.

import { ic, esc, toast, today, fmtDay } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { openSheet } from '../../sheet.js';
import { readManifestFile, publishParsed, STD_MINS_PER_CARTON } from './common.js';
import { manifestCheck } from '../../../shared/manifest.js';
import { placeIndex, usualGap, suggestPlace, despatchDay } from '../../../shared/manifeststats.js';

const VIA = { plan: tx('from the Planner'), label: tx('set by hand') };

// The checks' words, here and in the upload preview (mpreview.js). shared/manifest.js
// writes them in English with their counts (it runs on the worker too); each is read
// back here and said in this device's language. A fixed one is its own key
// (test/unit/i18n-keys/dock1.json); one that matches nothing shows as written.
const CHECKS = [
  [/^Every row read \((\d+) lines\)\.$/, m => tx('Every row read ({n} lines).', { n: m[1] })],
  [/^Every row read\.$/, () => tx('Every row read.')],
  [/^This report is for store (.+?), not (.+?)\. Check you saved the right email attachment\.$/, m => tx('This report is for store {store}, not {ours}. Check you saved the right email attachment.', { store: m[1], ours: m[2] })],
  [/^(\d+) consolidations: a manifest takes up to (\d+)\. Split the report\.$/, m => tx('{n} consolidations: a manifest takes up to {max}. Split the report.', { n: m[1], max: m[2] })],
  [/^(\d+) rows? had (?:its|the) consolidation stored as a number /, m => txn(Number(m[1]), '{n} row had its consolidation stored as a number (Excel rounds those) and was left out. Format the column as Text and re-export to keep them.', '{n} rows had the consolidation stored as a number (Excel rounds those) and were left out. Format the column as Text and re-export to keep them.')],
  [/^(\d+) rows? had no readable keycode /, m => txn(Number(m[1]), '{n} row had no readable keycode and was left out.', '{n} rows had no readable keycode and were left out.')],
  [/^(\d+) rows? looked like data but matched no layout/, m => txn(Number(m[1]), '{n} row looked like data but matched no layout, and was left out.', '{n} rows looked like data but matched no layout, and were left out.')],
  [/^(\d+) consolidations? (?:has|have) more than (\d+) lines/, m => txn(Number(m[1]), '{n} consolidation has more than {max} lines; the first {max} of each are kept.', '{n} consolidations have more than {max} lines; the first {max} of each are kept.', { max: m[2] })],
  [/^(\d+) consolidations? with no cartons \((.*)\)\.$/, m => txn(Number(m[1]), '{n} consolidation with no cartons ({ids}).', '{n} consolidations with no cartons ({ids}).', { ids: m[2] })],
  [/^(\d+) pallet label ids? (?:is|are) shared by two consolidations \((.*?)\): /, m => txn(Number(m[1]), '{n} pallet label id is shared by two consolidations ({ids}): a scan of it matches the first.', '{n} pallet label ids are shared by two consolidations ({ids}): a scan of them matches the first.', { ids: m[2] })],
  [/^(\d+) lines? without a department\.$/, m => txn(Number(m[1]), '{n} line without a department.', '{n} lines without a department.')],
  [/^(\d+) rows? (?:was|were) skipped: /, m => txn(Number(m[1]), '{n} row was skipped: the consolidation is not a 9 to 22 digit number.', '{n} rows were skipped: the consolidation is not a 9 to 22 digit number.')],
  [/^Manifest (.+?) is already published \((.*?)\) and attached to Truck (\S+): /, m => tx('Manifest {man} is already published ({date}) and attached to Truck {no}: publishing replaces the library copy; the truck keeps the copy it has.', { man: m[1], date: m[2], no: m[3] })],
  [/^Manifest (.+?) is already published \((.*?)\): /, m => tx('Manifest {man} is already published ({date}): publishing replaces the library copy.', { man: m[1], date: m[2] })],
  [/^Despatched (.+?), (\d+) days ago: is this an old report\?$/, m => tx('Despatched {date}, {n} days ago: is this an old report?', { date: m[1], n: m[2] })],
  [/^Despatch date (.+?) is (\d+) days ahead\.$/, m => tx('Despatch date {date} is {n} days ahead.', { date: m[1], n: m[2] })],
];
export function checkText(text) {
  for (const [re, say] of CHECKS) { const m = re.exec(text); if (m) return say(m); }
  return tx(text);
}

const stateOf = ctx => ({ dock: ctx.store.get('dock'), plan: ctx.store.get('plan') || { days: {} } });
const dayText = d => fmtDay(d);
// Where a report already is, when the dock placed it: on a truck, finalised, or staged.
const fixedText = p => p.via === 'plan' ? tx('Planned for Truck {no} · {day}', { no: p.truck, day: dayText(p.day) }) : tx('On Truck {no} · {day}', { no: p.truck, day: dayText(p.day) });

// Suggested days, in despatch order so two reports never share a truck.
function suggest(ctx, rows) {
  const s = stateOf(ctx), places = placeIndex(s), gap = usualGap(s), taken = new Set();
  for (const r of rows.slice().sort((a, b) => (despatchDay(a.despatch) || '9').localeCompare(despatchDay(b.despatch) || '9'))) {
    const p = r.manNo && places.get(r.manNo);
    if (p && p.via !== 'label') { r.fixed = p; continue; }
    if (p) { r.day = p.day; r.truck = p.truck; r.via = 'label'; }
    else { const g = suggestPlace(s, r, taken, { places, gap, today: today() }); if (g) { r.day = g.day; r.truck = g.truck; r.via = g.via; } }
    if (r.day && r.truck) taken.add(`${r.day}-T${r.truck}`);
  }
  return gap;
}

function table(rows, { files }) {
  const truckSel = r => `<select class="ad-in mb-tn" data-row="${r.i}" data-f="truck"${r.busy ? ' disabled' : ''}><option value="">${tx('Truck —')}</option>${[1, 2, 3, 4].map(n => `<option value="${n}"${r.truck === n ? ' selected' : ''}>${tx('Truck {no}', { no: n })}</option>`).join('')}</select>`;
  const came = r => r.fixed ? `<span class="status good">${esc(fixedText(r.fixed))}</span>`
    : `<span class="mb-came"><input type="date" class="ad-in" data-row="${r.i}" data-f="day" value="${esc(r.day || '')}" max="${esc(today())}"${r.busy ? ' disabled' : ''}>${truckSel(r)}</span><small class="cs-dim">${r.day ? esc(r.via === 'despatch' ? txn(r.gap, 'despatch + {n} day', 'despatch + {n} days') : VIA[r.via] || '') : tx('no day: it stays under No day yet')}</small>`;
  const checks = r => {
    if (r.error) return `<span class="mb-chk bad" title="${esc(r.error)}">⛔ ${esc(r.error)}</span>`;
    if (!r.checks) return '';
    const bad = r.checks.filter(c => c.level === 'bad'), warn = r.checks.filter(c => c.level === 'warn'), tip = r.checks.map(c => checkText(c.text)).join('\n');
    return bad.length ? `<span class="mb-chk bad" title="${esc(tip)}">⛔ ${esc(checkText(bad[0].text))}</span>` : warn.length ? `<span class="mb-chk warn" title="${esc(tip)}">⚠ ${txn(warn.length, '{n} to look at', '{n} to look at')}</span>` : `<span class="mb-chk ok">✓ ${tx('All read')}</span>`;
  };
  const state = r => r.done ? `<span class="status good">${ic('check')}${tx('Done')}</span>` : r.failed ? `<span class="status bad" title="${esc(r.failed)}">${esc(r.failed)}</span>` : r.busy ? `<span class="cs-dim">${tx('Publishing…')}</span>` : '';
  const head = `<tr><th></th>${files ? `<th>${tx('File')}</th>` : ''}<th>${tx('Manifest')}</th><th>${tx('Despatch')}</th><th class="n">${tx('Consols')}</th><th class="n">${tx('Cartons')}</th>${files ? `<th>${tx('Checks')}</th>` : ''}<th>${tx('Came on')}</th><th></th></tr>`;
  const body = rows.map(r => `<tr class="${r.on ? '' : 'off'}"><td><input type="checkbox" data-row="${r.i}" data-f="on"${r.on ? ' checked' : ''}${r.lock || r.busy || r.done ? ' disabled' : ''} aria-label="${tx('Include {man}', { man: esc(r.manNo || r.name || '') })}"></td>` +
    (files ? `<td class="mb-file" title="${esc(r.name)}">${esc(r.name)}</td>` : '') +
    `<td>${r.askNo ? `<input class="ad-in mono mb-no" data-row="${r.i}" data-f="manNo" value="${esc(r.manNo)}" maxlength="20" placeholder="${tx('Manifest number')}">` : `<b class="mono">${esc(r.manNo || '—')}</b>`}</td>` +
    `<td>${esc(r.despatch || '—')}</td><td class="n">${r.consols ?? '–'}</td><td class="n">${r.cartons != null ? r.cartons.toLocaleString() : '–'}</td>` +
    (files ? `<td>${checks(r)}</td>` : '') + `<td>${r.error ? '' : came(r)}</td><td>${state(r)}</td></tr>`).join('');
  return `<table class="wb-t mb-t"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// One dialog for both: rows, what the button says, and what it does to a row.
function dialog(ctx, { title, sub, rows, files, button, run, gap }) {
  return new Promise(resolve => {
    document.getElementById('mbatch')?.remove();
    let busy = false, finished = false, result = null, settled = false;
    const done = v => { if (settled) return; settled = true; sheet.close(); resolve(v); };
    const sheet = openSheet({ size: 'wide', cls: 'mprev mbatch', title: `${ic('file')}${esc(title)}`, label: title, sub: esc(sub), onClose: () => done(result) });
    const el = sheet.el; el.id = 'mbatch';
    const paint = () => {
      const n = rows.filter(r => r.on && !r.done).length, dated = rows.filter(r => r.on && r.day && !r.fixed).length;
      sheet.busy(busy);
      sheet.set({ body:
        `<div class="mb-body">${table(rows.map(r => ({ ...r, gap })), { files })}<p class="lbl">${txn(gap, 'A suggested day is a truck the Planner or Receiving has with no manifest near the despatch date; otherwise the despatch date plus {n} day, as this store’s trucks usually take. Change any of them, or clear one to leave it without a day.', 'A suggested day is a truck the Planner or Receiving has with no manifest near the despatch date; otherwise the despatch date plus {n} days, as this store’s trucks usually take. Change any of them, or clear one to leave it without a day.')}</p></div>` +
        '', foot: `<span class="sht-note">${finished ? tx('Finished. Close when you have checked the list.') : txn(dated, '{n} with a day', '{n} with a day')}</span>${finished ? `<button class="btn primary" data-mb="close">${tx('Close')}</button>` : `<button class="btn" data-mb="close"${busy ? ' disabled' : ''}>${tx('Cancel')}</button><button class="btn primary" data-mb="go"${!n || busy ? ' disabled' : ''}>${busy ? tx('Working…') : button(n)}</button>`}` });
    };
    el.addEventListener('change', e => {
      const r = rows[Number(e.target.dataset.row)], f = e.target.dataset.f; if (!r || !f) return;
      if (f === 'on') r.on = e.target.checked;
      else if (f === 'day') { r.day = e.target.value || null; r.via = 'label'; if (!r.day) r.truck = null; }
      else if (f === 'truck') { r.truck = e.target.value ? Number(e.target.value) : null; r.via = 'label'; }
      paint();
    });
    el.addEventListener('input', e => {
      if (e.target.dataset.f !== 'manNo') return;
      const r = rows[Number(e.target.dataset.row)], pos = e.target.selectionStart; r.manNo = e.target.value.trim(); r.on = /^[\w-]{1,20}$/.test(r.manNo) && !r.lock;
      paint(); const i = el.querySelector(`[data-row="${r.i}"][data-f="manNo"]`); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
    });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-mb]'); if (!b || busy) return;
      if (b.dataset.mb === 'close') return done(result);
      busy = true; paint();
      const out = [];
      for (const r of rows.filter(r => r.on && !r.done)) {
        r.busy = true; paint();
        try { await run(r); r.done = true; out.push(r.manNo); } catch (err) { r.failed = err.message; }
        r.busy = false; paint();
      }
      busy = false; finished = true; result = out; paint();
      const failed = rows.filter(r => r.failed).length;
      toast(failed ? tx('{ok} done, {bad} did not go: see the list', { ok: out.length, bad: failed }) : txn(out.length, '{n} manifest done', '{n} manifests done'), failed ? 'bad' : '');
    });
    paint();
  });
}

// Sends the day only when it changes what the dock has on file.
async function fileDay(ctx, r) {
  if (r.fixed) return;
  const cur = ctx.store.get('dock').manifestDays?.[r.manNo];
  if ((cur?.day || null) === (r.day || null) && (cur?.truck ?? null) === (r.truck ?? null)) return;
  await ctx.store.dispatch({ type: 'manifest.day', entity: { manNo: r.manNo }, payload: { day: r.day || null, truck: r.day ? r.truck ?? null : null } });
}

export async function publishMany(ctx, files, known = {}) {
  const rows = files.map((f, i) => ({ i, name: f.name, file: f, on: false, lock: true, manNo: '', despatch: '' }));
  // Read every file first: the table only opens once each one has an answer.
  toast(tx('Reading {n} files…', { n: files.length }));
  for (const r of rows) {
    try {
      const p = await readManifestFile(r.file), chk = manifestCheck(p, { storeNo: ctx.storeNo, index: known, today: today(), mpc: STD_MINS_PER_CARTON });
      Object.assign(r, { parsed: p, manNo: String(p.manNo || '').trim(), despatch: p.despatch || '', consols: chk.stats.consols, cartons: chk.stats.cartons, checks: chk.checks, lock: chk.blocking });
      r.askNo = !/^[\w-]{1,20}$/.test(r.manNo); r.on = !chk.blocking && !r.askNo;
    } catch (e) { r.error = e.message; }
  }
  // The same report twice: the second waits.
  const seen = new Map(); for (const r of rows) if (r.manNo && !r.error) { if (seen.has(r.manNo)) { r.on = false; r.lock = true; r.error = tx('Same manifest as {file}', { file: seen.get(r.manNo) }); } else seen.set(r.manNo, r.name); }
  const gap = suggest(ctx, rows.filter(r => !r.error));
  return dialog(ctx, {
    title: txn(files.length, 'Publish {n} manifest', 'Publish {n} manifests'), sub: tx('Each goes to the library with the day and truck it came on.'), rows, files: true, gap,
    button: n => txn(n, 'Publish {n} manifest', 'Publish {n} manifests'),
    run: async r => {
      if (!/^[\w-]{1,20}$/.test(r.manNo)) throw new Error(tx('a manifest needs a number: 1 to 20 letters, digits or dashes'));
      await publishParsed(ctx, r.parsed, { filename: r.name, manNo: r.manNo });
      await fileDay(ctx, r);
    },
  });
}

export async function dateMany(ctx, list) {
  const rows = list.map((m, i) => ({ i, manNo: m.manNo, despatch: m.despatch || '', consols: m.consols, cartons: m.totalCartons, on: true }));
  const gap = suggest(ctx, rows);
  for (const r of rows) r.on = !!r.day && !r.fixed;
  const out = await dialog(ctx, {
    title: txn(rows.length, 'Give {n} manifest its day', 'Give {n} manifests their days'), sub: tx('Suggested from the Planner and the despatch dates: check them, then save.'), rows, files: false, gap,
    button: n => txn(n, 'Save {n} day', 'Save {n} days'),
    run: r => fileDay(ctx, r),
  });
  return out ? out.length : null;
}

