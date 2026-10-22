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
import srloc from './views/stockroom/srloc.js';
import srdepts from './views/stockroom/depts.js';
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
import { tx } from './i18n.js';

export const VIEWS = Object.fromEntries([dashboard, map, picklist, refresh, labelint, emergency, maintenance, mapedits, stocktake, inventory, printmap, help, fieldmode, settings, storeinfo, bfreview, cages, adjust, daylist, srhistory, srhome, srloc, srdepts, srintel, srtrends, codelist, receiving, bdhome, manifests, planner, rhistory, profiles, dockscreen, teamboard, wallboard, danalytics, ...ADMIN_VIEWS].map(v => [v.id, v]));

// Rail sections and the phone tab strip per workspace. Rows without a view
// yet are inert and say so.
export const RAIL = [
  { sec: tx('Store'), rows: ['map', 'picklist', 'refresh', 'labelint', 'emergency', 'maintenance', 'stocktake', 'inventory', 'printmap', 'mapedits'] },
  { sec: tx('Back dock'), rows: ['receiving', 'teamboard', 'dockscreen', 'wallboard', 'rhistory', 'danalytics', 'manifests', 'profiles'] },
  { sec: tx('Stockroom'), rows: ['bfreview', 'cages', 'adjust', 'daylist', 'srintel', 'srtrends', 'codelist', 'srhistory'] },
];
export const STRIP = {
  floor: [['mhome', 'home', tx('Home')], ['refresh', 'm-refresh', tx('Refresh')], ['labelint', 'm-labelint', tx('Labels')], ['picklist', 'm-picklist', tx('Route')], ['emergency', 'm-emergency', tx('Emergency')], ['more', 'dots', tx('More')]],
  stockroom: [['mhome', 'home', tx('Home')], ['bfreview', 'barcode', tx('Scan')], ['cages', 'm-cages', tx('Cages')], ['adjust', 'm-adjust', tx('Adjust')], ['more', 'dots', tx('More')]],
  backdock: [['mhome', 'home', tx('Home')], ['receiving', 'm-receiving', tx('Land')], ['teamboard', 'users', tx('Board')], ['more', 'dots', tx('More')]],
  admin: [['admin', 'grid', tx('Stores')], ['adminreg', 'plus', tx('Register')], ['adminactions', 'history', tx('Actions')], ['settings', 'm-settings', tx('Settings')]],
};
// Phone home per workspace, and the workspaces the launcher offers.
export const HOME = { floor: 'map', stockroom: 'srhome', backdock: 'bdhome', admin: 'admin' };
export const WORKSPACES = [['floor', tx('Floor'), 'm-map', tx('Map, refresh, labels, routes, stocktake')], ['stockroom', tx('Stockroom'), 'box', tx('Backfill scan, cages, adjustments, day list')], ['backdock', tx('Back dock'), 'truck', tx('Land and decant pallets, run the truck')]];
// The owner console's rail: stores are added at runtime, these are the system rows.
export const ADMIN_RAIL = [['admin', 'grid', tx('Overview')], ['adminmaps', 'm-map', tx('Maps')], ['adminservice', 'm-settings', tx('Service')], ['adminreg', 'plus', tx('Register a store')], ['adminactions', 'history', tx('Owner actions')]];
// The phone's More sheet: each area's tools (with a line on what each is
// for), then the store and the app; Switch area and Sign out sit at the foot.
// A desk-only view drops out (Maintenance shows on a manager's phone only).
export const MORE = {
  floor: [['stocktake', 'm-stocktake', tx('Stocktake'), tx('Count shelves in a session')], ['maintenance', 'm-maintenance', tx('Maintenance'), tx('Report a fault, with photos')], ['mapedits', 'edit', tx('Suggest map edits'), tx('A wrong name or a missing shelf')], ['storeinfo', 'm-store', tx('Store details')], ['help', 'star', tx('Help')], ['settings', 'm-settings', tx('Settings')]],
  stockroom: [['daylist', 'm-daylist', tx('Day list'), tx('What to backfill next')], ['codelist', 'barcode', tx('Quick Scan'), tx('Scan codes into a list')], ['srhistory', 'm-srhistory', tx('History'), tx('Today’s sent bays')], ['maintenance', 'm-maintenance', tx('Maintenance'), tx('Report a fault, with photos')], ['storeinfo', 'm-store', tx('Store details')], ['help', 'star', tx('Help')], ['settings', 'm-settings', tx('Settings')]],
  backdock: [['rhistory', 'm-rhistory', tx('History'), tx('Finished trucks')], ['dockscreen', 'grid', tx('Dock screen'), tx('The big screen at the dock')], ['wallboard', 'chart', tx('Wallboard'), tx('Progress for the team')], ['maintenance', 'm-maintenance', tx('Maintenance'), tx('Report a fault, with photos')], ['storeinfo', 'm-store', tx('Store details')], ['help', 'star', tx('Help')], ['settings', 'm-settings', tx('Settings')]],
};
export const MORE_STORE = ['storeinfo', 'help', 'settings'];
