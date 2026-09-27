import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Camera, Save } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { updatePerformer, uploadAvatar } from '../lib/api'
import { useAuth } from '../lib/auth'
import { requireSupabase } from '../lib/supabase'
import { isValidHttpUrl } from '../../festival/lib/productionGuard'
import { useLang } from '../../i18n/LangProvider'
import { profileMissingFields, registrationError } from '../lib/onboarding'
import { prepareProfilePhoto } from '../lib/profilePhoto'
import type { Performer } from '../lib/types'

const SNS_FIELDS = ['Instagram', 'X', 'TikTok', 'YouTube', 'Web', 'チケット'] as const

function initialFields(performer: Performer) {
  return {
    stage_name: performer.stage_name, genre: performer.genre, bio: performer.bio,
    country: performer.country || '日本', city: performer.city,
    support_blurb: performer.support_blurb, awards: performer.awards ?? '',
    appearances: performer.appearances ?? '', video_url: performer.video_url ?? '',
    ...Object.fromEntries(SNS_FIELDS.map((key) => [key, performer.sns_json?.find((s) => s.label === key)?.url ?? ''])),
  } as Record<string, string>
}

function loadDraft(performer: Performer) {
  const fields = initialFields(performer)
  try {
    const draft = JSON.parse(localStorage.getItem(`pl-profile-draft:${performer.id}`) ?? 'null')
    if (draft?.savedAt > Date.parse(performer.updated_at)) {
      for (const key of Object.keys(fields)) if (typeof draft.fields?.[key] === 'string') fields[key] = draft.fields[key]
    }
  } catch { /* The form also works when browser storage is unavailable. */ }
  return fields
}

export function PerformerEditScreen({ onBack }: { onBack: () => void }) {
  const { performer, profile } = useAuth()
  if (!performer || !profile) return <p className="pl-muted">登録情報を確認しています…</p>
  return <ProfileForm key={performer.id} performer={performer} onBack={onBack} />
}

