const path = require('path');
const fs = require('fs');
const package = require('./package.json');

require('dotenv').config()

process.env.TEMP = process.env.TMP = `C:\\Users\\FelixRieseberg\\AppData\\Local\\Temp`

const FLAGS = {
  SIGNTOOL_PATH: process.env.SIGNTOOL_PATH,
  AZURE_CODE_SIGNING_DLIB: process.env.AZURE_CODE_SIGNING_DLIB || path.resolve(__dirname, 'Microsoft.Trusted.Signing.Client.1.0.60', 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll'),
  AZURE_METADATA_JSON: process.env.AZURE_METADATA_JSON || path.resolve(__dirname, 'trusted-signing-metadata.json'),
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
}

fs.writeFileSync(FLAGS.AZURE_METADATA_JSON, JSON.stringify({
  Endpoint: process.env.AZURE_CODE_SIGNING_ENDPOINT || "https://wcus.codesigning.azure.net",
  CodeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME,
  CertificateProfileName: process.env.AZURE_CODE_SIGNING_CERTIFICATE_PROFILE_NAME,
}, null, 2));

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
    },
    osxNotarize: {
      appleId: process.env['APPLE_ID'],
      appleIdPassword: process.env['APPLE_ID_PASSWORD'],
      teamId: 'LT94ZKYDCJ'
    },
    windowsSign: {
      signToolPath: FLAGS.SIGNTOOL_PATH,
      signWithParams: `/v /dlib ${process.env.AZURE_CODE_SIGNING_DLIB} /dmdf ${FLAGS.AZURE_METADATA_JSON}`,
      timestampServer: "http://timestamp.acs.microsoft.com",
      hashes: ["sha256"],
    },
    ignore: [
      /\/assets(\/?)/,
      /\/docs(\/?)/,
      /\/tools(\/?)/,
      /\/src\/.*\.ts/,
      /\/test(\/?)/,
      /\/@types(\/?)/,
      /\/helper-images(\/?)/,
      /package-lock\.json/,
      /README\.md/,
      /tsconfig\.json/,
      /Dockerfile/,
      /issue_template\.md/,
      /HELP\.md/,
      /forge\.config\.js/,
      /\.github(\/?)/,
      /\.circleci(\/?)/,
      /\.vscode(\/?)/,
      /\.gitignore/,
      /\.gitattributes/,
      /\.eslintignore/,
      /\.eslintrc/,
      /\.prettierrc/,
      /\/Microsoft\.Trusted\.Signing\.Client.*/,
      /\/trusted-signing-metadata/,
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
          iconUrl: 'https://raw.githubusercontent.com/felixrieseberg/windows95/master/assets/icon.ico',
          loadingGif: './assets/boot.gif',
          setupExe: `windows95-${package.version}-setup-${arch}.exe`,
          setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'),
          windowsSign: {
            signToolPath: FLAGS.SIGNTOOL_PATH,
            signWithParams: `/v /dlib ${process.env.AZURE_CODE_SIGNING_DLIB} /dmdf ${FLAGS.AZURE_METADATA_JSON}`,
            timestampServer: "http://timestamp.acs.microsoft.com",
            hashes: ["sha256"],
          }
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
