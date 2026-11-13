// Planner: the week ahead, in the F.2 layout (the "Planner week, structured"
// canvas, approved 12 Nov 2026). The days sit apart from their trucks: a
// card of days (each day's status, a thin bar per truck, its totals and what
// it still needs) above a card of trucks, one row per truck number, every
// cell the same size and naming its truck. Colour only where something needs
// doing: amber for what today still needs (and a late starter), red for a
// truck past its ETA, green for done and ready, the accent for what is live.
//
// A slot pre-stages truck YYYY-MM-DD-Tn; when Receiving starts that truck the
// reducer consumes the slot's team and manifest (and keeps its ETA). At the
// PC's wide layout the editor sits beside the week; narrower it opens as a
// side sheet, and on a manager's phone (one day at a time, a strip of the
// seven days to switch) as a bottom sheet. Half a screen scrolls the week
// sideways inside its card with the Truck column pinned. Print week is one
// A4 landscape sheet for the dock wall; an empty week offers Repeat last
// week (ordinary plan.set and plan.noTrucks events, shared/dockweek.js).

import { ic, esc, vh, sub, toast, fmtDate, fmtDay, today as storeToday, empty, pill, storeTz } from '../../ui.js';
import { manifestIndex, truckNo, who, dnumId, progress, fmtMins, fmtHM, slotRef, attachManifest, stTag, forecast, startOf } from './common.js';
import { tx, txn } from '../../i18n.js';
import { ask, sheetHtml } from '../../sheet.js';
import { printSheet } from '../../print.js';
import { truckPhase, phaseCounts } from '../../../shared/dockphase.js';
import { phaseChip } from './phase.js';
import { ratesFor } from './plan.js';
import { routeSheet, routeTag, routeLine, isMgr } from './routes.js';
import { landingOn, broughtBy, routeManifest } from '../../../shared/dockroutes.js';
import { offsiteGroups, backOn } from '../../../shared/offsite.js';
import { weekDays as weekOf, dayHasPlan, dayTrucks, repeatWeek } from '../../../shared/dockweek.js';
import { addDays, storeParts } from '../../../shared/time.js';
import { groupName, groupSub, callbackSheet, callText } from './callback.js';

