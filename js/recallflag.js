// Recalled and withdrawn products, wherever a product shows up: Live pull,
// Backfill (scan and review), Cages, Adjustments, search and the product
// card. Every device holds the list (shared/reducers/recall.js), so the flag
// needs no network.
//
//   recallFor(store, code)        the recall in force for a keycode or item barcode, or null
//   recallFlag(store, r, kc)      the red banner: what it is, move it to the recall bay, tell a manager,
//                                 and "I moved some" (records the stock found)
//   recallTag(r)                  the small red pill for a row in a list
//   recallTagFor(code)            that pill for a keycode, or '' (the open store's list)
//   openFound(store, id, kc)      the "I moved some" pop-up (the shell opens it for any
//                                 [data-shell-act="recall-found"] button)

import { ic, esc, toast } from './ui.js';
import { recallOf } from '../shared/reducers/recall.js';
import { tx } from './i18n.js';

// The open store, for code that names a product without a ctx at hand
// (nameHtml in the stockroom lists). The shell sets it when a store opens.
let current = null;
export const useRecallStore = store => { current = store; };
export const recallFor = (store, code) => recallOf((store || current)?.get?.('recalls'), code);
// The red pill before a product's name, when it is recalled or withdrawn.
export const recallTagFor = code => { const r = recallFor(null, code); return r ? recallTag(r) + ' ' : ''; };
export const recallWord = r => (r.kind === 'withdrawal' ? tx('Withdrawn') : tx('Recalled'));
export const recallTag = r => `<span class="rc-tag ${esc(r.kind)}" title="${esc(r.title)}">${ic('alert')}${recallWord(r)}</span>`;

export function recallFlag(store, r, kc = '') {
  const bay = store?.get?.('recalls')?.bay || '';
  const code = kc || r.kcs[0];
  return `<div class="rc-flag ${esc(r.kind)}" role="alert">${ic('alert')}<div class="rc-ft"><b>${recallWord(r)} · ${esc(r.title)}</b>` +
    `<span>${r.kind === 'withdrawal' ? tx('Don’t sell, pull or backfill it.') : tx('Don’t sell, pull or backfill it: it is a safety recall.')} ${bay ? tx('Move it to the recall bay ({bay}) and tell a manager.', { bay: `<b>${esc(bay)}</b>` }) : tx('Move it to the recall bay and tell a manager.')}</span>` +
    (r.action ? `<small>${esc(r.action)}</small>` : '') +
    `</div><button type="button" class="btn sm" data-shell-act="recall-found" data-recall="${esc(r.id)}" data-kc="${esc(code)}">${ic('check')}${tx('I moved some')}</button></div>`;
}

// The pop-up: how many went to the recall bay, and where they were.
export function openFound(store, id, kc) {
  const r = store?.get?.('recalls')?.items?.[id]; if (!r) return;
  document.getElementById('rcbox')?.remove();
  const el = document.createElement('div'); el.id = 'rcbox'; el.className = 'sscan rcbox';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', tx('Moved to the recall bay'));
  (document.querySelector('.frame') || document.body).appendChild(el);
  const bay = store.get('recalls')?.bay || '', codes = r.kcs.includes(kc) ? [kc, ...r.kcs.filter(k => k !== kc)] : r.kcs;
  let n = 1, busy = false;
  const close = () => { document.removeEventListener('keydown', onKey, true); el.remove(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  el.innerHTML = `<div class="ss-card rc-card"><div class="ss-top"><b>${ic('alert')}${tx('Moved to the recall bay')}</b><button class="ibtn" data-rc="close" aria-label="${tx('Close')}">${ic('x')}</button></div>` +
    `<div class="pb-body"><div class="pb-state bad">${ic('alert')}<div><b>${recallWord(r)} · ${esc(r.title)}</b><span>${bay ? tx('Recall bay: {bay}', { bay: esc(bay) }) : tx('Ask a manager where the recall bay is.')}</span></div></div>` +
    (codes.length > 1 ? `<label class="lbl" for="rcKc">${tx('Keycode')}</label><select class="ad-in mono" id="rcKc">${codes.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>` : `<input type="hidden" id="rcKc" value="${esc(codes[0])}">`) +
    `<label class="lbl" for="rcN">${tx('How many did you move?')}</label><div class="rc-n"><button class="btn" data-rc="minus" aria-label="${tx('One fewer')}">−</button><input class="ad-in mono" id="rcN" inputmode="numeric" value="1" aria-label="${tx('How many')}"><button class="btn" data-rc="plus" aria-label="${tx('One more')}">+</button></div>` +
    `<label class="lbl" for="rcWhere">${tx('Where were they?')}</label><input class="ad-in" id="rcWhere" maxlength="40" placeholder="${tx('Bay or shelf, like 7036 or A16 S2')}">` +
    `<div class="pb-acts"><button class="btn primary" data-rc="save">${ic('check')}${tx('Save')}</button><button class="btn" data-rc="close">${tx('Cancel')}</button></div><p class="lbl">${tx('Then tell a manager, so they know it has been moved.')}</p></div></div>`;
  const num = el.querySelector('#rcN');
  el.addEventListener('click', async e => {
    if (e.target === el) return close();
    const b = e.target.closest('[data-rc]'); if (!b) return;
    const act = b.dataset.rc;
    if (act === 'close') return close();
    if (act === 'minus' || act === 'plus') { n = Math.max(1, Math.min(9999, (Number(num.value) || 1) + (act === 'plus' ? 1 : -1))); num.value = String(n); return; }
    if (act === 'save' && !busy) {
      n = Math.round(Number(num.value)); if (!(n >= 1 && n <= 9999)) { toast(tx('Type how many, 1 or more'), 'bad'); return num.focus(); }
      busy = true;
      try {
        await store.dispatch({ type: 'recall.found', entity: { recall: r.id }, payload: { kc: el.querySelector('#rcKc').value, n, ...(el.querySelector('#rcWhere').value.trim() ? { where: el.querySelector('#rcWhere').value.trim() } : {}) } });
        close(); toast(tx('Saved. Now tell a manager.'));
      } catch (err) { busy = false; toast(err.message, 'bad'); }
    }
  });
  setTimeout(() => num.select(), 30);
}
