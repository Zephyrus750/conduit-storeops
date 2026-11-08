import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productsFromSitemap, readSitemapIndex, shardNameForUrl, slugToName, oneDigitVariants, sweepPlan } from '../../worker/sitemap.js';
import { extractDetails, okHost, pageGtins } from '../../worker/details.js';
import { catalogueNames } from '../../worker/catalogue.js';

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
  // An unreachable worker: those codes are unknown (undefined, never "not in
  // the catalogue") and are not asked again straight away.
  const down = { n: 0, request: async () => { down.n += 1; throw new Error('offline'); } };
  const cat2 = createCatalogue({ transport: down, storage: memoryStorage() });
  assert.deepEqual(await cat2.lookupMany(['42977636', '43307685']), [undefined, undefined]);
  assert.deepEqual(await cat2.lookupMany(['42977636']), [undefined]);
  assert.equal(down.n, 1);
});

test('device cache: an answer with no picture and no price is asked again after THIN_MS; a full one keeps a week', async () => {
  const { createCatalogue, THIN_MS } = await import('../../client/catalogue.js');
  const { memoryStorage } = await import('../../client/storage.js');
  const storage = memoryStorage(), asked = [], old = Date.now() - THIN_MS - 60_000;
  await storage.set('kc:41000001', { at: old, item: { kc: '41000001', name: 'Thin', url: 'u', img: null, price: null } });
  await storage.set('kc:41000002', { at: old, item: { kc: '41000002', name: 'Full', url: 'u', img: 'https://img.test/a.jpg', price: 9 } });
  await storage.set('kc:41000003', { at: Date.now() - 60_000, item: { kc: '41000003', name: 'Thin, fresh', url: 'u', img: null, price: null } });
  const transport = { request: async path => { const kcs = new URL('https://x' + path).searchParams.get('kc').split(','); asked.push(...kcs); return { items: Object.fromEntries(kcs.map(kc => [kc, { kc, name: 'Now with a picture', url: 'u', img: 'https://img.test/' + kc + '.jpg', price: 5 }])) }; } };
  const cat = createCatalogue({ transport, storage });
  const [a, b, c] = await cat.lookupMany(['41000001', '41000002', '41000003']);
  assert.deepEqual(asked, ['41000001'], 'only the stale thin answer is asked again');
  assert.equal(a.img, 'https://img.test/41000001.jpg'); assert.equal(b.name, 'Full'); assert.equal(c.name, 'Thin, fresh');
});

test('device: null only when the worker says so; a code it left out is unknown, asked again after the back-off', async () => {
  const { createCatalogue } = await import('../../client/catalogue.js');
  const { memoryStorage } = await import('../../client/storage.js');
  let n = 0;
  // The worker's catalogue was down for 43000002: it is left out of items.
  const transport = { request: async () => { n += 1; return { items: { 43000001: null, ...(n > 1 ? { 43000002: { kc: '43000002', name: 'Back', url: 'u' } } : {}) } }; } };
  const cat = createCatalogue({ transport, storage: memoryStorage() });
  assert.deepEqual(await cat.lookupMany(['43000001', '43000002']), [null, undefined]);
  assert.deepEqual(await cat.lookupMany(['43000001', '43000002']), [null, undefined]);
  assert.equal(n, 1, 'neither is asked again at once (a view repainting would ask without end)');
  const real = Date.now; Date.now = () => real() + 130_000;
  try { const [miss, back] = await cat.lookupMany(['43000001', '43000002']); assert.equal(miss, null); assert.equal(back.name, 'Back'); }
  finally { Date.now = real; }
  assert.equal(n, 2, 'the miss is remembered; the unknown code is asked again after the back-off');
  // Not a keycode (the worker takes 6 to 9 digits): not in the catalogue, never asked.
  assert.deepEqual(await cat.lookupMany(['4300000123', '930012345678']), [null, null]); assert.equal(n, 2);
});

// The worker's lookup with a stand-in edge cache and upstreams.
const edge = () => { const m = new Map(); return { m, match: async q => m.has(q.url) ? new Response(m.get(q.url)) : undefined, put: async (q, r) => { m.set(q.url, await r.text()); } }; };
const bg = () => { const jobs = []; return { jobs, waitUntil: p => jobs.push(p), settle: () => Promise.all(jobs) }; };

