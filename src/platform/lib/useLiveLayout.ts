import { useEffect, useState } from 'react'
import { detectLiveVideoOrientation } from './liveOrientation'

export type LiveLayoutMode = 'phone-portrait' | 'phone-landscape' | 'tablet-portrait' | 'tablet-landscape' | 'desktop'

function computeMode(w: number, h: number): LiveLayoutMode {
  const landscape = w > h
  if (w >= 1100) return 'desktop'
  if (w >= 768) return landscape ? 'tablet-landscape' : 'tablet-portrait'
  return landscape ? 'phone-landscape' : 'phone-portrait'
}

export function useLiveLayout() {
  const [mode, setMode] = useState<LiveLayoutMode>(() =>
    typeof window === 'undefined' ? 'phone-portrait' : computeMode(window.innerWidth, window.innerHeight),
  )
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() =>
    detectLiveVideoOrientation(),
  )

  useEffect(() => {
    const update = () => {
      setMode(computeMode(window.innerWidth, window.innerHeight))
      setOrientation(detectLiveVideoOrientation())
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
