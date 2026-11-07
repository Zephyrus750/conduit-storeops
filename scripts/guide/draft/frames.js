// Drawing pieces the redrawn chapters share (DRAFT): a phone at the app's own
// size (390 × 844, the shell's phone layout), its top bar and an area's tabs,
// the bottom sheet, the toast and the camera with real Code 128 labels.
// Words go through tx(), using the app's own keys wherever the screen shows
// the same words; data (bays, consols, codes, D-numbers) stays as written.
import { tx } from '../i18n.js';

export const ai = (n, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="icons.svg#i-${n}"/></svg>`;

// The phone's tabs per area, as js/registry.js STRIP has them.
const STRIPS = () => ({
  floor: [['mhome', 'home', tx('Home')], ['refresh', 'm-refresh', tx('Refresh')], ['labelint', 'm-labelint', tx('Labels')], ['picklist', 'm-picklist', tx('Route')], ['emergency', 'm-emergency', tx('Emergency')], ['more', 'dots', tx('More')]],
  stockroom: [['mhome', 'home', tx('Home')], ['bfreview', 'm-backfill', tx('Backfill')], ['cages', 'm-cages', tx('Cages')], ['adjust', 'm-adjust', tx('Adjust')], ['more', 'dots', tx('More')]],
  backdock: [['mhome', 'home', tx('Home')], ['receiving', 'm-receiving', tx('Receive')], ['decant', 'box', tx('Decant')], ['teamboard', 'users', tx('Board')], ['more', 'dots', tx('More')]],
});

// A phone: body is the screen under the top bar; strip the bar above the tabs;
// extra goes over everything (the camera). The sheet and toast start hidden.
export function phone2(id, body, { area = 'floor', on = 'mhome', strip = '', extra = '' } = {}) {
  return `<div class="dv ph2" id="${id}"><div class="dvs p2">` +
    `<div class="p2-top"><span class="p2-search">${ai('search')}<span>${tx('Search')}</span>${ai('mic')}</span><span class="p2-ib">?</span><span class="p2-ib">${ai('grid')}</span></div>` +
    `<div class="p2-body">${body}</div>` +
    `<div class="p2-strip"${strip ? '' : ' hidden'}>${strip}</div>` +
    `<nav class="p2-tabs">${STRIPS()[area].map(([k, i, l]) => `<span data-tab="${k}"${k === on ? ' class="on"' : ''}>${ai(i)}${l}</span>`).join('')}</nav>` +
    `<div class="p2-dim" hidden></div><div class="p2-sheet" hidden></div>${extra}<div class="dv-toast" hidden></div><i class="fg"></i></div></div>`;
}
// Step helpers on a drawn phone: c is the player's helpers.
export const tab = (c, k) => { c.cls('.p2-tabs span', 'on', false); c.cls(`.p2-tabs [data-tab="${k}"]`, 'on', true); };
export const sheet = (c, html) => { c.html('.p2-sheet', html); c.show('.p2-dim'); c.show('.p2-sheet'); };
export const unsheet = c => { c.hide('.p2-dim'); c.hide('.p2-sheet'); };
export const sheetHead = (icon, title) => `<div class="sh-h">${ai(icon)}<b>${title}</b><span class="sh-x" data-x>${ai('x')}</span></div>`;
// A toast at the top (the app's toast on a phone); html may carry an Open link as <u>.
export const toast2 = (c, html, tone = '') => { c.html('.p2 > .dv-toast', html); c.cls('.p2 > .dv-toast', 'bad', tone === 'bad'); c.show('.p2 > .dv-toast'); };

// ── Code 128, code set C: a consolidation label's barcode, drawn for real ──
const W = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
export function bars(digits) {
  const v = [105]; for (let i = 0; i < digits.length; i += 2) v.push(Number(digits.slice(i, i + 2)));
  v.push(v.reduce((s, x, i) => s + x * (i || 1), 0) % 103); v.push(106);
  let x = 6, r = '';
  [...v.map(k => W[k]).join('')].forEach((w, i) => { if (i % 2 === 0) r += `<rect x="${x}" width="${w}" height="40"/>`; x += Number(w); });
  return `<svg viewBox="0 0 ${x + 6} 40" preserveAspectRatio="none" aria-hidden="true"><rect width="100%" height="40" fill="#fff"/><g fill="#111">${r}</g></svg>`;
}
// A DC consolidation label as it is printed (data, so English as the DC writes it).
export const label = ({ cons, dept, name, ctns, n, of = 12, man = '7040301', despatch = '06/11/2026' }) =>
  `<div class="lab2"><div class="r1">CONSOLIDATION<span>STORE <b>1241</b></span></div><div class="r2">DC 4101533 · DESPATCH ${despatch} · MANIFEST ${man}</div>` +
  `${bars(cons)}<div class="hr">${cons.replace(/(\d{4})(?=\d)/g, '$1 ')}</div><div class="r3"><span>DEPT <b>${dept}</b> ${name}</span><span>CTNS <b>${ctns}</b></span><span><b>${n}</b> OF ${of}</span></div></div>`;
// The camera (js/scan.js), full screen over the phone, with labels on a wrapped pallet.
export const camera2 = labels => `<div class="cam2" hidden><div class="cam2-top"><b>${tx('Scan with the camera')}</b><span>${ai('bolt')}</span><span data-camx>${ai('x')}</span></div>` +
  `<div class="cam2-v"><div class="cam2-sc">${labels}</div><div class="cam2-aim"></div><div class="cam2-hint">${tx('Point the camera at the barcode')}</div></div>` +
  `<div class="cam2-f"><span>${tx('Or type the code')}</span><span>${ai('arrow')}</span></div><div class="cam2-t"></div></div>`;
export const tally = (n, code) => tx('<b>{n}</b> scanned · last <span class="mono">{code}</span>', { n, code });
