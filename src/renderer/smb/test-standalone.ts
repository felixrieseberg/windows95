// Standalone test of the SMB stack — no v86, no Electron. Feeds canned
// requests through NetBIOSFramer + SmbSession and inspects responses.
// Run: see src/renderer/smb/README.md for the ts-node invocation.

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NetBIOSFramer, nbWrap } from "./netbios";
import { SmbSession } from "./server";
import { parseSmb, CMD_NEGOTIATE, CMD_SESSION_SETUP_ANDX,
         CMD_TREE_CONNECT_ANDX, CMD_TRANSACTION2, CMD_OPEN_ANDX,
         CMD_READ_ANDX, CMD_CLOSE } from "./smb";

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.log("  ✗", msg); }
};

// @ts-ignore — kept for debugging when tests fail
const hex = (b: Uint8Array, n = 32) =>
  Array.from(b.slice(0, n)).map(x => x.toString(16).padStart(2, "0")).join(" ");
void hex;

// ─── Build a minimal SMB request from scratch ────────────────────────────────
function smbReq(cmd: number, words: number[], bytes: number[],
                tid = 0, uid = 0, mid = 1): Uint8Array {
  const out: number[] = [];
  out.push(0xff, 0x53, 0x4d, 0x42);     // magic
  out.push(cmd);                         // cmd
  out.push(0, 0, 0, 0);                  // status
  out.push(0x18);                        // flags (caseless+canonical)
  out.push(0x01, 0x00);                  // flags2: long names, no unicode
  for (let i = 0; i < 12; i++) out.push(0); // reserved
  out.push(tid & 0xff, tid >> 8);
  out.push(0, 0);                        // pid
  out.push(uid & 0xff, uid >> 8);
  out.push(mid & 0xff, mid >> 8);
  if (words.length % 2) throw new Error("words must be even");
  out.push(words.length / 2);
  out.push(...words);
  out.push(bytes.length & 0xff, bytes.length >> 8);
  out.push(...bytes);
  return new Uint8Array(out);
}

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v: number) => [...u16(v & 0xffff), ...u16((v >>> 16) & 0xffff)];
const cstr = (s: string) => [...Buffer.from(s, "ascii"), 0];

// ─── Setup test fixture ──────────────────────────────────────────────────────
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "smbtest-"));
fs.writeFileSync(path.join(tmpRoot, "hello.txt"), "Hello from the host!\n");
fs.mkdirSync(path.join(tmpRoot, "subdir"));
fs.writeFileSync(path.join(tmpRoot, "subdir", "nested.dat"), Buffer.alloc(100, 0xAB));
console.log("fixture:", tmpRoot);

const session = new SmbSession(tmpRoot);
session.capture = false;

// ─── Test 1: NetBIOS framing ─────────────────────────────────────────────────
console.log("\n[1] NetBIOS framer");
{
  const framer = new NetBIOSFramer();
  // Session request: type 0x81, len 68 (called name 34 + calling name 34)
  const sessReq = new Uint8Array([0x81, 0, 0, 68, ...new Array(68).fill(0x20)]);
  const msgs1 = framer.push(sessReq);
  ok(msgs1.length === 1 && msgs1[0].type === 0x81, "parses session request");

  // Fragmented session message
  const payload = new Uint8Array([0xff, 0x53, 0x4d, 0x42, 0x72, 0, 0, 0, 0, 0]);
  const wrapped = nbWrap(payload);
  const msgs2 = framer.push(wrapped.slice(0, 5));
  ok(msgs2.length === 0, "incomplete frame buffers");
  const msgs3 = framer.push(wrapped.slice(5));
  ok(msgs3.length === 1 && msgs3[0].type === 0x00, "completes on second chunk");
  ok(msgs3[0].type === 0x00 && msgs3[0].payload[0] === 0xff && msgs3[0].payload[1] === 0x53,
     "payload extracted");
}

