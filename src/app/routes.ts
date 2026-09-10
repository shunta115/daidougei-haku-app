import { trackProductEvent } from '../platform/lib/track'

/** 来場者アプリ（開催情報・時間割・マップ） */
export const FESTIVAL_PATH = '/'

/** 配信・投げ銭・ログイン（既存 Platform） */
export const PLATFORM_PATH = '/live'

export function isPlatformPath(pathname: string): boolean {
  return pathname === PLATFORM_PATH || pathname.startsWith(`${PLATFORM_PATH}/`)
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
