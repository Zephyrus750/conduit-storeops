// Stockroom reducers: cages, backfill submissions, negative-SOH adjustments,
// day list. Shapes follow K2B's worker docs (stockroom-review, stockroom-adjust,
// stockroom-scan), ported faithfully; cages are new and come from the design doc.
//
//   cages        cage → { ring, location, x, y, floor (parked on the map), items: keycode → qty, sweeps[], status,
//                created, seen, closed, log: [{ at, k, d, by }] (open, in, out, park, move, seen, found, missing, lost,
//                retag, close), missing: { since, n } | null, lost }
//   cageSweeps   current: { id, at, by, seen: cage → at, moved, found, open } | null, history: [summary] (last 20)
//   apnPairs     item barcode (GTIN, 13 or 14 digits) → { kc, at, by }
//   backfill     subs: `${bay}:${date}` → { bay, date, status, codes: code → { scanned }, incorrect: [],
//                system: [codes] | null, removed: code → at (tombstones), metrics, statusAt, reopenedAt, readyAt, submittedDoneAt, autoSubmitted,
//                devices: [device ids that scanned it] (a phone's "My locations"),
//                readd: code → { at, by, doneAt } (K2B's Re-add: stock found after the bay was finalised, scanned back in) }
//                requested: date → [bays]      claims: bay → { by, at }
//   adjustments  date → keycode → { qty (≤ 0, system SOH), counted (found, or null), name, location, confirmed, addedAt }
//   daylist      date → { walkers, excluded: [bays], source }
//   scanPresets  `${kind}:${W}x${H}` → { x, y, w, h (fractions of the shared screen), at, by }: the
//                screen scan's region for a screen size, store-wide (K2B's ss presets)
//   soh          snaps: date → { rows, locs, week, at, by } (the SOH report snapshots; the rows live on
//                the worker, published whole like a manifest), verify: date → `${keycode}|${loc}` → at
//
// Status enum is exactly pending | corrected | submitted ("Needs review",
// "Ready", "Submitted"). Requested locations are a separate list, not a status.

import { reject, badList, earlier } from './util.js';
import { backfillMetrics, scannedCodes } from '../backfill.js';
import { gs1Parse } from '../gs1.js';

export const RINGS = ['new-lines', 'overstock', 'cant-work', 'online-picks'];
export const SUBMISSION_STATUS = ['pending', 'corrected', 'submitted'];
export const DAYLIST_SOURCES = ['requested', 'snapshot', ''];
export const CAGE_LOG = 40;                     // activity entries kept per cage
export const SOH_KEEP = 26;                     // snapshots kept (about six months of weekly pastes)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUB_CODES_MAX = 1000, CODE_LEN = 20, CAGE_LINES_MAX = 500;   // per update and per bay; code length; lines in one cage

export function stockroomState() {
  return {
    cages: {},
    backfill: { subs: {}, requested: {}, claims: {} },
    adjustments: {},
    daylist: {},
    soh: { snaps: {}, verify: {} },
    scanPresets: {},
    cageSweeps: { current: null, history: [] },
    apnPairs: {},
  };
}

