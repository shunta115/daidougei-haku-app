export type LiveVideoOrientation = 'portrait' | 'landscape'

/** matchMedia is stable across Safari toolbar/keyboard viewport resizing. */
export function detectLiveVideoOrientation(): LiveVideoOrientation {
  if (typeof window === 'undefined') return 'portrait'
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'
  }
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
}
