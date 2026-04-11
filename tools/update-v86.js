#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const LIB_DIR = path.join(__dirname, '../src/renderer/lib');
const FILES = [
  { url: 'https://copy.sh/v86/build/libv86.js', dest: path.join(LIB_DIR, 'libv86.js') },
  { url: 'https://copy.sh/v86/build/v86.wasm', dest: path.join(LIB_DIR, 'build/v86.wasm') },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`${url} → HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(dest, buf);
        console.log(`✓ ${path.relative(process.cwd(), dest)} (${(buf.length / 1024).toFixed(0)} KB)`);
        resolve();
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  for (const { url, dest } of FILES) {
    await download(url, dest);
  }
})();
