// Carton profiles: units per carton by keycode, built by the worker from
// the manifests the store has published (the dv-profiles/1 document Decant
// Visualiser produced and K2B read). The list with a depth chip per
// keycode, a pack-change flag when the supplier re-cartoned, the number of
// trucks it was built from and the last arrival; find a keycode; export.

import { ic, esc, vh, sub, toast, mhead, ago, fmtDate } from '../../ui.js';
import { ensureNames, nameHtml, kcCopy } from '../stockroom/common.js';
import { depthOf } from '../../../shared/profiles.js';
import { csvLines } from '../../../shared/records.js';
import { tx, txn } from '../../i18n.js';

const st = { doc: null, at: 0, error: null, loading: false, q: '', cls: 'all' };
// DEEP and RECENT are the codes K2B prints: they stay as printed.
const CLS = { deep: ['DEEP', '#DCFCE7', '#166534', tx('several cartons in the last arrival')], recent: ['RECENT', '#EDE9FE', '#5B21B6', tx('arrived in the last 3 weeks')], change: [tx('PACK CHANGE'), '#FEF3C7', '#92400E', tx('the supplier re-cartoned this line')] };
// The depth chip's text (depthOf's, from shared/profiles.js) in the device's language.
const depthText = d => `▤ ${tx('{n}/ctn', { n: d.ctn })}${d.days == null ? '' : d.days <= 0 ? ' · ' + tx('today') : ' · ' + tx('{n}d ago', { n: d.days })}`;
const classOf = (kc, p, d) => p.pack_change ? 'change' : (p.last_arrival?.cartons || 0) >= 3 && d?.recent ? 'deep' : d?.recent ? 'recent' : '';

function rows() {
  const all = Object.entries(st.doc?.profiles || {}).map(([kc, p]) => { const d = depthOf(p); return { kc, p, d, cls: classOf(kc, p, d) }; });
  all.sort((a, b) => (b.p.last_arrival?.date || '').localeCompare(a.p.last_arrival?.date || '') || a.kc.localeCompare(b.kc));
  const q = st.q.replace(/\D/g, '');
  return { all, list: all.filter(r => (!q || r.kc.startsWith(q)) && (st.cls === 'all' || r.cls === st.cls)) };
}
function load(ctx, force) {
  if (st.loading || (st.doc && !force && Date.now() - st.at < 5 * 60000)) return;
  st.loading = true; st.error = null;
  ctx.api(`/v1/store/${ctx.storeNo}/profiles`).then(doc => { st.doc = doc; st.at = Date.now(); }).catch(e => { st.error = e.message; }).finally(() => { st.loading = false; ctx.rerender(); });
}

