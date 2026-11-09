// Chapter: Find a shelf on a phone, the floor phone's Home (the store map)
// as the app has it today: the map card (js/views/map.js mobile(), js/map.js
// mvMap), the search bar's list (js/search.js bar()), the strip from
// js/shell.js mountStrip and its panel (mvSel(), mvEmpty()), Add to route,
// Share, zoom and Fit, the crumb, and a shelf label read with the camera.
// Three What ifs play on the same phone: one department (the Departments
// picker), a run's name on its own, and voice.
// The map is Busselton 1241's sales floor (maps/1241.svg, its ground floor),
// drawn as js/map.js draws it: one badge per run zoomed out, each shelf's
// name from about 5.5 times the whole floor (js/guide/find-map.js). "A16 S2"
// is a shelf, "A16" its run.
import { tx } from '../../i18n.js';
import { ai, phone2, sheet, unsheet, toast2 } from '../frames.js';
import { code128 } from '../refresh-map.js';
import { DEPT, AREAS, areaOf, dep, shelf, FIT, around, mapSvg } from '../find-map.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });

// ── the views (map units) ────────────────────────────────────────
// The views the app moved to, as the captures had them: each centred on
// its shelf or department.
const V = {
  found: around(110, -40, 420),      // A16 S2 found (zoomTo: 420 across)
  out2: around(110, -40, 709.8),     // two taps of −
  home: around(425.5, -540, 1951.8), // the Home area (H1 to H4)
  panel: [-120, -202, 420, 749],     // A16 S1 framed above the open panel
  k2: around(-1545, -530, 983.6),    // K2 Toys
  run: around(100, -40, 420),        // the run A16
};

