// Session: sign in (store PIN or owner key), act as a store (owner), unlock
// an area or manager code,
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
  const snapshot = () => cur ? { store: cur.store, name: cur.name, roles: cur.roles, caps: cur.caps, owner: !!cur.owner, actas: !!cur.actas, expires: cur.expires, device } : null;

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
  // Owner acting as a store: a short store-scoped token (manager role, actor
  // 'owner') on top of the owner session, which is kept under `via` so the
  // console can be returned to and so refresh can mint the next act-as token.
  async function actAs(storeNo) {
    if (!cur?.owner || cur.store) throw new TransportError(400, 'invalid_request', 'owner session required');
    const r = await transport.request(`/v1/admin/actas/${encodeURIComponent(storeNo)}`, { method: 'POST', token: await token() });
    const rec = await transport.request(`/v1/admin/stores/${encodeURIComponent(storeNo)}`, { token: cur.token });
    cur = { token: r.token, refresh: null, expires: r.expires, store: r.store, name: rec.name, roles: ['manager'], caps: r.caps, owner: true, actas: true, via: { token: cur.token, refresh: cur.refresh, expires: cur.expires } };
    await save(); return snapshot();
  }
  async function endActAs() {
    if (!cur?.actas) return snapshot();
    cur = { token: cur.via.token, refresh: cur.via.refresh, expires: cur.via.expires, store: null, name: null, roles: ['owner'], caps: [], owner: true };
    await save(); return snapshot();
  }
  async function refresh() {
    if (!cur) throw new TransportError(401, 'unauthorised', 'not signed in');
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        if (cur.actas) {
          const o = await transport.request('/v1/auth/refresh', { method: 'POST', body: { refresh: cur.via.refresh } });
          const r = await transport.request(`/v1/admin/actas/${encodeURIComponent(cur.store)}`, { method: 'POST', token: o.token });
          cur = { ...cur, token: r.token, expires: r.expires, caps: r.caps, via: { token: o.token, refresh: o.refresh, expires: o.expires } };
          await save(); return snapshot();
        }
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
  // Sign-out ends the session on the worker too (best effort: offline, the
  // local session still goes and the refresh token expires on its own).
  async function signOut() {
    const refreshes = [cur?.refresh, cur?.via?.refresh].filter(Boolean);
    cur = null; await save();
    for (const refresh of refreshes) { try { await transport.request('/v1/auth/signout', { method: 'POST', body: { refresh } }); } catch {} }
  }
  function unauthorised() { cur = null; save(); emit('signin-required', { reason: 'unauthorised' }); }
  function on(k, f) { listeners[k].add(f); return () => listeners[k].delete(f); }

  return { load, signIn, signInOwner, actAs, endActAs, unlock, refresh, token, signOut, unauthorised, on, get current() { return snapshot(); }, get device() { return device; }, app };
}
