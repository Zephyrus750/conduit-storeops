// Shared bits for the Stockroom views: ring colours, today's key, product
// names from the catalogue with a repaint when they arrive.
import { esc, ic, today, DEPTS_DEFAULT, DEPT_COLOUR } from '../../ui.js';
import { tx, txn } from '../../i18n.js';

export const RING = { 'new-lines': [tx('New lines'), '#7C3AED'], overstock: [tx('Overstock'), '#2563EB'], 'cant-work': [tx('Can’t work'), '#DC2626'], 'online-picks': [tx('Online picks'), '#16A34A'] };
export const ring = (r, on) => `<i class="ring${on ? ' on' : ''}" style="--rc:${RING[r]?.[1] || '#6B7280'}" title="${RING[r]?.[0] || r}"></i>`;
export const STATUS = { pending: [tx('Needs review'), 'warn'], corrected: [tx('Ready'), 'good'], submitted: [tx('Submitted'), 'good'] };
export const todayKey = () => today();

// Stockroom departments (K2B's list): the sub-departments a bay belongs
// to, under their main department. Names are the company-wide ones; the
// colour is the store map's when it has one.
export const SR_DEPTS = DEPTS_DEFAULT.filter(d => d.id !== 'stockroom');
// Home, Clothing and Kids are the company's department names (they stay as
// written); the catch-all group is a word of ours.
export const SR_GROUPS = [['home', 'Home'], ['clothing', 'Clothing'], ['kids', 'Kids'], ['other', tx('Other')]];
const srDept = id => SR_DEPTS.find(d => d.id === id);
export const deptLabel = id => { const d = srDept(id); return d ? `${d.id.toUpperCase()} ${d.name}` : String(id || '').toUpperCase(); };
export const deptGroup = id => srDept(id)?.group || 'other';
export const deptColour = id => DEPT_COLOUR[id] || srDept(id)?.color || '#64748B';
// A department as a badge with its name ("K2 Toys"), or '' for none.
export function deptBadge(id, { short = false } = {}) {
  if (!id) return '';
  const d = srDept(id);
  return `<span class="srdept" title="${esc(deptLabel(id))}"><span class="dep" style="background:${deptColour(id)}">${esc(String(id).toUpperCase())}</span>${short || !d ? '' : `<span class="nm">${esc(d.name)}</span>`}</span>`;
}
export const ageOf = iso => { if (!iso) return '—'; const h = (Date.now() - new Date(iso)) / 3600000; return h < 1 ? tx('{n}m', { n: Math.max(1, Math.round(h * 60)) }) : h < 48 ? tx('{n}h', { n: Math.round(h) }) : tx('{n}d', { n: Math.round(h / 24) }); };

