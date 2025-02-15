import * as fs from "fs";

import { CONSTANTS } from "../constants";

/**
 * Get the size of the disk image
 *
 * @returns {number}
 */
export async function getDiskImageSize(path: string) {
  try {
    const stats = await fs.promises.stat(path);

    if (stats) {
      return stats.size;
    }
  } catch (error) {
    console.warn(`Could not determine image size`, error);
  }

  return CONSTANTS.IMAGE_DEFAULT_SIZE;
}
