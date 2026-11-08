// Chapter: Run the decant on the phone, the Back dock's Decant
// tab as the app has it today (js/views/backdock/receiving.js mobile(ctx,
// 'run'): the truck bar, Take 5 from js/views/backdock/plan.js, the dock grid,
// the crew strip, a pallet's card, the strip with HALT and its panel, the
// hold-up and person cards, Complete decant). Three What ifs play on the
// same phone: a halt, a break, two people on one pallet.
// The day: the same morning as "Receive a truck on the phone" (receive.js):
// Busselton 1241, Truck 1 with manifest 7040301, the crew D4, D7 and D9, and
// the eight pallets Receive landed (72 cartons, A6 with a label off the
// manifest), the layout confirmed. Times are the store's: Take 5 at 06:15.
// Every class here starts dc2- (styles/guide.css).
import { tx, txn } from '../../i18n.js';
import { ai, phone2, tab, sheet, unsheet, toast2 } from '../frames.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const TR = '2026-10-25-T1';
const B = bay => ({ truck: TR, bay });

// ── the morning Receive left (receive.js) ──────────────────────────────
// The manifest's consols: id, cartons, department (data).
const C = [['601930100', 2, '022'], ['601930107', 7, '038'], ['601930114', 9, '047'], ['601930121', 2, '024'], ['601930128', 7, '085'], ['601930135', 9, '054'],
  ['601930142', 2, '090'], ['601930149', 7, '006'], ['601930156', 9, '022'], ['601930163', 2, '038'], ['601930170', 7, '047'], ['601930177', 9, '024']];
// The eight pallets: type (c chep, l loscam, b bulk), cartons, the estimate
// (half a minute a carton, the store's standard), the consols on it.
const P = { A1: ['c', 2, 1, [0]], A2: ['l', 16, 8, [1, 2]], A3: ['c', 18, 9, [3, 4, 5]], A4: ['c', 2, 1, [6]], A5: ['c', 16, 8, [7, 8]], A6: ['l', 2, 1, [9]], A7: ['b', 7, 4, [10]], B1: ['c', 9, 5, [11]] };
const OFF = 'A6';
const PLAY = '▶\uFE0E', PAUSE = '⏸\uFE0E';   // as text, not emoji   // its label 601999917 is not on the manifest (flagged at Receive)
const CREW = ['D4', 'D7', 'D9'];
const TOTAL = 72;

// ── the phone's pieces ─────────────────────────────────────────────────
const PH = () => [tx('truck phase::Planned'), tx('truck phase::Receiving'), tx('truck phase::Received'), tx('truck phase::Decanting'), tx('truck phase::Cleared'), tx('truck phase::Closed')];
const track = at => `<div class="ph2t">${PH().map((l, i) => `<span class="${i < at ? 'd' : i === at ? 'c' : ''}">${l}</span>`).join('')}</div>`;
// The truck bar (receiving.js truckBar()): Truck 1, its phase, the manifest, the six steps.
const truck = at => `<div class="tk2 dc2-tk"><div class="tk2-r"><b>${tx('Truck {n}', { n: 1 })}${ai('chev')}</b><span class="st2 ${at === 3 ? 'dc2-dec' : 'ok'}">${PH()[at]}</span>` +
  `<span class="mf2"><b>${ai('file')}7040301</b><small>${tx('{c} ctn · {n} consols expected', { c: 72, n: 12 })}</small></span></div>${track(at)}</div>`;

// Take 5 (plan.js take5Card()): the team, the five checks, Start decant.
const T5 = () => [[tx('Team briefed'), tx('Everyone knows the plan, their role and their start time.')], [tx('Team safety'), tx('Fit for work, PPE on, anything to flag is raised.')],
  [tx('Equipment safe'), tx('Box cutters, cages and work tables checked and ready.')], [tx('Area clear'), tx('Dock clear of spills, obstructions and trip hazards.')], [tx('Goal agreed'), tx('Target finish set and shared with the team.')]];
const t5Note = n => n === 5 ? tx('All five checked. Good to go.') : tx('{n} of 5 checked. Tick all five to start; nothing can be started until then. A huddle runs the safety talk and pauses the clock while you brief.', { n });
const take5 = (n = 0) => truck(2) + `<div class="dc2-t5c"><div class="dc2-t5h"><b>${tx('Ready to start · Take 5')}</b><small>${txn(3, '{n} decanter', '{n} decanters')}</small></div>` +
  `<div class="dc2-team">${CREW.map(p => `<span>${p}</span>`).join('')}</div>` +
  `<div class="dc2-t5">${T5().map(([b, s], i) => `<div data-t5="${i}"${i < n ? ' class="on"' : ''}><i></i><span><b>${b}</b><small>${s}</small></span></div>`).join('')}</div>` +
  `<div class="dc2-t5a"><span class="dc2-btn pri dc2-sd${n === 5 ? '' : ' off'}">${PLAY} ${tx('Start decant')}</span><span class="dc2-btn${n === 5 ? '' : ' off'}">${ai('users')}${tx('Launch huddle')}</span></div><small class="dc2-t5n">${t5Note(n)}</small></div>`;

