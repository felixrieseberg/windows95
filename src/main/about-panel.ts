import { AboutPanelOptionsOptions, app } from "electron";

/**
 * Sets Fiddle's About panel options on Linux and macOS
 *
 * @returns
 */
export function setupAboutPanel(): void {
  if (process.platform === "win32") return;

  const options: AboutPanelOptionsOptions = {
    applicationName: "windows95",
    applicationVersion: app.getVersion(),
    version: process.versions.electron,
    copyright: "Felix Rieseberg",
  };

  switch (process.platform) {
    case "linux":
      options.website = "https://github.com/felixrieseberg/windows95";
    case "darwin":
      options.credits = "https://github.com/felixrieseberg/windows95";
    default:
    // fallthrough
  }

  app.setAboutPanelOptions(options);
}
