# What's left (kept 2026-10-08, updated 2026-11-06)

Done so far: every P0 and P1 list, the Back dock, Stockroom and Floor P2
lists (the languages and the `P` suffix since 22 October), the manifest upload
preview, the owner-console access items (per-tool switches, console numbers,
Fleet, registry filter and export), the 360×640 layout and the sign-in
background. The audit
(`docs/AUDIT-2026-09.md` §5) has a status note per area.

The decisions these wait on are in `docs/OPEN-DECISIONS.md` (numbers in
brackets below).

**October audit (`docs/AUDIT-2026-10.md`):** its §1 fixes (data safety), the wrong numbers, step 3 (the Floor workflow), step 4 (the dock floor), step 5 (printing) and step 6 (search, the importers) are done: its §8 order is complete (see its status note). Its §5 code health is done too (sockets, photo deletes, size caps, time zones, phone cost, the low items and the seven tests), and so are the rest of §3 Stockroom and §4 Back dock. Nothing from that audit is open.

**19 October audit (`docs/AUDIT-2026-10-19.md`):** 54 findings (1 critical, 11 high) plus a suggested order: fix first, next, later. The fix-first group is done (its status table says what is left: T1 needs Netlify's auto publishing locked and two secrets). Next and later wait on the owner.

**Map editor (`editor/`, `docs/MAP-EDITOR-AUDIT-2026-10.md`):** brought into Conduit and connected (decision 2 settled); the audit's status note lists what is fixed. Left: the scale (decision 33).

## Built 2026-11-06

- **One pop-up, everywhere** (PR #86): every pop-up is the shared sheet in
  `js/sheet.js` (header with ×, a body that scrolls, actions on the right,
  main one last); a dialog, a side sheet or a wide dialog on the PC, a bottom
  sheet on the phone; Esc, a click outside, the Tab trap and focus return
  handled once for all. The camera screens stay full-screen with the same ×.
- **Confirm sheet, first pass** (PR #87): the 29 questions before a removal,
  reset, delete, clear or sign-out ask in the app (`ask()`), with the action
  named and in red, and focus on Keep it.
- **Dock grid lines** (PR #87): every line drawn whatever the dock's width
  (an 8-wide dock lost lines A7|A8, B6|B7, C5|C6, D4|D5 and the bottom row).
- **Phone Receive tab** (PR #88): only managers attach or change a manifest
  on a phone; no decant start and no decant part on a pallet in Receive;
  Team & plan only in Decant, whose decant start tile now sets it.
- **9-digit keycodes** (new products since late 2026, e.g. 110148905): one
  rule in `shared/keycode.js` (6 to 9 digits; a scan takes 7 to 9), used by
  the reducers (recalls, cage and live pull links, SOH ticks), the SIM and
  SOH report parsers, backfill scanning and disputes, screen scan, the live
  PDT reader, search, the product card and pop-up, Adjust, Recalls,
  off-site pallets and the worker's lookups. At the back dock 9 digits is
  still a pallet label; search finds both.

## On hold or waiting on you (2026-11-06)

- **The phone's New truck sheet:** keep its Decant start time box, or take
  it off like Receive's?
- **The Planner's week design** (boards F and F.2), **the live reader's
  option 6** (read both ways at once, a Settings trial, off by default) and
  **feedback on the ideas canvas** (dialogs, lists, calm screens, the More
  sheet, the outbox, gaps, handover, roster, weekly, photos, Tasks).
- **The review board's Ready list** (built 11 Nov, PR #94): one empty state and one page header; the confirm sheet's second pass; the alerts bell and rail counts; Ctrl K actions; a shrink trend; every page in Resources; Live pull answers for the requester; one look for print; density and dark; the manager phone's Today, Refresh and Back dock parts. Device health, compare stores, practice mode, a Tasks area and the chip/type/inline-style sweep land in the same PR as they finish.

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

- **The phone never talks about the desk** (2026-10-09): Manifests,
  Carton profiles, Planner, Analytics, Print map, Trends and
  Stock intelligence are desk-only views (`deskOnly`): they are off the
  phone's menus and search, and a link to one on a phone goes home. Phone
  notes, hints, Help, the tour and What's New no longer mention the desk.

## Next to build

1. **Importer gaps** (only if the legacy data matters):
   - K2B: the announcement, screen-scan presets, the back-of-house map, earlier days' negative SOH and its desk's SOH snapshots (not on the worker). History codes import right since October; the department map imports since 20 October.
   - DV: anything still missing once a real store is imported.

## Planned: the manager phone login (showcased 2026-10-12)

A **Team member / Manager** switch on the sign-in. The store and the manager
code open Floor, Stockroom and Back dock at once; the phone drops back to the
Floor after the store's idle re-lock. **Built 2026-10-14** for desktop and
phone: the worker takes `managerCode` in place of the PIN (same lockout), the
session holds the manager role for the shift (`ROLE_TTL_SECONDS`, 12 h), and
no crew code is asked. Needs the worker deploy. **Built 2026-11-11:** Today
(the store at a glance, its strip), Refresh by department, refreshes per phone
and the focus, and the Back dock's pace, rates, hold-ups, late manifests, roles
and reopening (decision 45). The plan as it was:

- **Today:** the store at a glance (needs you, Floor, Stockroom, Back dock,
  devices) and a strip of Today · Floor · Stock · Dock · More.
- **Refresh:** progress by department, refreshes per phone, set the focus.
- **Back dock:** pace against plan, each person's rate against their 28 days,
  hold-ups, late manifests, moving roles, reopening a truck.
- **Emergency:** the service dates and history (team phones show only where
  the markers are and how to use them; built 2026-10-13: the manager code
  already brings them back).
- **Field Mode:** only on a manager login (built 2026-10-13: Settings shows
  it once the manager code is on).

Open questions: how soon it locks; per-person rates on a phone; and anything
per person waits on "who's using this phone". (Settled 2026-10-14: the
manager code alone signs a manager in.)

## Things only you can do (deploy and set-up)

- Create the R2 buckets once: `npx wrangler r2 bucket create store-photos-staging` and `npx wrangler r2 bucket create store-photos`.
- Set `CF_ACCOUNT_ID` (variable) and `BROWSER_TOKEN` (secret) for product details, then run the first catalogue build from the console.
- In the map editor's Store Info, fill in Busselton's assembly point, address, hours and holidays, then republish (3).
- Give each floor's walk paths a `stairs` node so pick lists can cross floors (4).
- Set each store's stockroom departments (Backfill review › Departments, or Import from K2B for a K2B store); the console flags every store without them.
- Set `RETAIL_ANCHOR` in `shared/time.js` once the real retail calendar is known (5).
- Set the map's scale in the editor (Set Scale) and republish, so shelf sizes and pick-list distances show in metres (27).
- Add the store's price checks and department zoom boxes in the editor if you want them on the map; none of the shipped maps has any.
- Run the real-PC test pass at the end of `docs/OPEN-DECISIONS.md`.
