// The Map Editor's .js and .json exports render into the svg.map.real floors
// the shell mounts, the same either way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMapFile, parseStoreMapsJs, renderMap, renderFloor, markerType, deptResolver } from '../../shared/maprender.js';

const floorData = {
  shelves: [
    { name: 'A11', subname: 'S1', dept: 'h1', x: -230, y: 225, orientation: 'V', modules: 3 },
    { name: 'A11', subname: 'S2', dept: 'h1', x: -210, y: 225, orientation: 'V', modules: 3 },
    { name: 'B2', subname: '', dept: 'c1', x: 100, y: 100, modules: 8 },
    { name: 'X9', subname: 'E1', dept: 'k2', x: 400, y: 100, inactive: true },
  ],
  landmarks: [{ label: 'ENTRY', x: -600, y: 380, w: 200, h: 40, icon: 'entry' }],
  walls: [{ x: 0, y: 0, w: 300, h: 10 }, { x: 0, y: 40, w: 100, h: 8, kind: 'window' }],
  toryLines: [{ points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] }], toryDocks: [{ x: 0, y: 0, label: 'Dock' }],
  emergencyMarkers: [
    { type: 'fire_extinguisher', label: 'Ext 1', location: 'A11 S1', detail: '', method: '', operation: '', x: 300, y: 300, extClass: 'co2' },
    { type: 'fire_extinguisher', label: 'dup', location: '', detail: '', method: '', operation: '', x: 300, y: 300 },
    { type: 'first_aid', label: 'Kit', location: 'B2', detail: '', method: '', operation: '', x: 500, y: 300 },
  ],
  priceChecks: [{ label: 'PC', location: 'A11', detail: '', x: 50, y: 50 }, { label: 'Order', location: '', detail: '', x: 80, y: 50, variant: 'order' }],
  deptZoomBoxes: [], pathNodes: [{ id: 'pn1', x: 0, y: 0 }, { id: 'pn2', x: 100, y: 0, type: 'stairs' }], pathEdges: [{ a: 'pn1', b: 'pn2' }],
};
const base = {
  storeNumber: '1241', storeName: "Bus'selton", version: '4.3', storeInfo: { zone: '' }, metresPerUnit: null,
  departments: [{ id: 'h1', name: 'H1 Kitchen', color: '#FF8C00', parent: 'home' }, { id: 'c1', name: "C1 Women's", color: '#FF69B4', parent: 'clothing' }, { id: 'k2', name: 'K2', color: '#FF4500', parent: 'kids' }],
  deptGroups: [{ id: 'home', name: 'Home' }], moduleWidth: 40, shelfDepth: 20, stockroomBayW: 60, stockroomDepth: 30,
};
// The pre-rendered svg an editor .js export carries, with an old baked
// marker group that must be stripped, a backtick and a $ inside.
const prerendered = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-660 -30 1200 500" width="1200" height="500" style="background:#f8f9fa"><style>.shelf{stroke-width:1}</style><g class="landmark-group" data-landmark="true" data-lm-x="-600"><rect class="landmark-rect" x="-600" y="380" width="200" height="40"/><text class="landmark-label">ENTRY \`tick\` $5</text></g><g class="emergency-markers"><g class="emergency-marker"><circle r="1"/></g></g><g class="shelf-group" data-shelf="A11" data-subname="S1" data-dept="h1" data-full="A11 S1"><rect class="shelf" x="-230" y="225" width="20" height="120" fill="#FF8C00"/></g><g class="shelf-group" data-shelf="B2" data-subname="" data-dept="c1" data-full="B2"><rect class="shelf" x="100" y="100" width="320" height="20"/></g></svg>`;
const jsExport = `// SHELFSEARCHER Map Data — 1241 Bus'selton\n// Generated 2026-06-15 by Map Editor v4.3\n\nwindow.STORE_MAPS = window.STORE_MAPS || {};\nwindow.STORE_MAPS['1241'] = {\n  storeNumber: '1241',\n  storeName: 'Bus\\'selton',\n  version: '4.3',\n  storeInfo: ${JSON.stringify(base.storeInfo)},\n  metresPerUnit: null,\n  departments: ${JSON.stringify(base.departments)},\n  deptGroups: ${JSON.stringify(base.deptGroups)},\n  moduleWidth: 40, shelfDepth: 20,\n  stockroomBayW: 60, stockroomDepth: 30,\n  floors: [\n    {\n      id: 'ground', name: 'Ground', type: 'foh', level: 0,\n      svg: \`${prerendered.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,\n      shelves: ${JSON.stringify(floorData.shelves)},\n      landmarks: ${JSON.stringify(floorData.landmarks)},\n      walls: ${JSON.stringify(floorData.walls)},\n      toryLines: ${JSON.stringify(floorData.toryLines)},\n      toryDocks: ${JSON.stringify(floorData.toryDocks)},\n      emergencyMarkers: ${JSON.stringify(floorData.emergencyMarkers)},\n      priceChecks: ${JSON.stringify(floorData.priceChecks)},\n      deptZoomBoxes: [],\n      pathNodes: [],\n      pathEdges: [],\n    }\n  ],\n};\n`;
const jsonExport = JSON.stringify({ ...base, gridSize: 10, floors: [{ id: 'ground', name: 'Ground', type: 'foh', level: 0, ...floorData }], exportedAt: '2026-06-15T00:00:00Z' }, null, 2);

