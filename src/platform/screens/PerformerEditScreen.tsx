import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { updatePerformer, uploadAvatar } from '../lib/api'
import { useAuth } from '../lib/auth'
import { requireSupabase } from '../lib/supabase'

export function PerformerEditScreen({ onBack }: { onBack: () => void }) {
  const { performer, profile, refreshProfile, signOut } = useAuth()
  const [stageName, setStageName] = useState(performer?.stage_name ?? '')
  const [bio, setBio] = useState(performer?.bio ?? '')
  const [genre, setGenre] = useState(performer?.genre ?? '')
  const [country, setCountry] = useState(performer?.country ?? '')
  const [city, setCity] = useState(performer?.city ?? '')
  const [blurb, setBlurb] = useState(performer?.support_blurb ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (!performer || !profile) return <p className="pl-muted">Loading…</p>

  const save = async () => {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await updatePerformer(performer.id, {
        stage_name: stageName.trim() || 'Performer',
        bio: bio.trim(),
        genre: genre.trim(),
        country: country.trim(),
        city: city.trim(),
        support_blurb: blurb.trim(),
      })
      await requireSupabase()
        .from('profiles')
        .update({ display_name: stageName.trim() || 'Performer' })
        .eq('id', performer.id)
      await refreshProfile()
      setMsg('Saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const onPhoto = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const url = await uploadAvatar(performer.id, file)
      await updatePerformer(performer.id, { photo_url: url })
      await requireSupabase().from('profiles').update({ avatar_url: url }).eq('id', performer.id)
      await refreshProfile()
      setMsg('Photo updated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const connectStripe = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performerId: performer.id }),
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || 'Connect failed')
      window.location.href = json.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stripe Connect failed')
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        Back
      </button>
      <div style={{ textAlign: 'center', margin: '16px 0' }}>
        <Avatar url={performer.photo_url} name={performer.stage_name} large />
        <label className="pl-btn pl-btn--ghost" style={{ marginTop: 12, display: 'inline-block' }}>
          Change photo
          <input type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <label>
        <span className="pl-label">Stage name</span>
        <input className="pl-input" value={stageName} onChange={(e) => setStageName(e.target.value)} />
      </label>
      <label>
        <span className="pl-label">Genre</span>
        <input className="pl-input" value={genre} onChange={(e) => setGenre(e.target.value)} />
      </label>
      <label>
        <span className="pl-label">Bio</span>
        <textarea className="pl-textarea" value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label>
        <span className="pl-label">Country</span>
        <input className="pl-input" value={country} onChange={(e) => setCountry(e.target.value)} />
      </label>
      <label>
        <span className="pl-label">City</span>
        <input className="pl-input" value={city} onChange={(e) => setCity(e.target.value)} />
      </label>
      <label>
        <span className="pl-label">Tip message</span>
        <input
          className="pl-input"
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          placeholder="Thanks for supporting my art"
        />
      </label>

      <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void save()}>
        Save
      </button>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" disabled={busy} onClick={() => void connectStripe()}>
        {performer.stripe_onboarding_complete ? 'Stripe connected' : 'Set up payouts (Stripe)'}
      </button>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={() => void signOut()}>
        Sign out
      </button>
      {msg ? <p className="pl-muted">{msg}</p> : null}
      {error ? <p className="pl-error">{error}</p> : null}
    </>
  )
}
