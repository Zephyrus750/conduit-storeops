// Item barcode → keycode, for a barcode the inventory report doesn't list.
// A clearance ticket or shelf talker carries the item's own barcode (an
// EAN, often a book's ISBN), not the keycode, so Live pull asks here before
// it asks a person to type the keycode printed on the ticket. Two sources,
// first hit wins:
//
//   1. Kmart's own site search, which finds a product by its barcode. The
//      site refuses a plain server fetch, so the search page is rendered by
//      Browser Rendering (worker/details.js) and the keycodes are read from
//      what it shows: a product page (an exact match may land there), or the
//      product links of the results. Needs CF_ACCOUNT_ID and BROWSER_TOKEN.
//   2. A book (ISBN, 978 or 979): its title from Google Books or Open
//      Library, matched against the names in Conduit's own catalogue.
//
// Nothing here links anything: the phone finds the one candidate the search
// is sure of at once, and anything else is a one-tap choice. A definite
// answer is cached at the edge by barcode, a week for a hit and a day for a
// miss, so each barcode costs one search per colo at most; a failed render
// is not cached.
//
//   GET /v1/catalogue/barcode?code=9780241813799   (any signed-in device)
//   → { gtin, source: 'kmart' | 'isbn' | null, sure, candidates: [{ kc, name, url }], why }

import { renderPage, detailsConfigured, isAccessDenied } from './details.js';
import { slugToName, productUrl } from './sitemap.js';
import { catalogueStub } from './catalogue.js';

