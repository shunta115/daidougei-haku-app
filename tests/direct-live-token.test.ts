import { beforeEach, expect, it, vi } from 'vitest'
const f=vi.hoisted(()=>({user:'owner' as string|null,approved:true,live:true,name:'Fan',session:{id:'session-1',operation_id:'op-1',lifecycle_state:'live',heartbeat_at:new Date().toISOString()},token:vi.fn()}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({
 auth:{getUser:async()=>({data:{user:f.user?{id:f.user,email:'private@example.invalid'}:null}})},
 from:(table:string)=>{const chain:any={select:()=>chain,eq:()=>chain,is:()=>chain,maybeSingle:async()=>({data:table==='performers'?{id:'owner',stage_name:'HARIBOW',is_approved:f.approved,is_live:f.live}:table==='profiles'?{status:'active',display_name:f.name}:f.session,error:null})};return chain},
})}))
vi.mock('../api/livekit/_shared',()=>({getLiveKitConfig:()=>({url:'wss://test.invalid'}),sessionRoomName:(p:string,s:string)=>`live-${p}-${s}`,createLiveKitToken:f.token}))
import handler from '../api/livekit/token'
async function call(body:any,authorization?:string){const res:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};await handler({method:'POST',headers:{authorization},body} as any,res);return {status:res.status.mock.calls.at(-1)?.[0],body:res.json.mock.calls.at(-1)?.[0]}}
beforeEach(()=>{f.user='owner';f.approved=true;f.live=true;f.name='Fan';f.session={id:'session-1',operation_id:'op-1',lifecycle_state:'live',heartbeat_at:new Date().toISOString()};f.token.mockReset();f.token.mockResolvedValue('mock-token');vi.stubEnv('SUPABASE_URL','https://test.invalid');vi.stubEnv('VITE_SUPABASE_ANON_KEY','test-only')})
it('requires authentication and the exact host reservation before signing',async()=>{
 expect((await call({performerId:'owner',asHost:true})).status).toBe(401)
 expect((await call({performerId:'owner',asHost:true,sessionId:'session-1',operationId:'other'},'Bearer mock')).status).toBe(409)
 expect(f.token).not.toHaveBeenCalled()
})
it('rejects a different performer and expired lease',async()=>{
 f.user='other';expect((await call({performerId:'owner',asHost:true},'Bearer mock')).status).toBe(403)
 f.user='owner';f.session.heartbeat_at=new Date(Date.now()-91_000).toISOString()
 expect((await call({performerId:'owner',asHost:true,sessionId:'session-1',operationId:'op-1'},'Bearer mock')).status).toBe(409)
})
it('signs a publisher only for the owned session room',async()=>{
 expect((await call({performerId:'owner',asHost:true,sessionId:'session-1',operationId:'op-1'},'Bearer mock')).status).toBe(200)
 expect(f.token).toHaveBeenCalledWith(expect.objectContaining({room:'live-owner-session-1',canPublish:true,identity:'owner'}))
})
it('preparation is invisible to viewers; viewer identity never collides with host',async()=>{
 f.session.lifecycle_state='preparing';expect((await call({performerId:'owner',asHost:false})).status).toBe(409)
 f.session.lifecycle_state='live';const a=await call({performerId:'owner',asHost:false},'Bearer mock'),b=await call({performerId:'owner',asHost:false},'Bearer mock')
 expect(a.status).toBe(200);expect(a.body.identity).not.toBe('owner');expect(a.body.identity).not.toBe(b.body.identity)
 expect(f.token).toHaveBeenLastCalledWith(expect.objectContaining({canPublish:false,room:'live-owner-session-1'}))
})

it('does not disclose a viewer email in public participant metadata when the display name is empty',async()=>{
 f.name='';expect((await call({performerId:'owner',asHost:false},'Bearer mock')).status).toBe(200)
 expect(f.token).toHaveBeenCalledWith(expect.objectContaining({name:'Guest',canPublish:false}))
})
