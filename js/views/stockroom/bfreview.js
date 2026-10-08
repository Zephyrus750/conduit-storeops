// Backfill review: K2B's review-and-submission desk, on the store's own
// event log. The phones scan bays (submission.update, codes scanned:true);
// the desk pastes the SIM report, compares each bay, marks it Ready
// (writes the system-only codes as scanned:false and sends the bay's report
// list with submission.ready so the worker's metrics match the desk's) and
// Submits it; the lifecycle is pending → corrected → submitted. The pasted
// report is desk-side state under `simreport:<store>:<date>`, as it was in
// K2B; only a readied bay's own list goes to the worker.
//
// Phone: bay → scan → send. Each scan is its own submission.update, so a
// phone that loses wifi mid-bay keeps its scans in the outbox.

import { $, $$, ic, esc, vh, sub, status, fmtTime, ago, toast, mhead, mscan, msteps, mlast, mrows, mbig, mghost, mfoot, camButton } from '../../ui.js';
import { parseReportByLocation, parseKeycodes, parseKeycodeText, parseRequested, reportRange, freshBand, freshLabel, reportGap, pasteDelta, reviewRows, compareCounts, readyPayload, backfillMetrics, scannedCodes } from '../../../shared/backfill.js';
import { hasMap, shelfForLocation } from '../../map.js';
import { barcodeSvg } from '../../../shared/barcode.js';
import { printSheet, code as pcode, tick, table, section, signoff } from '../../print.js';
import { addDays } from '../../../shared/time.js';
import { openScreenScan } from '../../screenscan.js';
import { STATUS, todayKey, ensureNames, nameHtml, nameOf, send, copyText, loadProfiles, depthChip } from './common.js';

// Desk state. report: the pasted SIM report { at, byLoc, range, delta, bayAt }
// (delta: what changed per bay since the previous paste; bayAt: when one
// bay's list was pasted on its own). focus: the one-code-at-a-time view.
const st = { sel: null, sort: 'pct', view: 'list', paste: false, bayPaste: false, reqPaste: false, help: false, report: null, reportFor: null, focusIdx: 0, focusCol: 'all', processed: new Map(), mStep: 1, mBay: '', mLast: null, claimed: null };
const SORTS = { pct: 'Match, best first', loc: 'By location', when: 'Most recent' };
const reportKey = ctx => `simreport:${ctx.storeNo}:${todayKey()}`;

function model(ctx) {
  const bf = ctx.store.get('backfill'), date = todayKey();
  const subs = Object.values(bf.subs).filter(s => s.date === date);
  const requested = (bf.requested[date] || []).filter(b => !subs.some(s => s.bay === b));
  const sys = st.report?.byLoc || null;
  const pending = subs.filter(s => s.status === 'pending').map(s => ({ ...s, c: compareCounts(s, sys ? sys[s.bay] || null : null) }));
  const ready = subs.filter(s => s.status === 'corrected'), submitted = subs.filter(s => s.status === 'submitted');
  pending.sort((a, b) => st.sort === 'loc' ? a.bay.localeCompare(b.bay) : st.sort === 'when' ? String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) : ((b.c.pct ?? -1) - (a.c.pct ?? -1)) || a.bay.localeCompare(b.bay));
  return { date, subs, requested, reqAll: bf.requested[date] || [], pending, ready, submitted, sys, claims: bf.claims, history: Object.values(bf.subs).filter(s => s.date !== date) };
}
const pcol = p => p == null ? 'var(--dim)' : p >= 90 ? '#16A34A' : p >= 70 ? '#CA8A04' : '#DC2626';
const key = s => `${s.bay}:${s.date}`;

export default {
  id: 'bfreview', title: 'Backfill review', icon: 'm-bfreview', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    if (!st.sel || (!m.subs.some(s => key(s) === st.sel) && !m.requested.some(b => 'req:' + b === st.sel))) st.sel = m.pending[0] ? key(m.pending[0]) : m.ready[0] ? key(m.ready[0]) : null;
    const head = vh('Backfill review', sub('Today’s board', `${m.pending.length} to review · ${m.requested.length} requested · ${m.ready.length} ready · ${m.submitted.length} submitted`), `${freshChip()}${st.report?.range ? `<span class="rs-range" title="The bays the pasted report covers">covers <b>${esc(st.report.range.from)}–${esc(st.report.range.to)}</b></span>` : ''}<button class="btn" data-act="paste">${ic('clip')}Paste whole report</button><button class="btn" data-act="req-paste" title="Paste or clear today's requested list">${ic('listcheck')}Requested list</button><button class="ibtn" data-act="help" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>`, 'm-bfreview');
    const reqd = new Set(ctx.store.get('backfill').requested[m.date] || []), band = st.report ? freshBand((Date.now() - st.report.at) / 60000) : 'r';
    // REQ: on today's requested list. PRE: in the pasted report but not
    // requested (banked ahead). The diff mark: the report covers the bay and
    // is not stale, so it opens straight to compare.
    const tags = s => (reqd.has(s.bay) ? '<span class="rq-tag req" title="On today’s requested list">REQ</span>' : m.sys?.[s.bay] ? '<span class="rq-tag pre" title="In the paste but not on today’s plan: banked ahead">PRE</span>' : '') + (s.status === 'pending' && m.sys?.[s.bay] && band !== 'r' ? `<span class="rq-cmp" title="Report loaded for this bay: opens straight to compare">${ic('sort')}</span>` : '');
    const slc = (s, c, extra = '') => `<button class="slc${st.sel === key(s) ? ' sel' : ''}${extra}" data-act="sel" data-sel="${esc(key(s))}"><div class="sl"><div class="tp"><span class="loc">${esc(s.bay)}</span>${tags(s)}${m.claims[s.bay] && m.claims[s.bay].by !== ctx.session.device ? `<span class="lock" title="Being reviewed on another device">${ic('lock')}</span>` : ''}</div><div class="meta"><b title="scanned / expected">${c.scannedCount}/${c.expected}</b> scanned · ${s.updatedAt ? fmtTime(s.updatedAt) : ''}</div></div><div class="sr">${c.pct == null ? `<span class="pc" style="color:var(--dim)">—</span><span class="dc">no report</span>` : `<span class="pc" style="color:${pcol(c.pct)}">${c.pct}%</span><span class="dc">${c.add ? `<b class="a">+${c.add}</b> ` : ''}${c.delete ? `<b class="d">−${c.delete}</b>` : ''}${!c.add && !c.delete ? 'clean' : ''}</span>`}</div></button>`;
    const left = `<div class="srail left"><div class="srail-t">Review<span class="ct amber">${m.pending.length}</span><span class="tb"><select class="sortb" data-act="sort" title="Sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></span></div><div class="srail-list">` +
      m.pending.map(s => slc(s, s.c)).join('') +
      m.requested.map(b => `<button class="slc wait${st.sel === 'req:' + b ? ' sel' : ''}" data-act="sel" data-sel="req:${esc(b)}"><div class="sl"><div class="tp"><span class="loc">${esc(b)}</span></div><div class="meta">requested · not scanned yet${m.sys && !m.sys[b] ? ' · <span class="rq-tag miss" title="On today’s plan but not in this report">MISSING</span>' : ''}</div></div><div class="sr"><span class="pc wait">${ic('clock')}</span></div></button>`).join('') +
      `</div><div class="srail-foot"><div class="req"><b>${m.subs.length}</b> sent through · <b>${m.requested.length}</b> requested</div><div class="addrow"><input class="inp" data-field="addloc" placeholder="Add or request a bay…" inputmode="numeric"><button class="btn sm" data-act="request">Request</button></div></div></div>`;
    const right = `<div class="srail right"><div class="srail-t">Ready<span class="ct green">${m.ready.length}</span></div><div class="srail-list">${m.ready.map(s => slc(s, compareCounts(s, m.sys ? m.sys[s.bay] || null : null))).join('') || '<div class="scol-empty" style="padding:14px"><small>Nothing marked ready yet</small></div>'}</div>` +
      `<div class="srail-sub"><div class="srail-t sub">Submitted today<span class="ct green">${m.submitted.length}</span></div>${m.submitted.map(s => slc(s, compareCounts(s, m.sys ? m.sys[s.bay] || null : null), ' subm')).join('')}</div>${m.ready.length ? `<button class="finall" data-act="finalise">${ic('check')}Finalise all (${m.ready.length})</button>` : ''}</div>`;
    return head + (st.paste ? pasteSheet() : '') + (st.reqPaste ? reqSheet(m) : '') + (st.help ? helpSheet() : '') + `<div class="sr3">${left}<div class="smid">${middle(ctx, m)}</div>${right}</div>`;
  },
  mobile(ctx) {
    if (ctx.arg?.bay && st.mArg !== ctx.arg.bay) { st.mArg = ctx.arg.bay; st.mBay = String(ctx.arg.bay).toUpperCase(); st.mStep = 2; st.mLast = null; }
    return `<div id="bfmob">${mobile(ctx)}</div>`;
  },
  mount(ctx, root) {
    loadReport(ctx).then(changed => { if (changed) ctx.rerender(); });
    const repaint = () => { if (ctx.isMobile) { const h = $('#bfmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    ensureNames(ctx, allCodes(ctx), repaint);
    loadProfiles(ctx, repaint);
    root.addEventListener('click', e => onClick(e, ctx, root, repaint));
    root.addEventListener('input', e => {
      if (e.target.matches('[data-field="baypaste"]')) { const s = model(ctx).subs.find(x => key(x) === st.sel), host = root.querySelector('[data-baylive]'); if (s && host) { ensureNames(ctx, parseKeycodeText(e.target.value).codes, () => { const h = root.querySelector('[data-baylive]'), t = root.querySelector('[data-field="baypaste"]'); if (h && t) h.innerHTML = bayLive(s, t.value); }); host.innerHTML = bayLive(s, e.target.value); } }
      if (e.target.matches('[data-field="reqpaste"]')) { const c = root.querySelector('[data-reqcount]'); if (c) c.textContent = `${parseRequested(e.target.value).length} bays`; }
    });
    const onKey = e => deskKey(e, ctx);
    if (!ctx.isMobile) document.addEventListener('keydown', onKey);
    root.addEventListener('change', e => { if (e.target.matches('[data-act="sort"]')) { st.sort = e.target.value; ctx.rerender(); } });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-field="addloc"]')) { e.preventDefault(); addLocation(ctx, e.target.value, false); e.target.value = ''; }
      if (e.target.matches('[data-field="mbay"]')) { e.preventDefault(); startBay(ctx, e.target.value, repaint); }
      if (e.target.matches('[data-field="mscan"]')) { e.preventDefault(); scanCode(ctx, e.target, repaint); }
      if (e.target.matches('[data-field="mreadd"]')) { e.preventDefault(); readdCode(ctx, e.target, repaint); }
    });
    if (ctx.isMobile) { openBayIfNeeded(ctx); setTimeout(() => { try { root.querySelector('[data-field="mscan"],[data-field="mbay"]')?.focus(); } catch {} }, 50); }
    return [ctx.store.on('backfill', () => { ensureNames(ctx, allCodes(ctx), repaint); repaint(); }), () => document.removeEventListener('keydown', onKey)];
  },
};