// A moment on the dock: bay → [status a|p|d, who, minutes worked]; a bay not
// listed is waiting. arm: the cutter tapped; brk: who is on a break.
// The squares (receiving.js dockGrid()), the hint and the crew strip (crewStrip()).
function grid(s) {
  return `<div class="dc2-grid">${[...'ABCD'].flatMap(r => [1, 2, 3, 4, 5, 6, 7].map(k => {
    const ref = r + k, p = P[ref], b = s.b[ref] || [];
    if (!p) return `<span class="dc2-sq" data-ref="${ref}"><i>${ref}</i><em>+</em></span>`;
    const [st, who, m] = b, lit = s.arm && (!st || st === 'p' || (st === 'a' && !who.split('+').includes(s.arm)));
    return `<span class="dc2-sq t-${p[0]}${st ? ' s-' + st : ''}${lit ? ' lit' : ''}" data-ref="${ref}"><i>${ref}</i><b>${p[1]}</b>` +
      (ref === OFF ? `<span class="dc2-off${st === 'a' || st === 'p' ? ' up' : ''}">${tx('OFF')}</span>` : '') +
      (st === 'a' ? `<span class="dc2-fl">${PLAY}</span>` : st === 'p' ? `<span class="dc2-fl">${PAUSE}</span>` : st === 'd' ? '<span class="dc2-fl">✓</span>' : '') +
      (st === 'a' || st === 'p' ? `<span class="dc2-tm">${tx('{m}m', { m })}</span>` : '') + (st === 'a' ? `<span class="dc2-who">${who}</span>` : '') + '</span>';
  })).join('')}</div>`;
}
const on = (s, pid) => Object.keys(s.b).find(r => s.b[r][0] === 'a' && s.b[r][1].split('+').includes(pid));
const hint = s => `<div class="dc2-hint${s.arm ? ' on' : ''}">${s.arm ? tx('Armed: tap a lit square to start it (or join it), or the chip again to disarm.') : tx('Tap a cutter, then a square, to start decanting it.') + ' ' + tx('Hold a name for more.')}</div>`;
const crew = s => `<div class="dc2-crew"><span class="lb">${tx('Crew')}</span><span class="rc">${ai('knife')}${tx('{n} cutting', { n: 3 })}</span><span class="dc2-roles">${ai('users')}${tx('Roles')}</span></div>` +
  `<div class="dc2-chips">${CREW.map(p => { const br = (s.brk || []).includes(p), r = on(s, p); return `<span class="dc2-fc${r ? ' on' : ''}${s.arm === p ? ' arm' : ''}${br ? ' brk' : ''}" data-pid="${p}">${ai('knife')}<b>${p}</b><span>${br ? tx('on a break') : r ? PLAY + ' ' + r : tx('free')}</span></span>`; }).join('')}</div>`;
const runView = s => truck(s.ph || 3) + grid(s) + hint(s) + crew(s);

// The strip (receiving.js runStrip()): progress, the estimate, HALT; halted,
// cleared, before Take 5 and with no truck.
const tog = (open = false) => `<span class="dc2-tog">${ai('chev', open ? '' : 'up')}</span>`;
const done = s => Object.keys(s.b).filter(r => s.b[r][0] === 'd');
function stripRun(s, open = false) {
  const d = done(s), c = d.reduce((n, r) => n + P[r][1], 0), pct = Math.round(c / TOTAL * 100);
  return `<div class="dc2-st"><div class="dc2-l1"><b>${c}/${TOTAL}</b><span>${tx('ctn · {pct}% · {done} of {n} done', { pct, done: d.length, n: 8 })}</span></div><div class="dc2-bar"><i style="width:${pct}%"></i></div>` +
    `<div class="dc2-l2">${tx('est')} <b>${s.est}</b> · ${tx('no goal set')}</div></div><span class="dc2-go dc2-halt">${tx('Halt')}</span>${tog(open)}`;
}
const stripT5 = () => `<div class="dc2-st"><div class="dc2-l1"><b class="t">${tx('truck phase::Received')}</b></div><div class="dc2-l2">${tx('Take 5, then Start decant')}</div></div>${tog()}`;
const stripHalt = at => `<div class="dc2-st"><div class="dc2-l1"><b class="t">${tx('Cages out')}</b></div><div class="dc2-l2">${tx('since {time}', { time: at })} · ${tx('decant clock stopped')}</div></div><span class="dc2-go dc2-resume">${PLAY} ${tx('End halt')}</span>${tog()}`;
const stripClear = () => `<div class="dc2-st"><div class="dc2-l1"><b>${TOTAL}/${TOTAL}</b><span>${tx('Every pallet is done.')}</span></div></div><span class="dc2-go dc2-close">${tx('Close the truck')}</span>${tog()}`;
const stripNone = () => `<div class="dc2-st"><div class="dc2-l1"><span>${tx('Tap New truck when it lands.')}</span></div></div><span class="dc2-go">${ai('plus')}${tx('New truck')}</span>`;
const setStrip = (c, html, halted = false) => { c.html('.p2-strip', html); c.cls('.p2-strip', 'dc2-halted', halted); };

