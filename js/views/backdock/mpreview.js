// The manifest upload preview: what the DC report reads as, before it goes
// to the library. The facts (manifest, store, DC, despatch), the size
// (consols, cartons, keycodes, units, estimated work, each with a note), the
// mix by group (Home, Clothing, Kids, Flex), the report itself in one of four
// views, and the checks from shared/manifest.js: rows left out, a report for
// another store, one already published, an old despatch date. A blocking
// check (wrong store, too many consolidations) disables Publish; the worker
// would refuse it anyway. From Manifests (dating), a report for a day already
// gone also takes the day and truck it came on (manifest.day), suggested as
// the batch upload does (mbatch.js).
//
// The views, one at a time (the device remembers which, and each list's
// sort): Departments, every micro-department by number and name with the
// department it sits in, each opening to its products; Products, every
// keycode on the report by units, cartons or consols, each opening to the
// consols it is on; Consolidations, each opening to its lines; Groups, Home,
// Clothing, Kids and Flex with their departments and micro-departments. The
// filter finds a keycode, product, department or pallet in the open view.
// Only the open view is painted, a list stops at 100 rows and a row's details
// at 20 (Show all), and a row opens on its own, so 500 consols stay quick.
//
// Products are the app's own (stockroom/common.js): the keycode copies, the
// name links to its kmart.com.au page (the site's search when the catalogue
// has none), a PC shows the product card on hover and a phone tap opens the
// product pop-up. The report's description stands in until the catalogue's
// name lands, and names are asked for only as their rows come into sight.
//
//   previewManifest(ctx, file, { attachTo, dating }) → { manNo, consols, totalCartons, attached } | null (cancelled)

import { ic, esc, toast, today, dep, fmtDay, empty } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { openSheet } from '../../sheet.js';
import { readManifestFile, publishParsed, attachManifest, manifestIndex, microDept, microName, truckNo, STD_MINS_PER_CARTON, todayKey } from './common.js';
import { ensureNames, nameOf, kcCopy, itemName } from '../stockroom/common.js';
import { SUBS } from '../../data/micros.js';
import { settingsOf } from '../../../shared/reducers/store.js';
import { manifestCheck } from '../../../shared/manifest.js';
import { placeIndex, suggestPlace, usualGap } from '../../../shared/manifeststats.js';
import { checkText } from './mbatch.js';

