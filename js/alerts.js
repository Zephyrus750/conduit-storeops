// What needs someone now, worked out in one place from the store's own
// state: the rail's counts (the review board's des-badges) and the alerts
// bell (new-bell) read the same list, so a number on the rail and a line
// under the bell never disagree.
//
//   waiting({ store, session, offView, canRead, answered }) → [{ key, n, level, icon, text, go }]
//     key    the rail badge it counts towards (a view id)
//     level  bad (act now) | warn (today) | info (routine, on the rail only)
//     go     the view it opens, or 'sync' for the changes waiting on the worker
//   bellCount(list) → { n, bad } the bell's number: everything but routine work
//
// Each part reads its area's projection, which is empty until the device
// holds that area's code, so nothing shows that the device can't open.

import { tx, txn } from './i18n.js';
import { today, storeTz } from './ui.js';
import { storeParts } from '../shared/time.js';
import { openTrucks, truckNo } from './views/backdock/common.js';
import { equipmentNeeds } from './views/equipment.js';
import { recallsNeeding } from './views/recalls.js';
import { overdueIssues } from './views/maintenance.js';

const nowHM = () => { const { hh, mm } = storeParts(new Date(), storeTz()); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };

// Today's trucks: those already on the dock or done, and the Planner's slots
// still to come (a slot leaves the plan when its truck lands).
function trucksToday(store, day) {
  const dock = store.get('dock'), plan = store.get('plan');
  const onDock = dock ? openTrucks(dock).filter(t => t.id.slice(0, 10) === day) : [];
  const slots = Object.entries(plan?.days?.[day]?.slots || {}).filter(([n]) => !onDock.some(t => truckNo(t.id) === String(n)));
  return { onDock, slots };
}

export function waiting({ store, session, offView = () => false, canRead = () => true, answered = 0 }) {
  if (!store) return [];
  const day = today(), out = [];
  const add = (key, n, level, icon, text, go = key) => { if (n > 0) out.push({ key, n, level, icon, text, go }); };
  const caps = session?.current?.caps || [];
  // Stockroom
  if (canRead('stockroom')) {
    const bf = store.get('backfill'), cages = store.get('cages') || {};
    if (caps.includes('stockroom') && !offView('bfreview') && bf?.report?.date !== day) add('inputs', 1, 'info', 'file', tx('The morning report is not pasted yet'));
    const pend = Object.values(bf?.subs || {}).filter(x => x.date === day && x.status === 'pending').length;
    add('bfreview', pend, 'info', 'm-bfreview', txn(pend, '{n} location to review today', '{n} locations to review today'));
    const lost = Object.values(cages).filter(c => c.status === 'open' && Date.now() - Date.parse(c.seen) > 7 * 86400e3).length;
    add('cages', lost, 'bad', 'm-cages', txn(lost, '{n} cage not seen this week', '{n} cages not seen this week'));
  }
  // Floor
  if (!offView('recalls')) { const r = recallsNeeding(store).need; add('recalls', r, 'bad', 'alert', txn(r, '{n} recall or withdrawal to act on', '{n} recalls or withdrawals to act on')); }
  if (!offView('equipment')) {
    const eq = equipmentNeeds(store), assets = Object.values(store.get('assets') || {}).filter(a => a.due && a.due < day).length, n = eq.late + eq.out + assets;
    add('equipment', n, 'bad', 'm-equipment', txn(n, '{n} check overdue or out of service', '{n} checks overdue or out of service'));
  }
  if (!offView('maintenance')) { const n = overdueIssues(store); add('maintenance', n, 'warn', 'tool', txn(n, '{n} maintenance issue overdue', '{n} maintenance issues overdue')); }
  // Back dock: a planned truck past its ETA that hasn't landed, and today's trucks without a manifest.
  if (canRead('backdock') && !offView('planner')) {
    const { onDock, slots } = trucksToday(store, day), hm = nowHM();
    const late = slots.filter(([, s]) => s.eta && s.eta < hm).length;
    add('planner', late, 'bad', 'truck', txn(late, '{n} truck past its ETA and not landed', '{n} trucks past their ETA and not landed'));
    const bare = onDock.filter(t => !t.manifest && !t.plannedManifest).length + slots.filter(([, s]) => !s.manifest).length;
    add('planner', bare, 'warn', 'm-manifests', txn(bare, '{n} truck today without a manifest', '{n} trucks today without a manifest'));
  }
  // Resources: the owner answered a request this store made.
  if (!offView('resources')) add('resources', answered, 'warn', 'library', txn(answered, '{n} request answered by the owner', '{n} requests answered by the owner'));
  // Changes this device couldn't send.
  const held = store.held?.length || 0;
  add('sync', held, 'bad', 'refresh', txn(held, '{n} change waiting on the worker', '{n} changes waiting on the worker'), 'sync');
  return out;
}

// The rail: each badge's number and whether anything behind it is urgent.
export function railCounts(list) {
  const n = {}, lvl = {};
  for (const x of list) { n[x.key] = (n[x.key] || 0) + x.n; lvl[x.key] = lvl[x.key] === 'bad' || x.level === 'bad' ? 'bad' : lvl[x.key] === 'warn' || x.level === 'warn' ? 'warn' : 'info'; }
  return { n, lvl };
}
export function bellCount(list) {
  const shown = list.filter(x => x.level !== 'info');
  return { n: shown.reduce((t, x) => t + x.n, 0), bad: shown.some(x => x.level === 'bad') };
}
// The shell's list for this device (its tool switches and area codes
// applied, a phone's lines pointed at the phone's screens), for views that
// show it too: the manager phone's Today.
let source = () => [];
export const useAlertSource = fn => { source = fn; };
export const currentAlerts = () => source();
