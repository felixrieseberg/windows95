const { remote, shell, ipcRenderer } = require('electron')
const path = require('path')
const EventEmitter = require('events')

const { resetState, restoreState, saveState } = require('./state')
const { getDiskImageSize } = require('./utils/disk-image-size')
const { IPC_COMMANDS, CONSTANTS } = require('./constants')

class Windows95 extends EventEmitter {
  constructor () {
    super()

    // Constants
    this.CONSTANTS = CONSTANTS
    this.IPC_COMMANDS = IPC_COMMANDS

    // Methods
    this.getDiskImageSize = getDiskImageSize
    this.restoreState = restoreState
    this.resetState = resetState
    this.saveState = saveState

    Object.keys(IPC_COMMANDS).forEach((command) => {
      ipcRenderer.on(command, (...args) => {
        this.emit(command, args)
      })
    })
  }

  showDiskImage () {
    const imagePath = path.join(__dirname, 'images/windows95.img')
      .replace('app.asar', 'app.asar.unpacked')

    shell.showItemInFolder(imagePath)
  }

  quit () {
    remote.app.quit()
  }
}

window.windows95 = new Windows95()
