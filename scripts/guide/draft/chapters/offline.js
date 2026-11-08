// Chapter: When the wifi drops, on a phone, as the app has it today: the
// outbox (client/store.js: each change applied on the phone at once, kept in
// IndexedDB and sent in order when the connection is back), the sync pill and
// its sheet (js/sync.js pillState and syncPanel, js/shell.js paintStatus), the
// app opening again with no wifi (sw.js serves the release from its cache;
// js/shell.js showContinue). Two What ifs: another phone on the same shelf, and
// a change that waits for a code.
// The day: Busselton 1241, Sunday 25 October 2026, week 2026-W43; Floor ›
// Refresh in the Kitchen (js/guide/refresh-map.js), 23 of 100 done, focus H1
// and K2, as the Location refresh chapter has it.
// Every class here starts of2- (scripts/guide/draft/css/offline.css); the map
// and the strip use the Location refresh chapter's rf- styles.
import { tx, txn } from '../../i18n.js';
import { fmtDate } from '../../ui.js';
import { ai, phone2, sheet, unsheet, toast2 } from '../frames.js';
import { mapSvg, SHELVES, DEPT, VIEW } from '../refresh-map.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const R = (method, path, body, note) => ({ route: `${method} ${path}`, method, path, body, note });
const WK = '2026-W43', TARGET = 100;
const OFF = { wait: true, why: 'Offline' };
const mark = (segment, extra) => E('refresh.mark', 'floor', { segment, week: WK }, { dept: 'h1' }, extra);
// Kitchen shelves done before the chapter starts; 14 Toys shelves are done elsewhere.
const H1_0 = ['A12 E1', 'A12 E2', 'A12 S1', 'A12 S2', 'A13 S1', 'A13 S2', 'A14 E2', 'A14 S1', 'A14 S2'];
const st = (more = [], sel = '') => ({ done: [...H1_0, ...more], focus: ['h1', 'k2'], sel, view: VIEW });
const count = s => s.done.length + 14;

// ── the frame ────────────────────────────────────────────────────────
const TABS = () => ({
  floor: [['mhome', 'home', tx('Home')], ['refresh', 'm-refresh', tx('Refresh')], ['labelint', 'm-labelint', tx('Labels')], ['picklist', 'm-picklist', tx('Route')], ['emergency', 'm-emergency', tx('Emergency')], ['more', 'dots', tx('More')]],
  stockroom: [['mhome', 'home', tx('Home')], ['bfreview', 'm-backfill', tx('Backfill')], ['cages', 'm-cages', tx('Cages')], ['adjust', 'm-adjust', tx('Adjust')], ['more', 'dots', tx('More')]],
});
const tabs = (a, on) => TABS()[a].map(([k, i, l]) => `<span data-tab="${k}"${k === on ? ' class="on"' : ''}>${ai(i)}${l}</span>`).join('');
// The sync pill in the app bar (index.html #msync): off, busy or bad, or hidden.
const pill = (c, tone, text) => { if (!tone) { c.hide('.of2-pill'); return; } c.html('.of2-pill', `<i></i>${text}`); c.cls('.of2-pill', 'busy', tone === 'busy'); c.cls('.of2-pill', 'bad', tone === 'bad'); c.show('.of2-pill'); };

