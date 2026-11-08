// Chapter: Backfill, scan a location, on the phone, as the
// app has it today (js/views/stockroom/bfreview.js mobile: the board, the
// location bar with its three steps, the list, the strip, its panel and the
// Submit sheet; js/livescan.js: the live PDT reader with its PDT list /
// Barcode switch). Three What ifs play on the same phone.
// The day: Busselton 1241, location 7036 in K2 Toys with today's report
// pasted at the desk; 7037 and 7038 are requested next.
// Every class here starts bf2- (styles/guide.css): the guide's stylesheet
// already uses short names such as .ph, .prog, .seg and .rp.
import { tx, txn } from '../../i18n.js';
import { fmtTime } from '../../ui.js';
import { ai, phone2, bars } from '../frames.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const DAY = '2026-10-25';
const W = bay => ({ bay, date: DAY });
// Today at a time, as the app writes it (js/ui.js fmtTime).
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return fmtTime(d.toISOString()); };
// Products: keycode → name as the catalogue has it (data). Not in it: null.
const N = { 43648803: 'Building Bricks 500 Piece', 43615502: 'Plush Bear 40cm', 42977636: '12pk Diecast Vehicles', 43521177: 'Jigsaw Puzzle 1000 Piece', 43350142: 'Bubble Wand Set', 110148905: 'Trading Card Tin',
  43402871: 'Marble Run 60 Piece', 43198853: 'Play Dough 10 Pack', 43702215: 'Wooden Train Set', 43702208: 'Wooden Train Track 24 Piece', 43815540: 'Doll Pram', 43702209: null, 42977686: null };
// The PDT's list on its screen: keycode, the PDT's description, quantity (the PDT's words: data).
const PDT36 = [['43648803', 'BUILDING BRICKS 500PC', 2], ['43615502', 'PLUSH BEAR 40CM', 3], ['42977636', '12PK DIECAST VEH', 4], ['43521177', 'JIGSAW PUZZLE 1000PC', 1], ['43350142', 'BUBBLE WAND SET', 6], ['110148905', 'TRADING CARD TIN', 2]];
const PDT37 = [['43702215', 'WOODEN TRAIN SET', 1], ['43815540', 'DOLL PRAM', 2], ['43702208', 'WOODEN TRACK 24PC', 3]];
// Today's report (pasted at the desk) for 7036 and 7037.
const REP36 = ['43648803', '43615502', '43521177', '43350142', '110148905', '43198853'], REP37 = ['43702215', '43702208', '43815540'];

