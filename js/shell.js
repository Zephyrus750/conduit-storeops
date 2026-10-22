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
import { $, $$, ic, esc, fmtLong, toast, installKeyboard, setStoreTz, today, DEPT_COLOUR, DEPT_NAME, DEPT_GROUPS, scopeListeners } from './ui.js';
import { settingsOf } from '../shared/reducers/store.js';
import { retailPeriod } from '../shared/time.js';
import { installCameraButtons } from './scan.js';
import { loadMap, setMap, mapInfo, parkMap, liveIn, mapStats, shelfForLocation, splitCanon } from './map.js';
import { initSearch } from './search.js';
import { voiceSupported, listenOnce } from './voice.js';
import { resolveSpoken } from '../shared/voice.js';
import { takeDeepLink } from './share.js';
import { installLog } from './diag.js';
installLog();
import { updates, initUpdates } from './updates.js';
import { VIEWS, RAIL, STRIP, MORE, MORE_STORE, ADMIN_RAIL, HOME, WORKSPACES } from './registry.js';
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
import { installProductLinks } from './views/stockroom/common.js';
import { holdToast, refusalText, pillState, syncPanel } from './sync.js';
import { tx, txn, translateStatic, langSelect, setLang } from './i18n.js';

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
const WORKER_NOTE = new URLSearchParams(location.search).get('worker') && !workerOk(new URLSearchParams(location.search).get('worker')) ? tx('That link asked for a worker this app does not trust; it was ignored.') : '';
// The three areas by name, for toasts and the Continue card.
const AREA_NAME = { floor: tx('Floor'), stockroom: tx('Stockroom'), backdock: tx('Back dock') };
const areaName = a => AREA_NAME[a] || AREA_NAME.floor;
// Shown on the sign-in when the device talks to anything but the default.
const workerLine = () => WORKER === WORKER_DEFAULT ? '' : `<div class="si-worker">${ic('lock')}${tx('Signing in to <b>{host}</b>', { host: esc(new URL(WORKER).host) })}</div>`;

const client = createClient({ baseUrl: WORKER, app: 'conduit ' + VERSION });
let team = null;      // the team message strip (js/team.js)
let store = null, admin = null, current = null, currentArg = null, unsubs = [], ws = 'floor';
const frame = $('.frame');
translateStatic();
// The language: on the sign-in cards and in Settings › Display (a reload redraws every screen).
document.addEventListener('change', e => { if (e.target.matches?.('#siLang, [data-field="lang"]')) setLang(e.target.value); });
installKeyboard();
applyOrientation();
installCameraButtons(document);
installProductLinks(client.catalogue);
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
  if (gone.length) { const [a, b, c] = gone.map(areaName); toast(c ? tx('{a}, {b} and {c} were switched off for this store', { a, b, c }) : b ? tx('{a} and {b} were switched off for this store', { a, b }) : tx('{a} was switched off for this store', { a })); }
});
client.session.on('signin-required', () => { const wasOwner = admin || client.session.current?.owner; leave(); showSignin(wasOwner ? { owner: true, error: tx('Owner session expired. Sign in again.') } : {}); });
// A shared shelf link (?store=…&shelf=…): open the map on that shelf once
// signed in to that store. A store parked on this device is switched to; a
// device that is not signed in gets the sign-in with that store chosen.
let pendingLink = takeDeepLink();
(async () => {
  let s = await client.session.load();
  if (pendingLink && s?.store && !s.actas && s.store !== pendingLink.store) {
    try { if ((await client.session.parked()).some(p => p.store === pendingLink.store)) s = await client.session.switchTo(pendingLink.store); } catch {}
  }
  // Opening the app shows the store to continue in; a reload (or the
  // owner acting as a store) goes straight back in.
  if (s?.store) { if (s.actas || reloaded()) await enter(); else await showContinue(s); }
  else if (s?.owner) await enterAdmin(); else showSignin();
})().catch(e => {
  // Opening failed part-way (a bad saved session, a view that threw): the
  // sign-in, with the reason, rather than an empty frame with no way in.
  console.error(e); try { leave(); } catch {}
  showSignin({ error: tx('Conduit could not open ({error}). Sign in again, or reload.', { error: e.message || e }) });
});
function reloaded() { try { return performance.getEntriesByType('navigation')[0]?.type === 'reload'; } catch { return false; } }
function openPendingLink(s) {
  const l = pendingLink; pendingLink = null; if (!l) return false;
  if (l.store !== s.store) { toast(l.issue ? tx('That work order is for store {store}. Add that store from Store details to open it.', { store: l.store }) : tx('That shelf link is for store {store}. Add that store from Store details to open it.', { store: l.store })); return false; }
  if (l.issue) { if (isMobile() && deskOnly(VIEWS.maintenance)) { toast(tx('Work orders open on a store PC')); return false; } show('maintenance', { issue: l.issue }); return true; }
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
    if (s.actas) { await client.session.endActAs(); await enterAdmin(); toast(tx('Cannot open {store}: {error}', { store: s.store, error: e.message }), 'bad'); return; }
    hideCover(); showSignin({ error: e.message }); return;
  }
  admin = null; frame.classList.remove('adm'); applyPrefs(frame); capsSig = (client.session.current?.caps || []).join(',');
  // After an update, What's New once (a device on its first run gets the walkthrough instead).
  { let fresh = true; try { fresh = !JSON.parse(localStorage.getItem('walkthrough_seen') || '{}').floor; } catch {} if (!s.owner && !s.actas && !s.screen) setTimeout(() => whatsNewOnce(show, { firstRun: fresh }), 900); }   // nobody reads a pop-up on a wall screen
  team?.off(); team = mountTeam({ store, session: client.session, host: $('#teambar'), today, storeNo: s.store, isHome: () => ['dashboard', 'map', 'srhome', 'bdhome'].includes(current), desk: () => !isMobile() });
  store.on('status', paintStatus); store.on('reject', r => toast(refusalText(r), 'bad')); store.on('hold', onHold);
  // Another device sent a kind of change this app does not know: a newer
  // release is out. Look for it now, so the update bar shows.
  store.on('newer', () => { updates.check(); toast(tx('A newer Conduit is out. Tap Update now when it shows, so this device sees every change.'), 'warn', null, 'newer'); });
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
  $('#chipName').textContent = s.name || s.store; $('#chipNo').textContent = tx('Store {no}', { no: s.store });
  buildRail(); paintBadges(); setWs('floor');
  actasBar(s.actas ? s : null);
  hideCover();
  if (openPendingLink(s)) return;
  if (s.screen && hasArea(client.session, 'backdock')) { setWs('backdock'); return show('dockscreen'); }
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
    toast(tx('Map updated to version {version}', { version: m.version }));
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
  if (locking || !store || !lockMins || !cur || cur.owner || cur.screen || !(cur.roles || []).some(r => r !== 'floor')) return;   // a dock screen is never touched
  if (Date.now() - idleSince < lockMins * 60_000) return;
  locking = true;
  try {
    try { await store.flush(); } catch {}
    await client.session.lock();
    // Area changes that could not send yet wait for their code (the outbox keeps them).
    const left = store.pending.filter(e => e.area !== 'store').length;
    toast(tx("Locked after {n} min idle. The store PIN's floor session stays open.", { n: lockMins }) + (left ? ' ' + txn(left, '{n} Stockroom or Back dock change will send once the code is entered again.', '{n} Stockroom or Back dock changes will send once the code is entered again.') : ''));
    const area = VIEWS[current]?.area;
    if (area && area !== 'floor' && area !== 'admin') { setWs('floor'); show('mhome'); } else if (current) show(current, currentArg);
  } catch { /* offline: tried again on the next check */ }
  finally { locking = false; }
}
function closeStore() { team?.off(); team = null; setStoreTz(null); lockMins = 0; client.closeAll(); store = null; for (const u of unsubs) u(); unsubs = []; content.innerHTML = ''; current = null; currentArg = null; }
function leave() { closeStore(); admin = null; frame.classList.remove('adm'); applyPrefs(frame); actasBar(null); resetAdmin(); }
async function signOut() {
  try { await store?.flush(); } catch {}
  // A shared device keeps no store data past sign-out (the outbox was just
  // flushed; anything still queued stays so it is not lost).
  const no = client.session.current?.store;
  // Signed out from the Continue screen, the store was never opened: its outbox is read from the device.
  let queued = store?.pending?.length || 0; if (!store && no) try { queued = await client.storage.count(`outbox:${no}:`); } catch { queued = 1; }
  if (no && !client.session.current?.actas && !queued) try { await client.storage.del(`snap:${no}`); } catch {}
  if (client.session.current?.actas) { closeStore(); await client.session.endActAs(); await enterAdmin(); return; }
  leave(); await client.session.signOut(); showSignin();
}
function actasBar(s) {
  $('#actasBar')?.remove(); if (!s) return;
  const bar = document.createElement('div'); bar.id = 'actasBar'; bar.className = 'ad-banner actas';
  bar.innerHTML = `${ic('lock')}<div><b>${tx('Acting as {store} {name}', { store: esc(s.store), name: esc(s.name || '') })}</b><span> · ${tx('owner · every write carries your owner id')}</span></div><a data-shell-act="end-actas">${ic('arrow')}${tx('Back to the console')}</a>`;
  frame.appendChild(bar);
}

