// Session: sign in (store PIN or owner key), act as a store (owner), unlock
// an area or manager code,
// refresh silently before expiry, expose capabilities, clear on sign-out.
// Persists under `suite_session`; the device id under `suite_device`.
//
// Events: 'change' (session state changed), 'signin-required' (a refresh
// failed or the worker said unauthorised; the shell shows the sign-in).

import { TransportError } from './transport.js';

const REFRESH_AHEAD_S = 600;   // refresh when under ten minutes remain
const AUTH_GONE = new Set([401, 403, 404]);   // the worker says this session is over (revoked, suspended, unregistered)

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
  // Idle re-lock: back to the store PIN's floor session (the worker revokes
  // the refresh token that carried the codes).
  async function lock() {
    if (!cur || cur.owner || !(cur.roles || []).some(r => r !== 'floor')) return snapshot();
    const r = await transport.request('/v1/auth/lock', { method: 'POST', body: { refresh: cur.refresh }, token: await token() });
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
    let used = null;
    refreshing = (async () => {
      try {
        if (cur.actas) {
          const o = await transport.request('/v1/auth/refresh', { method: 'POST', body: { refresh: cur.via.refresh } });
          const r = await transport.request(`/v1/admin/actas/${encodeURIComponent(cur.store)}`, { method: 'POST', token: o.token });
          cur = { ...cur, token: r.token, expires: r.expires, caps: r.caps, via: { token: o.token, refresh: o.refresh, expires: o.expires } };
          await save(); return snapshot();
        }
        used = cur.refresh;
        const r = await transport.request('/v1/auth/refresh', { method: 'POST', body: { refresh: cur.refresh } });
        cur = { ...cur, token: r.token, refresh: r.refresh, expires: r.expires, roles: r.roles, caps: r.caps, owner: !!r.owner };
        await save(); return snapshot();
      } catch (e) {
        // Only an answer that says the session is gone signs the device out.
        // A server error, a rate limit or a timeout keeps it: the next try
        // may work. Another tab of this app may have spent the refresh token
        // a moment ago; if the stored session moved on, take that one.
        if (e instanceof TransportError && AUTH_GONE.has(e.status)) {
          const stored = await storage.get('suite_session');
          if (stored?.refresh && used && stored.refresh !== used && stored.expires * 1000 > now()) { cur = stored; emit('change', snapshot()); return snapshot(); }
          cur = null; await save(); emit('signin-required', { reason: e.code });
        }
        throw e;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  // The access token, refreshed first when it is about to expire.
  async function token() {
    if (!cur) return null;
    // A refresh that fails for a passing reason (offline, a server error, a
    // rate limit) keeps the current token: it is usually still valid.
    if (cur.expires * 1000 - now() < REFRESH_AHEAD_S * 1000) { try { await refresh(); } catch (e) { if (!(e instanceof TransportError) || AUTH_GONE.has(e.status)) return null; } }
    return cur?.token || null;
  }
  // Other stores on this device (switch store without signing out): signing
  // in to a second store parks the current store's session under
  // `suite_parked`, and switching swaps them. A parked store keeps only its
  // PIN session: any crew or manager codes are dropped first (best effort
  // offline; they expire with the shift either way). Each store keeps its
  // own snapshot and outbox, so queued changes wait for their store.
  const parkedAll = async () => (await storage.get('suite_parked')) || {};
  async function park() {
    if (!cur || cur.owner) return;
    if ((cur.roles || []).some(r => r !== 'floor')) { try { await lock(); } catch {} }
    const p = await parkedAll(); p[cur.store] = cur; await storage.set('suite_parked', p);
  }
  async function signInAnother({ store, pin }) {
    if (cur && !cur.owner && String(store) === cur.store) throw new TransportError(400, 'invalid_request', `already signed in to ${store}`);
    const r = await transport.request('/v1/auth/signin', { method: 'POST', body: { store: String(store), pin: String(pin), device } });
    await park();
    const p = await parkedAll(); delete p[r.store]; await storage.set('suite_parked', p);
    cur = { token: r.token, refresh: r.refresh, expires: r.expires, store: r.store, name: r.name, roles: r.roles, caps: r.caps, owner: false };
    await save(); return snapshot();
  }
  async function switchTo(storeNo) {
    const p = await parkedAll(), next = p[String(storeNo)];
    if (!next) throw new TransportError(404, 'not_found', `store ${storeNo} is not on this device`);
    delete p[String(storeNo)]; await storage.set('suite_parked', p);
    await park(); cur = next; await save(); return snapshot();
  }
  async function forget(storeNo) {
    const p = await parkedAll(), s = p[String(storeNo)]; if (!s) return;
    delete p[String(storeNo)]; await storage.set('suite_parked', p);
    try { await transport.request('/v1/auth/signout', { method: 'POST', body: { refresh: s.refresh } }); } catch {}
  }
  async function parked() { return Object.values(await parkedAll()).map(s => ({ store: s.store, name: s.name })).sort((a, b) => a.store.localeCompare(b.store)); }
  // Sign-out ends the session on the worker too (best effort: offline, the
  // local session still goes and the refresh token expires on its own).
  // It signs out of every store on the device: a shared device is left clean.
  async function signOut() {
    const p = await parkedAll();
    const refreshes = [cur?.refresh, cur?.via?.refresh, ...Object.values(p).map(s => s.refresh)].filter(Boolean);
    cur = null; await save(); await storage.del('suite_parked');
    for (const refresh of refreshes) { try { await transport.request('/v1/auth/signout', { method: 'POST', body: { refresh } }); } catch {} }
  }
  function unauthorised() { cur = null; save(); emit('signin-required', { reason: 'unauthorised' }); }
  function on(k, f) { listeners[k].add(f); return () => listeners[k].delete(f); }

  return { load, signIn, signInOwner, signInAnother, switchTo, forget, parked, actAs, endActAs, unlock, lock, refresh, token, signOut, unauthorised, on, get current() { return snapshot(); }, get device() { return device; }, app };
}
