// Settings and utilities: General (this device, updates, sign out),
// Display (size and the rail; the colour scheme is fixed store-wide) and Store (the store's
// own settings, as store.settings.set events a manager sends, and the refresh
// focus for the coming weeks). Device preferences persist under suite_prefs.

import { openTour } from '../tour.js';
import { haptic, applyOrientation, isPhone } from '../device.js';
import { $, ic, esc, vh, sub, toast, ago, weekId, DEPTS_DEFAULT, DEPT_NAME, DEPT_COLOUR } from '../ui.js';
import { settingsOf, AUTO_LOCK_CHOICES, SETTINGS_DEFAULTS } from '../../shared/reducers/store.js';
import { SCALES, prefs, setPref } from '../prefs.js';
import { VERSION } from '../version.js';
import { tx, txn, langSelect } from '../i18n.js';
import { updates } from '../updates.js';
import { retailPeriod } from '../../shared/time.js';
import { bundle, storagePots, releaseCache, fmtBytes } from '../diag.js';
import { SUBS, MICRO, microId, microCode, microName } from '../data/micros.js';
import { printSheet, section } from '../print.js';
import { ulid } from '../../shared/ulid.js';

let sec = 'general';
const currentSec = () => sec;
const row = (t, d, ctl) => `<div class="stg-item"><div><b>${t}</b><span>${d}</span></div><div class="stg-ctl">${ctl}</div></div>`;
const tgl = (on, act) => `<span class="tgl${on ? ' on' : ''}" data-act="${act}"></span>`;
const segOf = (act, opts, cur) => `<span class="seg stg-seg">${opts.map(o => `<button class="${cur === o[0] ? 'on' : ''}" data-act="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</span>`;
// The sync state and the session's roles as people read them (the ids stay as they are).
const SYNC_STATE = { offline: tx('offline'), connecting: tx('connecting'), live: tx('connection::live'), polling: tx('polling') };
const ROLE = { floor: tx('floor'), stockroom: tx('stockroom'), dock: tx('dock'), manager: tx('manager'), owner: tx('owner') };

