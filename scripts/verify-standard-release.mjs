// Fail the ordinary release if a lab entry accidentally ships with HAKU.
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(process.argv[2] || 'dist')
const files = await readdir(root)
if (files.includes('haku-crowd-live.html')) throw Error('CROWD experiment leaked into standard release')
const assets = await readdir(resolve(root, 'assets'))
if (assets.some(file => /^haku-crowd-live[-.]/.test(file))) throw Error('CROWD experiment bundle leaked into standard release')
for (const page of ['index.html', 'haku-admin.html']) {
  const html = await readFile(resolve(root, page), 'utf8')
  if (/haku-crowd-live|src\/experiments\/crowd-live/.test(html)) throw Error('CROWD link leaked into standard release')
}
console.log('Standard release surface verified: HAKU and admin only; CROWD lab excluded')
