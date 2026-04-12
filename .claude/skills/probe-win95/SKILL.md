---
name: probe-win95
description: Boot Windows 95 in Electron under Claude's control, without a human clicking anything. Use when testing v86 updates, SMB changes, keyboard input, boot stability, or bisecting regressions.
---

# Probing Windows 95 autonomously

You can run and test the Win95 VM yourself. The harness is already wired
up — three pieces:

| File | Role |
|---|---|
| `src/renderer/debug-harness.ts` | Activated by `WIN95_PROBE=1`. Boots fresh automatically, samples CPU + VGA + text screen every 5s, writes `/tmp/win95-probe.json` + `/tmp/win95-screen.png`, detects SUCCESS vs FAIL modes, optionally drives keyboard input. |
| `src/renderer/smb/index.ts` | Wraps `console.log` so `[smb]` and `[nbns]` lines tee to `$TMPDIR/windows95-smb.log` (outside Electron, readable by any polling script — no CDP needed). |
| `tools/probe-boot.sh` | One-shot: kill leftovers → parcel build → launch Electron → poll `/tmp/win95-probe.done` → report → kill. |

## One-shot boot test

```sh
tools/probe-boot.sh
```

Prints SUCCESS or a FAIL verdict. ~40s on a clean run.

## Boot + type into Run

```sh
pkill -9 -f "windows95.*electron"; sleep 2
rm -f "$HOME/Library/Application Support/windows95/state-v4.bin"
rm -f /tmp/win95-probe.json /tmp/win95-probe.done \
      "$TMPDIR/windows95-smb.log"

WIN95_PROBE=1 \
WIN95_PROBE_SCRIPT='HOST/HOST' \
WIN95_SMB_SHARE="$HOME/Downloads" \
  ./node_modules/.bin/electron . > /tmp/win95-electron.log 2>&1 &
```

`WIN95_PROBE_SCRIPT='HOST/HOST'` types `\\HOST\HOST` into Start → Run on
desktop. `WIN95_PROBE_DOSBOX=1` instead opens `command`, types `dir`,
and (with `WIN95_PROBE_DOSBOX_ALTENTER=1`) toggles fullscreen — this is
the regression scenario for the windowed-DOS-box VBE leak.
`WIN95_PROBE_VGATRACE=1` wraps the VGA I/O ports at the `io.ports[]`
layer and writes `[port, op, value, "eip VMPE cplN"]` tuples to
`/tmp/win95-vgatrace.json` every tick (heavy — can hit 1M entries during
boot). `/` → `\` substitution (env var / shell quoting, pragmatism). The
harness drives it via XT scancodes — Win95 doesn't have Win+R (Win98+
only), so the sequence is Esc, Esc, Ctrl+Esc, R, backslashes + text,
Enter.

## Reading results

| File | What |
|---|---|
| `/tmp/win95-probe.json` | Live status: `phase` (`init`/`text-mode`/`splash`/`desktop`), `gfxW/H`, `textScreen`, `instructionDelta`, `verdict` |
| `/tmp/win95-probe.done` | Written once when verdict is decided |
| `/tmp/win95-screen.png` | Canvas screenshot, refreshed each tick |
| `$TMPDIR/windows95-smb.log` | SMB/NBNS protocol trace |
| `/tmp/win95-electron.log` | Electron stderr |

## Verdicts

| Verdict | Meaning | Action |
|---|---|---|
| `SUCCESS` | Canvas ≥640×480, CPU active, uptime >30s | desktop reached |
| `FAIL_VXDLINK` | "Invalid VxD dynamic link call" | flaky — retry |
| `FAIL_IOS` / `FAIL_PROTECTION` | IOS subsystem protection error | usually driver/BIOS mismatch |
| `FAIL_KRNL386` | "Cannot find KRNL386.EXE" in safe mode | disk reads returning garbage — wasm/BIOS drift |
| `FAIL_SPLASH_HANG` | Canvas stuck 320×400 for >70s | IRQ starvation — if you're on v86 master, check the IDE register fix |
| `FAIL_HUNG` | CPU stopped advancing or text screen frozen 40s | hard hang |

## Rules of the road

- **Sporadic bluescreens are normal** on all v86 versions. One FAIL_VXDLINK
  or FAIL_HUNG doesn't prove anything — retry up to 3×.
- **Always clean state** (`state-v4.bin`) before a probe. `pkill` on a
  wedged Electron triggers `onbeforeunload`, saving the *corrupted* state.
  Deleting it forces fallback to `images/default-state.bin`.
- **Don't trust the text buffer in graphics mode.** After desktop (≥640×480)
  the stale BIOS text lingers in the buffer. The harness's `phase` field
  accounts for this; don't re-read `textScreen` in a `desktop` phase and
  think you hit a BSOD.
- **Kill Electron when done.** Background processes pile up, each holding
  the disk image lock. `pkill -f "windows95.*electron"` on every path out.

## Bisecting v86

`tools/bisect-v86.sh <commit>` handles one step. The harness retries 3×
per commit. Hard-won lessons:

1. **Validate bounds against a known-good binary.** Source-built wasm can
   drift from prod due to cargo/rustc version differences. We hit this:
   the "GOOD" bound produced a wasm that couldn't read the disk at all.
2. **JS-only when toolchain drifts.** Keep the prod wasm, rebuild only
   libv86.js at each commit. Closure is deterministic enough; cargo
   isn't always. Works until you cross a commit that changes the JS↔wasm
   ABI (for v86, the APIC→Rust port in Aug 2025).
3. **Retry on FAIL, never on SUCCESS.** One SUCCESS = commit is good.
   Three different FAILs at the same commit = commit is bad.
4. **State cleanup between runs** (see above). Skipping this is the #1
   cause of spurious "bad" verdicts during bisect.

## Extending the harness

- New verdicts: add to the chain in `collectStatus` in `debug-harness.ts`
- New keyboard actions: extend `runScript` (current types: `keys`, `chord`,
  `text`, `wait`)
- New probe signals: add to `ProbeStatus` interface

Gate everything new on `process.env.WIN95_PROBE === "1"` so it stays out
of the normal app.

## Common failure diagnostics

| Symptom | Check |
|---|---|
| No SMB traffic at all | `$TMPDIR/windows95-smb.log` should have `hooked adapter` line. If absent, v86 API changed — see `src/renderer/smb/README.md` |
| SMB hooks fire, no connection | Win95's "NetBIOS over TCP/IP" checkbox — bake into default-state.bin |
| Boot hangs on `2996c087` or older v86 | You probably have a ABI-mismatched wasm/JS pair. Prod wasm is the ground truth; rebuild JS against it. |
