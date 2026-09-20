// The walk-path router: a small H-shaped network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build, routeBetween, orderStops, accessPoint, nearestStairsByWalk, nearestStairsByCoords, pathsOf } from '../../shared/route.js';

//  n1 (0,0) ─ n2 (100,0) ─ n3 (200,0)
//                │
//             n4 (100,100) ─ n5 (200,100) [stairs]
const paths = { nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 100, y: 0 }, { id: 'n3', x: 200, y: 0 }, { id: 'n4', x: 100, y: 100 }, { id: 'n5', x: 200, y: 100, type: 'stairs' }], edges: [{ a: 'n1', b: 'n2' }, { a: 'n2', b: 'n3' }, { a: 'n2', b: 'n4' }, { a: 'n4', b: 'n5' }, { a: 'n9', b: 'n1' }, { a: 'n1', b: 'n1' }] };

test('build: nodes and edges become an adjacency, bad edges are dropped', () => {
  const g = build(paths);
  assert.deepEqual(g.ids, ['n1', 'n2', 'n3', 'n4', 'n5']); assert.equal(g.edges.length, 4); assert.equal(g.adj.n2.length, 3);
  assert.equal(build(null), null); assert.equal(build({ nodes: [{ id: 'a', x: 0, y: 0 }], edges: [] }), null);
});

test('routeBetween: joins the network at the nearest edge point and follows the shortest chain', () => {
  const g = build(paths);
  const ap = accessPoint(g, 50, 30); assert.equal(ap.edge.a, 'n1'); assert.deepEqual(ap.point, { x: 50, y: 0 }); assert.equal(ap.offDist, 30);
  const r = routeBetween(g, { x: 50, y: 30 }, { x: 200, y: 120 });
  assert.deepEqual(r.points.map(p => `${p.x},${p.y}`), ['50,30', '50,0', '100,0', '100,100', '200,100', '200,120']);
  assert.equal(Math.round(r.dist), 30 + 50 + 100 + 100 + 20);
  const same = routeBetween(g, { x: 10, y: 5 }, { x: 90, y: 5 });
  assert.equal(same.points.length, 4); assert.equal(same.dist, 5 + 80 + 5, 'two points on one edge walk along it');
});

test('orderStops: the first stop anchors and the rest follow the shortest walk', () => {
  const g = build(paths);
  const stops = [{ x: 0, y: 10 }, { x: 200, y: 110 }, { x: 200, y: 10 }, { x: 100, y: 40 }];
  const { order } = orderStops(g, stops);
  assert.equal(order[0], 0); assert.deepEqual(order, [0, 2, 3, 1], 'n1 → n3 → the spur → the stairs');
  assert.deepEqual(orderStops(g, stops.slice(0, 2)).order, [0, 1]);
});

test('stairs helpers and pathsOf', () => {
  const g = build(paths);
  assert.equal(nearestStairsByWalk(g, { x: 0, y: 0 }).node.id, 'n5'); assert.equal(nearestStairsByCoords(g, { x: 190, y: 90 }).id, 'n5');
  assert.equal(nearestStairsByWalk(build({ nodes: paths.nodes.slice(0, 2), edges: paths.edges.slice(0, 1) }), { x: 0, y: 0 }), null);
  assert.deepEqual(pathsOf({ pathNodes: [{ id: 1, x: '0', y: 0 }, { id: 2, x: 1, y: 1, type: 'stairs' }], pathEdges: [{ a: 1, b: 2 }] }), { nodes: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 1, y: 1, type: 'stairs' }], edges: [{ a: '1', b: '2' }] });
  assert.equal(pathsOf({ pathNodes: [{ id: 1, x: 0, y: 0 }], pathEdges: [] }), null); assert.equal(pathsOf({}), null);
});
