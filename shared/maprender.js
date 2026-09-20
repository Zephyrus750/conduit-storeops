// Map Editor exports → the svg.map.real documents the shell mounts.
//
// The editor saves a store map two ways: a .js file ShelfSearcher loaded
// (window.STORE_MAPS['1241'] = {…}, each floor carrying a pre-rendered svg)
// and a .json backup the editor re-reads (same object, no pre-rendered svg).
// This module reads either and renders every floor into the format the
// views expect: one <svg class="map real"> per floor with a .map-floor group
// of .shelf-group[data-shelf][data-subname][data-dept][data-full] shelves,
// landmarks, walls, tory lines, and .emergency-marker / .price-check-marker
// groups regenerated from the structured arrays.
//
// Ported from ShelfSearcher's map-json-loader.js (the viewer's loader: bounds,
// viewBox, emergency and price-check markers, the floor wrapper) and the
// editor's buildFloorSVG (what the .js export bakes into floor.svg), so a
// .json export renders the same as a .js one. Pure functions; runs in the
// browser (admin console), in node (scripts/publish-map.js) and in tests.

import { pathsOf } from './route.js';

const NS = 'http://www.w3.org/2000/svg';
export const esc = s => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── reading the files ──────────────────────────────────────────────────

// Text of a .js, .json or .svg file → what to publish. An svg passes
// through as one floor; the other two become a rendered map document.
export function parseMapFile(text, name = '') {
  const ext = (name.match(/\.(\w+)$/) || [])[1]?.toLowerCase();
  const t = String(text).trim();
  if (ext === 'svg' || (!ext && /^<svg[\s>]/i.test(t))) return { kind: 'svg', svg: String(text) };
  let data;
  if (ext === 'json' || (!ext && t.startsWith('{'))) {
    try { data = JSON.parse(t); } catch (e) { throw new Error(`${name || 'file'} is not valid JSON: ${e.message}`); }
    // The editor's backup is the map object itself; accept a STORE_MAPS-shaped
    // object ({ '1241': {…} }) too.
    if (!Array.isArray(data.floors)) { const k = Object.keys(data).find(k => Array.isArray(data[k]?.floors)); if (k) { data = data[k]; if (!data.storeNumber) data.storeNumber = k; } }
  } else data = parseStoreMapsJs(t);
  if (!Array.isArray(data.floors) || !data.floors.length) throw new Error(`${name || 'file'} has no floors`);
  return { kind: 'map', data };
}

// window.STORE_MAPS['1241'] = { … };  → the object, without evaluating the
// file. The literal mixes unquoted keys, single-quoted strings, JSON and one
// template literal per floor (the pre-rendered svg); it is walked as tokens
// and re-emitted as JSON.
export function parseStoreMapsJs(src) {
  const m = /STORE_MAPS\s*\[\s*(['"])([^'"]+)\1\s*\]\s*=\s*\{/.exec(src);
  if (!m) throw new Error("not a ShelfSearcher map file: no window.STORE_MAPS['store'] = { … } in it");
  const json = literalToJson(src, m.index + m[0].length - 1);
  const data = JSON.parse(json);
  if (!data.storeNumber) data.storeNumber = m[2];
  return data;
}
function literalToJson(src, i) {
  const out = []; const stack = []; const n = src.length;
  const dropTrailingComma = () => { let k = out.length - 1; while (k >= 0 && /^\s*$/.test(out[k])) k--; if (k >= 0 && out[k] === ',') out.length = k; };
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const [val, j] = readString(src, i); out.push(JSON.stringify(val)); i = j; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
    if (c === '{' || c === '[') { stack.push(c); out.push(c); i++; continue; }
    if (c === '}' || c === ']') { dropTrailingComma(); out.push(c); stack.pop(); i++; if (!stack.length) return out.join(''); continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j); let k = j; while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ':') out.push(JSON.stringify(word));
      else if (word === 'true' || word === 'false' || word === 'null') out.push(word);
      else if (word === 'undefined' || word === 'NaN' || word === 'Infinity') out.push('null');
      else throw new Error(`unexpected "${word}" in the map literal`);
      i = j; continue;
    }
    out.push(c); i++;
  }
  throw new Error('the map literal never closes');
}
const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
function readString(src, i) {
  const q = src[i]; const parts = []; let j = i + 1, run = j;
  while (j < src.length && src[j] !== q) {
    if (src[j] === '\\') {
      parts.push(src.slice(run, j)); const e = src[j + 1];
      if (e === 'u' && src[j + 2] === '{') { const close = src.indexOf('}', j); parts.push(String.fromCodePoint(parseInt(src.slice(j + 3, close), 16))); j = close + 1; }
      else if (e === 'u') { parts.push(String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16))); j += 6; }
      else if (e === 'x') { parts.push(String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16))); j += 4; }
      else if (e === '\n') { j += 2; }
      else { parts.push(e in ESC ? ESC[e] : e); j += 2; }
      run = j; continue;
    }
    j++;
  }
  if (j >= src.length) throw new Error('unterminated string in the map literal');
  parts.push(src.slice(run, j));
  return [parts.join(''), j + 1];
}

