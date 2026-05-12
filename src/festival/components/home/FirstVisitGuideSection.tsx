export function FirstVisitGuideSection() {
  return (
    <section className="fe-guide" aria-labelledby="fe-guide-h">
      <div className="fe-guide__head">
        <h2 id="fe-guide-h" className="fe-section-title">
          <span className="fe-section-title__eyebrow">First visit</span>
          <span className="fe-section-title__main">初めての楽しみ方</span>
        </h2>
        <p className="fe-section-title__sub">街全体がテーマパークになる感覚で、ノープランでも迷わない導線です。</p>
      </div>
      <ol className="fe-guide__steps">
        <li>
          <span className="fe-guide__n">1</span>
          <div>
            <p className="fe-guide__title">ホームで LIVE / NEXT を掴む</p>
            <p className="fe-guide__text">今と次の熱量を確認してから歩き出すと、会場の「鼓動」に乗れます。</p>
          </div>
        </li>
        <li>
          <span className="fe-guide__n">2</span>
          <div>
            <p className="fe-guide__title">マップでエリアの空気を選ぶ</p>
            <p className="fe-guide__text">芝生・ストリート・広場でアクトの質感が変わります。</p>
          </div>
        </li>
        <li>
          <span className="fe-guide__n">3</span>
          <div>
            <p className="fe-guide__title">ハートと投げ銭で応援</p>
            <p className="fe-guide__text">お気に入りは端末保存。投げ銭は外部リンクから（ログイン不要）。</p>
          </div>
        </li>
      </ol>
    </section>
  )
}
