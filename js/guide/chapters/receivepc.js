// Chapter: Entering a truck from paper, on the store PC at 1920×1080.
// The dock phones do the receiving; the desk is for a truck that couldn't be
// done on them (the phones flat or offline, no phone on the dock): the dock
// lead writes each pallet on a dock sheet, and the desk enters the sheet.
// Back dock › Receiving as js/views/backdock/receiving.js draws it on a desk today
// (desktop(): the truck's card, the phase track from phase.js, Take 5 from
// plan.js, the truck's head card with its tally against the manifest, the
// dock grid with Land a pallet, the team, the decant plan, Landed today with
// a pallet's card; finishSheet() in phase.js; the late links of late.js; the
// receiving audit of audit.js). Three What ifs play on the same PC: a pallet
// on the wrong square, a pallet with no label, Finish receiving too soon.
// The day is the phone chapters' (receive.js, decant.js): Busselton 1241,
// Sunday 25 October 2026, Truck 1 landed at 05:40 with manifest 7040301 and
// its 12 consols, the team D4, D7 and D9. The dock sheet has A1 to A7 and
// B1 (A6 with a label off the manifest). The dock lead brings it in at 06:12:
// the desk starts the truck (landed 05:40, from the sheet), enters A1 to A7,
// then B1 step by step; a pallet is timed when the desk enters it. The
// layout is confirmed at 06:20 and Take 5 is at 06:25. The What ifs keep the
// phones' morning (A1 and A2 landed from a phone at 05:45 and 05:48). The
// forecasts are estClear() (shared/dockplan.js) at those times. The screen
// is longer than the PC's window, so the drawing scrolls (Y below).
// Every class here starts rc2- (styles/guide.css); the frame is js/guide/pc.js.
import { tx, txn, locale } from '../../i18n.js';
import { fmtDay } from '../../ui.js';
import { ai } from '../frames.js';
import { DAY, dShort, pc, view, vh, sub, gtabs, btn } from '../pc.js';

const S = (...p) => p.join(' ');
const E = (type, area, entity, payload, extra = {}) => ({ type, area, entity, payload, ...extra });
const TR = '2026-10-25-T1';
const B = bay => ({ truck: TR, bay });

// ── the day's data ───────────────────────────────────────────────────
// Manifest 7040301's consols (scripts/guide/seed.mjs): id, cartons, department.
const C = [['601930100', 2, '022'], ['601930107', 7, '038'], ['601930114', 9, '047'], ['601930121', 2, '024'], ['601930128', 7, '085'], ['601930135', 9, '054'],
  ['601930142', 2, '090'], ['601930149', 7, '006'], ['601930156', 9, '022'], ['601930163', 2, '038'], ['601930170', 7, '047'], ['601930177', 9, '024']];
const OFF = '601999917';   // a label on A6 that is not on the manifest
// Each pallet: type (c chep, l loscam, b bulk), its consols, when it landed, a label off the manifest.
const BAY = { A1: ['c', [0], '05:45'], A2: ['l', [1, 2], '05:48'], A3: ['c', [3, 4, 5], '06:02'], A4: ['c', [6], '06:05'], A5: ['c', [7, 8], '06:06'], A6: ['l', [9], '06:07', OFF], A7: ['b', [10], '06:08'], B1: ['c', [11], '06:09'] };
const TEAM = ['D4', 'D7', 'D9'];
const REFS = [...'ABCD'].flatMap(r => [1, 2, 3, 4, 5, 6, 7].map(k => r + k));
const mins = n => n ? Math.max(1, Math.round(n * 0.5)) : '';   // autoMins(): 0.5 min a carton
const sum = cs => cs.reduce((n, i) => n + C[i][1], 0);
// A landed pallet: { t, cons, n (cartons, null until counted), at, held (labels off the manifest), late (linked late) }.
const mk = (ref, o = {}) => { const [t, cons, at, off] = BAY[ref]; return { t, cons, n: sum(cons), at, held: off ? [off] : [], ...o }; };
const bays = (...refs) => Object.fromEntries(refs.map(r => [r, mk(r)]));
// When the desk entered each row of the dock sheet: pallet.land is timed by the store.
const ENTER = { A1: '06:13', A2: '06:13', A3: '06:14', A4: '06:14', A5: '06:15', A6: '06:15', A7: '06:16', B1: '06:18' };
const entered = (...refs) => Object.fromEntries(refs.map(r => [r, mk(r, { at: ENTER[r] })]));
// Where the content is scrolled to: the top, the dock, and the foot (the pallet's card under Landed today).
// The offsets are the drawing's own (measured at 1920×1080 in English): the dock card at the top of the window, the grid at the top, the page's foot.
const Y = { top: 0, dock: 897, grid: 985, foot: 1790, foot2: 1738, footA6: 1785, footA7: 1703 };
const day = (o = {}) => ({ bays: bays('A1', 'A2'), y: Y.top, ph: 1, conf: '', t5: 0, begun: false, card: '', form: '', pt: '', sel: '', moving: '', fresh: [], fc: '06:08', start: '', empty: false, nt: false, landed: '', sheet: null, ...o });
const mut = (s, f) => { const n = structuredClone(s); f(n); return n; };

// ── what the truck adds up to (liveAudit() in shared/reducers/backdock.js) ──
const all = s => Object.values(s.bays);
const ctn = s => all(s).reduce((n, p) => n + (p.n || 0), 0);
const matched = s => all(s).reduce((n, p) => n + p.cons.length, 0);
const extra = s => all(s).reduce((n, p) => n + p.held.length, 0);
const short = s => { const on = new Set(all(s).flatMap(p => p.cons)); return C.reduce((n, c, i) => n + (on.has(i) ? 0 : c[1]), 0); };
const bare = s => Object.keys(s.bays).filter(r => !s.bays[r].cons.length && !s.bays[r].held.length);
const nocount = s => all(s).filter(p => p.n == null).length;
const PHASE = () => [tx('truck phase::Planned'), tx('truck phase::Receiving'), tx('truck phase::Received'), tx('truck phase::Decanting'), tx('truck phase::Cleared'), tx('truck phase::Closed')];
const TYPES = () => [['c', tx('Chep tubs'), '#2953D6'], ['l', tx('Load pallets'), '#B3261E'], ['b', tx('Bulk'), '#69787F']];
const ONE = () => ({ c: tx('Chep tubs'), l: tx('Load pallet'), b: tx('Bulk') });
const T5 = () => [[tx('Team briefed'), tx('Everyone knows the plan, their role and their start time.')], [tx('Team safety'), tx('Fit for work, PPE on, anything to flag is raised.')],
  [tx('Equipment safe'), tx('Box cutters, cages and work tables checked and ready.')], [tx('Area clear'), tx('Dock clear of spills, obstructions and trip hazards.')], [tx('Goal agreed'), tx('Target finish set and shared with the team.')]];
const PLAY = '▶︎';

