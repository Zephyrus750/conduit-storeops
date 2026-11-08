// Chapter: Price checks on the phone, the Floor › Labels tab
// as the app has it today (js/views/labelint.js mobile(), mobileBar(),
// mobileInner() and liStrip(), the strip from js/shell.js mountStrip): the
// cycle on the map, the departments and the wrong labels under the arrow, a
// shelf opening its micro-department, a wrong price logged, Checked, and
// another phone's check arriving. Three What ifs play on the same phone.
// The map is the real part of Busselton 1241's used by Location refresh
// (js/guide/labels-map.js): the Kitchen runs A8 to A23, each shelf
// on its own micro-department. The cycle: October 2026 (monthly, the store's
// setting), Sunday 25 October with 6 days left, 46 of the 77 numbered
// micro-departments checked, one wrong label found so far (K2 047).
import { tx, txn, locale } from '../../i18n.js';
import { fmtDate, DEPT_COLOUR, depInk } from '../../ui.js';
import { ai, phone2, toast2 } from '../frames.js';
import { liMap } from '../labels-map.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const CY = '2026-10M', LEFT = 6, TOTAL = 77;
const ev = (type, micro, payload = {}, extra) => E(type, 'floor', { micro, cycle: CY }, payload, extra);
// The cycle as the app names it (cycleLabel in js/views/labelint.js) and a day as fmtDate writes it.
const cyc = () => new Date(2026, 9, 1).toLocaleString(locale(), { month: 'long', year: 'numeric' });
const day = d => fmtDate(`2026-10-${d}T12:00:00+08:00`);

// ── the cycle ────────────────────────────────────────────────────────
// Every department (js/data/micros.js SUBS) with its micro-departments
// checked: Kitchen's come from the state, the rest are as the day found them.
const SUBS = [['h1', 'Kitchen', 0, 5], ['h2', 'Bed, Bath, Laundry', 0, 6], ['h3', 'Decor & Pets', 0, 5], ['h4', 'Stationery', 7, 9], ['c1', 'Women’s Clothing', 12, 12], ['c2', 'Men’s Clothing', 6, 6], ['c3', 'Footwear', 3, 3],
  ['c4', 'Cosmetics & Accessories', 4, 6], ['k1', 'Active', 3, 6], ['k2', 'Toys', 2, 4], ['k3', 'Nursery / Party', 3, 6], ['k4', 'Kids’ Clothing', 4, 8], ['flex', 'Flex', 0, 1]];
const OTHERS = 44;   // checked outside the Kitchen
const KITCHEN = [['021', 'Seasonal Food'], ['023', 'Books'], ['038', 'Kitchen'], ['040', 'Dining'], ['056', 'Appliances']];
const NAME = Object.fromEntries(KITCHEN.map(([c, n]) => ['h1-' + c, n]));
// The wrong labels this cycle: [micro, keycode, what is wrong, day].
const W0 = [['k2-047', '42977636', 'ticket $12, shelf edge $10', 22]];
const WRONG = { 'k2-047': '047 Action/Vehicle Toys', 'h1-056': '056 Appliances', 'h1-040': '040 Dining' };
// A state: checked (micro-departments on the map), wrong (the list), open
// (the micro-department in hand), when (the day each Kitchen one was checked),
// tapped (the shelf last tapped), sheet ('' | depts | h1 | end | micro | form),
// kc, note and focus (the form as typed, and the box being typed in).
const at = o => ({ checked: ['h1-038', 'h1-021', 'c1-004', 'c1-005', 'c1-052'], wrong: W0, open: '', tapped: '', sheet: '', kc: '', note: '', focus: '', when: {}, ...o });
const kitchen = s => s.checked.filter(m => m.startsWith('h1-')).length;
const count = s => OTHERS + kitchen(s);

