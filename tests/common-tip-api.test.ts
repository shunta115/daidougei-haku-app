import { beforeEach, expect, it, vi } from 'vitest'
const f=vi.hoisted(()=>({ user:null as null|{id:string}, insert:vi.fn(), checkout:vi.fn() }))
vi.mock('../api/stripe/_shared.js',()=>({
 MIN_TIP_AMOUNT_YEN:100,PLATFORM_FEE_BPS:1500,getIntSetting:async()=>100,
 getOptionalAuthUser:async()=>f.user,getAppUrl:()=> 'https://app.example.test',
 getStripe:()=>({checkout:{sessions:{create:f.checkout}}}),
 getAdminSupabase:()=>({from:(_table:string)=>({
   select:()=>({eq:(_:string,id:string)=>({
     single:async()=>({data:{id,stage_name:id,is_approved:true,stripe_account_id:null},error:null}),
     maybeSingle:async()=>({data:{status:'active'},error:null}),
   })}),
   insert:(row:unknown)=>{ f.insert(row); return {select:()=>({single:async()=>({data:{id:'tip-fixture'},error:null})})} },
   update:()=>({eq:async()=>({error:null})}),
 })}),
}))
import handler from '../api/stripe/tip'
async function request(body:Record<string,unknown>){
 const res={code:0,body:{} as any,status(n:number){this.code=n;return this},json(x:unknown){this.body=x;return this},setHeader:vi.fn()}
 await handler({method:'POST',body,headers:{}} as any,res as any);return res
}
beforeEach(()=>{f.user=null;f.insert.mockClear();f.checkout.mockReset();f.checkout.mockResolvedValue({id:'cs_test_fixture',url:'https://checkout.example.test/'})})
it.each(['HARIBOW','PAUL','other-a','other-b'])('binds server amount and recipient metadata for %s in both auth states',async performerId=>{
 for(const user of [null,{id:'fan'}]){
  f.user=user
  const res=await request({performerId,fanId:user?.id,amountYen:1000,platform_fee_bps:0,stripe_account_id:'acct_attacker'})
  expect(res.code).toBe(200)
  expect(f.insert.mock.calls.at(-1)![0]).toMatchObject({performer_id:performerId,fan_id:user?.id??null,amount_cents:1000})
  const [session,options]=f.checkout.mock.calls.at(-1)!
  expect(session.line_items[0].price_data.unit_amount).toBe(1000)
  expect(session.metadata).toMatchObject({performer_id:performerId,fan_id:user?.id??'guest',platform_fee_bps:'1500',funding_model:'platform_separate'})
  expect(session.payment_intent_data).not.toHaveProperty('transfer_data')
  expect(options).not.toHaveProperty('stripeAccount')
 }
})
it.each([0,-100,99,100001,100.5,'1000',null])('rejects invalid amount %s before ledger creation',async amountYen=>{
 expect((await request({performerId:'performer',amountYen})).code).toBe(400)
 expect(f.insert).not.toHaveBeenCalled();expect(f.checkout).not.toHaveBeenCalled()
})
it('rejects forged payer identity for an anonymous request',async()=>{
 expect((await request({performerId:'performer',amountYen:1000,fanId:'victim'})).code).toBe(403)
 expect(f.insert).not.toHaveBeenCalled();expect(f.checkout).not.toHaveBeenCalled()
})
