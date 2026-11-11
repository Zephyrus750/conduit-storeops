// Chapter: Settings and updates, on the store PC at 1920×1080, as
// js/views/settings.js draws Settings today (desktop(): the sections down the
// left; General with This device, Scanner and vibration, Updates, Map and
// Account; Display with the language, the display size, the title bar and
// the rail; Storage with what the PC keeps and the release cache; Store with
// the store's settings) and the update flow of js/updates.js and sw.js: a new
// release installs in the background and waits; the bar (js/shell.js) and
// Settings › General › Updates offer Update now; the PC reloads on it.
// Three What ifs play on the same PC: a screen hard to read (the display
// size and the rail), another language (the app reloads in it), and nobody
// pressing Update now (Later, a change from a newer device, the Updates row).
// The day is the guide's: Busselton 1241, Sunday 25 October 2026, a manager's
// PC (roles floor and manager). The release is the app's own (js/version.js),
// the next one the same with its last number one up; build ids, the device
// id and the sizes in Storage are data, as the capture showed them.
// Every class here starts stv-; the frame is js/guide/pc.js.
import { tx, lang, plain, flagSvg, LANGS } from '../../i18n.js';
import { VERSION } from '../../version.js';
import { ai } from '../frames.js';
import { pc, view, vh, sub, btn, footDate, sync } from '../pc.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const mut = (s, f) => { const n = structuredClone(s); f(n); return n; };

// ── the PC and its releases ──────────────────────────────────────────
const DEVICE = 'd_0a5imdzhzhfv';
const BUILD = '8699846b6b', NEXT_BUILD = 'c3f0a91e57';
const NEXT = VERSION.replace(/(\d+)$/, n => String(Number(n) + 1));
const LOCKS = [0, 5, 10, 15, 30, 60, 120];
// What Settings shows: the section open, the release (and one waiting),
// the display size, the folded rail, the store's idle re-lock.
const BASE = () => ({ sec: 'general', ver: VERSION, build: BUILD, waiting: null, checking: false, scale: '0.95', railmin: false, lock: 0, dd: false, saved: false, lang: lang() });

// ── a second language for the language What if ──────────────────────
// The frame and Settings › Display in German (js/i18n/de/), or in English
// when the reader's own language is German. The rest is the reader's.
const DE = {
  'Dashboard': 'Übersicht', 'Reports & files': 'Berichte & Dateien', 'Resources': 'Unterlagen', 'Floor': 'Verkaufsfläche', 'Store map': 'Filialplan', 'Layouts': 'Layouts', 'Floor checks': 'Flächenprüfungen', 'Pick list': 'Pickliste',
  'Safety & upkeep': 'Sicherheit & Instandhaltung', 'Stockroom': 'Lager', 'Backfill': 'Auffüllen', 'Stock accuracy': 'Bestandsgenauigkeit', 'Cages': 'Gitterboxen', 'Back dock': 'Warenannahme', 'Receiving': 'Wareneingang', 'Plan': 'Planung',
  'Results': 'Ergebnisse', 'Screens': 'Bildschirme', 'Settings': 'Einstellungen', 'Help': 'Hilfe', 'Soon': 'Bald', 'Store {no}': 'Filiale {no}', 'Search anything — a shelf, bay, product, manifest or consolidation…': 'Alles suchen – Regal, Lagerplatz, Produkt, Lieferschein oder Sammelsendung…',
  'Show map': 'Plan anzeigen', 'Help for this screen': 'Hilfe zu diesem Bildschirm', 'Menu': 'Menü', 'Synced to cloud': 'Mit der Cloud synchronisiert',
  'Settings and utilities': 'Einstellungen und Werkzeuge', 'General': 'Allgemein', 'Display': 'Anzeige', 'Storage': 'Speicher', 'SETUP': 'EINRICHTUNG', 'Store': 'Filiale', 'Departments': 'Abteilungen', 'Location refresh': 'Regalpflege', 'SUPPORT': 'HILFE',
  'Feedback and report': 'Feedback und Meldung', 'How to use': 'Anleitung', 'About': 'Info', 'Conduit {v} · store {no} · signed in on this device': 'Conduit {v} · Filiale {no} · auf diesem Gerät angemeldet',
  'Every store device shares one colour scheme. Size, the title bar and the rail are set on each device.': 'Alle Geräte der Filiale teilen ein Farbschema. Größe, Titelleiste und Seitenleiste werden pro Gerät eingestellt.', 'Language': 'Sprache',
  'Every screen on this device, in one of seven languages. Shelf, product and department names stay as the store writes them.': 'Alle Bildschirme auf diesem Gerät in einer von sieben Sprachen. Regal-, Produkt- und Abteilungsnamen bleiben so, wie die Filiale sie schreibt.',
  'Display size': 'Anzeigegröße', 'How large the whole app renders on this device. Small is 80%, Compact 95%, Large 115%.': 'Wie groß die ganze App auf diesem Gerät dargestellt wird. Klein ist 80 %, Kompakt 95 %, Groß 115 %.', 'Small': 'Klein', 'Compact': 'Kompakt',
  'Default': 'Standard', 'Large': 'Groß', 'Title bar': 'Titelleiste', 'Move each view’s title into the header and fold search into the logo.': 'Den Titel jeder Ansicht in die Kopfzeile verschieben und die Suche ins Logo einklappen.', 'Rail': 'Seitenleiste',
  'Start with the rail collapsed to icons': 'Seitenleiste beim Start auf Symbole eingeklappt',
};
const OTHER = () => (lang() === 'de' ? 'en' : 'de');
const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);
const other = (k, v) => fill(OTHER() === 'en' ? plain(k) : (DE[k] ?? plain(k)), v);
// The footer's date in the other language (fmtLong()).
const otherDate = () => (OTHER() === 'en' ? 'Sunday 25 Oct 2026' : new Date(2026, 9, 25, 9).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })) + ' · <b>P5W1</b>';
const FRAME_KEYS = ['Dashboard', 'Reports & files', 'Resources', 'Floor', 'Store map', 'Layouts', 'Floor checks', 'Pick list', 'Safety & upkeep', 'Stockroom', 'Backfill', 'Stock accuracy', 'Cages', 'Back dock', 'Receiving', 'Plan', 'Results', 'Screens', 'Settings', 'Help', 'Soon', 'Search anything — a shelf, bay, product, manifest or consolidation…', 'Show map', 'Menu', 'Synced to cloud'];
// The frame js/guide/pc.js draws, its words in the other language.
function otherFrame(html) {
  for (const k of FRAME_KEYS) html = html.split(`>${tx(k)}<`).join(`>${other(k)}<`);
  return html.split(`>${tx('Store {no}', { no: '1241' })}<`).join(`>${other('Store {no}', { no: '1241' })}<`).split(`"${tx('Help for this screen')}"`).join(`"${other('Help for this screen')}"`).split(footDate()).join(otherDate());
}

