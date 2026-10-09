// What's New (TODO 2): a short note per release with how-tos, shown once on
// each device after an update (never on a first run: the walkthrough is for
// that), and any time from Help.
//
//   whatsNewOnce(go)   shows the releases this device has not seen
//   openWhatsNew(go)   shows them all
// go(view, arg) opens a view, for the "Show me" buttons.

import { ic, esc } from './ui.js';
import { VERSION } from './version.js';

export const RELEASES = [
  { v: 'v0.3.0', date: '2026-10-09', items: [
    ['users', 'Team message and today’s briefing', 'Managers publish a message and the day’s briefing for every device in the store. It shows in the strip at the top until you have read it.', null],
    ['barcode', 'Stricter backfill scanning', 'Keycodes are 7 or 8 digits and item barcodes must read cleanly, as K2B checked them. Two codes one digit apart are flagged; any code can be removed, with Undo.', 'bfreview'],
    ['lock', 'Bays open on another desk', 'A bay being reviewed elsewhere shows a banner with Take over. A desk that walks away lets go after 20 minutes.', 'bfreview', 'desk'],
    ['users', 'The decant plan on the Team Board', 'Up next follows each person’s queue, and the Wallboard timeline shows planned pallets and breaks.', 'teamboard'],
    ['print', 'Print the map', 'The print composer, a department booklet, the evacuation map and maintenance work orders with a QR code.', 'printmap', 'desk'],
    ['search', 'Search the store’s records', 'Search finds manifests, consolidations, cages, inventory loads and off-site pallets as well as shelves.', null, 'desk'],
    ['search', 'Search the store’s records', 'Search finds consolidations and cages as well as shelves.', null, 'phone'],
    ['mic', 'Voice search', 'Tap the microphone in the search bar and say a shelf, like “A16 S2”.', null, 'phone'],
  ] },
];
const SEEN = 'whatsnew_seen';
const num = v => String(v).replace(/^v/, '').split('.').map(Number).reduce((n, x) => n * 1000 + (x || 0), 0);

export function whatsNewOnce(go, { firstRun = false } = {}) {
  let seen = null; try { seen = localStorage.getItem(SEEN); localStorage.setItem(SEEN, VERSION); } catch { return; }
  if (firstRun || !seen) return;                      // a new device gets the walkthrough instead
  const fresh = RELEASES.filter(r => num(r.v) > num(seen) && num(r.v) <= num(VERSION));
  if (fresh.length) open(fresh, go);
}
export const openWhatsNew = go => open(RELEASES, go);

// An item marked 'desk' shows only on a desk, 'phone' only on a phone.
const forDevice = list => { const phone = (document.querySelector('.frame')?.clientWidth || innerWidth) <= 600; return list.map(r => ({ ...r, items: r.items.filter(it => !it[4] || it[4] === (phone ? 'phone' : 'desk')) })).filter(r => r.items.length); };
function open(list, go) {
  list = forDevice(list);
  document.getElementById('whatsnew')?.remove();
  const el = document.createElement('div'); el.id = 'whatsnew'; el.className = 'tm-back'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'What’s new');
  el.innerHTML = `<div class="tm-sheet wn"><button class="tour-x" data-wn="close" aria-label="Close">${ic('x')}</button><h3 class="wn-h">${ic('star')}What’s new</h3>` +
    list.map(r => `<section class="wn-rel"><div class="wn-v">${esc(r.v)} · ${esc(r.date)}</div>${r.items.map(([icon, title, text, view]) => `<div class="wn-it"><span class="wn-ic">${ic(icon)}</span><div><b>${esc(title)}</b><p>${esc(text)}</p>${view ? `<button class="btn sm" data-wn="go" data-view="${esc(view)}">Show me</button>` : ''}</div></div>`).join('')}</section>`).join('') +
    `<div class="tm-acts"><button class="btn primary" data-wn="close">Got it</button></div></div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('[data-wn]'); if (!b) return;
    if (b.dataset.wn === 'go') { close(); go?.(b.dataset.view); } else close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  el.querySelector('.tm-acts .primary')?.focus({ preventScroll: true });
}
