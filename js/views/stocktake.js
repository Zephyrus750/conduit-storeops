// Stocktake: a session is opened on the desktop, shelves advance pending →
// counted → verified, phase counting | final. Reads store.get('stocktake').

import { $, ic, esc, vh, sub, prog, status, DEPT_COLOUR, DEPT_NAME, today, fmtTime, toast, mbig } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, groupsFor } from '../map.js';
import { openScanner } from '../scan.js';
import { printSheet, tick, table, section, signoff } from '../print.js';
import { csvLines } from '../../shared/records.js';

function model(ctx) {
  const S = ctx.store.get('stocktake');
  const open = Object.entries(S.sessions).filter(([, s]) => !s.ended).sort((a, b) => (a[1].startedAt < b[1].startedAt ? 1 : -1))[0];
  const [id, sess] = open || [null, null];
  const shelves = sess ? sess.shelves : {};
  const counts = { pending: 0, counted: 0, verified: 0 };
  for (const r of Object.values(shelves)) counts[r.state] = (counts[r.state] || 0) + 1;
  return { id, sess, shelves, counts, done: counts.counted + counts.verified };
}
const MARK = { pending: 'counting', counted: 'counted', verified: 'verified' };
function marksFor(m) { const out = {}; for (const [id, r] of Object.entries(m.shelves)) out[id] = MARK[r.state]; return out; }
function byDept(map, m) {
  const tot = {}, done = {};
  for (const g of map.segments()) { const d = (g.getAttribute('data-dept') || '').toLowerCase(), id = g.getAttribute('data-shelf'); (tot[d] ||= new Set()).add(id); if (m.shelves[id] && m.shelves[id].state !== 'pending') (done[d] ||= new Set()).add(id); }
  return Object.keys(tot).filter(d => DEPT_NAME[d] && !['checkouts', 'stockroom'].includes(d)).map(d => ({ d, done: done[d]?.size || 0, total: tot[d].size }));
}
async function tap(ctx, info, hold) {
  const m = model(ctx); if (!m.id) return toast('No stocktake session is open. Start one on the desktop.');
  const cur = m.shelves[info.id];
  try {
    if (hold) { const back = !cur ? null : cur.state === 'verified' ? 'counted' : cur.state === 'counted' ? 'pending' : 'cleared'; if (back === 'counted') await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: info.id }, payload: { verified: false } }); else if (back) await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: info.id }, payload: { state: back } }); return; }
    // First tap starts the count (yellow "counting"), the second marks it counted, as in ShelfSearcher.
    if (!cur && m.sess?.phase === 'final') return toast('Counting is closed; the final check only verifies', 'bad');
    if (!cur) await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: info.id }, payload: { state: 'pending' } });
    else if (cur.state === 'pending') await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: info.id }, payload: { state: 'counted' } });
    else if (cur.state === 'counted' && !ctx.isMobile) await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: info.id }, payload: { verified: true } });
    else if (cur.state === 'verified' && !ctx.isMobile) await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: info.id }, payload: { verified: false } });
  } catch (e) { toast(e.message, 'bad'); }
}

