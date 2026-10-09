// The store map: loads the published SVG once, mounts a copy into a stage,
// and gives views pan/zoom, selection, marks, pins, routes and a department
// filter. Ported from the showcase's map chrome; the map document itself
// will come from GET /v1/store/:no/map/:version once that route lands.

import { $, $$, ic, esc, dep, DEPT_COLOUR, DEPT_NAME, DEPT_GROUPS, setDepartments, camButton, toast } from './ui.js';
import { build as buildGraph, routeBetween, orderStops, pathsOf, evacuationRoute, nearestStairsByWalk, nearestStairsByCoords } from '../shared/route.js';
import { markerGlyph, locationRange, markerSymbol, MARKER_NAMES, LANDMARK_NAMES, markerType } from '../shared/maprender.js';
import { prefs, setPref } from './prefs.js';
import { haptic } from './device.js';

let floors = [], mapMeta = null;
// The shell sets the map from the published document (client.maps.get) or
// from a bundled file when the store has none published yet. Each floor's
// svg is kept as its viewBox plus inner markup; mountMap puts every floor
// into one <svg> and shows one at a time, as the legacy viewer did.
export function setMap(doc) {
  // A new document (or a different store) makes the built template and the
  // mounted copies stale, so drop them here: the next mountMap rebuilds from
  // the new floors instead of re-showing the previous map's shelves. (parkMap
  // only detaches the live element between views; here the map itself changed.)
  tpl = null;
  if (live?.isConnected) live.remove();
  live = pv = null;
  if (!doc) { floors = []; mapMeta = null; return; }
  floors = parseFloors(doc); mapMeta = { version: doc.version, at: doc.at, name: doc.name, floors: floors.map(f => ({ id: f.id, name: f.name, type: f.type })), departments: doc.departments || [], storeInfo: doc.storeInfo || null, metresPerUnit: Number(doc.metresPerUnit) || null };
  setDepartments(doc.departments);
}
export function parseFloors(doc) {
  const out = [], seen = {};
  for (const [i, f] of (doc.floors || []).entries()) {
    const m = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(f.svg || ''); if (!m) continue;
    const vb = (/viewBox="([^"]+)"/.exec(m[1]) || [])[1] || '0 0 100 100';
    let name = String(f.name || f.id || `Floor ${i + 1}`); if (seen[name]) name += ' ' + (++seen[name]); else seen[name] = 1;
    out.push({ id: String(f.id || 'f' + i), name, type: f.type === 'boh' ? 'boh' : 'foh', level: Number(f.level) || 0, vb, inner: m[2], paths: pathsOf(f), graph: undefined });
  }
  return out.sort((a, b) => (a.type === b.type ? 0 : a.type === 'foh' ? -1 : 1) || a.level - b.level);
}
export function mapInfo() { return mapMeta; }
export function hasMap() { return floors.length > 0; }
// The shelf a typed location names, without mounting the map: a shelf name
// or module (A16S1), or a stockroom bay number listed in a module's
// data-locations (7012, or 7042A by its digits, as K2B's storeMapFindLoc).
// A bay answers with its module's code ("A16S2"), never the whole run.
// Indexed once per published map.
let locIndex = null;
export function shelfForLocation(code) {
  if (!floors.length) return null;
  if (!locIndex || locIndex.v !== mapMeta?.version) {
    const idx = new Map(), doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${floors.map(f => f.inner).join('')}</svg>`, 'image/svg+xml');
    for (const g of doc.querySelectorAll('.shelf-group[data-shelf]')) {
      const shelf = g.getAttribute('data-shelf'); if (!shelf) continue;
      const mod = canonCode(shelf + (g.getAttribute('data-subname') || ''));
      if (!idx.has(canonCode(shelf))) idx.set(canonCode(shelf), shelf);
      if (!idx.has(mod)) idx.set(mod, mod);
      for (const l of (g.getAttribute('data-locations') || '').split(/[\s,]+/)) if (l && !idx.has(canonCode(l))) idx.set(canonCode(l), mod);
    }
    locIndex = { v: mapMeta?.version, idx };
  }
  const C = canonCode(code), digits = (/\d{3,}/.exec(C) || [])[0];
  return locIndex.idx.get(C) || (digits && locIndex.idx.get(digits)) || null;
}
// What the published map covers, per floor: named shelves and walk-path
// nodes (the store details' map status). Counted once per map version.
let statsCache = null;
export function mapStats() {
  if (!floors.length) return null;
  if (statsCache?.v !== mapMeta?.version) {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${floors.map(f => `<g data-fid="${esc(f.id)}">${f.inner}</g>`).join('')}</svg>`, 'image/svg+xml');
    statsCache = { v: mapMeta?.version, floors: floors.map(f => { const g = [...doc.documentElement.children].find(x => x.getAttribute('data-fid') === f.id); const names = new Set([...(g?.querySelectorAll('.shelf-group[data-shelf]') || [])].map(x => x.getAttribute('data-shelf')).filter(n => n && !n.startsWith('_u'))); return { id: f.id, name: f.name, type: f.type, shelves: names.size, paths: f.paths?.nodes?.length || 0, emergency: g?.querySelectorAll('.emergency-marker').length || 0 }; }), depts: (() => { const by = {}; for (const g of doc.querySelectorAll('.shelf-group[data-shelf][data-dept]')) { const n = g.getAttribute('data-shelf'), d = g.getAttribute('data-dept').toLowerCase(); if (!n || n.startsWith('_u')) continue; (by[d] ||= new Set()).add(n); } return Object.fromEntries(Object.entries(by).map(([d, set]) => [d, set.size])); })() };
  }
  return statsCache;
}
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
// A code as the store writes it: "A16S1", "a16 s1" and "A16-S1" are the
// same module; "A16" is the whole shelf. Upper case, no spaces or dashes.
// Printed shelf labels pad numbers ("A013S02" is A13 S2), so a leading zero
// after a letter is dropped: the label and the map meet in one form.
export function canonCode(code) { return String(code || '').toUpperCase().replace(/[\s\-_.]+/g, '').replace(/([A-Z])0+(?=\d)/g, '$1'); }
// The groups a code points at: a shelf name first (a shelf can itself be
// called "S1"), then a shelf plus a module suffix (S1, S2, E1, E2). Any
// place that takes a typed or scanned location goes through here, so a
// module is never quietly widened to its whole shelf.
// Split a canonical code into its shelf name and module suffix (S1, S2, E1,
// E2), or an empty suffix for a whole shelf. The one place that decides where
// a module ends and a shelf begins, so search and find never diverge from it.
export function splitCanon(code) { const C = canonCode(code); const m = /^(.+?)([SE]\d+)$/.exec(C); return m ? { shelf: m[1], sub: m[2] } : { shelf: C, sub: '' }; }
export function groupsFor(root, code) {
  const C = canonCode(code); if (!C) return [];
  const all = $$('.shelf-group[data-shelf]', root).filter(g => g.getAttribute('data-shelf'));
  const byName = all.filter(g => canonCode(g.getAttribute('data-shelf')) === C);
  if (byName.length) return byName;
  const { shelf, sub } = splitCanon(C);
  if (sub) { const mods = all.filter(g => canonCode(g.getAttribute('data-shelf')) === shelf && canonCode(g.getAttribute('data-subname')) === sub); if (mods.length) return mods; }
  // A stockroom bay number (7001) names the shelf that lists it in data-locations.
  if (/^\d{3,6}$/.test(C)) return all.filter(g => (g.getAttribute('data-locations') || '').split(/[\s,]+/).includes(C));
  return [];
}
// A typed or wedge-scanned shelf label (Refresh, Stocktake): a USB or
// Bluetooth scanner types the code and presses Enter, which lands here like
// a tap on that shelf; the camera button feeds the same field.
export function shelfScanField(placeholder = 'Scan or type a shelf label') {
  return `<div class="shelfscan">${ic('barcode')}<input data-field="shelfscan" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">${camButton('shelfscan', true)}</div>`;
}
// The one module a scanned or typed label names, or why not: a run's name
// ("A16") covers several modules, and a scan never quietly picks one of them.
export function moduleFor(root, code) {
  const gs = groupsFor(root, code); if (!gs.length) return { error: `${code} is not a shelf on this map` };
  const mods = [...new Set(gs.map(segmentId))];
  if (mods.length > 1) return { error: `${String(code).toUpperCase()} has ${mods.length} modules: scan the module's own label (${mods.slice(0, 3).join(', ')}${mods.length > 3 ? '…' : ''})` };
  return { g: gs[0] };
}
export function bindShelfScan(root, map, onShelf) {
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches?.('[data-field="shelfscan"]')) return;
    e.preventDefault();
    const code = e.target.value.trim(); e.target.value = ''; if (!code) return;
    const { g, error } = moduleFor(map.svg, code);
    if (!g) return toast(error, 'bad');
    onShelf(map.shelfInfo(g));
  });
}
// Repaint a panel that holds the scan field without dropping its focus, so
// a scan-walk can keep going while marks land.
export function keepScanFocus(root, paint) {
  const had = document.activeElement?.matches?.('[data-field="shelfscan"]');
  paint();
  if (had) root.querySelector('[data-field="shelfscan"]')?.focus();
}
// Split a code into { shelf, sub } once it is known on the map.
export function splitCode(root, code) { const gs = groupsFor(root, code); if (!gs.length) return null; const C = canonCode(code), shelf = gs[0].getAttribute('data-shelf'); return { shelf, sub: canonCode(shelf) === C ? '' : canonCode(gs[0].getAttribute('data-subname')), groups: gs }; }

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
  const d = shelfDetail(api, info.code);   // this module's own locations and size, not the whole run's
  return `<div class="md"><span class="dep" style="background:${DEPT_COLOUR[info.dept] || '#64748B'}">${esc(info.dept.toUpperCase())}</span><span class="shid"><b>${esc(info.id)}</b>${info.sub ? `<small>${esc(info.sub)}</small>` : ''}</span></div>` +
    `<div class="mr"><b>${esc(DEPT_NAME[info.dept] || info.dept)}</b>${d.range ? `<span>${ic('tag')}Locations ${esc(d.range)}</span>` : ''}<span>${ic('side')}${esc(fixtureOf(g) || side)}</span><span>${ic('grid')}${info.sub && info.segments > 1 ? `module ${esc(info.sub)} of ${info.segments}` : `${info.segments} module${info.segments === 1 ? '' : 's'}`}</span><span>${ic('orient')}${horiz ? 'Horizontal run' : 'Vertical run'}${d.size ? ' · ' + esc(d.size) : ''}</span>${d.shared.length ? `<span>${ic('stack')}Also ${d.shared.map(x => esc(x)).join(', ')}</span>` : ''}${mx || ''}</div>`;
}
// Tooltips for what is not a shelf: an emergency sign, a price check or
// order screen, a landmark (ShelfSearcher's desktop hover tips).
function markerTip(el) {
  const ga = k => el.getAttribute(k) || '', loc = ga('data-location'), dc = ga('data-loc-dept-color'), badge = ga('data-loc-dept-badge');
  const locLine = loc ? `<span>${dc ? `<i class="dchip" style="background:${esc(dc)}">${esc(badge)}</i>` : ic('m-map')}${esc(loc)}</span>` : '';
  if (el.classList.contains('price-check-marker')) {
    const order = ga('data-variant') === 'order';
    return `<div class="md mk">${markerSymbol(order ? 'order' : 'pc', 30)}</div><div class="mr"><b>${esc(ga('data-label') || (order ? 'Order screen' : 'Price check'))}</b>${locLine}<span>${ic(order ? 'bag' : 'barcode')}${order ? 'Order screen' : 'Price check'}</span>${ga('data-detail') ? `<span class="nt">${esc(clip(ga('data-detail')))}</span>` : ''}</div>`;
  }
  if (el.classList.contains('emergency-marker')) {
    const type = markerType(ga('data-equip-type')), note = ga('data-detail') || ga('data-method');
    return `<div class="md mk">${markerSymbol(type, 30)}</div><div class="mr"><b>${esc(MARKER_NAMES[type] || type)}</b>${ga('data-label') ? `<span>${esc(ga('data-label'))}</span>` : ''}${locLine}<span class="nt">${note ? esc(clip(note)) : 'Click for details'}</span></div>`;
  }
  const label = ga('data-label') || [...el.querySelectorAll('.landmark-label')].map(t => t.textContent).join(' '), icon = ga('data-icon');
  return `<div class="md mk">${icon && LANDMARK_NAMES[icon] ? markerSymbol('lm:' + icon, 28) : ic('m-map')}</div><div class="mr"><b>${esc(label || LANDMARK_NAMES[icon] || 'Landmark')}</b><span>${esc(icon && LANDMARK_NAMES[icon] && label ? LANDMARK_NAMES[icon] : 'Landmark')}</span></div>`;
}
const clip = t => t.length > 60 ? t.slice(0, 57) + '…' : t;

