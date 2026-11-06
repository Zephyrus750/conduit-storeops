// Dashboard, as the Conduit Shell Swap showcase lays it out: period tabs
// (today, this week, this month), Backfill review, Location refresh and
// Label integrity across the top, the Back dock and Maintenance beneath,
// and the Operations register down the right with the morning-setup
// checklist. Every figure comes from the live projections; a Stockroom or
// Back dock figure needs that area's code on this device (the data never
// reaches it otherwise), so those cards and rows offer the code instead.

import { focusDone } from '../../shared/reducers/floor.js';
import { addDays, retailPeriod } from '../../shared/time.js';
import { ic, esc, vh, greeting, today, dayOf, weekId, cycleId, daysLeftInCycle, timePassed, dep, DEPT_COLOUR, accChip } from '../ui.js';
import { microCount, MICRO, microCode, microName } from '../data/micros.js';
import { hasArea } from '../unlock.js';
import { teamChip, openTeamFor } from '../team.js';
import { openTrucks, progress, truckNo, fmtHM, fmtMins, openHalt, holdName, forecast, manifestIndex, grid, PTYPES, PT_LETTER, PT_ONE, PT_SHORT, PT_COLOUR, openSegs, pace, workedMin, microDept, microName as microTitle } from './backdock/common.js';
import { consolsOf } from '../../shared/reducers/backdock.js';
import { itemCartons } from './backdock/manifests.js';
import { nameOf, ensureNames } from './stockroom/common.js';
import { flags as palletFlags } from './backdock/receiving.js';
import { settingsOf } from '../../shared/reducers/store.js';
import { phaseChip, phaseLine, PHASE_NAME } from './backdock/phase.js';
import { PHASES, truckPhase } from '../../shared/dockphase.js';
import { ratesFor } from './backdock/plan.js';
import { toolOff } from '../../shared/tools.js';
import { openPasteBox } from './pastebox.js';
import { tx, txn, locale } from '../i18n.js';
import { equipmentNeeds } from './equipment.js';
import { recallsNeeding } from './recalls.js';

const TARGET = 100, DAILY = 20;
const PERIODS = [['today', tx('Today')], ['week', tx('This week')], ['month', tx('This month')]];
let period = 'today', report = null;          // report: this device's copy of today's SIM report (the store's is in state.backfill.report)
const SEV = [[tx('Low'), '#6B7280'], [tx('Medium'), '#D97706'], [tx('High'), '#DC2626'], [tx('Urgent'), '#7F1D1D']];
// An issue's status word ("Open" alone is the verb on every link and button).
const OPEN = tx('issue status::Open');

// A card that can finish is 'todo' until it is 'done': a done card steps
// back in soft green with a Done chip, and while any card is done the ones
// still to do take the accent ring (styles/app.css).
const doneTag = (cls, tag) => /\bdone\b/.test(cls || '') ? `<span class="status good donetag" title="${tag || tx('Done')}">${ic('check')}${tag || tx('Done')}</span>` : '';
function kpi(cls, icon, title, go, n, d, hl, rows, pct, tag) {
  return `<div class="card kpi${cls ? ' ' + cls : ''}"><div class="kh">${ic(icon)}<h3>${title}</h3>${doneTag(cls, tag)}<a class="open" data-go="${go}">${tx('Open')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${n}</span><span class="d">${d}</span></div><div class="hl">${hl}</div><div class="rows">${rows.map(r => `<div class="row">${r[0]}<b${r[2] ? ` class="${r[2]}"` : ''}>${r[1]}</b></div>`).join('')}</div>${pct != null ? `<div class="prog"><div class="track"><i style="width:${Math.min(100, Math.round(pct))}%"></i></div><b>${Math.min(100, Math.round(pct))}%</b></div>` : ''}</div>`;
}
const lockedCard = (name, icon, view) => `<div class="card kpi locked"><div class="kh">${ic(icon)}<h3>${name}</h3></div><div class="hero"><span class="n">${ic('lock')}</span><span class="d">${tx('Needs the {area} code', { area: name })}</span></div><div class="hl">${tx('{area} figures stay on the worker until this device has the {area} or manager code.', { area: name })}</div><button type="button" class="btn" data-go="${view}">${ic('lock')}${tx('Enter the code')}</button></div>`;
const chip = (t, k = '') => `<span class="status${k ? ' ' + k : ''}">${t}</span>`;

// The days the chosen period covers, in store days.
function range() {
  const t = today();
  if (period === 'today') return { from: t, to: t, label: 'today' };
  if (period === 'week') { const d = new Date(t + 'T00:00:00Z'), back = (d.getUTCDay() + 6) % 7; return { from: addDays(t, -back), to: t, label: 'this week' }; }
  return { from: t.slice(0, 8) + '01', to: t, label: new Date(t + 'T00:00:00Z').toLocaleString(locale(), { month: 'long', timeZone: 'UTC' }) };
}
const inRange = (day, r) => day >= r.from && day <= r.to;
const canRead = (ctx, area) => (ctx.session.current?.caps || []).includes(area) && hasArea(ctx.session, area);

