// Carton profiles: units per carton by keycode, built by the worker from
// the manifests the store has published (the dv-profiles/1 document Decant
// Visualiser produced and K2B read). The list with a depth chip per
// keycode, a pack-change flag when the supplier re-cartoned, the number of
// trucks it was built from and the last arrival; find a keycode; export.

import { ic, esc, vh, sub, toast, mhead, ago, fmtDate } from '../../ui.js';
import { ensureNames, nameHtml } from '../stockroom/common.js';
import { depthOf } from '../../../shared/profiles.js';

const st = { doc: null, at: 0, error: null, loading: false, q: '', cls: 'all' };
const CLS = { deep: ['DEEP', '#DCFCE7', '#166534', 'several cartons in the last arrival'], recent: ['RECENT', '#EDE9FE', '#5B21B6', 'arrived in the last 3 weeks'], change: ['PACK CHANGE', '#FEF3C7', '#92400E', 'the supplier re-cartoned this line'] };
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
  id: 'profiles', title: 'Carton profiles', icon: 'm-profiles', area: 'backdock',
  desktop(ctx) {
    const { all, list } = rows(), doc = st.doc;
    const counts = { deep: 0, recent: 0, change: 0 }; for (const r of all) if (r.cls) counts[r.cls]++;
    const head = vh('Carton profiles', sub('Units per carton by keycode', doc ? `${doc.keycodes.toLocaleString()} keycodes profiled` : (st.error ? 'not loaded' : 'loading…')), `<button class="btn" data-act="refresh">${ic('refresh')}Refresh</button><button class="btn" data-act="export" ${doc ? '' : 'disabled'}>${ic('file')}Export</button>`, 'm-profiles');
    const meta = `<div class="card cpf-meta"><span><b>${doc ? doc.keycodes.toLocaleString() : '—'}</b> keycodes profiled</span><span><b>${doc ? doc.trucks_sampled : '—'}</b> manifests sampled</span><span class="cs-dim">${doc ? `built ${ago(doc.generated)} · from the Manifest library` : st.error ? esc(st.error) : 'building from the Manifest library…'}</span><span class="cpf-sp"></span><div class="search">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="Find a keycode" inputmode="numeric" aria-label="Find a keycode"></div></div>`;
    const chip = (k, label, col) => `<span class="chip${st.cls === k ? ' on' : ''}" data-act="cls" data-v="${k}">${col ? `<i style="background:${col}"></i>` : ''}${label}</span>`;
    const strip = `<div class="cpf-strip">${chip('all', 'All')}${chip('deep', `Deep ${counts.deep}`, '#16A34A')}${chip('recent', `Recent ${counts.recent}`, '#7C3AED')}${chip('change', `Pack change ${counts.change}`, '#D97706')}<span class="cs-dim" style="margin-left:auto">Rebuilt from the Manifest library each time it is opened</span></div>`;
    const body = list.slice(0, 100).map(r => { const c = CLS[r.cls]; return `<div class="cpf-row"><span class="cpf-main"><b>${esc(r.kc)}</b><small>${nameHtml(r.kc, 'Not in the catalogue')}</small></span><span class="cpf-chip"><span class="negctn${r.d?.recent ? ' recent' : ''}" title="${r.p.ctn} units per carton (from Back dock manifests, ${r.p.trucks} manifest${r.p.trucks === 1 ? '' : 's'})">${esc(r.d?.text || '')}</span>${r.p.pack_change ? `<span class="cpf-pc" title="The supplier re-cartoned this: ${r.p.pack_change.prev_ctn}/ctn before, ${r.p.ctn}/ctn for the last ${r.p.pack_change.since_trucks} manifests">pack change ${r.p.pack_change.prev_ctn}→${r.p.ctn}</span>` : ''}</span><span>${c ? `<span class="cpf-cls" style="background:${c[1]};color:${c[2]}" title="${c[3]}">${c[0]}</span>` : '<span class="cs-dim">—</span>'}</span><span class="cs-dim">${r.p.trucks} manifest${r.p.trucks === 1 ? '' : 's'} · ${Math.round(r.p.consistency * 100)}%</span><span>${r.p.last_arrival ? `${esc(fmtDate(r.p.last_arrival.date))} · ${r.p.last_arrival.units} units · ${r.p.last_arrival.cartons} ctn` : '—'}</span></div>`; }).join('');
    const table = `<div class="card cpf"><div class="cpf-hd"><span>Keycode</span><span>Carton depth</span><span>Class</span><span>Built from</span><span>Last arrival</span></div>${body || `<div class="ohint">${doc ? (all.length ? 'Nothing matches.' : 'No profiles yet. Publish a DC manifest and every keycode on it gets a carton depth.') : st.loading ? 'Loading…' : ''}</div>`}<div class="cs-dim" style="padding:10px 2px 2px">Showing ${Math.min(100, list.length)} of ${list.length} · DEEP = several cartons landed recently · RECENT = arrived in the last 3 weeks · PACK CHANGE = the last manifests disagree with the older ones on units per carton.</div></div>`;
    return head + meta + strip + table;
  },
  mobile() { return mhead('Carton profiles', 'Desktop only') + `<div class="mv-result">${ic('lock')}<b style="font-size:22px">On the desktop</b><span>Carton depths show on the stockroom scan report on the phone.</span></div>`; },
  mount(ctx, root) {
    load(ctx, false);
    const { list } = rows(); if (list.length) ensureNames(ctx, list.slice(0, 100).map(r => r.kc), () => ctx.rerender());
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'refresh') { load(ctx, true); ctx.rerender(); }
      else if (a.dataset.act === 'cls') { st.cls = a.dataset.v; ctx.rerender(); }
      else if (a.dataset.act === 'export') {
        const { all } = rows();
        const text = ['keycode,units_per_carton,manifests,consistency,last_arrival,last_units,last_cartons,pack_change_from', ...all.map(r => [r.kc, r.p.ctn, r.p.trucks, r.p.consistency, r.p.last_arrival?.date || '', r.p.last_arrival?.units ?? '', r.p.last_arrival?.cartons ?? '', r.p.pack_change?.prev_ctn ?? ''].join(','))].join('\n') + '\n';
        const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const l = document.createElement('a'); l.href = url; l.download = `carton-profiles-${ctx.storeNo}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast(`${all.length} profiles exported`);
      }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    return [];
  },
};
