/**
 * SVG マップ用の会場アンカー（0–100 の正規化座標）。
 * MapPage / MapScreen 実装時に venueId で参照する。
 */
export type Phase1MapAnchor = {
  venueId: string
  x: number
  y: number
  labelJa: string
}

export const PHASE1_MAP_ANCHORS: readonly Phase1MapAnchor[] = [
  { venueId: 'main-lawn', x: 48, y: 28, labelJa: 'メイン芝生' },
  { venueId: 'street-a', x: 22, y: 52, labelJa: 'ストリートA' },
  { venueId: 'queens-plaza', x: 72, y: 48, labelJa: 'クイーンズ前' },
  { venueId: 'canal-walk', x: 55, y: 78, labelJa: '運河ウォーク' },
] as const

export function phase1MapAnchorForVenue(venueId: string): Phase1MapAnchor | undefined {
  return PHASE1_MAP_ANCHORS.find((a) => a.venueId === venueId)
}
