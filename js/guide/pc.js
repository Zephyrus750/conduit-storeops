// The store PC the PC chapters are drawn on, at the real
// 1920×1080 (laid out at the shell's 95% display size, so the sizes are the
// app's own CSS sizes): the rail as js/registry.js lays it out, the top bar,
// the footer, a view's header and tabs, buttons and chips. Its styles are the
// pc2- rules in styles/guide.css. The day is the guide's: Sunday 25
// October 2026 at Busselton 1241.
import { tx, txn, locale } from '../i18n.js';
import { fmtLong, fmtDate, DEPT_COLOUR } from '../ui.js';
import { VERSION } from '../version.js';
import { ai } from './frames.js';

export const DAY = '2026-10-25';
export const dt = (iso, o) => new Date(iso + 'T00:00:00Z').toLocaleDateString(locale(), { ...o, timeZone: 'UTC' });
export const dShort = iso => fmtDate(iso);
// The footer's date line: the store day and its retail week (retailPeriod() for 25 Oct 2026).
export const footDate = () => `${fmtLong(new Date(2026, 9, 25, 9))} · <b>P5W1</b>`;
export const at = t => `${dt(DAY, { weekday: 'short' })} ${t}`;

// ── the frame: rail, top bar, content, footer ────────────────────────
// The rail as js/registry.js lays it out (RAIL_TOP, RAIL, RAIL_FOOT); the ids are GROUPS'.
export const TOP = () => [['today', 'm-dashboard', tx('Dashboard')], ['inputs', 'file', tx('Reports & files')], ['resources', 'library', tx('Resources')]];
export const SECS = () => [
  [tx('Floor'), [['map', 'm-map', tx('Store map')], ['layouts', 'plan', tx('Layouts'), true], ['floorchecks', 'listcheck', tx('Floor checks')], ['picklist', 'm-picklist', tx('Pick list')], ['safety', 'm-emergency', tx('Safety & upkeep')]]],
  [tx('Stockroom'), [['backfill', 'm-backfill', tx('Backfill')], ['accuracy', 'm-adjust', tx('Stock accuracy')], ['cages', 'm-cages', tx('Cages')]]],
  [tx('Back dock'), [['receiving', 'm-receiving', tx('Receiving')], ['plan', 'm-planner', tx('Plan')], ['results', 'bars', tx('Results')]]],
];
export const FOOT = () => [['screens', 'expand', tx('Screens')], ['settings', 'm-settings', tx('Settings')], ['help', 'help', tx('Help')]];
// The rail's counts this morning: the morning report not pasted, LAD-02 overdue, three bays to review.
export const BADGES = { inputs: 1, safety: 1, backfill: 3 };
// The rows whose count is red, as paintBadges() in js/shell.js paints the
// cages', the equipment's and the recalls' counts.
const RED = ['safety', 'cages'];
// What a row holds, shown beside it on hover (RDESC in js/shell.js).
export const TIP = () => ({ backfill: [tx('Backfill'), tx('Today’s board against the morning report, the walk order, and how it went.')] });
export const MARK = '<svg class="pc2-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#111827" stroke="rgba(255,255,255,.16)" stroke-width=".8"/><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" fill="none" stroke="#7DD3FC" stroke-width="5.4"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" fill="none" stroke="#22A6D6" stroke-width="5.4"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" fill="none" stroke="#0E7CA8" stroke-width="5.4"/></svg>';

