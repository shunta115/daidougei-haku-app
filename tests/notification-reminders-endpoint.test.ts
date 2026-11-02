import {beforeEach,afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({send:vi.fn(),rpc:vi.fn(),updates:[] as any[],eligible:true,claimError:false,auditError:false}))
vi.mock('web-push',()=>({default:{setVapidDetails:vi.fn(),sendNotification:m.send}}))
vi.mock('../server/notifications/liveStart.js',()=>({validPushEndpoint:(s:string)=>s.startsWith('https://web.push.apple.com/')}))
vi.mock('../api/stripe/_shared.js',()=>({getAdminSupabase:()=>({rpc:m.rpc,from:(table:string)=>{const q:any={update:(patch:any)=>{m.updates.push({table,patch});return q},eq:()=>q,then:(resolve:any)=>resolve({error:m.auditError?{code:'db_error'}:null})};return q}})}))
import handler from '../server/notifications/reminders'
async function call(token='Bearer synthetic-secret',body={},method='POST'){const r:any={code:0,body:null,setHeader:vi.fn(),status(n:number){this.code=n;return this},json(v:any){this.body=v;return this}};await handler({method,headers:{authorization:token},body} as any,r);return r}
beforeEach(()=>{
 vi.clearAllMocks();m.updates=[];m.eligible=true;m.claimError=false;m.auditError=false;m.send.mockResolvedValue({statusCode:201})
 vi.stubEnv('NOTIFICATION_CRON_SECRET','synthetic-secret');vi.stubEnv('ENABLE_NOTIFICATION_REMINDERS','true');vi.stubEnv('ENABLE_NOTIFICATION_REMINDER_PUSH','true')
 for(const key of ['WEB_PUSH_SUBJECT','WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_PRIVATE_KEY'])vi.stubEnv(key,'fake')
 m.rpc.mockImplementation(async(name:string)=>({error:name==='claim_notification_jobs'&&m.claimError?{}:null,data:name==='claim_notification_jobs'?[{id:'job',subscription_id:'subscription',endpoint:'https://web.push.apple.com/fake',p256dh:'fake',auth:'fake',category:'live_reminder',event_key:'fake-event',expires_at:new Date(Date.now()+60000).toISOString(),payload:{title:'QA',body:'QA',url:'/?profile=qa'}}]:name==='notification_job_eligible'?m.eligible:0}))
})
afterEach(()=>vi.unstubAllEnvs())
it('requires scheduler authentication and rejects recipient injection',async()=>{expect((await call('')).code).toBe(401);expect((await call('Bearer synthetic-secret',{userId:'other'})).code).toBe(400);expect((await call(undefined,{},'GET')).code).toBe(405);expect(m.rpc).not.toHaveBeenCalled()})
it('collects in-app notifications with transport OFF and never claims a delivery',async()=>{vi.stubEnv('ENABLE_NOTIFICATION_REMINDER_PUSH','false');expect((await call()).body.sent).toBe(0);expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.send).not.toHaveBeenCalled()})
it('rechecks before delivery and records acceptance once',async()=>{expect((await call()).body.sent).toBe(1);expect(m.send).toHaveBeenCalledOnce();expect(m.rpc).toHaveBeenCalledWith('notification_job_eligible',{p_job_id:'job'})})
it('suppresses withdrawn consent and fails closed on claim errors',async()=>{m.eligible=false;expect((await call()).body.suppressed).toBe(1);expect(m.send).not.toHaveBeenCalled();m.claimError=true;expect((await call()).code).toBe(503)})
it('preserves an unknown attempt after timeout without resetting the queue',async()=>{m.send.mockRejectedValue(new Error('private provider details'));const r=await call();expect(r.body.unknown).toBe(1);expect(r.body.retry).toBe(false);expect(m.updates).toContainEqual({table:'notification_jobs',patch:{status:'unknown',last_error:'delivery_unconfirmed'}})})
it.each([404,410])('disables expired subscriptions for %s',async status=>{m.send.mockRejectedValue({statusCode:status});await call();expect(m.updates.some(x=>x.table==='push_subscriptions'&&x.patch.disabled_at)).toBe(true)})
it('does not treat audit errors as provider failures or permit retry',async()=>{m.auditError=true;const r=await call();expect(r.body.error).toBe('audit_unconfirmed');expect(r.body.retry).toBe(false);expect(m.send).toHaveBeenCalledOnce();expect(m.updates.some(x=>['queued','failed'].includes(x.patch.status))).toBe(false)})
