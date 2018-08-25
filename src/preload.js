const { remote, shell, ipcRenderer } = require('electron')
const path = require('path')

const { STATE_PATH, resetState, restoreState, saveState } = require('./state')

window.windows95 = {
  STATE_PATH,
  restoreState,
  resetState,
  saveState,

  showDiskImage () {
    const imagePath = path.join(__dirname, 'images/windows95.img')
      .replace('app.asar', 'app.asar.unpacked')

    shell.showItemInFolder(imagePath)
  },

  quit: () => remote.app.quit()
}

ipcRenderer.on('ctrlaltdel', () => {
  if (!window.emulator || !window.emulator.is_running) return

  window.emulator.keyboard_send_scancodes([
    0x1D, // ctrl
    0x38, // alt
    0x53, // delete

    // break codes
    0x1D | 0x80,
    0x38 | 0x80,
    0x53 | 0x80
  ])
})

ipcRenderer.on('restart', () => {
  if (!window.emulator || !window.emulator.is_running) return

  window.emulator.restart()
})

ipcRenderer.on('disk-image', () => {
  windows95.showDiskImage()
})
