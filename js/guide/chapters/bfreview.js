// Chapter: Backfill review at the desk, on a store PC at
// 1920×1080, as js/views/stockroom/bfreview.js draws it today (desktop():
// the Review and Ready panels, the location's header with its barcode, the
// counts strip, Re-check and Ready, the views and the filter, Focus with Add
// and Delete side by side, Submit, the requested locations and Request).
// Three What ifs play on the same PC (a code one digit off the report, a
// location still being scanned, the report not pasted yet).
// The day is bfscan's morning (chapters/bfscan.js): Busselton 1241, Sunday
// 25 October 2026, K2 Toys bays. At 08:45 the phones have sent 7029 and 7036
// (7036 is the location the crew scanned in that chapter, 08:41), 7031 is
// still being scanned, 7037 and 7038 are requested, 7024 is reviewed and 7020
// finalised. Today's report was pasted at 08:42.
// Every class here starts br2- (styles/guide.css); the frame is js/guide/pc.js.
import { tx, txn } from '../../i18n.js';
import { DEPT_COLOUR, depInk } from '../../ui.js';
import { ai } from '../frames.js';
import { DAY, at, pc, view, vh, sub, gtabs, btn } from '../pc.js';
import { barcodeSvg } from '../../../shared/barcode.js';
import { compareCounts, reviewRows } from '../../../shared/backfill.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const R = (route, body, note) => ({ route, body, note });
const W = bay => ({ bay, date: DAY });

// ── the day's data ───────────────────────────────────────────────────
// Products: keycode → name as the catalogue has it (bfscan's, and more K2
// Toys lines). A code not here is not in the catalogue.
const N = { 43648803: 'Building Bricks 500 Piece', 43615502: 'Plush Bear 40cm', 42977636: '12pk Diecast Vehicles', 43521177: 'Jigsaw Puzzle 1000 Piece', 43350142: 'Bubble Wand Set', 110148905: 'Trading Card Tin',
  43402871: 'Marble Run 60 Piece', 43198853: 'Play Dough 10 Pack', 43702215: 'Wooden Train Set', 43702208: 'Wooden Train Track 24 Piece', 43815540: 'Doll Pram',
  42988105: 'Water Blaster', 43095529: 'Slime Making Kit' };
// The catalogue's one-digit near miss for a code it does not know.
const NEAR = { 43702209: '43702208' };
// Today's report: each location's list (bfscan's 7036, 7037 and 7038), and
// the SOH column for the lines the screens show.
const REP = { 7020: ['43188037', '43188044', '43188051'], 7024: ['43522327', '43301144', '42988112', '43188068'], 7029: ['43277361', '43277378', '43601744', '43601751', '43440219'],
  7031: ['43095512', '43188020', '43522310', '43095529', '42988105'], 7036: ['43648803', '43615502', '43521177', '43350142', '110148905', '43198853'], 7037: ['43702215', '43702208', '43815540'], 7038: ['43402871', '42977636'] };
const SOH = { 42977636: 4, 43402871: 3, 43350142: 6, 42988105: 7, 43095529: 6, 43702208: 4 };
// What the phones scanned. 7036 is bfscan's list: Bubble Wand Set came off on the phone.
const L36 = ['43198853', '43402871', '110148905', '43521177', '42977636', '43615502', '43648803'];
const L = (codes, t, more = {}) => ({ codes, t, st: 'pending', ...more });
// The board at 08:45. A location: its scans, when it last changed (t), its
// stage (pending, corrected = Ready, submitted), scan: the phone has not
// submitted it yet, late: scans that landed after Ready, rdy and done: when
// it was marked ready and submitted.
const BOARD = () => ({
  locs: { 7020: L(REP[7020], '07:12', { st: 'submitted', rdy: '07:30', done: '07:40' }), 7024: L(['43522327', '43301144', '42988112'], '07:58', { st: 'corrected', rdy: '07:58' }),
    7029: L(REP[7029], '08:05'), 7031: L(['43095512', '43188020', '43522310'], '08:38', { scan: true }), 7036: L(L36, '08:41') },
  req: ['7037', '7038'], rep: REP, ago: 3, sel: '7029', view: 'list', menu: false, f: null,
});
const mut = (s, f) => { const n = structuredClone(s); f(n); return n; };

// ── the screen (desktop() in js/views/stockroom/bfreview.js) ──────────
const sysOf = (s, bay) => s.rep ? s.rep[bay] || null : null;
const subOf = l => ({ codes: Object.fromEntries(l.codes.map(k => [k, { scanned: true }])), incorrect: [] });
const cc = (s, bay) => compareCounts(subOf(s.locs[bay]), sysOf(s, bay));
const rowsOf = (s, bay) => reviewRows(subOf(s.locs[bay]), sysOf(s, bay));
const stage = (s, k) => Object.keys(s.locs).filter(b => s.locs[b].st === k);
// Review: match, best first (model()).
const pend = s => stage(s, 'pending').sort((a, b) => ((cc(s, b).pct ?? -1) - (cc(s, a).pct ?? -1)) || a.localeCompare(b));
const band = p => p >= 95 ? 'a-vg' : p >= 85 ? 'a-g' : p >= 70 ? 'a-av' : 'a-bad';
const acc = p => `<span class="br2-acc ${band(p)}">${p}%</span>`;
const dep = (cls = '') => `<span class="br2-dep${cls}" style="background:${DEPT_COLOUR.k2};color:${depInk(DEPT_COLOUR.k2)}">K2</span>`;
const name = kc => N[kc] ? `<span class="ok">${N[kc]} ↗</span>` : `<span class="unv">⚠ ${tx('Unverified · not in the catalogue')}</span>` +
  (NEAR[kc] ? `<span class="near">${tx('Did you mean {a}?', { a: `<span class="br2-use mono">${NEAR[kc]}</span>` })}</span>` : '');
