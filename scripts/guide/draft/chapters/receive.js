// Redrawn chapter (DRAFT): Receive a truck on the phone, the Back dock tabs as
// the app has them today (js/views/backdock/receiving.js, bdhome.js,
// decant.js): land a pallet with the camera, the other phones land theirs
// live, Finish receiving, Take 5. Three What ifs play on the same phone.
// The day: Busselton 1241, Truck 1 with manifest 7040301 and its 12 consols
// (the demo day scripts/guide/seed.mjs records), team D4, D7, D9.
import { tx, txn } from '../../i18n.js';
import { ai, phone2, tab, sheet, unsheet, sheetHead, toast2, label, camera2, tally } from '../frames.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const TR = '2026-10-25-T1';
// The manifest's consols: id, cartons, department, its name.
const C = [['601930100', 2, '022', 'TOYS'], ['601930107', 7, '038', 'PARTY'], ['601930114', 9, '047', 'BATH'], ['601930121', 2, '024', 'KIDSWEAR'], ['601930128', 7, '085', 'CARDS & COLLECT'], ['601930135', 9, '054', 'KITCHEN'],
  ['601930142', 2, '090', 'GIFT WRAP'], ['601930149', 7, '006', 'BEDDING'], ['601930156', 9, '022', 'TOYS'], ['601930163', 2, '038', 'PARTY'], ['601930170', 7, '047', 'BATH'], ['601930177', 9, '024', 'KIDSWEAR']];
const cons = i => '093008012' + C[i][0];
const TYPES = () => ({ c: tx('Chep tubs'), l: tx('Load pallet'), b: tx('Bulk') });

// ── the screens ──────────────────────────────────────────────────────
const PH = () => [tx('Planned'), tx('Receiving'), tx('Received'), tx('Decanting'), tx('Cleared'), tx('Closed')];
const track = at => `<div class="ph2t">${PH().map((l, i) => `<span class="${i < at ? 'd' : i === at ? 'c' : ''}">${l}</span>`).join('')}</div>`;
const STATUS = () => ({ 1: ['rec', tx('Receiving')], 2: ['ok', tx('Received')], 3: ['dec', tx('Decanting')] });
const truck = (n = 1, at = 1, man = true) => `<div class="tk2"><div class="tk2-r"><b>${tx('Truck {n}', { n })}${ai('chev')}</b><span class="st2 ${STATUS()[at][0]}">${STATUS()[at][1]}</span>` +
  (man ? `<span class="mf2"><b>${ai('file')}7040301</b><small>${tx('{c} ctn · {n} consols expected', { c: 72, n: 12 })}</small></span>` : `<span class="mf2"><b>${ai('file')}${tx('No manifest')}</b><small>${tx('A manager attaches the manifest.')}</small></span>`) + `</div>${track(at)}</div>`;
// The dock: bays A1 to D7. A pallet is { t: c|l|b, n: cartons, ok, off, cr: carried, done, tm }.
const grid = bays => `<div class="dk2">${[...'ABCD'].flatMap(r => [1, 2, 3, 4, 5, 6, 7].map(k => {
  const ref = r + k, p = bays[ref];
  if (!p) return `<span class="sq2" data-ref="${ref}"><i>${ref}</i>+</span>`;
  return `<span class="sq2 ${p.done ? 'done' : 't-' + p.t}${p.fresh ? ' fresh' : ''}" data-ref="${ref}"><i>${ref}${p.cr ? ' ↩' : ''}</i>${p.n}${p.ok || p.done ? `<span class="ok2">${ai('check')}</span>` : ''}${p.off ? '<span class="off2">OFF</span>' : p.tm ? `<span class="tm2">${p.tm}</span>` : ''}</span>`;
})).join('')}</div>`;
const entry = bays => { const n = Object.keys(bays).length; return `<div class="card2 pe"><div class="card2-h">${tx('Pallet entry')}<span>${tx('{a} of {b} verified', { a: Object.values(bays).filter(p => p.ok || p.done).length, b: n })}</span></div>${grid(bays)}</div>`; };
const legend = () => `<div class="lg2"><span><i style="background:#2953D6"></i>${tx('Tubs')}</span><span><i style="background:#B3261E"></i>${tx('Load')}</span><span><i style="background:#69787F"></i>${tx('Bulk')}</span><span class="r">${tx('Tap an empty square to land')}</span></div>`;
const llRow = ([ref, t, n, labels, at]) => `<div><span class="tg t-${t}">${ref}</span><span class="ck">${ai('check')}</span><span><em class="t-${t}">${TYPES()[t]}</em> · ${tx('{n} ctn', { n })} · ${txn(labels, '{n} label', '{n} labels')}</span><small>${at}</small></div>`;
const last = (rows, ctn) => `<div class="card2 ll"><div class="card2-h">${tx('Last landed')}<span>${tx('landed {a} · first pallet {b} · {n} ctn', { a: '05:40', b: '05:45', n: ctn })}</span></div><div class="ll2">${rows.map(llRow).join('')}</div></div>`;
const strip = (got, toLand, off) => `<div class="ds2"><b>${got}/12 <span>${tx('consols matched')}</span></b><div class="bar"><i style="width:${Math.round(got / 12 * 100)}%"></i></div><small>${tx('<em>{a}</em> to land · <em class="z">{b}</em> off-manifest', { a: toLand, b: off })}</small></div><span class="b2 pri fin">${tx('Finish receiving')}</span><span class="up2">${ai('chev', 'up')}</span>`;
const stripReceived = () => `<div class="ds2"><b>${tx('Received')}</b><small>${tx('Take 5, then Start decant')}</small></div><span class="up2">${ai('chev', 'up')}</span>`;