// ── rendering ──────────────────────────────────────────────────────────

// The whole document: one rendered svg per floor, plus what the map route
// stores beside them.
export function renderMap(data) {
  const floors = (data.floors || []).map(f => renderFloor(f, data));
  return {
    store: String(data.storeNumber || ''), name: String(data.storeName || ''), editorVersion: String(data.version || ''),
    departments: (data.departments || []).map(d => ({ id: d.id, name: d.name, color: d.color, parent: d.parent })),
    floors,
  };
}

export function renderFloor(floor, data) {
  const id = String(floor.id || 'ground');
  const inner = (floor.svg ? stripOuter(floor.svg) : floorInner(floor, data)) + emergencyMarkers(floor.emergencyMarkers, data) + priceChecks(floor.priceChecks, data);
  const vb = floorViewBox(floor, data);
  const svg = `<svg class="map real" viewBox="${vb}" xmlns="${NS}" preserveAspectRatio="xMidYMid meet" style="--badge-opacity:1;--label-opacity:0;--label-bg-opacity:0">` +
    `<g id="floor-${esc(id)}" class="map-floor zoom-out" data-floor="${esc(id)}" data-floor-type="${esc(floor.type || 'foh')}" style="opacity:1;pointer-events:auto;visibility:visible">${inner}</g></svg>`;
  const paths = pathsOf(floor);
  return { id, name: String(floor.name || id), type: String(floor.type || 'foh'), level: floor.level || 0, svg, shelves: (svg.match(/class="shelf-group"/g) || []).length, markers: (floor.emergencyMarkers || []).length, ...(paths ? { paths } : {}) };
}

// A floor's pre-rendered svg minus its outer <svg>, <style> and any marker
// groups an older editor baked in (the structured arrays are the truth).
function stripOuter(svg) {
  let s = String(svg).replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<circle[^>]*data-emergency[^>]*\/>/g, '').replace(/<text[^>]*>[☀-➿\uD83C-􏰀-\uDFFF][^<]*<\/text>/g, '');
  s = stripGroup(s, 'emergency-markers'); s = stripGroup(s, 'price-checks');
  return s;
}
function stripGroup(s, cls) {
  for (let guard = 0; guard < 10; guard++) {
    const m = new RegExp('<g\\s+class="' + cls + '"[^>]*>').exec(s); if (!m) break;
    let depth = 1, i = m.index + m[0].length, end = -1;
    while (i < s.length) { const o = s.indexOf('<g', i), c = s.indexOf('</g>', i); if (c < 0) break; if (o >= 0 && o < c) { depth++; i = o + 2; } else { depth--; if (!depth) { end = c + 4; break; } i = c + 4; } }
    if (end < 0) break;
    s = s.slice(0, m.index) + s.slice(end);
  }
  return s;
}

// Shelf footprint as the editor and the viewer compute it.
export function shelfDims(s, data) {
  const mw = data?.moduleWidth || 40, sd = data?.shelfDepth || 20, sbw = data?.stockroomBayW || 60, sbd = data?.stockroomDepth || 30;
  const stock = s.dept === 'stockroom';
  const bayW = s.bayW || (stock ? sbw : mw), depth = s.depth || (stock ? sbd : sd), modules = s.modules || (stock ? 1 : 3);
  if (s.type === 'sixway') { const d = (s.radius || 20) * 2; return { w: d, h: d }; }
  if (s.type === 'custom') return { w: s.customW || 40, h: s.customH || 40 };
  return s.orientation === 'V' ? { w: depth, h: modules * bayW } : { w: modules * bayW, h: depth };
}

