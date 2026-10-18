export const DISPLAY_NAME_MAX_LENGTH = 80

export function normalizeDisplayName(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('表示名を入力してください。')
  if (Array.from(normalized).length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください。`)
  }
  if (/\p{Cc}/u.test(normalized)) throw new Error('表示名に使用できない文字が含まれています。')
  return normalized
}
