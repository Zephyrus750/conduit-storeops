// The receiving chapter's What ifs, recorded from the real app on the dev stack:
//   node scripts/guide/whatif.mjs labels    a label not on the manifest; a consol already on another pallet
//   node scripts/guide/whatif.mjs rollover  pallets left when a truck closes, carried to the next one
import { launch, dir, WEB } from './lib.mjs';
import fs from 'node:fs';
import { seed, token, call, ev, TR, T, CONSOLS, MAN } from './seed.mjs';
const MODE = process.argv[2];
if (!['labels', 'rollover'].includes(MODE)) throw new Error('Which What ifs? labels or rollover');
const ROOT = dir('wi');
let tok;
if (MODE === 'labels') tok = await seed();
else {
  // Truck 1 has been decanting since the morning: six pallets done, A7 paused, B1 to B3 not started.
  tok = await token();
  console.log('publish', (await call('POST', '/v1/store/1241/manifest', MAN, tok)).status);
  const t0 = Date.now() - 5 * 3600e3, at = m => t0 + m * 60e3;
  const lay = [['A1', 'chep', [0]], ['A2', 'loscam', [1, 2]], ['A3', 'chep', [3]], ['A4', 'chep', [4]], ['A5', 'bulk', [5, 6]], ['A6', 'loscam', [7]], ['A7', 'chep', [8]], ['B1', 'chep', [9]], ['B2', 'loscam', [10]], ['B3', 'chep', [11]]];
  const evs = [ev('backdock', 'truck.create', { truck: TR }, { landedAt: new Date(t0).toISOString() }, t0), ev('backdock', 'truck.setLive', { truck: TR }, {}, t0),
    ev('backdock', 'manifest.attach', { truck: TR }, { manNo: MAN.manNo, consols: CONSOLS }, at(1)), ev('backdock', 'truck.team.set', { truck: TR }, { team: [{ pid: 'D4' }, { pid: 'D7' }, { pid: 'D9' }] }, at(2)),
    ...lay.map(([bay, ptype, ix], i) => ev('backdock', 'pallet.land', { truck: TR, bay }, { ptype, cartons: ix.reduce((n, k) => n + CONSOLS[k].cartons, 0), consolIds: ix.map(k => CONSOLS[k].id) }, at(4 + i * 2))),
    ev('backdock', 'receiving.confirm', { truck: TR }, {}, at(30)), ev('backdock', 'truck.take5', { truck: TR }, { items: ['brief', 'safe', 'equip', 'area', 'goal'] }, at(34))];
  const who = ['D4', 'D7', 'D9'];
  ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].forEach((bay, i) => { const s = 36 + Math.floor(i / 3) * 40 + (i % 3) * 3; evs.push(ev('backdock', 'pallet.start', { truck: TR, bay }, { pid: who[i % 3] }, at(s)), ev('backdock', 'pallet.done', { truck: TR, bay }, {}, at(s + 32))); });
  evs.push(ev('backdock', 'pallet.start', { truck: TR, bay: 'A7' }, { pid: 'D9' }, at(130)), ev('backdock', 'pallet.pause', { truck: TR, bay: 'A7' }, {}, at(144)));
  const r = (await call('POST', '/v1/store/1241/events', { events: evs }, tok)).body?.results || [];
  console.log('seed', r.map((x, i) => x.ok ? '.' : `${evs[i].type}:${x.code || x.message}`).join(' '));
}
const b = await launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await c.addInitScript(() => { try { localStorage.setItem('whatsnew_seen', 'v9.9.9'); localStorage.setItem('walkthrough_seen', JSON.stringify({ floor: 1, stockroom: 1, backdock: 1 })); localStorage.setItem('signin_as', 'team'); } catch {} });
const p = await c.newPage(); const W = ms => p.waitForTimeout(ms); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(WEB + '/?nosw=1'); await p.waitForSelector('#siForm'); await W(500);
await p.selectOption('#siStore', '1241').catch(() => {}); await p.fill('#siCode', '2468'); await p.click('.si-cta');
await p.waitForSelector('#cover', { state: 'detached', timeout: 20000 }).catch(() => {}); await W(2500);
if (!(await p.$('#msheet.open .mv-tile[data-ws="backdock"]'))) { await p.click('#mstrip button[data-view="more"]'); await W(500); await p.click('#msheet [data-shell-act="switch-area"]'); await W(600); }
await p.click('#msheet .mv-tile[data-ws="backdock"]'); await W(1200);
if (await p.$('#unlockForm')) { await p.fill('#unlockForm input[name="code"]', 'DK-CODE'); await p.click('#unlockForm .si-cta'); await W(2500); }
await p.addStyleTag({ content: '*{caret-color:transparent!important}' });
const goView = async v => { await p.evaluate(v => { const x = document.createElement('button'); x.dataset.view = v; document.body.appendChild(x); x.click(); x.remove(); }, v); await W(1600); };
// One What if: its own folder of frames and its own steps.
let D, n, frames, steps;
const begin = async name => { D = ROOT + name + '/'; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D); n = 0; frames = []; steps = []; await snap(); };
const finish = (name, title, specifics) => fs.writeFileSync(D + 'steps.json', JSON.stringify({ name, title, specifics, w: 390, h: 844, steps }, null, 1));
const snap = async (tag = '') => { const f = `f${String(n++).padStart(2, '0')}${tag ? '-' + tag : ''}.png`; await W(250); await p.screenshot({ path: D + f }); frames.push(f); return f; };
const rect = async sel => { const r = await p.locator(sel).first().boundingBox(); return r && { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; };
async function step(cap, read, { tap, type, then, settle = 900, also } = {}) {
  const from = frames[frames.length - 1], at = tap ? await rect(tap) : null, mid = [];
  if (tap) await p.locator(tap).first().click();
  if (type) { const [sel, text] = type; for (let k = 1; k <= text.length; k++) { await p.locator(sel).fill(text.slice(0, k)); if (k === 4) mid.push(await snap('t')); } }
  let at2 = null; if (then) { at2 = await rect(then); await p.locator(then).first().click(); }
  if (also) await also();
  await W(settle); const to = await snap();
  steps.push({ cap, read, from, at, mid, at2, to });
}
const mark = async (sel, attr) => p.evaluate(([sel, attr]) => { const el = [...document.querySelectorAll(sel)].find(x => x.offsetParent); if (el) el.setAttribute(attr, '1'); return !!el; }, [sel, attr]);
const byText = async (re, attr) => p.evaluate(([re, attr]) => { const el = [...document.querySelectorAll('button')].find(x => x.offsetParent && new RegExp(re, 'i').test(x.textContent)); if (el) el.setAttribute(attr, '1'); return el?.textContent.trim().slice(0, 60) || null; }, [re, attr]);

if (MODE === 'labels') {
  await goView('receiving'); await p.evaluate(TR => document.querySelector(`[data-act="pick"][data-id="${TR}"]`)?.click(), TR); await W(900);
  // ── What if 1: a label that is not on the manifest ──
  await begin('offmanifest');
  await step('Tap the bay and scan the pallet’s labels as usual.', 'The land sheet opens for the next pallet, as in the chapter.', { tap: '.bdk-sq[data-ref="A3"]' });
  await step('A label that isn’t on this manifest is held, not lost.', 'It says so straight away and keeps the label on the pallet, marked to flag or ignore. The likely cause is named too: an old label on a reused tub.', { tap: '[data-act="typing"][data-f="lscan"]', type: ['[data-field="lscan"]', '601999917'], then: '[data-act="lscan"]', settle: 700 });
  await step('The pallet’s other labels go on as normal.', 'One odd label never stops the pallet: its matching consols still fill in their cartons.', { type: ['[data-field="lscan"]', CONSOLS[3].id], then: '[data-act="lscan"]' });
  await step('Land it: the bay is marked so everyone sees it.', 'Every phone and dock screen shows the pallet has a label to look at.', { tap: '[data-act="ptype"][data-pt="chep"]', also: async () => { await p.locator('[data-act="land"]').first().click(); }, settle: 1500 });
  await step('Open the pallet to decide: Add & flag, or Ignore.', 'The held label waits on the pallet until someone decides. Nothing is added to the count until then.', { tap: '.bdk-sq[data-ref="A3"]', settle: 1000 });
  await step('Add & flag keeps it, flagged for the receiving audit.', 'It stays on the pallet and shows in the truck’s receiving audit. Ignore takes it off the pallet instead.', { tap: '[data-act="pend-add"]', settle: 900 });
  await p.evaluate(() => document.querySelector('.dk-pop .sht-x, .is-sheet .sht-x, [data-act="closepal"]')?.click()); await W(700);
  await snap();
  await step('Finish receiving counts it before the layout is confirmed.', 'The Finish receiving sheet lists any label not on the manifest and says something is off, so it is checked before the truck moves on.', { tap: '.dk-strip .dk-go', settle: 1200 });
  finish('offmanifest', 'What if a label isn’t on the manifest?', [
    'Receiving never stops for it: the label is held on its pallet, and the pallet still lands with its other labels.',
    'The pallet’s square shows it on every phone and dock screen until someone looks at it.',
    'Add & flag keeps the label on the pallet and puts it in the truck’s receiving audit. Ignore takes it off.',
    'Finish receiving counts labels not on the manifest and says something is off before the layout is confirmed.',
    'The usual cause, named on screen: an old label left on a reused tub.',
  ]);
  // Close Finish receiving without confirming.
  if (await byText('^\\s*Back\\s*$', 'data-g-back')) await p.click('[data-g-back="1"]'); await W(700);
  // ── What if 2: a consol already on another pallet ──
  await begin('taken');
  await step('Scan a label that’s already on another pallet.', 'Here the label for consol 601930107 is scanned onto A4, but it already landed on A2.', { tap: '.bdk-sq[data-ref="A4"]', also: async () => { await p.locator('[data-act="typing"][data-f="lscan"]').first().click(); await W(300); for (let k = 1; k <= CONSOLS[1].id.length; k++) await p.locator('[data-field="lscan"]').fill(CONSOLS[1].id.slice(0, k)); await p.locator('[data-act="lscan"]').first().click(); }, settle: 900 });
  await mark('.bdk-vrow.bad .bdk-vx', 'data-g-x');
  await step('Take the wrong scan off with ×.', 'If A2 was the mistake, open A2 and take it off there, then scan it here. A wrong scan never blocks the right pallet for long.', { tap: '[data-g-x="1"]', settle: 800 });
  finish('taken', 'What if a consol is already on another pallet?', [
    'Each consolidation can be on one pallet only. Scanning it again says which pallet has it.',
    'The pallet it landed on first keeps it: nothing is moved or lost by a stray scan.',
    'Any scan can come off again with its ×, on the land sheet or on a landed pallet, so a wrong one is quick to put right.',
  ]);
} else {
  // ── What if 3: pallets left when the truck closes ──
  await goView('decant'); await p.evaluate(TR => document.querySelector(`[data-act="pick"][data-id="${TR}"]`)?.click(), TR); await W(1000);
  await begin('rollover');
  await step('The shift is ending and four pallets aren’t done.', 'Six of Truck 1’s ten pallets are decanted. A7 was started and paused; B1 to B3 haven’t been started.', { tap: '[data-act="panel"]', settle: 900 });
  const fin = await mark('.dk-pan [data-act="finalise"]', 'data-g-fin');
  console.log('finalise tool', fin);
  await step('Close the truck: it shows what is still on the dock.', 'Closing writes the decant to history and updates the rates. It lists the pallets not decanted, with their cartons.', { tap: '[data-g-fin="1"]', settle: 1200 });
  const keep = await byText('Keep \\d+ as rollover', 'data-g-keep'); console.log('keep button', keep);
  await step('Keep them as a rollover: they wait on their bays.', 'Truck 1 closes with only its own work on its record. Held for the next truck lists each pallet with its type, cartons and where it got to: A7 paused, the rest waiting.', { tap: '[data-g-keep="1"]', settle: 1800 });
  const nt = await mark('.dk-strip [data-act="newtruck"], [data-act="newtruck"]', 'data-g-nt'); console.log('new truck', nt);
  await step('When the next truck lands, New truck offers to keep them.', 'Keep them on Truck 2 is already chosen. Start fresh is there for a dock that was cleared by hand.', { tap: '[data-g-nt="1"]', settle: 1200 });
  const go = await byText('^\\s*Create & go live', 'data-g-go'); console.log('create button', go);
  await step('Truck 2 starts with them on their bays.', 'Its own pallets land around them. The carried pallets are marked, so nobody counts them as part of Truck 2\u2019s delivery.', { tap: '[data-g-go="1"]', settle: 2200 });
  await step('A carried pallet keeps everything it had.', 'A7 still has its label and cartons, its type and its estimated time, and it is marked carryover.', { tap: '.bdk-sq[data-ref="A7"]', settle: 1100 });
  await p.evaluate(() => document.querySelector('.dk-pop .sht-x, .is-sheet .sht-x, [data-act="closepal"]')?.click()); await W(600);
  await snap();
  await step('Then Decant: Truck 2 gets its team and Take 5, and A7 picks up from 14 minutes.', 'Carried pallets wait for Truck 2\u2019s own team and Take 5, like any truck. Then A7 resumes with the 14 minutes already worked on it.', { tap: '#mstrip button[data-view="decant"], [data-view="decant"]', settle: 1800 });
  finish('rollover', 'What if pallets are left over from the last truck?', [
    'Closing a truck with pallets not decanted asks what to do with them: keep them as rollover for the next truck, or clear the dock.',
    'The truck that closes keeps only its own work: its record, rates and manifest audit still add up.',
    'Rolled-over pallets stay on their bays with everything on them: labels and consols, type, cartons, estimated time and the time already worked on it.',
    'Each is marked carryover with the truck it first landed on, even if it rolls over again.',
    'Between trucks they show as Held for the next truck. The next truck takes them unless its New truck sheet says otherwise.',
    'One set can be held at a time. Reopening the closed truck brings its pallets back onto it.',
  ]);
}
console.log('errs', errs.join(' | ') || 'none');
await b.close();
