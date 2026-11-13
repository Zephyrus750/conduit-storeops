// Practice mode (client/practice.js): the sample store is a fixed script of
// real events that the shared validation and reducers accept, every one;
// the practice store never reaches the network (fetch and WebSocket throw
// here) and judges changes on the session's own roles, as the worker does;
// its data lives under its own prefix and goes without touching the real
// store's keys; and while practice is on the client's gate lets no write,
// and no read of the store's data, through to the worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { practiceEvents, practiceSeed, shelvesOf, practiceWeek, openPracticeStore, practiceStorage, wipePractice, practiceRefusal, PRACTICE_PREFIX } from '../../client/practice.js';
import { memoryStorage } from '../../client/storage.js';
import { createClient } from '../../client/index.js';
import { validateEvent } from '../../shared/validate.js';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { storeDay } from '../../shared/time.js';
import { ulid } from '../../shared/ulid.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const MAP = { version: 'dev-7', floors: [{ id: 'ground', name: 'Ground', type: 'foh', svg: fs.readFileSync(path.join(ROOT, 'maps/1241.svg'), 'utf8') }] };
const ALL = ['floor', 'stockroom', 'backdock'];
const NOW = Date.parse('2026-11-11T09:30:00+08:00');

test('the sample store: every scripted event is valid and the reducers accept it, in order', () => {
  for (const areas of [ALL, ['floor'], ['floor', 'stockroom'], ['floor', 'backdock']]) for (const map of [MAP, null]) {
    const { events } = practiceEvents({ storeNo: '1241', now: NOW, areas, map });
    const s = initialState();
    events.forEach((e, i) => {
      assert.equal(validateEvent(e), null, `${e.type} is valid`);
      assert.ok(CATALOGUE[e.type], e.type);
      assert.equal(apply(s, { ...e, seq: i + 1 }), null, `${areas}: ${e.type} ${JSON.stringify(e.entity)} accepted`);
      assert.ok(Date.parse(e.at) < NOW, 'before now');
    });
    const seed = practiceSeed({ storeNo: '1241', now: NOW, areas, map });
    assert.deepEqual(seed.rejected, []);
    assert.equal(seed.seq, seed.events.length);
    assert.equal(seed.state.seq, seed.seq);
  }
});

test('the sample store shows something real in each area the device can open', () => {
  const { state: s, device, events } = practiceSeed({ storeNo: '1241', now: NOW, areas: ALL, map: MAP });
  const day = storeDay(NOW), week = practiceWeek(NOW);
  assert.equal(week, '2026-W46');
  // Floor: faults pinned on real shelves, this week's refresh marks in its focus departments, equipment, a live pull.
  const issues = Object.values(s.issues);
  assert.equal(issues.length, 4);
  assert.deepEqual(issues.map(i => i.status).sort(), ['completed', 'open', 'open', 'progress']);
  const shelves = new Set(shelvesOf(MAP).map(x => x.full));
  for (const i of issues) { assert.ok(shelves.has(i.loc), i.loc); assert.ok(Number.isFinite(i.x) && Number.isFinite(i.y) && i.floor === 'ground'); }
  const marks = s.refresh.weeks[week];
  assert.ok(Object.keys(marks).length >= 30, 'a third of the focus departments');
  assert.equal(s.refresh.focus[week].length, 2);
  assert.ok(Object.keys(marks).every(k => !/\s/.test(k)), 'marks are keyed by the canonical shelf code');
  assert.equal(Object.keys(s.equipment.items).length, 2);
  const pull = Object.values(s.pulls.sessions)[0];
  assert.equal(Object.keys(pull.lines).length, 3);
  assert.equal(Object.values(pull.lines).filter(l => l.st === 'pulled').length, 1);
  // Stockroom: today's board in every state, the report this device holds for it, two cages, adjustments.
  const subs = Object.values(s.backfill.subs).filter(x => x.date === day);
  assert.deepEqual(subs.map(x => x.status).sort(), ['corrected', 'pending', 'pending', 'submitted']);
  assert.deepEqual(s.backfill.requested[day], ['7037', '7040']);
  assert.equal(s.backfill.report.date, day);
  const rep = device[`simreport:1241:${day}`];
  assert.equal(rep.rev, s.backfill.report.rev, 'Backfill review reads this copy, without asking the worker');
  for (const x of subs) assert.ok(rep.byLoc[x.bay], x.bay);
  assert.deepEqual(Object.keys(s.cages).sort(), ['CG104', 'CG117']);
  assert.equal(s.cages.CG104.location, 'BOH A3');
  assert.equal(Object.keys(s.adjustments[day]).length, 2);
  // Back dock: truck 1 live with its manifest, five pallets down, one done and two being decanted.
  const t = s.dock.trucks[`${day}-T1`];
  assert.equal(t.status, 'live');
  assert.equal(t.manifest.manNo, '7040301');
  assert.equal(Object.keys(t.pallets).length, 5);
  assert.deepEqual(Object.values(t.pallets).map(p => p.status).sort(), ['active', 'active', 'done', 'landed', 'landed']);
  // The other devices of the sample store did it all: none of it is this device's.
  assert.ok(events.every(e => /-(phone|tablet|pc)$/.test(e.actor.device)));
});

