export type LikeBatch = { id: string; count: number }
export type LikeOutbox = { pending: number; batch: LikeBatch | null }
const prefix = 'haku-like-outbox-v1:'
const ttl = 6 * 60 * 60_000
export function likeOutboxKey(performerId: string, startedAt: string, userId: string) {
  return `${prefix}${encodeURIComponent(userId)}:${encodeURIComponent(performerId)}:${encodeURIComponent(startedAt)}`
}
export function readLikeOutbox(key: string, now = Date.now()): LikeOutbox {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (!value || !Number.isFinite(value.expires) || value.expires <= now || value.expires > now + ttl || !Number.isInteger(value.pending) || value.pending < 0 || value.pending > 120) return { pending: 0, batch: null }
    const batch = value.batch
    if (batch && (typeof batch.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(batch.id) || !Number.isInteger(batch.count) || batch.count < 1 || batch.count > 12)) return { pending: 0, batch: null }
    return { pending: value.pending, batch: batch || null }
  } catch { return { pending: 0, batch: null } }
}
export function saveLikeOutbox(key: string, value: LikeOutbox) {
  try {
    if (!value.pending && !value.batch) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify({ ...value, expires: Date.now() + ttl }))
  } catch { /* In-memory delivery still works when browser storage is unavailable. */ }
}
