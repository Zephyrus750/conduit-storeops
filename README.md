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
js/          shell.js, map.js, search.js, updates.js, unlock.js, ui.js, registry.js, prefs.js, views/*.js, views/stockroom/*.js
styles/      tokens.css + shell.css (generated from the showcase), app.css
maps/        published map documents (1241.svg for the pilot)
worker/      the Cloudflare worker: routes, auth, registry object, store object
shared/      code the device runs too: event catalogue, validation, reducers, ULID
client/      the device library: session, store (outbox, snapshot cache, socket), catalogue
test/unit    pure-module tests (node --test)
test/contract the worker running in workerd via Miniflare, real SQLite-backed objects
scripts/     hash-secret (OWNER_KEY_HASH), publish-map (a map version from the editor's export or SVG files), build-sw (the precache list), dev, extract-css
```

No bundler. Plain ES modules, deployed by wrangler as written.

## Run it locally

```
npm install
npm run dev          # worker in workerd on :8787 (store 1241, PIN 2468) + shell on :8080
```

Open http://127.0.0.1:8080/. The shell finds the worker at `?worker=` (remembered
per device) or defaults to :8787 on localhost. Sign in as 1241 / 2468, or
follow "Owner sign-in" with `dev-owner-key` for the admin console.

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
`?worker=<url>` to point a device at another worker on `WORKER_ALLOWED` in
the same file (any other origin is ignored, so a link cannot send a store's
PIN elsewhere). The sign-in names the worker when it is not the default.

D1, R2 and KV bindings are added when the features that need them land
(history, manifests and exports, map cache). See `wrangler.toml`.

## API in one screen

| Route | Who | Status |
| --- | --- | --- |
| `POST /v1/auth/signin` | anyone | live: store + PIN, or `ownerKey` |
| `POST /v1/auth/unlock` | signed-in device | live: area or manager code adds a role |
| `POST /v1/auth/refresh` | signed-in device | live: rotates the refresh token |
| `POST /v1/auth/signout` | holder of the refresh token | live: deletes the refresh token on the worker |
| `GET /v1/stores` | anyone | live: number, name, region, status |
| `GET /v1/store/:no/snapshot` | store token | live: projections for entitled areas |
| `GET /v1/store/:no/changes?since=` | store token | live: events after a seq |
| `POST /v1/store/:no/events` | store token | live: batch submit, per-event ack or rejection |
| `GET /v1/store/:no/ws` | store token | live: hello, submit, hb, ping; event fan-out |
| `GET /v1/admin/stores`, `POST /v1/admin/stores`, `PATCH …/:no`, `GET …/:no` | owner | live: list, register, entitle, status, rotate; a new PIN or code, `status: suspended` or `revoke: true` signs every device out (the store's credential epoch moves on) |
| `GET /v1/admin/stores/:no/tail`, `/devices`, `/snapshot`, `GET /v1/admin/actions` | owner | live: diagnostics, read-only projections |
| `POST /v1/admin/actas/:no` | owner | live: store-scoped token with `actor: owner` |
| `GET /v1/store/:no/map`, `GET …/map/:version` (`latest` allowed) | store token or owner | live: published map metadata and document, ETag / 304 |
| `POST /v1/store/:no/map` | owner | live: publish a version; logs `map.publish`, sets the registry's map version |
| `POST /v1/admin/stores/:no/import`, `POST …/flip` | owner | live: K2B (`source: k2b`) and Decant Visualiser (`source: dv`) importers with dry run; area state flip |
| `GET /v1/catalogue?kc=a,b[&fields=link]` | anyone | live: name, URL, price, was, image, clearance per keycode; cached at the edge |
| `GET /v1/store/:no/life/:keycode` | store token or owner, stockroom entitled | live: the keycode's bays (status, scanned, flagged), SOH adjustments and cages, newest first |
| `GET /v1/store/:no/history/:kind`, `GET …/export/:kind` (`backfill`, `cages`, `adjustments`, `receiving`) | store token or owner, entitled to the kind's area | live: the area's records, paged (`offset`, `limit` ≤ 500) or as CSV |
| `POST /v1/store/:no/manifest` | dock code or manager | live: publish a parsed DC Manifest Report (v 1, kind report, ≤ 8 MB, 1 to 500 consols); logs `manifest.publish` so every device lists it |
| `GET /v1/store/:no/manifest/:manNo`, `DELETE …` | store token, backdock entitled (delete: dock code) | live: the full report document; remove logs `manifest.remove` |
| `GET /v1/store/:no/profiles` | store token or owner, backdock entitled | live: carton profiles (`dv-profiles/1`) built from the published manifests: units per carton, consistency, last arrival, pack changes |

Every error is `{ code, message }`. Codes: `unauthorised`, `not_entitled`,
`not_registered`, `locked_out`, `revoked` (signed out by a rotation, suspension
or revoke), `suspended`, `invalid_event`, `duplicate` (a success),
`not_implemented`, plus reducer codes such as `bay_occupied` and `cage_exists`.

Sign-in and unlock lock out per device (5 wrong), per store (30 in an hour)
and per network address (200 in an hour; stores may share one), each for
15 minutes. `LOCKOUT_ATTEMPTS`, `LOCKOUT_STORE_ATTEMPTS`,
`LOCKOUT_IP_ATTEMPTS`, `LOCKOUT_WINDOW_SECONDS` and `LOCKOUT_SECONDS` tune them.
An area or manager code lasts a shift (`ROLE_TTL_SECONDS`, 12 h); after that
the device keeps the Floor and asks for the code again. The WebSocket carries
its token as the second subprotocol (`conduit, <token>`), never in the URL.

## Admin console

The owner's views live in the same shell (`js/views/admin.js`): "Owner
sign-in" on the store sign-in takes the owner key and opens the console with
every store in the rail. Overview lists the registry; a store has Overview,
Events (the raw tail with area and text filters), Devices (heartbeats,
outbox depth, last error) and Access (entitlements, per-area state, PIN and
code rotation with a generated value shown once, name, region and status).
Register a store creates a store on the worker with generated credentials
and hands them over once. Owner actions is the registry log. **Act as
store** mints a store-scoped token (manager role, `actor: owner`) and opens
the store views with a bar to return; the owner session is kept underneath
so refresh keeps working. Everything the console writes is a registry
action or an ordinary event; nothing is deployed.

## Install and updates

The shell installs as an app (`manifest.webmanifest`, `icons/`) and works
offline through `sw.js`, ported from the chassis's release patterns: install
writes the complete shell (the generated `sw-precache.js`, 46 files) into
one release cache named by a content hash, same-origin requests are served
cache-first from that release only, and a new release takes over only when
the person accepts it. The new worker installs in the background and waits;
the shell shows an update bar (and Settings › Updates) and "Update now"
posts SKIP_WAITING, then the page reloads once on the new release. The
precache is the shell alone: maps, snapshots and the outbox live in
IndexedDB, and every worker call passes through uncached. Bundled fallback
maps (`maps/*.svg`) serve network-first from a cache that survives releases.

After changing any shell file run `npm run sw` and commit `sw-precache.js`;
the unit suite fails when it is stale. Netlify serves `sw.js` and the
precache list with `no-cache` so a device always sees the newest release.

## Stockroom

The Stockroom workspace is the first ported module with live users
(`js/views/stockroom/`). Its views run on the stockroom reducers that were
already in the log:

- **Backfill review** (`bfreview`): the desk. Phones scan bays; the desk
  pastes the SIM report (kept on the device under `simreport:<store>:<date>`,
  never sent to the worker, as K2B did), compares every bay (add / delete /
  match, `shared/backfill.js`), marks codes incorrect, flags a code to
  Adjustments, requests bays for the day list, marks Ready (the system-only
  codes are written as `scanned:false` so the worker's metrics match the
  desk) and Submits. Claims are a soft lock per bay. On the phone: bay →
  scan → send, one `submission.update` per scan so wifi drops lose nothing.
- **Cages**: open cages with ring colour, park location, contents, last
  seen; the phone scans cartons onto a cage, parks it and runs a sweep.
- **Adjustments**: the below-zero SOH list per day, typed or flagged from
  review; copy as CSV for the office.
- **Day list**: today's requested and pending bays split across 1 to 4
  walkers; print the sheet; the phone starts a bay from it.
- **History**: every bay marked ready or submitted, any day, with metrics
  and codes; copy as CSV.

A Stockroom view asks for the crew code once per device (`js/unlock.js`,
`session.unlock`), and the client store reconnects its socket when the
session's roles change so the next submit is judged on the new role. The
phone switches workspace from the launcher (the grid button beside search).
**Migration.** The console's Migration tab (per store) imports from K2B
(`worker/import.js`): a dry run reads the legacy worker with the store's
K2B code and PIN and counts what would be written; the import turns each
history record, today's bay, requested bay and negative-SOH item into the
events Conduit would have logged, with ids derived from the record so a
second run only adds what is new. Legacy metrics ride on `submission.ready`
so History matches K2B's numbers. Flip to live sets the area's state in the
registry; K2B stays deployed and goes bugfix-only for that store by hand.
Routes: `POST /v1/admin/stores/:no/import` (`{ source: 'k2b', code, pin, dry }`) and
`POST /v1/admin/stores/:no/flip` (`{ area, state }`), owner only; the dev
stack runs a stand-in legacy worker on :8789 (code `BUS247`, PIN 2468).

The same tab imports the Back dock from a store's Decant Visualiser site
(`worker/import-dv.js`, `{ source: 'dv', url, dry }`): DV's `/api/state`
is read without a code (team members import by D-number), the archive
lands as `truck.import` rows kept exactly as DV computed them, the trucks
on the dock replay as the events that built them (create, manifest, team,
goal, every pallet's landings, starts, pauses and dones, the halts), and
the planner's slots become `plan.set`. DV's huddles, transitions and team
breaks import as "Other" halts and a rollover holding record is reported,
not imported. Manifests already published to the suite worker are not
copied: the Manifests view publishes fresh reports. The dev stack runs a
stand-in DV site on :8790.

## Maps and the catalogue

**Routing.** The Map Editor's walk-path network (`pathNodes`, `pathEdges`)
travels with each published floor as `paths`; `shared/route.js` (ported
from ShelfSearcher's route engine) builds the graph, joins any map point
to its nearest edge, routes between points with Dijkstra and orders stops
by the shortest walk from the anchored first stop (nearest neighbour then
2-opt). The pick list draws its legs along the network and "Plan route"
reorders the stops; a floor without a network gets straight lines.

**Maps.** A published map is one document per version: `{ version, name,
departments, floors: [{ id, name, type, svg }] }`, each floor an SVG in the
form the store views mount (`svg.map.real`, `shelf-group` elements with
`data-shelf` and `data-dept`, emergency markers). Versions live in the
store object, one row per floor. Publishing is owner-only. The admin
console's Map tab takes the Map Editor's export straight: the `.js` file
ShelfSearcher read (`window.STORE_MAPS['1241'] = {…}`) or the `.json` the
editor saves. `shared/maprender.js` reads either without evaluating it and
renders every floor into the mounted form (a port of the legacy viewer's
loader plus the editor's floor render, so both files come out the same;
emergency and price-check markers are regenerated from the structured
arrays, and the shell scales markers to a readable size at any zoom). A
rendered ground-floor `.svg` still works. From the terminal:
`npm run publish-map -- --store 1241 --version 4.4 --file
../maps/1241-busselton.js` (or `--floor ground=maps/1241.svg`) with
`OWNER_KEY` in the environment. The publish is an ordinary `map.publish` event, so every
device sees the new version in its `map` projection and downloads the
document once (`client/maps.js`, kept under `map:<store>` on the device).
A store with no map published yet falls back to a bundled `maps/<no>.svg`
if the shell ships one, else a placeholder.

**Catalogue.** `GET /v1/catalogue?kc=` proxies two existing upstreams (the
suite lookup worker for keycode → name and product URL; the details worker
for price, was, image and clearance) and caches per keycode in the edge
Cache API: links for a week, details for a day, misses for an hour. The
device library (`client/catalogue.js`) batches lookups and keeps hits for a
week. The shell's search palette (Ctrl K, the header and phone search)
understands a keycode, a shelf such as H14-3, a department and a tool.

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
