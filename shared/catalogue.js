// The event catalogue: every type Conduit accepts, the area it belongs to,
// the roles that may send it, the entity keys, the required payload fields,
// and its schema version. Shapes follow the legacy modules they replace
// (see shared/reducers/*.js headers), ported faithfully.
//
// Roles: floor, stockroom, dock, manager. A manager may send anything the
// store is entitled to. Owner writes go through act-as and carry actor.owner.
//
// `payload` lists REQUIRED fields as { name: type }. Optional fields are
// documented in the reducer. Validation is deliberately simple so the same
// file runs on the device before queueing.

export const AREAS = ['floor', 'stockroom', 'backdock', 'store'];

// wasArea: the area a type moved from, still accepted from a device on an
// older release (the worker logs the event under its area now).
const T = (area, roles, entity, payload = {}, v = 1, wasArea) => ({ area, roles, entity, payload, v, ...(wasArea ? { wasArea } : {}) });
const F = ['floor'], S = ['stockroom'], D = ['dock'], M = ['manager'], FS = ['floor', 'stockroom'];

export const CATALOGUE = {
  // ── Floor ────────────────────────────────────────────────────────────
  'refresh.mark':        T('floor', F, ['segment', 'week']),
  'refresh.unmark':      T('floor', F, ['segment', 'week']),
  'refresh.clearWeek':   T('floor', F, ['week']),
  'refresh.clearDept':   T('floor', F, ['week'], { dept: 'string' }),            // payload.segments: the dept's marked segments the device saw
  'refresh.focus.set':   T('floor', F, ['week'], { departments: 'array' }),
  'refresh.plan.paint':  T('floor', F, ['segment'], { colour: 'string' }),       // '#rrggbb' or 'erase'
  'refresh.plan.clear':  T('floor', F, []),                                       // Reset planning: every painted shelf at once
  'label.cycle.set':     T('floor', F, [], { cycleLen: 'string' }),              // weekly | fortnightly | monthly
  'label.assign':        T('floor', F, ['micro'], { shelves: 'array' }),
  'label.check':         T('floor', F, ['micro', 'cycle']),
  'label.uncheck':       T('floor', F, ['micro', 'cycle']),
  'label.variance':      T('floor', F, ['micro', 'cycle'], { keycode: 'string' }),
  'stocktake.start':     T('floor', F, ['session']),
  'stocktake.phase':     T('floor', F, ['session'], { phase: 'string' }),        // counting | final
  'stocktake.end':       T('floor', F, ['session']),
  'stocktake.scan':      T('floor', F, ['session', 'shelf'], { state: 'string' }), // pending | counted | cleared
  'stocktake.verify':    T('floor', F, ['session', 'shelf']),                    // payload.verified (default true)
  'stocktake.verifyAll': T('floor', F, ['session']),
  'issue.log':           T('floor', F, ['issue'], { cat: 'string', title: 'string', sev: 'number' }),
  'issue.update':        T('floor', F, ['issue']),
  'issue.progress':      T('floor', F, ['issue']),
  'issue.close':         T('floor', F, ['issue']),
  'issue.reopen':        T('floor', F, ['issue']),
  'issue.remove':        T('floor', F, ['issue']),                                // tombstone; payload.note
  'issue.photo':         T('floor', F, ['issue'], { photo: 'string' }),           // payload.remove: true detaches it
  'issue.visit':         T('floor', F, ['issue'], { who: 'string' }),             // a contractor's visit; payload.note
  'asset.service':       T('floor', F, ['asset']),
  'asset.schedule':      T('floor', F, ['asset'], { months: 'number' }),
  'picklist.set':        T('floor', F, ['device'], { items: 'array' }),
  // Equipment checks (shared/reducers/equip.js): ladders, MHE, trolleys.
  // Anyone adds, edits, moves and checks; only a manager removes one.
  'equip.add':           T('floor', F, ['equip'], { code: 'string', kind: 'string' }),   // name, every, last, due, x, y, floor, loc
  'equip.update':        T('floor', F, ['equip']),                                // any of code, kind, name, every, due, x/y/floor/loc
  'equip.check':         T('floor', F, ['equip'], { day: 'string', result: 'string' }),   // ok | fail; points, note, issue, due
  'equip.remove':        T('floor', M, ['equip'], { why: 'string' }),             // retired | broken | lost | moved | mistake; note
  'equip.restore':       T('floor', M, ['equip']),
  // Recalls and withdrawals (shared/reducers/recall.js): managers keep the
  // list; anyone records stock found and moved to the recall bay.
  'recall.add':          T('floor', M, ['recall'], { kind: 'string', title: 'string', kcs: 'array' }),   // apns, ref, reason, action
  'recall.update':       T('floor', M, ['recall']),                               // any of kind, title, kcs, apns, ref, reason, action
  'recall.status':       T('floor', M, ['recall'], { status: 'string' }),         // open | removing | removed | closed
  'recall.found':        T('floor', F, ['recall'], { kc: 'string', n: 'number' }),   // where
  'recall.bay.set':      T('floor', M, [], { bay: 'string' }),
  // Live pull (shared/reducers/pull.js): the floor asks, the stockroom pulls.
  // Floor events so every phone holds the list; marking off and sending a
  // cage need the Stockroom code.
  'pull.session.start':  T('floor', FS, ['session'], { name: 'string', dept: 'string' }),   // payload.part req | pull, shelves
  'pull.session.end':    T('floor', FS, ['session']),
  'pull.join':           T('floor', FS, ['session']),                            // a requester joins
  'pull.zone.set':       T('floor', S, ['session'], { bays: 'array' }),          // a puller joins with the bays this phone pulls
  'pull.request':        T('floor', FS, ['session', 'line'], { kc: 'string', bays: 'array' }),   // qty | all: true; carton, name, shelf
  'pull.update':         T('floor', FS, ['session', 'line']),                    // qty | all while it waits; cancel: true takes it back
  'pull.mark':           T('floor', S, ['session', 'line'], { st: 'string' }),   // pulled | short | gone | todo (undo); got { bay: n }
  'pull.cage.send':      T('floor', S, ['session'], { cage: 'number' }),         // payload.tag
  'pull.pair':           T('floor', FS, ['apn'], { keycode: 'string' }),         // a ticket's item barcode → the keycode printed on it

  // ── Stockroom ────────────────────────────────────────────────────────
  'cage.create':         T('stockroom', S, ['cage'], { ring: 'string' }),
  'cage.scan':           T('stockroom', S, ['cage'], { keycode: 'string', qty: 'number' }),
  'cage.park':           T('stockroom', S, ['cage'], { location: 'string' }),        // payload.x, y, floor: parked on the map
  'cage.sweep':          T('stockroom', S, ['cage']),                           // payload.session, payload.location (the sweeper's zone)
  'cage.close':          T('stockroom', S, ['cage']),
  'cage.retag':          T('stockroom', S, ['cage'], { to: 'string' }),
  'cage.sweepStart':     T('stockroom', S, ['sweep']),
  'cage.sweepEnd':       T('stockroom', S, ['sweep']),
  'cage.pair':           T('stockroom', S, ['apn'], { keycode: 'string' }),
  'submission.open':     T('stockroom', S, ['bay', 'date']),
  'submission.update':   T('stockroom', S, ['bay', 'date']),                    // codes {code: scanned}, remove [], incorrect [], sent
  'submission.ready':    T('stockroom', S, ['bay', 'date']),                    // status → corrected
  'submission.submit':   T('stockroom', S, ['bay', 'date']),                    // status → submitted; payload.auto
  'submission.reopen':   T('stockroom', S, ['bay', 'date']),
  'submission.rename':   T('stockroom', S, ['bay', 'date'], { newBay: 'string' }),
  'submission.delete':   T('stockroom', S, ['bay', 'date']),
  'submission.request':  T('stockroom', S, ['bay', 'date']),                    // requested list; payload.remove
  'submission.claim':    T('stockroom', S, ['bay', 'date']),                    // payload.release | payload.takeover; lapses after CLAIM_TTL_MS
  'submission.readd':    T('stockroom', S, ['bay', 'date'], { code: 'string' }), // payload.done: scanned back in
  'adjustment.set':      T('stockroom', S, ['keycode', 'date'], { qty: 'number' }),
  'adjustment.remove':   T('stockroom', S, ['keycode', 'date']),
  'adjustment.done':     T('stockroom', S, ['keycode', 'date']),                 // ticked off once adjusted in the system; payload.undo puts it back
  'daylist.set':         T('stockroom', S, ['date'], { walkers: 'number' }),
  'scan.preset':         T('stockroom', S, ['size']),                           // payload: kind codes | rows, x, y, w, h (fractions) | remove
  'soh.publish':         T('stockroom', S, ['date']),                           // emitted by the worker on POST /soh: rows, locs, week
  'backfill.report.publish': T('stockroom', S, ['date']),                       // emitted by the worker on POST /backfill/report: at, bays, codes
  'soh.remove':          T('stockroom', S, ['date']),
  'soh.verify':          T('stockroom', S, ['date', 'keycode'], { loc: 'string' }), // payload.done false clears the tick

  // ── Back dock ────────────────────────────────────────────────────────
  'truck.create':        T('backdock', D, ['truck']),                           // payload.landedAt, payload.slot
  'truck.setLive':       T('backdock', D, ['truck']),
  'truck.setGoal':       T('backdock', D, ['truck']),                           // payload.goal ISO | null
  'truck.team.set':      T('backdock', D, ['truck'], { team: 'array' }),
  'truck.setStart':      T('backdock', D, ['truck']),                           // payload.at ISO | null: the decant clock's start
  'receiving.confirm':   T('backdock', D, ['truck']),                           // payload.confirmed (default true)
  'truck.finalise':      T('backdock', D, ['truck']),                           // the facilitator closes (legacy: facilitator code)
  'truck.reopen':        T('backdock', M, ['truck']),                           // back to live: its history row and rate credit come off until it closes again
  'truck.import':        T('backdock', M, ['truck']),                           // a finalised truck's record from the legacy app, as-is
  'manifest.publish':    T('backdock', D, ['manNo']),                            // payload: dcNo, despatch, filename, consols, totalCartons, keycodes
  'manifest.remove':     T('backdock', D, ['manNo']),
  'manifest.attach':     T('backdock', D, ['truck'], { manNo: 'string', consols: 'array' }),
  'pallet.land':         T('backdock', D, ['truck', 'bay'], { ptype: 'string' }),  // chep | loscam | bulk
  'pallet.update':       T('backdock', D, ['truck', 'bay']),
  'pallet.start':        T('backdock', D, ['truck', 'bay'], { pid: 'string' }),
  'pallet.pause':        T('backdock', D, ['truck', 'bay']),
  'pallet.resume':       T('backdock', D, ['truck', 'bay'], { pid: 'string' }),
  'pallet.done':         T('backdock', D, ['truck', 'bay']),
  'pallet.reopen':       T('backdock', D, ['truck', 'bay']),
  'pallet.remove':       T('backdock', D, ['truck', 'bay']),
  'pallet.scan':         T('backdock', D, ['truck', 'bay'], { code: 'string' }),
  'pallet.unscan':       T('backdock', D, ['truck', 'bay'], { id: 'string' }),     // a wrong scan comes off the pallet
  'pallet.move':         T('backdock', D, ['truck', 'bay'], { to: 'string' }),
  'pallet.join':         T('backdock', D, ['truck', 'bay'], { pid: 'string' }),
  'pallet.handover':     T('backdock', D, ['truck', 'bay'], { toPid: 'string' }),
  'pallet.leave':        T('backdock', D, ['truck', 'bay'], { pid: 'string' }),
  'pallet.unstart':      T('backdock', D, ['truck', 'bay']),
  'pallet.editTimes':    T('backdock', D, ['truck', 'bay']),                    // segments [{ pid, start, end, bf }], doneAt
  'halt.start':          T('backdock', D, ['truck'], { reason: 'string' }),   // payload.kind halt | huddle | transition | break, payload.note
  'halt.end':            T('backdock', D, ['truck']),
  'huddle.plan':         T('backdock', D, ['truck'], { mins: 'number' }),
  'break.start':         T('backdock', D, ['truck'], { pid: 'string' }),
  'break.end':           T('backdock', D, ['truck'], { pid: 'string' }),
  'plan.set':            T('backdock', D, ['date', 'slot']),
  'manifest.linkLate':   T('backdock', M, ['truck'], { links: 'array' }),        // [{ bay, consolIds, basis: scan|cartons|time|manual }]
  'plan.queues':         T('backdock', D, ['truck'], { queues: 'object' }),       // payload.basis x2 | personal
  'truck.take5':         T('backdock', D, ['truck'], { items: 'array' }),
  'dock.roster':         T('backdock', D, [], { pids: 'array' }),
  'plan.remove':         T('backdock', D, ['date', 'slot']),
  'plan.noTrucks':       T('backdock', D, ['date']),                            // a day confirmed with no trucks; payload.on false clears it

  // Off-site pallets and other loads: the Inventory hub's events, Floor
  // until it moved to the Back dock (23 Oct 2026).
  'inventory.offsite.set':    T('backdock', D, [], { rows: 'array' }, 1, 'floor'),             // the off-site master list, whole; payload.src
  'inventory.offsite.add':    T('backdock', D, ['pid'], {}, 1, 'floor'),                       // one pallet sent off-site: sent, desc, req, cb, note, products
  'inventory.offsite.update': T('backdock', D, ['pid'], {}, 1, 'floor'),                       // cb, rec ('' = still off-site), note
  'inventory.load.add':       T('backdock', D, ['load'], { label: 'string', pallets: 'array' }, 1, 'floor'),   // date, status, recvDate, src
  'inventory.load.status':    T('backdock', D, ['load'], { status: 'string' }, 1, 'floor'),   // incoming | received | offsite; recvDate
  'inventory.load.remove':    T('backdock', D, ['load'], {}, 1, 'floor'),

  // ── Store-wide ───────────────────────────────────────────────────────
  'map.publish':         T('store', M, ['version']),
  'roster.rotate':       T('store', M, []),
  'store.settings.set':  T('store', M, []),
  'bay.dept.set':        T('store', S, ['bay'], { dept: 'string' }),            // one stockroom bay's department ('' clears it): a pin in settings.deptRanges
  'dept.ranges.set':     T('store', S, [], { ranges: 'array' }),               // the whole bay → department map from the Departments editor: replaces settings.deptRanges
  'team.message.set':  T('store', M, [], { text: 'string' }),                   // the store's team message; '' clears it; payload.until YYYY-MM-DD
  'team.briefing.set': T('store', M, ['date'], { text: 'string' }),             // the day's briefing; '' clears it
  'store.areas.set':   T('store', M, [], { on: 'array' }),                     // worker only: the areas the store is entitled to, as the owner set them
  'store.tools.set':     T('store', M, [], { off: 'array' }),
  'store.retain':        T('store', M, [], { day: 'string' }),                   // worker only, nightly: trims finished records (shared/retain.js)                    // owner only: the tools switched off (shared/tools.js)
  'map.edit.suggest':    T('store', ['floor', 'stockroom', 'dock', 'manager'], ['edit'], { shelf: 'string', kind: 'string' }),  // rename (payload.to) | flag (payload.note) | name (payload.to, floor, pos {x,y}, near); payload.src 'field' from Field Mode
  'map.edit.resolve':    T('store', M, ['edit'], { status: 'string' }),       // accepted | declined; payload.note                                     // any of tz, dockGrid, minsPerCarton, autoLockMins (null = default)
  'feedback.send':       T('store', ['floor', 'stockroom', 'dock', 'manager'], ['note'], { kind: 'string', text: 'string' }),   // payload.view, version, diag
};

