const HALF_TO_FULL: Record<string, string> = { '1': '１', '2': '２', '3': '３', '4': '４' }

export function displayStageName(value: string | null | undefined): string {
  return String(value ?? '').replace(/ステージ([1-4])/g, (_, number: string) => `ステージ${HALF_TO_FULL[number]}`)
}
