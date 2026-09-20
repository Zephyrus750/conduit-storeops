// Manifests: the store's window on the DC reports it has published. Browse
// the library (despatch, DC, cartons, consols), open one to see its
// consolidations, and type a keycode to see which pallets carry it: the
// answer a receiver needs standing at the dock. Publish a report here or
// at Receiving; attach one to a truck. Ported from Vector's
// backdock-manifests over the worker's manifest store.

import { $, ic, esc, vh, sub, toast, dep, mhead, ago, fmtTime } from '../../ui.js';
import { ensureNames, nameOf } from '../stockroom/common.js';
import { manifestIndex, microDept, publishManifestFile, attachManifest, openTrucks, truckNo } from './common.js';

const st = { open: null, doc: null, docFor: null, error: null, q: '', expanded: {}, busy: false };
const chip = d => { const dd = microDept(d); return dd ? dep(dd) : `<span class="dep" style="background:#64748B">${esc(d)}</span>`; };
const fmtDespatch = s => s || '—';

function detail(ctx, m) {
  if (!st.open) return `<div class="card mfd"><div class="ch"><h3>Pick a manifest</h3></div><p class="lbl">Open one from the library to see its consolidations, or publish today's report.</p></div>`;
  if (st.error) return `<div class="card mfd"><div class="ch"><h3>${esc(st.open)}</h3></div><p class="lbl">${esc(st.error)}</p></div>`;
  const doc = st.docFor === st.open ? st.doc : null;
  if (!doc) return `<div class="card mfd"><div class="ch"><h3>${esc(st.open)}</h3></div><div class="ohint">Loading the report…</div></div>`;
  const q = st.q.replace(/\D/g, '');
  const hits = q ? doc.consols.filter(c => (c.items || []).some(i => String(i.k).startsWith(q))) : doc.consols;
  const trucks = openTrucks(ctx.store.get('dock')), entry = m.find(x => x.manNo === doc.manNo), attachedTo = entry?.truck;
  const keycodes = new Set(doc.consols.flatMap(c => (c.items || []).map(i => i.k))).size;
  return `<div class="card mfd"><div class="mfd-h"><span class="mfd-t">${ic('packages')}<b>${esc(doc.manNo)}</b></span><span class="mfd-facts"><span>despatch <b>${esc(fmtDespatch(doc.despatch))}</b></span><span>DC <b>${esc(doc.dcNo || '—')}</b></span><span><b>${doc.consols.length}</b> consols</span><span><b>${doc.totalCartons ?? doc.consols.reduce((n, c) => n + c.cartons, 0)}</b> cartons</span><span><b>${keycodes}</b> keycodes</span></span></div>` +
    `<div class="mfd-acts">${attachedTo ? `<span class="status good">Attached to Truck ${esc(truckNo(attachedTo))}</span>` : trucks.length ? `<select class="ad-in" data-field="truck">${trucks.map(t => `<option value="${esc(t.id)}">Truck ${esc(truckNo(t.id))} · ${esc(t.status)}</option>`).join('')}</select><button class="btn primary sm" data-act="attach">${ic('truck')}Attach to truck</button>` : '<span class="cs-dim">No truck on the board to attach to</span>'}<button class="btn sm" data-act="remove" style="margin-left:auto">${ic('trash')}Remove</button></div>` +
    `<div class="mfd-find"><div class="search">${ic('search')}<input data-field="q" value="${esc(st.q)}" inputmode="numeric" placeholder="Find a keycode in this manifest" aria-label="Find a keycode in this manifest"></div><span class="mfd-hit">${q ? `${hits.length} consol${hits.length === 1 ? '' : 's'} carr${hits.length === 1 ? 'ies' : 'y'} ${esc(q)}` : `${doc.consols.length} consolidations`}</span></div>` +
    `<div class="pt3">Consolidations<span class="cs-dim">pallet id · department mix · cartons</span></div>` +
    hits.slice(0, 80).map(c => {
      const open = !!st.expanded[c.id] || (q && hits.length <= 3);
      const items = c.items || [];
      return `<div class="mfc${open ? ' open' : ''}"><div class="mfc-h" data-act="toggle" data-id="${esc(c.id)}">${ic('chev')}<span class="mfc-id" title="Consolidation ${esc(c.cons)}: the last 9 digits are the pallet-label id">${esc(c.id)}</span><span class="mfc-mix">${(c.mix || []).slice(0, 4).map(x => chip(x[0])).join('')}</span><span class="mfc-f"><b>${c.cartons}</b> ctn</span><span class="mfc-f cs-dim">${items.length} keycode${items.length === 1 ? '' : 's'}</span></div>` +
        (open ? `<div class="mfc-items">${items.slice(0, 40).map(it => `<div class="mfc-it${q && String(it.k).startsWith(q) ? ' hit' : ''}"><span class="kc">${esc(it.k)}</span><span class="nm">${esc(nameOf(it.k) || it.d || '')}</span>${it.dept ? chip(it.dept) : ''}<span class="ct" title="Physical cartons carrying this keycode">${it.c ? `${it.c} ctn · ` : ''}${it.q} units</span></div>`).join('')}${items.length > 40 ? `<div class="cs-dim" style="padding:6px 2px 0">${items.length - 40} more lines on this pallet</div>` : ''}</div>` : '') + '</div>';
    }).join('') + (hits.length > 80 ? `<div class="cs-dim" style="margin-top:8px">${hits.length - 80} more consolidations. Type a keycode above to filter to the pallets that carry it.</div>` : '') + '</div>';
}

