const XP_KEY = 'daidougei-haku-xp-v1'
const STAMP_KEY = 'daidougei-haku-stamps-v1'
const STAMP_GOAL = 3

function readXp(): number {
  try {
    const raw = localStorage.getItem(XP_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function readStampIds(): string[] {
  try {
    const raw = localStorage.getItem(STAMP_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function writeStampIds(ids: string[]) {
  localStorage.setItem(STAMP_KEY, JSON.stringify(ids))
}

export function bumpXp(amount: number): number {
  const next = readXp() + amount
  localStorage.setItem(XP_KEY, String(next))
  return next
}

export function readXpTotal(): number {
  return readXp()
}

export function stampProgress() {
  const count = readStampIds().length
  return { count, badgeUnlocked: count >= STAMP_GOAL }
}

/** ライブ会場チェックイン（デモ） */
export function stampCheckIn(performerId: string): boolean {
  const cur = readStampIds()
  if (cur.includes(performerId)) return false
  writeStampIds([...cur, performerId])
  return true
}
