import { beforeAll,afterAll,it,expect,vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { readFileSync } from 'node:fs'
// Metadata tests use the source HTML shell so test execution does not depend on a prior build.
vi.mock('node:fs/promises', async()=>{const {readFileSync}=await import('node:fs');return {readFile:async()=>readFileSync('index.html','utf8')}})
vi.mock('../api/stripe/_shared.js',async()=>import('./fixtures/official-home/backend'))
import { officialHome } from '../server/officialHome'
import { db,ready,OWNER,OTHER,ADMIN,SUPER,objects,storageState } from './fixtures/official-home/backend'
async function call(action:string,{method='POST',user='',body={},query={}}:{method?:string;user?:string;body?:Record<string,unknown>;query?:Record<string,unknown>}={}){
 const result={status:200,body:undefined as any,headers:{} as Record<string,string>}
 const req={method,query:{resource:'official-home',homeAction:action,...query},body,headers:{host:'localhost','content-type':'application/json',...(user?{authorization:'Bearer '+user}:{})}}
 const res:any={status:(n:number)=>{result.status=n;return res},json:(data:unknown)=>{result.body=data;return res},send:(data:unknown)=>{result.body=data;return res},end:()=>res,setHeader:(key:string,value:string)=>{result.headers[key]=value;return res}}
 await officialHome(req as any,res);return result
}
beforeAll(async()=>{vi.stubEnv('HOME_ENABLED','true');vi.stubEnv('HOME_TEST_IP','127.0.0.1');vi.stubEnv('BOOKING_RATE_LIMIT_SECRET','local-only-test-secret-with-32-characters');vi.stubEnv('VERCEL','');vi.stubEnv('VERCEL_ENV','test');await ready},60000)
afterAll(async()=>{vi.unstubAllEnvs();await db.close()})
it('defaults disabled and rejects mismatched ownership and anonymous mutations',async()=>{
 vi.stubEnv('HOME_ENABLED','false');expect((await call('edit',{method:'GET',user:OWNER})).status).toBe(503);vi.stubEnv('HOME_ENABLED','true')
 expect((await call('save',{body:{performer_id:OWNER,details:{},published:true}})).status).toBe(401)
 expect((await call('save',{user:OTHER,body:{performer_id:OWNER,details:{},published:true}})).status).toBe(403)
})
it('stores own detail data and returns it anonymously only while public',async()=>{
 expect((await call('save',{user:OWNER,body:{details:{tagline:'API TEST'},published:true}})).status).toBe(200)
 const result=await call('read',{method:'GET',query:{performerId:OWNER}})
 expect(result.body.home.details.tagline).toBe('API TEST');expect(JSON.stringify(result.body)).not.toContain('email')
})
let pdfId=''
it('validates actual PDF, keeps new file private and makes retries idempotent',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const base64=Buffer.from(await pdf.save()).toString('base64')
 const payload={kind:'pdf',title:'API TEST PDF',base64,upload_id:'40000000-0000-4000-8000-000000000001'}
 const first=await call('upload',{user:OWNER,body:payload});expect(first.status).toBe(201);pdfId=first.body.asset.id
 expect(objects.size).toBe(1)
 const duplicate=await call('upload',{user:OWNER,body:payload});expect(duplicate.status).toBe(200);expect(duplicate.body.asset.id).toBe(pdfId);expect(objects.size).toBe(1)
 expect((await call('file',{method:'GET',query:{performerId:OWNER,assetId:pdfId}})).status).toBe(404)
 expect((await call('upload',{user:OWNER,body:{kind:'pdf',title:'Fake',base64:Buffer.from('%PDF-1.7\n%%EOF').toString('base64')}})).status).toBe(400)
})
it('denies cross-owner file edits and deletes, then serves PDF bytes without auth',async()=>{
 expect((await call('asset',{user:OTHER,body:{id:pdfId,published:true}})).status).toBe(404)
 expect((await call('delete',{user:OTHER,body:{id:pdfId}})).status).toBe(404)
 expect((await call('asset',{user:OWNER,body:{id:pdfId,published:true,title:'../安全な宣材\r\n'}})).status).toBe(200)
 const result=await call('file',{method:'GET',query:{performerId:OWNER,assetId:pdfId,download:'1'}})
 expect(result.status).toBe(200);expect(result.body.subarray(0,5).toString()).toBe('%PDF-');expect(result.headers['Content-Disposition']).not.toMatch(/[\r\n]/);expect(result.headers['Content-Disposition']).toContain('attachment')
})
it('revokes byte access immediately when page is hidden, and rejects private-test profiles',async()=>{
 await call('save',{user:OWNER,body:{details:{},published:false}})
 expect((await call('file',{method:'GET',query:{performerId:OWNER,assetId:pdfId}})).status).toBe(404)
 await call('save',{user:OWNER,body:{details:{},published:true}})
 await db.exec(`update performers set is_private_test=true where id='${OWNER}'`)
 expect((await call('read',{method:'GET',query:{performerId:OWNER}})).status).toBe(404)
 await db.exec(`update performers set is_private_test=false where id='${OWNER}'`)
})
it('validates JPEG signatures and creates private thumbnails',async()=>{
 const jpg=readFileSync('public/official/media/media-stage-1.jpg').toString('base64')
 const result=await call('upload',{user:OWNER,body:{kind:'photo',title:'Photo',base64:jpg,thumbnail:Buffer.from([255,216,255,217]).toString('base64')}})
 expect(result.status).toBe(201);expect(result.body.asset.published).toBe(false)
 expect((await call('upload',{user:OWNER,body:{kind:'photo',title:'Fake',base64:Buffer.from('<script>bad</script>').toString('base64')}})).status).toBe(400)
})
it('booking reaches only office; office case API rejects performers and anonymous users',async()=>{
 const payload={performer_id:OWNER,organization:'TEST COMPANY',contact:'TEST CONTACT',email:'test@example.invalid',phone:'090-0000-0000',date:'2099-10-31',venue:'TEST',event:'TEST EVENT',duration:'30分',budget:'相談',notes:''}
 expect((await call('booking',{body:{performer_id:OWNER,payload,started_at:Date.now()-5000,website:'bot'}})).status).toBe(400)
 const result=await call('booking',{body:{performer_id:OWNER,payload,started_at:Date.now()-5000,website:''}})
 expect(result.status).toBe(201);expect(result.body.id).toBeTruthy()
 expect((await db.query('select user_id from notifications')).rows).toEqual([{user_id:ADMIN},{user_id:SUPER}])
 expect((await call('cases')).status).toBe(401);expect((await call('cases',{user:OWNER})).status).toBe(403)
 const cases=await call('cases',{user:ADMIN});expect(cases.status).toBe(200);expect(cases.body.cases[0].payload.email).toBe(payload.email)
 expect((await call('cases',{user:ADMIN,body:{id:result.body.id,status:'reviewing'}})).body.cases[0].status).toBe('reviewing')
})
it('enforces existing member disable/allowlist boundaries without exposing membership details',async()=>{
 await db.exec(`update admin_members set status='disabled' where user_id='${ADMIN}'`)
 expect((await call('cases',{user:ADMIN})).status).toBe(403)
 vi.stubEnv('HAKU_ADMIN_IDENTIFIERS',ADMIN)
 expect((await call('cases',{user:ADMIN})).status).toBe(200)
 vi.stubEnv('HAKU_ADMIN_IDENTIFIERS','')
 await db.exec(`update admin_members set status='active' where user_id='${ADMIN}'`)
 expect((await call('cases',{user:ADMIN})).body.canManagePrivacy).toBe(false)
 expect((await call('cases',{user:SUPER})).body.canManagePrivacy).toBe(true)
 expect((await call('cases',{user:OWNER,body:{adminPermission:'super_admin'}})).status).toBe(403)
})
it('restricts privacy writes to super_admin and refuses erasure during legal hold',async()=>{
 const caseId=(await call('cases',{user:ADMIN})).body.cases[0].id
 expect((await call('case-privacy',{user:ADMIN,body:{id:caseId,privacy_action:'erase',confirm:true}})).status).toBe(403)
 expect((await call('retention',{user:ADMIN,body:{execute:true}})).status).toBe(403)
 expect((await call('cleanup',{user:ADMIN,body:{confirm:true}})).status).toBe(403)
 expect((await call('case-privacy',{user:SUPER,body:{id:caseId,privacy_action:'hold',basis:'statutory_record',confirm:true}})).status).toBe(200)
 expect((await call('case-privacy',{user:SUPER,body:{id:caseId,privacy_action:'erase',confirm:true}})).status).toBe(400)
 expect((await call('retention',{user:ADMIN,body:{execute:false}})).status).toBe(200)
 expect((await call('case-privacy',{user:SUPER,body:{id:caseId,privacy_action:'release_hold',confirm:true}})).status).toBe(200)
 expect((await call('case-privacy',{user:SUPER,body:{id:caseId,privacy_action:'erase',confirm:true}})).status).toBe(200)
 const row=(await call('cases',{user:ADMIN})).body.cases[0]
 expect(row.payload).toEqual({});expect(row.performer_id).toBeNull();expect(row.anonymized_at).toBeTruthy()
 expect((await call('cases',{user:ADMIN,body:{id:caseId,status:'booked'}})).status).toBe(400)
 expect(JSON.stringify((await db.query('select * from haku_home_private.case_audit')).rows)).not.toContain('test@example.invalid')
})
it('server HTML contains escaped SEO metadata, canonical and structured data',async()=>{
 vi.stubEnv('PUBLIC_SITE_URL','https://example.invalid')
 await db.exec(`update performers set stage_name='<script>TEST</script>' where id='${OWNER}'`)
 const page=await call('page',{method:'GET',query:{performerId:OWNER}})
 expect(page.status).toBe(200);expect(page.body).toContain('&lt;script&gt;TEST&lt;/script&gt;');expect(page.body).toContain('application/ld+json');expect(page.body).toContain('https://example.invalid/performer/'+OWNER);expect(page.body).not.toContain('<script>TEST</script>')
})
it('preview rejects any DB host except the designated TEST project',async()=>{
 vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('SUPABASE_URL','https://production.invalid')
 expect((await call('read',{method:'GET',query:{performerId:OWNER}})).status).toBe(503)
 vi.stubEnv('VERCEL_ENV','test')
})
it('deletion immediately revokes access, survives Storage outage and drains retries only as super_admin',async()=>{
 storageState.failRemovals=true
 const previousBytes=objects.size
 expect((await call('delete',{user:OWNER,body:{id:pdfId}})).status).toBe(200)
 expect((await call('file',{method:'GET',query:{performerId:OWNER,assetId:pdfId}})).status).toBe(404)
 expect(objects.size).toBe(previousBytes)
 storageState.failRemovals=false
 await db.exec(`update haku_home_private.storage_cleanup set lease_until=now()-interval '1 second' where processed_at is null`)
 const cleanup=await call('cleanup',{user:SUPER,body:{confirm:true}})
 expect(cleanup.status).toBe(200);expect(cleanup.body.processed).toBe(1);expect(objects.size).toBe(previousBytes-1)
 expect((await db.query('select object_path,performer_id from haku_home_private.storage_cleanup where processed_at is not null')).rows).toEqual([{object_path:null,performer_id:null}])
 const pdf=await PDFDocument.create();pdf.addPage()
 expect((await call('upload',{user:OWNER,body:{upload_id:pdfId,kind:'pdf',title:'forbidden reuse',base64:Buffer.from(await pdf.save()).toString('base64')}})).status).toBe(400)
})
