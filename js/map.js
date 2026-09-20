// The store map: loads the published SVG once, mounts a copy into a stage,
// and gives views pan/zoom, selection, marks, pins, routes and a department
// filter. Ported from the showcase's map chrome; the map document itself
// will come from GET /v1/store/:no/map/:version once that route lands.

import { $, $$, ic, esc, dep, DEPT_COLOUR, DEPT_NAME, DEPT_GROUPS, setDepartments } from './ui.js';

let floors = [], mapMeta = null;
// The shell sets the map from the published document (client.maps.get) or
// from a bundled file when the store has none published yet. Each floor's
// svg is kept as its viewBox plus inner markup; mountMap puts every floor
// into one <svg> and shows one at a time, as the legacy viewer did.
export function setMap(doc) {
  if (!doc) { floors = []; mapMeta = null; return; }
  floors = parseFloors(doc); mapMeta = { version: doc.version, at: doc.at, name: doc.name, floors: floors.map(f => ({ id: f.id, name: f.name, type: f.type })), departments: doc.departments || [] };
  setDepartments(doc.departments);
}
export function parseFloors(doc) {
  const out = [], seen = {};
  for (const [i, f] of (doc.floors || []).entries()) {
    const m = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(f.svg || ''); if (!m) continue;
    const vb = (/viewBox="([^"]+)"/.exec(m[1]) || [])[1] || '0 0 100 100';
    let name = String(f.name || f.id || `Floor ${i + 1}`); if (seen[name]) name += ' ' + (++seen[name]); else seen[name] = 1;
    out.push({ id: String(f.id || 'f' + i), name, type: f.type === 'boh' ? 'boh' : 'foh', vb, inner: m[2] });
  }
  return out;
}
export function mapInfo() { return mapMeta; }
export function hasMap() { return floors.length > 0; }
export function mapFloors() { return floors.map(f => ({ id: f.id, name: f.name, type: f.type })); }
export async function loadMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`map ${res.status}`);
  const text = await res.text();
  floors = parseFloors({ floors: [{ id: 'ground', name: 'Ground', type: 'foh', svg: text }] }); mapMeta = { version: 'bundled', floors: mapFloors(), departments: [] };
  return text;
}
const PLACEHOLDER = '<svg class="map real placeholder" viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1200" height="700" fill="none"/><text x="600" y="330" text-anchor="middle" font-size="36" font-weight="700" fill="#9CA3AF">No map published for this store yet</text><text x="600" y="380" text-anchor="middle" font-size="22" fill="#9CA3AF">The owner publishes one from the admin console, Map tab</text></svg>';

// Shelf segment id as the refresh mode keys it: "A11 S1" (data-full), uppercased.
export function segmentId(g) { return (g.getAttribute('data-full') || (g.getAttribute('data-shelf') + ' ' + (g.getAttribute('data-subname') || '')).trim()).toUpperCase(); }

// Hover tooltip on a shelf, as in the showcase: department chip, shelf id and
// segment, name, Side/End, module count, run direction, then a status line
// from the segment's mark. A view passes `tip(info, g)` to say what its mark
// means ('Refreshed Tue 09:12'); without it the mark's generic label shows.
const MARK_LINE = { done: ['g', 'check', 'Done'], checked: ['b', 'check', 'Checked'], wrong: ['r', 'alert', 'Wrong label found'], focus: ['o', 'asterisk', 'Focus department'], stop: ['o', 'route', 'On the route'], counting: ['y', 'clock', 'Counting'], counted: ['g', 'check', 'Counted'], verified: ['b', 'checks', 'Verified'], due: ['r', 'clock', 'Due'], plana: ['o', 'edit', 'Planned'], planb: ['o', 'edit', 'Planned'], planc: ['o', 'edit', 'Planned'] };
export function tipLine(cls, icon, text) { return `<span class="mx ${cls}">${ic(icon)}${esc(text)}</span>`; }
function tipHtml(api, g, tip) {
  const info = api.shelfInfo(g);
  const r = g.querySelector('.shelf'); const horiz = r && (+r.getAttribute('width') >= +r.getAttribute('height'));
  const side = /^S/i.test(info.sub) ? 'Side' : /^E/i.test(info.sub) ? 'End' : (info.sub || '—');
  const mark = g.getAttribute('data-mark') || '';
  let mx = tip ? tip({ ...info, mark }, g) : undefined;
  if (mx === undefined) { const m = MARK_LINE[mark]; mx = m ? tipLine(m[0], m[1], m[2]) : ''; }
  return `<div class="md"><span class="dep" style="background:${DEPT_COLOUR[info.dept] || '#64748B'}">${esc(info.dept.toUpperCase())}</span><span class="shid"><b>${esc(info.id)}</b>${info.sub ? `<small>${esc(info.sub)}</small>` : ''}</span></div>` +
    `<div class="mr"><b>${esc(DEPT_NAME[info.dept] || info.dept)}</b><span>${ic('side')}${esc(side)}</span><span>${ic('grid')}${info.segments} module${info.segments === 1 ? '' : 's'}</span><span>${ic('orient')}${horiz ? 'Horizontal run' : 'Vertical run'}</span>${mx || ''}</div>`;
}

