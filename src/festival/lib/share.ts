import type { Performer } from '../types'

function festivalShareUrl(performerId?: string) {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return performerId ? `${base}#artist-${performerId}` : `${base}#festival`
}

export async function sharePerformer(p: Performer): Promise<void> {
  const title = `${p.nameJa} · 大道芸博`
  const text = `${p.name} — ${p.actJa}. 大道芸博でチェック。`
  const url = festivalShareUrl(p.id)
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    window.alert('リンクをコピーしました（共有APIが使えない環境）。')
  } catch {
    window.prompt('リンクをコピー', url)
  }
}

export async function shareFestival(): Promise<void> {
  const title = '大道芸博 · Street Performance Expo'
  const text = 'みなとみらいが一夜でテーマパークに。タイムテーブルとマップはアプリから。'
  const url = festivalShareUrl()
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    window.alert('リンクをコピーしました。')
  } catch {
    window.prompt('リンクをコピー', url)
  }
}
