/* tslint:disable */

const { run } = require('./run-bin')

async function compileTypeScript () {
  await run('TypeScript', 'tsc', ['-p', 'tsconfig.json'])
};

module.exports = {
  compileTypeScript
}

if (require.main === module) compileTypeScript()
