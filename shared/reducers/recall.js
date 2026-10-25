// Recalls and withdrawals (25 Oct 2026): products that must come off sale.
// A recall is a safety recall; a withdrawal takes a product off sale for
// another reason. Each names its keycodes (and any item barcodes), what to
// do with the stock, and where it stands. Every store device holds the list
// (a Floor projection), so any scan of a listed item, on the floor, in the
// stockroom or on the dock, is flagged at once: move it to the recall bay
// and tell a manager. Managers add, edit and change the status; anyone
// records stock they found and moved, so the count builds up.
//
//   recalls.items id → {
//     id, kind: recall | withdrawal, title, ref, reason, action, kcs [keycodes], apns [item barcodes],
//     status: open | removing | removed | closed, added, by, updated, closedAt,
//     units (moved so far), found [{ t, by, kc, n, where }], log [{ t, a, by, n? }]
//   }
//   recalls.bay    where recalled stock goes (the recall bay), a manager's setting
//   recalls.rev    bumped on every change to a recall (the code index follows it)
//
// Status: open (announced) → removing (stock is being pulled; the first find
// moves it there) → removed (none left on the floor or in the stockroom) →
// closed (finished: returned or destroyed). Stock found after "removed" puts
// it back to removing. A closed recall flags nothing and takes no finds; it
// leaves the live state KEEP_RECALL_DAYS after it closed (the log keeps it).

import { reject } from './util.js';
import { gs1Parse } from '../gs1.js';

export const RECALL_KINDS = ['recall', 'withdrawal'];
export const RECALL_STATUSES = ['open', 'removing', 'removed', 'closed'];
export const RECALL_CAP = 200, CODES_MAX = 200, KEEP_RECALL_DAYS = 180;
const FOUND_CAP = 300, LOG_CAP = 120, N_MAX = 9999;
const KC_RE = /^\d{6,8}$/;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const who = e => String(e.actor?.device || 'unknown');

export function recallState() {
  return { recalls: { items: {}, bay: '' } };
}

// The keycodes a person typed or pasted: 6 to 8 digits each, no repeats.
function keycodes(v) {
  if (!Array.isArray(v) || !v.length) return reject('invalid_event', 'kcs lists the keycodes (at least one)');
  const out = [...new Set(v.map(x => String(x).trim()))];
  if (out.length > CODES_MAX || out.some(k => !KC_RE.test(k))) return reject('invalid_event', `kcs: up to ${CODES_MAX} keycodes of 6 to 8 digits`);
  return out;
}
// Item barcodes, as the form pairs are kept under (13 digits for EAN/UPC).
function barcodes(v) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > CODES_MAX) return reject('invalid_event', `apns: up to ${CODES_MAX} item barcodes`);
  const out = [];
  for (const x of v) { const g = gs1Parse(String(x))?.gtin; if (!g) return reject('invalid_event', `${clean(x, 20)} is not a valid item barcode`); if (!out.includes(g)) out.push(g); }
  return out;
}
// Every change to a recall bumps recalls.rev, so the code index is rebuilt.
function logLine(s, r, e, a, extra = {}) {
  s.recalls.rev = (s.recalls.rev || 0) + 1;
  r.log.push({ t: e.at, a, by: who(e), ...extra });
  if (r.log.length > LOG_CAP) r.log.splice(0, r.log.length - LOG_CAP);
  r.updated = e.at;
}
function recallOfEvent(s, e) {
  const r = s.recalls.items[e.entity.recall];
  return r ? r : reject('not_found', 'no such recall');
}
// The fields a manager writes, checked; a missing field keeps what is there.
function fields(p, base) {
  const kind = p.kind ?? base.kind;
  if (!RECALL_KINDS.includes(kind)) return reject('invalid_event', `kind is one of ${RECALL_KINDS.join(', ')}`);
  const title = p.title !== undefined ? clean(p.title, 80) : base.title;
  if (!title) return reject('invalid_event', 'a recall needs a title (the product)');
  const kcs = p.kcs !== undefined || !base.kcs ? keycodes(p.kcs) : base.kcs; if (!Array.isArray(kcs)) return kcs;
  const apns = p.apns !== undefined ? barcodes(p.apns) : base.apns; if (!Array.isArray(apns)) return apns;
  return { kind, title, kcs, apns, ref: p.ref !== undefined ? clean(p.ref, 40) : base.ref, reason: p.reason !== undefined ? clean(p.reason, 300) : base.reason, action: p.action !== undefined ? clean(p.action, 300) : base.action };
}

