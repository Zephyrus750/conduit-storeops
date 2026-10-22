// Backfill review: K2B's review-and-submission desk, on the store's own
// event log. The phones scan bays (submission.update, codes scanned:true);
// the desk pastes the SIM report, compares each bay, marks it Ready
// (writes the system-only codes as scanned:false and sends the bay's report
// list with submission.ready so the worker's metrics match the desk's) and
// Submits it; the lifecycle is pending → corrected → submitted. The pasted
// report goes to the worker (POST /backfill/report) so every computer and
// phone reads the same one; each device keeps a copy under
// `simreport:<store>:<date>` for offline, and fetches the worker's when the
// backfill.report.publish event says a newer one is there.
//
// Phone: bay → scan → send. Each scan is its own submission.update, so a
// phone that loses wifi mid-bay keeps its scans in the outbox.

import { $, $$, ic, esc, vh, sub, status, fmtTime, ago, toast, mhead, mscan, msteps, mlast, mrows, mbig, mghost, mfoot, camButton } from '../../ui.js';
import { phoneCode, disputes, parseReportByLocation, parseReportLines, parseKeycodes, parseKeycodeText, parseRequested, reportRange, freshBand, reportGap, pasteDelta, reviewRows, compareCounts, readyPayload, backfillMetrics, scannedCodes } from '../../../shared/backfill.js';
import { hasMap, shelfForLocation } from '../../map.js';
import { barcodeSvg } from '../../../shared/barcode.js';
import { printSheet, code as pcode, tick, table, section, signoff } from '../../print.js';
import { addDays } from '../../../shared/time.js';
import { openScreenScan } from '../../screenscan.js';
import { CLAIM_TTL_MS } from '../../../shared/reducers/stockroom.js';
import { STATUS, todayKey, ensureNames, nameHtml, nameOf, send, copyText, loadProfiles, depthChip, SR_DEPTS, SR_GROUPS, deptLabel, deptColour, deptBadge } from './common.js';
import { settingsOf, deptForBay } from '../../../shared/reducers/store.js';
import { tx, txn } from '../../i18n.js';

