// Plays the whole chapter (a minute) and lists every step it showed, with LIVE
// where the live badge was up.
import { launch, dir } from '../lib.mjs';
const G = dir('page');
const b = await launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + G + 'check.html'); await p.waitForTimeout(800);
await p.locator('#player').scrollIntoViewIfNeeded(); await p.click('#play');
const seen = new Set(); const t0 = Date.now();
while (Date.now() - t0 < 60000) { seen.add(await p.evaluate(() => document.getElementById('capn').textContent + (document.getElementById('live').hidden ? '' : ' LIVE'))); await p.waitForTimeout(500); }
console.log([...seen].join(', '));
await p.locator('#player').screenshot({ path: G + 'c-scan.png' });
console.log('errors', errs.join(' | ') || 'none'); await b.close();
