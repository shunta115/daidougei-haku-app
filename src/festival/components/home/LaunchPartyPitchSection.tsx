const PERFORMER_MERITS: string[] = [
  'お客様に見つけてもらいやすくなる',
  '次の出演が分かりやすくなる',
  'SNS導線が増える',
  '投げ銭導線が増える',
  'プロフィールが資産化される',
  '海外客にも届く',
  'ファン化しやすくなる',
]

const FUTURE_CHANGES: string[] = [
  '街全体がテーマパーク化',
  '回遊率向上',
  '演者ごとの集客可視化',
  '海外対応',
  'LIVE通知',
  'TikTok LIVE連携',
  'スタンプラリー',
  '観客投票',
  'スポンサー連携',
  'データ活用',
]

/**
 * 打ち上げ・出演者向け：メリット / 未来像 / QR 枠を一枚で説明しやすくする。
 */
export function LaunchPartyPitchSection() {
  return (
    <section className="fe-launch" id="fe-launch-anchor" aria-labelledby="fe-launch-title">
      <div className="fe-launch__halo" aria-hidden="true" />

      <header className="fe-launch__hero">
        <p className="fe-launch__eyebrow">Launch demo</p>
        <h2 id="fe-launch-title" className="fe-launch__title">
          明日からこう変わります
        </h2>
        <p className="fe-launch__lead">
          来場者アプリを中心に、発見・回遊・応援がつながる。今日のデモはダミーデータと localStorage です。
        </p>
      </header>

      <div className="fe-launch__block">
        <h3 className="fe-launch__h">出演者メリット</h3>
        <p className="fe-launch__sub">ワンタップで伝える · カードはそのまま画面共有に使えます</p>
        <ul className="fe-launch__grid fe-launch__grid--merits">
          {PERFORMER_MERITS.map((text) => (
            <li key={text} className="fe-launch-card">
              <span className="fe-launch-card__glyph" aria-hidden="true" />
              <span className="fe-launch-card__text">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="fe-launch__block fe-launch__block--future">
        <h3 className="fe-launch__h">このアプリで変わる未来</h3>
        <p className="fe-launch__sub">フェス全体のOSとして拡張していくロードマップ（構想）</p>
        <ul className="fe-launch__grid fe-launch__grid--future">
          {FUTURE_CHANGES.map((text) => (
            <li key={text} className="fe-launch-card fe-launch-card--future">
              <span className="fe-launch-card__text">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="fe-launch__block">
        <h3 className="fe-launch__h">QR 導線</h3>
        <p className="fe-launch__sub">印刷・スライド用の余白。実 QR は運営素材に差し替えください</p>
        <div className="fe-launch-qr">
          <figure className="fe-launch-qr__slot">
            <div className="fe-launch-qr__frame" aria-hidden="true" />
            <figcaption className="fe-launch-qr__cap">出演者登録はこちら</figcaption>
          </figure>
          <figure className="fe-launch-qr__slot">
            <div className="fe-launch-qr__frame" aria-hidden="true" />
            <figcaption className="fe-launch-qr__cap">来場者アプリはこちら</figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
