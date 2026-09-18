// Credentials and tokens.
//
// Secrets at rest: PINs, area codes, the manager code and the owner key are
// stored as PBKDF2-SHA256 hashes ("pbkdf2$iterations$salt$hash", base64url).
// The owner key hash lives in the OWNER_KEY_HASH worker secret; store
// credentials live in the registry object.
//
// Access tokens are compact HMAC-SHA256 signed JSON: base64url(payload).sig.
// Payload: { store, roles, caps, device, owner, actor, iat, exp, jti }.
// Nothing in the token is secret; the signature is what matters, so the
// worker never needs to look a token up.

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;

export async function hashSecret(secret, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(secret, salt, iterations);
  return `pbkdf2$${iterations}$${b64u(salt)}$${b64u(new Uint8Array(bits))}`;
}

export async function verifySecret(secret, stored) {
  if (typeof stored !== 'string' || typeof secret !== 'string') return false;
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const bits = new Uint8Array(await pbkdf2(secret, unb64u(salt), Number(iter)));
  return timingSafeEqual(bits, unb64u(hash));
}

async function pbkdf2(secret, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

// ── tokens ─────────────────────────────────────────────────────────────
export async function signToken(payload, secret) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = b64u(new Uint8Array(await hmac(body, secret)));
  return `${body}.${sig}`;
}

export async function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const expected = new Uint8Array(await hmac(body, secret));
  let given;
  try { given = unb64u(sig); } catch { return null; }
  if (!timingSafeEqual(expected, given)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(unb64u(body))); } catch { return null; }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null;
  return payload;
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(text));
}

export function randomToken(bytes = 32) {
  return b64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text) {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

// ── claims ─────────────────────────────────────────────────────────────
export function makeClaims({ store, roles, caps, device, owner = false, actor = null, ttl }) {
  const iat = Math.floor(Date.now() / 1000);
  return { store, roles, caps, device, owner, actor, iat, exp: iat + ttl, jti: randomToken(8) };
}

export function hasRole(claims, roles) {
  if (!claims) return false;
  if (claims.roles.includes('manager')) return true;
  return roles.some(r => claims.roles.includes(r));
}

// ── encoding ───────────────────────────────────────────────────────────
export function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