// ── the screen (desktop() in js/views/backdock/receiving.js) ────────────
// The truck on the board (truckCard()).
function trk(s) {
  const n = all(s).length, c = ctn(s);
  return `<div class="rc2-strip"><div class="rc2-trk"><div class="h"><b>${tx('Truck {n}', { n: 1 })}</b><span class="rc2-tst live">${tx('Live')}</span><span class="r">${tx('landed {time}', { time: '05:40' })}</span></div><div class="c3">` +
    `<div><small>${ai('file')}${tx('Manifest')}</small><b>7040301</b><span>${txn(12, '{n} consol', '{n} consols')} · ${tx('{n}c', { n: 72 })}</span></div>` +
    `<div><small>${ai('truck')}${tx('Truck')}</small><b>${txn(n, '{n} pallet', '{n} pallets')}</b><span>${tx('{n} to go', { n })}</span></div>` +
    `<div><small>${ai('users')}${tx('Decant')}</small><b>0 / ${c} · 0%</b><div class="tm">${TEAM.map(p => `<span><i>${p}</i></span>`).join('')}</div></div></div></div></div>`;
}
// The six phases and the next step (phaseBar() in js/views/backdock/phase.js).
function phb(s) {
  const n = all(s).length, line = s.ph === 0 ? tx('Not landed yet') : s.ph === 1 ? `${txn(n, '{n} pallet landed', '{n} pallets landed')} · ${tx('{m} of {n} consols matched', { m: matched(s), n: 12 })}`
    : s.ph === 2 ? tx('Layout confirmed {time} · Take 5, then start', { time: s.conf }) : tx('{done} of {n} pallets done · {c} of {total} ctn', { done: 0, n, c: 0, total: ctn(s) });
  const go = s.ph === 0 ? tx('New truck') : s.ph === 1 ? tx('Finish receiving') : s.ph === 2 ? tx('Start decant') : '';
  return `<div class="rc2-phb"><ol>${PHASE().map((p, i) => `<li class="${i < s.ph ? 'dn' : i === s.ph ? 'on' : ''}"><i></i><span>${p}</span></li>`).join('')}</ol>` +
    `<div class="n"><span class="t"><b>${s.ph ? `${tx('Truck {n}', { n: 1 })} · ` : ''}${PHASE()[s.ph]}</b><small>${line}</small></span>${go ? `<span class="pc2-btn sm pri rc2-go">${go}${ai('arrow')}</span>` : ''}</div></div>`;
}
// Finish receiving (finishSheet() in phase.js): the layout against the manifest.
function fin(s) {
  const n = all(s).length, c = ctn(s), m = matched(s), miss = 12 - m, x = extra(s), nc = nocount(s);
  const row = (cls, v, l) => `<div class="${cls}"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="rc2-card rc2-fs"><div class="rc2-ch"><h3>${tx('Finish receiving · Truck {n}', { n: 1 })}</h3><span class="rc2-ib">${ai('x')}</span></div><p class="rc2-lbl">${tx('Confirm the layout once everything is off the truck. Pallets can still be changed afterwards.')}</p>` +
    `<div class="rc2-fsg">${row('', n, txn(n, 'pallet on the dock', 'pallets on the dock'))}${row('', c, txn(c, 'carton counted', 'cartons counted'))}${row(m === 12 ? 'ok' : '', `${m}/12`, tx('consols matched'))}` +
    `${row(miss ? 'warn' : 'ok', miss, tx('on the manifest, not landed'))}${row(x ? 'bad' : 'ok', x, txn(x, 'label not on the manifest', 'labels not on the manifest'))}${nc ? row('warn', nc, txn(nc, 'pallet with no carton count', 'pallets with no carton count')) : ''}</div>` +
    (miss || x || nc ? `<div class="rc2-warn">${ai('alert')}${tx('Something is off. Check it now, or confirm and sort it out in the audit.')}</div>` : '') +
    `<div class="rc2-acts"><span class="pc2-btn pri rc2-conf">${ai('check')}${tx('Confirm layout')}</span><span class="pc2-btn rc2-faud">${ai('file')}${tx('Receiving audit')}</span><span class="pc2-btn">${tx('Back')}</span></div></div>`;
}
// Pallets with no consol matched (late.js unlinked()), and the links the desk finds.
const llWarn = s => `<div class="rc2-card rc2-llw"><div class="rc2-ch"><h3>${ai('alert')}${txn(bare(s).length, '{n} pallet not linked to manifest {no}', '{n} pallets not linked to manifest {no}', { no: '7040301' })}</h3><span class="pc2-btn sm pri rc2-llo">${tx('Link landed pallets →')}</span></div>` +
  `<p class="rc2-lbl">${tx("Landed before the manifest was attached, or without a readable label. Link them so the reconciliation and the clear forecast use the manifest's cartons.")}</p></div>`;
const llSheet = () => `<div class="rc2-card rc2-ll"><div class="rc2-ch"><h3>${tx('Link manifest to landed pallets')}</h3><span class="go">${tx('Close')}</span></div>` +
  `<p class="rc2-lbl">${txn(1, '{n} pallet landed without a match · {c} consols on manifest {no}. Links are recorded as linked late, with how each match was made.', '{n} pallets landed without a match · {c} consols on manifest {no}. Links are recorded as linked late, with how each match was made.', { c: 12, no: '7040301' })}</p>` +
  `<div class="rc2-pt3">${tx('Matched automatically')} · ${txn(1, '{n} pallet', '{n} pallets')}</div><div class="rc2-li"><span class="loc">A7</span><span class="nm">→ 601930170 <small>(${tx('carton count')})</small></span></div>` +
  `<div class="rc2-acts sm"><span class="pc2-btn sm pri rc2-apply">${tx('Apply links')}</span><span class="pc2-btn sm">${tx('Cancel')}</span></div></div>`;
