const XP_KEY = 'daidougei-haku-xp-v1'
const STAMP_KEY = 'daidougei-haku-stamp-performers-v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function readXp(): number {
  const n = Number(localStorage.getItem(XP_KEY))
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

export function bumpXp(delta: number): number {
  const next = Math.max(0, readXp() + delta)
  localStorage.setItem(XP_KEY, String(next))
  return next
}

/** チェックイン済みパフォーマー ID（ユニーク） */
export function readStampedPerformerIds(): string[] {
  return readJson<string[]>(STAMP_KEY, [])
}

export function stampCheckIn(performerId: string): { ids: string[]; badgeUnlocked: boolean } {
  const cur = new Set(readStampedPerformerIds())
  cur.add(performerId)
  const ids = [...cur]
  writeJson(STAMP_KEY, ids)
  bumpXp(12)
  return { ids, badgeUnlocked: ids.length >= 3 }
}

export function stampProgress(): { count: number; badgeUnlocked: boolean } {
  const ids = readStampedPerformerIds()
  return { count: ids.length, badgeUnlocked: ids.length >= 3 }
}
