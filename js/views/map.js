// Store map and the selected shelf card. Also the phone's Home: the map with
// the selected shelf beneath it.

import { $, ic, esc, vh, sub, dep, DEPT_NAME, DEPT_COLOUR, weekId, fmtTime, cycleId } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId } from '../map.js';

let selected = null;
function shelfFacts(ctx, map, id) {
  const r = ctx.store.get('refresh'), week = weekId(), marks = r.weeks[week] || {};
  const segs = map.groups(id).map(g => segmentId(g));
  const refreshed = segs.map(s => marks[s]).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen);
  const micros = Object.entries(L.assign).filter(([, shelves]) => shelves.includes(id)).map(([m]) => m);
  const checked = micros.filter(m => (L.checks[cyc] || {})[m]);
  const plan = segs.map(s => r.plan[s]).filter(Boolean);
  return { segs, refreshed, micros, checked, plan };
}
export function selCard(ctx, map, id) {
  if (!id) return `<div class="card selshelf" id="selshelf"><div class="ch"><h3>Selected shelf</h3></div><p class="lbl">Click a shelf on the map.</p></div>`;
  const g = map.groups(id)[0]; if (!g) return '';
  const info = map.shelfInfo(g), f = shelfFacts(ctx, map, id);
  const row = (k, v) => `<div class="row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-soft);font-size:13.5px;color:var(--dim)">${k}<b style="color:var(--ink)">${v}</b></div>`;
  return `<div class="card selshelf" id="selshelf"><div class="ch"><h3>Selected shelf</h3><span class="go" data-act="clear">Clear</span></div>` +
    `<div class="sid">${esc(id)}${dep(info.dept)}</div><div class="meta">${DEPT_NAME[info.dept] || info.dept} · ${info.segments} segment${info.segments === 1 ? '' : 's'} · aisle ${esc(id.charAt(0))}, bay ${esc(id.slice(1))}</div>` +
    `<div class="rows" style="margin-top:12px;border-top:1px solid var(--line-soft)">${row('Refreshed this week', f.refreshed ? fmtTime(f.refreshed.at) : 'not yet')}${row('Label micro-depts', f.micros.length ? `${f.checked.length}/${f.micros.length} checked` : 'none assigned')}${row('Planned', f.plan.length ? `<i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${f.plan[0]};vertical-align:-1px"></i> yes` : 'no')}</div>` +
    `<div class="acts2"><a class="btn primary sm" data-go="picklist">${ic('m-picklist')}Pick list</a><a class="btn sm" data-go="refresh">${ic('m-refresh')}Refresh</a><a class="btn sm" data-go="labelint">${ic('m-labelint')}Label check</a></div></div>`;
}
export function mvSel(ctx, map, id) {
  if (!id) return `<div class="what"><span>Tap a shelf to see what is there, or search above.</span></div>`;
  const g = map.groups(id)[0]; if (!g) return '';
  const info = map.shelfInfo(g), f = shelfFacts(ctx, map, id);
  return `<div class="who2">${dep(info.dept)}<b class="dn">${DEPT_NAME[info.dept] || info.dept}</b><span class="shid"><b>${esc(id)}</b>${info.sub ? `<small>${esc(info.sub)}</small>` : ''}</span></div><div class="what"><span>${info.sub.startsWith('E') ? 'End' : 'Side'} · ${info.segments} module${info.segments === 1 ? '' : 's'} · aisle ${esc(id.charAt(0))}, bay ${esc(id.slice(1))}${f.refreshed ? ' · refreshed ' + fmtTime(f.refreshed.at) : ''}</span></div>`;
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
    const map = mountMap($('#mapstage', root), { select: selected, onSelect: info => { if (info.kind === 'shelf') { selected = info.id; paint(); } } });
    bindMapChrome(root, map);
    if (ctx.arg?.select) { map.select(selected); map.zoomTo(selected); }
    if (ctx.arg?.dept) { const group = { h1: 'home', h2: 'home', h3: 'home', h4: 'home', c1: 'clothing', c2: 'clothing', c3: 'clothing', c4: 'clothing', k1: 'kids', k2: 'kids', k3: 'kids', k4: 'kids' }[ctx.arg.dept]; root.querySelector(`[data-mapgroup="${group || ctx.arg.dept}"]`)?.click(); }
    const paint = () => {
      const host = $('#selhost', root); if (host) host.innerHTML = selCard(ctx, map, selected);
      const mv = $('#mvsel', root); if (mv) mv.innerHTML = mvSel(ctx, map, selected);
      const c = $('#mapcrumb', root); if (c) c.textContent = selected || '—';
      const mc = $('#mvcrumb', root); if (mc && selected) { const d = map.shelfInfo(map.groups(selected)[0]).dept; mc.innerHTML = `Floor › <i class="cb" style="background:${DEPT_COLOUR[d] || '#64748B'}"></i><b>${DEPT_NAME[d] || d}</b> › ${esc(selected)}`; }
    };
    paint();
    root.addEventListener('click', e => { if (e.target.closest('[data-act="clear"]')) { selected = null; map.select(''); paint(); } });
    return [ctx.store.on('refresh', paint), ctx.store.on('labels', paint)];
  },
};