// Desk state. report: the pasted SIM report { at, byLoc, range, delta, bayAt }
// (delta: what changed per bay since the previous paste; bayAt: when one
// bay's list was pasted on its own). focus: the one-code-at-a-time view.
const st = { sel: null, sort: 'pct', view: 'list', paste: false, bayPaste: false, reqPaste: false, help: false, report: null, reportFor: null, focusIdx: 0, focusCol: 'all', processed: new Map(), mStep: 1, mBay: '', mLast: null, claimed: null };
const SORTS = { pct: tx('Match, best first'), loc: tx('By location'), when: tx('Most recent') };
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
  id: 'bfreview', title: tx('Backfill review'), icon: 'm-bfreview', area: 'stockroom',
  desktop(ctx) {
    mineUse(ctx.storeNo);
    const m = model(ctx);
    if (!st.sel || (!m.subs.some(s => key(s) === st.sel) && !m.requested.some(b => 'req:' + b === st.sel))) st.sel = m.pending[0] ? key(m.pending[0]) : m.ready[0] ? key(m.ready[0]) : null;
    const head = vh(tx('Backfill review'), sub(tx('Today’s board'), tx('{pending} to review · {requested} requested · {ready} ready · {submitted} submitted', { pending: m.pending.length, requested: m.requested.length, ready: m.ready.length, submitted: m.submitted.length })), `${freshChip()}${st.report?.range ? `<span class="rs-range" title="${tx('The bays the pasted report covers')}">${tx('covers <b>{from}–{to}</b>', { from: esc(st.report.range.from), to: esc(st.report.range.to) })}</span>` : ''}<button class="btn" data-act="paste">${ic('clip')}${tx('Paste whole report')}</button><button class="btn" data-act="req-paste" title="${tx("Paste or clear today's requested list")}">${ic('listcheck')}${tx('Requested list')}</button><button class="btn" data-go="srdepts" title="${tx('Which bays belong to which department, for the whole store')}">${ic('tag')}${tx('Departments')}</button><button class="ibtn" data-act="help" title="${tx('Keyboard shortcuts (?)')}" aria-label="${tx('Keyboard shortcuts')}">?</button>`, 'm-bfreview');
    const reqd = new Set(ctx.store.get('backfill').requested[m.date] || []), band = st.report ? freshBand((Date.now() - st.report.at) / 60000) : 'r';
    // REQ: on today's requested list. PRE: in the pasted report but not
    // requested (banked ahead). The diff mark: the report covers the bay and
    // is not stale, so it opens straight to compare.
    const tags = s => (reqd.has(s.bay) ? `<span class="rq-tag req" title="${tx('On today’s requested list')}">${tx('REQ')}</span>` : m.sys?.[s.bay] ? `<span class="rq-tag pre" title="${tx('In the paste but not on today’s plan: banked ahead')}">${tx('PRE')}</span>` : '') + (s.status === 'pending' && m.sys?.[s.bay] && band !== 'r' ? `<span class="rq-cmp" title="${tx('Report loaded for this bay: opens straight to compare')}">${ic('sort')}</span>` : '') +
      (s.status === 'pending' && s.lateScans ? `<span class="rq-tag late" title="${txn(s.lateScans, 'Back in review: {n} scan landed after it was readied', 'Back in review: {n} scans landed after it was readied')}">${tx('LATE')}</span>` : '') +
      (s.status === 'pending' && !s.sentAt && Object.values(s.codes).some(c => c.scanned) ? `<span class="rq-tag scan" title="${tx('The phone has not sent this bay to review yet')}">${tx('SCANNING')}</span>` : '');
    const ranges = settingsOf(ctx.store.get()).deptRanges || [];
    const slc = (s, c, extra = '') => `<button class="slc${st.sel === key(s) ? ' sel' : ''}${extra}" data-act="sel" data-sel="${esc(key(s))}"><div class="sl"><div class="tp"><span class="loc">${esc(s.bay)}</span>${deptBadge(deptForBay(ranges, s.bay), { short: true })}${tags(s)}${heldElsewhere(ctx, m, s.bay) ? `<span class="lock" title="${tx('Being reviewed on another device')}">${ic('lock')}</span>` : ''}</div><div class="meta">${tx('{count} scanned', { count: `<b title="${tx('scanned / expected')}">${c.scannedCount}/${c.expected}</b>` })} · ${s.updatedAt ? fmtTime(s.updatedAt) : ''}</div></div><div class="sr">${c.pct == null ? `<span class="pc" style="color:var(--dim)">—</span><span class="dc">${tx('no report')}</span>` : `<span class="pc" style="color:${pcol(c.pct)}">${c.pct}%</span><span class="dc">${c.add ? `<b class="a">+${c.add}</b> ` : ''}${c.delete ? `<b class="d">−${c.delete}</b>` : ''}${!c.add && !c.delete ? tx('clean') : ''}</span>`}</div></button>`;
    const left = `<div class="srail left"><div class="srail-t">${tx('backfill stage::Review')}<span class="ct amber">${m.pending.length}</span><span class="tb"><select class="sortb" data-act="sort" title="${tx('Sort')}">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></span></div><div class="srail-list">` +
      m.pending.map(s => slc(s, s.c)).join('') +
      m.requested.map(b => `<button class="slc wait${st.sel === 'req:' + b ? ' sel' : ''}" data-act="sel" data-sel="req:${esc(b)}"><div class="sl"><div class="tp"><span class="loc">${esc(b)}</span></div><div class="meta">${tx('requested · not scanned yet')}${m.sys && !m.sys[b] ? ` · <span class="rq-tag miss" title="${tx('On today’s plan but not in this report')}">${tx('MISSING')}</span>` : ''}</div></div><div class="sr"><span class="pc wait">${ic('clock')}</span></div></button>`).join('') +
      `</div><div class="srail-foot"><div class="req">${tx('<b>{sent}</b> sent through · <b>{requested}</b> requested', { sent: m.subs.length, requested: m.requested.length })}</div><div class="addrow"><input class="inp" data-field="addloc" placeholder="${tx('Add or request a bay…')}" inputmode="numeric"><button class="btn sm" data-act="request">${tx('Request')}</button></div></div></div>`;
    const right = `<div class="srail right"><div class="srail-t">${tx('Ready')}<span class="ct green">${m.ready.length}</span></div><div class="srail-list">${m.ready.map(s => slc(s, compareCounts(s, m.sys ? m.sys[s.bay] || null : null))).join('') || `<div class="scol-empty" style="padding:14px"><small>${tx('Nothing marked ready yet')}</small></div>`}</div>` +
      `<div class="srail-sub"><div class="srail-t sub">${tx('Submitted today')}<span class="ct green">${m.submitted.length}</span></div>${m.submitted.map(s => slc(s, compareCounts(s, m.sys ? m.sys[s.bay] || null : null), ' subm')).join('')}</div>${m.ready.length ? `<button class="finall" data-act="finalise">${ic('check')}${tx('Finalise all ({n})', { n: m.ready.length })}</button>` : ''}</div>`;
    return head + (st.paste ? pasteSheet() : '') + (st.reqPaste ? reqSheet(m) : '') + (st.help ? helpSheet() : '') + `<div class="sr3">${left}<div class="smid">${middle(ctx, m)}</div>${right}</div>`;
  },
  mobile(ctx) {
    mineUse(ctx.storeNo);
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
      if (e.target.matches('[data-field="reqpaste"]')) { const c = root.querySelector('[data-reqcount]'); if (c) { const n = parseRequested(e.target.value).length; c.textContent = txn(n, '{n} bay', '{n} bays'); } }
    });
    const onKey = e => deskKey(e, ctx);
    if (!ctx.isMobile) document.addEventListener('keydown', onKey);
    root.addEventListener('change', async e => {
      if (e.target.matches('[data-act="sort"]')) { st.sort = e.target.value; ctx.rerender(); }
      // A bay's department, changed here (the Stockroom code is enough): a pin that beats its range.
      else if (e.target.matches('[data-field="bdept"]')) {
        const bay = e.target.dataset.bay, dept = e.target.value;
        if (await send(ctx, 'bay.dept.set', { bay }, { dept })) { const now = deptForBay(settingsOf(ctx.store.get()).deptRanges || [], bay); toast(now ? (dept ? tx('{bay} is {dept}', { bay, dept: deptLabel(now) }) : tx('{bay} is {dept} (its bay range)', { bay, dept: deptLabel(now) })) : tx('{bay} has no department', { bay })); }
        else ctx.rerender();
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-field="addloc"]')) { e.preventDefault(); addLocation(ctx, e.target.value, false); e.target.value = ''; }
      if (e.target.matches('[data-field="mbay"]')) { e.preventDefault(); startBay(ctx, e.target.value, repaint); }
      if (e.target.matches('[data-field="mscan"]')) { e.preventDefault(); scanCode(ctx, e.target, repaint); }
      if (e.target.matches('[data-field="mreadd"]')) { e.preventDefault(); readdCode(ctx, e.target, repaint); }
    });
    if (ctx.isMobile) { openBayIfNeeded(ctx); setTimeout(() => { try { root.querySelector('[data-field="mscan"],[data-field="mbay"]')?.focus(); } catch {} }, 50); }
    clearTimeout(releaseSoon);   // a rerender remounts the view: the bay stays held
    const renew = setInterval(() => claimNow(ctx, true), CLAIM_TTL_MS / 4);
    const onHide = () => { if (document.visibilityState === 'hidden') releaseClaim(ctx); else if (st.sel && !st.claimed) select(ctx, st.sel); };
    document.addEventListener('visibilitychange', onHide);
    return [ctx.store.on('settings', () => ctx.rerender()), ctx.store.on('backfill', () => { ensureNames(ctx, allCodes(ctx), repaint); repaint(); loadReport(ctx).then(c => { if (c) { ensureNames(ctx, allCodes(ctx), repaint); repaint(); } }); }), () => document.removeEventListener('keydown', onKey),
      () => { clearInterval(renew); document.removeEventListener('visibilitychange', onHide); clearTimeout(releaseSoon); releaseSoon = setTimeout(() => releaseClaim(ctx), 1500); }];
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
// The day's report: this device's copy first (offline, instant), then the
// store's when it is newer (another desk pasted or updated it); a paste that
// could not be sent is sent again.
let loading = null;
function loadReport(ctx) { return loading ||= syncReport(ctx).finally(() => { loading = null; }); }
async function syncReport(ctx) {
  const k = reportKey(ctx); let changed = false;
  if (st.reportFor !== k) { st.reportFor = k; st.report = (await ctx.storage.get(k)) || null; changed = true; }
  if (st.report?.unsent) return (await pushReport(ctx, st.report)) || changed;
  const meta = ctx.store.get('backfill').report;
  if (meta?.date !== todayKey() || meta.rev === st.report?.rev) return changed;
  try {
    const doc = await ctx.api(`/v1/store/${ctx.storeNo}/backfill/report?date=${todayKey()}`);
    if (st.reportFor !== k) return changed;
    st.report = { at: doc.at, byLoc: doc.byLoc || {}, range: doc.range ?? null, delta: doc.delta || {}, bayAt: doc.bayAt || {}, soh: doc.soh || {}, rev: meta.rev };
    await ctx.storage.set(k, st.report); return true;
  } catch { return changed; }
}
// Save the report here and send it to the store; offline it waits (unsent)
// and goes with the next load.
// A bay's department: its own pin if it has one, else the bay range it
// falls in. The picker changes it here (bay.dept.set); "use the bay range"
// takes the pin out. Ranges as a whole are set in Settings › Store.
function deptPick(ctx, bay) {
  const m = /\d{3,6}/.exec(String(bay)); if (!m) return '';
  const ranges = settingsOf(ctx.store.get()).deptRanges || [], n = Number(m[0]);
  const pin = ranges.find(r => r.from === n && r.to === n), fromRange = deptForBay(ranges.filter(r => r !== pin), bay), cur = pin?.dept || fromRange || '';
  const none = pin ? (fromRange ? tx('Use the bay range ({dept})', { dept: deptLabel(fromRange) }) : tx('Use the bay range (none)')) : fromRange ? tx('{dept} · bay range', { dept: deptLabel(fromRange) }) : tx('No department yet');
  return `<label class="bdept" title="${tx('The department bay {bay} belongs to: Adjustments and History group by it', { bay: esc(bay) })}"><span class="dot" style="background:${cur ? deptColour(cur) : 'transparent'}"></span><select data-field="bdept" data-bay="${esc(bay)}" aria-label="${tx('Department for bay {bay}', { bay: esc(bay) })}"><option value="">${esc(none)}</option>` +
    SR_GROUPS.map(([g, gl]) => `<optgroup label="${gl}">${SR_DEPTS.filter(d => d.group === g).map(d => `<option value="${d.id}"${pin?.dept === d.id ? ' selected' : ''}>${esc(deptLabel(d.id))}</option>`).join('')}</optgroup>`).join('') + `</select></label>`;
}
// The report's SOH for a code, beside its name in the review (red at 0 or less).
function sohTag(kc) { const q = st.report?.soh?.[kc]; return q == null ? '' : ` <span class="rsoh${q <= 0 ? ' neg' : ''}" title="${tx("SOH on today's report")}">SOH ${esc(q)}</span>`; }
// The pasted report's items at 0 or less (its SOH column) go to today's
// Adjustments at the bay the report lists them in, as Stock intelligence
// does when its report is saved; items already on the list are left alone.
async function reportToAdjust(ctx, byLoc, lines) {
  const day = todayKey(), have = ctx.store.get('adjustments')?.[day] || {}, at = {};
  for (const [bay, codes] of Object.entries(byLoc)) for (const kc of codes) at[kc] ||= bay;
  let n = 0;
  for (const [kc, r] of Object.entries(lines)) {
    if (!(r.soh <= 0) || have[kc]) continue;
    if (await send(ctx, 'adjustment.set', { keycode: kc, date: day }, { qty: Math.round(r.soh), location: at[kc] || '', confirmed: false, name: nameOf(kc) || r.desc || '', ...(Number.isFinite(r.price) ? { price: r.price } : {}), source: 'report' })) n++;
  }
  return n;
}
async function saveReport(ctx, report) {
  st.report = report; await ctx.storage.set(reportKey(ctx), report);
  if (!(await pushReport(ctx, report))) toast(tx('Saved on this computer. It reaches the store’s other devices once the connection is back.'), 'warn');
}
async function pushReport(ctx, r) {
  try {
    await ctx.api(`/v1/store/${ctx.storeNo}/backfill/report`, { method: 'POST', body: { date: todayKey(), report: { at: r.at, byLoc: r.byLoc, range: r.range ?? null, delta: r.delta || {}, bayAt: r.bayAt || {}, soh: r.soh || {} } }, timeoutMs: 60000 });
    if (r.unsent) { delete r.unsent; await ctx.storage.set(reportKey(ctx), r); }
    return true;
  } catch { if (!r.unsent) { r.unsent = true; await ctx.storage.set(reportKey(ctx), r); } return false; }
}
function pasteSheet() {
  return `<div class="card" style="margin-bottom:14px"><div class="ch"><h3>${tx('Paste the whole SIM report')}</h3><span class="cs-dim">${tx('one paste, every bay pre-compared')}</span><span class="btn sm" style="margin-left:auto" data-act="paste-close">${ic('x')}${tx('Close')}</span></div><textarea class="ad-in" data-field="paste" rows="7" placeholder="${tx('Location · keycode · … one line per code, or “Location: 7012” headers. Copy the report from SIM and paste it here.')}"></textarea><div class="acts" style="margin-top:10px"><button class="btn primary" data-act="paste-save">${ic('check')}${tx('Use this report')}</button><span class="cs-dim" id="pasteCount"></span></div></div>`;
}
// One bay's inventory list from SIM (K2B's paste): lines or a glued blob,
// detected live with names, duplicates removed, leftovers called out, and a
// live Re-check verdict against what the phones scanned.
function bayPasteSheet(s) {
  return `<div class="card baypaste"><div class="ch"><h3>${tx('Inventory list for {bay}', { bay: esc(s.bay) })}</h3><span class="cs-dim">${tx('paste from SIM: one keycode a line, or the whole block')}</span><span class="btn sm" style="margin-left:auto" data-act="bay-paste-close">${ic('x')}${tx('Close')}</span></div><textarea class="ad-in mono" data-field="baypaste" rows="5" placeholder="43166022&#10;43199310&#10;…"></textarea><div class="bp-live" data-baylive><span class="cs-dim">${tx('Paste the list and the codes show here as they are read.')}</span></div><div class="acts" style="margin-top:10px"><button class="btn primary" data-act="bay-paste-save">${ic('check')}${tx('Compare')}</button>${st.report?.byLoc?.[s.bay] ? `<button class="btn" data-act="bay-paste-clear">${tx('Clear compare')}</button>` : ''}</div></div>`;
}
function bayLive(s, text) {
  const r = parseKeycodeText(text);
  if (!r.codes.length) return `<span class="cs-dim">${text.trim() ? tx('No keycodes found yet.') : tx('Paste the list and the codes show here as they are read.')}</span>`;
  const scanned = scannedCodes(s), mm = backfillMetrics(scanned, r.codes, s.incorrect), sc = new Set(scanned), sys = new Set(r.codes);
  const add = scanned.filter(c => !sys.has(c)).length, del = r.codes.filter(c => !sc.has(c)).length;
  const verdict = !scanned.length ? '' : !add && !del ? `<div class="bp-verdict ok">${tx('✓ Perfect match: {match}/{expected}, 100%', { match: mm.match, expected: mm.expected })}</div>` : `<div class="bp-verdict">${tx('Now {acc}% ({match}/{of}). Still {add} to add, {del} to remove.', { acc: mm.accuracy, match: mm.match, of: Math.max(mm.expected, mm.scanned), add, del })}</div>`;
  return `<div class="bp-chips"><span class="chip">${txn(r.codes.length, '{n} code', '{n} codes')}</span>${r.duplicates ? `<span class="chip">${txn(r.duplicates, '{n} duplicate removed', '{n} duplicates removed')}</span>` : ''}${r.mode === 'glued' ? `<span class="chip">${tx('read as one block, 8 digits a code')}</span>` : ''}${r.leftovers.length ? `<span class="chip warn" title="${esc(r.leftovers.join(' '))}">${tx('{n} didn’t fit an 8-digit boundary', { n: r.leftovers.length })}</span>` : ''}</div>${verdict}` +
    `<div class="bp-rows">${r.codes.map((c, i) => `<div class="bp-row"><span class="n">${i + 1}</span><span class="kc mono">${esc(c)}</span><span class="nm">${nameHtml(c)}</span>${scanned.length ? `<span class="${sc.has(c) ? 'c-green' : 'c-red'}">${sc.has(c) ? tx('✓ matched') : tx('remove from system')}</span>` : ''}</div>`).join('')}</div>`;
}
// Today's requested list in bulk (K2B's editor): bays by any separator.
function reqSheet(m) {
  const cur = (m.reqAll || []).join('\n'), n = (m.reqAll || []).length;
  return `<div class="card reqpaste"><div class="ch"><h3>${tx('Today’s requested list')}</h3><span class="cs-dim">${tx('bays to backfill today, by space, comma or line')}</span><span class="btn sm" style="margin-left:auto" data-act="req-close">${ic('x')}${tx('Close')}</span></div><textarea class="ad-in mono" data-field="reqpaste" rows="5">${esc(cur)}</textarea><div class="cs-dim" data-reqcount>${txn(n, '{n} bay', '{n} bays')}</div><div class="acts" style="margin-top:10px"><button class="btn primary" data-act="req-save">${ic('check')}${tx('Save list')}</button><button class="btn" data-act="req-clear">${tx('Clear')}</button></div></div>`;
}
function helpSheet() {
  const k = (keys, what) => `<div class="hk"><span>${keys.map(x => `<kbd>${x}</kbd>`).join(' ')}</span><span>${what}</span></div>`;
  return `<div class="card helpsheet"><div class="ch"><h3>${tx('Keyboard')}</h3><span class="btn sm" style="margin-left:auto" data-act="help">${ic('x')}${tx('Close')}</span></div><div class="hks">` +
    k(['↓', 'j'], tx('next bay to review')) + k(['↑', 'k'], tx('previous bay')) + k(['Enter'], tx('mark ready and open the next bay')) + k(['F'], tx('Focus: one code at a time')) +
    k([tx('Space')], tx('Focus: checked, next code')) + k(['⌫'], tx('Focus: incorrect, next code')) + k(['←', '→'], tx('Focus: move between codes')) + k(['?'], tx('this sheet')) + k(['Esc'], tx('close a sheet')) + '</div></div>';
}
function middle(ctx, m) {
  if (!st.sel) return `<div class="bf-empty"><span class="ic">${ic('m-bfreview')}</span><b>${tx('Nothing on the board yet')}</b><small>${tx('Phones send bays here as they scan. Request a bay on the left to put it on the day list.')}</small></div>`;
  if (st.sel.startsWith('req:')) {
    const bay = st.sel.slice(4), sys = m.sys?.[bay] || null;
    return `<div class="smid-h"><span class="bigloc">${esc(bay)}</span>${deptPick(ctx, bay)}<span class="bc" title="${tx('Bay {bay}: scan into the PDT', { bay: esc(bay) })}">${barcodeSvg(bay, { module: 1.3, height: 30, text: false })}</span><span class="status req">${ic('clock')}${tx('Requested')}</span>${pin(bay)}<span class="hm"><span><b>${sys ? sys.length : '—'}</b>${tx('expected')}</span><span><b>0</b>${tx('scanned')}</span></span><span class="sp"></span><button class="btn" data-act="cancel-req" data-bay="${esc(bay)}">${ic('x')}${tx('Cancel request')}</button></div>` +
      `<div class="reqgrid"><div class="reqcard">${ic('phone')}<b>${tx('Waiting for the floor')}</b><p>${sys ? tx('Send someone to <b>{bay}</b> with a phone: the first scan turns this into a review and compares it against the pasted report on the spot.', { bay: esc(bay) }) : tx('Send someone to <b>{bay}</b> with a phone: the first scan turns this into a review.', { bay: esc(bay) })}</p><a class="btn" data-go="daylist">${ic('listcheck')}${tx('Day list')}</a></div>` +
      `<div class="reqlist"><div class="scol-t">${sys ? tx('In the report') : tx('No report covers this bay')}<span class="ct">${sys ? sys.length : 0}</span></div>${(sys || []).map(c => `<div class="reqrow"><span class="kc">${esc(c)}</span><span class="nm">${nameHtml(c)}</span></div>`).join('')}</div></div>`;
  }
  const s = m.subs.find(x => key(x) === st.sel); if (!s) return '';
  const sys = m.sys ? m.sys[s.bay] || null : null, rows = reviewRows(s, sys), c = compareCounts(s, sys);
  const ro = s.status === 'submitted';
  const stat = STATUS[s.status];
  const head = `<div class="smid-h"><span class="bigloc">${esc(s.bay)}</span>${ro ? '' : `<span class="ico" title="${tx('Correct this bay number')}" data-act="rename">${ic('edit')}</span>`}${deptPick(ctx, s.bay)}<span class="bc" title="${tx('Bay {bay}: scan into the PDT', { bay: esc(s.bay) })}">${barcodeSvg(s.bay, { module: 1.3, height: 30, text: false })}</span><span class="status ${stat[1]}">${ro ? ic('check') : ''}${stat[0]}</span>${ro ? `<span class="cs-dim subat">${tx('at {time}', { time: fmtTime(s.submittedDoneAt) })}${s.autoSubmitted ? ` · ${tx('auto')}` : ''}</span>` : ''}<span class="hm"><span><b>${c.expected}</b>${tx('expected')}</span><span><b>${c.scannedCount}</b>${tx('scanned')}</span><span><b class="c-green">${c.match}</b>${tx('match')}</span><span><b style="color:${pcol(c.pct)}">${c.pct == null ? '—' : c.pct + '%'}</b>${tx('accuracy')}</span><span><b class="${c.incorrect ? 'c-red' : ''}">${c.incorrect}</b>${tx('incorrect')}</span></span><span class="sp"></span>` +
    (ro ? '' : `<button class="btn" data-act="bay-paste" title="${tx("Paste this bay's inventory list from SIM")}">${ic('clip')}${sys ? tx('Re-check') : tx('Paste list')}</button><button class="btn" data-act="bay-screen" title="${tx("Read this bay's list off the SIM screen")}">${ic('expand')}${tx('Screen scan')}</button>`) + pin(s.bay) +
    (s.status === 'pending' ? `<button class="btn ready" data-act="ready" title="${tx('Mark ready: writes these metrics to History and frees the bay (Enter)')}">${ic('check')}${tx('Ready')}</button>` : s.status === 'corrected' ? `<button class="btn submitb" data-act="submit">${ic('checks')}${tx('Submit')}</button><button class="btn" data-act="reopen">${ic('refresh')}${tx('Reopen')}</button>` : `<button class="btn" data-act="unfinalise" title="${tx('Back to Ready: it was not finalised on the PDT after all')}">${ic('refresh')}${tx('Unfinalise')}</button><button class="btn" data-act="reopen" title="${tx('Back into review')}">${tx('Reopen')}</button>`) +
    `<span class="ico bin" title="${tx('Delete this bay')}" data-act="delete">${ic('trash')}</span></div>`;
  const ctl = `<div class="smid-ctl"><span class="pills"><button class="${st.view === 'list' ? 'on' : ''}" data-act="view" data-v="list">${tx('List')}</button><button class="${st.view === 'detail' ? 'on' : ''}" data-act="view" data-v="detail">${tx('Detail')}</button><button class="${st.view === 'codes' ? 'on' : ''}" data-act="view" data-v="codes" title="${tx('Each code to add or remove as a barcode, to scan into the PDT')}">${tx('Barcodes')}</button><button class="${st.view === 'focus' ? 'on' : ''}" data-act="view" data-v="focus" title="${tx('One code at a time, keyboard first (F)')}">${tx('Focus')}</button></span><button class="btn sm" data-act="print-sheet" title="${tx('Print the To add / To remove worksheet')}">${ic('print')}${tx('Worksheet')}</button><button class="btn sm" data-act="copy-all" title="${tx('Copy every code to add or remove, one a line')}">${ic('file')}${tx('Copy all')}</button><span class="cpill match">${tx('{n} match', { n: c.match })}</span><span class="cpill add">${tx('{n} add', { n: c.add + c.scanned })}</span><span class="cpill del">${tx('{n} delete', { n: c.delete })}</span>${ro ? `<span class="cpill lock">${ic('lock')}${tx('read only')}</span>` : ''}${!sys ? `<span class="cpill lock">${ic('alert')}${tx('no report for this bay')}</span>` : ''}</div>`;
  const crow = r => `<div class="scode${r.incorrect ? ' inc' : ''}${nameOf(r.code) === null ? ' bad' : ''}"><span class="kc" data-act="copy" data-code="${esc(r.code)}" title="${tx('Copy')}">${esc(r.code)}</span><span class="nm">${nameHtml(r.code)}${sohTag(r.code)}${depthChip(r.code)}${r.incorrect ? ` <span class="inctag">${tx('✕ incorrect')}</span>` : ''}</span>${ro ? '' : `<span class="acts"><span title="${tx('Flag for SOH adjustment')}" data-act="flag" data-code="${esc(r.code)}">${ic('sort')}</span><span title="${r.incorrect ? tx('Clear incorrect') : tx('Mark incorrect')}" data-act="incorrect" data-code="${esc(r.code)}">${ic('alert')}</span>${r.status !== 'delete' ? `<span title="${tx('Remove this code')}" data-act="remove" data-code="${esc(r.code)}">${ic('x')}</span>` : ''}</span>`}</div>`;
  const adds = rows.filter(r => r.status === 'add' || r.status === 'scanned'), dels = rows.filter(r => r.status === 'delete'), matches = rows.filter(r => r.status === 'match');
  // K2B's scan columns: every code to add or remove as a barcode the reviewer
  // scans straight into the PDT, with its name to check against.
  const bcRow = r => `<div class="bcrow${r.incorrect ? ' inc' : ''}">${barcodeSvg(r.code, { module: 1.6, height: 44 })}<span class="nm">${nameHtml(r.code)}${r.incorrect ? ` <span class="inctag">${tx('✕ incorrect')}</span>` : ''}</span></div>`;
  const codesView = `<div class="scols bcols"><div class="scol"><div class="scol-t add">${tx('Add to {bay}', { bay: esc(s.bay) })}<span class="ct">${adds.length}</span></div>${adds.map(bcRow).join('') || `<div class="scol-empty"><b>${tx('Nothing to add')}</b></div>`}</div><div class="scol"><div class="scol-t del">${tx('Delete from system')}<span class="ct">${dels.length}</span></div>${dels.map(bcRow).join('') || `<div class="scol-empty"><b>${tx('Nothing to delete')}</b></div>`}</div></div>`;
  const body = st.view === 'focus' ? focusView(s, rows) : st.view === 'codes' ? codesView : st.view === 'detail'
    ? `<div class="dlist"><div class="drow dhead"><span>${tx('Keycode')}</span><span></span><span>${tx('Verdict')}</span><span>${tx('Product')}</span><span>${tx('Backfilled')}</span><span>${tx('Inventory')}</span><span></span></div>${rows.map(r => `<div class="drow${r.incorrect ? ' bad' : ''}"><span class="kc">${esc(r.code)}</span><span class="dc-icos">${r.status !== 'delete' ? `<span class="dc-ico" title="${tx('Scanned')}">${ic('barcode')}</span>` : ''}</span><span class="cpill ${r.status === 'delete' ? 'del' : r.status === 'match' ? 'match' : 'add'}">${r.status === 'delete' ? tx('Remove') : r.status === 'match' ? tx('Match') : tx('Add to {bay}', { bay: esc(s.bay) })}</span><span class="dc-name">${nameHtml(r.code)}</span><span class="tick2${r.status !== 'delete' ? ' yes' : ''}">${ic(r.status !== 'delete' ? 'check' : 'x')}</span><span class="tick2${r.status !== 'add' && r.status !== 'scanned' ? ' yes' : ''}">${ic(r.status !== 'add' && r.status !== 'scanned' ? 'check' : 'x')}</span>${ro ? '<span></span>' : `<span class="dc-edit"><span title="${tx('Flag for SOH adjustment')}" data-act="flag" data-code="${esc(r.code)}">${ic('sort')}</span><span title="${tx('Mark incorrect')}" data-act="incorrect" data-code="${esc(r.code)}">${ic('alert')}</span>${r.status !== 'delete' ? `<span title="${tx('Remove')}" data-act="remove" data-code="${esc(r.code)}">${ic('x')}</span>` : ''}</span>`}</div>`).join('')}</div>`
    : `<div class="scols"><div class="scol"><div class="scol-t add">${tx('Add to {bay}', { bay: esc(s.bay) })}<span class="ct">${adds.length}</span></div>${adds.map(crow).join('') || `<div class="scol-empty">${ic('check')}<b>${tx('Nothing to add')}</b><small>${sys ? tx('Everything scanned is in the system') : tx('Paste the report to compare')}</small></div>`}</div><div class="scol"><div class="scol-t del">${tx('Delete from system')}<span class="ct">${dels.length}</span></div>${dels.map(crow).join('') || `<div class="scol-empty">${ic('check')}<b>${tx('Nothing to delete')}</b><small>${sys ? tx('Every system code was scanned') : tx('Paste the report to compare')}</small></div>`}</div></div>`;
  const hist = m.history.filter(h => h.bay === s.bay && h.metrics).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const tail = `<div class="matches">${sys ? tx('<b>{n} codes match</b> the pasted report and need nothing', { n: matches.length }) : tx('<b>{n} codes match</b> · no report pasted for this bay yet', { n: matches.length })}${s.readyAt ? ` · ${tx('marked ready {time}', { time: fmtTime(s.readyAt) })}` : ''}</div>` +
    (Object.keys(s.readd || {}).length ? `<div class="lochist readd"><span class="lh-t">${tx('Re-add · found after finalising')}</span>${Object.entries(s.readd).map(([c, r]) => `<span><b class="mono">${esc(c)}</b> ${r.doneAt ? tx('scanned back {time}', { time: fmtTime(r.doneAt) }) : tx('to scan back in')}${r.by ? ` · ${esc(r.by)}` : ''}</span>`).join('')}</div>` : '') +
    (hist.length ? `<div class="lochist"><span class="lh-t">${tx('{bay} before today', { bay: esc(s.bay) })}</span>${hist.map(h => `<span><b>${esc(h.date)}</b> ${h.metrics.accuracy == null ? tx('{n} scanned · no report', { n: h.metrics.scanned }) : `${h.metrics.scanned}/${h.metrics.expected} · ${h.metrics.accuracy}%`}</span>`).join('')}<a data-go="srhistory">${tx('Open in History')}</a></div>` : '');
  const held = !ro && heldElsewhere(ctx, m, s.bay);
  const claimNote = held ? `<div class="bp-claim">${ic('lock')}<span>${tx('<b>Open on another device</b> since {time}. Changes made on both will cross.', { time: fmtTime(held.at) })}</span><button class="btn sm" data-act="takeover">${tx('Take over')}</button></div>` : '';
  return head + claimNote + ctl + gapNote(s, sys) + (st.bayPaste ? bayPasteSheet(s) : '') + body + tail;
}