const DOW = [tx('Mon'), tx('Tue'), tx('Wed'), tx('Thu'), tx('Fri'), tx('Sat'), tx('Sun')], MON = [tx('Jan'), tx('Feb'), tx('Mar'), tx('Apr'), tx('May'), tx('Jun'), tx('Jul'), tx('Aug'), tx('Sep'), tx('Oct'), tx('Nov'), tx('Dec')];
const TRUCK_ST = { staged: tx('staged'), live: tx('live'), closed: tx('closed') };
// What a planned truck still needs (m manifest, t team, e ETA), one sentence each.
const NEEDS = { m: tx('Needs a manifest'), t: tx('Needs a team'), e: tx('Needs an ETA'), mt: tx('Needs manifest, team'), me: tx('Needs manifest, ETA'), te: tx('Needs team, ETA'), mte: tx('Needs manifest, team, ETA') };
// "Mon 3 Feb" and "3 Feb", in the device's language and order.
const dateOf = k => new Date(k + 'T00:00:00');
const dowOf = k => (dateOf(k).getDay() + 6) % 7;
const dayLabel = (k, dow = DOW[dowOf(k)]) => { const d = dateOf(k); return tx('{dow} {d} {mon}', { dow, d: d.getDate(), mon: MON[d.getMonth()] }); };
const dowDay = k => tx('{dow} {d}', { dow: DOW[dowOf(k)], d: dateOf(k).getDate() });
const dateLabel = k => { const d = dateOf(k); return tx('{d} {mon}', { d: d.getDate(), mon: MON[d.getMonth()] }); };
// st.sel 'YYYY-MM-DD-n'; st.sheet: the editor opens as a sheet (decided when a truck is picked:
// the wide layout has room beside the week); st.pday the phone's day (0..6); st.fresh weeks
// started empty; st.drag a manifest being dragged onto a truck.
const st = { week: 0, sel: null, sheet: false, pick: null, roster: false, pday: null, fresh: new Set(), drag: null };
const nowHM = () => { const { hh, mm } = storeParts(new Date(), storeTz()); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const mondayOf = (today, off) => addDays(today, -dowOf(today) + off * 7);
// A staged reference carries its counts; a truck's (or an older slot's) manifest carries the consols.
const cartonsOf = m => m?.ref ? m.cartons : (m?.consols || []).reduce((n, c) => n + (Number(c.cartons) || 0), 0);
const consolsN = m => m?.ref ? m.n : (m?.consols || []).length;
const unitsOf = m => m?.ref ? m.units : (m?.consols || []).reduce((n, c) => n + ((c.mix || []).reduce((k, x) => k + (Number(x[2]) || 0), 0) || (c.items || []).reduce((k, it) => k + (Number(it.q) || 0), 0)), 0);
const abbr = n => n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
const truckOf = (dock, date, n) => dock.trucks[`${date}-T${n}`] || (dock.history || []).find(h => h.id === `${date}-T${n}`) && { status: 'closed' } || null;
// Truck numbers with a slot planned, marked off-site or diverted, or a truck created (a created truck consumes its slot).
const numbersOf = (plan, dock, date) => [...new Set([...Object.keys(plan.days[date]?.slots || {}).map(Number), ...Object.keys(plan.days[date]?.routes || {}).map(Number), ...Object.keys(dock.trucks).filter(id => id.startsWith(date + '-T')).map(id => Number(truckNo(id))), ...(dock.history || []).filter(h => h.id.startsWith(date + '-T')).map(h => Number(truckNo(h.id)))])].filter(n => n >= 1 && n <= 4).sort((a, b) => a - b);
// A one-line chip in a cell (the chip family, cut short rather than wrapped).
const tag = (tone, icon, text, title = '') => pill(text, tone, { size: 'sm', icon, cls: 'pw-one', title });

// ── the week, read ─────────────────────────────────────────────────────
// One truck number on one day: what it is now and what it needs.
function cellOf(ctx, plan, dock, k, n, today, hm, rosterN) {
  const tid = `${k}-T${n}`, rt = plan.days[k]?.routes?.[n];
  if (rt) return { n, kind: 'routed', rt };
  const t = dock.trucks[tid], hist = (dock.history || []).find(h => h.id === tid);
  if (hist || t?.status === 'closed') return { n, kind: 'closed', t: t || null, hist: hist || null };
  if (t) return { n, kind: 'live', t: { id: tid, ...t }, ph: truckPhase(t) };
  const slot = plan.days[k]?.slots?.[n]; if (!slot) return null;
  if (k < today) return { n, kind: 'never', slot };
  const back = backOn(ctx.store.get('inventory'), tid), isToday = k === today;
  // No slot team: the week's roster starts the truck, so it needs none of its own.
  const crew = (slot.team || []).length || rosterN;
  const miss = `${slot.manifest || back.n ? '' : 'm'}${crew ? '' : 't'}${slot.eta ? '' : 'e'}`;
  const lateStart = slot.eta ? (slot.team || []).filter(m => m.start && m.start > slot.eta) : [];
  const late = isToday && !!slot.eta && slot.eta < hm;
  const dot = late ? 'bad' : !miss && !lateStart.length ? 'good' : (isToday && miss) || lateStart.length ? 'warn' : '';
  return { n, kind: 'planned', slot, back, crew, miss, lateStart, late, dot, isToday };
}
const manCartons = (c, idx) => c.kind === 'planned' || c.kind === 'never' ? cartonsOf(c.slot.manifest) : c.t?.manifest ? cartonsOf(c.t.manifest) : c.t?.plannedManifest ? idx.find(m => m.manNo === c.t.plannedManifest)?.totalCartons || 0 : 0;
const manUnits = c => c.kind === 'planned' ? unitsOf(c.slot.manifest) : c.t?.manifest ? unitsOf(c.t.manifest) : 0;
const hasMan = c => c.kind === 'planned' ? !!(c.slot.manifest || c.back.n) : !!(c.t?.manifest || c.t?.plannedManifest || c.hist?.manifest);
// A day: its trucks by row (a truck in the row of its number, then trucks
// landing from off-site, then + Truck in the next free row), totals and needs.
function dayOf(ctx, plan, dock, idx, k, today, hm, rosterN) {
  const ns = numbersOf(plan, dock, k), cells = ns.map(n => cellOf(ctx, plan, dock, k, n, today, hm, rosterN)).filter(Boolean);
  const lands = landingOn(plan, k).filter(x => !broughtBy(plan, dock, { date: x.date, slot: x.n }));
  const rows = {}; for (const c of cells) rows[c.n] = c;
  const free = [1, 2, 3, 4].filter(n => !ns.includes(n));
  lands.forEach((x, i) => { if (free[i]) rows[free[i]] = { n: free[i], kind: 'land', x }; });
  const add = free[lands.length] || null;
  const real = cells.filter(c => c.kind !== 'routed'), closed = real.filter(c => c.kind === 'closed'), live = real.filter(c => c.kind === 'live'), planned = real.filter(c => c.kind === 'planned');
  const miss = ['m', 't', 'e'].filter(x => planned.some(c => c.miss.includes(x))).join('');
  return {
    k, past: k < today, isToday: k === today, ahead: k >= today, ns, cells, rows, add, lands, nt: plan.days[k]?.noTrucks || null,
    real, closed, live, planned, routed: cells.filter(c => c.kind === 'routed'), miss, late: planned.filter(c => c.late).length,
    lateStart: planned.some(c => c.lateStart.length), ready: planned.filter(c => c.dot === 'good').length,
    decanted: closed.reduce((n, c) => n + (c.hist?.cartons || 0), 0), avg: closed.length ? closed.reduce((n, c) => n + (c.hist?.clearMins || 0), 0) / closed.length : 0,
    manCtn: real.reduce((n, c) => n + manCartons(c, idx), 0), units: real.reduce((n, c) => n + manUnits(c), 0),
    withMan: real.filter(c => c.kind !== 'closed' && hasMan(c)).length, withEta: planned.filter(c => c.slot.eta).length + live.length, withTeam: planned.filter(c => c.crew).length + live.filter(c => (c.t.team || []).length).length, open: real.filter(c => c.kind !== 'closed' && c.kind !== 'never').length,
  };
}
function weekModel(ctx, off = st.week) {
  const plan = ctx.store.get('plan'), dock = ctx.store.get('dock'), today = storeToday(), hm = nowHM(), idx = manifestIndex(dock), rosterN = (dock.roster?.pids || []).length;
  const keys = weekOf(mondayOf(today, off)), days = keys.map(k => dayOf(ctx, plan, dock, idx, k, today, hm, rosterN));
  // Every truck row the same height: three, or four when a day uses the fourth.
  const R = Math.max(3, ...days.flatMap(d => Object.keys(d.rows).map(Number)));
  return { plan, dock, today, hm, idx, rosterN, keys, days, R, extra: R < 4 };
}
// What the day's row of the days card says. tone: '' plain, 'warn', 'bad', 'good'.
function band(d) {
  const ctn = n => tx('{n}c', { n: n.toLocaleString() });
  if (d.nt && !d.cells.length) return { big: '0', what: tx('trucks'), sub: tx('Confirmed'), tone: 'good', ink: 'good' };
  if (!d.cells.length) return { big: '—', sub: d.past ? tx('No trucks') : tx('Not planned'), tone: 'faint', ink: 'faint' };
  if (!d.real.length) return { big: '—', sub: tx('Not coming to the dock'), tone: 'faint', ink: 'faint' };
  const cleared = d.closed.length ? tx('{k} of {n} cleared', { k: d.closed.length, n: d.real.length }) + (d.avg ? ` · ${fmtMins(d.avg)}` : '') : '';
  if (d.past || d.closed.length === d.real.length) return { big: ctn(d.decanted), what: tx('decanted'), sub: cleared || tx('{k} of {n} cleared', { k: 0, n: d.real.length }), tone: 'faint', ink: d.past ? 'dim' : '' };
  const big = d.manCtn ? ctn(d.manCtn) : '—', what = d.manCtn ? tx('manifested') : '';
  if (d.isToday) {
    if (d.late) return { big, what, sub: txn(d.late, '{n} truck past its ETA and not landed', '{n} trucks past their ETA and not landed'), tone: 'bad' };
    if (d.miss) return { big, what, sub: NEEDS[d.miss], tone: 'warn' };
    return { big, what, sub: cleared || tx('Ready'), tone: 'faint' };
  }
  if (d.miss.includes('m')) return { big, what, sub: d.k === addDays(storeToday(), 1) ? tx('Manifests come tonight') : tx('No manifests yet'), tone: 'faint' };
  if (d.miss) return { big, what, sub: NEEDS[d.miss], tone: 'faint' };
  return { big, what, sub: tx('Ready'), tone: 'faint' };
}
// The thin bar per truck under each day.
const segOf = c => c.kind === 'closed' ? 'done' : c.kind === 'live' ? 'live' : c.kind === 'planned' ? ({ good: 'done', warn: 'now', bad: 'late' }[c.dot] || 'none') : 'none';
const dayTag = d => d.isToday ? ['today', tx('Today')] : d.past && d.real.length ? ['done', tx('Done')] : ['', ''];

// ── a truck's cell ─────────────────────────────────────────────────────
const tk = n => `<span class="pw-tk">${ic('truck')}${tx('Truck {no}', { no: n })}</span>`;
const line = (cls, html, title = '') => html ? `<span class="${cls}"${title ? ` title="${title}"` : ''}>${html}</span>` : '';
// What a planned truck's bottom line says, and in which tone.
function needLine(c) {
  if (c.late) return [tx('Past its ETA, not landed'), 'bad'];
  if (c.isToday && c.miss) return [NEEDS[c.miss], 'warn'];
  if (c.lateStart.length) return [c.lateStart.length > 1 ? tx('{n} start late, from {time}', { n: c.lateStart.length, time: esc(c.lateStart.map(m => m.start).sort()[0]) }) : tx('{pid} starts late, {time}', { pid: esc(who(c.lateStart[0])), time: esc(c.lateStart[0].start) }), 'warn'];
  if (c.miss.replace('m', '')) return [NEEDS[c.miss.replace('m', '')], ''];
  const s = c.slot;
  if (s.huddleMins && s.breakMins) return [tx('Huddle {h}m · break {b}m', { h: s.huddleMins, b: s.breakMins }), ''];
  if (s.huddleMins || s.breakMins) return [s.huddleMins ? tx('huddle {n}m booked', { n: s.huddleMins }) : tx('team break {n}m', { n: s.breakMins }), ''];
  return ['', ''];
}
const DOT_T = { good: tx('Ready'), warn: tx('Needs something now'), bad: tx('Past its ETA, not landed'), '': tx('Not ready yet') };
// The inside of a truck's cell (the PC's week and the phone's day share it).
function cellBody(ctx, d, c, m) {
  const plan = m.plan;
  if (c.kind === 'closed') {
    const h = c.hist, t = c.t, no = h?.manifest?.manNo || t?.manifest?.manNo, crew = (t?.team || []).length || (h?.perPerson || []).length;
    return `<b class="pw-man dim">${no ? esc(no) : tx('No manifest')}</b>` + line('pw-ok', `${ic('check')}${h ? tx('Cleared in {time}', { time: fmtMins(h.clearMins || 0) }) : tx('Decant cleared')}`) +
      line('pw-l2', h ? [tx('{n} ctn', { n: (h.cartons || 0).toLocaleString() }), crew ? tx('{n} crew', { n: crew }) : '', h.teamRate ? tx('{n} ctn/h', { n: h.teamRate }) : ''].filter(Boolean).join(' · ') : tx('in History'));
  }
  if (c.kind === 'never') return `<span class="pw-never">${tx('Not received')}</span>` + line('pw-l2', c.slot.eta ? tx('ETA {time}', { time: esc(c.slot.eta) }) : '');
  if (c.kind === 'routed') {
    const rt = c.rt, no = routeManifest(rt);
    return `<b class="pw-man dim">${no ? esc(no) : tx('No manifest')}</b>${routeTag(rt)}` + line('pw-l2', routeLine(rt), routeLine(rt).replace(/<[^>]+>/g, '')) + line('pw-need', tx('Not coming to the dock'));
  }
  if (c.kind === 'land') {
    const x = c.x, no = routeManifest(x.route);
    return `<b class="pw-man">${no ? esc(no) : tx('No manifest')}</b>` + line('pw-l1', tx('Truck {no} of {day}', { no: x.n, day: esc(fmtDay(x.date)) })) +
      (d.ahead && isMgr(ctx) ? `<button class="btn sm pw-plan" data-act="land-plan" data-date="${x.date}" data-n="${x.n}">${ic('plus')}${tx('Plan it')}</button>` : '');
  }
  if (c.kind === 'live') {
    const t = c.t, ph = c.ph, man = t.manifest?.manNo || t.plannedManifest, crew = (t.team || []).length, from = startOf(t);
    // The manifest on its own line (a narrow column never cuts it), then the phase and since when.
    const head = `<b class="pw-man${man ? '' : ' warn'}">${man ? esc(man) : tx('No manifest')}</b>`;
    const l1 = `<span class="pw-phx">${phaseChip(t, 'sm')}${line('pw-l1', ph === 'planned' ? (t.eta ? tx('ETA {time}', { time: esc(t.eta) }) : tx('No ETA')) : [from ? tx('from {time}', { time: fmtHM(from) }) : '', crew ? tx('{n} crew', { n: crew }) : ''].filter(Boolean).join(' · '))}</span>`;
    const sent = (t.offsite || []).length, part = sent ? tag('warn', 'stack', tx('Part off-site · {n} of {of}', { n: sent, of: sent + Object.values(t.pallets || {}).filter(p => !p.excluded).length })) : '';
    const b = backOn(ctx.store.get('inventory'), t.id), back = b.n ? tag('info', 'undo', tx('{n} of {of} back', { n: b.back, of: b.n })) : '';
    const pc = phaseCounts(t);
    if (ph === 'decanting' || ph === 'cleared') {
      const pr = progress(t), fc = ph === 'decanting' ? forecast(t, Date.now(), ratesFor(m.dock)) : null;
      return head + l1 + part + back + `<div class="pw-bar"><i style="--w:${pr.pct}%"></i></div>` +
        (ph === 'cleared' ? line('pw-need warn', `${tx('Every pallet done')} · ${tx('close the truck at Receiving')}`) : line('pw-fin', fc?.at ? tx('{pct}% · finish {time}', { pct: pr.pct, time: fmtHM(new Date(fc.at).toISOString()) }) : tx('{pct}% decanted', { pct: pr.pct })) + line('pw-l2', tx('{done} / {total} ctn', { done: pr.done.toLocaleString(), total: pr.total.toLocaleString() })));
    }
    const landed = t.landedAt;
    if (ph === 'receiving') return head + l1 + part + back + line('pw-l2', tx('Receiving · {n} pallets', { n: pc.pallets })) + line('pw-need warn', tx('landed {time} · layout not confirmed', { time: fmtHM(landed) }));
    if (ph === 'received') return head + l1 + part + back + line('pw-l2', tx('{n} pallets · layout confirmed {time}', { n: pc.pallets, time: fmtHM(t.receivedAt) })) + line('pw-need', tx('Take 5, then start'));
    return head + l1 + back + line('pw-need', tx('planned · Start receiving on the dock'));
  }
  // planned
  const s = c.slot, today = c.isToday, man = s.manifest?.manNo;
  const manTxt = man ? esc(man) : c.back.n ? txn(c.back.n, '{n} pallet coming back from off-site storage', '{n} pallets coming back from off-site storage') : tx('No manifest yet');
  const head = `<div class="pw-mh"><b class="pw-man${man || c.back.n ? '' : today ? ' warn' : ' faint'}">${manTxt}</b><i class="pw-dot ${c.dot}" title="${DOT_T[c.dot]}" role="img" aria-label="${DOT_T[c.dot]}"></i></div>`;
  const l1 = line('pw-l1', [s.eta ? tx('ETA {time}', { time: esc(s.eta) }) : tx('No ETA'), c.crew ? tx('{n} crew', { n: c.crew }) : ''].filter(Boolean).join(' · '));
  const from = s.from ? plan.days[s.from.date]?.routes?.[s.from.slot] : null;
  const l2 = c.back.n ? tag('info', 'undo', c.back.sent ? tx('From off-site · sent {day}', { day: esc(fmtDay(c.back.sent)) }) : tx('From off-site'))
    : s.from ? tag('info', 'undo', from?.route === 'diverted' ? tx('Was diverted · due {day}', { day: esc(fmtDay(s.from.date)) }) : tx('From off-site · was due {day}', { day: esc(fmtDay(s.from.date)) }))
    : line('pw-l2', man ? tx('{n} ctn', { n: cartonsOf(s.manifest).toLocaleString() }) : today ? (s.eta ? (s.eta >= '12:00' ? tx('Lands this afternoon') : tx('Lands this morning')) : '') : d.k === addDays(m.today, 1) ? tx('Manifest comes tonight') : tx('comes the night before'));
  const [need, tone] = needLine(c);
  return head + l1 + l2 + line('pw-note', s.note ? `${ic('edit')}${esc(s.note)}` : '', esc(s.note || '')) + line(`pw-need${tone ? ' ' + tone : ''}`, need);
}
// Where a dragged manifest may land: a slot or a truck on the dock without one, or a free number, today or ahead.
// { attr, x }: the cell's data-drop and what it says while a manifest is over it.
function dropOf(d, c, n) {
  const no = { attr: '', x: '' };
  if (!d.ahead) return no;
  if (c && !(c.kind === 'planned' && !c.slot.manifest) && !(c.kind === 'live' && !c.t.manifest && !c.t.plannedManifest)) return no;
  const eta = c?.kind === 'planned' ? c.slot.eta : c?.t?.eta;
  return { attr: ` data-drop="${d.k}|${n}"`, x: `<span class="pw-dropx" aria-hidden="true">${ic('download')}<b>${tx('Drop to stage')}</b><small>${[tx('Truck {no}', { no: n }), esc(fmtDay(d.k)), eta ? tx('ETA {time}', { time: esc(eta) }) : ''].filter(Boolean).join(' · ')}</small></span>` };
}
// A cell of the trucks card: --c the day's column, --r its row (--rs rows it spans).
function cellHtml(ctx, d, i, row, m) {
  const c = d.rows[row], at = `--c:${i + 1};--r:${row}`, td = d.isToday ? ' today' : '';
  if (!c) {
    if (row !== d.add) return `<div class="pw-c pw-blank${td}" style="${at}"></div>`;
    const drop = dropOf(d, null, row);
    return `<div class="pw-c pw-addc${td}${row > m.R ? ' xr' : ''}" style="${at}"${drop.attr}><button class="pw-add" data-act="add" data-slot="${d.k}-${row}">+ ${tx('Truck {no}', { no: row })}</button>${drop.x}</div>`;
  }
  if (c.kind === 'land') return `<div class="pw-c pw-land${td}" style="${at}"><span class="pw-tk">${ic('undo')}${c.x.route.route === 'offsite' ? tx('Lands from off-site') : tx('Lands after a diversion')}</span>${cellBody(ctx, d, c, m)}</div>`;
  const id = `${d.k}-${c.n}`, drop = dropOf(d, c, c.n);
  return `<div class="pw-c pw-${c.kind}${st.sel === id ? ' on' : ''}${td}" style="${at}" data-act="sel" data-slot="${id}"${drop.attr}>${tk(c.n)}${cellBody(ctx, d, c, m)}${drop.x}</div>`;
}
// A day with no trucks fills its column: not planned yet (both choices), confirmed, or past.
function spanHtml(ctx, d, i, m) {
  const at = `--c:${i + 1};--r:1;--rs:${m.R + (m.extra ? 1 : 0)}`, drop = dropOf(d, null, 1);
  if (d.nt) return `<div class="pw-c pw-span pw-none" style="${at}"><span class="pw-ring">${ic('check')}</span><b>${tx('No trucks')}</b><span>${tx('Confirmed in the Planner')}</span>${d.ahead ? `<button class="pw-btn" data-act="notrucks-off" data-date="${d.k}" title="${tx('Trucks after all: undo')}">${tx('Undo')}</button>` : ''}</div>`;
  if (d.past) return `<div class="pw-c pw-span pw-gone" style="${at}"><b>${tx('No trucks')}</b><button class="pw-add" data-act="add" data-slot="${d.k}-1">+ ${tx('Truck {no}', { no: 1 })}</button></div>`;
  return `<div class="pw-c pw-span pw-unpl${d.isToday ? ' today' : ''}" style="${at}"${drop.attr}>${drop.x}<span class="pw-ring">${ic('cal')}</span><b>${tx('Not planned yet')}</b><span>${tx('Plan a truck, or confirm there are none.')}</span>` +
    `<button class="pw-btn add" data-act="add" data-slot="${d.k}-1">+ ${tx('Truck {no}', { no: 1 })}</button><button class="pw-btn ok" data-act="notrucks" data-date="${d.k}">${ic('check')}${tx('Confirm no trucks')}</button>` +
    (isMgr(ctx) ? `<button class="pw-lnk" data-act="route-day" data-date="${d.k}">${ic('route')}${tx('Off-site or diverted…')}</button>` : '') + `</div>`;
}

// ── the PC's week ──────────────────────────────────────────────────────
function daysCard(m) {
  const lab = (r, b, s = '') => `<div class="pw-lab" style="--r:${r}"><b>${b}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  return `<section class="pw-days" aria-label="${tx('The week’s days')}">${lab(1, '')}${lab(2, tx('The day'), tx('cartons'))}` + m.days.map((d, i) => {
    const [tc, tt] = dayTag(d), b = band(d), cls = `${d.isToday ? ' today' : ''}${d.nt && !d.cells.length ? ' none' : ''}${d.past ? ' past' : ''}`;
    return `<div class="pw-h${cls}" style="--c:${i + 1}"><span class="pw-dl">${DOW[i]}<b>${dateOf(d.k).getDate()}</b>${tt ? `<em class="${tc}">${tt}</em>` : ''}</span><span class="pw-bars">${d.cells.map(c => `<i class="${segOf(c)}"></i>`).join('')}</span></div>` +
      `<div class="pw-b${cls}" style="--c:${i + 1}"><span class="pw-big"><b class="${b.ink || ''}">${b.big}</b>${b.what ? ' ' + b.what : ''}</span><span class="pw-bs ${b.tone}" title="${b.sub}">${b.sub}</span></div>`;
  }).join('') + `</section>`;
}
function trucksCard(ctx, m) {
  const rows = m.R + (m.extra ? 1 : 0), labs = Array.from({ length: rows }, (_, i) => {
    const n = i + 1; if (n > m.R) return `<div class="pw-lab xr" style="--r:${n}"></div>`;
    const k = m.days.filter(d => d.rows[n] && d.rows[n].kind !== 'land').length;
    return `<div class="pw-lab" style="--r:${n}"><b>${tx('Truck {no}', { no: n })}</b><span>${k ? tx('{n} of 7 days', { n: k }) : tx('not planned')}</span></div>`;
  }).join('');
  return `<section class="pw-trucks${m.extra ? '' : ' four'}" aria-label="${tx('Trucks this week')}">${labs}` + m.days.map((d, i) => !d.cells.length && !d.lands.length ? spanHtml(ctx, d, i, m) : Array.from({ length: rows }, (_, r) => cellHtml(ctx, d, i, r + 1, m)).join('')).join('') + `</section>`;
}
// Half a screen: a strip of the seven days that brings one into view.
const DAY_DOT = d => d.isToday ? 'today' : d.nt && !d.cells.length ? 'good' : !d.cells.length ? (d.past ? '' : 'none') : d.past || d.closed.length === d.real.length ? 'good' : d.late ? 'bad' : d.ready === d.planned.length && d.planned.length ? 'good' : 'part';
const strip = m => `<nav class="pw-strip" aria-label="${tx('Jump to a day')}">${m.days.map((d, i) => `<button type="button" class="${d.isToday ? 'on' : ''}" data-act="jump" data-i="${i}"><i class="${DAY_DOT(d)}"></i>${dowDay(d.k)}</button>`).join('')}</nav>`;
function headSub(m) {
  const all = m.days.reduce((n, d) => n + d.ns.length, 0), cleared = m.days.reduce((n, d) => n + d.closed.length, 0), dec = m.days.reduce((n, d) => n + d.decanted, 0), away = kind => m.days.reduce((n, d) => n + d.routed.filter(c => c.rt.route === kind).length, 0);
  const label = st.week === 0 ? tx('This week') : st.week === 1 ? tx('Next week') : st.week === -1 ? tx('Last week') : tx('{n} weeks', { n: `${st.week > 0 ? '+' : ''}${st.week}` });
  if (!all && !m.days.some(d => d.nt)) return sub(label, `${dateLabel(m.keys[0])} – ${dateLabel(m.keys[6])}`, tx('nothing planned yet'));
  return sub(label, `${dateLabel(m.keys[0])} – ${dateLabel(m.keys[6])}`, txn(all, '{n} truck', '{n} trucks'), st.week === 0 ? tx('{n} today', { n: m.days.find(d => d.isToday)?.ns.length || 0 }) : '', cleared ? tx('{n} cleared', { n: cleared }) : '',
    dec ? tx('{n} cartons decanted', { n: dec.toLocaleString() }) : '', away('offsite') ? tx('{n} off-site', { n: away('offsite') }) : '', away('diverted') ? tx('{n} diverted', { n: away('diverted') }) : '');
}
const weekPills = () => `<span class="pills"><button data-act="wk" data-d="-1" aria-label="${tx('Last week')}">‹</button><button class="${st.week === 0 ? 'on' : ''}" data-act="wk" data-d="0">${tx('This week')}</button><button data-act="wk" data-d="1" aria-label="${tx('Next week')}">›</button></span>`;

// An empty week (board J): Repeat last week, or start empty.
function repeatOffer(ctx, m, phone = false) {
  if (st.fresh.has(m.keys[0]) || m.keys[6] < m.today || m.keys.some(k => dayHasPlan(m.plan, m.dock, k))) return null;
  const last = weekOf(addDays(m.keys[0], -7)), per = last.map(k => dayTrucks(m.plan, m.dock, k)), n = per.reduce((k, x) => k + x.length, 0), days = per.filter(x => x.length).length;
  if (!n && !last.some(k => m.plan.days[k]?.noTrucks)) return null;
  const evs = repeatWeek(m.plan, m.dock, last, m.keys, m.today);
  const col = (k, i) => {
    const mine = evs.filter(e => e.entity.date === k), none = mine.some(e => e.type === 'plan.noTrucks'), slots = mine.filter(e => e.type === 'plan.set');
    const body = k < m.today ? `<div class="pw-rp-x">${tx('Already past')}</div>` : none ? `<div class="pw-rp-x ok">${tx('No trucks · confirmed')}</div>` : slots.length ? slots.map(e => `<div class="pw-rp-s"><b>${tx('Truck {no}', { no: e.entity.slot })}</b><span>${[e.payload.eta ? tx('ETA {time}', { time: esc(e.payload.eta) }) : tx('No ETA'), e.payload.team.length ? tx('{n} crew', { n: e.payload.team.length }) : ''].filter(Boolean).join(' · ')}</span></div>`).join('') : `<div class="pw-rp-x">${tx('Stays unplanned')}</div>`;
    return `<div class="pw-rp-d"><span class="pw-dl">${DOW[i]}<b>${dateOf(k).getDate()}</b></span>${body}</div>`;
  };
  return `<section class="card pw-rp${phone ? ' phone' : ''}" aria-label="${tx('Repeat last week')}"><div class="pw-rp-h"><span class="vic">${ic('refresh')}</span><div><b>${n ? tx('Last week had {n} trucks over {d} days', { n, d: days }) : tx('Last week had no trucks, confirmed')}</b><span>${tx('Repeat its slots, ETAs and decant teams here, and its confirmed no-truck days. Manifests are not copied: they arrive the night before.')}</span></div>` +
    `<button class="btn primary" data-act="repeat"${evs.length ? '' : ' disabled'}>${tx('Repeat last week')}</button><button class="btn" data-act="fresh">${tx('Start empty')}</button></div>` +
    `<div class="pw-rp-t"><span>${tx('What repeating adds')}</span><i></i></div><div class="pw-rp-g">${m.keys.map(col).join('')}</div></section>`;
}

// ── the editor ─────────────────────────────────────────────────────────
// { title, chip, body, acts: [html, …] (the main one last) } for the selected truck.
function editorParts(ctx, plan, dock) {
  const [date, n] = [st.sel.slice(0, 10), Number(st.sel.slice(11))], slot = plan.days[date]?.slots?.[n] || { eta: '', note: '', team: [], manifest: null }, t = truckOf(dock, date, n);
  const idx = manifestIndex(dock), rt = plan.days[date]?.routes?.[n], title = tx('Truck {no} · {day}', { no: n, day: dayLabel(date) });
  const row = (label, html, cls = '') => `<div class="pw-fl${cls ? ' ' + cls : ''}">${label}</div><div class="pw-fv${cls ? ' ' + cls : ''}">${html}</div>`;
  if (rt) {
    const no = routeManifest(rt), mgr = isMgr(ctx);
    return { title, chip: '', body: `<div class="pw-form">${row(tx('Where it goes'), `${routeTag(rt)}<span class="cs-dim">${routeLine(rt)}</span>`)}${no ? row(tx('Manifest'), `<b>${esc(no)}</b><span class="cs-dim">${rt.slot?.manifest ? tx('{consols} consols · {cartons} cartons', { consols: consolsN(rt.slot.manifest), cartons: cartonsOf(rt.slot.manifest) }) : tx('not coming to the dock')}</span>`) : ''}</div>` +
      `<p class="lbl">${rt.lands ? tx('Expected here on {day}: the Planner shows it that day, with Plan it.', { day: esc(fmtDate(rt.lands)) }) : rt.route === 'offsite' ? tx('No callback day yet. Set one when it is called back.') : tx('It does not come here. If it does after all, set it back to Receive here.')}</p>${mgr ? '' : `<p class="lbl">${tx('A manager changes where it goes.')}</p>`}`,
      acts: mgr ? [`<button class="btn" data-act="remove">${tx('Remove truck')}</button>`, `<button class="btn" data-act="route-back" data-date="${date}" data-n="${n}">${ic('truck')}${tx('Receive here')}</button>`, `<button class="btn primary" data-act="route" data-date="${date}" data-n="${n}">${ic('edit')}${tx('Change where it goes')}</button>`] : [] };
  }
  // A truck on the dock: its manifest goes straight on the truck (a closed one is History's).
  if (t) {
    const live = t.status !== 'closed', id = `${date}-T${n}`;
    const pick = live && !t.manifest ? row(tx('Manifest'), `<div class="pw-man2">${manSelect(idx, plan, dock, null, id)}<button class="btn primary sm" data-act="attach-truck" data-truck="${esc(id)}">${tx('Attach')}</button></div><span class="cs-dim">${tx('Goes on the truck now, as attaching at Receiving does.')}</span>`) : '';
    const has = t.manifest ? row(tx('Manifest'), `<b>${esc(t.manifest.manNo)}</b><span class="cs-dim">${tx('{consols} consols · {cartons} cartons · on the truck', { consols: (t.manifest.consols || []).length, cartons: cartonsOf(t.manifest) })}</span>`) : t.plannedManifest ? `<p class="lbl">${tx('Manifest {man} is attaching from this slot.', { man: esc(t.plannedManifest) })}</p>` : '';
    return { title, chip: stTag(t.status, esc(TRUCK_ST[t.status] || t.status)), body: `<p class="lbl">${live ? tx('This truck is on the dock board; its team is managed at Receiving now.') : tx('This truck has been decanted and finalised. Its record is in Receiving history.')}</p><div class="pw-form">${has}${pick}</div>`,
      acts: [`<button class="btn${pick ? '' : ' primary'}" data-view="${live ? 'receiving' : 'rhistory'}">${ic(live ? 'truck' : 'm-rhistory')}${live ? tx('Open at Receiving') : tx('Open at History')}</button>`] };
  }
  const team = slot.team || [];
  const body = `<div class="pw-form">` +
    row(`<label for="pw-eta">${tx('ETA')}</label>`, `<input class="inp pw-eta" id="pw-eta" data-field="eta" value="${esc(slot.eta || '')}" placeholder="06:30" maxlength="5" title="${tx('24h · the dock board sorts by it')}">`) +
    row(tx('Manifest'), `${slot.manifest ? `<div class="pw-man2"><b>${esc(slot.manifest.manNo)}</b><span class="cs-dim">${tx('{consols} consols · {cartons} cartons', { consols: consolsN(slot.manifest), cartons: cartonsOf(slot.manifest).toLocaleString() })}</span><button class="pw-lnk" data-act="unstage">${tx('Remove')}</button></div>` : ''}<div class="pw-man2">${manSelect(idx, plan, dock, slot.manifest?.manNo)}<button class="btn sm${slot.manifest ? '' : ' primary'}" data-act="stage">${tx('Stage')}</button></div>`) +
    row(tx('Decant team'), `<div class="dk-team">${team.map(m => `<span class="dk-tc on"><span class="av">${esc(who(m))}</span><button class="dk-x" data-act="team-drop" data-pid="${esc(m.pid)}" title="${tx('Remove')}">${ic('x')}</button></span>`).join('')}<span class="dk-tc add"><input class="inp w-team" data-field="team" placeholder="D4" maxlength="6" autocapitalize="characters" aria-label="${tx('Decant team')}"><button class="ibtn sm" data-act="team-add" title="${tx('Add')}">${ic('plus')}</button></span></div><span class="cs-dim">${tx('D-numbers only: no names are kept on the dock.')}</span>`) +
    (team.length ? row(tx('start and finish::Times'), `<div class="pf-times">${team.map(m => `<div class="pf-time"><b>${esc(who(m))}</b><input type="time" class="inp" data-mtime="start" data-pid="${esc(m.pid)}" value="${esc(m.start || '')}" title="${tx('Start (empty follows the ETA)')}" aria-label="${tx('Start (empty follows the ETA)')}"><input type="time" class="inp" data-mtime="finish" data-pid="${esc(m.pid)}" value="${esc(m.finish || '')}" title="${tx('Finish')}" aria-label="${tx('Finish')}"></div>`).join('')}</div><span class="cs-dim">${tx('Empty start follows the ETA. Finish times keep auto-balance within each shift.')}</span>`) : '') +
    row(tx('Huddle · break'), `<span class="pf-pair" title="${tx('The huddle is booked at the decant start and stops the clock; the break is the plan’s allowance.')}"><input class="inp mono" data-field="huddle" type="number" min="0" max="120" value="${slot.huddleMins || ''}" placeholder="0" aria-label="${tx('min huddle')}"><span class="cs-dim">${tx('min huddle')}</span><input class="inp mono" data-field="break" type="number" min="0" max="120" value="${slot.breakMins || ''}" placeholder="0" aria-label="${tx('min team break')}"><span class="cs-dim">${tx('min team break')}</span></span>`) +
    row(`<label for="pw-note">${tx('Note')}</label>`, `<input class="inp" id="pw-note" data-field="note" value="${esc(slot.note || '')}" placeholder="${tx('Anything the dock should know')}" maxlength="200">`) +
    (isMgr(ctx) && plan.days[date]?.slots?.[n] ? row(tx('Where it goes'), `<span class="pf-pair">${pill(tx('Receive here'), 'good', { size: 'sm', icon: 'truck' })}<button class="btn sm" data-act="route" data-date="${date}" data-n="${n}">${ic('route')}${tx('Off-site or diverted…')}</button></span><span class="cs-dim">${tx('Not coming to the dock? Mark it off-site or diverted, with the day it lands here after all.')}</span>`) : '') + `</div>`;
  return { title, chip: '', body, acts: [`<button class="btn" data-act="remove">${tx('Remove truck')}</button>`, `<button class="btn primary" data-act="save">${ic('check')}${tx('Save')}</button>`] };
}
function editorCard(ctx, plan, dock) {
  if (!st.sel || st.sheet) return `<div class="card pw-ed"><div class="ch"><h3>${tx('Pick a truck')}</h3></div>${empty(tx('Click a slot to set its ETA, manifest and decant team, or + Truck on a day to plan one.'), { icon: 'truck', sm: true })}</div>`;
  const p = editorParts(ctx, plan, dock);
  return `<div class="card pw-ed pedit"><div class="ch"><h3>${p.title}</h3>${p.chip}</div>${p.body}${p.acts.length ? `<div class="pf-acts">${[...p.acts].reverse().join('')}</div>` : ''}</div>`;
}
const editorSheet = (ctx, plan, dock) => { if (!st.sel || !st.sheet) return ''; const p = editorParts(ctx, plan, dock); return sheetHtml({ kind: 'side', cls: 'pw-sheet pedit', title: p.title, sub: p.chip, body: p.body, foot: p.acts.join(''), close: 'unsel' }); };

// The library as a picker: unused reports first; then the ones already on a
// truck or staged on a slot, labelled where (a re-run, or one staged to the
// wrong day), so a published report is never hidden.
function manSelect(idx, plan, dock, cur, forTruck) {
  const staged = {}, away = {}; for (const [date, day] of Object.entries(plan.days || {})) { for (const [n, sl] of Object.entries(day.slots || {})) if (sl.manifest?.manNo) staged[sl.manifest.manNo] = `${date}-T${n}`; for (const r of Object.values(day.routes || {})) if (routeManifest(r)) away[routeManifest(r)] = { date, r }; }
  const awayText = a => a.r.route === 'offsite' ? tx('off-site since {date}', { date: fmtDate(a.date) }) : tx('diverted on {date}', { date: fmtDate(a.date) });
  const where = m => m.truck ? (dock.trucks[m.truck] && dock.trucks[m.truck].status !== 'closed' ? tx('on Truck {no} now', { no: truckNo(m.truck) }) : tx('used on Truck {no} · {date}', { no: truckNo(m.truck), date: fmtDate(m.truck.slice(0, 10)) })) : staged[m.manNo] ? tx('staged for Truck {no} · {date}', { no: truckNo(staged[m.manNo]), date: fmtDate(staged[m.manNo].slice(0, 10)) }) : away[m.manNo] ? awayText(away[m.manNo]) : '';
  const list = idx.filter(m => m.manNo !== cur && m.truck !== forTruck), free = list.filter(m => !where(m)), used = list.filter(m => where(m));
  const opt = m => `<option value="${esc(m.manNo)}">${esc(m.manNo)} · ${tx('{consols} consols · {cartons}c', { consols: m.consols, cartons: m.totalCartons })}${m.despatch ? ' · ' + esc(m.despatch) : ''}${where(m) ? ' · ' + esc(where(m)) : ''}</option>`;
  return `<select class="inp" data-field="man" aria-label="${tx('Manifest')}"><option value="">${!list.length ? tx('Nothing in the library yet: publish one in Manifests') : free.length ? tx('Choose a published manifest…') : tx('Every report is on a truck or staged: choose one below')}</option>${free.map(opt).join('')}${used.length ? `<optgroup label="${tx('Already on a truck or staged')}">${used.map(opt).join('')}</optgroup>` : ''}</select>`;
}
function usedManifests(plan) { const s = new Set(); for (const day of Object.values(plan.days || {})) { for (const sl of Object.values(day.slots || {})) if (sl.manifest?.manNo) s.add(sl.manifest.manNo); for (const r of Object.values(day.routes || {})) if (routeManifest(r)) s.add(routeManifest(r)); } return s; }
// Manifests without a slot: drag one onto a truck, or pick Today or Tomorrow.
function waiting(ctx, plan, dock) {
  const used = usedManifests(plan), list = manifestIndex(dock).filter(m => !m.truck && !used.has(m.manNo));
  return `<div class="card pw-wait"><div class="ch"><h3>${tx('Manifests without a slot')}</h3><span class="cs-dim">${list.length ? tx('drag onto a truck') : ''}</span></div>${list.length ? `<div class="pw-wl">${list.map(m => `<div class="pw-w${st.drag === m.manNo ? ' moving' : ''}" draggable="true" data-drag-man="${esc(m.manNo)}"><span class="pw-grip">${ic('grip')}</span><span class="pw-wt"><b>${esc(m.manNo)}</b><span>${tx('{consols} consols · {cartons} cartons', { consols: m.consols, cartons: m.totalCartons.toLocaleString() })}${m.despatch ? ' · ' + tx('despatch {date}', { date: esc(m.despatch) }) : ''}</span></span><button class="btn sm${st.pick?.man === m.manNo && st.pick.day === 0 ? ' primary' : ''}" data-act="stage-next" data-day="0" data-man="${esc(m.manNo)}" title="${tx("Choose today's truck for it")}">${tx('Today')}</button><button class="btn sm${st.pick?.man === m.manNo && st.pick.day === 1 ? ' primary' : ''}" data-act="stage-next" data-day="1" data-man="${esc(m.manNo)}" title="${tx("Choose tomorrow's truck for it: for a report that came in the day before")}">${tx('Tomorrow')}</button></div>${st.pick?.man === m.manNo ? truckChooser(plan, dock, st.pick) : ''}`).join('')}</div><p class="lbl">${tx('Drag one onto a truck to stage it, or pick Today or Tomorrow.')}</p>` : empty(tx('Every published manifest has a truck.'), { sm: true, icon: 'check' })}</div>`;
}
// Today's or tomorrow's trucks for a waiting report: each says what it holds,
// and the report goes on the one chosen (a truck on the dock without one
// takes it now; a planned slot or a free number stages it).
function truckChooser(plan, dock, pick) {
  const date = addDays(storeToday(), pick.day);
  const opt = n => {
    const t = dock.trucks[`${date}-T${n}`], h = (dock.history || []).find(x => x.id === `${date}-T${n}`), sl = plan.days[date]?.slots?.[n];
    if (h || t?.status === 'closed') return `<button class="chip" disabled>${tx('Truck {no}', { no: n })} · ${tx('done')}</button>`;
    if (t) return t.manifest || t.plannedManifest ? `<button class="chip" disabled>${tx('Truck {no}', { no: n })} · ${esc(t.manifest?.manNo || t.plannedManifest)}</button>` : `<button class="chip" data-act="stage-to" data-date="${date}" data-n="${n}">${tx('Truck {no}', { no: n })} · ${tx('on the dock now')}</button>`;
    if (sl?.manifest) return `<button class="chip" disabled>${tx('Truck {no}', { no: n })} · ${esc(sl.manifest.manNo)}</button>`;
    return `<button class="chip" data-act="stage-to" data-date="${date}" data-n="${n}">${tx('Truck {no}', { no: n })} · ${sl ? (sl.eta ? tx('planned {time}', { time: esc(sl.eta) }) : tx('planned')) : tx('new')}</button>`;
  };
  return `<div class="pchoose"><span class="cs-dim">${tx('{man} goes on which truck {day}?', { man: esc(pick.man), day: pick.day ? tx('tomorrow') : tx('today') })}</span><span class="chips">${[1, 2, 3, 4].map(opt).join('')}</span></div>`;
}
// Off-site, to call back (board 4): what is in off-site storage, by
// manifest, each with Call back, so the week can bring it home.
function offsiteCard(ctx, today) {
  const G = offsiteGroups(ctx.store.get('inventory'), today).filter(g => g.state !== 'back');
  if (!G.length) return '';
  const n = G.reduce((k, g) => k + g.live.length, 0), mgr = isMgr(ctx);
  const line2 = g => g.state === 'called' ? tx('Called back: {when}', { when: callText(g.calls[0]) }) : g.overdue ? tx('Overdue: was due back {day}', { day: esc(fmtDay(g.cb)) }) : g.cb ? tx('Due back {day}', { day: esc(fmtDay(g.cb)) }) : tx('No callback date yet');
  return `<div class="card ofg-plan"><div class="ch"><h3>${tx('Off-site, to call back')}</h3><span class="cs-dim">${txn(n, '{n} pallet', '{n} pallets')}</span></div>` +
    G.map(g => `<div class="ofg-pr ${g.state}"><div class="t"><b${g.kind === 'manifest' ? ' class="mono"' : ''}>${groupName(g)}</b><small>${groupSub(g)}</small><span class="ofg-pl${g.overdue && g.state !== 'called' ? ' late' : ''}">${line2(g)}</span></div>` +
      (g.state === 'called' ? `<button class="btn sm" data-act="sel" data-slot="${esc(g.calls[0].date)}-${g.calls[0].slot}">${tx('Open')}</button>` : mgr ? `<button class="btn sm" data-act="callback" data-g="${esc(g.key)}">${ic('undo')}${tx('Call back')}</button>` : '') + `</div>`).join('') +
    `<button class="btn sm ofg-all" data-view="offsite">${ic('stack')}${tx('Off-site pallets')}</button></div>`;
}
// The week's decant roster: new trucks start with these D-numbers when
// their slot names no team. Folded to one line until it is opened.
function roster(dock) {
  const pids = dock.roster?.pids || [];
  if (!st.roster) return `<button class="card pw-ros" data-act="roster-open" aria-expanded="false"><b>${tx('Week roster')}</b><span>${esc(pids.join(' · '))}</span><em>${pids.length ? tx('{n} on', { n: pids.length }) : tx('nobody yet')}</em>${ic('chev')}</button>`;
  return `<div class="card pw-ros-o"><div class="ch"><h3>${tx('Week roster')}</h3><span class="cs-dim">${pids.length ? tx('{n} on', { n: pids.length }) : tx('nobody yet')}</span><button class="ibtn sm" data-act="roster-open" aria-expanded="true" title="${tx('Close')}">${ic('x')}</button></div><div class="dk-team">${pids.map(pid => `<span class="dk-tc on"><span class="av">${esc(pid)}</span><button class="dk-x" data-act="roster-drop" data-pid="${esc(pid)}" title="${tx('Take off the roster')}">${ic('x')}</button></span>`).join('') || empty(tx('Add who is decanting this week.'), { sm: true, icon: 'users' })}</div>` +
    `<div class="bdr-teamadd mt-s"><input class="inp mono" data-field="roster" placeholder="${tx('D-number, e.g. D4')}" maxlength="6" aria-label="${tx('D-number, e.g. D4')}"><button class="btn sm" data-act="roster-add">${ic('plus')}${tx('Add')}</button></div><p class="lbl">${tx('New trucks start with this crew when their slot names no team. D-numbers only.')}</p></div>`;
}

// ── the phone: one day at a time (board H) ─────────────────────────────
function phoneDay(ctx, m) {
  if (st.pday == null) st.pday = Math.max(0, m.keys.indexOf(m.today));
  const d = m.days[st.pday], i = st.pday, b = band(d);
  const days = `<nav class="pw-pdays" aria-label="${tx('Days')}">${m.days.map((x, j) => `<button type="button" class="${j === i ? 'on' : ''}${x.nt && !x.cells.length ? ' none' : ''}" data-act="pday" data-i="${j}" aria-pressed="${j === i}">${DOW[j]}<b>${dateOf(x.k).getDate()}</b><i class="${DAY_DOT(x)}"></i></button>`).join('')}</nav>`;
  const ready = d.past ? '' : d.isToday || d.ahead ? [d.live.length ? tx('{n} live', { n: d.live.length }) : '', d.planned.length ? tx('{k} / {n} ready', { k: d.ready, n: d.planned.length }) : ''].filter(Boolean).join(' · ') : d.real.length ? tx('{k} of {n} cleared', { k: d.closed.length, n: d.real.length }) : '';
  const head = `<div class="pw-ph"><div class="pw-ph-t"><b>${esc(fmtDay(d.k))}</b>${d.isToday ? `<span class="tday">${tx('Today')}</span>` : ''}<span class="r">${ready}</span></div><span class="pw-bars">${d.cells.map(c => `<i class="${segOf(c)}"></i>`).join('')}</span></div>`;
  const ctr = (icon, k, n, text) => pill(`${ic(icon)}${text}`, n && k === n ? 'good' : d.isToday && k < n ? 'warn' : '', { cls: 'num' });
  const counters = d.open && !d.past ? `<div class="pw-ctr">${ctr('file', d.withMan, d.open, tx('{k}/{n} manifests', { k: d.withMan, n: d.open }))}${ctr('truck', d.withEta, d.open, tx('{k}/{n} ETAs', { k: d.withEta, n: d.open }))}${ctr('users', d.withTeam, d.open, tx('{k}/{n} teams', { k: d.withTeam, n: d.open }))}</div>` : '';
  const bandHtml = `<section class="pw-pband${d.nt && !d.cells.length ? ' none' : ''}" aria-label="${tx('The day')}"><div class="pw-big"><b class="${b.ink || ''}">${b.big}</b>${b.what ? ` <span>${b.what}${d.units && !d.past ? ' · ' + tx('{n} units', { n: abbr(d.units) }) : ''}</span>` : ''}</div><span class="pw-bs ${b.tone}">${b.sub}</span>${counters}</section>`;
  let body;
  if (!d.cells.length && !d.lands.length) {
    body = d.nt ? `<div class="pw-pc pw-span pw-none"><span class="pw-ring">${ic('check')}</span><b>${tx('No trucks')}</b><span>${tx('Confirmed in the Planner')}</span>${d.ahead ? `<button class="pw-btn" data-act="notrucks-off" data-date="${d.k}">${tx('Undo')}</button>` : ''}</div>`
      : d.past ? empty(tx('No trucks'), { icon: 'truck', sm: true })
      : `<div class="pw-pc pw-span pw-unpl"><span class="pw-ring">${ic('cal')}</span><b>${tx('Not planned yet')}</b><span>${tx('Plan a truck, or confirm there are none.')}</span><button class="pw-btn add" data-act="add" data-slot="${d.k}-1">+ ${tx('Truck {no}', { no: 1 })}</button><button class="pw-btn ok" data-act="notrucks" data-date="${d.k}">${ic('check')}${tx('Confirm no trucks')}</button>${isMgr(ctx) ? `<button class="pw-lnk" data-act="route-day" data-date="${d.k}">${ic('route')}${tx('Off-site or diverted…')}</button>` : ''}</div>`;
  } else {
    body = [1, 2, 3, 4].map(n => d.rows[n]).filter(Boolean).map(c => c.kind === 'land'
      ? `<div class="pw-pc pw-land"><span class="pw-tk">${ic('undo')}${c.x.route.route === 'offsite' ? tx('Lands from off-site') : tx('Lands after a diversion')}</span>${cellBody(ctx, d, c, m)}</div>`
      : `<div class="pw-pc pw-${c.kind}" data-act="sel" data-slot="${d.k}-${c.n}">${tk(c.n)}${cellBody(ctx, d, c, m)}</div>`).join('') +
      (d.add ? `<button class="pw-padd" data-act="add" data-slot="${d.k}-${d.add}">+ ${tx('Truck {no}', { no: d.add })}</button>` : '');
  }
  return `<div class="pw-phone">${days}${head}${bandHtml}${body}</div>`;
}

// ── paper: the week for the dock wall (board I) ────────────────────────
function printWeek(ctx) {
  const m = weekModel(ctx), dock = m.dock, rows = m.R, crewOf = list => list.length > 4 && list.every((p, i) => i === 0 || Number(p.slice(1)) === Number(list[i - 1].slice(1)) + 1) ? `${list[0]}–${list[list.length - 1]}` : list.join(' ');
  const cell = (d, c) => {
    if (!c) return d.ahead ? `<div class="pwp-c blank"><span>${tx('Manifest')} ________</span><span>${tx('ETA')} ____ ${tx('Team')} ____</span><small>${tx('Write in if a truck is added')}</small></div>` : `<div class="pwp-c"></div>`;
    if (c.kind === 'land') return `<div class="pwp-c"><b>${tx('Lands from off-site')}</b><span>${tx('Truck {no} of {day}', { no: c.x.n, day: esc(fmtDay(c.x.date)) })}</span></div>`;
    if (c.kind === 'routed') return `<div class="pwp-c"><b>${esc(routeManifest(c.rt) || '')}</b><span>${tx('Not coming to the dock')}</span><span>${routeLine(c.rt)}</span></div>`;
    const t = c.t || dock.trucks[`${d.k}-T${c.n}`], h = c.hist, s = c.slot || {};
    const man = h?.manifest?.manNo || t?.manifest?.manNo || t?.plannedManifest || s.manifest?.manNo;
    const team = (t?.team?.length ? t.team : s.team || []).map(x => x.pid);
    const eta = t?.eta || s.eta, nums = h ? [tx('{n} ctn', { n: (h.cartons || 0).toLocaleString() }), team.length ? tx('{n} crew', { n: team.length }) : ''].filter(Boolean).join(' · ') : man ? [tx('{n} ctn', { n: (s.manifest ? cartonsOf(s.manifest) : t?.manifest ? cartonsOf(t.manifest) : 0).toLocaleString() }), t?.manifest ? tx('{n} consols', { n: (t.manifest.consols || []).length }) : s.manifest ? tx('{n} consols', { n: consolsN(s.manifest) }) : ''].filter(Boolean).join(' · ') : c.kind === 'never' ? tx('no manifest') : d.isToday ? NEEDS.m : tx('comes the night before');
    const late = c.kind === 'planned' && c.lateStart.length ? c.lateStart.map(x => tx('{pid} starts late, {time}', { pid: esc(x.pid), time: esc(x.start) })).join(' · ') : '';
    const landed = t?.landedAt || h?.landedAt, cleared = t?.clearedAt || h?.clearedAt;
    return `<div class="pwp-c"><b>${c.kind === 'never' ? tx('Not received') : man ? esc(man) : `${tx('Manifest')} ________`}</b><span>${nums}</span><span>${tx('ETA')} <b>${eta ? esc(eta) : '____'}</b></span><span>${tx('Team')} <b>${team.length ? esc(crewOf(team)) : '____'}</b></span>${s.note || late ? `<span>${[esc(s.note || ''), late].filter(Boolean).join(' · ')}</span>` : ''}` +
      `<div class="pwp-box"><span>${tx('Landed')}<b>${c.kind === 'never' ? '—' : landed ? fmtHM(landed) : '__:__'}</b></span><span>${tx('truck phase::Cleared')}<b>${c.kind === 'never' ? '—' : cleared ? fmtHM(cleared) : '__:__'}</b></span></div></div>`;
  };
  const head = `<div class="pwp-h"></div>` + m.days.map((d, i) => `<div class="pwp-h${d.isToday ? ' today' : ''}">${dowDay(d.k)}${d.isToday ? ' · ' + tx('today') : ''}</div>`).join('');
  const bandRow = `<div class="pwp-l"><b>${tx('The day')}</b><span>${tx('cartons')}</span></div>` + m.days.map(d => {
    if (!d.cells.length && !d.lands.length) return `<div class="pwp-mid" style="--rs:${rows + 1}"><b>${d.nt ? tx('No trucks') : d.past ? tx('No trucks') : tx('Not planned')}</b><span>${d.nt ? tx('Confirmed') : d.past ? '' : tx('Ask the manager')}</span></div>`;
    const b = band(d); return `<div class="pwp-b"><b>${b.big}${b.what ? ' ' + b.what : ''}</b><span>${d.past || d.closed.length === d.real.length ? b.sub : txn(d.real.length, '{n} truck', '{n} trucks')}</span></div>`;
  }).join('');
  let grid = '';
  for (let r = 1; r <= rows; r++) grid += `<div class="pwp-l"><b>${tx('Truck {no}', { no: r })}</b></div>` + m.days.map(d => !d.cells.length && !d.lands.length ? '' : cell(d, d.rows[r])).join('');
  const cleared = m.days.reduce((n, d) => n + d.closed.length, 0), all = m.days.reduce((n, d) => n + d.ns.length, 0), dec = m.days.reduce((n, d) => n + d.decanted, 0);
  const pids = dock.roster?.pids || [];
  const body = `<div class="pwp${rows > 3 ? ' four' : ''}"><div class="pwp-g">${head}${bandRow}${grid}</div><div class="pwp-foot"><div class="pwp-notes"><b>${tx('Notes')}</b><i></i></div><div class="pwp-ros"><b>${tx('Week roster')}</b><span>${pids.length ? esc(pids.join(' · ')) : tx('nobody yet')}</span><small>${tx('Write the landed and cleared times in the boxes. Enter them at Receiving when you are back at a PC or phone.')}</small></div></div></div>`;
  const y = dateOf(m.keys[6]).getFullYear();
  printSheet({ title: tx('Week plan · {range}', { range: `${dateLabel(m.keys[0])} – ${dateLabel(m.keys[6])} ${y}` }), subtitle: [tx('Back dock'), txn(all, '{n} truck', '{n} trucks'), cleared ? tx('{n} cleared', { n: cleared }) : '', dec ? tx('{n} cartons decanted', { n: dec.toLocaleString() }) : ''].filter(Boolean).join(' · '), body, landscape: true });
}

export default {
  id: 'planner', title: tx('Planner'), icon: 'm-planner', area: 'backdock',
  // On a PC; on the phone a manager's only (the manager phone's Back dock),
  // as Maintenance and Recalls. A crew phone's link goes home.
  deskOnly: s => !(s?.owner || (s?.roles || []).includes('manager')),
  desktop(ctx) {
    const m = weekModel(ctx), rp = repeatOffer(ctx, m);
    const head = vh(tx('Planner'), headSub(m), `<button class="btn pw-print" data-act="print" title="${tx('Print week')}" aria-label="${tx('Print week')}">${ic('print')}<span>${tx('Print week')}</span></button>${weekPills()}`, 'm-planner');
    const week = `${strip(m)}<div class="pw-scroll">${daysCard(m)}${trucksCard(ctx, m)}</div>`;
    // An empty week offers Repeat last week on its own (board J); else the week and its side.
    if (rp) return head + `<div class="pw solo"><div class="pw-main">${rp}</div></div>`;
    return head + `<div class="pw${st.drag ? ' dragging' : ''}"><div class="pw-main">${week}</div><aside class="pw-side">${editorCard(ctx, m.plan, m.dock)}${waiting(ctx, m.plan, m.dock)}${offsiteCard(ctx, m.today)}${roster(m.dock)}</aside></div>${editorSheet(ctx, m.plan, m.dock)}`;
  },
  mobile(ctx) {
    const m = weekModel(ctx), rp = repeatOffer(ctx, m, true);
    const head = `<div class="mv-head pw-mhead"><div><h2>${tx('Planner')}</h2></div><span class="pills pw-wk"><button data-act="wk" data-d="-1" aria-label="${tx('Last week')}">‹</button><span>${dateLabel(m.keys[0])} – ${dateLabel(m.keys[6])}</span><button data-act="wk" data-d="1" aria-label="${tx('Next week')}">›</button></span></div>`;
    return head + (rp || phoneDay(ctx, m)) + editorSheet(ctx, m.plan, m.dock);
  },
  mount(ctx, root) {
    const field = n => root.querySelector(`[data-field="${n}"]`)?.value ?? '';
    const set = (date, slot, payload) => ctx.store.dispatch({ type: 'plan.set', entity: { date, slot }, payload });
    const cur = () => { const plan = ctx.store.get('plan'); const date = st.sel.slice(0, 10), n = Number(st.sel.slice(11)); return { date, n, slot: plan.days[date]?.slots?.[n] || { eta: null, note: '', team: [], manifest: null } }; };
    // The editor sits beside the week when the layout has room for it (the
    // wide layout's container query says so); else it opens as a sheet.
    const pick = id => { st.sel = id; st.sheet = ctx.isMobile || getComputedStyle(root.querySelector('.pw') || root).getPropertyValue('--pw-beside').trim() !== '1'; };
    // A manifest onto a truck: one on the dock takes it now, a slot or a free number stages it.
    const stageOn = async (man, date, n) => {
      const t = ctx.store.get('dock').trucks[`${date}-T${n}`];
      if (t) { await attachManifest(ctx, `${date}-T${n}`, man); return toast(tx('{man} attached to Truck {no}, on the dock now', { man, no: n })); }
      const doc = await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(man)}`);
      await set(date, n, { manifest: slotRef(doc) }); toast(tx('{man} staged to Truck {no} on {date}', { man, no: n, date: fmtDate(date) }));
    };
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
      const act = a.dataset.act;
      try {
        if (act === 'wk') { const d = Number(a.dataset.d); st.week = d === 0 ? 0 : st.week + d; st.pday = st.week === 0 ? null : 0; st.sel = null; st.pick = null; ctx.rerender(); }
        else if (act === 'sel') { pick(a.dataset.slot); ctx.rerender(); }
        else if (act === 'unsel') { st.sel = null; ctx.rerender(); }
        else if (act === 'pday') { st.pday = Number(a.dataset.i); ctx.rerender(); }
        else if (act === 'jump') { const sc = root.querySelector('.pw-scroll'), col = root.querySelectorAll('.pw-days .pw-h')[Number(a.dataset.i)]; for (const b of root.querySelectorAll('.pw-strip button')) b.classList.toggle('on', b === a); if (sc && col) sc.scrollTo({ left: Math.max(0, col.offsetLeft - (root.querySelector('.pw-days .pw-lab')?.offsetWidth || 0)), behavior: 'smooth' }); }
        else if (act === 'add') { pick(a.dataset.slot); const { date, n } = cur(); await set(date, n, { eta: null, note: '' }); }
        else if (act === 'save') { const { date, n } = cur(); const eta = field('eta').trim(); if (eta && !/^\d{2}:\d{2}$/.test(eta)) return toast(tx('Enter a time like 06:30'), 'bad'); const hu = field('huddle'), br = field('break'); await set(date, n, { eta: eta || null, note: field('note'), huddleMins: hu === '' ? null : Number(hu), breakMins: br === '' ? null : Number(br) }); toast(tx('Saved')); }
        else if (act === 'remove') { const { date, n } = cur(); if (!await ask({ title: tx('Remove Truck {no} from {date}?', { no: n, date: fmtDate(date) }), text: tx('It comes off the plan for that day.'), ok: tx('Remove truck') })) return; await ctx.store.dispatch({ type: 'plan.remove', entity: { date, slot: n } }); st.sel = null; ctx.rerender(); }
        else if (act === 'team-add') { const v = field('team').trim(); if (!v) return; const { date, n, slot } = cur(); const pid = dnumId(v); if (!pid) return toast(tx('Enter a D-number, like D4. Names are not kept.'), 'bad'); if ((slot.team || []).some(x => x.pid === pid)) return; await set(date, n, { team: [...(slot.team || []), { pid }] }); }
        else if (act === 'team-drop') { const { date, n, slot } = cur(); await set(date, n, { team: (slot.team || []).filter(x => x.pid !== a.dataset.pid) }); }
        else if (act === 'stage-to') {
          const { man } = st.pick || {}; if (!man) return;
          a.disabled = true; st.pick = null; pick(`${a.dataset.date}-${a.dataset.n}`);
          await stageOn(man, a.dataset.date, Number(a.dataset.n));
        }
        else if (act === 'stage-next') { st.pick = st.pick?.man === a.dataset.man && st.pick.day === Number(a.dataset.day) ? null : { man: a.dataset.man, day: Number(a.dataset.day) }; ctx.rerender(); }
        else if (act === 'stage') {
          const { date, n } = cur(), manNo = field('man'); if (!manNo) return toast(tx('Choose a manifest first'), 'bad');
          a.disabled = true;
          const doc = await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(manNo)}`);
          await set(date, n, { manifest: slotRef(doc) });
          toast(tx('{man} staged to Truck {no} on {date}', { man: manNo, no: n, date: fmtDate(date) }));
        }
        else if (act === 'roster-open') { st.roster = !st.roster; ctx.rerender(); }
        else if (act === 'roster-add') { const pid = dnumId(field('roster').trim()); if (!pid) return toast(tx('Enter a D-number, like D4. Names are not kept.'), 'bad'); const cur0 = ctx.store.get('dock').roster?.pids || []; if (cur0.includes(pid)) return; await ctx.store.dispatch({ type: 'dock.roster', entity: {}, payload: { pids: [...cur0, pid] } }); }
        else if (act === 'roster-drop') { const cur0 = ctx.store.get('dock').roster?.pids || []; await ctx.store.dispatch({ type: 'dock.roster', entity: {}, payload: { pids: cur0.filter(x => x !== a.dataset.pid) } }); }
        else if (act === 'route') { await routeSheet(ctx, { date: a.dataset.date, n: Number(a.dataset.n) }); }
        else if (act === 'route-day') { const k = a.dataset.date, ns = numbersOf(ctx.store.get('plan'), ctx.store.get('dock'), k), free = [1, 2, 3, 4].filter(x => !ns.includes(x)); if (await routeSheet(ctx, { date: k, nums: free })) { st.sel = null; ctx.rerender(); } }
        else if (act === 'route-back') { await ctx.store.dispatch({ type: 'plan.route', entity: { date: a.dataset.date, slot: Number(a.dataset.n) }, payload: { route: null } }); toast(tx('Truck {no} on {day}: back on the plan', { no: a.dataset.n, day: fmtDay(a.dataset.date) })); }
        else if (act === 'callback') { const g = offsiteGroups(ctx.store.get('inventory'), storeToday()).find(x => x.key === a.dataset.g); if (g) await callbackSheet(ctx, g); }
        else if (act === 'land-plan') {
          const plan = ctx.store.get('plan'), date = a.dataset.date, n = Number(a.dataset.n), rt = plan.days[date]?.routes?.[n]; if (!rt?.lands) return;
          const ns = numbersOf(plan, ctx.store.get('dock'), rt.lands), to = [1, 2, 3, 4].find(x => !ns.includes(x)); if (!to) return toast(tx('{day} already has four trucks', { day: fmtDay(rt.lands) }), 'bad');
          a.disabled = true;
          let manifest = rt.slot?.manifest || null; const no = routeManifest(rt);
          if (!manifest && no) { try { manifest = slotRef(await ctx.api(`/v1/store/${ctx.storeNo}/manifest/${encodeURIComponent(no)}`)); } catch { manifest = null; } }
          pick(`${rt.lands}-${to}`);
          await set(rt.lands, to, { eta: rt.slot?.eta || null, note: '', from: { date, slot: n }, ...(manifest ? { manifest } : {}) });
          toast(tx('Planned as Truck {no} on {day}', { no: to, day: fmtDay(rt.lands) }));
        }
        else if (act === 'notrucks' || act === 'notrucks-off') { const on = act === 'notrucks'; await ctx.store.dispatch({ type: 'plan.noTrucks', entity: { date: a.dataset.date }, payload: { on } }); toast(on ? tx('{date}: no trucks, confirmed', { date: fmtDate(a.dataset.date) }) : tx('{date}: no-trucks mark cleared', { date: fmtDate(a.dataset.date) })); }
        else if (act === 'attach-truck') { const manNo = field('man'); if (!manNo) return toast(tx('Choose a manifest first'), 'bad'); a.disabled = true; await attachManifest(ctx, a.dataset.truck, manNo); toast(tx('{man} attached to Truck {no}', { man: manNo, no: truckNo(a.dataset.truck) })); }
        else if (act === 'unstage') { const { date, n } = cur(); await set(date, n, { manifest: null }); }
        else if (act === 'print') printWeek(ctx);
        else if (act === 'fresh') { st.fresh.add(weekModel(ctx).keys[0]); ctx.rerender(); }
        else if (act === 'repeat') {
          // Ordinary plan events, one at a time through the one write path.
          const m = weekModel(ctx), evs = repeatWeek(m.plan, m.dock, weekOf(addDays(m.keys[0], -7)), m.keys, m.today); if (!evs.length) return;
          a.disabled = true; let n = 0;
          for (const ev of evs) { await ctx.store.dispatch(ev); if (ev.type === 'plan.set') n++; }
          toast(txn(n, '{n} truck planned from last week', '{n} trucks planned from last week'));
        }
      } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    root.addEventListener('change', async e => {
      const el = e.target; if (!el.dataset?.mtime || !st.sel) return;
      const { date, n, slot } = cur();
      try { await set(date, n, { team: (slot.team || []).map(m => m.pid === el.dataset.pid ? { ...m, [el.dataset.mtime]: el.value || undefined } : m) }); } catch (err) { toast(err.message, 'bad'); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.field === 'roster') { e.preventDefault(); root.querySelector('[data-act="roster-add"]')?.click(); } });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.field === 'team') { e.preventDefault(); root.querySelector('[data-act="team-add"]')?.click(); } });
    // Drag a manifest without a slot onto a truck (board F): the cells that can
    // take it show a dashed outline, the one under the pointer what it does.
    const pw = () => root.querySelector('.pw');
    const over = el => { for (const x of root.querySelectorAll('[data-drop].over')) if (x !== el) x.classList.remove('over'); el?.classList.add('over'); };
    const endDrag = () => { st.drag = null; pw()?.classList.remove('dragging'); over(null); for (const x of root.querySelectorAll('.pw-w.moving')) x.classList.remove('moving'); };
    root.addEventListener('dragstart', e => {
      const w = e.target.closest?.('[data-drag-man]'); if (!w) return;
      st.drag = w.dataset.dragMan; e.dataTransfer.setData('text/plain', st.drag); e.dataTransfer.effectAllowed = 'copy';
      w.classList.add('moving'); pw()?.classList.add('dragging');
    });
    // dragover runs while the pointer moves or rests: the cell under it is the one lit (none off a cell).
    root.addEventListener('dragover', e => { if (!st.drag) return; const c = e.target.closest?.('[data-drop]'); over(c || null); if (!c) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    root.addEventListener('dragend', endDrag);
    root.addEventListener('drop', async e => {
      const c = e.target.closest?.('[data-drop]'), man = st.drag || e.dataTransfer.getData('text/plain'); if (!c || !man) return;
      e.preventDefault(); endDrag();
      const [date, n] = c.dataset.drop.split('|');
      try { pick(`${date}-${n}`); await stageOn(man, date, Number(n)); } catch (err) { toast(err.message, 'bad'); ctx.rerender(); }
    });
    return [ctx.store.on('plan', () => ctx.rerender()), ctx.store.on('dock', () => ctx.rerender()), ctx.store.on('inventory', () => ctx.rerender())];
  },
};
