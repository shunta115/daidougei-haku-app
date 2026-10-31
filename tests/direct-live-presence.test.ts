import { beforeEach, expect, it, vi } from 'vitest'
const f=vi.hoisted(()=>({user:'owner' as string|null,operation:'op',ended:false,host:true,open:true,roomError:false,roomErrorCode:'' as string,heartbeat:'',stale:[] as any[],updates:[] as any[],filters:[] as any[],rpc:vi.fn(),deleteRoom:vi.fn()}))
vi.mock('../api/stripe/_shared',()=>({
 requireAuthUser:async(_req:any,res:any)=>{if(!f.user){res.status(401).json({error:'auth required'});return null}return{id:f.user}},
 getAdminSupabase:()=>({rpc:f.rpc,from:(table:string)=>{
  let patch:any
  const chain:any={select:()=>chain,limit:()=>chain,eq:(k:string,v:any)=>{f.filters.push([table,k,v]);return chain},is:()=>chain,lt:()=>chain,order:(k:string,v:any)=>{f.filters.push([table,'order',k,v]);return chain},gt:(k:string,v:any)=>{f.filters.push([table,'gt',k,v]);return chain},
   update:(p:any)=>{patch=p;f.updates.push([table,p]);return chain},insert:()=>chain,
   maybeSingle:async()=>({error:null,data:table==='direct_live_leases'?{id:'session',operation_id:f.operation,lifecycle_state:'live',ended_at:f.ended?'ended':null,heartbeat_at:f.heartbeat || new Date().toISOString()}:table==='performers'?{is_approved:true,is_live:true}:table==='profiles'?{role:'performer',status:'active'}:f.open?{id:'session',performer_id:'owner'}:null}),
   then:(resolve:any,reject:any)=>Promise.resolve({error:null,data:patch?[{id:'session'}]:f.stale}).then(resolve,reject)}
  return chain
 }})
}))
vi.mock('../api/ops/_guard',()=>({requireAdmin:async()=>({id:'admin'})}))
vi.mock('../api/livekit/_shared',()=>({getLiveKitConfig:()=>({url:'wss://test.invalid',apiKey:'test',apiSecret:'test'}),sessionRoomName:(p:string,s:string)=>`live-${p}-${s}`}))
vi.mock('livekit-server-sdk',()=>({RoomServiceClient:class{async listParticipants(){if(f.roomError)throw Object.assign(new Error('outage'),{code:f.roomErrorCode});return f.host?[{identity:'owner'},{identity:'viewer'}]:[{identity:'viewer'}]}deleteRoom=f.deleteRoom}}))
import handler from '../api/livekit/presence'
async function call(body:any,method='POST'){const res:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};await handler({method,headers:method==='GET'?{authorization:'Bearer watchdog-test'}:{},query:{},body} as any,res);return res.status.mock.calls.at(-1)?.[0]}
const heartbeat={performerId:'owner',sessionId:'session',operationId:'op'}
beforeEach(()=>{process.env.CRON_SECRET='watchdog-test';f.user='owner';f.operation='op';f.ended=false;f.host=true;f.open=true;f.roomError=false;f.roomErrorCode='';f.heartbeat='';f.stale=[];f.updates=[];f.filters=[];f.rpc.mockReset();f.rpc.mockResolvedValue({error:null,data:true});f.deleteRoom.mockReset();f.deleteRoom.mockResolvedValue(undefined)})
it('does not mutate anything for an unauthenticated host',async()=>{f.user=null;expect(await call(heartbeat)).toBe(401);expect(f.updates).toEqual([]);expect(f.rpc).not.toHaveBeenCalled()})
it('does not renew a different or ended operation',async()=>{f.operation='other';expect(await call(heartbeat)).toBe(409);f.operation='op';f.ended=true;expect(await call(heartbeat)).toBe(409);expect(f.updates).toEqual([])})
it('does not keep a ghost host or an operator-ended session alive',async()=>{f.host=false;expect(await call(heartbeat)).toBe(409);f.host=true;f.open=false;expect(await call(heartbeat)).toBe(409);expect(f.updates).toEqual([])})
it('renews only the current lease after verifying the SFU host; API outage does not invent a heartbeat',async()=>{
 f.roomError=true;expect(await call(heartbeat)).toBe(503);expect(f.updates).toEqual([])
 f.roomError=false;expect(await call(heartbeat)).toBe(200);expect(f.filters).toContainEqual(['direct_live_leases','id','session']);expect(f.rpc).toHaveBeenCalledWith('renew_direct_live_lease',{p_performer_id:'owner',p_session_id:'session',p_operation_id:'op'});expect(f.updates.every(([table])=>table!=='direct_live_leases')).toBe(true)
})
it('admin force-end uses the atomic session-scoped RPC and never a broad performer update',async()=>{
 expect(await call({action:'force-end',sessionId:'session'})).toBe(200)
 expect(f.rpc).toHaveBeenCalledWith('close_direct_live_session',{p_performer_id:'owner',p_session_id:'session',p_reason:'admin_forced'})
 expect(f.deleteRoom).toHaveBeenCalledWith('live-owner-session');expect(f.updates).toEqual([])
})

