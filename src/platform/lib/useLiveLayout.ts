import { useEffect, useState } from 'react'
import { detectLiveVideoOrientation } from './liveOrientation'

export type LiveLayoutMode = 'phone-portrait' | 'phone-landscape' | 'tablet-portrait' | 'tablet-landscape' | 'desktop'

export function computeLiveLayoutMode(w: number, h: number, orientation: 'portrait' | 'landscape'): LiveLayoutMode {
  const shortEdge = Math.min(w, h)
  const longEdge = Math.max(w, h)
  // A rotated iPhone can be wider than 768px while its short edge is still phone-sized.
  if (shortEdge < 600) return orientation === 'landscape' ? 'phone-landscape' : 'phone-portrait'
  if (longEdge >= 1100) return 'desktop'
  return orientation === 'landscape' ? 'tablet-landscape' : 'tablet-portrait'
}

export function useLiveLayout() {
  const [mode, setMode] = useState<LiveLayoutMode>(() =>
    typeof window === 'undefined'
      ? 'phone-portrait'
      : computeLiveLayoutMode(window.innerWidth, window.innerHeight, detectLiveVideoOrientation()),
  )
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() =>
    detectLiveVideoOrientation(),
  )

  useEffect(() => {
    const update = () => {
      const nextOrientation = detectLiveVideoOrientation()
      setMode(computeLiveLayoutMode(window.innerWidth, window.innerHeight, nextOrientation))
      setOrientation(nextOrientation)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return { mode, orientation, isOverlayChrome: mode === 'phone-landscape' }
}