// Fixture names (the editor's fixture field, else the module letter: S side,
// E or P end), and what a shelf is in the real world when the map is
// calibrated (metresPerUnit, the editor's Set Scale).
const FIXTURE = { side: 'Side', end: 'End', deck: 'Deck', bunk: 'Bunk', table: 'Table', sixway: 'Six-way' };
export function fixtureOf(g) {
  const f = g.getAttribute('data-fixture'); if (f) return FIXTURE[f] || f;
  const sn = (g.getAttribute('data-subname') || '').toUpperCase();
  return /^S\d/.test(sn) ? 'Side' : /^[EP]\d/.test(sn) ? 'End' : g.querySelector('circle.shelf') ? 'Six-way' : '';
}
// A shelf's facts for the card and the tip: its fixture, its location range
// ("7001-03"), the shelves it shares a name with (sharedName shelves of a
// different name within 40 units, as ShelfSearcher paired them), and its
// size in metres.
export function shelfDetail(api, id) {
  const gs = api.groups(id), out = { fixture: '', range: '', locations: [], shared: [], size: '' };
  if (!gs.length) return out;
  const fx = [...new Set(gs.map(fixtureOf).filter(Boolean))]; out.fixture = fx.join(' / ');
  const locs = [...new Set(gs.flatMap(g => (g.getAttribute('data-locations') || '').split(',').filter(Boolean)))];
  if (locs.length) { out.locations = locs; out.range = locationRange(locs); }
  const box = g => { const r = g.querySelector('.shelf'); if (!r) return null; if (r.tagName === 'circle') { const cx = +r.getAttribute('cx'), cy = +r.getAttribute('cy'), rr = +r.getAttribute('r'); return { x: cx - rr, y: cy - rr, w: rr * 2, h: rr * 2, round: true }; } return { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }; };
  if (gs.some(g => g.hasAttribute('data-shared'))) {
    const mine = gs.map(box).filter(Boolean), name = gs[0].getAttribute('data-shelf'), PROX = 40;
    for (const g of $$('.shelf-group[data-shared]', api.svg)) {
      const n = g.getAttribute('data-shelf'); if (!n || n === name || out.shared.includes(n)) continue;
      const b = box(g); if (b && mine.some(m => Math.abs((m.x + m.w / 2) - (b.x + b.w / 2)) <= PROX + (m.w + b.w) / 2 && Math.abs((m.y + m.h / 2) - (b.y + b.h / 2)) <= PROX + (m.h + b.h) / 2)) out.shared.push(n);
    }
  }
  const mpu = mapMeta?.metresPerUnit;
  if (mpu) {
    const bs = gs.map(box).filter(Boolean), m = v => (v * mpu).toFixed(1);
    if (bs.length && bs.every(b => b.round)) out.size = `${m(bs[0].w)} m across`;
    else if (bs.length) { const long = bs.reduce((n, b) => n + Math.max(b.w, b.h), 0), deep = Math.max(...bs.map(b => Math.min(b.w, b.h))); out.size = `≈ ${m(long)} m long · ${m(deep)} m deep`; }
  }
  return out;
}

