// Settings and utilities: General (this device, updates, sign out),
// Appearance (skin, accent, rail and bars as tokens) and Store (the store's
// own settings, as store.settings.set events a manager sends, and the refresh
// focus for the coming weeks). Device preferences persist under suite_prefs.

import { openTour } from '../tour.js';
import { haptic, applyOrientation, isPhone } from '../device.js';
import { $, ic, esc, vh, sub, toast, ago, weekId, DEPTS_DEFAULT, DEPT_NAME, DEPT_COLOUR } from '../ui.js';
import { settingsOf, AUTO_LOCK_CHOICES, SETTINGS_DEFAULTS } from '../../shared/reducers/store.js';
import { ACCENTS, SCALES, prefs, setPref } from '../prefs.js';
import { VERSION } from '../version.js';
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

export default {
  id: 'settings', title: 'Settings and utilities', rail: 'Settings', icon: 'm-settings',
  desktop(ctx) {
    if (['store', 'depts', 'refresh', 'feedback'].includes(sec) && !ctx.store) sec = 'general';
    const NAV = [['general', 'General', 'settings'], ['appearance', 'Appearance', 'star'], ['storage', 'Storage', 'box'], ...(ctx.store ? [['_', 'SETUP'], ['store', 'Store', 'home'], ['depts', 'Departments', 'tag'], ['refresh', 'Location refresh', 'm-refresh']] : []), ['_', 'SUPPORT'], ...(ctx.store ? [['feedback', 'Feedback and report', 'alert']] : []), ['howto', 'How to use', 'file'], ['about', 'About', 'file']];
    const nav = `<div class="stg-nav">${NAV.map(n => n[0] === '_' ? `<div class="stg-grp">${n[1]}</div>` : `<button class="stg-row${n[0] === sec ? ' on' : ''}" data-act="sec" data-sec="${n[0]}">${ic(n[2])}${n[1]}</button>`).join('')}<div class="stg-ver">Conduit ${VERSION} · ${ctx.store ? 'store ' + esc(ctx.storeNo) : 'owner'} · signed in on this device</div></div>`;
    return vh('Settings and utilities', ctx.store ? sub(`Store ${esc(ctx.storeNo)}`, esc(ctx.storeName), VERSION) : sub('Owner console', VERSION), '', 'm-settings') + `<div class="stg">${nav}<div class="stg-body">${body(ctx)}</div></div>`;
  },
  mobile(ctx) { return `<div class="mv-head"><div><h2>Settings</h2><span>${ctx.store ? esc(ctx.storeNo) + ' ' + esc(ctx.storeName) : 'Owner console'} · ${VERSION}</span></div></div><div class="stg-body">${body(ctx, 'general')}${body(ctx, 'appearance')}${ctx.store ? storeBody(ctx) + refreshBody(ctx) + feedbackBody(ctx) : ''}<div id="stgStorage"></div>${howtoBody()}</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      if (act === 'sec') { sec = a.getAttribute('data-sec'); ctx.rerender(); }
      else if (act === 'scan-sound') setPref('scanSound', prefs().scanSound === false), ctx.rerender();
      else if (act === 'scan-vibrate') setPref('scanVibrate', prefs().scanVibrate === false), ctx.rerender();
      else if (act === 'haptics') { setPref('haptics', prefs().haptics === false); haptic('select'); ctx.rerender(); }
      else if (act === 'portrait') { setPref('allowLandscape', !prefs().allowLandscape); applyOrientation(); ctx.rerender(); }
      else if (act === 'skin') setPref('skin', a.getAttribute('data-skin')), ctx.rerender();
      else if (act === 'accent') setPref('accent', Number(a.getAttribute('data-acc'))), ctx.rerender();
      else if (act === 'rail') setPref('rail', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'bars') setPref('bars', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'hdr') setPref('hdr', prefs().hdr === 'title' ? 'classic' : 'title'), ctx.rerender();
      else if (act === 'scale') setPref('scale', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'railmin') setPref('railmin', !prefs().railmin), ctx.rerender();
      else if (act === 'signout') { if (confirm(ctx.store ? 'Sign out of this store on this device?' : 'Sign out of the owner console on this device?')) await ctx.signOut(); }
      else if (act === 'reload') location.reload();
      else if (act === 'force-reload') { if (confirm('Reload Conduit from the worker? You stay signed in; queued changes are kept.')) await updates.forceReload(); }
      else if (act === 'install') { if (!(await updates.install())) toast('Use the browser menu › Install app, or Share › Add to Home Screen on an iPhone'); ctx.rerender(); }
      else if (act === 'map-tips') setPref('mapTips', prefs().mapTips === false), ctx.rerender();
      else if (act === 'pc-mode') setPref('priceChecks', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'clear-pot') await clearPot(ctx, a.dataset.prefix);
      else if (act === 'clear-maps-cache') { try { await caches.delete('suite-maps-v1'); toast('Map cache cleared'); } catch {} paintStorage(ctx, root); }
      else if (act === 'copy-diag') { const t = await bundle(ctx, 'settings'); try { await navigator.clipboard.writeText(t); toast('Diagnostics copied'); } catch { prompt('Copy the diagnostics:', t); } }
      else if (act === 'send-feedback') await sendFeedback(ctx, root);
      else if (act === 'assign-micro') ctx.go('labelint', { micro: a.dataset.micro });
      else if (act === 'print-howto') printHowto();
      else if (act === 'tour') openTour();
      else if (act === 'check-update') { a.textContent = 'Checking…'; await updates.check(); ctx.rerender(); if (!updates.state.waiting) toast('You are on the current release'); }
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
    const themes = [['Light', '#F3F4F6', '#FFFFFF', '#111827', 'light'], ['Dark', '#0B1220', '#111827', '#F3F4F6', 'dark'], ['Auto', 'linear-gradient(135deg,#F3F4F6 50%,#0B1220 50%)', '#9CA3AF', '#6B7280', 'auto']];
    let accs = '', grp = '';
    ACCENTS.forEach((a, i) => { const g = a[6] === 'soft' ? 'Softer' : 'Bright'; if (g !== grp) { grp = g; accs += (accs ? '</div>' : '') + `<div class="stg-grp">${g}</div><div class="stg-accs">`; } accs += `<button class="stg-acc${p.accent === i ? ' on' : ''}" data-act="accent" data-acc="${i}"><i style="background:${a[1]}"></i><span><b>${a[0]}</b><small>${a[1]}</small></span></button>`; });
    const seg = (act, opts, cur) => `<span class="seg stg-seg">${opts.map(o => `<button class="${cur === o[0] ? 'on' : ''}" data-act="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</span>`;
    return `<div class="stg-card"><div class="stg-h">Theme</div><div class="stg-themes">${themes.map(t => `<div class="stg-theme${p.skin === t[4] ? ' on' : ''}" data-act="skin" data-skin="${t[4]}"><div class="sw3" style="background:${t[1]}"><i style="background:${t[2]}"></i><b style="background:${t[3]}"></b></div><span>${t[0]}</span></div>`).join('')}</div></div>` +
      `<div class="stg-card"><div class="stg-h">Accent</div><p class="stg-p">Only the accent tokens change: active row, primary button, links, the mark and the progress fill. State colours stay put.</p>${accs}</div></div>` +
      `<div class="stg-card"><div class="stg-h">Shell</div>${row('Rail colour', 'Light keeps the rail plain. Tinted washes it in the soft accent. Accent paints it fully.', seg('rail', [['light', 'Light'], ['tint', 'Tinted'], ['solid', 'Accent'], ['deep', 'Deep']], p.rail))}${row('Header and footer', 'Plain, tinted or strong accent bars.', seg('bars', [['plain', 'Plain'], ['tint', 'Tinted'], ['strong', 'Strong']], p.bars))}${row('Title bar', 'Move each view’s title into the header and fold search into the logo.', tgl(p.hdr === 'title', 'hdr'))}${row('Rail', 'Start with the rail collapsed to icons', tgl(p.railmin, 'railmin'))}${row('Display scale', 'How large the whole app renders on this device. Small is 80%, Compact 95%, Large 115%.', seg('scale', SCALES, String(p.scale)))}</div>`;
  }
  if (sec === 'store') return storeBody(ctx);
  if (sec === 'refresh') return refreshBody(ctx);
  if (sec === 'depts') return deptsBody(ctx);
  if (sec === 'storage') return `<div id="stgStorage"><div class="stg-card"><div class="stg-h">Storage</div><p class="stg-p">Working it out…</p></div></div>`;
  if (sec === 'feedback') return feedbackBody(ctx);
  if (sec === 'howto') return howtoBody();
  if (sec === 'about') return `<div class="stg-card"><div class="stg-h">Conduit</div>${row('Version', `${VERSION} · one shell, one worker, one event log per store`, '')}${row('Design of record', 'The Conduit Backend Design doc and the Conduit Shell Swap showcase', '')}</div>`;
  const s = ctx.store?.status, cur = ctx.session.current;
  const who = ctx.store ? row('Store', `${esc(ctx.storeNo)} ${esc(ctx.storeName)} · verified against the worker${cur?.actas ? ' · acting as the store as owner' : ''}`, '<span class="chip">Signed in</span>') : row('Owner', 'Signed in with the owner key · every action is logged in the registry', '<span class="chip">Owner</span>');
  const sync = s ? row('Sync', `${esc(s.state)} · ${s.queued} queued · seq ${s.seq}${s.lastError ? ' · ' + esc(s.lastError) : ''}`, `<span class="btn sm" data-act="resync">${ic('refresh')}Resync</span>`) : '';
  return `<div class="stg-card"><div class="stg-h">This device</div>${who}${row('Device id', esc(ctx.session.device), '')}${row('Roles', esc((cur?.roles || []).join(', ')), '<span class="stg-dim">hard-restricted by role</span>')}${sync}</div>` +
    `<div class="stg-card"><div class="stg-h">Scanner and feedback</div>${row('Beep on a read', 'The camera scanner beeps when it reads a code.', tgl(prefs().scanSound !== false, 'scan-sound'))}${row('Vibrate on a read', 'The phone buzzes when a code is read.', tgl(prefs().scanVibrate !== false, 'scan-vibrate'))}${row('Vibration feedback', 'A short buzz when a shelf is tapped, a department opens, a search finds or misses, and on errors (phones only).', tgl(prefs().haptics !== false, 'haptics'))}${isPhone() ? row('Rotation', prefs().allowLandscape ? 'Rotation allowed: the app turns with the phone.' : 'Portrait locked: the app stays upright when the phone turns (installed app).', tgl(!prefs().allowLandscape, 'portrait')) : ''}</div>` +
    `<div class="stg-card"><div class="stg-h">Updates</div>${updatesRow()}${row('Force reload', 'Clears the cached release and reloads from the worker. Signed-in state, maps and queued changes are kept.', `<span class="btn sm" data-act="force-reload">${ic('refresh')}Force reload</span>`)}${installRow()}</div>` +
    `<div class="stg-card"><div class="stg-h">Map</div>${row('Hover details', 'Show a shelf’s department, modules and status when the pointer rests on it (desktop).', tgl(prefs().mapTips !== false, 'map-tips'))}${row('Price checks', 'How price checks and order screens show on the map: normal, large (the same size at any zoom) or hidden.', segOf('pc-mode', [['small', 'Normal'], ['large', 'Large'], ['off', 'Hidden']], prefs().priceChecks || 'small'))}</div>` +
    `<div class="stg-card"><div class="stg-h">Account</div>${row('Sign out', ctx.store ? (cur?.actas ? 'Returns to the owner console. Queued changes are sent first.' : 'Forgets the store on this device. Queued changes are sent first.') : 'Forgets the owner session on this device.', `<span class="btn sm" style="color:var(--red)" data-act="signout">${cur?.actas ? 'Back to the console' : 'Sign out'}</span>`)}</div>`;
}
function updatesRow() {
  const u = updates.state;
  if (!u.supported) return row('Version', `${VERSION} · this browser cannot install the app; it runs from the network`, `<span class="btn sm" data-act="reload">${ic('refresh')}Reload</span>`);
  if (u.waiting) return row('Update ready', `Conduit ${esc(u.waiting.version)} is installed and waiting. Applying reloads the app; queued changes are kept.`, `<span class="btn sm primary" data-act="update-now">${ic('check')}Update now</span>`);
  return row('Version', `${VERSION}${u.build ? ' · build ' + esc(u.build) : ''} · ${u.offlineReady ? 'installed on this device, works offline' : u.off ? 'not installed for offline use on this page (needs https)' : 'installing for offline use…'}`, `<span class="btn sm" data-act="check-update">${ic('refresh')}Check for updates</span>`);
}

// ── Store ─────────────────────────────────────────────────────────────
const ZONES = [['Australia/Perth', 'Perth (WA)'], ['Australia/Darwin', 'Darwin (NT)'], ['Australia/Adelaide', 'Adelaide (SA)'], ['Australia/Broken_Hill', 'Broken Hill (NSW)'], ['Australia/Brisbane', 'Brisbane (QLD)'], ['Australia/Sydney', 'Sydney (NSW, ACT)'], ['Australia/Melbourne', 'Melbourne (VIC)'], ['Australia/Hobart', 'Hobart (TAS)'], ['Pacific/Auckland', 'Auckland (NZ)']];
const opts = (list, cur) => list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, String(a + i)]);
const canEdit = ctx => (ctx.session.current?.roles || []).includes('manager');
function storeBody(ctx) {
  const raw = ctx.store.get('settings'), cfg = settingsOf(raw), edit = canEdit(ctx), dis = edit ? '' : ' disabled';
  const zones = ZONES.some(z => z[0] === cfg.tz) ? ZONES : [[cfg.tz, cfg.tz], ...ZONES];
  const sel = (field, list, cur, label) => `<select class="stg-in" data-field="${field}" aria-label="${label}"${dis}>${opts(list, cur)}</select>`;
  const changed = raw?.at ? `Last changed ${esc(ago(raw.at))}${raw.by ? ' from ' + esc(raw.by) : ''}.` : 'Every value is the default.';
  const field = `<div class="stg-card"><div class="stg-h">Field Mode</div>${row('Capture shelf codes', edit ? 'Walk the floor with a phone, scan each shelf’s label and add a comment, then export the file for the map editor. Captures stay on this device.' : 'A manager code opens Field Mode.', `<span class="btn sm${edit ? '' : ' disabled'}"${edit ? ' data-go="fieldmode"' : ''}>${ic('m-map')}Open</span>`)}</div>`;
  const settings = `<div class="stg-card stg-store"><div class="stg-h">Store settings</div><p class="stg-p">${edit ? 'These apply to every device in the store.' : 'A manager code changes these.'} ${changed}</p>` +
    row('Time zone', 'The store’s day, week and cycle, and the end-of-day backfill rollover, follow this clock.', sel('tz', zones.map(z => [z[0], z[1]]), cfg.tz, 'Time zone')) +
    row('Dock grid', `Pallet bays on the back dock: rows (A, B, C…) by bays per row. Trucks created afterwards use it. Default ${SETTINGS_DEFAULTS.dockGrid.rows} × ${SETTINGS_DEFAULTS.dockGrid.cols}.`, `<span class="stg-pair">${sel('rows', range(1, 8), cfg.dockGrid.rows, 'Dock rows')}<span>×</span>${sel('cols', range(1, 12), cfg.dockGrid.cols, 'Bays per row')}</span>`) +
    row('Minutes per carton', `The dock’s standard rate for a pallet’s estimated decant time, for trucks created afterwards. Default ${SETTINGS_DEFAULTS.minsPerCarton}.`, `<input class="stg-in stg-num mono" data-field="mpc" type="number" inputmode="decimal" min="0.05" max="10" step="0.05" value="${cfg.minsPerCarton}" aria-label="Minutes per carton"${dis}>`) +
    row('Stockroom departments', 'Bay ranges to department, one a line, e.g. “7001-7040 h1”. History groups bays by these; the narrowest range wins.', `<textarea class="stg-in stg-ranges mono" data-field="ranges" rows="4" aria-label="Stockroom department ranges"${dis}>${esc(cfg.deptRanges.map(r => `${r.from}-${r.to} ${r.dept}`).join('\n'))}</textarea>`) +
    row('Idle re-lock', 'A device left idle this long drops its Stockroom, Back dock and manager codes. The Floor stays open on the store PIN.', sel('lock', AUTO_LOCK_CHOICES.map(n => [n, n ? `${n} min` : 'Never']), cfg.autoLockMins, 'Idle re-lock')) +
    (edit ? `<div class="stg-actions"><span class="btn sm primary" data-act="save-store">${ic('check')}Save store settings</span></div>` : '') + '</div>';
  return settings + field;
}
// Location refresh: the focus departments for this week and the next three,
// each named by its retail week too.
function refreshBody(ctx) {
  const focus = ctx.store.get('refresh')?.focus || {}, now = Date.now();
  const weeks = [0, 1, 2, 3].map(i => weekId(new Date(now + i * 7 * 86_400_000)));
  const depts = DEPTS_DEFAULT.filter(d => d.group !== 'other' || d.id === 'flex');
  const plan = `<div class="stg-card"><div class="stg-h">Refresh focus</div><p class="stg-p">The departments each week’s refresh counts toward. Set the coming weeks ahead; the Refresh view picks each one up on the Monday.</p>` +
    weeks.map((w, i) => { const on = focus[w] || [], rp = retailPeriod(new Date(now + i * 7 * 86_400_000)); return `<div class="stg-focus"><b>${i ? `${rp} <small>${esc(w)}</small>` : `This week <small>${rp} · ${esc(w)}</small>`}</b><span class="stg-chips">${depts.map(d => `<button type="button" class="chip${on.includes(d.id) ? ' on' : ''}" data-act="focus-wk" data-week="${esc(w)}" data-dept="${esc(d.id)}" aria-pressed="${on.includes(d.id)}" title="${esc(DEPT_NAME[d.id] || d.name)}">${esc(d.id.toUpperCase())}</button>`).join('')}</span></div>`; }).join('') + '</div>';
  return plan + `<div class="stg-card"><div class="stg-h">Target</div>${row('Shelves per week', 'The weekly X / 100 on Location refresh. Marks outside a week’s focus departments are not counted.', '<b>100</b>')}</div>`;
}
async function saveStore(ctx, root) {
  const cfg = settingsOf(ctx.store.get('settings')), v = f => $(`[data-field="${f}"]`, root)?.value;
  const lines = String(v('ranges') || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean), deptRanges = [];
  for (const l of lines) { const mm = /^(\d{1,6})\s*[-–]\s*(\d{1,6})\s+([a-z0-9]{1,12})$/i.exec(l); if (!mm || Number(mm[1]) > Number(mm[2])) return toast(`“${l}” is not a range: write it like 7001-7040 h1`, 'bad'); deptRanges.push({ from: Number(mm[1]), to: Number(mm[2]), dept: mm[3].toLowerCase() }); }
  deptRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  const next = { tz: v('tz'), dockGrid: { rows: Number(v('rows')), cols: Number(v('cols')) }, minsPerCarton: Number(v('mpc')), autoLockMins: Number(v('lock')), deptRanges };
  const payload = {};
  for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(cfg[k])) payload[k] = next[k];
  if (!Object.keys(payload).length) return toast('Nothing changed');
  if (payload.dockGrid && !confirm(`Change the dock grid to ${payload.dockGrid.rows} × ${payload.dockGrid.cols}? Trucks already on the dock keep their grid.`)) return;
  try { await ctx.store.dispatch({ type: 'store.settings.set', entity: {}, payload }); toast('Store settings saved'); }
  catch (e) { toast(e.message, 'bad'); }
}

