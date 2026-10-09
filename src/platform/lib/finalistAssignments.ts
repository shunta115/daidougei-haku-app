type FinalSlot = {
  id: string
  performance_type?: 'regular' | 'special_final'
  ranking_position?: number | null
}

type RankingRow = { performer_id: string }

export function buildFinalistAssignments<T extends FinalSlot>(slots: T[], ranking: RankingRow[]) {
  const finals = slots.filter((slot) => slot.performance_type === 'special_final')
  if (finals.length === 0 || ranking.length < 3) return null

  const assignments = finals.map((slot) => {
    const rank = slot.ranking_position
    if (!Number.isInteger(rank) || !rank || rank < 1 || rank > 3) return null
    const performerId = ranking[rank - 1]?.performer_id
    return performerId ? { slot, performerId } : null
  })
  if (assignments.some((assignment) => assignment === null)) return null

  const representedRanks = new Set(finals.map((slot) => slot.ranking_position))
  if (![1, 2, 3].every((rank) => representedRanks.has(rank))) return null
  return assignments as Array<{ slot: T; performerId: string }>
}