// ── the screens ──────────────────────────────────────────────────────
const badge = s => tx('<b>{done}</b> of {total} · {cycle}', { done: count(s), total: TOTAL, cycle: cyc() });
const tools = () => `<div class="lb2-tools"><span class="scan">${ai('barcode')}</span><span>${ai('plus')}</span><span>${ai('minus')}</span><span>${ai('map')}</span></div>`;
const tog = open => `<span class="lb2-tog">${ai('chev', open ? '' : 'up')}</span>`;
// The strip (liStrip in js/views/labelint.js): the cycle's count, the
// micro-department in hand with its button, or Wrong label while the form is open.
function strip(s) {
  const open = !!s.sheet;
  if (s.sheet === 'form') return `<span class="lb2-st">${ai('alert')}<b>${tx('Wrong label')}</b><span class="s">${s.open}</span></span>` + tog(open);
  if (s.open) { const c = s.checked.includes(s.open); return `<span class="lb2-st">${ai('m-labelint')}<b>${s.open.slice(3)}</b><span class="s">${NAME[s.open]}</span><span class="lb2-act${c ? '' : ' go'}">${ai('check')}${c ? tx('Checked') : tx('Mark checked')}</span></span>` + tog(open); }
  return `<span class="lb2-st">${ai('m-labelint')}<b>${tx('Labels')}</b><span class="n">${count(s)} / ${TOTAL}</span><span class="s">${tx('{n}d left · tap a shelf', { n: LEFT })}</span></span>` + tog(open);
}
const bar = (n, of, col) => `<span class="lb2-bar"><i style="width:${Math.min(100, Math.round(100 * n / of))}%;background:${col}"></i></span>`;
const dep = d => `<span class="lb2-dep" style="background:${DEPT_COLOUR[d]};color:${depInk(DEPT_COLOUR[d])}">${d.toUpperCase()}</span>`;
// The sheet (mobileBar and mobileInner in js/views/labelint.js).
function panel(s) {
  const n = count(s), head = `<div class="lb2-sxh">${ai('m-labelint')}${tx('Label check')}<span class="n">${n} / ${TOTAL}</span></div>` +
    `<div class="lb2-sxsub">${txn(LEFT, '{cycle} · {n} day left', '{cycle} · {n} days left', { cycle: cyc() })}</div>${bar(n, TOTAL, '#0E7CA8')}`;
  if (s.sheet === 'form') return head + `<label class="lb2-fld"><span>${tx('Keycode')}</span><span class="lb2-in kc${s.focus === 'kc' ? ' on' : ''}">${s.kc}</span></label>` +
    `<label class="lb2-fld"><span>${tx('What is wrong')}</span><span class="lb2-in nt${s.focus === 'nt' ? ' on' : ''}">${s.note}</span></label>` +
    `<div class="lb2-two" style="margin-top:0"><span class="lb2-big log">${ai('check')}${tx('Log variance')}</span><span class="lb2-ghost">${tx('Cancel')}</span></div>`;
  if (s.sheet === 'micro') {
    const c = s.checked.includes(s.open), w = { cycle: cyc(), n: LEFT, sub: 'H1' };
    return head + `<div class="lb2-hint">${c ? tx('{cycle} · <b>{n}d left</b> · {sub} · checked {date}', { ...w, date: day(s.when[s.open] || 25) }) : tx('{cycle} · <b>{n}d left</b> · {sub} · not checked yet', w)}</div>` +
      `<div class="lb2-two"><span class="lb2-big chk${c ? ' sec' : ''}">${ai('check')}${c ? tx('Uncheck') : tx('Checked')}</span><span class="lb2-big warn pw">${ai('alert')}${tx('Price is wrong')}</span></div><div class="lb2-hint"><a>${tx('Choose another')}</a></div>`;
  }
  const rows = SUBS.map(([d, name, done, of]) => { const k = d === 'h1' ? kitchen(s) : done;
    return `<div class="lb2-r" data-sub="${d}">${dep(d)}<span class="k"><b>${name}</b></span>${bar(k, of, DEPT_COLOUR[d])}<span class="v">${k}/${of}</span></div>` +
      (d === 'h1' && s.sheet !== 'depts' ? KITCHEN.map(([code, nm]) => { const on = s.checked.includes('h1-' + code); return `<div class="lb2-r" data-micro="h1-${code}"><span class="mc">${code}</span><span class="k"><b>${nm}</b></span><span class="v ${on ? 'ok' : 'dim'}">${on ? tx('Checked') : tx('Not yet')}</span></div>`; }).join('') : ''); }).join('');
  const wrong = s.wrong.slice(0, 5).map(([m, kc, note, d]) => `<div class="lb2-r">${ai('alert')}<span class="k"><b>${WRONG[m]}</b><span>${tx('Keycode {code}', { code: kc })} · ${note}</span></span><span class="v warn">${day(d)}</span></div>`).join('');
  return head + `<div class="lb2-sec"><div class="lb2-sl">${tx('By department')}<span>${tx('tap one to list it')}</span></div><div class="lb2-rows">${rows}</div></div>` +
    `<div class="lb2-sec"><div class="lb2-sl">${tx('Wrong labels this cycle')}<span>${tx('{n} found', { n: s.wrong.length })}</span></div><div class="lb2-rows">${wrong}</div></div>`;
}
// Repaints the map, its badge, the strip and the sheet for a state.
const marks = s => ({ ...s, wrong: s.wrong.map(w => w[0]) });
function paint(c, s) {
  c.html('.lb2-map', liMap(marks(s))); c.html('.lb2-badge', badge(s)); c.html('.p2-strip', strip(s));
  c.html('.lb2-pan', s.sheet ? panel(s) : ''); c.cls('.lb2-pan', 'end', s.sheet === 'end'); if (s.sheet) c.show('.lb2-pan'); else c.hide('.lb2-pan');
}
const phone = (s = at()) => phone2('lb', `<div class="lb2-mv"><div class="lb2-map">${liMap(marks(s))}</div><div class="lb2-badge">${badge(s)}</div>${tools()}</div><div class="lb2-pan${s.sheet === 'end' ? ' end' : ''}"${s.sheet ? '' : ' hidden'}>${s.sheet ? panel(s) : ''}</div>`,
  { area: 'floor', on: 'labelint', strip: strip(s) });
