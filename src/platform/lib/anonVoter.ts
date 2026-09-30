export const ANON_VOTER_KEY = 'haku-anon-voter-id'
export const AWP_VOTES_PER_PERSON = 3

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isVoterId(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value))
}

export function readOrCreateAnonVoterId(): string {
  try {
    const existing = window.localStorage.getItem(ANON_VOTER_KEY)
    if (isVoterId(existing)) return existing
    const next = window.crypto.randomUUID()
    window.localStorage.setItem(ANON_VOTER_KEY, next)
    return next
  } catch {
    return window.crypto.randomUUID()
  }
}

export type AnonVoteGate =
  | 'ok'
  | 'voting_closed'
  | 'already_voted_for_performer'
  | 'voter_ballot_limit_reached'

export function canCastAnonVote(input: {
  votingOpen: boolean
  votedIds: string[]
  performerId: string
  maxVotes?: number
}): AnonVoteGate {
  if (!input.votingOpen) return 'voting_closed'
  if (input.votedIds.includes(input.performerId)) return 'already_voted_for_performer'
  if (input.votedIds.length >= (input.maxVotes ?? AWP_VOTES_PER_PERSON)) return 'voter_ballot_limit_reached'
  return 'ok'
}

export function remainingVotes(votedCount: number, maxVotes = AWP_VOTES_PER_PERSON) {
  return Math.max(0, maxVotes - votedCount)
}
