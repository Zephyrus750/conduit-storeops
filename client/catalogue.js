// Keycode lookups with a cache and batching against GET /v1/catalogue?kc=.
// An item is { kc, name, url, price, was, img, clr, at }, null when the
// catalogue answered that it does not know the code, or undefined when it
// could not be asked (offline, timed out, refused, or the worker could not
// answer for that code): not knowing is not "not in the catalogue". Hits are
// kept for a week under `kc:<code>`; a miss (a code not sold online, or a
// mistyped one) is kept for the rest of the device's day, so a reload does
// not ask about it again and the live reader does not wait on it. The
// catalogue itself is rebuilt weekly, so a miss cannot turn into a hit
// within the day. Lookups never throw.
// Requests go in chunks of the worker's limit (50 codes): one screen asking
// for 200 names used to be refused whole, so every product read as unknown
// (audit 19 Oct P1). A chunk that fails is not asked again for a while.

const TTL_MS = 7 * 86_400_000;
// An answer without the product page's details (no picture and no price:
// the worker had not read the page yet, or could not) is asked again after
// 90 seconds, so a picture arrives once the worker has it (it reads pages
// in the background and keeps each one). Asking again costs the worker an
// edge-cache read: it does not re-read a page it is reading or that failed.
export const THIN_MS = 90_000;
// An answer whose page was read but came without a picture (or without a
// price) is asked again after 30 minutes, not kept for the week: the worker
// keeps trying the page, and fills in any picture it has kept, so the
// picture arrives without waiting a week. A picture this device already
// has is never dropped for an answer without one.
export const PART_MS = 30 * 60_000;
const hasPrice = item => Number.isFinite(item.price);
const thin = item => !!item && !item.at && !(item.img && hasPrice(item));
const part = item => !!item && (!item.img || !hasPrice(item));
const fresh = (item, at) => Date.now() - at < (thin(item) ? THIN_MS : part(item) ? PART_MS : TTL_MS);
// The device's own calendar day: a kept miss counts until local midnight.
export const deviceDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const BATCH_MS = 40;
export const CHUNK = 50;               // worker/catalogue.js MAX_CODES
const FAIL_MS = 120_000;

export function createCatalogue({ transport, storage, timers = globalThis, token = async () => null }) {
  const mem = new Map();
  let queue = new Map();     // keycode → [resolvers]
  let timer = null;
  const failed = new Map();  // keycode → when its request failed (unreachable, refused)

  async function cached(kc) {
    const m = mem.get(kc);
    if (m && fresh(m.item, m.at)) return m.item;
    const v = await storage.get(`kc:${kc}`);
    if (v && v.item === null) { if (v.day !== deviceDay()) return undefined; mem.set(kc, { item: null, at: v.at }); return null; }
    if (v && fresh(v.item, v.at)) { mem.set(kc, { item: v.item, at: v.at }); return v.item; }
    return undefined;
  }
  function lookup(keycode) {
    const kc = String(keycode);
    // Only keycodes (6 to 9 digits) are the catalogue's; anything else is
    // not in it, and asking would only be left out of the answer.
    if (!/^\d{6,9}$/.test(kc)) return Promise.resolve(null);
    return new Promise(async (resolve) => {
      const hit = await cached(kc);
      if (hit !== undefined) return resolve(hit);
      if (Date.now() - (failed.get(kc) || 0) < FAIL_MS) return resolve(undefined);
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
        // Left out of the answer: the worker could not tell (its catalogue was down).
        let item = items && kc in items ? items[kc] ?? null : undefined;
        if (item && !item.img) { const prev = mem.get(kc)?.item || (await storage.get(`kc:${kc}`))?.item; if (prev?.img) item = { ...item, img: prev.img }; }
        if (item) { mem.set(kc, { item, at: Date.now() }); failed.delete(kc); await storage.set(`kc:${kc}`, { at: Date.now(), item }); }
        else if (item === null) { mem.set(kc, { item: null, at: Date.now() }); await storage.set(`kc:${kc}`, { at: Date.now(), item: null, day: deviceDay() }); }
        else if (items) failed.set(kc, Date.now());   // left out: not asked again until the back-off has passed
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
