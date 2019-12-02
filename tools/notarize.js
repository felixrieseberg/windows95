const { notarize } = require('electron-notarize');
const path = require('path');

const buildOutput = path.resolve(
  __dirname,
  '..',
  'out',
  'windows95-darwin-x64',
  'windows95.app'
);

module.exports = function () {
  if (process.platform !== 'darwin') {
    console.log('Not a Mac; skipping notarization');
    return;
  }

  console.log('Notarizing...');

  return notarize({
    appBundleId: 'com.felixrieseberg.windows95',
    appPath: buildOutput,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    ascProvider: 'LT94ZKYDCJ'
  }).catch((e) => {
    console.error(e);
    throw e;
  });
}
