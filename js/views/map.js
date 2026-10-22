// Store map and the selected shelf card. Also the phone's Home: the map with
// the selected shelf beneath it.

import { $, ic, esc, vh, sub, dep, DEPT_NAME, DEPT_GROUPS, weekId, fmtTime, fmtDate, cycleId, toast } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId, shelfDetail, canonCode, runText, runSubs, setStrip, sx } from '../map.js';
import { markerSymbol } from '../../shared/maprender.js';
import { openShare } from '../share.js';
import { openScanner } from '../scan.js';
import { voiceSupported } from '../voice.js';
import { MICRO, microCode, microName } from '../data/micros.js';
import { tx, txn } from '../i18n.js';

let selected = null, pcSel = null;
function shelfFacts(ctx, map, id) {
  const r = ctx.store.get('refresh'), week = weekId(), marks = r.weeks[week] || {};
  const segs = map.groups(id).map(g => segmentId(g));
  const refreshed = segs.map(s => marks[s]).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  // The newest refresh of this shelf in any kept week, and how old it is:
  // this week, last week, or older.
  let last = null, lastWeek = null;
  for (const [w, wm] of Object.entries(r.weeks)) for (const sg of segs) { const m = wm[sg]; if (m && (!last || m.at > last.at)) { last = m; lastWeek = w; } }
  const age = !last ? 'none' : lastWeek === week ? 'now' : lastWeek === weekId(new Date(Date.now() - 7 * 86400000)) ? 'last' : 'old';
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen);
  // Assignments are per shelf; older ones name the whole run (label integrity).
  const keys = new Set([...segs, map.code(id)?.shelf].filter(Boolean));
  const micros = Object.entries(L.assign).filter(([, shelves]) => shelves.some(s => keys.has(s))).map(([m]) => m);
  const checked = micros.filter(m => (L.checks[cyc] || {})[m]);
  const plan = segs.map(s => r.plan[s]).filter(Boolean);
  // The last stocktake that counted this shelf: its newest counted or
  // verified mark across the kept sessions (older sessions keyed the run).
  let counted = null;
  for (const sess of Object.values(ctx.store.get('stocktake')?.sessions || {})) for (const k of keys) { const m = sess.shelves?.[k]; if (m && (m.state === 'counted' || m.state === 'verified') && (!counted || m.at > counted.at)) counted = m; }
  return { segs, refreshed, last, age, micros, checked, plan, counted };
}
export function selCard(ctx, map, id) {
  if (!id) return `<div class="card selshelf" id="selshelf"><div class="ch"><h3>${tx('Selected shelf')}</h3></div><p class="lbl">${tx('Click a shelf on the map.')}</p></div>`;
  const g = map.groups(id)[0]; if (!g) return '';
  const info = map.shelfInfo(g), f = shelfFacts(ctx, map, id), cd = map.code(id), d = shelfDetail(map, id);
  const row = (k, v) => `<div class="row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-soft);font-size:13.5px;color:var(--dim)">${k}<b style="color:var(--ink)">${v}</b></div>`;
  return `<div class="card selshelf" id="selshelf"><div class="ch"><h3>${cd.sub || info.segments === 1 ? tx('Selected shelf') : tx('Selected run')}</h3><span class="go" data-act="clear">${tx('Clear')}</span></div>` +
    `<div class="sid">${shelfName(cd)}${dep(info.dept)}${microChips(f.micros)}</div><div class="meta">${DEPT_NAME[info.dept] || info.dept} · ${esc(runText(cd.shelf, cd.sub, runSubs(map, cd.shelf), info.segments))}</div>` +
    `<div class="rows" style="margin-top:12px;border-top:1px solid var(--line-soft)">${d.fixture ? row(tx('Fixture'), esc(d.fixture)) : ''}${d.modules ? row(tx('Length'), txn(d.modules, '{n} module', '{n} modules')) : ''}${d.range ? row(d.locations.length > 1 ? tx('Locations') : tx('Location'), `<span title="${esc(d.locations.join(', '))}">${esc(d.range)}</span>`) : ''}${d.size ? row(tx('Size'), esc(d.size)) : ''}${d.shared.length ? row(tx('Shares its name with'), esc(d.shared.join(', '))) : ''}${row(tx('Last refreshed'), f.last ? `<span class="age-${f.age}" title="${f.age === 'now' ? tx('This week') : f.age === 'last' ? tx('Last week') : tx('Over a week ago')}">${esc(f.age === 'now' ? fmtTime(f.last.at) : fmtDate(f.last.at))}</span>` : `<span class="age-none">${tx('none on record')}</span>`)}${row(tx('Last stocktake'), f.counted ? esc(fmtDate(f.counted.at)) : `<span class="age-none">${tx('none on record')}</span>`)}${row(tx('Label micro-depts'), f.micros.length ? tx('{n}/{of} checked', { n: f.checked.length, of: f.micros.length }) : tx('none assigned'))}${row(tx('Planned'), f.plan.length ? `<i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${f.plan[0]};vertical-align:-1px"></i> ${tx('yes')}` : tx('no'))}</div>` +
    `<div class="acts2"><button class="btn primary sm" data-act="pick-add" data-shelf="${esc(id)}">${ic('m-picklist')}${tx('Add to pick list')}</button><a class="btn sm" data-go="refresh" data-select="${esc(id)}">${ic('m-refresh')}${tx('Refresh')}</a><a class="btn sm" data-go="labelint" data-select="${esc(id)}">${ic('m-labelint')}${tx('Label check')}</a><button class="btn sm" data-act="share" data-shelf="${esc(id)}">${ic('qr')}${tx('Share')}</button></div></div>`;
}
// The phone Home's sheet (opened from the strip): the shelf in full, its
// area, department and run, the micro-departments on it by name, what the
// map knows about it, this week's refresh and this cycle's labels, and what
// to do with it.
export function mvSel(ctx, map, id) {
  if (!id) return mvEmpty();
  const g = map.groups(id)[0]; if (!g) return '';
  const info = map.shelfInfo(g), f = shelfFacts(ctx, map, id), d = shelfDetail(map, id), cd = map.code(id);
  const area = DEPT_GROUPS.find(a => a[0] !== 'Other' && a[2].includes(info.dept)), kind = d.fixture || (info.sub.startsWith('E') ? tx('End') : info.sub.startsWith('P') ? tx('Permanent end') : tx('Side'));
  const head = `<div class="sx-hd">${area ? `<div class="sx-ar">${ic(area[1])}${area[0]}</div>` : ''}<div class="sx-dn">${dep(info.dept)} ${esc(DEPT_NAME[info.dept] || info.dept)}</div><div class="sx-big">${shelfName(cd)}</div><div class="sx-sub">${esc(kind)} · ${esc(runText(cd.shelf, cd.sub, runSubs(map, cd.shelf), info.segments))}</div></div>`;
  const facts = sx.facts([[tx('Fixture'), esc(kind)], [tx('Length'), d.modules ? txn(d.modules, '{n} module', '{n} modules') : ''], [d.locations.length > 1 ? tx('Locations') : tx('Location'), esc(d.range)], [tx('Size'), esc(d.size)], [tx('Shares its name'), esc(d.shared.join(', '))]]);
  const n = f.checked.length, of = f.micros.length;
  const status = sx.rows([
    f.refreshed ? sx.row('m-refresh', tx('Refreshed'), esc(fmtTime(f.refreshed.at)), tx('This week'), 'ok') : sx.row('m-refresh', tx('Refresh'), tx('Not yet this week'), f.plan.length ? tx('Planned') : tx('Not yet'), f.plan.length ? 'acc' : 'dim'),
    of ? sx.row('m-labelint', tx('Labels'), txn(of, '{done} of {n} micro-department checked this cycle', '{done} of {n} micro-departments checked this cycle', { done: n }), n === of ? tx('Done') : tx('{n} to check', { n: of - n }), n === of ? 'ok' : 'warn') : sx.row('m-labelint', tx('Labels'), tx('No micro-departments assigned yet')),
  ]);
  const acts = sx.acts([sx.btn('m-picklist', tx('Add to route'), `data-act="pick-add" data-shelf="${esc(id)}"`, true), sx.btn('m-refresh', tx('Refresh'), `data-go="refresh" data-select="${esc(id)}"`), sx.btn('m-labelint', tx('Label check'), `data-go="labelint" data-select="${esc(id)}"`), sx.btn('qr', tx('Share'), `data-act="share" data-shelf="${esc(id)}"`)]);
  return `<div class="sx">${head}${of ? sx.sec(tx('On this shelf'), `<div class="sx-chips">${microChips(f.micros)}</div>`) : ''}${sx.sec(tx('About it'), facts)}${sx.sec(tx('Status'), status)}${acts}</div>`;
}
// The strip under the phone Home's map: the shelf in one line, a price
// check, or the ways to find one.
// The phone map's breadcrumb, as ShelfSearcher's context bar read: the
// area, the department's badge and name, then the shelf ("Home › H2 Bed,
// Bath, Laundry › B7 S2"). With no shelf it names the department picked,
// else all of them. The area and department step back out to them.
function mvCrumb(map, id, scope) {
  const g = id && map ? map.groups(id)[0] : null, d = g ? map.shelfInfo(g).dept : scope.length === 1 ? scope[0] : '';
  const area = DEPT_GROUPS.find(a => a[0] !== 'Other' && (d ? a[2].includes(d) : a[2].join() === scope.join()));
  if (!d && !area) return `${ic('grid')}<span class="ma">${tx('All departments')}</span>`;
  const sep = '<i class="sep">›</i>';
  return (area ? `<button type="button" class="ma" data-crumb="${area[2].join()}">${ic(area[1])}${area[0]}</button>` : ic(OTHER_ICON[d] || 'tag')) +
    (d ? `${area ? sep : ''}<button type="button" class="md" data-crumb="${esc(d)}">${dep(d)}<span>${esc(DEPT_NAME[d] || d)}</span></button>` : '') +
    (g ? `${sep}<b class="ms">${esc(id)}</b>` : '');
}
const OTHER_ICON = { checkouts: 'bag', flex: 'flame', stockroom: 'box' };

