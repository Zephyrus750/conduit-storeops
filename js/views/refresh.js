// Location refresh: mark segments refreshed this week, focus departments,
// plan paint. Reads store.get('refresh'); writes refresh.* events.

import { $, $$, ic, esc, vh, sub, card, prog, dep, DEPT_COLOUR, DEPT_NAME, weekId, fmtTime, toast, mbig } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId, tipLine, canonCode, splitCanon } from '../map.js';
import { openScanner, scanSupported } from '../scan.js';

const PLAN_COLOURS = ['#a855f7', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
const PLAN_NAME = { '#a855f7': 'Purple', '#3b82f6': 'Blue', '#f59e0b': 'Amber', '#ec4899': 'Pink', '#14b8a6': 'Teal', '#ef4444': 'Red' };
const planName = c => PLAN_NAME[String(c).toLowerCase()] || 'Planned';
const planChip = c => `<span class="rfplan-c"><i style="background:${esc(c)}"></i>${planName(c)}</span>`;
const TARGET = 100;
let mode = 'refresh', planColour = PLAN_COLOURS[0];

function model(ctx) {
  const r = ctx.store.get('refresh');
  const week = weekId();
  const marks = r.weeks[week] || {};
  const focus = r.focus[week] || [];
  return { week, marks, focus, plan: r.plan, done: Object.keys(marks).length };
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
function dayBars(m) {
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], vals = [0, 0, 0, 0, 0, 0, 0];
  for (const x of Object.values(m.marks)) { const d = new Date(x.at); vals[(d.getDay() + 6) % 7] += 1; }
  const max = Math.max(1, ...vals), todayI = (new Date().getDay() + 6) % 7;
  return `<div class="bars" style="height:58px">${vals.map((v, i) => `<div class="${i === todayI ? 'hi' : ''}" style="height:${v ? Math.round(v / max * 100) : 3}%"><span>${days[i]}</span></div>`).join('')}</div>`;
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
async function tap(ctx, info) {
  const m = model(ctx);
  try {
    if (mode === 'plan') { const cur = m.plan[info.full]; await ctx.store.dispatch({ type: 'refresh.plan.paint', entity: { segment: info.full }, payload: { colour: planColour === 'erase' || cur === planColour ? 'erase' : planColour } }); return; }
    const covered = markKeysFor(m.marks, info);
    if (covered.length) for (const seg of covered) await ctx.store.dispatch({ type: 'refresh.unmark', entity: { segment: seg, week: m.week } });
    else await ctx.store.dispatch({ type: 'refresh.mark', entity: { segment: info.full, week: m.week } });
  } catch (e) { toast(e.message, 'bad'); }
}
// A camera scan of a shelf label marks it refreshed (never toggles — scanning
// the same label twice is a no-op, not an unmark). A bare bay code ("A16")
// marks the whole shelf; a module code ("A16 S1") marks that one module.
async function scanMark(ctx, map, raw) {
  const code = canonCode(raw);
  const gs = code ? map.groups(code) : [];
  if (!gs.length) return { ok: false, message: `No shelf matches “${raw}”` };
  const first = map.shelfInfo(gs[0]);
  const seg = splitCanon(code).sub ? first.full : first.id;
  const m = model(ctx);
  if (markKeysFor(m.marks, { full: seg, id: first.id }).length) return { ok: true, message: `${code} already refreshed` };
  await ctx.store.dispatch({ type: 'refresh.mark', entity: { segment: seg, week: m.week } });
  return { ok: true, message: `${code} refreshed` };
}

export default {
  id: 'refresh', title: 'Location refresh', icon: 'm-refresh',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Location refresh', sub('This week', m.week, `${m.done} / ${TARGET}`), `${scanSupported() ? `<button class="btn" data-act="scan">${ic('barcode')}Scan</button>` : ''}<button class="btn" data-act="reset-week">${ic('refresh')}Reset week</button>`, 'm-refresh') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Location refresh', ctx.storeNo)}<span><i style="background:#16A34A"></i>Refreshed this week (${m.done})</span><span><i style="background:transparent;border:2px solid #D24E0E"></i>Focus department, not yet</span><span><i style="background:#CBD0D8"></i>Not in focus</span></div></div>` +
      `<div class="sidecol fill" id="rfside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: `<b>${m.done}</b> / ${TARGET} this week${m.focus.length ? ' · focus ' + m.focus.map(d => d.toUpperCase()).join(' ') : ''}` }) +
      `<div class="mv-sel mode rf" id="rfmob"></div>`;
  },
  mount(ctx, root) {
    const m0 = model(ctx);
    const map = mountMap($('#mapstage', root), { cls: 'rf', badges: false, onSelect: info => { if (info.kind === 'shelf') tap(ctx, info); }, tip: info => {
      const m = model(ctx), mk = m.marks[markKeysFor(m.marks, info)[0]], c = m.plan[info.full];
      const plan = c ? `<span class="mx"><i class="pdot" style="background:${esc(c)}"></i>Planned · ${planName(c)}</span>` : '';
      if (mk) return tipLine('g', 'check', `Refreshed ${fmtTime(mk.at)}`) + plan;
      if (m.focus.includes(info.dept)) return tipLine('o', 'asterisk', 'Focus · not yet refreshed') + plan;
      return tipLine('', 'minus', 'Not in focus this week') + plan;
    } });
    bindMapChrome(root, map);
    const paint = () => {
      const m = model(ctx);
      map.setMarks(marksFor(map, m)); applyPlan(map, m.plan, m.marks, mode === 'plan'); map.svg.classList.toggle('rfplan', mode === 'plan'); map.svg.toggleAttribute('data-focus', m.focus.length > 0);
      const side = $('#rfside', root); if (side) side.innerHTML = sidebar(map, m);
      const mob = $('#rfmob', root); if (mob) mob.innerHTML = mobileBar(map, m);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = `<b>${m.done}</b> / ${TARGET} this week${m.focus.length ? ' · focus ' + m.focus.map(d => d.toUpperCase()).join(' ') : ''}`;
    };
    paint();
    // Carried from a shelf selected on the map: zoom to it and ring it (no
    // mark — a tap here toggles the refresh, so we only bring it into view).
    if (ctx.arg?.select) { const code = canonCode(ctx.arg.select); if (map.groups(code).length) { map.select(code); map.zoomTo(code); } }
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        if (act === 'mode') { mode = a.getAttribute('data-mode'); paint(); }
        else if (act === 'colour') { planColour = a.getAttribute('data-colour'); mode = 'plan'; paint(); }
        else if (act === 'reset-week') { if (confirm(`Clear every refresh mark for ${m.week}?`)) await ctx.store.dispatch({ type: 'refresh.clearWeek', entity: { week: m.week } }); }
        else if (act === 'reset-plan') { for (const seg of Object.keys(m.plan)) await ctx.store.dispatch({ type: 'refresh.plan.paint', entity: { segment: seg }, payload: { colour: 'erase' } }); }
        else if (act === 'focus') { const d = a.getAttribute('data-dept'); const next = m.focus.includes(d) ? m.focus.filter(x => x !== d) : [...m.focus, d]; await ctx.store.dispatch({ type: 'refresh.focus.set', entity: { week: m.week }, payload: { departments: next } }); }
        else if (act === 'zoom-dept') { map.filterDept(a.getAttribute('data-dept')); }
        else if (act === 'scan') { openScanner({ title: 'Refresh scan', hint: 'Scan a shelf label to mark it refreshed', onCode: raw => scanMark(ctx, map, raw) }); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('refresh', paint)];
  },
};