test('worker: names never wait on product pages; slow pages land in the cache for the next ask', async () => {
  const { lookup } = await import('../../worker/catalogue.js');
  const calls = { lookup: 0, details: 0 }, cache = edge(), ctx = bg();
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith('https://lookup.test')) { calls.lookup += 1; return Response.json({ 42977636: { found: true, url: 'https://www.kmart.com.au/product/x-42977636/', name: 'Diecast' }, 99999999: { found: false } }); }
    calls.details += 1; await new Promise(r => setTimeout(r, 800));
    return Response.json({ 42977636: { found: true, price: 12, img: 'https://img.test/a.jpg' } });
  };
  const env = { LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test' };
  const t0 = Date.now(), items = await lookup(env, ctx, ['42977636', '99999999'], { fetchImpl, cache, budgetMs: 20 });
  assert.ok(Date.now() - t0 < 500, 'answered before the page was read');
  assert.equal(items['42977636'].name, 'Diecast'); assert.equal(items['42977636'].price, null); assert.equal(items['99999999'], null);
  await ctx.settle();
  const again = await lookup(env, bg(), ['42977636', '99999999'], { fetchImpl, cache, budgetMs: 20 });
  assert.equal(again['42977636'].price, 12); assert.equal(again['42977636'].img, 'https://img.test/a.jpg');
  assert.deepEqual(calls, { lookup: 1, details: 1 }, 'the second ask is the cache');
});

