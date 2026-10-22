// Location refresh: mark segments refreshed this week, focus departments,
// plan paint. Reads store.get('refresh'); writes refresh.* events.

import { $, $$, ic, esc, vh, sub, card, prog, dep, DEPT_COLOUR, DEPT_NAME, weekId, fmtTime, toast, mbig } from '../ui.js';
import { focusDone } from '../../shared/reducers/floor.js';
import { retailPeriod } from '../../shared/time.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, segmentId, tipLine, canonCode, groupsFor, oneShelf, shelfScanField, bindShelfScan, keepScanFocus, setStrip, sx } from '../map.js';
import { openScanner } from '../scan.js';
import { tx, txn, locale } from '../i18n.js';

const PLAN_COLOURS = ['#a855f7', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
const PLAN_NAME = { '#a855f7': tx('Purple'), '#3b82f6': tx('Blue'), '#f59e0b': tx('Amber'), '#ec4899': tx('Pink'), '#14b8a6': tx('Teal'), '#ef4444': tx('Red') };
const planName = c => PLAN_NAME[String(c).toLowerCase()] || tx('Planned');
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
  return { week, marks, focus, plan: r.plan, done: Object.keys(marks).length, counted: focusDone(marks, focus, (seg, mk) => mk.dept || segDept[seg]) };
}
// The map's shelves, read once per screen (audit 19 Oct P5: every paint used
// to compare every mark with every shelf): id, department, and its own and
// its run's canonical codes.
let shelfIndex = [];
const indexShelves = map => { shelfIndex = map.segments().map(g => { const id = segmentId(g); return { id, dept: (g.getAttribute('data-dept') || '').toLowerCase(), full: canonCode(id), run: canonCode(g.getAttribute('data-shelf')) }; }); };
// This week's marks as canonical codes, once per paint; a shelf is done when
// its own code is marked, or its run's as an older device marked it.
const markSet = marks => new Set(Object.keys(marks).map(canonCode));
const isDone = (set, x) => set.has(x.full) || set.has(x.run);
function marksFor(m) {
  const out = {}, set = markSet(m.marks);
  for (const x of shelfIndex) { if (isDone(set, x)) out[x.id] = 'done'; else if (m.focus.includes(x.dept)) out[x.id] = 'focus'; }
  return out;
}
function focusCounts(m) {
  const by = {}, tot = {}, set = markSet(m.marks);
  for (const x of shelfIndex) { tot[x.dept] = (tot[x.dept] || 0) + 1; if (isDone(set, x)) by[x.dept] = (by[x.dept] || 0) + 1; }
  return m.focus.map(d => ({ d, done: by[d] || 0, total: tot[d] || 0 }));
}
// This week by day and department (ShelfSearcher's history chart): stacked
// bars or one line per department, Monday to Sunday, future days faint.
function weekByDay(m) {
  const days = Array.from({ length: 7 }, () => ({})), depts = new Set();
  for (const [seg, x] of Object.entries(m.marks)) { const i = (new Date(x.at).getDay() + 6) % 7, d = x.dept || segDept[seg] || 'other'; days[i][d] = (days[i][d] || 0) + 1; depts.add(d); }
  return { days, depts: [...depts].sort(), todayI: (new Date().getDay() + 6) % 7 };
}
// The day initials under the line chart, Monday first, in the device's
// language (5 Jan 2026 is a Monday).
const dayInitials = () => { try { const f = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' }); return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 0, 5 + i))); } catch { return ['M', 'T', 'W', 'T', 'F', 'S', 'S']; } };
function dayBars(m) {
  const NAMES = [tx('MON'), tx('TUE'), tx('WED'), tx('THU'), tx('FRI'), tx('SAT'), tx('SUN')], { days, depts, todayI } = weekByDay(m);
  const tot = days.map(d => Object.values(d).reduce((a, b) => a + b, 0)), max = Math.max(1, ...tot);
  const toggle = `<span class="seg rf-cmode">${[['bars', tx('Bars')], ['line', tx('Line')]].map(([k, l]) => `<button class="${chartMode === k ? 'on' : ''}" data-act="chart" data-v="${k}">${l}</button>`).join('')}</span>`;
  const legend = depts.length ? `<div class="rf-leg">${depts.map(d => `<span><i style="background:${DEPT_COLOUR[d] || '#94A3B8'}"></i>${esc(d.toUpperCase())}</span>`).join('')}</div>` : `<div class="cs-dim" style="font-size:12px">${tx('No scans yet this week')}</div>`;
  if (chartMode === 'line') {
    const W = 280, H = 100, x = i => 14 + i * (W - 28) / 6, y = v => H - 12 - v / max * (H - 26), INITIALS = dayInitials();
    const lines = depts.map(d => { const pts = days.slice(0, todayI + 1).map((dd, i) => [x(i), y(dd[d] || 0)]); return `<polyline fill="none" stroke="${DEPT_COLOUR[d] || '#94A3B8'}" stroke-width="2" points="${pts.map(p => p.join(',')).join(' ')}"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${DEPT_COLOUR[d] || '#94A3B8'}"/>`).join('')}`; }).join('');
    return toggle + `<svg class="rf-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tx('Refreshes by day and department')}"><line x1="8" x2="${W - 8}" y1="${H - 12}" y2="${H - 12}" stroke="var(--line)"/>${lines}${INITIALS.map((n, i) => `<text x="${x(i)}" y="${H - 1}" text-anchor="middle">${esc(n)}</text>`).join('')}<text x="${W - 8}" y="10" text-anchor="end">${max}</text></svg>` + legend;
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
    if (covered.length && scanned) return toast(tx('{code} is already done this week', { code: info.full }));
    if (covered.length) {
      for (const seg of covered) await ctx.store.dispatch({ type: 'refresh.unmark', entity: { segment: seg, week: m.week } });
      toast(tx('{code} unmarked', { code: info.full }), '', { label: tx('Undo'), run: () => ctx.store.dispatch({ type: 'refresh.mark', entity: { segment: info.full, week: m.week }, payload: { dept: info.dept } }).catch(e => toast(e.message, 'bad')) });
    } else {
      await ctx.store.dispatch({ type: 'refresh.mark', entity: { segment: info.full, week: m.week }, payload: { dept: info.dept } });
      const outside = m.focus.length && !m.focus.includes(info.dept);
      toast(outside ? tx('{code} marked · outside this week’s focus, not counted', { code: info.full }) : tx('{code} refreshed', { code: info.full }), '', { label: tx('Undo'), run: () => ctx.store.dispatch({ type: 'refresh.unmark', entity: { segment: info.full, week: m.week } }).catch(e => toast(e.message, 'bad')) });
    }
  } catch (e) { toast(e.message, 'bad'); }
}

// The phone map's badge: the week's count and its focus departments.
const weekBadge = m => (m.focus.length ? tx('<b>{n}</b> / {target} this week · focus {depts}', { n: m.counted, target: TARGET, depts: m.focus.map(d => d.toUpperCase()).join(' ') }) : tx('<b>{n}</b> / {target} this week', { n: m.counted, target: TARGET }));

export default {
  id: 'refresh', title: tx('Location refresh'), icon: 'm-refresh',
  desktop(ctx) {
    const m = model(ctx);
    return vh(tx('Location refresh'), sub(tx('This week'), m.week, `${m.counted} / ${TARGET}`), `<button class="btn" data-act="scan-shelf">${ic('camera')}${tx('Scan shelves')}</button><button class="btn" data-act="reset-week">${ic('refresh')}${tx('Reset week')}</button>`, 'm-refresh') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Location refresh'), ctx.storeNo)}<span><i style="background:#16A34A"></i>${tx('Refreshed this week ({n})', { n: m.done })}</span><span><i style="background:transparent;border:2px solid #D24E0E"></i>${tx('Focus department, not yet')}</span><span><i style="background:#CBD0D8"></i>${tx('Not in focus')}</span></div></div>` +
      `<div class="sidecol fill" id="rfside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: weekBadge(m) }) +
      `<div class="mv-sel mode rf" id="rfmob"></div><div class="rf-scanhost" id="rfscan"></div>`;
  },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { cls: 'rf', badges: false, onSelect: info => { if (info.kind === 'shelf') tap(ctx, info); }, tip: info => {
      const m = model(ctx), mk = m.marks[markKeysFor(m.marks, info)[0]], c = m.plan[info.full];
      const plan = c ? `<span class="mx"><i class="pdot" style="background:${esc(c)}"></i>${tx('Planned · {colour}', { colour: planName(c) })}</span>` : '';
      if (mk) return tipLine('g', 'check', tx('Refreshed {time}', { time: fmtTime(mk.at) })) + plan;
      if (m.focus.includes(info.dept)) return tipLine('o', 'asterisk', tx('Focus · not yet refreshed')) + plan;
      return tipLine('', 'minus', tx('Not in focus this week')) + plan;
    } });
    bindMapChrome(root, map);
    indexShelves(map); segDept = Object.fromEntries(shelfIndex.map(x => [x.id, x.dept]));
    const paint = () => keepScanFocus(root, () => {
      const m = model(ctx);
      map.setMarks(marksFor(m)); applyPlan(map, m.plan, m.marks, mode === 'plan'); map.svg.classList.toggle('rfplan', mode === 'plan'); map.svg.toggleAttribute('data-focus', m.focus.length > 0);
      const side = $('#rfside', root); if (side) side.innerHTML = sidebar(map, m);
      const mob = $('#rfmob', root); if (mob) mob.innerHTML = mobileBar(map, m);
      const sc = $('#rfscan', root); if (sc) sc.innerHTML = scanOpen && mode !== 'plan' ? scanSheet() : '';
      setStrip(root, rfStrip(m));
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = weekBadge(m);
    });
    paint();
    // Carried from a shelf selected on the map: zoom to it and ring it. No
    // mark: a tap here toggles the refresh, so arriving only brings it into view.
    if (ctx.arg?.select) { const code = canonCode(ctx.arg.select); if (map.groups(code).length) { map.select(code); requestAnimationFrame(() => { map.zoomTo(code); map.ping(code); }); } }
    bindShelfScan(root, map, async info => { const was = !!markKeysFor(model(ctx).marks, info).length; await tap(ctx, info, { scanned: true }); lastScan = { ok: true, text: was ? tx('{code} was already refreshed this week', { code: info.full }) : tx('{code} marked refreshed', { code: info.full }) }; paint(); }, msg => { lastScan = { ok: false, text: msg }; paint(); });
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
        else if (act === 'scan-shelf') openScanner({ title: tx('Scan shelf labels'), hint: tx('Each label marks its shelf refreshed'), continuous: true, onCode: code => {
          const { g, error } = oneShelf(map.svg, code);
          if (!g) return toast(error, 'bad');
          tap(ctx, map.shelfInfo(g), { scanned: true });
        } });
        else if (act === 'chart') { chartMode = a.dataset.v; try { localStorage.setItem(CHART_KEY, chartMode); } catch {} paint(); }
        else if (act === 'open-dept') { openDept = a.dataset.dept || null; paint(); }
        else if (act === 'locate') { if (!flashSeg(map, a.dataset.seg)) toast(tx('{code} is not on this map', { code: a.dataset.seg }), 'bad'); }
        else if (act === 'reset-dept') {
          const d = a.dataset.dept, segs = (refreshedByDept(map, m).find(g => g[0] === d) || [, []])[1];
          if (!segs.length || !confirm(tx('Reset all refreshed shelves in {dept} for this week?\n\nThis clears them for everyone on the team and cannot be undone.', { dept: d.toUpperCase() }))) return;
          await ctx.store.dispatch({ type: 'refresh.clearDept', entity: { week: m.week }, payload: { dept: d, segments: segs } }); toast(tx('{dept} refreshes reset', { dept: d.toUpperCase() }));
        }
        else if (act === 'colour') { planColour = a.getAttribute('data-colour'); mode = 'plan'; paint(); }
        else if (act === 'reset-week') { if (confirm(tx('Reset all refreshed shelves for this week?\n\nThis clears every shelf marked as refreshed — for everyone on the team — and cannot be undone.'))) await ctx.store.dispatch({ type: 'refresh.clearWeek', entity: { week: m.week } }); }
        else if (act === 'reset-plan') { const n = Object.keys(m.plan).length; if (!n) return toast(tx('Nothing is planned')); if (confirm(txn(n, 'Reset planning?\n\nThis clears the colour on {n} planned shelf, for everyone on the team.', 'Reset planning?\n\nThis clears the colours on all {n} planned shelves, for everyone on the team.'))) { await ctx.store.dispatch({ type: 'refresh.plan.clear', entity: {} }); toast(tx('Planning reset')); } }
        else if (act === 'focus') { const d = a.getAttribute('data-dept'); const next = m.focus.includes(d) ? m.focus.filter(x => x !== d) : [...m.focus, d]; await ctx.store.dispatch({ type: 'refresh.focus.set', entity: { week: m.week }, payload: { departments: next } }); }
        else if (act === 'zoom-dept') { map.filterDept(a.getAttribute('data-dept')); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('refresh', paint)];   // the sync pill shows sync state: a status change no longer repaints the map (P5)
  },
};

function sidebar(map, m) {
  const fc = focusCounts(m);
  return `<div class="pcard"><div class="rfcount">${ic('asterisk')}<div class="n">${m.counted}<small> / ${TARGET}</small></div><div class="fx">${tx('Focus this week')}<div class="chips">${fc.map(f => `<span class="chip" data-act="zoom-dept" data-dept="${esc(f.d)}"><span class="sw" style="background:${DEPT_COLOUR[f.d]}"></span>${esc(f.d.toUpperCase())} ${f.done}/${f.total}</span>`).join('')}<span class="chip" style="color:var(--accent-ink)" data-act="mode" data-mode="focus">${tx('Choose…')}</span></div></div></div>${prog(m.done / TARGET * 100)}${shelfScanField(tx('Scan or type a shelf label to mark it'))}` +
    (mode === 'focus' ? `<div class="chips" style="margin-top:10px">${FOCUS_DEPTS.map(d => `<span class="chip${m.focus.includes(d) ? ' on' : ''}" data-act="focus" data-dept="${d}"><span class="sw" style="background:${DEPT_COLOUR[d]}"></span>${d.toUpperCase()}</span>`).join('')}<span class="chip" data-act="mode" data-mode="refresh">${tx('Done')}</span></div>` : '') + `</div>` +
    `<div class="pcard"><div class="pt3">${tx('This week’s scanning')}</div><div class="rfchart">${dayBars(m)}</div></div>` +
    `<div class="pcard"><div class="pt3">${tx('Refreshed this week')}<span style="margin-left:auto;font-weight:600;letter-spacing:0;text-transform:none">${txn(m.done, '{n} shelf', '{n} shelves')}</span></div>${groupsHtml(map, m)}</div>` +
    `<div class="pcard"><div class="plan"><span class="pt3" style="margin:0">${tx('Plan')}</span><span class="sw2${mode === 'plan' ? ' on' : ''}" data-act="mode" data-mode="${mode === 'plan' ? 'refresh' : 'plan'}"></span></div><div class="pal">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c && mode === 'plan' ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<span class="er${planColour === 'erase' && mode === 'plan' ? ' on' : ''}" data-act="colour" data-colour="erase">${ic('x')}</span></div><div class="lbl">${mode === 'plan' ? tx('Plan mode: tap shelves to paint them for the team. Same colour again clears.') : tx('Pick a colour, then tap shelves to mark them.')}</div></div>` +
    `<div class="pfoot"><button class="btn" data-act="reset-plan">${ic('refresh')}${tx('Reset planning')}</button></div>`;
}
// The phone's scan: one button opens a sheet with the camera and a box to
// type the label in; it stays open for the next shelf, saying what the last
// one did. The week's focus departments are a manager's call, made on the
// desk, so the phone only shows them.
let scanOpen = false, lastScan = null;
function scanSheet() {
  return `<div class="rf-sheetback" data-act="scan-close"><div class="sheet rf-sheet" role="dialog" aria-label="${tx('Mark a shelf refreshed')}"><div class="sheet-h"><h3>${tx('Mark a shelf refreshed')}</h3><button class="sheet-x" data-act="scan-close" aria-label="${tx('Close')}">${ic('x')}</button></div>` +
    `<button class="mv-big" data-camera="shelfscan" data-camera-continuous title="${tx('Scan shelf labels')}">${ic('camera')}${tx('Scan with the camera')}</button>` +
    `<div class="rf-type"><span class="lbl">${tx('Or type the shelf')}</span><div class="shelfscan">${ic('barcode')}<input data-field="shelfscan" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="${tx('e.g. A16 S1')}" aria-label="${tx('Shelf label')}"><button class="btn primary sm" data-act="scan-go">${tx('Mark')}</button></div></div>` +
    (lastScan ? `<div class="rf-last ${lastScan.ok ? 'ok' : 'bad'}">${ic(lastScan.ok ? 'check' : 'alert')}<span>${esc(lastScan.text)}</span></div>` : `<div class="rf-last">${tx('Each label marks its shelf refreshed for the whole team.')}</div>`) + '</div></div>';
}
// The phone's Refresh sheet (opened from the strip): the week's progress,
// scan and the Refresh/Plan toggle, each focus department with its own bar,
// and the shelves refreshed this week by department (a tap finds one).
function mobileBar(map, m) {
  const fc = focusCounts(m), left = 7 - (new Date().getDay() + 6) % 7;
  const head = `<div class="sx-h">${ic('m-refresh')}${tx('Location refresh')}<span class="n">${m.counted} / ${TARGET}</span></div><div class="sx-sub">${txn(left, 'This week · {period} · {n} day left', 'This week · {period} · {n} days left', { period: retailPeriod(new Date()) })}</div><div style="margin-top:8px">${sx.bar(m.counted, TARGET)}</div>`;
  // The toggle keeps its place: in Plan the colours take the scan button's spot.
  const row = `<div class="rf-row">${mode === 'plan' ? `<div class="rf-pal" role="group" aria-label="${tx('Plan colour')}">${PLAN_COLOURS.map(c => `<i style="background:${c}" class="${planColour === c ? 'on' : ''}" data-act="colour" data-colour="${c}"></i>`).join('')}<i class="er${planColour === 'erase' ? ' on' : ''}" title="${tx('Erase')}" data-act="colour" data-colour="erase">${ic('x')}</i></div>` : `<button class="rf-scanbtn" data-act="scan-open" aria-label="${tx('Scan or type a shelf')}">${ic('barcode')}<span>${tx('Scan or type')}</span></button>`}<div class="seg2"><button class="${mode !== 'plan' ? 'on' : ''}" data-act="mode" data-mode="refresh">${tx('Refresh')}</button><button class="${mode === 'plan' ? 'on' : ''}" data-act="mode" data-mode="plan">${tx('Plan')}</button></div></div>`;
  if (mode === 'plan') return `<div class="sx">${head}${row}<div class="sx-sub">${tx('Tap a shelf to paint it for the team. Tap the same colour again to clear.')}</div></div>`;
  const focus = sx.rows(fc.map(f => `<div class="sx-r" data-act="zoom-dept" data-dept="${esc(f.d)}">${dep(f.d)}<div class="k"><b>${esc(DEPT_NAME[f.d] || f.d.toUpperCase())}</b></div>${sx.bar(f.done, f.total, DEPT_COLOUR[f.d])}<span class="v">${f.done}/${f.total}</span></div>`)) ;
  const outside = m.done - m.counted;
  return `<div class="sx">${head}${row}` +
    sx.sec(tx('This week’s focus'), fc.length ? focus : sx.rows([sx.row('asterisk', tx('No focus departments set this week'), tx('Managers set them on a store PC'))]), fc.length ? tx('set by managers') : '') +
    sx.sec(tx('Completed this week'), doneByDept(map, m), m.focus.length && outside > 0 ? txn(m.done, '{n} shelf · {out} outside the focus', '{n} shelves · {out} outside the focus', { out: outside }) : txn(m.done, '{n} shelf', '{n} shelves')) + '</div>';
}
// The phone's completed list: each department with its badge, name and
// count, and its shelves as chips (a tap finds one); the first eight, then
// "+N more" opens the rest.
function doneByDept(map, m) {
  const groups = refreshedByDept(map, m);
  if (!groups.length) return sx.rows([sx.row('check', tx('Nothing refreshed yet this week'), tx('Scan or tap a shelf once it is done'))]);
  return `<div class="rf-mdone">${groups.map(([d, segs]) => { const open = openDept === d, shown = open ? segs : segs.slice(0, 8);
    return `<div class="rf-mgrp"><div class="rf-mgh">${DEPT_NAME[d] ? dep(d) : ''}<b>${esc(DEPT_NAME[d] || (d === 'other' ? tx('Other') : d.toUpperCase()))}</b><span class="n">${segs.length}</span></div><div class="rf-chips">${shown.map(seg => `<button class="rf-seg" type="button" data-act="locate" data-seg="${esc(seg)}">${esc(seg)}</button>`).join('')}${segs.length > shown.length ? `<button class="rf-seg more" type="button" data-act="open-dept" data-dept="${esc(d)}">${tx('+{n} more', { n: segs.length - shown.length })}</button>` : open && segs.length > 8 ? `<button class="rf-seg more" type="button" data-act="open-dept" data-dept="">${tx('Show less')}</button>` : ''}</div></div>`; }).join('')}</div>`;
}
// The strip under the phone's Refresh map: the week's count and the scan.
function rfStrip(m) {
  if (mode === 'plan') return `${ic('m-refresh')}<b>${tx('Planning')}</b><span class="s">${tx('Tap shelves to paint them')}</span><button class="act" type="button" data-act="mode" data-mode="refresh">${ic('check')}${tx('Done')}</button>`;
  return `${ic('m-refresh')}<b>${tx('Refresh')}</b><span class="n">${m.counted} / ${TARGET}</span><span class="s"></span><button class="act go" type="button" data-act="scan-open">${ic('barcode')}${tx('Scan or type')}</button>`;
}
function deptOfSeg(map, segId) { for (const g of map.segments()) if (segmentId(g) === segId) return (g.getAttribute('data-dept') || '').toLowerCase(); return ''; }

function groupsHtml(map, m) {
  const groups = refreshedByDept(map, m);
  if (!groups.length) return `<div class="cs-dim" style="font-size:12px;padding:6px 0">${tx('No shelves refreshed yet this week.')}</div>`;
  return `<div class="rf-groups">${groups.map(([d, segs]) => { const open = openDept === d, shown = open ? segs : segs.slice(0, 12);
    return `<div class="rf-grp"><div class="rf-gh">${dep(d)}<b>${esc(DEPT_NAME[d] || d.toUpperCase())}</b><span class="n">${segs.length}</span><button class="rf-reset" data-act="reset-dept" data-dept="${esc(d)}" title="${tx('Reset {dept} for this week', { dept: esc(d.toUpperCase()) })}">${tx('Reset')}</button></div><div class="rf-chips">${shown.map(seg => `<button class="rf-seg" data-act="locate" data-seg="${esc(seg)}">${esc(seg)}${m.plan[seg] ? `<i style="background:${esc(m.plan[seg])}"></i>` : ''}</button>`).join('')}${segs.length > shown.length ? `<button class="rf-seg more" data-act="open-dept" data-dept="${esc(d)}">${tx('+{n} more', { n: segs.length - shown.length })}</button>` : open && segs.length > 12 ? `<button class="rf-seg more" data-act="open-dept" data-dept="">${tx('Show less')}</button>` : ''}</div></div>`; }).join('')}</div>`;
}
// A located segment rings orange for three seconds, as ShelfSearcher's flash.
function flashSeg(map, seg) {
  const gs = map.segments().filter(g => segmentId(g) === seg); if (!gs.length) return false;
  map.zoomTo(seg, 500);   // the shelf, not its run
  for (const g of gs) g.setAttribute('data-flash', '1');
  setTimeout(() => { for (const g of gs) g.removeAttribute('data-flash'); }, 3000);
  return true;
}