// ─── Test 2: NEGOTIATE ───────────────────────────────────────────────────────
console.log("\n[2] NEGOTIATE");
{
  // Real Win95 dialect list (abbreviated). Each entry is 0x02 + cstr.
  const dialects = ["PC NETWORK PROGRAM 1.0", "LANMAN1.0", "LM1.2X002",
                    "LANMAN2.1", "NT LM 0.12"];
  const bytes: number[] = [];
  for (const d of dialects) { bytes.push(0x02); bytes.push(...cstr(d)); }

  const req = smbReq(CMD_NEGOTIATE, [], bytes);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.cmd === CMD_NEGOTIATE, "cmd echoed");
  ok((parsed.flags & 0x80) !== 0, "reply flag set");
  ok(parsed.status === 0, "status OK");
  ok(parsed.wordCount === 17, "17-word NT response");
  // word[0] = dialect index — NT LM 0.12 is idx 4 and gets the 17-word
  // response; the 13-word LM shape is now only emitted as a fallback.
  const pickedIdx = parsed.words[0] | (parsed.words[1] << 8);
  ok(pickedIdx === 4, `picked NT LM 0.12 (idx ${pickedIdx})`);

  // Fallback: a client that doesn't offer NT LM 0.12 still gets the 13-word
  // LANMAN response.
  const lmBytes: number[] = [];
  for (const d of dialects.slice(0, 4)) { lmBytes.push(0x02); lmBytes.push(...cstr(d)); }
  const lmParsed = parseSmb(session.handle(smbReq(CMD_NEGOTIATE, [], lmBytes))!)!;
  ok(lmParsed.wordCount === 13, "13-word LM fallback");
}

// ─── Test 3: SESSION_SETUP ───────────────────────────────────────────────────
console.log("\n[3] SESSION_SETUP_ANDX");
{
  // Minimal setup: AndX(4) MaxBuf(2) MaxMpx(2) VcNum(2) SessKey(4)
  // PwLen(2) Reserved(4) — bytes: password + account + domain + os + lanman
  const words = [0xff, 0, 0, 0, ...u16(4096), ...u16(1), ...u16(0),
                 ...u32(0), ...u16(0), ...u32(0)];
  const bytes = [...cstr(""), ...cstr("GUEST"), ...cstr("WORKGROUP"),
                 ...cstr("Windows 4.0"), ...cstr("Windows 4.0")];
  const req = smbReq(CMD_SESSION_SETUP_ANDX, words, bytes);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "status OK");
  ok(parsed.uid === 1, `assigned uid=${parsed.uid}`);
  // Action word at offset 4 (after AndX) = guest bit
  const action = parsed.words[4] | (parsed.words[5] << 8);
  ok((action & 1) === 1, "guest bit set");
}

// ─── Test 4: TREE_CONNECT ────────────────────────────────────────────────────
console.log("\n[4] TREE_CONNECT_ANDX");
{
  const words = [0xff, 0, 0, 0, ...u16(0), ...u16(1)]; // pwLen=1
  const bytes = [0, ...cstr("\\\\192.168.86.1\\HOST"), ...cstr("?????")];
  const req = smbReq(CMD_TREE_CONNECT_ANDX, words, bytes, 0, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "status OK");
  ok(parsed.tid === 1, `assigned tid=${parsed.tid}`);
  // bytes should start with "A:\0"
  const svc = String.fromCharCode(parsed.bytes[0], parsed.bytes[1]);
  ok(svc === "A:", `service="${svc}"`);
}

