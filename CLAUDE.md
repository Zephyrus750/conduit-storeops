# Conduit — project rules

Unified store-ops program: one Cloudflare worker, one shell, one event log
per store. Replaces ShelfSearcher, Decant Visualiser and K2B; retires the
Vector chassis. Design of record: the "Conduit Backend Design" doc; UI of
record: the "Conduit Shell Swap" showcase (docs/showcase in vector-suite).

## Non-negotiables

1. **One write path.** Every change is an event through `shared/validate.js`
   and `shared/reducers.js`. No side tables, no direct state edits.
2. **Shared reducers are pure and shared.** `shared/` runs on the device too:
   no worker imports, no Node APIs, no I/O. Validate before mutate so a
   rejected event leaves state untouched.
3. **Nothing silent.** Unknown types → `invalid_event`; catalogued types
   without a reducer → `not_implemented`; unbuilt routes → `501` with the
   route named. Never log an event that has no effect.
4. **Actor from the token.** The worker sets `actor` from verified claims.
   Devices never assert their role.
5. **Events are never deleted.** Corrections are new events.
6. **One shell, tokens not layers.** When the shell lands: one frame, one
   stylesheet set, container queries for size, appearance as CSS tokens in
   Settings. No legacy-shell toggle, no body-class layering, nothing copied
   from Vector's stylesheets.
7. **Brand-neutral keys.** No product name in storage keys, cache names or
   schema ids.
8. **Zero-build.** Plain ES modules for worker and client. wrangler deploys
   the tree as written.

## The shell (index.html, js/, styles/)

- Views register in `js/registry.js` and render into `#content`; a view gets
  `ctx = { store, session, storeNo, storeName, isMobile, go, rerender, signOut }`
  and returns unsubscribe functions from `mount`. Listeners go on the root the
  shell hands you; the shell replaces that element on every navigation.
- `styles/shell.css` and `tokens.css` are generated (`npm run css`) from the
  showcase in vector-suite; put app-only rules in `styles/app.css`.
- Rendering is innerHTML; every value from another device goes through `esc()`.
- The map is `js/map.js`: mount, pan/zoom, select, marks, pins, routes.

## Working here

- Tests: `npm test`. Contract tests run the worker in workerd via Miniflare
  with SQLite-backed Durable Objects; keep them green before any push.
- Compatibility date follows the local workerd build (see wrangler.toml).
- Secrets: `TOKEN_SECRET`, `OWNER_KEY_HASH` (from `npm run hash-secret`).
  Never in source, never in tests except throwaway values.
- Reducer conflict rules live in the reducers test and the design doc:
  first `at` wins on refresh marks, `bay_occupied` on a second land, second
  `pallet.done` is a no-op, reopen beats a stale submit.
- Adding an event type: catalogue entry (area, roles, entity keys, payload
  shape) + reducer + unit test. Adding a route: handler + contract test +
  README table row.
- Browser checks (Playwright, `/opt/pw-browsers/chromium`, `--no-sandbox`):
  1920×1080 first — the store PCs are 1080p panels and the shell's wide
  layout starts at 1600px — then 1440×900, 960×1040 half-screen and
  420×860 phone. A shell change passes all four.

## Service worker

- `sw.js` installs the whole shell as one release cache and serves it cache-first; updates apply only on the person's "Update now" (never `skipWaiting` on install).
- After any change under index.html, js/, client/, shared/, styles/, icons/ run `npm run sw` and commit `sw-precache.js`; `npm test` fails when it is stale.
- Maps, snapshots and the outbox are IndexedDB data, not app files; the worker API is never cached.

## Map performance rules (learned on the 1,157-shelf Busselton map)

- One live map element. `js/map.js` builds the SVG once per published
  document and views share the same element (`parkMap()` runs before the
  shell replaces a view's content); the search palette's preview reuses
  a second one. Never `innerHTML` the map per view: parsing 800 KB and the
  first layout and paint of fresh nodes cost 700 ms or more.
- No `transition` or `filter` on `.shelf`. A state that lands on hundreds
  of shelves at once (refresh marks, a route) re-rasters the whole map
  for every frame of a transition. Stroke and fill changes alone are cheap.
- Module labels are `display:none` while the badges show; two thousand
  invisible `<text>` elements still cost layout and paint.
- Sub-shelf codes: `groupsFor()` in `js/map.js` is the one resolver for a
  typed or scanned location. "A16S1", "A16 S1" and "A16-S1" name one
  module; never widen a module to its shelf.
