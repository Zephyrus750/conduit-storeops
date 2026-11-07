// Redrawn chapter (DRAFT): Getting around on a PC, the managers' desk as the
// shell draws it today on a store PC at 1920×1080 (js/shell.js, js/registry.js,
// js/views/dashboard.js, js/search.js, js/views/backdock/screenlist.js,
// js/views/help.js): the Dashboard's cards, the rail with its tips and counts,
// a row's screens as tabs, Ctrl K, the ? for a screen and the Screens page.
// Three What ifs play on the same PC (a screen with no row, the network
// dropping, half a screen).
// The PC is drawn at its real size: the screen is 1920×1080 and everything in
// it is laid out at the shell's 95% display size (Settings › Display), so the
// sizes are the app's own CSS sizes. The day is the guide's: Sunday 25 October
// 2026 at Busselton 1241, Truck 1 receiving (the Receive chapter's truck),
// six bays on the backfill board, LAD-02 overdue for its check.
import { tx, txn, locale } from '../../i18n.js';
import { fmtLong, fmtDate, DEPT_COLOUR } from '../../ui.js';
import { VERSION } from '../../version.js';
import { ai } from '../frames.js';
import { gi } from '../icons.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const DAY = '2026-10-25';
const dt = (iso, o) => new Date(iso + 'T00:00:00Z').toLocaleDateString(locale(), { ...o, timeZone: 'UTC' });
const dShort = iso => fmtDate(iso);
// The footer's date line: the store day and its retail week (retailPeriod() for 25 Oct 2026).
const footDate = () => `${fmtLong(new Date(2026, 9, 25, 9))} · <b>P5W1</b>`;
const at = t => `${dt(DAY, { weekday: 'short' })} ${t}`;

// ── the frame: rail, top bar, content, footer ────────────────────────
// The rail as js/registry.js lays it out (RAIL_TOP, RAIL, RAIL_FOOT); the ids are GROUPS'.
const TOP = () => [['today', 'm-dashboard', tx('Dashboard')], ['inputs', 'file', tx('Reports & files')], ['resources', 'library', tx('Resources')]];
const SECS = () => [
  [tx('Floor'), [['map', 'm-map', tx('Store map')], ['layouts', 'plan', tx('Layouts'), true], ['floorchecks', 'listcheck', tx('Floor checks')], ['picklist', 'm-picklist', tx('Pick list')], ['safety', 'm-emergency', tx('Safety & upkeep')]]],
  [tx('Stockroom'), [['backfill', 'm-backfill', tx('Backfill')], ['accuracy', 'm-adjust', tx('Stock accuracy')], ['cages', 'm-cages', tx('Cages')]]],
  [tx('Back dock'), [['receiving', 'm-receiving', tx('Receiving')], ['plan', 'm-planner', tx('Plan')], ['results', 'bars', tx('Results')]]],
];
const FOOT = () => [['screens', 'expand', tx('Screens')], ['settings', 'm-settings', tx('Settings')], ['help', 'help', tx('Help')]];
// The rail's counts this morning: the morning report not pasted, LAD-02 overdue, three bays to review.
const BADGES = { inputs: 1, safety: 1, backfill: 3 };
// What a row holds, shown beside it on hover (RDESC in js/shell.js).
const TIP = () => ({ backfill: [tx('Backfill'), tx('Today’s board against the morning report, the walk order, and how it went.')] });
const MARK = '<svg class="pc2-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#111827" stroke="rgba(255,255,255,.16)" stroke-width=".8"/><path d="M21.94 21.94A8.4 8.4 0 0 1 10.94 22.71" fill="none" stroke="#7DD3FC" stroke-width="5.4"/><path d="M9.66 21.51A8.4 8.4 0 0 1 9.66 10.49" fill="none" stroke="#22A6D6" stroke-width="5.4"/><path d="M10.94 9.29A8.4 8.4 0 0 1 21.94 10.06" fill="none" stroke="#0E7CA8" stroke-width="5.4"/></svg>';

function rail(on, badges) {
  const tip = TIP();
  const row = ([g, icon, label, soon]) => `<span class="pc2-row${g === on ? ' on' : ''}${soon ? ' soon' : ''}" data-g="${g}">${ai(icon)}<span class="rl">${label}</span>` +
    (badges[g] ? `<span class="bdg">${badges[g]}</span>` : '') + (soon ? `<span class="soon">${tx('Soon')}</span>` : '') +
    (tip[g] ? `<span class="pc2-tip" hidden><b>${tip[g][0]}</b><span>${tip[g][1]}</span></span>` : '') + '</span>';
  return `<aside class="pc2-rail"><div class="pc2-brand">${MARK}<b>Conduit</b></div>` +
    `<div class="pc2-chip">${ai('m-store', 'sc')}<span><b>Busselton</b><small>${tx('Store {no}', { no: '1241' })}</small></span>${ai('chev', 'dn')}</div>` +
    `<div class="pc2-rtop">${TOP().map(row).join('')}</div>` +
    `<div class="pc2-rscroll">${SECS().map(([sec, rows]) => `<div class="pc2-rsec">${sec}</div>${rows.map(row).join('')}`).join('')}</div>` +
    `<div class="pc2-rfoot">${FOOT().map(row).join('')}</div></aside>`;
}
const sync = (off, n = 0) => off ? `<span class="dot off"></span>${tx('Offline')}${n ? ' · ' + txn(n, '{n} change queued', '{n} changes queued') : ''}` : `<span class="dot"></span>${tx('Synced to cloud')}`;
// A PC: views are the screens it can show (one shown), on the rail row that is lit.
function pc(views, { on = 'today', badges = BADGES, half = false } = {}) {
  return `<div class="dv pc2f${half ? ' half' : ''}"><div class="dvs pc2${half ? ' half' : ''}"><div class="pc2-z">${rail(on, badges)}` +
    `<div class="pc2-main"><header class="pc2-top"><span class="pc2-search">${ai('search')}<span class="q">${tx('Search anything — a shelf, bay, product, manifest or consolidation…')}</span><kbd>Ctrl K</kbd>${ai('mic')}</span>` +
    `<span class="pc2-btn acc pc2-showmap">${ai('map')}${tx('Show map')}</span><span class="pc2-help" title="${tx('Help for this screen')}">?</span></header>` +
    `<main class="pc2-content">${views}</main>` +
    `<footer class="pc2-foot"><span class="pc2-menu">${ai('sidebar')}${tx('Menu')}</span><i class="fdiv"></i><span>${footDate()}</span><span class="sp"></span><span class="pc2-sync">${sync(false)}</span><i class="fdiv"></i><span>Conduit ${VERSION}</span></footer></div>` +
    `<div class="pc2-omni" hidden></div><div class="pc2-sy" hidden></div></div><div class="dv-toast" hidden></div><i class="fg cur"></i></div></div>`;
}
const view = (id, html, shown) => `<section class="v pc2-v" id="${id}"${shown ? '' : ' hidden'}>${html}</section>`;
// A view's header (vh() in js/ui.js): its icon, title, the line under it, its buttons.
const vh = (icon, title, sub, acts = '') => `<div class="pc2-vh"><div class="pc2-vt"><span class="pc2-vic">${ai(icon)}</span><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>${acts ? `<div class="pc2-acts">${acts}</div>` : ''}</div>`;
const sub = (...p) => p.filter(Boolean).map(x => `<span>${x}</span>`).join('<i>·</i>');
// A row's screens as tabs above the open one (groupTabs() in js/shell.js).
const gtabs = (list, on) => `<nav class="pc2-gtabs">${list.map(([k, icon, label, n]) => `<span class="pc2-gtab${k === on ? ' on' : ''}" data-t="${k}">${ai(icon)}${label}${n ? `<span class="bdg">${n}</span>` : ''}</span>`).join('')}</nav>`;
const btn = (icon, label, cls = '') => `<span class="pc2-btn${cls ? ' ' + cls : ''}">${icon ? ai(icon) : ''}${label}</span>`;
const chip = (t, k = '') => `<span class="pc2-st${k ? ' ' + k : ''}">${t}</span>`;
const dep = d => `<span class="pc2-dep" style="background:${DEPT_COLOUR[d] || '#64748B'}">${d.toUpperCase()}</span>`;

