// The decant plan on the facilitator's board (Decant Visualiser's facilitator
// panel): each cutter's lane (what they are on, then their queue, with
// times from their rostered start), auto-balance (longest first, or tubs
// first) within finish times, the plan basis (standard minutes per carton
// or each person's own 28-day rate), the finish guard, and Take 5 before
// the decant starts. Queues are a plan.queues event; times ride on the team.

import { ic, esc, toast } from '../../ui.js';
import { tx, txn } from '../../i18n.js';
import { schedule, balance, finishCheck, personalRates, TAKE5, atTime } from '../../../shared/dockplan.js';
import { fmtHM, truckNo, pallets, planOpts } from './common.js';

const hm = ms => ms ? fmtHM(new Date(ms).toISOString()) : '—';
const take5 = { truck: null, ticks: new Set() };
export const ratesFor = dock => personalRates(dock?.history || []);

// Take 5 shows on a truck that has not started: no pallet worked yet, no
// hold-up but the booked huddle, and no Take 5 recorded.
export const needsTake5 = t => !t.take5 && !pallets(t).some(p => p.segments.length) && !(t.halts || []).some(h => !(h.kind === 'huddle' && h.planned));
export function take5Card(t) {
  if (take5.truck !== t.id) { take5.truck = t.id; take5.ticks = new Set(); }
  const n = take5.ticks.size, all = n === TAKE5.length, start = t.team?.length ? Math.min(...t.team.map(m => atTime(t, m.start) || Infinity)) : null, crew = (t.team || []).length;
  // The five checks are shared/dockplan.js's (English there; listed in test/unit/i18n-keys/dock1.json).
  return `<div class="card t5"><div class="ch"><h3>${tx('Ready to start · Take 5')}</h3><span class="cs-dim">${isFinite(start) && start ? tx('official start {time}', { time: hm(start) }) + ' · ' : ''}${txn(crew, '{n} decanter', '{n} decanters')}${t.status !== 'live' ? ' · ' + tx('receiving still landing') : ''}</span></div>` +
    `<div class="t5-list">${TAKE5.map(([k, title, text]) => `<label class="t5-item${take5.ticks.has(k) ? ' on' : ''}"><input type="checkbox" data-t5="${k}"${take5.ticks.has(k) ? ' checked' : ''}><span><b>${tx(title)}</b><small>${tx(text)}</small></span></label>`).join('')}</div>` +
    `<div class="t5-acts"><button class="btn primary" data-act="t5-start"${all ? '' : ' disabled'}>▶ ${tx('Start decant')}</button><button class="btn" data-act="t5-huddle"${all ? '' : ' disabled'}>${ic('users')}${tx('Launch huddle')}</button><span class="cs-dim">${all ? tx('All five checked. Good to go.') : tx('Tick all five to start. A huddle runs the safety talk and pauses the clock while you brief.')}</span></div></div>`;
}

