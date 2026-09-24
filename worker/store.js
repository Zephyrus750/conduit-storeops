// StoreObject: one Durable Object per store. It owns the event log (SQLite),
// the in-memory projections folded by the shared reducers, snapshots, and
// the WebSocket fan-out to every device in the store.
//
// Internal HTTP (the worker forwards with an X-Conduit-Claims header holding
// the verified token claims as JSON):
//   GET  /snapshot?areas=a,b       → { seq, state: {…filtered} }
//   GET  /changes?since=N          → { seq, events: [...] }
//   POST /events  { events: [] }   → { results: [{ id, ok, seq } | { id, ok:false, code, message }] }
//   GET  /ws                       → WebSocket upgrade
//   GET  /devices                  → devices projection (owner)
//   GET  /tail?limit=              → raw log, newest first (owner)
//   GET  /map                      → { version, at, by, floors:[{id,name,type,bytes}], versions:[…] } (404 until published)
//   GET  /map/:version             → the published document; `latest` allowed; floors carry their svg
//   POST /map  { version, name?, departments?, floors:[{ id, name, type, svg }] }  (owner) → applies map.publish
//
// WebSocket protocol (JSON text frames):
//   → { t:'hello', since }          ← { t:'snapshot', seq, state } or { t:'delta', seq, events }
//   → { t:'submit', events }        ← { t:'ack', results }
//   → { t:'hb', app, area, online, outbox, lastError }   (updates the devices projection, no reply)
//   ← { t:'event', event }          broadcast on every applied event
//   → { t:'ping' }                  ← { t:'pong', seq }

import { DurableObject } from 'cloudflare:workers';
import { initialState, apply, replay } from '../shared/reducers.js';
import { validateEvent } from '../shared/validate.js';
import { typeInfo, AREA_PROJECTIONS } from '../shared/catalogue.js';
import { hasRole } from './auth.js';
import { HttpError, json, fail, CORS } from './http.js';
import { ulid } from '../shared/ulid.js';
import { productLife, historyRows, toCsv, HISTORY_KINDS, HISTORY_AREA } from '../shared/records.js';
import { buildProfiles } from '../shared/profiles.js';
import { rolloverDue } from '../shared/backfill.js';
import { sanitizeSvg } from '../shared/svgsafe.js';
import { storeDay, storeIso, msToStoreMidnight, DEFAULT_TZ } from '../shared/time.js';

const SNAPSHOT_EVERY = 1000;
const MANIFEST_MAX = 8_000_000;
const MAP_FLOOR_MAX = 1_900_000;   // per floor; SQLite rows in a Durable Object hold 2 MB
const DELTA_LIMIT = 5000;
const BATCH_MAX = 8_000_000;          // an events body, or one socket frame
const EVENT_MAX = 2_000_000;          // one event's payload (a manifest.attach carries its consols)
const FUTURE_MS = 10 * 60_000, PAST_MS = 30 * 86_400_000;   // how far a device's clock may stray     // above this gap a hello gets a snapshot instead of a delta

