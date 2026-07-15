type StreamPerformerRegisterCompleteScreenProps = {
  onBackHub: () => void
  fromVisitor?: boolean
}

export function StreamPerformerRegisterCompleteScreen({
  onBackHub,
  fromVisitor,
}: StreamPerformerRegisterCompleteScreenProps) {
  return (
    <main className="fe-main fe-main--stream-reg">
      <section className="fe-stream-reg-done">
        <p className="fe-stream-reg-done__badge" lang="en">
          UNDER REVIEW
        </p>
        <h1 className="fe-stream-reg-done__title">審査中</h1>
        <p className="fe-stream-reg-done__lead">
          配信希望の登録を受け付けました。事務局が内容を確認し、承認されたパフォーマーにのみ配信権限を付与します。
        </p>
        <p className="fe-stream-reg-done__note">結果は登録メールアドレスへご連絡する想定です（デモ）。</p>
        <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={onBackHub}>
          {fromVisitor ? 'ホームへ戻る' : '出演者エリアへ戻る'}
        </button>
      </section>
    </main>
  )
}
