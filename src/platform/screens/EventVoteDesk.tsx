import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, CircleDollarSign, Heart, MapPin, User, Vote } from 'lucide-react'
import {
  castAnonEventVote,
  getAnonVoteState,
  getEventBySlug,
  getEventVoteRule,
  listEventLineupPerformers,
  type FeaturedEvent,
} from '../lib/api'
import { canCastAnonVote, readOrCreateAnonVoterId } from '../lib/anonVoter'
import { useLang } from '../../i18n/LangProvider'
import type { Performer } from '../lib/types'
import './event.css'

function AwpVoteTitle({ text }: { text: string }) {
  if (text.startsWith('投票')) return <><em>投票</em>{text.slice(2)}</>
  return <>{text}</>
}

export function AwpHeroVoteLaunch({ eventId, onOpenVote }: { eventId: string; onOpenVote: () => void }) {
  const { t } = useLang()
  const voterId = useMemo(() => readOrCreateAnonVoterId(), [])
  const [remaining, setRemaining] = useState<number | null>(null)
  const [maxVotes, setMaxVotes] = useState(3)

  useEffect(() => {
    let active = true
    void getAnonVoteState(eventId, voterId)
      .then((state) => {
        if (!active) return
        setMaxVotes(state.max_votes)
        setRemaining(state.remaining)
      })
      .catch(() => {
        if (active) setRemaining(null)
      })
    return () => { active = false }
  }, [eventId, voterId])

  const left = remaining ?? maxVotes
  const used = remaining == null ? 0 : Math.max(0, maxVotes - remaining)
  const done = remaining === 0

  return (
    <div className="awp-vote">
      <div className="awp-vote__top">
        <p className="awp-vote__title"><Vote size={16} aria-hidden="true" /><AwpVoteTitle text={t('awpHeroVoteTitle').replace(/^🗳\s*/, '')} /></p>
        <span className="awp-vote__pill"><User size={12} aria-hidden="true" />{t('awpHeroNoSignUp')}</span>
        <span className="awp-vote__pill"><CircleDollarSign size={12} aria-hidden="true" />{t('awpHeroVoteFree')}</span>
      </div>
      <p className="awp-vote__lead">{t('awpHeroSupport')}</p>
      <p className="awp-vote__once">※{t('awpHeroOnce')}</p>
      <div className="awp-vote__row">
        <div className="awp-vote__hearts" aria-hidden="true">
          {Array.from({ length: maxVotes }, (_, index) => (
            <Heart key={index} size={26} strokeWidth={1.7} data-used={index < used ? 'true' : 'false'} fill={index < used ? 'currentColor' : 'none'} />
          ))}
        </div>
        <i className="awp-vote__rule" aria-hidden="true" />
        <p className="awp-vote__remain" aria-live="polite">
          {done ? t('awpHeroVoteDone') : (
            <>
              <span>{t('awpHeroLeft')}</span>
              <em>{left}</em>
              <small>{t('awpHeroLeftUnit')}</small>
            </>
          )}
        </p>
        <button type="button" className="awp-vote__cta" onClick={onOpenVote}>
          <Vote size={16} aria-hidden="true" />
          {t('awpHeroCtaShort')}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

type DeskProps = {
  event: FeaturedEvent
  performers: Performer[]
  onOpenPerformer: (id: string) => void
  onOpenSchedule: () => void
  onOpenMap: () => void
}

function voteErrorKey(message: string): 'eventVoteShut' | 'eventVoteDup' | 'eventVoteLimit' | 'eventVoteSlow' | 'eventVoteFail' {
  if (message.includes('voting_closed') || message.includes('voting_not_started') || message.includes('voting_ended')) return 'eventVoteShut'
  if (message.includes('already_voted_for_performer')) return 'eventVoteDup'
  if (message.includes('voter_ballot_limit_reached') || message.includes('daily_vote_limit')) return 'eventVoteLimit'
  if (message.includes('vote_rate_limited')) return 'eventVoteSlow'
  return 'eventVoteFail'
}

export function EventVoteDesk({ event, performers, onOpenPerformer, onOpenSchedule, onOpenMap }: DeskProps) {
  const { t } = useLang()
  const voterId = useMemo(() => readOrCreateAnonVoterId(), [])
  const [voted, setVoted] = useState<string[]>([])
  const [remaining, setRemaining] = useState(3)
  const [maxVotes, setMaxVotes] = useState(3)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastName, setLastName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const [state, rule] = await Promise.all([
      getAnonVoteState(event.id, voterId),
      getEventVoteRule(event.id).catch(() => null),
    ])
    setVoted(state.voted)
    setRemaining(state.remaining)
    setMaxVotes(state.max_votes)
    setOpen(state.voting_open && Boolean(rule?.allow_anonymous !== false))
  }

  useEffect(() => {
    let active = true
    void refresh()
      .catch(() => { if (active) setError(t('eventVoteFail')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [event.id, voterId, t])

  const used = maxVotes - remaining
  const lastPerformer = lastName

  const cast = async (performer: Performer) => {
    const gate = canCastAnonVote({ votingOpen: open, votedIds: voted, performerId: performer.id, maxVotes })
    if (gate !== 'ok') {
      setError(t(gate === 'voting_closed' ? 'eventVoteShut' : gate === 'already_voted_for_performer' ? 'eventVoteDup' : 'eventVoteLimit'))
      return
    }
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await castAnonEventVote(event.id, performer.id, voterId)
      await refresh()
      setLastName(performer.stage_name)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(t(voteErrorKey(message)))
      await refresh().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pl-event-vote" id="event-vote">
      <header>
        <p>{t('eventVoteKicker')}</p>
        <h2>{t('awpVoteTitle')}</h2>
        <span>{t('awpVoteLead')}</span>
      </header>

      <div className="pl-vote-rights" aria-live="polite">
        <p>{t('awpVoteRights')}</p>
        <div className="pl-vote-rights__hearts" aria-hidden="true">
          {Array.from({ length: maxVotes }, (_, index) => (
            <span key={index} data-on={index < remaining}>{index < remaining ? '❤️' : '♡'}</span>
          ))}
        </div>
        <strong>{remaining > 0 ? t('awpVoteLeft', { n: remaining }) : t('awpVoteAllDone')}</strong>
        <ul>
          <li>{t('awpVoteRuleMax')}</li>
          <li>{t('awpVoteRuleOnce')}</li>
          <li>{t('awpVoteRuleAnon')}</li>
        </ul>
      </div>

      {!open ? <p className="pl-event-inline-empty">{t('eventVoteShut')}</p> : null}
      {error ? <p className="pl-error" role="alert">{error}</p> : null}

      {lastPerformer && used > 0 ? (
        <div className="pl-vote-thanks">
          <h3>{t('awpVoteThanks', { name: lastPerformer })}</h3>
          <p>{remaining > 0 ? t('awpVoteMore') : t('awpVoteAllDone')}</p>
          {remaining > 0 ? (
            <div className="pl-vote-thanks__cta">
              <button type="button" onClick={onOpenSchedule}>{t('awpVoteSeeNext')}</button>
              <button type="button" onClick={onOpenMap}><MapPin size={16} />{t('awpVoteSeeMap')}</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <p role="status">{t('processing')}</p> : (
        <div className="pl-event-vote__grid">
          {performers.map((performer) => {
            const already = voted.includes(performer.id)
            const disabled = busy || !open || already || remaining <= 0
            return (
              <article key={performer.id}>
                {performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span className="pl-event-vote__avatar">{performer.stage_name.slice(0, 2)}</span>}
                <h3>{performer.stage_name}</h3>
                <p>{performer.genre || 'Performance'}</p>
                <div>
                  <button type="button" onClick={() => onOpenPerformer(performer.id)}>{t('eventProfile')}</button>
                  <button type="button" disabled={disabled} onClick={() => void cast(performer)}>
                    {already ? t('voted') : t('vote')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

type PageProps = {
  slug: string
  onBack: () => void
  onOpenPerformer: (id: string) => void
  onOpenSchedule: () => void
  onOpenMap: () => void
}

export function EventVoteScreen({ slug, onBack, onOpenPerformer, onOpenSchedule, onOpenMap }: PageProps) {
  const { t } = useLang()
  const [event, setEvent] = useState<FeaturedEvent | null>(null)
  const [performers, setPerformers] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    meta?.setAttribute('content', '#050505')
    return () => { if (previous) meta?.setAttribute('content', previous) }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const next = await getEventBySlug(slug)
        if (!next) throw new Error('not-found')
        const lineup = await listEventLineupPerformers(next.id)
        if (!active) return
        setEvent(next)
        setPerformers(lineup)
      } catch {
        if (active) setError(t('eventDetailError'))
      }
    })()
    return () => { active = false }
  }, [slug, t])

  if (error) return <main className="pl-event-detail"><button className="pl-event-back" type="button" onClick={onBack}><ArrowLeft size={18} />{t('eventBack')}</button><p className="pl-error">{error}</p></main>
  if (!event) return <p role="status">{t('eventPreparing')}</p>

  return (
    <main className="pl-event-detail pl-event-vote-page">
      <button className="pl-event-back" type="button" onClick={onBack}><ArrowLeft size={18} />{t('eventBack')}</button>
      <EventVoteDesk event={event} performers={performers} onOpenPerformer={onOpenPerformer} onOpenSchedule={onOpenSchedule} onOpenMap={onOpenMap} />
    </main>
  )
}
