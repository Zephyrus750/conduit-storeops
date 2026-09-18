// Shared reducers: the fold from events to state, used by the store object
// on the worker and by the client for optimistic updates. Same module, same
// shape, so the two can never disagree.
//
// apply(state, event) mutates state in place and returns null on success or
// { code, message } to reject the event. A reducer must validate before it
// mutates, so a rejected event leaves state untouched.
//
// Conflict rules (design doc, "Sync, conflicts and offline"):
//   - two devices mark the same shelf: both apply, first `at` wins, both recorded
//   - second pallet.land on an occupied bay: rejected bay_occupied
//   - second pallet.done: no-op, acknowledged; crew credit stays with the first
//   - reopen rule: a submit older than the last reopen cannot close the bay

export const STATE_VERSION = 1;

export function initialState() {
  return {
    v: STATE_VERSION,
    seq: 0,
    devices: {},              // device id → { app, last, role }
    dock: { trucks: {}, pallets: {} },
    cages: {},                // cage id → { ring, location, items, sweeps, status }
    refresh: {},              // week → shelf → { at, devices[] }
    backfill: {},             // `${bay}:${date}` → submission
  };
}

const REDUCERS = {
  // ── Store-wide ───────────────────────────────────────────────────────
  'device.heartbeat'(s, e) {
    s.devices[e.entity.device] = { app: e.payload.app, last: e.at, role: e.actor?.role || null };
    return null;
  },

  // ── Floor: location refresh ──────────────────────────────────────────
  'refresh.mark'(s, e) {
    const week = (s.refresh[e.entity.week] ||= {});
    const shelf = e.entity.shelf;
    const cur = week[shelf];
    const dev = e.actor?.device || 'unknown';
    if (!cur) { week[shelf] = { at: e.at, devices: [dev] }; return null; }
    if (!cur.devices.includes(dev)) cur.devices.push(dev);
    if (e.at < cur.at) cur.at = e.at;
    return null;
  },
  'refresh.unmark'(s, e) {
    const week = s.refresh[e.entity.week];
    if (week) delete week[e.entity.shelf];
    return null;
  },

  // ── Stockroom: cages ─────────────────────────────────────────────────
  'cage.create'(s, e) {
    const id = e.entity.cage;
    if (s.cages[id] && s.cages[id].status !== 'closed') return reject('cage_exists', `${id} is already open`);
    if (!RINGS.includes(e.payload.ring)) return reject('invalid_event', `ring must be one of ${RINGS.join(', ')}`);
    s.cages[id] = { ring: e.payload.ring, location: null, items: {}, sweeps: [], status: 'open', created: e.at, seen: e.at };
    return null;
  },
  'cage.scan'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.items[e.payload.keycode] = (c.items[e.payload.keycode] || 0) + e.payload.qty;
    if (c.items[e.payload.keycode] <= 0) delete c.items[e.payload.keycode];
    c.seen = e.at;
    return null;
  },
  'cage.park'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.location = e.payload.location; c.seen = e.at;
    return null;
  },
  'cage.sweep'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.sweeps.push({ at: e.at, device: e.actor?.device || null }); c.seen = e.at;
    return null;
  },
  'cage.close'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.status = 'closed'; c.closed = e.at;
    return null;
  },

  // ── Back dock: trucks and pallets ────────────────────────────────────
  'truck.create'(s, e) {
    const id = e.entity.truck;
    if (s.dock.trucks[id]) return reject('truck_exists', `${id} already exists`);
    s.dock.trucks[id] = { status: 'planned', live: false, goal: null, created: e.at, landed: 0, done: 0, halts: [] };
    return null;
  },
  'truck.setLive'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    t.live = true; t.status = 'live'; t.liveAt = t.liveAt || e.at;
    return null;
  },
  'truck.setGoal'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    t.goal = e.payload.goal;
    return null;
  },
  'pallet.land'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const key = palletKey(e);
    const cur = s.dock.pallets[key];
    if (cur && cur.state !== 'removed') return reject('bay_occupied', `bay ${e.entity.bay} already holds a pallet`);
    s.dock.pallets[key] = { truck: e.entity.truck, bay: e.entity.bay, kind: e.payload.kind, cartons: e.payload.cartons, carryover: !!e.payload.carryover, state: 'landed', landed: e.at, crew: null };
    t.landed += 1;
    return null;
  },
  'pallet.start'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.state === 'done') return null;
    p.state = 'active'; p.crew = e.payload.crew; p.started = p.started || e.at;
    return null;
  },
  'pallet.pause'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.state === 'active') p.state = 'paused';
    return null;
  },
  'pallet.resume'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.state === 'paused') p.state = 'active';
    return null;
  },
  'pallet.done'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.state === 'done') return null;            // second done: acknowledged no-op
    p.state = 'done'; p.done = e.at; p.crew = p.crew || e.payload.crew;
    s.dock.trucks[e.entity.truck].done += 1;
    return null;
  },
  'pallet.reopen'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.state !== 'done') return null;
    p.state = 'landed'; delete p.done;
    s.dock.trucks[e.entity.truck].done -= 1;
    return null;
  },
  'pallet.remove'(s, e) {
    const p = pallet(s, e); if (p.code) return p;
    if (p.state === 'removed') return null;
    if (p.state === 'done') s.dock.trucks[e.entity.truck].done -= 1;
    p.state = 'removed'; p.removed = e.at;
    s.dock.trucks[e.entity.truck].landed -= 1;
    return null;
  },
  'halt.start'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    if (t.halts.length && !t.halts[t.halts.length - 1].end) return null;
    t.halts.push({ start: e.at, reason: e.payload.reason });
    return null;
  },
  'halt.end'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    const h = t.halts[t.halts.length - 1];
    if (h && !h.end) h.end = e.at;
    return null;
  },
  'truck.finalise'(s, e) {
    const t = truck(s, e); if (t.code) return t;
    t.status = 'closed'; t.live = false; t.closed = e.at;
    return null;
  },

  // ── Stockroom: backfill submissions ──────────────────────────────────
  'submission.open'(s, e) {
    const k = subKey(e);
    if (!s.backfill[k]) s.backfill[k] = { bay: e.entity.bay, date: e.entity.date, codes: {}, status: 'pending', statusAt: e.at, reopenedAt: null };
    return null;
  },
  'submission.update'(s, e) {
    const sub = s.backfill[subKey(e)];
    if (!sub) return reject('not_found', 'submission is not open');
    Object.assign(sub.codes, e.payload.codes);           // per-code merge, codes are keyed
    return null;
  },
  'submission.ready'(s, e) { return setStatus(s, e, 'ready'); },
  'submission.submit'(s, e) {
    const sub = s.backfill[subKey(e)];
    if (!sub) return reject('not_found', 'submission is not open');
    if (sub.reopenedAt && e.at < sub.reopenedAt) return null;   // stale submit after a reopen: ignored
    return setStatus(s, e, 'submitted');
  },
  'submission.request'(s, e) { return setStatus(s, e, 'requested'); },
  'submission.reopen'(s, e) {
    const sub = s.backfill[subKey(e)];
    if (!sub) return reject('not_found', 'submission is not open');
    sub.status = 'pending'; sub.statusAt = e.at; sub.reopenedAt = e.at;
    return null;
  },
};

