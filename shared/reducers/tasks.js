// Tasks (11 Nov 2026, the owner's note on the store walk): the checklists
// the managers keep, and each day's walk of them. A checklist names its
// area (the store, the back dock, the stockroom or a department), who it is
// for (a role or a person, as the store writes it), the days it is due with
// an optional time, and its items, one line each. Each checklist due today
// is walked once that day, on a manager's phone: every item ✓ or ✗, a ✗
// with a note, a photo and where it went (a bay's backfill list, a
// Maintenance issue, or noted on the walk). Floor events, managers only, so
// every store device holds the lists and the PC sees a walk as it is sent.
//
//   tasks.lists id → {
//     id, name, area: store | backdock | stockroom | dept, dept (a department code when area is dept),
//     who, days [1..7, Monday first], due 'HH:MM' | '', items [{ id, t }],
//     added, by, updated, removed: { at, by } | null
//   }
//   tasks.walks `${list}:${day}` → {
//     list, day, name, area, dept, who, due, items [{ id, t }] (the checklist as it was when the walk started),
//     started, by, done (at) | null,
//     answers item id → { a: y | n, at, by, note?, photo?, sent?: { to: backfill, bay, kc? } | { to: issue, issue } | { to: note } },
//     trimmed?, n?: { of, y, n } (a walk older than KEEP_DETAIL_DAYS keeps only its ✗ and photographed answers)
//   }
//
// Rules: a walk is its checklist's walk on one store day and starts on that
// day; an answer may be changed (a correction is a new event) until and after
// the walk is done; where a ✗ went stays with the item once sent (the bay's
// request or the issue is already out there); the walk is done once every
// item is answered, and a second done is a no-op.

import { reject } from './util.js';
import { storeDay, DEFAULT_TZ } from '../time.js';
import { isKeycode } from '../keycode.js';

export const TASK_AREAS = ['store', 'backdock', 'stockroom', 'dept'];
export const SENT_TO = ['backfill', 'issue', 'note'];
export const LIST_CAP = 60, ITEMS_MAX = 40, KEEP_WALK_DAYS = 90;
const LEN = { name: 60, who: 60, item: 120, note: 300, bay: 20 };
const ID_RE = /^[a-z0-9]{1,16}$/i, DEPT_RE = /^[a-z0-9]{1,12}$/, DAY_RE = /^\d{4}-\d{2}-\d{2}$/, DUE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHOTO_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const who = e => String(e.actor?.device || 'unknown');
const T = s => (s.tasks ||= { lists: {}, walks: {} });

export function tasksState() {
  return { tasks: { lists: {}, walks: {} } };
}

// The walk's key, and the ISO weekday (1 Monday … 7 Sunday) of a store day.
export const walkKey = (list, day) => `${list}:${day}`;
export const isoDow = day => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d || 7; };
// A checklist is due on a day when its days include that weekday.
export const dueOn = (list, day) => !list.removed && (list.days || []).includes(isoDow(day));

// The checklist a manager wrote, checked whole; null fields are refused.
function listFields(p) {
  const name = clean(p.name, LEN.name);
  if (!name) return reject('invalid_event', 'a checklist needs a name');
  if (!TASK_AREAS.includes(p.area)) return reject('invalid_event', `area is one of ${TASK_AREAS.join(', ')}`);
  const dept = p.area === 'dept' ? String(p.dept ?? '').toLowerCase() : '';
  if (p.area === 'dept' && !DEPT_RE.test(dept)) return reject('invalid_event', 'a department checklist names its department');
  if (!Array.isArray(p.days) || !p.days.length || p.days.some(d => !Number.isInteger(d) || d < 1 || d > 7)) return reject('invalid_event', 'days lists the weekdays it is due, 1 (Monday) to 7 (Sunday)');
  const due = String(p.due ?? '');
  if (due && !DUE_RE.test(due)) return reject('invalid_event', 'due is a time, HH:MM, or empty');
  if (!Array.isArray(p.items) || !p.items.length || p.items.length > ITEMS_MAX) return reject('invalid_event', `a checklist has 1 to ${ITEMS_MAX} items`);
  const items = [], ids = new Set();
  for (const it of p.items) {
    const id = String(it?.id ?? ''), t = clean(it?.t, LEN.item);
    if (!ID_RE.test(id) || ids.has(id)) return reject('invalid_event', 'each item has its own id');
    if (!t) return reject('invalid_event', 'an item says what to check');
    ids.add(id); items.push({ id, t });
  }
  return { name, area: p.area, dept, who: clean(p.who, LEN.who), days: [...new Set(p.days)].sort(), due, items };
}

