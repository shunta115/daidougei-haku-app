import { useEffect, useState } from 'react'
import { listLiveComments, subscribeLiveComments } from './api'
import { appendLiveComment, removeLiveComment } from './useLiveCommentScroll'
import type { LiveComment } from './types'

export function useLiveComments(performerId: string | undefined, sessionId: string | null, active: boolean) {
  const [comments, setComments] = useState<LiveComment[]>([])
  const [commentError, setCommentError] = useState<string | null>(null)
  useEffect(() => {
    setComments([]); setCommentError(null)
    if (!performerId || !sessionId || !active) return
    let alive = true, reading = false, revision = 0
    const refresh = async () => {
      if (!alive || reading) return
      reading = true
      const startedRevision = revision
      try {
        const rows = await listLiveComments(performerId, sessionId)
        // Never overwrite an insert/delete received while the snapshot was in flight.
        if (alive && revision === startedRevision) { setComments(rows); setCommentError(null) }
      } catch { if (alive) setCommentError('コメントを同期できません。通信回復後に再取得します。') }
      finally { reading = false }
    }
    const unsubscribe = subscribeLiveComments(performerId, sessionId, {
      onInsert: row => { if (alive) { revision++; setComments(previous => appendLiveComment(previous, row)) } },
      onDelete: id => { if (alive) { revision++; setComments(previous => removeLiveComment(previous, id)) } },
      onReady: () => void refresh(),
    })
    void refresh()
    const recover = () => { if (document.visibilityState !== 'hidden') void refresh() }
    const timer = window.setInterval(recover, 3000)
    window.addEventListener('online', recover); window.addEventListener('focus', recover); document.addEventListener('visibilitychange', recover)
    return () => {
      alive = false; unsubscribe(); window.clearInterval(timer)
      window.removeEventListener('online', recover); window.removeEventListener('focus', recover); document.removeEventListener('visibilitychange', recover)
    }
  }, [performerId, sessionId, active])
  return { comments, setComments, commentError }
}
