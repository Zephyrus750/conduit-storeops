import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeSvg } from '../../shared/svgsafe.js';

test('map svg: script, foreignObject, handlers, off-page links and style imports are stripped', () => {
  const { svg, stripped } = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:red}@import url(x.css);.b{background:url(http://e/x)}</style>'
    + '<g class="shelf-group" data-shelf="A1" onclick="x()"><rect x="1" width="3" height="4" fill="#fff"/><text x="1">A&amp;B</text></g>'
    + '<foreignObject><div><script>alert(1)</script></div></foreignObject><script>alert(2)</script><a href="javascript:x"><circle r="2"/></a>'
    + '<use href="#m"/><use xlink:href="http://e/x.svg#m"/><animate attributeName="href" to="javascript:1"/><rect style="fill:url(http://e/p)" width="1"/><svg/onload=alert(1)></svg>');
  assert.ok(stripped >= 8, `stripped ${stripped}`);
  assert.doesNotMatch(svg, /script|foreignObject|onclick|javascript:|http:\/\/e|@import|<animate|<a\b|<svg\/onload/i);
  assert.match(svg, /<g class="shelf-group" data-shelf="A1"><rect x="1" width="3" height="4" fill="#fff"\/><text x="1">A&amp;B<\/text><\/g>/);
  assert.match(svg, /<use href="#m"\/>/);
});

test('map svg: the published Busselton map passes through unchanged', () => {
  const map = readFileSync(new URL('../../maps/1241.svg', import.meta.url), 'utf8');
  const r = sanitizeSvg(map);
  assert.equal(r.stripped, 0); assert.equal(r.svg, map);
});
