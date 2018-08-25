const { remote, shell } = require('electron')
const path = require('path')

const { STATE_PATH, resetState, restoreState, saveState } = require('./state')

window.windows95 = {
  STATE_PATH,
  restoreState,
  resetState,
  saveState,

  showDiskImage() {
    const imagePath = path.join(__dirname, 'images/windows95.img')
      .replace('app.asar', 'app.asar.unpacked')

    shell.showItemInFolder(imagePath)
  },

  quit: () => remote.app.quit()
}
