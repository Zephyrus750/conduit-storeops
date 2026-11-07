// Redrawn chapter (DRAFT): Location refresh on the phone. Being redrawn.
import { tx } from '../../i18n.js';
import { phone2 } from '../frames.js';

export const refresh = {
  id: 'refresh', grp: 'floor', icon: 'refresh', title: tx('Location refresh'), device: 'phone', where: tx('Phone · Floor › Refresh'), for: ['floor', 'manager'],
  intro: tx('Being redrawn.'), html: () => phone2('rf', '', { area: 'floor', on: 'refresh' }),
  steps: [{ cap: tx('Being redrawn.'), read: '', dev: '', ev: [], run: async () => {} }], stories: [],
};
