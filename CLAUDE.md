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
