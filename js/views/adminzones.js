// Owner console › Zones: the list a store's zone is picked from, on
// Register a store and on a store's Edit. Add a zone, rename one (its
// stores move with it), remove one no store is in. The registry keeps the
// list (worker/registry.js) and refuses a zone that is not on it; each
// change is an owner action. Other console pages use loadZones() and
// zoneSelect() for the dropdown.

import { ic, esc, vh, sub, toast } from '../ui.js';
import { tx, txn } from '../i18n.js';
import { invalidate } from './admin.js';

const st = { list: null, error: null, edit: null, busy: false };
const fail = e => toast(e.code === 'unauthorised' ? tx('Owner session expired. Sign in again.') : e.message, 'bad');
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
let loading = null;

// The list for any console page: fetched once, kept until something changes it.
export function loadZones(ctx) {
  if (st.list || loading) return loading;
  loading = ctx.admin.api('/v1/admin/zones').then(r => { st.list = r.zones || []; st.error = null; }).catch(e => { st.error = e.message; fail(e); }).finally(() => { loading = null; ctx.rerender(); });
  return loading;
}
// A store was registered or moved: its zone's store list is out of date.
export function zonesChanged() { st.list = null; }
// The zone dropdown for a form; a store's current zone stays selectable
// when it is not on the list (typed before the list existed).
export function zoneSelect(name, cur) {
  if (!st.list) return `<select class="ad-in" name="${name}" disabled aria-busy="true"><option>${st.error ? esc(st.error) : tx('Loading…')}</option></select>`;
  const onList = st.list.some(z => same(z.name, cur));
  return `<select class="ad-in" name="${name}" required><option value=""${cur ? '' : ' selected'} disabled>${st.list.length ? tx('Pick a zone') : tx('No zones yet')}</option>` +
    (cur && !onList ? `<option value="${esc(cur)}" selected>${tx('{zone} (not on the list)', { zone: esc(cur) })}</option>` : '') +
    st.list.map(z => `<option value="${esc(z.name)}"${same(z.name, cur) ? ' selected' : ''}>${esc(z.name)}</option>`).join('') + `</select>`;
}
// The hint under a zone dropdown: where the list is kept.
export const zoneHint = () => `<a class="zn-link" data-view="adminzones">${tx('Edit the zones')}</a>`;

