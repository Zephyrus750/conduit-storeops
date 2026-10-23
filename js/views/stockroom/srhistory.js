// History: the permanent backfill record. Every bay that was marked ready
// or submitted, any day, with its metrics and codes; search, open a record,
// download the metrics as CSV. Reads the same projection the review does.
// As K2B's: newest first, by location, the latest visit per bay, or the
// latest visit grouped by department (the store's bay ranges, Settings ›
// Store); a requested bay never scanned shows as "not verified"; a record
// can be moved back (unfinalise, reopen) or deleted, each as an event.
// Bays older than the live state's 60 days come from the worker's archive
// (decision 29): their counts only, and nothing left to move back.

import { addDays } from '../../../shared/time.js';
import { csvLines } from '../../../shared/records.js';
import { $, ic, esc, vh, sub, fmtTime, toast, mhead, mrows, DEPT_NAME } from '../../ui.js';
import { ensureNames, nameHtml, todayKey, send, copyText, loadArchive, archivedRecs, archiveState } from './common.js';
import { settingsOf, deptForBay } from '../../../shared/reducers/store.js';
import { tx, txn, lang, locale } from '../../i18n.js';

const SORTS = [['time', tx('Newest first')], ['loc', tx('By location')], ['latest', tx('Latest per bay')], ['dept', tx('By department')]];
const bayNum = b => { const m = /\d+/.exec(b); return m ? Number(m[0]) : Infinity; };
const byBay = (a, b) => bayNum(a.bay) - bayNum(b.bay) || a.bay.localeCompare(b.bay);

const st = { q: '', sort: 'time', open: null };
const ARCH_NOTE = { ready: '', loading: ` · ${tx('reading the archive for bays older than 60 days…')}`, failed: ` · ${tx('the last 60 days only: the archive could not be read (offline?)')}` };
// A day's one-letter name for the bars: English as K2B drew it, other languages from Intl.
const dayLetter = k => lang() === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${k}T00:00:00Z`).getUTCDay()] : new Intl.DateTimeFormat(locale(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${k}T00:00:00Z`));
function model(ctx) {
  const bf = ctx.store.get('backfill'), today = todayKey();
  const subs = [...Object.values(bf.subs).filter(s => s.status !== 'pending' && s.metrics), ...archivedRecs(bf.subs)];
  // A bay requested on an earlier day that never reached the board: the
  // "requested, not verified" record (K2B's requestedOnly marker).
  const reqOnly = Object.entries(bf.requested || {}).filter(([d]) => d < today).flatMap(([d, bays]) => bays.filter(b => !bf.subs[`${b}:${d}`]).map(b => ({ bay: b, date: d, requestedOnly: true, codes: {}, incorrect: [] })));
  const q = st.q.trim().toUpperCase();
  let recs = [...subs, ...reqOnly];
  if (q) recs = recs.filter(s => s.bay.includes(q) || s.date.includes(q) || Object.keys(s.codes).some(c => c.startsWith(q)));
  const when = s => s.submittedDoneAt || s.readyAt || s.date;
  if (st.sort === 'latest' || st.sort === 'dept') { const latest = new Map(); for (const r of recs) { const cur = latest.get(r.bay); if (!cur || r.date > cur.date || (r.date === cur.date && when(r) > when(cur))) latest.set(r.bay, r); } recs = [...latest.values()].sort(byBay); }
  else recs = recs.slice().sort((a, b) => st.sort === 'loc' ? byBay(a, b) || b.date.localeCompare(a.date) : when(b).localeCompare(when(a)));
  const ranges = settingsOf(ctx.store.get('settings')).deptRanges;
  const week = subs.filter(s => Date.now() - new Date(s.date) < 7 * 86400000);
  return { subs, recs, week, ranges, open: recs.find(s => `${s.bay}:${s.date}` === st.open) || recs[0] || null };
}
const row = (s, o) => s.requestedOnly
  ? `<div class="hist-row req${o === s ? ' on' : ''}" data-act="open" data-k="${esc(s.bay)}:${esc(s.date)}"><span class="cs-dim">${esc(s.date)}</span><span class="hist-loc">${esc(s.bay)}</span><span class="hist-deps"><span class="status warn">${tx('Requested')}</span></span><span class="cs-dim">${tx('not verified')}</span><span class="hist-met">—</span><span class="cs-dim">—</span></div>`
  : `<div class="hist-row${o === s ? ' on' : ''}" data-act="open" data-k="${esc(s.bay)}:${esc(s.date)}"><span class="cs-dim">${esc(s.date)}</span><span class="hist-loc">${esc(s.bay)}</span><span class="hist-deps"><span class="status ${s.status === 'submitted' ? 'good' : 'info'}">${s.status === 'submitted' ? tx('Submitted') : tx('Ready')}</span></span><span>${s.metrics.expected == null ? tx('{n} scanned', { n: s.metrics.scanned }) : txn(s.metrics.expected, '{n} code', '{n} codes')}${s.autoSubmitted ? ` <span class="hist-tag">${tx('auto')}</span>` : ''}${s.archived ? ` <span class="hist-tag">${tx('archived')}</span>` : ''}</span><span class="hist-met${s.metrics.accuracy != null && s.metrics.accuracy < 100 ? ' low' : ''}">${s.metrics.accuracy == null ? `<span class="cs-dim" title="${tx('No report was pasted for this bay, so it has no score')}">${tx('no report')}</span>` : `${s.metrics.scanned}/${s.metrics.expected} · ${s.metrics.accuracy}%`}</span><span class="cs-dim">${fmtTime(s.readyAt)}</span></div>`;
