import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Radio, Search, SlidersHorizontal, Sparkles, TrendingUp } from 'lucide-react'
import { getFeaturedEvent, listVoteRankingNamed, searchPerformers } from '../lib/api'
import type { Performer } from '../lib/types'

type SearchProps = { onOpenPerformer: (id: string) => void; onWatchLive?: (id: string) => void }
type DiscoverMode = 'all' | 'live' | 'popular' | 'new'

export function SearchScreen({ onOpenPerformer, onWatchLive }: SearchProps) {
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState('')
  const [mode, setMode] = useState<DiscoverMode>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [region, setRegion] = useState('')
  const [rows, setRows] = useState<Performer[]>([])
  const [popularIds, setPopularIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const timer = window.setTimeout(() => {
      searchPerformers(q, { liveOnly: mode === 'live', genre, country: region })
        .then((result) => { if (active) setRows(result) })
        .catch(() => { if (active) setError('検索できませんでした。通信を確認して、もう一度お試しください。') })
        .finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [q, genre, region, mode])

  useEffect(() => {
    void getFeaturedEvent()
      .then((event) => event ? listVoteRankingNamed(event.id) : [])
      .then((ranking) => setPopularIds(ranking.map((row) => row.performer.id)))
      .catch(() => setPopularIds([]))
  }, [])

  const genres = useMemo(() => [...new Set(rows.map((row) => row.genre).filter(Boolean))].slice(0, 8), [rows])
  const visibleRows = useMemo(() => {
    if (mode === 'popular' && popularIds.length) {
      const score = new Map(popularIds.map((id, index) => [id, index]))
      return [...rows].sort((a, b) => (score.get(a.id) ?? 999) - (score.get(b.id) ?? 999))
    }
    if (mode === 'new') return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    return rows
  }, [mode, popularIds, rows])

  return (
    <main className="pl-experience pl-discover-v7">
      <header className="pl-page-intro"><p>DISCOVER</p><h1>次の好きな人を探す。</h1><span>名前、ジャンル、LIVEから直感的に見つけよう。</span></header>
      <div className="pl-search-v7">
        <Search size={20} />
        <input aria-label="パフォーマーを検索" placeholder="名前・ジャンル・地域" value={q} onChange={(event) => setQ(event.target.value)} />
        <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-label="絞り込み"><SlidersHorizontal size={19} /></button>
      </div>
      {filtersOpen ? <div className="pl-filter-glass"><input placeholder="ジャンル" value={genre} onChange={(event) => setGenre(event.target.value)} /><input placeholder="国・都市" value={region} onChange={(event) => setRegion(event.target.value)} /></div> : null}

      <div className="pl-discover-tabs" role="tablist">
        <button type="button" data-active={mode === 'all'} onClick={() => setMode('all')}><Sparkles size={15} />おすすめ</button>
        <button type="button" data-active={mode === 'live'} onClick={() => setMode('live')}><Radio size={15} />LIVE</button>
        <button type="button" data-active={mode === 'popular'} onClick={() => setMode('popular')}><TrendingUp size={15} />人気</button>
        <button type="button" data-active={mode === 'new'} onClick={() => setMode('new')}>新着</button>
      </div>

      {genres.length > 0 && mode === 'all' ? <div className="pl-genre-row">{genres.map((item) => <button type="button" key={item} data-active={genre === item} onClick={() => setGenre((current) => current === item ? '' : item)}>{item}</button>)}</div> : null}
      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-inline-loading" role="status">パフォーマーを読み込み中…</p> : null}
      {!loading && !error && visibleRows.length === 0 ? <p className="pl-inline-empty">条件を少し変えると、別のパフォーマーに出会えます。</p> : null}

      <section className="pl-discover-grid" aria-label="パフォーマー">
        {visibleRows.map((performer, index) => (
          <article key={performer.id} className={`pl-discover-card${index === 0 ? ' pl-discover-card--feature' : ''}`}>
            <button type="button" className="pl-discover-card__media" onClick={() => performer.is_live && onWatchLive ? onWatchLive(performer.id) : onOpenPerformer(performer.id)}>
              {performer.photo_url ? <img src={performer.photo_url} alt="" loading="lazy" /> : <span>{performer.stage_name.slice(0, 2)}</span>}
              <span className="pl-discover-card__scrim" />
              {performer.is_live ? <em><Radio size={11} /> LIVE</em> : null}
              <span className="pl-discover-card__copy"><strong>{performer.stage_name}</strong><small>{[performer.genre, performer.city].filter(Boolean).join(' · ') || 'Performance'}</small></span>
            </button>
            <button type="button" className="pl-discover-card__open" onClick={() => onOpenPerformer(performer.id)}>プロフィール <ChevronRight size={16} /></button>
          </article>
        ))}
      </section>
    </main>
  )
}
