import { beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const fake = vi.hoisted(() => ({ profile: { role:'fan',status:'active',email:'test@example.invalid' }, member: null as null | {status:string;permission:string}, memberError: null as null | Error }))
vi.mock('../api/stripe/_shared.js',()=>({
  requireAuthUser: async()=>({id:'verified-user',email:'test@example.invalid',user_metadata:{role:'admin'}}),
  getAdminSupabase:()=>({from:(table:string)=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='profiles'?fake.profile:fake.member,error:table==='admin_members'?fake.memberError:null})})})})}),
}))
import { requireAdmin } from '../api/ops/_guard'
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()}) as unknown as VercelResponse
beforeEach(()=>{
  fake.profile={role:'fan',status:'active',email:'test@example.invalid'};fake.member=null;fake.memberError=null
  vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('HAKU_ADMIN_IDENTIFIERS','')
})
it('does not trust user-editable admin metadata even for an allowlisted email',async()=>{
  vi.stubEnv('HAKU_ADMIN_IDENTIFIERS','test@example.invalid');const response=res()
  expect(await requireAdmin({} as VercelRequest,response)).toBeNull();expect(response.status).toHaveBeenCalledWith(403)
})
it('requires active server-side membership for non-bootstrap administrators',async()=>{
  fake.profile.role='admin';const response=res()
  expect(await requireAdmin({} as VercelRequest,response)).toBeNull()
  fake.member={status:'active',permission:'admin'}
  expect((await requireAdmin({} as VercelRequest,res()))?.adminPermission).toBe('admin')
  fake.memberError=new Error('lookup failed')
  expect(await requireAdmin({} as VercelRequest,res())).toBeNull()
})
it('rejects a suspended administrator even if allowlisted',async()=>{
  fake.profile={...fake.profile,role:'admin',status:'suspended'};vi.stubEnv('HAKU_ADMIN_IDENTIFIERS','verified-user')
  expect(await requireAdmin({} as VercelRequest,res())).toBeNull()
})
