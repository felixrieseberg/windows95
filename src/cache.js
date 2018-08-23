const { session } = require('electron')

const clearCaches = async () => {
  await clearCache()
  await clearStorageData()
}

const clearCache = () => {
  return new Promise((resolve) => {
    session.defaultSession.clearCache(resolve)
  })
}

const clearStorageData = () => {
  return new Promise((resolve) => {
    session.defaultSession.clearStorageData({
      storages: 'appcache, cookies, filesystem, indexdb, localstorage, shadercache, websql, serviceworkers',
      quotas: 'temporary, persistent, syncable'
    }, resolve)
  })
}

module.exports = {
  clearCaches
}
