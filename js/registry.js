// The one view registry. A view is { id, title, icon, desktop(ctx),
// mobile?(ctx), mount?(ctx, root) → [unsubscribe...] }. Modes render into
// the shell's content region through this and own no chrome of their own.

import dashboard from './views/dashboard.js';
import map from './views/map.js';
import picklist from './views/picklist.js';
import refresh from './views/refresh.js';
import labelint from './views/labelint.js';
import emergency from './views/emergency.js';
import maintenance from './views/maintenance.js';
import stocktake from './views/stocktake.js';
import settings from './views/settings.js';
import { ADMIN_VIEWS } from './views/admin.js';

export const VIEWS = Object.fromEntries([dashboard, map, picklist, refresh, labelint, emergency, maintenance, stocktake, settings, ...ADMIN_VIEWS].map(v => [v.id, v]));

// Rail sections and the phone tab strip per workspace. Rows without a view
// yet are inert and say so.
export const RAIL = [
  { sec: 'Store', rows: ['map', 'picklist', 'refresh', 'labelint', 'emergency', 'maintenance', 'stocktake'] },
  { sec: 'Back dock', rows: [['receiving', 'Receiving', 'm-receiving'], ['manifests', 'Manifests', 'm-manifests']], soon: true },
  { sec: 'Stockroom', rows: [['bfreview', 'Backfill review', 'm-bfreview'], ['cages', 'Cages', 'm-cages'], ['adjust', 'Adjustments', 'm-adjust'], ['daylist', 'Day list', 'm-daylist']], soon: true },
];
export const STRIP = {
  floor: [['mhome', 'home', 'Home'], ['refresh', 'm-refresh', 'Refresh'], ['labelint', 'm-labelint', 'Labels'], ['picklist', 'm-picklist', 'Route'], ['emergency', 'm-emergency', 'Emergency'], ['more', 'dots', 'More']],
  admin: [['admin', 'grid', 'Stores'], ['adminreg', 'plus', 'Register'], ['adminactions', 'history', 'Actions'], ['settings', 'm-settings', 'Settings']],
};
// The owner console's rail: stores are added at runtime, these are the system rows.
export const ADMIN_RAIL = [['admin', 'grid', 'Overview'], ['adminreg', 'plus', 'Register a store'], ['adminactions', 'history', 'Owner actions']];
export const MORE = { floor: [['stocktake', 'm-stocktake', 'Stocktake'], ['maintenance', 'm-maintenance', 'Report an issue'], ['settings', 'm-settings', 'Settings']] };
