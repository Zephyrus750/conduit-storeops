// Stocktake: a session is opened on the desktop, shelves advance pending →
// counted → verified, phase counting | final. Reads store.get('stocktake').

import { $, ic, esc, vh, sub, prog, status, DEPT_COLOUR, DEPT_NAME, today, fmtTime, toast, mbig } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, groupsFor, oneShelf, segmentId, shelfScanField, bindShelfScan, keepScanFocus, setStrip, sx } from '../map.js';
import { openScanner } from '../scan.js';
import { printSheet, tick, table, section, signoff } from '../print.js';
import { csvLines } from '../../shared/records.js';
import { tx } from '../i18n.js';

// Counts per shelf. With the map mounted, a whole-run key from a session
// opened before counts were per shelf counts once for each of its shelves,
// so the big number, the bar and the department chips agree.
function countStates(shelves, map) {
  const counts = { pending: 0, counted: 0, verified: 0 };
  if (map) { const seen = new Set(); for (const g of map.segments()) { const id = segmentId(g); if (seen.has(id)) continue; seen.add(id); const r = shelves[id] || shelves[g.getAttribute('data-shelf')]; if (r) counts[r.state] = (counts[r.state] || 0) + 1; } }
  else for (const r of Object.values(shelves)) counts[r.state] = (counts[r.state] || 0) + 1;
  return counts;
}
function model(ctx, map) {
  const S = ctx.store.get('stocktake');
  const open = Object.entries(S.sessions).filter(([, s]) => !s.ended).sort((a, b) => (a[1].startedAt < b[1].startedAt ? 1 : -1))[0];
  const [id, sess] = open || [null, null];
  const shelves = sess ? sess.shelves : {};
  const counts = countStates(shelves, map);
  return { id, sess, shelves, counts, done: counts.counted + counts.verified };
}
// One session as the report and CSV read it, open or ended.
function sessionModel(id, sess, map) {
  const counts = countStates(sess.shelves, map);
  return { id, sess, shelves: sess.shelves, counts, done: counts.counted + counts.verified };
}
// Ended sessions, newest first: ShelfSearcher kept each finished count so a
// store can print its report or CSV again later.
const pastSessions = (ctx, map) => Object.entries(ctx.store.get('stocktake').sessions).filter(([, s]) => s.ended).sort((a, b) => (a[1].ended < b[1].ended ? 1 : -1)).map(([id, s]) => sessionModel(id, s, map));
const MARK = { pending: 'counting', counted: 'counted', verified: 'verified' };
// Counts are per shelf ("A11 S1"), as ShelfSearcher counted; a run with no
// suffixes is a single shelf. A session opened before counts were per shelf
// holds whole-run keys, which still count for every shelf of the run.
const stOf = (m, mod, shelf) => m.shelves[mod] || m.shelves[shelf];
const shelfTotal = map => new Set(map.segments().map(segmentId)).size;
function marksFor(m) { const out = {}; for (const [id, r] of Object.entries(m.shelves)) out[id] = MARK[r.state]; return out; }
function byDept(map, m) {
  const tot = {}, done = {};
  for (const g of map.segments()) { const d = (g.getAttribute('data-dept') || '').toLowerCase(), id = segmentId(g), r = stOf(m, id, g.getAttribute('data-shelf')); (tot[d] ||= new Set()).add(id); if (r && r.state !== 'pending') (done[d] ||= new Set()).add(id); }
  return Object.keys(tot).filter(d => DEPT_NAME[d] && !['checkouts', 'stockroom'].includes(d)).map(d => ({ d, done: done[d]?.size || 0, total: tot[d].size }));
}
// The phone map's badge: the open session's count.
const sessBadge = m => (m.sess ? tx('<b>{n}</b> counted · {v} ✓✓ · {id}', { n: m.done, v: m.counts.verified, id: esc(m.id) }) : tx('No session open'));
async function tap(ctx, info, hold) {
  const m = model(ctx); if (!m.id) return toast(tx('No stocktake session is open yet.'));
  // A run counted whole before counts were per shelf keeps its key.
  const key = !m.shelves[info.full] && m.shelves[info.id] ? info.id : info.full, cur = m.shelves[key];
  try {
    if (hold) { const back = !cur ? null : cur.state === 'verified' ? 'counted' : cur.state === 'counted' ? 'pending' : 'cleared'; if (back === 'counted') await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: key }, payload: { verified: false } }); else if (back) await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: key }, payload: { state: back } }); return; }
    // First tap starts the count (yellow "counting"), the second marks it counted, as in ShelfSearcher.
    if (!cur && m.sess?.phase === 'final') return toast(tx('Counting is closed; the final check only verifies'), 'bad');
    if (!cur) await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: key }, payload: { state: 'pending' } });
    else if (cur.state === 'pending') await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: key }, payload: { state: 'counted' } });
    else if (cur.state === 'counted' && !ctx.isMobile) await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: key }, payload: { verified: true } });
    else if (cur.state === 'verified' && !ctx.isMobile) await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: key }, payload: { verified: false } });
  } catch (e) { toast(e.message, 'bad'); }
}

