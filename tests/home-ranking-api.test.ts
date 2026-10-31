import { describe, it, expect, vi, beforeEach } from 'vitest'
const state = vi.hoisted(() => ({ fail: false, calls: [] as {table:string; op:string; args:unknown[]}[] }))
vi.mock('../api/stripe/_shared.js', () => ({ getAdminSupabase: () => db }))
import handler, { readHomeRanking } from '../server/homeRanking'
const db = {
  auth: {admin: { getUserById: vi.fn(async () => ({data:{user:{last_sign_in_at:'2026-10-30T00:00:00Z',email:'PRIVATE_EMAIL'}},error:null})) }},
  from: (table: string) => {
    const result = table === 'performers' ? [{id:'a',stage_name:'公開',is_approved:true,is_private_test:false,stripe_onboarding_complete:false}] : table === 'product_events' ? [{created_at:'2026-10-31T00:00:00Z',user_id:'PRIVATE_ACTOR'}] : []
    const builder: any = {then: (resolve:any) => Promise.resolve({data:result,error:state.fail ? new Error('PRIVATE DB ERROR'):null}).then(resolve)}
    for (const op of ['select','eq','is','in','order','range','lte','limit']) builder[op]=(...args: unknown[])=>{state.calls.push({table,op,args});return builder}
    return builder
  },
}
const response=()=>{ const res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res }
describe('private server aggregation',()=>{
  beforeEach(()=>{state.calls=[];state.fail=false})
  it('uses actor user_id, active/approved public candidates, and explicit FK',async()=>{
    const result=await readHomeRanking(db as any,Date.parse('2026-10-31T03:00:00Z'))
    expect(result.featured).toEqual(['a'])
    expect(state.calls).toContainEqual({table:'product_events',op:'eq',args:['user_id','a']})
    expect(state.calls.some(c=>c.table==='product_events'&&c.op==='eq'&&c.args[0]==='performer_id')).toBe(false)
    expect(state.calls).toContainEqual({table:'performers',op:'eq',args:['profiles.status','active']})
    expect(state.calls.find(c=>c.table==='performers'&&c.op==='select')?.args[0]).toContain('profiles!performers_id_fkey!inner')
    expect(state.calls).toContainEqual({table:'performer_appearances',op:'eq',args:['status','published']})
    expect(state.calls).toContainEqual({table:'event_slots',op:'eq',args:['events.status','published']})
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|2026|last_sign|created_at|user_id/)
  })
  it('keeps verified activity when an optional Auth lookup fails without inventing a login',async()=>{
    db.auth.admin.getUserById.mockRejectedValueOnce(new Error('PRIVATE AUTH FAILURE'))
    const result=await readHomeRanking(db as any,Date.parse('2026-10-31T03:00:00Z'))
    expect(result.featured).toEqual(['a'])
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|last_sign|created_at/)
  })
  it('returns a generic error with no stale ranking or raw DB error on failure',async()=>{
    state.fail=true
    const res=response();await handler({method:'GET'} as any,res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('PRIVATE')
  })
  it('does not execute mutations or accept non-GET requests',async()=>{
    const res=response();await handler({method:'POST'} as any,res)
    expect(res.status).toHaveBeenCalledWith(405)
    expect(state.calls).toHaveLength(0)
  })
})
