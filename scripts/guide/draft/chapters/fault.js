// Chapter: Report a fault, on a manager's phone: More › Maintenance as the
// app has it today (js/views/maintenance.js mobile(), phoneStrip() and
// phone()): the open faults as pins on the store map, Report, a pin
// dropped on the spot, the form (what, where, type, how urgent, a note,
// photos), Send, and the fault worked to Done, to check and Completed.
// Three What ifs play on the same phone: a fault already logged near the
// pin, a fault that breaks again, and a contractor's visit.
// The map is Busselton 1241's sales floor (js/guide/find-map.js). The day:
// Sunday 25 October 2026; three faults are open, one of them overdue.
import { tx, txn } from '../../i18n.js';
import { ai, phone2, toast2 } from '../frames.js';
import { at, dt } from '../pc.js';
import { FIT, around, mapSvg } from '../find-map.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const R = (method, path, body, note) => ({ route: `${method} ${path}`, method, path, body, note });

// ── the faults ───────────────────────────────────────────────────────
// Each category's pictogram, as js/views/maintenance.js GLYPH draws it.
const GLYPH = {
  leak: '<path d="M0 -7C3 -2 5 1 5 3.5A5 5 0 0 1 -5 3.5C-5 1 -3 -2 0 -7z"/>',
  light: '<path d="M-4 -1A4.5 4.5 0 1 1 4 -1C4 1.5 2 2.5 2 4.5H-2C-2 2.5 -4 1.5 -4 -1zM-2 6.5H2"/>',
  door: '<path d="M-5 7V-7H5V7M-7 7H7M2 0.5V1"/>',
  struct: '<path d="M-7 -6H7V6H-7zM-7 -2H7M-7 2H7M-2 -6V-2M3 -2V2M-2 2V6"/>',
  fixture: '<path d="M-6 7L2 -1M0 -3L4 -7L7 -4L3 0z"/>',
};
const COL = { open: '#DC2626', progress: '#D97706', completed: '#16A34A' };
const SEV = () => [[tx('Low'), '#6B7280'], [tx('Medium'), '#D97706'], [tx('High'), '#DC2626'], [tx('Urgent'), '#7F1D1D']];
const CAT = () => ({ leak: tx('Leak'), light: tx('Lighting'), door: tx('Door'), struct: tx('Structural'), fixture: tx('Fixture') });
const TYPES = () => [tx('Leak'), tx('Lighting'), tx('Electrical'), tx('Air-con'), tx('Plumbing'), tx('Structural'), tx('Fixture'), tx('Door'), tx('Safety'), tx('Pest'), tx('Other')];
const ID = 'mmh3k2x9a1q', PHOTO = '01JBRA4Q7Z8M2C6V0D3N5PXKTE';
// The new fault: its pin beside K18 S2 (map units), and how it stands.
const LEAK = { id: ID, cat: 'leak', title: 'Water dripping from the ceiling', note: 'Bucket under it for now', sev: 2, loc: 'near K18 S2', x: -1408, y: -664, status: 'open', recur: 0, photos: 1, log: [] };
// The faults already open, from the week (data: titles and places as typed).
const OPEN = [
  { id: 'mseed1', cat: 'light', title: 'Light out over A20', sev: 1, loc: 'near A20 E1', ago: 9, x: 280, y: 60, status: 'open', overdue: true },
  { id: 'mseed2', cat: 'door', title: 'Entry door slow to open', sev: 2, loc: 'Entry', ago: 2, x: -500, y: 360, status: 'progress' },
  { id: 'mseed3', cat: 'struct', title: 'Ceiling tile stained', sev: 0, loc: 'near A18 S2', ago: 3, x: 190, y: -60, status: 'open' },
];
const DONE = { id: 'mseed4', cat: 'fixture', title: 'Shelf strip loose', loc: 'near K11 S1', ago: 1, status: 'completed' };
const pin = i => ({ id: i.id, x: i.x, y: i.y, colour: COL[i.status], glyph: GLYPH[i.cat], badge: i.recur ? String(i.recur) : '' });
const glyph = (cat, status) => `<span class="ft-gl"><svg viewBox="-9 -9 18 18" aria-hidden="true"><g fill="none" stroke="${COL[status]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[cat]}</g></svg></span>`;
const ago = n => n ? tx('{n}d ago', { n }) : tx('just now');

