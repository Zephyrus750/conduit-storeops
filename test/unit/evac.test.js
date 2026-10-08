import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, evacuationRoute } from '../../shared/route.js';
import { cleanStoreInfo, renderMap } from '../../shared/maprender.js';

// A U-shaped corridor (0,0)–(100,0)–(100,100)–(0,100): exit C sits just
// past the far end, 110 away in a straight line but 310 on foot; exit B is
// 150 either way. The walk decides.
const graph = build({ nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 100, y: 100 }, { id: 'e', x: 0, y: 100 }], edges: [{ a: 'a', b: 'b' }, { a: 'b', b: 'c' }, { a: 'c', b: 'e' }] });

test('the nearest exit is the shortest walk, not the shortest straight line', () => {
  const exits = [{ x: 0, y: 110, label: 'Exit C' }, { x: 150, y: 0, label: 'Exit B' }];
  const r = evacuationRoute(graph, { x: 0, y: 0 }, exits);
  assert.equal(r.exit.target.label, 'Exit B');
  assert.equal(Math.round(r.exit.dist), 150);
  assert.equal(r.exit.straight, false);
  assert.deepEqual(r.exit.points.at(-1), { x: 150, y: 0 });
  assert.equal(r.assembly, null, 'no assembly point on the floor');
});

test('the route continues to the nearest assembly point from the exit', () => {
  const r = evacuationRoute(graph, { x: 0, y: 0 }, [{ x: 100, y: 100 }], [{ x: 100, y: 0, label: 'near' }, { x: 0, y: 0, label: 'far' }]);
  assert.equal(r.assembly.target.label, 'near'); assert.equal(Math.round(r.assembly.dist), 100);
});

test('a floor with no walk paths still answers, with straight lines marked', () => {
  const r = evacuationRoute(null, { x: 0, y: 0 }, [{ x: 30, y: 40 }, { x: 300, y: 0 }], [{ x: 30, y: 50 }]);
  assert.deepEqual([r.exit.target, r.exit.dist, r.exit.straight], [{ x: 30, y: 40 }, 50, true]);
  assert.equal(r.assembly.straight, true);
  assert.equal(evacuationRoute(graph, { x: 0, y: 0 }, []), null, 'no exits: no route');
});

test('store info is allow-listed: coordinates in range, https links, no empty fields', () => {
  assert.equal(cleanStoreInfo({ addressLines: ['', ''], lat: '', assemblyNotes: ' ' }), null, 'the blank editor template is nothing');
  const out = cleanStoreInfo({
    assemblyNotes: 'Power Centre carpark, row C', assemblyLat: '-33.6448', assemblyLng: 115.3485, lat: 'nope', lng: 400,
    directionsGoogle: 'https://maps.google.com/?q=x', directionsApple: 'javascript:alert(1)', addressLines: ['Kmart Busselton', '', 'Bussell Hwy'],
    hoursDays: [['Monday', '8am–10pm'], ['Tuesday', '']], evil: '<script>', brand: 'x'.repeat(500),
  });
  assert.deepEqual(out, { brand: 'x'.repeat(60), assemblyNotes: 'Power Centre carpark, row C', assemblyLat: -33.6448, assemblyLng: 115.3485, directionsGoogle: 'https://maps.google.com/?q=x', addressLines: ['Kmart Busselton', 'Bussell Hwy'], hoursDays: [['Monday', '8am–10pm']] });
  const doc = renderMap({ storeNumber: '1241', storeName: 'Busselton', floors: [], storeInfo: { assemblyNotes: 'Car park' }, metresPerUnit: 0.05 });
  assert.deepEqual([doc.storeInfo, doc.metresPerUnit], [{ assemblyNotes: 'Car park' }, 0.05]);
});
