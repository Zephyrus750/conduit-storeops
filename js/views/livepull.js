// Live pull (24 Oct 2026): the floor asks the stockroom for stock, item by
// item, and the stockroom pulls it straight away. A session is one
// department's run. The requester scans an item, its ticket or a keycode on
// the floor (the worker's /pull/find answers at once from the latest inventory
// report: the item's stockroom bays, carton size, today's truck; an item's
// barcode is matched from the store's barcode book, a kept match or the
// catalogue, and one nothing knows is searched in the background, in a tray,
// while the requester scans on) and sends
// how many; each puller sees the requests for the bays their phone picked,
// marks them off (pulled, short from one bay and the rest from the next, or
// not there) and sends the cage down. Only items with a stockroom location
// can be asked for: the report's bays, or (8 Nov 2026) for an item the report
// has no bay for, the bays it was seen in over the last two weeks (backfilled
// there, or on an earlier report or SOH snapshot: the worker's seenBays),
// asked for as a suggestion the puller sees marked. What was pulled shows to
// anyone who scans the item again that day. Sessions stay listed for a week (shared/reducers/pull.js).
//
// Screens on the phone: home (sessions), new, the requester's scan and pad,
// the puller's bays, the puller's list, the cage. Both lists end in a strip
// above the tabs that opens the session's details, as the map modes do. On a
// PC it is a tab under Backfill: every line of today's sessions and the
// week's. A new request in a puller's bays buzzes the phone wherever it is
// in the app (installPullAlerts, from the shell).

import { searchBarcode, barcodeCard } from '../barcodesearch.js';
import { recallFor, recallFlag, recallTagFor } from '../recallflag.js';
import { ic, esc, vh, sub, toast, dep, DEPTS_DEFAULT, DEPT_NAME, today, productImg, fmtDay, empty, mhead } from '../ui.js';
import { hasArea, ensureArea } from '../unlock.js';
import { openScanner } from '../scan.js';
import { sx } from '../map.js';
import { haptic } from '../device.js';
import { prefs, setPref } from '../prefs.js';
import { fmtHM } from './backdock/common.js';
import { ulid } from '../../shared/ulid.js';
import { isKeycode } from '../../shared/keycode.js';
import { settingsOf } from '../../shared/reducers/store.js';
import { sessionCounts, sessionPeople, inZone, lineInZone, uncovered, pulledToday, gotOf } from '../../shared/reducers/pull.js';
import { tx, txn } from '../i18n.js';
import { ask } from '../sheet.js';

// screen: null (the session this phone is in, or home) | new | zones | cage | past
// find: the last scan's answer { state: busy | found | seen | none | noreport | error, code, kc, bays, seen, soh, carton, truck, name, img }
const st = { screen: null, past: null, desk: null, find: null, qty: '', ack: false, seenOk: false, change: null, sent: null, viaCam: false, shelf: '', tab: 'todo', order: 'time', sheet: false, short: null, got: {}, form: null, zone: null, tag: '' };
const names = new Map(), asking = new Set();
const hm = iso => (iso ? fmtHM(iso) : '');

// ── This phone's session (kept on the device, per store) ────────────────
const MINE = no => `pull_mine:${no}`;
function mine(ctx) { try { return JSON.parse(localStorage.getItem(MINE(ctx.storeNo)) || 'null'); } catch { return null; } }
function setMine(ctx, v) { try { if (v) localStorage.setItem(MINE(ctx.storeNo), JSON.stringify(v)); else localStorage.removeItem(MINE(ctx.storeNo)); } catch {} }
const pulls = ctx => ctx.store.get('pulls') || { sessions: {} };
const sessions = ctx => Object.values(pulls(ctx).sessions || {}).sort((a, b) => String(b.at).localeCompare(String(a.at)));
function joined(ctx) {
  const m = mine(ctx), ses = m && pulls(ctx).sessions?.[m.sid];
  if (m && (!ses || ses.closedAt)) { setMine(ctx, null); return null; }
  return ses ? { ses, part: m.part } : null;
}
const liveLines = ses => Object.values(ses.lines || {}).filter(l => l.st !== 'cancelled');
const myZone = (ctx, ses) => ses.people?.[ctx.session.device]?.bays || ['all'];
// Pullers in the order they joined: this phone, Puller 2, Puller 3…
function pullerNames(ctx, ses) {
  const order = Object.entries(ses.people || {}).filter(([, p]) => p.part === 'pull').sort((a, b) => String(a[1].at).localeCompare(String(b[1].at))).map(([d]) => d);
  return d => (d === ctx.session.device ? tx('This phone') : order.includes(d) ? tx('Puller {n}', { n: order.indexOf(d) + 1 }) : '');
}
const zoneText = z => (!z?.length || z.includes('all') ? tx('every bay') : z.join(', '));

// Names come with the request (the product name the requester's scan
// brought, else the item's description); a line without one asks this
// device's catalogue once.
function nameOf(ctx, l, repaint) {
  if (l.name) return l.name;
  if (names.has(l.kc)) return names.get(l.kc) || l.kc;
  if (!asking.has(l.kc)) { asking.add(l.kc); ctx.catalogue.lookup(l.kc).then(it => { names.set(l.kc, it?.name || null); repaint(); }).catch(() => names.set(l.kc, null)); }
  return l.kc;
}
const qtyText = l => (l.qty === 'all' ? tx('all there is') : l.carton && l.qty % l.carton === 0 ? `${l.qty} · ${txn(l.qty / l.carton, '{n} carton', '{n} cartons')}` : String(l.qty));
// Where an item the report had no bay for was seen lately (pull/find's seen, a line's seen).
const SEEN_VIA = { backfill: d => tx('backfilled {date}', { date: d }), report: d => tx('inventory report {date}', { date: d }), soh: d => tx('SOH report {date}', { date: d }) };
const seenText = x => SEEN_VIA[x.via]?.(esc(fmtDay(x.date))) || '';
// A line asked for where it was seen lately: what the puller is told about the bay in hand.
const seenTag = (l, bay) => { const x = l.seen?.find(y => y.bay === bay) || l.seen?.[0]; return x ? `<span class="lp-sug" title="${tx('Not on today’s report: asked for where it was seen lately, so it may not be there')}">${tx('SUGGESTED')}</span> <small class="lp-sugw">${seenText(x)}</small>` : ''; };
const baysText = l => (l.got && Object.keys(l.got).length > 1 ? Object.entries(l.got).map(([b, n]) => tx('{n} from {bay}', { n, bay: b })).join(', ') : l.bays.length > 1 ? tx('bays {list}', { list: l.bays.join(' + ') }) : tx('bay {bay}', { bay: l.bays[0] }));
function stateText(l) {
  if (l.st === 'todo') return [tx('Waiting'), ''];
  if (l.st === 'pulled') return [l.qty === 'all' && !l.got ? tx('Pulled all') : tx('Pulled {n}', { n: gotOf(l) }), 'ok'];
  if (l.st === 'short') return [tx('Short · {got} of {asked}', { got: gotOf(l), asked: l.qty }), 'warn'];
  if (l.st === 'gone') return [tx('Not there'), 'bad'];
  return [tx('Taken back'), ''];
}
const countsLine = c => [txn(c.asked, '{n} asked', '{n} asked'), tx('{n} pulled', { n: c.pulled }), c.short ? tx('{n} short', { n: c.short }) : '', c.gone ? tx('{n} not there', { n: c.gone }) : '', c.todo ? tx('{n} waiting', { n: c.todo }) : ''].filter(Boolean).join(' · ');
async function send(ctx, type, entity, payload = {}) {
  try { await ctx.store.dispatch({ type, entity, payload }); return true; }
  catch (e) { toast(e.message, 'bad'); return false; }
}
const sheetHtml = body => `<div class="mv-sel"><div class="sx lp-sx">${body}</div></div>`;
const strip = (icon, title, s, n) => `<div class="mv-strip"><div class="mv-st">${ic(icon)}<b>${title}</b><span class="s">${s}</span>${n ? `<span class="n">${n}</span>` : ''}</div><button class="mv-tog" type="button" data-act="lp-sheet" aria-expanded="${st.sheet}" aria-label="${st.sheet ? tx('Hide the details') : tx('Show the details')}">${ic('chev')}</button></div>`;

// ── Home: the sessions ──────────────────────────────────────────────────
function home(ctx) {
  const all = sessions(ctx), open = all.filter(s => !s.closedAt), past = all.filter(s => s.closedAt);
  const row = s => {
    const c = sessionCounts(s), p = sessionPeople(s), pct = c.asked ? Math.round((c.asked - c.todo) / c.asked * 100) : 0;
    return `<div class="lp-ses"><div class="lp-sr">${s.dept ? dep(s.dept) : ''}<b>${esc(s.name)}</b></div>` +
      `<span class="lp-dim">${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers')].join(' · ')} · ${tx('since {time}', { time: hm(s.at) })}</span>` +
      `<span class="lp-dim">${countsLine(c)}</span><span class="lp-bar"><i style="width:${pct}%"></i></span>` +
      `<div class="lp-acts"><button class="btn sm primary" data-act="lp-join" data-sid="${esc(s.id)}" data-part="req">${ic('barcode')}${tx('Ask for stock')}</button><button class="btn sm" data-act="lp-join" data-sid="${esc(s.id)}" data-part="pull">${ic('box')}${tx('Pull stock')}</button></div></div>`;
  };
  return `<div class="lp-body">` + mhead(tx('Live pull'), tx('Ask the stockroom for stock from the floor')) +
    (open.length ? `<div class="card lp-card"><span class="lbl">${txn(open.length, 'Running now · {n}', 'Running now · {n}')}</span>${open.map(row).join('')}</div>` : `<div class="card lp-card">${empty(`<b>${tx('No session is running')}</b><br>${tx('Start one for your department: one person scans on the floor, the others pull in the stockroom.')}`, { icon: 'packages' })}</div>`) +
    `<button class="mv-big" data-act="lp-new">${ic('plus')}${tx('Start a session')}</button>` +
    (past.length ? `<div class="card lp-card"><span class="lbl">${tx('Earlier · listed for 7 days')}</span>${past.map(s => `<button class="lp-hist" data-act="lp-past" data-sid="${esc(s.id)}">${s.dept ? dep(s.dept) : ''}<span><b>${esc(s.name)}</b><small>${esc(fmtDay(s.at))} · ${countsLine(sessionCounts(s))}</small></span>${ic('arrow')}</button>`).join('')}</div>` : '') +
    `<p class="lp-dim">${tx('Each session keeps its own list, so two departments can work at the same time.')}</p></div>`;
}