// ── the phone's pieces (bfreview.js mobile) ───────────────────────────
const DEP = '<span class="bf2-dep">K2</span>', DEPN = `${DEP}<span class="bf2-dn">Toys</span>`;
const steps3 = on => `<ol class="bf2-steps">${[tx('Location'), tx('Scan'), tx('Submit')].map((l, i) => `<li class="${i + 1 < on ? 'bf2-sdn' : i + 1 === on ? 'bf2-son' : ''}"><i></i><span>${i + 1 < on ? `${l} ✓` : `${i + 1} ${l}`}</span></li>`).join('')}</ol>`;
const top = (title, right, on) => `<div class="bf2-top"><div class="bf2-tr">${title}<span class="bf2-sp"></span>${right}</div>${steps3(on)}</div>`;
const mine = n => `<span class="bf2-btn bf2-sm bf2-mine">${ai('listcheck')}${tx('Mine')}${n ? `<b>${n}</b>` : ''}</span>`;
const btn = (l, cls = '') => `<span class="bf2-btn bf2-sm${cls ? ' ' + cls : ''}">${l}</span>`;
const row = (bay, small, acts) => `<div class="bf2-row" data-bay="${bay}"><span class="bf2-loc"><b>${bay}</b>${DEP}</span><small>${small}</small><span class="bf2-acts">${acts}</span></div>`;
const codes = n => txn(n, '{n} code', '{n} codes');
// The board: every location today under its stage (boardView()).
const BOARD = { prog: [['7031', 3]], rev: [['7029', 5, at(8, 5)]], fin: [['7024', 75]], req: ['7036', '7037', '7038'], done: 1 };
function board(b = BOARD, n = 0) {
  const g = (k, h, rows) => rows.length ? `<div class="bf2-g bf2-g${k}"><div class="bf2-gh"><i></i>${h}<span class="bf2-ct">${rows.length}</span></div>${rows.join('')}</div>` : '';
  return top(`<b class="bf2-tn">${tx('Pick a location')}</b>`, mine(n), 1) +
    `<div class="bf2-entry"><span class="bf2-inp bf2-ph"><span class="bf2-t">${tx('Scan or type a location')}</span></span><span class="bf2-cam">${ai('camera')}</span><span class="bf2-btn bf2-pri bf2-start">${tx('Start')}</span></div>` +
    `<div class="bf2-board">${g('prog', tx('In progress'), b.prog.map(([bay, k]) => row(bay, codes(k), btn(tx('Resume')) + btn(tx('Ready')))))}` +
    g('rev', tx('With review'), b.rev.map(([bay, k, t]) => row(bay, `${codes(k)} · ${t}`, btn(tx('Resume')) + btn(tx('Ready'))))) +
    g('fin', tx('Reviewed: finalise on the PDT'), b.fin.map(([bay, acc]) => row(bay, tx('{acc}% accurate', { acc }), btn(tx('Submit'), 'bf2-pri')))) +
    g('req', tx('Requested'), b.req.map(bay => row(bay, tx('not started'), btn(tx('Start'))))) +
    (b.done ? `<div class="bf2-g bf2-gdone"><div class="bf2-gh"><i></i>${tx('Finalised today')}<span class="bf2-ct">${b.done}</span>${ai('chev', 'bf2-cv')}</div></div>` : '') + '</div>';
}
const upNext = (bay, n) => `<div class="bf2-st"><div class="bf2-l2">${tx('Up next')}</div><div class="bf2-l1"><b>${bay}</b>${DEP}<span>${txn(n, '{n} requested', '{n} requested')}</span></div></div><span class="bf2-go">${tx('Start {bay}', { bay })}</span>`;
// A code's line: its name ↗ (the catalogue's), unverified, or the one-digit hint.
const name = kc => N[kc] ? `${N[kc]} ↗` : `<span class="bf2-unv">⚠ ${tx('Unverified · not in the catalogue')}</span>`;
const code = (kc, { fresh = false, hint = '' } = {}) => `<div class="bf2-code${fresh ? ' bf2-new' : ''}${hint ? ' bf2-wn' : ''}" data-code="${kc}"><b>${kc}</b><span class="bf2-nm">${hint ? `<span class="bf2-dsp">${ai('alert')}${hint}</span>` : name(kc)}</span>${fresh ? `<em>${tx('just now')}</em>` : ''}<span class="bf2-x">${ai('x')}</span></div>`;
// The location (scanView()): the bar, the field and Scan, any notes, the list newest first.
function scan(bay, list = [], { fresh = true, notes = '', hints = {} } = {}) {
  return top(`<span class="bf2-tn">${tx('Location {bay}', { bay: `<span class="mono">${bay}</span>` })}${ai('chev')}</span>`, DEPN, 2) +
    `<div class="bf2-entry"><span class="bf2-fw"><span class="bf2-in bf2-ph"><span class="bf2-t">${tx('Scan or type a code')}</span></span><span class="bf2-plus">${ai('plus')}</span></span><span class="bf2-btn bf2-pri bf2-scan">${ai('camera')}${tx('Scan')}</span></div>` +
    (notes ? `<div class="bf2-notes">${notes}</div>` : '') + `<div class="bf2-list"><div class="bf2-lh">${tx('Scanned here')}<span>${tx('newest first')}</span></div>` +
    (list.length ? list.map((kc, i) => code(kc, { fresh: fresh && i === 0, hint: hints[kc] })).join('') : `<p class="bf2-empty">${tx('Tap Scan to read the PDT’s list, or scan each product.')}</p>`) + '</div>';
}
const scanStrip = (bay, n, last, held = 0) => `<div class="bf2-st"><div class="bf2-l1"><b>${n}</b><span>${txn(n, 'code in {bay}', 'codes in {bay}', { bay })}</span></div>` +
  `<div class="bf2-l2">${held ? `<b class="bf2-w">${txn(held, '{n} held', '{n} held')}</b> · ` : ''}${last ? `${tx('Last')} <b>${last}</b> ${N[last] || ''}` : tx('Nothing scanned yet')}</div></div>` +
  `<span class="bf2-go bf2-okb">${ai('check')}${tx('Submit for review')}</span><span class="bf2-tog">${ai('chev')}</span>`;
// The strip opened (scanPanel()): held codes, Undo, another location, My locations.
const tool = (icon, l) => `<span class="bf2-tool">${ai(icon)}<span>${l}</span></span>`;
const panel = ({ held = '', undo = true } = {}) => `<div class="bf2-pan">${held ? `<div class="bf2-pgh">${tx('Held: possible misreads')}</div>${held}` : ''}<div class="bf2-tools">${undo ? tool('undo', tx('Undo last scan')) : ''}${tool('swap', tx('Another location'))}${tool('listcheck', tx('My locations'))}</div></div>`;
// One held code (heldRows() in js/livescan.js): the digit that differs marked, why, and the three choices.
const heldRow = (kc, use) => { const i = [...kc].findIndex((d, k) => d !== use[k]); return `<div class="bf2-held"><div class="bf2-hc"><span class="mono">${kc.slice(0, i)}<mark>${kc[i]}</mark>${kc.slice(i + 1)}</span><span class="bf2-hw">${tx('One digit from {code} on today’s list.', { code: `<b class="mono">${use}</b>` })} ${name(kc)}</span></div>` +
  `<div class="bf2-ha"><span class="bf2-btn bf2-sm bf2-pri bf2-use">${tx('Use {code}', { code: use })}</span><span class="bf2-btn bf2-sm">${tx('It’s right: keep it')}</span><span class="bf2-btn bf2-sm">${tx('Remove it')}</span></div></div>`; };
