import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { validateEvent } from '../../shared/validate.js';
import { ulid } from '../../shared/ulid.js';

// October audit §5: "a rejected event leaves state unchanged", run against
// every reducer. Each type is sent a few hundred valid-looking events built
// from the payload keys its reducers read and values of every shape, on a
// store with something in every area. A refusal must leave the state byte
// for byte as it was, and no event may throw.

let seed = 20261009;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)];

// Every payload key the reducers read (p.x, e.payload.x, payload?.x).
const src = ['floor', 'stockroom', 'backdock', 'store'].map(f => readFileSync(new URL(`../../shared/reducers/${f}.js`, import.meta.url), 'utf8')).join('\n');
const KEYS = [...new Set([...src.matchAll(/\b(?:p|payload|e\.payload)\??\.(\w+)/g)].map(m => m[1]))].filter(k => !['length', 'map', 'filter', 'some', 'slice'].includes(k));

const T1 = '2026-09-07-T1', DAY = '2026-09-07';
const ENTITY = {
  truck: [T1, '2026-09-08-T1', 'nope'], bay: ['A1', 'A2', 'Z9'], issue: ['i1', 'i2', 'nope'], cage: ['BSN1240417', 'BSN1240418', 'nope'],
  date: [DAY, '2026-09-08', 'bad'], segment: ['A16 S1', 'B2 S1'], week: ['2026-W37', 'x'], micro: ['H1-01', 'x'], cycle: ['2026-W37', 'c'],
  session: ['st1', 'nope'], shelf: ['A16 S1', 'x'], asset: ['ext_1', 'nope'], load: ['L1', 'nope'], pid: ['P1', 'nope'], keycode: ['12345678', 'x'],
  manNo: ['M1', 'M2'], slot: ['1', '2'], device: ['D1'], apn: ['9300000000001'], sweep: ['sw1'], size: ['1080x2400'], version: ['v1'], edit: ['e1'], note: ['n1'],
};
const VALUES = ['', 'x', 'A1', 'D1', 'P1', '12345678', T1, DAY, '2026-09-07T01:00:00Z', '<img src=x>', 'erase', '#ff0000', 'halt', 'break', 'counted', 'final', 'chep',
  -1, 0, 1, 2, 5, 9999, 1e9, 1.5, true, false, null, [], ['x'], ['A1'], ['D1', 'D2'], [{}], [{ bay: 'A1', consolIds: ['400000001'], basis: 'manual' }], [1, 2], {}, { a: 1 }, { x: { y: 1 } }];
const SAMPLE = { string: ['x', 'A1', 'D1', 'P1', '12345678', 'chep', 'leak', 'halt', 'counted', '#00ff00', 'overstock'], number: [0, 1, 3, 40, -2, 1.5], array: [[], ['D1'], ['A16 S1'], [{}]], object: [{}, { a: 1 }], boolean: [true, false] };

let clock = Date.parse('2026-09-07T00:00:00Z');
const ev = (type, entity, payload = {}, role = 'manager') => ({
  id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload,
  actor: { role, device: 'D1', owner: false }, at: new Date(clock += 60_000).toISOString(), v: 1,
});
function stocked() {
  const s = initialState();
  const cons = n => ({ cons: String(400000000 + n), cartons: 20, dept: '021' });
  for (const e of [
    ev('truck.create', { truck: T1 }), ev('truck.setLive', { truck: T1 }), ev('truck.team.set', { truck: T1 }, { team: ['D1', 'D2'] }),
    ev('pallet.land', { truck: T1, bay: 'A1' }, { ptype: 'chep', cartons: 40 }), ev('pallet.land', { truck: T1, bay: 'A2' }, { ptype: 'chep', cartons: 30 }),
    ev('manifest.attach', { truck: T1 }, { manNo: 'M1', consols: [cons(1), cons(2)] }), ev('pallet.start', { truck: T1, bay: 'A1' }, { pid: 'D1' }),
    ev('issue.log', { issue: 'i1' }, { cat: 'leak', title: 'Drip', sev: 1 }), ev('refresh.mark', { segment: 'A16 S1', week: '2026-W37' }),
    ev('cage.create', { cage: 'BSN1240417' }, { ring: 'overstock' }), ev('cage.scan', { cage: 'BSN1240417' }, { keycode: '12345678', qty: 3 }),
    ev('submission.update', { bay: 'A1', date: DAY }, { codes: { 12345678: true } }), ev('stocktake.start', { session: 'st1' }),
    ev('inventory.load.add', { load: 'L1' }, { label: 'Load', pallets: [{ pid: 'P1', items: [{ k: '12345678', q: 2 }] }] }),
  ]) assert.equal(apply(s, e), null, e.type);
  return s;
}

function randomEvent(type) {
  const info = CATALOGUE[type], entity = {}, payload = {};
  for (const k of info.entity) entity[k] = pick(ENTITY[k] || ['x']);
  for (const [k, t] of Object.entries(info.payload)) payload[k] = rnd() < 0.8 ? pick(SAMPLE[t] || ['x']) : pick(VALUES);
  for (let n = Math.floor(rnd() * 4); n > 0; n--) payload[pick(KEYS)] = pick(VALUES);
  return ev(type, entity, payload);
}

test('every reducer: a refused event leaves the state exactly as it was, and nothing throws', () => {
  const base = stocked();
  let refused = 0, accepted = 0;
  for (const type of Object.keys(CATALOGUE)) {
    let chain = structuredClone(base);
    for (let i = 0; i < 300; i++) {
      const e = randomEvent(type);
      if (validateEvent(e)) continue;               // the worker refuses it before any reducer
      const before = JSON.stringify(chain);
      let r;
      try { r = apply(chain, e); } catch (err) { assert.fail(`${type} threw on ${JSON.stringify(e.entity)} ${JSON.stringify(e.payload)}: ${err.message}`); }
      if (r) { refused++; assert.equal(JSON.stringify(chain), before, `${type} refused (${r.code}: ${r.message}) but changed the state; payload ${JSON.stringify(e.payload)}`); }
      else accepted++;
      if (i % 50 === 49) chain = structuredClone(base);
    }
  }
  assert.ok(refused > 1000 && accepted > 1000, `exercised both paths (${refused} refused, ${accepted} accepted)`);
});
