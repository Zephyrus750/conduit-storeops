// Print map: ShelfSearcher's print composer (dtop2-print.js), on a copy of
// the published map. Choose the floors, an area, the layers and what the
// floor's modes have marked; frame it with the zoom buttons or the mouse;
// what the paper shows is what prints. Also the department booklet: one
// page per department (or sub-department), each framed on its shelves.
//
// Kept from ShelfSearcher: the five panels and their wording, the title
// strip (store, scope, date) and the legend strip. Added: the paper (A4 or
// A3, landscape or portrait) with a preview of its shape, every floor on
// its own page, the booklet by sub-department, and colours that print
// without "Background graphics" (print-color-adjust).

import { $, ic, esc, vh, sub, toast, DEPT_NAME, DEPT_COLOUR, DEPT_GROUPS, weekId } from '../ui.js';
import { mountMap, mapFloors, mapInfo, hasMap, segmentId } from '../map.js';
import { printSheet } from '../print.js';
import { issuePin } from './maintenance.js';

const KEY = 'print_composer';
const DEF = { floor: 'current', dept: '', hide: false, labels: true, badges: true, colours: 'full', pc: true, tory: true, lm: true, emerg: false, maint: false, route: false, rfdone: false, rfplan: false, st: false, legend: true, paper: 'A4', orient: 'landscape', book: 'dept' };
let o = (() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };
// The printable area in mm, inside 10 mm margins; the title and legend
// strips take their share, the map the rest.
const PAPER = { A4: [297, 210], A3: [420, 297] };
const area = () => { const [a, b] = PAPER[o.paper] || PAPER.A4, [w, h] = o.orient === 'portrait' ? [b, a] : [a, b]; return { w: w - 20, h: h - 20, mapH: h - 20 - 11 - (o.legend ? 11 : 0) }; };
// Departments as the booklet pages them: ShelfSearcher's (Home, Clothing,
// Kids, then checkouts, flex and the stockroom on their own), or each
// sub-department (H1, H2…).
const deptPages = () => o.book === 'sub'
  ? DEPT_GROUPS.flatMap(([, , ids]) => ids).map(id => ({ label: `${id.toUpperCase()} · ${DEPT_NAME[id] || id}`, ids: [id], colour: DEPT_COLOUR[id] }))
  : DEPT_GROUPS.flatMap(([label, , ids]) => label === 'Other' ? ids.map(id => ({ label: DEPT_NAME[id] || id, ids: [id], colour: DEPT_COLOUR[id] })) : [{ label, ids, colour: DEPT_COLOUR[ids[0]] }]);
const codesOf = dept => { if (!dept) return []; const g = DEPT_GROUPS.find(x => x[0].toLowerCase() === dept); return g ? g[2] : [dept]; };
const deptLabel = dept => { const g = DEPT_GROUPS.find(x => x[0].toLowerCase() === dept); return g ? g[0] : `${dept.toUpperCase()} · ${DEPT_NAME[dept] || dept}`; };

const seg = (field, opts) => `<div class="seg pm-seg">${opts.map(([v, l]) => `<button class="${String(o[field]) === String(v) ? 'on' : ''}" data-pm="${field}" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
const chk = (field, label) => `<label class="pm-chk"><input type="checkbox" data-pmc="${field}"${o[field] ? ' checked' : ''}> ${label}</label>`;