// ── the screens ──────────────────────────────────────────────────────
// A state: vb, scope, hl, sel, crumb ({ area, d, shelf }), strip (a shelf
// id or ''), panel ('' closed, 'shelf', 'empty', 'run').
const at = o => ({ vb: FIT, scope: [], hl: [], sel: '', crumb: null, shelf: '', panel: '', ...o });
// The crumb over the map (js/views/map.js mvCrumb): the area, the
// department's chip and name, then the shelf; with nothing, All departments.
function crumb(c) {
  if (!c) return `${ai('grid')}<span class="fd-cg">${tx('All departments')}</span>`;
  const sep = '<i class="fd-cs">›</i>', a = AREAS.find(x => x[0] === c.area);
  return `<span class="fd-ca">${ai(a[1])}${a[0]}</span>` + (c.d ? `${sep}<span class="fd-cd">${dep(c.d)}<span>${DEPT[c.d][1]}</span></span>` : '') + (c.shelf ? `${sep}<b>${c.shelf}</b>` : '');
}
const tog = open => `<span class="fd-tog">${ai('chev', open ? '' : 'up')}</span>`;
const kind = sub => sub[0] === 'E' ? tx('End') : tx('Side');
// The strip (js/views/map.js homeStrip): Find a shelf with Search and Scan,
// or the shelf in one line.
function strip(s) {
  if (!s.shelf) return `<span class="fd-st">${ai('pin')}<b>${tx('Find a shelf')}</b><span class="fd-sp"></span><span class="fd-act">${ai('search')}${tx('Search')}</span><span class="fd-act ic">${ai('barcode')}</span></span>${tog(!!s.panel)}`;
  const [run, sub = ''] = s.shelf.split(' '), d = (shelf(s.shelf) || shelf(`${run} S1`)).d;
  return `<span class="fd-st sh"><b>${run}${sub ? ` <span>${sub}</span>` : ''}</b>${dep(d)}<span class="fd-ss">${DEPT[d][1]} · ${sub ? kind(sub) : `${tx('Side')} / ${tx('End')}`}</span></span>${tog(!!s.panel)}`;
}
// The panel for a shelf or a run (js/views/map.js mvSel), and with nothing
// selected the ways to find one (mvEmpty).
function panel(s) {
  if (s.panel === 'empty') {
    const b = (k, icon, label) => `<span class="fd-eb" data-b="${k}"><span class="d">${ai(icon)}</span><span class="t">${label}</span></span>`;
    return `<div class="fd-eh"><span class="fd-ei">${ai('pin')}</span><div><b>${tx('Find a shelf')}</b><small>${tx('Tap one on the map, or:')}</small></div></div><div class="fd-ebs">${b('search', 'search', tx('Search'))}${b('say', 'mic', tx('Say it'))}${b('scan', 'barcode', tx('Scan label'))}${b('depts', 'grid', tx('Depts'))}</div>`;
  }
  const [run, sub = ''] = s.shelf.split(' '), subs = ['S1', 'S2', 'E1', 'E2'], d = (shelf(s.shelf) || shelf(`${run} S1`)).d, a = areaOf(d);
  const fx = sub ? kind(sub) : `${tx('Side')} / ${tx('End')}`;
  const what = sub ? tx('in run {run} with {shelves}', { run, shelves: subs.filter(x => x !== sub).join(', ') }) : tx('shelves {list}', { list: subs.join(', ') });
  const btn = (k, icon, label, pri) => `<span class="fd-b2${pri ? ' pri' : ''}" data-b="${k}">${ai(icon)}${label}</span>`;
  return `<div class="fd-ar">${ai(a[1])}${a[0]}</div><div class="fd-dn">${dep(d)} ${DEPT[d][1]}</div><div class="fd-big"><b>${run}</b>${sub ? ` ${sub}` : ''}</div><div class="fd-sub">${fx} · ${what}</div>` +
    `<div class="fd-sl">${tx('About it')}</div><div class="fd-facts"><div><small>${tx('Fixture')}</small><b>${fx}</b></div></div>` +
    `<div class="fd-sl">${tx('Status')}</div><div class="fd-rows"><div class="fd-r">${ai('m-refresh')}<div class="k"><b>${tx('Refresh')}</b><span>${tx('Not yet this week')}</span></div><span class="v">${tx('Not yet')}</span></div><div class="fd-r">${ai('m-labelint')}<div class="k"><b>${tx('Labels')}</b><span>${tx('No micro-departments assigned yet')}</span></div></div></div>` +
    `<div class="fd-acts${s.acts ? ' sc' : ''}"><span class="fd-row">${btn('route', 'm-picklist', tx('Add to route'), true)}${btn('refresh', 'm-refresh', tx('Refresh'))}${btn('labels', 'm-labelint', tx('Label check'))}${btn('share', 'qr', tx('Share'))}</span></div>`;
}
// Paints the map, the crumb, the strip and the panel for a state.
const paint = (c, s) => {
  c.html('.fd-map', mapSvg(s)); c.html('.fd-crumb', crumb(s.crumb)); c.html('.p2-strip', strip(s));
  c.html('.fd-panel', s.panel ? panel(s) : ''); if (s.panel) c.show('.fd-panel'); else c.hide('.fd-panel');
  c.cls('.fd-panel', 'emp', s.panel === 'empty');
};
// The search bar's list (js/search.js barHtml): shelves first, then the run.
const ddRow = (d, code, hi, note, on) => `<div class="fd-r2${on ? ' on' : ''}" data-r="${code}"><i style="background:${DEPT[d][0]}"></i><b><em>${hi}</em>${code.slice(hi.length)}</b><span>${note}</span>${dep(d)}</div>`;
const ddShelf = (code, hi, on) => ddRow('h1', code, hi, `${DEPT.h1[1]} · ${kind(code.split(' ')[1])}`, on);
const ddRun = (hi, on) => ddRow('h1', 'A16', hi, `${DEPT.h1[1]} · ${tx('whole run · {n} shelves', { n: 4 })}`, on);
const typeBar = async (c, text, rows) => { c.cls('.p2-search', 'fd-on', true); c.cls('.fd-q', 'fd-ph', false); await c.type('.fd-q', text); c.html('.fd-dd', rows); c.show('.fd-dd'); };
const clearBar = c => { c.hide('.fd-dd'); c.cls('.p2-search', 'fd-on', false); c.cls('.p2-search', 'fd-mic', false); c.text('.fd-q', tx('Search')); c.cls('.fd-q', 'fd-ph', true); };
// The app's toast over the map (bottom 146px), with Open as <u>.
const note = (c, text, open = false, tone = '') => toast2(c, `<span>${text}</span>${open ? `<u>${tx('Open')}</u>` : ''}`, tone);