// The app's toast, over the strip.
const note = (c, text, tone = '') => toast2(c, text, tone);
// Taps the form's boxes and types into them.
const typeIn = async (c, kc, nt) => { await c.tap('.lb2-pan .kc'); c.cls('.lb2-pan .kc', 'on', true); await c.type('.lb2-pan .kc', kc); c.cls('.lb2-pan .kc', 'on', false); await c.tap('.lb2-pan .nt'); c.cls('.lb2-pan .nt', 'on', true); await c.type('.lb2-pan .nt', nt); };
// A step with nothing to tap leaves no finger on the last spot.
const still = c => c.cls('#lb .fg', 'show', false);

// The chapter's states, step by step.
const A16 = { open: 'h1-056', tapped: 'A16 S1' };
const KC = '43307685', WHY = 'ticket $15, shelf edge $12', W1 = [['h1-056', KC, WHY, 25], ...W0];
const S4 = at(A16), S5 = at({ ...A16, sheet: 'micro' }), S6 = at({ ...A16, sheet: 'form' });
const S7 = at({ ...A16, sheet: 'form', kc: KC, note: WHY, focus: 'nt' }), S8 = at({ ...A16, sheet: 'micro', wrong: W1 });
const S9 = at({ ...S8, checked: [...at().checked, 'h1-056'], when: { 'h1-056': 25 } });
const S10 = at({ ...S9, sheet: '', open: 'h1-040', tapped: 'A12 S1' });
const S11 = at({ ...S10, checked: [...S10.checked, 'h1-023'] });

