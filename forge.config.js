const path = require('path');
const package = require('./package.json');

module.exports = {
  hooks: {
    generateAssets: require('./tools/generateAssets')
  },
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'assets', 'icon'),
    appBundleId: 'com.felixrieseberg.windows98',
    appCategoryType: 'public.app-category.developer-tools',
    win32metadata: {
      CompanyName: 'Felix Rieseberg',
      OriginalFilename: 'windows98',
    },
    osxSign: {
      identity: 'Developer ID Application: Felix Rieseberg (LT94ZKYDCJ)'
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'windows98',
        authors: 'Felix Rieseberg',
        exe: 'windows98.exe',
        noMsi: true,
        remoteReleases: '',
        setupExe: `windows98-${package.version}-setup-${process.arch}.exe`,
        setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'),
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux']
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux']
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'electron',
          name: 'fiddle'
        },
        prerelease: true
      }
    }
  ]
};