// The bays as the day goes on.
const B0 = { A1: { t: 'c', n: 2, ok: true }, A2: { t: 'l', n: 16, ok: true } };
const B1 = { ...B0, A3: { t: 'c', n: 18, ok: true } };
const B2 = { ...B1, A4: { t: 'c', n: 2, ok: true }, A5: { t: 'c', n: 16, ok: true }, A6: { t: 'l', n: 2, ok: true, off: true }, A7: { t: 'b', n: 7, ok: true }, B1: { t: 'c', n: 9, ok: true } };
const fresh = (b, refs) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, refs.includes(k) ? { ...v, fresh: true } : v]));
const L0 = [['A2', 'l', 16, 2, '05:48'], ['A1', 'c', 2, 1, '05:45']];
const L1 = [['A3', 'c', 18, 3, '06:02'], ...L0];
const L2 = [['B1', 'c', 9, 1, '06:09'], ['A7', 'b', 7, 1, '06:08'], ['A6', 'l', 2, 2, '06:07'], ...L1];

const home = () => `<div class="v hm2" id="r-home" style="display:flex;flex-direction:column;gap:12px"><div><h3>${tx('Back dock')}</h3><p>${tx('Truck {n} · landed {time}', { n: 1, time: '05:40' })}</p></div>` +
  `<div class="row2" style="gap:10px;font-size:13px;color:var(--d)"><b style="font-size:20px;color:var(--i)">0</b><span style="flex:1;height:5px;border-radius:5px;background:#E5E7EB"></span>${tx('{n} cartons · {p}%', { n: 18, p: 0 })}</div>` +
  `<div class="tk2">${track(1)}<div class="row2"><div style="flex:1;display:flex;flex-direction:column"><b style="font-size:15px">${tx('Truck {n} · Receiving', { n: 1 })}</b><small style="color:var(--d);font-size:12.5px">${tx('{p} pallets landed · {a} of {b} consols matched', { p: 2, a: 3, b: 12 })}</small></div><span class="b2 pri" style="min-height:42px">${tx('Finish receiving')}${ai('arrow')}</span></div></div>` +
  `<div class="tile2 hot" data-go="land"><span class="ic">${ai('parking')}</span><span class="t"><b>${tx('Land a pallet')}</b><small>${tx('Scan the labels · type · cartons')}</small></span>${ai('chev', 'fwd')}</div>` +
  `<div class="tile2"><span class="ic">${ai('box')}</span><span class="t"><b>${tx('Run the decant')}</b><small>${tx('Start, pause and finish pallets')}</small></span><span class="pl">${tx('{n} live', { n: 0 })}</span>${ai('chev', 'fwd')}</div>` +
  `<div class="tile2"><span class="ic">${ai('users')}</span><span class="t"><b>${tx('Team')}</b><small>D4 · D7 · D9</small></span>${ai('chev', 'fwd')}</div>` +
  `<div class="sh-sec">${tx('Who’s on this phone?')}</div><div class="two2" style="grid-template-columns:repeat(3,1fr)"><span class="f2">D4</span><span class="f2">D7</span><span class="f2">D9</span></div></div>`;
const recv = (bays = B0, rows = L0) => `<div class="v" id="r-recv" hidden style="display:flex;flex-direction:column;gap:10px">${truck(1, 1)}<div class="pe-w">${entry(bays)}</div>${legend()}<div class="ll-w">${last(rows, 18)}</div></div>`;
const take5 = () => `<div class="v" id="r-dec" hidden style="display:flex;flex-direction:column;gap:10px">${truck(1, 2)}` +
  `<div class="card2" style="padding:12px;display:flex;flex-direction:column;gap:10px"><div class="row2"><b style="font-size:17px">${tx('Ready to start · Take 5')}</b><small style="color:var(--d)">${txn(3, '{n} decanter', '{n} decanters')}</small></div><div class="who2"><span>D4</span><span>D7</span><span>D9</span></div>` +
  `<div class="t5">${[[tx('Team briefed'), tx('Everyone knows the plan, their role and their start time.')], [tx('Team safety'), tx('Fit for work, PPE on, anything to flag is raised.')], [tx('Equipment safe'), tx('Box cutters, cages and work tables checked and ready.')], [tx('Area clear'), tx('Dock clear of spills, obstructions and trip hazards.')], [tx('Goal agreed'), tx('Target finish set and shared with the team.')]].map(([b, s], i) => `<div data-t5="${i}"><i></i><span><b>${b}</b><small>${s}</small></span></div>`).join('')}</div>` +
  `<div class="row2"><span class="b2 pri off sd">${ai('arrow')}${tx('Start decant')}</span><span class="b2">${ai('users')}${tx('Launch huddle')}</span></div><small class="t5n" style="color:var(--d);font-size:12.5px">${tx('{a} of {b} checked. Tick all five to start; nothing can be started until then.', { a: 0, b: 5 })}</small></div></div>`;