const soh = (s, kc) => s.rep && SOH[kc] != null ? `<span class="br2-soh">SOH ${SOH[kc]}</span>` : '';

// A location's row in Review, Ready or Submitted today.
function slc(s, bay, cls = '') {
  const l = s.locs[bay], c = cc(s, bay), p = l.st === 'pending';
  const tags = `<span class="br2-tag req">${tx('REQ')}</span>` + (p && sysOf(s, bay) ? `<span class="br2-cmp">${ai('sort')}</span>` : '') +
    (p && l.late ? `<span class="br2-tag late">${tx('LATE')}</span>` : '') + (p && l.scan ? `<span class="br2-tag scan">${tx('SCANNING')}</span>` : '');
  return `<span class="br2-slc${s.sel === bay ? ' sel' : ''}${cls}" data-bay="${bay}"><span class="sl"><span class="tp"><span class="loc">${bay}</span>${dep()}${tags}</span>` +
    `<span class="meta">${tx('{count} scanned', { count: `<b>${c.scannedCount}/${c.expected}</b>` })} · ${at(l.t)}</span></span>` +
    `<span class="sr">${c.pct == null ? `<span class="pc dim">—</span><span class="dc">${tx('no report')}</span>` : `<span class="pc">${acc(c.pct)}</span><span class="dc">${c.add ? `<b class="a">+${c.add}</b> ` : ''}${c.delete ? `<b class="d">−${c.delete}</b>` : ''}${!c.add && !c.delete ? tx('clean') : ''}</span>`}</span></span>`;
}
const reqRow = (s, bay) => `<span class="br2-slc wait${s.sel === 'req:' + bay ? ' sel' : ''}" data-bay="req:${bay}"><span class="sl"><span class="tp"><span class="loc">${bay}</span></span>` +
  `<span class="meta">${tx('requested · not scanned yet')}${s.rep && !s.rep[bay] ? ` · <span class="br2-tag miss">${tx('MISSING')}</span>` : ''}</span></span><span class="sr">${ai('clock')}</span></span>`;
const left = s => `<div class="br2-rail l"><div class="br2-rt">${tx('backfill stage::Review')}<span class="ct amber">${pend(s).length}</span><span class="sortb">${tx('Match, best first')}${ai('chev', 'cv')}</span></div>` +
  `<div class="br2-list">${pend(s).map(b => slc(s, b)).join('')}${s.req.map(b => reqRow(s, b)).join('')}</div>` +
  `<div class="br2-rf"><div class="sent">${tx('<b>{sent}</b> sent through · <b>{requested}</b> requested', { sent: Object.keys(s.locs).length, requested: s.req.length })}</div>` +
  `<div class="addrow"><span class="br2-inp br2-ph"><span class="t">${tx('Add or request a bay…')}</span></span><span class="pc2-btn sm br2-reqb">${tx('Request')}</span></div></div></div>`;
function right(s) {
  const rdy = stage(s, 'corrected'), done = stage(s, 'submitted');
  return `<div class="br2-rail r"><div class="br2-rt">${tx('Ready')}<span class="ct green">${rdy.length}</span></div>` +
    `<div class="br2-list">${rdy.map(b => slc(s, b)).join('') || `<div class="br2-none">${tx('Nothing marked ready yet')}</div>`}</div>` +
    `<div class="br2-rsub"><div class="br2-rt sub">${tx('Submitted today')}<span class="ct green">${done.length}</span></div>${done.map(b => slc(s, b, ' subm')).join('')}</div>` +
    (rdy.length ? `<span class="br2-fin">${ai('check')}${tx('Finalise all ({n})', { n: rdy.length })}</span>` : '') + '</div>';
}

// The middle: the location's header, how to look at it, and its codes.
const hst = cells => `<div class="br2-hst">${cells.map(([v, l, cls = '', cell = '']) => `<span${cell ? ` class="${cell}"` : ''}><b${cls ? ` class="${cls}"` : ''}>${v}</b><small>${l}</small></span>`).join('')}</div>`;
const locMenu = bay => `<div class="br2-hm"><div class="hmbc">${barcodeSvg(bay, { module: 1.6, height: 46, text: false })}<small>${tx('Scan {bay} into the PDT', { bay })}</small></div>` +
  `<span class="hmi">${ai('edit')}<b>${tx('Correct the location number')}</b></span><span class="hmi">${ai('pin')}<b>${tx('Show {bay} on the map', { bay })}</b></span><i class="sep"></i>` +
  `<span class="hmi bad">${ai('trash')}<b>${tx('Delete {bay} from today’s board', { bay })}</b></span></div>`;