export default {
  id: 'stocktake', title: 'Stocktake', icon: 'm-stocktake',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Stocktake', m.sess ? sub('Session open', esc(m.id), `${m.sess.phase === 'final' ? 'Final check' : 'Counting'} · started ${fmtTime(m.sess.startedAt)}`) : sub('No session open'), m.sess ? `<button class="btn" data-act="scan-shelf">${ic('camera')}Scan shelves</button>` : `<button class="btn primary" data-act="start">${ic('plus')}Start a session</button>`, 'm-stocktake') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Stocktake', ctx.storeNo)}<span><i style="background:#EAB308"></i>Counting</span><span><i style="background:#16A34A"></i>Counted</span><span><i style="background:#2563EB"></i>Verified</span><span><i style="background:#CBD0D8"></i>To start</span></div></div>` +
      `<div class="sidecol" id="stside"></div></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: m.sess ? `<b>${m.done}</b> counted · ${m.counts.verified} ✓✓ · ${esc(m.id)}` : 'No session open' }) + `<div class="mv-sel mode st" id="stmob"></div>`;
  },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { mono: true, onSelect: info => { if (info.kind === 'shelf') tap(ctx, info, info.long); } });
    bindMapChrome(root, map);
    const paint = () => {
      const m = model(ctx); map.setMarks(marksFor(m));
      const side = $('#stside', root); if (side) side.innerHTML = sidebar(map, m);
      const mob = $('#stmob', root); if (mob) mob.innerHTML = mobileBar(m);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = m.sess ? `<b>${m.done}</b> counted · ${m.counts.verified} ✓✓ · ${esc(m.id)}` : 'No session open';
    };
    paint();
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        // A scan-walk: each shelf label read is a tap on that shelf.
        if (act === 'report') printReport(map, model(ctx));
        if (act === 'csv') exportCsv(map, model(ctx));
        if (act === 'scan-shelf') openScanner({ title: 'Scan shelf labels', hint: 'First read starts the count, the next marks it counted', continuous: true, onCode: code => {
          const g = groupsFor(map.svg, code)[0];
          if (!g) return toast(`${code} is not a shelf on this map`, 'bad');
          tap(ctx, map.shelfInfo(g), false);
        } });
        if (act === 'start') { const id = prompt('Session id', today()); if (id) await ctx.store.dispatch({ type: 'stocktake.start', entity: { session: id.trim() } }); }
        else if (act === 'phase') await ctx.store.dispatch({ type: 'stocktake.phase', entity: { session: m.id }, payload: { phase: m.sess.phase === 'final' ? 'counting' : 'final' } });
        else if (act === 'verify-all') await ctx.store.dispatch({ type: 'stocktake.verifyAll', entity: { session: m.id } });
        else if (act === 'end') { if (confirm(`End stocktake session ${m.id}?`)) await ctx.store.dispatch({ type: 'stocktake.end', entity: { session: m.id } }); }
        else if (act === 'zoom-dept') map.filterDept(a.getAttribute('data-dept'));
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('stocktake', paint)];
  },
};
function sidebar(map, m) {
  if (!m.sess) return `<div class="card"><div class="ch"><h3>Session</h3>${status('info', 'Closed')}</div><p class="lbl">Start a session to begin counting. Phones count once it is open; verification stays on the desktop.</p><div class="pfoot" style="margin-top:14px"><button class="btn primary" data-act="start">${ic('plus')}Start a session</button></div></div>`;
  const total = map.segments().reduce((s, g) => s.add(g.getAttribute('data-shelf')), new Set()).size;
  return `<div class="card"><div class="ch"><h3>Session ${esc(m.id)}</h3>${status(m.sess.phase === 'final' ? 'info' : 'warn', m.sess.phase === 'final' ? 'Final check' : 'Counting')}</div><div class="big">${m.done}<span class="of">/</span>${total}</div><div class="lbl">Shelves counted · ${m.counts.verified} verified · ${m.counts.pending} counting</div>${prog(m.done / Math.max(1, total) * 100)}` +
    `<div class="pfoot" style="flex-direction:column;gap:8px;margin-top:14px"><button class="btn" data-act="phase">${ic('refresh')}${m.sess.phase === 'final' ? 'Back to counting' : 'Flip to Final Check'}</button><button class="btn" data-act="report">${ic('print')}Report and missing list</button><button class="btn" data-act="csv">${ic('file')}Export CSV</button><button class="btn" data-act="verify-all">${ic('checks')}Bulk verify all counted</button><button class="btn" style="color:var(--red)" data-act="end">End session</button></div></div>` +
    `<div class="card"><div class="ch"><h3>By department</h3></div><div class="chips">${byDept(map, m).map(d => `<span class="chip" data-act="zoom-dept" data-dept="${d.d}"><span class="sw" style="background:${DEPT_COLOUR[d.d]}"></span>${d.d.toUpperCase()} ${d.done}/${d.total}</span>`).join('')}</div><p class="lbl" style="margin-top:14px">Tap a shelf to start counting it (yellow), again when it is counted (green); tap a counted shelf to verify it (blue).</p></div>`;
}
function mobileBar(m) {
  if (!m.sess) return `<div class="mv-mh">${ic('m-stocktake')}<b>Stocktake</b></div><div class="mv-hint">No session is open. Sessions start on the desktop.</div>`;
  return `<div class="mv-mh">${ic('m-stocktake')}<b>Stocktake</b><button class="mv-cam" data-act="scan-shelf" aria-label="Scan shelf labels" title="Scan shelf labels">${ic('camera')}</button><span class="phase">${m.sess.phase === 'final' ? 'Final' : 'Counting'}</span></div><div class="st-prog"><i><u class="v" style="width:${Math.min(100, m.counts.verified)}%"></u><u class="c" style="width:${Math.min(100, m.done)}%"></u></i><span><b>${m.done}</b> counted · ${m.counts.verified} ✓✓</span></div><div class="mv-hint">Tap a shelf to start counting, tap again when counted, hold to step back. Session <b>${esc(m.id)}</b> is controlled from the desktop.</div>`;
}

