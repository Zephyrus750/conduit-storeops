// The one view registry. A view is { id, title, icon, desktop(ctx),
// mobile?(ctx), mount?(ctx, root) → [unsubscribe...] }. Modes render into
// the shell's content region through this and own no chrome of their own.

import dashboard from './views/dashboard.js';
import inputs from './views/inputs.js';
import map from './views/map.js';
import picklist from './views/picklist.js';
import refresh from './views/refresh.js';
import labelint from './views/labelint.js';
import emergency from './views/emergency.js';
import maintenance from './views/maintenance.js';
import mapedits from './views/mapedits.js';
import stocktake from './views/stocktake.js';
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
import receiving, { decant } from './views/backdock/receiving.js';
import bdhome from './views/backdock/bdhome.js';
import manifests from './views/backdock/manifests.js';
import planner from './views/backdock/planner.js';
import rhistory from './views/backdock/rhistory.js';
import profiles from './views/backdock/profiles.js';
import { dockscreen, teamboard } from './views/backdock/screens.js';
import wallboard from './views/backdock/wallboard.js';
import danalytics from './views/backdock/danalytics.js';
import offsite from './views/backdock/offsite.js';
import screens from './views/backdock/screenlist.js';
import livepull from './views/livepull.js';
import equipment from './views/equipment.js';
import recalls from './views/recalls.js';
import resources from './views/resources.js';
import layouts from './views/layouts.js';
import adminresources from './views/adminresources.js';
import adminzones from './views/adminzones.js';
import mtoday from './views/mtoday.js';
import tasks, { taskwalks } from './views/tasks.js';
import { tx } from './i18n.js';

export const VIEWS = Object.fromEntries([dashboard, mtoday, inputs, map, layouts, picklist, refresh, labelint, emergency, maintenance, equipment, recalls, mapedits, stocktake, printmap, help, fieldmode, settings, storeinfo, bfreview, cages, adjust, daylist, srhistory, srhome, srloc, srdepts, srintel, srtrends, codelist, receiving, decant, bdhome, manifests, planner, rhistory, profiles, dockscreen, teamboard, wallboard, danalytics, offsite, screens, ...ADMIN_VIEWS, livepull, resources, adminresources, adminzones, tasks, taskwalks].map(v => [v.id, v]));

