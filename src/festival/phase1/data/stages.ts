import type { MapVenuePin } from '../types'
import { getCatalogVenues } from '../../../catalog/liveCatalog'

/** 会場マップ上のグリッド配置（MapScreen の MAP_LAYOUT と同期） */
export const PHASE1_MAP_LAYOUT: Record<string, { row: number; col: number }> = {
  'main-lawn': { row: 1, col: 1 },
  'street-a': { row: 1, col: 2 },
  'queens-plaza': { row: 2, col: 1 },
  'canal-walk': { row: 2, col: 2 },
}

/** MAP 導線用ピン一覧（既存 VENUE_AREAS から生成） */
export function buildPhase1MapPins(): MapVenuePin[] {
  return getCatalogVenues().map((v) => {
    const layout = PHASE1_MAP_LAYOUT[v.id] ?? { row: 1, col: 1 }
    return {
      venueId: v.id,
      nameJa: v.nameJa,
      nameEn: v.nameEn,
      blurbJa: v.blurbJa,
      gradient: v.gradient,
      mapRow: layout.row,
      mapCol: layout.col,
      crowd: v.crowd,
    }
  })
}
