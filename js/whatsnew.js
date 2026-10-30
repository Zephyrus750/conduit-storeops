// What's New (TODO 2): a short note per release with how-tos, shown once on
// each device after an update (never on a first run: the walkthrough is for
// that), and any time from Help.
//
//   whatsNewOnce(go)   shows the releases this device has not seen
//   openWhatsNew(go)   shows them all
// go(view, arg) opens a view, for the "Show me" buttons.

import { ic, esc } from './ui.js';
import { VERSION } from './version.js';
import { tx } from './i18n.js';

export const RELEASES = [
  { v: 'v0.3.0', date: '2026-10-09', items: [
    ['stack', tx('Resources'), tx('At the top of the rail for managers: the forms, procedures, posters and links the owner shares with every store. Search them, open or print a PDF in one click, and the ones you use most sit on top.'), 'resources', 'desk'],
    ['m-manifests', tx('Manifests by week, day and truck'), tx('Each manifest shows the day and truck it came on, by week. Publish several reports at once for a missed day or two: each gets a suggested day from the Planner to check before it goes.'), 'manifests', 'desk'],
    ['chart', tx('Manifest stats'), tx('Under Manifests › Stats: what came in this week, fortnight or month, or all time, against the period before. Cartons by day, the busiest weekdays, departments, top products and what came for the first time.'), 'manifests', 'desk'],
    ['alert', tx('Recalls and withdrawals'), tx('Under Safety & upkeep: a manager adds a recall or withdrawal from the notice, with its keycodes, and moves it from Open to Closed. Every device flags those products straight away: in Live pull, Backfill, Cages, Adjustments, search and every list.'), 'recalls', 'desk'],
    ['alert', tx('Recalled stock'), tx('Scan a recalled or withdrawn product and the phone stops with a red flag: move it to the recall bay and tell a manager. Tap I moved some to record how many.'), null, 'phone'],
    ['m-equipment', tx('Equipment checks'), tx('Under Safety & upkeep: the store’s ladders, MHE and trolleys on the map, each with its own code and QR label. Record each check; a failed one puts it out of service until one passes. What’s due shows with Emergency’s services, on the Today page and on the rail.'), 'equipment', 'desk'],
    ['packages', tx('Live pull'), tx('One person scans on the floor and sends how many; the stockroom’s phones buzz and pull straight away, bay by bay. Find it in More, on the Floor and in the Stockroom.'), 'livepull', 'phone'],
    ['packages', tx('Live pull'), tx('Under Backfill: what the floor asked for and what the stockroom pulled, cage by cage, for today’s sessions and the last 7 days. The sessions run on the phones.'), 'livepull', 'desk'],
    ['users', tx('Team message and today’s briefing'), tx('Managers publish a message and the day’s briefing for every device in the store. It shows in the strip at the top until you have read it.'), null],
    ['barcode', tx('Stricter backfill scanning'), tx('Keycodes are 7 or 8 digits and item barcodes must read cleanly, as K2B checked them. Two codes one digit apart are flagged; any code can be removed, with Undo.'), 'bfreview'],
    ['lock', tx('Bays open on another desk'), tx('A bay being reviewed elsewhere shows a banner with Take over. A desk that walks away lets go after 20 minutes.'), 'bfreview', 'desk'],
    ['users', tx('The decant plan on the Team Board'), tx('Up next follows each person’s queue, and the Wallboard timeline shows planned pallets and breaks.'), 'teamboard'],
    ['print', tx('Print the map'), tx('The print composer, a department booklet, the evacuation map and maintenance work orders with a QR code.'), 'printmap', 'desk'],
    ['tag', tx('Product cards'), tx('Rest the pointer on a keycode or a product name for a moment: a card shows its picture, name and price, and whether it is on clearance.'), null, 'desk'],
    ['clip', tx('Paste a report in one click'), tx('Copy the report in SIM, then press Paste on Today, Reports & files or Backfill review. A pop-up reads the clipboard and says what it found, or that the format is wrong; one more click saves it.'), 'inputs', 'desk'],
    ['file', tx('Reports & files'), tx('One place for everything the store brings in: paste the morning report (required) or the midday one (optional), or drop a DC manifest, a sheet of pallets, the off-site list or the SOH report. It says what it found before anything is saved.'), 'inputs', 'desk'],
    ['sidebar', tx('A shorter rail'), tx('The rail has a few rows for each area. Floor checks, Safety & upkeep, Backfill, Stock accuracy, Receiving, Plan and Results each hold several screens, as tabs at the top. Print map and Suggest edits are buttons on the Store map; the dock boards are under Screens.'), null, 'desk'],
    ['search', tx('Search the store’s records'), tx('Search finds manifests, consolidations, cages, other loads and off-site pallets as well as shelves.'), null, 'desk'],
    ['m-inventory', tx('Off-site pallets at the Back dock'), tx('The Inventory hub moved to the Back dock: Off-site pallets (on the phone too), other loads in Manifests with their departments on the map, and what arrived each week in Analytics.'), 'offsite', 'desk'],
    ['m-inventory', tx('Off-site pallets on the phone'), tx('In the Back dock’s More menu: mark a pallet received, change its callback date or add one.'), 'offsite', 'phone'],
    ['search', tx('Find a shelf as you type'), tx('The search bar finds a shelf, a run, a bay or a department as you type.'), null, 'phone'],
    ['mic', tx('Voice search'), tx('Tap the microphone in the search bar and say a shelf, like “A16 S2” or “zero four side two”.'), null, 'phone'],
    ['mic', tx('Voice search on the PC'), tx('On a PC with a microphone, press the microphone in the search bar (or in Ctrl K) and say a shelf, like “A16 S2”. The pick list’s Say it works there too.'), null, 'desk'],
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
  const el = document.createElement('div'); el.id = 'whatsnew'; el.className = 'tm-back'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', tx('What’s new'));
  el.innerHTML = `<div class="tm-sheet wn"><button class="tour-x" data-wn="close" aria-label="${tx('Close')}">${ic('x')}</button><h3 class="wn-h">${ic('star')}${tx('What’s new')}</h3>` +
    list.map(r => `<section class="wn-rel"><div class="wn-v">${esc(r.v)} · ${esc(r.date)}</div>${r.items.map(([icon, title, text, view]) => `<div class="wn-it"><span class="wn-ic">${ic(icon)}</span><div><b>${esc(title)}</b><p>${esc(text)}</p>${view ? `<button class="btn sm" data-wn="go" data-view="${esc(view)}">${tx('Show me')}</button>` : ''}</div></div>`).join('')}</section>`).join('') +
    `<div class="tm-acts"><button class="btn primary" data-wn="close">${tx('Got it')}</button></div></div>`;
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
