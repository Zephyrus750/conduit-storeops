// Manifests: the explorer (Decant Visualiser's manifest explorer over the
// worker's manifest store). Every manifest the dock knows, from the library,
// the planner's slots, the trucks on the board and the history, grouped by
// week with where it stands (Planned, Receiving, Decanting, Done). Open one
// to see its size (consols, cartons, keycodes, units, estimated work), the
// department-group rollup, and its consols, products and departments, each
// searchable and sortable, with a square per consol showing whether it has
// landed. Publish a report here or at Receiving; attach one to a truck.

import { ic, esc, vh, sub, toast, dep, mhead, ago, fmtDate } from '../../ui.js';
import { ensureNames, nameOf } from '../stockroom/common.js';
import { manifestIndex, microDept, publishManifestFile, attachManifest, openTrucks, truckNo, STD_MINS_PER_CARTON } from './common.js';
import { retailPeriod } from '../../../shared/time.js';

const st = { open: null, doc: null, docFor: null, error: null, q: '', tab: 'consols', sort: null, dir: -1, group: null, expanded: {} };
const chip = d => { const dd = microDept(d); return dd ? dep(dd) : `<span class="dep" style="background:#64748B">${esc(d || '???')}</span>`; };
const GROUPS = [['h', 'Home', '#2563EB'], ['c', 'Clothing', '#DB2777'], ['k', 'Kids', '#F59E0B'], ['flex', 'Flex', '#64748B']];
const groupOf = code => { const d = microDept(code); return !d ? '?' : d === 'flex' ? 'flex' : d[0]; };
const STATUS = { done: ['Done', 'good'], live: ['Decanting', 'warn'], staged: ['Receiving', ''], planned: ['Planned', ''], library: ['Published', ''] };
const mondayOf = day => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const units = c => (c.items || []).reduce((n, i) => n + (Number(i.q) || 0), 0);
// An item's cartons: logged on the line, else its share of the consol's cartons by units.
export const itemCartons = (c, it) => it.c || (units(c) ? c.cartons * (Number(it.q) || 0) / units(c) : 0);