// The land sheet: its labels ([kind, id, cartons, dept, note]), the type picked, typing or not.
// typing: false shows Scan labels and Type it; true the empty field the app keeps open after Type it.
function land({ n = 3, ref = 'A3', labels = [], type = '', typing = false, est = '' } = {}) {
  const ctn = labels.filter(l => l[0] === 'ok').reduce((s, l) => s + l[2], 0), ok = labels.filter(l => l[0] === 'ok').length;
  const row = ([k, id, c, d, note]) => k === 'ok' ? `<div class="lb2">${ai('check')}<b>${id}</b><span>${tx('{n} ctn', { n: c })} · ${d}</span><span class="x2">${ai('x')}</span></div>`
    : `<div class="lb2 ${k}">${ai(k === 'bad' ? 'x' : 'alert')}<b>${id}</b><span>${note}</span><span class="x2">${ai('x')}</span></div>`;
  return sheetHead('parking', tx('Land pallet {n} · {ref}', { n, ref })) + `<div class="sh-b"><div class="sh-sec">${ai('barcode')}${tx('Scan the labels')}</div>` +
    (typing ? `<div class="row2 ty-w"><span class="f2 mono ty-f ph" style="flex:1"><span class="t">${tx('Type the label number')}</span><span class="caret"></span></span><span class="b2" style="width:46px;padding:0">${ai('camera')}</span><span class="b2 add">${tx('Add')}</span></div>`
      : `<div class="row2"><span class="b2 pri big cam" style="flex:1">${ai('camera')}${tx('Scan labels')}</span><span class="b2 big ty">${ai('keyboard')}${tx('Type it')}</span></div>`) +
    (labels.length ? `<div class="lbl" style="display:flex;flex-direction:column;gap:6px">${labels.map(row).join('')}</div>` : `<div class="sh-hint">${tx('Each consol label fills its cartons. Stack as many as are on the pallet.')}</div>`) +
    `<div class="sh-sec">${ai('cube')}${tx('Pallet type')}</div><div class="pt2">${[['c', tx('Chep tubs')], ['l', tx('Load pallet')], ['b', tx('Bulk')]].map(([k, l]) => `<span class="${k}${type === k ? ' on' : ''}" data-pt="${k}">${l}</span>`).join('')}</div>` +
    `<div class="two2"><div><div class="sh-sec">${ai('packages')}${tx('Cartons')}</div><span class="f2">${ctn}</span></div><div><div class="sh-sec">${ai('clock')}${tx('Est. mins')}<span class="r">${tx('auto')}</span></div><span class="f2">${est || (ctn ? Math.max(1, Math.round(ctn / 2)) : '–')}</span></div></div>` +
    (ok ? `<div class="sh-hint">${tx('{c} cartons from {n} labels. Type a count only to correct it.', { c: ctn, n: ok })}</div>` : '') +
    `<span class="b2 pri big wide go${type ? '' : ' off'}">${ai('plus')}${type ? tx('Land at {ref}', { ref }) : tx('Choose the type to land')}</span></div>`;
}
const finish = (off = 1) => sheetHead('check', tx('Finish receiving · Truck {n}', { n: 1 })) + `<div class="sh-b"><div class="sh-hint">${tx('Confirm the layout once everything is off the truck. Pallets can still be changed afterwards.')}</div>` +
  `<div class="fc2"><div><b>8</b><small>${tx('pallets on the dock')}</small></div><div><b>72</b><small>${tx('cartons counted')}</small></div><div class="g"><b>12/12</b><small>${tx('consols matched')}</small></div><div class="g"><b>0</b><small>${tx('on the manifest, not landed')}</small></div>` +
  `<div class="${off ? 'r' : 'g'}"><b>${off}</b><small>${tx('label not on the manifest')}</small></div></div>` +
  (off ? `<div class="wn2">${ai('alert')}${tx('Something is off. Check it now, or confirm and sort it out in the audit.')}</div>` : '') +
  `<div class="row2"><span class="b2 pri big conf" style="flex:1">${ai('check')}${tx('Confirm layout')}</span><span class="b2 big" style="flex:1">${tx('Back')}</span></div></div>`;

const LABS = () => label({ cons: cons(3), dept: '024', name: 'KIDSWEAR', ctns: 2, n: 4 }) + label({ cons: cons(4), dept: '085', name: 'CARDS & COLLECT', ctns: 7, n: 5 });
const phone = ({ view = 'home', bays = B0, rows = L0 } = {}) => {
  let h = phone2('rv', home() + recv(bays, rows) + take5(), { area: 'backdock', on: view === 'recv' ? 'receiving' : 'mhome', strip: view === 'recv' ? strip(3, 9, 0) : '', extra: camera2(LABS()) });
  if (view === 'recv') h = h.replace('id="r-home" style="display:flex', 'id="r-home" hidden style="display:flex').replace('id="r-recv" hidden', 'id="r-recv"');
  return h;
};
const L = (i, k = 'ok', note = '') => [k, C[i][0], C[i][1], C[i][2], note];
const HELD = () => ['warn', '601999917', 0, '', tx('not on this manifest: held on the pallet to flag or ignore')];
// Types a label number into the open field and adds it.
const typeIn = async (c, code) => { c.cls('.ty-f', 'ph', false); await c.type('.ty-f .t', code); await c.tap('.p2-sheet .add'); };
// A landed pallet's card (js/views/backdock/receiving.js palletPanel): type, cartons, labels, actions.
const card = ({ ref, pill, extra = '', type, ctn, est, rows }) => `<div class="sh-h"><b>${tx('Pallet {ref}', { ref })} <span class="st2 ${pill[0]}" style="vertical-align:3px">${pill[1]}</span>${extra}</b><span class="sh-x">${ai('x')}</span></div>` +
  `<div class="sh-b"><div class="pt2">${[['c', tx('Chep tubs')], ['l', tx('Load pallet')], ['b', tx('Bulk')]].map(([k, l]) => `<span class="${k}${type === k ? ' on' : ''}">${type === k ? ai('check') : ''}${l}</span>`).join('')}</div>` +
  `<div class="two2"><div><div class="sh-sec">${tx('Cartons')}</div><span class="f2">${ctn}</span></div><div><div class="sh-sec">${tx('Est. mins')}</div><span class="f2">${est}</span></div></div><div class="sh-sec">${tx('Note')}</div><span class="f2 ph">${tx('optional')}</span>` +
  `<div class="row2"><span class="b2 pri big" style="flex:1">${ai('camera')}${tx('Scan a label')}</span><span class="b2 big">${ai('keyboard')}${tx('Type it')}</span></div><div class="rows" style="display:flex;flex-direction:column;gap:6px">${rows}</div>` +
  `<div class="two2"><span class="b2">${ai('check')}${tx('Update')}</span><span class="b2">${ai('swap')}${tx('Move')}</span></div></div>`;

