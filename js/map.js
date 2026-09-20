// The store map: loads the published SVG once, mounts a copy into a stage,
// and gives views pan/zoom, selection, marks, pins, routes and a department
// filter. Ported from the showcase's map chrome; the map document itself
// will come from GET /v1/store/:no/map/:version once that route lands.

import { $, $$, ic, esc, DEPT_COLOUR, DEPT_NAME, DEPT_GROUPS } from './ui.js';

let mapText = null, mapMeta = null;
// The shell sets the map from the published document (client.maps.get) or
// from a bundled file when the store has none published yet.
export function setMap(doc) {
  if (!doc) { mapText = PLACEHOLDER; mapMeta = null; return; }
  mapText = doc.floors?.[0]?.svg || PLACEHOLDER; mapMeta = { version: doc.version, at: doc.at, name: doc.name, floors: (doc.floors || []).map(f => ({ id: f.id, name: f.name, type: f.type })), departments: doc.departments || [] };
}
export function mapInfo() { return mapMeta; }
export function hasMap() { return !!mapText && mapText !== PLACEHOLDER; }
export async function loadMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`map ${res.status}`);
  mapText = await res.text(); mapMeta = { version: 'bundled', floors: [{ id: 'ground' }], departments: [] };
  return mapText;
}
const PLACEHOLDER = '<svg class="map real placeholder" viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1200" height="700" fill="none"/><text x="600" y="330" text-anchor="middle" font-size="36" font-weight="700" fill="#9CA3AF">No map published for this store yet</text><text x="600" y="380" text-anchor="middle" font-size="22" fill="#9CA3AF">The owner publishes one from the admin console, Map tab</text></svg>';

// Shelf segment id as the refresh mode keys it: "A11 S1" (data-full), uppercased.
export function segmentId(g) { return (g.getAttribute('data-full') || (g.getAttribute('data-shelf') + ' ' + (g.getAttribute('data-subname') || '')).trim()).toUpperCase(); }