const pin = bay => hasMap() ? `<button class="ibtn" data-act="mappin" data-bay="${esc(bay)}" title="${tx('Show {bay} on the map', { bay: esc(bay) })}">${ic('pin')}</button>` : '';
function freshChip() {
  if (!st.report) return `<span class="rs-gap">${ic('alert')}${tx('No report pasted')}</span>`;
  const mins = (Date.now() - st.report.at) / 60000;
  // freshLabel (shared/backfill.js) in words: just now, or minutes ago.
  return `<span class="rs-fresh ${freshBand(mins)}" title="${tx('SIM report pasted {time} · {n} bays · re-paste if the room has moved since', { time: fmtTime(new Date(st.report.at).toISOString()), n: Object.keys(st.report.byLoc).length })}"><span class="dot"></span>${mins < 1 ? tx('report just now') : tx('report {n}m ago', { n: Math.round(mins) })}</span>`;
}
// The gap note (Vector's): the report against this bay's scans. Scanned 3+
// minutes after the report, or a report 30+ minutes old: re-paste. And what
// the last re-paste changed for this bay.
function gapNote(s, sys) {
  if (!sys || !st.report) return '';
  const at = st.report.bayAt?.[s.bay] || st.report.at, g = reportGap(at, s.updatedAt), rel = m => m < 1 ? tx('under a minute') : m < 60 ? tx('{n} min', { n: Math.round(m) }) : tx('{h}h {m}m', { h: Math.floor(m / 60), m: Math.round(m % 60) });
  const d = st.report.delta?.[s.bay], when = { time: fmtTime(new Date(at).toISOString()), ago: rel(g.ageMin) };
  let msg = `${st.report.bayAt?.[s.bay] ? tx('Report list for this bay {time} ({ago} ago)', when) : tx('Report uploaded {time} ({ago} ago)', when)}${s.updatedAt ? ` · ${tx('{bay} scanned {time}', { bay: esc(s.bay), time: fmtTime(s.updatedAt) })}` : ''}`;
  if (g.afterBy >= 1) msg += ` · ${g.warn ? tx('scanned {gap} after the report. Stock received since then won’t be in it: re-paste to be sure.', { gap: rel(g.afterBy) }) : tx('scanned {gap} after the report', { gap: rel(g.afterBy) })}`;
  else if (g.ageMin >= 30) msg += ` · ${tx('the report has aged; re-paste if stock has moved.')}`;
  return `<div class="gapnote${g.warn ? ' warn' : ''}">${ic('clock')}<span>${msg}${d ? ` <b class="gap-delta" title="${esc([...d.added.map(c => '+' + c), ...d.removed.map(c => '−' + c)].join(' '))}">${tx('Since the last paste: {changes}', { changes: [d.added.length ? tx('+{n} new', { n: d.added.length }) : '', d.removed.length ? tx('−{n} gone', { n: d.removed.length }) : ''].filter(Boolean).join(', ') })}</b>` : ''}</span>${g.warn ? `<button class="btn sm" data-act="paste">${ic('clip')}${tx('Re-paste report')}</button>` : ''}</div>`;
}
// Focus (Vector's desk fast path): one code at a time with a big barcode for
// the PDT. Space or Enter: checked and next. Backspace: incorrect and next.
// ← →: move (wraps). A column switch narrows it to what to add or delete.
function focusList(rows) { return st.focusCol === 'add' ? rows.filter(r => r.status === 'add' || r.status === 'scanned') : st.focusCol === 'delete' ? rows.filter(r => r.status === 'delete') : rows; }
function focusView(s, rows) {
  const list = focusList(rows), n = list.length, done = st.processed.get(key(s)) || new Set();
  const cols = rows.some(r => r.status === 'delete' || r.status === 'add') ? `<span class="pills fcols">${[['all', tx('All')], ['add', tx('Add')], ['delete', tx('Delete')]].map(([k, l]) => `<button class="${st.focusCol === k ? 'on' : ''}" data-act="focus-col" data-v="${k}">${l}</button>`).join('')}</span>` : '';
  if (!n) return `<div class="focus-card empty">${cols}<b>${tx('Nothing in this column')}</b></div>`;
  st.focusIdx = ((st.focusIdx % n) + n) % n;
  const r = list[st.focusIdx];
  const verdict = r.status === 'add' || r.status === 'scanned' ? `<div class="fverdict add">${tx('Add to {bay}', { bay: esc(s.bay) })}</div>` : r.status === 'delete' ? `<div class="fverdict del">${tx('Delete from system')}</div>` : '';
  return `<div class="focus-card${r.incorrect ? ' bad' : ''}${done.has(r.code) ? ' done' : ''}">${cols}<div class="fcount"><b>${st.focusIdx + 1} / ${n}</b><span>${tx('{n} checked', { n: [...done].filter(c => list.some(x => x.code === c)).length })}</span></div>` +
    (/^\d{6,13}$/.test(r.code) ? `<div class="fbar">${barcodeSvg(r.code, { module: 2.6, height: 74 })}</div>` : '') +
    `<div class="fcode mono" data-act="copy" data-code="${esc(r.code)}" title="${tx('Copy')}">${esc(r.code)}</div><div class="fname">${nameHtml(r.code)}${depthChip(r.code)}</div>${verdict}` +
    `<div class="fhint"><kbd>${tx('Space')}</kbd> ${tx('checked + next')} · <kbd>⌫</kbd> ${tx('incorrect + next')} · <kbd>←</kbd><kbd>→</kbd> ${tx('move')}</div></div>`;
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
    if (!n) return toast(tx('No location lines found. Each line needs a bay number and a keycode.'), 'bad');
    const prev = st.report?.byLoc || {}, lines = parseReportLines(text), soh = Object.fromEntries(Object.entries(lines).map(([kc, r]) => [kc, r.soh]));
    await saveReport(ctx, { at: Date.now(), byLoc: { ...prev, ...byLoc }, range: reportRange(text, byLoc), delta: pasteDelta(prev, byLoc), bayAt: {}, soh: { ...(st.report?.soh || {}), ...soh } });
    const sent = await reportToAdjust(ctx, byLoc, lines);
    const codes = Object.values(byLoc).reduce((x, l) => x + l.length, 0);
    st.paste = false; toast(`${txn(n, 'Report pasted: {n} bay, {codes} codes', 'Report pasted: {n} bays, {codes} codes', { codes })}${sent ? ` · ${tx('{n} at 0 or less sent to Adjustments', { n: sent })}` : ''}`, '', sent ? { label: tx('Open'), run: () => ctx.go('adjust') } : null); ensureNames(ctx, allCodes(ctx), repaint); ctx.rerender();
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
    else { const r = parseKeycodeText(root.querySelector('[data-field="baypaste"]')?.value || ''); if (!r.codes.length) return toast(tx('No keycodes found in that paste.'), 'bad'); byLoc[s.bay] = r.codes; bayAt[s.bay] = Date.now(); }
    await saveReport(ctx, { ...(st.report || { at: Date.now(), range: null, delta: {} }), byLoc, bayAt, unsent: undefined });
    st.bayPaste = false; toast(act === 'bay-paste-clear' ? tx('{bay}: compare cleared', { bay: s.bay }) : tx('{bay}: {n} codes to compare', { bay: s.bay, n: byLoc[s.bay].length })); ctx.rerender();
  }
  else if (act === 'req-paste') { st.reqPaste = !st.reqPaste; ctx.rerender(); }
  else if (act === 'req-close') { st.reqPaste = false; ctx.rerender(); }
  else if (act === 'req-save' || act === 'req-clear') {
    if (act === 'req-clear' && !confirm(tx('Clear today’s requested list?'))) return;
    const want = act === 'req-clear' ? [] : parseRequested(root.querySelector('[data-field="reqpaste"]')?.value || ''), have = m.reqAll;
    for (const b of want) if (!have.includes(b)) await send(ctx, 'submission.request', { bay: b, date });
    for (const b of have) if (!want.includes(b)) await send(ctx, 'submission.request', { bay: b, date }, { remove: true });
    st.reqPaste = false; toast(act === 'req-clear' ? tx('Requested list cleared') : tx('Requested list: {n} bays', { n: want.length })); ctx.rerender();
  }
  else if (act === 'help') { st.help = !st.help; ctx.rerender(); }
  else if (act === 'focus-col') { st.focusCol = a.dataset.v; st.focusIdx = 0; ctx.rerender(); }
  else if (act === 'copy') copyText(a.dataset.code, a.dataset.code);
  else if (act === 'copy-all') { const s = cur(); if (!s) return; const rows = reviewRows(s, m.sys?.[s.bay] || null).filter(r => r.status !== 'match'); copyText(rows.map(r => r.code).join('\n'), tx('{n} keycodes', { n: rows.length })); }
  else if (act === 'mappin') { const shelf = shelfForLocation(a.dataset.bay); if (shelf) ctx.go('map', { select: shelf }); else toast(tx('{bay} is not on the published map', { bay: a.dataset.bay }), 'bad'); }
  else if (act === 'unfinalise') { const s = cur(); if (s) { await send(ctx, 'submission.ready', { bay: s.bay, date: s.date }); toast(tx('{bay} moved back to Ready', { bay: s.bay })); } }
  else if (act === 'request') { const inp = root.querySelector('[data-field="addloc"]'); await addLocation(ctx, inp.value, true); inp.value = ''; }
  else if (act === 'cancel-req') { await send(ctx, 'submission.request', { bay: a.dataset.bay, date }, { remove: true }); st.sel = null; }
  else if (act === 'print-sheet') { const s = cur(); if (s) printWorksheet(s, m.sys?.[s.bay] || null); }
  else if (act === 'ready') { const s = cur(); if (s) await readyBay(ctx, s, m, false); }
  else if (act === 'takeover') { const s = cur(); if (!s) return; try { await ctx.store.dispatch({ type: 'submission.claim', entity: { bay: s.bay, date }, payload: { takeover: true } }); st.claimed = key(s); toast(tx('{bay} is yours now', { bay: s.bay })); } catch (e) { toast(e.message, 'bad'); } }
  else if (act === 'submit') { const s = cur(); if (s) await send(ctx, 'submission.submit', { bay: s.bay, date }); }
  else if (act === 'reopen') { const s = cur(); if (s) await send(ctx, 'submission.reopen', { bay: s.bay, date }); }
  else if (act === 'finalise') {
    if (!m.ready.length) return toast(tx('No reviewed bays to submit'));
    const list = m.ready.map(s => `${s.bay}${s.metrics?.accuracy == null ? ` (${tx('no report')})` : ` ${s.metrics.accuracy}%`}`);
    if (!confirm(`${txn(m.ready.length, 'Submit {n} reviewed bay? Each must already be finalised on the PDT.', 'Submit {n} reviewed bays? Each must already be finalised on the PDT.')}\n\n${list.slice(0, 30).join(', ')}${list.length > 30 ? `, ${tx('and {n} more', { n: list.length - 30 })}` : ''}`)) return;
    let n = 0; for (const s of m.ready) if (await send(ctx, 'submission.submit', { bay: s.bay, date })) n++;
    toast(txn(n, '{n} bay submitted', '{n} bays submitted'));
  }
  else if (act === 'delete') { const s = cur(); if (s && confirm(tx('Delete {bay} from today’s board? Its scans are removed from the review.', { bay: s.bay }))) { await send(ctx, 'submission.delete', { bay: s.bay, date }); st.sel = null; } }
  else if (act === 'rename') { const s = cur(); if (!s) return; const to = prompt(tx('Correct the bay number for {bay}', { bay: s.bay }), s.bay); if (to && to.trim().toUpperCase() !== s.bay) { const r = await send(ctx, 'submission.rename', { bay: s.bay, date }, { newBay: to.trim() }); if (r) st.sel = `${to.trim().toUpperCase()}:${date}`; } }
  else if (act === 'incorrect') { const s = cur(); if (!s) return; const set = new Set(s.incorrect); set.has(a.dataset.code) ? set.delete(a.dataset.code) : set.add(a.dataset.code); await send(ctx, 'submission.update', { bay: s.bay, date }, { incorrect: [...set] }); }
  else if (act === 'remove') { const s = cur(); if (s) await send(ctx, 'submission.update', { bay: s.bay, date }, { remove: [a.dataset.code] }); }
  else if (act === 'flag') {
    // As K2B: the SOH comes from the report first. One already entered today
    // is offered (and kept on Cancel), never overwritten with 0.
    const s = cur(); if (!s) return; const kc = a.dataset.code;
    const had = (ctx.store.get('adjustments') || {})[date]?.[kc], rep = st.report?.soh?.[kc];
    const ans = prompt(`${tx('SOH for {code} on the report (0 or below)', { code: kc })}${had ? `\n${tx('Already flagged today at {qty}.', { qty: had.qty })}` : rep != null ? `\n${tx('The report says {soh}.', { soh: rep })}` : ''}`, had ? String(had.qty) : rep != null && rep <= 0 ? String(rep) : '0');
    if (ans === null) return;
    const qty = Number(String(ans).trim().replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(qty) || String(ans).trim() === '') return toast(tx('Type the SOH from the report, like -3 or 0'), 'bad');
    if (qty > 0) return toast(tx('Only SOH of 0 or below goes on the adjustment list'), 'bad');
    const r = await send(ctx, 'adjustment.set', { keycode: kc, date }, { qty: Math.round(qty), location: s.bay, confirmed: true, name: nameOf(kc) || had?.name || '', source: 'review' });
    if (r) toast(tx('{code} flagged for Adjustments at {qty} · {bay}', { code: kc, qty: Math.round(qty), bay: s.bay }));
  }
  // phone
  else if (act === 'm-start') { await startBay(ctx, root.querySelector('[data-field="mbay"]')?.value || a.dataset.bay || '', repaint); }
  else if (act === 'm-resume') { st.mBay = a.dataset.bay; st.mStep = 2; repaint(); focusScan(root); }
  else if (act === 'm-send') { mineAdd(st.mBay, date); if (ctx.store.get('backfill').subs[`${st.mBay}:${date}`]) await send(ctx, 'submission.update', { bay: st.mBay, date }, { sent: true }); st.mStep = 3; repaint(); }
  else if (act === 'm-mine') { st.mView = 'mine'; repaint(); }
  else if (act === 'm-home') { st.mView = null; st.mStep = 1; repaint(); }
  else if (act === 'm-check') { st.mView = 'check'; repaint(); }
  else if (act === 'm-remind-close') { st.mRemind = false; repaint(); }
  else if (act === 'm-dismiss') { if (!confirm(tx('Clear {bay} from your list? It was removed from today’s board.', { bay: a.dataset.bay }))) return; mineSave(mineLocal().filter(x => !(x.bay === a.dataset.bay && x.date === a.dataset.date))); repaint(); }
  else if (act === 'm-done') {
    const bay = a.dataset.bay, d = a.dataset.date; if (!confirm(tx('Mark "{bay}" as submitted on the PDT?', { bay }))) return;
    const r = await send(ctx, 'submission.submit', { bay, date: d }); if (!r) return;
    st.mRemind = false; toast(tx('{bay} completed', { bay }));
    const n = readdOpen(ctx.store.get('backfill').subs[`${bay}:${d}`]).length;
    if (n) { toast(txn(n, '{n} item to scan back in', '{n} items to scan back in')); st.mView = 'check'; }
    repaint();
  }
  else if (act === 'm-readd') { st.readd = { bay: a.dataset.bay, date: a.dataset.date }; st.mView = 'readd'; repaint(); setTimeout(() => root.querySelector('[data-field="mreadd"]')?.focus(), 30); }
  else if (act === 'm-readd-done') { const r = await send(ctx, 'submission.readd', { bay: a.dataset.bay, date: a.dataset.date }, { code: a.dataset.code, done: true }); if (r) { toast(tx('{code} scanned back in', { code: a.dataset.code })); repaint(); } }
  else if (act === 'm-ready') { const s = m.pending.find(x => x.bay === a.dataset.bay); if (!s) return; if (!m.sys?.[s.bay] && !confirm(tx('There is no report for {bay} on this phone, so it is recorded as "no report". Mark it ready?', { bay: s.bay }))) return; await readyBay(ctx, s, m, false); repaint(); }
  else if (act === 'm-del') { await removeScan(ctx, a.dataset.code, repaint); }
  else if (act === 'm-undo') { if (st.mLast) { await send(ctx, 'submission.update', { bay: st.mBay, date }, { remove: [st.mLast] }); st.mLast = null; repaint(); } }
  else if (act === 'm-next') { st.mStep = 1; st.mBay = ''; st.mLast = null; repaint(); setTimeout(() => root.querySelector('[data-field="mbay"]')?.focus(), 30); }
  else if (act === 'm-scan-btn') { const inp = root.querySelector('[data-field="mscan"]'); if (inp) await scanCode(ctx, inp, repaint); }
}
// Mark a bay ready (writes the system-only codes and the report list so the
// metrics match), free it, and with next open the bay that slides into its
// place on the review list (Vector's Enter = ready and next).
async function readyBay(ctx, s, m, next) {
  if (s.status === 'pending' && !s.sentAt && Object.values(s.codes).some(c => c.scanned) && !confirm(tx('{bay} has not been sent to review from the phone yet, so it may still be scanning. Mark it ready anyway?', { bay: s.bay }))) return;
  const date = todayKey(), sys = m.sys?.[s.bay] || null, p = readyPayload(s, sys), order = m.pending.map(key), idx = order.indexOf(key(s));
  if (Object.keys(p.codes).length || p.incorrect.length) await send(ctx, 'submission.update', { bay: s.bay, date }, p);
  const r = await send(ctx, 'submission.ready', { bay: s.bay, date }, sys ? { system: sys } : {}); if (!r) return;
  await send(ctx, 'submission.claim', { bay: s.bay, date }, { release: true }); st.claimed = null;
  toast(tx('{bay} marked ready: history recorded', { bay: s.bay }));
  const rest = order.filter(k => k !== key(s));
  st.sel = null;
  if (next && rest.length) await select(ctx, rest[Math.min(idx, rest.length - 1)]);
}
// Another device's live claim on a bay, or null (a lapsed claim is no lock).
function heldElsewhere(ctx, m, bayNo) {
  const c = m.claims[bayNo];
  return c && c.by !== ctx.session.device && Date.now() - Date.parse(c.at) < CLAIM_TTL_MS ? c : null;
}
// The desk holds the bay it has open: renewed while it stays open, given
// up when the view closes or the tab is hidden.
async function claimNow(ctx, renew = false) {
  if (!st.claimed) return;
  const [bayNo, date] = st.claimed.split(':');
  try { await ctx.store.dispatch({ type: 'submission.claim', entity: { bay: bayNo, date }, payload: {} }); }
  catch (e) { if (e.code === 'claimed') { st.claimed = null; if (renew) toast(tx('{bay} was taken over on another device', { bay: bayNo })); } }
}
let releaseSoon = null;
function releaseClaim(ctx) {
  if (!st.claimed) return;
  const [bayNo, date] = st.claimed.split(':'); st.claimed = null;
  ctx.store.dispatch({ type: 'submission.claim', entity: { bay: bayNo, date }, payload: { release: true } }).catch(() => {});
}
async function select(ctx, sel) {
  const date = todayKey();
  if (st.claimed && st.claimed !== sel) { await send(ctx, 'submission.claim', { bay: st.claimed.split(':')[0], date }, { release: true }); st.claimed = null; }
  if (st.sel !== sel) { st.focusIdx = 0; st.bayPaste = false; }
  st.sel = sel;
  const s = model(ctx).subs.find(x => key(x) === sel);
  if (s && s.status === 'pending') { try { await ctx.store.dispatch({ type: 'submission.claim', entity: { bay: s.bay, date }, payload: {} }); st.claimed = sel; } catch (e) { if (e.code === 'claimed') toast(tx('That bay is open on another device')); } }
}
async function addLocation(ctx, raw, request) {
  const bay = String(raw || '').trim().toUpperCase(); if (!bay) return;
  if (request) { await send(ctx, 'submission.request', { bay, date: todayKey() }); toast(tx('{bay} requested', { bay })); }
  else { await send(ctx, 'submission.open', { bay, date: todayKey() }); st.sel = `${bay}:${todayKey()}`; }
}

