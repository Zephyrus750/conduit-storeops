// Product catalogue: keycode → name, product URL, price, was, image,
// clearance. Names and links come from Conduit's own catalogue object (the
// Kmart product sitemaps, read weekly: worker/catalogue-object.js); price,
// was, image and clearance from the product page through Browser Rendering
// (worker/details.js). Answers are cached per keycode in the edge Cache API,
// so a code is looked up once per colo per TTL and the device library caches
// it again for a week. Nothing here needs a token.
//
// Cutover: until the catalogue object has finished its first build, links
// come from the legacy suite worker (LOOKUP_URL); until Browser Rendering is
// configured, details come from the legacy details worker (DETAILS_URL).
// Once both are in place the legacy workers are not called at all.
//
//   GET /v1/catalogue?kc=42977636,43307685[&fields=link]
//   → { items: { "42977636": { kc, name, url, price, was, img, clr, at } | null } }
//
// A null item is a keycode neither upstream knows; that answer is cached
// briefly so a mistyped code does not hammer the upstreams. A code the
// catalogue could not answer for (its object or the legacy lookup down) is
// left out of items: unknown is not "not found", and nothing is cached.
//
// Names never wait on product pages. A page renders in seconds, a screen
// asks for fifty codes, and a device gives up after ten: a lookup that
// waited for every page answered nothing, and every product read as not in
// the catalogue. The lookup now waits DETAIL_BUDGET_MS for the pages; the
// rest finish in the background and land in the edge cache for the next
// ask (a device asks again within the hour when an answer has no picture or
// price). Each page's answer is cached as soon as it is read, so the
// background's time limit loses only the pages not reached; those are tried
// again two minutes later. A page that could not be read waits an hour.
// When Browser Rendering cannot read the pages (Kmart refusing it, or the
// account over its browser limit), the legacy details worker reads them.
// GET /v1/admin/catalogue/probe?kc= (probe below) shows the owner each step.

import { HttpError } from './http.js';
import { upstream } from './upstream.js';
import { detailsConfigured, renderDetails, renderPage, extractDetails, isAccessDenied } from './details.js';

export const MAX_CODES = 50;
const LINK_TTL_S = 7 * 86400;       // name and URL do not change
const DETAIL_TTL_S = 86400;         // price and clearance refresh daily
const MISS_TTL_S = 3600;
const RETRY_TTL_S = 3600;           // a product page that could not be read waits this long before another try
const PENDING_TTL_S = 120;          // a page being read now is not started again by another ask for this long
const UPSTREAM_TIMEOUT_MS = 8000;
export const DETAIL_BUDGET_MS = 3500;

export function parseCodes(raw) {
  const codes = [];
  for (const c of String(raw || '').split(/[\s,]+/)) { const kc = c.replace(/\D/g, ''); if (kc.length >= 6 && kc.length <= 9 && !codes.includes(kc)) codes.push(kc); }
  if (!codes.length) throw new HttpError(400, 'invalid_request', 'kc must list 1 to 50 keycodes of 6 to 9 digits');
  if (codes.length > MAX_CODES) throw new HttpError(400, 'invalid_request', `at most ${MAX_CODES} keycodes per request`);
  return codes;
}

