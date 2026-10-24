// Screens (the Version A rail's foot): the full-screen boards for the wall
// PCs and the dock tablet, one card each, opening the board here. A wall PC
// or tablet signs in as Dock screen instead and opens straight on its board.

import { ic, vh } from '../../ui.js';
import { toolOff, toolForView } from '../../../shared/tools.js';
import { tx } from '../../i18n.js';

const BOARDS = [
  ['dockscreen', 'grid', tx('Dock screen'), tx('The pallet grid with a clock on every pallet being decanted, the hold-up banner and the crew. The crew runs the decant from it.'), tx('The dock tablet, or a wall PC on the dock.')],
  ['teamboard', 'users', tx('Team Board'), tx('The goal, the forecast finish, and who is decanting what right now and who is next.'), tx('A wall PC the team can see.')],
  ['wallboard', 'chart', tx('Wallboard'), tx('Progress, pace and hold-ups for the truck on the dock, and the plan for the day.'), tx('The back office, or a wall PC.')],
];

export default {
  id: 'screens', title: tx('Screens'), icon: 'expand', area: 'backdock',
  deskOnly: true,   // the phone opens the Dock screen from its More menu
  desktop(ctx) {
    const off = ctx.store.get('tools')?.off, boards = BOARDS.filter(b => !toolOff(off, toolForView(b[0])));
    return vh(tx('Screens'), tx('Full-screen boards for the wall PCs and the dock tablet.'), '', 'expand') +
      (boards.length ? `<div class="scr-list">${boards.map(([id, icon, name, what, where]) => `<div class="card scr-card"><div class="ch">${ic(icon)}<h3>${name}</h3></div><p>${what}</p><p class="lbl">${where}</p><button class="btn primary" data-view="${id}">${ic('expand')}${tx('Open')}</button></div>`).join('')}</div>` : `<div class="card"><p class="lbl">${tx('The dock boards are switched off for this store.')}</p></div>`) +
      `<div class="card scr-note">${ic('lock')}<p>${tx('Each board is also in Receiving and Results, with more detail. To set up a wall PC or the dock tablet, sign in on it as Dock screen: it opens straight on its board and never locks.')}</p></div>`;
  },
};
