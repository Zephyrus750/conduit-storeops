// Store map and the selected shelf card. Also the phone's Home: the map with
// the selected shelf beneath it.

import { $, ic, esc, vh, sub, dep, DEPT_NAME, DEPT_COLOUR, DEPT_GROUPS, weekId, fmtTime, cycleId, toast } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId, shelfDetail, canonCode } from '../map.js';
import { markerSymbol } from '../../shared/maprender.js';
import { openShare } from '../share.js';

let selected = null, pcSel = null;
function shelfFacts(ctx, map, id) {
  const r = ctx.store.get('refresh'), week = weekId(), marks = r.weeks[week] || {};
  const segs = map.groups(id).map(g => segmentId(g));
  const refreshed = segs.map(s => marks[s]).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen);
  // Assignments are per module; older ones name the whole run (label integrity).
  const keys = new Set([...segs, map.code(id)?.shelf].filter(Boolean));
  const micros = Object.entries(L.assign).filter(([, shelves]) => shelves.some(s => keys.has(s))).map(([m]) => m);
  const checked = micros.filter(m => (L.checks[cyc] || {})[m]);
  const plan = segs.map(s => r.plan[s]).filter(Boolean);
  return { segs, refreshed, micros, checked, plan };
}
export function selCard(ctx, map, id) {
  if (!id) return `<div class="card selshelf" id="selshelf"><div class="ch"><h3>Selected shelf</h3></div><p class="lbl">Click a shelf on the map.</p></div>`;
  const g = map.groups(id)[0]; if (!g) return '';
  const info = map.shelfInfo(g), f = shelfFacts(ctx, map, id), cd = map.code(id), d = shelfDetail(map, id);
  const row = (k, v) => `<div class="row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-soft);font-size:13.5px;color:var(--dim)">${k}<b style="color:var(--ink)">${v}</b></div>`;
  return `<div class="card selshelf" id="selshelf"><div class="ch"><h3>Selected shelf</h3><span class="go" data-act="clear">Clear</span></div>` +
    `<div class="sid">${esc(cd.shelf)}${cd.sub ? `<small class="sub">${esc(cd.sub)}</small>` : ''}${dep(info.dept)}</div><div class="meta">${DEPT_NAME[info.dept] || info.dept} · ${cd.sub ? `module ${esc(cd.sub)} of ${info.segments}` : `${info.segments} module${info.segments === 1 ? '' : 's'}`} · aisle ${esc(cd.shelf.charAt(0))}, bay ${esc(cd.shelf.slice(1))}</div>` +
    `<div class="rows" style="margin-top:12px;border-top:1px solid var(--line-soft)">${d.fixture ? row('Fixture', esc(d.fixture)) : ''}${d.range ? row(d.locations.length > 1 ? 'Locations' : 'Location', `<span title="${esc(d.locations.join(', '))}">${esc(d.range)}</span>`) : ''}${d.size ? row('Size', esc(d.size)) : ''}${d.shared.length ? row('Shares its name with', esc(d.shared.join(', '))) : ''}${row('Refreshed this week', f.refreshed ? fmtTime(f.refreshed.at) : 'not yet')}${row('Label micro-depts', f.micros.length ? `${f.checked.length}/${f.micros.length} checked` : 'none assigned')}${row('Planned', f.plan.length ? `<i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${f.plan[0]};vertical-align:-1px"></i> yes` : 'no')}</div>` +
    `<div class="acts2"><button class="btn primary sm" data-act="pick-add" data-shelf="${esc(id)}">${ic('m-picklist')}Add to pick list</button><a class="btn sm" data-go="refresh" data-select="${esc(id)}">${ic('m-refresh')}Refresh</a><a class="btn sm" data-go="labelint" data-select="${esc(id)}">${ic('m-labelint')}Label check</a><button class="btn sm" data-act="share" data-shelf="${esc(id)}">${ic('qr')}Share</button></div></div>`;
}
export function mvSel(ctx, map, id) {
  if (!id) return `<div class="what"><span>Tap a shelf to see what is there, or search above.</span></div>`;
  const g = map.groups(id)[0]; if (!g) return '';
  const info = map.shelfInfo(g), f = shelfFacts(ctx, map, id), d = shelfDetail(map, id), cd = map.code(id);
  return `<div class="who2">${dep(info.dept)}<b class="dn">${DEPT_NAME[info.dept] || info.dept}</b><span class="shid"><b>${esc(cd.shelf)}</b>${cd.sub ? `<small>${esc(cd.sub)}</small>` : ''}</span></div><div class="what"><span>${esc(d.fixture || (info.sub.startsWith('E') ? 'End' : 'Side'))} · ${cd.sub ? `module ${esc(cd.sub)} of ${info.segments}` : `${info.segments} module${info.segments === 1 ? '' : 's'}`}${d.range ? ' · ' + esc(d.range) : ''}${d.size ? ' · ' + esc(d.size) : ''}${d.shared.length ? ' · also ' + esc(d.shared.join(', ')) : ''} · aisle ${esc(cd.shelf.charAt(0))}, bay ${esc(cd.shelf.slice(1))}${f.refreshed ? ' · refreshed ' + fmtTime(f.refreshed.at) : ''}</span><button class="mv-share" data-act="pick-add" data-shelf="${esc(id)}" aria-label="Add ${esc(id)} to the pick list" title="Add to pick list">${ic('m-picklist')}</button><button class="mv-share" data-act="share" data-shelf="${esc(id)}" aria-label="Share ${esc(id)}" title="Share">${ic('qr')}</button></div>`;
}