// Badges: one per shelf name on a sales floor, drawn over the whole shelf
// so the name reads when zoomed out; they fade into the per-module labels
// as the map zooms in (the legacy viewer's shelf badges).
const BADGE_START = 5.5, BADGE_END = 8;   // zoom factors, relative to the floor fitted
function buildBadges(floorEl) {
  const NS = 'http://www.w3.org/2000/svg', byName = new Map();
  for (const g of floorEl.querySelectorAll('.shelf-group[data-shelf]')) {
    const name = g.getAttribute('data-shelf'); if (!name || name.startsWith('_u')) continue;
    const r = g.querySelector('.shelf'); if (!r) continue;
    let x0, y0, x1, y1;
    if (r.tagName === 'circle') { const cx = +r.getAttribute('cx'), cy = +r.getAttribute('cy'), rr = +r.getAttribute('r'); x0 = cx - rr; y0 = cy - rr; x1 = cx + rr; y1 = cy + rr; }
    else { x0 = +r.getAttribute('x'); y0 = +r.getAttribute('y'); x1 = x0 + +r.getAttribute('width'); y1 = y0 + +r.getAttribute('height'); }
    if (!isFinite(x0 + y0 + x1 + y1)) continue;
    const b = byName.get(name) || { name, dept: (g.getAttribute('data-dept') || '').toLowerCase(), x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, locs: new Set() };
    b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1);
    for (const l of (g.getAttribute('data-locations') || '').split(',')) if (l) b.locs.add(l);
    byName.set(name, b);
  }
  const badges = [...byName.values()].map(b => {
    const label = b.locs.size > 1 ? [...b.locs].sort((a, c) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(c.replace(/\D/g, '')) || 0)).join(', ') : b.locs.size === 1 ? [...b.locs][0] : b.name;
    return { ...b, label, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: Math.max(label.length * 12 + 12, 50), h: 32, dx: 0, dy: 0 };
  });
  for (let pass = 0; pass < 5; pass++) {           // nudge overlapping badges apart
    let any = false;
    for (let i = 0; i < badges.length; i++) for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i], b = badges[j], acx = a.cx + a.dx, acy = a.cy + a.dy, bcx = b.cx + b.dx, bcy = b.cy + b.dy;
      const ox = (a.w / 2 + b.w / 2 + 4) - Math.abs(acx - bcx), oy = (a.h / 2 + b.h / 2 + 4) - Math.abs(acy - bcy);
      if (ox <= 0 || oy <= 0) continue; any = true;
      if (oy <= ox) { const p = oy / 2 + 1; if (acy <= bcy) { a.dy -= p; b.dy += p; } else { a.dy += p; b.dy -= p; } }
      else { const p = ox / 2 + 1; if (acx <= bcx) { a.dx -= p; b.dx += p; } else { a.dx += p; b.dx -= p; } }
    }
    if (!any) break;
  }
  const layer = document.createElementNS(NS, 'g'); layer.setAttribute('class', 'shelf-badges');
  for (const b of badges) {
    const x = b.cx + b.dx, y = b.cy + b.dy;
    const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('class', 'sb-bg'); bg.setAttribute('x', x - b.w / 2); bg.setAttribute('y', y - b.h / 2); bg.setAttribute('width', b.w); bg.setAttribute('height', b.h); bg.setAttribute('rx', 8); bg.setAttribute('fill', DEPT_COLOUR[b.dept] || '#374151'); bg.setAttribute('data-shelf', b.name);
    const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'sb'); t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('data-shelf', b.name); t.textContent = b.label;
    layer.appendChild(bg); layer.appendChild(t);
  }
  floorEl.appendChild(layer);
}

