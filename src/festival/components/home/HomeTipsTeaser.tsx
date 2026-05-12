type HomeTipsTeaserProps = {
  onOpenLibrary: () => void
}

/** ホーム上の投げ銭導線（#fe-home-tips） */
export function HomeTipsTeaser({ onOpenLibrary }: HomeTipsTeaserProps) {
  return (
    <section className="fe-home-tips" id="fe-home-tips" aria-labelledby="fe-home-tips-h">
      <div className="fe-home-tips__glow" aria-hidden="true" />
      <div className="fe-home-tips__inner">
        <p className="fe-home-tips__eyebrow">Tips · 投げ銭</p>
        <h2 id="fe-home-tips-h" className="fe-home-tips__title">
          感動のあとに、そのままサポート
        </h2>
        <p className="fe-home-tips__text">
          PayPay / Stripe / Square / OFUSE など、各アーティストが選んだ外部リンクから投げ銭できます。ログイン不要。お気に入りに入れた出演者はライブラリからいつでも開けます。
        </p>
        <div className="fe-home-tips__actions">
          <button type="button" className="fe-btn fe-btn--primary" onClick={onOpenLibrary}>
            ライブラリへ
          </button>
        </div>
      </div>
    </section>
  )
}
