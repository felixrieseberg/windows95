const { app, shell, Menu } = require('electron')
const defaultMenu = require('electron-default-menu')

async function createMenu() {
  const menu = defaultMenu(app, shell);

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}

module.exports = {
  createMenu
}