function panel() {
  const fls = mapFloors();
  const floors = `<div class="card pm-card"><div class="ch"><h3>Floors</h3></div>${seg('floor', [['current', 'Current'], ...fls.map(f => [f.id, esc(f.name)]), ...(fls.length > 1 ? [['all', 'Every floor']] : [])])}<p class="lbl">${o.floor === 'all' ? 'Each floor prints on its own page.' : 'Prints the floor shown.'}</p></div>`;
  const groups = DEPT_GROUPS.filter(g => g[0] !== 'Other');
  const sel = o.dept && !DEPT_GROUPS.some(g => g[0].toLowerCase() === o.dept) ? DEPT_GROUPS.find(g => g[2].includes(o.dept))?.[0].toLowerCase() : o.dept;
  const subs = sel ? (DEPT_GROUPS.find(g => g[0].toLowerCase() === sel)?.[2] || []) : [];
  const areaCard = `<div class="card pm-card"><div class="ch"><h3>Area</h3></div><div class="seg pm-seg"><button class="${!o.dept ? 'on' : ''}" data-pm="dept" data-v="">All</button>${groups.map(([l, icon]) => `<button class="${sel === l.toLowerCase() ? 'on' : ''}" data-pm="dept" data-v="${l.toLowerCase()}">${ic(icon)}${l}</button>`).join('')}</div>` +
    (subs.length ? `<div class="pm-sublab">Sub-dept</div><div class="seg pm-seg"><button class="${o.dept === sel ? 'on' : ''}" data-pm="dept" data-v="${sel}">All</button>${subs.map(id => `<button class="${o.dept === id ? 'on' : ''}" data-pm="dept" data-v="${id}"><i class="pm-sw" style="background:${DEPT_COLOUR[id] || '#999'}"></i>${id.toUpperCase()}</button>`).join('')}</div>` : '') +
    (o.dept ? chk('hide', 'Hide other departments') : '') + `</div>`;
  const layers = `<div class="card pm-card"><div class="ch"><h3>Layers</h3></div>${chk('labels', 'Shelf names')}${chk('badges', 'Shelf badges')}<div class="pm-row"><span>Department colours</span>${seg('colours', [['full', 'Full'], ['outline', 'Outline']])}</div>${chk('pc', 'Price checks')}${chk('tory', 'Tory lines')}${chk('lm', 'Landmarks')}</div>`;
  const modes = `<div class="card pm-card"><div class="ch"><h3>Mode details</h3></div>${chk('route', 'Pick route (this device’s pick list)')}${chk('rfdone', 'Refresh — completed shelves')}${chk('rfplan', 'Refresh — plan colours')}${chk('st', 'Stocktake states')}${chk('emerg', 'Emergency markers')}${chk('maint', 'Maintenance issues')}</div>`;
  const out = `<div class="card pm-card"><div class="ch"><h3>Output</h3></div><div class="pm-row"><span>Paper</span>${seg('paper', [['A4', 'A4'], ['A3', 'A3']])}${seg('orient', [['landscape', 'Landscape'], ['portrait', 'Portrait']])}</div>` +
    `<div class="pm-row"><span>Frame</span><span class="pm-zoom"><button class="btn sm" data-pmz="out" aria-label="Zoom out">−</button><button class="btn sm" data-pmz="in" aria-label="Zoom in">+</button><button class="btn sm" data-pmz="fit">Fit</button></span></div>${chk('legend', 'Legend strip (key of what’s shown)')}` +
    `<p class="lbl">The paper (plus the title strip) is exactly what prints. Frame it with the zoom controls or the mouse.</p><button class="btn primary" data-act="pm-print">${ic('print')}Print · Save as PDF</button>` +
    `<div class="pm-row pm-book"><span>Booklet</span>${seg('book', [['dept', 'Departments'], ['sub', 'Sub-departments']])}</div><button class="btn" data-act="pm-book">${ic('file')}Print department booklet · one page per ${o.book === 'sub' ? 'sub-dept' : 'dept'}</button></div>`;
  return floors + areaCard + layers + modes + out;
}
function titleStrip(ctx, scope) {
  return `<div class="pm-title"><b>${esc(ctx.storeName || 'Store')} <span>${esc(ctx.storeNo || '')}</span></b><span>${esc(scope)}</span><span>${esc(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>`;
}
function legend(map) {
  if (!o.legend) return '';
  const fid = map.floorId(), here = new Set(map.segments().filter(g => g.closest('.mfl')?.getAttribute('data-fid') === fid && (!g.hasAttribute('data-dim') || !o.hide)).map(g => (g.getAttribute('data-dept') || '').toLowerCase()));
  const focus = codesOf(o.dept), depts = DEPT_GROUPS.flatMap(g => g[2]).filter(d => here.has(d) && (!focus.length || focus.includes(d)));   // an area's key names its departments
  const extra = [o.rfdone && ['Refreshed', '#16A34A'], o.rfplan && ['Plan colour', '#6B7280'], o.st && ['Counting', '#EAB308'], o.st && ['Counted', '#16A34A'], o.st && ['Verified', '#2563EB'], o.route && ['Pick route', '#D24E0E'], o.emerg && ['Emergency markers', '#DC2626'], o.maint && ['Maintenance issues', '#6F4527']].filter(Boolean);
  return `<div class="pm-legend"><b>Key</b>${depts.map(d => `<span><i style="background:${DEPT_COLOUR[d] || '#999'}"></i>${esc(d.toUpperCase())} ${esc(DEPT_NAME[d] || '')}</span>`).join('')}${extra.length ? '<em></em>' + extra.map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('') : ''}</div>`;
}
const scopeText = map => { const f = mapFloors().find(x => x.id === map.floorId()); return [f ? `${f.type === 'boh' ? 'BOH' : 'FOH'} · ${f.name}` : 'Floor', o.dept ? deptLabel(o.dept) : ''].filter(Boolean).join(' · '); };