// The desk's keys (Vector's fast path, K2B's column keys). Not while typing
// in a field. In Focus with a bay open, the keys work its codes; otherwise
// they move between bays.
async function deskKey(e, ctx) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const m = model(ctx), s = m.subs.find(x => key(x) === st.sel), k = e.key;
  if (k === 'Escape' && (st.help || st.paste || st.bayPaste || st.reqPaste)) { st.help = st.paste = st.bayPaste = st.reqPaste = false; e.preventDefault(); return ctx.rerender(); }
  if (k === '?') { e.preventDefault(); st.help = !st.help; return ctx.rerender(); }
  if (st.paste || st.bayPaste || st.reqPaste) return;
  if (st.view === 'focus' && s) {
    const list = focusList(reviewRows(s, m.sys?.[s.bay] || null)), n = list.length; if (!n) return;
    const r = list[((st.focusIdx % n) + n) % n], done = st.processed.get(key(s)) || new Set();
    if (k === ' ' || k === 'Enter') { e.preventDefault(); done.add(r.code); st.processed.set(key(s), done); if (st.focusIdx < n - 1) st.focusIdx += 1; return ctx.rerender(); }
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault(); if (s.status === 'submitted') return;
      if (!(s.incorrect || []).includes(r.code)) await send(ctx, 'submission.update', { bay: s.bay, date: s.date }, { incorrect: [...(s.incorrect || []), r.code] });
      done.add(r.code); st.processed.set(key(s), done); if (st.focusIdx < n - 1) st.focusIdx += 1; return ctx.rerender();
    }
    if (k === 'ArrowRight') { e.preventDefault(); st.focusIdx += 1; return ctx.rerender(); }
    if (k === 'ArrowLeft') { e.preventDefault(); st.focusIdx -= 1; return ctx.rerender(); }
  }
  if (k === 'f' || k === 'F') { e.preventDefault(); st.view = 'focus'; st.focusIdx = 0; return ctx.rerender(); }
  if (k === 'ArrowDown' || k === 'j' || k === 'ArrowUp' || k === 'k') {
    const order = m.pending.map(key); if (!order.length) return;
    e.preventDefault();
    const i = order.indexOf(st.sel), d = k === 'ArrowDown' || k === 'j' ? 1 : -1;
    await select(ctx, i < 0 ? order[0] : order[(i + d + order.length) % order.length]); return ctx.rerender();
  }
  if (k === 'Enter' && s && s.status === 'pending') { e.preventDefault(); await readyBay(ctx, s, m, true); return ctx.rerender(); }
}

