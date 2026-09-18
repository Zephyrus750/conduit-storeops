// The one shell. Boots the client library, shows the sign-in cover until a
// session exists, then hosts views from the registry in the content region.
// Desktop, half-screen and phone are container queries on the same frame;
// the phone gets the tab strip and mobile renderers where a view has one.

import { createClient } from '../client/index.js';
import { $, $$, ic, esc, greeting, fmtLong, toast } from './ui.js';
import { loadMap } from './map.js';
import { VIEWS, RAIL, STRIP, MORE } from './registry.js';
import { prefs, applyPrefs } from './prefs.js';
import { VERSION } from './version.js';

const WORKER = new URLSearchParams(location.search).get('worker') || localStorage.getItem('suite_worker') || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8787' : '');
if (new URLSearchParams(location.search).get('worker')) try { localStorage.setItem('suite_worker', WORKER); } catch {}

const client = createClient({ baseUrl: WORKER, app: 'conduit ' + VERSION });
let store = null, current = null, unsubs = [], ws = 'floor';
const frame = $('.frame');
let content = $('#content');
const isMobile = () => frame.clientWidth <= 600;

// ── boot ──────────────────────────────────────────────────────────────
applyPrefs(frame);
$('#footDate').textContent = fmtLong();
$('#footVer').textContent = 'Conduit ' + VERSION;
client.session.on('signin-required', () => { closeStore(); showSignin(); });
(async () => {
  const s = await client.session.load();
  if (s?.store) await enter(); else showSignin();
})();

async function enter() {
  showLoading();
  const s = client.session.current;
  try {
    await loadMap(`maps/${s.store}.svg`);
    store = await client.open(s.store);
  } catch (e) { hideCover(); showSignin(e.message); return; }
  store.on('status', paintStatus); store.on('reject', r => toast(`${r.code}: ${r.message}`, 'bad'));
  paintStatus(store.status);
  $('#chipName').textContent = s.name || s.store; $('#chipNo').textContent = 'Store ' + s.store;
  buildRail(); setWs('floor');
  hideCover();
  show(isMobile() ? 'mhome' : 'dashboard');
}
function closeStore() { client.closeAll(); store = null; for (const u of unsubs) u(); unsubs = []; content.innerHTML = ''; current = null; }
async function signOut() { try { await store?.flush(); } catch {} closeStore(); await client.session.signOut(); showSignin(); }

// ── covers ────────────────────────────────────────────────────────────
function hideCover() { $('#cover')?.remove(); }
function cover(html, cls = '') { hideCover(); const el = document.createElement('div'); el.id = 'cover'; el.className = 'signin ' + cls; el.innerHTML = html; frame.appendChild(el); return el; }
function showLoading() {
  const s = client.session.current;
  cover(`<div class="ld-center"><div class="ld-brand">${mark()}<span class="ld-word">Con<b>duit</b></span></div><div class="ld-store"><span>${esc(s?.name || '')}</span><span class="num">${esc(s?.store || '')}</span></div><div class="ld-text" id="ldText">Loading map…</div><div class="ld-bar"><i></i></div></div>`, 'loading');
}
async function showSignin(error) {
  const mobile = isMobile();
  let stores = [];
  try { stores = (await client.transport.request('/v1/stores')).stores; } catch (e) { error = error || (WORKER ? `Cannot reach the worker at ${WORKER}` : 'No worker configured: open with ?worker=https://…'); }
  const options = stores.map(s => `<option value="${esc(s.no)}">${esc(s.no)} ${esc(s.name)}${s.region ? ' · ' + esc(s.region) : ''}</option>`).join('');
  const form = `<form class="si-form" id="siForm"><h2>Welcome back</h2><div class="si-sub">Choose your store. Everything keeps working offline once it is on this device.</div>` +
    `<label>Store</label><select class="si-field" name="store" required>${options || '<option value="">No stores registered</option>'}</select>` +
    `<label>Store PIN</label><input class="si-pin" name="pin" inputmode="numeric" autocomplete="off" placeholder="••••" required>` +
    `<div class="si-role">${ic('users')}<div>The store PIN opens the Floor. Stockroom and Back dock take their crew code once per device; a manager code opens everything.</div></div>` +
    `<div class="si-err" id="siErr">${error ? esc(error) : ''}</div><button class="si-cta" type="submit">Enter store${ic('arrow')}</button>` +
    `<div class="si-foot"><span>${ic('check')}Offline ready</span><span>${stores.length} store${stores.length === 1 ? '' : 's'}</span><span class="ver">Conduit ${VERSION}</span></div></form>`;
  const hero = `<div class="si-hero"><div class="si-brand">${mark()}<b>Conduit</b></div><div class="si-greet">${greeting()}</div><h1>Run the <span>whole store</span>.</h1><p>Live maps, back-dock receiving and stockroom backfill. One team, one sign-in, on and off the wifi.</p><div class="si-off">${ic('check')}Works offline once it is on this device</div></div>`;
  const el = cover(mobile ? `<div class="si-panel si-centre">${form}</div>` : `<div class="si-panel si-duo">${hero}${form}</div>`);
  $('#siForm', el).addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target); const btn = e.target.querySelector('.si-cta'); btn.disabled = true;
    try { await client.session.signIn({ store: f.get('store'), pin: f.get('pin') }); await enter(); }
    catch (err) { $('#siErr', el).textContent = err.code === 'locked_out' ? `Too many attempts. Try again in ${Math.ceil((err.detail?.retryAfter || 60) / 60)} min.` : err.code === 'unauthorised' ? 'Wrong PIN.' : err.code === 'not_registered' ? 'That store is not registered.' : err.message; btn.disabled = false; }
  });
}
const mark = () => `<svg class="vmark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><path d="M22 10.2a8 8 0 1 0 0 11.6" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/><circle cx="16.5" cy="16" r="2.8" fill="#fff"/></svg>`;