// The modes' marks, as the composer's checkboxes ask.
function decorate(ctx, map) {
  const svg = map.svg;
  svg.classList.toggle('pp-outline', o.colours === 'outline');
  svg.classList.toggle('pp-nolabels', !o.labels); svg.classList.toggle('pp-labels', !!o.labels);
  svg.classList.toggle('pp-nobadges', !o.badges); svg.classList.toggle('pp-badges', !!o.badges);
  svg.classList.toggle('pp-tory', !!o.tory); svg.classList.toggle('pp-nolm', !o.lm);
  svg.classList.toggle('showem', !!o.emerg); svg.classList.toggle('pp-hide', !!(o.hide && o.dept));
  map.priceChecks(o.pc ? 'small' : 'off');
  // A run's name badge follows its shelves: faint, or gone, outside the area.
  const want = codesOf(o.dept);
  for (const t of svg.querySelectorAll('.shelf-badges .sb')) { const off = want.length && !want.includes((t.getAttribute('data-dept') || '').toLowerCase()); t.toggleAttribute('data-dim', !!off); t.previousElementSibling?.toggleAttribute('data-dim', !!off); }
  const marks = {};
  if (o.rfdone) for (const k of Object.keys(ctx.store.get('refresh').weeks[weekId()] || {})) marks[k] = 'done';
  if (o.st) { const S = ctx.store.get('stocktake'), open = Object.values(S.sessions).filter(x => !x.ended).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0]; for (const [k, r] of Object.entries(open?.shelves || {})) marks[k] = { pending: 'counting', counted: 'counted', verified: 'verified' }[r.state]; }
  map.setMarks(marks);
  const plan = o.rfplan ? ctx.store.get('refresh').plan || {} : {};
  for (const g of map.segments()) { const r = g.querySelector('.shelf'), c = plan[segmentId(g)]; if (!r) continue; if (c && !marks[segmentId(g)]) r.style.setProperty('fill', c, 'important'); else r.style.removeProperty('fill'); }
  map.clearOverlays();
  if (o.route) { const items = (ctx.store.get('picklists')[ctx.session.device]?.items || []).map(i => i.code); if (items.length) map.drawRoute(items, []); }
  if (o.maint) { const fids = map.floors().map(f => f.id); map.drawPins(Object.entries(ctx.store.get('issues')).map(([id, i]) => ({ id, ...i })).filter(i => !i.removed && i.status !== 'completed' && i.x != null && (!i.floor || !fids.includes(i.floor) || i.floor === map.floorId())).map(issuePin)); }
}
function frame(map, { fit = true } = {}) {
  const codes = codesOf(o.dept);
  if (codes.length) map.zoomDeptOn(codes, map.floorId(), 0); else { map.zoomDeptOn([]); if (fit) map.fit(); }
}
// One printed page: the title strip, the map as framed, the legend.
function page(ctx, map, scope, ar) {
  const svg = map.svg.cloneNode(true);
  for (const el of svg.querySelectorAll('.mfl')) if (el.style.display === 'none') el.remove();
  for (const el of svg.querySelectorAll('[data-sel]')) el.removeAttribute('data-sel');
  svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.style.removeProperty('height'); svg.style.removeProperty('width');
  return `<div class="pm-page" style="height:${ar.h}mm">${titleStrip(ctx, scope)}<div class="pm-pmap" style="height:${ar.mapH}mm">${svg.outerHTML}</div>${legend(map)}</div>`;
}

