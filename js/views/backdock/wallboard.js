// Wallboard: the facilitator's live read of the truck (Decant Visualiser's
// live board). KPI tiles, the flow from manifest to decanted, cartons
// against an even pace to the goal with the projection, each person against
// their 28-day rate, hold-ups, the completion gauge, plain-language
// insights, a timeline of who decanted what (zoomable, pannable), the dock
// layout and the pallet mix. D-numbers only. Repaints every 30 seconds.

import { ic, esc, vh, sub, mhead } from '../../ui.js';
import { PTYPES, PT_COLOUR, PT_NAME, truckNo, fmtHM, openTrucks, pallets, progress, openHalt, running, fmtMins, forecast, goalPace, holdName, grid, startOf, microDept } from './common.js';
import { ratesFor } from './plan.js';
import { consolsOf, segWorkedMs } from '../../../shared/reducers/backdock.js';
import { pacePoints, personNow, insights, downtimeBy } from '../../../shared/dockstats.js';
import { planOpts } from './common.js';
import { schedule } from '../../../shared/dockplan.js';

const st = { zoom: 'fit', pan: 0 };
const ZOOMS = [['fit', 'Fit'], [300, '5h'], [180, '3h'], [120, '2h'], [60, '60m'], [30, '30m']];
const MIN = 60000;
const GROUPS = [['h', 'Home', '#2563EB'], ['c', 'Clothing', '#DB2777'], ['k', 'Kids', '#F59E0B'], ['flex', 'Flex', '#64748B'], ['?', 'Unknown', '#94A3B8']];
const groupOf = code => { const d = microDept(code); return !d ? '?' : d === 'flex' ? 'flex' : d[0]; };

function current(ctx) {
  const dock = ctx.store.get('dock'), open = openTrucks(dock);
  return { dock, t: open.find(x => x.status === 'live') || open[0] || null };
}
const tile = (k, v, note, tone = '') => `<div class="wb-kpi ${tone}"><span>${k}</span><b>${v}</b>${note ? `<small>${note}</small>` : ''}</div>`;

function paceChart(t, now, pr, fcAt) {
  const pts = pacePoints(t, now); if (!pts.length) return '<p class="lbl">The chart starts with the decant clock.</p>';
  const from = pts[0].t, goal = Date.parse(t.goalAt) || null, end = Math.max(now, goal || 0, fcAt || 0, from + 30 * MIN), total = Math.max(pr.total, 1);
  const W = 1100, H = 300, P = 30, x = ms => P + (ms - from) / (end - from) * (W - P * 2), y = c => H - P - c / total * (H - P * 2);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.ctn).toFixed(1)}`).join('');
  const last = pts.at(-1), inHand = pallets(t).filter(p => p.status === 'active').reduce((n, p) => n + (p.cartons || 0), 0);
  const ticks = []; for (let m = Math.ceil(from / (30 * MIN)) * 30 * MIN; m <= end; m += 30 * MIN) ticks.push(m);
  return `<svg class="wb-pace" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cartons decanted against the clock">` +
    ticks.map(m => `<line x1="${x(m)}" x2="${x(m)}" y1="${P}" y2="${H - P}" class="g"/><text x="${x(m)}" y="${H - 8}" text-anchor="middle">${fmtHM(new Date(m).toISOString())}</text>`).join('') +
    `<line x1="${P}" x2="${W - P}" y1="${y(total)}" y2="${y(total)}" class="g"/><text x="${P}" y="${y(total) - 4}">${total} ctn</text>` +
    (goal ? `<path d="M${x(from)} ${y(0)}L${x(goal)} ${y(total)}" class="even"/><text x="${x(goal)}" y="${P - 8}" text-anchor="end" class="even-t">goal ${fmtHM(t.goalAt)}</text>` : '') +
    (fcAt && fcAt > last.t ? `<path d="M${x(last.t)} ${y(last.ctn)}L${x(fcAt)} ${y(total)}" class="proj"/>` : '') +
    (inHand ? `<rect x="${x(last.t) - 3}" y="${y(last.ctn + inHand)}" width="6" height="${Math.max(1, y(last.ctn) - y(last.ctn + inHand))}" class="hand"><title>${inHand} cartons in hand</title></rect>` : '') +
    `<path d="${line}" class="done"/><circle cx="${x(last.t)}" cy="${y(last.ctn)}" r="4" class="dot"/></svg>` +
    `<div class="wb-legend"><span><i class="l done"></i>decanted</span>${goal ? '<span><i class="l even"></i>even pace to the goal</span>' : ''}${fcAt ? '<span><i class="l proj"></i>projection</span>' : ''}${inHand ? `<span><i class="l hand"></i>${inHand} in hand</span>` : ''}</div>`;
}