// ── Settings (js/views/settings.js) ──────────────────────────────────
const NAV = t => [['general', t('General'), 'settings'], ['appearance', t('Display'), 'star'], ['storage', t('Storage'), 'box'], ['_', t('SETUP')], ['store', t('Store'), 'home'], ['depts', t('Departments'), 'tag'], ['refresh', t('Location refresh'), 'm-refresh'],
  ['_', t('SUPPORT')], ['feedback', t('Feedback and report'), 'alert'], ['howto', t('How to use'), 'file'], ['about', t('About'), 'file']];
const row = (t, d, ctl, cls = '') => `<div class="stv-item${cls ? ' ' + cls : ''}"><div><b>${t}</b><span>${d}</span></div><div class="stv-ctl">${ctl}</div></div>`;
const tgl = (on, k = '') => `<span class="stv-tgl${on ? ' on' : ''}"${k ? ` data-k="${k}"` : ''}></span>`;
const sbtn = (icon, label, cls = '') => `<span class="stv-btn${cls ? ' ' + cls : ''}">${icon ? ai(icon) : ''}${label}</span>`;
const seg = (opts, cur) => `<span class="stv-seg">${opts.map(([v, l]) => `<b class="${v === cur ? 'on' : ''}" data-v="${v}">${l}</b>`).join('')}</span>`;
const sel = (v, cls = '') => `<span class="stv-sel${cls ? ' ' + cls : ''}">${v}${ai('chev', 'dn')}</span>`;
const lockName = n => (n ? tx('{n} min', { n }) : tx('Never'));
function updatesRow(s) {
  if (s.waiting) return row(tx('Update ready'), tx('Conduit {v} is installed and waiting. Applying reloads the app; queued changes are kept.', { v: s.waiting }), sbtn('check', tx('Update now'), 'pri stv-now'), 'stv-ready');
  return row(tx('Version'), `${s.ver} · ${tx('build {build}', { build: s.build })} · ${tx('installed on this device, works offline')}`, sbtn('refresh', s.checking ? tx('Checking…') : tx('Check for updates'), 'stv-check'), 'stv-ver');
}
const general = s => `<div class="stv-card stv-dev"><div class="stv-h">${tx('This device')}</div>` +
  row(tx('Store'), tx('{no} {name} · verified against the worker', { no: '1241', name: 'Busselton' }), `<span class="stv-chip">${tx('Signed in')}</span>`) + row(tx('Device id'), DEVICE, '') +
  row(tx('Roles'), [tx('floor'), tx('manager')].join(', '), `<span class="stv-dim">${tx('hard-restricted by role')}</span>`) +
  row(tx('Sync'), tx('{state} · {n} queued · seq {seq}', { state: tx('connection::live'), n: 0, seq: 1486 }), sbtn('refresh', tx('Resync'))) + '</div>' +
  `<div class="stv-card"><div class="stv-h">${tx('Scanner and vibration')}</div>${row(tx('Beep on a read'), tx('The camera scanner beeps when it reads a code.'), tgl(true))}${row(tx('Vibrate on a read'), tx('The phone buzzes when a code is read.'), tgl(true))}` +
  `${row(tx('Vibration feedback'), tx('A short buzz when a shelf is tapped, a department opens, a search finds or misses, and on errors (phones only).'), tgl(true))}</div>` +
  `<div class="stv-card stv-upds"><div class="stv-h">${tx('Updates')}</div>${updatesRow(s)}${row(tx('Force reload'), tx('Clears the cached release and reloads from the worker. Signed-in state, maps and queued changes are kept.'), sbtn('refresh', tx('Force reload')))}` +
  `${row(tx('Install app'), tx('Add Conduit to the home screen on this device. Store devices install once; it then opens full screen and works offline.'), sbtn('plus', tx('Install')))}</div>` +
  `<div class="stv-card"><div class="stv-h">${tx('Map')}</div>${row(tx('Hover details'), tx('Show a shelf’s department, run and status when the pointer rests on it.'), tgl(true))}` +
  `${row(tx('Price checks'), tx('How price checks and order screens show on the map: normal, large (the same size at any zoom) or hidden.'), seg([['small', tx('Normal')], ['large', tx('Large')], ['off', tx('Hidden')]], 'small'))}</div>` +
  `<div class="stv-card"><div class="stv-h">${tx('Account')}</div>${row(tx('Sign out'), tx('Forgets the store on this device. Queued changes are sent first.'), sbtn('', tx('Sign out'), 'red'))}</div>`;
