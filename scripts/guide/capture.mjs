// The sample chapter "Receive a truck on the phone", captured from the real app on the dev stack:
// a crew phone at 390×844, every frame at 2× (780×1688), the spot each step taps, the caption.
import { launch, dir, OUT, WEB } from './lib.mjs';
import fs from 'node:fs';
import { seed, landRest, TR, CONSOLS } from './seed.mjs';
// The camera is a video of two labels on a wrapped pallet: bash scripts/guide/cam/make.sh.
const CAM = OUT + '/cam/cam.mjpeg';
if (!fs.existsSync(CAM)) throw new Error('No camera video: run bash scripts/guide/cam/make.sh first.');
const D = dir('main', { fresh: true });
const tok = await seed();
const b = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + CAM]);
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['camera'] });
await c.addInitScript(() => { try { localStorage.setItem('whatsnew_seen', 'v9.9.9'); localStorage.setItem('walkthrough_seen', JSON.stringify({ floor: 1, stockroom: 1, backdock: 1 })); localStorage.setItem('signin_as', 'team'); } catch {} });
const p = await c.newPage(); const W = ms => p.waitForTimeout(ms); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(WEB + '/?nosw=1'); await p.waitForSelector('#siForm'); await W(500);
await p.selectOption('#siStore', '1241').catch(() => {}); await p.fill('#siCode', '2468'); await p.click('.si-cta');
await p.waitForSelector('#cover', { state: 'detached', timeout: 20000 }).catch(() => {}); await W(2500);
if (!(await p.$('#msheet.open .mv-tile[data-ws="backdock"]'))) { await p.click('#mstrip button[data-view="more"]'); await W(500); await p.click('#msheet [data-shell-act="switch-area"]'); await W(600); }
await p.click('#msheet .mv-tile[data-ws="backdock"]'); await W(1200);
if (await p.$('#unlockForm')) { await p.fill('#unlockForm input[name="code"]', 'DK-CODE'); await p.click('#unlockForm .si-cta'); await W(2500); }
// No caret in the stills: a blinking caret lands on or off at random.
await p.addStyleTag({ content: '*{caret-color:transparent!important}' });
const frames = [], steps = [];
let n = 0;
const snap = async (tag = '') => { const f = `f${String(n++).padStart(2, '0')}${tag ? '-' + tag : ''}.png`; await W(250); await p.screenshot({ path: D + f }); frames.push(f); return f; };
const rect = async sel => { const r = await p.locator(sel).first().boundingBox(); return r && { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; };
// A step: the frame it starts on, where it taps (if it does), the frames it moves through, the frame it ends on.
async function step(cap, read, { tap, type, then, settle = 900, also, frames: more, live = false } = {}) {
  const from = frames[frames.length - 1];
  const at = tap ? await rect(tap) : null, mid = [];
  if (tap) { await p.locator(tap).first().click(); }
  if (more) mid.push(...await more());
  if (type) { const [sel, text] = type; for (let k = 1; k <= text.length; k++) { await p.locator(sel).fill(text.slice(0, k)); if (k === 3 || k === 6) mid.push(await snap('t')); } }
  let at2 = null;
  if (then) { at2 = await rect(then); await p.locator(then).first().click(); }
  if (also) await also();
  await W(settle);
  const to = await snap();
  steps.push({ cap, read, from, at, mid, at2, to, live });
}
// ── the chapter ──
await p.evaluate(() => { const x = document.createElement('button'); x.dataset.view = 'bdhome'; document.body.appendChild(x); x.click(); x.remove(); }); await W(1500);
await snap();
await step('Back dock shows the truck that landed: Land a pallet opens Receive.', 'Back dock opens on the dock today: Truck 1 is receiving, with manifest 7040301 and its 12 consols. Land a pallet takes you to Receive.', { tap: '[data-go="receiving"]', settle: 1400 });
await step('Tap the bay where the pallet stands.', 'Each square is a bay on the dock. Blue and red squares already hold a pallet; an empty one opens the land sheet for the next pallet.', { tap: '.bdk-sq[data-ref="A3"]' });
const tally = n => p.waitForFunction(n => document.querySelector('#scanner .sc-tally b')?.textContent === String(n), n, { timeout: 15000 });
await step('Scan the pallet\u2019s labels with the camera.', 'Scan labels opens the camera. It reads the consolidation barcode on each label and keeps a tally, so one pass takes every label on the pallet.', { tap: 'button.bdk-cam[data-camera="lscan"]', frames: async () => { await W(300); return [await snap('c')]; }, also: async () => { await tally(1); }, settle: 500 });
await step('Move to the next label: each one it reads adds to the tally.', 'A beep and a buzz confirm each good read, and the tally shows the last number it read.', { frames: async () => {
  // Frames while the camera moves across, until the second label reads; keep up to three, the last ones (the pan).
  const got = []; for (let k = 0; k < 14 && !(await p.evaluate(() => document.querySelector('#scanner .sc-tally b')?.textContent === '2')); k++) { await W(150); const f = `f${String(n).padStart(2, '0')}-p${String(k).padStart(2, '0')}.png`; await p.screenshot({ path: D + f }); got.push(f); }
  const keep = got.slice(-3); frames.push(...keep); n++; return keep; }, also: async () => { await tally(2); }, settle: 700 });
await step('Close the camera: both labels are on the pallet, cartons filled in.', 'Each consol on the manifest gets a tick with its cartons and department. A label that is not on the manifest, or already on another pallet, says so here.', { tap: '#scanner [data-sc="close"]', settle: 1100 });
await step('A label too torn to scan? Type its number instead.', 'Type it shows a field for the label number. It is checked against the manifest just like a scan.', { tap: '[data-act="typing"][data-f="lscan"]', type: ['[data-field="lscan"]', CONSOLS[5].id], then: '[data-act="lscan"]' });
await step('Pick the pallet type.', 'Chep tubs, Load pallet or Bulk, in the same colours as the dock grid. Cartons and the estimated decant time come from the labels.', { tap: '[data-act="ptype"][data-pt="chep"]' });
await step('Land it: the bay fills and the count moves on.', 'The pallet is on the dock for everyone: every phone and the dock screens show A3 straight away, and the strip counts the consols matched.', { tap: '[data-act="land"]', settle: 1500 });
await step('The other dock phones land theirs: it all updates live.', 'Nobody refreshes anything. Each phone landing a pallet sends one event, and every device on the dock shows it within a second or two.', { also: async () => { await landRest(tok); }, settle: 4500, live: true });
await step('Every pallet down: Finish receiving.', 'The strip has the next step. Finish receiving counts what landed, what is still to land and any label that is not on the manifest, before the layout is confirmed.', { tap: '.dk-strip .dk-go', settle: 1200 });
const confirm = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent && /^\s*Confirm layout/i.test(x.textContent)); if (b) { b.setAttribute('data-guide-hit', '1'); return b.className + ' · ' + b.textContent.trim(); } return null; });
console.log('confirm button', confirm);
if (confirm) await step('Something off? It says so. Confirm the layout and the truck moves to Received.', 'One label here is not on the manifest: it can be checked now, or confirmed and sorted out in the audit. Pallets can still be changed afterwards.', { tap: '[data-guide-hit="1"]', settle: 1500 });
await step('Decant: Take 5 with the team, then Start decant.', 'Five checks before anyone cuts a carton: briefed, safety, equipment, area and the goal. Start decant opens once all five are ticked.', { tap: '#mstrip button[data-view="decant"], .mv-tabs [data-view="decant"], [data-view="decant"]', settle: 4200 });
fs.writeFileSync(D + 'steps.json', JSON.stringify({ device: 'phone', w: 390, h: 844, steps }, null, 1));
console.log('frames', frames.length, 'steps', steps.length, 'errs', errs.join(' | '));
await b.close();
