# What's left (kept 2026-10-08, updated 2026-10-09)

Done so far: every P0 and P1 list, the Back dock, Stockroom and Floor P2
lists (Floor except the languages and the `P` suffix), the manifest upload
preview, the owner-console access items (per-tool switches, console numbers,
Fleet, registry filter and export), the 360×640 layout and the sign-in
background. The audit
(`docs/AUDIT-2026-09.md` §5) has a status note per area.

The decisions these wait on are in `docs/OPEN-DECISIONS.md` (numbers in
brackets below).

**October audit (`docs/AUDIT-2026-10.md`):** its §1 fixes (data safety), the wrong numbers, step 3 (the Floor workflow), step 4 (the dock floor), step 5 (printing) and step 6 (search, the importers) are done: its §8 order is complete (see its status note). Its §5 code health is done too (sockets, photo deletes, size caps, time zones, phone cost, the low items and the seven tests), and so are the rest of §3 Stockroom and §4 Back dock. Nothing from that audit is open.

**Map editor (`editor/`, `docs/MAP-EDITOR-AUDIT-2026-10.md`):** brought into Conduit and connected (decision 2 settled); the audit's status note lists what is fixed. Left: the scale (decision 33).

## Built 2026-10-09 (the defaults taken)

- **Areas switch at once** (decision 19): the console logs `store.areas.set`
  into the store (worker only). The store object narrows every token's
  areas to the store's at once, for writes, reads, broadcasts and open
  sockets. Devices renew on hearing it: the rail, the views and the data
  follow in under a second.
- **Team communication** (decision 20: managers and the owner publish):
  - a team message (optionally until a date) and the day's briefing, in a
    strip above every view;
  - read in full from the strip; managers write them there;
  - plain text, cleaned in the reducer; `**bold**` and "- " lists are
    rendered after escaping.
  - **What's New** opens once per device after an update, with "Show me";
    it is also on Help.
  - **First-run walkthrough:** the tour for the Floor, and four cards each
    for the Stockroom and the Back dock, the first time a device enters
    that area.
- **Owner console:**
  - a **Boards** tab per store (its Wallboard and Team Board, read-only,
    every 30 seconds);
  - a **Service** page: worker version, bindings and secrets as set or not,
    the catalogue build, each store object's size, last event, nightly run
    and next alarm, and the last 100 errors the worker recorded (now kept
    in the registry);
  - a **Maps** page: every store's map, Open editor, and the suggestions
    from every store in one queue.

- **The phone never talks about the desk** (2026-10-09): Inventory,
  Manifests, Carton profiles, Planner, Analytics, Print map, Trends and
  Stock intelligence are desk-only views (`deskOnly`): they are off the
  phone's menus and search, and a link to one on a phone goes home. Phone
  notes, hints, Help, the tour and What's New no longer mention the desk.

## Next to build

1. **Floor leftovers, both waiting on you:** the seven languages if they
   are wanted (16; today English only), and the `P` suffix once its meaning
   is known (1; today part of the code).
2. **Importer gaps** (only if the legacy data matters):
   - K2B: the department map, the announcement, screen-scan presets, the back-of-house map, earlier days' negative SOH and its desk's SOH snapshots (not on the worker). History codes import right since October.
   - DV: anything still missing once a real store is imported.

## Things only you can do (deploy and set-up)

- Create the R2 buckets once: `npx wrangler r2 bucket create store-photos-staging` and `npx wrangler r2 bucket create store-photos`.
- Set `CF_ACCOUNT_ID` (variable) and `BROWSER_TOKEN` (secret) for product details, then run the first catalogue build from the console.
- In the map editor's Store Info, fill in Busselton's assembly point, address, hours and holidays, then republish (3).
- Give each floor's walk paths a `stairs` node so pick lists can cross floors (4).
- Enter the stockroom bay ranges in Settings › Store; the console flags every store without them.
- Set `RETAIL_ANCHOR` in `shared/time.js` once the real retail calendar is known (5).
- Set the map's scale in the editor (Set Scale) and republish, so shelf sizes and pick-list distances show in metres (27).
- Add the store's price checks and department zoom boxes in the editor if you want them on the map; none of the shipped maps has any.
- Run the real-PC test pass at the end of `docs/OPEN-DECISIONS.md`.
