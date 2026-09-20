// Walk-path routing along the network the Map Editor authors per floor
// (pathNodes / pathEdges), ported from ShelfSearcher's route engine. Pure
// functions over plain data so the shell and tests share them.
//
//   build({ nodes, edges })            → graph | null
//   routeBetween(graph, A, B)          → { points: [{x,y}…], dist } | null
//   orderStops(graph, stops)           → { order: [indices], matrix }
//   nearestStairsByWalk / ByCoords     multi-floor joins (nodes typed 'stairs')
//
// Model: the first stop is the anchored start; the rest are ordered by
// shortest walk (nearest neighbour over true graph distances, improved
// with 2-opt). A point off the network joins it at the nearest point on
// the nearest edge.

export function build(paths) {
  if (!paths || !Array.isArray(paths.nodes) || paths.nodes.length < 2 || !Array.isArray(paths.edges) || !paths.edges.length) return null;
  const nodes = {}, ids = [];
  for (const n of paths.nodes) { if (n && n.id != null && Number.isFinite(+n.x) && Number.isFinite(+n.y)) { nodes[n.id] = { id: String(n.id), x: +n.x, y: +n.y, type: n.type || 'path' }; ids.push(String(n.id)); } }
  const adj = {}; for (const id of ids) adj[id] = [];
  const edges = [];
  for (const e of paths.edges) {
    const a = nodes[e?.a], b = nodes[e?.b]; if (!a || !b || e.a === e.b) continue;
    const len = Math.hypot(a.x - b.x, a.y - b.y); if (!(len > 0)) continue;
    edges.push({ a: a.id, b: b.id, len }); adj[a.id].push({ to: b.id, len }); adj[b.id].push({ to: a.id, len });
  }
  return edges.length ? { nodes, ids, adj, edges } : null;
}

function projectOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return { x, y, t, dist: Math.hypot(px - x, py - y) };
}
// Nearest point on the network for a map point.
export function accessPoint(graph, x, y) {
  let best = null;
  for (const e of graph.edges) {
    const a = graph.nodes[e.a], b = graph.nodes[e.b], pr = projectOnSegment(x, y, a.x, a.y, b.x, b.y);
    if (!best || pr.dist < best.offDist) best = { edge: e, point: { x: pr.x, y: pr.y }, t: pr.t, offDist: pr.dist, dToA: pr.t * e.len, dToB: (1 - pr.t) * e.len };
  }
  return best;
}
function dijkstraFrom(graph, ap) {
  const dist = {}, prev = {}, visited = {};
  for (const id of graph.ids) { dist[id] = Infinity; prev[id] = null; }
  dist[ap.edge.a] = ap.dToA; dist[ap.edge.b] = ap.dToB;
  for (;;) {
    let u = null, ud = Infinity;
    for (const id of graph.ids) if (!visited[id] && dist[id] < ud) { ud = dist[id]; u = id; }
    if (u === null) break;
    visited[u] = true;
    for (const { to, len } of graph.adj[u]) { const nd = ud + len; if (nd < dist[to]) { dist[to] = nd; prev[to] = u; } }
  }
  return { dist, prev };
}
export function routeBetween(graph, A, B, pre) {
  const apA = pre?.apA || accessPoint(graph, A.x, A.y), apB = pre?.apB || accessPoint(graph, B.x, B.y);
  if (!apA || !apB) return null;
  if (apA.edge === apB.edge) return { points: [{ x: A.x, y: A.y }, apA.point, apB.point, { x: B.x, y: B.y }], dist: apA.offDist + Math.abs(apA.dToA - apB.dToA) + apB.offDist };
  const run = pre?.runA || dijkstraFrom(graph, apA);
  const viaA = run.dist[apB.edge.a] + apB.dToA, viaB = run.dist[apB.edge.b] + apB.dToB;
  const endNode = viaA <= viaB ? apB.edge.a : apB.edge.b, onPath = Math.min(viaA, viaB);
  if (!isFinite(onPath)) return null;
  const chain = []; for (let cur = endNode; cur != null; cur = run.prev[cur]) chain.push(cur); chain.reverse();
  const pts = [{ x: A.x, y: A.y }, { x: apA.point.x, y: apA.point.y }, ...chain.map(id => ({ x: graph.nodes[id].x, y: graph.nodes[id].y })), { x: apB.point.x, y: apB.point.y }, { x: B.x, y: B.y }];
  return { points: pts, dist: apA.offDist + onPath + apB.offDist };
}
export function orderStops(graph, stops) {
  const n = stops.length;
  if (n <= 2) return { order: stops.map((_, i) => i), matrix: null };
  const aps = stops.map(s => accessPoint(graph, s.x, s.y)), runs = aps.map(ap => ap ? dijkstraFrom(graph, ap) : null);
  const crow = (i, j) => Math.hypot(stops[i].x - stops[j].x, stops[i].y - stops[j].y);
  const pair = (i, j) => { if (!aps[i] || !aps[j]) return crow(i, j); const r = routeBetween(graph, stops[i], stops[j], { apA: aps[i], apB: aps[j], runA: runs[i] }); return r && isFinite(r.dist) ? r.dist : crow(i, j); };
  const M = []; for (let i = 0; i < n; i++) { M[i] = []; for (let j = 0; j < n; j++) M[i][j] = i === j ? 0 : j < i ? M[j][i] : pair(i, j); }
  const order = [0], used = { 0: true };
  while (order.length < n) { const last = order[order.length - 1]; let best = -1, bd = Infinity; for (let k = 1; k < n; k++) if (!used[k] && M[last][k] < bd) { bd = M[last][k]; best = k; } used[best] = true; order.push(best); }
  let improved = true, guard = 0;
  while (improved && guard++ < 8) {
    improved = false;
    for (let a = 1; a < n - 1; a++) for (let b = a + 1; b < n; b++) {
      const before = M[order[a - 1]][order[a]] + (b + 1 < n ? M[order[b]][order[b + 1]] : 0);
      const after = M[order[a - 1]][order[b]] + (b + 1 < n ? M[order[a]][order[b + 1]] : 0);
      if (after + 1e-9 < before) { order.splice(a, b - a + 1, ...order.slice(a, b + 1).reverse()); improved = true; }
    }
  }
  return { order, matrix: M };
}
export const stairsNodes = graph => graph ? graph.ids.map(id => graph.nodes[id]).filter(n => n.type === 'stairs') : [];
export function nearestStairsByWalk(graph, from) {
  let best = null;
  for (const n of stairsNodes(graph)) { const r = routeBetween(graph, from, { x: n.x, y: n.y }); const d = r && isFinite(r.dist) ? r.dist : Math.hypot(from.x - n.x, from.y - n.y); if (!best || d < best.dist) best = { node: n, dist: d, route: r }; }
  return best;
}
export function nearestStairsByCoords(graph, pt) {
  let best = null;
  for (const n of stairsNodes(graph)) { const d = Math.hypot(pt.x - n.x, pt.y - n.y); if (!best || d < best.d) best = { node: n, d }; }
  return best ? best.node : null;
}
// The editor's per-floor arrays, as the published map carries them.
export function pathsOf(floor) {
  const nodes = floor?.pathNodes || floor?.paths?.nodes, edges = floor?.pathEdges || floor?.paths?.edges;
  return Array.isArray(nodes) && nodes.length >= 2 && Array.isArray(edges) && edges.length ? { nodes: nodes.map(n => ({ id: String(n.id), x: +n.x, y: +n.y, ...(n.type ? { type: String(n.type) } : {}) })), edges: edges.map(e => ({ a: String(e.a), b: String(e.b) })) } : null;
}
