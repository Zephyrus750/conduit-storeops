// Chapter: Signing in, on a phone, as the app has it today (js/shell.js
// showSignin, showContinue, openLauncher, openMore; js/unlock.js ensureArea and
// the manager code; client/session.js): the sign-in card with the store PIN,
// the workspace tiles, each workspace's crew code, the manager sign-in,
// Welcome back, sign out. Three What ifs play on the same phone.
// The day: Busselton 1241 (the guide's day, Sunday 25 October 2026), a crew
// phone at the start of the shift. Codes are examples (data), not the store's.
// Every class here starts si2- (styles/guide.css).
import { tx, txn, LANGS, lang } from '../../i18n.js';
import { fmtDate } from '../../ui.js';
import { ai, phone2, sheet, unsheet, toast2 } from '../frames.js';
import { SHELVES, DEPT, VIEW } from '../refresh-map.js';

const S = (...p) => p.join(' ');
const R = (method, path, body, note) => ({ route: `${method} ${path}`, method, path, body, note });
const DEV = 'd_7q2k9xw4';
const PIN = '2468', SR = 'SR-7304', DK = 'DK-5190';

// ── the frame around the screens ─────────────────────────────────────
// The phone's tabs per area (js/registry.js STRIP), as phone2 draws them.
const TABS = () => ({
  floor: [['mhome', 'home', tx('Home')], ['refresh', 'm-refresh', tx('Refresh')], ['labelint', 'm-labelint', tx('Labels')], ['picklist', 'm-picklist', tx('Route')], ['emergency', 'm-emergency', tx('Emergency')], ['more', 'dots', tx('More')]],
  stockroom: [['mhome', 'home', tx('Home')], ['bfreview', 'm-backfill', tx('Backfill')], ['cages', 'm-cages', tx('Cages')], ['adjust', 'm-adjust', tx('Adjust')], ['more', 'dots', tx('More')]],
  backdock: [['mhome', 'home', tx('Home')], ['receiving', 'm-receiving', tx('Receive')], ['decant', 'box', tx('Decant')], ['teamboard', 'users', tx('Board')], ['more', 'dots', tx('More')]],
});
const tabs = (area, on = 'mhome') => TABS()[area].map(([k, i, l]) => `<span data-tab="${k}"${k === on ? ' class="on"' : ''}>${ai(i)}${l}</span>`).join('');
// Moves the phone into an area: its home, its tabs, the strip only on the Floor's map.
const area = (c, a) => { c.view({ floor: 'si2-map', stockroom: 'si2-sr', backdock: 'si2-bd' }[a]); c.html('.p2-tabs', tabs(a)); if (a === 'floor') c.show('.p2-strip'); else c.hide('.p2-strip'); };

// The mark: a C in three parts (js/shell.js mark()).
const mark = () => `<svg class="si2-vm" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#111827"/><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" fill="none" stroke="#7DD3FC" stroke-width="5.4"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" fill="none" stroke="#22A6D6" stroke-width="5.4"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" fill="none" stroke="#0E7CA8" stroke-width="5.4"/></svg>`;
const wm = () => `<svg class="si2-wm" viewBox="0 0 32 32" aria-hidden="true"><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" stroke="#7DD3FC"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" stroke="#22A6D6"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" stroke="#0E7CA8"/></svg>`;
// The low-poly ground behind the sign-in cards (js/lowpoly.js), a still of it.
const POLY = (() => {
  const J = [[0, 0], [9, -14], [-12, 8], [6, 12], [-8, -6], [14, 4], [-4, 15], [11, -9], [-15, -3], [3, -12]], C = ['#E6ECF1', '#DCE5EC', '#EEF2F6', '#D2DEE7', '#E9EFF4', '#F3F6F9', '#CCDAE5', '#E1E9EF'];
  const pt = (x, y) => (x === 0 || x === 4 || y === 0 || y === 8 ? [x * 97.5, y * 105.5] : [x * 97.5 + J[(x * 3 + y) % 10][0] * 2, y * 105.5 + J[(x + y * 7) % 10][1] * 2]);
  let s = '<svg class="si2-poly" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const a = pt(x, y), b = pt(x + 1, y), d = pt(x, y + 1), e = pt(x + 1, y + 1), k = x * 5 + y * 3;
    s += `<polygon points="${a} ${b} ${e}" fill="${C[k % 8]}"/><polygon points="${a} ${e} ${d}" fill="${C[(k + 3) % 8]}"/>`;
  }
  return s + '</svg>';
})();