// ── the Dashboard ────────────────────────────────────────────────────
function kpi({ cls = '', icon, title, n, d, hl, rows, pct }) {
  return `<div class="pc2-card pc2-kpi${cls ? ' ' + cls : ''}"><div class="kh">${ai(icon)}<h3>${title}</h3><span class="open">${tx('Open')} ${ai('arrow')}</span></div>` +
    `<div class="hero"><span class="n">${n}</span><span class="d">${d}</span></div><div class="hl">${hl}</div>` +
    `<div class="rws">${rows.map(([l, v, c]) => `<div class="row">${l}<b${c ? ` class="${c}"` : ''}>${v}</b></div>`).join('')}</div>` +
    (pct != null ? `<div class="pg"><span class="track"><i style="width:${pct}%"></i></span><b>${pct}%</b></div>` : '') + '</div>';
}
const acc = p => `<span class="pc2-acc ${p >= 95 ? 'vg' : p >= 85 ? 'g' : p >= 70 ? 'av' : 'bad'}">${p}%</span>`;
const bfCard = () => kpi({ cls: 'hot bf', icon: 'm-backfill', title: tx('Backfill review'), n: 3, d: '/ 6', hl: tx('Locations reviewed on today’s board'),
  rows: [[tx('Average accuracy'), acc(86)], [tx('Keycodes scanned'), 33], [tx('Pending · ready · submitted'), '3 · 2 · 1']], pct: 50 });
const rfCard = () => kpi({ icon: 'pin', title: tx('Location refresh'), n: 9, d: '/ 20', hl: tx('Shelves refreshed today · daily pace'),
  rows: [[tx('Focus departments'), dep('k2') + dep('h1')], [tx('This week'), '46 / 100'], [tx('Left today'), 11]], pct: 45 });
const liCard = () => kpi({ icon: 'tag', title: tx('Label integrity'), n: 12, d: '/ 77', hl: tx('Micro-departments checked this cycle · {n} today', { n: 2 }),
  rows: [[tx('Labels wrong this cycle'), 1, 'red'], [tx('Days left in cycle'), 9], [tx('Still to check'), 65]], pct: 16 });
// The dock: Truck 1's eight pallets (the Receive chapter's), bays A1 to D7.
const PAL = { A1: ['c', 2], A2: ['l', 16], A3: ['c', 18], A4: ['c', 2], A5: ['c', 16], A6: ['l', 2], A7: ['b', 7], B1: ['c', 9] };
const PHASES = () => [tx('truck phase::Planned'), tx('truck phase::Receiving'), tx('truck phase::Received'), tx('truck phase::Decanting'), tx('truck phase::Cleared'), tx('truck phase::Closed')];
const dockGrid = () => `<div class="pc2-dkg"><div class="dkg-h"><b>${tx('The dock')}</b><span>${txn(8, '{n} pallet on the dock', '{n} pallets on the dock')}</span></div><div class="dkg-grid">` +
  [...'ABCD'].flatMap(r => [1, 2, 3, 4, 5, 6, 7].map(k => { const ref = r + k, p = PAL[ref]; return p ? `<span class="c t-${p[0]}"><i>${ref}</i>${p[1]}</span>` : `<span class="c"><i>${ref}</i></span>`; })).join('') +
  `</div><div class="dkg-key"><span><i class="t-c"></i>${tx('Tubs')}</span><span><i class="t-l"></i>${tx('pallet type::Load')}</span><span><i class="t-b"></i>${tx('Bulk')}</span><span><i class="dn"></i>${tx('Done')}</span><span><i class="ac"></i>${tx('Decanting')}</span></div></div>`;
function dockCard() {
  const steps = `<ol class="pc2-steps">${PHASES().map((p, i) => `<li class="${i < 1 ? 'dn' : i === 1 ? 'on' : ''}"><i></i><span>${p}</span></li>`).join('')}</ol>`;
  return `<div class="pc2-card pc2-kpi dk"><div class="kh">${ai('m-receiving')}<h3>${tx('Back dock')}</h3><span class="open">${tx('Open')} ${ai('arrow')}</span></div>` +
    `<div class="dk-chip"><span class="phb">${tx('truck phase::Receiving')}</span><b>${tx('Truck {no}', { no: 1 })}</b></div>${steps}` +
    `<div class="hero"><span class="n">0</span><span class="d">${tx('/ {total} cartons decanted', { total: 72 })}</span></div>` +
    `<div class="hl">${txn(8, '{n} pallet landed', '{n} pallets landed')} · ${tx('{m} of {n} consols matched', { m: 12, n: 12 })} · ${tx('landed {time}', { time: '05:40' })} · ${tx('{n} crew', { n: 3 })}</div>${dockGrid()}` +
    `<div class="rws"><div class="row">${tx('Pallets done')}<b>0 / 8</b></div><div class="row">${tx('Forecast finish')}<b>08:10</b></div><div class="row">${tx('Trucks today')}<b>${tx('{done} of {n} cleared', { done: 0, n: 2 })}</b></div></div></div>`;
}
const maintCard = () => `<div class="pc2-card pc2-kpi mt"><div class="kh">${ai('tool')}<h3>${tx('Maintenance')}</h3><span class="open">${tx('Open')} ${ai('arrow')}</span></div>` +
  `<div class="hero"><span class="n">1</span><span class="hs">${tx('open · {logged} logged today · {waiting} done, waiting for sign-off', { logged: 1, waiting: 0 })}</span></div>` +
  `<div class="rws"><div class="row"><span class="l"><span class="pt"></span><span><b>Shelf strip loose</b><span class="where">A16 S2 · ${tx('{n} h ago', { n: 2 })}</span></span></span><span class="r"><span class="pri"><i></i><i></i><i></i></span>${chip(tx('issue status::Open'), 'warn')}</span></div></div></div>`;