function page(ctx) {
  const list = st.list || [], all = ctx.admin.stores || [], nameOf = no => all.find(s => String(s.no) === String(no))?.name || '';
  const head = vh(tx('Zones'), sub(tx('the zone each store belongs to'), txn(list.length, '{n} zone', '{n} zones')), `<button class="btn" data-act="zn-reload">${ic('refresh')}${tx('reload::Refresh')}</button>`, 'pin');
  if (st.error && !st.list) return head + `<div class="card"><p class="lbl">${esc(st.error)}</p></div>`;
  if (!st.list) return head + `<div class="card"><div class="ohint">${tx('Loading…')}</div></div>`;
  const add = `<form class="card zn-add" data-form="zone-add"><label class="ad-field"><span>${tx('Add a zone')}</span><input class="ad-in" name="name" maxlength="40" required autocomplete="off" placeholder="${tx('e.g. {example}', { example: 'WA Metro' })}"></label><button class="btn primary" type="submit"${st.busy ? ' disabled' : ''}>${ic('plus')}${tx('Add')}</button></form>`;
  const chip = (no, name, zone) => `<a class="zn-st" data-view="adminstore" data-no="${esc(no)}"><span class="mono">${esc(no)}</span>${name ? ' ' + esc(name) : ''}${zone ? ` <small>${esc(zone)}</small>` : ''}</a>`;
  const row = z => st.edit === z.name
    ? `<tr><td colspan="3"><form class="zn-ren" data-form="zone-rename" data-zone="${esc(z.name)}"><input class="ad-in" name="name" value="${esc(z.name)}" maxlength="40" required autocomplete="off" aria-label="${tx('New name for {zone}', { zone: esc(z.name) })}"><button class="btn primary sm" type="submit"${st.busy ? ' disabled' : ''}>${ic('check')}${tx('Save')}</button><button class="btn sm" type="button" data-act="zn-cancel">${tx('Cancel')}</button>${z.stores.length ? `<small class="cs-dim">${txn(z.stores.length, 'Its {n} store moves to the new name.', 'Its {n} stores move to the new name.')}</small>` : ''}</form></td></tr>`
    : `<tr><td><b>${esc(z.name)}</b></td><td><div class="zn-stores">${z.stores.length ? z.stores.map(no => chip(no, nameOf(no))).join('') : `<span class="cs-dim">${tx('no stores yet')}</span>`}</div></td>` +
      `<td class="zn-acts"><button class="btn sm" data-act="zn-edit" data-zone="${esc(z.name)}">${ic('edit')}${tx('Rename')}</button><button class="btn sm" data-act="zn-del" data-zone="${esc(z.name)}"${z.stores.length ? ` disabled title="${tx('Move its stores to another zone first')}"` : ''}>${ic('trash')}${tx('Remove')}</button></td></tr>`;
  const table = list.length ? `<div class="card"><table class="wb-t zn-t"><thead><tr><th>${tx('Zone')}</th><th>${tx('Stores')}</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`
    : `<div class="card"><p class="lbl">${tx('No zones yet. Add the zones your stores belong to.')}</p></div>`;
  // Stores outside the list: no zone yet, or one typed before the list.
  const loose = all.filter(s => !s.region || !list.some(z => same(z.name, s.region)));
  const outside = loose.length ? `<div class="card"><div class="ch"><h3>${tx('Stores without a zone on the list')}</h3><span class="cs-dim">${txn(loose.length, '{n} store', '{n} stores')}</span></div><div class="zn-stores">${loose.map(s => chip(s.no, s.name, s.region)).join('')}</div><p class="lbl">${tx('Open a store and pick its zone under Edit.')}</p></div>` : '';
  return head + add + table + outside + `<p class="lbl">${tx('A store’s zone is picked from this list when it is registered, and changed under Edit on the store.')} ${tx('Renaming a zone moves its stores with it.')}</p>`;
}

// One change: the registry answers with the whole list.
async function save(ctx, call, done, moved = false) {
  if (st.busy) return; st.busy = true;
  try { const r = await call(); st.list = r.zones || []; st.edit = null; invalidate(); if (moved) await ctx.admin.refreshStores?.(); toast(done); }
  catch (e) { fail(e); }
  st.busy = false; ctx.rerender();
}

export default {
  id: 'adminzones', title: tx('Zones'), icon: 'pin',
  desktop(ctx) { return page(ctx); },
  mount(ctx, root) {
    loadZones(ctx);
    root.addEventListener('click', async ev => {
      const a = ev.target.closest('[data-act^="zn-"]'); if (!a) return;
      const act = a.dataset.act, z = a.dataset.zone;
      if (act === 'zn-reload') { st.list = null; st.error = null; loadZones(ctx); ctx.rerender(); }
      else if (act === 'zn-edit') { st.edit = z; ctx.rerender(); root.querySelector('[data-form="zone-rename"] input')?.select(); }
      else if (act === 'zn-cancel') { st.edit = null; ctx.rerender(); }
      else if (act === 'zn-del') { if (confirm(tx('Remove the zone {zone}?', { zone: z }))) await save(ctx, () => ctx.admin.api(`/v1/admin/zones/${encodeURIComponent(z)}`, { method: 'DELETE' }), tx('{zone} removed', { zone: z })); }
    });
    root.addEventListener('submit', async ev => {
      const f = ev.target.closest('form[data-form^="zone-"]'); if (!f) return;
      ev.preventDefault();
      const name = f.elements.name.value.trim(); if (!name) return;
      if (f.dataset.form === 'zone-add') return save(ctx, () => ctx.admin.api('/v1/admin/zones', { method: 'POST', body: { name } }), tx('{zone} added', { zone: name }));
      const from = f.dataset.zone; if (name === from) { st.edit = null; return ctx.rerender(); }
      return save(ctx, () => ctx.admin.api(`/v1/admin/zones/${encodeURIComponent(from)}`, { method: 'PATCH', body: { name } }), tx('{from} is now {to}', { from, to: name }), true);
    });
    return [];
  },
};
