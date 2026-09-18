# Conduit

One store-ops program replacing ShelfSearcher, Decant Visualiser and K2B:
one worker, one shell, one event log per store.

This repo holds the **worker** (Cloudflare Workers + Durable Objects) and the
**shared** modules the client will use unchanged. The shell arrives once the
worker core is proven; the design of record is the "Conduit Backend Design"
doc and the "Conduit Shell Swap" showcase.

## Layout

```
worker/      the Cloudflare worker: routes, auth, registry object, store object
shared/      code the device runs too: event catalogue, validation, reducers, ULID
test/unit    pure-module tests (node --test)
test/contract the worker running in workerd via Miniflare, real SQLite-backed objects
scripts/     hash-secret: make the OWNER_KEY_HASH for wrangler secret put
```

No bundler. Plain ES modules, deployed by wrangler as written.

## Run the tests

```
npm install
npm test            # unit + contract
```

The contract suite is the "done when" of build step 2: an owner registers a
store, a device signs in, sends an event, and a second device receives it
over its WebSocket.

## Deploy

Staging and production are separate workers (`conduit-staging`, `conduit`).

```
npx wrangler secret put TOKEN_SECRET --env staging      # random 32+ bytes
npm run hash-secret -- "<owner key>"                     # then:
npx wrangler secret put OWNER_KEY_HASH --env staging     # paste the hash
npm run deploy:staging
```

D1, R2 and KV bindings are added when the features that need them land
(history, manifests and exports, map cache). See `wrangler.toml`.

## API in one screen

| Route | Who | Status |
| --- | --- | --- |
| `POST /v1/auth/signin` | anyone | live: store + PIN, or `ownerKey` |
| `POST /v1/auth/unlock` | signed-in device | live: area or manager code adds a role |
| `POST /v1/auth/refresh` | signed-in device | live: rotates the refresh token |
| `GET /v1/stores` | anyone | live: number, name, region, status |
| `GET /v1/store/:no/snapshot` | store token | live: projections for entitled areas |
| `GET /v1/store/:no/changes?since=` | store token | live: events after a seq |
| `POST /v1/store/:no/events` | store token | live: batch submit, per-event ack or rejection |
| `GET /v1/store/:no/ws` | store token | live: hello, submit, hb, ping; event fan-out |
| `POST /v1/admin/stores`, `PATCH …/:no`, `GET …/:no` | owner | live: register, entitle, status, rotate |
| `GET /v1/admin/stores/:no/tail`, `/devices`, `GET /v1/admin/actions` | owner | live: diagnostics |
| `POST /v1/admin/actas/:no` | owner | live: store-scoped token with `actor: owner` |
| life, manifest, map, catalogue, history, export, import, flip | | `501 not_implemented`, named |

Every error is `{ code, message }`. Codes: `unauthorised`, `not_entitled`,
`not_registered`, `locked_out`, `invalid_event`, `duplicate` (a success),
`not_implemented`, plus reducer codes such as `bay_occupied` and `cage_exists`.

## Event envelope

```json
{ "id": "01J9…", "store": "1241", "area": "backdock", "type": "pallet.done",
  "entity": { "truck": "2026-09-07-T1", "bay": "A6" }, "payload": { "crew": "D1" },
  "at": "2026-09-07T08:41:12+08:00", "v": 1 }
```

The worker sets `actor` from the token, never from the device, assigns `seq`
on apply, acknowledges duplicates by `id`, and rejects anything a reducer
refuses with a code. Events are never deleted.

## Where things stand

Build order step 2 (worker core) is in. Reducers exist for devices, location
refresh, cages, backfill submissions, trucks and pallets; the rest of the
catalogue is accepted by validation but rejected `not_implemented` until its
reducer lands, so nothing is ever logged without effect.