function gauge(pct) {
  const r = 70, C = Math.PI * r, f = Math.max(0, Math.min(1, pct / 100));
  return `<svg viewBox="0 0 180 104" class="wb-gauge"><path d="M20 94A70 70 0 0 1 160 94" class="bg"/><path d="M20 94A70 70 0 0 1 160 94" class="fg" stroke-dasharray="${(f * C).toFixed(1)} ${C.toFixed(1)}"/><text x="90" y="86" text-anchor="middle">${pct}%</text></svg>`;
}

// Who decanted what over the clock: one lane per person, segments in the
// pallet type's colour, hold-ups shaded across every lane.
// As DV's: what was decanted, each person's personal breaks, and what the
// decant plan has them on next (estimated starts from the queues, faint),
// so Fit runs from the start to the plan's last finish.
function timeline(t, now, rates) {
  const sched = schedule(t, now, planOpts(t, rates)), ahead = {};
  for (const [pid, sc] of Object.entries(sched)) ahead[pid] = (sc.items || []).filter(x => x.tag === 'queued' && x.end > now);
  const planEnd = Math.max(now, ...Object.values(ahead).flat().map(x => x.end));
  const from = Date.parse(startOf(t)) || now, fit = Math.max(30 * MIN, planEnd - from);
  const span = st.zoom === 'fit' ? fit : st.zoom * MIN, maxPan = Math.max(0, now - from - span);
  const right = st.zoom === 'fit' ? from + fit : now - Math.min(maxPan, st.pan * MIN), left = st.zoom === 'fit' ? from : right - span;
  const pct = ms => ((Math.max(left, Math.min(right, ms)) - left) / (right - left) * 100).toFixed(2);
  const people = (t.team || []).map(m => m.pid), segs = {};
  for (const p of pallets(t)) for (const s of p.segments || []) (segs[s.pid] ||= []).push({ p, s });
  for (const pid of Object.keys(segs)) if (!people.includes(pid)) people.push(pid);
  const halts = (t.halts || []).map(h => ({ h, a: Date.parse(h.start), b: Date.parse(h.end) || now })).filter(x => x.b > left && x.a < right);
  const shade = halts.map(x => `<i class="wb-halt${x.h.kind && x.h.kind !== 'halt' ? ' planned' : ''}" style="left:${pct(x.a)}%;width:${(pct(x.b) - pct(x.a)).toFixed(2)}%" title="${esc(holdName(x.h))} ${fmtHM(x.h.start)}–${x.h.end ? fmtHM(x.h.end) : 'now'}"></i>`).join('');
  const inWin = (a, b) => b > left && a < right;
  const brk = pid => (t.breaks || []).filter(b => b.pid === pid).map(b => [Date.parse(b.start), Date.parse(b.end) || now, b]).filter(([a, b]) => inWin(a, b))
    .map(([a, b, x]) => `<i class="wb-brk${x.end ? '' : ' live'}" style="left:${pct(a)}%;width:${Math.max(0.6, pct(b) - pct(a)).toFixed(2)}%" title="Break ${fmtHM(x.start)}–${x.end ? fmtHM(x.end) : 'now'}"></i>`).join('');
  const plan = pid => (ahead[pid] || []).filter(x => inWin(x.start, x.end)).map(x => `<span class="wb-seg plan" style="left:${pct(x.start)}%;width:${Math.max(0.4, pct(x.end) - pct(x.start)).toFixed(2)}%" title="${esc(x.ref)} · planned, about ${fmtHM(new Date(x.start).toISOString())}–${fmtHM(new Date(x.end).toISOString())}">${esc(x.ref)}</span>`).join('');
  const nowLine = planEnd > now && now > left && now < right ? `<i class="wb-now" style="left:${pct(now)}%"></i>` : '';
  const lanes = people.map(pid => `<div class="wb-lane"><b>${esc(pid)}</b><div class="wb-track">${shade}${brk(pid)}${nowLine}${plan(pid)}${(segs[pid] || []).filter(({ s }) => (Date.parse(s.end) || now) > left && Date.parse(s.start) < right).map(({ p, s }) => { const a = Date.parse(s.start), b = Date.parse(s.end) || now; return `<span class="wb-seg${s.end ? '' : ' live'}" style="left:${pct(a)}%;width:${Math.max(0.4, pct(b) - pct(a)).toFixed(2)}%;background:${PT_COLOUR[p.ptype] || '#98A2B3'}" title="${esc(p.ref)} · ${fmtHM(s.start)}–${s.end ? fmtHM(s.end) : 'now'} · ${fmtMins(segWorkedMs(t, s, now) / MIN)} worked">${esc(p.ref)}</span>`; }).join('')}</div></div>`).join('');
  const marks = []; const step = span > 180 * MIN ? 60 * MIN : span > 60 * MIN ? 30 * MIN : 10 * MIN;
  for (let m = Math.ceil(left / step) * step; m <= right; m += step) marks.push(`<span style="left:${pct(m)}%">${fmtHM(new Date(m).toISOString())}</span>`);
  const tools = `<div class="seg wb-zoom">${ZOOMS.map(([k, l]) => `<button class="${String(st.zoom) === String(k) ? 'on' : ''}" data-act="wb-zoom" data-z="${k}">${l}</button>`).join('')}</div>${st.zoom !== 'fit' && maxPan > 0 ? `<button class="btn sm" data-act="wb-pan" data-d="1" title="Earlier">‹</button><button class="btn sm" data-act="wb-pan" data-d="-1" title="Later"${st.pan <= 0 ? ' disabled' : ''}>›</button>` : ''}`;
  return `<div class="card wb-time"><div class="ch"><h3>Timeline</h3><div class="wb-tools">${tools}</div></div>${people.length ? `<div class="wb-axis">${marks.join('')}</div>${lanes}` : '<p class="lbl">No crew yet.</p>'}<div class="wb-legend">${PTYPES.map(x => `<span><i class="l" style="background:${x[2]}"></i>${x[1]}</span>`).join('')}<span><i class="l haltl"></i>hold-up</span><span><i class="l brkl"></i>personal break</span>${planEnd > now ? '<span><i class="l planl"></i>planned (estimate)</span>' : ''}</div></div>`;
}

