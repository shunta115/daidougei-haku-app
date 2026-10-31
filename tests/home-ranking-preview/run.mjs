import { webkit, devices } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const results=[],errors=[],requests=[]
const output='docs/home-activity-ranking'
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
await page.goto(process.env.HAKU_RANKING_QA_URL || 'http://127.0.0.1:4185/tests/home-ranking-preview/index.html')
console.log("opened");
const check=(name,condition)=>{assert.ok(condition,name);results.push(name)}
const featured=page.locator('section').filter({has:page.locator('h2').filter({hasText:'注目'})}).last()
await featured.locator('.pl-cinema-card').first().waitFor()
check('activity order beats LIVE status', (await featured.locator('strong').first().textContent()).includes('最近ログイン'))
const upcoming=page.locator('section').filter({has:page.locator('h2').filter({hasText:'まもなく'})}).last()
check('ongoing, today, tomorrow in order', (await upcoming.locator('.pl-cinema-card strong').allTextContents()).join('|')==='出演中のパフォーマー|本日の出演者|明日の出演者')
check('real performance labels', await upcoming.getByText('出演中',{exact:true}).count()===1 && await upcoming.getByText(/^本日 /).count()===1 && await upcoming.getByText(/^明日 /).count()===1)
check('no unscheduled performer in upcoming',await upcoming.getByText('最近ログインのパフォーマー',{exact:true}).count()===0)
await featured.locator('.pl-cinema-card__media').first().tap()
check('profile callback maintained',(await page.getByLabel('操作結果').textContent())==='profile:qa-0')
await upcoming.locator('.pl-cinema-card__media').first().tap()
check('LIVE callback maintained',(await page.getByLabel('操作結果').textContent())==='watch:qa-2')
await page.getByRole('button',{name:'活動順位を更新する',exact:true}).tap()
await page.waitForFunction(()=>document.querySelector('section[aria-label*="注目"] .pl-cinema-card strong')?.textContent==='Stripe登録済み')
check('online refresh updates latest activity order',true)
await page.clock.runFor(60_001)
check('visible automatic refresh preserves rank', (await featured.locator('strong').first().textContent())==='Stripe登録済み')
check('followed section maintained',await page.locator('section[aria-label]').filter({hasText:'YOUR PEOPLE'}).count()===1)
await page.getByRole('button',{name:'近く',exact:true}).tap().catch(async()=>await page.locator('.pl-home-v7__channels button').nth(2).tap())
check('MAP callback maintained',(await page.getByLabel('操作結果').textContent())==='map:')
await page.screenshot({path:`${output}/iphone-portrait.png`,fullPage:true})
for(const size of [{width:844,height:390},{width:320,height:640}]){
 await page.setViewportSize(size)
 check(`viewport ${size.width} has no body overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
}
await page.screenshot({path:`${output}/iphone-narrow.png`,fullPage:true})
check('no browser runtime errors',errors.length===0)
check('no external requests',requests.length===0)
await writeFile(`${output}/webkit-result.json`,JSON.stringify({results,errors,externalRequests:requests,physicalIPhone:false,backend:'isolated fixture'},null,2))
console.log(JSON.stringify({passed:results.length,results}))
} finally {await browser.close()}
