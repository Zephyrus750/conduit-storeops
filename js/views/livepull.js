// Live pull (24 Oct 2026): the floor asks the stockroom for stock, item by
// item, and the stockroom pulls it straight away. A session is one
// department's run. The requester scans an item, its ticket or a keycode on
// the floor (the worker's /pull/find answers from the latest inventory
// report: the item's stockroom bays, carton size, today's truck) and sends
// how many; each puller sees the requests for the bays their phone picked,
// marks them off (pulled, short from one bay and the rest from the next, or
// not there) and sends the cage down. Only items with a stockroom location
// can be asked for. What was pulled shows to anyone who scans the item again
// that day. Sessions stay listed for a week (shared/reducers/pull.js).
//
// Screens on the phone: home (sessions), new, the requester's scan and pad,
// the puller's bays, the puller's list, the cage. Both lists end in a strip
// above the tabs that opens the session's details, as the map modes do. On a
// PC it is a tab under Backfill: every line of today's sessions and the
// week's. A new request in a puller's bays buzzes the phone wherever it is
// in the app (installPullAlerts, from the shell).

import { recallFor, recallFlag, recallTagFor } from '../recallflag.js';
import { ic, esc, vh, sub, toast, dep, DEPTS_DEFAULT, DEPT_NAME, today } from '../ui.js';
import { hasArea, ensureArea } from '../unlock.js';
import { openScanner } from '../scan.js';
import { sx } from '../map.js';
import { haptic } from '../device.js';
import { prefs, setPref } from '../prefs.js';
import { fmtHM } from './backdock/common.js';
import { ulid } from '../../shared/ulid.js';
import { settingsOf } from '../../shared/reducers/store.js';
import { sessionCounts, sessionPeople, inZone, lineInZone, uncovered, pulledToday, gotOf } from '../../shared/reducers/pull.js';
import { tx, txn } from '../i18n.js';

// screen: null (the session this phone is in, or home) | new | zones | cage | past
// find: the last scan's answer { state: busy | found | none | noreport | error, code, kc, bays, soh, carton, truck, name, img }
const st = { screen: null, past: null, desk: null, find: null, qty: '', ack: false, change: null, sent: null, viaCam: false, shelf: '', tab: 'todo', order: 'time', sheet: false, short: null, got: {}, form: null, zone: null, tag: '' };
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