function floorViewBox(floor, data) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const take = (x, y, w = 0, h = 0) => { if (typeof x !== 'number' || typeof y !== 'number') return; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); };
  for (const s of floor.shelves || []) { if (s.inactive) continue; const d = shelfDims(s, data); if (s.type === 'sixway') take(s.x - d.w / 2, s.y - d.h / 2, d.w, d.h); else take(s.x, s.y, d.w, d.h); }
  for (const l of floor.landmarks || []) take(l.x, l.y, l.w || 0, l.h || 0);
  for (const w of floor.walls || []) take(w.x, w.y, w.w || 0, w.h || 0);
  for (const t of floor.toryLines || []) for (const p of t.points || []) take(p.x, p.y);
  for (const m of floor.emergencyMarkers || []) take(m.x, m.y);
  for (const m of floor.priceChecks || []) take(m.x, m.y);
  if (!isFinite(minX)) {
    const vb = /viewBox="([^"]+)"/.exec(floor.svg || ''); if (vb) return vb[1];
    return '0 0 100 100';
  }
  const pad = 120;
  return `${Math.round(minX - pad)} ${Math.round(minY - pad)} ${Math.round(maxX - minX + pad * 2)} ${Math.round(maxY - minY + pad * 2)}`;
}

// ── the editor's floor render (for exports without a pre-rendered svg) ──

const ICONS = {
  desk: '<rect x="3" y="12" width="18" height="4" rx="1"/><line x1="6" y1="16" x2="6" y2="20"/><line x1="18" y1="16" x2="18" y2="20"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="6" r="2"/>',
  register: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="17" cy="15" r="2"/><line x1="6" y1="14" x2="12" y2="14"/><line x1="6" y1="17" x2="10" y2="17"/>',
  fitting: '<path d="M3 21V7l9-4 9 4v14"/><line x1="9" y1="21" x2="9" y2="12"/><line x1="15" y1="21" x2="15" y2="12"/><line x1="3" y1="12" x2="21" y2="12"/>',
  entry: '<line x1="12" y1="3" x2="12" y2="15"/><polyline points="8,11 12,15 16,11"/><line x1="5" y1="21" x2="19" y2="21"/><line x1="5" y1="18" x2="5" y2="21"/><line x1="19" y1="18" x2="19" y2="21"/>',
  exit: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  tearoom: '<path d="M17 8h1a4 4 0 010 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
  stairs: '<polyline points="4,20 4,16 8,16 8,12 12,12 12,8 16,8 16,4 20,4"/>',
  toilet: '<circle cx="12" cy="5" r="2"/><path d="M8 21v-6H6l3-7h6l3 7h-2v6"/>',
  lift: '<rect x="3" y="2" width="18" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/><polyline points="8,10 12,6 16,10"/><polyline points="8,14 12,18 16,14"/>',
  storage: '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  receival: '<rect x="1" y="12" width="15" height="8" rx="1.5"/><circle cx="5" cy="21" r="2"/><circle cx="13" cy="21" r="2"/><rect x="16" y="8" width="6" height="12" rx="1"/><line x1="16" y1="14" x2="22" y2="14"/><polyline points="18,10 20,8 22,10"/>',
  dock: '<rect x="2" y="14" width="20" height="7" rx="1"/><line x1="2" y1="14" x2="2" y2="10"/><line x1="2" y1="10" x2="10" y2="10"/><line x1="10" y1="10" x2="10" y2="14"/><polyline points="4,8 6,5 8,8"/><line x1="6" y1="5" x2="6" y2="10"/>',
  compactor: '<rect x="5" y="10" width="14" height="10" rx="1"/><line x1="5" y1="14" x2="19" y2="14"/><polyline points="9,4 12,2 15,4"/><line x1="12" y1="2" x2="12" y2="10"/><polyline points="9,7 12,10 15,7"/>',
  kiosk: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8l1.5-3h5L16 8"/><circle cx="12" cy="14" r="3"/>',
  trolley: '<circle cx="6" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M17 17H6V3H4"/><path d="M6 5l14 1l-1 7H6"/>',
  orderscreen: '<rect x="2.5" y="4" width="19" height="11" rx="1.5"/><path d="M12 15v3.5"/><path d="M8 18.5h8"/><path d="M10.3 9h3.4l.4 3.6h-4.2z"/><path d="M11 9a1 1 0 0 1 2 0"/>',
};

