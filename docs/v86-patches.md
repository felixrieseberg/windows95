# v86 patches carried by windows95

windows95 builds v86 from a fork branch rather than upstream master.
Each fix lives on its own feature branch in `felixrieseberg/v86`, has an
upstream PR against `copy/v86`, and is merged into the integration
branch `felixrieseberg/v86:windows95-base` (which is what
`tools/update-v86.js` builds from). When a PR is merged upstream, drop
its row here, delete the feature branch, and rebase `windows95-base`.

| Fix | Branch | Upstream PR | windows95-base | Why we need it |
|---|---|---|---|---|
| Node fs loader in Electron renderer | [`electron-renderer-fs-loader`](https://github.com/felixrieseberg/v86/tree/electron-renderer-fs-loader) | [copy/v86#1540](https://github.com/copy/v86/pull/1540) | ✅ | `await import("node:fs/promises")` fails in an Electron renderer; disk images don't load. |
| IDE shared Command Block registers | [`ide-shared-registers`](https://github.com/felixrieseberg/v86/tree/ide-shared-registers) | [copy/v86#1541](https://github.com/copy/v86/pull/1541) | ✅ | Win9x hangs at splash on disks >535 MiB because per-device register writes violate the ATA shared-register-file spec. |
| VMware absolute-pointer backdoor | [`vmware-abspointer`](https://github.com/felixrieseberg/v86/tree/vmware-abspointer) | [copy/v86#1542](https://github.com/copy/v86/pull/1542) | ✅ | Port 0x5658 GETVERSION + ABSPOINTER_* so VBMOUSE can track the host cursor 1:1 without pointer lock. |
| VMware text-clipboard backdoor | [`vmware-clipboard`](https://github.com/felixrieseberg/v86/tree/vmware-clipboard) | — *(stacked on #1542)* | ✅ | Legacy backdoor commands 6–9 so `W95TOOLS.EXE` can sync `CF_TEXT` with the host. |
| Defer V86-mode VBE disable | [`vga-defer-vbe-disable-v86`](https://github.com/felixrieseberg/v86/tree/vga-defer-vbe-disable-v86) | [copy/v86#1543](https://github.com/copy/v86/pull/1543) | ✅ | Opening a windowed DOS box leaks vgabios's VBE-disable past Win9x's VDD and turns the screen to planar garbage. |
| fake_network: copy TCP addrs | [`fake-network-copy-tcp-addrs`](https://github.com/felixrieseberg/v86/tree/fake-network-copy-tcp-addrs) | — *(desc: `tools/pr-fake-network-copy-tcp-addrs.md`)* | ✅ | `TCPConnection` routing fields alias the NE2000 TX ring; concurrent guest traffic retargets async replies and the guest RSTs them. |

## Adding a fix

1. Branch off `origin/master` in `../v86`, commit, push to `fork`.
2. Open the PR against `copy/v86`.
3. `git checkout windows95-base && git merge --no-ff <branch> && git push fork windows95-base`
4. `node tools/update-v86.js` in this repo to rebuild `libv86.js` / `v86.wasm`.
5. Add a row above and a bullet in `.claude/skills/update-v86/SKILL.md`.