// ── the cards ──────────────────────────────────────────────────────────
function backfillCard(ctx, r) {
  const caps = ctx.session.current?.caps || [];
  if (!caps.includes('stockroom')) return '';
  if (!hasArea(ctx.session, 'stockroom')) return lockedCard(tx('Stockroom'), 'box', 'bfreview');
  const subs = Object.values(ctx.store.get('backfill').subs).filter(x => inRange(x.date, r));
  const pend = subs.filter(x => x.status === 'pending').length, ready = subs.filter(x => x.status === 'corrected').length, done = subs.filter(x => x.status === 'submitted').length;
  const reviewed = subs.filter(x => x.status !== 'pending'), scored = reviewed.filter(x => Number.isFinite(x.metrics?.accuracy)), acc = scored.length ? Math.round(scored.reduce((n, x) => n + x.metrics.accuracy, 0) / scored.length) : null;   // bays with no report are not scored
  const codes = subs.reduce((n, x) => n + Object.values(x.codes || {}).filter(c => c.scanned).length, 0);
  const accRow = [tx('Average accuracy'), accChip(acc)];
  const fin = subs.length > 0 && done === subs.length, cls = fin ? 'done' : subs.length ? 'hot todo' : 'hot';
  if (period === 'today') return kpi(cls, 'm-backfill', tx('Backfill review'), 'bfreview', reviewed.length, `/ ${subs.length}`, fin ? tx('Every location on today’s board submitted') : tx('Locations reviewed on today’s board'), [accRow, [tx('Keycodes scanned'), codes.toLocaleString()], [tx('Pending · ready · submitted'), `${pend} · ${ready} · ${done}`]], subs.length ? (ready + done) / subs.length * 100 : 0);
  return kpi(cls, 'm-backfill', tx('Backfill review'), 'bfreview', reviewed.length, `/ ${subs.length}`, period === 'week' ? tx('Locations reviewed this week') : tx('Locations reviewed in {month}', { month: r.label }), [accRow, [tx('Keycodes scanned'), codes.toLocaleString()], [tx('Submitted · ready'), `${done} · ${ready}`]], subs.length ? reviewed.length / subs.length * 100 : 0);
}
function refreshCard(ctx, r) {
  const s = ctx.store.get('refresh'), week = weekId(), focus = s.focus[week] || [];
  const allMarks = Object.entries(s.weeks).flatMap(([w, marks]) => Object.values(marks).map(m => ({ ...m, w })));
  const focusRow = [tx('Focus departments'), focus.length ? focus.map(d => dep(d)).join(' ') : tx('none set')];
  const fin = (n, of) => n >= of ? 'done' : 'todo';
  if (period === 'today') { const n = allMarks.filter(m => dayOf(m.at) === r.to).length; return kpi(fin(n, DAILY), 'pin', tx('Location refresh'), 'refresh', n, `/ ${DAILY}`, tx('Shelves refreshed today · daily pace'), [focusRow, [tx('This week'), `${focusDone(s.weeks[week] || {}, focus)} / ${TARGET}`], [tx('Left today'), String(Math.max(0, DAILY - n))]], n / DAILY * 100); }
  if (period === 'week') { const n = focusDone(s.weeks[week] || {}, focus); return kpi(fin(n, TARGET), 'pin', tx('Location refresh'), 'refresh', n, `/ ${TARGET}`, tx('Weekly target · {period}', { period: esc(retailPeriod(new Date())) }), [focusRow, [tx('Shelves left to go'), String(Math.max(0, TARGET - n))], [tx('Marked outside the focus'), String(Object.keys(s.weeks[week] || {}).length - n)]], n / TARGET * 100); }
  const inMonth = allMarks.filter(m => inRange(dayOf(m.at), r)), byWeek = {};
  for (const m of inMonth) byWeek[m.w] = (byWeek[m.w] || 0) + 1;
  const best = Object.entries(byWeek).sort((a, b) => b[1] - a[1])[0];
  return kpi(fin(inMonth.length, TARGET * 4), 'pin', tx('Location refresh'), 'refresh', inMonth.length, `/ ${TARGET * 4}`, tx('4-week target · {month}', { month: esc(r.label) }), [focusRow, [tx('Shelves left to go'), String(Math.max(0, TARGET * 4 - inMonth.length))], [tx('Best week'), best ? `${esc(best[0])} · ${best[1]}` : '—']], inMonth.length / (TARGET * 4) * 100);
}
function labelsCard(ctx, r) {
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen), checks = L.checks[cyc] || {}, total = microCount(), done = Object.keys(checks).length, wrong = (L.variances[cyc] || []).length;
  const inP = Object.values(checks).filter(c => inRange(dayOf(c.at), r)).length;
  if (done >= total) return kpi('done', 'tag', tx('Label integrity'), 'labelint', total, `/ ${total}`, tx('This cycle is complete'), [[tx('Labels wrong this cycle'), String(wrong), wrong ? 'c-red' : ''], [tx('Cycle'), esc(cyc)], [tx('Next cycle opens in'), txn(daysLeftInCycle(L.cycleLen), '{n} day', '{n} days')]], 100);
  return kpi('todo', 'tag', tx('Label integrity'), 'labelint', done, `/ ${total}`, period === 'today' ? tx('Micro-departments checked this cycle · {n} today', { n: inP }) : r.label === 'this week' ? tx('Micro-departments checked this cycle · {n} this week', { n: inP }) : tx('Micro-departments checked this cycle · {n} in {month}', { n: inP, month: r.label }), [[tx('Labels wrong this cycle'), String(wrong), wrong ? 'c-red' : ''], [tx('Days left in cycle'), String(daysLeftInCycle(L.cycleLen))], [tx('Still to check'), String(total - done)]], done / total * 100);
}
// The dock itself, read-only: Receiving's squares (bay, cartons, the
// pallet's mark, its worked time and crew, the first thing it needs) in
// Receiving's colours; hovering or focusing a pallet shows its details.
// With no truck on the dock, the dock's own grid (Settings › Dock grid),
// every bay free.
const PACE = { over: tx('Over its estimate'), near: tx('Close to its estimate'), on: tx('On pace'), under: tx('Under its estimate') };
function dockMini(ctx, t) {
  const g = grid(t || { grid: settingsOf(ctx.store.get('settings')).dockGrid }), byRef = {}, now = Date.now(), rows = Math.ceil(g.refs.length / g.cols);
  for (const p of Object.values(t?.pallets || {})) if (p.ref) byRef[p.ref] = p;
  const n = Object.keys(byRef).length, last = g.refs.length - 1;
  const cells = g.refs.map((ref, i) => {
    const corner = i === 0 ? ' c-tl' : i === g.cols - 1 ? ' c-tr' : i === last - g.cols + 1 && rows > 1 ? ' c-bl' : i === last ? ' c-br' : '';
    const p = byRef[ref];
    if (!p) return `<div class="dkg-c${corner}" title="${ref} · ${tx('free bay')}"><span class="dkg-ref">${ref}</span></div>`;
    if (p.excluded) return `<div class="dkg-c p out${corner}" tabindex="0" data-dkg="${ref}"><span class="dkg-ref">${ref}</span><span class="dkg-ct">${tx('OUT')}</span></div>`;
    const s = p.status || 'landed', pc = pace(t, p, now), crew = openSegs(p).map(x => x.pid).join('+'), fl = palletFlags(t, p)[0];
    const mark = p.suspect ? '⚠' : s === 'active' ? '▶' : s === 'done' ? '✓' : s === 'paused' ? '⏸' : '';
    const live = s === 'active' || s === 'paused';
    return `<div class="dkg-c p t-${PT_LETTER[p.ptype] || 'c'} st-${s}${p.carryover ? ' co' : ''}${pc && s !== 'done' ? ' pc-' + pc : ''}${s === 'done' && pc === 'over' ? ' pc-over' : ''}${p.suspect ? ' sus' : ''}${corner}" tabindex="0" data-dkg="${ref}">` +
      `<span class="dkg-ref">${ref}</span><span class="dkg-ct">${p.cartons ?? '–'}</span>${mark ? `<span class="dkg-mk">${mark}</span>` : ''}` +
      `${fl ? `<span class="dkg-fl ${fl[0]}">${esc(fl[2])}</span>` : ''}${live ? `<span class="dkg-tm" data-dktick="${ref}">${fmtMins(workedMin(t, p, now))}</span>` : ''}${crew ? `<span class="dkg-who">${esc(crew)}</span>` : ''}` +
      `</div>`;
  }).join('');
  const key = PTYPES.map(p => `<span><i style="background:${p[2]}"></i>${PT_SHORT[p[0]]}</span>`).join('') +
    `<span><i class="dn"></i>${tx('Done')}</span><span><i class="ac"></i>${tx('Decanting')}</span>`;
  return `<div class="dkg"><div class="dkg-h"><b>${tx('The dock')}</b><span>${n ? txn(n, '{n} pallet on the dock', '{n} pallets on the dock') : tx('Every bay free')}</span></div>` +
    `<div class="dkg-grid" style="grid-template-columns:repeat(${g.cols},minmax(0,1fr));max-width:${g.cols * 80}px">${cells}</div><div class="dkg-key">${key}</div></div>`;
}
// ── the pallet card ────────────────────────────────────────────────────
// Hovering or focusing a pallet shows what is on it (its consols verified
// on the manifest: micro-departments with their cartons and units, the
// largest products) and its decant (landed, started or finished, crew,
// worked against its estimate, pace, what needs a look). Built when shown,
// in one of three sizes by the room there is: the full card, a compact one
// of icons with values, or two lines of icons.
const SVG = d => `<svg class="dkt-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  box: SVG('<path d="M12 3l8 4.5v9l-8 4.5l-8-4.5v-9z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12l-8-4.5"/>'),
  landed: SVG('<path d="M12 4v12"/><path d="M7 11l5 5l5-5"/><path d="M5 20h14"/>'),
  start: SVG('<path d="M7 4v16l13-8z"/>'),
  done: SVG('<path d="M5 12l5 5l10-10"/>'),
  crew: SVG('<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'),
  clock: SVG('<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0"/><path d="M12 7v5l3 3"/>'),
  scan: SVG('<path d="M4 7v-1a2 2 0 0 1 2-2h2"/><path d="M4 17v1a2 2 0 0 0 2 2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v1"/><path d="M16 20h2a2 2 0 0 0 2-2v-1"/><path d="M5 11h1v2h-1z"/><path d="M10 11v2"/><path d="M14 11h1v2h-1z"/><path d="M19 11v2"/>'),
  lines: SVG('<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M5 6v.01"/><path d="M5 12v.01"/><path d="M5 18v.01"/>'),
  back: SVG('<path d="M9 14l-5-5l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>'),
};
const MARK = { active: '▶', paused: '⏸', done: '✓', sus: '⚠' };
const STATE_CHIP = { landed: tx('Landed'), assigned: tx('Up next'), active: tx('Decanting'), paused: tx('Paused'), done: tx('Done'), out: tx('Left out') };
const microBadge = code => microDept(code) ? dep(microDept(code)) : '<span class="dep" style="background:#94A3B8;color:#fff">?</span>';
const badgeColour = code => DEPT_COLOUR[microDept(code)] || '#94A3B8';
// Everything the card shows, worked out once for the size it is drawn in.
function palData(t, p, now) {
  const cons = consolsOf(t).filter(c => (p.consolIds || []).includes(c.id)), md = new Map(), prods = new Map();
  const row = d => { const k = String(d || '???'); if (!md.has(k)) md.set(k, { code: k, ctn: 0, u: 0 }); return md.get(k); };
  for (const c of cons) {
    for (const [d, ctn] of c.mix?.length ? c.mix : []) row(d).ctn += Number(ctn) || 0;
    for (const it of c.items || []) {
      const r = row(it.dept); r.u += Number(it.q) || 0; if (!c.mix?.length) r.ctn += itemCartons(c, it);
      const q = prods.get(it.k) || { k: it.k, u: 0 }; q.u += Number(it.q) || 0; prods.set(it.k, q);
    }
  }
  const micros = [...md.values()].map(r => ({ ...r, ctn: Math.round(r.ctn) })).sort((a, b) => b.ctn - a.ctn || b.u - a.u);
  const items = [...prods.values()].sort((a, b) => b.u - a.u), units = items.reduce((n, x) => n + x.u, 0);
  const s = p.excluded ? 'out' : p.status || 'landed', segs = p.segments || [], live = s === 'active' || s === 'paused';
  const worked = segs.length ? workedMin(t, p, s === 'done' ? Date.parse(p.doneAt) || now : now) : 0, est = p.expectedMins || 0, pc = pace(t, p, now);
  const paceKey = !segs.length ? 'wait' : pc || 'on';
  return { p, s, cons, micros, items, units, segs, live, worked, est, paceKey,
    people: [...new Set(segs.map(x => x.pid))].join('+'), crewNow: openSegs(p).map(x => x.pid).join('+'),
    flags: palletFlags(t, p), scanned: (p.scanIds || []).length, verified: (p.consolIds || []).length };
}
const PACE_INK = { over: '#B91C1C', near: '#B45309', on: '#15803D', under: '#15803D', wait: '#6B7280' };
const workedText = d => d.segs.length ? (d.est ? tx('{time} worked of est {n} min', { time: fmtMins(d.worked), n: d.est }) : tx('{time} worked', { time: fmtMins(d.worked) })) : d.est ? tx('Not started · est {n} min', { n: d.est }) : tx('Not started');
const clockText = d => d.est ? `${d.segs.length ? Math.round(d.worked) : 0}/${d.est}m` : d.segs.length ? fmtMins(d.worked) : '—';
const scanText = d => d.scanned > d.verified ? `${d.verified}/${d.scanned}` : String(d.verified);
const flagChips = d => `${d.p.carryover ? `<span class="dkt-fc co">↩ ${tx('carried over')}</span>` : ''}${d.flags.map(f => `<span class="dkt-fc ${f[0]}" title="${esc(f[1])}">${esc(f[2])}</span>`).join('')}`;
const head = (d, big) => `<div class="dkt-h"><i class="dkt-sw" style="background:${PT_COLOUR[d.p.ptype] || '#69787F'}"></i><b>${big ? tx('Pallet {ref}', { ref: esc(d.p.ref) }) : esc(d.p.ref)}</b><span class="dkt-sub">${esc(big ? PT_ONE[d.p.ptype] || d.p.ptype || '' : PT_SHORT[d.p.ptype] || '')} · ${big ? txn(d.p.cartons || 0, '{n} carton', '{n} cartons') : tx('{n} ctn', { n: d.p.cartons ?? '–' })}</span><span class="dkt-st st-${d.s}">${STATE_CHIP[d.s] || esc(d.s)}</span></div>`;
function cardFull(d) {
  const top = d.micros.slice(0, 4), max = Math.max(1, ...top.map(m => m.ctn)), pr = d.items.slice(0, 3);
  const ver = d.verified ? `<span class="dkt-ver">${I.scan}${d.verified === 1 ? `<span class="mono">${esc(d.cons[0]?.id || d.p.consolIds[0])}</span> ${tx('verified')}` : txn(d.verified, '{n} consol verified', '{n} consols verified')}</span>` : `<span class="dkt-ver no">${tx('No consol verified yet')}</span>`;
  const on = d.cons.length ? `<div class="dkt-mx">${top.map(m => `${microBadge(m.code)}<span class="dkt-mn"><b class="mono">${esc(m.code)}</b> ${esc(microTitle(m.code) || tx('Unknown micro-department'))}</span><span class="dkt-bar"><i style="width:${Math.round(m.ctn / max * 100)}%"></i></span><span class="dkt-nu">${tx('{n} ctn', { n: m.ctn })} · ${tx('{n}u', { n: m.u })}</span>`).join('')}</div>` +
      (d.micros.length > 4 ? `<div class="dkt-more">${tx('{n} more micro-departments', { n: d.micros.length - 4 })}</div>` : '') +
      (pr.length ? `<div class="dkt-pr">${pr.map(x => `<div><span class="mono">${esc(x.k)}</span><span class="dkt-pn">${esc(nameOf(x.k) || '')}</span><b>${x.u}</b></div>`).join('')}<div class="dkt-more">${d.items.length > 3 ? tx('+{n} more lines · {u} units in all', { n: d.items.length - 3, u: d.units }) : txn(d.units, '{n} unit in all', '{n} units in all')}</div></div>` : '')
    : `<div class="dkt-more">${tx('Scan its label at Receiving to see what is on it.')}</div>`;
  const pace = d.paceKey === 'wait' ? tx('Waiting') : PACE[d.paceKey];
  const bar = d.est ? Math.min(100, Math.round(d.worked / d.est * 100)) : 0;
  return `<div class="dkt-full">${head(d, true)}${d.p.carryover ? `<div class="dkt-co">${I.back}${tx('carried over')}</div>` : ''}` +
    `<div class="dkt-sec"><div class="dkt-lbl"><span>${tx('On this pallet')}</span>${ver}</div>${on}</div><div class="dkt-div"></div>` +
    `<div class="dkt-sec"><div class="dkt-lbl"><span>${tx('Decant')}</span></div><div class="dkt-kv"><div><span>${tx('Landed')}</span><b>${d.p.landedAt ? fmtHM(d.p.landedAt) : '—'}</b></div>` +
    `<div><span>${d.p.doneAt ? tx('Finished') : tx('Started')}</span><b>${d.p.doneAt ? fmtHM(d.p.doneAt) : d.segs[0] ? fmtHM(d.segs[0].start) : '—'}</b></div><div><span>${tx('Crew')}</span><b>${esc(d.crewNow || d.people) || '—'}</b></div></div>` +
    `<div class="dkt-wk"><span>${workedText(d)}</span><b style="color:${PACE_INK[d.paceKey]}">${pace}</b></div><div class="dkt-bar wide"><i style="width:${bar}%;background:${PACE_INK[d.paceKey]}"></i></div></div>` +
    (d.flags.length ? `<div class="dkt-sec dkt-fl"><div class="dkt-lbl"><span>${tx('Needs a look')}</span></div>${d.flags.map(f => `<div><span class="dkt-fc ${f[0]}">${esc(f[2])}</span>${esc(f[1])}</div>`).join('')}</div>` : '') + `</div>`;
}
const iv = (icon, v, label, ink = '') => `<span class="dkt-iv" title="${label}"${ink ? ` style="color:${ink}"` : ''}>${icon}<span class="sr">${label}</span>${v}</span>`;
function cardCompact(d) {
  const top = d.micros.slice(0, 4), first = d.items[0];
  return `<div class="dkt-cmp">${head(d, false)}` +
    (d.cons.length ? `<div class="dkt-mixbar">${d.micros.map(m => `<i style="flex:${Math.max(1, m.ctn)};background:${badgeColour(m.code)}"></i>`).join('')}</div>` +
      `<div class="dkt-chips">${top.map(m => `<span>${microBadge(m.code)}<span class="mono">${esc(m.code)}</span>${m.ctn}</span>`).join('')}${d.micros.length > 4 ? `<span class="dkt-more">+${d.micros.length - 4}</span>` : ''}</div>` +
      (first ? `<div class="dkt-top">${esc(nameOf(first.k) || first.k)} <b>×${first.u}</b>${d.items.length > 1 ? ` <span class="dkt-more">· ${tx('+{n} more', { n: d.items.length - 1 })}</span>` : ''}</div>` : '')
    : `<div class="dkt-more">${tx('No consol verified yet')}</div>`) +
    `<div class="dkt-ig">${iv(I.landed, d.p.landedAt ? fmtHM(d.p.landedAt) : '—', tx('Landed'))}${d.p.doneAt ? iv(I.done, fmtHM(d.p.doneAt), tx('Finished'), '#15803D') : iv(I.start, d.segs[0] ? fmtHM(d.segs[0].start) : '—', tx('Started'))}` +
    `${iv(I.crew, esc(d.crewNow || d.people) || '—', tx('Crew'))}${iv(I.clock, clockText(d), tx('Worked of its estimate'), PACE_INK[d.paceKey])}${iv(I.scan, scanText(d), tx('Consols verified'), d.verified ? '#15803D' : '')}${iv(I.lines, `${d.items.length} · ${tx('{n}u', { n: d.units })}`, tx('Lines and units'))}</div>` +
    (d.flags.length || d.p.carryover ? `<div class="dkt-fcs">${flagChips(d)}</div>` : '') + `</div>`;
}
function cardMini(d) {
  return `<div class="dkt-mini"><div class="dkt-ml"><span class="dkt-iv"><i class="dkt-sw" style="background:${PT_COLOUR[d.p.ptype] || '#69787F'}"></i><b>${esc(d.p.ref)}</b>${MARK[d.p.suspect ? 'sus' : d.s] ? `<span class="dkt-mk st-${d.s}" title="${STATE_CHIP[d.s] || ''}">${MARK[d.p.suspect ? 'sus' : d.s]}</span>` : ''}</span>${iv(I.box, d.p.cartons ?? '–', tx('Cartons'))}${iv(I.clock, clockText(d), tx('Worked of its estimate'), PACE_INK[d.paceKey])}${d.crewNow || d.people ? iv(I.crew, esc(d.crewNow || d.people), tx('Crew')) : ''}</div>` +
    `<div class="dkt-ml">${d.micros.slice(0, 3).map(m => `<span class="dkt-iv">${microBadge(m.code)}${m.ctn}</span>`).join('')}${d.micros.length > 3 ? `<span class="dkt-more">+${d.micros.length - 3}</span>` : ''}${iv(I.scan, scanText(d), tx('Consols verified'), d.verified ? '#15803D' : '')}</div>` +
    (d.flags.length || d.p.carryover ? `<div class="dkt-fcs">${flagChips(d)}</div>` : '') + `</div>`;
}
const CARDS = { full: cardFull, compact: cardCompact, mini: cardMini };
// The floating card: one element on the page beside the square, inside the
// window. The full card on a wide window when it fits beside the square
// and stays under half the window's height; else the compact one when it
// fits; else the two lines of icons.
function dockTips(ctx, root) {
  let tip = null, on = null;
  const hide = () => { tip?.remove(); tip = null; on?.removeAttribute('aria-describedby'); on = null; };
  const place = (r, w, h, pad = 8, gap = 8) => {
    const cy = Math.max(pad, Math.min(innerHeight - h - pad, r.top + r.height / 2 - h / 2)), cx = Math.max(pad, Math.min(innerWidth - w - pad, r.left + r.width / 2 - w / 2));
    if (h > innerHeight - 2 * pad) return null;
    if (r.right + gap + w <= innerWidth - pad) return { x: r.right + gap, y: cy };
    if (r.left - gap - w >= pad) return { x: r.left - gap - w, y: cy };
    if (r.bottom + gap + h <= innerHeight - pad) return { x: cx, y: r.bottom + gap };
    if (r.top - gap - h >= pad) return { x: cx, y: r.top - gap - h };
    return null;
  };
  const fill = cell => {
    const t = openTrucks(ctx.store.get('dock'))[0], p = t?.pallets?.[cell.dataset.dkg]; if (!p) return hide();
    const d = palData(t, p, Date.now()), r = cell.getBoundingClientRect();
    const sizes = innerWidth >= 1500 ? ['full', 'compact', 'mini'] : innerWidth >= 1100 ? ['compact', 'mini'] : ['mini'];
    let at = null;
    for (const sz of sizes) {
      tip.className = `dkg-float ${sz}`; tip.innerHTML = CARDS[sz](d);
      at = place(r, tip.offsetWidth, tip.offsetHeight);
      if (at && (sz !== 'full' || tip.offsetHeight <= innerHeight * 0.45)) break;
      at = null;
    }
    at ||= { x: Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left)), y: Math.min(innerHeight - tip.offsetHeight - 8, r.bottom + 8) };
    tip.style.left = `${at.x}px`; tip.style.top = `${Math.max(8, at.y)}px`;
    // Product names arrive from the catalogue: the card fills them in.
    if (ctx.catalogue && d.items.length) ensureNames(ctx, d.items.slice(0, 3).map(x => x.k), () => { if (on === cell && tip) fill(cell); });
  };
  const show = cell => {
    if (on === cell) return; hide();
    on = cell; tip = document.createElement('div'); tip.id = 'dkgTip'; tip.setAttribute('role', 'tooltip'); tip.style.left = '-9999px'; document.body.appendChild(tip);
    cell.setAttribute('aria-describedby', 'dkgTip'); fill(cell);
  };
  root.addEventListener('mouseover', e => { const c = e.target.closest('.dkg-c[data-dkg]'); if (c) show(c); else if (on) hide(); });
  root.addEventListener('mouseleave', hide);
  root.addEventListener('focusin', e => { const c = e.target.closest('.dkg-c[data-dkg]'); if (c) show(c); });
  root.addEventListener('focusout', e => { if (e.target.closest('.dkg-c[data-dkg]')) hide(); });
  addEventListener('scroll', hide, true);
  // Worked time on the running pallets, each half minute, without a repaint.
  const timer = setInterval(() => {
    const t = openTrucks(ctx.store.get('dock'))[0], now = Date.now(); if (!t) return;
    for (const el of root.querySelectorAll('[data-dktick]')) { const p = t.pallets?.[el.dataset.dktick]; if (p) el.textContent = fmtMins(workedMin(t, p, now)); }
  }, 30_000);
  return { hide, off: () => { hide(); clearInterval(timer); removeEventListener('scroll', hide, true); } };
}
function dockCard(ctx, r) {
  const caps = ctx.session.current?.caps || [];
  if (!caps.includes('backdock')) return '';
  if (!hasArea(ctx.session, 'backdock')) return lockedCard(tx('Back dock'), 'm-receiving', 'receiving');
  const dock = ctx.store.get('dock');
  if (period === 'today') {
    // Always the dock's state, even with nothing on it: the truck on the
    // dock and its phase, else what the day holds (planned slots, trucks
    // cleared, a day confirmed with no trucks), and the rows that say so.
    const day = r.to, plan = ctx.store.get('plan')?.days?.[day] || {}, t = openTrucks(dock)[0];
    const done = (dock.history || []).filter(h => h.id.slice(0, 10) === day).sort((a, b) => a.id.localeCompare(b.id));
    const onDock = openTrucks(dock).filter(x => x.id.slice(0, 10) === day), nos = x => Number(truckNo(x.id));
    const taken = new Set([...done.map(nos), ...onDock.map(nos)]);
    const slots = Object.entries(plan.slots || {}).map(([n, sl]) => [Number(n), sl]).sort((a, b) => a[0] - b[0]);
    const planned = new Set([...slots.map(([n]) => n), ...taken]).size, next = slots.find(([n]) => !taken.has(n));
    const last = done.at(-1), none = !planned && !!plan.noTrucks;
    // The truck the card follows: the one on the dock, else the last one
    // closed today (shown as Closed until the next truck lands).
    const ph = t ? truckPhase(t) : last ? 'closed' : null, shown = t || last;
    const steps = ph ? `<ol class="dk-steps6" aria-label="${tx('Truck phase')}">${PHASES.map((x, i) => `<li class="${i < PHASES.indexOf(ph) ? 'dn' : x === ph ? 'on' : ''}"${x === ph ? ' aria-current="step"' : ''}><i></i><span>${PHASE_NAME[x]}</span></li>`).join('')}</ol>` : '';
    const chip = shown ? `<span class="phb-chip ph-${ph}">${PHASE_NAME[ph]}</span> <b>${tx('Truck {no}', { no: esc(truckNo(shown.id)) })}</b>` : `<span class="phb-chip dock-st ${none ? 'none' : 'idle'}">${none ? tx('No trucks today') : tx('No truck on the dock')}</span>`;
    const cartons = done.reduce((n, h) => n + (h.cartons || 0), 0) + onDock.reduce((n, x) => n + progress(x).done, 0);
    const row = (label, value) => `<div class="row">${label}<b>${value}</b></div>`;
    const common = row(tx('Trucks today'), planned ? tx('{done} of {n} cleared', { done: done.length, n: planned }) : none ? tx('none · confirmed in the Planner') : '—') +
      row(tx('Next truck'), next ? `T${next[0]}${next[1].eta ? ' · ' + esc(next[1].eta) : ''}${next[1].manifest?.manNo ? ' · ' + esc(next[1].manifest.manNo) : ''}` : '—') +
      row(tx('Cartons decanted today'), cartons.toLocaleString()) +
      row(tx('Last cleared'), last ? `T${esc(truckNo(last.id))}${last.clearedAt ? ' · ' + fmtHM(last.clearedAt) : ''}${last.clearMins ? ' · ' + fmtMins(last.clearMins) : ''}` : '—');
    const fin = !t && (planned ? done.length >= planned : none), cls = fin ? 'done' : planned ? 'todo' : '';
    const open = `<a class="open" data-go="receiving">${tx('Open')} ${ic('arrow')}</a>`, head = `<div class="kh">${ic('m-receiving')}<h3>${tx('Back dock')}</h3>${doneTag(cls)}${open}</div><div class="dk-chip">${chip}</div>${steps}`;
    const dayHero = `<div class="hero"><span class="n">${done.length}</span><span class="d">${planned ? tx('/ {n} trucks cleared today', { n: planned }) : txn(done.length, 'truck cleared today', 'trucks cleared today')}</span></div>`;
    const dayBar = planned ? `<div class="prog"><div class="track"><i style="width:${Math.round(done.length / planned * 100)}%"></i></div><b>${Math.round(done.length / planned * 100)}%</b></div>` : '';
    // No truck on the dock, or one planned but not landed: the day's trucks.
    if (!t || ph === 'planned') {
      const wait = next ? tx('Waiting for truck {no}', { no: next[0] }) : '';
      const line = t ? phaseLine(t)
        : none ? tx('No trucks today · confirmed in the Planner') : last ? [tx('Finalised {time}', { time: last.clearedAt ? fmtHM(last.clearedAt) : '—' }), wait || tx('Every truck today is cleared.')].join(' · ') : wait || tx('Nothing on the dock. Land a truck from Receiving.');
      return `<div class="card kpi dk${cls ? ' ' + cls : ''}">${head}${dayHero}<div class="hl">${line}</div>${dockMini(ctx, t)}<div class="rows">${common}</div>${dayBar}</div>`;
    }
    const pr = progress(t), halt = openHalt(t), fc = forecast(t, Date.now(), ratesFor(ctx.store.get('dock'))), crew = (t.team || []).length;
    const facts = [t.landedAt ? tx('landed {time}', { time: fmtHM(t.landedAt) }) : '', crew ? tx('{n} crew', { n: crew }) : '', t.goalAt ? tx('goal {time}', { time: fmtHM(t.goalAt) }) : ''].filter(Boolean).join(' · ');
    return `<div class="card kpi dk todo">${head}<div class="hero"><span class="n">${pr.done}</span><span class="d">${tx('/ {total} cartons decanted', { total: pr.total })}</span></div><div class="hl">${phaseLine(t)}${facts ? ` · ${facts}` : ''}</div>${dockMini(ctx, t)}` +
      `<div class="rows">${halt ? `<div class="row">${tx('On hold')}<b class="c-red">${tx('{hold} since {time}', { hold: esc(holdName(halt)), time: fmtHM(halt.start) })}</b></div>` : ''}${row(tx('Pallets done'), `${pr.doneCount} / ${pr.count}`)}${row(tx('Forecast finish'), fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—')}${common}</div><div class="prog"><div class="track"><i style="width:${pr.pct}%"></i></div><b>${pr.pct}%</b></div></div>`;
  }
  const rows = (dock.history || []).filter(h => inRange(h.id.slice(0, 10), r)), cartons = rows.reduce((n, h) => n + (h.cartons || 0), 0);
  const trucks = period === 'week' ? txn(rows.length, 'truck this week', 'trucks this week') : txn(rows.length, 'truck in {month}', 'trucks in {month}', { month: esc(r.label) });
  return `<div class="card kpi dk"><div class="kh">${ic('m-receiving')}<h3>${tx('Back dock')}</h3><a class="open" data-go="rhistory">${tx('History')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${rows.length}</span><span class="d">${trucks}</span></div><div class="hl">${txn(cartons, '{n} carton decanted', '{n} cartons decanted', { n: cartons.toLocaleString() })}</div><div class="rows">${rows.slice(-4).reverse().map(h => `<div class="row">${esc(h.id.slice(5, 10))} · T${esc(truckNo(h.id))}<b>${h.teamRate ? tx('{n} ctn · {time} · {rate}/h', { n: h.cartons, time: fmtMins(h.clearMins || 0), rate: h.teamRate }) : tx('{n} ctn · {time}', { n: h.cartons, time: fmtMins(h.clearMins || 0) })}</b></div>`).join('') || `<div class="row">${tx('No trucks cleared yet')}<b>—</b></div>`}</div></div>`;
}
function maintCard(ctx, r) {
  const all = Object.values(ctx.store.get('issues')).filter(i => !i.removed), open = all.filter(i => i.status !== 'completed');
  const logged = all.filter(i => inRange(dayOf(i.created), r)).length, waiting = open.filter(i => i.status === 'progress').length;
  const list = open.slice().sort((a, b) => (b.sev - a.sev) || (a.created < b.created ? -1 : 1)).slice(0, 4);
  const hs = period === 'today' ? tx('open · {logged} logged today · {waiting} done, waiting for sign-off', { logged, waiting }) : period === 'week' ? tx('open · {logged} logged this week · {waiting} done, waiting for sign-off', { logged, waiting }) : tx('open · {logged} logged in {month} · {waiting} done, waiting for sign-off', { logged, waiting, month: esc(r.label) });
  const cls = open.length ? 'todo' : 'done';
  return `<div class="card kpi mt ${cls}"><div class="kh">${ic('tool')}<h3>${tx('Maintenance')}</h3>${doneTag(cls, tx('All clear'))}<a class="open" data-go="maintenance">${tx('Open')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${open.length}</span><span class="hs">${hs}</span></div>` +
    `<div class="rows">${list.map(i => `<div class="row"><span class="l"><span class="pt" style="background:${i.status === 'open' ? '#DC2626' : '#D97706'}"></span><span><b>${esc(i.title)}</b><span class="where">${esc(i.loc || '')}${i.dept ? ' ' + dep(i.dept) : ''} · ${timePassed(i.created)}</span></span></span><span class="r"><span class="pri p${Math.min(3, (i.sev ?? 1) + 1)}" title="${tx('{sev} severity', { sev: SEV[i.sev ?? 1][0] })}"><i></i><i></i><i></i></span>${chip(i.status === 'open' ? OPEN : tx('Done, to check'), i.status === 'open' ? 'warn' : 'info')}</span></div>`).join('') || `<div class="row">${tx('Nothing open')}<b>✓</b></div>`}</div></div>`;
}

