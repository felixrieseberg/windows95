# SMB1 server for Windows 95

Zero-dependency SMB1/CIFS server that lets Windows 95 (running inside v86) mount
a host folder as a network drive. Read-only. ~1500 lines.

## Stack

| Layer | File | What it does |
|---|---|---|
| Ethernet/IP/UDP | `nbns.ts` | Taps `bus.register("net0-send")` for raw frames, parses UDP 137, builds reply frames manually |
| NetBIOS Name Service | `nbns.ts` | Answers Node Status (0x21) and Name Query (0x20) — Win95 won't try TCP until this resolves |
| TCP 139 hook | `index.ts` | Monkeypatches `adapter.on_tcp_connection` (old v86) or registers `tcp-connection` bus event (new v86) |
| NetBIOS Session | `netbios.ts` | RFC 1002 framing — 4-byte header, reassembles fragmented TCP |
| SMB1 wire | `wire.ts`, `smb.ts` | Little-endian Reader/Writer, header parse/build |
| Commands | `server.ts` | NEGOTIATE, SESSION_SETUP, TREE_CONNECT, TRANSACTION (RAP), TRANSACTION2, SEARCH, OPEN, READ, CLOSE, etc. |

## Protocol gotchas (learned the hard way)

### NEGOTIATE: don't pick NT LM 0.12 unless you implement the NT response
Win95 offers `["PC NETWORK PROGRAM 1.0", "MICROSOFT NETWORKS 3.0", "DOS LM1.2X002",
"DOS LANMAN2.1", "Windows for Workgroups 3.1a", "NT LM 0.12"]`. We send the
13-word LANMAN-style negotiate response. If you pick `NT LM 0.12` and send 13
words, Win95 silently drops the connection — it expects the 17-word NT response
with capability flags. Pick `DOS LANMAN2.1` instead.

### SEARCH (0x81): single-file probes vs wildcard listings
`SEARCH "\FOO.TXT"` is a stat probe — Win95 wants exactly one entry back. If you
prepend `.` and `..` like you would for `\*`, Win95 reads the first entry (`.`,
attr=DIRECTORY) and treats `FOO.TXT` as a folder. Only prepend dots when the
pattern contains `*` or `?`.

### SEARCH filename: null-terminate before padding
The 13-byte name field must be `name\0\0\0...`, not `name   \0`. Space-padding
before the null means Win95 sees `FOO.BAT   ` (with trailing spaces) and can't
match the `.BAT` file association.

### 8.3 mapping needs `~N` suffixes, not just truncation
84 files in a real Downloads folder → most have long names → naive truncation
gives 30 copies of `15_UNDER.PDF`. Use Windows-style `~N` and keep a per-dir
SFN→real-name map so OPEN can find the actual file. `resolve()` walks each path
component through the map.

### RAP (TRANSACTION 0x25): Win95 loops until ServerGetInfo answers
After `TREE_CONNECT \\HOST\IPC$`, Win95 sends RAP NetShareEnum (func=0, `WrLeh`/
`B13BWz`) then NetWkstaGetInfo (func=63, `WrLh`/`zzzBBzz`) then NetServerGetInfo
(func=13, `WrLh`/`B16BBDz`). The data descriptor tells you the layout:
`B16` = 16-byte inline name, `z` = string pointer (4 bytes into a heap that
follows the struct), `B` = byte, `D` = dword. We synthesize the struct from the
descriptor so any info-level Win95 asks for gets a plausible reply.

### Virtual files need to be visible to QUERY_INFORMATION too
The injected `_MAPZ.BAT` showed in listings but Win95 stats before opening,
got ERR_BADFILE, said "cannot find". Hook `getVirtual()` into QUERY_INFO and
CHECK_DIRECTORY, not just OPEN.

## v86 integration (the hard part)

### Old v86 (Feb 2025 — what currently boots): connection theft
The `tcp-connection` bus event was added later. The old API is
`adapter.on_tcp_connection(packet, tuple)` — you must construct `TCPConnection`
yourself, but it's closure-scoped in Closure-compiled `libv86.js`. Worse,
`.on()`/`.emit()`/`events_handlers` were dead-code-eliminated; the data callback
is a flat `.on_data` property.

The trick: shadow `adapter.receive` with a no-op (own-prop on a prototype method
— **must** restore via `delete`, not reassignment), call the original handler
with a fake port-80 SYN, take the `TCPConnection` it builds, re-aim it at port
139. `accept(packet)` overwrites all routing fields (sport/dport/hsrc/psrc/seq/
ack), `.on_data = handler` replaces the HTTP callback.

### New v86: just `bus.register("tcp-connection")`
Clean API. The new code keeps both paths; the bus event is a no-op on old builds.

### Exception in a bus listener kills the emulator
`bus.send` doesn't catch listener exceptions. They bubble through ne2k →
`port_write8` → wasm. Win95 freezes. The corrupted state then gets saved by
`onbeforeunload`. Wrap everything that runs in a callback.

## Security
- Read-only.
- Path traversal blocked lexically (`../`) AND through symlinks: `realpathSync`
  the deepest existing ancestor, re-append the unresolved tail, confirm under
  root. Symlinks pointing inside the share still work; symlinks pointing out
  return ERR_BADFILE.
- Share path validated in main-process IPC (`realpathSync` + `isDirectory()`).

## Tests
`test-standalone.ts` — 35 protocol tests, full round-trips with real file I/O.
Run: `npx tsc --ignoreConfig --module commonjs --target es2020 --esModuleInterop
--moduleResolution bundler --outDir /tmp/smb-test --skipLibCheck
src/renderer/smb/*.ts && node /tmp/smb-test/test-standalone.js`