// ── phone: bay → scan → send ──────────────────────────────────────────
// My locations (K2B's finalise loop): the bays this phone scanned in the
// last two days (the bay records each scanning device; a local list keeps
// the ones since removed at the desk so the phone can say so), each with
// its desk status. Ready: finalise it on the PDT and tap Submit.
// This phone's bays, per store; the old shared key moves to the first store.
let mineStore = '';
const MINE_KEY = () => `my_bays:${mineStore}`;
function mineUse(no) {
  mineStore = String(no || '');
  try { const old = localStorage.getItem('my_bays'); if (old != null) { if (localStorage.getItem(MINE_KEY()) == null) localStorage.setItem(MINE_KEY(), old); localStorage.removeItem('my_bays'); } } catch {}
}
function mineLocal() { try { return JSON.parse(localStorage.getItem(MINE_KEY()) || '[]'); } catch { return []; } }
function mineSave(list) { try { localStorage.setItem(MINE_KEY(), JSON.stringify(list.slice(-200))); } catch {} }
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
  // Re-add on any bay this phone sent, as K2B: before it is finalised the
  // items wait (WAITING) and come up to scan back once it is submitted.
  const readdBtn = r => `<span class="btn sm" data-act="m-readd" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">${tx('Re-add')}</span>`;
  const chip = r => r.state === 'ready' ? `<span class="btn sm primary" data-act="m-done" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">${tx('Submit')}</span>` : r.state === 'gone' ? `<span class="btn sm" data-act="m-dismiss" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">${tx('Removed · clear')}</span>` : `<span class="status warn">${tx('backfill stage::Review')}</span>`;
  const line = r => [esc(r.bay) + (r.date !== todayKey() ? ` <small class="cs-dim">${esc(r.date.slice(5))}</small>` : ''), r.state === 'ready' ? tx('Reviewed: finalise it on the PDT, then tap Submit') : r.state === 'gone' ? tx('Removed from today’s board') : r.state === 'done' ? `${tx('Submitted ✓')}${readdOpen(r.sub).length ? ` · ${tx('{n} to scan back', { n: readdOpen(r.sub).length })}` : ''}` : tx('In review'), r.state === 'gone' ? chip(r) : (r.state === 'done' ? '' : chip(r)) + readdBtn(r), r.state === 'ready' ? 'hot' : r.state === 'gone' ? 'warn' : ''];
  const items = rows.reduce((n, r) => n + readdOpen(r.sub).length, 0);
  return mhead(tx('My locations'), txn(rows.length, '{n} bay from this phone · last 2 days', '{n} bays from this phone · last 2 days')) +
    (open.length ? mrows(open.map(line)) : `<div class="mv-note">${ic('layers')}${tx("No locations submitted yet. Scan a location's codes and send it to review.")}</div>`) +
    (items ? `<div class="mv-tiles">${`<button class="mv-tile hot" data-act="m-check"><span class="ti">${ic('barcode')}</span><span class="tx"><b>${tx('Re-add checklist')}</b><span>${txn(items, '{n} item to scan back in', '{n} items to scan back in')}</span></span><span></span>${ic('chev')}</button>`}</div>` : '') +
    (done.length ? `<details class="mv-done-list"><summary>${tx('Completed · {n}', { n: done.length })}</summary>${mrows(done.map(line))}</details>` : '') +
    mfoot(mghost(tx('Back to scanning'), ' data-act="m-home"'));
}
// Re-add: tag items found after the bay was finalised; the checklist shows
// each one as a barcode to scan back in on the PDT once the bay is done.
function readdView(ctx) {
  const sub = ctx.store.get('backfill').subs[`${st.readd.bay}:${st.readd.date}`], list = readdOpen(sub);
  return mhead(tx('Re-add · {bay}', { bay: esc(st.readd.bay) }), sub?.status === 'submitted' ? tx('Stock found after this bay was finalised') : tx('Stock found after it was sent: scan it back once the bay is finalised')) +
    `<div class="mv-scan typed"><div class="cap">${tx('Scan each item you found')}</div><div class="mv-field"><input data-field="mreadd" inputmode="numeric" autocomplete="off" placeholder="${tx('Keycode or item barcode')}" enterkeyhint="done">${camButton('mreadd')}</div><div class="hint">${tx('Tagging new items to <b>{bay}</b>. The item stays on the shelf.', { bay: esc(st.readd.bay) })}</div></div>` +
    (list.length ? `<div class="mv-sub">${tx('Tagged · {n}', { n: list.length })}</div>` + mrows(list.map(x => [esc(x.code), nameHtml(x.code), '', ''])) : '') +
    mfoot(mbig(list.length ? tx('Scan back {n}', { n: list.length }) : tx('Scan back'), '', 'barcode', ' data-act="m-check"') + mghost(tx('Done'), ' data-act="m-mine"'));
}
function checkView(ctx) {
  const rows = myLocations(ctx).filter(r => readdOpen(r.sub).length), ready = rows.filter(r => r.state === 'done'), wait = rows.filter(r => r.state !== 'done');
  const item = (r, live) => readdOpen(r.sub).map(x => `<div class="rd-item">${live ? barcodeSvg(x.code, { module: 1.8, height: 52 }) : ''}<span class="nm"><b class="mono">${esc(x.code)}</b> ${nameHtml(x.code)}</span>${live ? `<button class="btn sm primary" data-act="m-readd-done" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}" data-code="${esc(x.code)}">${tx('✓ Scanned back in')}</button>` : ''}</div>`).join('');
  return mhead(tx('Re-add checklist'), tx('Scan each one back in on the PDT')) +
    (ready.map(r => `<div class="rd-group"><div class="rd-h ok">${tx('{bay} · FINALISED · scan back now', { bay: esc(r.bay) })}</div>${item(r, true)}</div>`).join('') +
     wait.map(r => `<div class="rd-group"><div class="rd-h">${tx('{bay} · WAITING · not finalised yet', { bay: esc(r.bay) })}</div>${item(r, false)}</div>`).join('') || `<div class="mv-note">${ic('check')}${tx('Nothing waiting to scan back in.')}</div>`) +
    mfoot(mghost(tx('My locations'), ' data-act="m-mine"'));
}
// The finalise reminder: once a session, when a bay this phone sent is ready.
function finaliseReminder(ctx) {
  // Shown once a session: it stays up through repaints until "Got it".
  const ready = myLocations(ctx).filter(r => r.state === 'ready'); if (!ready.length) return '';
  if (st.mRemind !== true) { try { if (sessionStorage.getItem('finalise_reminder_shown')) return ''; sessionStorage.setItem('finalise_reminder_shown', '1'); } catch {} st.mRemind = true; }
  return `<div class="mv-remind" role="dialog" aria-label="${tx('Ready to finalise')}"><b>${tx('Ready to finalise')}</b><span>${tx('These locations you submitted have been reviewed and are ready to finalise on the PDT.')}</span>${mrows(ready.map(r => [esc(r.bay), esc(r.date === todayKey() ? tx('today') : r.date), `<span class="btn sm primary" data-act="m-done" data-bay="${esc(r.bay)}" data-date="${esc(r.date)}">${tx('Submit')}</span>`, 'hot']))}<button class="btn" data-act="m-remind-close">${tx('Got it')}</button></div>`;
}
// The phone's three steps (bay → scan → send).
const steps = () => [tx('Bay'), tx('Scan'), tx('Send')];
function mobile(ctx) {
  const m = model(ctx), date = todayKey();
  if (st.mView === 'mine') return mineView(ctx);
  if (st.mView === 'readd' && st.readd) return readdView(ctx);
  if (st.mView === 'check') return checkView(ctx);
  if (st.mStep === 2 && st.mBay) {
    const s = m.subs.find(x => x.bay === st.mBay), codes = s ? Object.entries(s.codes).filter(([, c]) => c.scanned).map(([c]) => c) : [];
    // Every code scanned here, newest first, each removable (K2B could
    // delete any code, with undo); a pair one digit apart is flagged.
    const all = codes.slice().reverse(), dsp = disputes(codes), nDsp = Object.keys(dsp).length;
    const row = c => [esc(c), dsp[c] ? `<span class="mv-dsp">${ic('alert')}${esc(disputeHint(c, dsp[c][0]))}</span>` : nameHtml(c),
      `<button class="mv-x" data-act="m-del" data-code="${esc(c)}" aria-label="${tx('Remove {code}', { code: esc(c) })}" title="${tx('Remove {code}', { code: esc(c) })}">${ic('x')}</button>`, dsp[c] ? 'warn' : nameOf(c) === null ? 'bad' : ''];
    return mhead(esc(st.mBay), tx('scanning'), `<span class="mv-cnt">${codes.length}<small>${tx('codes')}</small></span>`) + msteps(2, steps()) +
      `<div class="mv-scan typed"><div class="cap">${tx('Scan each product on the shelf')}</div><div class="mv-field"><input data-field="mscan" inputmode="numeric" autocomplete="off" placeholder="${tx('Keycode or item barcode')}" enterkeyhint="done">${camButton('mscan')}</div><div class="tools"><button data-act="m-scan-btn">${ic('barcode')}${tx('Add')}</button></div></div>` +
      (st.mLast ? mlast(esc(st.mLast), nameHtml(st.mLast), tx('just now')) : '') +
      (nDsp ? `<div class="mv-note warn">${ic('alert')}${nDsp / 2 === 1 ? tx('Two codes are one digit apart: check which is on the shelf and remove the other.') : tx('{n} codes are one digit apart: check which is on the shelf and remove the other.', { n: nDsp })}</div>` : '') +
      (all.length ? `<div class="mv-sub">${tx('Scanned here')}</div>` + mrows(all.map(row)) : '') +
      mfoot(mbig(tx('Send {bay} to review', { bay: esc(st.mBay) }), 'ok', 'listcheck', ' data-act="m-send"') + (st.mLast ? mghost(tx('Undo last scan'), ' data-act="m-undo"') : ''));
  }
  if (st.mStep === 3 && st.mBay) {
    const s = m.subs.find(x => x.bay === st.mBay), n = s ? Object.values(s.codes).filter(c => c.scanned).length : 0;
    const next = m.requested.slice(0, 3);
    return mhead(tx('Sent'), `${esc(st.mBay)} · ${txn(n, '{n} code', '{n} codes')} · ${fmtTime(new Date().toISOString())}`) + msteps(3, steps()) +
      `<div class="mv-done"><span class="ck">${ic('check')}</span><b>${tx('{bay} is with review', { bay: esc(st.mBay) })}</b><span>${tx('{n} codes. Review compares it against the report; the sheet is free for the floor.', { n })}</span></div>` +
      (next.length ? `<div class="mv-sub">${tx('up next::Next')}</div>` + mrows(next.map(b => [esc(b), tx('Requested'), `<span class="btn sm" data-act="m-resume" data-bay="${esc(b)}">${tx('Start')}</span>`, ''])) : '') +
      mfoot(mbig(tx('Scan the next bay'), '', 'barcode', ' data-act="m-next"') + mghost(tx('Back to home'), ' data-go="mhome"'));
  }
  // Every bay on today's board, as Vector's phone: resume or mark ready the
  // ones in progress, submit the reviewed ones, start the requested ones.
  const board = [...m.pending.map(s => [esc(s.bay), tx('{n} codes · in progress', { n: s.c.scannedCount }), `<span class="btn sm" data-act="m-resume" data-bay="${esc(s.bay)}">${tx('Resume')}</span><span class="btn sm" data-act="m-ready" data-bay="${esc(s.bay)}">${tx('Ready')}</span>`, 'warn']),
    ...m.ready.map(s => [esc(s.bay), s.metrics?.accuracy == null ? tx('Reviewed · no report: finalise it on the PDT') : tx('Reviewed · {acc}%: finalise it on the PDT', { acc: s.metrics.accuracy }), `<span class="btn sm primary" data-act="m-done" data-bay="${esc(s.bay)}" data-date="${esc(s.date)}">${tx('Submit')}</span>`, 'hot']),
    ...m.requested.map(b => [esc(b), tx('Requested · not started'), `<span class="btn sm" data-act="m-resume" data-bay="${esc(b)}">${tx('Start')}</span>`, ''])];
  const mine = myLocations(ctx), readyN = mine.filter(r => r.state === 'ready').length;
  return (st.mRemind === false ? '' : finaliseReminder(ctx)) + mhead(tx('Backfill scan'), tx('Scan the bay label to start'), `<button class="mv-cnt mine" data-act="m-mine" title="${tx('My locations')}">${ic('listcheck')}${readyN ? `<b>${readyN}</b>` : ''}</button>`) + msteps(1, steps()) +
    `<div class="mv-scan typed"><div class="cap">${tx('Scan the location barcode')}</div><div class="mv-field"><input data-field="mbay" inputmode="numeric" autocomplete="off" placeholder="${tx('Bay label or number')}" enterkeyhint="go">${camButton('mbay')}</div><div class="tools"><button data-act="m-start">${ic('arrow')}${tx('Start')}</button></div></div>` +
    (board.length ? `<div class="mv-sub">${tx('On the board')}</div>` + mrows(board) : `<div class="mv-note">${ic('layers')}${tx('Nothing on the board yet. Scan a bay to start it.')}</div>`);
}
export async function openBayIfNeeded(ctx) { if (st.mStep === 2 && st.mBay && !ctx.store.get('backfill').subs[`${st.mBay}:${todayKey()}`]) await send(ctx, 'submission.open', { bay: st.mBay, date: todayKey() }); }
async function startBay(ctx, raw, repaint) {
  const bay = String(raw || '').trim().toUpperCase(); if (!bay) return;
  const r = await send(ctx, 'submission.open', { bay, date: todayKey() }); if (!r) return;
  st.mBay = bay; st.mStep = 2; st.mLast = null; repaint();
  setTimeout(() => document.querySelector('[data-field="mscan"]')?.focus(), 30);
}
async function scanCode(ctx, input, repaint) {
  const raw = input.value; input.value = '';
  const { code: kc } = phoneCode(raw);
  if (!kc) { toast(whyText(raw), 'bad'); return focusScan(document); }
  const s = ctx.store.get('backfill').subs[`${st.mBay}:${todayKey()}`];
  if (s?.codes[kc]?.scanned) { toast(tx('{code} is already scanned here', { code: kc })); return focusScan(document); }
  const r = await send(ctx, 'submission.update', { bay: st.mBay, date: todayKey() }, { codes: { [kc]: true } });
  if (r) {
    st.mLast = kc; ensureNames(ctx, [kc], repaint); repaint();
    const twin = disputes([...Object.keys(s?.codes || {}).filter(c => s.codes[c].scanned), kc])[kc];
    if (twin) { ensureNames(ctx, twin, repaint); toast(tx('{code} is one digit from {other}: check which is on the shelf', { code: kc, other: twin[0] }), 'warn'); }
  }
  focusScan(document);
}
// Any code scanned here comes off the bay; Undo puts it back.
async function removeScan(ctx, kc, repaint) {
  const where = { bay: st.mBay, date: todayKey() };
  const r = await send(ctx, 'submission.update', where, { remove: [kc] }); if (!r) return;
  if (st.mLast === kc) st.mLast = null;
  repaint();
  toast(tx('{code} removed', { code: kc }), '', { label: tx('Undo'), run: async () => { if (await send(ctx, 'submission.update', where, { codes: { [kc]: true } })) repaint(); } });
}
// Which of a disputed pair the catalogue knows (K2B's guidance).
function disputeHint(kc, other) {
  const a = nameOf(kc), b = nameOf(other);
  if (a && b === null) return tx('One digit from {other}; this one is in the catalogue', { other });
  if (b && a === null) return tx('One digit from {other}, which is in the catalogue: probably the right one', { other });
  if (a && b) return tx('One digit from {other}; both are products: check the item in hand', { other });
  if (a === null && b === null) return tx('One digit from {other}; neither is in the catalogue: check both on the PDT', { other });
  return tx('One digit from {other}: check which is on the shelf', { other });
}
// phoneCode's reason (shared/backfill.js keeps it in English) in this
// device's language: the same three cases.
function whyText(raw) {
  const c = String(raw ?? '').replace(/\D/g, '');
  return !c ? tx('That is not a keycode') : c.length === 13 ? tx('{code} fails its check digit: scan it again', { code: c }) : tx('{code} is {n} digits: a keycode is 7 or 8, an item barcode 13', { code: c, n: c.length });
}
async function readdCode(ctx, input, repaint) {
  const raw = input.value, { code: kc } = phoneCode(raw); input.value = '';
  if (!kc) return toast(whyText(raw), 'bad');
  const r = await send(ctx, 'submission.readd', st.readd, { code: kc });
  if (r) { toast(tx('{code} tagged to {bay}', { code: kc, bay: st.readd.bay })); ensureNames(ctx, [kc], repaint); repaint(); }
  setTimeout(() => document.querySelector('[data-field="mreadd"]')?.focus(), 30);
}
function focusScan(root) { setTimeout(() => root.querySelector('[data-field="mscan"]')?.focus(), 30); }

