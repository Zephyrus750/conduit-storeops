// Transport hardening in one place: request timeout, JSON envelope, typed
// errors, exponential backoff with jitter capped at 60 s, and a circuit
// breaker that pauses submits after three consecutive failures.

export const REQUEST_TIMEOUT_MS = 10_000;
export const BACKOFF_CAP_MS = 60_000;
export const BREAKER_FAILURES = 3;

export class TransportError extends Error {
  constructor(status, code, message, detail = {}) { super(message); this.status = status; this.code = code; this.detail = detail; }
  get network() { return this.status === 0; }
}

export function createTransport({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const base = baseUrl.replace(/\/+$/, '');
  async function request(path, { method = 'GET', body, token } = {}) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl?.signal,
      });
    } catch (e) {
      throw new TransportError(0, 'network', e?.name === 'AbortError' ? 'request timed out' : (e?.message || 'network error'));
    } finally { if (timer) clearTimeout(timer); }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new TransportError(res.status, data?.code || 'http_error', data?.message || `HTTP ${res.status}`, data || {});
    return data;
  }
  return { request, base, wsBase: base.replace(/^http/, 'ws') };
}

// Backoff schedule: 1s, 2s, 4s … capped, with ±25% jitter.
export function backoffMs(attempt, cap = BACKOFF_CAP_MS, random = Math.random) {
  const raw = Math.min(cap, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(raw * (0.75 + random() * 0.5));
}

export class Breaker {
  constructor(threshold = BREAKER_FAILURES) { this.threshold = threshold; this.failures = 0; this.openUntil = 0; }
  get open() { return Date.now() < this.openUntil; }
  succeed() { this.failures = 0; this.openUntil = 0; }
  fail(now = Date.now()) {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openUntil = now + backoffMs(this.failures - this.threshold + 1);
    return this.openUntil;
  }
}
