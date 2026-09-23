// The one shell. Boots the client library, shows the sign-in cover until a
// session exists, then hosts views from the registry in the content region.
// Desktop, half-screen and phone are container queries on the same frame;
// the phone gets the tab strip and mobile renderers where a view has one.
//
// Two ways in, one frame: a store session (PIN) hosts the store views; an
// owner session (owner key) hosts the admin console with stores in the rail.
// "Act as store" turns an owner session into a store session whose writes
// carry actor.owner, and "Back to the console" returns.

import { productLife } from '../shared/records.js';
import { createClient } from '../client/index.js';
import { $, $$, ic, esc, greeting, fmtLong, toast } from './ui.js';
import { loadMap, setMap, mapInfo, parkMap } from './map.js';
import { initSearch } from './search.js';
import { updates, initUpdates } from './updates.js';
import { VIEWS, RAIL, STRIP, MORE, ADMIN_RAIL, HOME, WORKSPACES } from './registry.js';
import { ensureArea, hasArea } from './unlock.js';
import { resetAdmin } from './views/admin.js';
import { prefs, applyPrefs } from './prefs.js';
import { VERSION } from './version.js';
import { WORKER_DEFAULT, WORKER_ALLOWED } from './config.js';

// The worker: ?worker= (remembered), then the remembered one, then the
// default. Only an allowed origin is taken, from the link or from storage.
const LOCAL = h => h === 'localhost' || h === '127.0.0.1';
const workerOk = u => { try { const x = new URL(u); return WORKER_ALLOWED.includes(x.origin) || (LOCAL(location.hostname) && LOCAL(x.hostname) && /^https?:$/.test(x.protocol)); } catch { return false; } };
const WORKER = (() => {
  const asked = new URLSearchParams(location.search).get('worker');
  if (asked && workerOk(asked)) { try { localStorage.setItem('suite_worker', new URL(asked).origin); } catch {} return new URL(asked).origin; }
  let kept = null; try { kept = localStorage.getItem('suite_worker'); } catch {}
  if (kept && workerOk(kept)) return kept;
  if (kept) try { localStorage.removeItem('suite_worker'); } catch {}
  return LOCAL(location.hostname) ? 'http://127.0.0.1:8787' : WORKER_DEFAULT;
})();
const WORKER_NOTE = new URLSearchParams(location.search).get('worker') && !workerOk(new URLSearchParams(location.search).get('worker')) ? 'That link asked for a worker this app does not trust; it was ignored.' : '';
// Shown on the sign-in when the device talks to anything but the default.
const workerLine = () => WORKER === WORKER_DEFAULT ? '' : `<div class="si-worker">${ic('lock')}Signing in to <b>${esc(new URL(WORKER).host)}</b></div>`;

const client = createClient({ baseUrl: WORKER, app: 'conduit ' + VERSION });
let store = null, admin = null, current = null, currentArg = null, unsubs = [], ws = 'floor';
const frame = $('.frame');
let content = $('#content');
const isMobile = () => frame.clientWidth <= 600;

// ── boot ──────────────────────────────────────────────────────────────
applyPrefs(frame);
$('#footDate').textContent = fmtLong();
$('#footVer').textContent = 'Conduit ' + VERSION;
client.session.on('signin-required', () => { const wasOwner = admin || client.session.current?.owner; leave(); showSignin(wasOwner ? { owner: true, error: 'Owner session expired. Sign in again.' } : {}); });
(async () => {
  const s = await client.session.load();
  if (s?.store) await enter(); else if (s?.owner) await enterAdmin(); else showSignin();
})();

