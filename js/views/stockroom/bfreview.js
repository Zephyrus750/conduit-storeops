// Backfill review: K2B's review-and-submission desk, on the store's own
// event log. The phones scan bays (submission.update, codes scanned:true);
// the desk pastes the SIM report, compares each bay, marks it Ready
// (writes the system-only codes as scanned:false so the worker's metrics
// match) and Submits it; the lifecycle is pending → corrected → submitted.
// The pasted report is desk-side state under `simreport:<store>:<date>`,
// as it was in K2B (the report never goes to the worker).
//
// Phone: bay → scan → send. Each scan is its own submission.update, so a
// phone that loses wifi mid-bay keeps its scans in the outbox.

import { $, $$, ic, esc, vh, sub, status, fmtTime, ago, toast, mhead, mscan, msteps, mlast, mrows, mbig, mghost, mfoot } from '../../ui.js';
import { parseReportByLocation, parseKeycodes, reviewRows, compareCounts, readyPayload } from '../../../shared/backfill.js';
import { STATUS, todayKey, ensureNames, nameHtml, nameOf, send } from './common.js';

const st = { sel: null, sort: 'pct', view: 'list', paste: false, report: null, reportFor: null, mStep: 1, mBay: '', mLast: null, claimed: null };
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
  return { date, subs, requested, pending, ready, submitted, sys, claims: bf.claims, history: Object.values(bf.subs).filter(s => s.date !== date) };
}
const pcol = p => p == null ? 'var(--dim)' : p >= 90 ? '#16A34A' : p >= 70 ? '#CA8A04' : '#DC2626';
const key = s => `${s.bay}:${s.date}`;