const hid = (s, bay, status) => `<span class="br2-hid"><span class="br2-hw"><span class="br2-hloc${s.menu ? ' on' : ''}">${bay}${ai('chev', 'cv')}</span>${s.menu ? locMenu(bay) : ''}</span>` +
  `<span class="br2-bc">${barcodeSvg(bay, { module: 1.6, height: 30, text: false })}</span><span class="br2-hdept">${dep()}${ai('chev', 'cv')}</span>${status}</span>`;
const fhint = () => `<div class="br2-fhint"><kbd>${tx('Space')}</kbd> ${tx('checked + next')} · <kbd>⌫</kbd> ${tx('incorrect + next')} · <kbd>←</kbd><kbd>→</kbd> ${tx('move')} · <kbd>A</kbd><kbd>D</kbd> ${tx('Add or Delete side')}</div>`;
function fcard(s, bay, side, list, none) {
  const n = list.length, act = s.f.side === side;
  const title = side === 'add' ? `<div class="br2-fst add">${tx('Add to {bay}', { bay })}<span class="ct">${n}</span></div>` : `<div class="br2-fst del">${tx('Delete from system')}<span class="ct">${n}</span></div>`;
  if (!n) return `<div class="br2-fc empty${act ? ' act' : ''}" data-side="${side}">${title}<b>${none}</b></div>`;
  const kc = list[s.f.i[side] % n].code, k = list.filter(r => s.f.done.includes(r.code)).length;
  return `<div class="br2-fc${s.f.done.includes(kc) ? ' done' : ''}${act ? ' act' : ''}" data-side="${side}">${title}<div class="br2-fcount"><b>${s.f.i[side] % n + 1} / ${n}</b><span>${tx('{n} checked', { n: k })}</span></div>` +
    `<div class="br2-fbar">${barcodeSvg(kc, { module: 2.6, height: 74 })}</div><div class="br2-fcode mono">${kc}</div><div class="br2-fname">${name(kc)}</div></div>`;
}
function middle(s) {
  if (s.sel.startsWith('req:')) return reqMid(s, s.sel.slice(4));
  const bay = s.sel, l = s.locs[bay], sys = sysOf(s, bay), rows = rowsOf(s, bay), c = cc(s, bay), ro = l.st === 'submitted';
  const adds = rows.filter(r => r.status === 'add' || r.status === 'scanned'), dels = rows.filter(r => r.status === 'delete'), match = rows.filter(r => r.status === 'match').length;
  const status = l.st === 'pending' ? `<span class="br2-status warn">${tx('backfill stage::Review')}</span>` : l.st === 'corrected' ? `<span class="br2-status good">${tx('Ready')}</span>`
    : `<span class="br2-status good">${ai('check')}${tx('Submitted')}</span><span class="br2-subat">${tx('at {time}', { time: at(l.done) })}</span>`;
  const recheck = `<span class="pc2-btn br2-hb">${ai('clip')}${sys ? tx('Re-check') : tx('Paste list')}${ai('chev', 'cv')}</span>`;
  const acts = l.st === 'pending' ? `${recheck}<span class="pc2-btn br2-ready">${ai('check')}${tx('Ready')}</span>` : l.st === 'corrected' ? `${recheck}<span class="pc2-btn br2-submit">${ai('checks')}${tx('Submit')}</span><span class="pc2-btn br2-hb br2-reopen">${ai('refresh')}${tx('Reopen')}</span>`
    : `<span class="pc2-btn br2-hb">${ai('refresh')}${tx('Unfinalise')}</span><span class="pc2-btn br2-hb">${tx('Reopen')}</span>`;
  const head = `<div class="br2-hc${l.st === 'pending' ? '' : ' wrap'}">${hid(s, bay, status)}${hst([[c.expected, tx('expected')], [c.scannedCount, tx('scanned')], [c.match, tx('match'), 'g'], [c.pct == null ? '—' : c.pct + '%', tx('accuracy'), '', c.pct == null ? '' : `acc ${band(c.pct)}`], [c.incorrect, tx('incorrect')]])}<span class="sp"></span><span class="br2-hacts">${acts}</span></div>`;
  const n = { all: rows.length, add: adds.length, delete: dels.length, match };
  const ctl = `<div class="br2-ctl"><span class="br2-pills">${[['list', tx('List')], ['detail', tx('Detail')], ['codes', tx('Barcodes')], ['focus', tx('Focus')]].map(([v, t]) => `<span class="br2-pill${s.view === v ? ' on' : ''}" data-v="${v}">${t}</span>`).join('')}</span>` +
    `<span class="br2-flt">${[['all', tx('All')], ['add', tx('Add')], ['delete', tx('Delete')], ['match', tx('Match')]].map(([k, t]) => `<span class="${k}${k === 'all' ? ' on' : ''}${!n[k] && k !== 'all' ? ' off' : ''}">${t} <b>${n[k]}</b></span>`).join('')}</span>` +
    (ro ? `<span class="br2-cpill">${ai('lock')}${tx('read only')}</span>` : '') + (!sys ? `<span class="br2-cpill">${ai('alert')}${tx('no report for this bay')}</span>` : '') +
    `<span class="sp"></span>${sys ? `<span class="br2-clk">${ai('clock')}</span>` : ''}<span class="pc2-btn sm br2-hb">${ai('download')}${tx('Export')}${ai('chev', 'cv')}</span></div>`;
  const crow = r => `<div class="br2-code${N[r.code] ? '' : ' bad'}" data-code="${r.code}"><span class="kc">${r.code}</span><span class="nm">${name(r.code)}${soh(s, r.code)}</span>` +
    (ro ? '' : `<span class="acts">${ai('sort')}${ai('alert')}${r.status !== 'delete' ? ai('x') : ''}</span>`) + '</div>';
  const col = (t, k, list, none, why) => `<div class="br2-col"><div class="br2-ct ${k}">${t}<span class="ct">${list.length}</span></div>${list.map(crow).join('') || `<div class="br2-empty">${ai('check')}<b>${none}</b><small>${why}</small></div>`}</div>`;
  const body = s.view === 'focus' ? `<div class="br2-fpair">${fcard(s, bay, 'add', adds, tx('Nothing to add'))}${fcard(s, bay, 'delete', dels, tx('Nothing to delete'))}</div>${fhint()}`
    : `<div class="br2-cols">${col(tx('Add to {bay}', { bay }), 'add', adds, tx('Nothing to add'), sys ? tx('Everything scanned is in the system') : tx('Paste the report to compare'))}` +
      `${col(tx('Delete from system'), 'del', dels, tx('Nothing to delete'), sys ? tx('Every system code was scanned') : tx('Paste the report to compare'))}</div>`;
  const tail = `<div class="br2-matches">${sys ? tx('<b>{n} codes match</b> the pasted report and need nothing', { n: match }) : tx('<b>{n} codes match</b> · no report pasted for this bay yet', { n: match })}${l.rdy ? ' · ' + tx('marked ready {time}', { time: at(l.rdy) }) : ''}</div>`;
  return head + ctl + body + tail;
}
// A requested location nobody has scanned yet.
function reqMid(s, bay) {
  const sys = sysOf(s, bay);
  return `<div class="br2-hc">${hid(s, bay, `<span class="br2-status req">${ai('clock')}${tx('Requested')}</span>`)}${hst([[sys ? sys.length : '—', tx('expected')], [0, tx('scanned')]])}<span class="sp"></span><span class="pc2-btn br2-hb">${ai('x')}${tx('Cancel request')}</span></div>` +
    `<div class="br2-rq"><div class="br2-rqc">${ai('phone')}<b>${tx('Waiting for the floor')}</b><p>${sys ? tx('Send someone to <b>{bay}</b> with a phone: the first scan turns this into a review and compares it against the pasted report on the spot.', { bay }) : tx('Send someone to <b>{bay}</b> with a phone: the first scan turns this into a review.', { bay })}</p>${btn('listcheck', tx('Day list'))}</div>` +
    `<div class="br2-rql"><div class="br2-ct">${sys ? tx('In the report') : tx('No report covers this bay')}<span class="ct">${sys ? sys.length : 0}</span></div>${(sys || []).map(k => `<div class="br2-rqr"><span class="kc mono">${k}</span><span class="nm">${name(k)}</span></div>`).join('')}</div></div>`;
}
// The tabs, the header and the three panels.
const BFTABS = n => [['bfreview', 'm-backfill', tx('Review'), n], ['daylist', 'm-daylist', tx('Day list')], ['srhistory', 'm-srhistory', tx('History')], ['srtrends', 'chart', tx('Trends')], ['livepull', 'packages', tx('Live pull')]];
function screen(s) {
  const p = pend(s).length, counts = { pending: p, requested: s.req.length, ready: stage(s, 'corrected').length, submitted: stage(s, 'submitted').length };
  const rep = s.rep ? `<span class="br2-fresh"><i></i>${s.ago ? tx('report {n}m ago', { n: s.ago }) : tx('report just now')}</span><span class="br2-range">${tx('covers <b>{from}–{to}</b>', { from: '7020', to: '7039' })}</span>`
    : `<span class="br2-gap">${ai('alert')}${tx('No report pasted')}</span>`;
  return gtabs(BFTABS(p), 'bfreview') + vh('m-backfill', tx('Backfill review'), sub(tx('Today’s board'), tx('{pending} to review · {requested} requested · {ready} ready · {submitted} submitted', counts)),
    `${rep}${btn('clip', tx('Paste whole report'), 'br2-paste')}${btn('listcheck', tx('Requested list'))}${btn('tag', tx('Departments'))}<span class="pc2-btn sq">?</span>`) +
    `<div class="br2-sr3">${left(s)}<div class="br2-mid">${middle(s)}</div>${right(s)}</div>`;
}
// The PC with the screen; badges: the rail's counts (LAD-02 overdue, the report pasted or not).
const desk = (s, badges = { safety: 1 }) => pc(view('v-br', screen(s), true), { on: 'backfill', badges: { ...badges, backfill: pend(s).length } });
const paint = (c, s) => { c.html('#v-br', screen(s)); c.html('.pc2-rail [data-g="backfill"] .bdg', String(pend(s).length)); };
// The toast, centred on the screen as the app has it on a PC; the pointer leaves when what it tapped has gone.
const toast = (c, t) => { c.text('.pc2 > .dv-toast', t); c.cls('.pc2 > .dv-toast', 'br2-t', true); c.show('.pc2 > .dv-toast'); };
const off = c => c.cls('.fg', 'show', false);
// The browser's own confirm (the desk asks with confirm()), and the paste pop-up, over the PC.
const over = (c, html, mid = false) => { c.html('.pc2-omni', html); c.cls('.pc2-omni', 'br2-c', mid); c.show('.pc2-omni'); };
const unover = c => { c.hide('.pc2-omni'); c.html('.pc2-omni', ''); };
const ask = text => `<div class="br2-cf"><p>${text}</p><div><span class="no">${tx('Cancel')}</span><span class="br2-ok">${tx('OK')}</span></div></div>`;
const pastebox = () => `<div class="br2-pb"><div class="h">${ai('file')}<b>${tx('Paste today’s inventory report')}</b><span class="x">${ai('x')}</span></div><div class="b">` +
  `<div class="found">${ai('check')}<div><b>${tx('Found in your clipboard: a SIM report')}</b><span>${[txn(7, '{n} bay', '{n} bays'), txn(28, '{n} keycode', '{n} keycodes'), txn(28, '{n} line with an SOH', '{n} lines with an SOH')].join(' · ')}</span></div></div>` +
  `<span class="br2-save">${ai('check')}${tx('Save as the morning report')}</span><p>${tx('The inventory report goes to Backfill review, the Day list and Adjustments.')}</p></div></div>`;