export const RINGS = ['new-lines', 'overstock', 'cant-work', 'online-picks'];

export function hasReducer(type) { return typeof REDUCERS[type] === 'function'; }

export function apply(state, event) {
  const r = REDUCERS[event.type];
  if (!r) return reject('not_implemented', `${event.type} has no reducer yet`);
  const res = r(state, event);
  if (res) return res;
  if (typeof event.seq === 'number') state.seq = event.seq;
  return null;
}

export function replay(state, events) {
  const rejected = [];
  for (const e of events) { const r = apply(state, e); if (r) rejected.push({ id: e.id, ...r }); }
  return rejected;
}

// ── helpers ────────────────────────────────────────────────────────────
function reject(code, message) { return { code, message }; }
function openCage(s, e) {
  const c = s.cages[e.entity.cage];
  if (!c || c.status === 'closed') return reject('not_found', `cage ${e.entity.cage} is not open`);
  return c;
}
function truck(s, e) {
  const t = s.dock.trucks[e.entity.truck];
  if (!t) return reject('not_found', `truck ${e.entity.truck} does not exist`);
  if (t.status === 'closed') return reject('truck_closed', `truck ${e.entity.truck} is finalised`);
  return t;
}
function palletKey(e) { return `${e.entity.truck}:${e.entity.bay}`; }
function pallet(s, e) {
  const t = truck(s, e); if (t.code) return t;
  const p = s.dock.pallets[palletKey(e)];
  if (!p || p.state === 'removed') return reject('not_found', `no pallet on bay ${e.entity.bay}`);
  return p;
}
function subKey(e) { return `${e.entity.bay}:${e.entity.date}`; }
function setStatus(s, e, status) {
  const sub = s.backfill[subKey(e)];
  if (!sub) return reject('not_found', 'submission is not open');
  if (e.at >= sub.statusAt) { sub.status = status; sub.statusAt = e.at; }   // status takes the later at
  return null;
}
