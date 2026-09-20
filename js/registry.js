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
import bfreview from './views/stockroom/bfreview.js';
import cages from './views/stockroom/cages.js';
import adjust from './views/stockroom/adjust.js';
import daylist from './views/stockroom/daylist.js';
import srhistory from './views/stockroom/srhistory.js';
import srhome from './views/stockroom/srhome.js';
import receiving from './views/backdock/receiving.js';
import bdhome from './views/backdock/bdhome.js';

export const VIEWS = Object.fromEntries([dashboard, map, picklist, refresh, labelint, emergency, maintenance, stocktake, settings, bfreview, cages, adjust, daylist, srhistory, srhome, receiving, bdhome, ...ADMIN_VIEWS].map(v => [v.id, v]));

// Rail sections and the phone tab strip per workspace. Rows without a view
// yet are inert and say so.
export const RAIL = [
  { sec: 'Store', rows: ['map', 'picklist', 'refresh', 'labelint', 'emergency', 'maintenance', 'stocktake'] },
  { sec: 'Back dock', rows: ['receiving', ['manifests', 'Manifests', 'm-manifests'], ['rhistory', 'History', 'm-rhistory']] },
  { sec: 'Stockroom', rows: ['bfreview', 'cages', 'adjust', 'daylist', 'srhistory'] },
];
export const STRIP = {
  floor: [['mhome', 'home', 'Home'], ['refresh', 'm-refresh', 'Refresh'], ['labelint', 'm-labelint', 'Labels'], ['picklist', 'm-picklist', 'Route'], ['emergency', 'm-emergency', 'Emergency'], ['more', 'dots', 'More']],
  stockroom: [['mhome', 'home', 'Home'], ['bfreview', 'barcode', 'Scan'], ['cages', 'm-cages', 'Cages'], ['adjust', 'm-adjust', 'Adjust'], ['more', 'dots', 'More']],
  backdock: [['mhome', 'home', 'Home'], ['receiving', 'm-receiving', 'Dock'], ['more', 'dots', 'More']],
  admin: [['admin', 'grid', 'Stores'], ['adminreg', 'plus', 'Register'], ['adminactions', 'history', 'Actions'], ['settings', 'm-settings', 'Settings']],
};
// Phone home per workspace, and the workspaces the launcher offers.
export const HOME = { floor: 'map', stockroom: 'srhome', backdock: 'bdhome', admin: 'admin' };
export const WORKSPACES = [['floor', 'Floor', 'm-map', 'Map, refresh, labels, stocktake, issues'], ['stockroom', 'Stockroom', 'box', 'Backfill scan, cages, adjustments, day list'], ['backdock', 'Back dock', 'truck', 'Land and decant pallets, run the truck']];
// The owner console's rail: stores are added at runtime, these are the system rows.
export const ADMIN_RAIL = [['admin', 'grid', 'Overview'], ['adminreg', 'plus', 'Register a store'], ['adminactions', 'history', 'Owner actions']];
export const MORE = { floor: [['stocktake', 'm-stocktake', 'Stocktake'], ['maintenance', 'm-maintenance', 'Report an issue'], ['settings', 'm-settings', 'Settings']], stockroom: [['daylist', 'm-daylist', 'Day list'], ['srhistory', 'm-srhistory', 'History'], ['settings', 'm-settings', 'Settings']], backdock: [['settings', 'm-settings', 'Settings']] };
