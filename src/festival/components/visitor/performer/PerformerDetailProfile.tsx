import type { Performer } from '../../../types'

type PerformerDetailProfileProps = {
  performer: Performer
}

export function PerformerDetailProfile({ performer: p }: PerformerDetailProfileProps) {
  return (
    <>
      <section className="fe-detail-block" aria-labelledby="fe-d-bio">
        <h2 id="fe-d-bio" className="fe-detail-h">
          プロフィール
        </h2>
        {p.genre ? <p className="fe-detail-genre">{p.genre}</p> : null}
        {p.country ? <p className="fe-detail-muted">活動地域 · {p.country}</p> : null}
        {p.streamTitle ? (
          <p className="fe-detail-stream-title">
            {p.isLive && p.canStream && p.approvalStatus === 'approved' ? 'LIVE · ' : '配信 · '}
            {p.streamTitle}
          </p>
        ) : null}
        <p className="fe-detail-body">{p.bio ?? p.tagline}</p>
        {p.achievementsDetail ? (
          <>
            <h3 className="fe-detail-subh">実績</h3>
            <p className="fe-detail-body">{p.achievementsDetail}</p>
          </>
        ) : null}
        <p className="fe-detail-tags">
          <span className="fe-chip fe-chip--ghost">{p.actJa}</span>
          <span className="fe-chip fe-chip--ghost">{p.locale}</span>
          {p.approvalStatus === 'approved' && p.canStream ? (
            <span className="fe-chip fe-chip--ghost">{p.isLive ? '配信可能 · LIVE' : '配信可能'}</span>
          ) : null}
        </p>
      </section>

      {p.snsList?.length ? (
        <section className="fe-detail-block" aria-labelledby="fe-d-sns">
          <h2 id="fe-d-sns" className="fe-detail-h">
            SNS
          </h2>
          <ul className="fe-detail-sns">
            {p.snsList.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="fe-detail-sns__a">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