// Take 5 (take5Card() in js/views/backdock/plan.js): until the decant has begun.
function take5(s) {
  const n = s.t5, ok = n === 5;
  return `<div class="rc2-card rc2-t5"><div class="rc2-ch"><h3>${tx('Ready to start · Take 5')}</h3><span class="dim">${txn(3, '{n} decanter', '{n} decanters')}</span></div><div class="rc2-t5team">${TEAM.map(p => `<b>${p}</b>`).join('')}</div>` +
    `<div class="rc2-t5l">${T5().map(([b, t], i) => `<span class="rc2-t5i${i < n ? ' on' : ''}" data-t5="${i}"><i>${i < n ? ai('check') : ''}</i><span><b>${b}</b><small>${t}</small></span></span>`).join('')}</div>` +
    `<div class="rc2-t5a"><span class="pc2-btn pri rc2-sd${ok ? '' : ' off'}">${PLAY} ${tx('Start decant')}</span><span class="pc2-btn${ok ? '' : ' off'}">${ai('users')}${tx('Launch huddle')}</span>` +
    `<span class="dim">${ok ? tx('All five checked. Good to go.') : tx('{n} of 5 checked. Tick all five to start; nothing can be started until then. A huddle runs the safety talk and pauses the clock while you brief.', { n })}</span></div></div>`;
}
// The truck's head card: its line, the chips, the cartons and the tally (tallyRow()).
function head(s) {
  const n = all(s).length, m = matched(s), miss = 12 - m, x = extra(s), sh = short(s), un = bare(s).length, nc = nocount(s);
  const chip = (l, v, cls = '') => `<span class="rc2-chip${cls}"><span class="l">${l}</span><span class="v">${v}</span></span>`;
  const tal = (cls, v, l) => `<span class="rc2-tal${cls ? ' ' + cls : ''}"><b>${v}</b>${l}</span>`;
  return `<div class="rc2-card rc2-head"><div class="rc2-hd"><span class="rc2-tile">${ai('truck')}</span><div class="rc2-tt"><b>${tx('Truck {n}', { n: 1 })}</b><span class="rc2-tst live">${tx('Live')}</span>` +
    `<small>${tx('landed {time}', { time: '05:40' })}${n ? ' · ' + tx('first pallet {time}', { time: all(s).map(p => p.at).sort()[0] }) : ''} · ${txn(n, '{n} pallet', '{n} pallets')} · ${tx('{n} decanting', { n: 0 })}</small></div>${btn('print', tx('Audit'), 'sm rc2-aud')}` +
    `<div class="rc2-chips">${chip(tx('Manifest'), tx('{n}<small> cons · {c}c</small>', { n: 12, c: 72 }))}${chip(tx('Decant start'), s.start || `05:40<small> ${tx('landed')}</small>`)}${chip(tx('Goal'), '—')}${chip(tx('Forecast'), s.fc)}` +
    (s.conf ? chip(tx('Receiving'), `${ai('check')}${tx('Confirmed {time}', { time: s.conf })}`, ' ok rc2-rcv') : chip(tx('Receiving'), tx('Finish'), ' rc2-rcv')) + '</div></div>' +
    `<div class="rc2-prog"><b>0</b><span class="of">${tx('/ {n} cartons', { n: ctn(s) })}</span><span class="pct">0%</span></div><div class="rc2-bar"><i></i></div>` +
    `<div class="rc2-tally">${tal(m === 12 ? 'ok' : '', `${m}/12`, tx('consols matched'))}${tal(miss ? 'warn' : 'ok', miss, tx('not landed'))}${tal(x ? 'bad' : '', x, tx('off-manifest'))}${tal(sh ? 'warn' : '', sh, tx('ctn short'))}${un ? tal('bad', un, tx('no label')) : ''}</div>` +
    (nc ? `<div class="rc2-msg">${ai('alert')}<span>${txn(nc, '{n} pallet has no carton count: it is planned at 60 minutes until it is counted.', '{n} pallets have no carton count: they are planned at 60 minutes until they are counted.')}</span></div>` : '') + '</div>';
}
// The dock: Land a pallet (or the move under way), the grid (dockGrid()), the hold-up row.
function dock(s) {
  const lg = `<span class="rc2-lg">${TYPES().map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}<span><i class="dn"></i>${tx('Done')}</span><span><i class="ac"></i>${tx('Decanting')}</span><span><i class="co"></i>${tx('Carryover')}</span><span><i class="ov"></i>${tx('Over its estimate')}</span></span>`;
  const form = s.moving ? `<div class="rc2-mvb">${tx('Moving {ref}: tap an empty square.', { ref: s.moving })}<span class="pc2-btn sm">${tx('Cancel')}</span></div>`
    : `<div class="rc2-land"><b>${tx('Land a pallet')}</b><span class="rc2-in mono rc2-bay${s.form ? '' : ' ph'}">${s.form || tx('bay field::Bay')}</span><span class="rc2-pts${s.pt ? '' : ' ask'}">${TYPES().map(([k, l, c]) => `<span class="rc2-pt${s.pt === k ? ' on' : ''}" data-pt="${k}"><i style="background:${c}"></i>${l}</span>`).join('')}</span>` +
      `<span class="rc2-in mono ph">${tx('Cartons')}</span><span class="pc2-btn sm pri rc2-lgo${s.pt ? '' : ' off'}">${ai('plus')}${tx('Land')}</span></div>`;
  const sq = ref => {
    const p = s.bays[ref];
    if (!p) return `<span class="rc2-sq e${s.moving ? ' tg' : ''}" data-ref="${ref}"><span class="ref">${ref}</span><span class="pl">${s.moving ? '⇲' : '+'}</span></span>`;
    const fl = p.held.length ? ['off', tx('OFF')] : p.n == null ? ['ctn', tx('+CTN')] : null;
    return `<span class="rc2-sq t-${p.t}${s.fresh.includes(ref) ? ' fresh' : ''}" data-ref="${ref}"><span class="ref">${ref}</span><span class="ct">${p.n ?? '–'}</span>${fl ? `<span class="fl ${fl[0]}">${fl[1]}</span>` : ''}</span>`;
  };
  return `<div class="rc2-card rc2-dock"><div class="rc2-kh">${ai('box')}<h3>${tx('The dock')}</h3>${lg}</div>${form}<div class="rc2-grid">${REFS.map(sq).join('')}</div>` +
    `<div class="rc2-hr">${ai('clock')}<span>${s.begun ? tx('Decant running') : tx('Take 5, then Start decant')}</span>${btn('alert', tx('Hold-up'), 'sm')}${btn('users', tx('Book huddle'), 'sm')}</div></div>`;
}
// The team on the truck (teamCard()) and the decant plan (planCard() in plan.js).
const team = () => `<div class="rc2-card"><div class="rc2-ch"><h3>${tx('Decanting now')}</h3><span class="dim">${tx('{n} on the dock', { n: 3 })}</span></div>` +
  `<div class="rc2-team">${TEAM.map(p => `<div class="rc2-tc"><b>${p}</b><span>${tx('between pallets')}</span><span class="rc2-sel">${tx('Cutter')}${ai('chev', 'dn')}</span><span class="pc2-btn sm">${tx('Break')}</span><span class="x">${ai('x')}</span></div>`).join('')}</div>` +
  `<div class="rc2-tadd"><span class="rc2-in mono ph">${tx('Add a D-number, e.g. D4')}</span>${btn('plus', tx('Add'), 'sm')}</div><p class="rc2-lbl">${tx('D-numbers only: no names are kept on the dock.')}</p></div>`;
const plan = s => `<div class="rc2-card rc2-pl"><div class="rc2-ch"><h3>${tx('Decant plan')}</h3><span class="dim">${txn(all(s).length, '{n} pallet not queued', '{n} pallets not queued')}</span></div>` +
  `<div class="rc2-plt"><span class="seg"><b class="on">${tx('Standard rate')}</b><b>${tx('Personal rate')}</b></span>${btn('refresh', tx('Auto-balance'), 'sm')}${btn('', tx('Tubs first'), 'sm')}${btn('', tx('Clear plan'), 'sm')}</div>` +
  TEAM.map(p => `<div class="rc2-lane"><div class="w"><b>${p}</b><span class="dim">${tx('no rate yet')}</span><label>${tx('start')}<span class="rc2-in">--:--${ai('clock')}</span></label><label>${tx('finish')}<span class="rc2-in">--:--${ai('clock')}</span></label></div><span>${tx('Nothing planned')}</span><span>${tx('free now')}</span></div>`).join('') +
  `<p class="rc2-lbl">${tx('Lanes run from each person’s start time. Auto-balance deals the waiting pallets to whoever frees first and keeps within finish times where it can.')}</p></div>`;