function homeStrip(map, id, p) {
  if (p) { const title = p.variant === 'order' ? tx('Order screen') : tx('Price check'); return `${ic('barcode')}<b>${title}</b><span class="s">${esc(p.location || p.label || '')}</span>${p.location ? `<button class="act" type="button" data-act="pc-goto">${ic('pin')}${tx('Show')}</button>` : ''}`; }
  const g = id && map.groups(id)[0];
  if (!g) return `${ic('pin')}<b>${tx('Find a shelf')}</b><span class="s"></span><button class="act" type="button" data-go="search">${ic('search')}${tx('Search')}</button><button class="act" type="button" data-act="scan-shelf" aria-label="${tx('Scan a shelf label')}" title="${tx('Scan a shelf label')}">${ic('barcode')}</button>`;
  const info = map.shelfInfo(g), cd = map.code(id), kind = shelfDetail(map, id).fixture || (info.sub.startsWith('E') ? tx('End') : info.sub.startsWith('P') ? tx('Permanent end') : tx('Side'));
  return `<b>${esc(cd.shelf)}${cd.sub ? ` <span>${esc(cd.sub)}</span>` : ''}</b>${dep(info.dept)}<span class="s">${esc(DEPT_NAME[info.dept] || info.dept)} · ${esc(kind)}</span>`;
}
// Nothing selected yet: the ways to find a shelf, each one a tap away.
function mvEmpty() {
  const b = (attrs, icon, label) => `<button ${attrs}><span class="d">${ic(icon)}</span><span class="t">${label}</span></button>`;
  return `<div class="mvs-empty"><div class="mvs-eh"><span class="mvs-ei">${ic('pin')}</span><div><b>${tx('Find a shelf')}</b><small>${tx('Tap one on the map, or:')}</small></div></div>` +
    `<div class="mvs-ebtns">${b('data-go="search"', 'search', tx('Search'))}${voiceSupported() ? b(`data-voice aria-label="${tx('Search by voice')}"`, 'mic', tx('Say it')) : ''}${b('data-act="scan-shelf"', 'barcode', tx('Scan label'))}${b('data-act="depts"', 'grid', `<i class="l">${tx('Departments')}</i><i class="s">${tx('Depts')}</i>`)}</div></div>`;
}
// "A16 S1": the run name bold, the shelf's S1/S2 the same size, regular.
function shelfName(cd) { return `<span class="shname"><b>${esc(cd.shelf)}</b>${cd.sub ? `<span>${esc(cd.sub)}</span>` : ''}</span>`; }
// The micro-departments the shelf is assigned to, as "038 Kitchen".
function microChips(ids) {
  return ids.map(m => { const [sd, code = ''] = m.split('-'), e = (MICRO[sd] || []).find(x => microCode(x) === code); return `<span class="mic"><b>${esc(code || m)}</b>${e ? ' ' + esc(microName(e)) : ''}</span>`; }).join('');
}

