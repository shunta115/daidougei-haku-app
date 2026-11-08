import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

const password = process.env.HAKU_PREVIEW_PASSWORD
if (!password || password.length < 12) throw new Error('Set HAKU_PREVIEW_PASSWORD (at least 12 characters).')
const hash = value => createHash('sha256').update(value).digest()
const authorized = hash('Basic ' + Buffer.from('reviewer:' + password).toString('base64'))
const files = new Map(await Promise.all([
  ['/','index.html','text/html; charset=utf-8'],
  ['/styles.css','styles.css','text/css; charset=utf-8'],
  ['/main.js','main.js','text/javascript; charset=utf-8'],
].map(async ([route, file, type]) => [route, { data: await readFile(new URL('./dist/' + file, import.meta.url)), type }])))

const host = process.env.HAKU_PREVIEW_HOST || '127.0.0.1'
const port = Number(process.env.HAKU_PREVIEW_PORT || 4188)
createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  if (!timingSafeEqual(hash(req.headers.authorization || ''), authorized)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="HAKU DEMO", charset="UTF-8"' }).end('Preview access required')
    return
  }
  const file = files.get((req.url || '').split('?')[0])
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return }
  if (!file) { res.writeHead(404).end('Not found'); return }
  res.writeHead(200, { 'Content-Type': file.type }).end(req.method === 'HEAD' ? undefined : file.data)
}).listen(port, host, () => console.log(`DEMO available on http://${host}:${port}/`))