// ─── Test 5: TRANS2 FIND_FIRST2 (directory listing) ──────────────────────────
console.log("\n[5] TRANS2 FIND_FIRST2");
{
  // TRANS2 setup is gnarly. Build from spec:
  // params: SearchAttrs(2) SearchCount(2) Flags(2) InfoLevel(2) Storage(4) "\*"\0
  const t2params = [...u16(0x16), ...u16(100), ...u16(0), ...u16(1),
                    ...u32(0), ...cstr("\\*")];
  // setup word = TRANS2_FIND_FIRST2 (1)
  // word block: TotPrm(2) TotData(2) MaxPrm(2) MaxData(2) MaxSetup(1) Rsvd(1)
  //   Flags(2) Timeout(4) Rsvd(2) PrmCnt(2) PrmOff(2) DataCnt(2) DataOff(2)
  //   SetupCnt(1) Rsvd(1) Setup[0](2)
  const wc = 14 + 1; // 14 fixed + 1 setup
  const bytesStart = 32 + 1 + wc * 2 + 2;
  const paramOff = bytesStart + 3; // 3 bytes pad ("\0\0\0") before params
  const words = [
    ...u16(t2params.length), ...u16(0), ...u16(100), ...u16(8000),
    1, 0, ...u16(0), ...u32(0), ...u16(0),
    ...u16(t2params.length), ...u16(paramOff),
    ...u16(0), ...u16(0),
    1, 0, ...u16(1) // SetupCount=1, Setup[0]=FIND_FIRST2
  ];
  const bytes = [0, 0, 0, ...t2params]; // 3-byte name padding + params
  const req = smbReq(CMD_TRANSACTION2, words, bytes, 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "status OK");
  // Reply params: SID(2) Count(2) EOS(2) EaErr(2) LastName(2)
  // Reply words tell us where params live
  const rw = parsed.words;
  const replyParamOffset = rw[8] | (rw[9] << 8);
  const replyParamCount = rw[6] | (rw[7] << 8);
  const replyBytesStart = 32 + 1 + parsed.wordCount * 2 + 2;
  const pStart = replyParamOffset - replyBytesStart;
  const replyParams = parsed.bytes.slice(pStart, pStart + replyParamCount);
  const searchCount = replyParams[2] | (replyParams[3] << 8);
  // Should find: . .. hello.txt subdir = 4 (virtuals moved to TOOLS share)
  ok(searchCount === 4, `found ${searchCount} entries (expect 4)`);
  // Data block has the entries — just verify they're in there somewhere
  const dataStr = String.fromCharCode(...parsed.bytes);
  ok(!dataStr.includes("_MAPZ.BAT"), "no virtual leak in user share");
  ok(dataStr.includes("hello.txt"), "hello.txt in listing");
  ok(dataStr.includes("subdir"), "subdir in listing");
}

// ─── Test 5b: FIND_FIRST2 level 0x104 (LFN) ──────────────────────────────────
console.log("\n[5b] TRANS2 FIND_FIRST2 level=0x104");
{
  fs.writeFileSync(path.join(tmpRoot, "A Long Filename Here.txt"), "lfn");
  // Same envelope as [5] but InfoLevel=0x104
  const t2params = [...u16(0x16), ...u16(100), ...u16(0), ...u16(0x104),
                    ...u32(0), ...cstr("\\*")];
  const wc = 14 + 1;
  const bytesStart = 32 + 1 + wc * 2 + 2;
  const paramOff = bytesStart + 3;
  const words = [
    ...u16(t2params.length), ...u16(0), ...u16(100), ...u16(8000),
    1, 0, ...u16(0), ...u32(0), ...u16(0),
    ...u16(t2params.length), ...u16(paramOff),
    ...u16(0), ...u16(0),
    1, 0, ...u16(1)
  ];
  const bytes = [0, 0, 0, ...t2params];
  const reply = session.handle(smbReq(CMD_TRANSACTION2, words, bytes, 1, 1))!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "status OK");
  // Walk the data block via NextEntryOffset and verify the long name appears
  // intact and the chain terminates with 0.
  const rw = parsed.words;
  const dOff = (rw[14] | (rw[15] << 8)) - (32 + 1 + parsed.wordCount * 2 + 2);
  const dLen = rw[12] | (rw[13] << 8);
  const data = parsed.bytes.slice(dOff, dOff + dLen);
  const names: string[] = [];
  let off = 0;
  for (;;) {
    const next = data[off] | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]<<24);
    const fnLen = data[off+60] | (data[off+61]<<8);
    // FileNameLength counts the trailing null (Samba/win9x compat)
    names.push(String.fromCharCode(...data.slice(off+94, off+94+fnLen)).replace(/\0$/, ""));
    if (next === 0) break;
    off += next;
  }
  ok(names.includes("A Long Filename Here.txt"), `LFN intact: ${JSON.stringify(names)}`);
  ok(names.includes(".") && names.includes(".."), "dot entries present");
}

