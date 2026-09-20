// RegistryObject: one Durable Object for the whole system. It knows every
// store, its credentials (hashed), entitlements and status, issues and
// rotates refresh tokens, and enforces sign-in lockout. Owner actions are
// logged here so the admin console has its own tail.
//
// The worker talks to it over an internal fetch with a JSON body:
//   POST /signin        { store, pin, device }             → { store, roles, caps } | error
//   POST /unlock        { store, code }                    → { role } | error
//   POST /refresh/issue { store, device, roles, owner }    → { refresh }
//   POST /refresh/use   { refresh }                        → { store, device, roles, owner, refresh } | error
//   GET  /stores                                           → public list
//   GET  /stores/_all                                      → full records (owner)
//   GET  /stores/:no                                       → full record (owner)
//   POST /stores        { no, name, region, pin, codes, entitlements } (owner)
//   PATCH /stores/:no   { entitlements?, status?, pin?, codes?, name?, region? } (owner)
//   POST /lockout/fail  { key }   POST /lockout/clear { key }   (used by owner sign-in)
//   GET  /actions                                          → owner action tail
//   POST /log          { type, store, detail }             → append an owner action
//
// Store status: 'registered' (no areas live), 'migrating', 'live', 'legacy'.

import { DurableObject } from 'cloudflare:workers';
import { hashSecret, verifySecret, randomToken, sha256 } from './auth.js';
import { HttpError, json } from './http.js';

const ALL_AREAS = ['floor', 'stockroom', 'backdock'];
const CODE_ROLES = { stockroom: 'stockroom', dock: 'dock', manager: 'manager' };
// Area and manager codes are compared case-insensitively with spaces and
// hyphens removed, so SR-7304, sr 7304 and SR7304 are the same code.
const normCode = c => String(c ?? '').toUpperCase().replace(/[\s-]/g, '');