// The groups the explorer rolls up to, and each sub-department's code and name.
const GROUPS = [['h', 'Home', '#2563EB'], ['c', 'Clothing', '#DB2777'], ['k', 'Kids', '#F59E0B'], ['flex', 'Flex', '#64748B'], ['?', tx('Unknown'), '#94A3B8']];
const SUB = Object.fromEntries(SUBS.map(x => [x[0], x]));
const groupOf = code => { const d = microDept(code); return !d ? '?' : d === 'flex' ? 'flex' : d[0]; };
const colourOf = code => (GROUPS.find(g => g[0] === groupOf(code)) || GROUPS[4])[2];
const NO_DEPT = `<span class="dep" style="background:#94A3B8;color:#fff">?</span>`;
// A micro-department in words: its department's badge, its number and
// name, and (sub) that department's name beneath, "Bed, Bath, Laundry".
function micro(code, sub = true) {
  const c = String(code || '???'), sd = microDept(c), d = SUB[sd], name = microName(c);
  const badge = d ? dep(sd) : NO_DEPT;
  return `<span class="mp-mc">${badge}<span class="mp-mcn"><span><b class="mono">${esc(c)}</b> ${esc(name || tx('Unknown micro-department'))}</span>${sub ? `<small>${d ? esc(d[2]) : tx('Not in the department list')}</small>` : ''}</span></span>`;
}
// Every micro-department on the report: cartons as the report's mix counts
// them (a carton goes to the micro-department with most units in it, so
// they add up to the manifest's cartons), and units, keycodes, lines,
// consols and products from its lines.
function microRows(parsed) {
  const m = new Map(), get = d => { const k = String(d || '???'); if (!m.has(k)) m.set(k, { code: k, cartons: 0, units: 0, keys: new Set(), consols: new Set(), lines: 0, prods: new Map() }); return m.get(k); };
  for (const c of parsed.consols || []) {
    for (const [d, ctn] of c.mix?.length ? c.mix : [[c.dept || '???', c.cartons]]) { const r = get(d); r.cartons += Number(ctn) || 0; if (Number(ctn) > 0) r.consols.add(c.id); }
    for (const it of c.items || []) {
      const r = get(it.dept || (!c.mix?.length && c.dept) || '???'), q = Number(it.q) || 0; r.units += q; r.keys.add(it.k); r.lines++; r.consols.add(c.id);
      let p = r.prods.get(it.k); if (!p) r.prods.set(it.k, p = { k: it.k, d: it.d || '', units: 0, cartons: 0, n: 0 });
      p.units += q; p.cartons += Number(it.c) || 0; p.n++; if (!p.d && it.d) p.d = it.d;
    }
  }
  return [...m.values()].sort((a, b) => b.cartons - a.cartons || b.units - a.units);
}
// Every product on the report: its units and cartons, and each consol it is on.
function productRows(parsed) {
  const m = new Map();
  for (const c of parsed.consols || []) for (const it of c.items || []) {
    let r = m.get(it.k); if (!r) m.set(it.k, r = { k: it.k, d: it.d || '', dept: it.dept || '', units: 0, cartons: 0, on: [] });
    const q = Number(it.q) || 0, ct = Number(it.c) || 0; r.units += q; r.cartons += ct; r.on.push([c.id, q, ct]);
    if (!r.d && it.d) r.d = it.d; if (!r.dept && it.dept) r.dept = it.dept;
  }
  return [...m.values()].sort((a, b) => b.units - a.units);
}
// The groups, each with its departments (largest first) and theirs.
function groupRows(micros) {
  const subs = new Map(), add = (to, r) => { to.cartons += r.cartons; to.units += r.units; for (const k of r.keys) to.keys.add(k); for (const k of r.consols) to.consols.add(k); };
  const blank = x => ({ ...x, cartons: 0, units: 0, keys: new Set(), consols: new Set() });
  for (const r of micros) { const sd = microDept(r.code) || '?'; let s = subs.get(sd); if (!s) subs.set(sd, s = blank({ sd, g: groupOf(r.code), micros: [] })); add(s, r); s.micros.push(r); }
  return GROUPS.map(([g, name, colour]) => {
    const list = [...subs.values()].filter(s => s.g === g).sort((a, b) => b.cartons - a.cartons || b.units - a.units), x = blank({ g, name, colour, subs: list });
    for (const s of list) add(x, s);
    return x;
  }).filter(x => x.subs.length);
}
const consolUnits = c => (c.items || []).reduce((n, i) => n + (Number(i.q) || 0), 0);
const hm = m => tx('{h}h {m}m', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
const dur = m => m >= 60 ? hm(m) : tx('{m}m', { m });
const num = v => (Number(v) || 0).toLocaleString();
const low = s => String(s ?? '').toLowerCase();

const dayText = d => fmtDay(d);

// The views, their columns ([heading, sort key, class]; mp-lo leaves a phone)
// and what each sorts by. The device keeps the view and the sorts.
const VIEWS = [['depts', tx('Departments')], ['products', tx('Products')], ['consols', tx('Consolidations')], ['groups', tx('Groups')]];
const HEADS = {
  depts: [[tx('Micro-department')], [tx('Cartons'), 'cartons'], [tx('Share'), '', 'n mp-lo'], [tx('Units'), 'units', 'n'], [tx('Keycodes'), 'keycodes', 'n mp-lo'], [tx('Consols'), 'consols', 'n']],
  products: [[tx('Keycode')], [tx('Product')], [tx('Micro-department'), '', 'mp-lo'], [tx('Units'), 'units', 'n'], [tx('Cartons'), 'cartons', 'n'], [tx('Consols'), 'consols', 'n mp-lo']],
  consols: [[tx('Pallet id')], [tx('Cartons'), 'cartons', 'n'], [tx('Units'), 'units', 'n'], [tx('Micro-departments')], [tx('Lines'), 'lines', 'n mp-lo']],
};
const SORTS = {
  depts: { cartons: r => r.cartons, units: r => r.units, keycodes: r => r.keys.size, consols: r => r.consols.size },
  products: { units: r => r.units, cartons: r => r.cartons, consols: r => r.on.length },
  consols: { cartons: c => Number(c.cartons) || 0, units: consolUnits, lines: c => (c.items || []).length + (c.itemsCut || 0) },
};
const SORT0 = { depts: 'cartons', products: 'units', consols: 'cartons' };
const LIST_CAP = 100, DETAIL_CAP = 20, PICK = 'manifest_preview';
function loadPick() {
  let v = null; try { v = JSON.parse(localStorage.getItem(PICK) || 'null'); } catch {}
  const sort = {}; for (const k of Object.keys(SORT0)) { const s = v?.sort?.[k]; sort[k] = typeof s === 'string' && Object.hasOwn(SORTS[k], s) ? s : SORT0[k]; }
  return { view: VIEWS.some(x => x[0] === v?.view) ? v.view : 'depts', sort };
}
const savePick = p => { try { localStorage.setItem(PICK, JSON.stringify(p)); } catch {} };
// What the filter finds in each view: a department by its number, name or
// department, or by a product in it; a product by its keycode, name,
// description or micro-department; a consol by its pallet id or a line.
const hitItem = (k, d, q) => String(k).includes(q) || low(d).includes(q) || low(nameOf(k)).includes(q);
const HITS = {
  depts: (r, q) => r.code.includes(q) || low(microName(r.code)).includes(q) || low(microDept(r.code)).includes(q) || low(SUB[microDept(r.code)]?.[2]).includes(q) || [...r.prods.values()].some(p => hitItem(p.k, p.d, q)),
  products: (r, q) => hitItem(r.k, r.d, q) || String(r.dept).includes(q),
  consols: (c, q) => c.id.includes(q) || String(c.cons || '').includes(q) || (c.items || []).some(i => hitItem(i.k, i.d, q)),
};

export async function previewManifest(ctx, file, { attachTo = null, dating = false } = {}) {
  let parsed;
  try { parsed = await readManifestFile(file); }
  catch (e) { toast(tx('Could not read {file}: {error}', { file: file.name, error: e.message }), 'bad'); return null; }
  const dock = ctx.store.get('dock'), index = Object.fromEntries(manifestIndex(dock).map(m => [m.manNo, m]));
  const mpc = (attachTo && dock.trucks?.[attachTo]?.minsPerCarton) || settingsOf(ctx.store.get('settings')).minsPerCarton || STD_MINS_PER_CARTON;
  return new Promise(resolve => {
    document.getElementById('mprev')?.remove();
    const sheet = openSheet({ size: 'wide', cls: 'mprev', title: `${ic('file')}${tx('Check the report before publishing')}`, label: tx('Preview {file}', { file: file.name }),
      sub: `${esc(file.name)}${parsed.sheet ? ' · ' + tx('sheet “{name}”', { name: esc(parsed.sheet) }) : ''}`, onClose: () => done(null) });
    const el = sheet.el; el.id = 'mprev';
    let manNo = String(parsed.manNo || '').trim(), busy = false, came = null;
    // Where it came: a truck or slot the dock already has it on, a day on
    // file, or a suggestion for a day already gone (today's goes on its truck).
    const place = () => {
      if (!dating || attachTo || came?.touched) return;
      const s = { dock: ctx.store.get('dock'), plan: ctx.store.get('plan') || { days: {} } }, p = /^[\w-]{1,20}$/.test(manNo) ? placeIndex(s).get(manNo) : null;
      if (p && p.via !== 'label') { came = { fixed: p }; return; }
      const g = p || suggestPlace(s, { despatch: parsed.despatch }, undefined, { today: today() });
      came = g && (p || g.day < today()) ? { day: g.day, truck: g.truck, via: p ? 'label' : g.via, gap: usualGap(s) } : { day: '', truck: null, via: '' };
    };
    const cameHtml = () => {
      if (!came) return '';
      if (came.fixed) return `<div class="pt3">${tx('Came on')}</div><p class="lbl">${came.fixed.via === 'plan' ? tx('Planned for Truck {no} · {day}', { no: came.fixed.truck, day: esc(dayText(came.fixed.day)) }) : tx('On Truck {no} · {day}', { no: came.fixed.truck, day: esc(dayText(came.fixed.day)) })}</p>`;
      const why = came.via === 'plan' ? tx('from the Planner') : came.via === 'despatch' ? txn(came.gap, 'despatch + {n} day', 'despatch + {n} days') : came.via === 'label' ? tx('set by hand') : tx('For a report from a day already gone. Today’s goes on its truck at the Planner or Receiving.');
      return `<div class="pt3">${tx('Came on')}</div><div class="mb-came"><input type="date" class="ad-in" data-mp-field="day" value="${esc(came.day || '')}" max="${esc(today())}" aria-label="${tx('Day it came')}"><select class="ad-in" data-mp-field="truck" aria-label="${tx('Truck')}"><option value="">${tx('Truck —')}</option>${[1, 2, 3, 4].map(n => `<option value="${n}"${came.truck === n ? ' selected' : ''}>${tx('Truck {no}', { no: n })}</option>`).join('')}</select></div><small class="cs-dim">${esc(why)}</small>`;
    };
    place();

    // ── The views: worked out once each, painted only while open ──
    const pick = loadPick(), open = new Set(), full = new Set(), all = {};
    let q = '', qv = '', tot = 1, micros0 = null, prods0 = null, groups0 = null;   // q: the filter as it matches, qv: as typed
    const microsOf = () => micros0 ||= microRows(parsed), prodsOf = () => prods0 ||= productRows(parsed), groupsOf = () => groups0 ||= groupRows(microsOf());
    const listOf = v => v === 'depts' ? microsOf() : v === 'products' ? prodsOf() : parsed.consols || [];
    const rowsOf = v => { const f = SORTS[v][pick.sort[v]], list = listOf(v).filter(r => !q || HITS[v](r, q)); return f ? list.slice().sort((a, b) => f(b) - f(a)) : list; };
    const bar = (c, max, colour) => `<span class="mp-bar"><i><b style="width:${Math.round(c / max * 100)}%;background:${colour}"></b></i><span>${num(c)}</span></span>`;
    const chev = key => `<button type="button" class="mp-x" data-mpa="x" aria-expanded="${open.has(key)}" aria-label="${tx('Show the details')}">${ic('chev')}</button>`;
    const th = (v, [label, key, cls = '']) => {
      if (!key) return `<th${cls ? ` class="${cls}"` : ''}>${label}</th>`;
      const on = pick.sort[v] === key;
      return `<th class="${cls}" aria-sort="${on ? 'descending' : 'none'}"><button type="button" class="mp-sort${on ? ' on' : ''}" data-mpa="sort" data-k="${key}" title="${tx('Sort largest first')}">${label}${on ? ' ▼' : ''}</button></th>`;
    };
    // A product's name cell: the catalogue's name once it lands, else the report's description.
    const name = (k, d) => `<td class="mp-pd" data-mpn="${esc(k)}" data-d="${esc(d || '')}">${itemName(k, d || '')}</td>`;
    const hit = (k, d) => q && hitItem(k, d, q) ? ' class="hit"' : '';
    const more = (key, n, act = 'full') => `<button type="button" class="btn sm mp-more" data-mpa="${act}" data-key="${esc(key)}">${tx('Show all {n}', { n: num(n) })}</button>`;
    const mini = (heads, rows) => `<table class="mp-dt"><thead><tr>${heads.map(([l, c]) => `<th${c ? ` class="${c}"` : ''}>${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    // A row's details: a department's products, a product's consols, a consol's lines.
    function detail(key, cols) {
      const t = key[0], id = key.slice(2), cap = list => full.has(key) ? list : list.slice(0, DETAIL_CAP);
      let list, inner = '';
      if (t === 'd') {
        list = [...(microsOf().find(r => r.code === id)?.prods.values() || [])].sort((a, b) => b.units - a.units);
        inner = mini([[tx('Keycode')], [tx('Product')], [tx('Units'), 'n'], [tx('Cartons'), 'n'], [tx('Consols'), 'n mp-lo']],
          cap(list).map(p => `<tr${hit(p.k, p.d)}><td>${kcCopy(p.k)}</td>${name(p.k, p.d)}<td class="n">${num(p.units)}</td><td class="n">${p.cartons || '—'}</td><td class="n mp-lo">${p.n}</td></tr>`).join(''));
      } else if (t === 'p') {
        list = (prodsOf().find(r => String(r.k) === id)?.on || []).slice().sort((a, b) => b[1] - a[1]);
        inner = mini([[tx('Pallet id')], [tx('Units'), 'n'], [tx('Cartons'), 'n']],
          cap(list).map(([cid, u, ct]) => `<tr><td><button type="button" class="mp-go mono" data-mpa="consol" data-id="${esc(cid)}" title="${tx('Show it under Consolidations')}">${esc(cid)}</button></td><td class="n">${num(u)}</td><td class="n">${ct || '—'}</td></tr>`).join(''));
      } else {
        list = (parsed.consols || []).find(c => c.id === id)?.items || [];
        inner = mini([[tx('Keycode')], [tx('Product')], [tx('Micro-department'), 'mp-lo'], [tx('Units'), 'n'], [tx('Cartons'), 'n']],
          cap(list).map(it => `<tr${hit(it.k, it.d)}><td>${kcCopy(it.k)}</td>${name(it.k, it.d)}<td class="mp-lo">${micro(it.dept, false)}</td><td class="n">${num(it.q)}</td><td class="n">${it.c || '—'}</td></tr>`).join(''));
      }
      return `<tr class="mp-dr"><td colspan="${cols}"><div class="mp-dw">${inner}${list.length > DETAIL_CAP && !full.has(key) ? more(key, list.length) : ''}</div></td></tr>`;
    }
    const rowHtml = (v, r, dmax, cols) => {
      if (v === 'depts') {
        const key = `d:${r.code}`, o = open.has(key) && r.prods.size;
        return `<tr class="mp-r${o ? ' open' : ''}"${r.prods.size ? ` data-mpx="${esc(key)}"` : ''}><td><span class="mp-rh">${r.prods.size ? chev(key) : '<i class="mp-x0"></i>'}${micro(r.code)}</span></td><td>${bar(r.cartons, dmax, colourOf(r.code))}</td><td class="n mp-lo">${Math.round(r.cartons / tot * 100)}%</td><td class="n">${num(r.units)}</td><td class="n mp-lo">${num(r.keys.size)}</td><td class="n">${r.consols.size}</td></tr>` + (o ? detail(key, cols) : '');
      }
      if (v === 'products') {
        const key = `p:${r.k}`, o = open.has(key);
        return `<tr class="mp-r${o ? ' open' : ''}" data-mpx="${esc(key)}"><td><span class="mp-rh">${chev(key)}${kcCopy(r.k)}</span></td>${name(r.k, r.d)}<td class="mp-lo">${micro(r.dept, false)}</td><td class="n">${num(r.units)}</td><td class="n">${r.cartons || '—'}</td><td class="n mp-lo">${r.on.length}</td></tr>` + (o ? detail(key, cols) : '');
      }
      const key = `c:${r.id}`, n = (r.items || []).length, o = open.has(key) && n, mx = (r.mix || []).filter(m => m[1] > 0 || m[2] > 0);
      return `<tr class="mp-r${o ? ' open' : ''}"${n ? ` data-mpx="${esc(key)}"` : ''}><td class="mono"><span class="mp-rh">${n ? chev(key) : '<i class="mp-x0"></i>'}${esc(r.id)}</span></td><td class="n">${num(r.cartons)}</td><td class="n">${num(consolUnits(r))}</td>` +
        `<td><div class="mp-cm">${mx.slice(0, 3).map(m => `<span>${micro(m[0], false)}<small>${tx('{n} ctn', { n: m[1] })}</small></span>`).join('') || (r.dept ? micro(r.dept, false) : '—')}${mx.length > 3 ? `<small class="cs-dim">${tx('+{n} more', { n: mx.length - 3 })}</small>` : ''}</div></td><td class="n mp-lo">${n}${r.itemsCut ? `+${r.itemsCut}` : ''}</td></tr>` + (o ? detail(key, cols) : '');
    };
    function groupsHtml() {
      const cells = (x, colour) => `<td>${bar(x.cartons, tot, colour)}</td><td class="n mp-lo">${Math.round(x.cartons / tot * 100)}%</td><td class="n">${num(x.units)}</td><td class="n mp-lo">${num(x.keys.size)}</td><td class="n">${x.consols.size}</td>`;
      const chip = m => `<button type="button" class="mp-gm" data-mpa="micro" data-code="${esc(m.code)}" title="${tx('Show it under Departments')}"><b class="mono">${esc(m.code)}</b>${esc(microName(m.code) || tx('Unknown micro-department'))}<small>${tx('{n} ctn', { n: m.cartons })}</small></button>`;
      return `<div class="mp-tw"><table class="wb-t mp-t mp-groups"><thead><tr><th>${tx('Department')}</th><th>${tx('Cartons')}</th><th class="n mp-lo">${tx('Share')}</th><th class="n">${tx('Units')}</th><th class="n mp-lo">${tx('Keycodes')}</th><th class="n">${tx('Consols')}</th></tr></thead><tbody>` +
        groupsOf().map(g => `<tr class="mp-gh"><td><span class="mp-gn"><i style="background:${g.colour}"></i>${esc(g.name)}</span></td>${cells(g, g.colour)}</tr>` +
          g.subs.map(s => `<tr class="mp-gs"><td><span class="mp-gd">${SUB[s.sd] ? dep(s.sd) : NO_DEPT}<span>${SUB[s.sd] ? esc(SUB[s.sd][2]) : tx('Not in the department list')}</span></span><span class="mp-gms">${s.micros.map(chip).join('')}</span></td>${cells(s, g.colour)}</tr>`).join('')).join('') +
        `</tbody></table></div>`;
    }
    function viewHtml() {
      const v = pick.view;
      if (v === 'groups') return groupsHtml();
      if (v === 'products' && !prodsOf().length) return empty(tx('The manifest carries no lines.'), { sm: true, icon: 'box' });
      const rows = rowsOf(v), shown = all[v] ? rows : rows.slice(0, LIST_CAP), cols = HEADS[v].length, dmax = Math.max(1, ...microsOf().map(r => r.cartons));
      return `<div class="mp-tw"><table class="wb-t mp-t mp-${v}"><thead><tr>${HEADS[v].map(h => th(v, h)).join('')}</tr></thead><tbody>` +
        (shown.map(r => rowHtml(v, r, dmax, cols)).join('') || `<tr><td colspan="${cols}">${empty(tx('Nothing matches.'), { sm: true, icon: 'search' })}</td></tr>`) +
        `</tbody></table></div>${rows.length > shown.length ? more(v, rows.length, 'more') : ''}`;
    }
    const barHtml = () => {
      const count = { depts: microsOf().length, products: prodsOf().length, consols: (parsed.consols || []).length, groups: groupsOf().length };
      return `<div class="mp-vbar"><div class="seg mp-seg">${VIEWS.map(([k, l]) => `<button type="button" class="${pick.view === k ? 'on' : ''}" data-mpa="view" data-v="${k}" aria-pressed="${pick.view === k}">${l}<small>${num(count[k])}</small></button>`).join('')}</div>` +
        `<label class="search mp-q"${pick.view === 'groups' ? ' hidden' : ''}>${ic('search')}<input type="search" data-mp-field="q" value="${esc(qv)}" placeholder="${tx('find consol, keycode, product, dept…')}" aria-label="${tx('Search this manifest')}" autocomplete="off"></label></div>`;
    };
    // Names for the rows in sight (and 400 px either side), as they come into it.
    let io = null;
    const painted = new WeakMap();
    const refreshNames = () => { if (sheet.closed) return; for (const x of el.querySelectorAll('[data-mpn]')) { const h = itemName(x.dataset.mpn, x.dataset.d); if (painted.get(x) !== h) { painted.set(x, h); x.innerHTML = h; } } };
    const watchNames = (fresh = false) => {
      const cells = [...el.querySelectorAll('[data-mpn]:not([data-mpw])')];
      for (const x of cells) x.dataset.mpw = '';
      if (typeof IntersectionObserver !== 'function') { if (cells.length) ensureNames(ctx, cells.slice(0, 200).map(x => x.dataset.mpn), refreshNames); return; }
      // The preview's body is what scrolls (a full paint makes a new one), so it is the root the margin reaches past.
      const root = el.querySelector('.mp-body');
      if (fresh || io?.root !== root) { io?.disconnect(); if (io?.root !== root) io = null; }
      io ||= new IntersectionObserver(es => { const want = []; for (const x of es) if (x.isIntersecting) { io.unobserve(x.target); want.push(x.target.dataset.mpn); } if (want.length) ensureNames(ctx, want, refreshNames); }, { root, rootMargin: '400px 0px' });
      for (const x of cells) io.observe(x);
    };
    // The open view again; a sort button that had the focus keeps it.
    const paintView = () => {
      const host = el.querySelector('.mp-view'); if (!host) return;
      const a = document.activeElement, again = host.contains(a) && a.dataset.mpa === 'sort' ? `[data-mpa="sort"][data-k="${a.dataset.k}"]` : null;
      host.innerHTML = viewHtml(); watchNames(true);
      if (again) host.querySelector(again)?.focus({ preventScroll: true });
    };
    const setView = v => {
      pick.view = v; savePick(pick);
      for (const b of el.querySelectorAll('[data-mpa="view"]')) { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', String(b.dataset.v === v)); }
      const f = el.querySelector('.mp-q'); if (f) f.hidden = v === 'groups';
    };
    // A filter that leaves three rows or fewer opens them, the matching lines marked.
    const openHits = () => { const v = pick.view; if (!q || !HITS[v] || v === 'products') return; const rows = rowsOf(v); if (rows.length <= 3) for (const r of rows) open.add(v === 'depts' ? `d:${r.code}` : `c:${r.id}`); };
    const toggle = key => {
      const row = el.querySelector(`[data-mpx="${CSS.escape(key)}"]`); if (!row) return;
      const o = !open.has(key); if (o) open.add(key); else open.delete(key);
      row.classList.toggle('open', o); row.querySelector('.mp-x')?.setAttribute('aria-expanded', String(o));
      if (row.nextElementSibling?.classList.contains('mp-dr')) row.nextElementSibling.remove();
      if (o) { row.insertAdjacentHTML('afterend', detail(key, row.children.length)); watchNames(); }
    };
    // Another view, opened at a row: a micro-department from Groups, a consol from a product's details.
    const jump = (v, key, filter) => {
      q = filter.toLowerCase(); qv = filter; const f = el.querySelector('[data-mp-field="q"]'); if (f) f.value = filter;
      open.add(key); setView(v);
      const at = rowsOf(v).findIndex(r => (v === 'depts' ? `d:${r.code}` : `c:${r.id}`) === key); if (at >= LIST_CAP) all[v] = true;
      paintView();
      const row = el.querySelector(`[data-mpx="${CSS.escape(key)}"]`); if (row) { row.scrollIntoView({ block: 'nearest' }); row.querySelector('.mp-x')?.focus({ preventScroll: true }); }
    };

    let settled = false;
    const done = v => { if (settled) return; settled = true; io?.disconnect(); sheet.close(); resolve(v); };
    const paint = () => {
      const chk = manifestCheck({ ...parsed, manNo }, { storeNo: ctx.storeNo, index, today: todayKey(), mpc }), s = chk.stats;
      const noNum = !/^[\w-]{1,20}$/.test(manNo), micros = microsOf(); tot = s.cartons || 1;
      const gc = {}; for (const r of micros) gc[groupOf(r.code)] = (gc[groupOf(r.code)] || 0) + r.cartons;
      const mixed = parsed.consols.filter(c => (c.mix || []).filter(m => m[1] > 0).length > 1).length, share = dur(Math.round(s.workMins / 4));
      const stat = (k, v, note) => `<div><span>${k}</span><b>${v}</b>${note ? `<small>${note}</small>` : ''}</div>`;
      const fact = (k, v) => `<div><span>${k}</span><b>${v || '—'}</b></div>`;
      sheet.busy(busy);
      sheet.set({ body:
        `<div class="mp-body"><div class="mp-main">` +
        `<div class="mp-facts">${fact(tx('Manifest'), noNum ? '' : esc(manNo))}${fact(tx('Store'), esc(parsed.storeNo || ''))}${fact(tx('DC'), esc(parsed.dcNo || ''))}${fact(tx('Despatch'), esc(parsed.despatch || ''))}</div>` +
        (noNum || parsed.kind === 'generic' || !parsed.manNo ? `<label class="mp-num">${tx('Manifest number')} <input class="ad-in mono" data-mp-field="manNo" value="${esc(manNo)}" maxlength="20" placeholder="${tx('e.g. {n}', { n: '7031482' })}" autocomplete="off"></label>` : '') +
        `<div class="ps-facts mfx-stats">${stat(tx('Consols'), s.consols, mixed ? txn(mixed, '{n} mixed', '{n} mixed') : tx('none mixed'))}${stat(tx('Cartons'), s.cartons.toLocaleString(), s.consols ? tx('about {n} a consol', { n: Math.round(s.cartons / s.consols) }) : '')}` +
        `${stat(tx('Keycodes'), s.keycodes.toLocaleString(), txn(s.lines, '{n} line', '{n} lines', { n: s.lines.toLocaleString() }))}${stat(tx('Units'), s.units.toLocaleString(), s.cartons ? tx('about {n} a carton', { n: Math.round(s.units / s.cartons) }) : '')}` +
        `${stat(tx('Est. work'), hm(s.workMins), tx('{mpc} min a carton · about {time} for four', { mpc, time: share }))}</div>` +
        `<div class="pt3">${tx('Departments')}<span class="cs-dim">${txn(micros.length, '{n} micro-department · cartons, largest first', '{n} micro-departments · cartons, largest first')}</span></div>` +
        `<div class="mp-roll">${GROUPS.filter(g => gc[g[0]] > 0).map(g => `<span style="flex:${gc[g[0]]};background:${g[2]}" title="${esc(g[1])}: ${tx('{n} cartons', { n: gc[g[0]] })}">${gc[g[0]] / tot > 0.1 ? `${esc(g[1])} ${Math.round(gc[g[0]] / tot * 100)}%` : ''}</span>`).join('')}</div>` +
        barHtml() + `<div class="mp-view">${viewHtml()}</div></div>` +
        // The checks' text is shared/manifest.js's, in English: checkText() (mbatch.js) says each in this device's language.
        `<div class="mp-side">${cameHtml()}<div class="pt3">${tx('Checks')}</div><ul class="mp-checks">${chk.checks.map(c => `<li class="${c.level}">${c.level === 'ok' ? '✓' : c.level === 'bad' ? '⛔' : '⚠'} ${esc(checkText(c.text))}</li>`).join('')}</ul>` +
        `<div class="mp-acts"><button class="btn primary" data-mp="publish"${chk.blocking || noNum || busy ? ' disabled' : ''}>${busy ? tx('Publishing…') : attachTo ? `${ic('truck')}${tx('Publish & attach to Truck {n}', { n: esc(truckNo(attachTo)) })}` : `${ic('check')}${tx('Publish to the library')}`}</button><button class="btn" data-mp="cancel"${busy ? ' disabled' : ''}>${tx('Cancel')}</button></div>` +
        `<p class="lbl">${chk.blocking ? tx('Fix what is marked ⛔ first: the worker would refuse this report.') : tx('Publishing lists it on every device; a truck attaches it when it lands.')}</p></div></div>` });
      watchNames(true);
      // A switcher wider than a phone scrolls: the open view in sight.
      const seg = el.querySelector('.mp-seg'), on = seg?.querySelector('.on');
      if (on && seg.scrollWidth > seg.clientWidth) seg.scrollLeft += on.getBoundingClientRect().left - seg.getBoundingClientRect().left - 8;
    };
    el.addEventListener('change', e => {
      const f = e.target.dataset.mpField; if (!came || (f !== 'day' && f !== 'truck')) return;
      if (f === 'day') { came.day = e.target.value; if (!came.day) came.truck = null; } else came.truck = e.target.value ? Number(e.target.value) : null;
      came.via = 'label'; came.touched = true; paint();
    });
    el.addEventListener('input', e => { if (e.target.dataset.mpField === 'manNo') { manNo = e.target.value.trim(); place(); const pos = e.target.selectionStart; paint(); const i = el.querySelector('[data-mp-field="manNo"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });
    el.addEventListener('input', e => { if (e.target.dataset.mpField !== 'q') return; qv = e.target.value; q = qv.trim().toLowerCase(); openHits(); paintView(); });
    // The views' own buttons (data-mpa), and a tap on a row that opens; a
    // keycode or a product link is the product's (stockroom/common.js).
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-mpa]');
      if (!a) { const row = e.target.closest('[data-mpx]'); if (row && !e.target.closest('a, button, input, select') && !String(window.getSelection?.() || '')) toggle(row.dataset.mpx); return; }
      const act = a.dataset.mpa, v = pick.view;
      if (act === 'view' && a.dataset.v !== v) { setView(a.dataset.v); paintView(); }
      else if (act === 'sort') { pick.sort[v] = a.dataset.k; savePick(pick); paintView(); }
      else if (act === 'x') { const row = a.closest('[data-mpx]'); if (row) toggle(row.dataset.mpx); }
      else if (act === 'more') { all[v] = true; paintView(); }
      else if (act === 'full') { const key = a.dataset.key, dr = a.closest('.mp-dr'); full.add(key); if (dr) { dr.insertAdjacentHTML('afterend', detail(key, dr.firstElementChild.colSpan)); dr.remove(); watchNames(); } }
      else if (act === 'micro') jump('depts', `d:${a.dataset.code}`, '');
      else if (act === 'consol') jump('consols', `c:${a.dataset.id}`, a.dataset.id);
    });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-mp]'); if (!b || busy) return;
      if (b.dataset.mp === 'cancel') return done(null);
      busy = true; paint();
      try {
        const r = await publishParsed(ctx, parsed, { filename: file.name, manNo });
        if (attachTo) await attachManifest(ctx, attachTo, r.manNo);
        const had = ctx.store.get('dock').manifestDays?.[r.manNo];
        if (came && !came.fixed && came.day && (had?.day !== came.day || (had?.truck ?? null) !== (came.truck ?? null))) await ctx.store.dispatch({ type: 'manifest.day', entity: { manNo: r.manNo }, payload: { day: came.day, truck: came.truck ?? null } });
        done({ ...r, attached: attachTo });
      } catch (err) { busy = false; paint(); toast(tx('Could not publish: {error}', { error: err.message }), 'bad'); }
    });
    paint();
    // The filter is not where the sheet starts: the manifest number, else the day it came.
    setTimeout(() => {
      const f = el.querySelector('[data-mp-field="manNo"]') || (document.activeElement?.dataset.mpField === 'q' ? el.querySelector('[data-mp-field="day"]') || el.querySelector('.sht') : null);
      f?.focus({ preventScroll: true });
    }, 30);
  });
}