export function typeInfo(type) {
  return CATALOGUE[type] || null;
}

// Which projections a store token may read for each entitled area.
export const AREA_PROJECTIONS = {
  floor: ['refresh', 'labels', 'stocktake', 'issues', 'assets', 'picklists', 'pulls', 'equipment', 'recalls'],
  stockroom: ['cages', 'backfill', 'adjustments', 'daylist', 'soh', 'scanPresets', 'cageSweeps', 'apnPairs'],
  backdock: ['dock', 'plan', 'inventory'],
  store: ['devices', 'map', 'roster', 'settings', 'mapedits', 'feedback', 'tools', 'areas', 'comms', 'retention'],
};

// The largest payload (as JSON) each type may carry. Most events are a few
// hundred bytes; the default keeps one event from growing the log and the
// live state (a Durable Object row is capped at 2 MB). The types that carry
// whole lists say so here.
export const PAYLOAD_MAX = {
  default: 32_000,
  'manifest.attach': 2_000_000,      // up to 500 consolidations with their lines
  'truck.import': 2_000_000,         // a legacy truck, whole
  'inventory.offsite.set': 1_000_000,
  'inventory.load.add': 1_000_000,   // a load's pallets and their lines
  'manifest.publish': 500_000,       // the manifest's keycodes (worker)
  'soh.publish': 250_000,            // the snapshot's locations (worker)
  'manifest.linkLate': 250_000,
  'inventory.offsite.add': 128_000,
  'store.settings.set': 128_000,
  'plan.queues': 128_000,
  'picklist.set': 128_000,
  'pallet.editTimes': 64_000,
  'refresh.clearDept': 64_000,
  'submission.ready': 64_000,        // the report's list for the bay
};
export const payloadMax = type => PAYLOAD_MAX[type] || PAYLOAD_MAX.default;
