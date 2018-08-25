const { remote } = require('electron')
const fs = require('fs-extra')

const { STATE_PATH, resetState, restoreState, saveState } = require('./state')

window.windows95 = {
  STATE_PATH,
  restoreState,
  resetState,
  saveState,

  quit: () => remote.app.quit()
}