// The desktop rail (Version A, 23 Oct 2026): Today, Reports & files and
// Resources (managers) on top, then a few rows per area, then the foot. A row is one screen or a group of screens
// shown as tabs above whichever is open; the row opens the one used last
// (the first at the start). A tab's label is the screen's own name unless
// the group gives a shorter one. `also`: screens the row stands for with no
// tab of their own (Print map and Suggest edits open from the Store map).
// `soon`: a row for a screen still being built, shown faded with SOON; it
// opens a page that says so (Layouts).
const G = (label, icon, tabs, also = [], soon = false) => ({ label, icon, tabs: tabs.map(t => typeof t === 'string' ? [t, null] : t), also, soon });
export const GROUPS = {
  today: G(tx('Dashboard'), 'm-dashboard', ['dashboard']),
  inputs: G(tx('Reports & files'), 'file', ['inputs']),
  resources: G(tx('Resources'), 'library', ['resources']),
  map: G(tx('Store map'), 'm-map', ['map'], ['printmap', 'mapedits', 'fieldmode']),
  layouts: G(tx('Layouts'), 'plan', ['layouts'], [], true),
  floorchecks: G(tx('Floor checks'), 'listcheck', ['refresh', 'labelint', 'stocktake']),
  picklist: G(tx('Pick list'), 'm-picklist', ['picklist']),
  safety: G(tx('Safety & upkeep'), 'm-emergency', ['emergency', 'maintenance', ['equipment', tx('Equipment')], 'recalls']),
  backfill: G(tx('Backfill'), 'm-backfill', [['bfreview', tx('Review')], 'daylist', ['srhistory', tx('History')], 'srtrends', 'livepull']),
  accuracy: G(tx('Stock accuracy'), 'm-adjust', ['adjust', 'srintel', ['codelist', tx('Quick Scan')]], ['srloc']),
  cages: G(tx('Cages'), 'm-cages', ['cages']),
  receiving: G(tx('Receiving'), 'm-receiving', [['receiving', tx('Truck')], 'teamboard']),
  plan: G(tx('Plan'), 'm-planner', ['planner', 'manifests', 'profiles', 'offsite']),
  results: G(tx('Results'), 'bars', [['rhistory', tx('History')], 'danalytics']),
  screens: G(tx('Screens'), 'expand', ['screens'], ['dockscreen', 'wallboard']),
  // Tasks (managers): today's checklists and their walks, and the walks before.
  tasktoday: G(tx('Today'), 'm-tasks', [['tasks', tx('Today')]]),
  taskwalks: G(tx('Walks'), 'history', ['taskwalks']),
  settings: G(tx('Settings'), 'm-settings', ['settings'], ['srdepts', 'storeinfo']),
  help: G(tx('Help'), 'help', ['help']),
};
export const RAIL = [
  { sec: tx('Floor'), rows: ['map', 'layouts', 'floorchecks', 'picklist', 'safety'] },
  { sec: tx('Stockroom'), rows: ['backfill', 'accuracy', 'cages'] },
  { sec: tx('Back dock'), rows: ['receiving', 'plan', 'results'] },
  { sec: tx('Tasks'), rows: ['tasktoday', 'taskwalks'] },
];
export const RAIL_TOP = ['today', 'inputs', 'resources'];
export const RAIL_FOOT = ['screens', 'settings', 'help'];
// The row a screen belongs to, by view id.
export const GROUP_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, x]) => [...x.tabs.map(t => [t[0], g]), ...x.also.map(v => [v, g])]));
// The Visual Guide's chapter for a screen (js/guide/scenes.js), which the ?
// in the top bar and the phone's app bar opens Help at. [phone, desk] where
// one view is two tasks (Backfill review scans on a phone, reviews at a desk).
// A screen with none opens the guide at the first chapter for the reader.
export const GUIDE_OF = {
  dashboard: 'around', help: 'around', settings: 'settings', map: 'find', refresh: 'refresh', labelint: 'labels', maintenance: 'fault', equipment: 'equip',
  bfreview: ['bfscan', 'bfreview'], livepull: 'pull', cages: 'cages', manifests: 'manifests', receiving: ['receivephone', 'receive'], decant: ['decantphone', 'receive'],
};
export const guideFor = (view, mobile) => { const g = GUIDE_OF[view]; return Array.isArray(g) ? g[mobile ? 0 : 1] : g || null; };
export const STRIP = {
  floor: [['mhome', 'home', tx('Home')], ['refresh', 'm-refresh', tx('Refresh')], ['labelint', 'm-labelint', tx('Labels')], ['picklist', 'm-picklist', tx('Route')], ['emergency', 'm-emergency', tx('Emergency')], ['more', 'dots', tx('More')]],
  stockroom: [['mhome', 'home', tx('Home')], ['bfreview', 'm-backfill', tx('Backfill')], ['cages', 'm-cages', tx('Cages')], ['adjust', 'm-adjust', tx('Adjust')], ['more', 'dots', tx('More')]],
  // Receive and Decant are separate tabs, as Decant Visualiser had them.
  backdock: [['mhome', 'home', tx('Home')], ['receiving', 'm-receiving', tx('Receive')], ['decant', 'box', tx('Decant')], ['teamboard', 'users', tx('Board')], ['more', 'dots', tx('More')]],
  // The manager phone (planned 12 Oct 2026): the store at a glance first, then each area's home.
  today: [['mtoday', 'm-dashboard', tx('Today')], ['map', 'm-map', tx('Floor')], ['srhome', 'box', tx('Stock')], ['bdhome', 'truck', tx('Dock')], ['more', 'dots', tx('More')]],
  admin: [['admin', 'grid', tx('Stores')], ['adminreg', 'plus', tx('Register')], ['adminactions', 'history', tx('Actions')], ['settings', 'm-settings', tx('Settings')]],
};
// Phone home per workspace, and the workspaces the launcher offers.
export const HOME = { today: 'mtoday', floor: 'map', stockroom: 'srhome', backdock: 'bdhome', admin: 'admin' };
export const WORKSPACES = [['floor', tx('Floor'), 'm-map', tx('Map, refresh, labels, routes, stocktake')], ['stockroom', tx('Stockroom'), 'box', tx('Backfill scan, cages, adjustments, day list')], ['backdock', tx('Back dock'), 'truck', tx('Land and decant pallets, run the truck')]];
// The owner console's rail: stores are added at runtime, these are the system rows.
export const ADMIN_RAIL = [['admin', 'grid', tx('Overview')], ['admindevices', 'phone', tx('Devices')], ['admincompare', 'chart', tx('Compare stores')], ['adminmaps', 'm-map', tx('Maps')], ['adminservice', 'm-settings', tx('Service')], ['adminresources', 'library', tx('Resources')], ['adminzones', 'pin', tx('Zones')], ['adminreg', 'plus', tx('Register a store')], ['adminactions', 'history', tx('Owner actions')]];
// The phone's More sheet: each area's tools (with a line on what each is
// for), then the store and the app; Switch area and Sign out sit at the foot.
// A desk-only view drops out (Maintenance, Tasks and the Planner show on a manager's phone only).
export const MORE = {
  floor: [['tasks', 'm-tasks', tx('Tasks'), tx('Today’s checklists, walked item by item')], ['livepull', 'packages', tx('Live pull'), tx('Ask the stockroom for stock, or pull it')], ['stocktake', 'm-stocktake', tx('Stocktake'), tx('Count shelves in a session')], ['maintenance', 'm-maintenance', tx('Maintenance'), tx('Report a fault, with photos')], ['equipment', 'm-equipment', tx('Equipment checks'), tx('Ladders, MHE and trolleys')], ['recalls', 'alert', tx('Recalls'), tx('Products off sale: what to pull')], ['mapedits', 'edit', tx('Suggest map edits'), tx('A wrong name or a missing shelf')], ['storeinfo', 'm-store', tx('Store details')], ['help', 'help', tx('Help')], ['settings', 'm-settings', tx('Settings')]],
  stockroom: [['tasks', 'm-tasks', tx('Tasks'), tx('Today’s checklists, walked item by item')], ['livepull', 'packages', tx('Live pull'), tx('Ask the stockroom for stock, or pull it')], ['daylist', 'm-daylist', tx('Day list'), tx('What to backfill next')], ['codelist', 'barcode', tx('Quick Scan'), tx('Scan codes into a list')], ['srhistory', 'm-srhistory', tx('History'), tx('Today’s sent bays')], ['maintenance', 'm-maintenance', tx('Maintenance'), tx('Report a fault, with photos')], ['equipment', 'm-equipment', tx('Equipment checks'), tx('Ladders, MHE and trolleys')], ['recalls', 'alert', tx('Recalls'), tx('Products off sale: what to pull')], ['storeinfo', 'm-store', tx('Store details')], ['help', 'help', tx('Help')], ['settings', 'm-settings', tx('Settings')]],
  backdock: [['tasks', 'm-tasks', tx('Tasks'), tx('Today’s checklists, walked item by item')], ['planner', 'm-planner', tx('Planner'), tx('The week’s trucks, one day at a time')], ['rhistory', 'm-rhistory', tx('History'), tx('Finished trucks')], ['offsite', 'm-inventory', tx('Off-site pallets'), tx('Callbacks and returns')], ['dockscreen', 'grid', tx('Dock screen'), tx('The big screen at the dock')], ['wallboard', 'chart', tx('Wallboard'), tx('Progress for the team')], ['maintenance', 'm-maintenance', tx('Maintenance'), tx('Report a fault, with photos')], ['equipment', 'm-equipment', tx('Equipment checks'), tx('Ladders, MHE and trolleys')], ['recalls', 'alert', tx('Recalls'), tx('Products off sale: what to pull')], ['storeinfo', 'm-store', tx('Store details')], ['help', 'help', tx('Help')], ['settings', 'm-settings', tx('Settings')]],
};
// The manager's More: every area's tools in one list, each once.
MORE.today = [['refresh', 'm-refresh', tx('Location refresh'), tx('Progress by department, set the focus')], ['receiving', 'm-receiving', tx('Receiving'), tx('The truck, the crew and their roles')], ['rhistory', 'm-rhistory', tx('History'), tx('Finished trucks')], ['bfreview', 'm-backfill', tx('Backfill'), tx('Scan a bay for review')], ...[...MORE.floor, ...MORE.stockroom, ...MORE.backdock].filter((m, i, all) => all.findIndex(x => x[0] === m[0]) === i && !['rhistory'].includes(m[0]))];
export const MORE_STORE = ['storeinfo', 'help', 'settings'];
