// The map editor's connection to Conduit, owner only: sign in with the owner
// key (or use the owner session the console already holds on this device),
// list the stores, open a store's map as last published, preview it as staff
// will see it, publish it, and review the store's suggested edits.
//
// Everything goes through the worker with the owner's token. A store device
// can open this page but can do nothing with it: every call needs the owner.
// The editor itself is a classic script (editor.js); this module talks to it
// through its globals and exposes window.ConduitBridge.

import { createClient } from '../client/index.js';
import { WORKER_DEFAULT, WORKER_ALLOWED } from '../js/config.js';
import { renderMap, publishBody, parseMapFile } from '../shared/maprender.js';
// A code as the store writes it, as js/map.js canonCode (not imported: the
// viewer's map module brings the whole shell UI with it).
const canonCode = code => String(code || '').toUpperCase().replace(/[\s\-_.]+/g, '').replace(/([A-Z])0+(?=\d)/g, '$1');

// The worker, as the shell picks it: ?worker= or the remembered one when it
// is allowed, the local stack on localhost, else the default.
const LOCAL = h => h === 'localhost' || h === '127.0.0.1';
const workerOk = u => { try { const x = new URL(u); return WORKER_ALLOWED.includes(x.origin) || (LOCAL(location.hostname) && LOCAL(x.hostname)); } catch { return false; } };
const WORKER = (() => {
  let kept = null; try { kept = localStorage.getItem('suite_worker'); } catch {}
  if (kept && workerOk(kept)) return kept;
  return LOCAL(location.hostname) ? 'http://127.0.0.1:8787' : WORKER_DEFAULT;
})();
const client = createClient({ baseUrl: WORKER, app: 'map editor' });
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let session = null, stores = [];
const isOwner = () => !!(session?.owner && !session?.actas);
const api = async (path, opts = {}) => client.transport.request(path, { ...opts, token: await client.session.token() });

// ── a small dialog (no prompt(): it can't hide a key or show a summary) ──
function dialog(html, { onOk, okText = 'OK', cancel = true } = {}) {
  document.querySelector('.cd-dlg')?.remove();
  const wrap = document.createElement('div'); wrap.className = 'cd-dlg';
  wrap.innerHTML = `<div class="cd-box">${html}<div class="cd-err"></div><div class="cd-acts">${cancel ? '<button class="cd-cancel">Cancel</button>' : ''}<button class="cd-ok">${esc(okText)}</button></div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove(), err = wrap.querySelector('.cd-err'), ok = wrap.querySelector('.cd-ok');
  wrap.querySelector('.cd-cancel')?.addEventListener('click', close);
  const go = async () => { if (!onOk) return close(); ok.disabled = true; err.textContent = ''; try { if (await onOk(wrap) !== false) close(); } catch (e) { err.textContent = e.message || String(e); } finally { ok.disabled = false; } };
  ok.addEventListener('click', go);
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); if (e.key === 'Escape') close(); });
  wrap.querySelector('input')?.focus();
  return wrap;
}

// ── owner sign-in ─────────────────────────────────────────────────────
function paintAccount() {
  const b = $('cdOwner'), p = $('cdPublish');
  if (b) { b.textContent = isOwner() ? 'Owner ✓' : 'Owner sign-in'; b.classList.toggle('on', isOwner()); b.title = isOwner() ? `Signed in to ${new URL(WORKER).host} as the owner` : 'Sign in with the owner key to open and publish maps'; }
  if (p) p.disabled = !isOwner();
}
async function loadStores() {
  if (!isOwner()) { stores = []; return; }
  try { stores = (await api('/v1/admin/stores')).stores || []; } catch { stores = []; }
  // The editor's store switcher: a Conduit tab with every registered store.
  if (typeof STORE_ZONES !== 'undefined') {
    const zone = { id: 'conduit', label: 'CONDUIT', name: 'Conduit', stores: stores.map(s => ({ number: String(s.no), name: s.name || '', mapFile: true, conduit: true })) };
    const i = STORE_ZONES.findIndex(z => z.id === 'conduit'); if (i >= 0) STORE_ZONES[i] = zone; else STORE_ZONES.unshift(zone);
    if (typeof activeZoneId !== 'undefined' && stores.length) activeZoneId = 'conduit';
    if (typeof renderStoreDropdown === 'function') try { renderStoreDropdown(); } catch {}
  }
}
function account() {
  if (isOwner()) {
    return dialog(`<h3>Conduit owner</h3><p>Signed in to <b>${esc(new URL(WORKER).host)}</b>. Publishing and the suggested edits use this session.</p>`, {
      okText: 'Sign out', onOk: async () => { await client.session.signOut(); session = null; paintAccount(); await loadStores(); },
    });
  }
  const store = session && !session.owner ? `<p class="cd-warn">This device is signed in to store ${esc(session.store)}. Signing in as the owner here signs that out.</p>` : '';
  dialog(`<h3>Owner sign-in</h3><p>The map editor publishes to Conduit with the owner key. Store staff can't use it.</p>${store}<label>Owner key<input type="password" class="cd-key" autocomplete="current-password"></label>`, {
    okText: 'Sign in', onOk: async w => {
      const ownerKey = w.querySelector('.cd-key').value.trim(); if (!ownerKey) throw new Error('Type the owner key.');
      try { session = await client.session.signInOwner({ ownerKey }); }
      catch (e) { throw new Error(e.status === 401 || e.status === 403 ? 'That key is not the owner key.' : e.status === 429 ? 'Too many tries. Wait a few minutes.' : e.message); }
      paintAccount(); await loadStores();
    },
  });
}

