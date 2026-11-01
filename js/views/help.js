// Help: the Visual Guide (js/guide/), every task played on the device it is
// done on, with the tour and What's new beside it. On a desk it sits at the
// foot of the rail; on a phone it is in the More sheet. The ? in the top bar
// and the phone's app bar opens it at the chapter for the screen in hand
// ({ chapter }: GUIDE_OF in js/registry.js), and so does a ?guide= link.

import { ic, vh, mhead } from '../ui.js';
import { openTour } from '../tour.js';
import { openWhatsNew } from '../whatsnew.js';
import { mountGuide } from '../guide/player.js';
import { tx } from '../i18n.js';

export default {
  id: 'help', title: tx('Help'), icon: 'star',
  desktop() { return vh(tx('Help'), tx('How the app works'), `<button class="btn" data-act="whatsnew">${ic('star')}${tx('What’s new')}</button><button class="btn primary" data-act="tour">${ic('star')}${tx('Take the tour')}</button>`, 'star') + '<div class="vg-host"></div>'; },
  mobile() { return mhead(tx('Help'), tx('How the app works')) + `<button class="mv-big" data-act="tour">${ic('star')}${tx('Take the tour')}</button><button class="mv-ghost" data-act="whatsnew">${tx('What’s new')}</button><div class="vg-host"></div>`; },
  mount(ctx, root) {
    root.addEventListener('click', e => { if (e.target.closest('[data-act="tour"]')) openTour(); else if (e.target.closest('[data-act="whatsnew"]')) openWhatsNew(ctx.go); });
    if (ctx.arg?.tour) openTour();
    const host = root.querySelector('.vg-host');
    return host ? [mountGuide(host, { storeNo: ctx.storeNo, storeName: ctx.storeName, arg: ctx.arg })] : [];
  },
};
