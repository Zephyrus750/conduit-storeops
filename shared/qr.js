// QR codes for shelf links, offline and dependency-free: byte mode, error
// correction M, versions 1–7 (up to 122 bytes, enough for a shelf link).
// ShelfSearcher hand-wrote one too; that copy drew the finder rings and the
// alignment table wrong and left out version 7's version blocks, so this is
// written fresh from the standard's layout. Pure: runs on the worker, the
// device and in tests.
//
//   qrMatrix(text) → { size, modules: boolean[y][x] } | null (too long)
//   qrSvg(text, { cell, quiet }) → '<svg …>' | ''

// [total codewords, EC codewords per block, blocks] for level M, v1–7.
const VER = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2], [172, 16, 4], [196, 18, 4]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38]];

const EXP = new Array(512), LOG = new Array(256);
{ let v = 1; for (let i = 0; i < 255; i++) { EXP[i] = v; LOG[v] = i; v <<= 1; if (v & 256) v ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsRemainder(data, deg) {
  let gen = [1];
  for (let i = 0; i < deg; i++) { const next = new Array(gen.length + 1).fill(0); for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= mul(gen[j], EXP[i]); } gen = next; }
  const rem = new Array(deg).fill(0);
  for (const b of data) { const f = b ^ rem.shift(); rem.push(0); for (let j = 0; j < deg; j++) rem[j] ^= mul(gen[j + 1], f); }
  return rem;
}
const utf8 = s => [...new TextEncoder().encode(String(s))];

export function qrMatrix(text) {
  const bytes = utf8(text);
  let ver = 0;
  for (let v = 1; v <= 7; v++) { const [total, ec, blocks] = VER[v]; if (bytes.length + 2 <= total - ec * blocks) { ver = v; break; } }
  if (!ver) return null;
  const [total, ecLen, nBlocks] = VER[ver], dataLen = total - ecLen * nBlocks, size = ver * 4 + 17;

  // Data codewords: mode 0100, an 8-bit count, the bytes, a terminator,
  // then the alternating pad bytes.
  const bits = [], push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(4, 4); push(bytes.length, 8); for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataLen * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; data.length < dataLen; p++) data.push(p % 2 ? 0x11 : 0xec);
  // Equal blocks at level M for v1–7; interleave data, then error correction.
  const per = dataLen / nBlocks, blocks = [], ecs = [];
  for (let b = 0; b < nBlocks; b++) { const d = data.slice(b * per, (b + 1) * per); blocks.push(d); ecs.push(rsRemainder(d, ecLen)); }
  const words = [];
  for (let i = 0; i < per; i++) for (const d of blocks) words.push(d[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) words.push(e[i]);

  const M = Array.from({ length: size }, () => new Array(size).fill(false)), F = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { M[y][x] = dark; F[y][x] = true; } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  const al = ALIGN[ver], last = al.length - 1;
  for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = mask => {
    const d = mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);   // level M = 00
    const b = ((d << 10) | r) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);                                            // reserves the format areas
  if (ver >= 7) {
    let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const dark = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, dark); set(c, a, dark); }
  }
  // The zigzag, two columns at a time from the right, skipping column 6.
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (F[y][x]) continue;
      M[y][x] = k < words.length * 8 ? ((words[k >>> 3] >>> (7 - (k & 7))) & 1) === 1 : false; k++;
    }
  }
  const MASKS = [(x, y) => (x + y) % 2, (x, y) => y % 2, (x, y) => x % 3, (x, y) => (x + y) % 3, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2, (x, y) => (x * y) % 2 + (x * y) % 3, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2];
  const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y) === 0) M[y][x] = !M[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { if (M[y][x]) dark++; if (x < size - 1 && y < size - 1) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; } }
    for (let a = 0; a < size; a++) { let rx = 1, ry = 1; for (let b = 1; b < size; b++) { if (M[a][b] === M[a][b - 1]) { rx++; p += rx === 5 ? 3 : rx > 5 ? 1 : 0; } else rx = 1; if (M[b][a] === M[b - 1][a]) { ry++; p += ry === 5 ? 3 : ry > 5 ? 1 : 0; } else ry = 1; } }
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { apply(m); format(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } apply(m); }
  apply(best); format(best);
  return { size, modules: M };
}

export function qrSvg(text, { cell = 6, quiet = 4 } = {}) {
  const q = qrMatrix(text); if (!q) return '';
  const n = q.size + quiet * 2, path = [];
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) path.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * cell}" height="${n * cell}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`;
}