// The share sheet (js/share.js openShare, in the shared sheet).
const shareSheet = () => `<div class="fd-shh"><div><b>${tx('Share {shelf}', { shelf: 'A16 S2' })}</b><small>${DEPT.h1[1]} · Busselton #1241</small></div><span class="fd-x">${ai('x')}</span></div>` +
  `<div class="fd-shb"><div class="fd-qr"></div><p>${tx('Scan with another phone to open the map on this shelf. Signed-in devices of this store open it straight away.')}</p><div class="fd-url">…/?store=1241&amp;shelf=A16S2</div></div>` +
  `<div class="fd-shf"><span class="fd-pri">${ai('clip')}${tx('Copy link')}</span></div>`;
// The Departments picker (js/shell.js openDepts): the whole floor, each
// area with its departments, then the others.
const deptSheet = () => {
  const tile = d => `<span class="fd-mt" data-pd="${d}"><i style="background:${DEPT[d][0]}"></i><b>${d.toUpperCase()}</b><span>${d === 'c4' ? 'Cosmetics Accessories' : DEPT[d][1]}</span></span>`;
  const rows = AREAS.map(([name, icon, ds]) => `<div class="fd-mrow"><span class="fd-ma">${ai(icon)}<b>${name}</b><span>${tx('All {n}', { n: 4 })}</span></span>${ds.map(tile).join('')}</div>`).join('');
  const other = (d, icon) => `<span class="fd-mo"><span class="oi" style="background:${DEPT[d][0]}22;color:${DEPT[d][0]}">${ai(icon)}</span><b>${DEPT[d][1]}</b></span>`;
  return `<div class="fd-shh"><b>${tx('Departments')}</b><span class="fd-x g">${ai('x')}</span></div><div class="fd-mb"><span class="fd-mall">${ai('map')}<span><b>${tx('All departments')}</b><small>${tx('Whole floor, every colour')}</small></span></span>${rows}<div class="fd-mos">${other('checkouts', 'dollar')}${other('flex', 'stack')}${other('stockroom', 'box')}</div></div>`;
};
// The camera (js/scan.js openScanner, one code): a shelf edge with its label.
const camera = () => `<div class="fd-cam" hidden><div class="fd-camt"><b>${tx('Scan a shelf label')}</b><span>${ai('bolt')}</span><span data-camx>${ai('x')}</span></div>` +
  `<div class="fd-camv"><div class="fd-edge"><div class="fd-tag">${code128('A016S01')}<b>A016S01</b></div></div><div class="fd-aim"></div><div class="fd-hint">${tx('Point the camera at the shelf label')}</div></div>` +
  `<div class="fd-camf"><span>${tx('Or type the code')}</span><span>${ai('arrow')}</span></div></div>`;

const phone = (s = at()) => phone2('fd', `<div class="fd-mv"><div class="fd-map">${mapSvg(s)}</div><div class="fd-crumb">${crumb(s.crumb)}</div>` +
  `<div class="fd-tools"><span class="scan">${ai('barcode')}</span><span data-z="in">${ai('plus')}</span><span data-z="out">${ai('minus')}</span><span data-z="fit">${ai('map')}</span></div></div>` +
  `<div class="fd-panel" hidden></div>`, { area: 'floor', on: 'mhome', strip: strip(s), extra: `<div class="fd-dd" hidden></div>${camera()}` });

// The phone's search bar holds the typed text in a span the steps type into.
const html0 = s => () => phone(s).replace('<span>' + tx('Search') + '</span>', `<span class="fd-q fd-ph">${tx('Search')}</span>`);

