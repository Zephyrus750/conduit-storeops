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
import { storeDay, DEFAULT_TZ } from '../time.js';

export const PTYPES = ['chep', 'loscam', 'bulk'];
export const PALLET_STATUS = ['landed', 'assigned', 'active', 'paused', 'done'];
export const HALT_REASONS = ['hcage', 'nostock', 'equip', 'safety', 'waiting', 'other'];
// Hold-ups (Decant Visualiser's kinds): a halt is an incident and counts as
// downtime; a huddle (team talk), a transition (changeover prep) and a team
// break are planned pauses, reported on their own. All of them stop the
// decant clock.
export const HALT_KINDS = ['halt', 'huddle', 'transition', 'break'];
export const TRANS_REASONS = ['cages', 'tables', 'tubs', 'moving', 'changeover', 'other'];
export const TEAM_ROLES = ['cutter', 'runner', 'cleaner'];
export const STD_MINS_PER_CARTON = 0.5;
const HISTORY_CAP = 500;
const MANIFEST_INDEX_CAP = 20;
const BAY_RE = /^[A-Z]\d{1,2}$/;
const MAX_CARTONS = 500;
const TRUCK_RE = /^\d{4}-\d{2}-\d{2}-T\d+$/;
export const TAKE5_IDS = ['brief', 'safe', 'equip', 'area', 'goal'];

export function backdockState() {
  return {
    dock: { trucks: {}, history: [], manifests: {}, grid: { rows: 4, cols: 7, rowLabels: 'ABCD' }, rollover: null, roster: null, ledger: {} },
    plan: { days: {} },
  };
}

// A manifest number as the dock writes it (the last digits of the report's
// number, or the file's): letters, digits and dashes.
const MAN_NO = /^[\w-]{1,20}$/;
// A planner slot's manifest: the same shape manifest.attach takes, checked
// the same way, since a truck made from the slot carries it.
// A manifest's consolidations, checked and trimmed (attach and a truck made
// from a planner slot share it). → [consol] or a rejection.
function manifestConsols(p) {
  if (!MAN_NO.test(String(p?.manNo ?? ''))) return reject('invalid_event', 'the manifest number is letters, digits and dashes (up to 20)');
  const consols = [];
  for (const c of p.consols || []) {
    if (!c || typeof c !== 'object') return reject('invalid_event', 'consols must be objects');
    const cons = String(c.cons ?? c.id ?? '');
    if (!/^\d{9,22}$/.test(cons)) return reject('invalid_event', 'consolidation numbers must be 9 to 22 digits');
    consols.push({ id: cons.slice(-9), cons, cartons: Math.max(0, Math.min(9999, Number(c.cartons) || 0)), dept: String(c.dept || '').slice(0, 12), mix: Array.isArray(c.mix) ? c.mix.slice(0, 20) : [], desc: String(c.desc || '').slice(0, 60), items: Array.isArray(c.items) ? c.items.slice(0, 250) : [] });
  }
  if (consols.length > 500) return reject('invalid_event', 'a manifest holds at most 500 consolidations');
  return consols;
}
// The manifest goes on the truck: scans re-matched, the ledger told (each
// consol manifested to this truck; one seen on an earlier truck is marked
// as landed earlier), and the library entry points at the truck, so the
// planner no longer offers it.
function fileManifest(s, truckId, t, p, consols, e) {
  t.manifest = { manNo: String(p.manNo), dcNo: String(p.dcNo || '').slice(0, 20), despatch: String(p.despatch || '').slice(0, 20), consols, attachedAt: e.at, by: e.actor?.device || null };
  rematchScans(t);
  const day = truckId.slice(0, 10);
  for (const c of consols) { const seen = ledgerFind(s, c.id, ['off', 'land'], truckId).find(x => x.d < day); if (seen) c.landedEarlier = seen; ledgerAdd(s, c.id, { t: truckId, d: day, k: 'man' }, e.at); }
  for (const pal of Object.values(t.pallets)) for (const id of pal.consolIds) ledgerAdd(s, id, { t: truckId, d: day, k: 'land', ref: pal.ref }, e.at);
  const cur = s.dock.manifests[String(p.manNo)] || {};
  s.dock.manifests[String(p.manNo)] = { ...cur, manNo: String(p.manNo), dcNo: p.dcNo || cur.dcNo || '', despatch: p.despatch || cur.despatch || '', truck: truckId, totalCartons: consols.reduce((n, c) => n + c.cartons, 0), consols: consols.length, keycodes: cur.keycodes || new Set(consols.flatMap(c => c.items.map(i => i.k))).size, publishedAt: cur.publishedAt || e.at, attachedAt: e.at };
  capManifests(s);
}
function slotManifest(m) {
  if (m === null) return null;
  if (!m || typeof m !== 'object' || !MAN_NO.test(String(m.manNo ?? ''))) return reject('invalid_event', 'a slot manifest needs a manifest number (letters, digits and dashes)');
  const consols = Array.isArray(m.consols) ? m.consols : [];
  if (consols.length > 500) return reject('invalid_event', 'a manifest holds at most 500 consolidations');
  return { ...m, manNo: String(m.manNo), consols };
}

