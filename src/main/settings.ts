import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export interface Settings {
  smbSharePath: string;
}

const DEFAULT_SETTINGS: Settings = {
  smbSharePath: app.getPath("downloads"),
};

class SettingsManager {
  private filePath: string;
  private data: Settings;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "settings.json");
    this.data = this.load();
  }

  private load(): Settings {
    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(fileContent);

        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }

    return DEFAULT_SETTINGS;
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  }

  get(key: keyof Settings): any {
    return this.data[key];
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data[key] = value;
    this.save();
  }

  clear(): void {
    this.data = DEFAULT_SETTINGS;
    this.save();
  }
}

export const settings = new SettingsManager();
