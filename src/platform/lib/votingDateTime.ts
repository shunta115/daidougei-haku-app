// Voting administration uses Japan time even when the operator is abroad.
const japanDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** Convert an offset-bearing database timestamp to a JST datetime-local value. */
export function toVotingDateTimeInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = Object.fromEntries(japanDateTime.formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** Interpret the wall clock as JST, never as the browser's local timezone. */
export function fromVotingDateTimeInput(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}:00+09:00`)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    || !Number.isFinite(date.getTime()) || toVotingDateTimeInput(date.toISOString()) !== value) {
    throw new Error('投票日時を日本時間（JST）で正しく入力してください。')
  }
  return date.toISOString()
}