// A price check or order screen, tapped on the map: what it is, where it
// is, its notes, and the shelf it stands at (ShelfSearcher's price-check sheet).
function pcCard(p, phone) {
  const order = p.variant === 'order', title = order ? tx('Order screen') : tx('Price check');
  const loc = p.location ? `<span class="pc-loc"${p.deptColour ? ` style="--dc:${esc(p.deptColour)}"` : ''}>${p.badge ? `<b>${esc(p.badge)}</b>` : ''}${esc(p.location)}</span>` : '';
  if (phone) return `<div class="who2 pcw">${markerSymbol(order ? 'order' : 'pc', 34)}<b class="dn">${title}</b><span class="shid"><b>${esc(p.label || title)}</b></span></div><div class="what"><span>${loc}${p.deptName ? ' ' + esc(p.deptName) : ''}${p.detail ? ' · ' + esc(p.detail) : ''}</span>${p.location ? `<button class="mv-share" data-act="pc-goto" aria-label="${tx('Show {code}', { code: esc(p.location) })}" title="${tx('Show the shelf')}">${ic('pin')}</button>` : ''}<button class="mv-share" data-act="clear" aria-label="${tx('Close')}" title="${tx('Close')}">${ic('x')}</button></div>`;
  return `<div class="card selshelf pccard" id="selshelf"><div class="ch"><h3>${title}</h3><span class="go" data-act="clear">${tx('Clear')}</span></div><div class="pchead">${markerSymbol(order ? 'order' : 'pc', 40)}<div><div class="sid">${esc(p.label || title)}</div><div class="meta">${loc}${p.deptName ? ' ' + esc(p.deptName) : ''}</div></div></div>` +
    (p.detail ? `<div class="pcnote"><b>${tx('Notes')}</b>${esc(p.detail)}</div>` : '') +
    `<div class="acts2">${p.location ? `<button class="btn primary sm" data-act="pc-goto">${ic('pin')}${tx('Show {code}', { code: esc(p.location) })}</button>` : ''}</div></div>`;
}

