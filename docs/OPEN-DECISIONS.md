# Open decisions and the test pass (kept 2026-10-05, updated 2026-10-09)

Every call below is still open unless its row says **Decided**. On
2026-10-22 1 (the `P` suffix) and 16 (languages) were answered and built. On
2026-10-09 the suggested defaults were taken for 19, 20, 30, 31 and 32, and
28 was answered "port it". What is left to build, and which of these
each piece waits on, is in `docs/TODO.md`. Each one says what Conduit does today (the
default it ships with), where that lives, and what to look at when testing
on a real PC. Decide each one, then move it to the audit's §7
(`docs/AUDIT-2026-09.md`) as "Decided" and change the code if the answer
differs from the default.

## Store data and set-up

| # | Decision | What Conduit does today | Where | How to test |
|---|---|---|---|---|
| 1 | What the `P` suffix on shelf codes means | **Decided 2026-10-22, built:** a permanent end, an end whose set-up rarely changes; some stores label it `16P1` where others say `16E1`. `P1`/`P2` work as `E1`/`E2` do everywhere: typed, scanned, spoken ("16 permanent 1"), searched, sorted after the ends, and drawn in the editor (Permanent ends tags) | `js/map.js` `splitCanon`, `shared/voice.js`, `editor/editor.js` | Type or scan `16P1` on Refresh or Stocktake and see the shelf |
| 2 | Where the map editor lives (`MAP_EDITOR_URL`) | **Settled 2026-10-09:** it ships with Conduit at `editor/editor.html`, owner only, publishing straight to the worker | — | Open it from the owner console's Map editor button |
| 3 | Busselton's assembly point, address, hours, holidays | Blank in the export | Map editor › Store Info, then republish | Emergency › Nearest exit shows the assembly banner; the store chip shows details |
| 4 | Stairs nodes for cross-floor routes | Busselton's walk paths have none, so a pick list cannot cross floors | Map editor walk paths, `stairs` node type | A pick list with stops on Ground and BOH routes via the stairs |
| 5 | The retail-week anchor | Vector's 48-week cycle from Mon 29 Jun 2026 (drifts after a year) | `shared/time.js` `RETAIL_ANCHOR` | Footer and dashboard show P?W?; check against the real calendar |

## Rules and limits

| # | Decision | What Conduit does today | Where | How to test |
|---|---|---|---|---|
| 6 | Deleting history (rule 5: events are never deleted) | Deletes are correction or tombstone events (`submission.delete`, `issue.remove`, `manifest.remove`, `soh.remove`); nothing leaves the log | reducers per area | History › delete a record, then confirm it is gone from views but the event is in the owner's event log |
| 7 | Overdue targets for issues | Low 14 / Medium 7 / High 3 / Urgent 1 days | `js/views/maintenance.js` | Maintenance SLA chips and "overdue" counts |
| 8 | Keeping issue photos | 90 days after the issue closes, then a nightly sweep deletes them | `worker/store.js` `sweepPhotos` | Needs the R2 bucket; add a photo, close the issue |
| 9 | SOH snapshots kept | The newest 26 (about six months of weekly pastes), on the server, shared by every desk | `shared/reducers/stockroom.js` `SOH_KEEP` | Stock intelligence › Snapshots list |
| 10 | When a cage counts as lost | Missing after one sweep without it, lost after two in a row; found again when scanned | `shared/reducers/stockroom.js` `cage.sweepEnd` | Phone: Cages › Sweep, start, skip a cage, finish twice |
| 11 | Quick Scan / Barcode list storage | Device-local scratch list, never shared, never touches backfill | `js/views/stockroom/codelist.js` | Build a list on one device, open another: it is not there |
| 12 | Eight-digit codes | Always a keycode, never an EAN-8 item barcode | `shared/gs1.js` | Scan an item barcode onto a cage: it asks for the keycode once, then remembers |
| 13 | Screen scan's security relaxation | CSP allows `'wasm-unsafe-eval'` so the self-hosted OCR compiles; no eval, no inline script | `netlify.toml`, `test/unit/sw.test.js` | Screen scan on the real SIM window; the browser console shows no CSP errors |
| 14 | Read access with the store PIN alone | Stockroom and back-dock data need their code to read | `worker/store.js` `needArea` | Signed in with the PIN only, Stockroom views ask for the code |

