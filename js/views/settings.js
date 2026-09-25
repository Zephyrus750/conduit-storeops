// Settings and utilities: General (this device, updates, sign out),
// Appearance (skin, accent, rail and bars as tokens) and Store (the store's
// own settings, as store.settings.set events a manager sends, and the refresh
// focus for the coming weeks). Device preferences persist under suite_prefs.

import { $, ic, esc, vh, sub, toast, ago, weekId, DEPTS_DEFAULT, DEPT_NAME } from '../ui.js';
import { settingsOf, AUTO_LOCK_CHOICES, SETTINGS_DEFAULTS } from '../../shared/reducers/store.js';
import { ACCENTS, SCALES, prefs, setPref } from '../prefs.js';
import { VERSION } from '../version.js';
import { updates } from '../updates.js';

let sec = 'general';
const currentSec = () => sec;
const row = (t, d, ctl) => `<div class="stg-item"><div><b>${t}</b><span>${d}</span></div><div class="stg-ctl">${ctl}</div></div>`;
const tgl = (on, act) => `<span class="tgl${on ? ' on' : ''}" data-act="${act}"></span>`;

export default {
  id: 'settings', title: 'Settings and utilities', rail: 'Settings', icon: 'm-settings',
  desktop(ctx) {
    if (sec === 'store' && !ctx.store) sec = 'general';
    const NAV = [['general', 'General', 'settings'], ['appearance', 'Appearance', 'star'], ...(ctx.store ? [['store', 'Store', 'home']] : []), ['_', 'SUPPORT'], ['about', 'About', 'file']];
    const nav = `<div class="stg-nav">${NAV.map(n => n[0] === '_' ? `<div class="stg-grp">${n[1]}</div>` : `<button class="stg-row${n[0] === sec ? ' on' : ''}" data-act="sec" data-sec="${n[0]}">${ic(n[2])}${n[1]}</button>`).join('')}<div class="stg-ver">Conduit ${VERSION} · ${ctx.store ? 'store ' + esc(ctx.storeNo) : 'owner'} · signed in on this device</div></div>`;
    return vh('Settings and utilities', ctx.store ? sub(`Store ${esc(ctx.storeNo)}`, esc(ctx.storeName), VERSION) : sub('Owner console', VERSION), '', 'm-settings') + `<div class="stg">${nav}<div class="stg-body">${body(ctx)}</div></div>`;
  },
  mobile(ctx) { return `<div class="mv-head"><div><h2>Settings</h2><span>${ctx.store ? esc(ctx.storeNo) + ' ' + esc(ctx.storeName) : 'Owner console'} · ${VERSION}</span></div></div><div class="stg-body">${body(ctx, 'general')}${ctx.store ? storeBody(ctx) : ''}</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      if (act === 'sec') { sec = a.getAttribute('data-sec'); ctx.rerender(); }
      else if (act === 'scan-sound') setPref('scanSound', prefs().scanSound === false), ctx.rerender();
      else if (act === 'scan-vibrate') setPref('scanVibrate', prefs().scanVibrate === false), ctx.rerender();
      else if (act === 'skin') setPref('skin', a.getAttribute('data-skin')), ctx.rerender();
      else if (act === 'accent') setPref('accent', Number(a.getAttribute('data-acc'))), ctx.rerender();
      else if (act === 'rail') setPref('rail', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'bars') setPref('bars', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'hdr') setPref('hdr', prefs().hdr === 'title' ? 'classic' : 'title'), ctx.rerender();
      else if (act === 'scale') setPref('scale', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'railmin') setPref('railmin', !prefs().railmin), ctx.rerender();
      else if (act === 'signout') { if (confirm(ctx.store ? 'Sign out of this store on this device?' : 'Sign out of the owner console on this device?')) await ctx.signOut(); }
      else if (act === 'reload') location.reload();
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
    return ctx.store ? [ctx.store.on('settings', () => ctx.rerender()), ctx.store.on('refresh', () => ctx.rerender())] : [];
  },
};
function body(ctx, sec = currentSec()) {
  const p = prefs();
  if (sec === 'appearance') {
    const themes = [['Light', '#F3F4F6', '#FFFFFF', '#111827', 'light'], ['Dark', '#0B1220', '#111827', '#F3F4F6', 'dark']];
    let accs = '', grp = '';
    ACCENTS.forEach((a, i) => { const g = a[6] === 'soft' ? 'Softer' : 'Bright'; if (g !== grp) { grp = g; accs += (accs ? '</div>' : '') + `<div class="stg-grp">${g}</div><div class="stg-accs">`; } accs += `<button class="stg-acc${p.accent === i ? ' on' : ''}" data-act="accent" data-acc="${i}"><i style="background:${a[1]}"></i><span><b>${a[0]}</b><small>${a[1]}</small></span></button>`; });
    const seg = (act, opts, cur) => `<span class="seg stg-seg">${opts.map(o => `<button class="${cur === o[0] ? 'on' : ''}" data-act="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</span>`;
    return `<div class="stg-card"><div class="stg-h">Theme</div><div class="stg-themes">${themes.map(t => `<div class="stg-theme${p.skin === t[4] ? ' on' : ''}" data-act="skin" data-skin="${t[4]}"><div class="sw3" style="background:${t[1]}"><i style="background:${t[2]}"></i><b style="background:${t[3]}"></b></div><span>${t[0]}</span></div>`).join('')}</div></div>` +
      `<div class="stg-card"><div class="stg-h">Accent</div><p class="stg-p">Only the accent tokens change: active row, primary button, links, the mark and the progress fill. State colours stay put.</p>${accs}</div></div>` +
      `<div class="stg-card"><div class="stg-h">Shell</div>${row('Rail colour', 'Light keeps the rail plain. Tinted washes it in the soft accent. Accent paints it fully.', seg('rail', [['light', 'Light'], ['tint', 'Tinted'], ['solid', 'Accent'], ['deep', 'Deep']], p.rail))}${row('Header and footer', 'Plain, tinted or strong accent bars.', seg('bars', [['plain', 'Plain'], ['tint', 'Tinted'], ['strong', 'Strong']], p.bars))}${row('Title bar', 'Move each view’s title into the header and fold search into the logo.', tgl(p.hdr === 'title', 'hdr'))}${row('Rail', 'Start with the rail collapsed to icons', tgl(p.railmin, 'railmin'))}${row('Display scale', 'How large the whole app renders on this device. Small is 80%, Compact 95%, Large 115%.', seg('scale', SCALES, String(p.scale)))}</div>`;
  }
  if (sec === 'store') return storeBody(ctx);
  if (sec === 'about') return `<div class="stg-card"><div class="stg-h">Conduit</div>${row('Version', `${VERSION} · one shell, one worker, one event log per store`, '')}${row('Design of record', 'The Conduit Backend Design doc and the Conduit Shell Swap showcase', '')}</div>`;
  const s = ctx.store?.status, cur = ctx.session.current;
  const who = ctx.store ? row('Store', `${esc(ctx.storeNo)} ${esc(ctx.storeName)} · verified against the worker${cur?.actas ? ' · acting as the store as owner' : ''}`, '<span class="chip">Signed in</span>') : row('Owner', 'Signed in with the owner key · every action is logged in the registry', '<span class="chip">Owner</span>');
  const sync = s ? row('Sync', `${esc(s.state)} · ${s.queued} queued · seq ${s.seq}${s.lastError ? ' · ' + esc(s.lastError) : ''}`, `<span class="btn sm" data-act="resync">${ic('refresh')}Resync</span>`) : '';
  return `<div class="stg-card"><div class="stg-h">This device</div>${who}${row('Device id', esc(ctx.session.device), '')}${row('Roles', esc((cur?.roles || []).join(', ')), '<span class="stg-dim">hard-restricted by role</span>')}${sync}</div>` +
    `<div class="stg-card"><div class="stg-h">Scanner</div>${row('Beep on a read', 'The camera scanner beeps when it reads a code.', tgl(prefs().scanSound !== false, 'scan-sound'))}${row('Vibrate on a read', 'The phone buzzes when a code is read.', tgl(prefs().scanVibrate !== false, 'scan-vibrate'))}</div>` +
    `<div class="stg-card"><div class="stg-h">Updates</div>${updatesRow()}</div>` +
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
  const settings = `<div class="stg-card stg-store"><div class="stg-h">Store settings</div><p class="stg-p">${edit ? 'These apply to every device in the store.' : 'A manager code changes these.'} ${changed}</p>` +
    row('Time zone', 'The store’s day, week and cycle, and the end-of-day backfill rollover, follow this clock.', sel('tz', zones.map(z => [z[0], z[1]]), cfg.tz, 'Time zone')) +
    row('Dock grid', `Pallet bays on the back dock: rows (A, B, C…) by bays per row. Trucks created afterwards use it. Default ${SETTINGS_DEFAULTS.dockGrid.rows} × ${SETTINGS_DEFAULTS.dockGrid.cols}.`, `<span class="stg-pair">${sel('rows', range(1, 8), cfg.dockGrid.rows, 'Dock rows')}<span>×</span>${sel('cols', range(1, 12), cfg.dockGrid.cols, 'Bays per row')}</span>`) +
    row('Minutes per carton', `The dock’s standard rate for a pallet’s estimated decant time, for trucks created afterwards. Default ${SETTINGS_DEFAULTS.minsPerCarton}.`, `<input class="stg-in stg-num mono" data-field="mpc" type="number" inputmode="decimal" min="0.05" max="10" step="0.05" value="${cfg.minsPerCarton}" aria-label="Minutes per carton"${dis}>`) +
    row('Idle re-lock', 'A device left idle this long drops its Stockroom, Back dock and manager codes. The Floor stays open on the store PIN.', sel('lock', AUTO_LOCK_CHOICES.map(n => [n, n ? `${n} min` : 'Never']), cfg.autoLockMins, 'Idle re-lock')) +
    (edit ? `<div class="stg-actions"><span class="btn sm primary" data-act="save-store">${ic('check')}Save store settings</span></div>` : '') + '</div>';
  const focus = ctx.store.get('refresh')?.focus || {}, now = Date.now();
  const weeks = [0, 1, 2, 3].map(i => weekId(new Date(now + i * 7 * 86_400_000)));
  const depts = DEPTS_DEFAULT.filter(d => d.group !== 'other' || d.id === 'flex');
  const plan = `<div class="stg-card"><div class="stg-h">Refresh focus</div><p class="stg-p">The departments each week’s refresh counts toward. Set the coming weeks ahead; the Refresh view picks each one up on the Monday.</p>` +
    weeks.map((w, i) => { const on = focus[w] || []; return `<div class="stg-focus"><b>${i ? esc(w) : `This week <small>${esc(w)}</small>`}</b><span class="stg-chips">${depts.map(d => `<button type="button" class="chip${on.includes(d.id) ? ' on' : ''}" data-act="focus-wk" data-week="${esc(w)}" data-dept="${esc(d.id)}" aria-pressed="${on.includes(d.id)}" title="${esc(DEPT_NAME[d.id] || d.name)}">${esc(d.id.toUpperCase())}</button>`).join('')}</span></div>`; }).join('') + '</div>';
  return settings + plan;
}
async function saveStore(ctx, root) {
  const cfg = settingsOf(ctx.store.get('settings')), v = f => $(`[data-field="${f}"]`, root)?.value;
  const next = { tz: v('tz'), dockGrid: { rows: Number(v('rows')), cols: Number(v('cols')) }, minsPerCarton: Number(v('mpc')), autoLockMins: Number(v('lock')) };
  const payload = {};
  for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(cfg[k])) payload[k] = next[k];
  if (!Object.keys(payload).length) return toast('Nothing changed');
  if (payload.dockGrid && !confirm(`Change the dock grid to ${payload.dockGrid.rows} × ${payload.dockGrid.cols}? Trucks already on the dock keep their grid.`)) return;
  try { await ctx.store.dispatch({ type: 'store.settings.set', entity: {}, payload }); toast('Store settings saved'); }
  catch (e) { toast(e.message, 'bad'); }
}