// ── the cards ────────────────────────────────────────────────────────
const langName = () => LANGS.find(l => l[0] === lang())?.[1] || 'English';
// The sign-in card (js/shell.js showSignin), on a phone: Team member or Manager.
function card({ as = 'team', val = '', err = '', focus = false } = {}) {
  const mgr = as === 'mgr';
  const field = mgr
    ? `<label>${tx('Manager code')}</label><span class="si2-in si2-code${focus ? ' on' : ''}${val ? '' : ' si2-ph'}">${val || 'MG-······'}</span>`
    : `<label>${tx('Store PIN')}</label><span class="si2-in si2-pin${focus ? ' on' : ''}${val ? '' : ' si2-ph'}">${val || '••••'}</span>`;
  return `<div class="si2-card">${wm()}<div class="si2-brand">${mark()}<b>Conduit</b></div><h2>${tx('Welcome back')}</h2><div class="si2-sub">${tx('Sign in to your store.')}</div>` +
    `<div class="si2-seg${mgr ? ' mgr' : ''}"><span class="si2-team${mgr ? '' : ' on'}">${tx('Team member')}</span><span class="si2-mgr${mgr ? ' on' : ''}">${tx('Manager')}</span></div>` +
    `<label>${tx('Store')}</label><span class="si2-in si2-sel">1241 Busselton · WA South${ai('chev')}</span>${field}` +
    (err ? `<div class="si2-err">${err}</div>` : '') +
    `<span class="si2-cta si2-go">${mgr ? tx('Enter as manager') : tx('Enter store')}${ai('arrow')}</span>` +
    `<div class="si2-foot"><span>${tx('Works offline')}</span><span class="si2-lk">${tx('Owner sign-in')}</span><span class="si2-lang">${langName()}${ai('chev')}</span></div></div>`;
}
// Welcome back (js/shell.js showContinue): the store to continue in, or the
// manager code again once the manager's shift is over.
function cont({ who = tx('Manager'), ask = false } = {}) {
  return `<div class="si2-card">${wm()}<div class="si2-brand">${mark()}<b>Conduit</b></div><h2>${tx('Welcome back')}</h2>` +
    `<div class="si2-sub">${ask ? tx('A manager sign-in lasts one shift (12 hours). Enter the manager code to carry on.') : tx('This device is signed in.')}</div>` +
    `<div class="si2-store"><span class="si2-sav">1241</span><div><b>Busselton</b><small>${tx('Store {no}', { no: '1241' })} · ${ask ? tx('Manager code needed') : who}</small></div><span class="si2-ready">${ai('check')}${tx('Ready')}</span></div>` +
    (ask ? `<label>${tx('Manager code')}</label><span class="si2-in si2-code on si2-ph">MG-······</span>` : '') +
    `<span class="si2-cta si2-cgo">${ask ? tx('Carry on as manager') : tx('Continue in {name}', { name: 'Busselton' })}${ai('arrow')}</span>` +
    (ask ? `<span class="si2-alt si2-asteam">${tx('Carry on as a team member')}</span>` : '') + `<span class="si2-alt">${tx('Use a different store')}</span>` +
    `<div class="si2-foot"><span class="si2-lang">${langName()}${ai('chev')}</span></div></div>`;
}
// A workspace's crew code (js/unlock.js ensureArea), over the screen.
const AREA = () => ({ stockroom: tx('Stockroom'), backdock: tx('Back dock') });
function unlock(a, { val = '', err = '', focus = true } = {}) {
  const name = AREA()[a];
  return `<div class="si2-card"><h2>${tx('{area} code', { area: name })}</h2><div class="si2-sub">${tx('The {area} crew code opens this workspace on this device for one shift (12 hours), or until the device is signed out or locked after sitting idle.', { area: name })} ${tx('A manager code here opens every area; managers can also sign in as Manager to skip this.')}</div>` +
    `<label>${tx('Code')}</label><span class="si2-in si2-ucode${focus ? ' on' : ''}${val ? '' : ' si2-ph'}">${val || (a === 'backdock' ? 'DK-0000' : 'SR-0000')}</span>` +
    (err ? `<div class="si2-err">${err}</div>` : '') +
    `<span class="si2-cta si2-ugo">${tx('Open {area}', { area: name })}${ai('arrow')}</span><div class="si2-foot"><span class="si2-lk si2-notnow">${tx('Not now')}</span><span>1241</span></div></div>`;
}
// Shows a card over the whole phone; the unlock card sits on the plain ground.
const cover = (c, html) => { c.html('.si2-cov .si2-cv', html); c.show('.si2-cov'); };
const uncover = c => c.hide('.si2-cov');
const gate = (c, html) => { c.html('.si2-unl', html); c.show('.si2-unl'); };
const ungate = c => c.hide('.si2-unl');