// The Operations register: the morning setup, later today, then every tool.
const mrow = (title, text, act, icon, done = false, again = '') => `<div class="mrow${done ? ' done' : ''}"><span class="mst">${done ? ai('check') : ''}</span><div class="mtx"><b>${title}</b><span>${text}</span></div>${done ? `<a>${again}</a>` : `<span class="mact" data-m="${icon}">${ai(icon)}${act}</span>`}</div>`;
function register() {
  const mods = [['m-receiving', tx('Receiving'), chip(tx('Truck {no} on the dock · {pct}%', { no: 1, pct: 0 }), 'warn')], ['file', tx('Manifests'), chip(tx('{n} published today · {consols} consols · {cartons} cartons', { n: 1, consols: 12, cartons: 72 }))],
    ['m-planner', tx('Planner'), chip(tx('T{truck} due {eta}', { truck: 2, eta: '13:30' }))], ['box', tx('Carton profiles'), chip(txn(14, 'Built from {n} manifest', 'Built from {n} manifests'))], ['tool', tx('Maintenance'), chip(txn(1, '{n} open issue', '{n} open issues'), 'warn')],
    ['m-emergency', tx('Emergency'), chip(tx('No services due'), 'good')], ['m-equipment', tx('Equipment checks'), chip(txn(1, '{n} check overdue', '{n} checks overdue'), 'bad') + chip(tx('{n} due in 14 days', { n: 1 }), 'warn')]];
  return `<div class="pc2-card pc2-kpi reg"><div class="kh">${ai('grid')}<h3>${tx('Operations register')}</h3></div><div class="hl">${tx('{n} tools', { n: 10 })} · <b>${tx('{n} need attention', { n: 3 })}</b></div>` +
    `<div class="morn"><div class="mh"><b>${tx('Morning setup')}</b><span>${tx('{done} of {total} · do these first', { done: 1, total: 3 })}</span><span class="mprog"><i style="width:33%"></i></span></div>` +
    mrow(`${tx('Morning inventory report')} <span class="chip due">${tx('Required')}</span>`, tx('Not pasted yet · the board compares against nothing until it is'), tx('Paste whole report'), 'clip') +
    mrow(tx('Manifests for today’s trucks'), txn(2, '{n} truck today · {k} with a manifest', '{n} trucks today · {k} with a manifest', { k: 1 }), tx('Attach a manifest'), 'arrow') +
    mrow(tx('Planner'), `T1 ${tx('on the dock')} · T2 13:30`, '', '', true, tx('Open')) +
    `<div class="mh later"><b>${tx('Later today')}</b><span>${tx('{done} of {total}', { done: 0, total: 2 })}</span><span class="mprog"><i style="width:0"></i></span></div>` +
    mrow(tx('First truck decant'), tx('{pct}% decanted', { pct: 0 }), tx('Open the dock'), 'arrow') +
    mrow(`${tx('Midday report')} <span class="chip opt">${tx('Optional')}</span>`, tx('After 12:00 if there is time · the room moves after the next truck lands'), tx('Paste whole report'), 'clip') +
    mrow(tx('Label integrity · today’s department'), tx('pick the micro-department and print the sheet'), tx('Pick department'), 'arrow') +
    `</div><div class="reg-lbl">${tx('Modules')}</div><div class="rws">${mods.map(([icon, name, chips]) => `<div class="row">${ai(icon)}<b>${name}</b><a>${tx('Open')} ${ai('arrow')}</a><span class="stx">${chips}</span></div>`).join('')}</div></div>`;
}
const dashHead = () => `<div class="pc2-vh"><div class="pc2-vt"><span class="pc2-vic">${ai('m-dashboard')}</span><div><h2><span class="greet">${tx('Good morning!')}</span>${tx('How we’re tracking')}</h2></div></div>` +
  `<div class="pc2-acts"><span class="pc2-tm">${ai('users')}${tx('Write a team message or briefing')}</span><span class="pc2-tabs"><b class="on">${tx('Today')}</b><b>${tx('This week')}</b><b>${tx('This month')}</b></span></div></div>`;
const dash = shown => view('v-dash', dashHead() + `<div class="pc2-dash"><div class="kpis">${bfCard()}${rfCard()}${liCard()}</div><div class="side2">${dockCard()}${maintCard()}</div>${register()}</div>`, shown);

// ── Backfill: Review and Day list ────────────────────────────────────
const BFTABS = n => [['bfreview', 'm-backfill', tx('Review'), n], ['daylist', 'm-daylist', tx('Day list')], ['srhistory', 'm-srhistory', tx('History')], ['srtrends', 'chart', tx('Trends')], ['livepull', 'packages', tx('Live pull')]];
const CODES = [['42977636', 8], ['42977641', 8], ['43111111', 11, 'warn'], ['43302210', 7], ['43307685', 12], ['43602218', 14]];
const slc = (bay, n, t, sel = false) => `<span class="pc2-slc${sel ? ' sel' : ''}" data-bay="${bay}"><span class="sl"><b>${bay}</b><small>${tx('{count} scanned', { count: `<b>${n}/${n}</b>` })} · ${at(t)}</small></span><span class="sr"><b>—</b><small>${tx('no report')}</small></span></span>`;
function review({ ready = false } = {}) {
  const pend = ready ? [['7044', 7, '08:06'], ['7052', 8, '08:09']] : [['7041', 6, '08:05'], ['7044', 7, '08:06'], ['7052', 8, '08:09']];
  const rdy = [['7019', 4, '07:52'], ['7036', 5, '07:58'], ...(ready ? [['7041', 6, '08:05']] : [])];
  const counts = { pending: pend.length, requested: 0, ready: rdy.length, submitted: 1 };
  const state = ready ? `<span class="pc2-st good big">${tx('Ready')}</span>` : `<span class="pc2-st warn big">${tx('backfill stage::Review')}</span>`;
  const acts = ready ? `${btn('checks', tx('Submit'), 'sub')}${btn('refresh', tx('Reopen'))}` : `${btn('check', tx('Ready'), 'rdy')}`;
  return gtabs(BFTABS(pend.length), 'bfreview') + vh('m-backfill', tx('Backfill review'), sub(tx('Today’s board'), tx('{pending} to review · {requested} requested · {ready} ready · {submitted} submitted', counts)),
    `<span class="pc2-warn">${ai('alert')}${tx('No report pasted')}</span>${btn('clip', tx('Paste whole report'))}${btn('listcheck', tx('Requested list'))}${btn('tag', tx('Departments'))}<span class="pc2-btn sq">?</span>`) +
    `<div class="pc2-sr3"><div class="col l"><div class="ch"><b>${tx('Review')}</b><span class="n">${pend.length}</span><span class="sel">${tx('Match, best first')} ${ai('chev', 'dn')}</span></div>${pend.map(([b, n, t], i) => slc(b, n, t, !ready && i === 0)).join('')}` +
    `<div class="lf"><small>${tx('<b>{sent}</b> sent through · <b>{requested}</b> requested', { sent: 6, requested: 0 })}</small><span class="row"><span class="in">${tx('Add or request a bay…')}</span><span class="pc2-btn sm">${tx('Request')}</span></span></div></div>` +
    `<div class="col m"><div class="bh"><b class="bay">7041</b>${ai('chev', 'dn')}<span class="bc"></span><span class="pc2-sel">${tx('Department')} ${ai('chev', 'dn')}</span>${state}` +
    `<span class="stats"><span><b>6</b>${tx('expected')}</span><span><b>6</b>${tx('scanned')}</span><span class="g"><b>0</b>${tx('match')}</span><span><b>—</b>${tx('accuracy')}</span><span><b>0</b>${tx('incorrect')}</span></span></div>` +
    `<div class="ba">${btn('clip', tx('Paste list') + ' ' + ai('chev', 'dn'))}${acts}</div>` +
    `<div class="bt"><span class="sg"><b class="on">${tx('List')}</b><b>${tx('Detail')}</b><b>${tx('Barcodes')}</b><b>${tx('Focus')}</b></span><span class="f all">${tx('All')} 6</span><span class="f add">${tx('Add')} 6</span><span class="f del">${tx('Delete')} 0</span><span class="f mat">${tx('Match')} 0</span><span class="f nr">${ai('alert')}${tx('no report for this bay')}</span><span class="pc2-btn sm ex">${ai('download')}${tx('Export')} ${ai('chev', 'dn')}</span></div>` +
    `<div class="lists"><div class="lst add"><div class="lh">${tx('Add to {bay}', { bay: '7041' })}<span>6</span></div>${CODES.map(([k, c, w]) => `<div class="li"><b>${k}</b><small>${tx('Not checked yet')}</small><span class="ctn${w ? ' w' : ''}">${w ? [tx('▤ {ctn}/ctn', { ctn: c }), tx('today'), tx('out back?')].join(' · ') : tx('▤ {ctn}/ctn · latest delivery', { ctn: c })}</span><span class="ix">⇅ ${ai('alert')} ${ai('x')}</span></div>`).join('')}</div>` +
    `<div class="lst del"><div class="lh">${tx('Delete from system')}<span>0</span></div><div class="none">${ai('check')}<b>${tx('Nothing to delete')}</b><small>${tx('Paste the report to compare')}</small></div></div></div>` +
    `<div class="foot">${tx('<b>{n} codes match</b> · no report pasted for this bay yet', { n: 0 })}${ready ? ' · ' + tx('marked ready {time}', { time: at('08:12') }) : ''}</div></div>` +
    `<div class="col r"><div class="ch"><b>${tx('Ready')}</b><span class="n g">${rdy.length}</span></div>${rdy.map(([b, n, t]) => slc(b, n, t, ready && b === '7041')).join('')}<span class="sp"></span>` +
    `<div class="sbm"><span>${tx('Submitted today')}</span><span class="n g">1</span></div>${slc('7012', 3, '07:40')}<span class="pc2-btn fin">${ai('check')}${tx('Finalise all ({n})', { n: rdy.length })}</span></div></div>`;
}
const daylist = () => gtabs(BFTABS(3), 'daylist') + vh('m-daylist', tx('Day list'), sub(tx('Posted walk'), DAY, txn(2, '{locs} locations · {checks} checks · {n} walker', '{locs} locations · {checks} checks · {n} walkers', { locs: 3, checks: 0 })),
  `<span class="pc2-tabs sm"><b class="on">${tx('Requested')}</b><b>${tx('Snapshot')}</b></span><span class="pc2-pages"><b>1</b><b class="on">2</b><b>3</b><b>4</b></span>${btn('print', tx('Print triage sheet'), 'pri')}`) +
  `<div class="pc2-card pc2-dl"><div class="t"><b>${tx('Locations')}</b><small>${tx('tap to leave one out today')}</small></div><div class="bays"><span>7041</span><span>7044</span><span>7052</span></div>` +
  `<small>${txn(2, '{locs} locations · {checks} checks · {n} walker: lines balanced, bays contiguous.', '{locs} locations · {checks} checks · {n} walkers: lines balanced, bays contiguous.', { locs: 3, checks: 0 })}</small></div>` +
  `<div class="pc2-walk">${[['A', [['7041']], '7041', '7041', 1], ['B', [['7044'], ['7052']], '7044', '7052', 2]].map(([w, stops, from, to, lines]) => `<div class="pc2-card"><div class="wh"><b>${tx('Walker {w}', { w })}</b><small>${tx('{from} – {to} · {lines} lines · one sheet', { from, to, lines })}</small></div>` +
    stops.map(([b]) => `<div class="stop"><div><b>${b}</b><span class="tg">${tx('Backfill')}</span><span class="vo">${tx('VISIT ONLY')}</span></div><small>${tx('No flagged stock here: visit / pull only.')}</small></div>`).join('') + '</div>').join('')}</div>`;

