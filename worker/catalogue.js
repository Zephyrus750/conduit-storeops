// Product catalogue: keycode → name, product URL, price, was, image,
// clearance. The worker proxies two existing upstreams (the suite lookup
// worker's ?codes= map built from public sitemaps, and the details worker
// that reads the public product pages) and caches per keycode in the edge
// Cache API, so a code is fetched once per colo per TTL and the device
// library caches it again for a week. Nothing here needs a token.
//
//   GET /v1/catalogue?kc=42977636,43307685[&fields=link]
//   → { items: { "42977636": { kc, name, url, price, was, img, clr, at } | null } }
//
// A null item is a keycode neither upstream knows; that answer is cached
// briefly so a mistyped code does not hammer the upstreams.

import { HttpError } from './http.js';

export const MAX_CODES = 50;
const LINK_TTL_S = 7 * 86400;       // name and URL do not change
const DETAIL_TTL_S = 86400;         // price and clearance refresh daily
const MISS_TTL_S = 3600;
const UPSTREAM_TIMEOUT_MS = 8000;

export function parseCodes(raw) {
  const codes = [];
  for (const c of String(raw || '').split(/[\s,]+/)) { const kc = c.replace(/\D/g, ''); if (kc.length >= 6 && kc.length <= 9 && !codes.includes(kc)) codes.push(kc); }
  if (!codes.length) throw new HttpError(400, 'invalid_request', 'kc must list 1 to 50 keycodes of 6 to 9 digits');
  if (codes.length > MAX_CODES) throw new HttpError(400, 'invalid_request', `at most ${MAX_CODES} keycodes per request`);
  return codes;
}

export async function lookup(env, ctx, codes, { details = true, fetchImpl = fetch, cache = globalThis.caches?.default, now = Date.now } = {}) {
  const items = {}, needLink = [], needDetail = [];
  // 1. edge cache
  for (const kc of codes) {
    const hit = cache ? await cacheGet(cache, kc) : null;
    if (hit === undefined) { needLink.push(kc); continue; }
    items[kc] = hit;
    if (hit && details && !fresh(hit.at, DETAIL_TTL_S, now())) needDetail.push(kc);
  }
  // 2. links for the unknown codes
  if (needLink.length) {
    const found = await fetchLinks(env, needLink, fetchImpl);
    for (const kc of needLink) {
      const f = found[kc];
      items[kc] = f ? { kc, name: f.name || '', url: f.url, price: null, was: null, img: null, clr: false, at: 0 } : null;
      if (f) needDetail.push(kc);
    }
  }
  // 3. price, was, image, clearance for the ones that have a product page
  if (details && needDetail.length) {
    const det = await fetchDetails(env, needDetail.map(kc => ({ kc, u: items[kc].url })), fetchImpl);
    for (const kc of needDetail) {
      const d = det[kc];
      items[kc] = { ...items[kc], ...(d ? { price: d.price ?? null, was: d.was ?? null, img: d.img || null, clr: !!d.clr } : {}), at: d ? now() : items[kc].at };
    }
  }
  // 4. write back what changed
  if (cache) {
    const puts = [...new Set([...needLink, ...needDetail])].map(kc => cachePut(cache, kc, items[kc], now()));
    if (ctx?.waitUntil) ctx.waitUntil(Promise.all(puts)); else await Promise.all(puts);
  }
  return items;
}

const fresh = (at, ttl, now) => at && now - at < ttl * 1000;
const cacheKey = kc => new Request(`https://catalogue.internal/kc/${kc}`);
async function cacheGet(cache, kc) {
  try { const r = await cache.match(cacheKey(kc)); if (!r) return undefined; return await r.json(); } catch { return undefined; }
}
async function cachePut(cache, kc, item, now) {
  const ttl = item ? (item.at ? DETAIL_TTL_S : LINK_TTL_S) : MISS_TTL_S;
  try { await cache.put(cacheKey(kc), new Response(JSON.stringify(item), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`, 'X-Cached-At': String(now) } })); } catch {}
}

async function fetchLinks(env, codes, fetchImpl) {
  const base = env.LOOKUP_URL; if (!base) return {};
  const out = {};
  for (let i = 0; i < codes.length; i += 40) {
    const chunk = codes.slice(i, i + 40);
    try {
      const r = await timed(fetchImpl(`${base.replace(/\/+$/, '')}/?codes=${chunk.join(',')}`));
      if (!r.ok) continue;
      const j = await r.json();
      for (const kc of chunk) if (j?.[kc]?.found && j[kc].url) out[kc] = { url: j[kc].url, name: j[kc].name || '' };
    } catch { /* upstream down: codes stay unknown and are retried next time (miss TTL) */ }
  }
  return out;
}
async function fetchDetails(env, items, fetchImpl) {
  const url = env.DETAILS_URL; if (!url || !items.length) return {};
  const out = {};
  for (let i = 0; i < items.length; i += 20) {
    const chunk = items.slice(i, i + 20);
    try {
      const r = await timed(fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: chunk }) }));
      if (!r.ok) continue;
      const j = await r.json();
      for (const it of chunk) if (j?.[it.kc]?.found) out[it.kc] = j[it.kc];
    } catch { /* details are optional; the link still answers */ }
  }
  return out;
}
function timed(p, ms = UPSTREAM_TIMEOUT_MS) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('upstream timed out')), ms))]);
}
