// Chapter: Location refresh on the phone, the Floor › Refresh
// tab as the app has it today (js/views/refresh.js mobile(), the strip from
// js/shell.js mountStrip, the scan sheet and the week's panel): tap a shelf,
// take a mark off, scan shelf labels with the camera, type one, read the week.
// Three What ifs play on the same phone.
// The map is a real part of Busselton 1241's (js/guide/refresh-map.js):
// the Kitchen runs A8 to A23. The week: Sunday 25 October 2026, week 2026-W43
// (P5W1), focus H1 Kitchen and K2 Toys; nine Kitchen shelves and fourteen
// Toys shelves are done already, 23 of 100.
import { tx, txn } from '../../i18n.js';
import { ai, phone2, sheet, unsheet, toast2, tally } from '../frames.js';
import { mapSvg, code128, dep, DEPT, SHELVES, VIEW, viewOn } from '../refresh-map.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const WK = '2026-W43';
const mark = (segment, dept = 'h1', extra) => E('refresh.mark', 'floor', { segment, week: WK }, { dept }, extra);
const TARGET = 100, FOCUS = ['h1', 'k2'], TOTAL = { h1: 66, k2: 97 };
const deptOf = code => SHELVES.find(s => s[0] === code)?.[1];
const bySeg = (a, b) => a.localeCompare(b, 'en', { numeric: true });

// ── the week ─────────────────────────────────────────────────────────
// Kitchen shelves done before the chapter starts (on the map), and the Toys
// shelves done elsewhere in the store (in the panel's list only).
const H1_0 = ['A12 E1', 'A12 E2', 'A12 S1', 'A12 S2', 'A13 S1', 'A13 S2', 'A14 E2', 'A14 S1', 'A14 S2'];
const K2 = ['K11 E1', 'K11 E2', 'K11 S1', 'K11 S2', 'K16 E1', 'K16 E2', 'K16 S1', 'K16 S2', 'K18 E1', 'K18 E2', 'K18 S1', 'K18 S2', 'K20 S1', 'K20 S2'];
// A state: done (the drawn shelves done), sel (the shelf last tapped),
// view, plan { shelf: colour }, planMode, colour (the one picked in Plan).
const at = o => ({ done: H1_0, sel: '', view: VIEW, plan: {}, planMode: false, colour: '#a855f7', ...o });
const counted = s => s.done.filter(c => FOCUS.includes(deptOf(c))).length + K2.length;

// ── the screens ──────────────────────────────────────────────────────
const badge = s => tx('<b>{n}</b> / {target} this week · focus {depts}', { n: counted(s), target: TARGET, depts: FOCUS.map(d => d.toUpperCase()).join(' ') });
const tog = open => `<span class="rf-tog">${ai('chev', open ? '' : 'up')}</span>`;
// The strip above the tabs (js/views/refresh.js rfStrip), and the shell's arrow.
const strip = (s, open = false) => (s.planMode
  ? `<span class="rf-st">${ai('m-refresh')}<b>${tx('Planning')}</b><span class="s">${tx('Tap shelves to paint them')}</span><span class="rf-act">${ai('check')}${tx('Done')}</span></span>`
  : `<span class="rf-st">${ai('m-refresh')}<b>${tx('Refresh')}</b><span class="n">${counted(s)} / ${TARGET}</span><span class="s"></span><span class="rf-act go">${ai('barcode')}${tx('Scan or type')}</span></span>`) + tog(open);