export default {
  id: 'stocktake', title: tx('Stocktake'), icon: 'm-stocktake',
  desktop(ctx) {
    const m = model(ctx);
    return vh(tx('Stocktake'), m.sess ? sub(tx('Session open'), esc(m.id), m.sess.phase === 'final' ? tx('Final check · started {time}', { time: fmtTime(m.sess.startedAt) }) : tx('Counting · started {time}', { time: fmtTime(m.sess.startedAt) })) : sub(tx('No session open')), m.sess ? `<button class="btn" data-act="scan-shelf">${ic('camera')}${tx('Scan shelves')}</button>` : `<button class="btn primary" data-act="start">${ic('plus')}${tx('Start a session')}</button>`, 'm-stocktake') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx(tx('Stocktake'), ctx.storeNo)}<span><i style="background:#EAB308"></i>${tx('Counting')}</span><span><i style="background:#16A34A"></i>${tx('Counted')}</span><span><i style="background:#2563EB"></i>${tx('Verified')}</span><span><i style="background:#CBD0D8"></i>${tx('To start')}</span></div></div>` +
      `<div class="sidecol" id="stside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: sessBadge(m) }) + `<div class="mv-sel mode st" id="stmob"></div>`;
  },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { mono: true, onSelect: info => { if (info.kind === 'shelf') tap(ctx, info, info.long); } });
    bindMapChrome(root, map);
    const paint = () => keepScanFocus(root, () => {
      const m = model(ctx, map); map.setMarks(marksFor(m));
      const side = $('#stside', root); if (side) side.innerHTML = sidebar(map, m) + missingCard(map, m) + historyCard(pastSessions(ctx, map));
      const mob = $('#stmob', root); if (mob) mob.innerHTML = mobileBar(map, m, shelfTotal(map));
      setStrip(root, m.sess ? `${ic('m-stocktake')}<b>${tx('Stocktake')}</b><span class="n">${m.done}</span><span class="s">${m.sess.phase === 'final' ? tx('Final check') : tx('Counting')} · ${m.counts.verified} ✓✓</span><button class="act go" type="button" data-act="scan-shelf">${ic('camera')}${tx('Scan')}</button>` : `${ic('m-stocktake')}<b>${tx('Stocktake')}</b><span class="s">${tx('No session open')}</span>`);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = sessBadge(m);
    });
    paint();
    bindShelfScan(root, map, info => tap(ctx, info, false));
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        // A scan-walk: each shelf label read is a tap on that shelf.
        const past = a.dataset.session ? pastSessions(ctx, map).find(x => x.id === a.dataset.session) : null;
        if (act === 'report') printReport(map, past || model(ctx, map));
        if (act === 'csv') exportCsv(map, past || model(ctx, map));
        if (act === 'locate') { const id = a.dataset.shelf, gs = map.groups(id); map.zoomTo(id, 500); map.select(id); flash(gs); }   // the shelf, not its run
        if (act === 'missing-dept') { missingDept = missingDept === a.dataset.dept ? null : a.dataset.dept; paint(); }
        if (act === 'scan-shelf') openScanner({ title: tx('Scan shelf labels'), hint: tx('First read starts the count, the next marks it counted'), continuous: true, onCode: code => {
          const { g, error } = oneShelf(map.svg, code);
          if (!g) return toast(error, 'bad');
          tap(ctx, map.shelfInfo(g), false);
        } });
        if (act === 'start') { const id = prompt(tx('Session id'), today()); if (id) await ctx.store.dispatch({ type: 'stocktake.start', entity: { session: id.trim() } }); }
        else if (act === 'phase') await ctx.store.dispatch({ type: 'stocktake.phase', entity: { session: m.id }, payload: { phase: m.sess.phase === 'final' ? 'counting' : 'final' } });
        else if (act === 'verify-all') await ctx.store.dispatch({ type: 'stocktake.verifyAll', entity: { session: m.id } });
        else if (act === 'end') { if (confirm(tx('End stocktake session {id}?', { id: m.id }))) await ctx.store.dispatch({ type: 'stocktake.end', entity: { session: m.id } }); }
        else if (act === 'zoom-dept') map.filterDept(a.getAttribute('data-dept'));
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('stocktake', paint)];
  },
};
function sidebar(map, m) {
  if (!m.sess) return `<div class="card"><div class="ch"><h3>${tx('Session')}</h3>${status('info', tx('Closed'))}</div><p class="lbl">${tx('Start a session to begin counting. Phones count once it is open; verification stays on the desktop.')}</p><div class="pfoot" style="margin-top:14px"><button class="btn primary" data-act="start">${ic('plus')}${tx('Start a session')}</button></div></div>`;
  const total = shelfTotal(map);
  return `<div class="card"><div class="ch"><h3>${tx('Session {id}', { id: esc(m.id) })}</h3>${status(m.sess.phase === 'final' ? 'info' : 'warn', m.sess.phase === 'final' ? tx('Final check') : tx('Counting'))}</div>${shelfScanField(tx('Scan or type a shelf label to count it'))}<div class="big">${m.done}<span class="of">/</span>${total}</div><div class="lbl">${tx('Shelves counted · {v} verified · {p} counting', { v: m.counts.verified, p: m.counts.pending })}</div>${prog(m.done / Math.max(1, total) * 100)}` +
    `<div class="pfoot" style="flex-direction:column;gap:8px;margin-top:14px"><button class="btn" data-act="phase">${ic('refresh')}${m.sess.phase === 'final' ? tx('Back to counting') : tx('Flip to Final Check')}</button><button class="btn" data-act="report">${ic('print')}${tx('Report and missing list')}</button><button class="btn" data-act="csv">${ic('file')}${tx('Export CSV')}</button><button class="btn" data-act="verify-all">${ic('checks')}${tx('Bulk verify all counted')}</button><button class="btn" style="color:var(--red)" data-act="end">${tx('End session')}</button></div></div>` +
    `<div class="card"><div class="ch"><h3>${tx('By department')}</h3></div><div class="chips">${byDept(map, m).map(d => `<span class="chip" data-act="zoom-dept" data-dept="${d.d}"><span class="sw" style="background:${DEPT_COLOUR[d.d]}"></span>${d.d.toUpperCase()} ${d.done}/${d.total}</span>`).join('')}</div><p class="lbl" style="margin-top:14px">${tx('Tap a shelf to start counting it (yellow), again when it is counted (green); tap a counted shelf to verify it (blue).')}</p></div>`;
}
const pct = (n, total) => total ? Math.min(100, Math.round(n / total * 100)) : 0;
function mobileBar(map, m, total) {
  if (!m.sess) return `<div class="mv-mh">${ic('m-stocktake')}<b>${tx('Stocktake')}</b></div><div class="mv-hint">${tx('No stocktake session is open yet. Counting starts here when one opens.')}</div>`;
  // Still to count (Refresh's old still-due list): shelves not started or
  // mid-count, by department then name, a tap away on the map.
  const left = shelfStates(map, m).filter(r => r.state === 'not started' || r.state === 'pending');
  const todo = left.length ? sx.sec(tx('Still to count'), `<div class="sx-chips">${left.slice(0, 12).map(r => `<button class="sx-chip${r.state === 'pending' ? ' st-counting' : ''}" type="button" data-act="locate" data-shelf="${esc(r.id)}"><i class="sw" style="background:${DEPT_COLOUR[r.dept] || '#64748B'}"></i>${esc(r.id)}</button>`).join('')}${left.length > 12 ? `<span class="sx-chip dim">${tx('+{n} more', { n: left.length - 12 })}</span>` : ''}</div>`, tx('{n} to count · tap to find', { n: left.length })) : sx.sec(tx('Still to count'), sx.rows([sx.row('check', tx('Every shelf is counted'))]));
  return `<div class="mv-mh">${ic('m-stocktake')}<b>${tx('Stocktake')}</b><span class="phase">${m.sess.phase === 'final' ? tx('Final') : tx('Counting')}</span></div><div class="st-prog"><i><u class="v" style="width:${pct(m.counts.verified, total)}%"></u><u class="c" style="width:${pct(m.done, total)}%"></u></i><span>${tx('<b>{n}</b> counted · {v} ✓✓', { n: m.done, v: m.counts.verified })}</span></div>${shelfScanField(tx('Scan or type a shelf label'))}${todo}<div class="mv-hint">${tx('Tap or scan a shelf to start counting, again when counted, hold to step back. Session <b>{id}</b> is controlled from the desktop.', { id: esc(m.id) })}</div>`;
}

