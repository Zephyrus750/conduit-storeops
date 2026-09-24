// Small rendering helpers shared by every view. Rendering is innerHTML, so
// esc() is the one rule: anything that came from another device goes
// through it.

import { storeDay, storeParts } from '../shared/time.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function ic(name, cls = '') {
  return `<svg class="i ${cls}"><use href="icons.svg#i-${name}"/></svg>`;
}
export function vh(title, sub, acts, icon) {
  return `<div class="vh"><div class="vt">${icon ? `<span class="vic">${ic(icon)}</span>` : ''}<div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}
export const sub = (...parts) => parts.filter(Boolean).map(p => `<span>${p}</span>`).join('<i>·</i>');
export function mhead(t, s, right) { return `<div class="mv-head"><div><h2>${t}</h2>${s ? `<span>${s}</span>` : ''}</div>${right || ''}</div>`; }
export function mtile(icon, t, s, badge, view, cls) { return `<button class="mv-tile${cls ? ' ' + cls : ''}" data-go="${view}"><span class="ti">${ic(icon)}</span><span class="tx"><b>${t}</b><span>${s}</span></span>${badge ? `<span class="bd">${badge}</span>` : '<span></span>'}${ic('chev')}</button>`; }
export function mbig(label, cls, icon, attrs) { return `<button class="mv-big ${cls || ''}"${attrs || ''}>${icon ? ic(icon) : ''}${label}</button>`; }
export function mghost(label, attrs) { return `<button class="mv-ghost"${attrs || ''}>${label}</button>`; }
export function mfoot(inner) { return `<div class="mv-foot">${inner}</div>`; }
export function msteps(n, labels) { return `<div class="mv-steps">${labels.map((l, i) => `<span class="${i + 1 < n ? 'done' : i + 1 === n ? 'cur' : ''}"><i>${i + 1 < n ? ic('check') : i + 1}</i>${l}</span>`).join('')}</div>`; }
export function mlast(code, name, meta) { return `<div class="mv-last"><small>Last scanned</small><b>${code}</b><span>${name}</span>${meta ? `<em>${meta}</em>` : ''}</div>`; }
// A scan prompt with a typed field: hardware scanners type into it and press Enter; the camera arrives later.
export function mscan(cap, field, hint, btn) { return `<div class="mv-scan typed"><div class="cap">${cap}</div><div class="mv-field">${field}</div>${hint ? `<div class="hint">${hint}</div>` : ''}${btn ? `<div class="tools">${btn}</div>` : ''}</div>`; }
export function mrows(rows) { return `<div class="mv-rows">${rows.map(r => `<div class="mv-row${r[3] ? ' ' + r[3] : ''}"><span class="a">${r[0]}</span><span class="b">${r[1]}</span><span class="c">${r[2] || ''}</span></div>`).join('')}</div>`; }
export function card(title, body, right = '') { return `<div class="card"><div class="ch"><h3>${title}</h3>${right}</div>${body}</div>`; }
export function prog(pct) { pct = Math.max(0, Math.min(100, Math.round(pct || 0))); return `<div class="prog"><div class="track"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>`; }
export function status(cls, text) { return `<span class="status ${cls}">${text}</span>`; }

// ── departments ───────────────────────────────────────────────────────
// Filled from the published map's department list (setDepartments, called
// when the map document loads). Until a map with departments is published
// these hold the registry's names (DEPTS_DEFAULT). The tables are mutated in
// place so every view reads the current store's names.
// The fallback is the suite's department registry (K2B's registry=depts,
// the one the legacy apps shared), so a store without published departments
// shows the same names in the map, Label integrity and the console.
export const DEPTS_DEFAULT = [
  ['h1', 'Kitchen', 'home', '#FF8C00'], ['h2', 'Bed, Bath, Laundry', 'home', '#9B59B6'], ['h3', 'Decor & Pets', 'home', '#8B4513'], ['h4', 'Stationery', 'home', '#166534'],
  ['c1', 'Women’s Clothing', 'clothing', '#FF69B4'], ['c2', 'Men’s Clothing', 'clothing', '#4169E1'], ['c3', 'Footwear', 'clothing', '#D4A017'], ['c4', 'Cosmetics & Accessories', 'clothing', '#FF1493'],
  ['k1', 'Active', 'kids', '#4ADE80'], ['k2', 'Toys', 'kids', '#FF4500'], ['k3', 'Nursery / Party', 'kids', '#FFB6C1'], ['k4', 'Kids’ Clothing', 'kids', '#87CEEB'],
  ['flex', 'Flex', 'other', '#808080'], ['bulk', 'Large / heavy items', 'other', '#6B7280'], ['checkouts', 'Checkouts', 'other', '#10b981'], ['stockroom', 'Stockroom', 'other', '#800020'],
].map(([id, name, group, color]) => ({ id, name, group, color }));
export const DEPT_COLOUR = Object.fromEntries(DEPTS_DEFAULT.map(d => [d.id, d.color]));
export const DEPT_NAME = Object.fromEntries(DEPTS_DEFAULT.map(d => [d.id, d.name]));
export const DEPT_GROUPS = [['Home', 'home', ['h1', 'h2', 'h3', 'h4']], ['Clothing', 'shirt', ['c1', 'c2', 'c3', 'c4']], ['Kids', 'star', ['k1', 'k2', 'k3', 'k4']], ['Other', 'box', ['checkouts', 'flex', 'stockroom']]];
const GROUP_ICON = { home: 'home', clothing: 'shirt', kids: 'star' };
// The map file names departments "H1 Kitchen": the badge is the id, the
// rest is the common name shown beside it.
export function deptCommonName(d) { const n = String(d.name || d.id || '').trim(); const m = n.match(/^([A-Za-z]\d+)\s+(.+)$/); return m && m[1].toLowerCase() === String(d.id).toLowerCase() ? m[2] : n; }
export function setDepartments(list) {
  if (!Array.isArray(list) || !list.length) return false;
  for (const k of Object.keys(DEPT_COLOUR)) delete DEPT_COLOUR[k];
  for (const k of Object.keys(DEPT_NAME)) delete DEPT_NAME[k];
  DEPT_GROUPS.length = 0;
  const groups = new Map(), loose = [];
  for (const d of list) {
    const id = String(d.id || '').toLowerCase(); if (!id) continue;
    DEPT_COLOUR[id] = d.color || '#64748B'; DEPT_NAME[id] = deptCommonName(d);
    const parent = d.parent ? String(d.parent).toLowerCase() : '';
    if (parent) { if (!groups.has(parent)) groups.set(parent, []); groups.get(parent).push(id); } else loose.push(id);
  }
  for (const [gid, ids] of groups) DEPT_GROUPS.push([gid.charAt(0).toUpperCase() + gid.slice(1), GROUP_ICON[gid] || 'layers', ids]);
  if (loose.length) DEPT_GROUPS.push(['Other', 'box', loose]);
  return true;
}
export function dep(code) { const c = String(code || '').toLowerCase(); return `<span class="dep" style="background:${DEPT_COLOUR[c] || '#64748B'}">${esc(c.toUpperCase())}</span>`; }

// ── time ──────────────────────────────────────────────────────────────
export function nowIso(d = new Date()) {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = n => String(Math.abs(n)).padStart(2, '0');
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  return local + sign + p(Math.floor(Math.abs(off) / 60)) + ':' + p(Math.abs(off) % 60);
}
// The store's day, week and cycle come from the store clock (shared/time.js),
// never UTC and never the device's zone.
export function today() { return storeDay(); }
// ISO-ish week id, Monday start: 2026-W37
export function weekId(d = new Date()) {
  const { y, m, d: dd } = storeParts(d);
  const x = new Date(Date.UTC(y, m - 1, dd));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
export function cycleId(len = 'monthly', d = new Date()) {
  const { y, m: mo } = storeParts(d), m = String(mo).padStart(2, '0');
  if (len === 'monthly') return `${y}-${m}M`;
  const w = Number(weekId(d).slice(-2));
  return len === 'weekly' ? weekId(d) : `${y}-F${String(Math.ceil(w / 2)).padStart(2, '0')}`;
}
export function daysLeftInCycle(len = 'monthly', d = new Date()) {
  const { y, m, d: dd } = storeParts(d);
  if (len === 'monthly') return new Date(Date.UTC(y, m, 0)).getUTCDate() - dd;
  const dow = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7;
  return (len === 'weekly' ? 6 : 13 - (Number(weekId(d).slice(-2)) % 2 ? 0 : 7)) - dow;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtTime(iso) { if (!iso) return ''; const d = new Date(iso); return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
export function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function fmtLong(d = new Date()) { return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]} ${d.getDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`; }
export function ago(iso) { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} h ago`; return `${Math.round(h / 24)}d ago`; }
export function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning!' : h < 17 ? 'Good afternoon!' : 'Good evening!'; }

// Tiny toast for rejections and confirmations.
// action: { label, run } adds a button (Undo), and the toast stays a little longer.
export function toast(msg, kind = '', action = null) {
  let host = $('#toasts'); if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; host.appendChild(t);
  const close = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label; b.addEventListener('click', () => { close(); action.run(); }); t.appendChild(b); t.classList.add('has-act'); }
  setTimeout(() => t.classList.add('show'), 10); setTimeout(close, action ? 6000 : 3500);
}

// ── keyboard access ───────────────────────────────────────────────────
// Views draw many controls as <span>/<div>/<a> with a data-act (or data-go,
// data-view…) that the click delegation handles. Give each one a role and a
// tab stop, and let Enter and Space press it, so the whole shell works from
// the keyboard and reads as buttons to a screen reader. Controls inside the
// map SVG are left alone: a thousand shelves are not a thousand tab stops.
const ACTIONABLE = '[data-act],[data-go],[data-view],[data-shell-act],[data-zoom],[data-key],[data-mapgroup],[data-mapdept],[data-mapfloor],[data-mapfloor-next],[data-tab],.storechip';
const NATIVE = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'FORM', 'LABEL']);
const needsHelp = el => !(NATIVE.has(el.tagName) || (el.tagName === 'A' && el.hasAttribute('href'))) && !el.closest('svg');
export function enhanceControls(root = document) {
  const els = root.matches?.(ACTIONABLE) ? [root, ...root.querySelectorAll(ACTIONABLE)] : root.querySelectorAll(ACTIONABLE);
  for (const el of els) {
    if (!needsHelp(el)) continue;
    const sw = el.classList.contains('tgl') || el.classList.contains('ad-tgl') || el.classList.contains('sw2');
    if (!el.hasAttribute('role')) el.setAttribute('role', sw ? 'switch' : 'button');
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (el.getAttribute('role') === 'switch') el.setAttribute('aria-checked', String(el.classList.contains('on')));
    if (!el.hasAttribute('aria-label') && !el.textContent.trim() && el.getAttribute('title')) el.setAttribute('aria-label', el.getAttribute('title'));
  }
}
export function installKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.matches('[role="button"],[role="switch"],[role="tab"]') || !needsHelp(el)) return;
    e.preventDefault(); el.click();
  });
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.namespaceURI !== 'http://www.w3.org/2000/svg') enhanceControls(n); })
    .observe(document.body, { childList: true, subtree: true });
  enhanceControls();
}