// Every manifest the dock knows, one entry each, with where it stands.
function entries(ctx) {
  const dock = ctx.store.get('dock'), plan = ctx.store.get('plan') || {}, by = new Map();
  const put = (manNo, x) => { const cur = by.get(manNo) || { manNo, status: 'library' }; by.set(manNo, { ...cur, ...x }); };
  for (const m of manifestIndex(dock)) put(m.manNo, { ...m, day: (m.publishedAt || '').slice(0, 10) });
  for (const [date, day] of Object.entries(plan.days || {})) for (const [slot, sl] of Object.entries(day.slots || {})) if (sl.manifest?.manNo) put(sl.manifest.manNo, { status: 'planned', day: date, slot, consols: by.get(sl.manifest.manNo)?.consols ?? (sl.manifest.consols?.length || 0) });
  for (const r of dock.history || []) if (r.manifest?.manNo) put(r.manifest.manNo, { status: 'done', day: r.date, truck: r.id, totalCartons: by.get(r.manifest.manNo)?.totalCartons || r.manifest.cartons || 0 });
  for (const [id, t] of Object.entries(dock.trucks || {})) if (t.manifest?.manNo) put(t.manifest.manNo, { status: t.status === 'closed' ? 'done' : t.status, day: id.slice(0, 10), truck: id, consols: t.manifest.consols.length, totalCartons: t.manifest.consols.reduce((n, c) => n + c.cartons, 0) });
  return [...by.values()].sort((a, b) => (b.day || '').localeCompare(a.day || '') || (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}

// Consol id → how far it has got on the truck that carries the manifest.
function landedMap(ctx, e) {
  const t = e?.truck && ctx.store.get('dock').trucks?.[e.truck], out = {};
  if (!t) return out;
  for (const id of t.carriedConsols || []) out[id] = 'carried';
  for (const p of Object.values(t.pallets || {})) for (const id of p.consolIds || []) out[id] = p.carriedFrom ? 'carried' : p.status === 'done' ? 'done' : p.status === 'active' ? 'active' : 'landed';
  return out;
}
const SQ_NAME = { landed: 'landed', active: 'decanting', done: 'decanted', carried: 'carried over', none: 'not landed' };
const sq = s => `<i class="mfx-sq ${s || 'none'}" title="${SQ_NAME[s || 'none']}"></i>`;

function rows(doc, landed) {
  const q = st.q.trim().toLowerCase(), inGroup = c => !st.group || (c.mix?.length ? c.mix.some(x => groupOf(x[0]) === st.group) : groupOf(c.dept) === st.group);
  const consols = doc.consols.filter(inGroup);
  if (st.tab === 'products') {
    const m = new Map();
    for (const c of consols) for (const it of c.items || []) {
      if (st.group && groupOf(it.dept) !== st.group) continue;
      const r = m.get(it.k) || { k: it.k, name: nameOf(it.k) || it.d || '', dept: it.dept, units: 0, cartons: 0, consols: [] };
      r.units += Number(it.q) || 0; r.cartons += itemCartons(c, it); r.consols.push(c.id); m.set(it.k, r);
    }
    let list = [...m.values()].map(r => ({ ...r, cartons: Math.round(r.cartons * 10) / 10, landed: r.consols.filter(id => landed[id]).length }));
    if (q) list = list.filter(r => String(r.k).includes(q) || r.name.toLowerCase().includes(q) || String(r.dept || '').includes(q) || (microDept(r.dept) || '').includes(q) || r.consols.some(id => id.includes(q)));
    return list;
  }
  if (st.tab === 'depts') {
    const m = new Map();
    for (const c of consols) for (const it of c.items || []) {
      if (st.group && groupOf(it.dept) !== st.group) continue;
      const k = String(it.dept || '???'), r = m.get(k) || { dept: k, units: 0, cartons: 0, landedCtn: 0, keycodes: new Set(), consols: new Set() };
      const ct = itemCartons(c, it); r.units += Number(it.q) || 0; r.cartons += ct; if (landed[c.id]) r.landedCtn += ct; r.keycodes.add(it.k); r.consols.add(c.id); m.set(k, r);
    }
    let list = [...m.values()].map(r => ({ dept: r.dept, units: r.units, cartons: Math.round(r.cartons), keycodes: r.keycodes.size, consols: r.consols.size, pct: r.cartons ? Math.round(r.landedCtn / r.cartons * 100) : 0 }));
    if (q) list = list.filter(r => r.dept.includes(q) || (microDept(r.dept) || '').includes(q));
    return list;
  }
  let list = consols.map(c => ({ ...c, units: units(c), keycodes: new Set((c.items || []).map(i => i.k)).size, state: landed[c.id] || (c.carried ? 'carried' : null) }));
  if (q) list = list.filter(c => c.id.includes(q) || String(c.cons || '').includes(q) || String(c.dept || '').includes(q) || (c.items || []).some(i => String(i.k).startsWith(q) || (nameOf(i.k) || i.d || '').toLowerCase().includes(q) || String(i.dept || '').includes(q)));
  return list;
}
const COLS = {
  consols: [['', null], ['Consol', 'id'], ['Departments', null], ['Cartons', 'cartons'], ['Units', 'units'], ['Keycodes', 'keycodes']],
  products: [['Keycode', 'k'], ['Product', 'name'], ['Dept', 'dept'], ['Units', 'units'], ['Cartons', 'cartons'], ['Consols', 'n'], ['Landed', 'landed']],
  depts: [['Department', 'dept'], ['Cartons', 'cartons'], ['Units', 'units'], ['Keycodes', 'keycodes'], ['Consols', 'consols'], ['Landed', 'pct']],
};
function sorted(list) {
  const k = st.sort; if (!k) return list;
  const v = r => k === 'n' ? r.consols.length : r[k];
  return list.slice().sort((a, b) => { const x = v(a), y = v(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true })) * st.dir; });
}

