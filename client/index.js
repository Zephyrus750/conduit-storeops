// Conduit client library. Plain ES modules; import from the shell as
//   import { createClient } from './client/index.js';
//   const c = createClient({ baseUrl: 'https://…workers.dev' });
//   await c.session.load();
//   await c.session.signIn({ store: '1241', pin: '2468' });
//   const store = await c.open('1241');   // load cache, connect, ready to dispatch
//
// c.maps.get(no) fetches the published map once per version; c.catalogue
// .lookup(kc) answers product lookups from a week-long cache.
// Shared modules (catalogue, validation, reducers) are the same files the
// worker runs.

import { createTransport } from './transport.js';
import { defaultStorage } from './storage.js';
import { createSession } from './session.js';
import { createStore } from './store.js';
import { createCatalogue } from './catalogue.js';
import { createMaps } from './maps.js';

export { createTransport, TransportError } from './transport.js';
export { memoryStorage, indexedDbStorage } from './storage.js';
export { createSession } from './session.js';
export { createStore } from './store.js';
export { createCatalogue } from './catalogue.js';
export { createMaps } from './maps.js';

export function createClient({ baseUrl, storage = defaultStorage(), fetchImpl, WebSocketImpl, app = 'conduit', timers } = {}) {
  const transport = createTransport({ baseUrl, fetchImpl });
  const session = createSession({ transport, storage, app });
  const catalogue = createCatalogue({ transport, storage, timers });
  const maps = createMaps({ transport, session, storage });
  const stores = new Map();
  async function open(storeNo = session.current?.store) {
    if (!storeNo) throw new Error('no store: sign in first');
    const no = String(storeNo);
    if (stores.has(no)) return stores.get(no);
    const store = createStore({ storeNo: no, session, transport, storage, WebSocketImpl, timers });
    stores.set(no, store);
    await store.load();
    store.connect();
    return store;
  }
  function closeAll() { for (const s of stores.values()) s.close(); stores.clear(); }
  session.on('signin-required', closeAll);
  return { transport, session, catalogue, maps, storage, open, closeAll, stores };
}
