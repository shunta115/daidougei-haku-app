import {spawnSync} from 'node:child_process'
import {expect,it} from 'vitest'
function run(extra:Record<string,string>={}){return spawnSync(process.execPath,['scripts/guard-smart-push-preview.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH,...extra}})}
it('leaves ordinary builds unchanged and makes no external probe',()=>{expect(run().status).toBe(0)})
it('rejects the test adapter in production before any API access',()=>{const r=run({VITE_SMART_PUSH_TEST_LIFECYCLE:'true',VERCEL_ENV:'production'});expect(r.status).not.toBe(0);expect(r.stderr).toContain('boundary mismatch')})
it('does not enable real sends through a preview flag alone',()=>{const r=run({VITE_SMART_PUSH_TEST_LIFECYCLE:'true',VERCEL_ENV:'preview',VITE_SUPABASE_URL:'https://aeqskxxykzapgaudbeqa.supabase.co',SUPABASE_URL:'https://aeqskxxykzapgaudbeqa.supabase.co',ENABLE_LIVE_START_WEB_PUSH:'true'});expect(r.status).not.toBe(0);expect(r.stderr).toContain('separate device approval')})
