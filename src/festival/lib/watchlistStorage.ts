/**
 * 「見たい」リスト（パフォーマーID）。推し（お気に入り）とは別枠で回遊導線用。
 */
const STORAGE_KEY = 'daidougei-haku-watchlist-v1'

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function writeIds(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export function readWatchlist(): string[] {
  return readIds()
}

export function toggleWatchlist(performerId: string): boolean {
  const cur = readIds()
  const has = cur.includes(performerId)
  const next = has ? cur.filter((id) => id !== performerId) : [...cur, performerId]
  writeIds(next)
  return !has
}

export function isOnWatchlist(performerId: string) {
  return readIds().includes(performerId)
}
