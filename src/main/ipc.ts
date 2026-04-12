import { ipcMain, app, dialog, BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs";

import { IPC_COMMANDS, STATE_VERSION } from "../constants";
import { settings } from "./settings";

const statePathFor = (v: number) =>
  path.join(app.getPath("userData"), `state-v${v}.bin`);

export function setupIpcListeners() {
  ipcMain.handle(IPC_COMMANDS.GET_STATE_PATH, () => {
    return statePathFor(STATE_VERSION);
  });

  ipcMain.handle(IPC_COMMANDS.GET_LEGACY_STATE_PATH, () => {
    // If the user already has a current-version state, there's nothing to
    // rescue — either they've migrated or never had an older one.
    if (fs.existsSync(statePathFor(STATE_VERSION))) return null;
    // v2/v3 predate the overlay-rescue machinery and aren't worth supporting.
    for (let v = STATE_VERSION - 1; v >= 4; v--) {
      const p = statePathFor(v);
      if (fs.existsSync(p)) return p;
    }
    return null;
  });

  ipcMain.handle(IPC_COMMANDS.GET_DOWNLOADS_PATH, () => {
    return app.getPath("downloads");
  });

  ipcMain.handle(IPC_COMMANDS.APP_QUIT, () => {
    app.quit();
  });

  ipcMain.handle(IPC_COMMANDS.GET_SMB_SHARE_PATH, () => {
    return settings.get("smbSharePath");
  });

  ipcMain.handle(IPC_COMMANDS.SET_SMB_SHARE_PATH, (_e, p: unknown) => {
    // The only legitimate caller is the folder picker, which can't return
    // a non-existent path — but the renderer has nodeIntegration so any
    // code there can call this IPC. Reject anything that isn't an existing
    // directory; otherwise SmbSession's realpathSync throws inside a TCP
    // callback on next launch and the share silently never connects.
    if (typeof p !== "string") return false;
    let real: string;
    try {
      real = fs.realpathSync(p);
      if (!fs.statSync(real).isDirectory()) return false;
    } catch {
      return false;
    }
    settings.set("smbSharePath", real);
    return true;
  });

  ipcMain.handle(IPC_COMMANDS.PICK_FOLDER, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
