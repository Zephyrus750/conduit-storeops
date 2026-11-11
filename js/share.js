// Share a shelf: a link that opens this store's map on that shelf, as a QR
// code to scan from another phone, a copy button and the system share sheet
// (ShelfSearcher's shareShelfLink, with the QR made offline in shared/qr.js).
//   ?store=1241&shelf=A16S1 → the shell opens the map with that shelf.

import { ic, esc, toast, DEPT_NAME } from './ui.js';
import { openSheet } from './sheet.js';
import { qrSvg } from '../shared/qr.js';
import { tx } from './i18n.js';

export const shelfLink = (storeNo, shelf) => `${location.origin}${location.pathname}?store=${encodeURIComponent(storeNo)}&shelf=${encodeURIComponent(shelf)}`;
// A maintenance issue (the work order's QR code): ?store=1241&issue=m… opens it in Maintenance.
export const issueLink = (storeNo, issue) => `${location.origin}${location.pathname}?store=${encodeURIComponent(storeNo)}&issue=${encodeURIComponent(issue)}`;
// A piece of equipment (its QR label): ?store=1241&equip=q… opens its card in Equipment checks.
export const equipLink = (storeNo, equip) => `${location.origin}${location.pathname}?store=${encodeURIComponent(storeNo)}&equip=${encodeURIComponent(equip)}`;
// A screen (a printed sheet's QR code): ?store=1241&view=adjust opens it.
export const viewLink = (storeNo, view) => `${location.origin}${location.pathname}?store=${encodeURIComponent(storeNo)}&view=${encodeURIComponent(view)}`;
// A chapter of the Visual Guide (its printed page's QR code): ?store=1241&guide=cages opens Help on it.
export const guideLink = (storeNo, chapter) => `${location.origin}${location.pathname}?store=${encodeURIComponent(storeNo)}&guide=${encodeURIComponent(chapter)}`;

// shelf is the code the link carries ("A16S2"); name is the shelf as the
// map writes it ("A16 S2") for the words around it.
export function openShare({ storeNo, storeName, shelf, name = shelf, dept }) {
  document.getElementById('sharesheet')?.remove();
  const url = shelfLink(storeNo, shelf), qr = qrSvg(url, { cell: 5 });
  const sheet = openSheet({
    title: tx('Share {shelf}', { shelf: esc(name) }), label: tx('Share shelf {shelf}', { shelf: name }), cls: 'sh-sheet',
    sub: `${dept ? `${esc(DEPT_NAME[dept] || dept)} · ` : ''}${esc(storeName || '')} #${esc(storeNo)}`,
    body: `<div class="sh-qr">${qr || `<p class="lbl">${tx('This link is too long for a QR code.')}</p>`}</div><p class="lbl">${tx('Scan with another phone to open the map on this shelf. Signed-in devices of this store open it straight away.')}</p><div class="sh-url mono">${esc(url)}</div>`,
    foot: `${navigator.share ? `<button class="btn" data-sh="share">${ic('arrow')}${tx('Share…')}</button>` : ''}<button class="btn primary" data-sh="copy">${ic('clip')}${tx('Copy link')}</button>`,
    onClick: async e => {
      const a = e.target.closest('[data-sh]'); if (!a) return;
      if (a.dataset.sh === 'copy') { try { await navigator.clipboard.writeText(url); toast(tx('Link copied')); } catch { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast(tx('Link copied')); } catch { toast(tx('Copy failed: select the link and copy it'), 'bad'); } t.remove(); } }
      else if (a.dataset.sh === 'share') { try { await navigator.share({ title: tx('Shelf {shelf} · store {store}', { shelf: name, store: storeNo }), text: tx('Shelf {shelf} at store {store}', { shelf: name, store: storeNo }), url }); } catch {} }
    },
  });
  sheet.el.id = 'sharesheet';
}

// The link a device was opened with: { store, shelf }, { store, issue }, { store, equip }
// or { store, guide } once, then the query is cleared so a reload does not repeat it.
export function takeDeepLink() {
  const q = new URLSearchParams(location.search), store = q.get('store'), shelf = q.get('shelf'), issue = q.get('issue'), equip = q.get('equip'), guide = q.get('guide'), view = q.get('view');
  if (!store || (!shelf && !issue && !equip && !guide && !view)) return null;
  q.delete('store'); q.delete('shelf'); q.delete('issue'); q.delete('equip'); q.delete('guide'); q.delete('view'); q.delete('cachebust');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  if (guide) return { store: String(store).slice(0, 12), guide: String(guide).replace(/[^\w-]/g, '').slice(0, 40) };
  if (view) return { store: String(store).slice(0, 12), view: String(view).replace(/[^\w-]/g, '').slice(0, 40) };
  if (equip) return { store: String(store).slice(0, 12), equip: String(equip).replace(/[^\w-]/g, '').slice(0, 40) };
  return issue ? { store: String(store).slice(0, 12), issue: String(issue).replace(/[^\w-]/g, '').slice(0, 40) } : { store: String(store).slice(0, 12), shelf: String(shelf).toUpperCase().slice(0, 24) };
}