// ── the chapter's frames ─────────────────────────────────────────────
const S0 = BOARD();
const S3 = mut(S0, s => { Object.assign(s.locs[7029], { st: 'corrected', rdy: '08:46' }); s.sel = '7036'; });
const S5 = mut(S3, s => { s.menu = true; });
const S6 = mut(S3, s => { s.view = 'focus'; s.f = { side: 'add', i: { add: 0, delete: 0 }, done: [] }; });
const S7 = mut(S6, s => { s.f.done.push('42977636'); s.f.i.add = 1; });
const S8 = mut(S7, s => { s.f.side = 'delete'; s.f.done.push('43350142'); });
// Ready opens the next location in Review (7031); 7036 opens again from Ready to Submit.
const S9 = mut(S8, s => { Object.assign(s.locs[7036], { st: 'corrected', rdy: '08:49', t: '08:49' }); s.sel = '7031'; s.f = { side: 'delete', i: { add: 0, delete: 0 }, done: [] }; });
const S9b = mut(S8, s => { Object.assign(s.locs[7036], { st: 'corrected', rdy: '08:49', t: '08:49' }); s.f.i = { add: 0, delete: 0 }; });
const S10 = mut(S9b, s => { Object.assign(s.locs[7036], { st: 'submitted', done: '08:52' }); });
const S11 = mut(S10, s => { s.sel = 'req:7037'; s.view = 'list'; });
const S12 = mut(S11, s => { s.req.push('7039'); });
const glow = (c, sel, on) => c.cls(sel, 'glow', on);

