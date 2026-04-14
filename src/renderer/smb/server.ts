// SMB1 server core. One instance per TCP connection. State is per-session
// (UID/TID/FID tables). Everything is read-only for the spike.

import * as fs from "fs";
import * as path from "path";
import { Reader, Writer } from "./wire";
import {
  parseSmb, buildSmb, dosError, andxNone, cmdName, SmbHeader,
  CMD_NEGOTIATE, CMD_SESSION_SETUP_ANDX, CMD_TREE_CONNECT_ANDX,
  CMD_TREE_DISCONNECT, CMD_LOGOFF_ANDX, CMD_NT_CREATE_ANDX, CMD_OPEN_ANDX,
  CMD_READ, CMD_READ_RAW, CMD_READ_ANDX, CMD_SEEK, CMD_CLOSE, CMD_TRANSACTION, CMD_TRANSACTION2, CMD_ECHO,
  CMD_QUERY_INFORMATION, CMD_FIND_CLOSE2, CMD_CHECK_DIRECTORY, CMD_SEARCH,
  TRANS2_FIND_FIRST2, TRANS2_FIND_NEXT2, TRANS2_QUERY_FS_INFO, TRANS2_QUERY_PATH_INFO,
  ERRDOS, ERRSRV, ERR_BADFILE, ERR_BADPATH, ERR_BADFID, ERR_NOFILES, ERR_BADFUNC,
} from "./smb";

const log = (...a: unknown[]) => console.log("[smb]", ...a);
const hex = (b: Uint8Array, n = 64) =>
  Array.from(b.slice(0, n)).map(x => x.toString(16).padStart(2, "0")).join(" ") +
  (b.length > n ? ` …(+${b.length - n})` : "");

/**
 * Derive the share name shown under \\HOST from the mounted directory's
 * basename. NetShareEnum's B13 field caps it at 12 chars + null; SMB share
 * names are case-insensitive OEM, so uppercase and strip to LANMAN-safe chars.
 */