// The symbols on the published map, for the legend: emergency signs,
// price checks and order screens, landmark icons and tory lines, each with
// how many there are. Read once per map from the floors' markup.
let symCache = null;
export function mapSymbols() {
  if (symCache?.v === mapMeta?.version && symCache.n === floors.length) return symCache.list;
  const all = floors.map(f => f.inner).join(''), count = re => (all.match(re) || []).length, list = [];
  const types = {}; for (const m of all.matchAll(/class="emergency-marker" data-equip-type="([^"]+)"/g)) { const t = markerType(m[1]); types[t] = (types[t] || 0) + 1; }
  for (const [t, n] of Object.entries(types)) list.push({ kind: t, name: MARKER_NAMES[t] || t, n, group: 'Emergency' });
  const pc = count(/class="price-check-marker" data-variant="pc"/g), ord = count(/class="price-check-marker" data-variant="order"/g);
  if (pc) list.push({ kind: 'pc', name: 'Price check', n: pc, group: 'Store' }); if (ord) list.push({ kind: 'order', name: 'Order screen', n: ord, group: 'Store' });
  const lms = {}; for (const m of all.matchAll(/class="landmark-group"[^>]*data-icon="([^"]+)"/g)) if (LANDMARK_NAMES[m[1]]) lms[m[1]] = (lms[m[1]] || 0) + 1;
  for (const [k, n] of Object.entries(lms)) list.push({ kind: 'lm:' + k, name: LANDMARK_NAMES[k], n, group: 'Store' });
  const tory = count(/class="tory-line-path"/g); if (tory) list.push({ kind: 'tory', name: 'Tory line (back of house)', n: tory, group: 'Store' });
  symCache = { v: mapMeta?.version, n: floors.length, list };
  return list;
}
export function symbolsHtml(list = mapSymbols()) {
  if (!list.length) return '<p class="lbl">This map has no symbols yet.</p>';
  return ['Emergency', 'Store'].map(gp => { const rows = list.filter(x => x.group === gp); return rows.length ? `<div class="keygrp">${gp}</div><div class="symgrid">${rows.map(x => `<div class="symrow">${markerSymbol(x.kind, 22)}<span>${esc(x.name)}</span><small>${x.n}</small></div>`).join('')}</div>` : ''; }).join('');
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
    const label = b.locs.size ? locationRange([...b.locs]) : b.name;   // "7001-03"
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
    const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('class', 'sb-bg'); bg.setAttribute('x', x - b.w / 2); bg.setAttribute('y', y - b.h / 2); bg.setAttribute('width', b.w); bg.setAttribute('height', b.h); bg.setAttribute('rx', 8); bg.setAttribute('fill', DEPT_COLOUR[b.dept] || '#374151'); bg.setAttribute('data-shelf', b.name); bg.setAttribute('data-dept', b.dept);
    const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'sb'); t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('data-shelf', b.name); t.setAttribute('data-dept', b.dept); t.textContent = b.label;
    layer.appendChild(bg); layer.appendChild(t);
  }
  floorEl.appendChild(layer);
}

