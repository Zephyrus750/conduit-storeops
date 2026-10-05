# Open decisions and the test pass (kept 2026-10-05)

Every call below is still open. Each one says what Conduit does today (the
default it ships with), where that lives, and what to look at when testing
on a real PC. Decide each one, then move it to the audit's §7
(`docs/AUDIT-2026-09.md`) as "Decided" and change the code if the answer
differs from the default.

## Store data and set-up

| # | Decision | What Conduit does today | Where | How to test |
|---|---|---|---|---|
| 1 | What the `P` suffix on shelf codes means | Treated as part of the code; no legacy app handled it | `js/map.js` `canonCode`, `groupsFor` | Scan or type a P-suffixed label on Refresh or Stocktake and see which shelf it finds |
| 2 | Where the map editor lives (`MAP_EDITOR_URL`) | Blank: the console's Map editor buttons have nowhere to go | `js/config.js` | Set it, open the owner console, use Map editor |
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
| 16 | The seven-language UI from ShelfSearcher | Not built: English only | — |
| 17 | K2B's app hub (`registry=apps`), feature flags, beta rings | Not built | — |

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