// ── a store plan (a drawing of the map, not the store's map file) ────
function plan() {
  const C = d => DEPT_COLOUR[d] || '#94A3B8';
  let s = '';
  const block = (x, y, cols, rows, w, h, gx, gy, col) => { for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) s += `<rect x="${x + i * gx}" y="${y + j * gy}" width="${w}" height="${h}" rx="2" fill="${col}"/>`; };
  block(470, 18, 12, 6, 13, 9, 15, 12, C('stockroom'));
  block(150, 150, 11, 1, 11, 58, 21, 0, C('k1')); block(150, 230, 11, 1, 11, 40, 21, 0, C('k1'));
  block(40, 160, 1, 18, 40, 11, 0, 22, C('k2')); block(92, 200, 1, 12, 34, 11, 0, 26, C('k2'));
  block(150, 290, 6, 2, 13, 50, 22, 62, C('k2')); block(282, 290, 5, 2, 13, 50, 22, 62, C('k3'));
  block(150, 430, 10, 2, 16, 34, 24, 52, C('k4')); block(170, 540, 8, 1, 30, 9, 34, 0, C('k3'));
  block(330, 142, 1, 1, 90, 28, 0, 0, '#374151');
  block(420, 150, 10, 2, 13, 13, 22, 30, C('c2')); block(420, 210, 10, 1, 13, 40, 22, 0, C('c2'));
  block(420, 270, 5, 4, 30, 14, 36, 30, C('c4')); block(600, 270, 3, 4, 20, 16, 26, 30, C('c1'));
  block(690, 250, 2, 5, 22, 24, 30, 36, C('h3')); block(760, 200, 2, 8, 30, 9, 40, 22, C('h1'));
  block(840, 160, 1, 20, 9, 16, 0, 20, C('h4')); block(700, 140, 3, 3, 20, 9, 40, 30, C('h4'));
  block(430, 440, 9, 1, 13, 44, 22, 0, C('c3')); block(430, 510, 9, 1, 13, 44, 22, 0, C('c3'));
  block(640, 440, 6, 2, 13, 44, 22, 70, C('h2')); block(790, 440, 2, 6, 30, 10, 40, 20, C('h2'));
  return `<svg class="pc2-plan" viewBox="0 0 900 600" aria-hidden="true"><path d="M30 140 L860 140 L860 560 L60 590 L30 560 Z" fill="none" stroke="#E5E7EB" stroke-width="2"/>${s}</svg>`;
}

// ── Safety & upkeep › Equipment, Help and Screens ────────────────────
const EQ = () => [['LAD-02', 'Step ladder, 3 step', 'Floor, aisle 8', 3, '2026-07-17', 'bad', txn(8, 'Overdue {n} day', 'Overdue {n} days')], ['STK-01', 'Walkie stacker', 'Stockroom', 1, '2026-09-30', 'warn', txn(5, 'Due in {n} day', 'Due in {n} days')],
  ['PJ-01', 'Pallet jack', 'Back dock', 6, '2026-10-05', 'good', tx('Next {date}', { date: fmtDate('2027-04-05') })]];
