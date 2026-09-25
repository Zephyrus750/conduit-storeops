// Receiving history: every truck the dock has finalised. The list newest
// first with its facts, then one truck opened: where the time went
// (active decanting against halts by reason), how it compares with the
// window, the manifest reconciliation (what never landed, what landed
// off-manifest) and the crew credit per device. Ported from Decant
// Visualiser's history over the reducer's history rows; the worker's
// /export/receiving route gives the CSV.

import { ic, esc, vh, sub, toast, dep, mhead, mrows, fmtDate } from '../../ui.js';
import { HALT_NAME, truckNo, fmtHM, microDept } from './common.js';

const st = { open: null, q: '' };
const WINDOW_DAYS = 21;
const hm = m => { m = Math.max(0, Math.round(m || 0)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
const HALT_COLOUR = { hcage: '#7C3AED', nostock: '#DC2626', equip: '#2563EB', safety: '#F59E0B', waiting: '#0891B2', other: '#64748B' };
const dchip = d => { const dd = microDept(d) || String(d || '').toLowerCase(); return dd ? dep(dd) : '<span class="dep" style="background:#64748B">?</span>'; };
const avg = (rows, f) => rows.length ? rows.reduce((n, r) => n + (f(r) || 0), 0) / rows.length : 0;

function model(ctx) {
  const all = (ctx.store.get('dock').history || []).slice().reverse();
  const q = st.q.trim().toLowerCase();
  const rows = q ? all.filter(r => r.id.includes(q) || (r.manifest?.manNo || '').toLowerCase().includes(q) || (r.manifest?.dcNo || '').toLowerCase().includes(q)) : all;
  const since = Date.now() - WINDOW_DAYS * 86400000;
  const win = all.filter(r => Date.parse(r.clearedAt || r.date) >= since);
  const open = rows.find(r => r.id === st.open) || rows[0] || null;
  return { all, rows, win, open };
}

function detail(r, win) {
  const active = Math.max(0, r.clearMins - r.haltMins), total = Math.max(1, r.clearMins);
  const audit = r.audit, pct = audit && audit.total ? Math.round(audit.matched / audit.total * 100) : null;
  const cmp = (v, a, fmt, better) => { if (!win.length || !a) return ''; const d = v - a; if (!d) return '<i class="cs-dim">on average</i>'; const good = better === 'low' ? d < 0 : d > 0; return `<i class="${good ? 'c-green' : 'c-red'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</i>`; };
  const halts = (r.downtime || []).slice().sort((a, b) => b.mins - a.mins);
  return `<div class="card"><div class="ch">${ic('truck')}<h3>${esc(fmtDate(r.date))} · Truck ${esc(truckNo(r.id))}</h3><span class="status good" style="margin-left:auto">decanted</span></div>` +
    `<div class="facts6"><div class="f6"><b>${r.cartons}</b><span>cartons decanted</span></div><div class="f6"><b>${r.pallets}<small> / ${r.palletsLanded}</small></b><span>pallets done of landed</span></div><div class="f6"><b>${hm(r.clearMins)}</b><span>landed to cleared</span></div><div class="f6"><b>${r.teamRate}</b><span>ctn/hr team rate</span></div><div class="f6"><b>${r.manifest?.dcNo ? 'DC ' + esc(r.manifest.dcNo) : '—'}</b><span>${r.manifest?.despatch ? 'despatched ' + esc(r.manifest.despatch) : 'no manifest attached'}</span></div><div class="f6"><b>${fmtHM(r.landedAt)}</b><span>landed · cleared ${fmtHM(r.clearedAt)}</span></div></div>` +
    `<div class="k rh-k">Where the time went · ${hm(r.clearMins)}</div>` +
    `<div class="tl"><i style="width:${Math.round(active / total * 100)}%;background:#16A34A" title="Active decanting ${hm(active)}"></i>${halts.map(h => `<i style="width:${Math.round(h.mins / total * 100)}%;background:${HALT_COLOUR[h.reason] || '#64748B'}" title="${esc(HALT_NAME[h.reason] || h.reason)} ${hm(h.mins)}"></i>`).join('')}</div>` +
    `<div class="tlk"><span><i style="background:#16A34A"></i>Active decanting <b>${hm(active)}</b></span>${halts.map(h => `<span><i style="background:${HALT_COLOUR[h.reason] || '#64748B'}"></i>${esc(HALT_NAME[h.reason] || h.reason)} (${h.count}) <b>${hm(h.mins)}</b></span>`).join('')}${!halts.length ? '<span class="cs-dim">No halts</span>' : ''}</div>` +
    (r.carriedIn || r.carriedOut ? `<div class="chips" style="margin-top:8px">${r.carriedIn ? `<span class="chip">Carried in${r.carriedIn.from ? ` from T${esc(truckNo(r.carriedIn.from))}` : ''} · ${r.carriedIn.pallets} pallet${r.carriedIn.pallets === 1 ? '' : 's'} · ${r.carriedIn.cartons} ctn</span>` : ''}${r.carriedOut ? `<span class="chip">Carried out${r.carriedOut.to ? ` to T${esc(truckNo(r.carriedOut.to))}` : ' · held for the next truck'} · ${r.carriedOut.pallets} pallet${r.carriedOut.pallets === 1 ? '' : 's'} · ${r.carriedOut.cartons} ctn</span>` : ''}</div>` : '') +
    `<div class="cmp"><span class="cmp-t">Against the ${WINDOW_DAYS}-day window · ${win.length} truck${win.length === 1 ? '' : 's'}</span><span>Clear time <b>${hm(r.clearMins)}</b> vs avg ${hm(avg(win, x => x.clearMins))} ${cmp(r.clearMins, avg(win, x => x.clearMins), hm, 'low')}</span><span>Team rate <b>${r.teamRate}</b> vs avg ${Math.round(avg(win, x => x.teamRate))} ${cmp(r.teamRate, avg(win, x => x.teamRate), v => Math.round(v) + ' ctn/hr', 'high')}</span><span>Halts <b>${r.haltCount}</b> vs avg ${avg(win, x => x.haltCount).toFixed(1)}</span><span>Cartons <b>${r.cartons}</b> vs avg ${Math.round(avg(win, x => x.cartons))}${win.length > 1 && r.cartons >= Math.max(...win.map(x => x.cartons)) ? ' <i class="c-green">largest truck</i>' : ''}</span></div></div>` +
    `<div class="rh2"><div class="card"><div class="ch">${ic('packages')}<h3>Manifest reconciliation</h3></div>` +
    (audit ? `<div class="facts6" style="grid-template-columns:repeat(2,1fr)"><div class="f6"><b class="c-green">${audit.matched}</b><span>consols matched</span></div><div class="f6"><b class="${audit.missing ? 'c-red' : ''}">${audit.missing}</b><span>missing from the dock</span></div><div class="f6"><b>${audit.total}</b><span>on manifest ${esc(r.manifest.manNo)}</span></div><div class="f6"><b class="${audit.extra ? 'c-amber' : ''}">${audit.extra}</b><span>off-manifest · held for review</span></div></div><div class="prog"><div class="track"><i style="width:${pct}%;background:#16A34A"></i></div><b>${pct}%</b></div>` +
      `<div class="audit">${(audit.missingIds || []).map(m => `<div class="au-row miss"><span class="au-tag">Missing</span><span class="au-id">${esc(m.id)}</span>${dchip(m.dept)}<span class="cs-dim">${m.cartons} ctn · never landed · raise with DC</span></div>`).join('')}${(audit.extraIds || []).map(x => `<div class="au-row held"><span class="au-tag">Off-manifest</span><span class="au-id">${esc(x.id)}</span><span class="cs-dim">landed ${esc(x.bay)} · not on ${esc(r.manifest.manNo)} · held</span></div>`).join('')}${!audit.missing && !audit.extra ? '<div class="cs-dim" style="padding:8px 2px">Every consolidation on the manifest landed and nothing else did.</div>' : ''}</div>` +
      `<div class="acts2" style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" data-view="manifests">${ic('packages')}Open manifest</button></div>` : '<p class="lbl">No manifest was attached to this truck, so there is nothing to reconcile. Attach the DC report at Receiving next time and the dock verifies every pallet as it lands.</p>') + '</div>' +
    `<div class="card"><div class="ch">${ic('users')}<h3>Crew credit</h3></div>${r.perPerson?.length ? `<table class="rhtab"><tr><th>D-number</th><th class="n">Cartons</th><th class="n">Pallets</th><th class="n">Rate</th></tr>${r.perPerson.slice().sort((a, b) => b.cartons - a.cartons).map(c => `<tr><td>${esc(c.pid)}<small class="cs-dim rh-sm">${esc((c.bays || []).join(' '))}</small></td><td class="n">${c.cartons}</td><td class="n">${c.pallets}</td><td class="n">${c.rate} ctn/hr<small class="cs-dim rh-sm">${hm(c.mins)} on pallets</small></td></tr>`).join('')}</table>` : '<p class="lbl">No pallet was started on a device, so there is no credit to give.</p>'}<p class="lbl" style="margin-top:8px">D-numbers, never names, in the archive. Pallets shared between devices split their cartons evenly.</p></div></div>` +
    (r.byDept?.length ? `<div class="card"><div class="ch">${ic('layers')}<h3>By department</h3><span class="cs-dim">from the manifest</span></div><table class="rhtab"><tr><th>Department</th><th class="n">Cartons</th><th class="n">Pallets</th></tr>${r.byDept.map(d => `<tr><td>${dchip(d.dept)} ${esc(d.dept)}</td><td class="n">${d.cartons}</td><td class="n">${d.pallets}</td></tr>`).join('')}</table></div>` : '');
}

export default {
  id: 'rhistory', title: 'Receiving history', icon: 'm-rhistory', area: 'backdock',
  desktop(ctx) {
    const m = model(ctx), o = m.open;
    const cartons = m.win.reduce((n, r) => n + r.cartons, 0);
    const head = vh('Receiving history', sub(`${m.win.length} truck${m.win.length === 1 ? '' : 's'} · ${WINDOW_DAYS}-day window`, `${cartons.toLocaleString()} cartons decanted`, 'newest first'), `<button class="btn" data-act="export">${ic('file')}Export CSV</button>`, 'm-rhistory');
    const list = m.rows.slice(0, 60).map(r => `<div class="li${o === r ? ' sel' : ''}" data-act="open" data-id="${esc(r.id)}"><span class="d">${esc(fmtDate(r.date))}<small>Truck ${esc(truckNo(r.id))}${r.manifest ? ' · ' + esc(r.manifest.manNo) : ''}</small></span><span class="facts"><b>${r.cartons}</b> cartons · <b>${r.pallets}</b>/${r.palletsLanded} pallets · <b>${hm(r.clearMins)}</b> · <b>${r.teamRate}</b> ctn/hr<div class="chips2">${r.manifest?.dcNo ? `<span class="status">DC ${esc(r.manifest.dcNo)}</span>` : ''}${r.manifest?.despatch ? `<span class="status">despatch ${esc(r.manifest.despatch)}</span>` : ''}${r.haltCount ? `<span class="status warn">${r.haltCount} halt${r.haltCount > 1 ? 's' : ''}</span>` : ''}${r.audit ? (r.audit.missing || r.audit.extra ? `<span class="status warn">${r.audit.missing + r.audit.extra} suspect</span>` : '<span class="status good">reconciled</span>') : '<span class="status">no manifest</span>'}</div></span></div>`).join('');
    const rates = m.win.slice().reverse(), max = Math.max(1, ...rates.map(r => r.teamRate));
    return head + `<div class="rh"><div class="card rhlist"><div class="ch"><h3>Decanted trucks</h3><div class="search rh-find">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="Truck day, manifest or DC…" aria-label="Find a truck"></div></div>` +
      (list ? `<div class="list">${list}</div>${m.rows.length > 60 ? `<div class="cs-dim" style="padding:8px 0">Showing 60 of ${m.rows.length}</div>` : ''}` : `<div class="ohint">${m.all.length ? 'Nothing matches.' : 'No truck has been finalised yet. Finalise a truck at Receiving and its record lands here.'}</div>`) +
      (rates.length > 1 ? `<div class="k rh-k">Team rate · cartons per hour</div><div class="rhbars">${rates.map((r, i) => `<div class="${i === rates.length - 1 ? 'hi' : ''}" style="height:${Math.max(4, Math.round(r.teamRate / max * 100))}%" title="${esc(fmtDate(r.date))} Truck ${esc(truckNo(r.id))}"><span>${r.teamRate}</span></div>`).join('')}</div><div class="lbl" style="margin-top:20px">Oldest → newest across the ${WINDOW_DAYS}-day window.</div>` : '') + '</div>' +
      `<div class="sidecol">${o ? detail(o, m.win) : `<div class="card"><div class="ch"><h3>Pick a truck</h3></div><p class="lbl">Open one from the list to see where its time went, the manifest reconciliation and the crew credit.</p></div>`}</div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx), recent = m.all.slice(0, 8);
    return mhead('Receiving history', `${m.win.length} trucks · ${WINDOW_DAYS} days`) + (recent.length ? mrows(recent.map(r => [`${esc(fmtDate(r.date))} T${esc(truckNo(r.id))}`, `${r.cartons} ctn · ${r.pallets} pallets · ${r.teamRate} ctn/hr`, hm(r.clearMins), r.audit && (r.audit.missing || r.audit.extra) ? 'warn' : 'ok'])) : `<div class="mv-note">${ic('truck')}No truck finalised yet.</div>`) + `<div class="mv-note">${ic('lock')}Where the time went, the reconciliation and the crew credit live on the desktop.</div>`;
  },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'open') { st.open = a.dataset.id; ctx.rerender(); }
      else if (a.dataset.act === 'export') {
        a.disabled = true;
        try { const text = await ctx.api(`/v1/store/${ctx.storeNo}/export/receiving`, { text: true }); const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const l = document.createElement('a'); l.href = url; l.download = `receiving-${ctx.storeNo}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('CSV downloaded'); }
        catch (err) { toast(err.message, 'bad'); }
        a.disabled = false;
      }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};