export default {
  id: 'settings', title: tx('Settings and utilities'), rail: tx('Settings'), icon: 'm-settings',
  desktop(ctx) {
    if (['store', 'depts', 'refresh', 'feedback'].includes(sec) && !ctx.store) sec = 'general';
    const NAV = [['general', tx('General'), 'settings'], ['appearance', tx('Display'), 'star'], ['storage', tx('Storage'), 'box'], ...(ctx.store ? [['_', tx('SETUP')], ['store', tx('Store'), 'home'], ['depts', tx('Departments'), 'tag'], ['refresh', tx('Location refresh'), 'm-refresh']] : []), ['_', tx('SUPPORT')], ...(ctx.store ? [['feedback', tx('Feedback and report'), 'alert']] : []), ['howto', tx('How to use'), 'file'], ['about', tx('About'), 'file']];
    const nav = `<div class="stg-nav">${NAV.map(n => n[0] === '_' ? `<div class="stg-grp">${n[1]}</div>` : `<button class="stg-row${n[0] === sec ? ' on' : ''}" data-act="sec" data-sec="${n[0]}">${ic(n[2])}${n[1]}</button>`).join('')}<div class="stg-ver">${ctx.store ? tx('Conduit {v} · store {no} · signed in on this device', { v: VERSION, no: esc(ctx.storeNo) }) : tx('Conduit {v} · owner · signed in on this device', { v: VERSION })}</div></div>`;
    return vh(tx('Settings and utilities'), ctx.store ? sub(tx('Store {no}', { no: esc(ctx.storeNo) }), esc(ctx.storeName), VERSION) : sub(tx('Owner console'), VERSION), '', 'm-settings') + `<div class="stg">${nav}<div class="stg-body">${body(ctx)}</div></div>`;
  },
  // The phone keeps what a person on the floor changes on their own device.
  // Store settings, the refresh focus and target, and the price-check size
  // are set on a store PC. A manager sees Field Mode first, under Manager.
  // Help and feedback sit together at the foot.
  mobile(ctx) { return `<div class="mv-head"><div><h2>${tx('Settings')}</h2><span>${ctx.store ? esc(ctx.storeNo) + ' ' + esc(ctx.storeName) : tx('Owner console')} · ${VERSION}</span></div></div><div class="stg-body">${ctx.store && canEdit(ctx) ? `<div class="stg-grp-h">${tx('Manager')}</div>${fieldCard(ctx)}<div class="stg-grp-h">${tx('This phone')}</div>` : ''}${body(ctx, 'general')}${body(ctx, 'appearance')}<div id="stgStorage"></div><div class="stg-grp-h">${tx('Help and feedback')}</div>${ctx.store ? feedbackBody(ctx) : ''}${howtoBody(true)}</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      if (act === 'sec') { sec = a.getAttribute('data-sec'); ctx.rerender(); }
      else if (act === 'scan-sound') setPref('scanSound', prefs().scanSound === false), ctx.rerender();
      else if (act === 'scan-vibrate') setPref('scanVibrate', prefs().scanVibrate === false), ctx.rerender();
      else if (act === 'haptics') { setPref('haptics', prefs().haptics === false); haptic('select'); ctx.rerender(); }
      else if (act === 'portrait') { setPref('allowLandscape', !prefs().allowLandscape); applyOrientation(); ctx.rerender(); }
      else if (act === 'scale') setPref('scale', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'railmin') setPref('railmin', !prefs().railmin), ctx.rerender();
      else if (act === 'hdr') setPref('hdr', prefs().hdr === 'title' ? 'classic' : 'title'), ctx.rerender();
      else if (act === 'signout') { if (confirm(ctx.store ? tx('Sign out of this store on this device?') : tx('Sign out of the owner console on this device?'))) await ctx.signOut(); }
      else if (act === 'reload') location.reload();
      else if (act === 'force-reload') { if (confirm(tx('Reload Conduit from the worker? You stay signed in; queued changes are kept.'))) await updates.forceReload(); }
      else if (act === 'install') { if (!(await updates.install())) toast(tx('Use the browser menu › Install app, or Share › Add to Home Screen on an iPhone')); ctx.rerender(); }
      else if (act === 'map-tips') setPref('mapTips', prefs().mapTips === false), ctx.rerender();
      else if (act === 'pc-mode') setPref('priceChecks', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'clear-pot') await clearPot(ctx, a.dataset.prefix);
      else if (act === 'clear-maps-cache') { try { await caches.delete('suite-maps-v1'); toast(tx('Map cache cleared')); } catch {} paintStorage(ctx, root); }
      else if (act === 'copy-diag') { const t = await bundle(ctx, 'settings'); try { await navigator.clipboard.writeText(t); toast(tx('Diagnostics copied')); } catch { prompt(tx('Copy the diagnostics:'), t); } }
      else if (act === 'send-feedback') await sendFeedback(ctx, root);
      else if (act === 'assign-micro') ctx.go('labelint', { micro: a.dataset.micro });
      else if (act === 'print-howto') printHowto();
      else if (act === 'tour') openTour();
      else if (act === 'check-update') { a.textContent = tx('Checking…'); await updates.check(); ctx.rerender(); if (!updates.state.waiting) toast(tx('You are on the current release')); }
      else if (act === 'update-now') updates.apply();
      else if (act === 'resync') ctx.store?.resync();
      else if (act === 'save-store') await saveStore(ctx, root);
      else if (act === 'focus-wk') {
        const week = a.getAttribute('data-week'), d = a.getAttribute('data-dept'), cur = ctx.store.get('refresh')?.focus?.[week] || [];
        const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d];
        await ctx.store.dispatch({ type: 'refresh.focus.set', entity: { week }, payload: { departments: next } }).catch(err => toast(err.message, 'bad'));
      }
    });
    paintStorage(ctx, root);
    return ctx.store ? [ctx.store.on('settings', () => ctx.rerender()), ctx.store.on('refresh', () => ctx.rerender()), ctx.store.on('labels', () => { if (sec === 'depts') ctx.rerender(); })] : [];
  },
};
function body(ctx, sec = currentSec()) {
  const p = prefs();
  if (sec === 'appearance') {
    const seg = (act, opts, cur) => `<span class="seg stg-seg">${opts.map(o => `<button class="${cur === o[0] ? 'on' : ''}" data-act="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</span>`;
    return `<div class="stg-card"><div class="stg-h">${tx('Display')}</div><p class="stg-p">${tx('Every store device shares one colour scheme. Size, the title bar and the rail are set on each device.')}</p>${row(tx('Language'), tx('Every screen on this device, in one of seven languages. Shelf, product and department names stay as the store writes them.'), langSelect(`class="stg-in" data-field="lang" aria-label="${tx('Language')}"`))}${row(tx('Display size'), tx('How large the whole app renders on this device. Small is 80%, Compact 95%, Large 115%.'), seg('scale', SCALES.map(([v, l]) => [v, tx(l)]), String(p.scale)))}${ctx.isMobile ? '' : row(tx('Title bar'), tx('Move each view’s title into the header and fold search into the logo.'), tgl(p.hdr === 'title', 'hdr')) + row(tx('Rail'), tx('Start with the rail collapsed to icons'), tgl(p.railmin, 'railmin'))}</div>`;
  }
  if (sec === 'store') return storeBody(ctx);
  if (sec === 'refresh') return refreshBody(ctx);
  if (sec === 'depts') return deptsBody(ctx);
  if (sec === 'storage') return `<div id="stgStorage"><div class="stg-card"><div class="stg-h">${tx('Storage')}</div><p class="stg-p">${tx('Working it out…')}</p></div></div>`;
  if (sec === 'feedback') return feedbackBody(ctx);
  if (sec === 'howto') return howtoBody();
  if (sec === 'about') return `<div class="stg-card"><div class="stg-h">Conduit</div>${row(tx('Version'), tx('{v} · one shell, one worker, one event log per store', { v: VERSION }), '')}${row(tx('Design of record'), tx('The Conduit Backend Design doc and the Conduit Shell Swap showcase'), '')}</div>`;
  const s = ctx.store?.status, cur = ctx.session.current;
  const who = ctx.store ? row(tx('Store'), cur?.actas ? tx('{no} {name} · verified against the worker · acting as the store as owner', { no: esc(ctx.storeNo), name: esc(ctx.storeName) }) : tx('{no} {name} · verified against the worker', { no: esc(ctx.storeNo), name: esc(ctx.storeName) }), `<span class="chip">${tx('Signed in')}</span>`) : row(tx('Owner'), tx('Signed in with the owner key · every action is logged in the registry'), `<span class="chip">${tx('Owner')}</span>`);
  const sync = s ? row(tx('Sync'), tx('{state} · {n} queued · seq {seq}', { state: esc(SYNC_STATE[s.state] || s.state), n: s.queued, seq: s.seq }) + (s.lastError ? ' · ' + esc(s.lastError) : ''), `<span class="btn sm" data-act="resync">${ic('refresh')}${tx('Resync')}</span>`) : '';
  return `<div class="stg-card"><div class="stg-h">${tx('This device')}</div>${who}${row(tx('Device id'), esc(ctx.session.device), '')}${row(tx('Roles'), esc((cur?.roles || []).map(r => ROLE[r] || r).join(', ')), `<span class="stg-dim">${tx('hard-restricted by role')}</span>`)}${sync}</div>` +
    `<div class="stg-card"><div class="stg-h">${tx('Scanner and vibration')}</div>${row(tx('Beep on a read'), tx('The camera scanner beeps when it reads a code.'), tgl(prefs().scanSound !== false, 'scan-sound'))}${row(tx('Vibrate on a read'), tx('The phone buzzes when a code is read.'), tgl(prefs().scanVibrate !== false, 'scan-vibrate'))}${row(tx('Vibration feedback'), tx('A short buzz when a shelf is tapped, a department opens, a search finds or misses, and on errors (phones only).'), tgl(prefs().haptics !== false, 'haptics'))}${isPhone() ? row(tx('Rotation'), prefs().allowLandscape ? tx('Rotation allowed: the app turns with the phone.') : tx('Portrait locked: the app stays upright when the phone turns (installed app).'), tgl(!prefs().allowLandscape, 'portrait')) : ''}</div>` +
    `<div class="stg-card"><div class="stg-h">${tx('Updates')}</div>${updatesRow()}${row(tx('Force reload'), tx('Clears the cached release and reloads from the worker. Signed-in state, maps and queued changes are kept.'), `<span class="btn sm" data-act="force-reload">${ic('refresh')}${tx('Force reload')}</span>`)}${installRow()}</div>` +
    (ctx.isMobile ? '' : `<div class="stg-card"><div class="stg-h">${tx('Map')}</div>${row(tx('Hover details'), tx('Show a shelf’s department, run and status when the pointer rests on it.'), tgl(prefs().mapTips !== false, 'map-tips'))}${row(tx('Price checks'), tx('How price checks and order screens show on the map: normal, large (the same size at any zoom) or hidden.'), segOf('pc-mode', [['small', tx('Normal')], ['large', tx('Large')], ['off', tx('Hidden')]], prefs().priceChecks || 'small'))}</div>`) +
    `<div class="stg-card"><div class="stg-h">${tx('Account')}</div>${row(tx('Sign out'), ctx.store ? (cur?.actas ? tx('Returns to the owner console. Queued changes are sent first.') : tx('Forgets the store on this device. Queued changes are sent first.')) : tx('Forgets the owner session on this device.'), `<span class="btn sm" style="color:var(--red)" data-act="signout">${cur?.actas ? tx('Back to the console') : tx('Sign out')}</span>`)}</div>`;
}
function updatesRow() {
  const u = updates.state;
  if (!u.supported) return row(tx('Version'), tx('{v} · this browser cannot install the app; it runs from the network', { v: VERSION }), `<span class="btn sm" data-act="reload">${ic('refresh')}${tx('Reload')}</span>`);
  if (u.waiting) return row(tx('Update ready'), tx('Conduit {v} is installed and waiting. Applying reloads the app; queued changes are kept.', { v: esc(u.waiting.version) }), `<span class="btn sm primary" data-act="update-now">${ic('check')}${tx('Update now')}</span>`);
  return row(tx('Version'), `${VERSION}${u.build ? ' · ' + tx('build {build}', { build: esc(u.build) }) : ''} · ${u.offlineReady ? tx('installed on this device, works offline') : u.off ? tx('not installed for offline use on this page (needs https)') : tx('installing for offline use…')}`, `<span class="btn sm" data-act="check-update">${ic('refresh')}${tx('Check for updates')}</span>`);
}

// ── Store ─────────────────────────────────────────────────────────────
// Time zones are named by their cities, which stay as written.
const ZONES = [['Australia/Perth', 'Perth (WA)'], ['Australia/Darwin', 'Darwin (NT)'], ['Australia/Adelaide', 'Adelaide (SA)'], ['Australia/Broken_Hill', 'Broken Hill (NSW)'], ['Australia/Brisbane', 'Brisbane (QLD)'], ['Australia/Sydney', 'Sydney (NSW, ACT)'], ['Australia/Melbourne', 'Melbourne (VIC)'], ['Australia/Hobart', 'Hobart (TAS)'], ['Pacific/Auckland', 'Auckland (NZ)']];
const opts = (list, cur) => list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, String(a + i)]);
const canEdit = ctx => (ctx.session.current?.roles || []).includes('manager');
function storeBody(ctx) {
  const raw = ctx.store.get('settings'), cfg = settingsOf(raw), edit = canEdit(ctx), dis = edit ? '' : ' disabled';
  const zones = ZONES.some(z => z[0] === cfg.tz) ? ZONES : [[cfg.tz, cfg.tz], ...ZONES];
  const sel = (field, list, cur, label) => `<select class="stg-in" data-field="${field}" aria-label="${label}"${dis}>${opts(list, cur)}</select>`;
  const changed = raw?.at ? (raw.by ? tx('Last changed {ago} from {by}.', { ago: esc(ago(raw.at)), by: esc(raw.by) }) : tx('Last changed {ago}.', { ago: esc(ago(raw.at)) })) : tx('Every value is the default.');
  const settings = `<div class="stg-card stg-store"><div class="stg-h">${tx('Store settings')}</div><p class="stg-p">${edit ? tx('These apply to every device in the store.') : tx('A manager code changes these.')} ${changed}</p>` +
    row(tx('Time zone'), tx('The store’s day, week and cycle, and the end-of-day backfill rollover, follow this clock.'), sel('tz', zones.map(z => [z[0], z[1]]), cfg.tz, tx('Time zone'))) +
    row(tx('Dock grid'), tx('Pallet bays on the back dock: rows (A, B, C…) by bays per row. Trucks created afterwards use it. Default {rows} × {cols}.', { rows: SETTINGS_DEFAULTS.dockGrid.rows, cols: SETTINGS_DEFAULTS.dockGrid.cols }), `<span class="stg-pair">${sel('rows', range(1, 8), cfg.dockGrid.rows, tx('Dock rows'))}<span>×</span>${sel('cols', range(1, 12), cfg.dockGrid.cols, tx('Bays per row'))}</span>`) +
    row(tx('Minutes per carton'), tx('The dock’s standard rate for a pallet’s estimated decant time, for trucks created afterwards. Default {n}.', { n: SETTINGS_DEFAULTS.minsPerCarton }), `<input class="stg-in stg-num mono" data-field="mpc" type="number" inputmode="decimal" min="0.05" max="10" step="0.05" value="${cfg.minsPerCarton}" aria-label="${tx('Minutes per carton')}"${dis}>`) +
    (ctx.isMobile ? '' : row(tx('Stockroom departments'), cfg.deptRanges.length ? tx('Which stockroom bays belong to each department ({n} set). Backfill review, History and Adjustments group by them. Set with the Stockroom or manager code.', { n: cfg.deptRanges.length }) : tx('Which stockroom bays belong to each department. Backfill review, History and Adjustments group by them. Set with the Stockroom or manager code.'), (ctx.session.current?.caps || []).includes('stockroom') ? `<span class="btn sm" data-go="srdepts">${ic('tag')}${cfg.deptRanges.length ? tx('Edit departments') : tx('Set departments')}</span>` : `<span class="cs-dim">${tx('The Stockroom is not on for this store')}</span>`)) +
    row(tx('Idle re-lock'), tx('A device left idle this long drops its Stockroom, Back dock and manager codes. A phone keeps the Floor open; a PC asks for the manager code again.'), sel('lock', AUTO_LOCK_CHOICES.map(n => [n, n ? tx('{n} min', { n }) : tx('Never')]), cfg.autoLockMins, tx('Idle re-lock'))) +
    (edit ? `<div class="stg-actions"><span class="btn sm primary" data-act="save-store">${ic('check')}${tx('Save store settings')}</span></div>` : '') + '</div>';
  return settings + fieldCard(ctx);
}
function fieldCard(ctx) {
  const edit = canEdit(ctx);
  return `<div class="stg-card"><div class="stg-h">${tx('Field Mode')}</div>${row(tx('Capture shelf codes'), edit ? tx('Walk the floor with a phone and scan each shelf’s label: a match marks it checked, a different label becomes a rename, a comment becomes a note. Send passes them to the owner’s queue; until then they wait on this device.') : tx('A manager code opens Field Mode.'), `<span class="btn sm${edit ? '' : ' disabled'}"${edit ? ' data-go="fieldmode"' : ''}>${ic('m-map')}${tx('Open')}</span>`)}</div>`;
}
// Location refresh: the focus departments for this week and the next three,
// each named by its retail week too.
function refreshBody(ctx) {
  const focus = ctx.store.get('refresh')?.focus || {}, now = Date.now();
  const weeks = [0, 1, 2, 3].map(i => weekId(new Date(now + i * 7 * 86_400_000)));
  const depts = DEPTS_DEFAULT.filter(d => d.group !== 'other' || d.id === 'flex');
  const plan = `<div class="stg-card"><div class="stg-h">${tx('Refresh focus')}</div><p class="stg-p">${tx('The departments each week’s refresh counts toward. Set the coming weeks ahead; the Refresh view picks each one up on the Monday.')}</p>` +
    weeks.map((w, i) => { const on = focus[w] || [], rp = retailPeriod(new Date(now + i * 7 * 86_400_000)); return `<div class="stg-focus"><b>${i ? `${rp} <small>${esc(w)}</small>` : tx('This week <small>{rp} · {w}</small>', { rp, w: esc(w) })}</b><span class="stg-chips">${depts.map(d => `<button type="button" class="chip${on.includes(d.id) ? ' on' : ''}" data-act="focus-wk" data-week="${esc(w)}" data-dept="${esc(d.id)}" aria-pressed="${on.includes(d.id)}" title="${esc(DEPT_NAME[d.id] || d.name)}">${esc(d.id.toUpperCase())}</button>`).join('')}</span></div>`; }).join('') + '</div>';
  return plan + `<div class="stg-card"><div class="stg-h">${tx('Target')}</div>${row(tx('Shelves per week'), tx('The weekly X / 100 on Location refresh. Marks outside a week’s focus departments are not counted.'), '<b>100</b>')}</div>`;
}
async function saveStore(ctx, root) {
  const cfg = settingsOf(ctx.store.get('settings')), v = f => $(`[data-field="${f}"]`, root)?.value;
  const next = { tz: v('tz'), dockGrid: { rows: Number(v('rows')), cols: Number(v('cols')) }, minsPerCarton: Number(v('mpc')), autoLockMins: Number(v('lock')) };
  const payload = {};
  for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(cfg[k])) payload[k] = next[k];
  if (!Object.keys(payload).length) return toast(tx('Nothing changed'));
  if (payload.dockGrid && !confirm(tx('Change the dock grid to {rows} × {cols}? Trucks already on the dock keep their grid.', { rows: payload.dockGrid.rows, cols: payload.dockGrid.cols }))) return;
  try { await ctx.store.dispatch({ type: 'store.settings.set', entity: {}, payload }); toast(tx('Store settings saved')); }
  catch (e) { toast(e.message, 'bad'); }
}