export default {
  id: 'printmap', title: 'Print map', icon: 'print',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) {
    if (!hasMap()) return vh('Print map', sub('No map published yet'), '', 'print') + `<div class="card"><p class="lbl">The owner publishes the store's map from the console. Then the composer prints it.</p></div>`;
    const ar = area();
    return vh('Print map', sub(`${o.paper} ${o.orient}`, mapInfo()?.version ? `map ${esc(mapInfo().version)}` : ''), `<button class="btn primary" data-act="pm-print">${ic('print')}Print · Save as PDF</button>`, 'print') +
      `<div class="pm-wrap"><div class="pm-room"><div class="pm-paper" style="aspect-ratio:${ar.w} / ${ar.h}"><div id="pmtitle"></div><div class="pm-stage" id="pmstage" style="flex:${ar.mapH} 1 0"></div><div id="pmlegend"></div></div></div><div class="sidecol pm-side" id="pmside">${panel()}</div></div>`;
  },
  mount(ctx, root) {
    const stage = $('#pmstage', root); if (!stage) return [];
    const map = mountMap(stage, { clone: true, badges: true, tips: false });
    const repaint = ({ refit = false } = {}) => {
      if (o.floor !== 'current' && o.floor !== 'all' && map.floorId() !== o.floor) map.floor(o.floor);
      decorate(ctx, map); if (refit) frame(map);
      $('#pmtitle', root).innerHTML = titleStrip(ctx, scopeText(map)); $('#pmlegend', root).innerHTML = legend(map);
    };
    repaint({ refit: true });
    stage.addEventListener('mapfloor', () => repaint());
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-pm]');
      if (b) { const f = b.dataset.pm, v = b.dataset.v; o[f] = v; if (f === 'dept' && !v) o.hide = false; save(); if (['paper', 'orient'].includes(f)) return ctx.rerender(); $('#pmside', root).innerHTML = panel(); repaint({ refit: ['floor', 'dept'].includes(f) }); return; }
      const z = e.target.closest('[data-pmz]');
      if (z) { if (z.dataset.pmz === 'fit') frame(map); else map.zoomBy(z.dataset.pmz === 'in' ? 0.8 : 1.25); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'pm-print') printNow(ctx, map);
      else if (a.dataset.act === 'pm-book') printBooklet(ctx, map);
    });
    root.addEventListener('change', e => { const c = e.target.closest('[data-pmc]'); if (!c) return; o[c.dataset.pmc] = c.checked; save(); $('#pmside', root).innerHTML = panel(); repaint({ refit: c.dataset.pmc === 'hide' }); });
    return [ctx.store.on('refresh', () => repaint()), ctx.store.on('stocktake', () => repaint()), ctx.store.on('issues', () => repaint())];
  },
};

function paperOpts() { return { page: `${o.paper} ${o.orient}`, bare: true }; }
function printNow(ctx, map) {
  const ar = area();
  if (o.floor !== 'all') return printSheet({ title: 'Store map', body: `<div class="pm-print">${page(ctx, map, scopeText(map), ar)}</div>`, ...paperOpts() });
  // Every floor, each framed whole (or on the chosen area), one page each.
  const back = { floor: map.floorId(), vb: map.vb() }, pages = [];
  for (const f of map.floors()) { map.floor(f.id); decorate(ctx, map); frame(map); pages.push(page(ctx, map, scopeText(map), ar)); }
  map.floor(back.floor); decorate(ctx, map); map.setVb(back.vb);
  printSheet({ title: 'Store map', body: `<div class="pm-print">${pages.join('')}</div>`, ...paperOpts() });
}
// The department booklet: one page per department with shelves, framed on
// them (others faint), in the composer's layers.
function printBooklet(ctx, map) {
  const ar = area(), back = { floor: map.floorId(), vb: map.vb(), dept: o.dept }, pages = [];
  for (const d of deptPages()) {
    const info = map.zoomDeptOn(d.ids, null, 0); if (!info || !info.shelves) continue;
    o.dept = d.ids.length === 1 ? d.ids[0] : DEPT_GROUPS.find(g => g[2] === d.ids)?.[0].toLowerCase() || d.ids[0];
    decorate(ctx, map);
    pages.push(page(ctx, map, `${info.floor || ''} · ${d.label}`, ar));
  }
  o.dept = back.dept; map.zoomDeptOn([]); map.floor(back.floor); decorate(ctx, map); frame(map); map.setVb(back.vb);
  if (!pages.length) return toast('No department has shelves on the map', 'bad');
  printSheet({ title: 'Department booklet', body: `<div class="pm-print">${pages.join('')}</div>`, ...paperOpts() });
  toast(`${pages.length} page${pages.length === 1 ? '' : 's'}, one per ${o.book === 'sub' ? 'sub-department' : 'department'}`);
}
