const { app, shell, Menu, BrowserWindow } = require('electron')
const defaultMenu = require('electron-default-menu')

const LINKS = {
  homepage: 'https://www.felixrieseberg.com',
  repo: 'https://github.com/felixrieseberg/windows95',
  credits: 'https://github.com/felixrieseberg/windows95/blob/master/CREDITS.md',
  help: 'https://github.com/felixrieseberg/windows95/blob/master/HELP.md'
}

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

      if (item.label === 'Help') {
        item.submenu = [
          {
            label: 'Author',
            click() {
              shell.openExternal(LINKS.homepage)
            },
          },
          {
            label: 'Learn More',
            click() {
              shell.openExternal(LINKS.repo)
            },
          },
          {
            type: 'separator'
          },
          {
            label: 'Help',
            click() {
              shell.openExternal(LINKS.help)
            }
          },
          {
            label: 'Credits',
            click() {
              shell.openExternal(LINKS.credits)
            }
          }
        ]
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
