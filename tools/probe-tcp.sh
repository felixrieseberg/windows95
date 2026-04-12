#!/bin/bash
# Probe the tcp-relay recv() path: boot Win95, telnet to a fake upstream
# on port 7777, and dump the per-frame trace. PASS = guest ACKs the async
# banner (i.e., recv() returned).
set -e
cd "$(dirname "$0")/.."

PORT=7777
TRACE=/tmp/win95-tcp-trace.log
RELAY="${TMPDIR:-/tmp}/win95-tcp-relay.log"
STATUS=/tmp/win95-probe.json
TIMEOUT=${TIMEOUT:-90}

pkill -9 -f "windows95.*electron" 2>/dev/null || true
sleep 1
rm -f "$HOME/Library/Application Support/windows95/state-v4.bin"
rm -f "$STATUS" /tmp/win95-probe.done /tmp/win95-screen.png "$TRACE" "$RELAY"

rm -rf dist
node tools/vite-build.js > /tmp/win95-build.log 2>&1 || {
  echo "BUILD FAILED"; tail -30 /tmp/win95-build.log; exit 1
}

WIN95_PROBE=1 \
WIN95_PROBE_RUN="${RUN:-ping -t 8.8.8.8}" \
WIN95_PROBE_RUN2="${RUN2:-telnet 1.1.1.1 $PORT}" \
WIN95_PROBE_RUN2_WAIT="${RUN2_WAIT:-3000}" \
WIN95_PROBE_RUN_AFTER="${RUN_AFTER:-}" \
WIN95_PROBE_RUN_WAIT="${RUN_WAIT:-6000}" \
WIN95_TCP_TEST_PORT=$PORT \
WIN95_TCP_TEST_MODE="${MODE:-banner}" \
WIN95_TCP_TEST_DELAY="${DELAY:-50}" \
WIN95_TCP_TEST_BYTES="${BYTES:-3000}" \
WIN95_TCP_TRACE=$PORT \
WIN95_SMB_SHARE="$HOME/Downloads" \
  ./node_modules/.bin/electron . > /tmp/win95-electron.log 2>&1 &
PID=$!
echo "electron pid=$PID, waiting up to ${TIMEOUT}s…"

VERDICT=TIMEOUT
for i in $(seq 1 "$TIMEOUT"); do
  kill -0 $PID 2>/dev/null || { VERDICT=CRASHED; break; }
  if [ -f /tmp/win95-probe.done ] && grep -q FAIL /tmp/win95-probe.done; then
    VERDICT="BOOT_$(cat /tmp/win95-probe.done)"; break
  fi
  if [ -f "$TRACE" ] && grep -q '→ guest .* banner' "$RELAY" 2>/dev/null; then
    # Banner was written; give guest 8 s to ACK, then decide.
    sleep 8
    if grep -Eq 'guest→.* ack=(279[8-9]|2[89][0-9]{2}|[3-9][0-9]{3}|[1-9][0-9]{4,}) ' "$TRACE"; then
      VERDICT=PASS
    else
      VERDICT=FAIL
    fi
    break
  fi
  sleep 1
done

kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

echo "─── relay ───"; [ -f "$RELAY" ] && cat "$RELAY"
echo "─── trace ───"; [ -f "$TRACE" ] && cat "$TRACE"
echo "═══ $VERDICT ═══"
[ "$VERDICT" = PASS ]
