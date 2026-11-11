// Paper. Printed sheets are the floor's other interface (the legacy apps
// printed worksheets, SOH lists, walk sheets and marking sheets), so each
// one is a real A4 layout, not a print of the screen: the sheet is built
// into #printroot, everything else is hidden for the print, and it is
// removed afterwards.
//
//   printSheet({ title, subtitle, body, landscape })
//     body is sheet HTML; the helpers below build its parts.

import { esc } from './ui.js';
import { tx, locale } from './i18n.js';
import { barcodeSvg } from '../shared/barcode.js';
import { qrSvg } from '../shared/qr.js';

// One look for every printed sheet (the review board's des-print): the
// shell says which store and screen a sheet is printed from (printFrom), and
// every sheet carries the store, the date, a QR code back to that screen,
// and on every page a footer with the store, the title and page n of m
// (CSS page margin boxes, so a long list numbers its own pages).
let from = { store: '', name: '', view: '', link: () => '' };
export function printFrom(f) { from = { ...from, ...f }; }
// The footer's words for CSS: a translated key with its {placeholders}
// turned into the page counters, quoted for a content: value.
const cssText = s => '"' + String(s).replace(/["\\]/g, '\\$&').replace(/\n/g, ' ') + '"';
function footCss(title) {
  const pg = cssText(tx('Page {n} of {total}')).replace('{n}', '" counter(page) "').replace('{total}', '" counter(pages) "');
  const left = cssText([from.name && from.store ? tx('{name} · store {no}', { name: from.name, no: from.store }) : from.store ? tx('Store {no}', { no: from.store }) : '', title].filter(Boolean).join(' · '));
  return `@page { @bottom-left { content: ${left}; font: 8pt system-ui, sans-serif; color: #444; } @bottom-right { content: ${pg}; font: 8pt system-ui, sans-serif; color: #444; } }`;
}

//   page   the paper, as CSS @page size ('A4 landscape', 'A3 portrait'); a
//          landscape sheet defaults to 'A4 landscape'
//   bare   no header: the body brings its own (the map composer's title strip)
//   mount  (root) → promise: fills the sheet once it is in the page (the
//          Visual Guide's pages, in a shadow root with their own stylesheet);
//          the print waits for it
export function printSheet({ title, subtitle = '', body, landscape = false, page = null, bare = false, mount = null, link = undefined }) {
  document.getElementById('printroot')?.remove(); document.getElementById('printpage')?.remove();
  const root = document.createElement('div'); root.id = 'printroot'; if (landscape) root.className = 'landscape';
  const size = page || (landscape ? 'A4 landscape' : null);
  const st = document.createElement('style'); st.id = 'printpage'; st.textContent = `@media print { @page { ${size ? `size: ${size}; ` : ''}margin: 10mm 10mm 14mm; } ${footCss(title)} }`; document.head.appendChild(st);
  const now = new Date(), url = link === undefined ? from.link(from.view) : link, qr = url ? qrSvg(url, { cell: 2, quiet: 2 }) : '';
  const who = from.name && from.store ? tx('{name} · store {no}', { name: from.name, no: from.store }) : from.store ? tx('Store {no}', { no: from.store }) : '';
  root.innerHTML = (bare ? '' : `<header class="ps-head"><div><h1>${esc(title)}</h1>${subtitle ? `<div class="ps-sub">${subtitle}</div>` : ''}</div><div class="ps-meta"><div class="ps-when">${who ? `<b>${esc(who)}</b>` : ''}<span>${tx('Printed {when}', { when: esc(now.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })) })}</span>${qr ? `<small>${tx('Scan to open this screen')}</small>` : ''}</div>${qr ? `<div class="ps-qr">${qr}</div>` : ''}</div></header>`) + body;
  document.body.appendChild(root); document.body.classList.add('printing');
  const done = () => { root.remove(); document.getElementById('printpage')?.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  const go = () => setTimeout(() => { window.print(); setTimeout(() => { if (root.isConnected && !matchMedia('print').matches) done(); }, 1500); }, 60);
  if (mount) Promise.resolve().then(() => mount(root)).catch(e => console.warn('print', e)).then(go); else go();
}

// A scannable barcode for paper: black on white, a little larger than on screen.
export const code = (value, opts = {}) => barcodeSvg(value, { module: 1.6, height: 40, ...opts });
export const tick = '<span class="ps-tick"></span>';
// A table: heads, rows of cells (HTML), optional column classes.
export function table(heads, rows, cls = []) {
  return `<table class="ps-tbl"><thead><tr>${heads.map((h, i) => `<th class="${cls[i] || ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${cls[i] || ''}">${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${heads.length}" class="ps-none">${tx('Nothing to list')}</td></tr>`}</tbody></table>`;
}
export const signoff = (who = tx('Checked by')) => `<div class="ps-sign"><span>${esc(who)}</span><span>${tx('Date')}</span><span>${tx('Time')}</span><span>${tx('Signature')}</span></div>`;
export const section = (title, inner) => `<section class="ps-sec"><h2>${title}</h2>${inner}</section>`;