export function shareNameFor(rootPath: string): string {
  const base = path.basename(rootPath)
    .replace(/[^A-Za-z0-9_$~!#%&'()@^`{}.-]/g, "")
    .toUpperCase()
    .slice(0, 12);
  // A folder literally named "Tools" or "ipc$" would shadow a reserved share
  // and become unreachable — fall back to the generic name instead.
  return (!base || base === TOOLS_SHARE || base === "IPC$") ? "HOST" : base;
}

interface OpenFile {
  hostPath: string;
  fd: number;
  size: number;
  isDir: boolean;
  pos?: number;
  virtual?: Uint8Array;
}

interface DirEntry {
  name: string;       // display name (long, sanitized for Win95)
  sfn: string;        // 8.3 name shown to the client
  attr: number;       // DOS attribute word
  stat: { isDirectory(): boolean; size: number; mtime: Date };
}

interface SearchState {
  entries: DirEntry[];
  idx: number;
}

const ATTR_HIDDEN = 0x02;
const ATTR_SYSTEM = 0x04;
const ATTR_DIRECTORY = 0x10;
const ATTR_ARCHIVE = 0x20;

// Host-side junk that shouldn't clutter the guest's view. Marked H+S so
// Explorer hides it by default but "View → Show all files" still works.
const SYSTEM_JUNK = new Set([
  ".ds_store", ".localized", ".trashes", ".fseventsd", ".spotlight-v100",
  ".documentrevisions-v100", ".temporaryitems", ".volumeicon.icns",
  "desktop.ini", "thumbs.db", "ehthumbs.db",
]);

function hostAttrs(realName: string, isDir: boolean): number {
  let a = isDir ? ATTR_DIRECTORY : ATTR_ARCHIVE;
  if (SYSTEM_JUNK.has(realName.toLowerCase())) a |= ATTR_HIDDEN | ATTR_SYSTEM;
  else if (realName.startsWith(".")) a |= ATTR_HIDDEN;
  return a;
}

// Tree IDs. TID routes every file op: SHARE = the user's mounted folder,
// TOOLS = a purely synthetic share holding _MAPZ.BAT and friends so they
// don't clutter the user's directory listing.
const TID_SHARE = 1;
const TID_TOOLS = 2;
const TID_IPC = 0xfffe;
export const TOOLS_SHARE = "TOOLS";

const NT_DIALECT = "NT LM 0.12";
const DIALECTS = [
  // Prefer NT LM 0.12 — it's the only dialect where Win95's redirector
  // switches to TRANS2/FIND_FIRST2 (long filenames). On LANMAN it falls back
  // to CMD_SEARCH whose 13-byte name field hard-caps us at 8.3. The two
  // dialects have different negotiate-response shapes (17-word NT vs 13-word
  // LM), branched on below. Win95's strings have a "DOS " prefix vs the bare
  // names NT/2000 send.
  NT_DIALECT,
  "DOS LANMAN2.1",
  "LANMAN2.1",
  "Windows for Workgroups 3.1a",
  "DOS LM1.2X002",
  "LM1.2X002",
];

export class SmbSession {
  private uid = 0;
  private tid = 0;
  private nextFid = 1;
  private nextSid = 1;
  private fids = new Map<number, OpenFile>();
  private sids = new Map<number, SearchState>();
  // 8.3 → real name, per host directory. SEARCH builds this; OPEN/QUERY
  // consult it so clicking "15UNDE~2.PDF" finds the right long-named file.
  private sfnMaps = new Map<string, Map<string, string>>();
  private readonly realRoot: string;
  private readonly toolsRoot?: string;
  public readonly shareName: string;
  public capture = !!process.env.WIN95_SMB_CAPTURE;

  // Synthetic files served at the share root. They show up in directory
  // listings and OPEN/READ work, but they don't exist on the host fs —
  // just in-memory bytes. _MAPZ.BAT maps the share to Z: when the user
  // double-clicks it; copying it to C:\WINDOWS\Start Menu\Programs\StartUp
  // makes the mapping survive reboots.
  private readonly virtuals: Map<string, Uint8Array>;

  constructor(rootPath: string, toolsRoot?: string) {
    this.realRoot = fs.realpathSync(rootPath);
    this.shareName = shareNameFor(this.realRoot);
    const enc = (s: string) => new TextEncoder().encode(s);
    this.virtuals = new Map([
      ["README.TXT", enc(
        "windows95 tools\r\n" +
        "----------------\r\n" +
        "These files are served by the windows95 app from\r\n" +
        `  ${toolsRoot ?? "(in-memory)"}\r\n\r\n` +
        `  \\\\HOST\\${this.shareName.padEnd(12)} your shared folder (${this.realRoot})\r\n` +
        `  \\\\HOST\\${TOOLS_SHARE.padEnd(12)} this folder\r\n\r\n` +
        "_MAPZ.BAT   maps your shared folder to drive Z:. Copy it to\r\n" +
        "            C:\\WINDOWS\\Start Menu\\Programs\\StartUp to reconnect\r\n" +
        "            on every boot.\r\n"
      )],
      ["_MAPZ.BAT", enc(
        "@ECHO OFF\r\n" +
        `NET USE Z: \\\\HOST\\${this.shareName}\r\n` +
        "ECHO Share mapped to Z:\r\n" +
        "ECHO Copy this file to C:\\WINDOWS\\STARTM~1\\PROGRAMS\\STARTUP\r\n" +
        "ECHO to reconnect automatically on every boot.\r\n" +
        "PAUSE\r\n"
      )],
    ]);
    this.toolsRoot = toolsRoot && fs.existsSync(toolsRoot)
      ? fs.realpathSync(toolsRoot)
      : undefined;
  }

  private getVirtual(tid: number, smbPath: string): Uint8Array | undefined {
    if (tid !== TID_TOOLS) return undefined;
    const p = smbPath.replace(/^[\\\/]+/, "").replace(/\\/g, "/");
    if (p.includes("/")) return undefined; // root-only
    return this.virtuals.get(p.toUpperCase());
  }

  private listTools(): DirEntry[] {
    const now = new Date();
    const stat = (size: number) => ({ isDirectory: () => false, size, mtime: now });
    return Array.from(this.virtuals, ([name, bytes]) =>
      ({ name, sfn: name, attr: ATTR_ARCHIVE, stat: stat(bytes.length) }));
  }

  /**
   * Directory listing for SEARCH/FIND_FIRST2. Overlays the synthetic
   * README/_MAPZ at the TOOLS root; everything else hits the backing fs.
   * Returns null when the directory doesn't resolve (caller emits BADPATH).
   */
  private listForSearch(tid: number, dirPart: string):
      { all: DirEntry[]; dotStat: DirEntry["stat"] } | null {
    const hostDir = this.resolve(tid, dirPart || "\\");
    const hostOk = !!hostDir && fs.existsSync(hostDir);
    if (tid === TID_TOOLS && isRootPath(dirPart)) {
      return {
        all: hostOk ? [...this.listTools(), ...this.listDir(hostDir!)] : this.listTools(),
        dotStat: hostOk ? fs.statSync(hostDir!)
                        : { isDirectory: () => true, size: 0, mtime: new Date() },
      };
    }
    if (!hostOk) return null;
    return { all: this.listDir(hostDir!), dotStat: fs.statSync(hostDir!) };
  }

  /**
   * Read a host directory once, generate stable 8.3 names, cache the mapping.
   * The cache lives for the session — directory contents changing underneath
   * is OK (entries vanish or appear), but the SFN→real mapping for existing
   * files stays put so a follow-up OPEN finds the same file SEARCH listed.
   */
  private listDir(hostDir: string): DirEntry[] {
    const realNames = fs.readdirSync(hostDir);
    const sfnMap = buildSfnMap(realNames);
    this.sfnMaps.set(hostDir, sfnMap);

    const entries: DirEntry[] = [];
    const aliases: [string, string][] = [];
    for (const [sfn, real] of sfnMap) {
      try {
        // The long name we send is single-byte OEM. Anything outside that
        // (emoji, CJK) truncates to its low byte, which can land on a
        // Windows-illegal char and wedge Explorer's icon renderer. Sanitize
        // for display and add the sanitized form to the lookup map so OPEN
        // on the displayed name still finds the real file.
        const name = displayName(real);
        if (name !== real) aliases.push([name.toUpperCase(), real]);
        const stat = fs.statSync(path.join(hostDir, real));
        entries.push({ name, sfn, attr: hostAttrs(real, stat.isDirectory()), stat });
      } catch { /* raced — skip */ }
    }
    for (const [k, v] of aliases) sfnMap.set(k, v);
    return entries;
  }

  /** Main entry: one SMB request → zero or one SMB reply */
  handle(buf: Uint8Array): Uint8Array | null {
    const req = parseSmb(buf);
    if (!req) {
      log("bad SMB magic", hex(buf, 8));
      return null;
    }

    if (this.capture) {
      log(`← ${cmdName[req.cmd] ?? "0x" + req.cmd.toString(16)} ` +
          `tid=${req.tid} uid=${req.uid} mid=${req.mid} ` +
          `wc=${req.wordCount} bc=${req.byteCount}`);
      if (req.wordCount) log("   words:", hex(req.words));
      if (req.byteCount) log("   bytes:", hex(req.bytes));
    }

    try {
      switch (req.cmd) {
        case CMD_NEGOTIATE:        return this.negotiate(req);
        case CMD_SESSION_SETUP_ANDX: return this.sessionSetup(req);
        case CMD_TREE_CONNECT_ANDX:  return this.treeConnect(req);
        case CMD_TREE_DISCONNECT:    return this.treeDisconnect(req);
        case CMD_LOGOFF_ANDX:        return this.logoff(req);
        case CMD_NT_CREATE_ANDX:     return this.ntCreate(req);
        case CMD_OPEN_ANDX:          return this.openAndx(req);
        case CMD_READ:               return this.coreRead(req);
        // READ_RAW reply has no SMB header — handle outside the generic
        // catch so an fs error becomes a 0-byte frame, not garbage data.
        case CMD_READ_RAW:
          try { return this.readRaw(req); } catch { return new Uint8Array(0); }
        case CMD_READ_ANDX:          return this.read(req);
        case CMD_SEEK:               return this.seek(req);
        case CMD_CLOSE:              return this.close(req);
        case CMD_TRANSACTION:        return this.transRap(req);
        case CMD_TRANSACTION2:       return this.trans2(req);
        case CMD_ECHO:               return this.echo(req);
        case CMD_QUERY_INFORMATION:  return this.queryInfo(req);
        case CMD_CHECK_DIRECTORY:    return this.checkDirectory(req);
        case CMD_FIND_CLOSE2:        return this.findClose(req);
        case CMD_SEARCH:             return this.search(req);
        default:
          log(`⚠ unhandled cmd 0x${req.cmd.toString(16)}`);
          return buildSmb(req, req.cmd, dosError(ERRSRV, ERR_BADFUNC),
                          new Uint8Array(0), new Uint8Array(0));
      }
    } catch (e) {
      log("handler threw:", e);
      return buildSmb(req, req.cmd, dosError(ERRSRV, 0x02 /* ERRerror */),
                      new Uint8Array(0), new Uint8Array(0));
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // NEGOTIATE: client sends a list of dialect strings; we pick one by index.
  // ───────────────────────────────────────────────────────────────────────────
  private negotiate(req: SmbHeader): Uint8Array {
    // bytes block is: 0x02 <dialect>\0 0x02 <dialect>\0 ...
    const offered: string[] = [];
    let i = 0;
    while (i < req.bytes.length) {
      if (req.bytes[i] !== 0x02) break;
      i++;
      let end = i;
      while (end < req.bytes.length && req.bytes[end] !== 0) end++;
      offered.push(String.fromCharCode(...req.bytes.slice(i, end)));
      i = end + 1;
    }
    log("dialects offered:", offered);

    let pick = -1, picked = "";
    for (const d of DIALECTS) {
      const idx = offered.indexOf(d);
      if (idx >= 0) { pick = idx; picked = d; break; }
    }
    if (pick < 0) {
      // refuse — but Win95 always offers at least LANMAN
      const w = new Writer().u16(0xffff).build();
      return buildSmb(req, CMD_NEGOTIATE, 0, w, new Uint8Array(0));
    }
    log(`negotiate → "${picked}" (idx ${pick})`);

    if (picked === NT_DIALECT) {
      // NT LM 0.12 response: 17 words. Capabilities = 0 keeps Win95 on the
      // codepaths we already implement: OEM strings (no CAP_UNICODE), DOS
      // errors (no CAP_NT_STATUS), SMB_INFO_STANDARD find (no CAP_NT_FIND),
      // OPEN_ANDX over NT_CREATE (no CAP_NT_SMBS). The dialect alone is what
      // flips the redirector from CMD_SEARCH to TRANS2/FIND_FIRST2.
      const words = new Writer()
        .u16(pick)       // DialectIndex
        .u8(0x00)        // SecurityMode: share-level, no challenge
        .u16(1)          // MaxMpxCount
        .u16(1)          // MaxNumberVcs
        .u32(16384)      // MaxBufferSize
        .u32(65535)      // MaxRawSize
        .u32(0)          // SessionKey
        .u32(0x00000001) // Capabilities: CAP_RAW_MODE only
        .u64(0)          // SystemTime (FILETIME — Win95 ignores 0)
        .u16(0)          // ServerTimeZone
        .u8(0)           // ChallengeLength = 0
        .build();
      const bytes = new Writer().cstr("WORKGROUP").build();
      // FLAGS2_LONG_NAMES on the negotiate reply itself signals "I can return
      // long names" — Win95 keys its FIND_FIRST2 info-level on this bit.
      return buildSmb(req, CMD_NEGOTIATE, 0, words, bytes, { flags2: 0x0001 });
    }

    // LM 2.1 response (13 words). Share-level security, no challenge.
    const words = new Writer()
      .u16(pick)       // DialectIndex
      .u16(0x0000)     // SecurityMode: share-level, no challenge
      .u16(16384)      // MaxBufferSize
      .u16(1)          // MaxMpxCount
      .u16(1)          // MaxNumberVcs
      .u16(0x0001)     // RawMode: read-raw supported
      .u32(0)          // SessionKey
      .u16(0)          // ServerTime (we cheat — Win95 doesn't care)
      .u16(0)          // ServerDate
      .u16(0)          // ServerTimeZone
      .u16(0)          // ChallengeLength = 0 (no challenge → null session)
      .u16(0)          // reserved
      .build();

    // bytes: empty challenge + domain name (OEM)
    const bytes = new Writer().cstr("WORKGROUP").build();

    return buildSmb(req, CMD_NEGOTIATE, 0, words, bytes);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SESSION_SETUP_ANDX: auth. We accept anything as guest.
  // ───────────────────────────────────────────────────────────────────────────
  private sessionSetup(req: SmbHeader): Uint8Array {
    this.uid = 1;
    const words = new Writer()
      .bytes(andxNone())
      .u16(0x0001)     // Action: logged in as GUEST
      .build();
    const bytes = new Writer()
      .cstr("Unix")    // NativeOS
      .cstr("v86")     // NativeLanMan
      .cstr("WORKGROUP")
      .build();
    return buildSmb(req, CMD_SESSION_SETUP_ANDX, 0, words, bytes, { uid: this.uid });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TREE_CONNECT_ANDX: connect to a share. We expose one share: HOST → rootPath
  // ───────────────────────────────────────────────────────────────────────────
  private treeConnect(req: SmbHeader): Uint8Array {
    // words: AndX(4) + Flags(2) + PasswordLength(2)
    const wr = new Reader(req.words);
    wr.skip(4); wr.skip(2);
    const pwLen = wr.u16();
    // bytes: Password(pwLen) + Path\0 + Service\0
    const br = new Reader(req.bytes);
    br.skip(pwLen);
    const reqPath = (req.flags2 & 0x8000) ? br.ucs2() : br.cstr();
    const service = br.cstr();
    log(`tree connect: path="${reqPath}" service="${service}"`);

    // Path is \\SERVER\SHARE — route by the share segment. Unknown names fall
    // through to the user share so a stale `net use` (e.g. from before the
    // user re-pointed the mounted folder) still connects to *something*, and
    // so W95TOOLS.EXE can hard-code \\HOST\HOST when it auto-maps Z:.
    const share = reqPath.split(/[\\\/]/).pop()?.toUpperCase() ?? "";
    const isIpc = share === "IPC$";
    this.tid = isIpc ? TID_IPC : share === TOOLS_SHARE ? TID_TOOLS : TID_SHARE;

    const words = new Writer()
      .bytes(andxNone())
      .u16(0x0000)     // OptionalSupport
      .build();
    // bytes: Service\0 + NativeFileSystem\0 (both OEM)
    const bytes = new Writer()
      .cstr(isIpc ? "IPC" : "A:")
      .cstr(isIpc ? "" : "FAT")
      .build();
    return buildSmb(req, CMD_TREE_CONNECT_ANDX, 0, words, bytes, { tid: this.tid });
  }

  private treeDisconnect(req: SmbHeader): Uint8Array {
    return buildSmb(req, CMD_TREE_DISCONNECT, 0, new Uint8Array(0), new Uint8Array(0));
  }

  private logoff(req: SmbHeader): Uint8Array {
    const words = new Writer().bytes(andxNone()).build();
    return buildSmb(req, CMD_LOGOFF_ANDX, 0, words, new Uint8Array(0));
  }

  private echo(req: SmbHeader): Uint8Array {
    const words = new Writer().u16(0).build(); // SequenceNumber
    return buildSmb(req, CMD_ECHO, 0, words, req.bytes);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Path resolution: SMB paths are \-separated, leading \, possibly with
  // wildcards. The client sends 8.3 names (that's all SEARCH gives it), so
  // each component is mapped through the SFN table. Refuses traversal,
  // including via symlinks.
  // ───────────────────────────────────────────────────────────────────────────
  private resolve(tid: number, smbPath: string): string | null {
    const root = tid === TID_SHARE ? this.realRoot
               : tid === TID_TOOLS ? this.toolsRoot
               : undefined;
    if (!root) return null;
    let p = smbPath.replace(/\\/g, "/");
    if (p.startsWith("/")) p = p.slice(1);

    // Walk component-by-component, translating each 8.3 name to its real name.
    // Unmapped components pass through verbatim — they might be already-real
    // names (if the client somehow learned them) or they'll fail existence
    // checks below.
    const parts = p ? p.split("/") : [];
    let cur = root;
    for (const part of parts) {
      if (!part || part === ".") continue;
      const map = this.sfnMaps.get(cur);
      const real = map?.get(part.toUpperCase()) ?? part;
      cur = path.join(cur, real);
    }
    const candidate = cur;

    // Lexical check first — fast reject for ../../ without touching disk
    const lex = path.relative(root, candidate);
    if (lex.startsWith("..") || path.isAbsolute(lex)) return null;

    // Symlink check: realpath the deepest existing ancestor, then re-append
    // the unresolved tail. This catches a symlink at any level pointing
    // outside the share, without requiring the leaf to exist.
    let probe = candidate;
    let tail = "";
    for (;;) {
      try {
        probe = fs.realpathSync(probe);
        break;
      } catch {
        const parent = path.dirname(probe);
        if (parent === probe) return null;
        tail = path.join(path.basename(probe), tail);
        probe = parent;
      }
    }
    const real = tail ? path.join(probe, tail) : probe;

    if (real !== root && !real.startsWith(root + path.sep)) {
      return null;
    }
    return real;
  }

  private smbPathFromBytes(req: SmbHeader, offset = 0): string {
    const br = new Reader(req.bytes, offset);
    // Some commands prefix path with a 0x04 buffer-format byte
    if (req.bytes[offset] === 0x04) br.u8();
    return (req.flags2 & 0x8000) ? br.ucs2() : br.cstr();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // QUERY_INFORMATION (0x08): legacy stat-by-path
  // ───────────────────────────────────────────────────────────────────────────
  private queryInfo(req: SmbHeader): Uint8Array {
    const smbPath = this.smbPathFromBytes(req);

    const v = this.getVirtual(req.tid, smbPath);
    if (v) {
      const words = new Writer()
        .u16(ATTR_ARCHIVE)
        .u32(unixToSmbTime(new Date()))
        .u32(v.length)
        .zero(10)
        .build();
      return buildSmb(req, CMD_QUERY_INFORMATION, 0, words, new Uint8Array(0));
    }

    const hostPath = this.resolve(req.tid, smbPath);
    if (!hostPath || !fs.existsSync(hostPath)) {
      return buildSmb(req, CMD_QUERY_INFORMATION, dosError(ERRDOS, ERR_BADFILE),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const st = fs.statSync(hostPath);
    const words = new Writer()
      .u16(hostAttrs(path.basename(hostPath), st.isDirectory()))
      .u32(unixToSmbTime(st.mtime))
      .u32(Math.min(st.size, 0xffffffff))
      .zero(10) // reserved
      .build();
    return buildSmb(req, CMD_QUERY_INFORMATION, 0, words, new Uint8Array(0));
  }

  private checkDirectory(req: SmbHeader): Uint8Array {
    const smbPath = this.smbPathFromBytes(req);
    const hostPath = this.resolve(req.tid, smbPath);
    if (!hostPath || !fs.existsSync(hostPath) || !fs.statSync(hostPath).isDirectory()) {
      return buildSmb(req, CMD_CHECK_DIRECTORY, dosError(ERRDOS, ERR_BADPATH),
                      new Uint8Array(0), new Uint8Array(0));
    }
    return buildSmb(req, CMD_CHECK_DIRECTORY, 0, new Uint8Array(0), new Uint8Array(0));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OPEN_ANDX (0x2d): the older open. Win95 uses this if NT_CREATE fails.
  // ───────────────────────────────────────────────────────────────────────────
  private openAndx(req: SmbHeader): Uint8Array {
    // words: AndX(4) Flags(2) Access(2) SearchAttrs(2) FileAttrs(2)
    //        CreateTime(4) OpenFunc(2) AllocSize(4) Timeout(4) Reserved(4)
    const smbPath = this.smbPathFromBytes(req);
    return this.doOpen(req, CMD_OPEN_ANDX, smbPath);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // NT_CREATE_ANDX (0xa2)
  // ───────────────────────────────────────────────────────────────────────────
  private ntCreate(req: SmbHeader): Uint8Array {
    // words layout: AndX(4) Reserved(1) NameLength(2) Flags(4) RootFID(4)
    //   DesiredAccess(4) AllocSize(8) ExtAttrs(4) ShareAccess(4)
    //   CreateDisp(4) CreateOpts(4) Impersonation(4) SecurityFlags(1)
    const wr = new Reader(req.words);
    wr.skip(4); wr.skip(1);
    const nameLen = wr.u16();
    // bytes: filename. NT_CREATE puts a leading pad byte if unicode-aligned;
    // since we never claim FLAGS2_UNICODE in our replies, Win95 sticks to OEM.
    let off = 0;
    // NT_CREATE doesn't use the 0x04 prefix; name is at start (sometimes
    // with a single null pad we strip)
    if (req.bytes[0] === 0) off = 1;
    const nameBytes = req.bytes.slice(off, off + nameLen);
    const smbPath = String.fromCharCode(...nameBytes).replace(/\0+$/, "");
    return this.doOpen(req, CMD_NT_CREATE_ANDX, smbPath);
  }

  private doOpen(req: SmbHeader, cmd: number, smbPath: string): Uint8Array {
    const vbytes = this.getVirtual(req.tid, smbPath);
    if (vbytes) {
      const fid = this.nextFid++;
      this.fids.set(fid, { hostPath: `<virtual>${smbPath}`, fd: -1, size: vbytes.length, isDir: false, virtual: vbytes });
      log(`open "${smbPath}" → virtual (${vbytes.length} bytes)`);
      return this.buildOpenReply(req, cmd, fid, ATTR_ARCHIVE, vbytes.length, new Date());
    }

    const hostPath = this.resolve(req.tid, smbPath);
    log(`open "${smbPath}" → ${hostPath}`);
    if (!hostPath || !fs.existsSync(hostPath)) {
      return buildSmb(req, cmd, dosError(ERRDOS, ERR_BADFILE),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const st = fs.statSync(hostPath);
    const fid = this.nextFid++;
    const isDir = st.isDirectory();
    const fd = isDir ? -1 : fs.openSync(hostPath, "r");
    this.fids.set(fid, { hostPath, fd, size: st.size, isDir });
    return this.buildOpenReply(req, cmd, fid,
      hostAttrs(path.basename(hostPath), isDir), st.size, st.mtime);
  }

  private buildOpenReply(req: SmbHeader, cmd: number, fid: number, attrs: number, size: number, mtime: Date): Uint8Array {
    const isDir = (attrs & ATTR_DIRECTORY) !== 0;
    const sz = Math.min(size, 0xffffffff);
    if (cmd === CMD_OPEN_ANDX) {
      const words = new Writer()
        .bytes(andxNone())
        .u16(fid)
        .u16(attrs)
        .u32(unixToSmbTime(mtime))
        .u32(sz)
        .u16(0)      // GrantedAccess: read
        .u16(0)      // FileType: disk
        .u16(0)      // DeviceState
        .u16(1)      // Action: file existed and was opened
        .u32(0)      // ServerFid
        .u16(0)      // Reserved
        .build();
      return buildSmb(req, cmd, 0, words, new Uint8Array(0));
    }

    // NT_CREATE_ANDX response: 34 words
    const words = new Writer()
      .bytes(andxNone())
      .u8(0)       // OplockLevel
      .u16(fid)
      .u32(1)      // CreateAction: FILE_OPENED
      .u64(0)      // CreationTime
      .u64(0)      // LastAccessTime
      .u64(0)      // LastWriteTime
      .u64(0)      // ChangeTime
      .u32(attrs)  // ExtFileAttributes
      .u64(sz)     // AllocationSize
      .u64(sz)     // EndOfFile
      .u16(0)      // FileType: disk
      .u16(0)      // DeviceState
      .u8(isDir ? 1 : 0) // IsDirectory
      .build();
    return buildSmb(req, cmd, 0, words, new Uint8Array(0));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // READ_ANDX (0x2e)
  // ───────────────────────────────────────────────────────────────────────────
  private read(req: SmbHeader): Uint8Array {
    const wr = new Reader(req.words);
    wr.skip(4); // AndX
    const fid = wr.u16();
    const offset = wr.u32();
    const maxCount = wr.u16();
    // (MinCount, Timeout/MaxCountHigh, Remaining, OffsetHigh — we ignore)

    const file = this.fids.get(fid);
    if (!file || file.isDir) {
      return buildSmb(req, CMD_READ_ANDX, dosError(ERRDOS, ERR_BADFID),
                      new Uint8Array(0), new Uint8Array(0));
    }

    const want = Math.min(maxCount, 16384, Math.max(0, file.size - offset));
    let data: Uint8Array;
    let nread = 0;
    if (file.virtual) {
      data = file.virtual.slice(offset, offset + want);
      nread = data.length;
    } else {
      const buf = Buffer.alloc(want);
      if (want > 0) nread = fs.readSync(file.fd, buf, 0, want, offset);
      data = buf;
    }

    // Response data block has a 1-byte pad before the file bytes so DataOffset
    // can be aligned. DataOffset is relative to the start of the SMB header.
    // header(32) + wc(1) + words(24) + bcc(2) + pad(1) = 60
    const words = new Writer()
      .bytes(andxNone())
      .u16(0xffff)   // Remaining (legacy, -1 = unknown)
      .u16(0)        // DataCompactionMode
      .u16(0)        // Reserved
      .u16(nread)    // DataLength
      .u16(60)       // DataOffset
      .zero(10)      // Reserved
      .build();
    const bytes = new Uint8Array(1 + nread);
    bytes.set(data.subarray(0, nread), 1);
    return buildSmb(req, CMD_READ_ANDX, 0, words, bytes);
  }

  // READ (0x0a): the original core-protocol read. With Capabilities=0 in our
  // NT negotiate, Win95's redirector uses this instead of READ_ANDX.
  // Request words: FID(2) Count(2) Offset(4) Remaining(2).
  // Response words: Count(2) Reserved(8); bytes: 0x01 DataLen(2) Data.
  private coreRead(req: SmbHeader): Uint8Array {
    const wr = new Reader(req.words);
    const fid = wr.u16();
    const count = wr.u16();
    const offset = wr.u32();
    const data = this.readBytes(fid, offset, count);
    if (!data) {
      return buildSmb(req, CMD_READ, dosError(ERRDOS, ERR_BADFID),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const words = new Writer().u16(data.length).zero(8).build();
    const bytes = new Uint8Array(3 + data.length);
    bytes[0] = 0x01;
    bytes[1] = data.length & 0xff;
    bytes[2] = (data.length >> 8) & 0xff;
    bytes.set(data, 3);
    return buildSmb(req, CMD_READ, 0, words, bytes);
  }

  private readBytes(fid: number, offset: number, count: number, cap = 16384): Uint8Array | null {
    const file = this.fids.get(fid);
    if (!file || file.isDir) return null;
    const want = Math.min(count, cap, Math.max(0, file.size - offset));
    if (file.virtual) return file.virtual.slice(offset, offset + want);
    const buf = Buffer.alloc(want);
    const n = want > 0 ? fs.readSync(file.fd, buf, 0, want, offset) : 0;
    return buf.subarray(0, n);
  }

  // READ_RAW (0x1a): Win95's bulk-transfer path. The response is *not* an SMB
  // message — just the raw file bytes inside a NetBIOS frame, length implied
  // by the NB header. On error/EOF we send zero bytes and the client falls
  // back to a normal READ to get the actual error code.
  private readRaw(req: SmbHeader): Uint8Array {
    const wr = new Reader(req.words);
    const fid = wr.u16();
    const offset = wr.u32();
    const maxCount = wr.u16();
    return this.readBytes(fid, offset, maxCount, 65535) ?? new Uint8Array(0);
  }

  // SEEK (0x12): legacy lseek. READ_ANDX carries an explicit offset so we
  // don't need a real cursor — but Win95 (Notepad in particular) opens,
  // SEEKs to end-of-file with mode=2 offset=0 to learn the size, then
  // re-opens for the actual read. ERR_BADFUNC here makes Explorer wedge.
  private seek(req: SmbHeader): Uint8Array {
    const wr = new Reader(req.words);
    const fid = wr.u16();
    const mode = wr.u16();
    const off = wr.u32() | 0;  // signed
    const file = this.fids.get(fid);
    if (!file) {
      return buildSmb(req, CMD_SEEK, dosError(ERRDOS, ERR_BADFID),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const base = mode === 2 ? file.size : mode === 1 ? (file.pos ?? 0) : 0;
    file.pos = Math.max(0, base + off);
    const words = new Writer().u32(Math.min(file.pos, 0xffffffff)).build();
    return buildSmb(req, CMD_SEEK, 0, words, new Uint8Array(0));
  }

  private close(req: SmbHeader): Uint8Array {
    const wr = new Reader(req.words);
    const fid = wr.u16();
    const file = this.fids.get(fid);
    if (file) {
      if (file.fd >= 0) try { fs.closeSync(file.fd); } catch {}
      this.fids.delete(fid);
    }
    return buildSmb(req, CMD_CLOSE, 0, new Uint8Array(0), new Uint8Array(0));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SEARCH (0x81): the original DOS-era directory listing. We use this when
  // the client picks LANMAN — TRANS2/FIND_FIRST2 came later. 43-byte
  // fixed-size entries, 8.3 names only. Win95 calls this for the initial
  // listing then drills into folders the same way.
  //
  // The 21-byte resume key is opaque to the client — we stuff our search
  // position into it.
  // ───────────────────────────────────────────────────────────────────────────
  private search(req: SmbHeader): Uint8Array {
    const wr = new Reader(req.words);
    const maxCount = wr.u16();
    wr.u16(); // searchAttrs

    // bytes: 0x04 + path\0 + 0x05 + resumeLen(2) + resumeKey
    const br = new Reader(req.bytes);
    if (br.u8() !== 0x04) {
      return buildSmb(req, CMD_SEARCH, dosError(ERRDOS, ERR_BADFUNC),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const pattern = br.cstr();
    if (br.u8() !== 0x05) {
      return buildSmb(req, CMD_SEARCH, dosError(ERRDOS, ERR_BADFUNC),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const resumeLen = br.u16();
    const resume = br.bytes(resumeLen);

    let sid: number, idx: number;
    if (resumeLen === 0) {
      // First call: parse pattern, do the readdir, stash a search context
      const lastSep = Math.max(pattern.lastIndexOf("\\"), pattern.lastIndexOf("/"));
      const dirPart = lastSep >= 0 ? pattern.slice(0, lastSep) : "";
      const namePart = lastSep >= 0 ? pattern.slice(lastSep + 1) : pattern;
      log(`SEARCH "${pattern}" tid=${req.tid}`);
      const listed = this.listForSearch(req.tid, dirPart);
      if (!listed) {
        return buildSmb(req, CMD_SEARCH, dosError(ERRDOS, ERR_BADPATH),
                        new Uint8Array(0), new Uint8Array(0));
      }
      const { all, dotStat } = listed;
      const matcher = wildcardMatcher(namePart);
      // Match against the SFN — that's what the client sees and asks for
      const entries = all.filter(e => matcher(e.sfn));
      // . and .. only for wildcard listings — a single-name SEARCH is a stat
      // probe and must return exactly the matching file or nothing.
      if (/[*?]/.test(namePart)) {
        entries.unshift(
          { name: "..", sfn: "..", attr: ATTR_DIRECTORY, stat: dotStat },
          { name: ".", sfn: ".", attr: ATTR_DIRECTORY, stat: dotStat },
        );
      }
      sid = this.nextSid++;
      this.sids.set(sid, { entries, idx: 0 });
      idx = 0;
    } else {
      // Continuation: pull sid+idx from our resume key (bytes 0-3)
      sid = resume[0] | (resume[1] << 8);
      idx = resume[2] | (resume[3] << 8);
    }

    const ctx = this.sids.get(sid);
    if (!ctx || idx >= ctx.entries.length) {
      this.sids.delete(sid);
      return buildSmb(req, CMD_SEARCH, dosError(ERRDOS, ERR_NOFILES),
                      new Uint8Array(0), new Uint8Array(0));
    }

    // Each entry is exactly 43 bytes:
    //   ResumeKey(21) + Attrs(1) + Time(2) + Date(2) + Size(4) + Name(13)
    const out = new Writer();
    let count = 0;
    while (idx < ctx.entries.length && count < maxCount) {
      const e = ctx.entries[idx];
      const nextIdx = idx + 1;
      // ResumeKey: first 4 bytes carry our sid+idx; rest is mandated to
      // start with reserved(1) + filename(11) — Win95 doesn't actually
      // parse it but Samba does it this way so we're consistent.
      out.u8(sid & 0xff).u8(sid >> 8).u8(nextIdx & 0xff).u8(nextIdx >> 8);
      out.zero(21 - 4);
      // Attrs
      out.u8(e.attr);
      // Time/Date
      const dt = unixToDosDateTime(e.stat.mtime);
      out.u16(dt.time).u16(dt.date);
      // Size
      out.u32(Math.min(e.stat.size, 0xffffffff));
      // Name: 13 bytes total. Null-terminate immediately after the SFN so
      // extension parsing stops there.
      for (let k = 0; k < e.sfn.length && k < 12; k++) out.u8(e.sfn.charCodeAt(k));
      out.zero(13 - Math.min(e.sfn.length, 12));
      count++;
      idx++;
    }
    ctx.idx = idx;
    if (idx >= ctx.entries.length) this.sids.delete(sid);

    // Response: words = Count(2); bytes = 0x05 + DataLength(2) + entries
    const words = new Writer().u16(count).build();
    const data = out.build();
    const bytes = new Writer().u8(0x05).u16(data.length).bytes(data).build();
    return buildSmb(req, CMD_SEARCH, 0, words, bytes);
  }

  private findClose(req: SmbHeader): Uint8Array {
    const wr = new Reader(req.words);
    const sid = wr.u16();
    this.sids.delete(sid);
    return buildSmb(req, CMD_FIND_CLOSE2, 0, new Uint8Array(0), new Uint8Array(0));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TRANSACTION2: multiplexed sub-protocol. The setup word holds the
  // subcommand; parameters and data are at offsets given in the word block.
  // ───────────────────────────────────────────────────────────────────────────
  private trans2(req: SmbHeader): Uint8Array {
    // words: TotalParamCount(2) TotalDataCount(2) MaxParamCount(2)
    //   MaxDataCount(2) MaxSetupCount(1) Reserved(1) Flags(2) Timeout(4)
    //   Reserved(2) ParamCount(2) ParamOffset(2) DataCount(2) DataOffset(2)
    //   SetupCount(1) Reserved(1) Setup[SetupCount]
    const wr = new Reader(req.words);
    wr.skip(2 + 2 + 2 + 2 + 1 + 1 + 2 + 4 + 2);
    const paramCount = wr.u16();
    const paramOffset = wr.u16();
    wr.u16(); // dataCount
    wr.u16(); // dataOffset
    const setupCount = wr.u8();
    wr.u8(); // reserved
    const subCmd = setupCount > 0 ? wr.u16() : 0xffff;

    // ParamOffset is from SMB header start; bytes block starts at
    // 32 + 1 + wc*2 + 2 = 35 + wc*2
    const bytesStart = 32 + 1 + req.wordCount * 2 + 2;
    const paramRel = paramOffset - bytesStart;
    const params = req.bytes.slice(paramRel, paramRel + paramCount);

    log(`TRANS2 sub=0x${subCmd.toString(16)} pc=${paramCount}`);

    switch (subCmd) {
      case TRANS2_FIND_FIRST2: return this.findFirst(req, params);
      case TRANS2_FIND_NEXT2:  return this.findNext(req, params);
      case TRANS2_QUERY_FS_INFO: return this.queryFsInfo(req, params);
      case TRANS2_QUERY_PATH_INFO: return this.queryPathInfo(req, params);
      default:
        return buildSmb(req, CMD_TRANSACTION2, dosError(ERRSRV, ERR_BADFUNC),
                        new Uint8Array(0), new Uint8Array(0));
    }
  }

  private findFirst(req: SmbHeader, params: Uint8Array): Uint8Array {
    // params: SearchAttrs(2) SearchCount(2) Flags(2) InfoLevel(2)
    //         SearchStorageType(4) FileName(string)
    const pr = new Reader(params);
    pr.u16(); // searchAttrs
    const searchCount = pr.u16();
    const findFlags = pr.u16();
    const infoLevel = pr.u16();
    pr.u32(); // storageType
    const pattern = (req.flags2 & 0x8000) ? pr.ucs2() : pr.cstr();
    log(`FIND_FIRST2 level=0x${infoLevel.toString(16)} flags=0x${findFlags.toString(16)} pattern="${pattern}"`);

    // pattern is like "\dir\*" or "\*" or "\file.txt"
    const lastSep = Math.max(pattern.lastIndexOf("\\"), pattern.lastIndexOf("/"));
    const dirPart = lastSep >= 0 ? pattern.slice(0, lastSep) : "";
    const namePart = lastSep >= 0 ? pattern.slice(lastSep + 1) : pattern;
    const listed = this.listForSearch(req.tid, dirPart);
    if (!listed) {
      return buildSmb(req, CMD_TRANSACTION2, dosError(ERRDOS, ERR_BADPATH),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const { all, dotStat } = listed;

    const matcher = wildcardMatcher(namePart);
    const entries = all.filter(e => matcher(e.sfn) || matcher(e.name));
    if (/[*?]/.test(namePart)) {
      entries.unshift(
        { name: "..", sfn: "..", attr: ATTR_DIRECTORY, stat: dotStat },
        { name: ".", sfn: ".", attr: ATTR_DIRECTORY, stat: dotStat },
      );
    }

    const sid = this.nextSid++;
    this.sids.set(sid, { entries, idx: 0 });
    return this.findReply(req, sid, infoLevel, findFlags, searchCount, true);
  }

  private findNext(req: SmbHeader, params: Uint8Array): Uint8Array {
    const pr = new Reader(params);
    const sid = pr.u16();
    const searchCount = pr.u16();
    const infoLevel = pr.u16();
    pr.u32(); // resumeKey
    const findFlags = pr.u16();
    return this.findReply(req, sid, infoLevel, findFlags, searchCount, false);
  }

  private findReply(req: SmbHeader, sid: number, infoLevel: number,
                    findFlags: number, maxCount: number, isFirst: boolean): Uint8Array {
    const search = this.sids.get(sid);
    if (!search || search.idx >= search.entries.length) {
      this.sids.delete(sid);
      return buildSmb(req, CMD_TRANSACTION2, dosError(ERRDOS, ERR_NOFILES),
                      new Uint8Array(0), new Uint8Array(0));
    }

    const data = new Writer();
    let count = 0;
    let lastNameOffset = 0;
    // Win95 sends SearchCount=6 and MaxDataCount≈2.4KB; blow past either and
    // VREDIR drops the whole TCP session ("network resource no longer
    // available"). Cap on count, then a byte ceiling well under MaxDataCount
    // as a backstop for pathological filenames.
    const fits = () =>
      search.idx < search.entries.length && count < maxCount && data.length < 2000;

    if (infoLevel === 0x104) {
      // SMB_FIND_FILE_BOTH_DIRECTORY_INFO — what Win95 asks for under
      // NT LM 0.12 regardless of CAP_NT_FIND. 94 bytes fixed + long name,
      // 4-byte aligned. NextEntryOffset chains entries; 0 terminates.
      // ShortName is *always* UTF-16LE per spec even though FileName stays
      // OEM (we never set CAP_UNICODE). 0x10x levels never take a resume-key
      // prefix.
      let prevStart = -1;
      while (fits()) {
        const e = search.entries[search.idx++];
        const ft = unixToFiletime(e.stat.mtime);
        const sz = e.stat.isDirectory() ? 0 : Math.min(e.stat.size, 0xffffffff);
        const entryStart = data.length;
        if (prevStart >= 0) data.patch32(prevStart, entryStart - prevStart);
        prevStart = entryStart;
        data.u32(0);                 // NextEntryOffset — patched on next iter
        data.u32(search.idx);        // FileIndex
        data.u64(ft.lo, ft.hi);      // CreationTime
        data.u64(ft.lo, ft.hi);      // LastAccessTime
        data.u64(ft.lo, ft.hi);      // LastWriteTime
        data.u64(ft.lo, ft.hi);      // ChangeTime
        data.u64(sz);                // EndOfFile
        data.u64(sz);                // AllocationSize
        data.u32(e.attr);
        // Samba (win9x-tested) writes FileName null-terminated AND counts the
        // null in FileNameLength; vredir copies the resume name as a C string
        // from LastNameOffset, so an unterminated name reads past the buffer.
        data.u32(e.name.length + 1);
        data.u32(0);                 // EaSize
        // ShortNameLength=0 always. MS-CIFS says ShortName is UCS-2 even in
        // an OEM session, but Win95's redirector reads it as OEM when
        // FLAGS2_UNICODE is clear — a non-empty UCS-2 name here makes
        // shell32 GPF on the single-directory probe it does when navigating
        // into a subfolder (root listing survives because Explorer never
        // looks at this field there). Explorer doesn't need the short name
        // anyway; it has the long one.
        data.u8(0);
        data.u8(0);                  // Reserved
        data.zero(24);               // ShortName WCHAR[12]
        lastNameOffset = data.length;
        for (let k = 0; k < e.name.length; k++) data.u8(e.name.charCodeAt(k));
        data.u8(0);
        data.zero((4 - (data.length & 3)) & 3);
        count++;
      }
    } else {
      // SMB_INFO_STANDARD (level 1). Each entry: [ResumeKey(4)] CDate(2)
      // CTime(2) ADate(2) ATime(2) WDate(2) WTime(2) Size(4) Alloc(4)
      // Attrs(2) NameLen(1) Name\0. ResumeKey prefix is ONLY present if the
      // client set SMB_FIND_RETURN_RESUME_KEYS — emit it unconditionally
      // and the client misparses every entry by 4 bytes.
      const wantResumeKey = (findFlags & 0x0004) !== 0;
      while (fits()) {
        const e = search.entries[search.idx++];
        const dosDate = unixToDosDateTime(e.stat.mtime);
        const sz = Math.min(e.stat.size, 0xffffffff);
        const entryStart = data.length;
        if (wantResumeKey) data.u32(search.idx);
        data.u16(dosDate.date).u16(dosDate.time);
        data.u16(dosDate.date).u16(dosDate.time);
        data.u16(dosDate.date).u16(dosDate.time);
        data.u32(sz);
        data.u32(sz);
        data.u16(e.attr);
        data.u8(e.name.length);
        lastNameOffset = data.length - entryStart;
        data.cstr(e.name);
        count++;
      }
    }
    const eos = search.idx >= search.entries.length;
    if (eos) this.sids.delete(sid);
    log(`  → ${count} entries, ${data.length} bytes, eos=${eos}`);

    // params reply differs: FIND_FIRST has SID(2), FIND_NEXT doesn't
    const pw = new Writer();
    if (isFirst) pw.u16(sid);
    pw.u16(count);             // SearchCount
    pw.u16(eos ? 1 : 0);       // EndOfSearch
    pw.u16(0);                 // EaErrorOffset
    pw.u16(lastNameOffset);    // LastNameOffset
    return this.trans2Reply(req, pw.build(), data.build());
  }

  private queryFsInfo(req: SmbHeader, params: Uint8Array): Uint8Array {
    const level = params[0] | (params[1] << 8);
    log(`QUERY_FS_INFO level=0x${level.toString(16)}`);
    let data: Uint8Array;
    switch (level) {
      case 0x0105: { // SMB_QUERY_FS_ATTRIBUTE_INFO
        // "FAT", not "NTFS" — shell32 keys NTFS-specific property/security
        // handlers on this string, and they fault on subfolder entry when
        // the backing protocol can't answer their follow-ups.
        const fsName = "FAT";
        data = new Writer()
          .u32(0x00000002) // FILE_CASE_PRESERVED_NAMES — the bit Win95 reads to decide LFN-capable
          .u32(255)        // MaxFileNameLengthInBytes
          .u32(fsName.length)
          .bytes([...fsName].map(c => c.charCodeAt(0)))
          .build();
        break;
      }
      case 0x0001: { // SMB_INFO_ALLOCATION
        data = new Writer()
          .u32(0)          // idFileSystem
          .u32(8)          // SectorsPerAllocationUnit
          .u32(0x10000)    // TotalAllocationUnits — fake but plausible
          .u32(0x08000)    // TotalFreeAllocationUnits
          .u16(512)        // BytesPerSector
          .build();
        break;
      }
      case 0x0002: { // SMB_INFO_VOLUME
        const label = req.tid === TID_TOOLS ? TOOLS_SHARE : this.shareName;
        data = new Writer()
          .u32(0)          // VolumeSerialNumber
          .u8(label.length)
          .bytes([...label].map(c => c.charCodeAt(0)))
          .build();
        break;
      }
      default:
        return buildSmb(req, CMD_TRANSACTION2, dosError(ERRDOS, 124 /* ERROR_INVALID_LEVEL */),
                        new Uint8Array(0), new Uint8Array(0));
    }
    return this.trans2Reply(req, new Uint8Array(0), data);
  }

  private queryPathInfo(req: SmbHeader, params: Uint8Array): Uint8Array {
    // params: InfoLevel(2) Reserved(4) FileName
    const pr = new Reader(params);
    const level = pr.u16();
    pr.u32();
    const smbPath = (req.flags2 & 0x8000) ? pr.ucs2() : pr.cstr();
    log(`QUERY_PATH_INFO level=0x${level.toString(16)} "${smbPath}"`);
    const v = this.getVirtual(req.tid, smbPath);
    if (v) {
      const dd = unixToDosDateTime(new Date());
      const data = new Writer()
        .u16(dd.date).u16(dd.time).u16(dd.date).u16(dd.time).u16(dd.date).u16(dd.time)
        .u32(v.length).u32(v.length)
        .u16(ATTR_ARCHIVE)
        .build();
      return this.trans2Reply(req, new Writer().u16(0).build(), data);
    }
    const hostPath = this.resolve(req.tid, smbPath);
    if (!hostPath || !fs.existsSync(hostPath)) {
      return buildSmb(req, CMD_TRANSACTION2, dosError(ERRDOS, ERR_BADFILE),
                      new Uint8Array(0), new Uint8Array(0));
    }
    const st = fs.statSync(hostPath);
    const dosDate = unixToDosDateTime(st.mtime);
    const sz = Math.min(st.size, 0xffffffff);
    // SMB_INFO_STANDARD response data: same shape as a find entry minus name
    const data = new Writer()
      .u16(dosDate.date).u16(dosDate.time)
      .u16(dosDate.date).u16(dosDate.time)
      .u16(dosDate.date).u16(dosDate.time)
      .u32(sz).u32(sz)
      .u16(hostAttrs(path.basename(hostPath), st.isDirectory()))
      .build();
    const replyParams = new Writer().u16(0).build(); // EaErrorOffset
    return this.trans2Reply(req, replyParams, data);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TRANSACTION (0x25) — RAP over \PIPE\LANMAN. Win95 uses this to enumerate
  // shares (NetShareEnum, func=0, descriptor "WrLeh"/"B13BWz") before showing
  // the share list under \\HOST. We return our one disk share.
  // ───────────────────────────────────────────────────────────────────────────
  private transRap(req: SmbHeader): Uint8Array {
    // Same envelope as TRANS2; the name is in the bytes block before params.
    const wr = new Reader(req.words);
    wr.skip(2 + 2 + 2 + 2 + 1 + 1 + 2 + 4 + 2);
    const paramCount = wr.u16();
    const paramOffset = wr.u16();
    wr.u16(); wr.u16(); // dataCount/Offset
    const setupCount = wr.u8();
    wr.u8();
    if (setupCount) wr.skip(setupCount * 2);

    const bytesStart = 32 + 1 + req.wordCount * 2 + 2;

    // bytes: TransactionName\0 [pad] params [pad] data
    // Win95 sends "\PIPE\LANMAN\0" — we don't bother parsing it.
    const params = req.bytes.slice(paramOffset - bytesStart, paramOffset - bytesStart + paramCount);

    // RAP params: func(2) + paramDesc\0 + dataDesc\0 + actual params
    const pr = new Reader(params);
    const func = pr.u16();
    const paramDesc = pr.cstr();
    const dataDesc = pr.cstr();
    log(`RAP func=${func} pDesc="${paramDesc}" dDesc="${dataDesc}"`);

    // NetWkstaGetInfo (63) / NetServerGetInfo (13) — Win95 calls these before
    // rendering the share window. The DATA DESCRIPTOR tells us the layout,
    // not the function code: B16=16-byte inline name, z=string pointer,
    // B=byte, D=dword. We synthesize the struct from the descriptor so any
    // info-level Win95 asks for gets a plausible answer.
    if ((func === 13 || func === 63) && paramDesc.startsWith("WrL")) {
      const data = buildRapStruct(dataDesc, {
        name16: "HOST",
        verMajor: 4, verMinor: 0,
        // SV_TYPE_WORKSTATION | SV_TYPE_SERVER
        dword: 0x00000003,
      });
      const replyParams = new Writer()
        .u16(0)          // NERR_Success
        .u16(0)          // converter
        .u16(data.length)
        .build();
      return this.transReply(req, CMD_TRANSACTION, replyParams, data);
    }

    if (func === 0 && paramDesc === "WrLeh") {
      // NetShareEnum. Data structure per "B13BWz":
      //   B13 = 13-byte share name (null-padded)
      //   B   = 1-byte pad
      //   W   = 2-byte type (0=disk, 3=IPC)
      //   z   = 4-byte string pointer (we send 0 = no remark)
      const shares = [
        { name: this.shareName, type: 0 },
        { name: TOOLS_SHARE, type: 0 },
        { name: "IPC$", type: 3 },
      ];
      const data = new Writer();
      for (const s of shares) {
        const padded = s.name.padEnd(13, "\0");
        for (let i = 0; i < 13; i++) data.u8(padded.charCodeAt(i));
        data.u8(0);              // pad
        data.u16(s.type);
        data.u32(0);             // remark pointer: null
      }

      // Reply params: status(2) converter(2) entriesRead(2) totalEntries(2)
      const replyParams = new Writer()
        .u16(0)                  // NERR_Success
        .u16(0)                  // converter (no string offsets to fix up)
        .u16(shares.length)
        .u16(shares.length)
        .build();

      return this.transReply(req, CMD_TRANSACTION, replyParams, data.build());
    }

    // Anything else: "not supported" — Win95 falls back gracefully
    const replyParams = new Writer()
      .u16(50)                   // ERROR_NOT_SUPPORTED
      .u16(0).u16(0).u16(0)
      .build();
    return this.transReply(req, CMD_TRANSACTION, replyParams, new Uint8Array(0));
  }

  /** TRANSACTION/TRANS2 share the same reply envelope. */
  private transReply(req: SmbHeader, cmd: number, params: Uint8Array, data: Uint8Array): Uint8Array {
    // 10 words + 0 setup, then bytes = pad + params + pad + data
    const wc = 10;
    const wordBlockSize = 1 + wc * 2 + 2;
    const paramOffset = 32 + wordBlockSize;
    const dataOffset = paramOffset + params.length;

    const words = new Writer()
      .u16(params.length).u16(data.length)
      .u16(0)                    // Reserved
      .u16(params.length).u16(paramOffset).u16(0)
      .u16(data.length).u16(dataOffset).u16(0)
      .u8(0).u8(0)               // SetupCount=0, Reserved
      .build();

    const bytes = new Uint8Array(params.length + data.length);
    bytes.set(params, 0);
    bytes.set(data, params.length);

    return buildSmb(req, cmd, 0, words, bytes);
  }

  /** Build the TRANS2 response envelope. Tedious but mechanical. */
  private trans2Reply(req: SmbHeader, params: Uint8Array, data: Uint8Array): Uint8Array {
    // 10 words + 0 setup, then bytes = pad + params + pad + data. Both pads
    // bring the following block to a 4-byte boundary from the SMB header
    // start — Win95's redirector copies params/data via REP MOVSD and an
    // odd offset shifts the entire 0x104 record by up to 3 bytes inside its
    // buffer, which explorer survives at the root but GPFs on the second
    // single-entry probe when navigating into a subfolder.
    const wc = 10;
    const bytesStart = 32 + 1 + wc * 2 + 2; // header + wc + words + bcc
    const align4 = (n: number) => (4 - (n & 3)) & 3;
    const pad1 = align4(bytesStart);
    const paramOffset = bytesStart + pad1;
    const pad2 = align4(paramOffset + params.length);
    const dataOffset = paramOffset + params.length + pad2;

    const words = new Writer()
      .u16(params.length)  // TotalParamCount
      .u16(data.length)    // TotalDataCount
      .u16(0)              // Reserved
      .u16(params.length)  // ParamCount
      .u16(paramOffset)    // ParamOffset
      .u16(0)              // ParamDisplacement
      .u16(data.length)    // DataCount
      .u16(dataOffset)     // DataOffset
      .u16(0)              // DataDisplacement
      .u8(0)               // SetupCount
      .u8(0)               // Reserved
      .build();

    const bytes = new Uint8Array(pad1 + params.length + pad2 + data.length);
    bytes.set(params, pad1);
    bytes.set(data, pad1 + params.length + pad2);

    return buildSmb(req, CMD_TRANSACTION2, 0, words, bytes);
  }

  destroy() {
    for (const f of this.fids.values()) {
      if (f.fd >= 0) try { fs.closeSync(f.fd); } catch {}
    }
    this.fids.clear();
    this.sids.clear();
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// DOS device names. Win95 maps these regardless of extension or directory,
// so a host file called "con.txt" or "AUX" opens the device and hangs the
// redirector. Guarded in both the long name and the generated 8.3 name.
const DOS_RESERVED = /^(CON|PRN|AUX|NUL|CLOCK\$|COM[1-9]|LPT[1-9])$/i;

/** Map a host filename to something Win95 can safely display and round-trip. */
function displayName(real: string): string {
  // Per-char: single-byte only, no Windows-reserved chars, no controls
  // (including DEL/C1). Multi-code-unit chars collapse to one '_'.
  const bad = /[<>:"/\\|?*\x00-\x1f\x7f-\x9f]/;
  let out = "";
  for (const ch of real) {  // iterates code points, so 🎨 is one step
    const c = ch.codePointAt(0)!;
    out += c > 0xff || bad.test(ch) ? "_" : ch;
  }
  // Win95 silently strips trailing dots/spaces, so "foo." would alias "foo".
  // Replace the trailing run so the name stays distinct and length-stable.
  out = out.replace(/[. ]+$/, m => "_".repeat(m.length));
  // Reserved device basenames get a suffix so the guest never sees a bare CON.
  // Win95 tests the component before the *first* dot and ignores trailing
  // spaces there, so "nul.tar.gz" and "con .txt" both need guarding.
  const dot = out.indexOf(".");
  const base = dot < 0 ? out : out.slice(0, dot);
  if (DOS_RESERVED.test(base.replace(/ +$/, ""))) {
    out = base + "_" + (dot < 0 ? "" : out.slice(dot));
  }
  return out || "_";
}

function isRootPath(smbPath: string): boolean {
  return smbPath.replace(/[\\\/]/g, "") === "";
}

function wildcardMatcher(pattern: string): (name: string) => boolean {
  // SMB wildcards: * = any, ? = one char, also ">"/"<"/"\"" exist but
  // Win95 mostly sends *.* or * — collapse *.* → *
  const p = pattern.replace(/\*\.\*/, "*");
  if (p === "*" || p === "") return () => true;
  if (!/[*?]/.test(p)) return (name) => name.toLowerCase() === p.toLowerCase();
  const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&")
                                .replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
  return (name) => re.test(name);
}

/**
 * Generate a RAP data block from its descriptor string. Each character is a
 * field type: B=byte (or B<n>=n bytes inline), W=word, D=dword, z=string
 * pointer (4 bytes, points into the heap that follows the struct). We fill
 * the first inline-name field with the server name, the first byte pair with
 * version, the first dword with flags, and null everything else — Win95 only
 * looks at the name and type bits.
 */
function buildRapStruct(desc: string, vals: {
  name16: string; verMajor: number; verMinor: number; dword: number;
}): Uint8Array {
  const w = new Writer();
  let nameDone = false, bytesUsed = 0, dwordDone = false;
  let heapStart = 0;
  // First pass: compute struct size so we know where heap (z-strings) starts
  let i = 0;
  while (i < desc.length) {
    const c = desc[i++];
    if (c === "B") {
      let n = 1;
      const m = desc.slice(i).match(/^\d+/);
      if (m) { n = parseInt(m[0]); i += m[0].length; }
      heapStart += n;
    } else if (c === "W") heapStart += 2;
    else if (c === "D") heapStart += 4;
    else if (c === "z") heapStart += 4;
  }
  // Second pass: emit
  const heapStrings: string[] = [];
  let heapOff = heapStart;
  i = 0;
  while (i < desc.length) {
    const c = desc[i++];
    if (c === "B") {
      let n = 1;
      const m = desc.slice(i).match(/^\d+/);
      if (m) { n = parseInt(m[0]); i += m[0].length; }
      if (n >= 13 && !nameDone) {
        // Inline name field — null-padded
        const padded = vals.name16.padEnd(n, "\0");
        for (let k = 0; k < n; k++) w.u8(padded.charCodeAt(k));
        nameDone = true;
      } else if (n === 1) {
        // Single bytes — the first two are version major/minor
        w.u8(bytesUsed === 0 ? vals.verMajor : bytesUsed === 1 ? vals.verMinor : 0);
        bytesUsed++;
      } else {
        w.zero(n);
      }
    } else if (c === "W") {
      w.u16(0);
    } else if (c === "D") {
      w.u32(dwordDone ? 0 : vals.dword);
      dwordDone = true;
    } else if (c === "z") {
      // First z gets the name; rest are null
      if (!nameDone) {
        w.u32(heapOff);
        heapStrings.push(vals.name16);
        heapOff += vals.name16.length + 1;
        nameDone = true;
      } else {
        w.u32(0);
      }
    }
  }
  // Append heap
  for (const s of heapStrings) w.cstr(s);
  return w.build();
}

function unixToSmbTime(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/** NT FILETIME: 100ns ticks since 1601-01-01, split into two u32s. */
function unixToFiletime(d: Date): { lo: number; hi: number } {
  const t = BigInt(d.getTime()) * 10000n + 116444736000000000n;
  return { lo: Number(t & 0xffffffffn), hi: Number(t >> 32n) };
}

function clean83(s: string): string {
  return s.replace(/[^A-Za-z0-9_$~!#%&'()@^`{}-]/g, "").toUpperCase();
}

/** True if the name already fits 8.3 with no lossy transformation. */
function fits83(name: string): boolean {
  if (name === "." || name === "..") return true;
  if (/[. ]$/.test(name)) return false;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  return base.length > 0 && base.length <= 8 && ext.length <= 3 &&
         !DOS_RESERVED.test(base) &&
         clean83(base).length === base.length &&
         clean83(ext).length === ext.length;
}

/**
 * Generate unique 8.3 names (Windows-style ~N suffixes) and build the
 * reverse map. Names that already fit 8.3 keep their original form so
 * OPEN can resolve them without the map. Everything else gets BASE~N.EXT.
 */
function buildSfnMap(names: string[]): Map<string, string> {
  const sfnToReal = new Map<string, string>();
  const used = new Set<string>();

  // First pass: claim natural 8.3 names so they don't collide with mangled ones
  for (const real of names) {
    if (fits83(real)) {
      const sfn = real.toUpperCase();
      sfnToReal.set(sfn, real);
      used.add(sfn);
    }
  }

  // Second pass: mangle the rest with ~N until unique
  for (const real of names) {
    if (fits83(real)) continue;
    const dot = real.lastIndexOf(".");
    const baseRaw = dot > 0 ? real.slice(0, dot) : real;
    const extRaw = dot > 0 ? real.slice(dot + 1) : "";
    const ext = clean83(extRaw).slice(0, 3);
    let base = clean83(baseRaw);
    if (base.length === 0 || DOS_RESERVED.test(base)) base += "_";

    // Windows uses 6 chars + ~N for N<10, then 5+~NN, etc. Good enough.
    for (let n = 1; ; n++) {
      const suffix = `~${n}`;
      const stem = base.slice(0, Math.max(1, 8 - suffix.length)) + suffix;
      const sfn = ext ? `${stem}.${ext}` : stem;
      if (!used.has(sfn)) {
        used.add(sfn);
        sfnToReal.set(sfn, real);
        break;
      }
    }
  }
  return sfnToReal;
}

function unixToDosDateTime(d: Date): { date: number; time: number } {
  // DOS date: bits 15-9 year-1980, 8-5 month, 4-0 day
  // DOS time: bits 15-11 hour, 10-5 min, 4-0 sec/2
  const y = Math.max(0, d.getFullYear() - 1980);
  const date = (y << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}
