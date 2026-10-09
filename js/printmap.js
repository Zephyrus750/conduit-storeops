// The map on paper: a copy of the published map, framed and dressed for a
// sheet (the composer, the evacuation map, a work order), as SVG markup the
// print sheet takes. Built on a clone of the map off-screen at the sheet's
// shape, so markers and labels size as they will print, and never touching
// the live map a view is showing.
//
//   paperMap({ floor, frame, dept, marks, pins, evacFrom, layers, mono, aspect })
//     floor     a floor id (default: front of house)
//     frame     'floor' | 'dept' | [x, y, w, h] | { around: [x, y], span }
//     dept      department codes to frame and keep in colour (others faint)
//     marks     shelf marks, as map.setMarks
//     pins      map pins, as map.drawPins
//     layers    { emergency, priceChecks, labels, badges, paths }
//     mono      grey shelves (ink-saving)
//     aspect    width / height of the box it prints into
//   → { svg, floor: { id, name, type }, markers, route, shelves }

import { mountMap, mapFloors } from './map.js';

export function paperMap({ floor = null, frame = 'floor', dept = null, marks = null, pins = [], evacFrom = null, layers = {}, mono = false, aspect = 297 / 210 } = {}) {
  const L = { emergency: true, priceChecks: true, labels: true, badges: false, paths: false, ...layers };
  const W = 1600, H = Math.round(W / aspect);
  const stage = document.createElement('div');
  stage.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;height:${H}px;overflow:hidden;visibility:hidden;pointer-events:none`;
  document.body.appendChild(stage);
  try {
    const map = mountMap(stage, { clone: true, mono, badges: L.badges, tips: false, showEmergency: L.emergency });
    const svg = map.svg; if (!svg) return null;
    svg.style.width = W + 'px'; svg.style.height = H + 'px';
    if (floor && map.floors().some(f => f.id === floor)) map.floor(floor);
    map.priceChecks(L.priceChecks ? 'small' : 'off');
    if (marks) map.setMarks(marks);
    let route = null;
    if (evacFrom) route = map.evacuate(evacFrom);
    // A leg drawn straight (no walk paths) would cut through the shelves on
    // a poster: paper keeps the walk to the exit and rings the assembly point.
    for (const el of svg.querySelectorAll('.evac-route-line.assembly.straight, .evac-route-casing.assembly.straight')) el.remove();
    if (pins.length) map.drawPins(pins);
    if (dept?.length) map.zoomDeptOn(dept, map.floorId(), 0);
    if (Array.isArray(frame)) map.setVb(frame);
    else if (frame && frame.around) { const [x, y] = frame.around, s = frame.span || 900, h = s / aspect; map.setVb([x - s / 2, y - h / 2, s, h]); }
    else if (frame !== 'dept' || !dept?.length) map.fit();
    // Paper keeps what the sheet asked for and nothing interactive.
    svg.classList.add('paper'); svg.classList.toggle('paper-nolabels', !L.labels); svg.classList.toggle('paper-paths', !!L.paths);
    svg.style.setProperty('--label-display', L.labels ? 'inline' : 'none'); svg.style.setProperty('--label-opacity', L.labels ? '1' : '0'); svg.style.setProperty('--badge-opacity', L.badges ? '1' : '0');
    for (const el of svg.querySelectorAll('.mfl')) if (el.style.display === 'none') el.remove();   // other floors are not printed
    for (const el of svg.querySelectorAll('[data-sel]')) el.removeAttribute('data-sel');
    const out = svg.cloneNode(true);
    out.style.removeProperty('width'); out.style.removeProperty('height'); out.setAttribute('width', '100%'); out.setAttribute('height', '100%'); out.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!L.badges) out.classList.add('nobadges');
    const cur = mapFloors().find(f => f.id === map.floorId()) || null;
    return { svg: out.outerHTML, floor: cur, markers: map.markers().filter(m => m.floor === map.floorId()), route, shelves: map.segments().length };
  } finally { stage.remove(); }
}
