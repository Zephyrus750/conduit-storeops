// ULID: 26 chars of Crockford base32, 48-bit time then 80 bits of randomness.
// Used as the client-generated event id: idempotency key and a stable sort
// order that follows the device clock. Shared by worker and client.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export function ulid(now = Date.now(), random = defaultRandom) {
  let time = now;
  let out = '';
  for (let i = 9; i >= 0; i--) {
    out = ALPHABET[time % 32] + out;
    time = Math.floor(time / 32);
  }
  const bytes = random(10);
  // 80 bits → 16 base32 chars.
  let bits = 0, acc = 0, rand = '';
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; rand += ALPHABET[(acc >> bits) & 31]; }
  }
  return out + rand.slice(0, 16);
}

export function isUlid(s) {
  return typeof s === 'string' && ULID_RE.test(s);
}

export function ulidTime(s) {
  let t = 0;
  for (let i = 0; i < 10; i++) t = t * 32 + ALPHABET.indexOf(s[i]);
  return t;
}

function defaultRandom(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}
