// Chapter: Live pull, the floor and the stockroom on two phones, as the app
// has it today (js/views/livepull.js: the sessions, Start a session, the
// requester's scan box, answer card and pad, the "Barcodes being looked up"
// tray, the puller's bays and list, the strip and its sheet, the cage; the
// worker's pullFind in worker/store.js; shared/reducers/pull.js). Three What
// ifs play on the same two phones.
// The day: Busselton 1241, C4 Cosmetics & Accessories, stockroom bays
// 7040–7059 (Settings › Departments). The floor phone scans a clearance
// shelf talker: its barcode is the item's own (EAN-13), its keycode is
// printed at the left. Every class here starts lp2- (draft/css/livepull.css).
import { tx, txn } from '../../i18n.js';
import { dep, fmtDay, DEPTS_DEFAULT, DEPT_NAME } from '../../ui.js';
import { ai, phone2 } from '../frames.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const R = (method, path, body, note) => ({ route: `${method} ${path}`, method, path, body, note });
const ULID = '01JBQ8…', SES = { session: ULID }, LINE = { session: ULID, line: ULID };

// ── the store's data (as the reports and tickets print it) ─────────────
const NAME = 'Cosmetics', DEPT = 'c4', ZONE = '7040-7059', SINCE = '10:36';
// Items: keycode, barcode, the description from the store's reports (two lines on the talker), the bay on today's report.
const POTS = { kc: '43577460', apn: '9341111236423', d: ['OXX BODYCARE', 'TRVL RIBBED POTS 20ML 2PK'], bay: '7041', price: ['50', 'c'] };
const BRUSH = { kc: '43577453', apn: '9341111236454', d: ['OXX COSMETICS', 'MAKEUP BRUSH SET 5PC'], bay: '7052', price: ['$3', ''] };
const BALM = { kc: '43577422', apn: '9341111236416', d: ['OXX COSMETICS', 'LIP BALM 3PK'], bay: '7048', price: ['$1', ''] };
const SPONGE = { kc: '43577477', d: ['OXX BODYCARE', 'LOOFAH SPONGE PINK'], seen: { bay: '7046', date: '2026-10-22', via: 'backfill' } };
const desc = it => it.d.join(' ');

// ── a shelf talker, drawn from a real one: its barcode is the item's own
// (EAN-13, drawn for real), its keycode is printed at the left ────────
const LC = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const RC = LC.map(s => [...s].map(b => (b === '1' ? '0' : '1')).join('')), GC = RC.map(s => [...s].reverse().join(''));
const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13(code) {
  const d = [...code].map(Number), p = PAR[d[0]];
  const bits = '101' + d.slice(1, 7).map((n, i) => (p[i] === 'L' ? LC : GC)[n]).join('') + '01010' + d.slice(7).map(n => RC[n]).join('') + '101';
  let r = '';
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') { const guard = i < 3 || (i >= 45 && i < 50) || i >= 92; r += `<rect x="${i}" width="1" height="${guard ? 30 : 27}"/>`; }
  return `<svg viewBox="0 0 95 30" preserveAspectRatio="none" aria-hidden="true"><g fill="#111">${r}</g></svg>`;
}
const talker = it => `<div class="lp2-tk"><div class="lp2-tky"><span class="lp2-tkc">clearance</span><span class="lp2-tkr"><small>NOW</small><b>${it.price[0]}${it.price[1] ? `<sup>${it.price[1]}</sup>` : ''}</b></span><span class="lp2-tkl">layby not available on<br>clearance merchandise.</span></div>` +
  `<div class="lp2-tkw"><div class="lp2-tkd">${it.d[0]}<br>${it.d[1]}</div><div class="lp2-tkm">MULTI</div>` +
  `<div class="lp2-tkb"><div class="lp2-tkk"><span>${it.kc}</span><span>D35</span></div><div class="lp2-tkbc"><span>${it.apn}</span>${ean13(it.apn)}</div></div></div></div>`;
// The camera (openScanner() in js/scan.js, as Live pull opens it), full screen over the floor phone.
const camera = () => `<div class="cam2 lp2-cam2" hidden><div class="cam2-top"><b>${tx('Scan an item')}</b><span>${ai('bolt')}</span><span data-camx>${ai('x')}</span></div>` +
  `<div class="cam2-v lp2-camv"><i class="lp2-wire"></i><div class="lp2-tkw0"></div><div class="cam2-aim"></div><div class="cam2-hint">${tx('The item, its ticket, or the keycode')}</div></div>` +
  `<div class="cam2-f"><span>${tx('Or type the code')}</span><span>${ai('arrow')}</span></div><div class="cam2-t"></div></div>`;

