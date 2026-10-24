import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { toolForEvent } from '../../shared/tools.js';
import { retain } from '../../shared/retain.js';
import { sessionCounts, sessionPeople, inZone, lineInZone, uncovered, pulledToday, gotOf } from '../../shared/reducers/pull.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, { device = 'P1', role = 'floor', at = '2026-10-24T09:00:00+08:00' } = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role, device, owner: false }, at, v: 1,
});
const S = 'SES1';
const start = (s, payload = {}) => apply(s, ev('pull.session.start', { session: S }, { name: 'Toys · aisles 16–18', dept: 'K2', part: 'req', ...payload }));
const ask = (s, line, payload, opts) => apply(s, ev('pull.request', { session: S, line }, { kc: '43648803', bays: ['7036', '7041'], qty: 12, ...payload }, opts));
const mark = (s, line, payload, opts = { device: 'R1', role: 'stockroom' }) => apply(s, ev('pull.mark', { session: S, line }, payload, opts));

test('live pull: events are Floor events; marking off and cages need the Stockroom; the tool covers them all', () => {
  for (const t of ['pull.session.start', 'pull.session.end', 'pull.join', 'pull.zone.set', 'pull.request', 'pull.update', 'pull.mark', 'pull.cage.send']) {
    assert.equal(CATALOGUE[t].area, 'floor', t); assert.equal(toolForEvent(t)?.id, 'livepull', t);
  }
  assert.deepEqual(CATALOGUE['pull.mark'].roles, ['stockroom']); assert.deepEqual(CATALOGUE['pull.cage.send'].roles, ['stockroom']); assert.deepEqual(CATALOGUE['pull.zone.set'].roles, ['stockroom']);
  assert.deepEqual(CATALOGUE['pull.request'].roles, ['floor', 'stockroom'], 'team members and managers both ask');
});

test('live pull: a session starts with a name and a department; the starter joins as the requester', () => {
  const s = initialState();
  assert.equal(apply(s, ev('pull.session.start', { session: S }, { name: '  ', dept: 'k2' })).code, 'invalid_event');
  assert.equal(apply(s, ev('pull.session.start', { session: S }, { name: 'x', dept: 'Toys!' })).code, 'invalid_event');
  assert.equal(start(s), null);
  const ses = s.pulls.sessions[S];
  assert.equal(ses.dept, 'k2'); assert.equal(ses.cage, 1); assert.equal(ses.shelves, false); assert.equal(ses.people.P1.part, 'req');
  assert.equal(start(s).code, 'exists');
  assert.equal(apply(s, ev('pull.join', { session: S })).code, 'unchanged', 'already the requester');
  assert.equal(apply(s, ev('pull.zone.set', { session: S }, { bays: ['7000-7029', '7036'] }, { device: 'R1', role: 'stockroom' })), null);
  assert.deepEqual(ses.people.R1, { part: 'pull', bays: ['7000-7029', '7036'], at: '2026-10-24T09:00:00+08:00' });
  assert.equal(apply(s, ev('pull.zone.set', { session: S }, { bays: [] }, { device: 'R2', role: 'stockroom' })), null);
  assert.deepEqual(ses.people.R2.bays, ['all'], 'no ranges: every bay');
  assert.equal(apply(s, ev('pull.zone.set', { session: S }, { bays: ['A16'] }, { device: 'R3' })).code, 'invalid_event');
  assert.deepEqual(sessionPeople(ses), { req: 1, pull: 2 });
});

test('live pull: a request names stockroom bays and how many: a number, cartons or all there is', () => {
  const s = initialState(); start(s);
  assert.equal(ask(s, 'L1', { bays: [] }).code, 'invalid_event', 'only items with a stockroom location');
  assert.equal(ask(s, 'L1', { kc: 'ABC' }).code, 'invalid_event');
  assert.equal(ask(s, 'L1', { qty: 0 }).code, 'invalid_event');
  assert.equal(ask(s, 'L1', { carton: 12 }), null);
  const l1 = s.pulls.sessions[S].lines.L1;
  assert.deepEqual([l1.kc, l1.bays, l1.qty, l1.carton, l1.st, l1.by], ['43648803', ['7036', '7041'], 12, 12, 'todo', 'P1']);
  assert.equal(ask(s, 'L1').code, 'exists');
  assert.equal(ask(s, 'L2', { kc: '43652214', bays: ['7034'], qty: undefined, all: true, shelf: 'a18 s1' }), null);
  assert.equal(s.pulls.sessions[S].lines.L2.qty, 'all'); assert.equal(s.pulls.sessions[S].lines.L2.shelf, 'A18 S1');
  // The requester changes it while it waits, or takes it back.
  assert.equal(apply(s, ev('pull.update', { session: S, line: 'L1' }, { qty: 24 })), null); assert.equal(l1.qty, 24);
  assert.equal(apply(s, ev('pull.update', { session: S, line: 'L1' }, { qty: 24 })).code, 'unchanged');
  assert.equal(apply(s, ev('pull.update', { session: S, line: 'L2' }, { cancel: true })), null);
  assert.equal(s.pulls.sessions[S].lines.L2.st, 'cancelled');
  assert.deepEqual(sessionCounts(s.pulls.sessions[S]), { asked: 1, todo: 1, pulled: 0, short: 0, gone: 0 }, 'a request taken back is not counted');
});

