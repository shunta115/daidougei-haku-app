import type { StreamApprovalStatus, StreamPerformerApplication } from '../types'
import { enableDemoSeedData } from '../config/runtimeConfig'
import { modeScopedStorageKey } from './storageScope'

const STORAGE_KEY = modeScopedStorageKey('daidougei-stream-applications-v1')

function safeParse(raw: string | null): StreamPerformerApplication[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (row): row is StreamPerformerApplication =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as StreamPerformerApplication).id === 'string' &&
        typeof (row as StreamPerformerApplication).performerName === 'string',
    )
  } catch {
    return []
  }
}

function writeAll(items: StreamPerformerApplication[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `stream-app-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type StreamApplicationDraft = Omit<
  StreamPerformerApplication,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'linkedPerformerId'
>

export function readStreamApplications(): StreamPerformerApplication[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

export function appendStreamApplication(draft: StreamApplicationDraft): StreamPerformerApplication {
  const now = new Date().toISOString()
  const row: StreamPerformerApplication = {
    ...draft,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    status: 'pending',
  }
  writeAll([row, ...readStreamApplications()])
  return row
}

export function setStreamApplicationStatus(
  id: string,
  status: StreamApprovalStatus,
  linkedPerformerId?: string,
): boolean {
  const list = readStreamApplications()
  const idx = list.findIndex((x) => x.id === id)
  if (idx < 0) return false
  const prev = list[idx]!
  const next = [...list]
  next[idx] = {
    ...prev,
    status,
    linkedPerformerId: linkedPerformerId ?? prev.linkedPerformerId,
    updatedAt: new Date().toISOString(),
  }
  writeAll(next)
  return true
}

/** 初回シード（デモ用・1件審査中） */
export function seedStreamApplicationsIfEmpty() {
  if (!enableDemoSeedData) return
  if (readStreamApplications().length > 0) return
  const now = new Date().toISOString()
  writeAll([
    {
      id: 'seed-app-1',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      performerName: 'Nova Spin Collective',
      realName: 'デモ太郎',
      email: 'demo@example.com',
      activityRegion: 'メキシコ・シティ',
      genre: 'ダンス',
      snsUrl: 'https://instagram.com',
      streamDescription: '大道芸とLEDポイの融合配信',
      reviewMessage: '初の海外配信希望です。よろしくお願いします。',
    },
  ])
}
