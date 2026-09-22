// Stocktake: a session is opened on the desktop, shelves advance pending →
// counted → verified, phase counting | final. Reads store.get('stocktake').

import { $, ic, esc, vh, sub, prog, status, dep, DEPT_COLOUR, DEPT_NAME, today, fmtTime, toast, mbig } from '../ui.js';
import { mountMap, mapbar, crumbx, mvMap, bindMapChrome, canonCode } from '../map.js';
import { openScanner, scanSupported } from '../scan.js';

let reportOpen = false;

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
    if (!cur || cur.state === 'pending') await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: info.id }, payload: { state: 'counted' } });
    else if (cur.state === 'counted' && !ctx.isMobile) await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: info.id }, payload: { verified: true } });
    else if (cur.state === 'verified' && !ctx.isMobile) await ctx.store.dispatch({ type: 'stocktake.verify', entity: { session: m.id, shelf: info.id }, payload: { verified: false } });
  } catch (e) { toast(e.message, 'bad'); }
}

export default {
  id: 'stocktake', title: 'Stocktake', icon: 'm-stocktake',
  desktop(ctx) {
    const m = model(ctx);
    return vh('Stocktake', m.sess ? sub('Session open', esc(m.id), `${m.sess.phase === 'final' ? 'Final check' : 'Counting'} · started ${fmtTime(m.sess.startedAt)}`) : sub('No session open'), m.sess ? `${scanSupported() ? `<button class="btn" data-act="scan">${ic('barcode')}Scan</button>` : ''}<button class="btn" data-act="report">${ic('listcheck')}Report</button>` : `<button class="btn primary" data-act="start">${ic('plus')}Start a session</button>`, 'm-stocktake') +
      `<div class="grid2"><div class="mapbox">${mapbar()}<div class="mapstage" id="mapstage"></div>` +
      `<div class="mapleg">${crumbx('Stocktake', ctx.storeNo)}<span><i style="background:#EAB308"></i>Counting</span><span><i style="background:#16A34A"></i>Counted</span><span><i style="background:#2563EB"></i>Verified</span><span><i style="background:#CBD0D8"></i>To start</span></div></div>` +
      `<div class="sidecol" id="stside"></div></div><div id="strep"></div>`;
  },
  mobile(ctx) {
    const m = model(ctx);
    return mvMap({ badge: m.sess ? `<b>${m.done}</b> counted · ${m.counts.verified} ✓✓ · ${esc(m.id)}` : 'No session open' }) + `<div class="mv-sel mode st" id="stmob"></div><div id="strep"></div>`;
  },
  mount(ctx, root) {
    const map = mountMap($('#mapstage', root), { mono: true, onSelect: info => { if (info.kind === 'shelf') tap(ctx, info, info.long); } });
    bindMapChrome(root, map);
    const paint = () => {
      const m = model(ctx); map.setMarks(marksFor(m));
      const side = $('#stside', root); if (side) side.innerHTML = sidebar(map, m);
      const mob = $('#stmob', root); if (mob) mob.innerHTML = mobileBar(m);
      const badge = $('#mvbadge', root); if (badge) badge.innerHTML = m.sess ? `<b>${m.done}</b> counted · ${m.counts.verified} ✓✓ · ${esc(m.id)}` : 'No session open';
      const rp = $('#strep', root); if (rp) rp.innerHTML = reportOpen && m.sess ? reportView(ctx, map, m) : '';
    };
    paint();
    root.addEventListener('click', async e => {
      if (e.target.classList?.contains('st-rov')) { reportOpen = false; paint(); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.getAttribute('data-act'), m = model(ctx);
      try {
        if (act === 'start') { const id = prompt('Session id', today()); if (id) await ctx.store.dispatch({ type: 'stocktake.start', entity: { session: id.trim() } }); }
        else if (act === 'phase') await ctx.store.dispatch({ type: 'stocktake.phase', entity: { session: m.id }, payload: { phase: m.sess.phase === 'final' ? 'counting' : 'final' } });
        else if (act === 'verify-all') await ctx.store.dispatch({ type: 'stocktake.verifyAll', entity: { session: m.id } });
        else if (act === 'end') { if (confirm(`End stocktake session ${m.id}?`)) { reportOpen = false; await ctx.store.dispatch({ type: 'stocktake.end', entity: { session: m.id } }); } }
        else if (act === 'zoom-dept') map.filterDept(a.getAttribute('data-dept'));
        else if (act === 'report') { if (m.sess) { reportOpen = true; paint(); } }
        else if (act === 'report-close') { reportOpen = false; paint(); }
        else if (act === 'locate') { reportOpen = false; const id = a.getAttribute('data-id'); paint(); map.zoomTo(id); map.select(id); toast('Located ' + id); }
        else if (act === 'csv') exportCsv(ctx, map, m);
        else if (act === 'scan') { if (!m.sess) return toast('No session open'); if (m.sess.phase === 'final') return toast('Counting is closed — Final Check is on'); openScanner({ title: 'Stocktake scan', hint: 'Scan a shelf label to count it', onCode: raw => scanCount(ctx, map, raw) }); }
      } catch (err) { toast(err.message, 'bad'); }
    });
    return [ctx.store.on('stocktake', paint)];
  },
};
function sidebar(map, m) {
  if (!m.sess) return `<div class="card"><div class="ch"><h3>Session</h3>${status('info', 'Closed')}</div><p class="lbl">Start a session to begin counting. Phones count once it is open; verification stays on the desktop.</p><div class="pfoot" style="margin-top:14px"><button class="btn primary" data-act="start">${ic('plus')}Start a session</button></div></div>`;
  const total = map.segments().reduce((s, g) => s.add(g.getAttribute('data-shelf')), new Set()).size;
  return `<div class="card"><div class="ch"><h3>Session ${esc(m.id)}</h3>${status(m.sess.phase === 'final' ? 'info' : 'warn', m.sess.phase === 'final' ? 'Final check' : 'Counting')}</div><div class="big">${m.done}<span class="of">/</span>${total}</div><div class="lbl">Shelves counted · ${m.counts.verified} verified · ${m.counts.pending} counting</div>${prog(m.done / Math.max(1, total) * 100)}` +
    `<div class="pfoot" style="flex-direction:column;gap:8px;margin-top:14px"><button class="btn" data-act="phase">${ic('refresh')}${m.sess.phase === 'final' ? 'Back to counting' : 'Flip to Final Check'}</button><button class="btn" data-act="verify-all">${ic('checks')}Bulk verify all counted</button><button class="btn" data-act="report">${ic('listcheck')}Report &amp; missing list</button><button class="btn" style="color:var(--red)" data-act="end">End session</button></div></div>` +
    `<div class="card"><div class="ch"><h3>By department</h3></div><div class="chips">${byDept(map, m).map(d => `<span class="chip" data-act="zoom-dept" data-dept="${d.d}"><span class="sw" style="background:${DEPT_COLOUR[d.d]}"></span>${d.d.toUpperCase()} ${d.done}/${d.total}</span>`).join('')}</div><p class="lbl" style="margin-top:14px">Tap a shelf to count it; tap a counted shelf to verify it. Yellow while counting, green when counted, blue once verified.</p></div>`;
}
function mobileBar(m) {
  if (!m.sess) return `<div class="mv-mh">${ic('m-stocktake')}<b>Stocktake</b></div><div class="mv-hint">No session is open. Sessions start on the desktop.</div>`;
  return `<div class="mv-mh">${ic('m-stocktake')}<b>Stocktake</b><span class="phase">${m.sess.phase === 'final' ? 'Final' : 'Counting'}</span></div><div class="st-prog"><i><u class="v" style="width:${Math.min(100, m.counts.verified)}%"></u><u class="c" style="width:${Math.min(100, m.done)}%"></u></i><span><b>${m.done}</b> counted · ${m.counts.verified} ✓✓</span></div>${m.sess.phase !== 'final' && scanSupported() ? `<div style="padding:0 12px 2px">${mbig('Scan a shelf', '', 'barcode', ' data-act="scan"')}</div>` : ''}<div style="padding:0 12px 2px"><button class="btn sm" data-act="report">${ic('listcheck')}Report &amp; missing list</button></div><div class="mv-hint">Tap a shelf to count it, hold to step back. Session <b>${esc(m.id)}</b> is controlled from the desktop.</div>`;
}

// A camera scan of a shelf label counts it (idempotent — a shelf already
// counted or verified is left as is). Stocktake keys shelves by their id.
async function scanCount(ctx, map, raw) {
  const m = model(ctx); if (!m.id) return { ok: false, message: 'No session open' };
  if (m.sess.phase === 'final') return { ok: false, message: 'Counting is closed' };
  const code = canonCode(raw);
  const gs = code ? map.groups(code) : [];
  if (!gs.length) return { ok: false, message: `No shelf matches “${raw}”` };
  const id = map.shelfInfo(gs[0]).id;
  const cur = m.shelves[id];
  if (cur && (cur.state === 'counted' || cur.state === 'verified')) return { ok: true, message: `${id} already counted` };
  await ctx.store.dispatch({ type: 'stocktake.scan', entity: { session: m.id, shelf: id }, payload: { state: 'counted' } });
  return { ok: true, message: `${id} counted` };
}
// The session report — per-department tallies over unique shelf ids, the
// still-to-count list (tap one to find it on the map), and a CSV export.
// Ported from ShelfSearcher's stocktake report; missing = a shelf with no
// scan record, counting = pending, so the four buckets sum to the total.
function reportData(map, m) {
  const seen = new Set(), ids = [], deptOf = {}, by = {};
  for (const g of map.segments()) { const id = g.getAttribute('data-shelf'); if (!id || seen.has(id)) continue; seen.add(id); ids.push(id); deptOf[id] = (g.getAttribute('data-dept') || '').toLowerCase(); }
  for (const id of ids) {
    const d = deptOf[id] || 'other';
    const v = by[d] || (by[d] = { total: 0, counting: 0, counted: 0, verified: 0, missing: [] });
    v.total++;
    const r = m.shelves[id];
    if (r && r.state === 'verified') v.verified++;
    else if (r && r.state === 'counted') v.counted++;
    else if (r && r.state === 'pending') v.counting++;
    else v.missing.push(id);
  }
  return { ids, deptOf, by };
}
function reportView(ctx, map, m) {
  const { by } = reportData(map, m);
  const depts = Object.keys(by).sort((a, b) => (DEPT_NAME[a] || a).localeCompare(DEPT_NAME[b] || b));
  const tot = depts.reduce((o, d) => { const v = by[d]; o.total += v.total; o.counting += v.counting; o.counted += v.counted; o.verified += v.verified; o.missing += v.missing.length; return o; }, { total: 0, counting: 0, counted: 0, verified: 0, missing: 0 });
  const row = d => { const v = by[d]; return `<tr><td>${dep(d)}<span class="nm">${esc(DEPT_NAME[d] || d)}</span></td><td class="n">${v.total}</td><td class="n">${v.counting || ''}</td><td class="n">${v.counted || ''}</td><td class="n">${v.verified || ''}</td><td class="n${v.missing.length ? ' bad' : ''}">${v.missing.length || ''}</td></tr>`; };
  const missing = depts.flatMap(d => by[d].missing);
  const missingHtml = missing.length ? missing.map(id => `<span class="st-miss" data-act="locate" data-id="${esc(id)}">${esc(id)}</span>`).join('') : '<span class="st-none">Every shelf has been counted ✨</span>';
  return `<div class="st-rov"><div class="st-report" role="dialog" aria-label="Stocktake report">` +
    `<div class="ch"><h3>Stocktake report · ${esc(m.id)}</h3><span class="ibtn" data-act="report-close">${ic('x')}</span></div>` +
    `<div class="st-rsub">${esc(ctx.storeNo)} ${esc(ctx.storeName)} · ${m.sess.phase === 'final' ? 'Final check' : 'Counting'} · ${tot.counted + tot.verified}/${tot.total} counted · ${tot.verified} verified</div>` +
    `<div class="st-rtbl"><table><thead><tr><th>Department</th><th class="n">Total</th><th class="n">Counting</th><th class="n">Counted</th><th class="n">Verified</th><th class="n">Missing</th></tr></thead>` +
    `<tbody>${depts.map(row).join('')}</tbody>` +
    `<tfoot><tr><td>All departments</td><td class="n">${tot.total}</td><td class="n">${tot.counting}</td><td class="n">${tot.counted}</td><td class="n">${tot.verified}</td><td class="n${tot.missing ? ' bad' : ''}">${tot.missing}</td></tr></tfoot></table></div>` +
    `<div class="st-rmiss-h">Missing — not yet counted${missing.length ? ' <span>· tap one to find it on the map</span>' : ''}</div>` +
    `<div class="st-rmiss">${missingHtml}</div>` +
    `<div class="st-racts"><button class="btn" data-act="csv">${ic('file')}Export CSV</button><button class="btn primary" data-act="report-close">${ic('check')}Close</button></div>` +
    `</div></div>`;
}
function exportCsv(ctx, map, m) {
  const { ids, deptOf } = reportData(map, m);
  const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const lines = ['shelf,dept,state,at,by'];
  for (const id of ids) { const r = m.shelves[id]; lines.push([q(id), q(deptOf[id] || ''), q(r ? r.state : 'missing'), q(r && r.at ? new Date(r.at).toISOString() : ''), q(r ? (r.vby || r.by || '') : '')].join(',')); }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `stocktake-${ctx.storeNo}-${String(m.id).replace(/[^\w.-]/g, '_')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(`Exported ${ids.length} shelves`);
}
