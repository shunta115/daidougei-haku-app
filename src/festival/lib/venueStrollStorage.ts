/** ステージ巡り / エリア制覇 — 訪問済み会場ID */
const KEY = 'daidougei-haku-venue-stroll-v1'

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function writeIds(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids))
}

export function readVisitedVenues(): string[] {
  return readIds()
}

/** @returns 訪問済みかどうか（トグル後） */
export function toggleVenueVisited(venueId: string): boolean {
  const cur = new Set(readIds())
  const had = cur.has(venueId)
  if (had) cur.delete(venueId)
  else cur.add(venueId)
  writeIds([...cur])
  return !had
}

export function strollProgress(totalVenues: number) {
  const n = readIds().length
  return { visited: n, total: totalVenues, ratio: totalVenues ? Math.min(1, n / totalVenues) : 0 }
}
