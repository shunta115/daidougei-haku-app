import type { EditableRegistrationFields, PerformerRegistration, RegistrationStatus } from '../types'

const STORAGE_KEY = 'daidougei-haku-performer-registrations-v1'

function safeParse(raw: string | null): PerformerRegistration[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter((row): row is PerformerRegistration => {
      return (
        typeof row === 'object' &&
        row !== null &&
        typeof (row as PerformerRegistration).id === 'string' &&
        typeof (row as PerformerRegistration).artistName === 'string'
      )
    })
  } catch {
    return []
  }
}

export function readRegistrations(): PerformerRegistration[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

export function writeRegistrations(items: PerformerRegistration[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type RegistrationDraft = Omit<
  PerformerRegistration,
  'id' | 'createdAt' | 'updatedAt' | 'status'
>

/** 出演者による内容更新。ステータス（承認ワークフロー）は変更しない。 */
export function updateRegistrationContent(id: string, draft: RegistrationDraft): boolean {
  const list = readRegistrations()
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return false
  const prev = list[idx]!
  const nextRow: PerformerRegistration = {
    ...prev,
    ...draft,
    id: prev.id,
    createdAt: prev.createdAt,
    status: prev.status,
    updatedAt: new Date().toISOString(),
  }
  const next = [...list]
  next[idx] = nextRow
  writeRegistrations(next)
  return true
}

export function appendRegistration(draft: RegistrationDraft): PerformerRegistration {
  const now = new Date().toISOString()
  const row: PerformerRegistration = {
    ...draft,
    schemaVersion: 1,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    status: 'pending',
  }
  const list = readRegistrations()
  writeRegistrations([row, ...list])
  return row
}

export function updateRegistrationStatus(id: string, status: RegistrationStatus) {
  const list = readRegistrations()
  const next = list.map((r) =>
    r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r,
  )
  writeRegistrations(next)
}

export function updateRegistrationRecord(id: string, fields: EditableRegistrationFields): boolean {
  const list = readRegistrations()
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return false
  const prev = list[idx]!
  const nextRow: PerformerRegistration = {
    ...prev,
    ...fields,
    id: prev.id,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  }
  const next = [...list]
  next[idx] = nextRow
  writeRegistrations(next)
  return true
}

export function deleteRegistration(id: string): boolean {
  const list = readRegistrations()
  const next = list.filter((r) => r.id !== id)
  if (next.length === list.length) return false
  writeRegistrations(next)
  return true
}

export function registrationToEditable(r: PerformerRegistration): EditableRegistrationFields {
  return {
    status: r.status,
    artistName: r.artistName,
    realName: r.realName,
    email: r.email,
    phone: r.phone,
    genre: r.genre,
    profile: r.profile,
    achievements: r.achievements,
    snsUrl: r.snsUrl,
    website: r.website,
    photoUrl: r.photoUrl,
    tipUrl: r.tipUrl,
    preferredDates: r.preferredDates,
    notes: r.notes,
  }
}