// upstream: false serves details from the cache only and never starts a
// product-page fetch (an anonymous caller; GET /v1/catalogue).
export async function lookup(env, ctx, codes, { details = true, upstream: fetchUp = true, fetchImpl = fetch, cache = globalThis.caches?.default, now = Date.now, budgetMs = DETAIL_BUDGET_MS } = {}) {
  const items = {}, needLink = [], needDetail = [], puts = [];
  // 1. edge cache
  for (const kc of codes) {
    const hit = cache ? await cacheGet(cache, kc) : null;
    if (hit === undefined) { needLink.push(kc); continue; }
    items[kc] = hit;
    if (hit && details && !fresh(hit.at, DETAIL_TTL_S, now()) && !fresh(hit.tried, RETRY_TTL_S, now()) && !fresh(hit.pending, PENDING_TTL_S, now())) needDetail.push(kc);
  }
  // 2. links for the unknown codes; a code the catalogue could not answer
  // for stays out of items and out of the cache.
  if (needLink.length) {
    const { found, failed } = await fetchLinks(env, needLink, fetchImpl);
    for (const kc of needLink) {
      if (failed.has(kc)) continue;
      const f = found[kc];
      items[kc] = f ? { kc, name: f.name || '', url: f.url, price: null, was: null, img: null, clr: false, at: 0 } : null;
      if (f) needDetail.push(kc); else puts.push(kc);
    }
  }
  // 3. price, was, image, clearance for the ones that have a product page:
  // marked as being read and cached first, so another ask does not start the
  // same pages; each answer is cached as it lands; waited for up to the
  // budget, the rest in the background. A page no reader could read waits
  // an hour; one never reached (the background's time ran out) two minutes.
  if (details && fetchUp && needDetail.length) {
    const t0 = now(), got = {}, saves = [];
    const save = (kc, item) => { if (cache) saves.push(cachePut(cache, kc, item, now())); };
    const plain = kc => { const { pending, ...rest } = items[kc]; return rest; };
    const base = Object.fromEntries(needDetail.map(kc => [kc, plain(kc)]));
    for (const kc of needDetail) items[kc] = { ...base[kc], pending: t0 };
    if (cache) await Promise.all(needDetail.map(kc => cachePut(cache, kc, items[kc], t0)));
    const onItem = (kc, d) => { got[kc] = { ...base[kc], price: d.price ?? null, was: d.was ?? null, img: d.img || null, clr: !!d.clr, at: now() }; save(kc, got[kc]); };
    const job = fetchDetails(env, needDetail.map(kc => ({ kc, u: base[kc].url })), fetchImpl, onItem)
      .then(() => { const t = now(); for (const kc of needDetail) if (!got[kc]) save(kc, { ...base[kc], tried: t }); })
      .catch(() => {})
      .then(() => Promise.all(saves));
    if (ctx?.waitUntil) ctx.waitUntil(job);
    let timer; await Promise.race([job, new Promise(r => { timer = setTimeout(r, budgetMs); })]); clearTimeout(timer);
    for (const kc of needDetail) if (got[kc]) items[kc] = got[kc];
    if (!ctx?.waitUntil) await job;
  } else puts.push(...needDetail.filter(kc => needLink.includes(kc)));
  // 4. write back the links and misses that changed
  if (cache && puts.length) {
    const p = Promise.all(puts.map(kc => cachePut(cache, kc, items[kc], now())));
    if (ctx?.waitUntil) ctx.waitUntil(p); else await p;
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

export const catalogueStub = env => env.CATALOGUE ? env.CATALOGUE.get(env.CATALOGUE.idFromName('catalogue')) : null;
// Conduit's own catalogue: { built, found, down }. built is false until its
// first build has landed products, which is what keeps the legacy fallback
// alive; down is true when the object could not answer at all.
async function ownLinks(env, codes) {
  const stub = catalogueStub(env); if (!stub) return { built: false, found: {} };
  try {
    const res = await stub.fetch(`https://catalogue/lookup?kc=${codes.join(',')}`);
    if (!res.ok) return { built: false, found: {}, down: true };
    const j = await res.json();
    const found = {}; for (const kc of codes) if (j.items?.[kc]) found[kc] = { url: j.items[kc].url, name: j.items[kc].name };
    return { built: j.total > 0, found };
  } catch { return { built: false, found: {}, down: true }; }
}
// { found: { kc: { url, name } }, failed: Set of codes no upstream could answer for }
async function fetchLinks(env, codes, fetchImpl) {
  const own = await ownLinks(env, codes);
  if (own.built) return { found: own.found, failed: new Set() };
  const base = env.LOOKUP_URL; if (!base) return { found: own.found, failed: new Set(own.down ? codes : []) };
  const doFetch = upstream(env, 'LOOKUP', fetchImpl);
  const out = {}, failed = new Set();
  for (let i = 0; i < codes.length; i += 40) {
    const chunk = codes.slice(i, i + 40);
    try {
      const r = await timed(doFetch(`${base.replace(/\/+$/, '')}/?codes=${chunk.join(',')}`));
      if (!r.ok) { chunk.forEach(kc => failed.add(kc)); continue; }
      const j = await r.json();
      for (const kc of chunk) if (j?.[kc]?.found && j[kc].url) out[kc] = { url: j[kc].url, name: j[kc].name || '' };
    } catch { chunk.forEach(kc => failed.add(kc)); /* upstream down: unknown, asked again next time */ }
  }
  return { found: out, failed };
}
// Price, was, image and clearance for [{ kc, u }]: Browser Rendering first,
// then the legacy details worker for what it could not read (or all of
// them when Browser Rendering is not configured). onItem(kc, details) as
// each one lands. Only found answers are returned.
async function fetchDetails(env, items, fetchImpl, onItem = () => {}) {
  if (!items.length) return {};
  const out = {}, take = (kc, d) => { if (d?.found && !out[kc]) { out[kc] = d; onItem(kc, d); } };
  if (detailsConfigured(env)) {
    for (let i = 0; i < items.length; i += 20) {
      let refused = false;
      try { const r = await renderDetails(env, items.slice(i, i + 20), fetchImpl, { onItem: take, stopOnRefusal: !!env.DETAILS_URL }); refused = Object.values(r).some(d => !d.found && d.why && d.why !== 'no price or picture on the page'); }
      catch { refused = true; }
      if (refused && env.DETAILS_URL) break;   // the legacy worker reads the rest
    }
  }
  const rest = items.filter(it => !out[it.kc]), url = env.DETAILS_URL;
  if (!url || !rest.length) return out;
  const doFetch = upstream(env, 'DETAILS', fetchImpl);
  for (let i = 0; i < rest.length; i += 20) {
    const chunk = rest.slice(i, i + 20);
    try {
      const r = await timed(doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: chunk }) }));
      if (!r.ok) continue;
      const j = await r.json();
      for (const it of chunk) take(it.kc, j?.[it.kc]);
    } catch { /* details are optional; the link still answers */ }
  }
  return out;
}