function sidebar(map, m) {
  const fc = focusCounts(map, m);
  const list = Object.entries(m.marks).sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).slice(0, 8);
  const depts = Object.keys(DEPT_NAME).filter(d => !['checkouts', 'stockroom', 'flex'].includes(d));
  return `<div class="pcard"><div class="rfcount">${ic('asterisk')}<div class="n">${m.done}<small> / ${TARGET}</small></div><div class="fx">Focus this week<div class="chips">${fc.map(f => `<span class="chip" data-act="zoom-dept" data-dept="${f.d}"><span class="sw" style="background:${DEPT_COLOUR[f.d]}"></span>${f.d.toUpperCase()} ${f.done}/${f.total}</span>`).join('')}<span class="chip" style="color:var(--accent-ink)" data-act="mode" data-mode="focus">Choose…</span></div></div></div>${prog(m.done / TARGET * 100)}` +
    (mode === 'focus' ? `<div class="chips" style="margin-top:10px">${depts.map(d => `<span class="chip${m.focus.includes(d) ? ' on' : ''}" data-act="focus" data-dept="${d}"><span class="sw" style="background:${DEPT_COLOUR[d]}"></span>${d.toUpperCase()}</span>`).join('')}<span class="chip" data-act="mode" data-mode="refresh">Done</span></div>` : '') + `</div>` +
    `<div class="pcard"><div class="pt3">This week’s scanning</div><div class="rfchart">${dayBars(m)}</div></div>` +
    `<div class="pcard"><div class="pt3">Refreshed this week<span style="margin-left:auto;font-weight:600;letter-spacing:0;text-transform:none">${m.done} segments</span></div><div class="list rflist">${list.map(([id, x]) => { const d = deptOfSeg(map, id); return `<div class="li"><span class="loc">${esc(id)}</span>${dep(d)}<span class="nm">${esc(DEPT_NAME[d] || d)}</span>${m.plan[id] ? planChip(m.plan[id]) : ''}<span class="rt">${fmtTime(x.at)}</span></div>`; }).join('') || '<div class="li" style="color:var(--dim);font-size:12px">Nothing yet this week. Tap a shelf on the map.</div>'}${m.done > 8 ? `<div class="li" style="color:var(--dim);font-size:12px">+ ${m.done - 8} more this week</div>` : ''}</div></div>` +
    `<div class="pcard"><div class="plan"><span class="pt3" style="margin:0">Plan</span><span class="sw2${mode === 'plan' ? ' on' : ''}" data-act="mode" data-mode="${mode === 'plan' ? 'refresh' : 'plan'}"></span></div><div class="pal">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c && mode === 'plan' ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<span class="er${planColour === 'erase' && mode === 'plan' ? ' on' : ''}" data-act="colour" data-colour="erase">${ic('x')}</span></div><div class="lbl">${mode === 'plan' ? 'Plan mode: tap shelves to paint them for the team. Same colour again clears.' : 'Pick a colour, then tap shelves to mark them.'}</div></div>` +
    `<div class="pfoot"><button class="btn" data-act="reset-plan">${ic('refresh')}Reset planning</button></div>`;
}
function mobileBar(map, m) {
  const fc = focusCounts(map, m);
  return `<div class="mv-mh">${ic('m-refresh')}<b>Location refresh</b><span>${m.done} / ${TARGET}</span></div>` +
    (mode !== 'plan' && scanSupported() ? `<div style="padding:0 12px 2px">${mbig('Scan a shelf', '', 'barcode', ' data-act="scan"')}</div>` : '') +
    `<div class="rf-row"><div class="seg2"><button class="${mode !== 'plan' ? 'on' : ''}" data-act="mode" data-mode="refresh">Refresh</button><button class="${mode === 'plan' ? 'on' : ''}" data-act="mode" data-mode="plan">Plan</button></div>` +
    (mode === 'plan' ? `<div class="rf-pal">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<i class="er${planColour === 'erase' ? ' on' : ''}" title="Erase" data-act="colour" data-colour="erase">${ic('x')}</i></div>` : `<span class="rf-sync live" title="Team sync"><i></i>live</span>`) + `</div>` +
    (mode === 'plan' ? `<div class="mv-hint">Plan mode: tap a shelf to paint it for the team. Tap the same colour again to clear.</div>`
      : `<div class="rf-focus"><span class="lbl">Focus</span>${fc.map(f => `<button class="rf-chip" data-act="zoom-dept" data-dept="${f.d}"><i class="dep" style="background:${DEPT_COLOUR[f.d]}">${f.d.toUpperCase()}</i>${f.done}/${f.total}</button>`).join('') || '<span class="mv-hint" style="margin:0">Tap a shelf to mark it refreshed. Tap again to undo.</span>'}</div>`);
}
function deptOfSeg(map, segId) { for (const g of map.segments()) if (segmentId(g) === segId) return (g.getAttribute('data-dept') || '').toLowerCase(); return ''; }
