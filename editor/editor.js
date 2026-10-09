// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

const state = {
  tool: 'select',
  shelves: [],         // Each shelf = independent physical unit
  landmarks: [],           // Non-searchable store elements (service desk, registers, etc.)
  departments: [
    // Home sub-departments
    { id: 'h1', name: 'H1 Kitchen', color: '#FF8C00', parent: 'home' },
    { id: 'h2', name: 'H2 BBL', color: '#9B59B6', parent: 'home' },
    { id: 'h3', name: 'H3 Decor & Pets', color: '#8B4513', parent: 'home' },
    { id: 'h4', name: 'H4 Stationary', color: '#228B22', parent: 'home' },
    // Clothing sub-departments
    { id: 'c1', name: 'C1 Women\'s Clothing', color: '#FF69B4', parent: 'clothing' },
    { id: 'c2', name: 'C2 Men\'s Clothing', color: '#4169E1', parent: 'clothing' },
    { id: 'c3', name: 'C3 Footwear', color: '#D4A017', parent: 'clothing' },
    { id: 'c4', name: 'C4 Cosmetics & Accessories', color: '#FF1493', parent: 'clothing' },
    // Kids sub-departments
    { id: 'k1', name: 'K1 Activewear & Sporting', color: '#2E8B57', parent: 'kids' },
    { id: 'k2', name: 'K2 Toys', color: '#FF4500', parent: 'kids' },
    { id: 'k3', name: 'K3 Nursery, Party & Confect.', color: '#FFB6C1', parent: 'kids' },
    { id: 'k4', name: 'K4 Kid\'s Clothing & Basics', color: '#87CEEB', parent: 'kids' },
    // Standalone departments
    { id: 'checkouts', name: 'Checkouts', color: '#10b981', parent: null },
    { id: 'flex', name: 'Flex', color: '#808080', parent: null },
    { id: 'stockroom', name: 'Stockroom', color: '#800020', parent: null },
    // Stockroom sub-departments
    { id: 'boh-sr', name: 'Stock Reserves', color: '#8B7355', parent: 'stockroom' },
    { id: 'boh-rb', name: 'Recall Bay', color: '#E07030', parent: 'stockroom' },
    { id: 'boh-lc', name: 'Laybys & C&C', color: '#5A9BD5', parent: 'stockroom' },
    { id: 'boh-fs', name: 'Fixture Storage', color: '#888888', parent: 'stockroom' },
  ],
  deptGroups: [
    { id: 'home', name: 'Home' },
    { id: 'clothing', name: 'Clothing' },
    { id: 'kids', name: 'Kids' },
    { id: 'stockroom', name: 'Stockroom' },
  ],
  selectedIds: [],
  selectedLandmarkIds: [],
  selectedLandmarkId: null,
  selectedWallIds: [],
  selectedWallId: null,
  selectedToryLineId: null,
  selectedZoomboxId: null,
  selectedEmergencyId: null,
  selectedPriceCheckId: null, // v0.136
  selectedToryDockId: null,
  highlightedName: null,  // For highlighting all shelves sharing a name
  zoom: 1, panX: 0, panY: 0,
  gridSize: 20,
  snapEnabled: true,
  snapToShelves: true,
  gridVisible: true,
  moduleWidth: 40,
  shelfDepth: 20,
  stockroomBayW: 60,
  stockroomDepth: 30,
  underlay: null, underlayOpacity: 0.3, underlayScale: 1.87, underlayX: 0, underlayY: 0,
  boundary: [], // Array of {x, y} points defining store border
  deptZoomBoxes: [], // Array of {id, dept, x, y, w, h} defining dept zoom views
  emergencyMarkers: [], // Array of {id, type, x, y, label} for emergency points
  priceChecks: [], // v0.136: Array of {id, x, y, label} for price check stations
  toryDocks: [], // Tory bot docking stations {id,x,y}
  walls: [], // Array of {id, x, y, w, h, angle} for structural walls
  toryLines: [], // Array of {id, points: [{x,y}...]} for bot travel paths
  pathNodes: [], // Walk-path nodes {id, x, y, type: 'path'|'entrance'|'stairs'} (routing network)
  pathEdges: [], // Walk-path links {a, b} between node ids (undirected)
  selectedPathNodeId: null,
  selectedPathNodeIds: [],  // multi-select (Select mode, Shift+click) — node ids moved/deleted together
  selectedPathEdge: null,   // {a, b} of the selected link (select mode)
  undoStack: [], redoStack: [],
  nextId: 1,
  dirty: false, // autosave tracking
  // Floor system
  floors: [{ id: 'ground', name: 'Ground' }],
  currentFloorId: 'ground',
};

const SNAP_THRESHOLD = 10;
const SUBNAMES_SIDES = ['S1', 'S2'];
const SUBNAMES_ENDS = ['E1', 'E2'];

// Store default departments for reset
const DEFAULT_DEPARTMENTS = JSON.parse(JSON.stringify(state.departments));
const DEFAULT_DEPT_GROUPS = JSON.parse(JSON.stringify(state.deptGroups));

let isDrawing = false, drawStart = null, drawPreview = null, drawLabel = null;
let isDrawingLandmark = false;
let isDrawingWall = false;
let isDrawingToryLine = false;
let rulerStart = null; // {x, y} — first click of ruler tool
let toryLinePoints = []; // temp points while drawing
let isDrawingCustom = false;
let isDrawingSixway = false;
let isDrawingBoundary = false, boundaryPoints = []; // temp points while drawing
let boundaryExtendEnd = null; // 'start', 'end', or null
let isDraggingBoundaryPt = false, boundaryDragIdx = -1;
let boundaryPenUp = false; // v0.313: when true, next placed point starts a new disconnected run (break)
let isDraggingLandmark = false, landmarkDragStart = null, landmarkDragOffset = null;
let isResizingLandmark = false, landmarkResizeHandle = null, landmarkResizeStart = null, landmarkResizeOrig = null;
let isDraggingWall = false, wallDragStart = null, wallDragOffset = null;
let isResizingWall = false, wallResizeHandle = null, wallResizeStart = null, wallResizeOrig = null;
let isResizingShelf = false, shelfResizeHandle = null, shelfResizeOrig = null, shelfResizeId = null;
let combineArm = null; // id of the first shelf while Combine is armed
let isSlicing = false, sliceStart = null;  // Split tool: drawing a slice line
let isDraggingToryLine = false, toryLineDragStart = null;
let toryCursor = null;   // live cursor point while chain-drawing (preview line)
let pathPortalLinkArm = null;   // {nodeId, floorId} when arming a cross-floor stairs/lift link
let pathChainPrevId = null;          // walk-paths (connect mode): chain continues from this node
let pathDragCand = null;             // {hitId, edge, sx, sy} captured at pointerdown
let isDraggingPathNode = false;
let pathGroupDragStart = null;       // {ox, oy, nodes:[{id,x,y}]} snapshot for moving a multi-selection together
let pathMode = 'connect';            // 'connect' = place + link; 'select' = pick/move/delete
let pathHoverNodeId = null;          // node under cursor (hover feedback)
let pathHoverEdgeKey = null;         // 'a|b' of edge under cursor
let pathCursor = null;               // {x,y} live cursor in connect mode (preview line)
let isDraggingToryPoint = false, toryPointDragIdx = -1;
let isPanning = false, panStart = null;
let _panRaf = 0, _panPending = null;   // raf-throttled pan (v0.247)
let isDragging = false, dragStart = null, dragOffsets = [], landmarkDragOffsets = [], wallDragOffsets = [];
let isSelecting = false, selectStart = null, selectBox = null;
let _spacingMarks = [];  // equal-spacing marks for the current drag

// ═══════════════════════════════════════════════════════════
// CANVAS
// ═══════════════════════════════════════════════════════════

const svgEl = document.getElementById('editor-canvas');
const canvasTransform = document.getElementById('canvasTransform');
const canvasContainer = document.getElementById('canvasContainer');
const shelvesGroup = document.getElementById('shelvesGroup');
const overlayGroup = document.getElementById('overlayGroup');
const guidesGroup = document.getElementById('guidesGroup');
const underlayGroup = document.getElementById('underlayGroup');
const boundaryGroup = document.getElementById('boundaryGroup');
const landmarksGroup = document.getElementById('landmarksGroup');
const wallsGroup = document.getElementById('wallsGroup');
const toryLinesGroup = document.getElementById('toryLinesGroup');
const pathsGroup = document.getElementById('pathsGroup');
const zoomboxGroup = document.getElementById('zoomboxGroup');
const emergencyGroup = document.getElementById('emergencyGroup');
const gridRect = document.getElementById('gridRect');

function updateTransform() {
  canvasTransform.setAttribute('transform', `translate(${state.panX},${state.panY}) scale(${state.zoom})`);
  document.getElementById('zoomDisplay').textContent = Math.round(state.zoom * 100) + '%';
}

function screenToCanvas(sx, sy) {
  const r = canvasContainer.getBoundingClientRect();
  return { x: (sx - r.left - state.panX) / state.zoom, y: (sy - r.top - state.panY) / state.zoom };
}

function snap(val) { return state.snapEnabled ? Math.round(val / state.gridSize) * state.gridSize : val; }
// v0.257: Path nodes default to FREE (micro) placement so precise positions stick;
// hold Ctrl while placing/dragging to snap to the grid. (Independent of the global
// Snap toggle, which governs shelves/walls/etc.) Keeps node creation consistent with
// arrow-key fine nudging — a click no longer yanks a nudged node back to the grid.
function pathSnap(val, e) { return (e && e.ctrlKey) ? Math.round(val / state.gridSize) * state.gridSize : val; }
// v0.326: Shift while chaining constrains the next node to a straight
// horizontal/vertical line from the previous node (dominant axis wins).
function pathAxisLock(x, y) {
  if (!pathChainPrevId) return { x, y };
  const pv = state.pathNodes.find(n => n.id === pathChainPrevId);
  if (!pv) return { x, y };
  return (Math.abs(x - pv.x) >= Math.abs(y - pv.y)) ? { x, y: pv.y } : { x: pv.x, y };
}

// Shelf-to-shelf snapping
function snapToShelves(x, y, w, h, excludeIds) {
  if (!state.snapToShelves) return { x, y, guides: [] };
  const threshold = SNAP_THRESHOLD / state.zoom;
  let bestX = x, bestY = y, bestXCoord = null, bestYCoord = null;
  let dxMin = threshold, dyMin = threshold;
  const guides = [];
  const edges = { left: x, right: x + w, cx: x + w/2, top: y, bottom: y + h, cy: y + h/2 };

  // Check if we're dragging an angled shelf
  const draggedShelf = state.selectedIds.length === 1 ? state.shelves.find(s => s.id === state.selectedIds[0]) : null;
  const dragAngle = draggedShelf ? getAngle(draggedShelf) : 0;

  // Rotated-edge snapping: track along-length and perpendicular corrections separately
  let rotAlongDist = threshold, rotPerpDist = threshold;
  let rotAlongDx = 0, rotAlongDy = 0, rotPerpDx = 0, rotPerpDy = 0;
  let hasRotAlong = false, hasRotPerp = false;

  state.shelves.forEach(s => {
    if (excludeIds.includes(s.id)) return;
    const sd = getDims(s);
    const sAngle = getAngle(s);

    // Rotated-edge snapping for shelves at matching non-zero angles
    if (dragAngle !== 0 && sAngle === dragAngle && draggedShelf) {
      const rad = -dragAngle * Math.PI / 180;
      const cosN = Math.cos(rad), sinN = Math.sin(rad);
      const dragDim = getDims(draggedShelf);
      // Un-rotate both positions into local axis-aligned space
      const lx = x * cosN - y * sinN, ly = x * sinN + y * cosN;
      const sx2 = s.x * cosN - s.y * sinN, sy2 = s.x * sinN + s.y * cosN;
      const le = { left: lx, right: lx + dragDim.w, top: ly, bottom: ly + dragDim.h };
      const se2 = { left: sx2, right: sx2 + sd.w, top: sy2, bottom: sy2 + sd.h };

      const radP = dragAngle * Math.PI / 180;
      const cosP = Math.cos(radP), sinP = Math.sin(radP);

      // Along-length snaps (local X): edges along the shelf's length
      [[le.left, se2.left],[le.left, se2.right],[le.right, se2.left],[le.right, se2.right]].forEach(([a,b]) => {
        const gap = Math.abs(b - a);
        if (gap < rotAlongDist) {
          rotAlongDist = gap;
          const corr = b - a;
          rotAlongDx = corr * cosP; rotAlongDy = corr * sinP;
          hasRotAlong = true;
        }
      });

      // Perpendicular snaps (local Y): edges across the shelf's depth
      [[le.top, se2.top],[le.top, se2.bottom],[le.bottom, se2.top],[le.bottom, se2.bottom]].forEach(([a,b]) => {
        const gap = Math.abs(b - a);
        if (gap < rotPerpDist) {
          rotPerpDist = gap;
          const corr = b - a;
          // Perpendicular axis is rotated 90° from along-length
          rotPerpDx = -corr * sinP; rotPerpDy = corr * cosP;
          hasRotPerp = true;
        }
      });
      return;
    }

    const se = { left: s.x, right: s.x + sd.w, cx: s.x + sd.w/2, top: s.y, bottom: s.y + sd.h, cy: s.y + sd.h/2 };

    // X snaps (axis-aligned)
    [[edges.left, se.left],[edges.left, se.right],[edges.right, se.left],[edges.right, se.right],[edges.cx, se.cx]].forEach(([a,b]) => {
      const d = Math.abs(a - b);
      if (d < dxMin) { dxMin = d; bestX = x + (b - a); bestXCoord = b; }
    });

    // Y snaps (axis-aligned)
    [[edges.top, se.top],[edges.top, se.bottom],[edges.bottom, se.top],[edges.bottom, se.bottom],[edges.cy, se.cy]].forEach(([a,b]) => {
      const d = Math.abs(a - b);
      if (d < dyMin) { dyMin = d; bestY = y + (b - a); bestYCoord = b; }
    });
  });

  // Apply rotated snaps (combine along + perpendicular independently)
  if (hasRotAlong || hasRotPerp) {
    let totalDx = 0, totalDy = 0;
    if (hasRotAlong) { totalDx += rotAlongDx; totalDy += rotAlongDy; }
    if (hasRotPerp) { totalDx += rotPerpDx; totalDy += rotPerpDy; }
    return { x: x + totalDx, y: y + totalDy, guides: [] };
  }

  // Build guide lines that SPAN every shelf sharing the aligned coordinate, so
  // a row/column of same-size shelves shows one continuous line-up guide.
  const eps = 0.75;
  if (bestXCoord != null) {
    let lo = Math.min(bestY, y), hi = Math.max(bestY, y) + h;
    state.shelves.forEach(s => {
      if (excludeIds.includes(s.id)) return;
      const sd = getDims(s);
      if (Math.abs(s.x - bestXCoord) < eps || Math.abs(s.x + sd.w - bestXCoord) < eps || Math.abs(s.x + sd.w/2 - bestXCoord) < eps) { lo = Math.min(lo, s.y); hi = Math.max(hi, s.y + sd.h); }
    });
    guides.push({ axis: 'x', pos: bestXCoord, from: lo, to: hi });
  }
  if (bestYCoord != null) {
    let lo = Math.min(bestX, x), hi = Math.max(bestX, x) + w;
    state.shelves.forEach(s => {
      if (excludeIds.includes(s.id)) return;
      const sd = getDims(s);
      if (Math.abs(s.y - bestYCoord) < eps || Math.abs(s.y + sd.h - bestYCoord) < eps || Math.abs(s.y + sd.h/2 - bestYCoord) < eps) { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x + sd.w); }
    });
    guides.push({ axis: 'y', pos: bestYCoord, from: lo, to: hi });
  }

  return { x: bestX, y: bestY, guides };
}

function renderGuides(guides) {
  guidesGroup.innerHTML = '';
  guides.forEach(g => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('snap-guide');
    if (g.axis === 'x') {
      line.setAttribute('x1', g.pos); line.setAttribute('x2', g.pos);
      line.setAttribute('y1', g.from - 20); line.setAttribute('y2', g.to + 20);
    } else {
      line.setAttribute('y1', g.pos); line.setAttribute('y2', g.pos);
      line.setAttribute('x1', g.from - 20); line.setAttribute('x2', g.to + 20);
    }
    guidesGroup.appendChild(line);
  });
}

// Equal-spacing (distribution) snap: while dragging one shelf into a run of
// same-row / same-column shelves, snap so the gap to a neighbour matches an
// existing gap (or centres it between two), and return marks describing the
// equal gaps to draw. Absolute coords in, absolute coords out.
function spacingSnap(x, y, w, h, excludeIds) {
  if (!state.snapToShelves) return null;
  const threshold = SNAP_THRESHOLD / state.zoom;
  const out = { x, y, marks: [], snappedX: false, snappedY: false };
  const dims = new Map();
  const getD = (sh) => { let d = dims.get(sh.id); if (!d) { d = getDims(sh); dims.set(sh.id, d); } return d; };

  ['x', 'y'].forEach(axis => {
    const size = axis === 'x' ? w : h;
    const startD = axis === 'x' ? x : y, endD = startD + size;
    // "mates" = shelves overlapping the dragged shelf on the OTHER axis (same row/column)
    const list = state.shelves.filter(sh => {
      if (excludeIds.includes(sh.id) || sh.type === 'sixway') return false;
      const d = getD(sh);
      if (axis === 'x') { const ov = Math.min(y + h, sh.y + d.h) - Math.max(y, sh.y); return ov > Math.min(h, d.h) * 0.5; }
      const ov = Math.min(x + w, sh.x + d.w) - Math.max(x, sh.x); return ov > Math.min(w, d.w) * 0.5;
    }).map(sh => { const d = getD(sh); return axis === 'x' ? { start: sh.x, end: sh.x + d.w } : { start: sh.y, end: sh.y + d.h }; })
      .sort((a, b) => a.start - b.start);

    let prev = null, next = null;
    list.forEach(m => {
      if (m.end <= startD + threshold && (!prev || m.end > prev.end)) prev = m;
      if (m.start >= endD - threshold && (!next || m.start < next.start)) next = m;
    });
    const cross = axis === 'x' ? (y + h / 2) : (x + w / 2);
    const setSnap = (snapStart) => { if (axis === 'x') { out.x = snapStart; out.snappedX = true; } else { out.y = snapStart; out.snappedY = true; } };
    const mark = (from, to, gap) => out.marks.push({ axis, from, to, cross, gap: Math.round(gap) });

    // (a) centre between two neighbours → equal gap both sides
    if (prev && next) {
      const space = next.start - prev.end, gap = (space - size) / 2;
      if (gap > 1) {
        const snapStart = prev.end + gap;
        if (Math.abs(snapStart - startD) < threshold) { setSnap(snapStart); mark(prev.end, snapStart, gap); mark(snapStart + size, next.start, gap); return; }
      }
    }
    // (b) continue the run's pitch on the prev side (gap before prev repeated after it)
    if (prev) {
      const before = list.filter(m => m.end <= prev.start + threshold).sort((a, b) => b.end - a.end)[0];
      if (before) { const g = prev.start - before.end; if (g > 1) { const snapStart = prev.end + g; if (Math.abs(snapStart - startD) < threshold) { setSnap(snapStart); mark(before.end, prev.start, g); mark(prev.end, snapStart, g); return; } } }
    }
    // (b2) continue the run's pitch on the next side
    if (next) {
      const after = list.filter(m => m.start >= next.end - threshold).sort((a, b) => a.start - b.start)[0];
      if (after) { const g = after.start - next.end; if (g > 1) { const snapStart = next.start - g - size; if (Math.abs(snapStart - startD) < threshold) { setSnap(snapStart); mark(snapStart + size, next.start, g); mark(next.end, after.start, g); return; } } }
    }
  });
  return out;
}

function renderSpacingMarks(marks) {
  if (!marks || !marks.length) return;
  const NS = 'http://www.w3.org/2000/svg', z = state.zoom || 1, tick = 5 / z;
  marks.forEach(m => {
    const g = document.createElementNS(NS, 'g'); g.classList.add('spacing-mark');
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    if (m.axis === 'x') {
      line.setAttribute('x1', m.from); line.setAttribute('x2', m.to); line.setAttribute('y1', m.cross); line.setAttribute('y2', m.cross);
      [m.from, m.to].forEach(px => { const t = document.createElementNS(NS, 'line'); t.setAttribute('x1', px); t.setAttribute('x2', px); t.setAttribute('y1', m.cross - tick); t.setAttribute('y2', m.cross + tick); t.setAttribute('vector-effect', 'non-scaling-stroke'); g.appendChild(t); });
    } else {
      line.setAttribute('y1', m.from); line.setAttribute('y2', m.to); line.setAttribute('x1', m.cross); line.setAttribute('x2', m.cross);
      [m.from, m.to].forEach(py => { const t = document.createElementNS(NS, 'line'); t.setAttribute('y1', py); t.setAttribute('y2', py); t.setAttribute('x1', m.cross - tick); t.setAttribute('x2', m.cross + tick); t.setAttribute('vector-effect', 'non-scaling-stroke'); g.appendChild(t); });
    }
    g.insertBefore(line, g.firstChild);
    const lbl = document.createElementNS(NS, 'text'); lbl.classList.add('spacing-label');
    lbl.setAttribute('x', m.axis === 'x' ? (m.from + m.to) / 2 : m.cross + tick + 2 / z);
    lbl.setAttribute('y', m.axis === 'x' ? m.cross - tick - 2 / z : (m.from + m.to) / 2);
    lbl.setAttribute('font-size', 10 / z); lbl.setAttribute('text-anchor', 'middle');
    lbl.textContent = m.gap;
    g.appendChild(lbl);
    guidesGroup.appendChild(g);
  });
}

function zoomIn() { setZoom(state.zoom * 1.2); }
function zoomOut() { setZoom(state.zoom / 1.2); }

function setZoom(z, cx, cy) {
  const c = canvasContainer.getBoundingClientRect();
  if (cx === undefined) { cx = c.width/2; cy = c.height/2; }
  const old = state.zoom;
  state.zoom = Math.max(0.1, Math.min(10, z));
  const s = state.zoom / old;
  state.panX = cx - (cx - state.panX) * s;
  state.panY = cy - (cy - state.panY) * s;
  updateTransform();
}

function fitView() {
  const c = canvasContainer.getBoundingClientRect();
  if (!state.shelves.length && !state.landmarks.length && !state.walls.length && !state.toryLines.length && !state.boundary.length && !state.emergencyMarkers.length && !(state.priceChecks && state.priceChecks.length) && !(state.toryDocks && state.toryDocks.length)) { state.zoom = 1; state.panX = c.width/2; state.panY = c.height/2; updateTransform(); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  state.shelves.forEach(s => { const b = getRotatedBounds(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x+b.w); y1 = Math.max(y1, b.y+b.h); });
  state.landmarks.forEach(z => { x0 = Math.min(x0, z.x); y0 = Math.min(y0, z.y); x1 = Math.max(x1, z.x+z.w); y1 = Math.max(y1, z.y+z.h); });
  state.walls.forEach(w => { x0 = Math.min(x0, w.x); y0 = Math.min(y0, w.y); x1 = Math.max(x1, w.x+w.w); y1 = Math.max(y1, w.y+w.h); });
  state.toryLines.forEach(tl => { tl.points.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }); });
  state.boundary.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
  state.emergencyMarkers.forEach(em => { x0 = Math.min(x0, em.x - 15); y0 = Math.min(y0, em.y - 15); x1 = Math.max(x1, em.x + 15); y1 = Math.max(y1, em.y + 15); });
  (state.priceChecks || []).forEach(pc => { x0 = Math.min(x0, pc.x - 15); y0 = Math.min(y0, pc.y - 15); x1 = Math.max(x1, pc.x + 15); y1 = Math.max(y1, pc.y + 15); });
  (state.toryDocks || []).forEach(td => { x0 = Math.min(x0, td.x - 18); y0 = Math.min(y0, td.y - 18); x1 = Math.max(x1, td.x + 18); y1 = Math.max(y1, td.y + 18); });
  const p = 60, w = x1-x0+p*2, h = y1-y0+p*2;
  state.zoom = Math.min(c.width/w, c.height/h, 3);
  state.panX = c.width/2 - (x0+(x1-x0)/2)*state.zoom;
  state.panY = c.height/2 - (y0+(y1-y0)/2)*state.zoom;
  updateTransform();
}

// ═══════════════════════════════════════════════════════════
// MODULE SYSTEM
// ═══════════════════════════════════════════════════════════

function isStockroom(shelf) { return shelf.dept === 'stockroom'; }

function getShelfBayW(shelf) {
  if (shelf.bayW) return shelf.bayW;                    // per-shelf override (any shelf; viewer honors it too)
  return isStockroom(shelf) ? state.stockroomBayW : state.moduleWidth;
}

function getShelfDepth(shelf) {
  if (shelf.depth) return shelf.depth;                  // per-shelf override (any shelf; viewer honors it too)
  return isStockroom(shelf) ? state.stockroomDepth : state.shelfDepth;
}

function getDims(shelf) {
  // Sixway uses radius
  if (shelf.type === 'sixway') { const d = (shelf.radius || 20) * 2; return { w: d, h: d }; }
  // Custom shelves use stored dimensions directly
  if (shelf.type === 'custom') return { w: shelf.customW, h: shelf.customH };
  const bayW = getShelfBayW(shelf);
  const depth = getShelfDepth(shelf);
  const len = shelf.modules * bayW;
  // H and V use swapped dimensions (no rotation needed)
  // A (angled) always returns horizontal — SVG rotation handles visual
  if (shelf.orientation === 'V') return { w: depth, h: len };
  return { w: len, h: depth };
}

function getAngle(shelf) {
  if (shelf.orientation === 'A' && shelf.angle != null) return shelf.angle;
  return 0; // H and V handled by getDims, no rotation
}

// Axis-aligned bounding box after rotation (for fitView, box-select)
function getRotatedBounds(shelf) {
  const dim = getDims(shelf);
  // Sixway: x,y is center
  if (shelf.type === 'sixway') {
    const r = shelf.radius || 20;
    return { x: shelf.x - r, y: shelf.y - r, w: r * 2, h: r * 2 };
  }
  const angle = getAngle(shelf);
  if (angle === 0) return { x: shelf.x, y: shelf.y, w: dim.w, h: dim.h };
  const cx = shelf.x + dim.w / 2, cy = shelf.y + dim.h / 2;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const corners = [[shelf.x, shelf.y],[shelf.x+dim.w, shelf.y],[shelf.x+dim.w, shelf.y+dim.h],[shelf.x, shelf.y+dim.h]];
  const rotated = corners.map(([px,py]) => [cx+(px-cx)*cos-(py-cy)*sin, cy+(px-cx)*sin+(py-cy)*cos]);
  const xs = rotated.map(c=>c[0]), ys = rotated.map(c=>c[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys) };
}

// v0.196: Get the 4 actual corners of a (possibly rotated) shelf for accurate
// selection intersection. Returns array of [x,y] pairs.
function getShelfCorners(shelf) {
  const dim = getDims(shelf);
  if (shelf.type === 'sixway') {
    const r = shelf.radius || 20;
    return [[shelf.x-r,shelf.y-r],[shelf.x+r,shelf.y-r],[shelf.x+r,shelf.y+r],[shelf.x-r,shelf.y+r]];
  }
  const corners = [[shelf.x, shelf.y],[shelf.x+dim.w, shelf.y],[shelf.x+dim.w, shelf.y+dim.h],[shelf.x, shelf.y+dim.h]];
  const angle = getAngle(shelf);
  if (angle === 0) return corners;
  const cx = shelf.x + dim.w / 2, cy = shelf.y + dim.h / 2;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return corners.map(([px,py]) => [cx+(px-cx)*cos-(py-cy)*sin, cy+(px-cx)*sin+(py-cy)*cos]);
}

// v0.196: Separating Axis Theorem test — checks if an axis-aligned selection box
// overlaps a (possibly rotated) shelf polygon. Prevents diagonal shelves from being
// selected by their inflated bounding box.
function selectionIntersectsShelf(sx, sy, sw, sh, shelf) {
  const angle = getAngle(shelf);
  if (angle === 0 || shelf.type === 'sixway') {
    // Unrotated — AABB test is exact
    const b = getRotatedBounds(shelf);
    return b.x < sx+sw && b.x+b.w > sx && b.y < sy+sh && b.y+b.h > sy;
  }
  // Rotated — use SAT with 4 axes (2 from box, 2 from rotated shelf)
  const boxCorners = [[sx,sy],[sx+sw,sy],[sx+sw,sy+sh],[sx,sy+sh]];
  const shelfCorners = getShelfCorners(shelf);
  const dim = getDims(shelf);
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // Axes: box contributes (1,0) and (0,1); shelf contributes its two edge directions
  const axes = [[1,0],[0,1],[cos,sin],[-sin,cos]];
  for (let a = 0; a < axes.length; a++) {
    const ax = axes[a][0], ay = axes[a][1];
    let minB = Infinity, maxB = -Infinity, minS = Infinity, maxS = -Infinity;
    for (let i = 0; i < 4; i++) {
      const pb = boxCorners[i][0]*ax + boxCorners[i][1]*ay;
      if (pb < minB) minB = pb; if (pb > maxB) maxB = pb;
      const ps = shelfCorners[i][0]*ax + shelfCorners[i][1]*ay;
      if (ps < minS) minS = ps; if (ps > maxS) maxS = ps;
    }
    if (maxB < minS || maxS < minB) return false; // separating axis found
  }
  return true; // no separating axis — they overlap
}

function modulesFromPx(px, forStockroom) {
  const bayW = forStockroom ? state.stockroomBayW : state.moduleWidth;
  return Math.max(1, Math.round(px / bayW));
}

function updateModuleSettings() {
  state.moduleWidth = Math.max(10, +document.getElementById('globalModuleW').value || 40);
  state.shelfDepth = Math.max(10, +document.getElementById('globalShelfDepth').value || 20);
  state.stockroomBayW = Math.max(10, +document.getElementById('globalStockBayW').value || 60);
  state.stockroomDepth = Math.max(10, +document.getElementById('globalStockDepth').value || 30);
  document.getElementById('statusModuleInfo').textContent = `Floor: ${state.moduleWidth}×${state.shelfDepth} | Stock: ${state.stockroomBayW}×${state.stockroomDepth}`;
  renderAll();
}

// ═══════════════════════════════════════════════════════════
// TOOLS & UNDO
// ═══════════════════════════════════════════════════════════

function setTool(tool) {
  if (state.tool === 'paths' && tool !== 'paths') { pathChainPrevId = null; state.selectedPathNodeId = null; state.selectedPathNodeIds = []; state.selectedPathEdge = null; pathCursor = null; pathHoverNodeId = null; pathHoverEdgeKey = null; if (typeof renderPaths === 'function') renderPaths(); }
  if (typeof updatePathPanel === 'function') setTimeout(updatePathPanel, 0);
  // Cancel tory line drawing if switching away
  if (isDrawingToryLine && tool !== 'toryline') {
    if (!toryLinePoints._extendId && toryLinePoints.length >= 2) { const _tl = createToryLine(toryLinePoints); state.toryLines.push(_tl); state.selectedToryLineId = _tl.id; }
    isDrawingToryLine = false; toryLinePoints = []; toryCursor = null;
    overlayGroup.querySelectorAll('.tory-preview,.tory-cursor-line').forEach(el => el.remove());
  }
  if (tool !== 'ruler') {
    rulerStart = null;
    overlayGroup.querySelectorAll('.ruler-preview').forEach(el => el.remove());
  }
  // Cancel boundary drawing if switching away
  if (isDrawingBoundary && tool !== 'boundary') {
    // v0.160: Same cleanup as Escape — drop a single orphaned point if there is one.
    if (state.boundary.length === 1) state.boundary = [];
    isDrawingBoundary = false; boundaryExtendEnd = null; boundaryPenUp = false;
    overlayGroup.querySelectorAll('.boundary-preview-line').forEach(el => el.remove());
    renderBoundary();
  }
  state.tool = tool;
  if (typeof _detect !== 'undefined' && _detect && typeof renderDetectPreview === 'function') renderDetectPreview();
  if (combineArm && tool !== 'select') cancelCombine();
  const _splitBtn = document.getElementById('splitToolBtn');
  if (_splitBtn) { const on = tool === 'split'; _splitBtn.style.background = on ? 'var(--accent)' : ''; _splitBtn.style.color = on ? '#fff' : ''; _splitBtn.textContent = on ? 'Click or drag across a shelf' : 'Cut / Slice…'; }
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  canvasContainer.className = 'canvas-container tool-' + tool;
  document.getElementById('statusTool').textContent = { select: 'Select', shelf: 'Draw Shelf', custom: 'Custom Shelf', sixway: '6-Way Display', landmark: 'Draw Landmark', wall: 'Draw Wall', toryline: 'Tory Line', boundary: 'Store Border', zoombox: 'Dept Zoom Box', emergency: 'Emergency Marker', pricecheck: 'Price Check', torydock: 'Tory Dock', pan: 'Pan', ruler: 'Ruler', split: 'Split Shelf' }[tool] || tool;
}

function switchPanelTab(tab) {
  // v0.393: index-agnostic — the Suggestions tab (suggestions.js) appends a
  // fourth tab, so tabs resolve by name instead of hardcoded positions.
  const order = ['shelves', 'list', 'settings', 'suggest'];
  document.querySelectorAll('.panel-tab').forEach((t, i) => {
    t.classList.toggle('active', order[i] === tab);
  });
  const ids = { shelves: 'tabShelves', list: 'tabList', settings: 'tabSettings', suggest: 'tabSuggest' };
  order.forEach(name => {
    const el = document.getElementById(ids[name]);
    if (el) el.classList.toggle('active', name === tab);
  });
}

function toggleGrid() { state.gridVisible = !state.gridVisible; gridRect.style.display = state.gridVisible ? '' : 'none'; }

// ── Layer visibility (v0.249): cycle full → ghost → hidden for Paths + Emergency ──
// Class-based so the state survives the frequent renderAll()/innerHTML rebuilds.
var _pathVis = 'full', _sosVis = 'full', _toryVis = 'full';
var _VIS_NEXT = { full: 'ghost', ghost: 'hidden', hidden: 'full' };
var _VIS_LABEL = { full: 'Nodes', ghost: 'Nodes ◐', hidden: 'Nodes ○' };
var _TORY_LABEL = { full: 'Tory', ghost: 'Tory ◐', hidden: 'Tory ○' };
var _SOS_LABEL = { full: 'SOS', ghost: 'SOS ◐', hidden: 'SOS ○' };
function applyLayerVisibility() {
  if (pathsGroup) {
    pathsGroup.classList.toggle('layer-ghost', _pathVis === 'ghost');
    pathsGroup.style.display = _pathVis === 'hidden' ? 'none' : '';
    // hidden also means non-interactive; ghost stays interactive so you can still edit faintly
    pathsGroup.style.pointerEvents = 'none'; // group is always pointer-events:none (coord hit-testing)
  }
  if (emergencyGroup) {
    emergencyGroup.classList.toggle('layer-ghost', _sosVis === 'ghost');
    emergencyGroup.style.display = _sosVis === 'hidden' ? 'none' : '';
  }
  if (toryLinesGroup) {
    toryLinesGroup.classList.toggle('layer-ghost', _toryVis === 'ghost');
    toryLinesGroup.style.display = _toryVis === 'hidden' ? 'none' : '';
  }
  var pb = document.getElementById('btnPathVis'); if (pb) { pb.textContent = _VIS_LABEL[_pathVis]; pb.classList.toggle('vis-off', _pathVis === 'hidden'); pb.classList.toggle('vis-ghost', _pathVis === 'ghost'); }
  var sb = document.getElementById('btnSosVis'); if (sb) { sb.textContent = _SOS_LABEL[_sosVis]; sb.classList.toggle('vis-off', _sosVis === 'hidden'); sb.classList.toggle('vis-ghost', _sosVis === 'ghost'); }
  var tb = document.getElementById('btnToryVis'); if (tb) { tb.textContent = _TORY_LABEL[_toryVis]; tb.classList.toggle('vis-off', _toryVis === 'hidden'); tb.classList.toggle('vis-ghost', _toryVis === 'ghost'); }
}
function cyclePathVisibility() {
  _pathVis = _VIS_NEXT[_pathVis];
  // when hiding the node layer, also drop any in-progress chain/selection so clicks don't act on invisible nodes
  if (_pathVis === 'hidden' && typeof cancelPathChain === 'function') cancelPathChain();
  applyLayerVisibility();
}
function cycleSosVisibility() { _sosVis = _VIS_NEXT[_sosVis]; applyLayerVisibility(); }
function cycleToryVisibility() {
  _toryVis = _VIS_NEXT[_toryVis];
  // hiding the tory layer: drop any in-progress chain + selection so handles vanish too
  if (_toryVis === 'hidden') {
    if (isDrawingToryLine && typeof finishToryLine === 'function') finishToryLine();
    state.selectedToryLineId = null;
  }
  applyLayerVisibility();
}
function toryLayerInteractive() { return _toryVis !== 'hidden'; }
function pathLayerInteractive() { return _pathVis !== 'hidden'; }
function sosLayerInteractive() { return _sosVis !== 'hidden'; }
function toggleSnap() {
  state.snapEnabled = !state.snapEnabled;
  document.getElementById('btnSnap').classList.toggle('active', state.snapEnabled);
  document.getElementById('statusSnapInfo').textContent = 'Snap: ' + (state.snapEnabled ? 'ON' : 'OFF');
}

// v0.261: Portal links between stairs/lift nodes are reciprocal and live on BOTH
// floors' data, but undo only snapshots the current floor. To make undo/redo
// restore both sides, we snapshot every floor's node->links map alongside each
// undo record and restore it on undo/redo. Lightweight: just ids + links, not
// full floor data.
function snapshotPortalLinks() {
  // sync the live current floor into its stored data first so the snapshot is complete
  if (typeof syncCurrentFloor === 'function') syncCurrentFloor();
  var snap = {};
  (state.floors || []).forEach(function (f) {
    var nodes = (f.data && f.data.pathNodes) || [];
    var m = {};
    nodes.forEach(function (n) {
      if (n.links && n.links.length) m[n.id] = JSON.parse(JSON.stringify(n.links));
    });
    snap[f.id] = m;
  });
  return snap;
}
function restorePortalLinks(snap) {
  if (!snap) return;
  (state.floors || []).forEach(function (f) {
    var nodes = (f.data && f.data.pathNodes) || [];
    var m = snap[f.id] || {};
    nodes.forEach(function (n) {
      if (m[n.id]) n.links = JSON.parse(JSON.stringify(m[n.id]));
      else if (n.links) delete n.links;
    });
  });
  // reflect onto the live current floor's pathNodes too
  var cur = (state.floors || []).find(function (f) { return f.id === state.currentFloorId; });
  if (cur && cur.data && cur.data.pathNodes) {
    var liveMap = {};
    cur.data.pathNodes.forEach(function (n) { liveMap[n.id] = n.links; });
    (state.pathNodes || []).forEach(function (n) {
      if (liveMap[n.id]) n.links = JSON.parse(JSON.stringify(liveMap[n.id]));
      else if (n.links) delete n.links;
    });
  }
}

function saveState() {
  state.undoStack.push({ shelves: JSON.parse(JSON.stringify(state.shelves)), landmarks: JSON.parse(JSON.stringify(state.landmarks)), walls: JSON.parse(JSON.stringify(state.walls)), toryLines: JSON.parse(JSON.stringify(state.toryLines)), boundary: JSON.parse(JSON.stringify(state.boundary)), deptZoomBoxes: JSON.parse(JSON.stringify(state.deptZoomBoxes)), emergencyMarkers: JSON.parse(JSON.stringify(state.emergencyMarkers)), priceChecks: JSON.parse(JSON.stringify(state.priceChecks || [])), toryDocks: JSON.parse(JSON.stringify(state.toryDocks || [])), pathNodes: JSON.parse(JSON.stringify(state.pathNodes || [])), pathEdges: JSON.parse(JSON.stringify(state.pathEdges || [])), portalLinks: snapshotPortalLinks() });
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
  markDirty();
  updateUndoStatus();
}

function undo() { if (!state.undoStack.length) return; state.redoStack.push({ shelves: JSON.parse(JSON.stringify(state.shelves)), landmarks: JSON.parse(JSON.stringify(state.landmarks)), walls: JSON.parse(JSON.stringify(state.walls)), toryLines: JSON.parse(JSON.stringify(state.toryLines)), boundary: JSON.parse(JSON.stringify(state.boundary)), deptZoomBoxes: JSON.parse(JSON.stringify(state.deptZoomBoxes)), emergencyMarkers: JSON.parse(JSON.stringify(state.emergencyMarkers)), priceChecks: JSON.parse(JSON.stringify(state.priceChecks || [])), toryDocks: JSON.parse(JSON.stringify(state.toryDocks || [])), pathNodes: JSON.parse(JSON.stringify(state.pathNodes || [])), pathEdges: JSON.parse(JSON.stringify(state.pathEdges || [])), portalLinks: snapshotPortalLinks() }); const s = state.undoStack.pop(); state.shelves = s.shelves; state.landmarks = s.landmarks; state.walls = s.walls || []; state.toryLines = s.toryLines || []; state.boundary = s.boundary || []; state.deptZoomBoxes = s.deptZoomBoxes || []; state.emergencyMarkers = s.emergencyMarkers || []; state.priceChecks = s.priceChecks || []; state.toryDocks = s.toryDocks || []; state.pathNodes = s.pathNodes || []; state.pathEdges = s.pathEdges || []; restorePortalLinks(s.portalLinks); state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedLandmarkId = null; state.selectedWallIds = []; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null; state.selectedPathNodeId = null; state.selectedPathNodeIds = []; pathChainPrevId = null; renderAll(); updateUndoStatus(); }
function redo() { if (!state.redoStack.length) return; state.undoStack.push({ shelves: JSON.parse(JSON.stringify(state.shelves)), landmarks: JSON.parse(JSON.stringify(state.landmarks)), walls: JSON.parse(JSON.stringify(state.walls)), toryLines: JSON.parse(JSON.stringify(state.toryLines)), boundary: JSON.parse(JSON.stringify(state.boundary)), deptZoomBoxes: JSON.parse(JSON.stringify(state.deptZoomBoxes)), emergencyMarkers: JSON.parse(JSON.stringify(state.emergencyMarkers)), priceChecks: JSON.parse(JSON.stringify(state.priceChecks || [])), toryDocks: JSON.parse(JSON.stringify(state.toryDocks || [])), pathNodes: JSON.parse(JSON.stringify(state.pathNodes || [])), pathEdges: JSON.parse(JSON.stringify(state.pathEdges || [])), portalLinks: snapshotPortalLinks() }); const s = state.redoStack.pop(); state.shelves = s.shelves; state.landmarks = s.landmarks; state.walls = s.walls || []; state.toryLines = s.toryLines || []; state.boundary = s.boundary || []; state.deptZoomBoxes = s.deptZoomBoxes || []; state.emergencyMarkers = s.emergencyMarkers || []; state.priceChecks = s.priceChecks || []; state.toryDocks = s.toryDocks || []; state.pathNodes = s.pathNodes || []; state.pathEdges = s.pathEdges || []; restorePortalLinks(s.portalLinks); state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedLandmarkId = null; state.selectedWallIds = []; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null; state.selectedPathNodeId = null; state.selectedPathNodeIds = []; pathChainPrevId = null; renderAll(); updateUndoStatus(); }
function updateUndoStatus() {
  var el = document.getElementById('statusUndo');
  if (el) el.textContent = '\u21a9 ' + state.undoStack.length + ' | \u21aa ' + state.redoStack.length;
}

// ═══════════════════════════════════════════════════════════
// SHELF DATA
// ═══════════════════════════════════════════════════════════

function createShelf(x, y, drawnW, drawnH, forStockroom) {
  const isV = drawnH > drawnW;
  const lengthPx = isV ? drawnH : drawnW;
  const bayW = forStockroom ? state.stockroomBayW : state.moduleWidth;
  return {
    id: 'shelf_' + state.nextId++,
    name: '',
    subname: '',
    x: snap(x), y: snap(y),
    dept: forStockroom ? 'stockroom' : (state.departments.find(d => d.id !== 'stockroom')?.id || ''),
    orientation: isV ? 'V' : 'H',
    modules: Math.max(1, Math.round(lengthPx / bayW)),
    angle: null,
    // Per-shelf overrides (stockroom only, null = use global)
    bayW: forStockroom ? state.stockroomBayW : null,
    depth: forStockroom ? state.stockroomDepth : null,
    inactive: false,
  };
}

function fullName(s) { return s.name + (s.subname ? s.subname : ''); }
function getColor(s) { const d = state.departments.find(x => x.id === s.dept); return d ? d.color : '#64748b'; }

// ═══════════════════════════════════════════════════════════
// LANDMARKS (physical store elements — not searchable)
// ═══════════════════════════════════════════════════════════

function createLandmark(x, y, w, h) {
  return {
    id: 'landmark_' + state.nextId++,
    label: '',
    x: snap(x), y: snap(y),
    w: Math.max(20, snap(w)), h: Math.max(20, snap(h)),
    angle: 0,
  };
}

function renderLandmarks() {
  landmarksGroup.innerHTML = '';
  state.landmarks.forEach(zone => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('landmark-group');
    g.dataset.landmarkId = zone.id;
    if (state.selectedLandmarkId === zone.id || state.selectedLandmarkIds.includes(zone.id)) g.classList.add('selected');

    const angle = zone.angle || 0;
    if (angle !== 0) {
      const cx = zone.x + zone.w / 2, cy = zone.y + zone.h / 2;
      g.setAttribute('transform', `rotate(${angle}, ${cx}, ${cy})`);
    }

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('landmark-rect');
    rect.setAttribute('x', zone.x); rect.setAttribute('y', zone.y);
    rect.setAttribute('width', zone.w); rect.setAttribute('height', zone.h);
    g.appendChild(rect);

    const hasIcon = zone.icon && LANDMARK_ICONS[zone.icon];
    const iconSize = Math.min(zone.w * 0.4, zone.h * 0.5, 16);
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h / 2;

    if (hasIcon) {
      const iconG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const iconY = zone.label ? cy - iconSize * 0.3 : cy;
      iconG.setAttribute('transform', `translate(${cx - iconSize/2}, ${iconY - iconSize/2}) scale(${iconSize/24})`);
      iconG.innerHTML = LANDMARK_ICONS[zone.icon];
      iconG.setAttribute('fill', 'none');
      iconG.setAttribute('stroke', 'rgba(255,255,255,0.8)');
      iconG.setAttribute('stroke-width', '2');
      iconG.setAttribute('stroke-linecap', 'round');
      iconG.setAttribute('stroke-linejoin', 'round');
      iconG.style.pointerEvents = 'none';
      g.appendChild(iconG);
    }

    if (zone.label) {
      const fontSize = Math.max(6, Math.min(10, zone.w * 0.08, zone.h * 0.25));
      const textY = hasIcon ? cy + iconSize * 0.5 : cy;
      const maxChars = Math.max(3, Math.floor(zone.w / (fontSize * 0.6)));
      const words = zone.label.split(' ');
      const lines = [];
      let line = '';
      words.forEach(w => {
        if ((line + ' ' + w).trim().length <= maxChars) line = (line + ' ' + w).trim();
        else { if (line) lines.push(line); line = w; }
      });
      if (line) lines.push(line);

      const lineH = fontSize * 1.3;
      const startY = textY - ((lines.length - 1) * lineH) / 2 + fontSize * 0.35;
      lines.forEach((ln, i) => {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.classList.add('landmark-label');
        t.setAttribute('font-size', fontSize);
        t.setAttribute('x', cx);
        t.setAttribute('y', startY + i * lineH);
        t.textContent = ln;
        g.appendChild(t);
      });
    }

    landmarksGroup.appendChild(g);
  });
}


function buildLandmarkSVG(z, opts) {
  const cx = z.x + z.w/2, cy = z.y + z.h/2;
  const angle = z.angle || 0;
  const tr = angle ? ` transform="rotate(${angle},${cx},${cy})"` : '';
  const bohAttr = z.boh ? ' data-boh="true"' : '';
  const iconAttr = z.icon ? ` data-icon="${z.icon}"` : '';
  const lmLabelAttr = (opts.dataAttrs && z.label) ? ` data-label="${escAttr(z.label)}"` : '';
  const classAttr = opts.dataAttrs ? ` class="landmark-group" data-landmark="true"${lmLabelAttr} data-lm-x="${z.x}" data-lm-y="${z.y}" data-lm-w="${z.w}" data-lm-h="${z.h}"${bohAttr}${iconAttr}` : '';
  let svg = `<g${classAttr}${tr}>`;
  if (opts.dataAttrs) {
    svg += `<rect class="landmark-rect" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="rgba(26,27,30,0.6)" rx="3" stroke="#888" stroke-width="0.5"/>`;
  } else {
    svg += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="rgba(26,27,30,0.6)" rx="3" stroke="#888" stroke-width="0.5"/>`;
  }
  const hasIcon = z.icon && LANDMARK_ICONS[z.icon];
  const iconSize = Math.min(z.w * 0.4, z.h * 0.5, 16);
  if (hasIcon && opts.showLabels !== false) {
    const iconY = z.label ? cy - iconSize * 0.3 : cy;
    svg += `<g transform="translate(${cx - iconSize/2}, ${iconY - iconSize/2}) scale(${(iconSize/24).toFixed(3)})" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">${LANDMARK_ICONS[z.icon]}</g>`;
  }
  if (z.label && opts.showLabels !== false) {
    // Text box, leaving room for the icon if one is shown
    const padX = Math.min(4, z.w * 0.08);
    const availW = Math.max(4, z.w - padX * 2);
    const iconReserve = (hasIcon && opts.showLabels !== false) ? iconSize * 1.15 : 0;
    const availH = Math.max(4, z.h - iconReserve - 4);
    const tall = z.h >= z.w * 1.25;            // tall & narrow → stack words vertically
    const charW = fs => fs * 0.6 + 1;          // monospace glyph + ~1px letter-spacing

    const wrap = fs => {
      const maxChars = Math.max(1, Math.floor(availW / charW(fs)));
      const out = [];
      let line = '';
      z.label.split(/\s+/).forEach(raw => {
        let word = raw;
        if (tall && line) { out.push(line); line = ''; }   // one word per line when tall
        while (word.length > maxChars) {                    // hard-break over-long words
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, maxChars));
          word = word.slice(maxChars);
        }
        if (!word) return;
        if (!line) line = word;
        else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
        else { out.push(line); line = word; }
      });
      if (line) out.push(line);
      return out;
    };

    let fontSize = Math.max(5, Math.min(10, z.w * 0.08, z.h * 0.25));
    let lines = wrap(fontSize);
    let guard = 0;
    while (fontSize > 5 && guard++ < 14) {     // shrink until it fits width AND height
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      const widthOK = longest * charW(fontSize) <= availW + 0.5;
      const heightOK = lines.length * fontSize * 1.25 <= availH + 0.5;
      if (widthOK && heightOK) break;
      fontSize = Math.max(5, fontSize - 0.5);
      lines = wrap(fontSize);
    }

    const textY = hasIcon ? cy + iconSize * 0.45 : cy;
    const lineH = fontSize * 1.25;
    const startY = textY - ((lines.length - 1) * lineH) / 2 + fontSize * 0.35;
    const fontAttrs = opts.dataAttrs
      ? `class="landmark-label" fill="#fff" font-family="JetBrains Mono,monospace" font-weight="700" letter-spacing="1"`
      : `font-family="JetBrains Mono,monospace" font-weight="700" fill="#fff" letter-spacing="1"`;
    lines.forEach((ln, i) => {
      svg += `<text ${fontAttrs} font-size="${fontSize.toFixed(2)}" text-anchor="middle" dominant-baseline="central" x="${cx}" y="${(startY + i * lineH).toFixed(1)}" style="pointer-events:none">${ln}</text>`;
    });
  }
  svg += '</g>';
  return svg;
}

// Landmark icon SVG paths (24x24 viewBox, stroke-based)
const LANDMARK_ICONS = {
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

// Called after renderShelves so overlay isn't cleared
function renderLandmarkOverlays() {
  if (!state.selectedLandmarkId) return;
  const zone = state.landmarks.find(z => z.id === state.selectedLandmarkId);
  if (!zone) return;
  const angle = zone.angle || 0;
  const cx = zone.x + zone.w / 2, cy = zone.y + zone.h / 2;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  [['br','nwse'], ['tl','nwse'], ['tr','nesw'], ['bl','nesw']].forEach(([pos, cursor]) => {
    let px = pos.includes('r') ? zone.x + zone.w : zone.x;
    let py = pos.includes('b') ? zone.y + zone.h : zone.y;
    // Rotate handle position around center
    if (angle !== 0) {
      const dx = px - cx, dy = py - cy;
      px = cx + dx * cos - dy * sin;
      py = cy + dx * sin + dy * cos;
    }
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', px); c.setAttribute('cy', py);
    c.setAttribute('r', 4 / state.zoom); c.setAttribute('fill', 'var(--accent)');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 1.5);
    c.style.cursor = cursor + '-resize';
    c.classList.add('landmark-resize-handle');
    c.dataset.pos = pos; c.dataset.landmarkId = zone.id;
    overlayGroup.appendChild(c);
  });
}

function updateLandmarkPanel() {
  const panel = document.getElementById('landmarkPanel');
  if (!state.selectedLandmarkId) { panel.style.display = 'none'; return; }
  const zone = state.landmarks.find(z => z.id === state.selectedLandmarkId);
  if (!zone) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  document.getElementById('landmarkPropLabel').value = zone.label;
  document.getElementById('landmarkPropIcon').value = zone.icon || '';
  document.getElementById('landmarkPropX').value = Math.round(zone.x);
  document.getElementById('landmarkPropY').value = Math.round(zone.y);
  document.getElementById('landmarkPropW').value = Math.round(zone.w);
  document.getElementById('landmarkPropH').value = Math.round(zone.h);
  const a = zone.angle || 0;
  document.getElementById('landmarkPropAngle').value = a;
  document.getElementById('landmarkPropAngleSlider').value = a;
}

function updateLandmarkAngle(deg) {
  if (!state.selectedLandmarkId) return;
  const zone = state.landmarks.find(z => z.id === state.selectedLandmarkId);
  if (!zone) return;
  saveState();
  deg = Math.max(-90, Math.min(90, deg));
  zone.angle = deg;
  document.getElementById('landmarkPropAngle').value = deg;
  document.getElementById('landmarkPropAngleSlider').value = deg;
  renderAll();
}

function updateLandmarkProp(prop, value) {
  if (!state.selectedLandmarkId) return;
  const zone = state.landmarks.find(z => z.id === state.selectedLandmarkId);
  if (!zone) return;
  saveState();
  zone[prop] = value;
  renderAll();
}

// ═══════════════════════════════════════════════════════════
// WALLS (structural black rectangles — no labels, moveable)
// ═══════════════════════════════════════════════════════════

function createWall(x, y, w, h) {
  return {
    id: 'wall_' + state.nextId++,
    x: snap(x), y: snap(y),
    w: Math.max(4, snap(w)), h: Math.max(4, snap(h)),
    angle: 0,
  };
}

function renderWalls() {
  wallsGroup.innerHTML = '';
  state.walls.forEach(wall => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('wall-group');
    if (wall.kind === 'window') g.classList.add('window');
    g.dataset.wallId = wall.id;
    if (state.selectedWallId === wall.id || state.selectedWallIds.includes(wall.id)) g.classList.add('selected');

    const angle = wall.angle || 0;
    if (angle !== 0) {
      const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
      g.setAttribute('transform', `rotate(${angle}, ${cx}, ${cy})`);
    }

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('wall-rect');
    rect.setAttribute('x', wall.x); rect.setAttribute('y', wall.y);
    rect.setAttribute('width', wall.w); rect.setAttribute('height', wall.h);
    g.appendChild(rect);

    // v0.321: window variant — inner glass line along the long axis
    if (wall.kind === 'window') {
      const gl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const horiz = wall.w >= wall.h;
      const cy2 = wall.y + wall.h / 2, cx2 = wall.x + wall.w / 2;
      gl.setAttribute('x1', horiz ? wall.x + 2 : cx2);
      gl.setAttribute('y1', horiz ? cy2 : wall.y + 2);
      gl.setAttribute('x2', horiz ? wall.x + wall.w - 2 : cx2);
      gl.setAttribute('y2', horiz ? cy2 : wall.y + wall.h - 2);
      gl.setAttribute('stroke', '#ffffff');
      gl.setAttribute('stroke-width', 1.2);
      gl.style.pointerEvents = 'none';
      g.appendChild(gl);
    }

    wallsGroup.appendChild(g);
  });
}

function renderWallOverlays() {
  if (!state.selectedWallId) return;
  const wall = state.walls.find(w => w.id === state.selectedWallId);
  if (!wall) return;
  const angle = wall.angle || 0;
  const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  [['br','nwse'], ['tl','nwse'], ['tr','nesw'], ['bl','nesw']].forEach(([pos, cursor]) => {
    let px = pos.includes('r') ? wall.x + wall.w : wall.x;
    let py = pos.includes('b') ? wall.y + wall.h : wall.y;
    if (angle !== 0) {
      const dx = px - cx, dy = py - cy;
      px = cx + dx * cos - dy * sin;
      py = cy + dx * sin + dy * cos;
    }
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', px); c.setAttribute('cy', py);
    c.setAttribute('r', 4 / state.zoom); c.setAttribute('fill', 'var(--accent)');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 1.5);
    c.style.cursor = cursor + '-resize';
    c.classList.add('wall-resize-handle');
    c.dataset.pos = pos; c.dataset.wallId = wall.id;
    overlayGroup.appendChild(c);
  });
}

function updateWallPanel() {
  const panel = document.getElementById('wallPanel');
  if (!state.selectedWallId) { panel.style.display = 'none'; return; }
  const wall = state.walls.find(w => w.id === state.selectedWallId);
  if (!wall) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  document.getElementById('wallPropX').value = Math.round(wall.x);
  const wallKindSel = document.getElementById('wallPropKind');
  if (wallKindSel) wallKindSel.value = wall.kind === 'window' ? 'window' : 'wall';
  document.getElementById('wallPropY').value = Math.round(wall.y);
  document.getElementById('wallPropW').value = Math.round(wall.w);
  document.getElementById('wallPropH').value = Math.round(wall.h);
  const a = wall.angle || 0;
  document.getElementById('wallPropAngle').value = a;
  document.getElementById('wallPropAngleSlider').value = a;
}

function updateWallAngle(deg) {
  if (!state.selectedWallId) return;
  const wall = state.walls.find(w => w.id === state.selectedWallId);
  if (!wall) return;
  saveState();
  deg = Math.max(-90, Math.min(90, deg));
  wall.angle = deg;
  document.getElementById('wallPropAngle').value = deg;
  document.getElementById('wallPropAngleSlider').value = deg;
  renderAll();
}

function updateWallProp(prop, value) {
  if (!state.selectedWallId) return;
  const wall = state.walls.find(w => w.id === state.selectedWallId);
  if (!wall) return;
  saveState();
  wall[prop] = value;
  renderAll();
}

function duplicateWall() {
  if (!state.selectedWallId) return;
  saveState();
  const o = state.walls.find(w => w.id === state.selectedWallId); if (!o) return;
  const c = { ...o, id: 'wall_' + state.nextId++, x: o.x + 20, y: o.y + 20 };
  state.walls.push(c); state.selectedWallId = c.id; renderAll();
}

// ═══════════════════════════════════════════════════════════
// TORY LINES (bot travel paths — pink dashed polylines)
// ═══════════════════════════════════════════════════════════

function createToryLine(points) {
  return { id: 'tory_' + state.nextId++, points: points.map(p => ({ x: snap(p.x), y: snap(p.y) })) };
}

function renderToryLines() {
  toryLinesGroup.innerHTML = '';
  state.toryLines.forEach(tl => {
    if (tl.points.length < 2) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('tory-line-group');
    g.dataset.toryLineId = tl.id;
    if (state.selectedToryLineId === tl.id) g.classList.add('selected');

    const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('points', tl.points.map(p => p.x + ',' + p.y).join(' '));
    g.appendChild(pl);

    // v0.196: Dock marker — pink circle at start of tory line
    const dock = tl.points[0];
    const dockCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dockCircle.setAttribute('cx', dock.x); dockCircle.setAttribute('cy', dock.y);
    dockCircle.setAttribute('r', 8); dockCircle.setAttribute('fill', 'rgba(255,105,180,0.3)');
    dockCircle.setAttribute('stroke', '#ff69b4'); dockCircle.setAttribute('stroke-width', '2');
    g.appendChild(dockCircle);
    const dockLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dockLabel.setAttribute('x', dock.x); dockLabel.setAttribute('y', dock.y + 3.5);
    dockLabel.setAttribute('text-anchor', 'middle'); dockLabel.setAttribute('fill', '#ff69b4');
    dockLabel.setAttribute('font-size', '9'); dockLabel.setAttribute('font-weight', '700');
    dockLabel.setAttribute('pointer-events', 'none'); dockLabel.textContent = 'D';
    g.appendChild(dockLabel);

    toryLinesGroup.appendChild(g);
  });
}

function renderToryLineOverlays() {
  if (!state.selectedToryLineId) return;
  const tl = state.toryLines.find(t => t.id === state.selectedToryLineId);
  if (!tl) return;
  tl.points.forEach((p, i) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    c.setAttribute('r', 5 / state.zoom); c.setAttribute('fill', '#ff69b4');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 1.5);
    c.classList.add('tory-point-handle');
    c.dataset.toryLineId = tl.id;
    c.dataset.pointIdx = i;
    overlayGroup.appendChild(c);
  });
}

function updateToryLinePanel() {
  const panel = document.getElementById('toryLinePanel');
  if (!state.selectedToryLineId) { panel.style.display = 'none'; return; }
  const tl = state.toryLines.find(t => t.id === state.selectedToryLineId);
  if (!tl) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  document.getElementById('toryLineInfo').textContent = tl.points.length + ' point' + (tl.points.length !== 1 ? 's' : '') + ' \u2014 drag handles to reshape';
}

function duplicateToryLine() {
  if (!state.selectedToryLineId) return;
  saveState();
  const o = state.toryLines.find(t => t.id === state.selectedToryLineId); if (!o) return;
  const c = { id: 'tory_' + state.nextId++, points: o.points.map(p => ({ x: p.x + 20, y: p.y + 20 })) };
  state.toryLines.push(c); state.selectedToryLineId = c.id; renderAll();
}

function renderRulerPreview() {
  overlayGroup.querySelectorAll('.ruler-preview').forEach(el => el.remove());
  if (!rulerStart) return;
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', rulerStart.x); c.setAttribute('cy', rulerStart.y);
  c.setAttribute('r', 4/state.zoom); c.setAttribute('fill', '#fbbf24');
  c.classList.add('ruler-preview');
  overlayGroup.appendChild(c);
}

function finishToryLine() {
  if (!isDrawingToryLine) return;
  // A brand-new chain lives in toryLinePoints until finished; commit it if >= 2 pts.
  if (!toryLinePoints._extendId && toryLinePoints.length >= 2) {
    const tl = createToryLine(toryLinePoints);
    state.toryLines.push(tl);
    state.selectedToryLineId = tl.id;
  }
  isDrawingToryLine = false; toryLinePoints = []; toryCursor = null;
  overlayGroup.querySelectorAll('.tory-preview,.tory-cursor-line').forEach(el => el.remove());
  renderAll();
}

function renderToryLinePreview() {
  overlayGroup.querySelectorAll('.tory-preview').forEach(el => el.remove());
  if (!isDrawingToryLine || toryLinePoints.length === 0) return;
  // Committed chain so far (only meaningful for a brand-new line; extends append live)
  if (toryLinePoints.length >= 2) {
    const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('points', toryLinePoints.map(p => p.x + ',' + p.y).join(' '));
    pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#ff69b4');
    pl.setAttribute('stroke-width', 2.5 / state.zoom); pl.setAttribute('stroke-dasharray', (8/state.zoom) + ' ' + (4/state.zoom));
    pl.setAttribute('stroke-linecap', 'round'); pl.setAttribute('stroke-linejoin', 'round');
    pl.classList.add('tory-preview');
    overlayGroup.appendChild(pl);
  }
  // Live "rubber-band" preview line from the last point to the cursor
  const anchor = toryLinePoints[toryLinePoints.length - 1];
  if (anchor && toryCursor) {
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', anchor.x); ln.setAttribute('y1', anchor.y);
    ln.setAttribute('x2', toryCursor.x); ln.setAttribute('y2', toryCursor.y);
    ln.setAttribute('stroke', '#94a3b8'); ln.setAttribute('stroke-width', 2 / state.zoom);
    ln.setAttribute('stroke-dasharray', (2/state.zoom) + ' ' + (4/state.zoom));
    ln.setAttribute('stroke-linecap', 'round'); ln.setAttribute('opacity', '0.9');
    ln.classList.add('tory-preview');
    overlayGroup.appendChild(ln);
  }
  // Point markers
  toryLinePoints.forEach(p => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    c.setAttribute('r', 4 / state.zoom); c.setAttribute('fill', '#ff69b4');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 1);
    c.classList.add('tory-preview');
    overlayGroup.appendChild(c);
  });
}

// Duplicate detection — find shelves sharing the same full name (name+subname)
function getDuplicates() {
  const counts = {};
  state.shelves.forEach(s => {
    const fn = fullName(s);
    if (!fn || !String(s.name || '').trim()) return; // unnamed shelves don't count (a detected run's S1/S2 before it is named)
    if (!counts[fn]) counts[fn] = [];
    counts[fn].push(s);
  });
  const dupes = {}; // id -> fullName for all duplicated shelves
  Object.entries(counts).forEach(([fn, shelves]) => {
    if (shelves.length > 1) {
      // Skip if ALL instances are marked as confirmed shared name
      const allShared = shelves.every(s => s.sharedName);
      if (allShared) return;
      shelves.forEach(s => dupes[s.id] = fn);
    }
  });
  return dupes;
}

function getDuplicateNames() {
  const counts = {};
  state.shelves.forEach(s => {
    const fn = fullName(s);
    if (!fn || !String(s.name || '').trim()) return;
    counts[fn] = (counts[fn] || 0) + 1;
  });
  return Object.entries(counts).filter(([, c]) => c > 1).map(([fn]) => fn);
}

// ═══════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════

// v0.313: The border no longer has to be one continuous closed loop drawn in a
// single go. Points can be placed with GAPS — press G while drawing to lift the
// pen and start a new disconnected segment (a point flagged break:true starts a
// new run). The border is only "complete" when it's a single run closed back to
// its start. Closure is recorded geometrically — closing appends a copy of the
// first point so first===last — which means it rides through undo, autosave and
// every export path with no schema change.
const BOUNDARY_NS = 'http://www.w3.org/2000/svg';
function boundaryRuns() {
  const runs = [];
  let cur = null;
  state.boundary.forEach((p, i) => {
    if (i === 0 || p.break) { cur = [p]; runs.push(cur); }
    else cur.push(p);
  });
  return runs;
}
function boundaryIsClosed() {
  const p = state.boundary;
  if (p.length < 4) return false;            // need ≥3 distinct corners + closing copy
  if (boundaryRuns().length !== 1) return false;
  const a = p[0], b = p[p.length - 1];
  return a.x === b.x && a.y === b.y;
}

// v0.314: rebuild the flat point array from an array of runs, re-flagging the
// first point of every run after the first as a break (gap start).
function rebuildBoundaryFromRuns(runs) {
  const out = [];
  runs.forEach((run, ri) => {
    run.forEach((p, pi) => {
      const np = { x: p.x, y: p.y };
      if (ri > 0 && pi === 0) np.break = true;
      out.push(np);
    });
  });
  state.boundary = out;
}
// Global indices that are an unconnected END of a run (empty when fully closed).
function boundaryOpenEndIndices() {
  if (boundaryIsClosed()) return [];
  const ends = [];
  let idx = 0;
  boundaryRuns().forEach(run => {
    ends.push(idx);
    if (run.length > 1) ends.push(idx + run.length - 1);
    idx += run.length;
  });
  return ends;
}
// Nearest open-end global index within hit distance of (x,y), excluding `exclude`; else -1.
function boundaryEndAt(x, y, exclude) {
  const lim = 15 / state.zoom;
  let best = -1, bestD = lim;
  boundaryOpenEndIndices().forEach(i => {
    if (i === exclude) return;
    const p = state.boundary[i];
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}
// Enter drawing mode resuming from open end k — normalised so k sits at the array
// tail, which makes the existing append + join logic work from any run end.
function boundaryResumeFromEnd(k) {
  const runs = boundaryRuns();
  let gi = 0, target = null;
  runs.forEach((run, ri) => run.forEach((p, pi) => {
    if (gi === k) target = { ri, head: pi === 0, tail: pi === run.length - 1 };
    gi++;
  }));
  if (!target || !(target.head || target.tail)) return false;
  saveState();
  const R = runs[target.ri].map(p => ({ x: p.x, y: p.y }));
  if (target.head) R.reverse();                 // make k the LAST element
  const others = [];
  runs.forEach((run, ri) => { if (ri !== target.ri) others.push(run.map(p => ({ x: p.x, y: p.y }))); });
  rebuildBoundaryFromRuns(others.concat([R]));  // R last → k at the array end
  isDrawingBoundary = true; boundaryExtendEnd = 'end'; boundaryPenUp = false;
  renderBoundary();
  return true;
}
// Connect open end i to open end j: merge the two runs, or close the ring if i and
// j are the two ends of the one and only run. Returns true if something happened.
function boundaryJoin(i, j) {
  const runs = boundaryRuns();
  let gi = 0; const meta = [];
  runs.forEach((run, ri) => run.forEach((p, pi) => { meta[gi++] = { ri, head: pi === 0, tail: pi === run.length - 1 }; }));
  const mi = meta[i], mj = meta[j];
  if (!mi || !mj) return false;
  if (mi.ri === mj.ri) {
    if (runs.length === 1 && runs[0].length >= 3 && ((mi.head && mj.tail) || (mi.tail && mj.head))) {
      saveState();
      const fp = state.boundary[0];
      if (!boundaryIsClosed()) state.boundary.push({ x: fp.x, y: fp.y });
      renderBoundary();
      return true;
    }
    return false;
  }
  saveState();
  const A = runs[mi.ri].map(p => ({ x: p.x, y: p.y }));
  const B = runs[mj.ri].map(p => ({ x: p.x, y: p.y }));
  if (mi.head) A.reverse();   // A's connecting end goes to the back
  if (mj.tail) B.reverse();   // B's connecting end goes to the front
  const newRuns = [A.concat(B)];
  runs.forEach((run, ri) => { if (ri !== mi.ri && ri !== mj.ri) newRuns.push(run.map(p => ({ x: p.x, y: p.y }))); });
  rebuildBoundaryFromRuns(newRuns);
  renderBoundary();
  return true;
}

function renderBoundary() {
  boundaryGroup.innerHTML = '';
  const pts = state.boundary;
  const runs = boundaryRuns();
  const closed = boundaryIsClosed();

  // Indices that are an unconnected end of a run (only relevant when not closed)
  const openEnds = new Set();
  if (!closed) {
    let idx = 0;
    runs.forEach(run => {
      openEnds.add(idx);
      openEnds.add(idx + run.length - 1);
      idx += run.length;
    });
  }

  // Status + completeness verification
  const status = document.getElementById('borderStatus');
  if (status) {
    if (isDrawingBoundary) {
      if (pts.length === 0) status.innerHTML = `Click to place points freely — hold <strong>Ctrl</strong> to snap, <strong>G</strong> for a new segment`;
      else if (boundaryPenUp) status.innerHTML = `<strong>New segment</strong> — click to start a disconnected run (gap left behind)`;
      else if (pts.length < 3) status.innerHTML = `<strong>${pts.length}</strong> point(s) — click to continue, <strong>G</strong> = new segment, Esc cancels`;
      else status.innerHTML = `<strong>${pts.length}</strong> points — click the first point to close, another loose end to join, <strong>G</strong> = new segment`;
    } else if (!pts.length) {
      status.textContent = 'No border drawn — click to start';
    } else if (closed) {
      status.innerHTML = `<span style="color:#16a34a;font-weight:700;">✓ Border complete</span> — closed loop, ${runs[0].length - 1} corners`;
    } else {
      status.innerHTML = `<span style="color:#d97706;font-weight:700;">⚠ Border incomplete</span> — ${runs.length} segment${runs.length === 1 ? '' : 's'}, ${openEnds.size} open end${openEnds.size === 1 ? '' : 's'}. Click a loose end, then another, to join.`;
    }
  }

  if (!pts.length) return;

  // Draw each run. A single closed run renders as a filled, verified polygon;
  // everything else renders as open polylines so the gaps are actually visible.
  let idx = 0;
  runs.forEach(run => {
    if (run.length >= 2) {
      const pointStr = run.map(p => `${p.x},${p.y}`).join(' ');
      if (closed && runs.length === 1) {
        const fill = document.createElementNS(BOUNDARY_NS, 'polygon');
        fill.classList.add('boundary-fill', 'complete');
        fill.setAttribute('points', pointStr);
        boundaryGroup.appendChild(fill);
        const line = document.createElementNS(BOUNDARY_NS, 'polygon');
        line.classList.add('boundary-stroke', 'complete');
        line.setAttribute('points', pointStr);
        boundaryGroup.appendChild(line);
      } else {
        const line = document.createElementNS(BOUNDARY_NS, 'polyline');
        line.classList.add('boundary-stroke');
        line.setAttribute('points', pointStr);
        boundaryGroup.appendChild(line);
      }
    }
    idx += run.length;
  });

  // Editable points. Skip the duplicate closing point (coincides with point 0).
  pts.forEach((p, i) => {
    if (closed && i === pts.length - 1) return;
    const c = document.createElementNS(BOUNDARY_NS, 'circle');
    c.classList.add('boundary-point');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
    c.dataset.boundaryIdx = i;
    if (isDrawingBoundary && i === 0 && !closed && runs.length === 1 && pts.length >= 3) {
      c.classList.add('boundary-close-hint');
      c.setAttribute('r', 7 / state.zoom);
    } else {
      c.setAttribute('r', 4 / state.zoom);
      if (!closed && openEnds.has(i)) c.classList.add('boundary-open-end');
    }
    boundaryGroup.appendChild(c);
  });
}

function clearBoundary() {
  if (!state.boundary.length) return;
  if (!confirm('Remove the store border?')) return;
  saveState();
  state.boundary = [];
  renderAll();
}

// ═══════════════════════════════════════════════════════════
// DEPT ZOOM BOXES
// ═══════════════════════════════════════════════════════════

function renderZoomboxes() {
  zoomboxGroup.innerHTML = '';
  state.deptZoomBoxes.forEach(zb => {
    const dept = state.departments.find(d => d.id === zb.dept);
    const color = dept ? dept.color : '#888';
    const isSelected = state.selectedZoomboxId === zb.id;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('zoombox-group');
    if (isSelected) g.classList.add('selected');
    g.dataset.zoomboxId = zb.id;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('zoombox-rect');
    rect.setAttribute('x', zb.x); rect.setAttribute('y', zb.y);
    rect.setAttribute('width', zb.w); rect.setAttribute('height', zb.h);
    rect.setAttribute('fill', color); rect.setAttribute('stroke', color);
    g.appendChild(rect);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.classList.add('zoombox-label');
    const fontSize = Math.max(8, Math.min(14, zb.w * 0.08)) / state.zoom;
    label.setAttribute('font-size', fontSize < 6 ? 6 : fontSize);
    label.setAttribute('x', zb.x + 4 / state.zoom); label.setAttribute('y', zb.y + fontSize + 2 / state.zoom);
    label.setAttribute('fill', color);
    label.textContent = zb.label || (dept ? dept.name : 'Zoom Box');
    g.appendChild(label);

    // Resize handle (bottom-right corner) when selected
    if (isSelected) {
      const rh = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rh.classList.add('zoombox-resize');
      const hs = 8 / state.zoom;
      rh.setAttribute('x', zb.x + zb.w - hs); rh.setAttribute('y', zb.y + zb.h - hs);
      rh.setAttribute('width', hs); rh.setAttribute('height', hs);
      rh.setAttribute('stroke', color);
      rh.dataset.zoomboxResize = zb.id;
      g.appendChild(rh);
    }

    zoomboxGroup.appendChild(g);
  });
}

function updateZoomboxPanel() {
  const panel = document.getElementById('zoomboxPanel');
  if (!state.selectedZoomboxId) { panel.style.display = 'none'; return; }
  const zb = state.deptZoomBoxes.find(z => z.id === state.selectedZoomboxId);
  if (!zb) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const dept = state.departments.find(d => d.id === zb.dept);
  document.getElementById('zoomboxDeptSwatch').style.background = dept ? dept.color : 'transparent';
  document.getElementById('zoomboxDeptText').textContent = dept ? dept.name : 'Select dept...';
  document.getElementById('zoomboxLabel').value = zb.label || '';
  document.getElementById('zoomboxPropX').value = Math.round(zb.x);
  document.getElementById('zoomboxPropY').value = Math.round(zb.y);
  document.getElementById('zoomboxPropW').value = Math.round(zb.w);
  document.getElementById('zoomboxPropH').value = Math.round(zb.h);

  // Populate dept picker
  populateDeptDropdown('zoomboxDeptPicker-dropdown', (deptId) => {
    setZoomboxDept(deptId);
    closeDeptPickers();
  });
}

function updateZoomboxProp(prop, val) {
  const zb = state.deptZoomBoxes.find(z => z.id === state.selectedZoomboxId);
  if (!zb) return;
  zb[prop] = val;
  renderZoomboxes(); markDirty();
}

function setZoomboxDept(deptId) {
  const zb = state.deptZoomBoxes.find(z => z.id === state.selectedZoomboxId);
  if (!zb) return;
  saveState();
  zb.dept = deptId;
  // Auto-set label to dept name if empty
  if (!zb.label) {
    const dept = state.departments.find(d => d.id === deptId);
    if (dept) zb.label = dept.name;
  }
  renderAll();
}

function autoFitZoombox() {
  const zb = state.deptZoomBoxes.find(z => z.id === state.selectedZoomboxId);
  if (!zb || !zb.dept) return;
  saveState();
  // Find all shelves in this department (and its parent group)
  const dept = state.departments.find(d => d.id === zb.dept);
  const group = dept?.parent;
  const deptIds = group ? state.departments.filter(d => d.parent === group).map(d => d.id) : [zb.dept];
  const matching = state.shelves.filter(s => deptIds.includes(s.dept) && !s.inactive);
  if (!matching.length) { alert('No active shelves found for this department group.'); return; }

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  matching.forEach(s => {
    const b = getRotatedBounds(s);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  });
  const pad = 20;
  zb.x = x0 - pad; zb.y = y0 - pad;
  zb.w = (x1 - x0) + pad * 2; zb.h = (y1 - y0) + pad * 2;
  renderAll();
}

function deleteSelectedZoombox() {
  if (!state.selectedZoomboxId) return;
  saveState();
  state.deptZoomBoxes = state.deptZoomBoxes.filter(z => z.id !== state.selectedZoomboxId);
  state.selectedZoomboxId = null;
  renderAll();
}

// Zoom box drawing state
let isDrawingZoombox = false;
let zoomboxDrawStart = null;

// Zoom box dragging state
let isDraggingZoombox = false;
let isResizingZoombox = false;
let zoomboxDragStart = null;
let zoomboxDragOffset = null;

// ═══════════════════════════════════════════════════════════
// EMERGENCY MARKERS
// ═══════════════════════════════════════════════════════════

// EMERGENCY_TYPES — aligned with viewer's EQUIP_TYPE_INFO (app.js v0.149+).
// Uses Tabler icon classes via foreignObject so the editor render matches the viewer exactly.
// Stored type values stay snake_case for backward compatibility with existing maps; the
// viewer's loader normalizes them to its hyphenated form on load.
// Note: emergency_exit and first_aid colours were swapped in older editor versions —
// they're now corrected to match the viewer (and standard signage conventions).
const EMERGENCY_TYPES = {
  // v0.323: colours follow WA fire floor-plan conventions — signal red for fire
  // equipment, safety green for exits/assembly. Sign pictograms are drawn by
  // emergSignInner (shared spec with js/map-json-loader.js — keep in sync).
  fire_extinguisher: { iconClass: 'ti-fire-extinguisher',  label: 'Fire Extinguisher', color: '#e4002b', bg: '#450a0a', abbr: 'FE'   },
  extinguisher_set:  { iconClass: 'ti-fire-extinguisher',  label: 'Extinguisher Set',  color: '#e4002b', bg: '#450a0a', abbr: 'ES'   },
  first_aid:         { iconClass: 'ti-first-aid-kit',      label: 'First Aid Kit',     color: '#3b82f6', bg: '#172554', abbr: 'FA'   },
  aed:               { iconClass: 'ti-heart-rate-monitor', label: 'AED / Defib',       color: '#eab308', bg: '#422006', abbr: 'AED'  },
  emergency_exit:    { iconClass: 'ti-door-exit',          label: 'Emergency Exit',    color: '#009639', bg: '#052e16', abbr: 'EXIT' },
  spill_kit:         { iconClass: 'ti-bucket',             label: 'Spill Kit',         color: '#a855f7', bg: '#1e1528', abbr: 'SK'   },
  assembly_point:    { iconClass: 'ti-alert-triangle',     label: 'Assembly Point',    color: '#009639', bg: '#052e16', abbr: 'AP'   },
  hose_reel:         { iconClass: 'ti-route',              label: 'Hose Reel',         color: '#e4002b', bg: '#450a0a', abbr: 'HR'   },
  hydrant:           { iconClass: 'ti-flame',            label: 'Fire Hydrant',      color: '#e4002b', bg: '#450a0a', abbr: 'H', custom: 'hydrant' },
  call_point:        { iconClass: 'ti-alert-triangle',    label: 'Emergency Call Point', color: '#e4002b', bg: '#450a0a', abbr: 'ECP' },
  emergency_phone:   { iconClass: 'ti-alert-triangle',    label: 'Emergency Phone',   color: '#e4002b', bg: '#450a0a', abbr: 'EP'   },
};

// Editor keys → shared sign keys (loader-normalized)
const EM_SIGN_KEY = {
  fire_extinguisher: 'fire-ext', extinguisher_set: 'ext-set', emergency_exit: 'exit',
  assembly_point: 'assembly', hose_reel: 'hose', hydrant: 'hydrant',
  call_point: 'call-point', emergency_phone: 'emergency-phone',
};

// v0.323: WA fire floor-plan sign pictograms — identical spec to
// MapJSONLoader.emergSignInner in js/map-json-loader.js. Keep in sync.
function emergSignInner(type, extClass) {
  var RED = '#e4002b', GREEN = '#009639';
  function base(bg) { return '<rect class="em-icon-bg" x="-13" y="-13" width="26" height="26" rx="3" fill="' + bg + '" stroke="#ffffff" stroke-width="2"/>'; }
  var BANDS = { foam: '#0057b8', powder: '#ffffff', co2: '#111111', wet_chem: '#e8b98a', liquid: '#ffd500' };
  switch (type) {
    case 'hydrant':
      return base(RED) + '<circle cx="0" cy="0" r="8.5" fill="#ffffff"/>'
        + '<text x="0" y="4.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13" fill="' + RED + '" pointer-events="none">H</text>';
    case 'fire-ext': {
        // v0.325: matches the AS extinguisher chart — red body with white
        // outline, agent-colour band on the UPPER body. Water = plain red
        // (no band), per the reference.
        var band = BANDS[extClass];
        var s = base(RED)
            + '<rect x="-3.2" y="-5" width="6.4" height="11.5" rx="2" fill="' + RED + '" stroke="#ffffff" stroke-width="1.2"/>'
            + '<path d="M -1.2 -5 V -6.8 H 1.2 V -5" fill="none" stroke="#ffffff" stroke-width="1.2"/>'
            + '<path d="M -1.2 -6.8 L -5.2 -8" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
            + '<path d="M 1.2 -6.8 L 4 -8" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
            + '<path d="M 3.2 -3 q 4 0.5 4 4.5" stroke="#ffffff" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
        if (band) s += '<rect x="-3.2" y="-3.4" width="6.4" height="2.8" fill="' + band + '" stroke="#ffffff" stroke-width="0.6"/>';
        return s;
    }
    case 'ext-set':
        return base(RED)
            + '<rect x="-7.8" y="-4" width="5.2" height="10" rx="1.6" fill="' + RED + '" stroke="#ffffff" stroke-width="1.1"/>'
            + '<rect x="2.6" y="-4" width="5.2" height="10" rx="1.6" fill="' + RED + '" stroke="#ffffff" stroke-width="1.1"/>'
            + '<path d="M -5.2 -4 V -5.8 M -6.6 -5.8 H -3.8" stroke="#ffffff" stroke-width="1.1" fill="none" stroke-linecap="round"/>'
            + '<path d="M 5.2 -4 V -5.8 M 3.8 -5.8 H 6.6" stroke="#ffffff" stroke-width="1.1" fill="none" stroke-linecap="round"/>';
    case 'exit': case 'fire-exit':
      return base(GREEN)
        + '<rect x="5" y="-7.5" width="5.5" height="15" fill="none" stroke="#ffffff" stroke-width="1.6"/>'
        + '<circle cx="-6" cy="-6" r="2" fill="#ffffff"/>'
        + '<path d="M -6.5 -3.5 L -3.5 0.5 L -6.5 5.5 M -3.5 0.5 L -1 5 M -9.5 -0.5 L -3.8 -2" stroke="#ffffff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M -0.5 0.5 H 3.5 M 1.8 -1.2 L 3.5 0.5 L 1.8 2.2" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'assembly':
      return base(GREEN)
        + '<circle cx="0" cy="0" r="1.9" fill="#ffffff"/>'
        + '<path d="M -9.5 -9.5 L -4.6 -4.6 M -8.8 -4.6 H -4.6 V -8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M 9.5 -9.5 L 4.6 -4.6 M 8.8 -4.6 H 4.6 V -8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M -9.5 9.5 L -4.6 4.6 M -8.8 4.6 H -4.6 V 8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M 9.5 9.5 L 4.6 4.6 M 8.8 4.6 H 4.6 V 8.8" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'hose':
        // v0.325: drawn from the AU "Fire Hose Reel" sign — side-on coiled
        // reel, feed pipe to a crossed valve wheel at right, hose dropping
        // from the left to a flared nozzle.
        return base(RED)
            + '<rect x="-9" y="-9.5" width="12" height="12.5" rx="6" fill="none" stroke="#ffffff" stroke-width="1.6"/>'
            + '<path d="M -6.2 -9 V 2.6 M -3.6 -9.4 V 2.9 M -1 -9.4 V 2.9 M 1.6 -9 V 2.5" stroke="#ffffff" stroke-width="1.2" fill="none"/>'
            + '<path d="M 3 -3.5 H 6.6" stroke="#ffffff" stroke-width="1.4" fill="none"/>'
            + '<circle cx="8.6" cy="-3.5" r="2.3" fill="none" stroke="#ffffff" stroke-width="1.2"/>'
            + '<path d="M 7 -5.1 L 10.2 -1.9 M 10.2 -5.1 L 7 -1.9" stroke="#ffffff" stroke-width="1" fill="none"/>'
            + '<path d="M -6.2 3 V 6.2" stroke="#ffffff" stroke-width="1.4" fill="none"/>'
            + '<path d="M -7.4 6.2 h 2.4 l 0.8 3.4 h -4 z" fill="#ffffff"/>';
    case 'call-point':
      return base(RED)
        + '<circle cx="0" cy="0" r="6.2" fill="#ffffff"/>'
        + '<rect x="-2.6" y="-2.6" width="5.2" height="5.2" fill="' + RED + '"/>';
    case 'emergency-phone':
      return base(RED)
        + '<path d="M -8 -1.5 C -9 -6.5 9 -6.5 8 -1.5 L 5.5 0.5 C 5 -2.8 -5 -2.8 -5.5 0.5 Z" fill="#ffffff"/>'
        + '<rect x="-4.5" y="1" width="9" height="5.5" rx="1.2" fill="#ffffff"/>';
  }
  return null;
}

let selectedEmergencyType = 'fire_extinguisher';
let isDraggingEmergency = false;
let emergencyDragOffset = null;

function renderEmergency() {
  emergencyGroup.innerHTML = '';
  state.emergencyMarkers.forEach(em => {
    const info = EMERGENCY_TYPES[em.type] || EMERGENCY_TYPES.fire_extinguisher;
    const isSelected = state.selectedEmergencyId === em.id;
    // Match viewer's marker geometry: r=14 background circle, 20px icon area
    const sz = 28 / state.zoom;
    const iconBoxSz = 20 / state.zoom;
    const iconFontSize = 14 / state.zoom;
    const fontSize = Math.max(6, 7 / state.zoom);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('emergency-group');
    if (isSelected) g.classList.add('selected');
    g.dataset.emergencyId = em.id;

    const signKey = EM_SIGN_KEY[em.type];
    const signInner = signKey ? emergSignInner(signKey, em.extClass) : null;
    if (signInner) {
      // v0.323: WA fire floor-plan signage — shared pictogram spec, drawn into a
      // scaled sub-group so the 26-unit sign box fits the marker size exactly.
      const sg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      sg.setAttribute('transform', `translate(${em.x},${em.y}) scale(${sz / 26})`);
      sg.innerHTML = signInner;
      const baseRect = sg.querySelector('rect.em-icon-bg');
      if (baseRect) {
        baseRect.classList.add('emergency-bg');
        if (isSelected) { baseRect.setAttribute('stroke', '#4a9eff'); baseRect.setAttribute('stroke-width', 3); }
      }
      g.appendChild(sg);
    } else {
    // Background circle — solid bg with coloured stroke (matches viewer style)
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.classList.add('emergency-bg');
    bg.setAttribute('cx', em.x); bg.setAttribute('cy', em.y);
    bg.setAttribute('r', sz / 2);
    bg.setAttribute('fill', info.bg);
    bg.setAttribute('stroke', isSelected ? '#fff' : info.color);
    bg.setAttribute('stroke-width', (isSelected ? 3 : 2.5) / state.zoom);
    g.appendChild(bg);

    // Tabler icon via foreignObject (same approach as viewer's generateEmergencyMarkers)
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', em.x - iconBoxSz / 2);
    fo.setAttribute('y', em.y - iconBoxSz / 2);
    fo.setAttribute('width', iconBoxSz);
    fo.setAttribute('height', iconBoxSz);
    fo.setAttribute('pointer-events', 'none');
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
    const icon = document.createElementNS('http://www.w3.org/1999/xhtml', 'i');
    icon.setAttribute('class', 'ti ' + info.iconClass);
    icon.style.cssText = 'font-size:' + iconFontSize + 'px;color:' + info.color + ';line-height:1;';
    div.appendChild(icon);
    fo.appendChild(div);
    g.appendChild(fo);
    }

    // Label below
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.classList.add('emergency-label');
    label.setAttribute('x', em.x); label.setAttribute('y', em.y + sz / 2 + fontSize + 2 / state.zoom);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', fontSize);
    label.setAttribute('fill', info.color);
    label.textContent = em.label || info.abbr;
    g.appendChild(label);

    emergencyGroup.appendChild(g);
  });
  // v0.150: keep the inventory panel in sync with edits
  if (typeof emergencyInventoryOpen !== 'undefined' && emergencyInventoryOpen) {
    emergencyInventoryRefresh();
  }
}

// ─────────────────────────────────────────────────────────────
// v0.150: Emergency Inventory panel — diagnostics & navigation
// ─────────────────────────────────────────────────────────────
let emergencyInventoryOpen = false;

function toggleEmergencyInventory() {
  emergencyInventoryOpen = !emergencyInventoryOpen;
  const panel = document.getElementById('emergencyInventory');
  if (!panel) return;
  panel.style.display = emergencyInventoryOpen ? 'flex' : 'none';
  if (emergencyInventoryOpen) emergencyInventoryRefresh();
}

// Build a flat list of every emergency marker across every floor in the project,
// regardless of which floor is currently active. Items from non-current floors get
// flagged so the user can navigate to them. Also detects duplicates (same x/y/type
// or same x/y any type) and out-of-bounds markers.
function emergencyInventoryGather() {
  // First sync the current floor's in-memory state back into its data slot so it's included
  if (typeof syncCurrentFloor === 'function') syncCurrentFloor();
  
  const items = [];
  const floors = state.floors || [];
  floors.forEach(floor => {
    const fd = floor.data || {};
    const ems = fd.emergencyMarkers || [];
    ems.forEach((em, idx) => {
      items.push({
        ref: em,                      // live reference into the floor's data array
        floorId: floor.id,
        floorName: floor.name,
        floorType: floor.type || 'foh',
        isCurrentFloor: floor.id === state.currentFloorId,
        idx: idx,
        id: em.id || '(no id)',
        type: em.type || 'unknown',
        x: em.x,
        y: em.y,
        label: em.label || '',
        detail: em.detail || ''
      });
    });
  });
  
  // Detect coordinate-collision duplicates
  const posMap = {};
  items.forEach(it => {
    const key = Math.round(it.x) + ',' + Math.round(it.y);
    if (!posMap[key]) posMap[key] = [];
    posMap[key].push(it);
  });
  items.forEach(it => {
    const key = Math.round(it.x) + ',' + Math.round(it.y);
    const stack = posMap[key];
    if (stack.length > 1) {
      it.duplicateOf = stack.filter(s => s !== it).map(s => s.id || ('#' + s.idx));
      it.duplicateSameType = stack.some(s => s !== it && s.type === it.type);
    }
  });
  
  // Detect markers that fall outside the union of shelf+landmark bounds (likely orphaned)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  let haveBounds = false;
  floors.forEach(floor => {
    const fd = floor.data || {};
    (fd.shelves || []).forEach(s => {
      bx0 = Math.min(bx0, s.x - 100); by0 = Math.min(by0, s.y - 100);
      bx1 = Math.max(bx1, s.x + 100); by1 = Math.max(by1, s.y + 100);
      haveBounds = true;
    });
    (fd.landmarks || []).forEach(z => {
      bx0 = Math.min(bx0, z.x); by0 = Math.min(by0, z.y);
      bx1 = Math.max(bx1, z.x + (z.w || 0)); by1 = Math.max(by1, z.y + (z.h || 0));
      haveBounds = true;
    });
  });
  if (haveBounds) {
    items.forEach(it => {
      if (it.x < bx0 || it.x > bx1 || it.y < by0 || it.y > by1) {
        it.outOfBounds = true;
      }
    });
  }
  
  return items;
}

function emergencyInventoryRefresh() {
  const items = emergencyInventoryGather();
  const list = document.getElementById('eiList');
  const count = document.getElementById('eiCount');
  const summary = document.getElementById('eiSummary');
  if (!list) return;
  
  count.textContent = items.length;
  
  // Build summary breakdown by type
  const byType = {};
  items.forEach(it => { byType[it.type] = (byType[it.type] || 0) + 1; });
  summary.innerHTML = '';
  if (items.length === 0) {
    summary.innerHTML = '<span style="color:var(--text-dim);font-style:italic;">no markers in any floor</span>';
  } else {
    Object.keys(byType).sort().forEach(type => {
      const info = EMERGENCY_TYPES[type] || { color: '#888', label: type };
      const span = document.createElement('span');
      span.className = 'ei-summary-item';
      span.innerHTML = '<span class="ei-summary-dot" style="background:' + info.color + ';"></span>' +
                       '<span>' + info.label + ': <strong>' + byType[type] + '</strong></span>';
      summary.appendChild(span);
    });
  }
  
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ei-empty';
    empty.textContent = 'No emergency markers in any floor of this map.';
    list.appendChild(empty);
    return;
  }
  
  items.forEach((it, listIdx) => {
    const info = EMERGENCY_TYPES[it.type] || EMERGENCY_TYPES.fire_extinguisher;
    const item = document.createElement('div');
    item.className = 'ei-item';
    if (it.id === state.selectedEmergencyId) item.classList.add('selected');
    if (it.duplicateOf) item.classList.add('duplicate');
    if (it.outOfBounds) item.classList.add('offscreen');
    
    // Icon circle
    const ic = document.createElement('div');
    ic.className = 'ei-icon-circle';
    ic.style.background = info.bg || '#1a1a1a';
    ic.style.borderColor = info.color || '#888';
    ic.innerHTML = '<i class="ti ' + (info.iconClass || 'ti-alert-triangle') + '" style="color:' + info.color + ';"></i>';
    item.appendChild(ic);
    
    // Info block
    const info2 = document.createElement('div');
    info2.className = 'ei-info';
    const name = document.createElement('div');
    name.className = 'ei-name';
    name.textContent = it.label ? it.label : info.label;
    info2.appendChild(name);
    const meta = document.createElement('div');
    meta.className = 'ei-meta';
    meta.innerHTML =
      '<span>' + it.id + '</span>' +
      '<span>(' + Math.round(it.x) + ', ' + Math.round(it.y) + ')</span>' +
      '<span>' + (it.floorName || 'floor') + (it.isCurrentFloor ? '' : ' ⤴') + '</span>';
    info2.appendChild(meta);
    if (it.duplicateOf) {
      const w = document.createElement('div');
      w.className = it.duplicateSameType ? 'ei-meta-danger' : 'ei-meta-warn';
      w.textContent = it.duplicateSameType ? '⚠ duplicate (same type)' : '⚠ same position as ' + it.duplicateOf.join(', ');
      info2.appendChild(w);
    }
    if (it.outOfBounds) {
      const w = document.createElement('div');
      w.className = 'ei-meta-danger';
      w.textContent = '⚠ outside map bounds';
      info2.appendChild(w);
    }
    item.appendChild(info2);
    
    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'ei-actions';
    const goBtn = document.createElement('button');
    goBtn.className = 'ei-btn';
    goBtn.title = 'Center & highlight this marker';
    goBtn.innerHTML = '◎';
    goBtn.onclick = function(e) { e.stopPropagation(); emergencyInventoryGoTo(it); };
    actions.appendChild(goBtn);
    const delBtn = document.createElement('button');
    delBtn.className = 'ei-btn danger';
    delBtn.title = 'Delete this marker';
    delBtn.innerHTML = '×';
    delBtn.onclick = function(e) { e.stopPropagation(); emergencyInventoryDelete(it); };
    actions.appendChild(delBtn);
    item.appendChild(actions);
    
    // Click row to also go-to
    item.onclick = function() { emergencyInventoryGoTo(it); };
    
    list.appendChild(item);
  });
}

function emergencyInventoryGoTo(it) {
  // Switch floors if necessary
  if (!it.isCurrentFloor && typeof switchFloor === 'function') {
    switchFloor(it.floorId);
    // Wait for floor swap animation, then center
    setTimeout(() => emergencyInventoryCenterOn(it), 80);
  } else {
    emergencyInventoryCenterOn(it);
  }
}

function emergencyInventoryCenterOn(it) {
  // Find the live marker reference (after potential floor switch, the array is reloaded)
  const m = state.emergencyMarkers.find(em => em.id === it.id);
  if (m) {
    state.selectedEmergencyId = m.id;
    state.selectedIds = [];
    state.selectedLandmarkId = null;
    state.selectedWallId = null;
    state.selectedToryLineId = null;
    state.selectedZoomboxId = null;
    state.selectedPriceCheckId = null;
  }
  // Center the canvas on the marker's coordinates. Bump zoom if currently zoomed out
  // so the marker is actually visible at a useful size.
  const c = canvasContainer.getBoundingClientRect();
  const targetZoom = Math.max(state.zoom, 1.5);
  state.zoom = targetZoom;
  state.panX = c.width / 2 - it.x * state.zoom;
  state.panY = c.height / 2 - it.y * state.zoom;
  if (typeof updateTransform === 'function') updateTransform();
  renderAll();
  // Flash the marker so the user can spot it instantly
  setTimeout(() => {
    const el = document.querySelector('.emergency-group[data-emergency-id="' + it.id + '"]');
    if (el) {
      el.classList.remove('ei-flash');
      // Force reflow so the animation can restart if pressed twice
      void el.getBoundingClientRect();
      el.classList.add('ei-flash');
      setTimeout(() => el.classList.remove('ei-flash'), 1800);
    }
    emergencyInventoryRefresh();
  }, 30);
}

function emergencyInventoryDelete(it) {
  if (!confirm('Delete this ' + (EMERGENCY_TYPES[it.type] ? EMERGENCY_TYPES[it.type].label : it.type) +
               ' marker at (' + Math.round(it.x) + ', ' + Math.round(it.y) + ')?')) return;
  saveState();
  // Find and remove from the correct floor's data
  const floor = state.floors.find(f => f.id === it.floorId);
  if (!floor) return;
  // If it's the current floor, the live array is state.emergencyMarkers
  if (floor.id === state.currentFloorId) {
    state.emergencyMarkers = state.emergencyMarkers.filter(em => em.id !== it.id);
  } else {
    // Modify the floor's stored data array directly
    if (floor.data && floor.data.emergencyMarkers) {
      floor.data.emergencyMarkers = floor.data.emergencyMarkers.filter(em => em.id !== it.id);
    }
  }
  if (state.selectedEmergencyId === it.id) state.selectedEmergencyId = null;
  renderAll();
  emergencyInventoryRefresh();
}

function emergencyInventoryExport() {
  const items = emergencyInventoryGather();
  const lines = [
    'Emergency Marker Inventory',
    '==========================',
    'Total: ' + items.length,
    ''
  ];
  items.forEach(it => {
    const flags = [];
    if (it.duplicateOf) flags.push(it.duplicateSameType ? 'DUPLICATE' : 'co-located');
    if (it.outOfBounds) flags.push('out-of-bounds');
    lines.push(
      '#' + it.id + '  ' + it.type + '  (' + Math.round(it.x) + ', ' + Math.round(it.y) + ')' +
      '  floor=' + (it.floorName || it.floorId) +
      (it.label ? '  label="' + it.label + '"' : '') +
      (flags.length ? '  [' + flags.join(', ') + ']' : '')
    );
  });
  const text = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => alert('Inventory copied to clipboard (' + items.length + ' markers).'),
      () => prompt('Copy this inventory:', text)
    );
  } else {
    prompt('Copy this inventory:', text);
  }
}

function updateEmergencyPanel() {
  const panel = document.getElementById('emergencyPanel');
  if (!state.selectedEmergencyId) { panel.style.display = 'none'; return; }
  const em = state.emergencyMarkers.find(m => m.id === state.selectedEmergencyId);
  if (!em) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  document.getElementById('emergencyType').value = em.type;
  document.getElementById('emergencyLabel').value = em.label || '';
  document.getElementById('emergencyDetail').value = em.detail || '';
  document.getElementById('emergencyLocation').value = em.location || '';
  document.getElementById('emergencyPropX').value = Math.round(em.x);
  document.getElementById('emergencyPropY').value = Math.round(em.y);
  // v0.159: New fields — fire extinguisher class, structured method/operation
  document.getElementById('emergencyMethod').value = em.method || '';
  document.getElementById('emergencyOperation').value = em.operation || '';
  document.getElementById('emergencyExtClass').value = em.extClass || '';
  // Show the extinguisher class dropdown only when the marker type is fire_extinguisher
  document.getElementById('emergencyExtClassRow').style.display =
    em.type === 'fire_extinguisher' ? '' : 'none';
  refreshMarkerLocationDatalist();
}

function updateEmergencyProp(prop, val) {
  const em = state.emergencyMarkers.find(m => m.id === state.selectedEmergencyId);
  if (!em) return;
  if (prop === 'type') { saveState(); selectedEmergencyType = val; }
  em[prop] = val;
  renderEmergency(); updateEmergencyPanel(); markDirty();
}

function deleteSelectedEmergency() {
  if (!state.selectedEmergencyId) return;
  saveState();
  state.emergencyMarkers = state.emergencyMarkers.filter(m => m.id !== state.selectedEmergencyId);
  state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
  renderAll();
}

function duplicateEmergency() {
  const em = state.emergencyMarkers.find(m => m.id === state.selectedEmergencyId);
  if (!em) return;
  saveState();
  const offset = state.gridSize * 2;
  // v0.159: Also copy method, operation, and extClass when duplicating.
  const dup = { id: 'em_' + state.nextId++, type: em.type, x: em.x + offset, y: em.y + offset,
    label: em.label, detail: em.detail || '', location: em.location || '',
    method: em.method || '', operation: em.operation || '', extClass: em.extClass || '' };
  state.emergencyMarkers.push(dup);
  state.selectedEmergencyId = dup.id;
  state.selectedIds = []; state.selectedLandmarkId = null; state.selectedZoomboxId = null;
  renderAll();
}

// v0.151: Populate the shared datalist with shelf names from the current floor.
// Used by both emergency and price check Location inputs for type-ahead suggestions.
// Suggestions include the bare shelf name (e.g. "B21") plus any subname variants (e.g. "B21S1").
function refreshMarkerLocationDatalist() {
  const dl = document.getElementById('markerLocationList');
  if (!dl) return;
  const names = new Set();
  (state.shelves || []).forEach(s => {
    if (!s.name) return;
    names.add(s.name);
    if (s.subname) names.add(s.name + s.subname);
  });
  // Sort naturally so B2 comes before B10
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  dl.innerHTML = sorted.map(n => '<option value="' + n.replace(/"/g, '&quot;') + '"></option>').join('');
}

// ════════════════════════════════════════════════════════
// v0.136: Price Check markers
// ════════════════════════════════════════════════════════
const priceCheckGroup = document.getElementById('priceCheckGroup');
const toryDocksGroup = document.getElementById('toryDocksGroup');
let isDraggingPriceCheck = false;
let priceCheckDragOffset = null;
let isDraggingToryDock = false;
let toryDockDragOffset = null;

function renderPriceChecks() {
  if (!priceCheckGroup) return;
  priceCheckGroup.innerHTML = '';
  (state.priceChecks || []).forEach(pc => {
    const isSelected = state.selectedPriceCheckId === pc.id;
    const sz = 26 / state.zoom;
    const iconSz = 13 / state.zoom;
    const fontSize = Math.max(6, 8 / state.zoom);
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('pricecheck-group');
    if (isSelected) g.classList.add('selected');
    g.dataset.priceCheckId = pc.id;
    
    // Background circle (teal)
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.classList.add('pricecheck-bg');
    bg.setAttribute('cx', pc.x); bg.setAttribute('cy', pc.y);
    bg.setAttribute('r', sz / 2);
    bg.setAttribute('fill', '#042f2e');
    bg.setAttribute('stroke', isSelected ? '#fff' : '#14b8a6');
    bg.setAttribute('stroke-width', isSelected ? 3 / state.zoom : 2.2 / state.zoom);
    g.appendChild(bg);
    
    // Scan icon — drawn as paths since we can't use Tabler font in editor SVG
    // v0.318: 'order' variant (Bulk Order Screen) draws a monitor-with-stand
    // instead of the scan brackets — same teal circle, its own glyph.
    const iconG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconG.setAttribute('stroke', '#14b8a6');
    iconG.setAttribute('stroke-width', 1.6 / state.zoom);
    iconG.setAttribute('stroke-linecap', 'round');
    iconG.setAttribute('stroke-linejoin', 'round');
    iconG.setAttribute('fill', 'none');
    const r = iconSz / 2;
    const cx = pc.x, cy = pc.y;
    if (pc.variant === 'order') {
      // Screen
      const scr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      scr.setAttribute('x', cx - r); scr.setAttribute('y', cy - r);
      scr.setAttribute('width', r * 2); scr.setAttribute('height', r * 1.3);
      scr.setAttribute('rx', 0.15 * r);
      iconG.appendChild(scr);
      // Stand + base
      const stand = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      stand.setAttribute('x1', cx); stand.setAttribute('y1', cy + r * 0.3);
      stand.setAttribute('x2', cx); stand.setAttribute('y2', cy + r * 0.75);
      iconG.appendChild(stand);
      const base = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      base.setAttribute('x1', cx - r * 0.55); base.setAttribute('y1', cy + r * 0.85);
      base.setAttribute('x2', cx + r * 0.55); base.setAttribute('y2', cy + r * 0.85);
      iconG.appendChild(base);
      // Bag on the screen
      const bag = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      bag.setAttribute('d', `M ${cx - r*0.32} ${cy - r*0.5} h ${r*0.64} l ${r*0.1} ${r*0.62} h ${-r*0.84} z`);
      iconG.appendChild(bag);
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      handle.setAttribute('d', `M ${cx - r*0.16} ${cy - r*0.5} q ${r*0.16} ${-r*0.3} ${r*0.32} 0`);
      iconG.appendChild(handle);
      g.appendChild(iconG);
    } else {
    // Approximation of ti-scan: corner brackets
    // Top-left bracket
    const tl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tl.setAttribute('d', `M ${cx - r} ${cy - r*0.4} L ${cx - r} ${cy - r} L ${cx - r*0.4} ${cy - r}`);
    iconG.appendChild(tl);
    // Top-right bracket
    const tr = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tr.setAttribute('d', `M ${cx + r*0.4} ${cy - r} L ${cx + r} ${cy - r} L ${cx + r} ${cy - r*0.4}`);
    iconG.appendChild(tr);
    // Bottom-left bracket
    const bl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bl.setAttribute('d', `M ${cx - r} ${cy + r*0.4} L ${cx - r} ${cy + r} L ${cx - r*0.4} ${cy + r}`);
    iconG.appendChild(bl);
    // Bottom-right bracket
    const br = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    br.setAttribute('d', `M ${cx + r*0.4} ${cy + r} L ${cx + r} ${cy + r} L ${cx + r} ${cy + r*0.4}`);
    iconG.appendChild(br);
    // Centre horizontal scan line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', cx - r * 0.7); line.setAttribute('y1', cy);
    line.setAttribute('x2', cx + r * 0.7); line.setAttribute('y2', cy);
    line.setAttribute('stroke', '#14b8a6');
    line.setAttribute('stroke-width', 1.6 / state.zoom);
    line.setAttribute('stroke-linecap', 'round');
    iconG.appendChild(line);
    g.appendChild(iconG);
    }
    
    // Label below
    if (pc.label) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.classList.add('pricecheck-label');
      label.setAttribute('x', pc.x);
      label.setAttribute('y', pc.y + sz / 2 + fontSize + 2 / state.zoom);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', fontSize);
      label.setAttribute('fill', '#14b8a6');
      label.setAttribute('font-weight', '700');
      label.setAttribute('font-family', 'monospace');
      label.textContent = pc.label;
      g.appendChild(label);
    }
    
    priceCheckGroup.appendChild(g);
  });
}

function updatePriceCheckPanel() {
  const panel = document.getElementById('priceCheckPanel');
  if (!panel) return;
  if (!state.selectedPriceCheckId) { panel.style.display = 'none'; return; }
  const pc = (state.priceChecks || []).find(m => m.id === state.selectedPriceCheckId);
  if (!pc) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  document.getElementById('priceCheckLabel').value = pc.label || '';
  const pcVarSel = document.getElementById('priceCheckVariant');
  if (pcVarSel) pcVarSel.value = pc.variant === 'order' ? 'order' : 'pc';
  document.getElementById('priceCheckLocation').value = pc.location || '';
  document.getElementById('priceCheckDetail').value = pc.detail || '';
  document.getElementById('priceCheckPropX').value = Math.round(pc.x);
  document.getElementById('priceCheckPropY').value = Math.round(pc.y);
  refreshMarkerLocationDatalist();
}

function updatePriceCheckProp(prop, val) {
  const pc = (state.priceChecks || []).find(m => m.id === state.selectedPriceCheckId);
  if (!pc) return;
  pc[prop] = val;
  renderPriceChecks(); updatePriceCheckPanel(); markDirty();
}

function deleteSelectedPriceCheck() {
  if (!state.selectedPriceCheckId) return;
  saveState();
  state.priceChecks = (state.priceChecks || []).filter(m => m.id !== state.selectedPriceCheckId);
  state.selectedPriceCheckId = null;
  renderAll();
}

function duplicatePriceCheck() {
  const pc = (state.priceChecks || []).find(m => m.id === state.selectedPriceCheckId);
  if (!pc) return;
  saveState();
  const offset = state.gridSize * 2;
  const dup = { id: 'pc_' + state.nextId++, x: pc.x + offset, y: pc.y + offset, label: pc.label || '', location: pc.location || '', detail: pc.detail || '', ...(pc.variant === 'order' ? { variant: 'order' } : {}) };   // an order screen stays one
  state.priceChecks = state.priceChecks || [];
  state.priceChecks.push(dup);
  // v0.151: don't clear selectedPriceCheckId — that was a long-standing bug where
  // duplicating a price check would deselect the new copy instead of selecting it.
  state.selectedPriceCheckId = dup.id;
  state.selectedIds = []; state.selectedLandmarkId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null;
  renderAll();
}

function renderAll() { renderPaths(); updatePathPanel(); renderGhostPreview(); renderBoundary(); renderZoomboxes(); renderEmergency(); renderPriceChecks(); renderToryDocks(); renderLandmarks(); renderWalls(); renderToryLines(); renderShelves(); renderLandmarkOverlays(); renderWallOverlays(); renderToryLineOverlays(); renderShelfList(); renderDeptList(); updateSelectionPanel(); updateLandmarkPanel(); updateWallPanel(); updateToryLinePanel(); updateZoomboxPanel(); updateEmergencyPanel(); updatePriceCheckPanel(); renderDupeBanner(); applyLayerVisibility(); }

function renderDupeBanner() {
  const dupeNames = getDuplicateNames();
  const section = document.getElementById('dupeBannerSection');
  const statusEl = document.getElementById('statusDupes');

  if (dupeNames.length === 0) {
    section.style.display = 'none';
    statusEl.style.display = 'none';
    return;
  }

  section.style.display = '';
  statusEl.style.display = '';
  statusEl.textContent = `⚠ ${dupeNames.length} duplicate${dupeNames.length > 1 ? 's' : ''}`;

  const list = document.getElementById('dupeList');
  list.innerHTML = '';
  dupeNames.sort().forEach(fn => {
    const item = document.createElement('span');
    item.className = 'dupe-banner-item';
    item.textContent = fn;
    item.onclick = () => {
      // Select all shelves with this full name and highlight
      const matching = state.shelves.filter(s => fullName(s) === fn);
      state.selectedIds = matching.length ? [matching[0].id] : [];
      state.highlightedName = null;
      // Flash them by highlighting the base name
      const baseName = matching.length ? matching[0].name : '';
      if (baseName) state.highlightedName = baseName;
      renderAll();
    };
    list.appendChild(item);
  });
}

function renderShelves() {
  shelvesGroup.innerHTML = '';
  overlayGroup.innerHTML = '';
  const dupes = getDuplicates();

  state.shelves.forEach(shelf => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('shelf-group');
    g.dataset.id = shelf.id;
    if (state.selectedIds.includes(shelf.id)) g.classList.add('selected');
    if (state.highlightedName && shelf.name && shelf.name === state.highlightedName) g.classList.add('highlighted');
    if (dupes[shelf.id]) g.classList.add('duplicate');
    if (shelf.inactive) g.classList.add('inactive');
    if (shelf.locked) g.classList.add('locked');
    if (!shelf.name) g.classList.add('unnamed');
    if (state.boundary.length >= 3 && !isShelfInsideBoundary(shelf)) g.classList.add('outside-boundary');

    const color = getColor(shelf);
    const dim = getDims(shelf);
    const angle = getAngle(shelf);
    const isV = shelf.orientation === 'V';

    // ── SIXWAY DISPLAY ──
    if (shelf.type === 'sixway') {
      const r = shelf.radius || 20;
      const cx = shelf.x, cy = shelf.y; // center point

      // Outer circle
      const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circ.classList.add('shelf-rect');
      circ.setAttribute('cx', cx); circ.setAttribute('cy', cy);
      circ.setAttribute('r', r);
      circ.setAttribute('fill', color); circ.setAttribute('fill-opacity', '0.55');
      circ.setAttribute('stroke', state.selectedIds.includes(shelf.id) ? '#4a9eff' : color);
      circ.setAttribute('stroke-width', state.selectedIds.includes(shelf.id) ? 3 : 1.5);
      g.appendChild(circ);

      // Center hub
      const hub = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hub.setAttribute('cx', cx); hub.setAttribute('cy', cy);
      hub.setAttribute('r', Math.max(3, r * 0.18));
      hub.setAttribute('fill', color); hub.setAttribute('fill-opacity', '0.9');
      hub.setAttribute('stroke', 'rgba(255,255,255,0.5)'); hub.setAttribute('stroke-width', '1');
      hub.style.pointerEvents = 'none';
      g.appendChild(hub);

      // 6 spokes
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 - 90) * Math.PI / 180;
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', cx + Math.cos(a) * r * 0.22);
        l.setAttribute('y1', cy + Math.sin(a) * r * 0.22);
        l.setAttribute('x2', cx + Math.cos(a) * r * 0.88);
        l.setAttribute('y2', cy + Math.sin(a) * r * 0.88);
        l.setAttribute('stroke', 'rgba(255,255,255,0.6)'); l.setAttribute('stroke-width', '1.5');
        l.setAttribute('stroke-linecap', 'round');
        l.style.pointerEvents = 'none';
        g.appendChild(l);
        // Arm end dots
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', cx + Math.cos(a) * r * 0.88);
        dot.setAttribute('cy', cy + Math.sin(a) * r * 0.88);
        dot.setAttribute('r', Math.max(2, r * 0.08));
        dot.setAttribute('fill', 'rgba(255,255,255,0.7)');
        dot.style.pointerEvents = 'none';
        g.appendChild(dot);
      }

      // Labels (name + subname)
      if (shelf.name) {
        const hasSub = !!shelf.subname;
        const nameSize = Math.max(7, Math.min(12, r * 0.4));
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.classList.add('shelf-label-name');
        t.setAttribute('font-size', nameSize);
        t.setAttribute('x', cx);
        t.setAttribute('y', hasSub ? cy + r + nameSize + 2 : cy + r + nameSize + 2);
        t.textContent = shelf.name;
        g.appendChild(t);
        if (hasSub) {
          const subSize = Math.max(6, Math.min(9, r * 0.3));
          const ts = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          ts.classList.add('shelf-label-sub');
          ts.setAttribute('font-size', subSize);
          ts.setAttribute('x', cx);
          ts.setAttribute('y', cy + r + nameSize + subSize + 4);
          ts.textContent = shelf.subname;
          g.appendChild(ts);
        }
      }

      // Inactive X
      if (shelf.inactive) {
        const mkLine = (x1,y1,x2,y2) => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.classList.add('inactive-x'); l.setAttribute('x1',x1); l.setAttribute('y1',y1); l.setAttribute('x2',x2); l.setAttribute('y2',y2); return l; };
        g.appendChild(mkLine(cx-r, cy-r, cx+r, cy+r));
        g.appendChild(mkLine(cx+r, cy-r, cx-r, cy+r));
      }

      shelvesGroup.appendChild(g);

      // Selection corners for sixway
      if (state.selectedIds.includes(shelf.id) && state.selectedIds.length === 1) {
        const pts = [[cx-r,cy-r],[cx+r,cy-r],[cx+r,cy+r],[cx-r,cy+r]];
        pts.forEach(([px,py]) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          c.classList.add('selection-handle');
          const hs = 6/state.zoom;
          c.setAttribute('x', px - hs/2); c.setAttribute('y', py - hs/2);
          c.setAttribute('width', hs); c.setAttribute('height', hs);
          overlayGroup.appendChild(c);
        });
      }
      return; // skip normal rect rendering
    }

    // ── STANDARD / CUSTOM SHELF ──

    // Only apply SVG rotation for angled shelves
    if (angle !== 0) {
      const cx = shelf.x + dim.w / 2, cy = shelf.y + dim.h / 2;
      g.setAttribute('transform', `rotate(${angle}, ${cx}, ${cy})`);
    }

    // Rect
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('shelf-rect');
    rect.setAttribute('x', shelf.x); rect.setAttribute('y', shelf.y);
    rect.setAttribute('width', dim.w); rect.setAttribute('height', dim.h);
    rect.setAttribute('fill', color); rect.setAttribute('fill-opacity', '0.75');
    rect.setAttribute('stroke', state.selectedIds.includes(shelf.id) ? '#4a9eff' : color);
    rect.setAttribute('stroke-width', state.selectedIds.includes(shelf.id) ? 3 : 1.5);
    g.appendChild(rect);

    // Module dividers
    if (shelf.type !== 'custom') {
      const bayW = getShelfBayW(shelf);
      for (let i = 1; i < shelf.modules; i++) {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.classList.add('module-divider');
        const pos = i * bayW;
        if (isV && angle === 0) {
          l.setAttribute('x1', shelf.x); l.setAttribute('x2', shelf.x + dim.w);
          l.setAttribute('y1', shelf.y + pos); l.setAttribute('y2', shelf.y + pos);
        } else {
          l.setAttribute('x1', shelf.x + pos); l.setAttribute('x2', shelf.x + pos);
          l.setAttribute('y1', shelf.y); l.setAttribute('y2', shelf.y + dim.h);
        }
        g.appendChild(l);
      }
    } else if (shelf.modules > 1) {
      // Custom shelves: N even module lines along the longer axis
      const horiz = dim.w >= dim.h, n = shelf.modules;
      for (let i = 1; i < n; i++) {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.classList.add('module-divider');
        if (horiz) { const pos = dim.w * i / n; l.setAttribute('x1', shelf.x + pos); l.setAttribute('x2', shelf.x + pos); l.setAttribute('y1', shelf.y); l.setAttribute('y2', shelf.y + dim.h); }
        else { const pos = dim.h * i / n; l.setAttribute('y1', shelf.y + pos); l.setAttribute('y2', shelf.y + pos); l.setAttribute('x1', shelf.x); l.setAttribute('x2', shelf.x + dim.w); }
        g.appendChild(l);
      }
    }

    // Custom shelf corner ticks
    if (shelf.type === 'custom') {
      const tick = Math.min(6, dim.w * 0.15, dim.h * 0.15);
      const corners = [
        [shelf.x, shelf.y, 1, 1], [shelf.x + dim.w, shelf.y, -1, 1],
        [shelf.x, shelf.y + dim.h, 1, -1], [shelf.x + dim.w, shelf.y + dim.h, -1, -1]
      ];
      corners.forEach(([cx, cy, dx, dy]) => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.classList.add('custom-corner');
        p.setAttribute('d', `M${cx},${cy + dy * tick} L${cx},${cy} L${cx + dx * tick},${cy}`);
        g.appendChild(p);
      });
    }

    // Labels
    const cx = shelf.x + dim.w / 2, cy = shelf.y + dim.h / 2;
    const hasSub = !!shelf.subname;

    if (shelf.name) {
      const nameSize = Math.max(8, Math.min(12, dim.w * 0.15, dim.h * 0.35));
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.classList.add('shelf-label-name');
      t.setAttribute('font-size', nameSize);
      t.setAttribute('x', cx);
      t.setAttribute('y', hasSub ? cy - nameSize * 0.35 : cy);
      const displayName = (shelf.locations && shelf.locations.length >= 2) ? formatLocationRange(shelf.locations) : shelf.name;
      t.textContent = displayName;
      g.appendChild(t);
    }

    if (hasSub) {
      const subSize = Math.max(6, Math.min(9, dim.w * 0.12, dim.h * 0.25));
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.classList.add('shelf-label-sub');
      t.setAttribute('font-size', subSize);
      t.setAttribute('x', cx);
      t.setAttribute('y', cy + subSize * 0.9);
      t.textContent = shelf.subname;
      g.appendChild(t);
    }

    // Inactive X cross
    if (shelf.inactive) {
      const mkLine = (x1,y1,x2,y2) => {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.classList.add('inactive-x');
        l.setAttribute('x1',x1); l.setAttribute('y1',y1);
        l.setAttribute('x2',x2); l.setAttribute('y2',y2);
        return l;
      };
      g.appendChild(mkLine(shelf.x, shelf.y, shelf.x+dim.w, shelf.y+dim.h));
      g.appendChild(mkLine(shelf.x+dim.w, shelf.y, shelf.x, shelf.y+dim.h));
    }

    shelvesGroup.appendChild(g);

    // Selection indicators
    if (state.selectedIds.includes(shelf.id) && state.selectedIds.length === 1) {
      let corners;
      if (angle !== 0) {
        const rad = angle * Math.PI / 180;
        const ccx = shelf.x + dim.w/2, ccy = shelf.y + dim.h/2;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const rotPt = (px, py) => [ccx+(px-ccx)*cos-(py-ccy)*sin, ccy+(px-ccx)*sin+(py-ccy)*cos];
        corners = [rotPt(shelf.x, shelf.y), rotPt(shelf.x+dim.w, shelf.y), rotPt(shelf.x, shelf.y+dim.h), rotPt(shelf.x+dim.w, shelf.y+dim.h)];
      } else {
        corners = [[shelf.x, shelf.y], [shelf.x+dim.w, shelf.y], [shelf.x, shelf.y+dim.h], [shelf.x+dim.w, shelf.y+dim.h]];
      }
      corners.forEach(([px, py]) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', px); c.setAttribute('cy', py);
        c.setAttribute('r', 3/state.zoom); c.setAttribute('fill', 'var(--accent)');
        c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 1.5);
        c.style.pointerEvents = 'none';
        overlayGroup.appendChild(c);
      });
      // Interactive drag-resize handles (extend/shorten). Length-ends for
      // standard/angled shelves; four corners for custom.
      if (!shelf.locked) {
        const NS = 'http://www.w3.org/2000/svg';
        const hs = 11 / state.zoom;
        const mkH = (px, py, posName, cur) => {
          const h = document.createElementNS(NS, 'rect');
          h.classList.add('shelf-resize-handle');
          h.dataset.pos = posName; h.dataset.id = shelf.id;
          h.setAttribute('x', px - hs/2); h.setAttribute('y', py - hs/2);
          h.setAttribute('width', hs); h.setAttribute('height', hs);
          h.setAttribute('rx', 1.5/state.zoom);
          h.style.cursor = cur; h.style.pointerEvents = 'all';
          overlayGroup.appendChild(h);
        };
        const cxx = shelf.x + dim.w/2, cyy = shelf.y + dim.h/2;
        if (shelf.type === 'custom') {
          mkH(shelf.x, shelf.y, 'tl', 'nwse-resize');
          mkH(shelf.x+dim.w, shelf.y, 'tr', 'nesw-resize');
          mkH(shelf.x, shelf.y+dim.h, 'bl', 'nesw-resize');
          mkH(shelf.x+dim.w, shelf.y+dim.h, 'br', 'nwse-resize');
        } else if (angle !== 0) {
          // Corner handles in the rotated frame — drag to change length + depth.
          const rad = angle*Math.PI/180, cos = Math.cos(rad), sin = Math.sin(rad);
          const rp = (lx, ly) => [cxx+(lx-cxx)*cos-(ly-cyy)*sin, cyy+(lx-cxx)*sin+(ly-cyy)*cos];
          const ctl = rp(shelf.x, shelf.y), ctr = rp(shelf.x+dim.w, shelf.y), cbl = rp(shelf.x, shelf.y+dim.h), cbr = rp(shelf.x+dim.w, shelf.y+dim.h);
          mkH(ctl[0], ctl[1], 'tl', 'move'); mkH(ctr[0], ctr[1], 'tr', 'move');
          mkH(cbl[0], cbl[1], 'bl', 'move'); mkH(cbr[0], cbr[1], 'br', 'move');
        } else if (shelf.orientation === 'V') {
          mkH(cxx, shelf.y, 'n', 'ns-resize'); mkH(cxx, shelf.y+dim.h, 's', 'ns-resize');
        } else {
          mkH(shelf.x, cyy, 'w', 'ew-resize'); mkH(shelf.x+dim.w, cyy, 'e', 'ew-resize');
        }
      }
    }
  });
}

function renderShelfList() {
  const list = document.getElementById('shelfList');
  const search = (document.getElementById('shelfSearch').value || '').toUpperCase();
  const deptFilterVal = document.getElementById('deptFilter').value;
  document.getElementById('shelfCount').textContent = `(${state.shelves.length})`;
  const dupes = getDuplicates();

  // Populate dept filter dropdown
  const deptSelect = document.getElementById('deptFilter');
  const curVal = deptSelect.value;
  const opts = ['<option value="">All Departments</option>'];
  const usedDepts = new Set(state.shelves.map(s => s.dept).filter(Boolean));
  state.departments.filter(d => usedDepts.has(d.id)).forEach(d => {
    opts.push(`<option value="${d.id}"${curVal === d.id ? ' selected' : ''}>${d.name}</option>`);
  });
  deptSelect.innerHTML = opts.join('');

  if (!state.shelves.length) {
    list.innerHTML = '<div class="empty-state">No shelves yet. Use the Shelf tool (S) to draw.</div>';
    return;
  }

  // Group by name
  const groups = {};
  state.shelves.forEach(s => {
    const key = s.name || '(unnamed)';
    if (search && !fullName(s).toUpperCase().includes(search) && !key.toUpperCase().includes(search) && !(s.locations && s.locations.some(loc => loc.toUpperCase().includes(search)))) return;
    if (deptFilterVal && s.dept !== deptFilterVal) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  list.innerHTML = '';
  const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  sortedKeys.forEach(key => {
    const shelves = groups[key];
    // Group header
    const header = document.createElement('div');
    header.className = 'shelf-list-group-header';
    const dept = shelves[0].dept ? state.departments.find(d => d.id === shelves[0].dept) : null;
    const isUnnamed = key === '(unnamed)';
    // Collect all locations across sections for range display
    const allLocs = [...new Set(shelves.flatMap(s => s.locations || []))];
    const rangeLabel = allLocs.length >= 2 ? ' <span style="color:var(--accent);font-size:10px;font-family:var(--font-mono)">' + formatLocationRange(allLocs) + '</span>' : '';
    header.innerHTML = `<span class="dept-color" style="background:${dept ? dept.color : '#666'};width:8px;height:8px;border-radius:2px"></span>${isUnnamed ? '<span style="color:var(--warning)">⚠ (unnamed)</span>' : key}${rangeLabel} <span style="color:var(--accent)">(${shelves.length})</span>`;
    header.onclick = () => {
      state.highlightedName = state.highlightedName === key ? null : key;
      renderAll();
    };
    list.appendChild(header);

    shelves.sort((a, b) => (a.subname || '').localeCompare(b.subname || ''));
    shelves.forEach(shelf => {
      const isDupe = !!dupes[shelf.id];
      const item = document.createElement('div');
      item.className = 'shelf-list-item' + (state.selectedIds.includes(shelf.id) ? ' selected' : '') + (isDupe ? ' has-dupe' : '') + (shelf.inactive ? ' inactive' : '') + (!shelf.name ? ' unnamed' : '');
      item.innerHTML = `
        <span class="shelf-list-sub">${shelf.subname || '—'}</span>
        ${shelf.locked ? '<span class="lock-icon" title="Locked">🔒</span>' : ''}
        ${shelf.inactive ? '<span style="color:var(--text-dim);font-size:9px;font-family:var(--font-mono);letter-spacing:0.5px" title="Not in use">OFF</span>' : ''}
        ${isDupe ? '<span style="color:var(--warning);font-size:10px" title="Duplicate name+subname">⚠</span>' : ''}
        <span class="shelf-list-meta">${shelf.locations && shelf.locations.length >= 2 ? '<span style="color:var(--accent)" title="' + shelf.locations.join(', ') + '">📍' + shelf.locations.length + '</span> ' : ''}${shelf.type === 'sixway' ? 'r' + shelf.radius + ' ⬡' : shelf.type === 'custom' ? (shelf.customW + '×' + shelf.customH + (shelf.modules > 1 ? ' · ' + shelf.modules + 'm' : '')) : shelf.modules + 'm ' + (shelf.orientation === 'A' ? (shelf.angle > 0 ? '+' : '') + shelf.angle + '°' : shelf.orientation)}</span>
      `;
      item.onclick = (e) => { e.stopPropagation(); state.selectedIds = [shelf.id]; state.highlightedName = null; renderAll(); };
      item.ondblclick = (e) => { e.stopPropagation(); zoomToShelf(shelf.id); };
      list.appendChild(item);
    });
  });
}

function onShelfSearch(val) {
  // Also highlight on canvas
  const term = val.toUpperCase();
  if (term.length >= 2) {
    state.highlightedName = null;
    // Find exact subname match first
    const exact = state.shelves.find(s => fullName(s).toUpperCase() === term);
    if (exact) {
      state.selectedIds = [exact.id];
    } else {
      // Highlight all matching base name
      const matching = state.shelves.filter(s => s.name.toUpperCase().includes(term));
      if (matching.length) state.highlightedName = matching[0].name;
    }
  } else {
    state.highlightedName = null;
  }
  renderAll();
}

function renderDeptList() {
  const list = document.getElementById('deptList');
  list.innerHTML = '';

  // Render grouped departments
  state.deptGroups.forEach(group => {
    const subs = state.departments.filter(d => d.parent === group.id);
    if (!subs.length) return;
    const header = document.createElement('div');
    header.className = 'dept-group-header';
    header.textContent = group.name;
    list.appendChild(header);
    subs.forEach(dept => {
      const count = state.shelves.filter(s => s.dept === dept.id).length;
      const item = document.createElement('div');
      item.className = 'dept-item sub';
      item.innerHTML = `<span class="dept-color" style="background:${dept.color}"></span><span>${dept.name}</span><span class="dept-count">${count}</span>`;
      item.ondblclick = () => editDepartment(dept.id);
      list.appendChild(item);
    });
  });

  // Standalone departments
  const standalone = state.departments.filter(d => d.parent === null);
  if (standalone.length) {
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border);margin:6px 0';
    list.appendChild(sep);
    standalone.forEach(dept => {
      const count = state.shelves.filter(s => s.dept === dept.id).length;
      const item = document.createElement('div');
      item.className = 'dept-item';
      item.innerHTML = `<span class="dept-color" style="background:${dept.color}"></span><span>${dept.name}</span><span class="dept-count">${count}</span>`;
      item.ondblclick = () => editDepartment(dept.id);
      list.appendChild(item);
    });
  }

  // Update custom dept picker dropdown
  populateDeptDropdown('propDeptDropdown', (deptId) => { onDeptChange(deptId); closeDeptPickers(); });

  // Render footer department badges with counts
  const badges = document.getElementById('deptBadges');
  badges.innerHTML = '';
  const needsDarkText = c => {
    const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
    return (r*0.299 + g*0.587 + b*0.114) > 160;
  };
  state.departments.forEach(dept => {
    const count = state.shelves.filter(s => s.dept === dept.id).length;
    const shortCodes = { checkouts: 'CHK', flex: 'FLX', stockroom: 'STK' };
    const code = shortCodes[dept.id] || dept.id.toUpperCase();
    const light = needsDarkText(dept.color) ? ' light-text' : '';
    const badge = document.createElement('span');
    badge.className = 'dept-badge' + light;
    badge.style.background = dept.color;
    badge.innerHTML = `${code}<span style="opacity:0.7;margin-left:2px">${count}</span><span class="dept-badge-tip">${dept.name} — ${count} ${count === 1 ? 'shelf' : 'shelves'}</span>`;
    badges.appendChild(badge);
  });
}

function populateDeptDropdown(containerId, onSelect) {
  const dropdown = document.getElementById(containerId);
  dropdown.innerHTML = '';
  const standalone = state.departments.filter(d => d.parent === null);
  state.deptGroups.forEach(group => {
    const subs = state.departments.filter(d => d.parent === group.id);
    if (!subs.length) return;
    const header = document.createElement('div');
    header.className = 'dept-picker-group';
    header.textContent = group.name;
    dropdown.appendChild(header);
    subs.forEach(d => {
      const opt = document.createElement('div');
      opt.className = 'dept-picker-opt';
      opt.innerHTML = `<span class="dept-picker-swatch" style="background:${d.color}"></span>${d.name}`;
      opt.onclick = (e) => { e.stopPropagation(); onSelect(d.id); };
      dropdown.appendChild(opt);
    });
  });
  standalone.forEach(d => {
    const opt = document.createElement('div');
    opt.className = 'dept-picker-opt';
    opt.innerHTML = `<span class="dept-picker-swatch" style="background:${d.color}"></span>${d.name}`;
    opt.onclick = (e) => { e.stopPropagation(); onSelect(d.id); };
    dropdown.appendChild(opt);
  });
}

function toggleDeptPicker(pickerId) {
  const dropdown = document.getElementById(pickerId).querySelector('.dept-picker-dropdown');
  const wasOpen = dropdown.classList.contains('open');
  closeDeptPickers();
  if (!wasOpen) dropdown.classList.add('open');
}

function closeDeptPickers() {
  document.querySelectorAll('.dept-picker-dropdown.open').forEach(d => d.classList.remove('open'));
}

// Close dept pickers when clicking outside
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.dept-picker')) closeDeptPickers();
});

function updateSelectionPanel() {
  const panel = document.getElementById('selectionPanel');
  const multiPanel = document.getElementById('multiSelectPanel');

  // Mixed selection mode (shelves + landmarks, or multiple landmarks from selection box)
  const hasMixedSelection = state.selectedLandmarkIds.length > 0 && (state.selectedIds.length > 0 || state.selectedLandmarkIds.length > 1);
  if (hasMixedSelection) {
    panel.style.display = 'none';
    multiPanel.style.display = '';
    const shelfCount = state.selectedIds.length;
    const landmarkCount = state.selectedLandmarkIds.length;
    let parts = [];
    if (shelfCount > 0) parts.push(`<strong>${shelfCount}</strong> ${shelfCount === 1 ? 'shelf' : 'shelves'}`);
    if (landmarkCount > 0) parts.push(`<strong>${landmarkCount}</strong> ${landmarkCount === 1 ? 'landmark' : 'landmarks'}`);
    document.getElementById('multiInfo').innerHTML = parts.join(' + ') + ' selected';
    // Hide editing controls in mixed mode — only allow move & delete
    document.getElementById('multiName').parentElement.style.display = 'none';
    document.getElementById('multiDeptPicker').parentElement.style.display = 'none';
    document.getElementById('multiModulesRow').style.display = 'none';
    document.getElementById('swapSubnamesRow').style.display = 'none';
    return;
  }

  // Multi-select panel (shelves only)
  if (state.selectedIds.length > 1) {
    panel.style.display = 'none';
    multiPanel.style.display = '';
    // Re-show editing controls (may have been hidden by mixed mode)
    document.getElementById('multiName').parentElement.style.display = '';
    document.getElementById('multiDeptPicker').parentElement.style.display = '';
    document.getElementById('multiInfo').innerHTML = `<strong>${state.selectedIds.length} shelves</strong> selected`;
    // Populate multi dept picker
    populateDeptDropdown('multiDeptDropdown', (deptId) => { batchSetDept(deptId); closeDeptPickers(); document.getElementById('multiDeptSwatch').style.background = 'transparent'; document.getElementById('multiDeptLabel').textContent = '— Set all —'; });
    document.getElementById('multiDeptSwatch').style.background = 'transparent';
    document.getElementById('multiDeptLabel').textContent = '— Set all —';

    // Detect swappable S and E subname pairs
    const selected = state.selectedIds.map(id => state.shelves.find(s => s.id === id)).filter(Boolean);
    const subs = selected.map(s => (s.subname || '').toUpperCase());
    const hasS1 = subs.includes('S1'), hasS2 = subs.includes('S2');
    const hasE1 = subs.includes('E1'), hasE2 = subs.includes('E2');
    const swapRow = document.getElementById('swapSubnamesRow');
    const swapS = document.getElementById('swapSBtn');
    const swapE = document.getElementById('swapEBtn');
    if (hasS1 && hasS2 || hasE1 && hasE2) {
      swapRow.style.display = '';
      swapS.style.display = (hasS1 && hasS2) ? '' : 'none';
      swapE.style.display = (hasE1 && hasE2) ? '' : 'none';
    } else {
      swapRow.style.display = 'none';
    }

    // Modules row: show if any standard shelves in selection
    const standardShelves = selected.filter(s => s.type !== 'custom' && s.type !== 'sixway');
    const modulesRow = document.getElementById('multiModulesRow');
    if (standardShelves.length > 0) {
      modulesRow.style.display = '';
      const mods = standardShelves.map(s => s.modules);
      const allSame = mods.every(m => m === mods[0]);
      document.getElementById('multiModulesInfo').textContent = allSame ? `${mods[0]}m` : `${Math.min(...mods)}–${Math.max(...mods)}m`;
    } else {
      modulesRow.style.display = 'none';
    }
    return;
  }
  multiPanel.style.display = 'none';

  // Single-select panel
  if (state.selectedIds.length !== 1) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) { panel.style.display = 'none'; return; }

  const stock = isStockroom(shelf);
  const custom = shelf.type === 'custom';
  const sixway = shelf.type === 'sixway';

  // Name fields — stockroom: full-width name only, no subname
  document.getElementById('rowNameFull').style.display = stock ? '' : 'none';
  document.getElementById('rowNameSub').style.display = stock ? 'none' : '';
  document.getElementById('rowQuick').style.display = (stock || custom || sixway) ? 'none' : '';
  document.getElementById('rowStockroomSize').style.display = stock ? '' : 'none';
  document.getElementById('rowLocations').style.display = stock ? '' : 'none';

  // Standard vs Custom vs Sixway rows
  document.getElementById('rowOrient').style.display = (custom || sixway) ? 'none' : '';
  document.getElementById('rowAngle').style.display = (!custom && !sixway && shelf.orientation === 'A') ? '' : 'none';
  document.getElementById('rowMods').style.display = sixway ? 'none' : '';
  document.getElementById('rowCustomSize').style.display = custom ? '' : 'none';
  document.getElementById('rowSixwaySize').style.display = sixway ? '' : 'none';

  if (stock) {
    document.getElementById('propNameFull').value = shelf.name;
    document.getElementById('propNameFull').placeholder = '7001';
    document.getElementById('propBayW').value = shelf.bayW || state.stockroomBayW;
    document.getElementById('propDepth').value = shelf.depth || state.stockroomDepth;
    renderLocationTags(shelf);
  } else {
    document.getElementById('propName').value = shelf.name;
    document.getElementById('propSub').value = shelf.subname;
  }

  // Update dept picker display
  const curDept = state.departments.find(d => d.id === shelf.dept);

  // Show shared name option if this shelf has a duplicate name
  const fn = fullName(shelf);
  const hasDupe = fn && state.shelves.filter(s => fullName(s) === fn).length > 1;
  document.getElementById('rowSharedName').style.display = hasDupe ? '' : 'none';
  document.getElementById('propSharedName').checked = !!shelf.sharedName;
  document.getElementById('propDeptSwatch').style.background = curDept ? curDept.color : 'transparent';
  document.getElementById('propDeptLabel').textContent = curDept ? curDept.name : '—';
  document.getElementById('propX').value = Math.round(shelf.x);
  document.getElementById('propY').value = Math.round(shelf.y);
  document.getElementById('propModules').textContent = shelf.modules;
  { const mf = document.getElementById('propModulesFit'); if (mf && document.activeElement !== mf) mf.value = shelf.modules; }

  // v0.130: Fixture dropdown — show explicit value or empty (auto)
  const fixtureSelect = document.getElementById('propFixture');
  const fixtureAutoLabel = document.getElementById('propFixtureAuto');
  if (fixtureSelect) {
    fixtureSelect.value = shelf.fixture || '';
    // Show "auto" label when no explicit override AND auto-detection produces a result
    if (fixtureAutoLabel) {
      const auto = autoDetectFixture(shelf);
      if (!shelf.fixture && auto) {
        fixtureAutoLabel.textContent = 'auto: ' + auto;
        fixtureAutoLabel.style.display = '';
      } else {
        fixtureAutoLabel.style.display = 'none';
      }
    }
  }

  // Orientation (standard shelves only)
  if (!custom) {
    document.querySelectorAll('#propOrient .orient-btn').forEach(b => b.classList.toggle('active', b.dataset.orient === shelf.orientation));
    const isAngled = shelf.orientation === 'A';
    document.getElementById('rowAngle').style.display = isAngled ? '' : 'none';
    if (isAngled) {
      document.getElementById('propAngle').value = shelf.angle || 0;
      document.getElementById('propAngleSlider').value = shelf.angle || 0;
      renderAngleQuickPicks(shelf.angle || 0);
    }
  }

  // Custom shelf size
  if (custom) {
    document.getElementById('propCustomW').value = shelf.customW;
    document.getElementById('propCustomH').value = shelf.customH;
    const cAngle = shelf.angle || 0;
    document.getElementById('propCustomAngle').value = cAngle;
    document.getElementById('propCustomAngleSlider').value = cAngle;
  }

  // Inactive toggle
  document.getElementById('propStatusActive').classList.toggle('active', !shelf.inactive);
  document.getElementById('propStatusInactive').classList.toggle('active', !!shelf.inactive);

  // Lock toggle
  document.getElementById('propLockOff').classList.toggle('active', !shelf.locked);
  document.getElementById('propLockOn').classList.toggle('active', !!shelf.locked);

  // Subname quick-pick (shop floor only)
  if (!stock) {
    const tagContainer = document.getElementById('propSubTags');
    tagContainer.innerHTML = '';
    const makeTag = (sn) => {
      const tag = document.createElement('span');
      tag.className = 'subname-tag' + (shelf.subname === sn ? ' active' : '');
      tag.textContent = sn;
      tag.onclick = () => { saveState(); shelf.subname = shelf.subname === sn ? '' : sn; renderAll(); };
      return tag;
    };
    const makeLabel = (text) => {
      const l = document.createElement('span');
      l.style.cssText = 'font-family:var(--font-mono);font-size:8px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:var(--text-dim)';
      l.textContent = text;
      return l;
    };
    tagContainer.appendChild(makeLabel('Sides'));
    SUBNAMES_SIDES.forEach(sn => tagContainer.appendChild(makeTag(sn)));
    tagContainer.appendChild(makeLabel('Ends'));
    SUBNAMES_ENDS.forEach(sn => tagContainer.appendChild(makeTag(sn)));
  }

  // Size display
  const dim = getDims(shelf);
  if (sixway) {
    document.getElementById('moduleSizeDisplay').innerHTML =
      `<strong>6-Way Display</strong> radius ${shelf.radius}px → ${dim.w} × ${dim.h} px`;
    document.getElementById('propSixwayRadius').value = shelf.radius || 20;
  } else if (custom) {
    const cAngle = shelf.angle ? ` ∠${shelf.angle > 0 ? '+' : ''}${shelf.angle}°` : '';
    document.getElementById('moduleSizeDisplay').innerHTML =
      `<strong>Custom</strong> ${dim.w} × ${dim.h} px${cAngle}`;
  } else {
    const bayW = getShelfBayW(shelf);
    const depth = getShelfDepth(shelf);
    const angleInfo = shelf.orientation === 'A' ? ` ∠${shelf.angle > 0 ? '+' : ''}${shelf.angle}°` : '';
    document.getElementById('moduleSizeDisplay').innerHTML =
      `<strong>${shelf.modules} module${shelf.modules > 1 ? 's' : ''}</strong> @ ${bayW}×${depth} → ${dim.w} × ${dim.h} px${angleInfo}`;
  }

  // Duplicate warning
  const dupes = getDuplicates();
  const dupeWarning = document.getElementById('propDupeWarning');
  if (dupes[shelf.id]) {
    const fn = fullName(shelf);
    const count = state.shelves.filter(s => fullName(s) === fn).length;
    dupeWarning.style.display = '';
    dupeWarning.innerHTML = stock
      ? `⚠ <strong>${fn}</strong> appears ${count}× — each stockroom name should be unique`
      : `⚠ <strong>${fn}</strong> appears ${count}× — each name+sub should be unique`;
  } else {
    dupeWarning.style.display = 'none';
  }

  // Related shelves
  const related = state.shelves.filter(s => s.id !== shelf.id && s.name && s.name === shelf.name);
  const relSection = document.getElementById('relatedShelvesSection');
  const relList = document.getElementById('relatedShelvesList');
  if (related.length && shelf.name) {
    relSection.style.display = '';
    relList.innerHTML = '';
    related.forEach(r => {
      const item = document.createElement('div');
      item.className = 'related-shelf';
      const dept = state.departments.find(d => d.id === r.dept);
      item.innerHTML = `<span class="related-shelf-name">${fullName(r)}</span><span style="font-size:10px;color:var(--text-dim)">${r.modules}m</span><span class="related-shelf-dept">${dept ? dept.name : ''}</span>`;
      item.onclick = () => { state.selectedIds = [r.id]; renderAll(); };
      relList.appendChild(item);
    });
  } else {
    relSection.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
// PROPERTY UPDATES
// ═══════════════════════════════════════════════════════════

function updateProp(prop, value) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) return;
  saveState();
  shelf[prop] = value;
  renderAll();
}

// v0.130: Fixture type auto-detection from subname
// Mirror of the viewer's getFixtureType — S/E/P digit patterns map to side/end
function autoDetectFixture(shelf) {
  if (!shelf || !shelf.subname) return null;
  const sn = shelf.subname.toUpperCase();
  if (/^S\d/.test(sn)) return 'side';
  if (/^E\d/.test(sn)) return 'end';
  if (/^P\d/.test(sn)) return 'end';
  return null;
}

function updateFixture(value) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) return;
  saveState();
  // Empty value means "use auto-detection" — clear the override
  if (!value) {
    delete shelf.fixture;
  } else {
    shelf.fixture = value;
  }
  renderAll();
}

function onDeptChange(deptId) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) return;
  saveState();
  const wasStockroom = isStockroom(shelf);
  shelf.dept = deptId;
  const nowStockroom = isStockroom(shelf);

  if (nowStockroom && !wasStockroom) {
    // Switching TO stockroom — clear subname, set overrides
    shelf.subname = '';
    shelf.bayW = state.stockroomBayW;
    shelf.depth = state.stockroomDepth;
  } else if (!nowStockroom && wasStockroom) {
    // Switching FROM stockroom — clear overrides
    shelf.bayW = null;
    shelf.depth = null;
  }
  renderAll();
}

function batchSetDept(deptId) {
  if (!deptId || !state.selectedIds.length) return;
  saveState();
  state.selectedIds.forEach(id => {
    const shelf = state.shelves.find(s => s.id === id);
    if (!shelf) return;
    const wasStockroom = isStockroom(shelf);
    shelf.dept = deptId;
    const nowStockroom = isStockroom(shelf);
    if (nowStockroom && !wasStockroom) {
      shelf.subname = '';
      shelf.bayW = state.stockroomBayW;
      shelf.depth = state.stockroomDepth;
    } else if (!nowStockroom && wasStockroom) {
      shelf.bayW = null;
      shelf.depth = null;
    }
  });
  renderAll();
}

function batchToggleInactive() {
  if (!state.selectedIds.length) return;
  saveState();
  // If any are active, mark all inactive. If all inactive, mark all active.
  const selected = state.selectedIds.map(id => state.shelves.find(s => s.id === id)).filter(Boolean);
  const allInactive = selected.every(s => s.inactive);
  selected.forEach(s => s.inactive = !allInactive);
  renderAll();
}

function batchSetName() {
  const name = document.getElementById('multiName').value.trim();
  if (!state.selectedIds.length) return;
  saveState();
  state.selectedIds.forEach(id => {
    const shelf = state.shelves.find(s => s.id === id);
    if (shelf) shelf.name = name;
  });
  document.getElementById('multiName').value = '';
  renderAll();
}

function batchSwapSubnames(prefix) {
  // prefix is 'S' or 'E' — swaps e.g. S1↔S2 or E1↔E2
  if (!state.selectedIds.length) return;
  saveState();
  const selected = state.selectedIds.map(id => state.shelves.find(s => s.id === id)).filter(Boolean);
  const sub1 = prefix + '1', sub2 = prefix + '2';
  selected.forEach(shelf => {
    const upper = (shelf.subname || '').toUpperCase();
    if (upper === sub1) shelf.subname = sub2;
    else if (upper === sub2) shelf.subname = sub1;
  });
  renderAll();
}

function batchAdjustModules(delta) {
  const shelves = state.selectedIds.map(id => state.shelves.find(s => s.id === id)).filter(s => s && s.type !== 'custom' && s.type !== 'sixway');
  if (!shelves.length) return;
  saveState();
  shelves.forEach(s => { s.modules = Math.max(1, s.modules + delta); });
  renderAll();
}

function batchSetModules(val) {
  if (!val || val < 1) return;
  const shelves = state.selectedIds.map(id => state.shelves.find(s => s.id === id)).filter(s => s && s.type !== 'custom' && s.type !== 'sixway');
  if (!shelves.length) return;
  saveState();
  shelves.forEach(s => { s.modules = Math.max(1, Math.round(val)); });
  document.getElementById('multiModulesSet').value = '';
  renderAll();
}

function adjustModules(delta) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) return;
  saveState();
  shelf.modules = Math.max(1, shelf.modules + delta);
  renderAll();
}

// Set the module count on a shelf WITHOUT changing its size — flexes the
// per-shelf bay width so N module lines land evenly inside the current
// footprint. Pairs with fine drag-resize: trace the size, then set the bays.
function setShelfModulesFit(n) {
  if (state.selectedIds.length !== 1) { alert('Select a single shelf first.'); return; }
  const s = state.shelves.find(x => x.id === state.selectedIds[0]);
  if (!s) return;
  if (s.type === 'sixway') { alert('6-way displays have no module lines.'); return; }
  n = Math.max(1, Math.min(60, Math.round(n || 0)));
  if (!n) { alert('Enter how many modules (1 or more).'); return; }
  saveState();
  if (s.type === 'custom') { s.modules = n; renderAll(); return; }  // custom: line count only, size unchanged
  const dim = getDims(s);
  const len = (s.orientation === 'V') ? dim.h : dim.w;  // length axis (angled: dim.w = length)
  s.bayW = +(len / n).toFixed(2);                        // keep total length identical
  s.modules = n;
  renderAll();
}

function rotateSelected() {
  if (!state.selectedIds.length) return;
  saveState();
  state.selectedIds.forEach(id => {
    const s = state.shelves.find(x => x.id === id);
    if (!s) return;
    if (s.type === 'custom') {
      // Swap W and H
      const tmp = s.customW; s.customW = s.customH; s.customH = tmp;
    } else {
      // R always toggles between H and V, clearing any angle
      if (s.orientation === 'V') { s.orientation = 'H'; }
      else { s.orientation = 'V'; }
      s.angle = null;
    }
  });
  renderAll(); hideContextMenu();
}

function setOrientation(orient) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) return;
  saveState();
  if (orient === 'H') { shelf.orientation = 'H'; shelf.angle = null; }
  else if (orient === 'V') { shelf.orientation = 'V'; shelf.angle = null; }
  else { shelf.orientation = 'A'; shelf.angle = (shelf.angle != null && shelf.angle !== 0 && Math.abs(shelf.angle) <= 90) ? shelf.angle : 45; }
  renderAll();
}

// Custom shelf dimension updates
function updateCustomDim(prop, val) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf || shelf.type !== 'custom') return;
  saveState();
  shelf[prop] = Math.max(10, val);
  renderAll();
}

function swapCustomDims() {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf || shelf.type !== 'custom') return;
  saveState();
  const tmp = shelf.customW; shelf.customW = shelf.customH; shelf.customH = tmp;
  renderAll();
}

function updateCustomAngle(deg) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf || shelf.type !== 'custom') return;
  saveState();
  deg = Math.max(-90, Math.min(90, deg));
  shelf.angle = deg === 0 ? null : deg;
  shelf.orientation = deg === 0 ? 'H' : 'A';
  document.getElementById('propCustomAngle').value = deg;
  document.getElementById('propCustomAngleSlider').value = deg;
  renderAll();
}

function updateSixwayRadius(val) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf || shelf.type !== 'sixway') return;
  saveState();
  shelf.radius = Math.max(10, val);
  renderAll();
}

// ═══════════════════════════════════════════════════════════
// MULTI-LOCATION SHELVES
// ═══════════════════════════════════════════════════════════

function formatLocationRange(locations) {
  if (!locations || locations.length === 0) return '';
  if (locations.length === 1) return locations[0];
  const sorted = [...locations].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const first = sorted[0], last = sorted[sorted.length - 1];
  // Find common prefix
  let prefix = '';
  for (let i = 0; i < Math.min(first.length, last.length); i++) {
    if (first[i] === last[i]) prefix += first[i];
    else break;
  }
  // Suffix = differing part of last, min 2 chars for long codes (4+) for readability
  let suffix = last.substring(prefix.length);
  const minSuffix = first.length >= 4 ? 2 : 1;
  while (suffix.length < minSuffix && prefix.length > 0) {
    suffix = prefix[prefix.length - 1] + suffix;
    prefix = prefix.substring(0, prefix.length - 1);
  }
  if (suffix && prefix.length > 0) return first + '-' + suffix;
  return first + '-' + last;
}

function getSelectedShelf() {
  if (state.selectedIds.length !== 1) return null;
  return state.shelves.find(s => s.id === state.selectedIds[0]) || null;
}

function renderLocationTags(shelf) {
  const container = document.getElementById('locationsTags');
  const preview = document.getElementById('locationsPreview');
  container.innerHTML = '';
  preview.textContent = '';
  if (!shelf) return;

  const locs = shelf.locations || [];
  locs.forEach((loc, i) => {
    const tag = document.createElement('span');
    tag.className = 'loc-tag';
    tag.innerHTML = `${loc}<span class="loc-tag-x" data-onclick="removeLocation" data-i="${i}" title="Remove">\u2715</span>`;
    container.appendChild(tag);
  });

  if (locs.length >= 2) {
    preview.textContent = '\u2192 Name: ' + shelf.name + '  Label: ' + formatLocationRange(locs);
  } else if (locs.length === 1) {
    preview.textContent = '\u2192 Add more for range label';
  }
}

// Parse a range string like "7001-7005" or "7001-05" into an array of location strings
function parseLocationRange(rangeStr) {
  const parts = rangeStr.split('-');
  if (parts.length !== 2) return null;
  const startStr = parts[0].trim();
  let endStr = parts[1].trim();
  if (!startStr || !endStr) return null;
  // If endStr is shorter, it's a suffix
  if (endStr.length < startStr.length) {
    endStr = startStr.substring(0, startStr.length - endStr.length) + endStr;
  }
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (isNaN(start) || isNaN(end) || end < start) return null;
  if (end - start > 200) return null; // safety cap
  const result = [];
  for (let i = start; i <= end; i++) {
    result.push(String(i).padStart(startStr.length, '0'));
  }
  return result;
}

// Auto-set shelf name to the highest location number
function autoNameToHighest(shelf) {
  if (!shelf.locations || shelf.locations.length < 2) return;
  const sorted = [...shelf.locations].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  shelf.name = sorted[sorted.length - 1];
}

// Smart add: accepts single values, comma/space separated, or range notation
function addLocations() {
  const shelf = getSelectedShelf();
  if (!shelf) return;
  const input = document.getElementById('locationsInput');
  const raw = input.value.trim();
  if (!raw) return;
  saveState();
  if (!shelf.locations) shelf.locations = shelf.name ? [shelf.name] : [];

  // Split by commas and/or spaces
  const tokens = raw.split(/[\s,]+/).filter(Boolean);

  tokens.forEach(token => {
    // Check if token is a range (contains exactly one dash with digits on both sides)
    if (token.includes('-') && /^\d+\s*-\s*\d+$/.test(token)) {
      const expanded = parseLocationRange(token);
      if (expanded) {
        expanded.forEach(loc => {
          if (!shelf.locations.includes(loc)) shelf.locations.push(loc);
        });
        return;
      }
    }
    // Otherwise treat as a single location
    if (!shelf.locations.includes(token)) shelf.locations.push(token);
  });

  autoNameToHighest(shelf);
  input.value = '';
  renderAll();
}

function clearLocations() {
  const shelf = getSelectedShelf();
  if (!shelf || !shelf.locations || shelf.locations.length === 0) return;
  saveState();
  shelf.locations = null;
  renderAll();
}

function removeLocation(index) {
  const shelf = getSelectedShelf();
  if (!shelf || !shelf.locations) return;
  saveState();
  shelf.locations.splice(index, 1);
  if (shelf.locations.length < 2) {
    // If one left, keep name as that one
    if (shelf.locations.length === 1) shelf.name = shelf.locations[0];
    shelf.locations = null;
  } else {
    autoNameToHighest(shelf);
  }
  renderAll();
}

function updateAngle(deg) {
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) return;
  saveState();
  deg = Math.max(-90, Math.min(90, deg));
  shelf.orientation = 'A';
  shelf.angle = deg;
  document.getElementById('propAngle').value = shelf.angle;
  document.getElementById('propAngleSlider').value = shelf.angle;
  renderAngleQuickPicks(shelf.angle);
  renderAll();
}

function renderAngleQuickPicks(activeAngle) {
  const container = document.getElementById('angleQuickPicks');
  container.innerHTML = '';
  const angles = [-90,-75,-60,-45,-30,-15,15,30,45,60,75,90];
  angles.forEach(a => {
    const btn = document.createElement('button');
    btn.textContent = (a > 0 ? '+' : '') + a + '°';
    btn.style.cssText = 'padding:2px 5px;font-size:9px;font-family:var(--font-mono);border:1px solid var(--border);border-radius:3px;cursor:pointer;transition:all 0.15s;';
    btn.style.background = a === activeAngle ? 'var(--accent-dim)' : 'var(--bg-input)';
    btn.style.color = a === activeAngle ? 'var(--accent)' : 'var(--text-dim)';
    btn.onclick = () => updateAngle(a);
    container.appendChild(btn);
  });
}

function rotateBy45() {
  if (!state.selectedIds.length) return;
  saveState();
  state.selectedIds.forEach(id => {
    const s = state.shelves.find(x => x.id === id);
    if (!s) return;

    if (s.type === 'custom') {
      // Custom shelves: just increment angle by 15°
      let cur = s.angle || 0;
      let next = cur + 15;
      if (next > 90) next = -90;
      s.angle = next === 0 ? null : next;
      s.orientation = next === 0 ? 'H' : 'A';
      return;
    }

    // Get effective visual angle (H=0, V=90, A=angle)
    let cur = s.orientation === 'V' ? 90 : s.orientation === 'A' ? (s.angle || 0) : 0;
    let next = cur + 15;
    // Wrap: past 90 goes back to H (0)
    if (next > 90) { s.orientation = 'H'; s.angle = null; }
    else if (next === 0) { s.orientation = 'H'; s.angle = null; }
    else if (next === 90) { s.orientation = 'V'; s.angle = null; }
    else { s.orientation = 'A'; s.angle = next; }
  });
  renderAll(); hideContextMenu();
}

function highlightRelated() {
  hideContextMenu();
  if (state.selectedIds.length !== 1) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (shelf && shelf.name) { state.highlightedName = shelf.name; renderAll(); }
}

// ═══════════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════════

let editingDeptId = null;

function populateParentSelect(selectedParent) {
  const sel = document.getElementById('deptParentInput');
  sel.innerHTML = '<option value="">(Standalone)</option>';
  state.deptGroups.forEach(g => {
    sel.innerHTML += `<option value="${g.id}"${selectedParent === g.id ? ' selected' : ''}>${g.name}</option>`;
  });
  sel.innerHTML += '<option value="__new__">+ New Group...</option>';
}

function addDepartment() {
  editingDeptId = null;
  document.getElementById('deptModalTitle').textContent = 'Add Sub-Department';
  document.getElementById('deptNameInput').value = '';
  document.getElementById('deptColorInput').value = '#4a9eff';
  document.getElementById('deptColorHex').value = '#4a9eff';
  document.getElementById('deptModalSave').textContent = 'Add';
  populateParentSelect('');
  document.getElementById('deptModal').classList.add('visible');
  document.getElementById('deptNameInput').focus();
}

function editDepartment(id) {
  const dept = state.departments.find(d => d.id === id);
  if (!dept) return;
  editingDeptId = id;
  document.getElementById('deptModalTitle').textContent = 'Edit Department';
  document.getElementById('deptNameInput').value = dept.name;
  document.getElementById('deptColorInput').value = dept.color;
  document.getElementById('deptColorHex').value = dept.color;
  document.getElementById('deptModalSave').textContent = 'Save';
  populateParentSelect(dept.parent || '');
  document.getElementById('deptModal').classList.add('visible');
}

function closeDeptModal() { document.getElementById('deptModal').classList.remove('visible'); }

function saveDepartment() {
  const name = document.getElementById('deptNameInput').value.trim();
  const color = document.getElementById('deptColorInput').value;
  let parent = document.getElementById('deptParentInput').value;
  if (!name) return;

  // Create new group if requested
  if (parent === '__new__') {
    const gName = prompt('New group name (e.g. Home, Clothing):');
    if (!gName) return;
    const gId = gName.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    if (!state.deptGroups.find(g => g.id === gId)) {
      state.deptGroups.push({ id: gId, name: gName });
    }
    parent = gId;
  }

  if (editingDeptId) {
    const d = state.departments.find(x => x.id === editingDeptId);
    if (d) { d.name = name; d.color = color; d.parent = parent || null; }
  } else {
    const id = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    state.departments.push({ id, name, color, parent: parent || null });
  }
  closeDeptModal(); renderAll();
}

document.getElementById('deptColorInput').addEventListener('input', e => document.getElementById('deptColorHex').value = e.target.value);
document.getElementById('deptColorHex').addEventListener('input', e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) document.getElementById('deptColorInput').value = e.target.value; });

// ═══════════════════════════════════════════════════════════
// UNDERLAY
// ═══════════════════════════════════════════════════════════

function loadUnderlay(event) {
  const f = event.target.files[0]; if (!f) return;
  const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (isPdf) { loadUnderlayPdf(f); return; }
  // hide PDF page nav for plain images
  _pdfDoc = null; updatePdfPageNav();
  const r = new FileReader();
  r.onload = e => {
    cancelDetect();
    state.underlay = e.target.result;
    state.underlayX = 0; state.underlayY = 0; state.underlayScale = 1.87;
    document.getElementById('underlayScale').value = 187;
    document.getElementById('scaleValue').textContent = '187%';
    document.getElementById('underlayPosX').value = 0;
    document.getElementById('underlayPosY').value = 0;
    renderUnderlay();
    document.getElementById('underlayDrop').classList.add('has-image');
    document.querySelector('.underlay-drop-text').innerHTML = `<strong>${f.name}</strong><br>Click to replace`;
  };
  r.readAsDataURL(f);
}

// ── PDF underlay (rendered client-side via pdf.js; the file never leaves the browser) ──
let _pdfDoc = null, _pdfPage = 1, _pdfName = '';
function loadUnderlayPdf(f) {
  if (typeof pdfjsLib === 'undefined') { alert('PDF support is still loading — please try again in a moment.'); return; }
  _pdfName = f.name;
  document.querySelector('.underlay-drop-text').innerHTML = `<strong>${f.name}</strong><br>Rendering PDF…`;
  const r = new FileReader();
  r.onload = e => {
    pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise.then(doc => {
      _pdfDoc = doc; _pdfPage = 1;
      updatePdfPageNav();
      renderPdfPageToUnderlay(1);
    }).catch(err => {
      console.error('PDF read failed:', err);
      alert('Could not read that PDF: ' + (err && err.message ? err.message : err));
      document.querySelector('.underlay-drop-text').innerHTML = '<strong>Click to upload</strong> or drag &amp; drop<br><span style="font-size:9px;opacity:0.6">image or PDF</span>';
    });
  };
  r.readAsArrayBuffer(f);
}

function renderPdfPageToUnderlay(pageNum) {
  if (!_pdfDoc) return;
  _pdfDoc.getPage(pageNum).then(page => {
    const base = page.getViewport({ scale: 1 });
    // Cap the longest side ~2400px — crisp for tracing, reasonable data-URL size.
    const scale = Math.max(1, Math.min(3, 2400 / Math.max(base.width, base.height)));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // PDFs are often transparent
    page.render({ canvasContext: ctx, viewport: vp }).promise.then(() => {
      cancelDetect();
      state.underlay = canvas.toDataURL('image/jpeg', 0.85); // JPEG keeps the draft size sane
      state.underlayX = 0; state.underlayY = 0; state.underlayScale = 1.87;
      document.getElementById('underlayScale').value = 187;
      document.getElementById('scaleValue').textContent = '187%';
      document.getElementById('underlayPosX').value = 0;
      document.getElementById('underlayPosY').value = 0;
      renderUnderlay();
      document.getElementById('underlayDrop').classList.add('has-image');
      var np = _pdfDoc.numPages;
      document.querySelector('.underlay-drop-text').innerHTML =
        `<strong>${_pdfName}</strong>` + (np > 1 ? ` · page ${pageNum}/${np}` : '') + `<br>Click to replace`;
      if (typeof markDirty === 'function') markDirty();
    });
  }).catch(err => { console.error('PDF page render failed:', err); });
}

function updatePdfPageNav() {
  var nav = document.getElementById('underlayPdfNav');
  if (!nav) return;
  if (_pdfDoc && _pdfDoc.numPages > 1) {
    nav.style.display = 'flex';
    var lbl = document.getElementById('underlayPdfPageLabel');
    if (lbl) lbl.textContent = 'Page ' + _pdfPage + ' / ' + _pdfDoc.numPages;
  } else {
    nav.style.display = 'none';
  }
}
function pdfPrevPage() { if (_pdfDoc && _pdfPage > 1) { _pdfPage--; updatePdfPageNav(); renderPdfPageToUnderlay(_pdfPage); } }
function pdfNextPage() { if (_pdfDoc && _pdfPage < _pdfDoc.numPages) { _pdfPage++; updatePdfPageNav(); renderPdfPageToUnderlay(_pdfPage); } }

// ── "Set Scale" calibration: click two points + enter the real distance → rescale underlay ──
let calOn = false, calA = null, calB = null;
function calGroupEl() {
  var g = document.getElementById('calLayer');
  if (!g) {
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'calLayer'; g.setAttribute('pointer-events', 'none');
    if (shelvesGroup && shelvesGroup.parentNode) shelvesGroup.parentNode.appendChild(g);
  }
  return g;
}
function clearCalMarkers() { var g = document.getElementById('calLayer'); if (g) g.innerHTML = ''; }
function drawCalMarker(x, y) {
  var g = calGroupEl(), z = state.zoom || 1;
  var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 6 / z);
  c.setAttribute('fill', 'var(--accent)'); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 1.5 / z);
  g.appendChild(c);
}
function drawCalLine(a, b) {
  var g = calGroupEl(), z = state.zoom || 1;
  var l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', a.x); l.setAttribute('y1', a.y); l.setAttribute('x2', b.x); l.setAttribute('y2', b.y);
  l.setAttribute('stroke', 'var(--accent)'); l.setAttribute('stroke-width', 2 / z);
  l.setAttribute('stroke-dasharray', (5 / z) + ' ' + (4 / z));
  g.appendChild(l);
}
function startSetScale() {
  if (!state.underlay) { alert('Add a floor-plan underlay (image or PDF) first.'); return; }
  calOn = true; calA = null; calB = null; clearCalMarkers();
  document.getElementById('calScaleBox').style.display = 'block';
  document.getElementById('calScaleInputRow').style.display = 'none';
  document.getElementById('calScaleHint').textContent = 'Click the FIRST point on the plan (a known distance, e.g. a dimension line).';
  document.getElementById('setScaleBtn').style.display = 'none';
  if (canvasContainer) canvasContainer.style.cursor = 'crosshair';
}
function cancelSetScale() {
  calOn = false; calA = null; calB = null; clearCalMarkers();
  document.getElementById('calScaleBox').style.display = 'none';
  document.getElementById('setScaleBtn').style.display = '';
  if (canvasContainer) canvasContainer.style.cursor = '';
}
function handleScaleClick(x, y) {
  if (!calA) {
    calA = { x: x, y: y }; drawCalMarker(x, y);
    document.getElementById('calScaleHint').textContent = 'Now click the SECOND point.';
  } else if (!calB) {
    calB = { x: x, y: y }; drawCalMarker(x, y); drawCalLine(calA, calB);
    document.getElementById('calScaleHint').textContent = 'Enter the real distance between those two points:';
    document.getElementById('calScaleInputRow').style.display = 'flex';
    var di = document.getElementById('calScaleDist'); if (di) di.focus();
    calOn = false;                                   // pause click capture while awaiting input
    if (canvasContainer) canvasContainer.style.cursor = '';
  }
}
function applyScaleCalibration() {
  if (!calA || !calB) return;
  var val = parseFloat(document.getElementById('calScaleDist').value);
  if (!(val > 0)) { alert('Enter a distance greater than 0.'); return; }
  var unit = document.getElementById('calScaleUnit').value;
  var perUnit = unit === 'module' ? state.moduleWidth : state.gridSize;   // m & grid: 1 unit → 1 grid square
  var target = val * perUnit;
  var cur = Math.hypot(calB.x - calA.x, calB.y - calA.y);
  if (cur < 1e-6) { alert('Those points are too close together — try again.'); cancelSetScale(); return; }
  var f = target / cur;
  // Scale the underlay around point A so A stays put and A→B becomes the target distance.
  state.underlayX = calA.x - f * (calA.x - state.underlayX);
  state.underlayY = calA.y - f * (calA.y - state.underlayY);
  state.underlayScale = state.underlayScale * f;
  var pct = Math.round(state.underlayScale * 100);
  var sl = document.getElementById('underlayScale'); if (sl) sl.value = pct;
  var sv = document.getElementById('scaleValue'); if (sv) sv.textContent = pct + '%';
  renderUnderlay();
  if (unit === 'm') state.metresPerUnit = val / target;   // real-world scale (m per content unit)
  if (typeof markDirty === 'function') markDirty();
  clearCalMarkers();
  var label = unit === 'module' ? 'bays' : (unit === 'grid' ? 'grid squares' : 'm');
  document.getElementById('calScaleHint').textContent = '✓ Scale set — ' + val + ' ' + label + ' across. Underlay now ' + pct + '%.';
  document.getElementById('calScaleInputRow').style.display = 'none';
  document.getElementById('setScaleBtn').style.display = '';
  calA = null; calB = null;
}

// ══════════════════════════════════════════════════════════════════
// Store Audit Checklist — capture everything in-store before mapping
// ══════════════════════════════════════════════════════════════════
const AUDIT_TEMPLATE = [
  { title: 'Store details', items: [
    { id: 'sd_number', label: 'Store number & name confirmed' },
    { id: 'sd_address', label: 'Full address (street, suburb, state, postcode)' },
    { id: 'sd_hours', label: 'Opening hours — per day' },
    { id: 'sd_holidays', label: 'Public holiday hours' },
    { id: 'sd_orientation', label: 'Store orientation (normal vs flipped — which way entrance faces)' },
    { id: 'sd_format', label: 'Store format / plan & size (m²)' },
    { id: 'sd_gps', label: 'GPS location (pin the store)' },
    { id: 'sd_parking', label: 'Staff parking location' }
  ]},
  { title: 'Front of House layout', items: [
    { id: 'foh_numbering', label: 'Aisle / bay numbering scheme' },
    { id: 'foh_depts', label: 'Department zones & locations (Home, Clothing, Kids, Flex…)' },
    { id: 'foh_aisles', label: 'Number of aisles per department' },
    { id: 'foh_bays', label: 'Bays / runs per aisle' },
    { id: 'foh_fixtures', label: 'Fixture types (gondola, end-cap, table, hangers…)' },
    { id: 'foh_checkouts', label: 'Checkout locations' },
    { id: 'foh_entrance', label: 'Entrance / exit locations' }
  ]},
  { title: 'Back of House / stockroom', items: [
    { id: 'boh_layout', label: 'Stockroom layout' },
    { id: 'boh_numbering', label: 'Bay / rack numbering' },
    { id: 'boh_dock', label: 'Receiving dock location' },
    { id: 'boh_areas', label: 'Notable BOH areas (cool room, baler, offices…)' }
  ]},
  { title: 'Emergency equipment', items: [
    { id: 'em_exits', label: 'Fire exits / evacuation routes' },
    { id: 'em_ext', label: 'Fire extinguishers' },
    { id: 'em_hose', label: 'Fire hose reels' },
    { id: 'em_aed', label: 'AED / defibrillator' },
    { id: 'em_firstaid', label: 'First aid kit(s)' },
    { id: 'em_spill', label: 'Spill kit(s)' },
    { id: 'em_assembly', label: 'Emergency assembly point' }
  ]},
  { title: 'Measurements & scale', items: [
    { id: 'ms_overall', label: 'Overall store dimensions' },
    { id: 'ms_ref', label: 'A known reference dimension (for Set Scale)' },
    { id: 'ms_aisle', label: 'Aisle widths' },
    { id: 'ms_bay', label: 'Bay / module width' }
  ]},
  { title: 'Reference material', items: [
    { id: 'ref_pdf', label: 'Floor plan PDF on hand' },
    { id: 'ref_photos', label: 'Photos taken (entrance, key areas, signage)' },
    { id: 'ref_notes', label: 'Quirks / other notes' }
  ]}
];
function auditTotalItems() { return AUDIT_TEMPLATE.reduce((n, s) => n + s.items.length, 0); }
function ensureAudit() { if (!state.audit) state.audit = { items: {} }; if (!state.audit.items) state.audit.items = {}; return state.audit; }
function auditItem(id) { var a = ensureAudit(); return a.items[id] || { c: false, n: '' }; }
function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function openAuditModal() {
  ensureAudit();
  var sn = document.getElementById('storeNumber') ? document.getElementById('storeNumber').value : '';
  var nm = document.getElementById('storeName') ? document.getElementById('storeName').value : '';
  var t = document.getElementById('auditStoreTitle');
  if (t) t.textContent = (sn || nm) ? ((sn ? sn + ' ' : '') + (nm || '')).trim() : 'Store audit';
  renderAudit();
  document.getElementById('auditModal').classList.add('visible');
}
function closeAuditModal() { document.getElementById('auditModal').classList.remove('visible'); }
function renderAudit() {
  var body = document.getElementById('auditBody'); if (!body) return;
  body.innerHTML = AUDIT_TEMPLATE.map(function (sec) {
    var rows = sec.items.map(function (it) {
      var st = auditItem(it.id);
      return '<div class="audit-item' + (st.c ? ' done' : '') + '">' +
        '<label class="audit-check"><input type="checkbox" ' + (st.c ? 'checked' : '') +
          ' data-onchange="toggleAuditItem" data-id="' + escAttr(it.id) + '"><span class="audit-box"></span>' +
          '<span class="audit-label">' + it.label + '</span></label>' +
        '<input type="text" class="audit-note" value="' + escAttr(st.n) + '" placeholder="notes / value…" ' +
          'data-oninput="setAuditNote" data-id="' + escAttr(it.id) + '"></div>';
    }).join('');
    var done = sec.items.filter(function (it) { return auditItem(it.id).c; }).length;
    return '<div class="audit-section"><div class="audit-sec-head">' + sec.title +
      '<span class="audit-sec-count">' + done + '/' + sec.items.length + '</span></div>' + rows + '</div>';
  }).join('');
  updateAuditProgress();
}
function updateAuditProgress() {
  var a = ensureAudit();
  var done = Object.keys(a.items).filter(function (k) { return a.items[k] && a.items[k].c; }).length;
  var total = auditTotalItems();
  var bar = document.getElementById('auditProgressBar'); if (bar) bar.style.width = (total ? (done / total * 100) : 0) + '%';
  var lbl = document.getElementById('auditProgressLabel'); if (lbl) lbl.textContent = done + ' / ' + total + ' captured';
  // refresh section counts without re-rendering inputs
  document.querySelectorAll('.audit-section').forEach(function (secEl, i) {
    var sec = AUDIT_TEMPLATE[i]; if (!sec) return;
    var d = sec.items.filter(function (it) { return auditItem(it.id).c; }).length;
    var c = secEl.querySelector('.audit-sec-count'); if (c) c.textContent = d + '/' + sec.items.length;
  });
}
function toggleAuditItem(id, checked) {
  var a = ensureAudit(); a.items[id] = a.items[id] || { c: false, n: '' }; a.items[id].c = !!checked;
  var row = document.querySelector('.audit-item input[onchange*="\'' + id + '\'"]');
  if (row) row.closest('.audit-item').classList.toggle('done', !!checked);
  updateAuditProgress(); if (typeof markDirty === 'function') markDirty();
}
function setAuditNote(id, val) {
  var a = ensureAudit(); a.items[id] = a.items[id] || { c: false, n: '' }; a.items[id].n = val;
  if (typeof markDirty === 'function') markDirty();
}
function resetAudit() {
  if (!confirm('Clear all audit checkboxes and notes for this store?')) return;
  state.audit = { items: {} }; renderAudit(); if (typeof markDirty === 'function') markDirty();
}

// In-store PDF reference (in-memory; not saved with the draft)
let _auditPdfUrl = null;
function attachAuditPdf(ev) {
  var f = ev.target.files[0]; if (!f) return;
  if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { alert('Please choose a PDF.'); return; }
  if (_auditPdfUrl) { try { URL.revokeObjectURL(_auditPdfUrl); } catch(e){} }
  _auditPdfUrl = URL.createObjectURL(f);
  document.getElementById('auditPdfName').textContent = f.name;
  document.getElementById('auditPdfView').style.display = '';
  // mark the checklist item + render a thumbnail
  toggleAuditItem('ref_pdf', true);
  var cb = document.querySelector('.audit-item input[onchange*="ref_pdf"]'); if (cb) cb.checked = true;
  if (typeof pdfjsLib !== 'undefined') {
    var r = new FileReader();
    r.onload = function (e) {
      pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise.then(function (doc) {
        return doc.getPage(1);
      }).then(function (page) {
        var vp = page.getViewport({ scale: 1 });
        var sc = Math.min(1.2, 240 / Math.max(vp.width, vp.height));
        var v = page.getViewport({ scale: sc });
        var cv = document.getElementById('auditPdfThumb');
        cv.width = v.width; cv.height = v.height; cv.style.display = 'block';
        var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        page.render({ canvasContext: ctx, viewport: v });
      }).catch(function (err) { console.warn('audit pdf thumb failed', err); });
    };
    r.readAsArrayBuffer(f);
  }
}
function viewAuditPdf() { if (_auditPdfUrl) window.open(_auditPdfUrl, '_blank', 'noopener'); }

// v0.262: Post-mapping shelf-verification checklist (printable). Distinct from the
// pre-mapping Store Audit Checklist (printAudit) — this is generated from the actual
// MAPPED shelves so you can walk the finished store and tick off that each shelf exists
// and is correctly named/placed. Grouped by department, across all floors, A4 portrait.
function printShelfChecklist() {
  if (typeof syncCurrentFloor === 'function') syncCurrentFloor();
  var sn = document.getElementById('storeNumber') ? document.getElementById('storeNumber').value : '';
  var nm = document.getElementById('storeName') ? document.getElementById('storeName').value : '';
  var floors = (state.floors && state.floors.length) ? state.floors
    : [{ id: state.currentFloorId || 'main', name: '', data: { shelves: state.shelves } }];

  function deptName(id) { var d = (state.departments || []).find(function (x) { return x.id === id; }); return d ? d.name : (id || 'Unassigned'); }
  function deptColor(id) { var d = (state.departments || []).find(function (x) { return x.id === id; }); return d ? d.color : '#64748b'; }

  var floorHtml = floors.map(function (f) {
    var shelves = ((f.data && f.data.shelves) || []).filter(function (s) { return s.name; }); // named shelves only
    if (!shelves.length) return '';
    // group by department id
    var byDept = {};
    shelves.forEach(function (s) { var k = s.dept || ''; (byDept[k] = byDept[k] || []).push(s); });
    // order depts by their position in state.departments, then any leftovers
    var deptIds = Object.keys(byDept).sort(function (a, b) {
      var ia = (state.departments || []).findIndex(function (d) { return d.id === a; });
      var ib = (state.departments || []).findIndex(function (d) { return d.id === b; });
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    var secs = deptIds.map(function (did) {
      var list = byDept[did].slice().sort(function (a, b) { return fullName(a).localeCompare(fullName(b), undefined, { numeric: true }); });
      var rows = list.map(function (s) {
        var loc = (s.locations && s.locations.length) ? s.locations.join(', ') : '';
        var fixture = s.fixture ? s.fixture : '';
        var hint = [loc, fixture].filter(Boolean).join(' · ');
        return '<tr><td class="chk">\u2610</td><td class="nm">' + escAttr(fullName(s)) +
          '</td><td class="hint">' + escAttr(hint) + '</td><td class="note"></td></tr>';
      }).join('');
      return '<tr class="sec"><td colspan="4"><span class="dot" style="background:' + deptColor(did) + '"></span>' +
        escAttr(deptName(did)) + ' <span class="cnt">(' + list.length + ')</span></td></tr>' + rows;
    }).join('');
    var floorLabel = f.name ? (' \u2014 ' + escAttr(f.name)) : '';
    return '<div class="floor"><h2>Floor: ' + (escAttr(f.name) || escAttr(f.id)) + ' <span class="cnt">(' + shelves.length + ' shelves)</span></h2>' +
      '<table><thead><tr><th class="chk">\u2713</th><th>Shelf</th><th>Location hint</th><th class="note">Notes</th></tr></thead><tbody>' +
      secs + '</tbody></table></div>';
  }).join('');

  if (!floorHtml.trim()) { alert('No named shelves to print yet. Name some shelves first.'); return; }

  var w = window.open('', '_blank');
  w.document.write('<!doctype html><html><head><title>Shelf Checklist \u2014 ' + escAttr(sn + ' ' + nm) +
    '</title><style>@page{size:A4 portrait;margin:14mm}body{font-family:Arial,sans-serif;margin:0;color:#111}' +
    'h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;page-break-after:avoid}' +
    '.sub{font-size:11px;color:#666;margin-bottom:8px}' +
    'table{width:100%;border-collapse:collapse;margin-top:4px}' +
    'th,td{border:1px solid #ccc;padding:6px 8px;font-size:11px;vertical-align:top;text-align:left}' +
    'th{background:#f0f0f0;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}' +
    'tr.sec td{background:#222;color:#fff;font-weight:bold;font-size:11px;letter-spacing:0.5px;text-transform:uppercase}' +
    'tr.sec .cnt{opacity:0.6;font-weight:normal}.dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:middle}' +
    'td.chk,th.chk{width:24px;text-align:center;font-size:15px}td.nm{font-weight:bold;width:22%}td.hint{color:#555;width:34%}td.note{width:30%}' +
    'tr{page-break-inside:avoid}.floor{page-break-before:always}.floor:first-child{page-break-before:avoid}' +
    '</style></head><body><h1>Shelf Verification Checklist \u2014 ' + escAttr((sn ? sn + ' ' : '') + nm) +
    '</h1><div class="sub">Walk the store and tick each shelf that is present &amp; correctly labelled. Printed ' +
    new Date().toLocaleDateString() + '</div>' + floorHtml + '</body></html>');
  w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
}

function printAudit() {
  var sn = document.getElementById('storeNumber') ? document.getElementById('storeNumber').value : '';
  var nm = document.getElementById('storeName') ? document.getElementById('storeName').value : '';
  var rows = AUDIT_TEMPLATE.map(function (sec) {
    var items = sec.items.map(function (it) {
      var st = auditItem(it.id);
      return '<tr><td class="chk">' + (st.c ? '☑' : '☐') + '</td><td>' + it.label +
        '</td><td class="note">' + escAttr(st.n) + '</td></tr>';
    }).join('');
    return '<tr class="sec"><td colspan="3">' + sec.title + '</td></tr>' + items;
  }).join('');
  var w = window.open('', '_blank');
  w.document.write('<!doctype html><html><head><title>Store Audit — ' + escAttr(sn + ' ' + nm) +
    '</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px}' +
    'table{width:100%;border-collapse:collapse;margin-top:10px}td{border:1px solid #ccc;padding:7px 9px;font-size:12px;vertical-align:top}' +
    'tr.sec td{background:#222;color:#fff;font-weight:bold;font-size:12px;letter-spacing:0.5px;text-transform:uppercase}' +
    'td.chk{width:26px;text-align:center;font-size:15px}td.note{width:40%;color:#555;min-height:20px}' +
    '</style></head><body><h1>Store Audit Checklist — ' + escAttr((sn ? sn + ' ' : '') + nm) +
    '</h1><div style="font-size:11px;color:#666">Printed ' + new Date().toLocaleDateString() +
    '</div><table>' + rows + '</table></body></html>');
  w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
}

function renderUnderlay() {
  underlayGroup.innerHTML = '';
  if (!state.underlay) return;
  const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  img.classList.add('underlay-image'); img.setAttribute('href', state.underlay);
  img.setAttribute('x', 0); img.setAttribute('y', 0);
  img.setAttribute('opacity', state.underlayOpacity);
  img.setAttribute('transform', `translate(${state.underlayX}, ${state.underlayY}) scale(${state.underlayScale})`);
  img.id = 'underlayImg';
  if (underlayAdjustMode) { img.style.pointerEvents = 'all'; img.style.cursor = 'move'; }
  underlayGroup.appendChild(img);
}

function updateUnderlayTransform() {
  const i = document.getElementById('underlayImg');
  if (i) i.setAttribute('transform', `translate(${state.underlayX}, ${state.underlayY}) scale(${state.underlayScale})`);
  if (typeof _detect !== 'undefined' && _detect) renderDetectPreview(); // keep detection preview glued to the plan
}

function setUnderlayOpacity(v) { state.underlayOpacity = v/100; document.getElementById('opacityValue').textContent = v+'%'; const i = document.getElementById('underlayImg'); if (i) i.setAttribute('opacity', state.underlayOpacity); }
function setUnderlayScale(v) {
  v = Math.max(10, Math.min(400, Math.round(+v)));
  state.underlayScale = v/100;
  document.getElementById('scaleValue').textContent = v+'%';
  document.getElementById('underlayScale').value = v;
  updateUnderlayTransform();
}

function setUnderlayPos(x, y) {
  state.underlayX = x; state.underlayY = y;
  document.getElementById('underlayPosX').value = Math.round(x);
  document.getElementById('underlayPosY').value = Math.round(y);
  updateUnderlayTransform();
}

function nudgeUnderlay(dx, dy) {
  setUnderlayPos(state.underlayX + dx, state.underlayY + dy);
}

// ── Underlay Mouse Adjust Mode ──
let underlayAdjustMode = false;
let isDraggingUnderlay = false;
let underlayDragStart = null;

function toggleUnderlayAdjust() {
  underlayAdjustMode = !underlayAdjustMode;
  const btn = document.getElementById('underlayAdjustBtn');
  const hint = document.getElementById('underlayAdjustHint');
  if (underlayAdjustMode) {
    btn.style.background = 'var(--accent)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--accent)';
    btn.innerHTML = '🖱️ Mouse Adjust: <strong>ON</strong>';
    hint.style.display = '';
    // Make underlay interactive
    const img = document.getElementById('underlayImg');
    if (img) { img.style.pointerEvents = 'all'; img.style.cursor = 'move'; }
  } else {
    btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = '';
    btn.innerHTML = '🖱️ Mouse Adjust: OFF';
    hint.style.display = 'none';
    const img = document.getElementById('underlayImg');
    if (img) { img.style.pointerEvents = 'none'; img.style.cursor = ''; }
  }
}

function removeUnderlay() {
  cancelDetect();
  state.underlay = null; state.underlayX = 0; state.underlayY = 0; state.underlayScale = 1.87;
  _pdfDoc = null; _pdfPage = 1; updatePdfPageNav();
  underlayGroup.innerHTML = '';
  document.getElementById('underlayDrop').classList.remove('has-image');
  document.querySelector('.underlay-drop-text').innerHTML = '<strong>Click to upload</strong> or drag &amp; drop<br><span style="font-size:9px;opacity:0.6">image or PDF</span>';
  document.getElementById('underlayFile').value = '';
  document.getElementById('underlayPosX').value = 0;
  document.getElementById('underlayPosY').value = 0;
  document.getElementById('underlayScale').value = 187;
  document.getElementById('scaleValue').textContent = '187%';
  if (underlayAdjustMode) toggleUnderlayAdjust();
}

const underlayDrop = document.getElementById('underlayDrop');
underlayDrop.addEventListener('dragover', e => { e.preventDefault(); underlayDrop.style.borderColor = 'var(--accent)'; });
underlayDrop.addEventListener('dragleave', () => underlayDrop.style.borderColor = '');
underlayDrop.addEventListener('drop', e => {
  e.preventDefault(); underlayDrop.style.borderColor = '';
  const f = e.dataTransfer.files[0];
  if (f && (f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) { loadUnderlay({ target: { files: [f] } }); }
});

// ═══════════════════════════════════════════════════════════
// AUTO-DETECT SHELVES FROM UNDERLAY (v0.419)
// Analyses the floor-plan image client-side (nothing leaves the
// browser) and proposes shelf rectangles the user reviews before
// they become real shelves. Two complementary strategies:
//   A. "Enclosed interiors" — flood-fills the background from the
//      image border; any white region still unreached is enclosed
//      by ink (an outlined shelf/fixture) → candidate box.
//   B. "Solid blocks" — connected dark/filled regions whose pixels
//      mostly fill their bounding box (filled shelf symbols).
// Candidate boxes are stored in IMAGE pixels and projected through
// the live underlay transform, so moving/rescaling the underlay
// while reviewing keeps the preview glued to the plan.
// ═══════════════════════════════════════════════════════════

// Conduit: what a found run becomes is shared/detect.js (window.DetectCore,
// loaded by detect-boot.js): bays snapped to the store's module sizes,
// learned from the bay dividers the plan draws; two-deep runs split into
// S1/S2; end caps become E1/E2; and shapes already under drawn shelves are
// set aside, so a second pass over a part-drawn floor shows what is missing.
let _detect = null; // { cands: [{ix,iy,iw,ih,included,covered,parts}], imgW, imgH, learned, covered, nextIdx }
const DETECT_MAX_SIDE = 1800;   // analysis resolution cap (px)
const DETECT_FILL_RATIO = 0.62; // how "rectangular" a region must be

function detectGroupEl() {
  let g = document.getElementById('detectGroup');
  if (!g) {
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'detectGroup';
    canvasTransform.appendChild(g);
  }
  return g;
}

function detectParams() {
  return {
    threshold: +(document.getElementById('detectThreshold')?.value || 190),
    minSide: +(document.getElementById('detectMinSide')?.value || 10),
    maxSide: +(document.getElementById('detectMaxSide')?.value || 1600),
    merge: !!document.getElementById('detectMerge')?.checked,
    createAs: document.getElementById('detectCreateAs')?.value || 'auto',
    split: document.getElementById('detectSplit')?.checked !== false,
    sizes: window.DetectCore ? window.DetectCore.parseSizes(document.getElementById('detectSizes')?.value) : [],
  };
}

function detectSetStatus(msg, isError) {
  const el = document.getElementById('detectStatus');
  if (el) { el.textContent = msg || ''; el.style.color = isError ? 'var(--danger)' : 'var(--text-dim)'; }
}

function runShelfDetection() {
  if (!state.underlay) { alert('Add a floor-plan underlay (image or PDF) first — detection runs on that image.'); return; }
  detectSetStatus('Analysing floor plan…');
  const img = new Image();
  img.onload = () => {
    try { detectShelvesFromImage(img); }
    catch (err) { console.error('Shelf detection failed:', err); detectSetStatus('Detection failed: ' + (err && err.message ? err.message : err), true); }
  };
  img.onerror = () => detectSetStatus('Could not read the underlay image.', true);
  img.src = state.underlay;
}

function detectShelvesFromImage(img) {
  const natW = img.naturalWidth, natH = img.naturalHeight;
  if (!natW || !natH) { detectSetStatus('Underlay image has no size.', true); return; }
  const f = Math.min(1, DETECT_MAX_SIDE / Math.max(natW, natH));
  const W = Math.max(1, Math.round(natW * f)), H = Math.max(1, Math.round(natH * f));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); // transparent PNGs → white bg
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const p = detectParams();

  // 1px "ink" mask: dark OR saturated (dept-coloured fills count as ink)
  const N = W * H;
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (lum < p.threshold || sat > 60) ink[i] = 1;
  }

  // Strategy A: flood-fill background from the border through non-ink,
  // then any non-ink pixel not reached is enclosed by ink.
  const outside = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const pushIfBg = (idx) => { if (!ink[idx] && !outside[idx]) { outside[idx] = 1; stack[sp++] = idx; } };
  for (let x = 0; x < W; x++) { pushIfBg(x); pushIfBg((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { pushIfBg(y * W); pushIfBg(y * W + W - 1); }
  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % W, y = (idx / W) | 0;
    if (x > 0) pushIfBg(idx - 1);
    if (x < W - 1) pushIfBg(idx + 1);
    if (y > 0) pushIfBg(idx - W);
    if (y < H - 1) pushIfBg(idx + W);
  }

  // Connected components over a predicate → bounding boxes + fill ratio
  const visited = new Uint8Array(N);
  function components(pred) {
    const boxes = [];
    for (let start = 0; start < N; start++) {
      if (visited[start] || !pred(start)) continue;
      let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
      visited[start] = 1; stack[0] = start; sp = 1;
      while (sp > 0) {
        const idx = stack[--sp];
        const x = idx % W, y = (idx / W) | 0;
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x > 0 && !visited[idx - 1] && pred(idx - 1)) { visited[idx - 1] = 1; stack[sp++] = idx - 1; }
        if (x < W - 1 && !visited[idx + 1] && pred(idx + 1)) { visited[idx + 1] = 1; stack[sp++] = idx + 1; }
        if (y > 0 && !visited[idx - W] && pred(idx - W)) { visited[idx - W] = 1; stack[sp++] = idx - W; }
        if (y < H - 1 && !visited[idx + W] && pred(idx + W)) { visited[idx + W] = 1; stack[sp++] = idx + W; }
      }
      boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count });
    }
    return boxes;
  }

  const enclosed = components(i => !ink[i] && !outside[i]);   // A: outlined shelf interiors
  visited.fill(0);
  const solid = components(i => ink[i] === 1);                // B: filled blocks

  // Filter + project to canvas units. minSide/maxSide are canvas px so the
  // knobs mean the same thing regardless of image resolution.
  const toCanvas = f * state.underlayScale; // detection px → canvas px (at detect time)
  const imgAreaC = (W * toCanvas) * (H * toCanvas);
  let cands = [];
  function consider(b, src) {
    const wC = b.w * toCanvas, hC = b.h * toCanvas;
    const short = Math.min(wC, hC), long_ = Math.max(wC, hC);
    if (short < p.minSide || long_ > p.maxSide) return;
    if (wC * hC > imgAreaC * 0.4) return;                       // whole salesfloor / page frame
    if (b.count / (b.w * b.h) < DETECT_FILL_RATIO) return;      // not rectangular enough
    // Back to natural-image px so the box survives underlay re-transforms
    const box = { ix: b.x / f, iy: b.y / f, iw: b.w / f, ih: b.h / f };
    cands.push({ ...box, included: true, src, parts: [box] });
  }
  enclosed.forEach(b => consider(b, 'A'));
  solid.forEach(b => consider(b, 'B'));

  // Dedupe overlapping candidates (an outlined shelf can appear in both
  // strategies) — keep the earlier (interior) box.
  cands.sort((a, b) => (a.src === b.src ? (a.iw * a.ih) - (b.iw * b.ih) : (a.src === 'A' ? -1 : 1)));
  const kept = [];
  for (const c of cands) {
    let dup = false;
    for (const k of kept) {
      const ox = Math.max(0, Math.min(c.ix + c.iw, k.ix + k.iw) - Math.max(c.ix, k.ix));
      const oy = Math.max(0, Math.min(c.iy + c.ih, k.iy + k.ih) - Math.max(c.iy, k.iy));
      const inter = ox * oy;
      if (inter / Math.min(c.iw * c.ih, k.iw * k.ih) > 0.75) { dup = true; break; }
    }
    if (!dup) kept.push(c);
  }
  cands = kept;

  // Optional merge pass: official plans often draw every bay divider, which
  // splits one shelf run into many small boxes. Glue axis-aligned neighbours
  // back into runs so module counts come out right.
  if (p.merge) cands = detectMergeRuns(cands, 8 / state.underlayScale); // ~8 canvas px gap, in natural px

  const D = window.DetectCore;
  let learned = [], covered = 0;
  if (D) {
    // The store's bay sizes, from the runs the plan draws with dividers.
    const lens = [];
    cands.forEach(c => {
      if (c.parts.length < 2) return;
      D.runBays(detectBoxToCanvas(c), c.parts.map(detectBoxToCanvas), { shelfDepth: state.shelfDepth }).bays.forEach(b => lens.push(b.len));
    });
    learned = D.learnModuleSizes(lens);
    const sizesEl = document.getElementById('detectSizes');
    if (sizesEl && learned.length && (!sizesEl.value.trim() || sizesEl.dataset.learned === sizesEl.value)) {
      sizesEl.value = learned.join(', ');
      sizesEl.dataset.learned = sizesEl.value;
    }
    // Shapes already under drawn shelves: set aside, not proposed again.
    const drawn = state.shelves.map(getRotatedBounds);
    cands.forEach(c => {
      c.covered = drawn.length > 0 && D.coveredBy(detectBoxToCanvas(c), drawn) >= 0.5;
      if (c.covered) { c.included = false; covered++; }
    });
  }

  _detect = { cands, imgW: natW, imgH: natH, learned, covered, nextIdx: -1 };
  renderDetectPreview();
  updateDetectResultUI();
  const fresh = cands.length - covered;
  detectSetStatus(!cands.length
    ? 'No shelf-like shapes found. Try raising the ink threshold or lowering the min size.'
    : !fresh
      ? 'Every shape found is already drawn.'
      : fresh + ' shape' + (fresh === 1 ? '' : 's') + ' not yet drawn' + (covered ? ' (' + covered + ' already drawn, greyed)' : '') + ' — click boxes on the map to include/exclude, then Add.');
}

// Steps the view through the found shapes no drawn shelf covers yet.
function detectNextMissed() {
  if (!_detect) return;
  const open = _detect.cands.map((c, i) => i).filter(i => !_detect.cands[i].covered);
  if (!open.length) { detectSetStatus('Every shape found is already drawn.'); return; }
  const k = (open.indexOf(_detect.nextIdx) + 1) % open.length;
  _detect.nextIdx = open[k];
  const b = detectBoxToCanvas(_detect.cands[_detect.nextIdx]);
  const c = canvasContainer.getBoundingClientRect();
  state.zoom = Math.min(3, Math.max(0.6, Math.min(c.width, c.height) / (Math.max(b.w, b.h) * 4)));
  state.panX = c.width / 2 - (b.x + b.w / 2) * state.zoom;
  state.panY = c.height / 2 - (b.y + b.h / 2) * state.zoom;
  updateTransform();
  renderDetectPreview();
  detectSetStatus('Missed shape ' + (k + 1) + ' of ' + open.length + (_detect.cands[_detect.nextIdx].included ? '' : ' (excluded)') + '.');
}

function detectMergeRuns(cands, gapNat) {
  let boxes = cands.map(c => ({ ...c }));
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        // horizontal neighbours (similar height, small x-gap, strong y-overlap)
        const gapX = Math.max(a.ix, b.ix) - Math.min(a.ix + a.iw, b.ix + b.iw);
        const gapY = Math.max(a.iy, b.iy) - Math.min(a.iy + a.ih, b.iy + b.ih);
        const ovY = -gapY, ovX = -gapX;
        const hRatio = Math.max(a.ih, b.ih) / Math.max(1, Math.min(a.ih, b.ih));
        const wRatio = Math.max(a.iw, b.iw) / Math.max(1, Math.min(a.iw, b.iw));
        const canH = gapX <= gapNat && ovY >= 0.7 * Math.min(a.ih, b.ih) && hRatio <= 1.35;
        const canV = gapY <= gapNat && ovX >= 0.7 * Math.min(a.iw, b.iw) && wRatio <= 1.35;
        // A bay left over inside a run that already merged around it (one
        // face of a gondola merging before the other).
        const inside = (s, l) => s.ix >= l.ix - gapNat && s.iy >= l.iy - gapNat && s.ix + s.iw <= l.ix + l.iw + gapNat && s.iy + s.ih <= l.iy + l.ih + gapNat;
        if (canH || canV || inside(a, b) || inside(b, a)) {
          const nx = Math.min(a.ix, b.ix), ny = Math.min(a.iy, b.iy);
          const nx2 = Math.max(a.ix + a.iw, b.ix + b.iw), ny2 = Math.max(a.iy + a.ih, b.iy + b.ih);
          boxes[i] = { ix: nx, iy: ny, iw: nx2 - nx, ih: ny2 - ny, included: a.included && b.included, src: a.src, parts: (a.parts || []).concat(b.parts || []) };
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return boxes;
}

function detectBoxToCanvas(c) {
  return {
    x: c.ix * state.underlayScale + state.underlayX,
    y: c.iy * state.underlayScale + state.underlayY,
    w: c.iw * state.underlayScale,
    h: c.ih * state.underlayScale,
  };
}

function renderDetectPreview() {
  const g = detectGroupEl();
  g.innerHTML = '';
  if (!_detect) return;
  _detect.cands.forEach((c, idx) => {
    const b = detectBoxToCanvas(c);
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', b.x); r.setAttribute('y', b.y);
    r.setAttribute('width', b.w); r.setAttribute('height', b.h);
    r.setAttribute('vector-effect', 'non-scaling-stroke');
    r.classList.add('detect-cand');
    if (!c.included) r.classList.add('excluded');
    if (c.covered) r.classList.add('covered');
    if (idx === _detect.nextIdx) r.classList.add('current');
    // Only clickable in Select mode — so Draw/Custom/Split tools can work over
    // the overlay without candidate boxes stealing the click.
    const interactive = state.tool === 'select';
    r.style.pointerEvents = interactive ? 'all' : 'none';
    r.style.cursor = 'pointer';
    r.addEventListener('pointerdown', ev => {
      ev.stopPropagation(); ev.preventDefault();
      c.included = !c.included;
      r.classList.toggle('excluded', !c.included);
      updateDetectResultUI();
    });
    g.appendChild(r);
  });
}

function updateDetectResultUI() {
  const box = document.getElementById('detectResults');
  if (!box) return;
  if (!_detect) { box.style.display = 'none'; return; }
  box.style.display = '';
  const total = _detect.cands.length;
  const inc = _detect.cands.filter(c => c.included).length;
  const lbl = document.getElementById('detectCount');
  if (lbl) lbl.textContent = total + ' found · ' + (_detect.covered ? _detect.covered + ' already drawn · ' : '') + inc + ' selected';
  const learnedEl = document.getElementById('detectLearned');
  if (learnedEl) learnedEl.textContent = _detect.learned && _detect.learned.length
    ? 'Bay sizes on this plan: ' + _detect.learned.join(', ') + '.'
    : 'No repeating bay sizes on this plan; using ' + (detectParams().sizes.join(', ') || state.moduleWidth) + '.';
  const nextBtn = document.getElementById('detectNextBtn');
  if (nextBtn) nextBtn.disabled = total - (_detect.covered || 0) === 0;
  const applyBtn = document.getElementById('detectApplyBtn');
  if (applyBtn) { applyBtn.disabled = inc === 0; applyBtn.textContent = 'Add ' + inc + ' shel' + (inc === 1 ? 'f' : 'ves'); }
}

function detectSetAll(included) {
  if (!_detect) return;
  _detect.cands.forEach(c => { c.included = included && !c.covered; });
  renderDetectPreview();
  updateDetectResultUI();
}

function applyDetectedShelves() {
  if (!_detect) return;
  const inc = _detect.cands.filter(c => c.included);
  if (!inc.length) return;
  const p = detectParams();
  saveState();
  const defaultDept = state.departments.find(d => d.id !== 'stockroom')?.id || '';
  const newIds = [];
  inc.forEach(c => {
    const b = detectBoxToCanvas(c);
    const isV = b.h > b.w;
    const len = isV ? b.h : b.w;
    const short = isV ? b.w : b.h;
    // "auto": standard modular shelf when the box has shelf-like proportions,
    // exact-size custom shelf for everything else (tables, odd fixtures).
    const shelfLike = short >= state.shelfDepth * 0.45 && short <= state.shelfDepth * 2.2 && len >= state.moduleWidth * 0.8;
    const asStandard = p.createAs === 'standard' || (p.createAs === 'auto' && shelfLike);
    let shelf;
    const D = window.DetectCore;
    if (asStandard && D) {
      // Bays at the store's sizes, faces S1/S2, end caps E1/E2. A size or
      // depth within a hair of the editor's global stays null (follows it).
      const specs = D.planRun(b, (c.parts || [c]).map(detectBoxToCanvas), {
        shelfDepth: state.shelfDepth, sizes: p.sizes.length ? p.sizes : [state.moduleWidth], sides: p.split, ends: p.split,
      });
      specs.forEach(sp => {
        const s = {
          id: 'shelf_' + state.nextId++,
          name: '', subname: sp.subname,
          x: sp.x, y: sp.y,
          dept: defaultDept,
          orientation: sp.orientation,
          modules: sp.modules,
          angle: null,
          bayW: Math.abs(sp.bayW - state.moduleWidth) <= state.moduleWidth * 0.03 ? null : sp.bayW,
          depth: Math.abs(sp.depth - state.shelfDepth) <= state.shelfDepth * 0.1 ? null : sp.depth,
          inactive: false,
        };
        state.shelves.push(s);
        newIds.push(s.id);
      });
      return;
    }
    if (asStandard) {
      const modules = Math.max(1, Math.round(len / state.moduleWidth));
      shelf = {
        id: 'shelf_' + state.nextId++,
        name: '', subname: '',
        x: 0, y: 0,
        dept: defaultDept,
        orientation: isV ? 'V' : 'H',
        modules,
        angle: null, bayW: null, depth: null, inactive: false,
      };
      const dim = getDims(shelf);
      shelf.x = Math.round(b.x + b.w / 2 - dim.w / 2);
      shelf.y = Math.round(b.y + b.h / 2 - dim.h / 2);
    } else {
      shelf = {
        id: 'shelf_' + state.nextId++,
        name: '', subname: '',
        x: Math.round(b.x), y: Math.round(b.y),
        dept: defaultDept,
        orientation: isV ? 'V' : 'H',
        modules: 1,
        type: 'custom',
        customW: Math.max(10, Math.round(b.w)),
        customH: Math.max(10, Math.round(b.h)),
        angle: null, bayW: null, depth: null, inactive: false,
      };
    }
    state.shelves.push(shelf);
    newIds.push(shelf.id);
  });
  state.selectedIds = newIds;
  cancelDetect();
  renderAll();
  detectSetStatus(newIds.length + ' shelves added (selected) — rename them, tweak sizes, undo if needed.');
}

function cancelDetect() {
  _detect = null;
  const g = document.getElementById('detectGroup');
  if (g) g.innerHTML = '';
  updateDetectResultUI();
}

// ═══════════════════════════════════════════════════════════
// POINTER EVENTS
// ═══════════════════════════════════════════════════════════

canvasContainer.addEventListener('pointerdown', e => { if (e.target.closest('.level-panel') || e.target.closest('.emergency-inventory')) return; canvasContainer.focus(); onPointerDown(e); });
canvasContainer.addEventListener('pointermove', e => { if (e.target.closest('.level-panel') || e.target.closest('.emergency-inventory')) return; onPointerMove(e); });
canvasContainer.addEventListener('dblclick', e => { if (isDrawingToryLine) { e.preventDefault(); finishToryLine(); } });
canvasContainer.addEventListener('pointerup', e => { if (e.target.closest('.level-panel') || e.target.closest('.emergency-inventory')) return; onPointerUp(e); });
canvasContainer.addEventListener('wheel', e => {
  if (e.target.closest('.level-panel') || e.target.closest('.emergency-inventory')) return;
  e.preventDefault();
  // Underlay adjust mode: scroll over image resizes it
  if (underlayAdjustMode && e.target.closest('.underlay-image')) {
    const delta = e.deltaY > 0 ? -5 : 5;
    const cur = Math.round(state.underlayScale * 100);
    setUnderlayScale(Math.max(10, Math.min(400, cur + delta)));
    return;
  }
  setZoom(state.zoom * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX - canvasContainer.getBoundingClientRect().left, e.clientY - canvasContainer.getBoundingClientRect().top);
}, { passive: false });
canvasContainer.addEventListener('contextmenu', e => { if (e.target.closest('.level-panel')) return; onContextMenu(e); });

function onPointerDown(e) {
  if (e.button === 1 || (e.button === 0 && state.tool === 'pan')) {
    isPanning = true; panStart = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY };
    canvasContainer.classList.add('panning'); canvasContainer.setPointerCapture(e.pointerId); return;
  }
  if (e.button !== 0) return;
  const pos = screenToCanvas(e.clientX, e.clientY);

  // Set-Scale calibration: capture the two clicks, then ignore other tool actions
  if (calOn) { handleScaleClick(pos.x, pos.y); return; }

  // Underlay mouse adjust mode — drag to move
  if (underlayAdjustMode && e.target.closest('.underlay-image')) {
    isDraggingUnderlay = true;
    underlayDragStart = { x: pos.x, y: pos.y, ox: state.underlayX, oy: state.underlayY };
    canvasContainer.setPointerCapture(e.pointerId); return;
  }

  hideContextMenu();
  state.highlightedName = null;

  if (state.tool === 'split') {
    // Start a slice: a quick click cuts one shelf at the point; a drag draws a
    // line that slices every shelf it crosses.
    isSlicing = true; sliceStart = { x: pos.x, y: pos.y };
    canvasContainer.setPointerCapture(e.pointerId);
    return;
  }

  if (state.tool === 'shelf' || state.tool === 'custom' || state.tool === 'landmark' || state.tool === 'wall' || state.tool === 'toryline' || state.tool === 'sixway') {
    // If clicking on an existing shelf, switch to select mode instead of drawing
    const shelfEl = e.target.closest('.shelf-group');
    if (shelfEl) {
      setTool('select');
      const id = shelfEl.dataset.id;
      const clickedShelf = state.shelves.find(x => x.id === id);
      state.selectedIds = [id]; state.selectedLandmarkId = null; state.selectedWallId = null;
      if (!clickedShelf?.locked) {
        isDragging = true; dragStart = { x: pos.x, y: pos.y };
        dragOffsets = [{ id, ox: clickedShelf.x - pos.x, oy: clickedShelf.y - pos.y }];
        saveState();
      }
      canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
    }
  }

  if (state.tool === 'shelf') {
    isDrawing = true; drawStart = { x: snap(pos.x), y: snap(pos.y) };
    state.selectedLandmarkId = null;
    canvasContainer.setPointerCapture(e.pointerId); return;
  }

  if (state.tool === 'custom') {
    isDrawingCustom = true; drawStart = { x: snap(pos.x), y: snap(pos.y) };
    state.selectedLandmarkId = null;
    canvasContainer.setPointerCapture(e.pointerId); return;
  }

  if (state.tool === 'sixway') {
    isDrawingSixway = true; drawStart = { x: snap(pos.x), y: snap(pos.y) };
    state.selectedLandmarkId = null;
    canvasContainer.setPointerCapture(e.pointerId); return;
  }

  if (state.tool === 'landmark') {
    isDrawingLandmark = true; drawStart = { x: snap(pos.x), y: snap(pos.y) };
    state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null;
    canvasContainer.setPointerCapture(e.pointerId); return;
  }

  if (state.tool === 'wall') {
    isDrawingWall = true; drawStart = { x: snap(pos.x), y: snap(pos.y) };
    state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null;
    canvasContainer.setPointerCapture(e.pointerId); return;
  }

  if (state.tool === 'paths') {
    if (!pathLayerInteractive()) return;   // node layer hidden → ignore clicks on it
    // Capture the press; click-vs-drag is decided on move/up.
    var pHit = pathNodeAt(pos.x, pos.y);
    // Edges are selectable in Select mode, and in Connect mode too when not mid-chain
    // (so a stray link can be picked + deleted without leaving the drawing flow).
    var edgeSelectable = !pHit && (pathMode === 'select' || (pathMode === 'connect' && !pathChainPrevId));
    var pEdge = edgeSelectable ? pathEdgeAt(pos.x, pos.y) : null;
    var psx = pathSnap(pos.x, e), psy = pathSnap(pos.y, e);
    // v0.326: Shift = straight-line lock for the node about to be placed
    if (e.shiftKey && pathMode === 'connect' && pathChainPrevId && !pHit) {
      var plock = pathAxisLock(psx, psy);
      psx = plock.x; psy = plock.y;
    }
    pathDragCand = { hitId: pHit ? pHit.id : null, edgeKey: pEdge ? pEdge.key : null,
                     edge: pEdge ? pEdge.edge : null, sx: psx, sy: psy, moved: false,
                     shift: !!(e.shiftKey) };
    isDraggingPathNode = false;
    pathGroupDragStart = null;
    return;
  }

  if (state.tool === 'toryline') {
    if (!toryLayerInteractive()) return;   // tory layer hidden → ignore clicks
    const sx = snap(pos.x), sy = snap(pos.y);
    state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null;
    // Check if clicking near an endpoint of an existing tory line to extend it
    // v0.252: continuous-chain drawing like the path-node tool.
    // Click to drop each point; a live preview line follows the cursor; click an
    // existing line's endpoint to extend it; Enter/Esc/double-click finishes.
    if (!isDrawingToryLine) {
      const SNAP_DIST = 15 / state.zoom;
      // Click near an existing line's end → resume drawing (extend) from there
      for (let ti = 0; ti < state.toryLines.length; ti++) {
        const tl = state.toryLines[ti];
        if (!tl.points.length) continue;
        const lastPt = tl.points[tl.points.length - 1];
        const firstPt = tl.points[0];
        if (Math.abs(sx - lastPt.x) < SNAP_DIST && Math.abs(sy - lastPt.y) < SNAP_DIST) {
          isDrawingToryLine = true; toryLinePoints = [{ x: lastPt.x, y: lastPt.y }];
          state.selectedToryLineId = tl.id;
          toryLinePoints._extendId = tl.id; toryLinePoints._extendEnd = 'end';
          toryCursor = { x: sx, y: sy };
          renderToryLinePreview(); return;
        }
        if (Math.abs(sx - firstPt.x) < SNAP_DIST && Math.abs(sy - firstPt.y) < SNAP_DIST) {
          isDrawingToryLine = true; toryLinePoints = [{ x: firstPt.x, y: firstPt.y }];
          state.selectedToryLineId = tl.id;
          toryLinePoints._extendId = tl.id; toryLinePoints._extendEnd = 'start';
          toryCursor = { x: sx, y: sy };
          renderToryLinePreview(); return;
        }
      }
      // Start a fresh chain
      saveState();
      isDrawingToryLine = true; toryLinePoints = [{ x: sx, y: sy }];
      state.selectedToryLineId = null;
      toryCursor = { x: sx, y: sy };
      renderToryLinePreview(); return;
    }

    // Already drawing — add a point to the chain (each click extends it).
    const anchor = toryLinePoints[toryLinePoints.length - 1];
    // Click on/near the last point again → finish the line (like the node tool).
    if (Math.abs(sx - anchor.x) < (10 / state.zoom) && Math.abs(sy - anchor.y) < (10 / state.zoom)) {
      finishToryLine(); return;
    }
    let fx = sx, fy = sy;
    if (e.shiftKey) {                                   // Shift = straight H/V from the last point
      const dx = Math.abs(sx - anchor.x), dy = Math.abs(sy - anchor.y);
      if (dx <= dy) fx = anchor.x; else fy = anchor.y;
    }
    // ignore a zero-length click (same spot)
    if (fx === anchor.x && fy === anchor.y) return;

    if (toryLinePoints._extendId) {
      // Extending an existing line: append straight into its points
      const tl = state.toryLines.find(t => t.id === toryLinePoints._extendId);
      if (tl) {
        if (toryLinePoints._extendEnd === 'end') tl.points.push({ x: fx, y: fy });
        else tl.points.unshift({ x: fx, y: fy });
        state.selectedToryLineId = tl.id;
        // keep the chain anchor in sync so the preview continues from the new tip
        var keepEnd = toryLinePoints._extendEnd;
        toryLinePoints = [{ x: fx, y: fy }];
        toryLinePoints._extendId = tl.id; toryLinePoints._extendEnd = keepEnd;
      }
    } else {
      toryLinePoints.push({ x: fx, y: fy });
    }
    toryCursor = { x: sx, y: sy };
    renderToryLines(); renderToryLineOverlays(); renderToryLinePreview();
    return;
  }

  if (state.tool === 'boundary') {
    const sx = pathSnap(pos.x, e), sy = pathSnap(pos.y, e);

    // v0.160: Continuous polyline drawing. Each click appends a point directly to
    // state.boundary (not a separate "pending segment" buffer). The polyline stays
    // open while drawing — no auto-closing back to the first point after every click.
    // Clicking near the first point closes the loop. Enter commits as-is, Esc cancels.
    //
    // The older model placed one point per two clicks and auto-committed segments,
    // which felt like "connecting back to start" because each click only drew one line
    // before resetting. This model is the standard polygon-drawing UX (Illustrator,
    // Figma, Google Maps polygon tool).
    const CLOSE_DIST = 15 / state.zoom;

    if (!isDrawingBoundary) {
      // ─── Starting a new drawing session ───
      // If the boundary already has points, check if the user clicked near an existing
      // endpoint to resume drawing from there (preserves the v0.159 "extend endpoint"
      // affordance). Otherwise start a fresh boundary — if one already exists, this
      // REPLACES it (same as before; clearing is explicit via the Clear Border button).
      if (state.boundary.length >= 2) {
        // v0.314: resume from ANY open end of ANY segment (not just the outer ends),
        // so you can pick up a loose end and either extend it or join it to another.
        const k = boundaryEndAt(sx, sy, -1);
        if (k >= 0) { boundaryResumeFromEnd(k); return; }
      }
      // Fresh boundary — clear any existing and start from this click
      if (state.boundary.length > 0) saveState();
      state.boundary = [{ x: sx, y: sy }];
      isDrawingBoundary = true;
      boundaryExtendEnd = 'end';
      renderBoundary();
    } else {
      // ─── Already drawing — either close the loop or append a point ───
      // If boundary has at least 3 points and this click lands near the first point,
      // close the loop: stop drawing. The polygon auto-renders as closed because
      // renderBoundary uses <polygon> (not <polyline>) for 3+ points.
      // Close the loop — only valid when it's a single run (no gaps). Closing
      // appends a copy of the first point so first===last (geometric closure).
      if (state.boundary.length >= 3 && boundaryRuns().length === 1) {
        const fp = state.boundary[0];
        if (Math.sqrt((sx - fp.x)**2 + (sy - fp.y)**2) < CLOSE_DIST) {
          saveState();
          if (!boundaryIsClosed()) state.boundary.push({ x: fp.x, y: fp.y });
          isDrawingBoundary = false;
          boundaryExtendEnd = null;
          boundaryPenUp = false;
          // Remove any live preview line that might still be in the overlay
          overlayGroup.querySelectorAll('.boundary-preview-line').forEach(el => el.remove());
          renderBoundary();
          return;
        }
      }
      // v0.314: if this click lands on ANOTHER open end, connect the two ends
      // (merge the segments) instead of dropping a new point — "click one loose
      // end onto another to join them".
      const activeIdx = (boundaryExtendEnd === 'start') ? 0 : state.boundary.length - 1;
      const joinTo = boundaryEndAt(sx, sy, activeIdx);
      if (joinTo >= 0 && boundaryJoin(activeIdx, joinTo)) {
        isDrawingBoundary = false;
        boundaryExtendEnd = null;
        boundaryPenUp = false;
        overlayGroup.querySelectorAll('.boundary-preview-line').forEach(el => el.remove());
        return;
      }
      // Not closing — append a new point. Prepend if we started by resuming from the
      // first endpoint (boundaryExtendEnd === 'start'), otherwise append to the end.
      // If pen-up is armed (G), the appended point starts a new disconnected run.
      saveState();
      if (boundaryExtendEnd === 'start') {
        state.boundary.unshift({ x: sx, y: sy });
      } else {
        const np = { x: sx, y: sy };
        if (boundaryPenUp) { np.break = true; boundaryPenUp = false; }
        state.boundary.push(np);
      }
      renderBoundary();
      // IMPORTANT: do NOT reset isDrawingBoundary — we stay in drawing mode so the
      // next click continues the polyline. This is the behavioural change vs pre-v0.160.
    }
    return;
  }

  // Zoom box tool — draw a new zoom box
  if (state.tool === 'zoombox') {
    isDrawingZoombox = true;
    zoomboxDrawStart = { x: snap(pos.x), y: snap(pos.y) };
    state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedLandmarkId = null; state.selectedWallIds = []; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
    canvasContainer.setPointerCapture(e.pointerId);
    return;
  }

  // Emergency tool — click to place
  if (state.tool === 'emergency') {
    if (!sosLayerInteractive()) return;   // SOS layer hidden → don't place onto an invisible layer
    saveState();
    const em = { id: 'em_' + state.nextId++, type: selectedEmergencyType, x: snap(pos.x), y: snap(pos.y), label: '' };
    state.emergencyMarkers.push(em);
    state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null;
    state.selectedEmergencyId = em.id;
    renderAll();
    return;
  }

  // v0.136: Price Check tool — click to place
  if (state.tool === 'pricecheck') {
    saveState();
    const pc = { id: 'pc_' + state.nextId++, x: snap(pos.x), y: snap(pos.y), label: '' };
    state.priceChecks = state.priceChecks || [];
    state.priceChecks.push(pc);
    state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
    state.selectedPriceCheckId = pc.id;
    renderAll();
    return;
  }

  // Tory Dock tool — click to place a bot docking station
  if (state.tool === 'torydock') {
    saveState();
    const td = { id: 'tdock_' + state.nextId++, x: snap(pos.x), y: snap(pos.y), label: '' };
    state.toryDocks = state.toryDocks || [];
    state.toryDocks.push(td);
    state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
    state.selectedToryDockId = td.id;
    renderAll();
    return;
  }

  if (state.tool === 'ruler') {
    const sx = snap(pos.x), sy = snap(pos.y);
    if (!rulerStart) {
      rulerStart = { x: sx, y: sy };
      renderRulerPreview();
    } else {
      // Show final measurement and reset
      const dx = sx - rulerStart.x, dy = sy - rulerStart.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const info = document.getElementById('statusInfo');
      if (info) { info.textContent = 'Ruler: ' + Math.round(dist) + 'px (' + Math.abs(Math.round(dx)) + ' \u00d7 ' + Math.abs(Math.round(dy)) + ')'; info.style.display = ''; }
      rulerStart = null;
      overlayGroup.querySelectorAll('.ruler-preview').forEach(el => el.remove());
    }
    return;
  }

  if (state.tool === 'select') {
    // Check boundary point drag
    const bPt = e.target.closest('.boundary-point');
    if (bPt) {
      isDraggingBoundaryPt = true;
      boundaryDragIdx = +bPt.dataset.boundaryIdx;
      saveState(); canvasContainer.setPointerCapture(e.pointerId); return;
    }

    // Check zoom box resize handle
    const zbResize = e.target.closest('[data-zoombox-resize]');
    if (zbResize) {
      isResizingZoombox = true;
      const zb = state.deptZoomBoxes.find(z => z.id === zbResize.dataset.zoomboxResize);
      zoomboxDragStart = { x: pos.x, y: pos.y, origW: zb.w, origH: zb.h };
      saveState(); canvasContainer.setPointerCapture(e.pointerId); return;
    }

    // Check zoom box click
    const zbEl = e.target.closest('.zoombox-group');
    if (zbEl) {
      const zbId = zbEl.dataset.zoomboxId;
      state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
      state.selectedZoomboxId = zbId;
      isDraggingZoombox = true;
      const zb = state.deptZoomBoxes.find(z => z.id === zbId);
      zoomboxDragStart = { x: pos.x, y: pos.y };
      zoomboxDragOffset = { ox: zb.x - pos.x, oy: zb.y - pos.y };
      saveState(); canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
    }

    // Check emergency marker click
    const emEl = e.target.closest('.emergency-group');
    if (emEl) {
      const emId = emEl.dataset.emergencyId;
      state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedPriceCheckId = null;
      state.selectedEmergencyId = emId;
      if (e.button === 0) { // Left-click only — start drag
        isDraggingEmergency = true;
        const em = state.emergencyMarkers.find(m => m.id === emId);
        emergencyDragOffset = { ox: em.x - pos.x, oy: em.y - pos.y };
        saveState(); canvasContainer.setPointerCapture(e.pointerId);
      }
      renderAll(); return;
    }

    // v0.136: Check price check marker click
    const pcEl = e.target.closest('.pricecheck-group');
    if (pcEl) {
      const pcId = pcEl.dataset.priceCheckId;
      state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
      state.selectedPriceCheckId = pcId;
      if (e.button === 0) {
        isDraggingPriceCheck = true;
        const pc = (state.priceChecks || []).find(m => m.id === pcId);
        priceCheckDragOffset = { ox: pc.x - pos.x, oy: pc.y - pos.y };
        saveState(); canvasContainer.setPointerCapture(e.pointerId);
      }
      renderAll(); return;
    }

    // Tory dock marker click — select + drag
    const tdEl = e.target.closest('.torydock-group');
    if (tdEl) {
      const tdId = tdEl.dataset.toryDockId;
      state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null; state.selectedToryDockId = null;
      state.selectedToryDockId = tdId;
      if (e.button === 0) {
        isDraggingToryDock = true;
        const td = (state.toryDocks || []).find(m => m.id === tdId);
        toryDockDragOffset = { ox: td.x - pos.x, oy: td.y - pos.y };
        saveState(); canvasContainer.setPointerCapture(e.pointerId);
      }
      renderAll(); return;
    }

    // Check zone resize handle first
    const zrh = e.target.closest('.landmark-resize-handle');
    if (zrh) {
      isResizingLandmark = true;
      landmarkResizeHandle = zrh.dataset.pos;
      const zone = state.landmarks.find(z => z.id === zrh.dataset.landmarkId);
      landmarkResizeStart = { x: pos.x, y: pos.y };
      landmarkResizeOrig = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
      saveState(); canvasContainer.setPointerCapture(e.pointerId); return;
    }

    // Check shelf resize handle (drag to extend/shorten)
    const srh = e.target.closest('.shelf-resize-handle');
    if (srh) {
      const rs = state.shelves.find(x => x.id === srh.dataset.id);
      if (rs && !rs.locked) {
        isResizingShelf = true; shelfResizeHandle = srh.dataset.pos; shelfResizeId = rs.id;
        const rdim = getDims(rs);
        shelfResizeOrig = { x: rs.x, y: rs.y, modules: rs.modules, customW: rs.customW, customH: rs.customH,
          angle: rs.angle, bayW: getShelfBayW(rs), depth: getShelfDepth(rs), orientation: rs.orientation,
          type: rs.type, cx: rs.x + rdim.w/2, cy: rs.y + rdim.h/2 };
        saveState(); canvasContainer.setPointerCapture(e.pointerId); return;
      }
    }

    // Check wall resize handle
    const wrh = e.target.closest('.wall-resize-handle');
    if (wrh) {
      isResizingWall = true;
      wallResizeHandle = wrh.dataset.pos;
      const wall = state.walls.find(w => w.id === wrh.dataset.wallId);
      wallResizeStart = { x: pos.x, y: pos.y };
      wallResizeOrig = { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
      saveState(); canvasContainer.setPointerCapture(e.pointerId); return;
    }

    // Check shelf click
    const shelfEl = e.target.closest('.shelf-group');
    if (shelfEl) {
      state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
      const id = shelfEl.dataset.id;
      if (combineArm) {
        if (combineArm !== id) { mergeShelves(combineArm, id); }
        cancelCombine();
        canvasContainer.setPointerCapture(e.pointerId); return;
      }
      if (e.shiftKey) { state.selectedIds.includes(id) ? state.selectedIds = state.selectedIds.filter(x => x !== id) : state.selectedIds.push(id); }
      else { if (!state.selectedIds.includes(id)) { state.selectedIds = [id]; state.selectedLandmarkIds = []; } }
      // Only allow drag if no selected shelf is locked
      const anyLocked = state.selectedIds.some(sid => { const s = state.shelves.find(x => x.id === sid); return s?.locked; });
      if (!anyLocked) {
        isDragging = true; dragStart = { x: pos.x, y: pos.y };
        dragOffsets = state.selectedIds.map(sid => { const s = state.shelves.find(x => x.id === sid); return { id: sid, ox: s.x - pos.x, oy: s.y - pos.y }; });
        landmarkDragOffsets = state.selectedLandmarkIds.map(lid => { const z = state.landmarks.find(x => x.id === lid); return { id: lid, ox: z.x - pos.x, oy: z.y - pos.y }; });
        wallDragOffsets = state.selectedWallIds.map(wid => { const w = state.walls.find(x => x.id === wid); return { id: wid, ox: w.x - pos.x, oy: w.y - pos.y }; });
        saveState();
      }
      canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
    }

    // Check zone click
    const zoneEl = e.target.closest('.landmark-group');
    if (zoneEl) {
      state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null; state.selectedWallId = null;
      const zid = zoneEl.dataset.landmarkId;
      
      if (e.shiftKey) {
        // Shift-click: toggle in multi-select, preserve shelf selection
        state.selectedLandmarkId = null;
        if (state.selectedLandmarkIds.includes(zid)) {
          state.selectedLandmarkIds = state.selectedLandmarkIds.filter(x => x !== zid);
        } else {
          state.selectedLandmarkIds.push(zid);
        }
        canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
      }
      
      // Check if this landmark is part of a multi-selection (mixed mode) — start group drag
      if (state.selectedLandmarkIds.includes(zid) && (state.selectedIds.length > 0 || state.selectedLandmarkIds.length > 1)) {
        isDragging = true; dragStart = { x: pos.x, y: pos.y };
        dragOffsets = state.selectedIds.map(sid => { const s = state.shelves.find(x => x.id === sid); return { id: sid, ox: s.x - pos.x, oy: s.y - pos.y }; });
        landmarkDragOffsets = state.selectedLandmarkIds.map(lid => { const z = state.landmarks.find(x => x.id === lid); return { id: lid, ox: z.x - pos.x, oy: z.y - pos.y }; });
        wallDragOffsets = state.selectedWallIds.map(wid => { const w = state.walls.find(x => x.id === wid); return { id: wid, ox: w.x - pos.x, oy: w.y - pos.y }; });
        saveState(); canvasContainer.setPointerCapture(e.pointerId); return;
      }
      
      // Single landmark click — clear everything, use single-landmark edit mode
      state.selectedIds = []; state.selectedLandmarkIds = [];
      state.selectedLandmarkId = zid;
      isDraggingLandmark = true;
      const zone = state.landmarks.find(z => z.id === zid);
      landmarkDragStart = { x: pos.x, y: pos.y };
      landmarkDragOffset = { ox: zone.x - pos.x, oy: zone.y - pos.y };
      saveState(); canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
    }

    // Check tory line point handle drag
    const tph = e.target.closest('.tory-point-handle');
    if (tph) {
      isDraggingToryPoint = true;
      toryPointDragIdx = +tph.dataset.pointIdx;
      state.selectedToryLineId = tph.dataset.toryLineId;
      saveState(); canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
    }

    // Check tory line click
    const toryEl = e.target.closest('.tory-line-group');
    if (toryEl) {
      state.selectedIds = []; state.selectedLandmarkId = null; state.selectedLandmarkIds = [];
      state.selectedWallId = null; state.selectedWallIds = [];
      state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
      state.selectedToryLineId = toryEl.dataset.toryLineId;
      if (e.button === 0) { // Left-click only — start drag
        isDraggingToryLine = true;
        toryLineDragStart = { x: snap(pos.x), y: snap(pos.y) };
        const tl = state.toryLines.find(t => t.id === state.selectedToryLineId);
        if (tl) tl._origPoints = tl.points.map(p => ({ x: p.x, y: p.y }));
        saveState(); canvasContainer.setPointerCapture(e.pointerId);
      }
      renderAll(); return;
    }

    // Check wall click
    const wallEl = e.target.closest('.wall-group');
    if (wallEl) {
      state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null; state.selectedLandmarkId = null;
      const wid = wallEl.dataset.wallId;
      if (e.shiftKey) {
        state.selectedWallId = null;
        if (state.selectedWallIds.includes(wid)) {
          state.selectedWallIds = state.selectedWallIds.filter(x => x !== wid);
        } else {
          state.selectedWallIds.push(wid);
        }
        canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
      }
      if (state.selectedWallIds.includes(wid) && (state.selectedIds.length > 0 || state.selectedWallIds.length > 1)) {
        isDragging = true; dragStart = { x: pos.x, y: pos.y };
        dragOffsets = state.selectedIds.map(sid => { const s = state.shelves.find(x => x.id === sid); return { id: sid, ox: s.x - pos.x, oy: s.y - pos.y }; });
        landmarkDragOffsets = state.selectedLandmarkIds.map(lid => { const z = state.landmarks.find(x => x.id === lid); return { id: lid, ox: z.x - pos.x, oy: z.y - pos.y }; });
        wallDragOffsets = state.selectedWallIds.map(wid2 => { const w = state.walls.find(x => x.id === wid2); return { id: wid2, ox: w.x - pos.x, oy: w.y - pos.y }; });
        saveState(); canvasContainer.setPointerCapture(e.pointerId); return;
      }
      state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedWallIds = [];
      state.selectedWallId = wid;
      isDraggingWall = true;
      const wall = state.walls.find(w => w.id === wid);
      wallDragStart = { x: pos.x, y: pos.y };
      wallDragOffset = { ox: wall.x - pos.x, oy: wall.y - pos.y };
      saveState(); canvasContainer.setPointerCapture(e.pointerId); renderAll(); return;
    }

    // Selection box (empty area)
    if (!e.shiftKey) { state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedLandmarkId = null; state.selectedWallIds = []; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null; }
    isSelecting = true; selectStart = { x: pos.x, y: pos.y };
    canvasContainer.setPointerCapture(e.pointerId); renderAll();
  }
}

function onPointerMove(e) {
  // Panning takes priority — never run tool-specific hit-testing/rendering mid-pan.
  // Coalesce rapid mouse pointermove events into one transform update per animation
  // frame: the desktop fires far more move events than touch, and each updateTransform
  // repaints the whole map <g>, so unthrottled panning pegs the CPU. (v0.247)
  if (isPanning) {
    _panPending = { px: panStart.px + (e.clientX - panStart.x), py: panStart.py + (e.clientY - panStart.y) };
    if (!_panRaf) {
      _panRaf = requestAnimationFrame(function () {
        _panRaf = 0;
        if (_panPending) { state.panX = _panPending.px; state.panY = _panPending.py; _panPending = null; updateTransform(); }
      });
    }
    return;
  }

  // Walk-paths: dragging a held node moves it (Ctrl = grid, else free)
  if (state.tool === 'paths' && pathDragCand && pathDragCand.hitId && (e.buttons & 1)) {
    var pPos = screenToCanvas(e.clientX, e.clientY);
    if (!isDraggingPathNode && Math.hypot(pathSnap(pPos.x, e) - pathDragCand.sx, pathSnap(pPos.y, e) - pathDragCand.sy) > 0) {
      saveState();                       // capture once, before the move, so Ctrl+Z reverts the drag
      isDraggingPathNode = true;
      // If the grabbed node is part of a multi-selection, snapshot the whole group so
      // they all move together by the same delta (QoL: shift a run of nodes at once).
      var ms = state.selectedPathNodeIds || [];
      if (ms.length > 1 && ms.indexOf(pathDragCand.hitId) >= 0) {
        pathGroupDragStart = { sx: pathDragCand.sx, sy: pathDragCand.sy, nodes: [] };
        ms.forEach(function (id) {
          var nn = state.pathNodes.find(function (n) { return n.id === id; });
          if (nn) pathGroupDragStart.nodes.push({ id: id, x: nn.x, y: nn.y });
        });
      }
    }
    if (isDraggingPathNode) {
      if (pathGroupDragStart) {
        // move every selected node by the delta from the grab point (Ctrl = grid)
        var dx = pathSnap(pPos.x, e) - pathGroupDragStart.sx;
        var dy = pathSnap(pPos.y, e) - pathGroupDragStart.sy;
        pathGroupDragStart.nodes.forEach(function (rec) {
          var nn = state.pathNodes.find(function (n) { return n.id === rec.id; });
          if (nn) { nn.x = rec.x + dx; nn.y = rec.y + dy; }
        });
        renderPaths();
        return;
      }
      var pn = state.pathNodes.find(function (n) { return n.id === pathDragCand.hitId; });
      // Moving the node moves its links automatically — edges are drawn from
      // live node coords, so attached paths follow the node as it's dragged.
      if (pn) { pn.x = pathSnap(pPos.x, e); pn.y = pathSnap(pPos.y, e); renderPaths(); }
      return;
    }
  }

  // Walk-paths hover + connect-mode preview line (no button held, not panning)
  if (state.tool === 'paths' && pathLayerInteractive() && !isPanning && !(e.buttons & 1)) {
    var hPos = screenToCanvas(e.clientX, e.clientY);
    var hn = pathNodeAt(hPos.x, hPos.y);
    var newHoverNode = hn ? hn.id : null;
    var newHoverEdge = null;
    if (!hn && (pathMode === 'select' || (pathMode === 'connect' && !pathChainPrevId))) { var he = pathEdgeAt(hPos.x, hPos.y); newHoverEdge = he ? he.key : null; }
    var changed = (newHoverNode !== pathHoverNodeId) || (newHoverEdge !== pathHoverEdgeKey);
    pathHoverNodeId = newHoverNode; pathHoverEdgeKey = newHoverEdge;
    if (pathMode === 'connect' && pathChainPrevId) {
      // live "will-connect" line follows the cursor (snaps to a hovered node).
      // v0.326: FIX — the preview endpoint previously used the hard grid snap()
      // while actual placement uses pathSnap() (free, Ctrl = grid), so the dashed
      // line was rigid and didn't land where the node actually went. It now runs
      // through the exact same coordinate pipeline as placement, including the
      // Shift straight-line lock, so preview === result.
      var ncx, ncy;
      if (hn) { ncx = hn.x; ncy = hn.y; }
      else {
        ncx = pathSnap(hPos.x, e); ncy = pathSnap(hPos.y, e);
        if (e.shiftKey) { var pvl = pathAxisLock(ncx, ncy); ncx = pvl.x; ncy = pvl.y; }
      }
      var moved = !pathCursor || pathCursor.x !== ncx || pathCursor.y !== ncy;
      pathCursor = { x: ncx, y: ncy };
      if (moved || changed) renderPaths();   // only redraw when the preview/hover actually changed
    } else if (changed) {
      renderPaths();
    }
    canvasContainer.style.cursor = (hn || newHoverEdge) ? 'pointer' : (pathMode === 'connect' ? 'crosshair' : 'default');
  }

  const pos = screenToCanvas(e.clientX, e.clientY);
  document.getElementById('statusCoords').textContent = `X: ${Math.round(pos.x)} Y: ${Math.round(pos.y)}`;

  if (isSlicing && sliceStart) {
    let el = document.getElementById('slicePreview');
    if (!el) { el = document.createElementNS('http://www.w3.org/2000/svg', 'line'); el.id = 'slicePreview'; el.classList.add('slice-preview'); el.setAttribute('vector-effect', 'non-scaling-stroke'); overlayGroup.appendChild(el); }
    el.setAttribute('x1', sliceStart.x); el.setAttribute('y1', sliceStart.y);
    el.setAttribute('x2', pos.x); el.setAttribute('y2', pos.y);
    return;
  }

  if (isPanning) { state.panX = panStart.px + (e.clientX - panStart.x); state.panY = panStart.py + (e.clientY - panStart.y); updateTransform(); return; }

  // Underlay drag
  if (isDraggingUnderlay) {
    const dx = pos.x - underlayDragStart.x, dy = pos.y - underlayDragStart.y;
    setUnderlayPos(underlayDragStart.ox + dx, underlayDragStart.oy + dy);
    return;
  }

  // Boundary point drag
  if (isDraggingBoundaryPt && boundaryDragIdx >= 0) {
    const np = { x: pathSnap(pos.x, e), y: pathSnap(pos.y, e) };
    const lastIdx = state.boundary.length - 1;
    const wasClosed = boundaryIsClosed();
    state.boundary[boundaryDragIdx] = np;
    // A closed ring's first and duplicate-last point are one physical corner — move both.
    if (wasClosed && (boundaryDragIdx === 0 || boundaryDragIdx === lastIdx)) {
      const partner = boundaryDragIdx === 0 ? lastIdx : 0;
      state.boundary[partner] = { x: np.x, y: np.y };
    }
    renderBoundary(); return;
  }

  // Boundary drawing preview line
  // v0.160: Anchor from the current end of state.boundary (first point when extending
  // from 'start', last point otherwise) instead of the old boundaryPoints buffer which
  // no longer exists under the continuous-polyline model.
  if (isDrawingBoundary && state.boundary.length > 0) {
    overlayGroup.querySelectorAll('.boundary-preview-line').forEach(el => el.remove());
    const lastPt = boundaryExtendEnd === 'start'
      ? state.boundary[0]
      : state.boundary[state.boundary.length - 1];
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.classList.add('boundary-preview-line');
    l.setAttribute('x1', lastPt.x); l.setAttribute('y1', lastPt.y);
    l.setAttribute('x2', pathSnap(pos.x, e)); l.setAttribute('y2', pathSnap(pos.y, e));
    overlayGroup.appendChild(l);
  }

  // Zoom box drawing preview
  if (isDrawingZoombox && zoomboxDrawStart) {
    overlayGroup.querySelectorAll('.zoombox-preview').forEach(el => el.remove());
    const sx = zoomboxDrawStart.x, sy = zoomboxDrawStart.y;
    const ex = snap(pos.x), ey = snap(pos.y);
    const x = Math.min(sx, ex), y = Math.min(sy, ey);
    const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
    if (w > 5 || h > 5) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.classList.add('zoombox-preview');
      r.setAttribute('x', x); r.setAttribute('y', y);
      r.setAttribute('width', w); r.setAttribute('height', h);
      r.setAttribute('fill', 'rgba(74,158,255,0.08)'); r.setAttribute('stroke', 'var(--accent)');
      r.setAttribute('stroke-width', 2 / state.zoom); r.setAttribute('stroke-dasharray', `${6/state.zoom} ${3/state.zoom}`);
      r.setAttribute('rx', 4 / state.zoom);
      overlayGroup.appendChild(r);
      // Size label
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.classList.add('zoombox-preview');
      t.setAttribute('x', x + w/2); t.setAttribute('y', y + h/2);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-family', 'JetBrains Mono'); t.setAttribute('font-size', 11/state.zoom);
      t.setAttribute('fill', 'var(--accent)');
      t.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      overlayGroup.appendChild(t);
    }
    return;
  }

  // Zoom box drag
  if (isDraggingZoombox && state.selectedZoomboxId) {
    const zb = state.deptZoomBoxes.find(z => z.id === state.selectedZoomboxId);
    if (zb) {
      zb.x = snap(pos.x + zoomboxDragOffset.ox);
      zb.y = snap(pos.y + zoomboxDragOffset.oy);
      renderZoomboxes(); updateZoomboxPanel();
    }
    return;
  }

  // Zoom box resize
  if (isResizingZoombox && state.selectedZoomboxId) {
    const zb = state.deptZoomBoxes.find(z => z.id === state.selectedZoomboxId);
    if (zb) {
      const dx = pos.x - zoomboxDragStart.x, dy = pos.y - zoomboxDragStart.y;
      zb.w = snap(Math.max(20, zoomboxDragStart.origW + dx));
      zb.h = snap(Math.max(20, zoomboxDragStart.origH + dy));
      renderZoomboxes(); updateZoomboxPanel();
    }
    return;
  }

  // Emergency marker drag
  if (isDraggingEmergency && state.selectedEmergencyId) {
    const em = state.emergencyMarkers.find(m => m.id === state.selectedEmergencyId);
    if (em) {
      em.x = snap(pos.x + emergencyDragOffset.ox);
      em.y = snap(pos.y + emergencyDragOffset.oy);      renderEmergency(); updateEmergencyPanel();
    }
    return;
  }

  // v0.136: Price check marker drag
  if (isDraggingPriceCheck && state.selectedPriceCheckId) {
    const pc = (state.priceChecks || []).find(m => m.id === state.selectedPriceCheckId);
    if (pc) {
      pc.x = snap(pos.x + priceCheckDragOffset.ox);
      pc.y = snap(pos.y + priceCheckDragOffset.oy);
      renderPriceChecks(); updatePriceCheckPanel();
    }
    return;
  }

  // Tory dock marker drag
  if (isDraggingToryDock && state.selectedToryDockId) {
    const td = (state.toryDocks || []).find(m => m.id === state.selectedToryDockId);
    if (td) {
      td.x = snap(pos.x + toryDockDragOffset.ox);
      td.y = snap(pos.y + toryDockDragOffset.oy);
      renderToryDocks();
    }
    return;
  }

  if (isDrawing) {
    const isV = Math.abs(snap(pos.y) - drawStart.y) > Math.abs(snap(pos.x) - drawStart.x);
    const lengthPx = isV ? Math.abs(snap(pos.y) - drawStart.y) : Math.abs(snap(pos.x) - drawStart.x);
    const mods = Math.max(1, modulesFromPx(lengthPx));
    const len = mods * state.moduleWidth;
    const dep = state.shelfDepth;
    const pw = isV ? dep : len, ph = isV ? len : dep;

    if (!drawPreview) {
      drawPreview = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      drawPreview.setAttribute('fill', 'rgba(74,158,255,0.2)'); drawPreview.setAttribute('stroke', 'var(--accent)');
      drawPreview.setAttribute('stroke-width', 1.5/state.zoom); drawPreview.setAttribute('stroke-dasharray', `${4/state.zoom} ${2/state.zoom}`);
      drawPreview.setAttribute('rx', 2);
      overlayGroup.appendChild(drawPreview);
      drawLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      drawLabel.setAttribute('fill', 'var(--accent)'); drawLabel.setAttribute('font-family', 'JetBrains Mono, monospace');
      drawLabel.setAttribute('font-size', 10/state.zoom); drawLabel.setAttribute('font-weight', 600);
      drawLabel.setAttribute('text-anchor', 'middle');
      overlayGroup.appendChild(drawLabel);
    }
    drawPreview.setAttribute('x', drawStart.x); drawPreview.setAttribute('y', drawStart.y);
    drawPreview.setAttribute('width', pw); drawPreview.setAttribute('height', ph);
    drawLabel.setAttribute('x', drawStart.x + pw/2);
    drawLabel.setAttribute('y', drawStart.y - 6/state.zoom);
    drawLabel.textContent = `${mods} mod${mods > 1 ? 's' : ''}`;
    return;
  }

  if (isDrawingCustom) {
    const sx = Math.min(drawStart.x, snap(pos.x)), sy = Math.min(drawStart.y, snap(pos.y));
    const sw = Math.max(state.gridSize, Math.abs(snap(pos.x) - drawStart.x));
    const sh = Math.max(state.gridSize, Math.abs(snap(pos.y) - drawStart.y));

    if (!drawPreview) {
      drawPreview = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      drawPreview.setAttribute('fill', 'rgba(168,85,247,0.2)'); drawPreview.setAttribute('stroke', '#a855f7');
      drawPreview.setAttribute('stroke-width', 1.5/state.zoom); drawPreview.setAttribute('stroke-dasharray', `${4/state.zoom} ${2/state.zoom}`);
      drawPreview.setAttribute('rx', 2);
      overlayGroup.appendChild(drawPreview);
      drawLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      drawLabel.setAttribute('fill', '#a855f7'); drawLabel.setAttribute('font-family', 'JetBrains Mono, monospace');
      drawLabel.setAttribute('font-size', 10/state.zoom); drawLabel.setAttribute('font-weight', 600);
      drawLabel.setAttribute('text-anchor', 'middle');
      overlayGroup.appendChild(drawLabel);
    }
    drawPreview.setAttribute('x', sx); drawPreview.setAttribute('y', sy);
    drawPreview.setAttribute('width', sw); drawPreview.setAttribute('height', sh);
    drawLabel.setAttribute('x', sx + sw/2);
    drawLabel.setAttribute('y', sy - 6/state.zoom);
    drawLabel.textContent = `${sw} × ${sh}`;
    return;
  }

  if (isDrawingSixway) {
    const dx = snap(pos.x) - drawStart.x, dy = snap(pos.y) - drawStart.y;
    const radius = Math.max(state.gridSize / 2, Math.round(Math.sqrt(dx*dx + dy*dy)));
    // Clear previous preview
    overlayGroup.querySelectorAll('.sixway-preview').forEach(el => el.remove());
    // Circle
    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circ.classList.add('sixway-preview');
    circ.setAttribute('cx', drawStart.x); circ.setAttribute('cy', drawStart.y);
    circ.setAttribute('r', radius);
    circ.setAttribute('fill', 'rgba(236,72,153,0.12)'); circ.setAttribute('stroke', '#ec4899');
    circ.setAttribute('stroke-width', 1.5/state.zoom); circ.setAttribute('stroke-dasharray', `${4/state.zoom} ${2/state.zoom}`);
    overlayGroup.appendChild(circ);
    // 6 spokes
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60 - 90) * Math.PI / 180;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.classList.add('sixway-preview');
      l.setAttribute('x1', drawStart.x); l.setAttribute('y1', drawStart.y);
      l.setAttribute('x2', drawStart.x + Math.cos(angle) * radius);
      l.setAttribute('y2', drawStart.y + Math.sin(angle) * radius);
      l.setAttribute('stroke', '#ec4899'); l.setAttribute('stroke-width', 1/state.zoom);
      l.setAttribute('stroke-dasharray', `${3/state.zoom} ${2/state.zoom}`);
      overlayGroup.appendChild(l);
    }
    // Radius label
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.classList.add('sixway-preview');
    lbl.setAttribute('x', drawStart.x); lbl.setAttribute('y', drawStart.y - radius - 6/state.zoom);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-family', 'JetBrains Mono, monospace'); lbl.setAttribute('font-size', 10/state.zoom);
    lbl.setAttribute('font-weight', '600'); lbl.setAttribute('fill', '#ec4899');
    lbl.textContent = `r=${radius}`;
    overlayGroup.appendChild(lbl);
    return;
  }

  if (isDrawingLandmark) {
    const sx = Math.min(drawStart.x, snap(pos.x)), sy = Math.min(drawStart.y, snap(pos.y));
    const sw = Math.abs(snap(pos.x) - drawStart.x), sh = Math.abs(snap(pos.y) - drawStart.y);
    if (!drawPreview) {
      drawPreview = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      drawPreview.setAttribute('fill', 'rgba(26,27,30,0.5)'); drawPreview.setAttribute('stroke', '#888');
      drawPreview.setAttribute('stroke-width', 1.5/state.zoom); drawPreview.setAttribute('stroke-dasharray', `${4/state.zoom} ${2/state.zoom}`);
      drawPreview.setAttribute('rx', 3);
      overlayGroup.appendChild(drawPreview);
    }
    drawPreview.setAttribute('x', sx); drawPreview.setAttribute('y', sy);
    drawPreview.setAttribute('width', sw); drawPreview.setAttribute('height', sh);
    return;
  }

  if (isDrawingWall) {
    const sx = Math.min(drawStart.x, snap(pos.x)), sy = Math.min(drawStart.y, snap(pos.y));
    const sw = Math.abs(snap(pos.x) - drawStart.x), sh = Math.abs(snap(pos.y) - drawStart.y);
    if (!drawPreview) {
      drawPreview = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      drawPreview.setAttribute('fill', '#1a1b1e'); drawPreview.setAttribute('stroke', '#000');
      drawPreview.setAttribute('stroke-width', 1.5/state.zoom); drawPreview.setAttribute('stroke-dasharray', `${4/state.zoom} ${2/state.zoom}`);
      overlayGroup.appendChild(drawPreview);
    }
    drawPreview.setAttribute('x', sx); drawPreview.setAttribute('y', sy);
    drawPreview.setAttribute('width', sw); drawPreview.setAttribute('height', sh);
    return;
  }

  if (state.tool === 'ruler' && rulerStart) {
    overlayGroup.querySelectorAll('.ruler-preview').forEach(el => el.remove());
    const sx = snap(pos.x), sy = snap(pos.y);
    const dx = sx - rulerStart.x, dy = sy - rulerStart.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', rulerStart.x); ln.setAttribute('y1', rulerStart.y);
    ln.setAttribute('x2', sx); ln.setAttribute('y2', sy);
    ln.setAttribute('stroke', '#fbbf24'); ln.setAttribute('stroke-width', 1.5/state.zoom);
    ln.setAttribute('stroke-dasharray', (4/state.zoom) + ' ' + (3/state.zoom));
    ln.classList.add('ruler-preview');
    overlayGroup.appendChild(ln);
    // Distance label
    const mx = (rulerStart.x + sx) / 2, my = (rulerStart.y + sy) / 2;
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', mx); txt.setAttribute('y', my - 6/state.zoom);
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', 11/state.zoom);
    txt.setAttribute('fill', '#fbbf24'); txt.setAttribute('font-family', 'var(--font-mono)');
    txt.setAttribute('font-weight', '700');
    txt.textContent = Math.round(dist) + 'px';
    txt.classList.add('ruler-preview');
    overlayGroup.appendChild(txt);
    return;
  }

  if (isDrawingToryLine && toryLinePoints.length > 0) {
    // Track the cursor; the rubber-band preview is drawn by renderToryLinePreview.
    let cx = snap(pos.x), cy = snap(pos.y);
    if (e.shiftKey) {                                  // Shift = straight H/V from the last point
      const last = toryLinePoints[toryLinePoints.length - 1];
      const dx = Math.abs(cx - last.x), dy = Math.abs(cy - last.y);
      if (dx <= dy) cx = last.x; else cy = last.y;
    }
    toryCursor = { x: cx, y: cy };
    renderToryLinePreview();
    return;
  }

  if (isDragging) {
    let totalDx, totalDy, snapped;
    if (dragOffsets.length > 0) {
      // Use first shelf for snap calculations
      const firstShelf = state.shelves.find(s => s.id === dragOffsets[0].id);
      const firstDim = getDims(firstShelf);
      const rawX = snap(pos.x + dragOffsets[0].ox);
      const rawY = snap(pos.y + dragOffsets[0].oy);
      snapped = snapToShelves(rawX, rawY, firstDim.w, firstDim.h, state.selectedIds);
      let finalX = snapped.x, finalY = snapped.y;
      // Equal-spacing snap (single-shelf drag) takes precedence per-axis when it
      // finds a matching gap, and suppresses the edge guide on that axis.
      _spacingMarks = [];
      if (dragOffsets.length === 1) {
        // Use the UN-gridded pointer position so equal-spacing can land off-grid
        const sp = spacingSnap(pos.x + dragOffsets[0].ox, pos.y + dragOffsets[0].oy, firstDim.w, firstDim.h, state.selectedIds);
        if (sp) {
          if (sp.snappedX) { finalX = sp.x; snapped.guides = snapped.guides.filter(g => g.axis !== 'x'); }
          if (sp.snappedY) { finalY = sp.y; snapped.guides = snapped.guides.filter(g => g.axis !== 'y'); }
          _spacingMarks = sp.marks;
        }
      }
      const firstOrigX = dragStart.x + dragOffsets[0].ox;
      const firstOrigY = dragStart.y + dragOffsets[0].oy;
      totalDx = finalX - firstOrigX;
      totalDy = finalY - firstOrigY;
    } else if (landmarkDragOffsets.length > 0) {
      // Only landmarks — simple grid snap
      const rawX = snap(pos.x + landmarkDragOffsets[0].ox);
      const rawY = snap(pos.y + landmarkDragOffsets[0].oy);
      const firstOrigX = dragStart.x + landmarkDragOffsets[0].ox;
      const firstOrigY = dragStart.y + landmarkDragOffsets[0].oy;
      totalDx = rawX - firstOrigX;
      totalDy = rawY - firstOrigY;
      snapped = { guides: [] };
    } else { return; }

    // Apply same delta to all shelves
    dragOffsets.forEach(d => {
      const shelf = state.shelves.find(s => s.id === d.id);
      if (shelf) {
        shelf.x = dragStart.x + d.ox + totalDx;
        shelf.y = dragStart.y + d.oy + totalDy;
      }
    });
    // Also move any multi-selected landmarks
    landmarkDragOffsets.forEach(d => {
      const zone = state.landmarks.find(z => z.id === d.id);
      if (zone) {
        zone.x = dragStart.x + d.ox + totalDx;
        zone.y = dragStart.y + d.oy + totalDy;
      }
    });
    renderGuides(snapped.guides);
    renderSpacingMarks(_spacingMarks);
    // Show distance measurements
    if (state.selectedIds.length === 1) {
      const movingShelf = state.shelves.find(s => s.id === state.selectedIds[0]);
      if (movingShelf) showDistances(movingShelf);
    }
    if (wallDragOffsets.length > 0) {
      wallDragOffsets.forEach(wo => {
        const w = state.walls.find(x => x.id === wo.id); if (!w) return;
        w.x = dragStart.x + wo.ox + totalDx;
        w.y = dragStart.y + wo.oy + totalDy;
      });
    }
    if (landmarkDragOffsets.length > 0) renderLandmarks();
    if (wallDragOffsets.length > 0) renderWalls();
    renderShelves(); updateSelectionPanel(); return;
  }

  if (isDraggingLandmark) {
    const zone = state.landmarks.find(z => z.id === state.selectedLandmarkId);
    if (zone) { zone.x = snap(pos.x + landmarkDragOffset.ox); zone.y = snap(pos.y + landmarkDragOffset.oy); }
    renderLandmarks(); renderShelves(); renderLandmarkOverlays(); updateLandmarkPanel(); return;
  }

  if (isResizingShelf) {
    const rs = state.shelves.find(x => x.id === shelfResizeId);
    if (!rs) return;
    // DEFAULT = fine, pixel-perfect drag (match the overlay line exactly).
    // Hold SHIFT to snap: grid for custom, whole modules for standard/angled.
    const o = shelfResizeOrig, hnd = shelfResizeHandle, snapping = e.shiftKey;
    const px = snapping ? snap(pos.x) : Math.round(pos.x);
    const py = snapping ? snap(pos.y) : Math.round(pos.y);
    if (o.type === 'custom') {
      if (hnd === 'br') { rs.customW = Math.max(4, px - o.x); rs.customH = Math.max(4, py - o.y); }
      else if (hnd === 'tl') { rs.x = Math.min(px, o.x + o.customW - 4); rs.y = Math.min(py, o.y + o.customH - 4); rs.customW = Math.max(4, o.x + o.customW - rs.x); rs.customH = Math.max(4, o.y + o.customH - rs.y); }
      else if (hnd === 'tr') { rs.y = Math.min(py, o.y + o.customH - 4); rs.customW = Math.max(4, px - o.x); rs.customH = Math.max(4, o.y + o.customH - rs.y); }
      else if (hnd === 'bl') { rs.x = Math.min(px, o.x + o.customW - 4); rs.customW = Math.max(4, o.x + o.customW - rs.x); rs.customH = Math.max(4, py - o.y); }
    } else if (o.angle != null && (hnd === 'tl' || hnd === 'tr' || hnd === 'bl' || hnd === 'br')) {
      // Corner resize in the shelf's rotated frame: length along u, depth along
      // v, anchored at the diagonally-opposite corner. Fine by default (keep
      // module count, flex bay width + free depth); Shift snaps length to whole
      // modules and depth to the grid.
      const rad = o.angle * Math.PI/180;
      const ux = Math.cos(rad), uy = Math.sin(rad);      // length axis
      const vx = -Math.sin(rad), vy = Math.cos(rad);     // depth axis
      const sgnL = (hnd === 'tr' || hnd === 'br') ? 1 : -1;
      const sgnD = (hnd === 'bl' || hnd === 'br') ? 1 : -1;
      const len0 = o.modules * o.bayW, dep0 = o.depth;
      const fx = o.cx - sgnL * (len0/2) * ux - sgnD * (dep0/2) * vx;  // fixed opposite corner
      const fy = o.cy - sgnL * (len0/2) * uy - sgnD * (dep0/2) * vy;
      const dx = pos.x - fx, dy = pos.y - fy;
      let len = Math.max(4, sgnL * (dx*ux + dy*uy));
      let dep = Math.max(4, sgnD * (dx*vx + dy*vy));
      const baseBw = isStockroom(rs) ? state.stockroomBayW : state.moduleWidth;
      if (snapping) { rs.modules = Math.max(1, Math.round(len / baseBw)); rs.bayW = null; len = rs.modules * baseBw; dep = Math.max(4, snap(dep)); }
      else { rs.modules = o.modules; rs.bayW = +(len / o.modules).toFixed(2); dep = Math.round(dep); }
      rs.depth = +dep.toFixed(2);
      const ncx = fx + sgnL * (len/2) * ux + sgnD * (dep/2) * vx;
      const ncy = fy + sgnL * (len/2) * uy + sgnD * (dep/2) * vy;
      rs.x = Math.round(ncx - len/2); rs.y = Math.round(ncy - dep/2);
    } else {
      const baseBw = isStockroom(rs) ? state.stockroomBayW : state.moduleWidth;
      const setLen = (len, moveOrigin, axis) => {
        len = Math.max(4, len);
        if (snapping) { rs.modules = Math.max(1, Math.round(len / baseBw)); rs.bayW = null; len = rs.modules * baseBw; }
        else { rs.modules = o.modules; rs.bayW = +(len / o.modules).toFixed(2); } // pixel-perfect: flex bay width, keep count
        return len;
      };
      if (hnd === 'e') { setLen(px - o.x); }
      else if (hnd === 'w') { const right = o.x + o.modules * o.bayW; const L = setLen(right - px); rs.x = Math.round(right - L); }
      else if (hnd === 's') { setLen(py - o.y); }
      else if (hnd === 'n') { const bot = o.y + o.modules * o.bayW; const L = setLen(bot - py); rs.y = Math.round(bot - L); }
    }
    renderShelves(); updateSelectionPanel(); return;
  }

  if (isResizingLandmark) {
    const zone = state.landmarks.find(z => z.id === state.selectedLandmarkId);
    if (!zone) return;
    const dx = snap(pos.x) - snap(landmarkResizeStart.x), dy = snap(pos.y) - snap(landmarkResizeStart.y);
    const o = landmarkResizeOrig;
    if (landmarkResizeHandle === 'br') { zone.w = Math.max(20, o.w + dx); zone.h = Math.max(20, o.h + dy); }
    else if (landmarkResizeHandle === 'tl') { zone.x = o.x + dx; zone.y = o.y + dy; zone.w = Math.max(20, o.w - dx); zone.h = Math.max(20, o.h - dy); }
    else if (landmarkResizeHandle === 'tr') { zone.y = o.y + dy; zone.w = Math.max(20, o.w + dx); zone.h = Math.max(20, o.h - dy); }
    else if (landmarkResizeHandle === 'bl') { zone.x = o.x + dx; zone.w = Math.max(20, o.w - dx); zone.h = Math.max(20, o.h + dy); }
    renderLandmarks(); renderShelves(); renderLandmarkOverlays(); updateLandmarkPanel(); return;
  }

  if (isDraggingWall) {
    const wall = state.walls.find(w => w.id === state.selectedWallId);
    if (wall) { wall.x = snap(pos.x + wallDragOffset.ox); wall.y = snap(pos.y + wallDragOffset.oy); }
    renderWalls(); renderShelves(); renderWallOverlays(); updateWallPanel(); return;
  }

  if (isResizingWall) {
    const wall = state.walls.find(w => w.id === state.selectedWallId);
    if (!wall) return;
    const dx = snap(pos.x) - snap(wallResizeStart.x), dy = snap(pos.y) - snap(wallResizeStart.y);
    const o = wallResizeOrig;
    if (wallResizeHandle === 'br') { wall.w = Math.max(4, o.w + dx); wall.h = Math.max(4, o.h + dy); }
    else if (wallResizeHandle === 'tl') { wall.x = o.x + dx; wall.y = o.y + dy; wall.w = Math.max(4, o.w - dx); wall.h = Math.max(4, o.h - dy); }
    else if (wallResizeHandle === 'tr') { wall.y = o.y + dy; wall.w = Math.max(4, o.w + dx); wall.h = Math.max(4, o.h - dy); }
    else if (wallResizeHandle === 'bl') { wall.x = o.x + dx; wall.w = Math.max(4, o.w - dx); wall.h = Math.max(4, o.h + dy); }
    renderWalls(); renderShelves(); renderWallOverlays(); updateWallPanel(); return;
  }

  if (isDraggingToryPoint) {
    const tl = state.toryLines.find(t => t.id === state.selectedToryLineId);
    if (tl && tl.points[toryPointDragIdx]) {
      let px = snap(pos.x), py = snap(pos.y);
      // Snap to axis alignment with nearest neighbor
      const prev = tl.points[toryPointDragIdx - 1];
      const next = tl.points[toryPointDragIdx + 1];
      const neighbor = prev || next;
      if (neighbor) {
        const dx = Math.abs(px - neighbor.x), dy = Math.abs(py - neighbor.y);
        if (dx <= dy) px = neighbor.x; else py = neighbor.y;
      }
      tl.points[toryPointDragIdx].x = px;
      tl.points[toryPointDragIdx].y = py;
    }
    renderToryLines(); renderShelves(); renderToryLineOverlays(); updateToryLinePanel(); return;
  }

  if (isDraggingToryLine) {
    const tl = state.toryLines.find(t => t.id === state.selectedToryLineId);
    if (tl) {
      const dx = snap(pos.x) - toryLineDragStart.x;
      const dy = snap(pos.y) - toryLineDragStart.y;
      tl.points.forEach((p, i) => { p.x = tl._origPoints[i].x + dx; p.y = tl._origPoints[i].y + dy; });
    }
    renderToryLines(); renderShelves(); renderToryLineOverlays(); updateToryLinePanel(); return;
  }

  if (isSelecting) {
    const sx = Math.min(selectStart.x, pos.x), sy = Math.min(selectStart.y, pos.y);
    const sw = Math.abs(pos.x - selectStart.x), sh = Math.abs(pos.y - selectStart.y);
    if (!selectBox) { selectBox = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); selectBox.classList.add('selection-box'); overlayGroup.appendChild(selectBox); }
    selectBox.setAttribute('x', sx); selectBox.setAttribute('y', sy); selectBox.setAttribute('width', sw); selectBox.setAttribute('height', sh);
    state.selectedIds = state.shelves.filter(s => selectionIntersectsShelf(sx, sy, sw, sh, s)).map(s => s.id);
    state.selectedLandmarkIds = state.landmarks.filter(z => { return z.x < sx+sw && z.x+z.w > sx && z.y < sy+sh && z.y+z.h > sy; }).map(z => z.id);
    state.selectedWallIds = state.walls.filter(w => { return w.x < sx+sw && w.x+w.w > sx && w.y < sy+sh && w.y+w.h > sy; }).map(w => w.id);
    // Select tory line if any point is inside box
    state.selectedToryLineId = null;
    state.toryLines.forEach(tl => { if (tl.points.some(p => p.x >= sx && p.x <= sx+sw && p.y >= sy && p.y <= sy+sh)) state.selectedToryLineId = tl.id; });
    // Select emergency markers inside box
    state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
    state.emergencyMarkers.forEach(em => { if (em.x >= sx && em.x <= sx+sw && em.y >= sy && em.y <= sy+sh) state.selectedEmergencyId = em.id; });
    state.selectedLandmarkId = null;
    renderLandmarks();
    renderWalls();
    renderToryLines();
    renderEmergency();
    renderShelves();
    // renderShelves clears overlayGroup — re-append selection box
    if (selectBox) overlayGroup.appendChild(selectBox);
  }
}

function onPointerUp(e) {
  // Split tool: finish a slice. Quick click → cut one shelf at the point;
  // drag → slice every shelf the line crosses. Default fine (exact), Shift snaps.
  if (isSlicing && sliceStart) {
    const up = screenToCanvas(e.clientX, e.clientY);
    const prev = document.getElementById('slicePreview'); if (prev) prev.remove();
    const dist = Math.hypot(up.x - sliceStart.x, up.y - sliceStart.y);
    const start = sliceStart; isSlicing = false; sliceStart = null;
    const fine = !e.shiftKey;
    if (dist < 5 / (state.zoom || 1)) {
      // treat as a click cut at the down point
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const grp = el && el.closest ? el.closest('.shelf-group') : null;
      if (grp) {
        const s2 = state.shelves.find(x => x.id === grp.dataset.id);
        if (s2 && s2.type !== 'sixway') {
          const dim = getDims(s2);
          let frac;
          if (s2.type === 'custom') frac = ((s2.customW || 0) >= (s2.customH || 0)) ? (start.x - s2.x) / dim.w : (start.y - s2.y) / dim.h;
          else if (s2.orientation === 'A' && s2.angle != null) { const cx = s2.x + dim.w/2, cy = s2.y + dim.h/2, rad = s2.angle*Math.PI/180; frac = 0.5 + ((start.x - cx)*Math.cos(rad) + (start.y - cy)*Math.sin(rad)) / (dim.w || 1); }
          else frac = (s2.orientation === 'V') ? (start.y - s2.y) / dim.h : (start.x - s2.x) / dim.w;
          if (!splitShelfCross(s2.id, frac, { fine })) alert('This shelf is a single bay — add modules first, or use a custom shelf, to split it.');
        }
      }
    } else {
      const n = sliceShelvesAlongLine(start.x, start.y, up.x, up.y, fine);
      if (!n) { const st = document.getElementById('statusInfo'); /* no shelves crossed */ }
    }
    return;
  }

  // Walk-paths: resolve press → drag end or chain click
  if (state.tool === 'paths' && pathDragCand) {
    var pCand = pathDragCand; pathDragCand = null;

    // End of a node drag (either mode): just finalise the selection.
    if (isDraggingPathNode) {
      isDraggingPathNode = false;
      var wasGroup = !!pathGroupDragStart;
      pathGroupDragStart = null;
      if (!wasGroup) {
        // single-node drag → it becomes the sole selection
        state.selectedPathNodeId = pCand.hitId;
        state.selectedPathNodeIds = pCand.hitId ? [pCand.hitId] : [];
      }
      // group drag keeps the existing multi-selection
      state.selectedPathEdge = null;
      renderPaths(); updatePathPanel(); markDirty();
      return;
    }

    if (pathMode === 'select') {
      // SELECT/EDIT: click a node → select it; Shift+click → add/remove from the group;
      // click an edge → select it; empty → clear.
      if (pCand.hitId) {
        var cur = state.selectedPathNodeIds || [];
        if (pCand.shift) {
          var at = cur.indexOf(pCand.hitId);
          if (at >= 0) cur = cur.slice(0, at).concat(cur.slice(at + 1));   // toggle off
          else cur = cur.concat([pCand.hitId]);                            // add
        } else {
          cur = [pCand.hitId];                                             // plain click → sole selection
        }
        state.selectedPathNodeIds = cur;
        state.selectedPathNodeId = cur.length ? cur[cur.length - 1] : null;
        state.selectedPathEdge = null;
      } else if (pCand.edge) {
        state.selectedPathEdge = { a: pCand.edge.a, b: pCand.edge.b };
        state.selectedPathNodeId = null; state.selectedPathNodeIds = [];
      } else {
        state.selectedPathNodeId = null; state.selectedPathNodeIds = []; state.selectedPathEdge = null;
      }
      renderPaths(); updatePathPanel();
      return;
    }

    // CONNECT: place nodes + chain links, with the preview line showing intent.
    // Clicking a link while NOT mid-chain selects it (for Del) instead of dropping a node.
    if (!pCand.hitId && pCand.edge && !pathChainPrevId) {
      state.selectedPathEdge = { a: pCand.edge.a, b: pCand.edge.b };
      state.selectedPathNodeId = null;
      state.selectedPathNodeIds = [];
      pathCursor = null;
      renderPaths(); updatePathPanel();
      return;
    }
    if (pCand.hitId) {
      if (!pathChainPrevId) {
        pathChainPrevId = pCand.hitId;                       // arm the chain from this node (no change yet)
      } else if (pathChainPrevId === pCand.hitId) {
        pathChainPrevId = null;                              // click the armed node again → stop chaining
      } else {
        saveState();                                         // link/unlink changes the graph → undoable
        // If the two are already linked, this is an unlink (toggle). Otherwise create
        // the link with auto-junctions where it crosses existing links.
        if (pathEdgeIndex(pathChainPrevId, pCand.hitId) >= 0) {
          togglePathEdge(pathChainPrevId, pCand.hitId);      // unlink
        } else {
          linkWithJunctions(pathChainPrevId, pCand.hitId);   // link (+ junctions on crossings)
        }
        pathChainPrevId = pCand.hitId;                       // continue chaining from here
      }
      state.selectedPathNodeId = pCand.hitId;
    } else {
      saveState();                                           // add a node (+ link from the armed node)
      // If the drop lands on an existing link's interior, split it into a T-junction
      // (common when an aisle spine ends on the racetrack along the shelf run).
      var ignoreForT = pathChainPrevId ? [pathChainPrevId] : [];
      var pNew = addPathNodeOnEdgeAware(pCand.sx, pCand.sy, ignoreForT);
      if (pathChainPrevId) linkWithJunctions(pathChainPrevId, pNew.id);
      pathChainPrevId = pNew.id;
      state.selectedPathNodeId = pNew.id;
    }
    state.selectedPathEdge = null;
    state.selectedPathNodeIds = state.selectedPathNodeId ? [state.selectedPathNodeId] : [];
    pathCursor = null;
    renderPaths(); updatePathPanel(); markDirty();
    return;
  }

  guidesGroup.innerHTML = '';
  overlayGroup.querySelectorAll('.boundary-preview-line').forEach(el => el.remove());
  if (isPanning) { isPanning = false; canvasContainer.classList.remove('panning'); if (_panRaf) { cancelAnimationFrame(_panRaf); _panRaf = 0; } if (_panPending) { state.panX = _panPending.px; state.panY = _panPending.py; _panPending = null; updateTransform(); } return; }
  if (isDraggingUnderlay) { isDraggingUnderlay = false; underlayDragStart = null; return; }
  if (isDraggingBoundaryPt) { isDraggingBoundaryPt = false; boundaryDragIdx = -1; renderBoundary(); return; }

  // Zoom box drawing finalize
  if (isDrawingZoombox) {
    isDrawingZoombox = false;
    overlayGroup.querySelectorAll('.zoombox-preview').forEach(el => el.remove());
    const pos = screenToCanvas(e.clientX, e.clientY);
    const sx = zoomboxDrawStart.x, sy = zoomboxDrawStart.y;
    const ex = snap(pos.x), ey = snap(pos.y);
    const x = Math.min(sx, ex), y = Math.min(sy, ey);
    const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
    if (w >= 20 && h >= 20) {
      saveState();
      const zb = { id: 'zb_' + state.nextId++, dept: '', label: '', x, y, w, h };
      state.deptZoomBoxes.push(zb);
      state.selectedZoomboxId = zb.id;
      state.selectedIds = []; state.selectedLandmarkId = null;
      renderAll();
      // Open dept picker so user assigns immediately
      setTimeout(() => toggleDeptPicker('zoomboxDeptPicker'), 100);
    }
    zoomboxDrawStart = null;
    return;
  }

  // Zoom box drag/resize end
  if (isDraggingZoombox) { isDraggingZoombox = false; zoomboxDragStart = null; zoomboxDragOffset = null; markDirty(); return; }
  if (isResizingZoombox) { isResizingZoombox = false; zoomboxDragStart = null; markDirty(); return; }

  // Emergency drag end
  if (isDraggingEmergency) { isDraggingEmergency = false; emergencyDragOffset = null; markDirty(); return; }
  if (isDraggingPriceCheck) { isDraggingPriceCheck = false; priceCheckDragOffset = null; markDirty(); return; }
  if (isDraggingToryDock) { isDraggingToryDock = false; toryDockDragOffset = null; markDirty(); return; }

  if (isDrawing) {
    isDrawing = false;
    if (drawPreview) { drawPreview.remove(); drawPreview = null; }
    if (drawLabel) { drawLabel.remove(); drawLabel = null; }
    const pos = screenToCanvas(e.clientX, e.clientY);
    const sw = Math.abs(snap(pos.x) - drawStart.x), sh = Math.abs(snap(pos.y) - drawStart.y);
    if (sw >= 10 || sh >= 10) {
      saveState();
      const shelf = createShelf(drawStart.x, drawStart.y, sw, sh);
      state.shelves.push(shelf);
      state.selectedIds = [shelf.id]; state.selectedLandmarkId = null;
      renderAll();
      setTimeout(() => document.getElementById('propName').focus(), 50);
    }
    return;
  }

  if (isDrawingCustom) {
    isDrawingCustom = false;
    if (drawPreview) { drawPreview.remove(); drawPreview = null; }
    if (drawLabel) { drawLabel.remove(); drawLabel = null; }
    const pos = screenToCanvas(e.clientX, e.clientY);
    const sx = Math.min(drawStart.x, snap(pos.x)), sy = Math.min(drawStart.y, snap(pos.y));
    const sw = Math.max(state.gridSize, Math.abs(snap(pos.x) - drawStart.x));
    const sh = Math.max(state.gridSize, Math.abs(snap(pos.y) - drawStart.y));
    if (sw >= state.gridSize && sh >= state.gridSize) {
      saveState();
      const shelf = {
        id: 'shelf_' + state.nextId++,
        type: 'custom',
        name: '', subname: '',
        x: snap(sx), y: snap(sy),
        customW: snap(sw), customH: snap(sh),
        dept: state.departments.find(d => d.id !== 'stockroom')?.id || '',
        orientation: 'H', modules: 1, angle: null,
        bayW: null, depth: null, inactive: false,
      };
      state.shelves.push(shelf);
      state.selectedIds = [shelf.id]; state.selectedLandmarkId = null;
      renderAll();
      setTimeout(() => document.getElementById('propName').focus(), 50);
    }
    return;
  }

  if (isDrawingSixway) {
    isDrawingSixway = false;
    overlayGroup.querySelectorAll('.sixway-preview').forEach(el => el.remove());
    const pos = screenToCanvas(e.clientX, e.clientY);
    const dx = snap(pos.x) - drawStart.x, dy = snap(pos.y) - drawStart.y;
    const radius = Math.max(state.gridSize, Math.round(Math.sqrt(dx*dx + dy*dy)));
    if (radius >= state.gridSize) {
      saveState();
      const shelf = {
        id: 'shelf_' + state.nextId++,
        type: 'sixway',
        name: '', subname: '',
        x: drawStart.x, y: drawStart.y, // center point
        radius: snap(radius),
        dept: state.departments.find(d => d.id !== 'stockroom')?.id || '',
        orientation: 'H', modules: 1, angle: null,
        bayW: null, depth: null, inactive: false, locked: false,
      };
      state.shelves.push(shelf);
      state.selectedIds = [shelf.id]; state.selectedLandmarkId = null;
      renderAll();
      setTimeout(() => document.getElementById('propName').focus(), 50);
    }
    return;
  }

  if (isDrawingLandmark) {
    isDrawingLandmark = false;
    if (drawPreview) { drawPreview.remove(); drawPreview = null; }
    const pos = screenToCanvas(e.clientX, e.clientY);
    const sx = Math.min(drawStart.x, snap(pos.x)), sy = Math.min(drawStart.y, snap(pos.y));
    const sw = Math.abs(snap(pos.x) - drawStart.x), sh = Math.abs(snap(pos.y) - drawStart.y);
    if (sw >= 20 || sh >= 20) {
      saveState();
      const zone = createLandmark(sx, sy, sw, sh);
      state.landmarks.push(zone);
      state.selectedLandmarkId = zone.id; state.selectedIds = [];
      renderAll();
      setTimeout(() => document.getElementById('landmarkPropLabel').focus(), 50);
    }
    return;
  }

  if (isDrawingWall) {
    isDrawingWall = false;
    if (drawPreview) { drawPreview.remove(); drawPreview = null; }
    const pos = screenToCanvas(e.clientX, e.clientY);
    const sx = Math.min(drawStart.x, snap(pos.x)), sy = Math.min(drawStart.y, snap(pos.y));
    const sw = Math.abs(snap(pos.x) - drawStart.x), sh = Math.abs(snap(pos.y) - drawStart.y);
    if (sw >= 4 || sh >= 4) {
      saveState();
      const wall = createWall(sx, sy, sw, sh);
      state.walls.push(wall);
      state.selectedWallId = wall.id; state.selectedIds = [];
      renderAll();
    }
    return;
  }

  if (isResizingShelf) { isResizingShelf = false; shelfResizeHandle = null; shelfResizeId = null; renderAll(); return; }
  if (isDragging) { isDragging = false; landmarkDragOffsets = []; wallDragOffsets = []; overlayGroup.querySelectorAll('.distance-label,.distance-line').forEach(el => el.remove()); renderShelfList(); return; }
  if (isDraggingLandmark) { isDraggingLandmark = false; return; }
  if (isResizingLandmark) { isResizingLandmark = false; renderAll(); return; }
  if (isDraggingWall) { isDraggingWall = false; return; }
  if (isResizingWall) { isResizingWall = false; renderAll(); return; }
  if (isDraggingToryLine) { isDraggingToryLine = false; const tl = state.toryLines.find(t => t.id === state.selectedToryLineId); if (tl) delete tl._origPoints; return; }
  if (isDraggingToryPoint) { isDraggingToryPoint = false; toryPointDragIdx = -1; renderAll(); return; }
  if (isSelecting) {
    isSelecting = false; if (selectBox) { selectBox.remove(); selectBox = null; }
    // If box selected exactly 1 landmark and 0 shelves, use single-edit mode
    if (state.selectedLandmarkIds.length === 1 && state.selectedIds.length === 0) {
      state.selectedLandmarkId = state.selectedLandmarkIds[0];
      state.selectedLandmarkIds = [];
    }
    renderAll();
  }
}

// ═══════════════════════════════════════════════════════════
// CONTEXT MENU & ACTIONS
// ═══════════════════════════════════════════════════════════

function onContextMenu(e) {
  e.preventDefault();
  hideBoundaryContextMenu();

  // Boundary point right-click
  const bPt = e.target.closest('.boundary-point');
  if (bPt) {
    boundaryContextIdx = +bPt.dataset.boundaryIdx;
    const m = document.getElementById('boundaryContextMenu');
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.classList.add('visible');
    return;
  }

  const shelfEl = e.target.closest('.shelf-group');
  if (shelfEl) {
    const id = shelfEl.dataset.id;
    if (!state.selectedIds.includes(id)) { state.selectedIds = [id]; state.selectedLandmarkId = null; renderAll(); }
    const m = document.getElementById('contextMenu');
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.classList.add('visible');
    return;
  }
  const zoneEl = e.target.closest('.landmark-group');
  if (zoneEl) {
    state.selectedLandmarkId = zoneEl.dataset.landmarkId; state.selectedIds = []; renderAll();
    const m = document.getElementById('contextMenu');
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.classList.add('visible');
    return;
  }
  const wallEl = e.target.closest('.wall-group');
  if (wallEl) {
    state.selectedWallId = wallEl.dataset.wallId; state.selectedIds = []; state.selectedLandmarkId = null; renderAll();
    const m = document.getElementById('contextMenu');
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.classList.add('visible');
    return;
  }
  const toryEl = e.target.closest('.tory-line-group');
  if (toryEl) {
    state.selectedToryLineId = toryEl.dataset.toryLineId; state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; renderAll();
    const m = document.getElementById('contextMenu');
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.classList.add('visible');
    return;
  }
  const emEl = e.target.closest('.emergency-group');
  if (emEl) {
    state.selectedEmergencyId = emEl.dataset.emergencyId; state.selectedIds = []; state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = null; renderAll();
    const m = document.getElementById('contextMenu');
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.classList.add('visible');
    return;
  }
  // Inject move-to-floor option into context menu if multiple floors
  setTimeout(() => {
    const cm = document.getElementById('contextMenu');
    if (!cm || !cm.classList.contains('visible')) return;
    if (state.floors.length > 1) {
      cm.querySelectorAll('.ctx-move-floor').forEach(el => el.remove());
      const sep = document.createElement('div');
      sep.className = 'ctx-move-floor';
      sep.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
      cm.appendChild(sep);
      state.floors.filter(f => f.id !== state.currentFloorId).forEach(f => {
        const btn = document.createElement('div');
        btn.className = 'context-item ctx-move-floor';
        btn.innerHTML = '<span class="floor-type-dot ' + (f.type||'foh') + '" style="margin-right:4px"></span>Move to ' + f.name;
        btn.onclick = () => { moveSelectedToFloor(f.id); hideContextMenu(); };
        cm.appendChild(btn);
      });
    }
  }, 0);
}

let boundaryContextIdx = -1;
function deleteBoundaryPoint() {
  if (boundaryContextIdx < 0 || boundaryContextIdx >= state.boundary.length) return;
  if (state.boundary.length <= 3) { alert('Border needs at least 3 points. Use Clear to remove entirely.'); hideBoundaryContextMenu(); return; }
  saveState();
  state.boundary.splice(boundaryContextIdx, 1);
  boundaryContextIdx = -1;
  hideBoundaryContextMenu(); renderAll();
}

function hideBoundaryContextMenu() { document.getElementById('boundaryContextMenu').classList.remove('visible'); }

function hideContextMenu() { document.getElementById('contextMenu').classList.remove('visible'); hideBoundaryContextMenu(); }
document.addEventListener('click', () => hideContextMenu());

// Refocus canvas when clicking non-input elements
document.addEventListener('mousedown', e => {
  if (!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) && !e.target.closest('.panel-select') && !e.target.closest('.dept-picker')) {
    setTimeout(() => {
      if (!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
        canvasContainer.focus();
      }
    }, 10);
  }
});

function deleteSelected() {
  if (state.selectedLandmarkId) {
    saveState(); state.landmarks = state.landmarks.filter(z => z.id !== state.selectedLandmarkId);
    state.selectedLandmarkId = null; renderAll(); hideContextMenu(); return;
  }
  if (state.selectedWallId) {
    saveState(); state.walls = state.walls.filter(w => w.id !== state.selectedWallId);
    state.selectedWallId = null; renderAll(); hideContextMenu(); return;
  }
  if (state.selectedToryLineId) {
    saveState(); state.toryLines = state.toryLines.filter(t => t.id !== state.selectedToryLineId);
    state.selectedToryLineId = null; renderAll(); hideContextMenu(); return;
  }
  if (state.selectedToryDockId) {
    saveState(); state.toryDocks = (state.toryDocks || []).filter(t => t.id !== state.selectedToryDockId);
    state.selectedToryDockId = null; renderAll(); hideContextMenu(); return;
  }
  if (state.selectedEmergencyId) {
    saveState(); state.emergencyMarkers = state.emergencyMarkers.filter(m => m.id !== state.selectedEmergencyId);
    state.selectedEmergencyId = null; state.selectedPriceCheckId = null; renderAll(); hideContextMenu(); return;
  }
  // Mixed mode: delete shelves, landmarks, walls, tory lines, emergency markers
  if (state.selectedIds.length || state.selectedLandmarkIds.length || state.selectedWallIds.length) {
    saveState();
    if (state.selectedIds.length) state.shelves = state.shelves.filter(s => !state.selectedIds.includes(s.id));
    if (state.selectedLandmarkIds.length) state.landmarks = state.landmarks.filter(z => !state.selectedLandmarkIds.includes(z.id));
    if (state.selectedWallIds.length) state.walls = state.walls.filter(w => !state.selectedWallIds.includes(w.id));
    state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedWallIds = []; renderAll(); hideContextMenu(); return;
  }
}

function duplicateSelected() {
  if (state.selectedLandmarkId) {
    saveState();
    const o = state.landmarks.find(z => z.id === state.selectedLandmarkId); if (!o) return;
    const c = { ...o, id: 'landmark_' + state.nextId++, x: o.x + 20, y: o.y + 20 };
    state.landmarks.push(c); state.selectedLandmarkId = c.id; renderAll(); hideContextMenu(); return;
  }
  if (state.selectedWallId) {
    duplicateWall(); hideContextMenu(); return;
  }
  if (state.selectedToryLineId) {
    duplicateToryLine(); hideContextMenu(); return;
  }
  if (state.selectedEmergencyId) {
    saveState();
    const o = state.emergencyMarkers.find(m => m.id === state.selectedEmergencyId); if (!o) return;
    const c = { ...o, id: 'em_' + state.nextId++, x: o.x + 20, y: o.y + 20 };
    state.emergencyMarkers.push(c); state.selectedEmergencyId = c.id; renderAll(); hideContextMenu(); return;
  }
  if (!state.selectedIds.length && !state.selectedLandmarkIds.length && !state.selectedWallIds.length) return;
  saveState();
  const offset = state.gridSize * 2;
  const newIds = [];
  state.selectedIds.forEach(id => {
    const o = state.shelves.find(s => s.id === id); if (!o) return;
    const c = { ...o, id: 'shelf_' + state.nextId++, x: o.x + offset, y: o.y + offset };
    if (c.locations) c.locations = [...c.locations];
    state.shelves.push(c); newIds.push(c.id);
  });
  const newLandmarkIds = [];
  state.selectedLandmarkIds.forEach(lid => {
    const o = state.landmarks.find(z => z.id === lid); if (!o) return;
    const c = { ...o, id: 'landmark_' + state.nextId++, x: o.x + offset, y: o.y + offset };
    state.landmarks.push(c); newLandmarkIds.push(c.id);
  });
  state.selectedIds = newIds;
  state.selectedLandmarkIds = newLandmarkIds;
  renderAll(); hideContextMenu();
}

// ═══════════════════════════════════════════════════════════
// SPLIT SHELVES (v0.424) — carve a detected whole-unit rectangle into the
// addressable pieces the store actually uses: two runs (crosswise), or the
// two shopping faces S1/S2 (lengthwise). Fills the gap where detection grabs
// a gondola as a single shelf.
// ═══════════════════════════════════════════════════════════

function splittableShelf(id) {
  const s = state.shelves.find(x => x.id === id);
  if (!s) return null;
  if (s.type === 'sixway') return null;
  return s;
}

// Crosswise: cut a run into two shorter runs. `frac` (0..1) is the position
// along the shelf's length; for standard shelves it snaps to a module edge.
function splitShelfCross(id, frac, opts) {
  opts = opts || {};
  const fine = !!opts.fine, batch = !!opts.batch;   // fine = cut at exact position; batch = caller owns saveState/render
  const s = splittableShelf(id);
  if (!s) return false;
  const idx = state.shelves.indexOf(s);
  const mk = (over) => Object.assign({}, s, over, { id: 'shelf_' + state.nextId++ });
  const commit = (a, b) => { state.shelves.splice(idx, 1, a, b); if (!batch) { state.selectedIds = [a.id, b.id]; renderAll(); } };
  if (!batch) saveState();

  if (s.type === 'custom') {
    const horiz = (s.customW || 0) >= (s.customH || 0);
    const along = horiz ? s.customW : s.customH;
    const raw = fine ? frac * along : Math.round(frac * along);
    const cut = Math.max(4, Math.min(along - 4, Math.round(raw)));
    const a = mk(horiz ? { customW: cut } : { customH: cut });
    const b = mk(horiz ? { customW: along - cut, x: s.x + cut } : { customH: along - cut, y: s.y + cut });
    commit(a, b); return true;
  }

  const modules = s.modules || 1;
  const bayW = getShelfBayW(s);
  const L = modules * bayW;
  let m1, m2, L1, L2, bw1 = null, bw2 = null;
  if (fine) {
    L1 = Math.max(4, Math.min(L - 4, frac * L)); L2 = L - L1;
    m1 = Math.max(1, Math.round(L1 / bayW)); m2 = Math.max(1, Math.round(L2 / bayW));
    bw1 = +(L1 / m1).toFixed(2); bw2 = +(L2 / m2).toFixed(2);   // exact-length pieces
  } else {
    if (modules < 2) { if (!batch) { state.undoStack.pop(); } return false; }  // can't module-split one bay
    m1 = Math.max(1, Math.min(modules - 1, Math.round(frac * modules)));
    m2 = modules - m1; L1 = m1 * bayW; L2 = m2 * bayW;
  }

  if (s.orientation === 'A' && s.angle != null) {
    const dim = getDims(s);
    const cx = s.x + dim.w / 2, cy = s.y + dim.h / 2;
    const rad = s.angle * Math.PI / 180, ux = Math.cos(rad), uy = Math.sin(rad);
    const depth = getShelfDepth(s);
    const sx = cx - (L / 2) * ux, sy = cy - (L / 2) * uy;   // module-0 end
    const c1 = L1 / 2, c2 = L1 + L2 / 2;
    const p1cx = sx + c1 * ux, p1cy = sy + c1 * uy, p2cx = sx + c2 * ux, p2cy = sy + c2 * uy;
    const a = mk({ modules: m1, bayW: bw1, x: Math.round(p1cx - L1 / 2), y: Math.round(p1cy - depth / 2) });
    const b = mk({ modules: m2, bayW: bw2, x: Math.round(p2cx - L2 / 2), y: Math.round(p2cy - depth / 2) });
    commit(a, b); return true;
  }

  const horiz = s.orientation !== 'V';
  const a = mk({ modules: m1, bayW: bw1 });
  const b = horiz ? mk({ modules: m2, bayW: bw2, x: Math.round(s.x + L1) }) : mk({ modules: m2, bayW: bw2, y: Math.round(s.y + L1) });
  commit(a, b); return true;
}

// Slice every shelf a drawn line crosses, at the crossing point. One undo step.
function sliceShelvesAlongLine(ax, ay, bx, by, fine) {
  const cuts = [];
  state.shelves.forEach(s => {
    if (s.type === 'sixway') return;
    const dim = getDims(s);
    // shelf length centerline (2 endpoints) in canvas space
    let p, q, along;
    if (s.type === 'custom') {
      const horiz = (s.customW || 0) >= (s.customH || 0);
      along = horiz ? dim.w : dim.h;
      if (horiz) { p = { x: s.x, y: s.y + dim.h / 2 }; q = { x: s.x + dim.w, y: s.y + dim.h / 2 }; }
      else { p = { x: s.x + dim.w / 2, y: s.y }; q = { x: s.x + dim.w / 2, y: s.y + dim.h }; }
    } else if (s.orientation === 'A' && s.angle != null) {
      const cx = s.x + dim.w / 2, cy = s.y + dim.h / 2, rad = s.angle * Math.PI / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad); along = dim.w;
      p = { x: cx - (along / 2) * ux, y: cy - (along / 2) * uy };
      q = { x: cx + (along / 2) * ux, y: cy + (along / 2) * uy };
    } else if (s.orientation === 'V') {
      along = dim.h; p = { x: s.x + dim.w / 2, y: s.y }; q = { x: s.x + dim.w / 2, y: s.y + dim.h };
    } else {
      along = dim.w; p = { x: s.x, y: s.y + dim.h / 2 }; q = { x: s.x + dim.w, y: s.y + dim.h / 2 };
    }
    const t = segParamAtIntersect(p, q, { x: ax, y: ay }, { x: bx, y: by });
    if (t != null && t > 0.02 && t < 0.98) cuts.push({ id: s.id, frac: t });
  });
  if (!cuts.length) return 0;
  saveState();
  const newIds = [];
  cuts.forEach(c => {
    // find current index each time (array mutates); split without its own undo/render
    if (splitShelfCross(c.id, c.frac, { fine, batch: true })) {
      // the two pieces are the last two spliced in place of c.id — collect selection later
    }
  });
  state.selectedIds = [];
  renderAll();
  return cuts.length;
}

// Parametric intersection of segment P-Q with segment A-B. Returns t in [0,1]
// along P-Q at the crossing, or null if they don't cross within both segments.
function segParamAtIntersect(P, Q, A, B) {
  const r = { x: Q.x - P.x, y: Q.y - P.y }, srr = { x: B.x - A.x, y: B.y - A.y };
  const denom = r.x * srr.y - r.y * srr.x;
  if (Math.abs(denom) < 1e-9) return null;   // parallel
  const t = ((A.x - P.x) * srr.y - (A.y - P.y) * srr.x) / denom;
  const u = ((A.x - P.x) * r.y - (A.y - P.y) * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

function splitSelectedHalve() {
  const id = state.selectedIds[0];
  if (!id || state.selectedIds.length !== 1) return;
  if (!splitShelfCross(id, 0.5)) {
    alert('This shelf can’t be halved — it’s a single bay (or a 6-way). Add modules first, or use a custom shelf.');
  }
}

// Lengthwise: split the unit into its two shopping faces S1 / S2 (each half the
// unit's depth), keeping the same footprint. Uses per-shelf depth override.
function splitSelectedSides() {
  const id = state.selectedIds[0];
  if (!id || state.selectedIds.length !== 1) return;
  const s = splittableShelf(id);
  if (!s) { alert('6-way displays don’t have sides to split.'); return; }
  saveState();
  const idx = state.shelves.indexOf(s);
  const mk = (over, sub) => Object.assign({}, s, over, { id: 'shelf_' + state.nextId++, subname: sub });

  let a, b;
  if (s.type === 'custom') {
    const horiz = (s.customW || 0) >= (s.customH || 0);   // faces run along the long side
    if (horiz) {
      const half = Math.max(4, Math.round((s.customH || 0) / 2));
      a = mk({ customH: half }, 'S1');
      b = mk({ customH: (s.customH || 0) - half, y: s.y + half }, 'S2');
    } else {
      const half = Math.max(4, Math.round((s.customW || 0) / 2));
      a = mk({ customW: half }, 'S1');
      b = mk({ customW: (s.customW || 0) - half, x: s.x + half }, 'S2');
    }
  } else if (s.orientation === 'A' && s.angle != null) {
    // Angled: the two faces sit alongside each other across the ROTATED depth
    // axis (v). Offset each piece's centre by ±¼depth along v so they stay
    // flush against each other at the same angle.
    const depth = getShelfDepth(s), half = Math.max(2, Math.round(depth / 2));
    const dim = getDims(s), cx = s.x + dim.w / 2, cy = s.y + dim.h / 2;
    const rad = s.angle * Math.PI / 180, vx = -Math.sin(rad), vy = Math.cos(rad);
    const len = dim.w;
    const half1 = half, half2 = depth - half;
    // piece centres offset from the unit centre along v
    const c1x = cx - (depth / 2 - half1 / 2) * vx, c1y = cy - (depth / 2 - half1 / 2) * vy;
    const c2x = cx + (depth / 2 - half2 / 2) * vx, c2y = cy + (depth / 2 - half2 / 2) * vy;
    a = mk({ depth: half1, x: Math.round(c1x - len / 2), y: Math.round(c1y - half1 / 2) }, 'S1');
    b = mk({ depth: half2, x: Math.round(c2x - len / 2), y: Math.round(c2y - half2 / 2) }, 'S2');
  } else {
    const depth = getShelfDepth(s);
    const half = Math.max(2, Math.round(depth / 2));
    const horiz = s.orientation !== 'V';
    if (horiz) {                                          // depth runs along y
      a = mk({ depth: half }, 'S1');
      b = mk({ depth: depth - half, y: s.y + half }, 'S2');
    } else {                                              // depth runs along x
      a = mk({ depth: half }, 'S1');
      b = mk({ depth: depth - half, x: s.x + half }, 'S2');
    }
  }
  state.shelves.splice(idx, 1, a, b);
  state.selectedIds = [a.id, b.id];
  renderAll();
}

// Split a shelf evenly into N pieces (modules distributed as evenly as possible).
function splitSelectedIntoN() {
  const id = state.selectedIds[0];
  if (!id || state.selectedIds.length !== 1) { alert('Select a single shelf first.'); return; }
  const n = Math.round(+((document.getElementById('splitNInput') || {}).value) || 0);
  if (!n || n < 2) { alert('Enter how many pieces to split into (2 or more).'); return; }
  const s = splittableShelf(id);
  if (!s) { alert('6-way displays can’t be split.'); return; }
  const mk = (over) => Object.assign({}, s, over, { id: 'shelf_' + state.nextId++ });
  const idx = state.shelves.indexOf(s);

  if (s.type === 'custom') {
    const horiz = (s.customW || 0) >= (s.customH || 0);
    const along = horiz ? s.customW : s.customH;
    if (along < n * 4) { alert('Too small to split into ' + n + ' pieces.'); return; }
    saveState();
    const pieces = [];
    for (let i = 0; i < n; i++) {
      const a = Math.round(i * along / n), b = Math.round((i + 1) * along / n);
      pieces.push(mk(horiz ? { customW: b - a, x: s.x + a } : { customH: b - a, y: s.y + a }));
    }
    state.shelves.splice(idx, 1, ...pieces);
    state.selectedIds = pieces.map(p => p.id); renderAll(); return;
  }

  const modules = s.modules || 1;
  if (modules < 2) { alert('This shelf is a single bay — nothing to split.'); return; }
  const nn = Math.min(n, modules);
  saveState();
  const bayW = getShelfBayW(s);
  const base = Math.floor(modules / nn); let rem = modules % nn, acc = 0;
  const horiz = s.orientation !== 'V';
  const pieces = [];
  for (let i = 0; i < nn; i++) {
    const m = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--;
    let over;
    if (s.orientation === 'A' && s.angle != null) {
      const dim = getDims(s), cx = s.x + dim.w/2, cy = s.y + dim.h/2;
      const rad = s.angle * Math.PI/180, ux = Math.cos(rad), uy = Math.sin(rad);
      const L = modules * bayW, depth = getShelfDepth(s), sx = cx - (L/2)*ux, sy = cy - (L/2)*uy;
      const c = (acc + m/2) * bayW, pcx = sx + c*ux, pcy = sy + c*uy;
      over = { modules: m, x: Math.round(pcx - (m*bayW)/2), y: Math.round(pcy - depth/2) };
    } else if (horiz) { over = { modules: m, x: s.x + acc*bayW }; }
    else { over = { modules: m, y: s.y + acc*bayW }; }
    pieces.push(mk(over)); acc += m;
  }
  state.shelves.splice(idx, 1, ...pieces);
  state.selectedIds = pieces.map(p => p.id); renderAll();
}

// Combine two shelves into one. Prefers a clean modular merge when they are the
// same orientation and roughly in line (the common "detection split one run in
// two" case); otherwise falls back to a custom box spanning both.
function mergeShelves(idA, idB) {
  const a = state.shelves.find(s => s.id === idA), b = state.shelves.find(s => s.id === idB);
  if (!a || !b || a === b) return;
  if (a.type === 'sixway' || b.type === 'sixway') { alert('6-way displays can’t be combined.'); return; }
  saveState();
  let merged = null;
  if (a.type !== 'custom' && b.type !== 'custom' && a.orientation === b.orientation && a.angle == null && b.angle == null) {
    const bayW = getShelfBayW(a), da = getDims(a), db = getDims(b);
    if (a.orientation !== 'V') {
      if (Math.abs(a.y - b.y) <= Math.max(da.h, db.h) * 0.6) {
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x + da.w, b.x + db.w);
        merged = Object.assign({}, a, { x: Math.round(x0), y: a.y, modules: Math.max(1, Math.round((x1 - x0) / bayW)) });
      }
    } else {
      if (Math.abs(a.x - b.x) <= Math.max(da.w, db.w) * 0.6) {
        const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y + da.h, b.y + db.h);
        merged = Object.assign({}, a, { x: a.x, y: Math.round(y0), modules: Math.max(1, Math.round((y1 - y0) / bayW)) });
      }
    }
  }
  if (!merged) {
    const ba = getRotatedBounds(a), bb = getRotatedBounds(b);
    const x0 = Math.min(ba.x, bb.x), y0 = Math.min(ba.y, bb.y);
    const x1 = Math.max(ba.x + ba.w, bb.x + bb.w), y1 = Math.max(ba.y + ba.h, bb.y + bb.h);
    merged = Object.assign({}, a, { type: 'custom', x: Math.round(x0), y: Math.round(y0),
      customW: Math.round(x1 - x0), customH: Math.round(y1 - y0), angle: null, orientation: 'H' });
    delete merged.radius;
  }
  merged.id = a.id;                       // keep first shelf's identity (name/dept/subname)
  const ia = state.shelves.indexOf(a);
  state.shelves = state.shelves.filter(s => s !== b);
  state.shelves[state.shelves.indexOf(a)] = merged;
  state.selectedIds = [merged.id];
  renderAll();
}

function combineBtnState(on) {
  const btn = document.getElementById('combineBtn');
  if (btn) { btn.style.background = on ? 'var(--accent)' : ''; btn.style.color = on ? '#fff' : ''; btn.textContent = on ? 'Click the other shelf…' : 'Combine…'; }
}
function armCombine() {
  // Two already selected → merge them straight away.
  if (state.selectedIds.length === 2) { mergeShelves(state.selectedIds[0], state.selectedIds[1]); return; }
  if (state.selectedIds.length !== 1) { alert('Select one shelf, click Combine, then click the shelf to merge it with.'); return; }
  combineArm = state.selectedIds[0];
  combineBtnState(true);
}
function cancelCombine() { combineArm = null; combineBtnState(false); }

function bringToFront() {
  const sel = state.shelves.filter(s => state.selectedIds.includes(s.id));
  state.shelves = [...state.shelves.filter(s => !state.selectedIds.includes(s.id)), ...sel];
  renderAll(); hideContextMenu();
}

function sendToBack() {
  const sel = state.shelves.filter(s => state.selectedIds.includes(s.id));
  state.shelves = [...sel, ...state.shelves.filter(s => !state.selectedIds.includes(s.id))];
  renderAll(); hideContextMenu();
}

// ═══════════════════════════════════════════════════════════
// IMPORT / EXPORT
// ═══════════════════════════════════════════════════════════

function exportFloorData(floorData) {
  const fd = floorData || {};
  const shelves = (fd.shelves || []).map(s => {
    const out = {
      id: s.id,                               // v0.307: needed for Field Mode merge-by-id
      name: s.name, subname: s.subname,
      x: Math.round(s.x), y: Math.round(s.y),
      dept: s.dept, orientation: s.orientation, modules: s.modules,
    };
    if (s.type === 'custom') { out.type = 'custom'; out.customW = s.customW; out.customH = s.customH; }
    if (s.type === 'sixway') { out.type = 'sixway'; out.radius = s.radius; }
    if (s.fixture) out.fixture = s.fixture; // v0.130
    if (s.angle != null) out.angle = s.angle;
    if (s.bayW) out.bayW = s.bayW;
    if (s.depth) out.depth = s.depth;
    if (s.inactive) out.inactive = true;
    if (s.locked) out.locked = true;
    if (s.locations && s.locations.length >= 2) out.locations = [...s.locations];
    if (s.note) out.note = s.note;   // v0.307: Field Mode on-site comment
    if (s.sharedName) out.sharedName = true;   // an intended duplicate name (was lost in .json)
    return out;
  });
  const landmarks = (fd.landmarks || []).map(z => {
    const out = { label: z.label, x: Math.round(z.x), y: Math.round(z.y), w: Math.round(z.w), h: Math.round(z.h) };
    if (z.angle) out.angle = z.angle;
    if (z.boh) out.boh = true;
    if (z.icon) out.icon = z.icon;
    return out;
  });
  const boundary = (fd.boundary || []).length >= 3 ? fd.boundary.map(p => { const o = { x: Math.round(p.x), y: Math.round(p.y) }; if (p.break) o.break = true; return o; }) : [];
  const deptZoomBoxes = (fd.deptZoomBoxes || []).map(zb => ({ id: zb.id, dept: zb.dept, label: zb.label || '', x: Math.round(zb.x), y: Math.round(zb.y), w: Math.round(zb.w), h: Math.round(zb.h) }));
  const walls = (fd.walls || []).map(w => {
    const out = { x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h) };
    if (w.angle) out.angle = w.angle;
    if (w.boh) out.boh = true;
    if (w.kind === 'window') out.kind = 'window';
    return out;
  });
  const toryLines = (fd.toryLines || []).map(tl => ({
    points: tl.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))
  }));
  const toryDocks = (fd.toryDocks || []).map(td => { const o = { x: Math.round(td.x), y: Math.round(td.y) }; if (td.label) o.label = td.label; return o; });
  // v0.158: Same fix as validateAndExportJS — include all rich fields. Previously
  // location was dropped from emergency markers and both detail+location were dropped
  // from price checks, silently losing data on every export.
  // v0.159: Also include method, operation, extClass for emergency markers.
  const emergencyMarkers = (fd.emergencyMarkers || []).map(em => {
    // The id travels with the marker so Conduit keeps its service history
    // when the marker is moved or retyped.
    const out = { id: em.id, type: em.type, label: em.label || '', location: em.location || '',
      detail: em.detail || '', method: em.method || '', operation: em.operation || '',
      x: Math.round(em.x), y: Math.round(em.y) };
    if (em.extClass) out.extClass = em.extClass;
    return out;
  });
  const priceChecks = (fd.priceChecks || []).map(pc => ({ id: pc.id, label: pc.label || '', location: pc.location || '', detail: pc.detail || '', x: Math.round(pc.x), y: Math.round(pc.y), ...(pc.variant === 'order' ? { variant: 'order' } : {}) }));
  // v0.305: walk-path routing graph + cross-floor portal links. These were omitted
  // from the JSON backup even though the .js export and the importer both handle them,
  // so a JSON round-trip silently dropped ALL navigation/routing and stair links.
  const pathNodes = (fd.pathNodes || []).map(n => {
    const o = { id: n.id, x: Math.round(n.x), y: Math.round(n.y) };
    if (n.type && n.type !== 'path') o.type = n.type;
    if (n.links && n.links.length) o.links = n.links.map(l => ({ floorId: l.floorId, nodeId: l.nodeId }));
    return o;
  });
  const pathEdges = (fd.pathEdges || []).map(e => ({ a: e.a, b: e.b }));
  return { shelves, landmarks, walls, toryLines, toryDocks, boundary, deptZoomBoxes, emergencyMarkers, priceChecks, pathNodes, pathEdges };
}

// v0.153: Export modal — chooser between deployable .js and backup .json formats
function showExportModal() {
  document.getElementById('exportModal').classList.add('visible');
}
function closeExportModal() {
  document.getElementById('exportModal').classList.remove('visible');
}
function exportModalChooseJS() {
  closeExportModal();
  validateAndExportJS();
}
function exportModalChooseJSON() {
  closeExportModal();
  exportJSON();
}

// Renamed from exportMap() in v0.153 — the old name was ambiguous now that there
// are two export formats available from the topbar Export button.
function exportJSON() {
  syncCurrentFloor();

  // Warnings — check across all floors
  let allShelves = [];
  state.floors.forEach(f => {
    const fd = f.data || {};
    (fd.shelves || []).forEach(s => allShelves.push({ ...s, _floor: f.name }));
  });
  const unnamedCount = allShelves.filter(s => !s.name && !s.inactive).length;

  let warnings = [];
  if (unnamedCount > 0) warnings.push(`${unnamedCount} unnamed shelf${unnamedCount > 1 ? 'es' : ''} across all floors`);

  if (warnings.length > 0) {
    const proceed = confirm(`⚠ Export warnings:\n\n• ${warnings.join('\n• ')}\n\nExport anyway?`);
    if (!proceed) return;
  }

  const data = buildMapDocument();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  const num = data.storeNumber ? data.storeNumber + '-' : '';
  a.href = url; a.download = (num + (data.storeName || 'store-map')).replace(/\s+/g, '-').toLowerCase() + '.json';
  a.click(); URL.revokeObjectURL(url);
}

// The whole map as one document: the .json download, the .js download, the
// preview and Publish to Conduit all start here, so they never disagree.
function buildMapDocument() {
  syncCurrentFloor();
  return {
    version: '4.3',
    storeNumber: document.getElementById('storeNumber').value,
    storeName: document.getElementById('storeName').value,
    storeInfo: state.storeInfo || defaultStoreInfo(),
    ...(state.metresPerUnit > 0 ? { metresPerUnit: state.metresPerUnit } : {}),
    moduleWidth: state.moduleWidth,
    shelfDepth: state.shelfDepth,
    stockroomBayW: state.stockroomBayW,
    stockroomDepth: state.stockroomDepth,
    gridSize: state.gridSize,
    departments: state.departments,
    deptGroups: state.deptGroups,
    floors: state.floors.map(f => ({ id: f.id, name: f.name, type: f.type || 'foh', level: f.level || 0, ...exportFloorData(f.data || {}) })),
    exportedAt: new Date().toISOString(),
  };
}

function importMap() { document.getElementById('importFile').click(); }

// A map file's text: the .json backup, or a .js map file (read by Conduit's
// parser, which never runs the file).
function parseMapText(text, name) {
  const t = String(text).trim();
  if (t.startsWith('{')) return JSON.parse(t);
  if (window.ConduitBridge) return window.ConduitBridge.parseMapFile(t, name);
  throw new Error('a .js map file needs the Conduit connection to read; use the .json backup');
}
// Open a map document (from Conduit, or anywhere) through the importer.
function importMapData(data, label) {
  const file = new File([new Blob([JSON.stringify(data)], { type: 'application/json' })], (label || 'map') + '.json', { type: 'application/json' });
  const dt = new DataTransfer(); dt.items.add(file);
  const input = document.getElementById('importFile'); input.files = dt.files;
  handleImport({ target: input });
}
// After an import keeps ids (shelf_12, em_40, pn7…), new ones must start
// past every number in use or they collide.
function bumpNextId() {
  let max = state.nextId || 1;
  state.floors.forEach(f => { const d = f.data || {}; ['shelves', 'landmarks', 'walls', 'toryLines', 'toryDocks', 'deptZoomBoxes', 'emergencyMarkers', 'priceChecks', 'pathNodes'].forEach(k => (d[k] || []).forEach(o => { const m = /(\d+)$/.exec(String(o.id || '')); if (m) max = Math.max(max, Number(m[1]) + 1); })); });
  state.nextId = max;
}

function handleImport(event) {
  const f = event.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const data = parseMapText(e.target.result, f.name);
      if (data.storeNumber) document.getElementById('storeNumber').value = data.storeNumber;
      if (data.storeName) document.getElementById('storeName').value = data.storeName;
      if (data.departments) state.departments = data.departments.map(d => ({ ...d, parent: d.parent || null }));
      if (data.deptGroups) state.deptGroups = data.deptGroups;
      if (data.moduleWidth) { state.moduleWidth = data.moduleWidth; document.getElementById('globalModuleW').value = data.moduleWidth; }
      if (data.shelfDepth) { state.shelfDepth = data.shelfDepth; document.getElementById('globalShelfDepth').value = data.shelfDepth; }
      if (data.stockroomBayW) { state.stockroomBayW = data.stockroomBayW; document.getElementById('globalStockBayW').value = data.stockroomBayW; }
      if (data.stockroomDepth) { state.stockroomDepth = data.stockroomDepth; document.getElementById('globalStockDepth').value = data.stockroomDepth; }
      if (data.gridSize) { state.gridSize = data.gridSize; document.getElementById('globalGridSize').value = data.gridSize; updateGridPatterns(); }

      // Import floor data with ID reconstruction
      function importFloorContent(fd) {
        const shelves = (fd.shelves || []).map(s => {
          const shelf = {
            // Ids are kept: Field Mode captures and Conduit's records name them.
            id: typeof s.id === 'string' && s.id ? s.id : 'shelf_' + state.nextId++, name: s.name || '', subname: s.subname || '',
            x: s.x, y: s.y, dept: s.dept || '', orientation: s.orientation || 'H', modules: s.modules || 3,
            angle: s.angle != null ? s.angle : null,
            bayW: s.bayW || null, depth: s.depth || null,
            inactive: !!s.inactive, locked: !!s.locked,
            locations: Array.isArray(s.locations) && s.locations.length >= 2 ? [...s.locations] : null,
          };
          if (s.type === 'custom') { shelf.type = 'custom'; shelf.customW = s.customW; shelf.customH = s.customH; }
          if (s.type === 'sixway') { shelf.type = 'sixway'; shelf.radius = s.radius || 20; }
          if (s.fixture) shelf.fixture = s.fixture; // v0.130
          if (s.note) shelf.note = s.note;
          if (s.sharedName) shelf.sharedName = true;
          // A .js export wrote an angle without orientation 'A'.
          if (shelf.angle && shelf.orientation === 'H' && !s.orientation) shelf.orientation = 'A';
          return shelf;
        });
        const landmarks = (fd.landmarks || fd.zones || []).map(z => ({
          id: 'landmark_' + state.nextId++, label: z.label || '', x: z.x, y: z.y, w: z.w, h: z.h, angle: z.angle || 0, boh: !!z.boh, icon: z.icon || '',
        }));
        const boundary = Array.isArray(fd.boundary) ? fd.boundary.map(p => { const o = { x: p.x, y: p.y }; if (p.break) o.break = true; return o; }) : [];
        const deptZoomBoxes = Array.isArray(fd.deptZoomBoxes) ? fd.deptZoomBoxes.map(zb => ({ id: zb.id || 'zb_' + state.nextId++, dept: zb.dept || '', label: zb.label || '', x: zb.x, y: zb.y, w: zb.w, h: zb.h })) : [];
        // v0.158: Preserve location and detail when importing — these were silently being
        // dropped on import, so any rich marker content from a JSON backup was lost the
        // moment you re-imported it. Now they round-trip cleanly.
        // v0.159: Also preserve method, operation, and extClass (fire-extinguisher class).
        // Marker ids are kept: Conduit keys each marker's service history on it.
        const emergencyMarkers = Array.isArray(fd.emergencyMarkers) ? fd.emergencyMarkers.map(em => ({
          id: em.id || 'em_' + state.nextId++,
          type: em.type || 'fire_extinguisher',
          label: em.label || '',
          location: em.location || '',
          detail: em.detail || '',
          method: em.method || '',
          operation: em.operation || '',
          extClass: em.extClass || '',
          x: em.x, y: em.y
        })) : [];
        const priceChecks = Array.isArray(fd.priceChecks) ? fd.priceChecks.map(pc => ({
          id: pc.id || 'pc_' + state.nextId++,
          label: pc.label || '',
          location: pc.location || '',
          detail: pc.detail || '',
          ...(pc.variant === 'order' ? { variant: 'order' } : {}),
          x: pc.x, y: pc.y
        })) : [];
        const walls = Array.isArray(fd.walls) ? fd.walls.map(w => ({ id: 'wall_' + state.nextId++, x: w.x, y: w.y, w: w.w, h: w.h, angle: w.angle || 0, boh: !!w.boh, ...(w.kind === 'window' ? { kind: 'window' } : {}) })) : [];
        const toryLines = Array.isArray(fd.toryLines) ? fd.toryLines.map(tl => ({ id: 'tory_' + state.nextId++, points: (tl.points || []).map(p => ({ x: p.x, y: p.y })) })) : [];
        const toryDocks = Array.isArray(fd.toryDocks) ? fd.toryDocks.map(td => ({ id: 'tdock_' + state.nextId++, x: td.x, y: td.y, label: td.label || '' })) : [];
        // Walk-path graph: preserve node ids EXACTLY (portal links reference them across floors).
        const pathNodes = Array.isArray(fd.pathNodes) ? fd.pathNodes.map(n => {
          const o = { id: n.id, x: n.x, y: n.y, type: n.type || 'path' };
          if (Array.isArray(n.links) && n.links.length) o.links = n.links.map(l => ({ floorId: l.floorId, nodeId: l.nodeId }));
          return o;
        }) : [];
        const pathEdges = Array.isArray(fd.pathEdges) ? fd.pathEdges.map(e => ({ a: e.a, b: e.b })) : [];
        return { shelves, landmarks, walls, toryLines, toryDocks, boundary, deptZoomBoxes, emergencyMarkers, priceChecks,
          pathNodes, pathEdges,
          underlay: null, underlayOpacity: 0.3, underlayScale: 1.87, underlayX: 0, underlayY: 0,
          zoom: 1, panX: 0, panY: 0 };
      }

      if (data.floors && data.floors.length) {
        // New floor format — infer type from id if missing
        state.floors = data.floors.map(f => ({
          id: f.id || 'floor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: f.name || 'Ground',
          type: f.type || (f.id === 'stockroom' ? 'boh' : 'foh'),
          level: f.level || 0,
          data: importFloorContent(f),
        }));
        // Deduplicate: if multiple floors have same type+level, keep the one with more content
        const seen = {};
        const deduped = [];
        state.floors.forEach(f => {
          const key = (f.level || 0) + '_' + (f.type || 'foh');
          if (seen[key]) {
            const existing = seen[key];
            const existCount = (existing.data.shelves || []).length + (existing.data.landmarks || []).length;
            const newCount = (f.data.shelves || []).length + (f.data.landmarks || []).length;
            if (newCount > existCount) {
              // Replace with the one that has more content
              const idx = deduped.indexOf(existing);
              deduped[idx] = f;
              seen[key] = f;
              console.log('Import: Replaced duplicate ' + key + ' floor (kept "' + f.name + '" with more content)');
            } else {
              console.log('Import: Skipped duplicate ' + key + ' floor "' + f.name + '"');
            }
          } else {
            seen[key] = f;
            deduped.push(f);
          }
        });
        state.floors = deduped;
        state.currentFloorId = state.floors[0].id;
        loadFloor(state.currentFloorId);
      } else {
        // Legacy flat format → single ground floor
        const floorData = importFloorContent(data);
        state.floors = [{ id: 'ground', name: 'Ground', type: 'foh', level: 0, data: floorData }];
        state.currentFloorId = 'ground';
        loadFloor('ground');
      }

      state.selectedIds = []; state.selectedLandmarkId = null;
      state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
      state.undoStack = []; state.redoStack = [];

      // If imported file has a store number, switch to that store
      const importNum = data.storeNumber || '';
      const importName = data.storeName || '';
      if (importNum) {
        const reg = findStore(importNum);
        activeStoreId = importNum;
        localStorage.setItem(LAST_STORE_KEY, importNum);
        document.getElementById('storeNumber').value = importNum;
        document.getElementById('storeName').value = reg?.name || importName;
        document.getElementById('activeStoreNum').textContent = importNum;
        document.getElementById('activeStoreName').textContent = reg?.name || importName;
      }

      // v0.305: restore store-level config from the file too. Previously only the
      // floors + store number/name were applied on import, so storeInfo (address/
      // hours/holidays/parking/assembly) and the global dimensions were dropped.
      if (data.storeInfo) state.storeInfo = Object.assign(defaultStoreInfo(), data.storeInfo);
      ['moduleWidth', 'shelfDepth', 'stockroomBayW', 'stockroomDepth', 'gridSize'].forEach(function (k) { if (data[k] != null) state[k] = data[k]; });
      state.metresPerUnit = data.metresPerUnit > 0 ? data.metresPerUnit : null;
      bumpNextId();
      var _gmw = document.getElementById('globalModuleW'); if (_gmw && data.moduleWidth != null) _gmw.value = data.moduleWidth;
      var _gsd = document.getElementById('globalShelfDepth'); if (_gsd && data.shelfDepth != null) _gsd.value = data.shelfDepth;
      var _gsb = document.getElementById('globalStockBayW'); if (_gsb && data.stockroomBayW != null) _gsb.value = data.stockroomBayW;

      renderFloorTabs();
      renderAll(); fitView(); markDirty();
      window.dispatchEvent(new CustomEvent('map-opened'));
    } catch (err) { alert('Import error: ' + err.message); }
  };
  r.readAsText(f); event.target.value = '';
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// v0.320: MEASURE GAPS — hold Q with 2+ shelves selected to show the
// edge-to-edge distance between consecutive selected shelves (sorted along
// the dominant axis). All gaps green = equal spacing (±0.5u); amber =
// unequal; red = overlapping. Complements the point-to-point Ruler (U).
// ═══════════════════════════════════════════════════════════
let measureHeld = false;
function shelfMeasureBBox(s) {
  const d = getDims(s);
  if (s.type === 'sixway') { const r = (s.radius || 20); return { x0: s.x - r, y0: s.y - r, x1: s.x + r, y1: s.y + r, cx: s.x, cy: s.y }; }
  return { x0: s.x, y0: s.y, x1: s.x + d.w, y1: s.y + d.h, cx: s.x + d.w / 2, cy: s.y + d.h / 2 };
}
function clearMeasureOverlay() {
  overlayGroup.querySelectorAll('.measure-dim').forEach(el => el.remove());
}
function renderMeasureOverlay() {
  clearMeasureOverlay();
  if (!measureHeld) return;
  const NS = 'http://www.w3.org/2000/svg';
  const sel = state.shelves.filter(s => state.selectedIds.includes(s.id));
  if (sel.length < 2) return;
  const boxes = sel.map(shelfMeasureBBox);
  const xs = boxes.map(b => b.cx), ys = boxes.map(b => b.cy);
  const horiz = (Math.max(...xs) - Math.min(...xs)) >= (Math.max(...ys) - Math.min(...ys));
  boxes.sort((a, b) => horiz ? a.cx - b.cx : a.cy - b.cy);
  const gaps = [];
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    gaps.push({ a, b, gap: horiz ? (b.x0 - a.x1) : (b.y0 - a.y1) });
  }
  const allEqual = gaps.length > 1 && gaps.every(g => Math.abs(g.gap - gaps[0].gap) <= 0.5);
  const sw = 1.5 / state.zoom, fs = 12 / state.zoom, tick = 5 / state.zoom;
  gaps.forEach(({ a, b, gap }) => {
    const color = gap < 0 ? '#ef4444' : (allEqual ? '#16a34a' : '#f59e0b');
    let p1, p2, mid;
    if (horiz) {
      const yOv0 = Math.max(a.y0, b.y0), yOv1 = Math.min(a.y1, b.y1);
      const y = yOv0 < yOv1 ? (yOv0 + yOv1) / 2 : (a.cy + b.cy) / 2;
      p1 = { x: a.x1, y }; p2 = { x: b.x0, y };
    } else {
      const xOv0 = Math.max(a.x0, b.x0), xOv1 = Math.min(a.x1, b.x1);
      const x = xOv0 < xOv1 ? (xOv0 + xOv1) / 2 : (a.cx + b.cx) / 2;
      p1 = { x, y: a.y1 }; p2 = { x, y: b.y0 };
    }
    mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const g = document.createElementNS(NS, 'g');
    g.classList.add('measure-dim');
    g.style.pointerEvents = 'none';
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', sw);
    g.appendChild(line);
    [p1, p2].forEach(p => {
      const t = document.createElementNS(NS, 'line');
      if (horiz) { t.setAttribute('x1', p.x); t.setAttribute('y1', p.y - tick); t.setAttribute('x2', p.x); t.setAttribute('y2', p.y + tick); }
      else { t.setAttribute('x1', p.x - tick); t.setAttribute('y1', p.y); t.setAttribute('x2', p.x + tick); t.setAttribute('y2', p.y); }
      t.setAttribute('stroke', color); t.setAttribute('stroke-width', sw);
      g.appendChild(t);
    });
    const val = Math.round(Math.abs(gap) * 10) / 10;
    let label = gap < 0 ? ('overlap ' + val) : String(val);
    if (gap >= 0 && state.metresPerUnit) label += ' · ' + (gap * state.metresPerUnit).toFixed(2) + 'm';
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', mid.x); txt.setAttribute('y', mid.y - 6 / state.zoom);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', fs);
    txt.setAttribute('font-weight', '700');
    txt.setAttribute('fill', color);
    txt.setAttribute('stroke', '#ffffff');
    txt.setAttribute('stroke-width', 3 / state.zoom);
    txt.setAttribute('paint-order', 'stroke');
    txt.textContent = label;
    g.appendChild(txt);
    overlayGroup.appendChild(g);
  });
}
document.addEventListener('keyup', e => {
  if (e.key && e.key.toLowerCase() === 'q') { measureHeld = false; clearMeasureOverlay(); }
});

document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return; }
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  // Tool switches (no modifier)
  if (!mod) {
    if (key === 'q') { if (!e.repeat) { measureHeld = true; renderMeasureOverlay(); } return; }
    if (key === 'v') return setTool('select');
    if (key === 's') return setTool('shelf');
    if (key === 'c') return setTool('custom');
    if (key === 'w') return setTool('sixway');
    if (key === 'z') return setTool('landmark');
    if (key === 'x') return setTool('wall');
    if (key === 't') return setTool('toryline');
    if (key === 'p') return setTool('paths');
    if (key === 'm' && state.floors.length > 1 && (state.selectedIds.length || state.selectedLandmarkId || state.selectedLandmarkIds.length || state.selectedWallId || state.selectedWallIds.length || state.selectedToryLineId || state.selectedEmergencyId)) {
      e.preventDefault();
      // If only 2 floors, move directly; otherwise show menu
      const otherFloors = state.floors.filter(f => f.id !== state.currentFloorId);
      if (otherFloors.length === 1) moveSelectedToFloor(otherFloors[0].id);
      else showMoveToFloorMenu(window.innerWidth / 2, window.innerHeight / 2);
      return;
    }
    if (key === 'h') return setTool('pan');
    if (key === 'u') return setTool('ruler');
    if (key === 'b') return setTool('boundary');
    if (key === 'j') return setTool('zoombox');
    if (key === 'e') return setTool('emergency');
    if (key === 'p') return setTool('pricecheck');
    if (key === 'k') return setTool('torydock');
    if (key === 'r' && e.shiftKey) return rotateBy45();
    if (key === 'r' && !e.shiftKey) return rotateSelected();
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.tool === 'paths' && state.selectedPathEdge) { e.preventDefault(); deletePathEdge(state.selectedPathEdge); return; }
      if (state.tool === 'paths' && (state.selectedPathNodeIds || []).length > 1) { e.preventDefault(); deletePathNodes(state.selectedPathNodeIds); return; }
      if (state.tool === 'paths' && state.selectedPathNodeId) { e.preventDefault(); deletePathNode(state.selectedPathNodeId); return; }
      if (state.selectedEmergencyId) { deleteSelectedEmergency(); return; }
      if (state.selectedZoomboxId) { deleteSelectedZoombox(); return; }
      if (state.selectedWallId) { saveState(); state.walls = state.walls.filter(w => w.id !== state.selectedWallId); state.selectedWallId = null; renderAll(); return; }
      if (state.selectedToryLineId) { saveState(); state.toryLines = state.toryLines.filter(t => t.id !== state.selectedToryLineId); state.selectedToryLineId = null; renderAll(); return; }
      if (state.selectedToryDockId) { saveState(); state.toryDocks = (state.toryDocks || []).filter(t => t.id !== state.selectedToryDockId); state.selectedToryDockId = null; renderAll(); return; }
      if (!state.selectedIds.length && !state.selectedLandmarkId && !state.selectedWallId && !state.selectedToryLineId && state.boundary.length && !isDrawingBoundary) {
        saveState(); state.boundary = []; renderAll(); return;
      }
      return deleteSelected();
    }
    if (e.key === 'Enter' && isDrawingToryLine) { finishToryLine(); return; }
    if ((e.key === 'g' || e.key === 'G') && isDrawingBoundary) {
      // v0.313: lift the pen — next placed point starts a new disconnected segment
      boundaryPenUp = true; renderBoundary(); return;
    }
    if (e.key === 'Enter' && isDrawingBoundary) {
      // v0.160: Commit whatever's placed (as-is, open or closed) and leave drawing mode.
      isDrawingBoundary = false; boundaryExtendEnd = null; boundaryPenUp = false;
      overlayGroup.querySelectorAll('.boundary-preview-line').forEach(el => el.remove());
      renderBoundary(); return;
    }
    if (e.key === '=' || e.key === '+') return zoomIn();
    if (e.key === '-') return zoomOut();
    if (e.key === '0') return fitView();
    if (e.key === '?' || (e.shiftKey && e.key === '/')) return showShortcuts();
    if (e.key === 'Escape') {
      if (isSlicing) { isSlicing = false; sliceStart = null; const sp = document.getElementById('slicePreview'); if (sp) sp.remove(); return; }
      if (combineArm) { cancelCombine(); return; }
      if (state.tool === 'paths' && (pathChainPrevId || state.selectedPathNodeId || state.selectedPathEdge)) { cancelPathChain(); return; }
      if (rulerStart) { rulerStart = null; overlayGroup.querySelectorAll('.ruler-preview').forEach(el => el.remove()); var si = document.getElementById('statusInfo'); if (si) si.style.display = 'none'; setTool('select'); return; }
      if (isDrawingToryLine) { finishToryLine(); setTool('select'); return; }
      if (isDrawingBoundary) {
        // v0.160: Exit drawing mode. If only 1 point was placed (a useless single dot),
        // remove it. Otherwise keep the polyline as-is — the user can always Ctrl+Z if
        // they want to revert further. This matches Figma/Illustrator path behaviour.
        if (state.boundary.length === 1) state.boundary = [];
        isDrawingBoundary = false; boundaryExtendEnd = null; boundaryPenUp = false;
        overlayGroup.querySelectorAll('.boundary-preview-line').forEach(el => el.remove());
        renderBoundary(); setTool('select'); return;
      }
      state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedLandmarkId = null; state.selectedWallIds = []; state.selectedWallId = null; state.selectedToryLineId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null; state.highlightedName = null; return renderAll();
    }
  }

  // Modifier shortcuts
  if (mod) {
    if (key === 'd') { e.preventDefault(); return duplicateSelected(); }
    if (key === 'c') { e.preventDefault(); return copySelected(); }
    if (key === 'v') { e.preventDefault(); return pasteClipboard(); }
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
    if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); return redo(); }
    if (key === 'a') { e.preventDefault(); state.selectedIds = state.shelves.map(s => s.id); state.selectedLandmarkIds = state.landmarks.map(z => z.id); state.selectedWallIds = state.walls.map(w => w.id); state.selectedLandmarkId = null; state.selectedWallId = null; state.selectedToryLineId = state.toryLines.length ? state.toryLines[state.toryLines.length-1].id : null; state.selectedEmergencyId = state.emergencyMarkers.length ? state.emergencyMarkers[state.emergencyMarkers.length-1].id : null; return renderAll(); }
  }

  // Arrow nudge
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && (state.selectedIds.length || state.selectedLandmarkIds.length || state.selectedLandmarkId || state.selectedWallIds.length || state.selectedWallId || state.selectedToryLineId || state.selectedEmergencyId || state.selectedPriceCheckId || state.selectedPathNodeId || (state.selectedPathNodeIds && state.selectedPathNodeIds.length))) {
    // Skip if any selected shelf is locked
    const anyLocked = state.selectedIds.some(id => { const s = state.shelves.find(x => x.id === id); return s?.locked; });
    if (anyLocked) return;
    e.preventDefault(); saveState();
    // Ctrl/Cmd = pixel-precise (1 unit) for truly minute adjustments;
    // Shift = a full grid cell; plain = a quarter cell.
    const step = (e.ctrlKey || e.metaKey) ? 1 : (e.shiftKey ? state.gridSize : state.gridSize / 4);

    // Check if ALL selected shelves share the same angle
    const angles = state.selectedIds.map(id => {
      const s = state.shelves.find(x => x.id === id);
      return s ? getAngle(s) : 0;
    });
    const allSameAngle = angles.length === 0 || angles.every(a => a === angles[0]);
    const angle = (allSameAngle && angles.length > 0) ? angles[0] : 0;

    state.selectedIds.forEach(id => {
      const s = state.shelves.find(x => x.id === id); if (!s) return;
      if (angle !== 0) {
        // Local-axis nudge: Left/Right = along shelf length, Up/Down = perpendicular
        const rad = angle * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        let dx = 0, dy = 0;
        if (e.key === 'ArrowRight') { dx = cos * step; dy = sin * step; }
        if (e.key === 'ArrowLeft') { dx = -cos * step; dy = -sin * step; }
        if (e.key === 'ArrowUp') { dx = sin * step; dy = -cos * step; }
        if (e.key === 'ArrowDown') { dx = -sin * step; dy = cos * step; }
        s.x += dx; s.y += dy;
      } else {
        // Standard axis-aligned nudge
        if (e.key === 'ArrowUp') s.y -= step; if (e.key === 'ArrowDown') s.y += step;
        if (e.key === 'ArrowLeft') s.x -= step; if (e.key === 'ArrowRight') s.x += step;
      }
    });
    // Also nudge selected landmarks
    state.selectedLandmarkIds.forEach(lid => {
      const z = state.landmarks.find(x => x.id === lid); if (!z) return;
      if (e.key === 'ArrowUp') z.y -= step; if (e.key === 'ArrowDown') z.y += step;
      if (e.key === 'ArrowLeft') z.x -= step; if (e.key === 'ArrowRight') z.x += step;
    });
    // Single selected landmark
    if (state.selectedLandmarkId && !state.selectedLandmarkIds.includes(state.selectedLandmarkId)) {
      const z = state.landmarks.find(x => x.id === state.selectedLandmarkId); if (z) {
        if (e.key === 'ArrowUp') z.y -= step; if (e.key === 'ArrowDown') z.y += step;
        if (e.key === 'ArrowLeft') z.x -= step; if (e.key === 'ArrowRight') z.x += step;
      }
    }
    // Also nudge selected walls
    state.selectedWallIds.forEach(wid => {
      const w = state.walls.find(x => x.id === wid); if (!w) return;
      if (e.key === 'ArrowUp') w.y -= step; if (e.key === 'ArrowDown') w.y += step;
      if (e.key === 'ArrowLeft') w.x -= step; if (e.key === 'ArrowRight') w.x += step;
    });
    // Single selected wall
    if (state.selectedWallId && !state.selectedWallIds.includes(state.selectedWallId)) {
      const w = state.walls.find(x => x.id === state.selectedWallId); if (w) {
        if (e.key === 'ArrowUp') w.y -= step; if (e.key === 'ArrowDown') w.y += step;
        if (e.key === 'ArrowLeft') w.x -= step; if (e.key === 'ArrowRight') w.x += step;
      }
    }
    // Selected tory line — nudge all points
    if (state.selectedToryLineId) {
      const tl = state.toryLines.find(x => x.id === state.selectedToryLineId); if (tl) {
        tl.points.forEach(p => {
          if (e.key === 'ArrowUp') p.y -= step; if (e.key === 'ArrowDown') p.y += step;
          if (e.key === 'ArrowLeft') p.x -= step; if (e.key === 'ArrowRight') p.x += step;
        });
      }
    }
    // v0.151: Selected emergency marker
    if (state.selectedEmergencyId) {
      const em = state.emergencyMarkers.find(m => m.id === state.selectedEmergencyId); if (em) {
        if (e.key === 'ArrowUp') em.y -= step; if (e.key === 'ArrowDown') em.y += step;
        if (e.key === 'ArrowLeft') em.x -= step; if (e.key === 'ArrowRight') em.x += step;
      }
    }
    // v0.151: Selected price check marker
    if (state.selectedPriceCheckId) {
      const pc = (state.priceChecks || []).find(m => m.id === state.selectedPriceCheckId); if (pc) {
        if (e.key === 'ArrowUp') pc.y -= step; if (e.key === 'ArrowDown') pc.y += step;
        if (e.key === 'ArrowLeft') pc.x -= step; if (e.key === 'ArrowRight') pc.x += step;
      }
    }
    // Walk-path nodes — FINE incremental nudge (independent of grid size, since the grid
    // is often too coarse for tucking a node into a tight spot). Default step = 1px,
    // Shift = a quarter of the grid for a bigger hop. Moves the multi-selection if any,
    // else the single selected node; attached links follow (rendered from live coords).
    var pathIds = (state.selectedPathNodeIds && state.selectedPathNodeIds.length)
      ? state.selectedPathNodeIds
      : (state.selectedPathNodeId ? [state.selectedPathNodeId] : []);
    if (pathIds.length) {
      var fineStep = e.shiftKey ? (state.gridSize / 4) : 1;
      var ndx = 0, ndy = 0;
      if (e.key === 'ArrowUp') ndy = -fineStep; if (e.key === 'ArrowDown') ndy = fineStep;
      if (e.key === 'ArrowLeft') ndx = -fineStep; if (e.key === 'ArrowRight') ndx = fineStep;
      pathIds.forEach(function (pid) {
        var pn = (state.pathNodes || []).find(function (n) { return n.id === pid; });
        if (pn) { pn.x += ndx; pn.y += ndy; }
      });
    }
    renderAll();
  }
});

// ═══════════════════════════════════════════════════════════
// CLIPBOARD (COPY / PASTE)
// ═══════════════════════════════════════════════════════════

let clipboard = []; // stored shelf snapshots
let pasteCount = 0; // increments each paste for stacking offset

function copySelected() {
  clipboard = [];

  // Gather all selected items with their positions
  const shelves = state.selectedIds.map(id => state.shelves.find(s => s.id === id)).filter(Boolean);
  const lmIds = state.selectedLandmarkIds.length ? [...state.selectedLandmarkIds] : (state.selectedLandmarkId ? [state.selectedLandmarkId] : []);
  const lms = lmIds.map(id => state.landmarks.find(l => l.id === id)).filter(Boolean);
  const wallIds = state.selectedWallIds.length ? [...state.selectedWallIds] : (state.selectedWallId ? [state.selectedWallId] : []);
  const ws = wallIds.map(id => state.walls.find(w => w.id === id)).filter(Boolean);
  const tl = state.selectedToryLineId ? state.toryLines.find(t => t.id === state.selectedToryLineId) : null;
  const em = state.selectedEmergencyId ? state.emergencyMarkers.find(m => m.id === state.selectedEmergencyId) : null;

  if (!shelves.length && !lms.length && !ws.length && !tl && !em) return;

  // Calculate ONE shared bounding box origin across all selected items
  const allX = [], allY = [];
  shelves.forEach(s => { allX.push(s.x); allY.push(s.y); });
  lms.forEach(z => { allX.push(z.x); allY.push(z.y); });
  ws.forEach(w => { allX.push(w.x); allY.push(w.y); });
  if (tl) tl.points.forEach(p => { allX.push(p.x); allY.push(p.y); });
  if (em) { allX.push(em.x); allY.push(em.y); }

  const originX = allX.length ? Math.min(...allX) : 0;
  const originY = allY.length ? Math.min(...allY) : 0;

  shelves.forEach(s => {
    const snap = { ...s, x: s.x - originX, y: s.y - originY };
    if (snap.locations) snap.locations = [...snap.locations];
    clipboard.push({ type: 'shelf', data: snap });
  });
  lms.forEach(z => {
    clipboard.push({ type: 'landmark', data: { ...z, x: z.x - originX, y: z.y - originY } });
  });
  ws.forEach(w => {
    clipboard.push({ type: 'wall', data: { ...w, x: w.x - originX, y: w.y - originY } });
  });
  if (tl) {
    clipboard.push({ type: 'toryline', data: { points: tl.points.map(p => ({ x: p.x - originX, y: p.y - originY })) } });
  }
  if (em) {
    clipboard.push({ type: 'emergency', data: { ...em, x: em.x - originX, y: em.y - originY } });
  }

  pasteCount = 0;
}

function pasteClipboard() {
  if (!clipboard.length) return;
  saveState();
  pasteCount++;
  const offset = state.gridSize * 2 * pasteCount;
  const newShelfIds = [];
  const newLandmarkIds = [];

  clipboard.forEach(item => {
    if (item.type === 'shelf') {
      const c = { ...item.data, id: 'shelf_' + state.nextId++, x: item.data.x + offset, y: item.data.y + offset };
      if (c.locations) c.locations = [...c.locations];
      state.shelves.push(c);
      newShelfIds.push(c.id);
    } else if (item.type === 'landmark') {
      const c = { ...item.data, id: 'landmark_' + state.nextId++, x: item.data.x + offset, y: item.data.y + offset };
      state.landmarks.push(c);
      newLandmarkIds.push(c.id);
    } else if (item.type === 'wall') {
      const c = { ...item.data, id: 'wall_' + state.nextId++, x: item.data.x + offset, y: item.data.y + offset };
      state.walls.push(c);
      state.selectedWallId = c.id;
    } else if (item.type === 'toryline') {
      const c = { id: 'tory_' + state.nextId++, points: item.data.points.map(p => ({ x: p.x + offset, y: p.y + offset })) };
      state.toryLines.push(c);
      state.selectedToryLineId = c.id;
    } else if (item.type === 'emergency') {
      const c = { ...item.data, id: 'em_' + state.nextId++, x: item.data.x + offset, y: item.data.y + offset };
      state.emergencyMarkers.push(c);
      state.selectedEmergencyId = c.id;
    }
  });

  if (newShelfIds.length) {
    state.selectedIds = newShelfIds;
    state.selectedLandmarkId = null; state.selectedLandmarkIds = [];
    state.selectedWallId = null; state.selectedWallIds = [];
  } else if (newLandmarkIds.length) {
    state.selectedIds = [];
    if (newLandmarkIds.length === 1) { state.selectedLandmarkId = newLandmarkIds[0]; state.selectedLandmarkIds = []; }
    else { state.selectedLandmarkIds = newLandmarkIds; state.selectedLandmarkId = null; }
    state.selectedWallId = null; state.selectedWallIds = [];
  }
  renderAll();
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS OVERLAY
// ═══════════════════════════════════════════════════════════
function showShortcuts() { document.getElementById('shortcutsModal').classList.add('visible'); }

// ═══════════════════════════════════════════════════════════
// PRINT / IMAGE EXPORT
// ═══════════════════════════════════════════════════════════
function showPrintModal() { document.getElementById('printModal').classList.add('visible'); }
function closePrintModal() { document.getElementById('printModal').classList.remove('visible'); }

function buildExportSVG() {
  const showGrid = document.getElementById('printShowGrid').checked;
  const showBorder = document.getElementById('printShowBorder').checked;
  const showLabels = document.getElementById('printShowLabels').checked;
  const whiteBg = document.getElementById('printWhiteBg').checked;

  // Calculate bounds
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  state.shelves.forEach(s => { const b = getRotatedBounds(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x+b.w); y1 = Math.max(y1, b.y+b.h); });
  state.landmarks.forEach(z => { x0 = Math.min(x0, z.x); y0 = Math.min(y0, z.y); x1 = Math.max(x1, z.x+z.w); y1 = Math.max(y1, z.y+z.h); });
  state.walls.forEach(w => { x0 = Math.min(x0, w.x); y0 = Math.min(y0, w.y); x1 = Math.max(x1, w.x+w.w); y1 = Math.max(y1, w.y+w.h); });
  state.toryLines.forEach(tl => { tl.points.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }); });
  state.boundary.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
  state.deptZoomBoxes.forEach(zb => { x0 = Math.min(x0, zb.x); y0 = Math.min(y0, zb.y); x1 = Math.max(x1, zb.x+zb.w); y1 = Math.max(y1, zb.y+zb.h); });
  state.emergencyMarkers.forEach(em => { x0 = Math.min(x0, em.x - 15); y0 = Math.min(y0, em.y - 15); x1 = Math.max(x1, em.x + 15); y1 = Math.max(y1, em.y + 15); });
  (state.priceChecks || []).forEach(pc => { x0 = Math.min(x0, pc.x - 15); y0 = Math.min(y0, pc.y - 15); x1 = Math.max(x1, pc.x + 15); y1 = Math.max(y1, pc.y + 15); });
  (state.toryDocks || []).forEach(td => { x0 = Math.min(x0, td.x - 18); y0 = Math.min(y0, td.y - 18); x1 = Math.max(x1, td.x + 18); y1 = Math.max(y1, td.y + 18); });
  if (x0 === Infinity) { x0 = 0; y0 = 0; x1 = 400; y1 = 300; }
  const pad = 30;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = x1 - x0, h = y1 - y0;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w*2}" height="${h*2}">`;
  svg += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${whiteBg ? '#ffffff' : '#f0f1f3'}"/>`;

  // Grid
  if (showGrid) {
    const gs = state.gridSize;
    const startX = Math.floor(x0/gs)*gs, startY = Math.floor(y0/gs)*gs;
    for (let gx = startX; gx <= x1; gx += gs) svg += `<line x1="${gx}" y1="${y0}" x2="${gx}" y2="${y1}" stroke="#e0e0e0" stroke-width="0.5"/>`;
    for (let gy = startY; gy <= y1; gy += gs) svg += `<line x1="${x0}" y1="${gy}" x2="${x1}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>`;
  }

  // Border
  if (showBorder && state.boundary.length >= 3) {
    const pts = state.boundary.map(p => `${p.x},${p.y}`).join(' ');
    svg += `<polygon points="${pts}" fill="none" stroke="#1a1a2e" stroke-width="5" stroke-linejoin="round"/>`;
  }

  // Dept Zoom Boxes
  state.deptZoomBoxes.forEach(zb => {
    const dept = state.departments.find(d => d.id === zb.dept);
    const color = dept ? dept.color : '#888';
    svg += `<rect x="${zb.x}" y="${zb.y}" width="${zb.w}" height="${zb.h}" fill="${color}" fill-opacity="0.06" stroke="${color}" stroke-width="2" stroke-dasharray="8 4" rx="4"/>`;
    if (showLabels && (zb.label || dept)) svg += `<text x="${zb.x+4}" y="${zb.y+12}" font-family="JetBrains Mono,monospace" font-size="10" font-weight="700" fill="${color}" opacity="0.7">${zb.label || dept?.name || ''}</text>`;
  });

  // Emergency Markers
  state.emergencyMarkers.forEach(em => {
    const info = EMERGENCY_TYPES[em.type] || EMERGENCY_TYPES.fire_extinguisher;
    svg += `<circle cx="${em.x}" cy="${em.y}" r="12" fill="${info.color}" opacity="0.85" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>`;
    svg += `<text x="${em.x}" y="${em.y}" text-anchor="middle" dominant-baseline="central" font-size="12">${info.icon}</text>`;
    if (showLabels) svg += `<text x="${em.x}" y="${em.y+18}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="${info.color}">${em.label || info.abbr}</text>`;
  });

  // Landmarks
  state.landmarks.forEach(z => {
    svg += buildLandmarkSVG(z, { dataAttrs: false, showLabels: showLabels });
  });

  // Walls
  state.walls.forEach(w => {
    const angle = w.angle || 0;
    const cx = w.x + w.w/2, cy = w.y + w.h/2;
    const transform = angle !== 0 ? ` transform="rotate(${angle},${cx},${cy})"` : '';
    if (w.kind === 'window') {
      const hz = w.w >= w.h, cgx = w.x + w.w/2, cgy = w.y + w.h/2;
      svg += `<g${transform}><rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="#cfe8fa" stroke="#7ab8dd" stroke-width="1.5"/><line x1="${hz ? w.x+2 : cgx}" y1="${hz ? cgy : w.y+2}" x2="${hz ? w.x+w.w-2 : cgx}" y2="${hz ? cgy : w.y+w.h-2}" stroke="#ffffff" stroke-width="1.2"/></g>`;
    } else {
      svg += `<g${transform}><rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="#1a1b1e" stroke="#000" stroke-width="1.5"/></g>`;
    }
  });

  // Tory Lines
  state.toryLines.forEach(tl => {
    if (tl.points.length < 2) return;
    svg += `<polyline points="${tl.points.map(p => p.x+','+p.y).join(' ')}" fill="none" stroke="#ff69b4" stroke-width="2.5" stroke-dasharray="8 4" stroke-linecap="round" stroke-linejoin="round"/>`;
  });

  // Shelves
  state.shelves.forEach(shelf => {
    const dim = getDims(shelf);
    const color = getColor(shelf);
    const angle = getAngle(shelf);
    const opacity = shelf.inactive ? 0.25 : 0.75;

    if (shelf.type === 'sixway') {
      const r = shelf.radius || 20;
      const cx = shelf.x, cy = shelf.y;
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="${opacity * 0.73}" stroke="${color}" stroke-width="1.5"/>`;
      svg += `<circle cx="${cx}" cy="${cy}" r="${Math.max(3, r*0.18)}" fill="${color}" fill-opacity="0.9" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>`;
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 - 90) * Math.PI / 180;
        svg += `<line x1="${cx + Math.cos(a)*r*0.22}" y1="${cy + Math.sin(a)*r*0.22}" x2="${cx + Math.cos(a)*r*0.88}" y2="${cy + Math.sin(a)*r*0.88}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round"/>`;
        svg += `<circle cx="${cx + Math.cos(a)*r*0.88}" cy="${cy + Math.sin(a)*r*0.88}" r="${Math.max(2, r*0.08)}" fill="rgba(255,255,255,0.7)"/>`;
      }
      if (showLabels && shelf.name) {
        const fs = Math.max(7, Math.min(12, r*0.4));
        svg += `<text x="${cx}" y="${cy+r+fs+2}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="${fs}" font-weight="700" fill="#fff">${shelf.name}</text>`;
        if (shelf.subname) svg += `<text x="${cx}" y="${cy+r+fs*2+4}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="${fs*0.75}" fill="rgba(255,255,255,0.7)">${shelf.subname}</text>`;
      }
    } else {
      const cx = shelf.x + dim.w/2, cy = shelf.y + dim.h/2;
      const transform = angle !== 0 ? ` transform="rotate(${angle},${cx},${cy})"` : '';
      svg += `<g${transform}>`;
      svg += `<rect x="${shelf.x}" y="${shelf.y}" width="${dim.w}" height="${dim.h}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="1" rx="2"/>`;
      if (showLabels && shelf.name) {
        const fs = Math.max(8, Math.min(12, dim.w*0.15, dim.h*0.35));
        svg += `<text x="${cx}" y="${cy + (shelf.subname ? -fs*0.2 : 4)}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="${fs}" font-weight="700" fill="#fff">${shelf.name}</text>`;
        if (shelf.subname) svg += `<text x="${cx}" y="${cy + fs*0.7}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="${fs*0.75}" fill="rgba(255,255,255,0.7)">${shelf.subname}</text>`;
      }
      svg += '</g>';
    }
  });

  // Title
  const storeName = document.getElementById('storeName').value || '';
  const storeNum = document.getElementById('storeNumber').value || '';
  const floorName = state.floors.length > 1 ? ` — ${state.floors.find(f => f.id === state.currentFloorId)?.name || ''}` : '';
  if (storeName || storeNum) {
    svg += `<text x="${x0+10}" y="${y0+16}" font-family="DM Sans,sans-serif" font-size="12" font-weight="700" fill="#333">${storeNum ? '#'+storeNum+' ' : ''}${storeName}${floorName}</text>`;
  }

  svg += '</svg>';
  return { svg, w: w*2, h: h*2 };
}

function exportSVG() {
  const { svg } = buildExportSVG();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const num = document.getElementById('storeNumber').value;
  a.href = url; a.download = (num ? num + '-' : '') + 'store-map.svg';
  a.click(); URL.revokeObjectURL(url);
  closePrintModal();
}

function exportPNG() {
  const { svg, w, h } = buildExportSVG();
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const num = document.getElementById('storeNumber').value;
      a.href = url; a.download = (num ? num + '-' : '') + 'store-map.png';
      a.click(); URL.revokeObjectURL(url);
    });
    closePrintModal();
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function buildFloorSVG(floorData) {
  // Build an SVG for a single floor's data (shelves, landmarks, boundary, emergency)
  const fd = floorData || {};
  const shelves = fd.shelves || [];
  const landmarks = fd.landmarks || [];
  const walls = fd.walls || [];
  const toryLines = fd.toryLines || [];
  const toryDocks = fd.toryDocks || [];
  const boundary = fd.boundary || [];
  const emergency = fd.emergencyMarkers || [];

  // Calculate bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shelves.forEach(s => {
    if (s.type === 'sixway') {
      const r = s.radius || 20;
      minX = Math.min(minX, s.x - r); minY = Math.min(minY, s.y - r);
      maxX = Math.max(maxX, s.x + r); maxY = Math.max(maxY, s.y + r);
    } else {
      const dim = s.type === 'custom' ? { w: s.customW, h: s.customH } :
        s.orientation === 'V' ? { w: (s.depth || state.stockroomDepth || 30), h: (s.modules || 3) * (s.bayW || state.moduleWidth || 40) } :
        { w: (s.modules || 3) * (s.bayW || state.moduleWidth || 40), h: (s.depth || state.shelfDepth || 20) };
      minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + dim.w); maxY = Math.max(maxY, s.y + dim.h);
    }
  });
  landmarks.forEach(z => { minX = Math.min(minX, z.x); minY = Math.min(minY, z.y); maxX = Math.max(maxX, z.x + z.w); maxY = Math.max(maxY, z.y + z.h); });
  walls.forEach(w => { minX = Math.min(minX, w.x); minY = Math.min(minY, w.y); maxX = Math.max(maxX, w.x + w.w); maxY = Math.max(maxY, w.y + w.h); });
  toryLines.forEach(tl => { tl.points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); });
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  const pad = 30;
  const x0 = minX - pad, y0 = minY - pad;
  const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}" style="background:#f8f9fa">`;
  svg += `<style>.shelf{stroke-width:1;rx:2}.shelf-label{font-family:'JetBrains Mono',monospace;text-anchor:middle;dominant-baseline:central;fill:#fff;font-weight:700;pointer-events:none}.landmark-rect{fill:rgba(26,27,30,0.6);stroke:#888;stroke-width:0.5;rx:3}.landmark-label{font-family:'JetBrains Mono',monospace;text-anchor:middle;dominant-baseline:central;fill:#fff;font-weight:700;letter-spacing:1px;pointer-events:none}.wall-rect{fill:#1a1b1e;stroke:#000;stroke-width:1.5}.tory-path{fill:none;stroke:#ff69b4;stroke-width:2.5;stroke-dasharray:8 4;stroke-linecap:round;stroke-linejoin:round}.tory-dock-bg{fill:#2a0a1e;stroke:#ec4899;stroke-width:2.4;rx:4}.tory-dock-icon{fill:none;stroke:#ec4899;stroke-width:2.4;stroke-linecap:round}.tory-dock-label{font-family:'JetBrains Mono',monospace;text-anchor:middle;fill:#ec4899;font-weight:700;pointer-events:none}</style>`;

  // Boundary
  if (boundary.length >= 3) {
    svg += `<polygon points="${boundary.map(p => p.x+','+p.y).join(' ')}" fill="none" stroke="#1a1a2e" stroke-width="3" stroke-linejoin="round"/>`;
  }

  // Landmarks
  landmarks.forEach(z => {
    svg += buildLandmarkSVG(z, { dataAttrs: true, showLabels: true });
  });

  // Walls
  walls.forEach(w => {
    const angle = w.angle || 0;
    const cx = w.x + w.w/2, cy = w.y + w.h/2;
    const tr = angle ? ` transform="rotate(${angle},${cx},${cy})"` : '';
    if (w.kind === 'window') {
      const hz = w.w >= w.h, cgx = w.x + w.w/2, cgy = w.y + w.h/2;
      svg += `<g class="wall-group window" data-wall="true" data-wall-x="${w.x}" data-wall-y="${w.y}" data-wall-w="${w.w}" data-wall-h="${w.h}"${tr}><rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="#cfe8fa" stroke="#7ab8dd" stroke-width="1.5"/><line x1="${hz ? w.x+2 : cgx}" y1="${hz ? cgy : w.y+2}" x2="${hz ? w.x+w.w-2 : cgx}" y2="${hz ? cgy : w.y+w.h-2}" stroke="#ffffff" stroke-width="1.2"/></g>`;
    } else {
      svg += `<g class="wall-group" data-wall="true" data-wall-x="${w.x}" data-wall-y="${w.y}" data-wall-w="${w.w}" data-wall-h="${w.h}"${tr}><rect class="wall-rect" x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="#1a1b1e" stroke="#000" stroke-width="1.5"/></g>`;
    }
  });

  // Tory Lines
  toryLines.forEach(tl => {
    if (tl.points.length < 2) return;
    const pts = tl.points.map(p => p.x+','+p.y).join(' ');
    svg += `<g class="tory-line-path" data-tory="true"><polyline class="tory-path" points="${pts}" fill="none" stroke="#ff69b4" stroke-width="2.5" stroke-dasharray="8 4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  });

  // Tory Bot docks — standout pink square + power icon (24x24 icon scaled to box)
  toryDocks.forEach(td => {
    const sz = 34, half = sz / 2, r = sz * 0.42;
    const scale = (2 * r) / 24;
    const iw = (2.4 / scale).toFixed(2);
    let dock = `<g class="tory-dock" data-tory-dock="true" data-x="${Math.round(td.x)}" data-y="${Math.round(td.y)}">`;
    dock += `<rect class="tory-dock-bg" x="${td.x - half}" y="${td.y - half}" width="${sz}" height="${sz}" rx="4" fill="#2a0a1e" stroke="#ec4899" stroke-width="2.4"/>`;
    dock += `<g class="tory-dock-icon" transform="translate(${(td.x - r).toFixed(2)} ${(td.y - r).toFixed(2)}) scale(${scale.toFixed(4)})" fill="none" stroke="#ec4899" stroke-width="${iw}" stroke-linecap="round">`;
    dock += `<path d="M7 6a7.75 7.75 0 1 0 10 0"/><line x1="12" y1="4" x2="12" y2="12"/></g>`;
    if (td.label) dock += `<text class="tory-dock-label" x="${td.x}" y="${td.y + half + 10}" font-size="8">${td.label}</text>`;
    dock += `</g>`;
    svg += dock;
  });

  // Shelves
  const deptColors = {};
  state.departments.forEach(d => deptColors[d.id] = d.color);

  // === PASS 1: Build shelf rects and collect badge positions ===
  const badgeInfos = []; // { idx, cx, cy, fs, displayName, subname, angle }
  const shelfSvgs = [];

  shelves.forEach((s, idx) => {
    const color = deptColors[s.dept] || '#888';
    const opacity = s.inactive ? 0.25 : 0.75;
    const fullName = s.name + (s.subname ? ' ' + s.subname : '');
    const locationsAttr = (s.locations && s.locations.length >= 2) ? ` data-locations="${s.locations.join(',')}"` : '';
    // v0.130: data-fixture only when set AND differs from auto-detection
    let fixtureAttr = '';
    if (s.fixture) {
      const auto = autoDetectFixture(s);
      if (s.fixture !== auto) {
        fixtureAttr = ` data-fixture="${s.fixture}"`;
      }
    }
    const dataAttrs = ` data-shelf="${s.name || ''}" data-subname="${s.subname || ''}" data-dept="${s.dept || ''}" data-full="${fullName}"${locationsAttr}${fixtureAttr}`;

    if (s.type === 'sixway') {
      const r = s.radius || 20;
      let sg = `<g class="shelf-group"${dataAttrs}>`;
      sg += `<circle cx="${s.x}" cy="${s.y}" r="${r}" class="shelf" fill="${color}" fill-opacity="${opacity * 0.73}" stroke="${color}"/>`;
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 - 90) * Math.PI / 180;
        sg += `<line x1="${s.x + Math.cos(a)*r*0.22}" y1="${s.y + Math.sin(a)*r*0.22}" x2="${s.x + Math.cos(a)*r*0.88}" y2="${s.y + Math.sin(a)*r*0.88}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round"/>`;
      }
      if (s.name) {
        const fs = Math.max(7, Math.min(12, r*0.4));
        badgeInfos.push({ idx, cx: s.x, cy: s.y + r + fs + 2, fs, displayName: fullName, subname: null, angle: 0 });
      }
      sg += `</g>`;
      shelfSvgs.push(sg);
    } else {
      const dim = s.type === 'custom' ? { w: s.customW, h: s.customH } :
        s.orientation === 'V' ? { w: (s.depth || state.shelfDepth || 20), h: (s.modules || 3) * (s.bayW || state.moduleWidth || 40) } :
        { w: (s.modules || 3) * (s.bayW || state.moduleWidth || 40), h: (s.depth || state.shelfDepth || 20) };
      const cx = s.x + dim.w/2, cy = s.y + dim.h/2;
      const angle = (s.orientation === 'A' && s.angle != null) ? s.angle : 0;
      const tr = angle ? ` transform="rotate(${angle},${cx},${cy})"` : '';
      let sg = `<g class="shelf-group"${dataAttrs}${tr}>`;
      sg += `<rect class="shelf" x="${s.x}" y="${s.y}" width="${dim.w}" height="${dim.h}" fill="${color}" fill-opacity="${opacity}" stroke="${color}"/>`;
      if (s.name) {
        const fs = Math.max(8, Math.min(12, dim.w*0.15, dim.h*0.35));
        const displayName = (s.locations && s.locations.length >= 2) ? formatLocationRange(s.locations) : s.name;
        badgeInfos.push({ idx, cx, cy, fs, displayName, subname: s.subname || null, angle });
      }
      sg += `</g>`;
      shelfSvgs.push(sg);
    }
  });

  // === PASS 2: Collision detection & nudge (iterative) ===
  const badgeOffsets = badgeInfos.map(() => ({ dx: 0, dy: 0 }));
  const LABEL_GAP = 1;

  for (let pass = 0; pass < 5; pass++) {
    let anyCollision = false;
    for (let i = 0; i < badgeInfos.length; i++) {
      for (let j = i + 1; j < badgeInfos.length; j++) {
        const a = badgeInfos[i], b = badgeInfos[j];
        const aw = a.displayName.length * a.fs * 0.55, ah = a.fs * (a.subname ? 2.0 : 1.3);
        const bw = b.displayName.length * b.fs * 0.55, bh = b.fs * (b.subname ? 2.0 : 1.3);

        const acx = a.cx + badgeOffsets[i].dx, acy = a.cy + badgeOffsets[i].dy;
        const bcx = b.cx + badgeOffsets[j].dx, bcy = b.cy + badgeOffsets[j].dy;

        const overlapX = (aw/2 + bw/2 + LABEL_GAP) - Math.abs(acx - bcx);
        const overlapY = (ah/2 + bh/2 + LABEL_GAP) - Math.abs(acy - bcy);

        if (overlapX > 0 && overlapY > 0) {
          anyCollision = true;
          if (overlapY <= overlapX) {
            const pushY = overlapY / 2 + 0.5;
            if (acy <= bcy) { badgeOffsets[i].dy -= pushY; badgeOffsets[j].dy += pushY; }
            else { badgeOffsets[i].dy += pushY; badgeOffsets[j].dy -= pushY; }
          } else {
            const pushX = overlapX / 2 + 0.5;
            if (acx <= bcx) { badgeOffsets[i].dx -= pushX; badgeOffsets[j].dx += pushX; }
            else { badgeOffsets[i].dx += pushX; badgeOffsets[j].dx -= pushX; }
          }
        }
      }
    }
    if (!anyCollision) break;
  }

  // === PASS 3: Render shelves with adjusted badge positions ===
  let badgeIdx = 0;
  shelves.forEach((s, idx) => {
    svg += shelfSvgs[idx];
    // Find if this shelf has a badge
    const bi = badgeInfos.find(b => b.idx === idx);
    if (bi) {
      const bIdx = badgeInfos.indexOf(bi);
      const off = badgeOffsets[bIdx];
      const tx = bi.cx + off.dx, ty = bi.cy + off.dy;
      const angle = bi.angle;
      const tr = angle ? ` transform="rotate(${angle},${bi.cx},${bi.cy})"` : '';
      if (bi.subname) {
        svg += `<text class="shelf-label" font-size="${bi.fs}" x="${tx}" y="${ty - bi.fs*0.2}"${tr}>${bi.displayName}</text>`;
        svg += `<text class="shelf-label" font-size="${bi.fs*0.75}" x="${tx}" y="${ty + bi.fs*0.7}" fill="rgba(255,255,255,0.7)"${tr}>${bi.subname}</text>`;
      } else {
        svg += `<text class="shelf-label" font-size="${bi.fs}" x="${tx}" y="${ty}"${tr}>${bi.displayName}</text>`;
      }
    }
  });

  // Emergency markers are NO LONGER written to the exported SVG (v0.152).
  // The viewer's loader always regenerates them from the structured emergencyMarkers
  // array, so writing them here would just bloat the file and risk format drift.
  // The structured data in the .js file's `emergencyMarkers` field is the source of
  // truth — that's still written by the export function below as before.
  // (Pre-v0.152 editor versions wrote markers here in the broken format that collided
  // with the viewer's CSS transform rule; the loader strips that legacy content.)

  svg += `</svg>`;
  return svg;
}

function validateAndExportJS() {
  syncCurrentFloor();
  const warnings = [];
  const allShelves = state.floors.flatMap(f => (f.data||{}).shelves||[]);
  
  // Unnamed shelves
  const unnamed = allShelves.filter(s => !s.name && !s.inactive);
  if (unnamed.length) warnings.push(`${unnamed.length} unnamed shelf${unnamed.length>1?'es':''} (won't appear in search)`);
  
  // Unconfirmed duplicate names
  const dupes = getDuplicateNames();
  if (dupes.length) warnings.push(`${dupes.length} duplicate name${dupes.length>1?'s':''}: ${dupes.slice(0,5).join(', ')}${dupes.length>5?' ...':''}`);
  
  // Empty floors
  state.floors.forEach(f => {
    const d = f.data || {};
    const total = (d.shelves||[]).length + (d.landmarks||[]).length + (d.walls||[]).length;
    if (total === 0) warnings.push(`Floor "${f.name}" is empty`);
  });
  
  // No emergency markers
  const totalEm = state.floors.reduce((n,f) => n + ((f.data||{}).emergencyMarkers||[]).length, 0);
  if (totalEm === 0) warnings.push('No emergency markers placed');
  
  // No boundary on any floor
  const hasBoundary = state.floors.some(f => ((f.data||{}).boundary||[]).length >= 3);
  if (!hasBoundary) warnings.push('No store boundary defined');
  
  if (warnings.length === 0) {
    exportJS();
    return;
  }
  
  const msg = 'Export warnings:\n\n• ' + warnings.join('\n• ') + '\n\nExport anyway?';
  if (confirm(msg)) exportJS();
}

function exportJS() {
  // The older viewers' format: the same document as the .json, with each
  // floor's drawing baked in. Conduit reads either.
  const doc = buildMapDocument();
  const storeNum = doc.storeNumber || '0000', storeName = doc.storeName || 'Store';
  doc.floors = doc.floors.map((f, i) => ({ ...f, svg: buildFloorSVG(state.floors[i].data || {}) }));
  const js = `// Store map data — ${storeNum} ${storeName}\n// Generated ${new Date().toISOString()} by Map Editor v4.3\n\n` +
    `window.STORE_MAPS = window.STORE_MAPS || {};\nwindow.STORE_MAPS['${storeNum}'] = ${JSON.stringify(doc, null, 1)};\n`;
  const blob = new Blob([js], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (storeNum + '-' + storeName).replace(/\s+/g, '-').toLowerCase() + '.js';
  a.click(); URL.revokeObjectURL(url);
  closePrintModal();
}

// ═══════════════════════════════════════════════════════════
// GRID SIZE CUSTOMIZATION
// ═══════════════════════════════════════════════════════════
function updateGridSize(size) {
  size = Math.max(5, Math.min(100, size));
  state.gridSize = size;
  updateGridPatterns();
  markDirty();
}

function updateGridPatterns() {
  const gs = state.gridSize;
  const major = gs * 5;
  const minor = document.getElementById('gridMinor');
  minor.setAttribute('width', gs); minor.setAttribute('height', gs);
  minor.querySelector('path').setAttribute('d', `M ${gs} 0 L 0 0 0 ${gs}`);
  const majorEl = document.getElementById('gridMajor');
  majorEl.setAttribute('width', major); majorEl.setAttribute('height', major);
  majorEl.querySelector('rect').setAttribute('width', major); majorEl.querySelector('rect').setAttribute('height', major);
  majorEl.querySelector('path').setAttribute('d', `M ${major} 0 L 0 0 0 ${major}`);
}

// ═══════════════════════════════════════════════════════════
// LOCK SYSTEM
// ═══════════════════════════════════════════════════════════
function batchToggleLock() {
  if (!state.selectedIds.length) return;
  saveState();
  const anyLocked = state.selectedIds.some(id => { const s = state.shelves.find(x => x.id === id); return s?.locked; });
  state.selectedIds.forEach(id => { const s = state.shelves.find(x => x.id === id); if (s) s.locked = !anyLocked; });
  renderAll();
}

function isLocked(shelf) { return !!shelf.locked; }

// ═══════════════════════════════════════════════════════════
// POINT IN POLYGON (for boundary check)
// ═══════════════════════════════════════════════════════════
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function isShelfInsideBoundary(shelf) {
  if (state.boundary.length < 3) return true; // no boundary = all inside
  const dim = getDims(shelf);
  const cx = shelf.type === 'sixway' ? shelf.x : shelf.x + dim.w / 2;
  const cy = shelf.type === 'sixway' ? shelf.y : shelf.y + dim.h / 2;
  return pointInPolygon(cx, cy, state.boundary);
}

// ═══════════════════════════════════════════════════════════
// ZOOM TO SELECTION (double-click shelf list)
// ═══════════════════════════════════════════════════════════
function zoomToShelf(shelfId) {
  const shelf = state.shelves.find(s => s.id === shelfId);
  if (!shelf) return;
  const dim = getDims(shelf);
  const cx = shelf.type === 'sixway' ? shelf.x : shelf.x + dim.w / 2;
  const cy = shelf.type === 'sixway' ? shelf.y : shelf.y + dim.h / 2;
  const c = canvasContainer.getBoundingClientRect();
  state.zoom = Math.min(3, Math.max(1.5, c.width / (dim.w * 6)));
  state.panX = c.width / 2 - cx * state.zoom;
  state.panY = c.height / 2 - cy * state.zoom;
  updateTransform();
}

// ═══════════════════════════════════════════════════════════
// DISTANCE DISPLAY
// ═══════════════════════════════════════════════════════════
function showDistances(movingShelf) {
  // Find the nearest shelf on each side and show distance
  overlayGroup.querySelectorAll('.distance-label,.distance-line').forEach(el => el.remove());
  if (!movingShelf) return;
  const md = getDims(movingShelf);
  const mBounds = { left: movingShelf.x, right: movingShelf.x + md.w, top: movingShelf.y, bottom: movingShelf.y + md.h, cx: movingShelf.x + md.w/2, cy: movingShelf.y + md.h/2 };

  let nearest = { right: null, left: null, top: null, bottom: null };
  let dist = { right: Infinity, left: Infinity, top: Infinity, bottom: Infinity };

  state.shelves.forEach(s => {
    if (s.id === movingShelf.id) return;
    const sd = getDims(s);
    const sb = { left: s.x, right: s.x + sd.w, top: s.y, bottom: s.y + sd.h };
    // Check overlap on perpendicular axis
    const hOverlap = mBounds.bottom > sb.top && mBounds.top < sb.bottom;
    const vOverlap = mBounds.right > sb.left && mBounds.left < sb.right;

    if (hOverlap) {
      const gRight = sb.left - mBounds.right;
      if (gRight > 0 && gRight < dist.right) { dist.right = gRight; nearest.right = sb; }
      const gLeft = mBounds.left - sb.right;
      if (gLeft > 0 && gLeft < dist.left) { dist.left = gLeft; nearest.left = sb; }
    }
    if (vOverlap) {
      const gBottom = sb.top - mBounds.bottom;
      if (gBottom > 0 && gBottom < dist.bottom) { dist.bottom = gBottom; nearest.bottom = sb; }
      const gTop = mBounds.top - sb.bottom;
      if (gTop > 0 && gTop < dist.top) { dist.top = gTop; nearest.top = sb; }
    }
  });

  const addDist = (x1,y1,x2,y2,val) => {
    if (val > 300) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('distance-line');
    line.setAttribute('x1',x1); line.setAttribute('y1',y1); line.setAttribute('x2',x2); line.setAttribute('y2',y2);
    overlayGroup.appendChild(line);
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.classList.add('distance-label');
    txt.setAttribute('x', (x1+x2)/2); txt.setAttribute('y', (y1+y2)/2 - 3/state.zoom);
    txt.setAttribute('font-size', 9/state.zoom);
    txt.textContent = Math.round(val);
    overlayGroup.appendChild(txt);
  };

  if (nearest.right) addDist(mBounds.right, mBounds.cy, nearest.right.left, mBounds.cy, dist.right);
  if (nearest.left) addDist(nearest.left.right, mBounds.cy, mBounds.left, mBounds.cy, dist.left);
  if (nearest.bottom) addDist(mBounds.cx, mBounds.bottom, mBounds.cx, nearest.bottom.top, dist.bottom);
  if (nearest.top) addDist(mBounds.cx, nearest.top.bottom, mBounds.cx, mBounds.top, dist.top);
}

// ═══════════════════════════════════════════════════════════
// INIT — DEMO
// ═══════════════════════════════════════════════════════════

function loadDemo() {
  const d = [
    // A17 — sides physically next to each other (H1 Kitchen)
    { name:'A17', subname:'S1', x:0, y:0, dept:'h1', orientation:'H', modules:4 },
    { name:'A17', subname:'S2', x:0, y:20, dept:'h1', orientation:'H', modules:4 },
    { name:'A17', subname:'E1', x:-20, y:0, dept:'h1', orientation:'V', modules:2 },
    { name:'A17', subname:'E2', x:160, y:0, dept:'h1', orientation:'V', modules:2 },

    // A16 — adjacent shelf unit (H1 Kitchen)
    { name:'A16', subname:'S1', x:0, y:68, dept:'h1', orientation:'H', modules:4 },
    { name:'A16', subname:'S2', x:0, y:88, dept:'h1', orientation:'H', modules:4 },
    { name:'A16', subname:'E1', x:-20, y:68, dept:'h1', orientation:'V', modules:2, inactive:true },

    // B22 — S2 is across the store (H2 BBL)
    { name:'B22', subname:'S1', x:240, y:0, dept:'h2', orientation:'H', modules:5 },
    { name:'B22', subname:'S2', x:500, y:200, dept:'h2', orientation:'H', modules:5 },
    { name:'B22', subname:'E1', x:220, y:0, dept:'h2', orientation:'V', modules:1 },

    // Kids — K1 Activewear
    { name:'K1A', subname:'S1', x:400, y:0, dept:'k1', orientation:'V', modules:3 },
    { name:'K1A', subname:'S2', x:420, y:0, dept:'k1', orientation:'V', modules:3 },
    { name:'K1A', subname:'E1', x:400, y:-20, dept:'k1', orientation:'H', modules:2 },

    // K2 Toys
    { name:'K2A', subname:'S1', x:460, y:0, dept:'k2', orientation:'V', modules:3 },
    { name:'K2A', subname:'S2', x:480, y:0, dept:'k2', orientation:'V', modules:3 },

    // Checkouts
    { name:'CH1', subname:'S1', x:100, y:160, dept:'checkouts', orientation:'H', modules:2 },
    { name:'CH2', subname:'S1', x:180, y:160, dept:'checkouts', orientation:'H', modules:2 },
    { name:'CH3', subname:'S1', x:260, y:160, dept:'checkouts', orientation:'H', modules:2 },

    // Angled shelf examples — side by side at 45°
    { name:'D1', subname:'S1', x:550, y:80, dept:'h3', orientation:'A', angle:45, modules:3 },
    { name:'D1', subname:'S2', x:564.14, y:65.86, dept:'h3', orientation:'A', angle:45, modules:3 },
    { name:'D1', subname:'E1', x:634.85, y:150.71, dept:'h3', orientation:'A', angle:45, modules:1 },
    { name:'D2', subname:'S1', x:550, y:200, dept:'h3', orientation:'A', angle:-30, modules:2 },

    // Inactive / not-in-use shelves
    { name:'', subname:'', x:340, y:160, dept:'h1', orientation:'H', modules:2, inactive:true },

    // Stockroom — BOH 4-digit, no subnames, irregular sizing
    { name:'7001', subname:'', x:0, y:260, dept:'stockroom', orientation:'H', modules:3, bayW:60, depth:30 },
    { name:'7002', subname:'', x:180, y:260, dept:'stockroom', orientation:'H', modules:2, bayW:60, depth:30 },
    { name:'7003', subname:'', x:0, y:300, dept:'stockroom', orientation:'H', modules:4, bayW:50, depth:35 },
    { name:'7004', subname:'', x:200, y:300, dept:'stockroom', orientation:'H', modules:2, bayW:70, depth:30 },

    // Custom shelves — display tables, non-standard fixtures
    { name:'TBL1', subname:'', x:460, y:220, dept:'c1', orientation:'H', modules:1, type:'custom', customW:60, customH:40 },
    { name:'TBL2', subname:'', x:460, y:270, dept:'c3', orientation:'H', modules:1, type:'custom', customW:40, customH:40 },
  ];

  state.shelves = d.map(s => ({ id: 'shelf_' + state.nextId++, bayW: s.bayW || null, depth: s.depth || null, inactive: !!s.inactive, angle: s.angle != null ? s.angle : null, type: s.type || undefined, customW: s.customW || undefined, customH: s.customH || undefined, ...s }));

  state.landmarks = [
    { id: 'landmark_' + state.nextId++, label: 'SERVICE DESK', x: 80, y: 120, w: 100, h: 30 },
    { id: 'landmark_' + state.nextId++, label: 'ENTRY', x: 380, y: 280, w: 80, h: 20 },
    { id: 'landmark_' + state.nextId++, label: 'REGISTERS', x: 80, y: 280, w: 160, h: 20 },
  ];

  state.boundary = [
    { x: 40, y: 40 }, { x: 680, y: 40 }, { x: 680, y: 320 }, { x: 40, y: 320 },
  ];

  state.selectedIds = []; state.selectedLandmarkId = null;
  state.undoStack = []; state.redoStack = [];
  // Reset floors for demo
  state.floors = [{ id: 'ground', name: 'Ground', type: 'foh', level: 0 }];
  state.currentFloorId = 'ground';
  syncCurrentFloor();
  renderFloorTabs();
  // Set store to Bunbury South for demo
  activeStoreId = '1187';
  localStorage.setItem(LAST_STORE_KEY, '1187');
  document.getElementById('storeNumber').value = '1187';
  document.getElementById('storeName').value = 'Bunbury South';
  document.getElementById('activeStoreNum').textContent = '1187';
  document.getElementById('activeStoreName').textContent = 'Bunbury South';
  renderAll(); markDirty();
  setTimeout(fitView, 100);
}

renderAll(); updateTransform();
setTimeout(() => {
  const r = canvasContainer.getBoundingClientRect();
  state.panX = r.width / 2; state.panY = r.height / 2;
  updateTransform();
  // Migrate old autosave if exists (one-time migration)
  migrateOldAutosave();
  // Init store system
  initStoreSystem();
  canvasContainer.focus();
}, 0);

// Ensure toolbar buttons return focus to canvas so keyboard shortcuts keep working
document.querySelectorAll('.tool-btn, .topbar-btn').forEach(btn => {
  btn.addEventListener('mouseup', () => setTimeout(() => canvasContainer.focus(), 10));
});

// ═══════════════════════════════════════════════════════════
// AUTO-SAVE
// ═══════════════════════════════════════════════════════════
const AUTOSAVE_KEY = 'mapeditor-autosave';
let autosaveTimer = null;

function markDirty() {
  state.dirty = true;
  const dot = document.getElementById('autosaveDot');
  const txt = document.getElementById('autosaveText');
  if (dot) dot.classList.add('dirty');
  if (txt) txt.textContent = 'Unsaved';
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autoSave, 3000); // save 3s after last change
}

function autoSave() {
  if (activeStoreId) {
    saveStoreData(activeStoreId);
  }
}

// Migrate old single-store autosave to new per-store system
function migrateOldAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data.shelves?.length && !data.landmarks?.length) { localStorage.removeItem(AUTOSAVE_KEY); return; }
    // Find matching store or use store number from data
    const num = data.storeNumber || '1187';
    if (!localStorage.getItem(storeKey(num))) {
      data.savedAt = new Date().toISOString();
      localStorage.setItem(storeKey(num), JSON.stringify(data));
      localStorage.setItem(LAST_STORE_KEY, num);
    }
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (e) { console.warn('Migration failed:', e); }
}

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', e => {
  if (state.dirty && activeStoreId) { saveStoreData(activeStoreId); e.preventDefault(); e.returnValue = ''; }
});

// Store name changes trigger autosave
document.getElementById('storeNumber').addEventListener('input', markDirty);
document.getElementById('storeName').addEventListener('input', markDirty);

// ═══════════════════════════════════════════════════════════
// STORE REGISTRY & SWITCHER
// ═══════════════════════════════════════════════════════════
const STORE_ZONES = [
  { id: 'wa-south', name: 'WA South Zone', stores: [
    { number: '1187', name: 'Bunbury South', mapFile: '../maps/1187-bunbury-south.js' },
    { number: '1235', name: 'Eaton Fair' },
    { number: '1241', name: 'Busselton', mapFile: '../maps/1241-busselton.js' },
    { number: '3320', name: 'Pinjarra' },
    { number: '1362', name: 'Cockburn Gateways' },
    { number: '1039', name: 'Rockingham' },
    { number: '1257', name: 'Lakelands' },
    { number: '1229', name: 'Baldivis' },
    { number: '1088', name: 'Mandurah Forum' },
    { number: '1244', name: 'Halls Head' },
    { number: '3325', name: 'Esperance' },
  ]},
  { id: 'wa-east', name: 'WA East Zone', stores: [
    { number: '1096', name: 'Armadale' },
    { number: '1166', name: 'Albany' },
  ]},
  { id: 'wa-central', name: 'WA Central Zone', stores: [] },
  { id: 'wa-north', name: 'WA North Zone', stores: [] },
];

// Flat lookup helpers
function getAllStores() { return STORE_ZONES.flatMap(z => z.stores); }
function findStore(num) { return getAllStores().find(s => s.number === num); }
function findStoreZone(num) { return STORE_ZONES.find(z => z.stores.some(s => s.number === num)); }

const STORE_PREFIX = 'mapeditor-store-';
const LAST_STORE_KEY = 'mapeditor-last-store';
let activeStoreId = null; // store number string

function storeKey(num) { return STORE_PREFIX + num; }

function getStoreSaveInfo(num) {
  try {
    const raw = localStorage.getItem(storeKey(num));
    if (!raw) return null;
    const d = JSON.parse(raw);
    let shelfCount = 0, floorCount = 1;
    if (d.floors && d.floors.length) {
      floorCount = d.floors.length;
      d.floors.forEach(f => { shelfCount += (f.data?.shelves || f.shelves || []).length; });
    } else {
      shelfCount = d.shelves?.length || 0;
    }
    return {
      shelfCount,
      floorCount,
      savedAt: d.savedAt || null,
    };
  } catch { return null; }
}

let storeSortBy = 'number'; // 'number' or 'name'
let activeZoneId = 'wa-south';

function renderStoreDropdown() {
  const dd = document.getElementById('storeDropdown');
  const sortIcon = storeSortBy === 'number' ? '#' : 'A';
  const sortLabel = storeSortBy === 'number' ? 'By number' : 'By name';

  // Zone tabs
  let html = '<div style="display:flex;border-bottom:1px solid var(--border)">';
  STORE_ZONES.forEach(z => {
    const isActive = z.id === activeZoneId;
    html += `<div data-onclick="pickZone" data-zone="${z.id}" style="flex:1;padding:8px 6px;font-size:10px;font-family:var(--font-mono);font-weight:600;letter-spacing:0.5px;text-align:center;cursor:pointer;color:${isActive ? 'var(--accent)' : 'var(--text-dim)'};border-bottom:2px solid ${isActive ? 'var(--accent)' : 'transparent'};transition:all 0.15s">${z.name.replace('WA ','').replace(' Zone','')}</div>`;
  });
  html += `<div data-onclick="toggleStoreSort" style="padding:8px 10px;cursor:pointer;color:var(--accent);font-size:10px;font-family:var(--font-mono);font-weight:600" title="Sort: ${sortLabel}">${sortIcon}↕</div>`;
  html += '</div>';

  const zone = STORE_ZONES.find(z => z.id === activeZoneId);
  if (!zone || !zone.stores.length) {
    html += '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">No stores in this zone yet</div>';
  } else {
    const sorted = [...zone.stores].sort((a, b) => {
      if (storeSortBy === 'name') return a.name.localeCompare(b.name);
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });

    sorted.forEach(store => {
      const info = getStoreSaveInfo(store.number);
      const isActive = activeStoreId === store.number;
      const hasServer = true;   // every store can be opened from Conduit (the owner session decides)
      let meta = '';
      if (info) {
        const ago = info.savedAt ? timeAgo(new Date(info.savedAt)) : '';
        const floors = info.floorCount > 1 ? ` · ${info.floorCount} floors` : '';
        meta = `<span class="sd-shelves">${info.shelfCount} shelves${floors}</span><br><span class="sd-saved">${ago}</span>`;
      } else {
        meta = '<span class="sd-empty">No local draft</span>';
      }
      let serverBtn = '';
      if (hasServer) {
        serverBtn = `<button class="sd-server-btn" data-onclick="openFromConduit" data-store="${store.number}" title="Open the map Conduit has for this store">⬇ Conduit</button>`;
      }
      const localBtn = '';
      html += `<div class="store-dropdown-item${isActive ? ' active' : ''}">
        <span class="sd-num" data-onclick="switchStore" data-store="${store.number}">${store.number}</span>
        <span class="sd-name" data-onclick="switchStore" data-store="${store.number}">${store.name}</span>
        <span class="sd-meta" data-onclick="switchStore" data-store="${store.number}">${meta}</span>
        ${localBtn}${serverBtn}
      </div>`;
    });
  }

  dd.innerHTML = html;
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  if (s < 604800) return Math.floor(s/86400) + 'd ago';
  return date.toLocaleDateString();
}

function toggleStoreDropdown() {
  const dd = document.getElementById('storeDropdown');
  if (dd.classList.contains('visible')) { dd.classList.remove('visible'); return; }
  renderStoreDropdown();
  dd.classList.add('visible');
  // Close on outside click
  setTimeout(() => {
    const closer = (e) => { if (!dd.contains(e.target) && !e.target.closest('.store-switcher-btn')) { dd.classList.remove('visible'); document.removeEventListener('pointerdown', closer); } };
    document.addEventListener('pointerdown', closer);
  }, 0);
}

function toggleStoreSort() {
  storeSortBy = storeSortBy === 'number' ? 'name' : 'number';
  renderStoreDropdown();
}

function saveStoreData(storeNum) {
  if (!storeNum) return;
  try {
    syncCurrentFloor();
    const data = {
      storeNumber: storeNum,
      storeName: findStore(storeNum)?.name || '',
      moduleWidth: state.moduleWidth, shelfDepth: state.shelfDepth,
      stockroomBayW: state.stockroomBayW, stockroomDepth: state.stockroomDepth,
      gridSize: state.gridSize,
      metresPerUnit: state.metresPerUnit || null,
      departments: state.departments, deptGroups: state.deptGroups,
      floors: state.floors.map(f => ({ id: f.id, name: f.name, type: f.type || 'foh', level: f.level || 0, data: f.data || {} })),
      currentFloorId: state.currentFloorId,
      nextId: state.nextId,
      storeInfo: state.storeInfo || defaultStoreInfo(),
      audit: state.audit || { items: {} },
      savedAt: new Date().toISOString(),
    };
    const dot = document.getElementById('autosaveDot');
    const txt = document.getElementById('autosaveText');
    try {
      localStorage.setItem(storeKey(storeNum), JSON.stringify(data));
    } catch (quota) {
      // Underlay image too big for localStorage → save everything else so the
      // map and the underlay's saved POSITION survive; the image itself is
      // dropped and can be re-added (it snaps back to the remembered spot).
      const slim = JSON.parse(JSON.stringify(data));
      let dropped = false;
      (slim.floors || []).forEach(f => { if (f.data && f.data.underlay) { f.data.underlay = null; dropped = true; } });
      localStorage.setItem(storeKey(storeNum), JSON.stringify(slim));
      if (dropped) {
        if (txt) txt.textContent = 'Saved (image too big to store)';
        if (!state._warnedUnderlaySize) { state._warnedUnderlaySize = true; console.warn('Underlay image exceeded local storage; map saved without it. Its position is remembered.'); }
      }
    }
    state.dirty = false;
    if (dot) dot.classList.remove('dirty');
    if (txt && txt.textContent === 'Unsaved') txt.textContent = 'Saved';
  } catch (e) { console.warn('Store save failed:', e); }
}

function loadStoreData(storeNum) {
  try {
    const raw = localStorage.getItem(storeKey(storeNum));
    if (!raw) return false;
    const data = JSON.parse(raw);
    state.storeInfo = Object.assign(defaultStoreInfo(), data.storeInfo || {});
    state.audit = (data.audit && data.audit.items) ? data.audit : { items: {} };
    if (data.moduleWidth) { state.moduleWidth = data.moduleWidth; document.getElementById('globalModuleW').value = data.moduleWidth; }
    if (data.shelfDepth) { state.shelfDepth = data.shelfDepth; document.getElementById('globalShelfDepth').value = data.shelfDepth; }
    if (data.stockroomBayW) { state.stockroomBayW = data.stockroomBayW; document.getElementById('globalStockBayW').value = data.stockroomBayW; }
    if (data.stockroomDepth) { state.stockroomDepth = data.stockroomDepth; document.getElementById('globalStockDepth').value = data.stockroomDepth; }
    if (data.gridSize) { state.gridSize = data.gridSize; document.getElementById('globalGridSize').value = data.gridSize; updateGridPatterns(); }
    state.metresPerUnit = data.metresPerUnit > 0 ? data.metresPerUnit : null;
    if (data.departments) state.departments = data.departments;
    if (data.deptGroups) state.deptGroups = data.deptGroups;

    // Floor system — backwards compatible
    if (data.floors && data.floors.length) {
      state.floors = data.floors;
      // Deduplicate floors: keep one FOH + one BOH per level
      const floorSeen = {};
      state.floors = state.floors.filter(f => {
        const key = (f.level || 0) + '_' + (f.type || 'foh');
        if (floorSeen[key]) { console.log('Load: Removed duplicate floor "' + f.name + '" (' + key + ')'); return false; }
        floorSeen[key] = true; return true;
      });
      state.currentFloorId = data.currentFloorId || data.floors[0].id;
      loadFloor(state.currentFloorId);
    } else {
      // Legacy format: flat shelves/landmarks at top level → migrate to single ground floor
      state.floors = [{ id: 'ground', name: 'Ground', type: 'foh', level: 0, data: {
        shelves: data.shelves || [],
        landmarks: data.landmarks || [],
        boundary: data.boundary || [],
        deptZoomBoxes: Array.isArray(data.deptZoomBoxes) ? data.deptZoomBoxes : [],
        emergencyMarkers: Array.isArray(data.emergencyMarkers) ? data.emergencyMarkers : [],
        priceChecks: Array.isArray(data.priceChecks) ? data.priceChecks : [],
        underlay: null, underlayOpacity: 0.3, underlayScale: 1.87, underlayX: 0, underlayY: 0,
        zoom: 1, panX: 0, panY: 0,
      }}];
      state.currentFloorId = 'ground';
      loadFloor('ground');
    }

    if (data.nextId) state.nextId = data.nextId;
    state.selectedIds = []; state.selectedLandmarkIds = []; state.selectedLandmarkId = null; state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
    state.selectedPathNodeId = null; state.selectedPathNodeIds = []; pathChainPrevId = null;
    state.undoStack = []; state.redoStack = [];
    renderFloorTabs();
    populateStoreInfoForm();
    return true;
  } catch (e) { console.warn('Store load failed:', e); return false; }
}

// ─── Store Info (viewer metadata: hours, type, orientation, address, etc.) ───
const STORE_INFO_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function defaultStoreInfo() {
  return {
    zone: '', brand: 'Kmart', orientation: 'normal',
    storeType: 'Store', storeStyle: 'C', storeSize: '',
    addressLines: ['', '', ''],
    hoursDays: STORE_INFO_DAYS.map(function(d){ return [d, '']; }),
    publicHolidays: [],
    lat: '', lng: '', directionsGoogle: '', directionsApple: '',
    parkingTip: '', parkingLat: '', parkingLng: '',
    assemblyNotes: '', assemblyLat: '', assemblyLng: '',
    completion: '', lastUpdated: ''
  };
}
function ensureStoreInfo() { if (!state.storeInfo) state.storeInfo = defaultStoreInfo(); return state.storeInfo; }
function updateStoreInfo(field, value) { ensureStoreInfo()[field] = value; if (typeof markDirty === 'function') markDirty(); }
function updateStoreAddrLine(i, value) { var si = ensureStoreInfo(); if (!si.addressLines) si.addressLines = ['','','']; si.addressLines[i] = value; markDirty(); }
function updateStoreHours(i, value) { var si = ensureStoreInfo(); if (!si.hoursDays) si.hoursDays = defaultStoreInfo().hoursDays; si.hoursDays[i] = [STORE_INFO_DAYS[i], value]; markDirty(); }
function buildStoreHoursRows() {
  var box = document.getElementById('si-hours-rows'); if (!box) return;
  box.innerHTML = STORE_INFO_DAYS.map(function(d, i) {
    var weekend = (d === 'Saturday' || d === 'Sunday') ? ' weekend' : '';
    return '<div class="panel-row"><span class="panel-label si-day' + weekend + '">' + d + '</span>' +
      '<input type="text" class="panel-input" style="flex:1" id="si-hours-' + i + '" placeholder="8am – 9pm" data-oninput="storeHours" data-i="' + i + '"></div>';
  }).join('');
}
function siEscAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function addStoreHoliday() { var si = ensureStoreInfo(); if (!si.publicHolidays) si.publicHolidays = []; si.publicHolidays.push({ name: '', date: '', hours: '' }); renderStoreHolidays(); markDirty(); }
function removeStoreHoliday(i) { var h = ensureStoreInfo().publicHolidays; if (h) { h.splice(i, 1); renderStoreHolidays(); markDirty(); } }
function updateStoreHoliday(i, field, value) { var h = ensureStoreInfo().publicHolidays; if (h && h[i]) { h[i][field] = value; markDirty(); } }
function renderStoreHolidays() {
  var box = document.getElementById('si-holidays'); if (!box) return;
  var hols = ensureStoreInfo().publicHolidays || [];
  if (!hols.length) { box.innerHTML = '<div class="si-hol-empty">No public holidays added.</div>'; return; }
  box.innerHTML = hols.map(function(h, i) {
    return '<div class="si-hol">' +
      '<div class="panel-row"><input type="text" class="panel-input" style="flex:1" value="' + siEscAttr(h.name) + '" placeholder="Holiday name (e.g. Christmas Day)" data-oninput="storeHoliday" data-i="' + i + '" data-field="name">' +
        '<button class="si-hol-del" title="Remove" data-onclick="removeStoreHoliday" data-i="' + i + '">&times;</button></div>' +
      '<div class="panel-row"><input type="date" class="panel-input" style="width:132px" value="' + siEscAttr(h.date) + '" data-onchange="storeHoliday" data-i="' + i + '" data-field="date">' +
        '<input type="text" class="panel-input" style="flex:1" value="' + siEscAttr(h.hours) + '" placeholder="Closed / 9am – 5pm" data-oninput="storeHoliday" data-i="' + i + '" data-field="hours"></div>' +
    '</div>';
  }).join('');
}
function populateStoreInfoForm() {
  buildStoreHoursRows();
  renderStoreHolidays();
  var si = ensureStoreInfo();
  function set(id, v){ var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); }
  set('si-zone', si.zone); set('si-brand', si.brand); set('si-orientation', si.orientation || 'normal');
  set('si-storeType', si.storeType); set('si-storeStyle', si.storeStyle); set('si-storeSize', si.storeSize);
  (si.addressLines || []).forEach(function(l, i){ set('si-addr-' + i, l); });
  (si.hoursDays || []).forEach(function(d, i){ set('si-hours-' + i, d[1]); });
  set('si-lat', si.lat); set('si-lng', si.lng);
  set('si-dirGoogle', si.directionsGoogle); set('si-dirApple', si.directionsApple);
  set('si-parkingTip', si.parkingTip); set('si-parkingLat', si.parkingLat); set('si-parkingLng', si.parkingLng);
  set('si-assemblyNotes', si.assemblyNotes); set('si-assemblyLat', si.assemblyLat); set('si-assemblyLng', si.assemblyLng);
  set('si-completion', si.completion); set('si-lastUpdated', si.lastUpdated);
}


// ═══════════════════════════════════════════════════════════════════
// WALK PATHS — the aisle network used by the viewer for pick routing.
// Nodes along main walkways, undirected links between them. Per-floor
// (lives in floor.data via FLOOR_FIELDS, so drafts + exports carry it).
// ═══════════════════════════════════════════════════════════════════
function pathNodeAt(x, y) {
  var r = 15 / state.zoom, best = null, bd = r;
  (state.pathNodes || []).forEach(function (n) {
    var d = Math.hypot(n.x - x, n.y - y);
    if (d <= bd) { bd = d; best = n; }
  });
  return best;
}
function pathEdgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

// Nearest edge to a point, within tolerance. Returns {edge, key, dist} | null.
function pathEdgeAt(x, y) {
  var nm = {}; (state.pathNodes || []).forEach(function (n) { nm[n.id] = n; });
  var tol = 12 / state.zoom, best = null;
  (state.pathEdges || []).forEach(function (e) {
    var a = nm[e.a], b = nm[e.b]; if (!a || !b) return;
    var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var px = a.x + t * dx, py = a.y + t * dy;
    var d = Math.hypot(x - px, y - py);
    if (d <= tol && (!best || d < best.dist)) best = { edge: e, key: pathEdgeKey(e.a, e.b), dist: d };
  });
  return best;
}

function setPathMode(m) {
  pathMode = m;
  pathChainPrevId = null;
  pathCursor = null;
  // clear cross-mode selections so the panel + canvas stay coherent
  if (m === 'connect') { state.selectedPathEdge = null; }
  var cb = document.getElementById('pathModeConnect'), sb = document.getElementById('pathModeSelect');
  if (cb && sb) { cb.classList.toggle('active', m === 'connect'); sb.classList.toggle('active', m === 'select'); }
  renderPaths(); updatePathPanel();
}

function deletePathEdge(edgeOrKey) {
  var key = typeof edgeOrKey === 'string' ? edgeOrKey : pathEdgeKey(edgeOrKey.a, edgeOrKey.b);
  var i = (state.pathEdges || []).findIndex(function (e) { return pathEdgeKey(e.a, e.b) === key; });
  if (i < 0) return;
  saveState();
  state.pathEdges.splice(i, 1);
  state.selectedPathEdge = null;
  renderPaths(); updatePathPanel(); markDirty();
}

function addPathNode(x, y, type) {
  var n = { id: 'pn' + (state.nextId++), x: x, y: y, type: type || 'path' };
  state.pathNodes.push(n); return n;
}
function pathEdgeIndex(a, b) {
  return (state.pathEdges || []).findIndex(function (e) {
    return (e.a === a && e.b === b) || (e.a === b && e.b === a);
  });
}
function togglePathEdge(a, b) {
  if (a === b) return 'noop';
  var i = pathEdgeIndex(a, b);
  if (i >= 0) { state.pathEdges.splice(i, 1); return 'removed'; }
  state.pathEdges.push({ a: a, b: b }); return 'added';
}

// ── Auto-junction on crossing links (v0.250) ────────────────────────────
// Segment-segment intersection (proper crossing only — not shared endpoints
// or collinear overlap). Returns {x,y,t,u} | null. t = param along p1→p2.
function segIntersect(p1, p2, p3, p4) {
  var d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  var d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  var den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;            // parallel / collinear
  var t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  var u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
  var eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;  // must cross interior of BOTH
  return { x: p1.x + t * d1x, y: p1.y + t * d1y, t: t, u: u };
}

// Find every existing edge the segment a→b crosses. Returns
// [{edge, edgeIndex, x, y, t}] sorted by t (distance along a→b).
function pathCrossingsForSegment(ax, ay, bx, by, ignoreIds) {
  var nm = {}; (state.pathNodes || []).forEach(function (n) { nm[n.id] = n; });
  var ig = {}; (ignoreIds || []).forEach(function (id) { ig[id] = true; });
  var p1 = { x: ax, y: ay }, p2 = { x: bx, y: by }, hits = [];
  (state.pathEdges || []).forEach(function (e, idx) {
    if (ig[e.a] || ig[e.b]) return;                 // skip edges touching the segment's own endpoints
    var na = nm[e.a], nb = nm[e.b]; if (!na || !nb) return;
    var ix = segIntersect(p1, p2, na, nb);
    if (ix) hits.push({ edge: e, edgeIndex: idx, x: ix.x, y: ix.y, t: ix.t });
  });
  hits.sort(function (h1, h2) { return h1.t - h2.t; });
  return hits;
}

// If a point lands on the INTERIOR of an existing link (not at its node ends),
// return {edge, edgeIndex, x, y} for the projection — used to make a T-junction
// when a new line ends on an existing link. tol in canvas units.
function pathEdgeHitForPoint(x, y, ignoreIds) {
  var nm = {}; (state.pathNodes || []).forEach(function (n) { nm[n.id] = n; });
  var ig = {}; (ignoreIds || []).forEach(function (id) { ig[id] = true; });
  var tol = 12 / state.zoom, best = null;
  (state.pathEdges || []).forEach(function (e, idx) {
    if (ig[e.a] || ig[e.b]) return;
    var a = nm[e.a], b = nm[e.b]; if (!a || !b) return;
    var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; if (L2 === 0) return;
    var t = ((x - a.x) * dx + (y - a.y) * dy) / L2;
    if (t <= 0.02 || t >= 0.98) return;             // near an end → that's a normal node-join, not a T
    var px = a.x + t * dx, py = a.y + t * dy;
    var d = Math.hypot(x - px, y - py);
    if (d <= tol && (!best || d < best.dist)) best = { edge: e, edgeIndex: idx, x: px, y: py, dist: d };
  });
  return best;
}

// Place a node at (x,y); if it lands on an existing link's interior, split that
// link so the new node becomes a T-junction on it. Returns the node.
function addPathNodeOnEdgeAware(x, y, ignoreIds) {
  var hit = pathEdgeHitForPoint(x, y, ignoreIds);
  if (!hit) return addPathNode(x, y);
  var oldA = hit.edge.a, oldB = hit.edge.b;
  var ei = pathEdgeIndex(oldA, oldB);
  if (ei >= 0) state.pathEdges.splice(ei, 1);
  var jx = addPathNode(hit.x, hit.y);   // sit exactly on the link (precise, not grid-snapped)
  if (oldA !== jx.id && pathEdgeIndex(oldA, jx.id) < 0) togglePathEdge(oldA, jx.id);
  if (oldB !== jx.id && pathEdgeIndex(oldB, jx.id) < 0) togglePathEdge(oldB, jx.id);
  return jx;
}

// Create a link from fromId to toId, but if the straight line crosses existing
// links, drop a junction node at each crossing and stitch everything together
// so all four arms connect. Returns the id the chain should continue from (toId).
// Assumes caller has already called saveState().
function linkWithJunctions(fromId, toId) {
  var nm = {}; (state.pathNodes || []).forEach(function (n) { nm[n.id] = n; });
  var A = nm[fromId], B = nm[toId];
  if (!A || !B) { togglePathEdge(fromId, toId); return toId; }
  var crossings = pathCrossingsForSegment(A.x, A.y, B.x, B.y, [fromId, toId]);
  if (!crossings.length) { togglePathEdge(fromId, toId); return toId; }

  var prev = fromId;
  crossings.forEach(function (c) {
    // split the crossed edge: remove it, add a junction node, link node→both old ends
    var oldA = c.edge.a, oldB = c.edge.b;
    var ei = pathEdgeIndex(oldA, oldB);
    if (ei >= 0) state.pathEdges.splice(ei, 1);
    var jx = addPathNode(c.x, c.y);      // junction at the exact crossing point (precise)
    if (oldA !== jx.id && pathEdgeIndex(oldA, jx.id) < 0) togglePathEdge(oldA, jx.id);
    if (oldB !== jx.id && pathEdgeIndex(oldB, jx.id) < 0) togglePathEdge(oldB, jx.id);
    // continue the new line through the junction
    if (prev !== jx.id && pathEdgeIndex(prev, jx.id) < 0) togglePathEdge(prev, jx.id);
    prev = jx.id;
  });
  if (prev !== toId && pathEdgeIndex(prev, toId) < 0) togglePathEdge(prev, toId);
  return toId;
}
function deletePathNode(id) {
  if (!id) return;
  saveState();
  // Clean up reciprocal portal links on other floors that point back to this node.
  var doomed = (state.pathNodes || []).find(function (n) { return n.id === id; });
  if (doomed && doomed.links && doomed.links.length) {
    doomed.links.forEach(function (l) {
      var other = pathNodeById(l.nodeId, l.floorId);
      if (other && other.links) other.links = other.links.filter(function (x) { return !(x.floorId === state.currentFloorId && x.nodeId === id); });
    });
  }
  state.pathNodes = (state.pathNodes || []).filter(function (n) { return n.id !== id; });
  state.pathEdges = (state.pathEdges || []).filter(function (e) { return e.a !== id && e.b !== id; });
  if (state.selectedPathNodeId === id) state.selectedPathNodeId = null;
  if (pathChainPrevId === id) pathChainPrevId = null;
  renderPaths(); updatePathPanel(); markDirty();
}

// Delete several nodes (+ their links) in one undoable step — used by multi-select.
function deletePathNodes(ids) {
  if (!ids || !ids.length) return;
  saveState();
  var kill = {}; ids.forEach(function (id) { kill[id] = true; });
  state.pathNodes = (state.pathNodes || []).filter(function (n) { return !kill[n.id]; });
  state.pathEdges = (state.pathEdges || []).filter(function (e) { return !kill[e.a] && !kill[e.b]; });
  state.selectedPathNodeIds = [];
  if (kill[state.selectedPathNodeId]) state.selectedPathNodeId = null;
  if (kill[pathChainPrevId]) pathChainPrevId = null;
  renderPaths(); updatePathPanel(); markDirty();
}
function clearFloorPaths() {
  if (!(state.pathNodes || []).length) return;
  if (!confirm('Remove all ' + state.pathNodes.length + ' walk-path nodes on this floor?')) return;
  saveState();
  state.pathNodes = []; state.pathEdges = [];
  state.selectedPathNodeId = null; pathChainPrevId = null;
  renderPaths(); updatePathPanel(); markDirty();
}
// ── Stairs/lift portal links (v0.254) ──────────────────────────────────
// A stairs/lift node may explicitly connect to a matching node on another
// floor via node.links = [{floorId, nodeId}]. Links are reciprocal. This
// replaces fragile position-matching with an authored connection + feedback.
function pathNodeById(id, floorId) {
  // search the current floor's live array, or a specific floor's stored data
  if (!floorId || floorId === state.currentFloorId) {
    return (state.pathNodes || []).find(function (n) { return n.id === id; }) || null;
  }
  var fl = (state.floors || []).find(function (f) { return f.id === floorId; });
  if (!fl || !fl.data || !fl.data.pathNodes) return null;
  return fl.data.pathNodes.find(function (n) { return n.id === id; }) || null;
}
function ensureLinks(n) { if (!n.links) n.links = []; return n.links; }
function hasPortalLink(n, floorId, nodeId) {
  return (n.links || []).some(function (l) { return l.floorId === floorId && l.nodeId === nodeId; });
}
// Add a reciprocal link between (curFloor node A) and (otherFloor node B).
function addPortalLink(aId, bFloorId, bId) {
  saveState();
  var A = pathNodeById(aId, state.currentFloorId);
  if (A) { ensureLinks(A); if (!hasPortalLink(A, bFloorId, bId)) A.links.push({ floorId: bFloorId, nodeId: bId }); }
  // reciprocal on the other floor's stored data
  var B = pathNodeById(bId, bFloorId);
  if (B) { ensureLinks(B); if (!hasPortalLink(B, state.currentFloorId, aId)) B.links.push({ floorId: state.currentFloorId, nodeId: aId }); }
  markDirty(); renderPaths(); updatePathPanel();
}
function removePortalLink(aId, bFloorId, bId) {
  saveState();
  var A = pathNodeById(aId, state.currentFloorId);
  if (A && A.links) A.links = A.links.filter(function (l) { return !(l.floorId === bFloorId && l.nodeId === bId); });
  var B = pathNodeById(bId, bFloorId);
  if (B && B.links) B.links = B.links.filter(function (l) { return !(l.floorId === state.currentFloorId && l.nodeId === aId); });
  markDirty(); renderPaths(); updatePathPanel();
}
// List candidate stairs/lift nodes on OTHER floors to link to.
function portalCandidates() {
  var out = [];
  (state.floors || []).forEach(function (f) {
    if (f.id === state.currentFloorId) return;
    var nodes = (f.data && f.data.pathNodes) || [];
    nodes.forEach(function (n) {
      if (n.type === 'stairs' || n.type === 'lift') out.push({ floorId: f.id, floorName: f.name || f.id, node: n });
    });
  });
  return out;
}
// Arm "click a node on another floor to link" — but since the editor shows one
// floor at a time, we instead use a dropdown of candidates (simpler + reliable).
function linkPortalToCandidate(value) {
  if (!value || !state.selectedPathNodeId) return;
  var parts = value.split('::');   // "floorId::nodeId"
  if (parts.length !== 2) return;
  addPortalLink(state.selectedPathNodeId, parts[0], parts[1]);
}
function unlinkPortal(floorId, nodeId) {
  if (!state.selectedPathNodeId) return;
  removePortalLink(state.selectedPathNodeId, floorId, nodeId);
}

function setPathNodeType(v) {
  var n = (state.pathNodes || []).find(function (x) { return x.id === state.selectedPathNodeId; });
  if (n) { saveState(); n.type = v; renderPaths(); markDirty(); }
}
function cancelPathChain() {
  pathChainPrevId = null; state.selectedPathNodeId = null; state.selectedPathNodeIds = []; state.selectedPathEdge = null;
  pathCursor = null; pathHoverNodeId = null; pathHoverEdgeKey = null;
  renderPaths(); updatePathPanel();
}
function pathTotalLength() {
  var nm = {}; (state.pathNodes || []).forEach(function (n) { nm[n.id] = n; });
  var L = 0;
  (state.pathEdges || []).forEach(function (e) {
    var a = nm[e.a], b = nm[e.b];
    if (a && b) L += Math.hypot(a.x - b.x, a.y - b.y);
  });
  return L;
}
var PATH_NODE_COLOURS = { path: '#22d3ee', entrance: '#10b981', stairs: '#a855f7', lift: '#ec4899' };
function renderPaths() {
  if (!pathsGroup) return;
  var nm = {}; (state.pathNodes || []).forEach(function (n) { nm[n.id] = n; });
  var selEdgeKey = state.selectedPathEdge ? pathEdgeKey(state.selectedPathEdge.a, state.selectedPathEdge.b) : null;
  var svgp = '';

  // Edges — selected (solid amber, thick) / hovered (brighter) / normal (cyan dashed)
  (state.pathEdges || []).forEach(function (e) {
    var a = nm[e.a], b = nm[e.b]; if (!a || !b) return;
    var key = pathEdgeKey(e.a, e.b);
    var isSel = key === selEdgeKey, isHov = key === pathHoverEdgeKey;
    if (isSel) {
      svgp += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
        '" stroke="#fbbf24" stroke-width="5" stroke-linecap="round" opacity="0.95"/>';
    } else {
      svgp += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
        '" stroke="' + (isHov ? '#7dd3fc' : '#22d3ee') + '" stroke-width="' + (isHov ? 3.5 : 2.5) +
        '" stroke-dasharray="7 5" stroke-linecap="round" opacity="' + (isHov ? 1 : 0.75) + '"/>';
    }
  });

  // Connect-mode "will-connect" preview from the armed node to the cursor / hovered node
  if (pathMode === 'connect' && pathChainPrevId && pathCursor) {
    var pv = nm[pathChainPrevId];
    if (pv) {
      var overNode = pathHoverNodeId && pathHoverNodeId !== pathChainPrevId;
      svgp += '<line x1="' + pv.x + '" y1="' + pv.y + '" x2="' + pathCursor.x + '" y2="' + pathCursor.y +
        '" stroke="' + (overNode ? '#34d399' : '#94a3b8') + '" stroke-width="' + (overNode ? 3.5 : 2) +
        '" stroke-dasharray="2 4" stroke-linecap="round" opacity="0.9"/>';
      // Junction preview: little ⊕ markers where this pending line would cross existing links
      var ignore = [pathChainPrevId];
      if (pathHoverNodeId) ignore.push(pathHoverNodeId);
      var xs = pathCrossingsForSegment(pv.x, pv.y, pathCursor.x, pathCursor.y, ignore);
      xs.forEach(function (c) {
        svgp += '<circle cx="' + c.x + '" cy="' + c.y + '" r="6.5" fill="none" stroke="#f59e0b" stroke-width="2"/>' +
          '<path d="M' + (c.x - 4) + ' ' + c.y + ' h8 M' + c.x + ' ' + (c.y - 4) + ' v8" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>';
      });
      // T-junction preview: if the cursor END lands on an existing link (and not on a node),
      // show the ⊕ where the new node would snap onto + split that link.
      if (!overNode) {
        var tHit = pathEdgeHitForPoint(pathCursor.x, pathCursor.y, ignore);
        if (tHit) {
          svgp += '<circle cx="' + tHit.x + '" cy="' + tHit.y + '" r="6.5" fill="none" stroke="#f59e0b" stroke-width="2"/>' +
            '<path d="M' + (tHit.x - 4) + ' ' + tHit.y + ' h8 M' + tHit.x + ' ' + (tHit.y - 4) + ' v8" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>';
        }
      }
    }
  }

  // Nodes
  (state.pathNodes || []).forEach(function (n) {
    var c = PATH_NODE_COLOURS[n.type] || PATH_NODE_COLOURS.path;
    var sel = n.id === state.selectedPathNodeId;
    var inGroup = (state.selectedPathNodeIds || []).indexOf(n.id) >= 0;
    var chain = n.id === pathChainPrevId;
    var hov = n.id === pathHoverNodeId;
    if (sel || inGroup || chain || hov) {
      var ringColour = chain ? '#34d399' : ((sel || inGroup) ? '#fbbf24' : '#fff');
      svgp += '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + (hov && !sel && !inGroup && !chain ? 9 : 10) + '" fill="none" stroke="' +
        ringColour + '" stroke-width="' + (hov && !sel && !inGroup && !chain ? 1.4 : 1.8) + '" stroke-dasharray="3 3" opacity="0.95"/>';
    }
    svgp += '<circle cx="' + n.x + '" cy="' + n.y + '" r="5.5" fill="' + c + '" stroke="#0f1218" stroke-width="1.6"><title>' + n.type + '</title></circle>';
    if (n.type === 'entrance') svgp += '<rect x="' + (n.x - 2) + '" y="' + (n.y - 2.6) + '" width="4" height="5.2" fill="#0f1218"/>';
    if (n.type === 'stairs') svgp += '<path d="M' + (n.x - 2.6) + ' ' + (n.y + 2.4) + ' h1.7 v-1.7 h1.7 v-1.7 h1.8" stroke="#0f1218" stroke-width="1.3" fill="none"/>';
    if (n.type === 'lift') svgp += '<rect x="' + (n.x - 2.4) + '" y="' + (n.y - 2.6) + '" width="4.8" height="5.2" rx="0.6" fill="none" stroke="#0f1218" stroke-width="1.1"/><path d="M' + n.x + ' ' + (n.y - 1.4) + ' v3.2 M' + (n.x - 1.3) + ' ' + (n.y - 0.2) + ' l1.3 -1.3 l1.3 1.3" stroke="#0f1218" stroke-width="0.9" fill="none"/>';
    // Portal-link feedback: a double ring + small ⇅ badge marks a stairs/lift node that
    // explicitly connects to another floor (so it's obvious while authoring).
    if ((n.type === 'stairs' || n.type === 'lift') && n.links && n.links.length) {
      svgp += '<circle cx="' + n.x + '" cy="' + n.y + '" r="8.5" fill="none" stroke="' + (PATH_NODE_COLOURS[n.type]) + '" stroke-width="1.2" opacity="0.85"/>';
      svgp += '<g transform="translate(' + (n.x + 7) + ',' + (n.y - 7) + ')"><circle r="4.5" fill="#0f1218" stroke="' + PATH_NODE_COLOURS[n.type] + '" stroke-width="1"/><path d="M-1.6 0.8 l1.6 -2 l1.6 2 M-1.6 -0.8 l1.6 2 l1.6 -2" stroke="#fff" stroke-width="0.9" fill="none"/></g>';
    }
  });
  pathsGroup.innerHTML = svgp;
}
function updatePathPanel() {
  var panel = document.getElementById('pathPanel'); if (!panel) return;
  var active = state.tool === 'paths' || !!state.selectedPathNodeId || !!state.selectedPathEdge;
  panel.style.display = active ? '' : 'none';
  if (!active) return;
  var nodes = (state.pathNodes || []).length, edges = (state.pathEdges || []).length;
  var L = pathTotalLength();
  var lenTxt = '';
  if (L > 0) {
    lenTxt = ' · ' + Math.round(L) + ' units';
    if (state.metresPerUnit) lenTxt = ' · ~' + Math.round(L * state.metresPerUnit) + ' m of walkway';
  }
  var st = document.getElementById('pathStats');
  if (st) st.textContent = nodes + ' node' + (nodes === 1 ? '' : 's') + ' · ' + edges + ' link' + (edges === 1 ? '' : 's') + lenTxt;

  // mode toggle reflect
  var cb = document.getElementById('pathModeConnect'), sb = document.getElementById('pathModeSelect');
  if (cb && sb) { cb.classList.toggle('active', pathMode === 'connect'); sb.classList.toggle('active', pathMode === 'select'); }

  // per-mode hint
  var hint = document.getElementById('pathChainHint');
  if (hint) {
    hint.innerHTML = pathMode === 'connect'
      ? 'Click empty space to drop linked nodes along the aisles (free placement — hold <b>Ctrl</b> to snap to the grid, <b>Shift</b> to lock a straight line from the last node). Click a node to start linking — a <b style="color:#34d399">green line</b> previews the next connection; click another node to join (a linked node unlinks). If the line crosses or ends on existing links, an <b style="color:#f59e0b">⊕ junction node</b> is added so everything connects. Click a <b>link</b> (when not mid-chain) to select it, then <b>Del</b> to remove it. <b>Esc</b> stops the chain.'
      : 'Click a <b>node</b> or <b>link</b> to select (<b style="color:#fbbf24">amber</b>). <b>Shift+click</b> nodes to select several, then drag any one to move them all together. Drag a node to move it (its links follow). <b>Arrow keys</b> nudge by 1px for fine placement (<b>Shift+arrow</b> = bigger step). <b>Del</b> removes the selection.';
  }

  var groupCount = (state.selectedPathNodeIds || []).length;
  var multi = groupCount > 1;

  // node-type + delete-node rows (single node selected only)
  var n = (!multi) ? (state.pathNodes || []).find(function (x) { return x.id === state.selectedPathNodeId; }) : null;
  var tr = document.getElementById('pathNodeTypeRow'), br = document.getElementById('pathNodeBtnRow');
  if (tr) tr.style.display = n ? '' : 'none';
  if (br) br.style.display = n ? '' : 'none';
  if (n) { var selT = document.getElementById('pathNodeType'); if (selT) selT.value = n.type || 'path'; }

  // Portal (floor-connection) UI — only for a single selected stairs/lift node
  var portalRow = document.getElementById('pathPortalRow');
  if (portalRow) {
    var isPortal = n && (n.type === 'stairs' || n.type === 'lift');
    portalRow.style.display = isPortal ? '' : 'none';
    if (isPortal) {
      // current links list
      var linksBox = document.getElementById('pathPortalLinks');
      if (linksBox) {
        var links = n.links || [];
        if (!links.length) {
          linksBox.innerHTML = '<div style="font-size:10px;color:var(--text-dim);font-style:italic;">Not linked to any floor yet.</div>';
        } else {
          linksBox.innerHTML = links.map(function (l) {
            var fl = (state.floors || []).find(function (f) { return f.id === l.floorId; });
            var fname = fl ? (fl.name || fl.id) : l.floorId;
            return '<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:3px;">' +
              '<span style="flex:1;color:#c084fc;">⇅ ' + fname + '</span>' +
              '<button class="btn-secondary" style="padding:1px 7px;font-size:10px;border-color:rgba(239,106,106,0.4);color:#ef6a6a;" ' +
              'onclick="unlinkPortal(\'' + l.floorId + '\',\'' + l.nodeId + '\')">Unlink</button></div>';
          }).join('');
        }
      }
      // candidate dropdown (other floors' stairs/lift nodes not already linked)
      var addSel = document.getElementById('pathPortalAdd');
      if (addSel) {
        var cands = portalCandidates().filter(function (c) { return !hasPortalLink(n, c.floorId, c.node.id); });
        var opts = '<option value="">+ Link to a floor…</option>';
        cands.forEach(function (c) {
          var tlabel = c.node.type === 'lift' ? 'Lift' : 'Stairs';
          opts += '<option value="' + c.floorId + '::' + c.node.id + '">' + (c.floorName) + ' — ' + tlabel + '</option>';
        });
        addSel.innerHTML = opts;
        var hint = document.getElementById('pathPortalHint');
        if (hint && !cands.length && !(n.links && n.links.length)) hint.textContent = 'No stairs/lift nodes on other floors yet — add one there first, then link them.';
      }
    }
  }

  // group row (2+ nodes selected): count + delete-group
  var gr = document.getElementById('pathGroupRow');
  if (gr) gr.style.display = multi ? '' : 'none';
  var gc = document.getElementById('pathGroupCount');
  if (gc && multi) gc.textContent = groupCount + ' nodes selected — drag any to move all';

  // delete-edge row (when an edge is selected)
  var er = document.getElementById('pathEdgeBtnRow');
  if (er) er.style.display = state.selectedPathEdge ? '' : 'none';
}

function switchStore(storeNum) {
  // Save current store first
  if (activeStoreId && state.dirty) saveStoreData(activeStoreId);
  // v0.319: cancel any pending debounced autosave so it can't fire mid/post-switch
  clearTimeout(autosaveTimer);

  // Reset state for new store
  const store = findStore(storeNum);
  const zone = findStoreZone(storeNum);
  activeStoreId = storeNum;
  if (zone) activeZoneId = zone.id;
  localStorage.setItem(LAST_STORE_KEY, storeNum);

  // Update hidden inputs
  document.getElementById('storeNumber').value = storeNum;
  document.getElementById('storeName').value = store?.name || '';

  // Update topbar display
  document.getElementById('activeStoreNum').textContent = storeNum;
  document.getElementById('activeStoreName').textContent = store?.name || storeNum;

  // Try to load saved data
  if (!loadStoreData(storeNum)) {
    // Fresh store — reset to defaults
    resetToBlank();
    state.storeInfo = defaultStoreInfo();
    state.audit = { items: {} };
    populateStoreInfoForm();
  }

  renderAll(); setTimeout(fitView, 100);
  document.getElementById('storeDropdown').classList.remove('visible');
  state.dirty = false;
  const dot = document.getElementById('autosaveDot');
  const txt = document.getElementById('autosaveText');
  if (dot) dot.classList.remove('dirty');
  if (txt) txt.textContent = 'Saved';
}

// ═══════════════════════════════════════════════════════════
// LOAD FROM SERVER — fetch deployed map file
// ═══════════════════════════════════════════════════════════
// Opening a store's published map is editor/conduit.js (Open from Conduit);
// the old per-file server and bundled loaders are gone.

function resetToBlank() {
  state.shelves = [];
  state.landmarks = [];
  state.walls = [];
  state.toryLines = [];
  state.toryDocks = [];
  state.boundary = [];
  state.deptZoomBoxes = [];
  state.emergencyMarkers = [];
  state.priceChecks = [];
  // v0.319: FIX node-leak between stores — resetToBlank predated the walk-path
  // system and never cleared it, so switching to a store with no saved draft
  // carried the previous store's node network across (and the first autosave
  // then baked it into the new store's draft, making it look unremovable).
  state.pathNodes = [];
  state.pathEdges = [];
  state.selectedPathNodeId = null;
  state.selectedPathNodeIds = [];
  pathChainPrevId = null;
  state.selectedIds = [];
  state.selectedLandmarkId = null;
  state.selectedLandmarkIds = [];
  state.selectedWallId = null;
  state.selectedWallIds = [];
  state.selectedToryLineId = null;
  state.selectedZoomboxId = null;
  state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
  state.undoStack = []; state.redoStack = [];
  state.nextId = 1;
  // Reset module settings to defaults
  state.moduleWidth = 40; state.shelfDepth = 20;
  state.stockroomBayW = 60; state.stockroomDepth = 30;
  state.gridSize = 20;
  document.getElementById('globalModuleW').value = 40;
  document.getElementById('globalShelfDepth').value = 20;
  document.getElementById('globalStockBayW').value = 60;
  document.getElementById('globalStockDepth').value = 30;
  document.getElementById('globalGridSize').value = 20;
  // Reset departments to defaults
  state.departments = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS));
  state.deptGroups = JSON.parse(JSON.stringify(DEFAULT_DEPT_GROUPS));
  // Reset floors
  state.floors = [{ id: 'ground', name: 'Ground', type: 'foh', level: 0 }];
  state.currentFloorId = 'ground';
  removeUnderlay();
  renderFloorTabs();
}

// ═══════════════════════════════════════════════════════════
// FLOOR SYSTEM
// ═══════════════════════════════════════════════════════════

// Per-floor field names
const FLOOR_FIELDS = ['shelves','landmarks','walls','toryLines','boundary','deptZoomBoxes','emergencyMarkers','priceChecks','toryDocks','pathNodes','pathEdges',
  'underlay','underlayOpacity','underlayScale','underlayX','underlayY','zoom','panX','panY'];

function getFloorData() {
  const d = {};
  FLOOR_FIELDS.forEach(f => d[f] = f === 'shelves' || f === 'landmarks' || f === 'walls' || f === 'toryLines' || f === 'boundary' || f === 'deptZoomBoxes' || f === 'emergencyMarkers' || f === 'priceChecks' || f === 'toryDocks' || f === 'pathNodes' || f === 'pathEdges'
    ? JSON.parse(JSON.stringify(state[f])) : state[f]);
  return d;
}

function applyFloorData(data) {
  FLOOR_FIELDS.forEach(f => {
    if (data[f] !== undefined) {
      state[f] = f === 'shelves' || f === 'landmarks' || f === 'walls' || f === 'toryLines' || f === 'boundary' || f === 'deptZoomBoxes' || f === 'emergencyMarkers' || f === 'priceChecks' || f === 'toryDocks' || f === 'pathNodes' || f === 'pathEdges'
        ? JSON.parse(JSON.stringify(data[f])) : data[f];
    } else {
      // Defaults for missing fields
      if (f === 'shelves' || f === 'landmarks' || f === 'walls' || f === 'toryLines' || f === 'boundary' || f === 'deptZoomBoxes' || f === 'emergencyMarkers' || f === 'priceChecks' || f === 'toryDocks' || f === 'pathNodes' || f === 'pathEdges') state[f] = [];
      else if (f === 'underlay') state[f] = null;
      else if (f === 'underlayOpacity') state[f] = 0.3;
      else if (f === 'underlayScale') state[f] = 1.87;
      else if (f === 'underlayX' || f === 'underlayY') state[f] = 0;
      else if (f === 'zoom') state[f] = 1;
      else if (f === 'panX' || f === 'panY') state[f] = 0;
    }
  });
}

function syncCurrentFloor() {
  const floor = state.floors.find(f => f.id === state.currentFloorId);
  if (!floor) return;
  floor.data = getFloorData();
}

function loadFloor(floorId) {
  const floor = state.floors.find(f => f.id === floorId);
  if (!floor) return;
  if (floor.data) {
    applyFloorData(floor.data);
  } else {
    // Fresh floor — empty canvas
    applyFloorData({});
  }
  state.currentFloorId = floorId;
  // Clear selection
  state.selectedIds = []; state.selectedLandmarkId = null;
  state.selectedZoomboxId = null; state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
  state.undoStack = []; state.redoStack = [];
  // Update underlay UI
  document.getElementById('underlayScale').value = Math.round(state.underlayScale * 100);
  document.getElementById('scaleValue').textContent = Math.round(state.underlayScale * 100) + '%';
  document.getElementById('underlayOpacity').value = Math.round(state.underlayOpacity * 100);
  document.getElementById('opacityValue').textContent = Math.round(state.underlayOpacity * 100) + '%';
  document.getElementById('underlayPosX').value = Math.round(state.underlayX);
  document.getElementById('underlayPosY').value = Math.round(state.underlayY);
  if (state.underlay) {
    document.getElementById('underlayDrop').classList.add('has-image');
  } else {
    document.getElementById('underlayDrop').classList.remove('has-image');
    document.querySelector('.underlay-drop-text').innerHTML = '<strong>Click to upload</strong> or drag & drop';
  }
  // Update zoom/pan
  updateTransform();
}

function switchFloor(floorId) {
  if (floorId === state.currentFloorId) return;
  syncCurrentFloor();
  loadFloor(floorId);
  renderFloorTabs();
  renderAll();
  setTimeout(fitView, 50);
}

function addFloor(presetType) {
  // Legacy compat — redirect to level system
  const currentFloor = state.floors.find(f => f.id === state.currentFloorId);
  const level = currentFloor ? (currentFloor.level || 0) : 0;
  createFloorForLevel(level, presetType || 'foh');
}

function removeFloor(floorId) {
  if (state.floors.length <= 1) return;
  const floor = state.floors.find(f => f.id === floorId);
  if (!floor) return;
  if (!confirm(`Delete floor "${floor.name}"? All shelves and landmarks on this floor will be lost.`)) return;
  // If removing current floor, switch to another first
  if (floorId === state.currentFloorId) {
    const otherFloor = state.floors.find(f => f.id !== floorId);
    loadFloor(otherFloor.id);
  }
  state.floors = state.floors.filter(f => f.id !== floorId);
  renderFloorTabs();
  renderAll();
  state.dirty = true;
}

function renameFloor(floorId) {
  const floor = state.floors.find(f => f.id === floorId);
  if (!floor) return;
  const name = prompt('Rename floor:', floor.name);
  if (!name) return;
  floor.name = name;
  renderFloorTabs();
  state.dirty = true;
}

function renderFloorTabs() { renderLevelPanel(); }

function renderLevelPanel() {
  const panel = document.getElementById('levelPanel');
  if (!panel) return;
  panel.innerHTML = '';
  
  // Sync current floor so counts are accurate
  syncCurrentFloor();
  
  // Collect levels
  const levels = {};
  state.floors.forEach(f => {
    const lvl = f.level || 0;
    if (!levels[lvl]) levels[lvl] = { foh: null, boh: null };
    if (f.type === 'boh') levels[lvl].boh = f;
    else levels[lvl].foh = f;
  });
  
  const levelKeys = Object.keys(levels).map(Number).sort((a, b) => b - a); // highest first
  const levelNames = (lvl) => { if (lvl < 0) return 'B' + Math.abs(lvl); if (lvl === 0) return 'G'; return lvl + 'F'; };
  
  levelKeys.forEach(lvl => {
    const block = document.createElement('div');
    block.className = 'level-block';
    
    const label = document.createElement('div');
    label.className = 'level-label';
    label.textContent = levelNames(lvl);
    block.appendChild(label);
    
    // FOH button
    const fohFloor = levels[lvl].foh;
    const fohBtn = document.createElement('button');
    fohBtn.className = 'level-btn foh' + (fohFloor && fohFloor.id === state.currentFloorId ? ' active' : '') + (!fohFloor ? ' empty' : '');
    const fohCount = fohFloor && fohFloor.data ? (fohFloor.data.shelves||[]).length + (fohFloor.data.landmarks||[]).length + (fohFloor.data.walls||[]).length + (fohFloor.data.toryLines||[]).length + (fohFloor.data.emergencyMarkers||[]).length : 0;
    fohBtn.innerHTML = '<span class="level-btn-dot"></span>FOH' + (fohFloor && fohCount ? '<span style="opacity:0.5;font-size:7px;margin-left:2px">' + fohCount + '</span>' : '');
    fohBtn.title = fohFloor ? (fohFloor.name + ' (' + fohCount + ' items) — click to switch, right-click settings') : 'Click to create FOH floor';
    fohBtn.onclick = () => {
      if (fohFloor) switchFloor(fohFloor.id);
      else createFloorForLevel(lvl, 'foh');
    };
    if (fohFloor) {
      fohBtn.oncontextmenu = (e) => { e.preventDefault(); showFloorSettings(fohFloor.id, e); };
    }
    block.appendChild(fohBtn);
    
    // BOH button
    const bohFloor = levels[lvl].boh;
    const bohBtn = document.createElement('button');
    bohBtn.className = 'level-btn boh' + (bohFloor && bohFloor.id === state.currentFloorId ? ' active' : '') + (!bohFloor ? ' empty' : '');
    const bohCount = bohFloor && bohFloor.data ? (bohFloor.data.shelves||[]).length + (bohFloor.data.landmarks||[]).length + (bohFloor.data.walls||[]).length + (bohFloor.data.toryLines||[]).length + (bohFloor.data.emergencyMarkers||[]).length : 0;
    bohBtn.innerHTML = '<span class="level-btn-dot"></span>BOH' + (bohFloor && bohCount ? '<span style="opacity:0.5;font-size:7px;margin-left:2px">' + bohCount + '</span>' : '');
    bohBtn.title = bohFloor ? (bohFloor.name + ' (' + bohCount + ' items) — click to switch, right-click settings') : 'Click to create BOH floor';
    bohBtn.onclick = () => {
      if (bohFloor) switchFloor(bohFloor.id);
      else createFloorForLevel(lvl, 'boh');
    };
    if (bohFloor) {
      bohBtn.oncontextmenu = (e) => { e.preventDefault(); showFloorSettings(bohFloor.id, e); };
    }
    block.appendChild(bohBtn);
    
    // Remove level (only if both floors are empty or level has >1 level)
    if (levelKeys.length > 1) {
      const rem = document.createElement('div');
      rem.className = 'level-remove';
      rem.textContent = '\u2715 remove';
      rem.title = 'Remove this level';
      rem.onclick = () => removeLevel(lvl);
      block.appendChild(rem);
    }
    
    panel.appendChild(block);
  });
  
  renderGhostPreview();
}

function createFloorForLevel(level, type) {
  // Check if this level already has a floor of this type
  const existing = state.floors.find(f => (f.level || 0) === level && f.type === type);
  if (existing) {
    alert('Level ' + level + ' already has a ' + type.toUpperCase() + ' floor ("' + existing.name + '"). Switch to it instead.');
    switchFloor(existing.id);
    return;
  }
  const defaultNames = { foh: { '-2': 'B2 Floor', '-1': 'B1 Floor', '0': 'Ground', '1': '1st Floor', '2': '2nd Floor', '3': '3rd Floor' }, boh: { '-2': 'B2 Stockroom', '-1': 'B1 Stockroom', '0': 'Stockroom', '1': '1F Stockroom', '2': '2F Stockroom', '3': '3F Stockroom' } };
  const name = prompt('Floor name:', (defaultNames[type] || {})[level] || (type === 'boh' ? 'Stockroom' : 'Floor'));
  if (!name) return;
  syncCurrentFloor();
  const id = 'floor_' + Date.now();
  state.floors.push({ id, name, type, level });
  loadFloor(id);
  renderLevelPanel();
  renderAll();
  state.dirty = true;
}

function addLevel() {
  const existingLevels = [...new Set(state.floors.map(f => f.level || 0))].sort();
  const nextLevel = existingLevels.length ? Math.max(...existingLevels) + 1 : 0;
  const input = prompt('New level number:', String(nextLevel));
  if (input === null) return;
  const level = parseInt(input) || 0;
  if (existingLevels.includes(level)) { alert('Level ' + level + ' already exists.'); return; }
  // Create FOH floor for the new level by default
  createFloorForLevel(level, 'foh');
}

function removeLevel(level) {
  const floorsOnLevel = state.floors.filter(f => (f.level || 0) === level);
  const hasContent = floorsOnLevel.some(f => {
    const fd = f.data || {};
    return (fd.shelves || []).length || (fd.landmarks || []).length || (fd.walls || []).length;
  });
  const msg = hasContent ? 'Level has content! Delete all floors on this level?' : 'Remove this level and its floors?';
  if (!confirm(msg)) return;
  const removingCurrent = floorsOnLevel.some(f => f.id === state.currentFloorId);
  state.floors = state.floors.filter(f => (f.level || 0) !== level);
  if (state.floors.length === 0) {
    state.floors = [{ id: 'ground', name: 'Ground', type: 'foh', level: 0 }];
  }
  if (removingCurrent) {
    loadFloor(state.floors[0].id);
  }
  renderLevelPanel();
  renderAll();
  state.dirty = true;
}

function showFloorSettings(floorId, e) {
  const floor = state.floors.find(f => f.id === floorId);
  if (!floor) return;
  document.querySelectorAll('.floor-settings-popup').forEach(el => el.remove());
  const popup = document.createElement('div');
  popup.className = 'floor-settings-popup';
  popup.style.left = e.clientX + 'px';
  popup.style.top = e.clientY + 'px';
  popup.innerHTML = `
    <div class="fsp-row"><span class="fsp-label">Name</span><input class="fsp-input" value="${floor.name}" id="fspName"></div>
    <div class="fsp-row"><span class="fsp-label">Type</span>
      <select class="fsp-select" id="fspType">
        <option value="foh"${floor.type !== 'boh' ? ' selected' : ''}>FOH (Front of House)</option>
        <option value="boh"${floor.type === 'boh' ? ' selected' : ''}>BOH (Back of House)</option>
      </select>
    </div>
    <div class="fsp-row"><span class="fsp-label">Level</span><input type="number" class="fsp-input" value="${floor.level || 0}" id="fspLevel" style="width:60px" min="-5" max="10"></div>
    <div class="fsp-actions">
      <button class="fsp-btn fsp-save" data-onclick="applyFloorSettings" data-floor="${floorId}">Apply</button>
      <button class="fsp-btn" data-onclick="closeFloorSettings">Cancel</button>
    </div>`;
  document.body.appendChild(popup);
  document.getElementById('fspName').focus();
  setTimeout(() => {
    const closer = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', closer); } };
    document.addEventListener('mousedown', closer);
  }, 50);
}

function applyFloorSettings(floorId) {
  const floor = state.floors.find(f => f.id === floorId);
  if (!floor) return;
  floor.name = document.getElementById('fspName').value || floor.name;
  floor.type = document.getElementById('fspType').value;
  floor.level = parseInt(document.getElementById('fspLevel').value) || 0;
  document.querySelectorAll('.floor-settings-popup').forEach(el => el.remove());
  renderFloorTabs();
  state.dirty = true;
}

// ═══════════════════════════════════════════════════════════
// GHOST PREVIEW — show faint outline of other floors on same level
// ═══════════════════════════════════════════════════════════

var ghostVisible = true;
var ghostLevel = 'same'; // 'same', 'all', or a specific level number string

function renderGhostPreview() {
  const ghostGroup = document.getElementById('ghostGroup');
  if (!ghostGroup) return;
  ghostGroup.innerHTML = '';
  if (!ghostVisible || state.floors.length <= 1) return;
  const currentFloor = state.floors.find(f => f.id === state.currentFloorId);
  if (!currentFloor) return;
  const currentLevel = currentFloor.level || 0;
  
  state.floors.forEach(floor => {
    if (floor.id === state.currentFloorId) return;
    const floorLevel = floor.level || 0;
    
    // Determine if this floor should show as ghost
    let show = false;
    let isSameLevel = floorLevel === currentLevel;
    const isFull = ghostLevel === 'full';   // v0.324: BOH+FOH together, no ghosting
    if (ghostLevel === 'same' || isFull) show = isSameLevel;
    else if (ghostLevel === 'all') show = true;
    else show = floorLevel === parseInt(ghostLevel);
    
    if (!show) return;
    
    const fd = floor.data || {};
    const strokeBase = floor.type === 'boh' ? '#ff4060' : '#4ade80';
    const dashArray = isSameLevel ? '4 3' : '8 5';
    
    const gWrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gWrap.setAttribute('opacity', isFull ? 1 : (isSameLevel ? 0.5 : 0.3));

    // v0.324: FULL mode — render the paired segment realistically (true colours,
    // solid walls/windows, landmark tint) so the whole store reads as one map.
    // Still lives in #ghostGroup (pointer-events:none) so it can't be edited or
    // intercept clicks — the current floor stays the only editable one.
    if (isFull) {
      (fd.walls || []).forEach(w => {
        const isWin = w.kind === 'window';
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', w.x); rect.setAttribute('y', w.y);
        rect.setAttribute('width', w.w); rect.setAttribute('height', w.h);
        rect.setAttribute('fill', isWin ? '#cfe8fa' : '#1a1b1e');
        rect.setAttribute('stroke', isWin ? '#7ab8dd' : '#000');
        rect.setAttribute('stroke-width', 1.5);
        if (w.angle) { const cx = w.x + w.w / 2, cy = w.y + w.h / 2; rect.setAttribute('transform', 'rotate(' + w.angle + ' ' + cx + ' ' + cy + ')'); }
        gWrap.appendChild(rect);
        if (isWin) {
          const hz = w.w >= w.h, cgx = w.x + w.w / 2, cgy = w.y + w.h / 2;
          const gl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          gl.setAttribute('x1', hz ? w.x + 2 : cgx); gl.setAttribute('y1', hz ? cgy : w.y + 2);
          gl.setAttribute('x2', hz ? w.x + w.w - 2 : cgx); gl.setAttribute('y2', hz ? cgy : w.y + w.h - 2);
          gl.setAttribute('stroke', '#ffffff'); gl.setAttribute('stroke-width', 1.2);
          if (w.angle) gl.setAttribute('transform', 'rotate(' + w.angle + ' ' + cgx + ' ' + cgy + ')');
          gWrap.appendChild(gl);
        }
      });
      (fd.landmarks || []).forEach(z => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', z.x); rect.setAttribute('y', z.y);
        rect.setAttribute('width', z.w); rect.setAttribute('height', z.h);
        rect.setAttribute('rx', 3);
        rect.setAttribute('fill', 'rgba(26,27,30,0.6)'); rect.setAttribute('stroke', '#888');
        rect.setAttribute('stroke-width', 0.5);
        if (z.angle) { const cx = z.x + z.w / 2, cy = z.y + z.h / 2; rect.setAttribute('transform', 'rotate(' + z.angle + ' ' + cx + ' ' + cy + ')'); }
        gWrap.appendChild(rect);
      });
      (fd.shelves || []).forEach(s => {
        const color = getColor(s);
        if (s.type === 'sixway') {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', s.x); c.setAttribute('cy', s.y);
          c.setAttribute('r', s.radius || 20);
          c.setAttribute('fill', color); c.setAttribute('fill-opacity', '0.55');
          c.setAttribute('stroke', color); c.setAttribute('stroke-width', 1.5);
          gWrap.appendChild(c);
          return;
        }
        const d = getDims(s);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', s.x); rect.setAttribute('y', s.y);
        rect.setAttribute('width', d.w); rect.setAttribute('height', d.h);
        rect.setAttribute('rx', 2);
        rect.setAttribute('fill', color); rect.setAttribute('fill-opacity', '0.55');
        rect.setAttribute('stroke', color); rect.setAttribute('stroke-width', 1.5);
        const angle = (typeof getAngle === 'function' ? getAngle(s) : 0) || s.angle || 0;
        if (angle) { const cx = s.x + d.w / 2, cy = s.y + d.h / 2; rect.setAttribute('transform', 'rotate(' + angle + ',' + cx + ',' + cy + ')'); }
        gWrap.appendChild(rect);
      });
      if ((fd.boundary || []).length >= 3) {
        const pts = fd.boundary.map(p => p.x + ',' + p.y).join(' ');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', pts); poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#1a1a2e'); poly.setAttribute('stroke-width', 3);
        poly.setAttribute('stroke-linejoin', 'round');
        gWrap.appendChild(poly);
      }
      // Small segment tag so it's clear which part is the non-editable one
      if ((fd.shelves || []).length > 0) {
        const allX = fd.shelves.map(s => s.x), allY = fd.shelves.map(s => s.y);
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', Math.min(...allX)); t.setAttribute('y', Math.min(...allY) - 8);
        t.setAttribute('font-size', '9'); t.setAttribute('fill', strokeBase);
        t.setAttribute('font-family', 'JetBrains Mono, monospace'); t.setAttribute('opacity', '0.85');
        t.textContent = floor.name + ' (view only)';
        gWrap.appendChild(t);
      }
      ghostGroup.appendChild(gWrap);
      return;
    }
    
    // Draw ghost shelves
    (fd.shelves || []).forEach(s => {
      const d = getDims(s);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', s.x); rect.setAttribute('y', s.y);
      rect.setAttribute('width', d.w); rect.setAttribute('height', d.h);
      rect.setAttribute('fill', strokeBase); rect.setAttribute('fill-opacity', '0.1');
      rect.setAttribute('stroke', strokeBase);
      rect.setAttribute('stroke-width', 2); rect.setAttribute('stroke-dasharray', dashArray);
      if (s.angle) { const cx = s.x + d.w/2, cy = s.y + d.h/2; rect.setAttribute('transform', `rotate(${s.angle},${cx},${cy})`); }
      gWrap.appendChild(rect);
    });
    // Draw ghost landmarks
    (fd.landmarks || []).forEach(z => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', z.x); rect.setAttribute('y', z.y);
      rect.setAttribute('width', z.w); rect.setAttribute('height', z.h);
      rect.setAttribute('fill', '#aaa'); rect.setAttribute('fill-opacity', '0.1');
      rect.setAttribute('stroke', '#aaa');
      rect.setAttribute('stroke-width', 1.5); rect.setAttribute('stroke-dasharray', dashArray);
      // v0.197: Apply rotation so diagonal landmarks render correctly in ghost mode
      if (z.angle) {
        const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
        rect.setAttribute('transform', 'rotate(' + z.angle + ' ' + cx + ' ' + cy + ')');
      }
      gWrap.appendChild(rect);
    });
    // Draw ghost walls
    (fd.walls || []).forEach(w => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', w.x); rect.setAttribute('y', w.y);
      rect.setAttribute('width', w.w); rect.setAttribute('height', w.h);
      rect.setAttribute('fill', '#666'); rect.setAttribute('fill-opacity', '0.15');
      rect.setAttribute('stroke', '#888');
      rect.setAttribute('stroke-width', 2); rect.setAttribute('stroke-dasharray', dashArray);
      if (w.angle) {
        const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
        rect.setAttribute('transform', 'rotate(' + w.angle + ' ' + cx + ' ' + cy + ')');
      }
      gWrap.appendChild(rect);
    });
    // Draw ghost boundary
    if ((fd.boundary || []).length >= 3) {
      const pts = fd.boundary.map(p => p.x + ',' + p.y).join(' ');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pts); poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', '#555'); poly.setAttribute('stroke-width', 1);
      poly.setAttribute('stroke-dasharray', '6 3');
      gWrap.appendChild(poly);
    }
    // Label for cross-level ghosts
    if (!isSameLevel && (fd.shelves || []).length > 0) {
      const allX = fd.shelves.map(s => s.x);
      const allY = fd.shelves.map(s => s.y);
      const minX = Math.min(...allX), minY = Math.min(...allY);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', minX); t.setAttribute('y', minY - 8);
      t.setAttribute('font-size', '8'); t.setAttribute('fill', strokeBase);
      t.setAttribute('font-family', 'JetBrains Mono, monospace'); t.setAttribute('opacity', '0.6');
      t.textContent = floor.name + ' (L' + floorLevel + ')';
      gWrap.appendChild(t);
    }
    
    ghostGroup.appendChild(gWrap);
  });
}

function toggleGhostPreview() {
  ghostVisible = !ghostVisible;
  const btn = document.getElementById('ghostToggleBtn');
  if (btn) btn.classList.toggle('active', ghostVisible);
  renderGhostPreview();
}

function cycleGhostLevel() {
  const levels = [...new Set(state.floors.map(f => f.level || 0))].sort();
  if (levels.length <= 1) {
    // One level — cycle: Ghost (same) → Full → off → Ghost
    if (!ghostVisible) { ghostVisible = true; ghostLevel = 'same'; }
    else if (ghostLevel !== 'full') { ghostLevel = 'full'; }
    else { ghostVisible = false; ghostLevel = 'same'; }
  } else {
    // Cycle: same → full → all → level0 → level1 → ... → same
    const cycle = ['same', 'full', 'all', ...levels.map(String)];
    const idx = cycle.indexOf(ghostLevel);
    ghostLevel = cycle[(idx + 1) % cycle.length];
    ghostVisible = true;
  }
  updateGhostButtonLabel();
  renderGhostPreview();
}

function updateGhostButtonLabel() {
  const btn = document.getElementById('ghostToggleBtn');
  if (!btn) return;
  btn.classList.toggle('active', ghostVisible);
  if (!ghostVisible) { btn.textContent = 'Ghost'; return; }
  if (ghostLevel === 'full') { btn.textContent = 'Ghost: Full'; return; }
  const levels = [...new Set(state.floors.map(f => f.level || 0))];
  if (levels.length <= 1) { btn.textContent = 'Ghost'; return; }
  const names = { same: 'Ghost: Same', all: 'Ghost: All' };
  btn.textContent = names[ghostLevel] || ('Ghost: L' + ghostLevel);
}

// ═══════════════════════════════════════════════════════════
// MOVE TO FLOOR — move selected items to another floor
// ═══════════════════════════════════════════════════════════

function moveSelectedToFloor(targetFloorId) {
  if (targetFloorId === state.currentFloorId) return;
  const targetFloor = state.floors.find(f => f.id === targetFloorId);
  if (!targetFloor) return;
  if (!targetFloor.data) targetFloor.data = {};

  saveState();
  let moved = 0;

  // Move selected shelves
  if (state.selectedIds.length) {
    if (!targetFloor.data.shelves) targetFloor.data.shelves = [];
    state.selectedIds.forEach(id => {
      const idx = state.shelves.findIndex(s => s.id === id);
      if (idx >= 0) { targetFloor.data.shelves.push(state.shelves.splice(idx, 1)[0]); moved++; }
    });
    state.selectedIds = [];
  }

  // Move selected landmarks
  const lmIds = state.selectedLandmarkIds.length ? [...state.selectedLandmarkIds] : (state.selectedLandmarkId ? [state.selectedLandmarkId] : []);
  if (lmIds.length) {
    if (!targetFloor.data.landmarks) targetFloor.data.landmarks = [];
    lmIds.forEach(id => {
      const idx = state.landmarks.findIndex(z => z.id === id);
      if (idx >= 0) { targetFloor.data.landmarks.push(state.landmarks.splice(idx, 1)[0]); moved++; }
    });
    state.selectedLandmarkId = null; state.selectedLandmarkIds = [];
  }

  // Move selected walls
  const wallIds = state.selectedWallIds.length ? [...state.selectedWallIds] : (state.selectedWallId ? [state.selectedWallId] : []);
  if (wallIds.length) {
    if (!targetFloor.data.walls) targetFloor.data.walls = [];
    wallIds.forEach(id => {
      const idx = state.walls.findIndex(w => w.id === id);
      if (idx >= 0) { targetFloor.data.walls.push(state.walls.splice(idx, 1)[0]); moved++; }
    });
    state.selectedWallId = null; state.selectedWallIds = [];
  }

  // Move selected tory lines
  if (state.selectedToryLineId) {
    if (!targetFloor.data.toryLines) targetFloor.data.toryLines = [];
    const idx = state.toryLines.findIndex(t => t.id === state.selectedToryLineId);
    if (idx >= 0) { targetFloor.data.toryLines.push(state.toryLines.splice(idx, 1)[0]); moved++; }
    state.selectedToryLineId = null;
  }

  // Move selected emergency markers
  if (state.selectedEmergencyId) {
    if (!targetFloor.data.emergencyMarkers) targetFloor.data.emergencyMarkers = [];
    const idx = state.emergencyMarkers.findIndex(m => m.id === state.selectedEmergencyId);
    if (idx >= 0) { targetFloor.data.emergencyMarkers.push(state.emergencyMarkers.splice(idx, 1)[0]); moved++; }
    state.selectedEmergencyId = null; state.selectedPriceCheckId = null;
  }

  if (moved > 0) {
    renderAll();
    state.dirty = true;
    console.log(`Moved ${moved} item(s) to floor "${targetFloor.name}"`);
  }
}

function showMoveToFloorMenu(clientX, clientY) {
  const otherFloors = state.floors.filter(f => f.id !== state.currentFloorId);
  if (!otherFloors.length) return;
  // Remove existing
  document.querySelectorAll('.move-floor-menu').forEach(el => el.remove());
  const menu = document.createElement('div');
  menu.className = 'move-floor-menu';
  menu.style.left = clientX + 'px';
  menu.style.top = clientY + 'px';
  menu.innerHTML = '<div class="mfm-title">Move to floor:</div>';
  otherFloors.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'mfm-item';
    const dot = document.createElement('span');
    dot.className = 'floor-type-dot ' + (f.type || 'foh');
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(f.name));
    btn.onclick = () => { moveSelectedToFloor(f.id); menu.remove(); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  setTimeout(() => {
    const closer = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', closer); } };
    document.addEventListener('mousedown', closer);
  }, 50);
}

// ═══════════════════════════════════════════════════════════
// LIVE PREVIEW — full viewer in an iframe
// ═══════════════════════════════════════════════════════════

var previewOpen = false;

function togglePreview() {
  previewOpen = !previewOpen;
  const panel = document.getElementById('previewPanel');
  const canvas = document.querySelector('.canvas-area');
  if (previewOpen) {
    panel.classList.add('open');
    if (canvas) canvas.classList.add('preview-open');
    refreshPreview();
  } else {
    panel.classList.remove('open');
    if (canvas) canvas.classList.remove('preview-open');
  }
}

// What staff will see: the map drawn by Conduit's own renderer (the code
// that publishes it), in a shadow root that carries Conduit's map styles.
function refreshPreview() {
  var host = document.getElementById('previewFrame');
  if (!host) return;
  if (!window.ConduitBridge) { host.textContent = 'The preview needs the Conduit connection (editor/conduit.js).'; return; }
  window.ConduitBridge.preview(buildMapDocument(), host, state.currentFloorId);
}

// ═══════════════════════════════════════════════════════════
// FIELD MODE MERGE — overlay on-site captures (name/code/comment)
// onto the current map BY SHELF ID. Non-destructive: geometry,
// nodes, portals and every other field are left untouched. Merge
// into the same store you pre-mapped (ids must match) — don't
// re-import the JSON first, as that regenerates shelf ids.
// ═══════════════════════════════════════════════════════════
function mergeFieldCaptures(ev) {
  var file = ev.target.files && ev.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var payload;
    try { payload = JSON.parse(reader.result); }
    catch (e) { alert('That file isn\'t valid JSON.'); ev.target.value = ''; return; }
    if (payload && payload.kind === 'field-capture' && payload.captures) return mergeConduitCaptures(payload, ev);
    if (!payload || payload.kind !== 'shelfsearcher-field-capture' || !payload.captures) {
      alert('This isn\'t a Field Mode capture file.'); ev.target.value = ''; return;
    }
    var caps = payload.captures;
    var ids = Object.keys(caps);
    if (!ids.length) { alert('No captures in that file.'); ev.target.value = ''; return; }
    if (payload.storeNumber && activeStoreId && String(payload.storeNumber) !== String(activeStoreId)) {
      if (!confirm('This capture is for store ' + payload.storeNumber + ', but ' + activeStoreId +
        ' is open.\n\nMerge anyway?')) { ev.target.value = ''; return; }
    }
    if (typeof syncCurrentFloor === 'function') syncCurrentFloor();
    var applied = 0, named = 0, coded = 0, noted = 0, found = {};
    (state.floors || []).forEach(function (f) {
      var shelves = (f.data && f.data.shelves) || [];
      shelves.forEach(function (s) {
        if (s.id && caps[s.id]) {
          var c = caps[s.id];
          if (c.name) { s.name = c.name; named++; }
          if (c.code) { s.subname = c.code; coded++; }
          if (c.comment) { s.note = c.comment; noted++; }
          found[s.id] = 1; applied++;
        }
      });
    });
    var skipped = 0;
    ids.forEach(function (id) { if (!found[id]) skipped++; });
    if (typeof loadFloor === 'function' && state.currentFloorId) loadFloor(state.currentFloorId);
    if (typeof renderAll === 'function') renderAll();
    if (typeof markDirty === 'function') markDirty();
    ev.target.value = '';
    alert('Field merge complete.\n\n' +
      'Shelves updated: ' + applied + '\n' +
      '  names: ' + named + ', codes: ' + coded + ', comments: ' + noted +
      (skipped ? '\nSkipped: ' + skipped + ' (shelf id not found — deleted, or a different map)' : ''));
  };
  reader.onerror = function () { alert('Couldn\'t read that file.'); ev.target.value = ''; };
  reader.readAsText(file);
}

// Conduit's Field Mode file: captures keyed by the shelf they were taken on
// ("A16 S2", with its floor), each with the label as read and a comment.
// The label renames the shelf when it differs from the map ("A16S02" on a
// shelf drawn as A16 S1); the comment becomes the shelf's note. Captures that
// match no shelf are listed, not dropped.
function mergeConduitCaptures(payload, ev) {
  var canon = function (c) { return String(c || '').toUpperCase().replace(/[\s\-_.]+/g, '').replace(/([A-Z])0+(?=\d)/g, '$1'); };
  var CODE = /^([A-Z]{1,3}\d{1,4})([SEP]\d{1,2})?$/;
  if (payload.storeNumber && activeStoreId && String(payload.storeNumber) !== String(activeStoreId) &&
      !confirm('This capture is for store ' + payload.storeNumber + ', but ' + activeStoreId + ' is open.\n\nMerge anyway?')) { ev.target.value = ''; return; }
  if (typeof syncCurrentFloor === 'function') syncCurrentFloor();
  if (typeof saveState === 'function') saveState();
  var renamed = 0, noted = 0, unmatched = [];
  Object.keys(payload.captures).forEach(function (key) {
    var c = payload.captures[key], want = canon(key), hits = [];
    (state.floors || []).forEach(function (f) {
      if (c.floor && f.id !== c.floor) return;
      ((f.data && f.data.shelves) || []).forEach(function (s) { if (canon((s.name || '') + (s.subname || '')) === want) hits.push(s); });
    });
    if (!hits.length) { unmatched.push(key); return; }
    hits.forEach(function (s) {
      var m = c.differs && c.code ? CODE.exec(canon(c.code)) : null;
      if (m) { s.name = m[1]; s.subname = m[2] || ''; renamed++; }
      else if (c.differs && c.code) { s.note = ((s.note ? s.note + ' · ' : '') + 'Label reads ' + c.code).slice(0, 300); noted++; }
      if (c.comment) { s.note = ((s.note && s.note.indexOf(c.comment) < 0 ? s.note + ' · ' : '') + c.comment).slice(0, 300); noted++; }
    });
  });
  if (typeof loadFloor === 'function' && state.currentFloorId) loadFloor(state.currentFloorId);
  if (typeof renderAll === 'function') renderAll();
  if (typeof markDirty === 'function') markDirty();
  ev.target.value = '';
  alert('Field captures merged.\n\nRenamed from their labels: ' + renamed + '\nNotes added: ' + noted +
    (unmatched.length ? '\n\nNo shelf on this map for ' + unmatched.length + ': ' + unmatched.slice(0, 12).join(', ') + (unmatched.length > 12 ? '…' : '') : ''));
}

function initStoreSystem() {
  // Preview panel HTML
  if (!document.getElementById('previewPanel')) {
    const panel = document.createElement('div');
    panel.id = 'previewPanel';
    panel.innerHTML = `<div class="preview-header"><span class="preview-header-title">Conduit preview</span><div style="display:flex;gap:4px;align-items:center"><button class="preview-refresh" data-onclick="refreshPreview">Refresh</button><button class="preview-close" data-onclick="closePreview">\u2715</button></div></div><div id="previewFrame"></div>`;
    document.body.appendChild(panel);
  }

  const lastStore = localStorage.getItem(LAST_STORE_KEY);
  // v0.306: also load if there's a saved draft under this store key, even when the
  // store number isn't in the registry. Autosave writes a draft under whatever store
  // number is active (e.g. an imported file's storeNumber), so gating the reload on
  // findStore() alone orphaned those drafts — they saved fine but never loaded back.
  if (lastStore && (findStore(lastStore) || localStorage.getItem(storeKey(lastStore)))) {
    switchStore(lastStore);
  } else {
    // No last store — open dropdown automatically
    document.getElementById('activeStoreNum').textContent = '—';
    document.getElementById('activeStoreName').textContent = 'Select a store...';
    renderFloorTabs();
    setTimeout(() => toggleStoreDropdown(), 300);
  }
}
// ═══════════════════════════════════════════════════════════
// SHELF TEMPLATES
// ═══════════════════════════════════════════════════════════
function getTemplates() {
  try { return JSON.parse(localStorage.getItem('mapeditor-templates') || '[]'); } catch(e) { return []; }
}
function saveTemplates(tpls) {
  try { localStorage.setItem('mapeditor-templates', JSON.stringify(tpls)); } catch(e) {}
}
function refreshTemplateDropdown() {
  const sel = document.getElementById('templateSelect');
  if (!sel) return;
  const tpls = getTemplates();
  sel.innerHTML = '<option value="">— select —</option>';
  tpls.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = t.label;
    sel.appendChild(opt);
  });
}
function saveAsTemplate() {
  if (!state.selectedIds.length) return;
  const shelf = state.shelves.find(s => s.id === state.selectedIds[0]);
  if (!shelf) return;
  const label = prompt('Template name:', (shelf.dept || 'shelf').toUpperCase() + ' ' + (shelf.modules||3) + '-bay ' + (shelf.orientation||'H'));
  if (!label) return;
  const tpl = {
    label: label,
    dept: shelf.dept, type: shelf.type || undefined, orientation: shelf.orientation || 'H',
    modules: shelf.modules || 3, bayW: shelf.bayW || null, depth: shelf.depth || null,
    customW: shelf.customW || undefined, customH: shelf.customH || undefined,
    radius: shelf.radius || undefined
  };
  const tpls = getTemplates();
  tpls.push(tpl);
  saveTemplates(tpls);
  refreshTemplateDropdown();
}
function applyTemplate(idx) {
  if (idx === '' || !state.selectedIds.length) return;
  const tpls = getTemplates();
  const tpl = tpls[+idx];
  if (!tpl) return;
  saveState();
  state.selectedIds.forEach(id => {
    const s = state.shelves.find(sh => sh.id === id);
    if (!s) return;
    s.dept = tpl.dept || s.dept;
    if (tpl.type) s.type = tpl.type;
    if (tpl.orientation) s.orientation = tpl.orientation;
    if (tpl.modules) s.modules = tpl.modules;
    if (tpl.bayW) s.bayW = tpl.bayW;
    if (tpl.depth) s.depth = tpl.depth;
    if (tpl.customW) s.customW = tpl.customW;
    if (tpl.customH) s.customH = tpl.customH;
    if (tpl.radius) s.radius = tpl.radius;
  });
  renderAll();
  document.getElementById('templateSelect').value = '';
}
function deleteTemplate() {
  const sel = document.getElementById('templateSelect');
  if (!sel || sel.value === '') return;
  const tpls = getTemplates();
  const idx = +sel.value;
  if (!confirm('Delete template "' + tpls[idx].label + '"?')) return;
  tpls.splice(idx, 1);
  saveTemplates(tpls);
  refreshTemplateDropdown();
}
// Init templates on load
refreshTemplateDropdown();


// ── Tory Bot dock: standout pink square + power icon (renders in editor;
//    exported into the map SVG so it shows in the viewer). ──
function renderToryDocks() {
  if (!toryDocksGroup) return;
  toryDocksGroup.innerHTML = '';
  (state.toryDocks || []).forEach(td => {
    const isSelected = state.selectedToryDockId === td.id;
    const sz = 34 / state.zoom;
    const half = sz / 2;
    const r = sz * 0.42;
    const PINK = '#ec4899';
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('torydock-group');
    if (isSelected) g.classList.add('selected');
    g.dataset.toryDockId = td.id;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('torydock-bg');
    rect.setAttribute('x', td.x - half);
    rect.setAttribute('y', td.y - half);
    rect.setAttribute('width', sz);
    rect.setAttribute('height', sz);
    rect.setAttribute('rx', 4 / state.zoom);
    rect.setAttribute('fill', '#2a0a1e');
    rect.setAttribute('stroke', isSelected ? '#fff' : PINK);
    rect.setAttribute('stroke-width', (isSelected ? 3 : 2.4) / state.zoom);
    g.appendChild(rect);

    const scale = (2 * r) / 24;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    icon.classList.add('tory-dock-icon');
    icon.setAttribute('transform', 'translate(' + (td.x - r) + ' ' + (td.y - r) + ') scale(' + scale + ')');
    icon.setAttribute('stroke', PINK);
    icon.setAttribute('stroke-width', 2.4 / scale / state.zoom);
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('fill', 'none');
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', 'M7 6a7.75 7.75 0 1 0 10 0');
    icon.appendChild(arc);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', 12); ln.setAttribute('y1', 4); ln.setAttribute('x2', 12); ln.setAttribute('y2', 12);
    icon.appendChild(ln);
    g.appendChild(icon);

    if (td.label) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.classList.add('torydock-label');
      label.setAttribute('x', td.x);
      label.setAttribute('y', td.y + half + Math.max(6, 8 / state.zoom) + 2 / state.zoom);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', Math.max(6, 8 / state.zoom));
      label.setAttribute('fill', PINK);
      label.setAttribute('font-weight', '700');
      label.setAttribute('font-family', 'monospace');
      label.textContent = td.label;
      g.appendChild(label);
    }
    toryDocksGroup.appendChild(g);
  });
}