// Product names: ask the catalogue once per code; call repaint when new
// ones land. A name has three states (K2B and Vector's review): verified,
// with a link to the product page when the catalogue has one; unverified
// (not in the catalogue: a mistyped or retired code), with "Did you mean"
// when a code one digit away is; and a 13-digit item barcode, which is not a
// keycode at all.
const names = new Map(), near = new Map();
let pendingPaint = null;
const paintSoon = repaint => { clearTimeout(pendingPaint); pendingPaint = setTimeout(() => { try { repaint(); } catch {} }, 30); };
export const isItemBarcode = kc => /^\d{13}$/.test(String(kc));
export function nameOf(kc) { const n = names.get(String(kc)); return n ? n.name : n === null ? null : ''; }
// The catalogue's price for a code (kmart.com.au), or null.
export function priceOf(kc) { return names.get(String(kc))?.price ?? null; }
// "Did you mean": the one-digit near misses of a code the catalogue does
// not know (a tap copies one); empty while unknown or none.
export function nearHtml(kc) {
  const dm = near.get(String(kc)); if (!dm?.length) return '';
  const [a, b] = dm.slice(0, 2).map(x => `<b class="mono" data-act="near" data-code="${esc(x.keycode)}" title="${esc(x.name ? tx('{name}: tap to copy', { name: x.name }) : tx('Tap to copy'))}">${esc(x.keycode)}</b>`);
  return ` <span class="nm-near">${b ? tx('Did you mean {a} or {b}?', { a, b }) : tx('Did you mean {a}?', { a })}</span>`;
}
export function nameHtml(kc, missing = tx('Unverified · not in the catalogue')) {
  kc = String(kc);
  if (isItemBarcode(kc)) return `<span class="nm-apn" title="${tx('That is an item barcode (APN), not a keycode')}">${tx('Item barcode · not a keycode')}</span>`;
  const n = names.get(kc);
  if (n === undefined) return '<span class="cs-dim">…</span>';
  if (n === null) return `<span class="warn nm-unv" title="${tx('Not found in the catalogue: double-check this code')}">⚠ ${esc(missing)}</span>${nearHtml(kc)}`;
  return n.url ? `<a class="nm-ok" ${goAttrs(kc)} title="${tx('Open the product page on kmart.com.au')}">${esc(n.name)} ↗</a>` : `<span class="nm-ok">${esc(n.name)}</span>`;
}
// Keycodes and product names (K2B's review, Decant Visualiser's klink): a
// click on the keycode copies it, a click on the name opens its product page
// on kmart.com.au in a new tab. The page comes from the catalogue; a name
// clicked before its lookup has landed asks on the click, and a code the
// catalogue does not know opens the site's search for it.
export const searchUrl = kc => `https://www.kmart.com.au/search/?searchTerm=${encodeURIComponent(kc)}`;
export const urlOf = kc => names.get(String(kc))?.url || searchUrl(kc);
export const kcCopy = kc => `<button type="button" class="kcopy mono" data-copykc="${esc(kc)}" title="${tx('Copy {code}', { code: esc(kc) })}">${esc(kc)}</button>`;
const goAttrs = kc => `href="${esc(urlOf(kc))}" data-kcgo="${esc(kc)}" target="_blank" rel="noopener noreferrer"`;
// A line's product: the verified name with a tick; else the description the
// report carried, marked when the catalogue has no such code.
export function itemName(kc, fallback = '') {
  const n = names.get(String(kc));
  if (n) return `<a class="nm-ok" ${goAttrs(kc)} title="${tx('Open the product page on kmart.com.au')}"><span class="nm-tick">✓</span>${esc(n.name)} ↗</a>`;
  if (n === null) return `<a class="nm-go" ${goAttrs(kc)} title="${tx('Not in the catalogue (not sold online, or a retired code): search kmart.com.au')}">${esc(fallback || kc)}</a> <small class="nm-off">${tx('not online')}</small>`;
  return `<a class="nm-go" ${goAttrs(kc)} title="${tx('Open the product page on kmart.com.au')}">${esc(fallback || kc)}</a>`;
}
// A list row's product (Adjustments): the verified name linking to its
// page on kmart.com.au; else the name the row carried (or the code) linking
// to the site's search, marked not online, with any "Did you mean".
export function productHtml(kc, fallback = '') {
  const n = names.get(String(kc));
  if (n === undefined && !fallback) return '<span class="cs-dim">…</span>';
  return itemName(kc, fallback || tx('Search kmart.com.au')) + (n === null ? nearHtml(kc) : '');
}
// One listener for the whole app, in the capture phase so a row's own tap
// (open, toggle, select) never fires under a copy or a product link.
export function installProductLinks(catalogue) {
  document.addEventListener('click', e => {
    const c = e.target.closest?.('[data-copykc]');
    if (c) { e.preventDefault(); e.stopPropagation(); copyCode(c.dataset.copykc, c); return; }
    const a = e.target.closest?.('a[data-kcgo]'); if (!a) return;
    e.stopPropagation();
    const kc = a.dataset.kcgo, n = names.get(kc);
    if (n !== undefined) { a.href = urlOf(kc); return; }   // known: the link goes as it is
    // Not looked up yet: open the tab now (a later open is a blocked pop-up), then send it on.
    e.preventDefault();
    const w = window.open('about:blank', '_blank');
    const send = u => { if (w && !w.closed) { try { w.opener = null; } catch {} w.location.replace(u); } else window.open(u, '_blank', 'noopener'); };
    catalogue.lookup(kc).then(it => { names.set(kc, it ? { name: it.name || tx('Verified product'), url: it.url || null, price: Number.isFinite(it.price) ? it.price : null } : null); send(urlOf(kc)); }).catch(() => send(searchUrl(kc)));
  }, true);
}
// On a PC, resting the pointer on a keycode or a product name for a moment
// shows the product: its picture, keycode, name, price (the was-price and
// clearance when the catalogue has them) and what a click does. The card is
// the catalogue's (this device's cache, a week), so it costs nothing a name
// on the screen has not already asked for. Anything else can opt in with
// data-kccard="<keycode>".
const CARD_ON = '[data-copykc], a[data-kcgo], [data-kccard]';
const cardCode = el => el.dataset.copykc || el.dataset.kcgo || el.dataset.kccard || '';
const money = v => '$' + Number(v).toFixed(2);
function cardHtml(kc, it) {
  const price = it && Number.isFinite(it.price) ? `<span class="pch-price"><b>${money(it.price)}</b>${Number.isFinite(it.was) ? `<s>${money(it.was)}</s>` : ''}${it.clr ? `<em>${tx('On clearance')}</em>` : ''}</span>` : it ? `<span class="pch-none">${tx('No price yet')}</span>` : '';
  return `<div class="pch-img">${it?.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : ic('box')}</div>` +
    `<div class="pch-b"><span class="mono pch-kc">${esc(kc)}</span><b>${it ? esc(it.name || tx('Verified product')) : tx('Not in the catalogue')}</b>${price}` +
    `<small>${it?.url ? tx('Click the name for kmart.com.au, the keycode to copy it') : tx('Not sold online, or a retired code. Click the keycode to copy it.')}</small></div>`;
}
export function installProductCard(catalogue) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let card = null, cur = null, timer = null;
  // The element's own tooltip steps aside while the card is up (the card says the same).
  const hide = () => { clearTimeout(timer); timer = null; if (cur?.dataset.tip0 != null) { cur.title = cur.dataset.tip0; delete cur.dataset.tip0; } cur = null; card?.classList.remove('on'); };
  document.addEventListener('mouseover', e => {
    if (!fine.matches) return;
    const el = e.target.closest?.(CARD_ON), kc = el ? cardCode(el) : '';
    if (!el || el === cur || !/^\d{6,8}$/.test(kc)) return;
    hide(); cur = el; if (el.title) { el.dataset.tip0 = el.title; el.removeAttribute('title'); }
    timer = setTimeout(async () => {
      const it = await catalogue.lookup(kc).catch(() => null), fr = document.querySelector('.frame');
      if (cur !== el || !el.isConnected || !fr) return;
      if (!card || card.parentNode !== fr) { card?.remove(); card = document.createElement('div'); card.className = 'pch'; card.setAttribute('role', 'tooltip'); fr.appendChild(card); }
      card.innerHTML = cardHtml(kc, it); card.classList.add('on');
      // Under the code, or above it near the foot; kept inside the frame (which Display size may scale).
      const r = el.getBoundingClientRect(), fb = fr.getBoundingClientRect(), sc = fb.width / fr.offsetWidth || 1, w = card.offsetWidth, h = card.offsetHeight;
      const left = Math.min(Math.max(8, (r.left - fb.left) / sc), fr.offsetWidth - w - 8);
      let top = (r.bottom - fb.top) / sc + 8; if (top + h > fr.offsetHeight - 8) top = Math.max(8, (r.top - fb.top) / sc - h - 8);
      card.style.left = left + 'px'; card.style.top = top + 'px';
    }, 350);
  });
  document.addEventListener('mouseout', e => { const el = e.target.closest?.(CARD_ON); if (el && el === cur && !(e.relatedTarget && el.contains(e.relatedTarget))) hide(); });
  for (const ev of ['scroll', 'mousedown', 'keydown']) document.addEventListener(ev, hide, true);
}
async function copyCode(kc, el) {
  const { toast } = await import('../../ui.js');
  try { await navigator.clipboard.writeText(kc); el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 700); toast(tx('{what} copied', { what: kc })); }
  catch { toast(tx('Could not copy: check the clipboard permission'), 'bad'); }
}
const NEAR_MAX = 30;
// Run fn over items with at most n in flight.
async function inTurn(items, n, fn) {
  const queue = items.slice();
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await fn(queue.shift()); }));
}
export function ensureNames(ctx, codes, repaint) {
  const want = [...new Set(codes.map(String))].filter(kc => !names.has(kc) && /^\d{6,12}$/.test(kc));
  if (!want.length) return;
  for (const kc of want) names.set(kc, undefined);
  Promise.all(want.map(kc => ctx.catalogue.lookup(kc).then(it => names.set(kc, it ? { name: it.name || tx('Verified product'), url: it.url || null, price: Number.isFinite(it.price) ? it.price : null } : null)).catch(() => names.set(kc, null))))
    .then(() => {
      paintSoon(repaint);
      // Unverified codes ask for their one-digit near misses.
      // At most NEAR_MAX per screen, four at a time: a list of codes the
      // catalogue does not know is a list to check by hand, not 200 requests.
      const miss = want.filter(kc => names.get(kc) === null && !near.has(kc)).slice(0, NEAR_MAX);
      for (const kc of miss) near.set(kc, []);
      if (miss.length) inTurn(miss, 4, kc => ctx.catalogue.nearMiss(kc).then(r => near.set(kc, r || [])).catch(() => {})).then(() => paintSoon(repaint));
    });
}
// Copy one code (a click on it) or a list, as K2B's review did.
export async function copyText(text, what) {
  const { toast } = await import('../../ui.js');
  try { await navigator.clipboard.writeText(text); toast(tx('{what} copied', { what })); } catch { toast(tx('Could not copy: check the clipboard permission'), 'bad'); }
}

