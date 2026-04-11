const { compileVite } = require('./vite-build')

if (require.main === module) compileVite({ watch: true })
