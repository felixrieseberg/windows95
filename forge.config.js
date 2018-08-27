const path = require('path');
const package = require('./package.json');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/images/*.img'
    },
    icon: path.resolve(__dirname, 'assets', 'icon'),
    appBundleId: 'com.felixrieseberg.windows95',
    appCategoryType: 'public.app-category.developer-tools',
    win32metadata: {
      CompanyName: 'Felix Rieseberg',
      OriginalFilename: 'windows95',
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
        name: 'windows95',
        authors: 'Felix Rieseberg',
        exe: 'windows95.exe',
        noMsi: true,
        remoteReleases: '',
        setupExe: `windows95-${package.version}-setup-${process.arch}.exe`,
        setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'),
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD
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
    },
    {
      name: '@electron-forge/maker-flatpak',
      platforms: ['linux']
    }
  ]
};
