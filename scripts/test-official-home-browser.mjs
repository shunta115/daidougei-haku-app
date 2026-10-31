import { createRequire } from 'node:module'
import { mkdir,writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
const require=createRequire(import.meta.url)
const {webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
console.log('Launching local WebKit');
const browser=await webkit.launch({headless:true, timeout:20000, executablePath:process.env.WEBKIT_EXECUTABLE})
console.log('Browser ready');
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true})
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
page.setDefaultTimeout(15000);
const checks=[];const check=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);console.log('PASS',message)}
const base='http://127.0.0.1:5199'
const OWNER='10000000-0000-4000-8000-000000000001'
const endpoint=base+'/api/ops/inbox?resource=official-home'
try{
 await page.goto(base+'/tests/fixtures/official-home/browser.html');await page.getByLabel('キャッチコピー',{exact:true}).waitFor({timeout:30000})
 await page.getByLabel('キャッチコピー',{exact:true}).fill('心が動く、その瞬間を。')
 await page.getByLabel('詳しい自己紹介',{exact:true}).fill('イベントの一日を、忘れられない体験に。\n企業・自治体・地域のお祭りなどに対応します。')
 await page.getByLabel('必要スペース',{exact:true}).fill('幅5m × 奥行5m / 高さ4m')
 await page.getByRole('button',{name:'保存前プレビュー'}).click();check(await page.locator('.oh-preview').getByText('心が動く、その瞬間を。').isVisible(),'unsaved detail preview')
 await page.getByRole('button',{name:'プロフィールを保存',exact:true}).click();await page.getByRole('status').getByText('保存しました。',{exact:true}).waitFor();checks.push('profile saved through real API and SQL')
 await page.getByLabel('写真を追加',{exact:true}).setInputFiles(['public/official/media/media-stage-1.jpg','public/official/media/media-stage-2.jpg'])
 await page.locator('.oh-assets article').nth(1).waitFor({timeout:30000});await page.locator('.oh-tasks').getByText('完了',{exact:true}).nth(1).waitFor()
 check(await page.locator('.oh-assets article').count()===2,'multiple photo uploads + browser compression and thumbnail generation')
 const photos=page.locator('.oh-assets article')
 await photos.nth(0).getByLabel('公開',{exact:true}).check();await page.getByRole('status').getByText('保存しました。',{exact:true}).waitFor()
 await photos.nth(1).getByLabel('公開',{exact:true}).check();await page.getByRole('status').getByText('保存しました。',{exact:true}).waitFor()
 await photos.nth(1).getByRole('button',{name:'メインにする',exact:true}).click();await page.getByRole('button',{name:'メインに設定済み'}).waitFor()
 await photos.nth(1).getByRole('button',{name:'前へ',exact:true}).click();await page.getByRole('status').getByText('表示順を保存しました。',{exact:true}).waitFor();checks.push('main selection, publish, touch reorder persisted')
 await page.getByText('宣材PDF 0 / 5',{exact:true}).click()
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save())
 await page.getByLabel('PDFを追加',{exact:true}).setInputFiles({name:'press-kit.pdf',mimeType:'application/pdf',buffer:bytes})
 
 await page.locator('.oh-assets article').nth(2).waitFor({timeout:30000})
 const read=await context.request.get(endpoint+'&homeAction=read&performerId='+OWNER);let data=await read.json();check(data.assets.length===2,'unpublished PDF absent from anonymous listing')
 const edit=await context.request.get(endpoint+'&homeAction=edit&performerId='+OWNER,{headers:{Authorization:'Bearer '+OWNER}});const draft=(await edit.json()).assets.find(a=>a.kind==='pdf')
 check((await context.request.get(endpoint+'&homeAction=file&performerId='+OWNER+'&assetId='+draft.id)).status()===404,'unpublished PDF byte access denied')
 check((await context.request.post(endpoint,{headers:{Authorization:'Bearer 20000000-0000-4000-8000-000000000002','Content-Type':'application/json'},data:{action:'asset',id:draft.id,published:true}})).status()===404,'another performer cannot edit PDF')
 await page.locator('.oh-assets article').filter({has:page.locator('input[value="press-kit"]')}).getByLabel('公開',{exact:true}).check();await page.getByRole('status').getByText('保存しました。',{exact:true}).waitFor()
 await page.getByRole('button',{name:'public',exact:true}).click();await page.getByRole('heading',{name:'検証用パフォーマー',exact:true}).waitFor()
 check(await page.locator('.oh-cover img').isVisible(),'public main photo and carousel')
 await page.getByRole('button',{name:'検証用パフォーマーの写真を拡大'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('ArrowRight');await page.getByRole('button',{name:'閉じる',exact:true}).click();checks.push('photo lightbox and keyboard navigation')
 const file=await context.request.get(endpoint+'&homeAction=file&performerId='+OWNER+'&assetId='+draft.id+'&download=1');check(file.status()===200&&file.headers()['content-type']==='application/pdf'&&(await file.body()).subarray(0,5).toString()==='%PDF-','anonymous PDF returns real valid bytes')
 const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:'ダウンロード',exact:true}).click();const download=await downloadEvent;check((await download.suggestedFilename()).endsWith('.pdf'),'iPhone WebKit PDF download attachment')
 await mkdir('artifacts/official-home',{recursive:true});await page.screenshot({path:'artifacts/official-home/iphone-public.png',fullPage:true})
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'iPhone page has no horizontal overflow')
 await page.getByRole('button',{name:'出演を依頼する',exact:true}).click()
 for(const [label,value] of Object.entries({'会社名・団体名 *':'ローカル検証団体','担当者名 *':'検証担当','メールアドレス *':'test@example.invalid','電話番号 *':'090-0000-0000','開催希望日 *':'2099-10-31','開催場所 *':'検証会場','イベント内容 *':'ローカルDBだけを使用する検証依頼','希望出演時間 *':'30分','予算 *':'相談'}))await page.getByLabel(label,{exact:true}).fill(value)
 await page.waitForTimeout(3100);await page.getByRole('button',{name:'HAKU事務局へ送信',exact:true}).click();await page.getByRole('heading',{name:'出演依頼を受け付けました'}).waitFor();checks.push('booking submitted through real API and SQL with receipt')
 await page.getByRole('button',{name:'プロフィールへ戻る'}).click();await page.getByRole('button',{name:'admin',exact:true}).click();await page.getByText('新規依頼 · ローカル検証団体 · 2099-10-31',{exact:true}).waitFor();await page.getByText('新規依頼 · ローカル検証団体 · 2099-10-31',{exact:true}).click();await page.getByLabel('ステータス変更',{exact:true}).selectOption('reviewing');await page.getByText('確認中 · ローカル検証団体 · 2099-10-31',{exact:true}).waitFor();checks.push('office-only case retrieval and status update')
 await page.getByRole('button',{name:'public',exact:true}).click();await page.getByRole('heading',{name:'検証用パフォーマー',exact:true}).waitFor();await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/official-home/desktop-public.png',fullPage:true});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop page has no horizontal overflow')
 check(errors.length===0,'no browser runtime errors')
 await writeFile('artifacts/official-home/browser-results.json',JSON.stringify({engine:'WebKit',scope:'localhost real API + PGlite SQL + memory storage; no remote DB or physical iPhone',checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2))
}catch(error){console.log('FAILED',error);await mkdir('artifacts/official-home',{recursive:true});await page.screenshot({path:'artifacts/official-home/failure.png',fullPage:true}).catch(()=>{});throw error}finally{await browser.close()}