const equipment = () => {
  const [code, name, loc, every, last, , st] = EQ()[0];
  return gtabs([['emergency', 'm-emergency', tx('Emergency')], ['maintenance', 'm-maintenance', tx('Maintenance')], ['equipment', 'm-equipment', tx('Equipment'), 1], ['recalls', 'alert', tx('Recalls')]], 'equipment') +
    vh('m-equipment', tx('Equipment checks'), sub(txn(3, '{n} piece of equipment', '{n} pieces of equipment'), tx('{n} overdue', { n: 1 }), tx('{n} due in 14 days', { n: 1 })), `${btn('grid', tx('Print QR labels'))}${btn('print', tx('Print check sheet'))}${btn('plus', tx('Add equipment'), 'pri')}`) +
    `<div class="pc2-eq"><div class="pc2-card map"><div class="mb"><span class="in">${ai('search')}${tx('Find a shelf or bay…')}</span><span class="ch on">${ai('grid')}${tx('All')}</span><span class="ch">${ai('home')}Home</span><span class="ch">${ai('shirt')}Clothing</span><span class="ch">${ai('star')}Kids</span><span class="ch">${ai('bag')}Checkouts</span><span class="ch">${ai('flame')}Flex</span><span class="ch">${ai('box')}Stockroom</span><span class="zb">${['minus', 'plus', 'map', 'layers'].map(i => `<span>${ai(i)}</span>`).join('')}</span></div>${plan()}` +
    `<div class="leg"><span>${ai('m-map')}FOH · Ground <b>1241</b> › ${tx('Equipment checks')}</span>${[['#16A34A', tx('In date')], ['#D97706', tx('Due in 14 days')], ['#DC2626', tx('Overdue')], ['#111827', tx('Out of service')]].map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}<span class="f">${tx('Tap a pin for its checks')}</span></div></div>` +
    `<div class="side"><div class="pc2-card det"><div class="dh"><span class="pn bad">${ai('m-equipment')}</span><b><span class="mono">${code}</span> ${name}</b>${chip(st, 'bad')}</div>` +
    `<div class="meta"><span>${tx('What')}: <b>${tx('Platform ladder')}</b></span><span>${tx('Where')}: <b>${loc}</b></span><span>${tx('Checked')}: <b>${txn(every, 'every {n} month', 'every {n} months')}</b></span><span>${tx('Last check')}: <b>${dShort(last)}</b></span><span>${tx('Next due')}: <b>${dShort('2026-10-17')}</b></span></div>` +
    `<div class="acts">${btn('listcheck', tx('Record a check'), 'pri sm')}${btn('pin', tx('Put it on the map'), 'sm')}${btn('edit', tx('Edit'), 'sm')}${btn('grid', tx('Print label'), 'sm')}${btn('trash', tx('Remove'), 'sm red')}${btn('x', tx('Close'), 'sm')}</div></div>` +
    `<div class="pc2-card lst"><span class="pc2-tabs sm"><b class="on">${tx('All')} 3</b><b>${tx('Ladders')} 1</b><b>MHE 2</b></span>${EQ().map(([c, n, l, e, ls, tone, stx], i) => `<div class="li${i === 0 ? ' sel' : ''}"><span class="pn ${tone}">${ai('m-equipment')}</span><span class="nm"><b><span class="mono">${c}</span> ${n}</b><small>${l} · ${txn(e, 'every {n} month', 'every {n} months')} · ${tx('last {date}', { date: dShort(ls) })}</small></span>${chip(stx, tone)}</div>`).join('')}</div></div></div>`;
};
// Help (js/views/help.js) opened at a screen's chapter: the guide's own page.
const help = () => {
  const ch = (icon, t, dev, on = false) => `<span class="ch${on ? ' on' : ''}"><span class="ci">${gi(icon)}</span><span><b>${t}</b><small>${dev}</small></span></span>`;
  const P = tx('PC'), F = tx('Phone');
  return vh('help', tx('Help'), tx('How the app works'), `${btn('star', tx('What’s new'))}${btn('star', tx('Take the tour'), 'pri')}`) +
    `<div class="pc2-guide"><div class="gtop"><div><h3>${tx('Conduit Visual Guide')}</h3><p>${tx('Each task played on the device it’s done on.')} ${tx('Watch it, try it yourself, read it as a handbook, or print it.')}</p></div>` +
    `<span class="pc2-tabs"><b class="on">${tx('Watch')}</b><b>${tx('Try it')}</b><b>${tx('Handbook')}</b><b>${tx('Paper')}</b></span><span class="for">${tx('For')} <span class="pc2-sel">${tx('Everyone')} ${ai('chev', 'dn')}</span></span><span class="devn"><i></i>${tx('Developer notes')}</span></div>` +
    `<div class="gbody"><div class="chs"><span class="cg">${tx('Start here')}</span>${ch('lock', tx('Signing in'), F)}${ch('grid', tx('Getting around on a PC'), P)}${ch('nowifi', tx('When the wifi drops'), F)}${ch('gear', tx('Settings and updates'), P)}` +
    `<span class="cg">${tx('Floor')}</span>${ch('map', tx('Find a shelf on a phone'), F)}${ch('refresh', tx('Location refresh'), F)}${ch('tag', tx('Price checks'), F)}${ch('wrench', tx('Report a fault'), F)}${ch('ladder', tx('Equipment checks'), P, true)}<span class="cg">${tx('Stockroom')}</span>${ch('barcode', tx('Backfill: scan a location'), F)}${ch('list', tx('Backfill review at the desk'), P)}${ch('pkg', tx('Live pull: floor and stockroom'), tx('2 phones'))}${ch('cage', tx('Cages'), F)}</div>` +
    `<div class="gst"><div class="sh"><h4>${tx('Equipment checks')}</h4><span>${tx('PC · Floor › Safety & upkeep › Equipment')}</span></div><p>${S(tx('Ladders, MHE and trolleys on the map, each with its checks.'), tx('Red needs a person now.'))}</p>` +
    `<div class="mini"><div class="ms"><span class="mr"></span><span class="mm"><span class="mt">${tx('Equipment checks')}</span>${EQ().map(([c, n, , , , tone, stx]) => `<span class="ml"><span class="pn ${tone}">${ai('m-equipment')}</span><b>${c}</b> ${n}${chip(stx, tone)}</span>`).join('')}</span></div></div></div></div></div>`;
};
const BOARDS = () => [['grid', tx('Dock screen'), tx('The pallet grid with a clock on every pallet being decanted, the hold-up banner and the crew. The crew runs the decant from it.'), tx('The dock tablet, or a wall PC on the dock.'), 'dockscreen'],
  ['users', tx('Team Board'), tx('The goal, the forecast finish, and who is decanting what right now and who is next.'), tx('A wall PC the team can see.'), 'teamboard'],
  ['chart', tx('Wallboard'), tx('Progress, pace and hold-ups for the truck on the dock, and the plan for the day.'), tx('The back office, or a wall PC.'), 'wallboard']];
const screens = () => vh('expand', tx('Screens'), tx('Full-screen boards for the wall PCs and the dock tablet.')) +
  `<div class="pc2-scr">${BOARDS().map(([icon, name, what, where, id]) => `<div class="pc2-card"><div class="ch">${ai(icon)}<h3>${name}</h3></div><p>${what}</p><p class="lbl">${where}</p><span class="pc2-btn pri" data-b="${id}">${ai('expand')}${tx('Open')}</span></div>`).join('')}</div>` +
  `<div class="pc2-card pc2-note">${ai('lock')}<p>${tx('Each board is also in Receiving and Results, with more detail. To set up a wall PC or the dock tablet, sign in on it as Dock screen: it opens straight on its board and never locks.')}</p></div>`;

// ── the search palette (js/search.js), over whatever is open ─────────
const orow = (icon, title, subl, act = tx('Open'), attrs = '') => `<div class="orow"${attrs}><span class="oi">${ai(icon)}</span><span class="ot"><b>${title}</b><span>${subl}</span></span><span class="oa">${act} ${ai('arrow')}</span></div>`;
const ogrp = (t, n) => `<div class="ogrp">${t}${n != null ? `<span>${n}</span>` : ''}</div>`;
// q: what is typed; kind: the chip beside it; body: the rows; enter: what Enter does.
const palette = ({ q = '', kind = tx('Type to search'), body = '', enter = tx('open') } = {}) => `<div class="opal${q ? ' typed' : ''}"><div class="in">${ai('search')}<span class="oq${q ? '' : ' pl'}">${q || tx('Search a keycode, a shelf like A16 S2, a manifest, a consolidation, a cage, a load or a tool…')}</span>${q ? '<span class="caret"></span>' : ''}<span class="okind">${kind}</span>${ai('mic')}<span class="esc">Esc</span></div>` +
  `<div class="body">${body}</div><div class="ofoot"><span><kbd>↑</kbd> <kbd>↓</kbd> ${tx('move')}</span><span><kbd>Enter</kbd> ${enter}</span><span><kbd>Esc</kbd> ${tx('close')}</span></div></div>`;