export default {
  id: 'map', title: tx('Store map'), icon: 'm-map',
  desktop(ctx) {
    return vh(tx('Store map'), sub(tx('FOH · Ground'), `${esc(ctx.storeNo)} ${esc(ctx.storeName)}`), `<button class="btn" data-zoom="fit">${ic('map')}${tx('Fit')}</button>`, 'm-map') +
      `<div class="mapview"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Store map'), ctx.storeNo)}<span><i style="background:transparent;border:2px solid #D24E0E"></i>${tx('Selected')} <b id="mapcrumb" style="color:var(--ink)">${selected ? esc(selected) : '—'}</b></span><span><i style="background:#CBD0D8"></i>${tx('Department colours from the key')}</span><span style="color:var(--faint)">${tx('Scroll to zoom · drag to pan · click a shelf')}</span></div></div>` +
      `<div id="selhost">${''}</div></div>`;
  },
  mobile(ctx) { return mvMap({ badge: `<span id="mvcrumb" class="mcrumb">${mvCrumb(null, null, [])}</span>` }) + `<div class="mv-sel home" id="mvsel"></div>`; },
  mount(ctx, root) {
    if (ctx.arg?.select) selected = ctx.arg.select;
    pcSel = null;
    const map = mountMap($('#mapstage', root), { select: selected, onSelect: info => { if (info.kind === 'shelf') { map.highlight(null); selected = info.code; pcSel = null; paint(); } else if (info.kind === 'pricecheck') { pcSel = info; map.select(''); paint(); } } });
    bindMapChrome(root, map);
    // From a search (the bar, voice, the palette, a link): found, as ShelfSearcher showed it.
    if (ctx.arg?.select) map.locate(selected);
    // From the phone's search: a micro-department's shelves ring on the map
    // and the first is selected; with none assigned, its department shows.
    if (ctx.arg?.micro) {
      const id = String(ctx.arg.micro), shelvesOf = ctx.store.get('labels')?.assign?.[id] || [], gs = shelvesOf.flatMap(s => map.groups(s));
      const [sd, code] = id.split('-'), e = (MICRO[sd] || []).find(x => microCode(x) === code), name = `${code} ${e ? microName(e) : ''}`.trim();
      if (gs.length) { selected = shelvesOf[0]; map.select(selected); map.highlight(gs); map.zoomTo(selected); toast(txn(shelvesOf.length, '{name}: {n} shelf', '{name}: {n} shelves', { name })); }
      else { map.zoomDept([sd]); toast(tx('{name} has no shelves assigned yet, so its department shows', { name })); }
    }
    // From the phone's Departments picker: one department, an area's ("h1,h2,h3,h4"), or 'all' to clear.
    let scope = [];
    if (ctx.arg?.dept && ctx.isMobile) { const d = String(ctx.arg.dept).toLowerCase(); scope = d === 'all' ? [] : d.split(',').filter(Boolean); map.zoomDept(scope); }
    if (ctx.isMobile) document.querySelector('.mdepts')?.classList.toggle('on', scope.length > 0);
    else if (ctx.arg?.dept) { const d = String(ctx.arg.dept).toLowerCase(), grp = DEPT_GROUPS.find(x => x[2].includes(d) && x[0] !== 'Other'); root.querySelector(`[data-mapgroup="${grp ? grp[0].toLowerCase() : d}"]`)?.click(); if (grp) root.querySelector(`[data-mapdept="${d}"]`)?.click(); }
    const paint = () => {
      const host = $('#selhost', root); if (host) host.innerHTML = pcSel ? pcCard(pcSel) : selCard(ctx, map, selected);
      const mv = $('#mvsel', root); if (mv) { mv.innerHTML = pcSel ? pcCard(pcSel, true) : mvSel(ctx, map, selected); mv.classList.toggle('shelf', !pcSel && !!mv.querySelector('.mvs-d')); mv.classList.toggle('nosel', !!mv.querySelector('.mvs-empty')); }
      const c = $('#mapcrumb', root); if (c) c.textContent = selected || '—';
      setStrip(root, homeStrip(map, selected, pcSel));
      const mc = $('#mvcrumb', root); if (mc) mc.innerHTML = mvCrumb(map, pcSel ? null : selected, scope);
    };
    paint();
    root.addEventListener('click', e => {
      if (e.target.closest('[data-act="clear"]')) { selected = null; pcSel = null; map.select(''); paint(); }
      if (e.target.closest('[data-act="pc-goto"]') && pcSel?.location) { const gs = map.groups(pcSel.location); if (gs.length) { selected = canonCode(pcSel.location); pcSel = null; map.locate(selected); paint(); } else toast(tx('{code} is not on this map', { code: pcSel.location }), 'bad'); }
      // The empty card's Scan label: a shelf or run label selects it here.
      if (e.target.closest('[data-act="scan-shelf"]')) openScanner({ title: tx('Scan a shelf label'), hint: tx('Point the camera at the shelf label'), onCode: code => {
        if (!map.groups(code).length) return toast(tx('{code} is not a shelf on this map', { code }), 'bad');
        selected = canonCode(code); pcSel = null; map.locate(selected); paint();
      } });
      if (e.target.closest('[data-act="depts"]')) document.querySelector('.mdepts')?.click();
      // The crumb's area and department step out of the shelf to that department.
      const cr = e.target.closest('[data-crumb]'); if (cr) { const v = cr.dataset.crumb; scope = v ? v.split(',') : []; selected = null; pcSel = null; map.select(''); map.highlight(null); map.zoomDept(scope); document.querySelector('.mdepts')?.classList.toggle('on', scope.length > 0); paint(); }
      const pa = e.target.closest('[data-act="pick-add"]'); if (pa) addToPickList(ctx, pa.dataset.shelf);
      const sh = e.target.closest('[data-act="share"]'); if (sh) { const id = sh.dataset.shelf, g = map.groups(id)[0]; openShare({ storeNo: ctx.storeNo, storeName: ctx.storeName, shelf: id, dept: g ? map.shelfInfo(g).dept : '' }); }
    });
    map.stage.addEventListener('mapselect', e => { selected = e.detail.code; paint(); });
    return [ctx.store.on('refresh', paint), ctx.store.on('labels', paint), ctx.store.on('stocktake', paint)];
  },
};

// The shelf card's "Add to pick list": onto this device's list, as the
// legacy shelf sheet did (pickListBulkAdd), with its messages.
async function addToPickList(ctx, code) {
  const cur = ctx.store.get('picklists')[ctx.session.device]?.items || [];
  if (cur.some(i => i.code === code)) return toast(tx('{code} is already on the list', { code }));
  if (cur.length >= 200) return toast(tx('Pick list is full'), 'bad');
  try { await ctx.store.dispatch({ type: 'picklist.set', entity: { device: ctx.session.device }, payload: { items: [...cur, { code, completed: false }] } }); toast(tx('{code} added to pick list', { code }), '', { label: tx('Open'), run: () => ctx.go('picklist') }); }
  catch { toast(tx('Couldn’t add to the pick list.'), 'bad'); }
}
