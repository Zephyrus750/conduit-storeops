// CatalogueObject: Conduit's own product catalogue, one Durable Object for
// the whole system. It reads Kmart's public product sitemaps into SQLite
// (keycode → name slug, and which sitemap file it came from) and answers
// lookups and one-digit near-misses. It replaces the legacy suite worker's
// sitemap map (K2B's pm:shard:* KV and its weekly cron), rule for rule:
//
//   - discovery first: the product sitemap index names the files; when it
//     names none, the lettered files a..z are probed;
//   - a staged build, one sitemap file per alarm step, so every heavy parse
//     gets its own CPU budget (K2B used self-requests for the same reason);
//   - a file's rows are replaced wholesale when it is re-read;
//   - a two-strike sweep: a file's rows go only when it proved gone (a 404,
//     or it left the index) on a healthy run AND stayed gone past a 6-day
//     grace; many going at once is held as an outage;
//   - the outcome of every build is recorded (lastbuild) for the console.
//
// Internal fetch (the worker calls it; nothing here is public):
//   GET  /lookup?kc=a,b        → { total, items: { kc: { name, slug, url } | null } }
//   GET  /nearmiss?kc=         → { query, matches: [{ keycode, name, url, position }] }
//   GET  /status               → { total, files, lastbuild, build, collected, next }
//   POST /rebuild { trigger }  → starts a build unless one is running or ran in the last 20 h (force: true overrides)

import { DurableObject } from 'cloudflare:workers';
import { productsFromSitemap, readSitemapIndex, shardNameForUrl, slugToName, productUrl, oneDigitVariants, sweepPlan } from './sitemap.js';
import { json, fail, HttpError } from './http.js';
import { storeParts, DEFAULT_TZ } from '../shared/time.js';

export const SITEMAP_BASE = 'https://www.kmart.com.au/sitemap/au/product-sitemap';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const RECENT_MS = 20 * 3600_000;        // a build that succeeded this recently is not repeated by the schedule
const STALE_BUILD_MS = 2 * 3600_000;    // a build still "running" after this long is abandoned and restarted
const FETCH_TIMEOUT_MS = 25_000;
const UA = { 'User-Agent': 'Conduit-Catalogue/1.0 (store operations; weekly sitemap read)' };

