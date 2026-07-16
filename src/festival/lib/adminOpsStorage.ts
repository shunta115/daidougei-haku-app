import { modeScopedStorageKey } from './storageScope'

const KEY = modeScopedStorageKey('daidougei-haku-admin-ops-v1')

export type AdminOpsState = {
  /** 来場者トップに出すお知らせ（短文） */
  announcements: string
  /** 雨天・変更の運営メモ */
  weatherNotes: string
  /** プッシュ通知ドラフト（UIのみ） */
  pushDraft: string
  /** 公式配信チャンネルの想定状態（デモ） */
  liveChannel: 'off' | 'standby' | 'live'
}

const defaultState: AdminOpsState = {
  announcements: '',
  weatherNotes: '',
  pushDraft: '',
  liveChannel: 'standby',
}

function readRaw(): AdminOpsState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultState }
    const o = JSON.parse(raw) as Partial<AdminOpsState>
    return {
      announcements: typeof o.announcements === 'string' ? o.announcements : '',
      weatherNotes: typeof o.weatherNotes === 'string' ? o.weatherNotes : '',
      pushDraft: typeof o.pushDraft === 'string' ? o.pushDraft : '',
      liveChannel:
        o.liveChannel === 'off' || o.liveChannel === 'standby' || o.liveChannel === 'live'
          ? o.liveChannel
          : defaultState.liveChannel,
    }
  } catch {
    return { ...defaultState }
  }
}

export function readAdminOps(): AdminOpsState {
  return readRaw()
}

export function writeAdminOps(next: AdminOpsState) {
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function patchAdminOps(partial: Partial<AdminOpsState>): AdminOpsState {
  const cur = readRaw()
  const merged: AdminOpsState = { ...cur, ...partial }
  writeAdminOps(merged)
  return merged
}