// ── owner mode ────────────────────────────────────────────────────────
async function enterAdmin() {
  closeStore(); store = null; actasBar(null);
  const api = async (path, opts = {}) => client.transport.request(path, { ...opts, token: await client.session.token() });
  admin = { api, base: client.transport.base, stores: [], refreshStores: async () => { admin.stores = (await api('/v1/admin/stores')).stores; buildAdminRail(); } };
  cover(`<div class="ld-center"><div class="ld-brand">${mark()}<span class="ld-word">Con<b>duit</b></span></div><div class="ld-store"><span>${tx('Owner')}</span><span class="num">${tx('console')}</span></div><div class="ld-text">${tx('Loading stores…')}</div><div class="ld-bar"><i></i></div></div>`, 'loading');
  try { await admin.refreshStores(); }
  catch (e) { admin = null; hideCover(); if (e.status === 401 || e.status === 403) { await client.session.signOut(); showSignin({ owner: true, error: tx('Owner session expired. Sign in again.') }); } else showSignin({ owner: true, error: e.message }); return; }
  frame.classList.add('adm'); applyPrefs(frame); setWs('admin');
  paintStatus({ state: 'owner' });
  hideCover();
  show(current && current.startsWith('admin') ? current : 'admin', currentArg);
}
function buildAdminRail() {
  const h = s => !['floor', 'stockroom', 'backdock'].some(a => s.entitlements?.[a]) ? 'leg' : s.status === 'live' ? 'ok' : s.status === 'migrating' ? 'mig' : 'leg';
  $('#radm').innerHTML = `<div class="radm-top"><span class="own">${tx('Owner')}</span><b>${tx('Admin console')}</b></div>` +
    `<div class="rsec">${tx('Stores')}</div>` + (admin.stores.map(s => `<button class="rrow ad" data-view="adminstore" data-no="${esc(s.no)}"><i class="hdot ${h(s)}"></i><span class="mono">${esc(s.no)}</span><span class="rl">${esc(s.name)}</span></button>`).join('') || `<div class="rrow soon">${tx('No stores yet')}</div>`) +
    `<div class="rsec">${tx('System')}</div>` + ADMIN_RAIL.map(r => `<button class="rrow" data-view="${r[0]}">${ic(r[1])}<span class="rl">${r[2]}</span></button>`).join('') +
    `<button class="rrow" data-view="settings">${ic('m-settings')}<span class="rl">${tx('Settings')}</span></button>` +
    `<div class="railfoot"><button class="rrow" data-shell-act="signout">${ic('lock')}<span class="rl">${tx('Sign out of owner')}</span></button></div>`;
  markRail();
}