// Every shelf on the map with its department and this session's state.
function shelfStates(map, m) {
  const seen = new Map();
  for (const g of map.segments()) { const id = segmentId(g), d = (g.getAttribute('data-dept') || '').toLowerCase(); if (id && !seen.has(id) && DEPT_NAME[d] && !['checkouts', 'stockroom'].includes(d)) seen.set(id, [d, g.getAttribute('data-shelf')]); }
  return [...seen].map(([id, [d, shelf]]) => ({ id, dept: d, ...(stOf(m, id, shelf) || { state: 'not started' }) })).sort((a, b) => a.dept.localeCompare(b.dept) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
// ShelfSearcher's report: department tallies, then every shelf not yet
// counted, grouped by department with a tick to walk and find it.
function printReport(map, m) {
  const rows = shelfStates(map, m), by = {};
  for (const r of rows) (by[r.dept] ||= []).push(r);
  const tallies = Object.entries(by).map(([d, rs]) => [esc(d.toUpperCase()), esc(DEPT_NAME[d] || ''), String(rs.length), String(rs.filter(r => r.state === 'counted' || r.state === 'verified').length), String(rs.filter(r => r.state === 'verified').length), `<b>${rs.filter(r => r.state === 'not started' || r.state === 'pending').length}</b>`]);
  const missing = Object.entries(by).map(([d, rs]) => { const left = rs.filter(r => r.state === 'not started' || r.state === 'pending'); return left.length ? section(`${esc(d.toUpperCase())} ${esc(DEPT_NAME[d] || '')} · ${tx('{n} to count', { n: left.length })}`, table([tx('Shelf'), tx('State'), tx('Found'), tx('Note')], left.map(r => [`<b>${esc(r.id)}</b>`, r.state === 'pending' ? tx('counting') : tx('not started'), tick, '']), ['', '', 't', 'w'])) : ''; }).join('');
  printSheet({ title: tx('Stocktake report · {id}', { id: m.id }), subtitle: tx('{phase} · {n} counted · {v} verified', { phase: m.sess.phase === 'final' ? tx('Final check') : tx('Counting'), n: m.done, v: m.counts.verified }),
    body: section(tx('By department'), table([tx('Dept'), tx('Name'), tx('Shelves'), tx('Counted'), tx('Verified'), tx('Missing')], tallies, ['', '', 'n', 'n', 'n', 'n'])) + (missing || section(tx('Missing shelves'), `<p>${tx('Every shelf is counted.')}</p>`)) + signoff() });
}
async function exportCsv(map, m) {
  const text = csvLines(['shelf', 'dept', 'state', 'by', 'at'], shelfStates(map, m).map(r => [r.id, r.dept.toUpperCase(), r.state, r.by || '', r.at || '']));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `stocktake-${m.id}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(tx('Stocktake CSV downloaded'));
}

// The missing list on screen: shelves not yet counted, by department, each
// one a tap away from the map (ShelfSearcher's locate).
let missingDept = null;
function missingCard(map, m) {
  if (!m.sess) return '';
  const left = shelfStates(map, m).filter(r => r.state === 'not started' || r.state === 'pending'), by = {};
  for (const r of left) (by[r.dept] ||= []).push(r);
  const depts = Object.keys(by);
  if (!depts.length) return `<div class="card"><div class="ch"><h3>${tx('Missing shelves')}</h3>${status('good', tx('None'))}</div><p class="lbl">${tx('Every shelf is counted.')}</p></div>`;
  const open = missingDept && by[missingDept] ? missingDept : null;
  return `<div class="card st-miss"><div class="ch"><h3>${tx('Missing shelves')}</h3><span class="cs-dim">${tx('{n} to count · tap one to find it', { n: left.length })}</span></div><div class="chips">${depts.map(d => `<span class="chip${open === d ? ' on' : ''}" data-act="missing-dept" data-dept="${d}"><span class="sw" style="background:${DEPT_COLOUR[d]}"></span>${d.toUpperCase()} ${by[d].length}</span>`).join('')}</div>` +
    (open ? `<div class="st-miss-list">${by[open].map(r => `<button class="st-loc${r.state === 'pending' ? ' counting' : ''}" data-act="locate" data-shelf="${esc(r.id)}" title="${r.state === 'pending' ? tx('Counting') : tx('Not started')}">${esc(r.id)}</button>`).join('')}</div>` : `<p class="lbl" style="margin-top:8px">${tx('Pick a department to list its shelves.')}</p>`) + `</div>`;
}
function historyCard(past) {
  if (!past.length) return '';
  return `<div class="card"><div class="ch"><h3>${tx('Past sessions')}</h3><span class="cs-dim">${past.length}</span></div><div class="list">${past.slice(0, 12).map(p => `<div class="li st-past"><span class="loc">${esc(p.id)}</span><span class="nm">${fmtTime(p.sess.startedAt)} – ${fmtTime(p.sess.ended)}<small>${tx('{n} counted · {v} verified', { n: p.done, v: p.counts.verified })}</small></span><span class="ibtn" data-act="report" data-session="${esc(p.id)}" title="${tx('Print the report')}">${ic('print')}</span><span class="ibtn" data-act="csv" data-session="${esc(p.id)}" title="${tx('Download CSV')}">${ic('file')}</span></div>`).join('')}</div></div>`;
}
// A located shelf pulses for a moment so the eye finds it.
function flash(gs) {
  for (const g of gs) g.setAttribute('data-flash', '1');
  setTimeout(() => { for (const g of gs) g.removeAttribute("data-flash"); }, 4000);
}
