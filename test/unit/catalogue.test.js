import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productsFromSitemap, readSitemapIndex, shardNameForUrl, slugToName, oneDigitVariants, sweepPlan } from '../../worker/sitemap.js';
import { extractDetails, okHost } from '../../worker/details.js';

test('sitemap: product URLs give keycode → slug (8 and 9 digit codes); other URLs are ignored', () => {
  const xml = '<urlset><url><loc>https://www.kmart.com.au/product/12-pk-diecast-vehicles-42977636/</loc></url>'
    + '<url><loc>https://www.kmart.com.au/product/memory-foam-bath-mat-green-stripe-110012345/</loc></url>'
    + '<url><loc>https://www.kmart.com.au/category/toys/</loc></url></urlset>';
  assert.deepEqual(productsFromSitemap(xml), { 42977636: '12-pk-diecast-vehicles', 110012345: 'memory-foam-bath-mat-green-stripe' });
  assert.equal(slugToName('memory-foam-bath-mat-green-stripe'), 'Memory Foam Bath Mat Green Stripe');
  assert.equal(slugToName('water-bottle-750-ml'), 'Water Bottle 750ml');
});

test('sitemap index: product files are listed, a product urlset base is recognised, lettered files keep one-letter names', () => {
  const idx = readSitemapIndex('<sitemapindex><sitemap><loc>https://k/sitemap/au/product-sitemap-a.xml</loc></sitemap><sitemap><loc>https://k/category-sitemap.xml</loc></sitemap></sitemapindex>');
  assert.deepEqual(idx, { files: ['https://k/sitemap/au/product-sitemap-a.xml'], baseIsUrlset: false });
  assert.equal(readSitemapIndex('<urlset><url><loc>https://k/product/x-12345678/</loc></url></urlset>').baseIsUrlset, true);
  assert.equal(shardNameForUrl('https://k/sitemap/au/product-sitemap-b.xml'), 'b');
  assert.equal(shardNameForUrl('https://k/sitemap/au/product-sitemap-2024-3.xml?x=1'), '2024-3');
});

test('near-miss: every one-digit variant, in position order', () => {
  const v = oneDigitVariants('12345678');
  assert.equal(v.length, 8 * 9); assert.deepEqual(v[0], { kc: '02345678', position: 0 }); assert.ok(v.some(x => x.kc === '12345679' && x.position === 7));
});

test('two-strike sweep: a file goes only after its grace, and a mass disappearance is held', () => {
  const day = 86_400_000, now = 100 * day;
  const first = sweepPlan({ stored: ['a', 'b', 'c'], goneNow: new Set(['c']), strikes: {}, now });
  assert.deepEqual(first.remove, []); assert.equal(first.strikes.c, now, 'first strike recorded');
  const second = sweepPlan({ stored: ['a', 'b', 'c'], goneNow: new Set(['c']), strikes: first.strikes, now: now + 7 * day });
  assert.deepEqual(second.remove, ['c']); assert.deepEqual(second.strikes, {});
  const back = sweepPlan({ stored: ['a', 'b', 'c'], goneNow: new Set(), strikes: first.strikes, now: now + 7 * day });
  assert.deepEqual(back.strikes, {}, 'a file that comes back clears its strike');
  const stored = 'abcdefghij'.split(''), strikes = Object.fromEntries(stored.slice(0, 5).map(n => [n, now]));
  const mass = sweepPlan({ stored, goneNow: new Set(stored.slice(0, 5)), strikes, now: now + 7 * day });
  assert.deepEqual(mass.remove, []); assert.equal(mass.held, 5);
});

test('details: JSON-LD price and image, a was-price means clearance, only kmart hosts render', () => {
  const html = '<script type="application/ld+json">{"@type":"Product","image":"//img.kmart.test/a.jpg","offers":{"price":"12.00"}}</script><script>{"originPrice":"15.00","discountPrice":"12.00"}</script>';
  assert.deepEqual(extractDetails(html), { price: 12, was: 15, img: 'https://img.kmart.test/a.jpg', clr: true });
  assert.deepEqual(extractDetails('<meta property="og:image" content="javascript:x"><script>{"price": 9}</script>'), { price: 9, was: null, img: null, clr: false });
  assert.equal(okHost('https://www.kmart.com.au/product/x-1/'), true); assert.equal(okHost('https://evil.test/'), false);
});

test('device lookups go in chunks of 50: a screen asking for 120 names gets them all (audit 19 Oct P1)', async () => {
  const { createCatalogue, CHUNK } = await import('../../client/catalogue.js');
  const { memoryStorage } = await import('../../client/storage.js');
  const calls = [];
  // The worker refuses a request for more than 50 codes, as worker/catalogue.js does.
  const transport = { request: async path => { const kcs = new URL('https://x' + path).searchParams.get('kc').split(','); calls.push(kcs.length); if (kcs.length > 50) throw Object.assign(new Error('at most 50'), { status: 400 }); return { items: Object.fromEntries(kcs.map(kc => [kc, kc.endsWith('7') ? null : { kc, name: 'Item ' + kc, url: 'https://www.kmart.com.au/product/x-' + kc + '/' }])) }; } };
  const cat = createCatalogue({ transport, storage: memoryStorage() });
  const codes = Array.from({ length: 120 }, (_, i) => String(43000000 + i));
  const got = await cat.lookupMany(codes);
  assert.equal(CHUNK, 50); assert.deepEqual(calls, [50, 50, 20]);
  assert.equal(got.filter(Boolean).length, 108); assert.equal(got[0].name, 'Item 43000000');
  assert.equal(got[7], null, 'a code no upstream knows');
  // An unreachable worker: those codes answer null and are not asked again straight away.
  const down = { n: 0, request: async () => { down.n += 1; throw new Error('offline'); } };
  const cat2 = createCatalogue({ transport: down, storage: memoryStorage() });
  assert.deepEqual(await cat2.lookupMany(['42977636', '43307685']), [null, null]);
  assert.deepEqual(await cat2.lookupMany(['42977636']), [null]);
  assert.equal(down.n, 1);
});
