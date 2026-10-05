// Stock intelligence (K2B / Vector's stockroom scan): paste the SOH report,
// save it as the day's snapshot, and read the snapshots back as a history
// that classes every keycode. STUCK (flat since stock arrived), GHOST (zero
// though stock arrived), FROZEN (flat, nothing arrived), DEEP (flat and two
// cartons or more: a spot-check), NEW (under three snapshots), MOVING. The
// day list turns the flagged ones into the walk's counts.

import { ic, esc, vh, sub, toast, mhead, fmtDate } from '../../ui.js';
import { todayKey, ensureNames, nameOf, nameHtml, loadProfiles, allProfiles, profileOf } from './common.js';
import { openScreenScan } from '../../screenscan.js';
import { parseReport, sohBand, historyOf, classify, checksFor, PRIORITY, BADGE, isoWeek, byLoc } from '../../../shared/stockintel.js';

// The snapshot history, fetched when the index changes.
const cache = { key: null, snaps: null, loading: null, error: null, built: null };
export function sohData(ctx, repaint) {
  const idx = ctx.store.get('soh')?.snaps || {}, key = Object.entries(idx).map(([d, x]) => d + x.at).sort().join('|');
  loadProfiles(ctx, repaint);
  if (!key) return { snaps: [], history: {}, latest: null, checks: {}, index: idx };
  if (cache.key !== key && !cache.loading) {
    cache.loading = ctx.api(`/v1/store/${ctx.storeNo}/soh?n=12`).then(r => { cache.snaps = r.snaps || []; cache.key = key; cache.error = null; cache.built = null; })
      .catch(e => { cache.error = e.message; }).finally(() => { cache.loading = null; try { repaint(); } catch {} });
  }
  if (!cache.snaps) return null;
  const pk = Object.keys(allProfiles()).length;
  if (!cache.built || cache.built.pk !== pk || cache.built.key !== cache.key) { const history = historyOf(cache.snaps); cache.built = { pk, key: cache.key, history, checks: checksFor(history, allProfiles()) }; }
  return { snaps: cache.snaps, history: cache.built.history, latest: cache.snaps.at(-1) || null, checks: cache.built.checks, index: idx };
}
export const sohError = () => cache.error;

export const spark = (w, cls) => { if (w.length < 2) return ''; const max = Math.max(...w, 1), W = 78, H = 22; return `<svg class="sri-spark ${cls}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${w.map((v, i) => `${(i / (w.length - 1) * (W - 2) + 1).toFixed(1)},${(H - 2 - Math.max(0, v) / max * (H - 4)).toFixed(1)}`).join(' ')}"/></svg>`; };
export const clsBadge = (cls, flat) => `<span class="sri-cls ${cls}">${cls === 'frozen' ? `FROZEN · ${flat}w` : BADGE[cls]}</span>`;
export const bandSoh = (soh, ctn) => `<span class="sri-soh ${sohBand(soh, ctn)}">SOH ${soh}</span>`;

const st = { text: '', parsed: null, keep: false, filter: 'all', q: '', busy: false, open: false };
const FILTERS = ['all', 'stuck', 'ghost', 'frozen', 'deep', 'new', 'moving'];