test('the .js export parses without being evaluated: quotes, template literal, trailing commas', () => {
  const data = parseStoreMapsJs(jsExport);
  assert.equal(data.storeNumber, '1241'); assert.equal(data.storeName, "Bus'selton"); assert.equal(data.metresPerUnit, null);
  assert.equal(data.floors.length, 1); assert.equal(data.floors[0].shelves.length, 4);
  assert.equal(data.floors[0].svg, prerendered, 'escaped backticks and dollars come back as written');
  assert.throws(() => parseStoreMapsJs('const x = 1;'), /STORE_MAPS/);
  assert.throws(() => parseStoreMapsJs("window.STORE_MAPS['1'] = { a: alert(1) }"), /unexpected "alert"/);
});

test('parseMapFile tells the three file kinds apart', () => {
  assert.equal(parseMapFile(jsExport, '1241-busselton.js').kind, 'map');
  assert.equal(parseMapFile(jsonExport, '1241-busselton.json').data.storeNumber, '1241');
  assert.equal(parseMapFile(JSON.stringify({ 1241: JSON.parse(jsonExport) }), 'x.json').data.storeNumber, '1241', 'a STORE_MAPS-shaped object');
  assert.equal(parseMapFile('<svg viewBox="0 0 1 1"></svg>', 'floor.svg').kind, 'svg');
  assert.throws(() => parseMapFile('{"nope":1}', 'x.json'), /no floors/);
  assert.throws(() => parseMapFile('{bad', 'x.json'), /not valid JSON/);
});

test('a .js floor renders from its pre-rendered svg: wrapper, viewBox, markers regenerated, old markers stripped', () => {
  const doc = renderMap(parseStoreMapsJs(jsExport));
  assert.equal(doc.store, '1241'); assert.equal(doc.name, "Bus'selton"); assert.equal(doc.departments.length, 3);
  const f = doc.floors[0];
  assert.equal(f.id, 'ground'); assert.equal(f.type, 'foh'); assert.equal(f.shelves, 2);
  assert.match(f.svg, /^<svg class="map real" viewBox="-720 -120 1340 660" xmlns="http:\/\/www.w3.org\/2000\/svg" preserveAspectRatio="xMidYMid meet"/);
  assert.match(f.svg, /<g id="floor-ground" class="map-floor zoom-out" data-floor="ground" data-floor-type="foh"/);
  assert.doesNotMatch(f.svg, /<style>/); assert.doesNotMatch(f.svg, /<circle r="1"\/>/, 'the baked marker group is gone');
  assert.match(f.svg, /ENTRY `tick` \$5/);
  assert.equal((f.svg.match(/<g class="emergency-marker"/g) || []).length, 2, 'the duplicate marker at the same spot is dropped');
  assert.match(f.svg, /data-equip-type="fire-ext" data-label="Ext 1"[^>]*data-ext-class="co2" data-location="A11 S1" data-loc-dept="h1" data-loc-dept-color="#FF8C00" data-loc-dept-name="H1 Kitchen" data-loc-dept-badge="H1" data-x="300" data-y="300" transform="translate\(300,300\)"/);
  assert.match(f.svg, /data-equip-type="first-aid" data-label="Kit"[^>]*data-loc-dept="c1"/);
  assert.match(f.svg, /<g class="price-checks"><g class="price-check-marker" data-variant="pc" data-label="PC" data-location="A11"[^>]*data-loc-dept="h1"/);
  assert.match(f.svg, /data-variant="order"/);
  assert.doesNotMatch(f.svg, /<foreignObject|tabler|<script|\son[a-z]+=/i);
});