// Submitted (sentSheet() and timeline()): where the location is now.
function sent(bay, n, { reviewed = null, done = false, next = '7037' } = {}) {
  const r = (cls, t, small, b = '') => `<div class="bf2-tlr ${cls}"><i></i><b>${t}</b>${b}<small>${small}</small></div>`, rev = reviewed != null;
  return `<div class="bf2-ok"><span class="bf2-ck">${ai('check')}</span><div><b>${tx('{bay} submitted for review', { bay: `<span class="mono">${bay}</span>` })}</b><small>${DEPN}<span>${codes(n)} · ${tx('the sheet is free for the floor')}</span></small></div></div>` +
    `<div class="bf2-tl">${r('bf2-tdn', tx('Submitted for review'), `${at(8, 41)} · ${codes(n)}`)}${r(rev ? 'bf2-tdn' : 'bf2-tnow', tx('Reviewed at the desk'), rev ? tx('Reviewed · {acc}%', { acc: reviewed }) : tx('Waiting to be reviewed'))}` +
    r(done ? 'bf2-tdn' : rev ? 'bf2-tnow' : '', tx('Finalise on the PDT'), done ? tx('Submitted ✓') : rev ? tx('Finalise it on the PDT') : tx('After the review'), rev && !done ? btn(tx('Submit'), 'bf2-pri bf2-fin') : '') + '</div>' +
    `<div class="bf2-sacts"><span class="bf2-btn">${tx('Done')}</span><span class="bf2-btn bf2-pri">${next ? `${tx('Start {bay}', { bay: next })}<small>${tx('up next')}</small>` : tx('Scan the next location')}</span></div>`;
}

// ── the live PDT reader (js/livescan.js), full screen over the phone ──
// A PDT row's keycode carries its box: bf2-bw (amber, waiting for a read), bf2-bin (green), bf2-bh (held, red); .bf2-m is the box's mark.
const pdt = (bay, rows) => `<div class="bf2-pdt"><div class="bf2-scr"><div class="bf2-hd">BACKFILL&nbsp;&nbsp;LOC ${bay}</div><div class="bf2-ch"><span>KEYCODE</span><span>DESCRIPTION</span><span>QTY</span></div>` +
  rows.map(([kc, d, q]) => `<div class="bf2-r"><span class="bf2-kc" data-kc="${kc}">${kc}<i class="bf2-m"></i></span><span class="bf2-ds">${d}</span><span class="bf2-q">${q}</span></div>`).join('') + '</div></div>';
const product = () => `<div class="bf2-prod"><div class="bf2-lb"><b>MARBLE RUN 60PC</b><small>KEYCODE 43402871</small>${bars('43402871')}<span class="mono">43402871</span></div></div>`;
const reader = (bay, rows, rep) => `<div class="bf2-ls" hidden><div class="bf2-ltop"><div class="bf2-tt"><b>${tx('Scan · {bay}', { bay })}</b><span class="bf2-lst"><i></i><span class="bf2-say">${tx('Reading · hold the list in the window')}</span></span></div><span class="bf2-ib">${ai('x')}</span></div>` +
  `<div class="bf2-view"><div class="bf2-camv">${pdt(bay, rows)}${product()}</div><div class="bf2-win"><i></i></div>` +
  `<div class="bf2-seg"><span data-mode="pdt" class="bf2-son">${ai('file')}${tx('PDT list')}</span><span data-mode="barcode">${ai('barcode')}${tx('Barcode')}</span></div><span class="bf2-lists">${txn(rep, 'Today’s report · {n} code here', 'Today’s report · {n} codes here')}</span></div>` +
  `<div class="bf2-chips"></div><div class="bf2-rp" hidden></div><div class="bf2-lstrip"><span class="bf2-up">${ai('chev')}</span><span class="bf2-lg"><b>${txn(0, '{n} code in', '{n} codes in')}</b><span>${tx('Hold the PDT’s list in the window')}</span></span><span class="bf2-chk" hidden></span><span class="bf2-done">${tx('Done')}</span></div></div>`;
