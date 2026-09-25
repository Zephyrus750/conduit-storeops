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

async function renderPage(url, env, fetchImpl) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/content`;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), RENDER_TIMEOUT_MS);
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${env.BROWSER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, gotoOptions: { waitUntil: 'networkidle2', timeout: 35_000 }, rejectResourceTypes: ['image', 'media', 'font', 'stylesheet'] }),
    });
    const data = await res.json().catch(() => null);
    return data?.success && typeof data.result === 'string' ? { html: data.result } : { err: `render ${res.status}` };
  } catch (e) { return { err: String(e?.name || e).slice(0, 60) }; }
  finally { clearTimeout(timer); }
}

const num = x => { const n = parseFloat(String(x).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
export const isAccessDenied = html => /Access Denied|don't have permission|edgesuite\.net|Reference&#32;&#35;/i.test(html || '');

// Several independent strategies, first hit wins per field (as v1.6).
export function extractDetails(html) {
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
  if (/"(?:isClearance|is_clearance|isOnClearance|onClearance)"\s*:\s*(?:true|1|"true")/i.test(html)) out.clr = true;
  if (out.was && out.price && out.price < out.was) out.clr = true;
  if (out.was && out.price && out.price >= out.was) out.was = null;
  if (out.img && out.img.startsWith('//')) out.img = 'https:' + out.img;
  if (out.img && !/^https:\/\//.test(out.img)) out.img = null;
  return out;
}

// items: [{ kc, u }] → { kc: { found, price, was, img, clr } }
export async function renderDetails(env, items, fetchImpl = fetch) {
  const list = items.filter(it => it?.kc && okHost(it.u)), out = {};
  let next = 0;
  const run = async () => {
    while (next < list.length) {
      const it = list[next++];
      const r = await renderPage(it.u, env, fetchImpl);
      if (!r.html || isAccessDenied(r.html)) { out[it.kc] = { found: false }; continue; }
      const d = extractDetails(r.html);
      out[it.kc] = { found: d.price !== null || d.img !== null, ...d };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, run));
  return out;
}
