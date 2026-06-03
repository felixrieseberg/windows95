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
