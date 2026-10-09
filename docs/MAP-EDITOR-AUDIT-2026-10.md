# Map editor and Conduit: what passes between them (October 2026)

Run on 2026-10-09. Compares two sides:
- **The editor:** ShelfSearcher's Map Editor v4.3 (`SHELFSEARCHER-CK-V2/shelfsearcher/editor/`). The copy in `vector-suite/editor/` is older and has nothing this one lacks.
- **Conduit's viewer:** the publish pipeline (`shared/maprender.js`, `shared/svgsafe.js`, `worker/store.js` `publishMap`) and every view that reads the published map.

## Status (2026-10-09)

The editor now ships with Conduit (`editor/`, owner only; decision 2) and
publishes straight to the worker. Fixed:
- **§1**
  - 1.1 inactive shelves: drawn, but out of every list, count and route.
  - 1.2 modules on the card and tip.
  - 1.3 stairs and lift links kept and routed through.
  - 1.4 floor levels kept.
  - 1.5 marker ids: service history follows the marker, and old history
    moves over on its next service.
  - 1.6 shared names.
  - 1.8 notes.
  - 1.9 zoom-box labels and boundary breaks in the backup.
- **§2:** every file draws from its arrays. 2.2 angled shelves from `.js`
  files, and the missing-module default of 3. 2.3 one document for every
  output. 2.4 publish shows what the sanitiser removed, with one floor rule.
  The renderer matches the editor's own drawing for all 4,616 shelves of the
  five stores.
- **§3:**
  - 3.1 the editor merges Conduit's Field Mode files, which now carry the
    floor.
  - 3.2 the editor's Suggestions tab works through Conduit.
  - 3.3 hosted.
  - 3.4 Publish from the editor, with checks.
- **§4:** the editor's dropdown and duplicate bugs, path-id collisions,
  six-way zoom.

Still open: the scale (1.7, decision 33); store details `orientation`
(1.10); maintenance and cage pins tied to raw coordinates.

## How the audit was done

- **Code reading:** both sides were read field by field.
- **Real files:** the five stores the editor has exported (Rockingham 1039, Bunbury South 1187, Eaton Fair 1235, Busselton 1241 and Pinjarra 3320) were run through Conduit's renderer and the worker's sanitiser. Each went through twice: as the `.js` file and as the `.json` backup.
- **Words used:** a **shelf** is "A16 S2". A **run** is "A16". **Modules** are the editor's count of units inside one shelf.

## How a map travels today

1. **The editor saves two files.**
   - The **`.js`** map file carries the structured arrays plus a floor picture the editor has already drawn (`svg`).
   - The **`.json`** backup has no picture. It keeps some fields the `.js` file drops, and drops some the `.js` file keeps.
   - There is no publish button: the owner downloads a file and uploads it in Conduit's console (Map tab).
2. **Conduit reads either file.**
   - From a `.js` file it **keeps the editor's drawing** for shelves, landmarks and walls.
   - From a `.json` file it **draws the floor itself**.
   - Either way, it redraws emergency markers, price checks and zoom boxes from the arrays.
   - The worker's sanitiser removed nothing from any of the five stores.
