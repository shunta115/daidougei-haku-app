import { useState } from 'react'
import { endLive, startLive, updatePerformer } from '../lib/api'
import { useAuth } from '../lib/auth'

export function PerformerLiveScreen({ onBack }: { onBack: () => void }) {
  const { performer, refreshProfile } = useAuth()
  const [streamUrl, setStreamUrl] = useState(performer?.stream_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!performer) return <p className="pl-muted">Loading…</p>

  const goLive = async () => {
    if (!performer.is_approved) {
      setError('Wait for admin approval before going live.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let lat: number | null = null
      let lng: number | null = null
      if (performer.share_location && 'geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 })
          })
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        } catch {
          /* location optional */
        }
      }
      await updatePerformer(performer.id, {
        share_location: performer.share_location,
        lat,
        lng,
        location_updated_at: lat != null ? new Date().toISOString() : null,
      })
      await startLive(performer.id, streamUrl.trim() || undefined)
      await refreshProfile()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start live')
    } finally {
      setBusy(false)
    }
  }

  const stopLive = async () => {
    setBusy(true)
    setError(null)
    try {
      await endLive(performer.id)
      await refreshProfile()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end live')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        Back
      </button>
      <h1 className="pl-h1">{performer.is_live ? 'You are live' : 'Go live'}</h1>
      <p className="pl-muted">Paste your stream link (YouTube, Twitch, Instagram Live, etc.). Fans open it to watch.</p>

      <label>
        <span className="pl-label">Stream URL</span>
        <input
          className="pl-input"
          type="url"
          placeholder="https://"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
        />
      </label>

      <p className="pl-muted">Location share is {performer.share_location ? 'ON' : 'OFF'} (toggle on Home).</p>

      {performer.is_live ? (
        <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void stopLive()}>
          End live
        </button>
      ) : (
        <button type="button" className="pl-btn pl-btn--block pl-btn--live" disabled={busy} onClick={() => void goLive()}>
          Start live
        </button>
      )}
      {error ? <p className="pl-error">{error}</p> : null}
    </>
  )
}
