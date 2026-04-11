---
name: update-v86
description: Build and install v86 (wasm + libv86.js + BIOS) into windows95. Use when pulling upstream v86 changes, fixing a broken build, verifying the fork branches are still in sync, or setting up a fresh v86 checkout.
---

# Updating v86

windows95 builds v86 from source — not from copy.sh. Two small bugfix
patches ride along on a fork branch until the upstream PRs land.

## Sources

| File | Built from |
|---|---|
| `src/renderer/lib/libv86.js` | `make build/libv86.js` in `../v86` |
| `src/renderer/lib/build/v86.wasm` | `make build/v86.wasm` |
| `bios/seabios.bin`, `bios/vgabios.bin` | copied from `../v86/bios/` |

`tools/update-v86.js` runs those targets, copies the artifacts, runs 5
sanity checks, and fails loudly if any prerequisite is missing. No
fallbacks, no fetching from copy.sh.

## The fork branch

v86 should be checked out on **`felixrieseberg/v86:windows95-base`**.
That branch merges two bugfix branches, each with an open upstream PR:

- **`electron-renderer-fs-loader`** (PR #1540) — `src/lib.js` uses
  `require("fs")` instead of `await import("node:fs/promises")`. Dynamic
  import of `node:` URLs doesn't work in an Electron renderer.
- **`ide-shared-registers`** (PR #1541) — `src/ide.js` writes ATA Command
  Block registers (Features, Sector Count, LBA Low/Mid/High) to both
  master and slave. Without this, Win95/98 hang at the splash screen on
  any disk >~535MiB. Root cause: v86 commit `1b90d2e7` changed those
  writes to target only `current_interface`, but per ATA spec they're
  channel-shared (one register file on the IDE cable; both drives latch
  the same value).

## Prerequisites

```sh
rustup target add wasm32-unknown-unknown
brew install openjdk
# one-time: fetch the Closure compiler v86's Makefile pins to
curl -sL https://repo1.maven.org/maven2/com/google/javascript/closure-compiler/v20210601/closure-compiler-v20210601.jar \
  -o ../v86/closure-compiler/compiler.jar
```

Closure **must** be v20210601 — newer versions hit
[closure-compiler#3972](https://github.com/google/closure-compiler/issues/3972)
on v86's source. The pin is in v86's Makefile.

## Steps

```sh
cd ../v86
git fetch fork origin
git checkout windows95-base
git rebase fork/windows95-base   # in case fork was updated elsewhere
cd ../windows95
node tools/update-v86.js
```

That's it. Script runs both `make` targets, copies, verifies.

## Sanity-check WARNs

The 5 checks assert invariants `src/renderer/smb/index.ts` and
`tools/parcel-build.js` depend on. A WARN means upstream changed
something load-bearing — don't ignore it:

1. **`await import("node:...")` still present** → PR #1540 was reverted
   or the pattern moved. Electron renderer will fail to load disk images.
2. **`master.features_reg=` missing in minified** → PR #1541 was reverted
   or `windows95-base` lost the commit. Win95 will hang at splash on
   disks >535MiB. Check `cd ../v86 && git log --oneline windows95-base`.
3. **Export pattern changed** → `tools/parcel-build.js` shim needs
   updating. Look for `module.exports.V86=` and `window.V86=`.
4. **`tcp-connection` event gone** → SMB falls back to the old-API theft
   hack in `src/renderer/smb/index.ts` — still works, but surprising.
5. **`on_tcp_connection` gone** → old-API fallback is dead. SMB integration
   only works via the `tcp-connection` bus event now. Harmless; update
   the comment in `index.ts` and retire the theft code.

## After updating, probe-test

```sh
node tools/update-v86.js && tools/probe-boot.sh
```

Should land SUCCESS in ~40s. If FAIL_SPLASH_HANG, the IDE fix didn't
take — check `grep master.features_reg src/renderer/lib/libv86.js`. If
FAIL_VXDLINK, retry — sporadic bluescreens are normal (see the
`probe-win95` skill).

## When a PR merges upstream

Rebase `windows95-base` to drop the now-redundant commit:

```sh
cd ../v86
git fetch origin
git checkout windows95-base
git rebase origin/master              # drops the merged commit cleanly
git push fork windows95-base --force-with-lease
```

If **both** PRs are upstream, retire the fork branch entirely:

1. Point `tools/update-v86.js` default at `origin/master` (it already
   uses `../v86`, so just `git checkout master` there)
2. Delete `fork/windows95-base`
3. Remove this skill's "The fork branch" section
4. Confirm the 5 sanity checks still pass — they're version-agnostic

## Integration contract with SMB

The SMB server sits on top of v86's network adapter. Details in
`src/renderer/smb/README.md`. Short version: the new path uses the
`tcp-connection` bus event; the fallback path uses
`adapter.on_tcp_connection` callback + connection-theft (stealing a
`TCPConnection` the HTTP probe builds for us). Both use `.on_data` on
the conn, not `.on("data")`, because Closure dead-code-eliminates the
event emitter plumbing.

If any v86 update breaks these assumptions, `src/renderer/smb/index.ts`
needs updating, not just `tools/update-v86.js`.
