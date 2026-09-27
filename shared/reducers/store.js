// Store-wide reducers: devices, published map version, roster rotation marker,
// the store's settings and suggested map edits. Credentials themselves live in the registry
// object; the events here are the audit trail the store's projections can show.

import { reject } from './util.js';
import { DEFAULT_TZ } from '../time.js';

// Store settings: null means "the default", so a store that never set one
// follows the defaults as they are now. A manager changes them from Settings.
//   tz            IANA zone the store's day, week and rollover follow
//   dockGrid      { rows 1–8, cols 1–12 } for trucks created afterwards
//   minsPerCarton the dock's standard rate for auto estimates on new trucks
//   autoLockMins  idle minutes before a device drops its area and manager
//                 codes (0 = never; legacy DV locked after 5–60)
export const SETTINGS_DEFAULTS = { tz: DEFAULT_TZ, dockGrid: { rows: 4, cols: 7 }, minsPerCarton: 0.5, autoLockMins: 0 };
export const AUTO_LOCK_CHOICES = [0, 5, 10, 15, 30, 60, 120];
export function settingsState() { return { tz: null, dockGrid: null, minsPerCarton: null, autoLockMins: null, at: null, by: null }; }
// The effective settings: stored values over the defaults. Takes the whole
// state or the settings projection alone.
export function settingsOf(x) {
  const s = x?.settings !== undefined ? x.settings : x;
  const out = {};
  for (const k of Object.keys(SETTINGS_DEFAULTS)) out[k] = s?.[k] ?? SETTINGS_DEFAULTS[k];
  return out;
}

const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
function validTz(tz) {
  if (typeof tz !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-AU', { timeZone: tz }); return true; } catch { return false; }
}
// Each setting: (value) → { v: normalised value }, or a string saying what is wrong.
const SETTING = {
  tz: v => validTz(v) ? { v } : 'tz must be an IANA time zone such as Australia/Perth',
  dockGrid: v => v && typeof v === 'object' && isInt(v.rows, 1, 8) && isInt(v.cols, 1, 12) ? { v: { rows: v.rows, cols: v.cols } } : 'dockGrid needs rows 1 to 8 and cols 1 to 12',
  minsPerCarton: v => typeof v === 'number' && v >= 0.05 && v <= 10 ? { v: Math.round(v * 100) / 100 } : 'minsPerCarton must be between 0.05 and 10',
  autoLockMins: v => AUTO_LOCK_CHOICES.includes(v) ? { v } : `autoLockMins must be one of ${AUTO_LOCK_CHOICES.join(', ')}`,
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function storeState() {
  return {
    devices: {},                       // device → { app, last, role }
    map: { version: null, at: null, by: null },
    roster: { rotatedAt: null, rotatedBy: null },
    settings: settingsState(),
    mapedits: {},                      // id → suggestion (see map.edit.suggest)
  };
}

// Suggested map edits: anyone in the store can suggest renaming a shelf or
// flag something wrong with it. A suggestion never changes the map: the
// owner makes the change in the map editor, publishes a new version and
// marks the suggestion accepted (or declined). Resolved ones are capped.
export const MAP_EDIT_KINDS = ['rename', 'flag'];
const EDITS_KEPT = 300;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const storeReducers = {
  'device.heartbeat'(s, e) {
    s.devices[e.entity.device] = { app: e.payload.app, last: e.at, role: e.actor?.role || null };
    return null;
  },
  'map.publish'(s, e) {
    s.map = { version: String(e.entity.version), at: e.at, by: e.actor?.device || null };
    return null;
  },
  'roster.rotate'(s, e) {
    s.roster = { rotatedAt: e.at, rotatedBy: e.actor?.device || null };
    return null;
  },
  'map.edit.suggest'(s, e) {
    const id = String(e.entity.edit), p = e.payload;
    if (!/^[\w-]{4,40}$/.test(id)) return reject('invalid_event', 'edit id must be 4 to 40 letters, digits or dashes');
    const edits = (s.mapedits ||= {});
    if (edits[id]) return reject('exists', `suggestion ${id} already exists`);
    if (!MAP_EDIT_KINDS.includes(p.kind)) return reject('invalid_event', `kind must be ${MAP_EDIT_KINDS.join(' or ')}`);
    const shelf = text(p.shelf, 40).toUpperCase(), to = text(p.to, 40), note = text(p.note, 300);
    if (!shelf) return reject('invalid_event', 'which shelf?');
    if (p.kind === 'rename' && !to) return reject('invalid_event', 'a rename needs the new name');
    if (p.kind === 'flag' && !note) return reject('invalid_event', 'a flag needs a note saying what is wrong');
    edits[id] = { shelf, kind: p.kind, to: p.kind === 'rename' ? to : null, note, floor: p.floor ? text(p.floor, 40) : null, at: e.at, by: e.actor?.device || null, status: 'open', resolvedAt: null, resolvedBy: null, reply: '' };
    const done = Object.entries(edits).filter(([, x]) => x.status !== 'open').sort((a, b) => (a[1].resolvedAt < b[1].resolvedAt ? -1 : 1));
    for (const [k] of done.slice(0, Math.max(0, done.length - EDITS_KEPT))) delete edits[k];
    return null;
  },
  'map.edit.resolve'(s, e) {
    const x = s.mapedits?.[String(e.entity.edit)];
    if (!x) return reject('not_found', `no suggestion ${e.entity.edit}`);
    if (!['accepted', 'declined'].includes(e.payload.status)) return reject('invalid_event', 'status must be accepted or declined');
    if (x.status !== 'open') return reject('invalid_event', `that suggestion was already ${x.status}`);
    Object.assign(x, { status: e.payload.status, resolvedAt: e.at, resolvedBy: e.actor?.owner ? 'owner' : e.actor?.device || null, reply: text(e.payload.note, 300) });
    return null;
  },
  // Validated whole before anything changes; a set that changes nothing is
  // refused so the log only holds changes.
  'store.settings.set'(s, e) {
    const cur = s.settings || settingsState(), next = { ...cur }, keys = Object.keys(e.payload || {});
    if (!keys.length) return reject('invalid_event', 'no settings given');
    for (const k of keys) {
      if (!SETTING[k]) return reject('invalid_event', `unknown setting ${k}`);
      const v = e.payload[k];
      if (v === null) { next[k] = null; continue; }
      const n = SETTING[k](v);
      if (typeof n === 'string') return reject('invalid_event', n);
      next[k] = same(n.v, SETTINGS_DEFAULTS[k]) ? null : n.v;
    }
    if (keys.every(k => same(next[k], cur[k]))) return reject('invalid_event', 'no setting changed');
    s.settings = { ...next, at: e.at, by: e.actor?.device || null };
    return null;
  },
};
