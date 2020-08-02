import { app } from "electron";

export function setupUpdates() {
  if (app.isPackaged) {
    require("update-electron-app")({
      repo: "felixrieseberg/windows95",
      updateInterval: "1 hour",
    });
  }
}
