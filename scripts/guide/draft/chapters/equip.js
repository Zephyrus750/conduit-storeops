// Chapter: Equipment checks, on the store PC at 1920×1080, Floor › Safety &
// upkeep › Equipment as js/views/equipment.js draws it today (desktop(): the
// map with a pin for each piece, the side column's list with its filters and
// the Due in the next 14 days card, an item's card with its checks, the check
// form with OK or Fail on each point, the Add equipment form, and the QR
// labels it prints). Three What ifs play on the same PC: a check that fails
// (out of service, logged in Maintenance, back in service), a ladder that
// moves, and a pallet jack that is retired.
// The day is the guide's: Busselton 1241, Sunday 25 October 2026, the store
// of the Getting around chapter (LAD-02 eight days overdue, STK-01 due on
// Friday, PJ-01 in date, Shelf strip loose open in Maintenance). The map is
// the store's published map (js/guide/manifests-map.js) with the pins
// js/map.js drawPins() draws, at the places the capture seeded them.
// Codes, names and places are data, as the store typed them.
// Every class here starts eqv-; the frame is js/guide/pc.js and the side
// column reuses the pc2-eq grid of styles/guide.css.
import { tx, txn } from '../../i18n.js';
import { fmtDate } from '../../ui.js';
import { qrSvg } from '../../../shared/qr.js';
import { equipLink } from '../../share.js';
import { equipStatus, daysUntil, SOON_DAYS } from '../../../shared/reducers/equip.js';
import { addMonths } from '../../../shared/reducers/floor.js';
import { ai } from '../frames.js';
import { DAY, dt, pc, view, vh, sub, gtabs, btn } from '../pc.js';
import { mapSvg } from '../manifests-map.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const mut = (s, f) => { const n = structuredClone(s); f(n); return n; };

// ── what the screen knows (js/views/equipment.js) ────────────────────
const KIND = () => ({ step: tx('Step ladder'), ladder: tx('Platform ladder'), pj: tx('Pallet jack'), epj: tx('Electric pallet jack'), stacker: tx('Walkie stacker'), forklift: tx('Forklift'), trolley: tx('Trolley'), other: tx('Other equipment') });
const GROUP = { step: 'lad', ladder: 'lad', pj: 'mhe', epj: 'mhe', stacker: 'mhe', forklift: 'mhe', trolley: 'trl', other: 'eqp' };
const GROUPS = () => [['all', tx('All')], ['lad', tx('Ladders')], ['mhe', 'MHE'], ['trl', tx('Trolleys')], ['eqp', tx('Other')]];
const EVERY = () => [[1, tx('Monthly')], [3, tx('Every 3 months')], [6, tx('Every 6 months')], [12, tx('Yearly')], [0, tx('A set date')]];
const WHY = () => [['retired', tx('Retired'), tx('Worn out, or replaced by a new one')], ['broken', tx('Broken beyond repair'), tx('Not worth fixing')], ['lost', tx('Lost or stolen'), tx('Nobody can find it')], ['moved', tx('Moved to another store'), tx('It lives somewhere else now')], ['mistake', tx('Added by mistake'), tx('It was never here')]];
const COLOUR = { ok: '#16A34A', soon: '#D97706', late: '#DC2626', out: '#111827', none: '#64748B' };
const POINTS = () => ({
  lad: [['feet', tx('Feet and rubber pads')], ['rungs', tx('Steps and rails')], ['lock', tx('Locking bar and hinges')], ['label', tx('Label and load rating')]],
  mhe: [['wheels', tx('Wheels and rollers')], ['hyd', tx('Hydraulics hold the load')], ['handle', tx('Handle, release and brake')], ['forks', tx('Forks straight, no cracks')]],
});
const pointsOf = it => [...POINTS()[GROUP[it.kind]], ...(['epj', 'stacker', 'forklift'].includes(it.kind) ? [['batt', tx('Battery and charger')]] : [])];
// The pictogram per kind, stroked in a -8..8 box (GLYPH in js/views/equipment.js).
const GLYPH = {
  lad: '<path d="M-3.5 -7V7M3.5 -7V7M-3.5 -3.5H3.5M-3.5 0H3.5M-3.5 3.5H3.5"/>',
  mhe: '<path d="M-7 -7L-3.5 0V3.5H7M-3.5 1.5H7"/><circle cx="-1.5" cy="5.8" r="1.3"/><circle cx="5" cy="5.8" r="1.3"/>',
  stk: '<path d="M3 -7V4M3 -3H7M3 1H7M-7 -2H1V4H-7zM-5 -2V-5H-1"/><circle cx="-5" cy="6" r="1.3"/><circle cx="-1" cy="6" r="1.3"/>',
};
const glyphOf = it => (it.kind === 'stacker' || it.kind === 'forklift' ? GLYPH.stk : GLYPH[GROUP[it.kind]] || GLYPH.lad);
const glyph = (it, colour) => `<svg class="eqv-gl" viewBox="-9 -9 18 18" aria-hidden="true"><g fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphOf(it)}</g></svg>`;
const pinMark = it => `<span class="eqv-pin ${it.st}" style="border-color:${COLOUR[it.st]}">${glyph(it, it.st === 'out' ? '#fff' : COLOUR[it.st])}</span>`;
const nameOf = it => it.name || KIND()[it.kind];
const everyText = it => (it.every ? txn(it.every, 'every {n} month', 'every {n} months') : tx('on a set date'));
const tone = st => (st === 'out' || st === 'late' ? 'bad' : st === 'soon' ? 'warn' : st === 'ok' ? 'good' : 'info');
const chipOf = (t, k) => `<span class="eqv-st ${k}">${t}</span>`;
// A date field as the PC shows it (dd/mm/yyyy on an Australian store PC).
const dateIn = iso => `<span class="eqv-in date">${dt(iso, { day: '2-digit', month: '2-digit', year: 'numeric' })}${ai('cal')}</span>`;

