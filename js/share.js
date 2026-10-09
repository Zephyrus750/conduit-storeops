// Share a shelf: a link that opens this store's map on that shelf, as a QR
// code to scan from another phone, a copy button and the system share sheet
// (ShelfSearcher's shareShelfLink, with the QR made offline in shared/qr.js).
//   ?store=1241&shelf=A16S1 → the shell opens the map with that shelf.

import { ic, esc, toast, dep, DEPT_NAME } from './ui.js';
import { qrSvg } from '../shared/qr.js';

export const shelfLink = (storeNo, shelf) => `${location.origin}${location.pathname}?store=${encodeURIComponent(storeNo)}&shelf=${encodeURIComponent(shelf)}`;
// A maintenance issue (the work order's QR code): ?store=1241&issue=m… opens it in Maintenance.
export const issueLink = (storeNo, issue) => `${location.origin}${location.pathname}?store=${encodeURIComponent(storeNo)}&issue=${encodeURIComponent(issue)}`;

export function openShare({ storeNo, storeName, shelf, dept }) {
  document.getElementById('sharesheet')?.remove();
  const url = shelfLink(storeNo, shelf), qr = qrSvg(url, { cell: 5 });
  const el = document.createElement('div');
  el.id = 'sharesheet'; el.className = 'sharesheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `Share shelf ${shelf}`);
  el.innerHTML = `<div class="sh-card"><div class="sh-h"><b>Share ${esc(shelf)}</b><button class="ibtn" data-sh="close" aria-label="Close">${ic('x')}</button></div>` +
    `<div class="sh-where">${dept ? dep(dept) + `<span>${esc(DEPT_NAME[dept] || dept)}</span>` : ''}<span class="cs-dim">${esc(storeName || '')} #${esc(storeNo)}</span></div>` +
    `<div class="sh-qr">${qr || '<p class="lbl">This link is too long for a QR code.</p>'}</div><p class="lbl">Scan with another phone to open the map on this shelf. Signed-in devices of this store open it straight away.</p>` +
    `<div class="sh-url mono">${esc(url)}</div><div class="sh-acts"><button class="btn primary sm" data-sh="copy">${ic('file')}Copy link</button>${navigator.share ? `<button class="btn sm" data-sh="share">${ic('arrow')}Share…</button>` : ''}</div></div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', async e => {
    if (e.target === el) return close();
    const a = e.target.closest('[data-sh]'); if (!a) return;
    if (a.dataset.sh === 'close') close();
    else if (a.dataset.sh === 'copy') { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Link copied'); } catch { toast('Copy failed: select the link and copy it', 'bad'); } t.remove(); } }
    else if (a.dataset.sh === 'share') { try { await navigator.share({ title: `Shelf ${shelf} · store ${storeNo}`, text: `Shelf ${shelf} at store ${storeNo}`, url }); } catch {} }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  el.querySelector('[data-sh="copy"]')?.focus();
}

// The link a device was opened with: { store, shelf } or { store, issue }
// once, then the query is cleared so a reload does not repeat it.
export function takeDeepLink() {
  const q = new URLSearchParams(location.search), store = q.get('store'), shelf = q.get('shelf'), issue = q.get('issue');
  if (!store || (!shelf && !issue)) return null;
  q.delete('store'); q.delete('shelf'); q.delete('issue'); q.delete('cachebust');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  return issue ? { store: String(store).slice(0, 12), issue: String(issue).replace(/[^\w-]/g, '').slice(0, 40) } : { store: String(store).slice(0, 12), shelf: String(shelf).toUpperCase().slice(0, 24) };
}
