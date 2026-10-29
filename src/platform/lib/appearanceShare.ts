import type { PerformerAppearance } from './types'

export function appearanceLandingUrl(origin: string, performerId: string, appearanceId: string) {
  const url = new URL('/', origin)
  url.searchParams.set('profile', performerId)
  url.searchParams.set('schedule', appearanceId)
  return url.toString()
}

export function appearanceShareText(stageName: string, appearance: PerformerAppearance) {
  return `${stageName}｜${appearance.title}\n${appearance.performance_date} ${appearance.start_time.slice(0, 5)}｜${appearance.venue_name}`
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
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled' as const }
  }
  await copyAppearanceUrl(url)
  return 'copied' as const
}

export async function copyAppearanceUrl(url: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(url)
  const input = document.createElement('input')
  input.value = url
  input.readOnly = true
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) throw new Error('copy_failed')
}
