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

export function hasIncomingLiveComment(previousCount: number, currentCount: number) {
  return currentCount > previousCount
}

export function useLiveCommentScroll(commentCount: number) {
  const listRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const previousCountRef = useRef(commentCount)
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
    previousCountRef.current = commentCount
    if (!list) return
    if (pinnedRef.current) scrollToLatest('auto')
    else if (hasIncomingLiveComment(previousCount, commentCount)) setHasNewComments(true)
    // commentCount is the event that drives the scroll; scrollToLatest is intentionally local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentCount])

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    pinnedRef.current = isNearCommentEnd(list)
    if (pinnedRef.current) setHasNewComments(false)
  }

  return { listRef, hasNewComments, onScroll, scrollToLatest }
}
