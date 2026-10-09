// Planner: the week ahead. Which trucks land on which day, their ETA, the
// team and a pre-staged manifest. A slot pre-stages truck YYYY-MM-DD-Tn;
// when Receiving starts that truck the reducer consumes the slot's team
// and manifest. Ported from Vector's backdock-planner to the showcase's
// week grid with a side editor.

import { $, ic, esc, vh, sub, toast, mhead, fmtDate } from '../../ui.js';
import { attachConsols } from '../../../shared/manifest.js';
import { manifestIndex, truckNo, who, dnumId, progress, fmtMins } from './common.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const st = { week: 0, sel: null, busy: false };
const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function weekDays(off) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; }); }
const cartonsOf = m => (m?.consols || []).reduce((n, c) => n + (Number(c.cartons) || 0), 0);
// The manifest's keycodes (distinct item lines) and units (by the mix, else the lines), as DV's planner card.
const keycodesOf = m => { const set = new Set(), cs = m?.consols || []; let lines = 0; for (const c of cs) for (const it of c.items || []) { lines++; if (it.k) set.add(it.k); } return set.size || lines; };
const unitsOf = m => (m?.consols || []).reduce((n, c) => n + ((c.mix || []).reduce((k, x) => k + (Number(x[2]) || 0), 0) || (c.items || []).reduce((k, it) => k + (Number(it.q) || 0), 0)), 0);
const abbr = n => n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
const metrics = m => `${(m.consols || []).length} consols · ${abbr(cartonsOf(m))}c · ${abbr(keycodesOf(m))} keycodes · ${abbr(unitsOf(m))} units`;
const truckOf = (dock, date, n) => dock.trucks[`${date}-T${n}`] || (dock.history || []).find(h => h.id === `${date}-T${n}`) && { status: 'closed' } || null;
// Truck numbers with a slot planned or a truck created (a created truck consumes its slot).
const numbersOf = (plan, dock, date) => [...new Set([...Object.keys(plan.days[date]?.slots || {}).map(Number), ...Object.keys(dock.trucks).filter(id => id.startsWith(date + '-T')).map(id => Number(truckNo(id))), ...(dock.history || []).filter(h => h.id.startsWith(date + '-T')).map(h => Number(truckNo(h.id)))])].filter(n => n >= 1 && n <= 4).sort((a, b) => a - b);
const stl = t => t?.status === 'live' ? 'live' : t?.status === 'closed' ? 'done' : t ? 'staged' : '';

