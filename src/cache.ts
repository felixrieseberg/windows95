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

export function clearStorageData() {
  return new Promise((resolve) => {
    if (!session.defaultSession) {
      return resolve();
    }

    session.defaultSession.clearStorageData(
      {
        storages: [
          "appcache",
          "cookies",
          "filesystem",
          "indexdb",
          "localstorage",
          "shadercache",
          "websql",
          "serviceworkers",
        ],
        quotas: ["temporary", "persistent", "syncable"],
      },
      resolve
    );
  });
}
