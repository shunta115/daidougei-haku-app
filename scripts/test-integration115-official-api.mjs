// Local actual API -> existing isolated TEST DB/Storage. Never accepts a production URL.
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {createClient} from '@supabase/supabase-js'
import {build} from 'esbuild'
import {PDFDocument} from 'pdf-lib'
const config=JSON.parse(await readFile('/private/tmp/haku115-test-publishable.json','utf8'))
const fixture=JSON.parse(await readFile('/private/tmp/haku115-auth-fixture.json','utf8'))
const keys=JSON.parse(await readFile(process.env.HAKU115_SERVER_KEYS_FILE || '/private/tmp/haku-pr112-supabase-keys.json','utf8'))
const key=keys.find(x=>x.name==='service_role'&&x.type==='legacy'&&!x.disabled)?.api_key
if(!key||JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).ref!=='aeqskxxykzapgaudbeqa'||new URL(config.url).hostname!=='aeqskxxykzapgaudbeqa.supabase.co')throw Error('Verified TEST service credential required')
process.env.SUPABASE_URL=config.url;process.env.SUPABASE_ANON_KEY=config.key;process.env.SUPABASE_SERVICE_ROLE_KEY=key;process.env.HOME_ENABLED='true';process.env.BOOKING_RATE_LIMIT_SECRET='haku115-local-test-only-rate-secret-20261101';process.env.HOME_TEST_IP='127.0.0.1';process.env.PUBLIC_SITE_URL='https://example.invalid';delete process.env.STRIPE_SECRET_KEY;delete process.env.VERCEL;delete process.env.VERCEL_ENV
await mkdir('node_modules/.tmp',{recursive:true})
await build({entryPoints:['server/officialHome.ts','server/homeRanking.ts'],outdir:'node_modules/.tmp/haku115-api',bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',outExtension:{'.js':'.mjs'}})
const {officialHome}=await import('../node_modules/.tmp/haku115-api/officialHome.mjs')
const {default:ranking}=await import('../node_modules/.tmp/haku115-api/homeRanking.mjs')
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');req.query=Object.fromEntries(url.searchParams)
  let raw='';for await(const part of req){raw+=part;if(raw.length>4_000_000)throw Error('body too large')}req.body=raw?JSON.parse(raw):{}
  res.status=n=>{res.statusCode=n;return res};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res};res.send=value=>{res.end(value);return res}
  await (url.pathname==='/api/home-ranking'?ranking:officialHome)(req,res)
 }catch{res.statusCode=500;res.end('TEST API failure')}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port