// ── the store's equipment on the guide's day ─────────────────────────
// A log line: d the day, a the reducer's words (shown translated), n a note.
const ITEMS = () => ({
  lad02: { id: 'qmmiyaao0', code: 'LAD-02', kind: 'step', name: 'Step ladder, 3 step', loc: 'Floor, aisle 8', every: 3, last: '2026-07-17', due: '2026-10-17', out: null, removed: null, x: -170, y: -40, added: '2026-03-09',
    log: [{ d: '2026-03-09', a: 'Added' }, { d: '2026-04-14', a: 'Checked OK' }, { d: '2026-07-17', a: 'Checked OK' }] },
  stk01: { id: 'qmmiyb2k1', code: 'STK-01', kind: 'stacker', name: 'Walkie stacker', loc: 'Stockroom', every: 1, last: '2026-09-30', due: '2026-10-30', out: null, removed: null, x: 30, y: -1635, added: '2026-03-09',
    log: [{ d: '2026-03-09', a: 'Added' }, { d: '2026-08-31', a: 'Checked OK' }, { d: '2026-09-30', a: 'Checked OK' }] },
  pj01: { id: 'qmmiyc7d4', code: 'PJ-01', kind: 'pj', name: 'Pallet jack', loc: 'Back dock', every: 6, last: '2026-10-05', due: '2027-04-05', out: null, removed: null, x: 760, y: -1700, added: '2026-03-09',
    log: [{ d: '2026-03-09', a: 'Added' }, { d: '2026-04-05', a: 'Checked OK' }, { d: '2026-10-05', a: 'Checked OK' }] },
});
// The screen's state: the items, the one open (sel), what the side column
// shows (mode: card, check, add, edit, remove), the filter, the map's hint.
const BASE = () => ({ items: ITEMS(), sel: null, mode: null, filter: 'all', chk: null, draft: null, rm: null, spot: null });
const LAD01 = { id: 'qmvnkui2o', code: 'LAD-01', kind: 'ladder', name: 'Platform ladder, 4 step', loc: 'Stockroom, by bay 7012', every: 3, last: DAY, due: addMonths(DAY + 'T00:00:00Z', 3), out: null, removed: null, x: 470, y: -1650, added: DAY, log: [{ d: DAY, a: 'Added' }] };

