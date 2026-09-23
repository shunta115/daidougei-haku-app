import { useState, type FormEvent } from 'react'
import { FESTIVAL_PATH, PLATFORM_PATH } from '../../app/routes'
import { BrandLogo } from '../../brand/BrandLogo'
import { useAuth } from '../lib/auth'
import { LanguageToggle, useLang } from '../../i18n/LangProvider'
import { trackProductEvent } from '../lib/track'
import { PERFORMER_REGISTER_PATH, registrationError } from '../lib/onboarding'
import { requireSupabase } from '../lib/supabase'

type Props = {
  onDone: () => void
  initialRole?: 'fan' | 'performer'
  performerEntry?: boolean
}

export function AuthScreen({ onDone, initialRole = 'fan', performerEntry = false }: Props) {
  const { t } = useLang()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [role, setRole] = useState(initialRole)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resendAfter, setResendAfter] = useState(0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'up') trackProductEvent('signup_start')
      const err = mode === 'in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, role, name.trim())
      if (err === 'check-email') {
        setInfo('確認メールを送信しました。メールのリンクを開くと登録を続けられます。届かない場合は迷惑メールもご確認ください。')
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
    if (!email.trim()) { setError('メールアドレスを入力してから再送してください。'); return }
    if (Date.now() < resendAfter) { setError('再送は1分ほど待ってからお試しください。'); return }
    setBusy(true)
    try {
      const { error } = await requireSupabase().auth.resend({
        type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}${PLATFORM_PATH}` },
      })
      if (error) throw error
      setInfo('確認メールを再送しました。メール内のリンクを開いてください。')
      setResendAfter(Date.now() + 60_000)
    } catch (e) { setError(registrationError(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="pl-shell pl-shell--flush pl-registration">
      <div className="pl-registration__heading">
        <a href="/" aria-label={t('appName')}><BrandLogo size={28} variant="lockup" className="pl-registration__logo" /></a><LanguageToggle />
      </div>
      <div className="pl-registration__intro"><p>{role === 'performer' ? 'PERFORMER ENTRY' : 'YOUR ACCOUNT'}</p><h1 className="pl-h1">{mode === 'in' ? 'ログイン' : role === 'performer' ? 'パフォーマー登録' : t('signUp')}</h1>
      <span>{role === 'performer' ? '芸名で登録して、あなたの活動を届けましょう。' : '登録済みの方はログインして続けられます。'}</span></div>
      {role === 'performer' && mode === 'up' ? <p className="pl-registration__progress">アカウント作成 → プロフィール → 受取設定</p> : null}

      {mode === 'up' && !performerEntry ? (
        <fieldset className="pl-registration__roles">
          <legend>登録するアカウント</legend>
          {(['fan', 'performer'] as const).map((item) => (
            <label key={item}><input type="radio" name="role" checked={role === item} onChange={() => setRole(item)} />{t(item)}</label>
          ))}
        </fieldset>
      ) : null}

      <form onSubmit={(e) => void submit(e)}>
        {mode === 'up' ? <label><span className="pl-label">{role === 'performer' ? '芸名（公開されます）' : t('displayName')}</span>
          <input className="pl-input" name="displayName" autoComplete="nickname" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label> : null}
        <label><span className="pl-label">メールアドレス（非公開）</span>
          <input className="pl-input" name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label><span className="pl-label">{t('password')}{mode === 'up' ? '（6文字以上）' : ''}</span>
          <input className="pl-input" name="password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {info ? <p className="pl-registration__notice" role="status">{info}</p> : null}
        {error ? <p className="pl-error" role="alert">{error}</p> : null}
        <button type="submit" className="pl-btn pl-btn--block" disabled={busy}>
          {busy ? '処理中…' : mode === 'in' ? 'ログインして続ける' : role === 'performer' ? 'パフォーマーとして登録' : 'アカウントを作成'}
        </button>
      </form>
      <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null) }}>
        {mode === 'in' ? '初めての方は新規登録' : '登録済みの方はログイン'}
      </button>
      {mode === 'in' ? <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => void resend()}>確認メールを再送</button> : null}
      {role === 'performer' ? <p className="pl-muted">プロフィール・受取設定の完了後、運営が確認して公開します。本名・本人確認・振込口座はStripeの画面で登録します。</p> : null}
      {!performerEntry && role !== 'performer' ? <a className="pl-registration__link" href={PERFORMER_REGISTER_PATH}>パフォーマーとして登録する</a> : null}
      <a className="pl-registration__link" href={FESTIVAL_PATH}>イベントを見る</a>
      {performerEntry ? <a className="pl-registration__link" href={`${PLATFORM_PATH}?auth=1`}>ファンとして登録</a> : null}
    </div>
  )
}