function explorer(ctx, e, doc) {
  const landed = landedMap(ctx, e), allUnits = doc.consols.reduce((n, c) => n + units(c), 0), cartons = doc.totalCartons ?? doc.consols.reduce((n, c) => n + c.cartons, 0);
  const keycodes = new Set(doc.consols.flatMap(c => (c.items || []).map(i => i.k))).size, mpc = ctx.store.get('dock').trucks?.[e?.truck]?.minsPerCarton || STD_MINS_PER_CARTON, work = Math.round(cartons * mpc);
  const trucks = openTrucks(ctx.store.get('dock')), attachedTo = e?.truck, nLanded = doc.consols.filter(c => landed[c.id]).length;
  // The department-group rollup: cartons by Home / Clothing / Kids / Flex.
  const gc = {}; for (const c of doc.consols) for (const it of c.items || []) { const g = groupOf(it.dept); gc[g] = (gc[g] || 0) + itemCartons(c, it); }
  const gs = [...GROUPS, ['?', 'Unknown', '#94A3B8']].filter(g => gc[g[0]] > 0), gt = Object.values(gc).reduce((a, b) => a + b, 0) || 1;
  const roll = `<div class="mfx-roll">${gs.map(g => `<button class="mfx-seg${st.group === g[0] ? ' on' : ''}${st.group && st.group !== g[0] ? ' dim' : ''}" data-act="group" data-g="${g[0]}" style="flex:${gc[g[0]]};background:${g[2]}" title="${g[1]}: ${Math.round(gc[g[0]])} cartons">${gc[g[0]] / gt > 0.08 ? `${g[1]} ${Math.round(gc[g[0]] / gt * 100)}%` : ''}</button>`).join('')}</div>${st.group ? `<div class="cs-dim" style="margin:-4px 0 8px">Showing ${esc(GROUPS.find(g => g[0] === st.group)?.[1] || 'Unknown')} only · <span class="go" data-act="group" data-g="${esc(st.group)}">show all</span></div>` : ''}`;
  const list = sorted(rows(doc, landed)), cols = COLS[st.tab];
  const th = cols.map(([label, key]) => key ? `<th data-act="sort" data-k="${key}" class="${st.sort === key ? 'on' : ''}">${label}${st.sort === key ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>` : `<th>${label}</th>`).join('');
  const shop = k => `<a class="mfx-link" href="https://www.kmart.com.au/search/?searchTerm=${encodeURIComponent(k)}" target="_blank" rel="noopener" title="Open the product page">${esc(k)}</a>`;
  const body = st.tab === 'products' ? list.slice(0, 200).map(r => `<tr><td class="mono">${shop(r.k)}</td><td>${esc(r.name)}</td><td>${chip(r.dept)}</td><td class="n">${r.units}</td><td class="n">${r.cartons}</td><td class="n">${r.consols.length}</td><td>${r.consols.slice(0, 6).map(id => sq(landed[id])).join('')}</td></tr>`).join('')
    : st.tab === 'depts' ? list.map(r => `<tr><td>${chip(r.dept)} <small class="cs-dim">${esc(r.dept)}</small></td><td class="n">${r.cartons}</td><td class="n">${r.units}</td><td class="n">${r.keycodes}</td><td class="n">${r.consols}</td><td><span class="mfx-pct"><i style="width:${r.pct}%"></i></span> ${r.pct}%</td></tr>`).join('')
    : list.slice(0, 120).map(c => {
      const open = !!st.expanded[c.id] || (st.q && list.length <= 3), items = c.items || [];
      return `<tr class="mfx-c" data-act="toggle" data-id="${esc(c.id)}"><td>${sq(c.state)}</td><td class="mono" title="Consolidation ${esc(c.cons || '')}">${esc(c.id)}</td><td>${(c.mix || []).slice(0, 4).map(x => chip(x[0])).join('')}</td><td class="n">${c.cartons}</td><td class="n">${c.units}</td><td class="n">${c.keycodes}</td></tr>` +
        (open ? `<tr class="mfx-items"><td></td><td colspan="5">${items.slice(0, 40).map(it => `<div class="mfc-it${st.q && String(it.k).startsWith(st.q.trim()) ? ' hit' : ''}"><span class="kc">${shop(it.k)}</span><span class="nm">${esc(nameOf(it.k) || it.d || '')}</span>${it.dept ? chip(it.dept) : ''}<span class="ct">~${Math.round(itemCartons(c, it) * 10) / 10} ctn · ${it.q} units</span></div>`).join('')}${items.length > 40 ? `<div class="cs-dim">${items.length - 40} more lines</div>` : ''}</td></tr>` : '');
    }).join('');
  const more = st.tab === 'products' && list.length > 200 ? `${list.length - 200} more products: search to narrow` : st.tab === 'consols' && list.length > 120 ? `${list.length - 120} more consols: search to narrow` : '';
  const stat = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  return `<div class="card mfd mfx"><div class="mfd-h"><span class="mfd-t">${ic('packages')}<b>${esc(doc.manNo)}</b>${e ? `<span class="status ${STATUS[e.status][1]}">${STATUS[e.status][0]}</span>` : ''}</span><span class="mfd-facts"><span>despatch <b>${esc(doc.despatch || '—')}</b></span><span>DC <b>${esc(doc.dcNo || '—')}</b></span>${attachedTo ? `<span>Truck <b>${esc(truckNo(attachedTo))}</b> · ${nLanded}/${doc.consols.length} landed</span>` : ''}</span></div>` +
    `<div class="ps-facts mfx-stats">${stat('Consols', doc.consols.length)}${stat('Cartons', cartons.toLocaleString())}${stat('Keycodes', keycodes.toLocaleString())}${stat('Units', allUnits.toLocaleString())}${stat('Est. work', `${Math.floor(work / 60)}h ${String(work % 60).padStart(2, '0')}m`)}</div>` + roll +
    `<div class="mfd-acts">${attachedTo ? `<span class="status good">On Truck ${esc(truckNo(attachedTo))}</span>` : trucks.length ? `<select class="ad-in" data-field="truck">${trucks.map(t => `<option value="${esc(t.id)}">Truck ${esc(truckNo(t.id))} · ${esc(t.status)}</option>`).join('')}</select><button class="btn primary sm" data-act="attach">${ic('truck')}Attach to truck</button>` : '<span class="cs-dim">No truck on the board to attach to</span>'}<button class="btn sm" data-act="remove" style="margin-left:auto">${ic('trash')}Remove</button></div>` +
    `<div class="mfx-bar"><div class="seg">${[['consols', 'Consols'], ['products', 'Products'], ['depts', 'Departments']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div><div class="search">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="find consol, keycode, product, dept…" aria-label="Search this manifest"></div><span class="mfd-hit">${list.length} ${st.tab === 'depts' ? 'departments' : st.tab}</span></div>` +
    `<div class="mfx-legend">${['landed', 'active', 'done', 'carried', 'none'].map(s => `${sq(s)}${SQ_NAME[s]}`).join('')}</div>` +
    `<div class="mfx-scroll"><table class="mfx-t"><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="cs-dim">Nothing matches.</td></tr>`}</tbody></table></div>${more ? `<div class="cs-dim" style="margin-top:8px">${more}</div>` : ''}</div>`;
}

function detail(ctx, list) {
  if (!st.open) return `<div class="card mfd"><div class="ch"><h3>Pick a manifest</h3></div><p class="lbl">Open one from the list to explore its consols, products and departments, or publish today's report.</p></div>`;
  if (st.error) return `<div class="card mfd"><div class="ch"><h3>${esc(st.open)}</h3></div><p class="lbl">${esc(st.error)}</p></div>`;
  const doc = st.docFor === st.open ? st.doc : null;
  if (!doc) return `<div class="card mfd"><div class="ch"><h3>${esc(st.open)}</h3></div><div class="ohint">Loading the report…</div></div>`;
  return explorer(ctx, list.find(x => x.manNo === st.open), doc);
}