export const stockroomReducers = {
  // ── Cages ────────────────────────────────────────────────────────────
  // Each cage keeps a short log (its activity feed) and, when parked from the
  // map, where it stands (x, y, floor). A sweep session counts which cages
  // were seen; a cage seen somewhere other than where it was parked is moved
  // there; one not seen is missing, and lost after two sweeps in a row.
  'cage.create'(s, e) {
    const id = e.entity.cage;
    if (s.cages[id] && s.cages[id].status !== 'closed') return reject('cage_exists', `${id} is already open`);
    if (!RINGS.includes(e.payload.ring)) return reject('invalid_event', `ring must be one of ${RINGS.join(', ')}`);
    s.cages[id] = { ring: e.payload.ring, location: null, items: {}, sweeps: [], status: 'open', created: e.at, seen: e.at, log: [] };
    cageLog(s.cages[id], e, 'open', RINGS.includes(e.payload.ring) ? e.payload.ring : '');
    return null;
  },
  'cage.scan'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    const kc = e.payload.keycode;
    if (!/^\d{6,13}$/.test(kc)) return reject('invalid_event', 'keycode must be 6 to 13 digits');
    if (!Number.isInteger(e.payload.qty) || !e.payload.qty || Math.abs(e.payload.qty) > 9999) return reject('invalid_event', 'qty must be a whole number from -9999 to 9999, not 0');
    if (!c.items[kc] && Object.keys(c.items).length >= CAGE_LINES_MAX) return reject('invalid_event', `a cage holds at most ${CAGE_LINES_MAX} lines`);
    c.items[kc] = (c.items[kc] || 0) + e.payload.qty;
    if (c.items[kc] <= 0) delete c.items[kc];
    c.seen = e.at; cageLog(c, e, e.payload.qty < 0 ? 'out' : 'in', `${kc} ×${Math.abs(e.payload.qty)}${e.payload.apn ? ` (item barcode ${String(e.payload.apn).slice(0, 14)})` : ''}`);
    return null;
  },
  'cage.park'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    const p = e.payload, to = String(p.location).toUpperCase().slice(0, 40), from = c.location;
    const hasXY = Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
    c.location = to; c.seen = e.at;
    if (hasXY) { c.x = Math.round(Number(p.x) * 10) / 10; c.y = Math.round(Number(p.y) * 10) / 10; c.floor = p.floor ? String(p.floor).slice(0, 40) : null; }
    else if (from !== to) { delete c.x; delete c.y; delete c.floor; }
    cageLog(c, e, from && from !== to ? 'move' : 'park', from && from !== to ? `${from} → ${to}` : to);
    return null;
  },
  // payload.session: the sweep it belongs to; payload.location: where the
  // sweeper is standing, which moves the cage when it differs.
  'cage.sweep'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    const p = e.payload || {}, sw = s.cageSweeps?.current, inSession = sw && p.session === sw.id;
    if (p.session && !inSession) return reject('not_found', 'that sweep has finished: start a new one');
    const at = p.location ? String(p.location).toUpperCase().slice(0, 40) : null;
    c.sweeps.push({ at: e.at, device: e.actor?.device || null }); if (c.sweeps.length > 30) c.sweeps.splice(0, c.sweeps.length - 30);
    c.seen = e.at;
    if (c.missing || c.lost) { cageLog(c, e, 'found', at || c.location || ''); if (inSession && !sw.found.includes(e.entity.cage)) sw.found.push(e.entity.cage); }
    c.missing = null; c.lost = false;
    if (at && c.location && at !== c.location) {
      if (inSession) sw.moved.push({ id: e.entity.cage, from: c.location, to: at });
      cageLog(c, e, 'move', `${c.location} → ${at} (seen on a sweep)`); c.location = at; delete c.x; delete c.y; delete c.floor;
    } else { if (at && !c.location) c.location = at; cageLog(c, e, 'seen', at || c.location || ''); }
    if (inSession) sw.seen[e.entity.cage] = e.at;
    return null;
  },
  'cage.close'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    c.status = 'closed'; c.closed = e.at; cageLog(c, e, 'close', '');
    return null;
  },
  // A damaged or lost tag replaced: the cage carries on under its new tag.
  'cage.retag'(s, e) {
    const c = openCage(s, e); if (c.code) return c;
    const to = String(e.payload.to || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,24}$/.test(to)) return reject('invalid_event', 'a cage tag is 3 to 24 letters, digits or dashes');
    if (s.cages[to] && s.cages[to].status !== 'closed') return reject('cage_exists', `${to} is already an open cage`);
    cageLog(c, e, 'retag', `${e.entity.cage} → ${to}`);
    s.cages[to] = c; delete s.cages[e.entity.cage];
    return null;
  },
  'cage.sweepStart'(s, e) {
    const sw = (s.cageSweeps ||= { current: null, history: [] }), id = String(e.entity.sweep);
    if (sw.current && Date.parse(e.at) - Date.parse(sw.current.at) < 12 * 3600e3) return reject('sweep_open', `a sweep started at ${sw.current.at.slice(11, 16)} is still running: finish it first`);
    sw.current = { id, at: e.at, by: e.actor?.device || null, seen: {}, moved: [], found: [], open: Object.keys(s.cages).filter(k => s.cages[k].status === 'open').length };
    return null;
  },
  'cage.sweepEnd'(s, e) {
    const sw = (s.cageSweeps ||= { current: null, history: [] }), cur = sw.current;
    if (!cur || cur.id !== String(e.entity.sweep)) return reject('not_found', 'no sweep is running under that id');
    const missing = [], lost = [];
    for (const [id, c] of Object.entries(s.cages)) {
      if (c.status !== 'open' || cur.seen[id] || Date.parse(c.created) > Date.parse(cur.at)) continue;
      c.missing = { since: c.missing?.since || cur.at, n: (c.missing?.n || 0) + 1 }; missing.push(id);
      if (c.missing.n >= 2 && !c.lost) { c.lost = true; lost.push(id); cageLog(c, e, 'lost', `missed ${c.missing.n} sweeps`); } else if (!c.lost) cageLog(c, e, 'missing', 'not seen on the sweep');
    }
    sw.history.push({ id: cur.id, at: cur.at, ended: e.at, by: cur.by, seen: Object.keys(cur.seen).length, total: Object.values(s.cages).filter(c => c.status === 'open').length, moved: cur.moved, found: cur.found, missing, lost });
    if (sw.history.length > 20) sw.history.splice(0, sw.history.length - 20);
    sw.current = null;
    return null;
  },
  // An item barcode (EAN / UPC / GTIN) paired with its keycode, so the next
  // scan of that barcode onto a cage needs no keycode.
  'cage.pair'(s, e) {
    const g = gs1Parse(e.entity.apn), kc = String(e.payload.keycode || '');
    if (!g?.gtin) return reject('invalid_event', 'that is not a valid item barcode (UPC-A, EAN-13 or GTIN-14)');
    if (!/^\d{6,8}$/.test(kc)) return reject('invalid_event', 'keycode must be 6 to 8 digits');
    (s.apnPairs ||= {})[g.gtin] = { kc, at: e.at, by: e.actor?.device || null };
    return null;
  },

  // ── Backfill submissions ─────────────────────────────────────────────
  'submission.open'(s, e) {
    const k = subKey(e);
    if (!s.backfill.subs[k]) s.backfill.subs[k] = newSub(bay(e), e.entity.date);
    return null;
  },
  // codes: { code: scanned }, merged per code; remove: [codes]; incorrect: [codes] (replaces the list);
  // sent: the phone finished the bay ("Send to review"). A new scan clears it.
  // A scan the bay did not have, landing on a Ready or Submitted bay (a
  // phone's late or queued scan), puts it back in review, as K2B did: its
  // metrics are cleared and worked out again when it is readied.
  // A removed code leaves a tombstone (K2B's removedCodes): a scan made
  // before the removal (a phone's queued scan landing late) cannot bring it
  // back; a scan made after it can. An update that only carries such stale
  // codes is refused so the phone hears the reviewer removed them.
  'submission.update'(s, e) {
    const cur = s.backfill.subs[subKey(e)];
    const p = e.payload;
    const tomb = cur?.removed || {};
    const incoming = p.codes && typeof p.codes === 'object' ? Object.entries(p.codes) : [];
    // Sizes first, so a refused update leaves the bay as it was.
    if (incoming.length > SUB_CODES_MAX) return reject('invalid_event', `one update carries at most ${SUB_CODES_MAX} codes`);
    if (incoming.some(([code]) => !code || code.length > CODE_LEN)) return reject('invalid_event', `a code is 1 to ${CODE_LEN} characters`);
    for (const k of ['remove', 'incorrect']) if (p[k] !== undefined) { const no = badList(p[k], k, SUB_CODES_MAX, CODE_LEN); if (no) return reject('invalid_event', no); }
    if (cur && Object.keys(cur.codes).length + incoming.filter(([code]) => !cur.codes[code]).length > SUB_CODES_MAX) return reject('invalid_event', `a bay holds at most ${SUB_CODES_MAX} codes`);
    const stale = incoming.filter(([code]) => !cur?.codes[code] && tomb[code] && Date.parse(e.at) <= Date.parse(tomb[code])).map(([code]) => code);
    if (stale.length && stale.length === incoming.length && !(Array.isArray(p.remove) && p.remove.length) && !Array.isArray(p.incorrect)) {
      return reject('removed_by_reviewer', `${stale.join(', ')} ${stale.length === 1 ? 'was' : 'were'} removed by the reviewer`);
    }
    if (!cur && !incoming.length) return reject('not_found', 'submission is not open');   // "sent" or a desk edit never brings back a deleted bay
    if (cur?.trimmed) return reject('record_trimmed', `${cur.bay} on ${cur.date} is older than two weeks and can't change`);
    const sub = cur || (s.backfill.subs[subKey(e)] = newSub(bay(e), e.entity.date));
    const dev = e.actor?.device;
    const fresh = incoming.filter(([code, v]) => v && !stale.includes(code) && !sub.codes[code]?.scanned);
    if (fresh.length && sub.status !== 'pending') { sub.status = 'pending'; sub.statusAt = e.at; sub.reopenedAt = e.at; sub.autoSubmitted = false; sub.metrics = null; sub.lateScans = (sub.lateScans || 0) + fresh.length; }
    if (fresh.length) sub.sentAt = null;
    if (e.payload.sent === true) sub.sentAt = e.at;
    if (dev && incoming.some(([, v]) => v)) { sub.devices ||= []; if (!sub.devices.includes(dev)) sub.devices.push(dev); }
    for (const [code, scanned] of incoming) {
      if (stale.includes(code)) continue;
      sub.codes[code] = { scanned: !!scanned };
      if (sub.removed) delete sub.removed[code];
    }
    if (Array.isArray(p.remove)) for (const code of p.remove) { const c = String(code); delete sub.codes[c]; (sub.removed ||= {})[c] = e.at; }
    if (Array.isArray(p.incorrect)) sub.incorrect = [...new Set(p.incorrect.map(String))];
    sub.updatedAt = e.at;
    return null;
  },
  // payload.metrics is honoured when present (the K2B importer carries the
  // metrics the legacy desk computed); otherwise they come from the codes and
  // payload.system, the pasted report's list for the bay.
  'submission.ready'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    if (earlier(e.at, sub.statusAt)) return null;
    sub.status = 'corrected'; sub.statusAt = e.at; sub.readyAt = sub.readyAt || e.at;
    if (Array.isArray(e.payload?.system)) sub.system = [...new Set(e.payload.system.map(String))];
    const m = e.payload?.metrics;
    sub.metrics = m && typeof m === 'object' ? { expected: numOrNull(m.expected), scanned: Number(m.scanned) || 0, match: numOrNull(m.match), accuracy: numOrNull(m.accuracy), incorrect: Number(m.incorrect) || 0 } : metrics(sub);
    return null;
  },
  'submission.submit'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    if (sub.reopenedAt && earlier(e.at, sub.reopenedAt)) return null;    // stale submit after a reopen: ignored
    if (sub.status === 'submitted') return null;
    sub.status = 'submitted'; sub.statusAt = e.at; sub.submittedDoneAt = e.at;
    sub.autoSubmitted = !!e.payload.auto; sub.metrics = sub.metrics || metrics(sub);   // submit never rewrites what ready recorded
    delete s.backfill.claims[sub.bay];
    return null;
  },
  'submission.reopen'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    if (sub.trimmed) return reject('record_trimmed', `${sub.bay} on ${sub.date} is older than two weeks: its code list was trimmed, so it can't go back into review`);
    sub.status = 'pending'; sub.statusAt = e.at; sub.reopenedAt = e.at; sub.autoSubmitted = false;
    return null;
  },
  'submission.rename'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    const to = String(e.payload.newBay).toUpperCase();
    const toKey = `${to}:${e.entity.date}`;
    if (s.backfill.subs[toKey]) return reject('bay_taken', `bay ${to} already has a submission for ${e.entity.date}`);
    delete s.backfill.subs[subKey(e)];
    sub.bay = to; s.backfill.subs[toKey] = sub;
    if (s.backfill.claims[bay(e)]) { s.backfill.claims[to] = s.backfill.claims[bay(e)]; delete s.backfill.claims[bay(e)]; }
    return null;
  },
  'submission.delete'(s, e) {
    delete s.backfill.subs[subKey(e)];
    delete s.backfill.claims[bay(e)];
    return null;
  },
  // Re-add (K2B's scan-back): an item found on the shelf after the bay was
  // finalised on the PDT is tagged to the bay, then scanned back in on the
  // PDT and ticked off (payload.done). Tagging needs the bay on the board.
  'submission.readd'(s, e) {
    const sub = sub_(s, e); if (sub.code) return sub;
    const code = String(e.payload.code || '');
    if (!/^\d{6,13}$/.test(code)) return reject('invalid_event', 'code must be a keycode or item barcode');
    const r = sub.readd || {};
    if (e.payload.done) {
      if (!r[code]) return reject('not_found', `${code} is not tagged to ${sub.bay}`);
      if (r[code].doneAt) return reject('invalid_event', `${code} is already scanned back in`);
      r[code].doneAt = e.at; return null;
    }
    if (r[code]) return reject('invalid_event', `${code} is already tagged to ${sub.bay}`);
    (sub.readd ||= {})[code] = { at: e.at, by: e.actor?.device || null, doneAt: null };
    return null;
  },
  'submission.request'(s, e) {
    const list = (s.backfill.requested[e.entity.date] ||= []);
    const b = bay(e);
    if (e.payload.remove) { const i = list.indexOf(b); if (i >= 0) list.splice(i, 1); }
    else if (!list.includes(b)) list.push(b);
    return null;
  },
  'submission.claim'(s, e) {
    const b = bay(e), by = e.actor?.device || 'unknown';
    if (e.payload.release) { if (s.backfill.claims[b]?.by === by) delete s.backfill.claims[b]; return null; }
    const cur = s.backfill.claims[b];
    if (cur && cur.by !== by) return reject('claimed', `bay ${b} is being reviewed by another device`);
    s.backfill.claims[b] = { by, at: e.at };
    return null;
  },

  // ── Negative SOH adjustments ─────────────────────────────────────────
  'adjustment.set'(s, e) {
    const kc = String(e.entity.keycode);
    if (!/^\d{6,13}$/.test(kc)) return reject('invalid_event', 'keycode must be 6 to 13 digits');
    const day = (s.adjustments[e.entity.date] ||= {});
    const p = e.payload;
    const loc = p.location ? String(p.location).toUpperCase() : '';
    // qty is the system SOH from the report (stored ≤ 0); counted is what the
    // person found on the shelf, kept as evidence when the phone sends it.
    const counted = Number.isFinite(p.counted) ? Math.max(0, Math.round(p.counted)) : (day[kc]?.counted ?? null);
    day[kc] = { qty: -Math.abs(p.qty), ...(counted != null ? { counted } : {}), name: p.name || day[kc]?.name || '', location: loc, confirmed: !!p.confirmed, addedAt: e.at };
    return null;
  },
  'adjustment.remove'(s, e) {
    const day = s.adjustments[e.entity.date];
    if (day) delete day[String(e.entity.keycode)];
    return null;
  },

  // ── Day list ─────────────────────────────────────────────────────────
  // ── Screen scan: a store-wide region for one screen size ─────────────
  'scan.preset'(s, e) {
    const size = String(e.entity.size || ''), kind = e.payload.kind === 'rows' ? 'rows' : 'codes';
    if (!/^\d{3,5}x\d{3,5}$/.test(size)) return reject('invalid_event', 'size must be WIDTHxHEIGHT');
    const key = `${kind}:${size}`;
    if (e.payload.remove) { if (s.scanPresets) delete s.scanPresets[key]; return null; }
    const f = ['x', 'y', 'w', 'h'].map(k => Number(e.payload[k]));
    if (f.some(v => !Number.isFinite(v) || v < 0 || v > 1) || f[2] < 0.01 || f[3] < 0.01 || f[0] + f[2] > 1.0001 || f[1] + f[3] > 1.0001) return reject('invalid_event', 'the region must lie inside the screen (fractions 0 to 1)');
    (s.scanPresets ||= {})[key] = { x: f[0], y: f[1], w: f[2], h: f[3], at: e.at, by: e.actor?.device || null };
    return null;
  },

  // ── SOH snapshots (the worker emits soh.publish when it stores one) ───
  'soh.publish'(s, e) {
    const d = String(e.entity.date); if (!DAY_RE.test(d)) return reject('invalid_event', 'date must be YYYY-MM-DD');
    const p = e.payload || {}, soh = (s.soh ||= { snaps: {}, verify: {} });
    soh.snaps[d] = { rows: Number(p.rows) || 0, locs: Number(p.locs) || 0, week: String(p.week || '').slice(0, 9), at: e.at, by: e.actor?.device || null };
    const keep = Object.keys(soh.snaps).sort().slice(-SOH_KEEP);
    for (const k of Object.keys(soh.snaps)) if (!keep.includes(k)) { delete soh.snaps[k]; delete soh.verify[k]; }
    return null;
  },
  'soh.remove'(s, e) {
    const d = String(e.entity.date), soh = (s.soh ||= { snaps: {}, verify: {} });
    if (!soh.snaps[d]) return reject('not_found', `no SOH snapshot for ${d}`);
    delete soh.snaps[d]; delete soh.verify[d];
    return null;
  },
  // A count checked on the walk (K2B's verify tick); payload.done false clears it.
  'soh.verify'(s, e) {
    const d = String(e.entity.date), kc = String(e.entity.keycode), soh = (s.soh ||= { snaps: {}, verify: {} });
    if (!soh.snaps[d]) return reject('not_found', `no SOH snapshot for ${d}`);
    if (!/^\d{6,8}$/.test(kc)) return reject('invalid_event', 'keycode must be 6 to 8 digits');
    const loc = String(e.payload.loc);
    if (!loc || loc.length > 40) return reject('invalid_event', 'loc is 1 to 40 characters');
    const key = `${kc}|${loc}`, v = (soh.verify[d] ||= {});
    if (e.payload.done === false) delete v[key]; else v[key] = e.at;
    return null;
  },
  'daylist.set'(s, e) {
    const w = e.payload.walkers;
    if (!(Number.isInteger(w) && w >= 1 && w <= 4)) return reject('invalid_event', 'walkers must be 1..4');
    const src = e.payload.source ?? '';
    if (!DAYLIST_SOURCES.includes(src)) return reject('invalid_event', 'source must be requested, snapshot or empty');
    if (e.payload.excluded !== undefined) { const no = badList(e.payload.excluded, 'excluded', 500, 24); if (no) return reject('invalid_event', no); }
    s.daylist[e.entity.date] = { walkers: w, excluded: Array.isArray(e.payload.excluded) ? e.payload.excluded.map(x => String(x).toUpperCase()) : [], source: src, at: e.at };
    return null;
  },
};

