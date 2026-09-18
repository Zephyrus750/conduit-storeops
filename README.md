# Conduit

One store-ops program replacing ShelfSearcher, Decant Visualiser and K2B:
one worker, one shell, one event log per store.

This repo holds the **worker** (Cloudflare Workers + Durable Objects) and the
**shared** modules the client will use unchanged. The shell arrives once the
worker core is proven; the design of record is the "Conduit Backend Design"
doc and the "Conduit Shell Swap" showcase.

## Layout

```
index.html   the shell (one frame; desktop, half-screen and phone by container query)
js/          shell.js, map.js, ui.js, registry.js, prefs.js, views/*.js (one module per view)
styles/      tokens.css + shell.css (generated from the showcase), app.css
maps/        published map documents (1241.svg for the pilot)
worker/      the Cloudflare worker: routes, auth, registry object, store object
shared/      code the device runs too: event catalogue, validation, reducers, ULID
client/      the device library: session, store (outbox, snapshot cache, socket), catalogue
test/unit    pure-module tests (node --test)
test/contract the worker running in workerd via Miniflare, real SQLite-backed objects
scripts/     hash-secret: make the OWNER_KEY_HASH for wrangler secret put
```

No bundler. Plain ES modules, deployed by wrangler as written.

## Run it locally

```
npm install
npm run dev          # worker in workerd on :8787 (store 1241, PIN 2468) + shell on :8080
```

Open http://127.0.0.1:8080/. The shell finds the worker at `?worker=` (remembered
per device) or defaults to :8787 on localhost. Sign in as 1241 / 2468.

## Run the tests

```
npm install
npm test            # unit + contract
```

The contract suite is the "done when" of build step 2: an owner registers a
store, a device signs in, sends an event, and a second device receives it
over its WebSocket.

## Deploy

**Worker (Cloudflare).** GitHub Actions deploys `conduit-staging` on every push
to `main` and runs the tests first. Set four repository secrets once
(Settings › Secrets and variables › Actions):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token from the "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Account id from the Workers overview |
| `TOKEN_SECRET` | Any long random string; signs access tokens |
| `OWNER_KEY` | The owner key you will type on your devices; only its hash reaches the worker |

Then run the **deploy** workflow by hand once with `set_secrets` ticked, so the
worker receives `TOKEN_SECRET` and `OWNER_KEY_HASH`. After that, pushes deploy.
Production is the same workflow run by hand with `env=production`.

From a laptop instead: `npx wrangler login`, then the same two `secret put`
commands and `npm run deploy:staging`.

**Shell (Netlify).** Import this repository as a new site: publish directory
`.`, no build command (netlify.toml already says so). The shell talks to the
staging worker by default (`js/config.js`); open it once with
`?worker=<url>` to point a device elsewhere.

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

## Client library

```js
import { createClient } from './client/index.js';
const c = createClient({ baseUrl: 'https://conduit-staging.<account>.workers.dev' });
await c.session.load();                                   // device id, saved session
await c.session.signIn({ store: '1241', pin: '2468' });   // or signInOwner({ ownerKey })
await c.session.unlock('SR-CODE');                        // adds the stockroom role
const store = await c.open('1241');                       // cache first, then the socket
store.on('cages', render);                                // re-render on change
await store.dispatch({ type: 'cage.park', entity: { cage: 'BSN1240417' }, payload: { location: 'Aisle 2' } });
store.on('reject', r => toast(r.message));                // rejections name the event
store.on('status', s => footer(s));                       // { state, queued, lastError, seq }
```

Local state is the last server snapshot with the outbox replayed on top, so
optimism is automatic and a rejection rolls back by rebuilding without that
event. One WebSocket per device with backoff and jitter; polling on
`/changes` when sockets are blocked; heartbeat every three minutes or on
change. Storage is IndexedDB on a device and memory under tests, behind one
adapter. `status.state` is `offline`, `connecting`, `live` or `polling`, and
`queued` is the real outbox depth.

## The shell

One frame, one stylesheet set, appearance as tokens. `styles/tokens.css` and
`styles/shell.css` are generated from the showcase by `npm run css`; only rules
whose classes the shell and views use survive, so the stylesheet tracks the
code rather than the other way round. `js/registry.js` is the one view registry:
a view is `{ id, title, icon, desktop(ctx), mobile?(ctx), mount?(ctx, root) }`
and renders into the content region; it owns no chrome and no stylesheet.

Floor views live on real data: Store map, Pick list, Location refresh, Label
integrity, Emergency, Maintenance, Stocktake, plus Dashboard and Settings
(skin, accent, rail, bars, title bar). Back dock and Stockroom rows are inert
until their ports land.

## Where things stand

Build order steps 2 (worker core), 3 (client library) and the shell with the
Floor views are in, and every type in the catalogue has a reducer. Shapes follow the legacy modules, ported faithfully:

| Area | Reducers | Ported from |
| --- | --- | --- |
| Floor | refresh (segments, focus, plan paint), labels (cycle, assign, check, variance), stocktake (sessions, state advances, verify), issues (log, progress, close, reopen), assets (service, schedule), pick list | ShelfSearcher refresh, label-integrity, stocktake, maintenance, em-service modes |
| Stockroom | cages with ring colours, backfill submissions (pending, corrected, submitted; requested list; claims; rename), negative-SOH adjustments, day list | K2B review, adjust and scan modules |
| Back dock | trucks (staged, live, closed) with team and halts, manifests keyed by the last 9 digits, pallets (chep, loscam, bulk) with segments and scans, planner slots 1 to 4, history rows on finalise | Decant Visualiser receiving, manifests, planner, history |
| Store | device heartbeat, map publish, roster rotation marker | |

A catalogued type without a reducer would be rejected `not_implemented`; the
unit suite asserts there are none.