export function mountMap(stage, { mono = false, cls = '', marks = {}, select = null, onSelect = null, showEmergency = false, tip = null, tips = true, doc = null, badges = true } = {}) {
  const fl = doc ? parseFloors(doc) : floors;
  let cur = fl.find(f => f.type === 'foh') || fl[0];
  stage.innerHTML = cur
    ? `<svg class="map real" viewBox="${cur.vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${fl.map(f => `<g class="mfl" data-fid="${esc(f.id)}" data-ftype="${f.type}" style="${f === cur ? '' : 'visibility:hidden;pointer-events:none'}">${f.inner}</g>`).join('')}</svg>`
    : PLACEHOLDER;
  const svg = stage.querySelector('svg.map.real');
  if (mono) svg.classList.add('mono');
  if (cls) svg.classList.add(...cls.split(' ').filter(Boolean));
  if (showEmergency) svg.classList.add('showem');
  if (badges && cur) for (const f of svg.querySelectorAll('.mfl[data-ftype="foh"]')) buildBadges(f);
  let vb0 = svg.getAttribute('viewBox');
  const floorEl = id => svg.querySelector(`.mfl[data-fid="${cssq(id)}"]`);
  const setLabelFade = () => {
    const z = (Number(vb0.split(' ')[2]) || 1) / (Number(svg.getAttribute('viewBox').split(' ')[2]) || 1);
    const badge = z <= BADGE_START ? 1 : z >= BADGE_END ? 0 : 1 - (z - BADGE_START) / (BADGE_END - BADGE_START);
    svg.style.setProperty('--badge-opacity', badge.toFixed(2)); svg.style.setProperty('--label-opacity', (1 - badge).toFixed(2));
  };
  // Emergency markers are authored at translate(x,y) only; scale them so a
  // sign is about 32px on screen whatever the zoom (the legacy viewer did
  // the same on every viewBox change).
  const markerEls = $$('.emergency-marker[data-x]', svg);
  const scaleMarkers = () => {
    if (!markerEls.length) return;
    const w = svg.getBoundingClientRect().width || 600, vbw = Number(svg.getAttribute('viewBox').split(' ')[2]) || 1;
    const k = Math.max(1, Math.min(12, (32 * vbw / w) / 28)).toFixed(3);
    for (const m of markerEls) m.setAttribute('transform', `translate(${m.getAttribute('data-x')},${m.getAttribute('data-y')}) scale(${k})`);
  };
  const api = {
    svg, stage,
    vb() { return svg.getAttribute('viewBox').split(' ').map(Number); },
    setVb(v) { svg.setAttribute('viewBox', v.join(' ')); scaleMarkers(); setLabelFade(); },
    fit() { svg.setAttribute('viewBox', vb0); svg.classList.remove('zoomed'); scaleMarkers(); setLabelFade(); },
    // floors
    floors() { return fl.map(f => ({ id: f.id, name: f.name, type: f.type })); },
    floorId() { return cur?.id; },
    floor(id) {
      const f = fl.find(x => x.id === id); if (!f || f === cur) return false;
      for (const el of svg.querySelectorAll('.mfl')) { const on = el.getAttribute('data-fid') === f.id; el.style.visibility = on ? '' : 'hidden'; el.style.pointerEvents = on ? '' : 'none'; }
      cur = f; vb0 = f.vb; api.fit();
      stage.dispatchEvent(new CustomEvent('mapfloor', { detail: { id: f.id, name: f.name, type: f.type } }));
      return true;
    },
    // Zoom to the shelves of one or more departments: switches to the floor
    // holding most of them, dims the rest, and says what it found.
    zoomDept(codes) {
      const want = (codes || []).map(c => String(c).toLowerCase());
      if (!want.length) { for (const g of $$('.shelf-group[data-dept]', svg)) g.style.opacity = ''; api.fit(); return null; }
      const perFloor = new Map();
      for (const g of $$('.shelf-group[data-dept]', svg)) { if (!want.includes((g.getAttribute('data-dept') || '').toLowerCase())) continue; const fid = g.closest('.mfl')?.getAttribute('data-fid'); perFloor.set(fid, (perFloor.get(fid) || 0) + 1); }
      const best = [...perFloor.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!best) return { shelves: 0, floor: cur?.name, depts: want };
      api.floor(best[0]);
      let bb = null; const depts = new Set();
      for (const g of $$('.shelf-group[data-dept]', svg)) {
        const d = (g.getAttribute('data-dept') || '').toLowerCase(), hit = want.includes(d), here = g.closest('.mfl')?.getAttribute('data-fid') === best[0];
        g.style.opacity = hit ? '' : '.14';
        if (!hit || !here) continue; depts.add(d);
        const r = g.querySelector('.shelf'); if (!r) continue;
        const x = r.tagName === 'circle' ? +r.getAttribute('cx') - +r.getAttribute('r') : +r.getAttribute('x'), y = r.tagName === 'circle' ? +r.getAttribute('cy') - +r.getAttribute('r') : +r.getAttribute('y');
        const w = r.tagName === 'circle' ? 2 * +r.getAttribute('r') : +r.getAttribute('width'), h = r.tagName === 'circle' ? 2 * +r.getAttribute('r') : +r.getAttribute('height');
        bb = bb ? [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x + w), Math.max(bb[3], y + h)] : [x, y, x + w, y + h];
      }
      if (bb) {
        const pad = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.12; let W = bb[2] - bb[0] + pad * 2, H = bb[3] - bb[1] + pad * 2, x0 = bb[0] - pad, y0 = bb[1] - pad;
        const r0 = svg.getBoundingClientRect(), ar = r0.width / r0.height || 1;
        if (W / H < ar) { const nw = H * ar; x0 -= (nw - W) / 2; W = nw; } else { const nh = W / ar; y0 -= (nh - H) / 2; H = nh; }
        api.setVb([x0, y0, W, H]); svg.classList.add('zoomed');
      }
      return { shelves: best[1], floor: cur?.name, floorType: cur?.type, depts: [...depts], total: [...perFloor.values()].reduce((a, b) => a + b, 0) };
    },
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
    // Search highlight: the given groups get a ring, the rest dim; null clears.
    highlight(groups) {
      for (const g of $$('.shelf-group[data-hl]', svg)) g.removeAttribute('data-hl');
      if (!groups || !groups.length) { svg.classList.remove('has-hl'); return; }
      for (const g of groups) g.setAttribute('data-hl', '1'); svg.classList.add('has-hl');
    },
    zoomTo(id, pad = 700) {
      const fid = api.groups(id)[0]?.closest('.mfl')?.getAttribute('data-fid'); if (fid && fid !== cur?.id) api.floor(fid);
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
  scaleMarkers(); setLabelFade();

  // pan, zoom, tap. Two fingers pinch and pan the map itself (the stage
  // has touch-action:none, so the page never zooms with it).
  let drag = null, pinch = null; const ptrs = new Map();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  stage.addEventListener('wheel', e => { e.preventDefault(); api.zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  svg.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType !== 'mouse') { try { svg.setPointerCapture(e.pointerId); } catch {} }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { v: api.vb(), d: dist(a, b), m: mid(a, b), r: svg.getBoundingClientRect() }; drag = null; return; }
    if (ptrs.size > 2) return;
    drag = { x: e.clientX, y: e.clientY, v: api.vb(), w: svg.getBoundingClientRect().width, moved: false, t: Date.now() };
  });
  svg.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], m = mid(a, b), k = pinch.d / dist(a, b);
      const u = pinch.v[2] / pinch.r.width, px = pinch.v[0] + (pinch.m.x - pinch.r.left) * u, py = pinch.v[1] + (pinch.m.y - pinch.r.top) * u;
      const W = pinch.v[2] * k, H = pinch.v[3] * k, u2 = W / pinch.r.width;
      api.setVb([px - (m.x - pinch.r.left) * u2, py - (m.y - pinch.r.top) * u2, W, H]); svg.classList.add('zoomed');
      return;
    }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; const k = drag.v[2] / drag.w; api.setVb([drag.v[0] - dx * k, drag.v[1] - dy * k, drag.v[2], drag.v[3]]);
  });
  const lift = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  svg.addEventListener('pointerup', e => {
    lift(e);
    if (!drag) return; const { moved, t } = drag; drag = null; if (moved) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    const g = hit.closest?.('.shelf-group[data-shelf]');
    const m = hit.closest?.('.emergency-marker[data-equip-type]');
    if (g && g.getAttribute('data-shelf')) { api.select(g.getAttribute('data-shelf')); onSelect?.({ kind: 'shelf', ...api.shelfInfo(g), el: g, long: Date.now() - t > 500 }); }
    else if (m) onSelect?.({ kind: 'marker', ...api.markers().find(x => x.el === m) });
    else onSelect?.({ kind: 'floor', point: api.pointAt(e.clientX, e.clientY) });
  });
  svg.addEventListener('pointercancel', e => { lift(e); drag = null; });

  // hover tooltip (mouse only; a touch shows nothing, the tap selects)
  if (tips) {
    let tipEl = null, tipFor = null;
    const hide = () => { if (tipEl) tipEl.classList.remove('on'); tipFor = null; };
    stage.addEventListener('pointermove', e => {
      if (e.pointerType && e.pointerType !== 'mouse') return hide();
      const g = e.target.closest?.('.shelf-group[data-shelf]');
      if (!g || !g.getAttribute('data-shelf') || drag?.moved) return hide();
      if (!tipEl) { tipEl = document.createElementNS('http://www.w3.org/1999/xhtml', 'div'); tipEl.className = 'mtip'; stage.appendChild(tipEl); }
      // The content is rebuilt only when the pointer moves to another
      // module; moving within one just follows the pointer, so the icons
      // and words stay put instead of re-rendering on every event.
      if (g !== tipFor) { tipEl.innerHTML = tipHtml(api, g, tip); tipFor = g; }
      tipEl.classList.add('on');
      // Above and to the right of the pointer, so the shelf under it stays
      // visible; flips left or below when it would leave the stage.
      // Pointer coordinates are screen px; the frame renders under a CSS
      // zoom, so divide by it to place the tip in layout px.
      const r = stage.getBoundingClientRect(), k = r.width / (stage.offsetWidth || r.width) || 1;
      const cx = (e.clientX - r.left) / k, cy = (e.clientY - r.top) / k, w = tipEl.offsetWidth, h = tipEl.offsetHeight, sw = stage.offsetWidth, sh = stage.offsetHeight;
      let x = cx + 18, y = cy - h - 18;
      if (x + w > sw - 8) x = cx - w - 18;
      if (x < 8) x = Math.max(8, Math.min(cx - w / 2, sw - w - 8));
      if (y < 8) y = cy + 24;
      if (y + h > sh - 8) y = Math.max(8, sh - h - 8);
      tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
    });
    stage.addEventListener('pointerleave', hide);
    stage.addEventListener('pointerdown', hide);
  }
  return api;
}

