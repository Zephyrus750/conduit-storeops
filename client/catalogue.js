// Keycode lookups with a cache and batching against GET /v1/catalogue?kc=.
// An item is { kc, name, url, price, was, img, clr, at } or null when no
// upstream knows the code. Hits are kept for a week under `kc:<code>`; a
// miss is remembered in memory for the session so a mistyped code is asked
// once. When the worker is unreachable, lookups resolve null without throwing.

const TTL_MS = 7 * 86_400_000;
const BATCH_MS = 40;

export function createCatalogue({ transport, storage, timers = globalThis }) {
  const mem = new Map();
  let queue = new Map();     // keycode → [resolvers]
  let timer = null;

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
      if (!queue.has(kc)) queue.set(kc, []);
      queue.get(kc).push(resolve);
      timers.clearTimeout(timer); timer = timers.setTimeout(flush, BATCH_MS);
    });
  }
  async function flush() {
    const q = queue; queue = new Map();
    const kcs = [...q.keys()];
    let items = {};
    try { items = (await transport.request(`/v1/catalogue?kc=${kcs.join(',')}`)).items || {}; }
    catch { items = {}; }
    for (const kc of kcs) {
      const item = items[kc] ?? null;
      if (item) { mem.set(kc, item); await storage.set(`kc:${kc}`, { at: Date.now(), item }); }
      else if (kc in items) mem.set(kc, null);
      for (const r of q.get(kc)) r(item);
    }
  }
  return { lookup, lookupMany: kcs => Promise.all(kcs.map(lookup)) };
}