// ── Floor › Refresh (js/views/refresh.js mobile) ─────────────────────
const badge = s => tx('<b>{n}</b> / {target} this week · focus {depts}', { n: count(s), target: TARGET, depts: 'H1 K2' });
const strip = s => `<span class="rf-st">${ai('m-refresh')}<b>${tx('Refresh')}</b><span class="n">${count(s)} / ${TARGET}</span><span class="s"></span><span class="rf-act go">${ai('barcode')}${tx('Scan or type')}</span></span><span class="rf-tog">${ai('chev', 'up')}</span>`;
const tools = () => `<div class="rf-tools"><span class="scan">${ai('barcode')}</span><span>${ai('plus')}</span><span>${ai('minus')}</span><span>${ai('map')}</span></div>`;
const refreshView = s => `<div class="v rf-mv" id="of2-rf"><div class="rf-map">${mapSvg(s)}</div><div class="rf-badge">${badge(s)}</div>${tools()}</div>`;
const paint = (c, s) => { c.html('#of2-rf .rf-map', mapSvg(s)); c.html('.rf-badge', badge(s)); c.html('.p2-strip', strip(s)); };
const scanSheet = (last = '') => `<div class="sh-h"><b>${tx('Mark a shelf refreshed')}</b><span class="sh-x">${ai('x')}</span></div>` +
  `<div class="sh-b"><span class="rf-big">${ai('camera')}${tx('Scan with the camera')}</span>` +
  `<div><span class="rf-lbl">${tx('Or type the shelf')}</span><div class="rf-field">${ai('barcode')}<span class="rf-in rf-ph">${tx('e.g. A16 S1')}</span><span class="rf-mark">${tx('Mark')}</span></div></div>` +
  (last ? `<div class="rf-last ok">${ai('check')}<span>${tx('{code} marked refreshed', { code: last })}</span></div>` : `<div class="rf-last">${tx('Each label marks its shelf refreshed for the whole team.')}</div>`) + '</div>';
const typeShelf = async (c, code) => { c.cls('.p2-sheet .rf-in', 'rf-ph', false); await c.type('.p2-sheet .rf-in', code); await c.tap('.p2-sheet .rf-mark'); };