test('the sample store keeps to the areas the device can open, and to the store’s own set-up', () => {
  const floorOnly = practiceSeed({ storeNo: '1241', now: NOW, areas: ['floor'], map: MAP }).state;
  assert.deepEqual(floorOnly.backfill.subs, {}); assert.deepEqual(floorOnly.cages, {}); assert.deepEqual(floorOnly.dock.trucks, {});
  assert.equal(Object.keys(floorOnly.issues).length, 4);
  // The real store's settings, tools, areas and map version come across; a small dock grid still takes the pallets.
  const real = initialState();
  real.settings = { ...real.settings, tz: 'Australia/Sydney', autoLockMins: 15, dockGrid: { rows: 2, cols: 3 } };
  real.tools = { off: ['picklist'], at: null }; real.areas = { on: ['backdock', 'floor', 'stockroom'], at: null };
  const { state: s, rejected } = practiceSeed({ storeNo: '1241', now: NOW, areas: ALL, real, map: MAP });
  assert.deepEqual(rejected, []);
  assert.equal(s.settings.autoLockMins, 15, 'the idle re-lock is the store’s');
  assert.equal(s.settings.tz, 'Australia/Sydney');
  assert.deepEqual(s.tools.off, ['picklist']);
  assert.equal(s.map.version, 'dev-7', 'the map this device holds');
  const day = storeDay(NOW, 'Australia/Sydney');
  assert.deepEqual(Object.keys(s.dock.trucks[`${day}-T1`].pallets).sort(), ['A1', 'A2', 'A3', 'B1', 'B2']);
  // No map on the device: the rest still seeds, without shelves.
  const bare = practiceSeed({ storeNo: '1241', now: NOW, areas: ALL, map: null });
  assert.deepEqual(bare.rejected, []);
  assert.deepEqual(bare.state.refresh.weeks, {});
});

// ── the practice store and the network ───────────────────────────────
function noNetwork(t) {
  const calls = [];
  const fetch0 = globalThis.fetch, ws0 = globalThis.WebSocket;
  globalThis.fetch = (...a) => { calls.push(a); throw new Error('practice must never call fetch'); };
  globalThis.WebSocket = class { constructor(...a) { calls.push(a); throw new Error('practice must never open a socket'); } };
  t.after(() => { globalThis.fetch = fetch0; globalThis.WebSocket = ws0; });
  return calls;
}
function session(roles = ['manager'], caps = ALL) {
  const ls = new Set();
  return {
    current: { store: '1241', name: 'Busselton', roles, caps, owner: false, actas: false, expires: Math.floor(Date.now() / 1000) + 3600 },
    device: 'd_practice', app: 'test',
    token: async () => { throw new Error('practice never asks the real session for a token'); },
    on: (k, f) => { if (k === 'change') ls.add(f); return () => ls.delete(f); },
    unauthorised() { throw new Error('not here'); },
  };
}
const settle = async (store, n = 40) => { for (let i = 0; i < n && store.pending.length; i++) { await store.flush(); await new Promise(r => setTimeout(r, 5)); } };
const seedFn = (areas = ALL) => async () => practiceSeed({ storeNo: '1241', now: Date.now(), areas, map: MAP });

