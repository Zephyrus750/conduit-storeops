// Chapter: Live pull, the floor and the stockroom on two phones, as the app
// has it today (js/views/livepull.js: the sessions, Start a session, the
// requester's scan box, answer card and pad, the "Barcodes being looked up"
// tray, the puller's bays and list, the strip and its sheet, the cage; the
// worker's pullFind in worker/store.js; shared/reducers/pull.js). Three What
// ifs play on the same two phones.
// The day: Busselton 1241, C4 Cosmetics & Accessories, stockroom bays
// 7040–7059 (Settings › Departments). The floor phone works down the aisle:
// clearance shelf talkers (their barcode is the item's own EAN-13, the
// keycode printed at the left) and keycodes typed from tickets. A pick of
// six: found in a bay, sold by the carton, in two bays, no stockroom
// location, seen lately in an old backfill bay, on today's truck. Each
// request lands on the stockroom phone the moment it is sent (it buzzes and
// lists it), as the app does; the stockroom then pulls them by bay: pulled,
// short across two bays, not there.
// Every class here starts lp2- (styles/guide.css).
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
const BALM = { kc: '43577422', apn: '9341111236416', d: ['OXX COSMETICS', 'LIP BALM 3PK'], bay: '7048', price: ['$1', ''], carton: 12 };
const SPONGE = { kc: '43577477', d: ['OXX BODYCARE', 'LOOFAH SPONGE PINK'], seen: { bay: '7046', date: '2026-10-22', via: 'backfill' } };
// In two bays on today's report; none at all; on today's truck (Truck 2, due 13:30, 3 cartons); recalled.
const LASH = { kc: '43577491', d: ['OXX COSMETICS', 'FALSE LASHES 3 PAIR'], bay: '7052', more: ['7055'] };
const TIES = { kc: '43577514', d: ['OXX HAIR', 'HAIR TIES 20PK BLACK'] };
const POLISH = { kc: '43577538', d: ['OXX COSMETICS', 'NAIL POLISH 6PK'], bay: '7044', truck: { n: 2, eta: '13:30', cartons: 3, units: 36 } };
const FIZZ = { kc: '43577545', d: ['OXX BODYCARE', 'BATH FIZZERS 4PK'], bay: '7050' }, RECALL_BAY = '7099', RID = '01JC2R…';
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
const counts = (asked, pulled, waiting, short = 0, gone = 0) => [txn(asked, '{n} asked', '{n} asked'), tx('{n} pulled', { n: pulled }), short ? tx('{n} short', { n: short }) : '', gone ? tx('{n} not there', { n: gone }) : '', waiting ? tx('{n} waiting', { n: waiting }) : ''].filter(Boolean).join(' · ');
// The strip above the tabs, and its toggle (open: the chevron points down).
const strip = (icon, title, s, n = '', open = false) => `<div class="lp2-strip"><div class="lp2-st">${ai(icon)}<b>${title}</b><span class="s">${s}</span>${n ? `<span class="n">${n}</span>` : ''}</div><span class="lp2-tog${open ? ' open' : ''}">${ai('chev')}</span></div>`;
const stripA = (asked, pulled, waiting, open, short = 0, gone = 0) => strip('listcheck', NAME, counts(asked, pulled, waiting, short, gone), waiting || '', open);
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
  return `<div class="lp2-card lp2-prod"><span class="lp2-pic">${ai('box')}</span><span class="lp2-pn"><b>${desc(it)}</b><small><span class="mono">${it.kc}</span>${it.carton ? ' · ' + tx('carton of {n}', { n: it.carton }) : ''}</small>` +
    (from ? `<small class="lp2-from">${from}${wrong ? ` · <u class="lp2-a">${tx('Wrong item?')}</u>` : ''}</small>` : '') + `</span>${bays && it.bay ? bay(it.bay, it.more || []) : ''}</div>`;
}
const FOUND = () => tx('found from the barcode');
function pad(qty = '', change = false, carton = 0) {
  return `<div class="lp2-qty"><span class="lp2-lbl">${change ? tx('Change to') : tx('How many?')}</span><b class="lp2-n${qty ? '' : ' blank'}">${qty || '–'}</b></div>` +
    `<div class="lp2-padx">${carton ? `<span data-x="carton">${ai('box')}${tx('+ Carton ({n})', { n: carton })}</span>` : ''}<span>${tx('All there is')}</span></div>` +
    `<div class="lp2-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<span data-k="${k}">${k}</span>`).join('')}<span>⌫</span><span data-k="0">0</span><span class="send${qty ? '' : ' off'}">${change ? tx('Change') : tx('Send')}</span></div>`;
}
const sent = (it, qty, change = false) => `<div class="lp2-sent">${ai('check')}<span><b>${change ? tx('Changed: {name} × {qty}', { name: desc(it), qty }) : tx('Sent: {name} × {qty}', { name: desc(it), qty })}</b><small>${tx('On the pullers’ phones now. Scan the next item.')}</small></span></div>`;
const dup = (qty, time) => `<div class="lp2-ans warn">${ai('listcheck')}<span><b>${tx('Already asked for')}</b>${tx('{qty} at {time} in this session. It’s still waiting in the stockroom.', { qty, time })}</span></div>` +
  `<div class="lp2-acts">${btn(tx('Add {n} more', { n: qty }), 'pri', 'plus')}${btn(tx('Change to…'), '', '', 'data-x="change"')}${btn(tx('Leave it'))}</div>`;
// No bay on this morning's report and seen nowhere lately: nothing is sent.
const noLoc = () => `<div class="lp2-ans warn">${ai('x')}<span><b>${tx('No stockroom location')}</b>${tx('This morning’s report has no stockroom bay for it, so it isn’t added to the list.')}</span></div>`;
// On today's truck (flags()): skip it, or request it anyway.
const onTruck = it => `<div class="lp2-ans info">${ai('truck')}<span><b>${tx('On today’s truck')}</b>${tx('Truck {n} (due {eta}) has {units} on its manifest. It should be decanted and filled today.', { n: it.truck.n, eta: it.truck.eta, units: txn(it.truck.cartons, '{n} carton', '{n} cartons') + ` (${it.truck.units})` })}</span></div>` +
  `<div class="lp2-acts">${btn(tx('Skip it'), 'pri', '', 'data-x="skip"')}${btn(tx('Request anyway'))}</div>`;
// A recalled product (recallFlag() in js/recallflag.js): never asked for; where it goes instead.
const recalled = () => `<div class="lp2-rc">${ai('alert')}<span><b>${tx('Recalled')} · ${desc(FIZZ)}</b>${tx('Don’t sell, pull or backfill it: it is a safety recall.')} ${tx('Move it to the recall bay ({bay}) and tell a manager.', { bay: `<b>${RECALL_BAY}</b>` })}</span>${btn(tx('I moved some'), 'sm', 'check', 'data-x="moved"')}</div>`;
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
const where = it => it.more ? tx('bays {list}', { list: [it.bay, ...it.more].join(' + ') }) : tx('bay {bay}', { bay: it.bay || it.seen?.bay });
const reqRow = (it, qty, time, state, tone) => sxRow('box', `${desc(it)} · ${qty}`, `<span class="mono">${it.kc}</span> · ${where(it)} · ${time}`, state, tone);

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
function line(it, qty, time, { fresh = false, done = '', tone = 'ok', seen = '', cage = 0 } = {}) {
  const cartons = it.carton && qty % it.carton === 0 ? txn(qty / it.carton, '{n} carton', '{n} cartons') : '';
  return `<div class="lp2-ln${done ? ' done' : ''}${fresh ? ' fresh' : ''}" data-kc="${it.kc}"><div class="lp2-lt">${bay(it.bay || it.seen?.bay, it.more || [], true)}<span class="lp2-pn"><b>${desc(it)}</b><small>${time} · <span class="mono">${it.kc}</span></small></span><span class="lp2-q"><b>${qty}</b>${cartons ? `<small>${cartons}</small>` : ''}</span></div>` +
    (seen ? `<div class="lp2-also"><span class="lp2-sug">${tx('SUGGESTED')}</span> <small class="lp2-sugw">${seen}</small></div>` : '') +
    (done ? `<div class="lp2-acts"><span class="lp2-pill ${tone}">${done}</span>${cage ? `<span class="lp2-dim">${tx('cage {n}', { n: cage })}</span>` : btn(tx('Undo'), 'sm')}</div>`
      : `<div class="lp2-acts">${btn(tx('Pulled {n}', { n: qty }), 'sm pri lp2-ok', 'check', 'data-x="pulled"')}${btn(tx('Short'), 'sm', '', 'data-x="short"')}${btn(tx('Not there'), 'sm lp2-no', '', 'data-x="gone"')}</div>`) + '</div>';
}
function puller(lines = [], { tab = 'todo', todo = 0, done = 0, order = 'time' } = {}) {
  const t = (id, label) => `<span class="${tab === id ? 'on' : ''}" data-tab="${id}">${label}</span>`;
  return top(tx('Your bays: {bays}', { bays: ZONE })) +
    `<div class="lp2-tabs">${t('todo', tx('To pull {n}', { n: todo }))}${t('done', tx('Marked off {n}', { n: done }))}${t('all', tx('All {n}', { n: todo + done }))}</div>` +
    `<div class="lp2-seg"><span${order === 'time' ? ' class="on"' : ''} data-o="time">${tx('As they come in')}</span><span${order === 'bay' ? ' class="on"' : ''} data-o="bay">${tx('By bay')}</span></div>` +
    (lines.length ? lines.join('') : `<p class="lp2-dim lp2-empty">${tab === 'todo' ? tx('Nothing to pull in your bays. New requests buzz this phone.') : tx('Nothing here yet.')}</p>`);
}
// Short (shortSheet()): how many came from each bay.
const shortCard = (it, asked, got) => { const total = Object.values(got).reduce((a, b) => a + b, 0);
  return `<div class="lp2-over"><div class="lp2-short">${prod(it, { bays: false })}<span class="lp2-lbl">${tx('How many from each bay?')}</span>` +
    [it.bay, ...(it.more || [])].map(b => `<div class="lp2-bayrow">${bay(b, [], true)}<span class="lp2-pm">${ai('minus')}</span><b class="lp2-gn">${got[b] || 0}</b><span class="lp2-pm" data-plus="${b}">${ai('plus')}</span></div>`).join('') +
    `<div class="lp2-total"><span>${tx('Together')}</span><b>${tx('{got} of {asked}', { got: total, asked })}</b></div>` +
    big('check', total >= asked ? tx('Pulled all {n}', { n: asked }) : tx('Pulled {got} of {asked} · short {n}', { got: total, asked, n: asked - total }), 'data-x="short-save"') + '</div></div>'; };
// The puller's sheet: the cage being filled, the pullers and their bays, and Send cage down.
const sheetB = (n = 1) => sheetOf(`<div class="lp2-sxh">${ai('box')}${ZONE}<span class="n">${tx('{n} to pull', { n: 0 })}</span></div><p class="lp2-sxp">${tx('This phone')} · ${NAME} · ${tx('buzz on')}</p>` +
  sxSec(tx('Cage {n}', { n: 1 }), '<span class="lp2-sxbar"><i style="width:100%"></i></span>', tx('{done} of {all} marked off', { done: n, all: n })) +
  sxSec(tx('Pullers'), `<div class="lp2-sxrs">${sxRow('phone', tx('This phone'), ZONE, tx('All marked off'), 'ok')}</div>`, tx('the bays each phone covers')) +
  `<div class="lp2-sxa">${sxBtn('cage', tx('Send cage {n} down', { n: 1 }), true, 'data-x="cage"')}${sxBtn('pin', tx('Change my bays'))}${sxBtn('phone', tx('Buzz: on'))}${sxBtn('x', tx('Leave session'))}</div>`);
// The cage (cage()): what goes down, in the order asked, and the tag.
// rows: [item, asked, got (or null when all came)]; gone: what was not there.
const CAGE = () => [[POTS, 6, null], [BALM, 12, null], [LASH, 4, 3]];
function cage(rows = CAGE(), gone = [SPONGE]) {
  const units = rows.reduce((n, [, a, g]) => n + (g ?? a), 0), short = rows.filter(([, , g]) => g != null).length;
  return head(tx('Send cage {n} down', { n: 1 }), `${D()} ${NAME}`) +
  `<div class="lp2-sum"><div><b>${rows.length}</b><span>${tx('lines')}</span></div><div><b>${units}</b><span>${tx('units')}</span></div><div><b class="${short ? 'warn' : ''}">${short}</b><span>${tx('short')}</span></div></div>` +
  `<div class="lp2-card"><span class="lp2-lbl">${tx('In the cage, in the order asked')}</span>${rows.map(([it, a, g]) => `<div class="lp2-cr"><span><b>${desc(it)}</b><small>${where(it)}</small></span>${g != null ? `<span class="lp2-pill warn">${tx('{got} of {asked}', { got: g, asked: a })}</span>` : `<b class="mono">× ${a}</b>`}</div>`).join('')}</div>` +
  (gone.length ? `<div class="lp2-ans warn">${ai('x')}<span><b>${tx('Not coming')}</b>${gone.map(desc).join(', ')}</span></div>` : '') +
  `<span class="lp2-fl">${tx('Cage tag (optional)')}</span><div class="lp2-scan"><span class="lp2-in mono lp2-ph"><span class="lp2-t">BSN1240417</span></span><span class="lp2-cam">${ai('camera')}</span></div>` +
  big('cage', tx('Send cage {n} down', { n: 1 }), 'data-x="send"') + `<span class="lp2-ghost">${tx('Back')}</span>`;
}

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
const toastA = (c, t) => { c.html('#lpa .dv-toast', t); c.show('#lpa .dv-toast'); };
// Moved to the recall bay (openFound() in js/recallflag.js): how many, and where they were.
const found = (n, at = '') => `<div class="lp2-over"><div class="lp2-short lp2-found"><b class="lp2-ct">${tx('Moved to the recall bay')}</b>` +
  `<div class="lp2-rc sm">${ai('alert')}<span><b>${tx('Recalled')} · ${desc(FIZZ)}</b>${tx('Recall bay: {bay}', { bay: RECALL_BAY })}</span></div>` +
  `<span class="lp2-lbl">${tx('How many did you move?')}</span><div class="lp2-bayrow"><span class="lp2-pm">${ai('minus')}</span><b class="lp2-gn">${n}</b><span class="lp2-pm" data-plus="n">${ai('plus')}</span></div>` +
  `<span class="lp2-lbl">${tx('Where were they?')}</span>${field(at, tx('Bay or shelf, like 7036 or A16 S2'))}` +
  `<p class="lp2-dim">${tx('Then tell a manager, so they know it has been moved.')}</p>${big('check', tx('Save'), 'data-x="found-save"')}</div></div>`;

// States the What ifs start from: both phones in the session, nothing asked yet; or the pots asked for and waiting.
const READY = () => duo(phoneA(req(), stripA(0, 0, 0)), phoneB(puller(), stripB(1, 0, 0, 0)));
const WAITING = () => duo(phoneA(req(sent(POTS, 6)), stripA(1, 0, 1)), phoneB(puller([line(POTS, 6, '10:42')], { todo: 1 }), stripB(1, 0, 1, 1)));

// The pick: [item, how many, when, seen-tag]; the puller lists them as they came, or by bay.
const PICK = () => [[POTS, 6, '10:42'], [BALM, 12, '10:43'], [LASH, 4, '10:44'], [SPONGE, 2, '10:46']];
const byBay = xs => [...xs].sort((a, b) => (a[0].bay || a[0].seen.bay).localeCompare(b[0].bay || b[0].seen.bay));
const lineOf = ([it, q, t], o = {}) => line(it, q, t, { ...(it.seen ? { seen: SEEN() } : {}), ...o });
const MARKS = { [POTS.kc]: [tx('Pulled {n}', { n: 6 }), 'ok'], [BALM.kc]: [tx('Pulled {n}', { n: 12 }), 'ok'], [LASH.kc]: [tx('Short · {got} of {asked}', { got: 3, asked: 4 }), 'warn'], [SPONGE.kc]: [tx('Not there'), 'bad'] };
const marked = (xs, cage = 0) => byBay(xs).map(x => lineOf(x, { done: MARKS[x[0].kc][0], tone: MARKS[x[0].kc][1], cage }));
const left = done => byBay(PICK().filter(x => !done.includes(x[0].kc))).map(x => lineOf(x));
// The stockroom phone the moment a request is sent: it buzzes, and the request joins its list as they came in (the newest marked).
const landB = (c, n) => { const xs = PICK().slice(0, n); buzz(c); B(c, puller(xs.map(x => lineOf(x, { fresh: x === xs[n - 1] })), { todo: n })); stripTo(c, 'lpb', stripB(1, 0, n, n)); };
async function sendIt(c, it, qty, asked) { await c.tap('#lpa .lp2-pad .send'); off(c); A(c, req(sent(it, qty))); stripTo(c, 'lpa', stripA(asked, 0, asked)); await c.wait(350); landB(c, asked); }

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
    { cap: tx('Type how many, then Send.'), read: S(tx('Type a number, add a carton at a time, or ask for all there is.'), tx('The stockroom phone buzzes, and the request is there at once.')),
      dev: 'Live pull events are Floor events, so both phones hold the same list. <b>sendRequest()</b> sends the words with the request; <b>installPullAlerts()</b> buzzes each phone whose bays hold it.',
      ev: [E('pull.request', 'floor', LINE, { kc: POTS.kc, bays: [POTS.bay], qty: 6, name: desc(POTS) })],
      run: async c => { off(c); await key(c, '6'); A(c, req(prod(POTS, { from: FOUND() }) + pad('6'))); await sendIt(c, POTS, 6, 1); } },
    { cap: tx('Keep going down the aisle: a lip balm sold by the carton.'), read: S(tx('The answer shows the carton size, and + Carton adds a carton at a time.'), tx('Twelve is one carton.')),
      dev: '<b>pullFind()</b> answers with the carton size from the report, and the request carries it, so the puller sees cartons too.',
      ev: [R('GET', `/v1/store/1241/pull/find?code=${BALM.apn}`, null, 'Found by the report’s APN, with its carton size.'), E('pull.request', 'floor', LINE, { kc: BALM.kc, bays: [BALM.bay], qty: 12, carton: 12, name: desc(BALM) })],
      run: async c => { off(c); await scanTalker(c, BALM); camOff(c); A(c, req(prod(BALM, { from: FOUND() }) + pad('', false, 12))); await c.tap('#lpa [data-x="carton"]');
        A(c, req(prod(BALM, { from: FOUND() }) + pad('12', false, 12))); await sendIt(c, BALM, 12, 2); } },
    { cap: tx('False lashes are in two bays: the request goes to both.'), read: S(tx('Typed from the ticket this time.'), tx('Today’s report has them in bays {a} and {b}.', { a: LASH.bay, b: LASH.more[0] })),
      dev: 'A request carries every bay the report has (<b>sendRequest()</b>); a puller whose bays hold any of them sees it.',
      ev: [R('GET', `/v1/store/1241/pull/find?code=${LASH.kc}`, null, 'The keycode typed: two bays on today’s report.'), E('pull.request', 'floor', LINE, { kc: LASH.kc, bays: [LASH.bay, ...LASH.more], qty: 4, name: desc(LASH) })],
      run: async c => { off(c); await typeCode(c, LASH.kc); A(c, req(prod(LASH) + pad())); await key(c, '4'); A(c, req(prod(LASH) + pad('4'))); await sendIt(c, LASH, 4, 3); } },
    { cap: tx('Hair ties: no stockroom location, so nothing is sent.'), read: S(tx('This morning’s report has no stockroom bay for them, and nobody has seen them in one lately.'), tx('They aren’t added to the list: there is no bay to pull them from.')),
      dev: '<b>pullFind()</b> found no bay on the report and none seen in the last two weeks, so the answer has no bays.', ev: [R('GET', `/v1/store/1241/pull/find?code=${TIES.kc}`, null, 'No bay on the report, none seen lately.')],
      run: async c => { off(c); await typeCode(c, TIES.kc); A(c, req(prod(TIES) + noLoc())); } },
    { cap: tx('A loofah isn’t on today’s report, but was backfilled into bay {bay} lately.', { bay: SPONGE.seen.bay }), read: S(tx('It may not have been scanned in, so ask for it where it was seen.'), tx('The puller sees it marked as a suggestion.')),
      dev: 'The worker’s <b>seenBays()</b> looks through backfill scans, earlier reports and SOH snapshots from the last two weeks.',
      ev: [R('GET', `/v1/store/1241/pull/find?code=${SPONGE.kc}`, null, 'No bay on today’s report; seen in bay 7046.'), E('pull.request', 'floor', LINE, { kc: SPONGE.kc, bays: [SPONGE.seen.bay], seen: [SPONGE.seen], qty: 2, name: desc(SPONGE) })],
      run: async c => { off(c); await typeCode(c, SPONGE.kc); A(c, req(prod(SPONGE) + seenCard(false))); await c.wait(500); await c.tap('#lpa [data-x="seen-ok"]'); A(c, req(prod(SPONGE) + seenCard(true) + pad()));
        await key(c, '2'); A(c, req(prod(SPONGE) + seenCard(true) + pad('2'))); await sendIt(c, SPONGE, 2, 4); } },
    { cap: tx('Nail polish is on today’s truck: skip it, or request it anyway.'), read: S(tx('Truck {n} is due at {eta} with {cartons} cartons of it, so the shelf fills today.', { n: POLISH.truck.n, eta: POLISH.truck.eta, cartons: POLISH.truck.cartons }), tx('Request anyway when the shelf can’t wait.')),
      dev: '<b>pullFind()</b> reads today’s trucks and planned slots for the keycode; <b>flags()</b> shows it before the pad.', ev: [R('GET', `/v1/store/1241/pull/find?code=${POLISH.kc}`, null, 'In bay 7044, and on Truck 2’s manifest today.')],
      run: async c => { off(c); await typeCode(c, POLISH.kc); A(c, req(prod(POLISH) + onTruck(POLISH))); await c.wait(700); await c.tap('#lpa [data-x="skip"]'); off(c); A(c, req()); } },
    { cap: tx('In the stockroom, By bay puts the four requests in walking order.'), read: S(tx('Four requests: the lip balm shows its carton, the lashes both bays.'), tx('The loofah is marked SUGGESTED: it may not be there.')),
      dev: 'Each request joined this list as it was sent (<b>installPullAlerts()</b> buzzed for each one in this phone’s bays); By bay sorts by the first bay.', ev: [],
      run: async c => { off(c); await c.wait(300); await c.tap('#lpb .lp2-seg [data-o="bay"]'); B(c, puller(left([]), { todo: 4, order: 'bay' })); } },
    { cap: tx('Pulled: the pots, then a carton of lip balm.'), read: S(tx('Each mark reaches the floor straight away.'), tx('Undo puts one back until the cage goes down.')),
      dev: 'A second phone’s mark on the same line is refused as a conflict: the first <b>pull.mark</b> wins.',
      ev: [E('pull.mark', 'floor', LINE, { st: 'pulled', got: { [POTS.bay]: 6 } }), E('pull.mark', 'floor', LINE, { st: 'pulled', got: { [BALM.bay]: 12 } })],
      run: async c => { off(c); await c.tap(`#lpb .lp2-ln[data-kc="${POTS.kc}"] [data-x="pulled"]`); B(c, puller(left([POTS.kc]), { todo: 3, done: 1, order: 'bay' })); stripTo(c, 'lpb', stripB(1, 1, 4, 3)); stripTo(c, 'lpa', stripA(4, 1, 3));
        await c.tap(`#lpb .lp2-ln[data-kc="${BALM.kc}"] [data-x="pulled"]`); off(c); B(c, puller(left([POTS.kc, BALM.kc]), { todo: 2, done: 2, order: 'bay' })); stripTo(c, 'lpb', stripB(1, 2, 4, 2)); stripTo(c, 'lpa', stripA(4, 2, 2)); } },
    { cap: tx('Only three lashes: Short, then how many came from each bay.'), read: S(tx('Two from {a} and one from {b}: Pulled 3 of 4, short 1.', { a: LASH.bay, b: LASH.more[0] }), tx('The floor sees what came from each bay.')),
      dev: '<b>shortSheet()</b> counts each bay; the mark is short, with what came from each.', ev: [E('pull.mark', 'floor', LINE, { st: 'short', got: { [LASH.bay]: 2, [LASH.more[0]]: 1 } })],
      run: async c => { off(c); await c.tap(`#lpb .lp2-ln[data-kc="${LASH.kc}"] [data-x="short"]`); off(c); c.add('#lpb .lp2', shortCard(LASH, 4, {}));
        await c.tap(`#lpb [data-plus="${LASH.bay}"]`); c.remove('#lpb .lp2-over'); c.add('#lpb .lp2', shortCard(LASH, 4, { [LASH.bay]: 1 }));
        await c.tap(`#lpb [data-plus="${LASH.bay}"]`); c.remove('#lpb .lp2-over'); c.add('#lpb .lp2', shortCard(LASH, 4, { [LASH.bay]: 2 }));
        await c.tap(`#lpb [data-plus="${LASH.more[0]}"]`); c.remove('#lpb .lp2-over'); c.add('#lpb .lp2', shortCard(LASH, 4, { [LASH.bay]: 2, [LASH.more[0]]: 1 }));
        await c.wait(400); await c.tap('#lpb [data-x="short-save"]'); off(c); c.remove('#lpb .lp2-over'); B(c, puller(left([POTS.kc, BALM.kc, LASH.kc]), { todo: 1, done: 3, order: 'bay' }));
        stripTo(c, 'lpb', stripB(1, 3, 4, 1)); stripTo(c, 'lpa', stripA(4, 2, 1, false, 1)); } },
    { cap: tx('The loofah isn’t in bay {bay} after all: Not there.', { bay: SPONGE.seen.bay }), read: S(tx('It was a suggestion, and the requester is told straight away.'), tx('Marked off shows every answer.')),
      dev: 'Not there is <b>pull.mark</b> gone; it stays out of the cage.', ev: [E('pull.mark', 'floor', LINE, { st: 'gone' })],
      run: async c => { off(c); await c.tap(`#lpb .lp2-ln[data-kc="${SPONGE.kc}"] [data-x="gone"]`); off(c); B(c, puller([], { done: 4, order: 'bay' })); stripTo(c, 'lpb', stripB(1, 4, 4, 0)); stripTo(c, 'lpa', stripA(4, 2, 0, false, 1, 1));
        await c.tap('#lpb .lp2-tabs [data-tab="done"]'); B(c, puller(marked(PICK()), { tab: 'done', done: 4, order: 'bay' })); } },
    { cap: tx('The floor sees every answer.'), read: S(tx('The list shows what came, what was short and what wasn’t there.'), tx('The strip counts them: 4 asked, 2 pulled, 1 short, 1 not there.')),
      dev: 'Both phones read the same projection (pulls); nothing polls. The sheet is built from the sx blocks in js/map.js.', ev: [],
      run: async c => { off(c); await c.tap('#lpa .lp2-tog'); c.add('#lpa .lp2', sheetA([reqRow(SPONGE, 2, '10:46', tx('Not there'), 'bad'), reqRow(LASH, 4, '10:44', MARKS[LASH.kc][0], 'warn'), reqRow(BALM, 12, '10:43', MARKS[BALM.kc][0], 'ok'), reqRow(POTS, 6, '10:42', MARKS[POTS.kc][0], 'ok')]));
        stripTo(c, 'lpa', stripA(4, 2, 0, true, 1, 1)); } },
    { cap: tx('Cage full? Open the strip and send it down.'), read: S(tx('The cage lists what goes down, in the order asked: three lines, 21 units, one short.'), tx('What wasn’t there is listed as not coming.')),
      dev: 'The cage is <b>cage()</b>: every line marked off since the last cage went down.', ev: [],
      run: async c => { off(c); c.remove('#lpa .lp2-sx'); stripTo(c, 'lpa', stripA(4, 2, 0, false, 1, 1)); await c.tap('#lpb .lp2-tog'); c.add('#lpb .lp2', sheetB(4)); stripTo(c, 'lpb', stripB(1, 4, 4, 0, true));
        await c.wait(500); await c.tap('#lpb [data-x="cage"]'); off(c); B(c, cage()); stripTo(c, 'lpb', ''); } },
    { cap: tx('Send cage {n} down: the next requests start cage {next}.', { n: 1, next: 2 }), read: S(tx('The requester’s details show the cage on its way.'), tx('Lines still to pull go in the next cage.')),
      dev: '<b>pull.cage.send</b> puts every line marked off in the cage; sending a cage that has gone is a no-op.', ev: [E('pull.cage.send', 'floor', SES, { cage: 1 })],
      run: async c => { off(c); await c.tap('#lpb [data-x="send"]'); off(c); B(c, puller(marked(PICK(), 1), { tab: 'done', done: 4, order: 'bay' })); stripTo(c, 'lpb', stripB(2, 0, 0, 0)); toastB(c, tx('Cage {n} is on its way down', { n: 1 })); } },
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
  id: 'recall', title: tx('What if the product has been recalled?'), blurb: tx('The phone stops with a red flag: it can’t be asked for, and goes to the recall bay instead.'),
  know: [tx('A recalled or withdrawn product is flagged wherever it is scanned, on every phone, from the moment a manager adds the recall.'),
    tx('It can’t be asked for: there is no pad and no Send.'),
    tx('I moved some records how many went to the recall bay, and where they were.'),
    tx('Then tell a manager, so they know it has been moved.')],
  html: READY,
  steps: [
    { cap: tx('Scan a product that has been recalled: the phone stops with a red flag.'), read: S(tx('It says where it goes instead: the recall bay.'), tx('There is no pad: it can’t be asked for.')),
      dev: 'The flag is <b>recallFlag()</b> in js/recallflag.js, from the recalls every phone holds; <b>sendRequest()</b> refuses a recalled keycode too.', ev: [R('GET', `/v1/store/1241/pull/find?code=${FIZZ.kc}`, null, 'Found in bay 7050; the recall comes from the phone’s own list.')],
      run: async c => { off(c); await typeCode(c, FIZZ.kc); A(c, req(prod(FIZZ) + recalled())); } },
    { cap: tx('Moved some to the recall bay? Tap I moved some.'), read: S(tx('Say how many, and the bay or shelf they were on.')),
      dev: '<b>openFound()</b> asks how many and where.', ev: [],
      run: async c => { off(c); await c.tap('#lpa [data-x="moved"]'); off(c); c.add('#lpa .lp2', found(1)); await c.tap('#lpa [data-plus="n"]'); c.remove('#lpa .lp2-over'); c.add('#lpa .lp2', found(2));
        await c.tap('#lpa [data-plus="n"]'); c.remove('#lpa .lp2-over'); c.add('#lpa .lp2', found(3)); await c.tap('#lpa .lp2-found .lp2-in'); c.remove('#lpa .lp2-over'); c.add('#lpa .lp2', found(3, 'A14 S1')); } },
    { cap: tx('Save: the managers’ Recalls tab counts them.'), read: S(tx('Then tell a manager, so they know it has been moved.'), tx('Nothing goes to the stockroom.')),
      dev: '<b>recall.found</b> records how many and where.', ev: [E('recall.found', 'floor', { recall: RID }, { kc: FIZZ.kc, n: 3, where: 'A14 S1' })],
      run: async c => { off(c); await c.tap('#lpa [data-x="found-save"]'); off(c); c.remove('#lpa .lp2-over'); A(c, req(prod(FIZZ) + recalled())); toastA(c, tx('Saved. Now tell a manager.')); } },
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
      run: async c => { off(c); await c.tap('#lpa .lp2-pad .send'); off(c); A(c, req(sent(POTS, 10, true))); await c.wait(350); B(c, puller([line(POTS, 10, '10:42', { fresh: true })], { todo: 1 })); } },
    { cap: tx('The puller’s phone shows {n}.', { n: 10 }), read: S(tx('Pulled {n} marks it off.', { n: 10 })),
      dev: 'Both phones read the same line in the pulls projection: the change reached the stockroom phone as it was made.', ev: [],
      run: async c => { off(c); B(c, puller([line(POTS, 10, '10:42', { fresh: true })], { todo: 1 })); } },
  ],
});