// ── helpers ────────────────────────────────────────────────────────────
function cageLog(c, e, k, d) { const l = (c.log ||= []); l.push({ at: e.at, k, d: String(d || '').slice(0, 80), by: e.actor?.device || null }); if (l.length > CAGE_LOG) l.splice(0, l.length - CAGE_LOG); }
function openCage(s, e) {
  const c = s.cages[e.entity.cage];
  if (!c || c.status === 'closed') return reject('not_found', `cage ${e.entity.cage} is not open`);
  return c;
}
function bay(e) { return String(e.entity.bay).toUpperCase(); }
function subKey(e) { return `${bay(e)}:${e.entity.date}`; }
function newSub(bayNo, date) {
  return { bay: bayNo, date, status: 'pending', codes: {}, incorrect: [], metrics: null, system: null, statusAt: '', reopenedAt: null, readyAt: null, submittedDoneAt: null, autoSubmitted: false, updatedAt: null };
}
function sub_(s, e) {
  const sub = s.backfill.subs[subKey(e)];
  if (!sub) return reject('not_found', 'submission is not open');
  return sub;
}
// With no report list the bay is unscored, as K2B left it: its scans count
// but expected, match and accuracy are null, and averages leave it out
// (scoring it against its own scans read as 100%, or 0% when empty). Older
// events that merged the report's codes as system-only, with no list on the
// ready, still score against every code on the submission.
export function metrics(sub) {
  const scanned = scannedCodes(sub);
  if (!sub.system && !Object.values(sub.codes || {}).some(c => !c.scanned)) return { expected: null, scanned: scanned.length, match: null, accuracy: null, incorrect: (sub.incorrect || []).length };
  return backfillMetrics(scanned, sub.system || Object.keys(sub.codes), sub.incorrect);
}
const numOrNull = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