export const bfreview = {
  id: 'bfreview', grp: 'stockroom', icon: 'list', title: tx('Backfill review at the desk'), device: 'pc', where: tx('PC · Stockroom › Backfill › Review'), for: ['stockroom', 'manager'],
  intro: S(tx('The locations the phones scan come to the desk, each compared with today’s report.'), tx('Fix each one on the PDT, mark it Ready, then Submit it once it is finalised.')),
  html: () => desk(S0),
  steps: [
    { cap: tx('Backfill › Review: today’s board, with the best match open.'), read: S(tx('Review on the left lists the locations the phones sent, the best match first; Ready and Submitted today are on the right.'), tx('The line under the title counts them, and the chip says when today’s report was pasted.')),
      dev: 'The desk is <b>desktop()</b> in js/views/stockroom/bfreview.js; <b>model()</b> sorts Review by match, best first, and opens the first one. Looking sends nothing.', ev: [],
      run: async c => { await c.wait(800); } },
    { cap: tx('The header: the location, its barcode, its department and its counts.'), read: S(tx('Expected is the report’s count for the location, scanned the phones’, match the codes in both.'), tx('Accuracy is the matches over whichever is larger, scanned or expected, so too many and too few both pull it down.')),
      dev: '<b>middle()</b> draws the header; the counts are <b>compareCounts()</b> and <b>backfillMetrics()</b> in shared/backfill.js, the same formula as History.', ev: [],
      run: async c => { await c.tap('#v-br .br2-hst'); glow(c, '#v-br .br2-hst', true); await c.wait(700); } },
    { cap: tx('{bay} matches the report: Ready records it and opens the next.', { bay: '7029' }), read: S(tx('Nothing to add and nothing to delete, so there is nothing to do on the PDT.'), tx('Ready, or Enter, moves it to Ready and opens the next location to review.')),
      dev: '<b>readyBay()</b>: <b>submission.ready</b> carries the report’s list so the metrics match the desk’s, the claim is released and <b>select()</b> claims the next location.',
      ev: [E('submission.ready', 'stockroom', W('7029'), { system: REP[7029] }), E('submission.claim', 'stockroom', W('7029'), { release: true }), E('submission.claim', 'stockroom', W('7036'), {})],
      run: async c => { glow(c, '#v-br .br2-hst', false); await c.tap('#v-br .br2-ready'); paint(c, S3); toast(c, tx('{bay} marked ready: history recorded', { bay: '7029' })); } },
    { cap: tx('{bay} needs work: {add} to add, {del} to delete, {match} that match.', { bay: '7036', add: 2, del: 1, match: 5 }), read: S(tx('Add to {bay}: on the shelf, not in the system for this location.', { bay: '7036' }), tx('Delete from system: in the system here, but not found on the shelf.'), tx('Matches need nothing.')),
      dev: '<b>reviewRows()</b> in shared/backfill.js sorts each code into add, delete or match; the filter pills count them.', ev: [],
      run: async c => { await c.tap('#v-br .br2-cols'); glow(c, '#v-br .br2-cols', true); await c.wait(700); } },
    { cap: tx('Click the number: the location’s barcode for the PDT, and more.'), read: S(tx('Scan the barcode into the PDT to open the location there; a smaller one stays beside the number.'), tx('The menu also corrects the number, finds it on the map, or deletes it from today’s board.')),
      dev: '<b>locBc()</b> and <b>locMenu()</b> draw them with <b>barcodeSvg()</b> (shared/barcode.js).', ev: [],
      run: async c => { glow(c, '#v-br .br2-cols', false); await c.tap('#v-br .br2-hloc'); c.html('#v-br', screen(S5)); } },
    { cap: tx('Focus (F): one code at a time, Add and Delete side by side.'), read: S(tx('Each card shows its code as a big barcode to scan into the PDT, with the product.'), tx('List, Detail and Barcodes show the same codes other ways.')),
      dev: '<b>focusView()</b>: with the filter on All, <b>focusSides()</b> puts Add and Delete side by side; <b>deskKey()</b> takes the keys.', ev: [],
      run: async c => { c.html('#v-br', screen(S3)); await c.tap('#v-br .br2-pill[data-v="focus"]'); c.html('#v-br', screen(S6)); } },
    { cap: tx('Scan it into the PDT, then Space: checked, and the next code.'), read: S(tx('The card counts what you have checked.'), tx('⌫ marks a code incorrect instead, and ← → move between codes.')),
      dev: 'Checked is kept on this PC only (<b>deskKey()</b>); nothing is sent. ⌫ sends <b>submission.update</b> with the incorrect list.', ev: [],
      run: async c => { await c.tap('#v-br .br2-fc.act'); c.html('#v-br', screen(S7)); } },
    { cap: tx('D for the Delete side: delete it on the PDT, then Space.'), read: S(tx('A click on a card, or A and D, picks the side the keys work on.'), tx('A checked code turns its card green.')),
      dev: '<b>focusTarget()</b> picks the side the keys work on.', ev: [],
      run: async c => { await c.tap('#v-br .br2-fc[data-side="delete"]'); c.html('#v-br', screen(S8)); } },
    { cap: tx('The PDT matches? Ready: {bay} moves to Ready at {acc}%.', { bay: '7036', acc: 71 }), read: S(tx('Ready records the accuracy in History and frees the location.'), tx('The phone that sent it sees it reviewed straight away.')),
      dev: '<b>readyPayload()</b> writes the code only the report has as scanned: false, then <b>submission.ready</b> carries the report’s list; <b>select()</b> opens and claims the next location in Review.',
      ev: [E('submission.update', 'stockroom', W('7036'), { codes: { 43350142: false }, incorrect: [] }), E('submission.ready', 'stockroom', W('7036'), { system: REP[7036] }), E('submission.claim', 'stockroom', W('7036'), { release: true }), E('submission.claim', 'stockroom', W('7031'), {})],
      run: async c => { await c.tap('#v-br .br2-ready'); paint(c, S9); toast(c, tx('{bay} marked ready: history recorded', { bay: '7036' })); } },
    { cap: tx('Finalised on the PDT? Open it in Ready and Submit: it’s done for today.'), read: S(tx('{bay} moves to Submitted today and reads only.', { bay: '7036' }), tx('Finalise all submits every Ready location at once, after asking; Unfinalise puts one back.')),
      dev: '<b>submission.submit</b> is refused while a location is still in review; Finalise all sends one per Ready location.', ev: [E('submission.submit', 'stockroom', W('7036'), {})],
      run: async c => { await c.tap('#v-br .br2-rail.r .br2-slc[data-bay="7036"]'); c.html('#v-br', screen(S9b)); await c.wait(600); await c.tap('#v-br .br2-submit'); paint(c, S10); } },
    { cap: tx('A requested location waits for the floor, the report’s list beside it.'), read: S(tx('{bay} is on today’s requested list, so the phones offer it next.', { bay: '7037' }), tx('The first scan turns it into a review; Cancel request takes it off the list.')),
      dev: 'The requested list is <b>submission.request</b> on the day; <b>middle()</b> draws a requested location with the report’s codes.', ev: [],
      run: async c => { await c.tap('#v-br .br2-slc[data-bay="req:7037"]'); c.html('#v-br', screen(S11)); } },
    { cap: tx('Request another at the foot: it goes on today’s list.'), read: S(tx('Type the location and Request.'), tx('MISSING means the pasted report has no list for it.')),
      dev: '<b>addLocation()</b> sends <b>submission.request</b>; Requested list at the top pastes a whole list.', ev: [E('submission.request', 'stockroom', W('7039'), {})],
      run: async c => { await c.tap('#v-br .br2-inp'); c.cls('#v-br .br2-inp', 'br2-ph', false); await c.type('#v-br .br2-inp .t', '7039'); await c.tap('#v-br .br2-reqb'); paint(c, S12); toast(c, tx('{bay} requested', { bay: '7039' })); } },
  ],
  whatif: [[tx('Submitted one by mistake?'), tx('Unfinalise it: it goes back to Ready.')], [tx('Left bays ready overnight?'), tx('They are submitted automatically at midnight.')]],
  stories: [],
};

