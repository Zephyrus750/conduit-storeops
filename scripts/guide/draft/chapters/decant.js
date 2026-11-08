// Redrawn chapter (DRAFT): Decant on the phone. Being drawn.
import { tx } from '../../i18n.js';
import { phone2 } from '../frames.js';

export const decant = {
  id: 'decantphone', grp: 'dock', icon: 'box', title: tx('Run the decant on the phone'), device: 'phone', where: tx('Phone · Back dock › Decant'), for: ['dock', 'manager'],
  intro: tx('Being redrawn.'), html: () => phone2('dc', '', { area: 'backdock', on: 'decant' }),
  steps: [{ cap: tx('Being redrawn.'), read: '', dev: '', ev: [], run: async () => {} }], stories: [],
};
