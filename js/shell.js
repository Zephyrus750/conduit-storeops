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
import { $, $$, ic, esc, greeting, fmtLong, toast, installKeyboard, setStoreTz, today, DEPT_COLOUR, DEPT_NAME, DEPT_GROUPS } from './ui.js';
import { settingsOf } from '../shared/reducers/store.js';
import { retailPeriod } from '../shared/time.js';
import { installCameraButtons } from './scan.js';
import { loadMap, setMap, mapInfo, parkMap, mapStats, shelfForLocation, splitCanon } from './map.js';
import { initSearch } from './search.js';
import { voiceSupported, listenOnce } from './voice.js';
import { resolveSpoken } from '../shared/voice.js';
import { takeDeepLink } from './share.js';
import { installLog } from './diag.js';
installLog();
import { updates, initUpdates } from './updates.js';
import { VIEWS, RAIL, STRIP, MORE, ADMIN_RAIL, HOME, WORKSPACES } from './registry.js';
import { toolForView, toolOff } from '../shared/tools.js';
import { ensureArea, hasArea } from './unlock.js';
import { resetAdmin } from './views/admin.js';
import { prefs, applyPrefs } from './prefs.js';
import { VERSION } from './version.js';
import { mountTeam } from './team.js';
import { firstRun } from './tour.js';
import { whatsNewOnce } from './whatsnew.js';
import { WORKER_DEFAULT, WORKER_ALLOWED } from './config.js';
import { polyBackground } from './lowpoly.js';
import { applyOrientation, haptic } from './device.js';

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
let team = null;      // the team message strip (js/team.js)
let store = null, admin = null, current = null, currentArg = null, unsubs = [], ws = 'floor';
const frame = $('.frame');
installKeyboard();
applyOrientation();
installCameraButtons(document);
let content = $('#content');
const isMobile = () => frame.clientWidth <= 600;

// ── boot ──────────────────────────────────────────────────────────────
applyPrefs(frame);
// Footer: the date and the retail week, kept current across midnight.
const paintFootDate = () => { $('#footDate').textContent = `${fmtLong()} · ${retailPeriod(new Date())}`; };
paintFootDate(); setInterval(paintFootDate, 60_000);
$('#footVer').textContent = 'Conduit ' + VERSION;
// The token's areas changed (the owner switched one, and the device renewed):
// the rail follows, and a view in an area that went away goes home.
let capsSig = null;
client.session.on('change', snap => {
  const sig = (snap?.caps || []).join(',');
  if (capsSig === null || !store || admin) { capsSig = sig; return; }
  if (sig === capsSig) return;
  const gone = capsSig.split(',').filter(a => a && !sig.split(',').includes(a)); capsSig = sig;
  buildRail(); paintBadges();
  const view = current && VIEWS[current];
  if (view && view.area && view.area !== 'store' && !(snap?.caps || []).includes(view.area)) { setWs('floor'); show(HOME.floor); }
  if (gone.length) toast(`${gone.map(a => a === 'backdock' ? 'The Back dock' : a === 'stockroom' ? 'The Stockroom' : 'The Floor').join(' and ')} ${gone.length === 1 ? 'was' : 'were'} switched off for this store`);
});
client.session.on('signin-required', () => { const wasOwner = admin || client.session.current?.owner; leave(); showSignin(wasOwner ? { owner: true, error: 'Owner session expired. Sign in again.' } : {}); });
// A shared shelf link (?store=…&shelf=…): open the map on that shelf once
// signed in to that store. A store parked on this device is switched to; a
// device that is not signed in gets the sign-in with that store chosen.
let pendingLink = takeDeepLink();
(async () => {
  let s = await client.session.load();
  if (pendingLink && s?.store && !s.actas && s.store !== pendingLink.store) {
    try { if ((await client.session.parked()).some(p => p.store === pendingLink.store)) s = await client.session.switchTo(pendingLink.store); } catch {}
  }
  if (s?.store) await enter(); else if (s?.owner) await enterAdmin(); else showSignin();
})();
function openPendingLink(s) {
  const l = pendingLink; pendingLink = null; if (!l) return false;
  if (l.store !== s.store) { toast(`That ${l.issue ? 'work order' : 'shelf link'} is for store ${l.store}. Add that store from Store details to open it.`); return false; }
  if (l.issue) { show('maintenance', { issue: l.issue }); return true; }
  show('map', { select: l.shelf }); return true;
}

