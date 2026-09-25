// Back dock reducers: trucks, pallets, halts, manifests, planner. Shapes
// follow Decant Visualiser's worker docs (backdock-receiving, -manifests,
// -planner, -history), ported faithfully.
//
//   dock.trucks   id ('YYYY-MM-DD-Tn') → { status: staged|live|closed, createdAt, landedAt, goalAt,
//                 grid, minsPerCarton (both from the store settings at creation), team: [{ pid: 'D4', dnum: 4 }], halts: [{ reason, start, end }],
//                 carriedConsols: consols that came with carried pallets
//                 manifest: { manNo, dcNo, despatch, consols: [...] } | null,
//                 pallets: ref → pallet }
//   pallet        { ref, ptype: chep|loscam|bulk, cartons, expectedMins, expectedBasis, note,
//                 status: landed|assigned|active|paused|done, assignedTo, segments: [{ pid, start, end }],
//                 consolIds: [], scanIds: [], excluded, carryover, carriedFrom, landedAt, doneAt }
//   dock.rollover  pallets held at a finalise for the next truck: { from, at, pallets: ref → pallet, consols } | null
//
// One truck at a time (as Decant Visualiser): a new truck is refused while
// another is open, unless it names the open one as carryFrom. That finalises
// the open truck and moves its unfinished pallets, still on their bays, onto
// the new one. A finalise can instead hold its unfinished pallets
// (payload.rollover); the next truck takes them unless it says takeRollover: false.
//
// People are D-numbers (D1, D2…), never names: a team member, a pallet's
// worker and the credit in history are all 'D4'.
//   dock.history  closed trucks, newest last, capped (the D1 archive takes the rest)
//   dock.manifests manNo → index entry (20 most recent)
//   plan.days     date → slots: 1..4 → { eta, note, team, manifest }
//
// pallet.scan is the server-side half of the legacy client ingest: match the
// 9-digit id against the truck's manifest, refuse a consol already on another
// pallet, reject an off-manifest scan (the device then chooses Add & flag
// through pallet.update, or ignores it).

import { reject } from './util.js';
import { settingsOf } from './store.js';

export const PTYPES = ['chep', 'loscam', 'bulk'];
export const PALLET_STATUS = ['landed', 'assigned', 'active', 'paused', 'done'];
export const HALT_REASONS = ['hcage', 'nostock', 'equip', 'safety', 'waiting', 'other'];
export const STD_MINS_PER_CARTON = 0.5;
const HISTORY_CAP = 500;
const MANIFEST_INDEX_CAP = 20;
const BAY_RE = /^[A-Z]\d{1,2}$/;
const MAX_CARTONS = 500;
const TRUCK_RE = /^\d{4}-\d{2}-\d{2}-T\d+$/;

export function backdockState() {
  return {
    dock: { trucks: {}, history: [], manifests: {}, grid: { rows: 4, cols: 7, rowLabels: 'ABCD' }, rollover: null },
    plan: { days: {} },
  };
}