// ── the sheets ───────────────────────────────────────────────────────
const head = title => `<div class="si2-shh"><b>${title}</b><span class="si2-x">${ai('x')}</span></div>`;
// Where are you working? (js/shell.js openLauncher, js/registry.js WORKSPACES).
const WS = () => [['floor', tx('Floor'), 'm-map', tx('Map, refresh, labels, routes, stocktake')], ['stockroom', tx('Stockroom'), 'box', tx('Backfill scan, cages, adjustments, day list')], ['backdock', tx('Back dock'), 'truck', tx('Land and decant pallets, run the truck')]];
function launcher({ open = [], mgr = false, hot = 'floor' } = {}) {
  return head(tx('Where are you working?')) + `<p class="si2-shs">${tx('Pick your area to begin.')} ${mgr ? tx('Signed in as manager: every area is open.') : tx('Stockroom and Back dock ask for their crew code, which lasts one shift (12 hours) on this device.')}</p>` +
    `<div class="si2-tiles">${WS().map(([k, l, i, s]) => `<span class="si2-tile${k === hot ? ' hot' : ''}" data-ws="${k}"><span class="ti">${ai(i)}</span><span class="tx"><b>${l}</b><span>${s}</span></span>${k === 'floor' || mgr || open.includes(k) ? '<span></span>' : ai('lock', 'lk')}${ai('chev', 'fwd')}</span>`).join('')}</div>`;
}
// More (js/shell.js openMore): the store and area, the area's tools, then the store and app.
const MORE = () => ({
  floor: [['packages', tx('Live pull'), tx('Ask the stockroom for stock, or pull it')], ['m-stocktake', tx('Stocktake'), tx('Count shelves in a session')], ['edit', tx('Suggest map edits'), tx('A wrong name or a missing shelf')]],
  backdock: [['m-rhistory', tx('History'), tx('Finished trucks')], ['m-inventory', tx('Off-site pallets'), tx('Callbacks and returns')], ['grid', tx('Dock screen'), tx('The big screen at the dock')], ['chart', tx('Wallboard'), tx('Progress for the team')]],
});
function more(a) {
  const row = ([i, l, s]) => `<span class="si2-mo">${ai(i)}<b>${l}${s ? `<small>${s}</small>` : ''}</b>${ai('chev', 'fwd')}</span>`;
  return head(tx('More')) + `<div class="si2-mob"><div class="si2-who"><span>1241</span><div><b>Busselton · ${a === 'floor' ? tx('Floor') : tx('Back dock')}</b><small>${tx('Signed in on this phone')}</small></div></div>` +
    `<div class="si2-msec">${tx('Tools')}</div><div class="si2-mlist">${MORE()[a].map(row).join('')}</div>` +
    `<div class="si2-msec">${tx('Store and app')}</div><div class="si2-mlist">${[['m-store', tx('Store details')], ['help', tx('Help')], ['m-settings', tx('Settings')]].map(row).join('')}</div>` +
    `<div class="si2-mft"><span class="si2-switch">${ai('grid')}${tx('Switch area')}</span><span class="si2-out">${ai('lock')}${tx('Sign out')}</span></div></div>`;
}

