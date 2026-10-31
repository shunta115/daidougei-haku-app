import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({user:'owner',send:vi.fn(),rpc:vi.fn(),participants:vi.fn(),updates:[] as any[],session:{id:'30000000-0000-4000-8000-000000000001',performer_id:'owner',ended_at:null as string|null,follower_push_requested:true},eligible:true}))
vi.mock('web-push',()=>({default:{setVapidDetails:vi.fn(),sendNotification:mock.send}}))
vi.mock('livekit-server-sdk',()=>({RoomServiceClient:class{listParticipants=mock.participants}}))
vi.mock('../api/livekit/_shared.js',()=>({getLiveKitConfig:()=>({url:'https://live.example.test',apiKey:'fake',apiSecret:'fake'}),roomNameForPerformer:(id:string)=>`performer-${id}`}))
vi.mock('../api/stripe/_shared.js',()=>({
 requireAuthUser:async(_:unknown,res:any)=>{if(!mock.user){res.status(401).json({});return null};return{id:mock.user}},
 getAdminSupabase:()=>({rpc:mock.rpc,from:(table:string)=>{
  const b:any={select:()=>b,eq:()=>b,is:()=>b,maybeSingle:async()=>({data:mock.session,error:null}),update:(patch:any)=>{mock.updates.push({table,patch});return b},then:(resolve:any)=>resolve({error:null})};return b
 }})
}))
import handler,{liveHostHealthy} from '../server/notifications/liveStart'
const id='30000000-0000-4000-8000-000000000001'
async function run(method='POST',body:any={liveSessionId:id}){const r:any={code:0,body:null,setHeader:vi.fn(),status(n:number){this.code=n;return this},json(b:any){this.body=b;return this}};await handler({method,body} as any,r);return r}
beforeEach(()=>{
 vi.clearAllMocks();mock.updates=[];mock.user='owner';mock.eligible=true;mock.session={id,performer_id:'owner',ended_at:null,follower_push_requested:true}
 for(const key of ['ENABLE_SMART_PUSH','ENABLE_LIVE_START_WEB_PUSH'])vi.stubEnv(key,'true')
 for(const key of ['WEB_PUSH_SUBJECT','WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_PRIVATE_KEY'])vi.stubEnv(key,'fake')
 mock.send.mockResolvedValue({statusCode:201});mock.participants.mockResolvedValue([{identity:'owner',tracks:[{type:1,muted:false}]}])
 mock.rpc.mockImplementation(async(name:string)=>({data:name==='enqueue_live_start_push'?'event':name==='live_push_delivery_eligible'?mock.eligible:[{delivery_id:'delivery',subscription_id:'sub',endpoint:'https://push.example.test/fake',p256dh:'fake',auth:'fake',payload:{stageName:'Performer'}}],error:null}))
})
afterEach(()=>vi.unstubAllEnvs())
it('defaults off without touching optional queue',async()=>{vi.stubEnv('ENABLE_SMART_PUSH','');expect((await run()).code).toBe(202);expect(mock.rpc).not.toHaveBeenCalled();expect(mock.send).not.toHaveBeenCalled()})
it('rejects other owners and unauthenticated requests',async()=>{mock.user='other';expect((await run()).code).toBe(403);mock.user='';expect((await run()).code).toBe(401);expect(mock.send).not.toHaveBeenCalled()})
it('requires an ongoing session with explicit broadcaster intent',async()=>{mock.session.follower_push_requested=false;expect((await run()).body.sent).toBe(0);expect(mock.rpc).not.toHaveBeenCalled();mock.session.follower_push_requested=true;mock.session.ended_at='ended';expect((await run()).body.sent).toBe(0)})
it('cancels notifications on missing host, muted video or provider outage',async()=>{
 mock.participants.mockResolvedValue([]);expect((await run()).body.suppressed).toBe(true);expect(mock.updates.some(u=>u.table==='live_push_events'&&u.patch.cancelled_at)).toBe(true);expect(mock.send).not.toHaveBeenCalled()
 expect(liveHostHealthy([{identity:'owner',tracks:[{type:1,muted:true}]}],'owner')).toBe(false)
})
it('sends only claimed eligible subscriptions with short TTL and session-specific route',async()=>{
 expect((await run()).body.sent).toBe(1);expect(mock.rpc).toHaveBeenCalledWith('claim_live_start_push_deliveries',{p_event_id:'event',p_limit:5})
 expect(mock.send).toHaveBeenCalledTimes(1);const payload=JSON.parse(mock.send.mock.calls[0][1]);expect(payload.url).toBe(`/?watch=owner&liveSession=${id}`);expect(payload.tag).toBe(`live-${id}`)
})
it('rechecks revoked eligibility immediately before delivery',async()=>{mock.eligible=false;expect((await run()).body.sent).toBe(0);expect(mock.send).not.toHaveBeenCalled()})
it('records unknown outcomes without retrying',async()=>{mock.send.mockRejectedValue(new Error('private-provider-data'));const r=await run();expect(r.body.failed).toBe(1);expect(r.body.retry).toBe(false);expect(mock.send).toHaveBeenCalledTimes(1);expect(mock.updates).toContainEqual({table:'live_push_deliveries',patch:{status:'failed',last_error:'delivery_unconfirmed'}})})
it.each([404,410])('disables expired subscription on %i',async code=>{mock.send.mockRejectedValue({statusCode:code});await run();expect(mock.updates.some(u=>u.table==='push_subscriptions'&&u.patch.disabled_at)).toBe(true)})
it('does not claim or send when enqueue fails',async()=>{mock.rpc.mockResolvedValue({error:{code:'PGRST202'},data:null});expect((await run()).code).toBe(503);expect(mock.send).not.toHaveBeenCalled()})
it('permanently cancels the event if publisher disappears after claim',async()=>{
  mock.participants.mockResolvedValueOnce([{identity:'owner',tracks:[{type:1,muted:false}]}]).mockResolvedValueOnce([])
  expect((await run()).body.sent).toBe(0);expect(mock.send).not.toHaveBeenCalled();expect(mock.updates.some(u=>u.table==='live_push_events'&&u.patch.cancelled_at)).toBe(true)
})
