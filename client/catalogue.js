// Keycode lookups with a cache and batching against GET /v1/catalogue?kc=.
// An item is { kc, name, url, price, was, img, clr, at } or null when no
// upstream knows the code. Hits are kept for a week under `kc:<code>`; a
// miss is remembered in memory for the session so a mistyped code is asked
// once. When the worker is unreachable, lookups resolve null without throwing.
// Requests go in chunks of the worker's limit (50 codes): one screen asking
// for 200 names used to be refused whole, so every product read as unknown
// (audit 19 Oct P1). A chunk that fails is not asked again for a while.

const TTL_MS = 7 * 86_400_000;
const BATCH_MS = 40;
export const CHUNK = 50;               // worker/catalogue.js MAX_CODES
const FAIL_MS = 120_000;

export function createCatalogue({ transport, storage, timers = globalThis, token = async () => null }) {
  const mem = new Map();
  let queue = new Map();     // keycode → [resolvers]
  let timer = null;
  const failed = new Map();  // keycode → when its request failed (unreachable, refused)

  async function cached(kc) {
    if (mem.has(kc)) return mem.get(kc);
    const v = await storage.get(`kc:${kc}`);
    if (v && Date.now() - v.at < TTL_MS) { mem.set(kc, v.item); return v.item; }
    return undefined;
  }
  function lookup(keycode) {
    const kc = String(keycode);
    return new Promise(async (resolve) => {
      const hit = await cached(kc);
      if (hit !== undefined) return resolve(hit);
      if (Date.now() - (failed.get(kc) || 0) < FAIL_MS) return resolve(null);
      if (!queue.has(kc)) queue.set(kc, []);
      queue.get(kc).push(resolve);
      timers.clearTimeout(timer); timer = timers.setTimeout(flush, BATCH_MS);
    });
  }
  async function flush() {
    const q = queue; queue = new Map();
    const kcs = [...q.keys()];
    // Signed in, the worker also fetches prices and images it has not cached.
    const t = await token().catch(() => null);
    for (let i = 0; i < kcs.length; i += CHUNK) {
      const chunk = kcs.slice(i, i + CHUNK);
      let items = null;
      try { items = (await transport.request(`/v1/catalogue?kc=${chunk.join(',')}`, t ? { token: t } : {})).items || {}; }
      catch { const now = Date.now(); for (const kc of chunk) failed.set(kc, now); }
      for (const kc of chunk) {
        const item = items?.[kc] ?? null;
        if (item) { mem.set(kc, item); failed.delete(kc); await storage.set(`kc:${kc}`, { at: Date.now(), item }); }
        else if (items && kc in items) mem.set(kc, null);
        for (const r of q.get(kc)) r(item);
      }
    }
  }
  // One-digit near-misses of a keycode nobody knows (a mistyped or misread
  // code): [{ keycode, name, url, position }], [] when offline.
  async function nearMiss(keycode) {
    try { return (await transport.request(`/v1/catalogue/nearmiss?kc=${encodeURIComponent(String(keycode))}`)).matches || []; }
    catch { return []; }
  }
  return { lookup, lookupMany: kcs => Promise.all(kcs.map(lookup)), nearMiss };
}