export class CatalogueObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS products (kc TEXT PRIMARY KEY, slug TEXT NOT NULL, shard TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS products_shard ON products(shard);
      CREATE TABLE IF NOT EXISTS shards (name TEXT PRIMARY KEY, count INTEGER NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    // The weekly read is an alarm; a new object (or one woken after a
    // deploy) schedules it. It never starts a build by itself on creation:
    // the owner's "Rebuild now" or the weekly slot does.
    ctx.blockConcurrencyWhile(async () => { if (await ctx.storage.getAlarm() == null) await ctx.storage.setAlarm(this.nextWeekly()); });
  }

  // ── plumbing ──────────────────────────────────────────────────────────
  get(key) { const r = this.sql.exec('SELECT value FROM meta WHERE key = ?', key).toArray()[0]; return r ? JSON.parse(r.value) : null; }
  put(key, v) { if (v == null) this.sql.exec('DELETE FROM meta WHERE key = ?', key); else this.sql.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, JSON.stringify(v)); }
  base() { return String(this.env.SITEMAP_BASE || SITEMAP_BASE).replace(/\.xml$/, ''); }
  total() { return this.sql.exec('SELECT COUNT(*) AS n FROM products').toArray()[0].n; }
  // Mondays 01:00 store time, as K2B's cron ran (before staff arrive).
  nextWeekly(now = Date.now()) {
    const tz = this.env.STORE_TZ || DEFAULT_TZ;
    for (let h = 1; h <= 8 * 24; h++) {
      const t = now + h * 3600_000, p = storeParts(t, tz), dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
      if (dow === 1 && p.hh === 1) return t - p.mm * 60_000;
    }
    return now + 7 * 86_400_000;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /lookup': return json(this.lookup(url.searchParams.get('kc')));
        case 'GET /nearmiss': return json(this.nearMiss(url.searchParams.get('kc')));
        case 'GET /status': return json(await this.status());
        case 'POST /rebuild': { const b = await request.json().catch(() => ({})); return json(await this.startBuild(String(b.trigger || 'owner').slice(0, 20), !!b.force)); }
        default: return fail(404, 'not_found', `catalogue has no ${request.method} ${url.pathname}`);
      }
    } catch (e) {
      if (e instanceof HttpError) return e.toResponse();
      throw e;
    }
  }

  // ── reads ─────────────────────────────────────────────────────────────
  lookup(raw) {
    const codes = [...new Set(String(raw || '').split(',').map(c => c.replace(/\D/g, '')).filter(c => /^\d{6,13}$/.test(c)))].slice(0, 100);
    const items = Object.fromEntries(codes.map(kc => [kc, null]));
    for (let i = 0; i < codes.length; i += 50) {
      const chunk = codes.slice(i, i + 50);
      for (const r of this.sql.exec(`SELECT kc, slug FROM products WHERE kc IN (${chunk.map(() => '?').join(',')})`, ...chunk).toArray()) items[r.kc] = { name: slugToName(r.slug), slug: r.slug, url: productUrl(r.kc, r.slug) };
    }
    return { total: this.total(), items };
  }
  nearMiss(raw) {
    const code = String(raw || '').replace(/\D/g, '');
    if (!/^\d{6,13}$/.test(code)) throw new HttpError(400, 'invalid_request', 'kc must be a keycode of 6 to 13 digits');
    const variants = oneDigitVariants(code), pos = new Map(variants.map(v => [v.kc, v.position])), matches = [];
    for (let i = 0; i < variants.length; i += 60) {
      const chunk = variants.slice(i, i + 60).map(v => v.kc);
      for (const r of this.sql.exec(`SELECT kc, slug FROM products WHERE kc IN (${chunk.map(() => '?').join(',')})`, ...chunk).toArray()) matches.push({ keycode: r.kc, name: slugToName(r.slug), url: productUrl(r.kc, r.slug), position: pos.get(r.kc) });
    }
    matches.sort((a, b) => a.position - b.position);
    return { query: code, found: matches.length > 0, matches };
  }
  async status() {
    const files = this.sql.exec('SELECT name, count, at FROM shards ORDER BY name').toArray();
    const build = this.get('build');
    return {
      total: this.total(), files: files.length, fileCounts: Object.fromEntries(files.map(f => [f.name, f.count])),
      lastbuild: this.get('lastbuild'), collected: this.get('collected'), next: await this.ctx.storage.getAlarm(),
      build: build ? { trigger: build.trigger, started: build.started, phase: build.phase, done: build.i || 0, of: (build.targets || []).length, ingested: build.ingested || 0 } : null,
    };
  }

  // ── build ─────────────────────────────────────────────────────────────
  async startBuild(trigger, force = false) {
    const now = Date.now(), cur = this.get('build');
    if (cur && now - cur.started < STALE_BUILD_MS) return { started: false, reason: 'a build is already running', build: cur.phase };
    const last = this.get('lastbuild');
    if (!force && last && last.status === 'ok' && now - last.at < RECENT_MS) return { started: false, reason: 'built in the last 20 hours', lastbuild: last };
    this.put('build', { id: now, trigger, started: now, phase: 'discover', i: 0, targets: [], filesOk: 0, skipped: 0, errors: 0, ingested: 0, probedGone: [], seen: [], firstError: '' });
    await this.ctx.storage.setAlarm(now + 50);
    return { started: true };
  }

  async alarm() {
    const b = this.get('build');
    if (!b) { await this.startBuild('schedule'); if (!this.get('build')) await this.ctx.storage.setAlarm(this.nextWeekly()); return; }
    try {
      if (b.phase === 'discover') await this.discover(b);
      else if (b.phase === 'ingest') await this.ingestNext(b);
      else await this.finish(b);
    } catch (e) {
      b.errors += 1; b.firstError = b.firstError || String(e?.message || e).slice(0, 180);
      if (b.phase === 'ingest') b.i += 1; else if (b.phase === 'discover') b.phase = 'ingest'; else b.phase = 'done';
    }
    if (this.get('build')) { this.put('build', b); await this.ctx.storage.setAlarm(Date.now() + 50); }
    else await this.ctx.storage.setAlarm(this.nextWeekly());
  }

  async fetchText(url) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); return { status: r.status, text: r.status === 200 ? await r.text() : '' }; }
    finally { clearTimeout(t); }
  }

  // Which files exist? The index first; a..z probing when it names none.
  async discover(b) {
    const base = this.base(), seen = new Set(), targets = [];
    let idx = { files: [], baseIsUrlset: false }, status = 0;
    try { const r = await this.fetchText(base + '.xml'); status = r.status; if (r.status === 200) idx = readSitemapIndex(r.text); } catch { /* discovery failing never stops the build */ }
    if (idx.files.length) for (const u of idx.files) { const name = shardNameForUrl(u); if (!seen.has(name)) { seen.add(name); targets.push({ url: u, name }); } }
    else for (const l of LETTERS) { seen.add(l); targets.push({ url: `${base}-${l}.xml`, name: l }); }
    if (idx.baseIsUrlset && !seen.has('base')) { seen.add('base'); targets.push({ url: base + '.xml', name: 'base' }); }
    Object.assign(b, { phase: 'ingest', targets, seen: [...seen], indexUsed: idx.files.length > 0, discovery: idx.files.length ? `index:${targets.length} files` : 'letter-probe', indexStatus: status });
  }

  // One sitemap file per step: its rows are replaced wholesale.
  async ingestNext(b) {
    const t = b.targets[b.i];
    if (!t) { b.phase = 'finish'; return; }
    b.i += 1;
    const r = await this.fetchText(t.url);
    if (r.status !== 200) { b.skipped += 1; if (r.status === 404) b.probedGone.push(t.name); return; }
    const found = productsFromSitemap(r.text), n = Object.keys(found).length;
    if (!n) { b.errors += 1; b.firstError = b.firstError || `no products in sitemap ${t.name}`; return; }
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM products WHERE shard = ?', t.name);
      for (const [kc, slug] of Object.entries(found)) this.sql.exec('INSERT OR REPLACE INTO products (kc, slug, shard) VALUES (?, ?, ?)', kc, slug, t.name);
      this.sql.exec('INSERT OR REPLACE INTO shards (name, count, at) VALUES (?, ?, ?)', t.name, n, Date.now());
    });
    this.put('collected', Date.now());
    b.filesOk += 1; b.ingested += n;
  }

  async finish(b) {
    const now = Date.now();
    let staleCleaned = 0, sweepHeld = 0;
    if (b.errors === 0 && b.filesOk > 0) {
      const stored = this.sql.exec('SELECT name FROM shards').toArray().map(r => r.name);
      const goneNow = new Set(b.probedGone);
      if (b.indexUsed) for (const n of stored) if (!b.seen.includes(n)) goneNow.add(n);
      const plan = sweepPlan({ stored, goneNow, strikes: this.get('gone') || {}, now });
      this.ctx.storage.transactionSync(() => {
        for (const n of plan.remove) { this.sql.exec('DELETE FROM products WHERE shard = ?', n); this.sql.exec('DELETE FROM shards WHERE name = ?', n); }
      });
      staleCleaned = plan.remove.length; sweepHeld = plan.held;
      this.put('gone', plan.strikes);
    }
    const total = this.total();
    const status = total > 0 && b.errors === 0 ? 'ok' : total > 0 ? 'partial' : 'failed';
    this.put('lastbuild', { at: now, status, total, filesOk: b.filesOk, filesSkipped: b.skipped, errors: b.errors, ingested: b.ingested, ms: now - b.started, trigger: b.trigger, discovery: b.discovery, ...(staleCleaned ? { staleCleaned } : {}), ...(sweepHeld ? { sweepHeld } : {}), ...(b.firstError ? { reason: b.firstError } : {}) });
    this.put('build', null);
  }
}
