import { useAuth } from '../lib/auth'
import { Avatar } from '../components/Avatar'
import { LanguageToggle, useLang } from '../../i18n/LangProvider'

export function FanProfileScreen() {
  const { t } = useLang()
  const { profile, user, signOut } = useAuth()
  if (!profile) return <p className="pl-muted">Loading…</p>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <LanguageToggle />
      </div>
      <div className="pl-card pl-row">
        <Avatar url={profile.avatar_url} name={profile.display_name} large />
        <div>
          <h1 className="pl-h1" style={{ margin: 0, fontSize: '1.4rem' }}>
            {profile.display_name}
          </h1>
          <p className="pl-muted" style={{ margin: '4px 0 0' }}>
            {profile.email ?? user?.email}
          </p>
        </div>
      </div>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={() => void signOut()}>
        {t('signOut')}
      </button>
    </>
  )
}
