import type { Performer } from '../types'
import { performerMatchesGenreFilter } from './timetableRows'

export function filterPerformers(performers: Performer[], query: string, genreId: string): Performer[] {
  const q = query.trim().toLowerCase()
  return performers.filter((p) => {
    if (genreId !== 'all' && !performerMatchesGenreFilter(p, genreId)) return false
    if (!q) return true
    const hay = [p.name, p.nameJa, p.act, p.actJa, p.genre, p.tagline]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