const langPick = cur => `<span class="stv-lang">${LANGS.map(([c, n]) => `<b class="${c === cur ? 'on' : ''}" data-l="${c}">${flagSvg(c)}<span>${n}</span></b>`).join('')}</span>`;
const SCALES = t => [['0.8', t('Small')], ['0.95', t('Compact')], ['1', t('Default')], ['1.15', t('Large')]];
const display = (s, t = tx) => `<div class="stv-card stv-disp"><div class="stv-h">${t('Display')}</div><p class="stv-p">${t('Every store device shares one colour scheme. Size, the title bar and the rail are set on each device.')}</p>` +
  row(t('Language'), t('Every screen on this device, in one of seven languages. Shelf, product and department names stay as the store writes them.'), langPick(s.lang), 'stv-langrow') +
  row(t('Display size'), t('How large the whole app renders on this device. Small is 80%, Compact 95%, Large 115%.'), seg(SCALES(t), s.scale)) +
  row(t('Title bar'), t('Move each view’s title into the header and fold search into the logo.'), tgl(false, 'hdr')) + row(t('Rail'), t('Start with the rail collapsed to icons'), tgl(s.railmin, 'rail')) + '</div>';
// Storage: what the capture's PC kept (storagePots() and releaseCache()).
const POTS = () => [[tx('Store maps'), 1, '829 KB', true], [tx('Store snapshots'), 1, '1 KB', true], [tx('Session and device'), 2, '550 B'], [tx('Queued changes'), 0, '0 B'], [tx('Product names'), 0, '0 B'], [tx('Pasted inventory reports'), 0, '0 B']];
const storage = s => `<div class="stv-card stv-stor"><div class="stv-h">${tx('Storage on this device')}</div><p class="stv-p">${tx('{used} of {quota} used ({pct}%)', { used: '3.9 MB', quota: '964.1 MB', pct: 0 })}</p>` +
  POTS().map(([name, n, size, clear]) => row(name, `${n === 1 ? tx('stored::{n} item', { n }) : tx('stored::{n} items', { n })} · ${size}`, clear ? sbtn('', tx('Clear')) : '')).join('') + '</div>' +
  `<div class="stv-card stv-rel"><div class="stv-h">${tx('Release cache')}</div>${row(tx('App files'), tx('{n} files · {release} · {state}', { n: 167, release: 'suite-app-' + s.build, state: tx('complete, works offline') }), '')}${row(tx('Map cache'), tx('Empty'), '')}</div>`;
