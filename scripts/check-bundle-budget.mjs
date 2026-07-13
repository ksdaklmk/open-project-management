import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const budget = 220 * 1024
const html = readFileSync('dist/index.html', 'utf8')
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])
const total = assets.reduce((bytes, asset) => {
  const file = resolve('dist', asset.replace(/^\//, ''))
  return bytes + gzipSync(readFileSync(file)).byteLength
}, 0)

console.log(`Initial compressed JS + CSS: ${(total / 1024).toFixed(1)} KiB / 220 KiB`)
if (total > budget) process.exitCode = 1
