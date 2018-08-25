const { app, BrowserWindow } = require('electron')
const path = require('path')

const { clearCaches } = require('./cache')
const { createMenu } = require('./menu')
const { setupProtocol } = require('./es6')

if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit()
}

if (app.isPackaged) {
  require('update-electron-app')({
    repo: 'felixrieseberg/windows95',
    updateInterval: '1 hour'
  })
}

let mainWindow

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadURL(`file://${__dirname}/renderer/index.html`)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('ready', async () => {
  await setupProtocol()
  await createMenu()
  await clearCaches()

  createWindow()
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
