type PerformerHubScreenProps = {
  onOpenEntry: () => void
  onOpenStreamRegister: () => void
  onBrowseActs: () => void
  onOpenList: () => void
}

/**
 * 出演者モードのホーム。将来ここにダッシュボード・認証状態を載せる。
 */
export function PerformerHubScreen({ onOpenEntry, onOpenStreamRegister, onBrowseActs, onOpenList }: PerformerHubScreenProps) {
  return (
    <main className="fe-main fe-main--perf-hub">
      <header className="fe-page-head">
        <p className="fe-page-head__eyebrow">Performer</p>
        <h1 className="fe-page-head__title">出演者エリア</h1>
        <p className="fe-page-head__lead">
          ログイン不要の出演者登録です。送信後は運営が内容を確認し、承認された情報が公式アプリに掲載されます。
        </p>
      </header>

      <section className="fe-perf-hub">
        <button type="button" className="fe-btn fe-btn--primary fe-btn--block fe-perf-hub__stream" onClick={onOpenStreamRegister}>
          配信希望パフォーマー登録
        </button>
        <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onOpenEntry}>
          出演登録フォーム（会場出演）
        </button>
        <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onOpenList}>
          登録一覧を見る
        </button>
        <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onBrowseActs}>
          一般向けパフォーマー一覧を見る
        </button>
        <p className="fe-perf-hub__note">
          申請の確認は「登録一覧」から。一般向け一覧を開くと来場者モードへ切り替わります。
        </p>
      </section>
    </main>
  )
}