// ── the screens under the cards ──────────────────────────────────────
// Floor › Home: the store map (Find a shelf), the Kitchen part of Busselton's.
const floorMap = () => {
  let r = '', t = '';
  for (const [code, d, x, y, w, h] of SHELVES) {
    r += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${DEPT[d][0]}" stroke="#fff" stroke-width="1.5"/>`;
    if (code) { const [run, sub = ''] = code.split(' '); t += `<text x="${x + w / 2}" y="${y + h / 2 - (sub ? 3 : 0)}" class="rf-lr">${run}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 6}" class="rf-ls">${sub}</text>` : ''}`; }
  }
  return `<svg class="si2-svg rf-svg" viewBox="${VIEW.join(' ')}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${r}<g>${t}</g></svg>`;
};
const mapView = () => `<div class="v si2-mv" id="si2-map"><div class="si2-mapc">${floorMap()}<span class="si2-chip">${ai('grid')}${tx('All departments')}</span><div class="si2-tools"><span class="scan">${ai('barcode')}</span><span>${ai('plus')}</span><span>${ai('minus')}</span><span>${ai('map')}</span></div></div></div>`;
const findStrip = () => `<span class="si2-fs">${ai('pin')}<b>${tx('Find a shelf')}</b></span><span class="si2-sb">${ai('search')}${tx('Search')}</span><span class="si2-sq">${ai('barcode')}</span><span class="si2-sq">${ai('chev', 'up')}</span>`;
const tile = (icon, t, s, hot = false) => `<span class="si2-ht${hot ? ' hot' : ''}"><span class="ti">${ai(icon)}</span><span class="tx"><b>${t}</b><span>${s}</span></span>${ai('chev', 'fwd')}</span>`;
// Stockroom › Home (js/views/stockroom/srhome.js).
const srView = () => `<div class="v si2-home" id="si2-sr" hidden><div class="si2-hh"><h3>${tx('Stockroom')}</h3><p>${fmtDate('2026-10-25')} · ${txn(0, '{n} bay on the board', '{n} bays on the board')}</p></div>` +
  tile('barcode', tx('Backfill scan'), tx('Scan a bay to start'), true) + tile('search', tx('Find a location'), tx('What’s in a bay, and what to pull')) + tile('m-cages', tx('Cages'), tx('Scan cartons onto a cage · {n} open', { n: 0 })) +
  tile('m-adjust', tx('Adjust SOH'), tx('Flag a wrong stock-on-hand · {n} today', { n: 0 })) + tile('m-daylist', tx('Day list'), tx('What to backfill next')) + tile('m-srhistory', tx('History'), tx('Today’s sent bays')) + '</div>';
// Back dock › Home (js/views/backdock/bdhome.js) before the truck lands.
const PH = () => [tx('truck phase::Planned'), tx('truck phase::Receiving'), tx('truck phase::Received'), tx('truck phase::Decanting'), tx('truck phase::Cleared'), tx('truck phase::Closed')];
const bdView = () => `<div class="v si2-home" id="si2-bd" hidden><div class="si2-hh"><h3>${tx('Back dock')}</h3><p>${tx('No truck on the dock')}</p></div>` +
  `<div class="si2-trk"><div class="si2-ph">${PH().map((l, i) => `<span${i ? '' : ' class="c"'}>${l}</span>`).join('')}</div><div class="si2-tr"><span><b>${tx('truck phase::Planned')}</b><small>${tx('Not landed yet')}</small></span><span class="si2-nt">${tx('New truck')}${ai('arrow')}</span></div></div>` +
  tile('parking', tx('Land a pallet'), tx('Scan the labels · type · cartons'), true) + tile('box', tx('Run the decant'), tx('Start, pause and finish pallets')) + tile('users', tx('Team'), tx('No team on this truck yet')) + '</div>';

const phone = ({ signedIn = false, at = 'floor', top = '' } = {}) => {
  let h = phone2('si2', mapView() + srView() + bdView(), { area: 'floor', strip: findStrip(),
    extra: `<div class="si2-cov"${signedIn ? ' hidden' : ''}>${POLY}<div class="si2-cv">${top || card()}</div></div><div class="si2-unl" hidden></div>` });
  if (at !== 'floor') h = h.replace('id="si2-map"', 'id="si2-map" hidden').replace(`id="si2-${at === 'stockroom' ? 'sr' : 'bd'}" hidden`, `id="si2-${at === 'stockroom' ? 'sr' : 'bd'}"`)
    .replace(/<nav class="p2-tabs">[\s\S]*?<\/nav>/, `<nav class="p2-tabs">${tabs(at)}</nav>`).replace('<div class="p2-strip">', '<div class="p2-strip" hidden>');
  return h;
};
// Types into a drawn field: focus, then the text.
// Steps that tap nothing leave no ring from the step before.
const noRing = c => c.cls('.fg', 'show', false);
const typeIn = async (c, sel, text) => { await c.tap(sel); c.cls(sel, 'on', true); c.cls(sel, 'si2-ph', false); await c.type(sel, text); };

// ── the chapter ──────────────────────────────────────────────────────
export const signin = {
  id: 'signin', grp: 'start', icon: 'lock', title: tx('Signing in'), device: 'phone', where: tx('Phone · sign-in'), for: ['floor', 'stockroom', 'dock', 'manager'],
  intro: S(tx('One sign-in for the store with its PIN, then a crew code for Stockroom or Back dock.'), tx('Managers open everything with their code.')),
  html: () => phone(),
  steps: [
    { cap: tx('Pick your store and type the store PIN.'), read: S(tx('Team member is for everyone.'), tx('The language at the foot changes every screen on this phone.')),
      dev: 'The card is <b>showSignin()</b> in js/shell.js. The stores are the ones this phone saw last time, refreshed from the worker behind the card.', ev: [],
      run: async c => { await typeIn(c, '.si2-pin', PIN); } },
    { cap: tx('Enter store, then pick where you’re working.'), read: S(tx('Floor opens straight away.'), tx('Stockroom and Back dock show a lock until their crew code has been entered on this phone.')),
      dev: 'The worker answers with a signed token and the store’s areas; <b>actor</b> on every event comes from it, never from the device. The tiles are <b>openLauncher()</b> in js/shell.js.',
      ev: [R('POST', '/v1/auth/signin', { store: '1241', pin: '••••', device: DEV }, 'A token with the Floor role, for every area the store has switched on.')],
      run: async c => { await c.tap('.si2-go'); uncover(c); area(c, 'floor'); sheet(c, launcher()); } },
    { cap: tx('Floor opens straight away.'), read: tx('Refresh, Labels, Route and Emergency are along the bottom.'),
      dev: 'A tile opens the area’s home (<b>HOME</b> in js/registry.js); the phone opens there next time too.', ev: [],
      run: async c => { await c.tap('.p2-sheet [data-ws="floor"]'); unsheet(c); } },
    { cap: tx('More shows the store you’re signed in to.'), read: tx('Switch area and Sign out are at the foot.'),
      dev: '<b>openMore()</b> in js/shell.js; the tools are <b>MORE</b> in js/registry.js.', ev: [],
      run: async c => { await c.tap('.p2-tabs [data-tab="more"]'); sheet(c, more('floor')); } },
    { cap: tx('Switch area, then Stockroom: it asks for its crew code.'), read: S(tx('Type the Stockroom code.'), tx('It opens Stockroom on this phone for the rest of the shift: 12 hours, or until the phone is signed out.')),
      dev: '<b>ensureArea()</b> in js/unlock.js asks for the code when the session lacks the role (<b>hasArea()</b>).', ev: [],
      run: async c => { await c.tap('.p2-sheet .si2-switch'); sheet(c, launcher()); await c.tap('.p2-sheet [data-ws="stockroom"]'); unsheet(c); gate(c, unlock('stockroom')); } },
    { cap: tx('Type the code and open Stockroom.'), read: tx('The code is not asked again on this phone until the shift is over.'),
      dev: 'The token comes back with the stockroom role added, for 12 hours from now (the worker’s ROLE_TTL).',
      ev: [R('POST', '/v1/auth/unlock', { code: '••••' }, 'Roles now [floor, stockroom].')],
      run: async c => { await typeIn(c, '.si2-ucode', SR); await c.tap('.si2-ugo'); ungate(c); area(c, 'stockroom'); } },
    { cap: tx('Back dock has its own code.'), read: S(tx('The button at the top right switches area here.'), tx('Stockroom has lost its lock; Back dock still has one.')),
      dev: 'Outside the Floor the grid button opens the tiles; on the Floor it opens Departments.', ev: [],
      run: async c => { await c.tap('.p2-top .p2-ib:last-child'); sheet(c, launcher({ open: ['stockroom'], hot: 'stockroom' })); await c.tap('.p2-sheet [data-ws="backdock"]'); unsheet(c); gate(c, unlock('backdock')); } },
    { cap: tx('Type the Back dock code: the dock’s home opens.'), read: tx('Each area keeps its own tabs along the bottom.'),
      dev: 'Each code adds its own role: [floor, stockroom, dock].',
      ev: [R('POST', '/v1/auth/unlock', { code: '••••' }, 'Roles now [floor, stockroom, dock].')],
      run: async c => { await typeIn(c, '.si2-ucode', DK); await c.tap('.si2-ugo'); ungate(c); area(c, 'backdock'); } },
    { cap: tx('Sign out from More at the end of the shift.'), read: tx('More says which store and area the phone is in.'),
      dev: '<b>signOut()</b> in js/shell.js sends what is waiting first.', ev: [],
      run: async c => { await c.tap('.p2-tabs [data-tab="more"]'); sheet(c, more('backdock')); } },
    { cap: tx('Signed out: the next person starts with the store PIN.'), read: S(tx('Signing out forgets the codes and every store on the phone.'), tx('A change that could not be sent yet stays on the phone, so nothing is lost.')),
      dev: 'The session ends on the worker too (best effort offline); the store’s saved copy is deleted unless changes are still waiting.',
      ev: [R('POST', '/v1/auth/signout', { refresh: '…' }, 'The refresh token is revoked: this phone’s codes are gone.')],
      run: async c => { await c.tap('.p2-sheet .si2-out'); unsheet(c); cover(c, card()); } },
    { cap: tx('Managers sign in as Manager: every area opens.'), read: tx('The manager code opens Floor, Stockroom and Back dock for the shift, with no crew codes.'),
      dev: 'The same route with <b>managerCode</b> in place of the PIN; the manager role lasts the shift, like a crew code.',
      ev: [R('POST', '/v1/auth/signin', { store: '1241', managerCode: '••••••', device: DEV }, 'Roles [floor, manager]: every area the store has switched on.')],
      run: async c => { await c.tap('.si2-mgr'); cover(c, card({ as: 'mgr' })); await typeIn(c, '.si2-code', '••••••••'); await c.tap('.si2-go'); uncover(c); area(c, 'floor'); sheet(c, launcher({ mgr: true })); } },
    { cap: tx('Next time: Welcome back, one tap to carry on.'), read: S(tx('Opening the app on a phone that is signed in skips the PIN.'), tx('A phone that has signed in before opens without wifi.')),
      dev: '<b>showContinue()</b> in js/shell.js. Opening the app asks the worker whether the session still stands and waits two seconds at most; offline it carries on.',
      ev: [R('POST', '/v1/auth/check', { refresh: '…' }, 'Nothing is rotated; a phone signed out elsewhere goes to the sign-in.')],
      run: async c => { await c.wait(400); noRing(c); unsheet(c); cover(c, cont()); } },
  ],
  whatif: [],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
signin.stories.push({
  id: 'wrongpin', title: tx('What if the PIN is wrong?'), blurb: tx('It says so, and five wrong tries in a row make the phone wait.'),
  know: [tx('It says Wrong PIN and you can try again.'), tx('Ask a manager if the PIN has changed.'), tx('After five wrong tries in a row, this phone waits 15 minutes, even for the right PIN.'),
    tx('Other phones can still sign in, unless the store has had thirty wrong tries in an hour.'), tx('A wrong crew code is counted the same way: five in a row and the code card says to try again later.'),
    tx('Not now closes the code card: the Floor stays open.')],
  html: () => phone(),
  steps: [
    { cap: tx('A wrong PIN: it says so.'), read: tx('It says Wrong PIN and you can try again.'),
      dev: 'The worker counts the failure against this device, the store and the network (<b>failAll()</b> in worker/registry.js).',
      ev: [R('POST', '/v1/auth/signin', { store: '1241', pin: '••••', device: DEV }, '403 unauthorised: wrong PIN.')],
      run: async c => { await typeIn(c, '.si2-pin', '1357'); await c.tap('.si2-go'); cover(c, card({ val: '1357', err: tx('Wrong PIN.') })); } },
    { cap: tx('Five wrong in a row: the phone waits 15 minutes.'), read: tx('Even the right PIN waits until the time is up.'),
      dev: '<b>checkLocked()</b> answers 429 locked_out with the seconds left; the card rounds them up to minutes.',
      ev: [R('POST', '/v1/auth/signin', { store: '1241', pin: '••••', device: DEV }, '429 locked_out: retryAfter 900 seconds.')],
      run: async c => { await typeIn(c, '.si2-pin', PIN); await c.tap('.si2-go'); cover(c, card({ val: PIN, err: tx('Too many attempts. Try again in {n} min.', { n: 15 }) })); } },
    { cap: tx('A wrong crew code: it says so too.'), read: tx('A wrong crew code is counted the same way: five in a row and the code card says to try again later.'),
      dev: 'The unlock route has its own count per device (<b>unlock()</b> in worker/registry.js).',
      ev: [R('POST', '/v1/auth/unlock', { code: '••••' }, '403 unauthorised: wrong code.')],
      run: async c => { await c.wait(500); noRing(c); uncover(c); area(c, 'floor'); gate(c, unlock('stockroom', { val: 'SR-9999', err: tx('Wrong code.'), focus: false })); } },
    { cap: tx('Not now closes the code card: the Floor stays open.'), read: tx('Ask a manager for the code, then open Stockroom again.'),
      dev: 'Not now resolves <b>ensureArea()</b> with false; the view stays where it was.', ev: [],
      run: async c => { await c.tap('.si2-notnow'); ungate(c); } },
  ],
});
signin.stories.push({
  id: 'relock', title: tx('What if the phone asks for a code again?'), blurb: tx('A crew code lasts one shift, and a store can lock phones left idle.'),
  know: [tx('A Stockroom or Back dock code lasts one shift on a phone: 12 hours from when it was typed.'), tx('A manager can set an idle re-lock in Settings, and a phone left alone that long drops its codes.'),
    tx('The Floor stays open, and nothing on the phone is lost.'), tx('A change that had not been sent yet sends once the code is entered again.')],
  html: () => phone({ signedIn: true, at: 'stockroom' }),
  steps: [
    { cap: tx('Left idle: the phone locks and goes back to the Floor.'), read: tx('Here the store has set an idle re-lock of 5 minutes.'),
      dev: '<b>idleCheck()</b> in js/shell.js looks every 20 seconds; any tap in any of the app’s tabs counts as use.',
      ev: [R('POST', '/v1/auth/lock', { refresh: '…' }, 'Back to the store PIN’s Floor role; the codes’ refresh token is revoked.')],
      run: async c => { await c.wait(600); area(c, 'floor'); toast2(c, `<span>${tx("Locked after {n} min idle. The store PIN's floor session stays open.", { n: 5 })}</span>`); } },
    { cap: tx('Stockroom shows its lock again.'), read: tx('Stockroom and Back dock show a lock until their crew code has been entered on this phone.'),
      dev: 'The tiles follow the token’s roles (<b>hasArea()</b>).', ev: [],
      run: async c => { await c.tap('.p2-tabs [data-tab="more"]'); sheet(c, more('floor')); await c.tap('.p2-sheet .si2-switch'); sheet(c, launcher()); } },
    { cap: tx('Type the code again and carry on.'), read: tx('A change that had not been sent yet sends once the code is entered again.'),
      dev: 'A new token sends whatever was held for it (the store retries held changes on every session change).',
      ev: [R('POST', '/v1/auth/unlock', { code: '••••' }, 'Roles [floor, stockroom] again, for 12 hours.')],
      run: async c => { await c.tap('.p2-sheet [data-ws="stockroom"]'); unsheet(c); gate(c, unlock('stockroom')); await typeIn(c, '.si2-ucode', SR); await c.tap('.si2-ugo'); ungate(c); area(c, 'stockroom'); } },
  ],
});
signin.stories.push({
  id: 'shift', title: tx('What if a manager’s shift is over?'), blurb: tx('A manager sign-in lasts 12 hours, then the phone asks for the manager code again.'),
  know: [tx('A manager sign-in lasts one shift (12 hours). Enter the manager code to carry on.'), tx('Carry on as a team member keeps the phone on the store PIN, with the crew codes asked as usual.'),
    tx('The manager code is asked the same way after the idle re-lock, or when another store is opened on the phone.')],
  html: () => phone({ top: cont({ ask: true }) }),
  steps: [
    { cap: tx('The next shift: Welcome back asks for the manager code.'), read: tx('Type it and carry on as manager, or carry on as a team member.'),
      dev: '<b>managerReason()</b> in js/unlock.js words why; <b>codeNeeded()</b> in js/shell.js decides to ask.', ev: [],
      run: async c => { await c.wait(500); } },
    { cap: tx('Carry on as a team member: the Floor opens on the store PIN.'), read: tx('Stockroom and Back dock show a lock until their crew code has been entered on this phone.'),
      dev: 'The session’s dropManager (client/session.js) forgets that a manager signed in on this phone.', ev: [],
      run: async c => { await c.tap('.si2-asteam'); uncover(c); area(c, 'floor'); sheet(c, launcher()); } },
  ],
});
