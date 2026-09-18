import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, apply } from '../../shared/reducers.js';
import { addMonths } from '../../shared/reducers/floor.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const ev = (type, entity, payload = {}, extra = {}) => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role: 'floor', device: 'P1', owner: false }, at: '2026-09-07T08:00:00+08:00', v: 1, ...extra,
});

test('refresh: focus lowercases, plan paint erases, clearWeek empties', () => {
  const s = initialState();
  assert.equal(apply(s, ev('refresh.focus.set', { week: '2026-W37' }, { departments: ['H1', 'k2'] })), null);
  assert.deepEqual(s.refresh.focus['2026-W37'], ['h1', 'k2']);
  assert.equal(apply(s, ev('refresh.plan.paint', { segment: 'A21 S1' }, { colour: '#a855f7' })), null);
  assert.equal(s.refresh.plan['A21 S1'], '#a855f7');
  assert.equal(apply(s, ev('refresh.plan.paint', { segment: 'A21 S1' }, { colour: 'purple' })).code, 'invalid_event');
  assert.equal(apply(s, ev('refresh.plan.paint', { segment: 'A21 S1' }, { colour: 'erase' })), null);
  assert.equal(s.refresh.plan['A21 S1'], undefined);
  apply(s, ev('refresh.mark', { segment: 'A21 S1', week: '2026-W37' }));
  assert.equal(apply(s, ev('refresh.clearWeek', { week: '2026-W37' })), null);
  assert.deepEqual(s.refresh.weeks['2026-W37'], {});
});

test('labels: check and uncheck per cycle, variance list, cycle length guard', () => {
  const s = initialState();
  assert.equal(apply(s, ev('label.check', { cycle: '2026-09M', micro: 'h4-023' })), null);
  assert.equal(s.labels.checks['2026-09M']['h4-023'].device, 'P1');
  assert.equal(apply(s, ev('label.uncheck', { cycle: '2026-09M', micro: 'h4-023' })), null);
  assert.equal(s.labels.checks['2026-09M']['h4-023'], undefined);
  assert.equal(apply(s, ev('label.variance', { cycle: '2026-09M', micro: 'h4-023' }, { keycode: '42977636', note: 'ticket says 12.00' })), null);
  assert.equal(s.labels.variances['2026-09M'].length, 1);
  assert.equal(apply(s, ev('label.cycle.set', {}, { cycleLen: 'daily' })).code, 'invalid_event');
  assert.equal(apply(s, ev('label.cycle.set', {}, { cycleLen: 'fortnightly' })), null);
  assert.equal(apply(s, ev('label.assign', { micro: 'h4-023' }, { shelves: ['H4S1', 'H4S2'] })), null);
  assert.deepEqual(s.labels.assign['h4-023'], ['H4S1', 'H4S2']);
});

test('stocktake: state advances, final phase blocks counting, verify toggles, end closes', () => {
  const s = initialState();
  const k = { session: '2026-07-04' };
  assert.equal(apply(s, ev('stocktake.scan', { ...k, shelf: 'K12S1' }, { state: 'counted' })).code, 'not_found');
  assert.equal(apply(s, ev('stocktake.start', k)), null);
  assert.equal(apply(s, ev('stocktake.scan', { ...k, shelf: 'K12S1' }, { state: 'counted' })), null);
  assert.equal(apply(s, ev('stocktake.verify', { ...k, shelf: 'K12S1' }, { verified: true }, { actor: { role: 'manager', device: 'DESK' } })), null);
  assert.equal(s.stocktake.sessions['2026-07-04'].shelves.K12S1.state, 'verified');
  assert.equal(s.stocktake.sessions['2026-07-04'].shelves.K12S1.vby, 'DESK');
  assert.equal(apply(s, ev('stocktake.verify', { ...k, shelf: 'K12S1' }, { verified: false })), null);
  assert.equal(s.stocktake.sessions['2026-07-04'].shelves.K12S1.state, 'counted');
  assert.equal(apply(s, ev('stocktake.phase', k, { phase: 'final' })), null);
  assert.equal(apply(s, ev('stocktake.scan', { ...k, shelf: 'K12S2' }, { state: 'counted' })).code, 'phase_final');
  assert.equal(apply(s, ev('stocktake.verifyAll', k)), null);
  assert.equal(s.stocktake.sessions['2026-07-04'].shelves.K12S1.state, 'verified');
  assert.equal(apply(s, ev('stocktake.scan', { ...k, shelf: 'K12S1' }, { state: 'cleared' })), null);
  assert.equal(s.stocktake.sessions['2026-07-04'].shelves.K12S1, undefined);
  assert.equal(apply(s, ev('stocktake.end', k)), null);
  assert.equal(apply(s, ev('stocktake.phase', k, { phase: 'counting' })).code, 'session_ended');
});

test('issues: log, progress, close, reopen bumps recur and keeps the log', () => {
  const s = initialState();
  const k = { issue: 'm1abc' };
  assert.equal(apply(s, ev('issue.log', k, { cat: 'leak', title: 'Leak under the sink', sev: 2, loc: 'upstairs tea room' })), null);
  assert.equal(apply(s, ev('issue.log', k, { cat: 'leak', title: 'dup', sev: 1 })).code, 'exists');
  assert.equal(apply(s, ev('issue.log', { issue: 'm2' }, { cat: 'wifi', title: 'x', sev: 1 })).code, 'invalid_event');
  assert.equal(apply(s, ev('issue.update', k, { sev: 3, note: 'getting worse' })), null);
  assert.equal(s.issues.m1abc.sev, 3);
  assert.equal(apply(s, ev('issue.progress', k, {})), null);
  assert.equal(apply(s, ev('issue.close', k, { note: 'plumber fixed' })), null);
  assert.equal(s.issues.m1abc.status, 'completed');
  assert.equal(apply(s, ev('issue.reopen', k, {})), null);
  assert.equal(s.issues.m1abc.status, 'open'); assert.equal(s.issues.m1abc.recur, 1);
  assert.deepEqual(s.issues.m1abc.log.map(l => l.a), ['Logged', 'Edited', 'Maintenance done', 'Completed', 'Reopened (recurring)']);
});

test('assets: service sets due from interval, schedule recomputes from last service', () => {
  const s = initialState();
  const k = { asset: 'fire-ext_120_340' };
  assert.equal(apply(s, ev('asset.service', k, { note: 'docket 4412' })), null);
  assert.equal(s.assets[k.asset].due, '2027-09-07');
  assert.equal(apply(s, ev('asset.schedule', k, { months: 6 }, { at: '2026-10-01T08:00:00+08:00' })), null);
  assert.equal(s.assets[k.asset].due, '2027-03-07');
  assert.equal(apply(s, ev('asset.schedule', k, { months: 0 })).code, 'invalid_event');
  assert.equal(addMonths('2026-01-31T00:00:00Z', 1), '2026-02-28');
});

test('picklist: per device, sanitised items', () => {
  const s = initialState();
  assert.equal(apply(s, ev('picklist.set', { device: 'P1' }, { items: [{ code: 'K12S1' }, { code: 'A1', completed: true }, { nope: 1 }] })), null);
  assert.deepEqual(s.picklists.P1.items, [{ code: 'K12S1', completed: false }, { code: 'A1', completed: true }]);
});