export class RegistryObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        no TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT, format TEXT,
        status TEXT NOT NULL DEFAULT 'registered',
        pin_hash TEXT NOT NULL,
        codes TEXT NOT NULL,          -- JSON { stockroom, dock, manager } of hashes
        entitlements TEXT NOT NULL,   -- JSON { floor, stockroom, backdock } booleans
        areas TEXT NOT NULL,          -- JSON { floor: 'legacy'|'migrating'|'live', ... }
        map_version TEXT,
        created TEXT NOT NULL, updated TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS refresh (
        hash TEXT PRIMARY KEY, store TEXT, device TEXT, roles TEXT, owner INTEGER NOT NULL DEFAULT 0,
        issued TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lockout (key TEXT PRIMARY KEY, fails INTEGER NOT NULL, until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS actions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, type TEXT NOT NULL, store TEXT, detail TEXT
      );
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    try {
      return json(await this.route(request.method, parts, body));
    } catch (e) {
      if (e instanceof HttpError) return e.toResponse();
      throw e;
    }
  }

  async route(method, p, body) {
    const key = `${method} /${p[0] || ''}${p.length > 1 ? '/*' : ''}`;
    switch (key) {
      case 'POST /signin': return this.signin(body);
      case 'POST /unlock': return this.unlock(body);
      case 'POST /refresh/*': return p[1] === 'issue' ? this.issueRefresh(body) : this.useRefresh(body);
      case 'GET /stores': return this.publicList();
      case 'GET /stores/*': return p[1] === '_all' ? this.fullList() : this.record(p[1]);
      case 'POST /stores': return this.register(body);
      case 'PATCH /stores/*': return this.patch(p[1], body);
      case 'POST /lockout/*':
        if (p[1] === 'fail') return this.fail(body.key);
        if (p[1] === 'check') { this.checkLocked(body.key); return { ok: true }; }
        return this.clear(body.key);
      case 'GET /actions': return this.actions();
      case 'POST /log': this.log(String(body.type || 'note'), body.store || null, body.detail || {}); return { ok: true };
      default: throw new HttpError(404, 'not_found', `registry has no ${key}`);
    }
  }

  // ── sign-in and lockout ───────────────────────────────────────────────
  async signin({ store, pin, device }) {
    const key = `signin:${store}:${device || 'nodevice'}`;
    this.checkLocked(key);
    const row = this.get(store);
    if (!row) throw new HttpError(404, 'not_registered', `store ${store} is not registered`);
    if (!(await verifySecret(String(pin ?? ''), row.pin_hash))) {
      this.fail(key);
      throw new HttpError(403, 'unauthorised', 'wrong PIN');
    }
    this.clear(key);
    return { store: row.no, name: row.name, roles: ['floor'], caps: this.caps(row), status: row.status };
  }

  async unlock({ store, code }) {
    const key = `unlock:${store}`;
    this.checkLocked(key);
    const row = this.get(store);
    if (!row) throw new HttpError(404, 'not_registered', `store ${store} is not registered`);
    const codes = JSON.parse(row.codes);
    for (const [name, role] of Object.entries(CODE_ROLES)) {
      if (codes[name] && await verifySecret(normCode(code), codes[name])) { this.clear(key); return { role }; }
    }
    this.fail(key);
    throw new HttpError(403, 'unauthorised', 'wrong code');
  }

  checkLocked(key) {
    const row = this.sql.exec('SELECT fails, until FROM lockout WHERE key = ?', key).toArray()[0];
    if (row && row.until > Date.now()) {
      throw new HttpError(429, 'locked_out', 'too many attempts', { retryAfter: Math.ceil((row.until - Date.now()) / 1000) });
    }
  }
  fail(key) {
    const max = Number(this.env.LOCKOUT_ATTEMPTS || 5), secs = Number(this.env.LOCKOUT_SECONDS || 900);
    const row = this.sql.exec('SELECT fails FROM lockout WHERE key = ?', key).toArray()[0];
    const fails = (row?.fails || 0) + 1;
    const until = fails >= max ? Date.now() + secs * 1000 : 0;
    this.sql.exec('INSERT INTO lockout (key, fails, until) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, until = excluded.until', key, until ? 0 : fails, until);
    return { fails, until };
  }
  clear(key) { this.sql.exec('DELETE FROM lockout WHERE key = ?', key); return { ok: true }; }

  // ── refresh tokens ────────────────────────────────────────────────────
  async issueRefresh({ store, device, roles, owner }) {
    const refresh = randomToken(32);
    const ttl = Number(this.env.REFRESH_TTL_SECONDS || 2592000);
    this.sql.exec('INSERT INTO refresh (hash, store, device, roles, owner, issued, expires) VALUES (?, ?, ?, ?, ?, ?, ?)',
      await sha256(refresh), store || null, device || null, JSON.stringify(roles || []), owner ? 1 : 0, new Date().toISOString(), Date.now() + ttl * 1000);
    return { refresh };
  }
  async useRefresh({ refresh }) {
    const hash = await sha256(String(refresh || ''));
    const row = this.sql.exec('SELECT * FROM refresh WHERE hash = ?', hash).toArray()[0];
    this.sql.exec('DELETE FROM refresh WHERE hash = ? OR expires < ?', hash, Date.now());
    if (!row || row.expires < Date.now()) throw new HttpError(401, 'unauthorised', 'refresh token is not valid');
    const next = await this.issueRefresh({ store: row.store, device: row.device, roles: JSON.parse(row.roles), owner: !!row.owner });
    const store = row.store ? this.get(row.store) : null;
    if (row.store && !store) throw new HttpError(404, 'not_registered', `store ${row.store} is not registered`);
    return { store: row.store, device: row.device, roles: JSON.parse(row.roles), owner: !!row.owner, caps: store ? this.caps(store) : [], refresh: next.refresh };
  }

  // ── registry ──────────────────────────────────────────────────────────
  publicList() {
    return { stores: this.sql.exec('SELECT no, name, region, status FROM stores ORDER BY no').toArray() };
  }
  fullList() {
    return { stores: this.sql.exec('SELECT * FROM stores ORDER BY no').toArray().map(r => this.present(r)) };
  }
  record(no) {
    const row = this.get(no);
    if (!row) throw new HttpError(404, 'not_registered', `store ${no} is not registered`);
    return this.present(row);
  }
  async register(b) {
    if (!/^\d{3,5}$/.test(String(b.no || ''))) throw new HttpError(400, 'invalid_request', 'no must be the store number');
    if (!b.name) throw new HttpError(400, 'invalid_request', 'name is required');
    if (!/^\d{4,8}$/.test(String(b.pin || ''))) throw new HttpError(400, 'invalid_request', 'pin must be 4 to 8 digits');
    if (this.get(b.no)) throw new HttpError(409, 'exists', `store ${b.no} is already registered`);
    const codes = {};
    for (const name of Object.keys(CODE_ROLES)) if (b.codes?.[name]) codes[name] = await hashSecret(normCode(b.codes[name]));
    const ent = {}; for (const a of ALL_AREAS) ent[a] = !!b.entitlements?.[a];
    const areas = {}; for (const a of ALL_AREAS) areas[a] = 'legacy';
    const now = new Date().toISOString();
    this.sql.exec('INSERT INTO stores (no, name, region, format, status, pin_hash, codes, entitlements, areas, map_version, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      String(b.no), b.name, b.region || null, b.format || null, 'registered', await hashSecret(String(b.pin)), JSON.stringify(codes), JSON.stringify(ent), JSON.stringify(areas), null, now, now);
    this.log('store.register', b.no, { name: b.name, entitlements: ent });
    return this.present(this.get(b.no));
  }
  async patch(no, b) {
    const row = this.get(no);
    if (!row) throw new HttpError(404, 'not_registered', `store ${no} is not registered`);
    const sets = [], vals = [];
    if (b.name) { sets.push('name = ?'); vals.push(b.name); }
    if (b.region !== undefined) { sets.push('region = ?'); vals.push(b.region); }
    if (b.status) {
      if (!['registered', 'migrating', 'live', 'legacy'].includes(b.status)) throw new HttpError(400, 'invalid_request', 'bad status');
      sets.push('status = ?'); vals.push(b.status); this.log('store.status', no, { status: b.status });
    }
    if (b.entitlements) {
      const ent = JSON.parse(row.entitlements); for (const a of ALL_AREAS) if (a in b.entitlements) ent[a] = !!b.entitlements[a];
      sets.push('entitlements = ?'); vals.push(JSON.stringify(ent)); this.log('store.entitle', no, ent);
    }
    if (b.areas) {
      const areas = JSON.parse(row.areas);
      for (const a of ALL_AREAS) if (a in b.areas) {
        if (!['legacy', 'migrating', 'live'].includes(b.areas[a])) throw new HttpError(400, 'invalid_request', 'bad area state');
        areas[a] = b.areas[a];
      }
      sets.push('areas = ?'); vals.push(JSON.stringify(areas)); this.log('area.flip', no, areas);
    }
    if (b.pin) { sets.push('pin_hash = ?'); vals.push(await hashSecret(String(b.pin))); this.log('roster.rotate', no, { pin: true }); }
    if (b.codes) {
      const codes = JSON.parse(row.codes);
      for (const name of Object.keys(CODE_ROLES)) if (b.codes[name]) codes[name] = await hashSecret(normCode(b.codes[name]));
      sets.push('codes = ?'); vals.push(JSON.stringify(codes)); this.log('roster.rotate', no, { codes: Object.keys(b.codes) });
    }
    if (b.map_version) { sets.push('map_version = ?'); vals.push(b.map_version); }
    if (!sets.length) throw new HttpError(400, 'invalid_request', 'nothing to change');
    sets.push('updated = ?'); vals.push(new Date().toISOString());
    this.sql.exec(`UPDATE stores SET ${sets.join(', ')} WHERE no = ?`, ...vals, no);
    return this.present(this.get(no));
  }
  actions() {
    return { actions: this.sql.exec('SELECT seq, at, type, store, detail FROM actions ORDER BY seq DESC LIMIT 200').toArray().map(r => ({ ...r, detail: JSON.parse(r.detail) })) };
  }

  // ── helpers ───────────────────────────────────────────────────────────
  get(no) { return this.sql.exec('SELECT * FROM stores WHERE no = ?', String(no)).toArray()[0] || null; }
  caps(row) { const ent = JSON.parse(row.entitlements); return ALL_AREAS.filter(a => ent[a]); }
  present(row) {
    return { no: row.no, name: row.name, region: row.region, format: row.format, status: row.status,
      entitlements: JSON.parse(row.entitlements), areas: JSON.parse(row.areas), codes: Object.keys(JSON.parse(row.codes)),
      mapVersion: row.map_version, created: row.created, updated: row.updated };
  }
  log(type, store, detail) {
    this.sql.exec('INSERT INTO actions (at, type, store, detail) VALUES (?, ?, ?, ?)', new Date().toISOString(), type, store || null, JSON.stringify(detail || {}));
  }
}
