const path = require('path');

const resedit = require('../node_modules/@electron/packager/dist/resedit.js')
const package = require('../package.json');

const exePath = process.argv[process.argv.length - 1]

console.log(exePath)

async function main() {
  
  await resedit.resedit(exePath, {
    "productVersion": package.version,
    "fileVersion": package.version,
    "productName": package.productName,
    "icon": path.join(__dirname, "../assets/icon.ico"),
    "win32Metadata": {
      "FileDescription": package.productName,
      "InternalName": package.name,
      "OriginalFilename": `${package.name}.exe`,
      "ProductName": package.productName,
      "CompanyName": package.author
    }
  });
}

main();
