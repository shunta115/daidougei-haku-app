import {
  canAccessPerformerAreas,
  canAccessStaffAreas,
} from '../../lib/productionGuard'

type HomeOfficialEntryProps = {
  onStreamRegister: () => void
  onAdmin: () => void
  showStaffEntry?: boolean
  showStreamRegisterEntry?: boolean
}

/**
 * 来場者トップ下部：配信登録・運営の公開導線。
 * 本番では内部導線を非表示または準備中表示。
 */
export function HomeOfficialEntry({
  onStreamRegister,
  onAdmin,
  showStaffEntry = canAccessStaffAreas(),
  showStreamRegisterEntry = canAccessPerformerAreas(),
}: HomeOfficialEntryProps) {
  return (
    <div className="fe-official-entry" aria-label="パフォーマー・運営向け">
      {showStreamRegisterEntry ? (
        <button type="button" className="fe-official-entry__perf" onClick={onStreamRegister}>
          <span className="fe-official-entry__perf-ja">配信希望パフォーマー登録</span>
          <span className="fe-official-entry__perf-en" lang="en">
            STREAM PERFORMER SIGN-UP
          </span>
        </button>
      ) : (
        <div className="fe-official-entry__prep" aria-live="polite">
          <span className="fe-official-entry__perf-ja">配信希望パフォーマー登録</span>
          <span className="fe-official-entry__prep-note">β版では受付準備中です</span>
        </div>
      )}
      {showStaffEntry ? (
        <button type="button" className="fe-official-entry__admin" onClick={onAdmin}>
          運営管理
        </button>
      ) : null}
    </div>
  )
}