// One pallet's card under Landed today (palletPanel(t, p, true)).
function panel(s, ref) {
  const p = s.bays[ref], late = p.late ? ` <span class="rc2-stat">${tx('linked late · {basis}', { basis: tx('cartons') })}</span>` : '';
  const rows = p.cons.map(i => `<div class="rc2-vr ok"><span>✓</span><b class="mono">${C[i][0]}</b><span>${tx('{n} ctn', { n: C[i][1] })} · ${C[i][2]}</span><span class="x">${ai('x')}</span></div>`).join('') +
    p.held.map(id => `<div class="rc2-vr warn"><span>⚠</span><b class="mono">${id}</b><span>${tx('not on this manifest')}</span><span class="vb"><span class="pc2-btn sm">${tx('Add &amp; flag')}</span><span class="pc2-btn sm">${tx('Ignore')}</span></span></div>`).join('');
  return `<div class="rc2-pal" data-ref="${ref}"><div class="h"><b>${tx('Pallet {ref}', { ref })}</b><span class="rc2-tst st">${tx('landed')}</span>${late}<span class="rc2-ib">${ai('x')}</span></div><div class="b">` +
    `<div class="rc2-pts">${TYPES().map(([k, l, c]) => `<span class="rc2-pt${p.t === k ? ' on' : ''}"><i style="background:${c}"></i>${l}</span>`).join('')}</div>` +
    `<div class="rc2-flds"><label>${tx('Cartons')}<span class="rc2-in mono">${p.n ?? ''}</span></label><label>${tx('Est. mins')}<span class="rc2-in mono a">${mins(p.n)}</span></label><label>${tx('Note')}<span class="rc2-in ph">${tx('optional')}</span></label></div>` +
    `<div class="rc2-scan"><span class="rc2-in mono ph rc2-ps"><span class="t">${tx('Scan or type a pallet label')}</span></span><span class="rc2-cam">${ai('camera')}</span><span class="pc2-btn sm rc2-add">${ai('barcode')}${tx('Add')}</span></div>` +
    (rows ? `<div class="rc2-vf">${rows}</div>` : '') + (p.cons.length ? `<div class="rc2-cont"><i>▶\uFE0E</i> ${tx('Contents')} · ${txn(p.cons.length, '{n} consol', '{n} consols')}</div>` : '') +
    `<div class="rc2-dec"><small>${tx('Decant')}</small><span class="rc2-sel w">D4${ai('chev', 'dn')}</span><span class="q">${tx('Queue for')}</span><span class="rc2-sel">${tx('— not queued —')}${ai('chev', 'dn')}</span><span class="pc2-btn sm pri">${PLAY} ${tx('Start')}</span></div>` +
    `<div class="rc2-pa">${btn('check', tx('Update'), 'sm')}<span class="pc2-btn sm rc2-mv">⇲ ${tx('Move')}</span><span class="pc2-btn sm">🚫 ${tx('Not in this session')}</span>${btn('trash', tx('Remove'), 'sm')}</div></div></div>`;
}
// Landed today, newest last, with the open pallet's card under it.
function landed(s) {
  const refs = Object.keys(s.bays).sort((a, b) => s.bays[a].at.localeCompare(s.bays[b].at));
  return `<div class="rc2-card rc2-ld"><div class="rc2-ch"><h3>${tx('Landed today')}</h3><span class="dim">${txn(refs.length, '{n} pallet · newest last', '{n} pallets · newest last')}</span></div>` +
    `<div class="rc2-lds">${refs.map(r => { const p = s.bays[r]; return `<div class="rc2-li" data-ref="${r}"><span class="loc">${r}</span><span class="nm">${ONE()[p.t]} · ${tx('{n} cartons', { n: p.n ?? '–' })}${p.late ? ` <span class="rc2-stat">${tx('linked late · {basis}', { basis: tx('cartons') })}</span>` : ''}</span><span class="st">${tx('Waiting')}</span><span class="rt">${p.at}</span></div>`; }).join('')}</div>` +
    (s.sel ? panel(s, s.sel) : '') + '</div>';
}
// No truck on the board yet: today's decants (decantBoard() in plan.js), the
// empty card, and the New truck card (newTruckSheet() in phase.js).
const board = () => `<div class="rc2-card rc2-db"><div class="rc2-ch"><h3>${tx('Today’s decants')}</h3><span class="dim">1</span></div><div class="rc2-dbc"><b>${tx('Truck {n}', { n: 1 })}</b><span class="rc2-tst">${tx('Planned')}</span>` +
  `<small>${tx('no start time')} · ${tx('waiting on Receiving')}</small><small>${txn(12, '{n} consol', '{n} consols')} · 7040301 · ${tx('{n} on the team', { n: 3 })}</small><em>${tx('Tap when it lands →')}</em></div></div>`;
const emptyCard = () => `<div class="rc2-card rc2-empty">${ai('truck')}<b>${tx('No truck on the dock')}</b><p class="rc2-lbl">${tx('Start receiving the next truck here, or let a dock phone land it. The board wakes either way.')}</p><span class="pc2-btn pri rc2-start">${ai('plus')}${tx('Start receiving a truck')}</span></div>`;
const ntCard = s => `<div class="rc2-card rc2-nt"><div class="rc2-ch"><h3>${tx('New truck')}</h3><span class="rc2-ib">${ai('x')}</span></div><p class="rc2-lbl">${tx('It starts in its planned slot: the manifest, team and start time come with it.')}</p>` +
  `<div class="rc2-ntl"><span class="rc2-ntc on"><b>${tx('Truck {n}', { n: 1 })}</b><span class="rc2-ok">${tx('selected')}</span><small class="ok">${ai('file')}${tx('Manifest {no} · {c} ctn · {n} consols', { no: '7040301', c: 72, n: 12 })}</small><small>${tx('no start time')} · ${txn(3, '{n} decanter', '{n} decanters')}</small></span>` +
  `<span class="rc2-ntc"><b>${ai('plus')}${tx('Unplanned truck')}</b><small>${tx('not in the week plan · becomes Truck {n}', { n: 2 })}</small></span></div>` +
  `<div class="rc2-ntt"><label>${tx('Landed at')}<span class="rc2-in mono rc2-landed"><span class="t">${s.landed}</span>${ai('clock')}</span></label><label>${tx('Decant start')}<span class="rc2-in mono ph">--:--${ai('clock')}</span></label></div>` +
  `<p class="rc2-lbl">${tx('Landed is for the record. The decant start is when pace, goal and timeline are measured from; blank starts it at Take 5.')}</p>` +
  `<div class="rc2-acts"><span class="pc2-btn pri rc2-ntgo">${ai('truck')}${tx('Create & go live · Truck {n}', { n: 1 })}</span><span class="pc2-btn">${tx('Cancel')}</span></div></div>`;
