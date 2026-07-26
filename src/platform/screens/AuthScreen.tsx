import { useState } from 'react'
import { useAuth } from '../lib/auth'

type AuthScreenProps = {
  onDone: () => void
}

export function AuthScreen({ onDone }: AuthScreenProps) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [role, setRole] = useState<'fan' | 'performer'>('fan')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const err =
      mode === 'in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, role, name.trim() || 'User')
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    onDone()
  }

  return (
    <div className="pl-shell pl-shell--flush">
      <p className="pl-brand">大道芸博</p>
      <h1 className="pl-h1">{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
      <p className="pl-muted">Fans follow and tip. Performers go live and get paid.</p>

      {mode === 'up' ? (
        <div className="pl-chip-row">
          <button type="button" className="pl-chip" data-on={role === 'fan'} onClick={() => setRole('fan')}>
            Fan
          </button>
          <button
            type="button"
            className="pl-chip"
            data-on={role === 'performer'}
            onClick={() => setRole('performer')}
          >
            Performer
          </button>
        </div>
      ) : null}

      {mode === 'up' ? (
        <label>
          <span className="pl-label">Display name</span>
          <input className="pl-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      ) : null}
      <label>
        <span className="pl-label">Email</span>
        <input className="pl-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        <span className="pl-label">Password</span>
        <input
          className="pl-input"
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? <p className="pl-error">{error}</p> : null}
      <button type="button" className="pl-btn pl-btn--block" disabled={busy || !email || password.length < 6} onClick={() => void submit()}>
        {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Continue'}
      </button>
      <p className="pl-muted" style={{ marginTop: 16 }}>
        {mode === 'in' ? 'New here?' : 'Already have an account?'}{' '}
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Create account' : 'Sign in'}
        </button>
      </p>
      {mode === 'up' && role === 'performer' ? (
        <p className="pl-muted">Performer accounts need admin approval before going public.</p>
      ) : null}
    </div>
  )
}