function slotHtml(ctx, date, n, slot, dock) {
  const id = `${date}-${n}`, on = st.sel === id, t = truckOf(dock, date, n);
  slot = slot || {};
  const man = t?.manifest ? `<div class="prow">${ic('file')}<div><b>${esc(t.manifest.manNo)}</b><span>${metrics(t.manifest)} · on the truck</span></div></div>` : slot.manifest ? `<div class="prow">${ic('file')}<div><b>${esc(slot.manifest.manNo)}</b><span>${metrics(slot.manifest)}</span></div></div>` : `<div class="prow miss">${ic('file')}<div><b>No manifest yet</b><span>comes the night before</span></div></div>`;
  const hist = t?.status === 'closed' ? (dock.history || []).find(h => h.id === `${date}-T${n}`) : null, pr = t?.status === 'live' ? progress({ id: `${date}-T${n}`, ...dock.trucks[`${date}-T${n}`] }) : null;
  const trk = t ? `<div class="prow">${ic('truck')}<div><b>${t.status === 'live' ? `Decanting · ${pr?.pct ?? 0}%` : t.status === 'closed' ? `Decant cleared${hist?.clearMins ? ' · ' + fmtMins(hist.clearMins) : ''}` : 'Created'}</b><span>${t.status === 'live' ? `${pr?.done ?? 0} / ${pr?.total ?? 0} ctn · live at Receiving` : t.status === 'closed' ? `${hist ? `${hist.cartons} ctn · ${hist.teamRate || 0} ctn/h` : 'in History'}` : 'staged'}</span></div></div>` : `<div class="prow">${ic('truck')}<div><b>${slot.eta ? 'ETA ' + esc(slot.eta) : 'No ETA'}</b><span>goes live when a pallet lands</span></div></div>`;
  const crew = t?.team?.length ? t.team : slot.team || [];
  const team = crew.length ? `<div class="prow">${ic('users')}<div><b>${crew.length} on decant</b><div class="dk-team">${crew.map(m => `<span class="dk-tc${m.start && slot.eta && m.start > slot.eta ? ' late' : ''}" title="${esc(m.start ? 'starts ' + m.start : 'starts with the truck')}${m.finish ? ' · finishes ' + esc(m.finish) : ''}"><span class="av">${esc(who(m))}</span>${m.start && m.start !== slot.eta ? `<small>${esc(m.start)}</small>` : ''}</span>`).join('')}</div></div></div>` : `<div class="prow miss">${ic('users')}<div><b>No team yet</b><span>pick devices</span></div></div>`;
  return `<div class="pslot${on ? ' on' : ''}${stl(t) ? ' ' + stl(t) : ''}" data-act="sel" data-slot="${id}"><div class="pslot-h"><b>Truck ${n}</b>${t ? `<span class="tst ${esc(t.status)}">${esc(t.status)}</span>` : `<span class="eta">${ic('clock')}${esc(slot.eta || '—')}</span>`}</div>${man}${trk}${team}${slot.huddleMins || slot.breakMins ? `<div class="prow">${ic('clock')}<div><span>${slot.huddleMins ? `huddle ${slot.huddleMins}m booked` : ''}${slot.huddleMins && slot.breakMins ? ' · ' : ''}${slot.breakMins ? `team break ${slot.breakMins}m` : ''}</span></div></div>` : ''}${slot.note ? `<div class="prow note">${ic('edit')}<div><span>${esc(slot.note)}</span></div></div>` : ''}</div>`;
}
function editor(ctx, plan, dock) {
  if (!st.sel) return `<div class="card"><div class="ch"><h3>Pick a truck</h3></div><p class="lbl">Click a slot to set its ETA, manifest and decant team, or + Truck on a day to plan one.</p></div>`;
  const [date, n] = [st.sel.slice(0, 10), Number(st.sel.slice(11))], slot = plan.days[date]?.slots?.[n] || { eta: '', note: '', team: [], manifest: null }, t = truckOf(dock, date, n);
  const d = new Date(date + 'T00:00:00'), idx = manifestIndex(dock);
  if (t) return `<div class="card pedit"><div class="ch"><h3>Truck ${n} · ${DOW[(d.getDay() + 6) % 7]} ${d.getDate()} ${MON[d.getMonth()]}</h3><span class="tst ${esc(t.status)}">${esc(t.status)}</span></div><p class="lbl">${t.status === 'closed' ? 'This truck has been decanted and finalised. Its record is in Receiving history.' : 'This truck is on the dock board; its team and manifest are managed at Receiving now.'}</p><div class="pf-acts"><button class="btn primary" data-view="${t.status === 'closed' ? 'rhistory' : 'receiving'}">${ic(t.status === 'closed' ? 'm-rhistory' : 'truck')}Open at ${t.status === 'closed' ? 'History' : 'Receiving'}</button></div></div>`;
  const free = idx.filter(m => !m.truck && !usedManifests(plan).has(m.manNo) || m.manNo === slot.manifest?.manNo);
  return `<div class="card pedit"><div class="ch"><h3>Truck ${n} · ${DOW[(d.getDay() + 6) % 7]} ${d.getDate()} ${MON[d.getMonth()]}</h3>${t ? `<span class="tst ${esc(t.status)}">${esc(t.status)}</span>` : ''}</div>` +
    `<div class="pf"><label>ETA</label><input class="inp" data-field="eta" value="${esc(slot.eta || '')}" placeholder="06:30" maxlength="5"><span class="cs-dim">24h · the dock board sorts by it</span></div>` +
    `<div class="pf"><label>Manifest</label>${slot.manifest ? `<div class="pman">${ic('file')}<div><b>${esc(slot.manifest.manNo)}</b><span>${(slot.manifest.consols || []).length} consols · ${cartonsOf(slot.manifest)} cartons</span></div><button class="btn sm" data-act="unstage">Remove</button></div>` : ''}<div class="pman"><select class="inp" data-field="man"><option value="">${free.length ? 'Choose a published manifest…' : 'Nothing free in the library'}</option>${free.filter(m => m.manNo !== slot.manifest?.manNo).map(m => `<option value="${esc(m.manNo)}">${esc(m.manNo)} · ${m.consols} consols · ${m.totalCartons}c${m.despatch ? ' · ' + esc(m.despatch) : ''}</option>`).join('')}</select><button class="btn sm primary" data-act="stage">Stage</button></div></div>` +
    `<div class="pf"><label>Decant team</label><div class="dk-team">${(slot.team || []).map(m => `<span class="dk-tc on"><span class="av">${esc(who(m))}</span><button class="dk-x" data-act="team-drop" data-pid="${esc(m.pid)}" title="Remove">${ic('x')}</button></span>`).join('')}<span class="dk-tc add"><input class="inp" data-field="team" placeholder="D4" maxlength="6" autocapitalize="characters" style="width:70px"><button class="ibtn sm" data-act="team-add" title="Add">${ic('plus')}</button></span></div><span class="cs-dim">D-numbers only: no names are kept on the dock.</span></div>` +
    `<div class="pf"><label>Huddle · break</label><span class="pf-pair"><input class="inp mono" data-field="huddle" type="number" min="0" max="120" value="${slot.huddleMins || ''}" placeholder="0"><span class="cs-dim">min huddle</span><input class="inp mono" data-field="break" type="number" min="0" max="120" value="${slot.breakMins || ''}" placeholder="0"><span class="cs-dim">min team break</span></span><span class="cs-dim">The huddle is booked at the decant start and stops the clock; the break is the plan’s allowance.</span></div>` +
    ((slot.team || []).length ? `<div class="pf"><label>Times</label><div class="pf-times">${(slot.team || []).map(m => `<div class="pf-time"><b>${esc(who(m))}</b><input type="time" class="inp" data-mtime="start" data-pid="${esc(m.pid)}" value="${esc(m.start || '')}" title="Start (empty follows the ETA)"><input type="time" class="inp" data-mtime="finish" data-pid="${esc(m.pid)}" value="${esc(m.finish || '')}" title="Finish"></div>`).join('')}</div><span class="cs-dim">Empty start follows the ETA. Finish times keep auto-balance within each shift.</span></div>` : '') +
    `<div class="pf"><label>Note</label><input class="inp" data-field="note" value="${esc(slot.note || '')}" placeholder="Anything the dock should know" maxlength="200"></div>` +
    `<div class="pf-acts"><button class="btn primary" data-act="save">${ic('check')}Save</button><button class="btn" data-act="remove">Remove truck</button></div></div>`;
}
function usedManifests(plan) { const s = new Set(); for (const day of Object.values(plan.days || {})) for (const sl of Object.values(day.slots || {})) if (sl.manifest?.manNo) s.add(sl.manifest.manNo); return s; }
function waiting(ctx, plan, dock) {
  const used = usedManifests(plan), list = manifestIndex(dock).filter(m => !m.truck && !used.has(m.manNo));
  return `<div class="card"><div class="ch"><h3>Manifests without a slot</h3><span class="cs-dim">${list.length}</span></div>${list.length ? `<div class="list">${list.map(m => `<div class="li"><span class="loc">${esc(m.manNo)}</span><span class="nm">${m.consols} consols · ${m.totalCartons} cartons${m.despatch ? ' · despatch ' + esc(m.despatch) : ''}</span><button class="btn sm" data-act="stage-next" data-man="${esc(m.manNo)}">Stage → next free</button></div>`).join('')}</div>` : `<p class="lbl">Every published manifest has a truck.</p>`}<p class="lbl">Manifests arrive the night before. Staging one here means the truck knows what is coming the moment it lands.</p></div>`;
}
function nextFree(plan, dock) {
  for (let off = 0; off < 14; off++) { const d = new Date(); d.setDate(d.getDate() + off); const k = dkey(d); for (let n = 1; n <= 4; n++) if (!plan.days[k]?.slots?.[n] && !truckOf(dock, k, n)) return { date: k, n }; }
  return null;
}
export default {
  id: 'planner', title: 'Planner', icon: 'm-planner', area: 'backdock',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) {
    const plan = ctx.store.get('plan'), dock = ctx.store.get('dock'), days = weekDays(st.week), today = dkey(new Date());
    const count = days.reduce((n, d) => n + numbersOf(plan, dock, dkey(d)).length, 0), todayN = numbersOf(plan, dock, today).length;
    const range = `${days[0].getDate()} ${MON[days[0].getMonth()]} – ${days[6].getDate()} ${MON[days[6].getMonth()]}`;
    const week = `<div class="pweek">${days.map(d => { const k = dkey(d), slots = plan.days[k]?.slots || {}, ns = numbersOf(plan, dock, k); let next = 1; while (ns.includes(next)) next++; return `<div class="pday${k === today ? ' today' : ''}"><div class="dl">${DOW[(d.getDay() + 6) % 7]}<b>${d.getDate()}</b>${ns.length ? `<span class="cs-dim">${ns.length} truck${ns.length > 1 ? 's' : ''}</span>` : ''}</div>${ns.length ? ns.map(n => slotHtml(ctx, k, n, slots[n], dock)).join('') : `<div class="pempty">No trucks</div>`}${next <= 4 ? `<div class="padd" data-act="add" data-slot="${k}-${next}">+ Truck ${next}</div>` : ''}</div>`; }).join('')}</div>`;
    return vh('Planner', sub(st.week === 0 ? 'This week' : st.week === 1 ? 'Next week' : st.week === -1 ? 'Last week' : `${st.week > 0 ? '+' : ''}${st.week} weeks`, range, `${count} truck${count === 1 ? '' : 's'}${st.week === 0 ? ` · ${todayN} today` : ''}`), `<span class="pills"><button data-act="wk" data-d="-1">‹</button><button class="${st.week === 0 ? 'on' : ''}" data-act="wk" data-d="0">This week</button><button data-act="wk" data-d="1">›</button></span>`, 'm-planner') +
      `<div class="grid2 pgrid">${week}<div class="sidecol">${editor(ctx, plan, dock)}${summary(plan, dock, days)}${roster(dock)}${waiting(ctx, plan, dock)}</div></div>`;
  },
  mount(ctx, root) {
    const field = n => root.querySelector(`[data-field="${n}"]`)?.value ?? '';
    const set = (date, slot, payload) => ctx.store.dispatch({ type: 'plan.set', entity: { date, slot }, payload });
    const cur = () => { const plan = ctx.store.get('plan'); const date = st.sel.slice(0, 10), n = Number(st.sel.slice(11)); return { date, n, slot: plan.days[date]?.slots?.[n] || { eta: null, note: '', team: [], manifest: null } }; };
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'wk') { const d = Number(a.dataset.d); st.week = d === 0 ? 0 : st.week + d; ctx.rerender(); }
        else if (act === 'sel') { st.sel = a.dataset.slot; ctx.rerender(); }
        else if (act === 'add') { st.sel = a.dataset.slot; const { date, n } = cur(); await set(date, n, { eta: null, note: '' }); }
        else if (act === 'save') { const { date, n } = cur(); const eta = field('eta').trim(); if (eta && !/^\d{2}:\d{2}$/.test(eta)) return toast('Enter a time like 06:30', 'bad'); const hu = field('huddle'), br = field('break'); await set(date, n, { eta: eta || null, note: field('note'), huddleMins: hu === '' ? null : Number(hu), breakMins: br === '' ? null : Number(br) }); toast('Saved'); }
        else if (act === 'remove') { const { date, n } = cur(); if (!confirm(`Remove Truck ${n} from ${fmtDate(date)}?`)) return; await ctx.store.dispatch({ type: 'plan.remove', entity: { date, slot: n } }); st.sel = null; }
        else if (act === 'team-add') { const v = field('team').trim(); if (!v) return; const { date, n, slot } = cur(); const pid = dnumId(v); if (!pid) return toast('Enter a D-number, like D4. Names are not kept.', 'bad'); if ((slot.team || []).some(x => x.pid === pid)) return; await set(date, n, { team: [...(slot.team || []), { pid }] }); }
        else if (act === 'team-drop') { const { date, n, slot } = cur(); await set(date, n, { team: (slot.team || []).filter(x => x.pid !== a.dataset.pid) }); }
        else if (act === 'stage' || act === 'stage-next') {
          let date, n, manNo;
          if (act === 'stage') { ({ date, n } = cur()); manNo = field('man'); if (!manNo) return toast('Choose a manifest first', 'bad'); }
          else { const nf = nextFree(ctx.store.get('plan'), ctx.store.get('dock')); if (!nf) return toast('No free slot in the next two weeks', 'bad'); date = nf.date; n = nf.n; manNo = a.dataset.man; st.sel = `${date}-${n}`; }
          a.disabled = true;
          const doc = await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(manNo)}`);
          await set(date, n, { manifest: { manNo: doc.manNo, dcNo: doc.dcNo || '', despatch: doc.despatch || '', consols: attachConsols(doc), attachedAt: new Date().toISOString() } });
          toast(`${manNo} staged to Truck ${n} on ${fmtDate(date)}`);
        }
        else if (act === 'roster-add') { const pid = dnumId(field('roster').trim()); if (!pid) return toast('Enter a D-number, like D4. Names are not kept.', 'bad'); const cur0 = ctx.store.get('dock').roster?.pids || []; if (cur0.includes(pid)) return; await ctx.store.dispatch({ type: 'dock.roster', entity: {}, payload: { pids: [...cur0, pid] } }); }
        else if (act === 'roster-drop') { const cur0 = ctx.store.get('dock').roster?.pids || []; await ctx.store.dispatch({ type: 'dock.roster', entity: {}, payload: { pids: cur0.filter(x => x !== a.dataset.pid) } }); }
        else if (act === 'unstage') { const { date, n } = cur(); await set(date, n, { manifest: null }); }
      } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    root.addEventListener('change', async e => {
      const el = e.target; if (!el.dataset?.mtime || !st.sel) return;
      const { date, n, slot } = cur();
      try { await set(date, n, { team: (slot.team || []).map(m => m.pid === el.dataset.pid ? { ...m, [el.dataset.mtime]: el.value || undefined } : m) }); } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.field === 'roster') { e.preventDefault(); root.querySelector('[data-act="roster-add"]')?.click(); } });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.field === 'team') { e.preventDefault(); root.querySelector('[data-act="team-add"]')?.click(); } });
    return [ctx.store.on('plan', () => ctx.rerender()), ctx.store.on('dock', () => ctx.rerender())];
  },
};

// The week at a glance (DV's planner summary): trucks planned, cartons on
// their manifests, trucks cleared (planned or not), average clear time and
// cartons decanted.
function summary(plan, dock, days) {
  const keys = days.map(dkey), slots = keys.flatMap(k => Object.values(plan.days[k]?.slots || {})), live = Object.entries(dock.trucks).filter(([id]) => keys.includes(id.slice(0, 10)));
  const cleared = (dock.history || []).filter(h => keys.includes(h.id.slice(0, 10))), avg = cleared.length ? cleared.reduce((n, h) => n + (h.clearMins || 0), 0) / cleared.length : 0;
  const manCtn = slots.reduce((n, sl) => n + cartonsOf(sl.manifest), 0) + live.reduce((n, [, t]) => n + cartonsOf(t.manifest), 0);
  const row = (k, v) => `<div class="row">${k}<b>${v}</b></div>`;
  return `<div class="card kpi"><div class="ch"><h3>This week</h3></div><div class="rows">${row('Trucks planned', slots.length + live.length + cleared.length)}${row('Cartons manifested', manCtn.toLocaleString())}${row('Trucks cleared', cleared.length)}${row('Average clear', cleared.length ? fmtMins(avg) : '—')}${row('Cartons decanted', cleared.reduce((n, h) => n + (h.cartons || 0), 0).toLocaleString())}</div></div>`;
}
// The week's decant roster: new trucks start with these D-numbers when
// their slot names no team.
function roster(dock) {
  const pids = dock.roster?.pids || [];
  return `<div class="card"><div class="ch"><h3>Week roster</h3><span class="cs-dim">${pids.length ? `${pids.length} on` : 'nobody yet'}</span></div><div class="dk-team">${pids.map(pid => `<span class="dk-tc on"><span class="av">${esc(pid)}</span><button class="dk-x" data-act="roster-drop" data-pid="${esc(pid)}" title="Take off the roster">${ic('x')}</button></span>`).join('') || '<span class="cs-dim">Add who is decanting this week.</span>'}</div>` +
    `<div class="bdr-teamadd" style="margin-top:8px"><input class="inp mono" data-field="roster" placeholder="D-number, e.g. D4" maxlength="6"><button class="btn sm" data-act="roster-add">${ic('plus')}Add</button></div><p class="lbl">New trucks start with this crew when their slot names no team. D-numbers only.</p></div>`;
}
