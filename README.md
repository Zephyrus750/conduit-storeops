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
editor/      the map editor (owner only): ShelfSearcher's Map Editor v4.3 brought in, publishing straight to Conduit
scripts/     hash-secret (OWNER_KEY_HASH), publish-map (a map version from the editor's export or SVG files), build-sw (the precache list), dev, extract-css
```

No bundler. Plain ES modules, deployed by wrangler as written.

## Run it locally

```
npm install
npm run dev          # worker in workerd on :8787 (store 1241, PIN 2468) + shell on :8080
```

Open http://127.0.0.1:8080/. The shell finds the worker at `?worker=` (remembered
per device) or defaults to :8787 on localhost. A PC signs in as a manager
(1241 / manager code `MGR-CODE`); a phone-width window also offers Team member
(1241 / PIN 2468). "Owner sign-in" takes `dev-owner-key` for the admin console.

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
`.`, no build command (netlify.toml already says so). Lock auto publishing
and add `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` as repository secrets
(docs/SETUP.md step 5): the deploy workflow then publishes each commit's
site only after the worker reports that commit's `build` on `/v1/health`, so
a new app never reaches devices before the worker that understands it. The shell talks to the
staging worker by default (`js/config.js`); open it once with
`?worker=<url>` to point a device at another worker on `WORKER_ALLOWED` in
the same file (any other origin is ignored, so a link cannot send a store's
PIN elsewhere). The sign-in names the worker when it is not the default.
Opening the app on a signed-in device shows the store to continue in:
"Continue in <store>" goes in with no PIN and no network, "Use a different
store" signs out (unsent changes stay on the device). A reload goes straight
back in.

D1, R2 and KV bindings are added when the features that need them land
(history, manifests and exports, map cache). See `wrangler.toml`.

## API in one screen

| Route | Who | Status |
| --- | --- | --- |
| `POST /v1/auth/signin` | anyone | live: store + PIN; store + `managerCode` in place of the PIN (a manager: the Floor and the manager role, every area, for the shift); or `ownerKey` (answers a `trust` secret the device sends back next time, so the owner-wide lockout cannot shut it out) |
| `POST /v1/auth/unlock` | signed-in device | live: area or manager code adds a role |
| `POST /v1/auth/refresh` | signed-in device | live: rotates the refresh token |
| `POST /v1/auth/lock` | signed-in store device | live: idle re-lock, drops area and manager codes back to the floor session |
| `POST /v1/auth/signout` | holder of the refresh token | live: deletes the refresh token on the worker |
| `GET /v1/stores` | anyone | live: number, name, region, status |
| `GET /v1/store/:no/snapshot` | store token | live: projections for entitled areas |
| `GET /v1/store/:no/changes?since=` | store token | live: events after a seq |
| `POST /v1/store/:no/events` | store token | live: batch submit, per-event ack or rejection |
| `GET /v1/store/:no/ws` | store token | live: hello, submit, hb, ping; event fan-out |
| `POST /v1/store/:no/hb` | store token | live: record this device's presence, the HTTP twin of the socket `hb` frame, for a device on the polling fallback |
| `GET /v1/admin/stores`, `POST /v1/admin/stores`, `PATCH …/:no`, `GET …/:no` | owner | live: list, register, entitle, status, rotate; a new PIN or code, `status: suspended` or `revoke: true` signs every device out (the store's credential epoch moves on); `tools: { id: bool }` switches tools inside an area (`shared/tools.js`), logged into the store as `store.tools.set` so devices hide them at once and the worker refuses them; `entitlements` likewise as `store.areas.set` (worker only): an area switched off stops at once for every token and socket, and devices renew and follow (decision 19) |
| `GET /v1/admin/stores/:no/tail`, `/devices`, `/snapshot`, `/kpis`, `GET /v1/admin/actions` | owner | live: diagnostics, read-only projections; `/kpis` is the console's numbers for one store (backfill, dock, issues, devices, set-up alerts) |
| `POST /v1/admin/actas/:no` | owner | live: store-scoped token with `actor: owner` |
| `POST /v1/admin/stores/:no/mapedits/:id` | owner | live: accept or decline a suggested map edit (`{ status, note }`), logged as an owner action |
| `GET /v1/store/:no/map`, `GET …/map/:version` (`latest` allowed) | store token or owner | live: published map metadata and document, ETag / 304 |
| `POST /v1/store/:no/map` | owner | live: publish a version (floors with their level and walk paths, stairs and lift links included; `source`, the map editor's own document, optional); logs `map.publish`, sets the registry's map version |
| `GET /v1/store/:no/map/:version/source` (`latest` allowed) | owner | live: the map editor's document for that version, so the editor reopens what was drawn; 404 for a version published from a file without one |
| `POST /v1/admin/stores/:no/import`, `POST …/flip` | owner | live: K2B (`source: k2b`) and Decant Visualiser (`source: dv`) importers with dry run; area state flip |
| `GET /v1/catalogue?kc=a,b[&fields=link]` | anyone | live: name, URL, price, was, image, clearance per keycode; cached at the edge. Only a caller with a token starts the product-page fetches for price and image; anyone else gets what is cached |
| `GET /v1/catalogue/nearmiss?kc=` | anyone | live: catalogue keycodes one digit away (a mistyped or misread code) |
| `GET /v1/admin/service` | owner | live: the console's Service page: worker version, bindings and secrets as set or not (never their values), the catalogue build, each store object (events, live data size, last event, nightly run, next alarm, sockets, photos) and the last 100 errors recorded |
| `GET /v1/admin/catalogue`, `POST /v1/admin/catalogue/rebuild` | owner | live: catalogue size, last and running build, next weekly read; start a rebuild |
| `GET /v1/store/:no/life/:keycode` | store token or owner, stockroom entitled | live: the keycode's bays (status, scanned, flagged), SOH adjustments and cages, newest first |
| `GET /v1/store/:no/history/:kind`, `GET …/export/:kind` (`backfill`, `cages`, `adjustments`, `receiving`) | store token or owner, entitled to the kind's area | live: the area's records, paged (`offset`, `limit` ≤ 500) or as CSV; `only=archive` pages just the rows retention moved out of the live state |
| `POST /v1/store/:no/manifest` | dock code or manager | live: publish a parsed DC Manifest Report (v 1, kind report, ≤ 8 MB, 1 to 500 consols); logs `manifest.publish` so every device lists it |
| `GET /v1/store/:no/manifest/:manNo`, `DELETE …` | store token, backdock entitled (delete: dock code) | live: the full report document; remove logs `manifest.remove` |
| `POST /v1/store/:no/soh` | stockroom code or manager | live: save the day's SOH report snapshot (`{ date, rows: [{ kc, loc, soh, price, name }], merge? }`, ≤ 20,000 rows, one row a keycode a location; a re-save that day replaces it, or with `merge: true` replaces only the locations it holds and carries its store-wide SOH into the rest); logs `soh.publish`; every day is kept for 14 days, then the last of each week for 26 weeks |
| `GET /v1/store/:no/soh?n=12[&weekly=1]`, `DELETE /v1/store/:no/soh/:date` | stockroom code, manager or owner | live: the newest n snapshots, oldest first, or with `weekly=1` the last of each of the newest n weeks (what the stock classes read); remove logs `soh.remove` |
| `POST /v1/store/:no/backfill/report`, `GET /v1/store/:no/backfill/report?date=` | stockroom code or manager to save; any stockroom device (or the owner) to read | live: the Backfill review desk's pasted SIM report, whole (`{ date, report: { at, byLoc, range, delta, bayAt } }`, ≤ 1.9 MB, one a day, last three kept); saving logs `backfill.report.publish` (`state.backfill.report`: date, at, bays, codes, rev) so every device fetches the newer one |
| `GET /v1/store/:no/profiles` | store token or owner, backdock entitled | live: carton profiles (`carton-profiles/1`, the shape of Decant Visualiser’s `dv-profiles/1`) built from the published manifests: units per carton, consistency, last arrival, pack changes; `last` holds every keycode's latest delivery, ungated, so a first delivery still gives a carton size |
| `POST /v1/store/:no/photo` | store token for that store | live: an issue photo, JPEG bytes under 800 KB (the device shrinks it first), at most 300 a store in any 24 hours; answers `{ id }`. `501` until the `PHOTOS` R2 bucket is bound |
| `GET /v1/store/:no/photo/:id` | store token or owner | live: the photo while an issue lists it (until 90 days after the issue is completed or removed); one on no issue only to the device that took it |
| `DELETE /v1/store/:no/photo/:id` | store token or owner | live: deletes the photo's bytes once no live issue lists it (`409` while one does: the `issue.photo` remove event takes it off first); a draft not on an issue yet only by the device that took it, a manager or the owner |

Every error is `{ code, message }`. Codes: `unauthorised`, `not_entitled`,
`not_registered`, `locked_out`, `revoked` (signed out by a rotation, suspension
or revoke), `suspended`, `invalid_event`, `payload_too_large` (an event over
its type's cap, `PAYLOAD_MAX` in the catalogue), `duplicate` (a success),
`not_implemented`, plus reducer codes such as `bay_occupied`, `cage_exists` and
`unchanged`. A socket whose token runs out is told `expired` and closed.

Sign-in and unlock lock out per device (5 wrong), per store (30 in an hour)
and per network address (200 in an hour; stores may share one), each for
15 minutes. `LOCKOUT_ATTEMPTS`, `LOCKOUT_STORE_ATTEMPTS`,
`LOCKOUT_IP_ATTEMPTS`, `LOCKOUT_WINDOW_SECONDS` and `LOCKOUT_SECONDS` tune them.
Reading follows the same codes as writing: the store PIN opens the Floor, and
Stockroom or Back dock data (snapshot, changes, the socket, history, export,
keycode life, manifests, profiles) reach a device only when it holds that
area's code or the manager code. The owner reads every entitled area.
New and rotated store PINs are 6 to 8 digits (`PIN_MIN_DIGITS`; the dev
store keeps 2468 with it set to 4). An events body is at most 8 MB and one
event's payload 2 MB; a device's `at` must be within 10 minutes ahead and 30
days behind the worker's clock or the event is refused as `clock_skew`.
An area or manager code lasts a shift (`ROLE_TTL_SECONDS`, 12 h); after that
the device keeps the Floor and asks for the code again. A manager's role
also goes on the idle re-lock and when another store is opened on the device.
A PC, which signs in with the manager code alone, then shows a Manager code
card at once (the shift ended, it sat idle, or another store was opened) and
carries on as before once the code is typed; a phone signed in as a manager
shows the same card and may carry on as a team member. The shell renews a
token in its last minute, so the card shows when the role goes, not at the
next write, and the idle re-lock counts input in any of the app's tabs. The WebSocket carries
its token as the second subprotocol (`conduit, <token>`), never in the URL.

## Catalogue

Product names and links come from Conduit's own catalogue object
(`worker/catalogue-object.js`), which reads Kmart's public product sitemaps:
the sitemap index first, lettered files when the index names none, one file
per alarm step, rows replaced per file, and a two-strike sweep before a
file's products are dropped (K2B's rules, ported). It reads weekly, Mondays
01:00 store time, and the owner console's Stores page shows the last build
with a **Rebuild now** button. Run it once after the first deploy.

Price, was, image and clearance come from the product page through
Cloudflare Browser Rendering (`worker/details.js`) once `CF_ACCOUNT_ID`
(variable) and `BROWSER_TOKEN` (secret) are set. Until the first build lands
and those are set, the legacy suite and details workers (`LOOKUP_URL`,
`DETAILS_URL`) answer instead; after that they can be removed from
`wrangler.toml`. `npm run dev` serves stand-in sitemaps on :8791.

Keycodes and product names work as in K2B and Decant Visualiser: a click
on a keycode (`kcCopy()`) copies it, a click on a product name
(`itemName()`, `nameHtml()`) opens its product page on kmart.com.au in a new
tab. Both live in `js/views/stockroom/common.js`; one capture-phase listener
(`installProductLinks()`, installed by the shell) handles them, so a row's
own tap never fires underneath. The page comes from the catalogue; a name
clicked before its lookup has landed asks on the click, and a code the
catalogue does not know opens the site's search for it.

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
The translations (`js/i18n/`, about 100 KB compressed a language) are left out
of the precache so an English device never downloads six dictionaries: a
device fetches its own language on first use into the release cache, a new
release fetches again the languages the old one held, and they count towards
the build id. A device switched to a new language while offline stays in
English until it is back online.

After changing any shell file run `npm run sw` and commit `sw-precache.js`;
the unit suite fails when it is stale. Netlify serves `sw.js` and the
precache list with `no-cache` so a device always sees the newest release.

## Stockroom

The Stockroom workspace is the first ported module with live users
(`js/views/stockroom/`). Its views run on the stockroom reducers that were
already in the log:

- **Backfill review** (`bfreview`): the desk. Phones scan bays; the desk
  pastes the SIM report (kept on the device under `simreport:<store>:<date>`
  and saved to the worker, `POST /v1/store/:no/backfill/report`, so the
  store's other desks and phones read the same one), compares every bay (add / delete /
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

**Map editing.** The map editor ships with Conduit at `editor/editor.html`
(ShelfSearcher's Map Editor v4.3, brought in and connected; decision 2).
It is the owner's: every call it makes needs the owner session, which it
shares with the console on the same device or signs in with the owner key.
The console's **Map editor** buttons open it on the store in view. From
the editor: **Open from Conduit** loads a store's map as last published
(the worker keeps the editor's own document beside each version it
publishes), **Conduit preview** draws it with the renderer that publishes
it, **Publish** checks it (unnamed shelves, names used twice on a floor,
no emergency markers or walk paths, floor ids) and sends it with the same
request the console and `publish-map` build (`publishBody` in
`shared/maprender.js`), and the **Suggestions** tab lists the store's
suggested edits and accepts or declines them (a Field Mode name finds its
unnamed shelf by floor and position). Field Mode files from Conduit merge by
shelf and floor. Publish warns when the store's map moved on after the draft
was opened from Conduit (`mapeditor-base-<store>`), as Apply to map does. **Auto-detect** (Settings tab), run on the
official layout at 100%: it learns the store's bay sizes (up to three)
from the bay dividers the layout draws and fits every shelf to whole
modules of one of them; a run two shelves deep becomes S1 and S2, and the
short boxes at its ends become E1 and E2, as the maps draw them; shapes
already under a drawn shelf are greyed, and **Next missed** steps through
the ones still undrawn. The geometry is `shared/detect.js`, unit-tested. The page runs under the site's CSP like the rest:
no inline code (`editor/handlers.js` binds what were inline handlers), the
icon font is a self-hosted subset (`vendor/tabler/`), and the service
worker leaves `editor/` to the network. Inside the store app there is only
**Suggest map edits** (Store section): anyone signed in taps a shelf and
suggests a new name or flags what is wrong (`map.edit.suggest`). A
suggestion never changes the map. The owner sees the queue on the store's
Map tab or in the editor's Suggestions tab, makes the change, publishes,
and accepts or declines it (`map.edit.resolve`, also open to a manager in
the store).

**Catalogue.** `GET /v1/catalogue?kc=` proxies two existing upstreams (the
suite lookup worker for keycode → name and product URL; the details worker
for price, was, image and clearance) and caches per keycode in the edge
Cache API: links for a week, details for a day, misses for an hour. The
device library (`client/catalogue.js`) batches lookups and keeps hits for a
week. The shell's search palette (Ctrl K and the header)
understands a keycode, a shelf such as A16 S2, a department and a tool, and
the store's records (`shared/finder.js`): manifests, consolidation labels
(the truck and bay a consol is on), cages, other loads and off-site
pallets, each opening its view on the item. On a phone the search bar is
typed into directly, as ShelfSearcher's was: a compact list of up to six
rows drops under it (a run such as A16 lists its shelves S1, S2, E1, E2 and
then the whole run; departments and micro-departments by code or name;
recent searches when the bar is empty), and one tap shows the result on the
map.

**Voice search** (phones and store PCs; decision 28). The microphone in
the search bar (the phone's, and the PC's top bar) and in the palette
listens for one shelf, run, bay or keycode,
as ShelfSearcher's did: the browser's recogniser in US English, its top
guess, spaces removed and number words made digits. Each guess is then
checked against the published map (`shelfForLocation`): the top guess wins
whenever it is a real shelf, so what worked in ShelfSearcher still does;
otherwise the recogniser's other guesses and the usual mishearings ("be 22",
"queue 15", "for" for 4) are tried, but only a real shelf is taken. A shelf
opens on the map; anything else opens the palette with what was heard. The
pick list has voice add on the phone and the PC ("Say it": say codes, "done"
to stop). Runs named by
digits alone are heard as they are said: "zero four side two", "oh four side
two" and "four side two" are 04 S2, and digits said one at a time are one
number ("seven zero one two" is the bay 7012). The reading is
`shared/voice.js` (unit-tested), the listening `js/voice.js`. Voice needs a
connection (the recogniser runs in the browser maker's service) and the
microphone allowed for the site; the button is hidden where the browser has
no recogniser (Firefox).

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

The colour scheme is fixed for every store device (managers share PCs):
charcoal rail and phone bars with the Lagoon accent, set in `js/prefs.js`.
The owner console keeps charcoal with Signal orange. Display size and the
collapsed rail are the only per-device appearance settings.

Floor views live on real data: Store map, Pick list, Location refresh, Label
integrity, Emergency, Maintenance, Stocktake, plus Dashboard (with the
Today at and logistics cards), Settings, Help (the tour) and Field Mode (a
manager checks each shelf against its label, names shelves the map has none
for, and sends the differences to the owner as suggested map edits with
`src: 'field'`; the export still writes a `field-capture/1` file).

The Inventory hub moved to the Back dock (23 Oct 2026): Off-site pallets
(`js/views/backdock/offsite.js`: the register by callback date, received,
the off-site master list import and the clearance watch, on the phone too),
other loads in Manifests (any sheet of pallets and keycodes, with a column
mapper) where a manifest's or a load's departments paint on the map, and
What arrived in Analytics (cartons a week by department, from finished
trucks). The `inventory.*` events and the `inventory` projection moved with
it to the Back dock area (the dock code or a manager); a device on an older
release still sends them as Floor, and the worker accepts that (`wasArea` in
`shared/catalogue.js`) and logs them as Back dock.

The owner's queue (console › Maps, and a store's Map tab) holds Suggest map
edits and Field Mode alike. **Apply to map** writes a rename or a name that
reads as a shelf code into the published map's editor source
(`applyEdit` in `shared/mapedits.js`), publishes it as the next version and
accepts the suggestion with that version, so the store has the change within
a minute and the phone that sent it shows it on the map. Anything else is made
in the map editor, then accepted. A map published from drawings alone has no
source to change.

On a phone the map modes (Home, Refresh, Labels, Route, Emergency,
Stocktake, Field Mode) give the map the screen: a dark strip above the tabs
says what the mode is doing and carries its main action (Scan or type,
Picked, Nearest exit, Mark checked), and its arrow opens the mode's panel as
a sheet over the map with everything in full: the shelf's department,
micro-departments, facts and status; the week's focus departments and the
shelves refreshed by department; each department's label progress and the
wrong labels; every route stop; a tile per kind of emergency marker with the
map's own symbol (a tap shows only that kind); the stocktake's shelves still
to count. Open or closed is kept per device. Maintenance is on a manager's
phone only (More, in every area): Report clears the map to pin the fault,
then the sheet takes what, where, type, urgency, a note and up to four
photos; an issue opens with its photos, log and actions (done, complete,
not fixed, reopen, show, edit, contractor visited). On a team member's phone
it is not listed, and a work-order link says it opens on a store PC.

A phone keeps to what a person on the floor does. Service dates and
history, store settings, the refresh focus and target, the map and its
symbols in Store details, and Field Mode stay on a store PC or behind the
manager code (`docs/TODO.md`, the manager phone login). The price-check size
is a map button (normal, large, hidden), as ShelfSearcher's was. More, in each area, says who is signed in, lists the area's
tools (each with a line on what it is for) and then the store and app, with
Switch area and Sign out side by side at the foot.

A shelf found by search, voice, a scan or a link is shown as ShelfSearcher
showed it (`map.locate`): the rest of the map dims, its outline pulses cyan
and magenta until something else is chosen, three rings ping out from it,
and it is framed to the screen (its longer side about 45% of the view, the
aisles around it in view, clear of the phone's open sheet).

The map (`js/map.js`) zooms with an eased animation, double-tap or
double-click (×1.8), Ctrl + / − / 0 and a pinch; a flick coasts. Price checks
open a card and cycle normal, large or hidden; tory lines switch on for a
back-of-house floor; an editor's department zoom box frames its department;
shelf tips and cards show the fixture, location range, shared names and, when
the map has a scale, the size in metres. `js/lowpoly.js` draws the sign-in
background from the accent and ground tokens; the sign-in is one card on it,
manager code only on a PC (the store PIN returns there only when the worker
predates manager sign-in) and Team member or Manager on a phone. `index.html`
paints a boot screen (the mark and a loading bar) until the app shows its
first screen, so the empty signed-in frame never shows while the scripts
load; the sign-in card then opens at once with the stores the device saw
last (`store_list`) and refreshes the list behind it, rather than waiting
on a worker that is waking up. Inter, the
face the tokens name, ships in `styles/fonts/` (variable weight, OFL) and is
precached with the shell, with its Vietnamese subset as a second face that
loads only for Vietnamese letters. `js/device.js` holds haptics
and the phone portrait lock.

### Languages

Every screen, on the PCs and the phones, comes in ShelfSearcher's seven
languages: English, Deutsch, Français, Filipino, Tiếng Việt, Español and
Italiano. Each device picks its own (Settings › Display, or the language
list under the sign-in card) and reloads in it; dates follow the language
through `Intl`. Interface text goes through `tx()` / `txn()` in
`js/i18n.js`, keyed by the English text; each language's dictionary is
`js/i18n/<code>.js`, one chunk per area, and loads before anything renders.
`npm test` fails when a key lacks a translation, a translation's
`{placeholders}` or markup differ from the English, or a dictionary keeps a
key nothing uses. Data stays as the store wrote it: shelf, bay and product
codes, product, store and department names, D-numbers, report codes (SOH,
PULL, GHOST…), anything a person typed, and the owner's map editor
(`docs/I18N.md`, with the glossary each language keeps to).

## Where things stand

Build order steps 2 (worker core), 3 (client library) and the shell with the
Floor views are in, and every type in the catalogue has a reducer. Shapes follow the legacy modules, ported faithfully:

| Area | Reducers | Ported from |
| --- | --- | --- |
| Floor | refresh (segments, focus, plan paint), labels (cycle, assign, check, variance), stocktake (sessions, state advances, verify), issues (log, progress, close, reopen), assets (service, schedule), pick list | ShelfSearcher refresh, label-integrity, stocktake, maintenance and em-service modes |
| Stockroom | cages with ring colours, backfill submissions (pending, corrected, submitted; requested list; claims; rename), negative-SOH adjustments, day list | K2B review, adjust and scan modules |
| Back dock | trucks (staged, live, closed) with team and halts, manifests keyed by the last 9 digits, pallets (chep, loscam, bulk) with segments and scans, planner slots 1 to 4 and days confirmed without trucks (`plan.noTrucks`: the morning checklist reads them as done; planning a truck or one arriving clears it) (a staged manifest is a reference: number, counts and consol ids; the device that starts the truck attaches the report from the library), history rows on finalise; off-site pallets and other loads (`inventory.*`: register set, add, update; loads add, status, remove; Floor events until 23 Oct 2026) | Decant Visualiser receiving, manifests, planner, history; ShelfSearcher inventory mode |
| Store | map publish, roster rotation marker, settings, tools, map edit suggestions, feedback (device presence is a projection written directly from the socket `hb` frame or `POST /hb`, not an event) | |

A catalogued type without a reducer would be rejected `not_implemented`; the
unit suite asserts there are none.

**Event times.** Every event is stamped on the worker's clock (decision 31):
the worker sends its time with heartbeats (the socket's `clock` frame, `POST
/hb`) and with submits and `/changes`, and each device corrects new events by
the measured offset, kept so an offline device still stamps on the store's
clock. Receiving warns when a device's own clock is a minute or more out.

**Paper.** Sheets are real A4 layouts (`js/print.js`), not a print of the
screen. Maps print from a copy of the published map (`js/printmap.js`): the
**Print map** composer (ShelfSearcher's, with floors, area, layers, mode
details, A4/A3 and orientation) and its department booklet; the
**evacuation map** from Emergency (each floor, a key of its signs, 000, the
assembly point, "You are here" when a route is shown, and the equipment
walk sheet); and the Maintenance **work order**, whose QR code opens the
issue (`?store=1241&issue=…`) and whose visit comes back as `issue.visit`.

**The dock tablet.** The Dock screen is the crew's: tap a pallet for Start
or Resume (pick who from the team), Pause, Done, Join or Hand over, with the
finish guard, as Decant Visualiser's dock tablet. Landing, removing, editing
and finalising stay in Receiving, which on the phone also has Team & plan
(roles, breaks, the huddle, the plan) and Complete decant (keep the
unfinished pallets as rollover, or clear the dock).

**Dock screens sign in as a screen.** A wall or a tablet on the dock signs
in with the PC sign-in's **Dock screen** choice: the store PIN and the Back
dock crew code, never the manager code (a manager or Stockroom code there is
refused and leaves no session). It holds the Floor and Back dock roles only,
opens on the Dock screen, shows no What's New pop-up and is exempt from the
idle re-lock; the crew code still lasts a shift (12 hours), like any code.