export default {
  id: 'manifests', title: 'Manifests', icon: 'm-manifests', area: 'backdock',
  desktop(ctx) {
    const m = manifestIndex(ctx.store.get('dock'));
    if (st.open && !m.some(x => x.manNo === st.open)) st.open = m[0]?.manNo || null;
    if (!st.open && m.length) st.open = m[0].manNo;
    const head = vh('Manifests', sub('Manifest library', `${m.length} published`, 'rolling 20'), `<button class="btn" data-act="refresh">${ic('refresh')}Refresh</button><label class="btn primary" style="cursor:pointer"><input type="file" accept=".xls,.xlsx,.csv" data-field="file" style="display:none">${ic('file')}Publish a manifest</label>`, 'm-manifests');
    const list = `<div class="card mfl"><div class="pt3">Published<span class="cs-dim">newest first</span></div>${m.length ? m.map(x => `<div class="mfl-row${x.manNo === st.open ? ' on' : ''}" data-act="open" data-man="${esc(x.manNo)}"><span class="mfl-main"><span class="mfl-top"><b>${esc(x.manNo)}</b><span class="cs-dim">${ic('clock')}${x.despatch ? 'Despatch ' + esc(x.despatch) : 'no despatch date'}</span></span><small>${esc(x.filename || (x.dcNo ? 'DC ' + x.dcNo : 'report'))}${x.truck ? ` · Truck ${esc(truckNo(x.truck))}` : ''}</small></span><span class="mfl-facts"><span><b>${x.totalCartons}</b> ctn · <b>${x.consols}</b> consols</span><span class="cs-dim">${ago(x.publishedAt)}</span></span>${ic('chev')}</div>`).join('') : `<div class="ohint">Nothing published yet. Publish today's DC Manifest Report (the .xls from the email) and the dock can verify pallets against it.</div>`}</div>`;
    return head + `<div class="mgrid">${list}${detail(ctx, m)}</div>`;
  },
  mobile() { return mhead('Manifests', 'Desktop only') + `<div class="mv-result">${ic('lock')}<b style="font-size:22px">Managed on the desktop</b><span>Manifests arrive by email and are published and attached on the desktop.</span></div>`; },
  mount(ctx, root) {
    const load = () => {
      if (!st.open || st.docFor === st.open) return;
      st.docFor = st.open; st.doc = null; st.error = null; st.q = ''; st.expanded = {};
      ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(st.open)}`).then(doc => { st.doc = doc; ctx.rerender(); }).catch(e => { st.error = e.message; ctx.rerender(); });
    };
    load();
    const doc = st.docFor === st.open ? st.doc : null;
    if (doc) { const want = []; for (const c of doc.consols) if (st.expanded[c.id]) for (const it of (c.items || []).slice(0, 40)) want.push(it.k); if (want.length) ensureNames(ctx, want, () => ctx.rerender()); }
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'open') { st.open = a.dataset.man; ctx.rerender(); }
        else if (act === 'toggle') { st.expanded[a.dataset.id] = !st.expanded[a.dataset.id]; ctx.rerender(); }
        else if (act === 'refresh') ctx.rerender();
        else if (act === 'attach') { const truck = root.querySelector('[data-field="truck"]')?.value; if (!truck) return; a.disabled = true; await attachManifest(ctx, truck, st.open); toast(`${st.open} attached to Truck ${truckNo(truck)}`); }
        else if (act === 'remove') { if (!confirm(`Remove manifest ${st.open} from the library? Trucks it is attached to keep their copy.`)) return; await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(st.open)}`, { method: 'DELETE' }); st.open = null; st.docFor = null; toast('Manifest removed'); }
      } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    root.addEventListener('change', async e => {
      if (!e.target.matches('[data-field="file"]')) return;
      const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
      toast(`Reading ${f.name}…`);
      try { const r = await publishManifestFile(ctx, f); st.open = r.manNo; st.docFor = null; toast(`Manifest ${r.manNo} published · ${r.consols} consols, ${r.totalCartons} cartons`); }
      catch (err) { toast(`Could not publish ${f.name}: ${err.message}`, 'bad'); }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};