// ── the screen (desktop() in js/views/equipment.js) ──────────────────
const RANK = { out: 0, late: 1, soon: 2, none: 3, ok: 4 };
const withSt = s => Object.values(s.items).map(it => ({ ...it, st: equipStatus(it, DAY) }));
const live = s => withSt(s).filter(it => !it.removed);
const byNeed = (a, b) => RANK[a.st] - RANK[b.st] || String(a.due || '9').localeCompare(String(b.due || '9')) || a.code.localeCompare(b.code);
function stText(it) {
  if (it.removed) return tx('Removed {date}', { date: fmtDate(it.removed.at) });
  if (it.st === 'out') return tx('Out of service since {date}', { date: fmtDate(it.out.since) });
  const d = daysUntil(it.due, DAY);
  return d < 0 ? txn(-d, 'Overdue {n} day', 'Overdue {n} days') : d === 0 ? tx('Due today') : d <= SOON_DAYS ? txn(d, 'Due in {n} day', 'Due in {n} days') : tx('Next {date}', { date: fmtDate(it.due) });
}
const need = s => live(s).filter(it => it.st === 'late' || it.st === 'out').length;
function headSub(s) {
  const l = live(s), n = k => l.filter(it => it.st === k).length;
  return sub(txn(l.length, '{n} piece of equipment', '{n} pieces of equipment'), n('late') ? tx('{n} overdue', { n: n('late') }) : '', n('out') ? tx('{n} out of service', { n: n('out') }) : '', n('soon') ? tx('{n} due in 14 days', { n: n('soon') }) : '');
}
function pills(s) {
  const l = live(s), removed = withSt(s).filter(it => it.removed);
  const count = g => (g === 'all' ? l.length : l.filter(it => GROUP[it.kind] === g).length);
  return GROUPS().filter(([g]) => g === 'all' || count(g)).map(([g, label]) => `<b class="${s.filter === g ? 'on' : ''}" data-f="${g}">${label} ${count(g)}</b>`).join('') +
    (removed.length ? `<b class="${s.filter === 'removed' ? 'on' : ''}" data-f="removed">${tx('Removed {n}', { n: removed.length })}</b>` : '');
}
const row = (it, s) => `<div class="eqv-li${s.sel === it.id ? ' sel' : ''}" data-id="${it.id}">${pinMark(it)}<span class="nm"><b><span class="mono">${it.code}</span> ${nameOf(it)}</b><small>${it.loc || tx('Not on the map')} · ${everyText(it)}${it.last ? ' · ' + tx('last {date}', { date: fmtDate(it.last) }) : ''}</small></span>${chipOf(stText(it), it.removed ? 'info' : tone(it.st))}</div>`;
function listCard(s) {
  const list = (s.filter === 'removed' ? withSt(s).filter(it => it.removed) : live(s)).sort(byNeed);
  return `<div class="pc2-card eqv-list"><div class="eqv-pills">${pills(s)}</div>${list.map(it => row(it, s)).join('')}</div>`;
}
function dueCard(s) {
  const rows = live(s).filter(it => it.st === 'out' || it.st === 'late' || it.st === 'soon').sort(byNeed);
  return `<div class="pc2-card eqv-due"><div class="ch"><h3>${tx('Due in the next 14 days')}</h3><span>${tx('Equipment and Emergency')}</span></div>` +
    (rows.map(it => `<div class="eqv-li" data-id="${it.id}">${pinMark(it)}<span class="nm"><b><span class="mono">${it.code}</span> ${nameOf(it)}</b><small>${it.loc} · ${tx('Equipment')}</small></span>${chipOf(stText(it), tone(it.st))}</div>`).join('') ||
      `<p class="none">${tx('Nothing due. Every check is in date.')}</p>`) + '</div>';
}
function logRows(it) {
  const label = Object.fromEntries(pointsOf(it));
  return [...it.log].reverse().slice(0, 12).map(l => { const bad = l.pts ? Object.entries(l.pts).filter(([, v]) => v === 'fail').map(([k]) => label[k]) : []; const note = [bad.join(', '), l.n || ''].filter(Boolean).join(' · '); return `<div class="eqv-log"><span>${fmtDate(l.d)}</span><b>${tx(l.a)}${note ? ' · ' + note : ''}</b></div>`; }).join('');
}
const WHYNAME = k => (WHY().find(w => w[0] === k) || [, k])[1];
function card(it) {
  const facts = [[tx('What'), KIND()[it.kind]], [tx('Where'), it.loc || tx('Not on the map')], [tx('Checked'), everyText(it)], [tx('Last check'), it.last ? fmtDate(it.last) : tx('Not checked yet')], [tx('Next due'), it.due ? fmtDate(it.due) : '—'], [tx('Added'), fmtDate(it.added)]];
  const acts = it.removed ? btn('refresh', tx('Bring it back'), 'pri sm eqv-back')
    : btn('listcheck', tx('Record a check'), 'pri sm eqv-rec') + btn('pin', tx('Show on map'), 'sm') + btn('pin', tx('Move on the map'), 'sm eqv-mv') + btn('edit', tx('Edit'), 'sm') + btn('qr', tx('Print label'), 'sm') + btn('trash', tx('Remove'), 'sm red eqv-rm');
  const note = it.removed ? `<div class="eqv-note rm">${ai('trash')}<span>${tx('Removed {date}: {why}.', { date: fmtDate(it.removed.at), why: WHYNAME(it.removed.why) })}${it.removed.note ? ' ' + it.removed.note : ''}</span></div>`
    : it.out ? `<div class="eqv-note out">${ai('alert')}<span><b>${tx('Out of service: do not use')}</b> ${tx('Since {date}.', { date: fmtDate(it.out.since) })}${it.out.note ? ' ' + it.out.note : ''} ${tx('A check that passes brings it back.')}</span></div>` : '';
  return `<div class="pc2-card eqv-card"><div class="eqv-h">${pinMark(it)}<b><span class="mono">${it.code}</span> ${nameOf(it)}</b>${chipOf(stText(it), it.removed ? 'info' : tone(it.st))}</div>${note}` +
    `<div class="eqv-facts">${facts.map(([k, v]) => `<span>${k}: <b>${v}</b></span>`).join('')}</div><div class="eqv-logs">${logRows(it)}</div>` +
    `<div class="eqv-acts">${acts}${btn('x', tx('Close'), 'sm')}</div></div>`;
}
function checkForm(it, chk) {
  const pts = pointsOf(it), failed = pts.filter(([k]) => chk.pts[k] === 'fail'), done = pts.every(([k]) => chk.pts[k]);
  const next = it.every ? addMonths(DAY + 'T00:00:00Z', it.every) : null;
  const save = failed.length ? tx('Save: out of service') : done ? tx('Save: checked OK · next due {date}', { date: fmtDate(next) }) : tx('Mark each point OK or Fail');
  return `<div class="pc2-card eqv-card eqv-form"><div class="eqv-h"><b>${tx('Check {code}', { code: it.code })}</b>${chipOf(stText(it), tone(it.st))}</div>` +
    `<label class="eqv-fld"><span>${tx('Checked on')}</span>${dateIn(DAY)}</label>` +
    `<div class="eqv-pts"><div class="pth"><b>${tx('{kind} check', { kind: KIND()[it.kind] })}</b><span class="pc2-btn sm eqv-allok">${tx('All OK')}</span></div>` +
    pts.map(([k, label]) => `<div class="eqv-pt" data-k="${k}"><span>${label}</span><span class="eqv-okf"><i class="ok${chk.pts[k] === 'ok' ? ' on' : ''}">${tx('OK')}</i><i class="fail${chk.pts[k] === 'fail' ? ' on' : ''}">${tx('Fail')}</i></span></div>`).join('') + '</div>' +
    (failed.length ? `<div class="eqv-note out">${ai('alert')}<span><b>${tx('It fails the check.')}</b> ${tx('{code} goes out of service: marked do not use on the map until a check passes.', { code: it.code })}</span></div><span class="eqv-sw"><i class="${chk.issue ? 'on' : ''}">${ai('check')}</i>${tx('Log it in Maintenance too, so it gets fixed')}</span>` : '') +
    `<label class="eqv-fld"><span>${tx('Note')}</span><span class="eqv-in note${chk.note ? '' : ' eqv-ph'}">${chk.note || tx('What you saw, or what was fixed')}</span></label>` +
    `<div class="eqv-acts">${btn(failed.length ? 'alert' : 'check', save, `pri sm eqv-save${failed.length ? ' bad' : ''}${done ? '' : ' off'}`)}${btn('', tx('Cancel'), 'sm')}</div></div>`;
}
function draftForm(d) {
  const kinds = Object.entries(KIND()).map(([k, label]) => `<b class="${d.kind === k ? 'on' : ''}" data-k="${k}">${label}</b>`).join('');
  const every = EVERY().map(([n, label]) => `<b class="${d.every === n ? 'on' : ''}">${label}</b>`).join('');
  const field = (label, v, ph, cls = '') => `<label class="eqv-fld"><span>${label}</span><span class="eqv-in${cls}${v ? '' : ' eqv-ph'}">${v || ph}</span></label>`;
  const nextNote = d.edit ? tx('Next due {date}, worked out from the last check.', { date: fmtDate(d.due) }) : tx('Next due {date}, worked out from the last check.', { date: fmtDate(addMonths(DAY + 'T00:00:00Z', d.every)) });
  return `<div class="pc2-card eqv-card eqv-form"><div class="eqv-h"><b>${d.edit ? tx('Edit {code}', { code: d.code }) : tx('Add equipment')}</b><span class="dim">${d.placed ? tx('placed on the map') : tx('tap the map to place it')}</span></div>` +
    `<div class="eqv-sub">${tx('What is it?')}</div><div class="eqv-chips">${kinds}</div>` +
    `<div class="eqv-two">${field(tx('Code'), d.code, '', ' mono code')}${field(tx('Name'), d.name, KIND()[d.kind], ' name')}</div>` +
    `<p class="eqv-help">${tx('The next free number for its group. Use the number on its tag if it has one: the QR label prints with this code.')}</p>` +
    field(tx('Where it lives'), d.loc, tx('Stockroom, by bay 7012'), ' loc') +
    `<div class="eqv-sub">${tx('Checked how often?')}</div><div class="eqv-chips">${every}</div>` +
    `<label class="eqv-fld"><span>${d.edit ? tx('Next due') : tx('Last checked')}</span>${dateIn(d.edit ? d.due : DAY)}</label><p class="eqv-help">${nextNote}</p>` +
    `<div class="eqv-acts">${btn('check', d.edit ? tx('Save changes') : tx('Add {code}', { code: d.code }), 'pri sm eqv-save')}${btn('', tx('Cancel'), 'sm')}</div></div>`;
}
function removeForm(it, rm) {
  return `<div class="pc2-card eqv-card eqv-form"><div class="eqv-h"><b>${tx('Remove {code}', { code: it.code })}</b><span class="eqv-mgr" title="${tx('Managers only: team members don’t see this')}">${ai('shield')}</span></div><div class="eqv-sub">${tx('Why is it going?')}</div>` +
    WHY().map(([k, name, hint]) => `<span class="eqv-why${rm.why === k ? ' on' : ''}" data-w="${k}"><i></i><span><b>${name}</b><small>${hint}</small></span></span>`).join('') +
    `<label class="eqv-fld"><span>${tx('Note')}</span><span class="eqv-in note${rm.note ? '' : ' eqv-ph'}">${rm.note || tx('Replaced by LAD-04')}</span></label>` +
    `<p class="eqv-help">${tx('It leaves the map, not the history: its checks stay. Undo for a few seconds, or bring it back later from Removed.')}</p>` +
    `<div class="eqv-acts">${btn('trash', tx('Remove {code}', { code: it.code }), `sm eqv-save bad${rm.why ? '' : ' off'}`)}${btn('', tx('Cancel'), 'sm')}</div></div>`;
}
function side(s) {
  const it = withSt(s).find(x => x.id === s.sel);
  if (s.mode === 'add' || s.mode === 'edit') return draftForm(s.draft) + listCard(s);
  if (s.mode === 'check' && it) return checkForm(it, s.chk) + listCard(s);
  if (s.mode === 'remove' && it) return removeForm(it, s.rm) + listCard(s);
  if (it) return card(it) + listCard(s);
  return listCard(s) + dueCard(s);
}
// The pins (drawPins() in js/map.js): a pin in the item's colour with its pictogram;
// a piece being placed is an accent pin with a +.
const pinG = (x, y, colour, mid) => `<g transform="translate(${x},${y})"><path d="M0 0c-14-22-30-34-30-58a30 30 0 0 1 60 0c0 24-16 36-30 58z" fill="${colour}" stroke="#fff" stroke-width="5"/><circle cx="0" cy="-58" r="20" fill="#fff"/>${mid}</g>`;
function pins(s) {
  const d = s.draft, list = live(s).filter(it => it.x != null && !(d?.edit && d.id === it.id));
  return list.map(it => pinG(it.x, it.y, COLOUR[it.st], `<g transform="translate(0,-58) scale(2.1)" fill="none" stroke="${COLOUR[it.st]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphOf(it)}</g>`)).join('') +
    (d?.placed ? pinG(d.x, d.y, '#0E7CA8', '<text x="0" y="-58" class="plus">+</text>') : '') +
    (s.spot ? `<circle class="eqv-spot" cx="${s.spot[0]}" cy="${s.spot[1] - 40}" r="70"/>` : '');
}
const hint = s => (s.mode === 'add' || s.mode === 'edit' ? (s.draft.placed ? tx('Placed. Tap again to move it.') : tx('Tap the map where it lives')) : tx('Tap a pin for its checks'));
// Puts a state on the screen: the side column, the pins, the counts and the badges.
function paint(c, s) {
  c.cls('.pc2 .glow', 'glow', false);
  c.html('#v-eq .eqv-side', side(s)); c.html('#v-eq .eqv-pins', pins(s)); c.html('#v-eq .pc2-vh .sub', headSub(s)); c.text('#v-eq .eqv-hint', hint(s));
  const n = need(s);
  for (const b of ['.pc2-rail [data-g="safety"] .bdg', '#v-eq .pc2-gtab[data-t="equipment"] .bdg']) { c.text(b, String(n)); (n ? c.show : c.hide)(b); }
}
// The map card: the bar, the store's map with the pins, the legend.
const MAPVIEW = '-2392 -1890 4040 2550';
const mapCard = s => `<div class="pc2-card map"><div class="mb"><span class="in">${ai('search')}${tx('Find a shelf or bay…')}</span><span class="ch on">${ai('grid')}${tx('All')}</span><span class="ch">${ai('home')}Home</span><span class="ch">${ai('shirt')}Clothing</span><span class="ch">${ai('star')}Kids</span><span class="ch">${ai('bag')}Checkouts</span><span class="ch">${ai('flame')}Flex</span><span class="ch">${ai('box')}Stockroom</span><span class="zb">${['minus', 'plus', 'map', 'layers'].map(i => `<span>${ai(i)}</span>`).join('')}</span></div>` +
  `<div class="eqv-box">${mapSvg(MAPVIEW).replace('</svg>', `<g class="eqv-pins">${pins(s)}</g></svg>`)}</div>` +
  `<div class="leg"><span>${ai('m-map')}FOH · Ground <b>1241</b> › ${tx('Equipment checks')}</span>${['ok', 'soon', 'late', 'out'].map(k => `<span><i style="background:${COLOUR[k]}"></i>${{ ok: tx('In date'), soon: tx('Due in 14 days'), late: tx('Overdue'), out: tx('Out of service') }[k]}</span>`).join('')}<span class="f eqv-hint">${hint(s)}</span></div></div>`;
