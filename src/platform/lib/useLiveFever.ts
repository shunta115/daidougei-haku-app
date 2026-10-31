import { useEffect, useRef, useState } from 'react'
import { getLiveLikeTotal, sendLiveLikeBatch, subscribeLiveLikeTotal } from './liveLikes'
import { likeOutboxKey, readLikeOutbox, saveLikeOutbox } from './liveLikeOutbox'
import { createLiveFeverId } from './liveFever'
import type { TipGiftTier } from './tipGifts'

export const LIVE_FEVER_CONFIG = {
  flushMs: 1000, decayMs: 180, decay: 2, likeGain: 4,
  maxLikesPerSecond: 12, maxVisibleHearts: 18,
  giftGain: { normal: 20, premium: 35, special: 60 } as Record<TipGiftTier, number>,
} as const
export type LiveFeverHeart = { id: string; expiresAt: number }

export function useLiveFever(performerId: string | undefined, liveStartedAt: string | null | undefined, active: boolean, userId?: string) {
  const [level, setLevel] = useState(0)
  const [likes, setLikes] = useState(0)
  const [synced, setSynced] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [hearts, setHearts] = useState<LiveFeverHeart[]>([])
  const sendLikeRef = useRef<() => void>(() => {})
  const addGiftRef = useRef<(tier: TipGiftTier) => void>(() => {})

  useEffect(() => {
    setLevel(0); setLikes(0); setHearts([]); setSynced(false); setDeliveryError(null)
    if (!performerId || !liveStartedAt || !active) {
      sendLikeRef.current = () => {}; addGiftRef.current = () => {}; return
    }
    let alive = true, currentLevel = 0, knownTotal: number | null = null
    let realtimeConnected = false, lastReadAt = -Infinity
    let pending = 0, sending = false, reading = false, tapStart = 0, taps = 0, nextRetry = 0, failures = 0
    const outboxKey = userId ? likeOutboxKey(performerId, liveStartedAt, userId) : null
    const restored = outboxKey ? readLikeOutbox(outboxKey) : { pending: 0, batch: null }
    pending = restored.pending
    let batch = restored.batch
    const persist = () => { if (outboxKey) saveLikeOutbox(outboxKey, { pending, batch }) }
    const addHearts = (count: number) => {
      const now = Date.now()
      setHearts(previous => [...previous.filter(heart => heart.expiresAt > now),
        ...Array.from({ length: Math.min(count, 4) }, () => ({ id: createLiveFeverId(), expiresAt: now + 1500 })),
      ].slice(-LIVE_FEVER_CONFIG.maxVisibleHearts))
    }
    const gain = (amount: number) => { currentLevel = Math.min(100, currentLevel + amount); setLevel(currentLevel) }
    const receive = (total: number, animateInitial = false) => {
      if (!alive || !Number.isSafeInteger(total) || total < 0) return
      const delta = knownTotal === null ? (animateInitial ? total : 0) : Math.max(0, total - knownTotal)
      knownTotal = Math.max(knownTotal ?? 0, total)
      setLikes(knownTotal); setSynced(true)
      if (delta) { addHearts(delta); gain(delta * LIVE_FEVER_CONFIG.likeGain) }
    }
    const hydrate = async () => {
      if (!alive || reading) return
      reading = true; lastReadAt = Date.now()
      try { receive(await getLiveLikeTotal(performerId, liveStartedAt)); if (alive) setDeliveryError(previous => previous?.includes('累計を確認') ? null : previous) }
      catch { realtimeConnected = false; if (alive) setDeliveryError('いいねの累計を確認できません。通信を確認してください。') }
      finally { reading = false }
    }
    const unsubscribe = subscribeLiveLikeTotal(performerId, liveStartedAt, total => receive(total),
      () => { realtimeConnected = true; void hydrate() },
      connected => { if (alive) { realtimeConnected = connected; if (!connected) void hydrate() } },
    )
    void hydrate()
    const flush = async () => {
      if (!alive || !userId || sending || Date.now() < nextRetry) return
      if (!batch && pending) { batch = { id: createLiveFeverId(), count: Math.min(12, pending) }; pending -= batch.count; persist() }
      if (!batch) return
      sending = true
      try {
        const total = await sendLiveLikeBatch(performerId, liveStartedAt, batch.id, batch.count)
        if (!alive) return
        receive(total, true); batch = null; persist(); failures = 0; nextRetry = 0; setDeliveryError(null)
      } catch (error) {
        if (!alive) return
        const code = (error as { code?: string })?.code
        if (code === '55000' || code === '42501' || code === '22023') {
          batch = null; pending = 0; persist()
          setDeliveryError('いいねを送信できません。LIVEの状態とログインを確認してください。')
        } else {
          nextRetry = Date.now() + Math.min(8000, 1000 * 2 ** Math.min(++failures, 3))
          setDeliveryError('いいねを再送待ちです。通信回復後に重複せず再送します。')
        }
      } finally { sending = false }
    }
    sendLikeRef.current = () => {
      if (!userId) { setDeliveryError('いいねを送るにはログインしてください。'); return }
      const now = Date.now()
      if (now - tapStart >= 1000) { tapStart = now; taps = 0 }
      if (++taps > LIVE_FEVER_CONFIG.maxLikesPerSecond || pending >= 120) return
      pending++; persist(); addHearts(1)
    }
    addGiftRef.current = tier => gain(LIVE_FEVER_CONFIG.giftGain[tier])
    const flushTimer = window.setInterval(() => void flush(), LIVE_FEVER_CONFIG.flushMs)
    const pollTimer = window.setInterval(() => { if (document.visibilityState !== 'hidden' && (!realtimeConnected || Date.now() - lastReadAt >= 60_000 || Date.now() < lastReadAt)) void hydrate() }, 2000)
    const decayTimer = window.setInterval(() => {
      currentLevel = Math.max(0, currentLevel - LIVE_FEVER_CONFIG.decay); setLevel(currentLevel)
      const now = Date.now()
      setHearts(previous => previous.some(heart => heart.expiresAt <= now) ? previous.filter(heart => heart.expiresAt > now) : previous)
    }, LIVE_FEVER_CONFIG.decayMs)
    const recover = () => { if (document.visibilityState !== 'hidden') { nextRetry = 0; void hydrate(); void flush() } }
    window.addEventListener('online', recover); window.addEventListener('focus', recover); document.addEventListener('visibilitychange', recover)
    return () => {
      alive = false; sendLikeRef.current = () => {}; addGiftRef.current = () => {}
      window.clearInterval(flushTimer); window.clearInterval(pollTimer); window.clearInterval(decayTimer); unsubscribe()
      window.removeEventListener('online', recover); window.removeEventListener('focus', recover); document.removeEventListener('visibilitychange', recover)
    }
  }, [performerId, liveStartedAt, active, userId])
  return { level, likes, synced, deliveryError, hearts, sendLike: () => sendLikeRef.current(), addGift: (tier: TipGiftTier) => addGiftRef.current(tier) }
}