export default {
  id: 'profiles', title: tx('Carton profiles'), icon: 'm-profiles', area: 'backdock',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) {
    const { all, list } = rows(), doc = st.doc;
    const counts = { deep: 0, recent: 0, change: 0 }; for (const r of all) if (r.cls) counts[r.cls]++;
    const head = vh(tx('Carton profiles'), sub(tx('Units per carton by keycode'), doc ? tx('{n} keycodes profiled', { n: doc.keycodes.toLocaleString() }) : (st.error ? tx('not loaded') : tx('loading…'))), `<button class="btn" data-act="refresh">${ic('refresh')}${tx('reload::Refresh')}</button><button class="btn" data-act="export" ${doc ? '' : 'disabled'}>${ic('file')}${tx('Export')}</button>`, 'm-profiles');
    const meta = `<div class="card cpf-meta"><span>${tx('<b>{n}</b> keycodes profiled', { n: doc ? doc.keycodes.toLocaleString() : '—' })}</span><span>${tx('<b>{n}</b> manifests sampled', { n: doc ? doc.trucks_sampled : '—' })}</span><span class="cs-dim">${doc ? tx('built {ago} · from the Manifest library', { ago: ago(doc.generated) }) : st.error ? esc(st.error) : tx('building from the Manifest library…')}</span><span class="cpf-sp"></span><div class="search">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="${tx('Find a keycode')}" inputmode="numeric" aria-label="${tx('Find a keycode')}"></div></div>`;
    const chip = (k, label, col) => `<span class="chip${st.cls === k ? ' on' : ''}" data-act="cls" data-v="${k}">${col ? `<i style="background:${col}"></i>` : ''}${label}</span>`;
    const strip = `<div class="cpf-strip">${chip('all', tx('All'))}${chip('deep', tx('Deep {n}', { n: counts.deep }), '#16A34A')}${chip('recent', tx('Recent {n}', { n: counts.recent }), '#7C3AED')}${chip('change', tx('Pack change {n}', { n: counts.change }), '#D97706')}<span class="cs-dim" style="margin-left:auto">${tx('Rebuilt from the Manifest library each time it is opened')}</span></div>`;
    const body = list.slice(0, 100).map(r => { const c = CLS[r.cls]; return `<div class="cpf-row"><span class="cpf-main"><b>${kcCopy(r.kc)}</b><small>${nameHtml(r.kc, tx('Not in the catalogue'))}</small></span><span class="cpf-chip"><span class="negctn${r.d?.recent ? ' recent' : ''}" title="${txn(r.p.trucks, '{ctn} units per carton (from Back dock manifests, {n} manifest)', '{ctn} units per carton (from Back dock manifests, {n} manifests)', { ctn: r.p.ctn })}">${esc(r.d ? depthText(r.d) : '')}</span>${r.p.pack_change ? `<span class="cpf-pc" title="${tx('The supplier re-cartoned this: {prev}/ctn before, {ctn}/ctn for the last {n} manifests', { prev: r.p.pack_change.prev_ctn, ctn: r.p.ctn, n: r.p.pack_change.since_trucks })}">${tx('pack change {prev}→{ctn}', { prev: r.p.pack_change.prev_ctn, ctn: r.p.ctn })}</span>` : ''}</span><span>${c ? `<span class="cpf-cls" style="background:${c[1]};color:${c[2]}" title="${c[3]}">${c[0]}</span>` : '<span class="cs-dim">—</span>'}</span><span class="cs-dim">${txn(r.p.trucks, '{n} manifest', '{n} manifests')} · ${Math.round(r.p.consistency * 100)}%</span><span>${r.p.last_arrival ? `${esc(fmtDate(r.p.last_arrival.date))} · ${tx('{units} units · {cartons} ctn', { units: r.p.last_arrival.units, cartons: r.p.last_arrival.cartons })}` : '—'}</span></div>`; }).join('');
    const table = `<div class="card cpf"><div class="cpf-hd"><span>${tx('Keycode')}</span><span>${tx('Carton depth')}</span><span>${tx('Class')}</span><span>${tx('Built from')}</span><span>${tx('Last arrival')}</span></div>${body || `<div class="ohint">${doc ? (all.length ? tx('Nothing matches.') : tx('No profiles yet. Publish a DC manifest and every keycode on it gets a carton depth.')) : st.loading ? tx('Loading…') : ''}</div>`}<div class="cs-dim" style="padding:10px 2px 2px">${tx('Showing {shown} of {total}', { shown: Math.min(100, list.length), total: list.length })} · ${tx('DEEP = several cartons landed recently · RECENT = arrived in the last 3 weeks · PACK CHANGE = the last manifests disagree with the older ones on units per carton.')}</div></div>`;
    return head + meta + strip + table;
  },
  mount(ctx, root) {
    load(ctx, false);
    const { list } = rows(); if (list.length) ensureNames(ctx, list.slice(0, 100).map(r => r.kc), () => ctx.rerender());
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'refresh') { load(ctx, true); ctx.rerender(); }
      else if (a.dataset.act === 'cls') { st.cls = a.dataset.v; ctx.rerender(); }
      else if (a.dataset.act === 'export') {
        const { all } = rows();
        const text = csvLines(['keycode', 'units_per_carton', 'manifests', 'consistency', 'last_arrival', 'last_units', 'last_cartons', 'pack_change_from'], all.map(r => [r.kc, r.p.ctn, r.p.trucks, r.p.consistency, r.p.last_arrival?.date || '', r.p.last_arrival?.units ?? '', r.p.last_arrival?.cartons ?? '', r.p.pack_change?.prev_ctn ?? '']));
        const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const l = document.createElement('a'); l.href = url; l.download = `carton-profiles-${ctx.storeNo}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast(txn(all.length, '{n} profile exported', '{n} profiles exported'));
      }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    return [];
  },
};