// ── the pieces both phones use ─────────────────────────────────────────
const D = () => dep(DEPT);
const btn = (label, cls = '', icon = '', attr = '') => `<span class="lp2-btn${cls ? ' ' + cls : ''}"${attr ? ' ' + attr : ''}>${icon ? ai(icon) : ''}${label}</span>`;
const big = (icon, label, attr = '') => `<span class="lp2-big"${attr ? ' ' + attr : ''}>${ai(icon)}${label}</span>`;
const head = (title, sub) => `<div class="lp2-head"><h2>${title}</h2><span>${sub}</span></div>`;
const top = sub => `<div class="lp2-top">${D()}<div><b>${NAME}</b><span><i class="lp2-live"></i>${sub}</span></div></div>`;
const bay = (b, more = [], sm = false) => `<span class="lp2-bay${sm ? ' sm' : ''}"><small>${more.length ? tx('BAYS') : tx('BAY')}</small><b class="mono">${b}</b>${more.length ? `<small class="mono">+ ${more.join(', ')}</small>` : ''}</span>`;
const people = (req, pull) => [txn(req, '{n} requester', '{n} requesters'), txn(pull, '{n} puller', '{n} pullers')].join(' · ');
const counts = (asked, pulled, waiting) => [txn(asked, '{n} asked', '{n} asked'), tx('{n} pulled', { n: pulled }), waiting ? tx('{n} waiting', { n: waiting }) : ''].filter(Boolean).join(' · ');
// The strip above the tabs, and its toggle (open: the chevron points down).
const strip = (icon, title, s, n = '', open = false) => `<div class="lp2-strip"><div class="lp2-st">${ai(icon)}<b>${title}</b><span class="s">${s}</span>${n ? `<span class="n">${n}</span>` : ''}</div><span class="lp2-tog${open ? ' open' : ''}">${ai('chev')}</span></div>`;
const stripA = (asked, pulled, waiting, open) => strip('listcheck', NAME, counts(asked, pulled, waiting), waiting || '', open);
const stripB = (cage, done, all, todo, open) => strip('box', ZONE, tx('cage {n} · {done} of {all} marked off', { n: cage, done, all }), todo || '', open);
// The strip's sheet (sx in js/map.js), dark, above the strip.
const sxRow = (icon, title, sub, v, tone) => `<div class="lp2-sxr">${ai(icon)}<div class="k"><b>${title}</b><span>${sub}</span></div><span class="v ${tone}">${v}</span></div>`;
const sxSec = (label, body, note = '') => `<div class="lp2-sxs"><div class="lp2-sxl">${label}${note ? `<span>${note}</span>` : ''}</div>${body}</div>`;
const sxBtn = (icon, label, pri = false, attr = '') => `<span class="lp2-sxb${pri ? ' pri' : ''}"${attr ? ' ' + attr : ''}>${ai(icon)}${label}</span>`;
const sheetOf = html => `<div class="lp2-sx">${html}</div>`;

// ── Live pull home (both phones) ───────────────────────────────────────
function home(running) {
  const ses = running ? `<div class="lp2-card"><span class="lp2-lbl">${txn(1, 'Running now · {n}', 'Running now · {n}')}</span><div class="lp2-ses"><div class="lp2-sr">${D()}<b>${NAME}</b></div>` +
    `<span class="lp2-dim">${people(1, 0)} · ${tx('since {time}', { time: SINCE })}</span><span class="lp2-dim">${counts(0, 0, 0)}</span><span class="lp2-bar"><i></i></span>` +
    `<div class="lp2-acts">${btn(tx('Ask for stock'), 'sm pri', 'barcode')}${btn(tx('Pull stock'), 'sm', 'box', 'data-x="pull"')}</div></div></div>`
    : `<div class="lp2-card"><b class="lp2-ct">${tx('No session is running')}</b><p class="lp2-dim">${tx('Start one for your department: one person scans on the floor, the others pull in the stockroom.')}</p></div>`;
  return head(tx('Live pull'), tx('Ask the stockroom for stock from the floor')) + ses + big('plus', tx('Start a session'), 'data-x="new"') +
    `<p class="lp2-dim">${tx('Each session keeps its own list, so two departments can work at the same time.')}</p>`;
}
// Start a session (newForm()): the name, the department, the part.
const field = (text, ph) => `<span class="lp2-in${text ? '' : ' lp2-ph'}"><span class="lp2-t">${text || ph}</span></span>`;
function form(name = '', dept = '') {
  const coded = DEPTS_DEFAULT.filter(d => ['home', 'clothing', 'kids'].includes(d.group));
  return head(tx('Start a session'), tx('Live pull · listed for 7 days')) +
    `<div class="lp2-card"><span class="lp2-fl">${tx('Session name')}</span><span class="lp2-name">${field(name, tx('Toys, aisles 16 to 18'))}</span>` +
    `<span class="lp2-fl">${tx('Department')}</span><div class="lp2-depts">${coded.map(d => `<span class="lp2-dept${dept === d.id ? ' on' : ''}" data-dept="${d.id}">${dep(d.id)}${d.name}</span>`).join('')}</div>` +
    `<span class="lp2-fl">${tx('Your part')}</span><div class="lp2-seg"><span class="on">${tx('Requester')}</span><span>${ai('lock')}${tx('Puller')}</span></div>` +
    `<p class="lp2-dim">${tx('Scan on the floor and send what’s needed. Requests come from this phone.')}</p>` +
    `<span class="lp2-switch"><span><b>${tx('Scan floor shelves too')}</b><small>${tx('Optional. Off: just scan items across the department. On: the cage comes down in shelf order.')}</small></span><i></i></span></div>` +
    big('check', tx('Start session'), 'data-x="start"') + `<span class="lp2-ghost">${tx('Cancel')}</span>`;
}

