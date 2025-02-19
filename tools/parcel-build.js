/* tslint:disable */

const Bundler = require('parcel-bundler')
const path = require('path')
const fs = require('fs')

async function copyLib() {
  const target = path.join(__dirname, '../dist/static')
  const lib = path.join(__dirname, '../src/renderer/lib')
  const index = path.join(target, 'index.html')

  // Copy in lib
  await fs.promises.cp(lib, target, { recursive: true });

  // Patch so that fs.read is used
  const libv86path = path.join(target, 'libv86.js')
  const libv86 = fs.readFileSync(libv86path, 'utf-8')

  let patchedLibv86 = libv86.replace('k.load_file="undefined"===typeof XMLHttpRequest?pa:qa', 'k.load_file=pa')
  patchedLibv86 = patchedLibv86.replace('H.exportSymbol=function(a,b){"undefined"!==typeof module&&"undefined"!==typeof module.exports?module.exports[a]=b:"undefined"!==typeof window?window[a]=b:"function"===typeof importScripts&&(self[a]=b)}', 'H.exportSymbol=function(a,b){"undefined"!==typeof window?window[a]=b:"undefined"!==typeof module&&"undefined"!==typeof module.exports?module.exports[a]=b:"function"===typeof importScripts&&(self[a]=b)}')
  patchedLibv86 = patchedLibv86.replace('this.fetch=fetch;', 'this.fetch=(...args)=>fetch(...args);')

  fs.writeFileSync(libv86path, patchedLibv86)

  // Overwrite
  const indexContents = fs.readFileSync(index, 'utf-8');
  const replacedContents = indexContents.replace('<!-- libv86 -->', '<script src="libv86.js"></script>')
  fs.writeFileSync(index, replacedContents)
}

async function compileParcel (options = {}) {
  const entryFiles = [
    path.join(__dirname, '../static/index.html'),
    path.join(__dirname, '../src/main/main.ts')
  ]

  const bundlerOptions = {
    outDir: './dist', // The out directory to put the build files in, defaults to dist
    outFile: undefined, // The name of the outputFile
    publicUrl: '../', // The url to server on, defaults to dist
    watch: false, // whether to watch the files and rebuild them on change, defaults to process.env.NODE_ENV !== 'production'
    cache: false, // Enabled or disables caching, defaults to true
    cacheDir: '.cache', // The directory cache gets put in, defaults to .cache
    contentHash: false, // Disable content hash from being included on the filename
    minify: false, // Minify files, enabled if process.env.NODE_ENV === 'production'
    scopeHoist: false, // turn on experimental scope hoisting/tree shaking flag, for smaller production bundles
    target: 'electron', // browser/node/electron, defaults to browser
    // https: { // Define a custom {key, cert} pair, use true to generate one or false to use http
    //   cert: './ssl/c.crt', // path to custom certificate
    //   key: './ssl/k.key' // path to custom key
    // },
    logLevel: 3, // 3 = log everything, 2 = log warnings & errors, 1 = log errors
    hmr: false, // Enable or disable HMR while watching
    hmrPort: 0, // The port the HMR socket runs on, defaults to a random free port (0 in node.js resolves to a random free port)
    sourceMaps: true, // Enable or disable sourcemaps, defaults to enabled (minified builds currently always create sourcemaps)
    hmrHostname: '', // A hostname for hot module reload, default to ''
    detailedReport: false, // Prints a detailed report of the bundles, assets, filesizes and times, defaults to false, reports are only printed if watch is disabled,
    ...options
  }

  const bundler = new Bundler(entryFiles, bundlerOptions)

  // Run the bundler, this returns the main bundle
  // Use the events if you're using watch mode as this promise will only trigger once and not for every rebuild
  await bundler.bundle()

  await copyLib();
}

module.exports = {
  compileParcel
}

if (require.main === module) compileParcel()
