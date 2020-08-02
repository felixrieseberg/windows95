const path = require('path');
const fs = require('fs');
const package = require('./package.json');

if (process.env['WINDOWS_CODESIGN_FILE']) {
  const certPath = path.join(__dirname, 'win-certificate.pfx');
  const certExists = fs.existsSync(certPath);

  if (certExists) {
    process.env['WINDOWS_CODESIGN_FILE'] = certPath;
  }
}

module.exports = {
  hooks: {
    generateAssets: require('./tools/generateAssets'),
  },
  packagerConfig: {
    asar: false,
    icon: path.resolve(__dirname, 'assets', 'icon'),
    appBundleId: 'com.felixrieseberg.windows95',
    appCategoryType: 'public.app-category.developer-tools',
    win32metadata: {
      CompanyName: 'Felix Rieseberg',
      OriginalFilename: 'windows95'
    },
    osxSign: {
      identity: 'Developer ID Application: Felix Rieseberg (LT94ZKYDCJ)',
      'hardened-runtime': true,
      'gatekeeper-assess': false,
      'entitlements': 'assets/entitlements.plist',
      'entitlements-inherit': 'assets/entitlements.plist',
      'signature-flags': 'library'
    },
    osxNotarize: {
      appBundleId: 'com.felixrieseberg.macintoshjs',
      appleId: process.env['APPLE_ID'],
      appleIdPassword: process.env['APPLE_ID_PASSWORD'],
      ascProvider: 'LT94ZKYDCJ'
    },
    ignore: [
      /\/assets(\/?)/,
      /\/docs(\/?)/,
      /\/tools(\/?)/,
      /\/src\/.*\.ts/,
      /package-lock\.json/,
      /README\.md/,
      /tsconfig\.json/,
      /Dockerfile/,
      /issue_template\.md/,
      /HELP\.md/,
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (arch) => {
        return {
          name: 'windows95',
          authors: 'Felix Rieseberg',
          exe: 'windows95.exe',
          noMsi: true,
          remoteReleases: '',
          setupExe: `windows95-${package.version}-setup-${arch}.exe`,
          setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'),
          certificateFile: process.env['WINDOWS_CODESIGN_FILE'],
          certificatePassword: process.env['WINDOWS_CODESIGN_PASSWORD'],
        }
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux']
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux']
    }
  ]
};
