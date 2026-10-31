// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { likeOutboxKey, readLikeOutbox, saveLikeOutbox } from '../src/platform/lib/liveLikeOutbox'
beforeEach(() => sessionStorage.clear())
it('retains the exact in-flight batch across reload without crossing actor or session', () => {
 const key = likeOutboxKey('performer','session-a','user-a')
 const row = { pending: 3, batch: { id: '10000000-0000-4000-8000-000000000001', count: 4 } }
 saveLikeOutbox(key,row)
 expect(readLikeOutbox(key)).toEqual(row)
 expect(readLikeOutbox(likeOutboxKey('performer','session-a','user-b')).pending).toBe(0)
 expect(readLikeOutbox(likeOutboxKey('performer','session-b','user-a')).batch).toBeNull()
 saveLikeOutbox(key,{pending:0,batch:null});expect(sessionStorage.getItem(key)).toBeNull()
})
it('discards expired and malformed queues instead of sending arbitrary counts', () => {
 const key=likeOutboxKey('p','s','u')
 sessionStorage.setItem(key,JSON.stringify({pending:1,batch:null,expires:Date.now()-1}));expect(readLikeOutbox(key).pending).toBe(0)
 sessionStorage.setItem(key,JSON.stringify({pending:121,batch:null,expires:Date.now()+1000}));expect(readLikeOutbox(key).pending).toBe(0)
 sessionStorage.setItem(key,'{broken');expect(readLikeOutbox(key).batch).toBeNull()
})
