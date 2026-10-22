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

//   page   the paper, as CSS @page size ('A4 landscape', 'A3 portrait'); a
//          landscape sheet defaults to 'A4 landscape'
//   bare   no header: the body brings its own (the map composer's title strip)
export function printSheet({ title, subtitle = '', body, landscape = false, page = null, bare = false }) {
  document.getElementById('printroot')?.remove(); document.getElementById('printpage')?.remove();
  const root = document.createElement('div'); root.id = 'printroot'; if (landscape) root.className = 'landscape';
  const size = page || (landscape ? 'A4 landscape' : null);
  if (size) { const st = document.createElement('style'); st.id = 'printpage'; st.textContent = `@media print { @page { size: ${size}; margin: 10mm; } }`; document.head.appendChild(st); }
  const now = new Date();
  root.innerHTML = (bare ? '' : `<header class="ps-head"><div><h1>${esc(title)}</h1>${subtitle ? `<div class="ps-sub">${subtitle}</div>` : ''}</div><div class="ps-when">${tx('Printed {when}', { when: esc(now.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })) })}</div></header>`) + body;
  document.body.appendChild(root); document.body.classList.add('printing');
  const done = () => { root.remove(); document.getElementById('printpage')?.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (root.isConnected && !matchMedia('print').matches) done(); }, 1500); }, 60);
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