// ── Start a session ─────────────────────────────────────────────────────
function newForm(ctx) {
  const f = (st.form ||= { name: '', dept: '', part: 'req', shelves: false });
  const coded = DEPTS_DEFAULT.filter(d => ['home', 'clothing', 'kids'].includes(d.group));
  return `<div class="lp-body">${mhead(tx('Start a session'), tx('Live pull · listed for 7 days'))}` +
    `<div class="card lp-card"><label class="lp-fl" for="lp-name">${tx('Session name')}</label><input class="ad-in" id="lp-name" data-field="lp-name" maxlength="60" value="${esc(f.name)}" placeholder="${tx('Toys, aisles 16 to 18')}">` +
    `<span class="lp-fl">${tx('Department')}</span><div class="lp-depts">${coded.map(d => `<button class="lp-dept${f.dept === d.id ? ' on' : ''}" data-act="lp-dept" data-dept="${d.id}" aria-pressed="${f.dept === d.id}">${dep(d.id)}${esc(d.name)}</button>`).join('')}</div>` +
    `<span class="lp-fl">${tx('Your part')}</span><div class="seg lp-seg"><button class="${f.part === 'req' ? 'on' : ''}" data-act="lp-part" data-part="req" aria-pressed="${f.part === 'req'}">${tx('Requester')}</button><button class="${f.part === 'pull' ? 'on' : ''}" data-act="lp-part" data-part="pull" aria-pressed="${f.part === 'pull'}">${ic('lock')}${tx('Puller')}</button></div>` +
    `<p class="lp-dim">${f.part === 'pull' ? tx('Pull in the stockroom and mark requests off. Any number of pullers can join, each with their own bays. Needs the Stockroom or manager code.') : tx('Scan on the floor and send what’s needed. Requests come from this phone.')}</p>` +
    `<button class="lp-switch${f.shelves ? ' on' : ''}" data-act="lp-shelves" role="switch" aria-checked="${f.shelves}"><span><b>${tx('Scan floor shelves too')}</b><small>${tx('Optional. Off: just scan items across the department. On: the cage comes down in shelf order.')}</small></span><i></i></button></div>` +
    `<button class="mv-big" data-act="lp-start">${ic('check')}${f.part === 'pull' ? tx('Next: pick your bays') : tx('Start session')}</button><button class="mv-ghost" data-act="lp-home">${tx('Cancel')}</button></div>`;
}

// ── A puller's bays ─────────────────────────────────────────────────────
function zones(ctx, ses) {
  const ranges = settingsOf(ctx.store.get('settings')).deptRanges || [], who = pullerNames(ctx, ses), me = ctx.session.device;
  const sel = (st.zone ||= new Set(ses.people?.[me]?.part === 'pull' ? ses.people[me].bays : []));
  const others = Object.entries(ses.people || {}).filter(([d, p]) => d !== me && p.part === 'pull');
  const takenBy = key => { const [a, b] = key.split('-'); const hit = others.find(([, p]) => (p.bays || []).some(z => z === key || (inZone(a, [z]) && inZone(b ?? a, [z])))); return hit ? who(hit[0]) : ''; };
  const opts = [...ranges].sort((x, y) => (x.dept === ses.dept ? 0 : 1) - (y.dept === ses.dept ? 0 : 1) || Number(x.from) - Number(y.from))
    .map(r => ({ key: `${r.from}-${r.to}`, label: `${String(r.dept).toUpperCase()} ${DEPT_NAME[String(r.dept).toLowerCase()] || ''} · ${r.from}–${r.to}`, dept: r.dept }));
  for (const z of sel) if (z !== 'all' && !opts.some(o => o.key === z)) opts.push({ key: z, label: tx('Bays {range}', { range: z.replace('-', '–') }) });
  const opt = o => { const by = o.key === 'all' ? '' : takenBy(o.key); return `<button class="lp-opt${sel.has(o.key) ? ' on' : ''}" data-act="lp-zone" data-z="${esc(o.key)}" role="checkbox" aria-checked="${sel.has(o.key)}"><i></i><span><b>${esc(o.label)}</b><small>${o.sub || (by ? tx('{who} has these', { who: by }) : tx('No one else yet'))}</small></span>${by ? `<em>${esc(by)}</em>` : ''}</button>`; };
  const summary = sel.has('all') || !sel.size ? tx('every bay') : [...sel].map(z => z.replace('-', '–')).join(', ');
  return `<div class="lp-body">${mhead(tx('Your bays'), `${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)} · ${tx('puller')}`)}` +
    `<div class="card lp-card"><span class="lbl">${tx('Which bays does this phone pull?')}</span>${opts.map(opt).join('')}${opt({ key: 'all', label: tx('Every bay'), sub: tx('See every request, whoever has the bay') })}` +
    `<div class="lp-range"><input class="ad-in mono" data-field="lp-from" inputmode="numeric" placeholder="${tx('From')}" aria-label="${tx('First bay')}"><span>–</span><input class="ad-in mono" data-field="lp-to" inputmode="numeric" placeholder="${tx('To')}" aria-label="${tx('Last bay')}"><button class="btn sm" data-act="lp-addrange">${ic('plus')}${tx('Add')}</button></div>` +
    `<p class="lp-dim">${ranges.length ? tx('Ranges come from Settings › Departments. Bays that no puller has picked show on every puller’s phone, so nothing is missed.') : tx('No department ranges are set in Settings › Departments: type a range, or pull every bay.')}</p></div>` +
    alertsCard() +
    `<button class="mv-big" data-act="lp-zones-go">${ic('check')}${tx('Start pulling · {bays}', { bays: esc(summary) })}</button><button class="mv-ghost" data-act="lp-home">${tx('Back')}</button></div>`;
}
const alertsCard = () => `<div class="card lp-card"><span class="lbl">${tx('Alerts on this phone')}</span>` +
  `<button class="lp-switch${prefs().pullBuzz !== false ? ' on' : ''}" data-act="lp-buzz" role="switch" aria-checked="${prefs().pullBuzz !== false}"><span><b>${tx('Buzz when a request comes in')}</b><small>${tx('Only for your bays. Costs no extra battery: the phone already keeps the session open.')}</small></span><i></i></button>` +
  `<button class="lp-switch${prefs().pullSound ? ' on' : ''}" data-act="lp-sound" role="switch" aria-checked="${!!prefs().pullSound}"><span><b>${tx('Play a sound too')}</b><small>${tx('For phones that can’t buzz from a web app, like iPhones.')}</small></span><i></i></button></div>`;

