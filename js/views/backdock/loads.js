// Loads, the off-site register's import and paint on the map: the parts of
// the old Inventory hub (ShelfSearcher's Inventory mode) that the Back dock's
// screens share since it moved there (23 Oct 2026).
//   Off-site pallets  the register and the off-site master list import
//   Manifests         other loads (any sheet of pallets and keycodes), and
//                     a manifest's or a load's departments painted on the map
//   Analytics         what arrived each week, painted on the map
// The register and loads are store events (inventory.*), so every desk sees
// them, as before.

import { $, $$, ic, esc, toast, fmtDate, today, dep } from '../../ui.js';
import { MICRO } from '../../data/micros.js';
import { loadXLSX } from './common.js';
import { parseManifestSheets } from '../../../shared/manifest.js';
import { readOffsiteSheets, guessColumns, readGeneric, consolidate, heatBands, HEAT, isFixture, COLUMN_NAMES, LOAD_STATUS } from '../../../shared/inventory.js';
import { ulid } from '../../../shared/ulid.js';
import { tx, txn } from '../../i18n.js';

// 3-digit department code → { sub, name } from the label-integrity table.
const CODE = new Map(); for (const [subId, list] of Object.entries(MICRO)) for (const entry of list) if (!CODE.has(entry.slice(0, 3))) CODE.set(entry.slice(0, 3), { sub: subId, name: entry.slice(4) });
export const codeName = c => CODE.get(c)?.name || (c === '???' || c === '?' ? tx('No department') : tx('Department {code}', { code: c }));
export const knownCode = c => CODE.has(c);
export const LOAD_STATUS_NAME = { incoming: [tx('Incoming'), '#B45309'], received: [tx('Received'), '#15803D'], offsite: [tx('Off-site'), '#C2410C'] };
export const statusPill = s => `<span class="inv-st" style="--c:${LOAD_STATUS_NAME[s]?.[1] || '#64748B'}">${LOAD_STATUS_NAME[s]?.[0] || esc(s)}</span>`;
export const units = n => Number(n || 0).toLocaleString('en-AU');
export const loadUnits = l => (l.pallets || []).reduce((n, p) => n + p.items.reduce((k, i) => k + (Number(i.q) || 0), 0), 0);
export const loadLines = l => (l.pallets || []).reduce((n, p) => n + p.items.length, 0);
export const inv = ctx => ctx.store.get('inventory') || { offsite: {}, loads: {} };
export const loadsOf = ctx => Object.values(inv(ctx).loads || {}).sort((a, b) => (b.recvDate || b.date || '').localeCompare(a.recvDate || a.date || '') || (b.at || '').localeCompare(a.at || ''));
export const send = (ctx, type, entity, payload = {}) => ctx.store.dispatch({ type, entity, payload });