// ── the views (map units) ────────────────────────────────────────────
const VK = around(-1250, -655, 614);   // the Toys runs, K16 to K22, where the leak is
const VA = [-80, -420, 500, 891];       // the Kitchen runs A12 to A22, round the stained tile

// ── the screens ──────────────────────────────────────────────────────
// A state: vb, the faults (open list, the leak if logged), the strip
// ('home', 'draft', 'pinned', 'issue', 'find'), the panel ('', 'list',
// 'form', 'issue'), the form as typed, the issue in hand and how far its
// panel is scrolled.
const st = o => ({ vb: FIT, leak: null, strip: 'home', panel: '', form: null, issue: null, scroll: 0, draft: null, ...o });
const open = s => [...OPEN, ...(s.leak && s.leak.status !== 'completed' ? [s.leak] : [])];
const counts = s => ({ n: open(s).length, over: open(s).filter(i => i.overdue).length, recur: open(s).filter(i => i.recur).length });
const badge = s => { const c = counts(s); return c.recur ? tx('<b>{n}</b> open · {k} recurring', { n: c.n, k: c.recur }) : tx('<b>{n}</b> open', { n: c.n }); };
const tog = up => `<span class="ft-tog">${ai('chev', up ? 'up' : '')}</span>`;
// The strip (js/views/maintenance.js phoneStrip), or the floor's Home strip.
function strip(s) {
  const c = counts(s), up = !s.panel;
  if (s.strip === 'find') return `<span class="ft-st">${ai('pin')}<b>${tx('Find a shelf')}</b><span class="ft-sp"></span><span class="ft-act">${ai('search')}${tx('Search')}</span><span class="ft-act ic">${ai('barcode')}</span></span>${tog(up)}`;
  if (s.strip === 'draft') return `<span class="ft-st">${ai('m-maintenance')}<b>${tx('New report')}</b><span class="ft-s">${tx('Tap the map to pin it')}</span><span class="ft-act">${ai('chev')}${tx('Skip')}</span></span>${tog(up)}`;
  if (s.strip === 'pinned') return `<span class="ft-st">${ai('m-maintenance')}<b>${tx('New report')}</b><span class="ft-s">${tx('Pinned')}</span><span class="ft-act go ft-send">${ai('check')}${tx('Send')}</span></span>${tog(up)}`;
  if (s.strip === 'issue') { const i = s.issue; return `<span class="ft-st">${glyph(i.cat, i.status)}<b class="ft-t">${i.title}</b><span class="ft-s">${stName(i)}</span><span class="ft-act ft-close">${ai('x')}${tx('Close')}</span></span>${tog(up)}`; }
  return `<span class="ft-st">${ai('m-maintenance')}<b>${tx('Maintenance')}</b><span class="ft-mgr">${ai('shield')}</span><span class="ft-n">${c.n}</span><span class="ft-s">${c.over ? tx('{n} overdue', { n: c.over }) : ''}</span><span class="ft-act go ft-rep">${ai('plus')}${tx('Report')}</span></span>${tog(up)}`;
}
const stName = i => i.status === 'open' ? tx('issue status::Open') : i.status === 'progress' ? tx('Done, to check') : tx('Completed');
const sec = (label, body, note = '') => `<div class="ft-sec"><div class="ft-sl">${label}${note ? `<span>${note}</span>` : ''}</div>${body}</div>`;
const btn = (k, icon, label, pri) => `<span class="ft-b${pri ? ' pri' : ''}" data-b="${k}">${ai(icon)}${label}</span>`;
// The list: open faults, overdue first, then the ones completed lately.
function list(s) {
  const row = i => `<div class="ft-r" data-id="${i.id}">${glyph(i.cat, i.status)}<div class="k"><b>${i.title}</b><span>${SEV()[i.sev][0]} · ${i.loc} · ${ago(i.ago)}</span></div><span class="v ${i.overdue ? 'bad' : i.status === 'progress' ? 'warn' : ''}">${i.overdue ? tx('Overdue') : i.status === 'progress' ? tx('To check') : tx('issue status::Open')}</span></div>`;
  const rows = [OPEN[0], ...(s.leak && s.leak.status !== 'completed' ? [{ ...s.leak, ago: 0 }] : []), OPEN[1], OPEN[2]];
  const done = [...(s.leak?.status === 'completed' ? [{ ...s.leak, ago: 0 }] : []), DONE];
  const c = counts(s);
  return `<div class="ft-h">${ai('m-maintenance')}${tx('Maintenance')}<span class="ft-pill red">${tx('{n} open', { n: c.n })}</span></div>` +
    `<div class="ft-acts">${btn('new', 'plus', tx('Report an issue'), true)}</div>` +
    sec(tx('issue status::Open'), `<div class="ft-rows">${rows.map(row).join('')}</div>`, tx('{n} overdue', { n: c.over })) +
    sec(tx('Recently completed'), `<div class="ft-rows">${done.map(i => `<div class="ft-r">${glyph(i.cat, 'completed')}<div class="k"><b>${i.title}</b><span>${tx('{where} · done {ago}', { where: i.loc, ago: ago(i.ago) })}</span></div></div>`).join('')}</div>`);
}
// The report form (phone()'s draft): f is what has been filled in.
function form(s) {
  const f = s.form, ph = (v, p) => v ? `<span class="ft-in">${v}</span>` : `<span class="ft-in ft-ph0">${p}</span>`;
  const sevs = SEV().map(([l, c], n) => `<span class="ft-chip${f.sev === n ? ' on' : ''}" data-sev="${n}"><i style="background:${c}"></i>${l}</span>`).join('');
  const photos = `<div class="ft-phs">${f.photo ? `<span class="ft-ph pend">${ai('camera')}1<i>${ai('x')}</i></span>` : ''}<span class="ft-ph add">${ai('camera')}<b>${tx('Add photo')}</b></span></div><p class="ft-note">${tx('Photograph the fault, not people.')}</p>`;
  return `<div class="ft-h">${ai('m-maintenance')}${tx('Report an issue')}</div><div class="ft-sub">${tx('Pinned on the map · {where}. Tap again to move it.', { where: f.loc })}</div>` +
    (f.dup ? `<div class="ft-dup">${ai('alert')}${txn(1, '{n} issue already logged near here. Check the list before sending.', '{n} issues already logged near here. Check the list before sending.')}</div>` : '') +
    sec(tx('What'), `<div class="ft-f" data-f="title">${ph(f.title, tx('Light out over the end bay'))}</div>`) +
    sec(tx('Where'), `<div class="ft-f">${ph(f.loc, tx('Aisle K2, bay 8963'))}</div>`) +
    sec(tx('Type'), `<div class="ft-f sel" data-f="cat">${ph(f.cat, '')}${ai('chev')}</div><div class="ft-opts" hidden>${TYPES().map(t => `<span${t === f.cat ? ' class="on"' : ''}>${t}</span>`).join('')}</div>`) +
    sec(tx('How urgent'), `<div class="ft-chips">${sevs}</div>`) +
    sec(tx('Note'), `<div class="ft-f" data-f="note">${ph(f.note, tx('Anything the contractor should know'))}</div>`, tx('optional')) +
    sec(tx('Photos'), photos, tx('up to 4')) +
    `<div class="ft-acts">${btn('send', 'check', tx('Send report'), true)}${btn('cancel', 'x', tx('Cancel'))}</div>`;
}
// A fault opened (phone()): its facts, note, photos, what can be done, its log.
function issue(s) {
  const i = s.issue, done = i.status === 'completed', sev = SEV()[i.sev][0];
  const facts = [[tx('Urgency'), sev], [tx('Type'), CAT()[i.cat]], [tx('Logged'), i.logged], done ? [tx('Completed'), i.closed] : [tx('repair::Target'), txn(i.target, '{n} day', '{n} days')]];
  const photos = i.photos ? `<span class="ft-ph img">${done ? '' : `<i>${ai('x')}</i>`}</span>` : '';
  const acts = i.status === 'open' ? [btn('progress', 'tool', tx('Maintenance done'), true), btn('close', 'check', tx('Complete')), btn('show', 'pin', tx('Show on map')), btn('edit', 'edit', tx('Edit')), btn('visit', 'users', tx('Contractor visited'))]
    : i.status === 'progress' ? [btn('close', 'check', tx('Complete'), true), btn('reopen', 'refresh', tx('Not fixed')), btn('show', 'pin', tx('Show on map')), btn('edit', 'edit', tx('Edit')), btn('visit', 'users', tx('Contractor visited'))]
      : [btn('reopen', 'refresh', tx('Reopen'), true), btn('show', 'pin', tx('Show on map'))];
  return `<div class="ft-h">${glyph(i.cat, i.status)}<span class="ft-ttl">${i.title}</span><span class="ft-pill${i.status === 'open' ? ' red' : ''}">${stName(i)}</span></div>` +
    `<div class="ft-sub">${i.loc}${i.recur ? ` · <span class="ft-rec">${tx('↻ reopened {n}×', { n: i.recur })}</span>` : ''}</div>` +
    `<div class="ft-sec"><div class="ft-facts">${facts.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div></div>` +
    (i.note ? sec(tx('Note'), `<div class="ft-sub ft-nt">${i.note}</div>`) : '') +
    sec(tx('Photos'), `<div class="ft-phs">${photos}${done ? '' : `<span class="ft-ph add">${ai('camera')}<b>${tx('Add photo')}</b></span>`}</div>${done ? '' : `<p class="ft-note">${tx('Photograph the fault, not people. Photos are deleted 90 days after the issue is closed.')}</p>`}`, tx('{n} of 4', { n: i.photos })) +
    `<div class="ft-acts ft-ov${s.acts ? ' sc' : ''}"><span class="ft-row">${acts.join('')}</span></div>` +
    sec(tx('Log'), `<div class="ft-rows">${[...i.log].reverse().map(([a, n, t]) => `<div class="ft-r lg">${ai('history')}<div class="k"><b>${a}</b>${n ? `<span>${n}</span>` : ''}</div><span class="v t">${t}</span></div>`).join('')}</div>`) +
    `<div class="ft-acts">${btn('back', 'x', tx('Back to the list'))}</div>`;
}
const panelHtml = s => `<div class="ft-inr" style="transform:translateY(${-s.scroll}px)">${s.panel === 'list' ? list(s) : s.panel === 'form' ? form(s) : issue(s)}</div>`;
// Paints the map, its badge, the strip and the panel for a state.
const paint = (c, s) => {
  c.html('.ft-map', mapSvg({ vb: s.vb, pins: pinsOf(s) }));
  c.html('.ft-badge', badgeHtml(s)); c.cls('.ft-badge', 'fnd', s.strip === 'find');
  c.html('.p2-strip', strip(s));
  c.html('.ft-panel', s.panel ? panelHtml(s) : ''); if (s.panel) c.show('.ft-panel'); else c.hide('.ft-panel');
  c.cls('.p2-tabs [data-tab="mhome"]', 'on', s.strip === 'find');
};
const note = (c, text) => toast2(c, `<span>${text}</span>`);
// The browser's note box (prompt()), as the app asks it for each change.
const ask = (c, msg) => { c.html('.ft-pr .m', msg); c.html('.ft-pr .ft-pin', ''); c.show('.ft-pr'); };
const answer = async (c, text) => { await c.type('.ft-pr .ft-pin', text); await c.tap('.ft-pr [data-ok]'); c.hide('.ft-pr'); };