export function planCard(t, rates, now = Date.now()) {
  const opts = planOpts(t, rates), sched = schedule(t, now, opts), cutters = (t.team || []).filter(m => !m.role || m.role === 'cutter');
  const anyRate = (t.team || []).some(m => rates[m.pid]?.eligible), basis = opts.basis;
  const lane = m => {
    const sc = sched[m.pid] || { items: [] }, fin = atTime(t, m.finish), over = fin && sc.finish && sc.finish > fin, r = rates[m.pid], more = r ? Math.max(0, Math.ceil(10 - r.pallets28d)) : 0;
    return `<div class="pl-lane${over ? ' over' : ''}"><div class="pl-who"><b>${esc(m.pid)}</b><span class="cs-dim">${r?.eligible ? tx('{n} ctn/h · 28d', { n: r.rate28d }) : r ? txn(more, '{n} more pallet to a rate', '{n} more pallets to a rate') : tx('no rate yet')}</span>` +
      `<label>${tx('start')}<input type="time" class="bdr-in" data-time="start" data-pid="${esc(m.pid)}" value="${esc(m.start || '')}"></label><label>${tx('finish')}<input type="time" class="bdr-in" data-time="finish" data-pid="${esc(m.pid)}" value="${esc(m.finish || '')}"></label></div>` +
      `<div class="pl-items">${sc.items.map((x, i) => `<span class="pl-it ${x.tag}"><b>${esc(x.ref)}</b>${hm(x.end)}${x.tag === 'queued' ? `<button class="pl-x" data-act="q-up" data-pid="${esc(m.pid)}" data-ref="${esc(x.ref)}" title="${tx('Earlier')}">‹</button><button class="pl-x" data-act="q-drop" data-pid="${esc(m.pid)}" data-ref="${esc(x.ref)}" title="${tx('Take off the queue')}">${ic('x')}</button>` : ''}</span>`).join('') || `<span class="cs-dim">${tx('Nothing planned')}</span>`}</div>` +
      `<div class="pl-fin">${sc.finish ? tx('free {time}', { time: hm(sc.finish) }) : tx('free now')}${fin ? ' · ' + tx('finishes {time}', { time: hm(fin) }) : ''}${over ? ` · <b class="c-red">${tx('{n} min past', { n: Math.round((sc.finish - fin) / 60000) })}</b>` : ''}</div></div>`;
  };
  const queued = new Set(Object.values(t.plan?.queues || {}).flat()), loose = pallets(t).filter(p => p.status !== 'done' && !p.segments.length && !queued.has(p.ref)).length;
  return `<div class="card pl"><div class="ch"><h3>${tx('Decant plan')}</h3><span class="cs-dim">${loose ? txn(loose, '{n} pallet not queued', '{n} pallets not queued') : tx('every waiting pallet is queued')}</span></div>` +
    `<div class="pl-tools"><span class="seg"><button class="${basis === 'x2' ? 'on' : ''}" data-act="pl-basis" data-v="x2" title="${tx('Standard minutes per carton')}">${tx('Standard rate')}</button><button class="${basis === 'personal' ? 'on' : ''}" data-act="pl-basis" data-v="personal"${anyRate ? '' : ` disabled title="${tx('Needs 10+ pallets of history per person')}"`}>${tx('Personal rate')}</button></span>` +
    `<button class="btn sm" data-act="pl-balance" data-v="longest">${ic('refresh')}${tx('Auto-balance')}</button><button class="btn sm" data-act="pl-balance" data-v="tubs">${tx('Tubs first')}</button><button class="btn sm" data-act="pl-clear">${tx('Clear plan')}</button></div>` +
    (cutters.length ? cutters.map(lane).join('') : `<p class="lbl">${tx('No cutters on the team. Set roles on the team card first.')}</p>`) +
    `<p class="lbl">${tx('Lanes run from each person’s start time. Auto-balance deals the waiting pallets to whoever frees first and keeps within finish times where it can.')}</p></div>`;
}
// The queue select in a pallet's panel.
export function queuePicker(t, p) {
  if (p.status === 'done' || p.segments.length) return '';
  const cs = (t.team || []).filter(m => !m.role || m.role === 'cutter'), on = Object.entries(t.plan?.queues || {}).find(([, refs]) => refs.includes(p.ref))?.[0] || '';
  return cs.length ? `<label class="pl-qsel">${tx('Queue for')}<select class="bdr-in" data-act-change="queue" data-ref="${esc(p.ref)}"><option value="">${tx('— not queued —')}</option>${cs.map(m => `<option value="${esc(m.pid)}"${on === m.pid ? ' selected' : ''}>${esc(m.pid)}</option>`).join('')}</select></label>` : '';
}

