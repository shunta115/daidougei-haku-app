import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Crown, Radio, Search, SlidersHorizontal, Sparkles, TrendingUp } from 'lucide-react'
import { getFeaturedEvent, listVoteRankingNamed, searchPerformers } from '../lib/api'
import type { Performer } from '../lib/types'

type SearchProps = { onOpenPerformer: (id: string) => void; onWatchLive?: (id: string) => void }
type DiscoverMode = 'all' | 'live' | 'popular' | 'new' | 'ranking'
type RankingPeriod = 'today' | 'week' | 'month'

export function SearchScreen({ onOpenPerformer, onWatchLive }: SearchProps) {
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState('')
  const [mode, setMode] = useState<DiscoverMode>('all')
  const [rankingPeriod, setRankingPeriod] = useState<RankingPeriod>('today')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [region, setRegion] = useState('')
  const [rows, setRows] = useState<Performer[]>([])
  const [popularIds, setPopularIds] = useState<string[]>([])
  const [ranking, setRanking] = useState<Array<{ performer: Performer; votes: number }>>([])
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
      .then((ranked) => { setRanking(ranked); setPopularIds(ranked.map((row) => row.performer.id)) })
      .catch(() => { setRanking([]); setPopularIds([]) })
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
      <header className="pl-page-intro"><p>DISCOVER</p><h1>見つける</h1><span>次の好きな人と、偶然出会う。</span></header>
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
        <button type="button" data-active={mode === 'ranking'} onClick={() => setMode('ranking')}><Crown size={15} />ランキング</button>
      </div>

      {genres.length > 0 && mode === 'all' ? <div className="pl-genre-row">{genres.map((item) => <button type="button" key={item} data-active={genre === item} onClick={() => setGenre((current) => current === item ? '' : item)}>{item}</button>)}</div> : null}
      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-inline-loading" role="status">パフォーマーを読み込み中…</p> : null}
      {!loading && !error && visibleRows.length === 0 ? <p className="pl-inline-empty">条件を少し変えると、別のパフォーマーに出会えます。</p> : null}

      {mode === 'ranking' ? (
        <section className="pl-ranking" aria-label="応援ランキング">
          <header><div><p>CHEER RANKING</p><h2>みんなで街を盛り上げる</h2></div></header>
          <div className="pl-ranking__periods" role="tablist" aria-label="ランキング期間">
            <button type="button" role="tab" aria-selected={rankingPeriod === 'today'} data-active={rankingPeriod === 'today'} onClick={() => setRankingPeriod('today')}>今日</button>
            <button type="button" role="tab" aria-selected={rankingPeriod === 'week'} data-active={rankingPeriod === 'week'} onClick={() => setRankingPeriod('week')}>今週</button>
            <button type="button" role="tab" aria-selected={rankingPeriod === 'month'} data-active={rankingPeriod === 'month'} onClick={() => setRankingPeriod('month')}>今月</button>
          </div>
          {rankingPeriod !== 'today' ? <p className="pl-inline-empty">この期間の集計は、データが公開され次第表示されます。</p> : null}
          {rankingPeriod === 'today' ? (ranking.length ? ranking : visibleRows.map((performer) => ({ performer, votes: 0 }))).slice(0, 10).map((row, index) => (
            <button type="button" key={row.performer.id} className="pl-ranking__row" onClick={() => onOpenPerformer(row.performer.id)}>
              <strong className="pl-ranking__place">{index + 1}</strong>
              <span className="pl-ranking__photo">{row.performer.photo_url ? <img src={row.performer.photo_url} alt="" /> : row.performer.stage_name.slice(0, 2)}</span>
              <span className="pl-ranking__name"><strong>{row.performer.stage_name}</strong><small>{row.performer.genre || 'Performance'}</small></span>
              <span className="pl-ranking__score">{row.votes}<small>応援</small></span>
              <ChevronRight size={17} />
            </button>
          )) : null}
          <p className="pl-ranking__message">みんなの応援で、大道芸をもっと盛り上げよう。</p>
        </section>
      ) : <section className="pl-discover-grid" aria-label="パフォーマー">
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
      </section>}
    </main>
  )
}