// ── The requester: scan, how many, send ─────────────────────────────────
function requester(ctx, ses, repaint) {
  const c = sessionCounts(ses), p = sessionPeople(ses), f = st.find, day = today();
  const head = mhead(`${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)}`, `<i class="lp-live"></i>${p.pull ? txn(p.pull, '{n} puller in the stockroom', '{n} pullers in the stockroom') : tx('No puller has joined yet')}`);
  const scan = `<form class="lp-scan" data-form="lp-find"><input class="ad-in mono" data-field="lp-code" inputmode="numeric" autocomplete="off" enterkeyhint="search" placeholder="${tx('Scan or type a keycode')}" aria-label="${tx('Keycode or barcode')}"><button type="button" class="lp-cam" data-act="lp-cam" aria-label="${tx('Scan with the camera')}">${ic('camera')}</button></form>` +
    (ses.shelves ? `<button class="lp-shelf" data-act="lp-cam-shelf">${ic('pin')}${st.shelf ? tx('For shelf {shelf}', { shelf: `<b>${esc(st.shelf)}</b>` }) : tx('Scan the shelf you are filling')}</button>` : '');
  const dup = f?.state === 'found' || f?.state === 'seen' ? liveLines(ses).find(l => l.kc === f.kc && l.st === 'todo') : null;
  // A recalled or withdrawn product is never asked for: the flag says where it goes instead.
  const rec = f && (f.state === 'found' || f.state === 'seen' || f.state === 'none' || f.state === 'recalled') ? recallFor(ctx.store, f.kc) || recallFor(ctx.store, f.gtin) || recallFor(ctx.store, f.code) : null;
  const card = rec ? productRow(f) + recallFlag(ctx.store, rec, f.kc || '') : !f ? (st.sent ? `<div class="lp-sent" role="status">${ic('check')}<span><b>${st.sent.change ? tx('Changed: {name} × {qty}', { name: esc(st.sent.name), qty: esc(st.sent.qty) }) : tx('Sent: {name} × {qty}', { name: esc(st.sent.name), qty: esc(st.sent.qty) })}</b><small>${tx('On the pullers’ phones now. Scan the next item.')}</small></span></div>` : `<div class="card lp-card lp-hint">${ic('barcode')}<p>${tx('Scan an item, its ticket, or type the keycode. Only items with a stockroom location can be asked for.')}</p></div>`)
    : f.state === 'busy' ? `<div class="card lp-card lp-hint">${ic('clock')}<p>${tx('Looking it up…')}</p></div>`
    : f.state === 'error' ? `<div class="lp-ans bad">${ic('alert')}<span><b>${tx('Couldn’t look it up')}</b>${esc(f.message || '')}</span></div>`
    : f.state === 'choose' || f.state === 'manual' ? barcodeCard(f)
    : f.state === 'recalled' ? productRow(f)   // closed since the scan: nothing more to say
    : f.state === 'noreport' ? `<div class="lp-ans warn">${ic('alert')}<span><b>${tx('No inventory report yet')}</b>${tx('Live pull reads the stockroom bays from the morning inventory report. Paste it in Reports & files first.')}</span></div>`
    : f.state === 'seen' ? productRow(f) + seenCard(f) + (st.seenOk ? flags(ctx, ses, f, dup, day) : '')
    : f.state === 'none' ? productRow(f) + `<div class="lp-ans warn">${ic('x')}<span><b>${tx('No stockroom location')}</b>${f.report?.date && f.report.date !== day ? tx('The latest report ({date}) has no stockroom bay for it, so it isn’t added to the list.', { date: esc(f.report.date) }) : tx('This morning’s report has no stockroom bay for it, so it isn’t added to the list.')}</span></div>`
    : productRow(f, true) + flags(ctx, ses, f, dup, day);
  const showPad = (f?.state === 'found' || (f?.state === 'seen' && st.seenOk)) && !rec && (st.ack || (!dup && !f.truck));
  const c2 = f?.carton;
  const pad = `<div class="lp-qty"><span class="lbl">${st.change ? tx('Change to') : tx('How many?')}</span><b class="lp-n${st.qty ? '' : ' blank'}${st.qty === 'ALL' ? ' all' : ''}" aria-live="polite">${st.qty === 'ALL' ? tx('All there is') : st.qty || '–'}</b></div>` +
    `<div class="lp-padx">${c2 ? `<button data-act="lp-carton">${ic('box')}${tx('+ Carton ({n})', { n: c2 })}</button>` : ''}<button class="${st.qty === 'ALL' ? 'on' : ''}" data-act="lp-allthere">${tx('All there is')}</button></div>` +
    `<div class="lp-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button data-act="lp-key" data-k="${k}">${k}</button>`).join('')}<button data-act="lp-key" data-k="del" aria-label="${tx('Delete')}">⌫</button><button data-act="lp-key" data-k="0">0</button><button class="send" data-act="lp-send"${st.qty ? '' : ' disabled'}>${st.change ? tx('Change') : tx('Send')}</button></div>`;
  const lines = liveLines(ses).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const lastCage = ses.cages?.[ses.cage - 1];
  const sheet = sheetHtml(`<div class="sx-h">${ic('listcheck')}${esc(ses.name)}${c.todo ? `<span class="n">${tx('{n} waiting', { n: c.todo })}</span>` : ''}</div><p class="sx-sub">${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers'), tx('since {time}', { time: hm(ses.at) }), ses.shelves ? tx('shelf scan on') : tx('shelf scan off')].join(' · ')}</p>` +
    (lastCage ? sx.sec(tx('Cage {n}', { n: ses.cage - 1 }), sx.rows([sx.row('cage', txn(lastCage.lines, 'On its way: {n} line', 'On its way: {n} lines'), tx('sent down {time}', { time: hm(lastCage.at) }), tx('Coming'), 'acc')])) : '') +
    sx.sec(tx('Requests'), lines.length ? sx.rows(lines.slice(0, 60).map(l => { const [t, tone] = stateText(l); return sx.row('box', `${esc(nameOf(ctx, l, repaint))} · ${esc(qtyText(l))}`, `<span class="mono">${esc(l.kc)}</span> · ${esc(baysText(l))} · ${hm(l.at)}`, t, tone); })) : empty(tx('Nothing asked for yet.'), { sm: true, icon: 'box' }), tx('newest first')) +
    sx.acts([sx.btn('phone', prefs().pullAnswerBuzz !== false ? tx('Buzz when answered: on') : tx('Buzz when answered: off'), 'data-act="lp-abuzz"'), sx.btn('x', tx('Leave session'), 'data-act="lp-leave"'), sx.btn('check', tx('End session'), 'data-act="lp-end"')]));
  return `<div class="lp-body">${head}${scan}${behindTray()}${card}${showPad ? pad : ''}</div>${sheet}${strip('listcheck', esc(ses.name), countsLine(c), c.todo || '')}`;
}
// How a scanned barcode found its keycode: the report's own APN, a pair a
// person made earlier (Cages, Adjust), or Kmart's site search.
const FROM = { apn: () => tx('found from the barcode'), paired: () => tx('found from the barcode'), kmart: () => tx('found from the barcode'), web: () => tx('found on kmart.com.au from the barcode') };
function productRow(f, bays) {
  // The keycode is the title until the name lands, and then the line under it.
  const id = esc(f.kc || f.code), line = [f.name ? `<span class="mono">${id}</span>` : '', Number.isFinite(f.price) ? `$${Number(f.price).toFixed(2)}` : '', f.carton ? tx('carton of {n}', { n: f.carton }) : ''].filter(Boolean).join(' · ');
  return `<div class="card lp-prod"><span class="lp-pic">${productImg(f.img) || ic('box')}</span><span class="lp-pn">${f.name ? `<b>${esc(f.name)}</b>` : `<b class="mono">${id}</b>`}${line ? `<small>${line}</small>` : ''}${FROM[f.via] ? `<small class="lp-from">${FROM[f.via]()}${f.via !== 'apn' && f.gtin ? ` · <button type="button" class="lp-a" data-act="lp-wrong" data-gtin="${esc(f.gtin)}">${tx('Wrong item?')}</button>` : ''}</small>` : ''}</span>` +
    (bays && f.bays?.length ? `<span class="lp-bay"><small>${f.bays.length > 1 ? tx('BAYS') : tx('BAY')}</small><b class="mono">${esc(f.bays[0])}</b>${f.bays.length > 1 ? `<small class="mono">+ ${esc(f.bays.slice(1).join(', '))}</small>` : ''}</span>` : '') + `</div>`;
}
// What the requester is told before the pad: already asked for in this
// session, on today's truck, pulled earlier today (any session).
// Not on the report's bays, but seen in the stockroom over the last two weeks:
// it may not have been scanned in, so it can be asked for there. The request
// carries where it was seen, and the puller sees it as a suggestion.
function seenCard(f) {
  return `<div class="lp-ans warn">${ic('alert')}<span><b>${tx('Not on today’s report, but seen lately')}</b>${tx('It may not have been scanned in. Ask for it where it was seen and the stockroom checks there.')}</span></div>` +
    `<ul class="lp-seen">${f.seen.map(x => `<li><span class="lp-bay sm"><small>${tx('BAY')}</small><b class="mono">${esc(x.bay)}</b></span><span>${seenText(x)}</span></li>`).join('')}</ul>` +
    (st.seenOk ? '' : `<div class="lp-acts"><button class="btn" data-act="lp-clear">${tx('Skip it')}</button><button class="btn primary" data-act="lp-seen-ok">${f.seen.length > 1 ? tx('Ask for it in these bays') : tx('Ask for it there')}</button></div>`);
}
function flags(ctx, ses, f, dup, day) {
  const earlier = pulledToday({ pulls: pulls(ctx) }, f.kc, day);
  const before = earlier.length ? `<div class="lp-ans info">${ic('clock')}<span><b>${tx('Pulled earlier today')}</b>${earlier.map(x => x.n != null ? tx('{n} came out of bay {bay} at {time}', { n: x.n, bay: esc(x.bay), time: hm(x.at) }) : tx('Pulled from bay {bay} at {time}', { bay: esc(x.bay), time: hm(x.at) })).join('. ')}. ${tx('The bay may still have more.')}</span></div>` : '';
  if (st.ack) return before;
  if (dup) return before + `<div class="lp-ans warn">${ic('listcheck')}<span><b>${tx('Already asked for')}</b>${tx('{qty} at {time} in this session. It’s still waiting in the stockroom.', { qty: esc(qtyText(dup)), time: hm(dup.at) })}</span></div>` +
    `<div class="lp-acts">${dup.qty !== 'all' ? `<button class="btn primary" data-act="lp-dup-add" data-line="${esc(dup.id)}">${ic('plus')}${tx('Add {n} more', { n: dup.carton || dup.qty })}</button>` : ''}<button class="btn" data-act="lp-dup-change" data-line="${esc(dup.id)}">${tx('Change to…')}</button><button class="btn" data-act="lp-clear">${tx('Leave it')}</button></div>`;
  if (f.truck) return before + `<div class="lp-ans info">${ic('truck')}<span><b>${tx('On today’s truck')}</b>${f.truck.onDock ? tx('Truck {n} on the dock has {units} on its manifest. It should be decanted and filled today.', { n: esc(f.truck.truck), units: f.truck.cartons ? txn(f.truck.cartons, '{n} carton', '{n} cartons') + ` (${f.truck.units})` : f.truck.units }) : tx('Truck {n} (due {eta}) has {units} on its manifest. It should be decanted and filled today.', { n: esc(f.truck.truck), eta: esc(f.truck.eta || '—'), units: f.truck.cartons ? txn(f.truck.cartons, '{n} carton', '{n} cartons') + ` (${f.truck.units})` : f.truck.units })}</span></div>` +
    `<div class="lp-acts"><button class="btn primary" data-act="lp-clear">${tx('Skip it')}</button><button class="btn" data-act="lp-ack">${tx('Request anyway')}</button></div>`;
  return before;
}

