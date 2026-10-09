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

const T = (area, roles, entity, payload = {}, v = 1) => ({ area, roles, entity, payload, v });
const F = ['floor'], S = ['stockroom'], D = ['dock'], M = ['manager'];

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
  'asset.service':       T('floor', F, ['asset']),
  'asset.schedule':      T('floor', F, ['asset'], { months: 'number' }),
  'picklist.set':        T('floor', F, ['device'], { items: 'array' }),
  'inventory.offsite.set':    T('floor', F, [], { rows: 'array' }),             // the off-site master list, whole; payload.src
  'inventory.offsite.add':    T('floor', F, ['pid']),                           // one pallet sent off-site: sent, desc, req, cb, note, products
  'inventory.offsite.update': T('floor', F, ['pid']),                           // cb, rec ('' = still off-site), note
  'inventory.load.add':       T('floor', F, ['load'], { label: 'string', pallets: 'array' }),   // date, status, recvDate, src
  'inventory.load.status':    T('floor', F, ['load'], { status: 'string' }),   // incoming | received | offsite; recvDate
  'inventory.load.remove':    T('floor', F, ['load']),

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
  'submission.claim':    T('stockroom', S, ['bay', 'date']),                    // payload.release
  'submission.readd':    T('stockroom', S, ['bay', 'date'], { code: 'string' }), // payload.done: scanned back in
  'adjustment.set':      T('stockroom', S, ['keycode', 'date'], { qty: 'number' }),
  'adjustment.remove':   T('stockroom', S, ['keycode', 'date']),
  'daylist.set':         T('stockroom', S, ['date'], { walkers: 'number' }),
  'scan.preset':         T('stockroom', S, ['size']),                           // payload: kind codes | rows, x, y, w, h (fractions) | remove
  'soh.publish':         T('stockroom', S, ['date']),                           // emitted by the worker on POST /soh: rows, locs, week
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

  // ── Store-wide ───────────────────────────────────────────────────────
  'map.publish':         T('store', M, ['version']),
  'roster.rotate':       T('store', M, []),
  'store.settings.set':  T('store', M, []),
  'store.tools.set':     T('store', M, [], { off: 'array' }),
  'store.retain':        T('store', M, [], { day: 'string' }),                   // worker only, nightly: trims finished records (shared/retain.js)                    // owner only: the tools switched off (shared/tools.js)
  'map.edit.suggest':    T('store', ['floor', 'stockroom', 'dock', 'manager'], ['edit'], { shelf: 'string', kind: 'string' }),  // rename (payload.to) | flag (payload.note)
  'map.edit.resolve':    T('store', M, ['edit'], { status: 'string' }),       // accepted | declined; payload.note                                     // any of tz, dockGrid, minsPerCarton, autoLockMins (null = default)
  'feedback.send':       T('store', ['floor', 'stockroom', 'dock', 'manager'], ['note'], { kind: 'string', text: 'string' }),   // payload.view, version, diag
};

export function typeInfo(type) {
  return CATALOGUE[type] || null;
}

// Which projections a store token may read for each entitled area.
export const AREA_PROJECTIONS = {
  floor: ['refresh', 'labels', 'stocktake', 'issues', 'assets', 'picklists', 'inventory'],
  stockroom: ['cages', 'backfill', 'adjustments', 'daylist', 'soh', 'scanPresets', 'cageSweeps', 'apnPairs'],
  backdock: ['dock', 'plan'],
  store: ['devices', 'map', 'roster', 'settings', 'mapedits', 'feedback', 'tools', 'retention'],
};
