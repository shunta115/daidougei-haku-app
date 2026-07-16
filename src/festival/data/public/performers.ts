import type { Performer } from '../../types'

/**
 * 公開モードの出演者一覧。
 * 実在する出演者のみ追加してください。デモ用の架空データは入れないこと。
 *
 * 必須: id（一意）, name, nameJa, act, actJa, tagline, gradient, locale, country,
 * likes, saves, heat, approvalStatus, canStream, isLive, supportUrl
 * 任意: photoUrl, streamUrl, streamTitle, bio, genre, tipLinks, snsList
 */
export const PUBLIC_PERFORMERS: Performer[] = []