// ── the chapter ──────────────────────────────────────────────────────
export const receive = {
  id: 'receivephone', grp: 'dock', icon: 'truck', title: tx('Receive a truck on the phone'), device: 'phone', where: tx('Phone · Back dock › Receive'), for: ['dock', 'manager'],
  intro: S(tx('Land each pallet on its bay: scan its labels with the camera, pick the type, land it.'), tx('Every phone and dock screen shows it at once. When the truck is empty, Finish receiving checks the count, then Take 5 starts the decant.')),
  html: () => phone(),
  steps: [
    { cap: tx('Back dock shows the truck that landed: Land a pallet opens Receive.'), read: S(tx('Back dock opens on today’s truck: Truck 1 is receiving, with manifest 7040301 and its 12 consols.'), tx('Two pallets are already down.')),
      dev: 'The phone home is <b>bdhome</b> (js/views/backdock/bdhome.js); Land a pallet opens Receive.', ev: [],
      run: async c => { await c.tap('[data-go="land"]'); c.view('r-recv'); tab(c, 'receiving'); c.html('.p2-strip', strip(3, 9, 0)); c.show('.p2-strip'); } },
    { cap: tx('Tap the bay where the pallet stands.'), read: S(tx('Each square is a bay on the dock.'), tx('Blue, red and grey squares hold a pallet; an empty one opens the land sheet for the next pallet.')),
      dev: 'Nothing is sent until the pallet lands.', ev: [],
      run: async c => { await c.tap('.sq2[data-ref="A3"]'); sheet(c, land()); } },
    { cap: tx('Scan the pallet’s labels with the camera.'), read: S(tx('Scan labels opens the camera.'), tx('It reads the consolidation barcode on each label and keeps a tally, so one pass takes every label on the pallet.')),
      dev: 'The camera is <b>openScanner()</b> (js/scan.js): the phone’s own barcode reader, or ZXing where there is none.', ev: [],
      run: async c => { await c.tap('.p2-sheet .cam'); c.show('.cam2'); c.html('.cam2-t', ''); await c.wait(900); c.cls('.cam2', 'hit', true); c.html('.cam2-t', tally(1, cons(3))); await c.wait(400); c.cls('.cam2', 'hit', false); } },
    { cap: tx('Move to the next label: each one it reads adds to the tally.'), read: S(tx('A beep and a buzz confirm each good read.'), tx('The tally shows how many it has read and the last number.')),
      dev: 'A code read twice within 2.5 seconds counts once.', ev: [],
      run: async c => { await c.tap('.cam2-v'); c.cls('.cam2', 'pan', true); await c.wait(1300); c.cls('.cam2', 'hit', true); c.html('.cam2-t', tally(2, cons(4))); await c.wait(400); c.cls('.cam2', 'hit', false); } },
    { cap: tx('Close the camera: both labels are on the pallet, cartons filled in.'), read: S(tx('Each consol on the manifest gets a tick with its cartons and department.'), tx('A label that is not on the manifest, or is already on another pallet, says so here.')),
      dev: 'Labels are checked against the truck’s manifest on the phone, before anything is sent.', ev: [],
      run: async c => { await c.tap('[data-camx]'); c.hide('.cam2'); c.cls('.cam2', 'pan', false); c.html('.p2-sheet', land({ labels: [L(3), L(4)] })); } },
    { cap: tx('A label too torn to scan? Type its number instead.'), read: S(tx('Type it shows a field for the label number.'), tx('It is checked against the manifest just like a scan.')),
      dev: 'A typed label takes the same path as a scanned one.', ev: [],
      run: async c => { await c.tap('.p2-sheet .ty'); c.html('.p2-sheet', land({ labels: [L(3), L(4)], typing: true })); await typeIn(c, C[5][0]); c.html('.p2-sheet', land({ labels: [L(3), L(4), L(5)], typing: true })); } },
    { cap: tx('Pick the pallet type.'), read: S(tx('Chep tubs, Load pallet or Bulk, in the same colours as the dock grid.'), tx('Cartons and the estimated decant time come from the labels.')),
      dev: 'The estimate comes from the cartons and the store’s decant rates.', ev: [],
      run: async c => { await c.tap('.pt2 [data-pt="c"]'); c.html('.p2-sheet', land({ labels: [L(3), L(4), L(5)], type: 'c', typing: true })); } },
    { cap: tx('Land it: the bay fills and the count moves on.'), read: S(tx('The pallet is on the dock for everyone: every phone and the dock screens show A3 straight away.'), tx('The strip counts the consols matched.')),
      dev: 'One event lands the pallet with its type, cartons and consols.',
      ev: [E('pallet.land', 'backdock', { truck: TR, bay: 'A3' }, { ptype: 'chep', cartons: 18, consolIds: [C[3][0], C[4][0], C[5][0]] })],
      run: async c => { await c.tap('.p2-sheet .go'); unsheet(c); c.html('.pe-w', entry(fresh(B1, ['A3']))); c.html('.ll-w', last(L1, 18)); c.html('.p2-strip', strip(6, 6, 0)); toast2(c, `<span>${tx('Pallet landed at {ref}', { ref: 'A3' })} · ${txn(3, '{n} label', '{n} labels')}</span><u>${tx('Open')}</u>`); } },
    { cap: tx('The other dock phones land theirs: it all updates live.'), read: S(tx('Nobody refreshes anything.'), tx('Each phone landing a pallet sends one event, and every device on the dock shows it within a second or two.')),
      dev: 'Back dock events go to every back dock device and to managers.', ev: [E('pallet.land', 'backdock', { truck: TR, bay: 'A4' }, { ptype: 'chep', cartons: 2, consolIds: [C[6][0]] }, { n: 5 })],
      run: async c => { await c.wait(700); c.html('.pe-w', entry(fresh(B2, ['A4', 'A5', 'A6', 'A7', 'B1']))); c.html('.ll-w', last(L2, 18)); c.html('.p2-strip', strip(12, 0, 1)); } },
    { cap: tx('Every pallet down: Finish receiving.'), read: S(tx('The strip has the next step.'), tx('Finish receiving counts what landed, what is still to land and any label that is not on the manifest, before the layout is confirmed.')),
      dev: 'The counts come from the truck as the reducer holds it; nothing is sent to open the sheet.', ev: [],
      run: async c => { await c.tap('.p2-strip .fin'); sheet(c, finish(1)); } },
    { cap: tx('Something off? It says so. Confirm the layout and the truck moves to Received.'), read: S(tx('One label here is not on the manifest: it can be checked now, or confirmed and sorted out in the audit.'), tx('Pallets can still be changed afterwards.')),
      dev: 'Confirming hands the layout to the decant.', ev: [E('receiving.confirm', 'backdock', { truck: TR }, {})],
      run: async c => { await c.tap('.p2-sheet .conf'); unsheet(c); c.html('#r-recv .tk2', truck(1, 2).replace(/^<div class="tk2">|<\/div>$/g, '')); c.html('.p2-strip', stripReceived()); toast2(c, `<span>${tx('Layout confirmed · Truck {n} received: Take 5, then start', { n: 1 })}</span>`); } },
    { cap: tx('Decant: Take 5 with the team, then Start decant.'), read: S(tx('Five checks before anyone cuts a carton: briefed, safety, equipment, area and the goal.'), tx('Start decant opens once all five are ticked.')),
      dev: 'Take 5 is one event with the five checks; the decant clock starts with Start decant.', ev: [],
      run: async c => { await c.tap('.p2-tabs [data-tab="decant"]'); tab(c, 'decant'); c.view('r-dec'); } },
  ],
  whatif: [[tx('Lost wifi part-way through?'), S(tx('Each landing is kept on the phone and sends when it can.'), tx('Carry on landing.'))]],
  stories: [],
};

