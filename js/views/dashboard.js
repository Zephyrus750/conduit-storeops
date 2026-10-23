// Dashboard, as the Conduit Shell Swap showcase lays it out: period tabs
// (today, this week, this month), Backfill review, Location refresh and
// Label integrity across the top, the Back dock and Maintenance beneath,
// and the Operations register down the right with the morning-setup
// checklist. Every figure comes from the live projections; a Stockroom or
// Back dock figure needs that area's code on this device (the data never
// reaches it otherwise), so those cards and rows offer the code instead.

import { focusDone } from '../../shared/reducers/floor.js';
import { addDays, retailPeriod } from '../../shared/time.js';
import { ic, esc, vh, greeting, today, dayOf, weekId, cycleId, daysLeftInCycle, ago, dep } from '../ui.js';
import { microCount, MICRO, microCode, microName } from '../data/micros.js';
import { hasArea } from '../unlock.js';
import { teamChip, openTeamFor } from '../team.js';
import { openTrucks, progress, truckNo, fmtHM, fmtMins, openHalt, holdName, forecast, manifestIndex } from './backdock/common.js';
import { ratesFor } from './backdock/plan.js';
import { registerSummary, isFixture, consolidate } from '../../shared/inventory.js';
import { toolOff } from '../../shared/tools.js';
import { tx, txn, locale } from '../i18n.js';

const TARGET = 100, DAILY = 20;
const PERIODS = [['today', tx('Today')], ['week', tx('This week')], ['month', tx('This month')]];
let period = 'today', report = null;          // report: this device's copy of today's SIM report (the store's is in state.backfill.report)
const SEV = [[tx('Low'), '#6B7280'], [tx('Medium'), '#D97706'], [tx('High'), '#DC2626'], [tx('Urgent'), '#7F1D1D']];
const LOAD_ST = { incoming: tx('incoming'), received: tx('received'), offsite: tx('off-site') };
// An issue's status word ("Open" alone is the verb on every link and button).
const OPEN = tx('issue status::Open');