// ── Floor › Home: the store map (Find a shelf) ───────────────────────
const homeMap = () => {
  let r = '', t = '';
  for (const [code, d, x, y, w, h] of SHELVES) {
    r += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${DEPT[d][0]}" stroke="#fff" stroke-width="1.5"/>`;
    if (code) { const [run, sub = ''] = code.split(' '); t += `<text x="${x + w / 2}" y="${y + h / 2 - (sub ? 3 : 0)}" class="rf-lr">${run}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 6}" class="rf-ls">${sub}</text>` : ''}`; }
  }
  return `<svg class="rf-svg" viewBox="${VIEW.join(' ')}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${r}<g>${t}</g></svg>`;
};
const homeView = () => `<div class="v rf-mv" id="of2-home" hidden><div class="rf-map">${homeMap()}</div><span class="of2-chip">${ai('grid')}${tx('All departments')}</span>${tools()}</div>`;
const findStrip = () => `<span class="rf-st">${ai('pin')}<b>${tx('Find a shelf')}</b></span><span class="rf-act">${ai('search')}${tx('Search')}</span><span class="rf-tog">${ai('barcode')}</span><span class="rf-tog">${ai('chev', 'up')}</span>`;

// ── Stockroom: Cage scan and Home ────────────────────────────────────
const cageView = () => `<div class="v of2-cs" id="of2-cage" hidden><div class="of2-hh"><h3>${tx('Cage scan')}</h3><p>${tx('{cage} · scan carton, product or cage tag', { cage: 'BSN1240421' })}</p></div>` +
  `<div class="of2-pills"><span class="on">${ai('barcode')}${tx('Scan')}</span><span>${ai('listcheck')}${tx('Sweep')}</span></div>` +
  `<div class="of2-tgt"><div class="of2-tag"><i></i><b>BSN1240421</b><span>${tx('New lines')}</span></div><div class="of2-where">${ai('pin')}${tx('not parked yet')} · ${tx('seen {ago}', { ago: tx('just now') })}</div>` +
  `<div class="of2-meta">${tx('Opened {time}', { time: '06:31' })} · ${txn(0, '<b>{n} unit</b> on {lines} lines', '<b>{n} units</b> on {lines} lines', { lines: 0 })}</div><div class="of2-acts"><span>${ai('cage')}${tx('Change cage')}</span><span>${ai('parking')}${tx('Park here')}</span></div></div>` +
  `<div class="of2-scan"><span class="of2-scf">${tx('Keycode, item barcode or cage tag')}</span><span class="of2-cam">${ai('camera')}</span></div>` +
  `<div class="of2-on"><b>${tx('On this cage')}</b><span>${txn(0, '{n} unit', '{n} units')} · ${txn(0, '{n} line', '{n} lines')}</span><small>${tx('Nothing yet')}</small></div>` +
  `<span class="of2-done">${ai('check')}${tx('Done · park {cage}', { cage: 'BSN1240421' })}</span></div>`;
const cageStart = () => `<div class="v of2-cs" id="of2-cage0" hidden><div class="of2-hh"><h3>${tx('Cage scan')}</h3><p>${tx('Scan a cage tag to start')}</p></div>` +
  `<div class="of2-pills"><span class="on">${ai('barcode')}${tx('Scan')}</span><span>${ai('listcheck')}${tx('Sweep')}</span></div>` +
  `<div class="of2-box"><div class="of2-boxin"><span class="of2-scf of2-tagf of2-ph">${tx('e.g. BSN1240417')}</span><span class="of2-cam">${ai('camera')}</span></div><small>${tx('A tag that is not on the register opens a new cage')}</small></div>` +
  `<div class="of2-rings"><b>${tx('Ring for a new cage')}</b>${['#7C3AED', '#2563EB', '#DC2626', '#16A34A'].map((c, i) => `<i style="border-color:${c}"${i ? '' : ' class="on"'}></i>`).join('')}</div></div>`;
const htile = (icon, t, s, hot = false) => `<span class="of2-ht${hot ? ' hot' : ''}"><span class="ti">${ai(icon)}</span><span class="tx"><b>${t}</b><span>${s}</span></span>${ai('chev', 'fwd')}</span>`;
const srView = () => `<div class="v of2-home" id="of2-sr" hidden><div class="of2-hh"><h3>${tx('Stockroom')}</h3><p>${fmtDate('2026-10-25')} · ${txn(0, '{n} bay on the board', '{n} bays on the board')}</p></div>` +
  htile('barcode', tx('Backfill scan'), tx('Scan a bay to start'), true) + htile('search', tx('Find a location'), tx('What’s in a bay, and what to pull')) + htile('m-cages', tx('Cages'), tx('Scan cartons onto a cage · {n} open', { n: 1 })) +
  htile('m-adjust', tx('Adjust SOH'), tx('Flag a wrong stock-on-hand · {n} today', { n: 0 })) + htile('m-daylist', tx('Day list'), tx('What to backfill next')) + '</div>';

// ── the sheets and cards ─────────────────────────────────────────────
const head = title => `<div class="of2-shh"><b>${title}</b><span class="of2-x">${ai('x')}</span></div>`;
// Changes on this device (js/sync.js syncPanel): offline, or a change waiting.
function syncSheet({ held = false, rows = [] } = {}) {
  const row = ([type, what, sub]) => `<div class="of2-syr"><div><b>${type} <span>${what}</span></b><small>${sub}</small></div>${held ? `<span class="of2-btn">${tx('Discard')}</span>` : ''}</div>`;
  return head(tx('Changes on this device')) + `<div class="of2-syb"><p class="of2-syh">${ai(held ? 'alert' : 'clock')}<span>${held ? tx('Some changes are waiting for something before they can send.') : tx('Offline. Changes stay on this device and send when the connection is back.')}</span></p>` +
    `<div class="of2-sys">${held ? tx('Waiting · {n}', { n: rows.length }) : tx('To send · {n}', { n: rows.length })}</div><div class="of2-syl">${rows.map(row).join('')}</div>` +
    (held ? `<span class="of2-pri">${ai('refresh')}${tx('Try again now')}</span>` : '') + '</div>';
}
const WS = () => [['floor', tx('Floor'), 'm-map', tx('Map, refresh, labels, routes, stocktake')], ['stockroom', tx('Stockroom'), 'box', tx('Backfill scan, cages, adjustments, day list')], ['backdock', tx('Back dock'), 'truck', tx('Land and decant pallets, run the truck')]];
const launcher = () => head(tx('Where are you working?')) + `<p class="of2-shs">${tx('Pick your area to begin.')} ${tx('Stockroom and Back dock ask for their crew code, which lasts one shift (12 hours) on this device.')}</p>` +
  `<div class="of2-tiles">${WS().map(([k, l, i, s]) => `<span class="of2-ht${k === 'floor' ? ' hot' : ''}" data-ws="${k}"><span class="ti">${ai(i)}</span><span class="tx"><b>${l}</b><span>${s}</span></span>${k === 'floor' ? '' : ai('lock', 'lk')}${ai('chev', 'fwd')}</span>`).join('')}</div>`;
const more = () => head(tx('More')) + `<div class="of2-mob"><div class="of2-who"><span>1241</span><div><b>Busselton · ${tx('Floor')}</b><small>${tx('Signed in on this phone')}</small></div></div>` +
  `<div class="of2-msec">${tx('Tools')}</div><div class="of2-mlist">${[['packages', tx('Live pull'), tx('Ask the stockroom for stock, or pull it')], ['m-stocktake', tx('Stocktake'), tx('Count shelves in a session')], ['edit', tx('Suggest map edits'), tx('A wrong name or a missing shelf')]].map(([i, l, s]) => `<span class="of2-mo">${ai(i)}<b>${l}<small>${s}</small></b>${ai('chev', 'fwd')}</span>`).join('')}</div>` +
  `<div class="of2-mft"><span class="of2-switch">${ai('grid')}${tx('Switch area')}</span><span class="of2-out">${ai('lock')}${tx('Sign out')}</span></div></div>`;
// Welcome back (js/shell.js showContinue) and the Stockroom code (js/unlock.js ensureArea).
const mk = () => `<svg class="of2-vm" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#111827"/><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" fill="none" stroke="#7DD3FC" stroke-width="5.4"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" fill="none" stroke="#22A6D6" stroke-width="5.4"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" fill="none" stroke="#0E7CA8" stroke-width="5.4"/></svg>`;
const welcome = () => `<div class="of2-card"><div class="of2-brand">${mk()}<b>Conduit</b></div><h2>${tx('Welcome back')}</h2><div class="of2-sub">${tx('This device is signed in.')}</div>` +
  `<div class="of2-store"><span class="of2-sav">1241</span><div><b>Busselton</b><small>${tx('Store {no}', { no: '1241' })} · ${tx('Floor')}</small></div><span class="of2-ready">${ai('check')}${tx('Ready')}</span></div>` +
  `<span class="of2-cta of2-cgo">${tx('Continue in {name}', { name: 'Busselton' })}${ai('arrow')}</span><span class="of2-alt">${tx('Use a different store')}</span></div>`;
const code = (val = '') => `<div class="of2-card"><h2>${tx('{area} code', { area: tx('Stockroom') })}</h2><div class="of2-sub">${tx('The {area} crew code opens this workspace on this device for one shift (12 hours), or until the device is signed out or locked after sitting idle.', { area: tx('Stockroom') })} ${tx('A manager code here opens every area; managers can also sign in as Manager to skip this.')}</div>` +
  `<label>${tx('Code')}</label><span class="of2-in${val ? '' : ' of2-ph'}">${val || 'SR-0000'}</span><span class="of2-cta of2-ugo">${tx('Open {area}', { area: tx('Stockroom') })}${ai('arrow')}</span><div class="of2-foot"><span>${tx('Not now')}</span><span>1241</span></div></div>`;
// The low-poly ground behind Welcome back (js/lowpoly.js), a still of it.
const POLY = (() => {
  const J = [[0, 0], [9, -14], [-12, 8], [6, 12], [-8, -6], [14, 4], [-4, 15], [11, -9], [-15, -3], [3, -12]], C = ['#E6ECF1', '#DCE5EC', '#EEF2F6', '#D2DEE7', '#E9EFF4', '#F3F6F9', '#CCDAE5', '#E1E9EF'];
  const pt = (x, y) => (x === 0 || x === 4 || y === 0 || y === 8 ? [x * 97.5, y * 105.5] : [x * 97.5 + J[(x * 3 + y) % 10][0] * 2, y * 105.5 + J[(x + y * 7) % 10][1] * 2]);
  let s = '<svg class="of2-poly" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const a = pt(x, y), b = pt(x + 1, y), d = pt(x, y + 1), e = pt(x + 1, y + 1), k = x * 5 + y * 3;
    s += `<polygon points="${a} ${b} ${e}" fill="${C[k % 8]}"/><polygon points="${a} ${e} ${d}" fill="${C[(k + 3) % 8]}"/>`;
  }
  return s + '</svg>';
})();
const cover = (c, html, plain = false) => { c.html('.of2-cov', (plain ? '' : POLY) + html); c.cls('.of2-cov', 'plain', plain); c.show('.of2-cov'); };
const uncover = c => c.hide('.of2-cov');

