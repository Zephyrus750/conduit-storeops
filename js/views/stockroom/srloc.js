// The phone's location lookup: a backfiller types or scans a stockroom
// location and sees what the morning's report puts there, each item's
// store-wide stock on hand and carton size, and what to do: PULL (under
// two cartons in the whole store, so the floor has most likely run out)
// or ADJUST (in the bay, though the system says 0 or less). The floor's
// own low-stock list comes from the official system; this finds the pulls
// that are not obvious. Below the box: the bays with something to pull.

import { $, ic, esc, mhead, mscan, fmtDate, toast } from '../../ui.js';
import { ensureNames, loadProfiles, ctnOf } from './common.js';
import { bayRows, bayList, normLoc } from './intel.js';
import { flagsOf, byLoc } from '../../../shared/stockintel.js';

// The newest snapshot only (the phone does not need the history).
const cache = { key: null, snap: null, loading: null, error: null };
let paint = () => {};   // the mounted view's repaint, for a load that lands later
function latest(ctx) {
  const repaint = () => paint();
  const idx = ctx.store.get('soh')?.snaps || {}, key = Object.entries(idx).map(([d, x]) => d + x.at).sort().at(-1) || '';
  loadProfiles(ctx, repaint);
  if (!key) return { none: true };
  if (cache.key !== key && !cache.loading) {
    cache.loading = ctx.api(`/v1/store/${ctx.storeNo}/soh?n=1`).then(r => { cache.snap = r.snaps?.at(-1) || null; cache.key = key; cache.error = null; })
      .catch(e => { cache.error = e.message; }).finally(() => { cache.loading = null; try { repaint(); } catch {} });
  }
  return cache.snap ? { snap: cache.snap } : { error: cache.error };
}

const st = { loc: '' };
function body(ctx, repaint = () => paint()) {
  const d = latest(ctx);
  if (d.none) return '<p class="lbl">No stockroom report has been saved yet. A manager pastes it at the desk (Stock intelligence) each morning.</p>';
  if (!d.snap) return `<p class="lbl">${d.error ? esc(d.error) : 'Loading the morning report…'}</p>`;
  const data = { latest: d.snap };
  if (st.loc) {
    const rows = bayRows(data, st.loc);
    if (rows.length) ensureNames(ctx, rows.map(r => r.kc), repaint);
    const pull = rows.filter(r => r.flag === 'pull').length, adj = rows.filter(r => r.flag === 'adjust').length;
    return `<div class="mv-sub">Location ${esc(normLoc(st.loc))} · ${rows.length} item${rows.length === 1 ? '' : 's'}${pull ? ` · ${pull} to pull` : ''}${adj ? ` · ${adj} to adjust` : ''}</div>` +
      (rows.length ? bayList(rows) : '<p class="lbl">Nothing in this location on the morning report.</p>') +
      `<button class="mv-ghost" data-act="loc-clear">Another location</button>`;
  }
  // The bays with pulls (and adjustments), in walking order.
  const f = flagsOf(d.snap.rows, ctnOf), bays = {};
  for (const r of f.pull) (bays[r.loc] ||= { pull: 0, adjust: 0 }).pull++;
  for (const r of f.adjust) (bays[r.loc] ||= { pull: 0, adjust: 0 }).adjust++;
  const list = Object.keys(bays).sort(byLoc);
  return `<div class="mv-sub">From ${esc(fmtDate(d.snap.date))}'s report · ${list.length} location${list.length === 1 ? '' : 's'} with something to do</div>` +
    (list.length ? `<div class="mv-rows">${list.map(l => `<button class="mv-row" data-act="loc-open" data-loc="${esc(l)}"><span class="a">${esc(l)}</span><span class="b">${bays[l].pull ? `<b>${bays[l].pull} to pull</b>` : ''}${bays[l].pull && bays[l].adjust ? ' · ' : ''}${bays[l].adjust ? `${bays[l].adjust} to adjust` : ''}</span><span class="c">${ic('chev')}</span></button>`).join('')}</div>`
      : '<p class="lbl">Nothing on the report is under two cartons or at 0 or less, or the carton sizes are not known yet (they come from the manifests).</p>');
}

export default {
  id: 'srloc', title: 'Find a location', icon: 'search', area: 'stockroom',
  desktopView: 'srintel',   // the desk looks a location up on Stock intelligence
  desktop() { return ''; },
  mobile(ctx) {
    return mhead('Find a location', 'What the morning report puts there') +
      mscan('Location', `<input data-field="mloc" inputmode="numeric" autocomplete="off" placeholder="e.g. 7002" value="${esc(st.loc)}" enterkeyhint="search">`, 'Type or scan the bay label') +
      `<div id="srlocbody">${body(ctx)}</div>`;
  },
  mount(ctx, root) {
    const repaint = () => { const h = $('#srlocbody', root); if (h) h.innerHTML = body(ctx, repaint); };
    paint = repaint; repaint();
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.matches('[data-field="mloc"]')) return;
      e.preventDefault(); const v = normLoc(e.target.value);
      if (!v) return toast('Type the location number, like 7002', 'bad');
      st.loc = v; e.target.value = v; e.target.blur(); repaint();
    });
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'loc-open') { st.loc = a.dataset.loc; const i = root.querySelector('[data-field="mloc"]'); if (i) i.value = st.loc; repaint(); }
      else if (a.dataset.act === 'loc-clear') { st.loc = ''; const i = root.querySelector('[data-field="mloc"]'); if (i) { i.value = ''; i.focus(); } repaint(); }
    });
    return [ctx.store.on('soh', repaint), () => { if (paint === repaint) paint = () => {}; }];
  },
};