function ProfileForm({ performer, onBack }: { performer: Performer; onBack: () => void }) {
  const { t } = useLang()
  const { refreshProfile } = useAuth()
  const [fields, setFields] = useState(() => loadDraft(performer))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const savedFields = useRef(JSON.stringify(initialFields(performer)))
  const [dirty, setDirty] = useState(JSON.stringify(fields) !== savedFields.current)
  const photoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (JSON.stringify(fields) === savedFields.current) return
    try { localStorage.setItem(`pl-profile-draft:${performer.id}`, JSON.stringify({ savedAt: Date.now(), fields })) } catch { /* optional draft */ }
  }, [fields, performer.id, performer.updated_at])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = (key: string, value: string) => {
    setFields((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setMessage(null)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(null); setMessage(null)
    try {
      if (!fields.stage_name.trim()) { setError(t('editNeedName')); return }
      const sns_json = [
        ...SNS_FIELDS.map((key) => ({ label: key, url: fields[key].trim() })).filter((s) => s.url),
        ...(performer.sns_json ?? []).filter((item) => !SNS_FIELDS.some((key) => key === item.label)),
      ]
      const invalidSns = sns_json.find((s) => !isValidHttpUrl(s.url))
      if (invalidSns || (fields.video_url.trim() && !isValidHttpUrl(fields.video_url.trim()))) {
        setError(t('editBadUrl', { label: invalidSns?.label ?? t('editVideo') })); return
      }
      await updatePerformer(performer.id, {
        stage_name: fields.stage_name.trim(), genre: fields.genre.trim(), bio: fields.bio.trim(),
        country: fields.country.trim(), city: fields.city.trim(), support_blurb: fields.support_blurb.trim(),
        awards: fields.awards.trim(), appearances: fields.appearances.trim(), video_url: fields.video_url.trim() || null,
        sns_json,
      })
      const { error: profileError } = await requireSupabase().from('profiles').update({ display_name: fields.stage_name.trim() }).eq('id', performer.id)
      if (profileError) throw profileError
      await refreshProfile()
      savedFields.current = JSON.stringify(fields)
      setDirty(false)
      try { localStorage.removeItem(`pl-profile-draft:${performer.id}`) } catch { /* optional draft */ }
      setMessage(t('editSaved'))
    } catch (e) { setError(registrationError(e, t('editSaveFail'))) }
    finally { setBusy(false) }
  }

  const onPhoto = async (file: File | null) => {
    if (!file || busy) return
    setBusy(true); setError(null); setMessage(null)
    let photo: File
    try { photo = await prepareProfilePhoto(file) }
    catch (e) { setError(e instanceof Error ? e.message : t('editPhotoRead')); setBusy(false); return }
    try {
      const url = await uploadAvatar(performer.id, photo)
      await updatePerformer(performer.id, { photo_url: url })
      const { error: profileError } = await requireSupabase().from('profiles').update({ avatar_url: url }).eq('id', performer.id)
      if (profileError) throw profileError
      await refreshProfile()
      setMessage(t('editPhotoSaved'))
    } catch (e) { setError(registrationError(e, t('editPhotoFail'))) }
    finally { setBusy(false); if (photoInput.current) photoInput.current.value = '' }
  }

  const missing = profileMissingFields(performer).map((item) => item === '芸名' ? t('editStage') : item === 'ジャンル' ? t('editGenre') : item === '自己紹介' ? t('editBio') : item === '活動地域' ? t('editArea') : item === 'プロフィール写真' ? t('editPhoto') : item)
  const field = (key: string, label: string, options: { multiline?: boolean; required?: boolean; url?: boolean; max?: number } = {}) => (
    <label key={key}><span className="pl-label">{label}{options.required ? t('editRequired') : ''}</span>
      {options.multiline
        ? <textarea className="pl-textarea" value={fields[key]} maxLength={options.max ?? 2000} onChange={(e) => change(key, e.target.value)} />
        : <input className="pl-input" type={options.url ? 'url' : 'text'} inputMode={options.url ? 'url' : 'text'} autoCapitalize={options.url ? 'none' : undefined} autoCorrect={options.url ? 'off' : undefined} required={options.required} maxLength={options.max ?? (options.url ? 1000 : 120)} value={fields[key]} onChange={(e) => change(key, e.target.value)} placeholder={options.url ? 'https://' : undefined} />}
    </label>
  )

  return <div className="pl-registration">
    <button type="button" className="pl-btn pl-btn--ghost" disabled={busy} onClick={onBack}><ArrowLeft size={18} />{t('editBackStatus')}</button>
    <h1 className="pl-h1">{t('profile')}</h1>
    <p className="pl-muted">{t('editPublic')}</p>
    {missing.length ? <p className="pl-registration__notice">{t('editMissing', { items: missing.join('・') })}</p> : null}
    <div className="pl-registration__photo">
      <Avatar url={performer.photo_url} name={performer.stage_name} large />
      <button type="button" className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => photoInput.current?.click()}><Camera size={18} />{performer.photo_url ? t('editPhotoChange') : t('editPhoto')}</button>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" hidden onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)} />
    </div>
    <form noValidate onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className="pl-registration__fields">
        {field('stage_name', t('editStage'), { required: true, max: 80 })}
        {field('genre', t('editGenre'))}
        {field('bio', t('editBio'), { multiline: true })}
        {field('city', t('editArea'))}
        {field('country', t('editCountry'))}
        <details className="pl-registration__details">
          <summary>{t('editSns')}</summary>
          {SNS_FIELDS.map((key) => field(key, key === 'Web' ? t('editSite') : key === 'チケット' ? t('editTicketPage') : key, { url: true }))}
        </details>
        <details className="pl-registration__details">
          <summary>{t('editMore')}</summary>
          {field('support_blurb', t('editBlurb'))}
          {field('video_url', t('editVideo'), { url: true })}
          {field('awards', t('editAwards'), { multiline: true })}
          {field('appearances', t('editCredits'), { multiline: true })}
        </details>
      </fieldset>
      {error ? <p className="pl-error" role="alert">{error}</p> : null}
      {message ? <p className="pl-registration__notice" role="status">{message}</p> : null}
      <div className="pl-registration__save">
        <button type="submit" className="pl-btn pl-btn--block" disabled={busy}><Save size={18} />{busy ? t('editSaving') : t('editSave')}</button>
        {!dirty ? <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={onBack}>{t('editBackNext')}</button> : null}
      </div>
      {dirty ? <p className="pl-muted">{t('editDraft')}</p> : null}
    </form>
  </div>
}
