// Small HTTP helpers: JSON responses, the error envelope, CORS.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...headers },
  });
}

// Every error is { code, message, ...detail }. Codes are words the client
// can switch on; messages are for logs and the diagnostics tab.
export function fail(status, code, message, detail = {}) {
  return json({ code, message, ...detail }, status);
}

export class HttpError extends Error {
  constructor(status, code, message, detail) { super(message); this.status = status; this.code = code; this.detail = detail; }
  toResponse() { return fail(this.status, this.code, this.message, this.detail); }
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

// An error worth the owner's eye (the console's Service page). Best effort:
// it never throws, and it never holds up the request that hit it.
export function reportError(env, kind, store, detail, ctx) {
  try {
    if (!env?.REGISTRY) return;
    const stub = env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
    const p = stub.fetch('https://registry/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, store, detail }) }).catch(() => {});
    ctx?.waitUntil?.(p);
  } catch {}
}
// A JSON body no bigger than max, checked before it is parsed
// (Content-Length may be absent or wrong).
export async function readJson(request, max = 1_000_000) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'payload_too_large', `body is over ${max >= 1e6 ? `${max / 1e6} MB` : `${max / 1e3} KB`}`);
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'invalid_json', 'body must be JSON'); }
}