// ── store mode ────────────────────────────────────────────────────────
async function enter() {
  showLoading();
  const s = client.session.current;
  try {
    store = await client.open(s.store);
    await loadStoreMap(s.store);
  } catch (e) {
    if (s.actas) { await client.session.endActAs(); await enterAdmin(); toast(`Cannot open ${s.store}: ${e.message}`, 'bad'); return; }
    hideCover(); showSignin({ error: e.message }); return;
  }
  admin = null; frame.classList.remove('adm');
  store.on('status', paintStatus); store.on('reject', r => toast(`${r.code}: ${r.message}`, 'bad'));
  store.on('map', onMapProjection);
  paintStatus(store.status);
  $('#chipName').textContent = s.name || s.store; $('#chipNo').textContent = 'Store ' + s.store;
  buildRail(); setWs('floor');
  actasBar(s.actas ? s : null);
  hideCover();
  show(isMobile() ? 'mhome' : 'dashboard');
}
// The published map: the store's `map` projection names the current
// version, the maps client holds one copy per device, and a store with
// nothing published yet falls back to a bundled file or a placeholder.
async function loadStoreMap(no) {
  const version = store?.get('map')?.version || null;
  let doc = null;
  try { doc = await client.maps.get(no, { version }); } catch (e) { console.warn('map', e.message); }
  if (doc) { setMap(doc); search?.invalidate(); return; }
  try { await loadMap(`maps/${no}.svg`); } catch { setMap(null); }
  search?.invalidate();
}
let mapRefresh = null;
function onMapProjection(m) {
  if (!store || !m?.version || m.version === mapInfo()?.version) return;
  clearTimeout(mapRefresh);
  mapRefresh = setTimeout(async () => {
    const no = client.session.current?.store; if (!no || !store) return;
    await loadStoreMap(no);
    toast(`Map updated to version ${m.version}`);
    if (current) show(current, currentArg);
  }, 500);
}
function closeStore() { client.closeAll(); store = null; for (const u of unsubs) u(); unsubs = []; content.innerHTML = ''; current = null; currentArg = null; }
function leave() { closeStore(); admin = null; frame.classList.remove('adm'); actasBar(null); resetAdmin(); }
async function signOut() {
  try { await store?.flush(); } catch {}
  // A shared device keeps no store data past sign-out (the outbox was just
  // flushed; anything still queued stays so it is not lost).
  const no = client.session.current?.store;
  if (no && !client.session.current?.actas && !(store?.pending?.length)) try { await client.storage.del(`snap:${no}`); } catch {}
  if (client.session.current?.actas) { closeStore(); await client.session.endActAs(); await enterAdmin(); return; }
  leave(); await client.session.signOut(); showSignin();
}
function actasBar(s) {
  $('#actasBar')?.remove(); if (!s) return;
  const bar = document.createElement('div'); bar.id = 'actasBar'; bar.className = 'ad-banner actas';
  bar.innerHTML = `${ic('lock')}<div><b>Acting as ${esc(s.store)} ${esc(s.name || '')}</b><span> · owner · every write carries your owner id</span></div><a data-shell-act="end-actas">${ic('arrow')}Back to the console</a>`;
  frame.appendChild(bar);
}

// ── owner mode ────────────────────────────────────────────────────────
async function enterAdmin() {
  closeStore(); store = null; actasBar(null);
  const api = async (path, opts = {}) => client.transport.request(path, { ...opts, token: await client.session.token() });
  admin = { api, base: client.transport.base, stores: [], refreshStores: async () => { admin.stores = (await api('/v1/admin/stores')).stores; buildAdminRail(); } };
  cover(`<div class="ld-center"><div class="ld-brand">${mark()}<span class="ld-word">Con<b>duit</b></span></div><div class="ld-store"><span>Owner</span><span class="num">console</span></div><div class="ld-text">Loading stores…</div><div class="ld-bar"><i></i></div></div>`, 'loading');
  try { await admin.refreshStores(); }
  catch (e) { admin = null; hideCover(); if (e.status === 401 || e.status === 403) { await client.session.signOut(); showSignin({ owner: true, error: 'Owner session expired. Sign in again.' }); } else showSignin({ owner: true, error: e.message }); return; }
  frame.classList.add('adm'); setWs('admin');
  paintStatus({ state: 'owner' });
  hideCover();
  show(current && current.startsWith('admin') ? current : 'admin', currentArg);
}
function buildAdminRail() {
  const h = s => !['floor', 'stockroom', 'backdock'].some(a => s.entitlements?.[a]) ? 'leg' : s.status === 'live' ? 'ok' : s.status === 'migrating' ? 'mig' : 'leg';
  $('#radm').innerHTML = `<div class="radm-top"><span class="own">Owner</span><b>Admin console</b></div>` +
    `<div class="rsec">Stores</div>` + (admin.stores.map(s => `<button class="rrow ad" data-view="adminstore" data-no="${esc(s.no)}"><i class="hdot ${h(s)}"></i><span class="mono">${esc(s.no)}</span><span class="rl">${esc(s.name)}</span></button>`).join('') || '<div class="rrow soon">No stores yet</div>') +
    `<div class="rsec">System</div>` + ADMIN_RAIL.map(r => `<button class="rrow" data-view="${r[0]}">${ic(r[1])}<span class="rl">${r[2]}</span></button>`).join('') +
    `<button class="rrow" data-view="settings">${ic('m-settings')}<span class="rl">Settings</span></button>` +
    `<div class="railfoot"><button class="rrow" data-shell-act="signout">${ic('lock')}<span class="rl">Sign out of owner</span></button></div>`;
  markRail();
}