function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }

// The bar above a desktop map: find, department chips, zoom, key.
export function mapbar() {
  const chips = [['All', 'grid', '']];
  for (const [label, icon, ids] of DEPT_GROUPS) { if (label === 'Other') for (const id of ids) chips.push([DEPT_NAME[id] || id, { checkouts: 'bag', flex: 'flame', stockroom: 'box' }[id] || 'tag', id]); else chips.push([label, icon, label.toLowerCase()]); }
  const fls = mapFloors(), floorSeg = fls.length > 1 ? `<div class="seg2 floorseg" data-floorseg>${fls.map((f, i) => `<button class="${i === 0 ? 'on' : ''}" data-mapfloor="${esc(f.id)}" title="${f.type === 'boh' ? 'Back of house' : 'Sales floor'}">${esc(f.name)}</button>`).join('')}</div>` : '';
  return `<div class="mapbar"><div class="search"><svg class="i"><use href="icons.svg#i-search"/></svg><input placeholder="Find a shelf, bay or product on the map…" aria-label="Find on map" data-mapfind><svg class="i mic" title="Voice search"><use href="icons.svg#i-mic"/></svg></div>` +
    `<div class="legchips">${chips.map((c, i) => `<span class="chip${i === 0 ? ' on' : ''}" data-mapgroup="${c[2]}">${ic(c[1])}${c[0]}</span>`).join('')}</div>${floorSeg}<div class="legchips subchips" data-subchips hidden></div>` +
    `<div class="zoom" style="margin-left:auto;display:flex;gap:6px"><span class="ibtn" data-zoom="out">${ic('minus')}</span><span class="ibtn" data-zoom="in">${ic('plus')}</span><span class="ibtn" data-zoom="fit" title="Fit">${ic('map')}</span>` +
    `<span class="keywrap"><span class="ibtn" data-key="1" title="Department key">${ic('layers')}</span><div class="keypop"><h4>Department key</h4>${DEPT_GROUPS.map(gp => `<div class="keygrp">${ic(gp[1])}${gp[0]}</div><div class="keygrid">${gp[2].map(d => `<div class="keyrow"><i style="background:${DEPT_COLOUR[d]}"></i><b>${d.toUpperCase()}</b><span>${DEPT_NAME[d]}</span></div>`).join('')}</div>`).join('')}</div></span></div></div>`;
}
export function crumbx(ctx, storeNo, storeName) { const f = mapFloors()[0]; return `<span class="crumbx">${ic('map')}<span data-crumbfloor>${f ? `${f.type.toUpperCase()} · ${esc(f.name)}` : 'FOH · Ground'}</span> <b>${esc(storeNo)}</b>${ctx ? ' › ' + ctx : ''}<span data-crumbdept></span></span>`; }
export function mvMap(o = {}) {
  return `<div class="mv-map mapbox"><div class="mapstage" id="mapstage"></div><div class="mv-mtools"><span class="ibtn scan" data-go="search" title="Scan">${ic('barcode')}</span><span class="ibtn" data-zoom="in">${ic('plus')}</span><span class="ibtn" data-zoom="out">${ic('minus')}</span><span class="ibtn" data-zoom="fit" title="Fit">${ic('map')}</span></div>${o.badge ? `<div class="mv-mbadge" id="mvbadge">${o.badge}</div>` : ''}</div>`;
}