// The dock sheet the dock lead filled in, on the desk beside the screen: each
// pallet's bay, type, labels and cartons, ticked off as the desk enters it.
// With a pallet's card open it moves up, clear of the card's label row.
const SHEET = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1'];
const HAND = { c: 'Chep', l: 'Load', b: 'Bulk' };
function paper(s) {
  if (s.sheet == null) return '';
  const row = (ref, i) => { const [t, cons, , off] = BAY[ref], ids = [...cons.map(k => C[k][0]), ...(off ? [OFF] : [])];
    return `<tr class="${i < s.sheet ? 'dn' : i === s.sheet ? 'on' : ''}"><td>${i < s.sheet ? '✓ ' : ''}${ref}</td><td>${HAND[t]}</td><td>${ids.join(' ')}</td><td>${sum(cons)}</td></tr>`; };
  return `<div class="rc2-paper${s.sel ? ' up' : ''}" aria-hidden="true"><div class="hd"><b>${tx('Dock sheet')}</b><span>T1 · 25/10 · 05:40 · 7040301</span></div>` +
    `<table><thead><tr><th>${tx('dock bay::Bay')}</th><th>${tx('Type')}</th><th>${tx('Labels')}</th><th>${tx('Ctn')}</th></tr></thead><tbody>${SHEET.map(row).join('')}</tbody></table></div>`;
}
const TABS = () => [['receiving', 'm-receiving', tx('Truck')], ['teamboard', 'users', tx('Team Board')]];
function screen(s) {
  if (s.empty) return `<div class="rc2-sc">${gtabs(TABS(), 'receiving')}` + vh('m-receiving', tx('Receiving'), sub(dShort(DAY), txn(0, '{n} truck on the board', '{n} trucks on the board'), tx('dock clear')), btn('plus', tx('New truck'), 'pri rc2-new')) +
    phb(s) + (s.nt ? ntCard(s) : '') + board() + emptyCard() + `</div>` + paper(s);
  const acts = btn('file', tx('Manifest {no}', { no: '7040301' })) + btn('clock', tx('Set goal')) + btn('check', tx('Finalise')) + btn('plus', tx('New truck'), 'pri');
  return `<div class="rc2-sc" style="transform:translateY(-${s.y}px)">${gtabs(TABS(), 'receiving')}` +
    vh('m-receiving', tx('Receiving'), sub(dShort(DAY), txn(1, '{n} truck on the board', '{n} trucks on the board'), tx('T{n} live', { n: 1 })), acts) +
    trk(s) + phb(s) + (s.card === 'fin' ? fin(s) : '') + (s.card === 'link' ? llSheet() : bare(s).length ? llWarn(s) : '') +
    `<div class="rc2-stack">${s.begun ? '' : take5(s)}${head(s)}${dock(s)}${team()}${plan(s)}${landed(s)}</div></div>` + paper(s);
}
// The receiving audit as it prints (printAudit() in js/views/backdock/audit.js), on the browser's print preview.
function audit(s) {
  const long = fmtDay(DAY, { year: true }), when = new Date(2026, 9, 25, 6, 1).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
  const facts = [[tx('Truck'), `T1 · ${long}`], [tx('Status'), tx('Live')], [tx('Landed'), '05:40'], [tx('Decant start'), '05:40'], [tx('Last pallet done'), '—'], [tx('Clear time'), tx('{m}m', { m: 21 })],
    [tx('Cartons decanted'), tx('{c} on {p} of {n} pallets', { c: 0, p: 0, n: 2 })], [tx('Team rate'), '—'], [tx('Manifest'), `7040301 · ${tx('despatch {d}', { d: '24/10/2026' })}`], [tx('Handed over'), tx('no')]];
  const on = new Set(all(s).flatMap(p => p.cons)), miss = C.filter((c, i) => !on.has(i));
  const fx = list => `<div class="rc2-fx">${list.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  const th = h => `<thead><tr>${h.map(([t, c = '']) => `<th class="${c}">${t}</th>`).join('')}</tr></thead>`;
  const tk = '<td class="rc2-tk"><i></i></td>';
  const pal = Object.entries(s.bays).map(([r, p]) => `<tr><td><b>${r}</b></td><td>${TYPES().find(x => x[0] === p.t)[1]}</td><td class="rc2-n">${p.n}</td><td class="rc2-mo">${p.cons.map(i => C[i][0]).join(' ')}</td><td>—</td><td>—</td><td>${tx('landed')}</td><td class="rc2-n">—</td>${tk}</tr>`).join('');
  return `<div class="rc2-pp"><div class="rc2-pg"><div class="rc2-ph"><div><h1>${tx('Receiving audit · Truck {n}', { n: 1 })}</h1><div>${long} · ${tx('live, as at {time}', { time: '06:01' })}</div></div><div>${tx('Printed {when}', { when })}</div></div>` +
    fx(facts) + `<h2>${tx('Pallets')}</h2><table>${th([[tx('dock bay::Bay')], [tx('Type')], [tx('Ctn'), 'rc2-n'], [tx('Consols')], [tx('Crew')], [tx('Started')], [tx('Status')], [tx('Worked / est'), 'rc2-n'], ['✓', 'rc2-tk']])}<tbody>${pal}</tbody></table>` +
    `<h2>${tx('Manifest reconciliation')}</h2>${fx([[tx('Consols on the manifest'), 12], [tx('Matched on the dock'), on.size], [tx('Missing'), miss.length], [tx('Off-manifest, held for review'), 0]])}` +
    `<table>${th([[tx('Missing consol')], [tx('Cartons'), 'rc2-n'], [tx('Dept')], [tx('Found?'), 'rc2-tk']])}<tbody>${miss.map(([id, n, d]) => `<tr><td class="rc2-mo">${id}</td><td class="rc2-n">${n}</td><td>${d}</td>${tk}</tr>`).join('')}</tbody></table>` +
    `<div class="rc2-sg">${[tx('Checked by'), tx('Date'), tx('Time'), tx('Signature')].map(t => `<span>${t}</span>`).join('')}</div></div></div>`;
}
const desk = s => pc(view('v-rc', screen(s), true), { on: 'receiving' });
const paint = (c, s) => c.html('#v-rc', screen(s));
// Scrolls the content (the app's #content) to y, and waits for it to get there.
const scroll = async (c, y) => { c.style('#v-rc .rc2-sc', 'transform', `translateY(-${y}px)`); await c.wait(650); };
// The toast at the foot of the content, with Open when the app offers it; the pointer leaves when what it tapped has gone.
const toast = (c, t, open = false) => { c.html('.pc2 > .dv-toast', `<span>${t}</span>${open ? `<u>${tx('Open')}</u>` : ''}`); c.cls('.pc2 > .dv-toast', 'rc2-t', true); c.show('.pc2 > .dv-toast'); };
const off = c => c.cls('.fg', 'show', false);
const glow = (c, sel, on) => c.cls(sel, 'glow', on);

// ── the chapter's frames ─────────────────────────────────────────────
// The phones' morning, for the What ifs: A1 and A2 landed from a phone.
const S0 = day();
// The desk's morning: no truck yet, the dock sheet beside the keyboard.
const P0 = day({ bays: {}, ph: 0, empty: true, sheet: 0 });
const P1 = mut(P0, s => { s.nt = true; s.landed = '06:12'; });   // ntDefaults(): Landed at is now
const P2 = mut(P1, s => { s.landed = '05:40'; });
const P3 = day({ bays: {}, sheet: 0, fc: '06:12' });
const ROWS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
const P4 = mut(P3, s => { s.y = Y.dock; });
const upTo = k => mut(P4, s => { s.bays = entered(...ROWS.slice(0, k)); s.fresh = [ROWS[k - 1]]; s.sheet = k; s.fc = '06:30'; });
const S3 = mut(upTo(7), s => { s.fresh = []; });
const S4 = mut(S3, s => { s.form = 'B1'; });
const S4b = mut(S4, s => { s.pt = 'c'; });
const S5 = mut(S4b, s => { s.bays.B1 = mk('B1', { cons: [], n: null, at: ENTER.B1 }); s.fresh = ['B1']; s.fc = '07:19'; s.form = ''; s.pt = ''; });   // the land row starts empty again
const S6 = mut(S5, s => { s.fresh = []; s.form = ''; s.pt = ''; s.sel = 'B1'; s.y = Y.foot; });
const S7 = mut(S6, s => { s.bays.B1 = mk('B1', { at: ENTER.B1 }); s.fc = '06:33'; s.y = Y.foot2; s.sheet = 8; });
const S8 = mut(S7, s => { s.sel = ''; s.y = Y.top; s.card = 'fin'; s.fc = '06:35'; });
const S9 = mut(S8, s => { s.card = ''; s.ph = 2; s.conf = '06:20'; s.sheet = null; });
const S10 = mut(S9, s => { s.t5 = 5; s.fc = '06:38'; });
const S11 = mut(S10, s => { s.begun = true; s.ph = 3; s.start = '06:25'; });
const lab = c => c.cls('#v-rc .rc2-ps', 'ph', false);

export const receivepc = {
  id: 'receive', grp: 'dock', icon: 'truck', title: tx('Entering a truck from paper'), device: 'pc', where: tx('PC · Back dock › Receiving'), for: ['dock', 'manager'],
  intro: S(tx('The dock phones receive a truck. The desk is for one they couldn’t: the phones flat, offline or not on the dock.'), tx('The dock lead writes each pallet on a dock sheet, and the desk enters it: the truck, its pallets and their labels, then Finish receiving and Take 5.')),
  html: () => desk(P0),
  steps: [
    { cap: tx('The phones were down this morning: Truck 1 came off on a dock sheet.'), read: S(tx('Each pallet is a row: its bay, its type, the labels on it and its cartons.'), tx('Back dock › Receiving has no truck yet: the desk enters the sheet from the top.')),
      dev: 'With no truck on the dock, <b>desktop()</b> in js/views/backdock/receiving.js draws <b>phaseBar(null)</b>, <b>decantBoard()</b> from js/views/backdock/plan.js and the empty card. Looking sends nothing.', ev: [],
      run: async c => { await c.tap('#v-rc .rc2-paper'); glow(c, '#v-rc .rc2-paper', true); await c.wait(900); } },
    { cap: tx('New truck: Truck 1 is picked, with its manifest from the week plan.'), read: S(tx('Landed at fills in with the time now: type the one on the sheet, 05:40.'), tx('Leave the decant start: blank starts it at Take 5.')),
      dev: '<b>newTruckSheet()</b> in js/views/backdock/phase.js; <b>ntDefaults()</b> picks the first planned slot and fills Landed at with the time now. Nothing is sent yet.', ev: [],
      run: async c => { glow(c, '#v-rc .rc2-paper', false); await c.tap('#v-rc .rc2-go'); paint(c, P1); off(c); await c.wait(300); await c.tap('#v-rc .rc2-landed'); await c.type('#v-rc .rc2-landed .t', '05:40'); paint(c, P2); } },
    { cap: tx('Create & go live: Truck 1 is receiving, landed at 05:40.'), read: S(tx('Manifest 7040301 comes with it from the plan: 12 consols, 72 cartons.'), tx('Each pallet is timed as the desk enters it; the truck keeps 05:40.')),
      dev: '<b>truck.create</b> with the landed time and its slot, then <b>truck.setLive</b>; <b>attachPlanned()</b> attaches the planned manifest.',
      ev: [E('truck.create', 'backdock', { truck: TR }, { landedAt: '2026-10-25T05:40:00+08:00', slot: 1 }), E('truck.setLive', 'backdock', { truck: TR }, {}), E('manifest.attach', 'backdock', { truck: TR }, { manNo: '7040301', consols: '[12 consols]' })],
      run: async c => { await c.tap('#v-rc .rc2-ntgo'); paint(c, P3); off(c); toast(c, tx('Truck {n} is receiving', { n: 1 })); } },
    { cap: tx('Scroll to the dock: a square for each bay, in the colour of its pallet type.'), read: S(tx('Blue is Chep tubs, red Load pallets and grey Bulk; the number is the cartons.'), tx('Click an empty square to land a pallet there.')),
      dev: '<b>dockGrid()</b> draws the 4 × 7 dock (<b>grid()</b> in js/views/backdock/common.js).', ev: [],
      run: async c => { off(c); await scroll(c, Y.dock); paint(c, P4); } },
    { cap: tx('Enter the sheet row by row: A1 to A7 go on the dock.'), read: S(tx('A row is its square, its type and Land, then its labels on its card; tick it on the sheet.'), tx('A6 says OFF: one of its labels is not on the manifest.')),
      dev: 'Each row sends <b>pallet.land</b>, then a <b>pallet.scan</b> for each label; a label off the manifest is held on the pallet with <b>pallet.update</b>. Every phone and dock screen shows them at once.',
      ev: [E('pallet.land', 'backdock', B('A1'), { ptype: 'chep', cartons: null, note: '' }, { n: 7 }), E('pallet.scan', 'backdock', B('A1'), { code: C[0][0] }, { n: 11 }), E('pallet.update', 'backdock', B('A6'), { held: [OFF] })],
      run: async c => { for (let k = 1; k <= ROWS.length; k++) { await c.tap(`#v-rc .rc2-sq[data-ref="${ROWS[k - 1]}"]`); paint(c, upTo(k)); off(c); await c.wait(250); } } },
    { cap: tx('B1, the last row, in full: click its square.'), read: S(tx('An empty square puts its bay into Land a pallet.'), tx('Nothing is sent yet.')),
      dev: '<b>onAct()</b>, cell: on a PC an empty square sets the land row’s bay.', ev: [],
      run: async c => { paint(c, S3); await c.tap('#v-rc .rc2-sq[data-ref="B1"]'); paint(c, S4); } },
    { cap: tx('Pick its type from the sheet and Land: B1 is on the dock for everyone.'), read: S(tx('Leave the cartons: its labels fill them in.'), tx('Until they do, the square says +CTN and the plan allows it 60 minutes.')),
      dev: 'Land sends <b>pallet.land</b> with no carton count; the labels go on the pallet’s card once it has landed.', ev: [E('pallet.land', 'backdock', B('B1'), { ptype: 'chep', cartons: null, note: '' })],
      run: async c => { await c.tap('#v-rc .rc2-pt[data-pt="c"]'); paint(c, S4b); await c.wait(300); await c.tap('#v-rc .rc2-lgo'); paint(c, S5); off(c); toast(c, tx('Pallet landed at {ref}', { ref: 'B1' }), true); } },
    { cap: tx('Click B1: its card opens under Landed today.'), read: S(tx('The card has the type, cartons, a note and the labels, then the decant.'), tx('Move and Remove are at its foot.')),
      dev: '<b>palletPanel()</b> with desk true: the label row is a field for a scanner or the keyboard.', ev: [],
      run: async c => { await c.tap('#v-rc .rc2-sq[data-ref="B1"]'); paint(c, mut(S6, s => { s.y = Y.dock; })); await scroll(c, Y.foot); off(c); paint(c, S6); } },
    { cap: tx('Type its label from the sheet and Add: the consol matches and fills in the cartons.'), read: S(tx('601930177 is on manifest 7040301: 9 cartons for department 024.'), tx('A label that is not on the manifest is held here, to flag or ignore.')),
      dev: '<b>pallet.scan</b> matches the label to the manifest’s consol and adds its cartons (shared/reducers/backdock.js); <b>not_on_manifest</b> holds a stray one.', ev: [E('pallet.scan', 'backdock', B('B1'), { code: C[11][0] })],
      run: async c => { await c.tap('#v-rc .rc2-ps'); lab(c); await c.type('#v-rc .rc2-ps .t', C[11][0]); await c.tap('#v-rc .rc2-add'); paint(c, mut(S7, s => { s.y = Y.foot; })); off(c); await scroll(c, Y.foot2); paint(c, S7); toast(c, tx('{id} on {ref}', { id: C[11][0], ref: 'B1' })); } },
    { cap: tx('Back at the top, the whole sheet is in: Finish receiving.'), read: S(tx('12 of 12 consols matched, nothing short, one label off the manifest on A6.'), tx('Finish receiving lays it all out before the layout is confirmed.')),
      dev: '<b>finishSheet()</b> in js/views/backdock/phase.js; opening it sends nothing.', ev: [],
      run: async c => { off(c); await scroll(c, Y.top); paint(c, mut(S7, s => { s.sel = ''; s.y = Y.top; s.fc = '06:35'; })); await c.wait(300); await c.tap('#v-rc .rc2-go'); paint(c, S8); } },
    { cap: tx('Confirm layout: Truck 1 is Received.'), read: S(tx('Something is off, A6’s label: check it now, or confirm and sort it out in the audit.'), tx('The phase moves on and the Receiving chip says when it was confirmed.')),
      dev: '<b>receiving.confirm</b> hands the layout to the decant; pallets can still change afterwards.', ev: [E('receiving.confirm', 'backdock', { truck: TR }, { confirmed: true })],
      run: async c => { await c.tap('#v-rc .rc2-conf'); paint(c, S9); off(c); toast(c, tx('Layout confirmed · Truck {n} received: Take 5, then start', { n: 1 })); } },
    { cap: tx('Take 5 with the team: tick the five checks.'), read: S(tx('Briefed, safety, equipment, the area and the goal.'), tx('Start decant lights up once all five are ticked.')),
      dev: 'The ticks are kept on this PC (<b>take5Card()</b> in js/views/backdock/plan.js); nothing is sent.', ev: [],
      run: async c => { for (let i = 0; i < 5; i++) { await c.tap(`#v-rc .rc2-t5i[data-t5="${i}"]`); paint(c, mut(S9, s => { s.t5 = i + 1; s.fc = '06:38'; })); } } },
    { cap: tx('Start decant: the decant clock starts, and pallets can be started.'), read: S(tx('The Take 5 is recorded and Truck 1 is Decanting.'), tx('With the phones still down, the desk starts each pallet from its card, under Decant.')),
      dev: '<b>onPlanAct()</b> in js/views/backdock/plan.js: <b>truck.take5</b> with the five checks, then <b>truck.setStart</b>; <b>begun()</b> in shared/dockphase.js gates every start.',
      ev: [E('truck.take5', 'backdock', { truck: TR }, { items: ['brief', 'safe', 'equip', 'area', 'goal'] }), E('truck.setStart', 'backdock', { truck: TR }, { at: '2026-10-25T06:25:00+08:00' })],
      run: async c => { await c.tap('#v-rc .rc2-sd'); paint(c, S11); off(c); toast(c, tx('Take 5 recorded · decant started')); } },
  ],
  whatif: [[tx('Phones back halfway through?'), tx('They carry on from where the desk is: every pallet entered here is on them at once.')], [tx('Need the receiving audit on paper?'), tx('Audit on the truck’s card prints it, from a PC, for managers.')], [tx('Pressed Finalise too soon?'), tx('Cancel: nothing closes until Close truck, Keep as rollover or Clear the dock is pressed.')]],
  stories: [],
};

