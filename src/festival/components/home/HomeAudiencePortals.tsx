type HomeAudiencePortalsProps = {
  onScrollTips: () => void
}

/**
 * 来場者向けの補助導線。出演者・運営はトップの公式エントリから。
 */
export function HomeAudiencePortals({ onScrollTips }: HomeAudiencePortalsProps) {
  return (
    <section className="fe-portals" aria-label="来場者向けヒント">
      <div className="fe-portals__grid fe-portals__grid--solo">
        <div className="fe-portals__card fe-portals__card--primary">
          <p className="fe-portals__label">来場者向け</p>
          <p className="fe-portals__title">Guest</p>
          <p className="fe-portals__desc">ログイン不要。タイムテーブル・マップ・お気に入り・投げ銭導線までこのままご利用ください。</p>
          <button type="button" className="fe-portals__mini" onClick={onScrollTips}>
            フェスを楽しむヒント
          </button>
        </div>
      </div>
    </section>
  )
}
