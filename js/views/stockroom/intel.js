// Stock intelligence (K2B / Vector's stockroom scan): paste the SOH report,
// save it as the day's snapshot, and read the snapshots back as a history
// that classes every keycode. STUCK (flat since stock arrived), GHOST (zero
// though stock arrived), FROZEN (flat, nothing arrived), DEEP (flat and two
// cartons or more: a spot-check), NEW (under three snapshots), MOVING. The
// day list turns the flagged ones into the walk's counts.

import { ic, esc, vh, sub, toast, mhead, fmtDate } from '../../ui.js';
import { todayKey, kcCopy, ensureNames, nameOf, nameHtml, loadProfiles, allProfiles, profileOf, ctnOf, depthChip } from './common.js';
import { openScreenScan } from '../../screenscan.js';
import { parseReport, rowKey, sohBand, flagOf, flagsOf, historyOf, classify, checksFor, PRIORITY, BADGE, isoWeek, byLoc } from '../../../shared/stockintel.js';
import { tx, txn } from '../../i18n.js';

// The snapshot history, fetched when the index changes.
const cache = { key: null, snaps: null, loading: null, error: null, built: null };
export function sohData(ctx, repaint) {
  const idx = ctx.store.get('soh')?.snaps || {}, key = Object.entries(idx).map(([d, x]) => d + x.at).sort().join('|');
  loadProfiles(ctx, repaint);
  if (!key) return { snaps: [], history: {}, latest: null, checks: {}, index: idx };
  if (cache.key !== key && !cache.loading) {
    cache.loading = ctx.api(`/v1/store/${ctx.storeNo}/soh?n=12&weekly=1`).then(r => { cache.snaps = r.snaps || []; cache.key = key; cache.error = null; cache.built = null; })
      .catch(e => { cache.error = e.message; }).finally(() => { cache.loading = null; try { repaint(); } catch {} });
  }
  if (!cache.snaps) return null;
  const pk = Object.keys(allProfiles()).length;
  if (!cache.built || cache.built.pk !== pk || cache.built.key !== cache.key) { const history = historyOf(cache.snaps); cache.built = { pk, key: cache.key, history, checks: checksFor(history, allProfiles()) }; }
  return { snaps: cache.snaps, history: cache.built.history, latest: cache.snaps.at(-1) || null, checks: cache.built.checks, index: idx };
}
export const sohError = () => cache.error;

// One bay from the newest snapshot: what the report puts there, its SOH,
// the carton size and what it asks for (adjust, then pull, then the rest).
// The phone's Location lookup shows the same.
export const normLoc = v => { const d = String(v || '').replace(/\D/g, ''); return d ? String(Number(d)) : ''; };
const FLAG_ORDER = { adjust: 0, pull: 1 };
export function bayRows(data, loc) {
  const snap = data?.latest, want = normLoc(loc); if (!snap || !want) return null;
  return snap.rows.filter(r => r.loc === want).map(r => { const ctn = ctnOf(r.kc); return { ...r, ctn, flag: flagOf(r.soh, ctn) }; })
    .sort((a, b) => (FLAG_ORDER[a.flag] ?? 2) - (FLAG_ORDER[b.flag] ?? 2) || a.kc.localeCompare(b.kc));
}
export const flagBadge = f => f === 'adjust' ? `<span class="sri-flag adjust" title="${tx('In a stockroom bay but the system says 0 or less: adjust it')}">ADJUST</span>` : f === 'pull' ? `<span class="sri-flag pull" title="${tx('Under two cartons in the whole store: the floor has most likely run out and the rest is out the back')}">PULL</span>` : '';
export function bayList(rows) {
  return `<div class="list sri-bay">${rows.map(r => `<div class="li"><span class="mono kc">${kcCopy(r.kc)}</span><span class="nm">${nameHtml(r.kc)}<small>${depthChip(r.kc)}</small></span>${bandSoh(r.soh, r.ctn)}${flagBadge(r.flag)}</div>`).join('')}</div>`;
}
function lookupCard(ctx, data) {
  const rows = st.loc ? bayRows(data, st.loc) : null;
  if (rows?.length) ensureNames(ctx, rows.map(r => r.kc), () => ctx.rerender());
  const n = rows ? { adjust: rows.filter(r => r.flag === 'adjust').length, pull: rows.filter(r => r.flag === 'pull').length } : null;
  return `<div class="card"><div class="ch"><h3>${tx('Look up a location')}</h3><span class="cs-dim">${data?.latest ? tx("from {date}'s report", { date: esc(fmtDate(data.latest.date)) }) : tx('no report yet')}</span></div>` +
    `<div class="search">${ic('search')}<input data-field="sri-loc" value="${esc(st.loc)}" placeholder="${tx('Location, e.g. 7002')}" inputmode="numeric"></div>` +
    (!st.loc ? `<p class="lbl">${tx('Everything the report puts in one bay, with its stock on hand, carton size and what to pull or adjust.')}</p>` : !data?.latest ? '' : !rows.length ? `<p class="lbl">${tx('Nothing in location {loc} on the latest report.', { loc: esc(normLoc(st.loc)) })}</p>` :
      `<p class="lbl">${txn(rows.length, '{n} item in {loc}', '{n} items in {loc}', { loc: esc(normLoc(st.loc)) })}${n.pull ? ` · ${tx('<b>{n} to pull</b>', { n: n.pull })}` : ''}${n.adjust ? ` · ${tx('<b>{n} to adjust</b>', { n: n.adjust })}` : ''}</p>${bayList(rows)}`) + '</div>';
}

