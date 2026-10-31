type PreferenceKey = 'comments' | 'gift-effects' | 'cover-host' | 'cover-viewer'

export function readLiveDisplayPreference(key: PreferenceKey, fallback = true) {
  try {
    const value = window.localStorage.getItem(`pl-live-${key}`)
    return value == null ? fallback : value !== '0'
  } catch { return fallback }
}

export function saveLiveDisplayPreference(key: PreferenceKey, enabled: boolean) {
  try { window.localStorage.setItem(`pl-live-${key}`, enabled ? '1' : '0') } catch { /* device storage may be disabled */ }
}
