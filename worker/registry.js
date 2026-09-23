// RegistryObject: one Durable Object for the whole system. It knows every
// store, its credentials (hashed), entitlements and status, issues and
// rotates refresh tokens, and enforces sign-in lockout. Owner actions are
// logged here so the admin console has its own tail.
//
// The worker talks to it over an internal fetch with a JSON body:
//   POST /signin        { store, pin, device }             → { store, roles, caps } | error
//   POST /unlock        { store, code }                    → { role } | error
//   POST /refresh/issue { store, device, roles, owner }    → { refresh }
//   POST /refresh/use   { refresh }                        → { store, device, roles, owner, epoch, refresh } | error
//   POST /refresh/revoke { refresh }                       → { ok } (sign-out)
//   GET  /stores                                           → public list
//   GET  /stores/_all                                      → full records (owner)
//   GET  /stores/:no                                       → full record (owner)
//   POST /stores        { no, name, region, pin, codes, entitlements } (owner)
//   PATCH /stores/:no   { entitlements?, status?, pin?, codes?, name?, region?, revoke? } (owner; pin, codes, suspended and revoke bump the epoch)
//   POST /lockout/fail  { key }   POST /lockout/clear { key }   (used by owner sign-in)
//   GET  /actions                                          → owner action tail
//   POST /log          { type, store, detail }             → append an owner action
//
// Store status: 'registered' (no areas live), 'migrating', 'live', 'legacy', 'suspended'.

import { DurableObject } from 'cloudflare:workers';
import { hashSecret, verifySecret, randomToken, sha256 } from './auth.js';
import { HttpError, json } from './http.js';