const TABS = n => [['emergency', 'm-emergency', tx('Emergency')], ['maintenance', 'm-maintenance', tx('Maintenance')], ['equipment', 'm-equipment', tx('Equipment'), n], ['recalls', 'alert', tx('Recalls')]];
// The Equipment tab's count is red when the tab is not the one open.
const tabs = (n, on) => gtabs(TABS(n), on).replace(/(data-t="equipment">(?:(?!data-t=)[\s\S])*?<span class=")bdg(")/, '$1bdg eqv-red$2');
const screen = s => tabs(need(s) || 0, 'equipment') + vh('m-equipment', tx('Equipment checks'), headSub(s), `${btn('qr', tx('Print QR labels'), 'eqv-lbl')}${btn('print', tx('Print check sheet'))}${btn('plus', tx('Add equipment'), 'pri eqv-add')}`) +
  `<div class="pc2-eq eqv">${mapCard(s)}<div class="side eqv-side">${side(s)}</div></div>`;
// The rail's count for Safety & upkeep is red, as paintBadges() paints the equipment's.
const redBadge = h => h.replace(/(data-g="safety">(?:(?!data-g=)[\s\S])*?<span class=")bdg(")/, '$1bdg eqv-red$2');
const frame = (s, more = '') => redBadge(pc(view('v-eq', screen(s), true) + more, { on: 'safety', badges: { inputs: 1, safety: need(s), backfill: 3 } }));
// The toast, at the foot of the window as the app shows it (#toasts): an action is underlined.
const toast = (c, t, tone = '', act = '') => { c.html('.pc2 > .dv-toast', t + (act ? ` <u>${act}</u>` : '')); c.cls('.pc2 > .dv-toast', 'eqv-t', true); c.cls('.pc2 > .dv-toast', 'warn', tone === 'warn'); c.show('.pc2 > .dv-toast'); };
// Selectors on the side column, scoped so a ring never lands on a hidden copy.
const ROW = code => `#v-eq .eqv-list .eqv-li[data-id="${Object.values(ITEMS()).concat(LAD01).find(i => i.code === code).id}"]`;

// ── the QR labels (printLabels()): the sheet in the print preview ────
const labelsSheet = list => `<div class="eqv-print"><div class="eqv-paper"><div class="eqv-pph"><div><h1>${tx('Equipment labels')}</h1><small>${tx('{name} · store {no}', { name: 'Busselton', no: '1241' })}</small></div><small>${tx('Printed {when}', { when: `${dt(DAY, { day: 'numeric', month: 'short', year: 'numeric' })}, 8:52 am` })}</small></div>` +
  `<div class="lbls">${list.map(it => `<div class="lb"><span class="q">${qrSvg(equipLink('1241', it.id), { cell: 3 })}</span><span class="t"><b>${it.code}</b><span>${nameOf(it)}</span><small>${tx('Checked {every}. Scan to see its checks or record one.', { every: everyText(it) })}</small><small>${tx('{name} · store {no}', { name: 'Busselton', no: '1241' })}</small></span></div>`).join('')}</div></div></div>`;