function pastePanel(ctx, data) {
  const p = st.parsed, items = p ? Object.values(p.items).sort((a, b) => byLoc(a.loc, b.loc) || a.kc.localeCompare(b.kc)) : [];
  const req = new Set((ctx.store.get('backfill').requested[todayKey()] || []).map(b => String(Number(String(b).replace(/\D/g, '')) || b)));
  const locs = [...new Set(items.map(r => r.loc))].sort(byLoc), unknown = items.filter(r => nameOf(r.kc) === null).length, pending = items.filter(r => nameOf(r.kc) === '').length;
  const bands = { r: 0, a: 0, g: 0 }; for (const r of items) bands[sohBand(r.soh, profileOf(r.kc)?.ctn)]++;
  const missing = [...req].filter(l => !locs.includes(l));
  const outBack = locs.map(l => { const here = items.filter(r => r.loc === l), z = here.filter(r => profileOf(r.kc)?.ctn && r.soh <= 0); return z.length ? [l, z.length, here.length] : null; }).filter(Boolean);
  const today = todayKey(), replaces = data?.index?.[today];
  return `<div class="card sri-paste"><div class="ch"><h3>Paste the SOH report</h3><span class="cs-dim">LOCATION · KEYCODE · APN · DESC · COLOUR · STATUS · PRICE · SOH</span></div>` +
    `<textarea class="sri-ta" data-field="report" placeholder="Paste the report text here: the whole report, or one more page at a time" spellcheck="false">${esc(st.text)}</textarea>` +
    `<div class="sri-acts"><button class="btn primary sm" data-act="sri-read">${ic('check')}Read it</button><button class="btn sm" data-act="sri-screen" title="Read the report off the SIM screen">${ic('expand')}Screen scan</button>${p ? `<button class="btn sm" data-act="sri-clear">Clear</button>` : ''}<span class="cs-dim">${p ? `${items.length} keycodes at ${locs.length} locations${p.skipped ? ` · ${p.skipped} lines skipped` : ''}` : 'Paste more and read again: rows merge by keycode, so a page pasted twice changes nothing.'}</span></div>` +
    (p && items.length ? `<div class="sri-sum"><span class="sri-soh r">${bands.r} at 0 or less</span><span class="sri-soh a">${bands.a} under two cartons</span><span class="sri-soh g">${bands.g} healthy</span>${pending ? `<span class="cs-dim">checking ${pending} names…</span>` : ''}${unknown ? `<span class="warn">${unknown} not in the catalogue</span>` : ''}</div>` +
      `<div class="sri-locs">${locs.slice(0, 80).map(l => `<span class="sri-loc">${esc(l)}${req.has(l) ? '<b class="req">REQ</b>' : '<b class="pre">PRE</b>'}</span>`).join('')}${missing.map(l => `<span class="sri-loc miss">${esc(l)}<b>MISSING</b></span>`).join('')}</div>` +
      outBack.slice(0, 6).map(([l, z, n]) => `<p class="lbl">▤ ${esc(l)}: ${z} of ${n} items here read 0 on hand but the carton profiles show depth: the stock is most likely out the back.</p>`).join('') +
      (unknown ? `<label class="sri-keep"><input type="checkbox" data-field="keep"${st.keep ? ' checked' : ''}> Keep the ${unknown} code${unknown === 1 ? '' : 's'} the catalogue does not know (mistyped by OCR, or new lines)</label>` : '') +
      `<div class="sri-acts"><button class="btn primary" data-act="sri-save"${(unknown && !st.keep) || pending || st.busy ? ' disabled' : ''}>${ic('check')}Save as ${esc(fmtDate(today))}'s snapshot · ${isoWeek(today)}</button>${replaces ? `<span class="cs-dim">replaces the ${replaces.rows} rows saved earlier today</span>` : ''}</div>` : '') + '</div>';
}