const store = s => `<div class="stv-card stv-store"><div class="stv-h">${tx('Store settings')}</div><p class="stv-p">${tx('These apply to every device in the store.')} ${s.saved ? tx('Last changed {ago} from {by}.', { ago: tx('just now'), by: DEVICE }) : tx('Every value is the default.')}</p>` +
  row(tx('Time zone'), tx('The store’s day, week and cycle, and the end-of-day backfill rollover, follow this clock.'), sel('Perth (WA)', 'tz')) +
  row(tx('Dock grid'), tx('Pallet bays on the back dock: rows (A, B, C…) by bays per row. Trucks created afterwards use it. Default {rows} × {cols}.', { rows: 4, cols: 7 }), `<span class="stv-pair">${sel('4')}<span>×</span>${sel('7')}</span>`) +
  row(tx('Minutes per carton'), tx('The dock’s standard rate for a pallet’s estimated decant time, for trucks created afterwards. Default {n}.', { n: 0.5 }), '<span class="stv-num">0.5</span>') +
  row(tx('Stockroom departments'), tx('Which stockroom bays belong to each department. Backfill review, History and Adjustments group by them. Set with the Stockroom or manager code.'), sbtn('tag', tx('Set departments'))) +
  row(tx('Idle re-lock'), tx('A device left idle this long drops its Stockroom, Back dock and manager codes. A phone keeps the Floor open; a PC asks for the manager code again.'),
    `<span class="stv-ddw">${sel(lockName(s.lock), 'lock')}${s.dd ? `<span class="stv-dd">${LOCKS.map(n => `<b class="${n === s.lock ? 'on' : ''}" data-n="${n}">${lockName(n)}</b>`).join('')}</span>` : ''}</span>`, 'stv-lockrow') +
  `<div class="stv-actions">${sbtn('check', tx('Save store settings'), 'pri stv-save')}</div></div>` +
  `<div class="stv-card"><div class="stv-h">${tx('Field Mode')}</div>${row(tx('Capture shelf codes'), tx('Walk the floor with a phone and scan each shelf’s label: a match marks it checked, a different label becomes a rename, a comment becomes a note. Send passes them to the owner’s queue; until then they wait on this device.'), sbtn('m-map', tx('Open')))}</div>`;
const BODY = { general, appearance: s => display(s), storage, store };
const nav = (s, t = tx) => `<div class="stv-nav">${NAV(t).map(([k, l, i]) => k === '_' ? `<div class="stv-grp">${l}</div>` : `<span class="stv-row${k === s.sec ? ' on' : ''}" data-sec="${k}">${ai(i)}${l}</span>`).join('')}<div class="stv-v">${t('Conduit {v} · store {no} · signed in on this device', { v: s.ver, no: '1241' })}</div></div>`;
const settingsView = (s, t = tx) => vh('m-settings', t('Settings and utilities'), sub(t('Store {no}', { no: '1241' }), 'Busselton', s.ver)) +
  `<div class="stv-stg">${nav(s, t)}<div class="stv-body">${t === tx ? BODY[s.sec](s) : display(s, t)}</div></div>`;
// Paints Settings for a state: the section, the nav and the header's version.
function paint(c, s) {
  c.cls('.pc2 .glow', 'glow', false);
  c.html('#v-set', settingsView(s));
}

// ── Screens (js/views/backdock/screenlist.js), where the chapter starts ─
const BOARDS = () => [['grid', tx('Dock screen'), tx('The pallet grid with a clock on every pallet being decanted, the hold-up banner and the crew. The crew runs the decant from it.'), tx('The dock tablet, or a wall PC on the dock.')],
  ['users', tx('Team Board'), tx('The goal, the forecast finish, and who is decanting what right now and who is next.'), tx('A wall PC the team can see.')],
  ['chart', tx('Wallboard'), tx('Progress, pace and hold-ups for the truck on the dock, and the plan for the day.'), tx('The back office, or a wall PC.')]];
const screens = () => vh('expand', tx('Screens'), tx('Full-screen boards for the wall PCs and the dock tablet.')) +
  `<div class="pc2-scr">${BOARDS().map(([icon, name, what, where]) => `<div class="pc2-card"><div class="ch">${ai(icon)}<h3>${name}</h3></div><p>${what}</p><p class="lbl">${where}</p><span class="pc2-btn pri">${ai('expand')}${tx('Open')}</span></div>`).join('')}</div>` +
  `<div class="pc2-card pc2-note">${ai('lock')}<p>${tx('Each board is also in Receiving and Results, with more detail. To set up a wall PC or the dock tablet, sign in on it as Dock screen: it opens straight on its board and never locks.')}</p></div>`;

