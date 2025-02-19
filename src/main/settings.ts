import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface Settings {
  isFileServerEnabled: boolean;
  isFileServerShowingHiddenFiles: boolean;
  isFileServerShowingSystemHiddenFiles: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  isFileServerEnabled: true,
  isFileServerShowingHiddenFiles: false,
  isFileServerShowingSystemHiddenFiles: false,
};

class SettingsManager {
  private filePath: string;
  private data: Settings;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'settings.json');
    this.data = this.load();
  }

  private load(): Settings {
    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(fileContent);

        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }

    return DEFAULT_SETTINGS;
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  get(key: keyof Settings): any {
    return this.data[key];
  }

  set(key: keyof Settings, value: any): void {
    this.data[key] = value;
    this.save();
  }

  delete(key: keyof Settings): void {
    delete this.data[key];
    this.save();
  }

  clear(): void {
    this.data = DEFAULT_SETTINGS;
    this.save();
  }
}

export const settings = new SettingsManager();
