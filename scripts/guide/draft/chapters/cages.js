// Chapter: Cages, on a Stockroom phone, as the app has it today
// (js/views/stockroom/cages.js mobile: Cage scan with the open cages, a new
// cage from its tag and ring, cartons by camera, a count, an item barcode
// searched on kmart.com.au (js/barcodesearch.js), the product pop-up
// (js/views/stockroom/common.js), Done · park; then Cage sweep). Three What
// ifs play on the same phone: a barcode kmart.com.au doesn't know, a recalled
// product, a cage seen in another zone on a sweep.
// The day: Busselton 1241, five cages already open in the stockroom; the new
// one is BSN1240421 on an Overstock ring. The phone asks with the browser's
// own confirm and prompt, drawn here as a plain dialog.
// Every class here starts cg2- (scripts/guide/draft/css/cages.css).
import { tx, txn } from '../../i18n.js';
import { fmtTime } from '../../ui.js';
import { ai, phone2, sheet, unsheet, toast2, bars, tally } from '../frames.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const R = (route, body, note) => ({ route, body, note });
// Today at a time, as the app writes it (js/ui.js fmtTime).
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return fmtTime(d.toISOString()); };
const SW = '01JB9K4Q7M2X8T5V3R6N0C1D2E', SW2 = '01JB9N7C3H5K2P8W4Z6Y1A0B9F', RC = 'rcmgq8x2k7fd';
const TAG = 'BSN1240421', APN = '9312345012343', APN2 = '9351234007893';

// Ring colours (RING in js/views/stockroom/common.js).
const RING = () => ({ 'new-lines': [tx('New lines'), '#7C3AED'], overstock: [tx('Overstock'), '#2563EB'], 'cant-work': [tx('Can’t work'), '#DC2626'], 'online-picks': [tx('Online picks'), '#16A34A'] });
const RINGS = ['new-lines', 'overstock', 'cant-work', 'online-picks'];
// Products: keycode → name, as the catalogue gives it (data).
const N = { 42977636: '12pk Diecast Vehicles', 43302210: 'Paper Plates 20pk', 43199310: 'Gift Wrap Roll', 43166022: 'Bath Towel 5pk', 110012345: 'Memory Foam Bath Mat' };
// The open cages before the new one, oldest seen first: tag, ring, where it is parked, units.
const OPEN = [['BSN1240403', 'overstock', 'MEZZANINE', 8], ['BSN1240412', 'overstock', 'AISLE 2', 10], ['BSN1240415', 'new-lines', 'BAY 7020', 12], ['BSN1240417', 'cant-work', 'DOCK DOOR', 2], ['BSN1240409', 'online-picks', null, 1]];
const NEWROW = [TAG, 'overstock', 'AISLE 2', 6];
const units = n => txn(n, '{n} unit', '{n} units');

// ── the phone's pieces (cages.js mobile()) ───────────────────────────
const ring = (r, cls = '') => `<i class="cg2-ring${cls ? ' ' + cls : ''}" style="--rc:${RING()[r][1]}"></i>`;
const head = (t, s) => `<div class="cg2-hd"><h2>${t}</h2><span>${s}</span></div>`;
const tabs = on => `<div class="cg2-tabs"><span class="${on === 'scan' ? 'cg2-on ' : ''}cg2-tscan">${ai('barcode')}${tx('Scan')}</span><span class="${on === 'sweep' ? 'cg2-on ' : ''}cg2-tsw">${ai('listcheck')}${tx('Sweep')}</span></div>`;
// The scan box (mscan() in js/ui.js): its caption, the field with the camera under it, a hint or the tools.
const scanBox = ({ cap, ph, val = '', hint = '', tools = '' }) => `<div class="cg2-scan"><div class="cg2-cap">${cap}</div><div class="cg2-fld"><span class="cg2-in${val ? '' : ' cg2-ph'}"><span class="cg2-t">${val || ph}</span></span><span class="cg2-cam">${ai('camera')}</span></div>` +
  (hint ? `<div class="cg2-hint">${hint}</div>` : '') + (tools ? `<div class="cg2-tools">${tools}</div>` : '') + '</div>';