// ── the states the chapter steps through ─────────────────────────────
const S0 = BASE();
const S1 = mut(S0, s => { s.sel = s.items.lad02.id; });
const S2 = mut(S1, s => { s.mode = 'check'; s.chk = { pts: {}, note: '', issue: true }; });
const S3 = mut(S2, s => { s.chk.pts = { feet: 'ok', rungs: 'ok', lock: 'ok', label: 'ok' }; });
const S4 = mut(S1, s => { const it = s.items.lad02; it.last = DAY; it.due = addMonths(DAY + 'T00:00:00Z', 3); it.log.push({ d: DAY, a: 'Checked OK' }); });
const D0 = { kind: 'step', code: 'LAD-01', name: '', loc: '', every: 3, placed: false };
const S5 = mut(S4, s => { s.sel = null; s.mode = 'add'; s.draft = { ...D0 }; });
const S6 = mut(S5, s => { s.draft.kind = 'ladder'; });
const S7 = mut(S6, s => { s.draft.name = LAD01.name; s.draft.loc = LAD01.loc; s.spot = [LAD01.x, LAD01.y]; });
const S8 = mut(S7, s => { Object.assign(s.draft, { placed: true, x: LAD01.x, y: LAD01.y }); s.spot = null; });
const S9 = mut(S8, s => { s.items.lad01 = structuredClone(LAD01); s.mode = null; s.draft = null; s.sel = LAD01.id; });

export const equip = {
  id: 'equip', grp: 'floor', icon: 'ladder', title: tx('Equipment checks'), device: 'pc', where: tx('PC · Floor › Safety & upkeep › Equipment'), for: ['manager'],
  intro: S(tx('Ladders, MHE and trolleys on the map, each with its checks.'), tx('Red needs a person now.')),
  html: () => frame(S0),
  steps: [
    { cap: tx('Safety & upkeep › Equipment: every ladder and pallet jack, pinned where it lives.'), read: S(tx('The header counts the pieces, what is overdue and what is due in 14 days.'), tx('The red count on the rail is what needs a person now: overdue or out of service.')),
      dev: 'The view is js/views/equipment.js: <b>model()</b> reads the equipment projection (shared/reducers/equip.js), <b>headSub()</b> counts it, and the rail’s count is <b>checksNeeded()</b> in js/shell.js. Looking sends nothing.', ev: [],
      run: async c => { paint(c, S0); await c.tap('#v-eq .pc2-gtab[data-t="equipment"]'); c.cls('#v-eq .pc2-vh .sub', 'glow', true); await c.wait(700); } },
    { cap: tx('A pin’s colour says where it stands: red is overdue.'), read: S(tx('Green is in date, amber is due within 14 days, red is overdue and black is out of service.'), tx('The list beside the map puts what needs a person first.')),
      dev: 'The colour is <b>equipStatus()</b> in shared/reducers/equip.js (14 days is SOON_DAYS); the pins are <b>drawPins()</b> in js/map.js and the list is sorted by <b>byNeed()</b>.', ev: [],
      run: async c => { paint(c, S0); c.cls('#v-eq .leg', 'glow', true); await c.wait(500); c.cls(ROW('LAD-02'), 'glow', true); await c.wait(600); } },
    { cap: tx('Due in the next 14 days lists every check coming up.'), read: S(tx('Under the list, with nothing open: this equipment, and the Emergency markers with a service due, like an extinguisher.'), tx('Click one to open it.')),
      dev: 'The card is <b>dueCard()</b>; Emergency’s markers come from <b>emergencyDue()</b>, the serviced markers on the map with a due date in the window.', ev: [],
      run: async c => { paint(c, S0); await c.tap('#v-eq .eqv-due h3'); c.cls('#v-eq .eqv-due', 'glow', true); await c.wait(600); } },
    { cap: tx('Click {code}: its card opens over the list.', { code: 'LAD-02' }), read: S(tx('What it is, where it lives, how often it is checked, its last check and when the next is due.'), tx('Under them, every check, newest first.')),
      dev: 'The card is <b>detail()</b>, its lines <b>facts()</b> and <b>logRows()</b>: the item’s log, kept by the reducer in its own words.', ev: [],
      run: async c => { paint(c, S0); await c.tap(ROW('LAD-02')); paint(c, S1); } },
    { cap: tx('Record a check: OK or Fail on each point.'), read: S(tx('The points depend on what it is: a ladder’s feet, steps, locking bar and label; a pallet jack’s wheels, hydraulics, handle and forks.'), tx('Powered MHE adds its battery and charger.')),
      dev: 'The points per group are <b>POINTS</b> in js/views/equipment.js (<b>pointsOf()</b>); the form is <b>checkForm()</b>. Save waits until every point is marked.', ev: [],
      run: async c => { paint(c, S1); await c.tap('#v-eq .eqv-card .eqv-rec'); paint(c, S2); } },
    { cap: tx('All OK marks every point; the button says when the next check is due.'), read: S(tx('Or mark each one.'), tx('The next check is worked out from the day it was checked: three months for this ladder.')),
      dev: 'All OK fills every point with ok; <b>checkVals()</b> works out the next due date with <b>addMonths()</b> (shared/reducers/floor.js).', ev: [],
      run: async c => { paint(c, S2); await c.tap('#v-eq .eqv-allok'); paint(c, S3); } },
    { cap: tx('Save: {code} is in date again and the red counts go.', { code: 'LAD-02' }), read: S(tx('Its pin turns green and its next check is due on {date}.', { date: fmtDate(LAD01.due) }), tx('The rail’s count and the Equipment tab’s count clear.')),
      dev: '<b>saveCheck()</b> sends <b>equip.check</b>; the reducer sets the last check and the next due date (<b>nextDue()</b>) and logs Checked OK.',
      ev: [E('equip.check', 'floor', { equip: 'qmmiyaao0' }, { day: DAY, result: 'ok', points: { feet: 'ok', rungs: 'ok', lock: 'ok', label: 'ok' } })],
      run: async c => { paint(c, S3); await c.tap('#v-eq .eqv-save'); paint(c, S4); toast(c, tx('{code} checked OK', { code: 'LAD-02' })); } },
    { cap: tx('Add equipment: pick what it is, and it gets the next free code.'), read: S(tx('A platform ladder gets the next free ladder code, {code}.', { code: 'LAD-01' }), tx('Use the number on its tag instead if it has one: the QR label prints with this code.')),
      dev: '<b>draftForm()</b>; the code is <b>nextCode()</b>, the first free number for the kind’s group (LAD, MHE, TRL, EQP). A code belongs to one piece on the list (<b>codeOf()</b> in shared/reducers/equip.js).', ev: [],
      run: async c => { paint(c, S4); await c.tap('#v-eq .eqv-add'); paint(c, S5); await c.tap('#v-eq .eqv-form .eqv-chips b[data-k="ladder"]'); paint(c, S6); } },
    { cap: tx('Give it a name and say where it lives.'), read: S(tx('Name is optional: without one it shows as its kind.'), tx('Where it lives is what the list and the check sheet say.')),
      dev: 'The fields are read on every repaint (<b>readForms()</b>), so a store update arriving mid-form keeps what was typed.', ev: [],
      run: async c => { paint(c, S6); await c.tap('#v-eq .eqv-form .eqv-in.name'); c.cls('#v-eq .eqv-form .eqv-in.name', 'eqv-ph', false); await c.type('#v-eq .eqv-form .eqv-in.name', LAD01.name); await c.tap('#v-eq .eqv-form .eqv-in.loc'); c.cls('#v-eq .eqv-form .eqv-in.loc', 'eqv-ph', false); await c.type('#v-eq .eqv-form .eqv-in.loc', LAD01.loc); paint(c, S7); } },
    { cap: tx('Click the map where it lives to place its pin.'), read: S(tx('The pin goes where you click, by bay {bay} in the stockroom.', { bay: '7012' }), tx('Click again to move it before you add it.')),
      dev: 'A click on the map while the form is open sets the draft’s x and y in map units and its floor; an empty Where it lives becomes the nearest shelf.', ev: [],
      run: async c => { paint(c, S7); await c.tap('#v-eq .eqv-spot'); paint(c, S8); } },
    { cap: tx('Add {code}: it is on the map and the list, due in three months.', { code: 'LAD-01' }), read: S(tx('Its card opens with its first line: Added.'), tx('Its next check is worked out from Last checked, today.')),
      dev: '<b>saveDraft()</b> sends <b>equip.add</b> with the place on the map; the reducer works out the next due date from the last check.',
      ev: [E('equip.add', 'floor', { equip: LAD01.id }, { code: 'LAD-01', kind: 'ladder', name: LAD01.name, every: 3, last: DAY, x: LAD01.x, y: LAD01.y, floor: 'ground', loc: LAD01.loc })],
      run: async c => { paint(c, S8); await c.tap('#v-eq .eqv-form .eqv-save'); paint(c, S9); toast(c, tx('{code} added', { code: 'LAD-01' })); } },
    { cap: tx('Print QR labels: one for each piece, to stick on it.'), read: S(tx('Scanning a label on a store PC or a manager’s phone opens that piece’s card, ready for a check.'), tx('Print check sheet prints the list to walk with a pen.')),
      dev: '<b>printLabels()</b>: each label’s code is <b>equipLink()</b> in js/share.js (?store=…&amp;equip=…), drawn by <b>qrSvg()</b> in shared/qr.js; the walk sheet is <b>printCheckSheet()</b>.', ev: [],
      run: async c => { paint(c, S9); c.hide('.pc2 > .dv-toast'); await c.tap('#v-eq .eqv-lbl'); c.add('.pc2-z', labelsSheet(live(S9).sort((a, b) => a.code.localeCompare(b.code)))); } },
  ],
  stories: [],
};

