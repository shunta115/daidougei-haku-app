import { expect, it, vi } from 'vitest'
// @ts-expect-error standalone Node runner is intentionally plain JavaScript
import { watchdogOrigin, watchdogPass } from '../scripts/live-presence-watchdog.mjs'
const first='10000000-0000-4000-8000-000000000001',second='20000000-0000-4000-8000-000000000002'
const page=(nextCursor:string|null,scanned=50)=>({ok:true,json:async()=>({ok:true,ended:0,scanned,unknown:0,cleanupPending:0,nextCursor})})
it('drains more than fifty LIVE rows without dropping the continuation and never follows redirects',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(page(first)).mockResolvedValueOnce(page(second)).mockResolvedValueOnce(page(null,5))
 const result=await watchdogPass({origin:'http://127.0.0.1:7889',secret:'local-test-only',fetcher})
 expect(result).toMatchObject({complete:true,pages:3,scanned:105,cursor:null})
 expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('cursor')).toBe(first)
 expect(fetcher.mock.calls.every(call=>call[1].redirect==='error')).toBe(true)
})
it('retains the failed page cursor, so a later pass cannot starve later sessions',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(page(first)).mockRejectedValueOnce(new Error('offline'))
 await expect(watchdogPass({origin:'https://example.invalid',secret:'test',fetcher})).rejects.toMatchObject({cursor:first})
})
it('rejects credential-bearing, non-loopback HTTP and fragment origins',()=>{
 for(const origin of ['http://example.invalid','https://user:pass@example.invalid','https://example.invalid/#x'])expect(()=>watchdogOrigin(origin)).toThrow()
})
it('rejects repeated or malformed continuation instead of looping or leaking the watchdog secret',async()=>{
 const fetcher=vi.fn().mockResolvedValue(page(first))
 await expect(watchdogPass({origin:'https://example.invalid',secret:'test',cursor:first,fetcher})).rejects.toThrow('Invalid watchdog response')
 expect(fetcher).toHaveBeenCalledTimes(1)
})