function kpi(cls, icon, title, go, n, d, hl, rows, pct) {
  return `<div class="card kpi${cls ? ' ' + cls : ''}"><div class="kh">${ic(icon)}<h3>${title}</h3><a class="open" data-go="${go}">${tx('Open')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${n}</span><span class="d">${d}</span></div><div class="hl">${hl}</div><div class="rows">${rows.map(r => `<div class="row">${r[0]}<b${r[2] ? ` class="${r[2]}"` : ''}>${r[1]}</b></div>`).join('')}</div>${pct != null ? `<div class="prog"><div class="track"><i style="width:${Math.min(100, Math.round(pct))}%"></i></div><b>${Math.min(100, Math.round(pct))}%</b></div>` : ''}</div>`;
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
  const accRow = [tx('Average accuracy'), acc == null ? '—' : acc + '%', acc == null ? '' : acc >= 90 ? 'c-green' : acc >= 75 ? '' : 'c-red'];
  if (period === 'today') return kpi('hot', 'm-bfreview', tx('Backfill review'), 'bfreview', pend, `/ ${subs.length}`, tx('Locations pending on today’s board'), [accRow, [tx('Keycodes scanned'), codes.toLocaleString()], [tx('Ready · submitted'), `${ready} · ${done}`]], subs.length ? (ready + done) / subs.length * 100 : 0);
  return kpi('hot', 'm-bfreview', tx('Backfill review'), 'bfreview', reviewed.length, `/ ${subs.length}`, period === 'week' ? tx('Locations reviewed this week') : tx('Locations reviewed in {month}', { month: r.label }), [accRow, [tx('Keycodes scanned'), codes.toLocaleString()], [tx('Submitted · ready'), `${done} · ${ready}`]], subs.length ? reviewed.length / subs.length * 100 : 0);
}
function refreshCard(ctx, r) {
  const s = ctx.store.get('refresh'), week = weekId(), focus = s.focus[week] || [];
  const allMarks = Object.entries(s.weeks).flatMap(([w, marks]) => Object.values(marks).map(m => ({ ...m, w })));
  const focusRow = [tx('Focus departments'), focus.length ? focus.map(d => dep(d)).join(' ') : tx('none set')];
  if (period === 'today') { const n = allMarks.filter(m => dayOf(m.at) === r.to).length; return kpi('', 'pin', tx('Location refresh'), 'refresh', n, `/ ${DAILY}`, tx('Shelves refreshed today · daily pace'), [focusRow, [tx('This week'), `${focusDone(s.weeks[week] || {}, focus)} / ${TARGET}`], [tx('Left today'), String(Math.max(0, DAILY - n))]], n / DAILY * 100); }
  if (period === 'week') { const n = focusDone(s.weeks[week] || {}, focus); return kpi('', 'pin', tx('Location refresh'), 'refresh', n, `/ ${TARGET}`, tx('Weekly target · {period}', { period: esc(retailPeriod(new Date())) }), [focusRow, [tx('Shelves left to go'), String(Math.max(0, TARGET - n))], [tx('Marked outside the focus'), String(Object.keys(s.weeks[week] || {}).length - n)]], n / TARGET * 100); }
  const inMonth = allMarks.filter(m => inRange(dayOf(m.at), r)), byWeek = {};
  for (const m of inMonth) byWeek[m.w] = (byWeek[m.w] || 0) + 1;
  const best = Object.entries(byWeek).sort((a, b) => b[1] - a[1])[0];
  return kpi('', 'pin', tx('Location refresh'), 'refresh', inMonth.length, `/ ${TARGET * 4}`, tx('4-week target · {month}', { month: esc(r.label) }), [focusRow, [tx('Shelves left to go'), String(Math.max(0, TARGET * 4 - inMonth.length))], [tx('Best week'), best ? `${esc(best[0])} · ${best[1]}` : '—']], inMonth.length / (TARGET * 4) * 100);
}
function labelsCard(ctx, r) {
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen), checks = L.checks[cyc] || {}, total = microCount(), done = Object.keys(checks).length, wrong = (L.variances[cyc] || []).length;
  const inP = Object.values(checks).filter(c => inRange(dayOf(c.at), r)).length;
  if (done >= total) return kpi('done', 'tag', tx('Label integrity'), 'labelint', total, `/ ${total}`, tx('This cycle is complete ✓'), [[tx('Labels wrong this cycle'), String(wrong), wrong ? 'c-red' : ''], [tx('Cycle'), esc(cyc)], [tx('Next cycle opens in'), txn(daysLeftInCycle(L.cycleLen), '{n} day', '{n} days')]], 100);
  return kpi('', 'tag', tx('Label integrity'), 'labelint', done, `/ ${total}`, period === 'today' ? tx('Micro-departments checked this cycle · {n} today', { n: inP }) : r.label === 'this week' ? tx('Micro-departments checked this cycle · {n} this week', { n: inP }) : tx('Micro-departments checked this cycle · {n} in {month}', { n: inP, month: r.label }), [[tx('Labels wrong this cycle'), String(wrong), wrong ? 'c-red' : ''], [tx('Days left in cycle'), String(daysLeftInCycle(L.cycleLen))], [tx('Still to check'), String(total - done)]], done / total * 100);
}
function dockCard(ctx, r) {
  const caps = ctx.session.current?.caps || [];
  if (!caps.includes('backdock')) return '';
  if (!hasArea(ctx.session, 'backdock')) return lockedCard(tx('Back dock'), 'm-receiving', 'receiving');
  const dock = ctx.store.get('dock');
  if (period === 'today') {
    const t = openTrucks(dock)[0];
    if (!t) { const closed = (dock.history || []).filter(h => h.id.slice(0, 10) === r.to); return `<div class="card kpi dk"><div class="kh">${ic('m-receiving')}<h3>${tx('Back dock')}</h3><a class="open" data-go="receiving">${tx('Open')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${closed.length}</span><span class="d">${txn(closed.length, 'truck cleared today', 'trucks cleared today')}</span></div><div class="hl">${closed.length ? closed.map(h => txn(h.cartons, 'T{truck} · {n} carton · {time}', 'T{truck} · {n} cartons · {time}', { truck: esc(truckNo(h.id)), time: fmtMins(h.clearMins || 0) })).join(' · ') : tx('Nothing on the dock. Land a truck from Receiving.')}</div></div>`; }
    const pr = progress(t), halt = openHalt(t), fc = forecast(t, Date.now(), ratesFor(ctx.store.get('dock'))), crew = (t.team || []).length;
    const facts = [tx('Truck {no}', { no: esc(truckNo(t.id)) }), t.landedAt ? fmtHM(t.landedAt) : tx('staged'), txn(pr.count, '{n} pallet', '{n} pallets'), tx('{n} decanting', { n: pr.active }), t.goalAt ? tx('goal {time}', { time: fmtHM(t.goalAt) }) : '', crew ? tx('{n} crew', { n: crew }) : ''].filter(Boolean);
    return `<div class="card kpi dk"><div class="kh">${ic('m-receiving')}<h3>${tx('Back dock')}</h3><a class="open" data-go="receiving">${tx('Open')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${pr.done}</span><span class="d">${tx('/ {total} cartons decanted', { total: pr.total })}</span></div><div class="hl">${facts.join(' · ')}</div>` +
      `<div class="rows">${halt ? `<div class="row">${tx('On hold')}<b class="c-red">${tx('{hold} since {time}', { hold: esc(holdName(halt)), time: fmtHM(halt.start) })}</b></div>` : ''}<div class="row">${tx('Pallets done')}<b>${pr.doneCount} / ${pr.count}</b></div><div class="row">${tx('Forecast finish')}<b>${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}</b></div></div><div class="prog"><div class="track"><i style="width:${pr.pct}%"></i></div><b>${pr.pct}%</b></div></div>`;
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
  return `<div class="card kpi mt"><div class="kh">${ic('tool')}<h3>${tx('Maintenance')}</h3><a class="open" data-go="maintenance">${tx('Open')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${open.length}</span><span class="hs">${hs}</span></div>` +
    `<div class="rows">${list.map(i => `<div class="row"><span class="l"><span class="pt" style="background:${i.status === 'open' ? '#DC2626' : '#D97706'}"></span><span><b>${esc(i.title)}</b><span class="where">${esc(i.loc || '')}${i.dept ? ' ' + dep(i.dept) : ''} · ${ago(i.created)}</span></span></span><span class="r"><span class="pri p${Math.min(3, (i.sev ?? 1) + 1)}" title="${tx('{sev} severity', { sev: SEV[i.sev ?? 1][0] })}"><i></i><i></i><i></i></span>${chip(i.status === 'open' ? OPEN : tx('Done, to check'), i.status === 'open' ? 'warn' : 'info')}</span></div>`).join('') || `<div class="row">${tx('Nothing open')}<b>✓</b></div>`}</div></div>`;
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
    srOk && [tx('Inventory report'), rep ? tx('Pasted {time} · {bays} bays · {codes} codes', { time: fmtHM(new Date(rep.at).toISOString()), bays: rep.bays, codes: rep.codes }) : tx('Not pasted yet · the board compares against nothing until it is'), !!rep, tx('Paste whole report'), tx('Re-paste'), 'bfreview'],
    dockOk && (none ? [tx('Manifests for today’s trucks'), tx('No trucks today · confirmed in the Planner') + tmrw, true, '', tx('Open'), 'planner'] : manRow(mans, lib, tmrw, dock, t)),
    dockOk && none ? [tx('Planner'), tx('No trucks today · confirmed'), true, '', tx('Open'), 'planner'] : dockOk && [tx('Planner'), mans.length ? `${mans.map(([n]) => { const sl = slots.find(x => Number(x[0]) === n)?.[1]; return `T${n}${sl?.eta ? ' ' + sl.eta : tr.find(x => x[0] === n) ? ' ' + tr.find(x => x[0] === n)[2] : ''}`; }).join(' · ')}${slots.length && slots.every(([, s]) => (s.team || []).length) ? ' · ' + tx('teams set') : ''}` : tx('Today’s trucks not planned · or confirm no trucks in the Planner'), mans.length > 0, tx('Plan today’s trucks'), tx('Open'), 'planner'],
  ].filter(Boolean);
  const B = [
    dockOk && none ? [tx('First truck decant'), tx('No trucks today'), true, '', tx('Open'), 'planner'] : dockOk && [tx('First truck decant'), !first ? tx('No truck on the dock yet today') : first.status === 'closed' || first.clearMins != null ? tx('Closed · {time}', { time: fmtMins(first.clearMins || 0) }) : first.goalAt ? tx('goal {time} · {pct}% decanted', { time: fmtHM(first.goalAt), pct: progress(first).pct }) : tx('{pct}% decanted', { pct: progress(first).pct }), !!first && (first.status === 'closed' || first.clearMins != null), tx('Open the dock'), tx('History'), first && first.clearMins != null ? 'rhistory' : 'receiving'],
    srOk && [tx('Midday report re-paste'), midday ? tx('Pasted {time}', { time: fmtHM(new Date(rep.at).toISOString()) }) : tx('due 12:00 · the room moves after the next truck lands'), !!midday, tx('Paste whole report'), tx('Re-paste'), 'bfreview'],
    [tx('Label integrity · today’s department'), liToday.length ? tx('{list} · checked', { list: liToday.map(([id]) => { const [sid, code] = id.split('-'); const e = (MICRO[sid] || []).find(x => microCode(x) === code); return `${esc(sid.toUpperCase())} ${esc(code)}${e ? ' ' + esc(microName(e)) : ''}`; }).join(' · ') }) : tx('pick the micro-department and print the sheet'), liToday.length > 0, tx('Pick department'), tx('Open'), 'labelint'],
  ].filter(Boolean);
  const row = ([title, text, done, act, again, go]) => `<div class="mrow${done ? ' done' : ''}"><span class="mst">${done ? ic('check') : ''}</span><div class="mtx"><b>${title}</b><span>${text}</span></div>${done ? `<a data-go="${go}">${again}</a>` : `<button class="mact" data-go="${go}">${ic('arrow')}${act}</button>`}</div>`;
  const dA = A.filter(x => x[2]).length, dB = B.filter(x => x[2]).length;
  return `<div class="morn">${A.length ? `<div class="mh"><b>${tx('Morning setup')}</b><span class="cs-dim">${dA === A.length ? tx('{done} of {total} · complete', { done: dA, total: A.length }) : tx('{done} of {total} · do these first', { done: dA, total: A.length })}</span><span class="mprog"><i style="width:${Math.round(dA / A.length * 100)}%"></i></span></div>${A.map(row).join('')}` : ''}` +
    `<div class="mh later"><b>${tx('Later today')}</b><span class="cs-dim">${tx('{done} of {total}', { done: dB, total: B.length })}</span><span class="mprog"><i style="width:${B.length ? Math.round(dB / B.length * 100) : 0}%"></i></span></div>${B.map(row).join('')}</div>`;
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

// ── Today at the store and logistics (Floor P2) ─────────────────────────
// Five tiles for what the floor did today (ShelfSearcher's "Today at") and
// three logistics cards: other loads (Manifests), off-site pallets and the
// latest load, in a store with the Back dock and the off-site tool on. The store map left the
// dashboard (2026-10-14); it has its own view.
function todayAt(ctx) {
  const t = today(), wk = weekId(), R = ctx.store.get('refresh'), marks = Object.values(R.weeks[wk] || {});
  const rToday = marks.filter(m => dayOf(m.at) === t).length;
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen), checks = Object.values(L.checks[cyc] || {}), lToday = checks.filter(c => dayOf(c.at) === t).length;
  const issues = Object.values(ctx.store.get('issues')).filter(i => !i.removed), logged = issues.filter(i => dayOf(i.created) === t).length;
  const serviced = Object.values(ctx.store.get('assets') || {}).reduce((n, a) => n + (a.log || []).filter(l => l.a === 'Serviced' && dayOf(l.t) === t).length, 0);
  const sess = Object.entries(ctx.store.get('stocktake').sessions).find(([, x]) => !x.ended), counted = sess ? Object.values(sess[1].shelves).filter(x => x.state === 'counted' || x.state === 'verified').length : null;
  const tile = (go, icon, n, label, small) => `<button class="tday" data-go="${go}">${ic(icon)}<b>${n}</b><span>${label}</span><small>${small}</small></button>`;
  return `<div class="card tdays"><div class="ch"><h3>${ctx.storeName ? tx('Today at {store}', { store: esc(ctx.storeName) }) : tx('Today at the store')}</h3><span class="cs-dim">${esc(new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(ctx.storeNo || '')}</span></div><div class="tday-row">` +
    tile('refresh', 'm-refresh', rToday, tx('Refreshes'), tx('today · {n} this week', { n: marks.length })) + tile('labelint', 'm-labelint', lToday, tx('Label checks'), tx('today · {n} this cycle', { n: checks.length })) +
    tile('maintenance', 'tool', logged, tx('Maintenance'), txn(logged, 'new log today', 'new logs today')) + tile('emergency', 'm-emergency', serviced, tx('Em. service'), tx('serviced today')) +
    tile('stocktake', 'm-stocktake', counted == null ? '—' : counted, tx('Stocktake'), sess ? tx('counted · session {id}', { id: esc(sess[0]) }) : tx('no session')) + `</div></div>`;
}
function logistics(ctx) {
  if (!(ctx.session.current?.caps || []).includes('backdock') || toolOff(ctx.store.get('tools')?.off, 'inventory')) return '';
  const I = ctx.store.get('inventory') || { offsite: {}, loads: {} }, t = today(), sum = registerSummary(I.offsite, t);
  const loads = Object.values(I.loads).sort((a, b) => (b.recvDate || b.date || '').localeCompare(a.recvDate || a.date || '')), units = l => l.pallets.reduce((n, p) => n + p.items.reduce((k, i) => k + i.q, 0), 0);
  const next = loads.filter(l => l.status === 'incoming').sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0], latest = loads.find(l => l.status === 'received') || loads[0];
  let clr = null; try { const c = JSON.parse(localStorage.getItem(`inventory_prices:${ctx.storeNo}`) || 'null'); if (c) { const on = new Set(Object.entries(c.items || {}).filter(([, v]) => v.clr).map(([k]) => k)); clr = { items: on.size, pallets: Object.values(I.offsite).filter(r => !r.rec && r.products.some(p => on.has(p.kc))).length }; } } catch {}
  const pallets = loads.reduce((n, l) => n + l.pallets.length, 0);
  const inv = `<div class="card kpi logi"><div class="kh">${ic('packages')}<h3>${tx('Other loads')}</h3><a class="open" data-go="manifests">${tx('Open')} ${ic('arrow')}</a></div><div class="rows">` +
    `<div class="row">${tx('Loads')}<b>${txn(pallets, '{loads} · {n} pallet', '{loads} · {n} pallets', { loads: loads.length })}</b></div>` +
    `<div class="row">${tx('Next in')}<b>${next ? `${esc(next.label)} · ${esc(fmtDay(next.date))}` : loads.length ? tx('All loads received') : '—'}</b></div>` +
    `<div class="row">${tx('Off-site')}<b>${txn(sum.live, '{n} pallet', '{n} pallets')}${sum.nextCallback ? ' · ' + tx('callback {date}', { date: esc(fmtDay(sum.nextCallback)) }) : ''}</b></div>` +
    (clr ? `<div class="row go" data-go="offsite">${tx('Clearance')}<b class="${clr.items ? 'c-red' : ''}">${clr.items ? tx('▼ {items} · {pallets} worth calling back', { items: txn(clr.items, '{n} item', '{n} items'), pallets: txn(clr.pallets, '{n} pallet', '{n} pallets') }) : tx('nothing held is marked down')}</b></div>` : '') + `</div></div>`;
  const live = sum.byCallback.slice(0, 4);
  const off = `<div class="card kpi logi"><div class="kh">${ic('m-inventory')}<h3>${tx('Off-site pallets')}</h3><a class="open" data-go="offsite">${tx('Open')} ${ic('arrow')}</a></div><div class="hero"><span class="n">${sum.live}</span><span class="d">${tx('{n} fixtures', { n: sum.fixtures })}${sum.overdue.length ? ` · <b class="c-red">${tx('{n} overdue', { n: sum.overdue.length })}</b>` : ''}</span></div><div class="rows">` +
    (live.length ? live.map(r => `<div class="row go" data-go="offsite" data-pid="${esc(r.pid)}"><span class="l"><b class="mono">${esc(r.pid)}</b> ${esc((r.title || r.desc || '').slice(0, 28))}${isFixture(r) ? ` <span class="inv-pill fx">${tx('Fixtures')}</span>` : ''}</span><b class="${r.cb && r.cb < t ? 'c-red' : ''}">${r.cb ? tx('cb {date}', { date: esc(fmtDay(r.cb)) }) : '—'}</b></div>`).join('') + (sum.live > 4 ? `<div class="row cs-dim">${tx('+{n} more off-site', { n: sum.live - 4 })}</div>` : '') : `<div class="row">${tx('No pallets off-site')}<b>✓</b></div>`) + `</div></div>`;
  const top = latest ? consolidate(latest.pallets).slice(0, 4) : [];
  const lt = `<div class="card kpi logi"><div class="kh">${ic('truck')}<h3>${tx('Latest load')}</h3><a class="open" data-go="manifests"${latest ? ` data-load="${esc(latest.id)}"` : ''}>${tx('Open')} ${ic('arrow')}</a></div>` + (latest ? `<div class="hl"><b style="color:var(--ink)">${esc(latest.label)}</b> · ${esc(LOAD_ST[latest.status] || latest.status)}${latest.recvDate ? ' ' + esc(fmtDay(latest.recvDate)) : ''}</div><div class="rows"><div class="row">${tx('Pallets · units')}<b>${latest.pallets.length} · ${units(latest).toLocaleString('en-AU')}</b></div>${top.map(([d, u]) => `<div class="row"><span class="l"><b class="mono">${esc(d)}</b> ${esc(codeName(d))}</span><b>${u.toLocaleString('en-AU')}</b></div>`).join('')}</div>` : `<div class="hl">${tx('No loads yet. Add one in Manifests.')}</div>`) + `</div>`;
  return `<div class="logis">${inv}${off}${lt}</div>`;
}
const fmtDay = d => d ? new Date(d + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '';
const CODE_NAME = new Map(); for (const list of Object.values(MICRO)) for (const e of list) if (!CODE_NAME.has(microCode(e))) CODE_NAME.set(microCode(e), microName(e));
const codeName = c => CODE_NAME.get(c) || '';

function dashTop(ctx) {
    const r = range(), reg = register(ctx, r);
    const tabs = `<div class="tabs" id="ptabs">${PERIODS.map(([k, l]) => `<button class="${period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>`;
    // The team message and today's briefing sit in the title row on a PC.
    const team = teamChip({ store: ctx.store, session: ctx.session, storeNo: ctx.storeNo, today });
    return vh(`<span class="greet">${greeting()}</span><span id="dashTitle">${tx('How we’re tracking')}</span>`, '', team + tabs, 'm-dashboard') +
      `<div class="dash"><div class="kpis">${backfillCard(ctx, r)}${refreshCard(ctx, r)}${labelsCard(ctx, r)}</div><div class="side2">${dockCard(ctx, r)}${maintCard(ctx, r)}</div>` +
      `<div class="card kpi reg2 register"><div class="kh">${ic('grid')}<h3>${tx('Operations register')}</h3></div><div class="hl">${tx('{n} tools', { n: reg.count })} · <b style="color:var(--ink);font-weight:600">${tx('{n} need attention', { n: reg.need })}</b></div>${period === 'today' ? morning(ctx) : ''}<div class="reg-lbl">${tx('Modules')}</div>${reg.html}</div></div>` +
      `<div class="dash2">${todayAt(ctx)}${logistics(ctx)}</div>`;
}

export default {
  id: 'dashboard', title: tx('Dashboard'), icon: 'm-dashboard',
  deskOnly: true,   // a phone's Home is the store map (or its area's home); a link here goes there
  desktop(ctx) {
    return `<div id="dashTop">${dashTop(ctx)}</div>`;
  },
  mount(ctx, root) {
    const re = () => { const top = root.querySelector('#dashTop'); if (top) top.innerHTML = dashTop(ctx); };
    root.addEventListener('click', e => { const b = e.target.closest('[data-period]'); if (b) { period = b.dataset.period; re(); } });
    root.addEventListener('click', e => { if (e.target.closest('[data-team="open"]')) openTeamFor({ store: ctx.store, session: ctx.session, storeNo: ctx.storeNo, today, onClose: re }); });
    // Today's pasted report lives on the desk that pasted it (bfreview).
    if (ctx.storage && ctx.storeNo) ctx.storage.get(`simreport:${ctx.storeNo}:${today()}`).then(v => { const had = !!report; report = v || null; if (report || had) re(); }).catch(() => {});
    return ['refresh', 'labels', 'issues', 'stocktake', 'assets', 'backfill', 'cages', 'adjustments', 'dock', 'plan', 'inventory', 'comms'].map(k => ctx.store.on(k, re));
  },
};