function walkOf(s, e) {
  const w = T(s).walks[walkKey(e.entity.list, e.entity.day)];
  return w || reject('not_found', 'that walk has not started');
}

// Where a ✗ went, checked against the store's own records.
function sentOf(s, v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || !SENT_TO.includes(v.to)) return reject('invalid_event', `sent.to is one of ${SENT_TO.join(', ')}`);
  if (v.to === 'note') return { to: 'note' };
  if (v.to === 'backfill') {
    const bay = clean(v.bay, LEN.bay).toUpperCase();
    if (!bay) return reject('invalid_event', 'a backfill request names its bay');
    if (v.kc !== undefined && !isKeycode(v.kc)) return reject('invalid_event', 'kc is a keycode, 6 to 9 digits');
    return { to: 'backfill', bay, ...(v.kc !== undefined ? { kc: String(v.kc) } : {}) };
  }
  const issue = String(v.issue ?? ''), i = s.issues?.[issue];
  if (!i || i.removed) return reject('not_found', 'sent.issue names an issue the store has');
  return { to: 'issue', issue };
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const tasksReducers = {
  // A checklist, written whole: new, edited, or back after a removal.
  'task.list.set'(s, e) {
    const id = String(e.entity.list), cur = T(s).lists[id];
    if (!ID_RE.test(id)) return reject('invalid_event', 'a checklist id is 1 to 16 letters and digits');
    const f = listFields(e.payload); if (f.code) return f;
    if (cur && !cur.removed && ['name', 'area', 'dept', 'who', 'days', 'due', 'items'].every(k => same(cur[k], f[k]))) return reject('unchanged', 'nothing changed');
    if (!cur || cur.removed) { const live = Object.values(s.tasks.lists).filter(l => !l.removed).length; if (live >= LIST_CAP) return reject('too_large', `at most ${LIST_CAP} checklists`); }
    s.tasks.lists[id] = { id, ...f, added: cur?.added || e.at, by: cur?.by || who(e), updated: e.at, removed: null };
    return null;
  },
  // Off the list; its walks stay (each keeps the checklist as it was).
  'task.list.remove'(s, e) {
    const l = T(s).lists[String(e.entity.list)];
    if (!l || l.removed) return reject('not_found', 'no such checklist');
    l.removed = { at: e.at, by: who(e) }; l.updated = e.at;
    return null;
  },
  // Today's walk of a checklist: the checklist as it is now, who and when.
  'task.walk.start'(s, e) {
    const { list, day } = e.entity, l = T(s).lists[String(list)];
    if (!DAY_RE.test(String(day))) return reject('invalid_event', 'day must be YYYY-MM-DD');
    if (!l || l.removed) return reject('not_found', 'no such checklist');
    if (storeDay(new Date(e.at), s.settings?.tz || DEFAULT_TZ) !== day) return reject('invalid_event', 'a walk starts on its own day');
    const key = walkKey(list, day);
    if (s.tasks.walks[key]) return reject('exists', 'that walk has already started');
    s.tasks.walks[key] = { list: l.id, day, name: l.name, area: l.area, dept: l.dept, who: l.who, due: l.due, items: l.items.map(it => ({ ...it })), started: e.at, by: who(e), done: null, answers: {} };
    return null;
  },
  // One item ✓ or ✗, with a note, a photo and, for a ✗, where it went.
  'task.walk.item'(s, e) {
    const w = walkOf(s, e); if (w.code) return w;
    const item = String(e.entity.item), p = e.payload;
    if (w.trimmed) return reject('invalid_event', 'this walk is too old to change');
    if (!w.items.some(it => it.id === item)) return reject('not_found', 'that item is not on this walk');
    if (p.a !== 'y' && p.a !== 'n') return reject('invalid_event', 'a is y (✓) or n (✗)');
    const note = clean(p.note, LEN.note);
    if (p.photo !== undefined && !PHOTO_RE.test(String(p.photo))) return reject('invalid_event', 'photo must be a photo id');
    const sent = sentOf(s, p.sent); if (sent?.code) return sent;
    if (sent && p.a !== 'n') return reject('invalid_event', 'only a ✗ is sent anywhere');
    const cur = w.answers[item];
    // Where a ✗ went stays with it: the request or the issue is already out there.
    const was = cur?.sent && cur.sent.to !== 'note' ? cur.sent : null;
    if (was && sent && !same(was, sent)) return reject('exists', 'this item was already sent');
    const next = { a: p.a, at: e.at, by: who(e), ...(note ? { note } : {}), ...(p.photo ? { photo: String(p.photo) } : {}), ...((was || sent) ? { sent: was || sent } : {}) };
    if (cur && ['a', 'note', 'photo', 'sent'].every(k => same(cur[k], next[k]))) return reject('unchanged', 'that is already the answer');
    w.answers[item] = next;
    return null;
  },
  // Every item answered: the walk is done. A second done changes nothing.
  'task.walk.done'(s, e) {
    const w = walkOf(s, e); if (w.code) return w;
    if (w.done) return null;
    const left = w.items.filter(it => !w.answers[it.id]).length;
    if (left) return reject('incomplete', `${left} item${left === 1 ? '' : 's'} still to answer`);
    w.done = e.at;
    return null;
  },
};

