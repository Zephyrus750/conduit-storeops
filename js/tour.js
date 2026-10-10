// The help tour (ShelfSearcher's help cards): eight cards on how the app
// works, swiped or stepped through. Opened from Settings › How to use and
// from Help in the phone's More sheet.
//
//   openTour({ start })   shows the cards; Esc, Done or the backdrop closes

import { ic, esc } from './ui.js';
import { haptic } from './device.js';

const CARDS = [
  ['m-store', '#16A34A', 'Your store', ['The store chip shows which store this device is in, its address, hours and assembly point.', 'A second store can sign in on the same device; switch between them from the chip.', 'Once a store is on the device it keeps working offline.']],
  ['home', '#2563EB', 'Getting around', ['On a desk the rail lists every view: Store, Back dock and Stockroom.', 'On a phone the strip at the bottom holds the area’s main jobs; More holds the rest and Switch area.', 'Stockroom and Back dock ask for their crew code once per device.']],
  ['search', '#D97706', 'Search', ['Search finds a shelf, a bay, a keycode or a tool.', 'On a desk press Ctrl K from anywhere.', 'On a phone the barcode button scans a label straight into search.']],
  ['m-map', '#0FA3A3', 'The map', ['Tap a shelf for its card: department, its run, size, what was done this week.', 'Double-tap or pinch to zoom; flick to pan.', 'On a desk, Ctrl + and Ctrl − zoom, Ctrl 0 fits.', 'The grid button opens one department; the key lists the departments and every map symbol.']],
  ['m-emergency', '#DC2626', 'Emergency', ['Emergency shows every exit, extinguisher, first aid kit and AED.', 'Nearest exit: tap where you are and the map draws the way out and on to the assembly point.', 'Tap a sign for its notes and how to use it.', 'On a desk, managers see service dates and log each service.']],
  ['m-refresh', '#7C3AED', 'Refresh and labels', ['Location refresh: scan or tap each shelf as it is refreshed; the week counts toward 100 in the focus departments.', 'Label integrity: pick a micro-department, check its labels and log any wrong ones.', 'Both show on the map as you go, on every device.']],
  ['m-settings', '#4B5563', 'Settings', ['Theme, accent colour and display size are per device.', 'Price checks can show normal, large or hidden on the map.', 'Vibration and the portrait lock are under Scanner and feedback.']],
  ['star', '#F59E0B', 'Tips', ['Changes made offline wait in the outbox and send when the connection is back.', 'Share on a shelf card gives a QR code that opens the map on that shelf.', 'Settings › Feedback sends a note to the owner, with a diagnostic summary if you tick it.']],
];