const box = (c, kc, cls, m) => { const s = `.bf2-ls .bf2-kc[data-kc="${kc}"]`; for (const k of ['bf2-bw', 'bf2-bin', 'bf2-bh']) c.cls(s, k, k === cls); c.text(`${s} .bf2-m`, m); };
const chips = (c, list) => c.html('.bf2-ls .bf2-chips', list.map(kc => `<span>${kc}</span>`).join(''));
const lsStrip = (c, n, read, held = 0) => { c.html('.bf2-ls .bf2-lg', `<b>${txn(n, '{n} code in', '{n} codes in')}</b><span>${txn(read, '{n} read now', '{n} read now')}${held ? ` · ${txn(held, '{n} held', '{n} held')}` : ''}</span>`); c.text('.bf2-ls .bf2-chk', tx('Check {n}', { n: held })); if (held) c.show('.bf2-ls .bf2-chk'); else c.hide('.bf2-ls .bf2-chk'); };
// What was read this time, newest first: [code, why, reads, seconds]; held codes above them.
const readRows = (list, held = '') => `<div class="bf2-rph"><b>${tx('Read this time')}</b><span class="bf2-rate">${tx('One read every {s} s', { s: '0.9' })}</span><span class="bf2-btn bf2-sm bf2-cl">${tx('Close')}</span></div>` +
  (held ? `<div class="bf2-sub">${tx('Held: check each one')}</div>${held}` : '') +
  list.map(([kc, why, n, s]) => `<div class="bf2-rrow"><span class="mono">${kc}</span><span class="bf2-nm">${name(kc)}</span><small>${why}${n ? ` · ${txn(n, '{n} read', '{n} reads')}` : ''} · ${tx('{s} s', { s })}</small></div>`).join('');
const openRead = (c, html) => { c.html('.bf2-ls .bf2-rp', html); c.show('.bf2-ls .bf2-rp'); c.cls('.bf2-ls', 'bf2-open', true); };
const closeRead = async c => { await c.tap('.bf2-ls .bf2-rp .bf2-cl'); c.hide('.bf2-ls .bf2-rp'); c.cls('.bf2-ls', 'bf2-open', false); };

// The phone: the board and the location as two views, the reader over both.
const phone = ({ view = 'board', boardHtml = board(), scanHtml = scan('7036'), strip, bay = '7036', rows = PDT36, rep = REP36.length, open = false } = {}) => {
  let h = phone2('bf2', `<div class="v bf2-v" id="bf2-b">${boardHtml}</div><div class="v bf2-v" id="bf2-s" hidden>${scanHtml}</div><div class="bf2-sh" hidden></div>`,
    { area: 'stockroom', on: 'bfreview', strip: strip ?? upNext('7036', 3), extra: reader(bay, rows, rep) });
  if (view === 'scan') h = h.replace('id="bf2-b"', 'id="bf2-b" hidden').replace('id="bf2-s" hidden', 'id="bf2-s"');
  if (open) h = h.replace('<div class="bf2-ls" hidden>', '<div class="bf2-ls">');
  return h;
};
// A toast at the top of the phone, as the app shows it there: plain, warn (amber) or bad (red).
const say = (c, html, tone = '') => { c.html('.p2 > .dv-toast', html); c.cls('.p2 > .dv-toast', 'bf2-warn', tone === 'warn'); c.cls('.p2 > .dv-toast', 'bf2-bad', tone === 'bad'); c.show('.p2 > .dv-toast'); };
// The sheet over the board, above the strip: white (Submitted) or dark (the strip's panel).
const sheetOn = (c, html, dark = false) => { c.html('.bf2-sh', html); c.cls('.bf2-sh', 'bf2-dark', dark); c.show('.bf2-sh'); };
// The finger leaves the screen when what it tapped has gone (Handbook's still frames).
const off = c => c.cls('.fg', 'show', false);
const typeIn = async (c, kc) => { await c.tap('#bf2-s .bf2-in'); c.cls('#bf2-s .bf2-in', 'bf2-ph', false); await c.type('#bf2-s .bf2-in .bf2-t', kc); await c.tap('#bf2-s .bf2-plus'); c.cls('#bf2-s .bf2-in', 'bf2-ph', true); c.text('#bf2-s .bf2-in .bf2-t', tx('Scan or type a code')); };

// The list as the chapter goes on (newest first).
const L8 = ['43402871', '110148905', '43350142', '43521177', '42977636', '43615502', '43648803'];
const L9 = ['43198853', ...L8], L10 = L9.filter(k => k !== '43350142');
const READ1 = [['110148905', tx('On today’s list'), 1, '0.1'], ['43350142', tx('On today’s list'), 1, '0.1'], ['43521177', tx('On today’s list'), 1, '0.0'], ['43615502', tx('On today’s list'), 1, '0.0'], ['43648803', tx('On today’s list'), 1, '0.0']];
const FIRST = READ1.map(r => r[0]);
const BOARD11 = { ...BOARD, rev: [...BOARD.rev, ['7036', 7, at(8, 41)]], req: ['7037', '7038'] };

