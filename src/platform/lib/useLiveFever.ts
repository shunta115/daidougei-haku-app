import { useEffect, useRef, useState } from 'react'
import { subscribeLiveFever } from './api'
import { createLiveFeverId } from './liveFever'
import type { TipGiftTier } from './tipGifts'

export const LIVE_FEVER_CONFIG = {
  flushMs: 400,
  decayMs: 180,
  decay: 2,
  likeGain: 4,
  maxLikesPerSecond: 12,
  maxVisibleHearts: 18,
  giftGain: { normal: 20, premium: 35, special: 60 } as Record<TipGiftTier, number>,
} as const

export type LiveFeverHeart = { id: string; expiresAt: number }

export function useLiveFever(performerId: string | undefined, liveStartedAt: string | null | undefined, active: boolean) {
  const [level, setLevel] = useState(0)
  const [likes, setLikes] = useState(0)
  const [hearts, setHearts] = useState<LiveFeverHeart[]>([])
  const sendLikeRef = useRef<() => void>(() => {})
  const addGiftRef = useRef<(tier: TipGiftTier) => void>(() => {})

  useEffect(() => {
    setLevel(0)
    setLikes(0)
    setHearts([])
    if (!performerId || !liveStartedAt || !active) {
      sendLikeRef.current = () => {}
      addGiftRef.current = () => {}
      return
    }

    let alive = true
    let currentLevel = 0
    let pendingLikes = 0
    let tapWindowStartedAt = 0
    let tapsInWindow = 0
    let actorId = ''
    try {
      actorId = localStorage.getItem('haku-live-fever-actor-v1') || createLiveFeverId()
      localStorage.setItem('haku-live-fever-actor-v1', actorId)
    } catch {
      actorId = createLiveFeverId()
    }

    const addHearts = (count: number) => {
      const now = Date.now()
      setHearts((previous) => [
        ...previous.filter((heart) => heart.expiresAt > now),
        ...Array.from({ length: Math.min(count, 4) }, () => ({ id: createLiveFeverId(), expiresAt: now + 1_500 })),
      ].slice(-LIVE_FEVER_CONFIG.maxVisibleHearts))
    }
    const addLikes = (count: number) => {
      currentLevel = Math.min(100, currentLevel + count * LIVE_FEVER_CONFIG.likeGain)
      setLevel(currentLevel)
      setLikes((previous) => previous + count)
      addHearts(count)
    }
    const addGift = (tier: TipGiftTier) => {
      currentLevel = Math.min(100, currentLevel + LIVE_FEVER_CONFIG.giftGain[tier])
      setLevel(currentLevel)
    }

    const subscription = subscribeLiveFever(performerId, liveStartedAt, (pulse) => {
      if (!alive || pulse.actorId === actorId) return
      addLikes(pulse.count)
    })

    sendLikeRef.current = () => {
      const now = Date.now()
      if (now - tapWindowStartedAt >= 1_000) {
        tapWindowStartedAt = now
        tapsInWindow = 0
      }
      if (++tapsInWindow > LIVE_FEVER_CONFIG.maxLikesPerSecond) return
      pendingLikes += 1
      addLikes(1)
    }
    addGiftRef.current = addGift

    const flushTimer = window.setInterval(() => {
      const count = pendingLikes
      pendingLikes = 0
      if (!count) return
      void subscription.publish({ actorId, count, nonce: createLiveFeverId(), liveStartedAt })
    }, LIVE_FEVER_CONFIG.flushMs)
    const decayTimer = window.setInterval(() => {
      currentLevel = Math.max(0, currentLevel - LIVE_FEVER_CONFIG.decay)
      setLevel(currentLevel)
      const now = Date.now()
      setHearts((previous) => previous.some((heart) => heart.expiresAt <= now)
        ? previous.filter((heart) => heart.expiresAt > now)
        : previous)
    }, LIVE_FEVER_CONFIG.decayMs)

    return () => {
      alive = false
      sendLikeRef.current = () => {}
      addGiftRef.current = () => {}
      window.clearInterval(flushTimer)
      window.clearInterval(decayTimer)
      subscription.unsubscribe()
    }
  }, [performerId, liveStartedAt, active])

  return {
    level,
    likes,
    hearts,
    sendLike: () => sendLikeRef.current(),
    addGift: (tier: TipGiftTier) => addGiftRef.current(tier),
  }
}
