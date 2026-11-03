import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
const output = resolve('artifacts/home-preview-dist')
const images = ['events/award-winning-performers-2026/hero-performer.jpg','official/media/media-stage-1.jpg','official/media/media-stage-2.jpg','brand/haku-official.jpg','logo-mark.svg','favicon.svg']
for (const path of images) {
  const target = resolve(output, path)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(resolve('public', path), target)
}
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; media-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
await writeFile(resolve(output, 'vercel.json'), JSON.stringify({version:2,framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',headers:[{source:'/(.*)',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Content-Security-Policy',value:csp}]}]},null,2))
for (const name of await readdir(resolve(output, 'assets'))) {
  if (!name.endsWith('.js')) continue
  const content = await readFile(resolve(output, 'assets', name), 'utf8')
  for (const marker of ['supabase.co','sk_live_','sk_test_','createClient(']) {
    if (content.includes(marker)) throw new Error(`Unsafe service marker in sample output: ${marker}`)
  }
}
console.log('Static sample prepared: no remote service keys/client, API functions or cron')