// ── the bar, the reload and the toast ────────────────────────────────
// The update bar (js/shell.js, #updBar): over every screen, at the foot.
const upBar = v => `${ai('refresh')}<div><b>${tx('Conduit {version} is ready', { version: v })}</b><span> · ${tx('installed in the background · applies when you say')}</span></div><a class="stv-upnow">${ai('check')}${tx('Update now')}</a><a class="stv-later">${tx('Later')}</a>`;
const MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#111827"/><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" fill="none" stroke="#7DD3FC" stroke-width="5.4"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" fill="none" stroke="#22A6D6" stroke-width="5.4"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" fill="none" stroke="#0E7CA8" stroke-width="5.4"/></svg>';
// The cover the app shows while it loads (#cover in index.html).
const COVER = `<div class="stv-cover" hidden><div class="c"><span class="br">${MARK}<span>Con<b>duit</b></span></span><span class="sp"><i></i></span></div></div>`;
const OVER = v => `<div class="stv-upd" hidden>${upBar(v)}</div>${COVER}`;
// The frame: the views and, over them, the bar and the cover.
// The rail's count for Safety & upkeep is red, as paintBadges() paints the equipment's (LAD-02 is overdue).
const frame = (views, { on = 'settings', v = NEXT } = {}) => pc(views, { on }).replace('<div class="pc2-omni"', `${OVER(v)}<div class="pc2-omni"`)
  .replace(/(data-g="safety">(?:(?!data-g=)[\s\S])*?<span class=")bdg(")/, '$1bdg stv-red$2');
const inner = h => h.replace(/^<div class="dv pc2f[^"]*">/, '').replace(/<\/div>$/, '');
const toast = (c, t, tone = '') => { c.text('.pc2 > .dv-toast', t); c.cls('.pc2 > .dv-toast', 'stv-t', true); c.cls('.pc2 > .dv-toast', 'warn', tone === 'warn'); c.show('.pc2 > .dv-toast'); };
const rail1 = (c, g) => { c.cls('.pc2-rail .pc2-row', 'on', false); c.cls(`.pc2-rail .pc2-row[data-g="${g}"]`, 'on', true); };
const foot = v => `<span class="pc2-menu">${ai('sidebar')}${tx('Menu')}</span><i class="fdiv"></i><span>${footDate()}</span><span class="sp"></span><span class="pc2-sync">${sync(false)}</span><i class="fdiv"></i><span>Conduit ${v}</span>`;

// ── the states the chapter steps through ─────────────────────────────
const S0 = BASE();
const S1 = mut(S0, s => { s.checking = true; });
const S2 = mut(S0, s => { s.sec = 'appearance'; });
const S3 = mut(S0, s => { s.sec = 'storage'; });
const S4 = mut(S0, s => { s.sec = 'store'; });
const S5 = mut(S4, s => { s.dd = true; });
const S6 = mut(S4, s => { s.lock = 15; });
const S7 = mut(S6, s => { s.saved = true; });
const S8 = mut(S7, s => { s.sec = 'general'; s.waiting = NEXT; });
const S9 = mut(S0, s => { s.ver = NEXT; s.build = NEXT_BUILD; });