const rows = list => `<div class="cg2-rows">${list.map(([id, r, loc, n]) => `<div class="cg2-row" data-id="${id}"><span class="cg2-a">${ring(r)}${id}</span><span class="cg2-b">${loc || tx('not parked')} · ${units(n)}</span><span class="cg2-btn">${tx('Use')}</span></div>`).join('')}</div>`;
const ringPick = on => `<div class="cg2-rp"><small>${tx('Ring for a new cage')}</small>${RINGS.map(r => `<span data-v="${r}">${ring(r, r === on ? 'cg2-ron' : '')}</span>`).join('')}</div>`;
// No cage chosen: the open cages, the tag field and the ring for a new one.
function picker({ on = 'new-lines', typed = '', fresh = false } = {}) {
  return head(tx('Cage scan'), tx('Scan a cage tag to start')) + `<div class="cg2-cs">${tabs('scan')}` +
    scanBox({ cap: tx('Scan the cage tag'), ph: tx('e.g. BSN1240417'), val: typed, hint: tx('A tag that is not on the register opens a new cage') }) +
    ringPick(on) + `<div class="cg2-sub">${tx('Open cages')}</div>${rows(fresh ? [...OPEN, NEWROW] : OPEN)}</div>`;
}
// A cage chosen: its card, the product field with the count, what was added and what is on it.
const step = q => `<span class="cg2-step"><span>${ai('minus')}</span><b>${q}</b><span class="cg2-plus">${ai('plus')}</span></span><span class="cg2-add">${ai('barcode')}${tx('Add × {n}', { n: q })}</span>`;
const sum = items => [Object.values(items).reduce((a, b) => a + b, 0), Object.keys(items).length];
const lastCard = (kc, q) => `<div class="cg2-last"><div class="cg2-lh"><span class="cg2-kind">${ai('tag')}${tx('Product')}</span><span class="cg2-tick">${ai('check')}${tx('Added to {cage}', { cage: TAG })}</span></div>` +
  `<div class="cg2-kc">${kc}<small>${N[kc]} ↗</small></div><div class="cg2-facts">${txn(q, '<b>× {n}</b> unit', '<b>× {n}</b> units')}</div></div>`;
// Keys that look like numbers come out in number order, as the app's list does.
const list = items => { const [u, l] = sum(items), k = Object.keys(items).sort((a, b) => a - b);
  return `<div class="cg2-list"><div class="cg2-lt">${tx('On this cage')}<span>${units(u)} · ${txn(l, '{n} line', '{n} lines')}</span></div>` +
    (k.length ? k.map(kc => `<div class="cg2-li" data-kc="${kc}"><span class="cg2-lk"><u>${kc}</u><small>${N[kc]} ↗</small></span><b>× ${items[kc]}</b></div>`).join('') : `<div class="cg2-li cg2-none">${tx('Nothing yet')}</div>`) + '</div>'; };
function target({ items = {}, loc = null, qty = 1, typed = '', bc = '', last = null } = {}) {
  const [u, l] = sum(items), [rn, rc] = RING().overstock;
  return head(tx('Cage scan'), tx('{cage} · scan carton, product or cage tag', { cage: TAG })) + `<div class="cg2-cs">${tabs('scan')}` +
    `<div class="cg2-tgt"><div class="cg2-tag"><span class="cg2-cg">${ring('overstock')}${TAG}</span><span class="cg2-chip" style="--rc:${rc}"><i></i>${rn}</span></div>` +
    `<div class="cg2-where">${ai('pin')}<span>${loc ? `<b>${loc}</b>` : tx('not parked yet')} · ${tx('seen {ago}', { ago: tx('just now') })}</span></div>` +
    `<div class="cg2-meta">${tx('Opened {time}', { time: at(7, 42) })} · ${txn(u, '<b>{n} unit</b> on {lines} lines', '<b>{n} units</b> on {lines} lines', { lines: l })}</div>` +
    `<div class="cg2-tacts"><span class="cg2-btn">${ai('cage')}${tx('Change cage')}</span><span class="cg2-btn cg2-park">${ai('parking')}${tx('Park here')}</span></div></div>` +
    scanBox({ cap: tx('Scan a product'), ph: tx('Keycode, item barcode or cage tag'), val: typed, tools: step(qty) }) +
    bc + (last ? lastCard(...last) : '') + list(items) +
    `<div class="cg2-foot"><span class="cg2-done">${ai('check')}${tx('Done · park {cage}', { cage: TAG })}</span></div></div>`;
}
// The barcode search's cards (barcodeCard() in js/barcodesearch.js).
const searching = () => `<div class="cg2-bch">${ai('search')}<p>${tx('Searching kmart.com.au for this barcode…')}<small>${tx('It can take up to half a minute.')}</small></p></div>`;
const choose = () => `<div class="cg2-bca cg2-info">${ai('search')}<span><b>${tx('Is this it?')}</b>${tx('Found on kmart.com.au from the barcode. Tap the right one.')}</span></div>` +
  `<div class="cg2-picks">${[43166022, 110012345].map(kc => `<span class="cg2-pick" data-kc="${kc}"><span class="cg2-pic">${ai('box')}</span><span class="cg2-pn"><b>${N[kc]}</b><small>${kc}</small></span>${ai('arrow')}</span>`).join('')}</div>` +
  `<span class="cg2-bcx">${tx('None of these: type the keycode')}</span>`;
const notFound = code => `<div class="cg2-bca cg2-warn">${ai('barcode')}<span><b>${tx('Not found on kmart.com.au')}</b>${tx('Type its keycode in the box above, from the ticket, shelf label or carton.')}</span></div><p class="cg2-gtin">${tx('Barcode {code}', { code: `<span>${code}</span>` })}</p>`;
// The red flag (recallFlag() in js/recallflag.js).
const flag = () => `<div class="cg2-rc">${ai('alert')}<div class="cg2-rct"><b>${tx('Recalled')} · Bubble Wand Set</b><span>${tx('Don’t sell, pull or backfill it: it is a safety recall.')} ${tx('Move it to the recall bay ({bay}) and tell a manager.', { bay: '<b>BAY 7001</b>' })}</span><small>Return to DC: choking hazard.</small></div><span class="cg2-btn cg2-moved">${ai('check')}${tx('I moved some')}</span></div>`;

