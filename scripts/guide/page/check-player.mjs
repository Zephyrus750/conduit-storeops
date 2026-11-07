// The review page at 1440, on a phone and in dark mode: no errors, Play runs,
// Try it rings step 1's spot and a tap there moves on. Screenshots in out/page/.
import { launch, dir } from '../lib.mjs';
const G = dir('page');
const b = await launch();
for (const [w, h, name, dark] of [[1440, 900, 'd', false], [420, 860, 'm', false], [1440, 900, 'dk', true]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' }); const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + G + 'check.html'); await p.waitForTimeout(1500);
  await p.screenshot({ path: G + `c-${name}-top.png` });
  if (name !== 'dk') {
    await p.locator('#player').scrollIntoViewIfNeeded(); await p.click('#play'); await p.waitForTimeout(5200);
    await p.locator('#player').screenshot({ path: G + `c-${name}-play.png` });
    const st = await p.evaluate(() => ({ n: document.getElementById('capn').textContent, sw: document.documentElement.scrollWidth, vw: innerWidth }));
    console.log(name, JSON.stringify(st));
    // Try it: the ring appears on step 1's spot; a click there moves on.
    await p.click('.modes button[data-mode="try"]'); await p.waitForTimeout(900);
    const ring = await p.evaluate(() => { const t = document.getElementById('target'); return !t.hidden && t.getBoundingClientRect().width > 10; });
    const r = await p.locator('#target').boundingBox(); if (r) await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(1800);
    console.log(name, 'try ring', ring, 'after tap', await p.evaluate(() => document.getElementById('capn').textContent));
  }
  console.log(name, 'errors', errs.join(' | ') || 'none');
  await c.close();
}
await b.close();