function allCodes(ctx) { const out = []; for (const s of Object.values(ctx.store.get('backfill').subs)) if (s.date === todayKey()) out.push(...Object.keys(s.codes)); if (st.report) for (const l of Object.values(st.report.byLoc)) out.push(...l); return out; }
async function loadReport(ctx) {
  const k = reportKey(ctx); if (st.reportFor === k) return false;
  st.reportFor = k; st.report = (await ctx.storage.get(k)) || null; return true;
}
function pasteSheet() {
  return `<div class="card" style="margin-bottom:14px"><div class="ch"><h3>Paste the whole SIM report</h3><span class="cs-dim">one paste, every bay pre-compared</span><span class="btn sm" style="margin-left:auto" data-act="paste-close">${ic('x')}Close</span></div><textarea class="ad-in" data-field="paste" rows="7" placeholder="Location · keycode · … one line per code, or “Location: 7012” headers. Copy the report from SIM and paste it here."></textarea><div class="acts" style="margin-top:10px"><button class="btn primary" data-act="paste-save">${ic('check')}Use this report</button><span class="cs-dim" id="pasteCount"></span></div></div>`;
}
// One bay's inventory list from SIM (K2B's paste): lines or a glued blob,
// detected live with names, duplicates removed, leftovers called out, and a
// live Re-check verdict against what the phones scanned.
function bayPasteSheet(s) {
  return `<div class="card baypaste"><div class="ch"><h3>Inventory list for ${esc(s.bay)}</h3><span class="cs-dim">paste from SIM: one keycode a line, or the whole block</span><span class="btn sm" style="margin-left:auto" data-act="bay-paste-close">${ic('x')}Close</span></div><textarea class="ad-in mono" data-field="baypaste" rows="5" placeholder="43166022&#10;43199310&#10;…"></textarea><div class="bp-live" data-baylive><span class="cs-dim">Paste the list and the codes show here as they are read.</span></div><div class="acts" style="margin-top:10px"><button class="btn primary" data-act="bay-paste-save">${ic('check')}Compare</button>${st.report?.byLoc?.[s.bay] ? `<button class="btn" data-act="bay-paste-clear">Clear compare</button>` : ''}</div></div>`;
}
function bayLive(s, text) {
  const r = parseKeycodeText(text);
  if (!r.codes.length) return `<span class="cs-dim">${text.trim() ? 'No keycodes found yet.' : 'Paste the list and the codes show here as they are read.'}</span>`;
  const scanned = scannedCodes(s), mm = backfillMetrics(scanned, r.codes, s.incorrect), sc = new Set(scanned), sys = new Set(r.codes);
  const add = scanned.filter(c => !sys.has(c)).length, del = r.codes.filter(c => !sc.has(c)).length;
  const verdict = !scanned.length ? '' : !add && !del ? `<div class="bp-verdict ok">✓ Perfect match: ${mm.match}/${mm.expected}, 100%</div>` : `<div class="bp-verdict">Now ${mm.accuracy}% (${mm.match}/${Math.max(mm.expected, mm.scanned)}). Still ${add} to add, ${del} to remove.</div>`;
  return `<div class="bp-chips"><span class="chip">${r.codes.length} code${r.codes.length === 1 ? '' : 's'}</span>${r.duplicates ? `<span class="chip">${r.duplicates} duplicate${r.duplicates === 1 ? '' : 's'} removed</span>` : ''}${r.mode === 'glued' ? '<span class="chip">read as one block, 8 digits a code</span>' : ''}${r.leftovers.length ? `<span class="chip warn" title="${esc(r.leftovers.join(' '))}">${r.leftovers.length} didn’t fit an 8-digit boundary</span>` : ''}</div>${verdict}` +
    `<div class="bp-rows">${r.codes.map((c, i) => `<div class="bp-row"><span class="n">${i + 1}</span><span class="kc mono">${esc(c)}</span><span class="nm">${nameHtml(c)}</span>${scanned.length ? `<span class="${sc.has(c) ? 'c-green' : 'c-red'}">${sc.has(c) ? '✓ matched' : 'remove from system'}</span>` : ''}</div>`).join('')}</div>`;
}
// Today's requested list in bulk (K2B's editor): bays by any separator.
function reqSheet(m) {
  const cur = (m.reqAll || []).join('\n');
  return `<div class="card reqpaste"><div class="ch"><h3>Today’s requested list</h3><span class="cs-dim">bays to backfill today, by space, comma or line</span><span class="btn sm" style="margin-left:auto" data-act="req-close">${ic('x')}Close</span></div><textarea class="ad-in mono" data-field="reqpaste" rows="5">${esc(cur)}</textarea><div class="cs-dim" data-reqcount>${(m.reqAll || []).length} bays</div><div class="acts" style="margin-top:10px"><button class="btn primary" data-act="req-save">${ic('check')}Save list</button><button class="btn" data-act="req-clear">Clear</button></div></div>`;
}
function helpSheet() {
  const k = (keys, what) => `<div class="hk"><span>${keys.map(x => `<kbd>${x}</kbd>`).join(' ')}</span><span>${what}</span></div>`;
  return `<div class="card helpsheet"><div class="ch"><h3>Keyboard</h3><span class="btn sm" style="margin-left:auto" data-act="help">${ic('x')}Close</span></div><div class="hks">` +
    k(['↓', 'j'], 'next bay to review') + k(['↑', 'k'], 'previous bay') + k(['Enter'], 'mark ready and open the next bay') + k(['F'], 'Focus: one code at a time') +
    k(['Space'], 'Focus: checked, next code') + k(['⌫'], 'Focus: incorrect, next code') + k(['←', '→'], 'Focus: move between codes') + k(['?'], 'this sheet') + k(['Esc'], 'close a sheet') + '</div></div>';
}
function middle(ctx, m) {
  if (!st.sel) return `<div class="scol-empty" style="padding:40px">${ic('m-bfreview')}<b>Nothing on the board yet</b><small>Phones send bays here as they scan. Request a bay on the left to put it on the day list.</small></div>`;
  if (st.sel.startsWith('req:')) {
    const bay = st.sel.slice(4), sys = m.sys?.[bay] || null;
    return `<div class="smid-h"><span class="bigloc">${esc(bay)}</span><span class="bc" title="Bay ${esc(bay)}: scan into the PDT">${barcodeSvg(bay, { module: 1.3, height: 30, text: false })}</span><span class="status req">${ic('clock')}Requested</span>${pin(bay)}<span class="hm"><span><b>${sys ? sys.length : '—'}</b>expected</span><span><b>0</b>scanned</span></span><span class="sp"></span><button class="btn" data-act="cancel-req" data-bay="${esc(bay)}">${ic('x')}Cancel request</button></div>` +
      `<div class="reqgrid"><div class="reqcard">${ic('phone')}<b>Waiting for the floor</b><p>Send someone to <b>${esc(bay)}</b> with a phone: the first scan turns this into a review${sys ? ' and compares it against the pasted report on the spot' : ''}.</p><a class="btn" data-go="daylist">${ic('listcheck')}Day list</a></div>` +
      `<div class="reqlist"><div class="scol-t">${sys ? 'In the report' : 'No report covers this bay'}<span class="ct">${sys ? sys.length : 0}</span></div>${(sys || []).map(c => `<div class="reqrow"><span class="kc">${esc(c)}</span><span class="nm">${nameHtml(c)}</span></div>`).join('')}</div></div>`;
  }
  const s = m.subs.find(x => key(x) === st.sel); if (!s) return '';
  const sys = m.sys ? m.sys[s.bay] || null : null, rows = reviewRows(s, sys), c = compareCounts(s, sys);
  const ro = s.status === 'submitted';
  const stat = STATUS[s.status];
  const head = `<div class="smid-h"><span class="bigloc">${esc(s.bay)}</span>${ro ? '' : `<span class="ico" title="Correct this bay number" data-act="rename">${ic('edit')}</span>`}<span class="bc" title="Bay ${esc(s.bay)}: scan into the PDT">${barcodeSvg(s.bay, { module: 1.3, height: 30, text: false })}</span><span class="status ${stat[1]}">${ro ? ic('check') : ''}${stat[0]}</span>${ro ? `<span class="cs-dim subat">at ${fmtTime(s.submittedDoneAt)}${s.autoSubmitted ? ' · auto' : ''}</span>` : ''}<span class="hm"><span><b>${c.expected}</b>expected</span><span><b>${c.scannedCount}</b>scanned</span><span><b class="c-green">${c.match}</b>match</span><span><b style="color:${pcol(c.pct)}">${c.pct == null ? '—' : c.pct + '%'}</b>accuracy</span><span><b class="${c.incorrect ? 'c-red' : ''}">${c.incorrect}</b>incorrect</span></span><span class="sp"></span>` +
    (ro ? '' : `<button class="btn" data-act="bay-paste" title="Paste this bay's inventory list from SIM">${ic('clip')}${sys ? 'Re-check' : 'Paste list'}</button><button class="btn" data-act="bay-screen" title="Read this bay's list off the SIM screen">${ic('expand')}Screen scan</button>`) + pin(s.bay) +
    (s.status === 'pending' ? `<button class="btn ready" data-act="ready" title="Mark ready: writes these metrics to History and frees the bay (Enter)">${ic('check')}Ready</button>` : s.status === 'corrected' ? `<button class="btn submitb" data-act="submit">${ic('checks')}Submit</button><button class="btn" data-act="reopen">${ic('refresh')}Reopen</button>` : `<button class="btn" data-act="unfinalise" title="Back to Ready: it was not finalised on the PDT after all">${ic('refresh')}Unfinalise</button><button class="btn" data-act="reopen" title="Back into review">Reopen</button>`) +
    `<span class="ico bin" title="Delete this bay" data-act="delete">${ic('trash')}</span></div>`;
  const ctl = `<div class="smid-ctl"><span class="pills"><button class="${st.view === 'list' ? 'on' : ''}" data-act="view" data-v="list">List</button><button class="${st.view === 'detail' ? 'on' : ''}" data-act="view" data-v="detail">Detail</button><button class="${st.view === 'codes' ? 'on' : ''}" data-act="view" data-v="codes" title="Each code to add or remove as a barcode, to scan into the PDT">Barcodes</button><button class="${st.view === 'focus' ? 'on' : ''}" data-act="view" data-v="focus" title="One code at a time, keyboard first (F)">Focus</button></span><button class="btn sm" data-act="print-sheet" title="Print the To add / To remove worksheet">${ic('print')}Worksheet</button><button class="btn sm" data-act="copy-all" title="Copy every code to add or remove, one a line">${ic('file')}Copy all</button><span class="cpill match">${c.match} match</span><span class="cpill add">${c.add + c.scanned} add</span><span class="cpill del">${c.delete} delete</span>${ro ? `<span class="cpill lock">${ic('lock')}read only</span>` : ''}${!sys ? `<span class="cpill lock">${ic('alert')}no report for this bay</span>` : ''}</div>`;
  const crow = r => `<div class="scode${r.incorrect ? ' inc' : ''}${nameOf(r.code) === null ? ' bad' : ''}"><span class="kc" data-act="copy" data-code="${esc(r.code)}" title="Copy">${esc(r.code)}</span><span class="nm">${nameHtml(r.code)}${depthChip(r.code)}${r.incorrect ? ' <span class="inctag">✕ incorrect</span>' : ''}</span>${ro ? '' : `<span class="acts"><span title="Flag for SOH adjustment" data-act="flag" data-code="${esc(r.code)}">${ic('sort')}</span><span title="${r.incorrect ? 'Clear incorrect' : 'Mark incorrect'}" data-act="incorrect" data-code="${esc(r.code)}">${ic('alert')}</span>${r.status !== 'delete' ? `<span title="Remove this code" data-act="remove" data-code="${esc(r.code)}">${ic('x')}</span>` : ''}</span>`}</div>`;
  const adds = rows.filter(r => r.status === 'add' || r.status === 'scanned'), dels = rows.filter(r => r.status === 'delete'), matches = rows.filter(r => r.status === 'match');
  // K2B's scan columns: every code to add or remove as a barcode the reviewer
  // scans straight into the PDT, with its name to check against.
  const bcRow = r => `<div class="bcrow${r.incorrect ? ' inc' : ''}">${barcodeSvg(r.code, { module: 1.6, height: 44 })}<span class="nm">${nameHtml(r.code)}${r.incorrect ? ' <span class="inctag">✕ incorrect</span>' : ''}</span></div>`;
  const codesView = `<div class="scols bcols"><div class="scol"><div class="scol-t add">Add to ${esc(s.bay)}<span class="ct">${adds.length}</span></div>${adds.map(bcRow).join('') || '<div class="scol-empty"><b>Nothing to add</b></div>'}</div><div class="scol"><div class="scol-t del">Delete from system<span class="ct">${dels.length}</span></div>${dels.map(bcRow).join('') || '<div class="scol-empty"><b>Nothing to delete</b></div>'}</div></div>`;
  const body = st.view === 'focus' ? focusView(s, rows) : st.view === 'codes' ? codesView : st.view === 'detail'
    ? `<div class="dlist"><div class="drow dhead"><span>Keycode</span><span></span><span>Verdict</span><span>Product</span><span>Backfilled</span><span>Inventory</span><span></span></div>${rows.map(r => `<div class="drow${r.incorrect ? ' bad' : ''}"><span class="kc">${esc(r.code)}</span><span class="dc-icos">${r.status !== 'delete' ? `<span class="dc-ico" title="Scanned">${ic('barcode')}</span>` : ''}</span><span class="cpill ${r.status === 'delete' ? 'del' : r.status === 'match' ? 'match' : 'add'}">${r.status === 'delete' ? 'Remove' : r.status === 'match' ? 'Match' : 'Add to ' + esc(s.bay)}</span><span class="dc-name">${nameHtml(r.code)}</span><span class="tick2${r.status !== 'delete' ? ' yes' : ''}">${ic(r.status !== 'delete' ? 'check' : 'x')}</span><span class="tick2${r.status !== 'add' && r.status !== 'scanned' ? ' yes' : ''}">${ic(r.status !== 'add' && r.status !== 'scanned' ? 'check' : 'x')}</span>${ro ? '<span></span>' : `<span class="dc-edit"><span title="Flag for SOH adjustment" data-act="flag" data-code="${esc(r.code)}">${ic('sort')}</span><span title="Mark incorrect" data-act="incorrect" data-code="${esc(r.code)}">${ic('alert')}</span>${r.status !== 'delete' ? `<span title="Remove" data-act="remove" data-code="${esc(r.code)}">${ic('x')}</span>` : ''}</span>`}</div>`).join('')}</div>`
    : `<div class="scols"><div class="scol"><div class="scol-t add">Add to ${esc(s.bay)}<span class="ct">${adds.length}</span></div>${adds.map(crow).join('') || `<div class="scol-empty">${ic('check')}<b>Nothing to add</b><small>${sys ? 'Everything scanned is in the system' : 'Paste the report to compare'}</small></div>`}</div><div class="scol"><div class="scol-t del">Delete from system<span class="ct">${dels.length}</span></div>${dels.map(crow).join('') || `<div class="scol-empty">${ic('check')}<b>Nothing to delete</b><small>${sys ? 'Every system code was scanned' : 'Paste the report to compare'}</small></div>`}</div></div>`;
  const hist = m.history.filter(h => h.bay === s.bay && h.metrics).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const tail = `<div class="matches"><b>${matches.length} codes match</b> ${sys ? 'the pasted report and need nothing' : '· no report pasted for this bay yet'}${s.readyAt ? ` · marked ready ${fmtTime(s.readyAt)}` : ''}</div>` +
    (Object.keys(s.readd || {}).length ? `<div class="lochist readd"><span class="lh-t">Re-add · found after finalising</span>${Object.entries(s.readd).map(([c, r]) => `<span><b class="mono">${esc(c)}</b> ${r.doneAt ? `scanned back ${fmtTime(r.doneAt)}` : 'to scan back in'}${r.by ? ` · ${esc(r.by)}` : ''}</span>`).join('')}</div>` : '') +
    (hist.length ? `<div class="lochist"><span class="lh-t">${esc(s.bay)} before today</span>${hist.map(h => `<span><b>${esc(h.date)}</b> ${h.metrics.scanned}/${h.metrics.expected} · ${h.metrics.accuracy}%</span>`).join('')}<a data-go="srhistory">Open in History</a></div>` : '');
  return head + ctl + gapNote(s, sys) + (st.bayPaste ? bayPasteSheet(s) : '') + body + tail;
}

