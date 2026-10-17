function safeOrigin(value: string | undefined) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null
    return parsed.origin
  } catch {
    return null
  }
}

export function resolveAuthRedirectOrigin(runtimeOrigin: string, configuredOrigin = import.meta.env.VITE_AUTH_REDIRECT_ORIGIN as string | undefined) {
  return safeOrigin(configuredOrigin) ?? safeOrigin(runtimeOrigin) ?? runtimeOrigin
}

export function authRedirectUrl(path: `/${string}`, runtimeOrigin = window.location.origin) {
  return `${resolveAuthRedirectOrigin(runtimeOrigin)}${path}`
}

const AUTH_SECRET_KEYS = new Set(['access_token', 'refresh_token', 'token', 'token_hash', 'code'])

export function sanitizedAuthCallbackUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const search = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const containsSecret = [...AUTH_SECRET_KEYS].some((key) => search.has(key) || hash.has(key))
  if (!containsSecret) return null
  for (const key of [...AUTH_SECRET_KEYS, 'expires_at', 'expires_in', 'provider_token', 'provider_refresh_token', 'type']) {
    search.delete(key)
    hash.delete(key)
  }
  const query = search.toString()
  const fragment = hash.toString()
  return `${location.pathname}${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`
}