export const recallReducers = {
  'recall.add'(s, e) {
    const id = String(e.entity.recall);
    if (s.recalls.items[id]) return reject('exists', 'that recall is already on the list');
    if (Object.keys(s.recalls.items).length >= RECALL_CAP) return reject('too_large', `at most ${RECALL_CAP} recalls; closed ones leave after ${KEEP_RECALL_DAYS} days`);
    const f = fields(e.payload, { kind: undefined, title: '', kcs: undefined, apns: [], ref: '', reason: '', action: '' }); if (f.code) return f;
    s.recalls.items[id] = { id, ...f, status: 'open', added: e.at, by: who(e), updated: e.at, closedAt: null, units: 0, found: [], log: [] };
    logLine(s, s.recalls.items[id], e, 'Added');
    return null;
  },
  'recall.update'(s, e) {
    const r = recallOfEvent(s, e); if (r.code) return r;
    const f = fields(e.payload, r); if (f.code) return f;
    const keys = ['kind', 'title', 'kcs', 'apns', 'ref', 'reason', 'action'];
    if (keys.every(k => JSON.stringify(f[k]) === JSON.stringify(r[k]))) return reject('unchanged', 'nothing changed');
    Object.assign(r, f);
    logLine(s, r, e, 'Edited');
    return null;
  },
  'recall.status'(s, e) {
    const r = recallOfEvent(s, e); if (r.code) return r;
    const st = e.payload.status;
    if (!RECALL_STATUSES.includes(st)) return reject('invalid_event', `status is one of ${RECALL_STATUSES.join(', ')}`);
    if (st === r.status) return reject('unchanged', `already ${st}`);
    const was = r.status;
    r.status = st; r.closedAt = st === 'closed' ? e.at : null;
    logLine(s, r, e, st === 'closed' ? 'Closed' : was === 'closed' ? 'Reopened' : st === 'removing' ? 'Removing' : st === 'removed' ? 'All removed' : 'Open');
    return null;
  },
  // Stock someone found and moved to the recall bay: how many of which
  // keycode, and where it was.
  'recall.found'(s, e) {
    const r = recallOfEvent(s, e); if (r.code) return r;
    if (r.status === 'closed') return reject('closed', 'this recall is closed');
    const p = e.payload, kc = String(p.kc || '');
    if (!r.kcs.includes(kc)) return reject('invalid_event', `${clean(kc, 12)} is not one of this recall's keycodes`);
    if (!Number.isInteger(p.n) || p.n < 1 || p.n > N_MAX) return reject('invalid_event', `n is how many: 1 to ${N_MAX}`);
    const where = clean(p.where, 40);
    r.found.push({ t: e.at, by: who(e), kc, n: p.n, ...(where ? { where } : {}) });
    if (r.found.length > FOUND_CAP) r.found.splice(0, r.found.length - FOUND_CAP);
    r.units += p.n;
    if (r.status !== 'removing') { r.status = 'removing'; }
    logLine(s, r, e, 'Found', { n: p.n });
    return null;
  },
  'recall.bay.set'(s, e) {
    const bay = clean(e.payload.bay, 40);
    if (bay === (s.recalls.bay || '')) return reject('unchanged', 'the recall bay is already that');
    s.recalls.bay = bay;
    return null;
  },
};

// ── Reading the list (every view that shows a product) ───────────────────
// The recalls still in force (not closed), recalls before withdrawals.
export const liveRecalls = recalls => Object.values(recalls?.items || {}).filter(r => r.status !== 'closed').sort((a, b) => (a.kind === b.kind ? String(b.added).localeCompare(String(a.added)) : a.kind === 'recall' ? -1 : 1));
// keycode or item barcode → the recall in force for it, or null. Built once
// per change (recalls.rev).
const memo = new WeakMap();
export function recallIndex(recalls) {
  if (!recalls) return new Map();
  const hit = memo.get(recalls);
  if (hit && hit.rev === (recalls.rev || 0)) return hit.idx;
  const idx = new Map();
  for (const r of liveRecalls(recalls).reverse()) for (const c of [...r.kcs, ...(r.apns || [])]) idx.set(c, r);   // recalls last, so they win
  memo.set(recalls, { rev: recalls.rev || 0, idx });
  return idx;
}
export function recallOf(recalls, code) {
  const c = String(code || '').trim(); if (!c) return null;
  const idx = recallIndex(recalls);
  return idx.get(c) || idx.get(gs1Parse(c)?.gtin || '') || null;
}
// Closed recalls leave the live state KEEP_RECALL_DAYS after closing.
export function retainRecalls(s, cutoff) {
  let n = 0;
  for (const [id, r] of Object.entries(s.recalls?.items || {})) if (r.status === 'closed' && String(r.closedAt || '').slice(0, 10) < cutoff) { delete s.recalls.items[id]; n++; }
  if (n) s.recalls.rev = (s.recalls.rev || 0) + 1;
  return n;
}