const pin = bay => hasMap() ? `<button class="ibtn" data-act="mappin" data-bay="${esc(bay)}" title="Show ${esc(bay)} on the map">${ic('pin')}</button>` : '';
function freshChip() {
  if (!st.report) return `<span class="rs-gap">${ic('alert')}No report pasted</span>`;
  const mins = (Date.now() - st.report.at) / 60000;
  return `<span class="rs-fresh ${freshBand(mins)}" title="SIM report pasted ${fmtTime(new Date(st.report.at).toISOString())} · ${Object.keys(st.report.byLoc).length} bays · re-paste if the room has moved since"><span class="dot"></span>report ${freshLabel(mins)}</span>`;
}
// The gap note (Vector's): the report against this bay's scans. Scanned 3+
// minutes after the report, or a report 30+ minutes old: re-paste. And what
// the last re-paste changed for this bay.
function gapNote(s, sys) {
  if (!sys || !st.report) return '';
  const at = st.report.bayAt?.[s.bay] || st.report.at, g = reportGap(at, s.updatedAt), rel = m => m < 1 ? 'under a minute' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  const d = st.report.delta?.[s.bay];
  let msg = `Report ${st.report.bayAt?.[s.bay] ? 'list for this bay' : 'uploaded'} ${fmtTime(new Date(at).toISOString())} (${rel(g.ageMin)} ago)${s.updatedAt ? ` · ${esc(s.bay)} scanned ${fmtTime(s.updatedAt)}` : ''}`;
  if (g.afterBy >= 1) msg += ` · scanned ${rel(g.afterBy)} after the report${g.warn ? '. Stock received since then won’t be in it: re-paste to be sure.' : ''}`;
  else if (g.ageMin >= 30) msg += ' · the report has aged; re-paste if stock has moved.';
  return `<div class="gapnote${g.warn ? ' warn' : ''}">${ic('clock')}<span>${msg}${d ? ` <b class="gap-delta" title="${esc([...d.added.map(c => '+' + c), ...d.removed.map(c => '−' + c)].join(' '))}">Since the last paste: ${d.added.length ? `+${d.added.length} new` : ''}${d.added.length && d.removed.length ? ', ' : ''}${d.removed.length ? `−${d.removed.length} gone` : ''}</b>` : ''}</span>${g.warn ? `<button class="btn sm" data-act="paste">${ic('clip')}Re-paste report</button>` : ''}</div>`;
}
// Focus (Vector's desk fast path): one code at a time with a big barcode for
// the PDT. Space or Enter: checked and next. Backspace: incorrect and next.
// ← →: move (wraps). A column switch narrows it to what to add or delete.
function focusList(rows) { return st.focusCol === 'add' ? rows.filter(r => r.status === 'add' || r.status === 'scanned') : st.focusCol === 'delete' ? rows.filter(r => r.status === 'delete') : rows; }
function focusView(s, rows) {
  const list = focusList(rows), n = list.length, done = st.processed.get(key(s)) || new Set();
  const cols = rows.some(r => r.status === 'delete' || r.status === 'add') ? `<span class="pills fcols">${[['all', 'All'], ['add', 'Add'], ['delete', 'Delete']].map(([k, l]) => `<button class="${st.focusCol === k ? 'on' : ''}" data-act="focus-col" data-v="${k}">${l}</button>`).join('')}</span>` : '';
  if (!n) return `<div class="focus-card empty">${cols}<b>Nothing in this column</b></div>`;
  st.focusIdx = ((st.focusIdx % n) + n) % n;
  const r = list[st.focusIdx];
  const verdict = r.status === 'add' || r.status === 'scanned' ? `<div class="fverdict add">Add to ${esc(s.bay)}</div>` : r.status === 'delete' ? '<div class="fverdict del">Delete from system</div>' : '';
  return `<div class="focus-card${r.incorrect ? ' bad' : ''}${done.has(r.code) ? ' done' : ''}">${cols}<div class="fcount"><b>${st.focusIdx + 1} / ${n}</b><span>${[...done].filter(c => list.some(x => x.code === c)).length} checked</span></div>` +
    (/^\d{6,13}$/.test(r.code) ? `<div class="fbar">${barcodeSvg(r.code, { module: 2.6, height: 74 })}</div>` : '') +
    `<div class="fcode mono" data-act="copy" data-code="${esc(r.code)}" title="Copy">${esc(r.code)}</div><div class="fname">${nameHtml(r.code)}${depthChip(r.code)}</div>${verdict}` +
    `<div class="fhint"><kbd>Space</kbd> checked + next · <kbd>⌫</kbd> incorrect + next · <kbd>←</kbd><kbd>→</kbd> move</div></div>`;
}

