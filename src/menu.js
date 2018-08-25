const { app, shell, Menu, BrowserWindow } = require('electron')
const defaultMenu = require('electron-default-menu')

function send (cmd) {
  const windows = BrowserWindow.getAllWindows()

  if (windows[0]) {
    windows[0].webContents.send(cmd)
  }
}

async function createMenu () {
  const menu = defaultMenu(app, shell)
    .map((item) => {
      if (item.label === 'View') {
        item.submenu = item.submenu.filter((subItem) => {
          return subItem.label !== 'Reload'
        })
      }

      return item
    })
    .filter((item) => {
      return item.label !== 'Edit'
    })

  menu.splice(1, 0, {
    label: 'Machine',
    submenu: [
      {
        label: 'Send Ctrl+Alt+Del',
        click: () => send('ctrlaltdel')
      },
      {
        label: 'Restart',
        click: () => send('restart')
      },
      {
        type: 'separator'
      },
      {
        label: 'Go to Disk Image',
        click: () => send('disk-image')
      }
    ]
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
}

module.exports = {
  createMenu
}
