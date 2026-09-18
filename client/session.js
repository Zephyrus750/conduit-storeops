// Session: sign in (store PIN or owner key), unlock an area or manager code,
// refresh silently before expiry, expose capabilities, clear on sign-out.
// Persists under `suite_session`; the device id under `suite_device`.
//
// Events: 'change' (session state changed), 'signin-required' (a refresh
// failed or the worker said unauthorised; the shell shows the sign-in).

import { TransportError } from './transport.js';

const REFRESH_AHEAD_S = 600;   // refresh when under ten minutes remain

export function createSession({ transport, storage, app = 'conduit', now = () => Date.now() }) {
  const listeners = { change: new Set(), 'signin-required': new Set() };
  let cur = null;       // { token, refresh, expires, store, name, roles, caps, owner }
  let device = null;
  let refreshing = null;

  const emit = (k, v) => { for (const f of listeners[k]) { try { f(v); } catch (e) { console.error(e); } } };
  const save = async () => { if (cur) await storage.set('suite_session', cur); else await storage.del('suite_session'); emit('change', snapshot()); };
  const snapshot = () => cur ? { store: cur.store, name: cur.name, roles: cur.roles, caps: cur.caps, owner: !!cur.owner, expires: cur.expires, device } : null;

  async function load() {
    device = await storage.get('suite_device');
    if (!device) { device = 'd_' + Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4); await storage.set('suite_device', device); }
    cur = (await storage.get('suite_session')) || null;
    return snapshot();
  }

  async function signIn({ store, pin }) {
    const r = await transport.request('/v1/auth/signin', { method: 'POST', body: { store: String(store), pin: String(pin), device } });
    cur = { token: r.token, refresh: r.refresh, expires: r.expires, store: r.store, name: r.name, roles: r.roles, caps: r.caps, owner: false };
    await save(); return snapshot();
  }
  async function signInOwner({ ownerKey }) {
    const r = await transport.request('/v1/auth/signin', { method: 'POST', body: { ownerKey, device } });
    cur = { token: r.token, refresh: r.refresh, expires: r.expires, store: null, name: null, roles: ['owner'], caps: [], owner: true };
    await save(); return snapshot();
  }
  async function unlock(code) {
    const r = await transport.request('/v1/auth/unlock', { method: 'POST', body: { code: String(code) }, token: await token() });
    cur = { ...cur, token: r.token, refresh: r.refresh, expires: r.expires, roles: r.roles };
    await save(); return snapshot();
  }
  async function refresh() {
    if (!cur) throw new TransportError(401, 'unauthorised', 'not signed in');
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const r = await transport.request('/v1/auth/refresh', { method: 'POST', body: { refresh: cur.refresh } });
        cur = { ...cur, token: r.token, refresh: r.refresh, expires: r.expires, roles: r.roles, caps: r.caps, owner: !!r.owner };
        await save(); return snapshot();
      } catch (e) {
        if (e instanceof TransportError && !e.network) { cur = null; await save(); emit('signin-required', { reason: e.code }); }
        throw e;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  // The access token, refreshed first when it is about to expire.
  async function token() {
    if (!cur) return null;
    if (cur.expires * 1000 - now() < REFRESH_AHEAD_S * 1000) { try { await refresh(); } catch (e) { if (!(e instanceof TransportError && e.network)) return null; } }
    return cur?.token || null;
  }
  async function signOut() { cur = null; await save(); }
  function unauthorised() { cur = null; save(); emit('signin-required', { reason: 'unauthorised' }); }
  function on(k, f) { listeners[k].add(f); return () => listeners[k].delete(f); }

  return { load, signIn, signInOwner, unlock, refresh, token, signOut, unauthorised, on, get current() { return snapshot(); }, get device() { return device; }, app };
}