test('worker: a page that cannot be read waits an hour; a catalogue that cannot answer is unknown, not a miss', async () => {
  const { lookup } = await import('../../worker/catalogue.js');
  let details = 0, lookups = 0, up = false;
  const fetchImpl = async url => {
    if (String(url).startsWith('https://lookup.test')) { lookups += 1; if (!up) throw new Error('down'); return Response.json({ 43307685: { found: true, url: 'https://www.kmart.com.au/product/y-43307685/', name: 'Mug' } }); }
    details += 1; return new Response('refused', { status: 500 });
  };
  const env = { LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test' }, cache = edge();
  const down = await lookup(env, bg(), ['43307685'], { fetchImpl, cache, budgetMs: 50 });
  assert.ok(!('43307685' in down), 'left out: not "not in the catalogue"'); assert.equal(cache.m.size, 0, 'and nothing cached');
  up = true;
  const a = bg(), first = await lookup(env, a, ['43307685'], { fetchImpl, cache, budgetMs: 50 }); await a.settle();
  assert.equal(first['43307685'].name, 'Mug'); assert.equal(details, 1);
  const second = await lookup(env, bg(), ['43307685'], { fetchImpl, cache, budgetMs: 50 });
  assert.equal(second['43307685'].name, 'Mug'); assert.equal(details, 1, 'the refused page is not asked again within the hour');
  const later = await lookup(env, bg(), ['43307685'], { fetchImpl, cache, budgetMs: 50, now: () => Date.now() + 3_700_000 });
  assert.equal(later['43307685'].name, 'Mug'); assert.equal(details, 2, 'and is tried again after it'); assert.equal(lookups, 2);
});

test('worker: when Browser Rendering is refused, the legacy details worker reads the pages; one refusal stops the batch', async () => {
  const { lookup } = await import('../../worker/catalogue.js');
  const calls = { render: 0, legacy: 0 }, cache = edge(), ctx = bg();
  const codes = ['42977636', '43302210', '43307685'];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://lookup.test')) return Response.json(Object.fromEntries(codes.map(kc => [kc, { found: true, url: `https://www.kmart.com.au/product/x-${kc}/`, name: 'P' + kc }])));
    if (u.startsWith('https://api.cloudflare.com')) { calls.render += 1; return Response.json({ success: true, result: '<html><h1>Access Denied</h1></html>' }); }
    calls.legacy += 1; const b = JSON.parse(init.body);
    return Response.json(Object.fromEntries(b.items.map(i => [i.kc, { found: true, price: 5, img: `https://img.test/${i.kc}.jpg` }])));
  };
  const env = { LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test', CF_ACCOUNT_ID: 'acc', BROWSER_TOKEN: 'tok' };
  const items = await lookup(env, ctx, codes, { fetchImpl, cache, budgetMs: 2000 });
  await ctx.settle();
  assert.deepEqual(codes.map(kc => items[kc].img), codes.map(kc => `https://img.test/${kc}.jpg`));
  assert.ok(calls.render <= 2, 'a refusal stops Browser Rendering for the batch (two in flight at most)'); assert.equal(calls.legacy, 1);
});

test('worker: a page still being read is not started again; one never reached is tried two minutes later', async () => {
  const { lookup } = await import('../../worker/catalogue.js');
  let details = 0; const cache = edge();
  const fetchImpl = async url => {
    if (String(url).startsWith('https://lookup.test')) return Response.json({ 43350121: { found: true, url: 'https://www.kmart.com.au/product/z-43350121/', name: 'Lamp' } });
    details += 1; return new Promise(() => {});   // the background time runs out before it answers
  };
  const env = { LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test' };
  await lookup(env, bg(), ['43350121'], { fetchImpl, cache, budgetMs: 10 });
  await lookup(env, bg(), ['43350121'], { fetchImpl, cache, budgetMs: 10 });
  assert.equal(details, 1, 'not started twice while it is being read');
  await lookup(env, bg(), ['43350121'], { fetchImpl, cache, budgetMs: 10, now: () => Date.now() + 130_000 });
  assert.equal(details, 2, 'started again once the two minutes have passed');
});

test('worker: the owner picture check reports each step', async () => {
  const { probe } = await import('../../worker/catalogue.js');
  const page = '<script type="application/ld+json">{"@type":"Product","image":"https://img.test/a.jpg","offers":{"price":"12.00"}}</script>';
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://lookup.test')) return Response.json({ 42977636: { found: true, url: 'https://www.kmart.com.au/product/x-42977636/', name: 'Diecast' } });
    if (u.startsWith('https://api.cloudflare.com')) return Response.json({ success: true, result: page });
    if (u.startsWith('https://details.test')) return new Response('down', { status: 503 });
    if (u === 'https://img.test/a.jpg') return new Response('x', { headers: { 'Content-Type': 'image/jpeg' } });
    return new Response('?', { status: 404 });
  };
  const p = await probe({ LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test', CF_ACCOUNT_ID: 'acc', BROWSER_TOKEN: 'tok' }, '42977636', fetchImpl);
  assert.equal(p.link.ok, true); assert.equal(p.browser.ok, true); assert.equal(p.browser.img, 'https://img.test/a.jpg'); assert.equal(p.browser.price, 12);
  assert.deepEqual([p.legacy.ok, p.legacy.why], [false, 'answered 503']);
  assert.deepEqual([p.image.ok, p.image.type], [true, 'image/jpeg']);
  const refused = await probe({ LOOKUP_URL: 'https://lookup.test', CF_ACCOUNT_ID: 'acc', BROWSER_TOKEN: 'tok' }, '42977636', async (url, init) => String(url).startsWith('https://api.cloudflare.com') ? Response.json({ success: false, errors: [{ message: 'Rate limit exceeded' }] }, { status: 429 }) : fetchImpl(url, init));
  assert.equal(refused.browser.why, 'render 429: Rate limit exceeded'); assert.equal(refused.legacy.why, 'not configured (DETAILS_URL)'); assert.equal(refused.image, null);
});

test('device: a code not in the catalogue is kept for the rest of the day, across a reload', async () => {
  const { createCatalogue, deviceDay } = await import('../../client/catalogue.js');
  const { memoryStorage } = await import('../../client/storage.js');
  let n = 0;
  const transport = { request: async () => { n += 1; return { items: { 43000001: null } }; } };
  const storage = memoryStorage();
  assert.equal(await createCatalogue({ transport, storage }).lookup('43000001'), null);
  assert.equal(n, 1);
  // A reload: a new catalogue on the same device storage answers without asking.
  assert.equal(await createCatalogue({ transport, storage }).lookup('43000001'), null);
  assert.equal(n, 1, 'the miss was kept on the device');
  assert.equal((await storage.get('kc:43000001')).day, deviceDay());
  // The next day it is asked again.
  const real = Date.now; Date.now = () => real() + 86_400_000;
  try { assert.equal(await createCatalogue({ transport, storage }).lookup('43000001'), null); }
  finally { Date.now = real; }
  assert.equal(n, 2, 'asked again the next day');
});

test('device: an answer without a picture is asked again after 30 minutes, and a picture it already had is kept', async () => {
  const { createCatalogue, PART_MS } = await import('../../client/catalogue.js');
  const { memoryStorage } = await import('../../client/storage.js');
  const storage = memoryStorage(), asked = [], t = Date.now();
  await storage.set('kc:41000011', { at: t - PART_MS - 60_000, item: { kc: '41000011', name: 'Priced, no picture', url: 'u', img: null, price: 9, at: t - PART_MS } });
  await storage.set('kc:41000012', { at: t - 60_000, item: { kc: '41000012', name: 'Priced, no picture, just asked', url: 'u', img: null, price: 9, at: t } });
  const transport = { request: async path => { const kcs = new URL('https://x' + path).searchParams.get('kc').split(','); asked.push(...kcs); return { items: Object.fromEntries(kcs.map(kc => [kc, { kc, name: 'Now with a picture', url: 'u', img: 'https://img.test/' + kc + '.jpg', price: 9, at: Date.now() }])) }; } };
  const [a, b] = await createCatalogue({ transport, storage }).lookupMany(['41000011', '41000012']);
  assert.deepEqual(asked, ['41000011'], 'not kept for a week: asked again once the 30 minutes have passed');
  assert.equal(a.img, 'https://img.test/41000011.jpg'); assert.equal(b.img, null);
  // A week-old full answer is asked again; the worker answers without a picture: the one the device had stays.
  await storage.set('kc:41000013', { at: t - 8 * 86_400_000, item: { kc: '41000013', name: 'Mug', url: 'u', img: 'https://img.test/mug.jpg', price: 4, at: t - 8 * 86_400_000 } });
  const bare = { request: async () => ({ items: { 41000013: { kc: '41000013', name: 'Mug', url: 'u', img: null, price: 5, at: Date.now() } } }) };
  const c = await createCatalogue({ transport: bare, storage }).lookup('41000013');
  assert.equal(c.img, 'https://img.test/mug.jpg'); assert.equal(c.price, 5, 'the new price is taken');
  assert.equal((await storage.get('kc:41000013')).item.img, 'https://img.test/mug.jpg');
});

test('worker: a read that finds no picture is read again after 30 minutes, then an hour, until one is found', async () => {
  const { lookup, nopicTtl } = await import('../../worker/catalogue.js');
  assert.deepEqual([1, 2, 3, 7].map(nopicTtl), [1800, 3600, 7200, 86400], '30 min, doubling, at most a day');
  let reads = 0, pic = false; const cache = edge();
  const fetchImpl = async url => {
    if (String(url).startsWith('https://lookup.test')) return Response.json({ 43350130: { found: true, url: 'https://www.kmart.com.au/product/vase-43350130/', name: 'Vase' } });
    reads += 1; return Response.json({ 43350130: { found: true, price: 8, img: pic ? 'https://img.test/vase.jpg' : null } });
  };
  const env = { LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test' }, t0 = Date.now();
  const ask = async mins => { const c = bg(); const items = await lookup(env, c, ['43350130'], { fetchImpl, cache, budgetMs: 500, now: () => t0 + mins * 60_000 }); await c.settle(); return items['43350130']; };
  assert.equal((await ask(0)).img, null); assert.equal(reads, 1);
  await ask(20); assert.equal(reads, 1, 'not read again within 30 minutes');
  await ask(31); assert.equal(reads, 2, 'read again after 30 minutes');
  await ask(31 + 50); assert.equal(reads, 2, 'the second try waits an hour');
  pic = true;
  assert.equal((await ask(31 + 61)).img, 'https://img.test/vase.jpg'); assert.equal(reads, 3);
  await ask(31 + 61 + 120); assert.equal(reads, 3, 'with a picture, the daily refresh again');
});

test('worker: a picture once found is kept, and fills answers when the cache is gone and pages cannot be read', async () => {
  const { lookup } = await import('../../worker/catalogue.js');
  const pics = new Map(), posts = [];
  const CATALOGUE = { idFromName: () => 'catalogue', get: () => ({ fetch: async (url, init) => {
    const u = new URL(url);
    if (u.pathname === '/pictures' && init?.method === 'POST') { const b = JSON.parse(init.body); posts.push(b.items); for (const [k, v] of Object.entries(b.items)) pics.set(k, v); return Response.json({ kept: Object.keys(b.items).length }); }
    if (u.pathname === '/pictures') return Response.json({ items: Object.fromEntries(u.searchParams.get('kc').split(',').filter(k => pics.has(k)).map(k => [k, pics.get(k)])) });
    return Response.json({ total: 0, items: {} });   // not built yet: links come from the legacy lookup
  } }) };
  let pages = true;
  const fetchImpl = async url => {
    if (String(url).startsWith('https://lookup.test')) return Response.json({ 43350140: { found: true, url: 'https://www.kmart.com.au/product/rug-43350140/', name: 'Rug' } });
    return pages ? Response.json({ 43350140: { found: true, price: 25, img: 'https://img.test/rug.jpg' } }) : new Response('refused', { status: 500 });
  };
  const env = { LOOKUP_URL: 'https://lookup.test', DETAILS_URL: 'https://details.test', CATALOGUE };
  const c = bg(); assert.equal((await lookup(env, c, ['43350140'], { fetchImpl, cache: edge(), budgetMs: 500 }))['43350140'].img, 'https://img.test/rug.jpg'); await c.settle();
  assert.deepEqual(posts, [{ 43350140: 'https://img.test/rug.jpg' }], 'the picture went to the catalogue object');
  // A new colo (empty edge cache) while product pages are refused: the kept picture still shows.
  pages = false;
  const d = bg(), cold = edge(), r = (await lookup(env, d, ['43350140'], { fetchImpl, cache: cold, budgetMs: 500 }))['43350140']; await d.settle();
  assert.equal(r.img, 'https://img.test/rug.jpg'); assert.equal(r.name, 'Rug');
  assert.equal(JSON.parse([...cold.m.values()][0]).img, 'https://img.test/rug.jpg', 'and the cached answer carries it');
  // An anonymous caller (no page reads) gets it too.
  assert.equal((await lookup(env, bg(), ['43350140'], { fetchImpl, cache: edge(), upstream: false }))['43350140'].img, 'https://img.test/rug.jpg');
  assert.equal(posts.length, 1, 'nothing new to keep');
});

test('details: a page drawn by its scripts still gives its picture (the file carries the keycode) and a marked-up price', async () => {
  const { extractDetails, keycodePictures } = await import('../../worker/details.js');
  const rendered = '<html><head><title>1.7L Cordless Kettle | Kmart</title></head><body><img src="https://assets.example/logo.svg"><img alt="" src="https://assets.kmart.example/transform/v1/41989326_1.jpg?w=600"><span itemprop="price" content="29.00">$29</span></body></html>';
  assert.deepEqual(extractDetails(rendered, '41989326'), { price: 29, was: null, img: 'https://assets.kmart.example/transform/v1/41989326_1.jpg?w=600', clr: false });
  // In the page's own data, with escaped slashes; the product page link itself is not a picture.
  const data = '<a href="https://www.kmart.com.au/product/kettle-41989326/">x</a><script id="__NEXT_DATA__">{"images":[{"url":"https:\\/\\/media.kmart.example\\/images\\/41989326-2.webp"}]}</script>';
  assert.deepEqual(keycodePictures(data, '41989326'), ['https://media.kmart.example/images/41989326-2.webp']);
  assert.equal(extractDetails(data, '41989326').img, 'https://media.kmart.example/images/41989326-2.webp');
  assert.equal(extractDetails(data).img, null, 'without the keycode there is nothing to match');
  // A root-relative og:image is completed on kmart.com.au.
  assert.equal(extractDetails('<meta property="og:image" content="/images/41989326.jpg">').img, 'https://www.kmart.com.au/images/41989326.jpg');
});

test('details: the picture check names a block page, and says what an ordinary page was missing', async () => {
  const { describePage, pageSummary, blockedBy } = await import('../../worker/details.js');
  const block = '<html><head><title>Pardon Our Interruption</title></head><body>As you were browsing something about your browser made us think you were a bot.</body></html>';
  assert.equal(blockedBy(block), 'Pardon Our Interruption');
  assert.match(pageSummary(describePage(block, '41989326')), /^blocked by kmart\.com\.au: a Pardon Our Interruption page/);
  const big = '<title>Kettle | Kmart</title><script src="https://www.google.com/recaptcha/api.js"></script>' + 'x'.repeat(250_000);
  assert.equal(blockedBy(big), null, 'a full page that loads a captcha script for its sign-in is not a block page');
  const p = describePage('<title>Kettle | Kmart</title><script id="__NEXT_DATA__">{}</script><p>$29</p>', '41989326');
  assert.deepEqual([p.title, p.jsonLd, p.ogImage, p.nextData, p.keycodePictures, p.priceText, p.blocked], ['Kettle | Kmart', 'none', false, true, 0, true, null]);
  assert.match(pageSummary(p), /no price or picture on the page \(title “Kettle \| Kmart”.*JSON-LD: none; og:image: none; Next\.js data: yes; pictures named with the keycode: 0; a \$ price in the text: yes\)/);
});

test('sitemap: a product sitemap that names its pictures gives keycode → picture (first one, https only)', async () => {
  const { picturesFromSitemap } = await import('../../worker/sitemap.js');
  const xml = '<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' +
    '<url><loc>https://www.kmart.com.au/product/1.7l-cordless-kettle-41989326/</loc><image:image><image:loc>https://assets.kmart.example/images/41989326-1.jpg?w=800&amp;q=80</image:loc></image:image><image:image><image:loc>https://assets.kmart.example/images/41989326-2.jpg</image:loc></image:image></url>' +
    '<url><loc><![CDATA[https://www.kmart.com.au/product/mug-43307685/]]></loc><image:image><image:loc><![CDATA[https://assets.kmart.example/images/43307685.webp]]></image:loc></image:image></url>' +
    '<url><loc>https://www.kmart.com.au/product/no-picture-43302210/</loc></url>' +
    '<url><loc>https://www.kmart.com.au/product/plain-http-43166022/</loc><image:image><image:loc>http://insecure.example/43166022.jpg</image:loc></image:image></url></urlset>';
  assert.deepEqual(picturesFromSitemap(xml), { 41989326: 'https://assets.kmart.example/images/41989326-1.jpg?w=800&q=80', 43307685: 'https://assets.kmart.example/images/43307685.webp' });
  assert.deepEqual(picturesFromSitemap('<urlset><url><loc>https://www.kmart.com.au/product/x-42977636/</loc></url></urlset>'), {});
});

test('product page: the barcodes its data names, check digits verified', () => {
  const page = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', gtin13: '9341234567893', sku: '43300411' })}</script><script>{"ean":"9341234567890","barcode":"12345"}</script>`;
  assert.deepEqual(pageGtins(page), ['9341234567893'], 'a bad check digit or a short number is not a barcode');
  assert.deepEqual(pageGtins('<p>nothing</p>'), []);
});

test('product names for a scan’s answer come from the catalogue’s table, and never hold the answer up', async () => {
  const env = fetch => ({ CATALOGUE: { idFromName: n => n, get: () => ({ fetch }) } });
  const asked = [];
  const quick = env(async url => { asked.push(url); return new Response(JSON.stringify({ total: 2, items: { 43652214: { name: 'Travel Ribbed Pots', slug: 'travel-ribbed-pots', url: 'u' }, 43577460: null } })); });
  assert.deepEqual(await catalogueNames(quick, ['43652214', '43577460']), { 43652214: 'Travel Ribbed Pots' }, 'a code the catalogue does not know has no name');
  assert.deepEqual(asked, ['https://catalogue/lookup?kc=43652214,43577460'], 'one read of its table, no product page');
  const t0 = Date.now();
  assert.deepEqual(await catalogueNames(env(() => new Promise(() => {})), ['43652214'], 30), {}, 'a slow catalogue: the answer goes without the name');
  assert.ok(Date.now() - t0 < 500);
  assert.deepEqual(await catalogueNames(env(async () => { throw new Error('down'); }), ['43652214']), {}, 'a catalogue that fails: no name');
  assert.deepEqual(await catalogueNames({}, ['43652214']), {}, 'no catalogue bound: no name');
});
