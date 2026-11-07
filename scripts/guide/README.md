# Guide tools

Tools for reviewing and improving the Visual Guide (Help). Nothing in the app
loads this folder, and Help is unchanged by anything here.

The guide keeps drawing its screens by hand in `js/guide/scenes.js`. These
tools support that work:

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
