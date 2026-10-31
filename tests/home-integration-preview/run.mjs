import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const results=[],errors=[],requests=[]
const output='docs/home-integration'
await mkdir(output,{recursive:true})
console.log("launching");
const browser=await webkit.launch({headless:true,executablePath:process.env.HAKU_WEBKIT_EXECUTABLE || '/Users/shimadashunta/Library/Caches/ms-playwright/webkit_mac14_special-2251/pw_run.sh'})
console.log("launched");
try {
const context=await browser.newContext({...devices['iPhone 13'],locale:'ja-JP',timezoneId:'Asia/Tokyo'})
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(requests.push(r.request().url()),r.abort()))
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
await page.clock.install({time:new Date('2026-10-31T03:00:00Z')})
console.log("opening");
await page.goto(process.env.HAKU_INTEGRATION_QA_URL || 'http://127.0.0.1:4191/tests/home-integration-preview/index.html')
console.log("opened");
const check=(name,condition)=>{assert.ok(condition,name);results.push(name)}
await page.getByRole('button',{name:'今すぐ視聴 →',exact:true}).waitFor()
check('confirmed LIVE is first stage section',await page.locator('.haku-stage section').first().getAttribute('aria-label')==='LIVE配信中')
check('watch action in initial iPhone viewport',await page.getByRole('button',{name:'今すぐ視聴 →',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom<innerHeight-60))
check('quick reservation in initial viewport',await page.getByRole('button',{name:'次のLIVEを予約',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom<innerHeight-60))
const featured=page.locator('section[aria-label="注目のパフォーマー"]')
check('activity ordering independent from LIVE', (await featured.locator('strong').first().textContent()).includes('最近ログイン'))
const upcoming=page.locator('section[aria-label="まもなく出演"]')
check('ongoing today tomorrow appearance order',(await upcoming.locator('.pl-cinema-card strong').allTextContents()).join('|')==='出演中のパフォーマー|本日の出演者|明日の出演者')
check('real appearance labels',await upcoming.getByText('出演中',{exact:true}).count()===1 && await upcoming.getByText(/^本日 /).count()===1 && await upcoming.getByText(/^明日 /).count()===1)
check('no fabricated appearance for unscheduled performer',await upcoming.getByText('最近ログインのパフォーマー',{exact:true}).count()===0)
await page.getByRole('button',{name:'次のLIVEを予約',exact:true}).tap()
await page.getByRole('button',{name:'予約済み ✓',exact:true}).first().waitFor()
check('reservation synchronized across both entry points',await page.getByRole('button',{name:'予約済み ✓',exact:true}).count()===2)
await page.getByText('予約の管理',{exact:true}).tap()
await page.getByRole('button',{name:'予約を解除する',exact:true}).tap()
check('cancel requires confirmation',await page.getByRole('button',{name:'予約解除を確定',exact:true}).isVisible())
await page.getByRole('button',{name:'戻る',exact:true}).tap()
check('back preserves reservation',await page.getByRole('button',{name:'予約済み ✓',exact:true}).count()===2)
await page.getByRole('button',{name:'予約を解除する',exact:true}).tap()
await page.getByRole('button',{name:'予約解除を確定',exact:true}).tap()
await page.getByRole('button',{name:'LIVEを予約',exact:true}).waitFor()
check('confirmed cancellation restores reserve',true)
await page.getByRole('button',{name:'今すぐ視聴 →',exact:true}).tap()
check('watch callback',(await page.getByLabel('操作結果').textContent())==='watch:qa-2')
await page.getByRole('button',{name:'プロフィール・フォロー',exact:true}).tap()
check('profile follow callback',(await page.getByLabel('操作結果').textContent())==='profile:qa-2')
await page.getByRole('button',{name:'応援・投げ銭',exact:true}).tap()
check('support callback',(await page.getByLabel('操作結果').textContent())==='tip:qa-2')
await page.locator('.pl-home-v7__channels button').nth(2).tap()
check('MAP callback',(await page.getByLabel('操作結果').textContent())==='map:')
await page.getByRole('button',{name:'活動順位を更新する',exact:true}).tap()
await page.waitForFunction(()=>document.querySelector('section[aria-label*="注目"] .pl-cinema-card strong')?.textContent==='Stripe登録済み')
check('online activity refresh',true)
await page.clock.runFor(30_001)
check('30-second auto refresh',(await featured.locator('strong').first().textContent())==='Stripe登録済み')
check('followed rail retained',await page.locator('section[aria-label]').filter({hasText:'YOUR PEOPLE'}).count()===1)
await page.screenshot({path:`${output}/iphone-integrated.png`,fullPage:true})
await page.goto('http://127.0.0.1:4191/tests/home-integration-preview/index.html?no-live=1&no-appearance=1')
await page.getByRole('button',{name:'LIVEを予約',exact:true}).waitFor()
check('no-LIVE mode preserves reservation',await page.locator('.haku-stage section').first().getAttribute('aria-label')==='これからのLIVE')
check('unscheduled performers have no fake appearance row',await page.locator('section[aria-label="まもなく出演"]').count()===0)
check('unscheduled fallback follows activity order',(await page.locator('section[aria-label="パフォーマーを探す"] strong').first().textContent()).includes('最近ログイン'))
for(const size of [{width:844,height:390},{width:320,height:640}]){
 await page.setViewportSize(size)
 check(`viewport ${size.width} no body overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
}
await page.screenshot({path:`${output}/iphone-integrated-narrow.png`,fullPage:true})
await page.goto('http://127.0.0.1:4191/tests/home-integration-preview/index.html?guest=1&no-live=1')
await page.getByRole('button',{name:'LIVEを予約',exact:true}).tap()
check('guest receives login guidance',await page.getByRole('alert').textContent().then(t=>t.includes('ログイン')))
check('no browser runtime errors',errors.length===0)
check('no external requests',requests.length===0)
await writeFile(`${output}/webkit-result.json`,JSON.stringify({results,errors,externalRequests:requests,physicalIPhone:false,backend:'isolated fixture'},null,2))
console.log(JSON.stringify({passed:results.length,results}))
} finally {await browser.close()}