// The owner's picture check for one keycode: each step a product's picture
// takes, and what came back. { kc, link, browser, legacy, image }; a step
// is { ok, why?, ... } or null when it was not reached.
export async function probe(env, kc, fetchImpl = fetch) {
  const out = { kc, link: null, browser: null, legacy: null, image: null };
  const { found, failed } = await fetchLinks(env, [kc], fetchImpl);
  out.link = failed.has(kc) ? { ok: false, why: 'the catalogue could not answer' } : found[kc] ? { ok: true, name: found[kc].name, url: found[kc].url } : { ok: false, why: 'not in the catalogue' };
  if (!out.link.ok) return out;
  const it = { kc, u: found[kc].url }, fields = d => ({ price: d.price ?? null, was: d.was ?? null, img: d.img || null, clr: !!d.clr });
  if (detailsConfigured(env)) {
    const t = Date.now(), r = await renderPage(it.u, env, fetchImpl), ms = Date.now() - t;
    if (!r.html) out.browser = { ok: false, ms, why: r.err };
    else if (isAccessDenied(r.html)) out.browser = { ok: false, ms, why: 'refused by kmart.com.au (Access Denied)' };
    else { const d = extractDetails(r.html), ok = d.price !== null || d.img !== null; out.browser = { ok, ms, bytes: r.html.length, ...fields(d), ...(ok ? {} : { why: 'no price or picture on the page' }) }; }
  } else out.browser = { ok: false, why: 'not configured (CF_ACCOUNT_ID and BROWSER_TOKEN)' };
  if (env.DETAILS_URL) {
    const t = Date.now();
    try {
      const r = await timed(upstream(env, 'DETAILS', fetchImpl)(env.DETAILS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [it] }) }), 30_000), ms = Date.now() - t;
      const j = r.ok ? await r.json().catch(() => null) : null, d = j?.[kc];
      out.legacy = !r.ok ? { ok: false, ms, why: `answered ${r.status}` } : d?.found ? { ok: true, ms, ...fields(d) } : { ok: false, ms, why: d?.error || 'no price or picture' };
    } catch (e) { out.legacy = { ok: false, ms: Date.now() - t, why: String(e?.message || e).slice(0, 120) }; }
  } else out.legacy = { ok: false, why: 'not configured (DETAILS_URL)' };
  const img = out.browser?.img || out.legacy?.img;
  if (img) {
    try { const r = await timed(fetchImpl(img, { headers: { Accept: 'image/*' } }), 15_000); out.image = { ok: r.ok && /^image\//.test(r.headers.get('content-type') || ''), url: img, status: r.status, type: r.headers.get('content-type') || '' }; }
    catch (e) { out.image = { ok: false, url: img, why: String(e?.message || e).slice(0, 120) }; }
  }
  return out;
}
function timed(p, ms = UPSTREAM_TIMEOUT_MS) {
  let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('upstream timed out')), ms); })]).finally(() => clearTimeout(t));
}
