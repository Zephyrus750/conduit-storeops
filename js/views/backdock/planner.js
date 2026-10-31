// Planner: the week ahead. Which trucks land on which day, their ETA, the
// team and a pre-staged manifest. A slot pre-stages truck YYYY-MM-DD-Tn;
// when Receiving starts that truck the reducer consumes the slot's team
// and manifest. Ported from Vector's backdock-planner to the showcase's
// week grid with a side editor.

import { $, ic, esc, vh, sub, toast, mhead, fmtDate, today as storeToday } from '../../ui.js';
import { manifestIndex, truckNo, who, dnumId, progress, fmtMins, fmtHM, slotRef, attachManifest } from './common.js';
import { tx, txn } from '../../i18n.js';
import { truckPhase, phaseCounts } from '../../../shared/dockphase.js';
import { phaseChip } from './phase.js';

const DOW = [tx('Mon'), tx('Tue'), tx('Wed'), tx('Thu'), tx('Fri'), tx('Sat'), tx('Sun')], MON = [tx('Jan'), tx('Feb'), tx('Mar'), tx('Apr'), tx('May'), tx('Jun'), tx('Jul'), tx('Aug'), tx('Sep'), tx('Oct'), tx('Nov'), tx('Dec')];
const TRUCK_ST = { staged: tx('staged'), live: tx('live'), closed: tx('closed') };
// "Mon 3 Feb" and "3 Feb", in the device's language and order.
const dayLabel = (d, dow = DOW[(d.getDay() + 6) % 7]) => tx('{dow} {d} {mon}', { dow, d: d.getDate(), mon: MON[d.getMonth()] });
const dateLabel = d => tx('{d} {mon}', { d: d.getDate(), mon: MON[d.getMonth()] });
const st = { week: 0, sel: null, busy: false, pick: null };
const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function weekDays(off) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; }); }
// A staged reference carries its counts; a truck's (or an older slot's) manifest carries the consols.
const cartonsOf = m => m?.ref ? m.cartons : (m?.consols || []).reduce((n, c) => n + (Number(c.cartons) || 0), 0);
const consolsN = m => m?.ref ? m.n : (m?.consols || []).length;
// The manifest's keycodes (distinct item lines) and units (by the mix, else the lines), as DV's planner card.
const keycodesOf = m => { if (m?.ref) return m.keycodes; const set = new Set(), cs = m?.consols || []; let lines = 0; for (const c of cs) for (const it of c.items || []) { lines++; if (it.k) set.add(it.k); } return set.size || lines; };
const unitsOf = m => m?.ref ? m.units : (m?.consols || []).reduce((n, c) => n + ((c.mix || []).reduce((k, x) => k + (Number(x[2]) || 0), 0) || (c.items || []).reduce((k, it) => k + (Number(it.q) || 0), 0)), 0);
const abbr = n => n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
const metrics = m => tx('{consols} consols · {cartons}c · {keycodes} keycodes · {units} units', { consols: consolsN(m), cartons: abbr(cartonsOf(m)), keycodes: abbr(keycodesOf(m)), units: abbr(unitsOf(m)) });
const truckOf = (dock, date, n) => dock.trucks[`${date}-T${n}`] || (dock.history || []).find(h => h.id === `${date}-T${n}`) && { status: 'closed' } || null;
// Truck numbers with a slot planned or a truck created (a created truck consumes its slot).
const numbersOf = (plan, dock, date) => [...new Set([...Object.keys(plan.days[date]?.slots || {}).map(Number), ...Object.keys(dock.trucks).filter(id => id.startsWith(date + '-T')).map(id => Number(truckNo(id))), ...(dock.history || []).filter(h => h.id.startsWith(date + '-T')).map(h => Number(truckNo(h.id)))])].filter(n => n >= 1 && n <= 4).sort((a, b) => a - b);
const stl = t => t?.status === 'live' ? 'live' : t?.status === 'closed' ? 'done' : t ? 'staged' : '';

