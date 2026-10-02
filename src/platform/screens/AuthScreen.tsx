import { useEffect, useState, type FormEvent } from 'react'
import { FESTIVAL_PATH, PLATFORM_PATH } from '../../app/routes'
import { PERFORMER_REGISTER_PATH } from '../lib/onboarding'
import { BrandLogo } from '../../brand/BrandLogo'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { trackProductEvent } from '../lib/track'
import { registrationError } from '../lib/onboarding'
import { requireSupabase } from '../lib/supabase'

type Props = {
  onDone: () => void
  initialRole?: 'fan' | 'performer'
  performerEntry?: boolean
}

export function AuthScreen({ onDone, initialRole = 'fan', performerEntry = false }: Props) {
  const { t } = useLang()
  const { passwordRecovery, sendPasswordReset, signIn, signUp, updatePassword } = useAuth()
  const [mode, setMode] = useState<'in' | 'up' | 'reset' | 'new-password'>(() => passwordRecovery ? 'new-password' : 'up')
  const [role] = useState(initialRole)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resendAfter, setResendAfter] = useState(0)

  useEffect(() => {
    if (passwordRecovery) setMode('new-password')
  }, [passwordRecovery])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'up') trackProductEvent('signup_start')
      if (mode === 'reset') {
        const resetError = await sendPasswordReset(email.trim())
        if (resetError) { setError(resetError); return }
        setInfo(t('authResetSent'))
        return
      }
      if (mode === 'new-password') {
        const updateError = await updatePassword(password)
        if (updateError) { setError(updateError); return }
        setInfo(t('authPasswordUpdated'))
        setMode('in')
        setPassword('')
        return
      }
      const err = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password, role, name.trim())
      if (err === 'check-email') {
        setInfo(t('authCheckEmailLong'))
        setMode('in')
        setPassword('')
        setResendAfter(Date.now() + 60_000)
        return
      }
      if (err) { setError(err); return }
      if (mode === 'up') trackProductEvent('signup_complete')
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    if (!email.trim()) { setError(t('authNeedEmail')); return }
    if (Date.now() < resendAfter) { setError(t('authResendWait')); return }
    setBusy(true)
    try {
      const { error } = await requireSupabase().auth.resend({
        type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}${PLATFORM_PATH}` },
      })
      if (error) throw error
      setInfo(t('authResent'))
      setResendAfter(Date.now() + 60_000)
    } catch (e) { setError(registrationError(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="pl-shell pl-shell--flush pl-registration">
      <div className="pl-registration__heading">
        <a href="/" aria-label={t('appName')}><BrandLogo size={64} variant="official" className="pl-registration__logo pl-registration__logo--official" /></a>
      </div>
      <div className="pl-registration__intro"><p>{role === 'performer' ? 'PERFORMER ENTRY' : 'YOUR ACCOUNT'}</p><h1 className="pl-h1">{mode === 'in' ? t('signIn') : mode === 'reset' ? t('authResetTitle') : mode === 'new-password' ? t('authNewPasswordTitle') : role === 'performer' ? t('authPerformerTitle') : t('signUp')}</h1>
      <span>{mode === 'reset' ? t('authLeadReset') : mode === 'new-password' ? t('authLeadNewPassword') : role === 'performer' ? t('authLeadPerformer') : t('authLeadReturning')}</span></div>
      {role === 'performer' && mode === 'up' ? <p className="pl-registration__progress">{t('authProgress')}</p> : null}

      {mode === 'up' ? <p className="pl-registration__guest-note">{t('authGuestNote')}</p> : null}

      <form onSubmit={(e) => void submit(e)}>
        {mode === 'up' ? <label><span className="pl-label">{role === 'performer' ? t('authStageName') : t('displayName')}</span>
          <input className="pl-input" name="displayName" autoComplete="nickname" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label> : null}
        {mode !== 'new-password' ? <label><span className="pl-label">{t('authEmailPrivate')}</span>
          <input className="pl-input" name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label> : null}
        {mode !== 'reset' ? <label><span className="pl-label">{mode === 'new-password' ? t('authPasswordNew') : t('password')}{mode === 'up' ? t('authPasswordHint') : ''}</span>
          <input className="pl-input" name="password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label> : null}
        {info ? <p className="pl-registration__notice" role="status">{info}</p> : null}
        {error ? <p className="pl-error" role="alert">{error}</p> : null}
        <button type="submit" className="pl-btn pl-btn--block" disabled={busy}>
          {busy ? t('processing') : mode === 'in' ? t('authSubmitLogin') : mode === 'reset' ? t('authSubmitReset') : mode === 'new-password' ? t('authSubmitUpdate') : role === 'performer' ? t('authSubmitPerformer') : t('authSubmitCreate')}
        </button>
      </form>
      {mode !== 'new-password' ? <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => { setMode(mode === 'in' || mode === 'reset' ? 'up' : 'in'); setError(null); setInfo(null) }}>
        {mode === 'in' || mode === 'reset' ? t('authToSignUp') : t('authToLogin')}
      </button> : null}
      {mode === 'in' ? <button type="button" className="pl-registration__text-button" disabled={busy} onClick={() => { setMode('reset'); setError(null); setInfo(null); setPassword('') }}>{t('authForgot')}</button> : null}
      {mode === 'in' ? <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => void resend()}>{t('authResend')}</button> : null}
      {role === 'performer' ? <p className="pl-muted">{t('authPerformerNote')}</p> : null}
      <a className="pl-registration__link" href={FESTIVAL_PATH}>{t('authSeeEvents')}</a>
      {performerEntry ? <a className="pl-registration__link" href={`${PLATFORM_PATH}?auth=1`}>{t('authRegisterFan')}</a> : null}
      {!performerEntry && (mode === 'up' || mode === 'in') ? (
        <aside className="pl-registration__performer-entry">
          <p>PERFORMER</p>
          <h2>{t('authPerformerEntryKicker')}</h2>
          <span>{t('authPerformerEntryLead')}</span>
          <a className="pl-btn pl-btn--ghost pl-btn--block" href={PERFORMER_REGISTER_PATH}>{t('authPerformerEntryCta')}</a>
        </aside>
      ) : null}
    </div>
  )
}