// A price check or order screen, tapped on the map: what it is, where it
// is, its notes, and the shelf it stands at (ShelfSearcher's price-check sheet).
function pcCard(p, phone) {
  const order = p.variant === 'order', title = order ? 'Order screen' : 'Price check';
  const loc = p.location ? `<span class="pc-loc"${p.deptColour ? ` style="--dc:${esc(p.deptColour)}"` : ''}>${p.badge ? `<b>${esc(p.badge)}</b>` : ''}${esc(p.location)}</span>` : '';
  if (phone) return `<div class="who2 pcw">${markerSymbol(order ? 'order' : 'pc', 34)}<b class="dn">${title}</b><span class="shid"><b>${esc(p.label || title)}</b></span></div><div class="what"><span>${loc}${p.deptName ? ' ' + esc(p.deptName) : ''}${p.detail ? ' · ' + esc(p.detail) : ''}</span>${p.location ? `<button class="mv-share" data-act="pc-goto" aria-label="Show ${esc(p.location)}" title="Show the shelf">${ic('pin')}</button>` : ''}<button class="mv-share" data-act="clear" aria-label="Close" title="Close">${ic('x')}</button></div>`;
  return `<div class="card selshelf pccard" id="selshelf"><div class="ch"><h3>${title}</h3><span class="go" data-act="clear">Clear</span></div><div class="pchead">${markerSymbol(order ? 'order' : 'pc', 40)}<div><div class="sid">${esc(p.label || title)}</div><div class="meta">${loc}${p.deptName ? ' ' + esc(p.deptName) : ''}</div></div></div>` +
    (p.detail ? `<div class="pcnote"><b>Notes</b>${esc(p.detail)}</div>` : '') +
    `<div class="acts2">${p.location ? `<button class="btn primary sm" data-act="pc-goto">${ic('pin')}Show ${esc(p.location)}</button>` : ''}</div></div>`;
}

