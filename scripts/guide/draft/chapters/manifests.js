// Redrawn chapter (DRAFT): Manifests by day and truck, on a PC. Being drawn.
import { tx } from '../../i18n.js';
import { pc, view } from '../pc.js';

export const manifests = {
  id: 'manifests', grp: 'dock', icon: 'clip', title: tx('Manifests by day and truck'), device: 'pc', where: tx('PC · Back dock › Plan › Manifests'), for: ['dock', 'manager'],
  intro: tx('Being redrawn.'), html: () => pc(view('v-x', '', true), { on: 'plan' }),
  steps: [{ cap: tx('Being redrawn.'), read: '', dev: '', ev: [], run: async () => {} }], stories: [],
};
