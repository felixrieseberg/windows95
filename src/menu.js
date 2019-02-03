const { app, shell, Menu, BrowserWindow } = require('electron')

const { clearCaches } = require('./cache')
const { IPC_COMMANDS } = require('./constants')

const LINKS = {
  homepage: 'https://www.twitter.com/felixrieseberg',
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
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: (function () {
            if (process.platform === 'darwin') { return 'Ctrl+Command+F' } else { return 'F11' }
          })(),
          click: function (_item, focusedWindow) {
            if (focusedWindow) { focusedWindow.setFullScreen(!focusedWindow.isFullScreen()) }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: (function () {
            if (process.platform === 'darwin') { return 'Alt+Command+I' } else { return 'Ctrl+Shift+I' }
          })(),
          click: function (_item, focusedWindow) {
            if (focusedWindow) { focusedWindow.toggleDevTools() }
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Toggle Emulator Info',
          click: () => send(IPC_COMMANDS.TOGGLE_INFO)
        }
      ]
    },
    {
      label: 'Window',
      role: 'window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Machine',
      submenu: [
        {
          label: 'Send Ctrl+Alt+Del',
          click: () => send(IPC_COMMANDS.MACHINE_CTRL_ALT_DEL)
        },
        {
          label: 'Restart',
          click: () => send(IPC_COMMANDS.MACHINE_RESTART)
        },
        {
          label: 'Reset',
          click: () => send(IPC_COMMANDS.MACHINE_RESET)
        },
        {
          type: 'separator'
        },
        {
          label: 'Go to Disk Image',
          click: () => send(IPC_COMMANDS.SHOW_DISK_IMAGE)
        }
      ]
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        {
          label: 'Author',
          click: () => shell.openExternal(LINKS.homepage)
        },
        {
          label: 'windows95 on GitHub',
          click: () => shell.openExternal(LINKS.repo)
        },
        {
          label: 'Help',
          click: () => shell.openExternal(LINKS.help)
        },
        {
          type: 'separator'
        },
        {
          label: 'Troubleshooting',
          submenu: [
            {
              label: 'Clear Cache and Restart',
              async click () {
                await clearCaches()

                app.relaunch()
                app.quit()
              }
            }
          ]
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'windows95',
      submenu: [
        {
          label: 'About windows95',
          role: 'about'
        },
        {
          type: 'separator'
        },
        {
          label: 'Services',
          role: 'services',
          submenu: []
        },
        {
          type: 'separator'
        },
        {
          label: 'Hide windows95',
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        {
          type: 'separator'
        },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click () {
            app.quit()
          }
        }
      ]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

module.exports = {
  createMenu
}
