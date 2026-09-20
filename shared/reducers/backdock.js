// Back dock reducers: trucks, pallets, halts, manifests, planner. Shapes
// follow Decant Visualiser's worker docs (backdock-receiving, -manifests,
// -planner, -history), ported faithfully.
//
//   dock.trucks   id ('YYYY-MM-DD-Tn') → { status: staged|live|closed, createdAt, landedAt, goalAt,
//                 grid, team: [{ pid, name, dnum }], halts: [{ reason, start, end }],
//                 manifest: { manNo, dcNo, despatch, consols: [...] } | null,
//                 pallets: ref → pallet }
//   pallet        { ref, ptype: chep|loscam|bulk, cartons, expectedMins, expectedBasis, note,
//                 status: landed|assigned|active|paused|done, assignedTo, segments: [{ pid, start, end }],
//                 consolIds: [], scanIds: [], excluded, carryover, landedAt, doneAt }
//   dock.history  closed trucks, newest last, capped (the D1 archive takes the rest)
//   dock.manifests manNo → index entry (20 most recent)
//   plan.days     date → slots: 1..4 → { eta, note, team, manifest }
//
// pallet.scan is the server-side half of the legacy client ingest: match the
// 9-digit id against the truck's manifest, refuse a consol already on another
// pallet, reject an off-manifest scan (the device then chooses Add & flag
// through pallet.update, or ignores it).

import { reject } from './util.js';

export const PTYPES = ['chep', 'loscam', 'bulk'];
export const PALLET_STATUS = ['landed', 'assigned', 'active', 'paused', 'done'];
export const HALT_REASONS = ['hcage', 'nostock', 'equip', 'safety', 'waiting', 'other'];
export const STD_MINS_PER_CARTON = 0.5;
const HISTORY_CAP = 500;
const MANIFEST_INDEX_CAP = 20;
const BAY_RE = /^[A-Z]\d{1,2}$/;
const TRUCK_RE = /^\d{4}-\d{2}-\d{2}-T\d+$/;

export function backdockState() {
  return {
    dock: { trucks: {}, history: [], manifests: {}, grid: { rows: 4, cols: 7, rowLabels: 'ABCD' } },
    plan: { days: {} },
  };
}