// ── store mode ────────────────────────────────────────────────────────
async function enter() {
  let last = null; try { last = localStorage.getItem('last_workspace'); } catch {}    // before setWs('floor') below overwrites it
  showLoading();
  const s = client.session.current;
  try {
    store = await client.open(s.store);
    await loadStoreMap(s.store);
  } catch (e) {
    if (s.actas) { await client.session.endActAs(); await enterAdmin(); toast(`Cannot open ${s.store}: ${e.message}`, 'bad'); return; }
    hideCover(); showSignin({ error: e.message }); return;
  }
  admin = null; frame.classList.remove('adm'); capsSig = (client.session.current?.caps || []).join(',');
  // After an update, What's New once (a device on its first run gets the walkthrough instead).
  { let fresh = true; try { fresh = !JSON.parse(localStorage.getItem('walkthrough_seen') || '{}').floor; } catch {} if (!s.owner && !s.actas) setTimeout(() => whatsNewOnce(show, { firstRun: fresh }), 900); }
  team?.off(); team = mountTeam({ store, session: client.session, host: $('#teambar'), today, storeNo: s.store, isHome: () => ['dashboard', 'map', 'srhome', 'bdhome'].includes(current) });
  store.on('status', paintStatus); store.on('reject', r => toast(`${r.code}: ${r.message}`, 'bad'));
  store.on('map', onMapProjection);
  store.on('settings', applySettings); applySettings(store.get('settings'));
  store.on('backfill', paintBadges); store.on('cages', paintBadges);
  // The owner switched a tool on or off: the rail follows, and a view that
  // has just been switched off closes.
  // The owner switched an area on or off: renew the token now (its areas
  // come from the registry), and the rail, the views and the data follow.
  let areasSig = JSON.stringify(store.get('areas')?.on || null);
  store.on('areas', a => { const sig = JSON.stringify(a?.on || null); if (sig === areasSig) return; areasSig = sig; client.session.refresh().catch(() => {}); });
  store.on('tools', () => { if (offList().join() === toolsSig) return; buildRail(); paintBadges(); setWs(ws); if (current && offView(current)) show(current, currentArg); });
  paintStatus(store.status);
  $('#chipName').textContent = s.name || s.store; $('#chipNo').textContent = 'Store ' + s.store;
  buildRail(); paintBadges(); setWs('floor');
  actasBar(s.actas ? s : null);
  hideCover();
  if (openPendingLink(s)) return;
  if (!isMobile()) return show('dashboard');
  // The phone goes back to the area it was last used in when this device can
  // still open it; otherwise it asks where you are working.
  const caps = s.caps || [];
  if (last && caps.includes(last) && (last === 'floor' || hasArea(client.session, last))) { setWs(last); show(HOME[last] || 'mhome'); }
  else { show('mhome'); openLauncher(); }
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
// Store settings: the zone every day, week and cycle follows, and the idle
// re-lock. A device idle for autoLockMins gives up its area and manager codes
// (the worker revokes them) and the open workspace asks for its code again.
let lockMins = 0, idleSince = Date.now(), locking = false;
function applySettings(x) { const cfg = settingsOf(x); setStoreTz(cfg.tz); lockMins = cfg.autoLockMins; }
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(ev, () => { idleSince = Date.now(); }, { capture: true, passive: true });
setInterval(idleCheck, 20_000);
async function idleCheck() {
  const cur = client.session.current;
  if (locking || !store || !lockMins || !cur || cur.owner || !(cur.roles || []).some(r => r !== 'floor')) return;
  if (Date.now() - idleSince < lockMins * 60_000) return;
  locking = true;
  try {
    try { await store.flush(); } catch {}
    await client.session.lock();
    toast(`Locked after ${lockMins} min idle. The store PIN's floor session stays open.`);
    const area = VIEWS[current]?.area;
    if (area && area !== 'floor' && area !== 'admin') { setWs('floor'); show('mhome'); } else if (current) show(current, currentArg);
  } catch { /* offline: tried again on the next check */ }
  finally { locking = false; }
}
function closeStore() { team?.off(); team = null; setStoreTz(null); lockMins = 0; client.closeAll(); store = null; for (const u of unsubs) u(); unsubs = []; content.innerHTML = ''; current = null; currentArg = null; }
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
    `<div class="si-foot"><span>${ic('check')}Offline ready</span><span class="si-count">${stores.length} store${stores.length === 1 ? '' : 's'}</span><a class="si-owner-link" data-shell-act="owner-signin">Owner sign-in</a><span class="ver">Conduit ${VERSION}</span></div></form>`;
  const hero = `<div class="si-hero"><div class="si-brand">${mark()}<b>Conduit</b></div><div class="si-greet">${greeting()}</div><h1>Run the <span>whole store</span>.</h1><p>Live maps, back-dock receiving and stockroom backfill. One team, one sign-in, on and off the wifi.</p><div class="si-off">${ic('check')}Works offline once it is on this device</div></div>`;
  const el = cover(polyBackground() + (mobile ? `<div class="si-panel si-centre">${form}</div>` : `<div class="si-panel si-duo">${hero}${form}</div>`));
  if (pendingLink && stores.some(x => String(x.no) === pendingLink.store)) { $('#siForm select[name="store"]', el).value = pendingLink.store; $('#siErr', el).textContent = error || (pendingLink.issue ? "Sign in to open the work order." : `Sign in to open shelf ${pendingLink.shelf}.`); }
  $('#siForm', el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target); const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
    try { await client.session.signIn({ store: f.get('store'), pin: f.get('pin') }); await enter(); }
    catch (err) { $('#siErr', el).textContent = friendly(err); btn.disabled = false; }
  });
}
function showOwnerSignin(error) {
  const el = cover(polyBackground() + `<div class="si-panel si-owner"><form class="si-own" id="siOwner"><div class="si-brand">${mark()}<b>Conduit</b><span class="own">Owner</span></div><h2>Owner sign-in</h2><p>For the developer. Store teams sign in on the store screen and never see this.</p>` +
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
  printmap: 'Compose a printable map: floors, an area, layers, a legend; or a booklet, one page per department.',
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
// A tool the owner switched off for this store (the tools projection):
// hidden everywhere and refused when opened.
const offList = () => (store?.get('tools')?.off) || [];
const offView = id => toolOff(offList(), toolForView(id));
let toolsSig = null;
function buildRail() {
  toolsSig = offList().join();
  const rows = v => `<button class="rrow" data-view="${v.id}">${ic(v.icon)}<span class="rl">${v.rail || v.title}</span>${BADGED.includes(v.id) ? `<span class="badge" data-badge="${v.id}" hidden></span>` : ''}</button>`;
  // An area the store does not have (or the owner just switched off) is not on the rail at all.
  const caps = client.session.current?.caps || [], outside = v => v?.area && v.area !== 'floor' && v.area !== 'store' && !caps.includes(v.area);
  $('#railscroll').innerHTML = RAIL.filter(sec => !sec.rows.length || sec.rows.some(r => typeof r !== 'string' || !outside(VIEWS[r]))).map(sec => `<div class="rsec">${sec.sec}</div>` + sec.rows.map(r => typeof r === 'string' ? (offView(r) || outside(VIEWS[r]) ? '' : rows(VIEWS[r])) : `<button class="rrow soon" disabled title="Arrives with the ${sec.sec} port">${ic(r[2])}<span class="rl">${r[1]}</span><span class="badge soon">Soon</span></button>`).join('')).join('');
}
// Rail badges (the showcase's): Backfill review carries today's locations
// waiting for review; Cages, in red, the open cages not seen for a week.
// Each reads its area's projection, which is empty until the device holds
// that area's code, so a badge stays hidden without it.
const BADGED = ['bfreview', 'cages'];
function paintBadges() {
  if (!store) return;
  const day = today(), bf = store.get('backfill'), cages = store.get('cages') || {};
  const n = { bfreview: Object.values(bf?.subs || {}).filter(x => x.date === day && x.status === 'pending').length, cages: Object.values(cages).filter(c => c.status === 'open' && Date.now() - Date.parse(c.seen) > 7 * 86400e3).length };
  for (const el of $$('[data-badge]')) { const v = n[el.dataset.badge] || 0; el.hidden = !v; el.textContent = v > 99 ? '99+' : String(v); el.classList.toggle('red', el.dataset.badge === 'cages'); el.title = el.dataset.badge === 'cages' ? `${v} cage${v === 1 ? '' : 's'} not seen this week` : `${v} location${v === 1 ? '' : 's'} to review today`; }
}
function setWs(w) {
  ws = w; try { if (store) localStorage.setItem('last_workspace', w); } catch {} $('#app').className = 'app ws-' + w + (prefs().railmin ? ' railmin' : '');
  const md = $('.mdepts'); if (md) { const l = w === 'floor' ? 'Departments' : 'Switch area'; md.title = l; md.setAttribute('aria-label', l); }
  $('#mstrip').innerHTML = STRIP[w].filter(m => !offView(m[0])).map(m => `<button data-view="${m[0]}">${ic(m[1])}${m[2]}</button>`).join('');
  // A person's first time in an area on this device: its walkthrough (not
  // for the owner, who is looking in rather than working there).
  const cur = client.session.current;
  if (store && !admin && !cur?.owner && !cur?.actas && w !== 'admin') setTimeout(() => { if (ws === w && store) firstRun(w); }, 700);
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
  const prev = current;
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
  if (store && offList().join() !== toolsSig) { buildRail(); paintBadges(); setWs(ws); }
  if (store && offView(view.id)) { toast(`${toolForView(view.id).name} is switched off for this store`); if (current && current !== view.id && !offView(current)) return; view = VIEWS[mobile ? HOME[view.area] || 'map' : 'dashboard']; }
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
  team?.repaint();
  markRail();
  // A sheet closes when the view changes; a repaint of the same view (a
  // store update) leaves it open, so the launcher survives sign-in.
  if (prev !== view.id) $('#msheet')?.classList.remove('open');
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
  sh.innerHTML = `<div class="sheet"><h3>Where are you working?</h3><p class="mv-sheet-sub">Pick your area to begin. Stockroom and Back dock take their crew code once on this device.</p><div class="mv-tiles">${WORKSPACES.map(w => { const on = caps.includes(w[0]); return `<button class="mv-tile${ws === w[0] ? ' hot' : ''}" data-ws="${w[0]}" ${on ? '' : 'disabled style="opacity:.5"'}><span class="ti">${ic(w[2])}</span><span class="tx"><b>${w[1]}</b><span>${on ? w[3] : caps.includes(w[0]) ? w[3] : 'Not on for this store'}</span></span><span>${hasArea(client.session, w[0]) || w[0] === 'floor' ? '' : ic('lock')}</span>${ic('chev')}</button>`; }).join('')}</div><button class="mv-ghost" data-act="close-more">Close</button></div>`;
  sh.classList.add('open');
}
// The phone's Departments picker (the showcase's): the whole floor, or one
// department, grouped Home, Clothing, Kids, Other with its shelf count; a
// department fades the rest of the map and zooms to it.
function openDepts() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  const counts = mapStats()?.depts || {};
  const tile = d => `<button class="md-tile" data-pickdept="${esc(d)}"><i style="background:${DEPT_COLOUR[d] || '#64748B'}"></i><b>${esc(d.toUpperCase())}</b><span>${esc(DEPT_NAME[d] || '')}</span><small>${counts[d] || 0} shelves</small></button>`;
  sh.innerHTML = `<div class="sheet md-sheet"><h3>Departments</h3><button class="md-all" data-pickdept="all">${ic('map')}<span><b>All departments</b><small>Whole floor, every colour</small></span></button>` +
    DEPT_GROUPS.map(g => { const ds = g[2].filter(d => counts[d]); return ds.length ? `<div class="md-grp">${esc(g[0])}</div><div class="md-tiles">${ds.map(tile).join('')}</div>` : ''; }).join('') +
    `<button class="mv-ghost" data-act="close-more">Close</button></div>`;
  sh.classList.add('open');
}
function openMore() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  sh.innerHTML = `<div class="sheet"><h3>More</h3><div class="mv-tiles">${MORE[ws].filter(m => !offView(m[0])).map(m => `<button class="mv-tile" data-view="${m[0]}"><span class="ti">${ic(m[1])}</span><span class="tx"><b>${m[2]}</b></span><span></span>${ic('chev')}</button>`).join('')}<button class="mv-tile" data-shell-act="switch-area"><span class="ti">${ic('grid')}</span><span class="tx"><b>Switch area</b></span><span></span>${ic('chev')}</button><button class="mv-tile" data-shell-act="signout"><span class="ti">${ic('lock')}</span><span class="tx"><b>${client.session.current?.actas ? 'Back to the console' : 'Sign out'}</b></span><span></span>${ic('chev')}</button></div><button class="mv-ghost" data-act="close-more">Close</button></div>`;
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
  const v = e.target.closest('[data-view]'); if (v && !v.disabled) { if (v.closest('#omni')) return; show(v.getAttribute('data-view'), v.dataset.no ? { no: v.dataset.no, ...(v.dataset.tab ? { tab: v.dataset.tab } : {}) } : undefined); return; }
  const w = e.target.closest('[data-ws]'); if (w && !w.disabled) { $('#msheet')?.classList.remove('open'); const target = w.dataset.ws; if (target === ws) return; if (target === 'floor') { setWs('floor'); show('mhome'); } else show(HOME[target] || 'mhome'); return; }
  if (e.target.closest('.mdepts')) { if (store) (ws === 'floor' ? openDepts : openLauncher)(); return; }
  const dp = e.target.closest('[data-pickdept]'); if (dp) { $('#msheet')?.classList.remove('open'); const d = dp.dataset.pickdept; $('.mdepts')?.classList.toggle('on', d !== 'all'); show('map', { dept: d }); return; }
  // The store chip opens the device and store page (Settings); store details are still to come.
  if (e.target.closest('.storechip')) { if (store) show('storeinfo'); return; }
  const g = e.target.closest('[data-go]'); if (g) { if (g.getAttribute('data-go') === 'search') search.open(); else { const ga = {}; if (g.dataset.bay) ga.bay = g.dataset.bay; if (g.dataset.select) ga.select = g.dataset.select; if (g.dataset.dept) ga.dept = g.dataset.dept; show(g.getAttribute('data-go'), Object.keys(ga).length ? ga : undefined); } return; }
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
const search = initSearch({ client, frame, go: (id, arg) => show(id, arg), life: kc => store ? productLife(store.get(), kc) : null, data: () => store ? store.get() : null, tools: () => RAIL.flatMap(sec => sec.rows.filter(r => typeof r === 'string' && !offView(r)).map(r => VIEWS[r])).concat([VIEWS.dashboard, VIEWS.planner, VIEWS.settings]) });
$('#msearch input')?.addEventListener('focus', e => { if (!admin && store) { e.target.blur(); search.open(e.target.value); } });

// Voice search on the phone (ShelfSearcher's, decision 28): the microphone in
// the search bar and in the palette. A spoken shelf, run or bay on the map
// opens it on the map, as ShelfSearcher did; anything else (a keycode, a
// department, a mishearing) opens the palette with what was heard.
let listening = null;
const showVoice = () => { const on = voiceSupported() && isMobile(); for (const b of $$('[data-voice]')) b.hidden = !on; };
showVoice(); window.addEventListener('resize', showVoice);
document.addEventListener('click', e => {
  const btn = e.target.closest?.('[data-voice]'); if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  if (listening) { listening.stop(); haptic('tap'); return; }
  if (!store || admin) return toast('Voice search works once a store is signed in');
  const input = btn.parentElement.querySelector('input'), was = input?.placeholder || '';
  const fromBar = !!btn.closest('#msearch');
  btn.classList.add('listening'); btn.setAttribute('aria-label', 'Stop listening'); if (input) { input.placeholder = 'Listening… say a shelf, like A16 S2'; if (fromBar) input.value = ''; }
  haptic('select');
  listening = listenOnce({
    onHeard: t => { if (input) input.value = t; },
    onGuesses: guesses => {
      const r = resolveSpoken(guesses, c => shelfForLocation(c));
      if (r.code) {
        const { shelf, sub } = splitCanon(r.code);
        haptic('success'); search.close(); show('map', { select: r.code });
        toast(`Heard “${r.heard}” · ${shelf}${sub ? ' ' + sub : ''}${r.how === 'corrected' ? ' (matched to the map)' : ''}`);
      } else { haptic('error'); search.open(r.query || r.heard); }
    },
    onError: msg => toast(msg, 'bad'),
    onEnd: () => { listening = null; btn.classList.remove('listening'); btn.setAttribute('aria-label', 'Search by voice'); if (input) { input.placeholder = was; if (fromBar) input.value = ''; } },
  });
}, true);
let lastMobile = isMobile();
window.addEventListener('resize', () => { const m = isMobile(); if (m !== lastMobile) { lastMobile = m; if (current) show(current, currentArg); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#msheet')?.classList.remove('open'); });
