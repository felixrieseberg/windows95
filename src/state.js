const fs = require('fs-extra')
const path = require('path')
const { remote } = require('electron')

const DEFAULT_PATH = path.join(__dirname, 'renderer/images/default-state.bin')
const STATE_PATH = path.join(remote.app.getPath('userData'), 'state.bin')

function getState () {
  const statePath = fs.existsSync(STATE_PATH)
    ? STATE_PATH
    : DEFAULT_PATH

  return fs.readFileSync(statePath).buffer
}

function resetState () {
  fs.removeSync(STATE_PATH)
}

module.exports = {
  STATE_PATH,
  resetState,
  getState
}