// First run (TODO 2): the first time a device enters an area, its short
// walkthrough opens once. The Floor's is the whole tour above.
const AREA_CARDS = {
  stockroom: [
    ['barcode', '#0FA3A3', 'Backfill scan', ['Scan the bay label to start a bay, then scan every product on the shelf.', 'A keycode is 7 or 8 digits; a 13-digit item barcode must read cleanly. Two codes one digit apart are flagged: keep the one on the shelf.', 'Send it to review when the bay is done. Any code can be removed, with Undo.']],
    ['listcheck', '#16A34A', 'Review and submit', ['Review compares each bay with the pasted SIM report: what to add, what to delete.', 'Mark it ready when the PDT matches, then Submit once it is finalised on the PDT.', 'My locations on the phone shows your bays and which are ready to submit.']],
    ['m-cages', '#7C3AED', 'Cages and adjustments', ['Cages: scan a cage tag, then what goes in it; park it on the map so anyone can find it.', 'Adjust: stock is here but the system says none. Scan it, enter the PDT’s SOH and count the shelf.']],
    ['m-daylist', '#D97706', 'The day list', ['The bays to walk today, split between walkers, from the requests or the SOH snapshot.', 'Tick a location when it is checked. History shows every bay’s accuracy over time.']],
  ],
  backdock: [
    ['m-receiving', '#2563EB', 'Land the truck', ['Start receiving the truck, then land each pallet on its square: tub, load or bulk, and its cartons.', 'Attach the manifest, or scan consolidation labels as pallets land; a wrong scan comes off the pallet.']],
    ['users', '#16A34A', 'Run the decant', ['Tap a square to start, pause, join, hand over or finish a pallet, with the person on it.', 'Every action has Undo for a few seconds. The dock tablet runs the same sheet.']],
    ['clock', '#DC2626', 'Hold-ups and breaks', ['A halt, huddle, transition or team break stops the decant clock until it ends.', 'A personal break steps the person off their pallet; the Team Board shows who is free.']],
    ['check', '#7C3AED', 'Finish the truck', ['Finalise when the last pallet is done, or keep unfinished pallets as rollover for the next truck.', 'The Wallboard and Analytics read the day back: pace, hold-ups and each person against their rate.']],
  ],
};
const SEEN = 'walkthrough_seen';
// Opens an area's walkthrough the first time this device enters it.
export function firstRun(area) {
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch { return; }
  if (seen[area]) return;
  seen[area] = new Date().toISOString(); try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch { return; }
  openTour(area === 'floor' ? {} : { cards: AREA_CARDS[area], label: area === 'stockroom' ? 'The Stockroom' : 'The Back dock' });
}

export function openTour({ start = 0, cards = CARDS, label = 'How the app works' } = {}) {
  if (!cards?.length) return;
  // On a phone the lines about the desk (the rail, keyboard shortcuts) are left out.
  const phone = (document.querySelector('.frame')?.clientWidth || innerWidth) <= 600;
  const CARDS = phone ? cards.map(([icon, col, title, lines]) => [icon, col, title, lines.filter(l => !/^On a desk\b/.test(l))]) : cards;
  document.getElementById('tour')?.remove();
  let i = Math.max(0, Math.min(CARDS.length - 1, start));
  const el = document.createElement('div'); el.id = 'tour'; el.className = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
  const paint = () => {
    const [icon, col, title, lines] = CARDS[i];
    el.innerHTML = `<div class="tour-card" style="--tc:${col}"><button class="tour-x" data-tour="close" aria-label="Close">${ic('x')}</button><div class="tour-ic">${ic(icon)}</div><div class="tour-step">${i + 1} of ${CARDS.length}</div><h2>${esc(title)}</h2><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` +
      `<div class="tour-dots">${CARDS.map((_, k) => `<button class="${k === i ? 'on' : ''}" data-tour="${k}" aria-label="Card ${k + 1}"></button>`).join('')}</div>` +
      `<div class="tour-acts">${i ? `<button class="btn" data-tour="prev">${ic('chev')}Back</button>` : '<span></span>'}<button class="btn primary" data-tour="${i === CARDS.length - 1 ? 'close' : 'next'}">${i === CARDS.length - 1 ? 'Done' : 'Next'}${i === CARDS.length - 1 ? '' : ic('arrow')}</button></div></div>`;
    el.querySelector('.tour-acts .primary')?.focus({ preventScroll: true });
  };
  const go = k => { if (k < 0 || k >= CARDS.length || k === i) return; i = k; haptic('select'); paint(); };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(i + 1); else if (e.key === 'ArrowLeft') go(i - 1); };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('[data-tour]'); if (!b) return;
    const a = b.dataset.tour;
    if (a === 'close') close(); else if (a === 'next') go(i + 1); else if (a === 'prev') go(i - 1); else go(Number(a));
  });
  // A swipe of 50px or more turns the card (ShelfSearcher's threshold).
  let sx = null;
  el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') sx = e.clientX; });
  el.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) >= 50) go(i + (dx < 0 ? 1 : -1)); });
  document.addEventListener('keydown', onKey);
  (document.querySelector('.frame') || document.body).appendChild(el);
  paint();
}
