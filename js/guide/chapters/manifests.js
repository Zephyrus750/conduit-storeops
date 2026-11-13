// Chapter: Manifests by day and truck, on the store PC at
// 1920×1080, Back dock › Plan › Manifests as the app draws it today
// (js/views/backdock/manifests.js: the list by week, day and truck and the
// explorer; mpreview.js: the upload preview and its four views,
// Departments, Products, Consolidations and Groups, with a row's details
// and the product card; mbatch.js: several reports at once with their days;
// mstats.js: the Stats tab). Five What ifs play on the same PC: several
// reports at once (one of them twice), one on the wrong truck, a month's
// stats, and on the Plan row's other tabs a truck that can't come to the
// dock (the Planner, routes.js) and calling its pallets back (Off-site
// pallets, offsite.js and callback.js).
// The demo day: Busselton 1241, Sunday 25 October 2026. Truck 1 is receiving
// manifest 7040301 with its 12 consols (scripts/guide/seed.mjs, the Receive
// chapter's truck: A1 and A2 down, 3 consols landed); Truck 2 is planned for
// 13:30 with no manifest yet. Behind it, a fortnight of trucks finalised with
// their manifests (Friday's and Saturday's trucks ran without one) and four
// older reports given their days by hand. The figures are the ones the app
// showed for the same store on the dev stack (the capture moved by two
// weeks); manifest numbers, keycodes, products and departments are data.
import { tx, txn } from '../../i18n.js';
import { dep, fmtDay, fmtDate, fmtMonth } from '../../ui.js';
import { MICRO, SUBS } from '../../data/micros.js';
import { addDays, retailPeriod } from '../../../shared/time.js';
import { ai } from '../frames.js';
import { DAY, dt, pc, view, vh, sub, gtabs, btn } from '../pc.js';
import { mapSvg } from '../manifests-map.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const R = (method, path, body, note) => ({ route: `${method} ${path}`, method, path, body, note });

// ── the store's manifests ────────────────────────────────────────────
// A micro-department's sub-department and name (js/data/micros.js), as js/views/backdock/common.js reads them.
const subOf = code => Object.entries(MICRO).find(([, l]) => l.some(x => x.startsWith(code + ' ')))?.[0] || '';
const nameOf = code => Object.values(MICRO).flat().find(x => x.startsWith(code + ' '))?.slice(4) || '';
const groupOf = code => { const d = subOf(code); return d === 'flex' ? 'flex' : d[0]; };
// [manNo, day, truck, status, cartons, consols]; each was despatched the day before it came.
const BASE = [['7040258', '2026-10-01', 1, 'arrived', 84, 12], ['7040262', '2026-10-05', 1, 'arrived', 73, 10], ['7040266', '2026-10-08', 1, 'arrived', 63, 9], ['7040270', '2026-10-10', 1, 'arrived', 73, 11],
  ['7040280', '2026-10-12', 1, 'done', 80, 11], ['7040282', '2026-10-13', 1, 'done', 61, 9], ['7040284', '2026-10-14', 1, 'done', 87, 13], ['7040285', '2026-10-14', 2, 'done', 42, 6],
  ['7040287', '2026-10-15', 1, 'done', 84, 12], ['7040289', '2026-10-16', 1, 'done', 72, 10], ['7040291', '2026-10-17', 1, 'done', 53, 8],
  ['7040293', '2026-10-19', 1, 'done', 75, 10], ['7040295', '2026-10-20', 1, 'done', 84, 12], ['7040296', '2026-10-21', 1, 'done', 61, 9], ['7040297', '2026-10-21', 2, 'done', 40, 6],
  ['7040298', '2026-10-22', 1, 'done', 100, 14], ['7040301', DAY, 1, 'receiving', 72, 12]];
// Truck 2's report for today (no day until its truck takes it), and Friday's and Saturday's, published late.
const M304 = ['7040304', null, null, 'library', 66, 10, '2026-10-24'], M300 = ['7040300', '2026-10-23', 1, 'arrived', 79, 11], M303 = ['7040303', '2026-10-24', 1, 'arrived', 63, 9];
const mk = ([no, day, truck, st, ctn, n, desp]) => ({ no, day, truck, st, ctn, n, desp: desp || addDays(day, -1) });
const LIST0 = BASE.map(mk);
const LIST1 = [...LIST0, mk(M304)];
const LIST2 = [...LIST0, mk(M300), mk(M303)];
const LIST3 = [...LIST0, mk(M300), { ...mk(M303), truck: 2 }];
const LIST4 = [...LIST3, mk(M304)];
const ddmmyy = iso => iso.split('-').reverse().join('/');

// Each manifest's consols as the explorer lists them: id, cartons, units,
// keycodes, its micro-departments by cartons; and its cartons by Home,
// Clothing and Kids.
const X = {
  7040293: { units: 447, kc: 15, roll: [18, 14, 43], rows: [['601940483', 11, 75, 3, '065 087 038'], ['601940490', 5, 27, 1, '047'], ['601940497', 5, 43, 2, '025 024'], ['601940504', 12, 48, 3, '004 091 006'], ['601940511', 4, 18, 1, '067'], ['601940518', 7, 55, 2, '040 087'], ['601940525', 9, 51, 3, '028 047 038'], ['601940532', 3, 9, 1, '072'], ['601940539', 9, 37, 2, '006 074'], ['601940546', 10, 84, 3, '004 028 067']] },
  7040298: { units: 598, kc: 16, roll: [45, 9, 46], rows: [['601940742', 12, 84, 3, '072 028 047'], ['601940749', 4, 30, 1, '024'], ['601940756', 7, 19, 2, '006 091'], ['601940763', 9, 57, 3, '015 028 067'], ['601940770', 3, 21, 1, '040'], ['601940777', 9, 61, 2, '047 038'], ['601940784', 10, 60, 3, '072 025 024'], ['601940791', 2, 12, 1, '074'], ['601940798', 7, 43, 2, '067 004'], ['601940805', 11, 63, 3, '040 015 087'], ['601940812', 5, 33, 1, '065'], ['601940819', 5, 25, 2, '072 028'], ['601940826', 12, 66, 3, '006 074 025'], ['601940833', 4, 24, 1, '091']] },
  7040300: { units: 429, kc: 16, roll: [26, 9, 44], rows: [['601941358', 12, 48, 3, '006 074 025'], ['601941365', 4, 18, 1, '091'], ['601941372', 7, 55, 2, '028 015'], ['601941379', 9, 51, 3, '038 065 087'], ['601941386', 3, 9, 1, '047'], ['601941393', 9, 37, 2, '025 024'], ['601941400', 10, 84, 3, '006 004 091'], ['601941407', 2, 30, 1, '067'], ['601941414', 7, 19, 2, '087 040'], ['601941421', 11, 57, 3, '047 038 028'], ['601941428', 5, 21, 1, '072']] },
  7040303: { units: 357, kc: 15, roll: [29, 5, 29], rows: [['601941435', 7, 31, 2, '006 091'], ['601941442', 9, 75, 3, '015 028 067'], ['601941449', 3, 27, 1, '040'], ['601941456', 9, 43, 2, '047 038'], ['601941463', 10, 48, 3, '072 025 024'], ['601941470', 2, 18, 1, '074'], ['601941477', 7, 55, 2, '067 004'], ['601941484', 11, 51, 3, '040 015 087'], ['601941491', 5, 9, 1, '065']] },
  7040304: { units: 390, kc: 15, roll: [25, 12, 29], rows: [['601941288', 5, 9, 1, '072'], ['601941295', 5, 37, 2, '006 074'], ['601941302', 12, 84, 3, '028 067 004'], ['601941309', 4, 30, 1, '015'], ['601941316', 7, 19, 2, '065 038'], ['601941323', 9, 57, 3, '024 072 028'], ['601941330', 3, 21, 1, '025'], ['601941337', 9, 61, 2, '004 091'], ['601941344', 10, 60, 3, '028 040 015'], ['601941351', 2, 12, 1, '087']] },
};
// 7040301's consols and their lines, as scripts/guide/seed.mjs builds the report.
const KC301 = [['42977636', '022'], ['43302210', '038'], ['43166022', '047'], ['43602218', '024'], ['110148905', '085'], ['43307685', '054'], ['43199310', '090'], ['43444444', '006']];
const C301 = Array.from({ length: 12 }, (_, i) => { const items = [0, 1, 2].slice(0, 1 + (i % 3)).map(k => { const [kc, d] = KC301[(i + k) % 8]; return { k: kc, q: 6 + ((i * 5 + k * 3) % 24), d, c: 2 + ((i + k) % 3) }; }); return { id: String(601930100 + i * 7), items }; });
const mixOf = items => { const m = {}; for (const it of items) { m[it.d] ||= [0, 0]; m[it.d][0] += it.c; m[it.d][1] += it.q; } return Object.entries(m).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).map(([d]) => d).join(' '); };
X[7040301] = { units: 412, kc: 8, roll: [30, 12, 30], rows: C301.map(c => [c.id, c.items.reduce((n, x) => n + x.c, 0), c.items.reduce((n, x) => n + x.q, 0), c.items.length, mixOf(c.items)]), items: Object.fromEntries(C301.map(c => [c.id, c.items])) };
// A1 and A2 are down: their three consols have landed.
const LANDED301 = ['601930100', '601930107', '601930114'];
// 7040301 by micro-department: cartons, units, keycodes, consols, landed %.
const DEPTS301 = [['022', 10, 48, 1, 3, 20], ['038', 7, 63, 1, 3, 43], ['047', 14, 66, 1, 4, 57], ['024', 12, 64, 1, 4, 17], ['085', 8, 64, 1, 3, 38], ['054', 11, 55, 1, 3, 0], ['090', 4, 22, 1, 2, 0], ['006', 6, 30, 1, 2, 0]];
// The products, as the catalogue names them.
const NAMES = { 42977636: '12pk Diecast Vehicles', 43302210: 'Paper Plates 20pk', 43166022: 'Remote Control Stunt Car', 43602218: 'A4 Exercise Book 5pk', 110148905: 'Trading Card Tin', 43307685: 'Folding Step Stool', 43199310: 'Mens Trunks 3pk', 43444444: 'Girls Tee 2pk',
  43310045: 'Wooden Forks 4pk', 42981102: 'Monster Truck Set', 43305518: 'Party Cups 20pk', 43170264: 'Bath Towel 5pk', 43604471: 'Spiral Notebook A5', 43201187: 'Gift Wrap Roll 3m', 43447720: 'Quilt Cover Set Queen', 43561290: 'Girls Leggings 2pk',
  43118843: 'Mens Crew Tee', 43226605: 'Womens Rib Tank', 43339981: 'Building Blocks 500 Piece', 42977641: 'Balloons Assorted 8pk', 43610017: 'Storage Tub 30L', 43610025: 'Stoneware Dinner Plate', 43610033: 'Stacking Cups', 43610041: 'Yoga Mat' };
const KDEPT = { ...Object.fromEntries(KC301), 43310045: '038', 42981102: '047', 43305518: '028', 43170264: '072', 43604471: '024', 43201187: '025', 43447720: '074', 43561290: '006', 43118843: '091', 43226605: '004', 43339981: '067', 42977641: '028', 43610017: '015', 43610025: '040', 43610033: '087', 43610041: '065' };

// ── the list by week, day and truck (manifests.js grouped(), listRow()) ──
// On a truck here, the truck's phase: 7040301's Truck 1 is still receiving.
const STATUS = () => ({ done: [tx('Done'), 'good'], decanting: [tx('Decanting'), 'warn'], receiving: [tx('Receiving'), ''], planned: [tx('Planned'), ''], arrived: [tx('Came in'), ''], library: [tx('Published'), ''], offsite: [tx('Off-site'), 'warn'], diverted: [tx('Diverted'), ''] });
const monday = d => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
const dayName = d => d === DAY ? tx('Today · {date}', { date: fmtDay(d) }) : d === addDays(DAY, -1) ? tx('Yesterday · {date}', { date: fmtDay(d) }) : fmtDay(d);
function weekName(w) {
  const t = monday(DAY), range = `${fmtDate(w)} – ${fmtDate(addDays(w, 6))}`;
  return w === t ? tx('This week · {range}', { range }) : w === addDays(t, -7) ? tx('Last week · {range}', { range }) : range;
}
function grouped(list) {
  const out = [], free = list.filter(x => !x.day), wk = new Map();
  if (free.length) out.push({ key: 'free', title: tx('No day yet'), xs: free });
  for (const x of list) if (x.day) { const w = monday(x.day); if (!wk.has(w)) wk.set(w, []); wk.get(w).push(x); }
  for (const w of [...wk.keys()].sort().reverse()) out.push({ key: w, title: weekName(w), xs: wk.get(w).sort((a, b) => a.day.localeCompare(b.day) || (a.truck || 9) - (b.truck || 9)) });
  return out;
}
const tile = d => d ? `<span class="mf2-dd${d === DAY ? ' now' : ''}"><small>${dt(d, { weekday: 'short' })}</small><b>${Number(d.slice(8))}</b></span>` : `<span class="mf2-dd none">${ai('cal')}</span>`;
const pill = (t, k = '') => `<span class="mf2-st${k ? ' ' + k : ''}">${t}</span>`;
function lrow(m, on) {
  const [label, cls] = STATUS()[m.st];
  return `<div class="mf2-row${on ? ' on' : ''}" data-man="${m.no}">${tile(m.day)}<span class="mm"><span class="hd${m.rt ? ' rt' : ''}"><b>${m.no}</b>${m.truck ? `<span class="tn">${ai('truck')}${tx('Truck {no}', { no: m.truck })}</span>` : ''}${m.rt ? rtag(m.rt) : pill(label, cls)}</span>` +
    `<span class="fig"><span>${tx('<b>{n}</b> ctn', { n: m.ctn })}</span><span>${tx('<b>{n}</b> consols', { n: m.n })}</span><span class="meta">${tx('despatched {date}', { date: fmtDay(m.desp) })}</span></span></span>${ai('chev', 'cv')}</div>`;
}
const listCard = (list, open) => `<div class="pc2-card mf2-list">${grouped(list).map(g => `<div class="mf2-wk${g.key === 'free' ? ' free' : ''}">${g.title}${g.key === 'free' ? '' : `<small class="wkp">${retailPeriod(g.key)}</small>`}` +
  `<span class="dim">${txn(g.xs.length, '{n} manifest', '{n} manifests')}${g.key === 'free' ? '' : ` · ${tx('{n} ctn', { n: g.xs.reduce((n, x) => n + x.ctn, 0) })}`}</span>${g.key === 'free' ? `<span class="pc2-btn sm mf2-dates">${ai('cal')}${tx('Give them days')}</span>` : ''}</div>` +
  g.xs.map(m => lrow(m, m.no === open)).join('')).join('')}</div>`;

