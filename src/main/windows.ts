import { BrowserWindow } from "electron";

let mainWindow;

export function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true
    }
  });

  mainWindow.loadFile("./dist/static/index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
