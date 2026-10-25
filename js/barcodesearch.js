// An item barcode the store can't match to a keycode itself: a shelf talker
// or a clearance ticket carries the item's own barcode, and so does a product
// the morning report has no barcode for. Kmart's site search, or a book's
// title, finds it (GET /v1/catalogue/barcode, worker/apnlookup.js). Live
// pull, Cages and Adjust search first and fall back to the keycode typed in
// their own scan box. Nothing is linked: the worker caches each answer by
// barcode, so the next scan of it is quick.
//
//   searchBarcode(ctx, gtin, onNames)  → { kc } one sure match | { list, source } a choice
//                                        | { why: 'none' | 'failed' }; onNames runs as the
//                                        choice's pictures and names land
//   barcodeCard(f)                     the card under the scan box, for
//                                        f = { state: 'searching' | 'choose' | 'manual', gtin, list, source, why }
//                                        Its buttons: data-act="bc-pick" (data-kc), "bc-type", "bc-again".

import { ic, esc } from './ui.js';
import { tx } from './i18n.js';

// Rendering Kmart's search page takes 10 to 30 seconds; the worker allows 45
// and finishes and caches it even if the phone stops waiting.
const SEARCH_WAIT_MS = 50_000;
const FAILED = /render|refused|Browser Rendering|Abort|Timeout/i;

export async function searchBarcode(ctx, gtin, onNames) {
  const b = await ctx.api(`/v1/catalogue/barcode?code=${encodeURIComponent(gtin)}`, { timeoutMs: SEARCH_WAIT_MS }).catch(() => null);
  const list = (b?.candidates || []).filter(c => /^\d{6,8}$/.test(c.kc)).map(c => ({ kc: c.kc, name: c.name || '', img: '' }));
  if (b?.sure && list.length === 1) return { kc: list[0].kc };
  if (list.length) {
    for (const c of list) ctx.catalogue.lookup(c.kc).then(it => { if (it) { Object.assign(c, { name: it.name || c.name, img: it.img || '' }); onNames?.(); } }).catch(() => {});
    return { list, source: b.source };
  }
  return { why: !b || FAILED.test(b.why || '') ? 'failed' : 'none' };
}

export function barcodeCard(f) {
  if (f.state === 'searching') return `<div class="card bcs-hint" role="status">${ic('search')}<p>${tx('Searching kmart.com.au for this barcode…')}<small>${tx('It can take up to half a minute.')}</small></p></div>`;
  if (f.state === 'choose') {
    return `<div class="bcs-ans info">${ic('search')}<span><b>${tx('Is this it?')}</b>${f.source === 'isbn' ? tx('Matched by the book’s title. Tap the right one.') : tx('Found on kmart.com.au from the barcode. Tap the right one.')}</span></div>` +
      `<div class="bcs-picks">${f.list.map(c => `<button type="button" class="card bcs-pick" data-act="bc-pick" data-kc="${esc(c.kc)}"><span class="bcs-pic">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ic('box')}</span><span class="bcs-pn"><b>${esc(c.name || c.kc)}</b><small class="mono">${esc(c.kc)}</small></span>${ic('arrow')}</button>`).join('')}</div>` +
      `<button type="button" class="bcs-a" data-act="bc-type">${tx('None of these: type the keycode')}</button>`;
  }
  return `<div class="bcs-ans warn">${ic('barcode')}<span><b>${f.why === 'none' ? tx('Not found on kmart.com.au') : f.why === 'failed' ? tx('Couldn’t search kmart.com.au') : tx('Type the keycode instead')}</b>${tx('Type its keycode in the box above, from the ticket, shelf label or carton.')}</span></div>` +
    `<p class="bcs-gtin">${tx('Barcode {code}', { code: `<span class="mono">${esc(f.gtin)}</span>` })}</p>` +
    (f.why === 'failed' ? `<button type="button" class="btn bcs-again" data-act="bc-again">${ic('refresh')}${tx('Search again')}</button>` : '');
}
