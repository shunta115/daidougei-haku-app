type PerformerHubScreenProps = {
  onOpenEntry: () => void
  onBrowseActs: () => void
}

/**
 * 出演者モードのホーム。将来ここにダッシュボード・認証状態を載せる。
 */
export function PerformerHubScreen({ onOpenEntry, onBrowseActs }: PerformerHubScreenProps) {
  return (
    <main className="fe-main fe-main--perf-hub">
      <header className="fe-page-head">
        <p className="fe-page-head__eyebrow">Performer &amp; crew</p>
        <h1 className="fe-page-head__title">出演者エリア</h1>
        <p className="fe-page-head__lead">
          現段階はログイン不要の専用フォームです。送信内容は運営が確認し、承認後に公式アプリへ反映されます。将来はこのエリアにログインセッションを載せる前提で分割しています。
        </p>
      </header>

      <section className="fe-perf-hub">
        <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={onOpenEntry}>
          事前登録フォームを開く
        </button>
        <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onBrowseActs}>
          一般向けパフォーマー一覧を見る
        </button>
        <p className="fe-perf-hub__note">
          一般向け一覧を開くと、閲覧用に来場者モードへ切り替わります（下部ナビがフェス標準に戻ります）。
        </p>
      </section>
    </main>
  )
}