// ── open a store's map from Conduit ──────────────────────────────────────
async function openStore(no) {
  if (!isOwner()) return account();
  no = String(no);
  let src;
  try { src = await api(`/v1/store/${encodeURIComponent(no)}/map/latest/source`); }
  catch (e) {
    if (e.status === 404) return dialog(`<h3>Store ${esc(no)}</h3><p>${esc(e.message)}.</p><p>Import the editor's .json or .js file for this store once and publish it from here; after that it opens straight from Conduit.</p>`, { cancel: false });
    return dialog(`<h3>Store ${esc(no)}</h3><p>Couldn't open the map: ${esc(e.message)}</p>`, { cancel: false });
  }
  const draft = typeof getStoreSaveInfo === 'function' ? getStoreSaveInfo(no) : null;
  const open = () => { src.storeNumber = no; importMapData(src, `${no}-conduit`); document.querySelectorAll('.store-dropdown.open, .store-dropdown.visible').forEach(d => d.classList.remove('open', 'visible')); };
  if (draft && draft.shelfCount > 0) dialog(`<h3>Open ${esc(no)} from Conduit?</h3><p>This replaces the draft on this computer (${draft.shelfCount} shelves) with the map as last published.</p>`, { okText: 'Open', onOk: open });
  else open();
}

// ── publish ──────────────────────────────────────────────────────────────
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
// What would go wrong in the store: checked before anything is sent.
function checks(doc) {
  const out = [], all = doc.floors.flatMap(f => (f.shelves || []).map(s => ({ ...s, floor: f.name })));
  const live = all.filter(s => !s.inactive), unnamed = live.filter(s => !s.name);
  if (!live.length) out.push({ bad: true, text: 'There are no shelves in use on any floor.' });
  else if (unnamed.length === live.length) out.push({ bad: true, text: 'No shelf has a name: staff could not tap, find, refresh or count any of them.' });
  else if (unnamed.length) out.push({ text: `${unnamed.length} ${unnamed.length === 1 ? 'shelf has' : 'shelves have'} no name and won't show in Conduit's lists.` });
  for (const f of doc.floors) if (!/^[\w-]{1,32}$/.test(f.id)) out.push({ bad: true, text: `Floor "${f.name}" has an id Conduit can't take (${f.id}).` });
  const names = {}, label = {}; for (const s of live) if (s.name) { const k = canonCode(s.name + (s.subname || '')) + '@' + s.floor; names[k] = (names[k] || 0) + 1; label[k] = (s.name + (s.subname ? ' ' + s.subname : '')).toUpperCase(); }
  const dupes = Object.entries(names).filter(([k, n]) => n > 1 && !live.some(s => s.sharedName && label[k] === (s.name + (s.subname ? ' ' + s.subname : '')).toUpperCase())).map(([k]) => label[k]);
  if (dupes.length) out.push({ text: `${dupes.length} shelf name${dupes.length === 1 ? ' is' : 's are'} used twice on one floor (${dupes.slice(0, 4).join(', ')}${dupes.length > 4 ? '…' : ''}); a scan finds both.` });
  if (!doc.floors.some(f => (f.emergencyMarkers || []).length)) out.push({ text: 'No emergency markers: Emergency and the evacuation route will be empty.' });
  if (!doc.floors.some(f => (f.pathNodes || []).length >= 2)) out.push({ text: 'No walk paths: pick routes and evacuation will draw straight lines.' });
  return out;
}
async function publish() {
  if (!isOwner()) return account();
  const doc = buildMapDocument(), no = String(doc.storeNumber || '').trim();
  if (!no) return dialog('<h3>Publish</h3><p>Set the store number first (Settings tab).</p>', { cancel: false });
  const rec = stores.find(s => String(s.no) === no);
  if (!rec) return dialog(`<h3>Publish</h3><p>Store ${esc(no)} isn't registered in Conduit. Register it in the owner console first.</p>`, { cancel: false });
  let info = null; try { info = await api(`/v1/store/${encodeURIComponent(no)}/map`); } catch {}
  const list = checks(doc), blocked = list.some(c => c.bad);
  const shelves = doc.floors.reduce((n, f) => n + (f.shelves || []).filter(s => !s.inactive).length, 0);
  dialog(`<h3>Publish ${esc(no)} ${esc(rec.name || '')}</h3>
    <p>${doc.floors.length} floor${doc.floors.length === 1 ? '' : 's'} · ${shelves} shelves in use${info ? ` · replaces version <b>${esc(info.version)}</b> (${esc(new Date(info.at).toLocaleString())})` : ' · the first map for this store'}.</p>
    ${list.length ? `<ul class="cd-checks">${list.map(c => `<li class="${c.bad ? 'bad' : ''}">${esc(c.text)}</li>`).join('')}</ul>` : '<p class="cd-ok-line">Checks passed.</p>'}
    <label>Version<input class="cd-ver" value="${esc(stamp())}" maxlength="32"></label>
    <p class="cd-note">Every device in the store gets the new map within a minute. Earlier versions stay listed in the owner console.</p>`, {
    okText: blocked ? 'Fix the red items first' : 'Publish', onOk: async w => {
      if (blocked) return false;
      const version = w.querySelector('.cd-ver').value.trim();
      if (!/^[\w.-]{1,32}$/.test(version) || version === 'latest') throw new Error('A version is 1 to 32 letters, digits, dots or dashes.');
      const body = publishBody(doc, { version, name: rec.name || doc.storeName });
      try {
        const r = await api(`/v1/store/${encodeURIComponent(no)}/map`, { method: 'POST', body });
        if (typeof markClean === 'function') try { markClean(); } catch {}
        dialog(`<h3>Published</h3><p>Store ${esc(no)} is on version <b>${esc(r.version)}</b>: ${r.floors.map(f => `${esc(f.name)} ${f.shelves} shelves`).join(', ')}.${r.stripped ? ` The worker removed ${r.stripped} unsafe item${r.stripped === 1 ? '' : 's'} from the drawing.` : ''}</p>`, { cancel: false });
      } catch (e) { throw new Error(e.code === 'exists' ? `Version ${version} is already published. Use a new version.` : e.message); }
    },
  });
}

