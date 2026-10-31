import { copyFile, mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const dir = '/private/tmp/haku-ranking-preview'
await copyFile(`${dir}/tests/home-ranking-preview/index.html`, `${dir}/index.html`)
await writeFile(`${dir}/vercel.json`, JSON.stringify({
  framework: null, buildCommand: '', installCommand: '', outputDirectory: '.',
  headers: [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; media-src 'none'; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'" }] }],
}))
const assets = {}
for (const name of await readdir(`${dir}/assets`)) assets[name] = createHash('sha256').update(await readFile(`${dir}/assets/${name}`)).digest('hex')
const metadata = { base: '4403bd7f1274678dc39235e58bb59835f4dd4a6c', branch: 'codex/home-activity-ranking', mode: 'static isolated sample', physicalIPhone: false, assets }
await writeFile(`${dir}/qa-build.json`, JSON.stringify(metadata, null, 2))
await mkdir('docs/home-activity-ranking', { recursive: true })
await writeFile('docs/home-activity-ranking/preview-assets.json', JSON.stringify(metadata, null, 2))
console.log('Prepared static QA only:', dir)
