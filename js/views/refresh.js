// Location refresh: mark segments refreshed this week, focus departments,
// plan paint. Reads store.get('refresh'); writes refresh.* events.

import { $, $$, ic, esc, vh, sub, card, prog, dep, DEPT_COLOUR, DEPT_NAME, weekId, fmtTime, toast, mbig } from '../ui.js';
import { focusDone } from '../../shared/reducers/floor.js';
import { retailPeriod } from '../../shared/time.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId, tipLine, canonCode, groupsFor, oneShelf, shelfScanField, bindShelfScan, keepScanFocus, setStrip, sx } from '../map.js';
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
// The mark keys that cover a tapped shelf: its own ("A8 S2"), the same
// code written another way ("A8S2"), or the whole run ("A8") as a device
// on an older map without shelf suffixes would have marked it.
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
      `<div class="mv-sel mode rf" id="rfmob"></div><div class="rf-scanhost" id="rfscan"></div>`;
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
      const sc = $('#rfscan', root); if (sc) sc.innerHTML = scanOpen && mode !== 'plan' ? scanSheet() : '';
      setStrip(root, rfStrip(m));
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = `<b>${m.counted}</b> / ${TARGET} this week${m.focus.length ? ' · focus ' + m.focus.map(d => d.toUpperCase()).join(' ') : ''}`;
    });
    paint();
    // Carried from a shelf selected on the map: zoom to it and ring it. No
    // mark: a tap here toggles the refresh, so arriving only brings it into view.
    if (ctx.arg?.select) { const code = canonCode(ctx.arg.select); if (map.groups(code).length) { map.select(code); map.zoomTo(code); } }
    bindShelfScan(root, map, async info => { const was = !!markKeysFor(model(ctx).marks, info).length; await tap(ctx, info, { scanned: true }); lastScan = { ok: true, text: `${info.full} ${was ? 'was already refreshed this week' : 'marked refreshed'}` }; paint(); }, msg => { lastScan = { ok: false, text: msg }; paint(); });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        if (act === 'mode') { mode = a.getAttribute('data-mode'); paint(); }
        else if (act === 'scan-open') { scanOpen = true; lastScan = null; paint(); setTimeout(() => root.querySelector('[data-field="shelfscan"]')?.focus(), 50); }
        else if (act === 'scan-close') { if (e.target.closest('.rf-sheet') && !e.target.closest('.sheet-x')) return; scanOpen = false; paint(); }
        else if (act === 'scan-go') { root.querySelector('[data-field="shelfscan"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); }
        // Walk the aisle scanning shelf labels: each read marks that shelf
        // refreshed (one already done says so). "A013S02" and "A13 S2" name
        // one shelf (groupsFor); a run's name asks for the shelf's label.
        else if (act === 'scan-shelf') openScanner({ title: 'Scan shelf labels', hint: 'Each label marks its shelf refreshed', continuous: true, onCode: code => {
          const { g, error } = oneShelf(map.svg, code);
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
        else if (act === 'reset-plan') { const n = Object.keys(m.plan).length; if (!n) return toast('Nothing is planned'); if (confirm(`Reset planning?\n\nThis clears the colours on all ${n} planned shelves, for everyone on the team.`)) { await ctx.store.dispatch({ type: 'refresh.plan.clear', entity: {} }); toast('Planning reset'); } }
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
    `<div class="pcard"><div class="pt3">Refreshed this week<span style="margin-left:auto;font-weight:600;letter-spacing:0;text-transform:none">${m.done} shel${m.done === 1 ? 'f' : 'ves'}</span></div>${groupsHtml(map, m)}</div>` +
    `<div class="pcard"><div class="plan"><span class="pt3" style="margin:0">Plan</span><span class="sw2${mode === 'plan' ? ' on' : ''}" data-act="mode" data-mode="${mode === 'plan' ? 'refresh' : 'plan'}"></span></div><div class="pal">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c && mode === 'plan' ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<span class="er${planColour === 'erase' && mode === 'plan' ? ' on' : ''}" data-act="colour" data-colour="erase">${ic('x')}</span></div><div class="lbl">${mode === 'plan' ? 'Plan mode: tap shelves to paint them for the team. Same colour again clears.' : 'Pick a colour, then tap shelves to mark them.'}</div></div>` +
    `<div class="pfoot"><button class="btn" data-act="reset-plan">${ic('refresh')}Reset planning</button></div>`;
}
// The phone's scan: one button opens a sheet with the camera and a box to
// type the label in; it stays open for the next shelf, saying what the last
// one did. The week's focus departments are a manager's call, made on the
// desk, so the phone only shows them.
let scanOpen = false, lastScan = null;
function scanSheet() {
  return `<div class="rf-sheetback" data-act="scan-close"><div class="sheet rf-sheet" role="dialog" aria-label="Mark a shelf refreshed"><div class="sheet-h"><h3>Mark a shelf refreshed</h3><button class="sheet-x" data-act="scan-close" aria-label="Close">${ic('x')}</button></div>` +
    `<button class="mv-big" data-camera="shelfscan" data-camera-continuous title="Scan shelf labels">${ic('camera')}Scan with the camera</button>` +
    `<div class="rf-type"><span class="lbl">Or type the shelf</span><div class="shelfscan">${ic('barcode')}<input data-field="shelfscan" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="e.g. A16 S1" aria-label="Shelf label"><button class="btn primary sm" data-act="scan-go">Mark</button></div></div>` +
    (lastScan ? `<div class="rf-last ${lastScan.ok ? 'ok' : 'bad'}">${ic(lastScan.ok ? 'check' : 'alert')}<span>${esc(lastScan.text)}</span></div>` : '<div class="rf-last">Each label marks its shelf refreshed for the whole team.</div>') + '</div></div>';
}
// The phone's Refresh sheet (opened from the strip): the week's progress,
// scan and the Refresh/Plan toggle, each focus department with its own bar,
// the focus shelves still due (a tap finds one on the map) and the week so far.
function mobileBar(map, m) {
  const fc = focusCounts(map, m), left = 7 - (new Date().getDay() + 6) % 7, due = stillDue(map, m);
  const head = `<div class="sx-h">${ic('m-refresh')}Location refresh<span class="n">${m.counted} / ${TARGET}</span></div><div class="sx-sub">This week · ${retailPeriod(new Date())} · ${left} day${left === 1 ? '' : 's'} left</div><div style="margin-top:8px">${sx.bar(m.counted, TARGET)}</div>`;
  // The toggle keeps its place: in Plan the colours take the scan button's spot.
  const row = `<div class="rf-row">${mode === 'plan' ? `<div class="rf-pal" role="group" aria-label="Plan colour">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<i class="er${planColour === 'erase' ? ' on' : ''}" title="Erase" data-act="colour" data-colour="erase">${ic('x')}</i></div>` : `<button class="rf-scanbtn" data-act="scan-open" aria-label="Scan or type a shelf">${ic('barcode')}<span>Scan or type</span></button>`}<div class="seg2"><button class="${mode !== 'plan' ? 'on' : ''}" data-act="mode" data-mode="refresh">Refresh</button><button class="${mode === 'plan' ? 'on' : ''}" data-act="mode" data-mode="plan">Plan</button></div></div>`;
  if (mode === 'plan') return `<div class="sx">${head}${row}<div class="sx-sub">Tap a shelf to paint it for the team. Tap the same colour again to clear.</div></div>`;
  const focus = sx.rows(fc.map(f => `<div class="sx-r" data-act="zoom-dept" data-dept="${f.d}">${dep(f.d)}<div class="k"><b>${esc(DEPT_NAME[f.d] || f.d.toUpperCase())}</b></div>${sx.bar(f.done, f.total, DEPT_COLOUR[f.d])}<span class="v">${f.done}/${f.total}</span></div>`)) ;
  return `<div class="sx">${head}${row}` +
    sx.sec('This week’s focus', fc.length ? focus : sx.rows([sx.row('asterisk', 'No focus departments set this week', 'Managers set them on a store PC')]), fc.length ? 'set by managers' : '') +
    (due.length ? sx.sec('Still due', `<div class="sx-chips">${due.slice(0, 12).map(seg => `<button class="sx-chip" type="button" data-act="locate" data-seg="${esc(seg)}">${esc(seg)}</button>`).join('')}</div>`, `${due.length} in focus · tap to find`) : '') +
    sx.sec('This week', sx.rows([sx.row('check', `${m.done} shel${m.done === 1 ? 'f' : 'ves'} refreshed`, !m.focus.length ? 'No focus departments this week' : m.done - m.counted > 0 ? `${m.done - m.counted} outside the focus departments` : 'All in the focus departments')])) + '</div>';
}
// The focus shelves not refreshed yet this week, in name order.
function stillDue(map, m) {
  if (!m.focus.length) return [];
  const out = new Set();
  for (const g of map.segments()) { const d = (g.getAttribute('data-dept') || '').toLowerCase(), full = segmentId(g); if (m.focus.includes(d) && !markKeysFor(m.marks, { full, id: g.getAttribute('data-shelf') }).length) out.add(full); }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
// The strip under the phone's Refresh map: the week's count and the scan.
function rfStrip(m) {
  if (mode === 'plan') return `${ic('m-refresh')}<b>Planning</b><span class="s">Tap shelves to paint them</span><button class="act" type="button" data-act="mode" data-mode="refresh">${ic('check')}Done</button>`;
  return `${ic('m-refresh')}<b>Refresh</b><span class="n">${m.counted} / ${TARGET}</span><span class="s"></span><button class="act go" type="button" data-act="scan-open">${ic('barcode')}Scan or type</button>`;
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
  map.zoomTo(seg, 500);   // the shelf, not its run
  for (const g of gs) g.setAttribute('data-flash', '1');
  setTimeout(() => { for (const g of gs) g.removeAttribute('data-flash'); }, 3000);
  return true;
}