export default {
  id: 'map', title: 'Store map', icon: 'm-map',
  desktop(ctx) {
    return vh('Store map', sub('FOH · Ground', `${esc(ctx.storeNo)} ${esc(ctx.storeName)}`), `<button class="btn" data-zoom="fit">${ic('map')}Fit</button>`, 'm-map') +
      `<div class="mapview"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Store map', ctx.storeNo)}<span><i style="background:transparent;border:2px solid #D24E0E"></i>Selected <b id="mapcrumb" style="color:var(--ink)">${selected ? esc(selected) : '—'}</b></span><span><i style="background:#CBD0D8"></i>Department colours from the key</span><span style="color:var(--faint)">Scroll to zoom · drag to pan · click a shelf</span></div></div>` +
      `<div id="selhost">${''}</div></div>`;
  },
  mobile(ctx) { return mvMap({ badge: `<span id="mvcrumb">Floor</span>` }) + `<div class="mv-sel home" id="mvsel"></div>`; },
  mount(ctx, root) {
    if (ctx.arg?.select) selected = ctx.arg.select;
    pcSel = null;
    const map = mountMap($('#mapstage', root), { select: selected, onSelect: info => { if (info.kind === 'shelf') { selected = info.code; pcSel = null; paint(); } else if (info.kind === 'pricecheck') { pcSel = info; map.select(''); paint(); } } });
    bindMapChrome(root, map);
    if (ctx.arg?.select) { map.select(selected); map.zoomTo(selected); }
    // From the phone's Departments picker: one department, or 'all' to clear.
    if (ctx.arg?.dept && ctx.isMobile) { const d = String(ctx.arg.dept).toLowerCase(); map.zoomDept(d === 'all' ? [] : [d]); }
    else if (ctx.arg?.dept) { const d = String(ctx.arg.dept).toLowerCase(), grp = DEPT_GROUPS.find(x => x[2].includes(d) && x[0] !== 'Other'); root.querySelector(`[data-mapgroup="${grp ? grp[0].toLowerCase() : d}"]`)?.click(); if (grp) root.querySelector(`[data-mapdept="${d}"]`)?.click(); }
    const paint = () => {
      const host = $('#selhost', root); if (host) host.innerHTML = pcSel ? pcCard(pcSel) : selCard(ctx, map, selected);
      const mv = $('#mvsel', root); if (mv) mv.innerHTML = pcSel ? pcCard(pcSel, true) : mvSel(ctx, map, selected);
      const c = $('#mapcrumb', root); if (c) c.textContent = selected || '—';
      const mc = $('#mvcrumb', root); if (mc && selected) { const d = map.shelfInfo(map.groups(selected)[0]).dept; mc.innerHTML = `Floor › <i class="cb" style="background:${DEPT_COLOUR[d] || '#64748B'}"></i><b>${DEPT_NAME[d] || d}</b> › ${esc(selected)}`; }
    };
    paint();
    root.addEventListener('click', e => {
      if (e.target.closest('[data-act="clear"]')) { selected = null; pcSel = null; map.select(''); paint(); }
      if (e.target.closest('[data-act="pc-goto"]') && pcSel?.location) { const gs = map.groups(pcSel.location); if (gs.length) { selected = canonCode(pcSel.location); pcSel = null; map.select(selected); map.highlight(gs); map.zoomTo(selected); paint(); } else toast(`${pcSel.location} is not on this map`, 'bad'); }
      const pa = e.target.closest('[data-act="pick-add"]'); if (pa) addToPickList(ctx, pa.dataset.shelf);
      const sh = e.target.closest('[data-act="share"]'); if (sh) { const id = sh.dataset.shelf, g = map.groups(id)[0]; openShare({ storeNo: ctx.storeNo, storeName: ctx.storeName, shelf: id, dept: g ? map.shelfInfo(g).dept : '' }); }
    });
    map.stage.addEventListener('mapselect', e => { selected = e.detail.code; paint(); });
    return [ctx.store.on('refresh', paint), ctx.store.on('labels', paint)];
  },
};

// The shelf card's "Add to pick list": onto this device's list, as the
// legacy shelf sheet did (pickListBulkAdd), with its messages.
async function addToPickList(ctx, code) {
  const cur = ctx.store.get('picklists')[ctx.session.device]?.items || [];
  if (cur.some(i => i.code === code)) return toast(`${code} is already on the list`);
  if (cur.length >= 200) return toast('Pick list is full', 'bad');
  try { await ctx.store.dispatch({ type: 'picklist.set', entity: { device: ctx.session.device }, payload: { items: [...cur, { code, completed: false }] } }); toast(`${code} added to pick list`, '', { label: 'Open', run: () => ctx.go('picklist') }); }
  catch { toast('Couldn’t add to the pick list.', 'bad'); }
}