// ── The puller: requests for this phone's bays ──────────────────────────
function puller(ctx, ses, repaint) {
  const zone = myZone(ctx, ses), who = pullerNames(ctx, ses), all = liveLines(ses);
  const mineL = all.filter(l => lineInZone(l, zone) || l.bays.every(b => uncovered(ses, b))), others = all.filter(l => !mineL.includes(l));
  const todo = mineL.filter(l => l.st === 'todo').length, done = mineL.length - todo;
  const shown = mineL.filter(l => st.tab === 'all' || (st.tab === 'todo' ? l.st === 'todo' : l.st !== 'todo'));
  const firstBay = l => l.bays.find(b => inZone(b, zone)) || l.bays[0];
  shown.sort((a, b) => st.order === 'time' ? String(b.at).localeCompare(String(a.at)) : firstBay(a).localeCompare(firstBay(b), 'en', { numeric: true }));
  const recent = Date.now() - 120_000;
  const line = l => {
    const bay = firstBay(l), also = l.bays.filter(b => b !== bay), todoL = l.st === 'todo', [t, tone] = stateText(l);
    const big = l.qty === 'all' ? tx('ALL') : String(l.qty), small = l.qty === 'all' ? tx('there is') : l.carton && l.qty % l.carton === 0 ? txn(l.qty / l.carton, '{n} carton', '{n} cartons') : '';
    return `<div class="lp-ln${todoL ? '' : ' done'}${todoL && Date.parse(l.at) > recent ? ' fresh' : ''}"><div class="lp-lt"><span class="lp-bay sm"><small>${tx('BAY')}</small><b class="mono">${esc(bay)}</b></span><span class="lp-pn"><b>${recallTagFor(l.kc)}${esc(nameOf(ctx, l, repaint))}</b><small>${hm(l.at)} · <span class="mono">${esc(l.kc)}</span>${l.shelf ? ' · ' + tx('for {shelf}', { shelf: esc(l.shelf) }) : ''}</small></span><span class="lp-q"><b>${esc(big)}</b>${small ? `<small>${esc(small)}</small>` : ''}</span></div>` +
      (l.seen ? `<div class="lp-also lp-sugl">${seenTag(l, bay)}</div>` : '') +
      (todoL && also.length ? `<div class="lp-also">${tx('Also in {bays} if {bay} runs short', { bays: also.map(b => `<span class="chip mono">${esc(b)}</span>`).join(' '), bay: `<span class="mono">${esc(bay)}</span>` })}</div>` : '') +
      (todoL ? `<div class="lp-acts"><button class="btn primary sm lp-ok" data-act="lp-pulled" data-line="${esc(l.id)}" data-bay="${esc(bay)}">${ic('check')}${l.qty === 'all' ? tx('Pulled all') : tx('Pulled {n}', { n: l.qty })}</button>${l.qty !== 'all' ? `<button class="btn sm" data-act="lp-short" data-line="${esc(l.id)}">${tx('Short')}</button>` : ''}<button class="btn sm lp-no" data-act="lp-gone" data-line="${esc(l.id)}">${tx('Not there')}</button></div>`
        : `<div class="lp-acts"><span class="lp-pill ${tone}">${t}${l.doneBy && l.doneBy !== ctx.session.device ? ' · ' + esc(who(l.doneBy) || tx('another puller')) : ''}</span>${l.cage == null ? `<button class="btn sm" data-act="lp-undo" data-line="${esc(l.id)}">${tx('Undo')}</button>` : `<span class="lp-dim">${tx('cage {n}', { n: l.cage })}</span>`}</div>`) + `</div>`;
  };
  const oTodo = others.filter(l => l.st === 'todo').length;
  const cageLines = all.filter(l => l.cage == null), cageDone = cageLines.filter(l => l.st !== 'todo').length;
  const pullers = Object.entries(ses.people || {}).filter(([, p]) => p.part === 'pull');
  const sheet = sheetHtml(`<div class="sx-h">${ic('box')}${esc(zoneText(zone))}<span class="n">${tx('{n} to pull', { n: todo })}</span></div><p class="sx-sub">${tx('This phone')} · ${esc(ses.name)} · ${prefs().pullBuzz !== false ? tx('buzz on') : tx('buzz off')}</p>` +
    sx.sec(tx('Cage {n}', { n: ses.cage }), sx.bar(cageDone, cageLines.length), tx('{done} of {all} marked off', { done: cageDone, all: cageLines.length })) +
    sx.sec(tx('Pullers'), sx.rows(pullers.map(([d, p]) => { const n = all.filter(l => l.st === 'todo' && lineInZone(l, p.bays)).length; return sx.row('phone', esc(who(d)), esc(zoneText(p.bays)), n ? tx('{n} to pull', { n }) : tx('All marked off'), n ? 'acc' : 'ok'); })), tx('the bays each phone covers')) +
    sx.acts([sx.btn('cage', tx('Send cage {n} down', { n: ses.cage }), 'data-act="lp-cage"', true), sx.btn('pin', tx('Change my bays'), 'data-act="lp-zones"'), sx.btn('phone', prefs().pullBuzz !== false ? tx('Buzz: on') : tx('Buzz: off'), 'data-act="lp-buzz"'), sx.btn('x', tx('Leave session'), 'data-act="lp-leave"')]));
  const tab = (id, label) => `<button class="${st.tab === id ? 'on' : ''}" data-act="lp-tab" data-tab="${id}" aria-pressed="${st.tab === id}">${label}</button>`;
  return `<div class="lp-body">${mhead(`${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)}`, `<i class="lp-live"></i>${tx('Your bays: {bays}', { bays: esc(zoneText(zone)) })}`)}` +
    `<div class="lp-tabs">${tab('todo', tx('To pull {n}', { n: todo }))}${tab('done', tx('Marked off {n}', { n: done }))}${tab('all', tx('All {n}', { n: mineL.length }))}</div>` +
    `<div class="seg lp-seg"><button class="${st.order === 'time' ? 'on' : ''}" data-act="lp-order" data-o="time">${tx('As they come in')}</button><button class="${st.order === 'bay' ? 'on' : ''}" data-act="lp-order" data-o="bay">${tx('By bay')}</button></div>` +
    (shown.length ? shown.map(line).join('') : empty(st.tab === 'todo' ? tx('Nothing to pull in your bays. New requests buzz this phone.') : tx('Nothing here yet.'), { sm: true, icon: st.tab === 'todo' ? 'check' : 'box' })) +
    (others.length && st.tab !== 'todo' ? `<div class="lp-ln done lp-others">${ic('phone')}<span class="lp-pn"><b>${tx('Other pullers’ bays')}</b><small>${txn(others.length, '{n} request', '{n} requests')} · ${oTodo ? tx('{n} waiting', { n: oTodo }) : tx('all marked off')}</small></span></div>` : '') +
    `</div>${st.short ? shortSheet(ctx, ses, repaint) : ''}${sheet}${strip('box', esc(zoneText(zone)), tx('cage {n} · {done} of {all} marked off', { n: ses.cage, done: cageDone, all: cageLines.length }), todo || '')}`;
}
// Short in the first bay: how many came from each.
function shortSheet(ctx, ses, repaint) {
  const l = ses.lines[st.short]; if (!l || l.st !== 'todo') { st.short = null; return ''; }
  const total = Object.values(st.got).reduce((a, b) => a + b, 0);
  return `<div class="sscan lp-over" role="dialog" aria-modal="true" aria-label="${tx('Short in the first bay')}"><div class="lp-shortcard">` +
    `<div class="lp-prod"><span class="lp-pic">${ic('box')}</span><span class="lp-pn"><b>${esc(nameOf(ctx, l, repaint))}</b><small><span class="mono">${esc(l.kc)}</span> · ${tx('asked for {n} at {time}', { n: l.qty, time: hm(l.at) })}</small></span></div>` +
    `<span class="lbl">${tx('How many from each bay?')}</span>` +
    l.bays.map(b => `<div class="lp-bayrow"><span class="lp-bay sm"><small>${tx('BAY')}</small><b class="mono">${esc(b)}</b></span><button class="btn" data-act="lp-g" data-bay="${esc(b)}" data-d="-1" aria-label="${tx('One fewer from {bay}', { bay: esc(b) })}">${ic('minus')}</button><b class="lp-gn" aria-live="polite">${st.got[b] || 0}</b><button class="btn" data-act="lp-g" data-bay="${esc(b)}" data-d="1" aria-label="${tx('One more from {bay}', { bay: esc(b) })}">${ic('plus')}</button></div>`).join('') +
    `<div class="lp-total"><span>${tx('Together')}</span><b>${tx('{got} of {asked}', { got: total, asked: l.qty })}</b></div>` +
    `<button class="mv-big${total >= l.qty ? ' ok' : ''}" data-act="lp-short-save"${total ? '' : ' disabled'}>${total >= l.qty ? tx('Pulled all {n}', { n: l.qty }) : tx('Pulled {got} of {asked} · short {n}', { got: total, asked: l.qty, n: l.qty - total })}</button>` +
    `<button class="btn lp-no" data-act="lp-gone" data-line="${esc(l.id)}">${ic('x')}${tx('Not in any bay')}</button><p class="lp-dim">${tx('The requester sees the answer straight away, with what came from each bay.')}</p><button class="mv-ghost" data-act="lp-short-close">${tx('Cancel')}</button></div></div>`;
}
// The cage being filled: what goes down, in the order asked (or by shelf).
function cage(ctx, ses, repaint) {
  const ready = liveLines(ses).filter(l => l.cage == null && l.st !== 'todo'), going = ready.filter(l => l.st !== 'gone'), gone = ready.filter(l => l.st === 'gone');
  if (ses.shelves) going.sort((a, b) => String(a.shelf || '~').localeCompare(String(b.shelf || '~'), 'en', { numeric: true }) || String(a.at).localeCompare(String(b.at)));
  else going.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const units = going.reduce((n, l) => n + gotOf(l), 0), short = going.filter(l => l.st === 'short').length, left = liveLines(ses).filter(l => l.st === 'todo').length;
  return `<div class="lp-body">${mhead(tx('Send cage {n} down', { n: ses.cage }), `${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)}`)}` +
    (going.length || gone.length ? `<div class="lp-sum"><div><b>${going.length}</b><span>${tx('lines')}</span></div><div><b>${units}</b><span>${tx('units')}</span></div><div><b class="${short ? 'warn' : ''}">${short}</b><span>${tx('short')}</span></div></div>` +
      `<div class="card lp-card"><span class="lbl">${ses.shelves ? tx('The requester’s copy, in shelf order') : tx('In the cage, in the order asked')}</span>${going.map(l => `<div class="lp-cr"><span><b>${esc(nameOf(ctx, l, repaint))}</b><small>${l.shelf ? esc(l.shelf) + ' · ' : ''}${esc(baysText(l))}</small></span>${l.st === 'short' ? `<span class="lp-pill warn">${tx('{got} of {asked}', { got: gotOf(l), asked: l.qty })}</span>` : `<b class="mono">× ${l.qty === 'all' && !l.got ? tx('all') : gotOf(l)}</b>`}</div>`).join('') || empty(tx('Nothing pulled for this cage yet.'), { sm: true, icon: 'cage' })}</div>` +
      (gone.length ? `<div class="lp-ans warn">${ic('x')}<span><b>${tx('Not coming')}</b>${gone.map(l => esc(nameOf(ctx, l, repaint))).join(', ')}</span></div>` : '') +
      `<label class="lp-fl" for="lp-tag">${tx('Cage tag (optional)')}</label><div class="lp-scan"><input class="ad-in mono" id="lp-tag" data-field="lp-tag" value="${esc(st.tag)}" autocomplete="off" placeholder="BSN1240417"><button type="button" class="lp-cam" data-act="lp-cam-tag" aria-label="${tx('Scan the cage tag')}">${ic('camera')}</button></div>` +
      `<button class="mv-big" data-act="lp-cage-send">${ic('cage')}${tx('Send cage {n} down', { n: ses.cage })}</button>` +
      (left ? `<p class="lp-dim">${txn(left, '{n} line still to pull starts cage {next}.', '{n} lines still to pull start cage {next}.', { next: ses.cage + 1 })}</p>` : '')
      : `<div class="card lp-card">${empty(`<b>${tx('Nothing marked off yet')}</b><br>${tx('Mark requests off, then send the cage down.')}`, { icon: 'cage' })}</div>`) +
    `<button class="mv-ghost" data-act="lp-home">${tx('Back')}</button></div>`;
}
// A session kept for the week: every line, and asking again for what did not come.
function past(ctx, ses, repaint) {
  const c = sessionCounts(ses), p = sessionPeople(ses), lines = liveLines(ses).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const again = lines.filter(l => l.st === 'short' || l.st === 'gone');
  return `<div class="lp-body">${mhead(`${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)}`, `${esc(fmtDay(ses.at))} ${hm(ses.at)}–${hm(ses.closedAt)}`)}` +
    `<p class="lp-dim">${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers')].join(' · ')}</p>` +
    `<div class="lp-sum four"><div><b>${c.asked}</b><span>${tx('asked')}</span></div><div><b class="ok">${c.pulled}</b><span>${tx('pulled')}</span></div><div><b class="warn">${c.short}</b><span>${tx('short')}</span></div><div><b class="bad">${c.gone}</b><span>${tx('not there')}</span></div></div>` +
    `<div class="mv-rows">${lines.map(l => { const [t, tone] = stateText(l); return `<div class="mv-row ${tone === 'ok' ? 'ok' : tone ? 'warn' : ''}"><span class="a">${hm(l.at)}</span><span class="b">${esc(nameOf(ctx, l, repaint))} · ${esc(qtyText(l))}<br><small class="mono">${esc(l.kc)} · ${esc(baysText(l))}</small></span><span class="c">${t}</span></div>`; }).join('')}</div>` +
    (again.length ? `<button class="mv-big" data-act="lp-again" data-sid="${esc(ses.id)}">${ic('refresh')}${txn(again.length, 'Ask again for the {n} that didn’t come', 'Ask again for the {n} that didn’t come')}</button>` : '') +
    `<button class="mv-ghost" data-act="lp-home">${tx('Back')}</button></div>`;
}

