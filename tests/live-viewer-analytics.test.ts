import { describe, expect, it } from 'vitest'
import { countAudienceParticipants } from '../api/livekit/presence'

describe('server-authoritative LIVE viewer analytics', () => {
  it('excludes the performer from the audience count', () => {
    expect(countAudienceParticipants([
      { identity: 'performer-1' },
      { identity: 'viewer-1' },
      { identity: 'viewer-2' },
    ], 'performer-1')).toBe(2)
  })

  it('reports zero for a host-only room', () => {
    expect(countAudienceParticipants([{ identity: 'performer-1' }], 'performer-1')).toBe(0)
  })
})