// ── the explorer (manifests.js explorer(), cameOn()) ─────────────────
const GROUPS = [['h', 'Home', '#2563EB'], ['c', 'Clothing', '#DB2777'], ['k', 'Kids', '#F59E0B']];
const sq = s => `<i class="mf2-sq ${s || 'none'}"></i>`;
const SQ = () => [['landed', tx('landed')], ['active', tx('decanting')], ['done', tx('decanted')], ['carried', tx('carried over')], ['none', tx('not landed')]];
const kname = k => `<span class="nm"><span class="ok">✓</span>${NAMES[k]} ↗</span>`;
const hm = m => tx('{h}h {m}m', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
const field = (t, cls = '') => `<span class="mf2-in${cls ? ' ' + cls : ''}">${t}</span>`;
const dateIn = d => field(`<span class="val${d ? '' : ' plh'}">${d ? ddmmyy(d) : 'dd/mm/yyyy'}</span>${ai('cal')}`, 'date');
const truckSel = n => field(`<span class="val">${n ? tx('Truck {no}', { no: n }) : tx('Truck —')}</span>${ai('chev', 'dn')}`, 'sel');
// Came on: for a report no truck here carried, its day and truck by hand.
function came(m) {
  const cur = m.st === 'arrived';
  return `<div class="mf2-came"><span class="cl">${ai('cal')}${tx('Came on')}</span>${dateIn(cur ? m.day : '')}${truckSel(cur ? m.truck : null)}` +
    `<span class="pc2-btn sm mf2-save${cur ? '' : ' pri'}">${ai('check')}${tx('Save')}</span>${cur ? `<span class="pc2-btn sm">${tx('Clear')}</span>` : ''}<small>${cur ? tx('Set by hand: the list and the stats place it here.') : tx('Pick the day it came and its truck.')}</small></div>`;
}
const roll = ([h, c, k]) => { const t = h + c + k; return `<div class="mf2-roll">${GROUPS.map((g, i) => [g, [h, c, k][i]]).filter(([, v]) => v > 0).map(([g, v]) => `<span style="flex:${v};background:${g[2]}">${v / t > 0.08 ? `${g[1]} ${Math.round(v / t * 100)}%` : ''}</span>`).join('')}</div>`; };
// opts: tab (consols | depts), open (a consol's id), q (the search), hit (the keycode found).
function explorer(m, { tab = 'consols', open = '', q = '', hit = '' } = {}) {
  const x = X[m.no], [label, cls] = STATUS()[m.st], onTruck = m.st === 'done' || m.st === 'receiving';
  const state = id => m.st === 'done' ? 'done' : m.no === '7040301' && LANDED301.includes(id) ? 'landed' : '';
  const nLanded = m.st === 'done' ? x.rows.length : m.no === '7040301' ? LANDED301.length : 0;
  const facts = [tx('despatch <b>{date}</b>', { date: ddmmyy(m.desp) }), tx('DC <b>{no}</b>', { no: '4101533' })];
  if (onTruck) facts.push(dayName(m.day), tx('Truck <b>{no}</b> · {n}/{total} landed', { no: m.truck, n: nLanded, total: x.rows.length }));
  else if (m.st === 'arrived') facts.push(tx('Came on Truck <b>{no}</b> · {day}', { no: m.truck, day: dayName(m.day) }));
  else if (m.rt) facts.push(tx('For Truck <b>{no}</b> · {day}', { no: m.truck, day: dayName(m.day) }));
  const stat = (k, v, note) => `<div><span>${k}</span><b>${v}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const acts = onTruck ? pill(tx('On Truck {no}', { no: m.truck }), 'good') : `${field(`<span class="val">${tx('Truck {no} · {status}', { no: 1, status: tx('live') })}</span>${ai('chev', 'dn')}`, 'sel wide')}${btn('truck', tx('Attach to truck'), 'sm pri')}`;
  const rows = tab === 'depts' ? null : q ? x.rows.filter(r => x.items[r[0]].some(i => i.k.startsWith(q))) : x.rows;
  const lines = id => `<tr class="mf2-items"><td></td><td colspan="5">${x.items[id].map(it => `<div class="it${hit && it.k === hit ? ' hit' : ''}"><span class="kc">${it.k}</span>${kname(it.k)}${dep(subOf(it.d))}<span class="ct">${tx('~{cartons} ctn · {units} units', { cartons: it.c, units: it.q })}</span></div>`).join('')}</td></tr>`;
  const head = tab === 'depts' ? [[tx('Department')], [tx('Cartons'), 'n'], [tx('Units'), 'n'], [tx('Keycodes'), 'n'], [tx('Consols'), 'n'], [tx('Landed')]] : [[''], [tx('Consol')], [tx('Departments')], [tx('Cartons'), 'n'], [tx('Units'), 'n'], [tx('Keycodes'), 'n']];
  const body = tab === 'depts' ? DEPTS301.map(([d, c, u, k, n, p]) => `<tr><td>${dep(subOf(d))} <span class="dn"><small>${d}</small> ${nameOf(d)}</span></td><td class="n">${c}</td><td class="n">${u}</td><td class="n">${k}</td><td class="n">${n}</td><td><span class="pct"><i style="width:${p}%"></i></span> ${p}%</td></tr>`).join('')
    : rows.map(([id, c, u, k, mix]) => `<tr class="mf2-c" data-id="${id}"><td>${sq(state(id))}</td><td class="mono">${id}</td><td>${mix.split(' ').slice(0, 4).map(d => dep(subOf(d))).join('')}</td><td class="n">${c}</td><td class="n">${u}</td><td class="n">${k}</td></tr>` + (open === id || q ? lines(id) : '')).join('');
  const count = tab === 'depts' ? txn(DEPTS301.length, '{n} department', '{n} departments') : txn(rows.length, '{n} consol', '{n} consols');
  return `<div class="pc2-card mf2-x"><div class="mf2-dh"><span class="t">${ai('packages')}<b>${m.no}</b>${pill(label, cls)}</span><span class="fx">${facts.map(f => `<span>${f}</span>`).join('')}</span></div>${onTruck ? '' : m.rt ? where(m.rt) : came(m)}` +
    `<div class="mf2-stats">${stat(tx('Consols'), x.rows.length)}${stat(tx('Cartons'), m.ctn)}${stat(tx('Keycodes'), x.kc)}${stat(tx('Units'), x.units)}${stat(tx('Est. work'), hm(Math.round(m.ctn * 0.5)), tx('{mpc} min/ctn · one person', { mpc: 0.5 }))}</div>${roll(x.roll)}` +
    `<div class="mf2-acts">${acts}${btn('trash', tx('Remove'), 'sm rm')}</div>` +
    `<div class="mf2-bar"><span class="mf2-seg">${[['consols', tx('Consols')], ['products', tx('Products')], ['depts', tx('Departments')]].map(([k, l]) => `<b class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</b>`).join('')}</span>` +
    `<span class="mf2-q${q ? ' typed' : ''}">${ai('search')}<span class="t">${q || tx('find consol, keycode, product, dept…')}</span></span>${tab === 'depts' ? btn('layers', tx('Whole load heat'), 'sm') : ''}<span class="hit">${count}</span></div>` +
    `<div class="mf2-lg">${SQ().map(([s, l]) => `${sq(s)}<span>${l}</span>`).join('')}</div>` +
    `<table class="mf2-t"><thead><tr>${head.map(([h, c]) => `<th${c ? ` class="${c}"` : ''}>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
// The map below the departments (loads.js mapCard()), nothing painted yet, so no Clear.
const mapCard = () => `<div class="pc2-card mf2-mapc"><div class="ch"><h3>${tx('On the map')}</h3><span class="dim">${tx('pick a department or Whole load')}</span></div><div class="box">${mapSvg()}</div></div>`;

// The page: the Plan row's tabs, the header, the list and the open one.
const TABS = () => [['planner', 'm-planner', tx('Planner')], ['manifests', 'm-manifests', tx('Manifests')], ['profiles', 'm-profiles', tx('Carton profiles')], ['offsite', 'm-inventory', tx('Off-site pallets')]];
const head = (n, on = 'list') => vh('m-manifests', tx('Manifests'), sub(tx('Manifest explorer'), txn(n, '{n} manifest', '{n} manifests'), tx('by week, day and truck')),
  `<span class="mf2-seg big">${[['list', tx('List'), 'm-manifests'], ['stats', tx('Stats'), 'chart']].map(([k, l, i]) => `<b class="${on === k ? 'on' : ''}" data-v="${k}">${ai(i)}${l}</b>`).join('')}</span>${btn('plus', tx('Add a load'))}${btn('file', tx('Publish manifests'), 'pri mf2-pub')}`);
const page = (list, open, opts = {}) => { const m = list.find(x => x.no === open); return `<div class="mf2-pg">${gtabs(TABS(), 'manifests')}${head(list.length)}<div class="mf2-grid">${listCard(list, open)}<div class="mf2-col">${explorer(m, opts)}${opts.tab === 'depts' ? mapCard() : ''}</div></div></div>`; };

// ── the pop-ups: the shared sheet (js/sheet.js), wide ────────────────
const sheetHead = (title, subl) => `<div class="mf2-sh"><div class="t"><h3>${ai('file')}${title}</h3><small>${subl}</small></div><span class="x">${ai('x')}</span></div>`;
// The upload preview (mpreview.js previewManifest()): Truck 2's report for
// today, 7040304. Its consols and their lines, [keycode, micro-department,
// units, cartons]; the four views are worked out from them as mpreview.js
// works them out (microRows(), productRows(), groupRows()).
const L304 = [['601941288', [['43170264', '072', 9, 5]]], ['601941295', [['43561290', '006', 21, 3], ['43447720', '074', 16, 2]]],
  ['601941302', [['42977641', '028', 33, 5], ['43339981', '067', 28, 4], ['43226605', '004', 23, 3]]], ['601941309', [['43610017', '015', 30, 4]]],
  ['601941316', [['43610041', '065', 7, 5], ['43310045', '038', 12, 2]]], ['601941323', [['43604471', '024', 24, 4], ['43170264', '072', 19, 3], ['43305518', '028', 14, 2]]],
  ['601941330', [['43201187', '025', 21, 3]]], ['601941337', [['43226605', '004', 33, 5], ['43118843', '091', 28, 4]]],
  ['601941344', [['42977641', '028', 35, 5], ['43610025', '040', 15, 3], ['43610017', '015', 10, 2]]], ['601941351', [['43610033', '087', 12, 2]]]];
// Each consol: its lines, cartons, units, and its micro-departments by cartons, most first.
const C304 = L304.map(([id, its]) => { const items = its.map(([k, d, q, c]) => ({ k, d, q, c })), m = {}; for (const it of items) m[it.d] = (m[it.d] || 0) + it.c; return { id, items, cartons: items.reduce((n, x) => n + x.c, 0), units: items.reduce((n, x) => n + x.q, 0), mix: Object.entries(m).sort((a, b) => b[1] - a[1]) }; });
const TOT304 = C304.reduce((n, c) => n + c.cartons, 0);
// Departments (microRows()): cartons from each consol's mix, units, keycodes, consols and products from the lines; most cartons first.
const MIC304 = (() => {
  const m = new Map(), get = d => { if (!m.has(d)) m.set(d, { code: d, cartons: 0, units: 0, keys: new Set(), consols: new Set(), prods: new Map() }); return m.get(d); };
  for (const c of C304) {
    for (const [d, n] of c.mix) { const r = get(d); r.cartons += n; r.consols.add(c.id); }
    for (const it of c.items) { const r = get(it.d); r.units += it.q; r.keys.add(it.k); let p = r.prods.get(it.k); if (!p) r.prods.set(it.k, p = { k: it.k, units: 0, cartons: 0, n: 0 }); p.units += it.q; p.cartons += it.c; p.n++; }
  }
  return [...m.values()].sort((a, b) => b.cartons - a.cartons || b.units - a.units);
})();
// Products (productRows()): every keycode, its units and cartons and the consols it is on; most units first.
const PRD304 = (() => {
  const m = new Map();
  for (const c of C304) for (const it of c.items) { let r = m.get(it.k); if (!r) m.set(it.k, r = { k: it.k, d: it.d, units: 0, cartons: 0, on: [] }); r.units += it.q; r.cartons += it.c; r.on.push([c.id, it.q, it.c]); }
  return [...m.values()].sort((a, b) => b.units - a.units);
})();
// Groups (groupRows()): Home, Clothing and Kids, each department in it with its micro-departments.
const GRP304 = (() => {
  const blank = x => ({ ...x, cartons: 0, units: 0, keys: new Set(), consols: new Set() }), add = (to, r) => { to.cartons += r.cartons; to.units += r.units; for (const k of r.keys) to.keys.add(k); for (const k of r.consols) to.consols.add(k); };
  const subs = new Map(); for (const r of MIC304) { const sd = subOf(r.code); let s = subs.get(sd); if (!s) subs.set(sd, s = blank({ sd, g: groupOf(r.code), micros: [] })); add(s, r); s.micros.push(r); }
  return GROUPS.map(([g, name, colour]) => { const list = [...subs.values()].filter(s => s.g === g).sort((a, b) => b.cartons - a.cartons || b.units - a.units), x = blank({ g, name, colour, subs: list }); for (const s of list) add(x, s); return x; }).filter(x => x.subs.length);
})();
const CON304 = C304.slice().sort((a, b) => b.cartons - a.cartons);
const micro = (code, withSub = true) => `<span class="mf2-mc">${dep(subOf(code))}<span class="mcn"><span><b class="mono">${code}</b> ${nameOf(code)}</span>${withSub ? `<small>${SUBS.find(x => x[0] === subOf(code))[2]}</small>` : ''}</span></span>`;
const GCOL = { h: '#2563EB', c: '#DB2777', k: '#F59E0B' };
// A keycode copies (kcCopy()); a product's name is the catalogue's, ticked, linking to kmart.com.au (itemName()).
const kcc = k => `<span class="mf3-kc mono">${k}</span>`;
const pnm = k => `<span class="mf3-nm"><span class="ok">✓</span>${NAMES[k]} ↗</span>`;
const bar2 = (c, max, colour) => `<span class="mf2-bar2"><i><b style="width:${Math.round(c / max * 100)}%;background:${colour}"></b></i><span>${c}</span></span>`;
const chev = on => `<i class="mf3-x${on ? ' on' : ''}">${ai('chev')}</i>`;
// The product card (installProductCard() in js/views/stockroom/common.js): the catalogue's picture, keycode, name and price.
const BALLOONS = '<svg viewBox="0 0 84 84" aria-hidden="true"><path d="M26 47 C27 60 33 66 40 80 M45 44 C44 58 41 66 40 80 M60 49 C56 62 47 70 40 80" fill="none" stroke="#9CA3AF" stroke-width="1.2"/>' +
  '<ellipse cx="26" cy="31" rx="13" ry="16" fill="#EF4444"/><ellipse cx="60" cy="33" rx="13" ry="16" fill="#3B82F6"/><ellipse cx="44" cy="27" rx="14" ry="17" fill="#F59E0B"/><ellipse cx="40" cy="20" rx="3.5" ry="5" fill="#fff" opacity=".45"/><ellipse cx="22" cy="25" rx="3" ry="4.5" fill="#fff" opacity=".4"/><ellipse cx="56" cy="27" rx="3" ry="4.5" fill="#fff" opacity=".4"/></svg>';
const PRICE = { 42977641: '$3.50' };
const pcard = k => `<div class="mf3-card"><div class="img">${BALLOONS}</div><div class="b"><span class="kc mono">${k}</span><b>${NAMES[k]}</b><span class="pr">${PRICE[k]}</span><small>${tx('Click the name for kmart.com.au, the keycode to copy it')}</small></div></div>`;
// The views, as mpreview.js has them: its columns (a sortable one names its sort) and the sort it opens on.
const VIEWS = () => [['depts', tx('Departments'), MIC304.length], ['products', tx('Products'), PRD304.length], ['consols', tx('Consolidations'), C304.length], ['groups', tx('Groups'), GRP304.length]];
const HEADS = () => ({
  depts: [[tx('Micro-department')], [tx('Cartons'), 'cartons'], [tx('Share'), '', 'n'], [tx('Units'), 'units', 'n'], [tx('Keycodes'), 'keycodes', 'n'], [tx('Consols'), 'consols', 'n']],
  products: [[tx('Keycode')], [tx('Product')], [tx('Micro-department')], [tx('Units'), 'units', 'n'], [tx('Cartons'), 'cartons', 'n'], [tx('Consols'), 'consols', 'n']],
  consols: [[tx('Pallet id')], [tx('Cartons'), 'cartons', 'n'], [tx('Units'), 'units', 'n'], [tx('Micro-departments')], [tx('Lines'), 'lines', 'n']],
});
const SORT0 = { depts: 'cartons', products: 'units', consols: 'cartons' };
const pth = (v, [label, key, cls = '']) => `<th${cls ? ` class="${cls}"` : ''}>${key ? `<span class="mf3-sort${SORT0[v] === key ? ' on' : ''}">${label}${SORT0[v] === key ? ' ▼' : ''}</span>` : label}</th>`;
const mini = (heads, rows) => `<table class="mf3-dt"><thead><tr>${heads.map(([l, c]) => `<th${c ? ` class="${c}"` : ''}>${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
// A row's details: a department's products, a product's consols, a consol's lines.
function pvDetail(key, cols) {
  const t = key[0], id = key.slice(2);
  const inner = t === 'd' ? mini([[tx('Keycode')], [tx('Product')], [tx('Units'), 'n'], [tx('Cartons'), 'n'], [tx('Consols'), 'n']], [...MIC304.find(r => r.code === id).prods.values()].sort((a, b) => b.units - a.units).map(p => `<tr><td>${kcc(p.k)}</td><td>${pnm(p.k)}</td><td class="n">${p.units}</td><td class="n">${p.cartons}</td><td class="n">${p.n}</td></tr>`).join(''))
    : t === 'p' ? mini([[tx('Pallet id')], [tx('Units'), 'n'], [tx('Cartons'), 'n']], PRD304.find(r => r.k === id).on.slice().sort((a, b) => b[1] - a[1]).map(([cid, u, c]) => `<tr><td><span class="mf3-go mono" data-id="${cid}">${cid}</span></td><td class="n">${u}</td><td class="n">${c}</td></tr>`).join(''))
    : mini([[tx('Keycode')], [tx('Product')], [tx('Micro-department')], [tx('Units'), 'n'], [tx('Cartons'), 'n']], C304.find(c => c.id === id).items.map(it => `<tr><td>${kcc(it.k)}</td><td>${pnm(it.k)}</td><td>${micro(it.d, false)}</td><td class="n">${it.q}</td><td class="n">${it.c}</td></tr>`).join(''));
  return `<tr class="mf3-dr"><td colspan="${cols}"><div class="mf3-dw">${inner}</div></td></tr>`;
}
function pvRow(v, r, s) {
  const o = k => s.open.includes(k), cols = HEADS()[v].length;
  if (v === 'depts') { const key = `d:${r.code}`; return `<tr class="mf3-r${o(key) ? ' open' : ''}" data-k="${key}"><td><span class="mf3-rh">${chev(o(key))}${micro(r.code)}</span></td><td>${bar2(r.cartons, MIC304[0].cartons, GCOL[groupOf(r.code)])}</td><td class="n">${Math.round(r.cartons / TOT304 * 100)}%</td><td class="n">${r.units}</td><td class="n">${r.keys.size}</td><td class="n">${r.consols.size}</td></tr>` + (o(key) ? pvDetail(key, cols) : ''); }
  if (v === 'products') { const key = `p:${r.k}`; return `<tr class="mf3-r${o(key) ? ' open' : ''}" data-k="${key}"><td><span class="mf3-rh">${chev(o(key))}${kcc(r.k)}</span></td><td class="mf3-pd">${pnm(r.k)}${s.card === r.k ? pcard(r.k) : ''}</td><td>${micro(r.d, false)}</td><td class="n">${r.units}</td><td class="n">${r.cartons}</td><td class="n">${r.on.length}</td></tr>` + (o(key) ? pvDetail(key, cols) : ''); }
  const key = `c:${r.id}`;
  return `<tr class="mf3-r${o(key) ? ' open' : ''}" data-k="${key}"><td class="mono"><span class="mf3-rh">${chev(o(key))}${r.id}</span></td><td class="n">${r.cartons}</td><td class="n">${r.units}</td><td><div class="mf2-cm">${r.mix.map(([d, n]) => `<span>${micro(d, false)}<small>${tx('{n} ctn', { n })}</small></span>`).join('')}</div></td><td class="n">${r.items.length}</td></tr>` + (o(key) ? pvDetail(key, cols) : '');
}
function pvGroups() {
  const cells = (x, colour) => `<td>${bar2(x.cartons, TOT304, colour)}</td><td class="n">${Math.round(x.cartons / TOT304 * 100)}%</td><td class="n">${x.units}</td><td class="n">${x.keys.size}</td><td class="n">${x.consols.size}</td>`;
  const chip = m => `<span class="mf3-gm" data-code="${m.code}"><b class="mono">${m.code}</b>${nameOf(m.code)}<small>${tx('{n} ctn', { n: m.cartons })}</small></span>`;
  return `<table class="mf2-t mf3-t mf3-groups"><thead><tr><th>${tx('Department')}</th><th>${tx('Cartons')}</th><th class="n">${tx('Share')}</th><th class="n">${tx('Units')}</th><th class="n">${tx('Keycodes')}</th><th class="n">${tx('Consols')}</th></tr></thead><tbody>` +
    GRP304.map(g => `<tr class="mf3-gh"><td><span class="mf3-gn"><i style="background:${g.colour}"></i>${g.name}</span></td>${cells(g, g.colour)}</tr>` +
      g.subs.map(x => `<tr class="mf3-gs"><td><span class="mf3-gd">${dep(x.sd)}<span>${SUBS.find(y => y[0] === x.sd)[2]}</span></span><span class="mf3-gms">${x.micros.map(chip).join('')}</span></td>${cells(x, g.colour)}</tr>`).join('')).join('') + '</tbody></table>';
}
// The open view, the switcher with a count on each, and the filter (none on Groups).
function pvView(s) {
  if (s.view === 'groups') return pvGroups();
  const rows = s.view === 'depts' ? MIC304 : s.view === 'products' ? PRD304 : CON304.filter(c => !s.q || c.id.includes(s.q));
  return `<table class="mf2-t mf3-t mf3-${s.view}"><thead><tr>${HEADS()[s.view].map(h => pth(s.view, h)).join('')}</tr></thead><tbody>${rows.map(r => pvRow(s.view, r, s)).join('')}</tbody></table>`;
}
const vbar = s => `<div class="mf3-vbar"><span class="mf3-seg">${VIEWS().map(([k, l, n]) => `<b class="${s.view === k ? 'on' : ''}" data-v="${k}">${l}<small>${n}</small></b>`).join('')}</span>` +
  (s.view === 'groups' ? '' : `<span class="mf3-q${s.q ? ' typed' : ''}">${ai('search')}<span class="t">${s.q || tx('find consol, keycode, product, dept…')}</span>${s.q ? `<i class="cl">${ai('x')}</i>` : ''}</span>`) + '</div>';
// s: view (depts | products | consols | groups), open (the rows open: d:028, p:42977641, c:601941344),
// q (the filter), card (the product the pointer rests on), glow (side: the column of checks).
function preview(s = {}) {
  s = { view: 'depts', open: [], q: '', card: '', glow: '', ...s };
  const fact = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`, stat = (k, v, n) => `<div><span>${k}</span><b>${v}</b><small>${n}</small></div>`;
  const gc = {}; for (const r of MIC304) gc[groupOf(r.code)] = (gc[groupOf(r.code)] || 0) + r.cartons;
  return `<div class="mf2-sht prev mf3-pv">${sheetHead(tx('Check the report before publishing'), `Manifest Report 7040304.xls · ${tx('sheet “{name}”', { name: 'Manifest Report' })}`)}<div class="mf2-pb"><div class="main">` +
    `<div class="mf2-facts">${fact(tx('Manifest'), '7040304')}${fact(tx('Store'), '1241')}${fact(tx('DC'), '4101533')}${fact(tx('Despatch'), '24/10/2026')}</div>` +
    `<div class="mf2-stats pv">${stat(tx('Consols'), 10, txn(6, '{n} mixed', '{n} mixed'))}${stat(tx('Cartons'), 66, tx('about {n} a consol', { n: 7 }))}${stat(tx('Keycodes'), 15, txn(19, '{n} line', '{n} lines'))}${stat(tx('Units'), 390, tx('about {n} a carton', { n: 6 }))}` +
    `${stat(tx('Est. work'), hm(33), tx('{mpc} min a carton · about {time} for four', { mpc: 0.5, time: tx('{m}m', { m: 8 }) }))}</div>` +
    `<div class="mf2-pt">${tx('Departments')}<span class="dim">${txn(MIC304.length, '{n} micro-department · cartons, largest first', '{n} micro-departments · cartons, largest first')}</span></div>` +
    `<div class="mf2-roll pv">${GROUPS.filter(g => gc[g[0]]).map(g => `<span style="flex:${gc[g[0]]};background:${g[2]}">${g[1]} ${Math.round(gc[g[0]] / TOT304 * 100)}%</span>`).join('')}</div>` +
    vbar(s) + `<div class="mf3-view">${pvView(s)}</div></div>` +
    `<div class="side${s.glow === 'side' ? ' glow' : ''}"><div class="mf2-pt">${tx('Came on')}</div><div class="mf2-came2">${dateIn('')}${truckSel(null)}</div><small class="dim">${tx('For a report from a day already gone. Today’s goes on its truck at the Planner or Receiving.')}</small>` +
    `<div class="mf2-pt">${tx('Checks')}</div><ul class="mf2-checks"><li>✓ ${tx('Every row read ({n} lines).', { n: 66 })}</li></ul>` +
    `<div class="acts"><span class="pc2-btn pri mf2-go">${ai('check')}${tx('Publish to the library')}</span><span class="pc2-btn">${tx('Cancel')}</span></div><small class="dim">${tx('Publishing lists it on every device; a truck attaches it when it lands.')}</small></div></div></div>`;
}
// Several at once (mbatch.js publishMany()): Friday's, Saturday's and a copy of Friday's.
const FILES = [['Manifest Report 7040300.xls', '7040300', '22/10/2026', 11, 79, '2026-10-23'], ['Manifest Report 7040303.xls', '7040303', '23/10/2026', 9, 63, '2026-10-24'], ['Manifest Report 7040300 (1).xls', '7040300', '22/10/2026', 11, 79, null]];
function batch({ done = false, glow = '' } = {}) {
  const row = ([file, no, desp, n, ctn, day], i) => {
    const twin = !day;
    return `<tr class="${twin ? 'off' : ''}" data-i="${i}"><td><span class="mf2-cb${twin ? '' : ' on'}${done && !twin ? ' dis' : ''}">${twin ? '' : ai('check')}</span></td><td class="file">${file}</td><td><b class="mono">${no}</b></td><td>${desp}</td><td class="n">${n}</td><td class="n">${ctn}</td>` +
      `<td>${twin ? `<span class="chk bad">⛔ ${tx('Same manifest as {file}', { file: FILES[0][0] })}</span>` : `<span class="chk ok">✓ ${tx('All read')}</span>`}</td>` +
      `<td class="came">${twin ? '' : `<span class="mf2-came2">${dateIn(day)}${truckSel(1)}</span><small>${tx('from the Planner')}</small>`}</td><td>${done && !twin ? pill(`${ai('check')}${tx('Done')}`, 'good') : ''}</td></tr>`;
  };
  return `<div class="mf2-sht bat">${sheetHead(txn(3, 'Publish {n} manifest', 'Publish {n} manifests'), tx('Each goes to the library with the day and truck it came on.'))}<div class="mf2-bb">` +
    `<table class="mf2-t bt${glow ? ' gl-' + glow : ''}"><thead><tr><th></th><th>${tx('File')}</th><th>${tx('Manifest')}</th><th>${tx('Despatch')}</th><th class="n">${tx('Consols')}</th><th class="n">${tx('Cartons')}</th><th>${tx('Checks')}</th><th>${tx('Came on')}</th><th></th></tr></thead><tbody>${FILES.map(row).join('')}</tbody></table>` +
    `<p class="dim">${txn(1, 'A suggested day is a truck the Planner or Receiving has with no manifest near the despatch date; otherwise the despatch date plus {n} day, as this store’s trucks usually take. Change any of them, or clear one to leave it without a day.', 'A suggested day is a truck the Planner or Receiving has with no manifest near the despatch date; otherwise the despatch date plus {n} days, as this store’s trucks usually take. Change any of them, or clear one to leave it without a day.')}</p></div>` +
    `<div class="mf2-sf"><span class="note">${done ? tx('Finished. Close when you have checked the list.') : txn(2, '{n} with a day', '{n} with a day')}</span>${done ? `<span class="pc2-btn pri mf2-close">${tx('Close')}</span>` : `<span class="pc2-btn">${tx('Cancel')}</span><span class="pc2-btn pri mf2-go">${txn(2, 'Publish {n} manifest', 'Publish {n} manifests')}</span>`}</div></div>`;
}
// The PC with its views, and the pop-up layer over the whole screen.
const frame = (views, sheetHtml = '') => pc(views, { on: 'plan' }).replace('<div class="pc2-omni" hidden></div>', `<div class="mf2-back"${sheetHtml ? '' : ' hidden'}>${sheetHtml}</div><div class="pc2-omni" hidden></div>`);
const openSheet = (c, h) => { c.html('.mf2-back', h); c.show('.mf2-back'); };
const closeSheet = c => { c.hide('.mf2-back'); c.html('.mf2-back', ''); };
const glow = (c, sel, on = true) => c.cls(sel, 'glow', on);
// Lights up what a step is about, and clears what the step before lit.
const focus = (c, ...sels) => { c.cls('.glow', 'glow', false); for (const s of sels) glow(c, s); };
// The toast at the foot of the screen, centred as the app's (#toasts).
const toast = (c, t) => c.toast(t, 'mf2-tc');

// ── the chapter ──────────────────────────────────────────────────────
const L0 = LIST0.find(m => m.no === '7040301');
export const manifests = {
  id: 'manifests', grp: 'dock', icon: 'clip', title: tx('Manifests by day and truck'), device: 'pc', where: tx('PC · Back dock › Plan › Manifests'), for: ['dock', 'manager'],
  intro: S(tx('Every manifest sits under the day and truck it came on, so you can tell at a glance which is which.'), tx('Open one to see what is on it and what has landed, or publish the report from the DC’s email.')),
  html: () => frame(view('v-list', page(LIST0, '7040293'), true)),
  steps: [
    { cap: tx('Plan › Manifests lists every manifest by week, day and truck.'), read: S(tx('This week comes first, then each week before it, with its manifests and cartons.'), tx('The first one opens on the right.')),
      dev: 'The list is <b>entries()</b> in js/views/backdock/manifests.js: every report in the library, on the Planner and on the trucks, each placed by <b>placeIndex()</b> in shared/manifeststats.js (its truck, a day set by hand, else its Planner slot); <b>grouped()</b> sorts them by week.', ev: [],
      run: async c => { focus(c, '#v-list .mf2-list'); await c.wait(1200); } },
    { cap: tx('Each row: the day, the manifest, its truck and where it stands.'), read: S(tx('Done, Decanting and Receiving follow the truck it is on; Came in is a day set by hand; Published has no day yet.'), tx('Under it, the cartons, the consols and the day it was despatched.')),
      dev: 'One row is <b>listRow()</b>; today’s day is filled in the accent (<b>dayTile()</b>).', ev: [],
      run: async c => { focus(c, '#v-list .mf2-row[data-man="7040301"]'); await c.tap('#v-list .mf2-row[data-man="7040301"] .mf2-dd'); await c.wait(500); } },
    { cap: tx('Click today’s: 7040301 on Truck 1, 3 of its 12 consols landed.'), read: S(tx('The header says its despatch date, its day and its truck, and how many consols have landed.'), tx('The report itself is read from the library as it opens.')),
      dev: 'The report is read on demand; the landed count comes from the truck in the dock projection (<b>landedMap()</b>).', ev: [R('GET', '/v1/store/1241/manifest/7040301', null, 'The whole report, as published: its consols and lines.')],
      run: async c => { focus(c); await c.tap('#v-list .mf2-row[data-man="7040301"]'); c.html('#v-list', page(LIST0, '7040301')); } },
    { cap: tx('Its size, and the work it takes one person.'), read: S(tx('Consols, cartons, keycodes and units; Est. work is the cartons at the store’s minutes per carton, in Settings › Store settings.'), tx('The bar splits the cartons into Home, Clothing and Kids.')),
      dev: 'Est. work is the cartons × minutes per carton (the truck’s, else the store’s, else 0.5): <b>explorer()</b>.', ev: [],
      run: async c => { focus(c, '#v-list .mf2-stats', '#v-list .mf2-roll'); await c.wait(1300); } },
    { cap: tx('A square for each consol: blue has landed, empty hasn’t yet.'), read: S(tx('Orange is being decanted, green is decanted, and a dashed one came over from the last truck.'), tx('The squares follow the dock as the pallets land.')),
      dev: 'Each consol’s square is its pallet’s state on the truck that carries the manifest (<b>landedMap()</b>).', ev: [],
      run: async c => { focus(c, '#v-list .mf2-lg'); await c.tap('#v-list .mf2-c[data-id="601930114"] .mf2-sq'); await c.wait(700); } },
    { cap: tx('Click a consol for its lines.'), read: S(tx('Each keycode with its product, its department, and its cartons and units.'), tx('Click it again to fold it away.')),
      dev: 'The lines are the report’s, as published; product names come from the catalogue.', ev: [],
      run: async c => { await c.tap('#v-list .mf2-c[data-id="601930107"]'); c.html('#v-list', page(LIST0, '7040301', { open: '601930107' })); focus(c, '#v-list .mf2-items'); } },
    { cap: tx('Search the manifest: a keycode finds every consol it is in.'), read: S(tx('Type a consol, a keycode, a product or a department.'), tx('A few matches open with the line marked.')),
      dev: 'The search filters <b>rows()</b> on this PC; nothing is sent.', ev: [],
      run: async c => { c.html('#v-list', page(LIST0, '7040301')); await c.tap('#v-list .mf2-q'); c.cls('#v-list .mf2-q', 'typed', true); c.text('#v-list .mf2-q .t', ''); await c.type('#v-list .mf2-q .t', '43307685'); c.html('#v-list', page(LIST0, '7040301', { q: '43307685', hit: '43307685' })); } },
    { cap: tx('Departments: what each micro-department brings, and how much of it has landed.'), read: S(tx('Click a department to paint its shelves on the map below, or Whole load heat for all of it.'), tx('Products lists every keycode the same way.')),
      dev: 'Rolled up from the report’s lines; the map is <b>mapCard()</b> in js/views/backdock/loads.js.', ev: [],
      run: async c => { await c.tap('#v-list .mf2-seg [data-tab="depts"]'); c.html('#v-list', page(LIST0, '7040301', { tab: 'depts' })); } },
    { cap: tx('Publish manifests: pick the report from the DC’s email.'), read: S(tx('The .xls is read on this PC first, and nothing is sent until you publish.'), tx('Here it is Truck 2’s report for this afternoon, 7040304.')),
      dev: '<b>previewManifest()</b> in js/views/backdock/mpreview.js reads the sheet with SheetJS and checks it with <b>manifestCheck()</b> in shared/manifest.js.', ev: [],
      run: async c => { await c.tap('#v-list .mf2-pub'); openSheet(c, preview()); } },
    { cap: tx('The preview names every micro-department, with its cartons.'), read: S(tx('Each by number and name, under the department it sits in.'), tx('Click one to open it: its products, with their units and cartons.')),
      dev: 'Departments is <b>microRows()</b> in js/views/backdock/mpreview.js: a carton counts for the micro-department with most units in it, so they add up to the manifest’s cartons. A row opens to its <b>detail()</b>.', ev: [],
      run: async c => { openSheet(c, preview()); await c.tap('.mf2-back .mf3-r[data-k="d:028"]'); openSheet(c, preview({ open: ['d:028'] })); } },
    { cap: tx('Products: every keycode on the report, the most units first.'), read: S(tx('Open one for the consols it is on, with its units and cartons in each.'), tx('A column head sorts by it; this PC keeps the view and the sort for next time.')),
      dev: 'Products is <b>productRows()</b>; the view and each sort are kept on this device (manifest_preview, <b>savePick()</b>).', ev: [],
      run: async c => { await c.tap('.mf2-back .mf3-seg [data-v="products"]'); openSheet(c, preview({ view: 'products' })); await c.wait(500); await c.tap('.mf2-back .mf3-r[data-k="p:42977641"]'); openSheet(c, preview({ view: 'products', open: ['p:42977641'] })); } },
    { cap: tx('Point at a product: its card, with the picture, keycode, name and price.'), read: S(tx('Click the name for its page on kmart.com.au, or the keycode to copy it.'), tx('On a phone, a tap opens the same card.')),
      dev: 'Names come from the product catalogue as their rows come into sight (<b>ensureNames()</b>); the card is <b>installProductCard()</b>, the links <b>itemName()</b> and <b>kcCopy()</b> in js/views/stockroom/common.js.', ev: [],
      run: async c => { openSheet(c, preview({ view: 'products', open: ['p:42977641'] })); await c.tap('.mf2-back .mf3-r[data-k="p:42977641"] .mf3-nm'); openSheet(c, preview({ view: 'products', open: ['p:42977641'], card: '42977641' })); } },
    { cap: tx('Click a pallet id: Consolidations opens on that consol, with its lines.'), read: S(tx('The filter holds its number: clear it to see every consol, the most cartons first.'), tx('Each lists its micro-departments with their cartons.')),
      dev: 'A pallet id is <b>jump()</b>: the view, the filter and the open row at once. The filter finds a keycode, product, department or pallet in the open view; this PC does it all, nothing is sent.', ev: [],
      run: async c => { openSheet(c, preview({ view: 'products', open: ['p:42977641'] })); await c.tap('.mf2-back .mf3-go[data-id="601941344"]'); openSheet(c, preview({ view: 'consols', open: ['c:601941344'], q: '601941344' })); await c.wait(900); await c.tap('.mf2-back .mf3-q .cl'); openSheet(c, preview({ view: 'consols', open: ['c:601941344'] })); } },
    { cap: tx('Groups: Home, Clothing and Kids, each department with its micro-departments.'), read: S(tx('Click a micro-department to see it under Departments, open.'), tx('The bar above splits the cartons the same way.')),
      dev: 'Groups is <b>groupRows()</b>, rolled up from the micro-departments; a micro-department goes to Departments with its row open (<b>jump()</b>).', ev: [],
      run: async c => { await c.tap('.mf2-back .mf3-seg [data-v="groups"]'); openSheet(c, preview({ view: 'groups' })); } },
    { cap: tx('The checks say it all read: Publish to the library.'), read: S(tx('A report for another store, or one too big, can’t be published until it is fixed.'), tx('A report from a day already gone asks for the day it came; today’s goes on its truck instead.')),
      dev: '<b>publishParsed()</b> posts the report; the worker keeps it whole and emits <b>manifest.publish</b> so every device lists it (<b>publishManifest()</b> in worker/store.js).',
      ev: [R('POST', '/v1/store/1241/manifest', { v: 1, kind: 'report', manNo: '7040304', storeNo: '1241', despatch: '24/10/2026', consols: '[10 consols]' }, 'The report, up to 8 MB; the worker answers with its counts.'),
        E('manifest.publish', 'backdock', { manNo: '7040304' }, { dcNo: '4101533', despatch: '24/10/2026', filename: 'Manifest Report 7040304.xls', consols: 10, totalCartons: 66, keycodes: 15 })],
      run: async c => { openSheet(c, preview({ view: 'groups', glow: 'side' })); await c.tap('.mf2-back .mf2-go'); closeSheet(c); c.html('#v-list', page(LIST1, '7040304')); toast(c, tx('Manifest {man} published · {consols} consols, {cartons} cartons', { man: '7040304', consols: 10, cartons: 66 })); } },
    { cap: tx('It waits under No day yet until Truck 2 takes it.'), read: S(tx('When Truck 2 lands, Receiving attaches it; the list then puts it on today, on Truck 2.'), tx('A report from a day gone takes its day here, under Came on.')),
      dev: 'With no truck, day or slot, <b>placeIndex()</b> has no place for it: it lists first, under No day yet.', ev: [],
      run: async c => { focus(c, '#v-list .mf2-wk.free', '#v-list .mf2-row[data-man="7040304"]'); await c.wait(1300); } },
  ],
  stories: [],
};

// ── What if a few days' reports were missed? ─────────────────────────
// Friday's and Saturday's trucks ran without a manifest; their reports come
// late, with a copy of Friday's in the pile.
manifests.stories.push({
  id: 'several', title: tx('What if a few days’ reports were missed?'), blurb: tx('Publish them all at once: each gets the day and truck it came on, and a report picked twice is held back.'),
  know: [tx('Publish manifests takes one report or several: pick them all in the file window.'), tx('Each row gets a day and truck to check: a truck the Planner or Receiving ran with no manifest near the despatch date, else the despatch date plus the store’s usual gap.'),
    tx('Change any day or truck on its row, or clear the day to leave a report under No day yet.'), tx('The same report twice in the pile: the second is unticked and says which file it matches.'),
    tx('A report already on a truck keeps that truck and says so; publishing one already in the library replaces the library copy.'), tx('Under No day yet, Give them days does the same for reports already published.')],
  html: () => frame(view('v-list', page(LIST0, '7040293'), true)),
  steps: [
    { cap: tx('Publish manifests, then pick the three reports together.'), read: S(tx('Here Friday’s and Saturday’s reports, and by mistake a second copy of Friday’s.'), tx('It reads every file before the table opens.')),
      dev: 'Several files go to <b>publishMany()</b> in js/views/backdock/mbatch.js; each is read and checked like a single one.', ev: [],
      run: async c => { await c.tap('#v-list .mf2-pub'); toast(c, tx('Reading {n} files…', { n: 3 })); openSheet(c, batch()); } },
    { cap: tx('Each one has the day and truck it came on, ready to check.'), read: S(tx('Friday’s and Saturday’s trucks ran without a manifest, so each report is offered its truck.'), tx('Change a day or a truck on its row if it came another way.')),
      dev: '<b>suggest()</b> works in despatch order so two reports never share a truck; each place comes from <b>suggestPlace()</b> in shared/manifeststats.js.', ev: [],
      run: async c => { openSheet(c, batch({ glow: 'came' })); await c.tap('.mf2-back tr[data-i="0"] .mf2-came2'); } },
    { cap: tx('The copy of Friday’s is held back, unticked.'), read: S(tx('The same manifest twice: the second file says which one it matches.'), tx('Nothing is published twice.')),
      dev: 'A second row with the same manifest number is locked before the table opens.', ev: [],
      run: async c => { openSheet(c, batch({ glow: 'twin' })); await c.tap('.mf2-back tr[data-i="2"] .chk'); } },
    { cap: tx('Publish 2 manifests: each goes to the library with its day.'), read: S(tx('Each row says Done as it goes.'), tx('Close once the list is checked.')),
      dev: 'For each row: <b>publishParsed()</b>, then <b>fileDay()</b> sends its day and truck.',
      ev: [R('POST', '/v1/store/1241/manifest', { manNo: '7040300', consols: '[11 consols]' }, 'Then 7040303 the same way.'), E('manifest.publish', 'backdock', { manNo: '7040300' }, { dcNo: '4101533', despatch: '22/10/2026', filename: 'Manifest Report 7040300.xls', consols: 11, totalCartons: 79, keycodes: 16 }),
        E('manifest.day', 'backdock', { manNo: '7040300' }, { day: '2026-10-23', truck: 1 }), E('manifest.publish', 'backdock', { manNo: '7040303' }, { dcNo: '4101533', despatch: '23/10/2026', filename: 'Manifest Report 7040303.xls', consols: 9, totalCartons: 63, keycodes: 15 }),
        E('manifest.day', 'backdock', { manNo: '7040303' }, { day: '2026-10-24', truck: 1 })],
      run: async c => { openSheet(c, batch()); await c.tap('.mf2-back .mf2-go'); openSheet(c, batch({ done: true })); toast(c, txn(2, '{n} manifest done', '{n} manifests done')); } },
    { cap: tx('Close: Friday’s and Saturday’s sit on their days, Came in.'), read: S(tx('The list and the stats count them on the day and truck they came on.'), tx('The first one opens, with its Came on set by hand.')),
      dev: 'A day set by hand is <b>manifest.day</b>; the explorer shows it under Came on (<b>cameOn()</b>).', ev: [],
      run: async c => { openSheet(c, batch({ done: true })); await c.tap('.mf2-back .mf2-close'); closeSheet(c); c.html('#v-list', page(LIST2, '7040300')); focus(c, '#v-list .mf2-row[data-man="7040300"]', '#v-list .mf2-row[data-man="7040303"]'); } },
  ],
});

// ── What if a manifest is on the wrong truck? ────────────────────────
// Saturday had two trucks; 7040303 came on the second.
manifests.stories.push({
  id: 'wrongtruck', title: tx('What if a manifest is on the wrong day or truck?'), blurb: tx('Open it and set Came on to the day and truck it really came on: the list and the stats follow.'),
  know: [tx('Came on is there for a report no truck here carried: a missed day published later, or one from before the dock used Conduit.'), tx('Change the day or the truck and Save; Clear takes the day off and it goes back under No day yet.'),
    tx('A report on a truck here takes its day from the truck, so it has no Came on.'), tx('One staged on a Planner slot sits on that slot’s day until a day is set here.'), tx('The day can’t be later than today.')],
  html: () => frame(view('v-list', page(LIST2, '7040300'), true)),
  steps: [
    { cap: tx('Open 7040303: it came on Saturday’s Truck 2, not Truck 1.'), read: S(tx('Came on shows the day and truck it has now, set by hand.'), tx('Saturday had two trucks; this report was the second one’s.')),
      dev: 'Came on is <b>cameOn()</b>, for any report whose place is not a truck.', ev: [],
      run: async c => { await c.tap('#v-list .mf2-row[data-man="7040303"]'); c.html('#v-list', page(LIST2, '7040303')); glow(c, '#v-list .mf2-came'); } },
    { cap: tx('Pick Truck 2, then Save.'), read: S(tx('It moves to Truck 2 at once, in the list and in the stats.'), tx('Every device sees the change.')),
      dev: 'Save sends <b>manifest.day</b> with the day and the truck; a report on a truck here is refused (<b>on_truck</b>).', ev: [E('manifest.day', 'backdock', { manNo: '7040303' }, { day: '2026-10-24', truck: 2 })],
      run: async c => { await c.tap('#v-list .mf2-came .sel'); c.html('#v-list .mf2-came .sel .val', tx('Truck {no}', { no: 2 })); await c.tap('#v-list .mf2-came .mf2-save'); c.html('#v-list', page(LIST3, '7040303'));
        toast(c, tx('{man}: came on {day}', { man: '7040303', day: `${fmtDay('2026-10-24')} · ${tx('Truck {no}', { no: 2 })}` })); } },
    { cap: tx('One that came on a truck here has no Came on: its truck says when.'), read: S(tx('7040298 was on Thursday’s Truck 1, so its header says so.'), tx('Its squares are its pallets on that truck, all decanted.')),
      dev: '<b>manifest.day</b> for a report on a truck is refused: its truck says when it came.', ev: [],
      run: async c => { await c.tap('#v-list .mf2-row[data-man="7040298"]'); c.html('#v-list', page(LIST3, '7040298')); glow(c, '#v-list .mf2-dh'); } },
  ],
});

// ── What if you want the month? (mstats.js) ──────────────────────────
// The week and October so far, with every report of the week in.
const DOW = () => [tx('Mon'), tx('Tue'), tx('Wed'), tx('Thu'), tx('Fri'), tx('Sat'), tx('Sun')];
const dow = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
const n0 = x => Math.round(x || 0).toLocaleString();
const WEEK = { from: '2026-10-19', to: '2026-10-25', per: 'week', t: { manifests: 9, trucks: 9, days: 7, consols: 93, cartons: 640, units: 3746, keycodes: 24 }, p: { consols: 69, cartons: 479, units: 2837 }, newKc: 8,
  byDay: { '2026-10-19': 75, '2026-10-20': 84, '2026-10-21': 101, '2026-10-22': 100, '2026-10-23': 79, '2026-10-24': 63, '2026-10-25': 138 },
  depts: [['047', 57], ['006', 55], ['028', 51], ['072', 48], ['025', 46], ['024', 42], ['038', 41], ['004', 40], ['065', 37], ['040', 36], ['087', 32], ['074', 32], ['091', 30], ['067', 30], ['015', 30], ['054', 11], ['022', 10], ['085', 8], ['090', 4]],
  top: [['43170264', 252, 48], ['43339981', 252, 30], ['43610017', 246, 30], ['43226605', 230, 40], ['42981102', 227, 43], ['43310045', 220, 34], ['43610033', 216, 32], ['43610025', 214, 36], ['43604471', 208, 30], ['43561290', 197, 49], ['43118843', 196, 30], ['43201187', 194, 46], ['42977641', 189, 29], ['43610041', 187, 37], ['43305518', 168, 22]],
  fresh: [['43166022', 66], ['43602218', 64], ['110148905', 64], ['43302210', 63], ['43307685', 55], ['42977636', 48], ['43444444', 30], ['43199310', 22]],
  reg: [['43170264', 8, 252], ['43339981', 8, 252], ['43226605', 8, 230], ['43310045', 8, 220], ['43610033', 8, 216], ['43610025', 8, 214], ['43604471', 8, 208], ['43201187', 8, 194], ['43610041', 8, 187], ['43447720', 8, 138]] };
// [manNo, day, truck, consols, cartons, units, keycodes]: the reports in the period, the dock's day for each (7040304 on its despatch day + 1).
const MLIST = [['7040258', '2026-10-01', 1, 12, 84, 490, 16], ['7040262', '2026-10-05', 1, 10, 73, 423, 15], ['7040266', '2026-10-08', 1, 9, 63, 387, 14], ['7040270', '2026-10-10', 1, 11, 73, 445, 16], ['7040280', '2026-10-12', 1, 11, 80, 478, 16], ['7040282', '2026-10-13', 1, 9, 61, 375, 14],
  ['7040284', '2026-10-14', 1, 13, 87, 499, 16], ['7040285', '2026-10-14', 2, 6, 42, 248, 11], ['7040287', '2026-10-15', 1, 12, 84, 520, 16], ['7040289', '2026-10-16', 1, 10, 72, 414, 15], ['7040291', '2026-10-17', 1, 8, 53, 303, 13], ['7040293', '2026-10-19', 1, 10, 75, 447, 15],
  ['7040295', '2026-10-20', 1, 12, 84, 484, 16], ['7040296', '2026-10-21', 1, 9, 61, 369, 15], ['7040297', '2026-10-21', 2, 6, 40, 260, 12], ['7040298', '2026-10-22', 1, 14, 100, 598, 16], ['7040300', '2026-10-23', 1, 11, 79, 429, 16], ['7040303', '2026-10-24', 2, 9, 63, 357, 15],
  ['7040301', DAY, 1, 12, 72, 412, 8], ['7040304', DAY, null, 10, 66, 390, 15]];
const MONTH = { from: '2026-10-01', to: '2026-10-31', per: 'month', t: { manifests: 20, trucks: 20, days: 17, consols: 204, cartons: 1412, units: 8328, keycodes: 24 }, p: null, newKc: 24,
  byDay: Object.fromEntries(Object.entries(MLIST.reduce((m, r) => { m[r[1]] = (m[r[1]] || 0) + r[4]; return m; }, {}))),
  depts: [['028', 144], ['006', 117], ['047', 116], ['040', 100], ['072', 96], ['004', 94], ['065', 93], ['025', 90], ['038', 83], ['024', 80], ['067', 78], ['091', 74], ['015', 74], ['074', 74], ['087', 66], ['054', 11], ['022', 10], ['085', 8], ['090', 4]],
  top: [['43610025', 604, 100], ['43339981', 594, 78], ['43310045', 550, 76], ['43610017', 548, 74], ['43610041', 525, 93], ['43118843', 522, 74], ['43226605', 520, 94], ['42981102', 518, 102], ['43170264', 512, 96], ['42977641', 508, 86], ['43610033', 498, 66], ['43561290', 481, 111], ['43201187', 434, 90], ['43604471', 414, 68], ['43305518', 346, 58]],
  fresh: [['43610025', 604], ['43339981', 594], ['43310045', 550], ['43610017', 548], ['43610041', 525], ['43118843', 522], ['43226605', 520], ['42981102', 518], ['43170264', 512], ['42977641', 508]],
  reg: [['43610025', 19, 604], ['43310045', 19, 550], ['43339981', 18, 594], ['43610017', 18, 548], ['43610041', 18, 525], ['43118843', 18, 522], ['43226605', 18, 520], ['42981102', 18, 518], ['43170264', 18, 512], ['43201187', 18, 434]] };
const PERIODS = () => [['week', tx('Week')], ['fortnight', tx('Fortnight')], ['month', tx('Month')], ['all', tx('All time')]];
const card = (title, note, body, extra = '', cls = '') => `<div class="pc2-card mf2-sc${cls ? ' ' + cls : ''}"><div class="ch"><h3>${title}</h3><span class="dim">${note}</span>${extra}</div>${body}</div>`;
function sTiles(s) {
  const t = s.t, p = s.p, work = Math.round(t.cartons * 0.5);
  const delta = k => { if (!p || !p[k]) return ''; const d = Math.round((t[k] - p[k]) / p[k] * 100); return `<small class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)}% ${tx('vs the week before')}</small>`; };
  const tl = (k, v, note) => `<div class="pc2-card mf2-kpi"><span>${k}</span><b>${v}</b>${note || ''}</div>`;
  return `<div class="mf2-kpis">${tl(tx('Manifests'), n0(t.manifests), `<small>${txn(t.trucks, '{n} truck', '{n} trucks')} · ${txn(t.days, '{n} day', '{n} days')}</small>`)}` +
    tl(tx('Cartons'), n0(t.cartons), delta('cartons') || `<small>${tx('{n} a delivery day', { n: n0(t.cartons / t.days) })}</small>`) +
    tl(tx('Units'), n0(t.units), delta('units') || `<small>${tx('{n} units a carton', { n: (t.units / t.cartons).toFixed(1) })}</small>`) + tl(tx('Consols'), n0(t.consols), delta('consols')) +
    tl(tx('Keycodes'), n0(t.keycodes), `<small>${tx('{n} new', { n: n0(s.newKc) })}</small>`) + tl(tx('Est. decant'), hm(work), `<small>${tx('{mpc} min/ctn · one person', { mpc: 0.5 })}</small>`) + '</div>';
}
// Cartons by day (mstats.js chart()), drawn as the app draws it.
function sChart(s) {
  const list = []; for (let x = s.from; x <= s.to; x = addDays(x, 1)) list.push([x, s.byDay[x] || 0]);
  const W = 760, H = 190, P = 24, bw = (W - P * 2) / list.length, max = Math.max(1, ...list.map(b => b[1])), every = Math.ceil(list.length / 16), span = list.length;
  const label = k => span <= 14 ? `${DOW()[dow(k)]} ${Number(k.slice(8))}` : fmtDate(k);
  const bars = list.map(([k, v], i) => { const h = v / max * (H - 42); return `<rect x="${(P + i * bw + 2).toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${Math.max(v ? 1 : 0, h).toFixed(1)}" rx="2"/>` +
    (v ? `<text class="vl" x="${(P + i * bw + bw / 2).toFixed(1)}" y="${(H - 26 - h).toFixed(1)}" text-anchor="middle">${n0(v)}</text>` : '') + (i % every === 0 ? `<text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle"${k === DAY ? ' class="now"' : ''}>${label(k)}</text>` : ''); }).join('');
  return card(tx('Cartons by day'), tx('the day each manifest came on'), `<svg class="mf2-chart" viewBox="0 0 ${W} ${H}" aria-hidden="true">${bars}</svg>`, '', 'chart');
}
function sWeekdays(s) {
  const w = DOW().map(() => ({ c: 0, d: 0 }));
  for (const [d, c] of Object.entries(s.byDay)) { w[dow(d)].c += c; w[dow(d)].d++; }
  const max = Math.max(...w.map(x => x.c)), top = w.indexOf(w.reduce((a, b) => b.c > a.c ? b : a));
  return card(tx('By weekday'), tx('cartons, and the days with a delivery'), w.map((x, i) => `<div class="mf2-wd${i === top ? ' mx' : ''}"><b>${DOW()[i]}</b><div><i style="width:${Math.round(x.c / max * 100)}%"></i></div><span>${tx('<b>{n}</b> ctn', { n: n0(x.c) })} <small>${x.d ? `${txn(x.d, '{n} day', '{n} days')} · ${tx('{n} a day', { n: n0(x.c / x.d) })}` : tx('none')}</small></span></div>`).join(''), '', 'wd');
}
function sDepts(s) {
  const total = s.depts.reduce((n, d) => n + d[1], 0), gc = {}; for (const [d, c] of s.depts) gc[groupOf(d)] = (gc[groupOf(d)] || 0) + c;
  const rl = `<div class="mf2-roll st">${GROUPS.filter(g => gc[g[0]]).map(g => `<span style="flex:${gc[g[0]]};background:${g[2]}">${gc[g[0]] / total > 0.08 ? `${g[1]} ${Math.round(gc[g[0]] / total * 100)}%` : ''}</span>`).join('')}</div>`;
  const rows = s.depts.slice(0, 14).map(([d, c]) => `<div class="mf2-cr"><span>${dep(subOf(d))}</span><span class="nm">${nameOf(d)}</span><span class="bar"><i style="width:${Math.max(2, Math.round(c / total * 100))}%"></i></span><b>${n0(c)}</b><small>${Math.round(c / total * 100)}%</small></div>`).join('');
  return card(tx('Departments'), tx('cartons by department'), rl + rows + `<p class="dim">${txn(s.depts.length - 14, '{n} more department', '{n} more departments')}</p>`, btn('layers', tx('Show on map'), 'sm r'), 'dp');
}
const prow = (k, i, tail) => `<div class="mf2-tp"><b>${i + 1}</b><span class="kc mono">${k}</span>${kname(k)}${dep(subOf(KDEPT[k]))}<span class="n">${tail}</span></div>`;
const sProducts = s => card(tx('Top products'), tx('by units'), s.top.map(([k, u, c], i) => prow(k, i, `${tx('{n} units', { n: n0(u) })} <small>${tx('{n} ctn', { n: n0(c) })}</small>`)).join(''), '', 'tp') +
  card(tx('New this period'), txn(s.newKc, '{n} keycode never on an earlier manifest', '{n} keycodes never on an earlier manifest', { n: n0(s.newKc) }), s.fresh.map(([k, u], i) => prow(k, i, tx('{n} units', { n: n0(u) }))).join(''), '', 'fr') +
  card(tx('Keeps coming'), tx('on the most manifests'), s.reg.map(([k, n, u], i) => prow(k, i, `${txn(n, 'on {n} manifest', 'on {n} manifests')} <small>${tx('{n} units', { n: n0(u) })}</small>`)).join(''), '', 'kpc');
function sReports(s) {
  const list = MLIST.filter(r => r[1] >= s.from && r[1] <= s.to).sort((a, b) => a[1].localeCompare(b[1]) || (a[2] || 9) - (b[2] || 9)), big = list.reduce((a, b) => b[4] > a[4] ? b : a), busy = Object.entries(s.byDay).sort((a, b) => b[1] - a[1])[0];
  const rows = list.slice().reverse().map(([no, d, t, n, c, u, k]) => `<tr data-man="${no}"><td>${fmtDay(d)}</td><td>${t ? tx('Truck {no}', { no: t }) : '<span class="dim">—</span>'}</td><td class="mono"><b>${no}</b>${t ? '' : ` ${pill(tx('estimated'))}`}</td><td class="n">${n}</td><td class="n">${c}</td><td class="n">${n0(u)}</td><td class="n">${k}</td></tr>`).join('');
  return card(tx('Manifests in this period'), txn(list.length, '{n} manifest', '{n} manifests'), `<div class="mf2-facts2"><span>${tx('Busiest day <b>{day}</b> · {n} cartons', { day: fmtDay(busy[0]), n: busy[1] })}</span><span>${tx('Biggest manifest <b>{man}</b> · {n} cartons', { man: big[0], n: big[4] })}</span></div>` +
    `<p class="dim">${txn(1, '{n} manifest has no day on file, so it counts on its despatch date. Give it its day under No day yet in the list.', '{n} manifests have no day on file, so they count on their despatch date. Give them their days under No day yet in the list.')}</p>` +
    `<table class="mf2-t ms"><thead><tr><th>${tx('Day')}</th><th>${tx('Truck')}</th><th>${tx('Manifest')}</th><th class="n">${tx('Consols')}</th><th class="n">${tx('Cartons')}</th><th class="n">${tx('Units')}</th><th class="n">${tx('Keycodes')}</th></tr></thead><tbody>${rows}</tbody></table>`, '', 'rpt');
}
function statsPage(s) {
  const name = s.per === 'month' ? fmtMonth(s.from) : tx('This week · {range}', { range: `${fmtDate(s.from)} – ${fmtDate(s.to)}` });
  const rp = retailPeriod(s.from) + (retailPeriod(s.to) !== retailPeriod(s.from) ? ' – ' + retailPeriod(s.to) : '');
  const bar = `<div class="mf2-msbar"><span class="mf2-seg">${PERIODS().map(([k, l]) => `<b class="${s.per === k ? 'on' : ''}" data-p="${k}">${l}</b>`).join('')}</span><span class="pills"><b>‹</b><b class="on">${tx('Now')}</b><b class="off">›</b></span><b class="nm">${name}</b><span class="dim">${rp}</span></div>`;
  return `<div class="mf2-pg">${gtabs(TABS(), 'manifests')}${head(LIST4.length, 'stats')}${bar}${sTiles(s)}<div class="mf2-msg"><div>${sChart(s)}${s.per !== 'week' ? sWeekdays(s) : ''}${sDepts(s)}${mapCard()}</div><div>${sProducts(s)}</div></div>${sReports(s)}</div>`;
}
const scroll = (c, y) => c.style('#v-st .mf2-pg', 'transform', y ? `translateY(-${y}px)` : '');
manifests.stories.push({
  id: 'month', title: tx('What if you want to see the month?'), blurb: tx('Stats adds up every report: a week, a fortnight, a month or all time, against the period before.'),
  know: [tx('Stats counts each report on the day it came: its truck, a day set by hand or its Planner slot, else its despatch date plus the usual gap, marked estimated.'), tx('Each period compares with the one before it; with nothing to compare, the tiles show a delivery day’s cartons and the units a carton instead.'),
    tx('‹ and › step back and forth a period; Now comes back.'), tx('By weekday shows which days carry the load, for a fortnight or longer.'),
    tx('Show on map paints the period’s departments on the store map.'), tx('Click a manifest in the table to open it in the list.')],
  html: () => frame(view('v-list', page(LIST4, '7040303'), true) + view('v-st', statsPage(WEEK), false)),
  steps: [
    { cap: tx('Stats: this week against the week before.'), read: S(tx('Manifests, cartons, units, consols, keycodes and the decant they make, with how they compare.'), tx('Cartons by day, the departments, the top products and what came for the first time.')),
      dev: '<b>statsPane()</b> in js/views/backdock/mstats.js; the worker adds up every report’s summary (<b>manifestStats()</b> in shared/manifeststats.js).', ev: [R('GET', '/v1/store/1241/manifests/stats?from=2026-10-19&to=2026-10-25', null, 'This week and the week before, from every report’s summary.')],
      run: async c => { await c.tap('#v-list .mf2-seg.big [data-v="stats"]'); c.view('v-st'); scroll(c, 0); } },
    { cap: tx('New this period: keycodes never on an earlier manifest.'), read: S(tx('Here the eight on today’s 7040301.'), tx('Keeps coming lists the ones on the most manifests.')),
      dev: 'A keycode is new when no report before the period carried it.', ev: [],
      run: async c => { scroll(c, 180); focus(c, '#v-st .mf2-sc.fr'); await c.tap('#v-st .mf2-sc.fr .mf2-tp'); await c.wait(500); } },
    { cap: tx('Month: October so far, a bar for each delivery day.'), read: S(tx('With nothing in September to compare, the tiles show a delivery day’s cartons and the units a carton.'), tx('By weekday appears for a fortnight or longer.')),
      dev: '<b>rangeOf()</b> gives the month; the chart is <b>chart()</b>, by day up to two months.', ev: [R('GET', '/v1/store/1241/manifests/stats?from=2026-10-01&to=2026-10-31', null, 'October, and the 31 days before it.')],
      run: async c => { await c.tap('#v-st .mf2-msbar [data-p="month"]'); c.html('#v-st', statsPage(MONTH)); scroll(c, 0); } },
    { cap: tx('By weekday: Thursdays bring the most.'), read: S(tx('The cartons on each weekday, the days with a delivery, and what a day brings.'), tx('Below, the departments for the month.')),
      dev: '<b>weekdays()</b> adds the cartons by weekday; the top one is orange.', ev: [],
      run: async c => { scroll(c, 560); focus(c, '#v-st .mf2-wd.mx'); await c.tap('#v-st .mf2-wd.mx'); await c.wait(500); } },
    { cap: tx('At the foot, every manifest in the month.'), read: S(tx('The busiest day and the biggest manifest, then each report with its day and truck.'), tx('7040304 has no day yet, so it counts as estimated.')),
      dev: 'The table is <b>reports()</b>; a row opens that manifest in the list.', ev: [],
      run: async c => { scroll(c, 1960); focus(c, '#v-st tr[data-man="7040304"]'); await c.tap('#v-st tr[data-man="7040304"] .mf2-st'); await c.wait(500); } },
  ],
});

// ── Trucks not coming to the dock: the Planner and the off-site register ──
// The Plan row's Planner (js/views/backdock/planner.js) and Off-site pallets
// (offsite.js), with the sheets of routes.js and callback.js. The week: a
// closed truck a day with what its record kept (Saturday had two; Friday's
// and Saturday's ran without a manifest), Thursday's Truck 2 diverted to
// 1187 Bunbury with its report 7040299, today's Truck 1 on the dock and
// Truck 2 planned for 13:30 with 7040304 staged on it. There is no room for
// it: it goes to the storage yard, due back Tuesday, and is called back on
// Tuesday's Truck 1.
const MONS = () => [tx('Jan'), tx('Feb'), tx('Mar'), tx('Apr'), tx('May'), tx('Jun'), tx('Jul'), tx('Aug'), tx('Sep'), tx('Oct'), tx('Nov'), tx('Dec')];
const dParts = iso => { const d = new Date(iso + 'T00:00:00Z'); return { d: d.getUTCDate(), mon: MONS()[d.getUTCMonth()] }; };
// "Sun 25 Oct" and "25 Oct" as the Planner writes them (dayLabel(), dateLabel()).
const dayLabel = (iso, dw = DOW()[dow(iso)]) => tx('{dow} {d} {mon}', { dow: dw, ...dParts(iso) });
const dateLabel = iso => tx('{d} {mon}', dParts(iso));
const BACK = '2026-10-27';   // the day 7040304 lands here after all, and is called back
const RT2 = () => ({ route: 'offsite', lands: BACK, to: 'the storage yard', reason: tx('No room on the dock'), man: '7040304' });
const RT299 = () => ({ route: 'diverted', lands: null, to: '1187 Bunbury', reason: tx('DC asked'), man: '7040299' });
// The tags (routeTag(), backTag(), groupTag(), partTag()) and the line under a route (routeLine()).
const rtag = r => r.route === 'offsite' ? `<span class="mf3-rt off">${ai('stack')}${tx('Off-site · lands {day}', { day: fmtDay(r.lands) })}</span>`
  : `<span class="mf3-rt div">${ai('route')}${tx('Diverted → {to}', { to: r.to })}</span>`;
const rline = r => [r.route === 'offsite' ? tx('Went to off-site storage at {to}', { to: r.to }) : tx('Went to {to}', { to: r.to }), r.reason].join(' · ');
// Where it goes in a manifest's detail (whereBar() in manifests.js), for one routed.
const where = r => `<div class="mf3-where ${r.route}"><span class="cl">${ai(r.route === 'offsite' ? 'stack' : 'route')}${tx('Where it goes')}</span>${rtag(r)}<small>${rline(r)}</small>${btn('edit', tx('Change'), 'sm')}</div>`;
// The Manifests list with the two routed reports, each on the day it was due.
const mkR = (m, rt) => ({ ...m, st: rt.route, rt });
const LISTR = () => [...LIST0, mkR({ ...mk(M304), day: DAY, truck: 2 }, RT2()), mkR(mk(['7040299', '2026-10-22', 2, '', 38, 6]), RT299())];

// ── the Planner's week, F.2 (planner.js: daysCard(), trucksCard(), cellHtml(), cellBody(); the side) ──
// The days card (each day's status, a thin bar per truck, its cartons) above
// the trucks card (one row per truck number, every cell the same size and
// naming its truck), and beside them the editor, Manifests without a slot,
// Off-site to call back and the week roster, folded. Classes start pw2-.
// A closed truck, from its record: [truck, manifest, minutes to clear, cartons, ctn/h]; the crew was D4, D7 and D9.
const HIST = { '2026-10-19': [[1, '7040293', 118, 75, 38]], '2026-10-20': [[1, '7040295', 132, 84, 38]], '2026-10-21': [[1, '7040296', 101, 61, 36], [2, '7040297', 69, 40, 35]],
  '2026-10-22': [[1, '7040298', 158, 100, 38]], '2026-10-23': [[1, null, 124, 79, 38]], '2026-10-24': [[1, null, 82, 51, 37], [2, null, 99, 63, 38]] };
const wkDays = mon => Array.from({ length: 7 }, (_, i) => addDays(mon, i));
const mins = m => hm(Math.round(m));
const pst = (text, tone = '', icon = '') => `<span class="pw2-st${tone ? ' ' + tone : ''}">${icon ? ai(icon) : ''}${text}</span>`;
const ln = (cls, html) => html ? `<span class="${cls}">${html}</span>` : '';
const tk = n => `<span class="pw2-tk">${ai('truck')}${tx('Truck {no}', { no: n })}</span>`;
// The chips of a truck not coming to the dock (routeTag() in routes.js) and the line under it (routeLine()).
const rchip = r => r.route === 'offsite' ? pst(tx('Off-site · lands {day}', { day: fmtDay(r.lands) }), 'warn', 'stack') : pst(tx('Diverted → {to}', { to: r.to }), '', 'route');
// One truck number on one day: { n, kind: closed | live | planned | routed, … } (cellOf()).
function cellsOn(k, p) {
  if (p.week) return k === BACK && p.called ? [{ n: 1, kind: 'planned', man: '7040304', eta: '10:00', ctn: 66, back: true }] : [];
  const out = (HIST[k] || []).map(([n, man, m, ctn, rate]) => ({ n, kind: 'closed', man, m, ctn, rate }));
  if (k === '2026-10-22') out.push({ n: 2, kind: 'routed', rt: RT299() });
  if (k === DAY) out.push({ n: 1, kind: 'live', man: '7040301', ctn: 72 }, p.routed ? { n: 2, kind: 'routed', rt: RT2() } : { n: 2, kind: 'planned', man: '7040304', eta: '13:30', ctn: 66 });
  return out;
}
// The inside of a cell (cellBody()).
function body(c) {
  if (c.kind === 'closed') return `<b class="pw2-man dim">${c.man || tx('No manifest')}</b>` + ln('pw2-ok', `${ai('check')}${tx('Cleared in {time}', { time: mins(c.m) })}`) +
    ln('pw2-l2', [tx('{n} ctn', { n: c.ctn }), tx('{n} crew', { n: 3 }), tx('{n} ctn/h', { n: c.rate })].join(' · '));
  if (c.kind === 'routed') return `<b class="pw2-man dim">${c.rt.man}</b>${rchip(c.rt)}` + ln('pw2-l2', rline(c.rt)) + ln('pw2-need', tx('Not coming to the dock'));
  if (c.kind === 'live') return `<b class="pw2-man">${c.man}</b><span class="pw2-phx">${pst(tx('truck phase::Receiving'), 'warn')}${ln('pw2-l1', [tx('from {time}', { time: '05:40' }), tx('{n} crew', { n: 3 })].join(' · '))}</span>` +
    ln('pw2-l2', tx('Receiving · {n} pallets', { n: 2 })) + ln('pw2-need warn', tx('landed {time} · layout not confirmed', { time: '05:40' }));
  // planned: the week roster is its crew; ready, so its dot is green.
  return `<div class="pw2-mh"><b class="pw2-man">${c.man}</b><i class="pw2-dot good"></i></div>` + ln('pw2-l1', [tx('ETA {time}', { time: c.eta }), tx('{n} crew', { n: 3 })].join(' · ')) +
    (c.back ? pst(tx('From off-site · sent {day}', { day: fmtDay(DAY) }), 'info', 'undo') : ln('pw2-l2', tx('{n} ctn', { n: c.ctn })));
}
// A day's row of the days card (band()), its bars (segOf()) and its tag.
function band(k, cells) {
  const real = cells.filter(c => c.kind !== 'routed'), closed = real.filter(c => c.kind === 'closed'), past = k < DAY;
  if (!real.length) return { big: '—', sub: tx('Not planned'), ink: 'faint' };
  if (past) { const avg = closed.reduce((n, c) => n + c.m, 0) / closed.length;
    return { big: tx('{n}c', { n: closed.reduce((n, c) => n + c.ctn, 0) }), what: tx('decanted'), sub: `${tx('{k} of {n} cleared', { k: closed.length, n: real.length })} · ${mins(avg)}`, ink: 'dim' }; }
  return { big: tx('{n}c', { n: real.reduce((n, c) => n + c.ctn, 0) }), what: tx('manifested'), sub: tx('Ready'), ink: '' };
}
const seg = c => ({ closed: 'done', live: 'live', planned: 'done', routed: 'none' })[c.kind];
function daysCard(keys, p) {
  return `<section class="pw2-days">${keys.map((k, i) => {
    const cells = cellsOn(k, p), b = band(k, cells), cls = `${k === DAY ? ' today' : ''}${k < DAY ? ' past' : ''}`, at = `--wc:${i + 1}`;
    const tag = k === DAY ? `<em class="today">${tx('Today')}</em>` : k < DAY ? `<em class="done">${tx('Done')}</em>` : '';
    return `<div class="pw2-h${cls}${i ? '' : ' c1'}" style="${at}"><span class="pw2-dl">${DOW()[dow(k)]}<b>${Number(k.slice(8))}</b>${tag}</span><span class="pw2-bars">${cells.map(c => `<i class="${seg(c)}"></i>`).join('')}</span></div>` +
      `<div class="pw2-b${cls}${i ? '' : ' c1'}" style="${at}"><span class="pw2-big"><b class="${b.ink}">${b.big}</b>${b.what ? ' ' + b.what : ''}</span><span class="pw2-bs">${b.sub}</span></div>`;
  }).join('')}</section>`;
}
// The trucks card: three rows and the short fourth (cellHtml()); a day with no trucks fills its column (spanHtml()).
function trucksCard(keys, p) {
  return `<section class="pw2-trucks">${keys.map((k, i) => {
    const cells = cellsOn(k, p), c1 = i ? '' : ' c1', td = k === DAY ? ' today' : '';
    if (!cells.length) return `<div class="pw2-c pw2-span pw2-unpl${c1}" style="--wc:${i + 1};--wr:1;--ws:4"><span class="pw2-ring">${ai('cal')}</span><b>${tx('Not planned yet')}</b><span>${tx('Plan a truck, or confirm there are none.')}</span>` +
      `<span class="pw2-btn add">+ ${tx('Truck {no}', { no: 1 })}</span><span class="pw2-btn ok">${ai('check')}${tx('Confirm no trucks')}</span><span class="pw2-lnk">${ai('route')}${tx('Off-site or diverted…')}</span></div>`;
    const add = [1, 2, 3, 4].find(n => !cells.some(c => c.n === n));
    return [1, 2, 3, 4].map(r => {
      const c = cells.find(x => x.n === r), at = `--wc:${i + 1};--wr:${r}`, cl = `${c1}${r === 1 ? ' r1' : ''}${td}`;
      if (c) { const id = `${k}-${r}`; return `<div class="pw2-c pw2-${c.kind}${cl}${p.sel === id ? ' on' : ''}" style="${at}" data-slot="${id}">${tk(r)}${body(c)}</div>`; }
      return r === add ? `<div class="pw2-c pw2-addc${cl}" style="${at}"><span class="pw2-add">+ ${tx('Truck {no}', { no: r })}</span></div>` : `<div class="pw2-c${cl}" style="${at}"></div>`;
    }).join('');
  }).join('')}</section>`;
}
// The side: the editor (editorCard(), editorParts()), Manifests without a slot (waiting()), Off-site to call back (offsiteCard()) and the roster (roster()).
const row = (label, html) => `<div class="pw2-fl">${label}</div><div class="pw2-fv">${html}</div>`;
const pin = (t, cls = '') => `<span class="pw2-in${cls ? ' ' + cls : ''}">${t}</span>`;
const sbtn = (icon, label, cls = '') => `<span class="pw2-bt${cls ? ' ' + cls : ''}">${icon ? ai(icon) : ''}${label}</span>`;
function editorCard(p) {
  if (!p.sel) return `<div class="pc2-card pw2-ed"><div class="ch"><h3>${tx('Pick a truck')}</h3></div><div class="pw2-empty">${ai('truck')}<p>${tx('Click a slot to set its ETA, manifest and decant team, or + Truck on a day to plan one.')}</p></div></div>`;
  const head = `<div class="ch"><h3>${tx('Truck {no} · {day}', { no: 2, day: dayLabel(DAY) })}</h3></div>`, man = tx('{consols} consols · {cartons} cartons', { consols: 10, cartons: 66 });
  if (p.routed) return `<div class="pc2-card pw2-ed">${head}<div class="pw2-form">${row(tx('Where it goes'), `${rchip(RT2())}<span class="dim">${rline(RT2())}</span>`)}${row(tx('Manifest'), `<b>7040304</b><span class="dim">${man}</span>`)}</div>` +
    `<p class="pw2-lbl">${tx('Expected here on {day}: the Planner shows it that day, with Plan it.', { day: fmtDate(BACK) })}</p><div class="pw2-acts">${sbtn('edit', tx('Change where it goes'), 'pri')}${sbtn('truck', tx('Receive here'))}${sbtn('', tx('Remove truck'))}</div></div>`;
  return `<div class="pc2-card pw2-ed">${head}<div class="pw2-form">` +
    row(tx('ETA'), pin('13:30', 'eta')) +
    row(tx('Manifest'), `<div class="pw2-man2"><b>7040304</b><span class="dim">${man}</span><span class="pw2-lnk">${tx('Remove')}</span></div><div class="pw2-man2">${pin(`<span>${tx('Every report is on a truck or staged: choose one below')}</span>${ai('chev', 'dn')}`, 'sel')}${sbtn('', tx('Stage'), 'sm')}</div>`) +
    row(tx('Decant team'), `<div class="pw2-team">${pin('D4', 'ph mono')}<span class="pw2-ib">${ai('plus')}</span></div><span class="dim">${tx('D-numbers only: no names are kept on the dock.')}</span>`) +
    row(tx('Huddle · break'), `<span class="pw2-pair">${pin('0', 'ph mono n')}<span class="dim">${tx('min huddle')}</span>${pin('0', 'ph mono n')}<span class="dim">${tx('min team break')}</span></span>`) +
    row(tx('Note'), pin(tx('Anything the dock should know'), 'ph wide')) +
    row(tx('Where it goes'), `<span class="pw2-pair">${pst(tx('Receive here'), 'good', 'truck')}${sbtn('route', tx('Off-site or diverted…'), 'sm pw2-route')}</span><span class="dim">${tx('Not coming to the dock? Mark it off-site or diverted, with the day it lands here after all.')}</span>`) +
    `</div><div class="pw2-acts">${sbtn('check', tx('Save'), 'pri')}${sbtn('', tx('Remove truck'))}</div></div>`;
}
const waitCard = () => `<div class="pc2-card pw2-wait"><div class="ch"><h3>${tx('Manifests without a slot')}</h3></div><div class="pw2-empty">${ai('check')}<p>${tx('Every published manifest has a truck.')}</p></div></div>`;
function offCard(p) {
  if (!p.routed) return '';
  const day = tx('{day}, Truck {no}', { day: fmtDay(BACK), no: 1 });
  return `<div class="pc2-card pw2-ofc"><div class="ch"><h3>${tx('Off-site, to call back')}</h3><span class="dim">${txn(10, '{n} pallet', '{n} pallets')}</span></div>` +
    `<div class="pw2-ofr${p.called ? ' called' : ''}"><div class="t"><b class="mono">7040304</b><small>${tx('sent {day} · {pallets}', { day: fmtDay(DAY), pallets: txn(10, '{n} pallet', '{n} pallets') })}</small>` +
    `<span class="pl">${p.called ? tx('Called back: {when}', { when: day }) : tx('Due back {day}', { day: fmtDay(BACK) })}</span></div>${p.called ? sbtn('', tx('Open'), 'sm') : sbtn('undo', tx('Call back'), 'sm')}</div>${sbtn('stack', tx('Off-site pallets'), 'sm all')}</div>`;
}
const rosterCard = () => `<div class="pc2-card pw2-ros"><b>${tx('Week roster')}</b><span>D4 · D7 · D9</span><em>${tx('{n} on', { n: 3 })}</em>${ai('chev')}</div>`;
// p: week (0 this week, 1 next), sel (the truck open: '2026-10-25-2'), routed (Truck 2 went off-site), called (it is called back).
function planPage(p = {}) {
  p = { week: 0, sel: '', routed: false, called: false, ...p };
  const keys = wkDays(p.week ? '2026-10-26' : '2026-10-19');
  const head = p.week ? sub(tx('Next week'), `${dateLabel(keys[0])} – ${dateLabel(keys[6])}`, txn(1, '{n} truck', '{n} trucks'))
    : sub(tx('This week'), `${dateLabel(keys[0])} – ${dateLabel(keys[6])}`, txn(11, '{n} truck', '{n} trucks'), tx('{n} today', { n: 2 }), tx('{n} cleared', { n: 8 }), tx('{n} cartons decanted', { n: 553 }), p.routed ? tx('{n} off-site', { n: 1 }) : '', tx('{n} diverted', { n: 1 }));
  const acts = `${btn('print', tx('Print week'), 'pw2-print')}<span class="pw2-pills"><b>‹</b><b class="${p.week ? '' : 'on'}">${tx('This week')}</b><b class="nx">›</b></span>`;
  return `<div class="mf2-pg pw2-pg">${gtabs(TABS(), 'planner')}${vh('m-planner', tx('Planner'), head, acts)}` +
    `<div class="pw2"><div class="pw2-main">${daysCard(keys, p)}${trucksCard(keys, p)}</div><aside class="pw2-side">${editorCard(p)}${waitCard()}${offCard(p)}${rosterCard()}</aside></div></div>`;
}
// The dialogs' rows and fields (the shared sheet's .pf, .inp).
const pf = (label, body, hint = '') => `<div class="mf3-pf"><span class="lbl">${label}</span>${body}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
const inp = (t, ph = false, cls = '') => `<span class="mf3-inp${ph ? ' ph' : ''}${cls ? ' ' + cls : ''}">${t}</span>`;

// ── the sheets: Where it goes (routeSheet()) and Call back (callbackSheet()), dialogs ──
const dlgHead = (title, subl) => `<div class="mf2-sh"><div class="t"><h3>${title}</h3><small>${subl}</small></div><span class="x">${ai('x')}</span></div>`;
// s: lands (the day it lands here), to (where it is stored), why (the reason picked).
function routeSheet(s = {}) {
  const kinds = [['here', tx('Receive here'), 'truck'], ['offsite', tx('Off-site'), 'stack'], ['diverted', tx('Diverted'), 'route']];
  const why = [['room', tx('No room on the dock')], ['closed', tx('Store closed')], ['dc', tx('DC asked')], ['other', tx('Other')]];
  return `<div class="mf2-sht mf3-dlg">${dlgHead(tx('Where it goes'), `${fmtDay(DAY)} · ${tx('Truck {no}', { no: 2 })} · 7040304`)}<div class="mf3-db">` +
    pf(tx('Where it goes'), `<span class="mf3-rseg">${kinds.map(([k, l, i]) => `<b class="${k === 'offsite' ? 'on ' + k : ''}" data-k="${k}">${ai(i)}${l}</b>`).join('')}</span>`) +
    pf(tx('Lands here on'), `<span class="mf2-in date mf3-lands"><span class="val${s.lands ? '' : ' plh'}">${s.lands ? ddmmyy(s.lands) : 'dd/mm/yyyy'}</span>${ai('cal')}</span>`, tx('The callback day, if you know it: the Planner and the Dashboard show it that day.')) +
    pf(tx('Where it is stored'), `<span class="mf3-inp wide mf3-to${s.to ? '' : ' ph'}"><span class="t">${s.to || tx('e.g. the storage yard')}</span></span>`) +
    pf(tx('Why'), `<span class="mf3-why">${why.map(([k, l]) => `<b class="${s.why === k ? 'on' : ''}" data-r="${k}">${l}</b>`).join('')}</span>`) +
    pf(tx('Note'), inp(tx('Anything the dock should know'), true, 'wide')) +
    `<p class="mf3-eff offsite">${ai('stack')}<span>${tx('Nothing expects it at Receiving that day; the Planner, the Dashboard and Manifests tag it Off-site, and its cartons are not counted as received.')}</span></p></div>` +
    `<div class="mf2-sf"><span class="pc2-btn">${tx('Cancel')}</span><span class="pc2-btn pri mf3-save">${ai('check')}${tx('Save')}</span></div></div>`;
}
// The pallets sent with 7040304: its consols as the register lists them, [pallet id, departments, cartons].
const OFF304 = () => C304.map(c => [c.id, c.mix.map(([d]) => d), c.cartons]);
function cbSheet() {
  const trucks = [1, 2, 3, 4].map(n => `<span class="mf3-cbt${n === 1 ? ' on' : ''}"><b>${tx('Truck {no}', { no: n })}</b><small>${tx('new')}</small></span>`).join('');
  return `<div class="mf2-sht mf3-dlg">${dlgHead(tx('Call back {what}', { what: '7040304' }), tx('{pallets} at off-site storage · sent {day}', { pallets: txn(10, '{n} pallet', '{n} pallets'), day: fmtDay(DAY) }))}<div class="mf3-db">` +
    pf(tx('Pallets'), `<span class="mf3-cbseg"><b class="on"><span>${tx('All {n}', { n: 10 })}</span><small>${tx('{n} ctn', { n: 66 })}</small></b><b><span>${tx('Choose pallets')}</span><small>${tx('tick the ones you need')}</small></b></span>`) +
    `<div class="mf3-pair2">${pf(tx('Day'), `<span class="mf2-in date"><span class="val">${ddmmyy(BACK)}</span>${ai('cal')}</span>`)}${pf(tx('ETA'), `<span class="mf2-in date"><span class="val">10:00</span>${ai('clock')}</span>`)}</div>` +
    pf(tx('Truck'), `<span class="mf3-cbts">${trucks}</span>`) +
    `<p class="mf3-eff back">${ai('undo')}<span>${tx('{day} gets Truck {no} with {man} staged, tagged From off-site · sent {sent}.', { day: fmtDay(BACK), no: 1, man: '7040304', sent: fmtDay(DAY) })} ${tx('Each pallet is ticked Received on the register as it lands.')}</span></p></div>` +
    `<div class="mf2-sf"><span class="pc2-btn">${tx('Cancel')}</span><span class="pc2-btn pri mf3-plan-go">${ai('truck')}${tx('Plan the truck')}</span></div></div>`;
}

// ── Off-site pallets: the register by manifest (register(), groupHtml()) ──
const deptLine = ds => ds.map(d => `${nameOf(d)} ${d}`).join(' · ');
// p: all (every pallet shown, not three), called (on Tuesday's Truck 1).
function regPage(p = {}) {
  p = { all: false, called: false, ...p };
  const tile = (k, v, note) => `<div class="pc2-card mf3-kpi"><span>${k}</span><b>${v}</b><small>${note}</small></div>`;
  const rows = OFF304(), shown = p.all ? rows : rows.slice(0, 3);
  const row = ([pid, ds, ctn]) => `<div class="mf3-ofg-r"><span class="pid mono">${pid}</span><span class="dl">${deptLine(ds)}</span><span class="ctn">${tx('{n} ctn', { n: ctn })}</span>` +
    (p.called ? '<span class="cb"></span><span class="acts"></span>' : `<span class="cb"><label>${tx('Callback')}</label><span class="mf2-in date sm"><span class="val">${ddmmyy(BACK)}</span>${ai('cal')}</span></span><span class="acts">${btn('check', tx('Received'), 'sm pri')}</span>`) + '</div>';
  const tag = p.called ? `<span class="mf3-rt back">${ai('undo')}${tx('Called back · {when}', { when: tx('{day}, Truck {no}', { day: fmtDay(BACK), no: 1 }) })}</span>` : `<span class="mf3-rt off">${ai('stack')}${tx('Off-site · back {day}', { day: fmtDay(BACK) })}</span>`;
  return `<div class="mf2-pg mf3-reg">${gtabs(TABS(), 'offsite')}${vh('m-inventory', tx('Off-site pallets'), sub(txn(10, '{n} pallet off-site', '{n} pallets off-site'), txn(0, '{n} received', '{n} received')), btn('file', tx('Import the master list'), 'pri'))}` +
    `<div class="mf3-itabs"><b class="on">${tx('Off-site register')}</b><b>${tx('Clearance')}</b></div>` +
    `<div class="mf3-kpis">${tile(tx('Off-site'), 10, tx('from {what}', { what: txn(1, '{n} manifest', '{n} manifests') }))}${tile(tx('Overdue returns'), 0, tx('callback date passed'))}` +
    `${tile(tx('Due in 14 days'), p.called ? 0 : 10, tx('next {date}', { date: p.called ? '—' : fmtDay(BACK) }))}${tile(tx('Called back'), p.called ? 10 : 0, p.called ? tx('{day}, Truck {no}', { day: fmtDay(BACK), no: 1 }) : tx('{n} received', { n: 0 }))}</div>` +
    `<div class="pc2-card mf3-ofg-card"><div class="ch"><h3>${tx('Off-site register')}</h3><span class="mf3-seg2"><b class="on">${tx('By manifest')}</b><b>${tx('By callback date')}</b></span>${btn('plus', tx('Add a pallet'), 'sm')}</div>` +
    `<div class="mf3-ofg${p.called ? ' called' : ''}"><div class="h"><div class="t"><b class="mono">7040304</b><small>${tx('sent {day} · {pallets}', { day: fmtDay(DAY), pallets: txn(10, '{n} pallet', '{n} pallets') })}</small></div><div class="tag">${tag}</div>` +
    `<div class="a">${p.called ? btn('m-planner', tx('Open the Planner'), 'sm mf3-open') : btn('undo', tx('Call back'), 'sm pri mf3-cbk')}</div></div>` +
    `<div class="rows">${shown.map(row).join('')}<span class="mf3-more">${p.all ? tx('Show fewer') : txn(rows.length - 3, '{n} more pallet', '{n} more pallets')}</span></div></div>` +
    `<p class="mf3-note">${ai('route')}<span>${tx('Diverted manifests aren’t on the register: they aren’t ours to call back.')} ${tx('{man} went to {to} on {day}.', { man: '7040299', to: '1187 Bunbury', day: fmtDay('2026-10-22') })}</span></p></div></div>`;
}

// ── What if a truck can't come to the dock? ──────────────────────────
manifests.stories.push({
  id: 'offsite', title: tx('What if a truck can’t come to the dock?'), blurb: tx('Mark it off-site or diverted on the Planner: it keeps its place in the day, tagged, and Receiving doesn’t expect it.'),
  know: [tx('Off-site: the truck goes into storage until it is called back, and its consols go on the off-site register under its manifest.'), tx('Diverted: it goes to another store or site for good; its cartons count as diverted, never as received.'),
    tx('Give the day it lands here after all, if you know it: the Planner and the Dashboard show it that day, with Plan it.'), tx('Managers mark it: on the Planner’s truck, on a day with none planned, or under Where it goes on a manifest in Manifests.'),
    tx('Receive here puts it back on the plan for its day.')],
  html: () => frame(view('v-pl', planPage(), true) + view('v-list', page(LISTR(), '7040304'), false)),
  steps: [
    { cap: tx('Plan › Planner: Truck 2 is due at 13:30 with 7040304, and Truck 1 is still on the dock.'), read: S(tx('There is no room on the dock for a second truck today.'), tx('Click Truck 2: it opens on the right.')),
      dev: 'The days card is <b>daysCard()</b> in js/views/backdock/planner.js; under it <b>trucksCard()</b> gives each truck number a row and each truck a cell (<b>cellHtml()</b>, filled by <b>cellBody()</b>: cleared, live, planned, or off-site and diverted like Thursday’s Truck 2). A cell opens <b>editorCard()</b> beside the week.', ev: [],
      run: async c => { await c.tap('#v-pl .pw2-c[data-slot="2026-10-25-2"]'); c.html('#v-pl', planPage({ sel: '2026-10-25-2' })); } },
    { cap: tx('Where it goes: Off-site or diverted…, then Off-site.'), read: S(tx('Lands here on is the day it comes back, if you know it; where it is stored and why are for the record.'), tx('The sheet says what happens: nothing expects it at Receiving that day.')),
      dev: '<b>routeSheet()</b> in js/views/backdock/routes.js, for managers; nothing is sent until Save.', ev: [],
      run: async c => { c.html('#v-pl', planPage({ sel: '2026-10-25-2' })); await c.tap('#v-pl .pw2-route'); openSheet(c, routeSheet()); await c.tap('.mf2-back .mf3-lands'); openSheet(c, routeSheet({ lands: BACK }));
        await c.tap('.mf2-back .mf3-to'); c.cls('.mf2-back .mf3-to', 'ph', false); c.text('.mf2-back .mf3-to .t', ''); await c.type('.mf2-back .mf3-to .t', 'the storage yard'); await c.tap('.mf2-back .mf3-why [data-r="room"]'); openSheet(c, routeSheet({ lands: BACK, to: 'the storage yard', why: 'room' })); } },
    { cap: tx('Save: Truck 2 keeps its place in the day, tagged Off-site.'), read: S(tx('Its cell says where it went, and that it is not coming to the dock.'), tx('Off-site, to call back lists 7040304 with its ten pallets and the day they are due back.')),
      dev: 'Off-site reads the report for its consols’ cartons and departments, then sends <b>plan.route</b>: the truck leaves the day’s slots, and each consol goes on the off-site register under 7040304 (shared/reducers/backdock.js).',
      ev: [R('GET', '/v1/store/1241/manifest/7040304', null, 'The report, for each consol’s cartons and departments on the register.'), E('plan.route', 'backdock', { date: DAY, slot: 2 }, { route: 'offsite', lands: BACK, to: 'the storage yard', reason: 'room', note: '', manNo: '7040304', pallets: '[10 consols]' })],
      run: async c => { openSheet(c, routeSheet({ lands: BACK, to: 'the storage yard', why: 'room' })); await c.tap('.mf2-back .mf3-save'); closeSheet(c); c.html('#v-pl', planPage({ sel: '2026-10-25-2', routed: true })); toast(c, tx('Truck {no} on {day}: off-site', { no: 2, day: fmtDay(DAY) })); focus(c, '#v-pl .pw2-c[data-slot="2026-10-25-2"]', '#v-pl .pw2-ofc'); } },
    { cap: tx('Manifests lists 7040304 on the day it was due, tagged Off-site.'), read: S(tx('Where it goes says where it went and why, with Change.'), tx('The stats count its cartons as off-site, never as received; Thursday’s diverted report is tagged the same way.')),
      dev: '<b>placeIndex()</b> in shared/manifeststats.js places a routed report on the day it was due (via route); <b>whereBar()</b> in js/views/backdock/manifests.js shows where it went.', ev: [],
      run: async c => { focus(c); await c.tap('#v-pl .pc2-gtab[data-t="manifests"]'); c.view('v-list'); focus(c, '#v-list .mf2-row[data-man="7040304"]', '#v-list .mf3-where'); await c.wait(1300); } },
  ],
});

// ── What if you need the off-site pallets back? ───────────────────────
manifests.stories.push({
  id: 'callback', title: tx('What if you need the off-site pallets back?'), blurb: tx('Call them back from the off-site register or the Planner: which pallets, the day and a free truck.'),
  know: [tx('The off-site register reads By manifest: each manifest in storage with its pallets, or By callback date.'), tx('Call back plans a truck that day, naming what it brings back; a whole truck called back whole lands on its own manifest.'),
    tx('Choose pallets brings back only the ones ticked; the rest stay on the register.'), tx('At Receiving, each pallet is ticked Received on the register as its label is scanned.'),
    tx('The Planner’s Off-site, to call back card does the same, for the week ahead.'), tx('Diverted manifests aren’t on the register: they aren’t ours to call back.')],
  html: () => frame(view('v-of', regPage(), true) + view('v-pl', planPage({ routed: true }), false)),
  steps: [
    { cap: tx('Plan › Off-site pallets: 7040304 in storage, by manifest.'), read: S(tx('Each pallet with its departments, its cartons and the day it is due back.'), tx('Diverted manifests are not on it: they aren’t ours to call back.')),
      dev: 'The register is <b>offsiteGroups()</b> in shared/offsite.js, drawn by <b>groupHtml()</b> in js/views/backdock/offsite.js; the note is <b>divertedNote()</b>.', ev: [],
      run: async c => { c.html('#v-of', regPage()); await c.tap('#v-of .mf3-more'); c.html('#v-of', regPage({ all: true })); focus(c, '#v-of .mf3-ofg'); } },
    { cap: tx('Call back: which pallets, the day, the ETA and a free truck.'), read: S(tx('All of them, or Choose pallets to tick only the ones you need.'), tx('The day starts on their callback date; a truck already planned there is greyed.')),
      dev: '<b>callbackSheet()</b> in js/views/backdock/callback.js; each truck that day says what holds it (<b>slotsOn()</b>).', ev: [],
      run: async c => { focus(c); c.html('#v-of', regPage({ all: true })); await c.tap('#v-of .mf3-cbk'); openSheet(c, cbSheet()); } },
    { cap: tx('Plan the truck: the register says Called back, with its day and truck.'), read: S(tx('7040304 is staged on that truck, as the whole truck comes back whole.'), tx('Its pallets stay on the register until they land.')),
      dev: '<b>plan.set</b> plans the slot with the pallets it brings back (pids), where they came from (from) and the report staged.',
      ev: [E('plan.set', 'backdock', { date: BACK, slot: 1 }, { eta: '10:00', pids: '[10 pallets]', from: { date: DAY, slot: 2 }, manifest: { ref: true, manNo: '7040304', n: 10, cartons: 66 } })],
      run: async c => { openSheet(c, cbSheet()); await c.tap('.mf2-back .mf3-plan-go'); closeSheet(c); c.html('#v-of', regPage({ all: true, called: true })); c.html('#v-pl', planPage({ routed: true, called: true })); toast(c, tx('Called back: Truck {no} on {day}', { no: 1, day: fmtDay(BACK) })); focus(c, '#v-of .mf3-ofg .tag'); } },
    { cap: tx('On the Planner, Tuesday’s Truck 1 brings them home.'), read: S(tx('It is tagged From off-site, and counts its pallets back as they land.'), tx('Each label scanned at Receiving ticks its pallet off the register.')),
      dev: 'A planned truck’s cell (<b>cellBody()</b> in js/views/backdock/planner.js): <b>backOn()</b> in shared/offsite.js finds the pallets it brings back, and its tag says when they were sent; once it lands the tag counts them back. The side’s <b>offsiteCard()</b> says Called back.', ev: [],
      run: async c => { focus(c); await c.tap('#v-of .mf3-open'); c.view('v-pl'); await c.wait(900); await c.tap('#v-pl .pw2-pills .nx'); c.html('#v-pl', planPage({ week: 1, routed: true, called: true })); focus(c, '#v-pl .pw2-c[data-slot="2026-10-27-1"]', '#v-pl .pw2-ofc'); } },
  ],
});
