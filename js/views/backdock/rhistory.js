// Receiving history: every truck the dock has finalised. The list newest
// first with its facts, then one truck opened: where the time went
// (active decanting against halts by reason), how it compares with the
// window, the manifest reconciliation (what never landed, what landed
// off-manifest) and the crew credit per device. Ported from Decant
// Visualiser's history over the reducer's history rows; the worker's
// /export/receiving route gives the CSV.

import { ic, esc, vh, sub, toast, dep, mhead, mrows, fmtDate } from '../../ui.js';
import { HALT_NAME, holdName, truckNo, fmtHM, microDept, todayKey, manifestIndex, attachManifest } from './common.js';
import { printAudit } from './audit.js';
import { linkSheet, linkPick, applyLinks, unlinked } from './late.js';
import { ratesFor } from './plan.js';
import { layout } from './wallboard.js';
import { tx, txn } from '../../i18n.js';

const st = { open: null, q: '', late: null };
const WINDOW_DAYS = 21;
const hm = m => { m = Math.max(0, Math.round(m || 0)); return m >= 60 ? tx('{h}h {m}m', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }) : tx('{n}m', { n: m }); };
const HALT_COLOUR = { hcage: '#7C3AED', nostock: '#DC2626', equip: '#2563EB', safety: '#F59E0B', waiting: '#0891B2', other: '#64748B' };
// Planned pauses stop the clock too but are not downtime: shown apart.
const PLANNED = [['huddleMins', tx('Huddles'), '#93C5FD'], ['teamBreakMins', tx('Team breaks'), '#C4B5FD']];
const downColour = h => h.kind === 'transition' ? '#0EA5E9' : HALT_COLOUR[h.reason] || '#64748B';
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