// Every shelf on the map with its department and this session's state.
function shelfStates(map, m) {
  const seen = new Map();
  for (const g of map.segments()) { const id = g.getAttribute('data-shelf'), d = (g.getAttribute('data-dept') || '').toLowerCase(); if (id && !seen.has(id) && DEPT_NAME[d] && !['checkouts', 'stockroom'].includes(d)) seen.set(id, d); }
  return [...seen].map(([id, d]) => ({ id, dept: d, ...(m.shelves[id] || { state: 'not started' }) })).sort((a, b) => a.dept.localeCompare(b.dept) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
// ShelfSearcher's report: department tallies, then every shelf not yet
// counted, grouped by department with a tick to walk and find it.
function printReport(map, m) {
  const rows = shelfStates(map, m), by = {};
  for (const r of rows) (by[r.dept] ||= []).push(r);
  const tallies = Object.entries(by).map(([d, rs]) => [esc(d.toUpperCase()), esc(DEPT_NAME[d] || ''), String(rs.length), String(rs.filter(r => r.state === 'counted' || r.state === 'verified').length), String(rs.filter(r => r.state === 'verified').length), `<b>${rs.filter(r => r.state === 'not started' || r.state === 'pending').length}</b>`]);
  const missing = Object.entries(by).map(([d, rs]) => { const left = rs.filter(r => r.state === 'not started' || r.state === 'pending'); return left.length ? section(`${esc(d.toUpperCase())} ${esc(DEPT_NAME[d] || '')} · ${left.length} to count`, table(['Shelf', 'State', 'Found', 'Note'], left.map(r => [`<b>${esc(r.id)}</b>`, r.state === 'pending' ? 'counting' : 'not started', tick, '']), ['', '', 't', 'w'])) : ''; }).join('');
  printSheet({ title: `Stocktake report · ${m.id}`, subtitle: `${m.sess.phase === 'final' ? 'Final check' : 'Counting'} · ${m.done} counted · ${m.counts.verified} verified`,
    body: section('By department', table(['Dept', 'Name', 'Shelves', 'Counted', 'Verified', 'Missing'], tallies, ['', '', 'n', 'n', 'n', 'n'])) + (missing || section('Missing shelves', '<p>Every shelf is counted.</p>')) + signoff() });
}
async function exportCsv(map, m) {
  const text = csvLines(['shelf', 'dept', 'state', 'by', 'at'], shelfStates(map, m).map(r => [r.id, r.dept.toUpperCase(), r.state, r.by || '', r.at || '']));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `stocktake-${m.id}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Stocktake CSV downloaded');
}
