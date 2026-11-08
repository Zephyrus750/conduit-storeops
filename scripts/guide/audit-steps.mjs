// Every step of every guide chapter as it ends in Watch, at 1920 (the device at its own size).
import { launch, dir, WEB, QUIET } from './lib.mjs';
const D = dir('steps');
import fs from 'node:fs';
const b = await launch();
const W = ms => new Promise(r => setTimeout(r, ms));
const c = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await c.addInitScript(QUIET);
const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(WEB + '/?nosw=1'); await p.waitForSelector('#siForm');
await p.selectOption('#siStore', '1241').catch(() => {}); await p.click('[data-as="manager"]').catch(() => {}); await p.fill('#siCode', 'MGR-CODE');
await p.click('.si-cta'); await p.waitForSelector('#cover', { state: 'detached', timeout: 20000 }).catch(() => {}); await W(2000);
await p.evaluate(() => { const x = document.createElement('button'); x.dataset.view = 'help'; document.body.appendChild(x); x.click(); x.remove(); }); await W(2500);
const chaps = await p.evaluate(() => [...document.querySelector('.vg-host').shadowRoot.querySelectorAll('.chap')].map(b => ({ i: b.dataset.i, t: b.querySelector('b').textContent, n: Number((b.querySelector('small').textContent.match(/(\d+) step/) || [])[1]) })));
const out = [];
for (const ch of chaps) {
  await p.locator(`.vg-host .chap[data-i="${ch.i}"]`).click(); await W(900);
  const id = String(ch.i).padStart(2, '0');
  for (let k = 0; k < ch.n; k++) {
    await p.locator(`.vg-host .dots button[data-step="${k}"]`).click();
    await W(4200);   // let the step play to its end
    const cap = await p.evaluate(() => document.querySelector('.vg-host').shadowRoot.querySelector('.cap-t')?.textContent);
    await p.locator('.vg-host .theatre').screenshot({ path: `${D}s-${id}-${k + 1}.png` });
    out.push({ ch: ch.t, i: ch.i, k: k + 1, cap });
  }
}
fs.writeFileSync(D + 'steps.json', JSON.stringify(out, null, 1));
console.log(chaps.map(c => `${c.i} ${c.t} (${c.n})`).join('\n')); console.log('errs', errs.join(' | '));
await b.close();