function floorInner(floor, data) {
  let svg = '';
  const boundary = floor.boundary || [];
  if (boundary.length >= 3) svg += `<polygon points="${boundary.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="#1a1a2e" stroke-width="3" stroke-linejoin="round"/>`;
  for (const z of floor.landmarks || []) svg += landmark(z);
  for (const w of floor.walls || []) {
    const angle = w.angle || 0, cx = w.x + w.w / 2, cy = w.y + w.h / 2, tr = angle ? ` transform="rotate(${angle},${cx},${cy})"` : '';
    const attrs = ` data-wall="true" data-wall-x="${w.x}" data-wall-y="${w.y}" data-wall-w="${w.w}" data-wall-h="${w.h}"${tr}`;
    if (w.kind === 'window') { const hz = w.w >= w.h; svg += `<g class="wall-group window"${attrs}><rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="#cfe8fa" stroke="#7ab8dd" stroke-width="1.5"/><line x1="${hz ? w.x + 2 : cx}" y1="${hz ? cy : w.y + 2}" x2="${hz ? w.x + w.w - 2 : cx}" y2="${hz ? cy : w.y + w.h - 2}" stroke="#ffffff" stroke-width="1.2"/></g>`; }
    else svg += `<g class="wall-group"${attrs}><rect class="wall-rect" x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="#1a1b1e" stroke="#000" stroke-width="1.5"/></g>`;
  }
  for (const tl of floor.toryLines || []) { if (!tl.points || tl.points.length < 2) continue; svg += `<g class="tory-line-path" data-tory="true"><polyline class="tory-path" points="${tl.points.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="#ff69b4" stroke-width="2.5" stroke-dasharray="8 4" stroke-linecap="round" stroke-linejoin="round"/></g>`; }
  for (const td of floor.toryDocks || []) {
    const sz = 34, half = sz / 2, r = sz * 0.42, scale = (2 * r) / 24, iw = (2.4 / scale).toFixed(2);
    svg += `<g class="tory-dock" data-tory-dock="true" data-x="${Math.round(td.x)}" data-y="${Math.round(td.y)}"><rect class="tory-dock-bg" x="${td.x - half}" y="${td.y - half}" width="${sz}" height="${sz}" rx="4" fill="#2a0a1e" stroke="#ec4899" stroke-width="2.4"/><g class="tory-dock-icon" transform="translate(${(td.x - r).toFixed(2)} ${(td.y - r).toFixed(2)}) scale(${scale.toFixed(4)})" fill="none" stroke="#ec4899" stroke-width="${iw}" stroke-linecap="round"><path d="M7 6a7.75 7.75 0 1 0 10 0"/><line x1="12" y1="4" x2="12" y2="12"/></g>${td.label ? `<text class="tory-dock-label" x="${td.x}" y="${td.y + half + 10}" font-size="8">${esc(td.label)}</text>` : ''}</g>`;
  }
  svg += shelves(floor.shelves || [], data);
  return svg;
}

function landmark(z) {
  const cx = z.x + z.w / 2, cy = z.y + z.h / 2, angle = z.angle || 0, tr = angle ? ` transform="rotate(${angle},${cx},${cy})"` : '';
  let svg = `<g class="landmark-group" data-landmark="true"${z.label ? ` data-label="${esc(z.label)}"` : ''} data-lm-x="${z.x}" data-lm-y="${z.y}" data-lm-w="${z.w}" data-lm-h="${z.h}"${z.boh ? ' data-boh="true"' : ''}${z.icon ? ` data-icon="${esc(z.icon)}"` : ''}${tr}>`;
  svg += `<rect class="landmark-rect" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="rgba(26,27,30,0.6)" rx="3" stroke="#888" stroke-width="0.5"/>`;
  const hasIcon = z.icon && ICONS[z.icon], iconSize = Math.min(z.w * 0.4, z.h * 0.5, 16);
  if (hasIcon) { const iconY = z.label ? cy - iconSize * 0.3 : cy; svg += `<g transform="translate(${cx - iconSize / 2}, ${iconY - iconSize / 2}) scale(${(iconSize / 24).toFixed(3)})" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">${ICONS[z.icon]}</g>`; }
  if (z.label) {
    const padX = Math.min(4, z.w * 0.08), availW = Math.max(4, z.w - padX * 2), availH = Math.max(4, z.h - (hasIcon ? iconSize * 1.15 : 0) - 4);
    const tall = z.h >= z.w * 1.25, charW = fs => fs * 0.6 + 1;
    const wrap = fs => { const maxChars = Math.max(1, Math.floor(availW / charW(fs))); const out = []; let line = ''; for (const raw of String(z.label).split(/\s+/)) { let word = raw; if (tall && line) { out.push(line); line = ''; } while (word.length > maxChars) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, maxChars)); word = word.slice(maxChars); } if (!word) continue; if (!line) line = word; else if ((line + ' ' + word).length <= maxChars) line += ' ' + word; else { out.push(line); line = word; } } if (line) out.push(line); return out; };
    let fontSize = Math.max(5, Math.min(10, z.w * 0.08, z.h * 0.25)), lines = wrap(fontSize), guard = 0;
    while (fontSize > 5 && guard++ < 14) { const longest = lines.reduce((m, l) => Math.max(m, l.length), 0); if (longest * charW(fontSize) <= availW + 0.5 && lines.length * fontSize * 1.25 <= availH + 0.5) break; fontSize = Math.max(5, fontSize - 0.5); lines = wrap(fontSize); }
    const textY = hasIcon ? cy + iconSize * 0.45 : cy, lineH = fontSize * 1.25, startY = textY - ((lines.length - 1) * lineH) / 2 + fontSize * 0.35;
    lines.forEach((ln, i) => { svg += `<text class="landmark-label" fill="#fff" font-family="JetBrains Mono,monospace" font-weight="700" letter-spacing="1" font-size="${fontSize.toFixed(2)}" text-anchor="middle" dominant-baseline="central" x="${cx}" y="${(startY + i * lineH).toFixed(1)}" style="pointer-events:none">${esc(ln)}</text>`; });
  }
  return svg + '</g>';
}

