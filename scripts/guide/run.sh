#!/bin/bash
# Runs a command with the local dev stack up (scripts/dev.js: the worker on
# :8787 with store 1241, the shell on :8080), then stops the stack, so every
# run starts from a fresh store. It stops a dev stack already running here.
#   bash scripts/guide/run.sh "node scripts/guide/capture.mjs"
cd "$(dirname "$0")/../.." || exit 1
OUT=${GUIDE_OUT:-scripts/guide/out}; mkdir -p "$OUT"; LOG="$OUT/dev.log"
stop() { pkill -f "^node scripts/dev.js" 2>/dev/null; pkill -f "^$PWD/node_modules/@cloudflare/workerd" 2>/dev/null; }
stop; sleep 1
setsid node scripts/dev.js > "$LOG" 2>&1 &
DEV=$!
for i in $(seq 1 60); do grep -q "^shell " "$LOG" 2>/dev/null && break; sleep 1; done
grep -q "^shell " "$LOG" || { echo "The dev stack did not start: see $LOG"; kill -- -$DEV 2>/dev/null; stop; exit 1; }
bash -c "$*"; RC=$?
kill -- -$DEV 2>/dev/null; stop; wait $DEV 2>/dev/null
exit $RC
