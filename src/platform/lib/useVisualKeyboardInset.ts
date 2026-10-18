import { useEffect } from 'react'

/** Keeps the LIVE composer above the iOS Safari/PWA software keyboard. */
export function useVisualKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      root.style.setProperty('--live-keyboard-inset', `${Math.round(inset)}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      root.style.removeProperty('--live-keyboard-inset')
    }
  }, [])
}
