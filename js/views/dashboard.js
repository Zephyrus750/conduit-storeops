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
import { openTrucks, progress, truckNo, fmtHM, fmtMins, openHalt, holdName, forecast } from './backdock/common.js';
import { ratesFor } from './backdock/plan.js';

const TARGET = 100, DAILY = 20;
const PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month']];
let period = 'today', report = null;          // report: today's pasted SIM report on this device, if any
const SEV = [['Low', '#6B7280'], ['Medium', '#D97706'], ['High', '#DC2626'], ['Urgent', '#7F1D1D']];

function kpi(cls, icon, title, go, n, d, hl, rows, pct) {
  return `<div class="card kpi${cls ? ' ' + cls : ''}"><div class="kh">${ic(icon)}<h3>${title}</h3><a class="open" data-go="${go}">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${n}</span><span class="d">${d}</span></div><div class="hl">${hl}</div><div class="rows">${rows.map(r => `<div class="row">${r[0]}<b${r[2] ? ` class="${r[2]}"` : ''}>${r[1]}</b></div>`).join('')}</div>${pct != null ? `<div class="prog"><div class="track"><i style="width:${Math.min(100, Math.round(pct))}%"></i></div><b>${Math.min(100, Math.round(pct))}%</b></div>` : ''}</div>`;
}
const lockedCard = (name, icon, view) => `<div class="card kpi locked"><div class="kh">${ic(icon)}<h3>${name}</h3></div><div class="hero"><span class="n">${ic('lock')}</span><span class="d">Needs the ${name} code</span></div><div class="hl">${name} figures stay on the worker until this device has the ${name} or manager code.</div><button type="button" class="btn" data-go="${view}">${ic('lock')}Enter the code</button></div>`;
const chip = (t, k = '') => `<span class="status${k ? ' ' + k : ''}">${t}</span>`;

// The days the chosen period covers, in store days.
function range() {
  const t = today();
  if (period === 'today') return { from: t, to: t, label: 'today' };
  if (period === 'week') { const d = new Date(t + 'T00:00:00Z'), back = (d.getUTCDay() + 6) % 7; return { from: addDays(t, -back), to: t, label: 'this week' }; }
  return { from: t.slice(0, 8) + '01', to: t, label: new Date(t + 'T00:00:00Z').toLocaleString('en-AU', { month: 'long', timeZone: 'UTC' }) };
}
const inRange = (day, r) => day >= r.from && day <= r.to;
const canRead = (ctx, area) => (ctx.session.current?.caps || []).includes(area) && hasArea(ctx.session, area);

