import { expect,it } from 'vitest'
// @ts-expect-error Deliberately runnable without TypeScript tooling on an operator machine.
import { prepareHomeTestOffice,validateHomeTestSettings } from '../scripts/prepare-home-test-office.mjs'
const testRef='aeqskxxykzapgaudbeqa'
const key=(ref:string,role='service_role')=>`header.${Buffer.from(JSON.stringify({ref,role})).toString('base64url')}.signature`
it('defaults to an offline dry run and never creates/changes an account',async()=>{
 await expect(prepareHomeTestOffice(['--execute'],{})).rejects.toThrow('Explicit TEST')
 expect(await prepareHomeTestOffice([],{})).toMatchObject({project:testRef,mode:'DRY RUN / no network or writes'})
})
it('requires exact TEST target, explicit approval and matching project credentials',()=>{
 const env={HAKU_TEST_PERSISTENT_APPROVAL:`PR103:${testRef}`,SUPABASE_URL:`https://${testRef}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:key(testRef)}
 expect(validateHomeTestSettings(env).url).toBe(env.SUPABASE_URL)
 for(const patch of [{HAKU_TEST_PERSISTENT_APPROVAL:''},{SUPABASE_URL:'https://production.supabase.co'},{VERCEL_ENV:'production'},{SUPABASE_SERVICE_ROLE_KEY:key('other')},{SUPABASE_SERVICE_ROLE_KEY:key(testRef,'anon')},{SUPABASE_SERVICE_ROLE_KEY:'opaque'}])expect(()=>validateHomeTestSettings({...env,...patch})).toThrow()
})
