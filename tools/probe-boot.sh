#!/bin/bash
# Single boot probe: build → launch → wait for verdict → kill → report.
# Usage: tools/probe-boot.sh [json-options]
#   tools/probe-boot.sh '{"acpi":false}'
#   tools/probe-boot.sh '{"disable_jit":true}'

set -e
cd "$(dirname "$0")/.."

OPTS="${1:-{}}"
STATUS=/tmp/win95-probe.json
DONE=/tmp/win95-probe.done
SCREEN=/tmp/win95-screen.png
TIMEOUT=200

echo "═══ probe: opts=$OPTS ═══"

# clean slate
rm -f "$STATUS" "$DONE" "$SCREEN"
pkill -f "windows95/node_modules/electron" 2>/dev/null || true
sleep 1

# build (parcel only — forge's generateAssets does this too but we want
# direct control without the forge startup overhead)
rm -rf dist .cache
node tools/parcel-build.js > /tmp/win95-build.log 2>&1
if [ $? -ne 0 ]; then
  echo "BUILD FAILED"
  tail -20 /tmp/win95-build.log
  exit 1
fi

# launch electron directly (skip forge to avoid double-build)
WIN95_PROBE=1 WIN95_PROBE_OPTS="$OPTS" \
  ./node_modules/.bin/electron . > /tmp/win95-electron.log 2>&1 &
PID=$!
echo "electron pid=$PID, waiting for verdict (timeout ${TIMEOUT}s)..."

# poll
for i in $(seq 1 $TIMEOUT); do
  if [ -f "$DONE" ]; then
    VERDICT=$(cat "$DONE")
    echo "verdict at ${i}s: $VERDICT"
    break
  fi
  if ! kill -0 $PID 2>/dev/null; then
    echo "electron died at ${i}s"
    tail -30 /tmp/win95-electron.log
    VERDICT="CRASHED"
    break
  fi
  sleep 1
done

if [ -z "$VERDICT" ]; then
  echo "TIMEOUT at ${TIMEOUT}s"
  VERDICT="TIMEOUT"
fi

# capture final state
echo "─── final status ───"
[ -f "$STATUS" ] && python3 -c "
import json
s=json.load(open('$STATUS'))
print(f\"phase={s['phase']} cpu={s['cpuRunning']} instr_delta={s['instructionDelta']:,}\")
print(f\"uptime={s['uptimeSec']}s\")
t=s['textScreen'].strip()
if t: print('text:'); print('  ' + t.replace(chr(10), chr(10)+'  ')[:500])
" || echo "(no status file)"

# kill
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

echo "═══ $VERDICT ═══"
[ "$VERDICT" = "SUCCESS" ] && exit 0 || exit 1