// ── What if a code is one digit off the report? ──────────────────────
// 7037 comes in from the phone with 43702209: the crew kept the camera's
// misread (bfscan's held What if). The catalogue knows 43702208, on the report.
const N0 = mut(S12, s => { s.locs[7037] = L(['43702215', '43815540', '43702209'], '08:56'); s.req = ['7038', '7039']; s.sel = '7031'; });
const N1 = mut(N0, s => { s.sel = '7037'; });
const N3 = mut(N1, s => { Object.assign(s.locs[7037], { codes: ['43702215', '43815540', '43702208'], t: '08:58' }); });
bfreview.stories.push({
  id: 'near', title: tx('What if a code is one digit off the report?'), blurb: tx('The desk says the catalogue doesn’t know it and offers the code it probably is: one click swaps it.'),
  know: [tx('A code the catalogue doesn’t know says so in amber, on a red row.'), tx('When the catalogue knows a code one digit away, Did you mean offers it.'),
    tx('A click uses it instead, after asking: in the scans when the phone scanned it, in the report’s list when the report has it.'), tx('The swap is a correction, not a new scan, so the location doesn’t go back to SCANNING; a submitted location can’t change.'),
    tx('On the phone the camera holds a code like this as a possible misread, so most never reach the desk.')],
  html: () => desk(N0),
  steps: [
    { cap: tx('{bay} comes in: one code the catalogue doesn’t know.', { bay: '7037' }), read: S(tx('{code} is not in the catalogue, and the report has {other}, {name}.', { code: '43702209', other: '43702208', name: N[43702208] }), tx('One to add and one to delete: {acc}%.', { acc: 67 })),
      dev: '<b>nameHtml()</b> in js/views/stockroom/common.js marks it; <b>nearHtml()</b> offers the catalogue’s near misses (<b>nearMiss()</b> in worker/catalogue-object.js).', ev: [E('submission.claim', 'stockroom', W('7037'), {})],
      run: async c => { await c.tap('#v-br .br2-slc[data-bay="7037"]'); c.html('#v-br', screen(N1)); } },
    { cap: tx('Did you mean {code}? Click it: the desk asks first.', { code: '43702208' }), read: S(tx('Check the shelf if in doubt.'), tx('Cancel leaves the scans as they are.')),
      dev: '<b>useNear()</b> asks with the browser’s confirm before it changes anything.', ev: [],
      run: async c => { await c.tap('#v-br .br2-use'); over(c, ask(tx('Use {other} instead of {code} in the scans for {bay}?', { other: '43702208', code: '43702209', bay: '7037' }))); } },
    { cap: tx('OK: the scans swap, and {bay} matches the report.', { bay: '7037' }), read: S(tx('{code} goes in and {other} comes out.', { code: '43702208', other: '43702209' }), tx('Nothing to add, nothing to delete: {acc}%.', { acc: 100 })),
      dev: 'One <b>submission.update</b> marked <b>swap</b>: the code in, the misread out. A swap is a correction, not a scan, so the phone’s Submit for review stands and a Ready location stays Ready. The removal leaves a tombstone, so a late copy from the phone can’t bring it back.',
      ev: [E('submission.update', 'stockroom', W('7037'), { codes: { 43702208: true }, remove: ['43702209'], swap: true })],
      run: async c => { await c.tap('.pc2-omni .br2-ok'); unover(c); off(c); paint(c, N3); toast(c, tx('{code} swapped for {other}', { code: '43702209', other: '43702208' })); } },
  ],
});

