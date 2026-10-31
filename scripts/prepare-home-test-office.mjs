// Preparation only by default. No account creation without a later explicit TEST write approval.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { open } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const REF='aeqskxxykzapgaudbeqa'
const TEST_URL=`https://${REF}.supabase.co`
export function validateHomeTestSettings(env) {
  if(env.HAKU_TEST_PERSISTENT_APPROVAL!==`PR103:${REF}`) throw new Error('Explicit TEST persistent-write approval is required.')
  if(env.SUPABASE_URL!==TEST_URL || env.VERCEL_ENV==='production') throw new Error('Only the exact approved TEST project is allowed.')
  const key=env.SUPABASE_SERVICE_ROLE_KEY
  let claim
  try{claim=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString())}catch{throw new Error('A TEST project-scoped service JWT is required; opaque/malformed keys are rejected.')}
  if(claim.ref!==REF || claim.role!=='service_role') throw new Error('Service credential project/role mismatch.')
  return {url:TEST_URL,key}
}
export async function prepareHomeTestOffice(args,env=process.env) {
  if(!args.includes('--execute')) {
    return {mode:'DRY RUN / no network or writes',project:REF,name:'haku-merch-validation',plan:'Create one NEW random example.invalid Auth user; output a separately reviewed, expiring SQL promotion for only that fresh identity. No invites, no existing-account changes. Ordinary admin by default.'}
  }
  const {url,key}=validateHomeTestSettings(env)
  if(!env.HAKU_TEST_CREDENTIAL_OUTPUT || !/\.local$/.test(env.HAKU_TEST_CREDENTIAL_OUTPUT)) throw new Error('Set a private *.local credential output path outside version control.')
  // Reserve a new 0600 output file before any API call; never overwrite existing credentials.
  const output=env.HAKU_TEST_CREDENTIAL_OUTPUT
  const handle=await open(output,'wx',0o600)
  try {
  await handle.writeFile('Pending new TEST fixture creation. No credential yet.\n')
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const email=`pr103-office-${randomUUID()}@example.invalid`
  const password=randomBytes(32).toString('base64url')
  const {data,error}=await sb.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{haku_fixture:'pr103',project:REF}})
  if(error || !data.user) throw new Error('TEST fixture Auth creation failed; no existing accounts were changed.')
  const id=data.user.id
  // Provisioning the profile/member is a separately reviewed DB-owner step.
  // Do not widen service_role INSERT/UPDATE permissions to bootstrap an office.
  const promotionSql=`begin;
DO $setup$
begin
  if not exists (select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id='${id}'::uuid and u.email='${email}' and p.email='${email}' and p.role='fan'
      and u.raw_app_meta_data->>'haku_fixture'='pr103' and u.raw_app_meta_data->>'project'='${REF}'
      and u.created_at>now()-interval '15 minutes') then raise exception 'Not the newly created TEST fixture'; end if;
  if exists(select 1 from public.admin_members where user_id='${id}'::uuid) then raise exception 'Membership already exists'; end if;
  update public.profiles set role='admin',status='active',display_name='PR103 TEST OFFICE' where id='${id}'::uuid and role='fan' and email='${email}';
  insert into public.admin_members(user_id,name,email,permission,status) values('${id}'::uuid,'PR103 TEST OFFICE','${email}','admin','active');
end $setup$;
commit;`
  const manifest=Buffer.from(JSON.stringify({project:REF,id,email,password,permission:'admin',fixture:'pr103',promotion_sql_review_required:promotionSql},null,2)+'\n')
  await handle.truncate(0);await handle.write(manifest,0,manifest.length,0)
  return {mode:'NEW TEST AUTH FIXTURE CREATED / office promotion still requires reviewed SQL',project:REF,id,credentials:'saved in private output; not printed',permission:'admin'}
  } finally {await handle.close()}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 prepareHomeTestOffice(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1})
}
