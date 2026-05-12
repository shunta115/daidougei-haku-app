import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { readFavorites, toggleFavorite } from '../../lib/favoritesStorage'

type LibraryScreenProps = {
  performers: Performer[]
  favTick: number
  onFavoritesChange: () => void
  onOpenPerformer?: (id: string) => void
}

export function LibraryScreen({ performers, favTick, onFavoritesChange, onOpenPerformer }: LibraryScreenProps) {
  const ids = readFavorites()
  const saved = performers.filter((p) => ids.includes(p.id))

  return (
    <main className="fe-main fe-main--sub" data-fav-tick={favTick}>
      <header className="fe-page-head">
        <p className="fe-page-head__eyebrow">Library</p>
        <h1 className="fe-page-head__title">お気に入り &amp; 投げ銭</h1>
        <p className="fe-page-head__lead">お気に入りは端末に保存。投げ銭は各アーティストの外部リンクから（ログイン不要）。</p>
      </header>

      <section className="fe-lib-block" aria-labelledby="fe-fav-h">
        <h2 id="fe-fav-h" className="fe-lib-h">
          お気に入り
        </h2>
        {saved.length === 0 ? (
          <p className="fe-lib-empty">まだありません。Acts タブでハートをタップしてください。</p>
        ) : (
          <ul className="fe-lib-fav">
            {saved.map((p) => (
              <li key={p.id} className="fe-lib-fav__row">
                <button
                  type="button"
                  className="fe-lib-fav__main"
                  onClick={() => onOpenPerformer?.(p.id)}
                  disabled={!onOpenPerformer}
                >
                  <div className="fe-lib-fav__av" style={{ background: p.gradient }}>
                    <span>{initials(p.name)}</span>
                  </div>
                  <div className="fe-lib-fav__body">
                    <p className="fe-lib-fav__name">{p.name}</p>
                    <p className="fe-lib-fav__sub">{p.act}</p>
                  </div>
                </button>
                <button
                  type="button"
                  className="fe-lib-fav__remove"
                  onClick={() => {
                    toggleFavorite(p.id)
                    onFavoritesChange()
                  }}
                  aria-label={`${p.name} をお気に入りから外す`}
                >
                  解除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fe-lib-block" aria-labelledby="fe-tip-h">
        <h2 id="fe-tip-h" className="fe-lib-h">
          投げ銭（お気に入り）
        </h2>
        <p className="fe-lib-tip">演目後のサポートはここから。複数決済サービスに対応したリンクを表示（デモ）。</p>
        {saved.length === 0 ? (
          <p className="fe-lib-empty">お気に入りに追加すると、そのアーティストの投げ銭リンクが並びます。</p>
        ) : (
          <ul className="fe-lib-tip-list">
            {saved.map((p) => (
              <li key={p.id} className="fe-lib-tip-card">
                <p className="fe-lib-tip-card__name">{p.nameJa}</p>
                <div className="fe-lib-tip-card__links">
                  {(p.tipLinks ?? []).map((t) => (
                    <a key={t.id} className="fe-btn fe-btn--glass fe-btn--compact" href={t.url} target="_blank" rel="noopener noreferrer">
                      {t.labelJa}
                    </a>
                  ))}
                  {(p.tipLinks ?? []).length === 0 ? <span className="fe-lib-muted">リンク未設定</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fe-lib-block" aria-labelledby="fe-tip2-h">
        <h2 id="fe-tip2-h" className="fe-lib-h">
          一般リンク（例）
        </h2>
        <p className="fe-lib-tip">アプリ外の汎用例。本番では公式の一本化された導線に差し替え。</p>
        <div className="fe-lib-actions">
          <a className="fe-btn fe-btn--glass fe-btn--block" href="https://ko-fi.com" target="_blank" rel="noopener noreferrer">
            Ko-fi（外部例）
          </a>
          <a className="fe-btn fe-btn--glass fe-btn--block" href="https://paypal.com" target="_blank" rel="noopener noreferrer">
            PayPal（外部例）
          </a>
        </div>
      </section>
    </main>
  )
}
