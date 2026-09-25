// History: the permanent backfill record. Every bay that was marked ready
// or submitted, any day, with its metrics and codes; search, open a record,
// copy the metrics as CSV. Reads the same projection the review does.

import { addDays } from '../../../shared/time.js';
import { csvLines } from '../../../shared/records.js';
import { $, ic, esc, vh, sub, fmtTime, toast, mhead, mrows } from '../../ui.js';
import { ensureNames, nameHtml, todayKey } from './common.js';

const st = { q: '', sort: 'time', open: null };
function model(ctx) {
  const subs = Object.values(ctx.store.get('backfill').subs).filter(s => s.status !== 'pending' && s.metrics);
  const q = st.q.trim().toUpperCase();
  let recs = q ? subs.filter(s => s.bay.includes(q) || s.date.includes(q) || Object.keys(s.codes).some(c => c.startsWith(q))) : subs;
  recs = recs.slice().sort((a, b) => st.sort === 'loc' ? a.bay.localeCompare(b.bay) || b.date.localeCompare(a.date) : (b.submittedDoneAt || b.readyAt || '').localeCompare(a.submittedDoneAt || a.readyAt || ''));
  const week = subs.filter(s => Date.now() - new Date(s.date) < 7 * 86400000);
  return { subs, recs, week, open: recs.find(s => `${s.bay}:${s.date}` === st.open) || recs[0] || null };
}
export default {
  id: 'srhistory', title: 'History', icon: 'm-srhistory', area: 'stockroom',
  desktop(ctx) {
    if (ctx.arg?.q != null && st.arg !== ctx.arg) { st.q = ctx.arg.q; st.arg = ctx.arg; st.open = null; }
    const m = model(ctx), o = m.open;
    const days = Array.from({ length: 7 }, (_, i) => { const k = addDays(todayKey(), i - 6); return [k, m.subs.filter(s => s.date === k).length, ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${k}T00:00:00Z`).getUTCDay()]]; });
    const max = Math.max(1, ...days.map(d => d[1]));
    return vh('History', sub('Backfill archive', `${m.subs.length} locations on record`, `last 7 days: ${m.week.length}`), `<button class="btn" data-act="export">${ic('file')}Copy CSV</button>`, 'm-srhistory') +
      `<div class="hgrid"><div class="card hist"><div class="pt3">Archive<span class="hist-tools"><div class="search">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="Bay, keycode or date" aria-label="Search by bay, keycode or date"></div><span class="pills"><button class="${st.sort === 'time' ? 'on' : ''}" data-act="sort" data-v="time">Newest first</button><button class="${st.sort === 'loc' ? 'on' : ''}" data-act="sort" data-v="loc">By location</button></span></span></div>` +
      `<div class="hist-hd"><span>Date</span><span>Location</span><span>Status</span><span>Contents</span><span>Match</span><span>Ready</span></div>` +
      (m.recs.slice(0, 60).map(s => `<div class="hist-row${o === s ? ' on' : ''}" data-act="open" data-k="${esc(s.bay)}:${esc(s.date)}"><span class="cs-dim">${esc(s.date)}</span><span class="hist-loc">${esc(s.bay)}</span><span class="hist-deps"><span class="status ${s.status === 'submitted' ? 'good' : 'info'}">${s.status === 'submitted' ? 'Submitted' : 'Ready'}</span></span><span>${s.metrics.expected} code${s.metrics.expected === 1 ? '' : 's'}${s.autoSubmitted ? ' <span class="hist-tag">auto</span>' : ''}</span><span class="hist-met${s.metrics.accuracy < 100 ? ' low' : ''}">${s.metrics.scanned}/${s.metrics.expected} · ${s.metrics.accuracy}%</span><span class="cs-dim">${fmtTime(s.readyAt)}</span></div>`).join('') || '<div class="cs-dim" style="padding:14px 6px">No records yet. Bays land here when they are marked ready.</div>') +
      `<div class="cs-dim" style="padding:10px 2px 0">Showing ${Math.min(60, m.recs.length)} of ${m.recs.length}</div></div>` +
      `<div class="sidecol">${o ? `<div class="card hist-det"><div class="pt3">Record<span class="cs-dim">${esc(o.date)}</span></div><div class="hist-big">${esc(o.bay)}</div><div class="cs-dim">Marked ready ${fmtTime(o.readyAt)}${o.submittedDoneAt ? ` · submitted ${fmtTime(o.submittedDoneAt)}` : ''} · ${o.metrics.match}/${o.metrics.expected} matched · ${o.metrics.accuracy}% · ${o.metrics.incorrect} incorrect</div><div class="hist-codes">${Object.entries(o.codes).map(([kc, c]) => `<div class="hist-code"><span class="kc">${esc(kc)}<small>${nameHtml(kc)}</small></span><span class="cs-dim">${c.scanned ? 'scanned' : 'system only'}${o.incorrect.includes(kc) ? ' · incorrect' : ''}</span></div>`).join('')}</div></div>` : ''}` +
      `<div class="card"><div class="ch"><h3>Locations submitted</h3><span class="cs-dim">last 7 days</span></div><div class="bars" style="height:100px">${days.map(d => `<div class="${d[0] === todayKey() ? 'hi' : ''}" style="height:${d[1] ? Math.round(d[1] / max * 100) : 3}%"><span>${d[2]}</span></div>`).join('')}</div></div></div></div>`;
  },
  mobile(ctx) {
    if (ctx.arg?.q != null && st.arg !== ctx.arg) { st.q = ctx.arg.q; st.arg = ctx.arg; st.open = null; }
    const m = model(ctx), today = m.subs.filter(s => s.date === todayKey());
    return mhead('History', `Today · ${today.length} bays sent`) + (today.length ? mrows(today.map(s => [esc(s.bay), `${s.metrics.expected} codes · ${s.metrics.accuracy}%${s.status === 'submitted' ? ' · submitted' : ''}`, fmtTime(s.readyAt), s.metrics.accuracy < 90 ? 'warn' : 'ok'])) : `<div class="mv-note">${ic('layers')}Nothing sent yet today.</div>`) + `<div class="mv-note">${ic('lock')}Metrics and the full record are on the desktop History.</div>`;
  },
  mount(ctx, root) {
    const repaint = () => ctx.rerender();
    const o = model(ctx).open; if (o) ensureNames(ctx, Object.keys(o.codes), repaint);
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'open') { st.open = a.dataset.k; ctx.rerender(); }
      else if (a.dataset.act === 'sort') { st.sort = a.dataset.v; ctx.rerender(); }
      else if (a.dataset.act === 'export') { const m = model(ctx); const text = csvLines(['date', 'location', 'status', 'readyAt', 'submittedAt', 'expected', 'scanned', 'match', 'accuracy', 'incorrect', 'auto'], m.recs.map(s => [s.date, s.bay, s.status, s.readyAt || '', s.submittedDoneAt || '', s.metrics.expected, s.metrics.scanned, s.metrics.match, s.metrics.accuracy, s.metrics.incorrect, s.autoSubmitted ? 'yes' : ''])); try { await navigator.clipboard.writeText(text); toast(`${m.recs.length} rows copied`); } catch { toast('Copy failed', 'bad'); } }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    return [ctx.store.on('backfill', repaint)];
  },
};
