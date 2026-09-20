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

export async function readJson(request) {
  try { return await request.json(); }
  catch { throw new HttpError(400, 'invalid_json', 'body must be JSON'); }
}