// ── preview: the map as the renderer publishes it ───────────────────────
function preview(doc, host, floorId) {
  const out = renderMap(doc), floors = out.floors;
  if (!floors.length) { host.textContent = 'Nothing to preview yet.'; return; }
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const cur = floors.find(f => f.id === floorId) || floors[0];
  root.innerHTML = `<link rel="stylesheet" href="../styles/tokens.css"><link rel="stylesheet" href="../styles/app.css">
    <style>:host{display:block;flex:1;overflow:auto;background:#fff} .pv-tabs{display:flex;gap:6px;padding:8px;font:600 12px system-ui} .pv-tabs button{border:1px solid #ccd;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer} .pv-tabs button.on{background:#d24e0e;color:#fff;border-color:#d24e0e} .pv-map svg{width:100%;height:auto;display:block} .pv-map svg{--label-opacity:1 !important}</style>
    ${floors.length > 1 ? `<div class="pv-tabs">${floors.map(f => `<button data-f="${esc(f.id)}" class="${f.id === cur.id ? 'on' : ''}">${esc(f.name)} · ${f.shelves}</button>`).join('')}</div>` : ''}
    <div class="pv-map">${cur.svg.replace('style="--badge-opacity:1;--label-opacity:0;', 'style="--badge-opacity:0;--label-opacity:1;')}</div>`;
  root.querySelectorAll('.pv-tabs button').forEach(b => b.addEventListener('click', () => preview(doc, host, b.dataset.f)));
}

// ── suggested edits from the store ───────────────────────────────────────
async function suggestions(no) {
  const r = await api(`/v1/admin/stores/${encodeURIComponent(no)}/snapshot?areas=store`);
  return Object.entries(r.state?.mapedits || {}).map(([id, x]) => ({ id, ...x })).filter(x => x.status === 'open').sort((a, b) => (a.at < b.at ? 1 : -1));
}
async function resolve(no, id, status, note) {
  return api(`/v1/admin/stores/${encodeURIComponent(no)}/mapedits/${encodeURIComponent(id)}`, { method: 'POST', body: { status, ...(note ? { note } : {}) } });
}

window.ConduitBridge = { account, openStore, publish, preview, suggestions, resolve, parseMapFile: (t, n) => { const p = parseMapFile(t, n); if (p.kind !== 'map') throw new Error('that file is a drawing, not a map the editor can open'); return p.data; }, canonCode, get owner() { return isOwner(); }, get worker() { return WORKER; } };
window.EDITOR_HANDLERS.publishToConduit = () => publish();
window.EDITOR_HANDLERS.conduitAccount = () => account();

(async () => {
  try { session = await client.session.load(); } catch { session = null; }
  paintAccount(); await loadStores();
  window.dispatchEvent(new CustomEvent('conduit-ready'));
  // Opened from the owner console on a store: its local draft if there is
  // one, else the map as last published.
  const want = new URLSearchParams(location.search).get('store');
  if (want && /^\d{3,6}$/.test(want) && isOwner()) {
    const draft = typeof getStoreSaveInfo === 'function' ? getStoreSaveInfo(want) : null;
    if (draft && draft.shelfCount > 0) switchStore(want); else openStore(want);
  }
})();
client.session.on?.('signin-required', () => { session = null; paintAccount(); });
