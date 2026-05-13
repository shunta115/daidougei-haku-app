type HomeOfficialEntryProps = {
  onPerformerRegister: () => void
  onAdmin: () => void
}

/**
 * 来場者トップ：出演者・運営向けの公式導線（目立ちすぎないが迷わない配置）。
 */
export function HomeOfficialEntry({ onPerformerRegister, onAdmin }: HomeOfficialEntryProps) {
  return (
    <div className="fe-official-entry" aria-label="出演者・運営向け">
      <button type="button" className="fe-official-entry__perf" onClick={onPerformerRegister}>
        <span className="fe-official-entry__perf-ja">出演者登録</span>
        <span className="fe-official-entry__perf-en" lang="en">
          PERFORMER ENTRY
        </span>
      </button>
      <button type="button" className="fe-official-entry__admin" onClick={onAdmin}>
        運営管理
      </button>
    </div>
  )
}
