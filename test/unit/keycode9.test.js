// Nine-digit keycodes (new products since late 2026, e.g. 110148905): every
// place a keycode is checked, read or looked up takes them, beside the 7- and
// 8-digit ones, and the back dock still reads 9 digits as a pallet label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isKeycode, isScanKeycode } from '../../shared/keycode.js';
import { phoneCode, disputes, parseReportByLocation, parseKeycodes } from '../../shared/backfill.js';
import { parseReport } from '../../shared/stockintel.js';
import { parseRow, ingest, filtered, extractCodes } from '../../shared/screenscan.js';
import { codesIn } from '../../shared/livescan.js';
import { findRecords } from '../../shared/finder.js';
import { initialState, apply } from '../../shared/reducers.js';
import { CATALOGUE } from '../../shared/catalogue.js';
import { ulid } from '../../shared/ulid.js';

const NINE = ['110148905', '110149784', '110232555', '110176759', '110182806', '110014149'];
const EIGHT = ['43740093', '43740116', '43740161', '43772759', '43577934', '43676323', '43519651', '43467914', '43752072'];

test('one rule: a keycode is 6 to 9 digits; a scan takes 7 to 9; 10+ and 13 are not keycodes', () => {
  for (const k of [...NINE, ...EIGHT]) assert.ok(isKeycode(k) && isScanKeycode(k), k);
  assert.ok(isKeycode('123456') && !isScanKeycode('123456'));
  for (const k of ['12345', '1101489050', '9341234567893', '11014890A']) assert.ok(!isKeycode(k), k);
});

test('backfill phone: a 9-digit keycode is taken; 10 digits is refused with the rule', () => {
  assert.deepEqual(phoneCode('110148905'), { code: '110148905' });
  assert.deepEqual(phoneCode('43740093'), { code: '43740093' });
  assert.match(phoneCode('1101489050').why, /a keycode is 7 to 9/);
  assert.deepEqual(parseKeycodes('110148905, 43740093'), ['110148905', '43740093']);
});

test('disputes: two 9-digit codes one digit apart; codes of different lengths never pair', () => {
  assert.deepEqual(disputes(['110148905', '110148906', '43740093']), { 110148905: ['110148906'], 110148906: ['110148905'] });
  assert.deepEqual(disputes(['11014890', '110148905']), {}, 'an 8 and a 9 are not a misread pair');
});

test('SIM reports: a 9-digit keycode row lands in its location (whole report and SOH report)', () => {
  const byLoc = parseReportByLocation('7012 110148905 2026 AFL FOOTY STARS STARTER PACK PINK 0 9.00 12\n7012 43740093 AFL FOOTY STARS ALBUM 0 15.00 4');
  assert.deepEqual(byLoc['7012'], ['110148905', '43740093']);
  const r = parseReport('7012 110232555 TOPPS 2026 STADIUM CLUB UFC HOBBY BOX 0 199.00 3');
  const it = Object.values(r.items)[0];
  assert.deepEqual([it.kc, it.loc, it.soh, it.price], ['110232555', '7012', 3, 199]);
});

test('screen scan: a 9-digit code after a location is read; APN votes come only from 10+ digits', () => {
  assert.deepEqual(parseRow('7012 110148905'), { codes: ['110148905'], locs: ['7012'] });
  assert.deepEqual(parseRow('110 148 905').codes, ['110148905'], 'short pieces glue back to 9');
  assert.deepEqual(parseRow('5 12345678').codes, [], 'a quantity is not glued onto a code');
  const t = { codes: {}, locs: {} }; ingest(t, ['7012 110148905', '7012 43740093', '7012 110148905']);
  assert.deepEqual(filtered(t), ['110148905', '43740093']);
  assert.deepEqual(extractCodes('Card album 110149784\n43740116 cards').codes, ['110149784', '43740116']);
});

test('live reader: a 9-digit code as one word, split in two, or as an 8-digit word and its last digit', () => {
  const w = (text, x0, y0 = 0, conf = 90) => ({ text, confidence: conf, bbox: { x0, y0, x1: x0 + text.length * 10, y1: y0 + 20 } });
  assert.deepEqual(codesIn([w('110148905', 0)], '').map(x => x.code), ['110148905']);
  assert.deepEqual(codesIn([w('1101', 0), w('48905', 44)], '').map(x => x.code), ['110148905']);
  assert.deepEqual(codesIn([w('11014890', 0), w('5', 84)], '').map(x => x.code), ['110148905'], 'no phantom 8-digit code');
  assert.deepEqual(codesIn([], 'take 110148905 2').map(x => x.code), ['110148905']);
  assert.deepEqual(codesIn([w('43740093', 0)], '').map(x => x.code), ['43740093'], '8 digits as before');
});

test('search: 9 digits finds a keycode in a cage and a pallet label on a truck', () => {
  const state = {
    cages: { BSN1: { ring: 'overstock', items: { 110148905: 4 }, status: 'open' } },
    dock: { trucks: { '2026-11-06-T1': { status: 'live', manifest: { manNo: '7169169', consols: [{ id: '207000001', cons: '000930000207000001', cartons: 20 }] }, pallets: {} } } },
  };
  assert.deepEqual(findRecords(state, '110148905').cages.map(c => [c.id, c.has]), [['BSN1', 4]]);
  assert.deepEqual(findRecords(state, '207000001').consols.map(c => c.id), ['207000001'], 'a 9-digit pallet label still finds its consolidation');
});

test('events: a 9-digit keycode is taken by recalls, cage and live pull links and SOH ticks', () => {
  const ev = (type, entity, payload = {}) => ({ id: ulid(), store: '1241', area: CATALOGUE[type].area, type, entity, payload, actor: { role: 'manager', device: 'M1', owner: false }, at: '2026-11-06T09:00:00+08:00', v: 1 });
  const s = initialState();
  assert.equal(apply(s, ev('recall.add', { recall: 'RC9' }, { kind: 'withdrawal', title: 'Starter pack', kcs: ['110148905', '43740093'], apns: [], ref: '', action: '' })), null);
  assert.deepEqual(s.recalls.items.RC9.kcs, ['110148905', '43740093']);
  assert.equal(apply(s, ev('cage.pair', { apn: '9300633603120' }, { keycode: '110148905' })), null);
  assert.equal(apply(s, ev('pull.pair', { apn: '9300633603120' }, { keycode: '110232555' }))?.code ?? null, null);
  assert.equal(apply(s, ev('recall.add', { recall: 'RC10' }, { kind: 'recall', title: 'x', kcs: ['1101489050'], apns: [], ref: '', action: '' }))?.code, 'invalid_event', 'ten digits is not a keycode');
});
