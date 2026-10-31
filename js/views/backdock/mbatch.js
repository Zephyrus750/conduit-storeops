// Several manifests at once: the reports of a day or two that were missed,
// or a pile from before the dock used Conduit. One table to check them,
// each with the day and truck it came on, then every chosen one publishes
// to the library and its day goes on file (manifest.day). The same table
// dates reports already published with no day yet.
//
//   publishMany(ctx, files, known)  known: manNo → { publishedAt } (the library) → [manNo published] | null
//   dateMany(ctx, list)             list: [{ manNo, despatch, consols, totalCartons }] → number dated | null
//
// A day is suggested from the Planner: a truck the dock ran or planned with
// no manifest near the despatch date, else the despatch date plus the gap
// this store's trucks usually show (shared/manifeststats.js). Any of them
// can be changed or cleared; a report already on a truck or staged on a
// slot keeps that, and says so.

import { ic, esc, toast, today } from '../../ui.js';
import { tx, txn, locale } from '../../i18n.js';
import { readManifestFile, publishParsed, STD_MINS_PER_CARTON } from './common.js';
import { manifestCheck } from '../../../shared/manifest.js';
import { placeIndex, usualGap, suggestPlace, despatchDay } from '../../../shared/manifeststats.js';

const VIA = { plan: tx('from the Planner'), label: tx('set by hand') };
const stateOf = ctx => ({ dock: ctx.store.get('dock'), plan: ctx.store.get('plan') || { days: {} } });
const dayText = d => new Date(d + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
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
    const bad = r.checks.filter(c => c.level === 'bad'), warn = r.checks.filter(c => c.level === 'warn'), tip = r.checks.map(c => tx(c.text)).join('\n');
    return bad.length ? `<span class="mb-chk bad" title="${esc(tip)}">⛔ ${esc(tx(bad[0].text))}</span>` : warn.length ? `<span class="mb-chk warn" title="${esc(tip)}">⚠ ${txn(warn.length, '{n} to look at', '{n} to look at')}</span>` : `<span class="mb-chk ok">✓ ${tx('All read')}</span>`;
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
    const el = document.createElement('div'); el.id = 'mbatch'; el.className = 'sscan mprev mbatch'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    document.body.appendChild(el);
    let busy = false, finished = false, result = null;
    const done = v => { document.removeEventListener('keydown', onKey); el.remove(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && !busy) done(result); };
    document.addEventListener('keydown', onKey);
    const paint = () => {
      const n = rows.filter(r => r.on && !r.done).length, dated = rows.filter(r => r.on && r.day && !r.fixed).length;
      el.innerHTML = `<div class="ss-card mp-card mb-card"><div class="ss-top"><b>${ic('file')}${esc(title)}</b><span class="ss-exp">${esc(sub)}</span><button class="ibtn" data-mb="close" aria-label="${tx('Close')}"${busy ? ' disabled' : ''}>${ic('x')}</button></div>` +
        `<div class="mb-body">${table(rows.map(r => ({ ...r, gap })), { files })}<p class="lbl">${txn(gap, 'A suggested day is a truck the Planner or Receiving has with no manifest near the despatch date; otherwise the despatch date plus {n} day, as this store’s trucks usually take. Change any of them, or clear one to leave it without a day.', 'A suggested day is a truck the Planner or Receiving has with no manifest near the despatch date; otherwise the despatch date plus {n} days, as this store’s trucks usually take. Change any of them, or clear one to leave it without a day.')}</p></div>` +
        `<div class="mb-foot"><span class="cs-dim">${finished ? tx('Finished. Close when you have checked the list.') : txn(dated, '{n} with a day', '{n} with a day')}</span>${finished ? `<button class="btn primary" data-mb="close">${tx('Close')}</button>` : `<button class="btn primary" data-mb="go"${!n || busy ? ' disabled' : ''}>${busy ? tx('Working…') : button(n)}</button><button class="btn" data-mb="close"${busy ? ' disabled' : ''}>${tx('Cancel')}</button>`}</div></div>`;
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

