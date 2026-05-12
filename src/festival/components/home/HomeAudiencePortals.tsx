type HomeAudiencePortalsProps = {
  onScrollTips: () => void
  onPerformer: () => void
  onAdmin: () => void
}

/**
 * 来場者体験を主役にしつつ、出演者・運営入口を同一視認ラインで控えめに配置。
 */
export function HomeAudiencePortals({ onScrollTips, onPerformer, onAdmin }: HomeAudiencePortalsProps) {
  return (
    <section className="fe-portals" aria-label="利用モードの選択">
      <div className="fe-portals__grid">
        <div className="fe-portals__card fe-portals__card--primary">
          <p className="fe-portals__label">来場者向け</p>
          <p className="fe-portals__title">Guest</p>
          <p className="fe-portals__desc">ログイン不要。タイムテーブル・マップ・お気に入り・投げ銭導線までこのままご利用ください。</p>
          <button type="button" className="fe-portals__mini" onClick={onScrollTips}>
            フェスを楽しむヒント
          </button>
        </div>

        <div className="fe-portals__side">
          <button type="button" className="fe-portals__link" onClick={onPerformer}>
            <span className="fe-portals__link-k">出演者・関係者向け</span>
            <span className="fe-portals__link-v">事前登録（ENTRY）</span>
          </button>
          <button type="button" className="fe-portals__link fe-portals__link--dim" onClick={onAdmin}>
            <span className="fe-portals__link-k">運営向け</span>
            <span className="fe-portals__link-v">登録確認（ADMIN）</span>
          </button>
        </div>
      </div>
    </section>
  )
}
