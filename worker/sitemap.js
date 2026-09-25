// Kmart product sitemaps → keycode and name. Pure string work used by the
// catalogue object (and its tests): K2B's sitemap reader, ported.
//
// A product URL ends ".../product/<name-slug>-<keycode>/"; newer stock has
// 9-digit keycodes, so any 6–13 digit tail counts. The name is the slug made
// readable at lookup time (slugToName), never stored twice.

export function productsFromSitemap(xml) {
  const out = {};
  const re = /\/product\/([^<\s]+?)\/?(?=<|\s|$)/g;
  let m;
  while ((m = re.exec(String(xml))) !== null) {
    const k = m[1].replace(/\/+$/, '').match(/^(.+?)-(\d{6,13})$/);
    if (k) out[k[2]] = k[1];
  }
  return out;
}

// What a sitemap index lists: product sitemap files, or the base file is a
// product urlset itself, or neither.
export function readSitemapIndex(xml) {
  const s = String(xml);
  if (/<sitemapindex[\s>]/i.test(s)) {
    const files = [...s.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]).filter(u => /product-sitemap[^/]*\.xml/i.test(u));
    return { files, baseIsUrlset: false };
  }
  return { files: [], baseIsUrlset: /<urlset[\s>]/i.test(s) && /\/product\//.test(s) };
}

// Lettered files keep one-letter shard names (product-sitemap-a.xml → a).
export function shardNameForUrl(u) {
  const base = String(u).split('/').pop().replace(/\.xml.*$/i, '').replace(/[^a-z0-9_-]/gi, '').slice(0, 48) || 'file';
  const m = base.match(/^product-sitemap-([a-z0-9-]+)$/i);
  return (m ? m[1] : base).toLowerCase();
}

export function slugToName(slug) {
  return String(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(Of|And|The|In|For|With|A|An|To)\b/g, w => w.toLowerCase())
    .replace(/^\w/, c => c.toUpperCase())
    .replace(/(\d+)\s*ml\b/gi, '$1ml').replace(/(\d+)\s*cm\b/gi, '$1cm').replace(/(\d+)\s*mm\b/gi, '$1mm')
    .replace(/(\d+)\s*l\b/gi, '$1L').replace(/(\d+)\s*kg\b/gi, '$1kg').replace(/(\d+)\s*g\b/gi, '$1g')
    .replace(/(\d+)\s*pc\b/gi, '$1pc').replace(/(\d+)\s*pk\b/gi, '$1pk')
    .trim();
}
export const productUrl = (kc, slug) => `https://www.kmart.com.au/product/${slug}-${kc}/`;

// The one-digit variants of a keycode (K2B's near-miss), in position order.
export function oneDigitVariants(code) {
  const out = [];
  for (let i = 0; i < code.length; i++) for (let d = 0; d <= 9; d++) { const c = String(d); if (code[i] !== c) out.push({ kc: code.slice(0, i) + c + code.slice(i + 1), position: i }); }
  return out;
}

// K2B's two-strike sweep. A stored shard goes only when its file proved gone
// (a definite 404, or dropped out of the index) on a healthy run AND stayed
// gone past the grace period; many going at once is held as an outage.
export function sweepPlan({ stored, goneNow, strikes = {}, now, graceMs = 6 * 86_400_000 }) {
  const next = {}, confirmed = [];
  for (const name of stored) {
    if (!goneNow.has(name)) continue;
    const first = strikes[name] || now; next[name] = first;
    if (now - first >= graceMs) confirmed.push(name);
  }
  const held = confirmed.length > 3 && confirmed.length > stored.length * 0.25;
  if (!held) for (const n of confirmed) delete next[n];
  return { remove: held ? [] : confirmed, held: held ? confirmed.length : 0, strikes: next };
}
