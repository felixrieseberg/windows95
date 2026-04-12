import * as fs from "fs";

/**
 * v86 disk buffer backed by synchronous fs reads.
 *
 * v86's stock async loaders (AsyncXHRBuffer / AsyncFileBuffer) return from
 * .get() immediately and resolve the data on a later event-loop turn. For an
 * ATAPI PIO READ(10) that means atapi_read() leaves the drive in BSY while the
 * emulated CPU keeps running. Win95's ESDI_506/CDVSD path checks status twice
 * after pushing the CDB, sees BSY both times, and issues DEVICE RESET (08h) —
 * which cancels the in-flight read. Net effect: D: shows up but the volume
 * never mounts. Serving the bytes synchronously closes that window.
 *
 * The hard disk doesn't hit this because ESDI_506 drives it via bus-master
 * DMA, which is purely IRQ-driven on the host side.
 */
export class SyncFileBuffer {
  public byteLength: number;
  public onload: undefined | ((e: { buffer?: ArrayBuffer }) => void);
  public onprogress: undefined | (() => void);

  private fd: number;

  constructor(path: string) {
    this.fd = fs.openSync(path, "r");
    this.byteLength = fs.fstatSync(this.fd).size;
    this.onload = undefined;
    this.onprogress = undefined;
  }

  load() {
    this.onload?.({});
  }

  get(start: number, len: number, fn: (data: Uint8Array) => void) {
    const buf = Buffer.alloc(len);
    fs.readSync(this.fd, buf, 0, len, start);
    fn(new Uint8Array(buf.buffer, buf.byteOffset, len));
  }

  set(_start: number, _slice: Uint8Array, fn: () => void) {
    fn();
  }

  get_state() {
    return [[]];
  }

  set_state(_state: unknown) {}
}