const autoFixture = s => { const sn = String(s.subname || '').toUpperCase(); return /^S\d/.test(sn) ? 'side' : /^[EP]\d/.test(sn) ? 'end' : null; };
function locationRange(locations) {
  if (!locations || !locations.length) return ''; if (locations.length === 1) return locations[0];
  const sorted = [...locations].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); const first = sorted[0], last = sorted[sorted.length - 1];
  let prefix = ''; for (let i = 0; i < Math.min(first.length, last.length); i++) { if (first[i] === last[i]) prefix += first[i]; else break; }
  let suffix = last.substring(prefix.length); const minSuffix = first.length >= 4 ? 2 : 1;
  while (suffix.length < minSuffix && prefix.length > 0) { suffix = prefix[prefix.length - 1] + suffix; prefix = prefix.substring(0, prefix.length - 1); }
  return suffix && prefix.length > 0 ? first + '-' + suffix : first + '-' + last;
}

function shelves(list, data) {
  const colour = {}; for (const d of data.departments || []) colour[d.id] = d.color;
  const badges = [], groups = [];
  list.forEach((s, idx) => {
    const color = colour[s.dept] || '#888', opacity = s.inactive ? 0.25 : 0.75, full = (s.name || '') + (s.subname ? ' ' + s.subname : '');
    const attrs = ` data-shelf="${esc(s.name || '')}" data-subname="${esc(s.subname || '')}" data-dept="${esc(s.dept || '')}" data-full="${esc(full)}"${s.locations && s.locations.length >= 2 ? ` data-locations="${esc(s.locations.join(','))}"` : ''}${s.fixture && s.fixture !== autoFixture(s) ? ` data-fixture="${esc(s.fixture)}"` : ''}`;
    if (s.type === 'sixway') {
      const r = s.radius || 20; let g = `<g class="shelf-group"${attrs}><circle cx="${s.x}" cy="${s.y}" r="${r}" class="shelf" fill="${color}" fill-opacity="${opacity * 0.73}" stroke="${color}"/>`;
      for (let i = 0; i < 6; i++) { const a = (i * 60 - 90) * Math.PI / 180; g += `<line x1="${s.x + Math.cos(a) * r * 0.22}" y1="${s.y + Math.sin(a) * r * 0.22}" x2="${s.x + Math.cos(a) * r * 0.88}" y2="${s.y + Math.sin(a) * r * 0.88}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round"/>`; }
      if (s.name) { const fs = Math.max(7, Math.min(12, r * 0.4)); badges.push({ idx, cx: s.x, cy: s.y + r + fs + 2, fs, name: full, sub: null, angle: 0 }); }
      groups.push(g + '</g>');
    } else {
      const dim = shelfDims(s, data), cx = s.x + dim.w / 2, cy = s.y + dim.h / 2, angle = (s.orientation === 'A' && s.angle != null) ? s.angle : 0, tr = angle ? ` transform="rotate(${angle},${cx},${cy})"` : '';
      groups.push(`<g class="shelf-group"${attrs}${tr}><rect class="shelf" x="${s.x}" y="${s.y}" width="${dim.w}" height="${dim.h}" fill="${color}" fill-opacity="${opacity}" stroke="${color}"/></g>`);
      if (s.name) { const fs = Math.max(8, Math.min(12, dim.w * 0.15, dim.h * 0.35)); badges.push({ idx, cx, cy, fs, name: s.locations && s.locations.length >= 2 ? locationRange(s.locations) : s.name, sub: s.subname || null, angle }); }
    }
  });
  // nudge colliding labels apart, as the editor does
  const off = badges.map(() => ({ dx: 0, dy: 0 }));
  for (let pass = 0; pass < 5; pass++) {
    let any = false;
    for (let i = 0; i < badges.length; i++) for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i], b = badges[j];
      const aw = a.name.length * a.fs * 0.55, ah = a.fs * (a.sub ? 2 : 1.3), bw = b.name.length * b.fs * 0.55, bh = b.fs * (b.sub ? 2 : 1.3);
      const acx = a.cx + off[i].dx, acy = a.cy + off[i].dy, bcx = b.cx + off[j].dx, bcy = b.cy + off[j].dy;
      const ox = (aw / 2 + bw / 2 + 1) - Math.abs(acx - bcx), oy = (ah / 2 + bh / 2 + 1) - Math.abs(acy - bcy);
      if (ox > 0 && oy > 0) {
        any = true;
        if (oy <= ox) { const p = oy / 2 + 0.5; if (acy <= bcy) { off[i].dy -= p; off[j].dy += p; } else { off[i].dy += p; off[j].dy -= p; } }
        else { const p = ox / 2 + 0.5; if (acx <= bcx) { off[i].dx -= p; off[j].dx += p; } else { off[i].dx += p; off[j].dx -= p; } }
      }
    }
    if (!any) break;
  }
  let svg = '';
  list.forEach((s, idx) => {
    svg += groups[idx];
    const bi = badges.findIndex(b => b.idx === idx); if (bi < 0) return;
    const b = badges[bi], tx = b.cx + off[bi].dx, ty = b.cy + off[bi].dy, tr = b.angle ? ` transform="rotate(${b.angle},${b.cx},${b.cy})"` : '';
    if (b.sub) svg += `<text class="shelf-label" font-size="${b.fs}" x="${tx}" y="${ty - b.fs * 0.2}"${tr}>${esc(b.name)}</text><text class="shelf-label" font-size="${b.fs * 0.75}" x="${tx}" y="${ty + b.fs * 0.7}" fill="rgba(255,255,255,0.7)"${tr}>${esc(b.sub)}</text>`;
    else svg += `<text class="shelf-label" font-size="${b.fs}" x="${tx}" y="${ty}"${tr}>${esc(b.name)}</text>`;
  });
  return svg;
}