export const backdockReducers = {
  // ── Trucks ───────────────────────────────────────────────────────────
  'truck.create'(s, e) {
    const id = e.entity.truck;
    if (!TRUCK_RE.test(id)) return reject('invalid_event', 'truck id must be YYYY-MM-DD-Tn');
    if (s.dock.trucks[id]) return reject('truck_exists', `${id} already exists`);
    const t = { status: 'staged', createdAt: e.at, landedAt: e.payload.landedAt || null, goalAt: null, grid: { ...s.dock.grid }, team: [], halts: [], manifest: null, pallets: {} };
    // Creating from a planner slot consumes the slot's team and manifest.
    const date = id.slice(0, 10), slot = e.payload.slot ?? Number(id.slice(id.lastIndexOf('T') + 1));
    const day = s.plan.days[date];
    if (day && day.slots[slot]) { const sl = day.slots[slot]; t.team = sl.team || []; t.manifest = sl.manifest || null; delete day.slots[slot]; }
    s.dock.trucks[id] = t;
    return null;
  },
  'truck.setLive'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    t.status = 'live'; t.landedAt = t.landedAt || e.at;
    return null;
  },
  'truck.setGoal'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const g = e.payload.goal ?? null;
    if (g !== null && typeof g !== 'string') return reject('invalid_event', 'goal must be an ISO time or null');
    t.goalAt = g;
    return null;
  },
  'truck.team.set'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    t.team = e.payload.team.filter(m => m && m.pid).map(m => ({ pid: String(m.pid), name: m.name || '', dnum: m.dnum || null }));
    return null;
  },
  'truck.finalise'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const open = t.halts[t.halts.length - 1];
    if (open && !open.end) open.end = e.at;
    t.status = 'closed'; t.clearedAt = e.at;
    s.dock.history.push(historyRow(e.entity.truck, t));
    if (s.dock.history.length > HISTORY_CAP) s.dock.history.splice(0, s.dock.history.length - HISTORY_CAP);
    return null;
  },

  // ── Manifest ─────────────────────────────────────────────────────────
  // The library index: a published report (its document lives on the
  // worker, GET /manifest/:manNo) or one attached to a truck.
  'manifest.publish'(s, e) {
    const no = String(e.entity.manNo); if (!/^[\w-]{1,20}$/.test(no)) return reject('invalid_event', 'manifest number must be 1 to 20 letters, digits or dashes');
    const p = e.payload || {}, cur = s.dock.manifests[no];
    s.dock.manifests[no] = { manNo: no, dcNo: p.dcNo || '', despatch: p.despatch || '', truck: cur?.truck || null, totalCartons: Number(p.totalCartons) || 0, consols: Number(p.consols) || 0, keycodes: Number(p.keycodes) || 0, filename: String(p.filename || '').slice(0, 80), by: e.actor?.device || null, publishedAt: e.at };
    capManifests(s);
    return null;
  },
  'manifest.remove'(s, e) { delete s.dock.manifests[String(e.entity.manNo)]; return null; },
  // consols: [{ id (last 9 digits), cons (18–22 digits), cartons, dept, mix, desc, items }]
  'manifest.attach'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const p = e.payload;
    const consols = [];
    for (const c of p.consols) {
      if (!c || typeof c !== 'object') return reject('invalid_event', 'consols must be objects');
      const cons = String(c.cons ?? c.id ?? '');
      if (!/^\d{9,22}$/.test(cons)) return reject('invalid_event', 'consolidation numbers must be 9 to 22 digits');
      consols.push({ id: cons.slice(-9), cons, cartons: Number(c.cartons) || 0, dept: c.dept || '', mix: Array.isArray(c.mix) ? c.mix : [], desc: c.desc || '', items: Array.isArray(c.items) ? c.items.slice(0, 250) : [] });
    }
    t.manifest = { manNo: String(p.manNo), dcNo: p.dcNo || '', despatch: p.despatch || '', consols, attachedAt: e.at, by: e.actor?.device || null };
    const cur = s.dock.manifests[String(p.manNo)] || {};
    s.dock.manifests[String(p.manNo)] = { ...cur, manNo: String(p.manNo), dcNo: p.dcNo || cur.dcNo || '', despatch: p.despatch || cur.despatch || '', truck: e.entity.truck, totalCartons: consols.reduce((n, c) => n + c.cartons, 0), consols: consols.length, keycodes: cur.keycodes || new Set(consols.flatMap(c => c.items.map(i => i.k))).size, publishedAt: cur.publishedAt || e.at, attachedAt: e.at };
    capManifests(s);
    return null;
  },

  // ── Pallets ──────────────────────────────────────────────────────────
  'pallet.land'(s, e) {
    const t = liveTruck(s, e); if (t.code) return t;
    const ref = bay(e);
    if (!BAY_RE.test(ref)) return reject('invalid_event', 'bay must be a row letter and number, e.g. A6');
    if (t.pallets[ref]) return reject('bay_occupied', `bay ${ref} already holds a pallet`);
    const p = e.payload;
    if (!PTYPES.includes(p.ptype)) return reject('invalid_event', `ptype must be one of ${PTYPES.join(', ')}`);
    const cartons = Number.isFinite(p.cartons) ? Math.max(0, Math.round(p.cartons)) : null;
    const pal = {
      ref, ptype: p.ptype, cartons, expectedMins: null, expectedBasis: 'auto', note: String(p.note || '').slice(0, 120),
      status: 'landed', assignedTo: null, segments: [], consolIds: uniq(p.consolIds), scanIds: uniq(p.scanIds),
      excluded: !!p.excluded, carryover: !!p.carryover, landedAt: e.at, doneAt: null,
    };
    if (Number.isFinite(p.expectedMins)) { pal.expectedMins = Math.max(1, Math.round(p.expectedMins)); pal.expectedBasis = 'manual'; }
    else pal.expectedMins = autoMins(cartons);
    t.pallets[ref] = pal;
    return null;
  },
  'pallet.update'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const u = e.payload;
    if (u.ptype !== undefined) { if (!PTYPES.includes(u.ptype)) return reject('invalid_event', 'bad ptype'); p.ptype = u.ptype; }
    if (u.cartons !== undefined) { p.cartons = Number.isFinite(u.cartons) ? Math.max(0, Math.round(u.cartons)) : null; if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons); }
    if (u.expectedMins !== undefined) { if (u.expectedMins === null) { p.expectedBasis = 'auto'; p.expectedMins = autoMins(p.cartons); } else { p.expectedMins = Math.max(1, Math.round(u.expectedMins)); p.expectedBasis = 'manual'; } }
    if (u.note !== undefined) p.note = String(u.note || '').slice(0, 120);
    if (u.consolIds !== undefined) p.consolIds = uniq(u.consolIds);
    if (u.scanIds !== undefined) p.scanIds = uniq(u.scanIds);
    if (u.excluded !== undefined) p.excluded = !!u.excluded;
    if (u.carryover !== undefined) p.carryover = !!u.carryover;
    return null;
  },
  'pallet.start'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.status === 'done' || p.status === 'active') return null;
    p.status = 'active'; p.assignedTo = String(e.payload.pid); p.segments.push({ pid: p.assignedTo, start: e.at, end: null });
    return null;
  },
  'pallet.pause'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.status !== 'active') return null;
    p.status = 'paused'; closeSegment(p, e.at);
    return null;
  },
  'pallet.resume'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.status !== 'paused') return null;
    p.status = 'active'; p.assignedTo = String(e.payload.pid); p.segments.push({ pid: p.assignedTo, start: e.at, end: null });
    return null;
  },
  'pallet.done'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.status === 'done') return null;                     // second done: acknowledged no-op, credit stays
    closeSegment(p, e.at); p.status = 'done'; p.doneAt = e.at;
    return null;
  },
  'pallet.reopen'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.status !== 'done') return null;
    p.status = p.segments.length ? 'paused' : 'landed'; p.doneAt = null;
    return null;
  },
  'pallet.remove'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    delete t.pallets[bay(e)];
    return null;
  },
  'pallet.scan'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const t = s.dock.trucks[e.entity.truck];
    const raw = String(e.payload.code).replace(/\D/g, '');
    if (raw.length < 9) return reject('invalid_event', 'scan must carry at least 9 digits');
    const id9 = raw.slice(-9);
    if (!t.manifest) { if (!p.scanIds.includes(id9)) p.scanIds.push(id9); return null; }
    const c = t.manifest.consols.find(c => c.id === id9 || c.id === raw || c.cons.endsWith(raw) || c.cons.startsWith(raw));
    if (!c) return reject('not_on_manifest', `${id9} is not on manifest ${t.manifest.manNo}`);
    if (p.consolIds.includes(c.id)) return null;
    for (const [ref, other] of Object.entries(t.pallets)) if (ref !== p.ref && other.consolIds.includes(c.id)) return reject('consol_taken', `${c.id} is already on bay ${ref}`);
    p.consolIds.push(c.id);
    p.cartons = (p.cartons || 0) + c.cartons;
    if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons);
    return null;
  },

  // ── Halts ────────────────────────────────────────────────────────────
  'halt.start'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    if (!HALT_REASONS.includes(e.payload.reason)) return reject('invalid_event', `reason must be one of ${HALT_REASONS.join(', ')}`);
    const open = t.halts[t.halts.length - 1];
    if (open && !open.end) return null;
    t.halts.push({ reason: e.payload.reason, start: e.at, end: null });
    return null;
  },
  'halt.end'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const open = t.halts[t.halts.length - 1];
    if (open && !open.end) open.end = e.at;
    return null;
  },

  // ── Planner ──────────────────────────────────────────────────────────
  'plan.set'(s, e) {
    const slot = Number(e.entity.slot);
    if (!(Number.isInteger(slot) && slot >= 1 && slot <= 4)) return reject('invalid_event', 'slot must be 1..4');
    const p = e.payload;
    if (p.eta != null && !/^\d{2}:\d{2}$/.test(p.eta)) return reject('invalid_event', 'eta must be HH:MM');
    const day = (s.plan.days[e.entity.date] ||= { slots: {} });
    const cur = day.slots[slot] || { eta: null, note: '', team: [], manifest: null };
    if (p.eta !== undefined) cur.eta = p.eta;
    if (p.note !== undefined) cur.note = String(p.note || '').slice(0, 200);
    if (p.team !== undefined) cur.team = Array.isArray(p.team) ? p.team : [];
    if (p.manifest !== undefined) cur.manifest = p.manifest;
    day.slots[slot] = cur;
    return null;
  },
  'plan.remove'(s, e) {
    const day = s.plan.days[e.entity.date];
    if (day) delete day.slots[Number(e.entity.slot)];
    return null;
  },
};

