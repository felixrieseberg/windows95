const { remote } = require('electron')
const fs = require('fs-extra')

const { STATE_PATH, getState } = require('./state')

window.windows95 = {
  STATE_PATH,

  async saveState () {
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
  },

  async restoreState () {
    try {
      window.emulator.restore_state(getState())
    } catch (error) {
      console.log(`Could not read state file. Maybe none exists?`, error)
    }
  },

  quit () {
    remote.app.quit()
  }
}
