# Guide tools

Tools for reviewing and improving the Visual Guide (Help). Nothing in the app
loads this folder, and Help is unchanged by anything here.

The guide keeps drawing its screens by hand (`js/guide/`). These tools
support that work:

- **The audit:** every guide chapter next to the real screen for the same
  task, so a drawing can be checked against the app.
- **The sample chapter and its What ifs:** "Receive a truck on the phone",
  captured from the real app as a reference for redrawing it, with three side
  stories:
  - a label not on the manifest;
  - a consol already on another pallet;
  - pallets left over from the last truck.
- **The review page:** the audit and the sample in one page, published as a
  private artifact.

## Drawing a chapter (drafts)

Help's chapters live in `js/guide/`: `scenes.js` lists them, and the ones
drawn at the app's real sizes are in `js/guide/chapters/`, using the phone
in `js/guide/frames.js` and the store PC in `js/guide/pc.js`. A chapter
being drawn lives in `draft/` until it's approved, and Help keeps its
current chapter until then.

- **`draft/chapters/`:** one file per chapter being drawn. `index.js` lists
  them. A chapter that keeps Help's id takes that chapter's place; one with a
  new id is added.
- **`draft/css/`:** each chapter's own styles.
- **`draft/scenes.js`:** Help's chapters with the drafts in place.

To see them, build the preview and serve it. It runs Help's player with the
drafts laid over Help's chapters, on a page of its own:

| Command | Does |
|---|---|
| `node scripts/guide/preview/build.mjs` | Builds `out/preview/`. `GUIDE_ONLY=labels` builds it with one draft; `GUIDE_LANG=1` adds the six languages, for a check in each (a device's language is `lang` in `localStorage.suite_prefs`) |
| `node scripts/guide/preview/check.mjs <id> [play]` | Opens it at 1920×1080, 1440×900, 960×1040 and 420×860: errors, side scroll, a screenshot each, and with `play` plays the chapter to the end |
| `node scripts/guide/preview/try.mjs <id> [n]` | Try it, tapping each ring, for the chapter or What if n (`PC=1` for a PC chapter) |
| `node scripts/guide/preview/book.mjs <id>` | The chapter and each What if as Handbook frames, one image each |

The preview is published as a private artifact, using `out/preview/files.json`
for its files.

When a draft is approved, it moves into Help in one PR:

- the chapter file goes into `js/guide/chapters/` and `js/guide/scenes.js`
  imports it in the old chapter's place;
- its CSS goes into `styles/guide.css`;
- its new text gets its six translations in `js/i18n/<lang>/vguide2.js`, and
  the old chapter's text that nothing uses any more comes out.

A chapter uses the app's own text keys wherever the screen shows the same
words, so those translations carry over.

## Needs

- Node 22.
- Playwright with Chromium. The app doesn't depend on it, so set
  `PLAYWRIGHT` (path to its `index.mjs`) and `CHROMIUM` if they aren't at
  the cloud session's paths.
- `ffmpeg`, ImageMagick's `convert`, and `setsid` (Linux).

## Run

| Command | Does |
|---|---|
| `bash scripts/guide/all.sh` | Everything below, in order |
| `bash scripts/guide/cam/make.sh` | The camera video, checked with the app's own reader |
| `bash scripts/guide/run.sh "node scripts/guide/capture.mjs"` | The sample chapter, on a fresh dev stack |
| `bash scripts/guide/run.sh "node scripts/guide/whatif.mjs labels"` | The off-manifest and already-on-a-pallet What ifs |
| `bash scripts/guide/run.sh "node scripts/guide/whatif.mjs rollover"` | The rollover What if |
| `node scripts/guide/webp.mjs` | Converts the frames the steps use to WebP |
| `node scripts/guide/page/build.mjs` | Builds the review page |
| `node scripts/guide/page/check-player.mjs`, `check-whatifs.mjs`, `check-play.mjs` | Browser checks of the page |
| `node scripts/guide/sheets/chapter.mjs`, `whatifs.mjs` | One summary image of each |
| `bash scripts/guide/run.sh "node scripts/guide/audit.mjs"` | The audit: guide chapters and real screens (`guide`, `gphone` or `real` for one part) |
| `node scripts/guide/audit-steps.mjs` (with `run.sh`) | Every step of every guide chapter as it ends |

Everything is written to `scripts/guide/out/`, which git ignores. Set
`GUIDE_OUT` to write somewhere else. `run.sh` starts `scripts/dev.js` and
stops it afterwards, so each run starts from a fresh store. It also stops any
dev stack already running from this repo.

## The demo day

Busselton 1241 with a made-up day, set up by `seed.mjs`:

- manifest 7040301 with 12 consols, on Truck 1;
- the team D4, D7 and D9;
- two pallets already landed.

The sign-in codes are the dev stack's throwaway ones from `scripts/dev.js`:
PIN 2468, dock code `DK-CODE` and manager code `MGR-CODE`.

## The camera

Headless Chromium has no BarcodeDetector, so the app reads barcodes with its
ZXing fallback (`js/scan.js`). The video in `cam/` is made to suit how that
reader works:

- **One label per frame.** It reads whole rows and gives up on a row at the
  first start pattern it finds. A second label at the edge of the frame
  spoils every row it crosses, so each hold frames one label.
- **Big enough bars.** The label is about 85% of the screen's width, which
  gives about 2 px per bar in the 720 px frame. Smaller, and some frames stop
  reading.
- **Square video.** The app asks for 1280×720; a square 720×720 file is shown
  without extra zoom.

`cam/make.sh` checks a frame from each hold with `cam/decode.mjs` and stops
if either fails to read.
