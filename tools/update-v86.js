#!/usr/bin/env node
/**
 * Build and install v86 (wasm + libv86.js + BIOS) from a local checkout.
 *
 * Usage:
 *   node tools/update-v86.js [path/to/v86]
 *
 * Defaults to ../v86 relative to this repo. Expects the checkout to be on
 * `fork/windows95-base` (or a branch with both bug fixes applied):
 *
 *   - `electron-renderer-fs-loader` — file loader uses require() instead of
 *     dynamic import (needed for Electron renderer, PR #1540)
 *   - `ide-shared-registers` — ATA Command Block register writes hit both
 *     master and slave, as the spec says they should (fixes Win95/98 boot
 *     on disks >535MiB, PR #1541)
 *
 * If either PR is merged into upstream, rebase windows95-base and drop it.
 *
 * Prereqs (all must be installed — no fallbacks):
 *   cargo + rustup target add wasm32-unknown-unknown
 *   clang
 *   java (e.g. brew install openjdk)
 *   <v86>/closure-compiler/compiler.jar  (v20210601 — pinned by v86's Makefile)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WINDOWS95_DIR = path.resolve(__dirname, '..');
const V86_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(WINDOWS95_DIR, '../v86');

const LIB_DIR = path.join(WINDOWS95_DIR, 'src/renderer/lib');
const BIOS_DIR = path.join(WINDOWS95_DIR, 'bios');

const JAVA_BIN = '/opt/homebrew/opt/openjdk/bin/java';

function require_tool(cmd, desc) {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
  } catch {
    throw new Error(`Missing prerequisite: ${desc} (${cmd} not on PATH)`);
  }
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function check_prereqs() {
  require_tool('cargo', 'rust/cargo');
  require_tool('clang', 'clang');

  // cargo needs the wasm32 target
  const targets = execFileSync('rustup', ['target', 'list', '--installed']).toString();
  if (!targets.includes('wasm32-unknown-unknown')) {
    throw new Error('Missing rust target. Run: rustup target add wasm32-unknown-unknown');
  }

  // Java comes from homebrew openjdk on macOS — the v86 Makefile invokes `java`
  // directly, so we have to put the homebrew java on PATH for its make calls
  // (or install openjdk into the system). We check for an explicit binary so
  // the error is clear.
  if (!fs.existsSync(JAVA_BIN)) {
    throw new Error(`Missing java at ${JAVA_BIN}. Install with: brew install openjdk`);
  }

  const closureJar = path.join(V86_DIR, 'closure-compiler', 'compiler.jar');
  if (!fs.existsSync(closureJar)) {
    throw new Error(
      `Missing Closure compiler at ${closureJar}.\n` +
      `Download v20210601 (pinned by v86's Makefile):\n` +
      `  mkdir -p ${path.dirname(closureJar)}\n` +
      `  curl -sL https://repo1.maven.org/maven2/com/google/javascript/closure-compiler/v20210601/closure-compiler-v20210601.jar -o ${closureJar}`
    );
  }

  if (!fs.existsSync(path.join(V86_DIR, 'Makefile'))) {
    throw new Error(`No v86 checkout at ${V86_DIR}. Pass a path as the first argument or clone copy/v86 there.`);
  }
}

function build_v86() {
  const env = { ...process.env, PATH: `/opt/homebrew/opt/openjdk/bin:${process.env.PATH}` };
  console.log('Building v86.wasm…');
  run('make', ['build/v86.wasm'], { cwd: V86_DIR, env });
  console.log('Building libv86.js…');
  run('make', ['build/libv86.js'], { cwd: V86_DIR, env });
}

function install() {
  const copies = [
    ['build/v86.wasm',   'build/v86.wasm'],
    ['build/libv86.js',  'libv86.js'],
  ];
  for (const [src, dest] of copies) {
    fs.copyFileSync(path.join(V86_DIR, src), path.join(LIB_DIR, dest));
    const size = fs.statSync(path.join(LIB_DIR, dest)).size;
    console.log(`  ${dest}: ${(size / 1024).toFixed(0)} KB`);
  }

  for (const bios of ['seabios.bin', 'vgabios.bin']) {
    fs.copyFileSync(path.join(V86_DIR, 'bios', bios), path.join(BIOS_DIR, bios));
  }
  console.log('  seabios.bin + vgabios.bin');
}

/**
 * Sanity check the installed files for the invariants our SMB integration
 * and Electron renderer depend on. If any of these fail, v86 changed under us
 * and src/renderer/smb/index.ts probably needs updating — see the README at
 * src/renderer/smb/README.md for why.
 */
function sanity_check() {
  const js = fs.readFileSync(path.join(LIB_DIR, 'libv86.js'), 'utf-8');

  const checks = [
    // The electron-renderer-fs-loader fix: don't use dynamic import for fs
    [!/await import\("node:/.test(js),
     'libv86.js uses `await import("node:...")` — the Electron renderer fs loader PR was reverted?'],

    // The ide-shared-registers fix: writes go to both master and slave
    // (minified has no spaces: `this.master.features_reg=(this.master...`)
    [/this\.master\.features_reg=\(this\.master\.features_reg/.test(js),
     'libv86.js ide.js did not get the shared-register fix — is the windows95-base branch still in sync?'],

    // Export pattern still shims the way vite-build expects
    [js.includes('module.exports') && js.includes('window'),
     'libv86.js export pattern changed — check the runtime shim in vite-build.js'],

    // SMB integration needs the tcp-connection bus event (new API path in index.ts)
    [js.includes('tcp-connection'),
     'libv86.js no longer fires the tcp-connection bus event — SMB will fall back to the old-API theft hack'],

    // Old-API fallback still present for defense in depth
    [js.includes('on_tcp_connection'),
     'libv86.js no longer has on_tcp_connection — harmless but surprising'],
  ];

  let passed = 0;
  for (const [ok, msg] of checks) {
    if (ok) passed++;
    else console.warn('  WARN:', msg);
  }
  console.log(`  sanity: ${passed}/${checks.length} checks passed`);
}

function main() {
  console.log(`v86 checkout: ${V86_DIR}`);
  const head = execFileSync('git', ['log', '-1', '--format=%h %s'], { cwd: V86_DIR }).toString().trim();
  console.log(`             ${head}`);

  check_prereqs();
  build_v86();
  install();
  sanity_check();
  console.log('done');
}

try { main(); }
catch (e) {
  console.error('✗', e.message);
  process.exit(1);
}
