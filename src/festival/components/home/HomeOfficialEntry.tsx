type HomeOfficialEntryProps = {
  onStreamRegister: () => void
  onAdmin: () => void
}

/**
 * 来場者トップ下部：配信登録・運営の公開導線。
 */
export function HomeOfficialEntry({ onStreamRegister, onAdmin }: HomeOfficialEntryProps) {
  return (
    <div className="fe-official-entry" aria-label="パフォーマー・運営向け">
      <button type="button" className="fe-official-entry__perf" onClick={onStreamRegister}>
        <span className="fe-official-entry__perf-ja">配信希望パフォーマー登録</span>
        <span className="fe-official-entry__perf-en" lang="en">
          STREAM PERFORMER SIGN-UP
        </span>
      </button>
      <button type="button" className="fe-official-entry__admin" onClick={onAdmin}>
        運営管理
      </button>
    </div>
  )
}
