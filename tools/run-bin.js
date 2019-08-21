/* tslint:disable */

const childProcess = require('child_process')
const path = require('path')

async function run (name, bin, args = []) {
  await new Promise((resolve, reject) => {
    console.info(`Running ${name}`)

    const cmd = process.platform === 'win32' ? `${bin}.cmd` : bin
    const child = childProcess.spawn(
      path.resolve(__dirname, '..', 'node_modules', '.bin', cmd),
      args,
      {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit'
      }
    )

    child.on('exit', (code) => {
      console.log('')
      if (code === 0) return resolve()
      reject(new Error(`${name} failed`))
    })
  })
};

module.exports = {
  run
}