const office=process.argv.includes('--with-office')?JSON.parse(await readFile('/private/tmp/haku115-office-fixture.json','utf8')):null
const actors=[...fixture.actors.slice(0,2),...(office?[office]:[])]
const checks=[],assets=[];const clients=actors.map(()=>createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}}));const tokens=[]
const check=(condition,name)=>{if(!condition)throw Error(name);checks.push(name)}
const call=async(action,body,actor=0)=>fetch(base+'/api/ops/inbox?resource=official-home&homeAction='+action+(body?'':'&performerId='+fixture.actors[0].id),{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(actor===null?{}:{Authorization:'Bearer '+tokens[actor]})},...(body?{body:JSON.stringify(body)}:{})})
try{
 for(let i=0;i<clients.length;i++){const a=actors[i];const r=await clients[i].auth.signInWithPassword({email:a.email,password:a.password||fixture.password});if(r.error)throw Error('TEST auth');tokens.push(r.data.session.access_token)}
 const owner=fixture.actors[0].id
 if(!process.argv.includes('--ranking-only')&&!process.argv.includes('--office-only')) {
 let response=await call('save',{performer_id:owner,published:true,details:{tagline:'HAKU115 real API verification',introduction:'TEST-only public content'}});check(response.ok,'verified owner saves official home through real API and DB')
 response=await call('save',{performer_id:owner,details:{tagline:'tamper'}},1);check(response.status===403,'other real JWT cannot edit owner homepage')
 response=await call('upload',{performer_id:owner,kind:'video',title:'YouTube TEST',video_id:'yk6Kjl0WHWs'},null);check(response.status===401,'anonymous upload denied')
 const jpeg=await readFile('public/events/award-winning-performers-2026/hero-performer.jpg')
 response=await call('upload',{performer_id:owner,kind:'photo',upload_id:crypto.randomUUID(),title:'TEST photo',base64:jpeg.toString('base64'),thumbnail:jpeg.toString('base64')})
 const photo=await response.json();check(response.status===201&&photo.asset?.id,'real Storage photo and thumbnail upload with DB registration');assets.push(photo.asset)
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save())
 response=await call('upload',{performer_id:owner,kind:'pdf',upload_id:crypto.randomUUID(),title:'TEST PDF',base64:bytes.toString('base64')});const doc=await response.json();check(response.status===201&&doc.asset?.id,'real PDF validation Storage upload and DB registration');assets.push(doc.asset)
 let file=await fetch(base+'/api/ops/inbox?homeAction=file&performerId='+owner+'&assetId='+doc.asset.id);check(file.status===404,'unpublished PDF cannot be fetched anonymously')
 for(const asset of assets){response=await call('asset',{performer_id:owner,id:asset.id,published:true});check(response.ok,'owner publishes '+asset.kind+' through real API')}
 file=await fetch(base+'/api/ops/inbox?homeAction=file&performerId='+owner+'&assetId='+doc.asset.id);check(file.status===200&&Buffer.from(await file.arrayBuffer()).equals(bytes),'published PDF round trips through protected API and real Storage')
 response=await call('read',null,null);const publicHome=await response.json();check(response.ok&&publicHome.assets?.some(a=>a.id===photo.asset.id),'public API returns only published assets')
 }
 if(office){
  const owner=fixture.actors[0].id
  const payload={performer_id:owner,organization:'HAKU115 TEST only',contact:'Fictional test contact',email:'haku115@example.invalid',phone:'0000000000',date:'2099-01-01',venue:'TEST venue',event:'Not a real booking',duration:'30 minutes',budget:'TEST',notes:'TEST ONLY; no real request'}
  let response=await call('booking',{performer_id:owner,started_at:Date.now()-5000,payload},null);const submitted=await response.json();check(response.status===201&&submitted.id,'anonymous booking reaches real TEST office workflow')
  response=await call('cases',{},1);check(response.status===403,'performer or fan cannot inspect private booking cases')
  response=await call('cases',{},2);const list=await response.json();check(response.ok&&list.cases?.some(x=>x.id===submitted.id),'new TEST office admin reads the booking case through real authenticated API')
  response=await call('cases',{id:submitted.id,status:'reviewing'},2);check(response.ok,'TEST office updates new case status')
  response=await call('case-privacy',{id:submitted.id,privacy_action:'erase',confirm:true},2);check(response.status===403,'ordinary office admin cannot erase private case data')
 }
 const response=await fetch(base+'/api/home-ranking');const ranked=await response.json();check(response.ok&&!JSON.stringify(ranked).includes('last_sign_in_at')&&!JSON.stringify(ranked).includes('lastAction'),'real home ranking API succeeds without exposing auth/action timestamps')
}finally{
 for(const c of clients)await c.auth.signOut({scope:'local'}).catch(()=>{})
 await new Promise(r=>server.close(r))
 await writeFile('/private/tmp/haku115-official-api-result.json',JSON.stringify({checks,passed:checks.length,backend:'actual local API, real TEST Auth/JWT/DB/Storage; no Stripe',retainedNewTestAssets:assets.map(a=>({id:a.id,kind:a.kind})),deletedExistingData:false},null,2));console.log(JSON.stringify({passed:checks.length,checks}))
}