export default {
  id: 'bfreview', title: 'Backfill review', icon: 'm-bfreview', area: 'stockroom',
  desktop(ctx) {
    const m = model(ctx);
    if (!st.sel || (!m.subs.some(s => key(s) === st.sel) && !m.requested.some(b => 'req:' + b === st.sel))) st.sel = m.pending[0] ? key(m.pending[0]) : m.ready[0] ? key(m.ready[0]) : null;
    const rep = st.report ? `<span class="rs-fresh ${(Date.now() - st.report.at) < 600000 ? 'a' : 'r'}" title="SIM report pasted ${fmtTime(new Date(st.report.at).toISOString())} · ${Object.keys(st.report.byLoc).length} bays"><span class="dot"></span>Report ${ago(new Date(st.report.at).toISOString())}</span>` : `<span class="rs-gap">${ic('alert')}No report pasted</span>`;
    const head = vh('Backfill review', sub('Today’s board', `${m.pending.length} to review · ${m.requested.length} requested · ${m.ready.length} ready · ${m.submitted.length} submitted`), `${rep}<button class="btn" data-act="paste">${ic('clip')}Paste whole report</button>`, 'm-bfreview');
    const slc = (s, c, extra = '') => `<button class="slc${st.sel === key(s) ? ' sel' : ''}${extra}" data-act="sel" data-sel="${esc(key(s))}"><div class="sl"><div class="tp"><span class="loc">${esc(s.bay)}</span>${m.claims[s.bay] && m.claims[s.bay].by !== ctx.session.device ? `<span class="lock" title="Being reviewed on another device">${ic('lock')}</span>` : ''}</div><div class="meta"><b title="scanned / expected">${c.scannedCount}/${c.expected}</b> scanned · ${s.updatedAt ? fmtTime(s.updatedAt) : ''}</div></div><div class="sr">${c.pct == null ? `<span class="pc" style="color:var(--dim)">—</span><span class="dc">no report</span>` : `<span class="pc" style="color:${pcol(c.pct)}">${c.pct}%</span><span class="dc">${c.add ? `<b class="a">+${c.add}</b> ` : ''}${c.delete ? `<b class="d">−${c.delete}</b>` : ''}${!c.add && !c.delete ? 'clean' : ''}</span>`}</div></button>`;
    const left = `<div class="srail left"><div class="srail-t">Review<span class="ct amber">${m.pending.length}</span><span class="tb"><select class="sortb" data-act="sort" title="Sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></span></div><div class="srail-list">` +
      m.pending.map(s => slc(s, s.c)).join('') +
      m.requested.map(b => `<button class="slc wait${st.sel === 'req:' + b ? ' sel' : ''}" data-act="sel" data-sel="req:${esc(b)}"><div class="sl"><div class="tp"><span class="loc">${esc(b)}</span></div><div class="meta">requested · not scanned yet</div></div><div class="sr"><span class="pc wait">${ic('clock')}</span></div></button>`).join('') +
      `</div><div class="srail-foot"><div class="req"><b>${m.subs.length}</b> sent through · <b>${m.requested.length}</b> requested</div><div class="addrow"><input class="inp" data-field="addloc" placeholder="Add or request a bay…" inputmode="numeric"><button class="btn sm" data-act="request">Request</button></div></div></div>`;
    const right = `<div class="srail right"><div class="srail-t">Ready<span class="ct green">${m.ready.length}</span></div><div class="srail-list">${m.ready.map(s => slc(s, compareCounts(s, m.sys ? m.sys[s.bay] || null : null))).join('') || '<div class="scol-empty" style="padding:14px"><small>Nothing marked ready yet</small></div>'}</div>` +
      `<div class="srail-sub"><div class="srail-t sub">Submitted today<span class="ct green">${m.submitted.length}</span></div>${m.submitted.map(s => slc(s, compareCounts(s, m.sys ? m.sys[s.bay] || null : null), ' subm')).join('')}</div>${m.ready.length ? `<button class="finall" data-act="finalise">${ic('check')}Finalise all (${m.ready.length})</button>` : ''}</div>`;
    return head + (st.paste ? pasteSheet() : '') + `<div class="sr3">${left}<div class="smid">${middle(ctx, m)}</div>${right}</div>`;
  },
  mobile(ctx) {
    if (ctx.arg?.bay && st.mArg !== ctx.arg.bay) { st.mArg = ctx.arg.bay; st.mBay = String(ctx.arg.bay).toUpperCase(); st.mStep = 2; st.mLast = null; }
    return `<div id="bfmob">${mobile(ctx)}</div>`;
  },
  mount(ctx, root) {
    loadReport(ctx).then(changed => { if (changed) ctx.rerender(); });
    const repaint = () => { if (ctx.isMobile) { const h = $('#bfmob', root); if (h) h.innerHTML = mobile(ctx); } else ctx.rerender(); };
    ensureNames(ctx, allCodes(ctx), repaint);
    root.addEventListener('click', e => onClick(e, ctx, root, repaint));
    root.addEventListener('change', e => { if (e.target.matches('[data-act="sort"]')) { st.sort = e.target.value; ctx.rerender(); } });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-field="addloc"]')) { e.preventDefault(); addLocation(ctx, e.target.value, false); e.target.value = ''; }
      if (e.target.matches('[data-field="mbay"]')) { e.preventDefault(); startBay(ctx, e.target.value, repaint); }
      if (e.target.matches('[data-field="mscan"]')) { e.preventDefault(); scanCode(ctx, e.target, repaint); }
    });
    if (ctx.isMobile) { openBayIfNeeded(ctx); setTimeout(() => { try { root.querySelector('[data-field="mscan"],[data-field="mbay"]')?.focus(); } catch {} }, 50); }
    return [ctx.store.on('backfill', () => { ensureNames(ctx, allCodes(ctx), repaint); repaint(); })];
  },
};

