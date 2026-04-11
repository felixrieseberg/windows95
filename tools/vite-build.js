const { build } = require('vite')
const { builtinModules } = require('module')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const nodeExternals = ['electron', ...builtinModules, ...builtinModules.map(m => `node:${m}`)]

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
  const target = path.join(root, 'dist/static')
  const lib = path.join(root, 'src/renderer/lib')
  const indexSrc = path.join(root, 'static/index.html')
  const indexOut = path.join(target, 'index.html')

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

  const indexContents = fs.readFileSync(indexSrc, 'utf-8');
  const replacedContents = indexContents.replace('<!-- libv86 -->', LIBV86_SHIM)
  fs.writeFileSync(indexOut, replacedContents)
}

function mainConfig(watch) {
  return {
    root,
    configFile: false,
    build: {
      outDir: 'dist/src/main',
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'node22',
      lib: { entry: 'src/main/main.ts', formats: ['cjs'], fileName: () => 'main.js' },
      rollupOptions: {
        external: [...nodeExternals, 'electron-squirrel-startup', 'update-electron-app'],
      },
      watch: watch ? {} : undefined,
    },
  }
}

function rendererConfig(watch) {
  return {
    root,
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2023',
      lib: {
        entry: 'src/renderer/app.tsx',
        formats: ['cjs'],
        fileName: () => 'renderer.js',
        cssFileName: 'renderer',
      },
      rollupOptions: {
        external: nodeExternals,
        output: {
          inlineDynamicImports: true,
          assetFileNames: '[name][extname]',
          // Electron renderer <script> with nodeIntegration has module/require
          // but not a bare `exports` global; alias it so Rollup's CJS prelude works.
          banner: 'var exports = module.exports;',
        },
      },
      watch: watch ? {} : undefined,
    },
  }
}

async function compileVite(options = {}) {
  if (!options.watch) {
    await fs.promises.rm(path.join(root, 'dist'), { recursive: true, force: true })
  }
  await fs.promises.mkdir(path.join(root, 'dist/static'), { recursive: true })
  await copyLib()
  await build(mainConfig(options.watch))
  await build(rendererConfig(options.watch))
}

module.exports = { compileVite }

if (require.main === module) compileVite()
