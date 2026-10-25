import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSearch, findByBarcode, titleSlug, isIsbn, searchUrl } from '../../worker/apnlookup.js';

const BOOK = '9780241813799';
const tile = (slug, kc) => `<a class="tile" href="/product/${slug}-${kc}/"><img alt=""></a><a href="https://www.kmart.com.au/product/${slug}-${kc}/?colour=1">${slug}</a>`;
const header = '<a href="/category/books/">Books</a><span class="cart">0 items</span>';

test('barcode lookup: a product page, or product data naming the barcode, is a sure match', () => {
  const page = `<html><head><link rel="canonical" href="https://www.kmart.com.au/product/our-perfect-storm-by-carley-fortune-book-43761234/"></head><body>${header}${tile('beach-read-book', '43000001')}</body></html>`;
  assert.deepEqual(readSearch(page, BOOK), { candidates: [{ kc: '43761234', name: 'Our Perfect Storm By Carley Fortune Book', url: 'https://www.kmart.com.au/product/our-perfect-storm-by-carley-fortune-book-43761234/' }], sure: true, why: 'product page' });
  const ld = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Our Perfect Storm', gtin13: BOOK, url: 'https://www.kmart.com.au/product/our-perfect-storm-43761234/' })}</script>`;
  const viaLd = readSearch(`<html>${ld}${tile('other-thing', '43000002')}</html>`, BOOK);
  assert.deepEqual([viaLd.sure, viaLd.candidates.map(c => c.kc)], [true, ['43761234']]);
  const otherLd = readSearch(`<html><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', gtin13: '9341234567893', url: '/product/x-43000003/' })}</script>${tile('our-perfect-storm', '43761234')}</html>`, BOOK);
  assert.equal(otherLd.why, 'results', 'product data for another barcode is not this one');
});

test('barcode lookup: a results page gives its products in order; one result is sure, several are a choice', () => {
  const one = readSearch(`<html>${header}<h1>1 result for “${BOOK}”</h1>${tile('our-perfect-storm-by-carley-fortune-book', '43761234')}</html>`, BOOK);
  assert.deepEqual([one.sure, one.candidates.map(c => c.kc), one.why], [true, ['43761234'], '1 results']);
  const two = readSearch(`<html><div data-cnstrc-num-results="2">${tile('book-a', '43000011')}${tile('book-b', '43000012')}</div>${tile('trending-thing', '43000013')}</html>`, BOOK);
  assert.deepEqual([two.sure, two.candidates.map(c => c.kc)], [false, ['43000011', '43000012']], 'only as many as the results say');
  const unsure = readSearch(`<html>${tile('book-a', '43000011')}</html>`, BOOK);
  assert.deepEqual([unsure.sure, unsure.candidates.length], [false, 1], 'no count: a choice, not a link');
});

test('barcode lookup: no results, and what the page suggests instead, finds nothing', () => {
  for (const msg of ['0 results for 9780241813799', 'Sorry, we couldn’t find anything for 9780241813799', 'No results found', 'We could not find a match']) {
    const r = readSearch(`<html>${header}<p>${msg}</p><h2>You might like</h2>${tile('popular-mug', '43000021')}</html>`, BOOK);
    assert.deepEqual([r.candidates, r.why], [[], 'no results'], msg);
  }
  assert.equal(readSearch(`<html>${header}<p>Search</p></html>`, BOOK).why, 'no product links');
  assert.equal(readSearch(`<html>${header}${tile('a', '43000031')}</html>`, BOOK).candidates.length, 1, 'the cart’s “0 items” is not “0 results”');
});

test('barcode lookup: helpers', () => {
  assert.equal(titleSlug('Our Perfect Storm: A Novel'), 'our-perfect-storm');
  assert.equal(titleSlug('Tom’s Café & Bakery (Book 2)'), 'toms-cafe-and-bakery');
  assert.deepEqual([isIsbn(BOOK), isIsbn('9791234567896'), isIsbn('9341234567893')], [true, true, false]);
  assert.equal(searchUrl({}, BOOK), `https://www.kmart.com.au/search/?searchTerm=${BOOK}`);
  assert.equal(searchUrl({ KMART_SEARCH_URL: 'https://k/s?q={code}&x=1' }, BOOK), `https://k/s?q=${BOOK}&x=1`, 'the address is a setting');
});

