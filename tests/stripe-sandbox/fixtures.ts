import { createClient } from '@supabase/supabase-js'
import { randomUUID,randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { loadTestEnvironment } from './environment'
loadTestEnvironment()
const sb = createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const runId=randomUUID()
async function createUser(label:string,role:string) {
 const password=randomBytes(24).toString('base64url')
 const email=`haku-pr112-${runId}-${label}@example.invalid`
 const {data,error}=await sb.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`PR112 ${label}`}})
 if(error||!data.user)throw new Error(`fixture_user_${label}: ${error?.code}`)
 const id=data.user.id
 return {id,email,password}
}
const fan=await createUser('fan','fan')
const performers=[]
for(const label of ['HARIBOW','PAUL','Other-A','Other-B']) {
 const artist=await createUser(label,'performer')
 performers.push({id:artist.id,label})
}
writeFileSync('/private/tmp/haku-pr112-fixtures.json',JSON.stringify({runId,fan,performers}),{mode:0o600})
console.log(JSON.stringify({fixturesCreated:true,performers:performers.map(x=>x.label),fan:true,connectAccounts:'none; transfers cannot run'}))
