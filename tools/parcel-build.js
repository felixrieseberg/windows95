/* tslint:disable */

const Bundler = require('parcel-bundler')
const path = require('path')
const fs = require('fs')

// libv86 checks `typeof module.exports` before `typeof window` when deciding
// where to export V86. In an Electron renderer with nodeIntegration both exist,
// so it ends up on module.exports instead of window. This shim copies it over.
const LIBV86_SHIM = `<script src="libv86.js"></script>
<script>if (typeof module !== "undefined" && module.exports && module.exports.V86) window.V86 = module.exports.V86;</script>`

// v86's node-path file loader used `await import("node:...")` until d4c5fa86
// switched it to require(). Dynamic import of node: URLs doesn't work in an
// Electron renderer — only require() does. The literals are stable across
// Closure builds; if they're absent the build is post-d4c5fa86 and already
// uses require, so a no-op is correct.
const V86_NODE_IMPORTS = [
  ['await import("node:fs/promises")', 'require("fs").promises'],
  ['await import("node:"+"fs/promises")', 'require("fs").promises'],
  ['await import("node:crypto")', 'require("crypto")'],
];

async function copyLib() {
  const target = path.join(__dirname, '../dist/static')
  const lib = path.join(__dirname, '../src/renderer/lib')
  const index = path.join(target, 'index.html')

  await fs.promises.cp(lib, target, { recursive: true });

  const libv86path = path.join(target, 'libv86.js')
  let libv86 = fs.readFileSync(libv86path, 'utf-8')
  let patchCount = 0;
  for (const [from, to] of V86_NODE_IMPORTS) {
    const next = libv86.split(from).join(to);
    if (next !== libv86) { patchCount++; libv86 = next; }
  }
  if (patchCount > 0) {
    fs.writeFileSync(libv86path, libv86)
    console.log(`libv86: ${patchCount} dynamic-import → require`)
  }

  const indexContents = fs.readFileSync(index, 'utf-8');
  const replacedContents = indexContents.replace('<!-- libv86 -->', LIBV86_SHIM)
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
    sourceMaps: false, // Enable or disable sourcemaps, defaults to enabled (minified builds currently always create sourcemaps)
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
