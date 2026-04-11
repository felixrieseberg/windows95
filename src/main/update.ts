import { app } from "electron";

export function setupUpdates() {
  if (app.isPackaged) {
    const { updateElectronApp } = require("update-electron-app");
    updateElectronApp({
      repo: "felixrieseberg/windows95",
      updateInterval: "1 hour",
    });
  }
}