// ── covers ────────────────────────────────────────────────────────────
// The tab names the sign-in while it shows, so a PC with several tabs open
// can tell it from a signed-in one.
const TITLE = document.title;
function hideCover() { $('#cover')?.remove(); document.title = TITLE; }
const signinTitle = (what = tx('Sign in')) => { document.title = `${TITLE} | ${what}`; };
function cover(html, cls = '') { hideCover(); const el = document.createElement('div'); el.id = 'cover'; el.className = 'signin ' + cls; el.innerHTML = html; frame.appendChild(el); return el; }
function showLoading() {
  const s = client.session.current;
  cover(`<div class="ld-center"><div class="ld-brand">${mark()}<span class="ld-word">Con<b>duit</b></span></div><div class="ld-store"><span>${esc(s?.name || '')}</span><span class="num">${esc(s?.store || '')}</span></div><div class="ld-text" id="ldText">${tx('Loading map…')}</div><div class="ld-bar"><i></i></div></div>`, 'loading');
}
async function showSignin({ error, owner } = {}) {
  if (owner) return showOwnerSignin(error);
  const mobile = isMobile();
  let stores = [];
  try { stores = (await client.transport.request('/v1/stores')).stores; } catch (e) { error = error || (WORKER ? tx('Cannot reach the worker at {url}', { url: WORKER }) : tx('No worker configured: open with ?worker=https://…')); }
  const options = stores.map(s => `<option value="${esc(s.no)}">${esc(s.no)} ${esc(s.name)}${s.region ? ' · ' + esc(s.region) : ''}</option>`).join('');
  // On a phone: team member or manager, the choice remembered on this
  // device. A PC is signed in by a manager (the store's manager code opens
  // every area) or as a dock screen: a wall or a tablet on the dock, with the
  // store PIN and the Back dock code, so it never holds a manager's rights.
  // The store PIN alone comes back on a PC only when the worker predates
  // manager sign-in.
  let as = 'team'; try { as = localStorage.getItem('signin_as') || 'team'; } catch {}
  if (mobile && as === 'screen') as = 'team'; if (!mobile && as !== 'screen') as = 'manager';
  let asManager = as === 'manager', asScreen = as === 'screen';
  const segs = mobile ? [['team', tx('Team member')], ['manager', tx('Manager')]] : [['manager', tx('Manager')], ['screen', tx('Dock screen')]];
  const form = `<form class="si-form" id="siForm"><div class="si-brand si-mbrand">${mark()}<b>Conduit</b></div><h2>${tx('Welcome back')}</h2><div class="si-sub">${mobile ? tx('Sign in to your store.') : tx('Manager sign-in.')}</div>` +
    `<div class="si-seg" role="group" aria-label="${tx('Sign in as')}">${segs.map(([k, l]) => `<button type="button" data-as="${k}" aria-pressed="${k === as}">${l}</button>`).join('')}</div>` +
    `<label for="siStore">${tx('Store')}</label><select class="si-field" id="siStore" name="store" required>${options || `<option value="">${tx('No stores registered')}</option>`}</select>` +
    `<div class="si-cred"></div>` +
    `<div class="si-err" id="siErr">${error ? esc(error) : WORKER_NOTE ? esc(WORKER_NOTE) : ''}</div>${workerLine()}<button class="si-cta" type="submit"></button>` +
    `<div class="si-foot"><span>${tx('Works offline')}</span><a class="si-owner-link" data-shell-act="owner-signin">${tx('Owner sign-in')}</a>${langSelect(`class="si-lang" id="siLang" aria-label="${tx('Language')}"`)}<span class="ver">${VERSION}</span></div></form>`;
  const el = cover(polyBackground() + siCard(form)); signinTitle();
  if (pendingLink && stores.some(x => String(x.no) === pendingLink.store)) { $('#siForm select[name="store"]', el).value = pendingLink.store; $('#siErr', el).textContent = error || (pendingLink.issue ? tx('Sign in to open the work order.') : tx('Sign in to open shelf {shelf}.', { shelf: pendingLink.shelf })); }
  const cred = () => {
    const f = $('#siForm', el);
    for (const b of f.querySelectorAll('[data-as]')) b.setAttribute('aria-pressed', String(b.dataset.as === as));
    f.classList.toggle('as-manager', asManager);
    const pinField = `<label for="siCode">${tx('Store PIN')}</label><input class="si-pin" id="siCode" name="pin" inputmode="numeric" autocomplete="off" placeholder="••••" required>`;
    $('.si-cred', f).innerHTML = asManager
      ? `<label for="siCode">${tx('Manager code')}</label><input class="si-pin si-code" id="siCode" name="mcode" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="MG-······" required>`
      : asScreen ? pinField + `<label for="siDock">${tx('Back dock code')}</label><input class="si-pin si-code" id="siDock" name="dcode" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DK-····" required>`
      : pinField;
    $('.si-cta', f).innerHTML = `${mobile ? (asManager ? tx('Enter as manager') : tx('Enter store')) : asScreen ? tx('Start the dock screen') : tx('Sign in')}${ic('arrow')}`;
    if (!mobile) $('.si-sub', f).textContent = asManager ? tx('Manager sign-in.') : asScreen ? tx('A wall or tablet on the dock: Back dock boards only, no manager rights, no idle lock.') : tx('Store PIN sign-in.');
  };
  cred();
  if (!mobile) try { $('#siCode', el).focus(); } catch {}
  $('#siForm', el).addEventListener('click', e => {
    const b = e.target.closest('[data-as]'); if (!b) return;
    as = b.dataset.as; asManager = as === 'manager'; asScreen = as === 'screen'; try { localStorage.setItem('signin_as', as); } catch {}
    $('#siErr', el).textContent = ''; cred(); try { $('.si-cred input', el).focus(); } catch {}
  });
  $('#siForm', el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target); const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
    try { await (asScreen ? client.session.signInScreen({ store: f.get('store'), pin: f.get('pin'), code: f.get('dcode') }) : client.session.signIn(asManager ? { store: f.get('store'), managerCode: f.get('mcode') } : { store: f.get('store'), pin: f.get('pin') })); await enter(); }
    catch (err) {
      // A worker from before manager sign-in answers "wrong PIN" to a code:
      // the store PIN gets the device in, and the manager code then goes in
      // at the Stockroom or Back dock gate.
      const old = asManager && err.code === 'unauthorised' && /PIN/.test(err.message || '');
      $('#siErr', el).innerHTML = old ? (mobile ? tx('Manager sign-in needs the latest worker. Sign in as Team member with the store PIN for now, then enter the manager code at Stockroom or Back dock.') : tx('Manager sign-in needs the latest worker. {link}, then enter the manager code at Stockroom or Back dock.', { link: `<a class="si-usepin" role="button" tabindex="0">${tx('Sign in with the store PIN')}</a>` })) : esc(friendly(err, asManager ? tx('Wrong manager code.') : asScreen && !/PIN/.test(err.message || '') ? tx('Wrong Back dock code.') : tx('Wrong PIN.')));
      const usePin = () => { as = 'team'; asManager = false; $('#siErr', el).textContent = ''; cred(); try { $('#siCode', el).focus(); } catch {} };
      $('.si-usepin', el)?.addEventListener('click', usePin);
      $('.si-usepin', el)?.addEventListener('keydown', k => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); usePin(); } });
      btn.disabled = false;
    }
  });
}
// The sign-in card: one panel on the low-poly ground, the three-part C
// faint in its corner. The same card on a PC and a phone.
const siCard = form => `<div class="si-panel si-centre si-card"><svg class="si-wm" viewBox="0 0 32 32" aria-hidden="true"><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" stroke="#7DD3FC"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" stroke="#22A6D6"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" stroke="#0E7CA8"/></svg>${form}</div>`;
// Opening the app on a device that is signed in: the store to continue in,
// one tap away (no PIN, no network), or sign out to use another store.
async function showContinue(s) {
  const mobile = isMobile(), name = s.name || tx('Store {no}', { no: s.store });
  let last = 'floor'; try { last = localStorage.getItem('last_workspace') || 'floor'; } catch {}
  let ready = false; try { ready = await client.storage.has(`snap:${s.store}`); } catch {}
  const area = s.screen ? tx('Dock screen') : (s.roles || []).includes('manager') ? tx('Manager') : areaName(last);
  const link = pendingLink && pendingLink.store === s.store ? (pendingLink.issue ? tx('Continue and open the work order.') : tx('Continue and open shelf {shelf}.', { shelf: esc(pendingLink.shelf) })) : '';
  const form = `<form class="si-form" id="siCont"><div class="si-brand si-mbrand">${mark()}<b>Conduit</b></div><h2>${tx('Welcome back')}</h2><div class="si-sub">${mobile ? tx('This device is signed in.') : tx('This PC is signed in.')}${link ? ' ' + link : ''}</div>` +
    `<div class="si-store"><span class="si-sav">${esc(s.store)}</span><div><b>${esc(name)}</b><small>${tx('Store {no}', { no: esc(s.store) })} · ${area}</small></div>${ready ? `<span class="si-ready">${ic('check')}${tx('Ready')}</span>` : ''}</div>` +
    `<button class="si-cta" type="submit">${tx('Continue in {name}', { name: esc(name) })}${ic('arrow')}</button><a class="si-alt" data-shell-act="signout" role="button" tabindex="0">${tx('Use a different store')}</a><div class="si-foot">${langSelect(`class="si-lang" id="siLang" aria-label="${tx('Language')}"`)}</div></form>`;
  const el = cover(polyBackground() + siCard(form)); signinTitle();
  $('#siCont', el).addEventListener('submit', e => { e.preventDefault(); e.target.querySelector('.si-cta').disabled = true; enter(); });
  if (!mobile) try { $('#siCont .si-cta', el).focus(); } catch {}   // Enter continues at a desk
}
function showOwnerSignin(error) {
  const el = cover(polyBackground() + `<div class="si-panel si-owner"><form class="si-own" id="siOwner"><div class="si-brand">${mark()}<b>Conduit</b><span class="own">${tx('Owner')}</span></div><h2>${tx('Owner sign-in')}</h2><p>${tx('For the developer. Store teams sign in on the store screen and never see this.')}</p>` +
    `<label for="ownerKey">${tx('Owner key')}</label><div class="si-pin own"><input id="ownerKey" name="ownerKey" type="password" autocomplete="current-password" placeholder="••••••••••••" required>${ic('lock')}</div>` +
    `<label>${tx('This device')}</label><div class="si-field own"><span>${esc(client.session.device || tx('this device'))}</span><small>${esc(WORKER.replace(/^https?:\/\//, ''))}</small></div>` +
    `<div class="si-err" id="siErr">${error ? esc(error) : ''}</div>${workerLine()}<button class="si-cta own" type="submit">${tx('Open the admin console')}${ic('arrow')}</button>` +
    `<div class="si-foot own"><a data-shell-act="store-signin">${tx('Store sign-in instead')}</a><span class="ver">Conduit ${VERSION}</span></div></form></div>`); signinTitle(tx('Owner sign-in'));
  $('#ownerKey', el).focus();
  $('#siOwner', el).addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
    try { await client.session.signInOwner({ ownerKey: $('#ownerKey', el).value }); await enterAdmin(); }
    catch (err) { $('#siErr', el).textContent = friendly(err, tx('Wrong owner key.')); btn.disabled = false; }
  });
}
const friendly = (err, wrong = tx('Wrong PIN.')) => err.code === 'locked_out' ? tx('Too many attempts. Try again in {n} min.', { n: Math.ceil((err.detail?.retryAfter || 60) / 60) }) : err.code === 'unauthorised' ? wrong : err.code === 'not_registered' ? tx('That store is not registered.') : err.code === 'not_configured' ? tx('The worker has no owner key set yet.') : err.message;
// The mark: a C in three parts, one tone each for the Floor, the Stockroom
// and the Back dock, on the charcoal of the shell.
const mark = () => `<svg class="vmark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#111827"/><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" fill="none" stroke="#7DD3FC" stroke-width="5.4"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" fill="none" stroke="#22A6D6" stroke-width="5.4"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" fill="none" stroke="#0E7CA8" stroke-width="5.4"/></svg>`;

