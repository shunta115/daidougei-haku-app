import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Build an isolated phone check, or the explicit owner-private hosted variant.
// Neither variant reads a HAKU environment or initializes production SDKs.
const root = fileURLToPath(new URL('../', import.meta.url))
const target = process.argv[2]
if (!target) throw new Error('Usage: node scripts/build-free-live-device.mjs /absolute/output/index.html')
const output = resolve(target)
const hosted = process.argv.includes('--hosted')
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/experiments/free-live/main.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari17'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: 'device-check.js',
  write: false,
})
const js = result.outputFiles.find(file => file.path.endsWith('.js')).text
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text
const csp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src blob:; connect-src ${hosted ? "'self'" : "'none'"}; base-uri 'none'; form-action 'none'`
let html = await readFile(resolve(root, 'haku-free-live.html'), 'utf8')
html = html.replace('<html lang="ja">', hosted ? '<html lang="ja" data-hosted-lab="true">' : '<html lang="ja" data-device-only="true">')
html = html.replace('<title>HAKU LIVE — 無料配信ラボ</title>', hosted ? '<title>HAKU LIVE — 非公開配信テスト</title>' : '<title>HAKU LIVE — iPhone端末チェック</title>')
html = html.replace('</head>', () => `<meta http-equiv="Content-Security-Policy" content="${csp}" /><style>${css}</style></head>`)
// A replacement callback preserves literal $& / $` / $' in bundled JS.
html = html.replace(/<script type="module"[^>]+><\/script>/, () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`)
if (!html.includes(hosted ? 'data-hosted-lab="true"' : 'data-device-only="true"')) throw new Error('Missing lab guard')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, html)
process.stdout.write(`${hosted ? 'Private live lab' : 'Device check'} built: ${output}\n`)