function detail(r, win, truck) {
  const stopped = (r.downtime || []).reduce((n, h) => n + h.mins, 0) + PLANNED.reduce((n, [k]) => n + (r[k] || 0), 0);
  const active = Math.max(0, r.clearMins - stopped), total = Math.max(1, r.clearMins);
  const audit = r.audit, pct = audit && audit.total ? Math.round(audit.matched / audit.total * 100) : null;
  const cmp = (v, a, fmt, better) => { if (!win.length || !a) return ''; const d = v - a; if (!d) return `<i class="cs-dim">${tx('on average')}</i>`; const good = better === 'low' ? d < 0 : d > 0; return `<i class="${good ? 'c-green' : 'c-red'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</i>`; };
  const halts = (r.downtime || []).slice().sort((a, b) => b.mins - a.mins);
  return `<div class="card"><div class="ch">${ic('truck')}<h3>${esc(fmtDate(r.date))} · ${tx('Truck {no}', { no: esc(truckNo(r.id)) })}</h3><span class="status good" style="margin-left:auto">${tx('decanted')}</span>${truck ? `<button class="btn sm" data-act="audit">${ic('print')}${tx('Audit')}</button>` : ''}</div>` +
    `<div class="facts6"><div class="f6"><b>${r.cartons}</b><span>${tx('cartons decanted')}</span></div><div class="f6"><b>${r.pallets}<small> / ${r.palletsLanded}</small></b><span>${tx('pallets done of landed')}</span></div><div class="f6"><b>${hm(r.clearMins)}</b><span>${r.decantStartAt ? tx('decant start to the last pallet') : tx('landed to the last pallet')}</span></div><div class="f6"><b>${r.teamRate}</b><span>${tx('ctn/hr team rate')}</span></div><div class="f6"><b>${r.manifest?.dcNo ? tx('DC {no}', { no: esc(r.manifest.dcNo) }) : r.manifest ? esc(r.manifest.manNo) : '—'}</b><span>${r.manifest?.despatch ? tx('despatched {date}', { date: esc(r.manifest.despatch) }) : r.manifest ? tx('manifest · no DC details') : tx('no manifest attached')}</span></div><div class="f6"><b>${fmtHM(r.landedAt)}</b><span>${tx('landed · cleared {time}', { time: fmtHM(r.clearedAt) })}</span></div></div>` +
    `<div class="k rh-k">${tx('Where the time went · {time}', { time: hm(r.clearMins) })}</div>` +
    `<div class="tl"><i style="width:${Math.round(active / total * 100)}%;background:#16A34A" title="${tx('Active decanting {time}', { time: hm(active) })}"></i>${halts.map(h => `<i style="width:${Math.round(h.mins / total * 100)}%;background:${downColour(h)}" title="${esc(holdName(h))} ${hm(h.mins)}"></i>`).join('')}${PLANNED.filter(([k]) => r[k]).map(([k, l, c]) => `<i style="width:${Math.round(r[k] / total * 100)}%;background:${c}" title="${l} ${hm(r[k])}"></i>`).join('')}</div>` +
    `<div class="tlk"><span><i style="background:#16A34A"></i>${tx('Active decanting <b>{time}</b>', { time: hm(active) })}</span>${halts.map(h => `<span><i style="background:${downColour(h)}"></i>${esc(holdName(h))} (${h.count}) <b>${hm(h.mins)}</b></span>`).join('')}${!halts.length ? `<span class="cs-dim">${tx('No downtime')}</span>` : ''}</div>` +
    (PLANNED.some(([k]) => r[k]) || r.breakMins ? `<div class="tlk rh-planned"><span class="cs-dim">${tx('Planned pauses, not downtime:')}</span>${PLANNED.filter(([k]) => r[k]).map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} <b>${hm(r[k])}</b></span>`).join('')}${r.breakMins ? `<span>${tx('Personal breaks <b>{time}</b>', { time: hm(r.breakMins) })}</span>` : ''}</div>` : '') +
    (r.suspect ? `<div class="chips" style="margin-top:8px"><span class="chip warn">${txn(r.suspect, '{n} pallet done too fast for its size: not credited', '{n} pallets done too fast for their size: not credited')}</span></div>` : '') +
    (r.carriedIn || r.carriedOut ? `<div class="chips" style="margin-top:8px">${r.carriedIn ? `<span class="chip">${r.carriedIn.from ? tx('Carried in from T{no}', { no: esc(truckNo(r.carriedIn.from)) }) : tx('Carried in')} · ${txn(r.carriedIn.pallets, '{n} pallet', '{n} pallets')} · ${tx('{n} ctn', { n: r.carriedIn.cartons })}</span>` : ''}${r.carriedOut ? `<span class="chip">${r.carriedOut.to ? tx('Carried out to T{no}', { no: esc(truckNo(r.carriedOut.to)) }) : tx('Carried out · held for the next truck')} · ${txn(r.carriedOut.pallets, '{n} pallet', '{n} pallets')} · ${tx('{n} ctn', { n: r.carriedOut.cartons })}</span>` : ''}</div>` : '') +
    `<div class="cmp"><span class="cmp-t">${tx('Against the {days}-day window', { days: WINDOW_DAYS })} · ${txn(win.length, '{n} truck', '{n} trucks')}</span><span>${tx('Clear time <b>{time}</b> vs avg {avg}', { time: hm(r.clearMins), avg: hm(avg(win, x => x.clearMins)) })} ${cmp(r.clearMins, avg(win, x => x.clearMins), hm, 'low')}</span><span>${tx('Team rate <b>{n}</b> vs avg {avg}', { n: r.teamRate, avg: Math.round(avg(win, x => x.teamRate)) })} ${cmp(r.teamRate, avg(win, x => x.teamRate), v => tx('{n} ctn/hr', { n: Math.round(v) }), 'high')}</span><span>${tx('Halts <b>{n}</b> vs avg {avg}', { n: r.haltCount, avg: avg(win, x => x.haltCount).toFixed(1) })}</span><span>${tx('Cartons <b>{n}</b> vs avg {avg}', { n: r.cartons, avg: Math.round(avg(win, x => x.cartons)) })}${win.length > 1 && r.cartons >= Math.max(...win.map(x => x.cartons)) ? ` <i class="c-green">${tx('largest truck')}</i>` : ''}</span></div></div>` +
    `<div class="rh2"><div class="card"><div class="ch">${ic('packages')}<h3>${tx('Manifest reconciliation')}</h3></div>` +
    (audit ? `<div class="facts6" style="grid-template-columns:repeat(2,1fr)"><div class="f6"><b class="c-green">${audit.matched}</b><span>${tx('consols matched')}</span></div><div class="f6"><b class="${audit.missing ? 'c-red' : ''}">${audit.missing}</b><span>${tx('missing from the dock')}</span></div><div class="f6"><b>${audit.total}</b><span>${tx('on manifest {man}', { man: esc(r.manifest.manNo) })}</span></div><div class="f6"><b class="${audit.extra ? 'c-amber' : ''}">${audit.extra}</b><span>${tx('off-manifest · held for review')}</span></div></div><div class="prog"><div class="track"><i style="width:${pct}%;background:#16A34A"></i></div><b>${pct}%</b></div>` +
      `<div class="audit">${(audit.missingIds || []).map(m => `<div class="au-row miss"><span class="au-tag">${tx('Missing')}</span><span class="au-id">${esc(m.id)}</span>${dchip(m.dept)}<span class="cs-dim">${tx('{n} ctn · never landed · raise with DC', { n: m.cartons })}</span></div>`).join('')}${(audit.extraIds || []).map(x => `<div class="au-row held"><span class="au-tag">${tx('Off-manifest')}</span><span class="au-id">${esc(x.id)}</span><span class="cs-dim">${tx('landed {bay} · not on {man} · held', { bay: esc(x.bay), man: esc(r.manifest.manNo) })}</span></div>`).join('')}${!audit.missing && !audit.extra ? `<div class="cs-dim" style="padding:8px 2px">${tx('Every consolidation on the manifest landed and nothing else did.')}</div>` : ''}</div>` +
      `<div class="acts2" style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" data-view="manifests">${ic('packages')}${tx('Open manifest')}</button></div>` : `<p class="lbl">${tx('No manifest was attached to this truck, so there is nothing to reconcile. Attach the DC report at Receiving next time and the dock verifies every pallet as it lands.')}</p>`) + '</div>' +
    `<div class="card"><div class="ch">${ic('users')}<h3>${tx('Crew credit')}</h3></div>${r.perPerson?.length ? `<table class="rhtab"><tr><th>${tx('D-number')}</th><th class="n">${tx('Cartons')}</th><th class="n">${tx('Pallets')}</th><th class="n">${tx('Rate')}</th><th class="n">${tx('vs est')}</th></tr>${r.perPerson.slice().sort((a, b) => b.cartons - a.cartons).map(c => `<tr><td>${esc(c.pid)}<small class="cs-dim rh-sm">${esc((c.bays || []).join(' '))}</small></td><td class="n">${c.cartons}</td><td class="n">${c.pallets}</td><td class="n">${tx('{n} ctn/hr', { n: c.rate })}<small class="cs-dim rh-sm">${tx('{time} on pallets', { time: hm(c.mins) })}</small></td><td class="n">${c.deltaPct == null ? '—' : `<span class="${c.deltaPct > 15 ? 'c-red' : c.deltaPct < -15 ? 'c-green' : ''}">${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}%</span>`}</td></tr>`).join('')}</table>` : `<p class="lbl">${tx('No pallet was started on a device, so there is no credit to give.')}</p>`}<p class="lbl" style="margin-top:8px">${tx("D-numbers, never names, in the archive. A shared pallet's cartons are split by time worked; a pallet done too fast for its size credits nobody.")}</p></div></div>` +
    (r.byDept?.length ? `<div class="card"><div class="ch">${ic('layers')}<h3>${tx('By department')}</h3><span class="cs-dim">${tx('from the manifest')}</span></div><table class="rhtab"><tr><th>${tx('Department')}</th><th class="n">${tx('Cartons')}</th><th class="n">${tx('Pallets')}</th></tr>${r.byDept.map(d => `<tr><td>${dchip(d.dept)} ${esc(d.dept)}</td><td class="n">${d.cartons}</td><td class="n">${d.pallets}</td></tr>`).join('')}</table></div>` : '');
}