// ── rail, strip, status ───────────────────────────────────────────────
// What each rail row does, shown beside it on hover (the showcase's rail
// tips; Vector's rail had the same).
const RDESC = {
  dashboard: tx('Today’s numbers across the three areas, the operations register and the dock at a glance.'),
  map: tx('The live store map: shelves, bays, departments and what sits on each shelf.'),
  picklist: tx('Items to fetch for the floor, routed as the shortest walk from the front doors.'),
  refresh: tx('Scan shelves against this week’s focus departments and track the weekly target.'),
  labelint: tx('Check every numbered micro-department once a cycle for wrong labels and tickets.'),
  emergency: tx('Exits, extinguishers, first aid, assembly point and service dates on the map.'),
  maintenance: tx('Log store issues on the map, track severity, contractors and completion.'),
  stocktake: tx('Run a count session: shelves counted, verified and the department tallies.'),
  printmap: tx('Compose a printable map: floors, an area, layers, a legend; or a booklet, one page per department.'),
  receiving: tx('The dock board: pallets landed, decanting live, progress to the clear-by goal.'),
  manifests: tx('Published DC manifests and which pallet carries any keycode.'),
  bfreview: tx('Today’s backfill board: compare scans to the report, mark locations ready.'),
  cages: tx('Every cage on the stockroom and dock levels, what it holds and when it was last seen.'),
  adjust: tx('Below-zero stock evidence for the office to adjust in the official system.'),
  daylist: tx('The posted walk for the day, split by walker, with spot-checks flagged.'),
  srhistory: tx('The permanent archive of every location marked ready and what it held.'),
  planner: tx('The week ahead: which trucks land when, their teams and pre-staged manifests.'),
  rhistory: tx('Every decanted truck: clear time, where the time went, manifest reconciliation and crew credit.'),
  profiles: tx('Units per carton by keycode, built from the manifests the store has published.'),
  settings: tx('Updates, account, appearance, storage, departments, feedback and help.'),
  admin: tx('Every registered store: health, areas live or on legacy, devices and the last event.'),
  adminstore: tx('This store’s console: overview, events, devices, access, map and migration.'),
  adminreg: tx('Register a store: number, name, region, PIN, crew codes and which areas it may use.'),
  adminactions: tx('Everything done from the owner console, newest first.'),
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
  $('#railscroll').innerHTML = RAIL.filter(sec => !sec.rows.length || sec.rows.some(r => typeof r !== 'string' || !outside(VIEWS[r]))).map(sec => `<div class="rsec">${sec.sec}</div>` + sec.rows.map(r => typeof r === 'string' ? (offView(r) || outside(VIEWS[r]) ? '' : rows(VIEWS[r])) : `<button class="rrow soon" disabled title="${tx('Arrives with the {section} port', { section: sec.sec })}">${ic(r[2])}<span class="rl">${r[1]}</span><span class="badge soon">${tx('Soon')}</span></button>`).join('')).join('');
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
  for (const el of $$('[data-badge]')) { const v = n[el.dataset.badge] || 0; el.hidden = !v; el.textContent = v > 99 ? '99+' : String(v); el.classList.toggle('red', el.dataset.badge === 'cages'); el.title = el.dataset.badge === 'cages' ? txn(v, '{n} cage not seen this week', '{n} cages not seen this week') : txn(v, '{n} location to review today', '{n} locations to review today'); }
}
function setWs(w) {
  ws = w; try { if (store) localStorage.setItem('last_workspace', w); } catch {} $('#app').className = 'app ws-' + w + (prefs().railmin ? ' railmin' : '');
  const md = $('.mdepts'); if (md) { const l = w === 'floor' ? tx('Departments') : tx('Switch area'); md.title = l; md.setAttribute('aria-label', l); }
  $('#mstrip').innerHTML = STRIP[w].filter(m => !offView(m[0])).map(m => `<button data-view="${m[0]}">${ic(m[1])}${m[2]}</button>`).join('');
  // A person's first time in an area on this device: its walkthrough (not
  // for the owner, who is looking in rather than working there).
  const cur = client.session.current;
  if (store && !admin && !cur?.owner && !cur?.actas && w !== 'admin') setTimeout(() => { if (ws === w && store) firstRun(w); }, 700);
}
// Changes that started waiting on a refusal that can clear (a code, the
// server updating): one toast; the sync pill lists them.
function onHold(list) { toast(holdToast(list), 'warn', { label: tx('See'), run: openSync }, 'hold'); }
// Sync state in two places: the desk's footer and, on the phone, a pill in
// the app bar that shows only when there is something to say (offline,
// sending, or changes waiting). Both open the list of what is on the device.
function paintStatus(s) {
  const pill = $('#msync'), p = s.state === 'owner' ? null : pillState(s);
  if (pill) { pill.hidden = !p; if (p) { pill.className = `msync ${p.tone}`; pill.innerHTML = `<span class="dot"></span>${esc(p.text)}`; pill.setAttribute('aria-label', tx('Sync: {state}. Show the changes on this device', { state: p.text })); } }
  const el = $('#footSync'); if (!el) return;
  if (s.state === 'owner') { el.innerHTML = `<span class="dot"></span>${tx('Owner console')}`; el.title = ''; el.removeAttribute('data-shell-act'); el.removeAttribute('role'); return; }
  const queued = s.queued ? ' · ' + txn(s.queued, '{n} change queued', '{n} changes queued') : '';
  const txt = s.held ? txn(s.held, '{n} change waiting', '{n} changes waiting') : s.state === 'live' ? tx('Synced to cloud') + queued : s.state === 'polling' ? tx('Synced (polling)') + queued : s.state === 'connecting' ? tx('Connecting…') : tx('Offline') + queued;
  el.innerHTML = `<span class="dot ${s.held ? 'warn' : s.state === 'live' || s.state === 'polling' ? '' : 'off'}"></span>${txt}`;
  el.title = s.lastError || ''; el.setAttribute('data-shell-act', 'sync'); el.setAttribute('role', 'button'); el.tabIndex = 0;
  if (syncOpen()) paintSync();
}
// The list of what is on this device: a sheet on the phone, a popover
// above the desk's footer. It repaints with every status change while open.
const syncOpen = () => (isMobile() ? $('#msheet.open')?.dataset.kind === 'sync' : !!$('#syncDlg') && !$('#syncDlg').hidden);
function paintSync() {
  if (!store) return;
  const body = syncPanel({ status: store.status, held: store.held, pending: store.pending }, { esc, ic });
  if (isMobile()) { const sh = $('#msheet'); if (sh) sh.innerHTML = `<div class="sheet msh sy-sheet" role="dialog" aria-label="${tx('Changes on this device')}"><div class="sheet-h"><h3>${tx('Changes on this device')}</h3>${SHEET_X}</div>${body}</div>`; }
  else { const d = $('#syncDlg'); if (d) d.innerHTML = `<div class="sheet-h"><h3>${tx('Changes on this device')}</h3><button class="sheet-x" data-sync="close" aria-label="${tx('Close')}">${ic('x')}</button></div>${body}`; }
}
function openSync() {
  if (!store) return;
  if (isMobile()) { let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); } sh.dataset.kind = 'sync'; sh.classList.add('open'); }
  else { let d = $('#syncDlg'); if (!d) { d = document.createElement('div'); d.id = 'syncDlg'; d.className = 'sy-pop'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', tx('Changes on this device')); frame.appendChild(d); } d.hidden = false; }
  paintSync();
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-sync]'); if (!b || !store) return;
  const act = b.dataset.sync;
  if (act === 'close') { $('#syncDlg').hidden = true; return; }
  if (act === 'retry') { const n = store.retry(); toast(n ? txn(n, 'Trying {n} waiting change again', 'Trying {n} waiting changes again') : tx('Sending now')); }
  if (act === 'discard') { const h = store.held.find(x => x.event.id === b.dataset.id); if (h && confirm(tx('Discard this change? It never reached the store, so it is lost from this device for good.'))) { await store.discard(h.event.id); toast(tx('Discarded')); } }
  paintSync();
});
// A view's deskOnly is true, or a test of the session: Maintenance is on a
// manager's phone and nobody else's.
function deskOnly(v) { return typeof v.deskOnly === 'function' ? !!v.deskOnly(client.session.current) : !!v.deskOnly; }
function markRail() {
  const id = current, no = currentArg?.no == null ? null : String(currentArg.no);
  for (const b of $$('.rrow[data-view]')) b.classList.toggle('on', b.getAttribute('data-view') === id && (!b.dataset.no || b.dataset.no === no));
  for (const b of $$('#mstrip button')) b.classList.toggle('on', b.getAttribute('data-view') === id || (b.getAttribute('data-view') === 'mhome' && id === 'map') || (b.getAttribute('data-view') === 'admin' && id === 'adminstore'));
}