// ── PC: Backfill › Live pull ────────────────────────────────────────────
function desk(ctx) {
  const all = sessions(ctx), open = all.filter(s => !s.closedAt), earlier = all.filter(s => s.closedAt);
  const ses = (st.desk && pulls(ctx).sessions?.[st.desk]) || open[0] || earlier[0] || null;
  const repaint = () => ctx.rerender();
  // Each session as the Manifests list draws a manifest: in full on its own lines.
  const item = s => {
    const c = sessionCounts(s), p = sessionPeople(s), of = c.asked || 1, w = n => `${(n / of * 100).toFixed(1)}%`;
    const when = s.closedAt ? `${esc(fmtDay(s.at))} · ${hm(s.at)}–${hm(s.closedAt)}` : tx('since {time}', { time: hm(s.at) });
    const n = (cls, key, v) => `<span class="${cls}">${tx(key, { n: `<b>${v}</b>` })}</span>`;
    return `<button class="lp-dsl a2${ses?.id === s.id ? ' on' : ''}" data-act="lp-desk" data-sid="${esc(s.id)}">` +
      `<span class="lp-dsl-h">${s.dept ? dep(s.dept) : ''}<b>${esc(s.name)}</b>${s.closedAt ? '' : `<span class="lp-run"><i class="lp-live"></i>${tx('Running')}</span>`}<span class="lp-dsl-t">${when}</span></span>` +
      `<span class="lp-sbar" aria-hidden="true">${c.pulled ? `<i class="p" style="width:${w(c.pulled)}"></i>` : ''}${c.short ? `<i class="s" style="width:${w(c.short)}"></i>` : ''}${c.gone ? `<i class="g" style="width:${w(c.gone)}"></i>` : ''}</span>` +
      `<span class="lp-dsl-n">${n('p', '{n} pulled', c.pulled)}${n('w', '{n} waiting', c.todo)}${n('s', '{n} short', c.short)}${n('g', '{n} not there', c.gone)}<span class="of">${tx('of {n}', { n: `<b>${c.asked}</b>` })}</span></span>` +
      `<small>${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers')].join(' · ')}</small></button>`;
  };
  const hd = (label, list) => `<div class="lp-dhd"><b>${label}</b><span>${txn(list.length, '{n} session', '{n} sessions')}</span></div>`;
  const head = vh(tx('Live pull'), sub(tx('What the floor asked for and what the stockroom pulled'), tx('today’s sessions and the last 7 days')), '', 'packages');
  if (!ses) return head + `<div class="card">${empty(`<b>${tx('No sessions this week')}</b><br>${tx('Start one from a phone: Live pull is in More, on the Floor and in the Stockroom.')}`, { icon: 'packages' })}</div>`;
  const c = sessionCounts(ses), p = sessionPeople(ses), who = pullerNames(ctx, ses), lines = liveLines(ses);
  const groups = [...Object.entries(ses.cages || {}).map(([n, cg]) => [tx('Cage {n} · sent down {time} · {lines}', { n, time: hm(cg.at), lines: txn(cg.lines, '{n} line', '{n} lines') }) + (cg.tag ? ` · ${esc(cg.tag)}` : ''), lines.filter(l => l.cage === Number(n))]), [tx('Still to send · cage {n}', { n: ses.cage }), lines.filter(l => l.cage == null)]].filter(([, ls]) => ls.length);
  const zones = Object.entries(ses.people || {}).filter(([, x]) => x.part === 'pull').map(([d, x]) => `${who(d) === tx('This phone') ? tx('this PC') : who(d)} ${zoneText(x.bays)}`);
  return head + `<div class="lp-desk"><div class="card lp-dside">${hd(tx('Running now'), open)}${open.map(item).join('') || empty(tx('None'), { sm: true })}${hd(tx('Earlier · listed for 7 days'), earlier)}${earlier.map(item).join('') || empty(tx('None'), { sm: true })}</div>` +
    `<div class="card lp-dmain"><div class="lp-dh">${ses.dept ? dep(ses.dept) : ''}<h2>${esc(ses.name)}</h2>${ses.closedAt ? `<span class="chip">${tx('Ended {time}', { time: hm(ses.closedAt) })}</span>` : `<button class="btn sm" data-act="lp-end" data-sid="${esc(ses.id)}">${tx('End session')}</button>`}</div>` +
    `<p class="lbl">${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers') + (zones.length ? ` (${esc(zones.join('; '))})` : ''), tx('since {time}', { time: hm(ses.at) }), ses.shelves ? tx('shelf scan on') : tx('shelf scan off')].join(' · ')}</p>` +
    `<div class="lp-kpis"><div><b>${c.asked}</b><span>${tx('Asked')}</span></div><div><b class="ok">${c.pulled}</b><span>${tx('Pulled')}</span></div><div><b>${c.todo}</b><span>${tx('Waiting')}</span></div><div><b class="warn">${c.short}</b><span>${tx('Short')}</span></div><div><b class="bad">${c.gone}</b><span>${tx('Not there')}</span></div></div>` +
    (lines.length ? `<div class="mfx-scroll"><table class="wb-t lp-t"><thead><tr><th>${tx('Asked')}</th><th>${tx('Item')}</th><th>${tx('Keycode')}</th><th>${tx('Bays')}</th><th class="num">${tx('Asked')}</th><th class="num">${tx('Pulled')}</th><th>${tx('Puller')}</th><th>${tx('State')}</th></tr></thead><tbody>` +
      groups.map(([label, ls]) => `<tr class="lp-cg"><td colspan="8">${label}</td></tr>` + ls.sort((a, b) => String(a.at).localeCompare(String(b.at))).map(l => { const [t, tone] = stateText(l); return `<tr><td>${hm(l.at)}</td><td>${esc(nameOf(ctx, l, repaint))}${l.shelf ? ` <small class="lbl">${tx('for {shelf}', { shelf: esc(l.shelf) })}</small>` : ''}</td><td class="mono"><span data-kccard="${esc(l.kc)}">${esc(l.kc)}</span></td><td class="mono">${esc(l.got && Object.keys(l.got).length > 1 ? Object.entries(l.got).map(([b, n]) => `${b} (${n})`).join(' + ') : l.bays.join(', '))}${l.seen ? ' ' + seenTag(l, l.bays[0]) : ''}</td><td class="num">${esc(qtyText(l))}</td><td class="num">${l.st === 'todo' ? '–' : l.st === 'gone' ? 0 : l.qty === 'all' && !l.got ? tx('all') : gotOf(l)}</td><td>${esc(l.doneBy ? who(l.doneBy) || tx('another puller') : '')}</td><td><span class="lp-pill ${tone}">${t}</span></td></tr>`; }).join('')).join('') + `</tbody></table></div>` : empty(tx('Nothing asked for yet.'), { icon: 'box' })) + `</div></div>`;
}

