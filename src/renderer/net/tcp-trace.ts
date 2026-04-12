// Deep packet trace for the v86 userspace TCP ↔ NE2000 path. Activated by
// WIN95_TCP_TRACE=<port> — every guest-TX and host-RX TCP frame on that
// dest port is decoded and appended to /tmp/win95-tcp-trace.log, and the
// NE2000 receive() is wrapped so we can see whether frames injected from
// outside a CPU tick ever land in the RX ring (vs. being filtered out).

import * as fs from "fs";

const TRACE_FILE =
  process.env.WIN95_TCP_TRACE_FILE || "/tmp/win95-tcp-trace.log";

interface V86 {
  bus: { register(name: string, fn: (arg: unknown) => void): void };
  v86?: { cpu?: { devices?: { net?: unknown } } };
}

function flags(b: number): string {
  let s = "";
  if (b & 1) s += "F";
  if (b & 2) s += "S";
  if (b & 4) s += "R";
  if (b & 8) s += "P";
  if (b & 16) s += "A";
  return s || ".";
}

function decodeTcp(f: Uint8Array, port: number) {
  if (f.length < 54) return null;
  if (((f[12] << 8) | f[13]) !== 0x0800) return null;
  const ihl = (f[14] & 0x0f) * 4;
  if (f[14 + 9] !== 6) return null;
  const ipLen = (f[16] << 8) | f[17];
  const t = 14 + ihl;
  const sport = (f[t] << 8) | f[t + 1];
  const dport = (f[t + 2] << 8) | f[t + 3];
  if (sport !== port && dport !== port) return null;
  const seq =
    (f[t + 4] * 0x1000000 + (f[t + 5] << 16) + (f[t + 6] << 8) + f[t + 7]) >>>
    0;
  const ack =
    (f[t + 8] * 0x1000000 + (f[t + 9] << 16) + (f[t + 10] << 8) + f[t + 11]) >>>
    0;
  const doff = (f[t + 12] >> 4) * 4;
  const fl = f[t + 13];
  const win = (f[t + 14] << 8) | f[t + 15];
  const dlen = ipLen - ihl - doff;
  return { sport, dport, seq, ack, fl: flags(fl), win, dlen, frameLen: f.length };
}

export function setupTcpTrace(emulator: V86) {
  const port = Number(process.env.WIN95_TCP_TRACE);
  if (!port) return;

  const t0 = Date.now();
  fs.writeFileSync(TRACE_FILE, `--- trace port ${port} ---\n`);
  const w = (s: string) => {
    const line = `[${((Date.now() - t0) / 1000).toFixed(3)}s] ${s}\n`;
    try {
      fs.appendFileSync(TRACE_FILE, line);
    } catch {}
  };

  emulator.bus.register("net0-send", (raw: unknown) => {
    const f = raw as Uint8Array;
    const r = decodeTcp(f, port);
    if (r)
      w(
        `guest→  ${r.sport}>${r.dport} seq=${r.seq} ack=${r.ack} ${r.fl} win=${r.win} len=${r.dlen}`,
      );
    else if (f.length >= 14) {
      const et = (f[12] << 8) | f[13];
      const dst =
        et === 0x0800 ? f.subarray(30, 34).join(".") : et === 0x0806 ? "arp" : "?";
      w(
        `guest→  [other] len=${f.length}@${f.byteOffset} et=0x${et.toString(16)} dst=${dst}`,
      );
    }
  });

  // Wrap NE2000 receive() to see if/why a frame is dropped at the NIC layer.
  const arm = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ne2k = (emulator as any).v86?.cpu?.devices?.net;
    if (!ne2k) return false;
    const orig = ne2k.receive.bind(ne2k);
    ne2k.receive = function (a: Uint8Array) {
      const r = decodeTcp(a, port);
      if (r) {
        const pages = 1 + ((Math.max(60, a.length) + 4) >> 8);
        const avail =
          this.boundary > this.curpg
            ? this.boundary - this.curpg
            : this.pstop - this.curpg + this.boundary - this.pstart;
        const macOk =
          a[0] === this.mac[0] && a[1] === this.mac[1] && a[2] === this.mac[2];
        const drop =
          this.cr & 1
            ? "STP"
            : !macOk && a[0] !== 0xff && !(this.rxcr & 16)
              ? "MAC"
              : avail < pages && this.boundary !== 0
                ? "FULL"
                : "";
        w(
          `  ne2k.recv frame=${a.length} sip=${a.slice(26, 30).join(".")} cr=0x${this.cr.toString(16)}` +
            ` cur=${this.curpg} bnd=${this.boundary}${drop ? " DROP:" + drop : ""}`,
        );
      }
      return orig(a);
    };
    w("ne2k.receive wrapped");
    return true;
  };
  if (!arm()) {
    const p = setInterval(() => arm() && clearInterval(p), 100);
    setTimeout(() => clearInterval(p), 10000);
  }
}
