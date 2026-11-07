// Visual Guide audit: every chapter of the in-app guide (Handbook) at 1920 and on a phone,
// and the real screens of the same tasks, on the dev stack with a seeded store.
import { launch, dir, API, WEB, QUIET } from './lib.mjs';
import { ulid } from '../../shared/ulid.js';
import { storeDay, addDays, DEFAULT_TZ } from '../../shared/time.js';
const D = dir('shots');
const call = async (method, path, body, token) => { const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const tok = (await call('POST', '/v1/auth/signin', { store: '1241', managerCode: 'MGR-CODE', device: 'seed-ga' })).body.token;
const T = storeDay(new Date(), DEFAULT_TZ), dmy = d => d.split('-').reverse().join('/');
const KC = [['43602218', '047'], ['43307685', '024'], ['42977636', '022'], ['43302210', '038'], ['42977641', '001'], ['43111111', '090'], ['43222222', '054'], ['43333333', '006'], ['43444444', '085'], ['43555555', '029']];
let seq = 0;
const items = (n, shift) => Array.from({ length: n }, (_, i) => { const [k, dept] = KC[(i + shift) % KC.length]; return { k, q: 6 + ((i * 7 + shift) % 30), dept, c: 1 + (i % 3) }; });
const man = (manNo, despatch, n, shift) => ({ v: 1, kind: 'report', manNo, storeNo: '1241', despatch: dmy(despatch), dcNo: '4101533', filename: manNo + '.xls', consols: Array.from({ length: n }, (_, i) => { const id = String(601900000 + (seq++)); const it = items(3 + (i % 4), shift + i); return { id, cons: '093008012' + id, cartons: it.reduce((a, x) => a + x.c, 0), dept: it[0].dept, mix: [], items: it }; }) });
for (const [no, dd, n, sh] of [['7040101', -3, 9, 0], ['7040102', -2, 6, 2], ['7040103', -1, 12, 4], ['7040104', 0, 8, 6], ['7040105', 0, 10, 1]]) await call('POST', '/v1/store/1241/manifest', man(no, addDays(T, dd), n, sh), tok);
const ev = (area, type, entity, payload) => ({ id: ulid(), store: '1241', area, type, entity, payload, at: new Date().toISOString(), v: 1 });
const TR = `${T}-T1`;
const evs = [
  ev('backdock', 'manifest.day', { manNo: '7040101' }, { day: addDays(T, -2), truck: 1 }), ev('backdock', 'manifest.day', { manNo: '7040102' }, { day: addDays(T, -1), truck: 1 }),
  ev('backdock', 'plan.set', { date: T, slot: 2 }, { eta: '13:30', manifest: { manNo: '7040105', ref: true, ids: [], n: 10, cartons: 41, keycodes: 9, units: 420 } }),
  ev('backdock', 'truck.create', { truck: TR }, { landedAt: new Date(Date.now() - 3 * 3600e3).toISOString() }), ev('backdock', 'truck.setLive', { truck: TR }, {}),
  ev('backdock', 'truck.team.set', { truck: TR }, { team: [{ pid: 'D4' }, { pid: 'D7' }, { pid: 'D9' }] }),
  ...['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3'].map((bay, i) => ev('backdock', 'pallet.land', { truck: TR, bay }, { ptype: i % 3 ? 'chep' : 'loscam', cartons: 12 + i * 3 })),
  ev('floor', 'equip.add', { equip: 'q1' }, { code: 'LAD-02', kind: 'ladder', name: 'Step ladder, 3 step', every: 3, last: addDays(T, -100), loc: 'Floor, aisle 8' }),
  ev('floor', 'equip.add', { equip: 'q2' }, { code: 'PJ-01', kind: 'pj', name: 'Pallet jack', every: 6, last: addDays(T, -20), loc: 'Back dock' }),
  ev('floor', 'equip.add', { equip: 'q3' }, { code: 'STK-01', kind: 'stacker', name: 'Walkie stacker', every: 1, last: addDays(T, -25), loc: 'Stockroom' }),
  ev('stockroom', 'cage.create', { cage: 'C-07' }, { ring: 'overstock' }), ev('stockroom', 'cage.scan', { cage: 'C-07' }, { keycode: '43602218', qty: 12 }), ev('stockroom', 'cage.scan', { cage: 'C-07' }, { keycode: '110148905', qty: 6 }),
  ev('stockroom', 'cage.create', { cage: 'C-11' }, { ring: 'new-lines' }), ev('stockroom', 'cage.scan', { cage: 'C-11' }, { keycode: '43307685', qty: 24 }),
  ev('backdock', 'inventory.offsite.add', { pid: '601900003' }, { sent: addDays(T, -5), desc: '43602218 x 12', req: 'Jess', cb: addDays(T, 3) }),
];
const res = (await call('POST', '/v1/store/1241/events', { events: evs }, tok)).body?.results || [];
console.log('seed', res.map((x, i) => x.ok ? '.' : `${evs[i].type}:${x.code || x.message}`).join(' '));
const b = await launch();
const W = ms => new Promise(r => setTimeout(r, ms));
async function open(w, h, phone, as = 'manager') {
  const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
  await c.addInitScript(QUIET);
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(WEB + '/?nosw=1'); await p.waitForSelector('#siForm');
  if (as === 'signin') return { c, p };
  await p.selectOption('#siStore', '1241').catch(() => {}); await p.click('[data-as="manager"]').catch(() => {}); await p.fill('#siCode', 'MGR-CODE');
  await p.click('.si-cta'); await p.waitForSelector('#cover', { state: 'detached', timeout: 20000 }).catch(() => {}); await W(2200);
  if (phone && await p.$('#msheet.open')) { await p.keyboard.press('Escape').catch(() => {}); await W(300); }
  return { c, p };
}
const go = (p, v, arg) => p.evaluate(([v]) => { const x = document.createElement('button'); x.dataset.view = v; x.style.display = 'none'; document.body.appendChild(x); x.click(); x.remove(); }, [v]);
const MODE = process.argv[2] || 'all';
// ── A: the guide on a PC, every chapter in Handbook and one Watch frame ──
if (MODE === 'all' || MODE === 'guide') {
  const { c, p } = await open(1920, 1080, false);
  await go(p, 'help'); await W(2500);
  const ids = await p.evaluate(() => [...document.querySelector('.vg-host').shadowRoot.querySelectorAll('.chap')].map(b => [b.dataset.i, b.querySelector('b').textContent]));
  console.log('chapters', ids.length);
  await p.screenshot({ path: D + 'g-watch-1920.png' });
  await p.locator('.vg-host .modes button[data-mode="read"]').click(); await W(1500);
  for (const [i, t] of ids) {
    await p.locator(`.vg-host .chap[data-i="${i}"]`).click(); await W(2600);
    const el = p.locator('.vg-host .stagebox');
    await el.screenshot({ path: D + `g-book-${String(i).padStart(2, '0')}.png` });
  }
  // Watch, mid-chapter, for the receiving and backfill review chapters.
  await p.locator('.vg-host .modes button[data-mode="watch"]').click(); await W(800);
  for (const [i] of ids.filter(x => /Receiving|Backfill review|Manifests|Equipment/.test(x[1]))) { await p.locator(`.vg-host .chap[data-i="${i}"]`).click(); await W(1200); for (let k = 0; k < 2; k++) { await p.locator('.vg-host [data-c="next"]').click(); await W(2400); } await p.screenshot({ path: D + `g-watch-${String(i).padStart(2, '0')}.png` }); }
  console.log('guide errs', p.errs.join(' | ')); await c.close();
}
// ── B: the guide on a phone ──
if (MODE === 'all' || MODE === 'gphone') {
  const { c, p } = await open(420, 860, true);
  await go(p, 'help'); await W(2500);
  await p.screenshot({ path: D + 'g-phone-help.png' });
  await p.evaluate(() => document.querySelector('.vg-host').scrollIntoView()); await W(600);
  await p.screenshot({ path: D + 'g-phone-stage.png' });
  await p.screenshot({ path: D + 'g-phone-full.png', fullPage: true });
  console.log('gphone errs', p.errs.join(' | ')); await c.close();
}
// ── C: the real screens ──
if (MODE === 'all' || MODE === 'real') {
  { const { c, p } = await open(1920, 1080, false);
    for (const [v, f, extra] of [['dashboard', 'r-pc-dashboard'], ['settings', 'r-pc-settings'], ['equipment', 'r-pc-equipment'], ['bfreview', 'r-pc-bfreview'], ['manifests', 'r-pc-manifests'], ['receiving', 'r-pc-receiving'], ['planner', 'r-pc-planner'], ['map', 'r-pc-map'], ['inputs', 'r-pc-inputs'], ['decant', 'r-pc-decant'], ['stocktake', 'r-pc-stocktake'], ['recalls', 'r-pc-recalls'], ['adjust', 'r-pc-adjust'], ['cages', 'r-pc-cages'], ['resources', 'r-pc-resources'], ['offsite', 'r-pc-offsite'], ['danalytics', 'r-pc-results']]) {
      await go(p, v); await W(2400);
      if (v === 'receiving') { await p.evaluate(TR => document.querySelector(`[data-act="pick"][data-id="${TR}"]`)?.click(), TR); await W(1500); }
      await p.screenshot({ path: D + f + '.png' });
    }
    await p.click('.top-search, #gsearch, [data-shell-act="search"]').catch(() => {}); await p.keyboard.press('Control+k'); await W(500); await p.keyboard.type('LAD'); await W(900); await p.screenshot({ path: D + 'r-pc-search.png' });
    console.log('pc errs', p.errs.join(' | ')); await c.close(); }
  { const { c, p } = await open(420, 860, true, 'signin'); await W(800); await p.screenshot({ path: D + 'r-ph-signin.png' }); await c.close(); }
  { const { c, p } = await open(420, 860, true);
    await p.screenshot({ path: D + 'r-ph-home.png' });
    for (const [v, f] of [['map', 'r-ph-map'], ['refresh', 'r-ph-refresh'], ['labelint', 'r-ph-labels'], ['maintenance', 'r-ph-maint'], ['livepull', 'r-ph-pull'], ['cages', 'r-ph-cages'], ['srhome', 'r-ph-stockroom'], ['daylist', 'r-ph-backfill'], ['receiving', 'r-ph-receive'], ['decant', 'r-ph-decant'], ['equipment', 'r-ph-equipment'], ['settings', 'r-ph-settings']]) {
      await go(p, v); await W(2200);
      if (v === 'receiving' || v === 'decant') { await p.evaluate(TR => document.querySelector(`[data-act="pick"][data-id="${TR}"]`)?.click(), TR); await W(1200); }
      await p.screenshot({ path: D + f + '.png' });
    }
    console.log('phone errs', p.errs.join(' | ')); await c.close(); }
}
await b.close();