// ── the sweep (cages.js mobile(), Sweep) ──────────────────────────────
// A sweep's list: [tag, where, state] in the app's order (oldest seen first); state ok | todo | lost.
const S0 = [['BSN1240403', 'MEZZANINE', 'lost'], ['BSN1240412', 'AISLE 2', 'todo'], ['BSN1240415', 'BAY 7020', 'todo'], ['BSN1240417', 'DOCK DOOR', 'todo'], ['BSN1240409', null, 'todo'], [TAG, 'AISLE 2', 'todo']];
const S1 = [...S0.slice(0, 5), [TAG, 'AISLE 2', 'ok']];
const S3 = [['BSN1240403', 'MEZZANINE', 'lost'], ['BSN1240417', 'DOCK DOOR', 'todo'], ['BSN1240409', null, 'todo'], [TAG, 'AISLE 2', 'ok'], ['BSN1240412', 'AISLE 2', 'ok'], ['BSN1240415', 'BAY 7020', 'ok']];
const S4 = [['BSN1240403', 'MEZZANINE', 'lost'], ['BSN1240409', null, 'todo'], [TAG, 'AISLE 2', 'ok'], ['BSN1240412', 'AISLE 2', 'ok'], ['BSN1240415', 'BAY 7020', 'ok'], ['BSN1240417', 'DOCK DOOR', 'ok']];
const Z1 = [['BSN1240403', 'MEZZANINE', 'lost'], ['BSN1240412', 'AISLE 2', 'todo'], ['BSN1240417', 'DOCK DOOR', 'todo'], ['BSN1240409', null, 'todo'], [TAG, 'AISLE 2', 'todo'], ['BSN1240415', 'AISLE 4', 'ok']];
const Z2 = [['BSN1240412', 'AISLE 2', 'todo'], ['BSN1240417', 'DOCK DOOR', 'todo'], ['BSN1240409', null, 'todo'], [TAG, 'AISLE 2', 'todo'], ['BSN1240415', 'AISLE 4', 'ok'], ['BSN1240403', 'AISLE 4', 'ok']];
function swList(cs) {
  const z = {}; for (const c of cs) (z[c[1] || tx('Not parked')] ||= []).push(c);
  const st = s => s === 'ok' ? tx('Seen') : s === 'lost' ? tx('Not seen {age}', { age: tx('{n}d', { n: 9 }) }) : tx('To find');
  return `<div class="cg2-swl">${Object.entries(z).map(([name, g]) => `<div class="cg2-zn"><div class="cg2-zh">${name}<span>${tx('{n} of {total}', { n: g.filter(c => c[2] === 'ok').length, total: g.length })}</span></div>` +
    g.map(([id, , s]) => `<div class="cg2-sr cg2-${s}" data-id="${id}"><span class="cg2-si">${ai(s === 'ok' ? 'check' : s === 'lost' ? 'alert' : 'clock')}</span><b>${id}</b><span class="cg2-st">${st(s)}${s === 'ok' ? '' : ` <span class="cg2-btn cg2-seen">${tx('Seen')}</span>`}</span></div>`).join('') + '</div>').join('')}</div>`;
}
function sweep({ running = false, n = 0, cs = S0, zone = '', typed = '' } = {}) {
  const today = cs.filter(c => c[2] === 'ok').length, total = cs.length;
  const zb = `<span class="cg2-btn cg2-zone">${ai('pin')}${zone ? tx('Zone <b>{zone}</b>', { zone }) : tx('Set zone')}</span>`;
  const ctl = running ? `<div class="cg2-ct"><b>${tx('Sweep running')}</b><span>· ${tx('{n} of {total} seen', { n, total })}</span><small>${tx('started {time}', { time: at(7, 58) })} · d_k0hcvxemtl5c</small></div><span class="cg2-btn cg2-pri cg2-fin">${ai('check')}${tx('Finish sweep')}</span>${zb}`
    : `<div class="cg2-ct"><b>${tx('No sweep running')}</b><small>${tx('Start one, then scan every cage tag in the room')}</small></div><span class="cg2-btn cg2-pri cg2-start">${ai('listcheck')}${tx('Start a sweep')}</span>${zb}`;
  return head(tx('Cage sweep'), tx('{n} of {total} seen today', { n: today, total })) + `<div class="cg2-cs">${tabs('sweep')}<div class="cg2-ctl">${ctl}</div>` +
    `<div class="cg2-prog"><div class="cg2-big"><b>${today}</b><span>${tx('of {total} seen', { total })}</span></div><div class="cg2-track"><i style="width:${Math.round(today / total * 100)}%"></i></div></div>` +
    scanBox({ cap: tx('Scan a cage tag'), ph: tx('Cage tag'), val: typed, hint: tx('Or tap Seen on the cage in front of you') }) + swList(cs) + '</div>';
}

