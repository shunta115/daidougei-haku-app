import { useEffect, useRef, useState } from 'react'
import { addLiveReactions, getLiveReactionTotal, subscribeLiveReactions, type LiveReactionPulse } from './api'
import { createLiveActorId } from './liveReaction'
import { triggerLightHaptic } from './haptics'

export const LIVE_REACTION_CONFIG = {
  flushMs: 1000, maxTapsPerSecond: 12, maxVisible: 24,
  decayMs: 160, decay: 6, pulseGain: 5, celebrationThreshold: 75, celebrationCooldownMs: 8000,
} as const
export type LiveVisualPulse = { id: string; kind: 'heart' | 'applause'; expires: number }

export function useLiveReactions(performerId: string | undefined, liveStartedAt: string | null | undefined, active: boolean,
  actor?: { id?: string; displayName?: string; avatarUrl?: string | null; privateLive?: boolean }) {
  const [total, setTotal] = useState(0)
  const [level, setLevel] = useState(0)
  const [pulses, setPulses] = useState<LiveVisualPulse[]>([])
  const [celebrating, setCelebrating] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const sendRef = useRef<(kind: 'heart' | 'applause') => void>(() => {})
  const actorRef = useRef(actor)
  actorRef.current = actor

  useEffect(() => {
    setTotal(0); setLevel(0); setPulses([]); setCelebrating(false); setDeliveryError(null)
    if (!performerId || !active || !liveStartedAt) { sendRef.current = () => {}; return }
    let alive = true, sending = false, applause = 0, hearts = 0, currentLevel = 0
    let tapStart = 0, taps = 0, lastCelebration = -Infinity, celebrationEnds = 0
    let actorId = actorRef.current?.id || ''
    if (!actorId) {
      try {
        actorId = localStorage.getItem('haku-live-guest-id') || createLiveActorId()
        localStorage.setItem('haku-live-guest-id', actorId)
      } catch { actorId = createLiveActorId() }
    }
    const session = liveStartedAt
    const visual = (kind: 'heart' | 'applause', count: number) => {
      const now = Date.now()
      setPulses((previous) => [...previous.filter(p => p.expires > now), ...Array.from({ length: Math.min(count, 4) }, () => ({
        id: createLiveActorId(), kind, expires: now + 1500,
      }))].slice(-LIVE_REACTION_CONFIG.maxVisible))
      if (kind !== 'applause') return
      currentLevel = Math.min(100, currentLevel + count * LIVE_REACTION_CONFIG.pulseGain)
      setLevel(currentLevel)
      if (currentLevel >= LIVE_REACTION_CONFIG.celebrationThreshold && now - lastCelebration >= LIVE_REACTION_CONFIG.celebrationCooldownMs) {
        lastCelebration = now; celebrationEnds = now + 1600; setCelebrating(true)
      }
    }
    const hydrate = () => void getLiveReactionTotal(performerId, session)
      .then(value => { if (alive) setTotal(previous => Math.max(previous, value)) }).catch(() => {})
    const subscription = subscribeLiveReactions(performerId, {
      liveStartedAt: session,
      // Supabase Broadcast topics are public in the current deployment. Private
      // LIVE uses only RLS-filtered Postgres changes so identities never leak.
      broadcastEnabled: actorRef.current?.privateLive !== true,
      onTotal: value => { if (alive) setTotal(previous => Math.max(previous, value)) },
      onReady: hydrate,
      onPulse: pulse => {
        if (!alive || pulse.actorId === actorId || pulse.liveStartedAt && Date.parse(pulse.liveStartedAt) !== Date.parse(session)) return
        visual(pulse.kind ?? 'heart', pulse.count)
      },
    })
    hydrate()
    const publish = async (kind: 'heart' | 'applause', count: number) => {
      const pulse: LiveReactionPulse = {
        actorId, displayName: (actorRef.current?.displayName || 'ゲスト').slice(0, 80), avatarUrl: null,
        kind, count, nonce: createLiveActorId(), liveStartedAt: session,
      }
      const status = await subscription.publish(pulse)
      if (status !== 'ok') throw new Error('reaction broadcast failed')
    }
    const flush = async () => {
      if (!alive || sending) return
      const clapCount = Math.min(30, applause), heartCount = Math.min(30, hearts)
      applause -= clapCount; hearts -= heartCount; sending = true
      try {
        if (clapCount) {
          const value = await addLiveReactions(performerId, actorId, clapCount, session)
          if (!alive) return
          setTotal(previous => Math.max(previous, value)); setDeliveryError(null)
          await publish('applause', clapCount)
        }
        if (heartCount && alive) await publish('heart', heartCount)
      } catch { if (alive) setDeliveryError('拍手を送信できませんでした。通信を確認して、もう一度お試しください。') }
      finally { sending = false }
    }
    sendRef.current = kind => {
      const now = Date.now()
      if (now - tapStart >= 1000) { tapStart = now; taps = 0 }
      if (++taps > LIVE_REACTION_CONFIG.maxTapsPerSecond) return
      triggerLightHaptic(); visual(kind, 1)
      if (kind === 'applause') applause = Math.min(30, applause + 1)
      else hearts = Math.min(30, hearts + 1)
    }
    const flushTimer = window.setInterval(() => void flush(), LIVE_REACTION_CONFIG.flushMs)
    const decayTimer = window.setInterval(() => {
      currentLevel = Math.max(0, currentLevel - LIVE_REACTION_CONFIG.decay)
      setLevel(currentLevel)
      const now = Date.now()
      setPulses(previous => previous.some(p => p.expires <= now) ? previous.filter(p => p.expires > now) : previous)
      if (celebrationEnds && now >= celebrationEnds) { celebrationEnds = 0; setCelebrating(false) }
    }, LIVE_REACTION_CONFIG.decayMs)
    const visible = () => { if (document.visibilityState === 'visible') hydrate() }
    window.addEventListener('online', hydrate); document.addEventListener('visibilitychange', visible)
    return () => {
      alive = false; sendRef.current = () => {}; window.clearInterval(flushTimer); window.clearInterval(decayTimer)
      subscription.unsubscribe(); window.removeEventListener('online', hydrate); document.removeEventListener('visibilitychange', visible)
    }
  }, [performerId, liveStartedAt, active, actor?.id, actor?.privateLive])
  return { total, level, pulses, celebrating, deliveryError, send: (kind: 'heart' | 'applause') => sendRef.current(kind) }
}
