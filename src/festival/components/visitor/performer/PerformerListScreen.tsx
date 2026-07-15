import { useMemo, useState } from 'react'
import type { Performer } from '../../../types'
import { readFavorites } from '../../../lib/favoritesStorage'
import { filterPerformers } from '../../../lib/performerListFilters'
import { PerformerListCard } from './PerformerListCard'
import { PerformerListSearch } from './PerformerListSearch'

function liveRank(p: Performer) {
  if (p.approvalStatus === 'approved' && p.canStream && p.isLive) return 0
  if (p.approvalStatus === 'approved' && p.canStream) return 1
  return 2
}

export type PerformerListScreenProps = {
  performers: readonly Performer[]
  favTick: number
  onOpenDetail: (id: string) => void
  onToggleFavorite: (id: string) => void
  onWatchStream: (id: string) => void
  onSupportStream: (id: string) => void
}

export function PerformerListScreen({
  performers,
  favTick,
  onOpenDetail,
  onToggleFavorite,
  onWatchStream,
  onSupportStream,
}: PerformerListScreenProps) {
  const [query, setQuery] = useState('')
  const [genreId, setGenreId] = useState('all')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- favTick invalidates localStorage read
  const favIds = useMemo(() => readFavorites(), [favTick])

  const filtered = useMemo(() => {
    const rows = filterPerformers([...performers], query, genreId)
    return rows.sort((a, b) => liveRank(a) - liveRank(b) || b.heat - a.heat)
  }, [performers, query, genreId])

  const liveCount = performers.filter(
    (p) => p.approvalStatus === 'approved' && p.canStream && p.isLive,
  ).length

  return (
    <main className="fe-main fe-main--list fe-plist">
      <header className="fe-list-hero">
        <p className="fe-list-hero__eyebrow">Global roster · LIVE ready</p>
        <h1 className="fe-list-hero__title">出演 · 配信</h1>
        <p className="fe-list-hero__sub">
          {liveCount > 0
            ? `いま ${liveCount} 組がライブ配信中 — 視聴とWEB応援はここから`
            : '承認されたパフォーマーの配信・会場出演を探せます'}
        </p>
      </header>

      <PerformerListSearch
        query={query}
        genreId={genreId}
        resultCount={filtered.length}
        onQueryChange={setQuery}
        onGenreChange={setGenreId}
      />

      <div className="fe-plist-stack">
        {filtered.length === 0 ? (
          <p className="fe-plist-empty">該当する出演者がいません。検索語やジャンルを変えてみてください。</p>
        ) : null}
        {filtered.map((p) => (
          <PerformerListCard
            key={p.id}
            performer={p}
            isFavorite={favIds.includes(p.id)}
            onOpenDetail={onOpenDetail}
            onToggleFavorite={onToggleFavorite}
            onWatchStream={onWatchStream}
            onSupportStream={onSupportStream}
          />
        ))}
      </div>
    </main>
  )
}