function allCodes(ctx) { const out = []; for (const s of Object.values(ctx.store.get('backfill').subs)) if (s.date === todayKey()) out.push(...Object.keys(s.codes)); if (st.report) for (const l of Object.values(st.report.byLoc)) out.push(...l); return out; }
async function loadReport(ctx) {
  const k = reportKey(ctx); if (st.reportFor === k) return false;
  st.reportFor = k; st.report = (await ctx.storage.get(k)) || null; return true;
}
function pasteSheet() {
  return `<div class="card" style="margin-bottom:14px"><div class="ch"><h3>Paste the whole SIM report</h3><span class="cs-dim">one paste, every bay pre-compared</span><span class="btn sm" style="margin-left:auto" data-act="paste-close">${ic('x')}Close</span></div><textarea class="ad-in" data-field="paste" rows="7" placeholder="Location · keycode · … one line per code, or “Location: 7012” headers. Copy the report from SIM and paste it here."></textarea><div class="acts" style="margin-top:10px"><button class="btn primary" data-act="paste-save">${ic('check')}Use this report</button><span class="cs-dim" id="pasteCount"></span></div></div>`;
}
function middle(ctx, m) {
  if (!st.sel) return `<div class="scol-empty" style="padding:40px">${ic('m-bfreview')}<b>Nothing on the board yet</b><small>Phones send bays here as they scan. Request a bay on the left to put it on the day list.</small></div>`;
  if (st.sel.startsWith('req:')) {
    const bay = st.sel.slice(4), sys = m.sys?.[bay] || null;
    return `<div class="smid-h"><span class="bigloc">${esc(bay)}</span><span class="bc"></span><span class="status req">${ic('clock')}Requested</span><span class="hm"><span><b>${sys ? sys.length : '—'}</b>expected</span><span><b>0</b>scanned</span></span><span class="sp"></span><button class="btn" data-act="cancel-req" data-bay="${esc(bay)}">${ic('x')}Cancel request</button></div>` +
      `<div class="reqgrid"><div class="reqcard">${ic('phone')}<b>Waiting for the floor</b><p>Send someone to <b>${esc(bay)}</b> with a phone: the first scan turns this into a review${sys ? ' and compares it against the pasted report on the spot' : ''}.</p><a class="btn" data-go="daylist">${ic('listcheck')}Day list</a></div>` +
      `<div class="reqlist"><div class="scol-t">${sys ? 'In the report' : 'No report covers this bay'}<span class="ct">${sys ? sys.length : 0}</span></div>${(sys || []).map(c => `<div class="reqrow"><span class="kc">${esc(c)}</span><span class="nm">${nameHtml(c)}</span></div>`).join('')}</div></div>`;
  }
  const s = m.subs.find(x => key(x) === st.sel); if (!s) return '';
  const sys = m.sys ? m.sys[s.bay] || null : null, rows = reviewRows(s, sys), c = compareCounts(s, sys);
  const ro = s.status === 'submitted';
  const stat = STATUS[s.status];
  const head = `<div class="smid-h"><span class="bigloc">${esc(s.bay)}</span>${ro ? '' : `<span class="ico" title="Correct this bay number" data-act="rename">${ic('edit')}</span>`}<span class="bc"></span><span class="status ${stat[1]}">${ro ? ic('check') : ''}${stat[0]}</span>${ro ? `<span class="cs-dim subat">at ${fmtTime(s.submittedDoneAt)}${s.autoSubmitted ? ' · auto' : ''}</span>` : ''}<span class="hm"><span><b>${c.expected}</b>expected</span><span><b>${c.scannedCount}</b>scanned</span><span><b class="c-green">${c.match}</b>match</span><span><b style="color:${pcol(c.pct)}">${c.pct == null ? '—' : c.pct + '%'}</b>accuracy</span><span><b class="${c.incorrect ? 'c-red' : ''}">${c.incorrect}</b>incorrect</span></span><span class="sp"></span>` +
    (s.status === 'pending' ? `<button class="btn ready" data-act="ready" title="Mark ready: writes these metrics to History and frees the bay">${ic('check')}Ready</button>` : s.status === 'corrected' ? `<button class="btn submitb" data-act="submit">${ic('checks')}Submit</button><button class="btn" data-act="reopen">${ic('refresh')}Reopen</button>` : `<a class="btn" data-go="srhistory">${ic('history')}History</a>`) +
    `<span class="ico bin" title="Delete this bay" data-act="delete">${ic('trash')}</span></div>`;
  const ctl = `<div class="smid-ctl"><span class="pills"><button class="${st.view === 'list' ? 'on' : ''}" data-act="view" data-v="list">List</button><button class="${st.view === 'detail' ? 'on' : ''}" data-act="view" data-v="detail">Detail</button></span><span class="cpill match">${c.match} match</span><span class="cpill add">${c.add + c.scanned} add</span><span class="cpill del">${c.delete} delete</span>${ro ? `<span class="cpill lock">${ic('lock')}read only</span>` : ''}${!sys ? `<span class="cpill lock">${ic('alert')}no report for this bay</span>` : ''}</div>`;
  const crow = r => `<div class="scode${r.incorrect ? ' inc' : ''}${nameOf(r.code) === null ? ' bad' : ''}"><span class="kc">${esc(r.code)}</span><span class="nm">${nameHtml(r.code)}${r.incorrect ? ' <span class="inctag">✕ incorrect</span>' : ''}</span>${ro ? '' : `<span class="acts"><span title="Flag for SOH adjustment" data-act="flag" data-code="${esc(r.code)}">${ic('sort')}</span><span title="${r.incorrect ? 'Clear incorrect' : 'Mark incorrect'}" data-act="incorrect" data-code="${esc(r.code)}">${ic('alert')}</span>${r.status !== 'delete' ? `<span title="Remove this code" data-act="remove" data-code="${esc(r.code)}">${ic('x')}</span>` : ''}</span>`}</div>`;
  const adds = rows.filter(r => r.status === 'add' || r.status === 'scanned'), dels = rows.filter(r => r.status === 'delete'), matches = rows.filter(r => r.status === 'match');
  const body = st.view === 'detail'
    ? `<div class="dlist"><div class="drow dhead"><span>Keycode</span><span></span><span>Verdict</span><span>Product</span><span>Backfilled</span><span>Inventory</span><span></span></div>${rows.map(r => `<div class="drow${r.incorrect ? ' bad' : ''}"><span class="kc">${esc(r.code)}</span><span class="dc-icos">${r.status !== 'delete' ? `<span class="dc-ico" title="Scanned">${ic('barcode')}</span>` : ''}</span><span class="cpill ${r.status === 'delete' ? 'del' : r.status === 'match' ? 'match' : 'add'}">${r.status === 'delete' ? 'Remove' : r.status === 'match' ? 'Match' : 'Add to ' + esc(s.bay)}</span><span class="dc-name">${nameHtml(r.code)}</span><span class="tick2${r.status !== 'delete' ? ' yes' : ''}">${ic(r.status !== 'delete' ? 'check' : 'x')}</span><span class="tick2${r.status !== 'add' && r.status !== 'scanned' ? ' yes' : ''}">${ic(r.status !== 'add' && r.status !== 'scanned' ? 'check' : 'x')}</span>${ro ? '<span></span>' : `<span class="dc-edit"><span title="Flag for SOH adjustment" data-act="flag" data-code="${esc(r.code)}">${ic('sort')}</span><span title="Mark incorrect" data-act="incorrect" data-code="${esc(r.code)}">${ic('alert')}</span>${r.status !== 'delete' ? `<span title="Remove" data-act="remove" data-code="${esc(r.code)}">${ic('x')}</span>` : ''}</span>`}</div>`).join('')}</div>`
    : `<div class="scols"><div class="scol"><div class="scol-t add">Add to ${esc(s.bay)}<span class="ct">${adds.length}</span></div>${adds.map(crow).join('') || `<div class="scol-empty">${ic('check')}<b>Nothing to add</b><small>${sys ? 'Everything scanned is in the system' : 'Paste the report to compare'}</small></div>`}</div><div class="scol"><div class="scol-t del">Delete from system<span class="ct">${dels.length}</span></div>${dels.map(crow).join('') || `<div class="scol-empty">${ic('check')}<b>Nothing to delete</b><small>${sys ? 'Every system code was scanned' : 'Paste the report to compare'}</small></div>`}</div></div>`;
  const hist = m.history.filter(h => h.bay === s.bay && h.metrics).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const tail = `<div class="matches"><b>${matches.length} codes match</b> ${sys ? 'the pasted report and need nothing' : '· no report pasted for this bay yet'}${s.readyAt ? ` · marked ready ${fmtTime(s.readyAt)}` : ''}</div>` +
    (hist.length ? `<div class="lochist"><span class="lh-t">${esc(s.bay)} before today</span>${hist.map(h => `<span><b>${esc(h.date)}</b> ${h.metrics.scanned}/${h.metrics.expected} · ${h.metrics.accuracy}%</span>`).join('')}<a data-go="srhistory">Open in History</a></div>` : '');
  return head + ctl + body + tail;
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
    st.report = { at: Date.now(), byLoc: { ...(st.report?.byLoc || {}), ...byLoc } }; await ctx.storage.set(reportKey(ctx), st.report);
    st.paste = false; toast(`Report pasted: ${n} bays, ${Object.values(byLoc).reduce((x, l) => x + l.length, 0)} codes`); ensureNames(ctx, allCodes(ctx), repaint); ctx.rerender();
  }
  else if (act === 'request') { const inp = root.querySelector('[data-field="addloc"]'); await addLocation(ctx, inp.value, true); inp.value = ''; }
  else if (act === 'cancel-req') { await send(ctx, 'submission.request', { bay: a.dataset.bay, date }, { remove: true }); st.sel = null; }
  else if (act === 'ready') { const s = cur(); if (!s) return; const sys = m.sys?.[s.bay] || null; const p = readyPayload(s, sys); if (Object.keys(p.codes).length || p.incorrect.length) await send(ctx, 'submission.update', { bay: s.bay, date }, p); await send(ctx, 'submission.ready', { bay: s.bay, date }); await send(ctx, 'submission.claim', { bay: s.bay, date }, { release: true }); st.sel = null; }
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
  else if (act === 'm-send') { st.mStep = 3; repaint(); }
  else if (act === 'm-undo') { if (st.mLast) { await send(ctx, 'submission.update', { bay: st.mBay, date }, { remove: [st.mLast] }); st.mLast = null; repaint(); } }
  else if (act === 'm-next') { st.mStep = 1; st.mBay = ''; st.mLast = null; repaint(); setTimeout(() => root.querySelector('[data-field="mbay"]')?.focus(), 30); }
  else if (act === 'm-scan-btn') { const inp = root.querySelector('[data-field="mscan"]'); if (inp) await scanCode(ctx, inp, repaint); }
}
async function select(ctx, sel) {
  const date = todayKey();
  if (st.claimed && st.claimed !== sel) { await send(ctx, 'submission.claim', { bay: st.claimed.split(':')[0], date }, { release: true }); st.claimed = null; }
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
function mobile(ctx) {
  const m = model(ctx), date = todayKey();
  if (st.mStep === 2 && st.mBay) {
    const s = m.subs.find(x => x.bay === st.mBay), codes = s ? Object.entries(s.codes).filter(([, c]) => c.scanned).map(([c]) => c) : [];
    const recent = codes.slice(-4).reverse();
    return mhead(esc(st.mBay), 'scanning', `<span class="mv-cnt">${codes.length}<small>codes</small></span>`) + msteps(2, ['Bay', 'Scan', 'Send']) +
      `<div class="mv-scan typed"><div class="cap">Scan each product on the shelf</div><div class="mv-field"><input data-field="mscan" inputmode="numeric" autocomplete="off" placeholder="Keycode or item barcode" enterkeyhint="done"></div><div class="tools"><button data-act="m-scan-btn">${ic('barcode')}Add</button></div></div>` +
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
  return mhead('Backfill scan', 'Scan the bay label to start') + msteps(1, ['Bay', 'Scan', 'Send']) +
    `<div class="mv-scan typed"><div class="cap">Scan the location barcode</div><div class="mv-field"><input data-field="mbay" inputmode="numeric" autocomplete="off" placeholder="7000-series bay label, or type the number" enterkeyhint="go"></div><div class="tools"><button data-act="m-start">${ic('arrow')}Start</button></div></div>` +
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
function focusScan(root) { setTimeout(() => root.querySelector('[data-field="mscan"]')?.focus(), 30); }
