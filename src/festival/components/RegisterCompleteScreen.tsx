type RegisterCompleteScreenProps = {
  onHome: () => void
  onRegisterAnother: () => void
  /** 例: 出演者トップへ */
  homeCtaLabel?: string
}

export function RegisterCompleteScreen({
  onHome,
  onRegisterAnother,
  homeCtaLabel = 'ホームへ',
}: RegisterCompleteScreenProps) {
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
        <h1 className="fe-complete__title">送信完了</h1>
        <p className="fe-complete__message">
          登録ありがとうございます。運営確認後、公式アプリに掲載されます。
        </p>
        <p className="fe-complete__sub" lang="en">
          Thank you. Our team will review your entry before it appears in the official app.
        </p>
        <div className="fe-complete__actions">
          <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={onHome}>
            {homeCtaLabel}
          </button>
          <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={onRegisterAnother}>
            続けて登録する
          </button>
        </div>
      </div>
    </main>
  )
}
