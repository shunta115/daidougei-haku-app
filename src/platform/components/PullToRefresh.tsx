import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { refreshVisibleData } from '../lib/pullToRefresh'
type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done'
const TRIGGER_DISTANCE = 82
const MAX_DISTANCE = 118
function blockedTarget(target: EventTarget | null) { const element = target instanceof Element ? target : null; return Boolean(element?.closest('form, input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"], .pl-google-map, [data-pull-refresh-ignore]')) }
export function PullToRefresh({ disabled = false }: { disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle'); const [distance, setDistance] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null); const distanceRef = useRef(0); const active = useRef(false); const refreshing = useRef(false); const doneTimer = useRef<number | null>(null)
  useEffect(() => () => { if (doneTimer.current) window.clearTimeout(doneTimer.current) }, [])
  useEffect(() => {
    if (disabled) return
    const atTop = () => window.scrollY <= 0 && (document.scrollingElement?.scrollTop ?? 0) <= 0
    const modalOpen = () => Boolean(document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]'))
    const onStart = (event: TouchEvent) => { if (refreshing.current || event.touches.length !== 1 || !atTop() || modalOpen() || blockedTarget(event.target)) return; const touch = event.touches[0]; start.current = { x: touch.clientX, y: touch.clientY }; active.current = false }
    const onMove = (event: TouchEvent) => { if (!start.current || event.touches.length !== 1) return; const touch = event.touches[0]; const dy = touch.clientY - start.current.y; const dx = Math.abs(touch.clientX - start.current.x); if (dy <= 0 || dx > dy * .65 || !atTop()) { start.current = null; active.current = false; setPhase('idle'); setDistance(0); return } if (dy < 10) return; active.current = true; event.preventDefault(); const eased = Math.min(MAX_DISTANCE, dy); distanceRef.current = eased; setDistance(eased); setPhase(eased >= TRIGGER_DISTANCE ? 'ready' : 'pulling') }
    const finish = async () => { const shouldRefresh = active.current && distanceRef.current >= TRIGGER_DISTANCE && !refreshing.current; start.current = null; active.current = false; if (!shouldRefresh) { distanceRef.current = 0; setDistance(0); setPhase('idle'); return } refreshing.current = true; setDistance(58); setPhase('refreshing'); try { await refreshVisibleData() } finally { setPhase('done'); setDistance(48); doneTimer.current = window.setTimeout(() => { refreshing.current = false; distanceRef.current = 0; setDistance(0); setPhase('idle') }, 1000) } }
    window.addEventListener('touchstart', onStart, { passive: true }); window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', finish, { passive: true }); window.addEventListener('touchcancel', finish, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', finish); window.removeEventListener('touchcancel', finish) }
  }, [disabled])
  if (phase === 'idle') return null
  const label = phase === 'pulling' ? '↓ 引っ張って更新' : phase === 'ready' ? '↑ 離して更新' : phase === 'refreshing' ? '更新中…' : '✓ 最新情報に更新しました'
  return <div className="pl-pull-refresh" style={{ '--pull-distance': `${distance}px` } as CSSProperties} role="status" aria-live="polite" data-phase={phase}><span>{phase === 'done' ? <Check size={17} /> : <RefreshCw size={17} />}</span>{label}</div>
}
