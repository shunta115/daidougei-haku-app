import type { LiveVideoOrientation } from './liveOrientation'

export type LiveOrientationMode = LiveVideoOrientation | 'auto'
const STORAGE_KEY = 'haku-live-orientation-v1'

export function liveOrientationStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function readLiveOrientationMode(storage: Pick<Storage, 'getItem'> | null): LiveOrientationMode {
  try {
    const value = storage?.getItem(STORAGE_KEY)
    return value === 'portrait' || value === 'landscape' || value === 'auto' ? value : 'portrait'
  } catch {
    return 'portrait'
  }
}

export function writeLiveOrientationMode(storage: Pick<Storage, 'setItem'> | null, mode: LiveOrientationMode) {
  try { storage?.setItem(STORAGE_KEY, mode) } catch { /* storage access may be disabled */ }
}

export function resolveLiveOrientation(mode: LiveOrientationMode, device: LiveVideoOrientation): LiveVideoOrientation {
  return mode === 'auto' ? device : mode
}
