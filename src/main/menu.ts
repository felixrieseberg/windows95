import { app, shell, Menu, BrowserWindow, ipcMain } from "electron";

import { clearCaches } from "../cache";
import { IPC_COMMANDS } from "../constants";
import { isDevMode } from "../utils/devmode";

const LINKS = {
  homepage: "https://www.twitter.com/felixrieseberg",
  repo: "https://github.com/felixrieseberg/windows95",
  credits: "https://github.com/felixrieseberg/windows95/blob/master/CREDITS.md",
  help: "https://github.com/felixrieseberg/windows95/blob/master/HELP.md",
};

export async function setupMenu() {
  await createMenu();

  ipcMain.on(IPC_COMMANDS.MACHINE_STARTED, () =>
    createMenu({ isRunning: true })
  );
  ipcMain.on(IPC_COMMANDS.MACHINE_STOPPED, () =>
    createMenu({ isRunning: false })
  );
}

function send(cmd: string) {
  const windows = BrowserWindow.getAllWindows();

  if (windows[0]) {
    console.log(`Sending "${cmd}"`);
    windows[0].webContents.send(cmd);
  } else {
    console.log(`Tried to send "${cmd}", but could not find window`);
  }
}

async function createMenu({ isRunning } = { isRunning: false }) {
  const template: Array<Electron.MenuItemConstructorOptions> = [
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Full Screen",
          accelerator: (function () {
            if (process.platform === "darwin") {
              return "Ctrl+Command+F";
            } else {
              return "F11";
            }
          })(),
          click: function (_item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
            }
          },
        },
        {
          label: "Toggle Developer Tools",
          accelerator: (function () {
            if (process.platform === "darwin") {
              return "Alt+Command+I";
            } else {
              return "Ctrl+Shift+I";
            }
          })(),
          click: function (_item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools();
            }
          },
        },
        {
          type: "separator",
        },
        {
          label: "Toggle Emulator Info",
          click: () => send(IPC_COMMANDS.TOGGLE_INFO),
        },
        {
          type: "separator",
        },
        {
          role: "reload",
        },
      ],
    },
    {
      role: "editMenu",
      visible: isDevMode(),
    },
    {
      label: "Window",
      role: "window",
      submenu: [
        {
          label: "Minimize",
          accelerator: "CmdOrCtrl+M",
          role: "minimize",
        },
        {
          label: "Close",
          accelerator: "CmdOrCtrl+W",
          role: "close",
        },
        {
          type: "separator",
        },
        {
          label: "Zoom in",
          click: () => send(IPC_COMMANDS.ZOOM_IN),
          enabled: isRunning,
        },
        {
          label: "Zoom out",
          click: () => send(IPC_COMMANDS.ZOOM_OUT),
          enabled: isRunning,
        },
        {
          label: "Reset zoom",
          click: () => send(IPC_COMMANDS.ZOOM_RESET),
          enabled: isRunning,
        },
      ],
    },
    {
      label: "Machine",
      submenu: [
        {
          label: "Send Ctrl+Alt+Del",
          click: () => send(IPC_COMMANDS.MACHINE_CTRL_ALT_DEL),
          enabled: isRunning,
        },
        {
          label: "Send Alt+F4",
          click: () => send(IPC_COMMANDS.MACHINE_ALT_F4),
          enabled: isRunning,
        },
        {
          label: "Send Alt+Enter",
          click: () => send(IPC_COMMANDS.MACHINE_ALT_ENTER),
          enabled: isRunning,
        },
        {
          label: "Send Esc",
          click: () => send(IPC_COMMANDS.MACHINE_ESC),
          enabled: isRunning,
        },
        {
          type: "separator",
        },
        isRunning
          ? {
              label: "Stop",
              click: () => send(IPC_COMMANDS.MACHINE_STOP),
            }
          : {
              label: "Start",
              click: () => send(IPC_COMMANDS.MACHINE_START),
            },
        {
          label: "Restart",
          click: () => send(IPC_COMMANDS.MACHINE_RESTART),
          enabled: isRunning,
        },
        {
          label: "Reset",
          click: () => send(IPC_COMMANDS.MACHINE_RESET),
          enabled: isRunning,
        },
        {
          type: "separator",
        },
        {
          label: "Go to Disk Image",
          click: () => send(IPC_COMMANDS.SHOW_DISK_IMAGE),
        },
      ],
    },
    {
      label: "Help",
      role: "help",
      submenu: [
        {
          label: "Author",
          click: () => shell.openExternal(LINKS.homepage),
        },
        {
          label: "windows95 on GitHub",
          click: () => shell.openExternal(LINKS.repo),
        },
        {
          label: "Help",
          click: () => shell.openExternal(LINKS.help),
        },
        {
          type: "separator",
        },
        {
          label: "Troubleshooting",
          submenu: [
            {
              label: "Clear Cache and Restart",
              async click() {
                await clearCaches();

                app.relaunch();
                app.quit();
              },
            },
          ],
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: "windows95",
      submenu: [
        {
          role: "about",
        },
        {
          type: "separator",
        },
        {
          role: "services",
        },
        {
          type: "separator",
        },
        {
          label: "Hide windows95",
          accelerator: "Command+H",
          role: "hide",
        },
        {
          label: "Hide Others",
          accelerator: "Command+Shift+H",
          role: "hideothers",
        },
        {
          role: "unhide",
        },
        {
          type: "separator",
        },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click() {
            app.quit();
          },
        },
      ],
    } as any);
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template as any));
}