export default {
  id: 'manifests', title: 'Manifests', icon: 'm-manifests', area: 'backdock',
  desktop(ctx) {
    const list = entries(ctx);
    if (st.open && !list.some(x => x.manNo === st.open)) st.open = null;
    if (!st.open && list.length) st.open = list[0].manNo;
    const head = vh('Manifests', sub('Manifest explorer', `${list.length} manifest${list.length === 1 ? '' : 's'}`, 'by week'), `<label class="btn primary" style="cursor:pointer"><input type="file" accept=".xls,.xlsx,.csv" data-field="file" style="display:none">${ic('file')}Publish a manifest</label>`, 'm-manifests');
    let wk = null;
    const rowsHtml = list.map(x => {
      const w = x.day ? mondayOf(x.day) : '', hd = w !== wk ? `<div class="pt3 mfx-wk">${w ? `Week of ${esc(fmtDate(w))} · ${retailPeriod(w)}` : 'Undated'}</div>` : ''; wk = w;
      const [label, cls] = STATUS[x.status];
      return hd + `<div class="mfl-row${x.manNo === st.open ? ' on' : ''}" data-act="open" data-man="${esc(x.manNo)}"><span class="mfl-main"><span class="mfl-top"><b>${esc(x.manNo)}</b><span class="status ${cls}">${label}</span></span><small>${x.day ? esc(fmtDate(x.day)) : ''}${x.truck ? ` · Truck ${esc(truckNo(x.truck))}` : ''}${x.despatch ? ` · despatch ${esc(x.despatch)}` : ''}</small></span><span class="mfl-facts"><span><b>${x.totalCartons ?? '–'}</b> ctn · <b>${x.consols ?? '–'}</b> consols</span><span class="cs-dim">${x.publishedAt ? ago(x.publishedAt) : ''}</span></span>${ic('chev')}</div>`;
    }).join('');
    const side = `<div class="card mfl">${list.length ? rowsHtml : `<div class="ohint">Nothing published yet. Publish today's DC Manifest Report (the .xls from the email) and the dock can verify pallets against it.</div>`}</div>`;
    return head + `<div class="mgrid">${side}${detail(ctx, list)}</div>`;
  },
  mobile() { return mhead('Manifests', 'Desktop only') + `<div class="mv-result">${ic('lock')}<b style="font-size:22px">Managed on the desktop</b><span>Manifests arrive by email and are published on the desktop. On the dock phone, Search on the truck finds a consol or an item.</span></div>`; },
  mount(ctx, root) {
    const load = () => {
      if (!st.open || st.docFor === st.open) return;
      st.docFor = st.open; st.doc = null; st.error = null; st.q = ''; st.expanded = {}; st.group = null;
      ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(st.open)}`).then(doc => { st.doc = doc; ctx.rerender(); }).catch(e => { st.error = e.status === 404 ? 'This report has left the library; only its history row remains.' : e.message; ctx.rerender(); });
    };
    load();
    const doc = st.docFor === st.open ? st.doc : null;
    // Names for what is on screen: the products tab's first rows, or the opened consols.
    if (doc && st.tab !== 'depts') { const want = new Set(); for (const c of doc.consols) if (st.tab === 'products' || st.expanded[c.id]) for (const it of (c.items || []).slice(0, 40)) { if (want.size >= 200) break; want.add(it.k); } if (want.size) ensureNames(ctx, [...want], () => ctx.rerender()); }
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'open') { st.open = a.dataset.man; ctx.rerender(); }
        else if (act === 'toggle') { st.expanded[a.dataset.id] = !st.expanded[a.dataset.id]; ctx.rerender(); }
        else if (act === 'tab') { st.tab = a.dataset.tab; st.sort = null; ctx.rerender(); }
        else if (act === 'sort') { if (st.sort === a.dataset.k) st.dir = -st.dir; else { st.sort = a.dataset.k; st.dir = -1; } ctx.rerender(); }
        else if (act === 'group') { st.group = st.group === a.dataset.g ? null : a.dataset.g; ctx.rerender(); }
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
    let typing = null;
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; clearTimeout(typing); typing = setTimeout(() => { const v = st.q; ctx.rerender(); const i = document.querySelector('#content [data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 180); } });
    return [ctx.store.on('dock', () => ctx.rerender()), ctx.store.on('plan', () => ctx.rerender())];
  },
};
