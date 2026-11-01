// Layouts (in development): planograms on the store map. The rail shows it
// faded with SOON; this page says it is coming and what it will do, from
// the plan agreed with the store (planograms read on upload, attached to
// shelves, a map mode coloured by planogram, module planning, and every
// keycode on a planogram given a floor home). Nothing here reads or writes.

import { ic } from '../ui.js';
import { tx } from '../i18n.js';

const FEATURES = () => [
  ['file', tx('Upload planograms'), tx('Drop one or many: Conduit reads each one’s name, department, date, modules and items, and shows a table to check.')],
  ['pin', tx('Attach to shelves'), tx('Pick shelves on the map, or a whole run, and attach a planogram from the day it takes effect.')],
  ['layers', tx('Layouts on the map'), tx('Shelves coloured by planogram. Tap one for its planogram, item list, print and history.')],
  ['grid', tx('Module planning'), tx('Set the planogram’s modules against the shelf’s, spill onto an end, and mark spare modules.')],
  ['barcode', tx('A floor home for every keycode'), tx('Search, Live pull and Backfill show which shelf and module an item lives on.')],
];

// A small map: a run of shelves in the three colours the mode will use.
const SHELVES = ['cur', 'cur', 'old', 'cur', 'none', 'cur', 'old', 'none', 'cur', 'cur'];
const preview = () => `<div class="lyt-map" aria-hidden="true"><div class="lyt-run">${SHELVES.map(k => `<i class="lyt-sh ${k}"></i>`).join('')}</div><div class="lyt-run">${[...SHELVES].reverse().map(k => `<i class="lyt-sh ${k}"></i>`).join('')}</div></div>` +
  `<div class="lyt-key"><span><i class="lyt-sh cur"></i>${tx('Current planogram')}</span><span><i class="lyt-sh old"></i>${tx('Replaced: print the new one')}</span><span><i class="lyt-sh none"></i>${tx('No planogram yet')}</span></div>`;

function page() {
  return `<div class="lyt"><div class="lyt-hero"><span class="lyt-ic">${ic('layers')}</span><span class="lyt-soon">${tx('Coming soon')}</span><h2>${tx('Layouts')}</h2><p>${tx('In development: planograms on the store map, shelf by shelf.')}</p></div>` +
    `<div class="lyt-show">${preview()}</div>` +
    `<div class="lyt-feats">${FEATURES().map(([icon, title, text]) => `<div class="lyt-f"><span class="lyt-fi">${ic(icon)}</span><b>${title}</b><small>${text}</small></div>`).join('')}</div></div>`;
}

export default {
  id: 'layouts', title: tx('Layouts'), icon: 'layers', area: 'floor', soon: true,
  desktop: page,
  mobile: page,
};
