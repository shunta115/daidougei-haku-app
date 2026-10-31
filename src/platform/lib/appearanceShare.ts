import type { PerformerAppearance } from './types'

export function appearanceLandingUrl(origin: string, performerId: string, appearanceId: string) {
  const url = new URL('/', origin)
  url.searchParams.set('profile', performerId)
  // Legacy event slots land on the existing profile timetable, not an appearance ID.
  if (!appearanceId.startsWith('event-slot:')) url.searchParams.set('schedule', appearanceId)
  return url.toString()
}

export function appearanceShareText(stageName: string, appearance: PerformerAppearance) {
  const status = appearance.status === 'cancelled' ? '【中止】' : appearance.status === 'postponed' ? '【延期】' : ''
  return `${status}${stageName}｜${appearance.title}\n${appearance.performance_date} ${appearance.start_time.slice(0, 5)}｜${appearance.venue_name}`
}

export function appearanceShareLinks(url: string, text: string) {
  return {
    line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  }
}

export async function shareAppearance(url: string, text: string) {
  if (navigator.share) {
    try { await navigator.share({ title: 'HAKU 出演予定', text, url }); return 'shared' as const }
    catch (error) { if (isShareCancellation(error)) return 'cancelled' as const }
  }
  await copyAppearanceUrl(url)
  return 'copied' as const
}

export function isShareCancellation(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export async function copyAppearanceUrl(url: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); return } catch { /* Safari permission fallback */ }
  }
  const input = document.createElement('input')
  const previousFocus = document.activeElement
  input.value = url
  input.readOnly = true
  input.style.position = 'fixed'
  input.style.opacity = '0'
  input.style.fontSize = '16px'
  document.body.append(input)
  try {
    input.focus({ preventScroll: true })
    input.select()
    input.setSelectionRange(0, url.length)
    if (!document.execCommand('copy')) throw new Error('copy_failed')
  } finally {
    input.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
  }
}
