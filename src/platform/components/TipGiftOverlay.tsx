import { useEffect, useRef, useState } from 'react'
import { listRecentLiveTipEvents, subscribeLiveTipEvents } from '../lib/api'
import { formatYen } from '../lib/money'
import { TIP_GIFT_DURATIONS_MS, type TipGiftTier } from '../lib/tipGifts'
import type { LiveTipEvent } from '../lib/types'

type Props = {
  performerId: string
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

export function TipGiftOverlay({ performerId, soundEnabled, reducedMotion }: Props) {
  const [current, setCurrent] = useState<LiveTipEvent | null>(null)
  const queueRef = useRef<LiveTipEvent[]>([])
  const busyRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())

  const pump = () => {
    if (busyRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      setCurrent(null)
      return
    }
    busyRef.current = true
    setCurrent(next)
    if (soundEnabled && !reducedMotion) playChime(next.tier)
    const ms = reducedMotion ? 1800 : TIP_GIFT_DURATIONS_MS[next.tier]
    window.setTimeout(() => {
      busyRef.current = false
      setCurrent(null)
      window.setTimeout(pump, 120)
    }, ms)
  }

  const enqueue = (row: LiveTipEvent) => {
    if (seenRef.current.has(row.id) || seenRef.current.has(row.tip_id)) return
    seenRef.current.add(row.id)
    seenRef.current.add(row.tip_id)
    queueRef.current.push(row)
    pump()
  }

  useEffect(() => {
    // Seed recent events only for display history is in comments; don't replay old gifts on join.
    listRecentLiveTipEvents(performerId, 5).catch(() => undefined)
    return subscribeLiveTipEvents(performerId, enqueue)
  }, [performerId])

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