3. **After publishing, every Conduit view reads only the drawn map** (its `data-*` attributes). The only structured data kept beside it is departments, store details, the scale and walk paths. A field reaches staff only if it becomes an attribute.
4. **What comes back to the editor:**
   - Field Mode captures (a file the manager downloads).
   - Suggested map edits (a queue in Conduit's owner console).

   Neither reaches the editor today (see §3).

## 1. Made in the editor, never seen in Conduit

| # | What | Editor | Conduit | Effect | Fix |
|---|---|---|---|---|---|
| 1.1 | **Shelf "not in use"** (`inactive`) | Set per shelf. 14 shelves are inactive across 3 stores. | Drawn faint (25% opacity) with no attribute. | Inactive shelves can be tapped. They count in Stocktake, Refresh, Label integrity and store totals. A stocktake can never reach 100%. | Both renderers write `data-inactive`. Conduit leaves those shelves out of counts and lists, and says "not in use" on the card. |
| 1.2 | **Modules** (units in a shelf) | `modules` on every shelf: A22 S1 is 7. | Used only for drawing the size. | The card can't say "A22 S1 · 7 modules". Stock and label work has no bay count. | Both renderers write `data-modules`. The card and tip show it. |
| 1.3 | **Stairs and lift links between floors** | Walk-path nodes carry `links` to the matching node on another floor, plus types `entrance` and `lift`. | The worker keeps only `id, x, y, type` for each node and drops `links`. Routing pairs stairs by nearest position. | A multi-floor pick route or evacuation can use the wrong stairwell when floors aren't drawn on one grid. Lifts are ignored. | Keep `links` (capped and validated) and route through them. Fall back to nearest only for unlinked stairs. |
| 1.4 | **Floor level** | `level` −5…10 per floor. | Read, but not stored at publish. The app sorts by it anyway. | Floors show front of house first, then file order, not by level. | Store `level` with each floor. |
| 1.5 | **Emergency marker identity** | Markers have an `id` in the editor, but the `.js` file doesn't export it. | Service history (`asset.service`) is keyed on `type_x_y`. | Moving or retyping an extinguisher in the editor orphans its service history and due date. | Editor exports `id`, Conduit writes `data-id` and keys assets on it, keeping `type_x_y` as the fallback for old maps. |
| 1.6 | **Shared names** (`sharedName`: two runs share a name on purpose) | Set per shelf (Rockingham has 2). | The `.js` drawing has no `data-shared`, and the `.json` backup drops `sharedName`. | "Shares its name with …" never shows, from either file. | Editor writes `data-shared` in its drawing and keeps `sharedName` in `.json`. Or Conduit draws from the arrays (§2.1). |
| 1.7 | **Scale** (`metresPerUnit`) | Set Scale sets it only when the unit is "m". It isn't saved in the `.json` or the local draft and isn't re-read on import. It always comes out as 1 ÷ grid size (0.05) whatever is measured, because it calibrates the underlay image. | Used for shelf sizes in metres, pick-route metres and evacuation distances. | Null in all five stores, so no metre figure ever shows. | Decide what a grid square is (decision 33). Then the editor saves and loads it with every map, and Conduit falls back to the store default. |
| 1.8 | **Field Mode notes** (`note`) | Stored on the shelf after a Field Mode merge. | Not in the `.js` export. | A comment from the floor is lost at the next publish. | Export `note`. Conduit shows it on the card (manager only). |
| 1.9 | **Zoom box label**, boundary breaks | Zoom boxes have a `label`. The boundary can have breaks. | The `.js` file drops the label and joins the boundary into one shape. | Minor. | Export both. |
| 1.10 | **Store details** `orientation` (normal/flipped), `completion` | Store Info tab. | Dropped by `cleanStoreInfo`. | `orientation` may matter if a store's map is drawn flipped. | Keep `orientation` and show the map that way round, once we know what it means in-store. |

## 2. Two files, two drawings

| # | What | Effect | Fix |
|---|---|---|---|
| 2.1 | **Conduit draws a `.js` file and a `.json` file differently.** The `.js` file uses the editor's drawing; the `.json` file uses Conduit's. | The same store can publish with or without shared names, inactive flags and labels depending on which file is uploaded. Every attribute Conduit adds has to be added to the editor's drawing code as well. | Conduit draws every floor from the structured arrays and ignores the editor's picture. One drawing, owned by Conduit. This needs 2.2 fixed first. |
| 2.2 | **The `.js` arrays drop angled orientation.** They write `orientation` only when it is `'V'`, so the 220 angled shelves (orientation `'A'` with an `angle`) come through without `'A'`. | Conduit's own renderer, which runs for every `.json` upload and would run for every file after 2.1, draws those 220 shelves straight. The editor's re-import straightens them too. | Editor exports `orientation: 'A'`. Conduit treats a shelf with an `angle` and no `V` as angled, which also fixes the files already exported. |
| 2.3 | **The two files keep different fields.** `.json` drops `sharedName` and `metresPerUnit`. `.js` drops shelf `id`, `note`, `locked`, the zoom-box `label` and `gridSize`. | Whichever file is uploaded loses something. | One export function feeds both files. |
| 2.4 | **Publish reports.** The worker returns a count of what its sanitiser stripped, but neither the console nor the CLI shows it. The console keeps landmark-only floors and the CLI drops them. | Silent differences. | Show the count; one floor rule. |

## 3. Made in Conduit, meant for the editor

| # | What | Problem | Fix |
|---|---|---|---|
| 3.1 | **Field Mode file** | Conduit writes `{kind: 'field-capture', captures: {'A16 S2': {shelf, sub, code, comment}}}`. The editor only accepts `{kind: 'shelfsearcher-field-capture', captures: {<editor shelf id>: {name, code, comment}}}`, matched by its internal shelf id. Those ids are regenerated every time a map is imported. **No Conduit capture can be merged today.** | The editor accepts Conduit's file and matches by name and suffix, plus floor id to tell runs that share a name apart. Conduit adds the floor id to each capture. The editor shows unmatched captures instead of skipping them. |
| 3.2 | **Suggested edits** | Conduit keeps them in the store's event log (`map.edit.suggest`, rename or flag) and shows them in the owner console. The editor's `suggestions.js` reads the old Firestore queue (retired) and also handles "move" (dx, dy). The two never meet, so each change is made by hand. | The console exports the open suggestions as a file the editor imports, or the editor reads them from the worker with the owner key. Accepting one in the editor marks it accepted in Conduit. Add "move" to Conduit if wanted. |
| 3.3 | **Opening the editor from Conduit** | `MAP_EDITOR_URL` is blank, so the console's Map editor button does nothing (decision 2). | Host the editor and set the address. |
| 3.4 | **Publishing from the editor** | Download, then upload in the console. | A "Publish to Conduit" button in the editor that posts to `/v1/store/:no/map` with the owner key, and validates first (2.4). |

## 4. Smaller things found on the way

**In the editor**
- The extinguisher-set marker type exists but isn't in the dropdown.
- Duplicating an order screen turns it into a price check (`duplicatePriceCheck` drops `variant`).
- Walk-path node ids can collide after an import, because `nextId` isn't moved past imported ids.
- The editor's live preview uses a third serialiser that drops fields.
- The old ShelfSearcher viewer defaults stockroom and custom shelves to 1 module, so they draw short. This is in the old viewer only; Conduit's renderer uses the editor's default.

**In Conduit**
- `filterDept` reads a six-way (round) shelf's width as 0, pulling a department zoom out to the map's origin.
- Maintenance and cage pins store raw map coordinates, so they drift if a redrawn map moves.
- Extinguisher classes show as the raw key ("wet_chem"; October audit §2).

**In the data**
- **Pinjarra (3320):** every shelf is unnamed. Conduit can't tap, refresh, count or find any of them. The editor's export check should refuse, or at least warn about, a floor with no named shelves.
- **Scale:** no store has a scale set.

## 5. Suggested order

1. **Conduit only, no decisions needed:**
   - inactive shelves (1.1);
   - modules on the card (1.2);
   - floor level (1.4);
   - stairs and lift links (1.3);
   - angled shelves from `.js` arrays (2.2);
   - show the publish strip count, one floor rule (2.4);
   - six-way zoom (§4).
2. **Both sides, small:**
   - marker ids (1.5);
   - shared names (1.6);
   - notes (1.8);
   - one export function feeding both files (2.3);
   - editor export of `orientation: 'A'`.
3. **The round trip:**
   - the Field Mode file the editor can merge (3.1);
   - suggestions into the editor (3.2).
4. **Then:**
   - Conduit draws every floor from the arrays (2.1);
   - Publish from the editor (3.4);
   - scale (1.7, after decision 33);
   - hosting (3.3, decision 2).