// A pallet's card (receiving.js palletPanel(), on the phone's bottom sheet):
// type, cartons, note, labels, contents, then the decant with its buttons.
// d: { st: a|p|d, who: 'D4' or ['D7','D4'], clock: '5:12', pace: on|near, done: '06:26', pick: 'D7' (the who-picker), busy: true }
const STATE = () => ({ a: [tx('active'), 'live'], p: [tx('paused'), 'staged'], d: [tx('done'), 'done'] });
function card(ref, d) {
  const [t, ctn, est, cs] = P[ref], [pill, pc] = STATE()[d.st], who = [].concat(d.who);
  const types = [['c', tx('Chep tubs')], ['l', tx('Load pallet')], ['b', tx('Bulk')]].map(([k, l]) => `<span class="${k}${t === k ? ' on' : ''}">${t === k ? ai('check') : ''}${l}</span>`).join('');
  const rows = cs.map(i => `<div class="dc2-vr"><span>✓</span><b>${C[i][0]}</b><span>${tx('{n} ctn', { n: C[i][1] })} · ${C[i][2]}</span><span class="x">${ai('x')}</span></div>`).join('');
  const verbs = d.st === 'a' ? `<span class="dc2-btn">${PAUSE} ${tx('Pause')}</span><span class="dc2-btn pri dc2-dn">${ai('check')}${tx('Done')}</span>` +
      (d.pick ? `<span class="dc2-btn">＋ ${tx('Join')}</span><span class="dc2-btn">⇄ ${tx('Hand over')}</span>` : '') +
      (who.length > 1 ? who.map(p => `<span class="dc2-btn">${tx('{pid} steps off', { pid: p })}</span>`).join('') : '') + `<span class="dc2-btn">↶ ${tx('Undo start')}</span>`
    : d.st === 'p' ? `<span class="dc2-btn pri dc2-rs">${PLAY} ${tx('Resume')}</span><span class="dc2-btn">${ai('check')}${tx('Done')}</span><span class="dc2-btn">↶ ${tx('Undo start')}</span>`
    : `<span class="dc2-dnd">${tx('Decanted {time}', { time: d.done })}</span><span class="dc2-btn dc2-wide">↩ ${tx('Reopen')}</span>`;
  const acts = [`${ai('check')}${tx('Update')}`, `${ai('clock')}${tx('Fix times')}`, ...(d.st !== 'd' ? [`⇲ ${tx('Move')}`] : []), ...(d.st === 'p' ? [`🚫 ${tx('Not in this session')}`] : []), `${ai('trash')}${tx('Remove')}`];
  return `<div class="sh-h dc2-chd"><b>${tx('Pallet {ref}', { ref })}<span class="dc2-tst ${pc}">${pill}</span></b><span class="sh-x">${ai('x')}</span></div><div class="sh-b dc2-cb">` +
    `<div class="pt2 dc2-pt">${types}</div><div class="two2 dc2-f"><div><span class="dc2-lab">${tx('Cartons')}</span><span class="f2">${ctn}</span></div><div><span class="dc2-lab">${tx('Est. mins')}</span><span class="f2 dc2-auto">${est}</span></div></div>` +
    `<div class="dc2-f"><span class="dc2-lab">${tx('Note')}</span><span class="f2 ph">${tx('optional')}</span></div>` +
    `<div class="dc2-scan"><span class="dc2-btn pri">${ai('camera')}${tx('Scan a label')}</span><span class="dc2-btn">${ai('keyboard')}${tx('Type it')}</span></div>${rows}` +
    `<div class="dc2-cont"><i>${PLAY}</i>${tx('Contents')} · ${txn(cs.length, '{n} consol', '{n} consols')}</div>` +
    `<div class="dc2-decant"><div class="dc2-lab">${tx('Decant')} · ${who.join(' + ')}</div><div class="dc2-dk"><span class="dc2-clk ${d.pace || 'on'}">${tx('{time} worked', { time: d.clock })} · ${tx('est {n} min', { n: est })}</span>` +
    (d.st === 'd' ? '' : d.pick ? `<span class="dc2-sel">${d.pick}${ai('chev')}</span>` : `<small>${tx('Everyone is busy or on a break.')}</small>`) + `</div><div class="dc2-verbs${d.st === 'd' ? ' dc2-vd' : ''}">${verbs}</div></div>` +
    `<div class="dc2-acts">${acts.map(a => `<span class="dc2-btn">${a}</span>`).join('')}</div></div>`;
}

// A sheet over the grid, above the strip (the hold-up, the panel, Complete decant).
const dks = (c, html, dark = false) => { c.html('.dc2-dks', html); c.cls('.dc2-dks', 'dark', dark); c.show('.dc2-dks'); };
const undks = c => c.hide('.dc2-dks');
const head = title => `<div class="dc2-dh"><b>${title}</b><span class="sh-x">${ai('x')}</span></div>`;
const KINDS = () => [['halt', tx('Halt')], ['huddle', tx('Huddle')], ['transition', tx('Transition')], ['break', tx('Team break')]];
const REASONS = () => [['hcage', tx('Cages out')], ['nostock', tx('No stock')], ['equip', tx('Equipment')], ['safety', tx('Safety')], ['waiting', tx('Waiting')], ['other', tx('Other')]];
const holdup = (kind = '') => head(tx('Hold-up')) + `<p class="dc2-dp">${tx('The decant clock stops until it ends.')}</p>` +
  `<div class="dc2-chs">${KINDS().map(([k, l]) => `<span class="dc2-ch${kind === k ? ' on' : ''}" data-k="${k}">${l}</span>`).join('')}</div>` +
  (kind ? `<div class="dc2-chs">${REASONS().map(([k, l]) => `<span class="dc2-ch" data-r="${k}">${l}</span>`).join('')}<span class="dc2-in">${tx('Note (optional)')}</span></div>` : '');
