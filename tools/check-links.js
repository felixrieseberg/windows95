const fs = require('fs/promises')
const path = require('path')
const fetch = require('node-fetch')

const LINK_RGX = /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?/g;

async function main() {
  const readmePath = path.join(__dirname, '../README.md')
  const readme = await fs.readFile(readmePath, 'utf-8')
  const links = readme.match(LINK_RGX)
  let failed = false

  for (const link of links) {
    try {
      const response = await fetch(link, { method: 'HEAD' })

      if (!response.ok) {
        // If we're inside GitHub's release asset server, we just ran into AWS not allowing
        // HEAD requests, which is different from a 404.
        if (!response.url.startsWith('https://github-production-release-asset')) {
          throw new Error (`HTTP Error Response: ${response.status} ${response.statusText}`)
        }
      }

      console.log(`✅ ${link}`);
    } catch (error) {
      failed = true

      console.log(`❌ ${link}\n${error}`)
    }
  }

  if (failed) {
    process.exit(-1);
  }
}

main()