function classesCard(ctx, data) {
  if (!data) return `<div class="card"><div class="ch"><h3>Classes</h3></div><div class="ohint">${sohError() ? esc(sohError()) : 'Loading the snapshots…'}</div></div>`;
  if (!data.snaps.length) return `<div class="card"><div class="ch"><h3>Classes</h3></div><p class="lbl">No snapshot yet. Paste this week's SOH report and save it; the classes need three snapshots to tell flat from moving.</p></div>`;
  const rows = Object.values(data.history).map(h => ({ ...h, ...classify(h, profileOf(h.kc)) }));
  const counts = Object.fromEntries(FILTERS.map(f => [f, f === 'all' ? rows.length : rows.filter(r => r.cls === f).length]));
  const q = st.q.trim().toLowerCase();
  const list = rows.filter(r => (st.filter === 'all' || r.cls === st.filter) && (!q || r.kc.includes(q) || String(r.loc).includes(q) || (nameOf(r.kc) || r.name || '').toLowerCase().includes(q)))
    .sort((a, b) => PRIORITY[a.cls] - PRIORITY[b.cls] || b.flat - a.flat || byLoc(a.loc, b.loc));
  const verify = ctx.store.get('soh')?.verify?.[data.latest.date] || {};
  return `<div class="card"><div class="ch"><h3>Classes</h3><span class="cs-dim">${data.snaps.length} snapshot${data.snaps.length === 1 ? '' : 's'} · ${esc(data.snaps[0].date)} to ${esc(data.latest.date)}</span></div>` +
    `<div class="sri-filters">${FILTERS.map(f => `<button class="chip${st.filter === f ? ' on' : ''}" data-act="sri-filter" data-f="${f}">${f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)} <b>${counts[f]}</b></button>`).join('')}<div class="search">${ic('search')}<input data-field="sri-q" value="${esc(st.q)}" placeholder="Keycode, location or name"></div></div>` +
    `<div class="mfx-scroll"><table class="wb-t sri-t"><thead><tr><th>Class</th><th>Keycode</th><th>Product</th><th>Loc</th><th>Last ${Math.min(12, data.snaps.length)}</th><th class="n">SOH</th><th class="n">/ctn</th><th>Last landed</th></tr></thead><tbody>${list.slice(0, 300).map(r => `<tr><td>${clsBadge(r.cls, r.flat)}${r.recount ? '<span class="sri-badge recount">RECOUNT</span>' : ''}${verify[`${r.kc}|${r.loc}`] ? ' <span class="status good">✓ verified</span>' : ''}</td><td class="mono">${esc(r.kc)}</td><td>${nameHtml(r.kc)}</td><td class="mono">${esc(r.loc)}</td><td>${spark(r.w, r.cls)}</td><td class="n">${bandSoh(r.latest, r.ctn)}</td><td class="n">${r.ctn || '—'}</td><td>${r.lastArrival?.date ? esc(fmtDate(r.lastArrival.date)) : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="cs-dim">Nothing in this class.</td></tr>'}</tbody></table></div>${list.length > 300 ? `<p class="lbl">${list.length - 300} more: search or pick a class to narrow.</p>` : ''}</div>`;
}

function snapsCard(data) {
  if (!data?.snaps?.length) return '';
  const idx = data.index;
  return `<div class="card"><div class="ch"><h3>Snapshots</h3><span class="cs-dim">newest 26 kept</span></div><div class="list">${Object.entries(idx).sort((a, b) => b[0].localeCompare(a[0])).map(([d, x]) => `<div class="li"><span class="loc">${esc(fmtDate(d))}</span><span class="nm">${esc(x.week)} · ${x.rows} rows · ${x.locs} locations</span><button class="btn sm" data-act="sri-remove" data-date="${esc(d)}" title="Remove a wrong paste">${ic('trash')}</button></div>`).join('')}</div></div>`;
}

