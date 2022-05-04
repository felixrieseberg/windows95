import { ipcMain, app } from "electron";
import * as path from "path";

import { IPC_COMMANDS } from "../constants";

export function setupIpcListeners() {
  ipcMain.handle(IPC_COMMANDS.GET_STATE_PATH, () => {
    return path.join(app.getPath("userData"), "state-v3.bin");
  });

  ipcMain.handle(IPC_COMMANDS.APP_QUIT, () => {
    app.quit();
  });
}
