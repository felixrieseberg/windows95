const fs = require('fs-extra')

const { CONSTANTS } = require('../constants')

/**
 * Get the size of the disk image
 *
 * @returns {number}
 */
async function getDiskImageSize () {
  try {
    const stats = await fs.stat(CONSTANTS.IMAGE_PATH)

    if (stats) {
      return stats.size
    }
  } catch (error) {
    console.warn(`Could not determine image size`, error)
  }

  return CONSTANTS.IMAGE_DEFAULT_SIZE
}

module.exports = {
  getDiskImageSize
}