// ── rail, strip, status ───────────────────────────────────────────────
function buildRail() {
  const rows = v => `<button class="rrow" data-view="${v.id}">${ic(v.icon)}${v.title}</button>`;
  $('#railscroll').innerHTML = RAIL.map(sec => `<div class="rsec">${sec.sec}</div>` + sec.rows.map(r => typeof r === 'string' ? rows(VIEWS[r]) : `<button class="rrow soon" disabled title="Arrives with the ${sec.sec} port">${ic(r[2])}${r[1]}<span class="badge soon">Soon</span></button>`).join('')).join('');
}
function setWs(w) {
  ws = w; $('#app').className = 'app ws-' + w + (prefs().railmin ? ' railmin' : '');
  $('#mstrip').innerHTML = STRIP[w].map(m => `<button data-view="${m[0]}">${ic(m[1])}${m[2]}</button>`).join('');
}
function paintStatus(s) {
  const el = $('#footSync'); if (!el) return;
  const txt = s.state === 'live' ? 'Synced to cloud' : s.state === 'polling' ? 'Synced (polling)' : s.state === 'connecting' ? 'Connecting…' : `Offline${s.queued ? ` · ${s.queued} change${s.queued === 1 ? '' : 's'} queued` : ''}`;
  el.innerHTML = `<span class="dot ${s.state === 'live' || s.state === 'polling' ? '' : 'off'}"></span>${txt}`;
  el.title = s.lastError || '';
}

// ── views ─────────────────────────────────────────────────────────────
function show(id) {
  if (!store) return;
  const mobile = isMobile();
  if (id === 'mhome') id = mobile ? 'map' : 'dashboard';
  if (id === 'more') return openMore();
  const view = VIEWS[id] || VIEWS.dashboard; id = view.id;
  for (const u of unsubs) u(); unsubs = [];
  current = id;
  // A fresh content element each time, so a view's listeners die with it.
  const fresh = content.cloneNode(false); content.replaceWith(fresh); content = fresh;
  const ctx = { store, session: client.session, storeNo: client.session.current.store, storeName: client.session.current.name || '', isMobile: mobile, go: show, rerender: () => show(current), signOut };
  const useMobile = mobile && typeof view.mobile === 'function';
  content.classList.toggle('mv', useMobile);
  content.innerHTML = useMobile ? view.mobile(ctx) : view.desktop(ctx);
  const hs = $('#hdrslot'); hs.innerHTML = ''; if (!useMobile && frame.classList.contains('hdr-title')) { const vh0 = content.querySelector('.vh'); if (vh0) hs.appendChild(vh0); }
  try { unsubs = view.mount?.(ctx, content) || []; } catch (e) { console.error(e); toast(e.message, 'bad'); }
  content.scrollTop = 0;
  for (const b of $$('.rrow[data-view]')) b.classList.toggle('on', b.getAttribute('data-view') === id);
  for (const b of $$('#mstrip button')) b.classList.toggle('on', b.getAttribute('data-view') === id || (b.getAttribute('data-view') === 'mhome' && id === 'map'));
  $('#msheet')?.classList.remove('open');
  $('#crumb').textContent = view.title;
}
function openMore() {
  let sh = $('#msheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'msheet'; sh.className = 'm-launcher m-more'; $('#app').appendChild(sh); }
  sh.innerHTML = `<div class="sheet"><h3>More</h3><div class="mv-tiles">${MORE[ws].map(m => `<button class="mv-tile" data-view="${m[0]}"><span class="ti">${ic(m[1])}</span><span class="tx"><b>${m[2]}</b></span><span></span>${ic('chev')}</button>`).join('')}</div><button class="mv-ghost" data-act="close-more">Close</button></div>`;
  sh.classList.add('open');
}
document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]'); if (v && !v.disabled) { show(v.getAttribute('data-view')); return; }
  const g = e.target.closest('[data-go]'); if (g) { show(g.getAttribute('data-go')); return; }
  if (e.target.closest('[data-act="close-more"]') || (e.target.id === 'msheet')) $('#msheet')?.classList.remove('open');
  if (e.target.closest('#railToggle')) { $('#app').classList.toggle('railmin'); }
  if (e.target.closest('#hsearch,.bsearch')) toast('Search arrives with the catalogue route');
});
let lastMobile = isMobile();
window.addEventListener('resize', () => { const m = isMobile(); if (m !== lastMobile) { lastMobile = m; if (current) show(current); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#msheet')?.classList.remove('open'); });