// ── markers, regenerated from the structured arrays (viewer loader) ─────

const TYPE_ALIAS = { fire_extinguisher: 'fire-ext', fire_exit: 'fire-exit', emergency_exit: 'exit', first_aid: 'first-aid', extinguisher_set: 'ext-set', ext_set: 'ext-set', spill_kit: 'spill-kit', hose_reel: 'hose', assembly_point: 'assembly', fire_hydrant: 'hydrant', call_point: 'call-point', emergency_phone: 'emergency-phone' };
export const markerType = t => TYPE_ALIAS[t] || t || 'exit';
const MARKER = { exit: ['#009639', '#052e16'], 'fire-exit': ['#009639', '#052e16'], 'fire-ext': ['#e4002b', '#450a0a'], 'ext-set': ['#e4002b', '#450a0a'], 'first-aid': ['#3b82f6', '#172554'], aed: ['#eab308', '#422006'], assembly: ['#009639', '#052e16'], hazard: ['#eab308', '#422006'], 'spill-kit': ['#a855f7', '#1e1528'], hose: ['#e4002b', '#450a0a'], hydrant: ['#e4002b', '#450a0a'], 'call-point': ['#e4002b', '#450a0a'], 'emergency-phone': ['#e4002b', '#450a0a'] };
// Glyphs for the types the sign set below does not draw (the legacy viewer
// used an icon font here, which the shell does not load).
const GLYPH = {
  'first-aid': '<rect x="-8" y="-6" width="16" height="12" rx="2" fill="none" stroke="C" stroke-width="1.8"/><path d="M0 -3v6M-3 0h6" stroke="C" stroke-width="2" stroke-linecap="round"/>',
  aed: '<path d="M-8 0h4l2-5 3 10 2-5h5" fill="none" stroke="C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  'spill-kit': '<path d="M-7 -6h14l-2 12h-10z" fill="none" stroke="C" stroke-width="1.8" stroke-linejoin="round"/><path d="M-7 -6a7 3 0 0 1 14 0" fill="none" stroke="C" stroke-width="1.8"/>',
  hazard: '<path d="M0 -8l8 14h-16z" fill="none" stroke="C" stroke-width="1.8" stroke-linejoin="round"/><path d="M0 -2v4" stroke="C" stroke-width="2" stroke-linecap="round"/><circle cx="0" cy="4.5" r="1" fill="C"/>',
};
function signInner(type, extClass) {
  const RED = '#e4002b', GREEN = '#009639', base = bg => `<rect class="em-icon-bg" x="-13" y="-13" width="26" height="26" rx="3" fill="${bg}" stroke="#ffffff" stroke-width="2"/>`;
  const BANDS = { foam: '#0057b8', powder: '#ffffff', co2: '#111111', wet_chem: '#e8b98a', liquid: '#ffd500' };
  switch (type) {
    case 'hydrant': return base(RED) + '<circle cx="0" cy="0" r="8.5" fill="#ffffff"/>' + `<text x="0" y="4.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13" fill="${RED}" pointer-events="none">H</text>`;
    case 'fire-ext': { const band = BANDS[extClass]; let s = base(RED) + `<rect x="-3.2" y="-5" width="6.4" height="11.5" rx="2" fill="${RED}" stroke="#ffffff" stroke-width="1.2"/><path d="M -1.2 -5 V -6.8 H 1.2 V -5" fill="none" stroke="#ffffff" stroke-width="1.2"/><path d="M -1.2 -6.8 L -5.2 -8" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M 1.2 -6.8 L 4 -8" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M 3.2 -3 q 4 0.5 4 4.5" stroke="#ffffff" stroke-width="1.3" fill="none" stroke-linecap="round"/>`; if (band) s += `<rect x="-3.2" y="-3.4" width="6.4" height="2.8" fill="${band}" stroke="#ffffff" stroke-width="0.6"/>`; return s; }
    case 'ext-set': return base(RED) + `<rect x="-7.8" y="-4" width="5.2" height="10" rx="1.6" fill="${RED}" stroke="#ffffff" stroke-width="1.1"/><rect x="2.6" y="-4" width="5.2" height="10" rx="1.6" fill="${RED}" stroke="#ffffff" stroke-width="1.1"/><path d="M -5.2 -4 V -5.8 M -6.6 -5.8 H -3.8" stroke="#ffffff" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M 5.2 -4 V -5.8 M 3.8 -5.8 H 6.6" stroke="#ffffff" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    case 'exit': case 'fire-exit': return base(GREEN) + '<rect x="5" y="-7.5" width="5.5" height="15" fill="none" stroke="#ffffff" stroke-width="1.6"/><circle cx="-6" cy="-6" r="2" fill="#ffffff"/><path d="M -6.5 -3.5 L -3.5 0.5 L -6.5 5.5 M -3.5 0.5 L -1 5 M -9.5 -0.5 L -3.8 -2" stroke="#ffffff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M -0.5 0.5 H 3.5 M 1.8 -1.2 L 3.5 0.5 L 1.8 2.2" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'assembly': return base(GREEN) + '<circle cx="0" cy="0" r="1.9" fill="#ffffff"/><path d="M -9.5 -9.5 L -4.6 -4.6 M -8.8 -4.6 H -4.6 V -8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M 9.5 -9.5 L 4.6 -4.6 M 8.8 -4.6 H 4.6 V -8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M -9.5 9.5 L -4.6 4.6 M -8.8 4.6 H -4.6 V 8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M 9.5 9.5 L 4.6 4.6 M 8.8 4.6 H 4.6 V 8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'hose': return base(RED) + '<rect x="-9" y="-9.5" width="12" height="12.5" rx="6" fill="none" stroke="#ffffff" stroke-width="1.6"/><path d="M -6.2 -9 V 2.6 M -3.6 -9.4 V 2.9 M -1 -9.4 V 2.9 M 1.6 -9 V 2.5" stroke="#ffffff" stroke-width="1.2" fill="none"/><path d="M 3 -3.5 H 6.6" stroke="#ffffff" stroke-width="1.4" fill="none"/><circle cx="8.6" cy="-3.5" r="2.3" fill="none" stroke="#ffffff" stroke-width="1.2"/><path d="M 7 -5.1 L 10.2 -1.9 M 10.2 -5.1 L 7 -1.9" stroke="#ffffff" stroke-width="1" fill="none"/><path d="M -6.2 3 V 6.2" stroke="#ffffff" stroke-width="1.4" fill="none"/><path d="M -7.4 6.2 h 2.4 l 0.8 3.4 h -4 z" fill="#ffffff"/>';
    case 'call-point': return base(RED) + `<circle cx="0" cy="0" r="6.2" fill="#ffffff"/><rect x="-2.6" y="-2.6" width="5.2" height="5.2" fill="${RED}"/>`;
    case 'emergency-phone': return base(RED) + '<path d="M -8 -1.5 C -9 -6.5 9 -6.5 8 -1.5 L 5.5 0.5 C 5 -2.8 -5 -2.8 -5.5 0.5 Z" fill="#ffffff"/><rect x="-4.5" y="1" width="9" height="5.5" rx="1.2" fill="#ffffff"/>';
  }
  return null;
}

// Location text → the department it sits in, from the shelf lists.
export function deptResolver(data) {
  const byLoc = {}, info = {};
  for (const f of data.floors || []) for (const s of f.shelves || []) {
    if (!s.dept) continue;
    if (s.name) byLoc[String(s.name).toUpperCase()] = s.dept;
    if (s.subname) byLoc[String(s.subname).toUpperCase()] = s.dept;
    if (s.name && s.subname) byLoc[(String(s.name) + String(s.subname)).toUpperCase()] = s.dept;
    for (const loc of s.locations || []) byLoc[String(loc).toUpperCase()] = s.dept;
  }
  for (const d of data.departments || []) info[d.id] = { color: d.color || '#666', name: d.name || d.id, badge: ((d.name || '').match(/^([A-Z]\d+|[A-Z]+)/) || [, String(d.id).toUpperCase()])[1] };
  return loc => {
    if (!loc) return null;
    const key = String(loc).toUpperCase().trim(); let id = byLoc[key];
    if (!id) { const parent = key.replace(/\s*S\d+$/, ''); if (parent !== key) id = byLoc[parent]; }
    if (!id) return null;
    const i = info[id]; return i ? { id, color: i.color, name: i.name, badge: i.badge } : { id, color: '', name: id, badge: id.toUpperCase() };
  };
}
const locAttrs = (d) => ` data-loc-dept="${esc(d ? d.id : '')}" data-loc-dept-color="${esc(d ? d.color : '')}" data-loc-dept-name="${esc(d ? d.name : '')}" data-loc-dept-badge="${esc(d ? d.badge : '')}"`;

function emergencyMarkers(list, data) {
  if (!list || !list.length) return '';
  const seen = new Set(), resolve = deptResolver(data);
  let svg = '<g class="emergency-markers">';
  for (const m of list) {
    const type = markerType(m.type), key = Math.round(m.x) + '_' + Math.round(m.y) + '_' + m.type;
    if (seen.has(key)) continue; seen.add(key);
    const [color, bg] = MARKER[type] || MARKER.exit;
    svg += `<g class="emergency-marker" data-equip-type="${esc(type)}" data-label="${esc(m.label)}" data-detail="${esc(m.detail)}" data-method="${esc(m.method)}" data-operation="${esc(m.operation)}" data-ext-class="${esc(m.extClass)}" data-location="${esc(m.location)}"${locAttrs(resolve(m.location))} data-x="${m.x}" data-y="${m.y}" transform="translate(${m.x},${m.y})" style="cursor:pointer">`;
    svg += `<circle class="em-halo" cx="0" cy="0" r="20" fill="${color}" opacity="0.14"/>`;
    const sign = signInner(type, m.extClass);
    if (sign) svg += `<g class="em-sign" pointer-events="none">${sign}</g>`;
    else svg += `<circle class="em-icon-bg" cx="0" cy="0" r="14" fill="${bg}" stroke="${color}" stroke-width="2.5"/><g pointer-events="none">${(GLYPH[type] || GLYPH.hazard).replace(/"C"/g, `"${color}"`)}</g>`;
    svg += '</g>';
  }
  return svg + '</g>';
}

function priceChecks(list, data) {
  if (!list || !list.length) return '';
  const COLOR = '#14b8a6', BG = '#042f2e', resolve = deptResolver(data);
  let svg = '<g class="price-checks">';
  for (const pc of list) {
    const variant = pc.variant === 'order' ? 'order' : 'pc';
    svg += `<g class="price-check-marker" data-variant="${variant}" data-label="${esc(pc.label)}" data-location="${esc(pc.location)}" data-detail="${esc(pc.detail)}"${locAttrs(resolve(pc.location))} data-x="${pc.x}" data-y="${pc.y}" transform="translate(${pc.x},${pc.y})" style="cursor:pointer">`;
    svg += `<circle class="pc-icon-bg" cx="0" cy="0" r="13" fill="${BG}" stroke="${COLOR}" stroke-width="2.5"/>`;
    if (variant === 'order') svg += `<g stroke="${COLOR}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" pointer-events="none"><rect x="-6" y="-6" width="12" height="8" rx="1"/><line x1="0" y1="2" x2="0" y2="4.6"/><line x1="-3.4" y1="5.4" x2="3.4" y2="5.4"/><path d="M -2 -3.2 h 4 l 0.6 3.6 h -5.2 z"/><path d="M -1 -3.2 q 1 -1.8 2 0"/></g>`;
    else svg += `<g transform="translate(-6.5,-6.5) scale(0.5417)" stroke="${COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" pointer-events="none"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M5 12h14"/></g>`;
    svg += '</g>';
  }
  return svg + '</g>';
}
