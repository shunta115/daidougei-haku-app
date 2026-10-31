// Retain a UUID for a failed/unknown submission; a deliberate next comment gets a new UUID.
export type CommentAttempt = { key: string; id: string }
export function nextCommentAttempt(previous: CommentAttempt | null, userId: string, performerId: string, sessionId: string, body: string): CommentAttempt {
  const key = JSON.stringify([userId, performerId, sessionId, body.trim().slice(0, 200)])
  return previous?.key === key ? previous : { key, id: crypto.randomUUID() }
}