// ── What if a check fails? ───────────────────────────────────────────
// STK-01's hydraulics: out of service, a Maintenance issue, then a check that passes.
const F0 = mut(BASE(), s => { s.sel = s.items.stk01.id; s.mode = 'check'; s.chk = { pts: {}, note: '', issue: true }; });
const F1 = mut(F0, s => { s.chk.pts = { wheels: 'ok', hyd: 'fail', handle: 'ok', forks: 'ok', batt: 'ok' }; });
const F2 = mut(F1, s => { s.chk.note = 'Forks drop slowly with a load'; });
const F3 = mut(BASE(), s => { const it = s.items.stk01; s.sel = it.id; it.out = { since: DAY, note: 'Forks drop slowly with a load', issue: 'mmvnkx1q7' }; it.last = DAY; it.log.push({ d: DAY, a: 'Failed', n: 'Forks drop slowly with a load', pts: F1.chk.pts }); });
const F3B = mut(F3, s => { s.mode = 'check'; s.chk = { pts: { wheels: 'ok', hyd: 'ok', handle: 'ok', forks: 'ok', batt: 'ok' }, note: '', issue: true }; });
const F4 = mut(F3, s => { const it = s.items.stk01; it.out = null; it.due = addMonths(DAY + 'T00:00:00Z', 1); it.log.push({ d: DAY, a: 'Back in service' }); });
// Maintenance (js/views/maintenance.js) with the issue the failed check logged.
const MGLYPH = { safety: '<path d="M0 -7L7.5 6.5H-7.5zM0 -2V2M0 4.2V4.4"/>', fixture: '<path d="M-6 7L2 -1M0 -3L4 -7L7 -4L3 0z"/>' };
const issue = (cat, title, sev, sevCol, where, ago) => `<div class="eqv-li"><span class="eqv-pin" style="border-color:#DC2626"><svg class="eqv-gl" viewBox="-9 -9 18 18" aria-hidden="true"><g fill="none" stroke="#DC2626" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MGLYPH[cat]}</g></svg></span><span class="nm"><b>${title}</b><small><i class="sev" style="background:${sevCol}"></i>${sev} · ${where} · ${ago}</small></span>${chipOf(tx('issue status::Open'), 'warn')}</div>`;
const maint = () => vh('m-maintenance', tx('Maintenance'), sub(tx('{n} open', { n: 2 }), tx('{n} overdue', { n: 0 }), tx('{n} recurring', { n: 0 }), txn(0, 'oldest {n} day', 'oldest {n} days')), btn('plus', tx('Log new issue'), 'pri')) +
  `<div class="pc2-eq eqv"><div class="pc2-card map"><div class="mb"><span class="in">${ai('search')}${tx('Find a shelf or bay…')}</span><span class="ch on">${ai('grid')}${tx('All')}</span><span class="ch">${ai('home')}Home</span><span class="ch">${ai('shirt')}Clothing</span><span class="ch">${ai('star')}Kids</span><span class="ch">${ai('bag')}Checkouts</span><span class="ch">${ai('flame')}Flex</span><span class="ch">${ai('box')}Stockroom</span></div>` +
  `<div class="eqv-box">${mapSvg(MAPVIEW).replace('</svg>', pinG(30, -1635, '#DC2626', `<g transform="translate(0,-58) scale(2.1)" fill="none" stroke="#DC2626" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MGLYPH.safety}</g>`) + pinG(-30, -40, '#DC2626', `<g transform="translate(0,-58) scale(2.1)" fill="none" stroke="#DC2626" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MGLYPH.fixture}</g>`) + '</svg>')}</div>` +
  `<div class="leg"><span>${ai('m-map')}FOH · Ground <b>1241</b> › ${tx('Maintenance')}</span><span><i style="background:#DC2626"></i>${tx('issue status::Open')}</span><span><i style="background:#D97706"></i>${tx('Done, to check')}</span><span><i style="background:#16A34A"></i>${tx('Completed')}</span><span class="f">${tx('Log a new issue, then tap the map to place it')}</span></div></div>` +
  `<div class="side"><div class="pc2-card eqv-list"><div class="eqv-pills"><b class="on">${tx('Open {n}', { n: 2 })}</b><b>${tx('Overdue {n}', { n: 0 })}</b><b>${tx('Recurring {n}', { n: 0 })}</b><b>${tx('Done this month {n}', { n: 0 })}</b><b>${tx('Completed {n}', { n: 0 })}</b><b>${tx('All')}</b></div>` +
  issue('safety', tx('{code} failed its check: {what}', { code: 'STK-01', what: tx('Hydraulics hold the load') }), tx('High'), '#DC2626', 'Stockroom', tx('just now')) + issue('fixture', 'Shelf strip loose', tx('Medium'), '#D97706', 'A16 S2', tx('{n} h ago', { n: 2 })) + '</div></div></div>';
