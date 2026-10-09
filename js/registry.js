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
import mapedits from './views/mapedits.js';
import stocktake from './views/stocktake.js';
import inventory from './views/inventory.js';
import printmap from './views/printmap.js';
import help from './views/help.js';
import fieldmode from './views/fieldmode.js';
import settings from './views/settings.js';
import storeinfo from './views/storeinfo.js';
import { ADMIN_VIEWS } from './views/admin.js';
import bfreview from './views/stockroom/bfreview.js';
import cages from './views/stockroom/cages.js';
import adjust from './views/stockroom/adjust.js';
import daylist from './views/stockroom/daylist.js';
import srhistory from './views/stockroom/srhistory.js';
import srhome from './views/stockroom/srhome.js';
import srintel from './views/stockroom/intel.js';
import srtrends from './views/stockroom/srtrends.js';
import codelist from './views/stockroom/codelist.js';
import receiving from './views/backdock/receiving.js';
import bdhome from './views/backdock/bdhome.js';
import manifests from './views/backdock/manifests.js';
import planner from './views/backdock/planner.js';
import rhistory from './views/backdock/rhistory.js';
import profiles from './views/backdock/profiles.js';
import { dockscreen, teamboard } from './views/backdock/screens.js';
import wallboard from './views/backdock/wallboard.js';
import danalytics from './views/backdock/danalytics.js';

export const VIEWS = Object.fromEntries([dashboard, map, picklist, refresh, labelint, emergency, maintenance, mapedits, stocktake, inventory, printmap, help, fieldmode, settings, storeinfo, bfreview, cages, adjust, daylist, srhistory, srhome, srintel, srtrends, codelist, receiving, bdhome, manifests, planner, rhistory, profiles, dockscreen, teamboard, wallboard, danalytics, ...ADMIN_VIEWS].map(v => [v.id, v]));

// Rail sections and the phone tab strip per workspace. Rows without a view
// yet are inert and say so.
export const RAIL = [
  { sec: 'Store', rows: ['map', 'picklist', 'refresh', 'labelint', 'emergency', 'maintenance', 'stocktake', 'inventory', 'printmap', 'mapedits'] },
  { sec: 'Back dock', rows: ['receiving', 'teamboard', 'dockscreen', 'wallboard', 'rhistory', 'danalytics', 'manifests', 'profiles'] },
  { sec: 'Stockroom', rows: ['bfreview', 'cages', 'adjust', 'daylist', 'srintel', 'srtrends', 'codelist', 'srhistory'] },
];
export const STRIP = {
  floor: [['mhome', 'home', 'Home'], ['refresh', 'm-refresh', 'Refresh'], ['labelint', 'm-labelint', 'Labels'], ['picklist', 'm-picklist', 'Route'], ['emergency', 'm-emergency', 'Emergency'], ['more', 'dots', 'More']],
  stockroom: [['mhome', 'home', 'Home'], ['bfreview', 'barcode', 'Scan'], ['cages', 'm-cages', 'Cages'], ['adjust', 'm-adjust', 'Adjust'], ['more', 'dots', 'More']],
  backdock: [['mhome', 'home', 'Home'], ['receiving', 'm-receiving', 'Land'], ['teamboard', 'users', 'Board'], ['more', 'dots', 'More']],
  admin: [['admin', 'grid', 'Stores'], ['adminreg', 'plus', 'Register'], ['adminactions', 'history', 'Actions'], ['settings', 'm-settings', 'Settings']],
};
// Phone home per workspace, and the workspaces the launcher offers.
export const HOME = { floor: 'map', stockroom: 'srhome', backdock: 'bdhome', admin: 'admin' };
export const WORKSPACES = [['floor', 'Floor', 'm-map', 'Map, refresh, labels, stocktake, issues'], ['stockroom', 'Stockroom', 'box', 'Backfill scan, cages, adjustments, day list'], ['backdock', 'Back dock', 'truck', 'Land and decant pallets, run the truck']];
// The owner console's rail: stores are added at runtime, these are the system rows.
export const ADMIN_RAIL = [['admin', 'grid', 'Overview'], ['adminreg', 'plus', 'Register a store'], ['adminactions', 'history', 'Owner actions']];
export const MORE = {
  floor: [['stocktake', 'm-stocktake', 'Stocktake'], ['inventory', 'm-inventory', 'Inventory'], ['maintenance', 'm-maintenance', 'Report an issue'], ['mapedits', 'edit', 'Suggest map edits'], ['storeinfo', 'm-map', 'Store details'], ['help', 'star', 'Help'], ['settings', 'm-settings', 'Settings']],
  stockroom: [['daylist', 'm-daylist', 'Day list'], ['codelist', 'barcode', 'Quick Scan'], ['srhistory', 'm-srhistory', 'History'], ['storeinfo', 'm-map', 'Store details'], ['help', 'star', 'Help'], ['settings', 'm-settings', 'Settings']],
  backdock: [['manifests', 'file', 'Manifests'], ['profiles', 'box', 'Carton profiles'], ['planner', 'm-planner', 'Planner'], ['rhistory', 'm-rhistory', 'History'], ['dockscreen', 'grid', 'Dock screen'], ['wallboard', 'chart', 'Wallboard'], ['storeinfo', 'm-map', 'Store details'], ['help', 'star', 'Help'], ['settings', 'm-settings', 'Settings']],
};
