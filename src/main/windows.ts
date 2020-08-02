import { BrowserWindow } from "electron";

let mainWindow: BrowserWindow | null = null;

export function getOrCreateWindow(): BrowserWindow {
  if (mainWindow) return mainWindow;

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true,
      sandbox: false,
      webviewTag: false,
    },
  });

  mainWindow.loadFile("./dist/static/index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}
