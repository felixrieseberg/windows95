// Standalone test of the SMB stack — no v86, no Electron. Feeds canned
// requests through NetBIOSFramer + SmbSession and inspects responses.
// Run: npx ts-node src/renderer/smb/test-standalone.ts

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
  ok(parsed.wordCount === 13, "13-word LM response");
  // word[0] = dialect index — we pick LANMAN2.1 (idx 3) since our 13-word
  // response is the LANMAN format; picking NT LM 0.12 would require the
  // 17-word NT response which we don't implement
  const pickedIdx = parsed.words[0] | (parsed.words[1] << 8);
  ok(pickedIdx === 3, `picked LANMAN2.1 (idx ${pickedIdx})`);
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
  // Should find: . .. _MAPZ.BAT(virtual) hello.txt subdir = 5
  ok(searchCount === 5, `found ${searchCount} entries (expect 5)`);
  // Data block has the entries — just verify they're in there somewhere
  const dataStr = String.fromCharCode(...parsed.bytes);
  ok(dataStr.includes("_MAPZ.BAT"), "virtual _MAPZ.BAT in listing");
  ok(dataStr.includes("hello.txt"), "hello.txt in listing");
  ok(dataStr.includes("subdir"), "subdir in listing");
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
  // Virtual file: open and read _MAPZ.BAT
  const oReq = smbReq(CMD_OPEN_ANDX,
    [0xff,0,0,0,...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u16(1),...u32(0),...u32(0),...u32(0)],
    [...cstr("\\_MAPZ.BAT")], 1, 1);
  const oReply = session.handle(oReq)!;
  const oParsed = parseSmb(oReply)!;
  ok(oParsed.status === 0, "open virtual _MAPZ.BAT");
  const vfid = oParsed.words[4] | (oParsed.words[5] << 8);
  const rReq = smbReq(CMD_READ_ANDX,
    [0xff,0,0,0,...u16(vfid),...u32(0),...u16(500),...u16(0),...u32(0),...u16(0)], [], 1, 1);
  const rReply = session.handle(rReq)!;
  const rParsed = parseSmb(rReply)!;
  const len = rParsed.words[10] | (rParsed.words[11] << 8);
  const text = String.fromCharCode(...rParsed.bytes.slice(1, 1 + len));
  ok(text.includes("NET USE Z:"), `virtual read: ${JSON.stringify(text.slice(0, 40))}`);
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