// The review worksheet (K2B's printReviewWorksheet): what to add to the bay
// and what to delete from the system, each code as a barcode for the PDT,
// with a tick box and room for a note.
function printWorksheet(s, sys) {
  const rows = reviewRows(s, sys), c = compareCounts(s, sys);
  const adds = rows.filter(r => r.status === 'add' || r.status === 'scanned'), dels = rows.filter(r => r.status === 'delete');
  const line = (r, i) => [String(i + 1), pcode(r.code), `${esc(nameOf(r.code) || '')}${r.incorrect ? ` <b>${tx('(marked incorrect)')}</b>` : ''}`, tick, ''];
  const heads = ['#', tx('Keycode'), tx('Product'), tx('Done'), tx('Note')];
  printSheet({
    title: tx('Backfill worksheet · bay {bay}', { bay: s.bay }),
    subtitle: `${esc(s.date)} · ${tx('{n} expected', { n: c.expected })} · ${tx('{n} scanned', { n: c.scannedCount })} · ${c.pct == null ? tx('no report pasted') : tx('{n}% accuracy', { n: c.pct })} · ${pcode(s.bay, { height: 26, module: 1.4 })}`,
    body: section(tx('To add to {bay} ({n})', { bay: esc(s.bay), n: adds.length }), table(heads, adds.map(line), ['n', 'bc', '', 't', 'w']))
      + section(tx('To delete from the system ({n})', { n: dels.length }), table(heads, dels.map(line), ['n', 'bc', '', 't', 'w']))
      + signoff(),
  });
}
