// Glue: hook v86's TCP-connection bus event for port 139 and bridge it to
// our SMB server. Windows 95 connects via NetBIOS-over-TCP — ethernet frame
// → ne2k → fake_network's userspace TCP/IP → tcp-connection event with a
// stream-like TCPConnection object.
//
// To use: in emulator.tsx after `new V86()`, call
//   setupSmbShare(window.emulator, "/Users/you/share")
// Then inside Win95: Start → Run → \\192.168.86.1\host

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NetBIOSFramer, nbPositiveResponse, nbWrap } from "./netbios";
import { setupNbns } from "./nbns";
import { SmbSession, shareNameFor, TOOLS_SHARE } from "./server";

// SPIKE diagnostics: tee everything to a file so we can debug without DevTools
const LOG_FILE = process.env.WIN95_SMB_LOG || path.join(os.tmpdir(), "windows95-smb.log");
try { fs.writeFileSync(LOG_FILE, `--- ${new Date().toISOString()} ---\n`); } catch {}
const origLog = console.log;
console.log = (...args: unknown[]) => {
  origLog(...args);
  const tag = String(args[0] ?? "");
  if (tag === "[smb]" || tag === "[nbns]") {
    try {
      fs.appendFileSync(LOG_FILE, args.map(a =>
        typeof a === "string" ? a : JSON.stringify(a)).join(" ") + "\n");
    } catch {}
  }
};

interface TCPConnection {
  sport: number;
  tuple: string;
  state: string;
  net: unknown;
  on(event: "data", handler: (data: Uint8Array) => void): void;
  write(data: Uint8Array): void;
  accept(packet?: unknown): void;
  close(): void;
}

interface NetworkAdapter {
  tcp_conn: Record<string, TCPConnection>;
  on_tcp_connection?: (packet: any, tuple: string) => boolean;
  router_mac: Uint8Array;
  router_ip: Uint8Array;
}

interface V86 {
  bus: {
    register(name: string, fn: (arg: unknown) => void, ctx?: unknown): void;
  };
  network_adapter?: NetworkAdapter;
}

const log = (...a: unknown[]) => console.log("[smb]", ...a);