// The More sheet (js/shell.js openMore): a manager's floor phone.
const moreSheet = () => {
  const row = (icon, title, sub, mgr, k = '') => `<span class="ft-mo"${k ? ` data-v="${k}"` : ''}><span class="ti">${ai(icon)}</span><b>${title}${mgr ? `<span class="ft-mgr">${ai('shield')}</span>` : ''}${sub ? `<small>${sub}</small>` : ''}</b>${ai('chev', 'fwd')}</span>`;
  return `<div class="ft-moh"><b>${tx('More')}</b><span class="ft-x">${ai('x')}</span></div>` +
    `<div class="ft-who"><span class="av">1241</span><div><b>Busselton · ${tx('Floor')}</b><small>${tx('Signed in on this phone')}</small><small class="m"><span class="ft-mgr">${ai('shield')}</span>${tx('marks what only managers see')}</small></div></div>` +
    `<div class="ft-mos">${tx('Tools')}</div><div class="ft-mol">${row('packages', tx('Live pull'), tx('Ask the stockroom for stock, or pull it'))}${row('m-stocktake', tx('Stocktake'), tx('Count shelves in a session'))}${row('m-maintenance', tx('Maintenance'), tx('Report a fault, with photos'), true, 'maintenance')}${row('m-equipment', tx('Equipment checks'), tx('Ladders, MHE and trolleys'), true)}${row('alert', tx('Recalls'), tx('Products off sale: what to pull'), true)}${row('edit', tx('Suggest map edits'), tx('A wrong name or a missing shelf'))}</div>` +
    `<div class="ft-mos">${tx('Store and app')}</div><div class="ft-mol">${row('m-store', tx('Store details'))}${row('help', tx('Help'))}${row('m-settings', tx('Settings'))}</div>` +
    `<div class="ft-mof"><span>${ai('grid')}${tx('Switch area')}</span><span class="out">${ai('lock')}${tx('Sign out')}</span></div>`;
};
const extra = () => `<div class="ft-dim" hidden></div><div class="ft-more" hidden>${moreSheet()}</div>` +
  `<div class="ft-pr" hidden><div class="ft-prc"><div class="m"></div><div class="ft-pf"><span class="ft-pin"></span></div><div class="ft-pb"><span>${tx('Cancel')}</span><span data-ok>${tx('dialog::OK')}</span></div></div></div>`;