function installRow() {
  const u = updates.state;
  if (u.installed) return row(tx('Install app'), tx('Conduit is installed on this device.'), `<span class="chip">${tx('Installed')}</span>`);
  return row(tx('Install app'), tx('Add Conduit to the home screen on this device. Store devices install once; it then opens full screen and works offline.'), `<span class="btn sm${u.installable ? ' primary' : ''}" data-act="install">${ic('plus')}${tx('Install')}</span>`);
}

// ── Storage ───────────────────────────────────────────────────────────
// What this device keeps, by pot, biggest first. Queued changes are never
// cleared from here (they are changes nobody has synced yet).
async function paintStorage(ctx, root) {
  const host = root.querySelector('#stgStorage'); if (!host) return;
  const [est, pots, rel] = await Promise.all([navigator.storage?.estimate?.().catch(() => null), ctx.storage ? storagePots(ctx.storage) : [], releaseCache()]);
  const used = est?.usage || 0, quota = est?.quota || 0, pct = quota ? Math.round(used / quota * 100) : 0;
  const CLEAR = { 'kc:': tx('Names are fetched again as they are needed.'), 'map:': tx('The store’s map downloads again on the next open.'), 'simreport:': tx('Pasted reports on this device are forgotten.'), 'snap:': tx('Other stores’ snapshots go; this store reloads.') };
  host.innerHTML = `<div class="stg-card"><div class="stg-h">${tx('Storage on this device')}</div><p class="stg-p">${quota ? tx('{used} of {quota} used ({pct}%)', { used: fmtBytes(used), quota: fmtBytes(quota), pct }) : tx('The browser does not report its storage here.')}</p>${quota ? `<div class="prog"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}` +
    pots.slice().sort((a, b) => b.bytes - a.bytes).map(p => row(esc(tx(p.name)), `${txn(p.count, 'stored::{n} item', 'stored::{n} items')} · ${fmtBytes(p.bytes)}${p.prefix === 'outbox:' && p.count ? ' · ' + tx('waiting to sync, never cleared here') : ''}`, CLEAR[p.prefix] && p.count ? `<span class="btn sm" data-act="clear-pot" data-prefix="${esc(p.prefix)}" title="${esc(CLEAR[p.prefix])}">${tx('Clear')}</span>` : '')).join('') + `</div>` +
    `<div class="stg-card"><div class="stg-h">${tx('Release cache')}</div>${row(tx('App files'), rel?.release ? tx('{n} files · {release} · {state}', { n: rel.files, release: esc(rel.release), state: updates.state.offlineReady ? tx('complete, works offline') : tx('installing') }) : tx('Not installed for offline use on this page.'), '')}${row(tx('Map cache'), rel?.maps ? tx('Network first · kept for offline') : tx('Empty'), rel?.maps ? `<span class="btn sm" data-act="clear-maps-cache">${tx('Clear maps')}</span>` : '')}</div>`;
}
async function clearPot(ctx, prefix) {
  if (!ctx.storage || prefix === 'outbox:' || prefix === 'suite_') return;
  const rows = await ctx.storage.list(prefix), keep = prefix === 'snap:' ? `snap:${ctx.storeNo}` : null;
  if (!confirm(txn(rows.length, 'Clear {n} item from this device?', 'Clear {n} items from this device?'))) return;
  for (const r of rows) if (r.key !== keep) await ctx.storage.del(r.key);
  toast(tx('Cleared')); if (prefix === 'map:') location.reload(); else ctx.rerender();
}

// ── Departments ───────────────────────────────────────────────────────
// The assignment workshop's summary: which micro-departments have shelves
// on the map; each opens Label integrity to assign it by click or drag-paint.
function deptsBody(ctx) {
  const assign = ctx.store.get('labels')?.assign || {}, all = SUBS.flatMap(sd => (MICRO[sd[0]] || []).map(x => [sd, x]));
  const shelved = all.filter(([sd, x]) => (assign[microId(sd[0], x)] || []).length).length;
  return `<div class="stg-card"><div class="stg-h">${tx('Departments')}</div><p class="stg-p">${tx('Micro-departments group shelves into buying categories and drive the Label integrity checks. <b>{n} of {total}</b> micro-departments have shelving.', { n: shelved, total: all.length })}</p>` +
    SUBS.map(([sid, sc, sname]) => { const ms = MICRO[sid] || []; return `<div class="stg-dept"><div class="stg-dept-h"><span class="dep" style="background:${esc(DEPT_COLOUR[sid] || '#64748B')}">${esc(sc)}</span><b>${esc(sname)}</b><span class="stg-dim">${tx('{n}/{total} with shelves', { n: ms.filter(x => (assign[microId(sid, x)] || []).length).length, total: ms.length })}</span></div>` +
      ms.map(x => { const id = microId(sid, x), n = (assign[id] || []).length; return `<div class="stg-item"><div><b>${esc(microCode(x))} ${esc(microName(x))}</b><span>${n ? txn(n, '{n} shelf', '{n} shelves') : tx('no shelves yet')}</span></div><div class="stg-ctl"><span class="btn sm" data-act="assign-micro" data-micro="${esc(id)}">${ic('pin')}${tx('Assign on map')}</span></div></div>`; }).join('') + '</div>'; }).join('') + `</div>`;
}

// ── Feedback and report ───────────────────────────────────────────────
function feedbackBody(ctx) {
  return `<div class="stg-card"><div class="stg-h">${tx('Feedback and report')}</div><p class="stg-p">${tx('Goes to the developer with the store number, the version and a diagnostics summary from this device. No names; write the D-number if it matters.')}</p>` +
    `<div class="stg-fb"><select class="stg-in" data-field="fbkind" aria-label="${tx('Kind of feedback')}"><option value="wrong">${tx('Something is wrong')}</option><option value="idea">${tx('An idea')}</option><option value="question">${tx('A question')}</option><option value="other">${tx('Other')}</option></select><textarea class="stg-in" data-field="fbtext" rows="4" maxlength="2000" placeholder="${tx('What happened, and what did you expect?')}" aria-label="${tx('What happened')}"></textarea><label class="stg-chk"><input type="checkbox" data-field="fbdiag" checked> ${tx('Attach diagnostics')}</label><span class="btn sm primary" data-act="send-feedback">${ic('arrow')}${tx('Send')}</span></div>` +
    row(tx('Diagnostic bundle'), tx('Device, version, sync, storage and the last 50 log lines, for pasting into a message.'), `<span class="btn sm" data-act="copy-diag">${ic('file')}${tx('Copy')}</span>`) + `</div>`;
}
async function sendFeedback(ctx, root) {
  const v = f => root.querySelector(`[data-field="${f}"]`), text = v('fbtext')?.value.trim();
  if (!text) return toast(tx('Say what happened first'), 'bad');
  const diag = v('fbdiag')?.checked ? (await bundle(ctx, 'settings')).slice(0, 2000) : '';
  try { await ctx.store.dispatch({ type: 'feedback.send', entity: { note: ulid() }, payload: { kind: v('fbkind').value, text, view: 'settings', version: VERSION, diag } }); v('fbtext').value = ''; toast(tx('Sent. Thank you.')); }
  catch (e) { toast(e.message, 'bad'); }
}

// ── How to use ────────────────────────────────────────────────────────
const HOWTO = [
  [tx('The shell'), [tx('The rail on the left lists every view: Store, Back dock, Stockroom. Settings and the store chip sit at the foot.'), tx('Search (Ctrl K) finds a shelf, a bay, a keycode, a manifest or a tool.'), tx('The store chip opens the store’s details and the other stores on this device.')]],
  [tx('Floor'), [tx('Store map: tap a shelf for its card; Share gives a QR code and a link.'), tx('Location refresh: tap or scan shelf labels as they are refreshed. The week counts toward 100 in the focus departments.'), tx('Label integrity: pick a micro-department, check its labels, log the wrong ones; print the marking sheet.'), tx('Pick list: add shelves, then Plan route for the shortest walk, stairs included.'), tx('Stocktake, Maintenance and Emergency each keep their own map marks.')]],
  [tx('Stockroom'), [tx('On the phone: scan the bay label, scan each product, Send to review.'), tx('At the desk: paste the SIM report, review each bay (F for Focus), Enter marks it ready.'), tx('Back on the phone: My locations shows Submit once the bay is finalised on the PDT.')]],
  [tx('Back dock'), [tx('Land a truck, attach its manifest, start the decant.'), tx('Crew work pallets by D-number; hold-ups and breaks stop the clock.'), tx('The Dock screen and Team Board show progress on a big screen.')]],
  [tx('On the phone'), [tx('The strip at the bottom holds the area’s main views; More holds the rest and Switch area.'), tx('The grid button on the Floor picks a department.'), tx('Everything keeps working offline; changes send when the connection is back.')]],
];
// The phone's guide: the same workspaces, only what a phone does.
const HOWTO_PHONE = [
  [tx('Getting around'), [tx('The strip at the bottom holds the area’s main views; More holds the rest and Switch area.'), tx('Search finds a shelf, a bay, a keycode or a consolidation. The barcode button scans a label straight in; the microphone takes a spoken shelf.'), tx('The store chip opens the store’s details and the other stores on this device.'), tx('Everything keeps working offline; changes send when the connection is back.')]],
  [tx('Floor'), [tx('Store map: tap a shelf for its card; Share gives a QR code and a link.'), tx('Location refresh: tap or scan shelf labels as they are refreshed. The week counts toward 100 in the focus departments.'), tx('Label integrity: tap a shelf to open its micro-department and check its labels.'), tx('Pick list: add shelves, or say them, and follow the route.'), tx('Report an issue from More, with a photo.')]],
  [tx('Stockroom'), [tx('Scan the bay label, scan each product, then Send to review.'), tx('My locations shows Submit once the bay is reviewed and finalised on the PDT.'), tx('Cages, Adjust, the day list and Quick Scan are in the strip and More.')]],
  [tx('Back dock'), [tx('Land a truck, land each pallet on its square, start the decant.'), tx('Crew work pallets by D-number; hold-ups and breaks stop the clock.'), tx('Team & plan sets the crew, roles, breaks and the decant plan.')]],
];
export function howtoBody(phone = false) {
  const HOWTO_ = phone ? HOWTO_PHONE : HOWTO;
  return `<div class="stg-card"><div class="stg-h">${tx('How to use')}</div><p class="stg-p">${phone ? tx('A short walk through the app and each workspace.') : tx('A short walk through the shell, the map views and each workspace.')}</p><div class="stg-acts"><span class="btn sm primary" data-act="tour">${ic('star')}${tx('Take the tour')}</span><span class="btn sm" data-act="print-howto">${ic('print')}${tx('Print the one-pager')}</span></div>${HOWTO_.map(([h, ls]) => `<div class="stg-howto"><b>${esc(h)}</b><ul>${ls.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}
function printHowto() {
  printSheet({ title: tx('Conduit · how to use'), subtitle: `${VERSION}`, body: HOWTO.map(([h, ls]) => section(esc(h), `<ul>${ls.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`)).join('') });
}