// Fakes: Browser Rendering, Google Books and Open Library, the catalogue object, the edge cache.
function fakes({ html = null, renderFails = false, book = null, titles = [] } = {}) {
  const calls = [];
  const fetchImpl = async (u, init) => {
    calls.push(String(u));
    if (String(u).includes('browser-rendering')) return renderFails ? new Response('{}', { status: 500 }) : Response.json({ success: true, result: html, url: JSON.parse(init.body).url });
    if (String(u).includes('googleapis')) return Response.json(book ? { items: [{ volumeInfo: book }] } : { totalItems: 0 });
    if (String(u).includes('openlibrary')) return new Response('not found', { status: 404 });
    throw new Error('unexpected fetch ' + u);
  };
  const searched = [];
  const env = { CF_ACCOUNT_ID: 'acc', BROWSER_TOKEN: 'tok', CATALOGUE: { idFromName: () => 'id', get: () => ({ fetch: async u => { searched.push(new URL(u).searchParams.get('slug')); return Response.json({ items: titles }); } }) } };
  const store = new Map(), cache = { match: async r => store.get(r.url)?.clone(), put: async (r, res) => { store.set(r.url, res); } };
  return { calls, searched, env, cache, store, fetchImpl };
}

test('barcode lookup: Kmart’s search first; the answer is cached by barcode', async () => {
  const f = fakes({ html: `<html><h1>1 result</h1>${tile('our-perfect-storm-by-carley-fortune-book', '43761234')}</html>` });
  const a = await findByBarcode(f.env, BOOK, f);
  assert.deepEqual([a.source, a.sure, a.candidates[0].kc], ['kmart', true, '43761234']);
  assert.ok(JSON.parse(JSON.stringify(f.calls)).some(u => u.includes('browser-rendering')));
  assert.ok(!f.calls.some(u => u.includes('googleapis')), 'the book route is not needed');
  const again = await findByBarcode(f.env, BOOK, f);
  assert.deepEqual([again.cached, again.candidates[0].kc, f.calls.length], [true, '43761234', 1], 'one search per barcode');
});

test('barcode lookup: a book Kmart’s search misses is found by its title; nothing found and no render is not cached', async () => {
  const titles = [{ kc: '43009999', slug: 'our-perfect-storm-poster' }, { kc: '43761234', slug: 'our-perfect-storm-by-carley-fortune-book' }];
  const f = fakes({ html: '<html><p>0 results</p></html>', book: { title: 'Our Perfect Storm: A Novel', authors: ['Carley Fortune'] }, titles });
  const a = await findByBarcode(f.env, BOOK, f);
  assert.deepEqual([a.source, a.sure, a.candidates.map(c => c.kc)], ['isbn', false, ['43761234', '43009999']], 'the one naming the author first; a choice, never a link');
  assert.deepEqual(f.searched, ['our-perfect-storm']);
  // No Browser Rendering: a book still works; anything else is a miss that is tried again later.
  const g = fakes({ book: { title: 'Our Perfect Storm', authors: [] }, titles: [titles[1]] });
  delete g.env.BROWSER_TOKEN;
  const b = await findByBarcode(g.env, BOOK, g);
  assert.deepEqual([b.source, b.candidates.map(c => c.kc)], ['isbn', ['43761234']]);
  const c = await findByBarcode(g.env, '9341234567893', g);
  assert.deepEqual([c.source, c.candidates, /Browser Rendering/.test(c.why)], [null, [], true]);
  assert.equal(g.store.has('https://catalogue.internal/barcode/9341234567893'), false, 'not cached: it may be found once rendering is on');
  const h = fakes({ renderFails: true });
  const d = await findByBarcode(h.env, '9341234567893', h);
  assert.deepEqual([d.candidates, h.store.size], [[], 0], 'a failed render is not cached');
});
