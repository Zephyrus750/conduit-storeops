// The Visual Guide's chapters (Help): each task played on the device it is
// done on. A chapter is its devices, drawn in HTML with Conduit's own light
// look (html), and its steps. A step has:
//   cap   one line, under the device as it plays
//   read  the Handbook's explanation
//   dev   the developer note (English, like the map editor)
//   ev    the event log: E() an event as the store dispatches it, R() a
//         request to the worker (English: event types, payloads and routes)
//   run   what happens on the device, through the player's helpers c.*
// test/unit/guide.test.js keeps the developer notes and the event log true
// to the code: every event type in the catalogue, every route in the
// worker, every file and every <b>function()</b> named still there.
//
// Every word a person reads goes through tx(), one sentence a key; data
// (shelves, bays, keycodes, product, store and department names, D-numbers,
// manifest numbers) stays as the store writes it.

import { tx, txn, locale, LANGS, lang } from '../i18n.js';
import { gi as ic } from './icons.js';

const S = (...parts) => parts.join(' ');
// A day of the guide's week (it plays on Sunday 25 October 2026), as the app shows dates.
const day = (iso, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(iso + 'T00:00:00Z').toLocaleDateString(locale(), { ...o, timeZone: 'UTC' });
const num = n => Number(n).toLocaleString(locale());

// ── device frames ─────────────────────────────────────────────────────
// The phone's tab strip and the PC's rail, as js/registry.js has them
// (STRIP, RAIL_TOP, RAIL, RAIL_FOOT). The ids name a tab or row in the steps.
const TABS = {
  floor: () => [['home', 'home', tx('Home')], ['refresh', 'm-refresh', tx('Refresh')], ['labels', 'm-labelint', tx('Labels')], ['route', 'm-picklist', tx('Route')], ['emergency', 'm-emergency', tx('Emergency')], ['more', 'dots', tx('More')]],
  stock: () => [['home', 'home', tx('Home')], ['scan', 'm-backfill', tx('Backfill')], ['cages', 'm-cages', tx('Cages')], ['adjust', 'm-adjust', tx('Adjust')], ['more', 'dots', tx('More')]],
};
const overlays = () => `<div class="scanov" hidden><div class="scan-card" data-tt><div class="bars"></div><b class="scan-code"></b><i class="laser"></i></div><span class="hint">${tx('Point the camera at the label')}</span></div><div class="dv-toast" hidden></div>`;
const stat = () => `<div class="ph-stat"><b>9:41</b><span class="wf"><span class="yes">${ic('wifi')}</span><span class="no">${ic('nowifi')}</span></span></div>`;
function phone(id, body, { tabs = 'floor', on = 'home', strip = '', bare = false } = {}) {
  if (bare) return `<div class="dv ph" id="${id}"><div class="dvs ph-scr bare">${stat()}<div class="ph-body" style="padding-top:34px">${body}</div>${overlays()}<i class="fg"></i></div></div>`;
  return `<div class="dv ph" id="${id}"><div class="dvs ph-scr">${stat()}<div class="ph-top"><div class="ph-search">${ic('search')}<span class="ph-q">${tx('Search')}</span>${ic('mic')}</div><span class="msync" hidden><span class="dot"></span><span class="mst"></span></span><span class="ph-help" title="${tx('Help for this screen')}">?</span><span class="ph-grid">${ic('grid')}</span></div>` +
    `<div class="ph-body">${body}</div>${strip ? `<div class="ph-strip">${strip}</div>` : ''}<div class="ph-tabs">${TABS[tabs]().map(([k, i, l]) => `<span class="${k === on ? 'on' : ''}" data-tab="${k}">${ic(i)}${l}</span>`).join('')}</div>${overlays()}<i class="fg"></i></div></div>`;
}
const RAIL = () => [['today', 'm-dashboard', tx('Dashboard')], ['inputs', 'file', tx('Reports & files')], ['resources', 'stack', tx('Resources')], ['#', tx('Floor')], ['map', 'm-map', tx('Store map')], ['floorchecks', 'listcheck', tx('Floor checks')], ['picklist', 'm-picklist', tx('Pick list')], ['safety', 'm-emergency', tx('Safety & upkeep')],
  ['#', tx('Stockroom')], ['backfill', 'm-backfill', tx('Backfill')], ['accuracy', 'm-adjust', tx('Stock accuracy')], ['cages', 'm-cages', tx('Cages')], ['#', tx('Back dock')], ['receiving', 'm-receiving', tx('Receiving')], ['plan', 'm-planner', tx('Plan')], ['results', 'bars', tx('Results')]];
const FOOT = () => [['screens', 'expand', tx('Screens')], ['settings', 'm-settings', tx('Settings')], ['help', 'star', tx('Help')]];
function pc(id, main, { on = 'today', badge = {}, top = '' } = {}) {
  const row = ([k, i, l]) => k === '#' ? `<span class="pc-sec">${i}</span>` : `<span class="pc-row${k === on ? ' on' : ''}" data-r="${k}">${ic(i)}<span>${l}</span>${badge[k] ? `<span class="bdg">${badge[k]}</span>` : ''}</span>`;
  return `<div class="dv pcf" id="${id}"><div class="dvs pc-scr"><nav class="pc-rail"><div class="pc-brand"><i></i>Conduit</div><div class="pc-store">Busselton<small>${tx('Store {no}', { no: '1241' })}</small></div>${RAIL().map(row).join('')}` +
    `<div class="pc-foot">${FOOT().map(row).join('')}</div></nav>` +
    `<div class="pc-main">${top}<div class="pc-top"><span class="pc-search">${ic('search')}<span class="pc-q">${tx('Search anything — a shelf, bay, product, manifest or consolidation…')}</span><kbd>Ctrl K</kbd></span><span class="pc-help" title="${tx('Help for this screen')}">?</span></div><div class="pc-content">${main}</div></div>${overlays()}<i class="fg cur"></i></div></div>`;
}
// A PC screen's tabs, as the shell draws a rail row's screens (the ids name them in the steps).
const tabsx = (list, on) => `<div class="tabsx">${list.map(([k, l]) => `<span class="${k === on ? 'on' : ''}" data-gt="${k}">${l}</span>`).join('')}</div>`;
// A small store plan: six runs (A14 to A19), each two shelves, S1 and S2.
const RUNS = ['A14', 'A15', 'A16', 'A17', 'A18', 'A19'];
function plan() {
  let s = '<svg viewBox="0 0 260 330" aria-hidden="true"><rect width="260" height="330" fill="#F8FAFC"/><text x="12" y="18" class="zl">FLOOR · KIDS</text>';
  RUNS.forEach((r, i) => { const x = 22 + i * 38; s += `<text x="${x + 12}" y="40" class="runl">${r}</text><rect id="sh-${r}-S1" class="shf" x="${x}" y="48" width="24" height="110" rx="3"/><rect id="sh-${r}-S2" class="shf" x="${x}" y="160" width="24" height="110" rx="3"/>`; });
  return s + '<rect x="22" y="290" width="216" height="16" rx="4" fill="#E2E8F0"/><text x="130" y="301" class="runl">CHECKOUTS</text></svg>';
}
const pinSvg = c => `<svg viewBox="0 0 26 32" aria-hidden="true"><path d="M13 31s11-10.5 11-18A11 11 0 002 13c0 7.5 11 18 11 18z" fill="${c}" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13" r="4.5" fill="#fff"/></svg>`;
// The phone's Refresh strip, as js/views/refresh.js paints it.
const rfStrip = n => `${ic('m-refresh')}<b>${tx('Refresh')}</b><span class="n cnt">${n} / 100</span><span class="s"></span><span class="act">${ic('barcode')}${tx('Scan or type')}</span>`;

// ── the event log ─────────────────────────────────────────────────────
// E: an event as the store dispatches it; R: a request to the worker.
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const R = (method, path, body, note) => ({ route: `${method} ${path}`, method, path, body, note });
const ULID = '01JBQ8…';
const TRUCK = '2026-10-25-T2';

export const GROUPS = [['start', tx('Start here')], ['floor', tx('Floor')], ['stockroom', tx('Stockroom')], ['dock', tx('Back dock')]];
// Who a chapter is for: the For picker's people.
export const PEOPLE = [['all', tx('Everyone')], ['floor', tx('Floor team')], ['stockroom', tx('Stockroom team')], ['dock', tx('Back dock team')], ['manager', tx('Managers')]];
export const DEVICE = { phone: tx('Phone'), pc: tx('PC'), duo: tx('2 phones') };

// ── the chapters ──────────────────────────────────────────────────────
export const SCENES = [
// ═══ Start here ═══
{
  id: 'signin', grp: 'start', fresh: true, icon: 'lock', title: tx('Signing in'), device: 'phone', where: tx('Phone · sign-in'), for: ['floor', 'stockroom', 'dock', 'manager'],
  intro: S(tx('One sign-in for the store, then a crew code once per phone for Stockroom or Back dock.'), tx('Managers open everything with their code.')),
  html: () => phone('s1', `
    <div class="v" id="v-si" style="display:flex;flex-direction:column;gap:10px;padding:6px 4px">
      <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:16px"><span style="width:24px;height:24px;border-radius:7px;background:#0E7CA8;display:inline-block"></span>Conduit</div>
      <div><b style="font-size:22px;letter-spacing:-.01em">${tx('Welcome back')}</b><div style="color:#5B6472;font-size:12.5px">${tx('Sign in to your store.')}</div></div>
      <div class="seg"><span class="on as-team">${tx('Team member')}</span><span class="as-mgr">${tx('Manager')}</span></div>
      <div class="fld"><label>${tx('Store')}</label><span class="sel2 store">1241 Busselton · WA ${ic('next')}</span></div>
      <div class="fld"><label class="pl">${tx('Store PIN')}</label><span class="inp pinf"></span></div>
      <span class="btnx pri big enter">${tx('Enter store')} ${ic('arrow')}</span>
      <div style="display:flex;gap:10px;font-size:11px;color:#5B6472;margin-top:auto"><span>${tx('Works offline')}</span><span style="color:#0B6183">${tx('Owner sign-in')}</span><span style="margin-left:auto">${LANGS.find(l => l[0] === lang())?.[1] || 'English'}</span></div></div>
    <div class="v" id="v-ws" hidden style="display:flex;flex-direction:column;gap:10px;padding:6px 2px">
      <b style="font-size:18px">${tx('Where are you working?')}</b><span style="font-size:12px;color:#5B6472">${tx('Pick your area to begin.')} ${tx('Stockroom and Back dock take their crew code once on this device.')}</span>
      <div class="tiles"><div class="tile"><span class="ti">${ic('m-map')}</span><span class="tx"><b>${tx('Floor')}</b><span>${tx('Map, refresh, labels, routes, stocktake')}</span></span>${ic('next')}</div><div class="tile t-sr"><span class="ti">${ic('box')}</span><span class="tx"><b>${tx('Stockroom')}</b><span>${tx('Backfill scan, cages, adjustments, day list')}</span></span>${ic('lock')}${ic('next')}</div><div class="tile"><span class="ti">${ic('truck')}</span><span class="tx"><b>${tx('Back dock')}</b><span>${tx('Land and decant pallets, run the truck')}</span></span>${ic('lock')}${ic('next')}</div></div></div>
    <div class="v" id="v-code" hidden style="display:flex;flex-direction:column;gap:10px;padding:6px 2px">
      <b style="font-size:18px">${tx('{area} code', { area: tx('Stockroom') })}</b><span style="font-size:12px;color:#5B6472">${tx('The {area} crew code opens this workspace on this device until it is signed out. A manager code here opens every area; managers can also sign in as Manager to skip this.', { area: tx('Stockroom') })}</span>
      <div class="fld"><label>${tx('Code')}</label><span class="inp code"></span></div><span class="btnx pri big unlock">${tx('Open {area}', { area: tx('Stockroom') })} ${ic('arrow')}</span></div>
    <div class="v" id="v-sr" hidden style="display:flex;flex-direction:column;gap:8px">
      <div class="ph-h"><span class="ti" style="width:34px;height:34px;border-radius:10px;background:#E7F2F6;color:#0B6183;display:grid;place-items:center">${ic('box')}</span><span><b>${tx('Stockroom')}</b><small>${tx('Busselton · open on this phone')}</small></span></div>
      <div class="card"><b>${tx('Backfill')}</b><span style="font-size:12px;color:#5B6472">${tx('{n} bays on today’s list · {m} scanned', { n: 14, m: 3 })}</span></div><div class="card"><b>${tx('Cages')}</b><span style="font-size:12px;color:#5B6472">${tx('{n} open · last sweep yesterday', { n: 9 })}</span></div></div>`, { bare: true }),
  steps: [
    { cap: tx('Pick your store and type the store PIN.'), read: S(tx('Team member is for everyone.'), tx('The phone remembers the store and the choice, so tomorrow it is just the PIN.')), dev: 'The worker answers with a signed token; <b>actor</b> on every event comes from it, never from the device.',
      ev: [R('POST', '/v1/auth/signin', { store: '1241', pin: '••••', device: 'ph-7Q2' }, 'A token with roles [floor].')],
      run: async c => { await c.tap('.pinf'); c.cls('.pinf', 'focus', true); await c.type('.pinf', '••••'); c.cls('.pinf', 'focus', false); await c.tap('.enter'); } },
    { cap: tx('Pick where you’re working today.'), read: S(tx('Floor opens straight away.'), tx('Stockroom and Back dock show a lock until their crew code has been entered on this phone.')), dev: 'The tiles are <b>WORKSPACES</b> in js/registry.js; js/shell.js shows the lock until <b>hasArea()</b> is true.',
      run: async c => { c.view('v-ws'); await c.wait(500); await c.tap('.t-sr'); } },
    { cap: tx('Stockroom asks for its crew code, once.'), read: S(tx('Type the Stockroom code.'), tx('The phone keeps it until someone signs out, so nobody types it again tomorrow.')), dev: '<b>ensureArea()</b> in js/unlock.js. The token comes back with the stockroom role added.',
      ev: [R('POST', '/v1/auth/unlock', { code: '••••' }, 'Roles now [floor, stockroom].')],
      run: async c => { c.view('v-code'); await c.tap('.code'); c.cls('.code', 'focus', true); await c.type('.code', '••••'); c.cls('.code', 'focus', false); await c.tap('.unlock'); c.view('v-sr'); c.toast(tx('Stockroom is open on this phone')); } },
    { cap: tx('Managers sign in as Manager: every area opens.'), read: S(tx('The manager code opens Floor, Stockroom and Back dock for the shift, with no crew codes.'), tx('A store PC always signs in as a manager or as a dock screen.')), dev: 'Same route with <b>managerCode</b> in place of the PIN; the session holds the manager role for the shift.',
      ev: [R('POST', '/v1/auth/signin', { store: '1241', managerCode: 'MG-••••••', device: 'ph-7Q2' }, 'Roles [manager]: every area the store has switched on.')],
      run: async c => { c.view('v-si'); c.text('.pinf', ''); await c.tap('.as-mgr'); c.cls('.as-team', 'on', false); c.cls('.as-mgr', 'on', true); c.text('.pl', tx('Manager code')); c.html('.enter', `${tx('Enter as manager')} ${ic('arrow')}`); await c.tap('.pinf'); c.cls('.pinf', 'focus', true); await c.type('.pinf', 'MG-••••••'); c.cls('.pinf', 'focus', false); await c.tap('.enter'); c.toast(tx('Signed in as manager')); } },
  ],
  whatif: [[tx('Wrong PIN?'), S(tx('It says Wrong PIN and you can try again.'), tx('Ask a manager if the PIN has changed.'))], [tx('A shared phone at the end of a shift?'), tx('Sign out in Settings so the next person enters their own codes.')], [tx('No wifi at sign-in?'), S(tx('A phone that has signed in before opens without wifi.'), tx('A new phone needs wifi the first time.'))]],
},
{
  id: 'around', grp: 'start', icon: 'grid', title: tx('Getting around on a PC'), device: 'pc', where: tx('PC · the rail, tabs, search and ?'), for: ['manager', 'dock'],
  intro: S(tx('Everything on the PC hangs off the rail on the left.'), tx('Search finds anything in the store from any screen, and ? opens the guide for the screen you’re on.')),
  html: () => pc('p1', `
    <div class="v" id="v-today"><div class="pc-h"><h3>${tx('Good morning!')}</h3><p>${tx('How we’re tracking')}</p></div>
      <div class="kp3"><div class="kp"><b>0 / 14</b><span>${tx('Bays to review')}</span></div><div class="kp"><b>37 / 100</b><span>${tx('Shelves refreshed this week')}</span></div><div class="kp"><b>2</b><span>${tx('Checks need attention')}</span></div></div>
      <div class="rows"><div class="rw">${ic('clip')}<span class="g"><b>${tx('Morning inventory report')}</b><small>${tx('Paste it to start the day’s backfill')}</small></span><span class="pill warn">${tx('Required')}</span></div><div class="rw">${ic('truck')}<span class="g"><b>${tx('Truck {n} due {time}', { n: 2, time: '13:30' })}</b><small>${tx('Manifest {no} published', { no: '7032044' })}</small></span><span class="pill acc">${tx('Planned')}</span></div><div class="rw">${ic('ladder')}<span class="g"><b>${tx('{code} is overdue for its check', { code: 'LAD-02' })}</b><small>Floor, aisle 8</small></span><span class="pill bad">${tx('Overdue')}</span></div></div></div>
    <div class="v" id="v-bf" hidden>${tabsx([['review', tx('Review')], ['daylist', tx('Day list')], ['history', tx('History')], ['trends', tx('Trends')], ['pull', tx('Live pull')]], 'review')}<div class="pc-h"><h3>${tx('Backfill review')}</h3><p>${tx('Today’s board')}</p></div>
      <div class="rows"><div class="rw"><b class="mono">7036</b><span class="g">${txn(22, '{n} code', '{n} codes')}<small>${tx('sent {time}', { time: '08:41' })}</small></span><span class="pill acc">${tx('Needs review')}</span></div><div class="rw"><b class="mono">7041</b><span class="g">${txn(18, '{n} code', '{n} codes')}<small>${tx('sent {time}', { time: '08:47' })}</small></span><span class="pill acc">${tx('Needs review')}</span></div><div class="rw"><b class="mono">7012</b><span class="g">${txn(31, '{n} code', '{n} codes')}<small>${tx('ready {time}', { time: '08:30' })}</small></span><span class="pill ok">${tx('Ready')}</span></div></div></div>
    <div class="v" id="v-eq" hidden>${tabsx([['emergency', tx('Emergency')], ['maintenance', tx('Maintenance')], ['equipment', tx('Equipment')], ['recalls', tx('Recalls')]], 'equipment')}<div class="pc-h"><h3>LAD-02 · Step ladder, 3 step</h3><p>Floor, aisle 8 · ${tx('Every 3 months')}</p></div>
      <div class="rows" style="max-width:330px"><div class="rw">${ic('alert')}<span class="g"><b>${txn(10, 'Overdue {n} day', 'Overdue {n} days')}</b><small>${tx('Was due {date}', { date: day('2026-10-15') })}</small></span><span class="btnx pri">${tx('Record a check')}</span></div><div class="rw">${ic('check')}<span class="g">${tx('Checked OK')}<small>${day('2026-07-15')}</small></span></div></div></div>
    <div class="v" id="v-help" hidden style="display:flex;flex-direction:column;gap:10px"><div class="gh-top"><div class="pc-h" style="flex:1"><h3>${tx('Help')}</h3><p>${tx('How the app works')}</p></div><span class="gh-acts"><span class="btnx">${ic('star')}${tx('What’s new')}</span><span class="btnx pri">${ic('star')}${tx('Take the tour')}</span></span></div>
      <div class="cols2" style="grid-template-columns:200px 1fr"><div class="rows" style="align-self:start"><div class="grp-h">${tx('Floor')}</div><div class="rw">${ic('map')}${tx('Find a shelf on a phone')}</div><div class="rw">${ic('wrench')}${tx('Report a fault')}</div><div class="rw on">${ic('ladder')}<b>${tx('Equipment checks')}</b></div><div class="grp-h">${tx('Stockroom')}</div><div class="rw">${ic('barcode')}${tx('Backfill: scan a bay')}</div></div>
      <div class="card ghelp"><b style="font-size:15px">${tx('Equipment checks')}</b><small style="color:#5B6472">${tx('PC · Floor › Safety & upkeep › Equipment')}</small><ol><li class="on">${tx('Red pins are overdue; black is out of service.')}</li><li>${tx('Record a check: OK or Fail on each point.')}</li><li>${tx('Save: the next due date moves on.')}</li><li>${tx('Print QR labels: a scan opens its card.')}</li></ol><div class="sh-acts"><span class="btnx pri">${ic('play')}${tx('Watch')}</span><span class="btnx">${ic('hand')}${tx('Try it')}</span><span class="btnx">${ic('book')}${tx('Handbook')}</span><span class="btnx">${ic('print')}${tx('Paper')}</span></div></div></div></div>
    <div class="pal" hidden><div class="pal-in">${ic('search')}<span class="pal-q"></span><span class="caret"></span></div><div class="pal-res" hidden><span class="pal-grp">${tx('Equipment')}</span><div class="pal-hit">${ic('ladder')}<b class="mono">LAD-02</b>Step ladder, 3 step<small>Floor, aisle 8</small></div><span class="pal-grp">${tx('Tools')}</span><div class="pal-row">${ic('ladder')}${tx('Equipment checks')}</div></div></div>`, { badge: { safety: 2 } }),
  steps: [
    { cap: tx('The rail has a few rows for each area.'), read: S(tx('Floor, Stockroom and Back dock each have a few rows.'), tx('Today, Reports & files and Resources sit on top; Screens, Settings and Help are at the foot.'), tx('A red count means something needs a person.')), dev: 'Rail rows and their tabs: <b>GROUPS</b> and <b>RAIL</b> in js/registry.js. Counts: <b>paintBadges()</b> in js/shell.js.', run: async c => { c.cls('.pc-rail', 'glow', true); await c.wait(1400); c.cls('.pc-rail', 'glow', false); } },
    { cap: tx('Click a row: its screens are tabs along the top.'), read: S(tx('Backfill holds Review, Day list, History, Trends and Live pull.'), tx('The row opens the tab used last on this PC; the tabs switch between the rest.')), dev: 'A group row opens <b>rowTarget()</b>: the tab used last on this device, else its first.', run: async c => { await c.tap('[data-r="backfill"]'); c.rail('backfill'); c.view('v-bf'); } },
    { cap: tx('Ctrl K searches everything from anywhere.'), read: S(tx('Type a shelf (A16 S2), a bay, a keycode, a manifest, a consolidation, a cage, an equipment code or a tool.'), tx('Results come grouped by kind.')), dev: 'Search runs on the device (<b>findRecords()</b> in shared/finder.js): nothing is sent, so it works offline.', run: async c => { await c.tap('.pc-search'); c.show('.pal'); await c.type('.pal-q', 'LAD-02'); c.show('.pal-res'); } },
    { cap: tx('Pick a result to go straight to it.'), read: tx('Choosing LAD-02 opens Safety & upkeep › Equipment with that ladder’s card, its checks and what is due.'), dev: 'A result row carries <b>data-view</b> and its argument; the shell’s <b>show(view, arg)</b> opens it.', run: async c => { await c.tap('.pal-hit'); c.hide('.pal'); c.rail('safety'); c.view('v-eq'); } },
    { cap: S(tx('Stuck?'), tx('Press ? and Help opens at this screen’s chapter.')), read: S(tx('Every screen has a ?.'), tx('It opens the guide at the chapter for that screen, ready to watch or try.')), dev: 'The ? in the top bar opens Help with <b>show(\'help\', { chapter })</b>; each screen’s chapter is <b>guideFor()</b> in js/registry.js.', run: async c => { await c.tap('.pc-help'); c.rail('help'); c.view('v-help'); } },
    { cap: tx('Help has the whole guide, the tour and what’s new.'), read: S(tx('Help sits at the foot of the rail on every PC.'), tx('On a phone it is in More.')), dev: 'js/views/help.js mounts the guide (js/guide/player.js). The guide replaces the long written How to use.', run: async c => { c.cls('.gh-acts', 'glow', true); c.cls('[data-r="help"]', 'glow', true); await c.wait(1300); c.cls('.gh-acts', 'glow', false); c.cls('[data-r="help"]', 'glow', false); } },
  ],
  whatif: [[tx('Can’t find a screen?'), tx('Type its name in search: tools are results too.')], [tx('A row is missing?'), tx('The owner may have switched that tool off for the store.')], [tx('Rail too wide on a small screen?'), tx('Settings › Display › Rail starts it collapsed to icons on this PC.')]],
},
{
  id: 'offline', grp: 'start', fresh: true, icon: 'nowifi', title: tx('When the wifi drops'), device: 'phone', where: tx('Phone · any screen'), for: ['floor', 'stockroom', 'dock', 'manager'],
  intro: S(tx('Nothing stops when the wifi does.'), tx('Work saves on the phone and sends itself when it can.')),
  html: () => phone('o1', `<div class="ph-map">${plan()}</div>`, { strip: rfStrip(37), on: 'refresh' }),
  steps: [
    { cap: S(tx('No wifi?'), tx('Keep working.')), read: S(tx('Marks, scans and checks save on the phone straight away.'), tx('A pill at the top counts what is waiting to send.')), dev: 'Each change applies at once on the device (the shared reducers) and joins the outbox in IndexedDB.',
      ev: [E('refresh.mark', 'floor', { segment: 'A15 S1', week: '2026-W43' }, { dept: 'k2' }, { wait: true }), E('refresh.mark', 'floor', { segment: 'A16 S1', week: '2026-W43' }, { dept: 'k2' }, { wait: true })],
      run: async c => { c.cls('.ph-stat', 'off', true); c.pill('off', tx('Offline')); await c.wait(500); await c.tap('#sh-A15-S1'); c.cls('#sh-A15-S1', 'done', true); c.text('.cnt', '38 / 100'); c.pill('off', tx('Offline · {n}', { n: 1 })); await c.tap('#sh-A16-S1'); c.cls('#sh-A16-S1', 'done', true); c.text('.cnt', '39 / 100'); c.pill('off', tx('Offline · {n}', { n: 2 })); } },
    { cap: tx('Back in range: it all sends by itself.'), read: S(tx('Waiting changes send in the order they were made.'), tx('The pill says Sending, then goes away.'), tx('Nobody has to press anything.')), dev: 'The outbox posts the queue in order; the worker validates each event and broadcasts it to the store’s devices.',
      ev: [R('POST', '/v1/store/1241/events', { events: ['refresh.mark A15 S1', 'refresh.mark A16 S1'] }, 'Both changes in one request, in the order they were made.')],
      run: async c => { c.cls('.ph-stat', 'off', false); c.pill('busy', tx('Sending {n}', { n: 2 })); await c.wait(1200); c.pill(null); } },
    { cap: S(tx('Two phones did the same shelf?'), tx('Nothing doubles.')), read: S(tx('If another phone marked a shelf while you were offline, it simply stays refreshed.'), tx('The first mark counts and the second changes nothing.')), dev: 'Reducer conflict rules: first <b>at</b> wins on refresh marks; a second <b>pallet.done</b> is a no-op; a reopen beats a stale submit.',
      run: async c => { c.cls('#sh-A17-S2', 'done', true); await c.wait(700); c.cls('#sh-A17-S2', 'glow', true); await c.wait(900); c.cls('#sh-A17-S2', 'glow', false); } },
    { cap: tx('A change waiting for a code turns the pill red.'), read: S(tx('If a Stockroom change was made after its code was signed out, it waits rather than being lost.'), tx('Enter the code again and it sends.')), dev: 'A refusal that can clear is held, not dropped: <b>holdReason()</b> in js/sync.js words why.',
      ev: [E('submission.update', 'stockroom', { bay: '7036', date: '2026-10-25' }, { codes: { 43648803: true } }, { wait: true, why: 'Waits for the Stockroom code' })],
      run: async c => { c.pill('bad', tx('{n} waiting', { n: 1 })); c.toast(txn(1, '{n} change will send once the Stockroom code is entered again.', '{n} changes will send once the Stockroom code is entered again.'), 'warn'); await c.wait(600); } },
  ],
  whatif: [[tx('The phone died before the wifi came back?'), S(tx('Waiting changes are kept on the phone.'), tx('They send once it is back on and in range.'))], [tx('The red pill won’t go away?'), tx('Tap it to see why each change is waiting: a code to enter again, or the phone’s date and time being wrong.')], [tx('Can I sign in with no wifi?'), tx('Yes, on a phone that has signed in before.')]],
},
{
  id: 'settings', grp: 'start', fresh: true, icon: 'gear', title: tx('Settings and updates'), device: 'pc', where: tx('PC · Settings'), for: ['manager', 'dock'],
  intro: S(tx('Language and size are set on each device.'), tx('Updates download quietly and apply when someone says so.')),
  html: () => pc('g1', `<div class="v" id="v-today"><div class="pc-h"><h3>${tx('Good morning!')}</h3><p>${tx('How we’re tracking')}</p></div><div class="kp3"><div class="kp"><b>3 / 14</b><span>${tx('Bays to review')}</span></div><div class="kp"><b>41 / 100</b><span>${tx('Shelves refreshed this week')}</span></div><div class="kp"><b>1</b><span>${tx('Checks need attention')}</span></div></div></div>
    <div class="v" id="v-set" hidden style="display:flex;flex-direction:column;gap:10px"><div class="pc-h"><h3 class="t-set">${tx('Settings')}</h3><p>${tx('Store {no}', { no: '1241' })} · Busselton</p></div>
      <div class="stg"><span class="stg-h t-disp">${tx('Display')}</span><p class="stg-p">${tx('Every store device shares one colour scheme. Size, the title bar and the rail are set on each device.')}</p>
        <div class="srow"><span class="g"><b class="t-lang">${tx('Language')}</b><small>${tx('Every screen on this device, in one of seven languages. Shelf, product and department names stay as the store writes them.')}</small></span><span class="sel2 lang" style="min-width:150px">English ${ic('next')}</span></div>
        <div class="srow"><span class="g"><b class="t-size">${tx('Display size')}</b><small>${tx('How large the whole app renders on this device. Small is 80%, Compact 95%, Large 115%.')}</small></span><span class="chipsx"><span>${tx('Small')}</span><span class="on z-n">${tx('Compact')}</span><span>${tx('Default')}</span><span class="z-l">${tx('Large')}</span></span></div>
        <div class="srow"><span class="g"><b>${tx('Rail')}</b><small>${tx('Start with the rail collapsed to icons')}</small></span><span class="tog"></span></div></div></div>
    <div class="ddl" hidden style="right:24px;top:150px"><span>English</span><span class="hl dd-de">Deutsch</span><span>Français</span><span>Filipino</span><span>Tiếng Việt</span><span>Español</span><span>Italiano</span></div>`,
    { top: `<div class="upbar" hidden>${ic('refresh')}<b>${tx('Conduit {version} is ready', { version: '0.3.1' })}</b><span>· ${tx('installed in the background · applies when you say')}</span><span class="btnx upnow">${tx('Update now')}</span></div>` }),
  steps: [
    { cap: tx('Settings is at the foot of the rail.'), read: tx('It holds this device’s display, the store’s settings for managers, and Sign out.'), dev: 'js/views/settings.js.', run: async c => { await c.tap('[data-r="settings"]'); c.rail('settings'); c.view('v-set'); } },
    { cap: tx('Make everything bigger or smaller on this PC.'), read: S(tx('Display size scales the whole app on this device only.'), tx('Large suits a PC at arm’s length on the dock.')), dev: 'Per-device appearance is a CSS token; nothing is sent.', run: async c => { await c.tap('.z-l'); c.cls('.z-n', 'on', false); c.cls('.z-l', 'on', true); c.style('.pc-content', 'fontSize', '14px'); } },
    { cap: tx('Pick a language for this device.'), read: S(tx('Every screen on this device switches.'), tx('Shelf, product and department names stay as the store writes them.')), dev: 'Translations live in js/i18n/&lt;lang&gt;/. A device fetches its own language the first time it is picked.', run: async c => { await c.tap('.lang'); c.show('.ddl'); await c.wait(400); await c.tap('.dd-de'); c.hide('.ddl'); c.html('.lang', `Deutsch ${ic('next')}`); c.text('.t-set', 'Einstellungen'); c.text('.t-disp', 'Anzeige'); c.text('.t-lang', 'Sprache'); c.text('.t-size', 'Anzeigegröße'); } },
    { cap: tx('A new version waits for you: Update now.'), read: S(tx('Updates download in the background and never interrupt a scan.'), tx('The bar shows when one is ready, and it applies when someone presses Update now.')), dev: 'sw.js installs a release as one cache and never calls skipWaiting on install; Update now posts SKIP_WAITING.', run: async c => { c.show('.upbar'); await c.wait(700); await c.tap('.upnow'); c.hide('.upbar'); c.toast(tx('Updated to {version}', { version: '0.3.1' })); } },
  ],
  whatif: [[tx('Someone else needs English?'), S(tx('Language is per device.'), tx('Each phone and PC keeps its own.'))], [tx('Nobody pressed Update now?'), tx('Nothing breaks: the device keeps its version until someone does.')], [tx('Want different colours?'), tx('The colour scheme is fixed, the same on every store device.')]],
},
// ═══ Floor ═══
{
  id: 'find', grp: 'floor', icon: 'map', title: tx('Find a shelf on a phone'), device: 'phone', where: tx('Phone · Search › Store map'), for: ['floor', 'manager'],
  intro: S(tx('Type or say a shelf and the map takes you there.'), tx('Its card shows what it is and lets you share it.')),
  html: () => phone('f1', `<div class="ph-map">${plan()}</div>
    <div class="sugg" hidden><div class="sg-row">${ic('map')}<b class="mono">A16 S2</b><span>K2 Toys</span></div><div class="sg-row">${ic('map')}<b class="mono">A16 S1</b><span>K2 Toys</span></div><div class="sg-row">${ic('map')}<b class="mono">A16</b><span>${tx('whole run · {n} shelves', { n: 2 })}</span></div></div>
    <div class="sheet" hidden><div class="grab"></div><div class="sh-h"><span class="dep" style="background:#FF4500">K2</span><b class="mono">A16 S2</b><span class="pill ok">${tx('Refreshed')} ${day('2026-10-20', { weekday: 'short' })}</span></div><p class="sh-sub">Toys · ${tx('Side')} · A16 S1, A16 S2</p><div class="sh-acts"><span class="btnx">${ic('m-picklist')}${tx('Add to route')}</span><span class="btnx share">${ic('share')}${tx('Share')}</span></div><div class="qr" hidden><span class="qrc"></span><small>…/?store=1241&amp;shelf=A16%20S2<br><b>${tx('Scan with another phone to open the map on this shelf. Signed-in devices of this store open it straight away.')}</b></small></div></div>`),
  steps: [
    { cap: tx('Tap Search and type the shelf.'), read: S(tx('The search bar is at the top of every screen.'), tx('Type the shelf as it is printed (A16 S2), or tap the microphone and say it.')), dev: 'Voice: js/voice.js listens and <b>resolveSpoken()</b> in shared/voice.js turns “a sixteen side two” into A16 S2.', run: async c => { await c.tap('.ph-search'); c.cls('.ph-search', 'focus', true); await c.type('.ph-q', 'A16 S2'); } },
    { cap: tx('It finds the shelf as you type.'), read: S(tx('A16S2, A16 S2 and A16-S2 all find the same shelf.'), tx('A16 on its own is the whole run.')), dev: '<b>groupsFor()</b> in js/map.js is the one resolver for a typed or scanned location.', run: async c => { c.show('.sugg'); await c.wait(500); await c.tap('.sg-row'); } },
    { cap: tx('The map jumps to it and its card opens.'), read: tx('The shelf lights up and the card shows its department, when it was last refreshed and its labels.'), dev: 'The map is built once and shared between views (<b>parkMap()</b>); selecting a shelf never rebuilds it.', run: async c => { c.hide('.sugg'); c.cls('.ph-search', 'focus', false); c.zoom('#sh-A16-S2'); c.cls('#sh-A16-S2', 'hit', true); c.show('.sheet'); } },
    { cap: tx('Share gives a QR code and a link.'), read: S(tx('Show the QR code to a colleague, or send the link.'), tx('It opens the map on this shelf on any store device.')), dev: '<b>shelfLink()</b> in js/share.js: ?store=…&amp;shelf=…; the code is <b>qrSvg()</b> in shared/qr.js.', run: async c => { await c.tap('.share'); c.qr('.qrc', 'shelf', 'A16 S2'); c.show('.qr'); } },
  ],
  whatif: [[tx('Typed A16 only?'), S(tx('That is the whole run.'), tx('Pick S1 or S2 from the list.'))], [tx('Not found?'), S(tx('Check the label for typos.'), tx('If the map itself is wrong, suggest a map edit from More.'))], [tx('Noisy floor?'), tx('Type instead of speaking: both find the same shelf.')]],
},
{
  id: 'refresh', grp: 'floor', icon: 'refresh', title: tx('Location refresh'), device: 'phone', where: tx('Phone · Floor › Refresh'), for: ['floor', 'manager'],
  intro: S(tx('As you refresh shelves, mark them on the map.'), tx('The week counts toward 100 in the focus departments.')),
  html: () => phone('r1', `<div class="ph-map">${plan()}</div>`, { strip: `${ic('pin')}<b>${tx('Find a shelf')}</b><span class="s"></span><span class="act">${ic('search')}${tx('Search')}</span>` }),
  steps: [
    { cap: tx('Open Refresh from the tab bar.'), read: tx('The map switches to refresh mode: shelves refreshed this week are green, and the strip counts the week.'), dev: 'js/views/refresh.js. The map element stays; only the strip and the marks change (<b>keepMap()</b> in js/shell.js).', run: async c => { await c.tap('[data-tab="refresh"]'); c.tab('refresh'); c.html('.ph-strip', rfStrip(37)); for (const s of ['A14-S1', 'A14-S2', 'A19-S1']) c.cls(`#sh-${s}`, 'done', true); } },
    { cap: tx('Tap a shelf as you finish it.'), read: S(tx('One tap marks it refreshed.'), tx('Tap it again to take the mark back.')), dev: 'A second tap sends <b>refresh.unmark</b>, with Undo on its message.',
      ev: [E('refresh.mark', 'floor', { segment: 'A15 S1', week: '2026-W43' }, { dept: 'k2' })],
      run: async c => { await c.tap('#sh-A15-S1'); c.cls('#sh-A15-S1', 'done', true); c.text('.cnt', '38 / 100'); c.toast(`${tx('{code} refreshed', { code: 'A15 S1' })} · ${tx('Undo')}`); } },
    { cap: tx('Or scan the shelf label.'), read: S(tx('Scan or type on the strip opens the scanner.'), tx('A shelf label marks its shelf, and the map shows where it is.')), dev: 'The scanned code resolves with <b>groupsFor()</b>, so A17S1 and A17-S1 work too.',
      ev: [E('refresh.mark', 'floor', { segment: 'A17 S1', week: '2026-W43' }, { dept: 'k2' })],
      run: async c => { await c.tap('.ph-strip .act'); await c.scan('A17 S1'); c.cls('#sh-A17-S1', 'done', true); c.text('.cnt', '39 / 100'); } },
    { cap: tx('Every device sees the count go up.'), read: S(tx('Marks reach every phone and PC straight away.'), tx('Two people never refresh the same shelf.')), dev: 'Floor events go to every device in the store (the Floor projection).',
      ev: [E('refresh.mark', 'floor', { segment: 'A15 S2', week: '2026-W43' }, { dept: 'k2' })],
      run: async c => { await c.tap('#sh-A15-S2'); c.cls('#sh-A15-S2', 'done', true); c.text('.cnt', '40 / 100'); c.toast(`${tx('{code} refreshed', { code: 'A15 S2' })} · ${tx('Undo')}`); } },
  ],
  whatif: [[tx('Marked the wrong shelf?'), tx('Tap it again to take the mark back, or press Undo on the message.')], [tx('Not in this week’s focus?'), S(tx('It is still marked.'), tx('Only the focus departments count toward the 100.'))], [tx('No wifi in that aisle?'), S(tx('Keep marking.'), tx('It sends when the phone is back in range.'))]],
},
{
  id: 'labels', grp: 'floor', fresh: true, icon: 'tag', title: tx('Price checks'), device: 'phone', where: tx('Phone · Floor › Labels'), for: ['floor', 'manager'],
  intro: S(tx('Each micro-department gets one label check per cycle.'), tx('Tap a shelf, fix or record the wrong labels, mark it checked.')),
  html: () => phone('l1', `<div class="ph-map">${plan()}</div>
    <div class="sheet lsh" hidden><div class="grab"></div><div class="sh-h"><span class="dep" style="background:#FF4500">K2</span><b>067 Dolls &amp; Construction</b></div><p class="sh-sub">A16 S1, A16 S2 · ${tx('Not checked yet')}</p><div class="card var" hidden style="background:#FFF7E6;border-color:#F8D9A0;padding:8px"><b style="color:#92400E;font-size:12px">${tx('Wrong labels')}</b><span class="mono" style="font-size:12px">43648803 · Lego set</span></div><div class="sh-acts"><span class="btnx wrong">${ic('alert')}${tx('Wrong label')}</span></div></div>`, { on: 'labels', strip: `${ic('m-labelint')}<b>${tx('Labels')}</b><span class="n">46 / 120</span><span class="s">${tx('{n}d left · tap a shelf', { n: 9 })}</span>` }),
  steps: [
    { cap: tx('Labels shows the cycle on the strip.'), read: S(tx('The count is micro-departments checked this cycle, and how many days are left.'), tx('Shelves still to check are highlighted.')), dev: 'One check per micro-department per cycle; the cycle (here monthly) is a store setting.', run: async c => { await c.tap('[data-tab="labels"]'); for (const s of ['A16-S1', 'A16-S2', 'A18-S1']) c.cls(`#sh-${s}`, 'lbl', true); await c.wait(900); } },
    { cap: tx('Tap a shelf: its micro-department opens.'), read: S(tx('A shelf belongs to a micro-department, like 067 Dolls & Construction.'), tx('Its card lists every shelf it covers.')), dev: 'On a phone a tap opens the micro-department; only a desk assigns shelves to one.',
      run: async c => { await c.tap('#sh-A16-S1'); c.show('.lsh'); c.html('.ph-strip', `${ic('m-labelint')}<b>067</b><span class="s">Dolls &amp; Construction</span><span class="act chk">${ic('check')}${tx('Mark checked')}</span>`); } },
    { cap: S(tx('Wrong price?'), tx('Scan the item and it is noted.')), read: tx('Fix the label, then scan the item so the wrong label is recorded for the cycle’s report.'), dev: 'Each wrong label is a <b>label.variance</b> with the keycode.',
      ev: [E('label.variance', 'floor', { micro: 'k2-067', cycle: '2026-10M' }, { keycode: '43648803' })],
      run: async c => { await c.tap('.wrong'); await c.scan('43648803'); c.show('.var'); c.toast(tx('Variance logged')); } },
    { cap: tx('Mark it checked: the count goes up.'), read: S(tx('Mark checked when every shelf of the micro-department is done.'), tx('Its shelves stop being highlighted.')), dev: '<b>label.check</b>; Checked again sends <b>label.uncheck</b>.',
      ev: [E('label.check', 'floor', { micro: 'k2-067', cycle: '2026-10M' }, {})],
      run: async c => { await c.tap('.chk'); c.hide('.lsh'); c.cls('#sh-A16-S1', 'lbl', false); c.cls('#sh-A16-S2', 'lbl', false); c.html('.ph-strip', `${ic('m-labelint')}<b>${tx('Labels')}</b><span class="n">47 / 120</span><span class="s">${tx('{n}d left · tap a shelf', { n: 9 })}</span>`); } },
  ],
  whatif: [[tx('Checked the wrong micro-department?'), tx('Tap Checked again to take it back.')], [tx('A shelf in the wrong micro-department?'), tx('A manager reassigns shelves from a PC.')], [tx('Cycle ends with some unchecked?'), S(tx('They show on the report.'), tx('The next cycle starts fresh.'))]],
},
{
  id: 'fault', grp: 'floor', fresh: true, icon: 'wrench', title: tx('Report a fault'), device: 'phone', where: tx('Phone · More › Maintenance (managers)'), for: ['manager'],
  intro: S(tx('A leak, a light out, a broken door: pin it on the map with a photo.'), tx('Every device can see it until it’s fixed.')),
  html: () => phone('m1', `<div class="ph-map mmap">${plan()}<span class="mpin" hidden style="left:68%;top:30%">${pinSvg('#DC2626')}</span></div>
    <div class="sheet fsh" hidden><div class="grab"></div><div class="sh-h"><b>${tx('Report an issue')}</b></div><p class="sh-sub fsub">${tx('Tap the map to pin where the fault is.')}</p>
      <div class="ffm" hidden style="display:flex;flex-direction:column;gap:7px"><div class="chips"><span class="c-leak">${tx('Leak')}</span><span>${tx('Lighting')}</span><span>${tx('Electrical')}</span><span>${tx('Door')}</span><span>${tx('Safety')}</span></div><div class="chips"><span>${tx('Low')}</span><span>${tx('Medium')}</span><span class="c-high">${tx('High')}</span><span>${tx('Urgent')}</span></div><span class="inp ttl" style="font:600 13px var(--body);letter-spacing:0;min-height:36px"></span><div class="sh-acts"><span class="btnx photo">${ic('camera')}${tx('Photos')}</span><span class="btnx pri fsave" style="flex:1">${ic('check')}${tx('Send report')}</span></div></div></div>`,
    { on: 'more', strip: `${ic('m-maintenance')}<b>${tx('Maintenance')}</b><span style="color:#5CC4EA">${ic('shield')}</span><span class="n">3</span><span class="s">${tx('{n} overdue', { n: 1 })}</span><span class="act rep">${ic('plus')}${tx('Report')}</span>` }),
  steps: [
    { cap: tx('Maintenance shows what’s open.'), read: S(tx('The strip counts open faults and how many are overdue.'), tx('On a phone, Maintenance is for managers; any store PC shows it too.')), dev: 'Overdue targets by severity: Low 14 days, Medium 7, High 3, Urgent 1.', run: async c => { c.cls('.ph-strip .n', 'red', true); await c.wait(900); } },
    { cap: tx('Report, then tap where the fault is.'), read: S(tx('Tap Report and then the spot on the map.'), tx('Tap again to move the pin.')), dev: 'The pin’s x and y are map coordinates, so it shows on every device’s map.', run: async c => { await c.tap('.rep'); c.show('.fsh'); await c.wait(300); await c.tap('#sh-A18-S1'); c.show('.mpin'); c.text('.fsub', tx('Pinned on the map · {where}. Tap again to move it.', { where: 'A18 S1' })); } },
    { cap: tx('Say what it is, how urgent, and add a photo.'), read: S(tx('Pick the kind and severity, write a few words, and take a photo.'), tx('Whoever fixes it knows what to bring.')), dev: 'Photos go to R2; the issue keeps each one’s id.', run: async c => { c.show('.ffm'); await c.tap('.c-leak'); c.cls('.c-leak', 'on', true); await c.tap('.c-high'); c.cls('.c-high', 'on', true); await c.tap('.ttl'); await c.type('.ttl', 'Water dripping from ceiling'); await c.tap('.photo'); c.html('.photo', `${ic('check')}${txn(1, '{n} photo', '{n} photos')}`); } },
    { cap: tx('Send it: it’s on every device until it’s fixed.'), read: S(tx('Its status goes Open, then “Done, to check”, then Completed.'), tx('If it comes back, reopen it so it counts as recurring.')), dev: '<b>issue.log</b>, then each photo’s upload and <b>issue.photo</b>; <b>issue.progress</b> and <b>issue.close</b> as it is worked.',
      ev: [E('issue.log', 'floor', { issue: ULID }, { cat: 'leak', sev: 2, title: 'Water dripping from ceiling', loc: 'A18 S1' }), R('POST', '/v1/store/1241/photo', '(the JPEG)', 'Into R2; the answer is the photo’s id.'), E('issue.photo', 'floor', { issue: ULID }, { photo: '01JBQ9…' })],
      run: async c => { await c.tap('.fsave'); c.hide('.fsh'); c.html('.ph-strip', `${ic('m-maintenance')}<b>${tx('Maintenance')}</b><span class="n red">4</span><span class="s">${tx('{n} overdue', { n: 1 })}</span><span class="act">${ic('plus')}${tx('Report')}</span>`); c.toast(tx('Sent to Maintenance')); } },
  ],
  whatif: [[tx('Not a manager?'), S(tx('Tell a manager or report it from a store PC.'), tx('On a phone, Maintenance is managers only.'))], [tx('A contractor came?'), tx('Log the visit on the issue so its history shows who came and when.')], [tx('Fixed, then broke again?'), tx('Reopen it rather than reporting it again, so it counts as recurring.')]],
},
{
  id: 'equip', grp: 'floor', icon: 'ladder', title: tx('Equipment checks'), device: 'pc', where: tx('PC · Floor › Safety & upkeep › Equipment'), for: ['manager'],
  intro: S(tx('Ladders, MHE and trolleys on the map, each with its checks.'), tx('Red needs a person now.')),
  html: () => pc('e1', `${tabsx([['emergency', tx('Emergency')], ['maintenance', tx('Maintenance')], ['equipment', tx('Equipment')], ['recalls', tx('Recalls')]], 'equipment')}<div style="display:flex;align-items:flex-end;gap:10px"><div class="pc-h" style="flex:1"><h3>${tx('Equipment checks')}</h3><p>${txn(8, '{n} piece of equipment', '{n} pieces of equipment')} · ${tx('{n} overdue', { n: 1 })} · ${tx('{n} out of service', { n: 1 })}</p></div><span class="btnx lbls">${ic('share')}${tx('Print QR labels')}</span></div>
    <div class="cols2" style="grid-template-columns:300px 1fr"><div class="eqmap"><svg viewBox="0 0 300 260" aria-hidden="true"><rect width="300" height="260" fill="#F8FAFC"/><rect width="300" height="70" fill="#E9EEF4"/><text x="8" y="12" class="zl">STOCKROOM</text><g fill="#CBD5E1"><rect x="14" y="20" width="272" height="10" rx="2"/><rect x="14" y="44" width="272" height="10" rx="2"/></g><text x="8" y="86" class="zl">FLOOR</text><g fill="#DCE3EB">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${20 + i * 34}" y="94" width="12" height="130" rx="2"/>`).join('')}</g></svg>
      <span class="pin late p2" style="left:30%;top:60%">${ic('ladder')}</span><span class="pin soon" style="left:12%;top:24%">${ic('ladder')}</span><span class="pin out" style="left:70%;top:24%">${ic('truck')}</span><span class="pin ok" style="left:82%;top:66%">${ic('ladder')}</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div class="rows lst"><div class="rw r2"><span class="pin late q2" style="position:static;transform:none">${ic('ladder')}</span><span class="g"><b class="mono">LAD-02</b> Step ladder<small>Floor, aisle 8 · ${tx('Every 3 months')}</small></span><span class="pill bad t2">${txn(10, 'Overdue {n} day', 'Overdue {n} days')}</span></div><div class="rw"><span class="pin out" style="position:static;transform:none">${ic('truck')}</span><span class="g"><b class="mono">MHE-03</b> Hand pallet jack<small>Stockroom</small></span><span class="pill blk">${tx('Out of service')}</span></div><div class="rw"><span class="pin soon" style="position:static;transform:none">${ic('ladder')}</span><span class="g"><b class="mono">LAD-01</b> Platform ladder<small>Stockroom, by 7012</small></span><span class="pill warn">${txn(9, 'Due in {n} day', 'Due in {n} days')}</span></div></div>
      <div class="card frm" hidden><b>${tx('Record a check')} · LAD-02</b>${[tx('Feet and rubber pads'), tx('Steps and rails'), tx('Locking bar and hinges'), tx('Label and load rating')].map(p => `<div class="ck"><span>${p}</span><span class="okf"><i class="ok1">${tx('OK')}</i><i>${tx('Fail')}</i></span></div>`).join('')}<div class="sh-acts"><span class="btnx allok">${tx('All OK')}</span><span class="btnx pri sv">${ic('check')}${tx('Save: checked OK · next due {date}', { date: day('2027-01-25', { day: 'numeric', month: 'short', year: 'numeric' }) })}</span></div></div></div></div>`, { on: 'safety', badge: { safety: 2 } }),
  steps: [
    { cap: tx('Red pins are overdue; black is out of service.'), read: S(tx('Green is in date, amber is due within 14 days.'), tx('The list on the right puts what needs a person first.')), dev: '<b>equipStatus()</b> in shared/reducers/equip.js; the rail count is <b>checksNeeded()</b> in js/shell.js.', run: async c => { c.cls('.p2', 'glow', true); c.cls('.r2', 'on', true); await c.wait(1300); c.cls('.p2', 'glow', false); } },
    { cap: tx('Record a check: OK or Fail on each point.'), read: S(tx('Each kind has a short list.'), tx('All OK fills them in; any Fail takes it out of service and can log a fault in Maintenance.')), dev: 'The points per kind are <b>POINTS</b> in js/views/equipment.js.', run: async c => { await c.tap('.r2'); c.show('.frm'); await c.wait(400); await c.tap('.allok'); c.cls('.ok1', 'y', true); } },
    { cap: tx('Save: the next due date moves on.'), read: S(tx('The pin turns green and the next check is due three months from today.'), tx('The rail count drops.')), dev: 'A check dated before the last one is kept but never moves the last check back.',
      ev: [E('equip.check', 'floor', { equip: 'qmh3k2x1a9' }, { day: '2026-10-25', result: 'ok', points: { feet: 'ok', rungs: 'ok', lock: 'ok', label: 'ok' } })],
      run: async c => { await c.tap('.sv'); c.hide('.frm'); for (const s of ['.p2', '.q2']) { c.cls(s, 'late', false); c.cls(s, 'ok', true); } c.text('.t2', tx('Next {date}', { date: day('2027-01-25', { day: 'numeric', month: 'short' }) })); c.cls('.t2', 'bad', false); c.cls('.t2', 'ok', true); c.cls('.r2', 'on', false); c.text('[data-r="safety"] .bdg', '1'); c.toast(tx('{code} checked OK', { code: 'LAD-02' })); } },
    { cap: tx('Print QR labels: a scan opens its card.'), read: S(tx('Stick a label on each ladder and pallet jack.'), tx('Scanning it on a store PC or a manager’s phone opens that item’s card.')), dev: 'Labels link to <b>?store=…&amp;equip=…</b> (<b>equipLink()</b> in js/share.js).', run: async c => { await c.tap('.lbls'); await c.wait(600); } },
  ],
  whatif: [[tx('A check fails?'), S(tx('It goes out of service (a black pin) until a check passes.'), tx('The Fail can log a fault in Maintenance too.'))], [tx('Moved a ladder?'), tx('Move it and tap its new spot on the map.')], [tx('Retired one?'), S(tx('A manager removes it and picks why.'), tx('Its history is kept.'))]],
},
// ═══ Stockroom ═══
{
  id: 'bfscan', grp: 'stockroom', icon: 'barcode', title: tx('Backfill: scan a location'), device: 'phone', where: tx('Phone · Stockroom › Backfill'), for: ['stockroom'],
  intro: tx('In the stockroom, scan the location label, then every product in it, then submit the location for review at the desk.'),
  html: () => {
    const steps = n => `<div class="bf-steps">${[tx('Location'), tx('Scan'), tx('Submit')].map((l, i) => `<span class="${i + 1 < n ? 'done' : i + 1 === n ? 'cur' : ''}"><i>${i + 1 < n ? ic('check') : i + 1}</i>${l}</span>`).join('')}</div>`;
    const tl = (cls, t, small) => `<div class="tl-r ${cls}"><i></i><b>${t}</b><small>${small}</small></div>`;
    return phone('b1', `
    <div class="bf-start" style="display:flex;flex-direction:column;gap:8px">${steps(1)}<div class="card" style="align-items:center;text-align:center;padding:22px 12px">${ic('barcode')}<b>${tx('Scan the location label to start.')}</b><span style="color:#5B6472;font-size:12px">${tx('Scan or type a location')}</span></div></div>
    <div class="bf-bay" hidden style="display:flex;flex-direction:column;gap:8px;flex:1;min-height:0"><div class="ph-h"><span class="baybox"><small>${tx('Location')}</small><b>7036</b></span><span><b>K2 Toys</b><small class="bf-n">${txn(0, '{n} code', '{n} codes')}</small></span><span class="pill acc bf-st" style="margin-left:auto">${tx('scanning')}</span></div>${steps(2)}
      <span class="btnx pri bf-read">${ic('camera')}${tx('Scan')}</span>
      <div class="card bf-list" style="gap:0;padding:4px 10px"></div>
      <div class="card bf-flag" hidden style="background:#FFF7E6;border-color:#F8D9A0"><b style="color:#92400E">${tx('{code} is one digit from {other}: check which is on the shelf', { code: '43648808', other: '43648803' })}</b><span style="font-size:12px;color:#92400E">${tx('Two codes are one digit apart: check which is on the shelf and remove the other.')}</span><div class="sh-acts"><span class="btnx bad bf-rm">${ic('x')}${tx('Remove {code}', { code: '43648808' })}</span></div></div>
      <span class="btnx ok big bf-send" style="margin-top:auto">${ic('check')}${tx('Submit for review')}</span></div>
    <div class="bf-done" hidden style="display:flex;flex-direction:column;gap:8px"><div class="ph-h"><span><b>${tx('Submitted for review')}</b><small>7036 · ${txn(3, '{n} code', '{n} codes')} · 08:41</small></span></div>${steps(3)}
      <div class="card" style="align-items:center;text-align:center"><span style="color:#15803D">${ic('check')}</span><b>${tx('{bay} is with review', { bay: '7036' })}</b></div>
      <div class="card bf-tl">${tl('dn', tx('Submitted for review'), `08:41 · ${txn(3, '{n} code', '{n} codes')}`)}${tl('now', tx('Reviewed at the desk'), tx('Waiting to be reviewed'))}${tl('', tx('Finalise on the PDT'), tx('After the review'))}</div></div>`, { tabs: 'stock', on: 'scan' });
  },
  steps: [
    { cap: tx('Scan the location label to start.'), read: tx('Point the camera at the location’s label, or type its number.'), dev: 'The bay and the store day are the entity, so each bay has one submission a day.',
      ev: [E('submission.open', 'stockroom', { bay: '7036', date: '2026-10-25' }, {})],
      run: async c => { await c.scan('7036'); c.hide('.bf-start'); c.show('.bf-bay'); } },
    { cap: tx('Scan every product on the shelf.'), read: S(tx('Each scan adds the code with a short buzz.'), tx('A keycode is 7 or 8 digits; a 13-digit item barcode must read cleanly.'), tx('Scan opens the camera on the PDT’s list and takes the codes straight off its screen.'), tx('Switch it to Barcode to scan one item at a time.')), dev: 'One <b>submission.update</b> per scan, so a wifi drop loses nothing. The PDT reader is js/livescan.js.',
      ev: [E('submission.update', 'stockroom', { bay: '7036', date: '2026-10-25' }, { codes: { 43648803: true } }, { n: 4 })],
      run: async c => { for (const [k, n] of [['43648803', 'Lego set'], ['42977636', 'Puzzle 500pc'], ['43615502', 'Plush bear'], ['43648808', '']]) { await c.scan(k, true); c.add('.bf-list', `<div class="rw" style="padding:7px 0"><span class="mono">${k}</span><span class="g" style="text-align:right;color:#5B6472">${n}</span></div>`); } c.text('.bf-n', txn(4, '{n} code', '{n} codes')); } },
    { cap: tx('A code one digit off another is flagged.'), read: S(tx('Two codes one digit apart are probably one misread.'), tx('Keep the one on the shelf; Remove has an Undo.')), dev: 'The near-miss check (<b>disputes()</b> in shared/backfill.js) runs on the phone before anything is sent.',
      ev: [E('submission.update', 'stockroom', { bay: '7036', date: '2026-10-25' }, { remove: ['43648808'] })],
      run: async c => { c.show('.bf-flag'); await c.wait(700); await c.tap('.bf-rm'); c.hide('.bf-flag'); c.remove('.bf-list .rw:last-child'); c.text('.bf-n', txn(3, '{n} code', '{n} codes')); c.toast(`${tx('{code} removed', { code: '43648808' })} · ${tx('Undo')}`); } },
    { cap: tx('Submit it for review when the location is done.'), read: S(tx('The location goes to Backfill review on the PC, where it is compared with the morning report.'), tx('The phone follows it: reviewed at the desk, then finalise on the PDT.')), dev: 'Stockroom events go to Stockroom devices and managers; the desk sees the bay at once.',
      ev: [E('submission.update', 'stockroom', { bay: '7036', date: '2026-10-25' }, { sent: true })],
      run: async c => { await c.tap('.bf-send'); c.hide('.bf-bay'); c.show('.bf-done'); } },
  ],
  whatif: [[tx('Lost wifi part-way through?'), S(tx('Every scan is kept on the phone and sends when it can.'), tx('Carry on scanning.'))], [tx('Both codes are real?'), tx('Leave both: the flag is a question, not an error.')], [tx('Submitted it too early?'), tx('Ask the desk to reopen the location and scan the rest.')]],
},
{
  id: 'bfreview', grp: 'stockroom', icon: 'list', title: tx('Backfill review at the desk'), device: 'pc', where: tx('PC · Stockroom › Backfill › Review'), for: ['stockroom', 'manager'],
  intro: S(tx('Paste the morning report once, then work through each bay.'), tx('What to add, what to delete, ready, submit.')),
  html: () => pc('d1', `${tabsx([['review', tx('Review')], ['daylist', tx('Day list')], ['history', tx('History')], ['trends', tx('Trends')], ['pull', tx('Live pull')]], 'review')}
    <div style="display:flex;align-items:flex-end;gap:10px"><div class="pc-h" style="flex:1"><h3>${tx('Backfill review')}</h3><p class="rep">${tx('Not pasted yet · the board compares against nothing until it is')}</p></div><span class="btnx pri paste">${ic('clipboard')}${tx('Paste whole report')}</span></div>
    <div class="cols2"><div class="rows" style="align-self:start"><div class="rw b36"><b class="mono">7036</b><span class="g">${txn(3, '{n} code', '{n} codes')}<small>${tx('sent {time}', { time: '08:41' })}</small></span><span class="pill acc s36">${tx('Needs review')}</span></div><div class="rw"><b class="mono">7041</b><span class="g">${txn(18, '{n} code', '{n} codes')}<small>${tx('sent {time}', { time: '08:47' })}</small></span><span class="pill acc">${tx('Needs review')}</span></div><div class="rw"><b class="mono">7012</b><span class="g">${txn(31, '{n} code', '{n} codes')}<small>${tx('ready {time}', { time: '08:30' })}</small></span><span class="pill ok">${tx('Ready')}</span></div></div>
      <div class="card det" style="justify-content:flex-start;align-self:start"><span style="color:#5B6472">${tx('Pick a bay to compare it with the report.')}</span></div></div>
    <div class="modal" hidden><div class="box"><h4>${tx('Paste today’s inventory report')}</h4><span style="font-size:12px;color:#15803D;font-weight:700">${tx('Found in your clipboard: a SIM report')}</span><div class="facts"><div><b>412</b><span>${tx('Bays')}</span></div><div><b>${num(3980)}</b><span>${tx('Keycodes')}</span></div><div><b>${tx('Today')}</b><span>${tx('Morning inventory report')}</span></div></div><span class="btnx pri big save">${ic('check')}${tx('Save as the morning report')}</span><span style="font-size:11.5px;color:#5B6472">${tx('The inventory report goes to Backfill review, the Day list and Adjustments.')}</span></div></div>`, { on: 'backfill' }),
  steps: [
    { cap: tx('Copy the SIM report, then press Paste.'), read: S(tx('In SIM, copy the whole report by location.'), tx('Paste reads the clipboard and says what it found before anything is saved.')), dev: 'The pop-up is js/views/pastebox.js; it parses on the PC with <b>parseReportByLocation()</b> in shared/backfill.js.', run: async c => { await c.tap('.paste'); c.show('.modal'); } },
    { cap: tx('One more click saves it for every device.'), read: tx('The report is saved for the store, so every desk and phone compares against the same one.'), dev: 'The worker stores the report and logs the event itself.',
      ev: [R('POST', '/v1/store/1241/backfill/report', { date: '2026-10-25', report: { byLoc: '{ 412 bays, 3,980 codes }' } }, 'Saved for the store.'), E('backfill.report.publish', 'stockroom', { date: '2026-10-25' }, { bays: 412, codes: 3980 })],
      run: async c => { await c.tap('.save'); c.hide('.modal'); c.text('.rep', `${tx('Morning inventory report')} · 08:52 · ${txn(412, '{n} bay', '{n} bays')}`); c.toast(tx('Report saved')); } },
    { cap: tx('Open a bay: what to add, what to delete.'), read: tx('Each bay is compared with the report: codes to add on the PDT, codes to delete, and what matches.'), dev: 'The compare is <b>reviewRows()</b> in shared/backfill.js: pure, so it reads the same on every device.', run: async c => { await c.tap('.b36'); c.cls('.b36', 'on', true); c.html('.det', `<div class="ph-h"><span class="baybox"><small>${tx('BAY')}</small><b>7036</b></span><span><b>K2 Toys</b><small>${txn(3, '{n} code', '{n} codes')}</small></span></div><div class="diff"><span class="add">+ 42977636 Puzzle 500pc</span><span>${tx('Add to {bay}', { bay: '7036' })}</span><span class="add">+ 43615502 Plush bear</span><span>${tx('Add to {bay}', { bay: '7036' })}</span><span class="del">− 43601177 Kite</span><span>${tx('Delete from system')}</span><span>43648803 Lego set</span><span>${tx('match')}</span></div><div class="sh-acts" style="margin-top:6px"><span class="btnx ok ready">${ic('check')}${tx('Ready')}</span><span class="btnx sub" style="opacity:.5">${tx('Submit')}</span></div>`); } },
    { cap: tx('Mark it ready when the PDT matches.'), read: tx('Make the changes on the PDT, then press Ready (or Enter).'), dev: 'The system-only codes go as scanned:false, then <b>submission.ready</b> carries the report’s list; its status becomes corrected.',
      ev: [E('submission.update', 'stockroom', { bay: '7036', date: '2026-10-25' }, { codes: { 43601177: false } }), E('submission.ready', 'stockroom', { bay: '7036', date: '2026-10-25' }, { system: ['43601177', '43648803'] })],
      run: async c => { await c.tap('.ready'); c.text('.s36', tx('Ready')); c.cls('.s36', 'ok', true); c.cls('.s36', 'acc', false); c.style('.sub', 'opacity', '1'); c.toast(tx('{bay} marked ready: history recorded', { bay: '7036' })); } },
    { cap: tx('Submit once the PDT is finalised.'), read: tx('Submit closes the bay for today and counts it on the board and in History.'), dev: 'Bays from earlier days left ready are submitted at midnight with <b>auto: true</b> (<b>rolloverDue()</b> in shared/backfill.js).',
      ev: [E('submission.submit', 'stockroom', { bay: '7036', date: '2026-10-25' }, {})],
      run: async c => { await c.tap('.sub'); c.text('.s36', tx('Submitted')); } },
  ],
  whatif: [[tx('Forgot to paste the report?'), S(tx('Bays still show what was scanned.'), tx('The compare appears once it is pasted.'))], [tx('Submitted one by mistake?'), tx('Unfinalise it: it goes back to Ready.')], [tx('Left bays ready overnight?'), tx('They are submitted automatically at midnight.')]],
},
{
  id: 'pull', grp: 'stockroom', icon: 'pkg', title: tx('Live pull: floor and stockroom'), device: 'duo', where: tx('Phone · More › Live pull'), for: ['floor', 'stockroom'],
  intro: S(tx('One person scans on the floor and sends how many.'), tx('The stockroom’s phones buzz and pull it straight away.')),
  html: () => `<div class="duo"><div class="duo-l"><span>${tx('Floor')}</span>${phone('pa', `<div class="ph-h"><span class="dep" style="background:#FF4500">K2</span><span><b>Toys</b><small>${txn(1, '{n} puller in the stockroom', '{n} pullers in the stockroom')}</small></span></div>
      <div class="card hint1" style="color:#5B6472;font-size:12px">${tx('Scan an item, its ticket, or type the keycode. Only items with a stockroom location can be asked for.')}</div>
      <div class="card found" hidden style="flex-direction:row;align-items:center"><span class="g" style="flex:1"><b>Lego set</b><small class="mono" style="display:block;color:#5B6472">43648803</small></span><span class="baybox"><small>${tx('BAYS')}</small><b>7036</b><small>+ 7041</small></span></div>
      <div class="padw" hidden><div class="qty">–</div><div class="pad" style="margin-top:6px">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<span data-k="${n}">${n}</span>`).join('')}<span>⌫</span><span data-k="0">0</span><span class="send">${tx('Send')}</span></div></div>
      <div class="card sent" hidden style="background:#ECFDF3;border-color:#BBE5C8;color:#166534"><b>${tx('Sent: {name} × {qty}', { name: 'Lego set', qty: 4 })}</b><span style="font-size:12px">${tx('On the pullers’ phones now. Scan the next item.')}</span></div>
      <div class="card ans" hidden style="flex-direction:row;align-items:center"><span style="flex:1"><b>Lego set · 4</b><small style="display:block;color:#5B6472">${tx('Pulled from bay {bay} at {time}', { bay: '7036', time: '10:42' })}</small></span><span class="pill ok">${tx('Pulled {n}', { n: 4 })}</span></div>`, { on: 'more', strip: `${ic('list')}<b>Toys</b><span class="s pst">${tx('{a} asked · {b} pulled', { a: 1, b: 0 })}</span>` })}</div>
    <div class="duo-l"><span>${tx('Stockroom')}</span>${phone('pb', `<div class="ph-h"><span class="dep" style="background:#FF4500">K2</span><span><b>Toys</b><small>${tx('Bays {range}', { range: '7030–7059' })}</small></span></div>
      <div class="card empty" style="color:#5B6472;font-size:12px;text-align:center;padding:18px">${tx('Nothing to pull in your bays. New requests buzz this phone.')}</div>
      <div class="card line" hidden style="border-color:#0E7CA8;box-shadow:0 0 0 2px #E7F2F6"><div style="display:flex;align-items:center;gap:8px"><span class="baybox"><small>${tx('BAY')}</small><b>7036</b></span><span style="flex:1"><b>Lego set</b><small class="mono" style="display:block;color:#5B6472">10:42 · 43648803</small></span><b style="font-size:20px">4</b></div>
        <div class="lacts" style="display:flex;gap:5px"><span class="btnx pri pulled" style="flex:1">${ic('check')}${tx('Pulled {n}', { n: 4 })}</span><span class="btnx">${tx('Short')}</span><span class="btnx bad">${tx('Not there')}</span></div></div>`, { tabs: 'stock', on: 'home', strip: `${ic('box')}<b>7030–7059</b><span class="s pbs">${tx('To pull {n}', { n: 0 })}</span>` })}</div></div>`,
  steps: [
    { cap: tx('The floor scans an item.'), read: S(tx('Only items with a stockroom bay in the morning report can be asked for.'), tx('The phone shows every bay that holds it.')), dev: 'The lookup answers with the report’s bays, the carton size and any truck today carrying it.',
      ev: [R('GET', '/v1/store/1241/pull/find?code=43648803', null, 'Bays 7036 and 7041 from today’s report.')],
      run: async c => { await c.scan('43648803', false, '#pa'); c.hide('#pa .hint1'); c.show('#pa .found'); c.show('#pa .padw'); } },
    { cap: tx('Type how many, then Send.'), read: tx('Type a number, add a carton at a time, or ask for all there is.'), dev: 'Live pull events are Floor events, so both phones hold the same list.',
      ev: [E('pull.request', 'floor', { session: ULID, line: ULID }, { kc: '43648803', bays: ['7036', '7041'], qty: 4 })],
      run: async c => { await c.tap('#pa [data-k="4"]'); c.text('#pa .qty', '4'); await c.tap('#pa .send'); c.hide('#pa .padw'); c.hide('#pa .found'); c.show('#pa .sent'); } },
    { cap: tx('The stockroom phone buzzes.'), read: S(tx('Only phones whose bays hold the item buzz.'), tx('Bays no puller picked show on every puller’s phone.')), dev: 'Alerts: <b>installPullAlerts()</b> in js/views/livepull.js (vibrate, or a sound on iPhones).', run: async c => { c.buzz('#pb'); c.hide('#pb .empty'); c.show('#pb .line'); c.html('#pb .pbs', tx('To pull {n}', { n: 1 })); } },
    { cap: tx('Mark it Pulled, Short or Not there.'), read: S(tx('Short asks how many came from each bay; Not there just tells the requester.'), tx('The first mark wins.')), dev: 'A second phone’s mark on the same line is refused as a conflict.',
      ev: [E('pull.mark', 'floor', { session: ULID, line: ULID }, { st: 'pulled', got: { 7036: 4 } })],
      run: async c => { await c.tap('#pb .pulled'); c.html('#pb .lacts', `<span class="pill ok">${tx('Pulled {n}', { n: 4 })}</span>`); c.html('#pb .pbs', tx('All marked off')); } },
    { cap: tx('The floor sees the answer straight away.'), read: S(tx('The requester’s list shows what was pulled from which bay.'), tx('Pulled earlier today shows to anyone who scans it again.')), dev: 'Both phones read the same projection (<b>pulls</b>); nothing polls.', run: async c => { c.hide('#pa .sent'); c.show('#pa .ans'); c.html('#pa .pst', tx('{a} asked · {b} pulled', { a: 1, b: 1 })); } },
  ],
  whatif: [[tx('Two pullers tap at once?'), tx('The first mark counts; the other phone shows it as done.')], [tx('Not in the morning report?'), tx('It can’t be asked for: there is no stockroom bay to pull it from.')], [tx('Only some there?'), tx('Mark Short and say how many came from each bay.')]],
},
{
  id: 'cages', grp: 'stockroom', fresh: true, icon: 'cage', title: tx('Cages'), device: 'phone', where: tx('Phone · Stockroom › Cages'), for: ['stockroom'],
  intro: S(tx('Every cage has a tag and a coloured ring.'), tx('Scan stock on, park it, and sweep the room so nothing goes missing.')),
  html: () => phone('c1', `<div class="cg-tabs"><span class="on cg-scan">${ic('barcode')} ${tx('Scan')}</span><span class="cg-sw">${ic('list')} ${tx('Sweep')}</span></div>
    <div class="card cg-start" style="align-items:center;text-align:center;padding:20px 12px">${ic('cage')}<b>${tx('Scan a cage tag')}</b><span style="color:#5B6472;font-size:12px">${tx('A tag that is not on the register opens a new cage')}</span></div>
    <div class="cg-open" hidden style="display:flex;flex-direction:column;gap:8px"><div class="ph-h"><i class="ringx" style="--rc:#2563EB"></i><span><b class="mono">C042</b><small class="cg-loc">${tx('Overstock')} · ${tx('not parked yet')}</small></span><span class="pill acc cg-n" style="margin-left:auto">${txn(0, '{n} unit', '{n} units')}</span></div>
      <div class="card cg-list" style="gap:0;padding:4px 10px"></div><span class="btnx park">${ic('check')}${tx('Done · park {cage}', { cage: 'C042' })}</span></div>
    <div class="cg-sweep" hidden style="display:flex;flex-direction:column;gap:8px"><div class="card"><b>${tx('Sweep running')} · <span class="sw-n">${tx('{n} of {total} seen', { n: 0, total: 9 })}</span></b><span style="font-size:12px;color:#5B6472">${tx('Scan a cage tag')}</span></div>
      <div class="rows sw-list"><div class="rw"><i class="ringx" style="--rc:#7C3AED;width:20px;height:20px;border-width:4px"></i><span class="g mono">C017</span><span class="pill">${tx('not seen on the sweep')}</span></div><div class="rw"><i class="ringx" style="--rc:#DC2626;width:20px;height:20px;border-width:4px"></i><span class="g mono">C031</span><span class="pill warn">${tx('Missing')}</span></div></div></div>`,
    { tabs: 'stock', on: 'cages', strip: `${ic('m-cages')}<b>${tx('Cages')}</b><span class="n">9</span><span class="s">${tx('Open cages')}</span>` }),
  steps: [
    { cap: tx('Scan a cage’s tag to open it.'), read: S(tx('A tag the store hasn’t seen opens a new cage.'), tx('Pick its ring: New lines, Overstock, Can’t work or Online picks.')), dev: 'The ring is the physical colour on the cage, kept with it (<b>RINGS</b> in shared/reducers/stockroom.js).',
      ev: [E('cage.create', 'stockroom', { cage: 'C042' }, { ring: 'overstock' })],
      run: async c => { await c.scan('C042'); c.hide('.cg-start'); c.show('.cg-open'); } },
    { cap: tx('Scan cartons on: each scan adds one.'), read: S(tx('Scan each carton as it goes on the cage.'), tx('The list shows what is on it and how many.')), dev: 'One <b>cage.scan</b> per carton with its quantity.',
      ev: [E('cage.scan', 'stockroom', { cage: 'C042' }, { keycode: '43648803', qty: 1 }, { n: 3 })],
      run: async c => { for (const [k, n, q] of [['43648803', 'Lego set', 1], ['43648803', 'Lego set', 2], ['42977636', 'Puzzle 500pc', 1]]) { await c.scan(k, true); if (q === 1) c.add('.cg-list', `<div class="rw" style="padding:7px 0"><span class="mono">${k}</span><span class="g" style="color:#5B6472">${n}</span><b class="q-${k}">× 1</b></div>`); else c.text(`.q-${k}`, `× ${q}`); } c.text('.cg-n', txn(3, '{n} unit', '{n} units')); } },
    { cap: tx('Park it: say where it stands.'), read: S(tx('Done asks where the cage is parked: an aisle or a spot.'), tx('Anyone can then find it from search or the map.')), dev: 'A park can also carry x and y to show on the stockroom map.',
      ev: [E('cage.park', 'stockroom', { cage: 'C042' }, { location: 'AISLE 2' })],
      run: async c => { await c.tap('.park'); c.text('.cg-loc', `${tx('Overstock')} · AISLE 2`); c.toast(`C042 · ${tx('Parked')} · AISLE 2`); } },
    { cap: tx('Sweep: walk the room and scan every cage.'), read: S(tx('Start a sweep and scan each tag you pass.'), tx('Cages not seen show as missing, then lost after more sweeps.')), dev: '<b>cage.sweepStart</b>, then one <b>cage.sweep</b> per tag seen.',
      ev: [E('cage.sweepStart', 'stockroom', { sweep: ULID }, {}), E('cage.sweep', 'stockroom', { cage: 'C017' }, { session: ULID })],
      run: async c => { await c.tap('.cg-sw'); c.cls('.cg-scan', 'on', false); c.cls('.cg-sw', 'on', true); c.hide('.cg-open'); c.show('.cg-sweep'); await c.scan('C017', true); c.html('.sw-list .rw:first-child .pill', tx('Seen')); c.cls('.sw-list .rw:first-child .pill', 'ok', true); c.text('.sw-n', tx('{n} of {total} seen', { n: 1, total: 9 })); c.toast(tx('{cage} seen', { cage: 'C017' })); } },
  ],
  whatif: [[tx('A cage wasn’t seen on a sweep?'), S(tx('It shows as missing.'), tx('After two sweeps in a row it shows as lost.'))], [tx('The tag fell off?'), tx('Re-tag it: the cage keeps what is on it.')], [tx('Finished with a cage?'), tx('Close it once it is empty.')]],
},
// ═══ Back dock ═══
{
  id: 'manifests', grp: 'dock', fresh: true, icon: 'clip', title: tx('Manifests by day and truck'), device: 'pc', where: tx('PC · Back dock › Plan › Manifests'), for: ['dock', 'manager'],
  intro: tx('Every manifest sits under the day and truck it came on, so you can tell at a glance which is which.'),
  html: () => {
    const dd = d => `<span class="tk"><small>${day(d, { weekday: 'short' })}</small><b>${Number(d.slice(8))}</b></span>`, tn = n => `<span class="pill">${ic('truck')}${tx('Truck {no}', { no: n })}</span>`;
    const ctn = (cartons, consols) => tx('<b>{cartons}</b> ctn · <b>{consols}</b> consols', { cartons, consols });
    const range = (a, b) => `${day(a, { day: 'numeric', month: 'short' })} – ${day(b, { day: 'numeric', month: 'short' })}`;
    return pc('n1', `${tabsx([['planner', tx('Planner')], ['manifests', tx('Manifests')], ['profiles', tx('Carton profiles')], ['offsite', tx('Off-site pallets')]], 'manifests')}<div class="pc-h"><h3>${tx('Manifests')}</h3><p>${tx('by week, each on the day and truck it came on')}</p></div>
    <div class="cols2" style="grid-template-columns:minmax(0,1fr) 300px"><div class="rows mlist">
      <div class="grp-h g-free">${tx('No day yet')}</div><div class="rw m-free"><span class="tk none">${ic('cal')}</span><span class="g"><b class="mono">7032071</b><small>${ctn(22, 3)} · ${tx('published {date}', { date: day('2026-10-23') })}</small></span><span class="pill">${tx('Published')}</span></div>
      <div class="grp-h">${tx('Next week · {range}', { range: range('2026-10-26', '2026-11-01') })}</div><div class="rw">${dd('2026-10-26')}<span class="g"><b class="mono">7032055</b> ${tn(1)}<small>${ctn(88, 12)} · ${tx('due {time}', { time: '06:30' })}</small></span><span class="pill acc">${tx('Planned')}</span></div>
      <div class="grp-h g-wk">${tx('This week · {range}', { range: range('2026-10-19', '2026-10-25') })}</div><div class="rw">${dd('2026-10-25')}<span class="g"><b class="mono">7032012</b> ${tn(1)}<small>${ctn(96, 13)}</small></span><span class="pill ok">${tx('Done')}</span></div><div class="rw m2">${dd('2026-10-25')}<span class="g"><b class="mono">7032044</b> ${tn(2)}<small>${ctn(120, 14)} · ${tx('due {time}', { time: '13:30' })}</small></span><span class="pill acc">${tx('Planned')}</span></div></div>
      <div class="card mdet" style="align-self:start"><span style="color:#5B6472">${tx('Open a manifest to see its truck, day and consolidations.')}</span></div></div>`, { on: 'plan' });
  },
  steps: [
    { cap: tx('Plan › Manifests groups them by week, day and truck.'), read: S(tx('No day yet comes first.'), tx('Then each week, newest first, its manifests by day and truck.')), dev: '<b>grouped()</b> in js/views/backdock/manifests.js; each one’s day and truck come from <b>placeIndex()</b> in shared/manifeststats.js: the truck that carried it, then a day set by hand, then its Planner slot.', run: async c => { c.cls('.mlist', 'glow', true); await c.wait(1300); c.cls('.mlist', 'glow', false); } },
    { cap: tx('The truck badge says which is which.'), read: tx('Each row leads with its day, then the manifest, its truck, its status and when it’s due.'), dev: 'Planned rows carry the slot’s eta from the Planner.', run: async c => { c.cls('.m2', 'on', true); await c.wait(900); } },
    { cap: tx('Open one: it says its truck and day.'), read: tx('The header reads “Planned for Truck 2 · Today”, with the time it’s due, above its consolidations and cartons.'), dev: 'Reading a manifest sends nothing: the device holds the Back dock projection.', run: async c => { await c.tap('.m2'); c.html('.mdet', `<b class="mono" style="font-size:15px">7032044</b><span style="font-size:12px">${tx('Planned for Truck <b>{no}</b> · {day}', { no: 2, day: tx('Today · {date}', { date: day('2026-10-25') }) })} · ${tx('due {time}', { time: '13:30' })}</span><div class="facts"><div><b>14</b><span>${tx('Consols')}</span></div><div><b>120</b><span>${tx('Cartons')}</span></div><div><b>${num(1840)}</b><span>${tx('Units')}</span></div></div>`); } },
    { cap: S(tx('No day yet?'), tx('Give it the day and truck it came on.')), read: S(tx('Set its day and truck on the manifest, or put it on a truck in the Planner.'), tx('The list moves it under that week.')), dev: 'Set by hand it is <b>manifest.day</b>; a Planner slot holding it (<b>plan.set</b>) places it too.',
      ev: [E('manifest.day', 'backdock', { manNo: '7032071' }, { day: '2026-10-24', truck: 1 })],
      run: async c => { c.cls('.m2', 'on', false); c.cls('.m-free', 'glow', true); await c.wait(800); c.cls('.m-free', 'glow', false); c.remove('.m-free'); c.remove('.g-free'); c.add('.mlist', `<div class="rw on"><span class="tk"><small>${day('2026-10-24', { weekday: 'short' })}</small><b>24</b></span><span class="g"><b class="mono">7032071</b> <span class="pill">${ic('truck')}${tx('Truck {no}', { no: 1 })}</span><small>${tx('<b>{cartons}</b> ctn · <b>{consols}</b> consols', { cartons: 22, consols: 3 })}</small></span><span class="pill">${tx('Came in')}</span></div>`); c.toast(tx('{man}: came on {day}', { man: '7032071', day: `${day('2026-10-24')} · ${tx('Truck {no}', { no: 1 })}` })); } },
  ],
  whatif: [[tx('On the wrong truck?'), tx('Change its day and truck on the manifest, or its slot in the Planner; the list follows.')], [tx('Truck number missing?'), tx('No truck, Planner slot or hand-set day has placed it yet.')], [tx('Looking for an old one?'), S(tx('Earlier weeks list below, most recent first.'), tx('Search finds any manifest number.'))]],
},
{
  id: 'receive', grp: 'dock', icon: 'truck', title: tx('Receiving a truck'), device: 'pc', where: tx('PC · Back dock › Receiving'), for: ['dock', 'manager'],
  intro: S(tx('Start the truck and land each pallet on its square.'), tx('Then start and finish each one with the person on it.')),
  html: () => pc('t1', `<div style="display:flex;align-items:flex-end;gap:10px"><div class="pc-h" style="flex:1"><h3>${tx('Receiving')}</h3><p class="tk2">${tx('Truck {n} due {time}', { n: 2, time: '13:30' })} · ${tx('Manifest {no} on Truck {n}', { no: '7032044', n: 2 })}</p></div><span class="btnx pri go">${ic('truck')}${tx('Start receiving T{n}', { n: 2 })}</span></div>
    <div class="brd" hidden><div class="board">${['A', 'B', 'C'].flatMap(r => [1, 2, 3, 4, 5, 6].map(n => `<div class="sq" id="q-${r}${n}">${r}${n}</div>`)).join('')}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px"><div class="prog" style="flex:1"><i></i></div><span class="pp" style="font-size:12px;color:#5B6472;font-weight:600">${tx('{n} of {total} pallets · {c} ctn', { n: 0, total: 18, c: 0 })}</span></div></div>
    <div class="pop land" hidden style="left:250px;top:150px"><b>${tx('Land at {ref}', { ref: 'A3' })}</b><div class="chips"><span class="on">${tx('Tubs')}</span><span>${tx('pallet type::Load')}</span><span>${tx('Bulk')}</span></div><div style="display:flex;align-items:center;gap:6px;font-size:12px">${tx('Cartons')} <b class="mono" style="border:1px solid #E5E7EB;border-radius:6px;padding:2px 8px">24</b></div><span class="btnx pri lnd">${tx('Land')}</span></div>
    <div class="pop act" hidden style="left:250px;top:150px"><b>${tx('Pallet {ref}', { ref: 'A3' })} · ${tx('{n} ctn', { n: 24 })}</b><span class="btnx pri st">${tx('Start')} · D4</span><span class="btnx ok dn" hidden>${ic('check')}${tx('Done')}</span></div>`, { on: 'receiving' }),
  steps: [
    { cap: tx('Start the truck; its manifest comes with it.'), read: tx('The planned truck already carries its manifest, so every pallet can be checked against it as it lands.'), dev: 'The truck takes its slot (and so its manifest) from the Planner; <b>attachPlanned()</b> in js/views/backdock/receiving.js attaches it.',
      ev: [E('truck.create', 'backdock', { truck: TRUCK }, { landedAt: '2026-10-25T13:12', slot: 2 }), E('truck.setLive', 'backdock', { truck: TRUCK }, {}), E('manifest.attach', 'backdock', { truck: TRUCK }, { manNo: '7032044', consols: '[14 consols]' })],
      run: async c => { await c.tap('.go'); c.hide('.go'); c.text('.tk2', tx('Manifest {no} attached to Truck {n}', { no: '7032044', n: 2 })); c.show('.brd'); c.toast(tx('Truck {n} is receiving', { n: 2 })); } },
    { cap: tx('Land each pallet on its square.'), read: S(tx('Tap a square, pick Chep, Loscam or Bulk, and the cartons.'), tx('The square shows it has landed.')), dev: 'A second land on a used square is refused (<b>bay_occupied</b>).',
      ev: [E('pallet.land', 'backdock', { truck: TRUCK, bay: 'A3' }, { ptype: 'chep', cartons: 24 })],
      run: async c => { await c.tap('#q-A3'); c.show('.land'); await c.wait(500); await c.tap('.lnd'); c.hide('.land'); c.cls('#q-A3', 'landed', true); c.html('#q-A3', `A3<small>${tx('{n} ctn', { n: 24 })}</small>`); } },
    { cap: tx('Start it with the person decanting it.'), read: S(tx('Once Take 5 is done and the decant has started, tap the pallet and Start.'), tx('Pause, hand over and join are there too, and every action has Undo for a few seconds.')), dev: 'People are D-numbers (D4); names are not kept. A pallet starts only after Take 5 (<b>begun()</b> in shared/dockphase.js).',
      ev: [E('pallet.start', 'backdock', { truck: TRUCK, bay: 'A3' }, { pid: 'D4' })],
      run: async c => { await c.tap('#q-A3'); c.show('.act'); await c.wait(400); await c.tap('.st'); c.hide('.act'); c.cls('#q-A3', 'active', true); c.html('#q-A3', `A3<small>D4</small>`); } },
    { cap: tx('Finish it: the board updates everywhere.'), read: S(tx('Done turns the square green.'), tx('The Wallboard, the Team Board and Results update straight away.')), dev: 'A second <b>pallet.done</b> changes nothing (reducer conflict rule).',
      ev: [E('pallet.done', 'backdock', { truck: TRUCK, bay: 'A3' }, {})],
      run: async c => { await c.tap('#q-A3'); c.show('.act'); c.hide('.st'); c.show('.dn'); await c.wait(400); await c.tap('.dn'); c.hide('.act'); c.cls('#q-A3', 'active', false); c.cls('#q-A3', 'done', true); c.html('#q-A3', `A3<small>${tx('Done')}</small>`); c.style('.prog i', 'width', '6%'); c.text('.pp', tx('{n} of {total} pallets · {c} ctn', { n: 1, total: 18, c: 24 })); } },
  ],
  whatif: [[tx('Landed on the wrong square?'), tx('Move it: the pallet keeps its cartons and times.')], [tx('Someone takes over a pallet?'), tx('Hand it over, and the time splits between the two people.')], [tx('Pressed Done twice?'), tx('Nothing changes: the second Done does nothing.')]],
},
];

// The Help screen a store screen opens at: js/registry.js maps view ids to these.
export const CHAPTER_IDS = SCENES.map(s => s.id);
