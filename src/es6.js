const { protocol } = require('electron')
const fs = require('fs-extra')
const path = require('path')

const ES6_PATH = path.join(__dirname, 'renderer')

protocol.registerStandardSchemes(['es6'])

async function setupProtocol () {
  protocol.registerBufferProtocol('es6', async (req, cb) => {
    console.log(req)

    try {
      const filePath = path.join(ES6_PATH, req.url.replace('es6://', ''))
        .replace('.js/', '.js')
        .replace('.js\\', '.js')

      const fileContent = await fs.readFile(filePath)

      cb({ mimeType: 'text/javascript', data: fileContent }) // eslint-disable-line
    } catch (error) {
      console.warn(error)
    }
  })
}

module.exports = {
  setupProtocol
}