// ── the chapter ──────────────────────────────────────────────────────
export const labels = {
  id: 'labels', grp: 'floor', icon: 'tag', title: tx('Price checks'), device: 'phone', where: tx('Phone · Floor › Labels'), for: ['floor', 'manager'],
  intro: S(tx('Each micro-department gets one label check per cycle.'), tx('Tap a shelf, fix or record the wrong labels, mark it checked.')),
  html: () => phone(),
  steps: [
    { cap: tx('Labels shows the cycle on the map.'), read: S(tx('Each numbered micro-department gets one label check per cycle: the badge and the strip count them, with the days left.'), tx('Green shelves are on a micro-department checked this cycle, red ones on one with a wrong label found; the rest are grey.')),
      dev: 'The phone view is <b>mobile()</b> in js/views/labelint.js: <b>marksFor()</b> marks each shelf from the micro-department it is assigned to, and styles/app.css (.map.real.li) colours it. The cycle is <b>cycleId()</b> in js/ui.js, monthly unless the store sets weekly or fortnightly.', ev: [],
      run: async c => { await c.wait(400); } },
    { cap: tx('The arrow opens the cycle: every department’s progress.'), read: S(tx('Each department shows how many of its micro-departments are checked.'), tx('Below them are the wrong labels found this cycle.')),
      dev: 'The sheet is <b>mobileBar()</b> in js/views/labelint.js, built from the <b>sx</b> blocks in js/map.js; the arrow is the shell’s (<b>mountStrip()</b> in js/shell.js). Nothing is sent.', ev: [],
      run: async c => { await c.tap('.p2-strip .lb2-tog'); paint(c, at({ sheet: 'depts' })); } },
    { cap: tx('Tap a department to list its micro-departments.'), read: S(tx('Kitchen has five: two are checked, three are not yet.'), tx('Tap one to open it.')),
      dev: 'A department row toggles its list (toggle-sub in js/views/labelint.js).', ev: [],
      run: async c => { await c.tap('.lb2-pan [data-sub="h1"]'); paint(c, at({ sheet: 'h1' })); } },
    { cap: tx('Further down: the wrong labels found this cycle.'), read: S(tx('Each with its micro-department, the keycode, what was wrong and the day.'), tx('The five newest show, with the count of all of them.')),
      dev: 'The list is the cycle’s <b>label.variance</b> events, newest first.', ev: [],
      run: async c => { still(c); await c.wait(500); paint(c, at({ sheet: 'end' })); } },
    { cap: tx('Close it and tap a shelf: its micro-department opens.'), read: S(tx('{shelf} is on {micro}, so it opens on the strip.', { shelf: 'A16 S1', micro: '056 Appliances' }), tx('All its shelves are outlined in purple: here runs {a} and {b}.', { a: 'A16', b: 'A18' })),
      dev: 'A tap calls <b>onSelect</b> in js/views/labelint.js, which finds the shelf’s micro-department. On a phone a tap never changes which shelves a micro-department has.', ev: [],
      run: async c => { await c.tap('.p2-strip .lb2-tog'); paint(c, at({ sheet: '' })); await c.tap('.lb2-svg [data-s="A16 S1"]'); paint(c, S4); } },
    { cap: tx('Check every label on its shelves, then open the arrow.'), read: S(tx('The sheet says whether it is checked this cycle.'), tx('Checked and Price is wrong are its two buttons.')),
      dev: 'With a micro-department open, the sheet is <b>mobileInner()</b> in js/views/labelint.js.', ev: [],
      run: async c => { await c.tap('.p2-strip .lb2-tog'); paint(c, S5); } },
    { cap: tx('A price is wrong? Fix the ticket, then tap Price is wrong.'), read: S(tx('It records the wrong label for this cycle.'), tx('The strip says Wrong label while the form is open.')),
      dev: 'Price is wrong opens the form in <b>mobileInner()</b>, and <b>liStrip()</b> shows Wrong label. Nothing is sent yet.', ev: [],
      run: async c => { await c.tap('.lb2-pan .pw'); paint(c, S6); } },
    { cap: tx('Type the keycode and what was wrong.'), read: S(tx('The keycode is on the ticket.'), tx('The box takes a keycode of 6 to 9 digits, not the item’s barcode.')),
      dev: 'The form is typed: this sheet has no camera. The code must pass <b>isKeycode()</b> (shared/keycode.js); an item barcode is told it is not a keycode.', ev: [],
      run: async c => { await typeIn(c, KC, WHY); paint(c, S7); } },
    { cap: tx('Log variance: it goes on the cycle’s list.'), read: S(tx('Every device has it at once.'), tx('The sheet goes back to the micro-department.')),
      dev: 'variance-save in js/views/labelint.js checks the digits, sends <b>label.variance</b> and looks the keycode up in the recall list (<b>recallFor()</b> in js/recallflag.js).',
      ev: [ev('label.variance', 'h1-056', { keycode: KC, note: WHY })],
      run: async c => { await c.tap('.lb2-pan .log'); paint(c, S8); note(c, tx('Variance logged')); } },
    { cap: tx('Every label checked: tap Checked.'), read: S(tx('The count goes up on every device.'), tx('The button turns to Uncheck, and the strip says Checked.')),
      dev: 'Checked sends <b>label.check</b> for the micro-department and the cycle; once it is checked the same button sends <b>label.uncheck</b>.', ev: [ev('label.check', 'h1-056')],
      run: async c => { await c.tap('.lb2-pan .chk'); paint(c, S9); } },
    { cap: tx('Close the sheet and tap the next shelf: the last one shows red.'), read: S(tx('A micro-department with a wrong label this cycle stays red, checked or not.'), tx('{shelf} opens {micro}, outlined in purple.', { shelf: 'A12 S1', micro: '040 Dining' })),
      dev: 'Closing the sheet lets go of the micro-department in hand (js/views/labelint.js), as leaving the Labels tab does. In <b>marksFor()</b> a wrong label wins over checked, and the open micro-department is outlined over both.', ev: [],
      run: async c => { await c.tap('.p2-strip .lb2-tog'); paint(c, at({ ...S9, sheet: '', open: '', tapped: '' })); await c.tap('.lb2-svg [data-s="A12 S1"]'); paint(c, S10); } },
    { cap: tx('Every device sees the count go up.'), read: S(tx('A colleague checks {micro} on their phone: its shelves turn green on yours.', { micro: '023 Books' }), tx('Nobody refreshes anything.')),
      dev: 'Floor events go to every device in the store; <b>mount()</b> in js/views/labelint.js repaints the view whenever the labels change.', ev: [ev('label.check', 'h1-023')],
      run: async c => { still(c); await c.wait(900); paint(c, S11); } },
  ],
  whatif: [[tx('No wifi in that aisle?'), S(tx('Keep checking.'), tx('It sends when the phone is back in range.'))]],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
labels.stories.push({
  id: 'noshelf', title: tx('What if a shelf isn’t on a micro-department?'), blurb: tx('Nothing opens and it says so: open the micro-department from the list instead.'),
  know: [S(tx('A tap opens the micro-department the shelf is assigned to.'), tx('A shelf on none yet says so, and nothing is sent.')),
    tx('Only a store PC assigns shelves: Assign shelves on its Label integrity screen, or Settings › Departments.'),
    tx('Each shelf is assigned on its own, so the two sides of a run can be on different micro-departments.'),
    tx('Any micro-department can still be opened from the list under the arrow.')],
  steps: [
    { cap: tx('Tap a shelf that isn’t on a micro-department: it says so.'), read: tx('{shelf} is on none yet, so nothing opens.', { shelf: 'A4 S1' }),
      dev: '<b>onSelect</b> in js/views/labelint.js finds no micro-department for the shelf and shows a toast; a phone never assigns.', ev: [],
      run: async c => { await c.tap('.lb2-svg [data-s="A4 S1"]'); paint(c, at({ tapped: 'A4 S1' })); note(c, tx('{code} is not on a micro-department yet', { code: 'A4 S1' })); } },
    { cap: tx('Open the arrow and tap the department.'), read: tx('Its micro-departments are listed, checked or not yet.'), dev: 'The list is <b>mobileBar()</b>; nothing is sent.', ev: [],
      run: async c => { await c.tap('.p2-strip .lb2-tog'); paint(c, at({ tapped: 'A4 S1', sheet: 'depts' })); await c.tap('.lb2-pan [data-sub="h1"]'); paint(c, at({ tapped: 'A4 S1', sheet: 'h1' })); } },
    { cap: tx('Tap the micro-department: it opens as a shelf would open it.'), read: S(tx('Its shelves are outlined on the map behind the sheet.'), tx('Checked and Price is wrong work the same.')),
      dev: 'A row in the list selects the micro-department (select in js/views/labelint.js).', ev: [],
      run: async c => { await c.tap('.lb2-pan [data-micro="h1-040"]'); paint(c, at({ tapped: 'A4 S1', open: 'h1-040', sheet: 'micro' })); } },
  ],
});
const RC = '43125715', RWHY = 'ticket $29, shelf edge $25', A12 = { open: 'h1-040', tapped: 'A12 S1' };
labels.stories.push({
  id: 'recall', title: tx('What if the product is recalled?'), blurb: tx('The wrong label is logged, and a red message says to move the stock to the recall bay.'),
  know: [S(tx('Every keycode logged is checked against the store’s recall list.'), tx('Every device holds the list, so this works without wifi.')),
    tx('A recalled product can’t be sold: move it to the recall bay and tell a manager.'), tx('The wrong label is logged all the same.'),
    S(tx('The box takes a keycode of 6 to 9 digits, not the item’s barcode.'), tx('A shorter code is turned away and nothing is sent.'))],
  html: () => phone(at({ ...A12 })),
  steps: [
    { cap: tx('Open the arrow and tap Price is wrong.'), read: tx('{micro} is open: a sandwich press is ticketed wrong.', { micro: '040 Dining' }), dev: 'Nothing is sent yet.', ev: [],
      run: async c => { await c.tap('.p2-strip .lb2-tog'); paint(c, at({ ...A12, sheet: 'micro' })); await c.tap('.lb2-pan .pw'); paint(c, at({ ...A12, sheet: 'form' })); } },
    { cap: tx('A digit short? It is turned away.'), read: tx('A shorter code is turned away and nothing is sent.'),
      dev: 'variance-save in js/views/labelint.js checks the code with <b>isKeycode()</b> (shared/keycode.js) before it sends; the reducer checks it again.', ev: [],
      run: async c => { await c.tap('.lb2-pan .kc'); c.cls('.lb2-pan .kc', 'on', true); await c.type('.lb2-pan .kc', '43125'); paint(c, at({ ...A12, sheet: 'form', kc: '43125', focus: 'kc' })); await c.tap('.lb2-pan .log'); paint(c, at({ ...A12, sheet: 'form', kc: '43125' })); note(c, tx('Type a keycode of 6 to 9 digits'), 'bad'); } },
    { cap: tx('Type the whole keycode and what was wrong.'), read: tx('The keycode is on the ticket.'), dev: 'The form is typed.', ev: [],
      run: async c => { paint(c, at({ ...A12, sheet: 'form', kc: '' })); await typeIn(c, RC, RWHY); paint(c, at({ ...A12, sheet: 'form', kc: RC, note: RWHY, focus: 'nt' })); } },
    { cap: tx('Log variance: a red message says the product is recalled.'), read: S(tx('The wrong label is logged all the same.'), tx('Then take the stock off the shelf to the recall bay and tell a manager.')),
      dev: 'After <b>label.variance</b>, <b>recallFor()</b> in js/recallflag.js finds the keycode on the recall list and the toast says so, recall or withdrawal (<b>recallWord()</b>), with the store’s recall bay when it has one.',
      ev: [ev('label.variance', 'h1-040', { keycode: RC, note: RWHY })],
      run: async c => { await c.tap('.lb2-pan .log'); paint(c, at({ ...A12, sheet: 'micro', wrong: [['h1-040', RC, RWHY, 25], ...W0] }));
        note(c, `${tx('Variance logged')}. ${tx('Recalled')} · Sandwich Press 2 Slice. ${tx('Move it to the recall bay and tell a manager.')}`, 'bad'); } },
  ],
});
labels.stories.push({
  id: 'uncheck', title: tx('What if you marked the wrong one checked?'), blurb: tx('Tap Checked again: the check comes off for everyone.'),
  know: [tx('Checked on the strip, or Uncheck in the sheet, takes the check back; the count drops on every device.'),
    tx('Nothing is deleted: the check and the uncheck both stay in the store’s log.'), tx('A wrong label, once logged, stays on the cycle’s list.'),
    tx('A check counts for its cycle: the next cycle starts with none.')],
  html: () => phone(at({ ...A12 })),
  steps: [
    { cap: tx('Mark checked by mistake: the count goes up.'), read: tx('{micro} isn’t done yet, but it is marked checked.', { micro: '040 Dining' }),
      dev: 'The strip’s button sends <b>label.check</b>.', ev: [ev('label.check', 'h1-040')],
      run: async c => { await c.tap('.p2-strip .lb2-act'); paint(c, at({ ...A12, checked: [...at().checked, 'h1-040'] })); } },
    { cap: tx('Tap Checked again: the check comes off.'), read: S(tx('The count goes back down, on every device.'), tx('Mark checked is back, for when it is really done.')),
      dev: 'On a checked micro-department the same button sends <b>label.uncheck</b>.', ev: [ev('label.uncheck', 'h1-040')],
      run: async c => { await c.tap('.p2-strip .lb2-act'); paint(c, at({ ...A12 })); } },
  ],
});