function mix(t) {
  const ps = pallets(t), by = s => ps.filter(p => (p.status || 'landed') === s).length, n = ps.length || 1;
  const status = [['landed', 'Waiting', '#94A3B8'], ['active', 'Decanting', '#F59E0B'], ['paused', 'Paused', '#A78BFA'], ['done', 'Done', '#16A34A']].map(([k, l, c]) => [l, c, k === 'landed' ? ps.filter(p => !['active', 'paused', 'done'].includes(p.status)).length : by(k)]).filter(x => x[2]);
  const types = PTYPES.map(x => [x[1], x[2], ps.filter(p => p.ptype === x[0]).length]).filter(x => x[2]);
  const bar = list => `<div class="wb-sbar">${list.map(([l, c, v]) => `<i style="flex:${v};background:${c}" title="${l}: ${v}"></i>`).join('')}</div><div class="wb-legend">${list.map(([l, c, v]) => `<span><i class="l" style="background:${c}"></i>${l} ${v}</span>`).join('')}</div>`;
  // Department-group waffle: one square per ~1% of the landed consols' cartons.
  const on = new Set(ps.flatMap(p => p.consolIds || [])), gc = {};
  for (const c of consolsOf(t)) if (on.has(c.id)) for (const it of c.items || []) gc[groupOf(it.dept)] = (gc[groupOf(it.dept)] || 0) + (Number(it.q) || 0);
  const tot = Object.values(gc).reduce((a, b) => a + b, 0), cells = [];
  if (tot) { for (const g of GROUPS) { const k = Math.round((gc[g[0]] || 0) / tot * 100); for (let i = 0; i < k && cells.length < 100; i++) cells.push(g); } while (cells.length < 100 && cells.length) cells.push(cells.at(-1)); }
  return `<div class="card"><div class="ch"><h3>Pallet mix</h3><span class="cs-dim">${ps.length} pallets</span></div><div class="k">Status</div>${bar(status)}<div class="k">Type</div>${bar(types)}` +
    (cells.length ? `<div class="k">Department groups · by units on landed consols</div><div class="wb-waffle">${cells.map(g => `<i style="background:${g[2]}" title="${g[1]}"></i>`).join('')}</div><div class="wb-legend">${GROUPS.filter(g => gc[g[0]]).map(g => `<span><i class="l" style="background:${g[2]}"></i>${g[1]} ${Math.round(gc[g[0]] / tot * 100)}%</span>`).join('')}</div>` : '') + '</div>';
}