function installRow() {
  const u = updates.state;
  if (u.installed) return row('Install app', 'Conduit is installed on this device.', '<span class="chip">Installed</span>');
  return row('Install app', 'Add Conduit to the home screen on this device. Store devices install once; it then opens full screen and works offline.', `<span class="btn sm${u.installable ? ' primary' : ''}" data-act="install">${ic('plus')}Install</span>`);
}

// ── Storage ───────────────────────────────────────────────────────────
// What this device keeps, by pot, biggest first. Queued changes are never
// cleared from here (they are changes nobody has synced yet).
async function paintStorage(ctx, root) {
  const host = root.querySelector('#stgStorage'); if (!host) return;
  const [est, pots, rel] = await Promise.all([navigator.storage?.estimate?.().catch(() => null), ctx.storage ? storagePots(ctx.storage) : [], releaseCache()]);
  const used = est?.usage || 0, quota = est?.quota || 0, pct = quota ? Math.round(used / quota * 100) : 0;
  const CLEAR = { 'kc:': 'Names are fetched again as they are needed.', 'map:': 'The store’s map downloads again on the next open.', 'simreport:': 'Pasted reports on this device are forgotten.', 'snap:': 'Other stores’ snapshots go; this store reloads.' };
  host.innerHTML = `<div class="stg-card"><div class="stg-h">Storage on this device</div><p class="stg-p">${quota ? `${fmtBytes(used)} of ${fmtBytes(quota)} used (${pct}%)` : 'The browser does not report its storage here.'}</p>${quota ? `<div class="prog"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}` +
    pots.slice().sort((a, b) => b.bytes - a.bytes).map(p => row(esc(p.name), `${p.count} item${p.count === 1 ? '' : 's'} · ${fmtBytes(p.bytes)}${p.prefix === 'outbox:' && p.count ? ' · waiting to sync, never cleared here' : ''}`, CLEAR[p.prefix] && p.count ? `<span class="btn sm" data-act="clear-pot" data-prefix="${esc(p.prefix)}" title="${esc(CLEAR[p.prefix])}">Clear</span>` : '')).join('') + `</div>` +
    `<div class="stg-card"><div class="stg-h">Release cache</div>${row('App files', rel?.release ? `${rel.files} files · ${esc(rel.release)} · ${updates.state.offlineReady ? 'complete, works offline' : 'installing'}` : 'Not installed for offline use on this page.', '')}${row('Map cache', rel?.maps ? 'Network first · kept for offline' : 'Empty', rel?.maps ? '<span class="btn sm" data-act="clear-maps-cache">Clear maps</span>' : '')}</div>`;
}
async function clearPot(ctx, prefix) {
  if (!ctx.storage || prefix === 'outbox:' || prefix === 'suite_') return;
  const rows = await ctx.storage.list(prefix), keep = prefix === 'snap:' ? `snap:${ctx.storeNo}` : null;
  if (!confirm(`Clear ${rows.length} item${rows.length === 1 ? '' : 's'} from this device?`)) return;
  for (const r of rows) if (r.key !== keep) await ctx.storage.del(r.key);
  toast('Cleared'); if (prefix === 'map:') location.reload(); else ctx.rerender();
}

// ── Departments ───────────────────────────────────────────────────────
// The assignment workshop's summary: which micro-departments have shelves
// on the map; each opens Label integrity to assign it by click or drag-paint.
function deptsBody(ctx) {
  const assign = ctx.store.get('labels')?.assign || {}, all = SUBS.flatMap(sd => (MICRO[sd[0]] || []).map(x => [sd, x]));
  const shelved = all.filter(([sd, x]) => (assign[microId(sd[0], x)] || []).length).length;
  return `<div class="stg-card"><div class="stg-h">Departments</div><p class="stg-p">Micro-departments group shelves into buying categories and drive the Label integrity checks. <b>${shelved} of ${all.length}</b> micro-departments have shelving.</p>` +
    SUBS.map(([sid, sc, sname]) => { const ms = MICRO[sid] || []; return `<div class="stg-dept"><div class="stg-dept-h"><span class="dep" style="background:${esc(DEPT_COLOUR[sid] || '#64748B')}">${esc(sc)}</span><b>${esc(sname)}</b><span class="stg-dim">${ms.filter(x => (assign[microId(sid, x)] || []).length).length}/${ms.length} with shelves</span></div>` +
      ms.map(x => { const id = microId(sid, x), n = (assign[id] || []).length; return `<div class="stg-item"><div><b>${esc(microCode(x))} ${esc(microName(x))}</b><span>${n ? `${n} shel${n === 1 ? 'f' : 'ves'}` : 'no shelves yet'}</span></div><div class="stg-ctl"><span class="btn sm" data-act="assign-micro" data-micro="${esc(id)}">${ic('pin')}Assign on map</span></div></div>`; }).join('') + '</div>'; }).join('') + `</div>`;
}

// ── Feedback and report ───────────────────────────────────────────────
function feedbackBody(ctx) {
  return `<div class="stg-card"><div class="stg-h">Feedback and report</div><p class="stg-p">Goes to the developer with the store number, the version and a diagnostics summary from this device. No names; write the D-number if it matters.</p>` +
    `<div class="stg-fb"><select class="stg-in" data-field="fbkind" aria-label="Kind of feedback"><option value="wrong">Something is wrong</option><option value="idea">An idea</option><option value="question">A question</option><option value="other">Other</option></select><textarea class="stg-in" data-field="fbtext" rows="4" maxlength="2000" placeholder="What happened, and what did you expect?" aria-label="What happened"></textarea><label class="stg-chk"><input type="checkbox" data-field="fbdiag" checked> Attach diagnostics</label><span class="btn sm primary" data-act="send-feedback">${ic('arrow')}Send</span></div>` +
    row('Diagnostic bundle', 'Device, version, sync, storage and the last 50 log lines, for pasting into a message.', `<span class="btn sm" data-act="copy-diag">${ic('file')}Copy</span>`) + `</div>`;
}
async function sendFeedback(ctx, root) {
  const v = f => root.querySelector(`[data-field="${f}"]`), text = v('fbtext')?.value.trim();
  if (!text) return toast('Say what happened first', 'bad');
  const diag = v('fbdiag')?.checked ? (await bundle(ctx, 'settings')).slice(0, 2000) : '';
  try { await ctx.store.dispatch({ type: 'feedback.send', entity: { note: ulid() }, payload: { kind: v('fbkind').value, text, view: 'settings', version: VERSION, diag } }); v('fbtext').value = ''; toast('Sent. Thank you.'); }
  catch (e) { toast(e.message, 'bad'); }
}

// ── How to use ────────────────────────────────────────────────────────
const HOWTO = [
  ['The shell', ['The rail on the left lists every view: Store, Back dock, Stockroom. Settings and the store chip sit at the foot.', 'Search (Ctrl K) finds a shelf, a bay, a keycode, a manifest or a tool.', 'The store chip opens the store’s details and the other stores on this device.']],
  ['Floor', ['Store map: tap a shelf for its card; Share gives a QR code and a link.', 'Location refresh: tap or scan shelf labels as they are refreshed. The week counts toward 100 in the focus departments.', 'Label integrity: pick a micro-department, check its labels, log the wrong ones; print the marking sheet.', 'Pick list: add shelves, then Plan route for the shortest walk, stairs included.', 'Stocktake, Maintenance and Emergency each keep their own map marks.']],
  ['Stockroom', ['On the phone: scan the bay label, scan each product, Send to review.', 'At the desk: paste the SIM report, review each bay (F for Focus), Enter marks it ready.', 'Back on the phone: My locations shows Submit once the bay is finalised on the PDT.']],
  ['Back dock', ['Land a truck, attach its manifest, start the decant.', 'Crew work pallets by D-number; hold-ups and breaks stop the clock.', 'The Dock screen and Team Board show progress on a big screen.']],
  ['On the phone', ['The strip at the bottom holds the area’s main views; More holds the rest and Switch area.', 'The grid button on the Floor picks a department.', 'Everything keeps working offline; changes send when the connection is back.']],
];
export function howtoBody() {
  return `<div class="stg-card"><div class="stg-h">How to use</div><p class="stg-p">A short walk through the shell, the map views and each workspace.</p><div class="stg-acts"><span class="btn sm primary" data-act="tour">${ic('star')}Take the tour</span><span class="btn sm" data-act="print-howto">${ic('print')}Print the one-pager</span></div>${HOWTO.map(([h, ls]) => `<div class="stg-howto"><b>${esc(h)}</b><ul>${ls.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}
function printHowto() {
  printSheet({ title: 'Conduit · how to use', subtitle: `${VERSION}`, body: HOWTO.map(([h, ls]) => section(esc(h), `<ul>${ls.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`)).join('') });
}