// The panel (runPanel()): the phase, the four tiles and the tools.
const panel = (doneN, ctn, est) => `<div class="ph2t dc2-pt6">${PH().map((l, i) => `<span class="${i < 3 ? 'd' : i === 3 ? 'c' : ''}">${l}</span>`).join('')}</div>` +
  `<div class="dc2-pnt"><b>${tx('Truck {n}', { n: 1 })} · ${tx('truck phase::Decanting')}</b><small>${tx('{done} of {n} pallets done · {c} of {total} ctn', { done: doneN, n: 8, c: ctn, total: TOTAL })}</small></div>` +
  `<div class="dc2-tiles"><span><b>${est}</b>${tx('est. clear')}</span><span class="b"><b>${tx('Set')}</b>${tx('goal')}</span><span><b>${doneN}/8</b>${tx('pallets done')}</span><span class="b"><b>06:15</b>${tx('decant start')}</span></div>` +
  `<div class="dc2-tools">${[['clock', tx('Goal')], ['users', tx('Book huddle')], ['users', tx('Team &amp; plan')], ['search', tx('Search')], ['alert', tx('Hold-up')], ['check', tx('Complete decant')]].map(([i, l]) => `<span>${ai(i)}${l}</span>`).join('')}</div>`;
const complete = () => `<div class="dc2-dh"><b>${tx('Complete decant · Truck {n}', { n: 1 })} <small>${tx('{done}/{n} pallets done', { done: 8, n: 8 })}</small></b></div>` +
  `<p class="dc2-dp big">${tx('The dock is clear: closing writes the decant to history and updates personal rates.')}</p><div class="dc2-fin"><span class="dc2-btn pri dc2-cl">${ai('check')}${tx('Close truck')}</span><span class="dc2-btn">${tx('Cancel')}</span></div>`;

// One person's card (personPanel()): role, then what can be done for them.
const ROLE = () => [['cutter', 'knife', tx('Cutter')], ['runner', 'runner', tx('Runner')], ['cleaner', 'broom', tx('Cleaner')]];
function person(pid, { ref = '', mins = 0, brk = '' } = {}) {
  const row = (icon, b, small, cls = '') => `<div class="dc2-pa${cls}">${ai(icon)}<span><b>${b}</b>${small ? `<small>${small}</small>` : ''}</span></div>`;
  return `<div class="sh-h dc2-ph"><span class="dc2-av">${ai('knife')}</span><span class="dc2-pnm"><b>${pid}</b><small>${tx('Cutter')} · ${brk ? tx('on a break since {time}', { time: brk }) : tx('decanting {ref} · {n} min', { ref, n: mins })}</small></span><span class="sh-x">${ai('x')}</span></div>` +
    `<div class="dc2-pb"><div class="dc2-lab ic">${ai('users')}${tx('Role')}</div><div class="dc2-roles3">${ROLE().map(([k, i, l]) => `<span class="r-${k}${k === 'cutter' ? ' on' : ''}">${ai(i)}${l}</span>`).join('')}</div></div>` +
    (brk ? row('coffee', tx('Back from the break'), tx('back on the crew'), ' dc2-back') + row('user-minus', tx('Take {pid} off the truck', { pid }), '', ' red')
      : row('coffee', tx('Start a break'), tx('{ref} pauses while they are away', { ref }), ' dc2-brk') + row('pause', tx('Step off {ref}', { ref }), tx('{ref} pauses, the time kept', { ref })) +
        row('user-minus', tx('Take {pid} off the truck', { pid }), tx('their time on {ref} is kept', { ref }), ' red'));
}

// After Close the truck: no truck, and today's decants (plan.js decantBoard()).
const noneView = () => `<div class="dc2-nt"><b>${tx('No truck on the dock')}</b><span class="dc2-chip">${tx('truck phase::Planned')}</span></div>` +
  `<div class="dc2-today"><div class="dc2-th"><b>${tx('Today’s decants')}</b><small>1</small></div><div class="dc2-tc"><b>${tx('Truck {n}', { n: 1 })}</b><span>${tx('Done')}</span><small>${tx('{n} ctn cleared in {time}', { n: 72, time: tx('{h}h {m}m', { h: 0, m: '17' }) })}</small></div></div>`;

// The phone on the Decant tab: Take 5, the run or no truck.
const phone = (view, s, strip) => phone2('dc', `<div class="v dc2-v" id="dc-t5"${view === 't5' ? '' : ' hidden'}>${view === 't5' ? take5() : ''}</div>` +
  `<div class="v dc2-v" id="dc-run"${view === 'run' ? '' : ' hidden'}>${view === 'run' ? runView(s) : ''}</div><div class="v dc2-v" id="dc-none" hidden></div><div class="dc2-dks" hidden></div>`,
{ area: 'backdock', on: 'decant', strip });