export const spark = (w, cls) => { if (w.length < 2) return ''; const max = Math.max(...w, 1), W = 78, H = 22; return `<svg class="sri-spark ${cls}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${w.map((v, i) => `${(i / (w.length - 1) * (W - 2) + 1).toFixed(1)},${(H - 2 - Math.max(0, v) / max * (H - 4)).toFixed(1)}`).join(' ')}"/></svg>`; };
export const clsBadge = (cls, flat) => `<span class="sri-cls ${cls}">${cls === 'frozen' ? tx('FROZEN · {n}w', { n: flat }) : tx(BADGE[cls])}</span>`;
export const bandSoh = (soh, ctn) => `<span class="sri-soh ${sohBand(soh, ctn)}">SOH ${soh}</span>`;

const st = { text: '', parsed: null, keep: false, filter: 'all', q: '', busy: false, open: false, loc: '', saved: null };
const FILTERS = ['all', 'stuck', 'ghost', 'frozen', 'deep', 'new', 'moving'];

function pastePanel(ctx, data) {
  const p = st.parsed, items = p ? Object.values(p.items).sort((a, b) => byLoc(a.loc, b.loc) || a.kc.localeCompare(b.kc)) : [], kcs = new Set(items.map(r => r.kc));
  const req = new Set((ctx.store.get('backfill').requested[todayKey()] || []).map(b => String(Number(String(b).replace(/\D/g, '')) || b)));
  const locs = [...new Set(items.map(r => r.loc))].sort(byLoc), unknown = [...kcs].filter(k => nameOf(k) === null).length, pending = [...kcs].filter(k => nameOf(k) === '').length;
  const fl = flagsOf(items, ctnOf), nAdj = new Set(fl.adjust.map(r => r.kc)).size, nPull = new Set(fl.pull.map(r => r.kc)).size, healthy = kcs.size - new Set([...fl.adjust, ...fl.pull].map(r => r.kc)).size;
  const missing = [...req].filter(l => !locs.includes(l));
  const outBack = locs.map(l => { const here = items.filter(r => r.loc === l), z = here.filter(r => profileOf(r.kc)?.ctn && r.soh <= 0); return z.length ? [l, z.length, here.length] : null; }).filter(Boolean);
  const today = todayKey(), replaces = data?.index?.[today], saveOff = (unknown && !st.keep) || pending || st.busy ? ' disabled' : '';
  return `<div class="card sri-paste"><div class="ch"><h3>${tx('Paste the SOH report')}</h3><span class="cs-dim">LOCATION · KEYCODE · APN · DESC · COLOUR · STATUS · PRICE · SOH</span></div>` +
    `<textarea class="sri-ta" data-field="report" placeholder="${tx('Paste the report text here: the whole report, or one more page at a time')}" spellcheck="false">${esc(st.text)}</textarea>` +
    `<div class="sri-acts"><button class="btn primary sm" data-act="sri-read">${ic('check')}${tx('Read it')}</button><button class="btn sm" data-act="sri-screen" title="${tx('Read the report off the SIM screen')}">${ic('expand')}${tx('Screen scan')}</button>${p ? `<button class="btn sm" data-act="sri-clear">${tx('Clear')}</button>` : ''}<span class="cs-dim">${p ? `${tx('{kcs} keycodes in {rows} rows at {locs} locations', { kcs: kcs.size, rows: items.length, locs: locs.length })}${p.skipped ? ` · ${tx('{n} lines skipped', { n: p.skipped })}` : ''}` : tx('Paste more and read again: rows merge by keycode and location, so a page pasted twice changes nothing.')}</span></div>` +
    (p && items.length ? `<div class="sri-sum"><span class="sri-soh r" title="${tx("In a stockroom bay but the system says 0 or less: these go to today's Adjustments")}">${tx('{n} to adjust · 0 or less', { n: nAdj })}</span><span class="sri-soh a" title="${tx('Under two cartons in the whole store: the floor has most likely run out')}">${tx('{n} to pull · under two cartons', { n: nPull })}</span><span class="sri-soh g">${tx('{n} healthy', { n: healthy })}</span>${pending ? `<span class="cs-dim">${tx('checking {n} names…', { n: pending })}</span>` : ''}${unknown ? `<span class="warn">${tx('{n} not in the catalogue', { n: unknown })}</span>` : ''}</div>` + adjustOffer(ctx, items) +
      `<div class="sri-locs">${locs.slice(0, 80).map(l => `<span class="sri-loc">${esc(l)}${req.has(l) ? '<b class="req">REQ</b>' : '<b class="pre">PRE</b>'}</span>`).join('')}${missing.map(l => `<span class="sri-loc miss">${esc(l)}<b>${tx('MISSING')}</b></span>`).join('')}</div>` +
      outBack.slice(0, 6).map(([l, z, n]) => `<p class="lbl">${tx('▤ {loc}: {z} of {n} items here read 0 on hand but the carton profiles show depth: the stock is most likely out the back.', { loc: esc(l), z, n })}</p>`).join('') +
      (unknown ? `<label class="sri-keep"><input type="checkbox" data-field="keep"${st.keep ? ' checked' : ''}> ${txn(unknown, 'Keep the {n} code the catalogue does not know (mistyped by OCR, or new lines)', 'Keep the {n} codes the catalogue does not know (mistyped by OCR, or new lines)')}</label>` : '') +
      (replaces ? `<div class="sri-acts"><button class="btn primary" data-act="sri-save" data-merge="1"${saveOff}>${ic('check')}${txn(locs.length, "Update {n} location in today's snapshot", "Update {n} locations in today's snapshot")}</button><button class="btn" data-act="sri-save"${saveOff}>${tx('Replace the whole day')}</button><span class="cs-dim">${tx('Update keeps the other locations saved earlier today ({n} rows); replace starts the day again', { n: replaces.rows })}</span></div>`
        : `<div class="sri-acts"><button class="btn primary" data-act="sri-save"${saveOff}>${ic('check')}${tx("Save as {date}'s snapshot · {week}", { date: esc(fmtDate(today)), week: isoWeek(today) })}</button></div>`) : '') + '</div>';
}