// ── the cards ──────────────────────────────────────────────────────────
function backfillCard(ctx, r) {
  const caps = ctx.session.current?.caps || [];
  if (!caps.includes('stockroom')) return '';
  if (!hasArea(ctx.session, 'stockroom')) return lockedCard('Stockroom', 'box', 'bfreview');
  const subs = Object.values(ctx.store.get('backfill').subs).filter(x => inRange(x.date, r));
  const pend = subs.filter(x => x.status === 'pending').length, ready = subs.filter(x => x.status === 'corrected').length, done = subs.filter(x => x.status === 'submitted').length;
  const reviewed = subs.filter(x => x.status !== 'pending'), acc = reviewed.length ? Math.round(reviewed.reduce((n, x) => n + (x.metrics?.accuracy || 0), 0) / reviewed.length) : null;
  const codes = subs.reduce((n, x) => n + Object.values(x.codes || {}).filter(c => c.scanned).length, 0);
  const accRow = ['Average accuracy', acc == null ? '—' : acc + '%', acc == null ? '' : acc >= 90 ? 'c-green' : acc >= 75 ? '' : 'c-red'];
  if (period === 'today') return kpi('hot', 'm-bfreview', 'Backfill review', 'bfreview', pend, `/ ${subs.length}`, 'Locations pending on today’s board', [accRow, ['Keycodes scanned', codes.toLocaleString()], ['Ready · submitted', `${ready} · ${done}`]], subs.length ? (ready + done) / subs.length * 100 : 0);
  return kpi('hot', 'm-bfreview', 'Backfill review', 'bfreview', reviewed.length, `/ ${subs.length}`, `Locations reviewed ${period === 'week' ? 'this week' : 'in ' + r.label}`, [accRow, ['Keycodes scanned', codes.toLocaleString()], ['Submitted · ready', `${done} · ${ready}`]], subs.length ? reviewed.length / subs.length * 100 : 0);
}
function refreshCard(ctx, r) {
  const s = ctx.store.get('refresh'), week = weekId(), focus = s.focus[week] || [];
  const allMarks = Object.entries(s.weeks).flatMap(([w, marks]) => Object.values(marks).map(m => ({ ...m, w })));
  const focusRow = ['Focus departments', focus.length ? focus.map(d => dep(d)).join(' ') : 'none set'];
  if (period === 'today') { const n = allMarks.filter(m => dayOf(m.at) === r.to).length; return kpi('', 'pin', 'Location refresh', 'refresh', n, `/ ${DAILY}`, 'Shelves refreshed today · daily pace', [focusRow, ['This week', `${focusDone(s.weeks[week] || {}, focus)} / ${TARGET}`], ['Left today', String(Math.max(0, DAILY - n))]], n / DAILY * 100); }
  if (period === 'week') { const n = focusDone(s.weeks[week] || {}, focus); return kpi('', 'pin', 'Location refresh', 'refresh', n, `/ ${TARGET}`, `Weekly target · ${esc(retailPeriod(new Date()))}`, [focusRow, ['Shelves left to go', String(Math.max(0, TARGET - n))], ['Marked outside the focus', String(Object.keys(s.weeks[week] || {}).length - n)]], n / TARGET * 100); }
  const inMonth = allMarks.filter(m => inRange(dayOf(m.at), r)), byWeek = {};
  for (const m of inMonth) byWeek[m.w] = (byWeek[m.w] || 0) + 1;
  const best = Object.entries(byWeek).sort((a, b) => b[1] - a[1])[0];
  return kpi('', 'pin', 'Location refresh', 'refresh', inMonth.length, `/ ${TARGET * 4}`, `4-week target · ${esc(r.label)}`, [focusRow, ['Shelves left to go', String(Math.max(0, TARGET * 4 - inMonth.length))], ['Best week', best ? `${esc(best[0])} · ${best[1]}` : '—']], inMonth.length / (TARGET * 4) * 100);
}
function labelsCard(ctx, r) {
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen), checks = L.checks[cyc] || {}, total = microCount(), done = Object.keys(checks).length, wrong = (L.variances[cyc] || []).length;
  const inP = Object.values(checks).filter(c => inRange(dayOf(c.at), r)).length;
  if (done >= total) return kpi('done', 'tag', 'Label integrity', 'labelint', total, `/ ${total}`, 'This cycle is complete ✓', [['Labels wrong this cycle', String(wrong), wrong ? 'c-red' : ''], ['Cycle', esc(cyc)], ['Next cycle opens in', `${daysLeftInCycle(L.cycleLen)} days`]], 100);
  return kpi('', 'tag', 'Label integrity', 'labelint', done, `/ ${total}`, `Micro-departments checked this cycle · ${period === 'today' ? `${inP} today` : `${inP} ${r.label === 'this week' ? 'this week' : 'in ' + r.label}`}`, [['Labels wrong this cycle', String(wrong), wrong ? 'c-red' : ''], ['Days left in cycle', String(daysLeftInCycle(L.cycleLen))], ['Still to check', String(total - done)]], done / total * 100);
}
function dockCard(ctx, r) {
  const caps = ctx.session.current?.caps || [];
  if (!caps.includes('backdock')) return '';
  if (!hasArea(ctx.session, 'backdock')) return lockedCard('Back dock', 'm-receiving', 'receiving');
  const dock = ctx.store.get('dock');
  if (period === 'today') {
    const t = openTrucks(dock)[0];
    if (!t) { const closed = (dock.history || []).filter(h => h.id.slice(0, 10) === r.to); return `<div class="card kpi dk"><div class="kh">${ic('m-receiving')}<h3>Back dock</h3><a class="open" data-go="receiving">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${closed.length}</span><span class="d">truck${closed.length === 1 ? '' : 's'} cleared today</span></div><div class="hl">${closed.length ? closed.map(h => `T${esc(truckNo(h.id))} · ${h.cartons} cartons · ${fmtMins(h.clearMins || 0)}`).join(' · ') : 'Nothing on the dock. Land a truck from Receiving.'}</div></div>`; }
    const pr = progress(t), halt = openHalt(t), fc = forecast(t, Date.now(), ratesFor(ctx.store.get('dock'))), crew = (t.team || []).length;
    return `<div class="card kpi dk"><div class="kh">${ic('m-receiving')}<h3>Back dock</h3><a class="open" data-go="receiving">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${pr.done}</span><span class="d">/ ${pr.total} cartons decanted</span></div><div class="hl">Truck ${esc(truckNo(t.id))} · ${t.landedAt ? fmtHM(t.landedAt) : 'staged'} · ${pr.count} pallets · ${pr.active} decanting${t.goalAt ? ` · goal ${fmtHM(t.goalAt)}` : ''}${crew ? ` · ${crew} crew` : ''}</div>` +
      `<div class="rows">${halt ? `<div class="row">On hold<b class="c-red">${esc(holdName(halt))} since ${fmtHM(halt.start)}</b></div>` : ''}<div class="row">Pallets done<b>${pr.doneCount} / ${pr.count}</b></div><div class="row">Forecast finish<b>${fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—'}</b></div></div><div class="prog"><div class="track"><i style="width:${pr.pct}%"></i></div><b>${pr.pct}%</b></div></div>`;
  }
  const rows = (dock.history || []).filter(h => inRange(h.id.slice(0, 10), r)), cartons = rows.reduce((n, h) => n + (h.cartons || 0), 0);
  return `<div class="card kpi dk"><div class="kh">${ic('m-receiving')}<h3>Back dock</h3><a class="open" data-go="rhistory">History ${ic('arrow')}</a></div><div class="hero"><span class="n">${rows.length}</span><span class="d">truck${rows.length === 1 ? '' : 's'} ${period === 'week' ? 'this week' : 'in ' + esc(r.label)}</span></div><div class="hl">${cartons.toLocaleString()} cartons decanted</div><div class="rows">${rows.slice(-4).reverse().map(h => `<div class="row">${esc(h.id.slice(5, 10))} · T${esc(truckNo(h.id))}<b>${h.cartons} ctn · ${fmtMins(h.clearMins || 0)}${h.teamRate ? ` · ${h.teamRate}/h` : ''}</b></div>`).join('') || '<div class="row">No trucks cleared yet<b>—</b></div>'}</div></div>`;
}
function maintCard(ctx, r) {
  const all = Object.values(ctx.store.get('issues')).filter(i => !i.removed), open = all.filter(i => i.status !== 'completed');
  const logged = all.filter(i => inRange(dayOf(i.created), r)).length, waiting = open.filter(i => i.status === 'progress').length;
  const list = open.slice().sort((a, b) => (b.sev - a.sev) || (a.created < b.created ? -1 : 1)).slice(0, 4);
  return `<div class="card kpi mt"><div class="kh">${ic('tool')}<h3>Maintenance</h3><a class="open" data-go="maintenance">Open ${ic('arrow')}</a></div><div class="hero"><span class="n">${open.length}</span><span class="hs">open · ${logged} logged ${period === 'today' ? 'today' : period === 'week' ? 'this week' : 'in ' + esc(r.label)} · ${waiting} done, waiting for sign-off</span></div>` +
    `<div class="rows">${list.map(i => `<div class="row"><span class="l"><span class="pt" style="background:${i.status === 'open' ? '#DC2626' : '#D97706'}"></span><span><b>${esc(i.title)}</b><span class="where">${esc(i.loc || '')}${i.dept ? ' ' + dep(i.dept) : ''} · ${ago(i.created)}</span></span></span><span class="r"><span class="pri p${Math.min(3, (i.sev ?? 1) + 1)}" title="${SEV[i.sev ?? 1][0]} severity"><i></i><i></i><i></i></span>${chip(i.status === 'open' ? 'Open' : 'Done, to check', i.status === 'open' ? 'warn' : 'info')}</span></div>`).join('') || '<div class="row">Nothing open<b>✓</b></div>'}</div></div>`;
}

