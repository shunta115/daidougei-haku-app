import type { Performer } from '../types'

export async function shareFestival(): Promise<void> {
  const text = '受賞者たち — 2026.10.10–12 東京 練馬城址公園 / Presented by 大道芸博 2026'
  const url = window.location.href
  if (navigator.share) {
    try {
      await navigator.share({ title: '大道芸博', text, url })
      return
    } catch {
      /* fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
  } catch {
    window.prompt('共有リンクをコピー', url)
  }
}

export async function sharePerformer(p: Performer): Promise<void> {
  const text = `${p.nameJa} · ${p.actJa} — 大道芸博`
  const url = `${window.location.origin}${window.location.pathname}#artist-${p.id}`
  if (navigator.share) {
    try {
      await navigator.share({ title: p.nameJa, text, url })
      return
    } catch {
      /* fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
  } catch {
    window.prompt('共有リンクをコピー', url)
  }
}
