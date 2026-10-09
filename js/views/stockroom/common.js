// Shared bits for the Stockroom views: ring colours, today's key, product
// names from the catalogue with a repaint when they arrive.
import { esc, today } from '../../ui.js';

export const RING = { 'new-lines': ['New lines', '#7C3AED'], overstock: ['Overstock', '#2563EB'], 'cant-work': ['Can’t work', '#DC2626'], 'online-picks': ['Online picks', '#16A34A'] };
export const ring = (r, on) => `<i class="ring${on ? ' on' : ''}" style="--rc:${RING[r]?.[1] || '#6B7280'}" title="${RING[r]?.[0] || r}"></i>`;
export const STATUS = { pending: ['Needs review', 'warn'], corrected: ['Ready', 'good'], submitted: ['Submitted', 'good'] };
export const todayKey = () => today();
export const ageOf = iso => { if (!iso) return '—'; const h = (Date.now() - new Date(iso)) / 3600000; return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`; };

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
export function nameHtml(kc, missing = 'Unverified · not in the catalogue') {
  kc = String(kc);
  if (isItemBarcode(kc)) return '<span class="nm-apn" title="That is an item barcode (APN), not a keycode">Item barcode · not a keycode</span>';
  const n = names.get(kc);
  if (n === undefined) return '<span class="cs-dim">…</span>';
  if (n === null) { const dm = near.get(kc); return `<span class="warn nm-unv" title="Not found in the catalogue: double-check this code">⚠ ${esc(missing)}</span>${dm?.length ? ` <span class="nm-near">Did you mean ${dm.slice(0, 2).map(x => `<b class="mono" data-act="near" data-code="${esc(x.keycode)}" title="${esc(x.name ? `${x.name}: tap to copy` : 'Tap to copy')}">${esc(x.keycode)}</b>`).join(' or ')}?</span>` : ''}`; }
  return n.url ? `<a class="nm-ok" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer" title="View on Kmart">${esc(n.name)} ↗</a>` : `<span class="nm-ok">${esc(n.name)}</span>`;
}
export function ensureNames(ctx, codes, repaint) {
  const want = [...new Set(codes.map(String))].filter(kc => !names.has(kc) && /^\d{6,12}$/.test(kc));
  if (!want.length) return;
  for (const kc of want) names.set(kc, undefined);
  Promise.all(want.map(kc => ctx.catalogue.lookup(kc).then(it => names.set(kc, it ? { name: it.name || 'Verified product', url: it.url || null } : null)).catch(() => names.set(kc, null))))
    .then(() => {
      paintSoon(repaint);
      // Unverified codes ask for their one-digit near misses.
      const miss = want.filter(kc => names.get(kc) === null && !near.has(kc));
      for (const kc of miss) near.set(kc, []);
      if (miss.length) Promise.all(miss.map(kc => ctx.catalogue.nearMiss(kc).then(r => near.set(kc, r || [])).catch(() => {}))).then(() => paintSoon(repaint));
    });
}
// Copy one code (a click on it) or a list, as K2B's review did.
export async function copyText(text, what) {
  const { toast } = await import('../../ui.js');
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Could not copy: check the clipboard permission', 'bad'); }
}

// Carton depth (K2B's chip): units per carton from the store's carton
// profiles and how long since the last arrival; a recent one (21 days)
// means stock is likely out the back. RECOUNT when the supplier re-cartoned
// within the last few trucks: count it, do not spot-check.
let profiles = null, profilesAt = 0, profilesLoading = null;
export function loadProfiles(ctx, repaint) {
  if (profilesLoading || Date.now() - profilesAt < 12 * 3600000) return;
  profilesLoading = ctx.api(`/v1/store/${ctx.storeNo}/profiles`).then(doc => { profiles = doc?.profiles || {}; profilesAt = Date.now(); paintSoon(repaint); }).catch(() => { profiles = profiles || {}; profilesAt = Date.now(); }).finally(() => { profilesLoading = null; });
}
export const profileOf = kc => profiles?.[String(kc)] || null;
export function depthChip(kc, now = Date.now()) {
  const p = profileOf(kc); if (!p?.ctn) return '';
  const t = p.last_arrival?.date ? Date.parse(p.last_arrival.date + 'T00:00:00') : NaN, days = isNaN(t) ? null : Math.round((now - t) / 86400000), recent = days != null && days <= 21;
  const recount = p.pack_change && p.pack_change.since_trucks < 4;
  return `<span class="ctn-chip${recent ? ' recent' : ''}" title="${p.ctn} units a carton over ${p.trucks} truck${p.trucks === 1 ? '' : 's'}${p.last_arrival?.date ? `; last landed ${esc(p.last_arrival.date)}` : ''}${recent ? '; likely out the back' : ''}">▤ ${p.ctn}/ctn${days == null ? '' : days <= 0 ? ' · today' : ` · ${days}d ago`}${recent ? ' · out back?' : ''}</span>` +
    (recount ? `<span class="sri-badge recount" title="The supplier re-cartoned this recently (${p.pack_change.prev_ctn} → ${p.ctn} a carton): count it, do not spot-check">RECOUNT</span>` : '');
}
// GHOST (K2B's stockroom intelligence, from one reading): the system says
// zero or less, but it landed in the last three weeks.
export function ghostChip(kc, soh, now = Date.now()) {
  const p = profileOf(kc), last = p?.last_arrival?.date ? Date.parse(p.last_arrival.date + 'T00:00:00') : NaN;
  return soh <= 0 && !isNaN(last) && now - last <= 21 * 86400000 ? '<span class="sri-badge ghost" title="SOH 0 or less, but it arrived recently: count it">GHOST</span>' : '';
}
export async function send(ctx, type, entity, payload = {}) {
  try { return await ctx.store.dispatch({ type, entity, payload }); }
  catch (e) { const { toast } = await import('../../ui.js'); toast(e.message, 'bad'); return null; }
}
export const allProfiles = () => profiles || {};

// "Did you mean" chips work wherever a product name is shown (review,
// cages, adjustments, history, Quick Scan): a tap copies the likely code.
if (typeof document !== 'undefined') document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-act="near"][data-code]'); if (b) copyText(b.dataset.code, b.dataset.code);
});