// ── the operations register ────────────────────────────────────────────
// The morning checklist, worked out from the day's state (the showcase
// ticked it by hand): the inventory report pasted on this desk, manifests
// attached to today's planned trucks, today's trucks planned; then the
// first truck cleared, the midday re-paste and today's label check.
function morning(ctx) {
  const t = today(), dockOk = canRead(ctx, 'backdock'), srOk = canRead(ctx, 'stockroom');
  const slots = dockOk ? Object.entries(ctx.store.get('plan')?.days?.[t]?.slots || {}).sort((a, b) => a[0] - b[0]) : [];
  const withMan = slots.filter(([, s]) => s.manifest), dock = dockOk ? ctx.store.get('dock') : null;
  const first = dock ? [...openTrucks(dock).filter(x => x.id.slice(0, 10) === t), ...(dock.history || []).filter(h => h.id.slice(0, 10) === t)].sort((a, b) => a.id.localeCompare(b.id))[0] : null;
  const L = ctx.store.get('labels'), cyc = cycleId(L.cycleLen), liToday = Object.entries(L.checks[cyc] || {}).filter(([, c]) => dayOf(c.at) === t);
  const rep = report && srOk ? report : null, midday = rep && new Date(rep.at).getHours() >= 12;
  const A = [
    srOk && ['Inventory report', rep ? `Pasted ${fmtHM(new Date(rep.at).toISOString())} · ${Object.keys(rep.byLoc || {}).length} bays · ${Object.values(rep.byLoc || {}).reduce((n, l) => n + l.length, 0)} codes` : 'Not pasted yet · the board compares against nothing until it is', !!rep, 'Paste whole report', 'Re-paste', 'bfreview'],
    dockOk && ['Manifests for today’s trucks', !slots.length ? 'No trucks planned today' : withMan.length === slots.length ? `${withMan.map(([n, s]) => `${esc(s.manifest)} → T${n}`).join(' · ')} · all attached` : `${slots.length} truck${slots.length === 1 ? '' : 's'} planned · ${withMan.length} attached`, slots.length > 0 && withMan.length === slots.length, 'Attach a manifest', 'Open', 'manifests'],
    dockOk && ['Planner', slots.length ? `${slots.map(([n, s]) => `T${n}${s.eta ? ' ' + s.eta : ''}`).join(' · ')}${slots.every(([, s]) => (s.team || []).length) ? ' · teams set' : ''}` : 'Today’s trucks not planned', slots.length > 0, 'Plan today’s trucks', 'Open', 'planner'],
  ].filter(Boolean);
  const B = [
    dockOk && ['First truck decant', !first ? 'No truck on the dock yet today' : first.status === 'closed' || first.clearMins != null ? `Closed · ${fmtMins(first.clearMins || 0)}` : `${first.goalAt ? `goal ${fmtHM(first.goalAt)} · ` : ''}${progress(first).pct}% decanted`, !!first && (first.status === 'closed' || first.clearMins != null), 'Open the dock', 'History', first && first.clearMins != null ? 'rhistory' : 'receiving'],
    srOk && ['Midday report re-paste', midday ? `Pasted ${fmtHM(new Date(rep.at).toISOString())}` : 'due 12:00 · the room moves after the next truck lands', !!midday, 'Paste whole report', 'Re-paste', 'bfreview'],
    ['Label integrity · today’s department', liToday.length ? liToday.map(([id]) => { const [sid, code] = id.split('-'); const e = (MICRO[sid] || []).find(x => microCode(x) === code); return `${esc(sid.toUpperCase())} ${esc(code)}${e ? ' ' + esc(microName(e)) : ''}`; }).join(' · ') + ' · checked' : 'pick the micro-department and print the sheet', liToday.length > 0, 'Pick department', 'Open', 'labelint'],
  ].filter(Boolean);
  const row = ([title, text, done, act, again, go]) => `<div class="mrow${done ? ' done' : ''}"><span class="mst">${done ? ic('check') : ''}</span><div class="mtx"><b>${title}</b><span>${text}</span></div>${done ? `<a data-go="${go}">${again}</a>` : `<button class="mact" data-go="${go}">${ic('arrow')}${act}</button>`}</div>`;
  const dA = A.filter(x => x[2]).length, dB = B.filter(x => x[2]).length;
  return `<div class="morn">${A.length ? `<div class="mh"><b>Morning setup</b><span class="cs-dim">${dA} of ${A.length}${dA === A.length ? ' · complete' : ' · do these first'}</span><span class="mprog"><i style="width:${Math.round(dA / A.length * 100)}%"></i></span></div>${A.map(row).join('')}` : ''}` +
    `<div class="mh later"><b>Later today</b><span class="cs-dim">${dB} of ${B.length}</span><span class="mprog"><i style="width:${B.length ? Math.round(dB / B.length * 100) : 0}%"></i></span></div>${B.map(row).join('')}</div>`;
}
function register(ctx, r) {
  const caps = ctx.session.current?.caps || [], need = [];
  const code = area => chip(`Needs the ${area === 'backdock' ? 'Back dock' : 'Stockroom'} code`);
  const rows = [];
  if (caps.includes('backdock')) {
    const ok = hasArea(ctx.session, 'backdock'), dock = ok ? ctx.store.get('dock') : null, t = dock ? openTrucks(dock)[0] : null;
    rows.push(['receiving', 'm-receiving', 'Receiving', 'Open', ok ? [t ? chip(`Truck ${esc(truckNo(t.id))} on the dock · ${progress(t).pct}%`, 'warn') : chip('Nothing on the dock')] : [code('backdock')]]);
    if (t) need.push(1);
    const mans = ok ? Object.values(dock.manifests || {}) : [], recent = mans.filter(m => m.publishedAt && inRange(dayOf(m.publishedAt), r));
    rows.push(['manifests', 'file', 'Manifests', 'Open', ok ? [chip(recent.length ? `${recent.length} published ${r.label === 'today' ? 'today' : r.label === 'this week' ? 'this week' : 'in ' + esc(r.label)} · ${recent.reduce((n, m) => n + (m.consols || 0), 0)} consols · ${recent.reduce((n, m) => n + (m.totalCartons || 0), 0).toLocaleString()} cartons` : `${mans.length} in the library`)] : [code('backdock')]]);
    const plan = ok ? ctx.store.get('plan')?.days || {} : {}, tdy = Object.entries(plan[today()]?.slots || {}), next = tdy.filter(([, s]) => s.eta).sort((a, b) => a[1].eta.localeCompare(b[1].eta))[0];
    const weekN = Object.entries(plan).filter(([d]) => inRange(d, r)).reduce((n, [, d]) => n + Object.keys(d.slots || {}).length, 0);
    rows.push(['planner', 'm-planner', 'Planner', 'Open', ok ? [chip(next ? `T${next[0]} due ${esc(next[1].eta)}` : tdy.length ? `${tdy.length} truck${tdy.length === 1 ? '' : 's'} today` : 'Nothing planned today'), ...(period !== 'today' ? [chip(`${weekN} trucks ${r.label === 'this week' ? 'this week' : 'in ' + esc(r.label)}`)] : [])] : [code('backdock')]]);
    rows.push(['profiles', 'box', 'Carton profiles', 'Open', ok ? [chip(`Built from ${mans.length} manifest${mans.length === 1 ? '' : 's'}`)] : [code('backdock')]]);
  }
  const issues = Object.values(ctx.store.get('issues')).filter(i => !i.removed && i.status !== 'completed');
  rows.push(['maintenance', 'tool', 'Maintenance', 'Open', [chip(issues.length ? `${issues.length} open issue${issues.length === 1 ? '' : 's'}` : 'Nothing open', issues.length ? 'warn' : 'good')]]); if (issues.length) need.push(1);
  const assets = ctx.store.get('assets') || {}, due = Object.values(assets).filter(a => a.due && (Date.parse(a.due) - Date.now()) / 86400000 <= 30).length;
  rows.push(['emergency', 'm-emergency', 'Emergency', 'Open', [chip(due ? `${due} service${due === 1 ? '' : 's'} due within 30 days` : 'No services due', due ? 'warn' : 'good')]]); if (due) need.push(1);
  const sess = Object.entries(ctx.store.get('stocktake').sessions).find(([, x]) => !x.ended);
  rows.push(['stocktake', 'm-stocktake', 'Stocktake', sess ? 'Open' : 'Start', [chip(sess ? `Session ${esc(sess[0])} · ${Object.values(sess[1].shelves).filter(x => x.state !== 'pending').length} shelves counted` : 'No session open', sess ? 'info' : '')]]);
  if (caps.includes('stockroom')) {
    const ok = hasArea(ctx.session, 'stockroom'), adj = ok ? ctx.store.get('adjustments') || {} : {}, n = Object.entries(adj).filter(([d]) => inRange(d, r)).reduce((k, [, items]) => k + Object.keys(items || {}).length, 0);
    rows.push(['adjust', 'm-adjust', 'Adjustments', 'Open', ok ? [chip(n ? `${n} line${n === 1 ? '' : 's'} ${period === 'today' ? 'today' : r.label === 'this week' ? 'this week' : 'in ' + esc(r.label)}` : period === 'today' ? 'No SOH evidence today' : 'No lines')] : [code('stockroom')]]);
  }
  const html = `<div class="rows">${rows.map(([go, icon, name, verb, chips]) => `<div class="row"><span class="l">${ic(icon)}<span class="t"><b>${name}</b></span></span><a data-go="${go}">${verb} ${ic('arrow')}</a><span class="st">${chips.join('')}</span></div>`).join('')}</div>`;
  return { html, count: rows.length, need: need.length };
}

