// Redrawn chapter (DRAFT): Price checks (Labels) on the phone. Being drawn.
import { tx } from '../../i18n.js';
import { phone2 } from '../frames.js';

export const labels = {
  id: 'labels', grp: 'floor', icon: 'tag', title: tx('Price checks'), device: 'phone', where: tx('Phone · Floor › Labels'), for: ['floor', 'manager'],
  intro: tx('Being redrawn.'), html: () => phone2('lb', '', { area: 'floor', on: 'labelint' }),
  steps: [{ cap: tx('Being redrawn.'), read: '', dev: '', ev: [], run: async () => {} }], stories: [],
};