function rowsHtml(m) {
  const list = m.recs.slice(0, st.sort === 'time' ? 60 : 400);
  if (st.sort !== 'dept') return list.map(s => row(s, m.open)).join('');
  if (!m.ranges.length) return `<div class="ohint">${ic('layers')}${tx('Set up the department bay ranges in Settings › Store to group bays here.')} <a class="go" data-view="settings">${tx('Settings')}</a></div>` + list.map(s => row(s, m.open)).join('');
  const groups = new Map();
  for (const s of list) { const d = deptForBay(m.ranges, s.bay) || ''; if (!groups.has(d)) groups.set(d, []); groups.get(d).push(s); }
  const order = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'en', { numeric: true }));
  return order.map(d => `<div class="hist-grp">${d ? `${esc(d.toUpperCase())} · ${esc(DEPT_NAME[d] || '')}` : tx('Unassigned')}<span>${groups.get(d).length}</span></div>` + groups.get(d).map(s => row(s, m.open)).join('')).join('');
}
function csv(m) {
  return csvLines(['date', 'location', 'status', 'readyAt', 'submittedAt', 'expected', 'scanned', 'match', 'accuracy', 'incorrect', 'codes', 'autoClosed', 'requestedOnly'],
    m.recs.map(s => s.requestedOnly ? [s.date, s.bay, 'requested', '', '', '', '', '', '', '', '', '', 'yes'] : [s.date, s.bay, s.status, s.readyAt || '', s.submittedDoneAt || '', s.metrics.expected, s.metrics.scanned, s.metrics.match, s.metrics.accuracy, s.metrics.incorrect, s.trimmed ? s.codeCount || 0 : Object.keys(s.codes).length, s.autoSubmitted ? 'yes' : '', '']));
}
export default {
  id: 'srhistory', title: tx('History'), icon: 'm-srhistory', area: 'stockroom',
  desktop(ctx) {
    if (ctx.arg?.q != null && st.arg !== ctx.arg) { st.q = ctx.arg.q; st.arg = ctx.arg; st.open = null; }
    const m = model(ctx), o = m.open;
    const days = Array.from({ length: 7 }, (_, i) => { const k = addDays(todayKey(), i - 6); return [k, m.subs.filter(s => s.date === k).length, dayLetter(k)]; });
    const max = Math.max(1, ...days.map(d => d[1]));
    return vh(tx('History'), sub(tx('Backfill archive'), txn(m.subs.length, '{n} location on record', '{n} locations on record'), tx('last 7 days: {n}', { n: m.week.length })), `<button class="btn" data-act="download">${ic('file')}${tx('Download CSV')}</button><button class="btn" data-act="export">${tx('Copy CSV')}</button>`, 'm-srhistory') +
      `<div class="hgrid"><div class="card hist"><div class="pt3">${tx('Archive')}<span class="hist-tools"><div class="search">${ic('search')}<input data-field="q" value="${esc(st.q)}" placeholder="${tx('Bay, keycode or date')}" aria-label="${tx('Search by bay, keycode or date')}"></div><span class="pills">${SORTS.map(([k, l]) => `<button class="${st.sort === k ? 'on' : ''}" data-act="sort" data-v="${k}">${l}</button>`).join('')}</span></span></div>` +
      `<div class="hist-hd"><span>${tx('Date')}</span><span>${tx('Location')}</span><span>${tx('Status')}</span><span>${tx('Contents')}</span><span>${tx('Match')}</span><span>${tx('Ready')}</span></div>` +
      (rowsHtml(m) || `<div class="cs-dim" style="padding:14px 6px">${tx('No records yet. Bays land here when they are marked ready.')}</div>`) +
      `<div class="cs-dim" style="padding:10px 2px 0">${st.sort === 'latest' || st.sort === 'dept' ? tx('Showing {n} of {total} bays, the latest visit each', { n: Math.min(st.sort === 'time' ? 60 : 400, m.recs.length), total: m.recs.length }) : tx('Showing {n} of {total}', { n: Math.min(st.sort === 'time' ? 60 : 400, m.recs.length), total: m.recs.length })}${ARCH_NOTE[archiveState()]}</div></div>` +
      `<div class="sidecol">${o?.requestedOnly ? `<div class="card hist-det"><div class="pt3">${tx('Record')}<span class="cs-dim">${esc(o.date)}</span></div><div class="hist-big">${esc(o.bay)}</div><p class="lbl">${tx('Requested, not verified in this system: the bay was on the day’s requested list but no phone scanned it.')}</p></div>` : o ? `<div class="card hist-det"><div class="pt3">${tx('Record')}<span class="cs-dim">${esc(o.date)}</span></div><div class="hist-big">${esc(o.bay)}</div><div class="cs-dim">${tx('Marked ready {time}', { time: fmtTime(o.readyAt) })}${o.submittedDoneAt ? ` · ${tx('submitted {time}', { time: fmtTime(o.submittedDoneAt) })}` : ''}${o.metrics.accuracy == null ? ` · ${tx('{n} scanned · no report pasted, so not scored', { n: o.metrics.scanned })}` : ` · ${tx('{match}/{expected} matched · {acc}% · {n} incorrect', { match: o.metrics.match, expected: o.metrics.expected, acc: o.metrics.accuracy, n: o.metrics.incorrect })}`}${o.lateScans ? ` · ${txn(o.lateScans, 'reopened by {n} late scan', 'reopened by {n} late scans')}` : ''}</div>${o.archived ? '' : `<div class="hist-acts">${o.trimmed ? '' : o.status === 'submitted' ? `<button class="btn sm" data-act="unfinalise" title="${tx('Back to Ready')}">${ic('refresh')}${tx('Unfinalise')}</button>` : ''}${o.trimmed ? '' : `<button class="btn sm" data-act="reopen" title="${tx('Back into review')}">${tx('Reopen')}</button>`}<button class="btn sm" data-act="delete" style="color:var(--red)">${ic('trash')}${tx('Delete')}</button></div>`}${o.archived ? `<p class="lbl">${tx("Archived: older than 60 days, so the worker keeps its counts ({n} codes) and the store's event log keeps the detail. Nothing here can be moved back.", { n: o.codeCount })}</p>` : o.trimmed ? `<p class="lbl">${tx("Older than two weeks: the code list was trimmed to its counts ({n} codes, {scanned} scanned). The full detail stays in the store's event log.", { n: o.codeCount || 0, scanned: o.scannedCount || 0 })}</p>` : ''}<div class="hist-codes">${Object.entries(o.codes).map(([kc, c]) => `<div class="hist-code"><span class="kc">${esc(kc)}<small>${nameHtml(kc)}</small></span><span class="cs-dim">${c.scanned ? tx('scanned') : tx('system only')}${o.incorrect.includes(kc) ? ` · ${tx('incorrect')}` : ''}</span></div>`).join('')}</div></div>` : ''}` +
      `<div class="card"><div class="ch"><h3>${tx('Locations submitted')}</h3><span class="cs-dim">${tx('last 7 days')}</span></div><div class="bars" style="height:100px">${days.map(d => `<div class="${d[0] === todayKey() ? 'hi' : ''}" style="height:${d[1] ? Math.round(d[1] / max * 100) : 3}%"><span>${d[2]}</span></div>`).join('')}</div></div></div></div>`;
  },
  mobile(ctx) {
    if (ctx.arg?.q != null && st.arg !== ctx.arg) { st.q = ctx.arg.q; st.arg = ctx.arg; st.open = null; }
    const m = model(ctx), today = m.subs.filter(s => s.date === todayKey());
    return mhead(tx('History'), txn(today.length, 'Today · {n} bay sent', 'Today · {n} bays sent')) + (today.length ? mrows(today.map(s => [esc(s.bay), `${s.metrics.accuracy == null ? tx('{n} scanned · no report', { n: s.metrics.scanned }) : tx('{n} codes · {acc}%', { n: s.metrics.expected, acc: s.metrics.accuracy })}${s.status === 'submitted' ? ` · ${tx('submitted')}` : ''}`, fmtTime(s.readyAt), s.metrics.accuracy != null && s.metrics.accuracy < 90 ? 'warn' : 'ok'])) : `<div class="mv-note">${ic('layers')}${tx('Nothing sent yet today.')}</div>`);
  },
  mount(ctx, root) {
    const repaint = () => ctx.rerender();
    const o = model(ctx).open; if (o) ensureNames(ctx, Object.keys(o.codes), repaint);
    if (!ctx.isMobile) loadArchive(ctx, repaint);
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'open') { st.open = a.dataset.k; ctx.rerender(); }
      else if (a.dataset.act === 'sort') { st.sort = a.dataset.v; ctx.rerender(); }
      else if (a.dataset.act === 'export') { const m = model(ctx); copyText(csv(m), txn(m.recs.length, '{n} row', '{n} rows')); }
      else if (a.dataset.act === 'download') {
        const m = model(ctx), url = URL.createObjectURL(new Blob([csv(m)], { type: 'text/csv' })), l = document.createElement('a');
        l.href = url; l.download = `backfill-history${st.q.trim() ? '-' + st.q.trim().replace(/[^\w-]/g, '') : ''}-${todayKey()}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast(txn(m.recs.length, '{n} row downloaded', '{n} rows downloaded'));
      }
      else if (['unfinalise', 'reopen', 'delete'].includes(a.dataset.act)) {
        const o = model(ctx).open; if (!o || o.requestedOnly || o.archived) return;
        const E = { bay: o.bay, date: o.date };
        if (a.dataset.act === 'unfinalise') { if (await send(ctx, 'submission.ready', E)) toast(tx('{bay} · {date} moved back to Ready', { bay: o.bay, date: o.date })); }
        else if (a.dataset.act === 'reopen') { if (!confirm(o.date < todayKey() ? tx('Reopen {bay} ({date}) for review? An earlier day’s bay is submitted again automatically at the next end of day.', { bay: o.bay, date: o.date }) : tx('Reopen {bay} ({date}) for review?', { bay: o.bay, date: o.date }))) return; if (await send(ctx, 'submission.reopen', E)) toast(tx('{bay} is back in review', { bay: o.bay })); }
        else { if (!confirm(tx('Delete this history entry? {bay} on {date} leaves the board and History. The event log keeps a record of the delete.', { bay: o.bay, date: o.date }))) return; if (await send(ctx, 'submission.delete', E)) { st.open = null; toast(tx('History entry deleted')); } }
      }
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-field="q"]')) { st.q = e.target.value; const v = e.target.value; ctx.rerender(); setTimeout(() => { const i = root.querySelector('[data-field="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 0); } });
    return [ctx.store.on('backfill', repaint)];
  },
};
