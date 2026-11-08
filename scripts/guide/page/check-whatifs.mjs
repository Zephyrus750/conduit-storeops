// The What ifs: a card opens its set (bar, title, What to know, handbook strip),
// Play runs it, and Back returns to the chapter. At 1440 and on a phone.
import { launch, dir } from '../lib.mjs';
const G = dir('page');
const b = await launch();
for (const [w, h, name] of [[1440, 900, 'd'], [420, 860, 'm']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + G + 'check.html'); await p.waitForTimeout(800);
  await p.click('.wi-card[data-set="rollover"]'); await p.waitForTimeout(600);
  const st = await p.evaluate(() => ({ bar: !document.getElementById('wibar').hidden, title: document.getElementById('wititle').textContent, know: document.querySelectorAll('#knowlist li').length, n: document.getElementById('capn').textContent, book: document.querySelectorAll('#book img').length, sw: document.documentElement.scrollWidth }));
  console.log(name, JSON.stringify(st));
  await p.click('#play'); await p.waitForTimeout(9000);
  console.log(name, 'after play', await p.evaluate(() => document.getElementById('capn').textContent));
  await p.locator('#player').screenshot({ path: G + `c-wi-${name}.png` });
  await p.click('#wiback'); await p.waitForTimeout(400);
  console.log(name, 'back', await p.evaluate(() => [document.getElementById('capn').textContent, document.getElementById('wibar').hidden]));
  await p.locator('.wis').screenshot({ path: G + `c-wis-${name}.png` });
  console.log(name, 'errors', errs.join(' | ') || 'none'); await p.close();
}
await b.close();