// ── What if a pallet is on the wrong square? ─────────────────────────
// A6 was landed on A6, but it stands on B2. Everything is down (S7, at the dock).
const M0 = mut(S7, s => { s.sel = ''; s.y = Y.dock; s.fc = '06:34'; s.sheet = null; });
const M1 = mut(M0, s => { s.sel = 'A6'; s.y = Y.footA6; });
const M2 = mut(M1, s => { s.moving = 'A6'; s.y = Y.grid; });
const M3 = mut(M2, s => { s.moving = ''; s.bays.B2 = s.bays.A6; delete s.bays.A6; s.sel = 'B2'; s.fresh = ['B2']; });
receivepc.stories.push({
  id: 'move', title: tx('What if a pallet is on the wrong square?'), blurb: tx('Move it from its card: it takes everything with it to the empty square you click.'),
  know: [tx('Move is on a pallet’s card; the empty squares light up for it.'), tx('The pallet keeps its labels, type, cartons, the time worked on it and its place in the plan.'),
    tx('Only an empty square takes it: one that holds a pallet says so.'), tx('Cancel, or a click on the pallet itself, stops the move.'), tx('A decanted pallet stays where it is.'), tx('Every phone and dock screen shows it on its new square straight away.')],
  html: () => desk(M0),
  steps: [
    { cap: tx('The pallet on A6 really stands on B2: click it.'), read: S(tx('Its card opens under Landed today.'), tx('Its label off the manifest is still waiting there, to flag or ignore.')),
      dev: '<b>palletPanel()</b>: Move shows on a pallet that is not done.', ev: [],
      run: async c => { await c.tap('#v-rc .rc2-sq[data-ref="A6"]'); paint(c, mut(M1, s => { s.y = Y.dock; })); await scroll(c, Y.footA6); off(c); paint(c, M1); } },
    { cap: tx('Move: the empty squares light up.'), read: S(tx('The desk goes back to the dock.'), tx('Land a pallet steps aside for the move, with Cancel.')),
      dev: '<b>onAct()</b>, dec move: <b>movingBar()</b>, and <b>dockGrid()</b> lights the empty squares. Nothing is sent yet.', ev: [],
      run: async c => { await c.tap('#v-rc .rc2-mv'); off(c); await scroll(c, Y.grid); paint(c, M2); toast(c, tx('Tap an empty square for {ref}', { ref: 'A6' })); } },
    { cap: tx('Click B2: A6 is moved there, with everything on it.'), read: S(tx('A6 is empty again and B2 holds the pallet, OFF and all.'), tx('Its card stays open, on its new square.')),
      dev: '<b>pallet.move</b>: <b>bay_occupied</b> refuses a square that holds a pallet; the decant plan keeps its place in the queue.', ev: [E('pallet.move', 'backdock', B('A6'), { to: 'B2' })],
      run: async c => { await c.tap('#v-rc .rc2-sq[data-ref="B2"]'); paint(c, M3); toast(c, tx('{ref} moved to {to}', { ref: 'A6', to: 'B2' })); } },
  ],
});