// ── The floor phone: the requester (requester()) ──────────────────────
// What shows under the scan box: the tray, then the answer (or the hint, or what was sent).
const scanBox = typed => `<div class="lp2-scan"><span class="lp2-in mono lp2-code${typed ? '' : ' lp2-ph'}"><span class="lp2-t">${typed || tx('Scan or type a keycode')}</span></span><span class="lp2-cam">${ai('camera')}</span></div>`;
const hint = () => `<div class="lp2-card lp2-hint">${ai('barcode')}<p>${tx('Scan an item, its ticket, or type the keycode. Only items with a stockroom location can be asked for.')}</p></div>`;
// The answer (productRow()): the words, the keycode, how it was found; the bay.
function prod(it, { from = '', wrong = false, bays = true } = {}) {
  return `<div class="lp2-card lp2-prod"><span class="lp2-pic">${ai('box')}</span><span class="lp2-pn"><b>${desc(it)}</b><small class="mono">${it.kc}</small>` +
    (from ? `<small class="lp2-from">${from}${wrong ? ` · <u class="lp2-a">${tx('Wrong item?')}</u>` : ''}</small>` : '') + `</span>${bays && it.bay ? bay(it.bay) : ''}</div>`;
}
const FOUND = () => tx('found from the barcode');
function pad(qty = '', change = false) {
  return `<div class="lp2-qty"><span class="lp2-lbl">${change ? tx('Change to') : tx('How many?')}</span><b class="lp2-n${qty ? '' : ' blank'}">${qty || '–'}</b></div>` +
    `<div class="lp2-padx"><span>${tx('All there is')}</span></div>` +
    `<div class="lp2-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<span data-k="${k}">${k}</span>`).join('')}<span>⌫</span><span data-k="0">0</span><span class="send${qty ? '' : ' off'}">${change ? tx('Change') : tx('Send')}</span></div>`;
}
const sent = (it, qty, change = false) => `<div class="lp2-sent">${ai('check')}<span><b>${change ? tx('Changed: {name} × {qty}', { name: desc(it), qty }) : tx('Sent: {name} × {qty}', { name: desc(it), qty })}</b><small>${tx('On the pullers’ phones now. Scan the next item.')}</small></span></div>`;
const dup = (qty, time) => `<div class="lp2-ans warn">${ai('listcheck')}<span><b>${tx('Already asked for')}</b>${tx('{qty} at {time} in this session. It’s still waiting in the stockroom.', { qty, time })}</span></div>` +
  `<div class="lp2-acts">${btn(tx('Add {n} more', { n: qty }), 'pri', 'plus')}${btn(tx('Change to…'), '', '', 'data-x="change"')}${btn(tx('Leave it'))}</div>`;
// Not on today's report, but seen lately (seenCard()): where, and the two choices until one is made.
const SEEN = () => tx('backfilled {date}', { date: fmtDay(SPONGE.seen.date) });
const seenCard = ok => `<div class="lp2-ans warn">${ai('alert')}<span><b>${tx('Not on today’s report, but seen lately')}</b>${tx('It may not have been scanned in. Ask for it where it was seen and the stockroom checks there.')}</span></div>` +
  `<ul class="lp2-seen"><li>${bay(SPONGE.seen.bay, [], true)}<span>${SEEN()}</span></li></ul>` +
  (ok ? '' : `<div class="lp2-acts">${btn(tx('Skip it'))}${btn(tx('Ask for it there'), 'pri', '', 'data-x="seen-ok"')}</div>`);
// The tray (behindTray()): each barcode searched on kmart.com.au while the requester scans on.
const trayRow = (gtin, state) => `<div class="lp2-bgr">` + (state === 'searching'
  ? `<span class="lp2-pic sm">${ai('search')}</span><span class="lp2-pn"><span class="lp2-bgs">${tx('Searching kmart.com.au…')}</span><small class="mono">${tx('Barcode {code}', { code: gtin })}</small></span>`
  : `<span class="lp2-pic sm">${ai('barcode')}</span><span class="lp2-pn"><b>${tx('Not found on kmart.com.au')}</b><small>${tx('Type its keycode in the box above, from the ticket, shelf label or carton.')}</small><small class="mono">${tx('Barcode {code}', { code: gtin })}</small></span>${btn(tx('Type it'), 'sm', '', 'data-x="type"')}`) +
  `<span class="lp2-ib">${ai('x')}</span></div>`;
const tray = (gtin, state) => `<div class="lp2-card lp2-bg"><div class="lp2-bgh">${ai('search')}<b>${tx('Barcodes being looked up')}</b><small>${tx('Keep scanning: each one lands here when kmart.com.au answers.')}</small></div>${trayRow(gtin, state)}</div>`;
// Nothing found: the keycode goes in the scan box (barcodeCard() in js/barcodesearch.js).
const manual = gtin => `<div class="lp2-ans warn">${ai('barcode')}<span><b>${tx('Not found on kmart.com.au')}</b>${tx('Type its keycode in the box above, from the ticket, shelf label or carton.')}</span></div><p class="lp2-gtin">${tx('Barcode {code}', { code: gtin })}</p>`;
// The requester's screen: the header, the scan box, then what's under it.
const req = (under = hint(), { pullers = 1, typed = '' } = {}) => top(pullers ? txn(pullers, '{n} puller in the stockroom', '{n} pullers in the stockroom') : tx('No puller has joined yet')) + scanBox(typed) + under;
// The requester's sheet: what this session asked for, newest first.
const sheetA = rows => sheetOf(`<div class="lp2-sxh">${ai('listcheck')}${NAME}</div><p class="lp2-sxp">${[people(1, 1), tx('since {time}', { time: SINCE }), tx('shelf scan off')].join(' · ')}</p>` +
  sxSec(tx('Requests'), `<div class="lp2-sxrs">${rows.join('')}</div>`, tx('newest first')) +
  `<div class="lp2-sxa">${sxBtn('x', tx('Leave session'))}${sxBtn('check', tx('End session'))}</div>`);
const reqRow = (it, qty, time, state, tone) => sxRow('box', `${desc(it)} · ${qty}`, `<span class="mono">${it.kc}</span> · ${tx('bay {bay}', { bay: it.bay || it.seen?.bay })} · ${time}`, state, tone);

// ── The stockroom phone: the puller (zones(), puller(), cage()) ───────
const RANGES = () => [['c4', 7040, 7059], ['h1', 7000, 7019], ['k2', 7020, 7039]];
const opt = (key, label, sub, on) => `<span class="lp2-opt${on ? ' on' : ''}" data-z="${key}"><i></i><span><b>${label}</b><small>${sub}</small></span></span>`;
const sw = (title, sub, on) => `<span class="lp2-switch${on ? ' on' : ''}"><span><b>${title}</b><small>${sub}</small></span><i></i></span>`;
function zones(on = false) {
  return head(tx('Your bays'), `${D()} ${NAME} · ${tx('puller')}`) +
    `<div class="lp2-card"><span class="lp2-lbl">${tx('Which bays does this phone pull?')}</span>` +
    RANGES().map(([d, a, b]) => opt(`${a}-${b}`, `${d.toUpperCase()} ${DEPT_NAME[d] || ''} · ${a}–${b}`, tx('No one else yet'), on && d === DEPT)).join('') +
    opt('all', tx('Every bay'), tx('See every request, whoever has the bay'), false) +
    `<div class="lp2-range">${field('', tx('From'))}<span>–</span>${field('', tx('To'))}${btn(tx('Add'), 'sm', 'plus')}</div>` +
    `<p class="lp2-dim">${tx('Ranges come from Settings › Departments. Bays that no puller has picked show on every puller’s phone, so nothing is missed.')}</p></div>` +
    `<div class="lp2-card"><span class="lp2-lbl">${tx('Alerts on this phone')}</span>${sw(tx('Buzz when a request comes in'), tx('Only for your bays. Costs no extra battery: the phone already keeps the session open.'), true)}${sw(tx('Play a sound too'), tx('For phones that can’t buzz from a web app, like iPhones.'), false)}</div>` +
    big('check', tx('Start pulling · {bays}', { bays: on ? '7040–7059' : tx('every bay') }), 'data-x="go"') + `<span class="lp2-ghost">${tx('Back')}</span>`;
}
// One request on the puller's list: its bay, the words, when and the keycode, how many; the three marks, or what it was marked.
function line(it, qty, time, { fresh = false, done = '', seen = '', cage = 0 } = {}) {
  return `<div class="lp2-ln${done ? ' done' : ''}${fresh ? ' fresh' : ''}" data-kc="${it.kc}"><div class="lp2-lt">${bay(it.bay || it.seen?.bay, [], true)}<span class="lp2-pn"><b>${desc(it)}</b><small>${time} · <span class="mono">${it.kc}</span></small></span><span class="lp2-q"><b>${qty}</b></span></div>` +
    (seen ? `<div class="lp2-also"><span class="lp2-sug">${tx('SUGGESTED')}</span> <small class="lp2-sugw">${seen}</small></div>` : '') +
    (done ? `<div class="lp2-acts"><span class="lp2-pill ok">${done}</span>${cage ? `<span class="lp2-dim">${tx('cage {n}', { n: cage })}</span>` : btn(tx('Undo'), 'sm')}</div>`
      : `<div class="lp2-acts">${btn(tx('Pulled {n}', { n: qty }), 'sm pri lp2-ok', 'check', 'data-x="pulled"')}${btn(tx('Short'), 'sm')}${btn(tx('Not there'), 'sm lp2-no')}</div>`) + '</div>';
}
function puller(lines = [], { tab = 'todo', todo = 0, done = 0, order = 'time' } = {}) {
  const t = (id, label) => `<span class="${tab === id ? 'on' : ''}" data-tab="${id}">${label}</span>`;
  return top(tx('Your bays: {bays}', { bays: ZONE })) +
    `<div class="lp2-tabs">${t('todo', tx('To pull {n}', { n: todo }))}${t('done', tx('Marked off {n}', { n: done }))}${t('all', tx('All {n}', { n: todo + done }))}</div>` +
    `<div class="lp2-seg"><span${order === 'time' ? ' class="on"' : ''}>${tx('As they come in')}</span><span${order === 'bay' ? ' class="on"' : ''}>${tx('By bay')}</span></div>` +
    (lines.length ? lines.join('') : `<p class="lp2-dim lp2-empty">${tab === 'todo' ? tx('Nothing to pull in your bays. New requests buzz this phone.') : tx('Nothing here yet.')}</p>`);
}
// The puller's sheet: the cage being filled, the pullers and their bays, and Send cage down.
const sheetB = () => sheetOf(`<div class="lp2-sxh">${ai('box')}${ZONE}<span class="n">${tx('{n} to pull', { n: 0 })}</span></div><p class="lp2-sxp">${tx('This phone')} · ${NAME} · ${tx('buzz on')}</p>` +
  sxSec(tx('Cage {n}', { n: 1 }), '<span class="lp2-sxbar"><i style="width:100%"></i></span>', tx('{done} of {all} marked off', { done: 1, all: 1 })) +
  sxSec(tx('Pullers'), `<div class="lp2-sxrs">${sxRow('phone', tx('This phone'), ZONE, tx('All marked off'), 'ok')}</div>`, tx('the bays each phone covers')) +
  `<div class="lp2-sxa">${sxBtn('cage', tx('Send cage {n} down', { n: 1 }), true, 'data-x="cage"')}${sxBtn('pin', tx('Change my bays'))}${sxBtn('phone', tx('Buzz: on'))}${sxBtn('x', tx('Leave session'))}</div>`);
// The cage (cage()): what goes down, in the order asked, and the tag.
const cage = () => head(tx('Send cage {n} down', { n: 1 }), `${D()} ${NAME}`) +
  `<div class="lp2-sum"><div><b>1</b><span>${tx('lines')}</span></div><div><b>6</b><span>${tx('units')}</span></div><div><b>0</b><span>${tx('short')}</span></div></div>` +
  `<div class="lp2-card"><span class="lp2-lbl">${tx('In the cage, in the order asked')}</span><div class="lp2-cr"><span><b>${desc(POTS)}</b><small>${tx('bay {bay}', { bay: POTS.bay })}</small></span><b class="mono">× 6</b></div></div>` +
  `<span class="lp2-fl">${tx('Cage tag (optional)')}</span><div class="lp2-scan"><span class="lp2-in mono lp2-ph"><span class="lp2-t">BSN1240417</span></span><span class="lp2-cam">${ai('camera')}</span></div>` +
  big('cage', tx('Send cage {n} down', { n: 1 }), 'data-x="send"') + `<span class="lp2-ghost">${tx('Back')}</span>`;

// ── the two phones ─────────────────────────────────────────────────────
const phoneA = (body, s = '') => phone2('lpa', `<div class="lp2">${body}</div>`, { area: 'floor', on: '', strip: s, extra: camera() });
const phoneB = (body, s = '') => phone2('lpb', `<div class="lp2">${body}</div>`, { area: 'stockroom', on: '', strip: s });
const duo = (a, b) => `<div class="duo lp2-duo"><div class="duo-l"><span>${tx('Floor')}</span>${a}</div><div class="duo-l"><span>${tx('Stockroom')}</span>${b}</div></div>`;
// Step helpers: a phone's screen, its strip (none hides it), its sheet.
const A = (c, html) => c.html('#lpa .lp2', html), B = (c, html) => c.html('#lpb .lp2', html);
const stripTo = (c, ph, html) => { if (html) { c.html(`#${ph} .p2-strip`, html); c.show(`#${ph} .p2-strip`); } else c.hide(`#${ph} .p2-strip`); };
const off = c => c.cls('.fg', 'show', false);
// The camera reads a talker: it opens, the aim turns green, it closes.
async function scanTalker(c, it) {
  await c.tap('#lpa .lp2-scan .lp2-cam'); off(c);
  c.html('#lpa .lp2-tkw0', talker(it)); c.cls('#lpa .cam2', 'hit', false); c.show('#lpa .cam2');
  await c.wait(1100); c.cls('#lpa .cam2', 'hit', true); await c.wait(450);
}
const camOff = c => { c.hide('#lpa .cam2'); c.cls('#lpa .cam2', 'hit', false); };
// Type a code in the scan box (a keyboard's Enter, or a wedge scanner), then the answer.
async function typeCode(c, code) { await c.tap('#lpa .lp2-code'); c.cls('#lpa .lp2-code', 'lp2-ph', false); await c.type('#lpa .lp2-code .lp2-t', code); await c.wait(300); }
async function key(c, k) { await c.tap(`#lpa .lp2-pad [data-k="${k}"]`); }
const buzz = c => c.buzz('#lpb');
const toastB = (c, t) => { c.html('#lpb .dv-toast', t); c.show('#lpb .dv-toast'); };

