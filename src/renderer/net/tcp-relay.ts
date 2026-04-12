// Bridge v86's userspace TCP stack to real host sockets so the guest can
// reach arbitrary TCP ports — not just the fetch adapter's port-80 HTTP path.
// We keep relay_url:"fetch" (for DHCP/ARP/ICMP/DNS plumbing and the existing
// port-80 handling) and simply claim every other SYN on the same bus event.
//
// Requires net_device.dns_method:"doh" so the guest resolves real IPs; the
// default "static" mode hands out 192.168.87.1 for everything, which only
// works because the fetch adapter re-reads the Host header.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as net from "net";

interface TCPConnection {
  sport: number; // dest port the guest connected to
  psrc: Uint8Array; // dest IP (4 bytes) — "source" from the router's POV
  tuple: string;
  net: { tcp_conn: Record<string, unknown> };
  on(event: "data", handler: (data: Uint8Array) => void): void;
  write(data: Uint8Array): void;
  accept(): void;
  close(): void;
  on_shutdown: () => void;
  on_close: () => void;
}

interface V86 {
  bus: { register(name: string, fn: (arg: unknown) => void): void };
}

const LOG_FILE =
  process.env.WIN95_TCP_RELAY_LOG ||
  path.join(os.tmpdir(), "win95-tcp-relay.log");
try {
  fs.writeFileSync(LOG_FILE, `--- ${new Date().toISOString()} ---\n`);
} catch {}
const log = (...a: unknown[]) => {
  console.log("[tcp-relay]", ...a);
  try {
    fs.appendFileSync(LOG_FILE, a.join(" ") + "\n");
  } catch {}
};

// Ports already claimed by other in-process handlers.
const RESERVED_PORTS = new Set([80, 139]);

// WIN95_TCP_TEST_PORT=<n> short-circuits that port to an in-process fake
// upstream that writes a banner asynchronously (i.e., from outside a CPU
// tick) and then echoes everything back. Lets the probe harness exercise
// the recv() path deterministically without a real network endpoint.
const TEST_PORT = Number(process.env.WIN95_TCP_TEST_PORT) || 0;
const TEST_BANNER_BYTES = Number(process.env.WIN95_TCP_TEST_BYTES) || 3000;

// Destinations we never relay to. The emulated LAN (192.168.86/87) has nothing
// real behind it; loopback and link-local would let guest software poke at the
// host's own services or cloud-metadata endpoints. The rest of RFC1918 is left
// reachable on purpose — talking to a NAS or BBS on the user's LAN is a
// legitimate use of this bridge, and the port-80 fetch path already allows it.
function isBlockedDest(p: Uint8Array): boolean {
  const [a, b] = p;
  if (a === 192 && b === 168 && (p[2] === 86 || p[2] === 87)) return true;
  if (a === 127 || a === 0 || a >= 224) return true; // loopback, "this", multicast+
  if (a === 169 && b === 254) return true; // link-local / metadata
  return false;
}

export function setupTcpRelay(emulator: V86) {
  emulator.bus.register("tcp-connection", (c: unknown) => {
    const conn = c as TCPConnection;
    const port = conn.sport;
    if (RESERVED_PORTS.has(port)) return;
    if (isBlockedDest(conn.psrc)) return;

    const ip = Array.from(conn.psrc).join(".");

    // Must accept synchronously or v86 RSTs the SYN right after dispatch.
    conn.accept();
    log(`→ ${ip}:${port} (${conn.tuple})`);

    if (TEST_PORT && port === TEST_PORT) {
      const mode = process.env.WIN95_TCP_TEST_MODE || "banner";
      const banner = Buffer.alloc(TEST_BANNER_BYTES, 0x41);
      banner.write(`HELLO from tcp-relay test, ${TEST_BANNER_BYTES}B\r\n`);
      let n = 0;
      conn.on("data", (d) => {
        if (d.length === 0) return;
        n += d.length;
        log(`test ← guest ${d.length}B (total ${n})`);
        if (mode === "after-data" && n >= 1) {
          setTimeout(() => {
            log(`test → guest ${banner.length}B banner (async, after-data)`);
            conn.write(banner);
          }, 10);
        }
      });
      if (mode === "banner")
        setTimeout(
          () => {
            log(`test → guest ${banner.length}B banner (async)`);
            conn.write(banner);
          },
          Number(process.env.WIN95_TCP_TEST_DELAY) || 50,
        );
      conn.on_shutdown = conn.on_close = () => log("test guest closed");
      return;
    }

    let connected = false;
    let pending: Buffer[] | null = [];
    let upstreamGone = false;

    const sock = net.connect({ host: ip, port });

    sock.on("connect", () => {
      connected = true;
      if (pending) {
        for (const b of pending) sock.write(b);
        pending = null;
      }
    });
    sock.on("data", (d) => conn.write(d));
    sock.on("close", () => {
      upstreamGone = true;
      conn.close();
    });
    sock.on("error", (e: NodeJS.ErrnoException) => {
      log(`✗ ${ip}:${port} ${e.code || e.message}`);
      upstreamGone = true;
      conn.close();
    });

    // tcp_data is a subarray into v86's reused frame buffer — copy before
    // handing to an async writer.
    conn.on("data", (d) => {
      if (d.length === 0) return;
      const buf = Buffer.from(d);
      if (connected) sock.write(buf);
      else pending?.push(buf);
    });

    const teardown = () => {
      if (upstreamGone) return;
      upstreamGone = true;
      if (connected) sock.end();
      else sock.destroy();
    };
    conn.on_shutdown = teardown;
    conn.on_close = teardown;
  });

  log("active — guest TCP to non-80/139 ports is bridged to host sockets");
}