const tools = () => `<div class="rf-tools"><span class="scan">${ai('barcode')}</span><span>${ai('plus')}</span><span>${ai('minus')}</span><span>${ai('map')}</span></div>`;
const PLAN = ['#a855f7', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
// The week's panel, opened from the arrow (js/views/refresh.js mobileBar):
// the count, the focus departments, then the shelves done by department.
function panel(s) {
  const n = counted(s), bar = (a, b, col = '#0E7CA8') => `<span class="rf-bar"><i style="width:${Math.min(100, Math.round(100 * a / b))}%;background:${col}"></i></span>`;
  const head = `<div class="rf-sxh">${ai('m-refresh')}${tx('Location refresh')}<span class="n">${n} / ${TARGET}</span></div><div class="rf-sxsub">${txn(1, 'This week · {period} · {n} day left', 'This week · {period} · {n} days left', { period: 'P5W1' })}</div>${bar(n, TARGET)}`;
  const tg = `<span class="rf-tg"><span data-m="refresh"${s.planMode ? '' : ' class="on"'}>${tx('Refresh')}</span><span data-m="plan"${s.planMode ? ' class="on"' : ''}>${tx('Plan')}</span></span>`;
  if (s.planMode) return head + `<div class="rf-row"><span class="rf-pal">${PLAN.map(c => `<i data-c="${c}" style="background:${c}"${s.colour === c ? ' class="on"' : ''}></i>`).join('')}<i class="er">${ai('x')}</i></span>${tg}</div><div class="rf-sxsub">${tx('Tap a shelf to paint it for the team. Tap the same colour again to clear.')}</div>`;
  const done = { h1: [], k2: K2, c1: [], h2: [] };
  for (const c of s.done) done[deptOf(c)].push(c);
  const focus = FOCUS.map(d => `<div class="rf-r">${dep(d)}<span class="k"><b>${DEPT[d][2]}</b></span>${bar(done[d].length, TOTAL[d], DEPT[d][0])}<span class="rf-v">${done[d].length}/${TOTAL[d]}</span></div>`).join('');
  const all = Object.values(done).flat().length, out = all - n;
  const groups = Object.entries(done).filter(([, l]) => l.length).sort((a, b) => a[0].localeCompare(b[0])).map(([d, l]) => {
    const segs = [...l].sort(bySeg), shown = segs.slice(0, 8);
    return `<div class="rf-mgrp"><div class="rf-mgh">${dep(d)}<b>${DEPT[d][2]}</b><span class="n">${segs.length}</span></div><div class="rf-chips">${shown.map(c => `<span class="rf-chip" data-chip="${c}">${c}</span>`).join('')}${segs.length > 8 ? `<span class="rf-chip more">${tx('+{n} more', { n: segs.length - 8 })}</span>` : ''}</div></div>`;
  }).join('');
  return head + `<div class="rf-row"><span class="rf-scanbtn">${ai('barcode')}<span>${tx('Scan or type')}</span></span>${tg}</div>` +
    `<div class="rf-sec"><div class="rf-sl">${tx('This week’s focus')}<span>${tx('set by managers')}</span></div><div class="rf-rows">${focus}</div></div>` +
    `<div class="rf-sec"><div class="rf-sl">${tx('Completed this week')}<span>${out > 0 ? txn(all, '{n} shelf · {out} outside the focus', '{n} shelves · {out} outside the focus', { out }) : txn(all, '{n} shelf', '{n} shelves')}</span></div><div class="rf-mdone">${groups}</div></div>`;
}
// Repaints the map, its badge, the strip and the panel for a state.
const paint = (c, s, open = false) => { c.html('.rf-map', mapSvg(s)); c.html('.rf-badge', badge(s)); c.html('.p2-strip', strip(s, open)); c.html('.rf-panel', panel(s)); };
const openPanel = (c, s) => { paint(c, s, true); c.show('.rf-panel'); };
const closePanel = (c, s) => { c.hide('.rf-panel'); paint(c, s, false); };

// The scan sheet (js/views/refresh.js scanSheet): the camera, a box to type
// the shelf in, and what the last label did.
const scanSheet = (last = null) => `<div class="sh-h"><b>${tx('Mark a shelf refreshed')}</b><span class="sh-x">${ai('x')}</span></div>` +
  `<div class="sh-b"><span class="rf-big">${ai('camera')}${tx('Scan with the camera')}</span>` +
  `<div><span class="rf-lbl">${tx('Or type the shelf')}</span><div class="rf-field">${ai('barcode')}<span class="rf-in rf-ph">${tx('e.g. A16 S1')}</span><span class="rf-mark">${tx('Mark')}</span></div></div>` +
  (last ? `<div class="rf-last ${last[0]}">${ai(last[0] === 'ok' ? 'check' : 'alert')}<span>${last[1]}</span></div>` : `<div class="rf-last">${tx('Each label marks its shelf refreshed for the whole team.')}</div>`) + '</div>';
const okLine = code => ['ok', tx('{code} marked refreshed', { code })];
// Types a shelf into the sheet's box and taps Mark.
const typeIn = async (c, text) => { c.cls('.p2-sheet .rf-in', 'rf-ph', false); await c.type('.p2-sheet .rf-in', text); await c.tap('.p2-sheet .rf-mark'); };
// The app's toast, over the strip: its words and, for a mark, Undo.
const note = (c, text, undo = false, tone = '') => toast2(c, `<span>${text}</span>${undo ? `<u>${tx('Undo')}</u>` : ''}`, tone);

// The camera (js/scan.js openScanner, continuous), titled as the sheet's
// button: shelf labels on the shelf edge, one per hold.
const tag = code => `<div class="rf-tag">${code128(code)}<b>${code}</b></div>`;
const camera = () => `<div class="cam2 rf-cam" hidden><div class="cam2-top"><b>${tx('Scan shelf labels')}</b><span>${ai('bolt')}</span><span data-camx>${ai('x')}</span></div>` +
  `<div class="cam2-v"><div class="rf-camsc">${tag('A016S02')}${tag('A016E1')}</div><div class="cam2-aim"></div><div class="cam2-hint">${tx('Point the camera at the barcode')}</div></div>` +
  `<div class="cam2-f"><span>${tx('Or type the code')}</span><span>${ai('arrow')}</span></div><div class="cam2-t"></div></div>`;

const phone = (s = at()) => phone2('rf', `<div class="rf-mv"><div class="rf-map">${mapSvg(s)}</div><div class="rf-badge">${badge(s)}</div>${tools()}</div><div class="rf-panel" hidden>${panel(s)}</div>`,
  { area: 'floor', on: 'refresh', strip: strip(s), extra: camera() });

// The chapter's states, step by step.
const A16 = ['A16 S1', 'A16 S2', 'A16 E1', 'A16 E2'];
const S2 = at({ done: [...H1_0, 'A16 S1'], sel: 'A16 S1' });
const S3a = at({ done: [...S2.done, 'A18 S1'], sel: 'A18 S1' }), S3 = at({ done: S2.done, sel: 'A18 S1' });
const S5 = at({ done: [...S2.done, 'A16 S2'], sel: 'A18 S1' }), S6 = at({ done: [...S5.done, 'A16 E1'], sel: 'A18 S1' });
const S8 = at({ done: [...H1_0, ...A16], sel: 'A18 S1' });
const S11 = at({ ...S8, view: viewOn('A14 S1') });
const S12 = at({ ...S11, done: [...S8.done, 'A18 S1', 'A18 S2'] });

// ── the chapter ──────────────────────────────────────────────────────
export const refresh = {
  id: 'refresh', grp: 'floor', icon: 'refresh', title: tx('Location refresh'), device: 'phone', where: tx('Phone · Floor › Refresh'), for: ['floor', 'manager'],
  intro: S(tx('As you refresh shelves, mark them on the map.'), tx('The week counts toward 100 in the focus departments.')),
  html: () => phone(),
  steps: [
    { cap: tx('Refresh shows this week on the map.'), read: S(tx('Open Refresh from the tabs and pinch into your aisle.'), tx('Green shelves are done this week; grey ones with an orange edge are in this week’s focus and still to do.'), tx('Faint shelves are outside the focus.')),
      dev: 'The phone view is <b>mobile()</b> in js/views/refresh.js: <b>marksFor()</b> marks each shelf done or focus, and styles/app.css (.map.real.rf) colours them. The badge and strip count with <b>focusDone()</b> in shared/reducers/floor.js: only the focus departments count.', ev: [],
      run: async c => { await c.wait(400); } },
    { cap: tx('Tap a shelf as you finish it.'), read: S(tx('One tap marks it refreshed.'), tx('{shelf} is one shelf: the rest of run {run} stays as it was.', { shelf: 'A16 S1', run: 'A16' })),
      dev: 'A tap calls <b>tap()</b> in js/views/refresh.js, which sends <b>refresh.mark</b> for the shelf tapped and this week, with its department, never for its run.', ev: [mark('A16 S1')],
      run: async c => { await c.tap('.rf-svg [data-s="A16 S1"]'); paint(c, S2); note(c, tx('{code} refreshed', { code: 'A16 S1' }), true); } },
    { cap: tx('Tapped the wrong shelf? Tap it again to take the mark off.'), read: S(tx('A tap on a shelf already marked unmarks it.'), tx('The message has Undo, if taking it off was the slip.')),
      dev: '<b>markKeysFor()</b> finds the shelf’s marks and <b>refresh.unmark</b> takes them off. The reducer keeps when it was unmarked, so an older mark from a phone that was offline cannot bring it back.', ev: [mark('A18 S1'), E('refresh.unmark', 'floor', { segment: 'A18 S1', week: WK }, {})],
      run: async c => { await c.tap('.rf-svg [data-s="A18 S1"]'); paint(c, S3a); note(c, tx('{code} refreshed', { code: 'A18 S1' }), true); await c.wait(900); await c.tap('.rf-svg [data-s="A18 S1"]'); paint(c, S3); note(c, tx('{code} unmarked', { code: 'A18 S1' }), true); } },
    { cap: tx('Walking the aisle? Scan or type opens the scan sheet.'), read: S(tx('Scan with the camera, or type the shelf.'), tx('The sheet stays open for the next shelf.')),
      dev: 'The sheet is <b>scanSheet()</b>, opened from the strip; nothing is sent until a shelf is read.', ev: [],
      run: async c => { await c.tap('.p2-strip .rf-act'); sheet(c, scanSheet()); } },
    { cap: tx('Scan with the camera: each shelf label marks its shelf.'), read: S(tx('Point the camera at the shelf label.'), tx('A beep and a buzz confirm the read, and that shelf is marked refreshed.')),
      dev: 'The camera is <b>openScanner()</b> in js/scan.js, kept open (continuous). Each code goes into the sheet’s box with Enter, and <b>oneShelf()</b> in js/map.js reads it as one shelf: A016S02 is A16 S2.', ev: [mark('A16 S2')],
      run: async c => { await c.tap('.p2-sheet .rf-big'); c.show('.rf-cam'); c.html('.rf-cam .cam2-t', ''); await c.wait(900); c.cls('.rf-cam', 'hit', true); c.html('.rf-cam .cam2-t', tally(1, 'A016S02')); paint(c, S5); c.html('.p2-sheet', scanSheet(okLine('A16 S2'))); note(c, tx('{code} refreshed', { code: 'A16 S2' }), true); await c.wait(400); c.cls('.rf-cam', 'hit', false); } },
    { cap: tx('Walk on to the next label: the camera keeps reading.'), read: S(tx('The tally counts the labels read and shows the last one.'), tx('A label read twice in a row counts once.')),
      dev: 'A code read again within 2.5 seconds is ignored (REPEAT_MS in js/scan.js).', ev: [mark('A16 E1')],
      run: async c => { await c.tap('.rf-cam .cam2-v'); c.cls('.rf-cam', 'rf-pan', true); await c.wait(1300); c.cls('.rf-cam', 'hit', true); c.html('.rf-cam .cam2-t', tally(2, 'A016E1')); paint(c, S6); c.html('.p2-sheet', scanSheet(okLine('A16 E1'))); note(c, tx('{code} refreshed', { code: 'A16 E1' }), true); await c.wait(400); c.cls('.rf-cam', 'hit', false); } },
    { cap: tx('Close the camera: the sheet says what the last label did.'), read: S(tx('A green line is a shelf marked.'), tx('A red one says why a label marked nothing.')),
      dev: 'The line is the last result, kept while the sheet is open (lastScan in js/views/refresh.js). Closing the camera sends nothing.', ev: [],
      run: async c => { await c.tap('.rf-cam [data-camx]'); c.hide('.rf-cam'); c.cls('.rf-cam', 'rf-pan', false); } },
    { cap: tx('A label too worn to scan? Type the shelf and tap Mark.'), read: S(tx('Type it as it is printed: {a}, {b} and {c} are the same shelf.', { a: 'A16E2', b: 'A16 E2', c: 'A16-E2' })),
      dev: 'A typed code takes the scan’s path: <b>bindShelfScan()</b> in js/map.js, with <b>canonCode()</b> making every spelling one.', ev: [mark('A16 E2')],
      run: async c => { await typeIn(c, 'A16 E2'); paint(c, S8); c.html('.p2-sheet', scanSheet(okLine('A16 E2'))); note(c, tx('{code} refreshed', { code: 'A16 E2' }), true); } },
    { cap: tx('Close the sheet: each shelf you marked is green.'), read: S(tx('Run {run} is done shelf by shelf: both sides and both ends.', { run: 'A16' }), tx('The strip and the badge count the week.')),
      dev: 'The map is built once; a mark only changes the shelf’s data-mark (<b>setMarks()</b> in js/map.js).', ev: [],
      run: async c => { await c.tap('.p2-sheet .sh-x'); unsheet(c); } },
    { cap: tx('The arrow on the strip opens the week.'), read: S(tx('It shows the count out of 100, each focus department with its own bar, and every shelf done this week.'), tx('Managers set the focus departments on a store PC.')),
      dev: 'The arrow is the shell’s (<b>mountStrip()</b> in js/shell.js); the panel is <b>mobileBar()</b>, with <b>focusCounts()</b> and <b>doneByDept()</b>.', ev: [],
      run: async c => { await c.tap('.p2-strip .rf-tog'); openPanel(c, S8); } },
    { cap: tx('Tap a shelf in the list to find it on the map.'), read: tx('The map moves to that shelf, above the open panel.'),
      dev: 'A shelf in the list calls <b>flashSeg()</b>, which frames it with <b>zoomTo()</b> in js/map.js.', ev: [],
      run: async c => { await c.tap('.rf-panel [data-chip="A14 S1"]'); paint(c, S11, true); } },
    { cap: tx('Every device sees the count go up.'), read: S(tx('A colleague marks {shelves} on their phone: they turn green on yours.', { shelves: 'A18 S1, A18 S2' }), tx('Marks reach every phone and PC straight away.'), tx('Two people never refresh the same shelf.')),
      dev: 'Floor events go to every device in the store; each phone repaints the marks as they arrive.', ev: [mark('A18 S1'), mark('A18 S2')],
      run: async c => { await c.tap('.p2-strip .rf-tog'); closePanel(c, S11); await c.wait(900); paint(c, S12); } },
  ],
  whatif: [[tx('No wifi in that aisle?'), S(tx('Keep marking.'), tx('It sends when the phone is back in range.'))]],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
// Each starts where the chapter starts: 23 of 100, A16 still to do.
refresh.stories.push({
  id: 'nomark', title: tx('What if a scan doesn’t mark the shelf?'), blurb: tx('The sheet says why: done already, a run’s name, or not a shelf on this map.'),
  know: [tx('A scan only ever marks: a shelf already done this week says so and stays marked, so reading a label twice never takes it off.'),
    tx('A run’s name ({run}) is several shelves, and a scan never picks one for you: scan the shelf’s own label.', { run: 'A16' }),
    tx('{a}, {b}, {c} and the printed {d} all name the same shelf.', { a: 'A16S1', b: 'A16 S1', c: 'A16-S1', d: 'A016S01' }),
    tx('A code that isn’t a shelf on this store’s map is turned away in red: check the label.'),
    tx('On the map a tap still toggles: tapping a done shelf takes its mark off, with Undo.')],
  steps: [
    { cap: tx('Scan a shelf that’s done already: it says so and stays marked.'), read: S(tx('A colleague refreshed {shelf} earlier this week.', { shelf: 'A14 S1' }), tx('Nothing is sent and the mark stays.')),
      dev: '<b>tap()</b> with scanned: true never unmarks; it says the shelf is done.', ev: [],
      run: async c => { await c.tap('.p2-strip .rf-act'); sheet(c, scanSheet()); await typeIn(c, 'A14 S1'); c.html('.p2-sheet', scanSheet(['ok', tx('{code} was already refreshed this week', { code: 'A14 S1' })])); note(c, tx('{code} is already done this week', { code: 'A14 S1' })); } },
    { cap: tx('A run’s name marks nothing: it asks for the shelf’s own label.'), read: S(tx('{run} is a run of four shelves.', { run: 'A16' }), tx('Each is marked on its own, so scan the label on the shelf you did.')),
      dev: '<b>oneShelf()</b> in js/map.js turns a run away: <b>groupsFor()</b> finds its four shelves.', ev: [],
      run: async c => { const t = tx("{code} is a run of {n} shelves: scan the shelf's own label ({list})", { code: 'A16', n: 4, list: 'A16 S1, A16 S2, A16 E2…' }); await typeIn(c, 'A16'); c.html('.p2-sheet', scanSheet(['bad', t])); note(c, t, false, 'bad'); } },
    { cap: tx('A code that isn’t on the map says so.'), read: S(tx('Check the label: a typo, or a label from another store.')),
      dev: 'Nothing is sent for a code the map doesn’t have.', ev: [],
      run: async c => { const t = tx('{code} is not a shelf on this map', { code: 'A99 S1' }); await typeIn(c, 'A99 S1'); c.html('.p2-sheet', scanSheet(['bad', t])); note(c, t, false, 'bad'); } },
    { cap: tx('The printed label’s zeros don’t matter: {a} is {b}.', { a: 'A016S01', b: 'A16 S1' }), read: S(tx('Labels print their numbers with zeros in front.'), tx('They read as the shelf on the map.')),
      dev: '<b>canonCode()</b> in js/map.js drops a zero after a letter, so the label and the map meet in one form.', ev: [mark('A16 S1')],
      run: async c => { await typeIn(c, 'A016S01'); paint(c, at({ done: [...H1_0, 'A16 S1'] })); c.html('.p2-sheet', scanSheet(okLine('A16 S1'))); note(c, tx('{code} refreshed', { code: 'A16 S1' }), true); } },
  ],
});
const Q4 = at({ done: [...H1_0, 'Q4 S2'], sel: 'Q4 S2' });
refresh.stories.push({
  id: 'outside', title: tx('What if the shelf isn’t in this week’s focus?'), blurb: tx('It is still marked, for everyone, but it doesn’t count toward the 100.'),
  know: [tx('Managers choose the week’s focus departments on a store PC; the phone shows them.'), tx('Only the focus departments count toward the 100.'),
    tx('A shelf outside the focus is still marked green for everyone, and listed in the week’s panel.'), tx('With no focus set for the week, every shelf counts and none is faded.'),
    tx('A new week starts on Monday, with its own marks and focus.')],
  steps: [
    { cap: tx('A shelf outside the focus is faint. Tap it once it’s done.'), read: S(tx('It is still marked.'), tx('The message says it isn’t counted, and the count stays at {n}.', { n: 23 })),
      dev: '<b>tap()</b> sends the same <b>refresh.mark</b>; the count is <b>focusDone()</b>, which leaves out departments not in the focus.', ev: [mark('Q4 S2', 'c1')],
      run: async c => { await c.tap('.rf-svg [data-s="Q4 S2"]'); paint(c, Q4); note(c, tx('{code} marked · outside this week’s focus, not counted', { code: 'Q4 S2' }), true); } },
    { cap: tx('The week lists it apart from the count.'), read: S(tx('Completed this week has it under its own department, and says how many are outside the focus.')),
      dev: '<b>doneByDept()</b> lists every mark; the note counts the marks outside the focus.', ev: [],
      run: async c => { await c.tap('.p2-strip .rf-tog'); openPanel(c, Q4); } },
  ],
});
const BLUE = '#3b82f6', P1 = at({ planMode: true }), P2 = at({ planMode: true, colour: BLUE });
const P3 = at({ planMode: true, colour: BLUE, sel: 'A18 S2', plan: { 'A18 S1': BLUE, 'A18 S2': BLUE } });
const P4 = at({ ...P3, planMode: false }), P5 = at({ ...P4, sel: 'A18 S1', done: [...H1_0, 'A18 S1'] });
refresh.stories.push({
  id: 'plan', title: tx('What if the team plans which shelves come next?'), blurb: tx('Plan paints shelves in a colour for everyone, until they are refreshed.'),
  know: [tx('Plan paints shelves in one of six colours for the whole team, for example the next shift’s list.'), tx('To clear a shelf, tap it again in the same colour, or pick the × and tap it.'),
    tx('A planned shelf shows its colour until it is refreshed; then it turns green with a dot of its colour.'), tx('Planning never counts toward the 100: only marks do.'),
    tx('Reset planning, on the store PC’s Refresh screen, clears every colour at once.')],
  steps: [
    { cap: tx('Open the week from the arrow.'), read: tx('Refresh and Plan sit beside Scan or type.'),
      dev: 'Plan is a mode of the same view (mode in js/views/refresh.js); nothing is sent yet.', ev: [],
      run: async c => { await c.tap('.p2-strip .rf-tog'); openPanel(c, at()); } },
    { cap: tx('Switch to Plan.'), read: S(tx('The colours take the place of Scan or type.'), tx('The strip says Planning.')),
      dev: 'In Plan, <b>mobileBar()</b> shows the colours and <b>rfStrip()</b> the Planning strip.', ev: [],
      run: async c => { await c.tap('.rf-panel [data-m="plan"]'); openPanel(c, P1); } },
    { cap: tx('Pick a colour.'), read: tx('Six colours to choose from.'), dev: 'The colour picked is held while the app is open (planColour in js/views/refresh.js); nothing is sent.', ev: [],
      run: async c => { await c.tap(`.rf-panel [data-c="${BLUE}"]`); openPanel(c, P2); } },
    { cap: tx('Close the panel and tap the shelves to paint them.'), read: S(tx('Each tap paints that shelf for the whole team.'), tx('Tapping it again in the same colour clears it.')),
      dev: 'Each tap sends <b>refresh.plan.paint</b> with the shelf and its colour (<b>applyPlan()</b> paints it).', ev: [E('refresh.plan.paint', 'floor', { segment: 'A18 S1' }, { colour: BLUE }), E('refresh.plan.paint', 'floor', { segment: 'A18 S2' }, { colour: BLUE })],
      run: async c => { await c.tap('.p2-strip .rf-tog'); closePanel(c, P2); await c.tap('.rf-svg [data-s="A18 S1"]'); paint(c, at({ ...P2, sel: 'A18 S1', plan: { 'A18 S1': BLUE } })); await c.tap('.rf-svg [data-s="A18 S2"]'); paint(c, P3); } },
    { cap: tx('Done: the planned shelves keep their colour until they are refreshed.'), read: S(tx('Back in Refresh, everyone sees the plan on the map.')),
      dev: 'Done on the strip goes back to Refresh; the plan stays in the store’s state.', ev: [],
      run: async c => { await c.tap('.p2-strip .rf-act'); paint(c, P4); } },
    { cap: tx('Refresh a planned shelf: it turns green with a dot of its colour.'), read: S(tx('The dot shows it was planned.'), tx('The count goes up as for any shelf.')),
      dev: '<b>applyPlan()</b> draws the plan-dot on a refreshed shelf.', ev: [mark('A18 S1')],
      run: async c => { await c.tap('.rf-svg [data-s="A18 S1"]'); paint(c, P5); note(c, tx('{code} refreshed', { code: 'A18 S1' }), true); } },
  ],
});
