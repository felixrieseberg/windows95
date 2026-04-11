// With dns_method:"doh" the guest's UDP/53 queries are POSTed verbatim to
// cloudflare-dns.com/dns-query. Real DNS can't answer the app's magic names
// (single-label "windows95", "<port>.external"), which the static resolver
// used to map to a placeholder IP so the fetch adapter could take over via
// the Host header. This shim wraps global fetch, spots DoH requests for
// those names, and answers them locally with the same placeholder; every
// other lookup goes out to Cloudflare unchanged.

const PLACEHOLDER_IP = [192, 168, 87, 1];

function qnameOf(msg: Uint8Array): string {
  const labels: string[] = [];
  let i = 12;
  while (i < msg.length) {
    const len = msg[i++];
    if (len === 0) break;
    labels.push(String.fromCharCode(...msg.subarray(i, i + len)));
    i += len;
  }
  return labels.join(".");
}

function isMagicName(name: string): boolean {
  if (!name.includes(".")) return true; // windows95, host, …
  if (/^\d+\.external$/i.test(name)) return true; // 8080.external → localhost:8080
  return false;
}

function synthAResponse(query: Uint8Array): Uint8Array {
  // End of the question section: QNAME (null-terminated) + QTYPE(2) + QCLASS(2).
  let i = 12;
  while (query[i] !== 0) i += query[i] + 1;
  const qend = i + 1 + 4;

  const out = new Uint8Array(qend + 16);
  out.set(query.subarray(0, qend));
  out[2] = 0x81;
  out[3] = 0x80; // QR=1 RD=1 RA=1, RCODE=0
  out[4] = 0;
  out[5] = 1; // QDCOUNT=1
  out[6] = 0;
  out[7] = 1; // ANCOUNT=1
  out[8] = out[9] = out[10] = out[11] = 0;

  let o = qend;
  out[o++] = 0xc0;
  out[o++] = 0x0c; // NAME → pointer to question
  out[o++] = 0;
  out[o++] = 1; // TYPE A
  out[o++] = 0;
  out[o++] = 1; // CLASS IN
  out[o++] = 0;
  out[o++] = 0;
  out[o++] = 0x02;
  out[o++] = 0x58; // TTL 600
  out[o++] = 0;
  out[o++] = 4; // RDLENGTH
  out.set(PLACEHOLDER_IP, o);
  return out;
}

export function setupDnsShim() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/dns-query") && init?.body instanceof Uint8Array) {
      const q = init.body as Uint8Array;
      const name = qnameOf(q).toLowerCase();
      if (isMagicName(name)) {
        const body = synthAResponse(q);
        return Promise.resolve(
          new Response(body as unknown as BodyInit, {
            status: 200,
            headers: { "content-type": "application/dns-message" },
          }),
        );
      }
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
