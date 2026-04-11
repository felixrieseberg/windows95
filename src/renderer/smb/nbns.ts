// NetBIOS Name Service (RFC 1002, UDP 137). Win95 won't connect to
// \\192.168.86.1 until this answers — even with an IP address it sends a
// Node Status Request to learn our NetBIOS name for the session-layer
// "called name" field.
//
// fake_network.js handles DNS/DHCP/NTP/echo and silently drops everything
// else. We tap net0-send to see raw ethernet frames, parse UDP 137 ourselves,
// and inject replies via net0-receive.

const ETHERTYPE_IPV4 = 0x0800;
const IPPROTO_UDP = 17;
const NBNS_PORT = 137;

const NB_NAME = "HOST";              // what shows up in Network Neighborhood
const NB_WORKGROUP = "WORKGROUP";

const log = (...a: unknown[]) => console.log("[nbns]", ...a);

interface V86 {
  bus: {
    register(name: string, fn: (data: Uint8Array) => void): void;
    send(name: string, data: Uint8Array): void;
  };
  network_adapter?: {
    router_mac: Uint8Array;
    router_ip: Uint8Array;
    vm_mac: Uint8Array;
    vm_ip: Uint8Array;
  };
}

export function setupNbns(emulator: V86) {
  emulator.bus.register("net0-send", (frame: Uint8Array) => {
    const r = parseUdp(frame);
    if (!r || r.dport !== NBNS_PORT) return;

    const reply = handleNbns(r.payload, emulator);
    if (reply) {
      const eth = buildUdpFrame(emulator, r, NBNS_PORT, r.sport, reply);
      emulator.bus.send("net0-receive", eth);
    }
  });
  log(`listening on UDP 137 — answering as "${NB_NAME}"`);
}

// ─── Packet parsing ──────────────────────────────────────────────────────────

interface UdpPacket {
  srcMac: Uint8Array; dstMac: Uint8Array;
  srcIp: Uint8Array; dstIp: Uint8Array;
  sport: number; dport: number;
  payload: Uint8Array;
}

function parseUdp(frame: Uint8Array): UdpPacket | null {
  if (frame.length < 42) return null;
  const ethertype = (frame[12] << 8) | frame[13];
  if (ethertype !== ETHERTYPE_IPV4) return null;

  const ip = 14;
  const ihl = (frame[ip] & 0x0f) * 4;
  if (frame[ip + 9] !== IPPROTO_UDP) return null;

  const udp = ip + ihl;
  const sport = (frame[udp] << 8) | frame[udp + 1];
  const dport = (frame[udp + 2] << 8) | frame[udp + 3];
  const len = (frame[udp + 4] << 8) | frame[udp + 5];

  return {
    srcMac: frame.slice(6, 12),
    dstMac: frame.slice(0, 6),
    srcIp: frame.slice(ip + 12, ip + 16),
    dstIp: frame.slice(ip + 16, ip + 20),
    sport, dport,
    payload: frame.slice(udp + 8, udp + len),
  };
}

// ─── NBNS protocol ───────────────────────────────────────────────────────────
// Format is DNS-like. Names are encoded by splitting each byte into two
// nibbles, adding 'A' (0x41) to each — so "HOST    " becomes 32 chars.

const TYPE_NB = 0x0020;       // name query → IP
const TYPE_NBSTAT = 0x0021;   // node status → name list
const CLASS_IN = 0x0001;

function handleNbns(data: Uint8Array, emulator: V86): Uint8Array | null {
  if (data.length < 12) return null;
  const txid = (data[0] << 8) | data[1];
  const flags = (data[2] << 8) | data[3];
  const opcode = (flags >> 11) & 0x0f;
  const qdcount = (data[4] << 8) | data[5];

  if (opcode !== 0 || qdcount < 1) return null; // not a query

  // Parse first question. Name is L1-encoded: length byte (always 32), then
  // 32 chars, then 0x00, then type(2) + class(2).
  let p = 12;
  const nameLen = data[p++];
  if (nameLen !== 32) return null;
  const encoded = data.slice(p, p + 32);
  p += 32;
  if (data[p++] !== 0) return null; // scope terminator
  const qtype = (data[p] << 8) | data[p + 1]; p += 2;
  /* qclass */ p += 2;

  const name = decodeNbName(encoded);
  const adapter = emulator.network_adapter;
  if (!adapter) { log("no adapter yet"); return null; }

  log(`← query type=0x${qtype.toString(16)} name="${name}" txid=${txid}`);

  if (qtype === TYPE_NBSTAT) {
    // Node Status: "what names are registered on this node?"
    // RDATA = num_names(1) + (name(15) + suffix(1) + flags(2)) * N + stats(46)
    const names = [
      { name: NB_NAME, suffix: 0x00, flags: 0x0400 },      // workstation, unique, active
      { name: NB_NAME, suffix: 0x20, flags: 0x0400 },      // file server, unique, active
      { name: NB_WORKGROUP, suffix: 0x00, flags: 0x8400 }, // workgroup, group, active
    ];
    const rdata: number[] = [names.length];
    for (const n of names) {
      const padded = n.name.padEnd(15, " ");
      for (let i = 0; i < 15; i++) rdata.push(padded.charCodeAt(i));
      rdata.push(n.suffix);
      rdata.push((n.flags >> 8) & 0xff, n.flags & 0xff);
    }
    // 46-byte statistics block: 6-byte MAC + 40 bytes of zeros
    for (const b of adapter.router_mac) rdata.push(b);
    for (let i = 0; i < 40; i++) rdata.push(0);

    return buildNbnsAnswer(txid, encoded, TYPE_NBSTAT, new Uint8Array(rdata));
  }

  if (qtype === TYPE_NB) {
    // Name Query: "what IP has this name?" — answer if it's us or wildcard
    const trimmed = name.trim().toUpperCase();
    if (trimmed !== NB_NAME && trimmed !== "*") {
      return null; // not us — drop, let it time out
    }
    // RDATA = flags(2) + ip(4)
    const rdata = new Uint8Array([
      0x00, 0x00, // unique, B-node
      ...adapter.router_ip,
    ]);
    return buildNbnsAnswer(txid, encoded, TYPE_NB, rdata);
  }

  return null;
}

