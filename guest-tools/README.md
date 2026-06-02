# guest-tools

Files and folders in this directory are exposed read-only inside the VM at
`\\HOST\TOOLS` (alongside the synthetic `_MAPZ.BAT` and `README.TXT`).
Drop drivers and utilities here that you want available from within
Windows 95.

## mouse-driver/ — seamless mouse (VBADOS)

`VBMOUSE.EXE` (DOS TSR) + `VBMOUSE.DRV` (Windows 3.x/9x driver) from
[VBADOS](https://git.javispedro.com/cgit/vbados.git/) by Javier S. Pedro,
GPLv2. Talks to v86's VMware mouse backdoor (port 0x5658) so the Windows
95 cursor tracks the host cursor pixel-for-pixel without pointer lock.

Install inside the guest:

1. Copy `\\HOST\TOOLS\mouse-driver\VBMOUSE.EXE` to `C:\` and add a
   `C:\VBMOUSE.EXE` line to `C:\AUTOEXEC.BAT`.
2. Windows Setup (or Control Panel → Mouse → General → Change → Have
   Disk) → browse to `\\HOST\TOOLS\mouse-driver` → pick **VBMouse int33
   absolute mouse driver**.
3. Reboot. The app detects the driver and stops grabbing pointer lock;
   ESC still toggles lock for games that want raw relative input.

## agent/ — W95TOOLS guest agent

`W95TOOLS.EXE` is a hidden-window agent that talks to the emulator over
the VMware backdoor (port 0x5658). Currently it:

- bridges Windows 95's `CF_TEXT` clipboard to the host (legacy backdoor
  commands 6–9; host side is `src/renderer/clipboard.ts`, which polls
  Electron's clipboard),
- auto-maps `\\HOST\HOST` to `Z:` at login via `WNetAddConnection`, so
  the shared folder shows up as a drive without a trip through
  Start → Run,
- keeps the Windows clock set to the host's local time (backdoor
  GETTIME, command 23). Windows only reads the RTC at boot, so without
  this a resumed emulator session carries on with the clock from
  whenever the state was saved. The agent checks every 5 seconds and
  steps the clock whenever it's off by 2 seconds or more — covering
  resume, slow-emulation drift, and the UTC-only RTC at boot.

Host-initiated shutdown and a tray icon will live here too when those
land.

Install inside the guest:

1. Copy `\\HOST\TOOLS\agent\W95TOOLS.EXE` to `C:\WINDOWS\`.
2. Drop a shortcut to it in
   `C:\WINDOWS\Start Menu\Programs\StartUp` so it runs on login.

Copy text on either side and it appears on the other within ~250 ms.
Text only; conversion is Windows-1252 ↔ UTF-8 with CRLF ↔ LF, capped at
64 KB. Built from `w95tools.c` with Open Watcom v2 — `make -C
guest-tools/agent` (needs Docker).

To update an already-installed agent: end the running `W95tools` task
(Ctrl+Alt+Del → End Task) or reboot Windows, copy the new
`\\HOST\TOOLS\agent\W95TOOLS.EXE` over `C:\WINDOWS\W95TOOLS.EXE`, and
start it again (the StartUp shortcut also picks it up at next login).

### Baking into the disk image

Fresh boots run whatever is baked into `images/windows95.img` — the
agent is installed there twice: at `C:\WINDOWS\W95TOOLS.EXE` and as a
copy in `C:\WINDOWS\Start Menu\Programs\StartUp`. You can bake a new
build directly from the host with mtools (`brew install mtools`), no
QEMU boot needed. The FAT32 partition starts at sector 63 (byte offset
32256):

```sh
make -C guest-tools/agent
IMG="images/windows95.img@@32256"
mcopy -o -i "$IMG" guest-tools/agent/W95TOOLS.EXE '::/WINDOWS/W95TOOLS.EXE'
mcopy -o -i "$IMG" guest-tools/agent/W95TOOLS.EXE \
  '::/WINDOWS/STARTM~1/PROGRAMS/STARTUP/W95TOOLS.EXE'
```

Do this while the app is not running. Note that an existing saved
state (`state-v4.bin`+) keeps its own dirty-block overlay over the
image *and* the old agent stays loaded in the resumed session's RAM —
so resumed sessions only pick up a new agent after a guest reboot or
an End Task + relaunch.
