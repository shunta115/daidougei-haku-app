import { beforeEach, expect, it, vi } from 'vitest'
const f=vi.hoisted(()=>({user:'owner' as string|null,operation:'op',ended:false,host:true,open:true,roomError:false,updates:[] as any[],filters:[] as any[],rpc:vi.fn(),deleteRoom:vi.fn()}))
vi.mock('../api/stripe/_shared',()=>({
 requireAuthUser:async(_req:any,res:any)=>{if(!f.user){res.status(401).json({error:'auth required'});return null}return{id:f.user}},
 getAdminSupabase:()=>({rpc:f.rpc,from:(table:string)=>{
  let patch:any
  const chain:any={select:()=>chain,eq:(k:string,v:any)=>{f.filters.push([table,k,v]);return chain},is:()=>chain,lt:()=>chain,
   update:(p:any)=>{patch=p;f.updates.push([table,p]);return chain},insert:()=>chain,
   maybeSingle:async()=>({error:null,data:table==='direct_live_leases'?{id:'session',operation_id:f.operation,lifecycle_state:'live',ended_at:f.ended?'ended':null,heartbeat_at:new Date().toISOString()}:table==='performers'?{is_approved:true,is_live:true}:table==='profiles'?{role:'performer',status:'active'}:f.open?{id:'session',performer_id:'owner'}:null}),
   then:(resolve:any,reject:any)=>Promise.resolve({error:null,data:patch?[{id:'session'}]:null}).then(resolve,reject)}
  return chain
 }})
}))
vi.mock('../api/ops/_guard',()=>({requireAdmin:async()=>({id:'admin'})}))
vi.mock('../api/livekit/_shared',()=>({getLiveKitConfig:()=>({url:'wss://test.invalid',apiKey:'test',apiSecret:'test'}),sessionRoomName:(p:string,s:string)=>`live-${p}-${s}`}))
vi.mock('livekit-server-sdk',()=>({RoomServiceClient:class{async listParticipants(){if(f.roomError)throw new Error('outage');return f.host?[{identity:'owner'},{identity:'viewer'}]:[{identity:'viewer'}]}deleteRoom=f.deleteRoom}}))
import handler from '../api/livekit/presence'
async function call(body:any){const res:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};await handler({method:'POST',headers:{},query:{},body} as any,res);return res.status.mock.calls.at(-1)?.[0]}
const heartbeat={performerId:'owner',sessionId:'session',operationId:'op'}
beforeEach(()=>{f.user='owner';f.operation='op';f.ended=false;f.host=true;f.open=true;f.roomError=false;f.updates=[];f.filters=[];f.rpc.mockReset();f.rpc.mockResolvedValue({error:null,data:true});f.deleteRoom.mockReset();f.deleteRoom.mockResolvedValue(undefined)})
it('does not mutate anything for an unauthenticated host',async()=>{f.user=null;expect(await call(heartbeat)).toBe(401);expect(f.updates).toEqual([]);expect(f.rpc).not.toHaveBeenCalled()})
it('does not renew a different or ended operation',async()=>{f.operation='other';expect(await call(heartbeat)).toBe(409);f.operation='op';f.ended=true;expect(await call(heartbeat)).toBe(409);expect(f.updates).toEqual([])})
it('does not keep a ghost host or an operator-ended session alive',async()=>{f.host=false;expect(await call(heartbeat)).toBe(409);f.host=true;f.open=false;expect(await call(heartbeat)).toBe(409);expect(f.updates).toEqual([])})
it('renews only the current lease after verifying the SFU host; API outage does not invent a heartbeat',async()=>{
 f.roomError=true;expect(await call(heartbeat)).toBe(503);expect(f.updates).toEqual([])
 f.roomError=false;expect(await call(heartbeat)).toBe(200);expect(f.filters).toContainEqual(['direct_live_leases','id','session']);expect(f.filters).toContainEqual(['direct_live_leases','operation_id','op']);expect(f.updates[0][0]).toBe('direct_live_leases')
})
it('admin force-end uses the atomic session-scoped RPC and never a broad performer update',async()=>{
 expect(await call({action:'force-end',sessionId:'session'})).toBe(200)
 expect(f.rpc).toHaveBeenCalledWith('close_direct_live_session',{p_performer_id:'owner',p_session_id:'session',p_reason:'admin_forced'})
 expect(f.deleteRoom).toHaveBeenCalledWith('live-owner-session');expect(f.updates).toEqual([])
})
