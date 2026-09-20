// Published maps on the device: one download per version, kept in storage
// under `map:<store>` as { version, doc }. The store's `map` projection says
// which version is current, so the caller passes that and the cache answers
// without a request when it already holds it.
//
//   const doc = await maps.get('1241', { version: store.get('map').version });
//   doc → { v, kind, store, version, at, by, name, departments, floors:[{ id, name, type, svg }] } | null

export function createMaps({ transport, session, storage }) {
  const mem = new Map();
  async function cached(no) {
    if (mem.has(no)) return mem.get(no);
    const v = (await storage.get(`map:${no}`)) || null;
    mem.set(no, v); return v;
  }
  async function get(storeNo, { version = null, force = false } = {}) {
    const no = String(storeNo);
    const have = await cached(no);
    if (have && !force && (!version || have.version === version)) return have.doc;
    const token = await session.token();
    if (!token) return have?.doc || null;
    let doc;
    try { doc = await transport.request(`/v1/store/${no}/map/${version ? encodeURIComponent(version) : 'latest'}`, { token }); }
    catch (e) {
      if (e.status === 404) { if (!version || !have) return null; return have.doc; }
      if (have) return have.doc;              // offline: the cached version still works
      throw e;
    }
    const entry = { version: doc.version, doc };
    mem.set(no, entry); await storage.set(`map:${no}`, entry);
    return doc;
  }
  async function info(storeNo) { return transport.request(`/v1/store/${storeNo}/map`, { token: await session.token() }); }
  async function publish(storeNo, body) { return transport.request(`/v1/store/${storeNo}/map`, { method: 'POST', body, token: await session.token() }); }
  async function forget(storeNo) { mem.delete(String(storeNo)); await storage.del(`map:${storeNo}`); }
  return { get, info, publish, forget };
}