equip.stories.push({
  id: 'fail', title: tx('What if a check fails?'), blurb: tx('One Fail takes it out of service until a check passes, and can log the fault in Maintenance.'),
  know: [tx('Any point marked Fail makes the whole check a fail.'), tx('The piece goes out of service: a black pin and a red note that says do not use, on every store device.'),
    tx('Log it in Maintenance too is ticked: the fault goes to Maintenance as a High safety issue, pinned where the piece lives.'), tx('Out of service counts on the rail until a check passes.'),
    tx('The next check that passes brings it back into service and sets its next due date.'), tx('The Maintenance issue stays open until it is closed in Maintenance.')],
  html: () => frame(F0, view('v-mt', tabs(2, 'maintenance') + maint(), false)),
  steps: [
    { cap: tx('Record a check on {code}: a walkie stacker has five points.', { code: 'STK-01' }), read: S(tx('Wheels, hydraulics, handle and forks, and its battery and charger, as it is powered.'), tx('The forks drop slowly with a load on them.')),
      dev: '<b>pointsOf()</b> adds Battery and charger for powered MHE (electric pallet jacks, walkie stackers and forklifts).', ev: [],
      run: async c => { paint(c, F0); c.cls('#v-eq .eqv-pt[data-k="hyd"]', 'glow', true); await c.wait(700); } },
    { cap: tx('Mark Hydraulics as Fail: the form says it fails the check.'), read: S(tx('{code} will go out of service, marked do not use on the map, until a check passes.', { code: 'STK-01' }), tx('Log it in Maintenance too is ticked.')),
      dev: 'A failed point turns Save red (<b>checkVals()</b>); the switch is the check’s issue flag, on by default.', ev: [],
      run: async c => { paint(c, F0); await c.tap('#v-eq .eqv-allok'); await c.tap('#v-eq .eqv-pt[data-k="hyd"] .fail'); paint(c, F1); } },
    { cap: tx('Say what you saw and save: {code} is out of service.', { code: 'STK-01' }), read: S(tx('Its pin turns black and its card says do not use.'), tx('The rail counts it until a check passes.')),
      dev: '<b>saveCheck()</b> sends <b>issue.log</b> first, then <b>equip.check</b> with result fail and the issue’s id.',
      ev: [E('issue.log', 'floor', { issue: 'mmvnkx1q7' }, { cat: 'safety', sev: 2, title: 'STK-01 failed its check: Hydraulics hold the load', note: 'Forks drop slowly with a load', loc: 'Stockroom', dept: null, x: 30, y: -1635, floor: 'ground' }),
        E('equip.check', 'floor', { equip: 'qmmiyb2k1' }, { day: DAY, result: 'fail', points: { wheels: 'ok', hyd: 'fail', handle: 'ok', forks: 'ok', batt: 'ok' }, note: 'Forks drop slowly with a load', issue: 'mmvnkx1q7' })],
      run: async c => { paint(c, F1); await c.tap('#v-eq .eqv-form .eqv-in.note'); c.cls('#v-eq .eqv-form .eqv-in.note', 'eqv-ph', false); await c.type('#v-eq .eqv-form .eqv-in.note', F2.chk.note); paint(c, F2); await c.tap('#v-eq .eqv-save'); paint(c, F3); toast(c, `${tx('{code} is out of service', { code: 'STK-01' })} · ${tx('issue logged')}`, 'warn'); } },
    { cap: tx('The fault is in Maintenance, for whoever fixes it.'), read: S(tx('A High safety issue, pinned where {code} lives, with the point that failed in its title.', { code: 'STK-01' }), tx('It is worked and closed there like any other fault.')),
      dev: 'The issue is an ordinary <b>issue.log</b>; Maintenance (js/views/maintenance.js) lists it newest first.', ev: [],
      run: async c => { c.hide('.pc2 > .dv-toast'); await c.tap(`#v-eq .pc2-gtab[data-t="maintenance"]`); c.view('v-mt'); } },
    { cap: tx('Fixed: a check that passes brings it back into service.'), read: S(tx('Record a check on {code} again: All OK, then Save.', { code: 'STK-01' }), tx('It is back in service, due again in a month.')),
      dev: 'An ok <b>equip.check</b> clears the out-of-service mark and logs Back in service.',
      ev: [E('equip.check', 'floor', { equip: 'qmmiyb2k1' }, { day: DAY, result: 'ok', points: { wheels: 'ok', hyd: 'ok', handle: 'ok', forks: 'ok', batt: 'ok' } })],
      run: async c => { await c.tap('#v-mt .pc2-gtab[data-t="equipment"]'); c.view('v-eq'); paint(c, F3); await c.tap('#v-eq .eqv-card .eqv-rec'); paint(c, F3B); await c.tap('#v-eq .eqv-save'); paint(c, F4); toast(c, tx('{code} checked OK', { code: 'STK-01' })); } },
  ],
});

