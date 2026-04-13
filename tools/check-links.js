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
    // Release download URLs are chicken-and-egg: README is updated to point at
    // the new version before the release build that creates those assets has
    // run (and lint gates that build). Skip them.
    if (/\/releases\/download\//.test(link)) {
      console.log(`⏭️  ${link} (release asset, skipped)`)
      continue
    }
    try {
      const response = await fetch(link, { method: 'HEAD' })

      if (!response.ok) {
        // GitHub's release-asset and user-attachments CDNs reject anonymous HEAD
        // requests (403), which is different from a 404.
        const isGithubCdn =
          response.url.startsWith('https://github-production-release-asset') ||
          response.url.startsWith('https://github-production-user-asset') ||
          link.startsWith('https://github.com/user-attachments/')
        if (!isGithubCdn) {
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