// ── Reading (the views, the worker's photo rules) ───────────────────────
// A walk's counts: items, answered, ✓, ✗ and photos.
export function walkCounts(w) {
  if (!w) return { of: 0, answered: 0, y: 0, n: 0, photos: 0 };
  const xs = Object.values(w.answers || {}), photos = xs.filter(x => x.photo).length;
  if (w.trimmed) return { of: w.n.of, answered: w.n.y + w.n.n, y: w.n.y, n: w.n.n, photos };
  return { of: w.items.length, answered: w.items.filter(it => w.answers[it.id]).length, y: xs.filter(x => x.a === 'y').length, n: xs.filter(x => x.a === 'n').length, photos };
}
// The photo ids a walk lists.
export const walkPhotos = w => Object.values(w?.answers || {}).map(x => x.photo).filter(Boolean);

// Retention (shared/retain.js): a walk keeps every answer for
// detailDays, then only its ✗ and photographed answers, and leaves the live
// state KEEP_WALK_DAYS after its day (its photos go with it); a removed
// checklist leaves after `dropLists`.
export function retainTasks(s, { detail, drop, dropLists }) {
  const t = s.tasks; if (!t) return {};
  const done = {};
  const n = k => { done[k] = (done[k] || 0) + 1; };
  for (const [k, w] of Object.entries(t.walks || {})) {
    if (w.day < drop) { delete t.walks[k]; n('walks'); continue; }
    if (w.day < detail && !w.trimmed) {
      const c = walkCounts(w), keep = new Set(Object.entries(w.answers).filter(([, x]) => x.a === 'n' || x.photo).map(([id]) => id));
      w.n = { of: c.of, y: c.y, n: c.n };
      w.items = w.items.filter(it => keep.has(it.id));
      w.answers = Object.fromEntries(Object.entries(w.answers).filter(([id]) => keep.has(id)));
      w.trimmed = true; n('walksTrimmed');
    }
  }
  for (const [id, l] of Object.entries(t.lists || {})) if (l.removed && String(l.removed.at).slice(0, 10) < dropLists) { delete t.lists[id]; n('lists'); }
  return done;
}