// Wire zoom buttons and group chips on a mounted view.
export function bindMapChrome(root, map) {
  root.addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z) { const k = z.getAttribute('data-zoom'); if (k === 'in') map.zoomBy(1 / 1.3); else if (k === 'out') map.zoomBy(1.3); else map.fit(); return; }
    const key = e.target.closest('[data-key]'); if (key) { key.parentNode.classList.toggle('open'); return; }
    const fb = e.target.closest('[data-mapfloor]');
    if (fb) { map.zoomDept([]); map.floor(fb.getAttribute('data-mapfloor')); for (const c of $$('[data-mapgroup]', root)) c.classList.toggle('on', !c.getAttribute('data-mapgroup')); subchips(null); readout(''); return; }
    const grp = e.target.closest('[data-mapgroup]');
    if (grp) {
      for (const c of $$('[data-mapgroup]', root)) c.classList.toggle('on', c === grp);
      const g = grp.getAttribute('data-mapgroup');
      const group = g ? DEPT_GROUPS.find(x => x[0].toLowerCase() === g) : null;
      const codes = !g ? null : (group?.[2] || [g]);
      const info = map.zoomDept(codes || []);
      subchips(group && group[2].length > 1 ? group : null);
      readout(!codes ? '' : `› ${group ? esc(group[0]) : dep(codes[0]) + ' ' + esc(DEPT_NAME[codes[0]] || codes[0])} · ${info?.shelves || 0} shelves${info && info.total > info.shelves ? ` here, ${info.total} in all` : ''}`);
      return;
    }
    const sub = e.target.closest('[data-mapdept]');
    if (sub) {
      const d = sub.getAttribute('data-mapdept');
      for (const c of $$('[data-mapdept]', root)) c.classList.toggle('on', c === sub);
      const info = map.zoomDept([d]);
      const grp = DEPT_GROUPS.find(x => x[2].includes(d));
      readout(`› ${grp ? esc(grp[0]) + ' › ' : ''}${dep(d)} ${esc(DEPT_NAME[d] || d)} · ${info?.shelves || 0} shelves`);
    }
  });
  // Sub-department chips under the bar once a group is chosen, the floor
  // switch following the map, and the crumb saying where the map is.
  const subchips = group => { const host = root.querySelector('[data-subchips]'); if (!host) return; host.hidden = !group; host.innerHTML = group ? group[2].map(d => `<span class="chip" data-mapdept="${esc(d)}"><i style="background:${DEPT_COLOUR[d] || '#64748B'}"></i><b>${esc(d.toUpperCase())}</b>${esc(DEPT_NAME[d] || d)}</span>`).join('') : ''; };
  const readout = html => { const el = root.querySelector('[data-crumbdept]'); if (el) el.innerHTML = html ? ' ' + html : ''; };
  map.stage.addEventListener('mapfloor', e => {
    const f = e.detail; const el = root.querySelector('[data-crumbfloor]'); if (el) el.textContent = `${f.type.toUpperCase()} · ${f.name}`;
    for (const b of $$('[data-mapfloor]', root)) b.classList.toggle('on', b.getAttribute('data-mapfloor') === f.id);
  });
  const find = root.querySelector('[data-mapfind]');
  if (find) mapFind(root, find, map);
}