export const settings = {
  id: 'settings', grp: 'start', fresh: true, icon: 'gear', title: tx('Settings and updates'), device: 'pc', where: tx('PC · Settings'), for: ['manager', 'dock'],
  intro: S(tx('Language and size are set on each device.'), tx('Updates download quietly and apply when someone says so.')),
  html: () => frame(view('v-scr', screens(), true) + view('v-set', settingsView(S0), false), { on: 'screens' }),
  steps: [
    { cap: tx('Settings is at the foot of the rail, under Screens.'), read: S(tx('It opens on General: this PC, its updates and Sign out.'), tx('Display and Storage are this PC’s too; Store, Departments and Location refresh are the store’s.')),
      dev: 'The view is js/views/settings.js; its sections are NAV in <b>desktop()</b> and each one’s card is <b>body()</b>. Looking sends nothing.', ev: [],
      run: async c => { await c.tap('.pc2-rail [data-g="settings"]'); rail1(c, 'settings'); c.view('v-set'); paint(c, S0); } },
    { cap: tx('This device: the store it is signed in to, its id and its roles.'), read: S(tx('The roles come from the code it signed in with, and they decide which screens open on it.'), tx('Sync says whether it is live and how many changes wait to send.')),
      dev: 'The roles are the session’s, from the worker’s token; the sync line is the store’s status (client/store.js), Resync loads the store again.', ev: [],
      run: async c => { paint(c, S0); c.cls('#v-set .stv-dev', 'glow', true); await c.wait(700); } },
    { cap: tx('Updates: the release this PC runs, installed for offline use.'), read: S(tx('Its version and build, and that it works offline: the whole app is kept on the PC.'), tx('Force reload fetches it all again, keeping the sign-in, the maps and any changes waiting to send.')),
      dev: '<b>updatesRow()</b> reads <b>updates</b>.state (js/updates.js); sw.js keeps the release as one cache, named for its build.', ev: [],
      run: async c => { paint(c, S0); c.cls('#v-set .stv-upds', 'glow', true); await c.wait(700); } },
    { cap: tx('Check for updates: this PC is on the current release.'), read: S(tx('The PC also looks by itself when Conduit is opened again and every hour.'), tx('A new release installs in the background.')),
      dev: '<b>check()</b> in js/updates.js asks the browser to look for a new sw.js; the app also looks on visibilitychange and every hour (<b>initUpdates()</b>).', ev: [],
      run: async c => { paint(c, S0); await c.tap('#v-set .stv-check'); paint(c, S1); await c.wait(900); paint(c, S0); toast(c, tx('You are on the current release')); } },
    { cap: tx('Display: the language, the size, the title bar and the rail, for this PC.'), read: S(tx('Every store device shares one colour scheme; the rest is set on each one.'), tx('Changing one changes nothing on any other device.')),
      dev: 'Per-device preferences are kept under suite_prefs (<b>prefs()</b> in js/prefs.js) and applied to the frame by <b>applyPrefs()</b>; nothing is sent.', ev: [],
      run: async c => { c.hide('.pc2 > .dv-toast'); paint(c, S0); await c.tap('#v-set .stv-row[data-sec="appearance"]'); paint(c, S2); } },
    { cap: tx('Storage: what this PC keeps, and the release it runs from.'), read: S(tx('The store’s map, its latest snapshot and any changes waiting to send live on the PC, so it works offline.'), tx('Changes waiting to send are never cleared from here.')),
      dev: '<b>paintStorage()</b>: the pots are <b>storagePots()</b> and the release <b>releaseCache()</b> in js/diag.js.', ev: [],
      run: async c => { paint(c, S2); await c.tap('#v-set .stv-row[data-sec="storage"]'); paint(c, S3); } },
    { cap: tx('Store: the store’s own settings, for every device in it.'), read: S(tx('The time zone, the dock grid, the minutes per carton, the stockroom’s departments and the idle re-lock.'), tx('A manager code changes them.')),
      dev: '<b>storeBody()</b> shows <b>settingsOf()</b> of the store’s settings projection (shared/reducers/store.js); only a manager edits.', ev: [],
      run: async c => { paint(c, S3); await c.tap('#v-set .stv-row[data-sec="store"]'); paint(c, S4); } },
    { cap: tx('Idle re-lock: how long a PC may sit idle before it asks for the manager code again.'), read: S(tx('Never is the default.'), tx('A phone keeps the Floor open and drops only its other codes.')),
      dev: 'The choices are AUTO_LOCK_CHOICES in shared/reducers/store.js; the shell applies them with <b>applySettings()</b> in js/shell.js.', ev: [],
      run: async c => { paint(c, S4); await c.tap('#v-set .stv-sel.lock'); paint(c, S5); await c.tap('#v-set .stv-dd b[data-n="15"]'); paint(c, S6); } },
    { cap: tx('Save store settings: every device in the store follows.'), read: S(tx('Only what changed is sent.'), tx('The card says when it last changed and from which device.')),
      dev: '<b>saveStore()</b> sends <b>store.settings.set</b> with the changed values only; a value set back to its default is stored as the default.',
      ev: [E('store.settings.set', 'store', {}, { autoLockMins: 15 })],
      run: async c => { paint(c, S6); await c.tap('#v-set .stv-save'); paint(c, S7); toast(c, tx('Store settings saved')); } },
    { cap: tx('A new release: it installs in the background, then the bar asks.'), read: S(tx('The bar shows over every screen, and General says Update ready.'), tx('Nothing changes until someone says so, so a scan or a count is never cut off.')),
      dev: 'sw.js installs the whole release as one cache and never calls skipWaiting on install; <b>announce()</b> in js/updates.js tells the shell, which shows #updBar.', ev: [],
      run: async c => { c.hide('.pc2 > .dv-toast'); paint(c, S7); await c.tap('#v-set .stv-row[data-sec="general"]'); paint(c, S8); c.show('.stv-upd'); } },
    { cap: tx('Update now: the PC reloads on the new release.'), read: S(tx('It takes a moment: the release is already on the PC.'), tx('Changes waiting to send are kept.')),
      dev: '<b>apply()</b> posts SKIP_WAITING to the waiting worker; on controllerchange the page reloads once, from the new release.', ev: [],
      run: async c => { paint(c, S8); c.show('.stv-upd'); await c.tap('.stv-upd .stv-upnow'); c.html('.stv-upd', `${ai('refresh')}<div><b>${tx('Updating…')}</b></div>`); await c.wait(700); c.show('.stv-cover'); } },
    { cap: tx('Back on the new release, still signed in: Settings › General says so.'), read: S(tx('Conduit opens again on the Dashboard, with nothing lost.'), tx('The footer and Settings show the new version and build.')),
      dev: 'The new worker serves every file from its own release cache; the old release’s cache is deleted when it activates.', ev: [],
      run: async c => { c.hide('.stv-upd'); paint(c, S9); c.html('.pc2-foot', foot(NEXT)); await c.wait(500); c.hide('.stv-cover'); c.cls('#v-set .stv-ver', 'glow', true); await c.wait(500); } },
  ],
  stories: [],
};