// ── Actions ─────────────────────────────────────────────────────────────
function openCam(ctx, then) {
  openScanner({ title: tx('Scan an item'), hint: tx('The item, its ticket, or the keycode'), onCode: code => (then ? then(code) : find(ctx, code, true)) });
}
const SHELF = s => { const m = String(s).toUpperCase().replace(/[\s_.-]+/g, ' ').trim().match(/^([A-Z]+\s?\d+)\s?([SEP]\d)$/); return m ? `${m[1].replace(/\s/g, '')} ${m[2]}` : null; };
async function find(ctx, raw, viaCam = false) {
  const code = String(raw || '').trim(); if (!code) return;
  const j = joined(ctx);
  if (j?.ses.shelves && /[A-Za-z]/.test(code)) { const s = SHELF(code); if (s) { st.shelf = s; haptic('tap'); ctx.rerender(); if (viaCam) setTimeout(() => openCam(ctx), 300); return; } }
  // A keycode typed for a barcode nothing knew is kept as its match (pull.pair), so its next scan is instant.
  const linkFor = st.find?.state === 'manual' && isKeycode(code) ? st.find.gtin : null;
  st.sent = null; st.ack = false; st.seenOk = false; st.change = null; st.qty = ''; st.viaCam = viaCam;
  // A recalled or withdrawn product stops here, from the list every device
  // holds: no report, link or network needed.
  const pre = recallFor(ctx.store, code);
  if (pre) {
    const kc = pre.kcs.includes(code) ? code : pre.kcs.length === 1 ? pre.kcs[0] : '';
    st.find = { state: 'recalled', code, kc, name: pre.title }; haptic('error'); ctx.rerender();
    if (kc) ctx.catalogue.lookup(kc).then(it => { if (it && st.find?.state === 'recalled' && st.find.code === code) { Object.assign(st.find, { name: it.name || pre.title, img: it.img || '', price: it.price }); ctx.rerender(); } }).catch(() => {});
    return;
  }
  st.find = { state: 'busy', code }; ctx.rerender();
  try {
    const r = await ctx.api(`/v1/store/${ctx.storeNo}/pull/find?code=${encodeURIComponent(code)}`);
    // A barcode nothing in the store knows: searched in the background
    // (the tray under the scan box), and the next item can be scanned now.
    if (r.report && r.gtin && !r.kc) { searchBehind(ctx, r); st.find = null; haptic('warning'); ctx.rerender(); if (viaCam) setTimeout(() => openCam(ctx), 350); return; }
    // The words come with the answer: its product name, else its description
    // (from the inventory reports), else the keycode shows alone.
    st.find = { ...r, name: r.name || r.desc || '', state: r.bays?.length ? 'found' : r.seen?.length ? 'seen' : r.report ? 'none' : 'noreport', code };
    if (r.gtin && r.kc) behind.delete(r.gtin);   // known now: its row leaves the tray
    haptic(recallFor(ctx.store, r.kc) ? 'error' : st.find.state === 'found' ? 'success' : 'warning');
    if (linkFor && r.kc) pair(ctx, linkFor, r.kc);
    // The answer shows now; the picture and price follow when they land.
    if (r.kc) ctx.catalogue.lookup(r.kc).then(it => { if (it && st.find?.code === code) { Object.assign(st.find, { name: it.name || st.find.name || '', img: it.img || '', price: it.price }); ctx.rerender(); } }).catch(() => {});
  } catch (e) { st.find = { state: 'error', code, message: e.message }; haptic('error'); }
  ctx.rerender();
}
// A barcode matched to its keycode by a person (a search's answer tapped, or
// the keycode typed): kept for the store (pull.pair), so the next scan of it
// finds the item at once. A newer match replaces it ("Wrong item?").
function pair(ctx, gtin, kc) { send(ctx, 'pull.pair', { apn: gtin }, { keycode: kc }).catch?.(() => {}); }
// Barcodes being searched on kmart.com.au while the requester scans on:
// gtin → { gtin, state: searching | found | choose | none | failed, kc, name, img, list, source, report }.
const behind = new Map();
function searchBehind(ctx, f) {
  const g = f.gtin, was = behind.get(g); if (was && was.state !== 'failed') return;
  const b = { gtin: g, state: 'searching', report: f.report }; behind.set(g, b);
  searchBarcode(ctx, g, () => ctx.rerender()).then(res => {
    if (behind.get(g) !== b) return;
    if (res.kc) Object.assign(b, { state: 'found', kc: res.kc });
    else if (res.list) Object.assign(b, { state: 'choose', list: res.list, source: res.source });
    else Object.assign(b, { state: res.why === 'failed' ? 'failed' : 'none' });
    if (b.kc) ctx.catalogue.lookup(b.kc).then(it => { if (it) { Object.assign(b, { name: it.name || '', img: it.img || '' }); ctx.rerender(); } }).catch(() => {});
    haptic(b.state === 'found' ? 'success' : 'warning'); ctx.rerender();
  });
}
// The tray: each background search, newest first, with what to do next.
function behindTray() {
  const list = [...behind.values()].reverse().slice(0, 6); if (!list.length) return '';
  const row = b => {
    const what = b.state === 'searching' ? `<span class="lp-bgs">${tx('Searching kmart.com.au…')}</span>`
      : b.state === 'found' ? `<b>${esc(b.name || b.kc)}</b><small class="mono">${esc(b.kc)}</small>`
      : b.state === 'choose' ? `<b>${tx('Is this it?')}</b><small>${txn(b.list.length, '{n} possible item', '{n} possible items')}</small>`
      : `<b>${b.state === 'failed' ? tx('Couldn’t search kmart.com.au') : tx('Not found on kmart.com.au')}</b><small>${tx('Type its keycode in the box above, from the ticket, shelf label or carton.')}</small>`;
    const act = b.state === 'found' ? `<button class="btn primary sm" data-act="lp-bg-ask" data-g="${esc(b.gtin)}">${tx('Ask for it')}</button>`
      : b.state === 'searching' ? '' : `<button class="btn sm" data-act="lp-bg-open" data-g="${esc(b.gtin)}">${b.state === 'choose' ? tx('Pick') : tx('Type it')}</button>`;
    return `<div class="lp-bgr ${b.state}"><span class="lp-pic sm">${b.state === 'searching' ? ic('search') : productImg(b.img) || ic('barcode')}</span><span class="lp-pn">${what}<small class="mono">${tx('Barcode {code}', { code: esc(b.gtin) })}</small></span>${act}<button class="ibtn" data-act="lp-bg-x" data-g="${esc(b.gtin)}" aria-label="${tx('Dismiss')}">${ic('x')}</button></div>`;
  };
  return `<div class="card lp-bg"><div class="lp-bgh">${ic('search')}<b>${tx('Barcodes being looked up')}</b><small>${tx('Keep scanning: each one lands here when kmart.com.au answers.')}</small></div>${list.map(row).join('')}</div>`;
}
// The keycode the search found, or the one tapped: found as if it were typed.
async function pick(ctx, kc, gtin) {
  await find(ctx, kc, st.viaCam);
  if (st.find?.code === kc && st.find.state !== 'error') { Object.assign(st.find, { gtin, via: 'web' }); ctx.rerender(); pair(ctx, gtin, kc); }
}
// Nothing found (or the wrong item): the keycode printed on the ticket goes in the scan box.
function typeIt(ctx, gtin, report, why) {
  st.find = { state: 'manual', code: gtin, gtin, report, why }; st.qty = '';
  haptic('warning'); ctx.rerender();
  setTimeout(() => { const i = document.querySelector('[data-field="lp-code"]'); if (i) { i.value = ''; i.focus(); } }, 40);
}
async function sendRequest(ctx, ses) {
  const f = st.find; if ((f?.state !== 'found' && f?.state !== 'seen') || !st.qty) return;
  const seen = f.state === 'seen' ? f.seen : null;
  if (recallFor(ctx.store, f.kc)) return toast(tx('This product is recalled: it can’t be asked for'), 'bad');
  const all = st.qty === 'ALL', qty = all ? undefined : Number(st.qty), q = all ? { all: true } : { qty };
  const ok = st.change ? await send(ctx, 'pull.update', { session: ses.id, line: st.change }, q)
    : await send(ctx, 'pull.request', { session: ses.id, line: ulid() }, { kc: f.kc, bays: seen ? seen.map(x => x.bay) : f.bays, ...(seen ? { seen } : {}), ...q, ...(f.carton ? { carton: f.carton } : {}), ...(f.name ? { name: String(f.name).slice(0, 80) } : {}), ...(ses.shelves && st.shelf ? { shelf: st.shelf } : {}) });
  if (!ok) return;
  st.sent = { name: f.name || f.kc, qty: all ? tx('all there is') : qty, change: !!st.change };
  Object.assign(st, { find: null, qty: '', change: null, ack: false, seenOk: false });
  haptic('success'); ctx.rerender();
  if (st.viaCam) setTimeout(() => openCam(ctx), 350);
}
async function join(ctx, sid, part) {
  const ses = pulls(ctx).sessions?.[sid]; if (!ses) return;
  if (part === 'pull') {
    if (!hasArea(ctx.session, 'stockroom') && !(await ensureArea({ session: ctx.session, frame: document.querySelector('.frame'), area: 'stockroom' }))) return;
    setMine(ctx, { sid, part }); st.zone = null; st.screen = 'zones'; ctx.rerender(); return;
  }
  if (ses.people?.[ctx.session.device]?.part !== 'req' && !(await send(ctx, 'pull.join', { session: sid }))) return;
  setMine(ctx, { sid, part }); st.screen = null; st.find = null; st.sent = null; ctx.rerender();
}

