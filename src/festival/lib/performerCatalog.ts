import { PERFORMERS } from '../data'
import { enableMockStreams, isDemoMode } from '../config/runtimeConfig'
import type { Performer, PerformerApprovalStatus } from '../types'
import { getCatalogPerformers } from '../../catalog/liveCatalog'
import { modeScopedStorageKey } from './storageScope'
import { resolvePerformerPhotoUrl, shouldShowAsLiveStream } from './streamPresence'
import { isInAppLivePath, isValidHttpUrl } from './productionGuard'

const OVERRIDE_KEY = modeScopedStorageKey('daidougei-stream-performer-overrides-v1')

type PerformerOverride = Partial<
  Pick<Performer, 'approvalStatus' | 'canStream' | 'isLive' | 'streamTitle' | 'streamUrl' | 'supportUrl' | 'country'>
>

function readOverrides(): Record<string, PerformerOverride> {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {}
    return data as Record<string, PerformerOverride>
  } catch {
    return {}
  }
}

function writeOverrides(map: Record<string, PerformerOverride>) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(map))
}

function sanitizePerformer(p: Performer): Performer {
  const photoUrl = resolvePerformerPhotoUrl(p.photoUrl)
  let isLive = Boolean(p.isLive)
  if (!enableMockStreams && isLive && !isValidHttpUrl(p.streamUrl) && !isInAppLivePath(p.streamUrl)) {
    isLive = false
  }
  return { ...p, photoUrl, isLive }
}

export function getPerformers(): Performer[] {
  const overrides = readOverrides()
  const base = isDemoMode ? PERFORMERS : getCatalogPerformers()
  return base.map((p) => sanitizePerformer({ ...p, ...overrides[p.id] }))
}

export function getPerformerById(id: string): Performer | undefined {
  return getPerformers().find((p) => p.id === id)
}

export function liveStreamPerformers(): Performer[] {
  return getPerformers().filter(shouldShowAsLiveStream)
}

export function approvedStreamers(): Performer[] {
  return getPerformers().filter((p) => p.approvalStatus === 'approved' && p.canStream)
}

export function patchPerformerOverride(id: string, patch: PerformerOverride) {
  const cur = readOverrides()
  writeOverrides({ ...cur, [id]: { ...cur[id], ...patch } })
}

export function setPerformerApproval(
  id: string,
  approvalStatus: PerformerApprovalStatus,
  canStream: boolean,
) {
  const patch: PerformerOverride = { approvalStatus, canStream }
  if (approvalStatus !== 'approved' || !canStream) {
    patch.isLive = false
  }
  patchPerformerOverride(id, patch)
}
