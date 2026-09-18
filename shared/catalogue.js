// The event catalogue: every type Conduit accepts, the area it belongs to,
// the roles that may send it, and its current schema version.
//
// Roles: floor, stockroom, dock, manager. A manager may send anything the
// store is entitled to. Owner writes go through act-as and carry actor.owner.
//
// `payload` describes the required fields as { name: type }. Validation is
// deliberately simple so the same file runs on the device before queueing.

export const AREAS = ['floor', 'stockroom', 'backdock', 'store'];

const T = (area, roles, entity, payload = {}, v = 1) => ({ area, roles, entity, payload, v });

export const CATALOGUE = {
  // ── Floor ────────────────────────────────────────────────────────────
  'refresh.mark':        T('floor', ['floor'], ['shelf', 'week']),
  'refresh.unmark':      T('floor', ['floor'], ['shelf', 'week']),
  'refresh.focus.set':   T('floor', ['floor'], ['week'], { departments: 'array' }),
  'refresh.plan.paint':  T('floor', ['floor'], ['week'], { shelves: 'array' }),
  'label.check':         T('floor', ['floor'], ['micro', 'cycle'], { wrong: 'number' }),
  'label.variance':      T('floor', ['floor'], ['micro', 'cycle'], { keycode: 'string' }),
  'stocktake.start':     T('floor', ['floor'], ['session']),
  'stocktake.scan':      T('floor', ['floor'], ['session', 'shelf'], { keycode: 'string', qty: 'number' }),
  'stocktake.verify':    T('floor', ['floor'], ['session', 'shelf']),
  'stocktake.phase':     T('floor', ['floor'], ['session'], { phase: 'string' }),
  'issue.log':           T('floor', ['floor'], ['issue'], { title: 'string', priority: 'number' }),
  'issue.update':        T('floor', ['floor'], ['issue']),
  'issue.close':         T('floor', ['floor'], ['issue']),
  'asset.service':       T('floor', ['floor'], ['asset']),
  'asset.schedule':      T('floor', ['floor'], ['asset'], { due: 'string' }),
  'picklist.set':        T('floor', ['floor'], ['device'], { shelves: 'array' }),

  // ── Stockroom ────────────────────────────────────────────────────────
  'cage.create':         T('stockroom', ['stockroom'], ['cage'], { ring: 'string' }),
  'cage.scan':           T('stockroom', ['stockroom'], ['cage'], { keycode: 'string', qty: 'number' }),
  'cage.park':           T('stockroom', ['stockroom'], ['cage'], { location: 'string' }),
  'cage.sweep':          T('stockroom', ['stockroom'], ['cage']),
  'cage.close':          T('stockroom', ['stockroom'], ['cage']),
  'submission.open':     T('stockroom', ['stockroom'], ['bay', 'date']),
  'submission.update':   T('stockroom', ['stockroom'], ['bay', 'date'], { codes: 'object' }),
  'submission.ready':    T('stockroom', ['stockroom'], ['bay', 'date']),
  'submission.submit':   T('stockroom', ['stockroom'], ['bay', 'date']),
  'submission.request':  T('stockroom', ['stockroom'], ['bay', 'date']),
  'submission.reopen':   T('stockroom', ['stockroom'], ['bay', 'date']),
  'adjustment.set':      T('stockroom', ['stockroom'], ['keycode', 'date'], { evidence: 'string' }),
  'adjustment.remove':   T('stockroom', ['stockroom'], ['keycode', 'date']),
  'daylist.set':         T('stockroom', ['stockroom'], ['date'], { walkers: 'array' }),

  // ── Back dock ────────────────────────────────────────────────────────
  'truck.create':        T('backdock', ['dock'], ['truck']),
  'truck.setLive':       T('backdock', ['dock'], ['truck']),
  'truck.setGoal':       T('backdock', ['dock'], ['truck'], { goal: 'string' }),
  'truck.finalise':      T('backdock', ['manager'], ['truck']),
  'manifest.attach':     T('backdock', ['dock'], ['truck'], { manifest: 'string' }),
  'pallet.land':         T('backdock', ['dock'], ['truck', 'bay'], { kind: 'string', cartons: 'number' }),
  'pallet.update':       T('backdock', ['dock'], ['truck', 'bay']),
  'pallet.start':        T('backdock', ['dock'], ['truck', 'bay'], { crew: 'string' }),
  'pallet.pause':        T('backdock', ['dock'], ['truck', 'bay']),
  'pallet.resume':       T('backdock', ['dock'], ['truck', 'bay']),
  'pallet.done':         T('backdock', ['dock'], ['truck', 'bay'], { crew: 'string' }),
  'pallet.reopen':       T('backdock', ['dock'], ['truck', 'bay']),
  'pallet.remove':       T('backdock', ['dock'], ['truck', 'bay']),
  'pallet.scan':         T('backdock', ['dock'], ['truck', 'bay'], { carton: 'string' }),
  'halt.start':          T('backdock', ['dock'], ['truck'], { reason: 'string' }),
  'halt.end':            T('backdock', ['dock'], ['truck']),
  'plan.set':            T('backdock', ['dock'], ['date', 'slot'], { eta: 'string' }),
  'plan.remove':         T('backdock', ['dock'], ['date', 'slot']),

  // ── Store-wide ───────────────────────────────────────────────────────
  'map.publish':         T('store', ['manager'], ['version']),
  'roster.rotate':       T('store', ['manager'], []),
  'device.heartbeat':    T('store', ['floor', 'stockroom', 'dock', 'manager'], ['device'], { app: 'string' }),
};

export function typeInfo(type) {
  return CATALOGUE[type] || null;
}

// Which projection areas a store token may read, given its entitlements.
export const AREA_PROJECTIONS = {
  floor: ['refresh', 'labels', 'stocktake', 'issues', 'assets', 'picklists'],
  stockroom: ['cages', 'backfill', 'adjustments', 'daylist'],
  backdock: ['dock', 'plan'],
  store: ['devices'],
};
