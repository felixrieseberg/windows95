const fs = require('fs-extra')

const { CONSTANTS } = require('./constants')

/**
 * Returns the current machine's state - either what
 * we have saved or alternatively the default state.
 *
 * @returns {ArrayBuffer}
 */
function getState () {
  const statePath = fs.existsSync(CONSTANTS.STATE_PATH)
    ? CONSTANTS.STATE_PATH
    : CONSTANTS.DEFAULT_STATE_PATH

  if (fs.existsSync(statePath)) {
    return fs.readFileSync(statePath).buffer
  }
}

/**
 * Resets a saved state by simply deleting it.
 *
 * @returns {Promise<void>}
 */
async function resetState () {
  if (fs.existsSync(CONSTANTS.STATE_PATH)) {
    return fs.remove(CONSTANTS.STATE_PATH)
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
        console.warn(`State: Could not save state`, error)
        return
      }

      await fs.outputFile(CONSTANTS.STATE_PATH, Buffer.from(newState))

      console.log(`State: Saved state to ${CONSTANTS.STATE_PATH}`)

      resolve()
    })
  })
}

/**
 * Restores the VM's state.
 */
function restoreState () {
  const state = getState()

  // Nothing to do with if we don't have a state
  if (!state) {
    console.log(`State: No state present, not restoring.`)
  }

  try {
    window.emulator.restore_state(state)
  } catch (error) {
    console.log(`State: Could not read state file. Maybe none exists?`, error)
  }
}

module.exports = {
  saveState,
  restoreState,
  resetState,
  getState
}
