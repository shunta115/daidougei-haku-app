import { trackProductEvent } from '../platform/lib/track'

/** 来場者向けイベント情報（開催情報・時間割・マップ） */
export const FESTIVAL_PATH = '/event'

/** 常設プラットフォーム内のイベント一覧と個別イベント */
export const EVENTS_PATH = '/events'
export const AWP_EVENT_SLUG = 'award-winning-performers-2026'
export const PERFORMER_PATH = '/performer'

/** 配信・投げ銭・ログイン（既存 Platform） */
export const PLATFORM_PATH = '/live'
export const MAP_PATH = '/map'
export const PASSWORD_RESET_PATH = '/auth/reset-password'

export function isPlatformPath(pathname: string): boolean {
  // All public routes render inside the MASTER experience. /live remains a
  // stable alias because registration and shared LIVE links already use it.
  return pathname === '/' || pathname === FESTIVAL_PATH || pathname === MAP_PATH || pathname === EVENTS_PATH || pathname.startsWith(`${EVENTS_PATH}/`) || pathname === PERFORMER_PATH || pathname.startsWith(`${PERFORMER_PATH}/`) || pathname === PLATFORM_PATH || pathname.startsWith(`${PLATFORM_PATH}/`) || pathname === PASSWORD_RESET_PATH
}

export function eventPath(slug: string): string {
  return `${EVENTS_PATH}/${encodeURIComponent(slug)}`
}

export function eventVotePath(slug = AWP_EVENT_SLUG): string {
  return `${eventPath(slug)}/vote`
}

export function parseEventsPath(pathname: string): { kind: 'list' } | { kind: 'detail'; slug: string } | { kind: 'vote'; slug: string } | null {
  if (pathname === EVENTS_PATH) return { kind: 'list' }
  if (!pathname.startsWith(`${EVENTS_PATH}/`)) return null
  const rest = decodeURIComponent(pathname.slice(EVENTS_PATH.length + 1))
  if (rest.endsWith('/vote')) {
    const slug = rest.slice(0, -'/vote'.length)
    return slug ? { kind: 'vote', slug } : { kind: 'list' }
  }
  return rest ? { kind: 'detail', slug: rest } : { kind: 'list' }
}

export function performerPath(id: string): string {
  return `${PERFORMER_PATH}/${encodeURIComponent(id)}`
}

export function parsePerformerPath(pathname: string): { id: string } | null {
  if (!pathname.startsWith(`${PERFORMER_PATH}/`)) return null
  const id = decodeURIComponent(pathname.slice(PERFORMER_PATH.length + 1)).split('/').filter(Boolean)[0]
  return id ? { id } : null
}

/** フルリロードせず Festival / Platform を切り替える */
export function spaGo(path: string): void {
  const url = new URL(path, window.location.origin)
  const next = `${url.pathname}${url.search}${url.hash}`
  const curr = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== curr) {
    window.history.pushState({}, '', next)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function openPlatform(query = ''): void {
  const suffix = !query ? '' : query.startsWith('?') ? query : `?${query}`
  spaGo(`${PLATFORM_PATH}${suffix}`)
}

export function openFestival(): void {
  spaGo(FESTIVAL_PATH)
}

export function openLiveWatch(performerId: string): void {
  spaGo(`${PLATFORM_PATH}?watch=${encodeURIComponent(performerId)}`)
}

export function openTip(performerId: string): void {
  trackProductEvent('tip_cta_click', { performerId, props: { surface: 'festival' } })
  spaGo(`${PLATFORM_PATH}?tipTo=${encodeURIComponent(performerId)}`)
}
