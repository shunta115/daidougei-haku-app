import { useEffect, useState } from 'react'
import { getFeaturedEvent, listVoteRankingNamed } from '../../../platform/lib/api'
import { isSupabaseConfigured } from '../../../platform/lib/supabase'
import { useLang } from '../../../i18n/LangProvider'

export function HomeVoteStrip() {
  const { t } = useLang()
  const [rows, setRows] = useState<Array<{ name: string; votes: number }>>([])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void getFeaturedEvent()
      .then(async (ev) => {
        if (!ev) return []
        const ranked = await listVoteRankingNamed(ev.id)
        return ranked.map((r) => ({ name: r.performer.stage_name, votes: r.votes }))
      })
      .then((next) => setRows(next ?? []))
      .catch(() => setRows([]))
  }, [])

  return (
    <section className="fe-home-overview" aria-label={t('votes')}>
      <p className="fe-home-overview__k">{t('votes')}</p>
      {rows.length === 0 ? (
        <p className="fe-home-overview__note">{t('noVotesYet')}</p>
      ) : (
        <ol className="fe-home-overview__note" style={{ margin: 0, paddingLeft: 20 }}>
          {rows.slice(0, 5).map((r) => (
            <li key={r.name}>
              {r.name} · {r.votes}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