const pinsOf = s => s.strip === 'find' ? [] : [...open(s).map(pin), ...(s.draft ? [{ x: s.draft[0], y: s.draft[1], colour: '#0E7CA8', label: '+' }] : [])];
const badgeHtml = s => s.strip === 'find' ? `${ai('grid')}<span>${tx('All departments')}</span>` : badge(s);
// A phone painted to a state: the chapter and each What if start from one.
const phone = (s = st()) => () => phone2('ft', `<div class="ft-mv"><div class="ft-map">${mapSvg({ vb: s.vb, pins: pinsOf(s) })}</div><div class="ft-badge${s.strip === 'find' ? ' fnd' : ''}">${badgeHtml(s)}</div>` +
  `<div class="ft-tools"><span class="scan">${ai('barcode')}</span><span data-z="in">${ai('plus')}</span><span data-z="out">${ai('minus')}</span><span data-z="fit">${ai('map')}</span></div></div><div class="ft-panel"${s.panel ? '' : ' hidden'}>${s.panel ? panelHtml(s) : ''}</div>`,
  { area: 'floor', on: s.strip === 'find' ? 'mhome' : '', strip: strip(s), extra: extra() });

// The chapter's states.
const LOGGED = at('10:42'), PROG = at('15:10'), CLOSED = at('16:25');
const leak = o => ({ ...LEAK, logged: LOGGED, target: 3, log: [[tx('Logged'), LEAK.note, LOGGED], [tx('Photo added'), '', LOGGED]], ...o });
const L1 = leak(), L2 = leak({ status: 'progress', log: [...L1.log, [tx('Maintenance done'), 'Roof plumber cleared the gutter', PROG]] });
const L3 = leak({ status: 'completed', closed: CLOSED, log: [...L2.log, [tx('Completed'), 'Checked after the rain: dry', CLOSED]] });
const HOME = st({ strip: 'find' }), MAINT = st(), LIST = st({ panel: 'list' }), DRAFT = st({ strip: 'draft' });
const F0 = { title: '', loc: 'near K18 S2', cat: tx('Other'), sev: 1, note: '', photo: false };
const PINNED = st({ vb: VK, strip: 'pinned', panel: 'form', form: F0, draft: [LEAK.x, LEAK.y] });
const F1 = { ...F0, title: LEAK.title, cat: tx('Leak'), sev: 2, note: LEAK.note };
const SENT = st({ vb: VK, leak: L1, strip: 'issue', panel: 'issue', issue: L1 });