export default {
  id: 'livepull', title: tx('Live pull'), icon: 'packages',
  desktop(ctx) { return desk(ctx); },
  mobile(ctx) {
    const repaint = () => ctx.rerender(), j = joined(ctx);
    if (st.screen === 'new') return newForm(ctx);
    if (st.screen === 'past') { const s = pulls(ctx).sessions?.[st.past]; if (s) return past(ctx, s, repaint); st.screen = null; }
    if (j && st.screen === 'zones') return zones(ctx, j.ses);
    if (j && st.screen === 'cage') return cage(ctx, j.ses, repaint);
    if (j?.part === 'pull' && j.ses.people?.[ctx.session.device]?.part !== 'pull') return zones(ctx, j.ses);
    if (j) return j.part === 'pull' ? puller(ctx, j.ses, repaint) : requester(ctx, j.ses, repaint);
    st.screen = null; return home(ctx);
  },
  mount(ctx, root) {
    root.classList.toggle('sheet-open', ctx.isMobile && st.sheet && !!root.querySelector(':scope > .mv-strip'));
    const go = screen => { st.screen = screen; st.sheet = false; ctx.rerender(); };
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
      const act = a.dataset.act, j = joined(ctx), ses = j?.ses;
      if (act === 'lp-sheet') { st.sheet = !st.sheet; root.classList.toggle('sheet-open', st.sheet); a.setAttribute('aria-expanded', String(st.sheet)); haptic('tap'); return; }
      if (act === 'lp-home') { if (st.screen === 'zones' && ses && ses.people?.[ctx.session.device]?.part !== 'pull') setMine(ctx, null); return go(null); }
      if (act === 'lp-new') { st.form = null; return go('new'); }
      if (act === 'lp-past') { st.past = a.dataset.sid; return go('past'); }
      if (act === 'lp-join') return join(ctx, a.dataset.sid, a.dataset.part);
      if (act === 'lp-desk') { st.desk = a.dataset.sid; return ctx.rerender(); }
      // Start a session
      if (act === 'lp-dept') { st.form.dept = st.form.dept === a.dataset.dept ? '' : a.dataset.dept; if (!st.form.name && st.form.dept) st.form.name = DEPT_NAME[st.form.dept] || ''; return ctx.rerender(); }
      if (act === 'lp-part') { st.form.part = a.dataset.part; return ctx.rerender(); }
      if (act === 'lp-shelves') { st.form.shelves = !st.form.shelves; return ctx.rerender(); }
      if (act === 'lp-start') {
        const f = st.form, name = f.name.trim() || DEPT_NAME[f.dept] || tx('Live pull');
        if (f.part === 'pull' && !hasArea(ctx.session, 'stockroom') && !(await ensureArea({ session: ctx.session, frame: document.querySelector('.frame'), area: 'stockroom' }))) return;
        const sid = ulid();
        if (!(await send(ctx, 'pull.session.start', { session: sid }, { name, dept: f.dept, part: f.part, shelves: f.shelves }))) return;
        setMine(ctx, { sid, part: f.part }); st.zone = null; st.find = null; st.sent = null; st.shelf = '';
        return go(f.part === 'pull' ? 'zones' : null);
      }
      // A puller's bays and alerts
      if (act === 'lp-zone') { const z = a.dataset.z; if (st.zone.has(z)) st.zone.delete(z); else { if (z === 'all') st.zone.clear(); else st.zone.delete('all'); st.zone.add(z); } return ctx.rerender(); }
      if (act === 'lp-addrange') {
        const from = root.querySelector('[data-field="lp-from"]')?.value.replace(/\D/g, ''), to = root.querySelector('[data-field="lp-to"]')?.value.replace(/\D/g, '');
        if (!from) return toast(tx('Type the first bay of the range'), 'bad');
        st.zone.delete('all'); st.zone.add(to && to !== from ? `${Math.min(from, to)}-${Math.max(from, to)}` : from); return ctx.rerender();
      }
      if (act === 'lp-zones-go') { if (!ses) return go(null); if (!(await send(ctx, 'pull.zone.set', { session: ses.id }, { bays: [...st.zone] }))) return; setMine(ctx, { sid: ses.id, part: 'pull' }); st.tab = 'todo'; return go(null); }
      if (act === 'lp-zones') { st.zone = null; return go('zones'); }
      if (act === 'lp-buzz') { setPref('pullBuzz', prefs().pullBuzz === false); if (prefs().pullBuzz !== false) haptic('success'); return ctx.rerender(); }
      if (act === 'lp-abuzz') { setPref('pullAnswerBuzz', prefs().pullAnswerBuzz === false); if (prefs().pullAnswerBuzz !== false) haptic('success'); return ctx.rerender(); }
      if (act === 'lp-sound') { setPref('pullSound', !prefs().pullSound); if (prefs().pullSound) beep(); return ctx.rerender(); }
      // Leaving and ending
      if (act === 'lp-leave') { setMine(ctx, null); return go(null); }
      if (act === 'lp-end') { const sid = a.dataset.sid || ses?.id; if (!sid || !await ask({ title: tx('End this session?'), text: tx('Its list stays for the week, but no more requests can be sent.'), ok: tx('End session'), cancel: tx('Keep it open') })) return; if (await send(ctx, 'pull.session.end', { session: sid })) { if (ses?.id === sid) setMine(ctx, null); go(null); } return; }
      // The requester
      if (act === 'lp-cam') return openCam(ctx);
      if (act === 'lp-cam-shelf') return openCam(ctx, code => { const s = SHELF(code); if (s) { st.shelf = s; ctx.rerender(); } else toast(tx('That isn’t a shelf label (like A16 S1)'), 'bad'); });
      if (act === 'lp-key') { const k = a.dataset.k; st.qty = k === 'del' ? (st.qty === 'ALL' ? '' : st.qty.slice(0, -1)) : ((st.qty === 'ALL' ? '' : st.qty) + k).replace(/^0+/, '').slice(0, 3); haptic('tap'); return ctx.rerender(); }
      if (act === 'lp-carton') { st.qty = String((st.qty === 'ALL' ? 0 : Number(st.qty) || 0) + (st.find?.carton || 0)).slice(0, 3); haptic('tap'); return ctx.rerender(); }
      if (act === 'lp-allthere') { st.qty = st.qty === 'ALL' ? '' : 'ALL'; haptic('tap'); return ctx.rerender(); }
      if (act === 'lp-send') return ses && sendRequest(ctx, ses);
      if (act === 'lp-clear') { st.find = null; return ctx.rerender(); }
      if (act === 'bc-pick') { const f = st.find; if (f?.gtin) return pick(ctx, a.dataset.kc, f.gtin); return; }
      if (act === 'bc-type') { const f = st.find; if (f?.gtin) typeIt(ctx, f.gtin, f.report, 'pick'); return; }
      if (act === 'lp-wrong') { typeIt(ctx, a.dataset.gtin, st.find?.report, 'wrong'); return; }
      if (act === 'bc-again') { const f = st.find; if (f?.gtin) { searchBehind(ctx, f); st.find = null; ctx.rerender(); } return; }
      if (act === 'lp-bg-ask') { const b = behind.get(a.dataset.g); if (b?.kc) { behind.delete(b.gtin); return pick(ctx, b.kc, b.gtin); } return; }
      if (act === 'lp-bg-open') { const b = behind.get(a.dataset.g); if (!b) return; behind.delete(b.gtin); st.find = b.state === 'choose' ? { state: 'choose', code: b.gtin, gtin: b.gtin, report: b.report, list: b.list, source: b.source } : { state: 'manual', code: b.gtin, gtin: b.gtin, report: b.report, why: b.state === 'failed' ? 'failed' : 'none' }; st.qty = ''; ctx.rerender(); if (st.find.state === 'manual') setTimeout(() => document.querySelector('[data-field="lp-code"]')?.focus(), 40); return; }
      if (act === 'lp-bg-x') { behind.delete(a.dataset.g); return ctx.rerender(); }
      if (act === 'lp-ack') { st.ack = true; return ctx.rerender(); }
      if (act === 'lp-seen-ok') { st.seenOk = true; return ctx.rerender(); }
      if (act === 'lp-dup-add') { const l = ses?.lines[a.dataset.line]; if (!l || l.qty === 'all') return; if (await send(ctx, 'pull.update', { session: ses.id, line: l.id }, { qty: Math.min(999, l.qty + (l.carton || l.qty)) })) { st.sent = { name: l.name || l.kc, qty: Math.min(999, l.qty + (l.carton || l.qty)), change: true }; st.find = null; haptic('success'); ctx.rerender(); } return; }
      if (act === 'lp-dup-change') { st.change = a.dataset.line; st.ack = true; st.qty = ''; return ctx.rerender(); }
      // The puller
      if (act === 'lp-tab') { st.tab = a.dataset.tab; return ctx.rerender(); }
      if (act === 'lp-order') { st.order = a.dataset.o; return ctx.rerender(); }
      if (act === 'lp-pulled') { const l = ses?.lines[a.dataset.line]; if (!l) return; if (await send(ctx, 'pull.mark', { session: ses.id, line: l.id }, l.qty === 'all' ? { st: 'pulled' } : { st: 'pulled', got: { [a.dataset.bay]: l.qty } })) haptic('success'); return; }
      if (act === 'lp-gone') { const id = a.dataset.line; if (ses && (await send(ctx, 'pull.mark', { session: ses.id, line: id }, { st: 'gone' }))) { st.short = null; haptic('warning'); ctx.rerender(); } return; }
      if (act === 'lp-undo') { if (ses) await send(ctx, 'pull.mark', { session: ses.id, line: a.dataset.line }, { st: 'todo' }); return; }
      if (act === 'lp-short') { const l = ses?.lines[a.dataset.line]; if (!l) return; st.short = l.id; st.got = Object.fromEntries(l.bays.map(b => [b, 0])); return ctx.rerender(); }
      if (act === 'lp-g') { const b = a.dataset.bay, l = ses?.lines[st.short]; if (!l) return; st.got[b] = Math.max(0, Math.min(l.qty, (st.got[b] || 0) + Number(a.dataset.d))); haptic('tap'); return ctx.rerender(); }
      if (act === 'lp-short-close') { st.short = null; return ctx.rerender(); }
      if (act === 'lp-short-save') {
        const l = ses?.lines[st.short]; if (!l) return;
        const got = Object.fromEntries(Object.entries(st.got).filter(([, n]) => n > 0)), total = Object.values(got).reduce((x, y) => x + y, 0);
        if (await send(ctx, 'pull.mark', { session: ses.id, line: l.id }, { st: total >= l.qty ? 'pulled' : 'short', got })) { st.short = null; haptic('success'); ctx.rerender(); }
        return;
      }
      if (act === 'lp-cage') { st.tag = ''; return go('cage'); }
      if (act === 'lp-cam-tag') return openCam(ctx, code => { st.tag = String(code).trim().toUpperCase().slice(0, 20); ctx.rerender(); });
      if (act === 'lp-cage-send') {
        if (!ses) return; const tag = (root.querySelector('[data-field="lp-tag"]')?.value || '').trim();
        const n = ses.cage;
        if (await send(ctx, 'pull.cage.send', { session: ses.id }, { cage: n, ...(tag ? { tag } : {}) })) { toast(tx('Cage {n} is on its way down', { n })); haptic('success'); st.tag = ''; go(null); }
        return;
      }
      if (act === 'lp-again') {
        const old = pulls(ctx).sessions?.[a.dataset.sid]; if (!old) return;
        const sid = ulid(), lines = liveLines(old).filter(l => l.st === 'short' || l.st === 'gone');
        if (!(await send(ctx, 'pull.session.start', { session: sid }, { name: tx('{name} (again)', { name: old.name }).slice(0, 60), dept: old.dept, part: 'req', shelves: old.shelves }))) return;
        for (const l of lines) { const left = l.qty === 'all' ? null : l.st === 'short' ? l.qty - gotOf(l) : l.qty; await send(ctx, 'pull.request', { session: sid, line: ulid() }, { kc: l.kc, bays: l.bays, ...(left ? { qty: left } : { all: true }), ...(l.carton ? { carton: l.carton } : {}), ...(l.name ? { name: l.name } : {}), ...(l.shelf ? { shelf: l.shelf } : {}) }); }
        setMine(ctx, { sid, part: 'req' }); toast(txn(lines.length, 'Asked again for {n} item', 'Asked again for {n} items')); return go(null);
      }
    });
    // Typing: the session name, and a keycode (or a wedge scanner) with Enter.
    root.addEventListener('input', e => { if (e.target.matches('[data-field="lp-name"]') && st.form) st.form.name = e.target.value; if (e.target.matches('[data-field="lp-tag"]')) st.tag = e.target.value; });
    root.addEventListener('submit', e => {
      if (!e.target.matches('[data-form="lp-find"]')) return; e.preventDefault(); const i = e.target.querySelector('[data-field="lp-code"]'); const v = i.value; i.value = ''; find(ctx, v, false);
    });
    // A number typed on a keyboard works the pad too.
    const onKey = e => {
      if (!ctx.isMobile || e.target.closest?.('input, textarea')) return;
      if (/^\d$/.test(e.key) && st.find?.state === 'found') { st.qty = ((st.qty === 'ALL' ? '' : st.qty) + e.key).replace(/^0+/, '').slice(0, 3); ctx.rerender(); }
      else if (e.key === 'Backspace' && st.qty) { st.qty = st.qty === 'ALL' ? '' : st.qty.slice(0, -1); ctx.rerender(); }
      else if (e.key === 'Enter' && st.qty) { const j = joined(ctx); if (j) sendRequest(ctx, j.ses); }
    };
    document.addEventListener('keydown', onKey);
    return [() => document.removeEventListener('keydown', onKey), ctx.store.on('pulls', () => ctx.rerender()), ctx.store.on('settings', () => { if (st.screen === 'zones') ctx.rerender(); })];
  },
};

