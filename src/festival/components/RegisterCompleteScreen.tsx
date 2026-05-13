type RegisterCompleteScreenProps = {
  /** 来場者トップへ */
  onTop: () => void
  /** 直前の登録内容をフォームで再編集 */
  onReEdit: () => void
}

export function RegisterCompleteScreen({ onTop, onReEdit }: RegisterCompleteScreenProps) {
  return (
    <main className="fe-main fe-main--complete">
      <div className="fe-complete">
        <div className="fe-complete__glow" aria-hidden="true" />
        <div className="fe-complete__icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 7 10 17l-5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="fe-complete__title">登録を受け付けました</h1>
        <p className="fe-complete__message">
          登録ありがとうございます。運営確認後、公式アプリに掲載されます。
        </p>
        <div className="fe-complete__actions">
          <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={onTop}>
            トップへ戻る
          </button>
          <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onReEdit}>
            内容を再編集する
          </button>
        </div>
      </div>
    </main>
  )
}
