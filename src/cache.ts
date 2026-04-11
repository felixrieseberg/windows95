import { session } from "electron";

export async function clearCaches() {
  await clearCache();
  await clearStorageData();
}

export async function clearCache() {
  if (session.defaultSession) {
    await session.defaultSession.clearCache();
  }
}

export async function clearStorageData() {
  if (!session.defaultSession) {
    return;
  }

  await session.defaultSession.clearStorageData({
    storages: [
      "cookies",
      "filesystem",
      "indexdb",
      "localstorage",
      "shadercache",
      "websql",
      "serviceworkers",
    ],
    quotas: ["temporary"],
  });
}