const send = (ctx, t, queues, basis) => ctx.store.dispatch({ type: 'plan.queues', entity: { truck: t.id }, payload: { queues, basis: basis || t.plan?.basis || 'x2' } });
const clean = t => { const q = {}; for (const [pid, refs] of Object.entries(t.plan?.queues || {})) q[pid] = refs.filter(r => { const p = t.pallets[r]; return p && !p.excluded && p.status !== 'done' && !p.segments.some(s => !s.end); }); return q; };
// The finish guard (DV): a pallet that would run past someone's finish asks first.
export function guard(t, pid, ref, rates, startNow) {
  const over = finishCheck(t, pid, ref, Date.now(), planOpts(t, rates), startNow);
  const v = { pid, time: hm(over?.finish), ref, end: hm(over?.end), mins: over?.overMins };
  return !over || confirm(startNow ? tx('Past {pid}’s finish\n\n{pid} finishes at {time}. {ref} (started now) would run to about {end}, {mins} min past their finish time.\n\nContinue anyway?', v) : tx('Past {pid}’s finish\n\n{pid} finishes at {time}. {ref} (queued after their run) would run to about {end}, {mins} min past their finish time.\n\nContinue anyway?', v));
}

export async function onPlanAct(ctx, t, a, rates) {
  const act = a.dataset.act;
  if (act === 'pl-basis') { await send(ctx, t, clean(t), a.dataset.v); return true; }
  if (act === 'pl-clear') { if (confirm(tx('Clear the plan for Truck {n}?', { n: truckNo(t.id) }))) await send(ctx, t, {}); return true; }
  if (act === 'pl-balance') {
    const b = balance(t, Date.now(), a.dataset.v, planOpts(t, rates));
    if (b.error) { toast(tx(b.error), 'bad'); return true; }   // shared/dockplan.js's message (test/unit/i18n-keys/dock1.json)
    await send(ctx, t, b.queues);
    toast((a.dataset.v === 'tubs' ? tx('Balanced: tubs first, then pallets') : tx('Balanced: longest work first, earliest lane wins')) + (b.overFinish ? ' · ' + tx('⚠ {n} past a finish time', { n: b.overFinish }) : ''));
    return true;
  }
  if (act === 'q-drop' || act === 'q-up') {
    const q = clean(t), list = q[a.dataset.pid] || [], i = list.indexOf(a.dataset.ref);
    if (act === 'q-drop') list.splice(i, 1); else if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    await send(ctx, t, q); return true;
  }
  if (act === 't5-start' || act === 't5-huddle') {
    await ctx.store.dispatch({ type: 'truck.take5', entity: { truck: t.id }, payload: { items: [...take5.ticks] } });
    if (act === 't5-huddle') await ctx.store.dispatch({ type: 'halt.start', entity: { truck: t.id }, payload: { kind: 'huddle', reason: 'huddle' } });
    else if (!t.decantStartAt) await ctx.store.dispatch({ type: 'truck.setStart', entity: { truck: t.id }, payload: { at: new Date().toISOString() } });
    toast(act === 't5-huddle' ? tx('Take 5 recorded · huddle running, the clock is paused') : tx('Take 5 recorded · decant started'));
    return true;
  }
  return false;
}
// Changes: Take 5 ticks, a person's start or finish, a pallet's queue.
export async function onPlanChange(ctx, t, el, rates, rerender) {
  if (el.dataset.t5) { if (el.checked) take5.ticks.add(el.dataset.t5); else take5.ticks.delete(el.dataset.t5); rerender(); return true; }
  if (el.dataset.time) {
    const team = (t.team || []).map(m => m.pid === el.dataset.pid ? { ...m, [el.dataset.time]: el.value || undefined } : m);
    await ctx.store.dispatch({ type: 'truck.team.set', entity: { truck: t.id }, payload: { team } }); return true;
  }
  if (el.dataset.actChange === 'queue') {
    const ref = el.dataset.ref, pid = el.value, q = clean(t);
    for (const k of Object.keys(q)) q[k] = q[k].filter(r => r !== ref);
    if (pid) { if (!guard({ ...t, plan: { ...(t.plan || {}), queues: q } }, pid, ref, rates, false)) { rerender(); return true; } (q[pid] ||= []).push(ref); }
    await send(ctx, t, q); toast(pid ? tx('{ref} queued for {pid}', { ref, pid }) : tx('{ref} taken off the plan', { ref })); return true;
  }
  return false;
}