function buildNbnsAnswer(txid: number, encodedName: Uint8Array, type: number,
                         rdata: Uint8Array): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push((v >> 8) & 0xff, v & 0xff);
  const u32 = (v: number) => { u16((v >>> 16) & 0xffff); u16(v & 0xffff); };

  u16(txid);
  u16(0x8400);     // response + authoritative, opcode=0, rcode=0
  u16(0);          // qdcount
  u16(1);          // ancount
  u16(0); u16(0);  // ns/ar

  // answer RR: name(L1-encoded) + type + class + ttl + rdlen + rdata
  out.push(32); for (const b of encodedName) out.push(b); out.push(0);
  u16(type);
  u16(CLASS_IN);
  u32(300);        // TTL 5min
  u16(rdata.length);
  for (const b of rdata) out.push(b);

  return new Uint8Array(out);
}

function decodeNbName(enc: Uint8Array): string {
  // Each pair of bytes encodes one byte: ((b1-'A')<<4) | (b2-'A')
  let s = "";
  for (let i = 0; i < 30; i += 2) {
    const hi = enc[i] - 0x41;
    const lo = enc[i + 1] - 0x41;
    s += String.fromCharCode((hi << 4) | lo);
  }
  return s; // 15 chars, space-padded; 16th byte (suffix) ignored here
}

// ─── Ethernet frame building ─────────────────────────────────────────────────

function buildUdpFrame(emulator: V86, req: UdpPacket, sport: number,
                       dport: number, payload: Uint8Array): Uint8Array {
  const a = emulator.network_adapter!;
  // For broadcast queries, reply unicast from router_ip → vm_ip; for
  // unicast, just swap. Either way the dest MAC/IP come from the request.
  const srcMac = a.router_mac;
  const dstMac = req.srcMac;
  const srcIp = a.router_ip;
  const dstIp = req.srcIp;

  const udpLen = 8 + payload.length;
  const ipLen = 20 + udpLen;
  const total = 14 + ipLen;
  const f = new Uint8Array(total);

  // Ethernet
  f.set(dstMac, 0);
  f.set(srcMac, 6);
  f[12] = ETHERTYPE_IPV4 >> 8; f[13] = ETHERTYPE_IPV4 & 0xff;

  // IPv4 (offset 14)
  const ip = 14;
  f[ip] = 0x45;                    // v4, IHL=5
  f[ip + 1] = 0;                   // DSCP/ECN
  f[ip + 2] = ipLen >> 8; f[ip + 3] = ipLen & 0xff;
  f[ip + 4] = 0; f[ip + 5] = 0;    // ID
  f[ip + 6] = 0x40; f[ip + 7] = 0; // DF, no fragment
  f[ip + 8] = 64;                  // TTL
  f[ip + 9] = IPPROTO_UDP;
  f[ip + 10] = 0; f[ip + 11] = 0;  // checksum placeholder
  f.set(srcIp, ip + 12);
  f.set(dstIp, ip + 16);
  const ipck = ipChecksum(f.subarray(ip, ip + 20));
  f[ip + 10] = ipck >> 8; f[ip + 11] = ipck & 0xff;

  // UDP (offset 34)
  const udp = ip + 20;
  f[udp] = sport >> 8; f[udp + 1] = sport & 0xff;
  f[udp + 2] = dport >> 8; f[udp + 3] = dport & 0xff;
  f[udp + 4] = udpLen >> 8; f[udp + 5] = udpLen & 0xff;
  f[udp + 6] = 0; f[udp + 7] = 0;  // checksum placeholder
  f.set(payload, udp + 8);
  const uck = udpChecksum(srcIp, dstIp, f.subarray(udp, udp + udpLen));
  f[udp + 6] = uck >> 8; f[udp + 7] = uck & 0xff;

  return f;
}

function ipChecksum(hdr: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < hdr.length; i += 2) {
    sum += (hdr[i] << 8) | hdr[i + 1];
  }
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return (~sum) & 0xffff;
}

function udpChecksum(srcIp: Uint8Array, dstIp: Uint8Array, udp: Uint8Array): number {
  // pseudo-header: src(4) + dst(4) + zero(1) + proto(1) + udplen(2)
  let sum = 0;
  const add = (hi: number, lo: number) => { sum += (hi << 8) | lo; };
  add(srcIp[0], srcIp[1]); add(srcIp[2], srcIp[3]);
  add(dstIp[0], dstIp[1]); add(dstIp[2], dstIp[3]);
  add(0, IPPROTO_UDP);
  add(udp.length >> 8, udp.length & 0xff);
  for (let i = 0; i < udp.length - 1; i += 2) add(udp[i], udp[i + 1]);
  if (udp.length & 1) add(udp[udp.length - 1], 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  const ck = (~sum) & 0xffff;
  return ck === 0 ? 0xffff : ck; // UDP: zero means "no checksum", so flip
}
