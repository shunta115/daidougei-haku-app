import { webkit, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output = '/tmp/haku-transition-safari'
await mkdir(output, { recursive: true })
const host = 'https://haku-transition-test.supabase.co'
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-02T00:00:00Z' }
const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'test-signature'].join('.')
const session = { access_token: jwt, refresh_token: 'test-only', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4187'], { env: { ...process.env, VITE_SUPABASE_URL: host, VITE_SUPABASE_ANON_KEY: 'test-only-publishable' }, stdio: 'pipe' })
let browser, log = '', applied = false, requests = [], errors = []
server.stdout.on('data', x => log += x); server.stderr.on('data', x => log += x)
try {
  for (let i=0;i<100;i++) { try { if ((await fetch('http://127.0.0.1:4187')).ok) break } catch {} await new Promise(r=>setTimeout(r,200)) }
  browser = await webkit.launch({ headless: true, ...(process.env.HAKU_WEBKIT_EXECUTABLE ? { executablePath: process.env.HAKU_WEBKIT_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' })
  await context.addInitScript(({ session }) => { localStorage.setItem('sb-haku-transition-test-auth-token', JSON.stringify(session)); localStorage.setItem('daidougei-lang','ja') }, { session })
  // All nonlocal networking is mocked or blocked. No production or Stripe access.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === host) {
      requests.push(url.pathname)
      if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user })
      if (url.pathname.startsWith('/rest/v1/profiles')) return route.fulfill({ json: { id: user.id, email: user.email, display_name: 'TEST', role: applied ? 'performer' : 'fan', status: 'active' } })
      if (url.pathname.startsWith('/rest/v1/performers')) return route.fulfill({ json: applied ? { id: user.id, stage_name: 'TEST', bio:'',genre:'',city:'',country:'', is_approved:false,is_live:false,review_status:'pending',stripe_onboarding_complete:false,sns_json:[] } : null })
      return route.fulfill({ json: [] })
    }
    if (url.hostname !== '127.0.0.1') return route.abort()
    if (url.pathname === '/api/haku-admin') {
      assert.equal(route.request().headers().authorization, `Bearer ${jwt}`)
      const body=route.request().postDataJSON(); assert.equal(body.resource,'performer-application'); assert.equal(body.action,'apply'); assert.equal(body.payload,undefined)
      applied=true; return route.fulfill({ json: {ok:true} })
    }
    return route.continue()
  })
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:4187/live/register', { waitUntil: 'domcontentloaded', timeout: 120000 })
  const apply=page.getByRole('button',{name:'同じアカウントでパフォーマー登録を申請'})
  await apply.waitFor({ timeout: 120000 }); await page.screenshot({path:`${output}/before.png`,fullPage:true})
  await apply.click(); await apply.waitFor({state:'detached',timeout:120000})
  assert.ok(applied); assert.ok(!requests.some(p=>p.includes('/signup') || p.includes('/logout')))
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sb-haku-transition-test-auth-token')))
  assert.equal(saved.user.id,user.id); assert.equal(saved.user.email,user.email); assert.equal(saved.access_token,jwt)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false)
  await page.screenshot({path:`${output}/after.png`,fullPage:true})
  assert.deepEqual(errors,[])
  const result={engine:'WebKit',device:'iPhone 13 emulation (not physical Safari)',passed:['fan application entry','Bearer access token','self-only request','profile refresh after application','no signup/logout','same user ID/email/session','no horizontal overflow','no browser errors'],externalServices:'mocked; no Supabase/Stripe operations'}
  await writeFile(`${output}/results.json`,JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2))
} catch(error) { console.error(log); throw error }
finally { await browser?.close(); server.kill('SIGTERM') }
