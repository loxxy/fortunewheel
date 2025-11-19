const fs = require('fs')
const path = require('path')

const dataDir = path.join(__dirname, '..', 'server', 'data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
  console.log(`Created data directory at ${dataDir}`)
}