async function onClick(e, ctx, root, repaint) {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, m = model(ctx), date = todayKey();
  const cur = () => m.subs.find(x => key(x) === st.sel);
  if (act === 'sel') { await select(ctx, a.dataset.sel); ctx.rerender(); }
  else if (act === 'view') { st.view = a.dataset.v; ctx.rerender(); }
  else if (act === 'paste') { st.paste = true; ctx.rerender(); setTimeout(() => root.querySelector('[data-field="paste"]')?.focus(), 30); }
  else if (act === 'paste-close') { st.paste = false; ctx.rerender(); }
  else if (act === 'paste-save') {
    const text = root.querySelector('[data-field="paste"]')?.value || '';
    const byLoc = parseReportByLocation(text); const n = Object.keys(byLoc).length;
    if (!n) return toast('No location lines found. Each line needs a bay number and a keycode.', 'bad');
    const prev = st.report?.byLoc || {};
    st.report = { at: Date.now(), byLoc: { ...prev, ...byLoc }, range: reportRange(text, byLoc), delta: pasteDelta(prev, byLoc), bayAt: {} }; await ctx.storage.set(reportKey(ctx), st.report);
    st.paste = false; toast(`Report pasted: ${n} bays, ${Object.values(byLoc).reduce((x, l) => x + l.length, 0)} codes`); ensureNames(ctx, allCodes(ctx), repaint); ctx.rerender();
  }
  else if (act === 'bay-paste') { st.bayPaste = true; ctx.rerender(); setTimeout(() => root.querySelector('[data-field="baypaste"]')?.focus(), 30); }
  else if (act === 'bay-paste-close') { st.bayPaste = false; ctx.rerender(); }
  else if (act === 'bay-screen') {
    const s = cur(); if (!s) return;
    openScreenScan(ctx, { mode: 'compare', expected: s.bay, onUse: ({ codes }) => {
      st.bayPaste = true; ctx.rerender();
      setTimeout(() => { const t = document.querySelector('#content [data-field="baypaste"]'); if (!t) return; t.value = codes.join('\n'); t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#content [data-act="bay-paste-save"]')?.click(); }, 40);
    } });
  }
  else if (act === 'bay-paste-save' || act === 'bay-paste-clear') {
    const s = cur(); if (!s) return;
    const byLoc = { ...(st.report?.byLoc || {}) }, bayAt = { ...(st.report?.bayAt || {}) };
    if (act === 'bay-paste-clear') { delete byLoc[s.bay]; delete bayAt[s.bay]; }
    else { const r = parseKeycodeText(root.querySelector('[data-field="baypaste"]')?.value || ''); if (!r.codes.length) return toast('No keycodes found in that paste.', 'bad'); byLoc[s.bay] = r.codes; bayAt[s.bay] = Date.now(); }
    st.report = { ...(st.report || { at: Date.now(), range: null, delta: {} }), byLoc, bayAt }; await ctx.storage.set(reportKey(ctx), st.report);
    st.bayPaste = false; toast(act === 'bay-paste-clear' ? `${s.bay}: compare cleared` : `${s.bay}: ${byLoc[s.bay].length} codes to compare`); ctx.rerender();
  }
  else if (act === 'req-paste') { st.reqPaste = !st.reqPaste; ctx.rerender(); }
  else if (act === 'req-close') { st.reqPaste = false; ctx.rerender(); }
  else if (act === 'req-save' || act === 'req-clear') {
    if (act === 'req-clear' && !confirm('Clear today’s requested list?')) return;
    const want = act === 'req-clear' ? [] : parseRequested(root.querySelector('[data-field="reqpaste"]')?.value || ''), have = m.reqAll;
    for (const b of want) if (!have.includes(b)) await send(ctx, 'submission.request', { bay: b, date });
    for (const b of have) if (!want.includes(b)) await send(ctx, 'submission.request', { bay: b, date }, { remove: true });
    st.reqPaste = false; toast(act === 'req-clear' ? 'Requested list cleared' : `Requested list: ${want.length} bays`); ctx.rerender();
  }
  else if (act === 'help') { st.help = !st.help; ctx.rerender(); }
  else if (act === 'focus-col') { st.focusCol = a.dataset.v; st.focusIdx = 0; ctx.rerender(); }
  else if (act === 'copy') copyText(a.dataset.code, a.dataset.code);
  else if (act === 'copy-all') { const s = cur(); if (!s) return; const rows = reviewRows(s, m.sys?.[s.bay] || null).filter(r => r.status !== 'match'); copyText(rows.map(r => r.code).join('\n'), `${rows.length} keycodes`); }
  else if (act === 'mappin') { const shelf = shelfForLocation(a.dataset.bay); if (shelf) ctx.go('map', { select: shelf }); else toast(`${a.dataset.bay} is not on the published map`, 'bad'); }
  else if (act === 'unfinalise') { const s = cur(); if (s) { await send(ctx, 'submission.ready', { bay: s.bay, date: s.date }); toast(`${s.bay} moved back to Ready`); } }
  else if (act === 'request') { const inp = root.querySelector('[data-field="addloc"]'); await addLocation(ctx, inp.value, true); inp.value = ''; }
  else if (act === 'cancel-req') { await send(ctx, 'submission.request', { bay: a.dataset.bay, date }, { remove: true }); st.sel = null; }
  else if (act === 'print-sheet') { const s = cur(); if (s) printWorksheet(s, m.sys?.[s.bay] || null); }
  else if (act === 'ready') { const s = cur(); if (s) await readyBay(ctx, s, m, false); }
  else if (act === 'submit') { const s = cur(); if (s) await send(ctx, 'submission.submit', { bay: s.bay, date }); }
  else if (act === 'reopen') { const s = cur(); if (s) await send(ctx, 'submission.reopen', { bay: s.bay, date }); }
  else if (act === 'finalise') { for (const s of m.ready) await send(ctx, 'submission.submit', { bay: s.bay, date }); toast(`${m.ready.length} bays submitted`); }
  else if (act === 'delete') { const s = cur(); if (s && confirm(`Delete ${s.bay} from today’s board? Its scans are removed from the review.`)) { await send(ctx, 'submission.delete', { bay: s.bay, date }); st.sel = null; } }
  else if (act === 'rename') { const s = cur(); if (!s) return; const to = prompt(`Correct the bay number for ${s.bay}`, s.bay); if (to && to.trim().toUpperCase() !== s.bay) { const r = await send(ctx, 'submission.rename', { bay: s.bay, date }, { newBay: to.trim() }); if (r) st.sel = `${to.trim().toUpperCase()}:${date}`; } }
  else if (act === 'incorrect') { const s = cur(); if (!s) return; const set = new Set(s.incorrect); set.has(a.dataset.code) ? set.delete(a.dataset.code) : set.add(a.dataset.code); await send(ctx, 'submission.update', { bay: s.bay, date }, { incorrect: [...set] }); }
  else if (act === 'remove') { const s = cur(); if (s) await send(ctx, 'submission.update', { bay: s.bay, date }, { remove: [a.dataset.code] }); }
  else if (act === 'flag') { const s = cur(); if (!s) return; const kc = a.dataset.code; const r = await send(ctx, 'adjustment.set', { keycode: kc, date }, { qty: 0, location: s.bay, confirmed: true, name: nameOf(kc) || '' }); if (r) toast(`${kc} flagged for Adjustments · ${s.bay}`); }
  // phone
  else if (act === 'm-start') { await startBay(ctx, root.querySelector('[data-field="mbay"]')?.value || a.dataset.bay || '', repaint); }
  else if (act === 'm-resume') { st.mBay = a.dataset.bay; st.mStep = 2; repaint(); focusScan(root); }
  else if (act === 'm-send') { mineAdd(st.mBay, date); st.mStep = 3; repaint(); }
  else if (act === 'm-mine') { st.mView = 'mine'; repaint(); }
  else if (act === 'm-home') { st.mView = null; st.mStep = 1; repaint(); }
  else if (act === 'm-check') { st.mView = 'check'; repaint(); }
  else if (act === 'm-remind-close') { st.mRemind = false; repaint(); }
  else if (act === 'm-dismiss') { if (!confirm(`Clear ${a.dataset.bay} from your list? It was removed from the board at the desk.`)) return; mineSave(mineLocal().filter(x => !(x.bay === a.dataset.bay && x.date === a.dataset.date))); repaint(); }
  else if (act === 'm-done') {
    const bay = a.dataset.bay, d = a.dataset.date; if (!confirm(`Mark "${bay}" as submitted on the PDT?`)) return;
    const r = await send(ctx, 'submission.submit', { bay, date: d }); if (!r) return;
    st.mRemind = false; toast(`${bay} completed`);
    const n = readdOpen(ctx.store.get('backfill').subs[`${bay}:${d}`]).length;
    if (n) { toast(`${n} item${n === 1 ? '' : 's'} to scan back in`); st.mView = 'check'; }
    repaint();
  }
  else if (act === 'm-readd') { st.readd = { bay: a.dataset.bay, date: a.dataset.date }; st.mView = 'readd'; repaint(); setTimeout(() => root.querySelector('[data-field="mreadd"]')?.focus(), 30); }
  else if (act === 'm-readd-done') { const r = await send(ctx, 'submission.readd', { bay: a.dataset.bay, date: a.dataset.date }, { code: a.dataset.code, done: true }); if (r) { toast(`${a.dataset.code} scanned back in`); repaint(); } }
  else if (act === 'm-undo') { if (st.mLast) { await send(ctx, 'submission.update', { bay: st.mBay, date }, { remove: [st.mLast] }); st.mLast = null; repaint(); } }
  else if (act === 'm-next') { st.mStep = 1; st.mBay = ''; st.mLast = null; repaint(); setTimeout(() => root.querySelector('[data-field="mbay"]')?.focus(), 30); }
  else if (act === 'm-scan-btn') { const inp = root.querySelector('[data-field="mscan"]'); if (inp) await scanCode(ctx, inp, repaint); }
}
// Mark a bay ready (writes the system-only codes and the report list so the
// metrics match), free it, and with next open the bay that slides into its
// place on the review list (Vector's Enter = ready and next).
async function readyBay(ctx, s, m, next) {
  const date = todayKey(), sys = m.sys?.[s.bay] || null, p = readyPayload(s, sys), order = m.pending.map(key), idx = order.indexOf(key(s));
  if (Object.keys(p.codes).length || p.incorrect.length) await send(ctx, 'submission.update', { bay: s.bay, date }, p);
  const r = await send(ctx, 'submission.ready', { bay: s.bay, date }, sys ? { system: sys } : {}); if (!r) return;
  await send(ctx, 'submission.claim', { bay: s.bay, date }, { release: true }); st.claimed = null;
  toast(`${s.bay} marked ready: history recorded`);
  const rest = order.filter(k => k !== key(s));
  st.sel = null;
  if (next && rest.length) await select(ctx, rest[Math.min(idx, rest.length - 1)]);
}
async function select(ctx, sel) {
  const date = todayKey();
  if (st.claimed && st.claimed !== sel) { await send(ctx, 'submission.claim', { bay: st.claimed.split(':')[0], date }, { release: true }); st.claimed = null; }
  if (st.sel !== sel) { st.focusIdx = 0; st.bayPaste = false; }
  st.sel = sel;
  const s = model(ctx).subs.find(x => key(x) === sel);
  if (s && s.status === 'pending') { try { await ctx.store.dispatch({ type: 'submission.claim', entity: { bay: s.bay, date }, payload: {} }); st.claimed = sel; } catch (e) { if (e.code === 'claimed') toast('That bay is open on another device'); } }
}
async function addLocation(ctx, raw, request) {
  const bay = String(raw || '').trim().toUpperCase(); if (!bay) return;
  if (request) { await send(ctx, 'submission.request', { bay, date: todayKey() }); toast(`${bay} requested`); }
  else { await send(ctx, 'submission.open', { bay, date: todayKey() }); st.sel = `${bay}:${todayKey()}`; }
}

// ── phone: bay → scan → send ──────────────────────────────────────────
// My locations (K2B's finalise loop): the bays this phone scanned in the
// last two days (the bay records each scanning device; a local list keeps
// the ones since removed at the desk so the phone can say so), each with
// its desk status. Ready: finalise it on the PDT and tap Submit.
const MINE_KEY = 'my_bays';
function mineLocal() { try { return JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch { return []; } }
function mineSave(list) { try { localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(-200))); } catch {} }
function mineAdd(bay, date) { const l = mineLocal(); if (!l.some(x => x.bay === bay && x.date === date)) { l.push({ bay, date }); mineSave(l); } }
function myLocations(ctx) {
  const since = addDays(todayKey(), -2), subs = ctx.store.get('backfill').subs, dev = ctx.session.device;
  const seen = new Map();
  for (const x of Object.values(subs)) if (x.date >= since && (x.devices || []).includes(dev)) seen.set(`${x.bay}:${x.date}`, { bay: x.bay, date: x.date, sub: x });
  for (const x of mineLocal()) if (x.date >= since && !seen.has(`${x.bay}:${x.date}`)) seen.set(`${x.bay}:${x.date}`, { bay: x.bay, date: x.date, sub: subs[`${x.bay}:${x.date}`] || null });
  const rows = [...seen.values()].map(x => ({ ...x, state: !x.sub ? 'gone' : x.sub.status === 'submitted' ? 'done' : x.sub.status === 'corrected' ? 'ready' : 'pending' }));
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.bay.localeCompare(b.bay, 'en', { numeric: true }));
}
// Re-add items waiting on a bay: scan back now once it is finalised.
const readdOpen = sub => Object.entries(sub?.readd || {}).filter(([, r]) => !r.doneAt).map(([code, r]) => ({ code, ...r }));
function mineView(ctx) {
  const rows = myLocations(ctx), open = rows.filter(r => r.state !== 'done'), done = rows.filter(r => r.state === 'done');
  const chip = r => r.state === 'ready' ? `<span class="btn sm primary" data-act="m-done" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">Submit</span>` : r.state === 'gone' ? `<span class="btn sm" data-act="m-dismiss" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">Removed · clear</span>` : '<span class="status warn">Review</span>';
  const line = r => [esc(r.bay) + (r.date !== todayKey() ? ` <small class="cs-dim">${esc(r.date.slice(5))}</small>` : ''), r.state === 'ready' ? 'Reviewed: finalise it on the PDT, then tap Submit' : r.state === 'gone' ? 'Removed from the board at the desk' : r.state === 'done' ? `Submitted ✓${readdOpen(r.sub).length ? ` · ${readdOpen(r.sub).length} to scan back` : ''}` : 'With the desk for review', r.state === 'done' ? `<span class="btn sm" data-act="m-readd" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">Re-add</span>` : chip(r), r.state === 'ready' ? 'hot' : r.state === 'gone' ? 'warn' : ''];
  const items = rows.reduce((n, r) => n + readdOpen(r.sub).length, 0);
  return mhead('My locations', `${rows.length} bay${rows.length === 1 ? '' : 's'} from this phone · last 2 days`) +
    (open.length ? mrows(open.map(line)) : `<div class="mv-note">${ic('layers')}No locations submitted yet. Scan a location's codes and send it to review.</div>`) +
    (items ? `<div class="mv-tiles">${`<button class="mv-tile hot" data-act="m-check"><span class="ti">${ic('barcode')}</span><span class="tx"><b>Re-add checklist</b><span>${items} item${items === 1 ? '' : 's'} to scan back in</span></span><span></span>${ic('chev')}</button>`}</div>` : '') +
    (done.length ? `<details class="mv-done-list"><summary>Completed · ${done.length}</summary>${mrows(done.map(line))}</details>` : '') +
    mfoot(mghost('Back to scanning', ' data-act="m-home"'));
}
// Re-add: tag items found after the bay was finalised; the checklist shows
// each one as a barcode to scan back in on the PDT once the bay is done.
function readdView(ctx) {
  const sub = ctx.store.get('backfill').subs[`${st.readd.bay}:${st.readd.date}`], list = readdOpen(sub);
  return mhead(`Re-add · ${esc(st.readd.bay)}`, 'Stock found after this bay was finalised') +
    `<div class="mv-scan typed"><div class="cap">Scan each item you found</div><div class="mv-field"><input data-field="mreadd" inputmode="numeric" autocomplete="off" placeholder="Keycode or item barcode" enterkeyhint="done">${camButton('mreadd')}</div><div class="hint">Tagging new items to <b>${esc(st.readd.bay)}</b>. The item stays on the shelf.</div></div>` +
    (list.length ? `<div class="mv-sub">Tagged · ${list.length}</div>` + mrows(list.map(x => [esc(x.code), nameHtml(x.code), '', ''])) : '') +
    mfoot(mbig(`Scan back ${list.length || ''}`.trim(), '', 'barcode', ' data-act="m-check"') + mghost('Done', ' data-act="m-mine"'));
}
function checkView(ctx) {
  const rows = myLocations(ctx).filter(r => readdOpen(r.sub).length), ready = rows.filter(r => r.state === 'done'), wait = rows.filter(r => r.state !== 'done');
  const item = (r, live) => readdOpen(r.sub).map(x => `<div class="rd-item">${live ? barcodeSvg(x.code, { module: 1.8, height: 52 }) : ''}<span class="nm"><b class="mono">${esc(x.code)}</b> ${nameHtml(x.code)}</span>${live ? `<button class="btn sm primary" data-act="m-readd-done" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}" data-code="${esc(x.code)}">✓ Scanned back in</button>` : ''}</div>`).join('');
  return mhead('Re-add checklist', 'Scan each one back in on the PDT') +
    (ready.map(r => `<div class="rd-group"><div class="rd-h ok">${esc(r.bay)} · FINALISED · scan back now</div>${item(r, true)}</div>`).join('') +
     wait.map(r => `<div class="rd-group"><div class="rd-h">${esc(r.bay)} · WAITING · not finalised yet</div>${item(r, false)}</div>`).join('') || `<div class="mv-note">${ic('check')}Nothing waiting to scan back in.</div>`) +
    mfoot(mghost('My locations', ' data-act="m-mine"'));
}
// The finalise reminder: once a session, when a bay this phone sent is ready.
function finaliseReminder(ctx) {
  // Shown once a session: it stays up through repaints until "Got it".
  const ready = myLocations(ctx).filter(r => r.state === 'ready'); if (!ready.length) return '';
  if (st.mRemind !== true) { try { if (sessionStorage.getItem('finalise_reminder_shown')) return ''; sessionStorage.setItem('finalise_reminder_shown', '1'); } catch {} st.mRemind = true; }
  return `<div class="mv-remind" role="dialog" aria-label="Ready to finalise"><b>Ready to finalise</b><span>These locations you submitted have been reviewed and are ready to finalise on the PDT.</span>${mrows(ready.map(r => [esc(r.bay), esc(r.date === todayKey() ? 'today' : r.date), `<span class="btn sm primary" data-act="m-done" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">Submit</span>`, 'hot']))}<button class="btn" data-act="m-remind-close">Got it</button></div>`;
}
function mobile(ctx) {
  const m = model(ctx), date = todayKey();
  if (st.mView === 'mine') return mineView(ctx);
  if (st.mView === 'readd' && st.readd) return readdView(ctx);
  if (st.mView === 'check') return checkView(ctx);
  if (st.mStep === 2 && st.mBay) {
    const s = m.subs.find(x => x.bay === st.mBay), codes = s ? Object.entries(s.codes).filter(([, c]) => c.scanned).map(([c]) => c) : [];
    const recent = codes.slice(-4).reverse();
    return mhead(esc(st.mBay), 'scanning', `<span class="mv-cnt">${codes.length}<small>codes</small></span>`) + msteps(2, ['Bay', 'Scan', 'Send']) +
      `<div class="mv-scan typed"><div class="cap">Scan each product on the shelf</div><div class="mv-field"><input data-field="mscan" inputmode="numeric" autocomplete="off" placeholder="Keycode or item barcode" enterkeyhint="done">${camButton('mscan')}</div><div class="tools"><button data-act="m-scan-btn">${ic('barcode')}Add</button></div></div>` +
      (st.mLast ? mlast(esc(st.mLast), nameHtml(st.mLast), 'just now') : '') +
      (recent.length ? `<div class="mv-sub">Recent</div>` + mrows(recent.map(c => [esc(c), nameHtml(c), '', nameOf(c) === null ? 'bad' : ''])) : '') +
      mfoot(mbig(`Send ${esc(st.mBay)} to review`, 'ok', 'listcheck', ' data-act="m-send"') + (st.mLast ? mghost('Undo last scan', ' data-act="m-undo"') : ''));
  }
  if (st.mStep === 3 && st.mBay) {
    const s = m.subs.find(x => x.bay === st.mBay), n = s ? Object.values(s.codes).filter(c => c.scanned).length : 0;
    const next = m.requested.slice(0, 3);
    return mhead('Sent', `${esc(st.mBay)} · ${n} codes · ${fmtTime(new Date().toISOString())}`) + msteps(3, ['Bay', 'Scan', 'Send']) +
      `<div class="mv-done"><span class="ck">${ic('check')}</span><b>${esc(st.mBay)} is with review</b><span>${n} codes. The desk compares it against the report; the sheet is free for the floor.</span></div>` +
      (next.length ? `<div class="mv-sub">Next</div>` + mrows(next.map(b => [esc(b), 'Requested by the desk', `<span class="btn sm" data-act="m-resume" data-bay="${esc(b)}">Start</span>`, ''])) : '') +
      mfoot(mbig('Scan the next bay', '', 'barcode', ' data-act="m-next"') + mghost('Back to home', ' data-go="mhome"'));
  }
  const board = [...m.pending.map(s => [esc(s.bay), `${s.c.scannedCount} codes · in progress`, `<span class="btn sm" data-act="m-resume" data-bay="${esc(s.bay)}">Resume</span>`, 'warn']), ...m.requested.map(b => [esc(b), 'Requested · not started', `<span class="btn sm" data-act="m-resume" data-bay="${esc(b)}">Start</span>`, ''])];
  const mine = myLocations(ctx), readyN = mine.filter(r => r.state === 'ready').length;
  return (st.mRemind === false ? '' : finaliseReminder(ctx)) + mhead('Backfill scan', 'Scan the bay label to start', `<button class="mv-cnt mine" data-act="m-mine" title="My locations">${ic('listcheck')}${readyN ? `<b>${readyN}</b>` : ''}</button>`) + msteps(1, ['Bay', 'Scan', 'Send']) +
    `<div class="mv-scan typed"><div class="cap">Scan the location barcode</div><div class="mv-field"><input data-field="mbay" inputmode="numeric" autocomplete="off" placeholder="Bay label or number" enterkeyhint="go">${camButton('mbay')}</div><div class="tools"><button data-act="m-start">${ic('arrow')}Start</button></div></div>` +
    (board.length ? `<div class="mv-sub">On the board</div>` + mrows(board) : `<div class="mv-note">${ic('layers')}Nothing on the board yet. Scan a bay to start it.</div>`);
}
export async function openBayIfNeeded(ctx) { if (st.mStep === 2 && st.mBay && !ctx.store.get('backfill').subs[`${st.mBay}:${todayKey()}`]) await send(ctx, 'submission.open', { bay: st.mBay, date: todayKey() }); }
async function startBay(ctx, raw, repaint) {
  const bay = String(raw || '').trim().toUpperCase(); if (!bay) return;
  const r = await send(ctx, 'submission.open', { bay, date: todayKey() }); if (!r) return;
  st.mBay = bay; st.mStep = 2; st.mLast = null; repaint();
  setTimeout(() => document.querySelector('[data-field="mscan"]')?.focus(), 30);
}
async function scanCode(ctx, input, repaint) {
  const codes = parseKeycodes(input.value); input.value = '';
  if (!codes.length) return toast('That is not a keycode', 'bad');
  const kc = codes[0];
  const r = await send(ctx, 'submission.update', { bay: st.mBay, date: todayKey() }, { codes: { [kc]: true } });
  if (r) { st.mLast = kc; ensureNames(ctx, [kc], repaint); repaint(); }
  setTimeout(() => document.querySelector('[data-field="mscan"]')?.focus(), 30);
}
async function readdCode(ctx, input, repaint) {
  const kc = parseKeycodes(input.value)[0]; input.value = '';
  if (!kc) return toast('That is not a keycode', 'bad');
  const r = await send(ctx, 'submission.readd', st.readd, { code: kc });
  if (r) { toast(`${kc} tagged to ${st.readd.bay}`); ensureNames(ctx, [kc], repaint); repaint(); }
  setTimeout(() => document.querySelector('[data-field="mreadd"]')?.focus(), 30);
}
function focusScan(root) { setTimeout(() => root.querySelector('[data-field="mscan"]')?.focus(), 30); }

