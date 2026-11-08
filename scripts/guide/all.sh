#!/bin/bash
# Everything, start to finish: the camera video, the chapter and its What ifs
# (each on a fresh dev stack), WebP, the review page and its checks, and the
# two summary images. Output in scripts/guide/out (or $GUIDE_OUT).
set -e
cd "$(dirname "$0")/../.."
G=scripts/guide
bash $G/cam/make.sh
bash $G/run.sh "node $G/capture.mjs"
bash $G/run.sh "node $G/whatif.mjs labels"
bash $G/run.sh "node $G/whatif.mjs rollover"
node $G/webp.mjs
node $G/page/build.mjs
node $G/page/check-player.mjs
node $G/page/check-whatifs.mjs
node $G/sheets/chapter.mjs
node $G/sheets/whatifs.mjs
