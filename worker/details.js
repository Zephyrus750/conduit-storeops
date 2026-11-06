// Product page details: price, was-price, image and a clearance flag, read
// from the public kmart.com.au product page. Ported from the k2b-details
// worker (v1.6): Kmart's bot protection refuses a plain server-side fetch,
// so the page is rendered by Cloudflare Browser Rendering (a real headless
// Chrome) and the fields are lifted out of the HTML. Nothing is stored here;
// the catalogue caches the answer per keycode.
//
// Needs two settings on the Conduit worker (Workers Paid plan):
//   CF_ACCOUNT_ID   plain variable: the account id
//   BROWSER_TOKEN   secret: an API token with Account › Browser Rendering › Edit
// Without them the catalogue falls back to DETAILS_URL (the legacy details
// worker) while it is still deployed, and otherwise answers name and link only.

const ALLOWED_HOSTS = ['www.kmart.com.au', 'kmart.com.au'];
const CONCURRENCY = 2;
const RENDER_TIMEOUT_MS = 45_000;

export const detailsConfigured = env => !!(env?.CF_ACCOUNT_ID && env?.BROWSER_TOKEN);
export function okHost(u) { try { return ALLOWED_HOSTS.includes(new URL(u).hostname); } catch { return false; } }

export async function renderPage(url, env, fetchImpl = fetch) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/content`;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), RENDER_TIMEOUT_MS);
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${env.BROWSER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, gotoOptions: { waitUntil: 'networkidle2', timeout: 35_000 }, rejectResourceTypes: ['image', 'media', 'font', 'stylesheet'] }),
    });
    const data = await res.json().catch(() => null);
    // The API says why it refused (a bad token, the account's browser limit): kept for the owner's picture check.
    return data?.success && typeof data.result === 'string' ? { html: data.result } : { err: `render ${res.status}${data?.errors?.[0]?.message ? `: ${String(data.errors[0].message).slice(0, 120)}` : ''}` };
  } catch (e) { return { err: String(e?.name || e).slice(0, 60) }; }
  finally { clearTimeout(timer); }
}

const num = x => { const n = parseFloat(String(x).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
export const isAccessDenied = html => /Access Denied|don't have permission|edgesuite\.net|Reference&#32;&#35;/i.test(html || '');
// Bot-check and challenge pages a site can answer a headless browser with
// instead of the product page: named, so the owner's picture check says
// "blocked" rather than "no price or picture".
const BLOCKS = [
  ['Access Denied', /Access Denied|don't have permission|edgesuite\.net/i],
  ['Pardon Our Interruption', /Pardon Our Interruption/i],
  ['Akamai challenge', /\/_sec\/cp_challenge|sec-if-cpt-container|bm-verify/i],
  ['Incapsula', /Incapsula|_Incapsula_Resource|Request unsuccessful/i],
  ['PerimeterX', /px-captcha|_pxCaptcha|perimeterx/i],
  ['Kasada', /kpsdk|ips\.js\?/i],
  ['Cloudflare challenge', /cf-chl|challenge-platform|Just a moment\.\.\./i],
  ['a captcha', /captcha|verify you are (a )?human|are you a robot/i],
];
// A challenge page is small; a full product page that merely loads a
// captcha script for its sign-in form is not one (only the two named
// refusal pages count at any size).
export const blockedBy = html => { const h = html || '', hit = BLOCKS.find(([name, re]) => (h.length < 200_000 || name === 'Access Denied' || name === 'Pardon Our Interruption') && re.test(h)); return hit ? hit[0] : null; };
// What a page read actually got, for the picture check: its title and size,
// a block page if it was one, and which of the things the reader looks for
// were on it.
export function describePage(html, kc = '') {
  const h = html || '', title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const ld = /<script[^>]*type="application\/ld\+json"/i.test(h), ldProduct = /"@type"\s*:\s*"Product"/i.test(h);
  const kcPics = kc ? keycodePictures(h, kc).length : 0;
  return { bytes: h.length, title, blocked: blockedBy(h), jsonLd: ld ? (ldProduct ? 'Product' : 'other') : 'none', ogImage: /property="og:image"/i.test(h), nextData: /id="__NEXT_DATA__"/i.test(h), keycodePictures: kcPics, priceText: /\$\s?\d+(?:\.\d{2})?/.test(h.replace(/<[^>]+>/g, ' ')) };
}
export function pageSummary(p) {
  if (p.blocked) return `blocked by kmart.com.au: a ${p.blocked} page (${Math.round(p.bytes / 1024)} KB, title “${p.title}”)`;
  return `no price or picture on the page (title “${p.title || 'none'}”, ${Math.round(p.bytes / 1024)} KB; JSON-LD: ${p.jsonLd}; og:image: ${p.ogImage ? 'yes' : 'none'}; Next.js data: ${p.nextData ? 'yes' : 'none'}; pictures named with the keycode: ${p.keycodePictures}; a $ price in the text: ${p.priceText ? 'yes' : 'none'})`;
}
// Image addresses on the page whose file name carries the keycode (the
// rendered <img> tags and any JSON the page carries, slashes unescaped).
const IMG_EXT = /\.(?:jpe?g|png|webp|avif)(?:[?#][^"'\s<>()\\]*)?$/i;
export function keycodePictures(html, kc) {
  if (!kc) return [];
  const text = String(html || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/'), out = [];
  for (const m of text.matchAll(/(?:https?:)?\/\/[^"'\s<>()\\,]+/g)) {
    const u = m[0].startsWith('//') ? 'https:' + m[0] : m[0];
    if (u.includes(String(kc)) && (IMG_EXT.test(u) || /\/(?:images?|media|assets|transform)\//i.test(u)) && !/\/product\/[^/]*\/?$/i.test(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

// Several independent strategies, first hit wins per field (as v1.6).
export function extractDetails(html, kc = '') {
  const out = { price: null, was: null, img: null, clr: false };
  if (!html) return out;
  for (const block of html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || []) {
    try {
      const data = JSON.parse(block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, ''));
      for (const d of Array.isArray(data) ? data : data['@graph'] || [data]) {
        if (!d || String(d['@type']).toLowerCase() !== 'product') continue;
        const offers = Array.isArray(d.offers) ? d.offers[0] : d.offers;
        if (offers) out.price = out.price || num(offers.price || offers.lowPrice);
        if (!out.img && d.image) out.img = String(Array.isArray(d.image) ? d.image[0] : d.image);
      }
    } catch { /* malformed block: next strategy */ }
  }
  if (out.price === null || out.was === null) {
    const mo = html.match(/"originPrice"\s*:\s*"?(\d+\.?\d{0,2})"?/i), md = html.match(/"discountPrice"\s*:\s*"?(\d+\.?\d{0,2})"?/i);
    const origin = mo ? num(mo[1]) : null, disc = md ? num(md[1]) : null;
    if (disc !== null) { if (out.price === null) out.price = disc; if (origin && origin > disc && out.was === null) out.was = origin; }
    else if (origin !== null && out.price === null) out.price = origin;
  }
  if (out.price === null) { const m = html.match(/"(?:sellPrice|currentPrice|salePrice|price|amount)"\s*:\s*\{?\s*"?(?:amount|value)?"?\s*:?\s*"?(\d+\.?\d{0,2})"?/i); if (m) out.price = num(m[1]); }
  if (out.was === null) { const m = html.match(/"(?:wasPrice|originalPrice|listPrice|rrp|comparisonPrice)"\s*:\s*"?(\d+\.?\d{0,2})"?/i); if (m) out.was = num(m[1]); }
  if (out.img === null) { const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i); if (m) out.img = m[1]; }
  if (out.img === null) { const m = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i) || html.match(/<link[^>]+rel="image_src"[^>]+href="([^"]+)"/i); if (m) out.img = m[1]; }
  // A page drawn by its scripts carries no tags for the picture: the
  // rendered <img> tags and the page's data still name the file, and
  // Kmart's picture files carry the keycode.
  if (out.img === null && kc) out.img = keycodePictures(html, kc)[0] || null;
  if (out.price === null) { const m = html.match(/<meta[^>]+(?:property="(?:product|og):price:amount"|itemprop="price")[^>]+content="(\d+\.?\d{0,2})"/i) || html.match(/itemprop="price"[^>]*>\s*\$?\s*(\d+\.?\d{0,2})/i); if (m) out.price = num(m[1]); }
  if (/"(?:isClearance|is_clearance|isOnClearance|onClearance)"\s*:\s*(?:true|1|"true")/i.test(html)) out.clr = true;
  if (out.was && out.price && out.price < out.was) out.clr = true;
  if (out.was && out.price && out.price >= out.was) out.was = null;
  if (out.img && out.img.startsWith('//')) out.img = 'https:' + out.img;
  if (out.img && out.img.startsWith('/')) out.img = 'https://www.kmart.com.au' + out.img;
  if (out.img && !/^https:\/\//.test(out.img)) out.img = null;
  return out;
}

// items: [{ kc, u }] → { kc: { found, price, was, img, clr } }
// onItem(kc, details) as each page is read, so a caller can keep what it
// has before the rest finish. stopOnRefusal: the first refused or failed
// render stops the batch (Kmart refusing the browser, or the account over
// its browser limit, refuses the next page too); the rest are left out.
export async function renderDetails(env, items, fetchImpl = fetch, { onItem, stopOnRefusal = false } = {}) {
  const list = items.filter(it => it?.kc && okHost(it.u)), out = {};
  let next = 0, refused = false;
  const run = async () => {
    while (next < list.length && !refused) {
      const it = list[next++];
      const r = await renderPage(it.u, env, fetchImpl);
      if (!r.html || isAccessDenied(r.html)) { out[it.kc] = { found: false, why: r.html ? 'refused by kmart.com.au (Access Denied)' : r.err }; if (stopOnRefusal) refused = true; continue; }
      const d = extractDetails(r.html, it.kc), found = d.price !== null || d.img !== null;
      out[it.kc] = { found, ...d, ...(found ? {} : { why: blockedBy(r.html) ? 'blocked by kmart.com.au' : 'no price or picture on the page' }) };
      if (found) onItem?.(it.kc, out[it.kc]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, run));
  return out;
}
