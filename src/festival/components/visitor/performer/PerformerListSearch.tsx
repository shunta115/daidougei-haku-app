type PerformerListSearchProps = {
  query: string
  genreId: string
  resultCount: number
  genreChips: readonly { id: string; labelJa: string }[]
  onQueryChange: (q: string) => void
  onGenreChange: (id: string) => void
}

export function PerformerListSearch({
  query,
  genreId,
  resultCount,
  genreChips,
  onQueryChange,
  onGenreChange,
}: PerformerListSearchProps) {
  return (
    <div className="fe-plist-search">
      <label className="fe-plist-search__field">
        <span className="fe-plist-search__lab">名前で検索</span>
        <input
          type="search"
          className="fe-plist-search__input"
          placeholder="演者名・ジャンル・キーワード"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="fe-plist-search__count">{resultCount} 名</p>
      <div className="fe-plist-search__genres" role="group" aria-label="ジャンル">
        {genreChips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`fe-plist-chip${genreId === c.id ? ' fe-plist-chip--on' : ''}`}
            aria-pressed={genreId === c.id}
            onClick={() => onGenreChange(c.id)}
          >
            {c.labelJa}
          </button>
        ))}
      </div>
    </div>
  )
}
