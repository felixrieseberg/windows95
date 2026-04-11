// SMB1 wire format helpers. Everything is little-endian except the
// 0xFF 'SMB' magic.

export class Reader {
  pos = 0;
  constructor(private buf: Uint8Array, start = 0) {
    this.pos = start;
  }
  u8() { return this.buf[this.pos++]; }
  u16() { const v = this.buf[this.pos] | (this.buf[this.pos+1] << 8); this.pos += 2; return v; }
  u32() { const v = this.u16() | (this.u16() << 16); return v >>> 0; }
  skip(n: number) { this.pos += n; }
  bytes(n: number) { const v = this.buf.slice(this.pos, this.pos + n); this.pos += n; return v; }
  rest() { return this.buf.slice(this.pos); }
  /** OEM string, null-terminated */
  cstr(): string {
    let end = this.pos;
    while (end < this.buf.length && this.buf[end] !== 0) end++;
    const s = String.fromCharCode(...this.buf.slice(this.pos, end));
    this.pos = end + 1;
    return s;
  }
  /** UCS-2LE string, null-terminated */
  ucs2(): string {
    let end = this.pos;
    while (end + 1 < this.buf.length && (this.buf[end] | this.buf[end+1]) !== 0) end += 2;
    const s = Buffer.from(this.buf.slice(this.pos, end)).toString('ucs2');
    this.pos = end + 2;
    return s;
  }
}

export class Writer {
  private chunks: number[] = [];
  u8(v: number) { this.chunks.push(v & 0xff); return this; }
  u16(v: number) { this.chunks.push(v & 0xff, (v >> 8) & 0xff); return this; }
  u32(v: number) { return this.u16(v & 0xffff).u16((v >>> 16) & 0xffff); }
  u64(lo: number, hi = 0) { return this.u32(lo).u32(hi); }
  bytes(b: Uint8Array | number[]) { for (const x of b) this.chunks.push(x & 0xff); return this; }
  zero(n: number) { for (let i = 0; i < n; i++) this.chunks.push(0); return this; }
  cstr(s: string) { for (let i = 0; i < s.length; i++) this.chunks.push(s.charCodeAt(i) & 0xff); this.chunks.push(0); return this; }
  ucs2(s: string) {
    const b = Buffer.from(s, 'ucs2');
    for (const x of b) this.chunks.push(x);
    this.chunks.push(0, 0);
    return this;
  }
  patch32(at: number, v: number) {
    this.chunks[at] = v & 0xff;
    this.chunks[at+1] = (v >>> 8) & 0xff;
    this.chunks[at+2] = (v >>> 16) & 0xff;
    this.chunks[at+3] = (v >>> 24) & 0xff;
    return this;
  }
  get length() { return this.chunks.length; }
  build() { return new Uint8Array(this.chunks); }
}