// ── covers ────────────────────────────────────────────────────────────
function hideCover() { $('#cover')?.remove(); }
function cover(html, cls = '') { hideCover(); const el = document.createElement('div'); el.id = 'cover'; el.className = 'signin ' + cls; el.innerHTML = html; frame.appendChild(el); return el; }
function showLoading() {
  const s = client.session.current;
  cover(`<div class="ld-center"><div class="ld-brand">${mark()}<span class="ld-word">Con<b>duit</b></span></div><div class="ld-store"><span>${esc(s?.name || '')}</span><span class="num">${esc(s?.store || '')}</span></div><div class="ld-text" id="ldText">Loading map…</div><div class="ld-bar"><i></i></div></div>`, 'loading');
}
async function showSignin({ error, owner } = {}) {
  if (owner) return showOwnerSignin(error);
  const mobile = isMobile();
  let stores = [];
  try { stores = (await client.transport.request('/v1/stores')).stores; } catch (e) { error = error || (WORKER ? `Cannot reach the worker at ${WORKER}` : 'No worker configured: open with ?worker=https://…'); }
  const options = stores.map(s => `<option value="${esc(s.no)}">${esc(s.no)} ${esc(s.name)}${s.region ? ' · ' + esc(s.region) : ''}</option>`).join('');
  const form = `<form class="si-form" id="siForm"><h2>Welcome back</h2><div class="si-sub">Choose your store. Everything keeps working offline once it is on this device.</div>` +
    `<label>Store</label><select class="si-field" name="store" required>${options || '<option value="">No stores registered</option>'}</select>` +
    `<label>Store PIN</label><input class="si-pin" name="pin" inputmode="numeric" autocomplete="off" placeholder="••••" required>` +
    `<div class="si-role">${ic('users')}<div>The store PIN opens the Floor. Stockroom and Back dock take their crew code once per device; a manager code opens everything.</div></div>` +
    `<div class="si-err" id="siErr">${error ? esc(error) : WORKER_NOTE ? esc(WORKER_NOTE) : ''}</div>${workerLine()}<button class="si-cta" type="submit">Enter store${ic('arrow')}</button>` +
    `<div class="si-foot"><span>${ic('check')}Offline ready</span><span>${stores.length} store${stores.length === 1 ? '' : 's'}</span><a class="si-owner-link" data-shell-act="owner-signin">Owner sign-in</a><span class="ver">Conduit ${VERSION}</span></div></form>`;
  const hero = `<div class="si-hero"><div class="si-brand">${mark()}<b>Conduit</b></div><div class="si-greet">${greeting()}</div><h1>Run the <span>whole store</span>.</h1><p>Live maps, back-dock receiving and stockroom backfill. One team, one sign-in, on and off the wifi.</p><div class="si-off">${ic('check')}Works offline once it is on this device</div></div>`;
  const el = cover(mobile ? `<div class="si-panel si-centre">${form}</div>` : `<div class="si-panel si-duo">${hero}${form}</div>`);
  $('#siForm', el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target); const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
    try { await client.session.signIn({ store: f.get('store'), pin: f.get('pin') }); await enter(); }
    catch (err) { $('#siErr', el).textContent = friendly(err); btn.disabled = false; }
  });
}
function showOwnerSignin(error) {
  const el = cover(`<div class="si-panel si-owner"><form class="si-own" id="siOwner"><div class="si-brand">${mark()}<b>Conduit</b><span class="own">Owner</span></div><h2>Owner sign-in</h2><p>For the developer. Store teams sign in on the store screen and never see this.</p>` +
    `<label for="ownerKey">Owner key</label><div class="si-pin own"><input id="ownerKey" name="ownerKey" type="password" autocomplete="current-password" placeholder="••••••••••••" required>${ic('lock')}</div>` +
    `<label>This device</label><div class="si-field own"><span>${esc(client.session.device || 'this device')}</span><small>${esc(WORKER.replace(/^https?:\/\//, ''))}</small></div>` +
    `<div class="si-err" id="siErr">${error ? esc(error) : ''}</div>${workerLine()}<button class="si-cta own" type="submit">Open the admin console${ic('arrow')}</button>` +
    `<div class="si-foot own"><a data-shell-act="store-signin">Store sign-in instead</a><span class="ver">Conduit ${VERSION}</span></div></form></div>`);
  $('#ownerKey', el).focus();
  $('#siOwner', el).addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
    try { await client.session.signInOwner({ ownerKey: $('#ownerKey', el).value }); await enterAdmin(); }
    catch (err) { $('#siErr', el).textContent = friendly(err, 'Wrong owner key.'); btn.disabled = false; }
  });
}
const friendly = (err, wrong = 'Wrong PIN.') => err.code === 'locked_out' ? `Too many attempts. Try again in ${Math.ceil((err.detail?.retryAfter || 60) / 60)} min.` : err.code === 'unauthorised' ? wrong : err.code === 'not_registered' ? 'That store is not registered.' : err.code === 'not_configured' ? 'The worker has no owner key set yet.' : err.message;
const mark = () => `<svg class="vmark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><path d="M22 10.2a8 8 0 1 0 0 11.6" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/><circle cx="16.5" cy="16" r="2.8" fill="#fff"/></svg>`;