export default {
  id: 'rhistory', title: tx('Receiving history'), icon: 'm-rhistory', area: 'backdock',
  desktop(ctx) {
    const m = model(ctx), o = m.open;
    const cartons = m.win.reduce((n, r) => n + r.cartons, 0);
    const head = vh(tx('Receiving history'), sub(`${txn(m.win.length, '{n} truck', '{n} trucks')} · ${tx('{days}-day window', { days: WINDOW_DAYS })}`, tx('{n} cartons decanted', { n: cartons.toLocaleString() }), tx('newest first')), `<button class="btn" data-act="export">${ic('file')}${tx('Export CSV')}</button>`, 'm-rhistory');
    const list = m.rows.slice(0, 60).map(r => `<div class="li${o === r ? ' sel' : ''}" data-act="open" data-id="${esc(r.id)}"><span class="d">${esc(fmtDate(r.date))}<small>${tx('Truck {no}', { no: esc(truckNo(r.id)) })}${r.manifest ? ' · ' + esc(r.manifest.manNo) : ''}</small></span><span class="facts">${tx('<b>{n}</b> cartons', { n: r.cartons })} · ${tx('<b>{done}</b>/{total} pallets', { done: r.pallets, total: r.palletsLanded })} · <b>${hm(r.clearMins)}</b> · ${tx('<b>{n}</b> ctn/hr', { n: r.teamRate })}<div class="chips2">${r.manifest?.dcNo ? `<span class="status">${tx('DC {no}', { no: esc(r.manifest.dcNo) })}</span>` : ''}${r.manifest?.despatch ? `<span class="status">${tx('despatch {date}', { date: esc(r.manifest.despatch) })}</span>` : ''}${r.haltCount ? `<span class="status warn">${txn(r.haltCount, '{n} halt', '{n} halts')}</span>` : ''}${r.audit ? (r.audit.missing || r.audit.extra ? `<span class="status warn">${tx('{n} suspect', { n: r.audit.missing + r.audit.extra })}</span>` : `<span class="status good">${tx('reconciled')}</span>`) : `<span class="status">${tx('no manifest')}</span>`}</div></span></div>`).join('');
    const rates = m.win.slice().reverse(), max = Math.max(1, ...rates.map(r => r.teamRate));
    return head + `<div class="rh"><div class="card rhlist"><div class="ch"><h3>${tx('Decanted trucks')}</h3><div class="search rh-find">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="${tx('Truck day, manifest or DC…')}" aria-label="${tx('Find a truck')}"></div></div>` +
      (list ? `<div class="list">${list}</div>${m.rows.length > 60 ? `<div class="cs-dim" style="padding:8px 0">${tx('Showing {shown} of {total}', { shown: 60, total: m.rows.length })}</div>` : ''}` : `<div class="ohint">${m.all.length ? tx('Nothing matches.') : tx('No truck has been finalised yet. Finalise a truck at Receiving and its record lands here.')}</div>`) +
      (rates.length > 1 ? `<div class="k rh-k">${tx('Team rate · cartons per hour')}</div><div class="rhbars">${rates.map((r, i) => `<div class="${i === rates.length - 1 ? 'hi' : ''}" style="height:${Math.max(4, Math.round(r.teamRate / max * 100))}%" title="${esc(fmtDate(r.date))} ${tx('Truck {no}', { no: esc(truckNo(r.id)) })}"><span>${r.teamRate}</span></div>`).join('')}</div><div class="lbl" style="margin-top:20px">${tx('Oldest → newest across the {days}-day window.', { days: WINDOW_DAYS })}</div>` : '') + '</div>' +
      `<div class="sidecol">${o ? lateBar(ctx, o) + detail(o, m.win, ctx.store.get('dock').trucks?.[o.id]) + pastLayout(ctx, o) : `<div class="card"><div class="ch"><h3>${tx('Pick a truck')}</h3></div><p class="lbl">${tx('Open one from the list to see where its time went, the manifest reconciliation and the crew credit.')}</p></div>`}</div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx), recent = m.all.slice(0, 8);
    return mhead(tx('Receiving history'), txn(m.win.length, '{n} truck · {days} days', '{n} trucks · {days} days', { days: WINDOW_DAYS })) + (recent.length ? mrows(recent.map(r => [`${esc(fmtDate(r.date))} T${esc(truckNo(r.id))}`, tx('{cartons} ctn · {pallets} pallets · {rate} ctn/hr', { cartons: r.cartons, pallets: r.pallets, rate: r.teamRate }), hm(r.clearMins), r.audit && (r.audit.missing || r.audit.extra) ? 'warn' : 'ok'])) : `<div class="mv-note">${ic('truck')}${tx('No truck finalised yet.')}</div>`);
  },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'open') { st.open = a.dataset.id; ctx.rerender(); }
      else if (a.dataset.act === 'audit') { const o = model(ctx).open, dock = ctx.store.get('dock'), t = o && dock.trucks?.[o.id]; if (t) printAudit({ id: o.id, ...t }, dock); }
      else if (a.dataset.act === 'late-attach') { st.late = st.late === 'attach' ? null : 'attach'; ctx.rerender(); }
      else if (a.dataset.act === 'late-link' || a.dataset.act === 'll-close') { st.late = a.dataset.act === 'll-close' ? null : 'link'; ctx.rerender(); }
      else if (a.dataset.act === 'late-man') { try { await attachManifest(ctx, a.dataset.truck, a.dataset.man); toast(tx('{man} attached to Truck {no} · history rebuilt', { man: a.dataset.man, no: truckNo(a.dataset.truck) })); st.late = 'link'; } catch (err) { toast(err.message, 'bad'); } }
      else if (a.dataset.act === 'll-apply') { const o = model(ctx).open, dock = ctx.store.get('dock'), t = dock.trucks?.[o.id]; try { await applyLinks(ctx, { id: o.id, ...t }, ratesFor(dock)); st.late = null; } catch (err) { toast(err.message, 'bad'); } }
      else if (a.dataset.act === 'reopen') {
        const id = a.dataset.id; if (!confirm(tx("Reopen Truck {no}? It goes back to live and its history row + rate credit are removed until it's closed again.", { no: truckNo(id) }))) return;
        try { await ctx.store.dispatch({ type: 'truck.reopen', entity: { truck: id } }); toast(tx('Truck {no} is live again', { no: truckNo(id) })); st.open = null; ctx.go('receiving'); } catch (err) { toast(err.message, 'bad'); }
      }
      else if (a.dataset.act === 'export') {
        a.disabled = true;
        try { const text = await ctx.api(`/v1/store/${ctx.storeNo}/export/receiving`, { text: true }); const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const l = document.createElement('a'); l.href = url; l.download = `receiving-${ctx.storeNo}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast(tx('CSV downloaded')); }
        catch (err) { toast(err.message, 'bad'); }
        a.disabled = false;
      }
    });
    root.addEventListener('change', e => { if (e.target.dataset.ll != null) linkPick(e.target.dataset.ll, e.target.value); });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    return [ctx.store.on('dock', () => ctx.rerender())];
  },
};