// ── What if a ladder moves? ──────────────────────────────────────────
// LAD-02 goes from aisle 8 to aisle 20.
const M0 = mut(BASE(), s => { s.sel = s.items.lad02.id; });
const MD = it => ({ edit: true, id: it.id, kind: it.kind, code: it.code, name: it.name, loc: it.loc, every: it.every, due: it.due, placed: true, x: it.x, y: it.y });
const M1 = mut(M0, s => { s.mode = 'edit'; s.draft = MD(s.items.lad02); s.spot = [320, -40]; });
const M2 = mut(M1, s => { Object.assign(s.draft, { x: 320, y: -40 }); s.spot = null; });
const M3 = mut(M2, s => { s.draft.loc = 'Floor, aisle 20'; });
const M4 = mut(M0, s => { const it = s.items.lad02; Object.assign(it, { x: 320, y: -40, loc: 'Floor, aisle 20' }); it.log.push({ d: DAY, a: 'Moved' }); });
equip.stories.push({
  id: 'move', title: tx('What if a ladder moves?'), blurb: tx('Move it on the map: its pin goes where you click, and its card keeps its checks.'),
  know: [tx('Move on the map opens its details with its place; click where it lives now.'), tx('Where it lives is the words on its card and the check sheet: change them too if they no longer fit.'),
    tx('Show on map takes the map to its pin.'), tx('Its checks and its next due date stay as they were.'), tx('The card’s history says Moved.')],
  html: () => frame(M0),
  steps: [
    { cap: tx('{code}’s card: Move on the map.', { code: 'LAD-02' }), read: S(tx('The map waits for a click where it lives now.'), tx('Its details open beside it, with its place.')),
      dev: 'Move opens the draft with the item’s place (<b>draftForm()</b> in edit); the toast asks for the new spot.', ev: [],
      run: async c => { paint(c, M0); await c.tap('#v-eq .eqv-card .eqv-mv'); paint(c, M1); toast(c, tx('Tap the map where it lives now')); } },
    { cap: tx('Click its new spot on the map.'), read: S(tx('The pin moves to where you click.'), tx('Click again if it is not quite right.')),
      dev: 'The click sets the draft’s x, y and floor in map units.', ev: [],
      run: async c => { paint(c, M1); c.hide('.pc2 > .dv-toast'); await c.tap('#v-eq .eqv-spot'); paint(c, M2); } },
    { cap: tx('Say where it lives now, then Save changes.'), read: S(tx('Type where it lives now: {where}.', { where: 'Floor, aisle 20' }), tx('Its checks and its next due date stay as they were.')),
      dev: '<b>saveDraft()</b> sends <b>equip.update</b> with only what changed; the reducer logs Moved when only its place changed.',
      ev: [E('equip.update', 'floor', { equip: 'qmmiyaao0' }, { x: 320, y: -40, floor: 'ground', loc: 'Floor, aisle 20' })],
      run: async c => { paint(c, M2); await c.tap('#v-eq .eqv-form .eqv-in.loc'); c.text('#v-eq .eqv-form .eqv-in.loc', ''); await c.type('#v-eq .eqv-form .eqv-in.loc', 'Floor, aisle 20'); paint(c, M3); await c.tap('#v-eq .eqv-form .eqv-save'); paint(c, M4); toast(c, tx('Saved')); } },
  ],
});

// ── What if a piece is retired? ──────────────────────────────────────
// PJ-01 is replaced; a manager removes it, then brings it back from Removed.
const R0 = mut(BASE(), s => { s.sel = s.items.pj01.id; });
const R1 = mut(R0, s => { s.mode = 'remove'; s.rm = { why: '', note: '' }; });
const R2 = mut(R1, s => { s.rm = { why: 'retired', note: 'Replaced by PJ-02' }; });
const R3 = mut(BASE(), s => { const it = s.items.pj01; it.removed = { at: DAY, why: 'retired', note: 'Replaced by PJ-02' }; it.log.push({ d: DAY, a: 'Removed', n: 'Replaced by PJ-02' }); });
const R4 = mut(R3, s => { s.filter = 'removed'; s.sel = s.items.pj01.id; });
equip.stories.push({
  id: 'retire', title: tx('What if a piece is retired?'), blurb: tx('A manager removes it and says why: it leaves the map and the list, and keeps its history.'),
  know: [tx('Only a manager removes equipment: the store PC signed in with the manager code, or a manager’s phone.'), tx('Why is it going? is one of five: retired, broken beyond repair, lost or stolen, moved to another store, or added by mistake.'),
    tx('It leaves the map and the list, not the history: its checks stay.'), tx('Undo in the toast puts it back for a few seconds; after that, Removed lists it with Bring it back.'),
    tx('A removed piece’s code is free for a new one.')],
  html: () => frame(R0),
  steps: [
    { cap: tx('{code}’s card: Remove.', { code: 'PJ-01' }), read: S(tx('The shield says it is for managers only.'), tx('Pick why it is going.')),
      dev: 'Remove is drawn only for a manager (<b>removeForm()</b>); <b>equip.remove</b> is a manager event in shared/catalogue.js.', ev: [],
      run: async c => { paint(c, R0); await c.tap('#v-eq .eqv-card .eqv-rm'); paint(c, R1); } },
    { cap: tx('Retired, with a note: {note}.', { note: 'Replaced by PJ-02' }), read: S(tx('The note goes into its history.'), tx('Remove {code} waits until a reason is picked.', { code: 'PJ-01' })),
      dev: 'The reasons are the reducer’s EQUIP_WHY.', ev: [],
      run: async c => { paint(c, R1); await c.tap('#v-eq .eqv-why[data-w="retired"]'); c.cls('#v-eq .eqv-why[data-w="retired"]', 'on', true); await c.tap('#v-eq .eqv-form .eqv-in.note'); c.cls('#v-eq .eqv-form .eqv-in.note', 'eqv-ph', false); await c.type('#v-eq .eqv-form .eqv-in.note', 'Replaced by PJ-02'); paint(c, R2); } },
    { cap: tx('Remove {code}: it leaves the map and the list.', { code: 'PJ-01' }), read: S(tx('The toast has Undo for a few seconds.'), tx('A Removed filter appears beside the others.')),
      dev: '<b>equip.remove</b>; Undo sends <b>equip.restore</b>. Removing keeps the item and its log.',
      ev: [E('equip.remove', 'floor', { equip: 'qmmiyc7d4' }, { why: 'retired', note: 'Replaced by PJ-02' })],
      run: async c => { paint(c, R2); await c.tap('#v-eq .eqv-form .eqv-save'); paint(c, R3); toast(c, tx('{code} removed', { code: 'PJ-01' }), '', tx('Undo')); } },
    { cap: tx('Removed lists it, with Bring it back.'), read: S(tx('Its card says when and why it went.'), tx('A manager can bring it back with all its checks.')),
      dev: 'Removed shows the items with <b>removed</b> set; Bring it back sends <b>equip.restore</b>, refused if its code is in use again.', ev: [],
      run: async c => { paint(c, R3); c.hide('.pc2 > .dv-toast'); await c.tap('#v-eq .eqv-pills b[data-f="removed"]'); paint(c, R4); } },
  ],
});
