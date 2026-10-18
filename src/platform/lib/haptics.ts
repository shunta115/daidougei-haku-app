export type HapticResult = 'vibrated' | 'native-requested' | 'unavailable'

/**
 * Best-effort light feedback for the web. iOS Safari/PWA does not expose the
 * Vibration API; the custom event is an explicit bridge point for a native
 * WKWebView wrapper to invoke UIImpactFeedbackGenerator(.light).
 */
export function triggerLightHaptic(nav: Pick<Navigator, 'vibrate'> | undefined = globalThis.navigator): HapticResult {
  if (typeof nav?.vibrate === 'function') {
    return nav.vibrate(10) ? 'vibrated' : 'unavailable'
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('haku:native-haptic', { detail: { style: 'light' } }))
    return 'native-requested'
  }
  return 'unavailable'
}
