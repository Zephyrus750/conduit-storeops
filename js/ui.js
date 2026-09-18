// Small rendering helpers shared by every view. Rendering is innerHTML, so
// esc() is the one rule: anything that came from another device goes
// through it.

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
export function mrows(rows) { return `<div class="mv-rows">${rows.map(r => `<div class="mv-row${r[3] ? ' ' + r[3] : ''}"><span class="a">${r[0]}</span><span class="b">${r[1]}</span><span class="c">${r[2] || ''}</span></div>`).join('')}</div>`; }
export function card(title, body, right = '') { return `<div class="card"><div class="ch"><h3>${title}</h3>${right}</div>${body}</div>`; }
export function prog(pct) { pct = Math.max(0, Math.min(100, Math.round(pct || 0))); return `<div class="prog"><div class="track"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>`; }
export function status(cls, text) { return `<span class="status ${cls}">${text}</span>`; }

// ── departments (from the published map's key) ────────────────────────
export const DEPT_COLOUR = { h1: '#FF8C00', h2: '#9B59B6', c1: '#FF69B4', h3: '#8B4513', h4: '#228B22', c2: '#4169E1', c4: '#FF1493', c3: '#D4A017', k1: '#2E8B57', checkouts: '#10b981', flex: '#808080', k2: '#FF4500', k3: '#FFB6C1', k4: '#87CEEB', stockroom: '#800020' };
export const DEPT_NAME = { h1: 'Manchester', h2: 'Home', h3: 'Decor', h4: 'Kitchen', c1: 'Kids apparel', c2: 'Womens', c3: 'Mens', c4: 'Footwear', k1: 'Toys', k2: 'Kids', k3: 'Baby', k4: 'Sport', flex: 'Flex', checkouts: 'Checkouts', stockroom: 'Stockroom' };
export const DEPT_GROUPS = [['Home', 'home', ['h1', 'h2', 'h3', 'h4']], ['Clothing', 'shirt', ['c1', 'c2', 'c3', 'c4']], ['Kids', 'star', ['k1', 'k2', 'k3', 'k4']], ['Other', 'box', ['checkouts', 'flex', 'stockroom']]];
export function dep(code) { const c = String(code || '').toLowerCase(); return `<span class="dep" style="background:${DEPT_COLOUR[c] || '#64748B'}">${esc(c.toUpperCase())}</span>`; }

// ── time ──────────────────────────────────────────────────────────────
export function nowIso(d = new Date()) {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = n => String(Math.abs(n)).padStart(2, '0');
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  return local + sign + p(Math.floor(Math.abs(off) / 60)) + ':' + p(Math.abs(off) % 60);
}
export function today() { return nowIso().slice(0, 10); }
// ISO-ish week id, Monday start: 2026-W37
export function weekId(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
export function cycleId(len = 'monthly', d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
  if (len === 'monthly') return `${y}-${m}M`;
  const w = Number(weekId(d).slice(-2));
  return len === 'weekly' ? weekId(d) : `${y}-F${String(Math.ceil(w / 2)).padStart(2, '0')}`;
}
export function daysLeftInCycle(len = 'monthly', d = new Date()) {
  if (len === 'monthly') return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate();
  const dow = (d.getDay() + 6) % 7;
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
export function toast(msg, kind = '') {
  let host = $('#toasts'); if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; host.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}
