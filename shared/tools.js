// The tools an owner can switch on or off per store, inside an entitled
// area. A tool is views (hidden in the shell) and event types (refused by
// the worker). The store map, settings, store details and the workspace
// homes are not tools: they are always there when the area is.
//
// The owner switches tools off in the console; the registry keeps the list
// and the worker logs it into the store as store.tools.set, so every device
// sees it at once (the tools projection) and the store object refuses a
// switched-off tool's events and routes. Pure.
//
//   TOOLS                      [{ id, area, name, views, events }]
//   toolForEvent(type)         the tool an event type belongs to, or null (always allowed)
//   toolForView(viewId)        the tool a view belongs to, or null (always shown)
//   toolOff(off, toolOrId)     true when that tool is in the switched-off list

const T = (id, area, name, views, events = []) => ({ id, area, name, views, events });
export const TOOLS = [
  T('picklist', 'floor', 'Pick list', ['picklist'], ['picklist.']),
  T('refresh', 'floor', 'Location refresh', ['refresh'], ['refresh.']),
  T('labels', 'floor', 'Label integrity', ['labelint'], ['label.']),
  T('emergency', 'floor', 'Emergency', ['emergency']),
  T('maintenance', 'floor', 'Maintenance', ['maintenance'], ['issue.', 'asset.']),
  T('stocktake', 'floor', 'Stocktake', ['stocktake'], ['stocktake.']),
  T('mapedits', 'floor', 'Suggest map edits', ['mapedits'], ['map.edit.suggest']),
  T('inventory', 'floor', 'Inventory and pallet hub', ['inventory'], ['inventory.']),
  T('backfill', 'stockroom', 'Backfill review and history', ['bfreview', 'srhistory'], ['submission.']),
  T('cages', 'stockroom', 'Cages', ['cages'], ['cage.']),
  T('adjust', 'stockroom', 'Adjustments', ['adjust'], ['adjustment.']),
  T('daylist', 'stockroom', 'Day list', ['daylist'], ['daylist.']),
  T('intel', 'stockroom', 'Stock intelligence', ['srintel'], ['soh.']),
  T('trends', 'stockroom', 'Trends', ['srtrends']),
  T('codelist', 'stockroom', 'Barcode list and Quick Scan', ['codelist']),
  T('receiving', 'backdock', 'Receiving, Team Board and Dock screen', ['receiving', 'teamboard', 'dockscreen'], ['truck.', 'pallet.', 'halt.', 'huddle.', 'break.', 'receiving.', 'manifest.attach', 'manifest.linkLate', 'plan.queues', 'dock.roster']),
  T('manifests', 'backdock', 'Manifests', ['manifests'], ['manifest.publish', 'manifest.remove']),
  T('profiles', 'backdock', 'Carton profiles', ['profiles']),
  T('planner', 'backdock', 'Planner', ['planner'], ['plan.set', 'plan.remove']),
  T('rhistory', 'backdock', 'Receiving history', ['rhistory']),
  T('boards', 'backdock', 'Wallboard and analytics', ['wallboard', 'danalytics']),
];
export const TOOL_IDS = TOOLS.map(t => t.id);
const byView = new Map(TOOLS.flatMap(t => t.views.map(v => [v, t])));

// The longest matching pattern wins: 'manifest.attach' is Receiving even
// though 'manifest.' would be Manifests (no tool claims the bare prefix).
export function toolForEvent(type) {
  let best = null, len = 0;
  for (const t of TOOLS) for (const p of t.events) if ((p.endsWith('.') ? type.startsWith(p) : type === p) && p.length > len) { best = t; len = p.length; }
  return best;
}
export const toolForView = id => byView.get(id) || null;
export const toolOff = (off, t) => !!t && (off || []).includes(typeof t === 'string' ? t : t.id);
