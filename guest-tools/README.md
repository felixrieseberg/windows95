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
the VMware backdoor (port 0x5658). Currently it does one thing: bridges
Windows 95's `CF_TEXT` clipboard to the host (legacy backdoor commands
6–9; host side is `src/renderer/clipboard.ts`, which polls Electron's
clipboard). It's also where time sync, host-initiated shutdown, and a
tray icon will live when those land.

Install inside the guest:

1. Copy `\\HOST\TOOLS\agent\W95TOOLS.EXE` to `C:\WINDOWS\`.
2. Drop a shortcut to it in
   `C:\WINDOWS\Start Menu\Programs\StartUp` so it runs on login.

Copy text on either side and it appears on the other within ~250 ms.
Text only; conversion is Windows-1252 ↔ UTF-8 with CRLF ↔ LF, capped at
64 KB. Built from `w95tools.c` with Open Watcom v2 — `make -C
guest-tools/agent` (needs Docker).