// {code}: the barcode. A setting, so a change to Kmart's search address needs no release.
export const SEARCH_URL = 'https://www.kmart.com.au/search/?searchTerm={code}';
const HIT_TTL_S = 7 * 86400, MISS_TTL_S = 86400, FETCH_TIMEOUT_MS = 8000, MAX = 4;
const PRODUCT_RE = /\/product\/([a-z0-9-]+?)-(\d{6,9})\/?(?=["'?#\s<]|$)/gi;
const NO_RESULTS_RE = /\b0\s+results?\b|no\s+results?\s+(?:found|for)|(?:couldn|could\s+not|can't|cannot)[’']?t?\s+find|did\s?n[’']?t\s+match|nothing\s+matche/i;

export const isIsbn = gtin => /^97[89]\d{10}$/.test(String(gtin));
export const searchUrl = (env, gtin) => String(env?.KMART_SEARCH_URL || SEARCH_URL).replace('{code}', encodeURIComponent(gtin));
// A title as a catalogue slug ("Our Perfect Storm: A Novel" → our-perfect-storm).
export const titleSlug = t => String(t || '').split(/[:(]/)[0].normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const candidate = (kc, slug) => ({ kc, name: slugToName(slug), url: productUrl(kc, slug) });
const fromUrl = u => { PRODUCT_RE.lastIndex = 0; const m = PRODUCT_RE.exec(String(u || '')); return m && /^\d{6,8}$/.test(m[2]) ? candidate(m[2], m[1].toLowerCase()) : null; };

// What a rendered Kmart page says about one barcode: { candidates, sure, why }.
export function readSearch(html, gtin) {
  const page = String(html || '');
  // 1. A product page: its canonical address, or a JSON-LD product naming the barcode.
  const canon = page.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || page.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const own = fromUrl(canon);
  if (own) return { candidates: [own], sure: true, why: 'product page' };
  for (const block of page.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []) {
    try {
      const data = JSON.parse(block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, ''));
      for (const d of Array.isArray(data) ? data : data['@graph'] || [data]) {
        if (String(d?.['@type']).toLowerCase() !== 'product') continue;
        const codes = ['gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14'].map(k => String(d[k] || '').replace(/\D/g, '').replace(/^0+/, ''));
        if (!codes.includes(String(gtin).replace(/^0+/, ''))) continue;
        const c = fromUrl(d.url || d.offers?.url) || (/^\d{6,8}$/.test(String(d.sku || '')) ? { kc: String(d.sku), name: String(d.name || ''), url: '' } : null);
        if (c) return { candidates: [c], sure: true, why: 'product data' };
      }
    } catch { /* malformed block: next one */ }
  }
  // 2. A results page. No results: whatever products it suggests instead are not this barcode.
  const text = page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const n = Number(page.match(/data-cnstrc-num-results=["'](\d+)["']/i)?.[1] ?? text.match(/\b(\d{1,4})\s+results?\b/i)?.[1] ?? NaN);
  if (n === 0 || (!(n > 0) && NO_RESULTS_RE.test(text))) return { candidates: [], sure: false, why: 'no results' };
  const seen = new Map();
  PRODUCT_RE.lastIndex = 0;
  for (let m; (m = PRODUCT_RE.exec(page));) if (/^\d{6,8}$/.test(m[2]) && !seen.has(m[2])) seen.set(m[2], candidate(m[2], m[1].toLowerCase()));
  const list = [...seen.values()].slice(0, n > 0 ? Math.min(n, MAX) : MAX);
  if (!list.length) return { candidates: [], sure: false, why: 'no product links' };
  return { candidates: list, sure: n === 1 && list.length === 1, why: n > 0 ? `${n} results` : 'results' };
}

// A book's title and authors by ISBN: Google Books, then Open Library.
export async function bookTitle(isbn, fetchImpl = fetch) {
  const get = async u => { const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS); try { const r = await fetchImpl(u, { signal: ctrl.signal, headers: { Accept: 'application/json' } }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); } };
  const g = (await get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`))?.items?.[0]?.volumeInfo;
  if (g?.title) return { title: String(g.title), authors: (g.authors || []).map(String) };
  const o = await get(`https://openlibrary.org/isbn/${isbn}.json`);
  return o?.title ? { title: String(o.title), authors: [] } : null;
}

// Catalogue products whose name holds the title, those naming an author first.
async function byTitle(env, book) {
  const slug = titleSlug(book?.title); if (slug.length < 3) return [];
  const stub = catalogueStub(env); if (!stub) return [];
  try {
    const items = (await (await stub.fetch(`https://catalogue/search?slug=${encodeURIComponent(slug)}`)).json()).items || [];
    const names = (book.authors || []).map(a => titleSlug(a).split('-').pop()).filter(x => x.length > 2);
    const score = it => names.some(a => it.slug.includes(a)) ? 0 : /(^|-)book(-|$)/.test(it.slug) ? 1 : 2;
    return items.sort((a, b) => score(a) - score(b)).slice(0, MAX).map(it => candidate(it.kc, it.slug));
  } catch { return []; }
}

const cacheKey = gtin => new Request(`https://catalogue.internal/barcode/${gtin}`);
export async function findByBarcode(env, gtin, { fetchImpl = fetch, cache = globalThis.caches?.default } = {}) {
  if (cache) { try { const r = await cache.match(cacheKey(gtin)); if (r) return { ...(await r.json()), cached: true }; } catch { /* a cache miss */ } }
  let out = { gtin, source: null, sure: false, candidates: [], why: '' }, definite = true;
  if (detailsConfigured(env)) {
    const r = await renderPage(searchUrl(env, gtin), env, fetchImpl);
    if (r.html && !isAccessDenied(r.html)) { const s = readSearch(r.html, gtin); out = { ...out, ...s, source: s.candidates.length ? 'kmart' : null }; }
    else { out.why = r.err || 'kmart.com.au refused the search'; definite = false; }
  } else { out.why = 'Kmart search needs Browser Rendering (CF_ACCOUNT_ID, BROWSER_TOKEN)'; definite = false; }
  if (!out.candidates.length && isIsbn(gtin)) {
    const book = await bookTitle(gtin, fetchImpl), list = book ? await byTitle(env, book) : [];
    if (list.length) out = { ...out, source: 'isbn', sure: false, candidates: list, why: `title: ${book.title}`.slice(0, 120) };
    else if (!book) definite = false;
  }
  if (cache && (definite || out.candidates.length)) {
    const ttl = out.candidates.length ? HIT_TTL_S : MISS_TTL_S;
    try { await cache.put(cacheKey(gtin), new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } })); } catch { /* best effort */ }
  }
  return out;
}
