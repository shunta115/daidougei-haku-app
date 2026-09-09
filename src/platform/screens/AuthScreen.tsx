import { useState } from 'react'
import { FESTIVAL_PATH, spaGo } from '../../app/routes'
import { useAuth } from '../lib/auth'
import { LanguageToggle, useLang } from '../../i18n/LangProvider'
import { trackProductEvent } from '../lib/track'

type AuthScreenProps = {
  onDone: () => void
}

function initialRole(): 'fan' | 'performer' | 'organizer' {
  try {
    const role = new URLSearchParams(window.location.search).get('role')
    if (role === 'performer' || role === 'organizer') return role
  } catch {
    /* ignore */
  }
  return 'fan'
}

export function AuthScreen({ onDone }: AuthScreenProps) {
  const { t } = useLang()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [role, setRole] = useState<'fan' | 'performer' | 'organizer'>(initialRole)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    if (mode === 'up') trackProductEvent('signup_start')
    const err =
      mode === 'in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, role, name.trim() || 'User')
    setBusy(false)
    if (err === 'check-email') {
      setInfo(t('checkEmail'))
      setMode('in')
      return
    }
    if (err) {
      setError(err)
      return
    }
    if (mode === 'up') trackProductEvent('signup_complete')
    onDone()
  }

  return (
    <div className="pl-shell pl-shell--flush">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <p className="pl-brand">{t('appName')}</p>
        <LanguageToggle />
      </div>
      <h1 className="pl-h1">{mode === 'in' ? t('signIn') : t('signUp')}</h1>
      <p className="pl-muted">{t('authLead')}</p>

      {mode === 'up' ? (
        <div className="pl-chip-row">
          <button type="button" className="pl-chip" data-on={role === 'fan'} onClick={() => setRole('fan')}>
            {t('fan')}
          </button>
          <button
            type="button"
            className="pl-chip"
            data-on={role === 'performer'}
            onClick={() => setRole('performer')}
          >
            {t('performer')}
          </button>
          <button type="button" className="pl-chip" data-on={role === 'organizer'} onClick={() => setRole('organizer')}>
            {t('organizer')}
          </button>
        </div>
      ) : null}

      {mode === 'up' ? (
        <label>
          <span className="pl-label">{t('displayName')}</span>
          <input className="pl-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      ) : null}
      <label>
        <span className="pl-label">{t('email')}</span>
        <input className="pl-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
          <span className="pl-label">{t('password')}</span>
        <input
          className="pl-input"
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {info ? <p className="pl-muted">{info}</p> : null}
      {error ? <p className="pl-error">{error}</p> : null}
      <button type="button" className="pl-btn pl-btn--block" disabled={busy || !email || password.length < 6} onClick={() => void submit()}>
        {busy ? t('processing') : mode === 'in' ? t('signIn') : t('continue')}
      </button>
      <p className="pl-muted" style={{ marginTop: 16 }}>
        {mode === 'in' ? t('firstTime') : t('alreadyHaveAccount')}{' '}
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? t('signUp') : t('signIn')}
        </button>
      </p>
      {mode === 'up' && role === 'performer' ? (
        <p className="pl-muted">{t('performerNeedApproval')}</p>
      ) : null}
      {mode === 'up' && role === 'organizer' ? (
        <p className="pl-muted">{t('organizerHint')}</p>
      ) : null}
      <p className="pl-muted" style={{ marginTop: 20 }}>
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => spaGo(FESTIVAL_PATH)}>
          {t('backToEvent')}
        </button>
      </p>
    </div>
  )
}