test('the practice store never calls fetch or opens a socket: changes are judged and kept on the device', async t => {
  const calls = noNetwork(t);
  const storage = memoryStorage({ 'snap:1241': { seq: 812, state: { marker: 'real' } }, 'outbox:1241:01REAL': { id: '01REAL' }, suite_session: { store: '1241' } });
  const real = JSON.stringify(await storage.list(''));
  const { store, fresh } = await openPracticeStore({ storeNo: '1241', session: session(), storage, seed: seedFn() });
  t.after(() => store.close());
  assert.equal(fresh, true);
  const seeded = store.seq;
  assert.ok(seeded > 50);
  assert.equal(Object.keys(store.get('issues')).length, 4);
  // A new starter's morning: a fault logged, a shelf refreshed, a pallet landed, a bay scanned.
  const day = storeDay(new Date()), truck = Object.keys(store.get('dock').trucks)[0];
  await store.dispatch({ type: 'issue.log', entity: { issue: ulid() }, payload: { cat: 'light', title: 'Practice fault', sev: 1 } });
  await store.dispatch({ type: 'refresh.mark', entity: { segment: 'A11S1', week: practiceWeek(Date.now()) }, payload: { dept: 'h1' } });
  await store.dispatch({ type: 'pallet.land', entity: { truck, bay: 'C3' }, payload: { ptype: 'chep', cartons: 12 } });
  await store.dispatch({ type: 'submission.update', entity: { bay: '7055', date: day }, payload: { codes: { 43302210: true } } });
  await settle(store);
  assert.equal(store.pending.length, 0, 'every change confirmed by the stand-in');
  assert.equal(store.seq, seeded + 4);
  assert.equal(Object.keys(store.get('issues')).length, 5);
  assert.equal(store.get('dock').trucks[truck].pallets.C3.ptype, 'chep');
  assert.equal(store.get('issues')[Object.keys(store.get('issues')).find(id => store.get('issues')[id].title === 'Practice fault')].by, 'd_practice', 'credited to this device, as the worker would');
  await new Promise(r => setTimeout(r, 30));   // the first poll and heartbeat have run
  assert.deepEqual(calls, [], 'no fetch, no socket');
  // The real store's keys are as they were; practice wrote only under its prefix.
  const after = await storage.list('');
  assert.equal(JSON.stringify(after.filter(r => !r.key.startsWith(PRACTICE_PREFIX))), real);
  assert.ok(after.some(r => r.key === `${PRACTICE_PREFIX}snap:1241`));
  assert.ok(after.some(r => r.key === `${PRACTICE_PREFIX}simreport:1241:${storeDay(new Date())}`));
});

test('the practice store gives no more than the session holds: a change its roles do not cover waits, as on the worker', async t => {
  const calls = noNetwork(t);
  const storage = memoryStorage();
  const { store } = await openPracticeStore({ storeNo: '1241', session: session(['floor']), storage, seed: seedFn() });
  t.after(() => store.close());
  await store.dispatch({ type: 'cage.create', entity: { cage: 'CG900' }, payload: { ring: 'overstock' } });
  await store.dispatch({ type: 'issue.log', entity: { issue: ulid() }, payload: { cat: 'door', title: 'Floor can log this', sev: 0 } });
  await settle(store, 5);
  assert.equal(store.held.length, 1);
  assert.equal(store.held[0].code, 'unauthorised');
  assert.equal(store.held[0].event.type, 'cage.create');
  assert.ok(!store.get('cages').CG900 || store.pending.some(e => e.type === 'cage.create'), 'never confirmed');
  assert.deepEqual(calls, []);
});

test('a reload mid-practice resumes the same practice store; ending it wipes only the practice prefix', async t => {
  noNetwork(t);
  const storage = memoryStorage({ 'snap:1241': { seq: 5, state: {} }, 'kc:43302210': { at: 1, item: null }, 'map:1241': { version: 'dev-7' } });
  const a = await openPracticeStore({ storeNo: '1241', session: session(), storage, seed: seedFn() });
  await a.store.dispatch({ type: 'issue.log', entity: { issue: 'practice-1' }, payload: { cat: 'leak', title: 'Kept across a reload', sev: 2 } });
  await settle(a.store);
  a.store.close();
  let seeded = 0;
  const b = await openPracticeStore({ storeNo: '1241', session: session(), storage, seed: async () => { seeded++; return practiceSeed({ storeNo: '1241', now: Date.now(), areas: ALL, map: MAP }); } });
  t.after(() => b.store.close());
  assert.equal(b.fresh, false); assert.equal(seeded, 0, 'not seeded again');
  await new Promise(r => setTimeout(r, 20));   // the first poll folds in what the snapshot had not saved yet
  assert.equal(b.store.get('issues')['practice-1']?.title, 'Kept across a reload');
  b.store.close();
  const gone = await wipePractice(storage);
  assert.ok(gone >= 3);
  assert.deepEqual((await storage.list('')).map(r => r.key).sort(), ['kc:43302210', 'map:1241', 'snap:1241']);
});