// ── What if the crew is still scanning a location? ───────────────────
// 7031 has three scans and no Submit from the phone (bfscan's In progress).
const C0 = mut(S12, s => { s.view = 'list'; });
const C1 = mut(C0, s => { s.sel = '7031'; });
// Nothing is left in Review, so Ready opens the first location in Ready.
const C3 = mut(C1, s => { Object.assign(s.locs[7031], { st: 'corrected', rdy: '08:53', t: '08:53' }); s.sel = '7024'; });
const C4 = mut(C3, s => { Object.assign(s.locs[7031], { st: 'pending', codes: [...s.locs[7031].codes, '43095529'], t: '08:55', late: 1 }); });
bfreview.stories.push({
  id: 'scanning', title: tx('What if the crew is still scanning a location?'), blurb: tx('SCANNING says so, Ready asks first, and a scan that lands after Ready brings it back marked LATE.'),
  know: [tx('SCANNING means a phone has scanned the location but not submitted it for review yet.'), tx('Ready asks first while it says SCANNING; Cancel leaves it in review.'),
    tx('A scan that lands after Ready puts the location back in review, marked LATE; its accuracy is worked out again at the next Ready.'),
    tx('Reopen does the same by hand: a Ready or submitted location goes back into review.'), tx('A Submit sent before a Reopen is ignored: the reopen wins.')],
  html: () => desk(C0),
  steps: [
    { cap: tx('SCANNING: the phone hasn’t submitted {bay} yet.', { bay: '7031' }), read: S(tx('It has {n} of the report’s {total} codes so far.', { n: 3, total: 5 }), tx('The crew may still be on it.')),
      dev: 'The tag is <b>tags()</b> in <b>desktop()</b>: in review, with scans, and no Submit for review from the phone.', ev: [E('submission.claim', 'stockroom', W('7031'), {})],
      run: async c => { await c.tap('#v-br .br2-slc[data-bay="7031"]'); c.html('#v-br', screen(C1)); } },
    { cap: tx('Ready asks first: the crew may still be scanning.'), read: S(tx('Cancel to wait for the phone.'), tx('OK marks it ready anyway, with what it has.')),
      dev: '<b>readyBay()</b> asks with the browser’s confirm when the location has scans but no Submit from the phone.', ev: [],
      run: async c => { await c.tap('#v-br .br2-ready'); over(c, ask(S(tx('{bay} has not been submitted for review from the phone yet, so it may still be scanning.', { bay: '7031' }), tx('Mark it ready anyway?')))); } },
    { cap: tx('OK anyway: {bay} is Ready at {acc}%.', { bay: '7031', acc: 60 }), read: S(tx('The two codes it is missing go in as system only.'), tx('Nothing is left to review, so the desk opens the first location in Ready.')),
      dev: '<b>readyPayload()</b> writes the two codes only the report has as scanned: false, then <b>submission.ready</b>.',
      ev: [E('submission.update', 'stockroom', W('7031'), { codes: { 42988105: false, 43095529: false }, incorrect: [] }), E('submission.ready', 'stockroom', W('7031'), { system: REP[7031] }), E('submission.claim', 'stockroom', W('7031'), { release: true })],
      run: async c => { await c.tap('.pc2-omni .br2-ok'); unover(c); off(c); paint(c, C3); toast(c, tx('{bay} marked ready: history recorded', { bay: '7031' })); } },
    { cap: tx('The phone scans one more: {bay} is back in review, marked LATE.', { bay: '7031' }), read: S(tx('{name} was there after all: {acc}% now.', { name: N[43095529], acc: 80 }), tx('Review it again and mark it ready when the phone is done.')),
      dev: 'The phone’s <b>submission.update</b>: a scan the location did not have, landing on a Ready one, puts it back in review (<b>backToReview()</b> in shared/reducers/stockroom.js) and counts lateScans.',
      ev: [E('submission.update', 'stockroom', W('7031'), { codes: { 43095529: true } })],
      run: async c => { off(c); await c.wait(900); paint(c, C4); } },
  ],
});