export default {
  id: 'srintel', title: 'Stock intelligence', icon: 'chart', area: 'stockroom',
  desktop(ctx) {
    const data = sohData(ctx, () => ctx.rerender()), idx = ctx.store.get('soh')?.snaps || {}, n = Object.keys(idx).length;
    if (st.parsed) ensureNames(ctx, Object.keys(st.parsed.items), () => ctx.rerender());
    if (data?.history && st.filter !== 'all') ensureNames(ctx, Object.values(data.history).filter(h => classify(h, profileOf(h.kc)).cls === st.filter).slice(0, 300).map(h => h.kc), () => ctx.rerender());
    const head = vh('Stock intelligence', sub(`${n} snapshot${n === 1 ? '' : 's'}`, n ? `latest ${esc(Object.keys(idx).sort().at(-1))}` : 'none yet', 'STUCK · GHOST · FROZEN · DEEP'), `<button class="btn" data-view="daylist">${ic('m-daylist')}Day list</button>`, 'chart');
    return head + `<div class="sri-grid"><div>${pastePanel(ctx, data)}${classesCard(ctx, data)}</div><div>${snapsCard(data)}<div class="card"><div class="ch"><h3>How the classes work</h3></div><ul class="sri-help"><li>${clsBadge('stuck')} SOH has not moved for three snapshots although stock arrived: count it.</li><li>${clsBadge('ghost')} The system says zero but stock arrived: count it.</li><li>${clsBadge('frozen', 3)} Flat for three or more snapshots with nothing arriving: count it.</li><li>${clsBadge('deep')} Flat, but two cartons or more on hand: a spot-check.</li><li>${clsBadge('new')} Under three snapshots: not enough history yet.</li><li><span class="sri-badge recount">RECOUNT</span> Re-cartoned within the last four trucks: count, do not spot-check.</li></ul></div></div></div>`;
  },
  mobile() { return mhead('Stock intelligence', 'Desktop') + `<div class="mv-note">${ic('chart')}The SOH report is pasted at the desk. The day list on this phone carries today's counts.</div>`; },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'sri-read') { st.text = root.querySelector('[data-field="report"]')?.value || ''; const r = parseReport(st.text, st.parsed?.items ? { ...st.parsed.items } : {}); if (!Object.keys(r.items).length) return toast('No item rows found: the report needs a keycode, a location and an SOH on each row', 'bad'); st.parsed = { items: r.items, skipped: (st.parsed?.skipped || 0) + r.skipped }; st.text = ''; ctx.rerender(); }
      else if (act === 'sri-screen') openScreenScan(ctx, { mode: 'rows', onUse: ({ items }) => { const merged = { ...(st.parsed?.items || {}) }; for (const r of Object.values(items)) merged[r.kc] = merged[r.kc] ? { ...merged[r.kc], loc: r.loc, soh: r.soh, price: r.price ?? merged[r.kc].price } : r; st.parsed = { items: merged, skipped: st.parsed?.skipped || 0 }; toast(`${Object.keys(items).length} rows read off the screen`); ctx.rerender(); } });
      else if (act === 'sri-clear') { st.parsed = null; st.text = ''; st.keep = false; ctx.rerender(); }
      else if (act === 'sri-filter') { st.filter = a.dataset.f; ctx.rerender(); }
      else if (act === 'sri-save') {
        const items = Object.values(st.parsed?.items || {}); if (!items.length) return;
        st.busy = true; ctx.rerender();
        try { const r = await ctx.api(`/v1/store/${ctx.storeNo}/soh`, { method: 'POST', body: { date: todayKey(), rows: items.map(x => ({ kc: x.kc, loc: x.loc, soh: x.soh, price: x.price, ...(nameOf(x.kc) ? { name: nameOf(x.kc) } : {}) })) }, timeoutMs: 60000 }); toast(`Snapshot saved · ${r.week} · ${r.rows} items`); st.parsed = null; st.keep = false; }
        catch (err) { toast(err.message, 'bad'); }
        st.busy = false; ctx.rerender();
      }
      else if (act === 'sri-remove') { if (!confirm(`Remove the snapshot for ${a.dataset.date}? The classes are worked out again without it.`)) return; try { await ctx.api(`/v1/store/${ctx.storeNo}/soh/${a.dataset.date}`, { method: 'DELETE' }); toast('Snapshot removed'); } catch (err) { toast(err.message, 'bad'); } }
    });
    root.addEventListener('change', e => { if (e.target.matches('[data-field="keep"]')) { st.keep = e.target.checked; ctx.rerender(); } });
    let typing = null;
    root.addEventListener('input', e => { if (e.target.matches('[data-field="sri-q"]')) { st.q = e.target.value; clearTimeout(typing); typing = setTimeout(() => { const v = st.q; ctx.rerender(); const i = document.querySelector('#content [data-field="sri-q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 180); } else if (e.target.matches('[data-field="report"]')) st.text = e.target.value; });
    return [ctx.store.on('soh', () => ctx.rerender())];
  },
};