// The review worksheet (K2B's printReviewWorksheet): what to add to the bay
// and what to delete from the system, each code as a barcode for the PDT,
// with a tick box and room for a note.
function printWorksheet(s, sys) {
  const rows = reviewRows(s, sys), c = compareCounts(s, sys);
  const adds = rows.filter(r => r.status === 'add' || r.status === 'scanned'), dels = rows.filter(r => r.status === 'delete');
  const line = (r, i) => [String(i + 1), pcode(r.code), `${esc(nameOf(r.code) || '')}${r.incorrect ? ' <b>(marked incorrect)</b>' : ''}`, tick, ''];
  printSheet({
    title: `Backfill worksheet · bay ${s.bay}`,
    subtitle: `${esc(s.date)} · ${c.expected} expected · ${c.scannedCount} scanned · ${c.pct == null ? 'no report pasted' : c.pct + '% accuracy'} · ${pcode(s.bay, { height: 26, module: 1.4 })}`,
    body: section(`To add to ${esc(s.bay)} (${adds.length})`, table(['#', 'Keycode', 'Product', 'Done', 'Note'], adds.map(line), ['n', 'bc', '', 't', 'w']))
      + section(`To delete from the system (${dels.length})`, table(['#', 'Keycode', 'Product', 'Done', 'Note'], dels.map(line), ['n', 'bc', '', 't', 'w']))
      + signoff(),
  });
}