// The chapter's states.
const A16S2 = { area: 'Home', d: 'h1', shelf: 'A16 S2' };
const FOUND = at({ vb: V.found, hl: ['A16 S2'], sel: 'A16 S2', crumb: A16S2, shelf: 'A16 S2' });
const PANEL = { ...FOUND, panel: 'shelf' };
const OUT2 = { ...FOUND, vb: V.out2 }, FITS = { ...FOUND, vb: FIT };
const HOME = at({ vb: V.home, scope: ['h1', 'h2', 'h3', 'h4'], crumb: { area: 'Home' } });
const SCANNED = at({ vb: V.panel, hl: ['A16 S1'], sel: 'A16 S1', crumb: { area: 'Home', d: 'h1', shelf: 'A16 S1' }, shelf: 'A16 S1', panel: 'shelf' });

// ── the chapter ──────────────────────────────────────────────────────
export const find = {
  id: 'find', grp: 'floor', icon: 'map', title: tx('Find a shelf on a phone'), device: 'phone', where: tx('Phone · Floor › Home (the store map)'), for: ['floor', 'manager'],
  intro: S(tx('Search a shelf, scan its label or tap it on the map: the map takes you there.'), tx('Its panel says what it is, puts it on your route and shares it.')),
  html: html0(at()),
  steps: [
    { cap: tx('Home is the store map: the whole floor, a badge on each run.'), read: S(tx('A floor phone opens on the store map.'), tx('Each coloured badge names a run, such as {run}; its shelves are {list}.', { run: 'A16', list: 'A16 S1, A16 S2, A16 E1, A16 E2' })),
      dev: 'Home on a floor phone is the map view (js/views/map.js), its card <b>mvMap()</b> in js/map.js; <b>buildBadges()</b> puts one badge on each run. The strip is <b>homeStrip()</b>: Find a shelf, with Search and Scan.', ev: [],
      run: async c => { await c.wait(400); } },
    { cap: tx('Tap Search at the top and type the shelf.'), read: S(tx('Type it as it is printed: {a}, {b} and {c} find the same shelf.', { a: 'A16S2', b: 'A16 S2', c: 'A16-S2' }), tx('The list shows the shelf, then its whole run.')),
      dev: 'The phone’s bar is <b>bar()</b> in js/search.js: <b>shelfRows()</b> reads the text with <b>canonCode()</b> and <b>splitCanon()</b>, and <b>barHtml()</b> lists a run shelf by shelf, then whole.', ev: [],
      run: async c => { await c.tap('.p2-top .p2-search'); await typeBar(c, 'A16 S2', ddShelf('A16 S2', 'A16', true) + ddRun('A16')); } },
    { cap: tx('Tap the shelf: the map goes to it and lights it up.'), read: S(tx('The rest of the map steps back, and the strip names the shelf, its department and whether it is a side or an end.'), tx('The path over the map says where it is.')),
      dev: '<b>locate()</b> in js/map.js selects the shelf, steps the rest back (<b>highlight()</b>), frames it (<b>zoomTo()</b>) and pings it (<b>ping()</b>). The map is built once and shared between views (<b>parkMap()</b>).', ev: [],
      run: async c => { await c.tap('.fd-dd .fd-r2'); clearBar(c); paint(c, FOUND); } },
    { cap: tx('The arrow opens what the map knows about the shelf.'), read: S(tx('Its area and department, its fixture, this week’s refresh and this cycle’s label check.'), tx('Refresh and Label check open those tasks on this shelf.')),
      dev: 'The panel is <b>mvSel()</b> in js/views/map.js (its facts from <b>shelfFacts()</b>), in the sheet the shell opens from the strip’s arrow (<b>mountStrip()</b> in js/shell.js).', ev: [],
      run: async c => { await c.tap('.p2-strip .fd-tog'); paint(c, PANEL); } },
    { cap: tx('Add to route puts the shelf on this phone’s pick list.'), read: S(tx('The Route tab walks you to every shelf on the list.'), tx('Open, in the message, goes straight there.')),
      dev: '<b>addToPickList()</b> in js/views/map.js sends <b>picklist.set</b> with this device’s whole list (up to 200 shelves); a shelf already on it says so instead.',
      ev: [E('picklist.set', 'floor', { device: 'd_7k2m9xq4ab1c' }, { items: [{ code: 'A16S2', completed: false }] })],
      run: async c => { await c.tap('.fd-panel [data-b="route"]'); note(c, tx('{code} added to pick list', { code: 'A16 S2' }), true); } },
    { cap: tx('Share shows a QR code and a link to this shelf.'), read: S(tx('A colleague scans it with their phone and the map opens on this shelf.'), tx('Signed-in devices of this store open it straight away.')),
      dev: '<b>openShare()</b> in js/share.js, in the shared sheet (<b>openSheet()</b> in js/sheet.js): the link is <b>shelfLink()</b>, the code <b>qrSvg()</b> in shared/qr.js.', ev: [],
      run: async c => { c.html('.fd-panel', panel({ ...PANEL, acts: true })); await c.wait(500); await c.tap('.fd-panel [data-b="share"]'); sheet(c, shareSheet()); c.qr('.p2-sheet .fd-qr', 'shelf', 'A16S2'); } },
    { cap: tx('Close it and zoom out: names give way to run badges.'), read: S(tx('Zoomed in past about 5.5 times the whole floor, each shelf shows its name; further out, each run shows one badge.'), tx('The shelf you found stays lit, and its run’s badge with it.')),
      dev: 'The hand-over is <b>setLabelFade()</b> in js/map.js (BADGE_START 5.5, BADGE_END 8), and names well off screen are left out (<b>cullLabels()</b>). + and − zoom by a third.', ev: [],
      run: async c => { await c.tap('.p2-sheet .fd-x'); unsheet(c); await c.tap('.p2-strip .fd-tog'); paint(c, FOUND); await c.tap('.fd-tools [data-z="out"]'); paint(c, OUT2); } },
    { cap: tx('The map button fits the whole floor again.'), read: S(tx('The shelf’s run stays lit, so you can see where it is in the store.'), tx('Pinch and drag work as on any map.')),
      dev: '<b>fit()</b> in js/map.js goes back to the floor’s own view; the found shelf stays selected until something else is chosen.', ev: [],
      run: async c => { await c.tap('.fd-tools [data-z="fit"]'); paint(c, FITS); } },
    { cap: tx('Tap Home, in the path over the map, to let the shelf go.'), read: S(tx('Home shows its four departments and fades the rest.'), tx('The strip is back to Find a shelf.')),
      dev: 'A crumb’s area or department clears the shelf and zooms to its departments (<b>zoomDept()</b> in js/map.js); <b>mvCrumb()</b> in js/views/map.js draws it.', ev: [],
      run: async c => { await c.tap('.fd-crumb .fd-ca'); paint(c, HOME); } },
    { cap: tx('With no shelf picked, the arrow lists every way to find one.'), read: S(tx('Tap one on the map, search, say it, scan its label, or pick a department.')),
      dev: '<b>mvEmpty()</b> in js/views/map.js; Say it shows where the browser can listen (<b>voiceSupported()</b> in js/voice.js).', ev: [],
      run: async c => { await c.tap('.p2-strip .fd-tog'); paint(c, { ...HOME, panel: 'empty' }); } },
    { cap: tx('Scan label: point the camera at the shelf edge label.'), read: S(tx('The label on the shelf edge names its shelf.'), tx('Printed labels have zeros in front: {a} is {b}.', { a: 'A016S01', b: 'A16 S1' })),
      dev: 'Scan label opens <b>openScanner()</b> in js/scan.js for one code (so does the blue barcode in the map’s tools, <b>bindMapChrome()</b>); <b>groupsFor()</b> in js/map.js reads it with <b>canonCode()</b>, so A016S01 is A16 S1.', ev: [],
      run: async c => { await c.tap('.fd-panel [data-b="scan"]'); c.show('.fd-cam'); await c.wait(900); c.cls('.fd-cam', 'hit', true); } },
    { cap: tx('It reads: the map goes to that shelf and the panel shows it.'), read: S(tx('Every way of finding a shelf ends the same: the shelf lit on the map and named in the strip.'), tx('Looking sends nothing.')),
      dev: 'A scanned shelf is found as a typed one is (<b>locate()</b>, framed above the open panel by <b>zoomTo()</b>).', ev: [],
      run: async c => { await c.wait(300); c.hide('.fd-cam'); c.cls('.fd-cam', 'hit', false); paint(c, SCANNED); c.cls('.dvs > .fg', 'show', false); } },
  ],
  whatif: [
    [tx('A label that isn’t on this map?'), S(tx('It says so in red and nothing changes.'), tx('Check the label: a typo, or another store’s.'))],
    [tx('Typed a product code?'), tx('Product codes aren’t searchable on the phone yet: search a shelf, a department or a micro-department.')],
  ],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
// Each starts on Home with nothing picked.
const K2 = at({ vb: V.k2, scope: ['k2'], crumb: { area: 'Kids', d: 'k2' } });
const K2z = n => ({ ...K2, vb: around(-1545, -530, 983.6 / 1.3 ** n) });
find.stories.push({
  id: 'depts', title: tx('What if you want to see one department?'), blurb: tx('Departments, at the top right, fades the rest of the floor and zooms to one.'),
  know: [tx('The grid at the top right of a floor phone is Departments.'), tx('Pick a whole area, such as Kids, or one department, such as K2 Toys.'),
    tx('The rest of the floor fades, and only that department’s runs keep their badges.'), tx('All departments brings back the whole floor, every colour.'),
    tx('The path over the map says which department you are looking at.')],
  steps: [
    { cap: tx('Tap Departments, at the top right.'), read: tx('Every department on this store’s map, by area, and the whole floor.'),
      dev: '<b>openDepts()</b> in js/shell.js lists the departments the map has (<b>mapStats()</b> in js/map.js).', ev: [],
      run: async c => { await c.tap('.p2-top .p2-ib:last-of-type'); sheet(c, deptSheet()); } },
    { cap: tx('Pick Toys: the rest fades and the map zooms to it.'), read: S(tx('Only the Toys runs keep their colour and their badges.'), tx('The path over the map says Kids, then K2 Toys.')),
      dev: 'A pick opens the map on that department (<b>zoomDept()</b> in js/map.js): the other shelves fade and their badges go.', ev: [],
      run: async c => { await c.tap('.p2-sheet [data-pd="k2"]'); unsheet(c); paint(c, K2); } },
    { cap: tx('Zoom in: each shelf shows its name.'), read: tx('Past about 5.5 times the whole floor, the badges hand over to the shelves’ names.'),
      dev: '+ zooms by a third (<b>zoomBy()</b> in js/map.js); <b>setLabelFade()</b> hands the badges over to the names.', ev: [],
      run: async c => { for (const n of [1, 2, 3]) { await c.tap('.fd-tools [data-z="in"]'); paint(c, K2z(n)); } } },
    { cap: tx('Tap a shelf: the strip names it.'), read: S(tx('{shelf} is one shelf of the run {run}.', { shelf: 'K18 S1', run: 'K18' }), tx('The arrow opens what the map knows about it.')),
      dev: 'A tap selects that shelf only (<b>select()</b> in js/map.js), never its run.', ev: [],
      run: async c => { await c.tap('.fd-svg [data-s="K18 S1"]'); paint(c, { ...K2z(3), sel: 'K18 S1', crumb: { area: 'Kids', d: 'k2', shelf: 'K18 S1' }, shelf: 'K18 S1' }); } },
  ],
});
const RUN = at({ vb: V.run, hl: ['A16 S1', 'A16 S2', 'A16 E1', 'A16 E2'], sel: 'A16 S1', crumb: { area: 'Home', d: 'h1', shelf: 'A16' }, shelf: 'A16' });
find.stories.push({
  id: 'run', title: tx('What if you type only the run’s name?'), blurb: tx('{run} is a run of four shelves: the list shows each one, then the whole run.', { run: 'A16' }),
  know: [tx('{shelf} is a shelf; {run} is its run, the shelves that share the name.', { shelf: 'A16 S2', run: 'A16' }), tx('Sides are S1 and S2, ends E1 and E2.'),
    tx('Pick one shelf from the list to go to it, or the whole run to see all four.'), tx('Each shelf is refreshed, counted and checked on its own, so pick the shelf when you can.')],
  steps: [
    { cap: tx('Type the run’s name: its four shelves, then the whole run.'), read: tx('Sides first, then ends, each with its department.'),
      dev: '<b>barHtml()</b> in js/search.js lists a run’s shelves in order (sides, then ends), then the run itself.', ev: [],
      run: async c => { await c.tap('.p2-top .p2-search'); await typeBar(c, 'A16', ['A16 S1', 'A16 S2', 'A16 E1', 'A16 E2'].map((x, i) => ddShelf(x, 'A16', !i)).join('') + ddRun('A16')); } },
    { cap: tx('Pick the whole run: all four shelves light up.'), read: S(tx('The strip says Side / End: the run has both.'), tx('The path over the map ends with the run’s name.')),
      dev: 'The run’s row selects all its shelves (<b>groupsFor()</b> in js/map.js finds the four) and frames them.', ev: [],
      run: async c => { await c.tap('.fd-dd [data-r="A16"]'); clearBar(c); paint(c, RUN); } },
    { cap: tx('The arrow shows the run and its shelves by name.'), read: tx('A run lists its shelves; a shelf names the others in its run.'),
      dev: '<b>runText()</b> in js/map.js: “shelves S1, S2, E1, E2” for a run, “in run A16 with S1, E1, E2” for a shelf.', ev: [],
      run: async c => { await c.tap('.p2-strip .fd-tog'); paint(c, { ...RUN, panel: 'shelf' }); } },
  ],
});
const VOICE = { ...FOUND };
find.stories.push({
  id: 'voice', title: tx('What if your hands are full?'), blurb: tx('Tap the microphone in the search bar and say the shelf.'),
  know: [tx('Say the shelf as it is printed, such as “A16 S2” or “A sixteen side two”.'), tx('The words show in the search bar while you speak.'),
    tx('A shelf on the map opens straight away, and the message says what was heard.'), tx('If a word was misheard, a likely match on the map is used, and the message says it was matched.'),
    tx('Anything that isn’t a shelf stays in the search bar as text.'), tx('Voice needs a connection.')],
  steps: [
    { cap: tx('Tap the microphone and say the shelf.'), read: tx('The microphone turns red while it listens, and the words show as they are heard.'),
      dev: 'The microphone is <b>listenOnce()</b> in js/voice.js: one utterance, the recogniser’s top five guesses.', ev: [],
      run: async c => { await c.tap('.p2-top .p2-search > svg:last-of-type'); c.cls('.p2-search', 'fd-mic', true); c.cls('.fd-q', 'fd-ph', false); await c.type('.fd-q', 'a sixteen'); } },
    { cap: tx('It finds the shelf and says what it heard.'), read: tx('The map goes to the shelf, lit, as a typed search does.'),
      dev: '<b>resolveSpoken()</b> in shared/voice.js turns the words into a shelf and checks it against the map (<b>shelfForLocation()</b> in js/map.js).', ev: [],
      run: async c => { await c.type('.fd-q', 'a sixteen side two'); await c.wait(400); clearBar(c); paint(c, VOICE); note(c, tx('Heard “{heard}” · {shelf}', { heard: 'a sixteen side two', shelf: 'A16 S2' })); } },
    { cap: tx('Misheard? A likely match on the map is used.'), read: tx('“Eight sixteen” isn’t on the map, but A16 S2 is: the message says it was matched to the map.'),
      dev: '<b>resolveSpoken()</b> tries each guess, then the likely mishearings, and takes the first the map has.', ev: [],
      run: async c => { await c.tap('.p2-top .p2-search > svg:last-of-type'); c.cls('.p2-search', 'fd-mic', true); c.cls('.fd-q', 'fd-ph', false); await c.type('.fd-q', 'eight sixteen side two'); await c.wait(400); clearBar(c); paint(c, VOICE); note(c, tx('Heard “{heard}” · {shelf} (matched to the map)', { heard: 'eight sixteen side two', shelf: 'A16 S2' })); } },
  ],
});
