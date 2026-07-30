import { useCallback, useEffect, useState, type RefObject } from 'react'

type FullscreenTarget = HTMLElement | null

function getFsElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null
    webkitCurrentFullScreenElement?: Element | null
  }
  return document.fullscreenElement || doc.webkitFullscreenElement || doc.webkitCurrentFullScreenElement || null
}

async function requestFs(el: HTMLElement) {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
    webkitEnterFullscreen?: () => void
  }
  if (el.requestFullscreen) {
    await el.requestFullscreen()
    return
  }
  if (anyEl.webkitRequestFullscreen) {
    await anyEl.webkitRequestFullscreen()
    return
  }
  // iOS video-only fullscreen
  const video = el.querySelector('video') as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
  if (video?.webkitEnterFullscreen) {
    video.webkitEnterFullscreen()
    return
  }
  throw new Error('Fullscreen API unavailable')
}

async function exitFs() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
  if (document.exitFullscreen && getFsElement()) {
    await document.exitFullscreen()
    return
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen()
  }
}

async function tryLandscapeLock() {
  try {
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>
    }
    if (orient?.lock) await orient.lock('landscape')
  } catch {
    /* unsupported / denied — ignore */
  }
}

async function tryUnlockOrient() {
  try {
    screen.orientation?.unlock?.()
  } catch {
    /* ignore */
  }
}

export function useFullscreen(targetRef: RefObject<FullscreenTarget>) {
  const [active, setActive] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    const onChange = () => setActive(Boolean(getFsElement()))
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  const enter = useCallback(async () => {
    const el = targetRef.current
    if (!el) return
    try {
      await requestFs(el)
      setFallback(false)
      setSupported(true)
      void tryLandscapeLock()
    } catch {
      // CSS pseudo-fullscreen fallback (iOS Safari etc.)
      setFallback(true)
      setActive(true)
      setSupported(false)
      void tryLandscapeLock()
    }
  }, [targetRef])

  const exit = useCallback(async () => {
    try {
      await exitFs()
    } catch {
      /* ignore */
    }
    setFallback(false)
    setActive(false)
    void tryUnlockOrient()
  }, [])

  const toggle = useCallback(async () => {
    if (active || fallback) await exit()
    else await enter()
  }, [active, fallback, enter, exit])

  return { active: active || fallback, fallback, supported, enter, exit, toggle }
}