// ── the morning, moment by moment ──────────────────────────────────────
const M = {
  start: { b: {}, est: '06:28' },                                                     // 06:15 Start decant
  arm: { b: {}, est: '06:28', arm: 'D4' },
  a2: { b: { A2: ['a', 'D4', 0] }, est: '06:28' },                                    // 06:16
  three: { b: { A2: ['a', 'D4', 3], A3: ['a', 'D7', 1], A5: ['a', 'D9', 0] }, est: '06:29' },   // 06:19
  card: { b: { A2: ['a', 'D4', 5], A3: ['a', 'D7', 3], A5: ['a', 'D9', 2] }, est: '06:29' },    // 06:21
  a2done: { b: { A2: ['d'], A3: ['a', 'D7', 6], A5: ['a', 'D9', 5] }, est: '06:30' },            // 06:24
  paused: { b: { A2: ['d'], A3: ['p', 'D7', 7], A5: ['a', 'D9', 6] }, est: '06:31' },            // 06:25
  resumed: { b: { A2: ['d'], A5: ['d'], A3: ['a', 'D7', 7], A7: ['a', 'D4', 3], B1: ['a', 'D9', 0] }, est: '06:33' },   // 06:28
  last: { b: { A1: ['d'], A2: ['d'], A3: ['d'], A4: ['d'], A5: ['d'], A6: ['d'], A7: ['d'], B1: ['a', 'D9', 3] }, est: '06:33' },   // 06:31
  clear: { b: Object.fromEntries(Object.keys(P).map(r => [r, ['d']])), est: '06:32', ph: 4 },   // 06:32
};
const run = (c, s) => c.html('#dc-run', runView(s));