// ── the operations register ────────────────────────────────────────────
// The morning checklist, worked out from the day's state (the showcase
// ticked it by hand): the inventory report pasted on this desk, manifests
// attached to today's planned trucks, today's trucks planned; then the
// first truck cleared, the midday re-paste and today's label check.
// Manifests for today's trucks. Done when every truck today has one (on the
// truck or staged on its slot); with no truck today, done once a report is
// published and waiting in the library: the truck takes it when it starts.
function manRow(mans, lib, tmrw, dock, day) {
  const ready = lib.length ? tx('{list} in the library, ready to attach', { list: `${lib.slice(0, 3).map(m => esc(m.manNo)).join(', ')}${lib.length > 3 ? ` +${lib.length - 3}` : ''}` }) : '';
  if (!mans.length) return [tx('Manifests for today’s trucks'), tx('No trucks planned today · {ready}', { ready: ready || tx('no manifest published yet') }) + tmrw, lib.length > 0, tx('Publish a manifest'), tx('Open'), 'manifests'];
  if (mans.every(x => x[1])) return [tx('Manifests for today’s trucks'), tx('{list} · all attached', { list: mans.map(([n, m]) => `${esc(m)} → T${n}`).join(' · ') }) + tmrw, true, '', tx('Open'), 'manifests'];
  // A truck on the dock without one attaches at Receiving; a planned slot stages in the Planner.
  const onDock = openTrucks(dock).some(x => x.id.slice(0, 10) === day && !x.manifest && !x.plannedManifest);
  return [tx('Manifests for today’s trucks'), txn(mans.length, '{n} truck today · {k} with a manifest', '{n} trucks today · {k} with a manifest', { k: mans.filter(x => x[1]).length }) + (ready ? ' · ' + ready : '') + tmrw, false, tx('Attach a manifest'), tx('Open'), onDock ? 'receiving' : 'planner'];
}
function morning(ctx) {
  const t = today(), dockOk = canRead(ctx, 'backdock'), srOk = canRead(ctx, 'stockroom');
  const slots = dockOk ? Object.entries(ctx.store.get('plan')?.days?.[t]?.slots || {}).sort((a, b) => a[0] - b[0]) : [];
  const dock = dockOk ? ctx.store.get('dock') : null;
  // Today's trucks with their manifests: those on the dock or finished (a
  // truck takes over its planned slot) and the slots still to come.
  const tr = dock ? [...openTrucks(dock).filter(x => x.id.slice(0, 10) === t).map(x => [Number(x.id.slice(12)), x.manifest?.manNo || x.plannedManifest, tx('on the dock')]), ...(dock.history || []).filter(h => h.id.slice(0, 10) === t).map(h => [Number(h.id.slice(12)), h.manifest?.manNo, tx('done')])] : [];
  // Published reports not yet on a truck or a planner slot: uploaded and ready to attach.
  const staged = new Set(Object.values(ctx.store.get('plan')?.days || {}).flatMap(d => Object.values(d.slots || {}).map(x => x.manifest?.manNo).filter(Boolean)));
  const lib = dock ? manifestIndex(dock).filter(m => !m.truck && !staged.has(m.manNo)) : [];
  const mans = [...tr, ...slots.filter(([n]) => !tr.some(x => x[0] === Number(n))).map(([n, s]) => [Number(n), s.manifest?.manNo])].sort((a, b) => a[0] - b[0]);
  const tk = (() => { const d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })(), ts = dockOk ? Object.values(ctx.store.get('plan')?.days?.[tk]?.slots || {}) : [];
  // A day confirmed in the Planner with no trucks: nothing expected, so its checklist items are done.
  const none = dockOk && !mans.length && !!ctx.store.get('plan')?.days?.[t]?.noTrucks, noneTmrw = dockOk && !ts.length && !!ctx.store.get('plan')?.days?.[tk]?.noTrucks;
  const tmrw = ts.length ? ' · ' + tx('tomorrow {staged}/{total} staged', { staged: ts.filter(x => x.manifest).length, total: ts.length }) : noneTmrw ? ' · ' + tx('tomorrow no trucks') : '';
  const first = dock ? [...openTrucks(dock).filter(x => x.id.slice(0, 10) === t), ...(dock.history || []).filter(h => h.id.slice(0, 10) === t)].sort((a, b) => a.id.localeCompare(b.id))[0] : null;
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen), liToday = Object.entries(L.checks[cyc] || {}).filter(([, c]) => dayOf(c.at) === t);
  // Today's inventory report: the store's (any desk pasted it), else this device's own copy.
  const meta = srOk ? ctx.store.get('backfill')?.report : null;
  const rep = meta?.date === t ? meta : report && srOk ? { at: report.at, bays: Object.keys(report.byLoc || {}).length, codes: Object.values(report.byLoc || {}).reduce((n, l) => n + l.length, 0) } : null, midday = rep && new Date(rep.at).getHours() >= 12;
  const A = [
    srOk && [`${tx('Morning inventory report')} <span class="chip due">${tx('Required')}</span>`, rep ? tx('Pasted {time} · {bays} bays · {codes} codes', { time: fmtHM(new Date(rep.at).toISOString()), bays: rep.bays, codes: rep.codes }) : tx('Not pasted yet · the board compares against nothing until it is'), !!rep, tx('Paste whole report'), tx('Re-paste'), 'paste'],
    dockOk && (none ? [tx('Manifests for today’s trucks'), tx('No trucks today · confirmed in the Planner') + tmrw, true, '', tx('Open'), 'planner'] : manRow(mans, lib, tmrw, dock, t)),
    dockOk && none ? [tx('Planner'), tx('No trucks today · confirmed'), true, '', tx('Open'), 'planner'] : dockOk && [tx('Planner'), mans.length ? `${mans.map(([n]) => { const sl = slots.find(x => Number(x[0]) === n)?.[1]; return `T${n}${sl?.eta ? ' ' + sl.eta : tr.find(x => x[0] === n) ? ' ' + tr.find(x => x[0] === n)[2] : ''}`; }).join(' · ')}${slots.length && slots.every(([, s]) => (s.team || []).length) ? ' · ' + tx('teams set') : ''}` : tx('Today’s trucks not planned · or confirm no trucks in the Planner'), mans.length > 0, tx('Plan today’s trucks'), tx('Open'), 'planner'],
  ].filter(Boolean);
  const B = [
    dockOk && none ? [tx('First truck decant'), tx('No trucks today'), true, '', tx('Open'), 'planner'] : dockOk && [tx('First truck decant'), !first ? tx('No truck on the dock yet today') : first.status === 'closed' || first.clearMins != null ? tx('Closed · {time}', { time: fmtMins(first.clearMins || 0) }) : first.goalAt ? tx('goal {time} · {pct}% decanted', { time: fmtHM(first.goalAt), pct: progress(first).pct }) : tx('{pct}% decanted', { pct: progress(first).pct }), !!first && (first.status === 'closed' || first.clearMins != null), tx('Open the dock'), tx('History'), first && first.clearMins != null ? 'rhistory' : 'receiving'],
    // Optional: the midday report takes about ten minutes to make, so it never holds the list back.
    srOk && [`${tx('Midday report')} <span class="chip opt">${tx('Optional')}</span>`, midday ? tx('Pasted {time}', { time: fmtHM(new Date(rep.at).toISOString()) }) : tx('After 12:00 if there is time · the room moves after the next truck lands'), !!midday, tx('Paste whole report'), tx('Re-paste'), 'paste', true],
    [tx('Label integrity · today’s department'), liToday.length ? tx('{list} · checked', { list: liToday.map(([id]) => { const [sid, code] = id.split('-'); const e = (MICRO[sid] || []).find(x => microCode(x) === code); return `${esc(sid.toUpperCase())} ${esc(code)}${e ? ' ' + esc(microName(e)) : ''}`; }).join(' · ') }) : tx('pick the micro-department and print the sheet'), liToday.length > 0, tx('Pick department'), tx('Open'), 'labelint'],
  ].filter(Boolean);
  // 'paste' opens the paste pop-up on the clipboard instead of a screen.
  const row = ([title, text, done, act, again, go]) => { const to = go === 'paste' ? 'data-paste="report"' : `data-go="${go}"`; return `<div class="mrow${done ? ' done' : ''}"><span class="mst">${done ? ic('check') : ''}</span><div class="mtx"><b>${title}</b><span>${text}</span></div>${done ? `<a ${to}>${again}</a>` : `<button class="mact" ${to}>${ic(go === 'paste' ? 'clip' : 'arrow')}${act}</button>`}</div>`; };
  const counted = B.filter(x => !x[6] || x[2]), dA = A.filter(x => x[2]).length, dB = counted.filter(x => x[2]).length;
  return `<div class="morn">${A.length ? `<div class="mh"><b>${tx('Morning setup')}</b><span class="cs-dim">${dA === A.length ? tx('{done} of {total} · complete', { done: dA, total: A.length }) : tx('{done} of {total} · do these first', { done: dA, total: A.length })}</span><span class="mprog"><i style="width:${Math.round(dA / A.length * 100)}%"></i></span></div>${A.map(row).join('')}` : ''}` +
    `<div class="mh later"><b>${tx('Later today')}</b><span class="cs-dim">${tx('{done} of {total}', { done: dB, total: counted.length })}</span><span class="mprog"><i style="width:${counted.length ? Math.round(dB / counted.length * 100) : 0}%"></i></span></div>${B.map(row).join('')}</div>`;
}
function register(ctx, r) {
  const caps = ctx.session.current?.caps || [], need = [];
  const code = area => chip(tx('Needs the {area} code', { area: area === 'backdock' ? tx('Back dock') : tx('Stockroom') }));
  const rows = [];
  if (caps.includes('backdock')) {
    const ok = hasArea(ctx.session, 'backdock'), dock = ok ? ctx.store.get('dock') : null, t = dock ? openTrucks(dock)[0] : null;
    rows.push(['receiving', 'm-receiving', tx('Receiving'), tx('Open'), ok ? [t ? chip(tx('Truck {no} on the dock · {pct}%', { no: esc(truckNo(t.id)), pct: progress(t).pct }), 'warn') : chip(tx('Nothing on the dock'))] : [code('backdock')]]);
    if (t) need.push(1);
    const mans = ok ? Object.values(dock.manifests || {}) : [], recent = mans.filter(m => m.publishedAt && inRange(dayOf(m.publishedAt), r));
    const mv = { n: recent.length, consols: recent.reduce((n, m) => n + (m.consols || 0), 0), cartons: recent.reduce((n, m) => n + (m.totalCartons || 0), 0).toLocaleString(), month: esc(r.label) };
    rows.push(['manifests', 'file', tx('Manifests'), tx('Open'), ok ? [chip(recent.length ? (r.label === 'today' ? tx('{n} published today · {consols} consols · {cartons} cartons', mv) : r.label === 'this week' ? tx('{n} published this week · {consols} consols · {cartons} cartons', mv) : tx('{n} published in {month} · {consols} consols · {cartons} cartons', mv)) : tx('{n} in the library', { n: mans.length }))] : [code('backdock')]]);
    const plan = ok ? ctx.store.get('plan')?.days || {} : {}, tdy = Object.entries(plan[today()]?.slots || {}), next = tdy.filter(([, s]) => s.eta).sort((a, b) => a[1].eta.localeCompare(b[1].eta))[0];
    const weekN = Object.entries(plan).filter(([d]) => inRange(d, r)).reduce((n, [, d]) => n + Object.keys(d.slots || {}).length, 0);
    rows.push(['planner', 'm-planner', tx('Planner'), tx('Open'), ok ? [chip(next ? tx('T{truck} due {eta}', { truck: next[0], eta: esc(next[1].eta) }) : tdy.length ? txn(tdy.length, '{n} truck today', '{n} trucks today') : tx('Nothing planned today')), ...(period !== 'today' ? [chip(r.label === 'this week' ? txn(weekN, '{n} truck this week', '{n} trucks this week') : txn(weekN, '{n} truck in {month}', '{n} trucks in {month}', { month: esc(r.label) }))] : [])] : [code('backdock')]]);
    rows.push(['profiles', 'box', tx('Carton profiles'), tx('Open'), ok ? [chip(txn(mans.length, 'Built from {n} manifest', 'Built from {n} manifests'))] : [code('backdock')]]);
  }
  const issues = Object.values(ctx.store.get('issues')).filter(i => !i.removed && i.status !== 'completed');
  rows.push(['maintenance', 'tool', tx('Maintenance'), tx('Open'), [chip(issues.length ? txn(issues.length, '{n} open issue', '{n} open issues') : tx('Nothing open'), issues.length ? 'warn' : 'good')]]); if (issues.length) need.push(1);
  const assets = ctx.store.get('assets') || {}, due = Object.values(assets).filter(a => a.due && (Date.parse(a.due) - Date.now()) / 86400000 <= 30).length;
  rows.push(['emergency', 'm-emergency', tx('Emergency'), tx('Open'), [chip(due ? txn(due, '{n} service due within 30 days', '{n} services due within 30 days') : tx('No services due'), due ? 'warn' : 'good')]]); if (due) need.push(1);
  const eq = equipmentNeeds(ctx.store), eqBad = eq.late + eq.out;
  if (!toolOff(ctx.store.get('tools')?.off, 'equipment')) rows.push(['equipment', 'm-equipment', tx('Equipment checks'), tx('Open'), eq.total ? [eq.late ? chip(txn(eq.late, '{n} check overdue', '{n} checks overdue'), 'bad') : '', eq.out ? chip(tx('{n} out of service', { n: eq.out }), 'bad') : '', eq.soon ? chip(tx('{n} due in 14 days', { n: eq.soon }), 'warn') : '', eqBad || eq.soon ? '' : chip(tx('All in date'), 'good')].filter(Boolean) : [chip(tx('No equipment added yet'))]]); if (eqBad && !toolOff(ctx.store.get('tools')?.off, 'equipment')) need.push(1);
  // Recalls and withdrawals in force: red while any still needs someone.
  const rc = recallsNeeding(ctx.store);
  if (!toolOff(ctx.store.get('tools')?.off, 'recalls')) { rows.push(['recalls', 'alert', tx('Recalls'), tx('Open'), [chip(rc.live ? txn(rc.live, '{n} in force', '{n} in force') : tx('None in force'), rc.need ? 'bad' : rc.live ? 'warn' : 'good')]]); if (rc.need) need.push(1); }
  const sess = Object.entries(ctx.store.get('stocktake').sessions).find(([, x]) => !x.ended), counted = sess ? Object.values(sess[1].shelves).filter(x => x.state !== 'pending').length : 0;
  rows.push(['stocktake', 'm-stocktake', tx('Stocktake'), sess ? tx('Open') : tx('Start'), [chip(sess ? txn(counted, 'Session {id} · {n} shelf counted', 'Session {id} · {n} shelves counted', { id: esc(sess[0]) }) : tx('No session open'), sess ? 'info' : '')]]);
  if (caps.includes('stockroom')) {
    const ok = hasArea(ctx.session, 'stockroom'), adj = ok ? ctx.store.get('adjustments') || {} : {}, n = Object.entries(adj).filter(([d]) => inRange(d, r)).reduce((k, [, items]) => k + Object.keys(items || {}).length, 0);
    const lines = period === 'today' ? txn(n, '{n} line today', '{n} lines today') : r.label === 'this week' ? txn(n, '{n} line this week', '{n} lines this week') : txn(n, '{n} line in {month}', '{n} lines in {month}', { month: esc(r.label) });
    rows.push(['adjust', 'm-adjust', tx('Adjustments'), tx('Open'), ok ? [chip(n ? lines : period === 'today' ? tx('No SOH evidence today') : tx('No lines'))] : [code('stockroom')]]);
  }
  const html = `<div class="rows">${rows.map(([go, icon, name, verb, chips]) => `<div class="row"><span class="l">${ic(icon)}<span class="t"><b>${name}</b></span></span><a data-go="${go}">${verb} ${ic('arrow')}</a><span class="st">${chips.join('')}</span></div>`).join('')}</div>`;
  return { html, count: rows.length, need: need.length };
}
const CODE_NAME = new Map(); for (const list of Object.values(MICRO)) for (const e of list) if (!CODE_NAME.has(microCode(e))) CODE_NAME.set(microCode(e), microName(e));
const codeName = c => CODE_NAME.get(c) || '';

