// NetBIOS Session Service (RFC 1002, port 139). All SMB1 traffic from
// Windows 95 is wrapped in these 4-byte-header frames.

const NB_SESSION_MESSAGE = 0x00;
const NB_SESSION_REQUEST = 0x81;
const NB_POSITIVE_RESPONSE = 0x82;
const NB_SESSION_KEEPALIVE = 0x85;

export type NBMessage =
  | { type: typeof NB_SESSION_MESSAGE; payload: Uint8Array }
  | { type: typeof NB_SESSION_REQUEST }
  | { type: typeof NB_SESSION_KEEPALIVE };

/**
 * Reassembles NetBIOS frames from a TCP stream. TCP delivers in
 * arbitrary chunks so we buffer until we have a complete frame.
 */
export class NetBIOSFramer {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): NBMessage[] {
    // append
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const out: NBMessage[] = [];
    while (this.buf.length >= 4) {
      const type = this.buf[0];
      // length is 17-bit: high bit of byte 1, then bytes 2-3 big-endian
      const len = ((this.buf[1] & 0x01) << 16) | (this.buf[2] << 8) | this.buf[3];
      const total = 4 + len;
      if (this.buf.length < total) break;

      const frame = this.buf.subarray(0, total);
      this.buf = this.buf.slice(total);

      if (type === NB_SESSION_REQUEST) {
        out.push({ type: NB_SESSION_REQUEST });
      } else if (type === NB_SESSION_MESSAGE) {
        out.push({ type: NB_SESSION_MESSAGE, payload: frame.slice(4) });
      } else if (type === NB_SESSION_KEEPALIVE) {
        out.push({ type: NB_SESSION_KEEPALIVE });
      }
      // anything else: drop
    }
    return out;
  }
}

export function nbPositiveResponse(): Uint8Array {
  return new Uint8Array([NB_POSITIVE_RESPONSE, 0, 0, 0]);
}

export function nbWrap(payload: Uint8Array): Uint8Array {
  const len = payload.length;
  const out = new Uint8Array(4 + len);
  out[0] = NB_SESSION_MESSAGE;
  out[1] = (len >> 16) & 0x01;
  out[2] = (len >> 8) & 0xff;
  out[3] = len & 0xff;
  out.set(payload, 4);
  return out;
}
