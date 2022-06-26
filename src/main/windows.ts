import { BrowserWindow, shell } from "electron";

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
      contextIsolation: false,
    },
  });

  // mainWindow.webContents.toggleDevTools();
  mainWindow.loadFile("./dist/static/index.html");

  mainWindow.webContents.on("will-navigate", (event, url) =>
    handleNavigation(event, url)
  );
  mainWindow.webContents.on("new-window", (event, url) =>
    handleNavigation(event, url)
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function handleNavigation(event: Electron.Event, url: string) {
  if (url.startsWith("http")) {
    event.preventDefault();
    shell.openExternal(url);
  }
}
