// Redrawn chapter (DRAFT): Getting around on a PC. Being redrawn.
import { tx } from '../../i18n.js';

export const around = {
  id: 'around', grp: 'start', icon: 'grid', title: tx('Getting around on a PC'), device: 'pc', where: tx('PC · the rail, tabs, search and ?'), for: ['manager', 'dock'],
  intro: tx('Being redrawn.'), html: () => '<div class="dv pcf"><div class="dvs pc-scr"><i class="fg cur"></i></div></div>',
  steps: [{ cap: tx('Being redrawn.'), read: '', dev: '', ev: [], run: async () => {} }], stories: [],
};