export const backdockReducers = {
  // ── Trucks ───────────────────────────────────────────────────────────
  'truck.create'(s, e) {
    const id = e.entity.truck;
    if (!TRUCK_RE.test(id)) return reject('invalid_event', 'truck id must be YYYY-MM-DD-Tn');
    if (s.dock.trucks[id]) return reject('truck_exists', `${id} already exists`);
    // An imported record holds the id too (the switch-over morning's DV T1).
    if (s.dock.history.some(r => r.id === id)) return reject('truck_exists', `${id} is already in the history`);
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
    const startAt = e.payload.decantStartAt ?? null;
    if (startAt !== null && !isIso(startAt)) return reject('invalid_event', 'decantStartAt must be an ISO time');
    const date = id.slice(0, 10), slot = e.payload.slot ?? Number(id.slice(id.lastIndexOf('T') + 1));
    const slotMan = s.plan.days[date]?.slots[slot]?.manifest || null;
    const slotConsols = slotMan ? manifestConsols(slotMan) : null; if (slotConsols?.code) return slotConsols;
    const t = { status: 'staged', createdAt: e.at, landedAt: e.payload.landedAt || null, decantStartAt: startAt, goalAt: null, ...truckSetup(s), team: [], halts: [], breaks: [], manifest: null, pallets: {}, carriedConsols: [], receivingConfirmed: false, receivedAt: null };
    if (carry) t.grid = widerGrid(t.grid, carry.grid);
    // Creating from a planner slot consumes the slot's team and manifest.
    const day = s.plan.days[date];
    if (day && day.slots[slot]) {
      const sl = day.slots[slot]; t.team = teamOf(sl.team) || [];
      // A member's start follows the slot's ETA unless planned otherwise.
      if (sl.eta) for (const m of t.team) if (!m.start) m.start = sl.eta;
      if (sl.huddleMins) { const from = startAt || e.at; t.halts.push({ kind: 'huddle', reason: 'huddle', start: from, end: new Date(Date.parse(from) + sl.huddleMins * 60000).toISOString(), planned: true }); }
      if (sl.breakMins) t.plannedBreakMins = sl.breakMins;
      delete day.slots[slot];
    }
    // No slot team: the week's roster starts the truck.
    if (!t.team.length && s.dock.roster?.pids?.length) t.team = s.dock.roster.pids.map(pid => ({ pid, dnum: Number(pid.slice(1)) }));
    // A default goal from the last ten clear times (three or more), as DV.
    const recent = (s.dock.history || []).filter(r => r.clearMins > 0).slice(-10);
    if (recent.length >= 3) { const avg = recent.reduce((n, r) => n + r.clearMins, 0) / recent.length, from = Date.parse(startAt || e.at); if (avg > 10 && from) t.goalAt = new Date(from + Math.ceil(avg / 5) * 5 * 60000).toISOString(); }
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
    // The slot's manifest is filed as an attach would: ledger and library.
    if (slotMan) fileManifest(s, id, t, slotMan, slotConsols, e);
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
  // When the decant clock starts (DV's decantStartAt): clear time, rate and
  // the goal pace run from here, not from when the truck landed. null = landed.
  'truck.setStart'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const at = e.payload.at ?? null;
    if (at !== null && !isIso(at)) return reject('invalid_event', 'at must be an ISO time or null');
    t.decantStartAt = at;
    return null;
  },
  // The receiver hands the truck over: the layout is set. A soft marker;
  // decant can already be running and pallets can still change after.
  'receiving.confirm'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    t.receivingConfirmed = e.payload.confirmed !== false;
    t.receivedAt = t.receivingConfirmed ? e.at : null;
    return null;
  },
  'truck.team.set'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const team = teamOf(e.payload.team);
    if (!team) return reject('invalid_event', 'team members are D-numbers (D1, D2…); names are not kept');
    // Someone taken off the truck, or moved from cutting to another role,
    // steps off the pallet they are on first, as DV did: their time is kept
    // and the pallet pauses if nobody else is on it.
    const cutting = new Set(team.filter(m => (m.role || 'cutter') === 'cutter').map(m => m.pid));
    for (const pid of Object.keys(runningOn(t))) if (!cutting.has(pid)) stepOff(t, pid, e.at);
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

  // Reopen a finalised truck (DV's review → reopen): it goes back to live,
  // its history row and the rate credit in it come off until it is
  // finalised again. One truck at a time, so not while another is open.
  'truck.reopen'(s, e) {
    const id = e.entity.truck, t = s.dock.trucks[id];
    if (!t) return reject('not_found', `truck ${id} is not on the dock (an imported record cannot be reopened)`);
    if (t.status !== 'closed') return reject('truck_open', `truck ${id} is not finalised`);
    const other = Object.keys(s.dock.trucks).find(k => k !== id && s.dock.trucks[k].status !== 'closed');
    if (other) return reject('truck_open', `truck ${other} is on the dock: finalise it before reopening ${id}`);
    t.status = 'live'; t.clearedAt = null; t.reopenedAt = e.at; t.receivingConfirmed = false;
    // Pallets it held for the next truck come back onto their bays.
    const held = s.dock.rollover;
    if (held?.from === id) {
      const back = new Set();
      for (const [ref, p] of Object.entries(held.pallets)) { const q = { ...p }; if (q.carriedFrom === id) { delete q.carryover; delete q.carriedFrom; } t.pallets[ref] = q; for (const c of q.consolIds || []) back.add(c); }
      const onManifest = new Set((t.manifest?.consols || []).map(c => c.id));
      t.carriedConsols = [...(t.carriedConsols || []), ...held.consols.filter(c => !onManifest.has(c.id))];
      t.carriedOutIds = (t.carriedOutIds || []).filter(c => !back.has(c));
      s.dock.rollover = null;
    }
    s.dock.history = s.dock.history.filter(r => r.id !== id);
    return null;
  },

  // A record imported from Decant Visualiser (or any legacy archive): the
  // history row as the legacy app computed it, whitelisted field by field.
  // Replaces an earlier import of the same truck, so re-running is safe.
  'truck.import'(s, e) {
    const id = e.entity.truck;
    if (!TRUCK_RE.test(id)) return reject('invalid_event', 'truck id must be YYYY-MM-DD-Tn');
    const p = e.payload || {}, n = v => Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0, n1 = v => Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : 0, arr = v => Array.isArray(v) ? v : [];
    const str = (v, max = 40) => v == null ? '' : String(v).slice(0, max);
    const row = {
      id, date: id.slice(0, 10), landedAt: p.landedAt ? str(p.landedAt) : null, clearedAt: p.clearedAt ? str(p.clearedAt) : null,
      cartons: n(p.cartons), pallets: n(p.pallets), palletsLanded: n(p.palletsLanded ?? p.pallets),
      clearMins: n(p.clearMins), haltMins: n(p.haltMins), haltCount: n(p.haltCount),
      downtime: arr(p.downtime).filter(d => d && typeof d === 'object').map(d => ({ ...(['halt', 'transition'].includes(d.kind) ? { kind: d.kind } : {}), reason: str(d.reason) || 'other', mins: n(d.mins), count: n(d.count) })),
      teamRate: n(p.teamRate),
      audit: p.audit && typeof p.audit === 'object' ? { matched: n(p.audit.matched), missing: n(p.audit.missing), total: n(p.audit.total), extra: n(p.audit.extra), missingIds: [], extraIds: [] } : null,
      carriedIn: p.carriedIn && typeof p.carriedIn === 'object' ? { pallets: n(p.carriedIn.pallets), cartons: n(p.carriedIn.cartons) } : null,
      // Pallets shared between two people are fractions (DV keeps one decimal).
      perPerson: arr(p.perPerson).filter(x => x && x.pid).map(x => ({ pid: str(x.pid), cartons: n(x.cartons), pallets: n1(x.pallets), bays: arr(x.bays).map(b => str(b, 4)).slice(0, 40), mins: n(x.mins), ...(x.workedMins != null ? { workedMins: n1(x.workedMins) } : {}), rate: n(x.rate), ...(x.deltaPct != null && Number.isFinite(Number(x.deltaPct)) ? { deltaPct: n(x.deltaPct) } : {}), ...(x.start ? { start: str(x.start) } : {}), ...(x.finish ? { finish: str(x.finish) } : {}) })),
      byDept: arr(p.byDept).filter(x => x && typeof x === 'object').map(x => ({ dept: str(x.dept), cartons: n(x.cartons), pallets: n1(x.pallets) })),
      perDept: arr(p.perDept).filter(x => x && typeof x === 'object').map(x => ({ dept: str(x.dept), cartons: n(x.cartons), pallets: n1(x.pallets), workedMins: n1(x.workedMins) })),
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
  // A late manifest can still go on a truck already finalised, the same day
  // and by a manager (DV): its history row is rebuilt with the manifest.
  'manifest.attach'(s, e) {
    const t = lateTruck(s, e, 'attaching a manifest to a finalised truck'); if (t.code) return t;
    const p = e.payload;
    const consols = manifestConsols(p); if (consols.code) return consols;
    fileManifest(s, e.entity.truck, t, p, consols, e);
    if (t.status === 'closed') rebuildHistory(s, e.entity.truck, t);
    return null;
  },

  // Link pallets landed before the manifest (or without a scan) to its
  // consols (DV's manifest.linkLate): how each match was made is kept.
  'manifest.linkLate'(s, e) {
    const t = lateTruck(s, e, 'linking pallets on a finalised truck'); if (t.code) return t;
    if (!t.manifest) return reject('invalid_event', 'attach the manifest first');
    const links = e.payload.links; if (links.length > 80) return reject('invalid_event', 'at most 80 links at once');
    const ids = new Set(t.manifest.consols.map(c => c.id)), byId = new Map(t.manifest.consols.map(c => [c.id, c])), day = e.entity.truck.slice(0, 10);
    const taken = new Map(); for (const pal of Object.values(t.pallets)) for (const id of pal.consolIds) taken.set(id, pal.ref);
    // Every link is checked before any is applied: a refused batch changes nothing.
    if (links.some(l => !['scan', 'cartons', 'time', 'manual'].includes(l?.basis))) return reject('invalid_event', 'basis must be scan, cartons, time or manual');
    let linked = 0;
    for (const l of links) {
      const pal = t.pallets[String(l?.bay || '').toUpperCase()]; if (!pal || pal.carriedFrom) continue;
      const want = uniq(l.consolIds).filter(id => ids.has(id) && (!taken.has(id) || taken.get(id) === pal.ref)).slice(0, 8); if (!want.length) continue;
      pal.consolIds = want; pal.linkBasis = l.basis; pal.linkedLateAt = e.at; pal.scanIds = pal.scanIds.filter(x => !want.includes(x));
      for (const id of want) { taken.set(id, pal.ref); ledgerAdd(s, id, { t: e.entity.truck, d: day, k: 'land', ref: pal.ref }, e.at); }
      if (pal.cartons == null) { pal.cartons = want.reduce((n, id) => n + (byId.get(id)?.cartons || 0), 0) || null; if (pal.expectedBasis !== 'manual') pal.expectedMins = autoMins(pal.cartons, t.minsPerCarton); }
      linked += 1;
    }
    if (!linked) return reject('invalid_event', 'nothing to link: every pick was already taken or not on the manifest');
    if (t.status === 'closed') rebuildHistory(s, e.entity.truck, t);
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
    // A pallet imported from DV keeps what its ledger said (late, seen before).
    const sight = v => v && typeof v === 'object' && TRUCK_RE.test(String(v.t)) && /^\d{4}-\d{2}-\d{2}$/.test(String(v.d)) ? { t: String(v.t), d: String(v.d), ...(v.ref && BAY_RE.test(String(v.ref)) ? { ref: String(v.ref) } : {}) } : null;
    if (sight(p.lateFrom)) pal.lateFrom = sight(p.lateFrom);
    if (sight(p.seenBefore)) pal.seenBefore = sight(p.seenBefore);
    if (Number.isFinite(p.expectedMins)) { pal.expectedMins = Math.max(1, Math.round(p.expectedMins)); pal.expectedBasis = 'manual'; }
    else pal.expectedMins = autoMins(cartons, t.minsPerCarton);
    t.pallets[ref] = pal;
    return null;
  },
  'pallet.update'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const u = e.payload, rate = s.dock.trucks[e.entity.truck].minsPerCarton;
    if (u.ptype !== undefined && !PTYPES.includes(u.ptype)) return reject('invalid_event', 'bad ptype');
    if (u.cartons !== undefined && badCartons(u.cartons)) return reject('invalid_event', `cartons must be 1 to ${MAX_CARTONS}`);
    if (u.ptype !== undefined) p.ptype = u.ptype;
    if (u.cartons !== undefined) { p.cartons = Number.isFinite(u.cartons) ? Math.max(0, Math.round(u.cartons)) : null; if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons, rate); }
    if (u.expectedMins !== undefined) { if (u.expectedMins === null) { p.expectedBasis = 'auto'; p.expectedMins = autoMins(p.cartons, rate); } else { p.expectedMins = Math.max(1, Math.round(u.expectedMins)); p.expectedBasis = 'manual'; } }
    if (u.note !== undefined) p.note = String(u.note || '').slice(0, 120);
    if (u.consolIds !== undefined) p.consolIds = uniq(u.consolIds);
    if (u.scanIds !== undefined) { const before = new Set(p.scanIds); p.scanIds = uniq(u.scanIds); for (const id of p.scanIds) if (!before.has(id)) sighting(s, e, p, id); }
    if (u.excluded !== undefined) p.excluded = !!u.excluded;
    if (u.carryover !== undefined) p.carryover = !!u.carryover;
    if (u.suspectOk) { delete p.suspect; p.suspectOk = true; }   // the facilitator confirmed a quick finish was real
    return null;
  },
  // Move a pallet to another square (it keeps its work and consols).
  'pallet.move'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const t = s.dock.trucks[e.entity.truck], to = String(e.payload.to).toUpperCase();
    if (!BAY_RE.test(to) || !onGrid(t.grid, to)) return reject('invalid_event', `bay ${to} is not on the ${t.grid.rows} × ${t.grid.cols} dock grid`);
    if (to === p.ref) return reject('invalid_event', `the pallet is already on ${to}`);
    if (t.pallets[to]) return reject('bay_occupied', `bay ${to} already holds a pallet`);
    const from = p.ref;
    delete t.pallets[from]; p.ref = to; t.pallets[to] = p;
    // The decant plan is keyed by bay: the pallet keeps its place in its queue.
    for (const refs of Object.values(t.plan?.queues || {})) { const i = refs.indexOf(from); if (i >= 0) refs[i] = to; }
    return null;
  },
  'pallet.start'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const pid = dnumId(e.payload.pid); if (!pid) return reject('invalid_event', 'the worker is a D-number (D1, D2…)');
    // Starting a pallet someone is already on is refused, not ignored (DV
    // said "already running"): a silent no-op left the device showing the
    // start and offering an Undo that would pop the other person's time.
    // The same person starting twice (a double tap, a replay) is a no-op.
    if (p.status === 'done') return reject('pallet_done', `${p.ref} is already done`);
    if (p.status === 'active') { const on = openSegs(p).map(x => x.pid); return on.includes(pid) ? null : reject('pallet_running', `${p.ref} is already being decanted${on.length ? ' by ' + on.join(', ') : ''}: join instead`); }
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
  // A second person joins a pallet being decanted.
  'pallet.join'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (!openSegs(p).length) return reject('invalid_event', `${p.ref} is not being decanted: start it instead`);
    const pid = dnumId(e.payload.pid); if (!pid) return reject('invalid_event', 'the worker is a D-number (D1, D2…)');
    if (openSegs(p).some(x => x.pid === pid)) return reject('invalid_event', `${pid} is already on ${p.ref}`);
    const who = canWork(s.dock.trucks[e.entity.truck], p, pid); if (who) return who;
    p.segments.push({ pid, start: e.at, end: null });
    return null;
  },
  // The whole pallet passes to someone else: everyone on it steps off.
  'pallet.handover'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (!openSegs(p).length) return reject('invalid_event', `${p.ref} is not being decanted`);
    const pid = dnumId(e.payload.toPid); if (!pid) return reject('invalid_event', 'the worker is a D-number (D1, D2…)');
    const who = canWork(s.dock.trucks[e.entity.truck], p, pid); if (who) return who;
    closeSegment(p, e.at);
    p.segments.push({ pid, start: e.at, end: null }); p.assignedTo = pid;
    return null;
  },
  // One person steps off (a break, a role change); the rest keep cutting.
  // The last one off leaves the pallet paused with their time banked.
  'pallet.leave'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const pid = dnumId(e.payload.pid), seg = openSegs(p).find(x => x.pid === pid);
    if (!seg) return reject('invalid_event', `${e.payload.pid} is not on ${p.ref}`);
    seg.end = e.at;
    if (!openSegs(p).length) { p.status = 'paused'; p.assignedTo = pid; }
    return null;
  },
  // Undo the last start (a mis-tap): its segment goes, and so does a done.
  'pallet.unstart'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (!p.segments.length) return reject('invalid_event', `nothing to undo on ${p.ref}`);
    p.segments.pop(); p.doneAt = null; delete p.suspect;
    p.status = openSegs(p).length ? 'active' : p.segments.length ? 'paused' : p.assignedTo ? 'assigned' : 'landed';
    return null;
  },
  // Fix times: the facilitator corrects the segments and/or the done time.
  // bf marks a start filled in after the fact, so the timeline shows it as an estimate.
  'pallet.editTimes'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const t = s.dock.trucks[e.entity.truck], u = e.payload;
    let segs = null;
    if (u.segments !== undefined) {
      if (!Array.isArray(u.segments) || u.segments.length > 50) return reject('invalid_event', 'segments must be a list');
      segs = [];
      for (const x of u.segments) {
        const pid = dnumId(x?.pid);
        if (!pid || !isIso(x.start) || (x.end != null && (!isIso(x.end) || Date.parse(x.end) < Date.parse(x.start)))) return reject('invalid_event', 'each segment needs a D-number, a start and an end after it');
        segs.push({ pid, start: x.start, end: x.end ?? null, ...(x.bf ? { bf: true } : {}) });
      }
    }
    if (u.doneAt !== undefined && u.doneAt !== null && !isIso(u.doneAt)) return reject('invalid_event', 'doneAt must be an ISO time or null');
    if (segs) p.segments = segs;
    if (u.doneAt !== undefined) { p.doneAt = u.doneAt; p.status = u.doneAt ? 'done' : openSegs(p).length ? 'active' : p.segments.length ? 'paused' : 'landed'; if (u.doneAt) closeSegment(p, u.doneAt); }
    if (p.status === 'done') evalSuspect(t, p, e.at); else delete p.suspect;
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
    if (!p.segments.length) return reject('invalid_event', `no work recorded on ${p.ref}: start it first`);
    closeSegment(p, e.at); p.status = 'done'; p.doneAt = e.at;
    evalSuspect(s.dock.trucks[e.entity.truck], p, e.at);
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
    if (!t.manifest) { if (!p.scanIds.includes(id9)) p.scanIds.push(id9); sighting(s, e, p, id9); return null; }
    const c = t.manifest.consols.find(c => c.id === id9 || c.id === raw || c.cons.endsWith(raw) || c.cons.startsWith(raw));
    if (!c) return reject('not_on_manifest', `${id9} is not on manifest ${t.manifest.manNo}`);
    if (p.consolIds.includes(c.id)) return null;
    for (const [ref, other] of Object.entries(t.pallets)) if (ref !== p.ref && other.consolIds.includes(c.id)) return reject('consol_taken', `${c.id} is already on bay ${ref}`);
    p.consolIds.push(c.id);
    ledgerAdd(s, c.id, { t: e.entity.truck, d: e.entity.truck.slice(0, 10), k: 'land', ref: p.ref }, e.at);
    p.cartons = (p.cartons || 0) + c.cartons;
    if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons, t.minsPerCarton);
    return null;
  },

  // A wrong scan comes off the pallet (a tub's old label, the wrong
  // pallet's sheet): the consol and the cartons it brought go, so the right
  // pallet can take it. A label saved off the manifest is dropped the same way.
  'pallet.unscan'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    const t = s.dock.trucks[e.entity.truck], id = String(e.payload.id).replace(/\D/g, '').slice(-9);
    const drop = k => { const L = s.dock.ledger?.[id]; if (L) { s.dock.ledger[id] = L.filter(x => !(x.t === e.entity.truck && x.k === k && x.ref === p.ref)); if (!s.dock.ledger[id].length) delete s.dock.ledger[id]; } };
    if (p.consolIds.includes(id)) {
      p.consolIds = p.consolIds.filter(x => x !== id); drop('land');
      const c = consolsOf(t).find(x => x.id === id);
      if (c && p.cartons != null) { const left = p.cartons - c.cartons; p.cartons = left > 0 ? left : null; if (p.expectedBasis !== 'manual') p.expectedMins = autoMins(p.cartons, t.minsPerCarton); }
      if (p.linkBasis && !p.consolIds.length) { delete p.linkBasis; delete p.linkedLateAt; }
      return null;
    }
    if (p.scanIds.includes(id)) { p.scanIds = p.scanIds.filter(x => x !== id); drop('off'); return null; }
    return reject('not_found', `${id} is not on ${p.ref}`);
  },

  // ── Halts ────────────────────────────────────────────────────────────
  'halt.start'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const kind = e.payload.kind ?? 'halt', reason = kind === 'huddle' || kind === 'break' ? kind : e.payload.reason;
    if (!HALT_KINDS.includes(kind)) return reject('invalid_event', `kind must be one of ${HALT_KINDS.join(', ')}`);
    const reasons = kind === 'transition' ? TRANS_REASONS : kind === 'halt' ? HALT_REASONS : [kind];
    if (!reasons.includes(reason)) return reject('invalid_event', `reason must be one of ${reasons.join(', ')}`);
    if (t.halts.some(h => !h.end)) return null;
    const note = String(e.payload.note || '').slice(0, 120);
    t.halts.push({ kind, reason, start: e.at, end: null, ...(note ? { note } : {}) });
    return null;
  },
  // The booked opening huddle: a planned block from decant start, replacing
  // an earlier booking. mins 0 clears it. Ad hoc huddles use halt.start.
  'huddle.plan'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const mins = Math.round(Number(e.payload.mins));
    if (!(mins >= 0 && mins <= 120)) return reject('invalid_event', 'mins must be 0 to 120');
    t.halts = t.halts.filter(h => !(h.kind === 'huddle' && h.planned));
    const from = startOf(t) || e.at;
    if (mins) t.halts.push({ kind: 'huddle', reason: 'huddle', start: from, end: new Date(Date.parse(from) + mins * 60000).toISOString(), planned: true });
    t.halts.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return null;
  },
  // A personal break: only that person's clock stops (a halt stops everyone's).
  'break.start'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const pid = dnumId(e.payload.pid);
    if (!pid || !t.team.some(m => m.pid === pid)) return reject('not_on_team', `${e.payload.pid} is not on this truck's team`);
    if ((t.breaks || []).some(b => b.pid === pid && !b.end)) return reject('invalid_event', `${pid} is already on a break`);
    stepOff(t, pid, e.at);                           // off their pallet first, as DV did
    (t.breaks ||= []).push({ pid, start: e.at, end: null });
    return null;
  },
  'break.end'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const pid = dnumId(e.payload.pid), b = (t.breaks || []).find(x => x.pid === pid && !x.end);
    if (!b) return reject('invalid_event', `${e.payload.pid} is not on a break`);
    b.end = e.at;
    return null;
  },
  'halt.end'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const open = t.halts.find(h => !h.end);
    if (open) open.end = e.at;
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
    // Validate everything before the day or slot is touched.
    const booked = {};
    for (const k of ['huddleMins', 'breakMins']) if (p[k] !== undefined) {
      const v = p[k] == null ? 0 : Math.round(Number(p[k]));
      if (!(v >= 0 && v <= 120)) return reject('invalid_event', `${k} must be 0 to 120`);
      booked[k] = v || null;
    }
    const manifest = p.manifest === undefined ? undefined : slotManifest(p.manifest);
    if (manifest && manifest.code) return manifest;
    const day = (s.plan.days[e.entity.date] ||= { slots: {} });
    const cur = { ...(day.slots[slot] || { eta: null, note: '', team: [], manifest: null }) };
    if (p.eta !== undefined) cur.eta = p.eta;
    if (p.note !== undefined) cur.note = String(p.note || '').slice(0, 200);
    if (team !== undefined) cur.team = team;
    if (manifest !== undefined) cur.manifest = manifest;
    // Booked minutes: a huddle at the decant start (it stops the clock and
    // is reported apart from downtime) and the team break the plan allows.
    Object.assign(cur, booked);
    day.slots[slot] = cur;
    return null;
  },
  'plan.remove'(s, e) {
    const day = s.plan.days[e.entity.date];
    if (day) delete day.slots[Number(e.entity.slot)];
    return null;
  },
  // Each cutter's queue of pallets (DV's plan.setQueues): the whole set is
  // replaced; refs must be pallets on the truck, people on its team.
  'plan.queues'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const q = e.payload.queues, basis = e.payload.basis ?? t.plan?.basis ?? 'x2';
    if (!['x2', 'personal'].includes(basis)) return reject('invalid_event', 'basis must be x2 or personal');
    if (!q || typeof q !== 'object' || Array.isArray(q)) return reject('invalid_event', 'queues must be { D4: [refs] }');
    const team = new Set((t.team || []).map(m => m.pid)), seen = new Set(), out = {};
    for (const [pid, refs] of Object.entries(q)) {
      if (!team.has(pid)) return reject('invalid_event', `${pid} is not on this truck's team`);
      if (!Array.isArray(refs)) return reject('invalid_event', 'each queue is a list of bays');
      out[pid] = [];
      for (const r of refs.map(x => String(x).toUpperCase())) { if (!t.pallets[r]) return reject('not_found', `no pallet at ${r}`); if (seen.has(r)) continue; seen.add(r); out[pid].push(r); }
    }
    t.plan = { basis, queues: out, at: e.at };
    return null;
  },
  // Take 5 before the decant: every item ticked, recorded with who and when.
  'truck.take5'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const items = [...new Set((e.payload.items || []).map(String))];
    if (!TAKE5_IDS.every(k => items.includes(k))) return reject('invalid_event', `tick all five: ${TAKE5_IDS.join(', ')}`);
    t.take5 = { at: e.at, by: e.actor?.device || null, items: TAKE5_IDS.slice() };
    return null;
  },
  // The week's decant roster: new trucks start with these D-numbers.
  'dock.roster'(s, e) {
    const team = teamOf(e.payload.pids);
    if (team === null) return reject('invalid_event', 'the roster is D-numbers (D1, D2…); names are not kept');
    s.dock.roster = { pids: team.map(m => m.pid), at: e.at };
    return null;
  },
};

