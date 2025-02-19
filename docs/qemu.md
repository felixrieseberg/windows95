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
    -hda images/windows95_v4.raw \
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
    -hda images/windows95_v4.raw \
    -device sb16 \
    -M pc,acpi=off \
    -cpu pentium \
    -netdev user,id=mynet0,net=192.168.76.0/24,dhcpstart=192.168.76.9 \
    -device ne2k_isa,netdev=mynet0,irq=10
```
