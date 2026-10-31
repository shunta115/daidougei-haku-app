import { createHmac } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createLiveKitToken, sessionRoomName } from '../api/livekit/_shared'
afterEach(()=>vi.unstubAllEnvs())
it('real SDK signs a short-lived subscribe-only grant for exactly one session (fake local credentials)',async()=>{
 const secret='local-test-secret-only-'.repeat(4)
 vi.stubEnv('LIVEKIT_URL','wss://test.invalid');vi.stubEnv('LIVEKIT_API_KEY','test-local-key');vi.stubEnv('LIVEKIT_API_SECRET',secret)
 const token=await createLiveKitToken({identity:'viewer-unique',name:'Fan',room:'live-owner-session-1',canPublish:false})
 const [head,body,sig]=token.split('.')
 expect(createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')).toBe(sig)
 const claims=JSON.parse(Buffer.from(body,'base64url').toString())
 expect(claims.video).toMatchObject({roomJoin:true,room:'live-owner-session-1',canPublish:false,canSubscribe:true})
 expect(claims.exp-claims.nbf).toBeLessThanOrEqual(300)
})
it('isolates production, preview, and consecutive sessions in different room names',()=>{
 vi.stubEnv('VERCEL_ENV','production');const one=sessionRoomName('owner','one'),two=sessionRoomName('owner','two');expect(one).not.toBe(two)
 vi.stubEnv('VERCEL_ENV','preview');expect(sessionRoomName('owner','one')).not.toBe(one)
})