export const decant = {
  id: 'decantphone', grp: 'dock', icon: 'box', title: tx('Run the decant on the phone'), device: 'phone', where: tx('Phone · Back dock › Decant'), for: ['dock', 'manager'],
  intro: S(tx('Take 5 with the team, then start each pallet with the person on it and finish it with Done.'), tx('Every dock phone follows along, and when the last pallet is done the truck closes.')),
  html: () => phone('t5', null, stripT5()),
  steps: [
    { cap: tx('Decant opens on Take 5: tick the five checks with the team.'), read: S(tx('Truck 1 is received: its eight pallets are on the dock and the layout is confirmed.'), tx('Before anyone cuts a carton, the team runs the five checks together.')),
      dev: 'Take 5 is <b>take5Card()</b> in js/views/backdock/plan.js, its five checks TAKE5 in shared/dockplan.js. Ticking them sends nothing.', ev: [],
      run: async c => { for (let i = 0; i < 5; i++) { await c.tap(`#dc-t5 [data-t5="${i}"]`); c.cls(`#dc-t5 [data-t5="${i}"]`, 'on', true); } c.cls('#dc-t5 .dc2-t5a .dc2-btn', 'off', false); c.text('#dc-t5 .dc2-t5n', t5Note(5)); } },
    { cap: tx('Start decant: the dock grid and the crew take over.'), read: S(tx('Start decant records the Take 5 and starts the decant clock: the estimate, pace and the goal run from here.'), tx('Until then no pallet can be started.')),
      dev: 'One <b>truck.take5</b> with the five checks, then <b>truck.setStart</b> unless a start was set (<b>onPlanAct()</b> in js/views/backdock/plan.js). <b>begun()</b> in shared/dockphase.js gates every start.',
      ev: [E('truck.take5', 'backdock', { truck: TR }, { items: ['brief', 'safe', 'equip', 'area', 'goal'] }), E('truck.setStart', 'backdock', { truck: TR }, { at: '2026-10-25T06:15:00+08:00' })],
      run: async c => { await c.tap('#dc-t5 .dc2-sd'); c.view('dc-run'); run(c, M.start); setStrip(c, stripRun(M.start)); toast2(c, tx('Take 5 recorded · decant started')); } },
    { cap: tx('Tap a cutter: the pallets they can start light up.'), read: S(tx('Each name on the crew strip is one person on this truck, by D-number.'), tx('D4 is free, so every waiting pallet lights up.'), tx('Tap the name again to put it down.')),
      dev: 'The crew strip is <b>crewStrip()</b> in js/views/backdock/receiving.js. Choosing a cutter stays on this phone: nothing is sent.', ev: [],
      run: async c => { await c.tap('#dc-run .dc2-fc[data-pid="D4"]'); run(c, M.arm); } },
    { cap: tx('Tap a lit pallet: D4 is on A2 and its clock runs.'), read: S(tx('The square shows who is on it and the minutes worked.'), tx('Undo on the message takes the start back if it was the wrong pallet.')),
      dev: 'A start is refused for someone already on another pallet (<b>canWork()</b> in shared/reducers/backdock.js).', ev: [E('pallet.start', 'backdock', B('A2'), { pid: 'D4' })],
      run: async c => { await c.tap('#dc-run .dc2-sq[data-ref="A2"]'); run(c, M.a2); toast2(c, `<span>${tx('{pid} on {ref}', { pid: 'D4', ref: 'A2' })}</span><u>${tx('Undo')}</u>`); } },
    { cap: tx('D7 and D9 start theirs on their own phones: it all shows here.'), read: S(tx('Every dock phone shows the same grid, live.'), tx('The crew strip says who is on what.')),
      dev: 'Back dock events go to every back dock device and to managers.', ev: [E('pallet.start', 'backdock', B('A3'), { pid: 'D7' }), E('pallet.start', 'backdock', B('A5'), { pid: 'D9' })],
      run: async c => { await c.wait(700); run(c, M.three); setStrip(c, stripRun(M.three)); } },
    { cap: tx('Tap a running pallet for its card: the time worked against its estimate.'), read: S(tx('The card has the pallet’s type, cartons and labels, then the decant: who is on it, the time worked and the estimate.'), tx('Pause and Done are here.')),
      dev: 'The card is <b>palletPanel()</b> in js/views/backdock/receiving.js. The time worked leaves out halts and the person’s breaks (<b>workedMs()</b> in shared/reducers/backdock.js).', ev: [],
      run: async c => { run(c, M.card); setStrip(c, stripRun(M.card)); await c.tap('#dc-run .dc2-sq[data-ref="A2"]'); sheet(c, card('A2', { st: 'a', who: 'D4', clock: '5:12' })); } },
    { cap: tx('Done: the square turns green and the count moves on.'), read: S(tx('A2 is decanted: its 16 cartons count on the strip, and D4 is free for the next pallet.'), tx('Undo on the message reopens it.')),
      dev: 'A second <b>pallet.done</b> on the same pallet changes nothing (the reducer’s conflict rule).', ev: [E('pallet.done', 'backdock', B('A2'), {})],
      run: async c => { await c.tap('.p2-sheet .dc2-dn'); unsheet(c); run(c, M.a2done); setStrip(c, stripRun(M.a2done)); toast2(c, `<span>${tx('{ref} decanted', { ref: 'A2' })}</span><u>${tx('Undo')}</u>`); } },
    { cap: tx('A pallet has to wait? Pause keeps the time it has.'), read: S(tx('Pause stops the clock on A3 at 7 minutes and frees D7.'), tx('The card offers Resume, and the square keeps its time.')),
      dev: 'Pausing closes the open stretch of work; the pallet keeps every stretch, and its card offers Resume (<b>palletPanel()</b>).', ev: [E('pallet.pause', 'backdock', B('A3'), {})],
      run: async c => { run(c, M.paused); setStrip(c, stripRun(M.paused)); await c.tap('#dc-run .dc2-sq[data-ref="A3"]'); sheet(c, card('A3', { st: 'a', who: 'D7', clock: '7:04', pick: 'D4' }));
        await c.tap('.p2-sheet .dc2-verbs .dc2-btn'); c.html('.p2-sheet', card('A3', { st: 'p', who: 'D7', clock: '7:04', pick: 'D7' })); toast2(c, `<span>${tx('{ref} paused', { ref: 'A3' })}</span><u>${tx('Undo')}</u>`); } },
    { cap: tx('Pick it up again: tap the cutter, then the paused pallet.'), read: S(tx('Paused pallets light up too: D7 carries on from 7 minutes.'), tx('Meanwhile the other phones finished A5 and started A7 and B1.')),
      dev: 'A paused pallet starts again with <b>pallet.resume</b>: a new stretch of work for D7.', ev: [E('pallet.resume', 'backdock', B('A3'), { pid: 'D7' })],
      run: async c => { await c.tap('.p2-sheet .sh-x'); unsheet(c); await c.tap('#dc-run .dc2-fc[data-pid="D7"]'); run(c, { ...M.paused, arm: 'D7' });
        await c.tap('#dc-run .dc2-sq[data-ref="A3"]'); run(c, M.resumed); setStrip(c, stripRun(M.resumed)); toast2(c, `<span>${tx('{pid} on {ref}', { pid: 'D7', ref: 'A3' })}</span><u>${tx('Undo')}</u>`); } },
    { cap: tx('The grid turns green pallet by pallet, and the arrow opens the details.'), read: S(tx('Seven of the eight are done; D9 is on the last one.'), tx('The panel has the estimated clear time, the goal, the decant start and the tools: Hold-up and Complete decant among them.')),
      dev: 'The estimate is <b>forecast()</b> in js/views/backdock/common.js: each person’s run, then every waiting pallet dealt to whoever frees first. The panel is <b>runPanel()</b>.',
      ev: [E('pallet.start', 'backdock', B('A1'), { pid: 'D4' }, { n: 3 }), E('pallet.done', 'backdock', B('A1'), {}, { n: 5 })],
      run: async c => { await c.wait(600); run(c, M.last); setStrip(c, stripRun(M.last)); await c.tap('.p2-strip .dc2-tog'); setStrip(c, stripRun(M.last, true)); dks(c, panel(7, 63, '06:33'), true); } },
    { cap: tx('The last Done clears the truck: the strip offers Close the truck.'), read: S(tx('Every pallet is done: 72 of 72 cartons.'), tx('The truck is cleared, and the next step is to close it.')),
      dev: 'Cleared is worked out, not stored: every pallet done and the layout confirmed (<b>truckPhase()</b> in shared/dockphase.js).', ev: [E('pallet.done', 'backdock', B('B1'), {})],
      run: async c => { await c.tap('#dc-run .dc2-sq[data-ref="B1"]'); undks(c); setStrip(c, stripRun(M.last)); sheet(c, card('B1', { st: 'a', who: 'D9', clock: '3:58', pick: 'D4' }));
        await c.tap('.p2-sheet .dc2-dn'); unsheet(c); run(c, M.clear); setStrip(c, stripClear()); toast2(c, `<span>${tx('{ref} decanted · every pallet is done: close the truck', { ref: 'B1' })}</span><u>${tx('Close the truck')}</u>`); } },
    { cap: tx('Close the truck: the decant goes into the day’s history.'), read: S(tx('Closing writes the decant to history and updates personal rates.'), tx('Truck 1 shows as done in Today’s decants, and the dock is ready for the next truck.')),
      dev: 'The close is refused while a pallet is being cut; it ends an open hold-up and anyone’s break (<b>closeTruck()</b> in shared/reducers/backdock.js), and writes the day’s record (<b>historyRow()</b>).', ev: [E('truck.finalise', 'backdock', { truck: TR }, {})],
      run: async c => { await c.tap('.p2-strip .dc2-close'); dks(c, complete()); await c.tap('.dc2-dks .dc2-cl'); undks(c); c.view('dc-none'); c.html('#dc-none', noneView()); setStrip(c, stripNone()); toast2(c, tx('Truck {t} finalised', { t: 1 })); } },
  ],
  whatif: [[tx('Pressed Done by mistake?'), tx('Undo on the message, or Reopen on the pallet’s card.')],
    [tx('Pallets left when the shift ends?'), tx('Complete decant keeps them on their bays for the next truck: see Receive a truck on the phone.')]],
  stories: [],
};

