// The owner console's numbers for one store, from its state (Vector's
// console KPIs): backfill today and over seven days with accuracy and the
// bays the rollover auto-closed yesterday, the dock's last week, open
// issues, the devices it has seen with their app versions and errors, and
// set-up alerts: what is missing before the store can use what it is
// entitled to. Pure: the store object serves it, tests build state by hand.
//
//   storeKpis(state, { today, caps, now }) → { backfill, dock, floor, devices, alerts: [{ level, text }] }

import { addDays } from './time.js';
import { settingsOf } from './reducers/store.js';

const DAY = 86400000;
export function storeKpis(state, { today, caps = [], now = Date.now() } = {}) {
  const has = a => caps.includes(a), alerts = [], warn = (level, text) => alerts.push({ level, text });
  const yesterday = addDays(today, -1), weekFrom = addDays(today, -6);
  const subs = Object.values(state.backfill?.subs || {});
  const done = subs.filter(s => s.status !== 'pending' && s.metrics);
  const week = done.filter(s => s.date >= weekFrom && s.date <= today), accs = week.map(s => s.metrics.accuracy).filter(Number.isFinite);
  const backfill = has('stockroom') ? {
    today: done.filter(s => s.date === today).length,
    pending: subs.filter(s => s.date === today && s.status === 'pending').length,
    requested: (state.backfill?.requested?.[today] || []).length,
    week: week.length,
    accuracy: accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null,
    autoClosed: done.filter(s => s.date === yesterday && s.autoSubmitted).length,
  } : null;
  const hist = (state.dock?.history || []).filter(r => (r.date || '') >= weekFrom);
  const open = Object.entries(state.dock?.trucks || {}).filter(([, t]) => t.status !== 'closed');
  const dock = has('backdock') ? {
    trucks: hist.length, cartons: hist.reduce((n, r) => n + (r.cartons || 0), 0),
    clearMins: hist.length ? Math.round(hist.reduce((n, r) => n + (r.clearMins || 0), 0) / hist.length) : null,
    open: open.length, manifests: Object.values(state.dock?.manifests || {}).filter(m => (m.publishedAt || '').slice(0, 10) >= weekFrom).length,
  } : null;
  const issues = Object.values(state.issues || {}).filter(i => !i.removed && !['closed', 'completed'].includes(i.status));
  const floor = has('floor') ? { openIssues: issues.length, urgent: issues.filter(i => (i.sev || 0) >= 2).length } : null;
  const devs = Object.entries(state.devices || {}), recent = devs.filter(([, d]) => now - Date.parse(d.last) < DAY);
  const versions = {}; for (const [, d] of recent) if (d.app) versions[d.app] = (versions[d.app] || 0) + 1;
  const devices = { seen24h: recent.length, total: devs.length, versions, errors: recent.filter(([, d]) => d.lastError).map(([id, d]) => ({ id, error: d.lastError, at: d.last })), outbox: recent.reduce((n, [, d]) => n + (d.outbox || 0), 0) };

  // Set-up: what the store still needs.
  if (has('floor') && !state.map?.version) warn('bad', 'No map published: the Floor tools have nothing to show.');
  if (has('stockroom') && !(settingsOf(state).deptRanges || []).length) warn('warn', 'No stockroom bay ranges: History and Trends cannot group by department (Settings › Store).');
  if (has('backdock') && !Object.keys(state.dock?.manifests || {}).length) warn('warn', 'No manifest published yet.');
  if (has('backdock') && dock && open.length > 1) warn('warn', `${open.length} trucks open at once.`);
  if (!devs.length) warn('warn', 'No device has signed in yet.');
  else if (!recent.length) warn('warn', 'No device seen in the last 24 hours.');
  if (devices.errors.length) warn('warn', `${devices.errors.length} device${devices.errors.length === 1 ? '' : 's'} reporting an error.`);
  if (devices.outbox > 0) warn('warn', `${devices.outbox} change${devices.outbox === 1 ? '' : 's'} waiting in device outboxes.`);
  if (backfill?.autoClosed) warn('info', `${backfill.autoClosed} bay${backfill.autoClosed === 1 ? '' : 's'} auto-closed at yesterday's rollover.`);
  return { backfill, dock, floor, devices, alerts };
}