// The map's DOM is built once per published document (parsing 800 KB of
// markup and laying out every badge is the slow part) and each view gets
// a clone: a clone of 1,200 groups costs a few milliseconds, a parse
// costs hundreds, and a fresh clone means no marks, overlays or classes
// leak from the last view.
let tpl = null, live = null, pv = null;
// The shell calls this before it replaces a view's content: the live map
// steps out first, so the next view re-inserts the same element instead of
// the browser destroying five thousand nodes and building them again.
export function parkMap() { if (live?.isConnected) live.remove(); }
// Everything a view can leave on the map, undone: marks, selection, find
// rings, dimming, route and pins, plan colours, classes, floor and zoom.
function resetLive(svg, fl) {
  svg.setAttribute('class', 'map real'); svg.removeAttribute('data-deptzoom'); svg.removeAttribute('data-focus'); svg.removeAttribute('style');
  for (const el of [...svg.children]) if (!el.classList.contains('mfl')) el.remove();
  for (const g of svg.querySelectorAll('.shelf-group')) {
    for (const a of ['data-mark', 'data-sel', 'data-hl', 'data-onroute', 'data-dim', 'data-plan', 'data-heat', 'data-paint']) if (g.hasAttribute(a)) g.removeAttribute(a);
    if (g.style.length) g.removeAttribute('style');
    const r = g.firstElementChild; if (r && r.style.length) r.removeAttribute('style');
  }
  for (const d of svg.querySelectorAll('.plan-dot')) d.remove();
  for (const b of svg.querySelectorAll('.shelf-badges [data-onroute]')) b.removeAttribute('data-onroute');
  const cur = fl.find(f => f.type === 'foh') || fl[0];
  for (const el of svg.querySelectorAll('.mfl')) el.style.display = el.getAttribute('data-fid') === cur.id ? '' : 'none';
  svg.setAttribute('viewBox', cur.vb);
}
function template(fl) {
  const main = fl === floors;
  if (main && tpl) return tpl;
  const cur = fl.find(f => f.type === 'foh') || fl[0];
  const host = document.createElement('div');
  host.innerHTML = `<svg class="map real" viewBox="${cur.vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${fl.map(f => `<g class="mfl" data-fid="${esc(f.id)}" data-ftype="${f.type}" style="${f === cur ? '' : 'display:none'}">${f.inner}</g>`).join('')}</svg>`;
  const svg = host.firstElementChild;
  for (const f of svg.querySelectorAll('.mfl[data-ftype="foh"]')) buildBadges(f);
  // Legacy raw-SVG maps draw some marker icons with an icon font the shell
  // does not load (the AED showed as a blank disc): draw them as paths.
  for (const t of svg.querySelectorAll('.emergency-marker text[font-family="tabler-icons"]')) {
    const glyph = markerGlyph(t.closest('.emergency-marker').getAttribute('data-equip-type'), t.getAttribute('fill') || '#ffffff');
    if (glyph) t.outerHTML = glyph; else t.remove();
  }
  if (main) tpl = svg;
  return svg;
}
// clone: true builds a throwaway copy; 'preview' reuses one kept for the
// search palette's small map, so opening the palette never pays for a
// fresh five-thousand-node tree.
export function mountMap(stage, { mono = false, cls = '', marks = {}, select = null, onSelect = null, showEmergency = false, tip = null, tips = true, doc = null, badges = true, clone = false } = {}) {
  const fl = doc ? parseFloors(doc) : floors;
  let cur = fl.find(f => f.type === 'foh') || fl[0];
  // A view gets the one live map element (reset, moved into its stage); a
  // preview that must not disturb the view behind it asks for a clone.
  const shared = cur && fl === floors && !clone;
  if (shared) { if (!live) live = template(fl).cloneNode(true); resetLive(live, fl); stage.replaceChildren(live); }
  else if (cur && fl === floors && clone === 'preview') { if (!pv) pv = template(fl).cloneNode(true); resetLive(pv, fl); stage.replaceChildren(pv); }
  else if (cur) stage.replaceChildren(template(fl).cloneNode(true)); else stage.innerHTML = PLACEHOLDER;
  const svg = stage.querySelector('svg.map.real');
  if (mono) svg.classList.add('mono');
  if (cls) svg.classList.add(...cls.split(' ').filter(Boolean));
  if (showEmergency) svg.classList.add('showem');
  if (!badges) svg.classList.add('nobadges');
  const graphFor = f => { if (!f) return null; if (f.graph === undefined) f.graph = f.paths ? buildGraph(f.paths) : null; return f.graph; };
  const floorEl = id => svg.querySelector(`.mfl[data-fid="${cssq(id)}"]`);
  // A floor's authored viewBox can be tighter than what is drawn on it (the
  // Busselton stockroom rows sit above it). Measure the drawing once per
  // floor, the first time it shows, and widen the fit to take it all in.
  const fitFloor = f => {
    if (!f || f.fitted) return;
    try {
      const b = floorEl(f.id)?.getBBox(); if (!b || !b.width || !b.height) return;   // hidden: try again next time
      f.fitted = true;
      const [x, y, w, h] = f.vb.split(/[\s,]+/).map(Number), pad = Math.max(b.width, b.height) * 0.015;
      const x0 = Math.min(x, b.x - pad), y0 = Math.min(y, b.y - pad), x1 = Math.max(x + w, b.x + b.width + pad), y1 = Math.max(y + h, b.y + b.height + pad);
      if (x0 < x || y0 < y || x1 > x + w || y1 > y + h) f.vb = [x0, y0, x1 - x0, y1 - y0].map(n => Math.round(n)).join(' ');
    } catch { /* not laid out yet: keep the authored box */ }
  };
  fitFloor(cur);
  if (cur) svg.setAttribute('viewBox', cur.vb);
  let vb0 = svg.getAttribute('viewBox');
  // Zoom stays between a fortieth of the floor and a little wider than it,
  // and the centre stays on the floor, so the map cannot be lost off-screen.
  const clampVb = v => {
    const b = vb0.split(' ').map(Number); let [x, y, w, h] = v; if (!(w > 0 && h > 0)) return b;
    const k = Math.min(Math.max(w, b[2] / 40), b[2] * 1.6) / w, cx = Math.min(Math.max(x + w / 2, b[0]), b[0] + b[2]), cy = Math.min(Math.max(y + h / 2, b[1]), b[1] + b[3]);
    w *= k; h *= k; return [cx - w / 2, cy - h / 2, w, h];
  };
  const setLabelFade = () => {
    const z = (Number(vb0.split(' ')[2]) || 1) / (Number(svg.getAttribute('viewBox').split(' ')[2]) || 1);
    const badge = z <= BADGE_START ? 1 : z >= BADGE_END ? 0 : 1 - (z - BADGE_START) / (BADGE_END - BADGE_START);
    svg.style.setProperty('--badge-opacity', badge.toFixed(2)); svg.style.setProperty('--label-opacity', (1 - badge).toFixed(2));
    // Two thousand module labels that are invisible when zoomed out still
    // cost a layout and a paint each; take them out of the tree until the
    // badges start handing over (views without badges keep them).
    svg.style.setProperty('--label-display', badge >= 1 && !svg.classList.contains('nobadges') ? 'none' : 'inline');
  };
  // Emergency markers are authored at translate(x,y) only; scale them so a
  // sign is about 32px on screen whatever the zoom (the legacy viewer did
  // the same on every viewBox change).
  const markerEls = $$('.emergency-marker[data-x]', svg), pcEls = $$('.price-check-marker[data-x]', svg);
  let pcMode = prefs().priceChecks || 'small', pcScaled = false;
  const scaleMarkers = () => {
    if (!markerEls.length && !pcEls.length) return;
    const w = svg.getBoundingClientRect().width || 600, vbw = Number(svg.getAttribute('viewBox').split(' ')[2]) || 1;
    const k = Math.max(1, Math.min(12, (32 * vbw / w) / 28)).toFixed(3);
    for (const m of markerEls) m.setAttribute('transform', `translate(${m.getAttribute('data-x')},${m.getAttribute('data-y')}) scale(${k})`);
    // Large price checks hold about 32px on screen (ShelfSearcher's size
    // cycle); small ones keep their drawn size and scale with the map.
    if (pcMode === 'large') { const kp = Math.max(1, Math.min(12, (32 * vbw / w) / 26)).toFixed(3); for (const m of pcEls) m.setAttribute('transform', `translate(${m.getAttribute('data-x')},${m.getAttribute('data-y')}) scale(${kp})`); pcScaled = true; }
    else if (pcScaled) { for (const m of pcEls) m.setAttribute('transform', `translate(${m.getAttribute('data-x')},${m.getAttribute('data-y')})`); pcScaled = false; }
  };
  // Animated moves (ease-out cubic, as the legacy viewer's animateViewBox):
  // the viewBox steps once a frame; a new move or a touch cancels the last.
  let anim = 0;
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animateTo = (target, ms = 300) => {
    cancelAnimationFrame(anim); const to = clampVb(target);
    if (reduced() || ms <= 0 || !svg.isConnected) { api.setVb(to); return; }
    const from = api.vb(), t0 = performance.now();
    const step = now => { const p = Math.min(1, (now - t0) / ms), e = 1 - (1 - p) ** 3; api.setVb(from.map((f, i) => f + (to[i] - f) * e)); if (p < 1) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step);
  };
  const api = {
    svg, stage,
    vb() { return svg.getAttribute('viewBox').split(' ').map(Number); },
    setVb(v) { svg.setAttribute('viewBox', clampVb(v).join(' ')); scaleMarkers(); setLabelFade(); },
    animateTo,
    fit(ms = 0) { cancelAnimationFrame(anim); svg.classList.remove('zoomed'); if (ms) animateTo(vb0.split(' ').map(Number), ms); else { svg.setAttribute('viewBox', vb0); scaleMarkers(); setLabelFade(); } },
    // floors
    floors() { return fl.map(f => ({ id: f.id, name: f.name, type: f.type })); },
    floorId() { return cur?.id; },
    floor(id) {
      const f = fl.find(x => x.id === id); if (!f || f === cur) return false;
      for (const el of svg.querySelectorAll('.mfl')) el.style.display = el.getAttribute('data-fid') === f.id ? '' : 'none';
      cur = f; fitFloor(f); vb0 = f.vb; api.fit(); svg.classList.toggle('on-boh', f.type === 'boh');
      stage.dispatchEvent(new CustomEvent('mapfloor', { detail: { id: f.id, name: f.name, type: f.type } }));
      return true;
    },
    // Zoom to the shelves of one or more departments: switches to the floor
    // holding most of them, dims the rest, and says what it found.
    zoomDept(codes) { return api.zoomDeptOn(codes, null); },
    zoomDeptOn(codes, floorId) {
      const want = (codes || []).map(c => String(c).toLowerCase());
      if (!want.length) { for (const g of $$('.shelf-group[data-dept]', svg)) { g.style.opacity = ''; g.removeAttribute('data-dim'); } svg.removeAttribute('data-deptzoom'); api.fit(); return null; }
      const perFloor = new Map();
      for (const g of $$('.shelf-group[data-dept]', svg)) { if (!want.includes((g.getAttribute('data-dept') || '').toLowerCase())) continue; const fid = g.closest('.mfl')?.getAttribute('data-fid'); perFloor.set(fid, (perFloor.get(fid) || 0) + 1); }
      const best = floorId && perFloor.has(floorId) ? [floorId, perFloor.get(floorId)] : [...perFloor.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!best) return { shelves: 0, floor: cur?.name, depts: want, floors: [] };
      api.floor(best[0]); haptic('navigate');
      svg.setAttribute('data-deptzoom', want.join(' '));
      let bb = null; const depts = new Set();
      for (const g of $$('.shelf-group[data-dept]', svg)) {
        const d = (g.getAttribute('data-dept') || '').toLowerCase(), hit = want.includes(d), here = g.closest('.mfl')?.getAttribute('data-fid') === best[0];
        g.style.opacity = hit ? '' : '.14'; if (hit) g.removeAttribute('data-dim'); else g.setAttribute('data-dim', '1');
        if (!hit || !here) continue; depts.add(d);
        const r = g.querySelector('.shelf'); if (!r) continue;
        const x = r.tagName === 'circle' ? +r.getAttribute('cx') - +r.getAttribute('r') : +r.getAttribute('x'), y = r.tagName === 'circle' ? +r.getAttribute('cy') - +r.getAttribute('r') : +r.getAttribute('y');
        const w = r.tagName === 'circle' ? 2 * +r.getAttribute('r') : +r.getAttribute('width'), h = r.tagName === 'circle' ? 2 * +r.getAttribute('r') : +r.getAttribute('height');
        bb = bb ? [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x + w), Math.max(bb[3], y + h)] : [x, y, x + w, y + h];
      }
      // One department with a zoom box drawn in the editor opens to that
      // box; otherwise the frame is its shelves plus 12%.
      const zb = want.length === 1 ? floorEl(best[0])?.querySelector(`.dept-zoom[data-dept="${cssq(want[0])}"]`) : null;
      if (zb) bb = [+zb.getAttribute('x'), +zb.getAttribute('y'), +zb.getAttribute('x') + +zb.getAttribute('width'), +zb.getAttribute('y') + +zb.getAttribute('height')];
      if (bb) {
        const pad = zb ? 0 : Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.12; let W = bb[2] - bb[0] + pad * 2, H = bb[3] - bb[1] + pad * 2, x0 = bb[0] - pad, y0 = bb[1] - pad;
        const r0 = svg.getBoundingClientRect(), ar = r0.width / r0.height || 1;
        if (W / H < ar) { const nw = H * ar; x0 -= (nw - W) / 2; W = nw; } else { const nh = W / ar; y0 -= (nh - H) / 2; H = nh; }
        animateTo([x0, y0, W, H], 400); svg.classList.add('zoomed');
      }
      return { shelves: best[1], floor: cur?.name, floorType: cur?.type, depts: [...depts], total: [...perFloor.values()].reduce((a, b) => a + b, 0), floors: [...perFloor.entries()].map(([id, n]) => ({ id, name: fl.find(x => x.id === id)?.name || id, shelves: n })) };
    },
    zoomBy(f, cx, cy, ms = 0) {
      cancelAnimationFrame(anim);
      const v = api.vb(), r = svg.getBoundingClientRect();
      const px = cx == null ? .5 : (cx - r.left) / r.width, py = cy == null ? .5 : (cy - r.top) / r.height;
      const nw = v[2] * f, nh = v[3] * f, to = [v[0] + (v[2] - nw) * px, v[1] + (v[3] - nh) * py, nw, nh];
      if (ms) animateTo(to, ms); else api.setVb(to);
      if (f < 1) svg.classList.add('zoomed');
    },
    groups(id) { return groupsFor(svg, id); },
    code(id) { return splitCode(svg, id); },
    graph() { return graphFor(cur); },
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
      animateTo([c[0] - w / 2, c[1] - h / 2, w, h], 400); svg.classList.add('zoomed');
    },
    clearOverlays() { for (const el of $$('.route-layer,.route-path,.route-n,.pin', svg)) el.remove(); for (const g of $$('[data-onroute]', svg)) g.removeAttribute('data-onroute'); svg.classList.remove('has-route'); },
    // The pick route as ShelfSearcher drew it: legs along the walk-path
    // network (a straight line where a floor has none), a teal ribbon with
    // white pulses running the way of travel and chevrons at each bend, a
    // numbered stop on each shelf (green start, amber next, grey picked),
    // and every other shelf greyed so the route reads at a glance. Only
    // the stops on the shown floor draw; the rest keep their numbers.
    drawRoute(ids, done = []) {
      api.clearOverlays();
      const NS = 'http://www.w3.org/2000/svg';
      const stops = ids.map((id, i) => ({ id, n: i + 1, c: api.centreOf(id), here: api.groups(id)[0]?.closest('.mfl')?.getAttribute('data-fid') === cur?.id, done: done.includes(id) })).filter(st => st.c);
      if (!stops.length) return { dist: 0, stops: 0 };
      const layer = document.createElementNS(NS, 'g'); layer.setAttribute('class', 'route-layer'); layer.setAttribute('pointer-events', 'none');
      const graph = graphFor(cur), full = vb0.split(' ').map(Number), dim = Math.min(full[2], full[3]) || 1000;
      const onFloor = stops.filter(st => st.here), firstUndone = onFloor.findIndex(st => !st.done);
      // Stops on other floors: the walk comes in from the stairs nearest
      // where the last floor left off and goes out by the stairs nearest the
      // last stop here (ShelfSearcher's per-floor entry and exit).
      const legs = api.stairsLegs(ids)[cur?.id] || {};
      const wps = [...(legs.entry ? [{ c: [legs.entry.x, legs.entry.y], stairs: 'in' }] : []), ...onFloor, ...(legs.exit ? [{ c: [legs.exit.x, legs.exit.y], stairs: 'out' }] : [])];
      const off = legs.entry ? 1 : 0;
      let total = 0;
      for (let i = 0; i < wps.length - 1; i++) {
        const A = { x: wps[i].c[0], y: wps[i].c[1] }, B = { x: wps[i + 1].c[0], y: wps[i + 1].c[1] };
        const leg = graph ? routeBetween(graph, A, B) : null, pts = leg ? leg.points : [A, B];
        total += leg ? leg.dist : Math.hypot(A.x - B.x, A.y - B.y);
        const d = pts.map((p, k) => (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' '), active = firstUndone < 0 ? (legs.exit && i === wps.length - 2) : i === firstUndone + off - 1;
        const line = document.createElementNS(NS, 'path'); line.setAttribute('d', d); line.setAttribute('class', 'pick-route-line' + (active ? ' active' : '')); layer.appendChild(line);
        const flow = document.createElementNS(NS, 'path'); flow.setAttribute('d', d); flow.setAttribute('class', 'pick-route-flow'); layer.appendChild(flow);
        const size = Math.max(8, dim * 0.011);
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); if (len < size * 2.5) continue;
          const arrow = document.createElementNS(NS, 'path'); arrow.setAttribute('d', `M${-size * 0.5} ${-size * 0.6} L${size * 0.5} 0 L${-size * 0.5} ${size * 0.6}`);
          arrow.setAttribute('transform', `translate(${((a.x + b.x) / 2).toFixed(1)},${((a.y + b.y) / 2).toFixed(1)}) rotate(${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)})`); arrow.setAttribute('class', 'pick-route-arrow' + (active ? ' active' : '')); layer.appendChild(arrow);
        }
      }
      const r = Math.max(22, dim * 0.026), fs = Math.max(13, dim * 0.016);
      for (const st of onFloor) {
        const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'path-badge' + (st.n === 1 ? ' start' : '') + (st.done ? ' completed' : '') + (onFloor[firstUndone] === st ? ' current' : '')); g.setAttribute('transform', `translate(${st.c[0]},${st.c[1]})`);
        const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'path-badge-bg'); c.setAttribute('r', r); g.appendChild(c);
        const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'path-badge-text'); t.setAttribute('font-size', fs); t.textContent = String(st.n); g.appendChild(t);
        layer.appendChild(g);
      }
      for (const w of wps) {
        if (!w.stairs) continue;
        const rr = Math.max(16, dim * 0.018), u = rr * 0.42, [x, y] = w.c, g = document.createElementNS(NS, 'g'); g.setAttribute('class', `route-stairs-marker ${w.stairs}`);
        g.innerHTML = `<circle cx="${x}" cy="${y}" r="${rr}"/><path class="route-stairs-glyph" d="M${x - u * 1.3} ${y + u * 1.1} h${u} v-${u} h${u} v-${u} h${u}"/>`;
        layer.appendChild(g);
      }
      for (const st of stops) for (const g of api.groups(st.id)) { g.setAttribute('data-onroute', st.done ? 'done' : '1'); for (const b of $$(`.shelf-badges [data-shelf="${cssq(g.getAttribute('data-shelf'))}"]`, svg)) b.setAttribute('data-onroute', '1'); }
      svg.classList.add('has-route');
      svg.appendChild(layer);
      const mpu = mapMeta?.metresPerUnit;
      return { dist: total, metres: mpu ? Math.round(total * mpu) : null, stops: onFloor.length, network: !!graph, entry: !!legs.entry, exit: !!legs.exit };
    },
    // The floors a list visits, in the order it reaches them, with each
    // floor's codes: the plan the pick list shows floor by floor.
    floorPlan(ids) {
      const seq = [];
      for (const id of ids) { const fid = api.groups(id)[0]?.closest('.mfl')?.getAttribute('data-fid'); if (!fid) continue; let f = seq.find(x => x.id === fid); if (!f) { const fl0 = fl.find(x => x.id === fid); f = { id: fid, name: fl0?.name || fid, type: fl0?.type || 'foh', codes: [] }; seq.push(f); } f.codes.push(id); }
      return seq;
    },
    // Per floor: where the walk enters (stairs nearest the previous floor's
    // exit, stairwells pair across floors by position) and leaves (stairs
    // nearest the last stop by walk), for a list in walk order.
    stairsLegs(ids) {
      const out = {}, plan = api.floorPlan(ids); let prev = null;
      plan.forEach((f, i) => {
        const graph = graphFor(fl.find(x => x.id === f.id)), legs = (out[f.id] = {});
        if (i > 0 && graph && prev) legs.entry = nearestStairsByCoords(graph, prev);
        if (i < plan.length - 1) {
          const c = api.centreOf(f.codes[f.codes.length - 1]), last = c ? { x: c[0], y: c[1] } : null;
          const ex = graph && last ? nearestStairsByWalk(graph, last) : null;
          if (ex) legs.exit = ex.node;
          prev = ex ? { x: ex.node.x, y: ex.node.y } : last;
        }
      });
      return out;
    },
    // The walk order for a list of codes: the first stays the start, the
    // rest follow the shortest walk over the network (per floor, floors
    // in map order). Codes not on the map keep their place at the end.
    planOrder(ids) {
      const byFloor = new Map(), missing = [];
      for (const id of ids) { const g = api.groups(id)[0]; if (!g) { missing.push(id); continue; } const fid = g.closest('.mfl')?.getAttribute('data-fid'); if (!byFloor.has(fid)) byFloor.set(fid, []); byFloor.get(fid).push(id); }
      const first = byFloor.keys().next().value;
      const seq = [...byFloor.keys()].sort((a, b) => (a === first ? -1 : b === first ? 1 : 0) || fl.findIndex(f => f.id === a) - fl.findIndex(f => f.id === b));
      const out = []; let prev = null;
      seq.forEach((fid, fi) => {
        const codes = byFloor.get(fid), f = fl.find(x => x.id === fid), graph = graphFor(f);
        const pts = codes.map(id => { const c = api.centreOf(id); return { x: c[0], y: c[1] }; });
        // After the first floor, the walk starts at the stairs it arrives by.
        const entry = fi > 0 && graph && prev ? nearestStairsByCoords(graph, prev) : null;
        let ordered;
        if (entry) ordered = (graph ? orderStops(graph, [{ x: entry.x, y: entry.y }, ...pts]).order : nearestNeighbour([...Array(codes.length + 1).keys()], [{ x: entry.x, y: entry.y }, ...pts])).filter(i => i > 0).map(i => codes[i - 1]);
        else ordered = !graph || codes.length <= 2 ? nearestNeighbour(codes, pts) : orderStops(graph, pts).order.map(i => codes[i]);
        out.push(...ordered);
        const lc = api.centreOf(ordered[ordered.length - 1]), last = lc ? { x: lc[0], y: lc[1] } : null;
        const ex = fi < seq.length - 1 && graph && last ? nearestStairsByWalk(graph, last) : null;
        prev = ex ? { x: ex.node.x, y: ex.node.y } : last;
      });
      return [...out, ...missing];
    },
    // Nearest exit from a point on the shown floor: the walk to the closest
    // exit marker, then on to the nearest assembly point on the floor, drawn
    // as a green route with a dark casing (legible over any department
    // colour) and white pulses the way to go. Returns the route or null.
    evacuate(origin) {
      api.clearOverlays();
      const here = api.markers().filter(m => m.floor === cur?.id);
      const exits = here.filter(m => m.type === 'exit' || m.type === 'fire-exit'), asm = here.filter(m => m.type === 'assembly');
      const r = evacuationRoute(graphFor(cur), { x: origin[0], y: origin[1] }, exits, asm);
      if (!r) return null;
      const NS = 'http://www.w3.org/2000/svg', full = vb0.split(' ').map(Number), dim = Math.min(full[2], full[3]) || 1000;
      const layer = document.createElementNS(NS, 'g'); layer.setAttribute('class', 'route-layer evac-layer'); layer.setAttribute('pointer-events', 'none');
      layer.style.setProperty('--evac-w', Math.max(6, dim * 0.007).toFixed(1));
      const d = pts => pts.map((p, k) => (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
      for (const [leg, cls] of [[r.exit, ''], [r.assembly, ' assembly']]) {
        if (!leg) continue;
        for (const part of ['casing', 'line']) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d(leg.points)); p.setAttribute('class', `evac-route-${part}${cls}${leg.straight ? ' straight' : ''}`); layer.appendChild(p); }
      }
      const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('cx', origin[0]); dot.setAttribute('cy', origin[1]); dot.setAttribute('r', Math.max(14, dim * 0.018)); dot.setAttribute('class', 'evac-origin'); layer.appendChild(dot);
      for (const t of [r.exit.target, r.assembly?.target]) { if (!t) continue; const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', t.x); c.setAttribute('cy', t.y); c.setAttribute('r', Math.max(24, dim * 0.028)); c.setAttribute('class', 'evac-ring'); layer.appendChild(c); }
      svg.classList.add('has-route'); svg.appendChild(layer);
      return r;
    },
    drawPins(pins) {   // [{ x, y, colour, label }] in map coordinates
      const NS = 'http://www.w3.org/2000/svg';
      for (const p of pins) {
        const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pin'); g.setAttribute('transform', `translate(${p.x},${p.y})`);
        // A glyph (markup in a -8..8 box, stroked) replaces the label; a
        // badge (a count) sits on the pin's shoulder.
        const mid = p.glyph ? `<g transform="translate(0,-58) scale(2.1)" fill="none" style="color:${p.colour}" stroke="${p.colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p.glyph}</g>` : `<text x="0" y="-58" style="fill:${p.colour}">${esc(p.label)}</text>`;
        const badge = p.badge ? `<circle cx="24" cy="-80" r="14" fill="#6F4527" stroke="#fff" stroke-width="3"/><text x="24" y="-80" class="pin-badge">${esc(p.badge)}</text>` : '';
        g.innerHTML = `<path d="M0 0c-14-22-30-34-30-58a30 30 0 0 1 60 0c0 24-16 36-30 58z" fill="${p.colour}" stroke="#fff" stroke-width="5"/><circle cx="0" cy="-58" r="20" fill="#fff"/>${mid}${badge}`;
        if (p.title) { const t = document.createElementNS(NS, 'title'); t.textContent = p.title; g.appendChild(t); }
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
        detail: m.getAttribute('data-detail') || '', floor: m.closest('.mfl')?.getAttribute('data-fid') || null,
        x: +m.getAttribute('data-x'), y: +m.getAttribute('data-y'), el: m,
      }));
    },
    // Price checks: small, large (a constant on-screen size whatever the
    // zoom) or hidden, a per-device preference; tory lines show on a
    // back-of-house floor when switched on.
    priceChecks(mode) { svg.classList.toggle('pc-off', mode === 'off'); svg.classList.toggle('pc-large', mode === 'large'); pcMode = mode; scaleMarkers(); },
    tory(on) { svg.classList.toggle('tory-on', on == null ? !svg.classList.contains('tory-on') : !!on); return svg.classList.contains('tory-on'); },
    floorType() { return cur?.type; },
    hasTory() { return !!floorEl(cur?.id)?.querySelector('.tory-line-path'); },
    shelfInfo(g) { const id = g.getAttribute('data-shelf'), sub = g.getAttribute('data-subname') || ''; return { id, sub, code: canonCode(id + sub), dept: (g.getAttribute('data-dept') || '').toLowerCase(), full: segmentId(g), segments: api.groups(id).length }; },
  };
  api.setMarks(marks);
  if (select) api.select(select);
  svg.classList.toggle('on-boh', cur?.type === 'boh');
  api.priceChecks(pcMode);
  scaleMarkers(); setLabelFade();

  // pan, zoom, tap. Two fingers pinch and pan the map itself (the stage
  // has touch-action:none, so the page never zooms with it).
  let drag = null, pinch = null, coast = 0, lastTap = null; const ptrs = new Map();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  stage.addEventListener('wheel', e => { e.preventDefault(); api.zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  stage.addEventListener('pointerdown', e => {
    cancelAnimationFrame(coast); cancelAnimationFrame(anim);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType !== 'mouse') { try { svg.setPointerCapture(e.pointerId); } catch {} }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { v: api.vb(), d: dist(a, b), m: mid(a, b), r: svg.getBoundingClientRect() }; drag = null; return; }
    if (ptrs.size > 2) return;
    drag = { x: e.clientX, y: e.clientY, v: api.vb(), w: svg.getBoundingClientRect().width, moved: false, t: Date.now(), vx: 0, vy: 0, lx: e.clientX, ly: e.clientY, lt: performance.now(), touch: e.pointerType !== 'mouse' };
  });
  stage.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], m = mid(a, b), k = pinch.d / dist(a, b);
      const u = pinch.v[2] / pinch.r.width, px = pinch.v[0] + (pinch.m.x - pinch.r.left) * u, py = pinch.v[1] + (pinch.m.y - pinch.r.top) * u;
      const W = pinch.v[2] * k, H = pinch.v[3] * k, u2 = W / pinch.r.width;
      api.setVb([px - (m.x - pinch.r.left) * u2, py - (m.y - pinch.r.top) * u2, W, H]); svg.classList.add('zoomed');
      return;
    }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; const k = drag.v[2] / drag.w; api.setVb([drag.v[0] - dx * k, drag.v[1] - dy * k, drag.v[2], drag.v[3]]);
    // Velocity for the coast after a flick (EMA, ShelfSearcher's 0.6).
    const now = performance.now(), dt = now - drag.lt;
    if (dt > 0 && dt < 100) { drag.vx = drag.vx * .6 + ((e.clientX - drag.lx) / dt) * .4; drag.vy = drag.vy * .6 + ((e.clientY - drag.ly) / dt) * .4; }
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;
  });
  // A flicked map coasts and slows (friction .92 a frame) unless reduced
  // motion is asked for; touch and pen only, as a mouse drag means "put it here".
  const coastFrom = (vx, vy) => {
    if (reduced() || Math.hypot(vx, vy) < .05) return;
    const k = api.vb()[2] / (svg.getBoundingClientRect().width || 1);
    const step = () => { vx *= .92; vy *= .92; if (Math.hypot(vx, vy) < .01) return; const v = api.vb(); api.setVb([v[0] - vx * 16 * k, v[1] - vy * 16 * k, v[2], v[3]]); coast = requestAnimationFrame(step); };
    coast = requestAnimationFrame(step);
  };
  // Double-click, or a second tap within 300 ms, zooms in 1.8× on the spot.
  stage.addEventListener('dblclick', e => { e.preventDefault(); api.zoomBy(1 / 1.8, e.clientX, e.clientY, 300); });
  const lift = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  stage.addEventListener('pointerup', e => {
    lift(e);
    if (!drag) return; const { moved, t, touch, vx, vy, lt } = drag; drag = null;
    if (moved) { if (touch && performance.now() - lt < 80) coastFrom(vx, vy); return; }
    if (touch && ptrs.size === 0) {
      const now = Date.now();
      if (lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap = null; api.zoomBy(1 / 1.8, e.clientX, e.clientY, 300); return; }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    const g = hit.closest?.('.shelf-group[data-shelf]');
    const m = hit.closest?.('.emergency-marker[data-equip-type]'), pc = hit.closest?.('.price-check-marker');
    const point = api.pointAt(e.clientX, e.clientY);
    if (touch && (pc || g)) haptic('tap');
    if (pc && !svg.classList.contains('pc-off')) { const ga = k => pc.getAttribute(k) || ''; onSelect?.({ kind: 'pricecheck', variant: ga('data-variant'), label: ga('data-label'), location: ga('data-location'), detail: ga('data-detail'), dept: ga('data-loc-dept').toLowerCase(), deptName: ga('data-loc-dept-name'), deptColour: ga('data-loc-dept-color'), badge: ga('data-loc-dept-badge'), point, el: pc }); }
    else if (g && g.getAttribute('data-shelf')) { const info = api.shelfInfo(g); api.select(info.code); onSelect?.({ kind: 'shelf', ...info, el: g, point, long: Date.now() - t > 500 }); }   // the module tapped, never its whole run
    else if (m) onSelect?.({ kind: 'marker', ...api.markers().find(x => x.el === m), point });
    else onSelect?.({ kind: 'floor', point: api.pointAt(e.clientX, e.clientY) });
  });
  stage.addEventListener('pointercancel', e => { lift(e); drag = null; });

  // hover tooltip (mouse only; a touch shows nothing, the tap selects)
  if (tips && prefs().mapTips !== false) {
    let tipEl = null, tipFor = null;
    const hide = () => { if (tipEl) tipEl.classList.remove('on'); tipFor = null; };
    stage.addEventListener('pointermove', e => {
      if (e.pointerType && e.pointerType !== 'mouse') return hide();
      if (drag?.moved) return hide();
      const g0 = e.target.closest?.('.shelf-group[data-shelf]'), g = g0 && g0.getAttribute('data-shelf') ? g0 : null;
      const mk = g ? null : e.target.closest?.('.emergency-marker, .price-check-marker, .landmark-group');
      if (mk && (mk.closest('.emergency-markers') && !svg.classList.contains('showem') || mk.classList.contains('price-check-marker') && svg.classList.contains('pc-off'))) return hide();
      if (!g && !mk) return hide();
      if (!tipEl) { tipEl = document.createElementNS('http://www.w3.org/1999/xhtml', 'div'); tipEl.className = 'mtip'; stage.appendChild(tipEl); }
      // The content is rebuilt only when the pointer moves to another
      // module; moving within one just follows the pointer, so the icons
      // and words stay put instead of re-rendering on every event.
      const on = g || mk;
      if (on !== tipFor) { tipEl.innerHTML = g ? tipHtml(api, g, tip) : markerTip(mk); tipFor = on; }
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
  // Ctrl (or Cmd) with + / − / 0 zooms the map on screen rather than the
  // page; the listener leaves with the stage.
  if (!clone) {
    const onKey = e => {
      if (!stage.isConnected) return document.removeEventListener('keydown', onKey);
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !stage.offsetParent || stage.closest('[inert]')) return;
      const k = e.key;
      if (k === '+' || k === '=') { e.preventDefault(); api.zoomBy(1 / 1.25, null, null, 300); }
      else if (k === '-' || k === '_') { e.preventDefault(); api.zoomBy(1.25, null, null, 300); }
      else if (k === '0') { e.preventDefault(); api.fit(400); }
    };
    document.addEventListener('keydown', onKey);
  }
  return api;
}

function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
function nearestNeighbour(codes, pts) {
  if (codes.length <= 2) return codes.slice();
  const order = [0], left = codes.map((_, i) => i).slice(1);
  while (left.length) { const last = pts[order[order.length - 1]]; let bi = 0, bd = Infinity; left.forEach((i, k) => { const d = Math.hypot(pts[i].x - last.x, pts[i].y - last.y); if (d < bd) { bd = d; bi = k; } }); order.push(left.splice(bi, 1)[0]); }
  return order.map(i => codes[i]);
}

// The bar above a desktop map: find, department chips, zoom, key.
export function mapbar() {
  const chips = [['All', 'grid', '']];
  for (const [label, icon, ids] of DEPT_GROUPS) { if (label === 'Other') for (const id of ids) chips.push([DEPT_NAME[id] || id, { checkouts: 'bag', flex: 'flame', stockroom: 'box' }[id] || 'tag', id]); else chips.push([label, icon, label.toLowerCase()]); }
  const fls = mapFloors(), floorSeg = fls.length > 1 ? `<div class="seg2 floorseg" data-floorseg>${fls.map((f, i) => `<button class="${i === 0 ? 'on' : ''}" data-mapfloor="${esc(f.id)}" title="${f.type === 'boh' ? 'Back of house' : 'Sales floor'}">${esc(f.name)}</button>`).join('')}</div>` : '';
  return `<div class="mapbar"><div class="search"><svg class="i"><use href="icons.svg#i-search"/></svg><input placeholder="Find a shelf or bay…" aria-label="Find a shelf, bay or product on the map" data-mapfind></div>` +
    `<div class="legchips">${chips.map((c, i) => `<span class="chip${i === 0 ? ' on' : ''}" data-mapgroup="${c[2]}">${ic(c[1])}${c[0]}</span>`).join('')}</div>${floorSeg}` +
    `<div class="zoom" style="margin-left:auto;display:flex;gap:6px">${extraTools()}<span class="ibtn" data-zoom="out">${ic('minus')}</span><span class="ibtn" data-zoom="in">${ic('plus')}</span><span class="ibtn" data-zoom="fit" title="Fit">${ic('map')}</span>` +
    `<span class="keywrap"><span class="ibtn" data-key="1" title="Department key">${ic('layers')}</span><div class="keypop"><h4>Department key</h4>${DEPT_GROUPS.map(gp => `<div class="keygrp">${ic(gp[1])}${gp[0]}</div><div class="keygrid">${gp[2].map(d => `<div class="keyrow"><i style="background:${DEPT_COLOUR[d]}"></i><b>${d.toUpperCase()}</b><span>${DEPT_NAME[d]}</span></div>`).join('')}</div>`).join('')}${mapSymbols().length ? `<h4 class="symh">Map symbols</h4>${symbolsHtml()}` : ''}</div></span></div></div><div class="mapbar mapsub" data-subchips hidden></div>`;
}
// Price-check size (small, large, hidden) when the map has any, and the
// tory-line switch, shown only while a back-of-house floor with lines is up.
function extraTools() {
  const syms = mapSymbols(), pc = syms.some(x => x.kind === 'pc' || x.kind === 'order'), tory = syms.some(x => x.kind === 'tory');
  return (pc ? `<span class="ibtn pcbtn" data-pcmode="${esc(prefs().priceChecks || 'small')}" title="Price checks: normal, large or hidden">${ic('barcode')}</span>` : '') + (tory ? `<span class="ibtn torybtn" data-tory hidden title="Show the tory lines">${ic('route')}</span>` : '');
}
export function crumbx(ctx, storeNo, storeName) { const f = mapFloors()[0]; return `<span class="crumbx">${ic('map')}<span data-crumbfloor>${f ? `${f.type.toUpperCase()} · ${esc(f.name)}` : 'FOH · Ground'}</span> <b>${esc(storeNo)}</b>${ctx ? ' › ' + ctx : ''}<span data-crumbdept></span></span>`; }
export function mvMap(o = {}) {
  const fls = mapFloors();
  return `<div class="mv-map mapbox"><div class="mapstage" id="mapstage"></div><div class="mv-mtools"><span class="ibtn scan" data-go="search" title="Scan">${ic('barcode')}</span>${fls.length > 1 ? `<span class="ibtn" data-mapfloor-next title="Next level">${ic('layers')}</span>` : ''}${mapSymbols().some(x => x.kind === 'tory') ? `<span class="ibtn torybtn" data-tory hidden title="Tory lines">${ic('route')}</span>` : ''}<span class="ibtn" data-zoom="in">${ic('plus')}</span><span class="ibtn" data-zoom="out">${ic('minus')}</span><span class="ibtn" data-zoom="fit" title="Fit">${ic('map')}</span></div>${o.badge ? `<div class="mv-mbadge" id="mvbadge">${o.badge}</div>` : ''}</div>`;
}

// Wire zoom buttons and group chips on a mounted view.
export function bindMapChrome(root, map) {
  root.addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z) { const k = z.getAttribute('data-zoom'); if (k === 'in') map.zoomBy(1 / 1.3, null, null, 300); else if (k === 'out') map.zoomBy(1.3, null, null, 300); else map.fit(400); return; }
    const pcb = e.target.closest('[data-pcmode]'); if (pcb) { const next = { small: 'large', large: 'off', off: 'small' }[prefs().priceChecks || 'small']; setPref('priceChecks', next); map.priceChecks(next); haptic('select'); for (const b of $$('[data-pcmode]', root)) b.setAttribute('data-pcmode', next); toast(`Price checks: ${{ small: 'normal', large: 'large', off: 'hidden' }[next]}`); return; }
    const tb = e.target.closest('[data-tory]'); if (tb) { const on = map.tory(); tb.classList.toggle('on', on); toast(on ? 'Tory lines shown' : 'Tory lines hidden'); return; }
    const key = e.target.closest('[data-key]'); if (key) { key.parentNode.classList.toggle('open'); return; }
    const fb = e.target.closest('[data-mapfloor]');
    if (fb) {
      if (fb.classList.contains('crumb-jump')) { map.floor(fb.getAttribute('data-mapfloor')); const on = root.querySelector('[data-mapdept].on') || root.querySelector('[data-mapgroup].on'); if (on) { const d = on.getAttribute('data-mapdept'), g = on.getAttribute('data-mapgroup'); const codes = d ? [d] : g ? (DEPT_GROUPS.find(x => x[0].toLowerCase() === g)?.[2] || [g]) : []; const info = map.zoomDeptOn(codes, fb.getAttribute('data-mapfloor')); readout(`› ${d ? (DEPT_GROUPS.find(x => x[2].includes(d)) ? esc(DEPT_GROUPS.find(x => x[2].includes(d))[0]) + ' › ' : '') + dep(d) + ' ' + esc(DEPT_NAME[d] || d) : esc(on.textContent.trim())} · ${info?.shelves || 0} shelves${elsewhere(info)}`); } return; }
      map.zoomDept([]); map.floor(fb.getAttribute('data-mapfloor')); for (const c of $$('[data-mapgroup]', root)) c.classList.toggle('on', !c.getAttribute('data-mapgroup')); subchips(null); readout(''); return;
    }
    const fn = e.target.closest('[data-mapfloor-next]');
    if (fn) { const fls = map.floors(), i = fls.findIndex(f => f.id === map.floorId()); map.floor(fls[(i + 1) % fls.length].id); return; }
    const grp = e.target.closest('[data-mapgroup]');
    if (grp) {
      for (const c of $$('[data-mapgroup]', root)) c.classList.toggle('on', c === grp);
      const g = grp.getAttribute('data-mapgroup');
      const group = g ? DEPT_GROUPS.find(x => x[0].toLowerCase() === g) : null;
      const codes = !g ? null : (group?.[2] || [g]);
      const info = map.zoomDept(codes || []);
      subchips(group && group[2].length > 1 ? group : null);
      readout(!codes ? '' : `› ${group ? esc(group[0]) : dep(codes[0]) + ' ' + esc(DEPT_NAME[codes[0]] || codes[0])} · ${info?.shelves || 0} shelves${elsewhere(info)}`);
      return;
    }
    const sub = e.target.closest('[data-mapdept]');
    if (sub) {
      const d = sub.getAttribute('data-mapdept');
      for (const c of $$('[data-mapdept]', root)) c.classList.toggle('on', c === sub);
      const info = map.zoomDept([d]);
      const grp = DEPT_GROUPS.find(x => x[2].includes(d));
      readout(`› ${grp ? esc(grp[0]) + ' › ' : ''}${dep(d)} ${esc(DEPT_NAME[d] || d)} · ${info?.shelves || 0} shelves${elsewhere(info)}`);
    }
  });
  // A department that also lives on another level says so, and the level
  // name jumps there (ShelfSearcher's floor-jump badge).
  const elsewhere = info => { const others = (info?.floors || []).filter(f => f.id !== map.floorId()); return others.length ? ` · also on ${others.map(f => `<span class="crumb-jump" data-mapfloor="${esc(f.id)}">${esc(f.name)}</span> (${f.shelves})`).join(', ')}` : ''; };
  // Sub-department chips under the bar once a group is chosen, the floor
  // switch following the map, and the crumb saying where the map is.
  const subchips = group => { const host = root.querySelector('[data-subchips]'); if (!host) return; host.hidden = !group; host.innerHTML = group ? `<div class="legchips">${group[2].map(d => `<span class="chip" data-mapdept="${esc(d)}"><i style="background:${DEPT_COLOUR[d] || '#64748B'}"></i><b>${esc(d.toUpperCase())}</b>${esc(DEPT_NAME[d] || d)}</span>`).join('')}</div>` : ''; };
  const readout = html => { const el = root.querySelector('[data-crumbdept]'); if (el) el.innerHTML = html ? ' ' + html : ''; };
  map.stage.addEventListener('mapfloor', e => {
    const f = e.detail; const el = root.querySelector('[data-crumbfloor]'); if (el) el.textContent = `${f.type.toUpperCase()} · ${f.name}`;
    for (const b of $$('[data-mapfloor]', root)) b.classList.toggle('on', b.getAttribute('data-mapfloor') === f.id);
    toryBtn();
  });
  const toryBtn = () => { for (const b of $$('[data-tory]', root)) { b.hidden = !(map.floorType() === 'boh' && map.hasTory()); b.classList.toggle('on', map.svg.classList.contains('tory-on')); } };
  toryBtn();
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
  const norm = q => canonCode(q.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
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
    const exact = map.groups(Q); if (exact.length) return exact;
    return Q.length >= 2 ? map.segments().filter(g => { const n = (g.getAttribute('data-shelf') || '').toUpperCase(); return n.startsWith(Q) || (g.getAttribute('data-locations') || '').toUpperCase().includes(Q); }) : [];
  };
  const state = cls => { input.classList.remove('found', 'not-found'); if (cls) { input.classList.add(cls); haptic(cls === 'found' ? 'success' : 'error'); } };
  // The view that owns the map hears what find selected (the store map
  // opens its card; a pick list can add it).
  const announce = code => map.stage.dispatchEvent(new CustomEvent('mapselect', { detail: { code, ...(map.code(code) || {}) } }));
  const pick = it => {
    if (it.kind === 'shelf') { const gs = matchGroups(input.value).filter(g => (g.getAttribute('data-shelf') || '').toUpperCase() === it.name); const seg = gs.length === 1 && input.value.replace(/[\s-]+/g, '').toUpperCase() !== it.name ? gs : null; const id = seg ? canonCode(input.value) : it.name; map.select(id); map.highlight(seg || map.groups(it.name)); map.zoomTo(id); if (!seg) input.value = it.name; remember(input.value.trim().toUpperCase()); state('found'); announce(id); }
    else { input.value = it.kind === 'group' ? it.label : `${it.name} ${it.label}`; map.highlight(null); const grp = it.kind === 'group' ? it.label.toLowerCase() : (DEPT_GROUPS.find(x => x[2].includes(it.dept) && x[0] !== 'Other')?.[0].toLowerCase() || it.dept); root.querySelector(`[data-mapgroup="${grp}"]`)?.click(); if (it.kind === 'dept' && grp !== it.dept) root.querySelector(`[data-mapdept="${it.dept}"]`)?.click(); remember(input.value); state('found'); }
    hide();
  };
  const submit = () => {
    if (focus >= 0 && items[focus]) return pick(items[focus]);
    const q = input.value.trim(); if (!q) return;
    const gs = matchGroups(q);
    if (gs.length) { const id = gs.length === map.groups(gs[0].getAttribute('data-shelf')).length ? gs[0].getAttribute('data-shelf') : canonCode(q); map.select(id); map.highlight(gs); map.zoomTo(id); remember(q.toUpperCase()); state('found'); announce(id); return hide(); }
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
