// Barcodes as SVG, self-hosted (no library, no network): Code 128 for
// keycodes, bays and labels, EAN-13 for 13-digit item barcodes (APNs). The
// point is K2B's loop: a code on the phone or desk screen, or on a printed
// sheet, that the PDT can scan. Pure: runs in the shell and in tests.

// Code 128 symbol widths (bar, space, bar, space, bar, space), values 0–106.
const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
  + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
  + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
  + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
  + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
  + '114131 311141 411131 211412 211214 211232 2331112').split(' ');
const START_B = 104, START_C = 105, CODE_C = 99, STOP = 106;

// The symbol values for text: all digits use set C (pairs), an odd digit
// count starts in B for one digit then switches; anything else is set B.
export function code128Values(text) {
  const s = String(text);
  if (!s.length) throw new Error('nothing to encode');
  const vals = [];
  if (/^\d+$/.test(s) && s.length >= 2) {
    let i = 0;
    if (s.length % 2) { vals.push(START_B, s.charCodeAt(0) - 32, CODE_C); i = 1; } else vals.push(START_C);
    for (; i < s.length; i += 2) vals.push(Number(s.slice(i, i + 2)));
  } else {
    vals.push(START_B);
    for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new Error(`cannot encode ${JSON.stringify(ch)} in Code 128`); vals.push(c - 32); }
  }
  const check = vals.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103;
  return [...vals, check, STOP];
}
// Alternating bar/space widths in modules, starting with a bar.
export function code128Widths(text) { return code128Values(text).flatMap(v => [...C128[v]].map(Number)); }

// EAN-13 as a 95-module bit string.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
export function ean13Check(twelve) { const d = String(twelve).split('').map(Number); return (10 - d.reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0) % 10) % 10; }
export const ean13Valid = code => /^\d{13}$/.test(code) && ean13Check(code.slice(0, 12)) === Number(code[12]);
export function ean13Bits(code) {
  const c = String(code).length === 12 ? code + ean13Check(code) : String(code);
  if (!ean13Valid(c)) throw new Error('not a valid EAN-13');
  const d = c.split('').map(Number), par = PARITY[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}
const bitsToWidths = bits => { const w = []; let run = 1; for (let i = 1; i <= bits.length; i++) { if (bits[i] === bits[i - 1]) run += 1; else { w.push(run); run = 1; } } return w; };

// Which symbology a code gets: a valid 13-digit APN is EAN-13, the rest Code 128.
export const symbologyFor = code => ean13Valid(String(code)) ? 'ean13' : 'code128';

// The code as an SVG string. module: px per module; height: bar height in px;
// text: the human-readable line under the bars. Quiet zones are built in.
export function barcodeSvg(code, { module = 2, height = 56, text = true, label = null } = {}) {
  const s = String(code), kind = symbologyFor(s);
  const widths = kind === 'ean13' ? bitsToWidths(ean13Bits(s)) : code128Widths(s);
  const quiet = 10, total = widths.reduce((a, b) => a + b, 0) + quiet * 2, W = total * module, H = height + (text ? 18 : 0);
  let x = quiet, rects = '';
  widths.forEach((w, i) => { if (i % 2 === 0) rects += `<rect x="${x * module}" y="0" width="${w * module}" height="${height}"/>`; x += w; });
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const line = text ? `<text x="${W / 2}" y="${height + 14}" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="13" fill="#000">${esc(label ?? s)}</text>` : '';
  return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Barcode ${esc(s)}"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${rects}</g>${line}</svg>`;
}