## Product scope

| # | Decision | What Conduit does today | Where |
|---|---|---|---|
| 15 | Scan-only phone mode (K2B's "skip sign-in") | Not built: every device signs in | — |
| 16 | The seven-language UI from ShelfSearcher | **Decided 2026-10-22, built:** English, German, French, Filipino, Vietnamese, Spanish and Italian on every screen of the PCs and phones, chosen per device (Settings › Display, or the sign-in card). Data, codes and the map editor stay English (`docs/I18N.md`) | `js/i18n.js`, `js/i18n/` |
| 17 | K2B's app hub (`registry=apps`), feature flags, beta rings | Not built | — |

## Access and the owner console (added 2026-10-08)

| # | Decision | What Conduit does today | Where | How to test |
|---|---|---|---|---|
| 18 | How fine the tool switches are | 21 tools. Receiving, Team Board and Dock screen are one tool; Wallboard and Analytics are one; Backfill review and its History are one. The store map, Settings, Store details and the workspace homes cannot be switched off | `shared/tools.js` | Console › a store › Access: switch one off, watch a signed-in store device lose it within seconds |
| 19 | Switching a whole area off |  **Decided 2026-10-09 (default), built:** it applies at once, like tools: the console logs `store.areas.set` into the store and devices follow in under a second  | `worker/registry.js`, `worker/index.js` | Turn an area off and see how long a signed-in device keeps it |
| 20 | Who may publish a team message |  **Decided 2026-10-09 (default), built:** managers and the owner (`team.message.set`, `team.briefing.set`)  | — | — |
| 21 | What the console flags as set-up | No map; no stockroom bay ranges; no manifest yet; two trucks open; no device ever or none in 24 hours; device errors; changes stuck in outboxes; bays auto-closed yesterday (shown as information) | `shared/kpis.js` | Console Overview's Set-up column and a store's Overview |
| 22 | Fleet's "newest" app version | The highest version string any device reported in the last day; others show as behind | `js/views/admin.js` `fleetCard` | Open the console with two devices on different releases |

## Floor P2 (added 2026-10-08)

| # | Decision | What Conduit does today | Where | How to test |
|---|---|---|---|---|
| 23 | Where the inventory hub keeps its data | The off-site register and loads are store events, shared by every desk (legacy kept loads on one device). The clearance watch's prices stay on each device | `shared/reducers/floor.js` `inventory.*`, `js/views/backdock/offsite.js` | Import the off-site list on one PC, open Off-site pallets on another |
| 24 | Field Mode's export format | `{ kind: 'field-capture', version: 1, … }`. Legacy wrote `shelfsearcher-field-capture`, which names the product (rule 7). The map editor has to accept the new kind | `js/views/fieldmode.js` | Export from a phone, import in the editor |
| 25 | The portrait lock | Phones (short side under 600 px) lock to portrait in the installed app; tablets and the dock screen rotate. Settings › Scanner and feedback › Rotation turns it off per phone | `js/device.js` | Install on a phone and turn it; then a tablet |
| 26 | Heat with no shelves assigned | A department with no Label-integrity shelves spreads over its whole sub-department; legacy painted nothing for it | `js/views/backdock/loads.js` `paintMap` | Manifests › a load › Whole load heat, before and after assigning shelves |
| 27 | The map scale | Shelf sizes and pick-list metres show only when the editor's Set Scale is saved (`metresPerUnit`); no shipped map has one, and nothing is guessed | `js/map.js` `shelfDetail` | Set the scale, republish, open a shelf card |

## From the October audit (added 2026-10-08)

| # | Decision | What Conduit does today | Suggested | Where |
|---|---|---|---|---|
| 28 | Voice search and pick-list dictation (ShelfSearcher had both) |  **Decided 2026-10-09: ported.** Voice search on the phone and, since 21 Oct, on store PCs with a microphone (the microphone in the search bar and the palette) and voice add in the pick list (the phone's, and since 21 Oct the PC's), ShelfSearcher's recipe checked against the map (`shared/voice.js`). Needs a connection and the microphone allowed (`Permissions-Policy` now `microphone=(self)`)  | Drop for now; the floor scans | `js/search.js`, `js/views/picklist.js` |
| 29 | How long closed trucks, backfill bays and inventory loads stay in the live state | The suggestion, applied as the default (nightly `store.retain`); History reads the worker's archive for older rows | Full detail 14 days, summary rows 60 days, older on the worker only | `shared/retain.js` (`KEEP_DETAIL_DAYS`, `KEEP_DAYS`) |
| 30 | Finalise with pallets left |  **Decided 2026-10-09 (default), built:** Complete decant offers "Keep as rollover & close" or "Clear the dock & close", as DV did  | Offer hold or clear the dock, as DV did | `js/views/backdock/receiving.js` |
| 31 | Whose clock times dock work |  **Decided 2026-10-09 (default), built:** every event is stamped on the worker's clock: the worker sends its time, each device corrects by the measured offset (kept for offline use), and Receiving warns when a device's clock is a minute or more out  | Stamp on the worker | `worker/store.js`, `shared/reducers/backdock.js` |
| 32 | Label integrity on the phone |  **Decided 2026-10-09 (default), built:** a tap on the phone opens the micro-department the shelf is on and never assigns. On a desk, assigning is its own mode (Assign shelves, or Settings › Departments); a selected micro-department is otherwise checked  | Phone checks only; assigning stays on the desk | `js/views/labelint.js` |
| 33 | The map's scale in metres (`metresPerUnit`) | No store has one, so shelf sizes, route metres and evacuation distances never show in metres. Each map is drawn over the store's official layout imported at 100%, shelves auto-detected then finished by hand; shelving comes in about three module sizes, so a module count is not a ruler (map editor audit 1.7) | Use the official layout as the ruler: on one store, measure a known distance on the layout at 100% (a dimensioned wall or the plan's scale bar) once; every layout imported the same way shares that scale | `shared/maprender.js`, the editor's Set Scale |

## The Visual Guide (added 2026-11-07)

| # | Decision | What Conduit does today | Where |
|---|---|---|---|
| 34 | How the guide shows screens | **Decided 2026-11-07:** drawn by hand in HTML, as now, not recorded from the real app. The drawings are brought up to date with the real screens and gain features (What ifs, camera scanning) as they are added. `scripts/guide/` captures the real screens to check a drawing against | `js/guide/scenes.js`, `scripts/guide/` |
| 35 | The store the guide and its showcase show | **Decided 2026-11-07:** Busselton 1241 with its real map; the day itself (trucks, manifests, pallets, D-numbers) is made up | `js/guide/scenes.js` |
| 36 | Numbers in the showcase's "What it changes" | **Decided 2026-11-07:** figures like a real store's (clear times, cartons an hour, shelves refreshed), from the demo day and labelled as a demo day, so nobody reads them as Busselton's own results | — |
| 37 | When the new guide reaches Help | **Decided 2026-11-07:** it is worked out on a private review page first; Help changes only in a final PR once it is approved. **2026-11-08:** the first eight chapters approved and moved into Help with their translations; the rest are drawn the same way, one draft at a time. **2026-11-09:** the other nine approved and moved in (Live pull with a bigger pick; the PC's Receiving chapter became Entering a truck from paper, for a truck the dock phones couldn't take): every chapter is now drawn at the app's real sizes | `js/guide/chapters/`, `scripts/guide/draft/` |

## The Stocktake calls of 9 and 10 Nov 2026 (D7–D9, D11–D14)

| # | Decision | What Conduit does today | Where |
|---|---|---|---|
| 38 | Off-site pallets by manifest (the 6 Nov off-site design, boards 5–7) | **Decided 2026-11-09, built:** every pallet in storage is a row on the one off-site register. A whole truck marked off-site lists its consols there under its manifest, and so do pallets a manager sends from the dock at Receiving (`pallet.offsite`): the truck closes without them, tagged *Part off-site · n of N*. The register reads **By manifest** (with off-site loads and the other pallets) or **By callback date**. **Call back** (on the register and the Planner's *Off-site, to call back* card) plans a truck that names the pallets it brings back (`plan.set` `pids`/`load`). A whole truck called back whole has its manifest staged. Each pallet is ticked Received as its label is scanned on any later truck, and that truck says *From off-site · sent …, n of N back*. Diverted manifests stay off the register. | `shared/offsite.js`, `js/views/backdock/offsite.js`, `callback.js`, `offsend.js` |
| 39 | Where the decant starts | **Decided 2026-11-09, built:** only in Decant, at Take 5. The New truck sheet has no Decant start box. A truck that is received (layout confirmed) but not yet decanting shows *Received* done and *Decanting* next on the phase track. | `shared/dockphase.js` `phaseSteps`, `js/views/backdock/phase.js` |
| 40 | A manifest whose truck is cleared but not closed | **Decided 2026-11-09 (the suggested option, as built):** Manifests shows it as Decanting until the truck is closed at Receiving. | `js/views/backdock/manifests.js` |
| 41 | Four small calls from the Stocktake (D11 to D14) | **Decided 2026-11-10, built (D14 scheduled):** (D11) Cages on the PC: the Activity feed says *this device* or the role a line was written with (each cage log line now keeps it), never a raw device id, and its Missing label is the cage's own word. *Last sweep* is the last sweep's own count (the one running, else the last finished), not every sighting that day. One rule says which cages a sweep counts, for the phone, the PC, Finish's confirm and the sweep's summary (`inSweep` / `sweepCount`): the cages open when it began, plus any opened since that it has seen. A cage opened during the sweep is not missed and not on the phone's list (a note says so), so Finish's confirm names exactly the cages it marks missing. (D12) A reopened fault's repair target restarts from the reopen; Logged keeps the first day, and the issue shows when it was reopened. (D13) `cage.scan` takes a keycode of 6 to 9 digits (`isKeycode`), like every screen; an item barcode goes on as its keycode with the barcode in `apn`. Older events with longer codes are refused if a store's state is ever rebuilt from its log. (D14) The confirm sheet's second pass (the remaining `confirm()` and `prompt()` boxes) goes in with the next tidy-up batch. | `js/views/stockroom/cages.js`, `shared/reducers/stockroom.js`, `shared/reducers/floor.js` `issue.reopen`, `js/views/maintenance.js` |

## The test pass on a real PC (1920×1080 first)

Use store 1241 Busselton with the real map. Things only a real desk, real
reports and real devices can show:

1. **Screen scan on the real SIM screen.** It was only proven on a rendered
   report. Draw the box on Location + Keycode, test read, read while
   scrolling, save the store preset, then a second desk at the same size
   should pick the preset up. Then the SOH rows mode from Stock intelligence.
2. **A real SOH report paste** into Stock intelligence: rows found, unknown
   codes, REQ / PRE / MISSING, then four weekly pastes for the classes.
3. **Day list on paper:** print the triage sheet; the barcodes scan on the PDT.
4. **A real DC manifest** (.xls): publish, attach late, link pallets,
   explorer tabs, phone Search.
5. **Back dock live:** Take 5, queues, wallboard on a wall screen, analytics
   after a few real trucks, reopen a truck.
6. **Cage tags:** print, laminate, scan on a phone; a sweep with zones.
7. **Phone sizes:** a TC52x (360×640) as well as 420×860.
8. **Owner console:**
   - The per-store numbers against what you know happened that day.
   - Switch a tool off with a store device signed in and watch it go.
   - Export the registry CSV and open it in Excel.
9. **Manifest upload preview:** a real DC `.xls`, including a report saved for the wrong store.
10. **Off-site pallets and loads:** the real off-site master list (.xlsx), a real manifest's Departments on the map, a CSV load with heat on the map, and the clearance watch once product details are switched on. Then a real truck with no room: send two pallets off-site from the grid, call them back on the Planner and scan them on the truck that brings them back (decision 38).
11. **Map chrome:** double-tap, pinch and flick on the TC52x; Ctrl + / − / 0 on the PC; the symbols key; the price-check size cycle; tory lines on the BOH floor.
12. **Field Mode** on a phone with the manager code: capture a few shelves, export the file.
13. **The TC52x** with the browser's address bar showing (360×584): the map, Refresh, Labels, Emergency, Backfill scan and Land a pallet.