// ── Paint on the map ────────────────────────────────────────────────────
// paint: { mode: 'dept', code } one department, or { mode: 'heat', label,
// units: [[code, n]] } a whole load (or a period's arrivals) as heat.
// The shelves a department code paints: the ones Label integrity assigned
// to its micro-department, else every shelf of its sub-department (dashed).
export function shelvesFor(ctx, code) {
  const info = CODE.get(code); if (!info) return { exact: [], sub: null };
  const assign = ctx.store.get('labels')?.assign || {};
  return { exact: assign[`${info.sub}-${code}`] || [], sub: info.sub };
}
export const paintLabel = p => !p ? tx('pick a department or Whole load') : p.mode === 'heat' ? tx('Heat: {label}', { label: esc(p.label) }) : `${esc(p.code)} ${esc(codeName(p.code))}`;
const paintKey = p => p?.mode === 'heat' ? `<span>${tx('light')}</span>${HEAT.map(c => `<i style="background:${c}"></i>`).join('')}<span>${tx('heavy')}</span>` : p ? `<span><i class="hi"></i>${tx('assigned shelves')}</span><span><i class="sub"></i>${tx('the department’s sub-department (no shelves assigned)')}</span>` : '';
export function mapCard(paint, hasMap) {
  return `<div class="card inv-mapcard"><div class="ch"><h3>${tx('On the map')}</h3><span class="cs-dim" id="invPaint">${paintLabel(paint)}</span><button class="btn sm" data-act="unpaint"${paint ? '' : ' hidden'}>${tx('Clear')}</button></div>` +
    (hasMap ? `<div class="mapbox"><div class="mapstage" id="mapstage"></div></div><div class="inv-heatkey">${paintKey(paint)}</div>` : `<p class="lbl">${tx('No map published.')}</p>`) + `</div>`;
}
// A new paint shown in place: the map, the card's label and key, and which
// department row and heat button are on. No re-render, so the page keeps its scroll.
export function showPaint(ctx, root, map, p) {
  paintMap(ctx, map, p);
  const lab = $('#invPaint', root); if (lab) lab.innerHTML = paintLabel(p);
  const key = $('.inv-heatkey', root); if (key) key.innerHTML = paintKey(p);
  const clear = $('[data-act="unpaint"]', root); if (clear) clear.hidden = !p;
  for (const b of $$('[data-act="paint"]', root)) b.classList.toggle('on', p?.mode === 'dept' && b.dataset.code === p.code);
  for (const b of $$('[data-act="heat"]', root)) b.classList.toggle('on', p?.mode === 'heat');
}
export function paintMap(ctx, map, p) {
  if (!map) return;
  const svg = map.svg; svg.classList.remove('inv-heat', 'inv-paint');
  for (const g of $$('.shelf-group[data-heat], .shelf-group[data-paint]', svg)) { g.removeAttribute('data-heat'); g.removeAttribute('data-paint'); }
  if (!p) return;
  if (p.mode === 'heat') {
    const subShelves = d => [...new Set($$(`.shelf-group[data-dept="${d}"]`, svg).map(g => g.getAttribute('data-shelf')).filter(Boolean))];
    const bands = heatBands(p.units, c => { const f = shelvesFor(ctx, c); return f.exact.length ? f.exact : f.sub ? subShelves(f.sub) : []; });
    for (const [shelf, b] of bands) for (const g of map.groups(shelf)) g.setAttribute('data-heat', b);
    svg.classList.add('inv-heat');
    return;
  }
  const { exact, sub: s } = shelvesFor(ctx, p.code);
  if (exact.length) for (const shelf of exact) for (const g of map.groups(shelf)) g.setAttribute('data-paint', 'hi');
  else if (s) for (const g of $$(`.shelf-group[data-dept="${s}"]`, svg)) g.setAttribute('data-paint', 'sub');
  svg.classList.add('inv-paint');
}
// Departments with no shelves to paint exactly, or not in the list at all.
export function paintNotes(ctx, codes) {
  const unassigned = codes.filter(c => CODE.has(c) && !shelvesFor(ctx, c).exact.length).length, unknown = codes.filter(c => !CODE.has(c)).length;
  return (unassigned ? `<p class="lbl">${txn(unassigned, '{n} department has no shelves assigned in Label integrity, so it spreads over the whole sub-department (dashed). Assign shelves there to paint them exactly.', '{n} departments have no shelves assigned in Label integrity, so they spread over the whole sub-department (dashed). Assign shelves there to paint them exactly.')}</p>` : '') +
    (unknown ? `<p class="lbl">${txn(unknown, '{n} department code is not in the micro-department list and is left off the map.', '{n} department codes are not in the micro-department list and are left off the map.')}</p>` : '');
}

