export interface InfoBarSettings {
  showCpu: boolean;
  showDisk: boolean;
  showNet: boolean;
  showSparklines: boolean;
}

export const DEFAULT_INFO_BAR_SETTINGS: InfoBarSettings = {
  showCpu: true,
  showDisk: true,
  showNet: true,
  showSparklines: true,
};

const KEY = "infoBarSettings";

export function loadInfoBarSettings(): InfoBarSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_INFO_BAR_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_INFO_BAR_SETTINGS };
}

export function saveInfoBarSettings(s: InfoBarSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