// Today's decants (DV's decant board): planned slots, trucks on the dock and
// trucks cleared today, by number.
export function decantBoard(dock, plan, day) {
  const slots = plan?.days?.[day]?.slots || {}, nums = new Set(Object.keys(slots).map(Number));
  for (const id of Object.keys(dock.trucks)) if (id.startsWith(day + '-T')) nums.add(Number(truckNo(id)));
  for (const h of dock.history || []) if (h.id.startsWith(day + '-T')) nums.add(Number(truckNo(h.id)));
  if (!nums.size) return `<div class="card db"><div class="ch"><h3>${tx('Today’s decants')}</h3></div><p class="lbl">${plan?.days?.[day]?.noTrucks ? tx('No trucks today: confirmed in the Planner.') : tx('Nothing yet planned for today. A decant appears here the moment Receiving opens a truck.')}</p></div>`;
  const card = n => {
    const id = `${day}-T${n}`, t = dock.trucks[id], h = (dock.history || []).find(x => x.id === id), sl = slots[n];
    if (h || t?.status === 'closed') return `<div class="db-c done"><b>${tx('Truck {n}', { n })}</b><span class="status good">${tx('Done')}</span><small>${h ? tx('{n} ctn cleared in {time}', { n: h.cartons, time: tx('{h}h {m}m', { h: Math.floor((h.clearMins || 0) / 60), m: String((h.clearMins || 0) % 60).padStart(2, '0') }) }) : tx('cleared')}</small></div>`;
    if (t) { const ready = t.receivingConfirmed, ps = pallets(t), huddle = (t.halts || []).find(x => x.kind === 'huddle' && x.planned), nc = (t.manifest?.consols || []).length, crew = (t.team || []).length;
      return `<div class="db-c ${ready ? 'ready' : 'rcv'}" data-view="receiving"><b>${tx('Truck {n}', { n })}</b><span class="status ${ready ? 'good' : 'warn'}">${ready ? tx('Ready') : tx('Receiving')}</span><small>${t.landedAt ? tx('landed {time}', { time: fmtHM(t.landedAt) }) : tx('staged')}${ps.some(p => p.carryover) ? ' · ' + tx('+{n} carried over', { n: ps.filter(p => p.carryover).length }) : ''}</small><small>${t.manifest ? `${txn(nc, '{n} consol', '{n} consols')} · ${esc(t.manifest.manNo)}` : tx('no manifest')} · ${txn(ps.length, '{n} pallet', '{n} pallets')} · ${tx('{n} ctn', { n: ps.reduce((k, p) => k + (p.cartons || 0), 0) })}</small><small>${txn(crew, '{n} decanter in', '{n} decanters in')}${t.decantStartAt ? ' · ' + tx('start {time}', { time: fmtHM(t.decantStartAt) }) : ''}${huddle ? ' · ' + tx('huddle {n}m booked', { n: Math.round((Date.parse(huddle.end) - Date.parse(huddle.start)) / 60000) }) : ''}</small><em>${ready ? tx('Open and begin →') : tx('Open: plan while it lands →')}</em></div>`; }
    const nc = sl.manifest ? (sl.manifest.ref ? sl.manifest.n : (sl.manifest.consols || []).length) : 0, crew = (sl.team || []).length;
    return `<div class="db-c planned"><b>${tx('Truck {n}', { n })}</b><span class="status">${tx('Planned')}</span><small>${sl.eta ? tx('start {time}', { time: esc(sl.eta) }) : tx('no start time')}${sl.huddleMins ? ' · ' + tx('huddle {n}m', { n: sl.huddleMins }) : ''} · ${tx('waiting on Receiving')}</small><small>${sl.manifest ? `${txn(nc, '{n} consol', '{n} consols')} · ${esc(sl.manifest.manNo)}` : tx('no manifest yet')} · ${tx('{n} on the team', { n: crew })}</small></div>`;
  };
  return `<div class="card db"><div class="ch"><h3>${tx('Today’s decants')}</h3><span class="cs-dim">${nums.size}</span></div><div class="db-grid">${[...nums].sort((a, b) => a - b).map(card).join('')}</div></div>`;
}
