# QEMU Instructions

The image built here was made with QEMU. In this doc,  I'm keeping instructions
around.

Disk image creation

```sh
qemu-img create -f raw windows95_v4.raw 1G
```

ISO CD image creation

```sh
hdiutil makehybrid -o output.iso /path/to/folder -iso -joliet
```

Installation
```sh
qemu-system-i386 \
    -cdrom Win95_OSR25.iso \
    -m 128 \
    -hda windows95.img \
    -device sb16 \
    -nic user,model=ne2k_pci \
    -fda Win95_boot.img \
    -boot a \
    -M pc,acpi=off \
    -cpu pentium
```

- Boot from floppy
- Run `fdisk` and `format c:`
- Run `D:\setup.exe` with `24796-OEM-0014736-66386`
- After completing setup and restarting your computer, you might get an IOS Windows protection error
- Use `fix95cpu.ima` as a bootable floppy to fix
- Use `vga-driver.iso` to install different video driver

```sh
qemu-system-i386 \
    -m 128 \
    -hda images/windows95.img \
    -device sb16 \
    -M pc,acpi=off \
    -cpu pentium \
    -netdev user,id=mynet0 \
    -device ne2k_isa,netdev=mynet0,irq=10
```

## Mouse: keep `vmport=off`

The image has VBADOS (`VBMOUSE.EXE` + `VBMOUSE.DRV`) installed for seamless
host-cursor tracking in the app. Don't enable QEMU's VMware backdoor
(`-M pc,vmport=on`) expecting the same thing — the cursor becomes unusably
laggy. The `yarn run qemu` script therefore passes `vmport=off`, which makes
VBMOUSE fall back to a plain relative PS/2 mouse (click the window to grab,
Ctrl+Alt+G to release).

Why it breaks with `vmport=on`: QEMU's `vmmouse` queues **every** host
pointer event (4 words each, up to 256 events) and notifies the guest by
injecting a fake PS/2 packet per event. VBMOUSE reads exactly **one**
4-word packet per PS/2 interrupt (`mousetsr.c, handle_ps2_packet` — an
`if`, not a `while`). Whenever a single notification is dropped (PS/2
disabled during driver init, PS/2 output queue full, boot), the queue gains
a permanent backlog: from then on the guest only ever reads stale events
and the cursor trails minutes behind. v86 doesn't have this problem because
our `vmware-abspointer` patch coalesces motion packets in place — the guest
is never more than one move behind by design.

Fixing it for real would mean either teaching QEMU's `hw/i386/vmmouse.c` to
coalesce motion events, or patching VBADOS to drain the whole queue per
interrupt and baking the rebuilt driver into the image.

## Slimming the image before a release

After working in the image (installing things, building, browsing), two
kinds of dead weight accumulate:

1. **Deleted-file remnants.** FAT deletion only marks clusters free — the
   old bytes stay on disk and bloat the compressed zip badly (at one point
   ~200 MB of the packed zip was deleted-file garbage).
2. **Content that has no function in this app**: 1996/97 online-service
   installers (AOL, CompuServe, MSN), setup cabinets, uninstall backups,
   NetMeeting, browser caches. (Help files are dead weight too, but they
   stay — F1 showing period-correct 1995 help is part of the charm.)

**The recommended workflow is to do all of this inside Windows** (in a
QEMU session): delete the dead content in Explorer, empty the Recycle Bin,
run ScanDisk, shut down cleanly. Win95's own filesystem operations keep
the disk in a state that v86 cold-boots. Then:

```sh
tools/probe-boot.sh            # cold-boot in the APP (v86) — required
yarn run qemu                  # optional second opinion
# regenerate images/default-state.bin from a successful cold boot
# bump STATE_VERSION in src/constants.ts
tools/pack-disk.sh             # build the new images zip
```

**Verify in the app, not just QEMU, and expect flakes.** Cold boot in v86
currently fails sporadically on any image, and certain disk states fail
deterministically — see `docs/v86-cold-boot-bug.md`. For how to interpret
probe verdicts (when to retry, when to ship, when to declare the image
broken), follow the policy in `.claude/skills/probe-win95/SKILL.md`
("VXDLINK: flake vs. real bug").

### Offline tools (currently not recommended)

`tools/slim-disk.sh` (curated deletions) and `tools/zero-free-clusters.py`
(zero free clusters without touching the FAT) can do the cleanup offline
via mtools. They work, and the resulting images pass fsck and boot in
QEMU — but offline modification measurably worsens v86 cold-boot
reliability on images that have been through recent QEMU sessions, again
due to the bug above. Until that bug is fixed in the v86 fork, prefer the
in-Windows workflow and ship the image untouched. (Never zero free space
with the classic "`mcopy` a giant zero file, then delete it" trick — that
one breaks v86 cold boot deterministically.)

After any image content change you MUST regenerate
`images/default-state.bin` (the old saved state has the old FAT cached in
guest RAM) and bump `STATE_VERSION` in `src/constants.ts`.
