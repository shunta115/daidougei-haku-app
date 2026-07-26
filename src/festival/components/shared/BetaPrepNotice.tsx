type BetaPrepNoticeProps = {
  message: string
  onClose: () => void
}

/** β版の準備中メッセージ（既存 thanks モーダルと同系統） */
export function BetaPrepNotice({ message, onClose }: BetaPrepNoticeProps) {
  return (
    <div className="fe-live-thanks" role="dialog" aria-labelledby="fe-beta-prep-title">
      <div className="fe-live-thanks__card">
        <p className="fe-live-thanks__k" lang="en">
          BETA
        </p>
        <h3 id="fe-beta-prep-title" className="fe-live-thanks__title">
          準備中
        </h3>
        <p className="fe-live-thanks__body">{message}</p>
        <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={onClose}>
          戻る
        </button>
      </div>
    </div>
  )
}