// ── What ifs ─────────────────────────────────────────────────────────
// Each opens on the receive screen with its own starting point.
const at = (bays, rows) => () => phone({ view: 'recv', bays, rows });
receive.stories.push({
  id: 'offmanifest', title: tx('What if a label isn’t on the manifest?'), blurb: tx('It is held on the pallet to flag or ignore, and counted before the layout is confirmed.'),
  know: [tx('Receiving never stops for it: the label is held on its pallet, and the pallet still lands with its other labels.'), tx('The pallet’s square shows it on every phone and dock screen until someone looks at it.'),
    tx('Add &amp; flag keeps the label on the pallet and puts it in the truck’s receiving audit. Ignore takes it off.'), tx('Finish receiving counts labels not on the manifest and says something is off before the layout is confirmed.'),
    tx('The usual cause, named on screen: an old label left on a reused tub.')],
  html: at(B0, L0),
  steps: [
    { cap: tx('A label that isn’t on this manifest is held, not lost.'), read: S(tx('It says so straight away and keeps the label on the pallet, held to flag or ignore.'), tx('The likely cause is named too: an old label on a reused tub.')),
      dev: 'The label is kept in the pallet’s held list.', ev: [],
      run: async c => { await c.tap('.sq2[data-ref="A3"]'); sheet(c, land({ typing: true })); await typeIn(c, '601999917'); c.html('.p2-sheet', land({ labels: [HELD()], typing: true })); toast2(c, tx('{id} is not on this manifest. Old label from a reused tub?', { id: '601999917' }), 'bad'); } },
    { cap: tx('The pallet’s other labels go on as normal.'), read: tx('One odd label never stops the pallet: its matching consols still fill in their cartons.'), dev: 'Matching consols fill the cartons as usual.', ev: [],
      run: async c => { await typeIn(c, C[3][0]); c.html('.p2-sheet', land({ labels: [HELD(), L(3)], typing: true })); } },
    { cap: tx('Land it: the bay is marked so everyone sees it.'), read: S(tx('The square shows OFF until someone decides.'), tx('Every phone and the dock screens show the same mark.')),
      dev: 'The held label lands with the pallet.', ev: [E('pallet.land', 'backdock', { truck: TR, bay: 'A3' }, { ptype: 'chep', cartons: 2, consolIds: [C[3][0]], held: ['601999917'] })],
      run: async c => { await c.tap('.pt2 [data-pt="c"]'); c.html('.p2-sheet', land({ labels: [HELD(), L(3)], type: 'c', typing: true })); await c.tap('.p2-sheet .go'); unsheet(c);
        c.html('.pe-w', entry(fresh({ ...B0, A3: { t: 'c', n: 2, ok: true, off: true } }, ['A3']))); c.html('.ll-w', last([['A3', 'c', 2, 1, '06:02'], ...L0], 20)); c.html('.p2-strip', strip(4, 8, 1));
        toast2(c, `<span>${tx('1 label is not on the manifest: open {ref} to flag or ignore it.', { ref: 'A3' })}</span><u>${tx('Open')}</u>`, 'bad'); } },
    { cap: tx('Open the pallet to decide: Add &amp; flag, or Ignore.'), read: S(tx('The pallet’s card lists the held label with its two choices.'), tx('Check the tub first: is it an old label?')),
      dev: 'Nothing changes until one of the two is pressed.', ev: [],
      run: async c => { await c.tap('.sq2[data-ref="A3"]'); sheet(c, card({ ref: 'A3', pill: ['dec', tx('Landed')], type: 'c', ctn: 2, est: 1,
        rows: `<div class="lb2">${ai('check')}<b>${C[3][0]}</b><span>${tx('{n} ctn', { n: 2 })} · 024</span><span class="x2">${ai('x')}</span></div><div class="lb2 warn">${ai('alert')}<b>601999917</b><span>${tx('not on this manifest')}</span><span class="mini addf">${tx('Add &amp; flag')}</span><span class="mini">${tx('Ignore')}</span></div>` })); } },
    { cap: tx('Add &amp; flag keeps it, flagged for the receiving audit.'), read: S(tx('The label stays on the pallet and goes on the truck’s receiving audit.'), tx('Ignore would take it off instead.')),
      dev: 'The held label moves into the pallet’s scanned labels.', ev: [E('pallet.update', 'backdock', { truck: TR, bay: 'A3' }, { scanIds: ['601999917'], held: [] })],
      run: async c => { await c.tap('.p2-sheet .addf'); c.html('.p2-sheet .lb2.warn', `<span style="width:14px;text-align:center">·</span><b>601999917</b><span>${tx('not on this manifest · flagged in the receiving audit')}</span><span class="x2">${ai('x')}</span>`); c.cls('.p2-sheet .lb2.warn', 'warn', false); toast2(c, tx('{id} flagged in the receiving audit', { id: '601999917' })); } },
    { cap: tx('Finish receiving counts it before the layout is confirmed.'), read: S(tx('Labels not on the manifest have their own count, in red.'), tx('Confirm and sort it out in the audit, or check it now.')),
      dev: 'The audit prints from a PC for managers.', ev: [],
      run: async c => { unsheet(c); c.html('.pe-w', entry({ ...B2, A3: { t: 'c', n: 18, ok: true, off: true }, A6: { t: 'l', n: 2, ok: true } })); c.html('.p2-strip', strip(12, 0, 1)); await c.tap('.p2-strip .fin'); sheet(c, finish(1)); } },
  ],
});
receive.stories.push({
  id: 'taken', title: tx('What if a consol is already on another pallet?'), blurb: tx('It says which pallet has it, and the first pallet keeps it.'),
  know: [tx('Each consolidation can be on one pallet only. Scanning it again says which pallet has it.'), tx('The pallet it landed on first keeps it: nothing is moved or lost by a stray scan.'),
    tx('Any scan can come off again with its ×, on the land sheet or on a landed pallet, so a wrong one is quick to put right.')],
  html: at(B1, L1),
  steps: [
    { cap: tx('Scan a label that’s already on another pallet: it says where it is.'), read: S(tx('Here consol 601930107 is scanned onto A4, but it landed on A2.'), tx('It stays on A2.')),
      dev: 'Checked on the phone against every landed pallet; nothing is sent.', ev: [],
      run: async c => { await c.tap('.sq2[data-ref="A4"]'); sheet(c, land({ n: 4, ref: 'A4', typing: true })); await typeIn(c, C[1][0]); c.html('.p2-sheet', land({ n: 4, ref: 'A4', labels: [['bad', C[1][0], 0, '', tx('already on {ref}: it stays there', { ref: 'A2' })]], typing: true })); toast2(c, tx('{id} is already on {ref}', { id: C[1][0], ref: 'A2' }), 'bad'); } },
    { cap: tx('Take the wrong scan off with ×.'), read: S(tx('The × takes a scan off the land sheet.'), tx('On a pallet that has landed, the same × sends the correction.')),
      dev: 'On a landed pallet the × sends <b>pallet.unscan</b>.', ev: [],
      run: async c => { await c.tap('.p2-sheet .lb2.bad .x2'); c.html('.p2-sheet', land({ n: 4, ref: 'A4', typing: true })); } },
  ],
});
// Rollover: Truck 1 has been decanting; four pallets are left when the shift ends.
const DEC = { A1: { t: 'c', n: 2, done: true }, A2: { t: 'l', n: 16, done: true }, A3: { t: 'c', n: 2, done: true }, A4: { t: 'c', n: 7, done: true }, A5: { t: 'b', n: 11, done: true }, A6: { t: 'l', n: 7, done: true },
  A7: { t: 'c', n: 9, tm: '14m' }, B1: { t: 'c', n: 2 }, B2: { t: 'l', n: 7 }, B3: { t: 'c', n: 9 } };
