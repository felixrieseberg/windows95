import * as fs from "fs";
import * as path from "path";

import { CONSTANTS } from "../../constants";
import { getDiskImageSize } from "../../utils/disk-image-size";
import { extractFat32 } from "./fat32-extract";

declare const V86: any;

/**
 * Reconstruct the user's old C:\ from a legacy state-vN.bin and extract any
 * file the guest ever wrote to a host folder — without booting Windows.
 *
 * v86's async-hda buffer serialises every 256-byte block the guest *wrote*
 * (libv86 xa.get_state). We spin up a throwaway v86 (autostart:false),
 * restore the legacy state to populate that block cache, then walk the
 * FAT32 tree reading each sector as overlay-if-present-else-base.
 *
 * The base supplies the partition table / BPB (which Windows only reads,
 * never writes) — see STATE_VERSION in constants.ts for the geometry
 * constraint that keeps that valid across releases.
 */
export async function recoverLegacyDisk(
  legacyStatePath: string,
  outDir: string,
): Promise<{ dir: string; files: number }> {
  const emulator = new V86({
    wasm_path: path.join(__dirname, "build/v86.wasm"),
    memory_size: 128 * 1024 * 1024,
    vga_memory_size: 64 * 1024 * 1024,
    bios: { url: path.join(__dirname, "../../bios/seabios.bin") },
    vga_bios: { url: path.join(__dirname, "../../bios/vgabios.bin") },
    hda: {
      url: CONSTANTS.IMAGE_PATH,
      async: true,
      size: await getDiskImageSize(CONSTANTS.IMAGE_PATH),
    },
    autostart: false,
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
  });

  await new Promise<void>((resolve) =>
    emulator.add_listener("emulator-loaded", resolve),
  );

  let files = 0;
  const baseFd = fs.openSync(CONSTANTS.IMAGE_PATH, "r");
  try {
    const state = fs.readFileSync(legacyStatePath);
    await emulator.restore_state(state.buffer);

    const buf = emulator.v86?.cpu?.devices?.ide?.primary?.master?.buffer as {
      block_cache: Map<number, Uint8Array>;
      block_cache_is_write: Set<number>;
    };
    if (!buf?.block_cache) {
      throw new Error("hda block cache not reachable after restore");
    }

    // v86 caches in 256-byte blocks; FAT works in 512-byte sectors.
    const sec = Buffer.allocUnsafe(512);
    const readSector = (lba: number) => {
      const lo = buf.block_cache_is_write.has(lba * 2)
        ? buf.block_cache.get(lba * 2)
        : undefined;
      const hi = buf.block_cache_is_write.has(lba * 2 + 1)
        ? buf.block_cache.get(lba * 2 + 1)
        : undefined;
      if (lo && hi) return Buffer.concat([lo, hi]);
      fs.readSync(baseFd, sec, 0, 512, lba * 512);
      if (lo) sec.set(lo, 0);
      if (hi) sec.set(hi, 256);
      return Buffer.from(sec);
    };
    const isDirty = (lba: number) =>
      buf.block_cache_is_write.has(lba * 2) ||
      buf.block_cache_is_write.has(lba * 2 + 1);

    files = await extractFat32(readSector, isDirty, outDir);
  } finally {
    fs.closeSync(baseFd);
    await emulator.destroy();
  }

  return { dir: outDir, files };
}
