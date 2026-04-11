// Minimal SMB1/CIFS implementation — just enough for Windows 95 to map a
// drive and read files. Spec: [MS-CIFS] / [MS-SMB].
//
// SMB1 message = 32-byte header + word block + byte block.
// Header is at a fixed offset; word/byte blocks vary by command.

import { Reader, Writer } from "./wire";

export const SMB_MAGIC = [0xff, 0x53, 0x4d, 0x42]; // \xFF SMB

// Commands we handle
export const CMD_NEGOTIATE = 0x72;
export const CMD_SESSION_SETUP_ANDX = 0x73;
export const CMD_TREE_CONNECT_ANDX = 0x75;
export const CMD_TREE_DISCONNECT = 0x71;
export const CMD_LOGOFF_ANDX = 0x74;
export const CMD_NT_CREATE_ANDX = 0xa2;
export const CMD_OPEN_ANDX = 0x2d;
export const CMD_READ = 0x0a;
export const CMD_READ_ANDX = 0x2e;
export const CMD_SEEK = 0x12;
export const CMD_CLOSE = 0x04;
export const CMD_TRANSACTION = 0x25;
export const CMD_TRANSACTION2 = 0x32;
export const CMD_ECHO = 0x2b;
export const CMD_QUERY_INFORMATION = 0x08;
export const CMD_QUERY_INFORMATION2 = 0x23;
export const CMD_FIND_CLOSE2 = 0x34;
export const CMD_CHECK_DIRECTORY = 0x10;
export const CMD_SEARCH = 0x81;

// TRANS2 subcommands
export const TRANS2_FIND_FIRST2 = 0x01;
export const TRANS2_FIND_NEXT2 = 0x02;
export const TRANS2_QUERY_FS_INFO = 0x03;
export const TRANS2_QUERY_PATH_INFO = 0x05;
export const TRANS2_QUERY_FILE_INFO = 0x07;

// Status codes (DOS-style, not NT)
export const STATUS_OK = 0x00000000;
export const ERRDOS = 0x01;
export const ERRSRV = 0x02;
export const ERR_BADFILE = 0x0002; // file not found
export const ERR_BADPATH = 0x0003; // path not found
export const ERR_NOACCESS = 0x0005;
export const ERR_BADFID = 0x0006;
export const ERR_NOFILES = 0x0012; // no more files
export const ERR_BADFUNC = 0x0001; // unsupported

// Flags
const FLAGS_REPLY = 0x80;
const FLAGS_CASELESS = 0x08;
const FLAGS_CANONICAL = 0x10;

// Flags2 (we only echo LONG_NAMES; never claim NT_STATUS or UNICODE)
const FLAGS2_LONG_NAMES = 0x0001;

export interface SmbHeader {
  cmd: number;
  status: number;
  flags: number;
  flags2: number;
  tid: number;
  pid: number;
  uid: number;
  mid: number;
  wordCount: number;
  words: Uint8Array; // raw parameter words (wordCount*2 bytes)
  byteCount: number;
  bytes: Uint8Array; // raw data bytes
}

export function parseSmb(buf: Uint8Array): SmbHeader | null {
  if (buf.length < 33) return null;
  if (buf[0] !== 0xff || buf[1] !== 0x53 || buf[2] !== 0x4d || buf[3] !== 0x42) {
    return null;
  }
  const r = new Reader(buf, 4);
  const cmd = r.u8();
  const status = r.u32();
  const flags = r.u8();
  const flags2 = r.u16();
  r.skip(12); // PIDHigh(2) + SecurityFeatures(8) + Reserved(2)
  const tid = r.u16();
  const pid = r.u16();
  const uid = r.u16();
  const mid = r.u16();
  const wordCount = r.u8();
  const words = r.bytes(wordCount * 2);
  const byteCount = r.u16();
  const bytes = r.bytes(byteCount);
  return { cmd, status, flags, flags2, tid, pid, uid, mid, wordCount, words, byteCount, bytes };
}

/**
 * Build an SMB1 reply. The reply echoes tid/pid/uid/mid from the request and
 * sets the reply flag. Status uses DOS error class/code in the low bytes
 * (we don't set FLAGS2_NT_STATUS).
 */
export function buildSmb(
  req: SmbHeader,
  cmd: number,
  status: number,
  words: Uint8Array,
  bytes: Uint8Array,
  overrides?: { tid?: number; uid?: number; flags2?: number }
): Uint8Array {
  const w = new Writer();
  w.bytes(SMB_MAGIC);
  w.u8(cmd);
  w.u32(status);
  w.u8(FLAGS_REPLY | FLAGS_CASELESS | FLAGS_CANONICAL);
  // mirror long-name capability so the client keeps sending long names; never
  // claim NT status or unicode (we reply in ASCII)
  w.u16((overrides?.flags2 ?? req.flags2) & FLAGS2_LONG_NAMES);
  w.zero(12);
  w.u16(overrides?.tid ?? req.tid);
  w.u16(req.pid);
  w.u16(overrides?.uid ?? req.uid);
  w.u16(req.mid);
  if (words.length % 2 !== 0) throw new Error("word block must be even");
  w.u8(words.length / 2);
  w.bytes(words);
  w.u16(bytes.length);
  w.bytes(bytes);
  return w.build();
}

export function dosError(errClass: number, errCode: number): number {
  // DOS-style: byte 0 = class, byte 1 = reserved, bytes 2-3 = code (LE)
  return errClass | (errCode << 16);
}

/** AndX: most replies have a 4-byte AndX header at the start of words */
export function andxNone(): number[] {
  return [0xff, 0x00, 0x00, 0x00]; // AndXCommand=0xFF (none), reserved, offset=0
}

export const cmdName: Record<number, string> = {
  [CMD_NEGOTIATE]: "NEGOTIATE",
  [CMD_SESSION_SETUP_ANDX]: "SESSION_SETUP",
  [CMD_TREE_CONNECT_ANDX]: "TREE_CONNECT",
  [CMD_TREE_DISCONNECT]: "TREE_DISCONNECT",
  [CMD_LOGOFF_ANDX]: "LOGOFF",
  [CMD_NT_CREATE_ANDX]: "NT_CREATE",
  [CMD_OPEN_ANDX]: "OPEN",
  [CMD_READ_ANDX]: "READ",
  [CMD_READ]: "READ",
  [CMD_SEEK]: "SEEK",
  [CMD_CLOSE]: "CLOSE",
  [CMD_TRANSACTION]: "TRANS(RAP)",
  [CMD_TRANSACTION2]: "TRANS2",
  [CMD_ECHO]: "ECHO",
  [CMD_QUERY_INFORMATION]: "QUERY_INFO",
  [CMD_QUERY_INFORMATION2]: "QUERY_INFO2",
  [CMD_FIND_CLOSE2]: "FIND_CLOSE2",
  [CMD_CHECK_DIRECTORY]: "CHECK_DIR",
  [CMD_SEARCH]: "SEARCH",
};