export function setupSmbShare(emulator: V86, hostPath: string, toolsRoot?: string) {
  log(`serving ${hostPath} on \\\\HOST\\${shareNameFor(hostPath)} ` +
      `(+ \\\\HOST\\${TOOLS_SHARE}${toolsRoot ? ` ← ${toolsRoot}` : ""}) port 139`);

  // SPIKE diagnostic: count every ethernet frame so we know if the NIC is
  // emitting anything at all (DHCP, ARP, anything). Logged on a timer so
  // we don't flood — and so the absence of a tick proves the bus is dead.
  let frameStats = { total: 0, arp: 0, ip: 0, udp: 0, tcp: 0, other: 0 };
  emulator.bus.register("net0-send", (raw: unknown) => {
    const f = raw as Uint8Array;
    frameStats.total++;
    if (f.length < 14) { frameStats.other++; return; }
    const et = (f[12] << 8) | f[13];
    if (et === 0x0806) frameStats.arp++;
    else if (et === 0x0800) {
      frameStats.ip++;
      const proto = f[14 + 9];
      if (proto === 6) frameStats.tcp++;
      else if (proto === 17) frameStats.udp++;
    } else frameStats.other++;
  });
  setInterval(() => {
    if (frameStats.total > 0) {
      log("frames:", JSON.stringify(frameStats));
      frameStats = { total: 0, arp: 0, ip: 0, udp: 0, tcp: 0, other: 0 };
    }
  }, 5000);

  // Win95 won't even try TCP 139 until UDP 137 answers a Node Status query
  setupNbns(emulator as Parameters<typeof setupNbns>[0]);

  // ─── TCP 139 hook ───────────────────────────────────────────────────────
  // v86 has two APIs depending on age:
  //   new (2025+): bus event "tcp-connection" with a pre-built conn
  //   old (≤Feb 2025): adapter.on_tcp_connection(packet, tuple) callback
  //                    where we must construct TCPConnection ourselves
  // We can't `new TCPConnection()` directly (closure-scoped), so for the
  // old API we steal the constructor from the prototype of any existing
  // connection — which means we need a probe HTTP connection to fire first
  // (or we wait for one). The fetch adapter itself uses the constructor for
  // port 80, so as soon as anything in Win95 hits HTTP, we can steal it.

  const wireConn = (conn: TCPConnection) => {
    log(`← TCP SYN ${conn.tuple}`);
    const framer = new NetBIOSFramer();
    const session = new SmbSession(hostPath, toolsRoot);

    const handler = (data: Uint8Array) => {
      for (const msg of framer.push(data)) {
        if (msg.type === 0x81) {
          log("← NB session request → +response");
          conn.write(nbPositiveResponse());
        } else if (msg.type === 0x00) {
          const reply = session.handle(msg.payload);
          if (reply) conn.write(nbWrap(reply));
        }
      }
    };

    // New v86 has .on(); old v86 had .on/.emit dead-code-eliminated by
    // Closure into a flat .on_data callback property. Check for the method
    // first, fall back to direct assignment.
    if (typeof (conn as any).on === "function") {
      conn.on("data", handler);
    } else {
      (conn as any).on_data = handler;
    }
  };

  // New API: bus event (no-op on old v86 — event never fires)
  emulator.bus.register("tcp-connection", (c: unknown) => {
    const conn = c as TCPConnection;
    if (conn.sport !== 139) return;
    wireConn(conn);
    conn.accept();
  });

  // Old API: monkey-patch adapter.on_tcp_connection. The adapter is created
  // inside V86's async init, so poll for it.
  //
  // Instead of stealing the TCPConnection constructor (closure-scoped, brittle
  // with new-on-stolen-ctor), we make the original handler build one for us
  // by handing it a port-80 SYN — then RECONFIGURE that connection for 139.
  // accept(packet) overwrites every routing field (sport/dport/hsrc/etc), and
  // .on("data") overwrites the HTTP handler. The probe's fake SYN-ACK is eaten
  // by shadowing adapter.receive (prototype method — `delete` to restore).
  const tryHook = () => {
    const adapter = emulator.network_adapter;
    if (!adapter || typeof adapter.on_tcp_connection !== "function") return false;

    const orig = adapter.on_tcp_connection.bind(adapter);
    adapter.on_tcp_connection = function (packet: any, tuple: string): boolean {
      if (packet.tcp.dport !== 139) return orig(packet, tuple);
      // New v86 fires the tcp-connection bus event BEFORE this callback;
      // if our bus handler already accepted the conn, it's in tcp_conn —
      // claim it so the original (which would otherwise RST) doesn't run.
      if (adapter.tcp_conn[tuple]) return true;

      const adapterAny = adapter as any;
      adapterAny.receive = () => {};
      let conn: TCPConnection | undefined;
      try {
        const fakeTuple = "__nbt__";
        orig({ ...packet, tcp: { ...packet.tcp, dport: 80 } }, fakeTuple);
        conn = adapter.tcp_conn[fakeTuple];
        delete adapter.tcp_conn[fakeTuple];
      } finally {
        delete adapterAny.receive;
      }

      if (!conn) {
        log("⚠ probe didn't yield a connection; RST");
        return false;
      }

      // Re-aim it at port 139. accept() overwrites sport/dport/hsrc/psrc/seq/ack
      // from the packet; .on("data") replaces the HTTP handler (assignment, not
      // push). Only state needs explicit reset — the probe accept set it to
      // "established" and we want a fresh handshake.
      conn.tuple = tuple;
      conn.state = "syn-received";
      wireConn(conn);
      try {
        conn.accept(packet);
      } catch (e) {
        log("accept threw:", e instanceof Error ? e.message : String(e));
        return false;
      }
      adapter.tcp_conn[tuple] = conn;
      return true;
    };
    log("hooked adapter.on_tcp_connection (old API, conn-recycling)");
    return true;
  };

  if (!tryHook()) {
    const poll = setInterval(() => { if (tryHook()) clearInterval(poll); }, 100);
    setTimeout(() => clearInterval(poll), 10000);
  }
}