// States the What ifs start from: both phones in the session, nothing asked yet; or the pots asked for and waiting.
const READY = () => duo(phoneA(req(), stripA(0, 0, 0)), phoneB(puller(), stripB(1, 0, 0, 0)));
const WAITING = () => duo(phoneA(req(sent(POTS, 6)), stripA(1, 0, 1)), phoneB(puller([line(POTS, 6, '10:42')], { todo: 1 }), stripB(1, 0, 1, 1)));

// ── the chapter ────────────────────────────────────────────────────────
export const livepull = {
  id: 'pull', grp: 'stockroom', icon: 'pkg', title: tx('Live pull: floor and stockroom'), device: 'duo', where: tx('Phone · More › Live pull'), for: ['floor', 'stockroom'],
  intro: S(tx('One person scans on the floor and sends how many.'), tx('The stockroom’s phones buzz and pull it straight away.')),
  html: () => duo(phoneA(home(false)), phoneB(home(false))),
  steps: [
    { cap: tx('Start a session: name it and pick the department.'), read: S(tx('Live pull is in More, on the Floor and in the Stockroom.'), tx('Your part is Requester: this phone scans on the floor.')),
      dev: 'Start a session is <b>newForm()</b> in js/views/livepull.js; nothing is sent until Start session.', ev: [],
      run: async c => { off(c); await c.tap('#lpa [data-x="new"]'); off(c); A(c, form()); await c.tap('#lpa .lp2-name .lp2-in'); c.cls('#lpa .lp2-name .lp2-in', 'lp2-ph', false); await c.type('#lpa .lp2-name .lp2-t', NAME);
        await c.tap(`#lpa .lp2-dept[data-dept="${DEPT}"]`); A(c, form(NAME, DEPT)); } },
    { cap: tx('Start session: the floor phone is ready to scan.'), read: S(tx('The strip at the bottom counts what was asked for and pulled.'), tx('Every phone of the store lists the session, so the stockroom can join.')),
      dev: 'The session is a Floor event, so every phone holds it; part req makes this phone the requester.', ev: [E('pull.session.start', 'floor', SES, { name: NAME, dept: DEPT, part: 'req', shelves: false })],
      run: async c => { off(c); await c.tap('#lpa [data-x="start"]'); off(c); A(c, req(hint(), { pullers: 0 })); stripTo(c, 'lpa', stripA(0, 0, 0)); B(c, home(true)); } },
    { cap: tx('In the stockroom, Pull stock, then pick this phone’s bays.'), read: S(tx('A puller needs the Stockroom or manager code.'), tx('Pick the department’s range, type one, or take every bay.')),
      dev: 'The bays screen is <b>zones()</b>; the ranges come from the store’s department ranges (js/views/stockroom/depts.js).', ev: [],
      run: async c => { off(c); await c.tap('#lpb [data-x="pull"]'); off(c); B(c, zones(false)); await c.tap('#lpb .lp2-opt[data-z="7040-7059"]'); B(c, zones(true)); } },
    { cap: tx('Start pulling: requests for those bays come to this phone.'), read: S(tx('Only phones whose bays hold the item buzz.'), tx('Bays no puller picked show on every puller’s phone.')),
      dev: '<b>pull.zone.set</b> joins the session as a puller with its bays; the floor phone counts the pullers.', ev: [E('pull.zone.set', 'floor', SES, { bays: [ZONE] })],
      run: async c => { off(c); await c.tap('#lpb [data-x="go"]'); off(c); B(c, puller()); stripTo(c, 'lpb', stripB(1, 0, 0, 0)); A(c, req()); } },
    { cap: tx('Scan the item, or the barcode on its shelf talker.'), read: S(tx('A shelf talker’s barcode is the item’s own barcode.'), tx('Its keycode is printed at the left: {kc} here.', { kc: POTS.kc })),
      dev: 'The camera is <b>openScanner()</b> (js/scan.js); <b>find()</b> asks the worker about the code it reads.', ev: [R('GET', `/v1/store/1241/pull/find?code=${POTS.apn}`, null, 'The item and its bays, found by its barcode.')],
      run: async c => { off(c); await scanTalker(c, POTS); } },
    { cap: tx('The answer comes at once: the item and its bay.'), read: S(tx('Its product name, or the description from the store’s reports, with the stockroom bay on today’s report.'), tx('Found from the barcode says how the scan was matched.')),
      dev: 'The worker’s <b>pullFind()</b> (worker/store.js) answers from the latest inventory report: the keycode from the report’s APN, the product name and description, the bays, the carton size and any truck today.', ev: [],
      run: async c => { off(c); camOff(c); A(c, req(prod(POTS, { from: FOUND() }) + pad())); } },
    { cap: tx('Type how many, then Send.'), read: S(tx('Type a number, add a carton at a time, or ask for all there is.'), tx('The camera opens again straight away for the next item.')),
      dev: 'Live pull events are Floor events, so both phones hold the same list. <b>sendRequest()</b> sends the words with the request.',
      ev: [E('pull.request', 'floor', LINE, { kc: POTS.kc, bays: [POTS.bay], qty: 6, name: desc(POTS) })],
      run: async c => { off(c); await key(c, '6'); A(c, req(prod(POTS, { from: FOUND() }) + pad('6'))); await c.tap('#lpa .lp2-pad .send'); off(c); A(c, req(sent(POTS, 6))); stripTo(c, 'lpa', stripA(1, 0, 1)); } },
    { cap: tx('The stockroom phone buzzes.'), read: S(tx('The request is on the list with its bay, keycode and how many.'), tx('As they come in, or By bay for a walk round the bays.')),
      dev: 'Alerts: <b>installPullAlerts()</b> in js/views/livepull.js (vibrate, or a sound on iPhones).', ev: [],
      run: async c => { off(c); buzz(c); B(c, puller([line(POTS, 6, '10:42', { fresh: true })], { todo: 1 })); stripTo(c, 'lpb', stripB(1, 0, 1, 1)); } },
    { cap: tx('Mark it Pulled, Short or Not there.'), read: S(tx('Short asks how many came from each bay; Not there just tells the requester.'), tx('Undo puts it back until the cage goes down.')),
      dev: 'A second phone’s mark on the same line is refused as a conflict: the first <b>pull.mark</b> wins.', ev: [E('pull.mark', 'floor', LINE, { st: 'pulled', got: { [POTS.bay]: 6 } })],
      run: async c => { off(c); await c.tap('#lpb [data-x="pulled"]'); off(c); B(c, puller([], { done: 1 })); stripTo(c, 'lpb', stripB(1, 1, 1, 0)); stripTo(c, 'lpa', stripA(1, 1, 0));
        await c.tap('#lpb .lp2-tabs [data-tab="done"]'); B(c, puller([line(POTS, 6, '10:42', { done: tx('Pulled {n}', { n: 6 }) })], { tab: 'done', done: 1 })); } },
    { cap: tx('The floor sees the answer straight away.'), read: S(tx('The requester’s list shows what was pulled from which bay.'), tx('Pulled earlier today shows to anyone who scans it again.')),
      dev: 'Both phones read the same projection (pulls); nothing polls. The sheet is built from the sx blocks in js/map.js.', ev: [],
      run: async c => { off(c); await c.tap('#lpa .lp2-tog'); c.add('#lpa .lp2', sheetA([reqRow(POTS, 6, '10:42', tx('Pulled {n}', { n: 6 }), 'ok')])); stripTo(c, 'lpa', stripA(1, 1, 0, true)); } },
    { cap: tx('Cage full? Open the strip and send it down.'), read: S(tx('The cage lists what goes down, in the order asked, with any that came up short.'), tx('Scan the cage tag if it has one.')),
      dev: 'The cage is <b>cage()</b>: every line marked off since the last cage went down.', ev: [],
      run: async c => { off(c); c.remove('#lpa .lp2-sx'); stripTo(c, 'lpa', stripA(1, 1, 0)); await c.tap('#lpb .lp2-tog'); c.add('#lpb .lp2', sheetB()); stripTo(c, 'lpb', stripB(1, 1, 1, 0, true));
        await c.wait(500); await c.tap('#lpb [data-x="cage"]'); off(c); B(c, cage()); stripTo(c, 'lpb', ''); } },
    { cap: tx('Send cage {n} down: the next requests start cage {next}.', { n: 1, next: 2 }), read: S(tx('The requester’s details show the cage on its way.'), tx('Lines still to pull go in the next cage.')),
      dev: '<b>pull.cage.send</b> puts every line marked off in the cage; sending a cage that has gone is a no-op.', ev: [E('pull.cage.send', 'floor', SES, { cage: 1 })],
      run: async c => { off(c); await c.tap('#lpb [data-x="send"]'); off(c); B(c, puller([line(POTS, 6, '10:42', { done: tx('Pulled {n}', { n: 6 }), cage: 1 })], { tab: 'done', done: 1 })); stripTo(c, 'lpb', stripB(2, 0, 0, 0)); toastB(c, tx('Cage {n} is on its way down', { n: 1 })); } },
  ],
  whatif: [[tx('Two pullers tap at once?'), tx('The first mark counts; the other phone shows it as done.')], [tx('Only some there?'), tx('Mark Short and say how many came from each bay.')]],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
livepull.stories.push({
  id: 'tray', title: tx('What if nothing knows the barcode?'), blurb: tx('It’s searched on kmart.com.au while you keep scanning; type its keycode once and every phone knows it.'),
  know: [tx('A barcode nothing in the store knows goes to the tray under the scan box, and kmart.com.au is searched for it.'),
    tx('Keep scanning: each answer lands in the tray when it comes.'),
    tx('Found: Ask for it opens the item. More than one match: Pick shows them to choose from. Nothing: Type it.'),
    tx('A keycode typed for it, or a match tapped, is kept for the store, so the next scan of that barcode is instant on every phone.'),
    tx('Wrong item? under the answer takes the right keycode instead.')],
  html: READY,
  steps: [
    { cap: tx('Scan a shelf talker the store doesn’t know: it goes to the tray.'), read: S(tx('Its barcode isn’t on the store’s reports, so kmart.com.au is searched for it.'), tx('The camera opens again straight away for the next item.')),
      dev: 'The worker’s answer has a gtin and no keycode, so <b>searchBehind()</b> searches in the background (<b>searchBarcode()</b> in js/barcodesearch.js).',
      ev: [R('GET', `/v1/store/1241/pull/find?code=${BRUSH.apn}`, null, 'No keycode: no report or link has this barcode.'), R('GET', `/v1/catalogue/barcode?code=${BRUSH.apn}`, null, 'Kmart’s site search, in the background.')],
      run: async c => { off(c); await scanTalker(c, BRUSH); camOff(c); A(c, req(tray(BRUSH.apn, 'searching') + hint())); } },
    { cap: tx('Keep scanning: the next item answers as usual.'), read: S(tx('The tray stays above it while the search runs.')),
      dev: 'Each scan is its own <b>find()</b>; the tray is <b>behindTray()</b>.', ev: [R('GET', `/v1/store/1241/pull/find?code=${BALM.apn}`, null, 'Found by the report’s APN.')],
      run: async c => { off(c); await scanTalker(c, BALM); camOff(c); A(c, req(tray(BRUSH.apn, 'searching') + prod(BALM, { from: FOUND() }) + pad())); } },
    { cap: tx('The search answers in the tray: not found.'), read: S(tx('Type it takes the keycode instead.')),
      dev: 'A search can find one item (Ask for it), a choice (Pick) or nothing (Type it).', ev: [],
      run: async c => { off(c); await c.wait(900); A(c, req(tray(BRUSH.apn, 'none') + prod(BALM, { from: FOUND() }) + pad())); } },
    { cap: tx('Tap Type it, then type the keycode printed on the ticket.'), read: S(tx('On a shelf talker it’s the number at the left.'), tx('The item comes up with its bay, and the barcode is linked to it.')),
      dev: '<b>typeIt()</b> waits for the keycode; <b>find()</b> sends <b>pull.pair</b> once the keycode is found.',
      ev: [R('GET', `/v1/store/1241/pull/find?code=${BRUSH.kc}`, null, 'The keycode typed: its bay from today’s report.'), E('pull.pair', 'floor', { apn: BRUSH.apn }, { keycode: BRUSH.kc })],
      run: async c => { off(c); await c.tap('#lpa [data-x="type"]'); off(c); A(c, req(manual(BRUSH.apn))); await typeCode(c, BRUSH.kc); A(c, req(prod(BRUSH) + pad())); } },
    { cap: tx('Scan it again: it’s found at once, from the link.'), read: S(tx('Every phone of the store finds that barcode now.'), tx('Wrong item? under the answer takes the right keycode instead.')),
      dev: '<b>pullFind()</b> reads the link (pull.pair, via paired) before searching anything.', ev: [R('GET', `/v1/store/1241/pull/find?code=${BRUSH.apn}`, null, 'Found through the link.')],
      run: async c => { off(c); await scanTalker(c, BRUSH); camOff(c); A(c, req(prod(BRUSH, { from: FOUND(), wrong: true }) + pad())); } },
  ],
});
livepull.stories.push({
  id: 'seen', title: tx('What if it’s not on today’s report?'), blurb: tx('If the stockroom has had it lately, you can still ask for it where it was seen.'),
  know: [tx('Today’s report gives the bays the store system has for each item; an item it has no bay for may simply not have been scanned in.'),
    tx('A backfill scan, an earlier report or an SOH report from the last two weeks that put it in a bay is offered instead.'),
    tx('The puller sees the request marked SUGGESTED, with where and when it was seen: it may not be there.'),
    tx('Seen nowhere lately? It can’t be asked for: there is no bay to pull it from.')],
  html: READY,
  steps: [
    { cap: tx('Not on today’s report? It may still have been seen lately.'), read: S(tx('Here it was backfilled into bay {bay} on {date}.', { bay: SPONGE.seen.bay, date: fmtDay(SPONGE.seen.date) }), tx('Ask for it there, or Skip it.')),
      dev: 'The worker’s <b>seenBays()</b> (worker/store.js): backfill scans, earlier reports and SOH snapshots of the last two weeks, newest first.', ev: [R('GET', `/v1/store/1241/pull/find?code=${SPONGE.kc}`, null, 'No bay on today’s report; seen: where it was lately.')],
      run: async c => { off(c); await typeCode(c, SPONGE.kc); A(c, req(prod(SPONGE) + seenCard(false))); } },
    { cap: tx('Ask for it there, then how many and Send.'), read: S(tx('The request carries where it was seen.')),
      dev: '<b>sendRequest()</b> asks for the bays it was seen in, with seen.', ev: [E('pull.request', 'floor', LINE, { kc: SPONGE.kc, bays: [SPONGE.seen.bay], seen: [SPONGE.seen], qty: 2, name: desc(SPONGE) })],
      run: async c => { off(c); await c.tap('#lpa [data-x="seen-ok"]'); A(c, req(prod(SPONGE) + seenCard(true) + pad())); await key(c, '2'); A(c, req(prod(SPONGE) + seenCard(true) + pad('2'))); await c.tap('#lpa .lp2-pad .send'); off(c);
        A(c, req(sent(SPONGE, 2))); stripTo(c, 'lpa', stripA(1, 0, 1)); } },
    { cap: tx('The puller sees it marked SUGGESTED.'), read: S(tx('With where and when it was seen: it may not be there.'), tx('Mark it Pulled, Short or Not there.')),
      dev: 'The line keeps its seen list; <b>seenTag()</b> draws it.', ev: [],
      run: async c => { off(c); buzz(c); B(c, puller([line(SPONGE, 2, '10:47', { fresh: true, seen: SEEN() })], { todo: 1 })); stripTo(c, 'lpb', stripB(1, 0, 1, 1)); } },
    { cap: tx('There after all: Pulled {n}, and the floor knows.', { n: 2 }), read: S(tx('The requester’s list shows what was pulled from which bay.')),
      dev: 'A suggested line is marked like any other.', ev: [E('pull.mark', 'floor', LINE, { st: 'pulled', got: { [SPONGE.seen.bay]: 2 } })],
      run: async c => { off(c); await c.tap('#lpb [data-x="pulled"]'); off(c); B(c, puller([], { done: 1 })); stripTo(c, 'lpb', stripB(1, 1, 1, 0));
        await c.tap('#lpa .lp2-tog'); c.add('#lpa .lp2', sheetA([reqRow(SPONGE, 2, '10:47', tx('Pulled {n}', { n: 2 }), 'ok')])); stripTo(c, 'lpa', stripA(1, 1, 0, true)); } },
  ],
});
livepull.stories.push({
  id: 'again', title: tx('What if it’s already been asked for?'), blurb: tx('Scan it again while it waits and the phone says so: add more, change how many, or leave it.'),
  know: [tx('Already asked for shows while the request is still waiting in the stockroom, in this session.'),
    tx('Add more adds a carton, or the same number again when the carton size isn’t known.'),
    tx('Change to… takes a new number on the pad; Leave it keeps the request as it is.'),
    tx('The puller’s phone shows the new number at once.'),
    tx('Once it has been marked off, a scan says Pulled earlier today instead, with the bay and the time: the bay may still have more.')],
  html: WAITING,
  steps: [
    { cap: tx('Scan it again while it waits: Already asked for.'), read: S(tx('It says how many and when, and that it’s still waiting in the stockroom.')),
      dev: 'The check is <b>flags()</b> in js/views/livepull.js: a line for the same keycode still to do in this session.', ev: [R('GET', `/v1/store/1241/pull/find?code=${POTS.apn}`, null, 'The same item, found by its barcode.')],
      run: async c => { off(c); await scanTalker(c, POTS); camOff(c); A(c, req(prod(POTS, { from: FOUND() }) + dup(6, '10:42'))); } },
    { cap: tx('Change to…, then type the new number.'), read: S(tx('The pad says Change to, and Send becomes Change.')),
      dev: 'Change to… opens the pad for the waiting line.', ev: [],
      run: async c => { off(c); await c.tap('#lpa [data-x="change"]'); A(c, req(prod(POTS, { from: FOUND() }) + pad('', true))); await key(c, '1'); A(c, req(prod(POTS, { from: FOUND() }) + pad('1', true)));
        await key(c, '0'); A(c, req(prod(POTS, { from: FOUND() }) + pad('10', true))); } },
    { cap: tx('Change: the request is now for {n}.', { n: 10 }), read: S(tx('The floor phone confirms it.')),
      dev: '<b>pull.update</b> changes how many while it waits; once it is marked off, the change is refused.', ev: [E('pull.update', 'floor', LINE, { qty: 10 })],
      run: async c => { off(c); await c.tap('#lpa .lp2-pad .send'); off(c); A(c, req(sent(POTS, 10, true))); } },
    { cap: tx('The puller’s phone shows {n}.', { n: 10 }), read: S(tx('Pulled {n} marks it off.', { n: 10 })),
      dev: 'Both phones read the same line in the pulls projection.', ev: [],
      run: async c => { off(c); B(c, puller([line(POTS, 10, '10:42', { fresh: true })], { todo: 1 })); } },
  ],
});