const CARRY = { A7: { t: 'c', n: 9, ok: true, cr: true, tm: '14m' }, B1: { t: 'c', n: 2, ok: true, cr: true }, B2: { t: 'l', n: 7, ok: true, cr: true }, B3: { t: 'c', n: 9, ok: true, cr: true } };
const decStrip = () => `<div class="ds2"><b>45/72 <span>${tx('ctn · {p}% · {a} of {b} done', { p: 63, a: 6, b: 10 })}</span></b><div class="bar"><i style="width:63%"></i></div><small>${tx('est {time} · no goal set', { time: '15:09' })}</small></div><span class="b2" style="background:#DC2626;border-color:#DC2626;color:#fff;min-width:84px">${tx('HALT')}</span><span class="up2 menu">${ai('chev', 'up')}</span>`;
const twoLine = (cls, a, b) => `<span class="b2 ${cls}" style="flex-direction:column;align-items:flex-start;gap:0;padding:8px 12px;white-space:normal;text-align:left"><span>${a}</span><small style="font-weight:500;font-size:12px;opacity:.85">${b}</small></span>`;
const held = () => `<div class="card2" style="padding:12px 14px;display:flex;flex-direction:column;gap:6px"><b style="font-size:17px">${tx('Held for the next truck')}</b><small style="color:var(--d)">${tx('from Truck {n} · {p} pallets · {c} ctn', { n: 1, p: 4, c: 27 })}</small>` +
  [['A7', tx('Chep tubs'), 9, tx('Paused')], ['B1', tx('Chep tubs'), 2, tx('Waiting')], ['B2', tx('Load pallets'), 7, tx('Waiting')], ['B3', tx('Chep tubs'), 9, tx('Waiting')]].map(([r, t, n, st]) => `<div class="row2" style="font-size:13.5px;border-top:1px solid var(--ls);padding-top:6px"><b style="width:30px;color:#0B6183">${r}</b><span style="flex:1">${t} · ${tx('{n} cartons', { n })}</span><small style="background:var(--g);border-radius:6px;padding:2px 6px;color:var(--d);font-weight:600">${st}</small></div>`).join('') +
  `<small style="color:var(--d);font-size:12.5px">${tx('They stay on their bays and join the next truck when it starts.')}</small></div>`;
