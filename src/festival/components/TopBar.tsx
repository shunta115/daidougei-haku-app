import type { AppPersona } from '../types'
import { BrandLogo } from '../../brand/BrandLogo'
import { showDemoBadge } from '../config/runtimeConfig'
import { LanguageToggle, useLang } from '../../i18n/LangProvider'
import { useAuth } from '../../platform/lib/auth'
import { openPlatform } from '../../app/routes'

type TopBarProps = {
  persona: AppPersona
  visitorContext?: string
  onExitPerformerOrAdmin: () => void
}

export function TopBar({ persona, visitorContext, onExitPerformerOrAdmin }: TopBarProps) {
  const isVisitor = persona === 'visitor'
  const { user, profile } = useAuth()
  const { t } = useLang()

  return (
    <header className="fe-topbar">
      <div className="fe-mark">
        <span className="fe-mark__glyph" aria-hidden="true">
          <BrandLogo size={28} className="fe-mark__logo" />
        </span>
        <span className="fe-mark__text">
          <span className="fe-mark__eyebrow">Street Performance Expo</span>
          <span className="fe-mark__title">{t('appName')}</span>
        </span>
      </div>

      <div className="fe-topbar__actions">
        <LanguageToggle />
        {showDemoBadge ? (
          <span className="fe-demo-badge" title="固定時刻・ダミー出演者などを含むデモ表示です">
            デモデータ
          </span>
        ) : null}
        {!isVisitor ? (
          <button type="button" className="fe-staff-btn fe-staff-btn--exit" onClick={onExitPerformerOrAdmin}>
            来場者モードへ
          </button>
        ) : (
          <button type="button" className="fe-staff-btn" onClick={() => openPlatform(user ? '' : '?auth=1')}>
            {user ? profile?.display_name || t('account') : t('signIn')}
          </button>
        )}
        <div className="fe-live-pill" title={visitorContext ?? 'Guest mode'}>
          <span className="fe-live-pill__dot" aria-hidden="true" />
          <span className="fe-live-pill__label">
            {persona === 'visitor' ? (user ? 'IN' : 'GUEST') : persona === 'performer' ? 'ENTRY' : 'ADMIN'}
          </span>
        </div>
      </div>
    </header>
  )
}
