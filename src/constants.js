const { remote, app } = require('electron')
const path = require('path')

const _app = app || remote.app

const CONSTANTS = {
  IMAGE_PATH: path.join(__dirname, 'images/windows95.img'),
  IMAGE_DEFAULT_SIZE: 1073741824, // 1GB
  STATE_PATH: path.join(_app.getPath('userData'), 'state.bin')
}

const IPC_COMMANDS = {
  TOGGLE_INFO: 'TOGGLE_INFO',
  MACHINE_RESTART: 'MACHINE_RESTART',
  MACHINE_CTRL_ALT_DEL: 'MACHINE_CTRL_ALT_DEL',
  SHOW_DISK_IMAGE: 'SHOW_DISK_IMAGE'
}

module.exports = {
  CONSTANTS,
  IPC_COMMANDS
}