const JUMP = () => [['m-dashboard', tx('Dashboard')], ['file', tx('Reports & files')], ['library', tx('Resources')], ['m-map', tx('Store map')], ['print', tx('Print map')], ['edit', tx('Suggest map edits')]];
const palEmpty = () => palette({ body: ogrp(tx('Jump to')) + JUMP().map(([i, t]) => orow(i, t, tx('Open the view'))).join('') +
  `<div class="ohint"><b>${tx('It understands')}</b>${[tx('keycode 42977636'), tx('shelf A16 S2'), tx('bay A12'), tx('a manifest number'), tx('a consolidation label'), tx('a cage tag'), tx('an inventory load'), tx('a department like Toys'), tx('a tool like Refresh'), tx('a form or file from Resources')].map(s => `<span>${s}</span>`).join('')}</div>` });
const palLad = () => palette({ q: 'LAD-02', kind: tx('Name'), enter: tx('open the top match'), body: ogrp(tx('Equipment'), 1) + orow('m-equipment', '<span class="mono"><em>LAD-02</em></span> Step ladder, 3 step', 'Floor, aisle 8', tx('Open'), ' data-o="equip"') });
const palTool = (q, icon, hit, rest, id) => palette({ q, kind: tx('Name'), enter: tx('open the top match'), body: ogrp(tx('Tools'), 1) + orow(icon, `<em>${hit}</em>${rest}`, tx('Open the view'), tx('Open'), ` data-o="${id}"`) });

// The Help page's chapter list and the Screens page: drawn once, shown by c.view.
const VIEWS = (shown = 'v-dash') => dash(shown === 'v-dash') + view('v-bf', review(), shown === 'v-bf') + view('v-dl', daylist(), shown === 'v-dl') +
  view('v-eq', equipment(), shown === 'v-eq') + view('v-help', help(), shown === 'v-help') + view('v-scr', screens(), shown === 'v-scr');
const rail1 = (c, g) => { c.cls('.pc2-rail .pc2-row', 'on', false); c.cls(`.pc2-rail .pc2-row[data-g="${g}"]`, 'on', true); };
const go = (c, g, v) => { c.hide('.pc2-tip'); c.hide('.pc2-omni'); rail1(c, g); c.view(v); };
const omni = (c, html) => { c.html('.pc2-omni', html); c.show('.pc2-omni'); };
const toast = (c, t) => { c.text('.pc2 > .dv-toast', t); c.show('.pc2 > .dv-toast'); };

// ── the chapter ──────────────────────────────────────────────────────
export const around = {
  id: 'around', grp: 'start', icon: 'grid', title: tx('Getting around on a PC'), device: 'pc', where: tx('PC · the rail, tabs, search and ?'), for: ['manager', 'dock'],
  intro: S(tx('A manager’s PC opens on the Dashboard: the day across the Floor, the Stockroom and the Back dock.'), tx('The rail on the left opens every screen, Ctrl K finds anything from anywhere, and ? opens the guide for the screen you’re on.')),
  html: () => pc(VIEWS()),
  steps: [
    { cap: tx('The PC opens on the Dashboard: the day across the three areas.'), read: S(tx('Backfill review, Location refresh and Label integrity across the top; the Back dock and Maintenance beneath; the Operations register down the right.'), tx('Today, This week and This month switch every card.')),
      dev: 'A PC opens on <b>dashTop()</b> (js/views/dashboard.js); every figure comes from the live projections, so nothing is sent.', ev: [],
      run: async c => { await c.wait(600); } },
    { cap: tx('Each card has the day’s figure and Open for its screen.'), read: S(tx('Backfill review counts the bays reviewed on today’s board.'), tx('Average accuracy has a colour: dark green from 95%, green from 85%, amber from 70% and red below.')),
      dev: 'The card is <b>backfillCard()</b>; the colour is <b>accBand()</b> in js/ui.js.', ev: [],
      run: async c => { c.cls('#v-dash .pc2-kpi.bf .pc2-acc', 'glow', true); await c.tap('#v-dash .pc2-kpi.bf .pc2-acc'); await c.wait(800); } },
    { cap: tx('The Back dock card shows the dock itself, live.'), read: S(tx('Truck 1 is receiving: its eight pallets sit on their bays in the dock’s colours, with the truck’s phase above them.'), tx('As the crew lands and decants, the squares change here too.')),
      dev: 'The grid is <b>dockMini()</b>, drawn from the dock projection; it updates as back dock events arrive.', ev: [],
      run: async c => { c.cls('#v-dash .pc2-kpi.bf .pc2-acc', 'glow', false); await c.tap('#v-dash .pc2-dkg .c.t-l'); c.cls('#v-dash .pc2-dkg', 'glow', true); await c.wait(700); } },
    { cap: tx('The register on the right starts with the morning setup.'), read: S(tx('Paste the morning report, attach the manifests and plan the trucks: each row ticks itself off once the day shows it done.'), tx('Below it, every tool with what needs attention.')),
      dev: 'The checklist is <b>morning()</b>, worked out from the day’s state; the tools below are <b>register()</b>.', ev: [],
      run: async c => { c.cls('#v-dash .pc2-dkg', 'glow', false); await c.tap('#v-dash .mact[data-m="clip"]'); c.cls('#v-dash .morn', 'glow', true); await c.wait(700); } },
    { cap: tx('The rail opens everything: point at a row to see what it holds.'), read: S(tx('Dashboard, Reports & files and Resources on top; the Floor, Stockroom and Back dock rows; Screens, Settings and Help at the foot.'), tx('A count says what is waiting: three bays to review in Backfill.')),
      dev: 'The rows are <b>GROUPS</b>, <b>RAIL_TOP</b>, <b>RAIL</b> and <b>RAIL_FOOT</b> in js/registry.js; the tip is <b>railTip()</b> and the counts <b>paintBadges()</b> in js/shell.js.', ev: [],
      run: async c => { c.cls('#v-dash .morn', 'glow', false); await c.tap('.pc2-rail [data-g="backfill"]'); c.show('.pc2-rail [data-g="backfill"] .pc2-tip'); } },
    { cap: tx('Click a row: its screens are tabs along the top.'), read: S(tx('Backfill holds Review, Day list, History, Trends and Live pull.'), tx('Review opens on today’s board: the bays waiting, the one in hand and the ones ready.')),
      dev: 'A row opens <b>rowTarget()</b>: the tab used last on this PC, else its first. The tabs are <b>groupTabs()</b>.', ev: [],
      run: async c => { await c.tap('.pc2-rail [data-g="backfill"]'); go(c, 'backfill', 'v-bf'); } },
    { cap: tx('A tab switches screens; the row remembers the last one.'), read: S(tx('Day list is the walk for today, split between the walkers.'), tx('Click Backfill again later and it opens on Day list.')),
      dev: 'The tab used last is kept on this PC (localStorage <b>rail_tabs</b>).', ev: [],
      run: async c => { await c.tap('#v-bf .pc2-gtab[data-t="daylist"]'); c.view('v-dl'); } },
    { cap: tx('Ctrl K searches everything, from any screen.'), read: S(tx('Press Ctrl K, or click the search bar at the top.'), tx('Before you type it offers the main screens and says what it understands: a keycode, a shelf, a bay, a manifest, a consolidation, a cage, a load or a tool.')),
      dev: 'The palette is <b>initSearch()</b> in js/search.js; it searches the store’s data on this PC, so it works offline.', ev: [],
      run: async c => { await c.tap('.pc2-top .pc2-search'); omni(c, palEmpty()); } },
    { cap: tx('Type a code: LAD-02 finds the ladder.'), read: S(tx('Results come grouped by kind: shelves, products, manifests, consolidations, cages, equipment and tools.'), tx('Enter opens the top match.')),
      dev: 'Records come from <b>findRecords()</b> in shared/finder.js.', ev: [],
      run: async c => { omni(c, palette({ q: ' ', kind: tx('Name') })); c.text('.pc2-omni .oq', ''); await c.type('.pc2-omni .oq', 'LAD-02'); omni(c, palLad()); } },
    { cap: tx('Pick the result to go straight to it.'), read: S(tx('LAD-02 opens in Safety & upkeep › Equipment, its card open: overdue 8 days.'), tx('The rail and the tabs show where you are.')),
      dev: 'A result row carries <b>data-view</b> and its argument; the shell’s <b>show()</b> opens it.', ev: [],
      run: async c => { await c.tap('.pc2-omni [data-o="equip"]'); go(c, 'safety', 'v-eq'); } },
    { cap: tx('Stuck? Press ? and Help opens at this screen’s chapter.'), read: S(tx('Every screen has a ? at the top right.'), tx('It opens the guide at the chapter for that screen, ready to watch or try.')),
      dev: 'The ? opens Help with <b>guideFor()</b> in js/registry.js; a screen with no chapter opens the first one for the reader.', ev: [],
      run: async c => { await c.tap('.pc2-top .pc2-help'); go(c, 'help', 'v-help'); } },
    { cap: tx('Screens, at the foot of the rail, holds the boards for the wall PCs.'), read: S(tx('Dock screen, Team Board and Wallboard, each with Open.'), tx('A wall PC or the dock tablet signs in as Dock screen and opens straight on its board.')),
      dev: 'The page is js/views/backdock/screenlist.js.', ev: [],
      run: async c => { await c.tap('.pc2-rail [data-g="screens"]'); go(c, 'screens', 'v-scr'); } },
  ],
  stories: [],
};