// ── the chapter ──────────────────────────────────────────────────────
export const fault = {
  id: 'fault', grp: 'floor', fresh: true, icon: 'wrench', title: tx('Report a fault'), device: 'phone', where: tx('Phone · More › Maintenance (managers)'), for: ['manager'],
  intro: S(tx('A leak, a light out, a broken door: pin it on the map with a photo.'), tx('Every store PC and manager’s phone sees it until it’s fixed.')),
  html: phone(HOME),
  steps: [
    { cap: tx('Open More: Maintenance has the managers’ shield.'), read: S(tx('On a phone, Maintenance shows for managers; every store PC has it.'), tx('The shield marks what only managers see.')),
      dev: '<b>openMore()</b> in js/shell.js leaves out desk-only views; Maintenance is desk-only for anyone but a manager (deskOnly in js/views/maintenance.js).', ev: [],
      run: async c => { await c.tap('.p2-tabs [data-tab="more"]'); c.show('.ft-dim'); c.show('.ft-more'); } },
    { cap: tx('Maintenance: each open fault is a pin on the map.'), read: S(tx('The strip counts the open faults and how many are overdue.'), tx('A red pin is open; amber is done and waiting to be checked.')),
      dev: 'On a phone Maintenance is a map mode: <b>mvMap()</b> with a pin per open issue (<b>drawPins()</b> in js/map.js) and <b>phoneStrip()</b> in js/views/maintenance.js. Overdue after 14 days for Low, 7 for Medium, 3 for High and 1 for Urgent (SLA_DAYS).', ev: [],
      run: async c => { await c.tap('.ft-more [data-v="maintenance"]'); c.hide('.ft-more'); c.hide('.ft-dim'); paint(c, MAINT); } },
    { cap: tx('The arrow lists them, overdue first.'), read: S(tx('Each says how urgent it is, where, and when it was logged.'), tx('Tap one to open it.')),
      dev: '<b>phone()</b> in js/views/maintenance.js: the open issues, overdue first, then the five completed last.', ev: [],
      run: async c => { await c.tap('.p2-strip .ft-tog'); paint(c, LIST); } },
    { cap: tx('Report: the strip asks where the fault is.'), read: S(tx('The list closes so the map is clear.'), tx('Skip goes straight to the form, for a fault with no spot on the map.')),
      dev: 'Report starts a draft: <b>phoneStrip()</b> says New report, and the sheet stays closed until the pin is down.', ev: [],
      run: async c => { await c.tap('.p2-strip .ft-rep'); paint(c, DRAFT); } },
    { cap: tx('Zoom in and tap the spot: a pin, and the form opens.'), read: S(tx('Where fills in with the nearest shelf.'), tx('Tap the map again to move the pin.')),
      dev: '<b>nearestShelf()</b> in js/views/maintenance.js names the shelf nearest the tap. The pin is in map units, so it lands in the same place on every device.', ev: [],
      run: async c => { await c.tap('.ft-tools [data-z="in"]'); paint(c, { ...DRAFT, vb: VK }); await c.tap('.ft-map [data-s="K18 S2"]'); paint(c, PINNED); } },
    { cap: tx('Say what it is, its type and how urgent.'), read: S(tx('A few words in What, the type from the list, and how urgent it is.'), tx('A note helps whoever comes to fix it.')),
      dev: 'The form is <b>phone()</b>’s draft: eleven types (ISSUE_CATS in shared/reducers/floor.js), and How urgent starts at Medium.', ev: [],
      run: async c => {
        await c.tap('.ft-panel [data-f="title"]'); c.cls('.ft-panel [data-f="title"] .ft-in', 'ft-ph0', false); await c.type('.ft-panel [data-f="title"] .ft-in', LEAK.title);
        await c.tap('.ft-panel [data-f="cat"]'); c.show('.ft-panel .ft-opts'); await c.wait(500); paint(c, { ...PINNED, form: { ...F0, title: LEAK.title, cat: tx('Leak') } });
        await c.tap('.ft-panel [data-sev="2"]'); paint(c, { ...PINNED, form: { ...F0, title: LEAK.title, cat: tx('Leak'), sev: 2 } });
        await c.tap('.ft-panel [data-f="note"]'); c.cls('.ft-panel [data-f="note"] .ft-in', 'ft-ph0', false); await c.type('.ft-panel [data-f="note"] .ft-in', LEAK.note); } },
    { cap: tx('Add a photo of the fault: up to four.'), read: S(tx('Photograph the fault, not people.'), tx('The phone shrinks each photo, and it goes up once the report is sent.')),
      dev: 'A photo taken while writing waits in the draft; after <b>issue.log</b>, <b>uploadPhoto()</b> shrinks each one (<b>shrink()</b>: 1280 px, JPEG) and sends it.', ev: [],
      run: async c => { await c.tap('.ft-panel .ft-ph.add'); paint(c, { ...PINNED, form: { ...F1, photo: true }, scroll: 100 }); } },
    { cap: tx('Send: the fault opens, and it’s on every device.'), read: S(tx('Its target comes from how urgent it is: High is 3 days.'), tx('Every store PC and manager’s phone sees the pin straight away.')),
      dev: '<b>issue.log</b> carries the pin, the shelf and the floor; then the photo goes up to the worker and <b>issue.photo</b> adds its id.',
      ev: [E('issue.log', 'floor', { issue: ID }, { cat: 'leak', title: LEAK.title, note: LEAK.note, sev: 2, loc: 'near K18 S2', dept: 'k2', x: LEAK.x, y: LEAK.y, floor: 'ground' }),
        R('POST', '/v1/store/1241/photo', '(the JPEG, 1280 px)', 'Into the store’s photo store (R2); the answer is the photo’s id.'), E('issue.photo', 'floor', { issue: ID }, { photo: PHOTO })],
      run: async c => { await c.tap('.ft-panel [data-b="send"]'); paint(c, SENT); note(c, tx('Sent to Maintenance')); } },
    { cap: tx('Close the panel: the pin is on the map.'), read: S(tx('The strip keeps the fault in hand.'), tx('Close goes back to the list.')),
      dev: 'With an issue in hand, <b>phoneStrip()</b> shows its pictogram, title and status.', ev: [],
      run: async c => { await c.tap('.p2-strip .ft-tog'); paint(c, { ...SENT, panel: '' }); } },
    { cap: tx('Fixed? Maintenance done, with a note for the log.'), read: S(tx('It turns amber: done, and waiting for someone to check it.'), tx('Cancel leaves it as it was.')),
      dev: 'Each change asks for a note in the browser’s prompt, then sends <b>issue.progress</b>; the note goes in the log.', ev: [E('issue.progress', 'floor', { issue: ID }, { note: 'Roof plumber cleared the gutter' })],
      run: async c => { await c.tap('.p2-strip .ft-tog'); paint(c, SENT); await c.tap('.ft-panel [data-b="progress"]'); ask(c, tx('Maintenance done. Note (optional):')); await answer(c, 'Roof plumber cleared the gutter'); paint(c, { ...SENT, leak: L2, issue: L2 }); } },
    { cap: tx('Checked it? Complete.'), read: S(tx('It leaves the map and the open list.'), tx('If it breaks again, Reopen brings it back as recurring.')),
      dev: '<b>issue.close</b>, with the note; the pin goes, since the map shows the open issues.', ev: [E('issue.close', 'floor', { issue: ID }, { note: 'Checked after the rain: dry' })],
      run: async c => { await c.tap('.ft-panel [data-b="close"]'); ask(c, tx('Completed. Note (optional):')); await answer(c, 'Checked after the rain: dry'); paint(c, { ...SENT, leak: L3, issue: L3 }); } },
    { cap: tx('Close: it’s under Recently completed.'), read: S(tx('Three faults are still open.'), tx('Tap any of them to work on it.')),
      dev: 'Close (data-act back) lets the issue go; the list is <b>phone()</b> again.', ev: [],
      run: async c => { await c.tap('.p2-strip .ft-close'); paint(c, { ...LIST, vb: VK, leak: L3 }); } },
  ],
  whatif: [
    [tx('Not a manager?'), S(tx('Tell a manager or report it from a store PC.'), tx('On a phone, Maintenance is managers only.'))],
    [tx('Sent it without a title?'), tx('It isn’t sent: the app asks for a few words in What first.')],
  ],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
const DUP = st({ vb: VA, strip: 'pinned', panel: 'form', form: { ...F0, loc: 'near A18 S2', dup: true }, draft: [214, -6] });
const thu = `${dt('2026-10-22', { weekday: 'short' })} 14:05`;
const TILE = { ...OPEN[2], note: '', photos: 0, logged: thu, target: 14 };
fault.stories.push({
  id: 'dup', title: tx('What if it’s already been reported?'), blurb: tx('Pin it close to a fault that’s already logged and the form says so.'),
  know: [tx('A fault already logged close to your pin, open or completed, brings up a warning.'), tx('The warning never stops you: it may be a different fault.'),
    tx('Tap its pin to read it: add a photo or a note there rather than logging it twice.'), tx('Cancel throws the draft away; nothing is sent.')],
  html: phone(st({ vb: VA })),
  steps: [
    { cap: tx('Report, then tap beside A18.'), read: S(tx('A stained ceiling tile near A18 S2 was logged on Thursday.'), tx('The form warns before anything is sent.')),
      dev: '<b>nearby()</b> in js/views/maintenance.js counts the issues logged within 70 map units of the pin, on the same floor.', ev: [],
      run: async c => { await c.tap('.p2-strip .ft-rep'); paint(c, st({ vb: VA, strip: 'draft' })); await c.tap('.ft-map [data-s="A18 S2"]'); paint(c, DUP); } },
    { cap: tx('Cancel, and tap the pin that’s there.'), read: S(tx('Read it before you send yours: it may be the same fault.'), tx('Nothing was sent.')),
      dev: 'Cancel drops the draft; a pin opens its issue (<b>drawPins()</b> gives each pin its id).', ev: [],
      run: async c => { paint(c, { ...DUP, scroll: 200 }); await c.wait(500); await c.tap('.ft-panel [data-b="cancel"]'); paint(c, st({ vb: VA, panel: '' })); await c.tap('.ft-map [data-pin="mseed3"]'); paint(c, st({ vb: VA, strip: 'issue', panel: 'issue', issue: { ...TILE, log: [[tx('Logged'), '', thu]] } })); } },
  ],
});
const SENT3 = { ...SENT, leak: L3, issue: L3 };
const L4 = leak({ status: 'open', recur: 1, log: [...L3.log, [tx('Reopened (recurring)'), 'Dripping again after the storm', at('17:40')]] });
fault.stories.push({
  id: 'again', title: tx('What if it breaks again?'), blurb: tx('Reopen the completed fault: it comes back as recurring.'),
  know: [tx('Reopen a completed fault rather than reporting it again, so its history stays in one place.'), tx('It is open again and marked recurring, with how many times.'),
    tx('Its pin carries the count, and the map’s badge counts the recurring faults.'), tx('Not fixed, on a fault waiting to be checked, reopens it the same way.')],
  html: phone(SENT3),
  steps: [
    { cap: tx('Reopen asks what is wrong again.'), read: tx('The note goes in the log.'),
      dev: 'Reopen and Not fixed both send <b>issue.reopen</b>, which adds one to the issue’s recurring count.', ev: [],
      run: async c => { await c.tap('.ft-panel [data-b="reopen"]'); ask(c, tx('Reopen as recurring. What is wrong again?')); await c.type('.ft-pr .ft-pin', 'Dripping again after the storm'); } },
    { cap: tx('It’s open again, marked recurring.'), read: S(tx('Its target still counts from the day it was first logged.'), tx('The map’s badge counts one recurring.')),
      dev: '<b>issue.reopen</b>: status open, recur + 1, a log line.', ev: [E('issue.reopen', 'floor', { issue: ID }, { note: 'Dripping again after the storm' })],
      run: async c => { await c.tap('.ft-pr [data-ok]'); c.hide('.ft-pr'); paint(c, { ...SENT, leak: L4, issue: L4 }); } },
    { cap: tx('Close the panel: the pin carries the count.'), read: tx('Anyone looking at the map sees it has come back.'),
      dev: 'The pin’s badge is the issue’s recur count (<b>drawPins()</b>).', ev: [],
      run: async c => { await c.tap('.p2-strip .ft-tog'); paint(c, { ...SENT, leak: L4, issue: L4, panel: '' }); } },
  ],
});
const L5 = leak({ log: [...L1.log, [tx('Contractor visited'), 'BlueLine Roofing · Resealed the flashing', at('13:15')]] });
fault.stories.push({
  id: 'visit', title: tx('What if a contractor comes to fix it?'), blurb: tx('Log the visit on the fault: who came, and what they did.'),
  know: [tx('Contractor visited asks who came, then what they did.'), tx('The visit goes in the fault’s log; its status stays as it is.'),
    tx('Maintenance done and Complete still move it on when the work is finished.'), tx('On a store PC, Work order prints a sheet for the contractor with a QR code back to the fault.')],
  html: phone(SENT),
  steps: [
    { cap: tx('Contractor visited asks who came.'), read: tx('A name or a company.'),
      dev: 'The phone’s actions scroll sideways; Contractor visited is the last.', ev: [],
      run: async c => { c.html('.ft-panel', panelHtml({ ...SENT, acts: true })); await c.wait(500); await c.tap('.ft-panel [data-b="visit"]'); ask(c, tx('Contractor visited: who came (name or company)?')); await c.type('.ft-pr .ft-pin', 'BlueLine Roofing'); } },
    { cap: tx('Then what they did.'), read: tx('Optional, and kept in the log.'),
      dev: 'Both answers go in one <b>issue.visit</b>.', ev: [],
      run: async c => { await c.tap('.ft-pr [data-ok]'); ask(c, tx('What did they do? (optional)')); await c.type('.ft-pr .ft-pin', 'Resealed the flashing'); } },
    { cap: tx('The visit is in the log.'), read: tx('The fault stays open until someone marks the work done.'),
      dev: '<b>issue.visit</b> adds a log line and counts the visit; the status does not change.', ev: [E('issue.visit', 'floor', { issue: ID }, { who: 'BlueLine Roofing', note: 'Resealed the flashing' })],
      run: async c => { await c.tap('.ft-pr [data-ok]'); c.hide('.ft-pr'); paint(c, { ...SENT, leak: L5, issue: L5, scroll: 190 }); note(c, tx('Visit logged')); } },
  ],
});