export function layout(t) {
  const g = grid(t), run = running(t), who = {}; for (const [pid, ref] of Object.entries(run)) (who[ref] ||= []).push(pid);
  return `<div class="card"><div class="ch"><h3>Dock layout</h3><span class="cs-dim">${progress(t).count} landed</span></div><div class="wb-grid" style="grid-template-columns:repeat(${g.cols},minmax(0,1fr))">${g.refs.map(ref => { const p = t.pallets?.[ref]; if (!p || p.excluded) return `<i class="wb-cell empty"><small>${ref}</small></i>`; return `<i class="wb-cell ${p.status || 'landed'}" style="--pt:${PT_COLOUR[p.ptype] || '#98A2B3'}" title="${esc(ref)} · ${esc(PT_NAME[p.ptype] || '')} · ${p.cartons ?? '–'} ctn · ${esc(p.status || 'landed')}"><small>${ref}</small><b>${p.cartons ?? '–'}</b>${who[ref] ? `<em>${who[ref].map(esc).join('+')}</em>` : ''}</i>`; }).join('')}</div></div>`;
}

function board(ctx) {
  const { dock, t } = current(ctx), now = Date.now();
  const head = vh('Wallboard', sub(t ? `Truck ${esc(truckNo(t.id))} · ${esc(t.status)}` : 'No truck on the dock', 'live read', 'every 30 s'), `<button class="btn sm" data-view="teamboard">${ic('users')}Team Board</button>`, 'chart');
  if (!t) return head + `<div class="card" style="padding:28px;text-align:center"><b>No truck on the dock</b><p class="lbl">The wallboard wakes when the next truck starts.</p></div>`;
  const rates = ratesFor(dock), pr = progress(t), fc = forecast(t, now, rates), goal = Date.parse(t.goalAt) || null, gp = goal ? goalPace(t, now) : null;
  const ahead = gp !== null ? pr.done - Math.round(gp * pr.total) : null;
  const from = Date.parse(startOf(t)), haltMs = (t.halts || []).reduce((n, h) => n + ((Date.parse(h.end) || now) - Date.parse(h.start)), 0), downMs = (t.halts || []).filter(h => (h.kind || 'halt') === 'halt').reduce((n, h) => n + ((Date.parse(h.end) || now) - Date.parse(h.start)), 0);
  const active = from ? (now - from - haltMs) / 3600000 : 0, teamRate = active > 0.05 ? Math.round(pr.done / active) : null;
  const ppl = personNow(t, now, rates), norms = ppl.map(p => p.norm).filter(Boolean), teamNorm = norms.length ? Math.round(norms.reduce((a, b) => a + b, 0)) : null;
  const halt = openHalt(t), run = Object.keys(running(t)).length;
  const kpis = `<div class="wb-kpis">` +
    tile('Cartons decanted', `${pr.done}<small>/${pr.total}</small>`, ahead === null ? 'set a goal to see pace' : ahead >= 0 ? `▲ ${ahead} ahead of pace` : `▼ ${-ahead} behind pace`, ahead === null ? '' : ahead >= 0 ? 'good' : 'warn') +
    tile('Team rate', teamRate === null ? '—' : `${teamRate}<small> ctn/h</small>`, teamNorm ? `28-day crew ${teamNorm} ctn/h` : 'no 28-day rates yet') +
    tile('Forecast finish', fc.at ? fmtHM(new Date(fc.at).toISOString()) : '—', !fc.at ? (halt ? 'paused while held up' : 'needs a crew') : goal ? (fc.at <= goal ? `${Math.round((goal - fc.at) / MIN)} min before the goal` : `${Math.round((fc.at - goal) / MIN)} min past the goal`) : 'no goal set', fc.at && goal ? (fc.at <= goal ? 'good' : 'bad') : '') +
    tile('Pallets cleared', `${pr.doneCount}<small>/${pr.count}</small>`, `${pr.count - pr.doneCount} to go`) +
    tile('Downtime', fmtMins(downMs / MIN), halt ? `${esc(holdName(halt))} now` : `${(t.halts || []).filter(h => (h.kind || 'halt') === 'halt').length} halts`, halt ? 'bad' : '') +
    tile('Decanting now', `${run}<small>/${(t.team || []).length}</small>`, `${pr.active} pallet${pr.active === 1 ? '' : 's'} active`) + '</div>';
  const cons = consolsOf(t), landedIds = new Set(pallets(t).flatMap(p => p.consolIds || []));
  const flow = `<div class="wb-flow">` +
    `<div><span>Manifest</span><b>${t.manifest ? `${cons.filter(c => landedIds.has(c.id)).length}/${cons.length}` : '—'}</b><small>${t.manifest ? `consols landed · ${esc(t.manifest.manNo)}` : 'no manifest attached'}</small></div><i>→</i>` +
    `<div><span>Truck</span><b>${pr.count}</b><small>pallets landed · ${pallets(t).filter(p => !p.segments?.length && p.status !== 'done').length} waiting</small></div><i>→</i>` +
    `<div><span>Decant</span><b>${pr.active}·${pallets(t).filter(p => p.status === 'paused').length}·${pr.doneCount}</b><small>decanting · paused · done</small></div></div>`;
  const people = `<div class="card"><div class="ch"><h3>By person</h3><span class="cs-dim">this truck against 28-day rate</span></div>${ppl.length ? (() => { const max = Math.max(1, ...ppl.map(p => Math.max(p.rate || 0, p.norm || 0))); return ppl.map(p => `<div class="wb-pp${p.low ? ' low' : ''}"><b>${esc(p.pid)}</b><div class="wb-ppbar"><i style="width:${Math.round((p.rate || 0) / max * 100)}%"></i>${p.norm ? `<em style="left:${Math.round(p.norm / max * 100)}%" title="28-day ${p.norm} ctn/h"></em>` : ''}</div><span>${p.rate === null ? '<small>under 5 min</small>' : `${p.rate} ctn/h`}${p.delta !== null ? ` <small class="${p.delta >= 0 ? 'up' : 'down'}">${p.delta >= 0 ? '▲' : '▼'} ${Math.abs(p.delta)}%</small>` : ''}</span><small class="cs-dim">${p.onNow ? `on ${esc(p.onNow)}` : `${p.cartons} ctn · ${fmtMins(p.mins)}`}</small></div>`).join(''); })() : '<p class="lbl">No crew yet.</p>'}</div>`;
  const d30 = downtimeBy(dock.history, now, 30);
  const holds = `<div class="card"><div class="ch"><h3>Hold-ups</h3><span class="cs-dim">this truck</span></div>${(t.halts || []).length ? `<table class="wb-t"><thead><tr><th>Hold-up</th><th>From</th><th>Mins</th></tr></thead><tbody>${t.halts.slice().reverse().map(h => `<tr><td>${esc(holdName(h))}${h.note ? ` <small class="cs-dim">${esc(h.note)}</small>` : ''}</td><td>${fmtHM(h.start)}${h.end ? '' : ' <b class="bad">now</b>'}</td><td class="n">${Math.round(((Date.parse(h.end) || now) - Date.parse(h.start)) / MIN)}</td></tr>`).join('')}</tbody></table>` : '<p class="lbl">None on this truck.</p>'}<div class="wb-foot">30 days: ${fmtMins(d30.total)} downtime${d30.rows[0] ? `, most from ${esc(d30.rows[0].kind === 'halt' ? holdName({ kind: 'halt', reason: d30.rows[0].reason }) : holdName({ kind: d30.rows[0].kind, reason: d30.rows[0].reason }))} (${d30.rows[0].share}%)` : ''}</div></div>`;
  const ins = insights(t, now, planOpts(t, rates));
  const side = `<div class="card wb-gc"><div class="ch"><h3>Completion</h3></div>${gauge(pr.pct)}<small class="cs-dim">${pr.done} of ${pr.total} cartons</small></div><div class="card"><div class="ch"><h3>Insights</h3></div><ul class="wb-ins">${ins.map(x => `<li class="${x.tone}">${esc(x.text)}</li>`).join('')}</ul></div>`;
  return head + kpis + flow + `<div class="wb-cols"><div class="wb-main"><div class="card"><div class="ch"><h3>Pace</h3><span class="cs-dim">cartons decanted since ${fmtHM(startOf(t))}</span></div>${paceChart(t, now, pr, fc.at)}</div>${timeline(t, now, rates)}<div class="wb-two">${people}${holds}</div></div><div class="wb-side">${side}${layout(t)}${mix(t)}</div></div>`;
}

export default {
  id: 'wallboard', title: 'Wallboard', icon: 'chart', area: 'backdock',
  desktop(ctx) { return board(ctx); },
  mobile(ctx) { const { t } = current(ctx), pr = t ? progress(t) : null; return mhead('Wallboard', t ? `Truck ${esc(truckNo(t.id))}` : 'No truck') + (t ? `<div class="wb-kpis">${tile('Decanted', `${pr.done}/${pr.total}`, `${pr.pct}%`)}${tile('Pallets', `${pr.doneCount}/${pr.count}`, '')}</div>` : ''); },
  mount(ctx, root) {
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'wb-zoom') { st.zoom = a.dataset.z === 'fit' ? 'fit' : Number(a.dataset.z); st.pan = 0; ctx.rerender(); }
      else if (a.dataset.act === 'wb-pan') { const step = st.zoom === 'fit' ? 0 : st.zoom / 2; st.pan = Math.max(0, st.pan + Number(a.dataset.d) * step); ctx.rerender(); }
    });
    const tick = setInterval(() => ctx.rerender(), 30000);
    return [ctx.store.on('dock', () => ctx.rerender()), () => clearInterval(tick)];
  },
};
