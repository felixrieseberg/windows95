---
name: inspect-disk
description: Inspect or modify the Windows 95 disk image offline with mtools — no QEMU, no Electron, no boot. Use when checking what's on the C: drive, extracting/reading files from the image, copying files into it, or verifying image contents after a change.
---

# Inspecting windows95.img without booting it

`images/windows95.img` is a 1 GB raw MBR disk with a single FAT32 (0x0C)
partition starting at sector 63. mtools (installed via Homebrew) can read
and write it directly — the only trick is the partition byte offset:

```
63 sectors × 512 bytes = 32256
```

Every command takes the same image spec: `-i images/windows95.img@@32256 ::`

## Read operations (always safe)

| Task | Command |
|---|---|
| List root | `mdir -i images/windows95.img@@32256 ::` |
| List a subdir | `mdir -i images/windows95.img@@32256 ::/WINDOWS` |
| Recursive bare listing | `mdir -/ -b -i images/windows95.img@@32256 ::` |
| Print a text file | `mtype -i images/windows95.img@@32256 ::/AUTOEXEC.BAT` |
| Extract a file to host | `mcopy -i images/windows95.img@@32256 ::/CONFIG.SYS /tmp/` |
| Extract a dir recursively | `mcopy -s -i images/windows95.img@@32256 ::/TOOLS /tmp/tools` |
| Filesystem info | `minfo -i images/windows95.img@@32256 ::` |
| Disk usage (in 4 KB clusters) | `mdu -i images/windows95.img@@32256 ::` |

Long filenames work (`PROGRA~1` ↔ `Program Files`); quote paths with
spaces. Paths use `::/` as the root of C:.

**Hidden files need `-a`.** Plain `mdir` silently skips hidden/system files
(`BOOTLOG.TXT`, `SYSTEM.DA0`, `ShellIconCache`, `ie5bak.DAT`, …). Existence
checks must use `mdir -a`, or you'll wrongly conclude a file isn't there.

**Check the image isn't in use first.** A running Electron *or QEMU* session
holds the image open and writes to it lazily (Win95's VCACHE flushes on its
own schedule):

```sh
lsof images/windows95.img   # must come back empty
```

A copy taken while the VM runs will have FAT inconsistencies (directory
entries written, FAT not yet flushed). To repair a copy:

```sh
DEV=$(hdiutil attach -imagekey diskimage-class=CRawDiskImage -nomount copy.img | head -1 | awk '{print $1}')
fsck_msdos -y "${DEV}s1"
hdiutil detach "$DEV"
```

## Write operations (read the warnings first)

| Task | Command |
|---|---|
| Copy file into image | `mcopy -o -i images/windows95.img@@32256 /host/file.txt ::/TOOLS/` |
| Make a directory | `mmd -i images/windows95.img@@32256 ::/NEWDIR` |
| Delete a file | `mdel -i images/windows95.img@@32256 ::/FILE.TXT` |
| Delete a dir recursively | `mdeltree -i images/windows95.img@@32256 ::/DIR` |
| Clear R/S/H attributes | `mattrib -i images/windows95.img@@32256 -r -s -h ::/FILE` (`-/` for recursive) |

`mdel`/`mdeltree` fail on read-only/hidden/system files — run `mattrib`
first. For bulk cleanup (deleting dead weight + zeroing free space so
the packed zip shrinks), use `tools/slim-disk.sh` instead of doing it by
hand — it has the safety checks, the curated deletion list, and the
zero step built in.

### Warning 3: never zero free space via mcopy of a giant zero file

The classic trick (`mcopy` a huge zero file in, `mdel` it) leaves the image
in a state that **deterministically fails Win95 cold boot in v86** with
"Invalid VxD dynamic link call" — while booting fine in QEMU and passing
fsck. Use `tools/zero-free-clusters.py` instead (writes zeros directly
into free clusters, FAT untouched — verified to boot in the app).

### Warning 4: QEMU boot success ≠ app boot success

QEMU and v86 exercise different boot paths (different hardware → different
driver init). Any image modification must be verified with the in-app
probe (`tools/probe-boot.sh`, see the probe-win95 skill), not just
`yarn run qemu`.

### Warning 1: never write while a VM holds the image

If Electron/v86 or QEMU is running against the image, offline writes race
the guest's own writes and corrupt the FAT. Check first:

```sh
pgrep -fl "windows95.*electron|qemu.*windows95"
```

### Warning 2: saved states cache the old disk

`images/default-state.bin` and `~/Library/Application Support/windows95/state-v*.bin`
contain Win95's RAM, including VCACHE/FAT caches that reference the disk
*as it was when the state was saved*. Modifying the disk offline and then
resuming a saved state = filesystem corruption.

After any offline write:

```sh
rm -f "$HOME/Library/Application Support/windows95/"state-v*.bin
```

…so the next boot is fresh (or from `default-state.bin`, which boots from
disk early enough to be safe only if the files you touched weren't open at
state-save time — when in doubt, do a full fresh boot and re-save).

## Alternative: mount in Finder

```sh
hdiutil attach -imagekey diskimage-class=CRawDiskImage -readonly images/windows95.img
# … browse /Volumes/WIN95 …
hdiutil detach /Volumes/WIN95
```

Read-only is deliberate; use mtools for writes so you control exactly what
changes.

## Worktree note

`images/` is gitignored. In a fresh worktree, clone the images from the
main checkout first (APFS clonefile — instant):

```sh
mkdir -p images
cp -c "$(git rev-parse --git-common-dir)/.."/images/*.{img,bin} images/
```

## Why not QEMU/v86?

Booting to inspect the disk takes ~40s+ per round trip (see `probe-win95`)
and every boot mutates the image (registry, swap, SCANDISK.LOG). mtools is
instant and, for read operations, leaves the image bit-identical — which
matters when you're trying to diff or bisect image changes.
