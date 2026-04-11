# Host folder over SMB

Windows 95 can mount a host folder as a network drive. The server lives in
`src/renderer/smb/` — ~1500 lines, zero dependencies, read-only. Defaults to
`~/Downloads`, configurable in Settings.

## Inside Win95

- **Browse:** Start → Run → `\\HOST\HOST`
- **Map a letter:** in Explorer, Tools → Map Network Drive → `Z:` →
  `\\HOST\HOST` → ☑ Reconnect at logon
- **Batch shortcut:** the share root exposes a virtual `_MAPZ.BAT` that runs
  `NET USE Z: \\HOST\HOST`. Double-click once, or copy it to
  `C:\WINDOWS\STARTM~1\PROGRAMS\STARTUP` to reconnect every boot.

NetBIOS over TCP/IP must be enabled (Control Panel → Network → TCP/IP
properties → NetBIOS tab). This is baked into the default state image.

## Architecture

One SMB session per `TCPConnection`, hooked off v86's network adapter. The
server speaks SMB1 (LANMAN2.1 dialect) because that's what Win95 negotiates.
Full breakdown in `src/renderer/smb/README.md` — that file has the protocol
gotchas learned during implementation (NT dialect trap, NetBIOS name
null-termination, 8.3 `~N` mapping, RAP descriptor parsing).

**Security:** read-only, symlink-aware path traversal guard, share path
validated in main-process IPC. Not exposed until `smbSharePath` is set in
settings or `WIN95_SMB_SHARE=...` is in the env.

## Tests

```sh
npx tsc --ignoreConfig --module commonjs --target es2020 --esModuleInterop \
  --moduleResolution bundler --outDir /tmp/smb-test --skipLibCheck \
  src/renderer/smb/*.ts && node /tmp/smb-test/test-standalone.js
```

35 protocol tests, full round-trips with real file I/O. No Electron needed.

## What's not implemented

- Writes (read-only by design, but OPEN is easy to extend)
- Long filenames via TRANS2 (we serve 8.3 through the legacy SEARCH path,
  which is enough for Win95 Explorer but loses the original casing/length)
- Multiple shares — everything is one share named `HOST`
- Authentication — guest access only
