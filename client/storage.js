// Device storage behind one small async KV interface, so the library runs
// on a phone (IndexedDB) and under Node tests (memory) unchanged.
//
//   get(key) → value | undefined     set(key, value)     del(key)
//   list(prefix) → [{ key, value }] in key order
//
// Keys are feature-named and brand-neutral (suite_*, outbox:, snap:).

export function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    async get(k) { return m.get(k); },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix) { return [...m.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => ({ key, value })); },
  };
}

export function indexedDbStorage(dbName = 'suite-store') {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('kv', mode);
      const out = fn(t.objectStore('kv'));
      t.oncomplete = () => resolve(out.result !== undefined ? out.result : out.value);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    async get(k) { const db = await open(); return new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async set(k, v) { return tx('readwrite', s => s.put(v, k)); },
    async del(k) { return tx('readwrite', s => s.delete(k)); },
    async list(prefix) {
      const db = await open();
      return new Promise((res, rej) => {
        const out = [];
        const range = IDBKeyRange.bound(prefix, prefix + '￿');
        const r = db.transaction('kv').objectStore('kv').openCursor(range);
        r.onsuccess = () => { const c = r.result; if (!c) return res(out); out.push({ key: c.key, value: c.value }); c.continue(); };
        r.onerror = () => rej(r.error);
      });
    },
  };
}

export function defaultStorage() {
  return typeof indexedDB !== 'undefined' ? indexedDbStorage() : memoryStorage();
}