// ── helpers ────────────────────────────────────────────────────────────
// A truck for a late manifest action: open, or finalised today with the
// manager's role.
function lateTruck(s, e, what) {
  const t = s.dock.trucks[e.entity.truck];
  if (!t) return reject('not_found', `truck ${e.entity.truck} does not exist`);
  if (t.status !== 'closed') return t;
  if (e.entity.truck.slice(0, 10) !== storeDay(new Date(e.at), s.settings?.tz || DEFAULT_TZ)) return reject('truck_closed', `${what} is same-day only`);   // the store's day: a 7am Perth event is the previous day in UTC
  if (e.actor?.role !== 'manager' && !e.actor?.owner) return reject('forbidden', `${what} needs the manager code`);
  return t;
}
function rebuildHistory(s, id, t) {
  const i = s.dock.history.findIndex(r => r.id === id); if (i < 0) return;
  s.dock.history[i] = { ...historyRow(id, t), ...(s.dock.history[i].carriedOut ? { carriedOut: s.dock.history[i].carriedOut } : {}) };
}
// The consol ledger (DV's): where each consolidation (by its last nine
// digits) was manifested (man), landed on a pallet (land) or scanned off
// the manifest (off), for 60 days, eight sightings an id.
const LEDGER_DAYS = 60;
const led9 = x => { const d = String(x || '').replace(/\D/g, ''); return d.length >= 6 ? d.slice(-9) : null; };
function ledgerAdd(s, id, entry, at) {
  const k = led9(id); if (!k) return;
  const L = (s.dock.ledger ||= {}), list = (L[k] ||= []);
  if (!list.some(x => x.t === entry.t && x.k === entry.k)) { list.push(entry); if (list.length > 8) list.splice(0, list.length - 8); }
  const cutoff = new Date(Date.parse(at) - LEDGER_DAYS * 86400000).toISOString().slice(0, 10);
  for (const [key, xs] of Object.entries(L)) { const keep = xs.filter(x => x.d >= cutoff); if (keep.length) L[key] = keep; else delete L[key]; }
}
function ledgerFind(s, id, kinds, notTruck) {
  const k = led9(id); return k ? (s.dock.ledger?.[k] || []).filter(x => kinds.includes(x.k) && x.t !== notTruck).sort((a, b) => b.d.localeCompare(a.d)) : [];
}
// An off-manifest scan: manifested to an earlier truck is a late arrival;
// seen on another truck before is a possible duplicate.
function sighting(s, e, p, id) {
  const day = e.entity.truck.slice(0, 10), man = ledgerFind(s, id, ['man'], e.entity.truck).find(x => x.d <= day);
  if (man) p.lateFrom = { t: man.t, d: man.d };
  else if (!p.seenBefore) { const seen = ledgerFind(s, id, ['off', 'land'], e.entity.truck)[0]; if (seen) p.seenBefore = seen; }
  ledgerAdd(s, id, { t: e.entity.truck, d: day, k: 'off', ref: p.ref }, e.at);
}
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
    if (m && typeof m === 'object' && TEAM_ROLES.includes(m.role)) x.role = m.role;
    if (m && typeof m === 'object') for (const k of ['start', 'finish']) if (typeof m[k] === 'string') x[k] = m[k].slice(0, 40);
    out.push(x);
  }
  return out;
}
// Why a truck cannot close yet, or null.
function closable(t) {
  const running = Object.values(t.pallets).filter(p => p.status === 'active' || p.segments.some(x => !x.end)).map(p => p.ref);
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
  for (const b of t.breaks || []) if (!b.end) b.end = at;     // nobody stays on a break on a closed truck
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
  const busy = Object.values(t.pallets).find(o => o !== p && o.segments.some(x => !x.end && x.pid === pid));
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
function closeSegment(p, at) { for (const seg of p.segments) if (!seg.end) seg.end = at; }
// Who is on which pallet now, and one person stepping off theirs (the
// last one off leaves it paused, their time banked).
function runningOn(t) { const out = {}; for (const p of Object.values(t.pallets)) for (const seg of p.segments) if (!seg.end) out[seg.pid] = p; return out; }
function stepOff(t, pid, at) {
  const p = runningOn(t)[pid]; if (!p) return;
  for (const seg of p.segments) if (!seg.end && seg.pid === pid) seg.end = at;
  if (!openSegs(p).length) { p.status = 'paused'; p.assignedTo = pid; }
}
const openSegs = p => p.segments.filter(x => !x.end);
const isIso = v => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
export const startOf = t => t.decantStartAt || t.landedAt || null;
// Worked time on a pallet: its segments, less any halt (everyone stops) and
// the worker's own breaks. As Decant Visualiser's workedMs.
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
export function segWorkedMs(t, seg, nowMs) {
  const a = Date.parse(seg.start), b = seg.end ? Date.parse(seg.end) : nowMs;
  if (!(b > a)) return 0;
  let off = 0;
  for (const h of t.halts || []) off += overlap(a, b, Date.parse(h.start), h.end ? Date.parse(h.end) : nowMs);
  for (const x of t.breaks || []) if (x.pid === seg.pid) off += overlap(a, b, Date.parse(x.start), x.end ? Date.parse(x.end) : nowMs);
  return Math.max(0, b - a - off);
}
export const workedMs = (t, p, nowMs) => p.segments.reduce((n, seg) => n + segWorkedMs(t, seg, nowMs), 0);
// A 60-minute pallet "done" in a minute is almost always a missed start:
// flag it so its time credits nobody until the times are fixed or it is
// confirmed. Pallets expected under 10 minutes can be quick and are exempt.
function evalSuspect(t, p, at) {
  if (p.suspectOk) { delete p.suspect; return; }
  const exp = p.expectedMins ?? (p.cartons != null ? p.cartons * (t.minsPerCarton ?? STD_MINS_PER_CARTON) : null);
  if (exp != null && exp >= 10 && workedMs(t, p, Date.parse(at)) / 60000 < exp * 0.2) p.suspect = true;
  else delete p.suspect;
}
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
  const nowMs = Date.parse(t.clearedAt) || Date.now();
  // The decant clock (as DV): from decant start (else landed) to the last
  // pallet done (else the finalise).
  const from = startOf(t), lastDone = done.map(p => p.doneAt).filter(Boolean).sort().at(-1) || t.clearedAt;
  const clearMins = mins(from, lastDone);
  const spans = k => t.halts.filter(h => (h.kind || 'halt') === k && h.end).reduce((n, h) => n + mins(h.start, h.end), 0);
  const haltMins = spans('halt');
  // Downtime is real halts and transitions, by reason; huddles and team
  // breaks are planned and reported on their own.
  const downtime = {};
  for (const h of t.halts) {
    const kind = h.kind || 'halt'; if (kind === 'huddle' || kind === 'break' || !h.end) continue;
    const d = (downtime[kind + ':' + h.reason] ||= { kind, reason: h.reason, mins: 0, count: 0 }); d.mins += mins(h.start, h.end); d.count += 1;
  }
  // Credit: each pallet's cartons shared by worked time (halts and the
  // person's breaks taken out). A suspect pallet credits nobody.
  const perPerson = {};
  for (const p of done) {
    if (p.suspect) continue;
    const by = {}; let total = 0;
    for (const seg of p.segments) { const w = segWorkedMs(t, seg, nowMs); by[seg.pid] = (by[seg.pid] || 0) + w; total += w; }
    const n = Object.keys(by).length;
    for (const [pid, w] of Object.entries(by)) {
      const share = total ? w / total : 1 / n, r = (perPerson[pid] ||= { pid, mins: 0, pallets: 0, bays: new Set(), cartons: 0, expected: 0 });
      r.mins += w / 60000; r.pallets += share >= 0.5 || n === 1 ? 1 : share; r.bays.add(p.ref); r.cartons += (p.cartons || 0) * share; r.expected += (p.expectedMins || 0) * share;
    }
  }
  const cartons = done.reduce((n, p) => n + (p.cartons || 0), 0);
  const carried = pallets.filter(p => p.carryover), gone = new Set(t.carriedOutIds || []), all = consolsOf(t).filter(c => !gone.has(c.id));
  // Cartons per department: the manifest consols that landed on a done
  // pallet, by the consol's department.
  const byDept = {};
  if (all.length) { const consol = new Map(all.map(c => [c.id, c])); for (const p of done) for (const id of p.consolIds) { const c = consol.get(id); if (!c) continue; const d = (byDept[c.dept || '?'] ||= { dept: c.dept || '', cartons: 0, pallets: new Set() }); d.cartons += Number(c.cartons) || 0; d.pallets.add(p.ref); } }
  const active = clearMins - haltMins;
  return {
    id, date: id.slice(0, 10), landedAt: t.landedAt, decantStartAt: t.decantStartAt || null, clearedAt: t.clearedAt,
    cartons, pallets: done.length, palletsLanded: pallets.length,
    clearMins: Math.round(clearMins), haltMins: Math.round(haltMins), haltCount: t.halts.filter(h => (h.kind || 'halt') === 'halt').length,
    huddleMins: Math.round(spans('huddle')), transitionMins: Math.round(spans('transition')), teamBreakMins: Math.round(spans('break')),
    breakMins: Math.round((t.breaks || []).filter(b => b.end).reduce((n, b) => n + mins(b.start, b.end), 0)),
    downtime: Object.values(downtime).map(d => ({ ...d, mins: Math.round(d.mins) })).sort((a, b) => b.mins - a.mins),
    teamRate: active > 0 ? Math.round(cartons / (active / 60)) : 0,
    suspect: done.filter(p => p.suspect).length,
    audit: all.length ? auditOf(all, pallets) : null,
    carriedIn: carried.length ? { pallets: carried.length, cartons: carried.reduce((n, p) => n + (p.cartons || 0), 0), from: carried[0].carriedFrom || null } : null,
    perDept: perDeptOf(t, done, all, nowMs),
    perPerson: Object.values(perPerson).map(r => ({ pid: r.pid, cartons: Math.round(r.cartons), pallets: Math.round(r.pallets * 10) / 10, bays: [...r.bays], mins: Math.round(r.mins), workedMins: Math.round(r.mins * 10) / 10, rate: r.mins ? Math.round(r.cartons / (r.mins / 60)) : 0, deltaPct: r.expected ? Math.round((r.mins - r.expected) / r.expected * 100) : null })),
    byDept: Object.values(byDept).map(d => ({ dept: d.dept, cartons: d.cartons, pallets: d.pallets.size })).sort((a, b) => b.cartons - a.cartons),
    manifest: t.manifest ? { manNo: t.manifest.manNo, despatch: t.manifest.despatch, dcNo: t.manifest.dcNo } : null,
  };
}
// Worked minutes and cartons by department, split by each consol's true
// mix (DV's computeSummary perDept): a done pallet's time is shared over
// its consols by cartons, then over each consol's departments by its mix.
function perDeptOf(t, done, consols, nowMs) {
  const byId = new Map(consols.map(c => [c.id, c])), acc = {};
  for (const p of done) {
    if (p.suspect) continue;
    const cs = p.consolIds.map(id => byId.get(id)).filter(Boolean); if (!cs.length) continue;
    const mins = p.segments.reduce((n, seg) => n + segWorkedMs(t, seg, nowMs), 0) / 60000, ctn = cs.reduce((n, c) => n + (c.cartons || 0), 0) || cs.length;
    for (const c of cs) {
      const mix = (c.mix && c.mix.length ? c.mix : [[String(c.dept || '?').split('/')[0], c.cartons || 1]]), msum = mix.reduce((n, m) => n + (Number(m[1]) || 0), 0) || 1, cShare = (c.cartons || 1) / ctn;
      for (const [dept, cc] of mix) { const share = cShare * (Number(cc) || 0) / msum, d = (acc[dept] ||= { dept, pallets: 0, cartons: 0, workedMins: 0 }); d.pallets += share; d.cartons += (p.cartons || 0) * share; d.workedMins += mins * share; }
    }
  }
  return Object.values(acc).filter(d => d.workedMins >= 0.5 || d.cartons >= 1).map(d => ({ dept: d.dept, pallets: Math.round(d.pallets * 10) / 10, cartons: Math.round(d.cartons), workedMins: Math.round(d.workedMins * 10) / 10 })).sort((a, b) => b.cartons - a.cartons);
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
