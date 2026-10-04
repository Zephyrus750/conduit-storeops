// Diagnostics for Settings › Feedback and report: the last 50 errors and
// warnings this page logged, and one plain-text bundle (device, version,
// sync, storage, the view) that is copied or sent with feedback. Nothing
// here leaves the device unless the person copies or sends it.

import { VERSION } from './version.js';
import { updates } from './updates.js';

const LINES = [], MAX = 50;
const add = (kind, parts) => { LINES.push(`${new Date().toISOString().slice(11, 19)} ${kind} ${parts.map(p => p instanceof Error ? p.message : typeof p === 'string' ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })()).join(' ').slice(0, 300)}`); if (LINES.length > MAX) LINES.shift(); };
export function installLog() {
  for (const k of ['error', 'warn']) { const orig = console[k].bind(console); console[k] = (...a) => { add(k, a); orig(...a); }; }
  addEventListener('error', e => add('error', [e.message || 'error', e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : '']));
  addEventListener('unhandledrejection', e => add('error', ['unhandled', e.reason?.message || String(e.reason)]));
}
export const logLines = () => LINES.slice();

// Storage on this device, by pot: the session, each store's snapshot, map
// and queued changes, product names and pasted reports.
export async function storagePots(storage) {
  const pots = [['snap:', 'Store snapshots'], ['map:', 'Store maps'], ['outbox:', 'Queued changes'], ['kc:', 'Product names'], ['simreport:', 'Pasted inventory reports'], ['suite_', 'Session and device']];
  const out = [];
  for (const [prefix, name] of pots) {
    let rows = []; try { rows = await storage.list(prefix); } catch {}
    const bytes = rows.reduce((n, r) => { try { return n + JSON.stringify(r.value).length; } catch { return n; } }, 0);
    out.push({ prefix, name, count: rows.length, bytes, keys: rows.map(r => r.key) });
  }
  return out;
}
export async function releaseCache() {
  try { const keys = await caches.keys(), app = keys.filter(k => k.startsWith('suite-app-')); let files = 0; for (const k of app) files += (await (await caches.open(k)).keys()).length; return { caches: keys.length, release: app[0] || null, files, maps: keys.includes('suite-maps-v1') }; } catch { return null; }
}
export const fmtBytes = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;

export async function bundle(ctx, view = '') {
  const s = ctx.store?.status || {}, est = await navigator.storage?.estimate?.().catch(() => null), pots = ctx.storage ? await storagePots(ctx.storage) : [];
  return [
    `Conduit ${VERSION}${updates.state.build ? ' build ' + updates.state.build : ''}${updates.state.waiting ? ` (update ${updates.state.waiting.version} waiting)` : ''}`,
    `Store ${ctx.storeNo || '(owner)'} · device ${ctx.session.device} · roles ${(ctx.session.current?.roles || []).join(',')}`,
    `View ${view || '?'} · ${innerWidth}×${innerHeight} · ${navigator.userAgent}`,
    `Sync ${s.state || '?'} · ${s.queued ?? 0} queued · seq ${s.seq ?? '?'}${s.lastError ? ' · ' + s.lastError : ''} · ${navigator.onLine ? 'online' : 'offline'}`,
    `Storage ${est ? `${fmtBytes(est.usage || 0)} of ${fmtBytes(est.quota || 0)}` : 'unknown'} · ${pots.map(p => `${p.name} ${p.count}/${fmtBytes(p.bytes)}`).join(' · ')}`,
    `Installed ${updates.state.installed ? 'yes' : 'no'} · offline ready ${updates.state.offlineReady ? 'yes' : 'no'}`,
    '--- last log lines ---', ...LINES,
  ].join('\n');
}