test('a .json export renders the same floor from its data', () => {
  const j = renderMap(parseMapFile(jsonExport, 'x.json').data).floors[0];
  assert.deepEqual(j.paths, { nodes: [{ id: 'pn1', x: 0, y: 0 }, { id: 'pn2', x: 100, y: 0, type: 'stairs' }], edges: [{ a: 'pn1', b: 'pn2' }] }, 'the walk-path network travels with the floor');
  assert.equal(j.shelves, 4, 'inactive shelves stay, dimmed');
  assert.match(j.svg, /<g class="shelf-group" data-shelf="A11" data-subname="S1" data-dept="h1" data-full="A11 S1"><rect class="shelf" x="-230" y="225" width="20" height="120" fill="#FF8C00" fill-opacity="0.75" stroke="#FF8C00"\/><\/g>/);
  assert.match(j.svg, /<text class="shelf-label" font-size="8" x="-220" y="[\d.-]+">A11<\/text><text class="shelf-label" font-size="6" x="-220" y="[\d.-]+" fill="rgba\(255,255,255,0.7\)">S1<\/text>/);
  assert.match(j.svg, /data-shelf="X9"[^>]*><rect[^>]*fill-opacity="0.25"/);
  assert.match(j.svg, /<g class="landmark-group" data-landmark="true" data-label="ENTRY" data-lm-x="-600"[^>]*data-icon="entry">/);
  assert.match(j.svg, /<g class="wall-group" data-wall="true"/); assert.match(j.svg, /<g class="wall-group window"/);
  assert.match(j.svg, /<g class="tory-line-path"/); assert.match(j.svg, /<g class="tory-dock"[^>]*><rect class="tory-dock-bg"/);
  const viewBox = /viewBox="([^"]+)"/.exec(j.svg)[1];
  assert.equal(viewBox, '-720 -120 1340 660', 'the same footprint as the .js path');
  assert.equal(renderFloor({ id: 'empty', shelves: [] }, base).svg.includes('viewBox="0 0 100 100"'), true);
});

test('marker type aliases and the department resolver', () => {
  assert.equal(markerType('fire_extinguisher'), 'fire-ext'); assert.equal(markerType('hose_reel'), 'hose'); assert.equal(markerType(undefined), 'exit'); assert.equal(markerType('aed'), 'aed');
  const r = deptResolver({ ...base, floors: [{ shelves: floorData.shelves }] });
  assert.equal(r('a11 s1').id, 'h1'); assert.equal(r('A11S2').id, 'h1'); assert.equal(r('A11 S7').id, 'h1', 'falls back to the shelf'); assert.equal(r('B2').badge, 'C1'); assert.equal(r('ZZ'), null);
});

test('values are escaped into attributes', () => {
  const f = renderFloor({ id: 'g', shelves: [{ name: 'A<1>', subname: '"q"', dept: 'h1', x: 0, y: 0 }], emergencyMarkers: [{ type: 'exit', label: '<b>x</b>', x: 0, y: 0 }] }, base);
  assert.match(f.svg, /data-shelf="A&lt;1&gt;" data-subname="&quot;q&quot;"/); assert.match(f.svg, /data-label="&lt;b&gt;x&lt;\/b&gt;"/); assert.doesNotMatch(f.svg, /<b>x/);
});
