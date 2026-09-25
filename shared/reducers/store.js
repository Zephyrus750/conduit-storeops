// Store-wide reducers: devices, published map version, roster rotation marker
// and the store's settings. Credentials themselves live in the registry
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
  };
}

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