// ─── Test 5d: filename safety + hidden attrs ─────────────────────────────────
console.log("\n[5d] filename safety");
{
  const hz = path.join(tmpRoot, "hazard");
  fs.mkdirSync(hz);
  for (const n of ["con.txt", "aux", "nul.tar.gz", ".DS_Store", ".secret", "trail. "])
    fs.writeFileSync(path.join(hz, n), "x");

  const t2params = [...u16(0x16), ...u16(100), ...u16(0), ...u16(0x104),
                    ...u32(0), ...cstr("\\hazard\\*")];
  const wc = 14 + 1;
  const bytesStart = 32 + 1 + wc * 2 + 2;
  const paramOff = bytesStart + 3;
  const words = [
    ...u16(t2params.length), ...u16(0), ...u16(100), ...u16(8000),
    1, 0, ...u16(0), ...u32(0), ...u16(0),
    ...u16(t2params.length), ...u16(paramOff),
    ...u16(0), ...u16(0),
    1, 0, ...u16(1)
  ];
  const reply = session.handle(smbReq(CMD_TRANSACTION2, words,
                                      [0, 0, 0, ...t2params], 1, 1))!;
  const parsed = parseSmb(reply)!;
  const rw = parsed.words;
  const dOff = (rw[14] | (rw[15] << 8)) - (32 + 1 + parsed.wordCount * 2 + 2);
  const dLen = rw[12] | (rw[13] << 8);
  const data = parsed.bytes.slice(dOff, dOff + dLen);
  const ents = new Map<string, number>();
  for (let off = 0;;) {
    const next = data[off] | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]<<24);
    const attr = data[off+56] | (data[off+57]<<8);
    const fnLen = data[off+60] | (data[off+61]<<8);
    const nm = String.fromCharCode(...data.slice(off+94, off+94+fnLen)).replace(/\0$/, "");
    ents.set(nm, attr);
    if (next === 0) break;
    off += next;
  }
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  const bad = [...ents.keys()].filter(n => reserved.test(n.split(".")[0]));
  ok(bad.length === 0, `no reserved basenames: ${JSON.stringify([...ents.keys()])}`);
  ok(ents.has("con_.txt") && ents.has("aux_"), "reserved names suffixed");
  ok(ents.has("nul_.tar.gz"), "reserved across multi-ext");
  ok(ents.has("trail__"), "trailing dot/space replaced");
  ok((ents.get(".DS_Store")! & 0x06) === 0x06, ".DS_Store hidden+system");
  ok((ents.get(".secret")! & 0x02) === 0x02, "dotfile hidden");
  ok((ents.get("con_.txt")! & 0x02) === 0, "regular file not hidden");
}

