import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({fetch:vi.fn()}))
vi.mock('../src/platform/lib/supabase',()=>({requireSupabase:vi.fn(),supabaseAuthHeaders:async()=>({Authorization:'Bearer fake'})}))
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('VITE_ENABLE_SMART_PUSH','true');vi.stubGlobal('fetch',mock.fetch)})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
const response=(remaining:boolean,waitingMs=0)=>({ok:true,json:async()=>({remaining,waitingMs,terminal:!remaining})})
it('continues only remaining untouched queue batches and stops at completion',async()=>{
 mock.fetch.mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(true)).mockResolvedValue(response(false))
 const {dispatchLivePush}=await import('../src/platform/lib/smartPush');await dispatchLivePush('session');await dispatchLivePush('session');expect(mock.fetch).toHaveBeenCalledTimes(3)
})
it('waits for the existing heartbeat instead of adding a polling timer',async()=>{
 mock.fetch.mockResolvedValueOnce(response(true,45000)).mockResolvedValue(response(false))
 const {dispatchLivePush}=await import('../src/platform/lib/smartPush');await dispatchLivePush('session');expect(mock.fetch).toHaveBeenCalledTimes(1);await dispatchLivePush('session');expect(mock.fetch).toHaveBeenCalledTimes(2)
})
it('prevents overlapping pumps and bounds each run to ten requests',async()=>{
 mock.fetch.mockImplementation(async()=>response(true));const {dispatchLivePush}=await import('../src/platform/lib/smartPush');await Promise.all([dispatchLivePush('session'),dispatchLivePush('session')]);expect(mock.fetch).toHaveBeenCalledTimes(10)
})
it('does not automatically repeat a failed HTTP request',async()=>{
 mock.fetch.mockResolvedValue({ok:false});const {dispatchLivePush}=await import('../src/platform/lib/smartPush');await dispatchLivePush('session');expect(mock.fetch).toHaveBeenCalledTimes(1)
})
