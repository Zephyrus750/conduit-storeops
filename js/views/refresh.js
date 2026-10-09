// Location refresh: mark segments refreshed this week, focus departments,
// plan paint. Reads store.get('refresh'); writes refresh.* events.

import { $, $$, ic, esc, vh, sub, card, prog, dep, DEPT_COLOUR, DEPT_NAME, weekId, fmtTime, toast, mbig } from '../ui.js';
import { focusDone } from '../../shared/reducers/floor.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId, tipLine, canonCode, groupsFor, moduleFor, shelfScanField, bindShelfScan, keepScanFocus } from '../map.js';
import { openScanner } from '../scan.js';

const PLAN_COLOURS = ['#a855f7', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
const PLAN_NAME = { '#a855f7': 'Purple', '#3b82f6': 'Blue', '#f59e0b': 'Amber', '#ec4899': 'Pink', '#14b8a6': 'Teal', '#ef4444': 'Red' };
const planName = c => PLAN_NAME[String(c).toLowerCase()] || 'Planned';
const planChip = c => `<span class="rfplan-c"><i style="background:${esc(c)}"></i>${planName(c)}</span>`;
const TARGET = 100;
// The departments a week's focus can name (ShelfSearcher's fourteen).
const FOCUS_DEPTS = ['h1', 'h2', 'h3', 'h4', 'c1', 'c2', 'c3', 'c4', 'k1', 'k2', 'k3', 'k4', 'flex', 'checkouts'];
let mode = 'refresh', planColour = PLAN_COLOURS[0], openDept = null;
const CHART_KEY = 'refresh_chart_mode';
let chartMode = (() => { try { return localStorage.getItem(CHART_KEY) === 'line' ? 'line' : 'bars'; } catch { return 'bars'; } })();
// segment → department from the mounted map, for marks made before marks
// carried their department.
let segDept = {};

function model(ctx) {
  const r = ctx.store.get('refresh');
  const week = weekId();
  const marks = r.weeks[week] || {};
  const focus = r.focus[week] || [];
  // done: every mark this week; counted: what the X/100 counts (focus only).
  return { week, marks, focus, plan: r.plan, sync: ctx.store.status || { state: 'offline', queued: 0 }, done: Object.keys(marks).length, counted: focusDone(marks, focus, (seg, mk) => mk.dept || segDept[seg]) };
}
function marksFor(map, m) {
  const out = {};
  for (const g of map.segments()) {
    const id = segmentId(g), d = (g.getAttribute('data-dept') || '').toLowerCase();
    if (markKeysFor(m.marks, { full: id, id: g.getAttribute('data-shelf') }).length) out[id] = 'done'; else if (m.focus.includes(d)) out[id] = 'focus';
  }
  return out;
}
function focusCounts(map, m) {
  const by = {}; const tot = {};
  for (const g of map.segments()) { const d = (g.getAttribute('data-dept') || '').toLowerCase(); tot[d] = (tot[d] || 0) + 1; if (markKeysFor(m.marks, { full: segmentId(g), id: g.getAttribute('data-shelf') }).length) by[d] = (by[d] || 0) + 1; }
  return m.focus.map(d => ({ d, done: by[d] || 0, total: tot[d] || 0 }));
}
// This week by day and department (ShelfSearcher's history chart): stacked
// bars or one line per department, Monday to Sunday, future days faint.
function weekByDay(m) {
  const days = Array.from({ length: 7 }, () => ({})), depts = new Set();
  for (const [seg, x] of Object.entries(m.marks)) { const i = (new Date(x.at).getDay() + 6) % 7, d = x.dept || segDept[seg] || 'other'; days[i][d] = (days[i][d] || 0) + 1; depts.add(d); }
  return { days, depts: [...depts].sort(), todayI: (new Date().getDay() + 6) % 7 };
}
function dayBars(m) {
  const NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], { days, depts, todayI } = weekByDay(m);
  const tot = days.map(d => Object.values(d).reduce((a, b) => a + b, 0)), max = Math.max(1, ...tot);
  const toggle = `<span class="seg rf-cmode">${[['bars', 'Bars'], ['line', 'Line']].map(([k, l]) => `<button class="${chartMode === k ? 'on' : ''}" data-act="chart" data-v="${k}">${l}</button>`).join('')}</span>`;
  const legend = depts.length ? `<div class="rf-leg">${depts.map(d => `<span><i style="background:${DEPT_COLOUR[d] || '#94A3B8'}"></i>${esc(d.toUpperCase())}</span>`).join('')}</div>` : '<div class="cs-dim" style="font-size:12px">No scans yet this week</div>';
  if (chartMode === 'line') {
    const W = 280, H = 100, x = i => 14 + i * (W - 28) / 6, y = v => H - 12 - v / max * (H - 26);
    const lines = depts.map(d => { const pts = days.slice(0, todayI + 1).map((dd, i) => [x(i), y(dd[d] || 0)]); return `<polyline fill="none" stroke="${DEPT_COLOUR[d] || '#94A3B8'}" stroke-width="2" points="${pts.map(p => p.join(',')).join(' ')}"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${DEPT_COLOUR[d] || '#94A3B8'}"/>`).join('')}`; }).join('');
    return toggle + `<svg class="rf-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Refreshes by day and department"><line x1="8" x2="${W - 8}" y1="${H - 12}" y2="${H - 12}" stroke="var(--line)"/>${lines}${NAMES.map((n, i) => `<text x="${x(i)}" y="${H - 1}" text-anchor="middle">${n[0]}</text>`).join('')}<text x="${W - 8}" y="10" text-anchor="end">${max}</text></svg>` + legend;
  }
  return toggle + `<div class="bars rf-stack" style="height:66px">${days.map((d, i) => `<div class="${i === todayI ? 'hi' : ''}${i > todayI ? ' fut' : ''}" style="height:${tot[i] ? Math.max(2, Math.round(tot[i] / max * 100)) : 3}%" title="${NAMES[i]} · ${tot[i]}">${depts.filter(k => d[k]).map(k => `<u style="flex:${d[k]};background:${DEPT_COLOUR[k] || '#94A3B8'}"></u>`).join('')}<span>${i > todayI ? '·' : NAMES[i]}</span></div>`).join('')}</div>` + legend;
}
// Refreshed this week, by department: each group can be reset on its own
// and each segment found on the map.
function refreshedByDept(map, m) {
  const by = {};
  for (const seg of Object.keys(m.marks)) { const d = m.marks[seg].dept || segDept[seg] || deptOfSeg(map, seg) || 'other'; (by[d] ||= []).push(seg); }
  for (const l of Object.values(by)) l.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return Object.entries(by).sort((a, b) => a[0].localeCompare(b[0]));
}
// Plan colours paint the shelf until it is refreshed; a refreshed shelf
// shows green as usual with a dot of its plan colour in the middle. In
// plan mode every planned shelf shows its colour.
function applyPlan(map, plan, marks, planMode) {
  const NS = 'http://www.w3.org/2000/svg';
  for (const g of map.segments()) {
    const r = g.querySelector('.shelf'); if (!r) continue;
    const id = segmentId(g), c = plan[id], done = !!marks[id];
    g.querySelector('.plan-dot')?.remove();
    if (c && (planMode || !done)) r.style.setProperty('fill', c, 'important'); else r.style.removeProperty('fill');
    if (c) g.setAttribute('data-plan', '1'); else g.removeAttribute('data-plan');
    if (c && done && !planMode) {
      const circle = r.tagName === 'circle'; const cx = circle ? +r.getAttribute('cx') : +r.getAttribute('x') + +r.getAttribute('width') / 2, cy = circle ? +r.getAttribute('cy') : +r.getAttribute('y') + +r.getAttribute('height') / 2;
      const rad = circle ? +r.getAttribute('r') * 0.35 : Math.min(+r.getAttribute('width'), +r.getAttribute('height')) * 0.3;
      const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('class', 'plan-dot'); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', rad); dot.setAttribute('fill', c); g.appendChild(dot);
    }
  }
}
// The mark keys that cover a tapped module: its own ("A8 S2"), the same
// code written another way ("A8S2"), or the whole shelf ("A8") as a device
// on an older map without modules would have marked it.
function markKeysFor(marks, info) {
  const full = canonCode(info.full), shelf = canonCode(info.id);
  return Object.keys(marks).filter(k => { const c = canonCode(k); return c === full || c === shelf; });
}
// A tap toggles; a scan only marks (a shelf already done says so), so a
// second read of the same label, or a wedge double-read, never unmarks it.
async function tap(ctx, info, { scanned = false } = {}) {
  const m = model(ctx);
  try {
    if (mode === 'plan') { const cur = m.plan[info.full]; await ctx.store.dispatch({ type: 'refresh.plan.paint', entity: { segment: info.full }, payload: { colour: planColour === 'erase' || cur === planColour ? 'erase' : planColour } }); return; }
    const covered = markKeysFor(m.marks, info);
    if (covered.length && scanned) return toast(`${info.full} is already done this week`);
    if (covered.length) {
      for (const seg of covered) await ctx.store.dispatch({ type: 'refresh.unmark', entity: { segment: seg, week: m.week } });
      toast(`${info.full} unmarked`, '', { label: 'Undo', run: () => ctx.store.dispatch({ type: 'refresh.mark', entity: { segment: info.full, week: m.week }, payload: { dept: info.dept } }).catch(e => toast(e.message, 'bad')) });
    } else {
      await ctx.store.dispatch({ type: 'refresh.mark', entity: { segment: info.full, week: m.week }, payload: { dept: info.dept } });
      const outside = m.focus.length && !m.focus.includes(info.dept);
      toast(outside ? `${info.full} marked · outside this week’s focus, not counted` : `${info.full} refreshed`, '', { label: 'Undo', run: () => ctx.store.dispatch({ type: 'refresh.unmark', entity: { segment: info.full, week: m.week } }).catch(e => toast(e.message, 'bad')) });
    }
  } catch (e) { toast(e.message, 'bad'); }
}

export default {
  id: 'refresh', title: 'Location refresh', icon: 'm-refresh',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Location refresh', sub('This week', m.week, `${m.counted} / ${TARGET}`), `<button class="btn" data-act="scan-shelf">${ic('camera')}Scan shelves</button><button class="btn" data-act="reset-week">${ic('refresh')}Reset week</button>`, 'm-refresh') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Location refresh', ctx.storeNo)}<span><i style="background:#16A34A"></i>Refreshed this week (${m.done})</span><span><i style="background:transparent;border:2px solid #D24E0E"></i>Focus department, not yet</span><span><i style="background:#CBD0D8"></i>Not in focus</span></div></div>` +
      `<div class="sidecol fill" id="rfside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: `<b>${m.counted}</b> / ${TARGET} this week${m.focus.length ? ' · focus ' + m.focus.map(d => d.toUpperCase()).join(' ') : ''}` }) +
      `<div class="mv-sel mode rf" id="rfmob"></div>`;
  },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { cls: 'rf', badges: false, onSelect: info => { if (info.kind === 'shelf') tap(ctx, info); }, tip: info => {
      const m = model(ctx), mk = m.marks[markKeysFor(m.marks, info)[0]], c = m.plan[info.full];
      const plan = c ? `<span class="mx"><i class="pdot" style="background:${esc(c)}"></i>Planned · ${planName(c)}</span>` : '';
      if (mk) return tipLine('g', 'check', `Refreshed ${fmtTime(mk.at)}`) + plan;
      if (m.focus.includes(info.dept)) return tipLine('o', 'asterisk', 'Focus · not yet refreshed') + plan;
      return tipLine('', 'minus', 'Not in focus this week') + plan;
    } });
    bindMapChrome(root, map);
    segDept = {}; for (const g of map.segments()) segDept[segmentId(g)] = (g.getAttribute('data-dept') || '').toLowerCase();
    const paint = () => keepScanFocus(root, () => {
      const m = model(ctx);
      map.setMarks(marksFor(map, m)); applyPlan(map, m.plan, m.marks, mode === 'plan'); map.svg.classList.toggle('rfplan', mode === 'plan'); map.svg.toggleAttribute('data-focus', m.focus.length > 0);
      const side = $('#rfside', root); if (side) side.innerHTML = sidebar(map, m);
      const mob = $('#rfmob', root); if (mob) mob.innerHTML = mobileBar(map, m);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = `<b>${m.counted}</b> / ${TARGET} this week${m.focus.length ? ' · focus ' + m.focus.map(d => d.toUpperCase()).join(' ') : ''}`;
    });
    paint();
    // Carried from a shelf selected on the map: zoom to it and ring it. No
    // mark: a tap here toggles the refresh, so arriving only brings it into view.
    if (ctx.arg?.select) { const code = canonCode(ctx.arg.select); if (map.groups(code).length) { map.select(code); map.zoomTo(code); } }
    bindShelfScan(root, map, info => tap(ctx, info, { scanned: true }));
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        if (act === 'mode') { mode = a.getAttribute('data-mode'); paint(); }
        // Walk the aisle scanning shelf labels: each read marks that shelf
        // module refreshed (one already done says so). "A013S02" and
        // "A13 S2" name one module (groupsFor).
        else if (act === 'scan-shelf') openScanner({ title: 'Scan shelf labels', hint: 'Each label marks its shelf refreshed', continuous: true, onCode: code => {
          const { g, error } = moduleFor(map.svg, code);
          if (!g) return toast(error, 'bad');
          tap(ctx, map.shelfInfo(g), { scanned: true });
        } });
        else if (act === 'chart') { chartMode = a.dataset.v; try { localStorage.setItem(CHART_KEY, chartMode); } catch {} paint(); }
        else if (act === 'open-dept') { openDept = a.dataset.dept || null; paint(); }
        else if (act === 'locate') { if (!flashSeg(map, a.dataset.seg)) toast(`${a.dataset.seg} is not on this map`, 'bad'); }
        else if (act === 'reset-dept') {
          const d = a.dataset.dept, segs = (refreshedByDept(map, m).find(g => g[0] === d) || [, []])[1];
          if (!segs.length || !confirm(`Reset all refreshed shelves in ${d.toUpperCase()} for this week?\n\nThis clears them for everyone on the team and cannot be undone.`)) return;
          await ctx.store.dispatch({ type: 'refresh.clearDept', entity: { week: m.week }, payload: { dept: d, segments: segs } }); toast(`${d.toUpperCase()} refreshes reset`);
        }
        else if (act === 'colour') { planColour = a.getAttribute('data-colour'); mode = 'plan'; paint(); }
        else if (act === 'reset-week') { if (confirm('Reset all refreshed shelves for this week?\n\nThis clears every shelf marked as refreshed — for everyone on the team — and cannot be undone.')) await ctx.store.dispatch({ type: 'refresh.clearWeek', entity: { week: m.week } }); }
        else if (act === 'reset-plan') { for (const seg of Object.keys(m.plan)) await ctx.store.dispatch({ type: 'refresh.plan.paint', entity: { segment: seg }, payload: { colour: 'erase' } }); }
        else if (act === 'focus') { const d = a.getAttribute('data-dept'); const next = m.focus.includes(d) ? m.focus.filter(x => x !== d) : [...m.focus, d]; await ctx.store.dispatch({ type: 'refresh.focus.set', entity: { week: m.week }, payload: { departments: next } }); }
        else if (act === 'zoom-dept') { map.filterDept(a.getAttribute('data-dept')); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('refresh', paint), ctx.store.on('status', paint)];
  },
};

function sidebar(map, m) {
  const fc = focusCounts(map, m);
  return `<div class="pcard"><div class="rfcount">${ic('asterisk')}<div class="n">${m.counted}<small> / ${TARGET}</small></div><div class="fx">Focus this week<div class="chips">${fc.map(f => `<span class="chip" data-act="zoom-dept" data-dept="${f.d}"><span class="sw" style="background:${DEPT_COLOUR[f.d]}"></span>${f.d.toUpperCase()} ${f.done}/${f.total}</span>`).join('')}<span class="chip" style="color:var(--accent-ink)" data-act="mode" data-mode="focus">Choose…</span></div></div></div>${prog(m.done / TARGET * 100)}${shelfScanField('Scan or type a shelf label to mark it')}` +
    (mode === 'focus' ? `<div class="chips" style="margin-top:10px">${FOCUS_DEPTS.map(d => `<span class="chip${m.focus.includes(d) ? ' on' : ''}" data-act="focus" data-dept="${d}"><span class="sw" style="background:${DEPT_COLOUR[d]}"></span>${d.toUpperCase()}</span>`).join('')}<span class="chip" data-act="mode" data-mode="refresh">Done</span></div>` : '') + `</div>` +
    `<div class="pcard"><div class="pt3">This week’s scanning</div><div class="rfchart">${dayBars(m)}</div></div>` +
    `<div class="pcard"><div class="pt3">Refreshed this week<span style="margin-left:auto;font-weight:600;letter-spacing:0;text-transform:none">${m.done} segments</span></div>${groupsHtml(map, m)}</div>` +
    `<div class="pcard"><div class="plan"><span class="pt3" style="margin:0">Plan</span><span class="sw2${mode === 'plan' ? ' on' : ''}" data-act="mode" data-mode="${mode === 'plan' ? 'refresh' : 'plan'}"></span></div><div class="pal">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c && mode === 'plan' ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<span class="er${planColour === 'erase' && mode === 'plan' ? ' on' : ''}" data-act="colour" data-colour="erase">${ic('x')}</span></div><div class="lbl">${mode === 'plan' ? 'Plan mode: tap shelves to paint them for the team. Same colour again clears.' : 'Pick a colour, then tap shelves to mark them.'}</div></div>` +
    `<div class="pfoot"><button class="btn" data-act="reset-plan">${ic('refresh')}Reset planning</button></div>`;
}
// The team-sync chip reads the store's real connection state.
function syncChip(s) {
  const on = s.state === 'live' || s.state === 'polling';
  const txt = s.state === 'live' ? 'live' : s.state === 'polling' ? 'polling' : s.state === 'connecting' ? 'connecting' : `offline${s.queued ? ` · ${s.queued} queued` : ''}`;
  return `<span class="rf-sync${on ? ' live' : ''}" title="${esc(s.lastError || 'Team sync')}"><i></i>${txt}</span>`;
}
function mobileBar(map, m) {
  const fc = focusCounts(map, m);
  return `<div class="mv-mh">${ic('m-refresh')}<b>Location refresh</b><span>${m.counted} / ${TARGET}</span></div>` +
    `<div class="rf-row">${mode === 'plan' ? '' : shelfScanField('Scan or type a shelf')}<div class="seg2"><button class="${mode !== 'plan' ? 'on' : ''}" data-act="mode" data-mode="refresh">Refresh</button><button class="${mode === 'plan' ? 'on' : ''}" data-act="mode" data-mode="plan">Plan</button></div>` +
    (mode === 'plan' ? `<div class="rf-pal">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<i class="er${planColour === 'erase' ? ' on' : ''}" title="Erase" data-act="colour" data-colour="erase">${ic('x')}</i></div>` : '') + `</div>` +
    (mode === 'plan' ? `<div class="mv-hint">Plan mode: tap a shelf to paint it for the team. Tap the same colour again to clear.</div>`
      : mode === 'focus' ? `<div class="rf-focus pick"><span class="lbl">Focus this week</span>${FOCUS_DEPTS.map(d => `<button class="rf-chip${m.focus.includes(d) ? ' on' : ''}" data-act="focus" data-dept="${d}"><i class="dep" style="background:${DEPT_COLOUR[d]}">${d.toUpperCase()}</i></button>`).join('')}<button class="rf-chip done" data-act="mode" data-mode="refresh">Done</button></div>`
      : `<div class="rf-focus"><span class="lbl">Focus</span>${fc.map(f => `<button class="rf-chip" data-act="zoom-dept" data-dept="${f.d}"><i class="dep" style="background:${DEPT_COLOUR[f.d]}">${f.d.toUpperCase()}</i>${f.done}/${f.total}</button>`).join('') || '<span class="mv-hint" style="margin:0">No focus areas set this week</span>'}<button class="rf-chip" data-act="mode" data-mode="focus">Choose…</button>${syncChip(m.sync)}</div>`);
}
function deptOfSeg(map, segId) { for (const g of map.segments()) if (segmentId(g) === segId) return (g.getAttribute('data-dept') || '').toLowerCase(); return ''; }

function groupsHtml(map, m) {
  const groups = refreshedByDept(map, m);
  if (!groups.length) return '<div class="cs-dim" style="font-size:12px;padding:6px 0">No shelves refreshed yet this week.</div>';
  return `<div class="rf-groups">${groups.map(([d, segs]) => { const open = openDept === d, shown = open ? segs : segs.slice(0, 12);
    return `<div class="rf-grp"><div class="rf-gh">${dep(d)}<b>${esc(DEPT_NAME[d] || d.toUpperCase())}</b><span class="n">${segs.length}</span><button class="rf-reset" data-act="reset-dept" data-dept="${esc(d)}" title="Reset ${esc(d.toUpperCase())} for this week">Reset</button></div><div class="rf-chips">${shown.map(seg => `<button class="rf-seg" data-act="locate" data-seg="${esc(seg)}">${esc(seg)}${m.plan[seg] ? `<i style="background:${esc(m.plan[seg])}"></i>` : ''}</button>`).join('')}${segs.length > shown.length ? `<button class="rf-seg more" data-act="open-dept" data-dept="${esc(d)}">+${segs.length - shown.length} more</button>` : open && segs.length > 12 ? `<button class="rf-seg more" data-act="open-dept" data-dept="">Show less</button>` : ''}</div></div>`; }).join('')}</div>`;
}
// A located segment rings orange for three seconds, as ShelfSearcher's flash.
function flashSeg(map, seg) {
  const gs = map.segments().filter(g => segmentId(g) === seg); if (!gs.length) return false;
  map.zoomTo(seg, 500);   // the module, not its run
  for (const g of gs) g.setAttribute('data-flash', '1');
  setTimeout(() => { for (const g of gs) g.removeAttribute('data-flash'); }, 3000);
  return true;
}
