// Paper. Printed sheets are the floor's other interface (the legacy apps
// printed worksheets, SOH lists, walk sheets and marking sheets), so each
// one is a real A4 layout, not a print of the screen: the sheet is built
// into #printroot, everything else is hidden for the print, and it is
// removed afterwards.
//
//   printSheet({ title, subtitle, body, landscape })
//     body is sheet HTML; the helpers below build its parts.

import { esc } from './ui.js';
import { barcodeSvg } from '../shared/barcode.js';

export function printSheet({ title, subtitle = '', body, landscape = false }) {
  document.getElementById('printroot')?.remove();
  const root = document.createElement('div'); root.id = 'printroot'; if (landscape) root.className = 'landscape';
  const now = new Date();
  root.innerHTML = `<header class="ps-head"><div><h1>${esc(title)}</h1>${subtitle ? `<div class="ps-sub">${subtitle}</div>` : ''}</div><div class="ps-when">Printed ${esc(now.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }))}</div></header>${body}`;
  document.body.appendChild(root); document.body.classList.add('printing');
  const done = () => { root.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (root.isConnected && !matchMedia('print').matches) done(); }, 1500); }, 60);
}

// A scannable barcode for paper: black on white, a little larger than on screen.
export const code = (value, opts = {}) => barcodeSvg(value, { module: 1.6, height: 40, ...opts });
export const tick = '<span class="ps-tick"></span>';
// A table: heads, rows of cells (HTML), optional column classes.
export function table(heads, rows, cls = []) {
  return `<table class="ps-tbl"><thead><tr>${heads.map((h, i) => `<th class="${cls[i] || ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${cls[i] || ''}">${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${heads.length}" class="ps-none">Nothing to list</td></tr>`}</tbody></table>`;
}
export const signoff = (who = 'Checked by') => `<div class="ps-sign"><span>${esc(who)}</span><span>Date</span><span>Time</span><span>Signature</span></div>`;
export const section = (title, inner) => `<section class="ps-sec"><h2>${title}</h2>${inner}</section>`;
