const { app, BrowserWindow, session } = require('electron')
const path = require('path')

const { clearCaches } = require('./cache')
const { createMenu } = require('./menu')

if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit()
}

let mainWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    nodeIntegration: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(`file://${__dirname}/renderer/index.html?system=win98`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  })
}

app.on('ready', async () => {
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
