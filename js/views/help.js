// Help: the tour and the written guide, for the phone's More sheet (on a
// desk the same guide is Settings › How to use).

import { ic, vh, mhead } from '../ui.js';
import { openTour } from '../tour.js';
import { openWhatsNew } from '../whatsnew.js';
import { howtoBody } from './settings.js';

export default {
  id: 'help', title: 'Help', icon: 'star',
  desktop() { return vh('Help', 'How the app works', `<button class="btn" data-act="whatsnew">${ic('star')}What’s new</button><button class="btn primary" data-act="tour">${ic('star')}Take the tour</button>`, 'star') + `<div class="stg-body help-body">${howtoBody()}</div>`; },
  mobile() { return mhead('Help', 'How the app works') + `<button class="mv-big" data-act="tour">${ic('star')}Take the tour</button><button class="mv-ghost" data-act="whatsnew">What’s new</button><div class="stg-body help-body">${howtoBody(true)}</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', e => { if (e.target.closest('[data-act="tour"]')) openTour(); else if (e.target.closest('[data-act="whatsnew"]')) openWhatsNew(ctx.go); });
    if (ctx.arg?.tour) openTour();
    return [];
  },
};
