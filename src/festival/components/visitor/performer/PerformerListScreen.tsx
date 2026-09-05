import { useMemo, useState } from 'react'
import type { Performer } from '../../../types'
import { readFavorites } from '../../../lib/favoritesStorage'
import { filterPerformers } from '../../../lib/performerListFilters'
import { shouldShowAsLiveStream } from '../../../lib/streamPresence'
import { useLang } from '../../../../i18n/LangProvider'
import { PerformerListCard } from './PerformerListCard'
import { PerformerListSearch } from './PerformerListSearch'

function liveRank(p: Performer) {
  if (shouldShowAsLiveStream(p)) return 0
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
  const { t } = useLang()

  const filtered = useMemo(() => {
    const rows = filterPerformers([...performers], query, genreId)
    return rows.sort((a, b) => liveRank(a) - liveRank(b) || b.heat - a.heat)
  }, [performers, query, genreId])

  const liveCount = performers.filter(shouldShowAsLiveStream).length

  return (
    <main className="fe-main fe-main--list fe-plist">
      <header className="fe-list-hero">
        <p className="fe-list-hero__eyebrow">{t('eventName')}</p>
        <h1 className="fe-list-hero__title">{t('actsTitle')}</h1>
        <p className="fe-list-hero__sub">
          {performers.length === 0
            ? t('comingSoonRoster')
            : liveCount > 0
              ? `${t('liveNow')} ${liveCount}`
              : t('findActs')}
        </p>
      </header>

      {performers.length === 0 ? (
        <p className="fe-public-prep" role="status">
          {t('comingSoonRoster')}
        </p>
      ) : (
        <>
          <PerformerListSearch
            query={query}
            genreId={genreId}
            resultCount={filtered.length}
            onQueryChange={setQuery}
            onGenreChange={setGenreId}
          />

          <div className="fe-plist-stack">
            {filtered.length === 0 ? (
              <p className="fe-plist-empty">{t('noMatchActs')}</p>
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
        </>
      )}
    </main>
  )
}
