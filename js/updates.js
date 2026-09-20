// Installing and updating the app. Registers sw.js, watches for a new
// release, and applies it only when the person says so: the new worker
// waits, the shell shows the update bar, "Update now" posts SKIP_WAITING and
// the page reloads once the new worker controls it. Nothing here runs
// without a service worker (plain http on a LAN, or ?nosw=1 for debugging).
//
//   updates.on('ready', info)   a new release is installed and waiting
//   updates.state               { supported, version, build, waiting: { version, build } | null, checking }
//   updates.check()             ask the browser to look now
//   updates.apply()             switch to the waiting release (reloads)

import { VERSION } from './version.js';

const listeners = new Set();
const state = { supported: 'serviceWorker' in navigator, version: VERSION, build: null, waiting: null, checking: false, offlineReady: false };
let reg = null, applying = false;

export const updates = {
  state,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  async check() {
    if (!reg) return null;
    state.checking = true; emit('checking');
    try { await reg.update(); } catch {} finally { state.checking = false; emit('checked'); }
    return state.waiting;
  },
  async apply() {
    const w = reg?.waiting; if (!w || applying) return false;
    applying = true; emit('applying');
    w.postMessage({ type: 'SKIP_WAITING' });
    return true;
  },
};
const emit = (k) => { for (const f of listeners) { try { f(k, state); } catch (e) { console.error(e); } } };

export async function initUpdates() {
  if (!state.supported || new URLSearchParams(location.search).has('nosw')) return null;
  try { reg = await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('service worker', e.message); return null; }
  state.build = (await ask(navigator.serviceWorker.controller))?.build || null;
  state.offlineReady = !!navigator.serviceWorker.controller;
  if (reg.waiting) await announce(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing; if (!w) return;
    w.addEventListener('statechange', async () => {
      if (w.state === 'installed') { if (navigator.serviceWorker.controller) await announce(w); else { state.offlineReady = true; state.build = (await ask(w))?.build || null; emit('installed'); } }
    });
  });
  // The new worker took over after "Update now": reload once so every file
  // comes from the new release. The first install also claims the page
  // (controllerchange with no update applied); that never reloads.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!applying || reloaded) return; reloaded = true; location.reload(); });
  // Look for a release when the app wakes and every hour while it is open.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updates.check(); });
  setInterval(() => updates.check(), 60 * 60 * 1000);
  return reg;
}
async function announce(worker) {
  const info = await ask(worker);
  state.waiting = { version: info?.version || '?', build: info?.build || null };
  emit('ready');
}
// GET_VERSION over a MessageChannel: what a worker ships.
function ask(worker) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const ch = new MessageChannel(); const t = setTimeout(() => resolve(null), 1500);
    ch.port1.onmessage = e => { clearTimeout(t); resolve(e.data); };
    try { worker.postMessage({ type: 'GET_VERSION' }, [ch.port2]); } catch { clearTimeout(t); resolve(null); }
  });
}
