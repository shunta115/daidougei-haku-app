/**
 * Phase1 データ入口 — 既存の data.ts / scheduleData.ts を壊さず再エクスポート。
 * 将来 JSON 化する場合はこのディレクトリに performers.json 等を置き、ここで読み込む。
 */
export { PERFORMERS, performerById, SPOTLIGHT_IDS, TODAYS_PICK_IDS } from '../../data'
export { SCHEDULE_SLOTS, VENUE_AREAS, TODAYS_PICK_IDS as SCHEDULE_TODAY_PICK_IDS } from '../scheduleData'
export { PHASE1_HOME_LABELS } from './labels'
export { PHASE1_MAP_ANCHORS, phase1MapAnchorForVenue, type Phase1MapAnchor } from './mapAnchors'