test('practice storage reads and writes under its prefix and lists keys as the caller wrote them', async () => {
  const raw = memoryStorage({ 'simreport:1241:2026-11-11': 'real' });
  const ps = practiceStorage(raw);
  assert.equal(await ps.get('simreport:1241:2026-11-11'), undefined, 'the real report is not practice’s');
  await ps.set('simreport:1241:2026-11-11', 'practice');
  assert.equal(await raw.get('simreport:1241:2026-11-11'), 'real');
  assert.equal(await raw.get('practice:simreport:1241:2026-11-11'), 'practice');
  assert.deepEqual(await ps.list('simreport:'), [{ key: 'simreport:1241:2026-11-11', value: 'practice' }]);
  assert.equal(await ps.count('simreport:'), 1);
  assert.equal(await ps.has('simreport:1241:2026-11-11'), true);
});

// ── the gate on the worker ───────────────────────────────────────────
test('while practice is on, no write and no read of the store’s data reaches the worker', async () => {
  const W = 'write', R = 'read';
  const cases = [
    ['POST', '/v1/store/1241/events', W], ['POST', '/v1/store/1241/hb', W], ['POST', '/v1/store/1241/photo', W], ['DELETE', '/v1/store/1241/photo/p1', W],
    ['POST', '/v1/store/1241/manifest', W], ['DELETE', '/v1/store/1241/manifest/7040301', W], ['POST', '/v1/store/1241/soh', W], ['POST', '/v1/store/1241/backfill/report', W],
    ['POST', '/v1/resources/requests', W], ['POST', '/v1/store/1241/map', W], ['POST', '/v1/auth/signin', W], ['POST', '/v1/auth/signout', W], ['PUT', '/v1/catalogue', W],
    ['GET', '/v1/store/1241/snapshot', R], ['GET', '/v1/store/1241/changes?since=4', R], ['GET', '/v1/store/1241/soh?n=1', R], ['GET', '/v1/store/1241/manifests', R],
    ['GET', '/v1/store/1241/backfill/report?date=2026-11-11', R], ['GET', '/v1/store/1241/bays?kc=43302210', R], ['GET', '/v1/store/1241/photo/p1', R], ['GET', '/v1/admin/stores', R],
    ['POST', '/v1/auth/refresh', null], ['POST', '/v1/auth/check', null], ['POST', '/v1/auth/lock', null], ['POST', '/v1/auth/unlock', null], ['POST', '/v1/admin/actas/1241', null],
    ['POST', '/v1/admin/stores', W], ['POST', '/v1/admin/actas/1241/x', W],
    ['GET', '/v1/store/1241/map/latest', null], ['GET', '/v1/store/1241/plan/abc', null], ['GET', '/v1/catalogue?kc=43302210', null], ['GET', '/v1/catalogue/nearmiss?kc=1', null], ['GET', '/v1/resources', null], ['GET', '/v1/stores', null],
  ];
  for (const [method, p, want] of cases) assert.equal(practiceRefusal(p, { method }), want, `${method} ${p}`);
  assert.equal(practiceRefusal('/v1/store/1241/events'), R, 'a request with no method is a GET');
});

test('the client’s gate refuses before anything leaves the device, and lifts', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(`${init.method} ${url}`); return { ok: true, json: async () => ({}) }; };
  const c = createClient({ baseUrl: 'https://worker.test', storage: memoryStorage(), fetchImpl, WebSocketImpl: null });
  c.setGate((p, o) => practiceRefusal(p, o) ? Object.assign(new Error('Not in practice mode'), { code: 'practice' }) : null);
  await assert.rejects(c.transport.request('/v1/store/1241/events', { method: 'POST', body: { events: [] } }), /Not in practice mode/);
  await assert.rejects(c.transport.request('/v1/store/1241/soh'), /Not in practice mode/);
  await c.transport.request('/v1/catalogue?kc=43302210');
  await c.catalogue.lookup('43302210');
  assert.deepEqual(sent, ['GET https://worker.test/v1/catalogue?kc=43302210', 'GET https://worker.test/v1/catalogue?kc=43302210']);
  c.setGate(null);
  await c.transport.request('/v1/store/1241/events', { method: 'POST', body: { events: [] } });
  assert.equal(sent.at(-1), 'POST https://worker.test/v1/store/1241/events');
});