// ── helpers ────────────────────────────────────────────────────────────
function capManifests(s) { const keys = Object.keys(s.dock.manifests); if (keys.length > MANIFEST_INDEX_CAP) for (const k of keys.sort((a, b) => s.dock.manifests[a].publishedAt < s.dock.manifests[b].publishedAt ? -1 : 1).slice(0, keys.length - MANIFEST_INDEX_CAP)) delete s.dock.manifests[k]; }
function bay(e) { return String(e.entity.bay).toUpperCase(); }
function uniq(a) { return Array.isArray(a) ? [...new Set(a.map(String))] : []; }
function autoMins(cartons) { return cartons ? Math.max(1, Math.round(cartons * STD_MINS_PER_CARTON)) : null; }
function closeSegment(p, at) { const seg = p.segments[p.segments.length - 1]; if (seg && !seg.end) seg.end = at; }
function truck(s, e) {
  const t = s.dock.trucks[e.entity.truck];
  if (!t) return reject('not_found', `truck ${e.entity.truck} does not exist`);
  if (t.status === 'closed') return reject('truck_closed', `truck ${e.entity.truck} is finalised`);
  return t;
}
function liveTruck(s, e) {
  const t = truck(s, e); if (t.code) return t;
  if (t.status !== 'live') return reject('truck_not_live', `truck ${e.entity.truck} is not live`);
  return t;
}
function pallet(s, e) {
  const t = truck(s, e); if (t.code) return t;
  const p = t.pallets[bay(e)];
  if (!p) return reject('not_found', `no pallet on bay ${bay(e)}`);
  return p;
}
export function historyRow(id, t) {
  const pallets = Object.values(t.pallets).filter(p => !p.excluded);
  const done = pallets.filter(p => p.status === 'done');
  const mins = (a, b) => a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000) : 0;
  const haltMins = t.halts.reduce((n, h) => n + mins(h.start, h.end), 0);
  const downtime = {};
  for (const h of t.halts) { const d = (downtime[h.reason] ||= { reason: h.reason, mins: 0, count: 0 }); d.mins += mins(h.start, h.end); d.count += 1; }
  const perPerson = {};
  for (const p of done) for (const seg of p.segments) { const r = (perPerson[seg.pid] ||= { pid: seg.pid, mins: 0, pallets: new Set(), cartons: 0 }); r.mins += mins(seg.start, seg.end); r.pallets.add(p.ref); }
  for (const p of done) { const pids = [...new Set(p.segments.map(x => x.pid))]; for (const pid of pids) perPerson[pid].cartons += (p.cartons || 0) / pids.length; }
  const cartons = done.reduce((n, p) => n + (p.cartons || 0), 0);
  const clearMins = mins(t.landedAt, t.clearedAt);
  const carried = pallets.filter(p => p.carryover);
  // Cartons per department: the manifest consols that landed on a done
  // pallet, by the consol's department.
  const byDept = {};
  if (t.manifest) { const consol = new Map(t.manifest.consols.map(c => [c.id, c])); for (const p of done) for (const id of p.consolIds) { const c = consol.get(id); if (!c) continue; const d = (byDept[c.dept || '?'] ||= { dept: c.dept || '', cartons: 0, pallets: new Set() }); d.cartons += Number(c.cartons) || 0; d.pallets.add(p.ref); } }
  return {
    id, date: id.slice(0, 10), landedAt: t.landedAt, clearedAt: t.clearedAt,
    cartons, pallets: done.length, palletsLanded: pallets.length,
    clearMins: Math.round(clearMins), haltMins: Math.round(haltMins), haltCount: t.halts.length,
    downtime: Object.values(downtime).map(d => ({ ...d, mins: Math.round(d.mins) })),
    teamRate: clearMins > haltMins ? Math.round(cartons / ((clearMins - haltMins) / 60)) : 0,
    audit: t.manifest ? auditOf(t, pallets) : null,
    carriedIn: carried.length ? { pallets: carried.length, cartons: carried.reduce((n, p) => n + (p.cartons || 0), 0) } : null,
    perPerson: Object.values(perPerson).map(r => ({ pid: r.pid, cartons: Math.round(r.cartons), pallets: r.pallets.size, bays: [...r.pallets], mins: Math.round(r.mins), rate: r.mins ? Math.round(r.cartons / (r.mins / 60)) : 0 })),
    byDept: Object.values(byDept).map(d => ({ dept: d.dept, cartons: d.cartons, pallets: d.pallets.size })).sort((a, b) => b.cartons - a.cartons),
    manifest: t.manifest ? { manNo: t.manifest.manNo, despatch: t.manifest.despatch, dcNo: t.manifest.dcNo } : null,
  };
}
function auditOf(t, pallets) {
  const on = new Set(pallets.flatMap(p => p.consolIds));
  const total = t.manifest.consols.length;
  const matched = t.manifest.consols.filter(c => on.has(c.id)).length;
  const extra = pallets.reduce((n, p) => n + p.scanIds.length, 0);
  const missingIds = t.manifest.consols.filter(c => !on.has(c.id)).slice(0, 40).map(c => ({ id: c.id, cartons: c.cartons, dept: c.dept || '' }));
  const extraIds = pallets.flatMap(p => p.scanIds.map(id => ({ id, bay: p.ref }))).slice(0, 40);
  return { matched, missing: total - matched, total, extra, missingIds, extraIds };
}
