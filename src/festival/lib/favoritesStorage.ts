/**
 * お気に入り（パフォーマーID）。将来はユーザーアカウントと同期する想定。
 */
const STORAGE_KEY = 'daidougei-haku-favorites-v1'

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

export function readFavorites(): string[] {
  return readIds()
}

export function isFavorite(performerId: string) {
  return readIds().includes(performerId)
}

/** @returns トグル後にお気に入りかどうか */
export function toggleFavorite(performerId: string): boolean {
  const cur = readIds()
  const has = cur.includes(performerId)
  const next = has ? cur.filter((id) => id !== performerId) : [...cur, performerId]
  writeIds(next)
  return !has
}