export const backdockReducers = {
  // ── Trucks ───────────────────────────────────────────────────────────
  'truck.create'(s, e) {
    const id = e.entity.truck;
    if (!TRUCK_RE.test(id)) return reject('invalid_event', 'truck id must be YYYY-MM-DD-Tn');
    if (s.dock.trucks[id]) return reject('truck_exists', `${id} already exists`);
    const open = Object.keys(s.dock.trucks).filter(k => s.dock.trucks[k].status !== 'closed');
    const from = e.payload.carryFrom ? String(e.payload.carryFrom) : null;
    let carry = null;
    if (open.length) {
      if (!from) return reject('truck_open', `truck ${open.join(', ')} is still open: finalise it or carry it over to the new truck`);
      if (!open.includes(from)) return reject('not_found', `${from} is not an open truck`);
      const others = open.filter(k => k !== from);
      if (others.length) return reject('truck_open', `truck ${others.join(', ')} must be finalised first`);
      carry = s.dock.trucks[from];
      const bad = closable(carry); if (bad) return bad;
    }
    const t = { status: 'staged', createdAt: e.at, landedAt: e.payload.landedAt || null, goalAt: null, ...truckSetup(s), team: [], halts: [], manifest: null, pallets: {}, carriedConsols: [] };
    if (carry) t.grid = widerGrid(t.grid, carry.grid);
    // Creating from a planner slot consumes the slot's team and manifest.
    const date = id.slice(0, 10), slot = e.payload.slot ?? Number(id.slice(id.lastIndexOf('T') + 1));
    const day = s.plan.days[date];
    if (day && day.slots[slot]) { const sl = day.slots[slot]; t.team = teamOf(sl.team) || []; t.manifest = sl.manifest || null; delete day.slots[slot]; }
    // Pallets held at the last finalise join this truck (unless declined).
    const held = s.dock.rollover;
    if (held) {
      if (e.payload.takeRollover !== false) { for (const [ref, p] of Object.entries(held.pallets)) t.pallets[ref] = p; t.carriedConsols.push(...held.consols); if (held.grid) t.grid = widerGrid(t.grid, held.grid); }
      s.dock.rollover = null;
    }
    if (carry) {
      const moved = takeLeftovers(carry, from);
      for (const [ref, p] of Object.entries(moved.pallets)) if (!t.pallets[ref]) t.pallets[ref] = p;
      t.carriedConsols.push(...moved.consols);
      if (!t.team.length) t.team = carry.team.map(m => ({ ...m }));     // the crew stays on the dock
      closeTruck(s, from, carry, e.at, { pallets: Object.keys(moved.pallets).length, cartons: moved.cartons, to: id });
    }
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
    const team = teamOf(e.payload.team);
    if (!team) return reject('invalid_event', 'team members are D-numbers (D1, D2…); names are not kept');
    t.team = team;
    return null;
  },
  // Refused while a pallet is running: its open segment would close with no
  // end and its time would be lost from credit (legacy action.mjs:548-555).
  // payload.rollover holds the unfinished pallets for the next truck.
  'truck.finalise'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const bad = closable(t); if (bad) return bad;
    const id = e.entity.truck;
    let out = null;
    if (e.payload.rollover && leftovers(t).length) {
      if (s.dock.rollover) return reject('rollover_held', `pallets from ${s.dock.rollover.from} are already held for the next truck`);
      const moved = takeLeftovers(t, id);
      s.dock.rollover = { from: id, at: e.at, grid: { ...t.grid }, pallets: moved.pallets, consols: moved.consols };
      out = { pallets: Object.keys(moved.pallets).length, cartons: moved.cartons, to: null };
    }
    closeTruck(s, id, t, e.at, out);
    return null;
  },

  // A record imported from Decant Visualiser (or any legacy archive): the
  // history row as the legacy app computed it, whitelisted field by field.
  // Replaces an earlier import of the same truck, so re-running is safe.
  'truck.import'(s, e) {
    const id = e.entity.truck;
    if (!TRUCK_RE.test(id)) return reject('invalid_event', 'truck id must be YYYY-MM-DD-Tn');
    const p = e.payload || {}, n = v => Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0, arr = v => Array.isArray(v) ? v : [];
    const str = (v, max = 40) => v == null ? '' : String(v).slice(0, max);
    const row = {
      id, date: id.slice(0, 10), landedAt: p.landedAt ? str(p.landedAt) : null, clearedAt: p.clearedAt ? str(p.clearedAt) : null,
      cartons: n(p.cartons), pallets: n(p.pallets), palletsLanded: n(p.palletsLanded ?? p.pallets),
      clearMins: n(p.clearMins), haltMins: n(p.haltMins), haltCount: n(p.haltCount),
      downtime: arr(p.downtime).filter(d => d && typeof d === 'object').map(d => ({ reason: str(d.reason) || 'other', mins: n(d.mins), count: n(d.count) })),
      teamRate: n(p.teamRate),
      audit: p.audit && typeof p.audit === 'object' ? { matched: n(p.audit.matched), missing: n(p.audit.missing), total: n(p.audit.total), extra: n(p.audit.extra), missingIds: [], extraIds: [] } : null,
      carriedIn: p.carriedIn && typeof p.carriedIn === 'object' ? { pallets: n(p.carriedIn.pallets), cartons: n(p.carriedIn.cartons) } : null,
      perPerson: arr(p.perPerson).filter(x => x && x.pid).map(x => ({ pid: str(x.pid), cartons: n(x.cartons), pallets: n(x.pallets), bays: arr(x.bays).map(b => str(b, 4)).slice(0, 40), mins: n(x.mins), rate: n(x.rate) })),
      byDept: arr(p.byDept).filter(x => x && typeof x === 'object').map(x => ({ dept: str(x.dept), cartons: n(x.cartons), pallets: n(x.pallets) })),
      manifest: p.manifest && p.manifest.manNo ? { manNo: str(p.manifest.manNo, 20), despatch: str(p.manifest.despatch, 20), dcNo: str(p.manifest.dcNo, 20) } : null,
      imported: { source: str(p.source) || 'legacy', at: e.at, ...(p.pauses && typeof p.pauses === 'object' ? { pauses: { huddle: n(p.pauses.huddle), transition: n(p.pauses.transition), break: n(p.pauses.break) } } : {}) },
    };
    s.dock.history = s.dock.history.filter(r => r.id !== id);
    s.dock.history.push(row);
    s.dock.history.sort((a, b) => String(a.clearedAt || a.date).localeCompare(String(b.clearedAt || b.date)));
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
    rematchScans(t);
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
    if (!onGrid(t.grid, ref)) return reject('invalid_event', `bay ${ref} is not on the ${t.grid.rows} × ${t.grid.cols} dock grid`);
    if (t.pallets[ref]) return reject('bay_occupied', `bay ${ref} already holds a pallet`);
    const p = e.payload;
    if (!PTYPES.includes(p.ptype)) return reject('invalid_event', `ptype must be one of ${PTYPES.join(', ')}`);
    if (badCartons(p.cartons)) return reject('invalid_event', `cartons must be 1 to ${MAX_CARTONS}`);
    const cartons = Number.isFinite(p.cartons) ? Math.max(0, Math.round(p.cartons)) : null;
    const pal = {
      ref, ptype: p.ptype, cartons, expectedMins: null, expectedBasis: 'auto', note: String(p.note || '').slice(0, 120),
      status: 'landed', assignedTo: null, segments: [], consolIds: uniq(p.consolIds), scanIds: uniq(p.scanIds),
      excluded: !!p.excluded, carryover: !!p.carryover, landedAt: e.at, doneAt: null,
    };
    if (Number.isFinite(p.expectedMins)) { pal.expectedMins = Math.max(1, Math.round(p.expectedMins)); pal.expectedBasis = 'manual'; }
    else pal.expectedMins = autoMins(cartons, t.minsPerCarton);
    t.pallets[ref] = pal;
    return null;
  },
  'pallet.update'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const u = e.payload, rate = s.dock.trucks[e.entity.truck].minsPerCarton;
    if (u.ptype !== undefined) { if (!PTYPES.includes(u.ptype)) return reject('invalid_event', 'bad ptype'); p.ptype = u.ptype; }
    if (u.cartons !== undefined && badCartons(u.cartons)) return reject('invalid_event', `cartons must be 1 to ${MAX_CARTONS}`);
    if (u.cartons !== undefined) { p.cartons = Number.isFinite(u.cartons) ? Math.max(0, Math.round(u.cartons)) : null; if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons, rate); }
    if (u.expectedMins !== undefined) { if (u.expectedMins === null) { p.expectedBasis = 'auto'; p.expectedMins = autoMins(p.cartons, rate); } else { p.expectedMins = Math.max(1, Math.round(u.expectedMins)); p.expectedBasis = 'manual'; } }
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
    const pid = dnumId(e.payload.pid); if (!pid) return reject('invalid_event', 'the worker is a D-number (D1, D2…)');
    const who = canWork(s.dock.trucks[e.entity.truck], p, pid); if (who) return who;
    p.status = 'active'; p.assignedTo = pid; p.segments.push({ pid, start: e.at, end: null });
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
    const pid = dnumId(e.payload.pid); if (!pid) return reject('invalid_event', 'the worker is a D-number (D1, D2…)');
    const who = canWork(s.dock.trucks[e.entity.truck], p, pid); if (who) return who;
    p.status = 'active'; p.assignedTo = pid; p.segments.push({ pid, start: e.at, end: null });
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
  // A pallet with recorded work stays: removing it would drop the time and
  // credit already earned (legacy action.mjs:818-826). Reopen or fix instead.
  'pallet.remove'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const p = t.pallets[bay(e)];
    if (p && (p.segments.length || p.status === 'done')) return reject('pallet_worked', `bay ${p.ref} has decant time recorded and cannot be removed`);
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
    if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons, t.minsPerCarton);
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
    const team = p.team === undefined ? undefined : teamOf(Array.isArray(p.team) ? p.team : []);
    if (team === null) return reject('invalid_event', 'team members are D-numbers (D1, D2…); names are not kept');
    const day = (s.plan.days[e.entity.date] ||= { slots: {} });
    const cur = day.slots[slot] || { eta: null, note: '', team: [], manifest: null };
    if (p.eta !== undefined) cur.eta = p.eta;
    if (p.note !== undefined) cur.note = String(p.note || '').slice(0, 200);
    if (team !== undefined) cur.team = team;
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
function autoMins(cartons, rate) { return cartons ? Math.max(1, Math.round(cartons * (rate ?? STD_MINS_PER_CARTON))) : null; }
// A D-number: 'D4', 'd4', '4', 4 or { dnum: 4 } → 'D4'; anything else
// (a name) → null.
export function dnumId(x) {
  const v = x && typeof x === 'object' ? (x.dnum ?? x.pid) : x;
  const m = /^\s*D?\s*0*(\d{1,4})\s*$/i.exec(String(v ?? ''));
  return m && Number(m[1]) > 0 ? `D${Number(m[1])}` : null;
}
// A team as D-numbers, de-duplicated; null when any member is not one.
// Planner entries keep their start and finish times.
function teamOf(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const m of list) {
    const pid = dnumId(m); if (!pid) return null;
    if (seen.has(pid)) continue; seen.add(pid);
    const x = { pid, dnum: Number(pid.slice(1)) };
    if (m && typeof m === 'object') for (const k of ['start', 'finish']) if (typeof m[k] === 'string') x[k] = m[k].slice(0, 40);
    out.push(x);
  }
  return out;
}
// Why a truck cannot close yet, or null.
function closable(t) {
  const running = Object.values(t.pallets).filter(p => p.status === 'active').map(p => p.ref);
  return running.length ? reject('pallets_running', `pause or finish ${running.join(', ')} before finalising`) : null;
}
const leftovers = t => Object.values(t.pallets).filter(p => p.status !== 'done' && !p.excluded);
// Unfinished pallets leave the truck (it keeps what it cleared, so its
// record counts only its own work), tagged with the truck they first landed
// on, with the consols that were on them.
function takeLeftovers(t, id) {
  const pallets = {}, want = new Set(); let cartons = 0;
  for (const p of leftovers(t)) {
    pallets[p.ref] = { ...p, carryover: true, carriedFrom: p.carriedFrom || id };
    for (const c of p.consolIds) want.add(c);
    cartons += p.cartons || 0;
    delete t.pallets[p.ref];
  }
  const consols = consolsOf(t).filter(c => want.has(c.id)).map(c => ({ ...c, carried: true }));
  t.carriedConsols = (t.carriedConsols || []).filter(c => !want.has(c.id));
  t.carriedOutIds = [...new Set([...(t.carriedOutIds || []), ...want])];    // audited on the truck that clears them
  return { pallets, consols, cartons };
}
function closeTruck(s, id, t, at, carriedOut) {
  const open = t.halts[t.halts.length - 1];
  if (open && !open.end) open.end = at;
  t.status = 'closed'; t.clearedAt = at;
  const row = historyRow(id, t);
  if (carriedOut) row.carriedOut = carriedOut;
  s.dock.history.push(row);
  if (s.dock.history.length > HISTORY_CAP) s.dock.history.splice(0, s.dock.history.length - HISTORY_CAP);
}
function widerGrid(a, b) {
  const rows = Math.max(a?.rows || 0, b?.rows || 0), cols = Math.max(a?.cols || 0, b?.cols || 0);
  return { rows, cols, rowLabels: 'ABCDEFGH'.slice(0, rows) };
}
// The truck's manifest consols plus any carried in with its pallets.
export function consolsOf(t) { return [...(t.manifest?.consols || []), ...(t.carriedConsols || [])]; }
// A truck keeps the grid and carton rate the store had when it was created,
// so changing a setting mid-shift never moves a landed bay or an estimate.
function truckSetup(s) {
  const { dockGrid, minsPerCarton } = settingsOf(s);
  return { grid: { rows: dockGrid.rows, cols: dockGrid.cols, rowLabels: 'ABCDEFGH'.slice(0, dockGrid.rows) }, minsPerCarton };
}
function badCartons(v) { return v != null && (!Number.isFinite(v) || v < 1 || v > MAX_CARTONS); }
function onGrid(g, ref) {
  const labels = (g?.rowLabels || 'ABCDEFGH').slice(0, g?.rows || 4), n = Number(ref.slice(1));
  return labels.includes(ref[0]) && n >= 1 && n <= (g?.cols || 7);
}
// One person, one pallet: a decanter already running another pallet on this
// truck must pause or finish it first; and on a staffed truck the person must
// be on the team (legacy action.mjs:207-213, 838-840).
function canWork(t, p, pid) {
  pid = String(pid);
  if (t.team.length && !t.team.some(m => m.pid === pid)) return reject('not_on_team', `${pid} is not on this truck's team`);
  const busy = Object.values(t.pallets).find(o => o !== p && o.status === 'active' && o.assignedTo === pid);
  if (busy) return reject('person_busy', `${pid} is already decanting ${busy.ref}`);
  return null;
}
// A manifest attached after pallets landed: scans saved against the pallets
// (scanIds) that are on it move to the pallet's consols, so the audit stops
// counting them as off-manifest extras. A pallet's typed carton count stands;
// an unknown count takes the manifest's.
function rematchScans(t) {
  const byId = new Map(t.manifest.consols.map(c => [c.id, c]));
  const taken = new Set(Object.values(t.pallets).flatMap(p => p.consolIds));
  for (const p of Object.values(t.pallets)) {
    const keep = []; let added = 0;
    for (const id of p.scanIds) {
      const c = byId.get(id);
      if (!c || taken.has(id)) { keep.push(id); continue; }
      taken.add(id); p.consolIds.push(id); added += c.cartons;
    }
    p.scanIds = keep;
    if (p.cartons == null && added) { p.cartons = added; if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons, t.minsPerCarton); }
  }
}
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
  const carried = pallets.filter(p => p.carryover), gone = new Set(t.carriedOutIds || []), all = consolsOf(t).filter(c => !gone.has(c.id));
  // Cartons per department: the manifest consols that landed on a done
  // pallet, by the consol's department.
  const byDept = {};
  if (all.length) { const consol = new Map(all.map(c => [c.id, c])); for (const p of done) for (const id of p.consolIds) { const c = consol.get(id); if (!c) continue; const d = (byDept[c.dept || '?'] ||= { dept: c.dept || '', cartons: 0, pallets: new Set() }); d.cartons += Number(c.cartons) || 0; d.pallets.add(p.ref); } }
  return {
    id, date: id.slice(0, 10), landedAt: t.landedAt, clearedAt: t.clearedAt,
    cartons, pallets: done.length, palletsLanded: pallets.length,
    clearMins: Math.round(clearMins), haltMins: Math.round(haltMins), haltCount: t.halts.length,
    downtime: Object.values(downtime).map(d => ({ ...d, mins: Math.round(d.mins) })),
    teamRate: clearMins > haltMins ? Math.round(cartons / ((clearMins - haltMins) / 60)) : 0,
    audit: all.length ? auditOf(all, pallets) : null,
    carriedIn: carried.length ? { pallets: carried.length, cartons: carried.reduce((n, p) => n + (p.cartons || 0), 0), from: carried[0].carriedFrom || null } : null,
    perPerson: Object.values(perPerson).map(r => ({ pid: r.pid, cartons: Math.round(r.cartons), pallets: r.pallets.size, bays: [...r.pallets], mins: Math.round(r.mins), rate: r.mins ? Math.round(r.cartons / (r.mins / 60)) : 0 })),
    byDept: Object.values(byDept).map(d => ({ dept: d.dept, cartons: d.cartons, pallets: d.pallets.size })).sort((a, b) => b.cartons - a.cartons),
    manifest: t.manifest ? { manNo: t.manifest.manNo, despatch: t.manifest.despatch, dcNo: t.manifest.dcNo } : null,
  };
}
function auditOf(consols, pallets) {
  const on = new Set(pallets.flatMap(p => p.consolIds));
  const total = consols.length;
  const matched = consols.filter(c => on.has(c.id)).length;
  const extra = pallets.reduce((n, p) => n + p.scanIds.length, 0);
  const missingIds = consols.filter(c => !on.has(c.id)).slice(0, 40).map(c => ({ id: c.id, cartons: c.cartons, dept: c.dept || '' }));
  const extraIds = pallets.flatMap(p => p.scanIds.map(id => ({ id, bay: p.ref }))).slice(0, 40);
  return { matched, missing: total - matched, total, extra, missingIds, extraIds };
}