// ── the chapter ──────────────────────────────────────────────────────
export const bfscan = {
  id: 'bfscan', grp: 'stockroom', icon: 'barcode', title: tx('Backfill: scan a location'), device: 'phone', where: tx('Phone · Stockroom › Backfill'), for: ['stockroom'],
  intro: S(tx('Start a location, read the PDT’s list into it with the camera, then submit it for review at the desk.'), tx('The phone follows it from there: reviewed, then finalised on the PDT.')),
  html: () => phone(),
  steps: [
    { cap: tx('Backfill opens on today’s board, every location under its stage.'), read: S(tx('In progress, with review, reviewed, requested and finalised, each in its own colour.'), tx('The strip offers the next requested location.')),
      dev: 'The phone board is <b>boardView()</b> in js/views/stockroom/bfreview.js; the groups follow each submission’s status and sentAt.', ev: [],
      run: async c => { await c.wait(900); } },
    { cap: tx('Scan the location label, or type it, then Start.'), read: S(tx('The camera button reads the label.'), tx('Start {bay} in the strip opens the next requested location in one tap.', { bay: '7036' })),
      dev: '<b>startBay()</b> opens the location for the store day: one submission a location a day.', ev: [E('submission.open', 'stockroom', W('7036'), {})],
      run: async c => { await c.tap('#bf2-b .bf2-inp'); c.cls('#bf2-b .bf2-inp', 'bf2-ph', false); await c.type('#bf2-b .bf2-inp .bf2-t', '7036'); await c.tap('#bf2-b .bf2-start'); off(c); c.view('bf2-s'); c.html('#bf2-b', ''); c.html('.p2-strip', scanStrip('7036', 0, '')); } },
    { cap: tx('Tap Scan: the camera reads the PDT’s list.'), read: S(tx('Hold the PDT with the location’s list in the window.'), tx('About once a second the camera reads the screen.'), tx('The pill says how many codes today’s report has for this location.')),
      dev: '<b>readPdt()</b> opens <b>openLiveReader()</b> (js/livescan.js) on the PDT list side of the switch.', ev: [],
      run: async c => { await c.tap('#bf2-s .bf2-scan'); off(c); c.show('.bf2-ls'); } },
    { cap: tx('Codes on today’s report go in on the first read.'), read: S(tx('Each one gets a green box and a beep, and lands on the location straight away.'), tx('A code that isn’t on the report waits in amber for another read.')),
      dev: 'The rules are <b>decide()</b> in shared/livescan.js; each code goes in with its own <b>submission.update</b>, so a wifi drop loses nothing.',
      ev: [E('submission.update', 'stockroom', W('7036'), { codes: { 43648803: true } }, { n: 5 })],
      run: async c => { off(c); await c.wait(700); for (const kc of FIRST) box(c, kc, 'bf2-bin', '✓'); box(c, '42977636', 'bf2-bw', '1/2'); chips(c, FIRST); lsStrip(c, 5, 5); } },
    { cap: tx('Any other code needs a second read, then it goes in too.'), read: S(tx('Two reads for a product the catalogue knows, three for one it doesn’t.'), tx('Today’s report and the location’s regulars go in on one read.')),
      dev: '<b>readsNeeded()</b> in shared/livescan.js: 2, or 3 when the catalogue says no product.', ev: [E('submission.update', 'stockroom', W('7036'), { codes: { 42977636: true } })],
      run: async c => { off(c); await c.wait(900); box(c, '42977636', 'bf2-bin', '✓'); chips(c, ['42977636', ...FIRST]); lsStrip(c, 6, 6); } },
    { cap: tx('Tap the strip: what went in, and why.'), read: S(tx('Every code read this time, newest first, with its product, why it went in and how long it took.'), tx('Close puts the panel away.')),
      dev: 'The panel is <b>panelHtml()</b> in js/livescan.js.', ev: [],
      run: async c => { await c.tap('.bf2-ls .bf2-lg'); openRead(c, readRows([['42977636', tx('Read twice · a product'), 2, '0.9'], ...READ1])); } },
    { cap: tx('Switch to Barcode for one item at a time.'), read: S(tx('The window turns into a strip for one barcode.'), tx('Hold it over the product’s barcode: it goes straight in.')),
      dev: 'Barcode mode is <b>setMode()</b> in js/livescan.js: the phone’s barcode reader, or ZXing where there is none (<b>barcodeReader()</b> in js/scan.js).',
      ev: [E('submission.update', 'stockroom', W('7036'), { codes: { 43402871: true } })],
      run: async c => { await closeRead(c); await c.tap('.bf2-ls [data-mode="barcode"]'); c.cls('.bf2-ls .bf2-seg span', 'bf2-son', false); c.cls('.bf2-ls [data-mode="barcode"]', 'bf2-son', true); c.cls('.bf2-ls', 'bf2-bc', true); c.text('.bf2-ls .bf2-say', tx('Point the camera at the barcode'));
        await c.wait(1100); chips(c, ['43402871', '42977636', ...FIRST]); lsStrip(c, 7, 7); } },
    { cap: tx('Done: the codes are on the location, newest first.'), read: S(tx('The strip counts them and names the last one.'), tx('A product name comes from the catalogue; a warning means it doesn’t know the code.')),
      dev: 'The list is <b>scanView()</b>: the location’s scanned codes in scan order, newest first.', ev: [],
      run: async c => { await c.tap('.bf2-ls .bf2-done'); off(c); c.hide('.bf2-ls'); c.html('#bf2-s', scan('7036', L8)); c.html('.p2-strip', scanStrip('7036', 7, '43402871')); } },
    { cap: tx('A label the camera can’t read? Type the code and tap +.'), read: S(tx('A keycode is 7 to 9 digits.'), tx('A 13-digit item barcode goes in only when its check digit is right.')),
      dev: '<b>scanCode()</b> checks the code with <b>phoneCode()</b> in shared/backfill.js before it is sent.', ev: [E('submission.update', 'stockroom', W('7036'), { codes: { 43198853: true } })],
      run: async c => { await typeIn(c, '43198853'); c.html('#bf2-s', scan('7036', L9)); c.html('.p2-strip', scanStrip('7036', 8, '43198853')); } },
    { cap: tx('Something that isn’t in this location? × takes it off, with Undo.'), read: S(tx('Any code on the list can come off.'), tx('Undo on the message puts it back.')),
      dev: '<b>removeScan()</b> sends the removal; Undo sends the code again.', ev: [E('submission.update', 'stockroom', W('7036'), { remove: ['43350142'] })],
      run: async c => { await c.tap('#bf2-s .bf2-code[data-code="43350142"] .bf2-x'); off(c); c.html('#bf2-s', scan('7036', L10)); c.html('.p2-strip', scanStrip('7036', 7, '43198853')); say(c, `<span>${tx('{code} removed', { code: '43350142' })}</span><u>${tx('Undo')}</u>`); } },
    { cap: tx('Submit for review: the location goes to the desk.'), read: S(tx('The desk sees it at once and compares it with today’s report.'), tx('The sheet follows the location from here, and offers the next requested one.')),
      dev: 'Sent once the location is done: <b>submission.update</b> with sent: true. Stockroom events go to every Stockroom device and to managers.', ev: [E('submission.update', 'stockroom', W('7036'), { sent: true })],
      run: async c => { await c.tap('.p2-strip .bf2-go'); off(c); c.html('#bf2-b', board(BOARD11)); c.view('bf2-b'); c.html('#bf2-s', ''); c.html('.p2-strip', upNext('7037', 2)); sheetOn(c, sent('7036', 7)); } },
    { cap: tx('Reviewed at the desk: finalise it on the PDT, then Submit.'), read: S(tx('The timeline moves on its own when the desk marks the location ready, with its accuracy.'), tx('Finalise the location on the PDT first: Submit here records that it is done.')),
      dev: 'The desk sends <b>submission.ready</b> from Backfill review on a PC; <b>timeline()</b> follows it live.', ev: [E('submission.ready', 'stockroom', W('7036'), { system: REP36 })],
      run: async c => { off(c); await c.wait(1200); c.html('.bf2-sh', sent('7036', 7, { reviewed: 71 })); } },
  ],
  whatif: [[tx('Lost wifi part-way through?'), S(tx('Every scan is kept on the phone and sends when it can.'), tx('Carry on scanning.'))],
    [tx('Submitted it too early?'), S(tx('Tap Resume on the board and scan the rest.'), tx('Submit it again when it is done.'))]],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
// The reader holds a possible misread: on 7037 the PDT's 43702208 is read as 43702209.
const HELD = () => heldRow('43702209', '43702208');
const NOTE = () => `<span class="bf2-note">${ai('alert')}${txn(1, '{n} code was held as a possible misread: tap to check it.', '{n} codes were held as possible misreads: tap to check them.')}</span>`;
bfscan.stories.push({
  id: 'held', title: tx('What if the camera isn’t sure of a code?'), blurb: tx('It holds the code instead of adding it, and asks you to check it.'),
  know: [tx('A code one digit from one already in, or from one on today’s report, is held unless the catalogue knows it: a misread is never a product.'),
    tx('Held codes show red on the camera, and Check opens them.'), tx('Use puts in the code it probably is; It’s right keeps it as read; Remove it leaves it out.'),
    tx('Held codes stay with the location while the app is open: the note under the field and the strip’s panel offer the same three choices.'),
    tx('Submit asks first while a code is still held: a held code is not in the location.')],
  html: () => phone({ view: 'scan', boardHtml: '', scanHtml: scan('7037'), strip: scanStrip('7037', 0, ''), bay: '7037', rows: PDT37, rep: REP37.length, open: true }),
  steps: [
    { cap: tx('A code one digit from one on the report is held, not added.'), read: S(tx('Here the camera read 43702209, but today’s report has 43702208.'), tx('Its box is red and Check counts it.')),
      dev: '<b>decide()</b> returns hold; <b>misreadFix()</b> in shared/livescan.js finds the code it probably is.', ev: [E('submission.update', 'stockroom', W('7037'), { codes: { 43702215: true } }, { n: 2 })],
      run: async c => { await c.wait(800); box(c, '43702215', 'bf2-bin', '✓'); box(c, '43815540', 'bf2-bin', '✓'); box(c, '43702208', 'bf2-bh', '!'); chips(c, ['43815540', '43702215']); lsStrip(c, 2, 2, 1); } },
    { cap: tx('Check shows it: the digit that differs, and three choices.'), read: S(tx('Use 43702208 if that is what the PDT shows.'), tx('Keep it if the code really is 43702209, or remove it.')),
      dev: 'The choices are <b>heldRows()</b> in js/livescan.js, on the camera and behind it.', ev: [],
      run: async c => { await c.tap('.bf2-ls .bf2-chk'); openRead(c, readRows([['43815540', tx('On today’s list'), 1, '0.0'], ['43702215', tx('On today’s list'), 1, '0.0']], HELD())); } },
    { cap: tx('Done anyway? The location says a code is held.'), read: S(tx('The note under the field and the strip both count it.'), tx('Submit asks first while it is held.')),
      dev: 'Held codes are kept per location while the app is open (<b>heldFor()</b> in bfreview.js).', ev: [],
      run: async c => { await closeRead(c); await c.tap('.bf2-ls .bf2-done'); off(c); c.hide('.bf2-ls'); c.html('#bf2-s', scan('7037', ['43815540', '43702215'], { notes: NOTE() })); c.html('.p2-strip', scanStrip('7037', 2, '43815540', 1)); } },
    { cap: tx('Tap the note and Use 43702208: the right code goes in.'), read: S(tx('The panel has the same three choices as the camera.'), tx('The corrected code lands on the location like any other.')),
      dev: '<b>resolveHeld()</b> gives the code to add; it goes in through <b>addRead()</b>.', ev: [E('submission.update', 'stockroom', W('7037'), { codes: { 43702208: true } })],
      run: async c => { await c.tap('#bf2-s .bf2-note'); sheetOn(c, panel({ held: HELD() }), true); c.cls('.p2-strip .bf2-tog', 'bf2-togo', true); await c.wait(500); await c.tap('.bf2-sh .bf2-use'); off(c);
        c.html('#bf2-s', scan('7037', ['43702208', '43815540', '43702215'])); c.html('.p2-strip', scanStrip('7037', 3, '43702208')); c.html('.bf2-sh', panel()); c.cls('.p2-strip .bf2-tog', 'bf2-togo', true); } },
  ],
});
// Typed codes on 7038: one digit apart, then one of the wrong length.
const H38 = () => ({ 42977686: tx('One digit from {other}, which is in the catalogue: probably the right one', { other: '42977636' }), 42977636: tx('One digit from {other}; this one is in the catalogue', { other: '42977686' }) });
bfscan.stories.push({
  id: 'twin', title: tx('What if two codes are one digit apart?'), blurb: tx('Both are flagged so you can check the shelf; a code of the wrong length never goes in.'),
  know: [tx('Two codes of the same length one digit apart are probably one product misread or mistyped.'), tx('Both rows turn amber, and the hint says which one the catalogue knows: that one is probably right.'),
    tx('Both real? Leave both: the flag is a question, not an error.'), tx('A keycode is 7 to 9 digits and a 13-digit item barcode needs a good check digit; anything else is refused with the reason.'),
    tx('The camera’s reader holds a code like this instead of adding it.')],
  html: () => phone({ view: 'scan', boardHtml: '', scanHtml: scan('7038', ['43402871', '42977636'], { fresh: false }), strip: scanStrip('7038', 2, '43402871') }),
  steps: [
    { cap: tx('Type a code one digit from another: both are flagged.'), read: S(tx('42977686 is one digit from 42977636, already here.'), tx('Check which one is on the shelf.')),
      dev: '<b>disputes()</b> in shared/backfill.js finds the pair; <b>disputeHint()</b> asks the catalogue which one it knows.', ev: [E('submission.update', 'stockroom', W('7038'), { codes: { 42977686: true } })],
      run: async c => { await typeIn(c, '42977686'); c.html('#bf2-s', scan('7038', ['42977686', '43402871', '42977636'], { hints: H38(), notes: `<span class="bf2-note bf2-sn">${ai('alert')}${tx('Two codes are one digit apart: check which is on the shelf and remove the other.')}</span>` }));
        c.html('.p2-strip', scanStrip('7038', 3, '42977686')); say(c, tx('{code} is one digit from {other}: check which is on the shelf', { code: '42977686', other: '42977636' }), 'warn'); } },
    { cap: tx('The wrong one? × takes it off.'), read: S(tx('The flag goes with it.'), tx('Undo on the message puts it back.')),
      dev: '<b>removeScan()</b>: the removal is one <b>submission.update</b>.', ev: [E('submission.update', 'stockroom', W('7038'), { remove: ['42977686'] })],
      run: async c => { await c.tap('#bf2-s .bf2-code[data-code="42977686"] .bf2-x'); off(c); c.html('#bf2-s', scan('7038', ['43402871', '42977636'], { fresh: false })); c.html('.p2-strip', scanStrip('7038', 2, '')); say(c, `<span>${tx('{code} removed', { code: '42977686' })}</span><u>${tx('Undo')}</u>`); } },
    { cap: tx('A code of the wrong length never goes in.'), read: S(tx('It says why: a keycode is 7 to 9 digits, an item barcode 13.'), tx('Nothing is sent.')),
      dev: '<b>phoneCode()</b> refuses it and <b>whyText()</b> says why, in the phone’s language.', ev: [],
      run: async c => { await typeIn(c, '4297763612'); say(c, tx('{code} is {n} digits: a keycode is 7 to 9, an item barcode 13', { code: '4297763612', n: 10 }), 'bad'); } },
  ],
});
// The desk reviewed 7036 while the phone was on another location.
const BOARD_C = { ...BOARD, fin: [['7024', 75], ['7036', 71]], req: ['7037', '7038'] };
const remind = () => `<div class="bf2-rem"><b>${tx('Ready to finalise')}</b><span>${tx('These locations you submitted have been reviewed and are ready to finalise on the PDT.')}</span><div class="bf2-rr"><b>7036</b><span>${tx('today')}</span>${btn(tx('Submit'), 'bf2-pri bf2-fin')}</div><span class="bf2-btn bf2-sm">${tx('Got it')}</span></div>`;
bfscan.stories.push({
  id: 'finalise', title: tx('What if the desk reviews it after you’ve moved on?'), blurb: tx('Backfill reminds you once, and Mine counts it: finalise it on the PDT, then tap Submit.'),
  know: [tx('The desk’s review reaches the phone live: the Submit sheet’s timeline moves to Reviewed, with the accuracy.'), tx('Ready to finalise pops up once a session when a location this phone sent has been reviewed. Got it puts it away.'),
    tx('Mine counts the locations ready to finalise; My locations lists everything this phone sent in the last two days.'), tx('Tap Submit only after the location is finalised on the PDT: it moves to Finalised today.'),
    tx('Stock found after it was finalised? Re-add on My locations tags it to scan back in.')],
  html: () => phone({ boardHtml: remind() + board(BOARD_C, 1), scanHtml: '', strip: upNext('7037', 2) }),
  steps: [
    { cap: tx('Back on the board, Ready to finalise lists it.'), read: S(tx('7036 has been reviewed at the desk.'), tx('Mine shows one location ready, and the board has it in purple.')),
      dev: '<b>finaliseReminder()</b> in bfreview.js: once a session, from <b>myLocations()</b>.', ev: [], run: async c => { await c.wait(900); } },
    { cap: tx('Finalise it on the PDT, then tap Submit.'), read: S(tx('The phone asks to be sure: it records that the PDT is done.'), tx('Cancel if the PDT isn’t finalised yet.')),
      dev: 'A plain confirm before <b>submission.submit</b>.', ev: [],
      run: async c => { await c.tap('#bf2-b .bf2-rem .bf2-fin'); c.html('.p2-sheet', `<div class="bf2-cf"><p>${tx('Mark "{bay}" as submitted on the PDT?', { bay: '7036' })}</p><div><span>${tx('Cancel')}</span><span class="bf2-okc">${tx('dialog button::OK')}</span></div></div>`); c.cls('.p2-sheet', 'bf2-cfs', true); c.show('.p2-dim'); c.show('.p2-sheet'); } },
    { cap: tx('OK: it’s finalised, and the board counts it.'), read: S(tx('7036 moves to Finalised today.'), tx('Mine has nothing left to finalise.')),
      dev: '<b>submission.submit</b> moves the location to submitted; the desk’s Submitted today counts it too.', ev: [E('submission.submit', 'stockroom', W('7036'), {})],
      run: async c => { await c.tap('.p2-sheet .bf2-okc'); off(c); c.hide('.p2-dim'); c.hide('.p2-sheet'); c.html('#bf2-b', board({ ...BOARD_C, fin: [['7024', 75]], done: 2 }, 0)); say(c, tx('{bay} completed', { bay: '7036' })); } },
  ],
});
