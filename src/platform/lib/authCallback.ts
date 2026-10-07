export function hasPasswordRecoveryParams(location: Pick<Location, 'search' | 'hash'> = window.location): boolean {
  const params = `${location.search}${location.hash}`
  return /(?:^|[?#&])type=(?:recovery|invite)(?:&|$)/.test(params)
    || /(?:^|[?&])auth=recovery(?:&|$)/.test(location.search)
}
