// Shared bits for the Stockroom views: ring colours, today's key, product
// names from the catalogue with a repaint when they arrive.
import { esc, today } from '../../ui.js';

export const RING = { 'new-lines': ['New lines', '#7C3AED'], overstock: ['Overstock', '#2563EB'], 'cant-work': ['Can’t work', '#DC2626'], 'online-picks': ['Online picks', '#16A34A'] };
export const ring = (r, on) => `<i class="ring${on ? ' on' : ''}" style="--rc:${RING[r]?.[1] || '#6B7280'}" title="${RING[r]?.[0] || r}"></i>`;
export const STATUS = { pending: ['Needs review', 'warn'], corrected: ['Ready', 'good'], submitted: ['Submitted', 'good'] };
export const todayKey = () => today();
export const ageOf = iso => { if (!iso) return '—'; const h = (Date.now() - new Date(iso)) / 3600000; return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`; };

// Product names: ask the catalogue once per code; call repaint when new ones land.
const names = new Map();
let pendingPaint = null;
export function nameOf(kc) { const n = names.get(String(kc)); return n === undefined ? '' : n; }
export function nameHtml(kc, missing = 'Not in the catalogue') { const n = names.get(String(kc)); return n === undefined ? '<span class="cs-dim">…</span>' : n === null ? `<span class="warn">${missing}</span>` : esc(n); }
export function ensureNames(ctx, codes, repaint) {
  const want = [...new Set(codes.map(String))].filter(kc => !names.has(kc) && /^\d{6,13}$/.test(kc));
  if (!want.length) return;
  for (const kc of want) names.set(kc, undefined);
  Promise.all(want.map(kc => ctx.catalogue.lookup(kc).then(it => names.set(kc, it ? (it.name || 'Product') : null)).catch(() => names.set(kc, null))))
    .then(() => { clearTimeout(pendingPaint); pendingPaint = setTimeout(() => { try { repaint(); } catch {} }, 30); });
}
export async function send(ctx, type, entity, payload = {}) {
  try { return await ctx.store.dispatch({ type, entity, payload }); }
  catch (e) { const { toast } = await import('../../ui.js'); toast(e.message, 'bad'); return null; }
}