// ── What if the screen is hard to read from where you stand? ─────────
const A0 = mut(BASE(), s => { s.sec = 'appearance'; });
const A1 = mut(A0, s => { s.scale = '1.15'; });
const A2 = mut(A1, s => { s.railmin = true; });
const A3 = mut(A2, s => { s.scale = '0.95'; });
settings.stories.push({
  id: 'size', title: tx('What if the screen is hard to read from where you stand?'), blurb: tx('Make everything bigger on this PC, and fold the rail for more room.'),
  know: [tx('Display size scales the whole app on this PC only: Small is 80%, Compact 95%, Large 115%.'), tx('Compact is the size every device starts on.'),
    tx('Every screen still fits: it lays itself out for the room it has.'), tx('Rail starts this PC with the rail folded to icons; Menu at the foot folds it or opens it any time.'),
    tx('Title bar moves each screen’s title into the header and folds search into the logo.'), tx('Nothing here is sent anywhere: each device keeps its own.')],
  html: () => frame(view('v-set', settingsView(A0), true)),
  steps: [
    { cap: tx('Display size: Large makes everything bigger on this PC.'), read: S(tx('Text, buttons and the rail all grow by the same step.'), tx('Large suits a PC read from a step back, like one on the dock.')),
      dev: 'The size is a zoom on the frame (<b>applyPrefs()</b> in js/prefs.js); the container queries see the scaled width.', ev: [],
      run: async c => { paint(c, A0); await c.tap('#v-set .stv-seg b[data-v="1.15"]'); paint(c, A1); c.cls('.pc2-z', 'stv-large', true); } },
    { cap: tx('Rail: start with it folded to icons, for more room.'), read: S(tx('A count on a folded row shows as a dot.'), tx('Pointing at an icon shows its name.')),
      dev: 'The toggle sets railmin (<b>setPref()</b>); the frame gets railmin at once and on every start.', ev: [],
      run: async c => { paint(c, A1); c.cls('.pc2-z', 'stv-large', true); await c.tap('#v-set .stv-tgl[data-k="rail"]'); paint(c, A2); c.cls('.pc2', 'min', true); } },
    { cap: tx('Compact again, the size it started on; the rail stays folded.'), read: S(tx('Each choice is on its own.'), tx('Back on the Dashboard, the same size and rail.')),
      dev: 'Both are kept on this PC under suite_prefs and applied before the first screen draws.', ev: [],
      run: async c => { paint(c, A2); c.cls('.pc2-z', 'stv-large', true); c.cls('.pc2', 'min', true); await c.tap('#v-set .stv-seg b[data-v="0.95"]'); paint(c, A3); c.cls('.pc2-z', 'stv-large', false); } },
  ],
});