// ── What if a pallet lands with no label to read? ─────────────────────
// A7's label is torn: a phone landed it with its 7 cartons and no label. A1 to A5 are down.
const L0 = mut(S0, s => { Object.assign(s.bays, bays('A3', 'A4', 'A5')); s.bays.A7 = mk('A7', { cons: [] }); s.fc = '06:20'; });
const L1 = mut(L0, s => { s.card = 'link'; });
const L2 = mut(L0, s => { s.bays.A7 = mk('A7', { late: true }); s.fc = '06:21'; });
const L3 = mut(L2, s => { s.sel = 'A7'; s.y = Y.footA7; });
receivepc.stories.push({
  id: 'nolabel', title: tx('What if a pallet lands with no label to read?'), blurb: tx('The desk flags it, and links it to the manifest’s consol by its cartons.'),
  know: [tx('A pallet with no consol matched shows as no label in the tally, with a card above the truck to link it.'), tx('It happens when a label can’t be read, or a pallet landed before the manifest was attached.'),
    tx('The desk matches what it can by itself: a code scanned on the pallet, or a carton count only one pallet and one consol share.'), tx('The rest wait for you to pick, with the consols ranked by how close their cartons are.'),
    tx('Each link is recorded as linked late, with how it was made, and the receiving audit shows it.'), tx('Linking is for managers; a label that is not on the manifest is never linked, it goes to the audit.')],
  html: () => desk(L0),
  steps: [
    { cap: tx('A7 landed without its label: the desk flags it.'), read: S(tx('The tally says no label, and a card above the truck says A7 is not linked to the manifest.'), tx('Until it is, its consol counts as not landed.')),
      dev: '<b>unlinked()</b> in js/views/backdock/late.js: a pallet with no consol matched and no label held.', ev: [],
      run: async c => { await c.tap('#v-rc .rc2-llw'); glow(c, '#v-rc .rc2-llw', true); await c.wait(700); } },
    { cap: tx('Link landed pallets: the desk finds the consol by its cartons.'), read: S(tx('A7 has 7 cartons, and one consol not landed yet has 7: 601930170.'), tx('When the cartons don’t settle it, you pick from the closest.')),
      dev: '<b>linkSheet()</b> plans the links: exact scans first, then a carton count that occurs once on each side, then suggestions ranked by carton fit.', ev: [],
      run: async c => { glow(c, '#v-rc .rc2-llw', false); await c.tap('#v-rc .rc2-llo'); paint(c, L1); } },
    { cap: tx('Apply links: A7 is matched, recorded as linked late.'), read: S(tx('The tally counts its consol, and Landed today says how it was linked.'), tx('The card above the truck has gone.')),
      dev: '<b>applyLinks()</b> sends <b>manifest.linkLate</b> with each link and its basis.', ev: [E('manifest.linkLate', 'backdock', { truck: TR }, { links: [{ bay: 'A7', consolIds: ['601930170'], basis: 'cartons' }] })],
      run: async c => { await c.tap('#v-rc .rc2-apply'); paint(c, L2); off(c); toast(c, txn(1, '{n} pallet linked to the manifest on Truck {t}', '{n} pallets linked to the manifest on Truck {t}', { t: 1 })); } },
    { cap: tx('Open A7: its consol is there, marked linked late.'), read: S(tx('601930170, 7 cartons of department 047.'), tx('A wrong link comes off with its ×, like any scan.')),
      dev: 'A linked pallet keeps <b>linkBasis</b> and <b>linkedLateAt</b>; <b>pallet.unscan</b> takes the consol off again.', ev: [],
      run: async c => { await scroll(c, Y.dock); await c.tap('#v-rc .rc2-sq[data-ref="A7"]'); paint(c, mut(L3, s => { s.y = Y.dock; })); await scroll(c, Y.footA7); off(c); paint(c, L3); } },
  ],
});

