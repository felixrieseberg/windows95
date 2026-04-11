/* tslint:disable */

const Bundler = require('parcel-bundler')
const path = require('path')
const fs = require('fs')

// libv86 checks `typeof module.exports` before `typeof window` when deciding
// where to export V86. In an Electron renderer with nodeIntegration both exist,
// so it ends up on module.exports instead of window. This shim copies it over.
const LIBV86_SHIM = `<script src="libv86.js"></script>
<script>if (typeof module !== "undefined" && module.exports && module.exports.V86) window.V86 = module.exports.V86;</script>`

// v86's node-path file loader uses `await import("node:fs/promises")`, but
// dynamic import of node: URLs doesn't work in an Electron renderer — only
// require() does. The string literal is stable across Closure builds.
const V86_FS_IMPORT = 'await import("node:fs/promises")'
const V86_FS_REQUIRE = 'require("fs").promises'

async function copyLib() {
  const target = path.join(__dirname, '../dist/static')
  const lib = path.join(__dirname, '../src/renderer/lib')
  const index = path.join(target, 'index.html')

  await fs.promises.cp(lib, target, { recursive: true });

  const libv86path = path.join(target, 'libv86.js')
  const libv86 = fs.readFileSync(libv86path, 'utf-8')
  const patched = libv86.split(V86_FS_IMPORT).join(V86_FS_REQUIRE)
  if (patched === libv86) {
    throw new Error(`libv86.js patch failed: \`${V86_FS_IMPORT}\` not found. Check src/lib.js in copy/v86.`)
  }
  fs.writeFileSync(libv86path, patched)

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
