import { expect, it } from 'vitest'
import { nextCommentAttempt } from '../src/platform/lib/liveCommentAttempt'
it('reuses an unknown-result retry but isolates actors, sessions and edited messages', () => {
 const original = nextCommentAttempt(null,'fan','performer','session','hello')
 expect(nextCommentAttempt(original,'fan','performer','session',' hello ')).toBe(original)
 expect(nextCommentAttempt(original,'fan','performer','new-session','hello').id).not.toBe(original.id)
 expect(nextCommentAttempt(original,'other','performer','session','hello').id).not.toBe(original.id)
 expect(nextCommentAttempt(original,'fan','performer','session','edited').id).not.toBe(original.id)
 expect(nextCommentAttempt(null,'fan','performer','session','hello').id).not.toBe(original.id)
})
