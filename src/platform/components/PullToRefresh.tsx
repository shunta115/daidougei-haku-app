import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing'
const TRIGGER_DISTANCE = 60
const MAX_DISTANCE = 118
const reloadCurrentPage = () => window.location.reload()

function blockedTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null
  return Boolean(element?.closest('form, input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"], .pl-google-map, [data-pull-refresh-ignore]'))
}
function scrollingElementFor(target: EventTarget | null): Element | null {
  let element = target instanceof Element ? target : null
  while (element && element !== document.body && element !== document.documentElement) {
    const style = window.getComputedStyle(element)
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) return element
    element = element.parentElement
  }
  return document.scrollingElement
}
function isAtTop(scroller: Element | null) {
  if (scroller && scroller !== document.documentElement && scroller !== document.body) return scroller.scrollTop <= 0
  return (document.scrollingElement?.scrollTop ?? 0) <= 0 && window.scrollY <= 0
}

export function PullToRefresh({ disabled = false, onReload = reloadCurrentPage }: { disabled?: boolean; onReload?: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const start = useRef<{ x: number; clientY: number; pageY: number; screenY: number } | null>(null)
  const scroller = useRef<Element | null>(null)
  const distanceRef = useRef(0)
  const active = useRef(false)
  const refreshing = useRef(false)
  const reloadTimer = useRef<number | null>(null)
  useEffect(() => () => { if (reloadTimer.current) window.clearTimeout(reloadTimer.current) }, [])
  useEffect(() => {
    if (disabled) return
    const modalOpen = () => Boolean(document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]'))
    const reset = () => { start.current = null; scroller.current = null; active.current = false; distanceRef.current = 0; setPhase('idle') }
    const onStart = (event: TouchEvent) => {
      const nextScroller = scrollingElementFor(event.target)
      if (refreshing.current || event.touches.length !== 1 || !isAtTop(nextScroller) || modalOpen() || blockedTarget(event.target)) return
      const touch = event.touches[0]
      scroller.current = nextScroller
      start.current = { x: touch.clientX, clientY: touch.clientY, pageY: touch.pageY, screenY: touch.screenY }
      active.current = false
      setPhase('pulling')
    }
    const onMove = (event: TouchEvent) => {
      if (!start.current || event.touches.length !== 1) return
      const touch = event.touches[0]
      const dy = Math.max(
        touch.clientY - start.current.clientY,
        touch.pageY - start.current.pageY,
        touch.screenY - start.current.screenY,
      )
      const dx = Math.abs(touch.clientX - start.current.x)
      if (dy <= 0 || dx > dy * 0.65 || !isAtTop(scroller.current)) { reset(); return }
      if (dy < 4) return
      active.current = true
      if (event.cancelable) event.preventDefault()
      const eased = Math.min(MAX_DISTANCE, dy)
      distanceRef.current = eased
      setPhase(eased >= TRIGGER_DISTANCE ? 'ready' : 'pulling')
    }
    const finish = () => {
      const shouldRefresh = active.current && distanceRef.current >= TRIGGER_DISTANCE && !refreshing.current
      start.current = null; scroller.current = null; active.current = false
      if (!shouldRefresh) { reset(); return }
      refreshing.current = true; setPhase('refreshing')
      reloadTimer.current = window.setTimeout(onReload, 180)
    }
    const cancel = () => { if (!refreshing.current) reset() }
    const options: AddEventListenerOptions = { passive: false, capture: true }
    document.addEventListener('touchstart', onStart, options)
    document.addEventListener('touchmove', onMove, options)
    document.addEventListener('touchend', finish, options)
    document.addEventListener('touchcancel', cancel, options)
    return () => {
      document.removeEventListener('touchstart', onStart, true)
      document.removeEventListener('touchmove', onMove, true)
      document.removeEventListener('touchend', finish, true)
      document.removeEventListener('touchcancel', cancel, true)
    }
  }, [disabled, onReload])
  if (phase === 'idle') return null
  const label = phase === 'pulling' ? '↓ 引っ張って更新' : phase === 'ready' ? '↑ 離して更新' : '↻ 更新中…'
  return <div className="pl-pull-refresh" role="status" aria-live="polite" data-phase={phase}><span><RefreshCw size={17} /></span>{label}</div>
}
