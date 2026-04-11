#!/usr/bin/env node
/**
 * Updates v86 by building the wasm from a local checkout. The libv86.js +
 * v86.wasm pair MUST be ABI-matched — copy.sh historically rebuilds the JS
 * without rebuilding the wasm, and a mismatch silently breaks fresh boot
 * (state restore still works because the CPU snapshot is opaque, so you
 * won't notice until Win95 BSODs at the splash screen with "Invalid VxD
 * dynamic link call").
 *
 * Usage:
 *   node tools/update-v86.js [path/to/v86]       # builds wasm from source
 *   node tools/update-v86.js --js-only           # just download libv86.js
 *
 * The wasm build needs `rustup target add wasm32-unknown-unknown` and clang.
 * libv86.js needs Java + Closure; if you don't have those, --js-only fetches
 * from copy.sh and warns if its Last-Modified is far from your wasm build.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const LIB_DIR = path.join(__dirname, '../src/renderer/lib');
const V86_DIR = process.argv.find(a => a !== process.argv[0] && a !== process.argv[1] && !a.startsWith('--'))
              || path.resolve(__dirname, '../../v86');
const JS_ONLY = process.argv.includes('--js-only');
const SKEW_DAYS = 14;

function head(url) {
  return new Promise((resolve, reject) => {
    https.request(url, { method: 'HEAD' }, (res) => {
      resolve({ status: res.statusCode, lastModified: res.headers['last-modified'] });
    }).on('error', reject).end();
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(dest, buf);
        console.log(`  ${path.basename(dest)}: ${(buf.length / 1024).toFixed(0)} KB`);
        resolve(res.headers['last-modified']);
      });
    }).on('error', reject);
  });
}

async function main() {
  const jsDest = path.join(LIB_DIR, 'libv86.js');
  const wasmDest = path.join(LIB_DIR, 'build/v86.wasm');

  // ─── wasm ────────────────────────────────────────────────────────────────
  let wasmDate;
  if (JS_ONLY) {
    if (!fs.existsSync(wasmDest)) {
      throw new Error(`--js-only requires an existing wasm at ${wasmDest}`);
    }
    wasmDate = fs.statSync(wasmDest).mtime;
    console.log(`Keeping existing wasm (${wasmDate.toISOString().slice(0, 10)})`);
  } else {
    if (!fs.existsSync(path.join(V86_DIR, 'Makefile'))) {
      throw new Error(`No v86 checkout at ${V86_DIR}. Clone copy/v86 there or pass a path.`);
    }
    const head = execSync('git log -1 --format="%h %ci"', { cwd: V86_DIR }).toString().trim();
    console.log(`Building wasm from ${V86_DIR} @ ${head}`);
    execSync('make build/v86.wasm', { cwd: V86_DIR, stdio: 'inherit' });
    fs.copyFileSync(path.join(V86_DIR, 'build/v86.wasm'), wasmDest);
    wasmDate = new Date();
    console.log(`  v86.wasm: ${(fs.statSync(wasmDest).size / 1024).toFixed(0)} KB`);
  }

  // ─── libv86.js ───────────────────────────────────────────────────────────
  // Build from source if Closure is available; otherwise fetch and check skew.
  const hasClosure = !JS_ONLY && fs.existsSync(path.join(V86_DIR, 'closure-compiler/compiler.jar'));
  if (hasClosure) {
    console.log('Building libv86.js (Closure)…');
    execSync('make build/libv86.js', { cwd: V86_DIR, stdio: 'inherit' });
    fs.copyFileSync(path.join(V86_DIR, 'build/libv86.js'), jsDest);
    console.log(`  libv86.js: ${(fs.statSync(jsDest).size / 1024).toFixed(0)} KB`);
  } else {
    console.log('No Closure jar — fetching libv86.js from copy.sh');
    const lm = await download('https://copy.sh/v86/build/libv86.js', jsDest);
    const jsDate = new Date(lm);
    const skew = Math.abs(jsDate - wasmDate) / 86400000;
    console.log(`  JS:   ${jsDate.toISOString().slice(0, 10)}`);
    console.log(`  wasm: ${wasmDate.toISOString().slice(0, 10)}`);
    if (skew > SKEW_DAYS) {
      throw new Error(
        `JS and wasm are ${skew.toFixed(0)} days apart. ` +
        `Either install Closure (java + v86/closure-compiler/compiler.jar) ` +
        `to build libv86.js from the same commit, or git-checkout v86 to a ` +
        `commit near ${jsDate.toISOString().slice(0, 10)} and rebuild the wasm.`
      );
    }
  }

  // ─── BIOS ────────────────────────────────────────────────────────────────
  // SeaBIOS sets up the interrupt controller for whatever the emulated
  // hardware presents. New v86 + old BIOS = APIC never armed = IDE IRQs
  // never fire = boot hangs at the splash screen with no disk activity.
  if (!JS_ONLY) {
    const biosDir = path.join(__dirname, '../bios');
    for (const f of ['seabios.bin', 'vgabios.bin']) {
      fs.copyFileSync(path.join(V86_DIR, 'bios', f), path.join(biosDir, f));
      console.log(`  ${f}: ${(fs.statSync(path.join(biosDir, f)).size / 1024).toFixed(0)} KB`);
    }
  }

  // ─── patch: phantom slave drive ──────────────────────────────────────────
  // v86 bug since 1b90d2e7 (May 2025 IDE refactor): cpu.js does
  //   ide_config[0][1] = { buffer: settings.hdb }
  // unconditionally inside the `if(settings.hda)` block. When hdb is
  // undefined this creates a phantom 0-size HD on primary slave; Win95's
  // ESDI_506.PDR detects it, sends IDENTIFY, and spins forever waiting for
  // DRQ from a drive that has no sectors. State restore skips driver init,
  // so it only bites on fresh boot.
  //
  // The pattern is structurally stable: `buffer` and `hdb` are option keys
  // (externed, not mangled), `[0][1]=` is literal.
  let js = fs.readFileSync(jsDest, 'utf-8');
  const phantom = /(\w+)\[0\]\[1\]=\{buffer:(\w+)\.hdb\}/g;
  const matches = [...js.matchAll(phantom)];
  if (matches.length !== 1) {
    throw new Error(
      `phantom-slave patch: expected exactly 1 match, found ${matches.length}. ` +
      `Either v86 fixed this upstream (good — remove this patch) or the ` +
      `pattern changed. Check src/cpu.js around ide_config[0][1].`
    );
  }
  js = js.replace(phantom, '$2.hdb&&($1[0][1]={buffer:$2.hdb})');
  fs.writeFileSync(jsDest, js);
  console.log('  patched: phantom slave drive guard (1 site)');

  // ─── sanity ──────────────────────────────────────────────────────────────
  if (!js.includes('process.versions.node'))
    throw new Error('libv86 lost the process.versions.node check (file loader regression)');
  if (!/this\.fetch=\([^)]*\)=>fetch\(/.test(js))
    throw new Error('libv86 lost the fetch arrow wrapper');
  if (!js.includes('window.V86=') && !js.includes('module.exports.V86='))
    throw new Error('libv86 export pattern changed — check the runtime shim');

  console.log('✓ installed (sanity checks pass)');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