// ── A load ──────────────────────────────────────────────────────────────
// Its status, size, departments (each paints on the map) and pallets.
export function loadDetail(ctx, l, paint) {
  const cons = consolidate(l.pallets), total = cons.reduce((n, c) => n + c[1], 0) || 1;
  const statusSeg = `<div class="seg inv-seg">${LOAD_STATUS.map(s => `<button class="${l.status === s ? 'on' : ''}" data-act="load-status" data-s="${s}">${LOAD_STATUS_NAME[s][0]}</button>`).join('')}</div>`;
  return `<div class="card"><div class="ch"><h3>${esc(l.label)}</h3>${statusSeg}<button class="btn sm ghost danger" data-act="load-remove" title="${tx('Remove this load')}">${ic('trash')}</button></div>` +
    `<div class="inv-facts"><span>${txn(l.pallets.length, '<b>{n}</b> pallet', '<b>{n}</b> pallets')}</span><span>${txn(loadLines(l), '<b>{n}</b> line', '<b>{n}</b> lines', { n: units(loadLines(l)) })}</span><span>${txn(total, '<b>{n}</b> unit', '<b>{n}</b> units', { n: units(total) })}</span><span>${txn(cons.length, '<b>{n}</b> department', '<b>{n}</b> departments')}</span>${l.recvDate ? `<span>${tx('received {date}', { date: esc(fmtDate(l.recvDate)) })}</span>` : l.date ? `<span>${esc(fmtDate(l.date))}</span>` : ''}</div>` +
    `<div class="inv-consh"><b>${tx('By department')}</b><button class="btn sm${paint?.mode === 'heat' ? ' on' : ''}" data-act="heat">${ic('layers')}${tx('Whole load heat')}</button></div>` +
    `<div class="inv-cons">${cons.slice(0, 40).map(([c, u, n]) => { const info = CODE.get(c); return `<button class="inv-crow${paint?.mode === 'dept' && paint.code === c ? ' on' : ''}" data-act="paint" data-code="${esc(c)}"><span class="cd">${esc(c)}</span><span class="nm">${esc(codeName(c))}${info ? ` ${dep(info.sub)}` : ''}</span><span class="bar"><i style="width:${Math.max(2, Math.round(u / total * 100))}%"></i></span><b>${units(u)}</b><small>${txn(n, '{n} line', '{n} lines')}</small></button>`; }).join('')}</div>` +
    paintNotes(ctx, cons.map(c => c[0])) +
    `<details class="inv-pallets"><summary>${tx('Pallets ({n})', { n: l.pallets.length })}</summary>${l.pallets.slice(0, 80).map(p => `<div class="inv-prow"><span class="pid">${esc(p.pid)}</span><span>${txn(p.items.length, '{n} line · {units} units', '{n} lines · {units} units', { units: units(p.items.reduce((n, i) => n + i.q, 0)) })}</span><span class="cs-dim">${esc([...new Set(p.items.map(i => i.dept).filter(Boolean))].slice(0, 4).join(' · '))}</span></div>`).join('')}${l.pallets.length > 80 ? `<p class="lbl">${tx('and {n} more', { n: l.pallets.length - 80 })}</p>` : ''}</details></div>`;
}
export const loadHeat = l => ({ mode: 'heat', label: l.label, units: consolidate(l.pallets).map(([c, u]) => [c, u]) });

