import * as fs from "fs";
import * as path from "path";

/**
 * Minimal read-only FAT32 walker. Just enough to pull user files out of the
 * recovered overlay+base view — no writes, no FAT12/16, no exFAT.
 *
 * `readSector(lba)` returns 512 bytes at absolute LBA from the *full disk*
 * (MBR at LBA 0). `isDirty(lba)` reports whether that sector came from the
 * guest's write overlay; we use it to skip files the user never touched so
 * the output isn't 200 MB of possibly-mismatched OS binaries.
 */
export async function extractFat32(
  readSector: (lba: number) => Buffer,
  isDirty: (lba: number) => boolean,
  outDir: string,
): Promise<number> {
  // First partition from the MBR.
  const mbr = readSector(0);
  const partLba = mbr.readUInt32LE(0x1be + 8);

  const bpb = readSector(partLba);
  const bytesPerSec = bpb.readUInt16LE(11);
  const secPerClus = bpb.readUInt8(13);
  const rsvd = bpb.readUInt16LE(14);
  const nFats = bpb.readUInt8(16);
  const secPerFat = bpb.readUInt32LE(36);
  const rootClus = bpb.readUInt32LE(44);
  if (bytesPerSec !== 512) throw new Error("unexpected sector size");

  const fatLba = partLba + rsvd;
  const dataLba = partLba + rsvd + nFats * secPerFat;
  const clusLba = (c: number) => dataLba + (c - 2) * secPerClus;

  const fatSecCache = new Map<number, Buffer>();
  const nextCluster = (c: number) => {
    const off = c * 4;
    const sec = fatLba + (off >> 9);
    let b = fatSecCache.get(sec);
    if (!b) fatSecCache.set(sec, (b = readSector(sec)));
    return b.readUInt32LE(off & 511) & 0x0fffffff;
  };

  const chain = (c: number) => {
    const out: number[] = [];
    while (c >= 2 && c < 0x0ffffff8 && out.length < 1 << 20) {
      out.push(c);
      c = nextCluster(c);
    }
    return out;
  };

  const readClusters = (clusters: number[]) => {
    const buf = Buffer.allocUnsafe(clusters.length * secPerClus * 512);
    let o = 0;
    for (const c of clusters) {
      const base = clusLba(c);
      for (let s = 0; s < secPerClus; s++)
        readSector(base + s).copy(buf, o + s * 512);
      o += secPerClus * 512;
    }
    return buf;
  };

  const anyDirty = (clusters: number[]) => {
    for (const c of clusters) {
      const base = clusLba(c);
      for (let s = 0; s < secPerClus; s++) if (isDirty(base + s)) return true;
    }
    return false;
  };

  const safe = (n: string) =>
    n.replace(/[\\/:*?"<>|]/g, "_").replace(/[. ]+$/, "") || "_";

  let files = 0;
  const walk = async (clus: number, hostDir: string) => {
    const raw = readClusters(chain(clus));
    let lfn = "";
    for (let i = 0; i + 32 <= raw.length; i += 32) {
      const e = raw.subarray(i, i + 32);
      if (e[0] === 0) break;
      if (e[0] === 0xe5) {
        lfn = "";
        continue;
      }
      const attr = e[11];
      if ((attr & 0x3f) === 0x0f) {
        // VFAT LFN entries arrive last-first; each carries 13 UCS-2 chars.
        let part = "";
        for (const o of [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30]) {
          const ch = e.readUInt16LE(o);
          if (ch === 0 || ch === 0xffff) break;
          part += String.fromCharCode(ch);
        }
        lfn = part + lfn;
        continue;
      }
      if (attr & 0x08) {
        lfn = "";
        continue; // volume label
      }
      const short =
        e.toString("latin1", 0, 8).trimEnd() +
        (e[8] !== 0x20
          ? "." + e.toString("latin1", 8, 11).trimEnd()
          : "");
      const name = lfn || short;
      lfn = "";
      if (name === "." || name === "..") continue;
      const start = (e.readUInt16LE(20) << 16) | e.readUInt16LE(26);
      if (attr & 0x10) {
        if (start >= 2) await walk(start, path.join(hostDir, safe(name)));
      } else {
        const size = e.readUInt32LE(28);
        if (size === 0 || start < 2) continue;
        const cl = chain(start);
        if (!anyDirty(cl)) continue;
        await fs.promises.mkdir(hostDir, { recursive: true });
        await fs.promises.writeFile(
          path.join(hostDir, safe(name)),
          readClusters(cl).subarray(0, size),
        );
        files++;
      }
    }
  };

  await fs.promises.mkdir(outDir, { recursive: true });
  await walk(rootClus, outDir);
  return files;
}
