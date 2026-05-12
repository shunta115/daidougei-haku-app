/**
 * 打ち上げ用：来場者 / 出演者 / 運営 / スポンサーのメリットを一瞬で伝える。
 */
export function PresentationDeckSection() {
  return (
    <section className="fe-vision" id="fe-present-anchor" aria-labelledby="fe-vision-h">
      <div className="fe-vision__glow" aria-hidden="true" />
      <header className="fe-vision__head">
        <p className="fe-vision__eyebrow">Tomorrow</p>
        <h2 id="fe-vision-h" className="fe-vision__title">
          このアプリで大道芸博は、こう変わる
        </h2>
        <p className="fe-vision__lead">
          ログイン不要の来場者アプリを核に、出演募集・運営・スポンサー価値を同じ体験レイヤーへ集約します（現在はダミー + localStorage）。
        </p>
      </header>

      <div className="fe-vision__grid">
        <article className="fe-vision-card">
          <span className="fe-vision-card__tag">Guest</span>
          <h3 className="fe-vision-card__title">来場者</h3>
          <p className="fe-vision-card__text">開いた瞬間に「行く場所・次の演目・熱量」が分かる。マップ・タイムテーブル・投げ銭までワンタップ。</p>
        </article>
        <article className="fe-vision-card fe-vision-card--magenta">
          <span className="fe-vision-card__tag">Artist</span>
          <h3 className="fe-vision-card__title">出演者</h3>
          <p className="fe-vision-card__text">ENTRY で宣材・投げ銭リンクを提出。承認後は同じデータがアプリに反映（Supabase 移行で本番化）。</p>
        </article>
        <article className="fe-vision-card fe-vision-card--gold">
          <span className="fe-vision-card__tag">Ops</span>
          <h3 className="fe-vision-card__title">運営</h3>
          <p className="fe-vision-card__text">ADMIN で登録審査・変更反映の入口。スケジュール / お知らせ管理を次フェーズで同一 UI に接続。</p>
        </article>
        <article className="fe-vision-card fe-vision-card--cyan">
          <span className="fe-vision-card__tag">Partner</span>
          <h3 className="fe-vision-card__title">スポンサー</h3>
          <p className="fe-vision-card__text">エリア熱量・スタンプ・投票など「見える化」された接触回数に紐づけたネイティブ枠を設計予定。</p>
        </article>
      </div>
    </section>
  )
}