// ── What if the morning report isn't pasted yet? ─────────────────────
const P0 = mut(S0, s => { s.rep = null; });
const P1 = mut(P0, s => { s.sel = '7036'; });
const P3 = mut(P1, s => { s.rep = REP; s.ago = 0; });
bfreview.stories.push({
  id: 'noreport', title: tx('What if the morning report isn’t pasted yet?'), blurb: tx('Every location shows what the phones scanned, with nothing to compare: paste the report and they all compare at once.'),
  know: [tx('Until the report is pasted, each location lists its scans with no accuracy.'), tx('Paste whole report reads the clipboard and says what it found before anything is saved.'),
    tx('Saved, it reaches every desk and phone in the store; the phones show how many codes it has for each location.'), tx('Items at 0 or less on the report go to today’s Adjustments.'),
    tx('A later paste updates the locations it lists, and Re-check pastes one location’s list from SIM.')],
  html: () => desk(P0, { inputs: 1, safety: 1 }),
  steps: [
    { cap: tx('No report: each location lists its scans, with nothing to compare.'), read: S(tx('No report pasted, at the top, and no accuracy on any location.'), tx('Everything scanned waits under Add.')),
      dev: '<b>compareCounts()</b> with no report gives no accuracy; <b>freshChip()</b> says No report pasted.', ev: [E('submission.claim', 'stockroom', W('7036'), {})],
      run: async c => { await c.tap('#v-br .br2-slc[data-bay="7036"]'); c.html('#v-br', screen(P1)); } },
    { cap: tx('Copy the report in SIM, then Paste whole report.'), read: S(tx('In SIM, copy the whole report by location.'), tx('Paste reads the clipboard and says what it found before anything is saved.')),
      dev: '<b>openPasteBox()</b> in js/views/pastebox.js reads the clipboard and counts it with <b>parseReportByLocation()</b>.', ev: [],
      run: async c => { await c.tap('#v-br .br2-paste'); over(c, pastebox(), true); } },
    { cap: tx('Save it: every location compares at once.'), read: S(tx('Every location gets its accuracy, and its codes to add and to delete.'), tx('Review sorts them again, the best match first.')),
      dev: '<b>pasteReport()</b> keeps it on this PC and posts it to the worker, which logs <b>backfill.report.publish</b>; items at 0 or less go to Adjustments (<b>reportToAdjust()</b>).',
      ev: [R('POST /v1/store/1241/backfill/report', { date: DAY, report: { byLoc: '{ 7 bays, 28 codes }', range: { from: '7020', to: '7039' } } }, 'Saved for the store: every desk and phone reads the same report.'), E('backfill.report.publish', 'stockroom', { date: DAY }, { bays: 7, codes: 28 })],
      run: async c => { await c.tap('.pc2-omni .br2-save'); unover(c); off(c); paint(c, P3); c.remove('.pc2-rail [data-g="inputs"] .bdg'); toast(c, txn(7, 'Report pasted: {n} bay, {codes} codes', 'Report pasted: {n} bays, {codes} codes', { codes: 28 })); } },
  ],
});