// A late manifest on a truck finalised today: a manager can still attach
// the DC report and link the pallets that landed without one (DV's review
// chips); the history row is rebuilt with the reconciliation.
function lateBar(ctx, r) {
  const dock = ctx.store.get('dock'), t = dock.trucks?.[r.id], manager = (ctx.session.current?.roles || []).includes('manager') || ctx.session.current?.owner;
  if (!t || r.date !== todayKey() || !manager) return '';
  const tt = { id: r.id, ...t }, n = t.manifest ? unlinked(tt).length : 0;
  if (!t.manifest || n || st.late) {
    const chips = `<div class="card late-bar"><div class="ch"><h3>${tx('Late manifest')}</h3><span class="cs-dim">${tx('same day · manager')}</span></div><div class="acts2" style="display:flex;gap:8px;flex-wrap:wrap">${!t.manifest ? `<button class="btn sm primary" data-act="late-attach">${tx('Attach manifest')}</button>` : ''}${t.manifest && n ? `<button class="btn sm primary" data-act="late-link">${txn(n, 'Link {n} pallet', 'Link {n} pallets')}</button>` : ''}</div></div>`;
    const pick = st.late === 'attach' ? `<div class="card"><div class="ch"><h3>${tx('Pick the manifest for Truck {no}', { no: esc(truckNo(r.id)) })}</h3></div><div class="list">${manifestIndex(dock).filter(x => !x.truck).map(x => `<div class="li"><span class="loc">${esc(x.manNo)}</span><span class="nm">${tx('{consols} consols · {cartons} cartons', { consols: x.consols, cartons: x.totalCartons })}${x.despatch ? ' · ' + tx('despatch {date}', { date: esc(x.despatch) }) : ''}</span><button class="btn sm primary" data-act="late-man" data-man="${esc(x.manNo)}" data-truck="${esc(r.id)}">${tx('Attach')}</button></div>`).join('') || `<p class="lbl">${tx('No unattached manifest in the library. Publish today’s report from Manifests first.')}</p>`}</div></div>` : '';
    return chips + pick + (st.late === 'link' && t.manifest ? linkSheet(tt, ratesFor(dock)) : '');
  }
  return '';
}

// The dock as this truck left it (kept while the truck is on record), and
// for a manager the way back: reopen it.
function pastLayout(ctx, r) {
  const dock = ctx.store.get('dock'), t = dock.trucks?.[r.id], manager = (ctx.session.current?.roles || []).includes('manager') || ctx.session.current?.owner;
  if (!t) return '';
  const blocked = Object.keys(dock.trucks).some(k => k !== r.id && dock.trucks[k].status !== 'closed');
  return layout({ id: r.id, ...t }) + (manager ? `<div class="card"><div class="ch"><h3>${tx('Reopen')}</h3></div><p class="lbl">${blocked ? tx('Another truck is on the dock: finalise it first, then this one can be reopened.') : tx('Back to live to fix a missed pallet or time. The history row and its rate credit come off until it is finalised again.')}</p><button class="btn sm" data-act="reopen" data-id="${esc(r.id)}"${blocked ? ' disabled' : ''}>${ic('refresh')}${tx('Reopen Truck {no}', { no: esc(truckNo(r.id)) })}</button></div>` : '');
}
