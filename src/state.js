const fs = require('fs-extra')
const path = require('path')
const { remote } = require('electron')

const DEFAULT_PATH = path.join(__dirname, 'images/default-state.bin')
const STATE_PATH = path.join(remote.app.getPath('userData'), 'state.bin')

/**
 * Returns the current machine's state - either what
 * we have saved or alternatively the default state.
 *
 * @returns {ArrayBuffer}
 */
function getState () {
  const statePath = fs.existsSync(STATE_PATH)
    ? STATE_PATH
    : DEFAULT_PATH

  return fs.readFileSync(statePath).buffer
}

/**
 * Resets a saved state by simply deleting it.
 *
 * @returns {Promise<void>}
 */
async function resetState () {
  if (fs.existsSync(STATE_PATH)) {
    return fs.remove(STATE_PATH)
  }
}

/**
 * Saves the current VM's state.
 *
 * @returns {Promise<void>}
 */
async function saveState () {
  return new Promise((resolve) => {
    if (!window.emulator || !window.emulator.save_state) {
      return resolve()
    }

    window.emulator.save_state(async (error, newState) => {
      if (error) {
        console.log(error)
        return
      }

      await fs.outputFile(STATE_PATH, Buffer.from(newState))

      console.log(`Saved state to ${STATE_PATH}`)

      resolve()
    })
  })
}

/**
 * Restores the VM's state.
 */
function restoreState () {
  try {
    window.emulator.restore_state(getState())
  } catch (error) {
    console.log(`Could not read state file. Maybe none exists?`, error)
  }
}

module.exports = {
  STATE_PATH,
  saveState,
  restoreState,
  resetState,
  getState
}