// Carton depth (K2B's chip): units per carton from the store's carton
// profiles and how long since the last arrival; a recent one (21 days)
// means stock is likely out the back. RECOUNT when the supplier re-cartoned
// within the last few trucks: count it, do not spot-check.
let profiles = null, lastArrival = {}, profilesAt = 0, profilesLoading = null;
export function loadProfiles(ctx, repaint) {
  if (profilesLoading || Date.now() - profilesAt < 12 * 3600000) return;
  profilesLoading = ctx.api(`/v1/store/${ctx.storeNo}/profiles`).then(doc => { profiles = doc?.profiles || {}; lastArrival = doc?.last || {}; profilesAt = Date.now(); paintSoon(repaint); }).catch(() => { profiles = profiles || {}; profilesAt = Date.now(); }).finally(() => { profilesLoading = null; });
}
export const profileOf = kc => profiles?.[String(kc)] || null;
// Units a carton for the pull and depth checks: the profile when three or
// more trucks agree, else the latest delivery's (one or two so far).
export function cartonOf(kc) {
  const p = profileOf(kc); if (p?.ctn) return { ctn: p.ctn, basis: 'profile', last: p.last_arrival || null };
  const l = lastArrival[String(kc)]; return l?.ctn ? { ctn: l.ctn, basis: 'delivery', last: l } : null;
}
export const ctnOf = kc => cartonOf(kc)?.ctn || null;
export const profilesReady = () => profiles !== null;   // false until the first load lands
export function depthChip(kc, now = Date.now()) {
  const p = profileOf(kc);
  if (!p?.ctn) { const l = lastArrival[String(kc)]; return l?.ctn ? `<span class="ctn-chip single" title="${tx('From the latest delivery ({date}: {units} units in {cartons} cartons); it firms up once three trucks agree', { date: esc(l.date), units: l.units, cartons: l.cartons })}">${tx('▤ {ctn}/ctn · latest delivery', { ctn: l.ctn })}</span>` : ''; }
  const t = p.last_arrival?.date ? Date.parse(p.last_arrival.date + 'T00:00:00') : NaN, days = isNaN(t) ? null : Math.round((now - t) / 86400000), recent = days != null && days <= 21;
  const recount = p.pack_change && p.pack_change.since_trucks < 4;
  const why = [txn(p.trucks, '{ctn} units a carton over {n} truck', '{ctn} units a carton over {n} trucks', { ctn: p.ctn }), p.last_arrival?.date ? tx('last landed {date}', { date: esc(p.last_arrival.date) }) : '', recent ? tx('likely out the back') : ''].filter(Boolean).join('; ');
  const chip = [tx('▤ {ctn}/ctn', { ctn: p.ctn }), days == null ? '' : days <= 0 ? tx('today') : tx('{n}d ago', { n: days }), recent ? tx('out back?') : ''].filter(Boolean).join(' · ');
  return `<span class="ctn-chip${recent ? ' recent' : ''}" title="${why}">${chip}</span>` +
    (recount ? `<span class="sri-badge recount" title="${tx('The supplier re-cartoned this recently ({prev} → {ctn} a carton): count it, do not spot-check', { prev: p.pack_change.prev_ctn, ctn: p.ctn })}">RECOUNT</span>` : '');
}
// GHOST (K2B's stockroom intelligence, from one reading): the system says
// zero or less, but it landed in the last three weeks.
export function ghostChip(kc, soh, now = Date.now()) {
  const p = profileOf(kc), last = p?.last_arrival?.date ? Date.parse(p.last_arrival.date + 'T00:00:00') : NaN;
  return soh <= 0 && !isNaN(last) && now - last <= 21 * 86400000 ? `<span class="sri-badge ghost" title="${tx('SOH 0 or less, but it arrived recently: count it')}">GHOST</span>` : '';
}
export async function send(ctx, type, entity, payload = {}) {
  try { return await ctx.store.dispatch({ type, entity, payload }); }
  catch (e) { const { toast } = await import('../../ui.js'); toast(e.message, 'bad'); return null; }
}
export const allProfiles = () => profiles || {};