export function mountMap(stage, { mono = false, cls = '', marks = {}, select = null, onSelect = null, showEmergency = false } = {}) {
  stage.innerHTML = mapText;
  const svg = stage.querySelector('svg.map.real');
  if (mono) svg.classList.add('mono');
  if (cls) svg.classList.add(...cls.split(' ').filter(Boolean));
  if (showEmergency) svg.classList.add('showem');
  const vb0 = svg.getAttribute('viewBox');
  const api = {
    svg, stage,
    vb() { return svg.getAttribute('viewBox').split(' ').map(Number); },
    setVb(v) { svg.setAttribute('viewBox', v.join(' ')); },
    fit() { svg.setAttribute('viewBox', vb0); svg.classList.remove('zoomed'); },
    zoomBy(f, cx, cy) {
      const v = api.vb(), r = svg.getBoundingClientRect();
      const px = cx == null ? .5 : (cx - r.left) / r.width, py = cy == null ? .5 : (cy - r.top) / r.height;
      const nw = v[2] * f, nh = v[3] * f;
      api.setVb([v[0] + (v[2] - nw) * px, v[1] + (v[3] - nh) * py, nw, nh]);
    },
    groups(id) { return $$(`.shelf-group[data-shelf="${cssq(id)}"]`, svg); },
    segments() { return $$('.shelf-group[data-shelf]', svg).filter(g => g.getAttribute('data-shelf')); },
    mark(id, value) { for (const g of api.groups(id)) { if (value) g.setAttribute('data-mark', value); else g.removeAttribute('data-mark'); } },
    markSegment(segId, value) { for (const g of api.segments()) if (segmentId(g) === segId) { if (value) g.setAttribute('data-mark', value); else g.removeAttribute('data-mark'); } },
    setMarks(map) { for (const g of api.segments()) g.removeAttribute('data-mark'); for (const [id, v] of Object.entries(map || {})) { if (id.includes(' ')) api.markSegment(id, v); else api.mark(id, v); } },
    select(id) {
      for (const g of $$('.shelf-group[data-sel]', svg)) g.removeAttribute('data-sel');
      for (const g of api.groups(id)) g.setAttribute('data-sel', '1');
    },
    centreOf(id) {
      const segs = api.groups(id).map(g => g.querySelector('.shelf')).filter(Boolean);
      if (!segs.length) return null;
      let x = 0, y = 0; for (const r of segs) { const b = r.getBBox(); x += b.x + b.width / 2; y += b.y + b.height / 2; }
      return [x / segs.length, y / segs.length];
    },
    zoomTo(id, pad = 700) {
      const c = api.centreOf(id); if (!c) return;
      const full = vb0.split(' ').map(Number);
      const w = pad * 2, h = pad * 2 * (full[3] / full[2]);
      api.setVb([c[0] - w / 2, c[1] - h / 2, w, h]); svg.classList.add('zoomed');
    },
    clearOverlays() { for (const el of $$('.route-path,.route-n,.pin', svg)) el.remove(); },
    drawRoute(ids, done = []) {
      api.clearOverlays();
      const NS = 'http://www.w3.org/2000/svg', vb = vb0.split(' ').map(Number);
      const pts = [[vb[0] + vb[2] * 0.5, vb[1] + vb[3] - 40]]; const stops = [];
      for (const id of ids) { const c = api.centreOf(id); if (c) { pts.push(c); stops.push({ id, c }); } }
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0]} ${pts[i - 1][1]} L${pts[i][0]} ${pts[i][1]}`;
      const path = document.createElementNS(NS, 'path'); path.setAttribute('class', 'route-path'); path.setAttribute('d', d); svg.appendChild(path);
      stops.forEach((st, i) => {
        const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'route-n' + (done.includes(st.id) ? ' done' : '')); g.setAttribute('transform', `translate(${st.c[0]},${st.c[1]})`);
        const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '30'); g.appendChild(c);
        const t = document.createElementNS(NS, 'text'); t.textContent = String(i + 1); g.appendChild(t);
        svg.appendChild(g);
      });
    },
    drawPins(pins) {   // [{ x, y, colour, label }] in map coordinates
      const NS = 'http://www.w3.org/2000/svg';
      for (const p of pins) {
        const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pin'); g.setAttribute('transform', `translate(${p.x},${p.y})`);
        g.innerHTML = `<path d="M0 0c-14-22-30-34-30-58a30 30 0 0 1 60 0c0 24-16 36-30 58z" fill="${p.colour}" stroke="#fff" stroke-width="5"/><circle cx="0" cy="-58" r="20" fill="#fff"/><text x="0" y="-58" style="fill:${p.colour}">${esc(p.label)}</text>`;
        svg.appendChild(g);
      }
    },
    filterDept(dept) {
      let bb = null;
      for (const g of $$('.shelf-group[data-dept]', svg)) {
        const hit = !dept || (g.getAttribute('data-dept') || '').toLowerCase() === dept;
        g.style.opacity = hit ? '' : '.14';
        if (dept && hit) { const r = g.querySelector('.shelf'); if (r) { const x = +r.getAttribute('x'), y = +r.getAttribute('y'), w = +r.getAttribute('width'), h = +r.getAttribute('height'); bb = bb ? [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x + w), Math.max(bb[3], y + h)] : [x, y, x + w, y + h]; } }
      }
      if (!dept || !bb) { api.fit(); return; }
      const pad = 160; let W = bb[2] - bb[0] + pad * 2, H = bb[3] - bb[1] + pad * 2;
      const r0 = svg.getBoundingClientRect(), ar = r0.width / r0.height;
      if (W / H < ar) { const nw = H * ar; bb[0] -= (nw - W) / 2; W = nw; } else { const nh = W / ar; bb[1] -= (nh - H) / 2; H = nh; }
      api.setVb([bb[0] - pad, bb[1] - pad, W, H]);
    },
    // Map coordinates of a client point (for placing pins).
    pointAt(clientX, clientY) { const v = api.vb(), r = svg.getBoundingClientRect(); return [v[0] + (clientX - r.left) / r.width * v[2], v[1] + (clientY - r.top) / r.height * v[3]]; },
    markers() {
      return $$('.emergency-marker[data-equip-type]', svg).map(m => ({
        id: `${m.getAttribute('data-equip-type')}_${Math.round(+m.getAttribute('data-x'))}_${Math.round(+m.getAttribute('data-y'))}`,
        type: m.getAttribute('data-equip-type'), label: m.getAttribute('data-label') || '', location: m.getAttribute('data-location') || '',
        dept: (m.getAttribute('data-loc-dept') || '').toLowerCase(), extClass: m.getAttribute('data-ext-class') || '', method: m.getAttribute('data-method') || '', operation: m.getAttribute('data-operation') || '',
        x: +m.getAttribute('data-x'), y: +m.getAttribute('data-y'), el: m,
      }));
    },
    shelfInfo(g) { return { id: g.getAttribute('data-shelf'), sub: g.getAttribute('data-subname') || '', dept: (g.getAttribute('data-dept') || '').toLowerCase(), full: segmentId(g), segments: api.groups(g.getAttribute('data-shelf')).length }; },
  };
  api.setMarks(marks);
  if (select) api.select(select);

  // pan, zoom, tap
  let drag = null;
  stage.addEventListener('wheel', e => { e.preventDefault(); api.zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, v: api.vb(), w: svg.getBoundingClientRect().width, moved: false, t: Date.now() }; });
  svg.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; const k = drag.v[2] / drag.w; api.setVb([drag.v[0] - dx * k, drag.v[1] - dy * k, drag.v[2], drag.v[3]]); });
  svg.addEventListener('pointerup', e => {
    if (!drag) return; const { moved, t } = drag; drag = null; if (moved) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    const g = hit.closest?.('.shelf-group[data-shelf]');
    const m = hit.closest?.('.emergency-marker[data-equip-type]');
    if (g && g.getAttribute('data-shelf')) { api.select(g.getAttribute('data-shelf')); onSelect?.({ kind: 'shelf', ...api.shelfInfo(g), el: g, long: Date.now() - t > 500 }); }
    else if (m) onSelect?.({ kind: 'marker', ...api.markers().find(x => x.el === m) });
    else onSelect?.({ kind: 'floor', point: api.pointAt(e.clientX, e.clientY) });
  });
  svg.addEventListener('pointercancel', () => { drag = null; });
  return api;
}

function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }

// The bar above a desktop map: find, department chips, zoom, key.
export function mapbar() {
  const chips = [['All', 'grid', ''], ['Home', 'home', 'home'], ['Clothing', 'shirt', 'clothing'], ['Kids', 'star', 'kids'], ['Checkouts', 'bag', 'checkouts'], ['Flex', 'flame', 'flex'], ['Stockroom', 'box', 'stockroom']];
  return `<div class="mapbar"><div class="search"><svg class="i"><use href="icons.svg#i-search"/></svg><input placeholder="Find a shelf, bay or product on the map…" aria-label="Find on map" data-mapfind><svg class="i mic" title="Voice search"><use href="icons.svg#i-mic"/></svg></div>` +
    `<div class="legchips">${chips.map((c, i) => `<span class="chip${i === 0 ? ' on' : ''}" data-mapgroup="${c[2]}">${ic(c[1])}${c[0]}</span>`).join('')}</div>` +
    `<div class="zoom" style="margin-left:auto;display:flex;gap:6px"><span class="ibtn" data-zoom="out">${ic('minus')}</span><span class="ibtn" data-zoom="in">${ic('plus')}</span><span class="ibtn" data-zoom="fit" title="Fit">${ic('map')}</span>` +
    `<span class="keywrap"><span class="ibtn" data-key="1" title="Department key">${ic('layers')}</span><div class="keypop"><h4>Department key</h4>${DEPT_GROUPS.map(gp => `<div class="keygrp">${ic(gp[1])}${gp[0]}</div><div class="keygrid">${gp[2].map(d => `<div class="keyrow"><i style="background:${DEPT_COLOUR[d]}"></i><b>${d.toUpperCase()}</b><span>${DEPT_NAME[d]}</span></div>`).join('')}</div>`).join('')}</div></span></div></div>`;
}
export function crumbx(ctx, storeNo, storeName) { return `<span class="crumbx">${ic('map')}FOH · Ground <b>${esc(storeNo)}</b>${ctx ? ' › ' + ctx : ''}</span>`; }
export function mvMap(o = {}) {
  return `<div class="mv-map mapbox"><div class="mapstage" id="mapstage"></div><div class="mv-mtools"><span class="ibtn scan" data-go="search" title="Scan">${ic('barcode')}</span><span class="ibtn" data-zoom="in">${ic('plus')}</span><span class="ibtn" data-zoom="out">${ic('minus')}</span><span class="ibtn" data-zoom="fit" title="Fit">${ic('map')}</span></div>${o.badge ? `<div class="mv-mbadge" id="mvbadge">${o.badge}</div>` : ''}</div>`;
}

// Wire zoom buttons and group chips on a mounted view.
export function bindMapChrome(root, map) {
  root.addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z) { const k = z.getAttribute('data-zoom'); if (k === 'in') map.zoomBy(1 / 1.3); else if (k === 'out') map.zoomBy(1.3); else map.fit(); return; }
    const key = e.target.closest('[data-key]'); if (key) { key.parentNode.classList.toggle('open'); return; }
    const grp = e.target.closest('[data-mapgroup]');
    if (grp) {
      for (const c of $$('[data-mapgroup]', root)) c.classList.toggle('on', c === grp);
      const g = grp.getAttribute('data-mapgroup');
      const codes = { home: ['h1', 'h2', 'h3', 'h4'], clothing: ['c1', 'c2', 'c3', 'c4'], kids: ['k1', 'k2', 'k3', 'k4'], checkouts: ['checkouts'], flex: ['flex'], stockroom: ['stockroom'] }[g];
      for (const el of $$('.shelf-group[data-dept]', map.svg)) el.style.opacity = !codes || codes.includes((el.getAttribute('data-dept') || '').toLowerCase()) ? '' : '.14';
      if (!codes) map.fit();
    }
  });
  const find = root.querySelector('[data-mapfind]');
  if (find) find.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const id = find.value.trim().toUpperCase().split(' ')[0]; if (map.groups(id).length) { map.select(id); map.zoomTo(id); } });
}