const ALL_AREAS = ['floor', 'stockroom', 'backdock'];
// 'suspended' refuses sign-in, unlock and refresh, and signs every device out.
const STATUSES = ['registered', 'migrating', 'live', 'legacy', 'suspended'];
const CODE_ROLES = { stockroom: 'stockroom', dock: 'dock', manager: 'manager' };
// Area and manager codes are compared case-insensitively with spaces and
// hyphens removed, so SR-7304, sr 7304 and SR7304 are the same code.
const normCode = c => String(c ?? '').toUpperCase().replace(/[\s-]/g, '');
// The store-wide and network-wide lockout keys for an attempt.
const guardKeys = (kind, store, ip) => [...(store ? [`${kind}:store:${store}`] : []), ...(ip ? [`${kind}:ip:${ip}`] : [])];

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
    // Columns added after first deploy: a lockout window start, and the
    // store's credential epoch (bumped to revoke every session).
    for (const ddl of ['ALTER TABLE lockout ADD COLUMN since INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE stores ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE refresh ADD COLUMN fp TEXT']) {
      try { this.sql.exec(ddl); } catch { /* already there */ }
    }
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
      case 'POST /refresh/*': return p[1] === 'issue' ? this.issueRefresh(body) : p[1] === 'revoke' ? this.revokeRefresh(body) : this.useRefresh(body);
      case 'GET /stores': return this.publicList();
      case 'GET /stores/*': return p[1] === '_all' ? this.fullList() : this.record(p[1]);
      case 'POST /stores': return this.register(body);
      case 'PATCH /stores/*': return this.patch(p[1], body);
      case 'POST /lockout/*':
        if (p[1] === 'fail') { this.failAll(body.keys || [body.key]); return { ok: true }; }
        if (p[1] === 'check') { for (const k of body.keys || [body.key]) this.checkLocked(k); return { ok: true }; }
        return this.clear(body.key);
      case 'GET /actions': return this.actions();
      case 'POST /log': this.log(String(body.type || 'note'), body.store || null, body.detail || {}); return { ok: true };
      default: throw new HttpError(404, 'not_found', `registry has no ${key}`);
    }
  }

  // ── sign-in and lockout ───────────────────────────────────────────────
  // Failures count three ways. The device key (5, cleared on success) is the
  // one a person mistyping meets. The device id is the client's own word, so
  // the store key and the network key also count, over a window, and a
  // success never clears them: a new device id buys no fresh attempts.
  async signin({ store, pin, device, ip }) {
    const keys = [`signin:dev:${store}:${device || 'nodevice'}`, ...guardKeys('signin', store, ip)];
    for (const k of keys) this.checkLocked(k);
    const row = this.get(store);
    if (!row) { this.failAll(guardKeys('signin', '', ip)); throw new HttpError(404, 'not_registered', `store ${store} is not registered`); }
    if (!(await verifySecret(String(pin ?? ''), row.pin_hash))) {
      this.failAll(keys);
      throw new HttpError(403, 'unauthorised', 'wrong PIN');
    }
    if (row.status === 'suspended') throw new HttpError(403, 'suspended', `store ${store} is suspended`);
    this.clear(keys[0]);
    return { store: row.no, name: row.name, roles: ['floor'], caps: this.caps(row), status: row.status, epoch: row.epoch || 0 };
  }

  // Per device first, so one device guessing locks out only itself; the
  // store and network keys cap guessing across devices.
  async unlock({ store, code, device, ip, epoch }) {
    const keys = [`unlock:dev:${store}:${device || 'nodevice'}`, ...guardKeys('unlock', store, ip)];
    for (const k of keys) this.checkLocked(k);
    const row = this.get(store);
    if (!row) throw new HttpError(404, 'not_registered', `store ${store} is not registered`);
    if (row.status === 'suspended') throw new HttpError(403, 'suspended', `store ${store} is suspended`);
    if ((epoch ?? 0) < (row.epoch || 0)) throw new HttpError(401, 'revoked', 'this session was signed out; sign in again');
    const codes = JSON.parse(row.codes);
    for (const [name, role] of Object.entries(CODE_ROLES)) {
      if (codes[name] && await verifySecret(normCode(code), codes[name])) { this.clear(keys[0]); return { role, epoch: row.epoch || 0 }; }
    }
    this.failAll(keys);
    throw new HttpError(403, 'unauthorised', 'wrong code');
  }

  checkLocked(key) {
    const row = this.sql.exec('SELECT fails, until FROM lockout WHERE key = ?', key).toArray()[0];
    if (row && row.until > Date.now()) {
      throw new HttpError(429, 'locked_out', 'too many attempts', { retryAfter: Math.ceil((row.until - Date.now()) / 1000) });
    }
  }
  // One failure against a key (`kind:dev|store|ip:…`). Device keys lock after
  // LOCKOUT_ATTEMPTS (5); store keys after LOCKOUT_STORE_ATTEMPTS (30) and
  // network keys after LOCKOUT_IP_ATTEMPTS (200: stores can share one egress
  // address, so this only stops spraying across stores), both counted over
  // LOCKOUT_WINDOW_SECONDS (an hour).
  fail(key) {
    const env = this.env, now = Date.now();
    const kind = String(key).split(':')[1] === 'store' ? 'store' : String(key).split(':')[1] === 'ip' ? 'ip' : 'device';
    const max = Number(kind === 'store' ? env.LOCKOUT_STORE_ATTEMPTS || 30 : kind === 'ip' ? env.LOCKOUT_IP_ATTEMPTS || 200 : env.LOCKOUT_ATTEMPTS || 5);
    const secs = Number(env.LOCKOUT_SECONDS || 900), windowMs = Number(env.LOCKOUT_WINDOW_SECONDS || 3600) * 1000;
    const row = this.sql.exec('SELECT fails, since FROM lockout WHERE key = ?', key).toArray()[0];
    const fresh = !row || (kind !== 'device' && row.since && now - row.since > windowMs);
    const fails = (fresh ? 0 : row.fails || 0) + 1, since = fresh || !row.since ? now : row.since;
    const until = fails >= max ? now + secs * 1000 : 0;
    this.sql.exec('INSERT INTO lockout (key, fails, until, since) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, until = excluded.until, since = excluded.since', key, until ? 0 : fails, until, until ? 0 : since);
    return { fails, until };
  }
  failAll(keys) { for (const k of keys) this.fail(k); }
  clear(key) { this.sql.exec('DELETE FROM lockout WHERE key = ?', key); return { ok: true }; }

  // ── refresh tokens ────────────────────────────────────────────────────
  // Owner refresh tokens carry a fingerprint of the owner key hash, so
  // rotating OWNER_KEY_HASH ends every owner session at its next refresh.
  // Store refresh tokens are deleted when the store's epoch is bumped.
  async ownerFp() { return sha256(String(this.env.OWNER_KEY_HASH || '')); }
  async issueRefresh({ store, device, roles, owner }) {
    const refresh = randomToken(32);
    const ttl = Number(this.env.REFRESH_TTL_SECONDS || 2592000);
    this.sql.exec('INSERT INTO refresh (hash, store, device, roles, owner, issued, expires, fp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      await sha256(refresh), store || null, device || null, JSON.stringify(roles || []), owner ? 1 : 0, new Date().toISOString(), Date.now() + ttl * 1000, owner ? await this.ownerFp() : null);
    return { refresh };
  }
  async useRefresh({ refresh }) {
    const hash = await sha256(String(refresh || ''));
    const row = this.sql.exec('SELECT * FROM refresh WHERE hash = ?', hash).toArray()[0];
    this.sql.exec('DELETE FROM refresh WHERE hash = ? OR expires < ?', hash, Date.now());
    if (!row || row.expires < Date.now()) throw new HttpError(401, 'unauthorised', 'refresh token is not valid');
    if (row.owner && row.fp !== await this.ownerFp()) throw new HttpError(401, 'revoked', 'the owner key has changed; sign in again');
    const store = row.store ? this.get(row.store) : null;
    if (row.store && !store) throw new HttpError(404, 'not_registered', `store ${row.store} is not registered`);
    if (store?.status === 'suspended') throw new HttpError(403, 'suspended', `store ${row.store} is suspended`);
    const next = await this.issueRefresh({ store: row.store, device: row.device, roles: JSON.parse(row.roles), owner: !!row.owner });
    return { store: row.store, device: row.device, roles: JSON.parse(row.roles), owner: !!row.owner, caps: store ? this.caps(store) : [], epoch: store?.epoch || 0, refresh: next.refresh };
  }
  // Sign-out: the refresh token stops working now, not in 30 days.
  async revokeRefresh({ refresh }) {
    this.sql.exec('DELETE FROM refresh WHERE hash = ?', await sha256(String(refresh || '')));
    return { ok: true };
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
      if (!STATUSES.includes(b.status)) throw new HttpError(400, 'invalid_request', 'bad status');
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
    // A new PIN or code, a suspension, or an explicit revoke signs every
    // device out: the epoch moves on, so the store object refuses older
    // access tokens, and the store's refresh tokens are deleted.
    const revoke = !!(b.pin || b.codes || b.status === 'suspended' || b.revoke);
    if (revoke) { sets.push('epoch = ?'); vals.push((row.epoch || 0) + 1); }
    if (!sets.length) throw new HttpError(400, 'invalid_request', 'nothing to change');
    sets.push('updated = ?'); vals.push(new Date().toISOString());
    this.sql.exec(`UPDATE stores SET ${sets.join(', ')} WHERE no = ?`, ...vals, no);
    if (revoke) { this.sql.exec('DELETE FROM refresh WHERE store = ?', String(no)); this.log('sessions.revoke', no, { epoch: (row.epoch || 0) + 1, why: b.revoke ? 'owner' : b.status === 'suspended' ? 'suspended' : 'rotation' }); }
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
      mapVersion: row.map_version, epoch: row.epoch || 0, created: row.created, updated: row.updated };
  }
  log(type, store, detail) {
    this.sql.exec('INSERT INTO actions (at, type, store, detail) VALUES (?, ?, ?, ?)', new Date().toISOString(), type, store || null, JSON.stringify(detail || {}));
  }
}
