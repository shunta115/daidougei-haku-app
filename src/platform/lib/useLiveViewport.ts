import { useEffect, useState } from 'react'

/** Safari's visual viewport shrinks when the keyboard opens; 100svh does not. */
export function useLiveViewportHeight() {
  const [height, setHeight] = useState(() => typeof window === 'undefined' ? null : Math.round(window.visualViewport?.height ?? window.innerHeight))
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => setHeight(Math.round(viewport?.height ?? window.innerHeight))
    viewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => { viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update) }
  }, [])
  return height ? `${height}px` : '100dvh'
}