// The title row: the team message and today's briefing, and the period
// tabs. Kept out of #dashTop: with the title bar (Settings › Display) the
// shell lifts this row into the top bar once, and a repaint of #dashTop
// that carried its own copy showed the row twice.
const dashActs = ctx => teamChip({ store: ctx.store, session: ctx.session, storeNo: ctx.storeNo, today }) +
  `<div class="tabs" id="ptabs">${PERIODS.map(([k, l]) => `<button class="${period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>`;
const dashHead = ctx => vh(`<span class="greet">${greeting()}</span><span id="dashTitle">${tx('How we’re tracking')}</span>`, '', dashActs(ctx), 'm-dashboard');
function dashTop(ctx) {
    const r = range(), reg = register(ctx, r);
    return `<div class="dash"><div class="kpis">${backfillCard(ctx, r)}${refreshCard(ctx, r)}${labelsCard(ctx, r)}</div><div class="side2">${dockCard(ctx, r)}${maintCard(ctx, r)}</div>` +
      `<div class="card kpi reg2 register"><div class="kh">${ic('grid')}<h3>${tx('Operations register')}</h3></div><div class="hl">${tx('{n} tools', { n: reg.count })} · <b style="color:var(--ink);font-weight:600">${tx('{n} need attention', { n: reg.need })}</b></div>${period === 'today' ? morning(ctx) : ''}<div class="reg-lbl">${tx('Modules')}</div>${reg.html}</div></div>`;
}

