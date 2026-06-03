# Open bug: certain disk modifications break Win95 cold boot in v86

**Status:** unresolved, worked around (2026-06-03)

## Symptom

Win95 cold boot in the app (v86) fails deterministically at ~11s with:

```
Invalid VxD dynamic link call from VMM(01) + 000036E5 to device "C000",
service E3E4. Your Windows configuration is invalid.
```

The same image boots fine in QEMU (`yarn run qemu`), passes `fsck_msdos`,
and mounts cleanly with mtools. The error address/service is identical on
every run — this is not the known sporadic VXDLINK flakiness (which shows
varying addresses and resolves on retry).

The garbage device:service values (C000:E3E4) suggest Win95's early-boot
code is reading wrong data from the disk at some point — most likely the
real-mode registry load — and the VxD initialization then dereferences
nonsense.

## What triggers it (all reproduced on 2026-06-03)

There are two regimes: **deterministic failure** (0% boot rate, same VxD
address every run) and **sporadic failure** (an image that can boot, but
fails a coin-flip-ish fraction of attempts). They are probably the same
underlying bug at different severities.

Deterministic (3+ identical failures in a row):

| Disk modification | Result in v86 | Result in QEMU |
|---|---|---|
| Zero free space via "`mcopy` giant zero file + `mdel`" (FAT churn) | ❌ 0/4 | ✅ boots |
| mtools deletions + truncation + direct zero-fill, applied after a QEMU session | ❌ 0/3 | ✅ boots |
| One specific end-of-day image (in-Windows tree deletion + reboot cycle) | ❌ 0/4 across variants | ✅ boots |

Notable: in the mcopy case, the resulting FAT is **byte-identical** to a
working image (verified entry-by-entry) — the only differences are a
deleted root-directory entry, the FSInfo next-free hint, and zeroed free
clusters. One of those is enough to trip v86.

Sporadic (same day, same machine — boot rate per image variant):

| Image | Cold-boot record |
|---|---|
| Curated in Windows, shipped untouched | 2/4 |
| Same + `zero-free-clusters.py` (direct zero, FAT untouched) | 1/5 |
| Earlier images + scattered mtools deletions + direct zero | ~5/7 |

Pattern: offline (mtools/raw) modification of an image that has recently
been through a QEMU session pushes it toward the deterministic regime.
In-Windows modification (Explorer delete + ScanDisk + clean shutdown)
keeps it in the sporadic regime. The failures concentrate around
freeing/zeroing clusters in the **recently-written, high-cluster-number
region** of the disk — the same region where `SYSTEM.DAT`/`USER.DAT`
(rewritten every session) live.

## What does NOT fix it

- `fsck_msdos -y` (image is already clean)
- Transplanting a known-good `SYSTEM.DAT` into a failing image
- Retrying (deterministic, 3/3 identical failures)

## Where to look

Suspects, in order:

1. The async hda buffer path (`AsyncXHRBuffer` + the
   `electron-renderer-fs-loader` patch) — block caching/merging when
   early-boot reads and writes interleave. Note v86 never writes the image
   file; guest writes live in the in-memory block cache, so any
   merge-on-read bug would corrupt read-back data.
2. The `ide-shared-registers` patch (the >535 MiB fix) — sector addressing
   edge cases.
3. Win95's real-mode INT 13h reads vs. SeaBIOS geometry handling for
   reads landing in specific disk regions.

## Workarounds in use

- **Ship images untouched**: curate content inside Windows (QEMU session),
  verify with the probe, never modify the image offline. This is the v6
  release workflow.
- `tools/zero-free-clusters.py` zeroes free space by writing clusters
  directly (FAT untouched) instead of the mcopy trick — but even this
  measurably worsens the sporadic failure rate, so it is shelved until the
  bug is fixed.
- `tools/probe-boot.sh` (in-app cold boot) is the required verification
  for ANY image change — QEMU success means nothing for this bug. Expect
  flakes; require 3 identical failures before declaring an image bad.
- End users see this as "Boot from scratch sometimes shows a Windows
  protection error" — retrying works. Resuming the saved state (the normal
  path) is unaffected.

## Repro kit

Probe harness: `tools/probe-boot.sh` (~4 min/run). The most reliable way
to create a deterministically failing image from a working one is the
mcopy zero-fill trick (requires mtools):

```sh
cp -c images/windows95.img /tmp/repro.img
# fill all free space with a zero file, then delete it
FREE=$(mdir -i /tmp/repro.img@@32256 :: | grep 'bytes free' | tr -dc '0-9')
dd if=/dev/zero of=/tmp/zeros bs=1 count=0 seek=$((FREE - 65536))
mcopy -i /tmp/repro.img@@32256 /tmp/zeros ::/ZEROFILL.TMP
mdel  -i /tmp/repro.img@@32256 ::/ZEROFILL.TMP
# swap into images/ and run tools/probe-boot.sh → FAIL_VXDLINK, 0/N runs,
# always at the same VMM address. The same image boots fine in QEMU.
```