const phone = ({ s = st(), at = 'rf', tone = '', text = '' } = {}) => {
  const area = at === 'rf' || at === 'home' ? 'floor' : 'stockroom';
  let h = phone2('of2', refreshView(s) + homeView() + cageStart() + cageView() + srView(), { area: 'floor', on: 'refresh', strip: strip(s), extra: '<div class="of2-cov" hidden></div>' })
    .replace('<span class="p2-ib">?</span>', `<span class="of2-pill${tone ? ' ' + tone : ''}"${tone ? '' : ' hidden'}><i></i>${text}</span><span class="p2-ib">?</span>`);
  if (at !== 'rf') h = h.replace('id="of2-rf"', 'id="of2-rf" hidden').replace(`id="of2-${at}" hidden`, `id="of2-${at}"`);
  if (area !== 'floor') h = h.replace(/<nav class="p2-tabs">[\s\S]*?<\/nav>/, `<nav class="p2-tabs">${tabs(area, at.startsWith('cage') ? 'cages' : 'mhome')}</nav>`).replace('<div class="p2-strip">', '<div class="p2-strip" hidden>');
  return h;
};
// Steps that tap nothing leave no ring from the step before.
const noRing = c => c.cls('.fg', 'show', false);
const toFloorHome = c => { c.view('of2-home'); c.html('.p2-tabs', tabs('floor', 'mhome')); c.html('.p2-strip', findStrip()); c.show('.p2-strip'); };

