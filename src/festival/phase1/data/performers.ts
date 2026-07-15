/**
 * Phase1 で最初に扱う出演者 ID（既存 PERFORMERS のサブセット定義）。
 * フルプロフィールは引き続き ../../data.ts の PERFORMERS を参照する。
 */
export const PHASE1_FEATURED_PERFORMER_IDS = ['1', '2', '3', '4', '5'] as const

export type Phase1FeaturedPerformerId = (typeof PHASE1_FEATURED_PERFORMER_IDS)[number]
