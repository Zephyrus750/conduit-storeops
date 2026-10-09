// Store-wide reducers: published map version, roster rotation marker, the
// store's settings and suggested map edits. Credentials themselves live in the
// registry object; the events here are the audit trail the store's
// projections can show. Device presence (state.devices) is a projection too,
// but written directly from the socket 'hb' frame or POST /hb, never logged:
// see StoreObject.recordHb.

import { reject } from './util.js';
import { DEFAULT_TZ } from '../time.js';
import { retain } from '../retain.js';
import { TOOL_IDS } from '../tools.js';

// Store settings: null means "the default", so a store that never set one
// follows the defaults as they are now. A manager changes them from Settings.
//   tz            IANA zone the store's day, week and rollover follow
//   dockGrid      { rows 1–8, cols 1–12 } for trucks created afterwards
//   minsPerCarton the dock's standard rate for auto estimates on new trucks
//   autoLockMins  idle minutes before a device drops its area and manager
//                 codes (0 = never; legacy DV locked after 5–60)
//   deptRanges    stockroom bay ranges → department: [{ from, to, dept }]
//                 (K2B's deptmap; the narrowest range holding a bay wins)
export const SETTINGS_DEFAULTS = { tz: DEFAULT_TZ, dockGrid: { rows: 4, cols: 7 }, minsPerCarton: 0.5, autoLockMins: 0, deptRanges: [] };
export const AUTO_LOCK_CHOICES = [0, 5, 10, 15, 30, 60, 120];
export function settingsState() { return { tz: null, dockGrid: null, minsPerCarton: null, autoLockMins: null, deptRanges: null, at: null, by: null }; }
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
  deptRanges: v => {
    if (!Array.isArray(v) || v.length > 200) return 'deptRanges must be a list of up to 200 ranges';
    const out = [];
    for (const r of v) {
      const from = Number(r?.from), to = Number(r?.to), dept = String(r?.dept ?? '').trim().toLowerCase();
      if (!isInt(from, 0, 999999) || !isInt(to, from, 999999) || !/^[a-z0-9]{1,12}$/.test(dept)) return 'each range needs from ≤ to (numbers) and a department code';
      out.push({ from, to, dept });
    }
    return { v: out.sort((a, b) => a.from - b.from || a.to - b.to) };
  },
};
// The department a stockroom bay belongs to: its first 3+ digit number in
// the narrowest range that holds it (K2B's getDeptForLocation).
export function deptForBay(ranges, bay) {
  const m = /\d{3,}/.exec(String(bay || '')); if (!m) return null;
  const n = Number(m[0]); let best = null;
  for (const r of ranges || []) if (n >= r.from && n <= r.to && (!best || r.to - r.from < best.to - best.from)) best = r;
  return best ? best.dept : null;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const MESSAGE_MAX = 600, BRIEFING_MAX = 1500, BRIEFINGS_KEPT = 14;
// Plain text only: control characters out (line breaks kept), at most two
// blank lines in a row, trimmed and capped.
export function cleanComms(v, max) {
  return String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
export function storeState() {
  return {
    devices: {},                       // device → { app, last, role }
    map: { version: null, at: null, by: null },
    roster: { rotatedAt: null, rotatedBy: null },
    settings: settingsState(),
    mapedits: {},                      // id → suggestion (see map.edit.suggest)
    feedback: [],                      // newest last, capped (see feedback.send)
    tools: { off: [], at: null },      // tools the owner switched off (see store.tools.set)
    areas: { on: null, at: null },
    comms: { message: null, briefings: {} },   // team message and daily briefings (team.message.set, team.briefing.set)     // the areas the store is entitled to, once the owner changes them (store.areas.set)
    retention: null,                   // the last nightly store.retain: { day, at, done }
  };
}

// Suggested map edits: anyone in the store can suggest renaming a shelf or
// flag something wrong with it. A suggestion never changes the map: the
// owner makes the change in the map editor, publishes a new version and
// marks the suggestion accepted (or declined). Resolved ones are capped.
export const MAP_EDIT_KINDS = ['rename', 'flag'];
const EDITS_KEPT = 300;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Feedback from Settings › Feedback and report: what happened, the view, the
// version and a diagnostics summary, for the owner. Kept to the newest 200.
export const FEEDBACK_KINDS = ['wrong', 'idea', 'question', 'other'];
const FEEDBACK_KEPT = 200;

export const storeReducers = {
  'feedback.send'(s, e) {
    const p = e.payload, kind = FEEDBACK_KINDS.includes(p.kind) ? p.kind : null;
    if (!kind) return reject('invalid_event', `kind must be one of ${FEEDBACK_KINDS.join(', ')}`);
    const body = String(p.text ?? '').trim().slice(0, 2000);
    if (!body) return reject('invalid_event', 'say what happened');
    const list = (s.feedback ||= []);
    if (list.some(f => f.id === e.entity.note)) return reject('exists', 'that feedback was already sent');
    list.push({ id: String(e.entity.note).slice(0, 40), kind, text: body, view: text(p.view, 40), version: text(p.version, 20), diag: text(p.diag, 2000), at: e.at, by: e.actor?.device || null, role: e.actor?.role || null });
    if (list.length > FEEDBACK_KEPT) list.splice(0, list.length - FEEDBACK_KEPT);
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
  // The tools the owner switched off for this store (shared/tools.js). Only
  // the owner: the worker logs it from the console's Access tab.
  // Nightly retention (decision 29), logged by the worker at store midnight
  // with the store day: every device trims the same way (shared/retain.js).
  'store.retain'(s, e) {
    const day = String(e.payload.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return reject('invalid_event', 'day must be YYYY-MM-DD');
    const done = retain(s, day);
    s.retention = { day, at: e.at, done };
    return null;
  },
  // The owner switched an area on or off in the console. The worker logs it
  // here so the store object and every device apply it at once, not when
  // each device's token next renews (decision 19).
  'store.areas.set'(s, e) {
    const on = Array.isArray(e.payload.on) ? [...new Set(e.payload.on.map(String))].sort() : null;
    if (!on || on.some(a => !['floor', 'stockroom', 'backdock'].includes(a))) return reject('invalid_event', 'on must list floor, stockroom or backdock');
    if (s.areas?.on && JSON.stringify(s.areas.on) === JSON.stringify(on)) return reject('unchanged', 'those areas are already the ones on');
    s.areas = { on, at: e.at };
    return null;
  },
  // Team communication (decision 20: managers and the owner publish). Plain
  // text, cleaned here so every device holds the same; the shell renders
  // **bold** and "- " lists after escaping. An empty text clears it.
  'team.message.set'(s, e) {
    const text = cleanComms(e.payload.text, MESSAGE_MAX), until = e.payload.until ?? null;
    if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(until))) return reject('invalid_event', 'until is a date, YYYY-MM-DD');
    const c = (s.comms ||= { message: null, briefings: {} });
    if (!text && !c.message) return reject('unchanged', 'there is no team message to clear');
    c.message = text ? { text, until, at: e.at, by: e.actor?.device || null, owner: !!e.actor?.owner } : null;
    return null;
  },
  'team.briefing.set'(s, e) {
    const d = String(e.entity.date); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return reject('invalid_event', 'date is YYYY-MM-DD');
    const text = cleanComms(e.payload.text, BRIEFING_MAX), c = (s.comms ||= { message: null, briefings: {} });
    if (!text && !c.briefings[d]) return reject('unchanged', `there is no briefing for ${d} to clear`);
    if (text) c.briefings[d] = { text, at: e.at, by: e.actor?.device || null, owner: !!e.actor?.owner }; else delete c.briefings[d];
    const keep = Object.keys(c.briefings).sort().slice(-BRIEFINGS_KEPT); for (const k of Object.keys(c.briefings)) if (!keep.includes(k)) delete c.briefings[k];
    return null;
  },
  'store.tools.set'(s, e) {
    if (!e.actor?.owner) return reject('unauthorised', 'only the owner switches tools on and off');
    const off = Array.isArray(e.payload.off) ? [...new Set(e.payload.off.map(String))] : null;
    if (!off) return reject('invalid_event', 'off must be a list of tool ids');
    const bad = off.find(id => !TOOL_IDS.includes(id)); if (bad) return reject('invalid_event', `unknown tool ${bad}`);
    // Nothing silent, nothing empty: the same list again is not logged.
    if (JSON.stringify(off.sort()) === JSON.stringify(s.tools?.off || [])) return reject('unchanged', 'those tools are already the ones off');
    s.tools = { off, at: e.at };
    return null;
  },
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