// ─── Test 5c: RAP NetShareEnum lists user share + TOOLS ──────────────────────
console.log("\n[5c] RAP NetShareEnum");
{
  // TREE_CONNECT IPC$ first
  const ipc = parseSmb(session.handle(smbReq(CMD_TREE_CONNECT_ANDX,
    [0xff,0,0,0,...u16(0),...u16(1)],
    [0, ...cstr("\\\\HOST\\IPC$"), ...cstr("IPC")], 0, 1))!)!;
  ok(ipc.tid === 0xfffe, `IPC$ tid=${ipc.tid}`);
  // RAP NetShareEnum: TRANS over \PIPE\LANMAN
  const rap = [...u16(0), ...cstr("WrLeh"), ...cstr("B13BWz"), ...u16(1), ...u16(4096)];
  const wc = 14;
  const bytesStart = 32 + 1 + wc * 2 + 2;
  const name = cstr("\\PIPE\\LANMAN");
  const paramOff = bytesStart + name.length;
  const words = [
    ...u16(rap.length), ...u16(0), ...u16(100), ...u16(4096),
    0, 0, ...u16(0), ...u32(0), ...u16(0),
    ...u16(rap.length), ...u16(paramOff),
    ...u16(0), ...u16(0),
    0, 0
  ];
  const reply = session.handle(smbReq(0x25, words, [...name, ...rap], ipc.tid, 1))!;
  const dataStr = String.fromCharCode(...parseSmb(reply)!.bytes);
  const userShare = path.basename(tmpRoot).replace(/[^A-Za-z0-9_$~!#%&'()@^`{}.-]/g, "")
    .toUpperCase().slice(0, 12);
  ok(dataStr.includes("TOOLS"), "TOOLS share listed");
  ok(dataStr.includes(userShare), `user share "${userShare}" listed`);
}

// ─── Test 6: OPEN + READ + CLOSE ─────────────────────────────────────────────
console.log("\n[6] OPEN_ANDX + READ_ANDX + CLOSE");
let openedFid = 0;
{
  // OPEN_ANDX words: AndX(4) Flags(2) Access(2) SrchAttr(2) FileAttr(2)
  //   CreateTime(4) OpenFunc(2) AllocSize(4) Timeout(4) Rsvd(4)
  const words = [0xff, 0, 0, 0, ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                 ...u32(0), ...u16(1), ...u32(0), ...u32(0), ...u32(0)];
  const bytes = [...cstr("\\hello.txt")];
  const req = smbReq(CMD_OPEN_ANDX, words, bytes, 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "open status OK");
  openedFid = parsed.words[4] | (parsed.words[5] << 8); // FID after AndX
  ok(openedFid > 0, `fid=${openedFid}`);
  // OPEN_ANDX response: AndX(4) FID(2) Attrs(2) LastWrite(4) DataSize(4) ...
  const fileSize = parsed.words[12] | (parsed.words[13] << 8) |
                   (parsed.words[14] << 16) | (parsed.words[15] << 24);
  ok(fileSize === 21, `size=${fileSize} (expect 21)`);
}
{
  // READ_ANDX: AndX(4) FID(2) Offset(4) MaxCount(2) MinCount(2)
  //   Timeout(4) Remaining(2) [OffsetHigh(4)]
  const words = [0xff, 0, 0, 0, ...u16(openedFid), ...u32(0), ...u16(100),
                 ...u16(0), ...u32(0), ...u16(0)];
  const req = smbReq(CMD_READ_ANDX, words, [], 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "read status OK");
  const dataLen = parsed.words[10] | (parsed.words[11] << 8);
  ok(dataLen === 21, `read ${dataLen} bytes`);
  // bytes = pad(1) + data
  const text = String.fromCharCode(...parsed.bytes.slice(1, 1 + dataLen));
  ok(text === "Hello from the host!\n", `content: ${JSON.stringify(text)}`);
}
{
  const words = [...u16(openedFid), ...u32(0)];
  const req = smbReq(CMD_CLOSE, words, [], 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "close status OK");
}

// ─── Test 7: error paths ─────────────────────────────────────────────────────
console.log("\n[7] Error handling");
{
  const words = [0xff, 0, 0, 0, ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                 ...u32(0), ...u16(1), ...u32(0), ...u32(0), ...u32(0)];
  const req = smbReq(CMD_OPEN_ANDX, words, [...cstr("\\nope.txt")], 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status !== 0, `nonexistent file → status=0x${parsed.status.toString(16)}`);
  // DOS error: class=1 (ERRDOS), code=2 (badfile)
  ok((parsed.status & 0xff) === 1 && (parsed.status >> 16) === 2, "ERRDOS/ERR_badfile");
}
{
  const req = smbReq(CMD_OPEN_ANDX,
    [0xff,0,0,0,...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u16(1),...u32(0),...u32(0),...u32(0)],
    [...cstr("\\..\\..\\etc\\passwd")], 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status !== 0, "lexical traversal (../) blocked");
}
{
  // Virtual file: connect to TOOLS share, open and read _MAPZ.BAT
  const tcReq = smbReq(CMD_TREE_CONNECT_ANDX,
    [0xff, 0, 0, 0, ...u16(0), ...u16(1)],
    [0, ...cstr("\\\\192.168.86.1\\TOOLS"), ...cstr("?????")], 0, 1);
  const tcParsed = parseSmb(session.handle(tcReq)!)!;
  ok(tcParsed.tid === 2, `TOOLS share tid=${tcParsed.tid}`);

  const oReq = smbReq(CMD_OPEN_ANDX,
    [0xff,0,0,0,...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u16(1),...u32(0),...u32(0),...u32(0)],
    [...cstr("\\_MAPZ.BAT")], tcParsed.tid, 1);
  const oReply = session.handle(oReq)!;
  const oParsed = parseSmb(oReply)!;
  ok(oParsed.status === 0, "open virtual _MAPZ.BAT");
  const vfid = oParsed.words[4] | (oParsed.words[5] << 8);
  const rReq = smbReq(CMD_READ_ANDX,
    [0xff,0,0,0,...u16(vfid),...u32(0),...u16(500),...u16(0),...u32(0),...u16(0)], [], tcParsed.tid, 1);
  const rReply = session.handle(rReq)!;
  const rParsed = parseSmb(rReply)!;
  const len = rParsed.words[10] | (rParsed.words[11] << 8);
  const text = String.fromCharCode(...rParsed.bytes.slice(1, 1 + len));
  ok(text.includes("NET USE Z:"), `virtual read: ${JSON.stringify(text.slice(0, 40))}`);

  // SEEK to end → file size, then core READ (0x0a). This is the exact path
  // Win95+Notepad take under NT LM 0.12 with Capabilities=0.
  const oReq2 = smbReq(CMD_OPEN_ANDX,
    [0xff,0,0,0,...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u16(1),...u32(0),...u32(0),...u32(0)],
    [...cstr("\\README.TXT")], tcParsed.tid, 1);
  const oP2 = parseSmb(session.handle(oReq2)!)!;
  const fid2 = oP2.words[4] | (oP2.words[5] << 8);
  ok(oP2.status === 0 && fid2 > 0, `open README.TXT fid=${fid2}`);

  const sP = parseSmb(session.handle(smbReq(0x12,
    [...u16(fid2), ...u16(2), ...u32(0)], [], tcParsed.tid, 1))!)!;
  const seekPos = sP.words[0] | (sP.words[1] << 8) | (sP.words[2] << 16) | (sP.words[3] << 24);
  ok(sP.status === 0 && seekPos > 100, `SEEK end → size=${seekPos}`);

  const rP = parseSmb(session.handle(smbReq(0x0a,
    [...u16(fid2), ...u16(seekPos), ...u32(0), ...u16(seekPos)], [], tcParsed.tid, 1))!)!;
  ok(rP.status === 0, "core READ status OK");
  // bytes: 0x01 + len(2) + data
  const dlen = rP.bytes[1] | (rP.bytes[2] << 8);
  const body = String.fromCharCode(...rP.bytes.slice(3, 3 + dlen));
  ok(dlen === seekPos, `core READ returned ${dlen} bytes`);
  ok(body.includes("windows95 tools"), `README content: ${JSON.stringify(body.slice(0, 30))}`);
}
{
  // symlink escape: link inside share → file outside share
  const outside = path.join(os.tmpdir(), "smbtest-secret.txt");
  fs.writeFileSync(outside, "leaked");
  fs.symlinkSync(outside, path.join(tmpRoot, "evil"));

  const req = smbReq(CMD_OPEN_ANDX,
    [0xff,0,0,0,...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u16(1),...u32(0),...u32(0),...u32(0)],
    [...cstr("\\evil")], 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status !== 0, "symlink escape blocked");

  fs.unlinkSync(outside);
}
{
  // symlink directory escape: link inside share → dir outside, then walk into it
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "smbtest-out-"));
  fs.writeFileSync(path.join(outsideDir, "secret.txt"), "leaked");
  fs.symlinkSync(outsideDir, path.join(tmpRoot, "evildir"));

  const req = smbReq(CMD_OPEN_ANDX,
    [0xff,0,0,0,...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u16(1),...u32(0),...u32(0),...u32(0)],
    [...cstr("\\evildir\\secret.txt")], 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status !== 0, "symlink dir escape blocked");

  fs.rmSync(outsideDir, { recursive: true });
}
{
  // symlink that stays INSIDE the share should still work
  fs.symlinkSync(path.join(tmpRoot, "hello.txt"), path.join(tmpRoot, "alias"));
  const req = smbReq(CMD_OPEN_ANDX,
    [0xff,0,0,0,...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u16(1),...u32(0),...u32(0),...u32(0)],
    [...cstr("\\alias")], 1, 1);
  const reply = session.handle(req)!;
  const parsed = parseSmb(reply)!;
  ok(parsed.status === 0, "internal symlink allowed");
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
session.destroy();
fs.rmSync(tmpRoot, { recursive: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