// ── Import ──────────────────────────────────────────────────────────────
// A spreadsheet staged for a look before it is saved: the off-site master
// list, a DC manifest read as a load, or any sheet of pallets and keycodes
// with its columns mapped.
async function readFile(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false, raw: true });
  return wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
}
export async function stageFile(file) {
  let sheets; try { sheets = await readFile(file); } catch (e) { toast(tx('Couldn’t read {file}: {error}', { file: file.name, error: e.message }), 'bad'); return null; }
  const off = readOffsiteSheets(sheets);
  if (off.rows.length) return { kind: 'offsite', filename: file.name, rows: off.rows, diag: off.diag };
  const man = parseManifestSheets(sheets);
  if (man.kind === 'report' && man.consols?.length) {
    const pallets = man.consols.map(c => ({ pid: String(c.id), items: (c.items || []).map(i => ({ k: i.k, d: i.d || '', q: i.q, dept: i.dept || '' })) })).filter(p => p.items.length);
    if (pallets.length) return { kind: 'load', filename: file.name, label: `Manifest ${man.manNo || file.name.replace(/\.\w+$/, '')}`, date: /^\d{4}-\d{2}-\d{2}$/.test(man.despatch || '') ? man.despatch : today(), pallets, note: txn(man.consols.length, '{n} consolidation read as a DC manifest', '{n} consolidations read as a DC manifest') };
  }
  const sh = sheets.find(s => (s.rows || []).some(r => r && r.some(c => c != null && String(c).trim()))); if (!sh) { toast(tx('{file} is empty', { file: file.name }), 'bad'); return null; }
  const hi = sh.rows.findIndex(r => r && r.filter(c => c != null && String(c).trim()).length >= 2);
  return { kind: 'generic', filename: file.name, header: sh.rows[hi].map(c => String(c ?? '').trim()), rows: sh.rows.slice(hi + 1).filter(r => r && r.some(c => c != null && String(c).trim())), map: guessColumns(sh.rows[hi]), label: file.name.replace(/\.\w+$/, ''), date: today() };
}
export function stagePanel(ctx, s) {
  if (!s) return '';
  const cnt = Object.keys(inv(ctx).offsite).length;
  if (s.kind === 'offsite') {
    const rec = s.rows.filter(r => r.rec).length;
    const fx = s.rows.filter(isFixture).length;
    const head = fx ? txn(s.rows.length, '{n} pallet read ({rec} already back, {fx} fixtures).', '{n} pallets read ({rec} already back, {fx} fixtures).', { rec, fx }) : txn(s.rows.length, '{n} pallet read ({rec} already back).', '{n} pallets read ({rec} already back).', { rec });
    return `<div class="card inv-stage"><div class="ch"><h3>${tx('Off-site master list · {file}', { file: esc(s.filename) })}</h3></div><p>${head} ${cnt ? txn(cnt, 'This replaces the register’s {n} pallet.', 'This replaces the register’s {n} pallets.') : ''}${s.diag ? ' ' + esc(tx(s.diag)) + '.' : ''}</p><div class="inv-prev">${s.rows.slice(0, 6).map(r => `<span><b>${esc(r.pid)}</b> ${esc(r.title || r.desc).slice(0, 40)}${r.cb ? ' · ' + tx('callback {date}', { date: esc(fmtDate(r.cb)) }) : ''}</span>`).join('')}</div><div class="acts2"><button class="btn primary sm" data-act="stage-save">${ic('check')}${cnt ? tx('Replace the register') : tx('Save the register')}</button><button class="btn sm" data-act="stage-cancel">${tx('Cancel')}</button></div></div>`;
  }
  const pallets = s.kind === 'load' ? s.pallets : readGeneric(s.rows, s.map).pallets, read = s.kind === 'generic' ? readGeneric(s.rows, s.map) : null;
  const mapper = s.kind === 'generic' ? `<div class="inv-map-cols">${Object.entries(COLUMN_NAMES).map(([f, label]) => `<label>${tx(label)}${f === 'pallet' || f === 'key' ? ' *' : ''}<select data-col="${f}"><option value="-1">—</option>${s.header.map((h, i) => `<option value="${i}"${s.map[f] === i ? ' selected' : ''}>${esc(h || tx('Column {n}', { n: i + 1 }))}</option>`).join('')}</select></label>`).join('')}</div>` : '';
  return `<div class="card inv-stage"><div class="ch"><h3>${tx('New load · {file}', { file: esc(s.filename) })}</h3></div>${s.note ? `<p class="lbl">${esc(s.note)}</p>` : ''}${mapper}` +
    `<p>${txn(pallets.length, '{n} pallet · {lines} lines', '{n} pallets · {lines} lines', { lines: units(pallets.reduce((n, p) => n + p.items.length, 0)) })}${read?.skipped ? ' · ' + txn(read.skipped, '{n} row skipped', '{n} rows skipped') : ''}${read?.diag ? ` · ${esc(tx(read.diag))}` : ''}</p>` +
    `<div class="inv-form"><label>${tx('Name')}<input data-stage="label" value="${esc(s.label)}" maxlength="60"></label><label>${tx('Date')}<input type="date" data-stage="date" value="${esc(s.date)}"></label><label>${tx('Status')}<select data-stage="status">${LOAD_STATUS.map(x => `<option value="${x}"${(s.status || 'incoming') === x ? ' selected' : ''}>${LOAD_STATUS_NAME[x][0]}</option>`).join('')}</select></label></div>` +
    `<div class="acts2"><button class="btn primary sm" data-act="stage-save"${pallets.length ? '' : ' disabled'}>${ic('check')}${tx('Add the load')}</button><button class="btn sm" data-act="stage-cancel">${tx('Cancel')}</button></div></div>`;
}
// Saves what was staged: the register, or a new load. Returns { kind, id }.
export async function saveStage(ctx, s) {
  if (s.kind === 'offsite') { await send(ctx, 'inventory.offsite.set', {}, { rows: s.rows, src: s.filename }); toast(txn(s.rows.length, 'Register saved: {n} pallet', 'Register saved: {n} pallets')); return { kind: 'offsite' }; }
  const pallets = s.kind === 'load' ? s.pallets : readGeneric(s.rows, s.map).pallets, id = ulid();
  await send(ctx, 'inventory.load.add', { load: id }, { label: s.label || s.filename, date: s.date, status: s.status || 'incoming', src: s.filename, pallets });
  toast(txn(pallets.length, 'Load added: {n} pallet', 'Load added: {n} pallets'));
  return { kind: 'load', id };
}
// The stage's own fields: a column chosen for a field, or the load's name, date and status.
export function stageChange(s, el) {
  const col = el.closest('[data-col]'); if (col) { s.map[col.dataset.col] = Number(col.value); return true; }
  const sf = el.closest('[data-stage]'); if (sf) s[sf.dataset.stage] = sf.value;
  return false;
}
