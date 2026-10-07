export function hasPasswordRecoveryParams(location: Pick<Location, 'search' | 'hash'> = window.location): boolean {
  return /(?:^|[?#&])type=(?:recovery|invite)(?:&|$)/.test(`${location.search}${location.hash}`)
}
