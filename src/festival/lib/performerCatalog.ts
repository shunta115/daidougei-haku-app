import { PERFORMERS } from '../data'
import type { Performer, PerformerApprovalStatus } from '../types'

const OVERRIDE_KEY = 'daidougei-stream-performer-overrides-v1'

type PerformerOverride = Partial<
  Pick<Performer, 'approvalStatus' | 'canStream' | 'isLive' | 'streamTitle' | 'supportUrl' | 'country'>
>

function readOverrides(): Record<string, PerformerOverride> {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (typeof data !== 'object' || data === null) return {}
    return data as Record<string, PerformerOverride>
  } catch {
    return {}
  }
}

function writeOverrides(map: Record<string, PerformerOverride>) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(map))
}

export function getPerformers(): Performer[] {
  const overrides = readOverrides()
  return PERFORMERS.map((p) => ({ ...p, ...overrides[p.id] }))
}

export function getPerformerById(id: string): Performer | undefined {
  return getPerformers().find((p) => p.id === id)
}

export function liveStreamPerformers(): Performer[] {
  return getPerformers().filter(
    (p) => p.approvalStatus === 'approved' && p.canStream && p.isLive,
  )
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