// ── What if a screen isn't on the rail? ──────────────────────────────
// Print map opens from the Store map row; the boards from Screens.
const printmap = () => {
  const cb = (l, on = true) => `<span class="cb${on ? ' on' : ''}"><i></i>${l}</span>`;
  return vh('print', tx('Print map'), sub(tx('{paper} landscape', { paper: 'A4' })), btn('print', tx('Print · Save as PDF'), 'pri')) +
    `<div class="pc2-pm"><div class="paper"><div class="sht"><div class="shh"><b>Busselton 1241</b><span>FOH · Ground</span><span>${fmtDate(DAY, { year: true })}</span></div>${plan()}</div></div>` +
    `<div class="side"><div class="pc2-card"><h4>${tx('Floors')}</h4><span class="pc2-tabs sm"><b class="on">${tx('Current')}</b><b>Ground</b></span><small>${tx('Prints the floor shown.')}</small></div>` +
    `<div class="pc2-card"><h4>${tx('Area')}</h4><span class="pc2-tabs sm"><b class="on">${tx('All')}</b><b>${ai('home')}Home</b><b>${ai('shirt')}Clothing</b><b>${ai('star')}Kids</b></span></div>` +
    `<div class="pc2-card"><h4>${tx('Layers')}</h4>${cb(tx('Shelf names'))}${cb(tx('Shelf badges'))}<span class="dc">${tx('Department colours')}<span class="pc2-tabs sm"><b class="on">${tx('Full')}</b><b>${tx('Outline')}</b></span></span>${cb(tx('Price checks'))}${cb(tx('Tory lines'))}${cb(tx('Landmarks'))}</div>` +
    `<div class="pc2-card"><h4>${tx('Mode details')}</h4>${[tx('Pick route (this device’s pick list)'), tx('Refresh — completed shelves'), tx('Refresh — plan colours'), tx('Stocktake states'), tx('Emergency markers'), tx('Maintenance issues')].map(l => cb(l, false)).join('')}</div></div></div>`;
};
const team = () => gtabs([['receiving', 'm-receiving', tx('Truck')], ['teamboard', 'users', tx('Team Board')]], 'teamboard') +
  `<div class="pc2-tb"><div class="th"><h2>${tx('Team Board')} <span class="phb">${tx('truck phase::Receiving')}</span></h2><small>${tx('Truck {no} · landed {time}', { no: 1, time: '05:40' })}</small></div><span class="clk">08:20:14</span>${btn('expand', tx('Fullscreen'), 'sm')}${btn('grid', tx('Dock screen'), 'sm')}</div>` +
  `<div class="pc2-tbk">${[[tx('Goal'), '—', ''], [tx('Forecast finish'), '08:10', tx('{time} of work left · {n} on', { time: '1h 50m', n: 3 })], [tx('Cartons'), '0 <i>/ 72</i>', ''], [tx('Pallets'), '0 <i>/ 8</i>', '']].map(([l, v, s]) => `<div class="pc2-card"><small>${l}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`).join('')}</div>` +
  `<div class="pc2-tbp"><i></i></div><div class="pc2-tbl"><span>${tx('<b>{done}</b> of {total} cartons · {pct}%', { done: 0, total: 72, pct: 0 })}</span><span>${tx('{done} of {total} pallets', { done: 0, total: 8 })}</span></div>` +
  `<div class="pc2-tbc"><div class="pc2-card"><div class="h"><b>${tx('Decanting now')}</b><small>${tx('{n} on pallets', { n: 0 })}</small></div><p>${tx('Nobody is on a pallet right now.')}</p></div>` +
  `<div class="pc2-card"><div class="h"><b>${tx('Up next')}</b><small>${txn(8, '{n} pallet waiting', '{n} pallets waiting')}</small></div>${[['D4', 'A1', tx('Chep tubs'), 2], ['D7', 'A3', tx('Chep tubs'), 18], ['D9', 'A5', tx('Chep tubs'), 16]].map(([d, b, t, n]) => `<div class="nx"><b>${d}</b><b class="bay">${b}</b><span>${t} · ${tx('{n} ctn', { n })}</span></div>`).join('')}</div></div>`;
around.stories.push({
  id: 'norow', title: tx('What if a screen isn’t on the rail?'), blurb: tx('Type its name in Ctrl K: every screen is a result, and the row it belongs to lights up when it opens.'),
  know: [tx('A few screens have no row of their own: Print map and Suggest map edits belong to the Store map, the Dock screen and Wallboard to Screens.'), tx('Ctrl K finds every screen by its name, from anywhere.'),
    tx('When it opens, the row it belongs to lights up and its tabs show above it.'), tx('Screens opens each board on this PC; a wall PC signs in as Dock screen instead.'),
    tx('A tool the owner switched off for the store is not on the rail and not in search.'), tx('Layouts shows SOON: it opens a page about what is coming.')],
  html: () => pc(VIEWS() + view('v-pm', printmap(), false) + view('v-team', team(), false)),
  steps: [
    { cap: tx('Ctrl K, then type the screen’s name: print.'), read: S(tx('Print map has no row: it opens from the Store map.'), tx('Search finds it by name anyway, under Tools.')),
      dev: 'Tools come from the registry: each row’s tabs and the screens it stands for (<b>also</b> in GROUPS).', ev: [],
      run: async c => { await c.tap('.pc2-top .pc2-search'); omni(c, palette({ q: ' ', kind: tx('Name') })); c.text('.pc2-omni .oq', ''); await c.type('.pc2-omni .oq', 'print'); omni(c, palTool('print', 'print', tx('Print map').slice(0, 5), tx('Print map').slice(5), 'printmap')); } },
    { cap: tx('Open it: the Store map row lights up, since Print map belongs to it.'), read: S(tx('Print map composes a printable map: floors, an area, layers and a legend.'), tx('The rail shows which row it belongs to.')),
      dev: 'GROUP_OF in js/registry.js names each screen’s row; <b>markRail()</b> lights it.', ev: [],
      run: async c => { await c.tap('.pc2-omni [data-o="printmap"]'); go(c, 'map', 'v-pm'); } },
    { cap: tx('The boards are on Screens: open the Team Board.'), read: S(tx('Screens lists the full-screen boards for the wall PCs and the dock tablet.'), tx('Open shows the board here, on this PC.')),
      dev: 'Each card’s Open carries <b>data-view</b> with the board’s view.', ev: [],
      run: async c => { await c.tap('.pc2-rail [data-g="screens"]'); go(c, 'screens', 'v-scr'); await c.tap('#v-scr [data-b="teamboard"]'); go(c, 'receiving', 'v-team'); } },
    { cap: tx('It opens under its own row: Receiving, beside the truck.'), read: S(tx('The Team Board is a tab of Receiving, so Receiving lights up and its tabs show above it.'), tx('Fullscreen fills the screen for a wall PC.')),
      dev: 'teamboard is a tab of the receiving group (GROUPS in js/registry.js).', ev: [],
      run: async c => { c.cls('#v-team .pc2-gtabs', 'glow', true); await c.wait(900); c.cls('#v-team .pc2-gtabs', 'glow', false); } },
  ],
});