it('returns conflict when expiry/end wins the locked renewal, with no successful heartbeat acknowledgement',async()=>{
 f.rpc.mockResolvedValue({error:null,data:false});expect(await call(heartbeat)).toBe(409);expect(f.updates).toEqual([])
})

it('accepts a late browser heartbeat only after a verified connected host and a successful locked RPC',async()=>{
 f.heartbeat=new Date(Date.now()-300_000).toISOString();expect(await call(heartbeat)).toBe(200)
 expect(f.rpc).toHaveBeenCalledWith('renew_direct_live_lease',expect.objectContaining({p_session_id:'session'}))
})
it('does not infer host absence during an SFU API outage',async()=>{
 f.stale=[{id:'session',performer_id:'owner',heartbeat_at:'2026-10-30T00:00:00.000123Z'}];f.roomError=true
 expect(await call(null,'GET')).toBe(200)
 expect(f.rpc).toHaveBeenCalledWith('observe_direct_live_host',expect.objectContaining({p_host_connected:null}))
})
it('passes the original microsecond timestamp as CAS, and never closes LIVE directly from an observation',async()=>{
 const stamp='2026-10-30T00:00:00.000123Z';f.stale=[{id:'session',performer_id:'owner',heartbeat_at:stamp}]
 expect(await call(null,'GET')).toBe(200)
 expect(f.rpc).toHaveBeenCalledWith('observe_direct_live_host',{p_performer_id:'owner',p_session_id:'session',p_expected_heartbeat:stamp,p_host_connected:true})
 expect(f.rpc.mock.calls.some(c=>c[0]==='close_direct_live_session')).toBe(false)
})

it('rejects a watchdog with no configured secret before DB or SFU calls',async()=>{delete process.env.CRON_SECRET;expect(await call(null,'GET')).toBe(401);expect(f.rpc).not.toHaveBeenCalled()})

it('resets absence evidence on an unknown outage instead of treating a generic 404 as a missing room',async()=>{
 f.stale=[{id:'session',performer_id:'owner',heartbeat_at:'2026-10-30T00:00:00Z'}];f.roomError=true
 expect(await call(null,'GET')).toBe(200)
 expect(f.rpc).toHaveBeenCalledWith('observe_direct_live_host',expect.objectContaining({p_host_connected:null}))
})
it('accepts only semantic LiveKit not_found as verified absence',async()=>{
 f.stale=[{id:'session',performer_id:'owner',heartbeat_at:'2026-10-30T00:00:00Z'}];f.roomError=true;f.roomErrorCode='not_found'
 expect(await call(null,'GET')).toBe(200)
 expect(f.rpc).toHaveBeenCalledWith('observe_direct_live_host',expect.objectContaining({p_host_connected:false}))
})

it('uses ordered keyset pagination so fifty stale rows cannot starve later sessions',async()=>{
 const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
 f.stale=Array.from({length:50},(_,n)=>({id:id(n+1),performer_id:'owner',heartbeat_at:'2026-10-30T00:00:00Z'}))
 const res:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()}
 await handler({method:'GET',headers:{authorization:'Bearer watchdog-test'},query:{cursor:id(0)}} as any,res)
 expect(f.filters).toContainEqual(['direct_live_leases','order','id',{ascending:true}])
 expect(f.filters).toContainEqual(['direct_live_leases','gt','id',id(0)])
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({scanned:50,nextCursor:id(50)}))
 expect(f.rpc.mock.calls.filter(c=>c[0]==='observe_direct_live_host')).toHaveLength(50)
})
it('cleans the scoped SFU room only after the locked observation becomes terminal',async()=>{
 f.stale=[{id:'session',performer_id:'owner',heartbeat_at:'2026-10-30T00:00:00Z'}];f.host=false
 f.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='observe_direct_live_host'?'ended':0}))
 expect(await call(null,'GET')).toBe(200)
 expect(f.deleteRoom).toHaveBeenCalledWith('live-owner-session')
})
