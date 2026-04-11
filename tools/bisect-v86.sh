#!/bin/bash
# Bisect harness: checkout v86 to a commit, rebuild wasm, probe boot.
# Logs to /tmp/win95-bisect.log
#
# Usage:
#   tools/bisect-v86.sh <commit-ish>           # test one commit
#   tools/bisect-v86.sh <commit-ish> '{"acpi":false}'  # with options

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V86="${V86_DIR:-$ROOT/../v86}"
LOG=/tmp/win95-bisect.log

COMMIT="$1"
OPTS="${2:-{}}"

[ -z "$COMMIT" ] && { echo "usage: $0 <commit> [opts-json]"; exit 1; }

cd "$V86"
SAVED_HEAD=$(git rev-parse HEAD)
trap "cd '$V86' && git checkout -q '$SAVED_HEAD' 2>/dev/null" EXIT

echo "─── checkout $COMMIT ───"
git checkout -q "$COMMIT" 2>&1 | head -3
HASH=$(git rev-parse --short HEAD)
SUBJ=$(git log -1 --format='%s' | head -c 60)
DATE=$(git log -1 --format='%ci' | cut -d' ' -f1)

export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"

echo "─── build wasm + libv86.js @ $HASH ($DATE) ───"
rm -f build/v86.wasm build/libv86.js
make build/v86.wasm 2>&1 | tail -3
[ -f build/v86.wasm ] || { echo "WASM BUILD FAILED"; exit 1; }
make build/libv86.js 2>&1 | tail -3
[ -f build/libv86.js ] || { echo "LIBV86 BUILD FAILED"; exit 1; }

WASM_SIZE=$(stat -f%z build/v86.wasm)
JS_SIZE=$(stat -f%z build/libv86.js)

cp build/v86.wasm "$ROOT/src/renderer/lib/build/v86.wasm"
cp build/libv86.js "$ROOT/src/renderer/lib/libv86.js"

# Re-apply phantom-slave patch (it's a v86 bug from May 2025 onwards;
# harmless before that since the pattern won't match)
node -e '
const fs=require("fs");
let s=fs.readFileSync(process.argv[1],"utf8");
const re=/(\w+)\[0\]\[1\]=\{buffer:(\w+)\.hdb\}/g;
const n=[...s.matchAll(re)].length;
if(n===1){s=s.replace(re,"$2.hdb&&($1[0][1]={buffer:$2.hdb})");fs.writeFileSync(process.argv[1],s);console.log("phantom-slave: patched")}
else console.log("phantom-slave: skip ("+n+" matches)");
' "$ROOT/src/renderer/lib/libv86.js"

# Win95 has sporadic bluescreens on all v86 versions — a single FAIL doesn't
# mean the commit is bad. Probe up to 3 times; one SUCCESS = good commit.
echo "─── probe (up to 3 attempts) ───"
cd "$ROOT"
VERDICT="UNKNOWN"
for ATTEMPT in 1 2 3; do
  echo "  attempt $ATTEMPT/3"
  set +e
  tools/probe-boot.sh "$OPTS" 2>&1 | tee /tmp/win95-probe-out.log | tail -10
  set -e
  V=$(cat /tmp/win95-probe.done 2>/dev/null || echo "UNKNOWN")
  if [ "$V" = "SUCCESS" ]; then
    VERDICT="SUCCESS"
    break
  fi
  VERDICT="$V"  # keep the last failure mode
  [ "$ATTEMPT" -lt 3 ] && sleep 3
done
GFX=$(python3 -c "import json;s=json.load(open('/tmp/win95-probe.json'));print(f\"{s.get('gfxW',0)}x{s.get('gfxH',0)} {s.get('dominantColor','')}\")" 2>/dev/null || echo "?")

LINE="$HASH $DATE | wasm=${WASM_SIZE} opts=$OPTS | $VERDICT $GFX | $SUBJ"
echo "$LINE" >> "$LOG"
echo ""
echo "═══ $LINE ═══"

exit $RESULT