// ── What ifs ───────────────────────────────────────────────────────────
// Each starts on the running decant at its own moment.
const at = s => () => phone('run', s, stripRun(s));
// 06:20: the three on their pallets.
const H0 = { b: { A2: ['a', 'D4', 4], A3: ['a', 'D7', 2], A5: ['a', 'D9', 1] }, est: '06:28' };
// 06:30: D7 back from a ten-minute break; A3 waited, the others moved on.
const BK = { b: { A1: ['d'], A2: ['d'], A5: ['d'], A3: ['p', 'D7', 2], A7: ['a', 'D4', 3], B1: ['a', 'D9', 2] }, est: '06:38' };
decant.stories.push({
  id: 'halt', title: tx('What if the line has to stop?'), blurb: tx('HALT stops the decant clock for everyone until it ends, so nobody’s time suffers.'),
  know: [S(tx('HALT on the strip stops the decant clock for the whole team.'), tx('The time it is open comes off every pallet’s time worked.')), tx('Nobody steps off: each pallet keeps the people on it and carries on when the halt ends.'),
    S(tx('Pick what stopped it: cages out, no stock, equipment, safety, waiting or other.'), tx('The truck’s record reports the downtime by reason.')),
    tx('A huddle, a transition and a team break stop the clock the same way, but they are planned pauses, reported on their own.'), tx('Any dock phone can end it, and closing the truck ends it too.')],
  html: at(H0),
  steps: [
    { cap: tx('Something stops the line: tap HALT.'), read: S(tx('HALT is on the strip, always in reach.'), tx('It asks what kind of hold-up it is.')),
      dev: 'The kinds are <b>holdPicker()</b> in js/views/backdock/receiving.js. Nothing is sent yet.', ev: [],
      run: async c => { await c.tap('.p2-strip .dc2-halt'); dks(c, holdup()); } },
    { cap: tx('A halt is downtime: pick Halt, then what stopped it.'), read: S(tx('Halt lists the reasons, with a note if it helps.'), tx('A transition has its own reasons; a huddle and a team break start with one button.')),
      dev: 'The reasons are HALT_NAME in js/views/backdock/common.js.', ev: [],
      run: async c => { await c.tap('.dc2-dks [data-k="halt"]'); c.html('.dc2-dks', holdup('halt')); } },
    { cap: tx('Cages out: every clock stops and the strip turns red.'), read: S(tx('The strip says what stopped the line and since when.'), tx('The pallets keep their people and their minutes.')),
      dev: 'One <b>halt.start</b>. Time worked leaves the halt out (<b>segWorkedMs()</b> in shared/reducers/backdock.js).', ev: [E('halt.start', 'backdock', { truck: TR }, { kind: 'halt', reason: 'hcage' })],
      run: async c => { await c.tap('.dc2-dks [data-r="hcage"]'); undks(c); setStrip(c, stripHalt('06:20'), true); toast2(c, tx('Decant clock stopped · {hold}', { hold: tx('Cages out') })); } },
    { cap: tx('Cages back: End halt, and the clocks carry on.'), read: S(tx('Eleven minutes later the cages are back.'), tx('A2 still shows 4 minutes: the halt came off everyone’s time, and the estimate moves on by as much.')),
      dev: 'One <b>halt.end</b> closes it.', ev: [E('halt.end', 'backdock', { truck: TR }, {})],
      run: async c => { await c.tap('.p2-strip .dc2-resume'); setStrip(c, stripRun({ ...H0, est: '06:39' })); toast2(c, tx('Decant running')); } },
  ],
});
decant.stories.push({
  id: 'break', title: tx('What if someone goes on a break?'), blurb: tx('Only their clock stops: their pallet pauses with its time, and the others carry on.'),
  know: [S(tx('A break stops one person’s clock.'), tx('A team break, from HALT, stops everyone’s.')), tx('Their pallet pauses with its time kept, unless someone else is on it too: then the others carry on.'),
    tx('Hold any name on the crew strip for that person’s card: their role, a break, stepping off, handing their pallet to a free cutter, or taking them off the truck.'),
    tx('On a break their name is greyed out; tapping it opens their card to bring them back.'), tx('Closing the truck brings everyone off their break.')],
  html: at(H0),
  steps: [
    { cap: tx('Hold D7’s name for their card.'), read: S(tx('The card shows what D7 is doing: decanting A3 for 2 minutes.'), tx('Start a break says what happens to A3.')),
      dev: 'The card is <b>personPanel()</b> in js/views/backdock/receiving.js.', ev: [],
      run: async c => { await c.tap('#dc-run .dc2-fc[data-pid="D7"]'); sheet(c, person('D7', { ref: 'A3', mins: 2 })); } },
    { cap: tx('Start a break: A3 pauses with its time, and the others carry on.'), read: S(tx('D7 is off A3 and greyed out on the crew strip.'), tx('Only D7’s clock stops.')),
      dev: 'One <b>break.start</b>: the reducer steps D7 off A3 first (<b>stepOff()</b> in shared/reducers/backdock.js).', ev: [E('break.start', 'backdock', { truck: TR }, { pid: 'D7' })],
      run: async c => { await c.tap('.p2-sheet .dc2-brk'); unsheet(c); run(c, { b: { ...H0.b, A3: ['p', 'D7', 2] }, brk: ['D7'] }); toast2(c, tx('{pid} is on a break, off {ref}: their clock stops', { pid: 'D7', ref: 'A3' })); } },
    { cap: tx('Back: tap the name, then Back from the break.'), read: S(tx('Ten minutes later D7 is back on the crew, free: A2 and A5 are done, and D4 and D9 have moved on.'), tx('A3 waited with its 2 minutes.')),
      dev: 'One <b>break.end</b>.', ev: [E('break.end', 'backdock', { truck: TR }, { pid: 'D7' })],
      run: async c => { await c.tap('#dc-run .dc2-fc[data-pid="D7"]'); sheet(c, person('D7', { brk: '06:20' })); await c.tap('.p2-sheet .dc2-back'); unsheet(c);
        run(c, BK); setStrip(c, stripRun(BK)); toast2(c, tx('{pid} is back', { pid: 'D7' })); } },
    { cap: tx('D7 picks A3 up again from 2 minutes.'), read: S(tx('Tap D7, then A3: the clock carries on where it stopped.'), tx('The break never counts against the pallet.')),
      dev: 'A paused pallet starts again with <b>pallet.resume</b>.', ev: [E('pallet.resume', 'backdock', B('A3'), { pid: 'D7' })],
      run: async c => { await c.tap('#dc-run .dc2-fc[data-pid="D7"]'); run(c, { ...BK, arm: 'D7' });
        await c.tap('#dc-run .dc2-sq[data-ref="A3"]'); run(c, { ...BK, b: { ...BK.b, A3: ['a', 'D7', 2] } }); toast2(c, `<span>${tx('{pid} on {ref}', { pid: 'D7', ref: 'A3' })}</span><u>${tx('Undo')}</u>`); } },
  ],
});
// 06:24: A2 done, D4 free.
const J0 = M.a2done, J1 = { b: { A2: ['d'], A3: ['a', 'D7+D4', 6], A5: ['a', 'D9', 5] }, est: '06:29' };
decant.stories.push({
  id: 'two', title: tx('What if two people work one pallet?'), blurb: tx('A free cutter joins it: the pallet’s time is shared, and one Done finishes it for both.'),
  know: [tx('A cutter who is free can tap a pallet already being cut: they join it, and both names show on the square.'), tx('The pallet’s cartons are shared between them by the time each worked on it.'),
    tx('Either can step off from the pallet’s card; the last one off leaves it paused with its time kept.'), S(tx('One Done finishes it for both.'), tx('If both press Done at once, the first counts and the second changes nothing.')),
    tx('Hand over passes the whole pallet to a free cutter instead.')],
  html: at(J0),
  steps: [
    { cap: tx('D4 is free: tap D4, and pallets being cut light up too.'), read: S(tx('Waiting pallets light up, and so do A3 and A5, which D7 and D9 are cutting.'), tx('A lit pallet that is running is one D4 can join.')),
      dev: 'Choosing a cutter stays on this phone: nothing is sent.', ev: [],
      run: async c => { await c.tap('#dc-run .dc2-fc[data-pid="D4"]'); run(c, { ...J0, arm: 'D4' }); } },
    { cap: tx('Tap A3: D4 joins D7 on it.'), read: S(tx('Both names show on the square.'), tx('From now on A3’s time runs for both of them.')),
      dev: 'One <b>pallet.join</b>; joining someone on another pallet is refused (<b>canWork()</b> in shared/reducers/backdock.js).', ev: [E('pallet.join', 'backdock', B('A3'), { pid: 'D4' })],
      run: async c => { await c.tap('#dc-run .dc2-sq[data-ref="A3"]'); run(c, J1); toast2(c, `<span>${tx('{pid} joined {ref}', { pid: 'D4', ref: 'A3' })}</span><u>${tx('Undo')}</u>`); } },
    { cap: tx('Open A3: both names, and either can step off.'), read: S(tx('The decant says D7 + D4.'), tx('Steps off takes one of them off; the other carries on.')),
      dev: 'Stepping off is <b>pallet.leave</b>; the last one off leaves the pallet paused.', ev: [],
      run: async c => { await c.tap('#dc-run .dc2-sq[data-ref="A3"]'); sheet(c, card('A3', { st: 'a', who: ['D7', 'D4'], clock: '6:20' })); } },
    { cap: tx('D7 presses Done on their phone: here it turns Decanted at once.'), read: S(tx('One Done finishes it for both of them.'), tx('Had both pressed Done at once, the second would change nothing.')),
      dev: 'A second <b>pallet.done</b> is acknowledged and changes nothing: the pallet is done once, its cartons shared by time worked.', ev: [E('pallet.done', 'backdock', B('A3'), {})],
      run: async c => { await c.wait(900); c.html('.p2-sheet', card('A3', { st: 'd', who: 'D7', clock: '10:00', done: '06:26' })); run(c, { b: { A2: ['d'], A3: ['d'], A5: ['a', 'D9', 7] } }); } },
  ],
});
