import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({user:'owner',room:vi.fn(),performer:{id:'owner',stage_name:'Test',is_live:false,is_approved:true}}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:m.user?{id:m.user,email:'fake@example.test'}:null}})},from:(table:string)=>{const b:any={select:()=>b,eq:()=>b,maybeSingle:async()=>({data:table==='performers'?m.performer:{status:'active',display_name:'Test'},error:null})};return b}})}))
vi.mock('../api/livekit/_shared.js',()=>({getLiveKitConfig:()=>({url:'https://live.example.test'}),createLiveKitToken:m.room,roomNameForPerformer:(id:string)=>`performer-${id}`}))
import handler from '../api/livekit/token'
async function call(body:any){const r:any={code:0,body:null,status(n:number){this.code=n;return this},json(b:any){this.body=b;return this}};await handler({method:'POST',headers:{authorization:'Bearer fake'},body} as any,r);return r}
beforeEach(()=>{vi.clearAllMocks();m.user='owner';m.performer.is_live=false;m.room.mockResolvedValue('fake-jwt');vi.stubEnv('ENABLE_SMART_PUSH','true');vi.stubEnv('SUPABASE_URL','https://db.example.test');vi.stubEnv('SUPABASE_ANON_KEY','fake')})
afterEach(()=>vi.unstubAllEnvs())
it('publishes rehearsal into a different room without setting public LIVE state',async()=>{expect((await call({performerId:'owner',asHost:true,rehearsal:true})).code).toBe(200);expect(m.room.mock.calls[0][0].room).toBe('performer-owner-private-rehearsal');expect(m.performer.is_live).toBe(false)})
it('does not issue a rehearsal room token to viewers or other performers',async()=>{expect((await call({performerId:'owner',asHost:false,rehearsal:true})).code).toBe(403);m.user='other';expect((await call({performerId:'owner',asHost:true,rehearsal:true})).code).toBe(403);expect(m.room).not.toHaveBeenCalled()})
it('keeps rehearsal disabled before release',async()=>{vi.stubEnv('ENABLE_SMART_PUSH','');expect((await call({performerId:'owner',asHost:true,rehearsal:true})).code).toBe(403)})
it('does not let an anonymous public viewer into a rehearsal',async()=>{m.user='';expect((await call({performerId:'owner',asHost:false})).code).toBe(403);expect(m.room).not.toHaveBeenCalled()})