const newStrip = () => `<span style="flex:1;font-size:13.5px;color:#D1D5DB">${tx('Tap New truck when it lands.')}</span><span class="b2 pri newt">${ai('plus')}${tx('New truck')}</span>`;
const decPhone = () => phone2('rv', `<div class="v" id="r-run" style="display:flex;flex-direction:column;gap:10px">${truck(1, 3)}<div class="pe-w">${entry(DEC)}</div><div class="sh-hint">${tx('Tap a cutter, then a square, to start decanting it.')}</div></div>` +
  `<div class="v" id="r-home" hidden style="display:flex;flex-direction:column;gap:10px"></div><div class="v" id="r-recv" hidden style="display:flex;flex-direction:column;gap:10px"></div>`, { area: 'backdock', on: 'decant', strip: decStrip() });
receive.stories.push({
  id: 'rollover', title: tx('What if pallets are left over from the last truck?'), blurb: tx('They stay on their bays with everything they had, and join the next truck.'),
  know: [tx('Closing a truck with pallets not decanted asks what to do with them: keep them as rollover for the next truck, or clear the dock.'), tx('The truck that closes keeps only its own work: its record, rates and manifest audit still add up.'),
    tx('Rolled-over pallets stay on their bays with everything on them: labels and consols, type, cartons, estimated time and the time already worked on it.'), tx('Each is marked carryover with the truck it first landed on, even if it rolls over again.'),
    tx('Between trucks they show as Held for the next truck. The next truck takes them unless its New truck sheet says otherwise.'), tx('One set can be held at a time. Reopening the closed truck brings its pallets back onto it.')],
  html: decPhone,
  steps: [
    { cap: tx('The shift is ending and four pallets aren’t done.'), read: S(tx('Six of Truck 1’s ten pallets are decanted.'), tx('A7 was started and paused at 14 minutes; B1 to B3 haven’t been started.')),
      dev: 'Decanted pallets are green; A7 shows the time already worked.', ev: [], run: async c => { await c.wait(300); } },
    { cap: tx('Close the truck: it shows what is still on the dock.'), read: S(tx('Complete decant lists the pallets not decanted, with their cartons.'), tx('Keep them as rollover, or clear the dock.')),
      dev: 'Complete decant opens from the strip’s menu.', ev: [],
      run: async c => { await c.tap('.p2-strip .menu'); sheet(c, `<div class="sh-h"><b>${tx('Complete decant · Truck {n}', { n: 1 })} <small style="font-size:12.5px;font-weight:500;color:var(--d)">${tx('{a}/{b} pallets done', { a: 6, b: 10 })}</small></b></div><div class="sh-b">` +
        `<div style="font-size:15px">${tx('Closing writes the decant to history and updates rates.')} ${tx('<b>{n} pallets ({c} ctn)</b> are still on the dock, not decanted: {list}.', { n: 4, c: 27, list: 'A7, B1, B2, B3' })}</div>` +
        `<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">${twoLine('pri keep', tx('Keep {n} as rollover &amp; close', { n: 4 }), tx('they stay on their bays for the next truck'))}${twoLine('', tx('Clear the dock &amp; close'), tx('nothing kept: they stay on this truck’s record, not decanted'))}<span class="b2">${tx('Cancel')}</span></div></div>`); } },
    { cap: tx('Keep them as a rollover: they wait on their bays.'), read: S(tx('Truck 1 closes with only its own work.'), tx('The four pallets show as Held for the next truck.')),
      dev: 'The finalise carries the unfinished pallets: <b>takeLeftovers()</b> in shared/reducers/backdock.js holds them for the next truck.', ev: [E('truck.finalise', 'backdock', { truck: TR }, { rollover: true })],
      run: async c => { await c.tap('.p2-sheet .keep'); unsheet(c); c.view('r-home'); c.html('#r-run', '');
        c.html('#r-home', `<div class="card2" style="padding:14px 16px"><b style="font-size:19px">${tx('No truck on the dock')}</b></div><div class="card2" style="padding:12px 14px;display:flex;flex-direction:column;gap:8px"><b style="font-size:17px">${tx('Today’s decants')} <small style="color:var(--d);font-weight:500">1</small></b><div style="border:1px solid var(--l);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;align-items:flex-start"><b>${tx('Truck {n}', { n: 1 })}</b><span class="st2 ok" style="margin:0">${tx('Done')}</span><small style="color:var(--d)">${tx('{n} ctn cleared in {time}', { n: 45, time: '1h 54m' })}</small></div></div>${held()}`);
        c.html('.p2-strip', newStrip()); toast2(c, tx('Truck {t} finalised', { t: 1 }) + ' · ' + tx('{n} pallets held for the next truck', { n: 4 })); } },
    { cap: tx('When the next truck lands, New truck offers to keep them.'), read: S(tx('The New truck sheet shows the held pallets.'), tx('Keep them on Truck 2, or start fresh.')),
      dev: 'Start fresh sends <b>takeRollover: false</b> and leaves them held.', ev: [],
      run: async c => { await c.tap('.p2-strip .newt'); sheet(c, `<div class="sh-h"><b>${tx('New truck')}</b><span class="sh-x">${ai('x')}</span></div><div class="sh-b"><div class="sh-hint">${tx('It starts in its planned slot: the manifest, team and start time come with it.')}</div>` +
        `<div style="border:1px solid var(--l);border-radius:12px;padding:8px 12px;display:flex;flex-direction:column;gap:3px;align-items:flex-start"><span>${tx('Truck {n}', { n: 1 })}</span><span class="st2 ok" style="margin:0">${tx('Done')}</span></div>` +
        `<div style="border:2px solid #0E7CA8;background:#E7F2F6;border-radius:12px;padding:8px 12px"><b>${ai('plus')} ${tx('Unplanned truck')}</b><br><small style="color:var(--d)">${tx('not in the week plan · becomes Truck {n}', { n: 2 })}</small></div>` +
        `<div class="two2"><div><div class="sh-sec">${tx('Landed at')}</div><span class="f2">14:10</span></div><div><div class="sh-sec">${tx('Decant start')}</div><span class="f2 ph">--:--</span></div></div>` +
        `<div style="border:1px solid #DDD6FE;background:#F5F3FF;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px"><b>${tx('{n} pallets held from Truck {t}', { n: 4, t: 1 })}</b><small style="color:var(--d)">A7 ${tx('Chep tubs')} · B1 ${tx('Chep tubs')} · B2 ${tx('Load pallets')} · B3 ${tx('Chep tubs')}</small><div class="row2"><span class="b2" style="min-height:36px;border:2px solid #0E7CA8;color:#0B6183">${tx('Keep them on Truck {n}', { n: 2 })}</span><span class="b2" style="min-height:36px;border:0;background:none">${tx('Start fresh')}</span></div></div>` +
        `<div class="row2"><span class="b2 pri big go2" style="flex:1">${ai('truck')}${tx('Create &amp; go live · Truck {n}', { n: 2 })}</span><span class="b2 big">${tx('Cancel')}</span></div></div>`); } },
    { cap: tx('Truck 2 starts with them on their bays.'), read: S(tx('A7 and B1 to B3 are on the new truck’s grid, marked as carried over.'), tx('Truck 2’s own pallets land around them.')),
      dev: 'The new truck takes the held pallets as it is created.', ev: [E('truck.create', 'backdock', { truck: '2026-10-25-T2' }, { landedAt: '2026-10-25T14:10:00+08:00' })],
      run: async c => { await c.tap('.p2-sheet .go2'); unsheet(c); tab(c, 'receiving'); c.view('r-recv');
        c.html('#r-recv', truck(2, 1, false) + `<div class="pe-w">${entry(CARRY)}</div>${legend()}<div class="sh-hint">${tx('Nothing landed yet. Tap an empty square, or Scan a label.')}</div>`);
        c.html('.p2-strip', strip(4, 0, 0).replace('4/12', '4/4').replace('width:33%', 'width:100%')); toast2(c, tx('Truck {n} is receiving', { n: 2 })); } },
    { cap: tx('A carried pallet keeps everything it had.'), read: S(tx('A7 still has its label and consol, its type, cartons and estimate.'), tx('On the grid it still shows the 14 minutes already worked.')),
      dev: 'Carried pallets keep carryover: true and carriedFrom.', ev: [],
      run: async c => { await c.tap('.sq2[data-ref="A7"]'); sheet(c, card({ ref: 'A7', pill: ['dec', tx('Paused')], extra: ` <span class="st2 rec" style="vertical-align:3px;text-transform:none;letter-spacing:0">${tx('carryover')}</span>`, type: 'c', ctn: 9, est: 5,
        rows: `<div class="lb2">${ai('check')}<b>${C[8][0]}</b><span>${tx('{n} ctn', { n: 9 })} · 022</span><span class="x2">${ai('x')}</span></div>` })); } },
    { cap: tx('Then Decant: Truck 2 needs its own team and Take 5, and A7 picks up from 14 minutes.'), read: S(tx('Truck 2 gets its team from Team &amp; plan and does its own Take 5 before anyone starts.'), tx('When A7 is started again its clock carries on from 14 minutes.')),
      dev: 'The new truck needs its own team and Take 5 before Start decant.', ev: [],
      run: async c => { unsheet(c); await c.tap('.p2-tabs [data-tab="decant"]'); tab(c, 'decant'); c.html('#r-recv', truck(2, 1, false) + `<div class="row2" style="align-items:flex-start;font-size:13.5px;color:var(--i2)">${ai('users')}<span>${tx('No crew on this truck yet. Add the team from <b>Team &amp; plan</b>, then Take 5 starts the decant.')}</span></div>`);
        c.html('.p2-strip', `<div class="ds2"><b>${tx('Receiving')}</b><small>${tx('Take 5, then Start decant')}</small></div><span class="up2">${ai('chev', 'up')}</span>`); } },
  ],
});