// ── rail, strip, status ───────────────────────────────────────────────
// What each rail row does, shown beside it on hover (the showcase's rail
// tips; Vector's rail had the same).
const RDESC = {
  dashboard: 'Today’s numbers across the three areas, the operations register and the dock at a glance.',
  map: 'The live store map: shelves, bays, departments and what sits on each shelf.',
  picklist: 'Items to fetch for the floor, routed as the shortest walk from the front doors.',
  refresh: 'Scan shelves against this week’s focus departments and track the weekly target.',
  labelint: 'Check every numbered micro-department once a cycle for wrong labels and tickets.',
  emergency: 'Exits, extinguishers, first aid, assembly point and service dates on the map.',
  maintenance: 'Log store issues on the map, track severity, contractors and completion.',
  stocktake: 'Run a count session: shelves counted, verified and the department tallies.',
  receiving: 'The dock board: pallets landed, decanting live, progress to the clear-by goal.',
  manifests: 'Published DC manifests and which pallet carries any keycode.',
  bfreview: 'Today’s backfill board: compare scans to the report, mark locations ready.',
  cages: 'Every cage on the stockroom and dock levels, what it holds and when it was last seen.',
  adjust: 'Below-zero stock evidence for the office to adjust in the official system.',
  daylist: 'The posted walk for the day, split by walker, with spot-checks flagged.',
  srhistory: 'The permanent archive of every location marked ready and what it held.',
  planner: 'The week ahead: which trucks land when, their teams and pre-staged manifests.',
  rhistory: 'Every decanted truck: clear time, where the time went, manifest reconciliation and crew credit.',
  profiles: 'Units per carton by keycode, built from the manifests the store has published.',
  settings: 'Updates, account, appearance, storage, departments, feedback and help.',
  admin: 'Every registered store: health, areas live or on legacy, devices and the last event.',
  adminstore: 'This store’s console: overview, events, devices, access, map and migration.',
  adminreg: 'Register a store: number, name, region, PIN, crew codes and which areas it may use.',
  adminactions: 'Everything done from the owner console, newest first.',
};
let rtip = null;
function railTip(b, show) {
  if (!show) { if (rtip) rtip.classList.remove('on'); return; }
  const v = b.getAttribute('data-view'), fr = $('.frame'); if (!fr) return;
  const name = b.dataset.no ? `${b.dataset.no} ${b.textContent.replace(b.dataset.no, '').trim()}` : (VIEWS[v]?.title || b.textContent.trim());
  const d = RDESC[v] || ''; if (!d) return railTip(b, false);
  if (!rtip || rtip.parentNode !== fr) { if (rtip) rtip.remove(); rtip = document.createElement('div'); rtip.className = 'rtip'; fr.appendChild(rtip); }
  rtip.innerHTML = `<b>${esc(name)}</b><span>${esc(d)}</span>`;
  const r = b.getBoundingClientRect(), fb = fr.getBoundingClientRect(), sc = fb.width / fr.offsetWidth || 1;
  rtip.style.left = ((r.right - fb.left) / sc + 10) + 'px'; rtip.style.top = ((r.top - fb.top) / sc + r.height / (2 * sc)) + 'px'; rtip.classList.add('on');
}
document.addEventListener('mouseover', e => { const b = e.target.closest?.('.rrow[data-view]'); if (b && !b.disabled) railTip(b, true); });
document.addEventListener('mouseout', e => { const b = e.target.closest?.('.rrow[data-view]'); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) railTip(b, false); });
document.addEventListener('click', () => railTip(null, false));
function buildRail() {
  const rows = v => `<button class="rrow" data-view="${v.id}">${ic(v.icon)}<span class="rl">${v.rail || v.title}</span></button>`;
  $('#railscroll').innerHTML = RAIL.map(sec => `<div class="rsec">${sec.sec}</div>` + sec.rows.map(r => typeof r === 'string' ? rows(VIEWS[r]) : `<button class="rrow soon" disabled title="Arrives with the ${sec.sec} port">${ic(r[2])}<span class="rl">${r[1]}</span><span class="badge soon">Soon</span></button>`).join('')).join('');
}
function setWs(w) {
  ws = w; $('#app').className = 'app ws-' + w + (prefs().railmin ? ' railmin' : '');
  $('#mstrip').innerHTML = STRIP[w].map(m => `<button data-view="${m[0]}">${ic(m[1])}${m[2]}</button>`).join('');
}
function paintStatus(s) {
  const el = $('#footSync'); if (!el) return;
  if (s.state === 'owner') { el.innerHTML = `<span class="dot"></span>Owner console`; el.title = ''; return; }
  const txt = s.state === 'live' ? 'Synced to cloud' : s.state === 'polling' ? 'Synced (polling)' : s.state === 'connecting' ? 'Connecting…' : `Offline${s.queued ? ` · ${s.queued} change${s.queued === 1 ? '' : 's'} queued` : ''}`;
  el.innerHTML = `<span class="dot ${s.state === 'live' || s.state === 'polling' ? '' : 'off'}"></span>${txt}`;
  el.title = s.lastError || '';
}
function markRail() {
  const id = current, no = currentArg?.no == null ? null : String(currentArg.no);
  for (const b of $$('.rrow[data-view]')) b.classList.toggle('on', b.getAttribute('data-view') === id && (!b.dataset.no || b.dataset.no === no));
  for (const b of $$('#mstrip button')) b.classList.toggle('on', b.getAttribute('data-view') === id || (b.getAttribute('data-view') === 'mhome' && id === 'map') || (b.getAttribute('data-view') === 'admin' && id === 'adminstore'));
}