// A slot's card (DV's planner card): Manifest, Truck and Decant rows that
// go grey (not yet), amber (under way) and green (done) as the day happens.
function slotHtml(ctx, date, n, slot, dock) {
  const id = `${date}-${n}`, tid = `${date}-T${n}`, on = st.sel === id, t = truckOf(dock, date, n), live = dock.trucks[tid] ? { id: tid, ...dock.trucks[tid] } : null;
  const hist = (dock.history || []).find(h => h.id === tid), past = date < storeToday(), ph = live ? truckPhase(live) : hist ? 'closed' : 'planned';
  slot = slot || {};
  const row = (lvl, icon, b, sub, more = '') => `<div class="prow pr-${lvl}">${ic(icon)}<div><b>${b}</b>${sub ? `<span>${sub}</span>` : ''}${more}</div></div>`;
  const man = live?.manifest ? row(2, 'file', esc(live.manifest.manNo), `${metrics(live.manifest)} · ${tx('on the truck')}`)
    : live?.plannedManifest ? row(1, 'file', esc(live.plannedManifest), tx('attaching from this slot'))
    : hist ? (hist.manifest ? row(2, 'file', esc(hist.manifest.manNo), hist.audit ? tx('{m} of {n} consols matched', { m: hist.audit.matched, n: hist.audit.total + (hist.audit.carriedOut || 0) }) : tx('on the truck')) : row(0, 'file', tx('No manifest'), tx('decanted without one')))
    : live ? row(0, 'file', tx('No manifest'), tx('attach it at Receiving'))
    : slot.manifest ? row(1, 'file', esc(slot.manifest.manNo), `${metrics(slot.manifest)} · ${tx('staged')}`)
    : row(0, 'file', past ? tx('No manifest') : tx('No manifest yet'), past ? '' : tx('comes the night before'));
  const c = live ? phaseCounts(live) : null, landed = live?.landedAt || hist?.landedAt;
  const trk = ph === 'planned' ? row(0, 'truck', slot.eta ? tx('ETA {time}', { time: esc(slot.eta) }) : tx('No ETA'), live ? tx('planned · Start receiving on the dock') : past ? tx('never received') : tx('starts at Receiving when it lands'))
    : ph === 'receiving' || (ph === 'decanting' && !live.receivingConfirmed) ? row(1, 'truck', tx('Receiving · {n} pallets', { n: c.pallets }), tx('landed {time} · layout not confirmed', { time: fmtHM(landed) }))
    : row(2, 'truck', tx('Landed {time}', { time: fmtHM(landed) }), live?.receivedAt ? tx('{n} pallets · layout confirmed {time}', { n: c.pallets, time: fmtHM(live.receivedAt) }) : live ? txn(c.pallets, '{n} pallet', '{n} pallets') : txn(hist.palletsLanded + (hist.carriedOut?.pallets || 0), '{n} pallet', '{n} pallets'));
  const crew = live?.team?.length ? live.team : slot.team || [];
  const chips = crew.length ? `<div class="dk-team">${crew.map(m => `<span class="dk-tc${m.start && slot.eta && m.start > slot.eta ? ' late' : ''}" title="${esc(m.start ? tx('starts {time}', { time: m.start }) : tx('starts with the truck'))}${m.finish ? ' · ' + tx('finishes {time}', { time: esc(m.finish) }) : ''}"><span class="av">${esc(who(m))}</span>${m.start && m.start !== slot.eta ? `<small>${esc(m.start)}</small>` : ''}</span>`).join('')}</div>` : '';
  const pr = live ? progress(live) : null;
  const dec = ph === 'closed' ? row(2, 'users', hist ? tx('Cleared in {time}', { time: fmtMins(hist.clearMins || 0) }) : tx('Decant cleared'), hist ? tx('{cartons} ctn · {rate} ctn/h', { cartons: hist.cartons, rate: hist.teamRate || 0 }) : tx('in History'), chips)
    : ph === 'cleared' ? row(2, 'users', tx('Every pallet done'), tx('close the truck at Receiving'), chips)
    : ph === 'decanting' ? row(1, 'users', tx('Decanting · {pct}%', { pct: pr?.pct ?? 0 }), tx('{done} / {total} ctn', { done: pr?.done ?? 0, total: pr?.total ?? 0 }), chips)
    : crew.length ? row(0, 'users', tx('{n} on decant', { n: crew.length }), ph === 'received' ? tx('Take 5, then start') : '', chips)
    : row(0, 'users', tx('No team yet'), tx('pick devices'));
  return `<div class="pslot${on ? ' on' : ''}${stl(t) ? ' ' + stl(t) : ''}" data-act="sel" data-slot="${id}"><div class="pslot-h"><b>${tx('Truck {no}', { no: n })}</b>${live || hist ? phaseChip(live || { status: 'closed' }) : `<span class="eta">${ic('clock')}${esc(slot.eta || '—')}</span>`}</div>${man}${trk}${dec}${slot.huddleMins || slot.breakMins ? `<div class="prow">${ic('clock')}<div><span>${slot.huddleMins ? tx('huddle {n}m booked', { n: slot.huddleMins }) : ''}${slot.huddleMins && slot.breakMins ? ' · ' : ''}${slot.breakMins ? tx('team break {n}m', { n: slot.breakMins }) : ''}</span></div></div>` : ''}${slot.note ? `<div class="prow note">${ic('edit')}<div><span>${esc(slot.note)}</span></div></div>` : ''}</div>`;
}
function editor(ctx, plan, dock) {
  if (!st.sel) return `<div class="card"><div class="ch"><h3>${tx('Pick a truck')}</h3></div><p class="lbl">${tx('Click a slot to set its ETA, manifest and decant team, or + Truck on a day to plan one.')}</p></div>`;
  const [date, n] = [st.sel.slice(0, 10), Number(st.sel.slice(11))], slot = plan.days[date]?.slots?.[n] || { eta: '', note: '', team: [], manifest: null }, t = truckOf(dock, date, n);
  const d = new Date(date + 'T00:00:00'), idx = manifestIndex(dock);
  // A truck on the dock: its manifest goes straight on the truck (a closed one is History's).
  if (t) {
    const live = t.status !== 'closed', id = `${date}-T${n}`;
    const pick = live && !t.manifest ? `<div class="pf"><label>${tx('Manifest')}</label><div class="pman">${manSelect(idx, plan, dock, null, id)}<button class="btn primary sm" data-act="attach-truck" data-truck="${esc(id)}">${tx('Attach')}</button></div><span class="cs-dim">${tx('Goes on the truck now, as attaching at Receiving does.')}</span></div>` : '';
    const has = t.manifest ? `<div class="pman">${ic('file')}<div><b>${esc(t.manifest.manNo)}</b><span>${tx('{consols} consols · {cartons} cartons · on the truck', { consols: (t.manifest.consols || []).length, cartons: cartonsOf(t.manifest) })}</span></div></div>` : t.plannedManifest ? `<p class="lbl">${tx('Manifest {man} is attaching from this slot.', { man: esc(t.plannedManifest) })}</p>` : '';
    return `<div class="card pedit"><div class="ch"><h3>${tx('Truck {no} · {day}', { no: n, day: dayLabel(d) })}</h3><span class="tst ${esc(t.status)}">${esc(TRUCK_ST[t.status] || t.status)}</span></div><p class="lbl">${live ? tx('This truck is on the dock board; its team is managed at Receiving now.') : tx('This truck has been decanted and finalised. Its record is in Receiving history.')}</p>${has}${pick}<div class="pf-acts"><button class="btn${pick ? '' : ' primary'}" data-view="${live ? 'receiving' : 'rhistory'}">${ic(live ? 'truck' : 'm-rhistory')}${live ? tx('Open at Receiving') : tx('Open at History')}</button></div></div>`;
  }
  return `<div class="card pedit"><div class="ch"><h3>${tx('Truck {no} · {day}', { no: n, day: dayLabel(d) })}</h3>${t ? `<span class="tst ${esc(t.status)}">${esc(TRUCK_ST[t.status] || t.status)}</span>` : ''}</div>` +
    `<div class="pf"><label>${tx('ETA')}</label><input class="inp" data-field="eta" value="${esc(slot.eta || '')}" placeholder="06:30" maxlength="5"><span class="cs-dim">${tx('24h · the dock board sorts by it')}</span></div>` +
    `<div class="pf"><label>${tx('Manifest')}</label>${slot.manifest ? `<div class="pman">${ic('file')}<div><b>${esc(slot.manifest.manNo)}</b><span>${tx('{consols} consols · {cartons} cartons', { consols: consolsN(slot.manifest), cartons: cartonsOf(slot.manifest) })}</span></div><button class="btn sm" data-act="unstage">${tx('Remove')}</button></div>` : ''}<div class="pman">${manSelect(idx, plan, dock, slot.manifest?.manNo)}<button class="btn sm primary" data-act="stage">${tx('Stage')}</button></div></div>` +
    `<div class="pf"><label>${tx('Decant team')}</label><div class="dk-team">${(slot.team || []).map(m => `<span class="dk-tc on"><span class="av">${esc(who(m))}</span><button class="dk-x" data-act="team-drop" data-pid="${esc(m.pid)}" title="${tx('Remove')}">${ic('x')}</button></span>`).join('')}<span class="dk-tc add"><input class="inp" data-field="team" placeholder="D4" maxlength="6" autocapitalize="characters" style="width:70px"><button class="ibtn sm" data-act="team-add" title="${tx('Add')}">${ic('plus')}</button></span></div><span class="cs-dim">${tx('D-numbers only: no names are kept on the dock.')}</span></div>` +
    `<div class="pf"><label>${tx('Huddle · break')}</label><span class="pf-pair"><input class="inp mono" data-field="huddle" type="number" min="0" max="120" value="${slot.huddleMins || ''}" placeholder="0"><span class="cs-dim">${tx('min huddle')}</span><input class="inp mono" data-field="break" type="number" min="0" max="120" value="${slot.breakMins || ''}" placeholder="0"><span class="cs-dim">${tx('min team break')}</span></span><span class="cs-dim">${tx('The huddle is booked at the decant start and stops the clock; the break is the plan’s allowance.')}</span></div>` +
    ((slot.team || []).length ? `<div class="pf"><label>${tx('start and finish::Times')}</label><div class="pf-times">${(slot.team || []).map(m => `<div class="pf-time"><b>${esc(who(m))}</b><input type="time" class="inp" data-mtime="start" data-pid="${esc(m.pid)}" value="${esc(m.start || '')}" title="${tx('Start (empty follows the ETA)')}"><input type="time" class="inp" data-mtime="finish" data-pid="${esc(m.pid)}" value="${esc(m.finish || '')}" title="${tx('Finish')}"></div>`).join('')}</div><span class="cs-dim">${tx('Empty start follows the ETA. Finish times keep auto-balance within each shift.')}</span></div>` : '') +
    `<div class="pf"><label>${tx('Note')}</label><input class="inp" data-field="note" value="${esc(slot.note || '')}" placeholder="${tx('Anything the dock should know')}" maxlength="200"></div>` +
    `<div class="pf-acts"><button class="btn primary" data-act="save">${ic('check')}${tx('Save')}</button><button class="btn" data-act="remove">${tx('Remove truck')}</button></div></div>`;
}
// The library as a picker: unused reports first; then the ones already on a
// truck or staged on a slot, labelled where (a re-run, or one staged to the
// wrong day), so a published report is never hidden.
function manSelect(idx, plan, dock, cur, forTruck) {
  const staged = {}; for (const [date, day] of Object.entries(plan.days || {})) for (const [n, sl] of Object.entries(day.slots || {})) if (sl.manifest?.manNo) staged[sl.manifest.manNo] = `${date}-T${n}`;
  const where = m => m.truck ? (dock.trucks[m.truck] && dock.trucks[m.truck].status !== 'closed' ? tx('on Truck {no} now', { no: truckNo(m.truck) }) : tx('used on Truck {no} · {date}', { no: truckNo(m.truck), date: fmtDate(m.truck.slice(0, 10)) })) : staged[m.manNo] ? tx('staged for Truck {no} · {date}', { no: truckNo(staged[m.manNo]), date: fmtDate(staged[m.manNo].slice(0, 10)) }) : '';
  const list = idx.filter(m => m.manNo !== cur && m.truck !== forTruck), free = list.filter(m => !where(m)), used = list.filter(m => where(m));
  const opt = m => `<option value="${esc(m.manNo)}">${esc(m.manNo)} · ${tx('{consols} consols · {cartons}c', { consols: m.consols, cartons: m.totalCartons })}${m.despatch ? ' · ' + esc(m.despatch) : ''}${where(m) ? ' · ' + esc(where(m)) : ''}</option>`;
  return `<select class="inp" data-field="man"><option value="">${!list.length ? tx('Nothing in the library yet: publish one in Manifests') : free.length ? tx('Choose a published manifest…') : tx('Every report is on a truck or staged: choose one below')}</option>${free.map(opt).join('')}${used.length ? `<optgroup label="${tx('Already on a truck or staged')}">${used.map(opt).join('')}</optgroup>` : ''}</select>`;
}
function usedManifests(plan) { const s = new Set(); for (const day of Object.values(plan.days || {})) for (const sl of Object.values(day.slots || {})) if (sl.manifest?.manNo) s.add(sl.manifest.manNo); return s; }
function waiting(ctx, plan, dock) {
  const used = usedManifests(plan), list = manifestIndex(dock).filter(m => !m.truck && !used.has(m.manNo));
  return `<div class="card"><div class="ch"><h3>${tx('Manifests without a slot')}</h3><span class="cs-dim">${list.length}</span></div>${list.length ? `<div class="list">${list.map(m => `<div class="li"><span class="loc">${esc(m.manNo)}</span><span class="nm">${tx('{consols} consols · {cartons} cartons', { consols: m.consols, cartons: m.totalCartons })}${m.despatch ? ' · ' + tx('despatch {date}', { date: esc(m.despatch) }) : ''}</span><button class="btn sm${st.pick?.man === m.manNo && st.pick.day === 0 ? ' primary' : ''}" data-act="stage-next" data-day="0" data-man="${esc(m.manNo)}" title="${tx("Choose today's truck for it")}">${tx('Today')}</button><button class="btn sm${st.pick?.man === m.manNo && st.pick.day === 1 ? ' primary' : ''}" data-act="stage-next" data-day="1" data-man="${esc(m.manNo)}" title="${tx("Choose tomorrow's truck for it: for a report that came in the day before")}">${tx('Tomorrow')}</button></div>${st.pick?.man === m.manNo ? truckChooser(plan, dock, st.pick) : ''}`).join('')}</div>` : `<p class="lbl">${tx('Every published manifest has a truck.')}</p>`}<p class="lbl">${tx('Manifests arrive the night before. Staging one here means the truck knows what is coming the moment it lands.')}</p></div>`;
}
// Today's or tomorrow's trucks for a waiting report: each says what it holds,
// and the report goes on the one chosen (a truck on the dock without one
// takes it now; a planned slot or a free number stages it).
function truckChooser(plan, dock, pick) {
  const d = new Date(); d.setDate(d.getDate() + pick.day); const date = dkey(d);
  const opt = n => {
    const t = dock.trucks[`${date}-T${n}`], h = (dock.history || []).find(x => x.id === `${date}-T${n}`), sl = plan.days[date]?.slots?.[n];
    if (h || t?.status === 'closed') return `<button class="chip" disabled>${tx('Truck {no}', { no: n })} · ${tx('done')}</button>`;
    if (t) return t.manifest || t.plannedManifest ? `<button class="chip" disabled>${tx('Truck {no}', { no: n })} · ${esc(t.manifest?.manNo || t.plannedManifest)}</button>` : `<button class="chip" data-act="stage-to" data-date="${date}" data-n="${n}">${tx('Truck {no}', { no: n })} · ${tx('on the dock now')}</button>`;
    if (sl?.manifest) return `<button class="chip" disabled>${tx('Truck {no}', { no: n })} · ${esc(sl.manifest.manNo)}</button>`;
    return `<button class="chip" data-act="stage-to" data-date="${date}" data-n="${n}">${tx('Truck {no}', { no: n })} · ${sl ? (sl.eta ? tx('planned {time}', { time: esc(sl.eta) }) : tx('planned')) : tx('new')}</button>`;
  };
  return `<div class="pchoose"><span class="cs-dim">${tx('{man} goes on which truck {day}?', { man: esc(pick.man), day: pick.day ? tx('tomorrow') : tx('today') })}</span><span class="chips">${[1, 2, 3, 4].map(opt).join('')}</span></div>`;
}
export default {
  id: 'planner', title: tx('Planner'), icon: 'm-planner', area: 'backdock',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) {
    const plan = ctx.store.get('plan'), dock = ctx.store.get('dock'), days = weekDays(st.week), today = storeToday();
    const count = days.reduce((n, d) => n + numbersOf(plan, dock, dkey(d)).length, 0), todayN = numbersOf(plan, dock, today).length;
    const range = `${dateLabel(days[0])} – ${dateLabel(days[6])}`;
    const week = `<div class="pweek">${days.map(d => { const k = dkey(d), slots = plan.days[k]?.slots || {}, ns = numbersOf(plan, dock, k); let next = 1; while (ns.includes(next)) next++; return `<div class="pday${k === today ? ' today' : ''}"><div class="dl">${DOW[(d.getDay() + 6) % 7]}<b>${d.getDate()}</b>${ns.length ? `<span class="cs-dim">${txn(ns.length, '{n} truck', '{n} trucks')}</span>` : ''}</div>${ns.length ? ns.map(n => slotHtml(ctx, k, n, slots[n], dock)).join('') : noneHtml(plan, k, today)}${next <= 4 ? `<div class="padd" data-act="add" data-slot="${k}-${next}">+ ${tx('Truck {no}', { no: next })}</div>` : ''}</div>`; }).join('')}</div>`;
    return vh(tx('Planner'), sub(st.week === 0 ? tx('This week') : st.week === 1 ? tx('Next week') : st.week === -1 ? tx('Last week') : tx('{n} weeks', { n: `${st.week > 0 ? '+' : ''}${st.week}` }), range, `${txn(count, '{n} truck', '{n} trucks')}${st.week === 0 ? ` · ${tx('{n} today', { n: todayN })}` : ''}`), `<span class="pills"><button data-act="wk" data-d="-1">‹</button><button class="${st.week === 0 ? 'on' : ''}" data-act="wk" data-d="0">${tx('This week')}</button><button data-act="wk" data-d="1">›</button></span>`, 'm-planner') +
      `<div class="grid2 pgrid">${week}<div class="sidecol">${editor(ctx, plan, dock)}${noTruckCard(plan, dock, days, today)}${summary(plan, dock, days)}${roster(dock)}${waiting(ctx, plan, dock)}</div></div>`;
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
        else if (act === 'save') { const { date, n } = cur(); const eta = field('eta').trim(); if (eta && !/^\d{2}:\d{2}$/.test(eta)) return toast(tx('Enter a time like 06:30'), 'bad'); const hu = field('huddle'), br = field('break'); await set(date, n, { eta: eta || null, note: field('note'), huddleMins: hu === '' ? null : Number(hu), breakMins: br === '' ? null : Number(br) }); toast(tx('Saved')); }
        else if (act === 'remove') { const { date, n } = cur(); if (!confirm(tx('Remove Truck {no} from {date}?', { no: n, date: fmtDate(date) }))) return; await ctx.store.dispatch({ type: 'plan.remove', entity: { date, slot: n } }); st.sel = null; }
        else if (act === 'team-add') { const v = field('team').trim(); if (!v) return; const { date, n, slot } = cur(); const pid = dnumId(v); if (!pid) return toast(tx('Enter a D-number, like D4. Names are not kept.'), 'bad'); if ((slot.team || []).some(x => x.pid === pid)) return; await set(date, n, { team: [...(slot.team || []), { pid }] }); }
        else if (act === 'team-drop') { const { date, n, slot } = cur(); await set(date, n, { team: (slot.team || []).filter(x => x.pid !== a.dataset.pid) }); }
        else if (act === 'stage-to') {
          const { man } = st.pick || {}, date = a.dataset.date, n = Number(a.dataset.n), t = ctx.store.get('dock').trucks[`${date}-T${n}`]; if (!man) return;
          a.disabled = true; st.pick = null; st.sel = `${date}-${n}`;
          if (t) { await attachManifest(ctx, `${date}-T${n}`, man); return toast(tx('{man} attached to Truck {no}, on the dock now', { man, no: n })); }
          const doc = await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(man)}`);
          await set(date, n, { manifest: slotRef(doc) }); toast(tx('{man} staged to Truck {no} on {date}', { man, no: n, date: fmtDate(date) }));
        }
        else if (act === 'stage' || act === 'stage-next') {
          let date, n, manNo;
          if (act === 'stage') { ({ date, n } = cur()); manNo = field('man'); if (!manNo) return toast(tx('Choose a manifest first'), 'bad'); }
          else { st.pick = st.pick?.man === a.dataset.man && st.pick.day === Number(a.dataset.day) ? null : { man: a.dataset.man, day: Number(a.dataset.day) }; return ctx.rerender(); }
          a.disabled = true;
          const doc = await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(manNo)}`);
          await set(date, n, { manifest: slotRef(doc) });
          toast(tx('{man} staged to Truck {no} on {date}', { man: manNo, no: n, date: fmtDate(date) }));
        }
        else if (act === 'roster-add') { const pid = dnumId(field('roster').trim()); if (!pid) return toast(tx('Enter a D-number, like D4. Names are not kept.'), 'bad'); const cur0 = ctx.store.get('dock').roster?.pids || []; if (cur0.includes(pid)) return; await ctx.store.dispatch({ type: 'dock.roster', entity: {}, payload: { pids: [...cur0, pid] } }); }
        else if (act === 'roster-drop') { const cur0 = ctx.store.get('dock').roster?.pids || []; await ctx.store.dispatch({ type: 'dock.roster', entity: {}, payload: { pids: cur0.filter(x => x !== a.dataset.pid) } }); }
        else if (act === 'notrucks' || act === 'notrucks-off') { const on = act === 'notrucks'; await ctx.store.dispatch({ type: 'plan.noTrucks', entity: { date: a.dataset.date }, payload: { on } }); toast(on ? tx('{date}: no trucks, confirmed', { date: fmtDate(a.dataset.date) }) : tx('{date}: no-trucks mark cleared', { date: fmtDate(a.dataset.date) })); }
        else if (act === 'attach-truck') { const manNo = field('man'); if (!manNo) return toast(tx('Choose a manifest first'), 'bad'); a.disabled = true; await attachManifest(ctx, a.dataset.truck, manNo); toast(tx('{man} attached to Truck {no}', { man: manNo, no: truckNo(a.dataset.truck) })); }
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
// Days without trucks: confirmed ahead (or on the day) so nothing expects a
// manifest and the morning checklist reads green. Past days are history.
function noneHtml(plan, k, today) {
  const nt = plan.days[k]?.noTrucks;
  if (nt) return `<div class="pempty pnone">${ic('check')}${tx('No trucks · confirmed')}${k >= today ? `<button class="pundo" data-act="notrucks-off" data-date="${k}" title="${tx('Trucks after all: undo')}">${tx('Undo')}</button>` : ''}</div>`;
  return `<div class="pempty">${tx('No trucks')}</div>${k >= today ? `<button class="pnt" data-act="notrucks" data-date="${k}">${ic('check')}${tx('Confirm no trucks')}</button>` : ''}`;
}
function noTruckCard(plan, dock, days, today) {
  const ahead = days.map(dkey).filter(k => k >= today); if (!ahead.length) return '';
  const label = k => { const d = new Date(k + 'T00:00:00'); return k === today ? dayLabel(d, tx('Today')) : dayLabel(d); };
  const row = k => {
    const n = numbersOf(plan, dock, k).length, nt = plan.days[k]?.noTrucks;
    const st = n ? `<span class="cs-dim">${txn(n, '{n} truck', '{n} trucks')}</span>` : nt ? `<span class="status good">${tx('No trucks')}</span><button class="pundo" data-act="notrucks-off" data-date="${k}">${tx('Undo')}</button>` : `<span class="cs-dim">${tx('not planned')}</span><button class="btn sm" data-act="notrucks" data-date="${k}">${tx('No trucks')}</button>`;
    return `<div class="row pnt-row${nt ? ' on' : ''}"><span>${label(k)}</span><span class="pnt-st">${st}</span></div>`;
  };
  return `<div class="card pnt-card"><div class="ch"><h3>${tx('Days without trucks')}</h3></div><p class="lbl">${tx('Confirm a day ahead or on the day: it expects no truck and no manifest, and the Dashboard’s morning checklist marks it done. Planning a truck on it clears the mark.')}</p><div class="rows">${ahead.map(row).join('')}</div></div>`;
}
function summary(plan, dock, days) {
  // Each truck once: a finalised truck is both on the dock record and in History.
  const keys = days.map(dkey), slots = keys.flatMap(k => Object.values(plan.days[k]?.slots || {})), trucks = Object.entries(dock.trucks).filter(([id]) => keys.includes(id.slice(0, 10)));
  const cleared = (dock.history || []).filter(h => keys.includes(h.id.slice(0, 10))), ids = new Set([...trucks.map(([id]) => id), ...cleared.map(h => h.id)]), avg = cleared.length ? cleared.reduce((n, h) => n + (h.clearMins || 0), 0) / cleared.length : 0;
  const manCtn = slots.reduce((n, sl) => n + cartonsOf(sl.manifest), 0) + trucks.reduce((n, [, t]) => n + cartonsOf(t.manifest), 0);
  const row = (k, v) => `<div class="row">${k}<b>${v}</b></div>`;
  return `<div class="card kpi"><div class="ch"><h3>${tx('This week')}</h3></div><div class="rows">${row(tx('Trucks planned'), slots.length + ids.size)}${row(tx('Cartons manifested'), manCtn.toLocaleString())}${row(tx('Trucks cleared'), cleared.length)}${row(tx('Average clear'), cleared.length ? fmtMins(avg) : '—')}${row(tx('Cartons decanted'), cleared.reduce((n, h) => n + (h.cartons || 0), 0).toLocaleString())}</div></div>`;
}
// The week's decant roster: new trucks start with these D-numbers when
// their slot names no team.
function roster(dock) {
  const pids = dock.roster?.pids || [];
  return `<div class="card"><div class="ch"><h3>${tx('Week roster')}</h3><span class="cs-dim">${pids.length ? tx('{n} on', { n: pids.length }) : tx('nobody yet')}</span></div><div class="dk-team">${pids.map(pid => `<span class="dk-tc on"><span class="av">${esc(pid)}</span><button class="dk-x" data-act="roster-drop" data-pid="${esc(pid)}" title="${tx('Take off the roster')}">${ic('x')}</button></span>`).join('') || `<span class="cs-dim">${tx('Add who is decanting this week.')}</span>`}</div>` +
    `<div class="bdr-teamadd" style="margin-top:8px"><input class="inp mono" data-field="roster" placeholder="${tx('D-number, e.g. D4')}" maxlength="6"><button class="btn sm" data-act="roster-add">${ic('plus')}${tx('Add')}</button></div><p class="lbl">${tx('New trucks start with this crew when their slot names no team. D-numbers only.')}</p></div>`;
}
