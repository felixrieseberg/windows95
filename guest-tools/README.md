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
