// Redrawn chapter (DRAFT): Backfill, scan a location, on the phone. Being redrawn.
import { tx } from '../../i18n.js';
import { phone2 } from '../frames.js';

export const bfscan = {
  id: 'bfscan', grp: 'stockroom', icon: 'barcode', title: tx('Backfill: scan a location'), device: 'phone', where: tx('Phone · Stockroom › Backfill'), for: ['stockroom'],
  intro: tx('Being redrawn.'), html: () => phone2('bf', '', { area: 'stockroom', on: 'bfreview' }),
  steps: [{ cap: tx('Being redrawn.'), read: '', dev: '', ev: [], run: async () => {} }], stories: [],
};
