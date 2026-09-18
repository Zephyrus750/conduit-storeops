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
  'refresh.focus.set':   T('floor', F, ['week'], { departments: 'array' }),
  'refresh.plan.paint':  T('floor', F, ['segment'], { colour: 'string' }),       // '#rrggbb' or 'erase'
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
  'asset.service':       T('floor', F, ['asset']),
  'asset.schedule':      T('floor', F, ['asset'], { months: 'number' }),
  'picklist.set':        T('floor', F, ['device'], { items: 'array' }),

  // ── Stockroom ────────────────────────────────────────────────────────
  'cage.create':         T('stockroom', S, ['cage'], { ring: 'string' }),
  'cage.scan':           T('stockroom', S, ['cage'], { keycode: 'string', qty: 'number' }),
  'cage.park':           T('stockroom', S, ['cage'], { location: 'string' }),
  'cage.sweep':          T('stockroom', S, ['cage']),
  'cage.close':          T('stockroom', S, ['cage']),
  'submission.open':     T('stockroom', S, ['bay', 'date']),
  'submission.update':   T('stockroom', S, ['bay', 'date']),                    // codes {code: scanned}, remove [], incorrect []
  'submission.ready':    T('stockroom', S, ['bay', 'date']),                    // status → corrected
  'submission.submit':   T('stockroom', S, ['bay', 'date']),                    // status → submitted; payload.auto
  'submission.reopen':   T('stockroom', S, ['bay', 'date']),
  'submission.rename':   T('stockroom', S, ['bay', 'date'], { newBay: 'string' }),
  'submission.delete':   T('stockroom', S, ['bay', 'date']),
  'submission.request':  T('stockroom', S, ['bay', 'date']),                    // requested list; payload.remove
  'submission.claim':    T('stockroom', S, ['bay', 'date']),                    // payload.release
  'adjustment.set':      T('stockroom', S, ['keycode', 'date'], { qty: 'number' }),
  'adjustment.remove':   T('stockroom', S, ['keycode', 'date']),
  'daylist.set':         T('stockroom', S, ['date'], { walkers: 'number' }),

  // ── Back dock ────────────────────────────────────────────────────────
  'truck.create':        T('backdock', D, ['truck']),                           // payload.landedAt, payload.slot
  'truck.setLive':       T('backdock', D, ['truck']),
  'truck.setGoal':       T('backdock', D, ['truck']),                           // payload.goal ISO | null
  'truck.team.set':      T('backdock', D, ['truck'], { team: 'array' }),
  'truck.finalise':      T('backdock', M, ['truck']),
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
  'halt.start':          T('backdock', D, ['truck'], { reason: 'string' }),
  'halt.end':            T('backdock', D, ['truck']),
  'plan.set':            T('backdock', D, ['date', 'slot']),
  'plan.remove':         T('backdock', D, ['date', 'slot']),

  // ── Store-wide ───────────────────────────────────────────────────────
  'map.publish':         T('store', M, ['version']),
  'roster.rotate':       T('store', M, []),
  'device.heartbeat':    T('store', ['floor', 'stockroom', 'dock', 'manager'], ['device'], { app: 'string' }),
};

export function typeInfo(type) {
  return CATALOGUE[type] || null;
}

// Which projections a store token may read for each entitled area.
export const AREA_PROJECTIONS = {
  floor: ['refresh', 'labels', 'stocktake', 'issues', 'assets', 'picklists'],
  stockroom: ['cages', 'backfill', 'adjustments', 'daylist'],
  backdock: ['dock', 'plan'],
  store: ['devices', 'map', 'roster'],
};
