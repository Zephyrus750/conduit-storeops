import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, sohBand, isoWeek, historyOf, classify, checksFor, splitWalkers } from '../../shared/stockintel.js';

const REPORT = `STORE : 1241 Busselton                       Page 1
LOCATION KEYCODE APN DESCRIPTION COLOUR STATUS PRICE SOH
-----------------------------------------------------------
7001 43307685 9341234567890 KIDS TEE BLUE 0 8.00 12
     KMART 9341234567891
7001 4330B2I0 MUG SET WHITE 0 12,50 -2
Location : 7002
42977636 CANDLE JAR 0 5.00 O
garbage line with no item`;

test('report paste: rows, OCR fixes, header locations, continuation APNs and brand, merge by keycode', () => {
  const r = parseReport(REPORT);
  assert.deepEqual(Object.keys(r.items).sort(), ['42977636', '43307685', '43308210']);
  const tee = r.items['43307685'];
  assert.deepEqual([tee.loc, tee.soh, tee.price], ['7001', 12, 8]); assert.deepEqual(tee.apns, ['9341234567890', '9341234567891']); assert.equal(tee.brand, 'KMART');
  assert.deepEqual([r.items['43308210'].soh, r.items['43308210'].price], [-2, 12.5], 'negative SOH kept, comma price');
  assert.deepEqual([r.items['42977636'].loc, r.items['42977636'].soh], ['7002', 0], 'header location, O read as 0');
  assert.deepEqual(parseReport('43117659 RUG GREY 29.00 4').items, {}, 'no location: rejected');
  assert.deepEqual(parseReport('7003 43117659 RUG GREY 29.00').items, {}, 'no SOH: rejected');
  const again = parseReport('7009 43307685 8.00 15', r.items);
  assert.deepEqual([again.items['43307685'].loc, again.items['43307685'].soh, again.items['43307685'].apns.length], ['7009', 15, 2], 'a later paste updates and keeps APNs');
});

test('bands and ISO weeks', () => {
  assert.deepEqual([sohBand(0, 6), sohBand(-1), sohBand(11, 6), sohBand(12, 6), sohBand(3)], ['r', 'r', 'a', 'g', 'g']);
  assert.equal(isoWeek('2026-10-05'), '2026-W41'); assert.equal(isoWeek('2027-01-01'), '2026-W53'); assert.equal(isoWeek('2026-01-01'), '2026-W01');
});

const snaps = [['2026-09-14', 5, 0, 30, 12, 7], ['2026-09-21', 5, 0, 30, 12, 6], ['2026-09-28', 5, 0, 30, 12, 4], ['2026-10-05', 5, 0, 30, 12, 2]]
  .map(([date, ...soh]) => ({ date, rows: soh.map((v, i) => ({ kc: String(4300000 + i), loc: String(7001 + (i % 3)), soh: v })) }));
snaps[0].rows.push({ kc: '4399999', loc: '7001', soh: 3 });
const profiles = { 4300000: { ctn: 6, arrivals: [{ date: '2026-09-25' }] }, 4300001: { ctn: 6, last_arrival: { date: '2026-09-22' } }, 4300002: { ctn: 6 }, 4300003: { ctn: 7, pack_change: { since_trucks: 2 } } };

test('classes in order: NEW, GHOST, STUCK, DEEP, FROZEN, MOVING; RECOUNT on a young pack change', () => {
  const h = historyOf(snaps), c = kc => classify(h[kc], profiles[kc]);
  assert.equal(c('4300000').cls, 'stuck', 'flat since an arrival');
  assert.equal(c('4300001').cls, 'ghost', 'zero with an arrival in the window');
  assert.equal(c('4300002').cls, 'deep', 'flat, no arrival, at least two cartons');
  assert.deepEqual([c('4300003').cls, c('4300003').recount, c('4300003').flat], ['frozen', true, 4]);
  assert.equal(c('4300004').cls, 'moving');
  assert.equal(classify(h['4399999'], null).cls, 'new');
});

test('checks by location and the walker split: contiguous, balanced by 1 + checks', () => {
  const checks = checksFor(historyOf(snaps), profiles);
  assert.deepEqual(Object.fromEntries(Object.entries(checks).map(([l, xs]) => [l, xs.map(x => x.cls)])), { 7001: ['stuck', 'frozen'], 7002: ['ghost'], 7003: ['deep'] });
  assert.deepEqual(splitWalkers(['7001', '7002', '7003'], checks, 2), [['7001'], ['7002', '7003']]);
  const locs = ['1', '2', '3', '4', '5', '6'], heavy = { 1: [1, 2, 3, 4, 5] };
  assert.deepEqual(splitWalkers(locs, heavy, 2), [['1'], ['2', '3', '4', '5', '6']]);
  assert.deepEqual(splitWalkers(locs, {}, 3), [['1', '2'], ['3', '4'], ['5', '6']]);
  assert.deepEqual(splitWalkers(['1', '2'], {}, 4), [['1'], ['2']], 'never more walkers than locations');
  assert.deepEqual(splitWalkers([], {}, 2), []);
});

test('scan.preset: a region per kind and screen size, inside the screen; remove clears it', async () => {
  const { initialState, apply } = await import('../../shared/reducers.js');
  const s = initialState(), ev = (entity, payload) => ({ type: 'scan.preset', entity, payload, at: '2026-10-05T01:00:00Z', actor: { device: 'desk' } });
  assert.equal(apply(s, ev({ size: '1920x1080' }, { kind: 'codes', x: 0.1, y: 0.2, w: 0.3, h: 0.6 })), null);
  assert.deepEqual(s.scanPresets['codes:1920x1080'], { x: 0.1, y: 0.2, w: 0.3, h: 0.6, at: '2026-10-05T01:00:00Z', by: 'desk' });
  assert.equal(apply(s, ev({ size: '1920x1080' }, { kind: 'rows', x: 0.8, y: 0, w: 0.3, h: 1 }))?.code, 'invalid_event', 'off the right edge');
  assert.equal(apply(s, ev({ size: 'big' }, { x: 0, y: 0, w: 1, h: 1 }))?.code, 'invalid_event');
  apply(s, ev({ size: '1920x1080' }, { kind: 'codes', remove: true })); assert.deepEqual(s.scanPresets, {});
});