// The report's items at 0 or less in a stockroom bay go to the day's
// Adjustments: offered as soon as the report is read (one click, whatever
// the catalogue makes of the codes) and added by themselves when it is
// saved. They used to wait for the save and then a second confirm, so a
// report that could not be saved yet never reached Adjustments.
function adjustRows(ctx, items) {
  const adj = ctx.store.get('adjustments')?.[todayKey()] || {}, seen = new Set();
  return flagsOf(items, ctnOf).adjust.filter(r => !adj[r.kc] && !seen.has(r.kc) && seen.add(r.kc));
}
async function sendAdjust(ctx, rows) {
  let n = 0, failed = 0;
  for (const r of rows) {
    try { await ctx.store.dispatch({ type: 'adjustment.set', entity: { keycode: r.kc, date: todayKey() }, payload: { qty: Number(r.soh), location: r.loc, name: nameOf(r.kc) || r.desc || '', ...(Number.isFinite(r.price) ? { price: r.price } : {}), source: 'report' } }); n++; }
    catch { failed++; }
  }
  return { n, failed };
}
function adjustOffer(ctx, items) {
  const all = new Set(flagsOf(items, ctnOf).adjust.map(r => r.kc)).size; if (!all) return '';
  const fresh = adjustRows(ctx, items).length;
  return `<div class="sri-acts sri-adj">${fresh ? `<button class="btn primary sm" data-act="sri-adjust"${st.busy ? ' disabled' : ''}>${ic('m-adjust')}${tx('Send {n} to Adjustments', { n: fresh })}</button><span class="cs-dim">${fresh === all ? tx('or save the snapshot: it adds them too') : tx("{n} already on today's list", { n: all - fresh })}</span>`
    : `<span class="cs-dim">${ic('check')}${tx("All {n} at 0 or less are on today's Adjustments", { n: all })}</span>`}<a class="go" data-go="adjust">${tx('Open Adjustments')}</a></div>`;
}
// After a save: what went to Adjustments.
function sendCard() {
  const sv = st.saved; if (!sv?.sent && !sv?.already) return '';
  return `<div class="card sri-send"><div class="ch"><h3>${ic('m-adjust')}${sv.sent ? txn(sv.sent, "{n} item at 0 or less sent to today's Adjustments", "{n} items at 0 or less sent to today's Adjustments") : tx("Today's Adjustments already hold this report's items at 0 or less")}</h3><span class="go" data-act="sri-send-close">${tx('Dismiss')}</span></div>` +
    `<p class="lbl">${sv.sent + sv.already === 1 ? tx('The report puts it in a stockroom location though the system says the store has none.') : tx('The report puts them in a stockroom location though the system says the store has none.')}${sv.already && sv.sent ? ` ${txn(sv.already, '{n} was on the list already.', '{n} were on the list already.')}` : ''}${sv.failed ? ` ${tx('{n} could not be added.', { n: sv.failed })}` : ''}</p>` +
    `<div class="sri-acts"><a class="btn" data-go="adjust">${ic('m-adjust')}${tx('Open Adjustments')}</a></div></div>`;
}

