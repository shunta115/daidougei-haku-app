import {beforeEach,afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../src/platform/lib/supabase',()=>({requireSupabase:()=>({rpc:m.rpc})}))
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('VITE_SMART_PUSH_TEST_LIFECYCLE','true');vi.stubEnv('VITE_SUPABASE_URL','https://aeqskxxykzapgaudbeqa.supabase.co');m.rpc.mockImplementation(async(name:string)=>({data:name==='reserve_direct_live'?'session':true,error:null}))})
afterEach(()=>vi.unstubAllEnvs())
it('cannot activate for the production Supabase project',async()=>{vi.stubEnv('VITE_SUPABASE_URL','https://pmmtijwswzwhuriqhlep.supabase.co');expect((await import('../src/platform/lib/smartPushTestLifecycle')).smartPushTestLifecycle).toBe(false)})
it('reserves and activates through existing TEST RPCs without direct LIVE writes',async()=>{const api=await import('../src/platform/lib/smartPushTestLifecycle');expect(await api.startSmartPushTestLive('owner','Test')).toBe('session');expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(['reserve_direct_live','activate_direct_live'])})
it('closes an uncertain TEST activation without retrying it',async()=>{m.rpc.mockImplementation(async(name:string)=>name==='activate_direct_live'?{error:{code:'error'}}:{data:'session',error:null});const api=await import('../src/platform/lib/smartPushTestLifecycle');await expect(api.startSmartPushTestLive('owner')).rejects.toThrow();expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(['reserve_direct_live','activate_direct_live','finish_direct_live'])})