// Find on the map, as Vector's search bar worked: suggestions as you type
// (shelf names first, then modules and locations, then departments), the
// matches ringed on the map while typing, recent searches on focus, Enter
// or a click to select and zoom, arrow keys to move through the list.
function mapFind(root, input, map) {
  const box = input.parentElement, ac = document.createElement('div'); ac.className = 'mapac'; box.appendChild(ac);
  const KEY = () => `mapfind_recent:${mapMeta?.name || 'store'}`;
  let idx = null, items = [], focus = -1, timer = null, blurTimer = null;
  const index = () => {
    if (idx) return idx;
    const by = new Map();
    for (const g of map.segments()) {
      const i = map.shelfInfo(g); const e = by.get(i.id) || { name: i.id.toUpperCase(), dept: i.dept, sections: [], locations: new Set() };
      if (i.sub) e.sections.push(i.sub.toUpperCase());
      for (const l of (g.getAttribute('data-locations') || '').split(',')) if (l) e.locations.add(l.toUpperCase());
      by.set(i.id, e);
    }
    return (idx = [...by.values()].map(e => ({ kind: 'shelf', ...e, locations: [...e.locations] })));
  };
  const depts = () => { const out = []; for (const [label, , ids] of DEPT_GROUPS) { if (label !== 'Other') out.push({ kind: 'group', name: label.toUpperCase(), label, ids }); for (const id of ids) out.push({ kind: 'dept', name: id.toUpperCase(), label: DEPT_NAME[id] || id, ids: [id], dept: id }); } return out; };
  const norm = q => q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s-]+/g, '');
  const suggest = q => {
    let Q = norm(q); if (!Q) return [];
    if (/^[A-Z]+\d+[SE]$/.test(Q)) Q = Q.slice(0, -1);           // "B21S" while typing B21 S1
    const exact = [], starts = [], contains = [];
    for (const s of index()) { const n = s.name; if (n === Q) exact.push(s); else if (n.startsWith(Q)) starts.push(s); else if (n.includes(Q) || s.sections.some(x => (n + x).startsWith(Q)) || s.locations.some(l => l.includes(Q))) contains.push(s); }
    const ql = q.trim().toLowerCase();
    const ds = ql.length >= 2 ? depts().filter(d => d.name.toLowerCase().startsWith(ql) || d.label.toLowerCase().includes(ql)).slice(0, 3) : [];
    return [...exact, ...starts, ...contains].slice(0, 6).concat(ds);
  };
  const recent = () => { try { return JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch { return []; } };
  const remember = name => { try { localStorage.setItem(KEY(), JSON.stringify([name, ...recent().filter(x => x !== name)].slice(0, 6))); } catch {} };
  const row = (it, i) => it.kind === 'shelf'
    ? `<div class="row" data-i="${i}"><i class="dot" style="background:${DEPT_COLOUR[it.dept] || '#64748B'}"></i><b class="code">${esc(it.name)}</b><span class="dn">${esc(DEPT_NAME[it.dept] || it.dept)}${it.sections.length ? ` · ${it.sections.length} module${it.sections.length === 1 ? '' : 's'}` : ''}${it.locations.length ? ` · ${esc(it.locations.join(', '))}` : ''}</span>${dep(it.dept)}</div>`
    : `<div class="row" data-i="${i}"><i class="dot" style="background:${it.dept ? DEPT_COLOUR[it.dept] || '#64748B' : 'var(--ink)'}"></i><b class="code">${esc(it.kind === 'group' ? it.label : it.name)}</b><span class="dn">${it.kind === 'group' ? `${it.ids.length} departments` : esc(it.label)}</span><span class="kind">Department</span></div>`;
  const show = (list, header) => { items = list; focus = -1; if (!list.length) return hide(); ac.innerHTML = (header ? `<div class="hdr">${header}<span data-clear>Clear</span></div>` : '') + list.map(row).join(''); ac.classList.add('on'); };
  const hide = () => { ac.classList.remove('on'); ac.innerHTML = ''; items = []; focus = -1; };
  const matchGroups = q => {                         // groups the typed text points at
    let Q = norm(q); if (!Q) return [];
    if (/^[A-Z]+\d+[SE]$/.test(Q)) Q = Q.slice(0, -1);
    const exactSeg = map.segments().filter(g => segmentId(g).replace(/\s+/g, '') === Q);
    if (exactSeg.length) return exactSeg;
    const byName = map.segments().filter(g => (g.getAttribute('data-shelf') || '').toUpperCase() === Q);
    if (byName.length) return byName;
    return Q.length >= 2 ? map.segments().filter(g => { const n = (g.getAttribute('data-shelf') || '').toUpperCase(); return n.startsWith(Q) || (g.getAttribute('data-locations') || '').toUpperCase().includes(Q); }) : [];
  };
  const state = cls => { input.classList.remove('found', 'not-found'); if (cls) input.classList.add(cls); };
  const pick = it => {
    if (it.kind === 'shelf') { const gs = matchGroups(input.value).filter(g => (g.getAttribute('data-shelf') || '').toUpperCase() === it.name); const seg = gs.length === 1 && input.value.replace(/[\s-]+/g, '').toUpperCase() !== it.name ? gs : null; map.select(it.name); map.highlight(seg || map.groups(it.name)); map.zoomTo(it.name); if (!seg) input.value = it.name; remember(input.value.trim().toUpperCase()); state('found'); }
    else { input.value = it.kind === 'group' ? it.label : `${it.name} ${it.label}`; map.highlight(null); const grp = it.kind === 'group' ? it.label.toLowerCase() : (DEPT_GROUPS.find(x => x[2].includes(it.dept) && x[0] !== 'Other')?.[0].toLowerCase() || it.dept); root.querySelector(`[data-mapgroup="${grp}"]`)?.click(); if (it.kind === 'dept' && grp !== it.dept) root.querySelector(`[data-mapdept="${it.dept}"]`)?.click(); remember(input.value); state('found'); }
    hide();
  };
  const submit = () => {
    if (focus >= 0 && items[focus]) return pick(items[focus]);
    const q = input.value.trim(); if (!q) return;
    const gs = matchGroups(q);
    if (gs.length) { const id = gs[0].getAttribute('data-shelf'); map.select(id); map.highlight(gs); map.zoomTo(id); remember(q.toUpperCase()); state('found'); return hide(); }
    const d = suggest(q).find(x => x.kind !== 'shelf'); if (d) return pick(d);
    state('not-found');
  };
  input.addEventListener('input', () => { clearTimeout(timer); const q = input.value; state(''); timer = setTimeout(() => { show(suggest(q)); map.highlight(q.trim() ? matchGroups(q) : null); if (!q.trim()) map.highlight(null); }, 60); });
  input.addEventListener('focus', () => { clearTimeout(blurTimer); if (!input.value.trim()) { const r = recent(); if (r.length) show(r.map(name => index().find(s => s.name === name) || { kind: 'shelf', name, dept: '', sections: [], locations: [] }), 'Recent'); } });
  input.addEventListener('blur', () => { blurTimer = setTimeout(hide, 150); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); focus = (focus + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; for (const r of ac.querySelectorAll('.row')) r.classList.toggle('focused', +r.dataset.i === focus); return; }
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape') { input.value = ''; state(''); map.highlight(null); hide(); input.blur(); }
  });
  ac.addEventListener('mousedown', e => { e.preventDefault(); if (e.target.closest('[data-clear]')) { try { localStorage.removeItem(KEY()); } catch {} return hide(); } const r = e.target.closest('.row'); if (r) pick(items[+r.dataset.i]); });
}