function classesCard(ctx, data) {
  if (!data) return `<div class="card"><div class="ch"><h3>${tx('Classes')}</h3></div><div class="ohint">${sohError() ? esc(sohError()) : tx('Loading the snapshots…')}</div></div>`;
  if (!data.snaps.length) return `<div class="card"><div class="ch"><h3>${tx('Classes')}</h3></div><p class="lbl">${tx("No snapshot yet. Paste this week's SOH report and save it; the classes need three snapshots to tell flat from moving.")}</p></div>`;
  const rows = Object.values(data.history).map(h => ({ ...h, ...classify(h, profileOf(h.kc)) }));
  const counts = Object.fromEntries(FILTERS.map(f => [f, f === 'all' ? rows.length : rows.filter(r => r.cls === f).length]));
  const q = st.q.trim().toLowerCase();
  const list = rows.filter(r => (st.filter === 'all' || r.cls === st.filter) && (!q || r.kc.includes(q) || (r.locs || [r.loc]).some(l => String(l).includes(q)) || (nameOf(r.kc) || r.name || '').toLowerCase().includes(q)))
    .sort((a, b) => PRIORITY[a.cls] - PRIORITY[b.cls] || b.flat - a.flat || byLoc(a.loc, b.loc));
  const verify = ctx.store.get('soh')?.verify?.[data.latest.date] || {};
  return `<div class="card"><div class="ch"><h3>${tx('Classes')}</h3><span class="cs-dim">${txn(data.snaps.length, '{n} snapshot · {from} to {to}', '{n} snapshots · {from} to {to}', { from: esc(data.snaps[0].date), to: esc(data.latest.date) })}</span></div>` +
    `<div class="sri-filters">${FILTERS.map(f => `<button class="chip${st.filter === f ? ' on' : ''}" data-act="sri-filter" data-f="${f}">${f === 'all' ? tx('All') : f[0].toUpperCase() + f.slice(1)} <b>${counts[f]}</b></button>`).join('')}<div class="search">${ic('search')}<input data-field="sri-q" value="${esc(st.q)}" placeholder="${tx('Keycode, location or name')}"></div></div>` +
    `<div class="mfx-scroll"><table class="wb-t sri-t"><thead><tr><th>${tx('Class')}</th><th>${tx('Keycode')}</th><th>${tx('Product')}</th><th>${tx('Loc')}</th><th>${tx('Last {n}', { n: Math.min(12, data.snaps.length) })}</th><th class="n">SOH</th><th class="n">${tx('/ctn')}</th><th>${tx('Last landed')}</th></tr></thead><tbody>${list.slice(0, 300).map(r => `<tr><td>${clsBadge(r.cls, r.flat)}${r.recount ? '<span class="sri-badge recount">RECOUNT</span>' : ''}${verify[`${r.kc}|${r.loc}`] ? ` <span class="status good">✓ ${tx('verified')}</span>` : ''}</td><td class="mono">${kcCopy(r.kc)}</td><td>${nameHtml(r.kc)}</td><td class="mono">${esc((r.locs || [r.loc]).join(' '))}</td><td>${spark(r.w, r.cls)}</td><td class="n">${bandSoh(r.latest, r.ctn)}</td><td class="n">${r.ctn || '—'}</td><td>${r.lastArrival?.date ? esc(fmtDate(r.lastArrival.date)) : '—'}</td></tr>`).join('') || `<tr><td colspan="8" class="cs-dim">${tx('Nothing in this class.')}</td></tr>`}</tbody></table></div>${list.length > 300 ? `<p class="lbl">${tx('{n} more: search or pick a class to narrow.', { n: list.length - 300 })}</p>` : ''}</div>`;
}

