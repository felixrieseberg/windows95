import { app } from "electron";

import { isDevMode } from "../utils/devmode";
import { setupAboutPanel } from "./about-panel";
import { shouldQuit } from "./squirrel";
import { setupUpdates } from "./update";
import { getOrCreateWindow } from "./windows";
import { setupMenu } from "./menu";

/**
 * Handle the app's "ready" event. This is essentially
 * the method that takes care of booting the application.
 */
export async function onReady() {
  if (!isDevMode()) process.env.NODE_ENV = "production";

  getOrCreateWindow();
  setupAboutPanel();
  setupMenu();
  setupUpdates();
}

/**
 * Handle the "before-quit" event
 *
 * @export
 */
export function onBeforeQuit() {
  (global as any).isQuitting = true;
}

/**
 * All windows have been closed, quit on anything but
 * macOS.
 */
export function onWindowsAllClosed() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
}

/**
 * The main method - and the first function to run
 * when Fiddle is launched.
 *
 * Exported for testing purposes.
 */
export function main() {
  // Handle creating/removing shortcuts on Windows when
  // installing/uninstalling.
  if (shouldQuit()) {
    app.quit();
    return;
  }

  // Set the app's name
  app.setName("windows95");

  // Launch
  app.on("ready", onReady);
  app.on("before-quit", onBeforeQuit);
  app.on("window-all-closed", onWindowsAllClosed);
}

main();