export function rail(on, badges) {
  const tip = TIP();
  const row = ([g, icon, label, soon]) => `<span class="pc2-row${g === on ? ' on' : ''}${soon ? ' soon' : ''}" data-g="${g}">${ai(icon)}<span class="rl">${label}</span>` +
    (badges[g] ? `<span class="bdg${RED.includes(g) ? ' red' : ''}">${badges[g]}</span>` : '') + (soon ? `<span class="soon">${tx('Soon')}</span>` : '') +
    (tip[g] ? `<span class="pc2-tip" hidden><b>${tip[g][0]}</b><span>${tip[g][1]}</span></span>` : '') + '</span>';
  return `<aside class="pc2-rail"><div class="pc2-brand">${MARK}<b>Conduit</b></div>` +
    `<div class="pc2-chip">${ai('m-store', 'sc')}<span><b>Busselton</b><small>${tx('Store {no}', { no: '1241' })}</small></span>${ai('chev', 'dn')}</div>` +
    `<div class="pc2-rtop">${TOP().map(row).join('')}</div>` +
    `<div class="pc2-rscroll">${SECS().map(([sec, rows]) => `<div class="pc2-rsec">${sec}</div>${rows.map(row).join('')}`).join('')}</div>` +
    `<div class="pc2-rfoot">${FOOT().map(row).join('')}</div></aside>`;
}
export const sync = (off, n = 0) => off ? `<span class="dot off"></span>${tx('Offline')}${n ? ' · ' + txn(n, '{n} change queued', '{n} changes queued') : ''}` : `<span class="dot"></span>${tx('Synced to cloud')}`;
// A PC: views are the screens it can show (one shown), on the rail row that is lit.
export function pc(views, { on = 'today', badges = BADGES, half = false } = {}) {
  return `<div class="dv pc2f${half ? ' half' : ''}"><div class="dvs pc2${half ? ' half' : ''}"><div class="pc2-z">${rail(on, badges)}` +
    `<div class="pc2-main"><header class="pc2-top"><span class="pc2-search">${ai('search')}<span class="q">${tx('Search anything — a shelf, bay, product, manifest or consolidation…')}</span><kbd>Ctrl K</kbd>${ai('mic')}</span>` +
    `<span class="pc2-btn acc pc2-showmap">${ai('map')}${tx('Show map')}</span><span class="pc2-help" title="${tx('Help for this screen')}">?</span></header>` +
    `<main class="pc2-content">${views}</main>` +
    `<footer class="pc2-foot"><span class="pc2-menu">${ai('sidebar')}${tx('Menu')}</span><i class="fdiv"></i><span>${footDate()}</span><span class="sp"></span><span class="pc2-sync">${sync(false)}</span><i class="fdiv"></i><span>Conduit ${VERSION}</span></footer></div>` +
    `<div class="pc2-omni" hidden></div><div class="pc2-sy" hidden></div></div><div class="dv-toast" hidden></div><i class="fg cur"></i></div></div>`;
}
export const view = (id, html, shown) => `<section class="v pc2-v" id="${id}"${shown ? '' : ' hidden'}>${html}</section>`;
// A view's header (vh() in js/ui.js): its icon, title, the line under it, its buttons.
export const vh = (icon, title, sub, acts = '') => `<div class="pc2-vh"><div class="pc2-vt"><span class="pc2-vic">${ai(icon)}</span><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>${acts ? `<div class="pc2-acts">${acts}</div>` : ''}</div>`;
export const sub = (...p) => p.filter(Boolean).map(x => `<span>${x}</span>`).join('<i>·</i>');
// A row's screens as tabs above the open one (groupTabs() in js/shell.js).
export const gtabs = (list, on) => `<nav class="pc2-gtabs">${list.map(([k, icon, label, n]) => `<span class="pc2-gtab${k === on ? ' on' : ''}" data-t="${k}">${ai(icon)}${label}${n ? `<span class="bdg">${n}</span>` : ''}</span>`).join('')}</nav>`;
export const btn = (icon, label, cls = '') => `<span class="pc2-btn${cls ? ' ' + cls : ''}">${icon ? ai(icon) : ''}${label}</span>`;
export const chip = (t, k = '') => `<span class="pc2-st${k ? ' ' + k : ''}">${t}</span>`;
export const dep = d => `<span class="pc2-dep" style="background:${DEPT_COLOUR[d] || '#64748B'}">${d.toUpperCase()}</span>`;