// Names come with the request (the requester's catalogue); a line without
// one asks this device's catalogue once.
function nameOf(ctx, l, repaint) {
  if (l.name) return l.name;
  if (names.has(l.kc)) return names.get(l.kc) || l.kc;
  if (!asking.has(l.kc)) { asking.add(l.kc); ctx.catalogue.lookup(l.kc).then(it => { names.set(l.kc, it?.name || null); repaint(); }).catch(() => names.set(l.kc, null)); }
  return l.kc;
}
const qtyText = l => (l.qty === 'all' ? tx('all there is') : l.carton && l.qty % l.carton === 0 ? `${l.qty} · ${txn(l.qty / l.carton, '{n} carton', '{n} cartons')}` : String(l.qty));
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
  return `<div class="lp-body">` + `<div class="mv-head"><div><h2>${tx('Live pull')}</h2><span>${tx('Ask the stockroom for stock from the floor')}</span></div></div>` +
    (open.length ? `<div class="card lp-card"><span class="lbl">${txn(open.length, 'Running now · {n}', 'Running now · {n}')}</span>${open.map(row).join('')}</div>` : `<div class="card lp-card"><b>${tx('No session is running')}</b><p class="lp-dim">${tx('Start one for your department: one person scans on the floor, the others pull in the stockroom.')}</p></div>`) +
    `<button class="mv-big" data-act="lp-new">${ic('plus')}${tx('Start a session')}</button>` +
    (past.length ? `<div class="card lp-card"><span class="lbl">${tx('Earlier · listed for 7 days')}</span>${past.map(s => `<button class="lp-hist" data-act="lp-past" data-sid="${esc(s.id)}">${s.dept ? dep(s.dept) : ''}<span><b>${esc(s.name)}</b><small>${esc(new Date(s.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${countsLine(sessionCounts(s))}</small></span>${ic('arrow')}</button>`).join('')}</div>` : '') +
    `<p class="lp-dim">${tx('Each session keeps its own list, so two departments can work at the same time.')}</p></div>`;
}

// ── Start a session ─────────────────────────────────────────────────────
function newForm(ctx) {
  const f = (st.form ||= { name: '', dept: '', part: 'req', shelves: false });
  const coded = DEPTS_DEFAULT.filter(d => ['home', 'clothing', 'kids'].includes(d.group));
  return `<div class="lp-body"><div class="mv-head"><div><h2>${tx('Start a session')}</h2><span>${tx('Live pull · listed for 7 days')}</span></div></div>` +
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
  return `<div class="lp-body"><div class="mv-head"><div><h2>${tx('Your bays')}</h2><span>${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)} · ${tx('puller')}</span></div></div>` +
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
  const head = `<div class="lp-top">${ses.dept ? dep(ses.dept) : ''}<div><b>${esc(ses.name)}</b><span><i class="lp-live"></i>${p.pull ? txn(p.pull, '{n} puller in the stockroom', '{n} pullers in the stockroom') : tx('No puller has joined yet')}</span></div></div>`;
  const scan = `<form class="lp-scan" data-form="lp-find"><input class="ad-in mono" data-field="lp-code" inputmode="numeric" autocomplete="off" enterkeyhint="search" placeholder="${tx('Scan or type a keycode')}" aria-label="${tx('Keycode or barcode')}"><button type="button" class="lp-cam" data-act="lp-cam" aria-label="${tx('Scan with the camera')}">${ic('camera')}</button></form>` +
    (ses.shelves ? `<button class="lp-shelf" data-act="lp-cam-shelf">${ic('pin')}${st.shelf ? tx('For shelf {shelf}', { shelf: `<b>${esc(st.shelf)}</b>` }) : tx('Scan the shelf you are filling')}</button>` : '');
  const dup = f?.state === 'found' ? liveLines(ses).find(l => l.kc === f.kc && l.st === 'todo') : null;
  // A recalled or withdrawn product is never asked for: the flag says where it goes instead.
  const rec = f && (f.state === 'found' || f.state === 'none' || f.state === 'recalled') ? recallFor(ctx.store, f.kc) || recallFor(ctx.store, f.gtin) || recallFor(ctx.store, f.code) : null;
  const card = rec ? productRow(f) + recallFlag(ctx.store, rec, f.kc || '') : !f ? (st.sent ? `<div class="lp-sent" role="status">${ic('check')}<span><b>${st.sent.change ? tx('Changed: {name} × {qty}', { name: esc(st.sent.name), qty: esc(st.sent.qty) }) : tx('Sent: {name} × {qty}', { name: esc(st.sent.name), qty: esc(st.sent.qty) })}</b><small>${tx('On the pullers’ phones now. Scan the next item.')}</small></span></div>` : `<div class="card lp-card lp-hint">${ic('barcode')}<p>${tx('Scan an item, its ticket, or type the keycode. Only items with a stockroom location can be asked for.')}</p></div>`)
    : f.state === 'busy' ? `<div class="card lp-card lp-hint">${ic('clock')}<p>${tx('Looking it up…')}</p></div>`
    : f.state === 'error' ? `<div class="lp-ans bad">${ic('alert')}<span><b>${tx('Couldn’t look it up')}</b>${esc(f.message || '')}</span></div>`
    : f.state === 'searching' ? `<div class="card lp-card lp-hint">${ic('search')}<p>${tx('Looking it up on kmart.com.au…')}</p><button type="button" class="lp-a" data-act="lp-type">${tx('Type the keycode instead')}</button></div>`
    : f.state === 'choose' ? `<div class="lp-ans info">${ic('search')}<span><b>${tx('Is this it?')}</b>${f.source === 'isbn' ? tx('Matched by the book’s title. Tap the one on the ticket.') : tx('Found on kmart.com.au from the barcode. Tap the item on the ticket.')}</span></div>` +
      `<div class="lp-picks">${f.list.map(c => `<button type="button" class="card lp-prod lp-pick" data-act="lp-pick" data-kc="${esc(c.kc)}"><span class="lp-pic">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ic('box')}</span><span class="lp-pn"><b>${esc(c.name || c.kc)}</b><small class="mono">${esc(c.kc)}</small></span>${ic('arrow')}</button>`).join('')}</div>` +
      `<button type="button" class="lp-a lp-none" data-act="lp-type">${tx('None of these: type the keycode')}</button>`
    : f.state === 'unlinked' ? `<div class="lp-ans warn">${ic('barcode')}<span><b>${f.relink ? tx('Link this barcode again') : tx('This barcode isn’t linked to a keycode yet')}</b>${f.tried ? tx('{kc} isn’t in the catalogue or the latest report. Check the keycode on the ticket.', { kc: `<span class="mono">${esc(f.tried)}</span>` }) : f.relink ? tx('Type the keycode printed on the ticket. It replaces the old link on every phone.') : f.searched ? tx('Kmart’s website doesn’t list it. Type the keycode printed on the ticket once, and every phone finds it from then on.') : tx('Clearance tickets carry the item’s own barcode. Type the keycode printed on the ticket once, and every phone finds it from then on.')}</span></div>` +
      `<form class="lp-scan lp-link" data-form="lp-link" data-gtin="${esc(f.gtin)}"><input class="ad-in mono" data-field="lp-linkkc" inputmode="numeric" autocomplete="off" enterkeyhint="go" maxlength="8" placeholder="${tx('Keycode on the ticket')}" aria-label="${tx('Keycode on the ticket')}"><button class="btn primary" type="submit">${tx('Find')}</button></form>` +
      `<p class="lp-gtin">${tx('Barcode {code}', { code: `<span class="mono">${esc(f.gtin)}</span>` })}</p>`
    : f.state === 'recalled' ? productRow(f)   // closed since the scan: nothing more to say
    : f.state === 'noreport' ? `<div class="lp-ans warn">${ic('alert')}<span><b>${tx('No inventory report yet')}</b>${tx('Live pull reads the stockroom bays from the morning inventory report. Paste it in Reports & files first.')}</span></div>`
    : f.state === 'none' ? productRow(f) + `<div class="lp-ans warn">${ic('x')}<span><b>${tx('No stockroom location')}</b>${f.report?.date && f.report.date !== day ? tx('The latest report ({date}) has no stockroom bay for it, so it isn’t added to the list.', { date: esc(f.report.date) }) : tx('This morning’s report has no stockroom bay for it, so it isn’t added to the list.')}</span></div>`
    : productRow(f, true) + flags(ctx, ses, f, dup, day);
  const showPad = f?.state === 'found' && !rec && (st.ack || (!dup && !f.truck));
  const c2 = f?.carton;
  const pad = `<div class="lp-qty"><span class="lbl">${st.change ? tx('Change to') : tx('How many?')}</span><b class="lp-n${st.qty ? '' : ' blank'}${st.qty === 'ALL' ? ' all' : ''}" aria-live="polite">${st.qty === 'ALL' ? tx('All there is') : st.qty || '–'}</b></div>` +
    `<div class="lp-padx">${c2 ? `<button data-act="lp-carton">${ic('box')}${tx('+ Carton ({n})', { n: c2 })}</button>` : ''}<button class="${st.qty === 'ALL' ? 'on' : ''}" data-act="lp-allthere">${tx('All there is')}</button></div>` +
    `<div class="lp-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button data-act="lp-key" data-k="${k}">${k}</button>`).join('')}<button data-act="lp-key" data-k="del" aria-label="${tx('Delete')}">⌫</button><button data-act="lp-key" data-k="0">0</button><button class="send" data-act="lp-send"${st.qty ? '' : ' disabled'}>${st.change ? tx('Change') : tx('Send')}</button></div>`;
  const lines = liveLines(ses).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const lastCage = ses.cages?.[ses.cage - 1];
  const sheet = sheetHtml(`<div class="sx-h">${ic('listcheck')}${esc(ses.name)}${c.todo ? `<span class="n">${tx('{n} waiting', { n: c.todo })}</span>` : ''}</div><p class="sx-sub">${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers'), tx('since {time}', { time: hm(ses.at) }), ses.shelves ? tx('shelf scan on') : tx('shelf scan off')].join(' · ')}</p>` +
    (lastCage ? sx.sec(tx('Cage {n}', { n: ses.cage - 1 }), sx.rows([sx.row('cage', tx('On its way: {n} lines', { n: lastCage.lines }), tx('sent down {time}', { time: hm(lastCage.at) }), tx('Coming'), 'acc')])) : '') +
    sx.sec(tx('Requests'), lines.length ? sx.rows(lines.slice(0, 60).map(l => { const [t, tone] = stateText(l); return sx.row('box', `${esc(nameOf(ctx, l, repaint))} · ${esc(qtyText(l))}`, `<span class="mono">${esc(l.kc)}</span> · ${esc(baysText(l))} · ${hm(l.at)}`, t, tone); })) : `<p class="sx-sub">${tx('Nothing asked for yet.')}</p>`, tx('newest first')) +
    sx.acts([sx.btn('x', tx('Leave session'), 'data-act="lp-leave"'), sx.btn('check', tx('End session'), 'data-act="lp-end"')]));
  return `<div class="lp-body">${head}${scan}${card}${showPad ? pad : ''}</div>${sheet}${strip('listcheck', esc(ses.name), countsLine(c), c.todo || '')}`;
}
function productRow(f, bays) {
  const price = Number.isFinite(f.price) ? ` · $${Number(f.price).toFixed(2)}` : '';
  return `<div class="card lp-prod"><span class="lp-pic">${f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy">` : ic('box')}</span><span class="lp-pn"><b>${esc(f.name || f.kc || f.code)}</b><small><span class="mono">${esc(f.kc || f.code)}</span>${price}${f.carton ? ' · ' + tx('carton of {n}', { n: f.carton }) : ''}</small>${f.via === 'apn' || f.via === 'paired' ? `<small>${tx('found from the barcode')}${f.via === 'paired' && f.gtin ? ` · <button type="button" class="lp-a" data-act="lp-relink" data-gtin="${esc(f.gtin)}">${tx('Wrong item?')}</button>` : ''}</small>` : ''}${f.linked ? `<small class="lp-linked">${ic('check')}${f.linked === 'web' ? tx('Found on kmart.com.au and linked: this barcode now finds {kc} on every phone.', { kc: esc(f.kc) }) : tx('Linked: this barcode now finds {kc} on every phone.', { kc: esc(f.kc) })} <button type="button" class="lp-a" data-act="lp-relink" data-gtin="${esc(f.gtin)}">${tx('Wrong item?')}</button></small>` : ''}</span>` +
    (bays && f.bays?.length ? `<span class="lp-bay"><small>${f.bays.length > 1 ? tx('BAYS') : tx('BAY')}</small><b class="mono">${esc(f.bays[0])}</b>${f.bays.length > 1 ? `<small class="mono">+ ${esc(f.bays.slice(1).join(', '))}</small>` : ''}</span>` : '') + `</div>`;
}
// What the requester is told before the pad: already asked for in this
// session, on today's truck, pulled earlier today (any session).
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
  return `<div class="lp-body"><div class="lp-top">${ses.dept ? dep(ses.dept) : ''}<div><b>${esc(ses.name)}</b><span><i class="lp-live"></i>${tx('Your bays: {bays}', { bays: esc(zoneText(zone)) })}</span></div></div>` +
    `<div class="lp-tabs">${tab('todo', tx('To pull {n}', { n: todo }))}${tab('done', tx('Marked off {n}', { n: done }))}${tab('all', tx('All {n}', { n: mineL.length }))}</div>` +
    `<div class="seg lp-seg"><button class="${st.order === 'time' ? 'on' : ''}" data-act="lp-order" data-o="time">${tx('As they come in')}</button><button class="${st.order === 'bay' ? 'on' : ''}" data-act="lp-order" data-o="bay">${tx('By bay')}</button></div>` +
    (shown.length ? shown.map(line).join('') : `<p class="lp-dim lp-empty">${st.tab === 'todo' ? tx('Nothing to pull in your bays. New requests buzz this phone.') : tx('Nothing here yet.')}</p>`) +
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
  return `<div class="lp-body"><div class="mv-head"><div><h2>${tx('Send cage {n} down', { n: ses.cage })}</h2><span>${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)}</span></div></div>` +
    (going.length || gone.length ? `<div class="lp-sum"><div><b>${going.length}</b><span>${tx('lines')}</span></div><div><b>${units}</b><span>${tx('units')}</span></div><div><b class="${short ? 'warn' : ''}">${short}</b><span>${tx('short')}</span></div></div>` +
      `<div class="card lp-card"><span class="lbl">${ses.shelves ? tx('The requester’s copy, in shelf order') : tx('In the cage, in the order asked')}</span>${going.map(l => `<div class="lp-cr"><span><b>${esc(nameOf(ctx, l, repaint))}</b><small>${l.shelf ? esc(l.shelf) + ' · ' : ''}${esc(baysText(l))}</small></span>${l.st === 'short' ? `<span class="lp-pill warn">${tx('{got} of {asked}', { got: gotOf(l), asked: l.qty })}</span>` : `<b class="mono">× ${l.qty === 'all' && !l.got ? tx('all') : gotOf(l)}</b>`}</div>`).join('') || `<p class="lp-dim">${tx('Nothing pulled for this cage yet.')}</p>`}</div>` +
      (gone.length ? `<div class="lp-ans warn">${ic('x')}<span><b>${tx('Not coming')}</b>${gone.map(l => esc(nameOf(ctx, l, repaint))).join(', ')}</span></div>` : '') +
      `<label class="lp-fl" for="lp-tag">${tx('Cage tag (optional)')}</label><div class="lp-scan"><input class="ad-in mono" id="lp-tag" data-field="lp-tag" value="${esc(st.tag)}" autocomplete="off" placeholder="BSN1240417"><button type="button" class="lp-cam" data-act="lp-cam-tag" aria-label="${tx('Scan the cage tag')}">${ic('camera')}</button></div>` +
      `<button class="mv-big" data-act="lp-cage-send">${ic('cage')}${tx('Send cage {n} down', { n: ses.cage })}</button>` +
      (left ? `<p class="lp-dim">${txn(left, '{n} line still to pull starts cage {next}.', '{n} lines still to pull start cage {next}.', { next: ses.cage + 1 })}</p>` : '')
      : `<div class="card lp-card"><b>${tx('Nothing marked off yet')}</b><p class="lp-dim">${tx('Mark requests off, then send the cage down.')}</p></div>`) +
    `<button class="mv-ghost" data-act="lp-home">${tx('Back')}</button></div>`;
}
// A session kept for the week: every line, and asking again for what did not come.
function past(ctx, ses, repaint) {
  const c = sessionCounts(ses), p = sessionPeople(ses), lines = liveLines(ses).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const again = lines.filter(l => l.st === 'short' || l.st === 'gone');
  return `<div class="lp-body"><div class="mv-head"><div><h2>${ses.dept ? dep(ses.dept) : ''} ${esc(ses.name)}</h2><span>${esc(new Date(ses.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))} ${hm(ses.at)}–${hm(ses.closedAt)}</span></div></div>` +
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
  const item = s => { const c = sessionCounts(s), p = sessionPeople(s); return `<button class="lp-dsl${ses?.id === s.id ? ' on' : ''}" data-act="lp-desk" data-sid="${esc(s.id)}"><span>${s.dept ? dep(s.dept) : ''}<b>${esc(s.name)}</b>${s.closedAt ? '' : '<i class="lp-live"></i>'}</span><small>${s.closedAt ? esc(new Date(s.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' : ''}${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers'), countsLine(c)].join(' · ')}</small></button>`; };
  const head = vh(tx('Live pull'), sub(tx('What the floor asked for and what the stockroom pulled'), tx('today’s sessions and the last 7 days')), '', 'packages');
  if (!ses) return head + `<div class="card"><b>${tx('No sessions this week')}</b><p class="lbl">${tx('Start one from a phone: Live pull is in More, on the Floor and in the Stockroom.')}</p></div>`;
  const c = sessionCounts(ses), p = sessionPeople(ses), who = pullerNames(ctx, ses), lines = liveLines(ses);
  const groups = [...Object.entries(ses.cages || {}).map(([n, cg]) => [tx('Cage {n} · sent down {time} · {lines}', { n, time: hm(cg.at), lines: txn(cg.lines, '{n} line', '{n} lines') }) + (cg.tag ? ` · ${esc(cg.tag)}` : ''), lines.filter(l => l.cage === Number(n))]), [tx('Still to send · cage {n}', { n: ses.cage }), lines.filter(l => l.cage == null)]].filter(([, ls]) => ls.length);
  const zones = Object.entries(ses.people || {}).filter(([, x]) => x.part === 'pull').map(([d, x]) => `${who(d) === tx('This phone') ? tx('this PC') : who(d)} ${zoneText(x.bays)}`);
  return head + `<div class="lp-desk"><div class="card lp-dside"><span class="lbl">${tx('Running now')}</span>${open.map(item).join('') || `<p class="lbl">${tx('None')}</p>`}<span class="lbl">${tx('Earlier · listed for 7 days')}</span>${earlier.map(item).join('') || `<p class="lbl">${tx('None')}</p>`}</div>` +
    `<div class="card lp-dmain"><div class="lp-dh">${ses.dept ? dep(ses.dept) : ''}<h2>${esc(ses.name)}</h2>${ses.closedAt ? `<span class="chip">${tx('Ended {time}', { time: hm(ses.closedAt) })}</span>` : `<button class="btn sm" data-act="lp-end" data-sid="${esc(ses.id)}">${tx('End session')}</button>`}</div>` +
    `<p class="lbl">${[txn(p.req, '{n} requester', '{n} requesters'), txn(p.pull, '{n} puller', '{n} pullers') + (zones.length ? ` (${esc(zones.join('; '))})` : ''), tx('since {time}', { time: hm(ses.at) }), ses.shelves ? tx('shelf scan on') : tx('shelf scan off')].join(' · ')}</p>` +
    `<div class="lp-kpis"><div><b>${c.asked}</b><span>${tx('Asked')}</span></div><div><b class="ok">${c.pulled}</b><span>${tx('Pulled')}</span></div><div><b>${c.todo}</b><span>${tx('Waiting')}</span></div><div><b class="warn">${c.short}</b><span>${tx('Short')}</span></div><div><b class="bad">${c.gone}</b><span>${tx('Not there')}</span></div></div>` +
    (lines.length ? `<div class="mfx-scroll"><table class="wb-t lp-t"><thead><tr><th>${tx('Asked')}</th><th>${tx('Item')}</th><th>${tx('Keycode')}</th><th>${tx('Bays')}</th><th class="num">${tx('Asked')}</th><th class="num">${tx('Pulled')}</th><th>${tx('Puller')}</th><th>${tx('State')}</th></tr></thead><tbody>` +
      groups.map(([label, ls]) => `<tr class="lp-cg"><td colspan="8">${label}</td></tr>` + ls.sort((a, b) => String(a.at).localeCompare(String(b.at))).map(l => { const [t, tone] = stateText(l); return `<tr><td>${hm(l.at)}</td><td>${esc(nameOf(ctx, l, repaint))}${l.shelf ? ` <small class="lbl">${tx('for {shelf}', { shelf: esc(l.shelf) })}</small>` : ''}</td><td class="mono"><span data-kccard="${esc(l.kc)}">${esc(l.kc)}</span></td><td class="mono">${esc(l.got && Object.keys(l.got).length > 1 ? Object.entries(l.got).map(([b, n]) => `${b} (${n})`).join(' + ') : l.bays.join(', '))}</td><td class="num">${esc(qtyText(l))}</td><td class="num">${l.st === 'todo' ? '–' : l.st === 'gone' ? 0 : l.qty === 'all' && !l.got ? tx('all') : gotOf(l)}</td><td>${esc(l.doneBy ? who(l.doneBy) || tx('another puller') : '')}</td><td><span class="lp-pill ${tone}">${t}</span></td></tr>`; }).join('')).join('') + `</tbody></table></div>` : `<p class="lbl">${tx('Nothing asked for yet.')}</p>`) + `</div></div>`;
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
  st.sent = null; st.ack = false; st.change = null; st.qty = ''; st.viaCam = viaCam;
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
    if (r.report && r.gtin && !r.kc) return lookUp(ctx, r);
    st.find = { ...r, state: r.bays?.length ? 'found' : r.report ? 'none' : 'noreport', code };
    if (r.kc) { const it = await ctx.catalogue.lookup(r.kc).catch(() => null); if (it) Object.assign(st.find, { name: it.name || '', img: it.img || '', price: it.price }); }
    haptic(recallFor(ctx.store, r.kc) ? 'error' : st.find.state === 'found' ? 'success' : 'warning');
  } catch (e) { st.find = { state: 'error', code, message: e.message }; haptic('error'); }
  ctx.rerender();
}
// A barcode nothing in the store links yet: Kmart's site search (or a book's
// title) finds its keycode. One sure match links at once; candidates are a
// one-tap choice; nothing found, and the person types the keycode on the ticket.
async function lookUp(ctx, r) {
  const gtin = r.gtin, seq = (st.seq = (st.seq || 0) + 1), viaCam = st.viaCam;
  st.find = { state: 'searching', code: gtin, gtin, report: r.report }; ctx.rerender();
  const b = await ctx.api(`/v1/catalogue/barcode?code=${gtin}`).catch(() => null);
  if (st.seq !== seq || st.find?.gtin !== gtin || st.find.state !== 'searching') return;
  st.viaCam = viaCam;
  const list = (b?.candidates || []).filter(c => /^\d{6,8}$/.test(c.kc));
  if (b?.sure && list.length === 1) return link(ctx, list[0].kc, gtin, { from: 'web' });
  if (list.length) {
    st.find = { state: 'choose', code: gtin, gtin, report: r.report, source: b.source, list };
    haptic('warning'); ctx.rerender();
    for (const c of list) ctx.catalogue.lookup(c.kc).then(it => { if (it && st.find?.list?.includes(c)) { Object.assign(c, { name: it.name || c.name, img: it.img || '' }); ctx.rerender(); } }).catch(() => {});
    return;
  }
  st.find = { state: 'unlinked', code: gtin, gtin, report: r.report, searched: !!b?.why && !/Browser Rendering/.test(b.why) };
  haptic('warning'); ctx.rerender(); focusLink();
}
// A clearance ticket's barcode is the item's own (a book's ISBN, say), which
// nothing may link to a keycode yet. The keycode printed on the ticket finds
// the item, and pull.pair links the two for every phone of the store: only
// for a keycode the report or the catalogue knows, so a mistyped one links
// nothing.
async function link(ctx, raw, gtin, { from } = {}) {
  const kc = String(raw || '').replace(/\D/g, '');
  if (!(from ? /^\d{6,8}$/ : /^\d{7,8}$/).test(kc)) { toast(tx('A keycode is 7 or 8 digits'), 'bad'); return focusLink(); }
  const relink = st.find?.relink, viaCam = st.viaCam;
  st.find = { state: 'busy', code: kc }; ctx.rerender();
  try {
    const r = await ctx.api(`/v1/store/${ctx.storeNo}/pull/find?code=${kc}`);
    const it = await ctx.catalogue.lookup(kc).catch(() => null);
    if (!r.bays?.length && !it) { st.find = { state: 'unlinked', code: gtin, gtin, report: r.report, tried: kc, relink }; haptic('warning'); ctx.rerender(); return focusLink(); }
    st.find = { ...r, state: r.bays?.length ? 'found' : 'none', code: kc, gtin, ...(it ? { name: it.name || '', img: it.img || '', price: it.price } : {}) };
    if (pulls(ctx).apn?.[gtin]?.kc === kc || (await send(ctx, 'pull.pair', { apn: gtin }, { keycode: kc }))) st.find.linked = from === 'web' ? 'web' : true;
    haptic(st.find.state === 'found' ? 'success' : 'warning');
  } catch (e) { st.find = { state: 'error', code: kc, message: e.message }; haptic('error'); }
  st.viaCam = viaCam; ctx.rerender();
}
const focusLink = () => setTimeout(() => document.querySelector('[data-field="lp-linkkc"]')?.focus(), 40);
async function sendRequest(ctx, ses) {
  const f = st.find; if (f?.state !== 'found' || !st.qty) return;
  if (recallFor(ctx.store, f.kc)) return toast(tx('This product is recalled: it can’t be asked for'), 'bad');
  const all = st.qty === 'ALL', qty = all ? undefined : Number(st.qty), q = all ? { all: true } : { qty };
  const ok = st.change ? await send(ctx, 'pull.update', { session: ses.id, line: st.change }, q)
    : await send(ctx, 'pull.request', { session: ses.id, line: ulid() }, { kc: f.kc, bays: f.bays, ...q, ...(f.carton ? { carton: f.carton } : {}), ...(f.name ? { name: String(f.name).slice(0, 80) } : {}), ...(ses.shelves && st.shelf ? { shelf: st.shelf } : {}) });
  if (!ok) return;
  st.sent = { name: f.name || f.kc, qty: all ? tx('all there is') : qty, change: !!st.change };
  Object.assign(st, { find: null, qty: '', change: null, ack: false });
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
      if (act === 'lp-sound') { setPref('pullSound', !prefs().pullSound); if (prefs().pullSound) beep(); return ctx.rerender(); }
      // Leaving and ending
      if (act === 'lp-leave') { setMine(ctx, null); return go(null); }
      if (act === 'lp-end') { const sid = a.dataset.sid || ses?.id; if (!sid || !confirm(tx('End this session? Its list stays for the week, but no more requests can be sent.'))) return; if (await send(ctx, 'pull.session.end', { session: sid })) { if (ses?.id === sid) setMine(ctx, null); go(null); } return; }
      // The requester
      if (act === 'lp-cam') return openCam(ctx);
      if (act === 'lp-cam-shelf') return openCam(ctx, code => { const s = SHELF(code); if (s) { st.shelf = s; ctx.rerender(); } else toast(tx('That isn’t a shelf label (like A16 S1)'), 'bad'); });
      if (act === 'lp-key') { const k = a.dataset.k; st.qty = k === 'del' ? (st.qty === 'ALL' ? '' : st.qty.slice(0, -1)) : ((st.qty === 'ALL' ? '' : st.qty) + k).replace(/^0+/, '').slice(0, 3); haptic('tap'); return ctx.rerender(); }
      if (act === 'lp-carton') { st.qty = String((st.qty === 'ALL' ? 0 : Number(st.qty) || 0) + (st.find?.carton || 0)).slice(0, 3); haptic('tap'); return ctx.rerender(); }
      if (act === 'lp-allthere') { st.qty = st.qty === 'ALL' ? '' : 'ALL'; haptic('tap'); return ctx.rerender(); }
      if (act === 'lp-send') return ses && sendRequest(ctx, ses);
      if (act === 'lp-clear') { st.find = null; return ctx.rerender(); }
      if (act === 'lp-pick') { const f = st.find; if (f?.gtin) return link(ctx, a.dataset.kc, f.gtin, { from: 'pick' }); return; }
      if (act === 'lp-type') { const f = st.find; if (!f?.gtin) return; st.find = { state: 'unlinked', code: f.gtin, gtin: f.gtin, report: f.report, searched: f.state === 'choose' }; ctx.rerender(); return focusLink(); }
      if (act === 'lp-relink') { st.find = { state: 'unlinked', code: a.dataset.gtin, gtin: a.dataset.gtin, report: st.find?.report, relink: true }; st.qty = ''; ctx.rerender(); return focusLink(); }
      if (act === 'lp-ack') { st.ack = true; return ctx.rerender(); }
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
      if (e.target.matches('[data-form="lp-link"]')) { e.preventDefault(); return link(ctx, e.target.querySelector('[data-field="lp-linkkc"]').value, e.target.dataset.gtin); }
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
export function installPullAlerts({ store, session, storeNo, isOpen, open }) {
  const seen = new Set(), key = MINE(storeNo);
  const mineNow = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const scan = (first = false) => {
    const m = mineNow(), all = store.get('pulls')?.sessions || {};
    for (const ses of Object.values(all)) for (const l of Object.values(ses.lines || {})) {
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
