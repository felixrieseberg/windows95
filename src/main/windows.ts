import { BrowserWindow, shell } from "electron";
import { execFileSync } from "child_process";

import { isDevMode } from "../utils/devmode";

let mainWindow: BrowserWindow | null = null;

function getDevBranchSuffix(): string {
  if (!isDevMode()) return "";

  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();

    if (branch && branch !== "master" && branch !== "main") {
      return ` (${branch})`;
    }
  } catch {
    // git not available or not a repo — ignore
  }

  return "";
}

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

  const branchSuffix = getDevBranchSuffix();
  if (branchSuffix) {
    mainWindow.on("page-title-updated", (event, title) => {
      event.preventDefault();
      mainWindow?.setTitle(`${title}${branchSuffix}`);
    });
  }

  mainWindow.loadFile("./dist/static/index.html");

  mainWindow.webContents.on("will-navigate", (event, url) =>
    handleNavigation(event, url),
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
