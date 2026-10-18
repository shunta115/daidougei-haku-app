import { useEffect, useRef, useState } from 'react'
import { subscribeLiveTipEvents } from '../lib/api'
import { formatYen } from '../lib/money'
import { TIP_GIFT_DURATIONS_MS, type TipGiftTier } from '../lib/tipGifts'
import type { LiveTipEvent } from '../lib/types'

type Props = {
  performerId: string
  liveSessionId: string
  soundEnabled: boolean
  reducedMotion: boolean
}

function playChime(tier: TipGiftTier) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = tier === 'special' ? 880 : tier === 'premium' ? 660 : 520
    g.gain.value = tier === 'special' ? 0.08 : 0.05
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (tier === 'special' ? 0.55 : 0.28))
    o.stop(ctx.currentTime + 0.6)
    window.setTimeout(() => void ctx.close(), 800)
  } catch {
    /* ignore */
  }
}

export function TipGiftOverlay({ performerId, liveSessionId, soundEnabled, reducedMotion }: Props) {
  const [current, setCurrent] = useState<LiveTipEvent | null>(null)
  const queueRef = useRef<LiveTipEvent[]>([])
  const busyRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())
  const optionsRef = useRef({ soundEnabled, reducedMotion })
  optionsRef.current = { soundEnabled, reducedMotion }
  const timersRef = useRef<Set<number>>(new Set())
  const aliveRef = useRef(false)
  const pumpRef = useRef<() => void>(() => {})
  const later = (callback: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer)
      if (aliveRef.current) callback()
    }, ms)
    timersRef.current.add(timer)
  }

  const pump = () => {
    if (busyRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      setCurrent(null)
      return
    }
    busyRef.current = true
    setCurrent(next)
    const options = optionsRef.current
    if (options.soundEnabled && !options.reducedMotion) playChime(next.tier)
    const ms = options.reducedMotion ? 1800 : TIP_GIFT_DURATIONS_MS[next.tier]
    later(() => {
      busyRef.current = false
      setCurrent(null)
      later(() => pumpRef.current(), 120)
    }, ms)
  }
  pumpRef.current = pump

  const enqueue = (row: LiveTipEvent) => {
    if (!aliveRef.current || row.performer_id !== performerId || row.live_session_id !== liveSessionId || !row.tip_id ||
      !Number.isInteger(row.amount_cents) || row.amount_cents <= 0 ||
      !['normal', 'premium', 'special'].includes(row.tier) ||
      seenRef.current.has(row.id) || seenRef.current.has(row.tip_id)) return
    seenRef.current.add(row.id)
    seenRef.current.add(row.tip_id)
    queueRef.current = [...queueRef.current.slice(-59), row]
    pumpRef.current()
  }

  useEffect(() => {
    aliveRef.current = true
    seenRef.current.clear(); queueRef.current = []; busyRef.current = false; setCurrent(null)
    // Subscribe only to server-verified INSERTs; joining/reconnecting never replays history.
    const unsubscribe = subscribeLiveTipEvents(performerId, liveSessionId, enqueue)
    return () => {
      aliveRef.current = false; unsubscribe()
      for (const timer of timersRef.current) window.clearTimeout(timer)
      timersRef.current.clear(); queueRef.current = []; busyRef.current = false
    }
  }, [performerId, liveSessionId])

  if (!current) return null

  const name = current.is_anonymous ? '匿名ファン' : current.display_name
  const tier = current.tier

  return (
    <div
      className={`pl-gift pl-gift--${tier}${reducedMotion ? ' pl-gift--calm' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="pl-gift__card">
        {current.avatar_url && !current.is_anonymous ? (
          <img className="pl-gift__avatar" src={current.avatar_url} alt="" />
        ) : (
          <div className="pl-gift__avatar pl-gift__avatar--ph" aria-hidden="true">
            🎁
          </div>
        )}
        <div className="pl-gift__text">
          <strong>
            {name}さんが{formatYen(current.amount_cents)}を贈りました！
          </strong>
          <span>{current.gift_label}</span>
        </div>
      </div>
    </div>
  )
}
