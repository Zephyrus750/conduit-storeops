// Settings and utilities: General (this device, updates, sign out) and
// Appearance (skin, accent, rail and bars as tokens). Preferences persist
// per device under suite_prefs.

import { $, ic, esc, vh, sub } from '../ui.js';
import { ACCENTS, prefs, setPref } from '../prefs.js';
import { VERSION } from '../version.js';

let sec = 'general';
const row = (t, d, ctl) => `<div class="stg-item"><div><b>${t}</b><span>${d}</span></div><div class="stg-ctl">${ctl}</div></div>`;
const tgl = (on, act) => `<span class="tgl${on ? ' on' : ''}" data-act="${act}"></span>`;

export default {
  id: 'settings', title: 'Settings and utilities', icon: 'm-settings',
  desktop(ctx) {
    const NAV = [['general', 'General', 'settings'], ['appearance', 'Appearance', 'star'], ['_', 'SUPPORT'], ['about', 'About', 'file']];
    const nav = `<div class="stg-nav">${NAV.map(n => n[0] === '_' ? `<div class="stg-grp">${n[1]}</div>` : `<button class="stg-row${n[0] === sec ? ' on' : ''}" data-act="sec" data-sec="${n[0]}">${ic(n[2])}${n[1]}</button>`).join('')}<div class="stg-ver">Conduit ${VERSION} · ${ctx.store ? 'store ' + esc(ctx.storeNo) : 'owner'} · signed in on this device</div></div>`;
    return vh('Settings and utilities', ctx.store ? sub(`Store ${esc(ctx.storeNo)}`, esc(ctx.storeName), VERSION) : sub('Owner console', VERSION), '', 'm-settings') + `<div class="stg">${nav}<div class="stg-body">${body(ctx)}</div></div>`;
  },
  mobile(ctx) { return `<div class="mv-head"><div><h2>Settings</h2><span>${ctx.store ? esc(ctx.storeNo) + ' ' + esc(ctx.storeName) : 'Owner console'} · ${VERSION}</span></div></div><div class="stg-body">${body(ctx)}</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act');
      if (act === 'sec') { sec = a.getAttribute('data-sec'); ctx.rerender(); }
      else if (act === 'skin') setPref('skin', a.getAttribute('data-skin')), ctx.rerender();
      else if (act === 'accent') setPref('accent', Number(a.getAttribute('data-acc'))), ctx.rerender();
      else if (act === 'rail') setPref('rail', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'bars') setPref('bars', a.getAttribute('data-v')), ctx.rerender();
      else if (act === 'hdr') setPref('hdr', prefs().hdr === 'title' ? 'classic' : 'title'), ctx.rerender();
      else if (act === 'railmin') setPref('railmin', !prefs().railmin), ctx.rerender();
      else if (act === 'signout') { if (confirm(ctx.store ? 'Sign out of this store on this device?' : 'Sign out of the owner console on this device?')) await ctx.signOut(); }
      else if (act === 'reload') location.reload();
      else if (act === 'resync') ctx.store?.resync();
    });
    return [];
  },
};
function body(ctx) {
  const p = prefs();
  if (sec === 'appearance') {
    const themes = [['Light', '#F3F4F6', '#FFFFFF', '#111827', 'light'], ['Dark', '#0B1220', '#111827', '#F3F4F6', 'dark']];
    let accs = '', grp = '';
    ACCENTS.forEach((a, i) => { const g = a[6] === 'soft' ? 'Softer' : 'Bright'; if (g !== grp) { grp = g; accs += (accs ? '</div>' : '') + `<div class="stg-grp">${g}</div><div class="stg-accs">`; } accs += `<button class="stg-acc${p.accent === i ? ' on' : ''}" data-act="accent" data-acc="${i}"><i style="background:${a[1]}"></i><span><b>${a[0]}</b><small>${a[1]}</small></span></button>`; });
    const seg = (act, opts, cur) => `<span class="seg stg-seg">${opts.map(o => `<button class="${cur === o[0] ? 'on' : ''}" data-act="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</span>`;
    return `<div class="stg-card"><div class="stg-h">Theme</div><div class="stg-themes">${themes.map(t => `<div class="stg-theme${p.skin === t[4] ? ' on' : ''}" data-act="skin" data-skin="${t[4]}"><div class="sw3" style="background:${t[1]}"><i style="background:${t[2]}"></i><b style="background:${t[3]}"></b></div><span>${t[0]}</span></div>`).join('')}</div></div>` +
      `<div class="stg-card"><div class="stg-h">Accent</div><p class="stg-p">Only the accent tokens change: active row, primary button, links, the mark and the progress fill. State colours stay put.</p>${accs}</div></div>` +
      `<div class="stg-card"><div class="stg-h">Shell</div>${row('Rail colour', 'Light keeps the rail plain. Tinted washes it in the soft accent. Accent paints it fully.', seg('rail', [['light', 'Light'], ['tint', 'Tinted'], ['solid', 'Accent'], ['deep', 'Deep']], p.rail))}${row('Header and footer', 'Plain, tinted or strong accent bars.', seg('bars', [['plain', 'Plain'], ['tint', 'Tinted'], ['strong', 'Strong']], p.bars))}${row('Title bar', 'Move each view’s title into the header and fold search into the logo.', tgl(p.hdr === 'title', 'hdr'))}${row('Rail', 'Start with the rail collapsed to icons', tgl(p.railmin, 'railmin'))}</div>`;
  }
  if (sec === 'about') return `<div class="stg-card"><div class="stg-h">Conduit</div>${row('Version', `${VERSION} · one shell, one worker, one event log per store`, '')}${row('Design of record', 'The Conduit Backend Design doc and the Conduit Shell Swap showcase', '')}</div>`;
  const s = ctx.store?.status, cur = ctx.session.current;
  const who = ctx.store ? row('Store', `${esc(ctx.storeNo)} ${esc(ctx.storeName)} · verified against the worker${cur?.actas ? ' · acting as the store as owner' : ''}`, '<span class="chip">Signed in</span>') : row('Owner', 'Signed in with the owner key · every action is logged in the registry', '<span class="chip">Owner</span>');
  const sync = s ? row('Sync', `${esc(s.state)} · ${s.queued} queued · seq ${s.seq}${s.lastError ? ' · ' + esc(s.lastError) : ''}`, `<span class="btn sm" data-act="resync">${ic('refresh')}Resync</span>`) : '';
  return `<div class="stg-card"><div class="stg-h">This device</div>${who}${row('Device id', esc(ctx.session.device), '')}${row('Roles', esc((cur?.roles || []).join(', ')), '<span class="stg-dim">hard-restricted by role</span>')}${sync}</div>` +
    `<div class="stg-card"><div class="stg-h">Updates</div>${row('Version', `${VERSION} · this device is on the current release`, `<span class="btn sm" data-act="reload">${ic('refresh')}Reload</span>`)}</div>` +
    `<div class="stg-card"><div class="stg-h">Account</div>${row('Sign out', ctx.store ? (cur?.actas ? 'Returns to the owner console. Queued changes are sent first.' : 'Forgets the store on this device. Queued changes are sent first.') : 'Forgets the owner session on this device.', `<span class="btn sm" style="color:var(--red)" data-act="signout">${cur?.actas ? 'Back to the console' : 'Sign out'}</span>`)}</div>`;
}
