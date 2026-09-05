import { openPlatform } from '../../../app/routes'
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
 * 来場者トップ下部：配信・投げ銭（本番 Platform）と、開発時のみ内部導線。
 */
export function HomeOfficialEntry({
  onStreamRegister,
  onAdmin,
  showStaffEntry = canAccessStaffAreas(),
  showStreamRegisterEntry = canAccessPerformerAreas(),
}: HomeOfficialEntryProps) {
  return (
    <div className="fe-official-entry" aria-label="パフォーマー・運営向け">
      <button type="button" className="fe-official-entry__perf" onClick={() => openPlatform('?auth=1')}>
        <span className="fe-official-entry__perf-ja">ライブ配信・投げ銭</span>
        <span className="fe-official-entry__perf-en" lang="en">
          LIVE · FOLLOW · TIP
        </span>
      </button>
      {showStreamRegisterEntry ? (
        <button type="button" className="fe-official-entry__perf" onClick={onStreamRegister}>
          <span className="fe-official-entry__perf-ja">配信希望パフォーマー登録</span>
          <span className="fe-official-entry__perf-en" lang="en">
            STREAM PERFORMER SIGN-UP
          </span>
        </button>
      ) : (
        <button type="button" className="fe-official-entry__perf" onClick={() => openPlatform('?auth=1')}>
          <span className="fe-official-entry__perf-ja">パフォーマーとして参加</span>
          <span className="fe-official-entry__perf-en" lang="en">
            PERFORMER SIGN-UP
          </span>
        </button>
      )}
      {showStaffEntry ? (
        <button type="button" className="fe-official-entry__admin" onClick={onAdmin}>
          運営管理
        </button>
      ) : null}
    </div>
  )
}