// ── over the phone: the camera, the browser's dialogs ────────────────
const carton = (kc, desc, qty) => `<div class="cg2-ctn"><div class="cg2-lab"><div class="cg2-l1">${desc}</div><div class="cg2-l2">KEYCODE <b>${kc}</b><span>QTY ${qty}</span></div>${bars(kc)}<div class="cg2-l3">${kc}</div></div></div>`;
const camera = () => `<div class="cam2 cg2-camx" hidden><div class="cam2-top"><b>${tx('Scan with the camera')}</b><span>${ai('bolt')}</span><span data-camx>${ai('x')}</span></div>` +
  `<div class="cam2-v"><div class="cg2-csc">${carton('42977636', '12PK DIECAST VEHICLES', 6)}${carton('43302210', 'PAPER PLATES 20PK', 12)}</div><div class="cam2-aim"></div><div class="cam2-hint">${tx('Point the camera at the barcode')}</div></div>` +
  `<div class="cam2-f"><span>${tx('Or type the code')}</span><span>${ai('arrow')}</span></div><div class="cam2-t"></div></div>`;
// The browser's confirm or prompt: its words, a field for a prompt, Cancel and OK.
const dialog = (text, field = null) => `<div class="cg2-dlg"><p>${text}</p>${field === null ? '' : `<span class="cg2-df"><span class="cg2-dt">${field}</span></span>`}<div class="cg2-db"><span>${tx('Cancel')}</span><span class="cg2-ok">${tx('dialog button::OK')}</span></div></div>`;
const ask = (c, text, field) => { c.html('.cg2-dw', dialog(text, field)); c.show('.cg2-dw'); };
const shut = c => c.hide('.cg2-dw');
// The sheets: the product pop-up (openProduct() in common.js) and I moved some (openFound() in recallflag.js).
const shHead = (title, sub = '', icon = '') => `<div class="cg2-shh">${icon}<div class="cg2-sht"><b>${title}</b>${sub}</div><span class="cg2-x">${ai('x')}</span></div>`;
const product = kc => shHead(N[kc], `<span class="cg2-ppk">${kc}${ai('clip')}</span>`) + `<div class="cg2-shb"><div class="cg2-img">${ai('box')}<small>${tx('No photo')}</small></div></div>` +
  `<div class="cg2-shf"><span class="cg2-wide cg2-pri">${tx('Open on kmart.com.au')}${ai('ext')}</span><span class="cg2-wide">${tx('Copy keycode')}</span></div>`;
const found = (n = 1, where = '') => shHead(tx('Moved to the recall bay'), '', `<span class="cg2-shi">${ai('alert')}</span>`) +
  `<div class="cg2-shb"><div class="cg2-pbs">${ai('alert')}<div><b>${tx('Recalled')} · Bubble Wand Set</b><span>${tx('Recall bay: {bay}', { bay: 'BAY 7001' })}</span></div></div>` +
  `<span class="cg2-lbl">${tx('How many did you move?')}</span><div class="cg2-rcn"><span>−</span><b class="cg2-n">${n}</b><span class="cg2-rplus">+</span></div>` +
  `<span class="cg2-lbl">${tx('Where were they?')}</span><span class="cg2-rw${where ? '' : ' cg2-ph'}"><span class="cg2-wt">${where || tx('Bay or shelf, like 7036 or A16 S2')}</span></span>` +
  `<p class="cg2-note">${tx('Then tell a manager, so they know it has been moved.')}</p></div>` +
  `<div class="cg2-shf"><span class="cg2-wide cg2-pri cg2-save">${ai('check')}${tx('Save')}</span><span class="cg2-wide">${tx('Cancel')}</span></div>`;
// A toast, above the tabs as the app shows it on this screen (red when refused).
const say = (c, t, tone = '') => toast2(c, t, tone);
// The finger leaves the screen when what it tapped has gone.
const off = c => c.cls('.fg', 'show', false);
// The view scrolled, as the real screen is once its field has the focus.
const scroll = (c, id, y) => c.style(`#${id} .cg2-sc`, 'transform', y ? `translateY(-${y}px)` : '');
// Typing into a drawn field (the picker's, the product's or the sweep's).
const typeIn = async (c, id, text) => { await c.tap(`#${id} .cg2-in`); c.cls(`#${id} .cg2-in`, 'cg2-ph', false); await c.type(`#${id} .cg2-in .cg2-t`, text); };

// The phone: the three screens, the camera and the dialog over them.
const view = (id, html, shown) => `<div class="v cg2-v" id="${id}"${shown ? '' : ' hidden'}><div class="cg2-sc">${html}</div></div>`;
const phone = ({ on = 'pk', pk = picker(), tg = '', sw = '' } = {}) => phone2('cg2', view('cg2-pk', pk, on === 'pk') + view('cg2-tg', tg, on === 'tg') + view('cg2-sw', sw, on === 'sw'),
  { area: 'stockroom', on: 'cages', extra: camera() + '<div class="cg2-dw" hidden></div>' });
const paint = (c, id, html, y = 0) => { c.html(`#${id} .cg2-sc`, html); scroll(c, id, y); };

// What is on the new cage as the chapter goes on.
const I2 = { 42977636: 1, 43302210: 1 }, I3 = { ...I2, 43199310: 3 }, I4 = { ...I3, 43166022: 1 };

