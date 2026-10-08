# What's left (kept 2026-10-08)

Done so far: every P0 and P1 list, the Back dock and Stockroom P2 lists, the
manifest upload preview, and the owner-console access items (per-tool
switches, console numbers, Fleet, registry filter and export). The audit
(`docs/AUDIT-2026-09.md` §5) has a status note per area.

The decisions these wait on are in `docs/OPEN-DECISIONS.md` (numbers in
brackets below).

## Next to build, in the suggested order

1. **Make switching an area off as live as switching a tool off.** Turning
   the Stockroom or Back dock off for a store reaches devices when their
   token renews (up to 12 hours); tools already apply at once. Same
   mechanism: log it into the store. Needs: decision 19.
2. **Team communication** (Shell P2): a team message and daily briefing per
   store (published by a manager or the owner, sanitised), What's New with
   short guides per release, and a first-run walkthrough. Needs: who may
   publish a message (20).
3. **The 360×640 layout** for the TC52x phones the showcase targets, and the
   low-poly sign-in background. Needs: a TC52x to test on, if you have one.
4. **Owner console, the rest:** a Boards tab (each store's wallboard and
   Team Board read-only), a Service page (worker version, catalogue, R2,
   cron runs, errors), and a map editor page that folds in the suggestions
   queue. Needs: decision 2 (where the editor lives).
5. **Floor P2** (the largest list):
   - **Map chrome:**
     - a price-check sheet;
     - tooltips on markers and landmarks;
     - fixture type and shared name in the shelf card;
     - "7001-03" range badges and department zoom boxes;
     - double-tap zoom, Ctrl +/−/0, inertia and animated transitions;
     - a symbols legend and real-world shelf size.
   - **Dashboard:** a combined map with layer chips, "Today at" tiles and logistics cards.
   - **Inventory and pallet hub:**
     - an off-site master register and returns by callback date;
     - a generic CSV import with column mapping;
     - consolidation and heat paint on the map;
     - trends and a clearance watch.
   - **Field Mode,** haptics, portrait lock, and help with a tutorial.
   - Needs: decisions 1 (the `P` suffix) and 16 (languages); the inventory hub needs a sample of the files it would import.
6. **Importer gaps** (only if the legacy data matters):
   - K2B: the department map, the announcement, screen-scan presets, the back-of-house map, earlier days' negative SOH, and history scanned flags.
   - DV: anything still missing once a real store is imported.

## Things only you can do (deploy and set-up)

- Create the R2 buckets once: `npx wrangler r2 bucket create store-photos-staging` and `npx wrangler r2 bucket create store-photos`.
- Set `CF_ACCOUNT_ID` (variable) and `BROWSER_TOKEN` (secret) for product details, then run the first catalogue build from the console.
- Set `MAP_EDITOR_URL` in `js/config.js` (2).
- In the map editor's Store Info, fill in Busselton's assembly point, address, hours and holidays, then republish (3).
- Give each floor's walk paths a `stairs` node so pick lists can cross floors (4).
- Enter the stockroom bay ranges in Settings › Store; the console flags every store without them.
- Set `RETAIL_ANCHOR` in `shared/time.js` once the real retail calendar is known (5).
- Run the real-PC test pass at the end of `docs/OPEN-DECISIONS.md`.