test('live pull: the first mark wins; short takes from more than one bay; undo until the cage goes', () => {
  const s = initialState(); start(s);
  ask(s, 'L1'); ask(s, 'L2', { kc: '43615502', bays: ['7022', '7028'], qty: 6 }); ask(s, 'L3', { kc: '43620019', bays: ['7014'], qty: 2 });
  ask(s, 'L4', { kc: '43652214', bays: ['7034'], qty: undefined, all: true });
  const lines = s.pulls.sessions[S].lines;
  assert.equal(mark(s, 'L1', { st: 'pulled' }), null);
  assert.deepEqual(lines.L1.got, { 7036: 12 }, 'pulled with no count: all of it from the first bay');
  assert.equal(mark(s, 'L1', { st: 'gone' }, { device: 'R2', role: 'stockroom' }).code, 'conflict', 'a second phone cannot mark it again');
  assert.equal(mark(s, 'L2', { st: 'short', got: { 7022: 6 } }).code, 'invalid_event', 'short is fewer than asked');
  assert.equal(mark(s, 'L2', { st: 'short', got: {} }).code, 'invalid_event', 'none is gone, not short');
  assert.equal(mark(s, 'L2', { st: 'pulled', got: { 7022: 2, 7028: 4 } }), null, 'all 6, from two bays');
  assert.equal(gotOf(lines.L2), 6);
  assert.equal(mark(s, 'L3', { st: 'gone' }), null); assert.equal(lines.L3.got, null);
  assert.equal(mark(s, 'L4', { st: 'pulled' }), null); assert.equal(lines.L4.got, null, 'all there is: pulled all, no count needed');
  assert.equal(mark(s, 'L3', { st: 'todo' }), null, 'undo before the cage goes'); assert.equal(lines.L3.st, 'todo');
  assert.equal(mark(s, 'L3', { st: 'todo' }).code, 'unchanged');
  mark(s, 'L3', { st: 'gone' });
  assert.equal(apply(s, ev('pull.update', { session: S, line: 'L1' }, { qty: 3 })).code, 'conflict', 'marked off: the requester cannot change it');
  // The cage goes down with what has been marked off.
  assert.equal(apply(s, ev('pull.cage.send', { session: S }, { cage: 1, tag: 'bsn1240417' }, { device: 'R1', role: 'stockroom' })), null);
  const ses = s.pulls.sessions[S];
  assert.deepEqual([lines.L1.cage, lines.L2.cage, lines.L3.cage, lines.L4.cage], [1, 1, 1, 1]);
  assert.deepEqual([ses.cage, ses.cages[1].lines, ses.cages[1].tag], [2, 4, 'BSN1240417']);
  assert.equal(apply(s, ev('pull.cage.send', { session: S }, { cage: 1 })).code, 'unchanged', 'a second send of the same cage is a no-op');
  assert.equal(apply(s, ev('pull.cage.send', { session: S }, { cage: 2 })).code, 'invalid_event', 'nothing marked off for cage 2');
  assert.equal(mark(s, 'L1', { st: 'todo' }).code, 'conflict', 'it went down in cage 1');
});

test('live pull: an ended session takes no more requests, but its marks and cages still land', () => {
  const s = initialState(); start(s); ask(s, 'L1');
  assert.equal(apply(s, ev('pull.session.end', { session: S })), null);
  assert.equal(apply(s, ev('pull.session.end', { session: S })).code, 'unchanged');
  assert.equal(ask(s, 'L2').code, 'closed');
  assert.equal(apply(s, ev('pull.join', { session: S })).code, 'closed');
  assert.equal(mark(s, 'L1', { st: 'pulled' }), null);
  assert.equal(apply(s, ev('pull.cage.send', { session: S }, { cage: 1 })), null);
});

test('live pull: bays a puller covers, bays nobody covers, and what was pulled today', () => {
  assert.equal(inZone('7036', ['7030-7059']), true); assert.equal(inZone('7012', ['7030-7059']), false);
  assert.equal(inZone('7036', ['7036']), true); assert.equal(inZone('A1', ['all']), true); assert.equal(inZone('7012', []), true);
  const s = initialState(); start(s);
  apply(s, ev('pull.zone.set', { session: S }, { bays: ['7030-7059'] }, { device: 'R1', role: 'stockroom' }));
  ask(s, 'L1'); ask(s, 'L2', { kc: '42977636', bays: ['7012'], qty: 4 });
  const ses = s.pulls.sessions[S];
  assert.equal(lineInZone(ses.lines.L1, ['7030-7059']), true); assert.equal(lineInZone(ses.lines.L2, ['7030-7059']), false);
  assert.equal(uncovered(ses, '7012'), true, 'no puller has 7012: every puller sees it'); assert.equal(uncovered(ses, '7036'), false);
  mark(s, 'L2', { st: 'pulled' }, { device: 'R1', role: 'stockroom', at: '2026-10-24T09:31:00+08:00' });
  assert.deepEqual(pulledToday(s, '42977636', '2026-10-24'), [{ session: S, name: 'Toys · aisles 16–18', bay: '7012', n: 4, at: '2026-10-24T09:31:00+08:00' }]);
  assert.deepEqual(pulledToday(s, '42977636', '2026-10-25'), [], 'only today');
});

test('live pull: sessions are listed for a week, then leave the live state', () => {
  const s = initialState(); start(s);
  apply(s, ev('pull.session.start', { session: 'OLD' }, { name: 'Kitchen', dept: 'h1' }, { at: '2026-10-15T09:00:00+08:00' }));
  assert.equal(retain(s, '2026-10-24').pulls, 1);
  assert.deepEqual(Object.keys(s.pulls.sessions), [S]);
});
