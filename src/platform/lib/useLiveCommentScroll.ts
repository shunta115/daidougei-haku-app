import { useLayoutEffect, useRef, useState } from 'react'
import type { LiveComment } from './types'

export function appendLiveComment(comments: LiveComment[], comment: LiveComment, limit = 80) {
  if (comments.some((current) => current.id === comment.id)) return comments
  return [...comments, comment].slice(-limit)
}

export function removeLiveComment(comments: LiveComment[], commentId: string) {
  return comments.filter((comment) => comment.id !== commentId)
}

export function isNearCommentEnd(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>, threshold = 32) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
}

export function hasIncomingLiveComment(previousCount: number, currentCount: number, latestChanged = false) {
  return currentCount > previousCount || (currentCount === previousCount && latestChanged)
}

export function useLiveCommentScroll(commentCount: number, latestCommentId?: string) {
  const listRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const previousCountRef = useRef(commentCount)
  const previousLatestRef = useRef(latestCommentId)
  const [hasNewComments, setHasNewComments] = useState(false)

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    const list = listRef.current
    if (!list) return
    pinnedRef.current = true
    setHasNewComments(false)
    list.scrollTo({ top: list.scrollHeight, behavior })
  }

  useLayoutEffect(() => {
    const list = listRef.current
    const previousCount = previousCountRef.current
    const latestChanged = latestCommentId != null && latestCommentId !== previousLatestRef.current
    previousCountRef.current = commentCount
    previousLatestRef.current = latestCommentId
    if (!list) return
    if (pinnedRef.current) scrollToLatest('auto')
    else if (hasIncomingLiveComment(previousCount, commentCount, latestChanged)) setHasNewComments(true)
    // The latest ID changes even when the bounded 80-comment list stays full.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentCount, latestCommentId])

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    pinnedRef.current = isNearCommentEnd(list)
    if (pinnedRef.current) setHasNewComments(false)
  }

  return { listRef, hasNewComments, onScroll, scrollToLatest }
}