// ── What if someone needs another language? ──────────────────────────
// The other language's frame with Settings › Display, as the PC shows it after the reload.
const L0 = mut(BASE(), s => { s.sec = 'appearance'; });
const L1 = mut(L0, s => { s.lang = OTHER(); });
const otherPc = () => inner(otherFrame(frame(view('v-set', settingsView(L1, other), true))));
settings.stories.push({
  id: 'lang', title: tx('What if someone needs another language?'), blurb: tx('Pick it in Display: this PC reloads in it, and every other device keeps its own.'),
  know: [tx('Language is set on each device: other phones and PCs keep theirs.'), tx('Every word on screen changes: menus, buttons and messages.'),
    tx('Shelf, product and department names, codes and what people type stay as the store writes them.'), tx('The app reloads to switch, and opens on the Dashboard.'),
    tx('The first time a language is picked the PC fetches it; after that it is kept for offline use.'), tx('Help follows the device’s language too.')],
  html: () => frame(view('v-set', settingsView(L0), true)),
  steps: [
    { cap: tx('Pick a language: this PC reloads in it.'), read: S(tx('Seven languages, each with its flag.'), tx('The PC reloads at once.')),
      dev: '<b>setLang()</b> in js/i18n.js keeps the choice in suite_prefs and reloads; the dictionary is js/i18n/&lt;lang&gt;.js.', ev: [],
      run: async c => { paint(c, L0); await c.tap(`#v-set .stv-lang b[data-l="${OTHER()}"]`); c.cls(`#v-set .stv-lang b`, 'on', false); c.cls(`#v-set .stv-lang b[data-l="${OTHER()}"]`, 'on', true); c.show('.stv-cover'); } },
    { cap: tx('Every screen is in that language now; Settings › Display switches back.'), read: S(tx('It reopens on the Dashboard; the rail, the buttons and the messages all change.'), tx('{name}, {no} and the shelf names stay as they are.', { name: 'Busselton', no: '1241' })),
      dev: 'js/i18n.js loads the device’s dictionary before the shell draws; every word goes through <b>tx()</b>.', ev: [],
      run: async c => { c.html('.pc2f', otherPc()); await c.wait(400); } },
    { cap: tx('Pick yours again: it reloads in your language.'), read: S(tx('The same button, in the same place.'), tx('Each device keeps its own choice.')),
      dev: 'The choice lives on this device only (suite_prefs); nothing is sent.', ev: [],
      run: async c => { await c.tap(`#v-set .stv-lang b[data-l="${lang()}"]`); c.show('.stv-cover'); await c.wait(700); c.html('.pc2f', inner(frame(view('v-set', settingsView(L0), true)))); } },
  ],
});

// ── What if nobody presses Update now? ───────────────────────────────
const U0 = mut(BASE(), s => { s.waiting = NEXT; });
settings.stories.push({
  id: 'later', title: tx('What if nobody presses Update now?'), blurb: tx('Nothing breaks: the PC keeps its release until someone does.'),
  know: [tx('The PC runs the release it has until someone presses Update now.'), tx('The new release is already installed, so Update now takes a moment and works without the network.'),
    tx('Later hides the bar until Conduit next opens on this PC; then it shows again.'), tx('Settings › General › Updates keeps Update now.'),
    tx('When every Conduit window on the PC is closed, the new release starts the next time it opens.'), tx('A change of a kind this release doesn’t know brings a toast asking for the update, so the PC sees every change.')],
  html: () => frame(view('v-scr', screens(), true) + view('v-set', settingsView(U0), false), { on: 'screens' }),
  steps: [
    { cap: tx('A new release is ready: the bar shows over whatever is open.'), read: S(tx('It installed in the background.'), tx('Update now or Later.')),
      dev: '#updBar is added to the frame on the ready event (<b>announce()</b> in js/updates.js).', ev: [],
      run: async c => { c.show('.stv-upd'); c.cls('.stv-upd', 'glow', true); await c.wait(700); } },
    { cap: tx('Later hides the bar; the PC keeps working on its release.'), read: S(tx('Nothing is lost and nothing changes.'), tx('The bar shows again the next time Conduit opens.')),
      dev: 'Later removes #updBar; the waiting worker stays waiting, and <b>initUpdates()</b> announces it again on the next start.', ev: [],
      run: async c => { c.show('.stv-upd'); await c.tap('.stv-upd .stv-later'); c.hide('.stv-upd'); } },
    { cap: tx('A device on the new release sends a kind of change this one doesn’t know: it asks for the update.'), read: S(tx('It looks for the new release at once.'), tx('The change shows here once it is updated.')),
      dev: 'client/store.js emits newer for an event type the catalogue here does not know; the shell checks for the release and says so.', ev: [],
      run: async c => { c.hide('.stv-upd'); await c.wait(400); toast(c, tx('A newer Conduit is out. Tap Update now when it shows, so this device sees every change.'), 'warn'); } },
    { cap: tx('Settings › General › Updates still has Update now.'), read: S(tx('Update ready, with the version waiting.'), tx('Changes waiting to send are kept when it applies.')),
      dev: '<b>updatesRow()</b> shows Update now while a release waits.', ev: [],
      run: async c => { c.hide('.pc2 > .dv-toast'); await c.tap('.pc2-rail [data-g="settings"]'); rail1(c, 'settings'); c.view('v-set'); paint(c, U0); c.cls('#v-set .stv-ready', 'glow', true); } },
  ],
});