// ── views ─────────────────────────────────────────────────────────────
function show(id, arg) {
  if (!store && !admin) return;
  const mobile = isMobile();
  if (id === 'mhome') id = admin ? 'admin' : mobile ? (HOME[ws] || 'map') : 'dashboard';
  if (id === 'more') return openMore();
  if (id === 'launcher') return openLauncher();
  let view = VIEWS[id] || VIEWS[admin ? 'admin' : 'dashboard'];
  // Admin views need the owner session; store views need a store.
  if (view.id.startsWith('admin') && !admin) view = VIEWS.dashboard;
  if (!view.id.startsWith('admin') && view.id !== 'settings' && !store) view = VIEWS.admin;
  // A workspace view needs its crew code once per device (a manager code opens all).
  if (store && view.area && view.area !== 'floor' && !hasArea(client.session, view.area)) {
    if (!(client.session.current?.caps || []).includes(view.area)) { toast(`This store is not set up for the ${view.area === 'backdock' ? 'Back dock' : view.area}`); return; }
    ensureArea({ session: client.session, frame, area: view.area }).then(ok => { if (ok) show(id, arg); });
    return;
  }
  if (store && view.area && view.area !== ws && view.area !== 'admin') setWs(view.area);
  // A phone-only view (a workspace home) opens its desktop counterpart on a wide screen.
  if (!mobile && view.desktopView && VIEWS[view.desktopView]) return show(view.desktopView, arg);
  id = view.id;
  for (const u of unsubs) u(); unsubs = [];
  currentArg = arg !== undefined ? arg : (id === current ? currentArg : null);
  current = id;
  // A fresh content element each time, so a view's listeners die with it.
  parkMap();
  const fresh = content.cloneNode(false); content.replaceWith(fresh); content = fresh;
  const cur = client.session.current;
  const ctx = { store, admin, arg: currentArg, session: client.session, catalogue: client.catalogue, api: (path, opts = {}) => client.session.token().then(token => client.transport.request(path, { ...opts, token })), storage: client.storage, storeNo: cur?.store, storeName: cur?.name || '', isMobile: mobile, go: show, rerender: () => show(current, currentArg), signOut, actAs };
  const useMobile = mobile && typeof view.mobile === 'function';
  content.classList.toggle('mv', useMobile);
  content.innerHTML = useMobile ? view.mobile(ctx) : view.desktop(ctx);
  const hs = $('#hdrslot'); hs.innerHTML = ''; if (!useMobile && frame.classList.contains('hdr-title')) { const vh0 = content.querySelector('.vh'); if (vh0) hs.appendChild(vh0); }
  try { unsubs = view.mount?.(ctx, content) || []; } catch (e) { console.error(e); toast(e.message, 'bad'); }
  content.scrollTop = 0;
  markRail();
  $('#msheet')?.classList.remove('open');
  $('#crumb').textContent = view.title;
}
async function actAs(no) {
  try { await store?.flush(); } catch {}
  await client.session.actAs(no);
  closeStore(); admin = null; frame.classList.remove('adm'); resetAdmin();
  await enter();
}
function openLauncher() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  const caps = client.session.current?.caps || [];
  sh.innerHTML = `<div class="sheet"><h3>Workspace</h3><div class="mv-tiles">${WORKSPACES.map(w => { const on = caps.includes(w[0]); return `<button class="mv-tile${ws === w[0] ? ' hot' : ''}" data-ws="${w[0]}" ${on ? '' : 'disabled style="opacity:.5"'}><span class="ti">${ic(w[2])}</span><span class="tx"><b>${w[1]}</b><span>${on ? w[3] : caps.includes(w[0]) ? w[3] : 'Not on for this store'}</span></span><span>${hasArea(client.session, w[0]) || w[0] === 'floor' ? '' : ic('lock')}</span>${ic('chev')}</button>`; }).join('')}</div><button class="mv-ghost" data-act="close-more">Close</button></div>`;
  sh.classList.add('open');
}
function openMore() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  sh.innerHTML = `<div class="sheet"><h3>More</h3><div class="mv-tiles">${MORE[ws].map(m => `<button class="mv-tile" data-view="${m[0]}"><span class="ti">${ic(m[1])}</span><span class="tx"><b>${m[2]}</b></span><span></span>${ic('chev')}</button>`).join('')}<button class="mv-tile" data-shell-act="switch-area"><span class="ti">${ic('grid')}</span><span class="tx"><b>Switch area</b></span><span></span>${ic('chev')}</button><button class="mv-tile" data-shell-act="signout"><span class="ti">${ic('lock')}</span><span class="tx"><b>${client.session.current?.actas ? 'Back to the console' : 'Sign out'}</b></span><span></span>${ic('chev')}</button></div><button class="mv-ghost" data-act="close-more">Close</button></div>`;
  sh.classList.add('open');
}
document.addEventListener('click', e => {
  const sa = e.target.closest('[data-shell-act]');
  if (sa) {
    const act = sa.getAttribute('data-shell-act');
    if (act === 'signout' || act === 'end-actas') signOut();
    else if (act === 'update-now') updates.apply();
    else if (act === 'update-later') $('#updBar')?.remove();
    else if (act === 'owner-signin') showSignin({ owner: true });
    else if (act === 'switch-area') { $('#msheet')?.classList.remove('open'); if (store) openLauncher(); }
    else if (act === 'store-signin') showSignin();
    return;
  }
  // The search palette routes its own rows (they carry select, dept or q);
  // elsewhere a data-view element opens the view, with a store number for
  // the console's store rows.
  const v = e.target.closest('[data-view]'); if (v && !v.disabled) { if (v.closest('#omni')) return; show(v.getAttribute('data-view'), v.dataset.no ? { no: v.dataset.no } : undefined); return; }
  const w = e.target.closest('[data-ws]'); if (w && !w.disabled) { $('#msheet')?.classList.remove('open'); const target = w.dataset.ws; if (target === ws) return; if (target === 'floor') { setWs('floor'); show('mhome'); } else show(HOME[target] || 'mhome'); return; }
  if (e.target.closest('.mdepts')) { if (store) openLauncher(); return; }
  const g = e.target.closest('[data-go]'); if (g) { if (g.getAttribute('data-go') === 'search') search.open(); else show(g.getAttribute('data-go'), g.dataset.bay ? { bay: g.dataset.bay } : undefined); return; }
  if (e.target.closest('[data-act="close-more"]') || (e.target.id === 'msheet')) $('#msheet')?.classList.remove('open');
  if (e.target.closest('#railToggle')) { $('#app').classList.toggle('railmin'); }
  if (e.target.closest('#hsearch,.bsearch,#msearch')) { if (admin) toast('Find a store from the rail for now'); else search.open($('#msearch input')?.value || ''); }
});
// Installing and updating: the bar appears when a new release is waiting and
// applies only on "Update now" (the worker never takes over on its own).
initUpdates();
updates.on(kind => {
  if (kind === 'ready') {
    let bar = $('#updBar'); if (!bar) { bar = document.createElement('div'); bar.id = 'updBar'; bar.className = 'ad-banner actas upd'; frame.appendChild(bar); }
    bar.innerHTML = `${ic('refresh')}<div><b>Conduit ${esc(updates.state.waiting?.version || '')} is ready</b><span> · installed in the background · applies when you say</span></div><a data-shell-act="update-now">${ic('check')}Update now</a><a data-shell-act="update-later">Later</a>`;
  }
  if (kind === 'applying') { const bar = $('#updBar'); if (bar) bar.innerHTML = `${ic('refresh')}<div><b>Updating…</b></div>`; }
});
// The palette: keycodes to the catalogue, shelves from the map, tools from the registry.
const search = initSearch({ client, frame, go: (id, arg) => show(id, arg), life: kc => store ? productLife(store.get(), kc) : null, tools: () => RAIL.flatMap(sec => sec.rows.filter(r => typeof r === 'string').map(r => VIEWS[r])).concat([VIEWS.dashboard, VIEWS.planner, VIEWS.settings]) });
$('#msearch input')?.addEventListener('focus', e => { if (!admin && store) { e.target.blur(); search.open(e.target.value); } });
let lastMobile = isMobile();
window.addEventListener('resize', () => { const m = isMobile(); if (m !== lastMobile) { lastMobile = m; if (current) show(current, currentArg); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#msheet')?.classList.remove('open'); });