export class StoreObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL, area TEXT NOT NULL,
        entity TEXT NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL,
        at TEXT NOT NULL, v INTEGER NOT NULL, received TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_type ON events(type, seq);
      CREATE TABLE IF NOT EXISTS snapshots (seq INTEGER PRIMARY KEY, state TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS maps (version TEXT PRIMARY KEY, meta TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS map_floors (version TEXT NOT NULL, floor TEXT NOT NULL, svg TEXT NOT NULL, PRIMARY KEY (version, floor));
      CREATE TABLE IF NOT EXISTS manifests (manNo TEXT PRIMARY KEY, doc TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.state = null;
    this.storeNo = this.sql.exec("SELECT value FROM meta WHERE key = 'store'").toArray()[0]?.value || null;
    this.epoch = Number(this.sql.exec("SELECT value FROM meta WHERE key = 'epoch'").toArray()[0]?.value || 0);
    ctx.blockConcurrencyWhile(async () => {
      this.load();
      // The end-of-day rollover runs on an alarm at store midnight. A store
      // object with no alarm (new, or woken after a deploy) catches up now.
      if (await ctx.storage.getAlarm() == null) await ctx.storage.setAlarm(Date.now() + 1000);
    });
  }

  // ── state ─────────────────────────────────────────────────────────────
  load() {
    const snap = this.sql.exec('SELECT seq, state FROM snapshots ORDER BY seq DESC LIMIT 1').toArray()[0];
    this.state = snap ? JSON.parse(snap.state) : initialState();
    const since = snap ? snap.seq : 0;
    const rows = this.sql.exec('SELECT * FROM events WHERE seq > ? ORDER BY seq', since).toArray();
    replay(this.state, rows.map(rowToEvent));
    const last = this.sql.exec('SELECT MAX(seq) AS m FROM events').toArray()[0];
    this.state.seq = last?.m || 0;
    this.sinceSnapshot = rows.length;
  }
  snapshotIfDue() {
    if (this.sinceSnapshot < SNAPSHOT_EVERY) return;
    this.sql.exec('INSERT OR REPLACE INTO snapshots (seq, state, at) VALUES (?, ?, ?)', this.state.seq, JSON.stringify(this.state), new Date().toISOString());
    this.sql.exec('DELETE FROM snapshots WHERE seq < ?', this.state.seq);
    this.sinceSnapshot = 0;
  }

  // ── HTTP ──────────────────────────────────────────────────────────────
  async fetch(request) {
    const url = new URL(request.url);
    const claims = JSON.parse(request.headers.get('X-Conduit-Claims') || 'null');
    if (!claims) return fail(401, 'unauthorised', 'no claims');
    // A device token from before the store's last rotation, suspension or
    // revoke is refused; the device refreshes (which fails) and signs in.
    if (!claims.owner && (Number(claims.epoch) || 0) < this.epoch) return fail(401, 'revoked', 'this device was signed out; sign in again');
    if (url.pathname === '/epoch') return this.setEpoch(await request.json(), claims);
    if (claims.store && claims.store !== this.storeNo) { this.storeNo = claims.store; this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('store', ?)", String(claims.store)); }
    try {
      switch (url.pathname) {
        case '/snapshot': return json(this.snapshot(claims, url.searchParams.get('areas')));
        case '/changes': return json(this.changes(Number(url.searchParams.get('since') || 0), claims));
        case '/events': { const body = await readBounded(request, BATCH_MAX); return json({ results: this.submit(body.events, claims) }); }
        case '/ws': return this.upgrade(request, claims);
        case '/devices': return json({ devices: this.state.devices });
        case '/tail': return json({ seq: this.state.seq, events: this.tail(Number(url.searchParams.get('limit') || 200)) });
        case '/map': return request.method === 'POST' ? this.publishMap(await request.json(), claims) : json(this.mapInfo());
        default: {
          const m = url.pathname.match(/^\/map\/([\w.-]+)$/);
          if (m) return this.mapDoc(m[1], request.headers.get('If-None-Match'));
          if (url.pathname === '/manifest' && request.method === 'POST') return this.publishManifest(await request.json(), claims);
          if (url.pathname === '/profiles') { const no = needArea(claims, 'backdock'); if (no) return no; const docs = this.sql.exec('SELECT doc, at FROM manifests').toArray().map(r => ({ ...JSON.parse(r.doc), at: r.at })); return json(buildProfiles(docs, { store: this.storeNo })); }
          const man = url.pathname.match(/^\/manifest\/([\w-]{1,20})$/);
          if (man) { const no = needArea(claims, 'backdock'); if (no) return no; return request.method === 'DELETE' ? this.removeManifest(man[1], claims) : this.manifestDoc(man[1]); }
          const life = url.pathname.match(/^\/life\/(\d{6,13})$/);
          if (life) { const no = needArea(claims, 'stockroom'); if (no) return no; return json(productLife(this.state, life[1])); }
          const hist = url.pathname.match(/^\/(history|export)\/([a-z]+)$/);
          if (hist) {
            if (!HISTORY_KINDS.includes(hist[2])) return fail(400, 'invalid_request', `kind must be one of ${HISTORY_KINDS.join(', ')}`);
            const no = needArea(claims, HISTORY_AREA[hist[2]]); if (no) return no;
            const rows = historyRows(this.state, hist[2]);
            if (hist[1] === 'export') return new Response(toCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${this.storeNo}-${hist[2]}.csv"`, ...CORS } });
            const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0), limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
            return json({ kind: hist[2], total: rows.length, offset, limit, rows: rows.slice(offset, offset + limit) });
          }
          return fail(404, 'not_found', `store object has no ${url.pathname}`);
        }
      }
    } catch (e) {
      if (e instanceof HttpError) return e.toResponse();
      throw e;
    }
  }

  snapshot(claims, areasParam) {
    // Store-wide projections (map version, roster marker, devices) ride along
    // with every snapshot; area projections follow what the token may read
    // (entitlement and role, see readable()).
    const wanted = areasParam ? areasParam.split(',') : [...readable(claims), 'store'];
    const allowed = new Set([...readable(claims), 'store']);
    const out = { v: this.state.v };
    for (const area of wanted) {
      if (!allowed.has(area)) continue;
      for (const proj of AREA_PROJECTIONS[area] || []) if (proj in this.state) out[proj] = this.state[proj];
    }
    if (!hasRole(claims, ['manager']) && !claims.owner) delete out.devices;
    return { seq: this.state.seq, state: out };
  }

  changes(since, claims) {
    const rows = this.sql.exec('SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?', since, DELTA_LIMIT).toArray();
    const can = new Set(readable(claims));
    const events = rows.map(rowToEvent).filter(e => claims.owner || can.has(e.area) || e.area === 'store');
    return { seq: this.state.seq, events, more: rows.length === DELTA_LIMIT };
  }

  tail(limit) {
    return this.sql.exec('SELECT * FROM events ORDER BY seq DESC LIMIT ?', Math.min(limit, 1000)).toArray().map(rowToEvent);
  }

  // ── apply ─────────────────────────────────────────────────────────────
  submit(events, claims) {
    if (!Array.isArray(events)) throw new HttpError(400, 'invalid_request', 'events must be an array');
    if (events.length > 500) throw new HttpError(400, 'invalid_request', 'at most 500 events per batch');
    const results = [];
    const applied = [];
    for (const raw of events) {
      const r = this.applyOne(raw, claims);
      results.push(r);
      if (r.ok && r.event) applied.push(r.event);
    }
    this.snapshotIfDue();
    if (applied.length) this.broadcast(applied);
    return results.map(({ event, ...rest }) => rest);
  }

  applyOne(raw, claims) {
    const id = raw?.id;
    const bad = validateEvent(raw);
    if (bad) return { id, ok: false, ...bad };
    if (JSON.stringify(raw.payload ?? {}).length > EVENT_MAX) return { id, ok: false, code: 'invalid_event', message: `payload is over ${EVENT_MAX / 1_000_000} MB` };
    // A device's clock decides "first at wins", so its `at` must be near the
    // worker's: at most 10 minutes ahead, at most 30 days behind (an outbox
    // that sat offline). The owner's imports carry legacy times and are exempt.
    if (!claims.owner) { const t = Date.parse(raw.at), now = Date.now(); if (!(t <= now + FUTURE_MS && t >= now - PAST_MS)) return { id, ok: false, code: 'clock_skew', message: `at ${raw.at} is too far from the worker's clock; check this device's date and time` }; }
    if (raw.store !== claims.store) return { id, ok: false, code: 'unauthorised', message: 'event is for another store' };
    const info = typeInfo(raw.type);
    if (info.area !== 'store' && !claims.caps.includes(info.area)) return { id, ok: false, code: 'not_entitled', message: `store is not entitled to ${info.area}` };
    if (!hasRole(claims, info.roles)) return { id, ok: false, code: 'unauthorised', message: `${raw.type} needs ${info.roles.join(' or ')}` };

    const dup = this.sql.exec('SELECT seq FROM events WHERE id = ?', id).toArray()[0];
    if (dup) return { id, ok: true, seq: dup.seq, duplicate: true };

    // The actor is what the token says, never what the device claims.
    const event = {
      id, store: raw.store, area: info.area, type: raw.type,
      entity: raw.entity, payload: raw.payload ?? {},
      actor: { role: primaryRole(claims, info.roles), device: claims.device, owner: !!claims.owner },
      at: raw.at, v: info.v,
    };
    const rej = apply(this.state, event);
    if (rej) return { id, ok: false, ...rej };

    const received = new Date().toISOString();
    const cur = this.sql.exec(
      'INSERT INTO events (id, type, area, entity, payload, actor, at, v, received) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq',
      id, event.type, event.area, JSON.stringify(event.entity), JSON.stringify(event.payload), JSON.stringify(event.actor), event.at, event.v, received,
    ).toArray()[0];
    event.seq = cur.seq;
    this.state.seq = cur.seq;
    this.sinceSnapshot += 1;
    return { id, ok: true, seq: cur.seq, event };
  }

  // ── session revocation ──────────────────────────────────────────────
  setEpoch(body, claims) {
    if (!claims.owner) return fail(403, 'unauthorised', 'owner only');
    const epoch = Math.max(this.epoch, Number(body?.epoch) || 0);
    if (epoch !== this.epoch) {
      this.epoch = epoch;
      this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('epoch', ?)", String(epoch));
      for (const ws of this.ctx.getWebSockets()) {
        const { claims: c } = ws.deserializeAttachment() || {};
        if (c && !c.owner && (Number(c.epoch) || 0) < epoch) { try { ws.send(JSON.stringify({ t: 'error', code: 'revoked', message: 'signed out' })); ws.close(1008, 'revoked'); } catch {} }
      }
    }
    return json({ ok: true, epoch: this.epoch });
  }

  // ── end-of-day rollover ───────────────────────────────────────────────
  // Earlier-day bays still pending or ready are submitted as auto, through
  // the ordinary write path with a system actor, then the next alarm is set
  // for the coming store midnight (plus a minute of slack).
  async alarm() {
    try { this.rollover(); }
    finally { await this.ctx.storage.setAlarm(Date.now() + msToStoreMidnight(new Date(), this.tz()) + 60_000); }
  }
  tz() { return this.env.STORE_TZ || DEFAULT_TZ; }
  rollover(now = new Date()) {
    if (!this.storeNo) return [];
    const at = storeIso(now, this.tz()), today = storeDay(now, this.tz());
    const events = rolloverDue(this.state.backfill, today).map(entity => ({ id: ulid(), store: this.storeNo, area: 'stockroom', type: 'submission.submit', entity, payload: { auto: true }, at, v: 1 }));
    if (!events.length) return [];
    return this.submit(events, { store: this.storeNo, roles: ['manager'], caps: ['stockroom'], device: 'system', owner: false, actor: 'system' });
  }

  // ── manifests ─────────────────────────────────────────────────────────
  // The DC report, parsed on the device, published whole (up to 8 MB) and
  // indexed by a manifest.publish event so every device lists it; the
  // document itself is read on demand. Needs the dock role.
  publishManifest(doc, claims) {
    if (!(claims.caps || []).includes('backdock')) throw new HttpError(403, 'not_entitled', 'backdock is not enabled for this store');
    if (!hasRole(claims, ['dock', 'manager']) && !claims.owner) throw new HttpError(403, 'unauthorised', 'publishing a manifest needs the dock code');
    if (!doc || doc.v !== 1 || doc.kind !== 'report') throw new HttpError(400, 'invalid_request', 'manifest must be v 1, kind report');
    const manNo = String(doc.manNo || '').trim();
    if (!/^[\w-]{1,20}$/.test(manNo)) throw new HttpError(400, 'invalid_request', 'manifest number missing or invalid');
    const docStore = String(doc.storeNo || '').replace(/\D/g, '');
    if (docStore && docStore !== String(this.storeNo)) throw new HttpError(409, 'wrong_store', `manifest is for store ${doc.storeNo}, not ${this.storeNo}`);
    if (!Array.isArray(doc.consols) || !doc.consols.length || doc.consols.length > 500) throw new HttpError(400, 'invalid_request', 'manifest needs 1 to 500 consolidations');
    const text = JSON.stringify(doc);
    if (text.length > MANIFEST_MAX) throw new HttpError(413, 'payload_too_large', `manifest is over ${MANIFEST_MAX / 1_000_000} MB`);
    const at = new Date().toISOString(), by = claims.device || (claims.owner ? 'owner' : '');
    this.sql.exec('INSERT OR REPLACE INTO manifests (manNo, doc, at, by) VALUES (?, ?, ?, ?)', manNo, text, at, by);
    const totalCartons = doc.consols.reduce((n, c) => n + (Number(c.cartons) || 0), 0), keycodes = new Set(doc.consols.flatMap(c => (c.items || []).map(i => i.k))).size;
    const ev = { id: ulid(), store: this.storeNo, area: 'backdock', type: 'manifest.publish', entity: { manNo }, payload: { dcNo: doc.dcNo || '', despatch: doc.despatch || '', filename: String(doc.filename || '').slice(0, 80), consols: doc.consols.length, totalCartons, keycodes }, at, v: 1 };
    const [r] = this.submit([ev], claims);
    if (!r.ok) throw new HttpError(400, r.code, r.message);
    return json({ ok: true, manNo, at, consols: doc.consols.length, totalCartons, keycodes, seq: r.seq }, 201);
  }
  manifestDoc(manNo) {
    const row = this.sql.exec('SELECT doc FROM manifests WHERE manNo = ?', manNo).toArray()[0];
    if (!row) throw new HttpError(404, 'not_found', `manifest ${manNo} is not published (expired or removed)`);
    return new Response(row.doc, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600', ...CORS } });
  }
  // The role is checked and the manifest.remove event accepted before the
  // document goes: a refused remove changes nothing, and every removal that
  // happens is in the log.
  removeManifest(manNo, claims) {
    if (!hasRole(claims, ['dock', 'manager']) && !claims.owner) throw new HttpError(403, 'unauthorised', 'removing a manifest needs the dock code');
    if (!this.sql.exec('SELECT 1 FROM manifests WHERE manNo = ?', manNo).toArray().length) throw new HttpError(404, 'not_found', `manifest ${manNo} is not published`);
    const ev = { id: ulid(), store: this.storeNo, area: 'backdock', type: 'manifest.remove', entity: { manNo }, payload: {}, at: new Date().toISOString(), v: 1 };
    const [r] = this.submit([ev], claims);
    if (!r.ok) throw new HttpError(r.code === 'unauthorised' ? 403 : 400, r.code, r.message);
    this.sql.exec('DELETE FROM manifests WHERE manNo = ?', manNo);
    return json({ ok: true, manNo });
  }

  // ── published maps ────────────────────────────────────────────────────
  // A map is one document per version: metadata plus one rendered SVG per
  // floor in the format js/map.js mounts (class "map real", shelf-group
  // elements with data-shelf, data-dept, emergency markers). Floors are
  // stored one row each so a large floor never breaks the row limit.
  mapInfo() {
    const rows = this.sql.exec('SELECT version, meta, at, by FROM maps ORDER BY at DESC').toArray();
    if (!rows.length) throw new HttpError(404, 'not_found', 'no map has been published for this store');
    const cur = rows.find(r => r.version === this.state.map.version) || rows[0];
    const meta = JSON.parse(cur.meta);
    return { version: cur.version, at: cur.at, by: JSON.parse(cur.by), name: meta.name, floors: meta.floors.map(f => ({ ...f, ...(f.paths ? { paths: { nodes: f.paths.nodes.length, edges: f.paths.edges.length } } : {}) })), departments: meta.departments, versions: rows.slice(0, 20).map(r => ({ version: r.version, at: r.at })) };
  }
  mapDoc(version, ifNoneMatch) {
    if (version === 'latest') version = this.state.map.version || this.sql.exec('SELECT version FROM maps ORDER BY at DESC LIMIT 1').toArray()[0]?.version;
    const row = version && this.sql.exec('SELECT version, meta, at, by FROM maps WHERE version = ?', version).toArray()[0];
    if (!row) throw new HttpError(404, 'not_found', version ? `map version ${version} is not published` : 'no map has been published for this store');
    const etag = `"map-${row.version}"`;
    if (ifNoneMatch && ifNoneMatch.split(',').map(s => s.trim()).includes(etag)) return new Response(null, { status: 304, headers: { ETag: etag } });
    const meta = JSON.parse(row.meta);
    const svgs = Object.fromEntries(this.sql.exec('SELECT floor, svg FROM map_floors WHERE version = ?', row.version).toArray().map(r => [r.floor, r.svg]));
    const doc = { v: 1, kind: 'map', store: this.storeNo, version: row.version, at: row.at, by: JSON.parse(row.by), name: meta.name, departments: meta.departments, floors: meta.floors.map(f => ({ ...f, svg: svgs[f.id] || '' })) };
    return json(doc, 200, { ETag: etag, 'Cache-Control': 'private, max-age=31536000' });
  }
  publishMap(body, claims) {
    if (!claims.owner) throw new HttpError(403, 'unauthorised', 'publishing a map needs the owner');
    const version = String(body?.version ?? '').trim();
    if (!/^[\w.-]{1,32}$/.test(version) || version === 'latest') throw new HttpError(400, 'invalid_request', 'version must be 1 to 32 letters, digits, dots or dashes');
    if (this.sql.exec('SELECT 1 FROM maps WHERE version = ?', version).toArray().length) throw new HttpError(409, 'exists', `map version ${version} is already published; publish a new version`);
    const floors = Array.isArray(body.floors) ? body.floors : [];
    if (!floors.length) throw new HttpError(400, 'invalid_request', 'floors must list at least one floor with its svg');
    const metaFloors = [], clean = [];
    let stripped = 0;
    for (const f of floors) {
      const id = String(f?.id ?? '').trim();
      // Allow-list the markup: every device inserts it into the page.
      const safe = sanitizeSvg(String(f?.svg ?? '')), svg = safe.svg;
      stripped += safe.stripped; clean.push({ id, svg });
      if (!/^[\w-]{1,32}$/.test(id)) throw new HttpError(400, 'invalid_request', 'each floor needs an id of letters, digits or dashes');
      if (!/^\s*<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) throw new HttpError(400, 'invalid_request', `floor ${id}: svg must be a complete <svg> document`);
      if (svg.length > MAP_FLOOR_MAX) throw new HttpError(413, 'payload_too_large', `floor ${id}: svg is over ${MAP_FLOOR_MAX / 1_000_000} MB`);
      // The walk-path network the editor authored for this floor rides in
      // the metadata: a few hundred nodes, so it stays with the floor row.
      let paths = null;
      if (f.paths && typeof f.paths === 'object') {
        const nodes = Array.isArray(f.paths.nodes) ? f.paths.nodes : [], edges = Array.isArray(f.paths.edges) ? f.paths.edges : [];
        if (nodes.length > 5000 || edges.length > 10000) throw new HttpError(400, 'invalid_request', `floor ${id}: too many path nodes or edges`);
        const ns = nodes.map(n => ({ id: String(n?.id ?? '').slice(0, 24), x: Number(n?.x), y: Number(n?.y), ...(n?.type ? { type: String(n.type).slice(0, 16) } : {}) }));
        if (ns.some(n => !n.id || !Number.isFinite(n.x) || !Number.isFinite(n.y))) throw new HttpError(400, 'invalid_request', `floor ${id}: every path node needs an id and numeric x, y`);
        const es = edges.map(e => ({ a: String(e?.a ?? '').slice(0, 24), b: String(e?.b ?? '').slice(0, 24) })).filter(e => e.a && e.b);
        if (ns.length >= 2 && es.length) paths = { nodes: ns, edges: es };
      }
      metaFloors.push({ id, name: String(f.name || id).slice(0, 64), type: String(f.type || 'foh').slice(0, 16), shelves: (svg.match(/class="shelf-group"/g) || []).length, bytes: svg.length, ...(paths ? { paths } : {}) });
    }
    const departments = Array.isArray(body.departments) ? body.departments.slice(0, 64).map(d => ({ id: String(d.id || '').slice(0, 16), name: String(d.name || '').slice(0, 64), color: String(d.color || '').slice(0, 16), parent: String(d.parent || '').slice(0, 16) })) : [];
    const meta = { name: String(body.name || '').slice(0, 64), floors: metaFloors, departments };
    const at = new Date().toISOString(), by = { device: claims.device || null, owner: true };
    this.sql.exec('INSERT INTO maps (version, meta, at, by) VALUES (?, ?, ?, ?)', version, JSON.stringify(meta), at, JSON.stringify(by));
    for (const f of clean) this.sql.exec('INSERT INTO map_floors (version, floor, svg) VALUES (?, ?, ?)', version, f.id, f.svg);
    // The publish is an ordinary store event, so every device learns the
    // new version through its projection and the log shows who published.
    const ev = { id: ulid(), store: this.storeNo, area: 'store', type: 'map.publish', entity: { version }, payload: { floors: metaFloors.map(f => f.id), name: meta.name }, at, v: 1 };
    const r = this.applyOne(ev, { ...claims, roles: ['manager'], caps: claims.caps || [] });
    if (!r.ok) throw new HttpError(500, 'internal', `map stored but map.publish was refused: ${r.message}`);
    this.snapshotIfDue(); this.broadcast([r.event]);
    return json({ ok: true, version, at, seq: r.seq, stripped, floors: metaFloors.map(f => ({ ...f, ...(f.paths ? { paths: { nodes: f.paths.nodes.length, edges: f.paths.edges.length } } : {}) })) }, 201);
  }

  // ── WebSocket ─────────────────────────────────────────────────────────
  upgrade(request, claims) {
    if (request.headers.get('Upgrade') !== 'websocket') return fail(426, 'upgrade_required', 'expected a WebSocket upgrade');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [claims.device || 'nodevice']);
    server.serializeAttachment({ claims });
    // A socket that offered the conduit subprotocol (token as the second) gets it back.
    const offered = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(x => x.trim());
    return new Response(null, { status: 101, webSocket: client, headers: offered[0] === 'conduit' ? { 'Sec-WebSocket-Protocol': 'conduit' } : {} });
  }

  async webSocketMessage(ws, message) {
    let msg;
    const size = typeof message === 'string' ? message.length : message.byteLength;
    if (size > BATCH_MAX) return ws.send(JSON.stringify({ t: 'error', code: 'payload_too_large', message: 'frame is too large' }));
    try { msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return ws.send(JSON.stringify({ t: 'error', code: 'invalid_json', message: 'frames must be JSON' })); }
    const { claims } = ws.deserializeAttachment() || {};
    if (!claims) return ws.close(1008, 'no claims');
    if (claims.exp * 1000 < Date.now()) { ws.send(JSON.stringify({ t: 'error', code: 'unauthorised', message: 'token expired' })); return ws.close(1008, 'expired'); }
    if (!claims.owner && (Number(claims.epoch) || 0) < this.epoch) { ws.send(JSON.stringify({ t: 'error', code: 'revoked', message: 'signed out' })); return ws.close(1008, 'revoked'); }
    switch (msg.t) {
      case 'hello': {
        const since = Number(msg.since || 0);
        if (since && this.state.seq - since <= DELTA_LIMIT) ws.send(JSON.stringify({ t: 'delta', ...this.changes(since, claims) }));
        else ws.send(JSON.stringify({ t: 'snapshot', ...this.snapshot(claims, null) }));
        return;
      }
      case 'submit': return ws.send(JSON.stringify({ t: 'ack', results: this.submit(msg.events, claims) }));
      // The one write outside the event log, on purpose: heartbeats are
      // device telemetry every minute from every device, not store history,
      // so they live in the devices projection only (owner and manager read
      // it) and never become events. Every field is capped.
      case 'hb': {
        this.state.devices[claims.device || 'nodevice'] = {
          app: msg.app ? String(msg.app).slice(0, 64) : null, last: new Date().toISOString(), role: claims.roles?.[0] || null,
          area: msg.area ? String(msg.area).slice(0, 64) : null, online: msg.online !== false, outbox: Math.max(0, Math.min(1e6, Number(msg.outbox) || 0)), lastError: msg.lastError ? String(msg.lastError).slice(0, 200) : null, owner: !!claims.owner,
        };
        return;
      }
      case 'ping': return ws.send(JSON.stringify({ t: 'pong', seq: this.state.seq }));
      default: return ws.send(JSON.stringify({ t: 'error', code: 'invalid_request', message: `unknown frame ${msg.t}` }));
    }
  }
  webSocketClose(ws) { try { ws.close(); } catch {} }
  webSocketError(ws) { try { ws.close(); } catch {} }

  broadcast(events) {
    for (const ws of this.ctx.getWebSockets()) {
      const { claims } = ws.deserializeAttachment() || {};
      for (const e of events) {
        if (!claims || (!claims.owner && e.area !== 'store' && !readable(claims).includes(e.area))) continue;
        try { ws.send(JSON.stringify({ t: 'event', event: e })); } catch {}
      }
    }
  }
}

// A JSON body no bigger than max (Content-Length may be absent or wrong).
async function readBounded(request, max) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'payload_too_large', `body is over ${max / 1_000_000} MB`);
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'invalid_json', 'body must be JSON'); }
}
function rowToEvent(r) {
  return { id: r.id, seq: r.seq, type: r.type, area: r.area, entity: JSON.parse(r.entity), payload: JSON.parse(r.payload), actor: JSON.parse(r.actor), at: r.at, v: r.v };
}
function primaryRole(claims, roles) {
  if (claims.actor) return claims.actor;
  for (const r of roles) if (claims.roles.includes(r)) return r;
  return claims.roles.includes('manager') ? 'manager' : claims.roles[0];
}

// What a token may read. The store PIN opens the Floor; Stockroom and Back
// dock data need that area's code (or the manager code) on the token as
// well as the store's entitlement. The owner reads every entitled area.
const ROLE_AREAS = { stockroom: ['stockroom'], dock: ['backdock'], manager: ['floor', 'stockroom', 'backdock'] };
export function readable(claims) {
  const caps = claims?.caps || [];
  if (claims?.owner) return caps;
  const roles = claims?.roles || [];
  return caps.filter(a => a === 'floor' || roles.some(r => ROLE_AREAS[r]?.includes(a)));
}
// A read that belongs to one area: the store must be entitled to it and the
// token must hold a role that opens it.
function needArea(claims, area) {
  if (!(claims.caps || []).includes(area)) return fail(403, 'not_entitled', `${area} is not enabled for this store`);
  return readable(claims).includes(area) ? null : fail(403, 'unauthorised', `reading ${area === 'backdock' ? 'the Back dock' : 'the Stockroom'} needs its code`);
}