// ── the chapter ──────────────────────────────────────────────────────
export const cages = {
  id: 'cages', grp: 'stockroom', icon: 'cage', title: tx('Cages'), device: 'phone', where: tx('Phone · Stockroom › Cages'), for: ['stockroom'],
  intro: S(tx('Every cage has a tag and a coloured ring.'), tx('Scan stock on, park it, and sweep the room so nothing goes missing.')),
  html: () => phone(),
  steps: [
    { cap: tx('Cages opens on Cage scan: the open cages, oldest first.'), read: S(tx('Each row is a cage: its ring, its tag, where it is parked and how many units are on it.'), tx('Use picks one to add to.')),
      dev: 'With no cage chosen, <b>mobile()</b> in js/views/stockroom/cages.js lists the open cages by when they were last seen (the first eight).', ev: [],
      run: async c => { await c.wait(900); } },
    { cap: tx('A new cage: pick its ring, then scan its tag.'), read: S(tx('Pick its ring: New lines, Overstock, Can’t work or Online picks.'), tx('Then scan the cage’s tag with the camera, or type it.')),
      dev: 'The ring is the coloured ring on the cage (<b>RINGS</b> in shared/reducers/stockroom.js); the tag goes to <b>pickCage()</b>, and an SSCC label counts as its 18 digits (<b>tagOf()</b>).', ev: [],
      run: async c => { await c.tap('#cg2-pk .cg2-rp [data-v="overstock"]'); c.cls('#cg2-pk .cg2-rp .cg2-ring', 'cg2-ron', false); c.cls('#cg2-pk .cg2-rp [data-v="overstock"] .cg2-ring', 'cg2-ron', true);
        await typeIn(c, 'cg2-pk', TAG); off(c); ask(c, tx('{cage} is not an open cage. Open it now with a {ring} ring?', { cage: TAG, ring: tx('Overstock') })); } },
    { cap: tx('A tag not on the register opens a new cage: tap OK.'), read: S(tx('A tag the store hasn’t seen opens a new cage.'), tx('The cage is ready to fill: its tag, its ring and where it is parked.')),
      dev: 'A plain confirm, then <b>cage.create</b>. A tag that is already an open cage just opens it.', ev: [E('cage.create', 'stockroom', { cage: TAG }, { ring: 'overstock' })],
      run: async c => { await c.tap('.cg2-dw .cg2-ok'); off(c); shut(c); paint(c, 'cg2-tg', target()); c.view('cg2-tg'); paint(c, 'cg2-pk', picker({ on: 'overstock' })); } },
    { cap: tx('Tap the camera and scan each carton: it keeps reading.'), read: S(tx('Each carton you scan goes on the cage, one unit a scan.'), tx('The camera stays open and counts what it has read.')),
      dev: 'The camera button is <b>camButton()</b> in js/ui.js; <b>openScanner()</b> (js/scan.js) stays open here and presses Enter in the field for each code, so <b>scanOnto()</b> takes it as if typed.',
      ev: [E('cage.scan', 'stockroom', { cage: TAG }, { keycode: '42977636', qty: 1 }), E('cage.scan', 'stockroom', { cage: TAG }, { keycode: '43302210', qty: 1 })],
      run: async c => { await c.tap('#cg2-tg .cg2-cam'); off(c); c.cls('.cg2-camx', 'cg2-pan', false); c.html('.cg2-camx .cam2-t', ''); c.show('.cg2-camx'); await c.wait(900); c.cls('.cg2-camx', 'hit', true); c.html('.cg2-camx .cam2-t', tally(1, '42977636')); await c.wait(400); c.cls('.cg2-camx', 'hit', false);
        c.cls('.cg2-camx', 'cg2-pan', true); await c.wait(1300); c.cls('.cg2-camx', 'hit', true); c.html('.cg2-camx .cam2-t', tally(2, '43302210')); await c.wait(400); c.cls('.cg2-camx', 'hit', false); } },
    { cap: tx('Close the camera: the cartons are on the cage.'), read: S(tx('The green card shows the last one added.'), tx('The list shows what is on it and how many.')),
      dev: '<b>addLine()</b> sends one <b>cage.scan</b> a read; the green card is the last line sent, with its name from the catalogue (<b>ensureNames()</b>).', ev: [],
      run: async c => { await c.tap('.cg2-camx [data-camx]'); off(c); c.hide('.cg2-camx'); paint(c, 'cg2-tg', target({ items: I2, last: ['43302210', 1] })); } },
    { cap: tx('Several of one product? Set the count, then scan or type it.'), read: S(tx('Plus and minus set how many go on with the next scan.'), tx('Add puts on a typed keycode; the count goes back to one after.')),
      dev: 'The count is the view’s own (st.qty in cages.js), sent as qty with the next <b>cage.scan</b>.', ev: [E('cage.scan', 'stockroom', { cage: TAG }, { keycode: '43199310', qty: 3 })],
      run: async c => { for (const q of [2, 3]) { await c.tap('#cg2-tg .cg2-plus'); c.html('#cg2-tg .cg2-tools', step(q)); }
        await typeIn(c, 'cg2-tg', '43199310'); await c.tap('#cg2-tg .cg2-add'); off(c); paint(c, 'cg2-tg', target({ items: I3, last: ['43199310', 3] })); } },
    { cap: tx('An item barcode? The phone finds it on kmart.com.au.'), read: S(tx('A shelf talker or clearance ticket carries the item’s own barcode, not its keycode.'), tx('It can take up to half a minute.')),
      dev: '<b>gs1Parse()</b> (shared/gs1.js) reads it as an item barcode; with no pair for it, <b>searchBarcode()</b> (js/barcodesearch.js) asks the worker, which renders Kmart’s site search (<b>findByBarcode()</b> in worker/apnlookup.js).',
      ev: [R(`GET /v1/catalogue/barcode?code=${APN}`, null, 'Kmart’s site search for the barcode; the answer is cached by barcode, so the next scan of it is quick.')],
      run: async c => { await typeIn(c, 'cg2-tg', APN); off(c); paint(c, 'cg2-tg', target({ items: I3, bc: searching() }), 100); await c.wait(1400); paint(c, 'cg2-tg', target({ items: I3, bc: choose() }), 300); } },
    { cap: tx('Tap the right product: it goes on the cage.'), read: S(tx('One sure match goes straight on; otherwise you choose.'), tx('None of these lets you type the keycode instead.')),
      dev: '<b>barcodeCard()</b> draws the choice; the pick goes on as <b>cage.scan</b> with apn, so the cage’s log names the barcode. Nothing is paired: no screen has sent <b>cage.pair</b> since 25 October.',
      ev: [E('cage.scan', 'stockroom', { cage: TAG }, { keycode: '43166022', qty: 1, apn: APN })],
      run: async c => { await c.tap('#cg2-tg .cg2-pick[data-kc="43166022"]'); off(c); paint(c, 'cg2-tg', target({ items: I4, last: ['43166022', 1] }), 300); } },
    { cap: tx('Tap a keycode to see the product.'), read: S(tx('The pop-up shows its name, photo and price, and the stockroom bays it is in on the latest report.'), tx('Copy keycode copies it; Open on kmart.com.au opens its page.')),
      dev: 'On a phone a tap on a keycode or a name opens <b>openProduct()</b> in js/views/stockroom/common.js, the shared sheet from the bottom.', ev: [],
      run: async c => { await c.tap('#cg2-tg .cg2-li[data-kc="43199310"] u'); off(c); sheet(c, product('43199310')); } },
    { cap: tx('Done · park: say where the cage stands.'), read: S(tx('Done asks where the cage is parked: an aisle or a spot.'), tx('Park here moves it any time.'), tx('The phone is then ready for the next cage.')),
      dev: 'Done asks only when the cage isn’t parked (a plain prompt), sends <b>cage.park</b> and lets the cage go. Placing a cage on the store map is on the PC.', ev: [E('cage.park', 'stockroom', { cage: TAG }, { location: 'AISLE 2' })],
      run: async c => { await c.tap('.p2-sheet .cg2-x'); unsheet(c); await c.tap('#cg2-tg .cg2-done'); ask(c, tx('Park {cage} at (aisle or spot)', { cage: TAG }), ''); await c.type('.cg2-dw .cg2-dt', 'AISLE 2'); await c.tap('.cg2-dw .cg2-ok'); off(c); shut(c);
        paint(c, 'cg2-pk', picker({ on: 'overstock', fresh: true }), 110); c.view('cg2-pk'); c.html('#cg2-tg .cg2-sc', ''); } },
    { cap: tx('Sweep: start one, then walk the room.'), read: S(tx('Start a sweep and scan each tag you pass.'), tx('Only one sweep runs at a time in the store.')),
      dev: '<b>cage.sweepStart</b> opens a sweep under a new id; another phone’s start is refused while one runs (sweep_open).', ev: [E('cage.sweepStart', 'stockroom', { sweep: SW }, {})],
      run: async c => { scroll(c, 'cg2-pk', 0); await c.tap('#cg2-pk .cg2-tsw'); paint(c, 'cg2-sw', sweep()); c.view('cg2-sw'); await c.wait(500); await c.tap('#cg2-sw .cg2-start'); off(c); paint(c, 'cg2-sw', sweep({ running: true })); say(c, tx('Sweep started: scan every cage tag you pass')); } },
    { cap: tx('Scan each cage tag you pass, or tap Seen.'), read: S(tx('Each cage you scan turns Seen, under the place it is parked.'), tx('The big number counts the cages seen today.')),
      dev: '<b>sweepTag()</b> sends <b>cage.sweep</b> with the sweep and any zone (<b>sweepPayload()</b>); Seen in the list sends the same.', ev: [E('cage.sweep', 'stockroom', { cage: TAG }, { session: SW }, { n: 4 })],
      run: async c => { await typeIn(c, 'cg2-sw', TAG); off(c); paint(c, 'cg2-sw', sweep({ running: true, n: 1, cs: S1 })); say(c, tx('{cage} seen', { cage: TAG })); await c.wait(900);
        paint(c, 'cg2-sw', sweep({ running: true, n: 3, cs: S3 }), 360); say(c, tx('{cage} seen', { cage: 'BSN1240415' })); await c.wait(700);
        await c.tap('#cg2-sw .cg2-sr[data-id="BSN1240417"] .cg2-seen'); off(c); paint(c, 'cg2-sw', sweep({ running: true, n: 4, cs: S4 }), 360); say(c, tx('{cage} seen', { cage: 'BSN1240417' })); } },
    { cap: tx('Finish the sweep: cages not seen are marked missing.'), read: S(tx('Finish asks first when cages are still to find.'), tx('A cage missed on two sweeps in a row is lost; the PC shows both.')),
      dev: '<b>cage.sweepEnd</b>: every open cage not seen, opened before the sweep began, is missing, and lost on its second miss. The PC’s Sweeps card keeps the last five.', ev: [E('cage.sweepEnd', 'stockroom', { sweep: SW }, {})],
      run: async c => { scroll(c, 'cg2-sw', 0); await c.tap('#cg2-sw .cg2-fin'); off(c); ask(c, txn(2, '{n} cage has not been seen on this sweep. Finish anyway? It is marked missing.', '{n} cages have not been seen on this sweep. Finish anyway? They are marked missing.'));
        await c.wait(600); await c.tap('.cg2-dw .cg2-ok'); off(c); shut(c); paint(c, 'cg2-sw', sweep({ cs: S4 })); say(c, `${tx('Sweep done · {n} of {total} seen', { n: 4, total: 6 })} · ${tx('{n} missing', { n: 2 })}`); } },
  ],
  whatif: [[tx('Picked the wrong cage?'), tx('Change cage goes back to the list; scanning another cage’s tag switches to it.')],
    [tx('The tag fell off?'), tx('Re-tag it on a PC, from the cage in Cages: it keeps what is on it.')],
    [tx('Finished with a cage?'), tx('Close it on a PC once it is empty: Emptied · close cage.')]],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
// The cage is parked in AISLE 2 with its four lines; a ticket's barcode kmart.com.au doesn't know.
const PARKED = () => phone({ on: 'tg', tg: target({ items: I4, loc: 'AISLE 2' }) });
cages.stories.push({
  id: 'nobarcode', title: tx('What if the barcode isn’t on kmart.com.au?'), blurb: tx('The search says so, and you type the keycode from the ticket instead.'),
  know: [tx('The phone searches kmart.com.au for an item barcode it can’t match to a keycode.'),
    tx('A sure match goes on at once; other matches are a choice; with none, or no answer, you type the keycode.'),
    tx('Couldn’t search means the site wasn’t reached: Search again, or type the keycode.'),
    tx('The keycode is on the ticket, the shelf label or the carton.'),
    tx('Nothing is linked to the barcode: the next scan of it searches again, and comes back quicker.')],
  html: PARKED,
  steps: [
    { cap: tx('Scan the item barcode: the phone searches for it.'), read: S(tx('Here the barcode is {code}.', { code: APN2 }), tx('It can take up to half a minute.')),
      dev: '<b>searchBarcode()</b> waits up to 50 seconds; the worker finishes the search and caches it even if the phone stops waiting.', ev: [R(`GET /v1/catalogue/barcode?code=${APN2}`, null, 'No results: the answer is cached for a day.')],
      run: async c => { await typeIn(c, 'cg2-tg', APN2); off(c); paint(c, 'cg2-tg', target({ items: I4, loc: 'AISLE 2', bc: searching() }), 100); } },
    { cap: tx('Not found on kmart.com.au: type its keycode.'), read: S(tx('The card says why and shows the barcode it searched for.'), tx('Nothing went on the cage.')),
      dev: '<b>barcodeCard()</b>: none (no results) or failed (not reached); failed adds Search again.', ev: [],
      run: async c => { await c.wait(900); paint(c, 'cg2-tg', target({ items: I4, loc: 'AISLE 2', bc: notFound(APN2) }), 100); } },
    { cap: tx('Type the keycode from the ticket, then Add.'), read: S(tx('It goes on like any keycode, with the count in the stepper.'), tx('The green card shows it was added.')),
      dev: '<b>scanOnto()</b>: digits that are not an item barcode or a cage tag go on as a keycode (<b>parseKeycodes()</b> in shared/backfill.js).', ev: [E('cage.scan', 'stockroom', { cage: TAG }, { keycode: '43302210', qty: 1 })],
      run: async c => { scroll(c, 'cg2-tg', 0); await typeIn(c, 'cg2-tg', '43302210'); await c.tap('#cg2-tg .cg2-add'); off(c); paint(c, 'cg2-tg', target({ items: { ...I4, 43302210: 2 }, loc: 'AISLE 2', last: ['43302210', 1] }), 100); } },
  ],
});
cages.stories.push({
  id: 'recall', title: tx('What if the product is recalled?'), blurb: tx('It never goes on the cage: a red flag says to move it to the recall bay.'),
  know: [tx('Every phone holds the store’s list of recalls and withdrawals, so the flag needs no signal.'),
    tx('It is checked by keycode and by the item’s own barcode, before anything is sent.'),
    tx('Nothing goes on the cage: take it to the recall bay the flag names.'),
    tx('I moved some records how many you moved and where they were; then tell a manager.'),
    tx('Managers add recalls and see every find on the Recalls screen.')],
  html: PARKED,
  steps: [
    { cap: tx('Scan a recalled product: a red flag, and nothing is added.'), read: S(tx('The flag names the recall and the recall bay.'), tx('Don’t put it on the cage.')),
      dev: '<b>recallFor()</b> (js/recallflag.js) checks the keycode or the barcode against the store’s list before anything is sent; <b>flagRecall()</b> shows <b>recallFlag()</b>.', ev: [],
      run: async c => { await typeIn(c, 'cg2-tg', '43350142'); off(c); paint(c, 'cg2-tg', target({ items: I4, loc: 'AISLE 2', bc: flag() }), 100); } },
    { cap: tx('Moved it? Tap I moved some.'), read: S(tx('Say how many went to the recall bay and where they were.'), tx('Here two came out of a carton for this cage.')),
      dev: '<b>openFound()</b> in js/recallflag.js: the shared sheet, the same on every screen that flags a recall.', ev: [],
      run: async c => { await c.tap('#cg2-tg .cg2-moved'); off(c); sheet(c, found()); await c.wait(400); await c.tap('.p2-sheet .cg2-rplus'); c.text('.p2-sheet .cg2-n', '2'); await c.tap('.p2-sheet .cg2-rw'); c.cls('.p2-sheet .cg2-rw', 'cg2-ph', false); await c.type('.p2-sheet .cg2-wt', 'AISLE 2'); off(c); } },
    { cap: tx('Save: the find is recorded, then tell a manager.'), read: S(tx('The recall counts every find, from every phone.'), tx('The flag stays until the next product goes on the cage.')),
      dev: 'One <b>recall.found</b> with the count and where; the first find moves the recall to removing.', ev: [E('recall.found', 'floor', { recall: RC }, { kc: '43350142', n: 2, where: 'AISLE 2' })],
      run: async c => { await c.tap('.p2-sheet .cg2-save'); off(c); unsheet(c); say(c, tx('Saved. Now tell a manager.')); } },
  ],
});
cages.stories.push({
  id: 'zone', title: tx('What if a cage turns up somewhere else on a sweep?'), blurb: tx('Set your zone: a cage scanned there moves to it, and a missing one is found again.'),
  know: [tx('Set zone once where you are standing; every tag you scan after that is seen there.'),
    tx('The zone stays set on this phone while the app is open.'),
    tx('A cage parked somewhere else moves to your zone, and the sweep counts it as moved.'),
    tx('A cage not seen on a sweep is missing, and lost after two sweeps in a row; scanned again, it is found.'),
    tx('A tag that isn’t on the register is refused on a sweep: a sweep never opens a cage.')],
  html: () => phone({ on: 'sw', sw: sweep({ running: true }) }),
  steps: [
    { cap: tx('Set zone: type where you are standing.'), read: S(tx('An aisle, a bay or an area, like {zone}.', { zone: 'AISLE 4' }), tx('The button shows the zone from then on.')),
      dev: 'The zone is the phone’s own (st.zone in cages.js, a plain prompt); <b>sweepPayload()</b> sends it as location with every sweep scan.', ev: [],
      run: async c => { await c.tap('#cg2-sw .cg2-zone'); ask(c, tx('Which zone are you in? (aisle, bay or area: a cage scanned here that was parked elsewhere is moved here)'), ''); await c.type('.cg2-dw .cg2-dt', 'AISLE 4'); await c.tap('.cg2-dw .cg2-ok'); off(c); shut(c); paint(c, 'cg2-sw', sweep({ running: true, zone: 'AISLE 4' })); } },
    { cap: tx('Scan a cage parked somewhere else: it moves to your zone.'), read: S(tx('{cage} was parked in {from}; now it is in {to}.', { cage: 'BSN1240415', from: 'BAY 7020', to: 'AISLE 4' }), tx('The message says where it moved from.')),
      dev: 'The <b>cage.sweep</b> reducer moves a cage seen somewhere else, counts it in the sweep’s moved list and clears any map point.', ev: [E('cage.sweep', 'stockroom', { cage: 'BSN1240415' }, { session: SW2, location: 'AISLE 4' })],
      run: async c => { await typeIn(c, 'cg2-sw', 'BSN1240415'); off(c); paint(c, 'cg2-sw', sweep({ running: true, n: 1, cs: Z1, zone: 'AISLE 4' }), 400); say(c, `${tx('{cage} seen', { cage: 'BSN1240415' })} · ${tx('moved {from} → {to}', { from: 'BAY 7020', to: 'AISLE 4' })}`); } },
    { cap: tx('A cage that was missing is found again.'), read: S(tx('{cage} was missed on the last sweep.', { cage: 'BSN1240403' }), tx('Seen here, it is found again and moves to your zone too.')),
      dev: 'A missing or lost cage seen again is logged as found and counted in the sweep’s found list.', ev: [E('cage.sweep', 'stockroom', { cage: 'BSN1240403' }, { session: SW2, location: 'AISLE 4' })],
      run: async c => { scroll(c, 'cg2-sw', 0); await typeIn(c, 'cg2-sw', 'BSN1240403'); off(c); paint(c, 'cg2-sw', sweep({ running: true, n: 2, cs: Z2, zone: 'AISLE 4' }), 360);
        say(c, `${tx('{cage} seen', { cage: 'BSN1240403' })} · ${tx('moved {from} → {to}', { from: 'MEZZANINE', to: 'AISLE 4' })} · ${tx('found again')}`); } },
  ],
});