// Backfill records older than the live state: retention moves finished bays
// to the worker's archive after 60 days (decision 29). History and Trends
// add them from the history route, read once an hour; until the first read
// lands (or offline) they show the live state and say so.
let arch = { store: null, recs: null, at: 0, loading: null, failed: false };
const archRec = r => ({ bay: r.bay, date: r.date, status: r.status, readyAt: r.readyAt || null, submittedDoneAt: r.submittedAt || null, metrics: { expected: r.expected, scanned: r.scanned, match: r.match, accuracy: r.accuracy, incorrect: r.incorrect }, codes: {}, incorrect: [], trimmed: true, codeCount: r.codes || 0, autoSubmitted: !!r.auto, archived: true });
export function loadArchive(ctx, repaint) {
  if (arch.store !== ctx.storeNo) arch = { store: ctx.storeNo, recs: null, at: 0, loading: null, failed: false };
  const a = arch; if (a.loading || Date.now() - a.at < 3600000) return;
  a.loading = (async () => { const rows = []; for (let offset = 0; ; offset += 500) { const r = await ctx.api(`/v1/store/${ctx.storeNo}/history/backfill?only=archive&offset=${offset}&limit=500`); rows.push(...(r?.rows || [])); if (!r?.rows?.length || offset + 500 >= r.total) return rows; } })()
    .then(rows => { a.recs = rows.map(archRec); a.failed = false; a.at = Date.now(); paintSoon(repaint); })
    .catch(() => { a.failed = true; a.at = Date.now() - 3540000; paintSoon(repaint); })   // try again in a minute
    .finally(() => { a.loading = null; });
}
// The archived records the live subs no longer hold, and the load state.
export const archivedRecs = subs => (arch.recs || []).filter(r => !subs[`${r.bay}:${r.date}`]);
export const archiveState = () => arch.recs ? 'ready' : arch.failed ? 'failed' : 'loading';

// "Did you mean" chips work wherever a product name is shown (review,
// cages, adjustments, history, Quick Scan): a tap copies the likely code.
if (typeof document !== 'undefined') document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-act="near"][data-code]'); if (b) copyText(b.dataset.code, b.dataset.code);
});
