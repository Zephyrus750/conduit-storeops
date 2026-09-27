// Planner: the week ahead. Which trucks land on which day, their ETA, the
// team and a pre-staged manifest. A slot pre-stages truck YYYY-MM-DD-Tn;
// when Receiving starts that truck the reducer consumes the slot's team
// and manifest. Ported from Vector's backdock-planner to the showcase's
// week grid with a side editor.

import { $, ic, esc, vh, sub, toast, mhead, fmtDate } from '../../ui.js';
import { attachConsols } from '../../../shared/manifest.js';
import { manifestIndex, truckNo, who, dnumId } from './common.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const st = { week: 0, sel: null, busy: false };
const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function weekDays(off) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; }); }
const cartonsOf = m => (m?.consols || []).reduce((n, c) => n + (Number(c.cartons) || 0), 0);
const truckOf = (dock, date, n) => dock.trucks[`${date}-T${n}`] || (dock.history || []).find(h => h.id === `${date}-T${n}`) && { status: 'closed' } || null;
// Truck numbers with a slot planned or a truck created (a created truck consumes its slot).
const numbersOf = (plan, dock, date) => [...new Set([...Object.keys(plan.days[date]?.slots || {}).map(Number), ...Object.keys(dock.trucks).filter(id => id.startsWith(date + '-T')).map(id => Number(truckNo(id))), ...(dock.history || []).filter(h => h.id.startsWith(date + '-T')).map(h => Number(truckNo(h.id)))])].filter(n => n >= 1 && n <= 4).sort((a, b) => a - b);
const stl = t => t?.status === 'live' ? 'live' : t?.status === 'closed' ? 'done' : t ? 'staged' : '';

function slotHtml(ctx, date, n, slot, dock) {
  const id = `${date}-${n}`, on = st.sel === id, t = truckOf(dock, date, n);
  slot = slot || {};
  const man = t?.manifest ? `<div class="prow">${ic('file')}<div><b>${esc(t.manifest.manNo)}</b><span>${(t.manifest.consols || []).length} consols · ${cartonsOf(t.manifest)}c · on the truck</span></div></div>` : slot.manifest ? `<div class="prow">${ic('file')}<div><b>${esc(slot.manifest.manNo)}</b><span>${(slot.manifest.consols || []).length} consols · ${cartonsOf(slot.manifest)}c</span></div></div>` : `<div class="prow miss">${ic('file')}<div><b>No manifest yet</b><span>comes the night before</span></div></div>`;
  const trk = t ? `<div class="prow">${ic('truck')}<div><b>${t.status === 'live' ? 'On the dock' : t.status === 'closed' ? 'Decanted' : 'Created'}</b><span>${t.status === 'live' ? 'live at Receiving' : t.status === 'closed' ? 'in History' : 'staged'}</span></div></div>` : `<div class="prow">${ic('truck')}<div><b>${slot.eta ? 'ETA ' + esc(slot.eta) : 'No ETA'}</b><span>goes live when a pallet lands</span></div></div>`;
  const crew = t?.team?.length ? t.team : slot.team || [];
  const team = crew.length ? `<div class="prow">${ic('users')}<div><b>${crew.length} on decant</b><div class="dk-team">${crew.map(m => `<span class="dk-tc"><span class="av">${esc(who(m))}</span></span>`).join('')}</div></div></div>` : `<div class="prow miss">${ic('users')}<div><b>No team yet</b><span>pick devices</span></div></div>`;
  return `<div class="pslot${on ? ' on' : ''}${stl(t) ? ' ' + stl(t) : ''}" data-act="sel" data-slot="${id}"><div class="pslot-h"><b>Truck ${n}</b>${t ? `<span class="tst ${esc(t.status)}">${esc(t.status)}</span>` : `<span class="eta">${ic('clock')}${esc(slot.eta || '—')}</span>`}</div>${man}${trk}${team}${slot.note ? `<div class="prow note">${ic('edit')}<div><span>${esc(slot.note)}</span></div></div>` : ''}</div>`;
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
  desktop(ctx) {
    const plan = ctx.store.get('plan'), dock = ctx.store.get('dock'), days = weekDays(st.week), today = dkey(new Date());
    const count = days.reduce((n, d) => n + numbersOf(plan, dock, dkey(d)).length, 0), todayN = numbersOf(plan, dock, today).length;
    const range = `${days[0].getDate()} ${MON[days[0].getMonth()]} – ${days[6].getDate()} ${MON[days[6].getMonth()]}`;
    const week = `<div class="pweek">${days.map(d => { const k = dkey(d), slots = plan.days[k]?.slots || {}, ns = numbersOf(plan, dock, k); let next = 1; while (ns.includes(next)) next++; return `<div class="pday${k === today ? ' today' : ''}"><div class="dl">${DOW[(d.getDay() + 6) % 7]}<b>${d.getDate()}</b>${ns.length ? `<span class="cs-dim">${ns.length} truck${ns.length > 1 ? 's' : ''}</span>` : ''}</div>${ns.length ? ns.map(n => slotHtml(ctx, k, n, slots[n], dock)).join('') : `<div class="pempty">No trucks</div>`}${next <= 4 ? `<div class="padd" data-act="add" data-slot="${k}-${next}">+ Truck ${next}</div>` : ''}</div>`; }).join('')}</div>`;
    return vh('Planner', sub(st.week === 0 ? 'This week' : st.week === 1 ? 'Next week' : st.week === -1 ? 'Last week' : `${st.week > 0 ? '+' : ''}${st.week} weeks`, range, `${count} truck${count === 1 ? '' : 's'}${st.week === 0 ? ` · ${todayN} today` : ''}`), `<span class="pills"><button data-act="wk" data-d="-1">‹</button><button class="${st.week === 0 ? 'on' : ''}" data-act="wk" data-d="0">This week</button><button data-act="wk" data-d="1">›</button></span>`, 'm-planner') +
      `<div class="grid2 pgrid">${week}<div class="sidecol">${editor(ctx, plan, dock)}${waiting(ctx, plan, dock)}</div></div>`;
  },
  mobile() { return mhead('Planner', 'Desktop only') + `<div class="mv-result">${ic('lock')}<b style="font-size:22px">Managed on the desktop</b><span>The week is planned on the desktop. The dock phone sees each truck when it lands.</span></div>`; },
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
        else if (act === 'save') { const { date, n } = cur(); const eta = field('eta').trim(); if (eta && !/^\d{2}:\d{2}$/.test(eta)) return toast('Enter a time like 06:30', 'bad'); await set(date, n, { eta: eta || null, note: field('note') }); toast('Saved'); }
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
        else if (act === 'unstage') { const { date, n } = cur(); await set(date, n, { manifest: null }); }
      } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.field === 'team') { e.preventDefault(); root.querySelector('[data-act="team-add"]')?.click(); } });
    return [ctx.store.on('plan', () => ctx.rerender()), ctx.store.on('dock', () => ctx.rerender())];
  },
};