// ── views ─────────────────────────────────────────────────────────────
// A scrolled panel is found again by its id, or by its tag and classes and
// its place among the panels that share them (Settings' .stg-body, lists).
function placeKey(el, root) {
  if (el.id) return [`#${CSS.escape(el.id)}`, 0];
  const sel = el.tagName.toLowerCase() + [...el.classList].map(c => '.' + CSS.escape(c)).join('');
  return [sel, [...root.querySelectorAll(sel)].indexOf(el)];
}
function keepPlace(root) {
  const panels = [];
  // HTML elements only: the map's SVG is never read.
  for (const el of root.getElementsByTagName('*')) if (el instanceof HTMLElement && (el.scrollTop > 0 || el.scrollLeft > 0)) panels.push([...placeKey(el, root), el.scrollTop, el.scrollLeft]);
  const a = document.activeElement, field = a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) ? a : null;
  const sel = field && (field.id ? `#${CSS.escape(field.id)}` : field.dataset.field ? `[data-field="${CSS.escape(field.dataset.field)}"]` : field.name ? `[name="${CSS.escape(field.name)}"]` : field.dataset.draft ? `[data-draft="${CSS.escape(field.dataset.draft)}"]` : null);
  let caret = null; try { caret = field ? [field.selectionStart, field.selectionEnd] : null; } catch {}
  return { top: root.scrollTop, left: root.scrollLeft, panels, field: sel ? { sel, value: field.value, caret } : null };
}
function restorePlace(root, k) {
  root.scrollTop = k.top; root.scrollLeft = k.left;
  for (const [sel, i, t, l] of k.panels) { const el = root.querySelectorAll(sel)[i]; if (el) { el.scrollTop = t; el.scrollLeft = l; } }
  // Focus comes back only to the same field still holding the same text
  // (a field the view cleared after a save is left alone).
  const f = k.field && root.querySelector(k.field.sel);
  if (f && f.value === k.field.value) { f.focus({ preventScroll: true }); try { if (k.field.caret?.[0] != null) f.setSelectionRange(...k.field.caret); } catch {} }
}
function show(id, arg) {
  if (!store && !admin) return;
  const prev = current;
  const mobile = isMobile();
  if (id === 'mhome') id = admin ? 'admin' : mobile ? (HOME[ws] || 'map') : 'dashboard';
  if (id === 'more') return openMore();
  if (id === 'launcher') return openLauncher();
  let view = VIEWS[id] || VIEWS[admin ? 'admin' : 'dashboard'];
  // A desk-only view (deskOnly) is not part of the phone: a link to one goes home.
  if (mobile && deskOnly(view)) { id = HOME[ws] || 'map'; view = VIEWS[id]; arg = undefined; }
  // Admin views need the owner session; store views need a store.
  if (view.id.startsWith('admin') && !admin) view = VIEWS.dashboard;
  if (!view.id.startsWith('admin') && view.id !== 'settings' && !store) view = VIEWS.admin;
  // A workspace view needs its crew code once per device (a manager code opens all).
  if (store && view.area && view.area !== 'floor' && !hasArea(client.session, view.area)) {
    if (!(client.session.current?.caps || []).includes(view.area)) { toast(tx('This store is not set up for the {area}', { area: view.area === 'backdock' ? tx('Back dock') : view.area === 'stockroom' ? tx('Stockroom') : view.area })); return; }
    ensureArea({ session: client.session, frame, area: view.area }).then(ok => { if (ok) show(id, arg); });
    return;
  }
  if (store && offList().join() !== toolsSig) { buildRail(); paintBadges(); setWs(ws); }
  if (store && offView(view.id)) { toast(tx('{name} is switched off for this store', { name: tx(toolForView(view.id).name) })); if (current && current !== view.id && !offView(current)) return; view = VIEWS[mobile ? HOME[view.area] || 'map' : 'dashboard']; }
  if (store && view.area && view.area !== ws && view.area !== 'admin') setWs(view.area);
  // A phone-only view (a workspace home) opens its desktop counterpart on a wide screen.
  if (!mobile && view.desktopView && VIEWS[view.desktopView]) return show(view.desktopView, arg);
  id = view.id;
  for (const u of unsubs) u(); unsubs = [];
  currentArg = arg !== undefined ? arg : (id === current ? currentArg : null);
  current = id;
  const cur = client.session.current;
  const ctx = { store, admin, arg: currentArg, session: client.session, catalogue: client.catalogue, api: (path, opts = {}) => client.session.token().then(token => client.transport.request(path, { ...opts, token })), storage: client.storage, storeNo: cur?.store, storeName: cur?.name || '', isMobile: mobile, go: show, rerender: () => show(current, currentArg), signOut, actAs };
  const useMobile = mobile && typeof view.mobile === 'function';
  // A view that fails to paint shows why and a way out, never an empty frame.
  let html; try { html = useMobile ? view.mobile(ctx) : view.desktop(ctx); }
  catch (e) { console.error(e); html = `<div class="card view-err"><h3>${ic('alert')}${tx('{view} could not open', { view: esc(view.title) })}</h3><p class="lbl">${esc(e.message || String(e))}</p><div class="acts2"><button class="btn primary" data-shell-act="reload">${ic('refresh')}${tx('Reload Conduit')}</button>${view.id !== (admin ? 'admin' : 'dashboard') ? `<button class="btn" data-go="mhome">${tx('Go home')}</button>` : ''}</div></div>`; }
  // A fresh content element each time, so a view's listeners die with it;
  // between the phone's map modes the map stays put instead (keepMap) and
  // the last view's listeners end with its signal.
  viewOff?.abort(); viewOff = new AbortController();
  // A redraw of the same screen (a live update, a clock tick) keeps where
  // the person was: the scroll of the page and of its scrolled panels, and
  // the field they were typing in (audit 19 Oct F5).
  const keep = prev === view.id ? keepPlace(content) : null;
  if (!(useMobile && keepMap(html))) {
    parkMap();
    const fresh = content.cloneNode(false); content.replaceWith(fresh); content = fresh;
    content.classList.toggle('mv', useMobile);
    content.innerHTML = html;
  }
  // The title bar (Settings › Display) lifts the view's header, its title
  // and its buttons, into the top bar. It stays the view's: the listeners
  // the view puts on its element reach it, and its lookups find it.
  const hs = $('#hdrslot'); hs.innerHTML = '';
  const lifted = !useMobile && frame.classList.contains('hdr-title') ? content.querySelector('.vh') : null;
  if (lifted) hs.appendChild(lifted);
  scopeListeners(content, viewOff.signal, lifted ? [hs] : []);
  if (!(useMobile && mountStrip(view))) content.classList.remove('sheet-open');
  try { unsubs = view.mount?.(ctx, content) || []; } catch (e) { console.error(e); toast(e.message, 'bad'); }
  if (keep) restorePlace(content, keep); else content.scrollTop = 0;
  team?.repaint();
  markRail();
  // A sheet closes when the view changes; a repaint of the same view (a
  // store update) leaves it open, so the launcher survives sign-in.
  if (prev !== view.id) $('#msheet')?.classList.remove('open');
  $('#crumb').textContent = view.title;
}
// The phone's map modes end in a strip above the tabs: what the mode is
// doing and its main action (the view paints it with setStrip). The arrow
// opens the mode's panel as a sheet over the bottom of the map; open or
// closed is kept between modes and visits.
const SHEET_KEY = 'map_sheet';
let sheetOpen = false; try { sheetOpen = localStorage.getItem(SHEET_KEY) === '1'; } catch {}
function mountStrip(view) {
  if (!content.querySelector(':scope > .mv-map') || !content.querySelector(':scope > .mv-sel')) return false;
  if (!content.querySelector(':scope > .mv-strip')) content.insertAdjacentHTML('beforeend', `<div class="mv-strip"><div class="mv-st">${ic(view.icon)}<b>${esc(view.title)}</b></div><button class="mv-tog" type="button" data-shell-act="sheet">${ic('chev')}</button></div>`);
  paintSheet(); return true;
}
function paintSheet() {
  content.classList.toggle('sheet-open', sheetOpen);
  const t = content.querySelector(':scope > .mv-strip .mv-tog'); if (t) { t.setAttribute('aria-expanded', String(sheetOpen)); t.setAttribute('aria-label', sheetOpen ? tx('Hide the details') : tx('Show the details')); }
}
// Between the phone's map modes (Home, Refresh, Labels, Route, Emergency) the
// map element stays where it is and only what is around it changes: moving
// it re-styles and re-lays out every shelf and label of the map, which cost
// a store phone a third of a second on every switch.
let viewOff = null;
function keepMap(html) {
  const old = content.querySelector(':scope > .mv-map'), stage = old?.querySelector(':scope > #mapstage');
  if (!content.classList.contains('mv') || !stage || !liveIn(stage)) return false;
  const t = document.createElement('div'); t.innerHTML = html;
  const next = t.querySelector(':scope > .mv-map');
  if (!next?.querySelector(':scope > #mapstage')) return false;
  old.className = next.className;
  for (const n of [...old.childNodes]) if (n !== stage) n.remove();
  for (const n of [...next.childNodes]) if (n.id !== 'mapstage') old.appendChild(n);
  for (const n of [...content.childNodes]) if (n !== old) n.remove();
  let before = true;
  for (const n of [...t.childNodes]) { if (n === next) { before = false; continue; } if (before) content.insertBefore(n, old); else content.appendChild(n); }
  return true;
}
async function actAs(no) {
  try { await store?.flush(); } catch {}
  await client.session.actAs(no);
  closeStore(); admin = null; frame.classList.remove('adm'); applyPrefs(frame); resetAdmin();
  await enter();
}
// Bottom sheets close from the top right, the way the team sheet does.
const SHEET_X = `<button class="sheet-x" data-act="close-more" aria-label="${tx('Close')}">${ic('x')}</button>`;
function openLauncher() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  const caps = client.session.current?.caps || [];
  sh.innerHTML = `<div class="sheet"><div class="sheet-h"><h3>${tx('Where are you working?')}</h3>${SHEET_X}</div><p class="mv-sheet-sub">${tx('Pick your area to begin.')} ${(client.session.current?.roles || []).includes('manager') ? tx('Signed in as manager: every area is open.') : tx('Stockroom and Back dock take their crew code once on this device.')}</p><div class="mv-tiles">${WORKSPACES.map(w => { const on = caps.includes(w[0]); return `<button class="mv-tile${ws === w[0] ? ' hot' : ''}" data-ws="${w[0]}" ${on ? '' : 'disabled style="opacity:.5"'}><span class="ti">${ic(w[2])}</span><span class="tx"><b>${w[1]}</b><span>${on ? w[3] : caps.includes(w[0]) ? w[3] : tx('Not on for this store')}</span></span><span>${hasArea(client.session, w[0]) || w[0] === 'floor' ? '' : ic('lock')}</span>${ic('chev')}</button>`; }).join('')}</div></div>`;
  sh.dataset.kind = ''; sh.classList.add('open');
}
// The phone's Departments picker: the whole floor; Home, Clothing and
// Kids as one row each, the area itself first (all four of its
// sub-departments) and then its sub-departments; the other departments
// as icon buttons side by side. A pick fades the rest of the map, zooms
// to it and leaves only its badges.
// Shorter labels where the full name would not fit a tile.
const PICK_LABEL = { c4: 'Cosmetics Accessories' };
const PICK_ICON = { home: 'home', clothing: 'shirt', kids: 'star', checkouts: 'dollar', flex: 'stack', stockroom: 'box', bulk: 'cube' };
function openDepts() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  const counts = mapStats()?.depts || {}, col = d => DEPT_COLOUR[d] || '#64748B';
  const tile = d => `<button class="md-tile" data-pickdept="${esc(d)}" style="--dc:${col(d)}"><i></i><b>${esc(d.toUpperCase())}</b><span>${esc(PICK_LABEL[d] || DEPT_NAME[d] || '')}</span></button>`;
  const area = (g, ds) => `<button class="md-area${g[0].length > 5 ? ' long' : ''}" data-pickdept="${esc(ds.join(','))}" aria-label="${tx('All of {group}', { group: esc(g[0]) })}">${ic(PICK_ICON[g[0].toLowerCase()] || g[1] || 'layers')}<b>${esc(g[0])}</b><span>${tx('All {n}', { n: ds.length })}</span></button>`;
  const other = d => `<button class="md-other" data-pickdept="${esc(d)}"><span class="md-oi" style="--dc:${col(d)}">${ic(PICK_ICON[d] || 'layers')}</span><b>${esc(DEPT_NAME[d] || d)}</b></button>`;
  const rows = DEPT_GROUPS.map(g => {
    const ds = g[2].filter(d => counts[d]); if (!ds.length) return '';
    const coded = ds.length <= 4 && ds.every(d => /^[a-z]\d$/.test(d));
    return coded ? `<div class="md-row">${area(g, ds)}${ds.map(tile).join('')}</div>` : `<div class="md-others">${ds.map(other).join('')}</div>`;
  }).join('');
  sh.innerHTML = `<div class="sheet md-sheet"><div class="sheet-h"><h3>${tx('Departments')}</h3>${SHEET_X}</div><button class="md-all" data-pickdept="all">${ic('map')}<span><b>${tx('All departments')}</b><small>${tx('Whole floor, every colour')}</small></span></button>${rows}</div>`;
  sh.dataset.kind = ''; sh.classList.add('open');
}
function openMore() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  const cur = client.session.current, area = WORKSPACES.find(w => w[0] === ws)?.[1] || '', items = MORE[ws].filter(m => !offView(m[0]) && !(VIEWS[m[0]] && deskOnly(VIEWS[m[0]])));
  const row = m => `<button class="mo-row" type="button" data-view="${m[0]}"><span class="ti">${ic(m[1])}</span><b>${m[2]}${m[3] ? `<small>${m[3]}</small>` : ''}</b>${ic('chev', 'chv')}</button>`;
  const group = (label, list) => list.length ? `<div class="mo-sec">${label}</div><div class="mo-list">${list.map(row).join('')}</div>` : '';
  sh.innerHTML = `<div class="sheet"><div class="sheet-h"><h3>${tx('More')}</h3>${SHEET_X}</div>` +
    (cur?.store ? `<div class="mo-who"><span class="av">${esc(cur.store)}</span><div><b>${esc(cur.name || tx('Store {no}', { no: cur.store }))}${area ? ' · ' + area : ''}</b><small>${cur.actas ? tx('Acting as the store from the console') : tx('Signed in on this phone')}</small></div></div>` : '') +
    group(tx('Tools'), items.filter(m => !MORE_STORE.includes(m[0]))) + group(tx('Store and app'), items.filter(m => MORE_STORE.includes(m[0]))) +
    `<div class="mo-foot"><button type="button" data-shell-act="switch-area">${ic('grid')}${tx('Switch area')}</button><button type="button" class="out" data-shell-act="signout">${ic('lock')}${cur?.actas ? tx('Back to the console') : tx('Sign out')}</button></div></div>`;
  sh.dataset.kind = ''; sh.classList.add('open');
}
document.addEventListener('click', e => {
  const sa = e.target.closest('[data-shell-act]');
  if (sa) {
    const act = sa.getAttribute('data-shell-act');
    if (act === 'signout' || act === 'end-actas') signOut();
    else if (act === 'sheet') { sheetOpen = !sheetOpen; try { localStorage.setItem(SHEET_KEY, sheetOpen ? '1' : '0'); } catch {} paintSheet(); haptic('tap'); }
    else if (act === 'sync') openSync();
    else if (act === 'update-now') updates.apply();
    else if (act === 'update-later') $('#updBar')?.remove();
    else if (act === 'reload') location.reload();
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
  const g = e.target.closest('[data-go]'); if (g) { if (g.getAttribute('data-go') === 'search') { if (isMobile()) msBar.show(); else search.open(); } else { const ga = {}; if (g.dataset.bay) ga.bay = g.dataset.bay; if (g.dataset.select) ga.select = g.dataset.select; if (g.dataset.dept) ga.dept = g.dataset.dept; show(g.getAttribute('data-go'), Object.keys(ga).length ? ga : undefined); } return; }
  if (e.target.closest('[data-act="close-more"]') || (e.target.id === 'msheet')) $('#msheet')?.classList.remove('open');
  if (e.target.closest('#railToggle')) { $('#app').classList.toggle('railmin'); }
  if (e.target.closest('#msearch') && !e.target.closest('[data-voice]')) { if (admin) toast(tx('Find a store from the rail for now')); else if (!e.target.closest('input')) $('#msearch input')?.focus(); }
  else if (e.target.closest('#hsearch,.bsearch')) { if (admin) toast(tx('Find a store from the rail for now')); else search.open(); }
});
// Installing and updating: the bar appears when a new release is waiting and
// applies only on "Update now" (the worker never takes over on its own).
initUpdates();
updates.on(kind => {
  if (kind === 'ready') {
    let bar = $('#updBar'); if (!bar) { bar = document.createElement('div'); bar.id = 'updBar'; bar.className = 'ad-banner actas upd'; frame.appendChild(bar); }
    bar.innerHTML = `${ic('refresh')}<div><b>${tx('Conduit {version} is ready', { version: esc(updates.state.waiting?.version || '') })}</b><span> · ${tx('installed in the background · applies when you say')}</span></div><a data-shell-act="update-now">${ic('check')}${tx('Update now')}</a><a data-shell-act="update-later">${tx('Later')}</a>`;
  }
  if (kind === 'applying') { const bar = $('#updBar'); if (bar) bar.innerHTML = `${ic('refresh')}<div><b>${tx('Updating…')}</b></div>`; }
});
// The palette: keycodes to the catalogue, shelves from the map, tools from the registry.
const search = initSearch({ client, frame, go: (id, arg) => show(id, arg), life: kc => store ? productLife(store.get(), kc) : null, data: () => store ? store.get() : null, tools: () => RAIL.flatMap(sec => sec.rows.filter(r => typeof r === 'string' && !offView(r)).map(r => VIEWS[r])).concat([VIEWS.dashboard, VIEWS.planner, VIEWS.settings]).filter(v => !(isMobile() && deskOnly(v))), phone: () => isMobile() });
// The phone's bar is typed into directly: a compact list drops under it.
const msBar = search.bar($('#msearch'), () => !admin && !!store);

// Voice search (ShelfSearcher's, decision 28): the microphone in the search
// bar and in the palette, on the phone and on a PC with a microphone (the
// store PCs have them). A spoken shelf, run or bay on the map opens it on
// the map, as ShelfSearcher did; anything else (a keycode, a department, a
// mishearing) opens the palette with what was heard.
let listening = null;
const showVoice = () => { const on = voiceSupported(); for (const b of $$('[data-voice]')) b.hidden = !on; };
showVoice();
document.addEventListener('click', e => {
  const btn = e.target.closest?.('[data-voice]'); if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  if (listening) { listening.stop(); haptic('tap'); return; }
  if (!store || admin) return toast(tx('Voice search works once a store is signed in'));
  const input = btn.parentElement.querySelector('input'), was = input?.placeholder || '';
  const fromBar = !!btn.closest('#msearch'), inBar = fromBar || !!btn.closest('#hsearch'); let again = null;   // what the phone's bar searches when nothing on the map matched
  btn.classList.add('listening'); btn.setAttribute('aria-label', tx('Stop listening')); if (input) { input.placeholder = tx('Listening… say a shelf, like A16 S2'); if (inBar) input.value = ''; }
  haptic('select');
  listening = listenOnce({
    onHeard: t => { if (input) input.value = t; },
    onGuesses: guesses => {
      const r = resolveSpoken(guesses, c => shelfForLocation(c));
      if (r.code) {
        const { shelf, sub } = splitCanon(r.code);
        haptic('success'); search.close(); show('map', { select: r.code });
        const vars = { heard: r.heard, shelf: shelf + (sub ? ' ' + sub : '') };
        toast(r.how === 'corrected' ? tx('Heard “{heard}” · {shelf} (matched to the map)', vars) : tx('Heard “{heard}” · {shelf}', vars));
      } else { haptic('error'); if (fromBar) again = r.query || r.heard; else search.open(r.query || r.heard); }
    },
    onError: msg => toast(msg, 'bad'),
    onEnd: () => { listening = null; btn.classList.remove('listening'); btn.setAttribute('aria-label', tx('Search by voice')); if (input) { input.placeholder = was; if (inBar) input.value = ''; } if (again != null) msBar.show(again); },
  });
}, true);
let lastMobile = isMobile();
window.addEventListener('resize', () => { const m = isMobile(); if (m !== lastMobile) { lastMobile = m; if (current) show(current, currentArg); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#msheet')?.classList.remove('open'); const d = $('#syncDlg'); if (d) d.hidden = true; } });
