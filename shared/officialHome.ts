export const HOME_FIELDS = {
  furigana: 'ふりがな', tagline: 'キャッチコピー', introduction: '詳しい自己紹介',
  career: '経歴', awards: '受賞歴', media: 'メディア出演歴', credits: '過去の出演実績',
  regions: '活動地域', events: '対応可能なイベント', repertoire: '演目', duration: '公演時間',
  space: '必要スペース', equipment: '音響・電源等の条件',
} as const
export type HomeDetails = Partial<Record<keyof typeof HOME_FIELDS, string>>
export const CASE_STATUSES = { new: '新規依頼', reviewing: '確認中', checking: '出演者確認中', quoting: '見積もり中', booked: '成約', declined: '見送り' } as const
export const REQUEST_FIELDS = {
  organization: '会社名・団体名', contact: '担当者名', email: 'メールアドレス', phone: '電話番号',
  date: '開催希望日', venue: '開催場所', event: 'イベント内容', duration: '希望出演時間', budget: '予算', notes: 'その他相談事項',
} as const
export type BookingInput = Record<keyof typeof REQUEST_FIELDS, string> & { performer_id: string }
export function validateBooking(value: unknown): BookingInput {
  if (!value || typeof value !== 'object') throw new Error('入力内容を確認してください。')
  const source = value as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of [...Object.keys(REQUEST_FIELDS), 'performer_id']) {
    const text = source[key]
    if (typeof text !== 'string' || text.length > (key === 'event' || key === 'notes' ? 4000 : 250)) throw new Error('入力内容が長すぎるか不正です。')
    out[key] = text.trim()
    if (key !== 'notes' && !out[key]) throw new Error('必須項目を入力してください。')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email) || !/^[+\d ()-]{6,30}$/.test(out.phone)) throw new Error('メールアドレス・電話番号を確認してください。')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date) || !Number.isFinite(Date.parse(`${out.date}T00:00:00+09:00`)) || new Date(`${out.date}T00:00:00Z`).toISOString().slice(0, 10) !== out.date || out.date < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })) throw new Error('未来の有効な開催希望日を入力してください。')
  if (!/^[0-9a-f-]{36}$/i.test(out.performer_id)) throw new Error('希望パフォーマーを確認してください。')
  return out as BookingInput
}
export function cleanDetails(value: unknown): HomeDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('プロフィールの形式が不正です。')
  const out: HomeDetails = {}
  for (const key of Object.keys(HOME_FIELDS) as Array<keyof HomeDetails>) {
    const v = (value as HomeDetails)[key]
    if (v !== undefined && (typeof v !== 'string' || v.length > 4000)) throw new Error('各項目は4000文字以内で入力してください。')
    if (v?.trim()) out[key] = v.trim()
  }
  return out
}