export default {
  id: 'dashboard', title: 'Dashboard', icon: 'm-dashboard',
  desktop(ctx) {
    const r = range(), reg = register(ctx, r);
    const tabs = `<div class="tabs" id="ptabs">${PERIODS.map(([k, l]) => `<button class="${period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>`;
    return vh(`<span class="greet">${greeting()}</span><span id="dashTitle">How we’re tracking</span>`, '', tabs, 'm-dashboard') +
      `<div class="dash"><div class="kpis">${backfillCard(ctx, r)}${refreshCard(ctx, r)}${labelsCard(ctx, r)}</div><div class="side2">${dockCard(ctx, r)}${maintCard(ctx, r)}</div>` +
      `<div class="card kpi reg2 register"><div class="kh">${ic('grid')}<h3>Operations register</h3></div><div class="hl">${reg.count} modules · <b style="color:var(--ink);font-weight:600">${reg.need} need attention</b></div>${period === 'today' ? morning(ctx) : ''}<div class="reg-lbl">Modules</div>${reg.html}</div></div>`;
  },
  mount(ctx, root) {
    const re = () => { root.innerHTML = this.desktop(ctx); };
    root.addEventListener('click', e => { const b = e.target.closest('[data-period]'); if (b) { period = b.dataset.period; re(); } });
    // Today's pasted report lives on the desk that pasted it (bfreview).
    if (ctx.storage && ctx.storeNo) ctx.storage.get(`simreport:${ctx.storeNo}:${today()}`).then(v => { const had = !!report; report = v || null; if (report || had) re(); }).catch(() => {});
    return ['refresh', 'labels', 'issues', 'stocktake', 'assets', 'backfill', 'cages', 'adjustments', 'dock', 'plan'].map(k => ctx.store.on(k, re));
  },
};
