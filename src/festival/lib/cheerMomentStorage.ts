/** 端末内のみの応援フィードバック（金額・集計なし） */
const KEY = 'daidougei-haku-cheer-moment-v1'

export type CheerKind = 'clap' | 'heart' | 'message'

export type CheerMoment = {
  performerId: string
  kind: CheerKind
  at: string
  /** メッセージ種のみ */
  text?: string
}

export function recordCheerMoment(m: CheerMoment) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

export function readCheerMoment(): CheerMoment | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as CheerMoment
    if (!o || typeof o.performerId !== 'string' || typeof o.kind !== 'string') return null
    return o
  } catch {
    return null
  }
}
