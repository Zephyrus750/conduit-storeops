// Map SVG allow-list. A published floor is inserted into every device's
// page with innerHTML, so only the elements and attributes a store map is
// drawn with survive; everything else (script, foreignObject, event
// handlers, off-page links, animation) is dropped. Pure string work: it runs
// in the worker at publish and needs no DOM.

const ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'defs', 'style', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'symbol', 'use', 'marker']);
const ATTRS = new Set([
  'xmlns', 'xmlns:xlink', 'version', 'viewbox', 'preserveaspectratio', 'id', 'class', 'style', 'transform', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy',
  'width', 'height', 'd', 'points', 'pathlength', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'color', 'display', 'visibility', 'pointer-events', 'vector-effect', 'shape-rendering', 'text-rendering', 'clip-path', 'clip-rule', 'mask',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'text-decoration', 'writing-mode',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'patternunits', 'patterntransform', 'clippathunits', 'maskunits', 'markerwidth', 'markerheight', 'refx', 'refy',
  'orient', 'markerunits', 'marker-start', 'marker-mid', 'marker-end', 'href', 'xlink:href', 'role', 'tabindex', 'focusable', 'ox',
]);
// Values that can reach script or another origin.
const BAD_VALUE = /javascript:|vbscript:|data:(?!image\/(png|jpe?g|gif|webp);)|expression\s*\(|@import|behavior\s*:|-moz-binding/i;
const OFF_PAGE_URL = /url\(\s*['"]?\s*(?!#)/i;
// What the browser will read: character references decoded (an inline SVG's
// attributes and style text decode them), CSS escapes decoded and CSS
// comments dropped, so "u&#114;l(" or "u\\72 l(" is checked as "url(".
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', lpar: '(', rpar: ')', sol: '/', bsol: '\\', num: '#', semi: ';', tab: '\t', newline: '\n' };
const cp = n => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');
const decodeRefs = v => String(v).replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (m, h, d, n) => (h ? cp(parseInt(h, 16)) : d ? cp(parseInt(d, 10)) : NAMED[n.toLowerCase()] ?? m));
const decodeCss = v => String(v).replace(/\/\*[\s\S]*?(\*\/|$)/g, '').replace(/\\([0-9a-f]{1,6})\s?/gi, (m, h) => cp(parseInt(h, 16))).replace(/\\(.)/g, '$1');
const asRead = v => decodeCss(decodeRefs(v));

// Returns { svg, stripped } where stripped counts removed elements and attributes.
export function sanitizeSvg(input) {
  const src = String(input ?? '');
  const out = []; let stripped = 0, skip = 0, i = 0;
  const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/\s*([a-zA-Z][\w:.-]*)\s*>|<([a-zA-Z][\w:.-]*)((?:\s+[^\s=\/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m, inStyle = false;
  while ((m = TOKEN.exec(src))) {
    const text = src.slice(i, m.index); i = TOKEN.lastIndex;
    if (!skip) out.push(inStyle ? cleanStyle(text) : text.replace(/</g, '&lt;'));
    const tok = m[0];
    if (tok.startsWith('<!--') || tok.startsWith('<?') || (tok.startsWith('<!') && !tok.startsWith('<![CDATA['))) continue;
    if (tok.startsWith('<![CDATA[')) { if (!skip && inStyle) out.push(cleanStyle(tok)); else stripped += 1; continue; }
    if (m[1]) {                                    // closing tag
      const name = m[1].toLowerCase();
      if (skip) { if (!ELEMENTS.has(name)) skip -= 1; continue; }
      if (!ELEMENTS.has(name)) continue;
      if (name === 'style') inStyle = false;
      out.push(`</${m[1]}>`); continue;
    }
    const name = m[2].toLowerCase(), selfClose = m[4] === '/';
    if (skip || !ELEMENTS.has(name)) { if (!selfClose) skip += 1; if (!ELEMENTS.has(name)) stripped += 1; continue; }
    const attrs = [];
    const ATTR = /([^\s=\/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g; let a;
    while ((a = ATTR.exec(m[3] || ''))) {
      const an = a[1], key = an.toLowerCase(); let v = a[2] ?? '';
      if (v[0] === '"' || v[0] === "'") v = v.slice(1, -1);
      const ok = (ATTRS.has(key) || /^data-[\w-]+$/.test(key) || /^aria-[\w-]+$/.test(key)) && !/^on/.test(key)
        && !((key === 'href' || key === 'xlink:href') && !v.trim().startsWith('#'))
        && !(!key.startsWith('data-') && (OFF_PAGE_URL.test(asRead(v)) || BAD_VALUE.test(asRead(v)) || BAD_VALUE.test(v)));
      if (!ok) { stripped += 1; continue; }
      attrs.push(` ${an}="${v.replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`);
    }
    out.push(`<${m[2]}${attrs.join('')}${selfClose ? '/' : ''}>`);
    if (name === 'style' && !selfClose) inStyle = true;
  }
  if (!skip) out.push(inStyle ? cleanStyle(src.slice(i)) : src.slice(i).replace(/</g, '&lt;'));
  return { svg: out.join(''), stripped };
}
// Inside <style>: no imports, no off-page urls, no script-y values, and no
// markup that could end the element early.
function cleanStyle(css) {
  const raw = String(css).replace(/^<!\[CDATA\[|\]\]>$/g, '');
  return asRead(raw).replace(/<\/?[a-zA-Z!][^>]*>?/g, '').replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, 'none').replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