export default {
  id: 'dashboard', title: tx('Dashboard'), icon: 'm-dashboard',
  deskOnly: true,   // a phone's Home is the store map (or its area's home); a link here goes there
  desktop(ctx) {
    return `${dashHead(ctx)}<div id="dashTop">${dashTop(ctx)}</div>`;
  },
  mount(ctx, root) {
    // The body repaints in place; the title row's buttons are refreshed
    // wherever the row is (the page, or the top bar it was lifted into).
    const tips = dockTips(ctx, root);
    const re = () => {
      tips.hide();
      const top = root.querySelector('#dashTop'); if (top) top.innerHTML = dashTop(ctx);
      const acts = document.getElementById('dashTitle')?.closest('.vh')?.querySelector(':scope > .acts'); if (acts) acts.innerHTML = dashActs(ctx);
    };
    root.addEventListener('click', e => { const b = e.target.closest('[data-period]'); if (b) { period = b.dataset.period; re(); } });
    root.addEventListener('click', e => { if (e.target.closest('[data-team="open"]')) openTeamFor({ store: ctx.store, session: ctx.session, storeNo: ctx.storeNo, today, onClose: re }); });
    // Today's pasted report lives on the desk that pasted it (bfreview).
    const mine = () => { if (ctx.storage && ctx.storeNo) ctx.storage.get(`simreport:${ctx.storeNo}:${today()}`).then(v => { const had = !!report; report = v || null; if (report || had) re(); }).catch(() => {}); };
    mine();
    root.addEventListener('click', e => { if (e.target.closest('[data-paste]')) { e.preventDefault(); openPasteBox(ctx, { want: 'report', after: mine }); } });
    return [...['refresh', 'labels', 'issues', 'stocktake', 'assets', 'backfill', 'cages', 'adjustments', 'dock', 'plan', 'inventory', 'comms'].map(k => ctx.store.on(k, re)), tips.off];
  },
};