// ── New requests buzz a puller's phone (installed by the shell) ─────────
let audio = null;
function beep() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(); o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.4);
  } catch {}
}
// The requester hears back too (the review board's imp-pullnote): when a line
// this phone asked for is pulled, short or not there, it buzzes (unless
// turned off), plays the sound if that is on, and says so, so nobody waits
// at the shelf for something that isn't coming.
const answerText = l => l.st === 'pulled' ? tx('{name}: pulled {n}', { name: l.name || l.kc, n: l.qty === 'all' && !l.got ? tx('all there is') : gotOf(l) })
  : l.st === 'short' ? tx('{name}: short, {got} of {asked} found', { name: l.name || l.kc, got: gotOf(l), asked: l.qty })
  : tx('{name}: not there', { name: l.name || l.kc });
export function installPullAlerts({ store, session, storeNo, isOpen, open }) {
  const seen = new Set(), was = new Map(), key = MINE(storeNo);
  const mineNow = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const scan = (first = false) => {
    const m = mineNow(), all = store.get('pulls')?.sessions || {};
    for (const ses of Object.values(all)) for (const l of Object.values(ses.lines || {})) {
      const prev = was.get(l.id); was.set(l.id, l.st);
      if (!first && prev === 'todo' && ['pulled', 'short', 'gone'].includes(l.st) && l.by === session.device && m?.sid === ses.id && m?.part === 'req') {
        if (prefs().pullAnswerBuzz !== false) { try { navigator.vibrate?.(l.st === 'pulled' ? [80] : [120, 60, 120, 60, 120]); } catch {} }
        if (prefs().pullSound) beep();
        toast(answerText(l), l.st === 'pulled' ? '' : l.st === 'short' ? 'warn' : 'bad', isOpen() ? null : { label: tx('Open'), run: open }, 'pull-answer');
      }
      if (seen.has(l.id)) continue; seen.add(l.id);
      if (first || m?.part !== 'pull' || m.sid !== ses.id || l.st !== 'todo' || l.by === session.device) continue;
      const zone = ses.people?.[session.device]?.bays || ['all'];
      if (!(lineInZone(l, zone) || l.bays.every(b => uncovered(ses, b)))) continue;
      if (prefs().pullBuzz !== false) { try { navigator.vibrate?.([120, 60, 120]); } catch {} }
      if (prefs().pullSound) beep();
      if (!isOpen()) toast(tx('New pull request: {name} × {qty} · bay {bay}', { name: l.name || l.kc, qty: l.qty === 'all' ? tx('all there is') : l.qty, bay: l.bays.find(b => inZone(b, zone)) || l.bays[0] }), '', { label: tx('Open'), run: open }, 'pull');
    }
  };
  scan(true);
  return store.on('pulls', () => scan());
}