// ── the chapter ──────────────────────────────────────────────────────
const S1 = st(['A15 S1']), S2 = st(['A15 S1', 'A15 S2']), S3 = st(['A15 S1', 'A15 S2', 'A16 S1']);
// The rows name each change in words, as the app does (js/sync.js changeLabel).
const ROWS = () => [[tx('Shelf refreshed'), `A15 S1 · ${WK}`, tx('made {time}', { time: '06:41' })], [tx('Shelf refreshed'), `A15 S2 · ${WK}`, tx('made {time}', { time: '06:42' })]];
export const offline = {
  id: 'offline', grp: 'start', icon: 'nowifi', title: tx('When the wifi drops'), device: 'phone', where: tx('Phone · any screen'), for: ['floor', 'stockroom', 'dock', 'manager'],
  intro: S(tx('Nothing stops when the wifi does.'), tx('Work saves on the phone and sends itself when it can.')),
  html: () => phone(),
  steps: [
    { cap: tx('The wifi drops: the pill at the top says Offline.'), read: tx('The pill only shows when there is something to say: offline, sending, or a change waiting.'),
      dev: 'The browser’s offline event sets the store’s status (client/store.js); <b>pillState()</b> in js/sync.js words the pill and <b>paintStatus()</b> in js/shell.js shows it.', ev: [],
      run: async c => { await c.wait(500); pill(c, 'off', tx('Offline')); } },
    { cap: tx('Keep working: Scan or type marks a shelf as usual.'), read: S(tx('The shelf turns green and the week counts it straight away.'), tx('Marks, scans and checks save on the phone straight away.')),
      dev: 'The store’s dispatch (client/store.js) checks the event with the shared reducers, applies it on the phone and keeps it in the outbox in IndexedDB.', ev: [mark('A15 S1', OFF)],
      run: async c => { await c.tap('.p2-strip .rf-act'); sheet(c, scanSheet()); await typeShelf(c, 'A15 S1'); paint(c, S1); c.html('.p2-sheet', scanSheet('A15 S1')); pill(c, 'off', tx('Offline · {n}', { n: 1 })); } },
    { cap: tx('The next shelf: the pill counts what is waiting.'), read: tx('A pill at the top counts what is waiting to send.'),
      dev: 'Each change is its own event with its own id, so nothing is sent twice.', ev: [mark('A15 S2', OFF)],
      run: async c => { await typeShelf(c, 'A15 S2'); paint(c, S2); c.html('.p2-sheet', scanSheet('A15 S2')); pill(c, 'off', tx('Offline · {n}', { n: 2 })); } },
    { cap: tx('Close the sheet: both shelves are green.'), read: tx('The strip and the badge count the week.'), dev: 'Local state is the last snapshot with the outbox replayed on top.', ev: [],
      run: async c => { await c.tap('.p2-sheet .sh-x'); unsheet(c); } },
    { cap: tx('Tap the pill: the changes waiting on this phone.'), read: S(tx('Each change is listed with the time it was made.'), tx('Waiting changes send in the order they were made.')),
      dev: '<b>syncPanel()</b> in js/sync.js; the same list opens from the footer on a PC.', ev: [],
      run: async c => { await c.tap('.of2-pill'); sheet(c, syncSheet({ rows: ROWS() })); } },
    { cap: tx('A closed app opens again without wifi.'), read: S(tx('The app is installed on the phone, so it opens from there, not from the internet.'), tx('Ready means the store’s data is on the phone too.')),
      dev: 'sw.js serves the whole release from its cache, cache-first; the session, the store’s snapshot and the outbox are in IndexedDB. <b>showContinue()</b> in js/shell.js needs no network.', ev: [],
      run: async c => { await c.tap('.p2-sheet .of2-x'); unsheet(c); cover(c, welcome()); } },
    { cap: tx('Continue: the store opens, and the two marks are still waiting.'), read: tx('Waiting changes are kept on the phone.'),
      dev: 'Opening the store loads the snapshot and the outbox from the phone (load in client/store.js) before it tries to connect.', ev: [],
      run: async c => { await c.tap('.of2-cgo'); uncover(c); toFloorHome(c); } },
    { cap: tx('Back in range: it all sends by itself.'), read: S(tx('Nobody has to press anything.'), tx('The pill says Sending while it goes.')),
      dev: 'The browser’s online event sends the outbox at once; failed sends try again by themselves.',
      ev: [R('POST', '/v1/store/1241/events', { events: ['refresh.mark A15 S1', 'refresh.mark A15 S2'] }, 'Both in one request, in the order they were made, each with the time it was made.')],
      run: async c => { await c.wait(700); noRing(c); pill(c, 'busy', tx('Sending {n}', { n: 2 })); } },
    { cap: tx('Sent: the pill goes away.'), read: tx('Everything on this device has reached the store.'),
      dev: 'The worker checks each event, logs it and sends it on to every device in the store.', ev: [],
      run: async c => { await c.wait(900); noRing(c); pill(c, ''); } },
    { cap: tx('Open Refresh: what the other phones did meanwhile is there too.'), read: tx('Another phone marked {shelf} while this one was offline.', { shelf: 'A16 S1' }),
      dev: 'Changes this phone missed arrive with the reconnect, from where it left off.', ev: [mark('A16 S1')],
      run: async c => { await c.tap('.p2-tabs [data-tab="refresh"]'); c.view('of2-rf'); c.html('.p2-tabs', tabs('floor', 'refresh')); paint(c, S3); } },
  ],
  whatif: [[tx('Something needs the wifi?'), S(tx('Signing in on a new phone, a crew code and product details the phone has not seen yet need the wifi.'), tx('Everything else carries on.'))], [tx('Can I sign in with no wifi?'), tx('Yes, on a phone that has signed in before.')]],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
offline.stories.push({
  id: 'sameshelf', title: tx('What if another phone did the same shelf?'), blurb: tx('Nothing doubles: the shelf is counted once, with the first time it was marked.'),
  know: [tx('If another phone marked a shelf while you were offline, it simply stays refreshed.'), tx('The first mark counts and the second changes nothing.'),
    tx('The store keeps the first time it was marked, and every phone that marked it.'), tx('If someone took a mark off while your phone was offline, your older mark does not bring it back.')],
  html: () => phone({ s: st(['A15 S1', 'A15 S2']) }),
  steps: [
    { cap: tx('Offline, you mark {shelf}.', { shelf: 'A16 S1' }), read: tx('Another phone marked the same shelf a few minutes before, but this phone could not hear it.'),
      dev: 'The mark waits in the outbox like any other.', ev: [mark('A16 S1', OFF)],
      run: async c => { pill(c, 'off', tx('Offline')); await c.tap('.p2-strip .rf-act'); sheet(c, scanSheet()); await typeShelf(c, 'A16 S1'); paint(c, S3); c.html('.p2-sheet', scanSheet('A16 S1')); pill(c, 'off', tx('Offline · {n}', { n: 1 })); } },
    { cap: tx('Back in range: it is still one shelf, counted once.'), read: tx('The first mark counts and the second changes nothing.'),
      dev: 'The reducer adds this phone to the shelf’s devices and keeps the first <b>at</b>: first at wins on refresh marks (<b>refresh.mark</b> in shared/reducers/floor.js).',
      ev: [R('POST', '/v1/store/1241/events', { events: ['refresh.mark A16 S1'] }, 'Accepted: the shelf was already marked, so only this phone is added to it.')],
      run: async c => { await c.tap('.p2-sheet .sh-x'); unsheet(c); pill(c, 'busy', tx('Sending {n}', { n: 1 })); await c.wait(900); pill(c, ''); } },
  ],
});
offline.stories.push({
  id: 'waits', title: tx('What if a change has to wait?'), blurb: tx('The pill turns amber and says why, and the change sends once that is put right.'),
  know: [tx('A change waits when the store cannot take it yet: the code ran out, a tool was switched off, or the phone’s date and time are wrong.'), tx('The pill turns amber and counts them; tap it to see what each one is waiting for.'),
    tx('Once that is put right, they send by themselves.'), tx('Try again now sends at once.'), tx('Discard drops one for good: it never reached the store.'),
    tx('Changes after it in the same tool wait with it, so they keep their order.')],
  html: () => phone({ at: 'cage0' }),
  steps: [
    { cap: tx('A new cage, opened as the wifi comes and goes: it has not sent yet.'), read: tx('The pill says Sending: the wifi keeps dropping before it goes.'),
      dev: 'The phone applies it at once and keeps it in the outbox; a send that fails tries again by itself.',
      ev: [E('cage.create', 'stockroom', { cage: 'BSN1240421' }, { ring: 'new-lines' }, { wait: true, why: 'Not sent yet' })],
      run: async c => { await c.tap('.of2-tagf'); c.cls('.of2-tagf', 'of2-ph', false); await c.type('.of2-tagf', 'BSN1240421'); c.view('of2-cage'); pill(c, 'busy', tx('Sending {n}', { n: 1 })); } },
    { cap: tx('The phone is put down and locks before it is sent.'), read: S(tx('Here the store has set an idle re-lock of 5 minutes.'), tx('The Stockroom code goes; the cage is still on the phone.')),
      dev: '<b>idleCheck()</b> in js/shell.js tries to send first; with no wifi it could not, and the waiting change stays in the outbox.',
      ev: [R('POST', '/v1/auth/lock', { refresh: '…' }, 'Back to the Floor role.')],
      run: async c => { await c.wait(700); noRing(c); toFloorHome(c); c.cls('.p2 > .dv-toast', 'of2-warn', false); toast2(c, `<span>${tx("Locked after {n} min idle. The store PIN's floor session stays open.", { n: 5 })} ${txn(1, '{n} Stockroom or Back dock change will send once the code is entered again.', '{n} Stockroom or Back dock changes will send once the code is entered again.')}</span>`); } },
    { cap: tx('Back in range: without the code it waits, and the pill turns amber.'), read: tx('The change is kept on the phone, not lost.'),
      dev: 'A refusal that can clear is held, not dropped; <b>holdToast()</b> in js/sync.js words the message.',
      ev: [R('POST', '/v1/store/1241/events', { events: ['cage.create BSN1240421'] }, 'Refused for now: unauthorised, the phone has no Stockroom role. Held on the phone.')],
      run: async c => { await c.wait(700); noRing(c); c.hide('.p2 > .dv-toast'); pill(c, 'bad', tx('{n} waiting', { n: 1 })); toast2(c, `<span>${txn(1, '{n} change will send once the Stockroom code is entered again.', '{n} changes will send once the Stockroom code is entered again.')}</span><u>${tx('See')}</u>`); c.cls('.p2 > .dv-toast', 'of2-warn', true); } },
    { cap: tx('Tap the pill: it says what the change is waiting for.'), read: S(tx('Discard drops one for good: it never reached the store.'), tx('Try again now sends at once.')),
      dev: '<b>holdReason()</b> in js/sync.js; Discard takes it out of the outbox, and nothing is deleted from the store’s log.', ev: [],
      run: async c => { await c.tap('.of2-pill'); sheet(c, syncSheet({ held: true, rows: [[tx('New cage'), 'BSN1240421', `${tx('Waits for the Stockroom code')} · ${tx('made {time}', { time: '06:31' })}`]] })); } },
    { cap: tx('More, Switch area, Stockroom: it asks for the code.'), read: tx('Stockroom and Back dock show a lock until their crew code has been entered on this phone.'),
      dev: 'The tiles follow the token’s roles.', ev: [],
      run: async c => { await c.tap('.p2-sheet .of2-x'); unsheet(c); await c.tap('.p2-tabs [data-tab="more"]'); sheet(c, more()); await c.tap('.p2-sheet .of2-switch'); sheet(c, launcher()); await c.tap('.p2-sheet [data-ws="stockroom"]'); unsheet(c); cover(c, code(), true); } },
    { cap: tx('Type the code: the waiting change sends, and the pill goes.'), read: tx('Stockroom opens, and the cage is on the register.'),
      dev: 'A new token sends every held change again.',
      ev: [R('POST', '/v1/auth/unlock', { code: '••••' }, 'Roles [floor, stockroom] again.'), E('cage.create', 'stockroom', { cage: 'BSN1240421' }, { ring: 'new-lines' })],
      run: async c => { c.cls('.of2-in', 'of2-ph', false); c.cls('.of2-in', 'on', true); await c.type('.of2-in', 'SR-7304'); await c.tap('.of2-ugo'); uncover(c); c.view('of2-sr'); c.html('.p2-tabs', tabs('stockroom', 'mhome')); c.hide('.p2-strip'); c.hide('.p2 > .dv-toast'); pill(c, ''); } },
  ],
});
