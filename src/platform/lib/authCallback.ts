import { PASSWORD_RESET_PATH } from '../../app/routes'

export function hasPasswordRecoveryParams(location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): boolean {
  const params = `${location.search}${location.hash}`
  return location.pathname === PASSWORD_RESET_PATH
    || /(?:^|[?#&])type=(?:recovery|invite)(?:&|$)/.test(params)
    || /(?:^|[?&])auth=recovery(?:&|$)/.test(location.search)
}