// ── What if the PC loses the network? ────────────────────────────────
const syPop = online => `<div class="pc2-syp"><div class="h"><b>${tx('Changes on this device')}</b><span class="x">${ai('x')}</span></div>` +
  (online ? `<p>${ai('check')}<span>${tx('Everything on this device has reached the store.')}</span></p>`
    : `<p>${ai('clock')}<span>${tx('Offline. Changes stay on this device and send when the connection is back.')}</span></p><div class="sec">${tx('To send · {n}', { n: 2 })}</div>` +
      `<div class="lst">${['Submission ready', 'Submission claim'].map(t => `<div class="r"><b>${t} <span>7041 · ${DAY}</span></b><small>${tx('made {time}', { time: '08:12' })}</small></div>`).join('')}</div>`) + '</div>';
around.stories.push({
  id: 'offline', title: tx('What if the PC loses the network?'), blurb: tx('Keep working: changes stay on the PC and send by themselves when it is back.'),
  know: [tx('The footer says how the PC stands: Synced to cloud, Offline, or how many changes are queued.'), tx('Everything already on the PC still opens, and search still works.'),
    tx('A change made offline shows at once on this PC and waits in its outbox.'), tx('When the network is back, waiting changes send by themselves, in the order they were made.'),
    tx('Click the footer to see what is waiting; a change that waits for something else, like a code, says why.'), tx('Other devices see the change once it has reached the store.')],
  html: () => pc(view('v-bf', review(), true), { on: 'backfill' }),
  steps: [
    { cap: tx('The network drops: the footer says Offline.'), read: S(tx('The bottom right of every screen says how the PC stands.'), tx('Offline means changes stay here until the connection is back.')),
      dev: 'The footer is <b>paintStatus()</b> in js/shell.js.', ev: [],
      run: async c => { await c.wait(500); c.html('.pc2-sync', sync(true)); c.cls('.pc2-sync', 'glow', true); await c.wait(700); c.cls('.pc2-sync', 'glow', false); } },
    { cap: tx('Keep working: Ready on 7041 still works.'), read: S(tx('7041 moves to Ready on this PC straight away.'), tx('The footer counts what is waiting to send.')),
      dev: 'Ready sends <b>submission.ready</b>, then <b>submission.claim</b> to free the bay; both wait in the outbox.',
      ev: [E('submission.ready', 'stockroom', { bay: '7041', date: DAY }, {}, { wait: true, why: 'Offline' }), E('submission.claim', 'stockroom', { bay: '7041', date: DAY }, { release: true }, { wait: true, why: 'Offline' })],
      run: async c => { await c.tap('#v-bf .pc2-btn.rdy'); c.html('#v-bf', review({ ready: true })); c.html('.pc2-rail [data-g="backfill"] .bdg', '2'); c.html('.pc2-sync', sync(true, 2)); toast(c, tx('{bay} marked ready: history recorded', { bay: '7041' })); } },
    { cap: tx('Click the footer to see what is waiting.'), read: S(tx('Changes on this device lists each one and when it was made.'), tx('Nothing to press: they send by themselves.')),
      dev: 'The list is <b>syncPanel()</b> in js/sync.js.', ev: [],
      run: async c => { await c.tap('.pc2-sync'); c.html('.pc2-sy', syPop(false)); c.show('.pc2-sy'); } },
    { cap: tx('Back online: it all sends and the footer says Synced to cloud.'), read: S(tx('The waiting changes go in the order they were made.'), tx('The list says everything has reached the store.')),
      dev: 'The outbox posts the queue in order; the worker checks each event and sends it to the store’s devices.', ev: [],
      run: async c => { await c.wait(600); c.html('.pc2-sync', sync(false)); c.html('.pc2-sy', syPop(true)); } },
  ],
});

// ── What if the PC has half the screen? ──────────────────────────────
// A window of 960×1040 beside another: the shell's narrower layout.
around.stories.push({
  id: 'half', title: tx('What if the PC has half the screen?'), blurb: tx('The same rail and screens fit, narrower; Menu folds the rail to icons.'),
  know: [tx('The wide layout is for a full store PC screen; a window half that width gets a narrower one with the same rail, screens and search.'), tx('Cards stack into fewer columns, and the tabs and buttons wrap.'),
    tx('Menu at the foot folds the rail to icons; press it again to open it.'), tx('On a folded rail a dot marks a row with something waiting, and pointing at an icon shows its name.'),
    tx('Settings › Display › Rail starts the rail folded every time on this PC.'), tx('On a phone Conduit has its own layout, with tabs at the bottom.')],
  html: () => pc(view('v-dash', dashHead() + `<div class="pc2-dash">${bfCard()}${rfCard()}${liCard()}${dockCard()}</div>`, true) + view('v-bf', review(), false), { half: true }),
  steps: [
    { cap: tx('Half the screen: the rail and the Dashboard, narrower.'), read: S(tx('The cards stack two across, and the Back dock card takes the whole width.'), tx('The rail keeps every row.')),
      dev: 'Container queries on the shell (styles/shell.css) set the layout from the window’s width.', ev: [], run: async c => { await c.wait(500); } },
    { cap: tx('Click Backfill: the tabs and the review fit the half.'), read: S(tx('The same tabs, with the buttons on a line of their own.'), tx('Today’s board shows the bays waiting and the one in hand.')),
      dev: 'The same views; their own container queries reflow them.', ev: [],
      run: async c => { await c.tap('.pc2-rail [data-g="backfill"]'); go(c, 'backfill', 'v-bf'); } },
    { cap: tx('Menu folds the rail to icons for more room.'), read: S(tx('Counts become dots.'), tx('Press Menu again to open the rail.')),
      dev: 'Menu toggles <b>railmin</b> on the frame; Settings › Display › Rail sets it for this PC (js/prefs.js).', ev: [],
      run: async c => { await c.tap('.pc2-menu'); c.cls('.pc2', 'min', true); } },
    { cap: tx('Point at an icon for its name and what it holds.'), read: tx('The tip is the same as on the open rail.'), dev: 'The same <b>railTip()</b>.', ev: [],
      run: async c => { await c.tap('.pc2-rail [data-g="backfill"]'); c.show('.pc2-rail [data-g="backfill"] .pc2-tip'); } },
  ],
});
