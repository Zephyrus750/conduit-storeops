// Redrawn chapter (DRAFT): Backfill review at the desk, on a PC. Being drawn.
import { tx } from '../../i18n.js';
import { pc, view } from '../pc.js';

export const bfreview = {
  id: 'bfreview', grp: 'stockroom', icon: 'list', title: tx('Backfill review at the desk'), device: 'pc', where: tx('PC · Stockroom › Backfill › Review'), for: ['stockroom', 'manager'],
  intro: tx('Being redrawn.'), html: () => pc(view('v-x', '', true), { on: 'backfill' }),
  steps: [{ cap: tx('Being redrawn.'), read: '', dev: '', ev: [], run: async () => {} }], stories: [],
};