function snapsCard(data) {
  if (!data?.snaps?.length) return '';
  const idx = data.index;
  return `<div class="card"><div class="ch"><h3>${tx('Snapshots')}</h3><span class="cs-dim">${tx('every day for 14 days, then weekly')}</span></div><div class="list">${Object.entries(idx).sort((a, b) => b[0].localeCompare(a[0])).map(([d, x]) => `<div class="li"><span class="loc">${esc(fmtDate(d))}</span><span class="nm">${esc(x.week)} · ${tx('{rows} rows · {locs} locations', { rows: x.rows, locs: x.locs })}</span><button class="btn sm" data-act="sri-remove" data-date="${esc(d)}" title="${tx('Remove a wrong paste')}">${ic('trash')}</button></div>`).join('')}</div></div>`;
}

export default {
  id: 'srintel', title: tx('Stock intelligence'), icon: 'chart', area: 'stockroom',
  deskOnly: true,   // not on the phone: no menu row, no search result; a link goes home
  desktop(ctx) {
    const data = sohData(ctx, () => ctx.rerender()), idx = ctx.store.get('soh')?.snaps || {}, n = Object.keys(idx).length;
    if (st.parsed) ensureNames(ctx, [...new Set(Object.values(st.parsed.items).map(r => r.kc))], () => ctx.rerender());
    if (data?.history && st.filter !== 'all') ensureNames(ctx, Object.values(data.history).filter(h => classify(h, profileOf(h.kc)).cls === st.filter).slice(0, 300).map(h => h.kc), () => ctx.rerender());
    const head = vh(tx('Stock intelligence'), sub(txn(n, '{n} snapshot', '{n} snapshots'), n ? tx('latest {date}', { date: esc(Object.keys(idx).sort().at(-1)) }) : tx('none yet'), 'STUCK · GHOST · FROZEN · DEEP'), `<button class="btn" data-view="daylist">${ic('m-daylist')}${tx('Day list')}</button>`, 'chart');
    return head + `<div class="sri-grid"><div>${sendCard()}${pastePanel(ctx, data)}${classesCard(ctx, data)}</div><div>${lookupCard(ctx, data)}${snapsCard(data)}<div class="card"><div class="ch"><h3>${tx('How the classes work')}</h3></div><ul class="sri-help"><li>${clsBadge('stuck')} ${tx('SOH has not moved for three snapshots although stock arrived: count it.')}</li><li>${clsBadge('ghost')} ${tx('The system says zero but stock arrived: count it.')}</li><li>${clsBadge('frozen', 3)} ${tx('Flat for three or more snapshots with nothing arriving: count it.')}</li><li>${clsBadge('deep')} ${tx('Flat, but two cartons or more on hand: a spot-check.')}</li><li>${clsBadge('new')} ${tx('Under three snapshots: not enough history yet.')}</li><li><span class="sri-badge recount">RECOUNT</span> ${tx('Re-cartoned within the last four trucks: count, do not spot-check.')}</li></ul></div></div></div>`;
  },
  mount(ctx, root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'sri-read') { st.text = root.querySelector('[data-field="report"]')?.value || ''; const r = parseReport(st.text, st.parsed?.items ? { ...st.parsed.items } : {}); if (!Object.keys(r.items).length) return toast(tx('No item rows found: the report needs a keycode, a location and an SOH on each row'), 'bad'); st.parsed = { items: r.items, skipped: (st.parsed?.skipped || 0) + r.skipped }; st.text = ''; ctx.rerender(); }
      else if (act === 'sri-screen') openScreenScan(ctx, { mode: 'rows', onUse: ({ items }) => { const merged = { ...(st.parsed?.items || {}) }; for (const r of Object.values(items)) { const k = rowKey(r); merged[k] = merged[k] ? { ...merged[k], soh: r.soh, price: r.price ?? merged[k].price } : r; } st.parsed = { items: merged, skipped: st.parsed?.skipped || 0 }; const nRows = Object.keys(items).length; toast(txn(nRows, '{n} row read off the screen', '{n} rows read off the screen')); ctx.rerender(); } });
      else if (act === 'sri-clear') { st.parsed = null; st.text = ''; st.keep = false; ctx.rerender(); }
      else if (act === 'sri-filter') { st.filter = a.dataset.f; ctx.rerender(); }
      else if (act === 'sri-save') {
        const items = Object.values(st.parsed?.items || {}); if (!items.length) return;
        st.busy = true; ctx.rerender();
        try {
          const merge = a.dataset.merge === '1', r = await ctx.api(`/v1/store/${ctx.storeNo}/soh`, { method: 'POST', body: { date: todayKey(), ...(merge ? { merge: true } : {}), rows: items.map(x => ({ kc: x.kc, loc: x.loc, soh: x.soh, price: x.price, ...(nameOf(x.kc) ? { name: nameOf(x.kc) } : {}) })) }, timeoutMs: 60000 });
          // Saving the report is the manager's say-so: its items at 0 or less go to today's Adjustments.
          const all = new Set(flagsOf(items, ctnOf).adjust.map(x => x.kc)).size, sent = await sendAdjust(ctx, adjustRows(ctx, items));
          toast(`${r.updatedLocs ? tx('{n} locations updated · today holds {rows} rows', { n: r.updatedLocs, rows: r.rows }) : tx('Snapshot saved · {week} · {rows} rows', { week: r.week, rows: r.rows })}${sent.n ? ` · ${tx('{n} sent to Adjustments', { n: sent.n })}` : ''}`);
          st.saved = { date: r.date, sent: sent.n, already: all - sent.n - sent.failed, failed: sent.failed }; st.parsed = null; st.keep = false;
        }
        catch (err) { toast(err.message, 'bad'); }
        st.busy = false; ctx.rerender();
      }
      else if (act === 'sri-send-close') { st.saved = null; ctx.rerender(); }
      else if (act === 'sri-adjust') {
        const rows = adjustRows(ctx, Object.values(st.parsed?.items || {})); if (!rows.length) return;
        st.busy = true; ctx.rerender();
        const r = await sendAdjust(ctx, rows);
        st.busy = false; ctx.rerender();
        toast(`${tx("{n} sent to today's Adjustments", { n: r.n })}${r.failed ? ` · ${tx('{n} could not be added', { n: r.failed })}` : ''}`, r.failed ? 'bad' : '', { label: tx('Open'), run: () => ctx.go('adjust') });
      }
      else if (act === 'sri-remove') { if (!confirm(tx('Remove the snapshot for {date}? The classes are worked out again without it.', { date: a.dataset.date }))) return; try { await ctx.api(`/v1/store/${ctx.storeNo}/soh/${a.dataset.date}`, { method: 'DELETE' }); toast(tx('Snapshot removed')); } catch (err) { toast(err.message, 'bad'); } }
    });
    root.addEventListener('change', e => { if (e.target.matches('[data-field="keep"]')) { st.keep = e.target.checked; ctx.rerender(); } });
    let typing = null;
    root.addEventListener('input', e => { if (e.target.matches('[data-field="sri-q"]')) { st.q = e.target.value; clearTimeout(typing); typing = setTimeout(() => { const v = st.q; ctx.rerender(); const i = document.querySelector('#content [data-field="sri-q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 180); } else if (e.target.matches('[data-field="report"]')) st.text = e.target.value; else if (e.target.matches('[data-field="sri-loc"]')) { st.loc = e.target.value; clearTimeout(typing); typing = setTimeout(() => { const v = st.loc; ctx.rerender(); const i = document.querySelector('#content [data-field="sri-loc"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 250); } });
    return [ctx.store.on('soh', () => ctx.rerender()), ctx.store.on('adjustments', () => { if (st.saved || st.parsed) ctx.rerender(); })];
  },
};