// ── What if Finish receiving is pressed too soon? ─────────────────────
// 06:01: only A1 and A2 are down.
const F0 = mut(S0, s => { s.fc = '06:09'; });
const F1 = mut(F0, s => { s.card = 'fin'; });
const F3 = mut(F0, s => { s.ph = 2; s.conf = '06:01'; });
receivepc.stories.push({
  id: 'early', title: tx('What if Finish receiving is pressed too soon?'), blurb: tx('It says what is still to land, the audit lists each consol, and the hand-over can be undone.'),
  know: [tx('Finish receiving counts what landed against the manifest and says when something is off.'), tx('Something off never blocks it: confirm and sort it out in the audit, or check it now.'),
    tx('The receiving audit prints the truck on one A4: what landed where, each consol missing, and a line to sign.'), tx('Pallets can still land, move and change after the layout is confirmed.'),
    tx('The Receiving chip on the truck’s card undoes the hand-over: the layout is open again.')],
  html: () => desk(F0),
  steps: [
    { cap: tx('Finish receiving with two pallets down: nine consols are not landed.'), read: S(tx('The count says it plainly: 3 of 12 consols matched, 9 on the manifest and not landed.'), tx('Something is off. Check it now, or confirm and sort it out in the audit.')),
      dev: '<b>finishSheet()</b> reads <b>liveAudit()</b> and <b>phaseCounts()</b> (shared/dockphase.js).', ev: [],
      run: async c => { await c.tap('#v-rc .rc2-go'); paint(c, F1); } },
    { cap: tx('Receiving audit: the truck on paper, each missing consol listed.'), read: S(tx('Missing consols have a Found? box to tick as they turn up.'), tx('The receiving audit prints from a PC, for managers.')),
      dev: '<b>printAudit()</b> in js/views/backdock/audit.js builds the page from <b>historyRow()</b> and prints it with <b>printSheet()</b> (js/print.js).', ev: [],
      run: async c => { await c.tap('#v-rc .rc2-faud'); off(c); c.html('.pc2-omni', audit(F0)); c.cls('.pc2-omni', 'rc2-om', true); c.show('.pc2-omni'); await c.wait(900); } },
    { cap: tx('Confirm layout anyway: Truck 1 is Received.'), read: S(tx('Confirming is allowed with something off.'), tx('The phones can still land the rest.')),
      dev: '<b>receiving.confirm</b> with confirmed: true.', ev: [E('receiving.confirm', 'backdock', { truck: TR }, { confirmed: true })],
      run: async c => { c.hide('.pc2-omni'); c.html('.pc2-omni', ''); await c.wait(400); await c.tap('#v-rc .rc2-conf'); paint(c, F3); off(c); toast(c, tx('Layout confirmed · Truck {n} received: Take 5, then start', { n: 1 })); } },
    { cap: tx('Too soon? Click the Receiving chip: the hand-over is undone.'), read: S(tx('Truck 1 is receiving again, with Finish receiving as the next step.'), tx('Confirm it again when the truck is empty.')),
      dev: 'The chip sends <b>receiving.confirm</b> with confirmed: false (<b>onAct()</b>, received).', ev: [E('receiving.confirm', 'backdock', { truck: TR }, { confirmed: false })],
      run: async c => { await c.tap('#v-rc .rc2-rcv'); paint(c, F0); off(c); toast(c, tx('Hand-over undone')); } },
  ],
});
