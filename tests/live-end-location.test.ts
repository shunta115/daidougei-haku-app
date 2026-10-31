import { beforeEach, expect, it, vi } from 'vitest'
const fake=vi.hoisted(()=>({ rpc:vi.fn() }))
vi.mock('../src/platform/lib/supabase',()=>({ requireSupabase:()=>({rpc:fake.rpc}),supabaseAuthHeaders:async()=>({}) }))
vi.mock('../src/platform/lib/track',()=>({trackProductEvent:vi.fn()}))
import { endLive } from '../src/platform/lib/api'
beforeEach(()=>{fake.rpc.mockReset();fake.rpc.mockResolvedValue({error:null});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}))})
it('closes only the expected session through the atomic location-clearing RPC',async()=>{
 await endLive('performer-1','session-1');expect(fake.rpc).toHaveBeenCalledWith('finish_direct_live',{p_performer_id:'performer-1',p_session_id:'session-1'})
})
it('surfaces session-close failure for retry instead of reporting success',async()=>{
 fake.rpc.mockResolvedValue({error:new Error('session close unavailable')});await expect(endLive('performer-1','session-1')).rejects.toThrow('session close unavailable')
})
